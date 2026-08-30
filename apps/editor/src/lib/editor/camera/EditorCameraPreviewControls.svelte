<script lang="ts">
	import { Crosshair, Pause, Play, Scan } from 'lucide-svelte';
	import type { EditorStore } from '../editor-store.svelte';
	import { useCameraTimeline } from '../hooks/use-camera-timeline.svelte';

	let { store }: { store: EditorStore } = $props();
	const preview = $derived(store.cameraPreview);
	// svelte-ignore state_referenced_locally
	const timelineApi = useCameraTimeline(store);
</script>

{#if preview}
	<div class="preview-transport" aria-label="Camera preview transport">
		<!-- P11.4 §11.3 — one accessible segmented mode control. -->
		<div class="modes" role="group" aria-label="Camera mode">
			<button
				type="button"
				class:active={preview.mode === 'director'}
				aria-pressed={preview.mode === 'director'}
				onclick={() => store.setCameraPreviewMode('director')}
			>Observer</button>
			<button
				type="button"
				class:active={preview.mode === 'visitor'}
				aria-pressed={preview.mode === 'visitor'}
				onclick={() => store.setCameraPreviewMode('visitor')}
			>Through Camera</button>
		</div>
		{#if preview.kind !== 'camera'}
			<div class="transport">
				{#if preview.transport === 'playing'}
					<button
						type="button"
						class="active"
						aria-label="Pause"
						title="Pause"
						onclick={() => store.pauseCameraPreview()}
					><Pause size={14} aria-hidden="true" /></button>
				{:else}
					<button
						type="button"
						class="active"
						aria-label="Play"
						title="Play"
						disabled={!timelineApi.canPlay}
						onclick={() => store.playCameraPreview()}
					><Play size={14} aria-hidden="true" /></button>
				{/if}
			</div>
		{/if}
		<!-- P11.4 §11.3 — Follow/Recenter are Observer-only, icon-only, with
		     tooltip/name coverage; hidden entirely in Through Camera. -->
		{#if preview.mode === 'director'}
			<div class="director">
				<button
					type="button"
					class:active={store.cameraPreviewFollowEnabled}
					aria-pressed={store.cameraPreviewFollowEnabled}
					aria-label="Follow camera"
					title="Follow camera"
					onclick={() => store.toggleCameraPreviewFollow()}
				><Crosshair size={13} aria-hidden="true" /></button>
				<button
					type="button"
					aria-label="Recenter camera"
					title="Recenter camera"
					onclick={() => store.recenterCameraPreview()}
				><Scan size={13} aria-hidden="true" /></button>
			</div>
		{/if}
	</div>
{/if}

<style>
	/* Keep every preview action in one predictable toolbar row. The old
	   wrapping flex layout pushed the Stop control onto a second row for the
	   single-camera/no-timeline state. P11.4 removed the visible Stop. */
	.preview-transport {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: max-content;
		align-items: center;
		justify-content: center;
		width: 100%;
		max-width: 54rem;
		margin-inline: auto;
		gap: 0.55rem;
	}
	/* P11.4 — segmented mode control: one joined group, no stacked duplicates. */
	.modes, .director {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.15rem;
		min-width: 12rem;
	}
	.modes button:first-child { border-start-end-radius: 0; border-end-end-radius: 0; }
	.modes button:last-child { border-start-start-radius: 0; border-end-start-radius: 0; }
	.transport {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.35rem;
		min-width: 8rem;
	}
	button { display: inline-flex; align-items: center; justify-content: center; gap: 0.3rem; padding: 0.42rem 0.4rem; border: 1px solid var(--editor-border-normal); border-radius: 0.3rem; background: var(--editor-bg-panel-raised); color: var(--editor-text-secondary); font: inherit; font-size: 0.72rem; cursor: pointer; white-space: nowrap; }
	button.active { border-color: var(--editor-accent); background: var(--editor-bg-selected); color: var(--editor-text-primary); }
	button:disabled { opacity: 0.42; cursor: default; }
	.preview-transport :global(svg) { flex: 0 0 auto; }

	@media (max-width: 44rem) {
		.preview-transport { display: flex; flex-wrap: wrap; align-items: stretch; }
		/* Mode toggle must not resize the bar: the Observer-only Follow/Recenter
		   group shares the mode row (never a row of its own), so switching
		   Observer ⇄ Through swaps content within one slot instead of adding or
		   removing a row. */
		.modes, .director { min-width: 0; flex: 1 1 50%; }
		.transport { min-width: 0; flex: 1 1 100%; }
	}
</style>
