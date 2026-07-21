<script lang="ts">
	import type { MuseumAsset } from '$lib/types/assets';
	import EditorAssetLibrary from './EditorAssetLibrary.svelte';
	import EditorCameraTree from './EditorCameraTree.svelte';
	import EditorSceneTree from './EditorSceneTree.svelte';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let {
		store,
		outlinerElement = $bindable(),
		onAssetSelection
	}: {
		store: MuseumEditorStore;
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
	.back { margin-top: auto; color: #d6c7a8; font-size: 0.85rem; text-decoration: none; }
	.back:hover { text-decoration: underline; }

	@media (max-width: 62rem) {
		.panel { min-height: 0; max-height: 34rem; border-top: 1px solid #2a2a33; }
	}
	@media (max-width: 44rem) {
		.panel { max-height: 30rem; border-right: 0; }
	}
</style>
