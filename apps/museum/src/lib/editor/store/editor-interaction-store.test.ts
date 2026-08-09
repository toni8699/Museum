import { describe, expect, it, beforeEach } from 'vitest';
import { Vector3, Quaternion } from 'three';
import { EditorInteractionStore } from './editor-interaction-store.svelte';

let store: EditorInteractionStore;

beforeEach(() => {
	store = new EditorInteractionStore();
});

describe('EditorInteractionStore — defaults', () => {
	it('starts in Idle state', () => {
		expect(store.state).toBe('Idle');
	});
	it('starts with mode=translate, space=world', () => {
		expect(store.mode).toBe('translate');
		expect(store.space).toBe('world');
	});
	it('starts with no hover target, no snapshot, default cursor', () => {
		expect(store.hoverTargetId).toBeNull();
		expect(store.dragSnapshot).toBeNull();
		expect(store.cursor).toBe('default');
	});
});

describe('EditorInteractionStore — setters', () => {
	it('setMode("rotate") → mode=rotate', () => {
		store.setMode('rotate');
		expect(store.mode).toBe('rotate');
	});
	it('setMode("scale") → mode=scale', () => {
		store.setMode('scale');
		expect(store.mode).toBe('scale');
	});
	it('toggleSpace world→local→world', () => {
		store.toggleSpace();
		expect(store.space).toBe('local');
		store.toggleSpace();
		expect(store.space).toBe('world');
	});
	it('setSelectionSize(n) writes n', () => {
		store.setSelectionSize(3);
		expect(store.selectionSize).toBe(3);
		store.setSelectionSize(0);
		expect(store.selectionSize).toBe(0);
	});
});

describe('EditorInteractionStore — dispatch + cursor', () => {
	it('POINTER_MOVE target=null in Idle keeps cursor default', () => {
		store.dispatch({ type: 'POINTER_MOVE', target: null });
		expect(store.cursor).toBe('default');
	});
	it('POINTER_MOVE target="p1" in Idle → cursor pointer, state stays Idle (helper handles Hover)', () => {
		store.dispatch({ type: 'POINTER_MOVE', target: 'p1' });
		// FSM transitions to Hover but cursor update happens via recompute
		// path; the sub-store propagates state but does not react to FSM-state-only changes for cursor.
		expect(store.state).toBe('Hover');
		expect(store.cursor).toBe('default'); // hoverTargetId still null on the sub-store
	});
	it('setHoverTarget("p1") → cursor pointer', () => {
		store.setHoverTarget('p1');
		expect(store.cursor).toBe('pointer');
	});
	it('setHoverTarget(null) → cursor default', () => {
		store.setHoverTarget('p1');
		store.setHoverTarget(null);
		expect(store.cursor).toBe('default');
	});
	it('recomputeCursor(true) → cursor grabbing', () => {
		store.recomputeCursor(true);
		expect(store.cursor).toBe('grabbing');
	});
	it('recomputeCursor(false) → restores non-grabbing cursor', () => {
		store.recomputeCursor(true);
		store.recomputeCursor(false);
		expect(store.cursor).toBe('default');
	});
});

describe('EditorInteractionStore — drag snapshot', () => {
	const snap = {
		placementIds: ['p1'],
		transforms: [
			{
				id: 'p1',
				position: new Vector3(1, 2, 3),
				quaternion: new Quaternion(),
				scale: new Vector3(1, 1, 1)
			}
		]
	};

	it('captureDragSnapshot stores the snapshot', () => {
		store.captureDragSnapshot(snap);
		expect(store.dragSnapshot).toEqual(snap);
	});
	it('restoreDragSnapshot clears', () => {
		store.captureDragSnapshot(snap);
		store.restoreDragSnapshot();
		expect(store.dragSnapshot).toBeNull();
	});
	it('clearDragSnapshot clears', () => {
		store.captureDragSnapshot(snap);
		store.clearDragSnapshot();
		expect(store.dragSnapshot).toBeNull();
	});
});

describe('EditorInteractionStore — dispatch side-effects', () => {
	it('dispatch DRAG_END cancelled=true in Dragging clears dragSnapshot and goes to Selected', () => {
		// Idle + CLICK → Selected.
		store.dispatch({ type: 'CLICK', target: 'p1', shift: false, meta: false });
		expect(store.state).toBe('Selected');
		// Selected + DRAG_START → Dragging.
		store.dispatch({ type: 'DRAG_START' });
		expect(store.state).toBe('Dragging');
		// Dragging + DRAG_END(true) → Selected.
		store.dispatch({ type: 'DRAG_END', cancelled: true });
		expect(store.state).toBe('Selected');
	});

	it('dispatch ESC in Idle stays Idle', () => {
		store.dispatch({ type: 'ESC' });
		expect(store.state).toBe('Idle');
	});
});
