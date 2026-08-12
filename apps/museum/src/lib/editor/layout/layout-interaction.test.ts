import { describe, expect, it } from 'vitest';

import {
	addPolygonPoint,
	beginLayoutObjectDrag,
	cancelLayoutObjectDrag,
	cancelLayoutPendingObject,
	beginRectangle,
	clearLayoutDraft,
	createLayoutInteractionState,
	LAYOUT_WALL_BEND_DRAG_THRESHOLD_PX,
	removeLastPolygonPoint,
	selectLayoutInteriorAnchor,
	selectLayoutObject,
	selectLayoutOpening,
	selectLayoutWall,
	selectedLayoutRoomId,
	shouldBeginWallBend,
	rectanglePoints,
	setLayoutDraftTool,
	setLayoutPendingObjectKind,
	setLayoutViewMode,
	updateLayoutObjectDrag,
	updateLayoutPendingObject,
	updateRectangle
} from './layout-interaction';

describe('layout interaction', () => {
	it('creates rectangle points from drag corners', () => {
		const state = createLayoutInteractionState();
		setLayoutDraftTool(state, 'rectangle');
		beginRectangle(state, [3, 4]);
		updateRectangle(state, [-1, 1]);

		expect(rectanglePoints(state)).toEqual([
			[3, 4],
			[-1, 4],
			[-1, 1],
			[3, 1]
		]);
	});

	it('accumulates polygon points and clears draft when switching views', () => {
		const state = createLayoutInteractionState();
		setLayoutDraftTool(state, 'polygon');
		addPolygonPoint(state, [0, 0]);
		addPolygonPoint(state, [4, 0]);
		expect(state.polygonPoints).toEqual([[0, 0], [4, 0]]);

		removeLastPolygonPoint(state);
		expect(state.polygonPoints).toEqual([[0, 0]]);

		setLayoutViewMode(state, '3d');
		expect(state.polygonPoints).toEqual([]);
		expect(state.rectangleStart).toBeNull();
	});

	it('tracks mutually exclusive room, wall, opening, and interior-anchor selections', () => {
		const state = createLayoutInteractionState();
		selectLayoutWall(state, 'room-a', 'wall-a');
		expect(state.selection).toEqual({ kind: 'wall', roomId: 'room-a', segmentId: 'wall-a' });
		expect(selectedLayoutRoomId(state)).toBe('room-a');
		selectLayoutOpening(state, 'room-a', 'wall-a', 'opening-a');
		expect(state.selection).toEqual({ kind: 'opening', roomId: 'room-a', segmentId: 'wall-a', openingId: 'opening-a' });
		selectLayoutInteriorAnchor(state, 'room-a', 'wall-a', 'wall-a:anchor:1');
		expect(state.selection).toEqual({
			kind: 'interiorAnchor',
			roomId: 'room-a',
			segmentId: 'wall-a',
			anchorId: 'wall-a:anchor:1'
		});
		expect(selectedLayoutRoomId(state)).toBe('room-a');
	});

	it('clears partial drafts explicitly', () => {
		const state = createLayoutInteractionState();
		beginRectangle(state, [0, 0]);
		updateRectangle(state, [2, 2]);
		clearLayoutDraft(state);
		expect(rectanglePoints(state)).toBeNull();
	});

	it('starts a wall bend only after the screen drag threshold', () => {
		const origin: [number, number] = [100, 100];
		expect(shouldBeginWallBend(origin, [103, 100])).toBe(false);
		expect(shouldBeginWallBend(origin, [104, 100])).toBe(true);
		expect(shouldBeginWallBend(origin, [100, 104])).toBe(true);
		expect(LAYOUT_WALL_BEND_DRAG_THRESHOLD_PX).toBe(4);
	});

	it('arms layout-local object ghosts and clears them when switching tools', () => {
		const state = createLayoutInteractionState();
		setLayoutDraftTool(state, 'object');
		expect(state.pendingObject).toMatchObject({ kind: 'box', dimensions: [1, 1, 1], valid: false });
		setLayoutPendingObjectKind(state, 'plane');
		updateLayoutPendingObject(state, [2, 0.005, 3], 'room-a');
		expect(state.pendingObject).toMatchObject({ kind: 'plane', position: [2, 0.005, 3], roomId: 'room-a', valid: true });
		cancelLayoutPendingObject(state);
		expect(state.tool).toBe('select');
		expect(state.pendingObject).toBeNull();
	});

	it('keeps object drag transient and snaps only X/Z', () => {
		const state = createLayoutInteractionState();
		selectLayoutObject(state, 'object-a');
		expect(selectedLayoutRoomId(state)).toBeNull();
		beginLayoutObjectDrag(state, 'object-a', [1, 2, 3]);
		updateLayoutObjectDrag(state, [1.12, 3.14], true);
		expect(state.objectDrag?.candidatePosition).toEqual([1, 2, 3.25]);
		cancelLayoutObjectDrag(state);
		expect(state.objectDrag).toBeNull();
	});
});
