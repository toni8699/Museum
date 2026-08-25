import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import {
	createOrientationPointerGesture,
	deriveActiveCardinalFace,
	deriveOrientationFaceTargets,
	moveOrientationPointerGesture,
	shouldActivateOrientationPointerGesture
} from '$lib/editor/editor-orientation-interaction';
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

function withFace(
	snapshot: OrientationProjectionSnapshot,
	faceName: string,
	changes: Partial<OrientationProjectionSnapshot['faces'][number]>
): OrientationProjectionSnapshot {
	return {
		...snapshot,
		faces: snapshot.faces.map((face) =>
			face.face === faceName ? { ...face, ...changes } : face
		)
	};
}

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

describe('orientation interaction (P3B.3)', () => {
	it('activates only exact or near-cardinal eye directions', () => {
		const cardinalCases = [
			[[1, 0, 0], '+X'],
			[[-1, 0, 0], '-X'],
			[[0, 1, 0], '+Y'],
			[[0, -1, 0], '-Y'],
			[[0, 0, 1], '+Z'],
			[[0, 0, -1], '-Z']
		] as const;
		for (const [direction, face] of cardinalCases) {
			expect(deriveActiveCardinalFace(direction)).toBe(face);
		}

		const directionAt = (degrees: number): [number, number, number] => {
			const radians = (degrees * Math.PI) / 180;
			return [Math.cos(radians), Math.sin(radians), 0];
		};
		expect(deriveActiveCardinalFace(directionAt(2))).toBe('+X');
		expect(deriveActiveCardinalFace(directionAt(3))).toBeNull();
		expect(deriveActiveCardinalFace([1, 1, 1])).toBeNull();
		expect(deriveActiveCardinalFace([0, 0, 0])).toBeNull();
	});

	it('returns six stable face targets with direct polygons before perimeter proxies', () => {
		const snapshot = snapshotForEye(new Vector3(1, 0.75, 1));
		const result = deriveOrientationFaceTargets(snapshot);

		expect(result.targets.map((target) => target.face)).toEqual([
			'+X',
			'-X',
			'+Y',
			'-Y',
			'+Z',
			'-Z'
		]);
		for (const target of result.targets) {
			if (target.painted) {
				expect(target.mode).toBe('polygon');
				expect(target.polygon).not.toBeNull();
			} else {
				expect(target.mode).toBe('proxy');
				expect(target.proxyCenter).not.toBeNull();
				expect(
					Math.hypot(target.proxyCenter![0] - 44, target.proxyCenter![1] - 44)
				).toBeCloseTo(36, 8);
			}
		}
	});

	it('uses 14px/16px hysteresis when a painted face becomes edge-on', () => {
		const base = snapshotForEye(new Vector3(1, 0.75, 1));
		const polygon = (width: number) => [
			[44 - width / 2, 29],
			[44 + width / 2, 29],
			[44 + width / 2, 59],
			[44 - width / 2, 59]
		] as const;
		const initial = deriveOrientationFaceTargets(
			withFace(base, '+X', { painted: true, polygon: polygon(17) })
		);
		expect(initial.targets.find((target) => target.face === '+X')!.mode).toBe('polygon');

		const enteredProxy = deriveOrientationFaceTargets(
			withFace(base, '+X', { painted: true, polygon: polygon(13.5) }),
			initial.state
		);
		expect(enteredProxy.targets.find((target) => target.face === '+X')!.mode).toBe('proxy');

		const heldProxy = deriveOrientationFaceTargets(
			withFace(base, '+X', { painted: true, polygon: polygon(15) }),
			enteredProxy.state
		);
		expect(heldProxy.targets.find((target) => target.face === '+X')!.mode).toBe('proxy');

		const leftProxy = deriveOrientationFaceTargets(
			withFace(base, '+X', { painted: true, polygon: polygon(16.5) }),
			heldProxy.state
		);
		expect(leftProxy.targets.find((target) => target.face === '+X')!.mode).toBe('polygon');
	});

	it('uses 2px/3px hysteresis before leaving a signed fallback proxy slot', () => {
		const base = snapshotForEye(new Vector3(1, 0, 0));
		const withDirection = (length: number) =>
			withFace(base, '-X', {
				painted: false,
				directionFromCubeCenter: [length, 0]
			});
		const fallback = deriveOrientationFaceTargets(withDirection(1.5));
		expect(fallback.targets.find((target) => target.face === '-X')!.proxyCenter).toEqual([
			8,
			44
		]);

		const heldFallback = deriveOrientationFaceTargets(withDirection(2.5), fallback.state);
		expect(heldFallback.targets.find((target) => target.face === '-X')!.proxyCenter).toEqual([
			8,
			44
		]);

		const projected = deriveOrientationFaceTargets(withDirection(3.5), heldFallback.state);
		expect(projected.targets.find((target) => target.face === '-X')!.proxyCenter).toEqual([
			80,
			44
		]);
	});

	it('activates pointerup only for the captured pointer below the shared 4px threshold', () => {
		const start = createOrientationPointerGesture({
			pointerId: 7,
			clientX: 100,
			clientY: 200,
			targetId: 'face:+X',
			face: '+X'
		});
		const atThreshold = moveOrientationPointerGesture(start, 7, 104, 200);
		expect(atThreshold.cancelled).toBe(false);
		expect(
			shouldActivateOrientationPointerGesture(atThreshold, {
				pointerId: 7,
				targetId: 'face:+X',
				disabled: false
			})
		).toBe(true);

		const overThreshold = moveOrientationPointerGesture(start, 7, 104.01, 200);
		expect(overThreshold.cancelled).toBe(true);
		for (const rejection of [
			{ gesture: overThreshold, pointerId: 7, targetId: 'face:+X', disabled: false },
			{ gesture: start, pointerId: 8, targetId: 'face:+X', disabled: false },
			{ gesture: start, pointerId: 7, targetId: 'face:-X', disabled: false },
			{ gesture: start, pointerId: 7, targetId: 'face:+X', disabled: true }
		]) {
			expect(
				shouldActivateOrientationPointerGesture(rejection.gesture, {
					pointerId: rejection.pointerId,
					targetId: rejection.targetId,
					disabled: rejection.disabled
				})
			).toBe(false);
		}
	});

	// P3B.3 review disposition 2026-08-25 — intentional click slop: pointer
	// capture keeps pointerup on the pressed target, so a sub-threshold drift
	// that has left the original hit area still activates on identity +
	// threshold alone. Release-inside hit-testing is deliberately NOT required;
	// only >4px cancels.
	it('treats sub-threshold release off the initial hit area as click slop, not drag', () => {
		const start = createOrientationPointerGesture({
			pointerId: 3,
			clientX: 40,
			clientY: 60,
			targetId: 'axis:+Y',
			face: '+Y'
		});
		const drifted = moveOrientationPointerGesture(start, 3, 42.5, 62); // ~3.5px, off-target
		expect(drifted.cancelled).toBe(false);
		expect(
			shouldActivateOrientationPointerGesture(drifted, {
				pointerId: 3,
				targetId: 'axis:+Y',
				disabled: false
			})
		).toBe(true);

		const crossedThreshold = moveOrientationPointerGesture(start, 3, 45, 64); // >4px
		expect(crossedThreshold.cancelled).toBe(true);
	});
});
