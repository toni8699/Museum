import type { LayoutVec2 } from '$lib/layout/layout-types';

export type PlanViewportState = {
	width: number;
	height: number;
	center: LayoutVec2;
	pixelsPerMeter: number;
	initialized: boolean;
	gridEnabled: boolean;
	snapEnabled: boolean;
	angleSnapEnabled: boolean;
	showTourOverlay: boolean;
};

export type PlanBounds = {
	minX: number;
	minZ: number;
	maxX: number;
	maxZ: number;
};

export type PlanGridLine = {
	id: string;
	start: LayoutVec2;
	end: LayoutVec2;
	value: number;
	major: boolean;
};

export type PlanRulerTick = {
	value: number;
	pixel: number;
};

export type PlanScaleSegment = {
	startPixel: number;
	widthPixel: number;
	value: number;
};

function niceStep(raw: number): number {
	if (!Number.isFinite(raw) || raw <= 0) return 1;
	const exponent = Math.floor(Math.log10(raw));
	const magnitude = 10 ** exponent;
	const normalized = raw / magnitude;
	const base = normalized < 1.5 ? 1 : normalized < 3.5 ? 2 : normalized < 7.5 ? 5 : 10;
	return base * magnitude;
}

export function planRulerStep(pixelsPerMeter: number, targetPixels = 80): number {
	return niceStep(targetPixels / Math.max(pixelsPerMeter, Number.EPSILON));
}

export function buildPlanRulerTicks(
	state: PlanViewportState,
	axis: 'x' | 'z',
	targetPixels = 80
): PlanRulerTick[] {
	const bounds = visiblePlanBounds(state);
	const step = planRulerStep(state.pixelsPerMeter, targetPixels);
	const min = axis === 'x' ? bounds.minX : bounds.minZ;
	const max = axis === 'x' ? bounds.maxX : bounds.maxZ;
	const ticks: PlanRulerTick[] = [];
	for (let value = Math.ceil(min / step) * step; value <= max + step / 2; value += step) {
		ticks.push({
			value: Number(value.toFixed(9)),
			pixel: axis === 'x' ? worldToPlanScreen(state, [value, state.center[1]])[0] : worldToPlanScreen(state, [state.center[0], value])[1]
		});
	}
	return ticks;
}

export function buildSegmentedScaleBar(
	pixelsPerMeter: number,
	targetPixels = 100
): { meters: number; segments: PlanScaleSegment[] } {
	const meters = niceStep(targetPixels / Math.max(pixelsPerMeter, Number.EPSILON));
	const adjustedMeters = meters * pixelsPerMeter < 80 ? meters * 2 : meters;

	const segmentCount = 2;
	const segmentWidth = adjustedMeters * pixelsPerMeter / segmentCount;
	return {
		meters: adjustedMeters,
		segments: Array.from({ length: segmentCount }, (_, index) => ({
			startPixel: index * segmentWidth,
			widthPixel: segmentWidth,
			value: (index * adjustedMeters) / segmentCount
		}))
	};
}

export function createPlanViewportState(): PlanViewportState {
	return {
		width: 800,
		height: 600,
		center: [0, 0],
		pixelsPerMeter: 50,
		initialized: false,
		gridEnabled: true,
		snapEnabled: true,
		angleSnapEnabled: true,
		showTourOverlay: false
	};
}

export function setPlanViewportSize(
	state: PlanViewportState,
	width: number,
	height: number
): void {
	if (width <= 0 || height <= 0) return;
	state.width = width;
	state.height = height;
}

export function framePlanViewport(
	state: PlanViewportState,
	points: readonly LayoutVec2[],
	padding = 48
): void {
	if (points.length === 0) {
		state.center = [0, 0];
		state.pixelsPerMeter = Math.min(state.width, state.height) / 12;
		state.initialized = true;
		return;
	}
	const minX = Math.min(...points.map(([x]) => x));
	const maxX = Math.max(...points.map(([x]) => x));
	const minZ = Math.min(...points.map(([, z]) => z));
	const maxZ = Math.max(...points.map(([, z]) => z));
	const worldWidth = Math.max(maxX - minX, 1);
	const worldHeight = Math.max(maxZ - minZ, 1);
	const availableWidth = Math.max(state.width - padding * 2, 1);
	const availableHeight = Math.max(state.height - padding * 2, 1);
	state.center = [(minX + maxX) / 2, (minZ + maxZ) / 2];
	state.pixelsPerMeter = Math.max(
		1,
		Math.min(availableWidth / worldWidth, availableHeight / worldHeight)
	);
	state.initialized = true;
}

export function worldToPlanScreen(state: PlanViewportState, point: LayoutVec2): LayoutVec2 {
	return [
		state.width / 2 + (point[0] - state.center[0]) * state.pixelsPerMeter,
		state.height / 2 + (point[1] - state.center[1]) * state.pixelsPerMeter
	];
}

export function planScreenToWorld(state: PlanViewportState, point: LayoutVec2): LayoutVec2 {
	return [
		state.center[0] + (point[0] - state.width / 2) / state.pixelsPerMeter,
		state.center[1] + (point[1] - state.height / 2) / state.pixelsPerMeter
	];
}

export function panPlanViewport(
	state: PlanViewportState,
	pixelDelta: LayoutVec2
): void {
	state.center = [
		state.center[0] - pixelDelta[0] / state.pixelsPerMeter,
		state.center[1] - pixelDelta[1] / state.pixelsPerMeter
	];
}

export function zoomPlanViewport(
	state: PlanViewportState,
	factor: number,
	screenAnchor?: LayoutVec2
): void {
	if (!Number.isFinite(factor) || factor <= 0) return;
	const anchor = screenAnchor ?? [state.width / 2, state.height / 2];
	const worldBefore = planScreenToWorld(state, anchor);
	state.pixelsPerMeter = Math.min(Math.max(state.pixelsPerMeter * factor, 2), 2000);
	const worldAfter = planScreenToWorld(state, anchor);
	state.center = [
		state.center[0] + worldBefore[0] - worldAfter[0],
		state.center[1] + worldBefore[1] - worldAfter[1]
	];
}

export function snapToGrid(point: LayoutVec2, spacing = 0.25): LayoutVec2 {
	if (!Number.isFinite(spacing) || spacing <= 0) return [...point];
	return [Math.round(point[0] / spacing) * spacing, Math.round(point[1] / spacing) * spacing];
}

export function constrainToAngle(
	start: LayoutVec2,
	point: LayoutVec2,
	incrementDegrees = 15
): LayoutVec2 {
	const dx = point[0] - start[0];
	const dz = point[1] - start[1];
	const length = Math.hypot(dx, dz);
	if (length === 0 || incrementDegrees <= 0) return [...point];
	const increment = (incrementDegrees * Math.PI) / 180;
	const angle = Math.atan2(dz, dx);
	const snapped = Math.round(angle / increment) * increment;
	return [start[0] + Math.cos(snapped) * length, start[1] + Math.sin(snapped) * length];
}

export function visiblePlanBounds(state: PlanViewportState): PlanBounds {
	return {
		minX: state.center[0] - state.width / 2 / state.pixelsPerMeter,
		maxX: state.center[0] + state.width / 2 / state.pixelsPerMeter,
		minZ: state.center[1] - state.height / 2 / state.pixelsPerMeter,
		maxZ: state.center[1] + state.height / 2 / state.pixelsPerMeter
	};
}

export function buildPlanGrid(
	state: PlanViewportState,
	minorSpacing = 0.25,
	majorSpacing = 1
): PlanGridLine[] {
	if (!state.gridEnabled) return [];
	const bounds = visiblePlanBounds(state);
	const lines: PlanGridLine[] = [];
	const minorPixelSpacing = minorSpacing * state.pixelsPerMeter;
	const renderMinor = minorPixelSpacing >= 6;
	const startX = Math.floor(bounds.minX / minorSpacing) * minorSpacing;
	const endX = Math.ceil(bounds.maxX / minorSpacing) * minorSpacing;
	const startZ = Math.floor(bounds.minZ / minorSpacing) * minorSpacing;
	const endZ = Math.ceil(bounds.maxZ / minorSpacing) * minorSpacing;
	for (let x = startX; x <= endX + minorSpacing / 2; x += minorSpacing) {
		const major = Math.abs(x / majorSpacing - Math.round(x / majorSpacing)) < 1e-6;
		if (!major && !renderMinor) continue;
		lines.push({
			id: `v:${x}`,
			start: worldToPlanScreen(state, [x, bounds.minZ]),
			end: worldToPlanScreen(state, [x, bounds.maxZ]),
			value: x,
			major
		});
	}
	for (let z = startZ; z <= endZ + minorSpacing / 2; z += minorSpacing) {
		const major = Math.abs(z / majorSpacing - Math.round(z / majorSpacing)) < 1e-6;
		if (!major && !renderMinor) continue;
		lines.push({
			id: `h:${z}`,
			start: worldToPlanScreen(state, [bounds.minX, z]),
			end: worldToPlanScreen(state, [bounds.maxX, z]),
			value: z,
			major
		});
	}
	return lines;
}
