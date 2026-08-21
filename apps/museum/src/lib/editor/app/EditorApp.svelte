<script lang="ts">
	// Twin of the legacy MuseumEditorApp (mounted at /museum/editor). The editor
	// replaces the top-level chrome; the boot glue (dirty guard + texture
	// lifecycle) is shared via `useEditorShellBoot`, and only the shortcut wiring
	// below is shell-owned.
	import type { MuseumAsset } from '$lib/types/assets';
	import { onMount, setContext } from 'svelte';
	import EditorCameraTimelineFrame from '$lib/editor/EditorCameraTimelineFrame.svelte';
	import EditorInspector from '$lib/editor/EditorInspector.svelte';
	import EditorMaterialChoiceDialog from '$lib/editor/EditorMaterialChoiceDialog.svelte';
	import EditorSidebar from './EditorSidebar.svelte';
	import { registerEditorShortcuts } from '$lib/editor/hooks/shortcuts.svelte';
	import {
		EditorInteractionStore,
		EDITOR_INTERACTION_STORE_KEY
	} from '$lib/editor/store/editor-interaction-store.svelte';
	import { createMuseumEditorStore } from '$lib/editor/museum-editor.svelte';
	import { createEmptyMuseumProject } from '$lib/project/project-codec';
	import { createLayoutRoomRegistry } from '$lib/project/project-layout-semantics';
	import {
		captureLayoutPreviewSnapshot,
		createEmptyLayoutPreviewState,
		restoreLayoutPreviewSnapshot
	} from '$lib/editor/layout/layout-preview-state.svelte';
	import { useEditorShellBoot } from '$lib/editor/hooks/editor-shell-boot.svelte';
	import {
		clearLayoutSelection,
		createLayoutInteractionState,
		reconcileLayoutSelection,
		setLayoutViewMode
	} from '$lib/editor/layout/layout-interaction';
	import EditorAppBar from './EditorAppBar.svelte';
	import PlanWorkspace from './PlanWorkspace.svelte';
	import Workspace3DView from './Workspace3DView.svelte';
	import CameraPlanWorkspace from './CameraPlanWorkspace.svelte';
	import StatusBar from './StatusBar.svelte';
	import { createCameraPlanState } from '$lib/editor/camera-plan/camera-plan-state.svelte';
	import { EditorViewState } from './editor-view-state.svelte';
	import {
		ACTIVE_EDITOR_SELECTION_KEY,
		EditorActiveSelectionStore
	} from './active-editor-selection.svelte';
	import { SCENE_GIZMO_POLICY } from '$lib/editor/gizmo/scene-gizmo-adapter.svelte';
	import { CAMERA_GIZMO_POLICY } from '$lib/editor/gizmo/camera-gizmo-adapter.svelte';
	import { projectDomainGizmoCapabilities } from '$lib/editor/gizmo/editor-gizmo-policy';
	import { resolveLayoutGizmoTarget } from '$lib/editor/gizmo/layout-gizmo-target';

	// the editor boots blank on every load: one canonical empty project
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
		// an actionable scene/camera pick clears the layout selection
		// (detach-then-attach: the new domain lands, the previous one drops).
		onSelectionActivate: () => clearLayoutSelection(layoutInteraction)
	});
	// P1.5 — Camera Plan session state owned here, high enough to survive the
	// Camera Plan ↔ Camera 3D component swap and separate from Scene Plan state.
	// `$state` deep-proxies `planView`/`tool`/`hover` so the viewport's pan,
	// zoom, hover, and tool mutations stay reactive (Scene Plan wraps the same
	// way via `layoutInteraction`).
	const cameraPlanState = $state(createCameraPlanState());
	// P1.1 — construct the view state before the selection store: the store's
	// domain gate reads `viewState.domain`.
	const viewState = new EditorViewState();
	// one active selection domain at the editor composition root.
	const activeSelection = new EditorActiveSelectionStore(
		store,
		layoutInteraction,
		viewState,
		() => clearLayoutSelection(layoutInteraction)
	);
	setContext(ACTIVE_EDITOR_SELECTION_KEY, activeSelection);
	store.registerLayoutHistory({
		capture: () => captureLayoutPreviewSnapshot(layoutPreview),
		replace: (snapshot) => restoreLayoutPreviewSnapshot(layoutPreview, snapshot as ReturnType<typeof captureLayoutPreviewSnapshot>),
		matches: (a, b) => JSON.stringify((a as { project: { layout: unknown } }).project.layout) === JSON.stringify((b as { project: { layout: unknown } }).project.layout)
	});

	// keep the store's room registry live: every layout mutation
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
			console.error('Editor: skipped room-registry sync (layout/scene divergence)', error);
		}
	});

	// activating the layout domain (a Plan pick) detaches any actionable
	// scene/camera pick. The guard + writes live on the wrapper so the contract
	// is unit-testable; the effect is a thin reactive trigger.
	$effect(() => {
		activeSelection.onLayoutSelectionChanged();
	});

	// re-validate the layout selection against the live layout after
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

	// Map the domain×view matrix onto the legacy store's `currentWorkspace`.
	// The layout view mode follows the *view* (plan cells → 'plan', 3D cells →
	// '3d' — keeping Plan-only placement tools disabled in 3D, per the
	// inspector's Place accordion + primitive guard reads). The workspace
	// follows the domain: Scene plan owns the layout workspace, Scene 3D owns
	// scene, and **both Camera cells keep the camera workspace** (G3) so
	// `setWorkspace`'s timeline-expansion / preview-stop / pending-navigation
	// side effects never fire on Camera 3D ↔ Plan toggles.
	$effect(() => {
		const isPlan = viewState.activeView === 'plan';
		setLayoutViewMode(layoutInteraction, isPlan ? 'plan' : '3d');
		if (viewState.domain === 'camera') {
			store.setWorkspace('camera');
		} else if (isPlan) {
			store.setWorkspace('layout');
		} else {
			store.setWorkspace('scene');
		}
	});

	// Phase 6.1 — single shared FSM sub-store. Set on context so every editor
	// child reads the same reactive state.
	const interactionStore = new EditorInteractionStore();
	setContext(EDITOR_INTERACTION_STORE_KEY, interactionStore);

	// resolve the active layout selection's descriptor so the toolbar /
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

	// step 6 — the active target's generic capability projection for the
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

	// P7.4 — shared boot composable (dirty guard + texture lifecycle only).
	// Shortcut wiring stays shell-owned; see `useEditorShellBoot`.
	const { confirmSceneReplacement, confirmLayoutReplacement } = useEditorShellBoot({
		store,
		layoutPreview
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
			// the stale-identity gate: a live layout selection publishes
			// its descriptor policy (the caps check below refuses disallowed
			// modes); only a stale layout identity refuses W/E/R/T/X outright.
			() => activeSelection.active.domain === 'layout' && layoutDescriptor === null,
			// step 6 — refuse modes the active target's policy does not allow.
			() => activeGizmoCapabilities
		)
	);

</script>

<main class="page" class:previewing={store.isDocumentMutationBlocked}>
	<EditorAppBar
		{store}
		{layoutPreview}
		{viewState}
		{confirmSceneReplacement}
		{confirmLayoutReplacement}
		projectName={bootProject.name}
		onReset={() => activeSelection.reset()}
	/>
	<EditorSidebar
		{store}
		{layoutPreview}
		{layoutInteraction}
		{activeSelection}
		{viewState}
		bind:outlinerElement
		onAssetSelection={(asset) => (selectedAsset = asset)}
		// Explicit Models-tab click: detach the active scene selection so the
		// asset panel (details + Place) shows immediately — browsing/filtering
		// never fires this (only `onAssetSelection`), so a scene pick survives
		// search. Deselection is not a document mutation — no history entry.
		onSelectAsset={() => activeSelection.deselectActive()}
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
		{#if viewState.activeView === 'plan' && viewState.domain === 'scene'}
			<PlanWorkspace {store} {layoutPreview} {layoutInteraction} />
		{:else if viewState.activeView === 'plan'}
			<!-- P1.5 — Camera → Plan is the live camera-graph authoring surface. -->
			<CameraPlanWorkspace {store} {layoutPreview} cameraPlan={cameraPlanState} />
		{:else}
			<!-- explicit 3D context seam: camera authoring overlays and
			     the bottom timeline are Camera-only; Scene stays scene chrome. -->
			<Workspace3DView {store} {layoutPreview} {layoutInteraction} context={viewState.domain} />
		{/if}
	</div>
	<EditorInspector
		{store}
		{layoutPreview}
		{layoutInteraction}
		{activeSelection}
		{selectedAsset}
		viewMode={viewState.activeView}
		bind:clusterNameInput
	/>
	{#if viewState.domain === 'camera'}
		<EditorCameraTimelineFrame {store} viewMode={viewState.activeView} />
	{/if}
	<!-- P1.1 (design-spec §2/§18) — persistent status bar in every workspace. -->
	<StatusBar {store} {layoutPreview} {layoutInteraction} {viewState} {activeSelection} />
	<EditorMaterialChoiceDialog {store} />
</main>

<style>
	:global(body) { margin: 0; }
	.page {
		display: grid;
		grid-template-columns: minmax(17rem, 21rem) minmax(0, 1fr) minmax(17rem, 22rem);
		grid-template-rows: auto minmax(0, 1fr) auto auto;
		grid-template-areas:
			'top top top'
			'left center right'
			'bottom bottom bottom'
			'status status status';
		height: 100vh;
		height: 100dvh;
		overflow: hidden;
		background: #0b0b10;
		color: #f4efe4;
		font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
	}
	.center { position: relative; min-width: 0; min-height: 0; outline: none; }
	.center:focus-visible { box-shadow: inset 0 0 0 1px #d6b35f; }

	@media (max-width: 78rem) {
		.page { grid-template-columns: minmax(14rem, 22vw) minmax(0, 1fr) minmax(14rem, 24vw); }
	}

	@media (max-width: 62rem) {
		.page {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			grid-template-rows: auto minmax(24rem, 58vh) auto minmax(16rem, 34rem) auto;
			grid-template-areas:
				'top top'
				'center center'
				'bottom bottom'
				'left right'
				'status status';
			height: auto;
			min-height: 100vh;
			min-height: 100dvh;
			overflow-y: auto;
		}
	}

	@media (max-width: 44rem) {
		.page {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto minmax(22rem, 55vh) auto minmax(16rem, 30rem) minmax(18rem, 30rem) auto;
			grid-template-areas:
				'top'
				'center'
				'bottom'
				'left'
				'right'
				'status';
		}
	}
</style>
