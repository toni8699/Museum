import { describe, expect, it, vi } from 'vitest';

import { runOrFail } from './validators-runner';

function makeSession() {
	return { setStatusMessage: vi.fn() };
}

describe('runOrFail', () => {
	it('returns the success variant when the validator returns ok=true', () => {
		const session = makeSession();
		const plan = runOrFail(session, () => ({
			ok: true as const,
			sourceNode: { id: 'a' },
			destinationNode: { id: 'b' }
		}));
		expect(plan).toEqual({
			ok: true,
			sourceNode: { id: 'a' },
			destinationNode: { id: 'b' }
		});
		expect(session.setStatusMessage).not.toHaveBeenCalled();
	});

	it('preserves success-variant fields so callers can destructure directly', () => {
		const session = makeSession();
		const plan = runOrFail(session, () => ({
			ok: true as const,
			nodeIds: ['paris-seat', 'salon-entry']
		}));
		expect(plan).not.toBeNull();
		// TS inference: `plan` narrowed to the success variant. The
		// destructuring pulls `nodeIds` directly; `ok` is left in the rest
		// object but does not appear in the destructured local.
		const { nodeIds } = plan as { ok: true; nodeIds: string[] };
		expect(nodeIds).toEqual(['paris-seat', 'salon-entry']);
	});

	it('posts the failure message via the session channel and returns null', () => {
		const session = makeSession();
		const plan = runOrFail(session, () => ({
			ok: false as const,
			code: 'self_connection' as const,
			message: 'A camera node cannot connect to itself'
		}));
		expect(plan).toBeNull();
		expect(session.setStatusMessage).toHaveBeenCalledTimes(1);
		expect(session.setStatusMessage).toHaveBeenCalledWith(
			'A camera node cannot connect to itself'
		);
	});

	it('re-posts a fresh failure message when failing twice with distinct messages', () => {
		const session = makeSession();
		runOrFail(session, () => ({
			ok: false as const,
			code: 'a' as const,
			message: 'first failure'
		}));
		runOrFail(session, () => ({
			ok: false as const,
			code: 'b' as const,
			message: 'second failure'
		}));
		expect(session.setStatusMessage).toHaveBeenNthCalledWith(1, 'first failure');
		expect(session.setStatusMessage).toHaveBeenNthCalledWith(2, 'second failure');
	});

	it('runs the validator exactly once per call', () => {
		const session = makeSession();
		const validator = vi.fn(() => ({ ok: true as const, foo: 1 }));
		runOrFail(session, validator);
		expect(validator).toHaveBeenCalledTimes(1);
	});

	it('accepts any object whose shape includes setStatusMessage (Pick<>)', () => {
		// The `ValidatorSessionChannel` is `Pick<EditorSessionState, 'setStatusMessage'>`
		// — ethers-with-anything test passes a plain object masquerading as
		// the channel to prove no other slots are required.
		const channel = { setStatusMessage: vi.fn() } as unknown as Parameters<
			typeof runOrFail
		>[0];
		const plan = runOrFail(channel, () => ({ ok: true as const, untouched: true }));
		expect(plan).toEqual({ ok: true, untouched: true });
	});
});
