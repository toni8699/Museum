import { beforeEach, describe, expect, it } from 'vitest';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PerspectiveCamera, Vector3 } from 'three';
import { snapEditorViewToCardinal } from '$lib/editor/camera/editor-camera';

/**
 * Residual-drag fixture (P3B.1 review fix): a released orbit fling leaves
 * damped rotate residue inside OrbitControls. The cardinal commit must
 * consume that inertia against the pre-snap pose so the snapped eye/target
 * stay exactly axis-aligned through the commit `update()` and every
 * subsequent per-frame damping update.
 *
 * OrbitControls is driven through the same stub-DOM harness as the
 * polar-orbit-handoff fixture: drags are dispatched as pointer event
 * objects with the exact fields the controls read.
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
	// The editor rig ships with damping enabled (`orbitDampingTaskEnabled`
	// starts true), so inertia after a released fling is production reality.
	controls.enableDamping = true;
	controls.target.set(0, 1, 0);
	controls.update();
	return { camera, controls, dispatch: domElement.dispatch };
}

/** Fling without any intermediate update() so full residue stays pending. */
function fling(dispatch: (type: string, event: any) => void) {
	for (const [type, clientX] of [
		['pointerdown', 400],
		['pointermove', 300],
		['pointermove', 200],
		['pointerup', 200]
	] as Array<[string, number]>) {
		dispatch(type, {
			pointerId: 1,
			pointerType: 'mouse',
			button: type === 'pointermove' ? undefined : 0,
			clientX,
			clientY: 300,
			preventDefault: () => {}
		});
	}
}

let camera: PerspectiveCamera;
let controls: OrbitControls;
let dispatch: (type: string, event: any) => void;

beforeEach(() => {
	({ camera, controls, dispatch } = createRig());
});

describe('cardinal snap under pending drag inertia (real OrbitControls)', () => {
	it('commits an exact +X snap that survives the damping settle', () => {
		fling(dispatch);

		expect(snapEditorViewToCardinal('+X', camera, controls)).toBe(true);

		const target = new Vector3(0, 1, 0);
		const offset = camera.position.clone().sub(target);
		// Eye sits exactly on the +X side of the target…
		expect(offset.y).toBeCloseTo(0, 5);
		expect(offset.z).toBeCloseTo(0, 5);
		expect(offset.x).toBeGreaterThan(0);
		// …at the settled post-flush distance, not the stale pre-flush one.
		const committedDistance = offset.length();

		// Per-frame damping updates must not move the exact pose.
		for (let frame = 0; frame < 40; frame += 1) controls.update();

		const settled = camera.position.clone().sub(target);
		expect(settled.y).toBeCloseTo(0, 6);
		expect(settled.z).toBeCloseTo(0, 6);
		expect(settled.length()).toBeCloseTo(committedDistance, 5);
		expect(camera.up.toArray()).toEqual([0, 1, 0]);
	});

	it('resolves the snap distance from the flushed pose', () => {
		controls.minDistance = 3;
		controls.maxDistance = 4;
		fling(dispatch);

		// The fling swings the eye wide; whatever distance remains after the
		// drain must be the one clamped into [min,max] and committed.
		expect(snapEditorViewToCardinal('+X', camera, controls)).toBe(true);

		const offset = camera.position.clone().sub(new Vector3(0, 1, 0));
		expect(offset.y).toBeCloseTo(0, 5);
		expect(offset.z).toBeCloseTo(0, 5);
		expect(offset.length()).toBeCloseTo(4, 5);
	});
});
