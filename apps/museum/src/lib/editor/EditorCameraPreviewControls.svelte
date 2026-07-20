<script lang="ts">
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let { store }: { store: MuseumEditorStore } = $props();
	const preview = $derived(store.cameraPreview);

	function scrub(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		store.setCameraPreviewPlayhead(Number(input.value));
	}
</script>

{#if preview}
	<div class="preview-transport" aria-label="Camera preview transport">
		<div class="modes">
			<button
				type="button"
				class:active={preview.mode === 'director'}
				aria-pressed={preview.mode === 'director'}
				onclick={() => store.setCameraPreviewMode('director')}
			>Director</button>
			<button
				type="button"
				class:active={preview.mode === 'visitor'}
				aria-pressed={preview.mode === 'visitor'}
				onclick={() => store.setCameraPreviewMode('visitor')}
			>Visitor</button>
		</div>
		<p role="status">
			{preview.kind === 'node'
				? 'Holding authored node pose'
				: `${preview.transport} · ${(preview.playhead * 100).toFixed(1)}%`}
		</p>
		{#if preview.kind !== 'node'}
			<label>
				<span>Playhead</span>
				<input
					type="range"
					min="0"
					max="1"
					step="0.001"
					value={preview.playhead}
					disabled={preview.transport === 'playing'}
					oninput={scrub}
				/>
			</label>
			<div class="transport">
				<button type="button" disabled={preview.mode !== 'director' || preview.transport === 'playing'} onclick={() => store.stepCameraPreview(-1)}>Previous</button>
				{#if preview.transport === 'playing'}
					<button type="button" class="active" onclick={() => store.pauseCameraPreview()}>Pause</button>
				{:else}
					<button type="button" class="active" onclick={() => store.playCameraPreview()}>Play</button>
				{/if}
				<button type="button" disabled={preview.mode !== 'director' || preview.transport === 'playing'} onclick={() => store.stepCameraPreview(1)}>Next</button>
			</div>
		{/if}
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
	.preview-transport { display: flex; flex-direction: column; gap: 0.45rem; padding-top: 0.2rem; }
	.modes, .director { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.35rem; }
	.transport { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.35rem; }
	p { margin: 0; color: #8d887f; font-size: 0.68rem; text-transform: capitalize; }
	label { display: flex; flex-direction: column; gap: 0.25rem; color: #8f8a82; font-size: 0.67rem; letter-spacing: 0.04em; text-transform: uppercase; }
	input { width: 100%; margin: 0; }
	button { padding: 0.42rem 0.4rem; border: 1px solid #3a3a46; border-radius: 0.3rem; background: #1a1a22; color: #ddd6ca; font: inherit; font-size: 0.72rem; cursor: pointer; }
	button.active, button.stop { border-color: #d6b35f; background: #2a2618; color: #fff2c7; }
	button:disabled, input:disabled { opacity: 0.42; cursor: default; }
	.stop { align-self: flex-start; }
</style>
