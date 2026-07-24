import { describe, expect, it } from 'vitest';
import {
	clampEditorCameraFrustumDepth,
	createEditorCameraFramingGeometry,
	verticalFovFromEditorCameraFrustumPoint
} from './editor-camera-framing';

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
