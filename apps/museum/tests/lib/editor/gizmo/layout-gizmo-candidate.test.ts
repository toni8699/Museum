/**
 * S8 step 1 — layout-gizmo-candidate tests.
 *
 * Exercises `deriveLayoutCandidate` + the per-kind document builders against
 * plain `LayoutDocument` fixtures (renderer-neutral, no store): valid
 * candidates for all five identities, exact wall closure, opening clamps,
 * geometry-invalid rejection, and missing-identity nulls. The commit-install
 * path and last-valid retention are covered by the adapter suite.
 */

import { describe, expect, it } from 'vitest';
import { createEmptySceneDocument } from '$lib/content/scene';
import type { LayoutDocument } from '$lib/layout/layout-types';
import { buildLayoutPreviewModel } from '$lib/editor/layout/layout-mesh-factory';
import {
	deriveLayoutCandidate,
	translateWallUnit,
	type LayoutGizmoCandidateBundle
} from '$lib/editor/gizmo/layout-gizmo-candidate';
import {
	deriveLayoutGizmoDelta,
	resolveLayoutGizmoTarget,
	type LayoutGizmoDelta,
	type LayoutGizmoProxyPose
} from '$lib/editor/gizmo/layout-gizmo-target';
import type { LayoutVec2 } from '$lib/layout/layout-types';

const SCENE = createEmptySceneDocument();

/** A 4×3 rectangle room (wall 0 = bottom [0,0]→[4,0]) + one door + one box. */
function makeRoomLayout(): LayoutDocument {
	return {
		units: 'meters',
		floors: [
			{
				id: 'floor-ground',
				name: 'Ground',
				elevation: 0,
				height: 3,
				rooms: [
					{
						id: 'room-1',
						name: 'Room 1',
						frame: { origin: [0, 0], yaw: 0 },
						boundary: {
							closed: true,
							segments: [
								{ id: 'room-1:wall:0', kind: 'line', start: [0, 0], end: [4, 0] },
								{ id: 'room-1:wall:1', kind: 'line', start: [4, 0], end: [4, 3] },
								{ id: 'room-1:wall:2', kind: 'line', start: [4, 3], end: [0, 3] },
								{ id: 'room-1:wall:3', kind: 'line', start: [0, 3], end: [0, 0] }
							]
						},
						wallThickness: 0.16,
						floorThickness: 0.1,
						ceilingThickness: 0.1,
						openings: [
							{
								id: 'opening:room-1:door:1',
								segmentId: 'room-1:wall:0',
								kind: 'door',
								offset: 1,
								width: 0.9,
								height: 2.1,
								sillHeight: 0,
								profile: 'rectangular'
							}
						]
					}
				]
			}
		],
		objects: [
			{
				id: 'layout-object-1',
				kind: 'box',
				position: [2, 0.5, 1],
				rotation: [0, 0, 0],
				dimensions: [1, 1, 1],
				roomId: 'room-1'
			}
		]
	};
}

function derive(
	layout: LayoutDocument,
	delta: LayoutGizmoDelta
): { bundle: LayoutGizmoCandidateBundle | null; issue: string | null } {
	const geometry = buildLayoutPreviewModel(layout).geometry;
	return deriveLayoutCandidate(
		{
			key: 'test',
			selection: { kind: 'none' } as never,
			proxyPose: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
			policy: undefined as never,
			baseline: undefined as never
		},
		delta,
		layout,
		SCENE,
		geometry,
		'project:test',
		'Test'
	);
}

function openingOf(bundle: LayoutGizmoCandidateBundle): { offset: number; width: number; height: number } {
	const opening = bundle.layout.floors[0]!.rooms[0]!.openings[0]!;
	return { offset: opening.offset, width: opening.width, height: opening.height };
}

describe('translateWallUnit — exact closure', () => {
	it('moves the selected wall endpoints + interior anchors and the adjacent shared corners by the delta', () => {
		const layout = makeRoomLayout();
		const next = translateWallUnit(layout, 'room-1', 'room-1:wall:0', [1, 0])!;
		const segments = next.floors[0]!.rooms[0]!.boundary.segments;
		// Selected wall: both endpoints moved.
		expect(segments[0]!.start).toEqual([1, 0]);
		expect(segments[0]!.end).toEqual([5, 0]);
		// Previous wall (index 3) shares the start corner.
		expect(segments[3]!.end).toEqual([1, 0]);
		// Next wall (index 1) shares the end corner.
		expect(segments[1]!.start).toEqual([5, 0]);
		// Unrelated wall untouched.
		expect(segments[2]!.start).toEqual([4, 3]);
		expect(segments[2]!.end).toEqual([0, 3]);
		// Closure stays exact.
		for (let index = 0; index < segments.length; index += 1) {
			const nextIndex = (index + 1) % segments.length;
			expect(segments[index]!.end).toEqual(segments[nextIndex]!.start);
		}
	});

	it('returns null for a missing room/segment or a non-finite delta', () => {
		const layout = makeRoomLayout();
		expect(translateWallUnit(layout, 'nope', 'room-1:wall:0', [1, 0])).toBeNull();
		expect(translateWallUnit(layout, 'room-1', 'nope', [1, 0])).toBeNull();
		expect(translateWallUnit(layout, 'room-1', 'room-1:wall:0', [Number.NaN, 0])).toBeNull();
	});
});

describe('deriveLayoutCandidate — per-kind valid candidates', () => {
	it('room: rigid translate yields a valid candidate bundle', () => {
		const layout = makeRoomLayout();
		const descriptor = resolveLayoutGizmoTarget(
			layout,
			buildLayoutPreviewModel(layout).geometry,
			{ kind: 'room', roomId: 'room-1' }
		)!;
		const delta: LayoutGizmoDelta = { kind: 'room', translation: [1, 0], yaw: 0 };
		const result = deriveLayoutCandidate(
			descriptor,
			delta,
			layout,
			SCENE,
			buildLayoutPreviewModel(layout).geometry,
			'project:test',
			'Test'
		);
		expect(result.issue).toBeNull();
		expect(result.bundle).not.toBeNull();
		// The whole room moved by [1, 0].
		const room = result.bundle!.layout.floors[0]!.rooms[0]!;
		expect(room.boundary.segments[0]!.start).toEqual([1, 0]);
		expect(room.boundary.segments[0]!.end).toEqual([5, 0]);
		// The whole room moved by [1, 0]: every point shifts by [1, 0].
		expect(room.boundary.segments[1]!.end).toEqual([5, 3]);
		expect(room.boundary.segments[3]!.start).toEqual([1, 3]);
		expect(room.boundary.segments[3]!.end).toEqual([1, 0]);
	});

	it('wall: translateWallUnit candidate is valid and keeps closure', () => {
		const layout = makeRoomLayout();
		const descriptor = resolveLayoutGizmoTarget(
			layout,
			buildLayoutPreviewModel(layout).geometry,
			{ kind: 'wall', roomId: 'room-1', segmentId: 'room-1:wall:0' }
		)!;
		const delta: LayoutGizmoDelta = { kind: 'wall', translation: [0, 1] };
		const result = deriveLayoutCandidate(
			descriptor,
			delta,
			layout,
			SCENE,
			buildLayoutPreviewModel(layout).geometry,
			'project:test',
			'Test'
		);
		expect(result.issue).toBeNull();
		expect(result.bundle).not.toBeNull();
	});

	it('opening: translate re-centers the opening along the wall', () => {
		const layout = makeRoomLayout();
		const descriptor = resolveLayoutGizmoTarget(
			layout,
			buildLayoutPreviewModel(layout).geometry,
			{ kind: 'opening', roomId: 'room-1', segmentId: 'room-1:wall:0', openingId: 'opening:room-1:door:1' }
		)!;
		// centerShiftX +0.5 → offset 1 → 1.5.
		const delta: LayoutGizmoDelta = { kind: 'opening', centerShiftX: 0.5, width: 0.9, height: 2.1 };
		const result = deriveLayoutCandidate(
			descriptor,
			delta,
			layout,
			SCENE,
			buildLayoutPreviewModel(layout).geometry,
			'project:test',
			'Test'
		);
		expect(result.issue).toBeNull();
		expect(result.bundle).not.toBeNull();
		expect(openingOf(result.bundle!).offset).toBeCloseTo(1.5);
		expect(openingOf(result.bundle!).width).toBeCloseTo(0.9);
		expect(openingOf(result.bundle!).height).toBeCloseTo(2.1);
	});

	it('opening: clamps offset/width to the wall length', () => {
		const layout = makeRoomLayout();
		const descriptor = resolveLayoutGizmoTarget(
			layout,
			buildLayoutPreviewModel(layout).geometry,
			{ kind: 'opening', roomId: 'room-1', segmentId: 'room-1:wall:0', openingId: 'opening:room-1:door:1' }
		)!;
		// A huge centerShiftX must clamp the offset so the opening stays inside
		// the 4 m wall.
		const delta: LayoutGizmoDelta = { kind: 'opening', centerShiftX: 100, width: 0.9, height: 2.1 };
		const result = deriveLayoutCandidate(
			descriptor,
			delta,
			layout,
			SCENE,
			buildLayoutPreviewModel(layout).geometry,
			'project:test',
			'Test'
		);
		expect(result.issue).toBeNull();
		const opening = openingOf(result.bundle!);
		expect(opening.offset).toBeLessThanOrEqual(4 - opening.width + 1e-9);
	});

	it('interior anchor and object: baseline-relative candidates', () => {
		// Interior anchor on an auto-bezier wall.
		const anchorLayout: LayoutDocument = {
			units: 'meters',
			floors: [
				{
					id: 'floor-ground',
					name: 'Ground',
					elevation: 0,
					height: 3,
					rooms: [
						{
							id: 'room-1',
							name: 'Room 1',
							frame: { origin: [0, 0], yaw: 0 },
							boundary: {
								closed: true,
								segments: [
									{
										id: 'room-1:wall:0',
										kind: 'auto-bezier',
										start: [0, 0],
										end: [4, 0],
										interiorAnchors: [{ id: 'room-1:wall:0:anchor:1', point: [2, 0.5] }]
									},
									{ id: 'room-1:wall:1', kind: 'line', start: [4, 0], end: [4, 3] },
									{ id: 'room-1:wall:2', kind: 'line', start: [4, 3], end: [0, 3] },
									{ id: 'room-1:wall:3', kind: 'line', start: [0, 3], end: [0, 0] }
								]
							},
							wallThickness: 0.16,
							floorThickness: 0.1,
							ceilingThickness: 0.1,
							openings: []
						}
					]
				}
			],
			objects: []
		};
		const anchorDescriptor = resolveLayoutGizmoTarget(
			anchorLayout,
			buildLayoutPreviewModel(anchorLayout).geometry,
			{ kind: 'interiorAnchor', roomId: 'room-1', segmentId: 'room-1:wall:0', anchorId: 'room-1:wall:0:anchor:1' }
		)!;
		const anchorResult = deriveLayoutCandidate(
			anchorDescriptor,
			{ kind: 'interiorAnchor', translation: [0.5, 0] },
			anchorLayout,
			SCENE,
			buildLayoutPreviewModel(anchorLayout).geometry,
			'project:test',
			'Test'
		);
		expect(anchorResult.issue).toBeNull();
		const anchor = anchorResult.bundle!.layout.floors[0]!.rooms[0]!.boundary.segments[0]!;
		expect(anchor.kind).toBe('auto-bezier');
		const bezier = anchor as Extract<typeof anchor, { kind: 'auto-bezier' }>;
		expect(bezier.interiorAnchors[0]!.point).toEqual([2.5, 0.5]);

		// Object.
		const objectLayout = makeRoomLayout();
		const objectDescriptor = resolveLayoutGizmoTarget(
			objectLayout,
			buildLayoutPreviewModel(objectLayout).geometry,
			{ kind: 'object', objectId: 'layout-object-1' }
		)!;
		const objectResult = deriveLayoutCandidate(
			objectDescriptor,
			{ kind: 'object', position: [1, 0, 0], rotation: [0, 0, 0], dimensions: [1, 1, 1] },
			objectLayout,
			SCENE,
			buildLayoutPreviewModel(objectLayout).geometry,
			'project:test',
			'Test'
		);
		expect(objectResult.issue).toBeNull();
		const object = objectResult.bundle!.layout.objects[0]!;
		expect(object.position).toEqual([3, 0.5, 1]);
	});
});

describe('deriveLayoutCandidate — rejection paths', () => {
	it('returns null + issue when the candidate geometry is invalid (opening over height)', () => {
		const layout = makeRoomLayout();
		const descriptor = resolveLayoutGizmoTarget(
			layout,
			buildLayoutPreviewModel(layout).geometry,
			{ kind: 'opening', roomId: 'room-1', segmentId: 'room-1:wall:0', openingId: 'opening:room-1:door:1' }
		)!;
		// sill 0 + height 3.5 > floor height 3 → blocking `opening_over_height`.
		const delta: LayoutGizmoDelta = { kind: 'opening', centerShiftX: 0, width: 0.9, height: 3.5 };
		const result = deriveLayoutCandidate(
			descriptor,
			delta,
			layout,
			SCENE,
			buildLayoutPreviewModel(layout).geometry,
			'project:test',
			'Test'
		);
		expect(result.bundle).toBeNull();
		expect(result.issue).not.toBeNull();
	});

	it('returns null for a missing identity (stale descriptor)', () => {
		const layout = makeRoomLayout();
		const result = derive(
			layout,
			{ kind: 'room', translation: [1, 0], yaw: 0 }
		);
		// The stub descriptor has a `none` selection, so no builder matches.
		expect(result.bundle).toBeNull();
		expect(result.issue).not.toBeNull();
	});

	it('derives a delta from a proxy pose and feeds it back (round-trip)', () => {
		const layout = makeRoomLayout();
		const descriptor = resolveLayoutGizmoTarget(
			layout,
			buildLayoutPreviewModel(layout).geometry,
			{ kind: 'room', roomId: 'room-1' }
		)!;
		// Simulate the proxy moved +2 on X from the baseline pose.
		const pose: LayoutGizmoProxyPose = {
			position: [descriptor.proxyPose.position[0] + 2, descriptor.proxyPose.position[1], descriptor.proxyPose.position[2]],
			rotation: [0, 0, 0],
			scale: [1, 1, 1]
		};
		const delta = deriveLayoutGizmoDelta(descriptor, pose)!;
		expect(delta).toMatchObject({ kind: 'room' });
		if (delta.kind !== 'room') return;
		expect(delta.translation[0]).toBeCloseTo(2);
		const result = deriveLayoutCandidate(
			descriptor,
			delta,
			layout,
			SCENE,
			buildLayoutPreviewModel(layout).geometry,
			'project:test',
			'Test'
		);
		expect(result.issue).toBeNull();
		expect(result.bundle).not.toBeNull();
	});

	it('never throws for a non-finite delta', () => {
		const layout = makeRoomLayout();
		expect(() =>
			derive(layout, { kind: 'room', translation: [Number.NaN, 0], yaw: 0 })
		).not.toThrow();
	});
});
