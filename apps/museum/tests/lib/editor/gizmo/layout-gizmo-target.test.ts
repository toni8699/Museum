import { describe, expect, it } from 'vitest';
import { compileLayoutGeometry } from '$lib/layout/layout-geometry';
import { geometryId } from '$lib/layout/layout-geometry-types';
import { pointAlongSamples } from '$lib/layout/layout-geometry-curve';
import type { LayoutDocument } from '$lib/layout/layout-types';
import type { LayoutSelection } from '$lib/editor/layout/layout-interaction';
import {
	deriveLayoutGizmoDelta,
	resolveLayoutGizmoTarget,
	type LayoutGizmoProxyPose
} from '$lib/editor/gizmo/layout-gizmo-target';
import { isAxisAllowed, projectGizmoCapabilities } from '$lib/editor/gizmo/editor-gizmo-policy';
import {
	g1AutoBezierDocument,
	g1LineRectangleDocument,
	g1MultipleOpeningsDocument,
	g1ObjectMatrixDocument
} from '../../layout/__fixtures__/layout-g1-fixtures';

/** A room whose wall0 is an auto-bezier curve carrying one opening. */
function curvedOpeningDocument(): LayoutDocument {
	const document = g1AutoBezierDocument();
	const room = document.floors[0]!.rooms[0]!;
	room.openings = [
		{
			id: 'curved-door',
			segmentId: 'room-rectangle:wall:0',
			kind: 'door',
			offset: 1,
			width: 1,
			height: 2.1,
			sillHeight: 0,
			profile: 'rectangular'
		}
	];
	return document;
}

function compiled(document: LayoutDocument) {
	return compileLayoutGeometry(document).geometry;
}

function poseOf(position: LayoutGizmoProxyPose['position'], rotation?: LayoutGizmoProxyPose['rotation'], scale?: LayoutGizmoProxyPose['scale']): LayoutGizmoProxyPose {
	return {
		position: [...position],
		rotation: rotation ? [...rotation] : [0, 0, 0],
		scale: scale ? [...scale] : [1, 1, 1]
	};
}

describe('resolveLayoutGizmoTarget — room', () => {
	it('resolves the sampled room centroid at floor elevation with identity rotation/scale', () => {
		const document = g1LineRectangleDocument();
		const geometry = compiled(document);
		const descriptor = resolveLayoutGizmoTarget(document, geometry, {
			kind: 'room',
			roomId: 'room-rectangle'
		});
		expect(descriptor).not.toBeNull();
		if (!descriptor) return;
		// 6×4 rectangle at origin → centroid (3, 2), floor elevation 0.
		expect(descriptor.proxyPose.position).toEqual([3, 0, 2]);
		expect(descriptor.proxyPose.rotation).toEqual([0, 0, 0]);
		expect(descriptor.proxyPose.scale).toEqual([1, 1, 1]);
		expect(descriptor.baseline).toEqual({
			kind: 'room',
			position: [3, 0, 2],
			yaw: 0
		});
	});

	it('uses the elevation of the authored floor (not zero)', () => {
		const document = g1LineRectangleDocument();
		document.floors[0]!.elevation = 2.5;
		const descriptor = resolveLayoutGizmoTarget(document, compiled(document), {
			kind: 'room',
			roomId: 'room-rectangle'
		});
		expect(descriptor?.proxyPose.position).toEqual([3, 2.5, 2]);
	});

	it('derives X/Z translation and positive-Y yaw deltas, baseline-relative without compounding', () => {
		const document = g1LineRectangleDocument();
		const descriptor = resolveLayoutGizmoTarget(document, compiled(document), {
			kind: 'room',
			roomId: 'room-rectangle'
		})!;
		// Translate the proxy.
		expect(
			deriveLayoutGizmoDelta(descriptor, poseOf([5, 0, 6]))
		).toEqual({ kind: 'room', translation: [2, 4], yaw: 0 });
		// Rotate the proxy +Y only.
		expect(
			deriveLayoutGizmoDelta(descriptor, poseOf([3, 0, 2], [0, Math.PI / 2, 0]))
		).toEqual({ kind: 'room', translation: [0, 0], yaw: Math.PI / 2 });
		// Never compounds from a previous delta: a fresh baseline-relative call
		// returns the same value regardless of prior calls.
		deriveLayoutGizmoDelta(descriptor, poseOf([9, 0, 10]));
		expect(deriveLayoutGizmoDelta(descriptor, poseOf([5, 0, 6]))).toEqual({
			kind: 'room',
			translation: [2, 4],
			yaw: 0
		});
	});
});

describe('resolveLayoutGizmoTarget — wall', () => {
	it('resolves the compiled half-arc center vertically centered between floor and ceiling', () => {
		const document = g1LineRectangleDocument();
		const geometry = compiled(document);
		const descriptor = resolveLayoutGizmoTarget(document, geometry, {
			kind: 'wall',
			roomId: 'room-rectangle',
			segmentId: 'room-rectangle:wall:0'
		});
		expect(descriptor).not.toBeNull();
		if (!descriptor) return;
		const wall = geometry.rooms[0]!.walls.find((w) => w.segmentId === 'room-rectangle:wall:0')!;
		// 6 m straight bottom edge → half-arc center (3, 0); midY = (0+3)/2.
		expect(descriptor.proxyPose.position).toEqual([3, 1.5, 0]);
		expect(wall.length).toBeCloseTo(6, 9);
		expect(descriptor.baseline).toEqual({ kind: 'wall', position: [3, 1.5, 0] });
	});

	it('places a curved wall at its compiled half-arc center', () => {
		const document = g1AutoBezierDocument();
		const geometry = compiled(document);
		const descriptor = resolveLayoutGizmoTarget(document, geometry, {
			kind: 'wall',
			roomId: 'room-rectangle',
			segmentId: 'room-rectangle:wall:0'
		})!;
		const wall = geometry.rooms[0]!.walls.find((w) => w.segmentId === 'room-rectangle:wall:0')!;
		const center = pointAlongSamples(wall.samples, wall.length / 2);
		expect(descriptor.proxyPose.position).toEqual([center[0], 1.5, center[1]]);
		expect(wall.length).toBeGreaterThan(6); // the curve is longer than its chord
	});

	it('derives X/Z translation deltas', () => {
		const document = g1LineRectangleDocument();
		const descriptor = resolveLayoutGizmoTarget(document, compiled(document), {
			kind: 'wall',
			roomId: 'room-rectangle',
			segmentId: 'room-rectangle:wall:0'
		})!;
		expect(deriveLayoutGizmoDelta(descriptor, poseOf([4, 1.5, 2]))).toEqual({
			kind: 'wall',
			translation: [1, 2]
		});
	});
});

describe('resolveLayoutGizmoTarget — opening', () => {
	it('resolves the compiled bottom-center (floor + sill) with local X along the tangent', () => {
		const document = g1MultipleOpeningsDocument();
		const geometry = compiled(document);
		const descriptor = resolveLayoutGizmoTarget(document, geometry, {
			kind: 'opening',
			roomId: 'room-openings',
			segmentId: 'room-openings:wall:0',
			openingId: 'door-1'
		});
		expect(descriptor).not.toBeNull();
		if (!descriptor) return;
		const opening = geometry.rooms[0]!.openings.find((o) => o.openingId === 'door-1')!;
		// door-1: offset 1, width 0.9, sill 0 → center at distance 1.45 on the
		// bottom edge (tangent +X, yaw 0), bottom at floor + sill = 0.
		expect(descriptor.proxyPose.position).toEqual([1.45, 0, 0]);
		expect(descriptor.proxyPose.rotation).toEqual([0, 0, 0]);
		expect(opening.center.yaw).toBeCloseTo(0, 9);
		expect(descriptor.baseline).toEqual({
			kind: 'opening',
			position: [1.45, 0, 0],
			yaw: 0,
			width: 0.9,
			height: 2.1,
			sillHeight: 0
		});
	});

	it('raises the bottom to floor + sill for a window', () => {
		const document = g1MultipleOpeningsDocument();
		const descriptor = resolveLayoutGizmoTarget(document, compiled(document), {
			kind: 'opening',
			roomId: 'room-openings',
			segmentId: 'room-openings:wall:0',
			openingId: 'window-1'
		})!;
		// window-1: offset 4, width 1.2, sill 1 → center distance 4.6, Y = 0 + 1.
		expect(descriptor.proxyPose.position).toEqual([4.6, 1, 0]);
		expect(descriptor.baseline).toMatchObject({ width: 1.2, height: 1.2, sillHeight: 1 });
	});

	it('uses the compiled tangent/yaw on a curved wall (never derived from mesh triangles)', () => {
		const document = curvedOpeningDocument();
		const geometry = compiled(document);
		const descriptor = resolveLayoutGizmoTarget(document, geometry, {
			kind: 'opening',
			roomId: 'room-rectangle',
			segmentId: 'room-rectangle:wall:0',
			openingId: 'curved-door'
		})!;
		const opening = geometry.rooms[0]!.openings.find((o) => o.openingId === 'curved-door')!;
		expect(opening.center.tangent).toBeDefined();
		expect(descriptor.proxyPose.rotation[1]).toBeCloseTo(opening.center.yaw, 9);
		expect(descriptor.baseline).toMatchObject({ yaw: opening.center.yaw });
		// Proxy pose sits on the compiled center point.
		expect(descriptor.proxyPose.position[0]).toBeCloseTo(opening.center.point[0], 9);
		expect(descriptor.proxyPose.position[2]).toBeCloseTo(opening.center.point[1], 9);
	});

	it('derives local-X center shift and center-pivoted width / fixed-sill height', () => {
		const document = g1MultipleOpeningsDocument();
		const descriptor = resolveLayoutGizmoTarget(document, compiled(document), {
			kind: 'opening',
			roomId: 'room-openings',
			segmentId: 'room-openings:wall:0',
			openingId: 'door-1'
		})!;
		// Translate +X (local X = +X for a straight wall): centerShiftX = 0.5.
		expect(deriveLayoutGizmoDelta(descriptor, poseOf([1.95, 0, 0]))).toEqual({
			kind: 'opening',
			centerShiftX: 0.5,
			width: 0.9,
			height: 2.1
		});
		// Perpendicular +Z move is a zero center shift (translate is local X only).
		expect(deriveLayoutGizmoDelta(descriptor, poseOf([1.45, 0, 0.7]))).toMatchObject({
			centerShiftX: 0
		});
		// Scale X/Y: width scales about center, height scales with sill fixed.
		expect(
			deriveLayoutGizmoDelta(descriptor, poseOf([1.45, 0, 0], [0, 0, 0], [1.5, 1.2, 1]))
		).toEqual({
			kind: 'opening',
			centerShiftX: 0,
			width: 1.35,
			height: 2.52
		});
	});

	it('projects a translation onto the curved tangent, not world X', () => {
		const document = curvedOpeningDocument();
		const geometry = compiled(document);
		const descriptor = resolveLayoutGizmoTarget(document, geometry, {
			kind: 'opening',
			roomId: 'room-rectangle',
			segmentId: 'room-rectangle:wall:0',
			openingId: 'curved-door'
		})!;
		const opening = geometry.rooms[0]!.openings.find((o) => o.openingId === 'curved-door')!;
		const [tx, , tz] = [opening.center.tangent[0], 0, opening.center.tangent[1]];
		const amount = 0.4;
		// Move the proxy along the local X (tangent) axis.
		const along = poseOf([
			descriptor.proxyPose.position[0] + tx * amount,
			descriptor.proxyPose.position[1],
			descriptor.proxyPose.position[2] + tz * amount
		]);
		const alongDelta = deriveLayoutGizmoDelta(descriptor, along);
		expect(alongDelta?.kind).toBe('opening');
		if (alongDelta?.kind !== 'opening') return;
		expect(alongDelta.centerShiftX).toBeCloseTo(amount, 9);
		// Move along the local normal (perpendicular): ~0 center shift.
		const normal = [-tz, 0, tx] as const;
		const across = poseOf([
			descriptor.proxyPose.position[0] + normal[0] * amount,
			descriptor.proxyPose.position[1],
			descriptor.proxyPose.position[2] + normal[2] * amount
		]);
		const acrossDelta = deriveLayoutGizmoDelta(descriptor, across);
		expect(acrossDelta?.kind).toBe('opening');
		if (acrossDelta?.kind !== 'opening') return;
		expect(acrossDelta.centerShiftX).toBeCloseTo(0, 9);
	});
});

describe('resolveLayoutGizmoTarget — interior anchor', () => {
	it('resolves the authored anchor point at room floor elevation', () => {
		const document = g1AutoBezierDocument();
		const descriptor = resolveLayoutGizmoTarget(document, compiled(document), {
			kind: 'interiorAnchor',
			roomId: 'room-rectangle',
			segmentId: 'room-rectangle:wall:0',
			anchorId: 'room-rectangle:wall:0:anchor:1'
		})!;
		expect(descriptor.proxyPose.position).toEqual([3, 0, -1]);
		expect(descriptor.proxyPose.rotation).toEqual([0, 0, 0]);
		expect(descriptor.baseline).toEqual({ kind: 'interiorAnchor', point: [3, -1] });
	});

	it('derives X/Z authored point deltas', () => {
		const document = g1AutoBezierDocument();
		const descriptor = resolveLayoutGizmoTarget(document, compiled(document), {
			kind: 'interiorAnchor',
			roomId: 'room-rectangle',
			segmentId: 'room-rectangle:wall:0',
			anchorId: 'room-rectangle:wall:0:anchor:1'
		})!;
		expect(deriveLayoutGizmoDelta(descriptor, poseOf([4, 0, -2]))).toEqual({
			kind: 'interiorAnchor',
			translation: [1, -1]
		});
	});

	it('refuses an anchor on a line (non-auto-bezier) segment', () => {
		const document = g1LineRectangleDocument();
		const result = resolveLayoutGizmoTarget(document, compiled(document), {
			kind: 'interiorAnchor',
			roomId: 'room-rectangle',
			segmentId: 'room-rectangle:wall:0',
			anchorId: 'room-rectangle:wall:0:anchor:1'
		});
		expect(result).toBeNull();
	});
});

describe('resolveLayoutGizmoTarget — layout object', () => {
	it('resolves stored position/rotation with unit proxy scale', () => {
		const document = g1ObjectMatrixDocument();
		const geometry = compiled(document);
		const descriptor = resolveLayoutGizmoTarget(document, geometry, {
			kind: 'object',
			objectId: 'obj-cylinder'
		})!;
		expect(descriptor.proxyPose.position).toEqual([5, 0.5, 1]);
		expect(descriptor.proxyPose.rotation).toEqual([0, Math.PI / 4, 0]);
		expect(descriptor.proxyPose.scale).toEqual([1, 1, 1]);
		expect(descriptor.baseline).toEqual({
			kind: 'object',
			position: [5, 0.5, 1],
			rotation: [0, Math.PI / 4, 0],
			dimensions: [1, 1, 1]
		});
	});

	it('derives position, Euler rotation, and independently scaled dimensions', () => {
		const document = g1ObjectMatrixDocument();
		const descriptor = resolveLayoutGizmoTarget(document, compiled(document), {
			kind: 'object',
			objectId: 'obj-box'
		})!;
		const moved = deriveLayoutGizmoDelta(descriptor, poseOf([3, 1.5, 2], [0, Math.PI / 2, 0], [2, 3, 4]))!;
		expect(moved).toEqual({
			kind: 'object',
			position: [2, 1, 1],
			rotation: [0, Math.PI / 2, 0],
			dimensions: [2, 3, 4]
		});
	});

	it('scales non-uniform dimensions independently and wraps Euler deltas', () => {
		const document = g1ObjectMatrixDocument();
		const descriptor = resolveLayoutGizmoTarget(document, compiled(document), {
			kind: 'object',
			objectId: 'obj-sphere'
		})!;
		// obj-sphere dimensions [1.2, 0.8, 1.2].
		const delta = deriveLayoutGizmoDelta(
			descriptor,
			poseOf([7, 0.5, 3], [0, Math.PI * 1.5, 0], [2, 1, 0.5])
		)!;
		expect(delta).toEqual({
			kind: 'object',
			position: [0, 0, 0],
			// 1.5π wraps to -π/2.
			rotation: [0, -Math.PI / 2, 0],
			dimensions: [2.4, 0.8, 0.6]
		});
	});

	it('returns null for read-only profile objects', () => {
		const document = g1ObjectMatrixDocument();
		const result = resolveLayoutGizmoTarget(document, compiled(document), {
			kind: 'object',
			objectId: 'obj-profile'
		});
		expect(result).toBeNull();
	});
});

describe('resolveLayoutGizmoTarget — stale identities and guards', () => {
	it('returns null for a none selection', () => {
		expect(resolveLayoutGizmoTarget(g1LineRectangleDocument(), compiled(g1LineRectangleDocument()), { kind: 'none' })).toBeNull();
	});

	it('returns null when the authored identity is missing', () => {
		const document = g1LineRectangleDocument();
		const geometry = compiled(document);
		expect(resolveLayoutGizmoTarget(document, geometry, { kind: 'room', roomId: 'missing' })).toBeNull();
		expect(
			resolveLayoutGizmoTarget(document, geometry, {
				kind: 'wall',
				roomId: 'room-rectangle',
				segmentId: 'missing-wall'
			})
		).toBeNull();
		expect(
			resolveLayoutGizmoTarget(document, geometry, {
				kind: 'opening',
				roomId: 'room-rectangle',
				segmentId: 'room-rectangle:wall:0',
				openingId: 'missing-opening'
			})
		).toBeNull();
		expect(
			resolveLayoutGizmoTarget(document, geometry, {
				kind: 'object',
				objectId: 'missing-object'
			})
		).toBeNull();
	});

	it('returns null when the compiled counterpart is missing (reloaded/undone identity)', () => {
		const document = g1LineRectangleDocument();
		const geometry = compiled(document);
		geometry.rooms = [];
		expect(resolveLayoutGizmoTarget(document, geometry, { kind: 'room', roomId: 'room-rectangle' })).toBeNull();
		expect(
			resolveLayoutGizmoTarget(document, geometry, {
				kind: 'wall',
				roomId: 'room-rectangle',
				segmentId: 'room-rectangle:wall:0'
			})
		).toBeNull();
	});

	it('returns null when an opening selection does not match its segment', () => {
		const document = g1MultipleOpeningsDocument();
		const result = resolveLayoutGizmoTarget(document, compiled(document), {
			kind: 'opening',
			roomId: 'room-openings',
			segmentId: 'room-openings:wall:1',
			openingId: 'door-1'
		});
		expect(result).toBeNull();
	});

	it('derives no delta from a non-finite proxy pose (raw finite deltas only)', () => {
		const document = g1LineRectangleDocument();
		const descriptor = resolveLayoutGizmoTarget(document, compiled(document), {
			kind: 'room',
			roomId: 'room-rectangle'
		})!;
		expect(deriveLayoutGizmoDelta(descriptor, poseOf([NaN, 0, 0]))).toBeNull();
		expect(
			deriveLayoutGizmoDelta(descriptor, {
				position: [3, 0, 2],
				rotation: [0, Infinity, 0],
				scale: [1, 1, 1]
			})
		).toBeNull();
	});
});

describe('layout target keys — collision-safe tuple encoding for legal ids containing ":"', () => {
	it('uses the compiled geometryId for room/wall/opening/object', () => {
		const document = g1AutoBezierDocument();
		const geometry = compiled(document);
		const room = resolveLayoutGizmoTarget(document, geometry, { kind: 'room', roomId: 'room-rectangle' })!;
		expect(room.key).toBe(geometry.rooms[0]!.id);
		const wall = resolveLayoutGizmoTarget(document, geometry, {
			kind: 'wall',
			roomId: 'room-rectangle',
			segmentId: 'room-rectangle:wall:0'
		})!;
		expect(wall.key).toBe(geometry.rooms[0]!.walls[0]!.id);
	});

	it('encodes interior-anchor keys with the length-prefixed geometryId (never colon-splitting)', () => {
		const document = g1AutoBezierDocument();
		const descriptor = resolveLayoutGizmoTarget(document, compiled(document), {
			kind: 'interiorAnchor',
			roomId: 'room-rectangle',
			segmentId: 'room-rectangle:wall:0',
			anchorId: 'room-rectangle:wall:0:anchor:1'
		})!;
		// The anchor id itself contains colons; the key must be the
		// length-prefixed encoding, not a naive join that would collide.
		expect(descriptor.key).toBe(
			geometryId([
				'layout-interior-anchor',
				'floor-ground',
				'room-rectangle',
				'room-rectangle:wall:0',
				'room-rectangle:wall:0:anchor:1'
			])
		);
		expect(descriptor.key).toMatch(/^\d+:/);
	});

	it('distinguishes identities whose naive colon-joined strings would collide', () => {
		const document = g1LineRectangleDocument();
		const room = document.floors[0]!.rooms[0]!;
		// Two distinct wall ids that naive ':'-splitting would confuse.
		room.boundary.segments[0]!.id = 'a:b';
		room.boundary.segments[1]!.id = 'a';
		const geometry = compiled(document);
		const first = resolveLayoutGizmoTarget(document, geometry, {
			kind: 'wall',
			roomId: 'room-rectangle',
			segmentId: 'a:b'
		})!;
		const second = resolveLayoutGizmoTarget(document, geometry, {
			kind: 'wall',
			roomId: 'room-rectangle',
			segmentId: 'a'
		})!;
		expect(first.key).not.toBe(second.key);
	});
});

describe('layout target policies — unsupported modes/axes never start', () => {
	const document = g1MultipleOpeningsDocument();
	const geometry = compiled(document);
	const room = resolveLayoutGizmoTarget(document, geometry, { kind: 'room', roomId: 'room-openings' })!;
	const wall = resolveLayoutGizmoTarget(document, geometry, {
		kind: 'wall',
		roomId: 'room-openings',
		segmentId: 'room-openings:wall:0'
	})!;
	const opening = resolveLayoutGizmoTarget(document, geometry, {
		kind: 'opening',
		roomId: 'room-openings',
		segmentId: 'room-openings:wall:0',
		openingId: 'door-1'
	})!;
	const objects = compiled(g1ObjectMatrixDocument());
	const object = resolveLayoutGizmoTarget(g1ObjectMatrixDocument(), objects, {
		kind: 'object',
		objectId: 'obj-box'
	})!;

	it('room: translate x/z/xz or rotate y; never scale or room-Y translation', () => {
		for (const axis of ['x', 'z', 'xz'] as const) {
			expect(isAxisAllowed('translate', axis, room.policy)).toBe(true);
		}
		for (const axis of ['y', 'xy', 'yz', 'xyz'] as const) {
			expect(isAxisAllowed('translate', axis, room.policy)).toBe(false);
		}
		expect(isAxisAllowed('rotate', 'y', room.policy)).toBe(true);
		for (const axis of ['x', 'z', 'xy', 'xz', 'yz', 'xyz'] as const) {
			expect(isAxisAllowed('rotate', axis, room.policy)).toBe(false);
		}
		expect(room.policy.allowedModes.has('scale')).toBe(false);
		expect(room.policy.scaleControl).toBe('hidden');
	});

	it('wall: translate x/z/xz only; rotate/scale absent', () => {
		for (const axis of ['x', 'z', 'xz'] as const) {
			expect(isAxisAllowed('translate', axis, wall.policy)).toBe(true);
		}
		expect(isAxisAllowed('translate', 'y', wall.policy)).toBe(false);
		expect(wall.policy.allowedModes.has('rotate')).toBe(false);
		expect(wall.policy.allowedModes.has('scale')).toBe(false);
	});

	it('opening: translate local X only; scale x/y/xy; no local Z or rotate', () => {
		expect(isAxisAllowed('translate', 'x', opening.policy)).toBe(true);
		for (const axis of ['y', 'z', 'xy', 'xz', 'yz', 'xyz'] as const) {
			expect(isAxisAllowed('translate', axis, opening.policy)).toBe(false);
		}
		for (const axis of ['x', 'y', 'xy'] as const) {
			expect(isAxisAllowed('scale', axis, opening.policy)).toBe(true);
		}
		for (const axis of ['z', 'xz', 'yz', 'xyz'] as const) {
			expect(isAxisAllowed('scale', axis, opening.policy)).toBe(false);
		}
		expect(opening.policy.allowedModes.has('rotate')).toBe(false);
		expect(opening.policy.space('translate')).toBe('local');
		expect(opening.policy.scaleControl).toBe('fixed-independent');
	});

	it('interior anchor: translate x/z/xz only', () => {
		const anchorDocument = g1AutoBezierDocument();
		const anchor = resolveLayoutGizmoTarget(anchorDocument, compiled(anchorDocument), {
			kind: 'interiorAnchor',
			roomId: 'room-rectangle',
			segmentId: 'room-rectangle:wall:0',
			anchorId: 'room-rectangle:wall:0:anchor:1'
		})!;
		for (const axis of ['x', 'z', 'xz'] as const) {
			expect(isAxisAllowed('translate', axis, anchor.policy)).toBe(true);
		}
		expect(isAxisAllowed('translate', 'y', anchor.policy)).toBe(false);
		expect(anchor.policy.allowedModes.has('rotate')).toBe(false);
		expect(anchor.policy.allowedModes.has('scale')).toBe(false);
	});

	it('object: full modes with translate world and rotate/scale local', () => {
		for (const axis of ['x', 'y', 'z', 'xy', 'xz', 'yz', 'xyz'] as const) {
			expect(isAxisAllowed('translate', axis, object.policy)).toBe(true);
			expect(isAxisAllowed('rotate', axis, object.policy)).toBe(true);
			expect(isAxisAllowed('scale', axis, object.policy)).toBe(true);
		}
		expect(object.policy.space('translate')).toBe('world');
		expect(object.policy.space('rotate')).toBe('local');
		expect(object.policy.space('scale')).toBe('local');
		expect(object.policy.scaleControl).toBe('fixed-independent');
	});

	it('capability projection matches the begin guard (toolbar/shortcuts agree)', () => {
		const caps = projectGizmoCapabilities(room.policy, 'scale');
		// Remembered scale is refused → effective translate with x/z/xz.
		expect(caps.effectiveMode).toBe('translate');
		expect(caps.allowedModes.has('scale')).toBe(false);
		expect(caps.axes).toEqual(new Set(['x', 'z', 'xz']));
		expect(caps.scaleControl).toBe('hidden');
		expect(caps.rotateScreenHandles).toBe(false);
		// Every axis the projection exposes is a legitimate begin handle.
		for (const axis of caps.axes) {
			expect(isAxisAllowed(caps.effectiveMode, axis, room.policy)).toBe(true);
		}
	});
});
