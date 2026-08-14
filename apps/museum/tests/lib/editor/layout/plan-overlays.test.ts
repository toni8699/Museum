import { describe, expect, it } from 'vitest';
import { g2AutoBezierDocument, g2LineRectangleDocument } from '../../layout/__fixtures__/layout-g2-fixtures';
import { buildLayoutPreviewModel } from '$lib/editor/layout/layout-mesh-factory';
import {
	beginLayoutPrimitiveDraft,
	beginLayoutRoomUnitDrag,
	beginRectangle,
	createLayoutInteractionState,
	selectLayoutInteriorAnchor,
	selectLayoutRoom,
	selectLayoutWall,
	setLayoutDraftTool,
	updateLayoutPrimitiveDraft,
	updateLayoutRoomUnitDrag,
	updateRectangle
} from '$lib/editor/layout/layout-interaction';
import { buildPlanInteractionProjection } from '$lib/editor/layout/plan-overlays';

describe('buildPlanInteractionProjection', () => {
	it('emits nothing for an idle state on a line room', () => {
		const document = g2LineRectangleDocument();
		const model = buildLayoutPreviewModel(document).model;
		const projection = buildPlanInteractionProjection(createLayoutInteractionState(), document.floors[0]!.rooms, model);
		expect(projection.selected).toEqual({ kind: 'none' });
		expect(projection.selection).toEqual([]);
		expect(projection.handles).toEqual([]);
		expect(projection.drafts).toEqual([]);
		expect(projection.labels).toEqual([]);
	});

	it('emits selection bounds, rotation handle, vertex handles, and dimensions for a selected room', () => {
		const document = g2LineRectangleDocument();
		const model = buildLayoutPreviewModel(document).model;
		const state = createLayoutInteractionState();
		selectLayoutRoom(state, 'room-rectangle');
		const projection = buildPlanInteractionProjection(state, document.floors[0]!.rooms, model);

		expect(projection.selected).toEqual({ kind: 'room', roomId: 'room-rectangle' });
		expect(projection.selection.map((primitive) => primitive.style)).toEqual([
			'selection-bounds',
			'rotation-arm',
			'rotation-handle'
		]);

		const bounds = projection.selection[0]!;
		expect(bounds.kind).toBe('polygon');
		if (bounds.kind === 'polygon') expect(bounds.points).toEqual([[0, 0], [6, 0], [6, 4], [0, 4]]);

		const arm = projection.selection[1]!;
		expect(arm.kind).toBe('polyline');
		if (arm.kind === 'polyline') {
			expect(arm.points).toEqual([[3, 0], [3, 0]]);
			expect(arm.endOffsetPx).toEqual([0, -28]);
		}

		const handle = projection.selection[2]!;
		expect(handle.kind).toBe('circle');
		if (handle.kind === 'circle') {
			expect(handle.center).toEqual([3, 0]);
			expect(handle.offsetPx).toEqual([0, -28]);
			expect(handle.hit).toEqual({ kind: 'room', roomId: 'room-rectangle' });
		}

		expect(projection.handles.map((primitive) => primitive.style)).toEqual([
			'vertex-handle',
			'vertex-handle',
			'vertex-handle',
			'vertex-handle'
		]);
		expect(projection.labels.map((primitive) => (primitive.kind === 'text' ? primitive.text : null))).toEqual([
			'6.00 m',
			'4.00 m',
			'6.00 m',
			'4.00 m'
		]);
	});

	it('does not emit room-selection overlays when a wall is selected', () => {
		const document = g2LineRectangleDocument();
		const model = buildLayoutPreviewModel(document).model;
		const state = createLayoutInteractionState();
		selectLayoutWall(state, 'room-rectangle', 'room-rectangle:wall:0');
		const projection = buildPlanInteractionProjection(state, document.floors[0]!.rooms, model);
		expect(projection.selection).toEqual([]);
		expect(projection.labels).toEqual([]);
		expect(projection.handles.map((primitive) => primitive.style)).toEqual([]);
	});

	it('marks an interior anchor selected only for the matching room, segment, and anchor', () => {
		const document = g2AutoBezierDocument();
		const model = buildLayoutPreviewModel(document).model;
		const record = model.queries.points.find((point) => point.kind === 'interior-anchor')!;

		const state = createLayoutInteractionState();
		selectLayoutInteriorAnchor(state, record.roomId, record.segmentId, record.sourceId);
		const projection = buildPlanInteractionProjection(state, document.floors[0]!.rooms, model);
		expect(projection.selected).toEqual({ kind: 'interiorAnchor', roomId: record.roomId, segmentId: record.segmentId, anchorId: record.sourceId });
		expect(projection.handles.some((primitive) => primitive.style === 'interior-anchor-selected')).toBe(true);

		const wrongRoom = createLayoutInteractionState();
		selectLayoutInteriorAnchor(wrongRoom, 'other-room', record.segmentId, record.sourceId);
		const wrongProjection = buildPlanInteractionProjection(wrongRoom, document.floors[0]!.rooms, model);
		expect(wrongProjection.handles.some((primitive) => primitive.style === 'interior-anchor-selected')).toBe(false);
	});

	it('emits interior anchors from compiled query points', () => {
		const document = g2AutoBezierDocument();
		const model = buildLayoutPreviewModel(document).model;
		const projection = buildPlanInteractionProjection(createLayoutInteractionState(), document.floors[0]!.rooms, model);
		expect(projection.handles).toHaveLength(1);
		expect(projection.handles[0]).toMatchObject({ kind: 'circle', style: 'interior-anchor' });
	});

	it('emits a primitive ghost polygon while drafting a box', () => {
		const document = g2LineRectangleDocument();
		const model = buildLayoutPreviewModel(document).model;
		const state = createLayoutInteractionState();
		beginLayoutPrimitiveDraft(state, 'box', [1, 1], 'room-rectangle');
		updateLayoutPrimitiveDraft(state, [3, 4], 'room-rectangle');
		const projection = buildPlanInteractionProjection(state, document.floors[0]!.rooms, model);
		expect(projection.drafts.map((primitive) => primitive.style)).toEqual(['primitive-ghost']);
		const ghost = projection.drafts[0]!;
		expect(ghost.kind).toBe('polygon');
		if (ghost.kind === 'polygon') expect(ghost.points).toEqual([[1, 1], [3, 1], [3, 4], [1, 4]]);
	});

	it('emits a draft outline with points while drawing a rectangle', () => {
		const document = g2LineRectangleDocument();
		const model = buildLayoutPreviewModel(document).model;
		const state = createLayoutInteractionState();
		setLayoutDraftTool(state, 'rectangle');
		beginRectangle(state, [0, 0]);
		updateRectangle(state, [2, 2]);
		const projection = buildPlanInteractionProjection(state, document.floors[0]!.rooms, model);
		expect(projection.drafts.map((primitive) => primitive.style)).toEqual([
			'draft-outline',
			'draft-point',
			'draft-point',
			'draft-point',
			'draft-point'
		]);
	});

	it('emits rotation feedback while dragging a rotation', () => {
		const document = g2LineRectangleDocument();
		const model = buildLayoutPreviewModel(document).model;
		const state = createLayoutInteractionState();
		selectLayoutRoom(state, 'room-rectangle');
		beginLayoutRoomUnitDrag(state, 'room-rectangle', 'rotate', [3, 0], [3, 2]);
		updateLayoutRoomUnitDrag(state, [4, 2], false, true);
		const projection = buildPlanInteractionProjection(state, document.floors[0]!.rooms, model);
		const feedback = projection.selection.find((primitive) => primitive.style === 'rotation-feedback');
		expect(feedback).toMatchObject({ kind: 'text', text: '+90°' });
	});
});
