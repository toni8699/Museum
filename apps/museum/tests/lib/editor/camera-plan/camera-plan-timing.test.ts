import { describe, expect, it } from 'vitest';
import type { SceneDocument } from '$lib/content/scene';
import { g1DocumentWithRooms, g1RectangleRoom } from '../../layout/__fixtures__/layout-g1-fixtures';
import { createLayoutRoomRegistry } from '$lib/project/project-layout-semantics';
import { resolvePlanSceneGraphFromDocument } from '$lib/editor/layout/plan-camera-projection';
import { createCameraMotion } from '$lib/museum/navigation/camera-motion';
import { getCameraConnectionRoute, getCameraMotionOptions } from '$lib/museum/navigation/camera-route';
import { resolveCameraConnectionTiming } from '$lib/editor/camera/editor-camera-timing';

function documentWith(overrides: {
	timingForward?: { durationSeconds: number; easing?: string } | null;
	timingReverse?: { durationSeconds: number; easing?: string } | null;
	positionB?: [number, number, number];
}): SceneDocument {
	const timing: Record<string, unknown> = {};
	if (overrides.timingForward) timing.forward = overrides.timingForward;
	if (overrides.timingReverse) timing.reverse = overrides.timingReverse;
	return {
		textures: [],
		materials: [],
		entities: [],
		navigationNodes: [
			{
				id: 'n-a',
				roomId: 'room-a',
				label: 'A',
				position: [0, 1.6, 0],
				cameraTarget: [3, 1.2, 0],
				fov: 54,
				connectedNodeIds: ['n-b']
			},
			{
				id: 'n-b',
				roomId: 'room-a',
				label: 'B',
				position: overrides.positionB ?? [6, 1.6, 0],
				cameraTarget: [3, 1.2, 0],
				fov: 54,
				connectedNodeIds: ['n-a']
			}
		],
		connections: [
			{
				id: 'c-ab',
				fromNodeId: 'n-a',
				toNodeId: 'n-b',
				clearance: 0.35,
				positionPath: { kind: 'auto-bezier', anchors: [] },
				...(Object.keys(timing).length > 0 ? { timing } : {})
			}
		]
	};
}

function rooms() {
	return createLayoutRoomRegistry(g1DocumentWithRooms([g1RectangleRoom('room-a', 0, 0, 6, 4)]));
}

describe('resolveCameraConnectionTiming', () => {
	it('matches the exact per-direction CameraMotion for an authored duration', () => {
		const document = documentWith({ timingForward: { durationSeconds: 4.2, easing: 'smoothstep' } });
		const graph = resolvePlanSceneGraphFromDocument(document, rooms());
		const readout = resolveCameraConnectionTiming('c-ab', 'forward', graph);
		const motion = createCameraMotion(
			getCameraConnectionRoute('c-ab', 'forward', graph),
			undefined,
			getCameraMotionOptions(graph.connections[0]!, 'forward')
		);
		expect(readout.authoredDuration).toBe(true);
		expect(readout.durationSeconds).toBe(motion.durationSeconds);
		expect(readout.pathLengthMeters).toBe(motion.totalPositionDistance);
		expect(readout.speedMetersPerSecond).toBeCloseTo(
			motion.totalPositionDistance / motion.durationSeconds,
			9
		);
	});

	it('uses the formula fallback and marks the direction automatic', () => {
		const document = documentWith({});
		const graph = resolvePlanSceneGraphFromDocument(document, rooms());
		const readout = resolveCameraConnectionTiming('c-ab', 'forward', graph);
		const motion = createCameraMotion(
			getCameraConnectionRoute('c-ab', 'forward', graph),
			undefined,
			getCameraMotionOptions(graph.connections[0]!, 'forward')
		);
		expect(readout.authoredDuration).toBe(false);
		expect(readout.durationSeconds).toBe(motion.durationSeconds);
		// 6 m straight line → 6 / 6.2 ≈ 0.97 s, clamped into [1.25, 4.8].
		expect(readout.durationSeconds).toBeCloseTo(1.25, 9);
		expect(readout.speedMetersPerSecond).toBeCloseTo(6 / readout.durationSeconds, 9);
	});

	it('writes each direction independently', () => {
		const document = documentWith({
			timingForward: { durationSeconds: 4.2 },
			timingReverse: null
		});
		const graph = resolvePlanSceneGraphFromDocument(document, rooms());
		const forward = resolveCameraConnectionTiming('c-ab', 'forward', graph);
		const reverse = resolveCameraConnectionTiming('c-ab', 'reverse', graph);
		expect(forward.authoredDuration).toBe(true);
		expect(forward.durationSeconds).toBe(4.2);
		expect(reverse.authoredDuration).toBe(false);
	});

	it('shows 0 m/s — never NaN or infinity — for zero-length paths', () => {
		const document = documentWith({ positionB: [0, 1.6, 0] });
		const graph = resolvePlanSceneGraphFromDocument(document, rooms());
		const readout = resolveCameraConnectionTiming('c-ab', 'forward', graph);
		expect(readout.pathLengthMeters).toBeLessThan(1e-9);
		expect(Number.isFinite(readout.durationSeconds)).toBe(true);
		expect(readout.speedMetersPerSecond).toBe(0);
		expect(Number.isNaN(readout.speedMetersPerSecond)).toBe(false);
	});

	it('throws for an unknown connection', () => {
		const graph = resolvePlanSceneGraphFromDocument(documentWith({}), rooms());
		expect(() => resolveCameraConnectionTiming('missing', 'forward', graph)).toThrow(
			'Unknown camera connection'
		);
	});
});
