import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { deriveCardinalFace } from '$lib/editor/editor-orientation-gizmo.svelte';
import {
	ORIENTATION_WIDGET_CENTER,
	orientationProjectionMateriallyChanged,
	projectOrientationGeometry,
	type OrientationProjectionSnapshot
} from '$lib/editor/editor-orientation-projection';

function snapshotForEye(
	eye: Vector3,
	up = new Vector3(0, 1, 0)
): OrientationProjectionSnapshot {
	const camera = new PerspectiveCamera();
	camera.position.copy(eye);
	camera.up.copy(up);
	camera.lookAt(0, 0, 0);
	camera.updateMatrixWorld(true);
	const direction = eye.clone().normalize();
	return projectOrientationGeometry({
		cameraQuaternion: [
			camera.quaternion.x,
			camera.quaternion.y,
			camera.quaternion.z,
			camera.quaternion.w
		],
		eyeDirection: [direction.x, direction.y, direction.z]
	});
}

function visibleFaces(snapshot: OrientationProjectionSnapshot): string[] {
	return snapshot.faces
		.filter((face) => face.painted)
		.map((face) => face.face)
		.sort();
}

describe('deriveCardinalFace (P3B.2)', () => {
	it('picks the dominant axis with its sign', () => {
		expect(deriveCardinalFace({ x: 10, y: 2, z: 3 })).toBe('+X');
		expect(deriveCardinalFace({ x: -8, y: 1, z: 4 })).toBe('-X');
		expect(deriveCardinalFace({ x: 2, y: 9, z: 3 })).toBe('+Y');
		expect(deriveCardinalFace({ x: 1, y: -6, z: 2 })).toBe('-Y');
		expect(deriveCardinalFace({ x: 2, y: 3, z: 7 })).toBe('+Z');
		expect(deriveCardinalFace({ x: 1, y: 4, z: -9 })).toBe('-Z');
	});

	it('breaks ties deterministically toward X, then Y', () => {
		expect(deriveCardinalFace({ x: 5, y: 5, z: 2 })).toBe('+X');
		expect(deriveCardinalFace({ x: 3, y: 5, z: 5 })).toBe('+Y');
	});

	it('handles exact axis alignment and a zero vector', () => {
		expect(deriveCardinalFace({ x: 0, y: -12, z: 0 })).toBe('-Y');
		expect(deriveCardinalFace({ x: 0, y: 0, z: 0 })).toBe('+X');
	});
});

describe('projectOrientationGeometry (P3B.2 render rework)', () => {
	it('projects the design-reference oblique pose as TOP / FRONT / RIGHT', () => {
		const snapshot = snapshotForEye(new Vector3(1, 0.75, 1));

		expect(visibleFaces(snapshot)).toEqual(['+X', '+Y', '+Z']);
		expect(snapshot.faces.map((face) => face.depth)).toEqual(
			[...snapshot.faces].map((face) => face.depth).sort((a, b) => a - b)
		);
		expect(snapshot.edges).toHaveLength(9);
		for (const face of snapshot.faces.filter((candidate) => candidate.painted)) {
			expect(face.labelOpacity).toBeGreaterThan(0.99);
			expect(face.lightAmount).toBeGreaterThanOrEqual(0);
			expect(face.lightAmount).toBeLessThanOrEqual(1);
		}
	});

	it('anchors short positive axes at cube corners and projects them outward', () => {
		const snapshot = snapshotForEye(new Vector3(1, 0.75, 1));
		const allVertices = snapshot.faces.flatMap((face) => face.polygon);

		for (const axis of snapshot.axes) {
			expect(
				allVertices.some(
					([x, y]) =>
						Math.abs(x - axis.projectedAnchor[0]) < 1e-8 &&
						Math.abs(y - axis.projectedAnchor[1]) < 1e-8
				)
			).toBe(true);
			const anchorRadius = Math.hypot(
				axis.projectedAnchor[0] - ORIENTATION_WIDGET_CENTER[0],
				axis.projectedAnchor[1] - ORIENTATION_WIDGET_CENTER[1]
			);
			const shaftRadius = Math.hypot(
				axis.projectedShaftEnd[0] - ORIENTATION_WIDGET_CENTER[0],
				axis.projectedShaftEnd[1] - ORIENTATION_WIDGET_CENTER[1]
			);
			expect(shaftRadius).toBeGreaterThan(anchorRadius);
			expect(axis.arrowPolygon).not.toBeNull();
		}
	});

	it('culls back faces and changes projected geometry with arbitrary orbit', () => {
		const first = snapshotForEye(new Vector3(1, 0.75, 1));
		const second = snapshotForEye(new Vector3(-0.45, 0.2, 1));

		expect(visibleFaces(second)).toEqual(['+Y', '+Z', '-X']);
		const firstTop = first.faces.find((face) => face.face === '+Y')!;
		const secondTop = second.faces.find((face) => face.face === '+Y')!;
		expect(secondTop.polygon).not.toEqual(firstTop.polygon);
		expect(secondTop.center).not.toEqual(firstTop.center);
	});

	it('fades nearly edge-on labels using the 18°–28° local threshold', () => {
		const below = snapshotForEye(new Vector3(1, Math.tan((17 * Math.PI) / 180), 0));
		const between = snapshotForEye(new Vector3(1, Math.tan((23 * Math.PI) / 180), 0));
		const above = snapshotForEye(new Vector3(1, Math.tan((29 * Math.PI) / 180), 0));
		const topOpacity = (snapshot: OrientationProjectionSnapshot) =>
			snapshot.faces.find((face) => face.face === '+Y')!.labelOpacity;

		expect(topOpacity(below)).toBe(0);
		expect(topOpacity(between)).toBeGreaterThan(0);
		expect(topOpacity(between)).toBeLessThan(1);
		expect(topOpacity(above)).toBe(1);
	});

	it('uses a reticle when an axis points toward or away from the camera', () => {
		const fromPositiveX = snapshotForEye(new Vector3(1, 0, 0));
		const fromNegativeX = snapshotForEye(new Vector3(-1, 0, 0));

		for (const snapshot of [fromPositiveX, fromNegativeX]) {
			const xAxis = snapshot.axes.find((axis) => axis.face === '+X')!;
			expect(xAxis.foreshortened).toBe(true);
			expect(xAxis.arrowPolygon).toBeNull();
			expect(xAxis.reticleCenter).toEqual(xAxis.projectedAnchor);
		}
	});

	it('returns deeply immutable numeric snapshots', () => {
		const snapshot = snapshotForEye(new Vector3(1, 0.75, 1));

		expect(Object.isFrozen(snapshot)).toBe(true);
		expect(Object.isFrozen(snapshot.faces)).toBe(true);
		expect(Object.isFrozen(snapshot.faces[0])).toBe(true);
		expect(Object.isFrozen(snapshot.faces[0]!.polygon)).toBe(true);
		expect(Object.isFrozen(snapshot.faces[0]!.polygon[0])).toBe(true);
		expect(Object.isFrozen(snapshot.axes)).toBe(true);
	});

	it('compares material change against the last published orientation', () => {
		const base = projectOrientationGeometry({
			cameraQuaternion: [0, 0, 0, 1],
			eyeDirection: [0, 0, 1]
		});
		const smallQuaternion = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 4e-6);
		const accumulatedQuaternion = new Quaternion().setFromAxisAngle(
			new Vector3(0, 1, 0),
			12e-6
		);
		const small = projectOrientationGeometry({
			cameraQuaternion: [
				smallQuaternion.x,
				smallQuaternion.y,
				smallQuaternion.z,
				smallQuaternion.w
			],
			eyeDirection: [0, 0, 1]
		});
		const accumulated = projectOrientationGeometry({
			cameraQuaternion: [
				accumulatedQuaternion.x,
				accumulatedQuaternion.y,
				accumulatedQuaternion.z,
				accumulatedQuaternion.w
			],
			eyeDirection: [0, 0, 1]
		});

		expect(orientationProjectionMateriallyChanged(null, base)).toBe(true);
		expect(orientationProjectionMateriallyChanged(base, base)).toBe(false);
		expect(orientationProjectionMateriallyChanged(base, small)).toBe(false);
		expect(orientationProjectionMateriallyChanged(base, accumulated)).toBe(true);
	});
});
