import type { LayoutOpening, LayoutVec2 } from './layout-types';

export const ARCH_PROFILE_EPSILON = 1e-6;

export type ArchProfile = {
	kind: LayoutOpening['profile'];
	width: number;
	height: number;
	rise: number;
	/** Ordered x/y points describing the opening's top boundary in local elevation space. */
	topBoundary: LayoutVec2[];
};

export type ArchProfileIssue = {
	code: string;
	message: string;
};

export type ArchProfileResult =
	| { profile: ArchProfile; issues: [] }
	| { profile: null; issues: ArchProfileIssue[] };

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
