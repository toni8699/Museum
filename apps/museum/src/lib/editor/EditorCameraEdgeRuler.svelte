<script lang="ts">
	import { useCameraTimeline } from './hooks/use-camera-timeline.svelte';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let { store }: { store: MuseumEditorStore } = $props();

	// svelte-ignore state_referenced_locally
	const timelineApi = useCameraTimeline(store);
	const edgeTimeline = $derived(timelineApi.edgeTimeline);
	const edgePlayhead = $derived(timelineApi.edgePlayhead);
	const edgeDuration = $derived(timelineApi.edgeDurationSeconds);
	const endpoints = $derived(timelineApi.edgeEndpoints);
	const preview = $derived(timelineApi.preview);
	const isEdgePreview = $derived(preview?.kind === 'edge');
	const isCandidate = $derived(!isEdgePreview && Boolean(edgeTimeline));
	const previewPlaying = $derived(preview?.kind === 'edge' && preview.transport === 'playing');
	const reverseActive = $derived(timelineApi.reverseEdgeActive);
	const reverseDisabled = $derived(timelineApi.edgeReverseDisabled);
	const scrubDisabled = $derived(timelineApi.edgeScrubDisabled);
	const repeatDisabled = $derived(timelineApi.edgeRepeatDisabled);
	const edgeRepeat = $derived(timelineApi.edgeRepeat);
	const disabled = $derived(timelineApi.disabled);

	function formatTime(seconds: number) {
		const safe = Math.max(0, seconds);
		const minutes = Math.floor(safe / 60);
		const remainder = safe - minutes * 60;
		return `${String(minutes).padStart(2, '0')}:${remainder.toFixed(2).padStart(5, '0')}`;
	}

	function scrub(event: Event) {
		timelineApi.seekEdge(Number((event.currentTarget as HTMLInputElement).value));
	}
</script>

{#if edgeTimeline && endpoints}
	<div class="transport edge-transport" aria-label="Camera edge timeline transport">
		{#if isCandidate}
			<!-- Candidate / read-only mode (D2) — scrub/Reverse/Repeat disabled + CTA -->
			<span class="endpoints" title={`${endpoints.fromLabel} → ${endpoints.toLabel}`}>
				{endpoints.fromLabel} → {endpoints.toLabel}
			</span>
			<output aria-label="Camera edge time">
				{formatTime(edgeDuration * edgePlayhead)} / {formatTime(edgeDuration)}
			</output>
			<label class="scrubber">
				<span>Edge playhead (candidate)</span>
				<input
					type="range"
					min="0"
					max="1"
					step="0.0005"
					value={edgePlayhead}
					disabled
				/>
			</label>
			<button
				type="button"
				class="preview-edge-cta"
				disabled={disabled}
				onclick={() => timelineApi.previewActiveEdge()}
			>Preview Edge</button>
			<button
				type="button"
				class="reverse"
				disabled
				title="Reverse — available after Preview Edge"
			>Reverse</button>
			<label class="repeat">
				<input type="checkbox" checked={edgeRepeat} disabled /> Repeat
			</label>
		{:else}
			<button
				type="button"
				aria-label="Previous edge boundary"
				disabled={scrubDisabled || edgePlayhead <= 0}
				onclick={() => timelineApi.stepEdge(-1)}
			>│◀</button>
			<button
				type="button"
				class:active={previewPlaying}
				aria-label={previewPlaying ? 'Pause' : 'Play edge'}
				title={previewPlaying ? 'Pause' : 'Play edge'}
				disabled={!edgeTimeline || store.isEditorInteractionActive || store.isDocumentTransactionActive}
				onclick={() => timelineApi.toggleEdgePlayback()}
			>{previewPlaying ? '❚❚' : '▶'}</button>
			<button
				type="button"
				aria-label="Next edge boundary"
				disabled={scrubDisabled || edgePlayhead >= 1}
				onclick={() => timelineApi.stepEdge(1)}
			>▶│</button>
			<button
				type="button"
				class="reverse"
				class:active={reverseActive}
				aria-pressed={reverseActive}
				aria-label={timelineApi.reverseEdgeLabel}
				title={`${timelineApi.reverseEdgeLabel}. When on, scrub and play travel this edge in reverse.`}
				disabled={reverseDisabled}
				onclick={() => timelineApi.toggleEdgeReverse()}
			>Reverse</button>
			<span class="endpoints" title={`${endpoints.fromLabel} → ${endpoints.toLabel}`}>
				{endpoints.fromLabel} → {endpoints.toLabel}
			</span>
			<output aria-label="Camera edge time">
				{formatTime(edgeDuration * edgePlayhead)} / {formatTime(edgeDuration)}
			</output>
			<label class="scrubber">
				<span>{reverseActive ? 'Reverse playhead' : 'Edge playhead'}</span>
				<input
					type="range"
					min="0"
					max="1"
					step="0.0005"
					value={edgePlayhead}
					disabled={scrubDisabled}
					oninput={scrub}
				/>
			</label>
			<label class="repeat" title="Repeat edge preview">
				<input
					type="checkbox"
					checked={edgeRepeat}
					disabled={repeatDisabled}
					onchange={(e) => timelineApi.setEdgeRepeat((e.currentTarget as HTMLInputElement).checked)}
				/> Repeat
			</label>
			<button
				type="button"
				class="add-key"
				disabled={!timelineApi.canAddViewKeyframeAtPlayhead}
				onclick={() => timelineApi.addViewKeyframeAtPlayhead()}
			>+ Camera Key</button>
		{/if}
	</div>
{/if}

<style>
	.transport { display: flex; min-width: 0; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
	.transport button {
		padding: 0.34rem 0.48rem; border: 1px solid #3a3a46; border-radius: 0.3rem;
		background: #1a1a22; color: #ddd6ca; font: inherit; font-size: 0.68rem; cursor: pointer;
	}
	.transport button:hover:not(:disabled) { border-color: #d6b35f; }
	.transport button.active { border-color: #d6b35f; background: #2a2618; color: #fff2c7; }
	.transport button:disabled { opacity: 0.38; cursor: default; }
	.transport .add-key { border-color: #6f5d32; color: #f4dc9b; white-space: nowrap; }
	.transport .preview-edge-cta { border-color: #6f5d32; color: #f4dc9b; }
	.endpoints { min-width: 0; max-width: 12rem; overflow: hidden; color: #c9c3b8; font-size: 0.68rem; text-overflow: ellipsis; white-space: nowrap; }
	output { min-width: 8.8rem; color: #f4efe4; font: 650 0.72rem/1 ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums; }
	.scrubber { display: flex; min-width: 8rem; flex: 1; align-items: center; gap: 0.45rem; }
	.scrubber span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
	.scrubber input { width: 100%; margin: 0; accent-color: #d6b35f; }
	.repeat { display: inline-flex; align-items: center; gap: 0.3rem; color: #c9c3b8; font-size: 0.68rem; cursor: pointer; }
	.repeat input { accent-color: #d6b35f; }

	@media (max-width: 44rem) {
		.transport { flex-wrap: wrap; }
		.scrubber { order: 2; flex-basis: 100%; }
	}
</style>
