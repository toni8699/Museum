import type { LayoutVec2 } from './layout-types';

export type LayoutViewMode = 'plan' | '3d';
export type LayoutDraftTool = 'select' | 'rectangle' | 'polygon';

export type LayoutInteractionState = {
	viewMode: LayoutViewMode;
	tool: LayoutDraftTool;
	polygonPoints: LayoutVec2[];
	rectangleStart: LayoutVec2 | null;
	rectangleCurrent: LayoutVec2 | null;
};

export function createLayoutInteractionState(): LayoutInteractionState {
	return {
		viewMode: '3d',
		tool: 'select',
		polygonPoints: [],
		rectangleStart: null,
		rectangleCurrent: null
	};
}

export function setLayoutViewMode(state: LayoutInteractionState, viewMode: LayoutViewMode): void {
	state.viewMode = viewMode;
	clearLayoutDraft(state);
}

export function setLayoutDraftTool(state: LayoutInteractionState, tool: LayoutDraftTool): void {
	state.tool = tool;
	clearLayoutDraft(state);
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
	return [
		[startX, startZ],
		[endX, startZ],
		[endX, endZ],
		[startX, endZ]
	];
}

export function addPolygonPoint(state: LayoutInteractionState, point: LayoutVec2): void {
	state.polygonPoints = [...state.polygonPoints, [...point]];
}

export function clearLayoutDraft(state: LayoutInteractionState): void {
	state.polygonPoints = [];
	state.rectangleStart = null;
	state.rectangleCurrent = null;
}
