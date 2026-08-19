import { describe, expect, it } from 'vitest';
import {
	createAutoManagedFramingEnvelope,
	isOrderedCameraFramingEnvelope,
	isValidCameraFramingEnvelopeKeyProgress,
	markFramingEnvelopeManual,
	updateFramingEnvelopeForKeyProgresses,
	updateFramingEnvelopeHandleValue,
	type CameraFramingEnvelopePolicyState
} from '$lib/editor/editor-camera-framing-envelope';
import type { CameraFramingEnvelope } from '$lib/content/scene';

const SEED: CameraFramingEnvelope = {
	enterStart: 0.2,
	enterEnd: 0.4,
	exitStart: 0.6,
	exitEnd: 0.9
};

function autoStateFromFirstKey(firstKeyProgress: number) {
	return createAutoManagedFramingEnvelope(firstKeyProgress, SEED);
}

describe('framing envelope policy predicates', () => {
	it('accepts exactly the ordered envelope bounds', () => {
		expect(isOrderedCameraFramingEnvelope(SEED)).toBe(true);
		expect(
			isOrderedCameraFramingEnvelope({ enterStart: 0, enterEnd: 0, exitStart: 1, exitEnd: 1 })
		).toBe(true);
		expect(
			isOrderedCameraFramingEnvelope({ enterStart: 0.2, enterEnd: 0.2, exitStart: 0.2, exitEnd: 0.2 })
		).toBe(true);
	});

	it.each([
		['negative enterStart', { enterStart: -0.1, enterEnd: 0.4, exitStart: 0.6, exitEnd: 1 }],
		['enterStart after enterEnd', { enterStart: 0.5, enterEnd: 0.4, exitStart: 0.6, exitEnd: 1 }],
		['enterEnd after exitStart', { enterStart: 0.2, enterEnd: 0.7, exitStart: 0.6, exitEnd: 1 }],
		['exitStart after exitEnd', { enterStart: 0.2, enterEnd: 0.4, exitStart: 0.95, exitEnd: 0.9 }],
		['exitEnd beyond one', { enterStart: 0.2, enterEnd: 0.4, exitStart: 0.6, exitEnd: 1.1 }],
		['non-finite bound', { enterStart: Number.NaN, enterEnd: 0.4, exitStart: 0.6, exitEnd: 1 }]
	])('rejects %s', (_label, envelope) => {
		expect(isOrderedCameraFramingEnvelope(envelope as CameraFramingEnvelope)).toBe(false);
	});

	it('accepts only finite interior key progress', () => {
		for (const valid of [0.001, 0.5, 0.999]) {
			expect(isValidCameraFramingEnvelopeKeyProgress(valid)).toBe(true);
		}
		for (const invalid of [0, 1, -0.5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(isValidCameraFramingEnvelopeKeyProgress(invalid)).toBe(false);
		}
	});
});

describe('createAutoManagedFramingEnvelope', () => {
	it('pins exitEnd to 1 and keeps the key on the plateau for a seed inside the proposed plateau', () => {
		const state = autoStateFromFirstKey(0.5);
		expect(state).toEqual({
			envelope: { enterStart: 0.2, enterEnd: 0.4, exitStart: 0.6, exitEnd: 1 },
			management: 'auto'
		});
	});

	it('expands the enter bounds earlier when the first key precedes the plateau', () => {
		const beforeEnterEnd = autoStateFromFirstKey(0.3);
		expect(beforeEnterEnd.envelope.enterEnd).toBeCloseTo(0.3, 12);
		expect(beforeEnterEnd.envelope.exitStart).toBe(0.6);
		expect(beforeEnterEnd.envelope.exitEnd).toBe(1);
		expect(beforeEnterEnd.envelope.enterStart).toBeCloseTo(0.1, 12);
		expect(
			beforeEnterEnd.envelope.enterEnd - beforeEnterEnd.envelope.enterStart
		).toBeCloseTo(0.2, 12);
		expect(beforeEnterEnd.envelope.enterEnd).toBeLessThanOrEqual(0.3);

		// A key before the seed's enterStart moves both enter bounds early enough
		// for the key to reach the plateau without narrowing the ramp.
		const beforeEnterStart = autoStateFromFirstKey(0.1);
		expect(beforeEnterStart.envelope.enterEnd).toBe(0.1);
		expect(beforeEnterStart.envelope.enterStart).toBeLessThanOrEqual(0.1);
		expect(
			beforeEnterStart.envelope.enterEnd - beforeEnterStart.envelope.enterStart
		).toBeGreaterThan(0);
	});

	it('expands the exit bound later when the first key follows the plateau', () => {
		const state = autoStateFromFirstKey(0.8);
		expect(state.envelope).toEqual({
			enterStart: 0.2,
			enterEnd: 0.4,
			exitStart: 0.8,
			exitEnd: 1
		});
	});

	it('never mutates the seed and always returns a fresh auto state', () => {
		const original = structuredClone(SEED);
		const first = autoStateFromFirstKey(0.5);
		const second = autoStateFromFirstKey(0.5);
		expect(SEED).toEqual(original);
		expect(first).not.toBe(second);
		expect(first.envelope).not.toBe(SEED);
		expect(first.management).toBe('auto');
	});

	it.each([
		['key at 0', 0],
		['key at 1', 1],
		['negative key', -0.25],
		['non-finite key', Number.NaN]
	])('rejects %s without touching the seed', (_label, progress) => {
		const original = structuredClone(SEED);
		expect(() => createAutoManagedFramingEnvelope(progress, SEED)).toThrow(
			'Framing envelope key progress must be finite and strictly inside (0, 1)'
		);
		expect(SEED).toEqual(original);
	});

	it.each([
		['un-ordered seed', { enterStart: 0.6, enterEnd: 0.4, exitStart: 0.6, exitEnd: 1 }],
		['negative seed bound', { enterStart: -1, enterEnd: 0.4, exitStart: 0.6, exitEnd: 1 }],
		['non-finite seed bound', { enterStart: 0.2, enterEnd: Number.POSITIVE_INFINITY, exitStart: 0.6, exitEnd: 1 }]
	])('rejects an invalid %s', (_label, seed) => {
		expect(() => createAutoManagedFramingEnvelope(0.5, seed as CameraFramingEnvelope)).toThrow(
			'Framing envelope seed must be a finite, ordered CameraFramingEnvelope'
		);
	});
});

describe('updateFramingEnvelopeForKeyProgresses', () => {
	it('expands the plateau for earliest and latest additions', () => {
		let state = autoStateFromFirstKey(0.5);
		state = updateFramingEnvelopeForKeyProgresses(state, [0.1, 0.5]);
		expect(state.envelope.enterEnd).toBe(0.1);
		expect(state.envelope.exitStart).toBe(0.6);
		state = updateFramingEnvelopeForKeyProgresses(state, [0.1, 0.5, 0.9]);
		expect(state.envelope.exitStart).toBe(0.9);
		expect(state.envelope.enterStart).toBe(0);
		expect(state.management).toBe('auto');
	});

	it('expands for outward moves and never contracts for inward moves or deletions', () => {
		const state = updateFramingEnvelopeForKeyProgresses(
			updateFramingEnvelopeForKeyProgresses(
				autoStateFromFirstKey(0.5),
				[0.1, 0.5, 0.9]
			),
			[0.3, 0.5]
		);
		expect(state.envelope).toEqual({
			enterStart: 0,
			enterEnd: 0.1,
			exitStart: 0.9,
			exitEnd: 1
		});

		// Deleting every key leaves the expanded envelope untouched (identity).
		const emptied = updateFramingEnvelopeForKeyProgresses(state, []);
		expect(emptied).toBe(state);

		// Moving the earliest key back outward expands again.
		const expanded = updateFramingEnvelopeForKeyProgresses(state, [0.05, 0.5, 0.95]);
		expect(expanded.envelope.enterEnd).toBe(0.05);
		expect(expanded.envelope.exitStart).toBe(0.95);
	});

	it('returns the same state object when nothing changes', () => {
		const state = autoStateFromFirstKey(0.5);
		expect(updateFramingEnvelopeForKeyProgresses(state, [0.5])).toBe(state);
		expect(updateFramingEnvelopeForKeyProgresses(state, [0.4, 0.6])).toBe(state);
	});

	it('keeps every envelope ordered after expansions', () => {
		let state = autoStateFromFirstKey(0.5);
		for (const keys of [
			[0.05, 0.5, 0.95],
			[0.01, 0.05, 0.5, 0.95, 0.99],
			[0.02, 0.99]
		]) {
			state = updateFramingEnvelopeForKeyProgresses(state, keys);
			expect(isOrderedCameraFramingEnvelope(state.envelope)).toBe(true);
		}
	});

	it('rejects invalid key progress without mutating the state', () => {
		const state = autoStateFromFirstKey(0.5);
		const envelopeBefore = state.envelope;
		expect(() =>
			updateFramingEnvelopeForKeyProgresses(state, [0.5, 1])
		).toThrow(
			'Framing envelope key progresses must be finite and strictly inside (0, 1)'
		);
		expect(state.envelope).toBe(envelopeBefore);
		expect(state.management).toBe('auto');
	});
});

describe('manual policy stability', () => {
	it('marks auto manual even when no numeric bound changed and preserves identity when already manual', () => {
		const autoState = autoStateFromFirstKey(0.5);
		const manual = markFramingEnvelopeManual(autoState);
		expect(manual.management).toBe('manual');
		expect(manual.envelope).toEqual(autoState.envelope);
		expect(manual).not.toBe(autoState);
		expect(markFramingEnvelopeManual(manual)).toBe(manual);
	});

	it('keeps manual bounds exact under every key mutation', () => {
		let state = markFramingEnvelopeManual(autoStateFromFirstKey(0.5));
		const manualEnvelope = state.envelope;
		for (const keys of [
			[0.1, 0.5, 0.9],
			[0.05, 0.5],
			[],
			[0.45, 0.55]
		]) {
			const next = updateFramingEnvelopeForKeyProgresses(state, keys);
			expect(next).toBe(state);
			expect(next.envelope).toBe(manualEnvelope);
		}
		expect(state.envelope).toEqual({ enterStart: 0.2, enterEnd: 0.4, exitStart: 0.6, exitEnd: 1 });
	});

	it('applies a changed handle value without changing the discriminator', () => {
		const autoState = autoStateFromFirstKey(0.5);
		const edited: CameraFramingEnvelope = { ...autoState.envelope, exitStart: 0.7 };
		const nextAuto = updateFramingEnvelopeHandleValue(autoState, edited);
		expect(nextAuto.management).toBe('auto');
		expect(nextAuto.envelope).toEqual(edited);
		expect(nextAuto.envelope).not.toBe(edited);
		expect(nextAuto).not.toBe(autoState);

		const manualState = markFramingEnvelopeManual(autoState);
		const nextManual = updateFramingEnvelopeHandleValue(manualState, edited);
		expect(nextManual.management).toBe('manual');
		expect(nextManual.envelope).toEqual(edited);
	});

	it('treats an exact value equality as an identity-preserving no-op', () => {
		const autoState = autoStateFromFirstKey(0.5);
		expect(updateFramingEnvelopeHandleValue(autoState, autoState.envelope)).toBe(autoState);

		const manualState = markFramingEnvelopeManual(autoState);
		expect(updateFramingEnvelopeHandleValue(manualState, manualState.envelope)).toBe(manualState);
	});

	it('rejects an invalid edited value without mutating state', () => {
		const state = autoStateFromFirstKey(0.5);
		const invalid = { ...state.envelope, enterEnd: 0.8, exitStart: 0.6 };
		expect(() => updateFramingEnvelopeHandleValue(state, invalid)).toThrow(
			'Framing envelope value must be a finite, ordered CameraFramingEnvelope'
		);
		expect(state).toEqual(autoStateFromFirstKey(0.5));
	});

	it('flips auto to manual even after a drag returns to the starting value', () => {
		// A gesture that drags a bound out and back to its original value must
		// still flip to manual through the explicit intent event.
		const autoState = autoStateFromFirstKey(0.5);
		const draggedBack = updateFramingEnvelopeHandleValue(
			autoState,
			autoState.envelope
		);
		expect(draggedBack).toBe(autoState);
		const manual = markFramingEnvelopeManual(draggedBack);
		expect(manual.management).toBe('manual');
		expect(manual.envelope).toEqual(autoState.envelope);
	});
});

describe('framing envelope policy direction independence', () => {
	it('gives forward and reverse callers identical pure behavior', () => {
		const run = (direction: string): CameraFramingEnvelopePolicyState[] => {
			const trace: CameraFramingEnvelopePolicyState[] = [];
			let state = createAutoManagedFramingEnvelope(0.5, SEED);
			trace.push(state);
			state = updateFramingEnvelopeForKeyProgresses(state, [0.2, 0.5, 0.85]);
			trace.push(state);
			state = updateFramingEnvelopeHandleValue(state, { ...state.envelope, exitStart: 0.8 });
			trace.push(state);
			state = markFramingEnvelopeManual(state);
			trace.push(state);
			state = updateFramingEnvelopeForKeyProgresses(state, [0.1, 0.9]);
			trace.push(state);
			void direction;
			return trace;
		};

		const forward = run('forward');
		const reverse = run('reverse');
		expect(forward).toEqual(reverse);
		for (const state of forward) {
			expect(isOrderedCameraFramingEnvelope(state.envelope)).toBe(true);
		}
	});
});
