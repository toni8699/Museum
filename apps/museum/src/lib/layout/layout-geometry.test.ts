import { describe, expect, it } from 'vitest';
import { chopinProject } from '$lib/content/chopin-project';
import { compileLayoutGeometry } from './layout-geometry';
import {
	g1AutoBezierDocument,
	g1ElevatedFloorDocument,
	g1InvalidGeometryDocument,
	g1LineRectangleDocument,
	g1LShapedDocument,
	g1MultipleOpeningsDocument,
	g1ObjectMatrixDocument,
	g1ProfileMatrixDocument
} from './__fixtures__/layout-g1-fixtures';
import { normalizeForParity } from './__fixtures__/layout-g1-normalize';

describe('compileLayoutGeometry', () => {
	it('compiles a line rectangle with ordered polygon, densified lines, sections, and bounds', () => {
		const { geometry, issues } = compileLayoutGeometry(g1LineRectangleDocument());
		expect(issues).toEqual([]);
		const room = geometry.rooms[0]!;
		expect(room.roomId).toBe('room-rectangle');
		expect(room.floorPolygon).toHaveLength(4);
		expect(room.floorElevation).toBe(0);
		expect(room.ceilingElevation).toBe(3);
		expect(room.walls).toHaveLength(4);
		for (const wall of room.walls) {
			// 0.25 m max sample span densifies the 6 m and 4 m edges.
			expect(wall.samples.length).toBeGreaterThan(1);
			for (const sample of wall.samples) {
				expect(Number.isFinite(sample.point[0])).toBe(true);
				expect(Number.isFinite(sample.point[1])).toBe(true);
				expect(Math.hypot(sample.tangent[0], sample.tangent[1])).toBeCloseTo(1, 9);
				expect(Math.hypot(sample.normal[0], sample.normal[1])).toBeCloseTo(1, 9);
			}
			expect(wall.sections.some((section) => section.kind === 'side')).toBe(true);
		}
		expect(geometry.bounds).not.toBeNull();
	});

	it('keeps L-shaped room polygon order and line density', () => {
		const { geometry } = compileLayoutGeometry(g1LShapedDocument());
		const room = geometry.rooms[0]!;
		expect(room.floorPolygon).toHaveLength(6);
		expect(room.walls.map((wall) => wall.segmentId)).toEqual([
			'room-l:wall:0',
			'room-l:wall:1',
			'room-l:wall:2',
			'room-l:wall:3',
			'room-l:wall:4',
			'room-l:wall:5'
		]);
	});

	it('samples auto-bezier adaptively with monotonic distances and unit frames', () => {
		const { geometry, issues } = compileLayoutGeometry(g1AutoBezierDocument());
		expect(issues).toEqual([]);
		const bezierWall = geometry.rooms[0]!.walls[0]!;
		expect(bezierWall.samples.length).toBeGreaterThan(2);
		for (let index = 1; index < bezierWall.samples.length; index += 1) {
			expect(bezierWall.samples[index]!.distance).toBeGreaterThan(bezierWall.samples[index - 1]!.distance);
			expect(bezierWall.samples[index]!.distance - bezierWall.samples[index - 1]!.distance).toBeLessThanOrEqual(0.25 + 1e-6);
		}
		expect(bezierWall.length).toBeGreaterThan(6);
	});

	it('splits multiple openings into ordered sill/lintel/side sections without issues', () => {
		const { geometry, issues } = compileLayoutGeometry(g1MultipleOpeningsDocument());
		expect(issues).toEqual([]);
		const wall = geometry.rooms[0]!.walls.find((candidate) => candidate.segmentId === 'room-openings:wall:0')!;
		expect(wall.openings.map((opening) => opening.openingId)).toEqual(['door-1', 'window-1']);
		expect(wall.sections.some((section) => section.kind === 'lintel')).toBe(true);
		expect(wall.sections.some((section) => section.kind === 'side' && section.openingId === 'window-1')).toBe(true);
		expect(wall.solidSpans.length).toBeGreaterThan(0);
	});

	it('derives all three opening elevation profiles and resolved solid-span bottoms', () => {
		const { geometry, issues } = compileLayoutGeometry(g1ProfileMatrixDocument());
		expect(issues).toEqual([]);
		const wall = geometry.rooms[0]!.walls[0]!;
		const profiles = wall.openings.map((opening) => [opening.openingId, opening.profile] as const);
		expect(profiles).toEqual([
			['rect', 'rectangular'],
			['rounded', 'rounded'],
			['pointed', 'pointed']
		]);
		expect(wall.openings[1]!.profileShape).toBeDefined();
		expect(wall.openings[2]!.profileShape).toBeDefined();
		const lintelSpans = wall.solidSpans.filter((span) => wall.sections[span.sectionIndex]!.kind === 'lintel');
		expect(lintelSpans.length).toBeGreaterThan(0);
	});

	it('preserves elevated floor Y extents', () => {
		const { geometry } = compileLayoutGeometry(g1ElevatedFloorDocument());
		const room = geometry.rooms[0]!;
		expect(room.floorElevation).toBe(2.5);
		expect(room.ceilingElevation).toBe(6.5);
		expect(geometry.bounds!.min[1]).toBeCloseTo(2.5 - room.floorThickness, 9);
		expect(geometry.bounds!.max[1]).toBeCloseTo(6.5 + room.ceilingThickness, 9);
	});

	it('emits an object-targeted issue and omits invalid objects', () => {
		const document = g1ObjectMatrixDocument();
		document.objects.push({
			id: 'obj-bad',
			kind: 'box',
			position: [1, 0.5, 1],
			rotation: [0, 0, 0],
			dimensions: [0, 1, 1],
			roomId: 'room-objects'
		});
		const { geometry, issues } = compileLayoutGeometry(document);
		expect(issues.some((issue) => issue.code === 'object_invalid' && issue.targetId === 'obj-bad')).toBe(true);
		expect(geometry.objects.map((object) => object.objectId)).not.toContain('obj-bad');
		expect(geometry.objects.map((object) => object.objectId)).toContain('obj-box');
	});

	it('compiles object descriptors with stored transforms, footprints, and readonly profile', () => {
		const { geometry } = compileLayoutGeometry(g1ObjectMatrixDocument());
		expect(geometry.objects.map((object) => object.objectId)).toEqual([
			'obj-box',
			'obj-plane',
			'obj-cylinder',
			'obj-sphere',
			'obj-profile'
		]);
		const sphere = geometry.objects.find((object) => object.objectId === 'obj-sphere')!;
		expect(sphere.dimensions).toEqual([1.2, 0.8, 1.2]);
		expect(sphere.planFootprint.length).toBeGreaterThan(2);
		const profile = geometry.objects.find((object) => object.objectId === 'obj-profile')!;
		expect(profile.readonly).toBe(true);
	});

	it('returns structured issues and still compiles the valid room', () => {
		const { geometry, issues } = compileLayoutGeometry(g1InvalidGeometryDocument());
		expect(geometry.rooms.map((room) => room.roomId)).toEqual(['room-good']);
		expect(issues.some((issue) => issue.code === 'disconnected_boundary')).toBe(true);
		expect(issues.some((issue) => issue.code === 'self_intersection')).toBe(true);
	});

	it('compiles the canonical Chopin project with stable order and no blocking issues', () => {
		const { geometry, issues } = compileLayoutGeometry(chopinProject.layout);
		expect(issues).toEqual([]);
		expect(geometry.rooms.map((room) => room.roomId)).toEqual([
			'entrance',
			'poland',
			'departure',
			'paris',
			'workshop',
			'music-chamber',
			'legacy'
		]);
		expect(geometry.rooms.every((room) => room.floorElevation === 0 && room.ceilingElevation === 4.2)).toBe(true);
		const entrance = geometry.rooms[0]!;
		const doorWall = entrance.walls.find((wall) => wall.segmentId === 'room:entrance:wall:pos-x')!;
		expect(doorWall.sections.some((section) => section.kind === 'side')).toBe(true);
		expect(doorWall.sections.some((section) => section.kind === 'lintel')).toBe(true);
		expect(doorWall.openings.some((opening) => opening.openingId === 'opening:entrance:entrance-from-legacy')).toBe(true);
	});

	it('is deterministic and does not mutate a deep-frozen document', () => {
		const document = g1AutoBezierDocument();
		const frozen = Object.freeze(JSON.parse(JSON.stringify(document)));
		const first = compileLayoutGeometry(frozen as never);
		const second = compileLayoutGeometry(frozen as never);
		expect(normalizeForParity(first)).toEqual(normalizeForParity(second));
		expect(second.issues).toEqual([]);
	});
});
