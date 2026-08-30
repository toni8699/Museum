import type { DraftSegment, LayoutOpening, LayoutVec2 } from './layout-types';
import type { CompiledArchProfile, CompiledWallSection } from './layout-geometry-types';
import { pointAlongSamples, sampleSegment, type CurveSample, type SampledSegment } from './layout-geometry-curve';

export const ARCH_PROFILE_EPSILON = 1e-6;
export const LAYOUT_GEOMETRY_EPSILON = 1e-6;

export type ArchProfile = CompiledArchProfile;

export type ArchProfileIssue = {
	code: string;
	message: string;
};

export type ArchProfileResult =
	| { profile: ArchProfile; issues: [] }
	| { profile: null; issues: ArchProfileIssue[] };

export type WallOpeningInterval = {
	openingId: string;
	startDistance: number;
	endDistance: number;
	sillHeight: number;
	height: number;
	profile: LayoutOpening['profile'];
};

export function lineLength(start: LayoutVec2, end: LayoutVec2): number {
	return Math.hypot(end[0] - start[0], end[1] - start[1]);
}

export function buildArchProfile(
	kind: LayoutOpening['profile'],
	width: number,
	height: number,
	epsilon = ARCH_PROFILE_EPSILON
): ArchProfileResult {
	if (!Number.isFinite(width) || width <= epsilon) return { profile: null, issues: [{ code: 'arch_profile_width_invalid', message: 'Arch profile width must be finite and greater than zero.' }] };
	if (!Number.isFinite(height) || height <= epsilon) return { profile: null, issues: [{ code: 'arch_profile_height_invalid', message: 'Arch profile height must be finite and greater than zero.' }] };
	const rise = width / 2;
	if (kind === 'rounded' && rise > height + epsilon) return { profile: null, issues: [{ code: 'rounded_arch_rise_exceeds_height', message: 'Rounded arch rise exceeds opening height.' }] };
	if (kind === 'pointed' && rise > height + epsilon) return { profile: null, issues: [{ code: 'pointed_arch_rise_exceeds_height', message: 'Pointed arch rise exceeds opening height.' }] };
	if (kind === 'rectangular') {
		return { profile: { kind, width, height, rise: height, topBoundary: [[0, height], [width, height]] }, issues: [] };
	}
	const springHeight = height - rise;
	if (kind === 'pointed') {
		return { profile: { kind, width, height, rise, topBoundary: [[0, springHeight], [width / 2, height], [width, springHeight]] }, issues: [] };
	}
	const radius = width / 2;
	const points: LayoutVec2[] = [];
	const subdivisions = 16;
	for (let index = 0; index <= subdivisions; index += 1) {
		const amount = index / subdivisions;
		const x = amount * width;
		const y = springHeight + Math.sqrt(Math.max(0, radius * radius - (x - radius) * (x - radius)));
		points.push([x, y]);
	}
	return { profile: { kind, width, height, rise, topBoundary: points }, issues: [] };
}

export function archProfileTopAt(profile: ArchProfile, x: number): number {
	const target = Math.min(profile.width, Math.max(0, x));
	const points = profile.topBoundary;
	if (points.length === 0) return profile.height;
	if (target <= points[0]![0]) return points[0]![1];
	for (let index = 1; index < points.length; index += 1) {
		const previous = points[index - 1]!;
		const current = points[index]!;
		if (target <= current[0]) {
			const span = current[0] - previous[0];
			const amount = span > ARCH_PROFILE_EPSILON ? (target - previous[0]) / span : 0;
			return previous[1] + (current[1] - previous[1]) * amount;
		}
	}
	return points.at(-1)![1];
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

/**
 * Split a wall's sampled centerline into side/sill/lintel solid sections.
 * This is the canonical compiled section model used by both renderers.
 * Convenience wrapper that samples a raw segment; the compiler uses
 * {@link splitSampledWallAroundOpenings} so each segment is sampled once.
 */
export function splitWallAroundOpenings(
	segment: DraftSegment,
	openings: readonly LayoutOpening[],
	wallHeight: number
): CompiledWallSection[] {
	return splitSampledWallAroundOpenings(sampleSegment(segment), segment, openings, wallHeight);
}

export function splitSampledWallAroundOpenings(
	sampled: SampledSegment,
	segment: DraftSegment,
	openings: readonly LayoutOpening[],
	wallHeight: number
): CompiledWallSection[] {
	const length = sampled.length;
	const intervals = openingIntervals(segment, openings);
	const sections: CompiledWallSection[] = [];
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

export function offsetInsideOpeningIntervals(
	offset: number,
	openings: readonly Pick<LayoutOpening, 'offset' | 'width'>[],
	epsilon = 1e-6
): boolean {
	return openings.some((opening) => {
		const start = opening.offset;
		const end = opening.offset + opening.width;
		return offset >= start - epsilon && offset <= end + epsilon;
	});
}

/**
 * Split a sampled wall centerline at opening interval endpoints, keeping solid
 * stubs (never culls a whole wall). This is the precomputed Plan wall-stroke
 * source.
 */
export function wallPolylinesAroundOpenings(
	samples: readonly CurveSample[],
	openings: readonly Pick<LayoutOpening, 'offset' | 'width'>[]
): LayoutVec2[][] {
	if (samples.length === 0) return [];
	if (samples.length === 1) return [[[...samples[0]!.point] as LayoutVec2]];
	const length = samples.at(-1)!.distance;
	const cuts = new Set<number>([0, length]);
	for (const opening of openings) {
		cuts.add(clamp(opening.offset, 0, length));
		cuts.add(clamp(opening.offset + opening.width, 0, length));
	}
	const sortedCuts = [...cuts].sort((a, b) => a - b);
	const polylines: LayoutVec2[][] = [];
	for (let index = 1; index < sortedCuts.length; index += 1) {
		const start = sortedCuts[index - 1]!;
		const end = sortedCuts[index]!;
		if (end - start <= 1e-6) continue;
		const mid = (start + end) / 2;
		if (offsetInsideOpeningIntervals(mid, openings)) continue;
		const points = samplesInDistanceRange(samples, start, end);
		if (points.length >= 2) polylines.push(points);
	}
	return polylines;
}

export function samplesInDistanceRange(
	samples: readonly CurveSample[],
	startDistance: number,
	endDistance: number
): LayoutVec2[] {
	if (samples.length === 0 || endDistance <= startDistance + 1e-6) return [];
	const points: LayoutVec2[] = [pointAlongSamples(samples, startDistance)];
	for (const sample of samples) {
		if (sample.distance > startDistance + 1e-6 && sample.distance < endDistance - 1e-6) {
			points.push([...sample.point] as LayoutVec2);
		}
	}
	points.push(pointAlongSamples(samples, endDistance));
	return points;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
