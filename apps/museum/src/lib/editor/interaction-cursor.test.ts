import { describe, expect, it } from 'vitest';
import { computeCursor, type CursorInputs } from './interaction-cursor';

const base: CursorInputs = { state: 'Idle', hoverTargetId: null, isDraggingCurrently: false };

describe('computeCursor — truth table', () => {
	it('Idle + no hover + not dragging → default', () => {
		expect(computeCursor({ ...base })).toBe('default');
	});

	it('Idle + hover + not dragging → pointer', () => {
		expect(computeCursor({ ...base, hoverTargetId: 'p1' })).toBe('pointer');
	});

	it('Hover state + no hover target → default', () => {
		expect(computeCursor({ ...base, state: 'Hover' })).toBe('default');
	});

	it('Hover state + hover target → pointer', () => {
		expect(computeCursor({ ...base, state: 'Hover', hoverTargetId: 'p1' })).toBe('pointer');
	});

	it('Selected + no hover target → default', () => {
		expect(computeCursor({ ...base, state: 'Selected' })).toBe('default');
	});

	it('Selected + hover target on (unselected) placement → pointer', () => {
		expect(computeCursor({ ...base, state: 'Selected', hoverTargetId: 'p2' })).toBe('pointer');
	});

	it('Dragging + not currently dragging → default', () => {
		expect(computeCursor({ ...base, state: 'Dragging', isDraggingCurrently: false })).toBe(
			'default'
		);
	});

	it('Dragging + isDraggingCurrently true → grabbing', () => {
		expect(computeCursor({ ...base, state: 'Dragging', isDraggingCurrently: true })).toBe(
			'grabbing'
		);
	});

	it('any state + isDraggingCurrently true → grabbing (cursor wins)', () => {
		expect(
			computeCursor({ state: 'Idle', hoverTargetId: 'p1', isDraggingCurrently: true })
		).toBe('grabbing');
		expect(
			computeCursor({ state: 'Selected', hoverTargetId: null, isDraggingCurrently: true })
		).toBe('grabbing');
	});
});
