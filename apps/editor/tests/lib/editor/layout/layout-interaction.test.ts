import { describe, expect, it } from 'vitest';
import type { LayoutDocument } from '$lib/layout/layout-types';	import {
		addPolygonPoint,
		beginLayoutObjectDrag,
		beginLayoutObjectRotateDrag,
		beginLayoutRoomUnitDrag,
		cancelLayoutObjectDrag,
	cancelLayoutRoomUnitDrag,
	cancelLayoutPrimitiveDraft,
	beginRectangle,
	clearLayoutDraft,
	createLayoutInteractionState,
	LAYOUT_WALL_BEND_DRAG_THRESHOLD_PX,
	reconcileLayoutSelection,
	removeLastPolygonPoint,
	type LayoutSelection,
	selectLayoutInteriorAnchor,
	selectLayoutObject,
	selectLayoutOpening,
	selectLayoutWall,
	selectedLayoutRoomId,
	shouldBeginWallBend,
	rectanglePoints,
	setLayoutDraftTool,
	beginLayoutPrimitiveDraft,
	beginRoomEdit,
	primitiveDraftCenter,
	primitiveDraftFootprint,
	setLayoutViewMode,
	togglePlanViewportOption,
	updateLayoutObjectDrag,
	updateLayoutRoomUnitDrag,
	deriveArrangeTarget,
	resolveArrangeSceneModifiers,
	resolveArrangeScenePick,
	updateLayoutPrimitiveDraft,
	updateRoomEdit,
	updateRectangle
} from '$lib/editor/layout/layout-interaction';

describe('layout interaction', () => {
	it('toggles plan viewport options through the interaction module', () => {
		const state = createLayoutInteractionState();
		expect(state.planView.snapEnabled).toBe(true);
		expect(state.planView.gridEnabled).toBe(true);
		expect(state.planView.showTourOverlay).toBe(false);

		togglePlanViewportOption(state, 'snapEnabled');
		togglePlanViewportOption(state, 'gridEnabled');
		togglePlanViewportOption(state, 'showTourOverlay');

		expect(state.planView.snapEnabled).toBe(false);
		expect(state.planView.gridEnabled).toBe(false);
		expect(state.planView.showTourOverlay).toBe(true);
	});

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

	it('tracks explicit primitive gestures and clears them when cancelled', () => {
		const state = createLayoutInteractionState();
		setLayoutDraftTool(state, 'box');
		beginLayoutPrimitiveDraft(state, 'box', [1, 1], 'room-a');
		updateLayoutPrimitiveDraft(state, [3, 4], 'room-a');
		expect(state.primitiveDraft).toMatchObject({ kind: 'box', start: [1, 1], current: [3, 4], roomId: 'room-a', valid: true });
		expect(primitiveDraftFootprint(state.primitiveDraft!)).toEqual([[1, 1], [3, 1], [3, 4], [1, 4]]);
		cancelLayoutPrimitiveDraft(state);
		expect(state.tool).toBe('select');
		expect(state.primitiveDraft).toBeNull();
	});

	it('resolves radial centers from drag start and box centers from both corners', () => {
		expect(primitiveDraftCenter({ kind: 'sphere', start: [1, 2], current: [5, 6] })).toEqual([1, 2]);
		expect(primitiveDraftCenter({ kind: 'box', start: [1, 2], current: [5, 6] })).toEqual([3, 4]);
	});

	it('snaps vertices directly while translating whole rooms rigidly', () => {
		const state = createLayoutInteractionState();
		const original = [[0.1, 0.2], [1.2, 0.2], [1.2, 1.4], [0.1, 1.4]] as [number, number][];
		beginRoomEdit(state, 'room', 'room-a', [0.13, 0.17], original);
		updateRoomEdit(state, [0.62, 0.88], true);
		const moved = state.editing!.currentPoints;
		expect(moved[1]![0] - moved[0]![0]).toBeCloseTo(1.1);
		expect(moved[2]![1] - moved[1]![1]).toBeCloseTo(1.2);

		beginRoomEdit(state, 'vertex', 'room-a', original[0]!, original, 0);
		updateRoomEdit(state, [0.38, 0.62], true);
		expect(state.editing?.currentPoints[0]).toEqual([0.5, 0.5]);
		expect(state.editing?.currentPoints.slice(1)).toEqual(original.slice(1));
	});

	it('tracks rigid room translation and Shift rotation snapping', () => {
		const state = createLayoutInteractionState();
		beginLayoutRoomUnitDrag(state, 'room-a', 'translate', [0.1, 0.1], [2, 2]);
		updateLayoutRoomUnitDrag(state, [0.62, 0.38], true, true);
		expect(state.roomUnitDrag?.translation).toEqual([0.4, 0.4]);
		cancelLayoutRoomUnitDrag(state);
		beginLayoutRoomUnitDrag(state, 'room-a', 'rotate', [2, 1], [2, 2]);
		updateLayoutRoomUnitDrag(state, [1, 2], false, true, true);
		expect(state.roomUnitDrag?.yaw).toBeCloseTo(-Math.PI / 2);
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

	it('rotates a layout object around its world pivot via the Plan rotation-handle convention', () => {
		const state = createLayoutInteractionState();
		beginLayoutObjectRotateDrag(state, 'object-a', [2, 1, 2], [0, 0.3, 0], [2, 1], [2, 2]);
		expect(state.objectDrag?.mode).toBe('rotate');
		expect(state.objectDrag?.candidatePosition).toEqual([2, 1, 2]);
		// startAngle = atan2(-(1-2), 0) = +PI/2; pointer at (1,2) gives
		// atan2(-0, -1) = PI → yaw = PI/2.
		updateLayoutObjectDrag(state, [1, 2], false);
		expect(state.objectDrag?.candidateRotation).toEqual([0, 0.3 + Math.PI / 2, 0]);
		expect(state.objectDrag?.candidatePosition).toEqual([2, 1, 2]);
		cancelLayoutObjectDrag(state);
		expect(state.objectDrag).toBeNull();
	});

	it('snaps the layout-object rotate delta to 15° on Shift when angle snap is enabled', () => {
		const state = createLayoutInteractionState();
		beginLayoutObjectRotateDrag(state, 'object-a', [2, 1, 2], [0, 0, 0], [2, 1], [2, 2]);
		// Pointer at pointer-yaw 1 rad: raw yaw = 1 - PI/2 ≈ -0.5708 rad.
		updateLayoutObjectDrag(state, [2 + Math.cos(1), 2 - Math.sin(1)], false, true, true);
		expect(state.objectDrag?.candidateRotation[1]).toBeCloseTo(-Math.PI / 6, 6);
		// No Shift → raw delta.
		beginLayoutObjectRotateDrag(state, 'object-a', [2, 1, 2], [0, 0, 0], [2, 1], [2, 2]);
		updateLayoutObjectDrag(state, [2 + Math.cos(1), 2 - Math.sin(1)], false, false, true);
		expect(state.objectDrag?.candidateRotation[1]).toBeCloseTo(1 - Math.PI / 2, 6);
	});
});

describe('deriveArrangeTarget (P10 last-owner rule)', () => {
	const object = { kind: 'object', objectId: 'layout-object-1' } as const;
	const structural = { kind: 'room', roomId: 'room-a' } as const;
	const eligible = new Set(['layout-object-1']);

	it('activates the remembered layout owner only when its slot holds an eligible object', () => {
		expect(deriveArrangeTarget({ lastOwner: 'layout-object', layoutSelection: object, selectedPlacementIds: [], selectedClusterId: null, eligibleLayoutObjectIds: eligible }))
			.toEqual({ owner: 'layout-object', objectId: 'layout-object-1' });
		// Structural / stale layout selection → no target, never a Scene fallback.
		expect(deriveArrangeTarget({ lastOwner: 'layout-object', layoutSelection: structural, selectedPlacementIds: ['scene-1'], selectedClusterId: null }))
			.toBeNull();
		// Ineligible object (e.g. profile) → no target.
		expect(deriveArrangeTarget({ lastOwner: 'layout-object', layoutSelection: object, selectedPlacementIds: [], selectedClusterId: null, eligibleLayoutObjectIds: new Set() }))
			.toBeNull();
	});

	it('activates the remembered scene owner only when its selection is eligible', () => {
		expect(deriveArrangeTarget({ lastOwner: 'scene', layoutSelection: object, selectedPlacementIds: ['scene-1', 'scene-2'], selectedClusterId: null }))
			.toEqual({ owner: 'scene', ids: ['scene-1', 'scene-2'], primaryId: 'scene-2' });
		// Empty selection → no target even with a Layout object in memory.
		expect(deriveArrangeTarget({ lastOwner: 'scene', layoutSelection: object, selectedPlacementIds: [], selectedClusterId: null }))
			.toBeNull();
		// Clusters stay non-transformable in Plan.
		expect(deriveArrangeTarget({ lastOwner: 'scene', layoutSelection: structural, selectedPlacementIds: ['scene-1'], selectedClusterId: 'cluster-a' }))
			.toBeNull();
		// Ineligible scene members → no target.
		expect(deriveArrangeTarget({ lastOwner: 'scene', layoutSelection: structural, selectedPlacementIds: ['scene-1'], selectedClusterId: null, eligibleSceneEntityIds: new Set(['scene-2']) }))
			.toBeNull();
	});

	it('derives from the current slots when no owner is remembered (object first, then scene)', () => {
		expect(deriveArrangeTarget({ lastOwner: null, layoutSelection: object, selectedPlacementIds: ['scene-1'], selectedClusterId: null }))
			.toEqual({ owner: 'layout-object', objectId: 'layout-object-1' });
		expect(deriveArrangeTarget({ lastOwner: null, layoutSelection: structural, selectedPlacementIds: ['scene-1'], selectedClusterId: null }))
			.toEqual({ owner: 'scene', ids: ['scene-1'], primaryId: 'scene-1' });
		expect(deriveArrangeTarget({ lastOwner: null, layoutSelection: structural, selectedPlacementIds: [], selectedClusterId: null }))
			.toBeNull();
	});
});	describe('resolveArrangeSceneModifiers (P10 cross-owner modifier rule)', () => {
	it('keeps same-owner P2 modifier semantics', () => {
		// Same-owner shift-click → additive; cmd/ctrl → toggle.
		expect(resolveArrangeSceneModifiers({ switchingFromLayout: false, metaKey: false, ctrlKey: false, shiftKey: true }))
			.toEqual({ toggle: false, additive: true });
		expect(resolveArrangeSceneModifiers({ switchingFromLayout: false, metaKey: true, ctrlKey: false, shiftKey: false }))
			.toEqual({ toggle: true, additive: false });
		expect(resolveArrangeSceneModifiers({ switchingFromLayout: false, metaKey: false, ctrlKey: true, shiftKey: true }))
			.toEqual({ toggle: true, additive: false });
		expect(resolveArrangeSceneModifiers({ switchingFromLayout: false, metaKey: false, ctrlKey: false, shiftKey: false }))
			.toEqual({ toggle: false, additive: false });
	});

	it('suppresses additive/toggle when the pick switches owner from a layout target', () => {
		// Cross-owner shift-click replaces the active selection with the clicked
		// target — never adds across owners (plan §Selection).
		expect(resolveArrangeSceneModifiers({ switchingFromLayout: true, metaKey: false, ctrlKey: false, shiftKey: true }))
			.toEqual({ toggle: false, additive: false });
		expect(resolveArrangeSceneModifiers({ switchingFromLayout: true, metaKey: true, ctrlKey: false, shiftKey: false }))
			.toEqual({ toggle: false, additive: false });
		expect(resolveArrangeSceneModifiers({ switchingFromLayout: true, metaKey: true, ctrlKey: false, shiftKey: true }))
			.toEqual({ toggle: false, additive: false });
	});
});

describe('resolveArrangeScenePick (P10 cross-owner replacement)', () => {
	it('treats an already-selected member as unselected when switching owner from a layout target', () => {
		// Cross-owner click on a member of the remembered Scene selection must
		// replace with a single entity — never drag/extend the whole memory.
		expect(resolveArrangeScenePick({ switchingFromLayout: true, metaKey: false, ctrlKey: false, shiftKey: false, clickedAlreadySelected: true }))
			.toEqual({ toggle: false, additive: false, alreadySelected: false });
		expect(resolveArrangeScenePick({ switchingFromLayout: true, metaKey: true, ctrlKey: false, shiftKey: true, clickedAlreadySelected: true }))
			.toEqual({ toggle: false, additive: false, alreadySelected: false });
	});

	it('keeps the same-owner drag-the-selection semantics for an already-selected member', () => {
		expect(resolveArrangeScenePick({ switchingFromLayout: false, metaKey: false, ctrlKey: false, shiftKey: false, clickedAlreadySelected: true }))
			.toEqual({ toggle: false, additive: false, alreadySelected: true });
		expect(resolveArrangeScenePick({ switchingFromLayout: false, metaKey: false, ctrlKey: false, shiftKey: true, clickedAlreadySelected: true }))
			.toEqual({ toggle: false, additive: true, alreadySelected: true });
		expect(resolveArrangeScenePick({ switchingFromLayout: false, metaKey: false, ctrlKey: false, shiftKey: false, clickedAlreadySelected: false }))
			.toEqual({ toggle: false, additive: false, alreadySelected: false });
	});
});

describe('reconcileLayoutSelection', () => {
	function makeLayout(): LayoutDocument {
		return {
			units: 'meters',
			floors: [
				{
					id: 'floor-1',
					name: 'Floor 1',
					elevation: 0,
					height: 3,
					rooms: [
						{
							id: 'room-a',
							name: 'A',
							frame: { origin: [0, 0], yaw: 0 },
							boundary: {
								closed: true,
								segments: [
									{ id: 'wall-a', kind: 'line', start: [0, 0], end: [4, 0] },
									{
										id: 'wall-b',
										kind: 'auto-bezier',
										start: [4, 0],
										end: [4, 3],
										interiorAnchors: [{ id: 'anchor-1', point: [4, 1.5] }]
									}
								]
							},
							wallThickness: 0.2,
							floorThickness: 0.1,
							ceilingThickness: 0.1,
							openings: [
								{
									id: 'opening-1',
									segmentId: 'wall-a',
									kind: 'door',
									offset: 1,
									width: 1,
									height: 2.1,
									sillHeight: 0,
									profile: 'rectangular'
								}
							]
						}
					]
				}
			],
			objects: [
				{ id: 'object-1', kind: 'box', position: [1, 0, 1], rotation: [0, 0, 0], dimensions: [1, 1, 1] }
			]
		};
	}

	it('keeps valid selections unchanged and clears dead rooms/walls/objects', () => {
		const layout = makeLayout();

		expect(reconcileLayoutSelection({ kind: 'none' }, layout)).toEqual({ kind: 'none' });
		expect(reconcileLayoutSelection({ kind: 'room', roomId: 'room-a' }, layout)).toEqual({
			kind: 'room',
			roomId: 'room-a'
		});
		expect(reconcileLayoutSelection({ kind: 'wall', roomId: 'room-a', segmentId: 'wall-a' }, layout)).toEqual({
			kind: 'wall',
			roomId: 'room-a',
			segmentId: 'wall-a'
		});
		expect(
			reconcileLayoutSelection({ kind: 'object', objectId: 'object-1' }, layout)
		).toEqual({ kind: 'object', objectId: 'object-1' });

		// Deleted room / wall / object clear to none.
		expect(reconcileLayoutSelection({ kind: 'room', roomId: 'room-gone' }, layout)).toEqual({
			kind: 'none'
		});
		expect(
			reconcileLayoutSelection({ kind: 'wall', roomId: 'room-a', segmentId: 'wall-gone' }, layout)
		).toEqual({ kind: 'none' });
		expect(reconcileLayoutSelection({ kind: 'object', objectId: 'object-gone' }, layout)).toEqual({
			kind: 'none'
		});
	});

	it('demotes a deleted opening to its parent wall, then clears when the wall is gone', () => {
		const layout = makeLayout();
		const opening: LayoutSelection = {
			kind: 'opening',
			roomId: 'room-a',
			segmentId: 'wall-a',
			openingId: 'opening-1'
		};

		// Still present.
		expect(reconcileLayoutSelection(opening, layout)).toEqual(opening);

		// Opening deleted: demote to the surviving wall.
		const withoutOpening = makeLayout();
		withoutOpening.floors[0]!.rooms[0]!.openings = [];
		expect(reconcileLayoutSelection(opening, withoutOpening)).toEqual({
			kind: 'wall',
			roomId: 'room-a',
			segmentId: 'wall-a'
		});

		// Opening and wall both gone: clear.
		const withoutWall = makeLayout();
		withoutWall.floors[0]!.rooms[0]!.boundary.segments = withoutWall.floors[0]!.rooms[0]!.boundary.segments.filter(
			(segment) => segment.id !== 'wall-a'
		);
		expect(reconcileLayoutSelection(opening, withoutWall)).toEqual({ kind: 'none' });
	});

	it('demotes a deleted interior anchor to its parent wall', () => {
		const layout = makeLayout();
		const anchor: LayoutSelection = {
			kind: 'interiorAnchor',
			roomId: 'room-a',
			segmentId: 'wall-b',
			anchorId: 'anchor-1'
		};

		expect(reconcileLayoutSelection(anchor, layout)).toEqual(anchor);

		const withoutAnchor = makeLayout();
		const wallB = withoutAnchor.floors[0]!.rooms[0]!.boundary.segments[1]!;
		if (wallB.kind === 'auto-bezier') wallB.interiorAnchors = [];
		expect(reconcileLayoutSelection(anchor, withoutAnchor)).toEqual({
			kind: 'wall',
			roomId: 'room-a',
			segmentId: 'wall-b'
		});
	});
});
