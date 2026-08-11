import type { DraftSegment, LayoutDocument, LayoutFloor, LayoutRoom, LayoutVec2 } from './layout-types';
import {
	splitWallAroundOpenings,
	type WallPreviewSection
} from './draft-geometry';
import {
	validateLineRoom,
	type LayoutGeometryIssue
} from './layout-validation';

export type WallPreview = {
	segmentId: string;
	start: LayoutVec2;
	end: LayoutVec2;
	height: number;
	thickness: number;
	sections: WallPreviewSection[];
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
			const roomIssues = validateLineRoom(room, floor);
			if (roomIssues.length > 0) {
				issues.push(...roomIssues);
				continue;
			}
			model.rooms.push(buildRoomPreview(room, floor));
		}
	}

	return { model, issues };
}

function buildRoomPreview(room: LayoutRoom, floor: LayoutFloor): LayoutRoomPreview {
	const lineSegments = room.boundary.segments.filter(
		(segment): segment is Extract<DraftSegment, { kind: 'line' }> => segment.kind === 'line'
	);
	const floorPolygon = lineSegments.map((segment) => [...segment.start] as LayoutVec2);
	const openingsBySegment = new Map<string, LayoutRoom['openings']>();
	for (const opening of room.openings) {
		const openings = openingsBySegment.get(opening.segmentId) ?? [];
		openings.push(opening);
		openingsBySegment.set(opening.segmentId, openings);
	}

	return {
		roomId: room.id,
		floorElevation: floor.elevation,
		ceilingElevation: floor.elevation + floor.height,
		floorPolygon,
		ceilingPolygon: floorPolygon.map(([x, z]) => [x, z] as LayoutVec2),
		walls: lineSegments.map((segment) => ({
			segmentId: segment.id,
			start: [...segment.start] as LayoutVec2,
			end: [...segment.end] as LayoutVec2,
			height: floor.height,
			thickness: room.wallThickness,
			sections: splitWallAroundOpenings(
				segment,
				openingsBySegment.get(segment.id) ?? [],
				floor.height
			)
		}))
	};
}
