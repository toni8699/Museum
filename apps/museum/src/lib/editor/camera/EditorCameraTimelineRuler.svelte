<script lang="ts">
	import { ArrowLeftRight, Pause, Play, Repeat } from 'lucide-svelte';
	import { useCameraTimeline } from '../hooks/use-camera-timeline.svelte';
	import type { EditorStore } from '../editor-store.svelte';

	let { store }: { store: EditorStore } = $props();

	// svelte-ignore state_referenced_locally
	const timelineApi = useCameraTimeline(store);
	const timeline = $derived(timelineApi.timeline);
	const playhead = $derived(timelineApi.playhead);
	const previewPlaying = $derived(timelineApi.previewPlaying);
	const disabled = $derived(timelineApi.disabled);
	const scrubDisabled = $derived(timelineApi.scrubDisabled);
	const tourTransportDisabled = $derived(timelineApi.tourTransportDisabled);
	const reverseLabel = $derived(timelineApi.reverseEdgeLabel);
	const reverseDisabled = $derived(timelineApi.reverseEdgeDisabled);
	const reverseActive = $derived(timelineApi.reverseEdgeActive);
	const playLabel = $derived(timelineApi.playLabel);
	// P11.3 §4/§10 — Edge scope renders the edge-local ruler (Edge duration /
	// time, local scrub, existing labeled Reverse); the global ruler stays in
	// Sequence scope / idle. Camera scope never mounts this component.
	const scope = $derived(timelineApi.scope);
	const edgeTimeline = $derived(timelineApi.edgeTimeline);
	const edgePlayhead = $derived(timelineApi.edgePlayhead);
	const edgeDurationSeconds = $derived(timelineApi.edgeDurationSeconds);
	const edgeScrubDisabled = $derived(timelineApi.edgeScrubDisabled);
	const edgeReverseDisabled = $derived(timelineApi.edgeReverseDisabled);
	// P11.4 §11.3 — icon-only edge Reverse (swap) + Repeat toggle.
	const edgeRepeat = $derived(timelineApi.edgeRepeat);
	const edgeRepeatDisabled = $derived(timelineApi.edgeRepeatDisabled);

	function formatTime(seconds: number) {
		const safe = Math.max(0, seconds);
		const minutes = Math.floor(safe / 60);
		const remainder = safe - minutes * 60;
		return `${String(minutes).padStart(2, '0')}:${remainder.toFixed(2).padStart(5, '0')}`;
	}

	function scrub(event: Event) {
		timelineApi.seek(Number((event.currentTarget as HTMLInputElement).value));
	}
</script>

{#if scope === 'edge'}
	{#if edgeTimeline}
		<div class="transport" aria-label="Edge camera transport">
			<button
				type="button"
				class:active={previewPlaying}
				aria-label={playLabel}
				title={playLabel}
				disabled={tourTransportDisabled}
				onclick={() => timelineApi.toggleTourPlayback()}
			>{#if previewPlaying}<Pause size={14} aria-hidden="true" />{:else}<Play size={14} aria-hidden="true" />{/if}</button>
			<!-- P11.4 §11.3 — Edge Reverse is the paused-edge direction SWAP
			     (fresh opposite route, physical pose preserved via the 1 − e
			     flip), not the sequence-side travel toggle. -->
			<button
				type="button"
				class="reverse"
				class:active={reverseActive}
				aria-pressed={reverseActive}
				aria-label={reverseLabel}
				title={`${reverseLabel}. Swap travel direction, keeping the physical camera location.`}
				disabled={edgeReverseDisabled}
				onclick={() => timelineApi.swapEdgeReverse()}
			><ArrowLeftRight size={14} aria-hidden="true" /></button>
			<button
				type="button"
				class:active={edgeRepeat}
				aria-pressed={edgeRepeat}
				aria-label="Repeat edge"
				title="Repeat edge"
				disabled={edgeRepeatDisabled}
				onclick={() => (store.edgeRepeat = !store.edgeRepeat)}
			><Repeat size={14} aria-hidden="true" /></button>
			<output aria-label="Edge camera time">
				{formatTime(edgeDurationSeconds * edgePlayhead)}
			</output>
			<label class="scrubber">
				<span>Edge playhead</span>
				<input
					type="range"
					min="0"
					max="1"
					step="0.0005"
					value={edgePlayhead}
					disabled={edgeScrubDisabled}
					oninput={(event) =>
						store.setCameraPreviewPlayhead(Number((event.currentTarget as HTMLInputElement).value))}
				/>
			</label>
		</div>
	{/if}
{:else if timeline}
	<div class="transport" aria-label="Camera flow timeline transport">
		<button
			type="button"
			aria-label="Previous camera boundary"
			disabled={disabled || playhead <= 0}
			onclick={() => timelineApi.step(-1)}
		>│◀</button>
		<button
			type="button"
			class:active={previewPlaying}
			aria-label={playLabel}
			title={playLabel}
			disabled={tourTransportDisabled}
			onclick={() => timelineApi.toggleTourPlayback()}
		>{#if previewPlaying}<Pause size={14} aria-hidden="true" />{:else}<Play size={14} aria-hidden="true" />{/if}</button>
		<button
			type="button"
			aria-label="Next camera boundary"
			disabled={disabled || playhead >= 1}
			onclick={() => timelineApi.step(1)}
		>▶│</button>
		<button
			type="button"
			class="reverse"
			class:active={reverseActive}
			aria-pressed={reverseActive}
			aria-label={reverseLabel}
			title={`${reverseLabel}. When on, scrub and play travel this edge in reverse.`}
			disabled={reverseDisabled}
			onclick={() => timelineApi.toggleReverse()}
		>Reverse</button>
		<output aria-label="Camera timeline time">
			{formatTime(timeline.durationSeconds * playhead)}
		</output>
		<label class="scrubber">
			<span>{reverseActive ? 'Reverse playhead' : 'Tour playhead'}</span>
			<input
				type="range"
				min="0"
				max="1"
				step="0.0005"
				value={playhead}
				disabled={scrubDisabled}
				oninput={scrub}
			/>
		</label>
		<button
			type="button"
			class="add-key"
			disabled={!timelineApi.canAddViewKeyframeAtPlayhead}
			onclick={() => timelineApi.addViewKeyframeAtPlayhead()}
		>+ Camera Key</button>
	</div>
{/if}

<style>
	.transport { display: flex; min-width: 0; align-items: center; gap: 0.4rem; }
	.transport button {
		padding: 0.34rem 0.48rem; border: 1px solid var(--editor-border-normal); border-radius: 0.3rem;
		background: var(--editor-bg-panel-raised); color: var(--editor-text-secondary); font: inherit; font-size: 0.68rem; cursor: pointer;
	}
	.transport button:hover:not(:disabled) { border-color: var(--editor-accent); }
	.transport button.active { border-color: var(--editor-accent); background: var(--editor-bg-selected); color: var(--editor-text-primary); }
	.transport button:disabled { opacity: 0.38; cursor: default; }
	.transport .add-key { border-color: var(--editor-accent-pressed); color: var(--editor-text-primary); white-space: nowrap; }
	output { min-width: 4.8rem; color: var(--editor-text-primary); font: 650 0.72rem/1 var(--editor-font); font-variant-numeric: tabular-nums; }
	.scrubber { display: flex; min-width: 8rem; flex: 1; align-items: center; gap: 0.45rem; }
	.scrubber span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
	.scrubber input { width: 100%; margin: 0; accent-color: var(--editor-accent); }

	@media (max-width: 44rem) {
		.transport { flex-wrap: wrap; }
		.scrubber { order: 2; flex-basis: 100%; }
	}
</style>
