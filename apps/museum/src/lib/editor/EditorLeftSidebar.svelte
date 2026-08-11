<script lang="ts">
	import type { MuseumAsset } from '$lib/types/assets';
	import EditorAssetLibrary from './EditorAssetLibrary.svelte';
	import EditorCameraTree from './EditorCameraTree.svelte';
	import EditorSceneTree from './EditorSceneTree.svelte';
	import {
		layoutPreviewSourceLabel,
		loadChopinLayoutPreview,
		resetLayoutPreview,
		type LayoutPreviewState
	} from './layout/layout-preview-state.svelte';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let {
		store,
		layoutPreview,
		outlinerElement = $bindable(),
		onAssetSelection
	}: {
		store: MuseumEditorStore;
		layoutPreview: LayoutPreviewState;
		outlinerElement?: HTMLElement | null;
		onAssetSelection?: (asset: MuseumAsset | undefined) => void;
	} = $props();

	function switchLeftPanel(panel: 'scene' | 'assets') {
		store.setLeftPanel(panel);
	}
</script>

<aside
	bind:this={outlinerElement}
	class="panel outliner"
	aria-label="Editor sidebar"
	inert={store.isDocumentMutationBlocked}
	style="grid-area: left;"
>
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
			<h1>Layout preview</h1>
			<p>Read-only generated geometry</p>
		</header>

		<section class="layout-preview-summary" aria-label="Layout preview source">
			<div class="source-badge">{layoutPreviewSourceLabel(layoutPreview.source)}</div>
			<dl>
				<div><dt>Rooms</dt><dd>{layoutPreview.model.rooms.length}</dd></div>
				<div><dt>Floors</dt><dd>{layoutPreview.project.layout.floors.length}</dd></div>
				<div><dt>Openings</dt><dd>{layoutPreview.project.layout.floors.reduce((sum, floor) => sum + floor.rooms.reduce((roomSum, room) => roomSum + room.openings.length, 0), 0)}</dd></div>
			</dl>
			<div class="layout-actions">
				<button type="button" onclick={() => loadChopinLayoutPreview(layoutPreview)}>Reload Chopin preview</button>
				<button type="button" onclick={() => resetLayoutPreview(layoutPreview)}>Reset empty</button>
			</div>
			<p class="layout-note">Plan drafts rooms with Rectangle or Polygon; commits stay in this preview only.</p>
		</section>
	{:else}
		<header class="camera-workspace-header">
			<h1>Camera Tour</h1>
		</header>

		<div class="panel-content">
			<EditorCameraTree {store} />
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
	.panel-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 0.3rem; }
	.panel-tabs button { padding: 0.42rem; border: 1px solid #3a3a46; border-radius: 0.32rem; background: #1a1a22; color: #a8a29a; font: inherit; font-size: 0.73rem; cursor: pointer; }
	.panel-tabs button.active { border-color: #d6b35f; background: #2a2618; color: #fff2c7; }
	.panel-content { display: contents; }
	.camera-workspace-header { min-width: 0; padding-bottom: 0.25rem; border-bottom: 1px solid #2a2a33; }
	.camera-workspace-header h1 { margin: 0; font-size: 0.95rem; font-weight: 650; letter-spacing: 0.02em; }
	.camera-workspace-header p { margin: 0.25rem 0 0; color: #a8a29a; font-size: 0.72rem; }
	.layout-preview-summary { display: flex; flex-direction: column; gap: 0.8rem; }
	.source-badge { align-self: flex-start; padding: 0.24rem 0.45rem; border: 1px solid #8d753c; border-radius: 999px; background: #2a2618; color: #fff2c7; font-size: 0.66rem; font-weight: 650; }
	.layout-preview-summary dl { display: flex; flex-direction: column; gap: 0.42rem; margin: 0; }
	.layout-preview-summary dl div { display: flex; justify-content: space-between; gap: 0.8rem; }
	.layout-preview-summary dt { color: #8f8a82; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; }
	.layout-preview-summary dd { margin: 0; color: #f4efe4; font-size: 0.75rem; }
	.layout-actions { display: flex; flex-direction: column; gap: 0.35rem; }
	.layout-actions button { padding: 0.42rem 0.5rem; border: 1px solid #3a3a46; border-radius: 0.32rem; background: #1a1a22; color: #f4efe4; font: inherit; font-size: 0.7rem; cursor: pointer; }
	.layout-actions button:hover { border-color: #d6b35f; }
	.layout-note { margin: 0; color: #a8a29a; font-size: 0.7rem; line-height: 1.4; }
	.back { margin-top: auto; color: #d6c7a8; font-size: 0.85rem; text-decoration: none; }
	.back:hover { text-decoration: underline; }

	@media (max-width: 62rem) {
		.panel { min-height: 0; max-height: 34rem; border-top: 1px solid #2a2a33; }
	}
	@media (max-width: 44rem) {
		.panel { max-height: 30rem; border-right: 0; }
	}
</style>
