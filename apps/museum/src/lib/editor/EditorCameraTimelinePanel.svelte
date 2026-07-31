<script lang="ts">
	import EditorCameraPreviewControls from './EditorCameraPreviewControls.svelte';
	import EditorCameraTimelineDots from './EditorCameraTimelineDots.svelte';
	import EditorCameraTimelineRuler from './EditorCameraTimelineRuler.svelte';
	import { useCameraTimeline } from './hooks/use-camera-timeline.svelte';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let { store }: { store: MuseumEditorStore } = $props();

	// svelte-ignore state_referenced_locally
	const timelineApi = useCameraTimeline(store);
	const timeline = $derived(timelineApi.timeline);
	const preview = $derived(timelineApi.preview);
</script>

{#if timeline}
	<div class="timeline-panel">
		<EditorCameraTimelineRuler {store} />
		{#if preview}
			<EditorCameraPreviewControls {store} />
		{/if}
		<EditorCameraTimelineDots {store} />
	</div>
{:else}
	<div class="timeline-error" role="status">
		<strong>Guided timeline unavailable</strong>
		<span>Repair the guided camera cycle to continue.</span>
	</div>
{/if}

<style>
	.timeline-panel { display: flex; min-height: 0; flex-direction: column; gap: 0.55rem; }
	.timeline-panel :global(.transport button),
	.timeline-panel :global(.preview-transport button) {
		padding: 0.34rem 0.48rem; border: 1px solid #3a3a46; border-radius: 0.3rem;
		background: #1a1a22; color: #ddd6ca; font: inherit; font-size: 0.68rem; cursor: pointer;
	}
	.timeline-error { display: flex; height: 100%; min-height: 7rem; flex-direction: column; align-items: center; justify-content: center; gap: 0.3rem; color: #a8a29a; text-align: center; }
	.timeline-error strong { color: #d5cec2; font-size: 0.78rem; }
	.timeline-error span { font-size: 0.68rem; }
</style>
