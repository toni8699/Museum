import { describe, expect, it } from 'vitest';
import { chopinProject } from '$lib/content/chopin-project';
import { buildScaleFixture, SCALE_FIXTURE_SEEDS } from './__fixtures__/layout-scale-fixtures';
import { sampleSegment } from '$lib/layout/layout-geometry-curve';
import type { DraftSegment, LayoutDocument, LayoutVec2 } from '$lib/layout/layout-types';

/**
 * Deterministic guard for the G4 "no coincident cross-room walls" claim in
 * `docs/hand-off/CURRENT.md`. Two walls from different rooms that lie on the
 * same line with overlapping intervals render coincident faces → z-fighting.
 * This scans every cross-room wall pair and fails on the first coincident
 * pair, so a future data edit cannot silently reintroduce z-fighting.
 *
 * Walls are scanned as sampled polylines, not endpoint chords: a bezier wall
 * is tessellated into straight spans by the wall mesh builder, so a curved
 * wall can coincide with another wall where its straight chord does not (and
 * vice-versa). Line walls keep a single exact chord.
 */

type WallChord = {
	roomId: string;
	segmentId: string;
	start: LayoutVec2;
	end: LayoutVec2;
};

/** A room wall plus its pre-sampled spans (one exact chord for lines) and axis-aligned bounds. */
type WallSegment = {
	roomId: string;
	segmentId: string;
	chords: WallChord[];
	min: LayoutVec2;
	max: LayoutVec2;
};

/** Absolute tolerance in meters; fixtures use clean grid coordinates, Chopin real ones. */
const EPSILON = 1e-6;

function segmentBounds(chords: readonly WallChord[]): { min: LayoutVec2; max: LayoutVec2 } {
	let min: LayoutVec2 = [Infinity, Infinity];
	let max: LayoutVec2 = [-Infinity, -Infinity];
	for (const chord of chords) {
		for (const point of [chord.start, chord.end]) {
			min = [Math.min(min[0], point[0]), Math.min(min[1], point[1])];
			max = [Math.max(max[0], point[0]), Math.max(max[1], point[1])];
		}
	}
	return { min, max };
}

/** Cheap necessary-condition prefilter: coincident walls must overlap in both axes. */
function boundsOverlap(a: WallSegment, b: WallSegment): boolean {
	return (
		a.min[0] <= b.max[0] + EPSILON &&
		a.max[0] >= b.min[0] - EPSILON &&
		a.min[1] <= b.max[1] + EPSILON &&			a.max[1] >= b.min[1] - EPSILON
	);
}

function cross([ax, az]: LayoutVec2, [bx, bz]: LayoutVec2): number {
	return ax * bz - az * bx;
}

function sub(a: LayoutVec2, b: LayoutVec2): LayoutVec2 {
	return [a[0] - b[0], a[1] - b[1]];
}

/** Sample a wall segment into its tessellated spans; lines stay a single chord. */
function segmentChords(segment: DraftSegment): WallChord[] {
	if (segment.kind === 'line') {
		return [{ roomId: '', segmentId: segment.id, start: segment.start, end: segment.end }];
	}
	const samples = sampleSegment(segment).samples;
	const chords: WallChord[] = [];
	for (let index = 1; index < samples.length; index += 1) {
		chords.push({
			roomId: '',
			segmentId: segment.id,
			start: samples[index - 1]!.point,
			end: samples[index]!.point
		});
	}
	return chords;
}

/** Collect every room wall, pre-sampled for the pair scan. */
function wallSegments(document: LayoutDocument): WallSegment[] {
	const segments: WallSegment[] = [];
	for (const floor of document.floors) {
		for (const room of floor.rooms) {
			for (const segment of room.boundary.segments) {
				const chords = segmentChords(segment);
				segments.push({
					roomId: room.id,
					segmentId: segment.id,
					chords,
					...segmentBounds(chords)
				});
			}
		}
	}
	return segments;
}

/**
 * Two straight chords are coincident when they are collinear (parallel and on
 * the same line) and their projections onto that line overlap by more than
 * `EPSILON`. Parallel-but-offset walls (e.g. two rooms with their own walls)
 * are fine.
 */
export function coincident(a: WallChord, b: WallChord): boolean {
	const dirA = sub(a.end, a.start);
	const dirB = sub(b.end, b.start);
	const lenA = Math.hypot(dirA[0], dirA[1]);
	const lenB = Math.hypot(dirB[0], dirB[1]);
	if (lenA <= EPSILON || lenB <= EPSILON) return false;

	// Collinear: near-parallel directions AND b.start lies on a's line.
	if (Math.abs(cross(dirA, dirB)) > 1e-9 * lenA * lenB) return false;
	if (Math.abs(cross(dirA, sub(b.start, a.start))) > EPSILON * lenA) return false;

	// Project all four endpoints onto dirA and check interval overlap. Both
	// intervals are normalized first so a reversed-direction wall (endpoint
	// order flipped) is treated identically to its forward twin.
	const origin = a.start;
	const project = (point: LayoutVec2): number =>
		((point[0] - origin[0]) * dirA[0] + (point[1] - origin[1]) * dirA[1]) / (lenA * lenA);
	const a0 = project(a.start);
	const a1 = project(a.end);
	const b0 = project(b.start);
	const b1 = project(b.end);
	const overlap =
		Math.min(Math.max(a0, a1), Math.max(b0, b1)) - Math.max(Math.min(a0, a1), Math.min(b0, b1));
	return overlap > EPSILON;
}

/** Two walls are coincident when any sampled span of one is coincident with any span of the other. */
function coincidentSegments(a: WallSegment, b: WallSegment): boolean {
	for (const chordA of a.chords) {
		for (const chordB of b.chords) {
			if (coincident(chordA, chordB)) return true;
		}
	}
	return false;
}

function coincidentPairs(segments: readonly WallSegment[]): Array<[WallSegment, WallSegment]> {
	const pairs: Array<[WallSegment, WallSegment]> = [];
	for (let i = 0; i < segments.length; i += 1) {
		for (let j = i + 1; j < segments.length; j += 1) {
			const a = segments[i]!;
			const b = segments[j]!;
			if (a.roomId === b.roomId) continue;
			if (!boundsOverlap(a, b)) continue;
			if (coincidentSegments(a, b)) pairs.push([a, b]);
		}
	}
	return pairs;
}

describe('shared walls guard', () => {
	it('detects a known coincident cross-room pair (self-check)', () => {
		const shared: WallChord = { roomId: 'a', segmentId: 'a:w', start: [0, 0], end: [0, 4] };
		const overlap: WallChord = { roomId: 'b', segmentId: 'b:w', start: [0, 1], end: [0, 3] };
		const offset: WallChord = { roomId: 'c', segmentId: 'c:w', start: [0.2, 0], end: [0.2, 4] };
		expect(coincident(shared, overlap)).toBe(true);
		// Parallel but on a distinct line is not coincident.
		expect(coincident(shared, offset)).toBe(false);
	});

	it('treats a reversed-direction wall as coincident (self-check)', () => {
		const shared: WallChord = { roomId: 'a', segmentId: 'a:w', start: [0, 0], end: [0, 4] };
		const reversed: WallChord = { roomId: 'b', segmentId: 'b:w', start: [0, 3], end: [0, 1] };
		expect(coincident(shared, reversed)).toBe(true);
		expect(coincident(reversed, shared)).toBe(true);
	});

	it('samples bezier walls instead of their endpoint chords (self-check)', () => {
		const bulgeCurve: DraftSegment = {
			id: 'curve',
			kind: 'auto-bezier',
			start: [0, 0],
			end: [0, 4],
			interiorAnchors: [{ id: 'curve:anchor:0', point: [1, 2] }]
		};
		const straightChords: WallChord[] = [{ roomId: '', segmentId: 'a:w', start: [0, 0], end: [0, 4] }];
		const straight: WallSegment = {
			roomId: 'a',
			segmentId: 'a:w',
			chords: straightChords,
			...segmentBounds(straightChords)
		};
		// Same endpoint chord as `straight`, but the curve bulges away from the
		// line — a chord-only scan would flag this as a false positive.
		const bulgingChords = segmentChords(bulgeCurve);
		const bulging: WallSegment = {
			roomId: 'b',
			segmentId: 'b:w',
			chords: bulgingChords,
			...segmentBounds(bulgingChords)
		};
		// Two rooms sharing an identical curved wall do coincide (the old chord
		// scan could not see this when the shared span is not the full chord).
		const identical: WallSegment = {
			roomId: 'c',
			segmentId: 'c:w',
			chords: bulgingChords,
			...segmentBounds(bulgingChords)
		};
		expect(coincidentSegments(straight, bulging)).toBe(false);
		expect(coincidentSegments(bulging, identical)).toBe(true);
	});

	it('finds no coincident cross-room walls in the Chopin layout', () => {
		const pairs = coincidentPairs(wallSegments(chopinProject.layout));
		expect(pairs.map(describePair)).toEqual([]);
	});

	it.each([
		['small', SCALE_FIXTURE_SEEDS.small],
		['medium', SCALE_FIXTURE_SEEDS.medium],
		['large', SCALE_FIXTURE_SEEDS.large]
	] as const)('finds no coincident cross-room walls in the %s scale fixture', (_tier, spec) => {
		const pairs = coincidentPairs(wallSegments(buildScaleFixture(spec)));
		expect(pairs.map(describePair)).toEqual([]);
	});
});

function describePair([a, b]: [WallSegment, WallSegment]): string {
	return `${a.roomId}/${a.segmentId} ↔ ${b.roomId}/${b.segmentId}`;
}
