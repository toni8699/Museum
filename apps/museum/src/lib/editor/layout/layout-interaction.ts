import type { DraftSegment, LayoutDocument, LayoutRoom, LayoutVec2 } from '$lib/layout/layout-types';
import type { LayoutRoomUnitTransform } from './layout-room-transform';
import { createPlanViewportState, snapToGrid, type PlanViewportState } from './layout-plan-transform';
import type { Vec3 } from '$lib/types/scene';
export type LayoutViewMode = 'plan' | '3d';
/** Scene → Plan's local authoring authority. Camera Plan never reads this. */
export type PlanViewMode = 'layout' | 'staging';
export type LayoutPrimitiveTool = 'box' | 'cylinder' | 'sphere';
export type LayoutDraftTool = 'select' | 'rectangle' | 'polygon' | 'door' | 'window' | LayoutPrimitiveTool;
export type LayoutRoomDragMode = 'room' | 'vertex';

export type LayoutRoomUnitDrag = LayoutRoomUnitTransform & {
	roomId: string;
	mode: 'translate' | 'rotate';
	startWorld: LayoutVec2;
	pivot: LayoutVec2;
	startAngle: number;
};

export type LayoutPrimitiveDraft = {
	kind: LayoutPrimitiveTool;
	start: LayoutVec2;
	current: LayoutVec2;
	roomId?: string;
	valid: boolean;
};

export type LayoutObjectDrag = {
	objectId: string;
	originalPosition: Vec3;
	candidatePosition: Vec3;
};

export type LayoutAccordionState = {
	place: boolean;
	objects: boolean;
	selection: boolean;
};

/** Screen-pixel distance before a wall mid-span drag inserts a bend anchor. */
export const LAYOUT_WALL_BEND_DRAG_THRESHOLD_PX = 4;

export type LayoutSelection =
	| { kind: 'none' }
	| { kind: 'room'; roomId: string }
	| { kind: 'wall'; roomId: string; segmentId: string }
	| { kind: 'opening'; roomId: string; segmentId: string; openingId: string }
	| { kind: 'interiorAnchor'; roomId: string; segmentId: string; anchorId: string }
	| { kind: 'object'; objectId: string };

export type LayoutInteractionState = {
	viewMode: LayoutViewMode;
	planViewMode: PlanViewMode;
	tool: LayoutDraftTool;
	polygonPoints: LayoutVec2[];
	rectangleStart: LayoutVec2 | null;
	rectangleCurrent: LayoutVec2 | null;
	primitiveDraft: LayoutPrimitiveDraft | null;
	selection: LayoutSelection;
	objectDrag: LayoutObjectDrag | null;
	roomUnitDrag: LayoutRoomUnitDrag | null;
	accordions: LayoutAccordionState;
	planView: PlanViewportState;
	editing: {
		mode: LayoutRoomDragMode;
		roomId: string;
		vertexIndex: number | null;
		startWorld: LayoutVec2;
		originalPoints: LayoutVec2[];
		currentPoints: LayoutVec2[];
	} | null;
};

export function createLayoutInteractionState(): LayoutInteractionState {
	return {
		viewMode: '3d',
		planViewMode: 'layout',
		tool: 'select',
		polygonPoints: [],
		rectangleStart: null,
		rectangleCurrent: null,
		primitiveDraft: null,
		selection: { kind: 'none' },
		objectDrag: null,
		roomUnitDrag: null,
		accordions: { place: true, objects: true, selection: true },
		planView: createPlanViewportState(),
		editing: null
	};
}

/**
 * Change Scene Plan authority without changing either committed selection
 * slot. Transient Layout work is cleared; the caller owns any open history
 * transaction and must cancel it before calling this function.
 */
export function setPlanViewMode(state: LayoutInteractionState, mode: PlanViewMode): boolean {
	if (state.planViewMode === mode) return false;
	state.planViewMode = mode;
	setLayoutDraftTool(state, 'select');
	return true;
}

export function hasLayoutTransientInteraction(
	state: Pick<
		LayoutInteractionState,
		'polygonPoints' | 'rectangleStart' | 'primitiveDraft' | 'objectDrag' | 'roomUnitDrag' | 'editing'
	>
): boolean {
	return Boolean(
		state.polygonPoints.length > 0 ||
		state.rectangleStart ||
		state.primitiveDraft ||
		state.objectDrag ||
		state.roomUnitDrag ||
		state.editing
	);
}

export function setLayoutViewMode(state: LayoutInteractionState, viewMode: LayoutViewMode): void {
	state.viewMode = viewMode;
	clearLayoutDraft(state);
	cancelRoomEdit(state);
	state.objectDrag = null;
	state.roomUnitDrag = null;
	state.primitiveDraft = null;
}

export function setLayoutDraftTool(state: LayoutInteractionState, tool: LayoutDraftTool): void {
	state.tool = tool;
	clearLayoutDraft(state);
	cancelRoomEdit(state);
	state.objectDrag = null;
	state.roomUnitDrag = null;
	state.primitiveDraft = null;
}

export function toggleLayoutAccordion(
	state: LayoutInteractionState,
	section: keyof LayoutAccordionState
): void {
	state.accordions[section] = !state.accordions[section];
}

export type PlanViewportToggleOption = 'snapEnabled' | 'gridEnabled' | 'showTourOverlay';

export function togglePlanViewportOption(
	state: LayoutInteractionState,
	option: PlanViewportToggleOption
): void {
	state.planView[option] = !state.planView[option];
}

export function beginLayoutPrimitiveDraft(
	state: LayoutInteractionState,
	kind: LayoutPrimitiveTool,
	point: LayoutVec2,
	roomId?: string
): void {
	state.tool = kind;
	state.primitiveDraft = {
		kind,
		start: [...point],
		current: [...point],
		...(roomId ? { roomId } : {}),
		valid: false
	};
}

export function updateLayoutPrimitiveDraft(
	state: LayoutInteractionState,
	point: LayoutVec2,
	roomId?: string
): void {
	const draft = state.primitiveDraft;
	if (!draft) return;
	draft.current = [...point];
	draft.roomId = roomId;
	draft.valid = Boolean(roomId && primitiveDraftHasSize(draft));
}

export function primitiveDraftHasSize(draft: Pick<LayoutPrimitiveDraft, 'kind' | 'start' | 'current'>): boolean {
	if (draft.kind === 'box') {
		return Math.abs(draft.current[0] - draft.start[0]) > 1e-6 && Math.abs(draft.current[1] - draft.start[1]) > 1e-6;
	}
	return Math.hypot(draft.current[0] - draft.start[0], draft.current[1] - draft.start[1]) > 1e-6;
}

export function primitiveDraftFootprint(draft: LayoutPrimitiveDraft, circleSteps = 32): LayoutVec2[] {
	if (draft.kind === 'box') {
		const [startX, startZ] = draft.start;
		const [endX, endZ] = draft.current;
		return [[startX, startZ], [endX, startZ], [endX, endZ], [startX, endZ]];
	}
	const radius = Math.hypot(draft.current[0] - draft.start[0], draft.current[1] - draft.start[1]);
	return Array.from({ length: circleSteps }, (_, index) => {
		const angle = (index / circleSteps) * Math.PI * 2;
		return [draft.start[0] + Math.cos(angle) * radius, draft.start[1] + Math.sin(angle) * radius];
	});
}

export function primitiveDraftCenter(
	draft: Pick<LayoutPrimitiveDraft, 'kind' | 'start' | 'current'>
): LayoutVec2 {
	if (draft.kind !== 'box') return [...draft.start];
	return [
		(draft.start[0] + draft.current[0]) / 2,
		(draft.start[1] + draft.current[1]) / 2
	];
}

export function cancelLayoutPrimitiveDraft(state: LayoutInteractionState): void {
	state.primitiveDraft = null;
	if (state.tool === 'box' || state.tool === 'cylinder' || state.tool === 'sphere') state.tool = 'select';
}

export function beginRectangle(state: LayoutInteractionState, point: LayoutVec2): void {
	state.rectangleStart = [...point];
	state.rectangleCurrent = [...point];
}

export function updateRectangle(state: LayoutInteractionState, point: LayoutVec2): void {
	if (!state.rectangleStart) return;
	state.rectangleCurrent = [...point];
}

export function rectanglePoints(state: LayoutInteractionState): LayoutVec2[] | null {
	if (!state.rectangleStart || !state.rectangleCurrent) return null;
	const [startX, startZ] = state.rectangleStart;
	const [endX, endZ] = state.rectangleCurrent;
	return [[startX, startZ], [endX, startZ], [endX, endZ], [startX, endZ]];
}

export function addPolygonPoint(state: LayoutInteractionState, point: LayoutVec2): void {
	state.polygonPoints = [...state.polygonPoints, [...point]];
}

export function removeLastPolygonPoint(state: LayoutInteractionState): void {
	state.polygonPoints = state.polygonPoints.slice(0, -1);
}

export function selectLayoutRoom(state: LayoutInteractionState, roomId: string | null): void {
	state.selection = roomId ? { kind: 'room', roomId } : { kind: 'none' };
	cancelRoomEdit(state);
}

export function selectLayoutWall(state: LayoutInteractionState, roomId: string, segmentId: string): void {
	state.selection = { kind: 'wall', roomId, segmentId };
	cancelRoomEdit(state);
}

export function selectLayoutOpening(state: LayoutInteractionState, roomId: string, segmentId: string, openingId: string): void {
	state.selection = { kind: 'opening', roomId, segmentId, openingId };
	cancelRoomEdit(state);
}

export function selectLayoutInteriorAnchor(
	state: LayoutInteractionState,
	roomId: string,
	segmentId: string,
	anchorId: string
): void {
	state.selection = { kind: 'interiorAnchor', roomId, segmentId, anchorId };
	cancelRoomEdit(state);
}

export function clearLayoutSelection(state: LayoutInteractionState): void {
	state.selection = { kind: 'none' };
	cancelRoomEdit(state);
}

export function selectLayoutObject(state: LayoutInteractionState, objectId: string): void {
	state.selection = { kind: 'object', objectId };
	cancelRoomEdit(state);
}

export function selectedLayoutRoomId(state: Pick<LayoutInteractionState, 'selection'>): string | null {
	return state.selection.kind === 'none' || state.selection.kind === 'object'
		? null
		: state.selection.roomId;
}

export function beginLayoutObjectDrag(
	state: LayoutInteractionState,
	objectId: string,
	position: Vec3
): void {
	state.objectDrag = {
		objectId,
		originalPosition: [...position],
		candidatePosition: [...position]
	};
}

export function updateLayoutObjectDrag(
	state: LayoutInteractionState,
	point: LayoutVec2,
	snapEnabled: boolean
): void {
	if (!state.objectDrag) return;
	const x = snapEnabled ? Math.round(point[0] * 4) / 4 : point[0];
	const z = snapEnabled ? Math.round(point[1] * 4) / 4 : point[1];
	state.objectDrag.candidatePosition = [x, state.objectDrag.originalPosition[1], z];
}

export function cancelLayoutObjectDrag(state: LayoutInteractionState): void {
	state.objectDrag = null;
}

export function beginLayoutRoomUnitDrag(
	state: LayoutInteractionState,
	roomId: string,
	mode: 'translate' | 'rotate',
	startWorld: LayoutVec2,
	pivot: LayoutVec2
): void {
	state.roomUnitDrag = {
		roomId,
		mode,
		startWorld: [...startWorld],
		pivot: [...pivot],
		startAngle: Math.atan2(startWorld[1] - pivot[1], startWorld[0] - pivot[0]),
		translation: [0, 0],
		yaw: 0
	};
	state.editing = null;
}

export function updateLayoutRoomUnitDrag(
	state: LayoutInteractionState,
	currentWorld: LayoutVec2,
	snapEnabled: boolean,
	angleSnapEnabled: boolean,
	shiftKey = false
): void {
	const drag = state.roomUnitDrag;
	if (!drag) return;
	if (drag.mode === 'translate') {
		const target = snapEnabled ? snapToGrid(currentWorld) : currentWorld;
		drag.translation = [target[0] - drag.startWorld[0], target[1] - drag.startWorld[1]];
		return;
	}
	let yaw = Math.atan2(currentWorld[1] - drag.pivot[1], currentWorld[0] - drag.pivot[0]) - drag.startAngle;
	while (yaw > Math.PI) yaw -= Math.PI * 2;
	while (yaw <= -Math.PI) yaw += Math.PI * 2;
	if (shiftKey && angleSnapEnabled) {
		const increment = Math.PI / 12;
		yaw = Math.round(yaw / increment) * increment;
	}
	drag.yaw = yaw;
}

export function cancelLayoutRoomUnitDrag(state: LayoutInteractionState): void {
	state.roomUnitDrag = null;
}

export function beginRoomEdit(state: LayoutInteractionState, mode: LayoutRoomDragMode, roomId: string, startWorld: LayoutVec2, originalPoints: readonly LayoutVec2[], vertexIndex: number | null = null): void {
	state.editing = { mode, vertexIndex, roomId, startWorld: [...startWorld], originalPoints: originalPoints.map((point) => [...point]), currentPoints: originalPoints.map((point) => [...point]) };
}

export function updateRoomEdit(state: LayoutInteractionState, currentWorld: LayoutVec2, snapEnabled = false): void {
	const edit = state.editing;
	if (!edit) return;
	if (edit.mode === 'room') {
		const target = snapEnabled ? snapToGrid(currentWorld) : currentWorld;
		const delta: LayoutVec2 = [
			target[0] - edit.startWorld[0],
			target[1] - edit.startWorld[1]
		];
		edit.currentPoints = edit.originalPoints.map(([x, z]) => [x + delta[0], z + delta[1]]);
		return;
	}
	edit.currentPoints = edit.originalPoints.map((point) => [...point]);
	if (edit.vertexIndex !== null) {
		const original = edit.originalPoints[edit.vertexIndex]!;
		const delta: LayoutVec2 = [
			currentWorld[0] - edit.startWorld[0],
			currentWorld[1] - edit.startWorld[1]
		];
		const candidate: LayoutVec2 = [original[0] + delta[0], original[1] + delta[1]];
		edit.currentPoints[edit.vertexIndex] = snapEnabled ? snapToGrid(candidate) : candidate;
	}
}

export function cancelRoomEdit(state: LayoutInteractionState): void {
	state.editing = null;
	state.roomUnitDrag = null;
}

export function clearLayoutDraft(state: LayoutInteractionState): void {
	state.polygonPoints = [];
	state.rectangleStart = null;
	state.rectangleCurrent = null;
}

export function screenDistance(a: LayoutVec2, b: LayoutVec2): number {
	return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function shouldBeginWallBend(
	originScreen: LayoutVec2,
	currentScreen: LayoutVec2,
	thresholdPx = LAYOUT_WALL_BEND_DRAG_THRESHOLD_PX
): boolean {
	return screenDistance(originScreen, currentScreen) >= thresholdPx;
}

// =====================================================================
// layout selection reconcile (pure).
//
// `LayoutInteractionState.selection` is shell-owned and is *not* part of the
// `LayoutPreviewState` undo snapshot, so every layout swap (undo/redo/commit/
// cancel/delete/reset/import) can leave a stale selection. The shell re-runs
// this against `layoutPreview.project.layout` after every swap. Demotion
// mirrors the scene-side convention (`anchor`→`connection`,
// `view-keyframe`→`connection`): a child selection degrades to its nearest
// surviving parent identity instead of vanishing outright.
// =====================================================================

function findLayoutRoomAnyFloor(
	layout: LayoutDocument,
	roomId: string
): LayoutRoom | undefined {
	for (const floor of layout.floors) {
		const room = floor.rooms.find((candidate) => candidate.id === roomId);
		if (room) return room;
	}
	return undefined;
}

function findLayoutWall(
	layout: LayoutDocument,
	roomId: string,
	segmentId: string
): DraftSegment | undefined {
	return findLayoutRoomAnyFloor(layout, roomId)?.boundary.segments.find(
		(segment) => segment.id === segmentId
	);
}

function findLayoutOpening(
	layout: LayoutDocument,
	roomId: string,
	segmentId: string,
	openingId: string
): boolean {
	return Boolean(
		findLayoutRoomAnyFloor(layout, roomId)?.openings.some(
			(opening) => opening.id === openingId && opening.segmentId === segmentId
		)
	);
}

function findLayoutInteriorAnchor(
	layout: LayoutDocument,
	roomId: string,
	segmentId: string,
	anchorId: string
): boolean {
	const segment = findLayoutWall(layout, roomId, segmentId);
	if (!segment || segment.kind !== 'auto-bezier') return false;
	return segment.interiorAnchors.some((anchor) => anchor.id === anchorId);
}

/**
 * Re-validate a layout selection against the current `LayoutDocument`.
 *
 * Contract: returns the **same input reference** when the selection is still
 * valid, and a fresh object only when it must change (demotion or clear).
 * Shell consumers rely on this identity for cheap change detection; do not
 * spread/clone the valid case.
 *
 * Demotes `opening` / `interiorAnchor` to their parent `wall` when the child is
 * gone but the wall survives; otherwise clears to `{ kind: 'none' }`.
 */
export function reconcileLayoutSelection(
	selection: LayoutSelection,
	layout: LayoutDocument
): LayoutSelection {
	switch (selection.kind) {
		case 'none':
			return selection;
		case 'room':
			return findLayoutRoomAnyFloor(layout, selection.roomId)
				? selection
				: { kind: 'none' };
		case 'wall':
			return findLayoutWall(layout, selection.roomId, selection.segmentId)
				? selection
				: { kind: 'none' };
		case 'opening': {
			// Parent-first, mirroring the scene side (anchor→connection): a dead
			// wall clears outright (no demotion target), a dead opening demotes
			// to its surviving wall.
			const wall = findLayoutWall(layout, selection.roomId, selection.segmentId);
			if (!wall) return { kind: 'none' };
			if (findLayoutOpening(layout, selection.roomId, selection.segmentId, selection.openingId)) {
				return selection;
			}
			return { kind: 'wall', roomId: selection.roomId, segmentId: selection.segmentId };
		}
		case 'interiorAnchor': {
			const wall = findLayoutWall(layout, selection.roomId, selection.segmentId);
			if (!wall) return { kind: 'none' };
			if (findLayoutInteriorAnchor(layout, selection.roomId, selection.segmentId, selection.anchorId)) {
				return selection;
			}
			return { kind: 'wall', roomId: selection.roomId, segmentId: selection.segmentId };
		}
		case 'object':
			return layout.objects.some((object) => object.id === selection.objectId)
				? selection
				: { kind: 'none' };
	}
}
