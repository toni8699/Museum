<script lang="ts">
	import type { Asset } from '$lib/types/assets';
	import EditorAssetLibrary from './EditorAssetLibrary.svelte';
	import EditorCameraTree from './camera/EditorCameraTree.svelte';
	import EditorSceneTree from './EditorSceneTree.svelte';
	import {
		layoutPreviewSessionStatus,
		layoutPreviewSourceLabel,
		resetLayoutPreview,
		type LayoutPreviewState
	} from './layout/layout-preview-state.svelte';
	import type { EditorStore } from './editor-store.svelte';

	let {
		store,
		layoutPreview,
		confirmLayoutReplacement,
		outlinerElement = $bindable(),
		onAssetSelection,
		onReset
	}: {
		store: EditorStore;
		layoutPreview: LayoutPreviewState;
		confirmLayoutReplacement: () => boolean;
		outlinerElement?: HTMLElement | null;
		onAssetSelection?: (asset: Asset | undefined) => void;
		/** fired after the sidebar "Reset empty" action; the shell clears the active selection. */
		onReset?: () => void;
	} = $props();

	function switchLeftPanel(panel: 'scene' | 'assets') {
		store.setLeftPanel(panel);
	}

	function resetLayout() {
		if (confirmLayoutReplacement()) {
			resetLayoutPreview(layoutPreview);
			store.clearSharedHistory();
			onReset?.();
		}
	}
</script>

<aside
	bind:this={outlinerElement}
	class="panel outliner"
	aria-label="Editor sidebar"
	style="grid-area: left;"
>
	<div class="sidebar-content" inert={store.isVisitorCameraPreview}>
	{#if store.currentWorkspace === 'scene'}
		<div class="panel-tabs" role="tablist" aria-label="Editor panels">
			<button
				type="button"
				role="tab"
				aria-selected={store.leftPanel === 'scene'}
				class:active={store.leftPanel === 'scene'}
				onclick={() => switchLeftPanel('scene')}
			>Scene</button>
			<button
				type="button"
				role="tab"
				aria-selected={store.leftPanel === 'assets'}
				class:active={store.leftPanel === 'assets'}
				onclick={() => switchLeftPanel('assets')}
			>Assets</button>
		</div>

		<div class="panel-content">
			{#if store.leftPanel === 'scene'}
				<EditorSceneTree {store} />
			{:else}
				<EditorAssetLibrary {store} onselectionchange={onAssetSelection} />
			{/if}
		</div>
	{:else if store.currentWorkspace === 'layout'}
		<header class="camera-workspace-header">
			<h1>Layout editor</h1>
			<p>Preview-only authoring session</p>
		</header>

		<section class="layout-preview-summary" aria-label="Layout preview source">
			<div class="source-badge">{layoutPreviewSourceLabel(layoutPreview.source)} · {layoutPreviewSessionStatus(layoutPreview)}</div>
			<dl>
				<div><dt>Rooms</dt><dd>{layoutPreview.model.rooms.length}</dd></div>
				<div><dt>Floors</dt><dd>{layoutPreview.project.layout.floors.length}</dd></div>
				<div><dt>Openings</dt><dd>{layoutPreview.project.layout.floors.reduce((sum, floor) => sum + floor.rooms.reduce((roomSum, room) => roomSum + room.openings.length, 0), 0)}</dd></div>
				<div><dt>Objects</dt><dd>{layoutPreview.model.objects.length}</dd></div>
			</dl>
			<div class="layout-actions">
				<button type="button" onclick={resetLayout}>Reset empty</button>
			</div>
			{#if layoutPreview.importError}<p class="layout-error" role="alert">Import failed: {layoutPreview.importError}</p>{/if}
			<p class="layout-note">Plan drafts rooms with Rectangle or Polygon; commits stay in this preview only.</p>
		</section>
	{:else}
		<header class="camera-workspace-header">
			<h1>Camera Sequence</h1>
		</header>

		<div class="panel-content">
			<EditorCameraTree {store} />
		</div>
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
	.panel-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 0.3rem; }
	.panel-tabs button { padding: 0.42rem; border: 1px solid var(--editor-border-normal); border-radius: 0.32rem; background: var(--editor-bg-panel-raised); color: var(--editor-text-secondary); font: inherit; font-size: 0.73rem; cursor: pointer; }
	.panel-tabs button.active { border-color: var(--editor-accent); background: var(--editor-bg-selected); color: var(--editor-text-primary); }
	.panel-content { display: contents; }
	.camera-workspace-header { min-width: 0; padding-bottom: 0.25rem; border-bottom: 1px solid var(--editor-border-subtle); }
	.camera-workspace-header h1 { margin: 0; font-size: 0.95rem; font-weight: 650; letter-spacing: 0.02em; }
	.camera-workspace-header p { margin: 0.25rem 0 0; color: var(--editor-text-secondary); font-size: 0.72rem; }
	.layout-preview-summary { display: flex; flex-direction: column; gap: 0.8rem; }
	.source-badge { align-self: flex-start; padding: 0.24rem 0.45rem; border: 1px solid var(--editor-accent-border); border-radius: 999px; background: var(--editor-bg-selected); color: var(--editor-text-primary); font-size: 0.66rem; font-weight: 650; }
	.layout-preview-summary dl { display: flex; flex-direction: column; gap: 0.42rem; margin: 0; }
	.layout-preview-summary dl div { display: flex; justify-content: space-between; gap: 0.8rem; }
	.layout-preview-summary dt { color: var(--editor-text-muted); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; }
	.layout-preview-summary dd { margin: 0; color: var(--editor-text-primary); font-size: 0.75rem; }
	.layout-actions { display: flex; flex-direction: column; gap: 0.35rem; }
	.layout-actions button { padding: 0.42rem 0.5rem; border: 1px solid var(--editor-border-normal); border-radius: 0.32rem; background: var(--editor-bg-panel-raised); color: var(--editor-text-primary); font: inherit; font-size: 0.7rem; cursor: pointer; }
	.layout-actions button:hover { border-color: var(--editor-accent); }
	.layout-note { margin: 0; color: var(--editor-text-secondary); font-size: 0.7rem; line-height: 1.4; }
	.layout-error { margin: 0; color: var(--editor-danger-fg); font-size: 0.7rem; line-height: 1.4; }
	@media (max-width: 62rem) {
		.panel { min-height: 0; max-height: 34rem; border-top: 1px solid var(--editor-border-subtle); }
	}
	@media (max-width: 44rem) {
		.panel { max-height: 30rem; border-right: 0; }
	}
</style>
