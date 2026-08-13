import type { LayoutDocument, LayoutVec2 } from './layout-types';
import type { LayoutGeometryIssue } from './layout-validation';
import { compileLayoutGeometry } from '$lib/layout/layout-geometry';
import type {
	CompiledCurveSample,
	CompiledOpening,
	CompiledSolidSpan,
	CompiledWallSection,
	LayoutBounds3
} from '$lib/layout/layout-geometry-types';
import type { LayoutObjectDescriptor } from './layout-object-editing';

export type WallPreview = {
	segmentId: string;
	start: LayoutVec2;
	end: LayoutVec2;
	height: number;
	thickness: number;
	length: number;
	samples: CompiledCurveSample[];
	sections: CompiledWallSection[];
	solidSpans: CompiledSolidSpan[];
	openings: CompiledOpening[];
	solidCenterlinePolylines: LayoutVec2[][];
};

export type LayoutRoomPreview = {
	roomId: string;
	floorElevation: number;
	ceilingElevation: number;
	floorThickness: number;
	ceilingThickness: number;
	floorPolygon: LayoutVec2[];
	ceilingPolygon: LayoutVec2[];
	walls: WallPreview[];
};

export type LayoutPreviewModel = {
	rooms: LayoutRoomPreview[];
	objects: LayoutObjectDescriptor[];
};

export type LayoutPreviewModelResult = {
	model: LayoutPreviewModel;
	issues: LayoutGeometryIssue[];
	bounds: LayoutBounds3 | null;
};

/**
 * Editor preview projection. All geometry is adapted from the single shared
 * `compileLayoutGeometry()` contract; no curve is resampled or reinterpreted
 * here.
 */
export function buildLayoutPreviewModel(document: LayoutDocument): LayoutPreviewModelResult {
	const result = compileLayoutGeometry(document);
	const model: LayoutPreviewModel = {
		rooms: result.geometry.rooms.map((room) => ({
			roomId: room.roomId,
			floorElevation: room.floorElevation,
			ceilingElevation: room.ceilingElevation,
			floorThickness: room.floorThickness,
			ceilingThickness: room.ceilingThickness,
			floorPolygon: room.floorPolygon,
			ceilingPolygon: room.ceilingPolygon,
			walls: room.walls.map((wall) => ({
				segmentId: wall.segmentId,
				start: wall.samples[0]?.point ?? ([0, 0] as LayoutVec2),
				end: wall.samples.at(-1)?.point ?? ([0, 0] as LayoutVec2),
				height: room.ceilingElevation - room.floorElevation,
				thickness: wall.thickness,
				length: wall.length,
				samples: wall.samples,
				sections: wall.sections,
				solidSpans: wall.solidSpans,
				openings: wall.openings,
				solidCenterlinePolylines: wall.solidCenterlinePolylines
			}))
		})),
		objects: result.geometry.objects
	};
	return { model, issues: result.issues, bounds: result.geometry.bounds };
}
