<script lang="ts">
	import type { LayoutPreviewState } from '$lib/editor/layout/layout-preview-state.svelte';
	import type { EditorStore } from '$lib/editor/editor-store.svelte';
	import CameraPlanToolbar from '$lib/editor/camera-plan/CameraPlanToolbar.svelte';
	import CameraPlanViewport from '$lib/editor/camera-plan/CameraPlanViewport.svelte';
	import type { CameraPlanState } from '$lib/editor/camera-plan/camera-plan-state.svelte';

	let {
		store,
		layoutPreview,
		cameraPlan
	}: {
		store: EditorStore;
		layoutPreview: LayoutPreviewState;
		cameraPlan: CameraPlanState;
	} = $props();
</script>

<div class="camera-plan-workspace" role="application" aria-label="Camera Plan surface">
	<CameraPlanToolbar {store} {cameraPlan} />
	<CameraPlanViewport {store} preview={layoutPreview} {cameraPlan} />
</div>

<style>
	.camera-plan-workspace {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 0;
		overflow: hidden;
		background: #0b0b10;
		/* S10.1.6 amendment — Plan ↔ 3D swaps are instant (no fade). */
	}
</style>
