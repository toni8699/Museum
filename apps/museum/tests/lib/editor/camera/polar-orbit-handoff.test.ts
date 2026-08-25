import { beforeEach, describe, expect, it } from 'vitest';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { snapEditorViewToCardinal } from '$lib/editor/camera/editor-camera';

/**
 * P3B.4 polar-orbit handoff fixture (Designer-brieft-box.md §5.2).
 *
 * Proves — against the real three.js OrbitControls, headless — that the
 * shipped cardinal commit (polar `camera.up` inside the commit `lookAt`,
 * then restored to global `+Y`) hands off to manual orbit without a roll
 * pop, and that subsequent drags operate around the global +Y pole.
 *
 * OrbitControls is driven through a stub DOM element that captures the
 * component's event listeners; drags are dispatched as pointer event
 * objects with the exact fields `onPointerDown`/`onMouseMove` read.
 */

type Listener = (event: any) => void;

function createDomStub() {
	const listeners = new Map<string, Listener[]>();
	const domElement = {
		addEventListener: (type: string, fn: Listener) => {
			listeners.set(type, [...(listeners.get(type) ?? []), fn]);
		},
		removeEventListener: (type: string, fn: Listener) => {
			listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn));
		},
		dispatch: (type: string, event: any) => {
			for (const fn of listeners.get(type) ?? []) fn(event);
		},
		setPointerCapture: () => {},
		releasePointerCapture: () => {},
		getRootNode: () => ({ addEventListener: () => {}, removeEventListener: () => {} }),
		clientHeight: 600,
		clientWidth: 800,
		style: {} as Record<string, string>
	};
	return domElement;
}

function createRig() {
	const camera = new PerspectiveCamera(50, 16 / 9, 0.025, 400);
	camera.position.set(6, 5, 7);
	const domElement = createDomStub();
	const controls = new OrbitControls(camera, domElement as unknown as HTMLElement);
	controls.target.set(0, 1, 0);
	controls.update();
	return { camera, controls, dispatch: domElement.dispatch };
}

function screenUp(camera: PerspectiveCamera): Vector3 {
	return new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
}

function quaternionAngle(a: Quaternion, b: Quaternion): number {
	return 2 * Math.acos(Math.min(1, Math.abs(a.dot(b))));
}

function drag(dispatch: (type: string, event: any) => void, from: [number, number], to: [number, number]) {
	dispatch('pointerdown', {
		pointerId: 1,
		pointerType: 'mouse',
		button: 0,
		clientX: from[0],
		clientY: from[1],
		preventDefault: () => {}
	});
	dispatch('pointermove', {
		pointerId: 1,
		pointerType: 'mouse',
		clientX: to[0],
		clientY: to[1],
		preventDefault: () => {}
	});
	dispatch('pointerup', {
		pointerId: 1,
		pointerType: 'mouse',
		button: 0,
		clientX: to[0],
		clientY: to[1],
		preventDefault: () => {}
	});
}

let camera: PerspectiveCamera;
let controls: OrbitControls;
let dispatch: (type: string, event: any) => void;

beforeEach(() => {
	({ camera, controls, dispatch } = createRig());
});

describe('P3B.4 polar orbit handoff (real OrbitControls)', () => {
	it('TOP: commits Plan-North roll and survives the per-frame re-derivation without roll pop', () => {
		expect(snapEditorViewToCardinal('+Y', camera, controls)).toBe(true);

		const distance = camera.position.distanceTo(controls.target);
		// The commit round-trips the offset through the controls orbit frame;
		// ~1e-5 float noise on a 12-unit radius is expected on the off-axis
		// components.
		expect(camera.position.x).toBeCloseTo(0, 4);
		expect(camera.position.z).toBeCloseTo(0, 4);
		expect(distance).toBeGreaterThan(0);

		// (a) committed roll: screen-up ≈ world −Z (Plan North).
		const committedUp = screenUp(camera);
		expect(committedUp.x).toBeCloseTo(0, 5);
		expect(committedUp.y).toBeCloseTo(0, 5);
		expect(committedUp.z).toBeCloseTo(-1, 5);

		const restQuaternion = camera.quaternion.clone();
		const restPosition = camera.position.clone();

		// (c) the per-frame damping task calls update() ~16ms later; the
		// epsilon-guard re-derivation must not visibly move the camera.
		controls.update();

		expect(quaternionAngle(camera.quaternion, restQuaternion)).toBeLessThan(1e-4);
		expect(camera.position.distanceTo(restPosition)).toBeLessThan(1e-6);
		expect(camera.up.toArray()).toEqual([0, 1, 0]);
	});

	it('TOP: orbit drags after the snap operate around the global +Y pole', () => {
		snapEditorViewToCardinal('+Y', camera, controls);

		// Vertical drag descends from the exact pole toward world +Z.
		drag(dispatch, [300, 300], [300, 260]);
		controls.update();

		const offsetAfterVertical = camera.position.clone().sub(controls.target);
		expect(offsetAfterVertical.y).toBeGreaterThan(0);
		expect(offsetAfterVertical.x).toBeCloseTo(0, 5);

		// North stays up while off-pole (no roll pop during real orbit).
		const offPoleUp = screenUp(camera);
		expect(offPoleUp.x).toBeCloseTo(0, 4);
		expect(offPoleUp.z).toBeLessThan(-0.8);

		// Horizontal drag rotates the offset around the Y axis: height over
		// the target is invariant and the offset leaves the X=0 plane.
		const heightBefore = offsetAfterVertical.y;
		drag(dispatch, [300, 300], [360, 300]);
		controls.update();

		const offsetAfterHorizontal = camera.position.clone().sub(controls.target);
		expect(offsetAfterHorizontal.y).toBeCloseTo(heightBefore, 6);
		// rotateLeft(Δx > 0) decreases azimuth, so the offset swings to −X;
		// the invariant is the XZ-plane orbit itself (y held exactly).
		expect(Math.abs(offsetAfterHorizontal.x)).toBeGreaterThan(0.5);
		expect(camera.up.toArray()).toEqual([0, 1, 0]);
	});

	it('BOTTOM: commits mirrored Plan-South roll and survives the re-derivation', () => {
		expect(snapEditorViewToCardinal('-Y', camera, controls)).toBe(true);

		const committedUp = screenUp(camera);
		expect(committedUp.x).toBeCloseTo(0, 5);
		expect(committedUp.y).toBeCloseTo(0, 5);
		expect(committedUp.z).toBeCloseTo(1, 5);

		const restQuaternion = camera.quaternion.clone();
		controls.update();

		expect(quaternionAngle(camera.quaternion, restQuaternion)).toBeLessThan(1e-4);
		expect(camera.up.toArray()).toEqual([0, 1, 0]);
	});

	it('SIDE (+X): re-derivation is exact — no epsilon guard on non-polar faces', () => {
		expect(snapEditorViewToCardinal('+X', camera, controls)).toBe(true);

		const restQuaternion = camera.quaternion.clone();
		const screenUpBefore = screenUp(camera);
		expect(screenUpBefore.y).toBeCloseTo(1, 6);

		controls.update();

		expect(quaternionAngle(camera.quaternion, restQuaternion)).toBeLessThan(1e-8);
	});
});
