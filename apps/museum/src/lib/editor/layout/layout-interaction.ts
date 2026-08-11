import type { LayoutVec2 } from './layout-types';
import { createPlanViewportState, type PlanViewportState } from './layout-plan-transform';

export type LayoutViewMode = 'plan' | '3d';
export type LayoutDraftTool = 'select' | 'rectangle' | 'polygon' | 'door' | 'window';
export type LayoutRoomDragMode = 'room' | 'vertex';

export type LayoutSelection =
	| { kind: 'none' }
	| { kind: 'room'; roomId: string }
	| { kind: 'wall'; roomId: string; segmentId: string }
	| { kind: 'opening'; roomId: string; segmentId: string; openingId: string }
	| { kind: 'interiorAnchor'; roomId: string; segmentId: string; anchorId: string };

export type LayoutInteractionState = {
	viewMode: LayoutViewMode;
	tool: LayoutDraftTool;
	polygonPoints: LayoutVec2[];
	rectangleStart: LayoutVec2 | null;
	rectangleCurrent: LayoutVec2 | null;
	selection: LayoutSelection;
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

export function selectedLayoutRoomId(state: Pick<LayoutInteractionState, 'selection'>): string | null {
	return state.selection.kind === 'none' ? null : state.selection.roomId;
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
