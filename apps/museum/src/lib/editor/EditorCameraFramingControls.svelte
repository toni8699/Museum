<script lang="ts">
	import type { CameraConnectionDirection } from '$lib/types/museum';
	import type { CameraFramingEnvelope, SceneConnection } from '$lib/content/scene';
	import type { NavigationGraph } from '$lib/content/scene';
	import {
		CAMERA_FOCUS_TIMING_PRESETS,
		CAMERA_FRAMING_AUTHORING_COMFORT,
		FOCUS_TIMING_PRESET_LABELS,
		FOCUS_TIMING_PRESET_ORDER,
		ENVELOPE_HANDLE_LABELS,
		ENVELOPE_HANDLE_NAMES,
		rapidLensChangeDiagnostic,
		parallaxTurnDiagnostic,
		targetPassesCloseDiagnostic,
		stepLensChangeDiagnostic,
		dedupeFramingDiagnostics,
		exitEndLabel,
		type CameraFramingDiagnostic,
		type FocusTimingPresetName,
		type EnvelopeHandleName
	} from './editor-camera-framing-authoring';
	import {
		isOrderedCameraFramingEnvelope,
		type CameraFramingEnvelopePolicyState
	} from './editor-camera-framing-envelope';
	import {
		cameraMotionProgressAtEdgeProgress,
		createCameraMotion,
		createCameraMotionSample,
		sampleCameraMotion,
		readCameraFramingGuardStatus,
		type CameraMotion
	} from '$lib/museum/navigation/camera-motion';
	import { getCameraConnectionRoute, getCameraMotionOptions } from '$lib/museum/navigation/camera-route';
	import EditorNumberField from './EditorNumberField.svelte';

	let {
		connection,
		direction,
		policyState,
		graph = null,
		diagnostics: diagnosticsProp = [],
		disabled = false,
		onPresetClick,
		onHandleCommit
	}: {
		connection: SceneConnection;
		direction: CameraConnectionDirection;
		policyState: CameraFramingEnvelopePolicyState | null;
		graph?: NavigationGraph | null;
		diagnostics?: CameraFramingDiagnostic[];
		disabled?: boolean;
		onPresetClick: (preset: FocusTimingPresetName) => void;
		onHandleCommit: (handle: EnvelopeHandleName, value: number) => boolean | void;
	} = $props();

	let advancedOpen = $state(false);

	const envelope = $derived(policyState?.envelope ?? null);
	const management = $derived(policyState?.management ?? null);

	/** Directional key count for this connection+direction. */
	const keyCount = $derived(
		(connection.viewTracks?.[direction] ?? []).length
	);

	/** Match the current envelope against known presets. */
	const matchedPreset = $derived((): FocusTimingPresetName | null => {
		if (!envelope) return null;
		for (const name of FOCUS_TIMING_PRESET_ORDER) {
			const preset = CAMERA_FOCUS_TIMING_PRESETS[name];
			if (
				envelope.enterStart === preset.enterStart &&
				envelope.enterEnd === preset.enterEnd &&
				envelope.exitStart === preset.exitStart &&
				envelope.exitEnd === preset.exitEnd
			) {
				return name;
			}
		}
		return null;
	});

	const currentPresetName = $derived(matchedPreset());
	const hasEnvelope = $derived(envelope !== null);
	const isLegacyFullMove = $derived(
		hasEnvelope &&
		envelope!.enterStart === 0 &&
		envelope!.enterEnd === 0 &&
		envelope!.exitStart === 1 &&
		envelope!.exitEnd === 1
	);

	// ===================================================================
	// P1.6 — Comfort diagnostics from actual motion sampling
	// ===================================================================

	/**
	 * Performance bound — cache the resolved route/motion for the active
	 * connection+direction. Keyed on graph / connection / direction / key
	 * count, all stable across an envelope-handle drag (only the envelope
	 * object is replaced in place), so a drag never rebuilds route+motion per
	 * pointer move. Rebuilt after any committed document change (new graph)
	 * or key add/delete (key count).
	 */
	const resolvedMotion = $derived.by((): CameraMotion | null => {
		if (!graph || keyCount === 0) return null;
		const graphConnection = graph.connections.find((c) => c.id === connection.id);
		if (!graphConnection) return null;
		try {
			const route = getCameraConnectionRoute(connection.id, direction, graph);
			return createCameraMotion(route, undefined, getCameraMotionOptions(graphConnection, direction));
		} catch {
			return null;
		}
	});

	const motionDiagnostics = $derived.by((): CameraFramingDiagnostic[] => {
		if (!envelope || keyCount === 0) return [];
		const motion = resolvedMotion;
		if (!motion) return [];
		const diagnostics: CameraFramingDiagnostic[] = [];

		// Compute ramp seconds for enter and exit ramps.
		const enterRampSeconds = computeRampSecondsFromMotion(
			motion, 0, envelope.enterStart, envelope.enterEnd
		);
		const exitRampSeconds = computeRampSecondsFromMotion(
			motion, 0, envelope.exitStart, envelope.exitEnd
		);

		// Zero-width ramp = step lens change.
		if (envelope.enterStart === envelope.enterEnd && envelope.enterStart > 0 && envelope.enterStart < 1) {
			diagnostics.push(stepLensChangeDiagnostic('enter'));
		}
		if (envelope.exitStart === envelope.exitEnd && envelope.exitStart > 0 && envelope.exitStart < 1) {
			diagnostics.push(stepLensChangeDiagnostic('exit'));
		}

		// Sample FOV rate across each ramp.
		const sample = createCameraMotionSample();
		const rampDiagnostics = sampleFovRateDiagnostics(
			motion, envelope, sample
		);
		diagnostics.push(...rampDiagnostics);

		// Guard status from F3 accessor.
		// Find the edge index for this connection.
		const edgeIndex = motion.positionEdgeSpans.findIndex(
			(span) => span.connectionId === connection.id && span.direction === direction
		);
		if (edgeIndex >= 0) {
			const guardStatus = readCameraFramingGuardStatus(motion, edgeIndex);
			// One parallax hint whether angular-rate limiting, a bypass, or both
			// are active; the template keys diagnostic rows on `kind`.
			if (guardStatus?.limitsAngularRate || guardStatus?.hasBypass) {
				diagnostics.push(parallaxTurnDiagnostic());
			}
			if (guardStatus?.hasStandoff) diagnostics.push(targetPassesCloseDiagnostic());
		}
		return diagnostics;
	});

	/** Compute ramp seconds for one ramp of the envelope using the exact motion. */
	function computeRampSecondsFromMotion(
		motion: import('$lib/museum/navigation/camera-motion').CameraMotion,
		_edgeIndex: number,
		rampStart: number,
		rampEnd: number
	): number {
		if (rampStart >= rampEnd) return 0;
		// Use easing-aware mapping: edge progress → motion progress → time.
		const startProgress = cameraMotionProgressAtEdgeProgress(motion, 0, rampStart);
		const endProgress = cameraMotionProgressAtEdgeProgress(motion, 0, rampEnd);
		return Math.abs(endProgress - startProgress) * motion.durationSeconds;
	}

	/** Sample FOV rate across enter/exit ramps and return diagnostics for exceeding the limit. */
	function sampleFovRateDiagnostics(
		motion: import('$lib/museum/navigation/camera-motion').CameraMotion,
		env: CameraFramingEnvelope,
		sample: import('$lib/museum/navigation/camera-motion').CameraMotionSample
	): CameraFramingDiagnostic[] {
		const diagnostics: CameraFramingDiagnostic[] = [];
		const maxRate = CAMERA_FRAMING_AUTHORING_COMFORT.maxFovRateDegreesPerSecond;
		const samplesPerRamp = CAMERA_FRAMING_AUTHORING_COMFORT.diagnosticSamplesPerRamp;

		for (const [label, rampStart, rampEnd] of [
			['enter', env.enterStart, env.enterEnd] as const,
			['exit', env.exitStart, env.exitEnd] as const
		]) {
			if (rampStart >= rampEnd) continue;
			let peakRate = 0;
			let prevFov = 0;
			let prevTime = 0;
			let firstSample = true;

			for (let i = 0; i <= samplesPerRamp; i++) {
				const edgeProgress = rampStart + (rampEnd - rampStart) * (i / samplesPerRamp);
				const motionProgress = cameraMotionProgressAtEdgeProgress(motion, 0, edgeProgress);
				sampleCameraMotion(motion, motionProgress, sample);
				const timeSeconds = motionProgress * motion.durationSeconds;

				if (!firstSample && timeSeconds > prevTime) {
					const dt = timeSeconds - prevTime;
					const dFov = Math.abs(sample.fov - prevFov);
					const rate = dt > 0 ? dFov / dt : 0;
					if (rate > peakRate) peakRate = rate;
				}
				prevFov = sample.fov;
				prevTime = timeSeconds;
				firstSample = false;
			}

			if (peakRate > maxRate) {
				const rampTime = computeRampSecondsFromMotion(motion, 0, rampStart, rampEnd);
				diagnostics.push(rapidLensChangeDiagnostic(peakRate, rampTime));
			}
		}
		return diagnostics;
	}

	/** Combined diagnostics: prop-provided + motion-sampled, deduplicated by kind. */
	const allDiagnostics = $derived(
		dedupeFramingDiagnostics([...diagnosticsProp, ...motionDiagnostics])
	);

	function commitHandle(handle: EnvelopeHandleName, value: number) {
		return onHandleCommit(handle, value);
	}
</script>

<section class="framing-controls" aria-label="Camera framing controls">
	{#if keyCount === 0}
		<p class="empty-state">
			Automatic framing — add a view breakpoint to shape focus
		</p>
	{:else if !hasEnvelope}
		<p class="empty-state legacy">
			Legacy Full Move
		</p>
		<!-- Keys exist but no envelope: an explicit preset materializes one. -->
		<div class="preset-row" role="group" aria-label="Focus timing presets">
			{#each FOCUS_TIMING_PRESET_ORDER as presetName (presetName)}
				<button
					type="button"
					class="preset-btn"
					{disabled}
					onclick={() => onPresetClick(presetName)}
				>{FOCUS_TIMING_PRESET_LABELS[presetName]}</button>
			{/each}
		</div>
	{:else}
		<!-- Focus-timing presets -->
		<div class="preset-row" role="group" aria-label="Focus timing presets">
			{#each FOCUS_TIMING_PRESET_ORDER as presetName (presetName)}
				<button
					type="button"
					class="preset-btn"
					class:active={currentPresetName === presetName}
					{disabled}
					onclick={() => onPresetClick(presetName)}
				>{FOCUS_TIMING_PRESET_LABELS[presetName]}</button>
			{/each}
		</div>

		<!-- Envelope summary -->
		{#if management === 'auto'}
			<p class="envelope-status">Auto-managed</p>
		{:else}
			<p class="envelope-status manual">Manual</p>
		{/if}

		<!-- Comfort diagnostics -->
		{#if allDiagnostics.length > 0}
			<div class="diagnostics" role="status">
				{#each allDiagnostics as diagnostic (diagnostic.kind)}
					<p class="diagnostic" class:rapid={diagnostic.kind === 'rapid-lens-change'}>
						{diagnostic.message}
					</p>
				{/each}
			</div>
		{/if}

		<!-- Advanced disclosure -->
		<details class="advanced" bind:open={advancedOpen}>
			<summary>Advanced</summary>
			{#if advancedOpen && envelope}
				<p class="envelope-legend">automatic → blend → authored → blend → automatic</p>
				<div class="handle-fields">
					{#each ENVELOPE_HANDLE_NAMES as handle (handle)}
						{#key `${connection.id}:${direction}:${handle}`}								<EditorNumberField
									label={ENVELOPE_HANDLE_LABELS[handle]}
									value={handle === 'exitEnd' ? envelope.exitEnd : envelope[handle]}
									step={0.01}
									min={0}
									fractionDigits={2}
									oncommit={(v) => commitHandle(handle, v)}
								/>
						{/key}
					{/each}
				</div>
			{/if}
		</details>
	{/if}
</section>

<style>
	.framing-controls { display: flex; flex-direction: column; gap: 0.55rem; padding: 0.6rem; border: 1px solid #34313a; border-radius: 0.4rem; background: #17171f; }
	.empty-state { margin: 0; color: #918c84; font-size: 0.7rem; text-align: center; }
	.empty-state.legacy { color: #b7b1a4; }
	.preset-row { display: flex; gap: 0.3rem; }
	.preset-btn {
		flex: 1;
		padding: 0.35rem 0.3rem;
		border: 1px solid #3a3a46;
		border-radius: 0.3rem;
		background: #1a1a22;
		color: #b7b1a4;
		font: inherit;
		font-size: 0.68rem;
		cursor: pointer;
	}
	.preset-btn.active { border-color: #d6b35f; background: #2a2618; color: #fff2c7; }
	.preset-btn:disabled { opacity: 0.42; cursor: default; }
	.envelope-status { margin: 0; color: #8d887f; font-size: 0.65rem; text-align: center; }
	.envelope-status.manual { color: #c7a44a; }
	.diagnostics { display: flex; flex-direction: column; gap: 0.2rem; }
	.diagnostic {
		margin: 0;
		padding: 0.3rem 0.4rem;
		border: 1px solid #5a4a2a;
		border-radius: 0.28rem;
		background: #211e15;
		color: #e8d5a3;
		font-size: 0.65rem;
	}
	.diagnostic.rapid { border-color: #6e3a3a; background: #261515; color: #f1b1aa; }
	.advanced { border-top: 1px solid #2a2a33; padding-top: 0.4rem; }
	.advanced summary {
		color: #b7b1a4;
		font-size: 0.68rem;
		cursor: pointer;
	}
	.advanced summary:hover { color: #f4efe4; }
	.envelope-legend { margin: 0.3rem 0; color: #8d887f; font-size: 0.6rem; }
	.handle-fields { display: flex; flex-direction: column; gap: 0.35rem; }
</style>
