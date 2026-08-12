import type { LayoutVec2 } from './layout-types';
import { createPlanViewportState, type PlanViewportState } from './layout-plan-transform';
import type { Vec3 } from '$lib/types/museum';
import { defaultLayoutObjectDimensions, type AuthoredLayoutObjectKind } from './layout-object-editing';

export type LayoutViewMode = 'plan' | '3d';
export type LayoutDraftTool = 'select' | 'rectangle' | 'polygon' | 'door' | 'window' | 'object';
export type LayoutRoomDragMode = 'room' | 'vertex';

export type LayoutPendingObject = {
	kind: AuthoredLayoutObjectKind;
	dimensions: Vec3;
	position: Vec3 | null;
	roomId?: string;
	valid: boolean;
	message?: string;
};

export type LayoutObjectDrag = {
	objectId: string;
	originalPosition: Vec3;
	candidatePosition: Vec3;
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
	tool: LayoutDraftTool;
	polygonPoints: LayoutVec2[];
	rectangleStart: LayoutVec2 | null;
	rectangleCurrent: LayoutVec2 | null;
	selection: LayoutSelection;
	pendingObject: LayoutPendingObject | null;
	objectDrag: LayoutObjectDrag | null;
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
		tool: 'select',
		polygonPoints: [],
		rectangleStart: null,
		rectangleCurrent: null,
		selection: { kind: 'none' },
		pendingObject: null,
		objectDrag: null,
		planView: createPlanViewportState(),
		editing: null
	};
}

export function setLayoutViewMode(state: LayoutInteractionState, viewMode: LayoutViewMode): void {
	state.viewMode = viewMode;
	clearLayoutDraft(state);
	cancelRoomEdit(state);
}

export function setLayoutDraftTool(state: LayoutInteractionState, tool: LayoutDraftTool): void {
	state.tool = tool;
	clearLayoutDraft(state);
	cancelRoomEdit(state);
	state.objectDrag = null;
	state.pendingObject =
		tool === 'object'
			? {
					kind: 'box',
					dimensions: defaultLayoutObjectDimensions('box'),
					position: null,
					valid: false
				}
			: null;
}

export function setLayoutPendingObjectKind(
	state: LayoutInteractionState,
	kind: AuthoredLayoutObjectKind
): void {
	if (state.tool !== 'object') state.tool = 'object';
	state.pendingObject = {
		kind,
		dimensions: defaultLayoutObjectDimensions(kind),
		position: null,
		valid: false
	};
}

export function updateLayoutPendingObject(
	state: LayoutInteractionState,
	position: Vec3 | null,
	roomId?: string,
	message?: string
): void {
	if (!state.pendingObject) return;
	state.pendingObject.position = position ? [...position] : null;
	state.pendingObject.roomId = roomId;
	state.pendingObject.valid = Boolean(position && roomId);
	state.pendingObject.message = message;
}

export function cancelLayoutPendingObject(state: LayoutInteractionState): void {
	state.pendingObject = null;
	if (state.tool === 'object') state.tool = 'select';
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

export function beginRoomEdit(state: LayoutInteractionState, mode: LayoutRoomDragMode, roomId: string, startWorld: LayoutVec2, originalPoints: readonly LayoutVec2[], vertexIndex: number | null = null): void {
	state.editing = { mode, vertexIndex, roomId, startWorld: [...startWorld], originalPoints: originalPoints.map((point) => [...point]), currentPoints: originalPoints.map((point) => [...point]) };
}

export function updateRoomEdit(state: LayoutInteractionState, currentWorld: LayoutVec2): void {
	const edit = state.editing;
	if (!edit) return;
	const delta: LayoutVec2 = [currentWorld[0] - edit.startWorld[0], currentWorld[1] - edit.startWorld[1]];
	if (edit.mode === 'room') {
		edit.currentPoints = edit.originalPoints.map(([x, z]) => [x + delta[0], z + delta[1]]);
		return;
	}
	edit.currentPoints = edit.originalPoints.map((point) => [...point]);
	if (edit.vertexIndex !== null) edit.currentPoints[edit.vertexIndex] = [edit.originalPoints[edit.vertexIndex]![0] + delta[0], edit.originalPoints[edit.vertexIndex]![1] + delta[1]];
}

export function cancelRoomEdit(state: LayoutInteractionState): void {
	state.editing = null;
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
