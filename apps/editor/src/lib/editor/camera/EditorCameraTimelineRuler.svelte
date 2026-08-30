<script lang="ts">
	import { ArrowLeftRight, Pause, Play, Repeat } from 'lucide-svelte';
	import { useCameraTimeline } from '../hooks/use-camera-timeline.svelte';
	import type { EditorStore } from '../editor-store.svelte';

	let {
		store,
		viewMode = '3d'
	}: {
		store: EditorStore;
		viewMode?: 'plan' | '3d';
	} = $props();

	// svelte-ignore state_referenced_locally
	const timelineApi = useCameraTimeline(store);
	const timeline = $derived(timelineApi.timeline);
	const playhead = $derived(timelineApi.playhead);
	const previewPlaying = $derived(timelineApi.previewPlaying);
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
	const canPlay = $derived(timelineApi.canPlay);
	const canShowViewKey = $derived(
		!store.isRelic &&
		viewMode === '3d' &&
		scope === 'sequence' &&
		timeline !== null &&
		timelineApi.canAddViewKeyframeAtPlayhead
	);
	const edgeFlipDescription = $derived(
		store.isRelic
			? 'Swap travel direction, keeping the physical camera location.'
			: 'Swap travel direction, reset to start.'
	);

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

{#if store.isRelic}
	<!-- `/museum/editor` keeps the complete P11.4 ruler; the shared store
	     still supplies P12's binary transport state underneath it. -->
	{#if scope === 'edge'}
		{#if edgeTimeline}
			<div class="transport" aria-label="Edge camera transport">
				<button
					type="button"
					class:active={previewPlaying}
					aria-label={playLabel}
					title={playLabel}
					disabled={tourTransportDisabled || !canPlay}
					onclick={() => timelineApi.toggleTourPlayback()}
				>{#if previewPlaying}<Pause size={14} aria-hidden="true" />{:else}<Play size={14} aria-hidden="true" />{/if}</button>
				<button
					type="button"
					class="reverse"
					class:active={reverseActive}
					aria-pressed={reverseActive}
					aria-label={`${reverseLabel}. ${edgeFlipDescription}`}
					title={`${reverseLabel}. ${edgeFlipDescription}`}
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
							timelineApi.seekEdge(Number((event.currentTarget as HTMLInputElement).value))}
					/>
				</label>
			</div>
		{/if}
	{:else if timeline}
		<div class="transport" aria-label="Camera flow timeline transport">
			<button
				type="button"
				aria-label="Previous camera boundary"
				disabled={scrubDisabled || playhead <= 0}
				onclick={() => timelineApi.step(-1)}
			>│◀</button>
			<button
				type="button"
				class:active={previewPlaying}
				aria-label={playLabel}
				title={playLabel}
				disabled={tourTransportDisabled || !canPlay}
				onclick={() => timelineApi.toggleTourPlayback()}
			>{#if previewPlaying}<Pause size={14} aria-hidden="true" />{:else}<Play size={14} aria-hidden="true" />{/if}</button>
			<button
				type="button"
				aria-label="Next camera boundary"
				disabled={scrubDisabled || playhead >= 1}
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
			{#if scope === 'sequence'}
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
			{/if}
			<button
				type="button"
				class="add-key"
				disabled={!timelineApi.canAddViewKeyframeAtPlayhead}
				onclick={() => timelineApi.addViewKeyframeAtPlayhead()}
			>+ Camera Key</button>
		</div>
	{/if}
{:else if scope === 'edge' && edgeTimeline}
	<div class="ruler-actions edge-actions" aria-label="Edge timeline actions">
		<button
			type="button"
			class="ruler-action reverse"
			class:active={reverseActive}
			aria-pressed={reverseActive}
			aria-label={`Flip edge. ${edgeFlipDescription}`}
			title={`Flip edge. ${edgeFlipDescription}`}
			disabled={edgeReverseDisabled}
			onclick={() => timelineApi.swapEdgeReverse()}
		><ArrowLeftRight size={14} aria-hidden="true" /></button>
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
					timelineApi.seekEdge(Number((event.currentTarget as HTMLInputElement).value))}
			/>
		</label>
	</div>
{:else if scope === 'sequence' && timeline}
	<div class="ruler-actions sequence-actions" aria-label="Sequence timeline actions">
		<button
			type="button"
			class="ruler-action"
			aria-label="Previous camera boundary"
			disabled={scrubDisabled || playhead <= 0}
			onclick={() => timelineApi.step(-1)}
		>│◀</button>
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
			class="ruler-action"
			aria-label="Next camera boundary"
			disabled={scrubDisabled || playhead >= 1}
			onclick={() => timelineApi.step(1)}
		>▶│</button>
		<button
			type="button"
			class="ruler-action reverse"
			class:active={reverseActive}
			aria-pressed={reverseActive}
			aria-label={reverseLabel}
			title={`${reverseLabel}. When on, scrub and play travel this edge in reverse.`}
			disabled={reverseDisabled}
			onclick={() => timelineApi.toggleReverse()}
		>Reverse</button>
		{#if canShowViewKey}
			<button
				type="button"
				class="ruler-action add-key"
				aria-label="Add view key"
				disabled={!timelineApi.canAddViewKeyframeAtPlayhead}
				onclick={() => timelineApi.addViewKeyframeAtPlayhead()}
			>+ View Key</button>
		{/if}
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
	.ruler-actions {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 0.4rem;
		width: 100%;
	}
	.ruler-action {
		display: inline-flex;
		min-height: 24px;
		align-items: center;
		justify-content: center;
		padding: 0.34rem 0.48rem;
		border: 1px solid var(--editor-border-normal);
		border-radius: 0.3rem;
		background: var(--editor-bg-panel-raised);
		color: var(--editor-text-secondary);
		font: inherit;
		font-size: 0.68rem;
		cursor: pointer;
	}
	.ruler-action:hover:not(:disabled),
	.ruler-action:focus-visible { border-color: var(--editor-accent); outline: none; }
	.ruler-action.active { border-color: var(--editor-accent); background: var(--editor-bg-selected); color: var(--editor-text-primary); }
	.ruler-action:disabled { opacity: 0.38; cursor: default; }
	.ruler-action.add-key { border-color: var(--editor-accent-pressed); color: var(--editor-text-primary); white-space: nowrap; }
	output { min-width: 4.8rem; color: var(--editor-text-primary); font: 650 0.72rem/1 var(--editor-font); font-variant-numeric: tabular-nums; }
	.scrubber { display: flex; min-width: 8rem; flex: 1; align-items: center; gap: 0.45rem; }
	.scrubber span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
	.scrubber input { width: 100%; margin: 0; accent-color: var(--editor-accent); }

	@media (max-width: 44rem) {
		.transport { flex-wrap: wrap; }
		.scrubber { order: 2; flex-basis: 100%; }
		.ruler-actions { flex-wrap: wrap; }
		.ruler-actions .scrubber { order: 0; min-width: 10rem; flex: 1 1 10rem; }
	}
</style>
