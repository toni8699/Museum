<script lang="ts">
	import type { CameraConnectionDirection } from '$lib/types/scene';
	import type { SceneDocument, SceneConnection } from '$lib/content/scene';
	import type { NavigationGraph } from '$lib/content/scene';
	import EditorNumberField from '../fields/EditorNumberField.svelte';
	import { resolveCameraConnectionTiming } from './editor-camera-timing';

	let {
		connection,
		direction,
		graph,
		disabled = false,
		oncommit,
		onDirectionChange,
		onUseAutomatic
	}: {
		connection: SceneConnection;
		direction: CameraConnectionDirection;
		graph: NavigationGraph;
		disabled?: boolean;
		oncommit: (duration: number) => void;
		onDirectionChange: (direction: CameraConnectionDirection) => void;
		onUseAutomatic: () => void;
	} = $props();

	const timingReadout = $derived(
		resolveCameraConnectionTiming(connection.id, direction, graph)
	);

	const authoredDuration = $derived(
		connection.timing?.[direction]?.durationSeconds !== undefined
	);

	function commitDuration(value: number) {
		oncommit(value);
	}

	function useAutomatic() {
		onUseAutomatic();
	}
</script>

<section class="timing" aria-label="Connection timing">
	<div class="section-heading">
		<h3>Timing</h3>
		<div class="direction-switch" role="group" aria-label="Timing direction">
			<button
				type="button"
				class:active={direction === 'forward'}
				aria-pressed={direction === 'forward'}
				disabled={disabled}
				onclick={() => onDirectionChange('forward')}
			>A→B</button>
			<button
				type="button"
				class:active={direction === 'reverse'}
				aria-pressed={direction === 'reverse'}
				disabled={disabled}
				onclick={() => onDirectionChange('reverse')}
			>B→A</button>
		</div>
	</div>
	{#if timingReadout}
		<dl>
			<div><dt>Path length</dt><dd>{timingReadout.pathLengthMeters.toFixed(2)} m</dd></div>
			<div>
				<dt>Effective</dt>
				<dd>
					{timingReadout.durationSeconds.toFixed(2)} s
					{#if !timingReadout.authoredDuration}<span class="auto-tag">automatic</span>{/if}
				</dd>
			</div>
			<div><dt>Speed</dt><dd>{timingReadout.speedMetersPerSecond.toFixed(2)} m/s</dd></div>
		</dl>
		{#key `${connection.id}:${direction}`}
			<EditorNumberField
					label="Authored duration (s)"
					value={timingReadout.durationSeconds}
					step={0.1}
					min={0.01}
					fractionDigits={2}
					oncommit={commitDuration}
				/>
		{/key}
		{#if authoredDuration}
			<button
				type="button"
				class="secondary"
				{disabled}
				onclick={useAutomatic}
			>Use automatic</button>
		{/if}
	{:else}
		<p class="timing-unavailable">Timing unavailable — resolve the scene first.</p>
	{/if}
</section>

<style>
	.timing { display: flex; flex-direction: column; gap: 0.55rem; padding: 0.6rem; border: 1px solid var(--editor-border-subtle); border-radius: 0.4rem; background: var(--editor-bg-panel-raised); }
	.section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; }
	h3 { margin: 0; font-size: 0.78rem; letter-spacing: 0.02em; color: var(--editor-text-secondary); }
	.direction-switch { display: flex; gap: 0.25rem; }
	.direction-switch button { padding: 0.28rem 0.45rem; border: 1px solid var(--editor-border-normal); border-radius: 0.3rem; background: var(--editor-bg-panel-raised); color: var(--editor-text-secondary); font: inherit; font-size: 0.66rem; cursor: pointer; }
	.direction-switch button.active { border-color: var(--editor-accent); background: var(--editor-bg-selected); box-shadow: 0 0 8px rgb(59 130 246 / 30%); color: var(--editor-accent-hover); }
	.direction-switch button:disabled { opacity: 0.42; cursor: default; }
	dl { display: flex; flex-direction: column; gap: 0.4rem; margin: 0; }
	dl div { display: grid; grid-template-columns: 4.4rem 1fr; gap: 0.45rem; }
	dt { color: var(--editor-text-muted); font-size: 0.67rem; letter-spacing: 0.04em; text-transform: uppercase; }
	dd { display: flex; flex-direction: column; gap: 0.1rem; margin: 0; font-size: 0.76rem; }
	.auto-tag { align-self: flex-start; padding: 0.08rem 0.35rem; border: 1px dashed var(--editor-border-strong); border-radius: 999px; color: var(--editor-outline-muted); font-size: 0.6rem; }
	button.secondary { padding: 0.42rem 0.4rem; border: 1px solid var(--editor-border-normal); border-radius: 0.3rem; background: var(--editor-bg-panel-raised); color: var(--editor-text-secondary); font: inherit; font-size: 0.72rem; cursor: pointer; }
	button.secondary:disabled { opacity: 0.42; cursor: default; }
	.timing-unavailable { margin: 0; color: var(--editor-text-muted); font-size: 0.68rem; }
</style>
