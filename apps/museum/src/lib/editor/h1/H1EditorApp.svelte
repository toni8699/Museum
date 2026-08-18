<script lang="ts">
	// Twin of the legacy MuseumEditorApp (mounted at /museum/editor). H1 only
	// replaces the top-level chrome; the texture-loader, binary-store cleanup,
	// navigation/exit guards, and shortcut wiring below are duplicated and must
	// stay in sync with the legacy shell.
	import { beforeNavigate } from '$app/navigation';
	import type { MuseumAsset } from '$lib/types/assets';
	import type { Texture as ThreeTexture } from 'three';
	import { onDestroy, onMount, setContext } from 'svelte';
	import { TextureLoader } from 'three';
	import EditorCameraTimelineFrame from '$lib/editor/EditorCameraTimelineFrame.svelte';
	import EditorInspector from '$lib/editor/EditorInspector.svelte';
	import EditorMaterialChoiceDialog from '$lib/editor/EditorMaterialChoiceDialog.svelte';
	import H1Sidebar from './H1Sidebar.svelte';
	import { registerEditorShortcuts } from '$lib/editor/hooks/shortcuts.svelte';
	import {
		EditorInteractionStore,
		EDITOR_INTERACTION_STORE_KEY
	} from '$lib/editor/store/editor-interaction-store.svelte';
	import {
		setDefaultTextureSourceLoader,
		type TextureSourceLoader
	} from '$lib/museum/materials/texture-cache';
	import { BinaryTextureStore } from '$lib/editor/store/binary-texture-store.svelte';
	import { createMuseumEditorStore } from '$lib/editor/museum-editor.svelte';
	import { createEmptyMuseumProject } from '$lib/project/project-codec';
	import { createLayoutRoomRegistry } from '$lib/project/project-layout-semantics';
	import {
		captureLayoutPreviewSnapshot,
		createEmptyLayoutPreviewState,
		layoutPreviewIsDirty,
		restoreLayoutPreviewSnapshot
	} from '$lib/editor/layout/layout-preview-state.svelte';
	import {
		clearLayoutSelection,
		createLayoutInteractionState,
		reconcileLayoutSelection,
		setLayoutViewMode
	} from '$lib/editor/layout/layout-interaction';
	import H1AppBar from './H1AppBar.svelte';
	import H1PlanView from './H1PlanView.svelte';
	import H13DView from './H13DView.svelte';
	import { EditorViewState } from './editor-view-state.svelte';
	import {
		ACTIVE_EDITOR_SELECTION_KEY,
		EditorActiveSelectionStore
	} from './active-editor-selection.svelte';
	import { SCENE_GIZMO_POLICY } from '$lib/editor/gizmo/scene-gizmo-adapter.svelte';
	import { CAMERA_GIZMO_POLICY } from '$lib/editor/gizmo/camera-gizmo-adapter.svelte';
	import { projectDomainGizmoCapabilities } from '$lib/editor/gizmo/editor-gizmo-policy';
	import { resolveLayoutGizmoTarget } from '$lib/editor/gizmo/layout-gizmo-target';

	// H1 S2 — the editor boots blank on every load: one canonical empty project
	// seeds both the scene-only store and the layout-only preview surface.
	const bootProject = createEmptyMuseumProject({
		id: 'project:untitled',
		name: 'Untitled project'
	});
	const layoutPreview = $state(createEmptyLayoutPreviewState());
	const layoutInteraction = $state(createLayoutInteractionState());
	const store = createMuseumEditorStore({
		document: bootProject.scene,
		rooms: createLayoutRoomRegistry(bootProject.layout),
		// H1 S3 — an actionable scene/camera pick clears the layout selection
		// (detach-then-attach: the new domain lands, the previous one drops).
		onSelectionActivate: () => clearLayoutSelection(layoutInteraction)
	});
	// H1 S3 — one active selection domain at the editor composition root.
	const activeSelection = new EditorActiveSelectionStore(
		store,
		layoutInteraction,
		() => clearLayoutSelection(layoutInteraction)
	);
	setContext(ACTIVE_EDITOR_SELECTION_KEY, activeSelection);
	const viewState = new EditorViewState();
	store.registerLayoutHistory({
		capture: () => captureLayoutPreviewSnapshot(layoutPreview),
		replace: (snapshot) => restoreLayoutPreviewSnapshot(layoutPreview, snapshot as ReturnType<typeof captureLayoutPreviewSnapshot>),
		matches: (a, b) => JSON.stringify((a as { project: { layout: unknown } }).project.layout) === JSON.stringify((b as { project: { layout: unknown } }).project.layout)
	});

	// H1 S2 — keep the store's room registry live: every layout mutation
	// replaces `layoutPreview.project`, so re-derive the registry from the
	// current layout. Without this, `store.rooms.has(draftedRoomId)` stays
	// false and camera/primitive placement on a drafted room is rejected
	// ("Click a tagged museum-room floor") and node creation would throw on
	// the unknown room. `updateRooms` also re-resolves the runtime scene, so a
	// moved room immediately moves the rendered node/entity helpers.
	$effect(() => {
		// Scene and layout commit separate history entries (atomic cross-domain
		// history is deferred to S8), so a layout undo can outrun a scene that
		// references it — the new registry would fail to resolve. Keep the
		// previous consistent snapshot rather than crashing the editor; the
		// divergence surfaces through the normal scene-mutation path.
		try {
			store.updateRooms(createLayoutRoomRegistry(layoutPreview.project.layout));
		} catch (error) {
			console.error('H1: skipped room-registry sync (layout/scene divergence)', error);
		}
	});

	// H1 S3 — activating the layout domain (a Plan pick) detaches any actionable
	// scene/camera pick. The guard + writes live on the wrapper so the contract
	// is unit-testable; the effect is a thin reactive trigger.
	$effect(() => {
		activeSelection.onLayoutSelectionChanged();
	});

	// H1 S3 — re-validate the layout selection against the live layout after
	// every layout swap (undo/redo/commit/cancel/delete/reset/import), including
	// paths that bypass the layout history bridge. Converges in one pass: the
	// reconciled selection is written only when it differs. The compare is
	// structural rather than reference-identity so the effect stays idempotent
	// even if `reconcileLayoutSelection` ever returns a fresh-but-equal object
	// for the valid case (which would otherwise re-write and loop).
	$effect(() => {
		const layout = layoutPreview.project.layout;
		const reconciled = reconcileLayoutSelection(layoutInteraction.selection, layout);
		if (
			JSON.stringify(reconciled) !== JSON.stringify(layoutInteraction.selection)
		) {
			layoutInteraction.selection = reconciled;
		}
	});

	// Map the top-level Plan | 3D view + 3D context onto the legacy store's
	// `currentWorkspace`. Plan owns the layout workspace (SVG surface); 3D owns
	// scene/camera — the drafted architecture renders in 3D unconditionally, so
	// there is no layout 3D context to sync.
	$effect(() => {
		if (viewState.viewMode === 'plan') {
			setLayoutViewMode(layoutInteraction, 'plan');
			store.setWorkspace('layout');
		} else {
			// H1 S4 review — restoring the layout view mode keeps Plan-only
			// placement tools disabled in 3D (the inspector's Place accordion
			// and the primitive guard read `layoutInteraction.viewMode`).
			setLayoutViewMode(layoutInteraction, '3d');
			store.setWorkspace(viewState.active3dContext);
		}
	});

	// Phase 6.1 — single shared FSM sub-store. Set on context so every editor
	// child reads the same reactive state.
	const interactionStore = new EditorInteractionStore();
	setContext(EDITOR_INTERACTION_STORE_KEY, interactionStore);

	// H1 S8 — resolve the active layout selection's descriptor so the toolbar /
	// shortcuts publish its per-kind policy (`null` for a stale/missing
	// identity, which stays inert).
	const layoutDescriptor = $derived(
		activeSelection.active.domain === 'layout'
			? resolveLayoutGizmoTarget(
					layoutPreview.project.layout,
					layoutPreview.geometry,
					layoutInteraction.selection
				)
			: null
	);

	// H1 S7 step 6 — the active target's generic capability projection for the
	// W/E/R/T shortcuts. Same policies + projection the toolbar and the host
	// use, so an unsupported mode can never start through one and be refused
	// by another. `null` for a stale layout identity / no target.
	const activeGizmoCapabilities = $derived.by(() =>
		projectDomainGizmoCapabilities(
			activeSelection.active.domain,
			interactionStore.mode,
			{
				scene: SCENE_GIZMO_POLICY,
				camera: CAMERA_GIZMO_POLICY,
				layout: layoutDescriptor?.policy ?? null
			}
		)
	);

	let outlinerElement = $state<HTMLElement | null>(null);
	let viewportElement = $state<HTMLElement | null>(null);
	let clusterNameInput = $state<HTMLInputElement>();
	let selectedAsset = $state<MuseumAsset>();

	const threeTextureLoader = new TextureLoader();
	const editorSourceLoader: TextureSourceLoader = (uri, _slot) => {
		const url = BinaryTextureStore.objectUrlFor(uri);
		if (url) return threeTextureLoader.loadAsync(url);
		return new Promise<ThreeTexture>((resolve, reject) => {
			threeTextureLoader.load(uri, resolve, undefined, reject);
		});
	};

	onMount(() => {
		setDefaultTextureSourceLoader(editorSourceLoader);
		return () => {
			setDefaultTextureSourceLoader(null);
		};
	});

	onDestroy(() => {
		BinaryTextureStore.clearExcept(new Set());
	});

	function confirmSceneReplacement() {
		return !store.isDirty || window.confirm('Discard unsaved scene changes?');
	}

	function confirmLayoutReplacement() {
		return !layoutPreviewIsDirty(layoutPreview) || window.confirm('Discard unsaved layout changes?');
	}

	function confirmNavigation() {
		if (!store.isDirty && !layoutPreviewIsDirty(layoutPreview)) return true;
		const label = store.isDirty && layoutPreviewIsDirty(layoutPreview) ? 'scene and layout' : store.isDirty ? 'scene' : 'layout';
		return window.confirm(`Discard unsaved ${label} changes?`);
	}

	beforeNavigate((navigation) => {
		if ((!store.isDirty && !layoutPreviewIsDirty(layoutPreview)) || navigation.willUnload) return;
		if (!confirmNavigation()) navigation.cancel();
	});
	onMount(() =>
		registerEditorShortcuts(
			store,
			{
				getViewportElement: () => viewportElement,
				getOutlinerElement: () => outlinerElement,
				getClusterNameInput: () => clusterNameInput
			},
			interactionStore,
			() => activeSelection.deselectActive(),
			// H1 S8 — the stale-identity gate: a live layout selection publishes
			// its descriptor policy (the caps check below refuses disallowed
			// modes); only a stale layout identity refuses W/E/R/T/X outright.
			() => activeSelection.active.domain === 'layout' && layoutDescriptor === null,
			// H1 S7 step 6 — refuse modes the active target's policy does not allow.
			() => activeGizmoCapabilities
		)
	);

	$effect(() => {
		if (!store.isDirty && !layoutPreviewIsDirty(layoutPreview)) return;
		const onBeforeUnload = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = '';
		};
		window.addEventListener('beforeunload', onBeforeUnload);
		return () => window.removeEventListener('beforeunload', onBeforeUnload);
	});
</script>

<main class="page" class:previewing={store.isDocumentMutationBlocked}>
	<H1AppBar
		{store}
		{layoutPreview}
		{viewState}
		{confirmSceneReplacement}
		{confirmLayoutReplacement}
		projectName={bootProject.name}
		onReset={() => activeSelection.reset()}
	/>
	<H1Sidebar
		{store}
		{layoutPreview}
		{layoutInteraction}
		{activeSelection}
		{viewState}
		bind:outlinerElement
		onAssetSelection={(asset) => (selectedAsset = asset)}
	/>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex (the WebGL viewport owns guarded editor shortcuts) -->
	<div
		bind:this={viewportElement}
		class="center"
		role="application"
		aria-label="Editor viewport"
		tabindex="0"
		onpointerdown={(event) => event.currentTarget.focus()}
		style="grid-area: center;"
	>
		{#if viewState.viewMode === 'plan'}
			<H1PlanView {store} {layoutPreview} {layoutInteraction} />
		{:else}
			<!-- H1 S10 — explicit 3D context seam: camera authoring overlays and
			     the bottom timeline are Camera-only; Scene stays scene chrome. -->
			<H13DView {store} {layoutPreview} {layoutInteraction} context={viewState.active3dContext} />
		{/if}
	</div>
	<EditorInspector
		{store}
		{layoutPreview}
		{layoutInteraction}
		{activeSelection}
		{selectedAsset}
		viewMode={viewState.viewMode}
		bind:clusterNameInput
	/>
	{#if viewState.viewMode === '3d' && viewState.active3dContext === 'camera'}
		<EditorCameraTimelineFrame {store} />
	{/if}
	<EditorMaterialChoiceDialog {store} />
</main>

<style>
	:global(body) { margin: 0; }
	.page {
		display: grid;
		grid-template-columns: minmax(17rem, 21rem) minmax(0, 1fr) minmax(17rem, 22rem);
		grid-template-rows: auto minmax(0, 1fr) auto;
		grid-template-areas:
			'top top top'
			'left center right'
			'bottom bottom bottom';
		height: 100vh;
		height: 100dvh;
		overflow: hidden;
		background: #0b0b10;
		color: #f4efe4;
		font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
	}
	.center { min-width: 0; min-height: 0; outline: none; }
	.center:focus-visible { box-shadow: inset 0 0 0 1px #d6b35f; }

	@media (max-width: 78rem) {
		.page { grid-template-columns: minmax(14rem, 22vw) minmax(0, 1fr) minmax(14rem, 24vw); }
	}

	@media (max-width: 62rem) {
		.page {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			grid-template-rows: auto minmax(24rem, 58vh) auto minmax(16rem, 34rem);
			grid-template-areas:
				'top top'
				'center center'
				'bottom bottom'
				'left right';
			height: auto;
			min-height: 100vh;
			min-height: 100dvh;
			overflow-y: auto;
		}
	}

	@media (max-width: 44rem) {
		.page {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto minmax(22rem, 55vh) auto minmax(16rem, 30rem) minmax(18rem, 30rem);
			grid-template-areas:
				'top'
				'center'
				'bottom'
				'left'
				'right';
		}
	}
</style>
