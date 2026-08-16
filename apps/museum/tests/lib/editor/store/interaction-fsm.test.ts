import { describe, expect, it } from 'vitest';
import {
	reduce,
	CommitDragSideEffect,
	RevertDragSideEffect,
	type FSMState,
	type FSMEvent
} from '$lib/editor/store/interaction-fsm';

const STATES: FSMState[] = ['Idle', 'Hover', 'Selected', 'Dragging'];

describe('reduce — transition matrix', () => {
	const cases: Array<{ state: FSMState; event: FSMEvent; next: FSMState }> = [
		// Idle row
		{ state: 'Idle', event: { type: 'POINTER_MOVE', target: null }, next: 'Idle' },
		{ state: 'Idle', event: { type: 'POINTER_MOVE', target: 'p1' }, next: 'Hover' },
		{
			state: 'Idle',
			event: { type: 'CLICK', target: 'p1', shift: false, meta: false },
			next: 'Selected'
		},
		{
			state: 'Idle',
			event: { type: 'CLICK', target: null, shift: false, meta: false },
			next: 'Idle'
		},

		// Hover row
		{ state: 'Hover', event: { type: 'POINTER_MOVE', target: null }, next: 'Idle' },
		{ state: 'Hover', event: { type: 'POINTER_MOVE', target: 'p1' }, next: 'Hover' },
		{
			state: 'Hover',
			event: { type: 'CLICK', target: 'p1', shift: false, meta: false },
			next: 'Selected'
		},
		{
			state: 'Hover',
			event: { type: 'CLICK', target: 'p1', shift: true, meta: false },
			next: 'Selected'
		},
		{
			state: 'Hover',
			event: { type: 'CLICK', target: 'p1', shift: false, meta: true },
			next: 'Selected'
		},
		{
			state: 'Hover',
			event: { type: 'CLICK', target: null, shift: false, meta: false },
			next: 'Idle'
		},
		{ state: 'Hover', event: { type: 'ESC' }, next: 'Idle' },

		// Idle/Hover/Selected — ACTIVE_TARGET_CHANGE rows (H1 S7)
		{
			state: 'Idle',
			event: { type: 'ACTIVE_TARGET_CHANGE', targetKey: 'scene:placement' },
			next: 'Selected'
		},
		{
			state: 'Idle',
			event: { type: 'ACTIVE_TARGET_CHANGE', targetKey: null },
			next: 'Idle'
		},
		{
			state: 'Hover',
			event: { type: 'ACTIVE_TARGET_CHANGE', targetKey: 'camera:node:pos' },
			next: 'Selected'
		},
		{
			state: 'Selected',
			event: { type: 'ACTIVE_TARGET_CHANGE', targetKey: null },
			next: 'Idle'
		},
		{
			state: 'Selected',
			event: { type: 'ACTIVE_TARGET_CHANGE', targetKey: 'camera:node:target' },
			next: 'Selected'
		},

		// Selected row
		{ state: 'Selected', event: { type: 'POINTER_MOVE', target: null }, next: 'Selected' },
		{ state: 'Selected', event: { type: 'POINTER_MOVE', target: 'p2' }, next: 'Selected' },
		{
			state: 'Selected',
			event: { type: 'CLICK', target: null, shift: false, meta: false },
			next: 'Idle'
		},
		{
			state: 'Selected',
			event: { type: 'CLICK', target: 'p1', shift: true, meta: false },
			next: 'Selected'
		},
		{
			state: 'Selected',
			event: { type: 'CLICK', target: 'p1', shift: false, meta: true },
			next: 'Selected'
		},
		{ state: 'Selected', event: { type: 'DRAG_START' }, next: 'Dragging' },
		{
			state: 'Selected',
			event: { type: 'DRAG_END', cancelled: false },
			next: 'Selected'
		},
		{
			state: 'Selected',
			event: { type: 'SELECTION_SET_CHANGE' },
			next: 'Selected'
		},
		{ state: 'Selected', event: { type: 'ESC' }, next: 'Idle' },

		// Dragging row
		{ state: 'Dragging', event: { type: 'DRAG_START' }, next: 'Dragging' },
		{
			state: 'Dragging',
			event: { type: 'DRAG_END', cancelled: false },
			next: 'Selected'
		},
		{
			state: 'Dragging',
			event: { type: 'DRAG_END', cancelled: true },
			next: 'Selected'
		},
		{
			state: 'Dragging',
			event: { type: 'ACTIVE_TARGET_CHANGE', targetKey: 'x' },
			next: 'Dragging'
		},
		{
			state: 'Dragging',
			event: { type: 'ACTIVE_TARGET_CHANGE', targetKey: null },
			next: 'Dragging'
		},
		{
			// H1 S7 — dead branch: a live gizmo drag never dispatches ESC
			// (host routes every cancel through DRAG_END { cancelled: true }).
			state: 'Dragging',
			event: { type: 'ESC' },
			next: 'Dragging'
		}
	];

	for (const { state, event, next } of cases) {
		it(`${state} + ${event.type}${describeEventExtras(event)} → ${next}`, () => {
			expect(reduce(state, event).state).toBe(next);
		});
	}
});

function describeEventExtras(event: FSMEvent): string {
	if (event.type === 'CLICK') {
		const bits = [
			event.target === null ? 'null' : `target=${event.target}`,
			event.shift ? 'shift' : 'no-shift',
			event.meta ? 'meta' : 'no-meta'
		];
		return ` (${bits.join(', ')})`;
	}
	if (event.type === 'POINTER_MOVE') {
		return ` (target=${event.target === null ? 'null' : event.target})`;
	}
	if (event.type === 'DRAG_END') {
		return ` (cancelled=${event.cancelled})`;
	}
	if (event.type === 'ACTIVE_TARGET_CHANGE') {
		return ` (targetKey=${event.targetKey === null ? 'null' : event.targetKey})`;
	}
	return '';
}

describe('reduce — invariants', () => {
	it('DRAG_END cancelled=true emits RevertDragSideEffect', () => {
		const { effects } = reduce('Dragging', { type: 'DRAG_END', cancelled: true });
		expect(effects).toHaveLength(1);
		expect(effects[0]).toBeInstanceOf(RevertDragSideEffect);
	});

	it('DRAG_END cancelled=false emits CommitDragSideEffect', () => {
		const { effects } = reduce('Dragging', { type: 'DRAG_END', cancelled: false });
		expect(effects).toHaveLength(1);
		expect(effects[0]).toBeInstanceOf(CommitDragSideEffect);
	});

	it('DRAG_END in non-Dragging state emits no side effects', () => {
		const { effects } = reduce('Selected', { type: 'DRAG_END', cancelled: false });
		expect(effects).toHaveLength(0);
	});

	it('ESC in Idle emits no side effects and stays Idle', () => {
		const { state, effects } = reduce('Idle', { type: 'ESC' });
		expect(state).toBe('Idle');
		expect(effects).toHaveLength(0);
	});

	it('ESC mid-drag is a dead branch (H1 S7): Dragging stays put, no effects', () => {
		// The host routes every gizmo cancel (Escape included) through the
		// adapter's cancel + DRAG_END { cancelled: true }, so the reducer
		// must never see ESC from a live drag; pin it as a no-op.
		const { state, effects } = reduce('Dragging', { type: 'ESC' });
		expect(state).toBe('Dragging');
		expect(effects).toHaveLength(0);
	});

	it('ACTIVE_TARGET_CHANGE outside Dragging emits no side effects', () => {
		const { effects } = reduce('Idle', { type: 'ACTIVE_TARGET_CHANGE', targetKey: 'k' });
		expect(effects).toHaveLength(0);
	});

	it('every event leaves the state field populated', () => {
		for (const state of STATES) {
			const { state: resultState } = reduce(state, { type: 'ESC' });
			expect(STATES).toContain(resultState);
		}
	});

	it('mode/space KEY_W/E/R/T/X do not mutate FSM state', () => {
		for (const state of STATES) {
			expect(reduce(state, { type: 'KEY_W' }).state).toBe(state);
			expect(reduce(state, { type: 'KEY_E' }).state).toBe(state);
			expect(reduce(state, { type: 'KEY_R' }).state).toBe(state);
			expect(reduce(state, { type: 'KEY_T' }).state).toBe(state);
			expect(reduce(state, { type: 'KEY_X' }).state).toBe(state);
		}
	});

	it('result.effects is an array for every event', () => {
		for (const state of STATES) {
			expect(Array.isArray(reduce(state, { type: 'ESC' }).effects)).toBe(true);
		}
	});
});
