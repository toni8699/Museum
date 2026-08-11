import type { DraftSegment, LayoutOpening, LayoutVec2 } from './layout-types';
import { buildArchProfile, type ArchProfile } from './arch-profile';
import { sampleSegment, segmentLength } from './curve-geometry';

export const LAYOUT_GEOMETRY_EPSILON = 1e-6;

export type WallOpeningInterval = {
	openingId: string;
	startDistance: number;
	endDistance: number;
	sillHeight: number;
	height: number;
	profile: LayoutOpening['profile'];
};

export type WallPreviewSection = {
	kind: 'side' | 'lintel';
	startDistance: number;
	endDistance: number;
	bottomY: number;
	topY: number;
	openingId?: string;
	profile?: ArchProfile;
	profileBaseY?: number;
};

export function lineLength(start: LayoutVec2, end: LayoutVec2): number {
	return Math.hypot(end[0] - start[0], end[1] - start[1]);
}

export function openingIntervals(
	segment: DraftSegment,
	openings: readonly LayoutOpening[]
): WallOpeningInterval[] {
	return openings
		.filter((opening) => opening.segmentId === segment.id)
		.map((opening) => ({
			openingId: opening.id,
			startDistance: opening.offset,
			endDistance: opening.offset + opening.width,
			sillHeight: opening.sillHeight,
			height: opening.height,
			profile: opening.profile
		}))
		.sort((a, b) => a.startDistance - b.startDistance || a.openingId.localeCompare(b.openingId));
}

export function splitWallAroundOpenings(
	segment: DraftSegment,
	openings: readonly LayoutOpening[],
	wallHeight: number
): WallPreviewSection[] {
	const length = segmentLength(segment);
	const intervals = openingIntervals(segment, openings);
	const sections: WallPreviewSection[] = [];
	let cursor = 0;

	for (const interval of intervals) {
		const start = Math.max(0, interval.startDistance);
		const end = Math.min(length, interval.endDistance);
		if (end <= start + LAYOUT_GEOMETRY_EPSILON) continue;

		if (start > cursor + LAYOUT_GEOMETRY_EPSILON) {
			sections.push({ kind: 'side', startDistance: cursor, endDistance: start, bottomY: 0, topY: wallHeight });
		}

		if (interval.sillHeight > LAYOUT_GEOMETRY_EPSILON) {
			sections.push({
				kind: 'side',
				startDistance: start,
				endDistance: end,
				bottomY: 0,
				topY: Math.min(interval.sillHeight, wallHeight),
				openingId: interval.openingId
			});
		}

		const profileResult = buildArchProfile(interval.profile, interval.endDistance - interval.startDistance, interval.height);
		const profile = interval.profile === 'rectangular' ? undefined : (profileResult.profile ?? undefined);
		const lintelBottom = Math.min(interval.sillHeight + interval.height, wallHeight);
		if (lintelBottom < wallHeight - LAYOUT_GEOMETRY_EPSILON) {
			sections.push({
				kind: 'lintel',
				startDistance: start,
				endDistance: end,
				bottomY: lintelBottom,
				topY: wallHeight,
				openingId: interval.openingId,
				...(profile ? { profile, profileBaseY: interval.sillHeight } : {})
			});
		}
		cursor = Math.max(cursor, end);
	}

	if (cursor < length - LAYOUT_GEOMETRY_EPSILON) {
		sections.push({ kind: 'side', startDistance: cursor, endDistance: length, bottomY: 0, topY: wallHeight });
	}

	return sections;
}

export function sampleWallSegment(segment: DraftSegment) {
	return sampleSegment(segment);
}
