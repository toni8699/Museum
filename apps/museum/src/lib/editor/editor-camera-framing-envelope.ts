import type { CameraFramingEnvelope } from '$lib/content/scene';

/**
 * P1.4 — pure auto-managed/manual framing-envelope editor policy.
 *
 * This module owns the "first key creates an auto-managed envelope" policy that
 * P1.6's framing authoring UI binds. It is deliberately pure: no store, history,
 * preview, Svelte, or Three.js imports. Callers own the state value; the reducer
 * never mutates inputs, never deletes a persisted envelope, and never invents a
 * key.
 *
 * Management is editor policy state, not motion or scene schema — nothing here
 * is serialized.
 */

export type CameraFramingEnvelopeManagement = 'auto' | 'manual';

export type CameraFramingEnvelopePolicyState = {
	envelope: CameraFramingEnvelope;
	management: CameraFramingEnvelopeManagement;
};

/** One local ordered-bounds predicate; never depends on codec error machinery. */
export function isOrderedCameraFramingEnvelope(
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

/** Keyframe progress must be a finite interior value strictly inside (0, 1). */
export function isValidCameraFramingEnvelopeKeyProgress(progress: number): boolean {
	return Number.isFinite(progress) && progress > 0 && progress < 1;
}

function assertOrderedEnvelope(envelope: CameraFramingEnvelope, label: string) {
	if (!isOrderedCameraFramingEnvelope(envelope)) {
		throw new Error(`${label} must be a finite, ordered CameraFramingEnvelope`);
	}
}

function assertKeyProgresses(keyProgresses: readonly number[]) {
	for (const progress of keyProgresses) {
		if (!isValidCameraFramingEnvelopeKeyProgress(progress)) {
			throw new Error(
				'Framing envelope key progresses must be finite and strictly inside (0, 1)'
			);
		}
	}
}

function envelopesEqual(
	left: CameraFramingEnvelope,
	right: CameraFramingEnvelope
) {
	return (
		left.enterStart === right.enterStart &&
		left.enterEnd === right.enterEnd &&
		left.exitStart === right.exitStart &&
		left.exitEnd === right.exitEnd
	);
}

/**
 * Slide the enter ramp earlier while preserving its width, so the earliest key
 * reaches the `w = 1` plateau without narrowing the ramp. The floor at 0 is the
 * only place the ramp may compress (bounds must stay non-negative).
 */
function expandEnterBounds(
	envelope: CameraFramingEnvelope,
	earliestKeyProgress: number
) {
	const enterWidth = envelope.enterEnd - envelope.enterStart;
	const enterEnd = Math.min(envelope.enterEnd, earliestKeyProgress);
	const enterStart = Math.max(
		0,
		Math.min(envelope.enterStart, enterEnd - enterWidth)
	);
	return { enterStart, enterEnd };
}

/**
 * Create the auto-managed envelope for the first key. The caller's valid seed
 * is expanded so the key lies on the `w = 1` plateau (`enterEnd ≤ key ≤
 * exitStart`) and `exitEnd` is pinned to 1. P1.6 owns the seed's tuned ramp
 * width; this reducer only ever expands it.
 */
export function createAutoManagedFramingEnvelope(
	firstKeyProgress: number,
	seed: CameraFramingEnvelope
): CameraFramingEnvelopePolicyState {
	if (!isValidCameraFramingEnvelopeKeyProgress(firstKeyProgress)) {
		throw new Error(
			'Framing envelope key progress must be finite and strictly inside (0, 1)'
		);
	}
	assertOrderedEnvelope(seed, 'Framing envelope seed');
	const { enterStart, enterEnd } = expandEnterBounds(seed, firstKeyProgress);
	return {
		envelope: {
			enterStart,
			enterEnd,
			exitStart: Math.max(seed.exitStart, firstKeyProgress),
			exitEnd: 1
		},
		management: 'auto'
	};
}

/**
 * Reconcile an auto-managed envelope against the current directional key
 * progresses. Auto changes expand only: enter-side bounds move earlier, exit
 * side later, and the plateau never narrows when keys move inward or are
 * deleted. Manual state is stable under every key addition, move, and deletion.
 * Empty-key cleanup is a caller decision — this never deletes or invents keys.
 */
export function updateFramingEnvelopeForKeyProgresses(
	state: CameraFramingEnvelopePolicyState,
	keyProgresses: readonly number[]
): CameraFramingEnvelopePolicyState {
	assertKeyProgresses(keyProgresses);
	assertOrderedEnvelope(state.envelope, 'Framing envelope policy state');
	if (state.management === 'manual' || keyProgresses.length === 0) return state;

	const earliest = Math.min(...keyProgresses);
	const latest = Math.max(...keyProgresses);
	const current = state.envelope;
	const { enterStart, enterEnd } = expandEnterBounds(current, earliest);
	const next: CameraFramingEnvelope = {
		enterStart,
		enterEnd,
		exitStart: Math.max(current.exitStart, latest),
		// Auto states pin exitEnd to 1 at creation; it only ever moves toward 1.
		exitEnd: Math.max(current.exitEnd, 1)
	};
	if (envelopesEqual(next, current)) return state;
	return { envelope: next, management: 'auto' };
}

/**
 * Apply a valid handle-edited envelope to either auto or manual state without
 * changing its management discriminator. Exact value equality is an
 * identity-preserving no-op. P1.6 must dispatch `markFramingEnvelopeManual`
 * from the handle gesture itself — never from a value-difference test.
 */
export function updateFramingEnvelopeHandleValue(
	state: CameraFramingEnvelopePolicyState,
	edited: CameraFramingEnvelope
): CameraFramingEnvelopePolicyState {
	assertOrderedEnvelope(edited, 'Framing envelope value');
	if (envelopesEqual(edited, state.envelope)) return state;
	return { envelope: { ...edited }, management: state.management };
}

/**
 * Explicit gesture-intent event: flips auto to manual even when no numeric
 * bound changed. Marking an already-manual state preserves identity.
 */
export function markFramingEnvelopeManual(
	state: CameraFramingEnvelopePolicyState
): CameraFramingEnvelopePolicyState {
	if (state.management === 'manual') return state;
	return { envelope: { ...state.envelope }, management: 'manual' };
}
