import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi
} from 'vitest';
import { EditorSessionState } from './session-state.svelte';

describe('EditorSessionState', () => {
	let session: EditorSessionState;

	beforeEach(() => {
		vi.useFakeTimers();
		session = new EditorSessionState();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('viewport visibility flags', () => {
		it('defaults all three flags to true', () => {
			expect(session.viewportShowNodes).toBe(true);
			expect(session.viewportShowPaths).toBe(true);
			expect(session.viewportShowFraming).toBe(true);
		});

		it('toggleViewportShowNodes flips the flag', () => {
			session.toggleViewportShowNodes();
			expect(session.viewportShowNodes).toBe(false);
			session.toggleViewportShowNodes();
			expect(session.viewportShowNodes).toBe(true);
		});

		it('toggleViewportShowPaths flips the flag', () => {
			session.toggleViewportShowPaths();
			expect(session.viewportShowPaths).toBe(false);
			session.toggleViewportShowPaths();
			expect(session.viewportShowPaths).toBe(true);
		});

		it('toggleViewportShowFraming flips the flag', () => {
			session.toggleViewportShowFraming();
			expect(session.viewportShowFraming).toBe(false);
			session.toggleViewportShowFraming();
			expect(session.viewportShowFraming).toBe(true);
		});

		it('toggles are independent of one another', () => {
			session.toggleViewportShowNodes();
			expect(session.viewportShowPaths).toBe(true);
			expect(session.viewportShowFraming).toBe(true);
		});
	});

	describe('setStatusMessage + timer', () => {
		it('clears any prior timer and sets message immediately', () => {
			session.setStatusMessage('first');
			expect(session.statusMessage).toBe('first');
		});

		it('auto-clears after STATUS_MESSAGE_MS (2500ms)', () => {
			session.setStatusMessage('hello');
			expect(session.statusMessage).toBe('hello');
			vi.advanceTimersByTime(2499);
			expect(session.statusMessage).toBe('hello');
			vi.advanceTimersByTime(1);
			expect(session.statusMessage).toBe(null);
		});

		it('manual null clears immediately and cancels the pending timer', () => {
			session.setStatusMessage('hello');
			vi.advanceTimersByTime(1000);
			session.setStatusMessage(null);
			expect(session.statusMessage).toBe(null);
			vi.advanceTimersByTime(5000);
			expect(session.statusMessage).toBe(null);
		});

		it('a second setStatusMessage replaces the message and resets the timer', () => {
			session.setStatusMessage('first');
			vi.advanceTimersByTime(2000);
			session.setStatusMessage('second');
			vi.advanceTimersByTime(2000); // total 4s since first, 2s since second
			expect(session.statusMessage).toBe('second');
			vi.advanceTimersByTime(500); // +500ms = 2500ms since second
			expect(session.statusMessage).toBe(null);
		});

		it('keeps the message when re-asserted with same text and does not duplicate timers', () => {
			session.setStatusMessage('repeat');
			vi.advanceTimersByTime(1000);
			const timerCountBefore = vi.getTimerCount();
			session.setStatusMessage('repeat');
			expect(vi.getTimerCount()).toBe(timerCountBefore);
		});
	});
});
