<script lang="ts">
	import { editorCameraLabels } from './editor-camera-labels.svelte';

	// P1.7 — shell spec "Viewport MUST show": guided sequence numbering +
	// unsequenced distinction in Camera 3D. Pure display over the projected
	// shared state: aria-hidden, pointer-events none, never raycasts. Ordered
	// cameras render a numbered chip (①-style), unsequenced cameras the
	// "Unsequenced" badge — mirroring the Camera Plan surface's labels so the
	// two viewports stay visually consistent.
	const visibleLabels = $derived(editorCameraLabels.labels.filter((label) => !label.occluded));
</script>

{#if editorCameraLabels.ready && visibleLabels.length > 0}
	<div class="camera-labels" aria-hidden="true">
		{#each visibleLabels as label (label.nodeId)}
			{#if label.order !== null}
				<span class="chip order" style={`translate: ${label.x}px ${label.y}px;`}>{label.order}</span>
			{:else if label.unsequenced}
				<span class="chip unsequenced" style={`translate: ${label.x}px ${label.y}px;`}>Unsequenced</span>
			{/if}
		{/each}
	</div>
{/if}

<style>
	.camera-labels {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
		z-index: 3;
	}
	.chip {
		position: absolute;
		left: 0;
		top: 0;
		transform: translate(-50%, -50%);
		padding: 0.1rem 0.42rem;
		border-radius: 999px;
		font: 650 0.62rem/1.35 var(--editor-font);
		white-space: nowrap;
	}
	.chip.order {
		min-width: 1.15rem;
		box-sizing: border-box;
		text-align: center;
		border: 1px solid var(--editor-accent);
		background: rgb(24 20 12 / 88%);
		color: var(--editor-text-primary);
		font-variant-numeric: tabular-nums;
	}
	.chip.unsequenced {
		border: 1px dashed var(--editor-text-muted);
		background: rgb(18 18 24 / 82%);
		color: var(--editor-outline-muted);
	}
</style>
