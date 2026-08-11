import type { DraftSegment, LayoutDocument, LayoutFloor, LayoutRoom, LayoutVec2 } from './layout-types';
import { sampleWallSegment } from './draft-geometry';
import { type CurveSample } from './curve-geometry';
import { hasBlockingLayoutIssues, validateLayoutRoomGeometry, type LayoutGeometryIssue } from './layout-validation';
import { splitWallAroundOpenings } from './draft-geometry';

export type WallPreview = {
	segmentId: string;
	start: LayoutVec2;
	end: LayoutVec2;
	height: number;
	thickness: number;
	length: number;
	samples: CurveSample[];
	sections: ReturnType<typeof splitWallAroundOpenings>;
};

export type LayoutRoomPreview = {
	roomId: string;
	floorElevation: number;
	ceilingElevation: number;
	floorPolygon: LayoutVec2[];
	ceilingPolygon: LayoutVec2[];
	walls: WallPreview[];
};

export type LayoutPreviewModel = {
	rooms: LayoutRoomPreview[];
};

export type LayoutPreviewModelResult = {
	model: LayoutPreviewModel;
	issues: LayoutGeometryIssue[];
};

export function buildLayoutPreviewModel(document: LayoutDocument): LayoutPreviewModelResult {
	const model: LayoutPreviewModel = { rooms: [] };
	const issues: LayoutGeometryIssue[] = [];
	for (const floor of document.floors) {
		for (const room of floor.rooms) {
			const roomIssues = validateLayoutRoomGeometry(room, floor);
			if (hasBlockingLayoutIssues(roomIssues)) {
				issues.push(...roomIssues);
				continue;
			}
			model.rooms.push(buildRoomPreview(room, floor));
		}
	}
	return { model, issues };
}

function buildRoomPreview(room: LayoutRoom, floor: LayoutFloor): LayoutRoomPreview {
	const sampledSegments = room.boundary.segments.map(sampleWallSegment);
	const floorPolygon = room.boundary.segments.flatMap((segment, index) => {
		if (segment.kind === 'line') return [[...segment.start] as LayoutVec2];
		return sampledSegments[index]!.samples.slice(0, -1).map((sample) => [...sample.point] as LayoutVec2);
	});
	const openingsBySegment = new Map<string, LayoutRoom['openings']>();
	for (const opening of room.openings) {
		const openings = openingsBySegment.get(opening.segmentId) ?? [];
		openings.push(opening);
		openingsBySegment.set(opening.segmentId, openings);
	}
	const walls = room.boundary.segments.map((segment, index) => {
		const sampled = sampledSegments[index]!;
		return {
			segmentId: segment.id,
			start: [...segment.start] as LayoutVec2,
			end: [...segment.end] as LayoutVec2,
			height: floor.height,
			thickness: room.wallThickness,
			length: sampled.length,
			samples: sampled.samples,
			sections: splitWallAroundOpenings(segment, openingsBySegment.get(segment.id) ?? [], floor.height)
		};
	});
	return {
		roomId: room.id,
		floorElevation: floor.elevation,
		ceilingElevation: floor.elevation + floor.height,
		floorPolygon,
		ceilingPolygon: floorPolygon.map(([x, z]) => [x, z] as LayoutVec2),
		walls
	};
}
