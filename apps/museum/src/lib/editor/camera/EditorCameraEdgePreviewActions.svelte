<script lang="ts">
	import type { SceneConnection } from '$lib/content/scene';
	import type { EditorStore } from '../editor-store.svelte';
	import { getCameraEdgePreviewChoices } from './editor-camera-preview-affordances';

	let { store, connection }: { store: EditorStore; connection: SceneConnection } = $props();
	const affordance = $derived(
		getCameraEdgePreviewChoices(store.document, store.guidedTourNodeIds, connection)
	);
	const active = $derived(
		store.cameraPreview?.kind === 'edge' && store.cameraPreview.connectionId === connection.id
			? store.cameraPreview
			: null
	);
	const blocked = $derived(
		store.isDocumentTransactionActive ||
		store.isEditorInteractionActive ||
		store.pendingNavigationCommand !== null
	);
</script>

<div class="edge-preview-actions" role="group" aria-label="Preview Edge">
	{#if affordance.sequenceAdjacent}
		{@const item = affordance.choices[0]}
		<button
			type="button"
			class:active={active?.direction === item.direction}
			disabled={blocked}
			onclick={() => store.previewEdge(connection.id, item.direction, 'director')}
		>Preview Edge · {item.label}</button>
	{:else}
		<span>Preview Edge</span>
		<div class="direction-choices">
			{#each affordance.choices as item (item.direction)}
				<button
					type="button"
					class:active={active?.direction === item.direction}
					disabled={blocked}
					onclick={() => store.previewEdge(connection.id, item.direction, 'director')}
				>{item.label}</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.edge-preview-actions { display: flex; flex-direction: column; gap: 0.35rem; }
	.edge-preview-actions > span { color: var(--editor-text-muted); font-size: 0.66rem; font-weight: 650; }
	.direction-choices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.35rem; }
	button { padding: 0.42rem 0.5rem; border: 1px solid var(--editor-border-normal); border-radius: 0.3rem; background: var(--editor-bg-panel-raised); color: var(--editor-text-secondary); font: inherit; font-size: 0.68rem; cursor: pointer; }
	button.active { border-color: var(--editor-accent); background: var(--editor-bg-selected); color: var(--editor-text-primary); }
	button:disabled { opacity: 0.42; cursor: default; }
</style>
