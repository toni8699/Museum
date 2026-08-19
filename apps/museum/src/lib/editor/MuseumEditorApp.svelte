<!--
	Legacy pre-H1 editor shell, mounted only at /museum/editor (relic). Its H1
	twin is app/EditorApp.svelte — same store + surfaces, Plan | 3D chrome.
	Boot glue (dirty guard + texture lifecycle) is shared via
	`useEditorShellBoot`; only shortcut wiring stays shell-owned.
-->
<script lang="ts">
	import type { MuseumAsset } from '$lib/types/assets';
	import { onMount, untrack } from 'svelte';
	import EditorAppBar from './EditorAppBar.svelte';
	import EditorCameraTimelineFrame from './EditorCameraTimelineFrame.svelte';
	import EditorInspector from './EditorInspector.svelte';
	import EditorLeftSidebar from './EditorLeftSidebar.svelte';
	import EditorMaterialChoiceDialog from './EditorMaterialChoiceDialog.svelte';
	import EditorViewport from './EditorViewport.svelte';
	import { registerEditorShortcuts } from './hooks/shortcuts.svelte';
	import { setContext } from 'svelte';
	import {
		EditorInteractionStore,
		EDITOR_INTERACTION_STORE_KEY
	} from './store/editor-interaction-store.svelte';
	import { createMuseumEditorStore } from './museum-editor.svelte';
	import {
	captureLayoutPreviewSnapshot,
	createLayoutPreviewState,
	restoreLayoutPreviewSnapshot
} from './layout/layout-preview-state.svelte';
	import { useEditorShellBoot } from './hooks/editor-shell-boot.svelte';
	import { createLayoutInteractionState } from './layout/layout-interaction';

	let { relic = false }: { relic?: boolean } = $props();

	// `relic` is a mount-time prop: read it once, non-reactively, to configure the
	// store and the layout history bridge. A relic mount never gains (or loses)
	// Layout mid-session.
	const store = createMuseumEditorStore({ relic: untrack(() => relic) });
	const layoutPreview = $state(createLayoutPreviewState());
	const layoutInteraction = $state(createLayoutInteractionState());
	// Relic isolation: the frozen Scene · Camera editor never registers a layout
	// history domain — it cannot switch to the Layout workspace (store guard) nor
	// mutate layout from the Project menu (menu gating), so there is no layout
	// document to snapshot.
	if (!untrack(() => relic)) {
		store.registerLayoutHistory({
			capture: () => captureLayoutPreviewSnapshot(layoutPreview),
			replace: (snapshot) => restoreLayoutPreviewSnapshot(layoutPreview, snapshot as ReturnType<typeof captureLayoutPreviewSnapshot>),
			matches: (a, b) => JSON.stringify((a as { project: { layout: unknown } }).project.layout) === JSON.stringify((b as { project: { layout: unknown } }).project.layout)
		});
	}
	// Phase 6.1 — single shared FSM sub-store. Set on context so every editor
	// child reads the same reactive state.
	const interactionStore = new EditorInteractionStore();
	setContext(EDITOR_INTERACTION_STORE_KEY, interactionStore);

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
		registerEditorShortcuts(store, {
			getViewportElement: () => viewportElement,
			getOutlinerElement: () => outlinerElement,
			getClusterNameInput: () => clusterNameInput
		}, interactionStore)
	);

</script>

<main class="page" class:previewing={store.isDocumentMutationBlocked}>
	<EditorAppBar {store} {layoutPreview} {confirmSceneReplacement} {confirmLayoutReplacement} {relic} />
	<EditorLeftSidebar
		{store}
		{layoutPreview}
		{confirmLayoutReplacement}
		bind:outlinerElement
		onAssetSelection={(asset) => (selectedAsset = asset)}
	/>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex (the WebGL viewport owns guarded editor shortcuts) -->
	<div
		bind:this={viewportElement}
		class="center"
		role="application"
		aria-label="3D editor viewport"
		tabindex="0"
		onpointerdown={(event) => event.currentTarget.focus()}
		style="grid-area: center;"
	>
		<EditorViewport {store} {layoutPreview} {layoutInteraction} />
	</div>
	<EditorInspector
		{store}
		{layoutPreview}
		{layoutInteraction}
		{selectedAsset}
		bind:clusterNameInput
	/>
	<EditorCameraTimelineFrame {store} />
	<!-- Phase 5.2 — shared by viewport drops and inspector edits; rendered once outside the canvas. -->
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
