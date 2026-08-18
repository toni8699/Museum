<script lang="ts">
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let { store }: { store: MuseumEditorStore } = $props();
	const preview = $derived(store.cameraPreview);
</script>

{#if preview}
	<div class="preview-transport" aria-label="Camera preview transport">
		<div class="modes">
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
		<p role="status">
			{preview.kind === 'node'
				? 'Holding authored node pose'
				: preview.kind === 'tour'
					? `Camera flow · ${preview.transport} · ${(preview.playhead * 100).toFixed(1)}%`
					: preview.kind === 'connection' && preview.direction === 'reverse'
						? `Reverse edge · ${preview.transport} · ${(preview.playhead * 100).toFixed(1)}%`
						: preview.kind === 'connection'
							? `Forward edge · ${preview.transport} · ${(preview.playhead * 100).toFixed(1)}%`
							: `${preview.transport} · ${(preview.playhead * 100).toFixed(1)}%`}
		</p>
		<div class="transport">
			{#if preview.transport === 'playing'}
				<button type="button" class="active" onclick={() => store.pauseCameraPreview()}>Pause</button>
			{:else}
				<button type="button" class="active" onclick={() => store.previewGuidedTour()}>
					Play camera flow
				</button>
			{/if}
		</div>
		{#if preview.mode === 'director'}
			<div class="director">
				<button
					type="button"
					class:active={store.cameraPreviewFollowEnabled}
					aria-pressed={store.cameraPreviewFollowEnabled}
					onclick={() => store.toggleCameraPreviewFollow()}
				>Follow {store.cameraPreviewFollowEnabled ? 'on' : 'off'}</button>
				<button type="button" onclick={() => store.recenterCameraPreview()}>Recenter</button>
			</div>
		{/if}
		<button type="button" class="stop" onclick={() => store.stopCameraPreview()}>Stop preview</button>
	</div>
{/if}

<style>
	.preview-transport { display: flex; flex-wrap: wrap; align-items: center; gap: 0.55rem; }
	.modes, .director { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.35rem; min-width: 12rem; }
	.transport { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.35rem; min-width: 8rem; }
	p { flex: 0 0 8rem; margin: 0; color: #8d887f; font-size: 0.68rem; text-transform: capitalize; }
	button { padding: 0.42rem 0.4rem; border: 1px solid #3a3a46; border-radius: 0.3rem; background: #1a1a22; color: #ddd6ca; font: inherit; font-size: 0.72rem; cursor: pointer; }
	button.active, button.stop { border-color: #d6b35f; background: #2a2618; color: #fff2c7; }
	button:disabled { opacity: 0.42; cursor: default; }
	.stop { margin-left: auto; }

	@media (max-width: 44rem) {
		.preview-transport { align-items: stretch; }
		.modes, .director, .transport { min-width: 0; flex: 1 1 100%; }
		p { flex-basis: auto; }
		.stop { width: 100%; margin-left: 0; }
	}
</style>
