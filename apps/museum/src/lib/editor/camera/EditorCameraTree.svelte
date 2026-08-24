<script lang="ts">
	import CameraFlowPanel from '../CameraFlowPanel.svelte';
	import type { EditorStore } from '../editor-store.svelte';

	let { store }: { store: EditorStore } = $props();
</script>

<section class="camera-tree" aria-label="Camera tree">
	<CameraFlowPanel {store} />
	{#if store.document.navigationNodes.length === 0 && store.document.connections.length === 0}
		<p class="empty"><strong>No cameras</strong></p>
	{/if}
</section>

<style>
	.camera-tree {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 0.55rem;
	}
	.empty {
		color: var(--editor-text-muted);
		font-size: 0.7rem;
		padding: 0.4rem 0.45rem;
	}
	.empty strong {
		color: var(--editor-text-secondary);
		font-size: 0.76rem;
	}
</style>
