import { describe, expect, it } from 'vitest';
import { getRoom } from '$lib/content/rooms';
import {
	clampEditorCameraFrustumDepth,
	createEditorCameraFramingGeometry,
	createEditorCameraFrustumLinePoints,
	verticalFovFromEditorCameraFrustumPoint
} from '$lib/editor/editor-camera-framing';
import { createEditorRoomCameraFrame } from '$lib/editor/editor-camera';

describe('editor camera framing geometry', () => {
	it('clamps finite frustum depth without changing authored target distance', () => {
		expect(clampEditorCameraFrustumDepth(0.5)).toBe(2);
		expect(clampEditorCameraFrustumDepth(4)).toBe(4);
		expect(clampEditorCameraFrustumDepth(20)).toBe(8);
	});

	it('builds a finite vertical-FOV frame around the aim axis', () => {
		const geometry = createEditorCameraFramingGeometry(
			[0, 1, 0],
			[0, 1, -4],
			90,
			2
		);
		expect(geometry.depth).toBe(4);
		expect(geometry.center).toEqual([0, 1, -4]);
		expect(geometry.topHandle[1]).toBeCloseTo(5);
		expect(geometry.bottomHandle[1]).toBeCloseTo(-3);
		expect(geometry.corners[0]![0]).toBeCloseTo(-8);
		expect(geometry.corners[1]![0]).toBeCloseTo(8);
	});

	it('builds eye-to-corner rays and a closed FOV-plane rectangle for the finite frustum', () => {
		const position: [number, number, number] = [0, 1, 0];
		const target: [number, number, number] = [0, 1, -4];
		const geometry = createEditorCameraFramingGeometry(position, target, 90, 2);
		const points = createEditorCameraFrustumLinePoints(position, geometry);
		expect(points).toHaveLength(16);
		expect(points[0]!.toArray()).toEqual([0, 1, 0]);
		expect(points[1]!.toArray()).toEqual(geometry.corners[0]);
		expect(points[2]!.toArray()).toEqual([0, 1, 0]);
		expect(points[3]!.toArray()).toEqual(geometry.corners[1]);
		// The four rectangle edges close the FOV plane back to the first corner.
		expect(points[14]!.toArray()).toEqual(geometry.corners[3]);
		expect(points[15]!.toArray()).toEqual(geometry.corners[0]);
	});

	it('derives and clamps vertical FOV from a side-handle point', () => {
		expect(
			verticalFovFromEditorCameraFrustumPoint(
				[0, 0, 0],
				[0, 0, -4],
				[0, 4, -4]
			)
		).toBeCloseTo(90);
		expect(
			verticalFovFromEditorCameraFrustumPoint(
				[0, 0, 0],
				[0, 0, -4],
				[0, 100, -4]
			)
		).toBe(120);
		expect(
			verticalFovFromEditorCameraFrustumPoint(
				[0, 0, 0],
				[0, 0, -4],
				[0, 0.001, -4]
			)
		).toBe(10);
	});
});

// Slice 4 — the `editor room camera framing` describe block (pure helper,
// invocation-bound to the Paris room from the fixture) lives on this file
// now alongside the geometry helpers.
describe('editor room camera framing', () => {
	it('centers the target in Paris and follows its authored yaw', () => {
		const room = getRoom('paris');
		const frame = createEditorRoomCameraFrame(room);

		expect(frame.target).toEqual([
			room.position[0],
			room.position[1] + room.dimensions[1] / 2,
			room.position[2]
		]);
		expect(frame.position.every(Number.isFinite)).toBe(true);
		expect(frame.radius).toBeGreaterThan(0);
		expect(frame.minDistance).toBe(0.2);
		expect(frame.minDistance).toBeLessThan(frame.maxDistance);

		const dx = frame.position[0] - frame.target[0];
		const dz = frame.position[2] - frame.target[2];
		expect(Math.atan2(dx, dz)).toBeCloseTo(room.rotation[1]);
	});
});
