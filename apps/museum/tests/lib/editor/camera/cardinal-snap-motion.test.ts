import { beforeEach, describe, expect, it } from 'vitest';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import {
	createEditorCardinalSnapMotion,
	EDITOR_CARDINAL_SNAP_DURATION_MS,
	type CardinalSnapMotionSample
} from '$lib/museum/navigation/camera-motion';
import {
	CARDINAL_FACE_TO_EYE,
	CARDINAL_FACE_UP,
	resolveEditorCardinalSnapBasis,
	snapEditorViewToCardinal,
	type CardinalView
} from '$lib/editor/camera/editor-camera';
import {
	cancelEditorOrientationSnap,
	editorOrientationSnapRuntime
} from '$lib/editor/editor-orientation-gizmo.svelte';

/**
 * P3B.4 — cardinal snap motion fixtures.
 *
 * Part 1 pins the pure sampler (endpoints, eased great-circle shape,
 * antipodal safety, immutability, retarget continuity). Part 2 proves —
 * against real three.js OrbitControls, headless — that the animated flight
 * driven exactly like the projector (sample → pose writes → controls.update()
 * → global +Y restore) converges to the instant commit's observable pose at
 * t = 1, including the polar faces.
 */

function motionFor(
	startEye: Vector3,
	face: CardinalView,
	resolvedTarget: Vector3 = new Vector3(),
	durationMs = EDITOR_CARDINAL_SNAP_DURATION_MS
) {
	return createEditorCardinalSnapMotion(
		startEye.clone(),
		resolvedTarget.clone(),
		new Vector3(0, 1, 0),
		resolvedTarget.clone(),
		new Vector3(...CARDINAL_FACE_TO_EYE[face]),
		startEye.distanceTo(resolvedTarget),
		new Vector3(...CARDINAL_FACE_UP[face]),
		durationMs
	);
}

describe('createEditorCardinalSnapMotion (P3B.4 pure sampler)', () => {
	it('defaults to the approved 320ms ease-out contract', () => {
		const motion = motionFor(new Vector3(6, 5, 7), '+X');
		expect(motion.durationMs).toBe(320);
		expect(motion.easing).toBe('ease-out');
	});

	it('starts exactly at the start pose and lands on the exact commit pose', () => {
		const target = new Vector3(2, -1, 3);
		const startEye = target.clone().add(new Vector3(5, 4, -6));
		const motion = createEditorCardinalSnapMotion(
			startEye.clone(),
			target.clone(),
			new Vector3(0, 1, 0),
			target.clone(),
			new Vector3(...CARDINAL_FACE_TO_EYE['+Z']),
			startEye.distanceTo(target),
			new Vector3(...CARDINAL_FACE_UP['+Z'])
		);

		const first: CardinalSnapMotionSample = motion.sample(0);
		expect(first.position.distanceTo(startEye)).toBeLessThan(1e-9);
		expect(first.target.distanceTo(target)).toBeLessThan(1e-12);
		expect(first.up.distanceTo(new Vector3(0, 1, 0))).toBeLessThan(1e-9);

		const last = motion.sample(1);
		expect(last.target.distanceTo(target)).toBeLessThan(1e-12);
		expect(
			last.position.distanceTo(target.clone().addScaledVector(new Vector3(0, 0, 1), startEye.distanceTo(target)))
		).toBeLessThan(1e-9);
		expect(last.up.x).toBeCloseTo(0, 12);
		expect(last.up.y).toBeCloseTo(1, 12);
		expect(last.up.z).toBeCloseTo(0, 12);
	});

	it('applies ease-out so the direction covers ~75% of the arc at mid-flight', () => {
		const startEye = new Vector3(8, 0, 8); // 45° from +X around Y
		const motion = motionFor(startEye, '+X');
		const total = startEye.clone().normalize().angleTo(new Vector3(1, 0, 0));
		const mid = motion.sample(0.5);
		const remaining = new Vector3(1, 0, 0).angleTo(mid.position.clone().normalize());
		// easeOut(0.5) = 0.75 of the arc covered → 25% remaining.
		expect(remaining / total).toBeCloseTo(0.25, 6);

		// Monotonic approach with no overshoot past the landing normal.
		let previousDot = new Vector3(...CARDINAL_FACE_TO_EYE['+X']).dot(
			motion.sample(0).position.clone().sub(motion.sample(0).target).normalize()
		);
		for (let step = 1; step <= 20; step += 1) {
			const sample = motion.sample(step / 20);
			const dot = new Vector3(1, 0, 0).dot(
				sample.position.clone().sub(sample.target).normalize()
			);
			expect(dot).toBeGreaterThanOrEqual(previousDot - 1e-12);
			previousDot = dot;
		}
	});

	it('sweeps antipodal snaps through a finite great circle without NaN', () => {
		const target = new Vector3();
		const startEye = new Vector3(-10, 0, 0); // exact opposite of +X
		const motion = motionFor(startEye, '+X');
		for (let step = 0; step <= 10; step += 1) {
			const sample = motion.sample(step / 10);
			for (const value of [sample.position.x, sample.position.y, sample.position.z]) {
				expect(Number.isFinite(value)).toBe(true);
			}
			expect(sample.position.distanceTo(sample.target)).toBeCloseTo(10, 9);
		}
		// The sweep runs eased: at raw progress p*, easeOut(p*) = 0.5 crosses
		// the deterministic orthogonal reference (90°), leaving the X axis.
		const quarter = motion.sample(1 - Math.SQRT1_2);
		expect(Math.abs(quarter.position.x)).toBeLessThan(1e-6);

		// Mid-flight (eased 0.75 → 135°) sits symmetrically on that sweep.
		const mid = motion.sample(0.5);
		expect(Math.abs(mid.position.x)).toBeCloseTo(Math.abs(mid.position.z), 6);
	});

	it('slerps polar up references and ends exact', () => {
		const target = new Vector3();
		const startEye = new Vector3(6, 5, 7);
		const motion = createEditorCardinalSnapMotion(
			startEye.clone(),
			target.clone(),
			new Vector3(0, 1, 0),
			target.clone(),
			new Vector3(...CARDINAL_FACE_TO_EYE['+Y']),
			startEye.distanceTo(target),
			new Vector3(...CARDINAL_FACE_UP['+Y']) // (0, 0, -1)
		);

		const half = motion.sample(0.5).up;
		expect(half.length()).toBeCloseTo(1, 9);
		for (const value of [half.x, half.y, half.z]) expect(Number.isFinite(value)).toBe(true);

		const end = motion.sample(1).up;
		expect(end.x).toBeCloseTo(0, 12);
		expect(end.y).toBeCloseTo(0, 12);
		expect(end.z).toBeCloseTo(-1, 12);
	});

	it('lerps the orbit-target channel for fallback-replaced targets', () => {
		const motion = createEditorCardinalSnapMotion(
			new Vector3(10, 0, 0),
			new Vector3(0, 0, 0),
			new Vector3(0, 1, 0),
			new Vector3(4, 8, 0), // fallback replaces the target
			new Vector3(1, 0, 0),
			6,
			new Vector3(0, 1, 0)
		);
		const mid = motion.sample(0.75); // easeOut(0.75) = 0.9375
		expect(mid.target.x).toBeCloseTo(3.75, 9);
		expect(mid.target.y).toBeCloseTo(7.5, 9);
	});

	it('retargeting from a mid-flight sample continues without a jump', () => {
		const startEye = new Vector3(6, 5, 7);
		const firstFlight = motionFor(startEye, '+Y');
		const pivot = firstFlight.sample(0.4);

		const secondFlight = createEditorCardinalSnapMotion(
			pivot.position.clone(),
			pivot.target.clone(),
			pivot.up.clone(),
			new Vector3(),
			new Vector3(...CARDINAL_FACE_TO_EYE['-Z']),
			pivot.position.distanceTo(pivot.target),
			new Vector3(...CARDINAL_FACE_UP['-Z'])
		);

		const resumed = secondFlight.sample(0);
		expect(resumed.position.distanceTo(pivot.position)).toBeLessThan(1e-9);
		expect(resumed.target.distanceTo(pivot.target)).toBeLessThan(1e-12);
		expect(resumed.up.distanceTo(pivot.up)).toBeLessThan(1e-9);
	});

	it('does not mutate its inputs across sampling', () => {
		const startEye = new Vector3(6, 5, 7);
		const target = new Vector3(1, 2, 3);
		const up = new Vector3(0, 1, 0);
		const normal = new Vector3(...CARDINAL_FACE_TO_EYE['-Y']);
		const targetUp = new Vector3(...CARDINAL_FACE_UP['-Y']);
		const eyeBefore = startEye.clone();
		const targetBefore = target.clone();

		const motion = createEditorCardinalSnapMotion(
			startEye, target, up, target, normal, 9, targetUp
		);
		for (let step = 0; step <= 10; step += 1) motion.sample(step / 10);

		expect(startEye.distanceTo(eyeBefore)).toBeLessThan(1e-15);
		expect(target.distanceTo(targetBefore)).toBeLessThan(1e-15);
		expect(up.toArray()).toEqual([0, 1, 0]);
	});
});

/* ── Convergence with the instant commit (real OrbitControls, headless) ── */

type Listener = (event: any) => void;

function createDomStub() {
	const listeners = new Map<string, Listener[]>();
	return {
		addEventListener: (type: string, fn: Listener) => {
			listeners.set(type, [...(listeners.get(type) ?? []), fn]);
		},
		removeEventListener: (type: string, fn: Listener) => {
			listeners.set(type, (listeners.get(type) ?? []).filter((candidate) => candidate !== fn));
		},
		setPointerCapture: () => {},
		releasePointerCapture: () => {},
		getRootNode: () => ({ addEventListener: () => {}, removeEventListener: () => {} }),
		clientHeight: 600,
		clientWidth: 800,
		style: {} as Record<string, string>
	};
}

function createRig() {
	const camera = new PerspectiveCamera(50, 16 / 9, 0.025, 400);
	camera.position.set(6, 5, 7);
	const controls = new OrbitControls(camera, createDomStub() as unknown as HTMLElement);
	controls.target.set(0, 1, 0);
	controls.update();
	return { camera, controls };
}

function quaternionAngle(a: Quaternion, b: Quaternion): number {
	return 2 * Math.acos(Math.min(1, Math.abs(a.dot(b))));
}

/** Drives a flight exactly like `EditorOrientationGizmoProjector`. */
function flyAnimatedFace(
	rig: ReturnType<typeof createRig>,
	face: CardinalView,
	steps = 16
): void {
	const basis = resolveEditorCardinalSnapBasis(rig.camera, rig.controls);
	if (!basis) throw new Error('fixture basis must resolve');
	const motion = createEditorCardinalSnapMotion(
		rig.camera.position.clone(),
		rig.controls.target.clone(),
		rig.camera.up.clone(),
		basis.target.clone(),
		new Vector3(...CARDINAL_FACE_TO_EYE[face]),
		basis.distance,
		new Vector3(...CARDINAL_FACE_UP[face])
	);
	for (let step = 1; step <= steps; step += 1) {
		const sample = motion.sample(step / steps);
		rig.camera.up.copy(sample.up);
		rig.camera.position.copy(sample.position);
		rig.camera.lookAt(sample.target);
		rig.controls.target.copy(sample.target);
		rig.camera.updateMatrixWorld(true);
		if (step === steps) {
			rig.controls.update();
			rig.camera.up.set(0, 1, 0);
			rig.camera.updateMatrixWorld(true);
		}
	}
}

describe('P3B.4 animated/instant convergence (real OrbitControls)', () => {
	let animated: ReturnType<typeof createRig>;
	let instant: ReturnType<typeof createRig>;

	beforeEach(() => {
		animated = createRig();
		instant = createRig();
	});

	it.each<CardinalView>(['+X', '-Z', '+Y', '-Y'])(
		'landing %s matches the instant commit pose within tolerance',
		(face) => {
			flyAnimatedFace(animated, face);
			expect(snapEditorViewToCardinal(face, instant.camera, instant.controls)).toBe(true);

			expect(animated.camera.position.distanceTo(instant.camera.position)).toBeLessThan(1e-9);
			expect(animated.controls.target.distanceTo(instant.controls.target)).toBeLessThan(1e-9);
			expect(quaternionAngle(animated.camera.quaternion, instant.camera.quaternion)).toBeLessThan(1e-4);

			// Same post-handoff state as the frozen primitive.
			expect(animated.camera.up.toArray()).toEqual([0, 1, 0]);
		}
	);

	it('the landed animated pose survives a per-frame damping update without drift', () => {
		flyAnimatedFace(animated, '+Y');
		const restQuaternion = animated.camera.quaternion.clone();
		const restPosition = animated.camera.position.clone();

		animated.controls.update();

		expect(quaternionAngle(animated.camera.quaternion, restQuaternion)).toBeLessThan(1e-4);
		expect(animated.camera.position.distanceTo(restPosition)).toBeLessThan(1e-6);
	});
});

describe('P3B.4 interruption handoff (real OrbitControls)', () => {
	beforeEach(() => {
		editorOrientationSnapRuntime.active = null;
	});

	/** Applies samples exactly like the projector but stops before the landing. */
	function flyPartway(rig: ReturnType<typeof createRig>, face: CardinalView, fraction: number) {
		const basis = resolveEditorCardinalSnapBasis(rig.camera, rig.controls);
		if (!basis) throw new Error('fixture basis must resolve');
		const motion = createEditorCardinalSnapMotion(
			rig.camera.position.clone(),
			rig.controls.target.clone(),
			rig.camera.up.clone(),
			basis.target.clone(),
			new Vector3(...CARDINAL_FACE_TO_EYE[face]),
			basis.distance,
			new Vector3(...CARDINAL_FACE_UP[face])
		);
		const steps = 16;
		const applied = Math.max(1, Math.round(steps * fraction));
		for (let step = 1; step <= applied; step += 1) {
			const sample = motion.sample(step / steps);
			rig.camera.up.copy(sample.up);
			rig.camera.position.copy(sample.position);
			rig.camera.lookAt(sample.target);
			rig.controls.target.copy(sample.target);
			rig.camera.updateMatrixWorld(true);
		}
		return { basis, motion };
	}

	function expectInterruptedHandoff(face: CardinalView): void {
		const rig = createRig();
		flyPartway(rig, face, 0.5);

		// Regression proof: mid-flight the pole is genuinely interpolated.
		expect(rig.camera.up.toArray()).not.toEqual([0, 1, 0]);
			editorOrientationSnapRuntime.active = {
				face,
				motion: motionFor(new Vector3(6, 5, 7), face),
				elapsedMs: 160,
				lastSample: null
			};
			const interruptedPosition = rig.camera.position.clone();
			const interruptedTarget = rig.controls.target.clone();

			cancelEditorOrientationSnap(rig.camera, rig.controls);

			// Runtime clears and the orbit frame is back on the global +Y pole.
			expect(editorOrientationSnapRuntime.active).toBeNull();
			expect(rig.camera.up.toArray()).toEqual([0, 1, 0]);
			// Non-terminal handoff preserves the exact sampled eye/target.
			expect(rig.camera.position.distanceTo(interruptedPosition)).toBeLessThan(1e-9);
			expect(rig.controls.target.distanceTo(interruptedTarget)).toBeLessThan(1e-9);

			// Non-terminal: the eye never reached the cardinal landing pose.
		const [nx, ny, nz] = CARDINAL_FACE_TO_EYE[face];
		const offset = rig.camera.position.clone().sub(rig.controls.target);
		const distance = offset.length();
		expect(offset.dot(new Vector3(nx, ny, nz)) / distance).toBeLessThan(0.999);

		// The normalized pose is stable under subsequent per-frame updates.
		const restQuaternion = rig.camera.quaternion.clone();
		const restPosition = rig.camera.position.clone();
		rig.controls.update();
		expect(quaternionAngle(rig.camera.quaternion, restQuaternion)).toBeLessThan(1e-4);
		expect(rig.camera.position.distanceTo(restPosition)).toBeLessThan(1e-6);
	}

	it('cancelling a +Y flight halfway restores global +Y without terminal snap', () => {
		expectInterruptedHandoff('+Y');
	});

	it('cancelling a -Y flight halfway restores global +Y without terminal snap', () => {
		expectInterruptedHandoff('-Y');
	});

	it('is a pure no-op when no flight is active', () => {
		const rig = createRig();
		rig.camera.up.set(0.3, 0.8, 0.2);
		cancelEditorOrientationSnap(rig.camera, rig.controls);
		expect(editorOrientationSnapRuntime.active).toBeNull();
		expect(rig.camera.up.toArray()).toEqual([0.3, 0.8, 0.2]);
	});
});
