<script lang="ts">
	// H1 S4 — H1 sidebar shell. Replaces the workspace-switching
	// `EditorLeftSidebar` in the H1 shell (the relic keeps its own sidebar
	// byte-for-byte). One unified hierarchy is always mounted; in 3D the sidebar
	// gains a Hierarchy | Assets tab row (reusing `store.leftPanel`). The
	// layout-preview summary's counts are replaced by the tree's own rows; the
	// source/status badge + import error move to a compact header strip, hidden
	// for the common boot-empty case. "Reset empty" is dropped (it duplicated
	// the Project menu's resetLayout).
	import type { MuseumAsset } from '$lib/types/assets';
	import EditorAssetLibrary from '$lib/editor/EditorAssetLibrary.svelte';
	import {
		layoutPreviewSessionStatus,
		layoutPreviewSourceLabel,
		type LayoutPreviewState
	} from '$lib/editor/layout/layout-preview-state.svelte';
	import { setLayoutDraftTool, type LayoutInteractionState } from '$lib/editor/layout/layout-interaction';
	import type { MuseumEditorStore } from '$lib/editor/museum-editor.svelte';
	import UnifiedProjectTree from '$lib/editor/UnifiedProjectTree.svelte';
	import type { EditorActiveSelectionStore } from './active-editor-selection.svelte';
	import type { EditorViewState } from './editor-view-state.svelte';

	let {
		store,
		layoutPreview,
		layoutInteraction,
		activeSelection,
		viewState,
		outlinerElement = $bindable(),
		onAssetSelection
	}: {
		store: MuseumEditorStore;
		layoutPreview: LayoutPreviewState;
		layoutInteraction: LayoutInteractionState;
		activeSelection: EditorActiveSelectionStore;
		viewState: EditorViewState;
		outlinerElement?: HTMLElement | null;
		onAssetSelection?: (asset: MuseumAsset | undefined) => void;
	} = $props();

	const viewMode = $derived(viewState.viewMode);
	const in3d = $derived(viewMode === '3d');
	// Boot-empty H1 surfaces no badge (status 'blank' and no import error).
	// importError is `string | null` — check `!== null`, not `!== undefined`
	// (which is always true and would show the header on every blank boot).
	const showHeaderStrip = $derived(
		layoutPreview.importError !== null ||
			layoutPreviewSessionStatus(layoutPreview) !== 'blank'
	);

	function switchLeftPanel(panel: 'scene' | 'assets') {
		store.setLeftPanel(panel);
	}

	// S10.1 — Rooms header (+): jump to Plan and start a rectangle-room draft.
	function startRoomDraft() {
		viewState.setViewMode('plan');
		setLayoutDraftTool(layoutInteraction, 'rectangle');
	}
</script>

<aside
	bind:this={outlinerElement}
	class="panel outliner"
	aria-label="Editor sidebar"
	inert={store.isDocumentMutationBlocked}
	style="grid-area: left;"
>
	{#if showHeaderStrip}
		<div class="header-strip" aria-label="Layout preview source">
			<span class="source-badge">
				{layoutPreviewSourceLabel(layoutPreview.source)} · {layoutPreviewSessionStatus(layoutPreview)}
			</span>
			{#if layoutPreview.importError}
				<p class="layout-error" role="alert">Import failed: {layoutPreview.importError}</p>
			{/if}
		</div>
	{/if}

	{#if in3d}
		<div class="panel-tabs" role="tablist" aria-label="Editor panels">
			<button
				type="button"
				role="tab"
				aria-selected={store.leftPanel === 'scene'}
				class:active={store.leftPanel === 'scene'}
				onclick={() => switchLeftPanel('scene')}
			>Hierarchy</button>
			<button
				type="button"
				role="tab"
				aria-selected={store.leftPanel === 'assets'}
				class:active={store.leftPanel === 'assets'}
				onclick={() => switchLeftPanel('assets')}
			>Assets</button>
		</div>
	{/if}

	<!-- Both panels stay mounted; the inactive one is hidden by class so the
	     tree's component-local expansion state survives tab switches. -->
	<div class="panel-content" class:panel-content--hidden={in3d && store.leftPanel === 'assets'}>
		<UnifiedProjectTree
			{store}
			{layoutPreview}
			{layoutInteraction}
			{activeSelection}
			viewMode={viewState.viewMode}
			active3dContext={viewState.active3dContext}
			onAddRoom={startRoomDraft}
		/>
	</div>
	{#if in3d}
		<div class="panel-content" class:panel-content--hidden={store.leftPanel !== 'assets'}>
			<EditorAssetLibrary {store} onselectionchange={onAssetSelection} />
		</div>
	{/if}

	<a class="back" href="/museum">Back to museum</a>
</aside>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem 1.1rem;
		border-right: 1px solid #2a2a33;
		overflow: auto;
		background: #121218;
	}
	.header-strip { display: flex; flex-direction: column; gap: 0.45rem; }
	.source-badge {
		align-self: flex-start;
		padding: 0.24rem 0.45rem;
		border: 1px solid #8d753c;
		border-radius: 999px;
		background: #2a2618;
		color: #fff2c7;
		font-size: 0.66rem;
		font-weight: 650;
	}
	.panel-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 0.3rem; }
	.panel-tabs button { padding: 0.42rem; border: 1px solid #3a3a46; border-radius: 0.32rem; background: #1a1a22; color: #a8a29a; font: inherit; font-size: 0.73rem; cursor: pointer; }
	.panel-tabs button.active { border-color: #d6b35f; background: #2a2618; color: #fff2c7; }
	.panel-content { display: contents; }
	.panel-content--hidden { display: none; }
	.layout-error { margin: 0; color: #efc7c7; font-size: 0.7rem; line-height: 1.4; }
	.back { margin-top: auto; color: #d6c7a8; font-size: 0.85rem; text-decoration: none; }
	.back:hover { text-decoration: underline; }

	@media (max-width: 62rem) {
		.panel { min-height: 0; max-height: 34rem; border-top: 1px solid #2a2a33; }
	}
	@media (max-width: 44rem) {
		.panel { max-height: 30rem; border-right: 0; }
	}
</style>
