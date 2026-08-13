export {
	LAYOUT_GEOMETRY_EPSILON,
	lineLength,
	openingIntervals,
	splitWallAroundOpenings,
	type WallOpeningInterval
} from '$lib/layout/layout-geometry-openings';
export { sampleSegment as sampleWallSegment } from '$lib/layout/layout-geometry-curve';
export type { CompiledWallSection as WallPreviewSection } from '$lib/layout/layout-geometry-types';
