<script lang="ts">
	// Sidebar shell. Replaces the workspace-switching
	// `EditorLeftSidebar` in the editor shell (the relic keeps its own sidebar
	// byte-for-byte). One unified hierarchy is always mounted; Scene Plan and
	// Scene 3D expose a Hierarchy | Assets tab row (reusing `store.leftPanel`). The
	// layout-preview summary's counts are replaced by the tree's own rows; the
	// source/status badge + import error move to a compact header strip, hidden
	// for the common boot-empty case. "Reset empty" is dropped (it duplicated
	// the Project menu's resetLayout).
	import type { Asset } from '$lib/types/assets';
	import type { ProjectAssetMetadata } from '$lib/editor/project-persistence';
	import { BinaryTextureStore } from '$lib/editor/store/binary-texture-store.svelte';
	import EditorAssetLibrary from '$lib/editor/EditorAssetLibrary.svelte';
	import {
		layoutPreviewSessionStatus,
		layoutPreviewSourceLabel,
		type LayoutPreviewState
	} from '$lib/editor/layout/layout-preview-state.svelte';
	import { setLayoutDraftTool, setPlanViewMode, type LayoutInteractionState } from '$lib/editor/layout/layout-interaction';
	import type { EditorStore } from '$lib/editor/editor-store.svelte';
	import type { EditorContextMenuStore } from '$lib/editor/context-menu/context-menu-state.svelte';
	import UnifiedProjectTree from '$lib/editor/UnifiedProjectTree.svelte';
	import CameraSidebar from './CameraSidebar.svelte';
	import type { EditorActiveSelectionStore } from './active-editor-selection.svelte';
	import type { EditorViewState } from './editor-view-state.svelte';

	let {
		store,
		layoutPreview,
		layoutInteraction,
		activeSelection,
		viewState,
		outlinerElement = $bindable(),
		onAssetSelection,
		onSelectAsset,
		projectAssets = [],
		projectAssetsStatus = 'unavailable',
		retryableProjectAssetId = null,
		onUploadProjectTexture,
		onRetryProjectTexture,
		onAcceptProjectTexture,
		onProjectTextureFileSelected,
		contextMenu = null
	}: {
		store: EditorStore;
		layoutPreview: LayoutPreviewState;
		layoutInteraction: LayoutInteractionState;
		activeSelection: EditorActiveSelectionStore;
		viewState: EditorViewState;
		outlinerElement?: HTMLElement | null;
		onAssetSelection?: (asset: Asset | undefined) => void;
		onSelectAsset?: (asset: Asset) => void;
		projectAssets?: readonly ProjectAssetMetadata[];
		projectAssetsStatus?: 'unavailable' | 'loading' | 'ready' | 'error';
		retryableProjectAssetId?: string | null;
		onUploadProjectTexture?: (name: string, bytes: Uint8Array) => Promise<string | null>;
		onRetryProjectTexture?: () => Promise<string | null>;
		onAcceptProjectTexture?: (assetId: string) => Promise<string | null>;
		onProjectTextureFileSelected?: () => void;
		contextMenu?: EditorContextMenuStore | null;
	} = $props();

	const domain = $derived(viewState.domain);
	const showScenePanelTabs = $derived(domain === 'scene');
	// Boot-empty editor surfaces no badge (status 'blank' and no import error).
	// importError is `string | null` — check `!== null`, not `!== undefined`
	// (which is always true and would show the header on every blank boot).
	const showHeaderStrip = $derived(
		layoutPreview.importError !== null ||
			layoutPreviewSessionStatus(layoutPreview) !== 'blank'
	);

	function switchLeftPanel(panel: 'scene' | 'assets') {
		store.setLeftPanel(panel);
	}

	function resolveTextureImageSrc(uri: string): string | null {
		const source = BinaryTextureStore.objectUrlFor(uri) ?? uri;
		return source.startsWith('/project-assets/') ? null : source;
	}

	// S10.1 — Rooms header (+): jump to Scene → Plan and start a rectangle-room draft.
	function startRoomDraft() {
		viewState.setDomain('scene');
		viewState.setView('scene', 'plan');
		setPlanViewMode(layoutInteraction, 'layout');
		setLayoutDraftTool(layoutInteraction, 'rectangle');
	}
</script>

<aside
	bind:this={outlinerElement}
	class="panel outliner"
	aria-label="Editor sidebar"
	style="grid-area: left;"
>
	<div class="sidebar-content" inert={store.isVisitorCameraPreview}>
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

	{#if showScenePanelTabs}
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

	{#if domain === 'camera'}
		<!-- P1.7 — Camera domain gets the dedicated four-section sidebar
		     (Environment · Sequence Inspector · Unsequenced · Connections),
		     fading in via the shared shell transition on its root. -->
		<div class="panel-content">
			<CameraSidebar {store} {layoutPreview} />
		</div>
	{:else}
		<!-- Both panels stay mounted; the inactive one is hidden by class so the
		     tree's component-local expansion state survives tab switches. -->
		<div class="panel-content" class:panel-content--hidden={showScenePanelTabs && store.leftPanel === 'assets'}>
			<UnifiedProjectTree
				{store}
				{layoutPreview}
				{layoutInteraction}
				{activeSelection}
				domain={viewState.domain}
				view={viewState.activeView}
				onAddRoom={domain === 'scene' ? startRoomDraft : undefined}
				{contextMenu}
			/>
		</div>
		{#if showScenePanelTabs}
			<div class="panel-content" class:panel-content--hidden={store.leftPanel !== 'assets'}>
				<EditorAssetLibrary
					{store}
					onselectionchange={onAssetSelection}
					{onSelectAsset}
					{projectAssets}
					{projectAssetsStatus}
					{retryableProjectAssetId}
					{onUploadProjectTexture}
					{onRetryProjectTexture}
					{onAcceptProjectTexture}
					{onProjectTextureFileSelected}
					{resolveTextureImageSrc}
				/>
			</div>
		{/if}
	{/if}
	</div>

</aside>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem 1.1rem;
		border-right: 1px solid var(--editor-border-subtle);
		overflow: auto;
		background: var(--editor-bg-panel);
	}
	.sidebar-content { display: flex; min-width: 0; min-height: 0; flex: 1; flex-direction: column; gap: 1rem; }
	.header-strip { display: flex; flex-direction: column; gap: 0.45rem; }
	.source-badge {
		align-self: flex-start;
		padding: 0.24rem 0.45rem;
		border: 1px solid var(--editor-accent-border);
		border-radius: 999px;
		background: var(--editor-bg-selected);
		color: var(--editor-text-primary);
		font-size: 0.66rem;
		font-weight: 650;
	}
	.panel-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 0.3rem; }
	.panel-tabs button { padding: 0.42rem; border: 1px solid var(--editor-border-normal); border-radius: 0.32rem; background: var(--editor-bg-panel-raised); color: var(--editor-text-secondary); font: inherit; font-size: 0.73rem; cursor: pointer; }
	.panel-tabs button.active { border-color: var(--editor-accent); background: var(--editor-bg-selected); color: var(--editor-text-primary); }
	.panel-content { display: contents; }
	.panel-content--hidden { display: none; }
	.layout-error { margin: 0; color: var(--editor-danger-fg); font-size: 0.7rem; line-height: 1.4; }

	@media (max-width: 62rem) {
		.panel { min-height: 0; max-height: 34rem; border-top: 1px solid var(--editor-border-subtle); }
	}
	@media (max-width: 44rem) {
		.panel { max-height: 30rem; border-right: 0; }
	}
</style>
