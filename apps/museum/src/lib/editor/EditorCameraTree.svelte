<script lang="ts">
	import GuidedTourPanel from './GuidedTourPanel.svelte';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let { store }: { store: MuseumEditorStore } = $props();
</script>

<section class="camera-tree" aria-label="Camera tree">
	<GuidedTourPanel {store} />
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
		color: #918c84;
		font-size: 0.7rem;
		padding: 0.4rem 0.45rem;
	}
	.empty strong {
		color: #d6d0c4;
		font-size: 0.76rem;
	}
</style>
