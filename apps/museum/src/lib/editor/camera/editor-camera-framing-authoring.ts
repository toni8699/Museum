/**
 * P1.6 — Camera 3D framing authoring: pure product constants and authoring model.
 *
 * This module owns named presets, lens conversion, envelope mirroring, handle
 * clamping, and comfort diagnostics. It imports shared motion APIs but no
 * Svelte, store, or Three scene objects. The UI binds to these pure helpers;
 * no policy lives in Svelte components.
 */

import { CAMERA_FOV } from '$lib/types/scene';
import type { CameraFramingEnvelope } from '$lib/content/scene';

// ---------------------------------------------------------------------------
// Focus-timing presets
// ---------------------------------------------------------------------------

/**
 * Named presets use normalized edge-local distance progress, not spline
 * parameter or wall-clock percentage.
 */
export const CAMERA_FOCUS_TIMING_PRESETS = {
	early: { enterStart: 0.05, enterEnd: 0.2, exitStart: 1, exitEnd: 1 },
	centered: { enterStart: 0.25, enterEnd: 0.5, exitStart: 1, exitEnd: 1 },
	full: { enterStart: 0, enterEnd: 0, exitStart: 1, exitEnd: 1 }
} as const;

export type FocusTimingPresetName = keyof typeof CAMERA_FOCUS_TIMING_PRESETS;

export const FOCUS_TIMING_PRESET_LABELS: Record<FocusTimingPresetName, string> = {
	early: 'Early',
	centered: 'Centered',
	full: 'Full Move'
} as const;

export const FOCUS_TIMING_PRESET_ORDER: readonly FocusTimingPresetName[] = [
	'early',
	'centered',
	'full'
] as const;

/**
 * The "centered" preset is the first-key seed passed to
 * `createAutoManagedFramingEnvelope`. The reducer expands it so the first key
 * reaches full authored influence and keeps `exitEnd = 1`.
 */
export const CENTERED_SEED: CameraFramingEnvelope =
	CAMERA_FOCUS_TIMING_PRESETS.centered;

// ---------------------------------------------------------------------------
// Lens presets
// ---------------------------------------------------------------------------

const LENS_SENSOR_HEIGHT_MM = 24;

export type LensPresetName = 'wide' | 'standard' | 'tight';

export type LensPreset = {
	readonly name: LensPresetName;
	readonly label: string;
	readonly focalLengthMm: number;
	readonly verticalFovDegrees: number;
};

function focalLengthToVerticalFov(focalLengthMm: number): number {
	return (
		(2 * Math.atan(LENS_SENSOR_HEIGHT_MM / (2 * focalLengthMm)) * 180) /
		Math.PI
	);
}

export const CAMERA_LENS_PRESETS: readonly LensPreset[] = [
	{
		name: 'wide',
		label: '24 mm Wide',
		focalLengthMm: 24,
		verticalFovDegrees: focalLengthToVerticalFov(24)
	},
	{
		name: 'standard',
		label: '50 mm Standard',
		focalLengthMm: 50,
		verticalFovDegrees: focalLengthToVerticalFov(50)
	},
	{
		name: 'tight',
		label: '85 mm Tight',
		focalLengthMm: 85,
		verticalFovDegrees: focalLengthToVerticalFov(85)
	}
] as const;

/** Convert focal length in mm to vertical FOV in degrees (full-frame, 24 mm sensor height). */
export function focalLengthMmToFovDegrees(focalLengthMm: number): number {
	if (!Number.isFinite(focalLengthMm) || focalLengthMm <= 0) {
		throw new Error('Focal length must be a positive finite number');
	}
	const fov = focalLengthToVerticalFov(focalLengthMm);
	if (fov < CAMERA_FOV.min || fov > CAMERA_FOV.max) {
		throw new Error(
			`Focal length ${focalLengthMm} mm produces FOV ${fov.toFixed(2)}° outside the supported range`
		);
	}
	return fov;
}

/** Match a FOV value against known lens presets (within 0.1° tolerance). */
export function findMatchingLensPreset(
	fovDegrees: number
): LensPreset | null {
	for (const preset of CAMERA_LENS_PRESETS) {
		if (Math.abs(fovDegrees - preset.verticalFovDegrees) < 0.1) {
			return preset;
		}
	}
	return null;
}

/** FOV copy: "Larger FOV is wider / zoomed out. Smaller FOV is tighter / zoomed in." */
export const FOV_COPY = {
	largerWider: 'Larger FOV is wider / zoomed out.',
	smallerTighter: 'Smaller FOV is tighter / zoomed in.'
} as const;

// ---------------------------------------------------------------------------
// Envelope mirroring (forward ↔ reverse)
// ---------------------------------------------------------------------------

/** Mirror an envelope for the opposite direction. Involutive: mirror(mirror(e)) === e. */
export function mirrorFramingEnvelope(
	envelope: CameraFramingEnvelope
): CameraFramingEnvelope {
	return {
		enterStart: 1 - envelope.exitEnd,
		enterEnd: 1 - envelope.exitStart,
		exitStart: 1 - envelope.enterEnd,
		exitEnd: 1 - envelope.enterStart
	};
}

/**
 * Mirroring is involutive: mirror(mirror(e)) ≈ e.
 * Uses epsilon comparison to tolerate IEEE 754 rounding.
 */
export function mirrorFramingEnvelopeInvolutory(
	envelope: CameraFramingEnvelope
): boolean {
	const mirrored = mirrorFramingEnvelope(envelope);
	const doubleMirrored = mirrorFramingEnvelope(mirrored);
	const eps = 1e-9;
	return (
		Math.abs(envelope.enterStart - doubleMirrored.enterStart) < eps &&
		Math.abs(envelope.enterEnd - doubleMirrored.enterEnd) < eps &&
		Math.abs(envelope.exitStart - doubleMirrored.exitStart) < eps &&
		Math.abs(envelope.exitEnd - doubleMirrored.exitEnd) < eps
	);
}

// ---------------------------------------------------------------------------
// Handle clamping
// ---------------------------------------------------------------------------

/**
 * Canonical ordered handle names in the Advanced disclosure.
 */
export const ENVELOPE_HANDLE_NAMES = [
	'enterStart',
	'enterEnd',
	'exitStart',
	'exitEnd'
] as const;

export type EnvelopeHandleName = (typeof ENVELOPE_HANDLE_NAMES)[number];

export const ENVELOPE_HANDLE_LABELS: Record<EnvelopeHandleName, string> = {
	enterStart: 'Enter start',
	enterEnd: 'Full focus',
	exitStart: 'Resume automatic',
	exitEnd: 'Automatic by'
} as const;

/**
 * Clamped ordered-envelope predicate. All bounds must be finite, within [0, 1],
 * and non-decreasing.
 */
export function isClampedOrderedEnvelope(
	envelope: CameraFramingEnvelope
): boolean {
	return (
		Number.isFinite(envelope.enterStart) &&
		Number.isFinite(envelope.enterEnd) &&
		Number.isFinite(envelope.exitStart) &&
		Number.isFinite(envelope.exitEnd) &&
		envelope.enterStart >= 0 &&
		envelope.enterStart <= envelope.enterEnd &&
		envelope.enterEnd <= envelope.exitStart &&
		envelope.exitStart <= envelope.exitEnd &&
		envelope.exitEnd <= 1
	);
}

/**
 * Clamp a handle-dragged envelope to legal bounds. Returns null when the
 * resulting envelope is invalid (should not commit).
 */
export function clampEnvelopeHandle(
	current: CameraFramingEnvelope,
	handle: EnvelopeHandleName,
	value: number
): CameraFramingEnvelope | null {
	if (!Number.isFinite(value) || value < 0 || value > 1) return null;

	const next = { ...current, [handle]: value };
	if (!isClampedOrderedEnvelope(next)) return null;
	return next;
}

/**
 * When exitEnd === 1, the label reads "Authored through arrival".
 */
export function exitEndLabel(value: number): string {
	return value >= 1 ? 'Authored through arrival' : `${(value * 100).toFixed(0)}%`;
}

// ---------------------------------------------------------------------------
// Comfort policy
// ---------------------------------------------------------------------------

export const CAMERA_FRAMING_AUTHORING_COMFORT = {
	/** Non-zero envelope-handle drags clamp to at least this many FOV ramp seconds. */
	minFovRampSeconds: 0.6,
	/** Above this rate, show "Rapid lens change" diagnostic. */
	maxFovRateDegreesPerSecond: 30,
	/** Cap sampling at this many points per ramp for diagnostics. */
	diagnosticSamplesPerRamp: 96
} as const;

// ---------------------------------------------------------------------------
// Comfort diagnostics
// ---------------------------------------------------------------------------

export type CameraFramingDiagnosticKind =
	| 'rapid-lens-change'
	| 'parallax-turn-softened'
	| 'target-passes-close'
	| 'step-lens-change';

export type CameraFramingDiagnostic = {
	readonly kind: CameraFramingDiagnosticKind;
	/** Human-readable diagnostic message. */
	readonly message: string;
	/** Optional measured value for the diagnostic (e.g., rate in °/s). */
	readonly measuredValue?: number;
};

/**
 * Format a step (zero-width ramp) diagnostic.
 */
export function stepLensChangeDiagnostic(
	rampName: string
): CameraFramingDiagnostic {
	return {
		kind: 'step-lens-change',
		message: `Step lens change (${rampName})`
	};
}

/**
 * Format a rapid-FOV-rate diagnostic.
 */
export function rapidLensChangeDiagnostic(
	peakRate: number,
	rampTimeSeconds: number
): CameraFramingDiagnostic {
	return {
		kind: 'rapid-lens-change',
		message: `Rapid lens change — ${peakRate.toFixed(1)}°/s over ${rampTimeSeconds.toFixed(2)} s`,
		measuredValue: peakRate
	};
}

/**
 * Format a parallax/angular-limit guard diagnostic.
 */
export function parallaxTurnDiagnostic(): CameraFramingDiagnostic {
	return {
		kind: 'parallax-turn-softened',
		message: 'Parallax turn softened'
	};
}

/**
 * Format a target-proximity guard diagnostic.
 */
export function targetPassesCloseDiagnostic(): CameraFramingDiagnostic {
	return {
		kind: 'target-passes-close',
		message: 'Target passes close to camera path'
	};
}

/**
 * Deduplicate diagnostics by kind, keeping the first occurrence and order.
 * The UI keys diagnostic rows on `kind`, so duplicate kinds would collide in
 * a keyed `{#each}`; prop-provided and motion-sampled diagnostics may overlap
 * (e.g. both angular-rate limiting and a bypass produce a parallax hint).
 */
export function dedupeFramingDiagnostics(
	diagnostics: readonly CameraFramingDiagnostic[]
): CameraFramingDiagnostic[] {
	const seen = new Set<CameraFramingDiagnosticKind>();
	const result: CameraFramingDiagnostic[] = [];
	for (const diagnostic of diagnostics) {
		if (seen.has(diagnostic.kind)) continue;
		seen.add(diagnostic.kind);
		result.push(diagnostic);
	}
	return result;
}

/**
 * Compute ramp seconds for one ramp of the envelope using the exact motion
 * progress. Never use `progress × duration` — always route through
 * `cameraMotionProgressAtEdgeProgress(...) × motion.durationSeconds`.
 *
 * When the motion API is not available (pure UI path), this function accepts
 * pre-computed ramp seconds.
 */
export function computeRampSeconds(
	rampStart: number,
	rampEnd: number,
	edgeProgressToMotionProgress: (edgeProgress: number) => number,
	durationSeconds: number
): number {
	if (rampStart >= rampEnd) return 0;
	const startMotionProgress = edgeProgressToMotionProgress(rampStart);
	const endMotionProgress = edgeProgressToMotionProgress(rampEnd);
	return Math.abs(endMotionProgress - startMotionProgress) * durationSeconds;
}

/**
 * Clamp a dragged ramp bound so the ramp spans at least `minSeconds` of motion
 * time, while preserving the legal zero-width step (`proposed === fixed`).
 * `fixedEdgeProgress` is the other bound of the ramp (it does not move during
 * this drag); `proposedEdgeProgress` is the bound being dragged. The search
 * widens away from `fixed`, so the caller must pass bounds in the correct
 * ramp orientation. Returns the clamped edge progress.
 */
export function clampRampEdgeProgress(
	fixedEdgeProgress: number,
	proposedEdgeProgress: number,
	edgeProgressToMotionProgress: (edgeProgress: number) => number,
	durationSeconds: number,
	minSeconds: number
): number {
	if (!Number.isFinite(fixedEdgeProgress) || !Number.isFinite(proposedEdgeProgress)) {
		return proposedEdgeProgress;
	}
	if (proposedEdgeProgress === fixedEdgeProgress || durationSeconds <= 0) {
		return proposedEdgeProgress;
	}
	const rampSeconds = (start: number, end: number) => {
		const a = Math.min(start, end);
		const b = Math.max(start, end);
		return Math.abs(edgeProgressToMotionProgress(b) - edgeProgressToMotionProgress(a)) * durationSeconds;
	};
	if (rampSeconds(fixedEdgeProgress, proposedEdgeProgress) >= minSeconds) {
		return proposedEdgeProgress;
	}

	// Widen away from the fixed bound until the ramp meets the minimum.
	if (proposedEdgeProgress > fixedEdgeProgress) {
		// Free end moves right (widenRight): search [proposed, 1].
		let lo = proposedEdgeProgress;
		let hi = 1;
		for (let i = 0; i < 48; i += 1) {
			const mid = (lo + hi) / 2;
			if (rampSeconds(fixedEdgeProgress, mid) >= minSeconds) hi = mid;
			else lo = mid;
		}
		return hi;
	}

	// Free end moves left (widenLeft): search [0, proposed].
	let lo = 0;
	let hi = proposedEdgeProgress;
	for (let i = 0; i < 48; i += 1) {
		const mid = (lo + hi) / 2;
		if (rampSeconds(mid, fixedEdgeProgress) >= minSeconds) lo = mid;
		else hi = mid;
	}
	return lo;
}
