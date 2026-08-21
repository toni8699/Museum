<script lang="ts">
	import type { CameraConnectionDirection } from '$lib/types/museum';
	import type { MuseumSceneDocument, SceneConnection } from '$lib/content/scene';
	import type { NavigationGraph } from '$lib/content/scene';
	import EditorNumberField from './EditorNumberField.svelte';
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
		{#key `${connection.id}:${direction}`}				<EditorNumberField
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
	.timing { display: flex; flex-direction: column; gap: 0.55rem; padding: 0.6rem; border: 1px solid #34313a; border-radius: 0.4rem; background: #17171f; }
	.section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; }
	h3 { margin: 0; font-size: 0.78rem; letter-spacing: 0.02em; color: #d6c7a8; }
	.direction-switch { display: flex; gap: 0.25rem; }
	.direction-switch button { padding: 0.28rem 0.45rem; border: 1px solid #3a3a46; border-radius: 0.3rem; background: #1a1a22; color: #ddd6ca; font: inherit; font-size: 0.66rem; cursor: pointer; }
	.direction-switch button.active { border-color: #d6b35f; background: #2a2618; color: #fff2c7; }
	.direction-switch button:disabled { opacity: 0.42; cursor: default; }
	dl { display: flex; flex-direction: column; gap: 0.4rem; margin: 0; }
	dl div { display: grid; grid-template-columns: 4.4rem 1fr; gap: 0.45rem; }
	dt { color: #8f8a82; font-size: 0.67rem; letter-spacing: 0.04em; text-transform: uppercase; }
	dd { display: flex; flex-direction: column; gap: 0.1rem; margin: 0; font-size: 0.76rem; }
	.auto-tag { align-self: flex-start; padding: 0.08rem 0.35rem; border: 1px dashed #6d687e; border-radius: 999px; color: #b7b1a4; font-size: 0.6rem; }
	button.secondary { padding: 0.42rem 0.4rem; border: 1px solid #4a4650; border-radius: 0.3rem; background: #1a1a22; color: #d6d0c4; font: inherit; font-size: 0.72rem; cursor: pointer; }
	button.secondary:disabled { opacity: 0.42; cursor: default; }
	.timing-unavailable { margin: 0; color: #918c84; font-size: 0.68rem; }
</style>
