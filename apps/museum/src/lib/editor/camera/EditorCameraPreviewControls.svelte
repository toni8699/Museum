<script lang="ts">
	import { Crosshair, Pause, Play, Scan, Square } from 'lucide-svelte';
	import type { EditorStore } from '../editor-store.svelte';
	import { getCameraPreviewScopeLabel } from './editor-camera-preview-affordances';

	let { store }: { store: EditorStore } = $props();
	const preview = $derived(store.cameraPreview);
	const scopeLabel = $derived(preview ? getCameraPreviewScopeLabel(store.document, preview) : '');
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
		<p role="status" title={scopeLabel}>{scopeLabel}</p>
		{#if preview.kind !== 'camera'}
			<div class="transport">
				{#if preview.transport === 'playing'}
					<button type="button" class="active" onclick={() => store.pauseCameraPreview()}><Pause size={14} aria-hidden="true" /> Pause</button>
				{:else}
					<button type="button" class="active" onclick={() => store.playCameraPreview()}>
						<Play size={14} aria-hidden="true" />
						{preview.transport === 'complete' ? 'Replay' : 'Resume preview'}
					</button>
				{/if}
			</div>
		{/if}
		{#if preview.mode === 'director'}
			<div class="director">
				<button
					type="button"
					class:active={store.cameraPreviewFollowEnabled}
					aria-pressed={store.cameraPreviewFollowEnabled}
					onclick={() => store.toggleCameraPreviewFollow()}
				><Crosshair size={13} aria-hidden="true" /> Follow {store.cameraPreviewFollowEnabled ? 'on' : 'off'}</button>
				<button type="button" onclick={() => store.recenterCameraPreview()}><Scan size={13} aria-hidden="true" /> Recenter</button>
			</div>
		{/if}
		<button type="button" class="stop" onclick={() => store.stopCameraPreview()}><Square size={13} aria-hidden="true" /> Stop preview</button>
	</div>
{/if}

<style>
	/* Keep every preview action in one predictable toolbar row. The old
	   wrapping flex layout pushed Stop preview onto a second row for the
	   single-camera/no-timeline state. */
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
	.modes, .director {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.35rem;
		min-width: 12rem;
	}
	.transport {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.35rem;
		min-width: 8rem;
	}
	p {
		width: 10rem;
		min-width: 0;
		margin: 0;
		color: var(--editor-text-muted);
		font-size: 0.68rem;
		text-align: center;
		text-transform: capitalize;
		white-space: nowrap;
	}
	button { display: inline-flex; align-items: center; justify-content: center; gap: 0.3rem; padding: 0.42rem 0.4rem; border: 1px solid var(--editor-border-normal); border-radius: 0.3rem; background: var(--editor-bg-panel-raised); color: var(--editor-text-secondary); font: inherit; font-size: 0.72rem; cursor: pointer; white-space: nowrap; }
	button.active, button.stop { border-color: var(--editor-accent); background: var(--editor-bg-selected); color: var(--editor-text-primary); }
	button:disabled { opacity: 0.42; cursor: default; }
	.stop { margin-left: 0; }
	.preview-transport :global(svg) { flex: 0 0 auto; }

	@media (max-width: 44rem) {
		.preview-transport { display: flex; flex-wrap: wrap; align-items: stretch; }
		.modes, .director, .transport { min-width: 0; flex: 1 1 100%; }
		p { width: auto; flex: 1 1 100%; }
		.stop { width: 100%; margin-left: 0; }
	}
</style>
