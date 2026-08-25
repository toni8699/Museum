import { VISITOR_CAMERA_PROJECTION } from '$lib/museum/navigation/camera-motion';
import { Box3, Group, Mesh, BoxGeometry, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
	captureEditorOrbitPose,
	createEditorBoundsCameraFrame,
	createEditorNodeCameraFrame,
	createEditorPanSpeed,
	createEditorBoundsNeutralFallback,
	createEditorPlacementCameraFrame,
	EDITOR_DIRECTOR_OBSERVER_OFFSET,
	EDITOR_NODE_FRAME_EXPANSION,
	EDITOR_PAN_BASE_SPEED,
	followEditorDirectorObserver,
	prepareEditorCameraPreview,
	recenterEditorDirectorObserver,
	restoreEditorOrbitPose,
	snapEditorViewToCardinal,
	CARDINAL_FACE_TO_EYE,
	CARDINAL_FACE_UP,
	EDITOR_CARDINAL_MIN_DISTANCE,
	EDITOR_NEUTRAL_CAMERA_POSITION,
	EDITOR_NEUTRAL_CAMERA_TARGET,
	type CardinalView,
	type EditorOrbitControlsLike
} from '$lib/editor/camera/editor-camera';
import type { LayoutBounds3 } from '$lib/layout/layout-geometry-types';

function createControls(
	overrides: Partial<EditorOrbitControlsLike> = {}
): EditorOrbitControlsLike {
	return {
		target: new Vector3(),
		minDistance: 1,
		maxDistance: 60,
		enabled: true,
		enableDamping: true,
		update: () => true,
		...overrides
	};
}

describe('editor camera helpers', () => {
	it('boosts close inspection panning and keeps room overview near base speed', () => {
		expect(createEditorPanSpeed(1)).toBeGreaterThan(EDITOR_PAN_BASE_SPEED);
		expect(createEditorPanSpeed(8)).toBeCloseTo(EDITOR_PAN_BASE_SPEED);
		expect(createEditorPanSpeed(40)).toBeCloseTo(EDITOR_PAN_BASE_SPEED);
	});

	it('rejects empty bounds and preserves the current viewing direction', () => {
		expect(
			createEditorBoundsCameraFrame(new Box3(), new Vector3(0, 2, 5), new Vector3())
		).toBeNull();

		const position = new Vector3(4, 3, 6);
		const target = new Vector3(1, 1, 1);
		const frame = createEditorBoundsCameraFrame(
			new Box3(new Vector3(-1, 0, -2), new Vector3(3, 4, 2)),
			position,
			target,
			{ aspect: 16 / 9 }
		);
		expect(frame).not.toBeNull();
		const before = position.clone().sub(target).normalize();
		const after = new Vector3(...frame!.position)
			.sub(new Vector3(...frame!.target))
			.normalize();
		expect(after.distanceTo(before)).toBeLessThan(1e-8);
	});

	it('uses horizontal FOV and viewport aspect when calculating distance', () => {
		const bounds = new Box3(new Vector3(-4, -1, -1), new Vector3(4, 1, 1));
		const position = new Vector3(0, 2, 8);
		const target = new Vector3();
		const narrow = createEditorBoundsCameraFrame(bounds, position, target, { aspect: 0.5 });
		const wide = createEditorBoundsCameraFrame(bounds, position, target, { aspect: 2 });
		expect(new Vector3(...narrow!.position).distanceTo(new Vector3(...narrow!.target))).toBeGreaterThan(
			new Vector3(...wide!.position).distanceTo(new Vector3(...wide!.target))
		);
	});

	it('frames a placement from its world bounds', () => {
		const root = new Group();
		root.position.set(3, 1, -2);
		root.add(new Mesh(new BoxGeometry(2, 4, 2)));
		root.updateMatrixWorld(true);
		const frame = createEditorPlacementCameraFrame(
			root,
			new Vector3(3, 4, 8),
			new Vector3(3, 1, -2),
			{ aspect: 1 }
		);
		expect(frame?.target).toEqual([3, 1, -2]);
		expect(frame?.radius).toBeGreaterThan(2);
	});

	it('frames both world-space camera points with a fixed half-metre expansion', () => {
		const eye = new Vector3(1, 2, 3);
		const target = new Vector3(3, 4, 7);
		const originalEye = eye.clone();
		const originalTarget = target.clone();
		const frame = createEditorNodeCameraFrame(
			eye,
			target,
			new Vector3(4, 6, 12),
			new Vector3(2, 3, 5)
		);

		expect(frame?.target).toEqual([2, 3, 5]);
		expect(frame?.radius).toBeCloseTo(Math.hypot(1.5, 1.5, 2.5));
		expect(EDITOR_NODE_FRAME_EXPANSION).toBe(0.5);
		expect(eye).toEqual(originalEye);
		expect(target).toEqual(originalTarget);
	});

	it('frames coincident eye and target points with non-zero bounds', () => {
		const point = new Vector3(-2, 1.5, 8);
		const frame = createEditorNodeCameraFrame(
			point,
			point,
			new Vector3(0, 5, 12),
			new Vector3()
		);

		expect(frame?.target).toEqual(point.toArray());
		expect(frame?.radius).toBeCloseTo(Math.sqrt(3) * EDITOR_NODE_FRAME_EXPANSION);
		expect(frame?.radius).toBeGreaterThan(0);
	});

	it('captures an independent orbit pose without viewport aspect', () => {
		const camera = new PerspectiveCamera(37, 16 / 9, 0.025, 340);
		camera.position.set(7, 4, -9);
		camera.zoom = 2.75;
		const controls = createControls({
			target: new Vector3(-3, 1.25, 6),
			minDistance: 0.4,
			maxDistance: 87,
			enabled: false,
			enableDamping: false
		});

		const pose = captureEditorOrbitPose(camera, controls);
		camera.position.setScalar(100);
		controls.target.setScalar(200);

		expect(pose.position.toArray()).toEqual([7, 4, -9]);
		expect(pose.target.toArray()).toEqual([-3, 1.25, 6]);
		expect(pose).toMatchObject({
			zoom: 2.75,
			fov: 37,
			near: 0.025,
			far: 340,
			minDistance: 0.4,
			maxDistance: 87,
			enabled: false,
			enableDamping: false
		});
		expect(pose).not.toHaveProperty('aspect');
	});

	it('disables and flushes OrbitControls before applying visitor projection', () => {
		const camera = new PerspectiveCamera(41, 1.3, 0.025, 400);
		camera.zoom = 2.5;
		const updateProjectionMatrix = vi.spyOn(camera, 'updateProjectionMatrix');
		const observations: Array<{
			enabled: boolean;
			enableDamping: boolean;
			fov: number;
		}> = [];
		const controls = createControls({
			update: () => {
				observations.push({
					enabled: controls.enabled,
					enableDamping: controls.enableDamping,
					fov: camera.fov
				});
			}
		});

		prepareEditorCameraPreview(camera, controls);

		expect(observations).toEqual([{ enabled: false, enableDamping: false, fov: 41 }]);
		expect(camera.fov).toBe(VISITOR_CAMERA_PROJECTION.fov);
		expect(camera.near).toBe(VISITOR_CAMERA_PROJECTION.near);
		expect(camera.far).toBe(VISITOR_CAMERA_PROJECTION.far);
		expect(camera.zoom).toBe(1);
		expect(updateProjectionMatrix).toHaveBeenCalledTimes(1);
	});

	it('recenters Director to a deterministic oblique top-down pose', () => {
		const camera = new PerspectiveCamera();
		const controls = createControls({
			target: new Vector3(20, 20, 20),
			minDistance: 2,
			maxDistance: 3
		});
		const visitor = new Vector3(4, 1.65, -7);

		recenterEditorDirectorObserver(camera, controls, visitor);

		expect(controls.target.toArray()).toEqual(visitor.toArray());
		expect(camera.position.toArray()).toEqual([
			visitor.x + EDITOR_DIRECTOR_OBSERVER_OFFSET[0],
			visitor.y + EDITOR_DIRECTOR_OBSERVER_OFFSET[1],
			visitor.z + EDITOR_DIRECTOR_OBSERVER_OFFSET[2]
		]);
		expect(controls.minDistance).toBe(2);
		expect(controls.maxDistance).toBe(3);
	});

	it('follows virtual-camera delta without changing observer offset', () => {
		const camera = new PerspectiveCamera();
		camera.position.set(8, 6, 9);
		const controls = createControls({ target: new Vector3(2, 1, 3) });
		const originalOffset = camera.position.clone().sub(controls.target);
		const delta = new Vector3();

		expect(
			followEditorDirectorObserver(
				camera,
				controls,
				new Vector3(1, 2, 3),
				new Vector3(4, 5, 1),
				delta
			)
		).toBe(true);
		expect(camera.position.toArray()).toEqual([11, 9, 7]);
		expect(controls.target.toArray()).toEqual([5, 4, 1]);
		expect(camera.position.clone().sub(controls.target)).toEqual(originalOffset);
	});

	it.each([
		{ enabled: true, enableDamping: true },
		{ enabled: false, enableDamping: false }
	])(
		'restores the exact orbit pose and keeps the current aspect: %o',
		({ enabled, enableDamping }) => {
			const camera = new PerspectiveCamera(38, 1.75, 0.03, 260);
			camera.position.set(8, -2, 11);
			camera.zoom = 3.2;
			const controls = createControls({
				target: new Vector3(-4, 2.5, 7),
				minDistance: 0.65,
				maxDistance: 123,
				enabled,
				enableDamping
			});
			const pose = captureEditorOrbitPose(camera, controls);

			camera.position.set(-20, 9, 40);
			camera.zoom = 0.75;
			camera.fov = 80;
			camera.near = 1;
			camera.far = 20;
			camera.aspect = 0.625;
			controls.target.set(10, 10, 10);
			controls.minDistance = 5;
			controls.maxDistance = 15;
			controls.enabled = true;
			controls.enableDamping = true;

			const events: string[] = [];
			const originalUpdateProjectionMatrix = camera.updateProjectionMatrix.bind(camera);
			camera.updateProjectionMatrix = () => {
				events.push('projection');
				originalUpdateProjectionMatrix();
			};
			controls.update = () => {
				events.push('controls');
				expect(controls.enabled).toBe(false);
				expect(controls.enableDamping).toBe(false);
				expect(controls.minDistance).toBe(0);
				expect(controls.maxDistance).toBe(Number.POSITIVE_INFINITY);
				expect(camera.position.toArray()).toEqual(pose.position.toArray());
				expect(controls.target.toArray()).toEqual(pose.target.toArray());
			};

			restoreEditorOrbitPose(camera, controls, pose);

			expect(events).toEqual(['projection', 'controls']);
			expect(camera.position.toArray()).toEqual([8, -2, 11]);
			expect(controls.target.toArray()).toEqual([-4, 2.5, 7]);
			expect(camera.zoom).toBe(3.2);
			expect(camera.fov).toBe(38);
			expect(camera.near).toBe(0.03);
			expect(camera.far).toBe(260);
			expect(camera.aspect).toBe(0.625);
			expect(controls.minDistance).toBe(0.65);
			expect(controls.maxDistance).toBe(123);
			expect(controls.enabled).toBe(enabled);
			expect(controls.enableDamping).toBe(enableDamping);
		}
	);

	describe('snapEditorViewToCardinal (P3B.1 approved contract)', () => {
		const FACES: CardinalView[] = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];

		function cameraAt(
			target: Vector3,
			distance: number,
			direction: [number, number, number] = [1, 0, 0]
		) {
			const camera = new PerspectiveCamera(50, 16 / 9, 0.025, 400);
			camera.position
				.copy(target)
				.add(new Vector3(direction[0], direction[1], direction[2]).multiplyScalar(distance));
			return camera;
		}

		it.each(FACES.map((face) => [face]))(
			'places the eye on the %s side at the current distance and restores +Y up',
			(face) => {
				const target = new Vector3(4, 2, -3);
				const camera = cameraAt(target, 12, [1, 0, 0]);
				const controls = createControls({ target: target.clone() });

				expect(snapEditorViewToCardinal(face, camera, controls)).toBe(true);

				const [dx, dy, dz] = CARDINAL_FACE_TO_EYE[face as CardinalView];
				expect(camera.position.toArray()).toEqual([
					target.x + dx * 12,
					target.y + dy * 12,
					target.z + dz * 12
				]);
				expect(controls.target.toArray()).toEqual(target.toArray());
				// Post-snap orbit pole restored to world +Y.
				expect(camera.up.toArray()).toEqual([0, 1, 0]);
				// Camera looks at the target (float-tolerant).
				const view = camera.getWorldDirection(new Vector3());
				expect(view.x).toBeCloseTo(-dx);
				expect(view.y).toBeCloseTo(-dy);
				expect(view.z).toBeCloseTo(-dz);
			}
		);

		it.each([
			['+Y', [0, 0, -1]],
			['-Y', [0, 0, 1]]
		] as Array<[CardinalView, number[]]>)('uses table roll for polar %s face', (face, worldUp) => {
			const target = new Vector3();
			const camera = cameraAt(target, 10, [0, 1, 0]);
			const controls = createControls({ target });

			snapEditorViewToCardinal(face, camera, controls);

			// Local +Y axis in world after the commit `lookAt` (matrixWorld is
			// not auto-updated by `lookAt`, so derive it from the quaternion).
			const committedUp = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
			expect(committedUp.x).toBeCloseTo(worldUp[0]);
			expect(committedUp.y).toBeCloseTo(worldUp[1]);
			expect(committedUp.z).toBeCloseTo(worldUp[2]);
			expect(CARDINAL_FACE_UP[face]).toEqual(worldUp);
		});

		it('clamps the snapped distance into controls min/max before commit', () => {
			const target = new Vector3();
			const camera = cameraAt(target, 8, [1, 0, 0]);
			const controls = createControls({ target, minDistance: 2, maxDistance: 3 });

			expect(snapEditorViewToCardinal('+X', camera, controls)).toBe(true);
			expect(camera.position.distanceTo(target)).toBeCloseTo(3);
		});

		it('drains pending controls inertia before resolving the snap', () => {
			// The first update() simulates OrbitControls consuming damped
			// residue against the pre-snap pose; the commit must resolve its
			// distance from that settled state (12), not from the stale pose
			// (10), and no inertia may survive into the commit.
			const target = new Vector3();
			const camera = cameraAt(target, 10, [1, 0, 0]);
			let updates = 0;
			const controls = createControls({
				target: target.clone(),
				update: () => {
					updates += 1;
					if (updates === 1) camera.position.setX(12);
				}
			});

			expect(snapEditorViewToCardinal('+Z', camera, controls)).toBe(true);

			expect(updates).toBe(2);
			expect(camera.position.toArray()).toEqual([0, 0, 12]);
		});

		it('invokes the fallback resolver at most once per snap', () => {
			// Stateful resolvers must not observe multiple calls across the
			// pre/post-flush resolutions.
			const target = new Vector3();
			const camera = cameraAt(target, 6, [1, 0, 0]);
			let calls = 0;
			const controls = createControls({ target: new Vector3(NaN, NaN, NaN) });
			const fallback = vi.fn(() => {
				calls += 1;
				return { target: new Vector3(1, 1, 1), position: new Vector3(7, 1, 1) };
			});

			expect(snapEditorViewToCardinal('+X', camera, controls, fallback)).toBe(true);

			expect(calls).toBe(1);
			expect(controls.target.toArray()).toEqual([1, 1, 1]);
			expect(camera.position.toArray()).toEqual([7, 1, 1]);
		});

		it('commits the cached basis when the flush invalidates the current pose', () => {
			const target = new Vector3();
			const camera = cameraAt(target, 8, [1, 0, 0]);
			let updates = 0;
			const controls = createControls({
				target: target.clone(),
				update: () => {
					updates += 1;
					if (updates === 1) controls.target.set(NaN, NaN, NaN);
					return true;
				}
			});

			// No post-flush failure exit exists: the validated pre-flush basis
			// commits even though the settled current pose turned non-finite.
			expect(snapEditorViewToCardinal('+Z', camera, controls)).toBe(true);

			expect(updates).toBe(2);
			expect(controls.target.toArray()).toEqual([0, 0, 0]);
			expect(camera.position.toArray()).toEqual([0, 0, 8]);
		});

		it('preserves projection and controls configuration', () => {
			const target = new Vector3(1, 1, 1);
			const camera = cameraAt(target, 9, [0, 1, 0]);
			camera.zoom = 2.5;
			camera.fov = 41;
			camera.near = 0.1;
			camera.far = 500;
			const controls = createControls({ target, minDistance: 0.4, maxDistance: 99 });

			snapEditorViewToCardinal('+Z', camera, controls);

			expect(camera.zoom).toBe(2.5);
			expect(camera.fov).toBe(41);
			expect(camera.near).toBe(0.1);
			expect(camera.far).toBe(500);
			expect(controls.minDistance).toBe(0.4);
			expect(controls.maxDistance).toBe(99);
			expect(controls.enabled).toBe(true);
			expect(controls.enableDamping).toBe(true);
		});

		it('uses the existing fallback when the active target is invalid', () => {
			const camera = cameraAt(new Vector3(0, 2, 5), 6, [1, 0, 0]);
			const controls = createControls({ target: new Vector3(NaN, NaN, NaN) });
			const fallback = { target: new Vector3(-2, 1, 3), position: new Vector3(4, 1, 3) };

			expect(
				snapEditorViewToCardinal('-Z', camera, controls, () => fallback)
			).toBe(true);

			expect(controls.target.toArray()).toEqual([-2, 1, 3]);
			expect(camera.position.toArray()).toEqual([-2, 1, -3]);
		});

		it('uses the fallback when eye and target are degenerate', () => {
			const target = new Vector3(1, 1, 1);
			const camera = cameraAt(target, 0, [1, 0, 0]);
			const controls = createControls({ target: target.clone() });
			const fallback = { target: new Vector3(), position: new Vector3(0, 5, 0) };

			expect(snapEditorViewToCardinal('+Y', camera, controls, () => fallback)).toBe(true);
			expect(camera.position.toArray()).toEqual([0, 5, 0]);
		});

		it('builds the step-3 fallback from the neutral editor pose authority', () => {
			// The fallback resolver is injected, but callers build it from the
			// cited existing authority: the neutral editor pose constants.
			const camera = cameraAt(new Vector3(1, 1, 1), 5, [1, 0, 0]);
			const controls = createControls({ target: new Vector3(NaN, NaN, NaN) });
			const fallback = {
				target: new Vector3(...EDITOR_NEUTRAL_CAMERA_TARGET),
				position: new Vector3(...EDITOR_NEUTRAL_CAMERA_POSITION)
			};

			const neutralTarget = new Vector3(...EDITOR_NEUTRAL_CAMERA_TARGET);
			const neutralDistance = new Vector3(...EDITOR_NEUTRAL_CAMERA_POSITION).distanceTo(
				neutralTarget
			);
			expect(snapEditorViewToCardinal('+X', camera, controls, () => fallback)).toBe(true);
			expect(controls.target.toArray()).toEqual(EDITOR_NEUTRAL_CAMERA_TARGET);
			// +X eye sits at the neutral target offset by the resolved distance.
			expect(camera.position.toArray()).toEqual([
				EDITOR_NEUTRAL_CAMERA_TARGET[0] + neutralDistance,
				EDITOR_NEUTRAL_CAMERA_TARGET[1],
				EDITOR_NEUTRAL_CAMERA_TARGET[2]
			]);
		});

		it('builds the step-2 fallback from a bounds-frame result', () => {
			const bounds = new Box3(new Vector3(-1, 0, -2), new Vector3(3, 4, 2));
			const frame = createEditorBoundsCameraFrame(
				bounds,
				new Vector3(0, 2, 5),
				new Vector3()
			);
			expect(frame).not.toBeNull();
			const camera = cameraAt(new Vector3(1, 1, 1), 5, [1, 0, 0]);
			const controls = createControls({ target: new Vector3(NaN, NaN, NaN) });
			const fallback = {
				target: new Vector3(...frame!.target),
				position: new Vector3(...frame!.position)
			};

			const frameTarget = new Vector3(...frame!.target);
			const frameDistance = new Vector3(...frame!.position).distanceTo(frameTarget);
			expect(snapEditorViewToCardinal('-Y', camera, controls, () => fallback)).toBe(true);
			expect(controls.target.toArray()).toEqual(frame!.target);
			// -Y eye sits below the target at the frame's resolved distance.
			expect(camera.position.toArray()[1]).toBeCloseTo(frame!.target[1] - frameDistance);
		});

		it('no-ops safely when no valid target or fallback exists', () => {
			const camera = cameraAt(new Vector3(1, 1, 1), 5, [1, 0, 0]);
			const controls = createControls({ target: new Vector3(NaN, NaN, NaN) });
			const before = camera.position.clone();
			const beforeUp = camera.up.clone();
			// Simulate real OrbitControls: update() applies residue and can
			// poison the camera through a lookAt on a non-finite target.
			let updates = 0;
			controls.update = () => {
				updates += 1;
				camera.position.setScalar(NaN);
				return true;
			};

			expect(snapEditorViewToCardinal('+X', camera, controls)).toBe(false);
			expect(updates).toBe(0);
			expect(camera.position).toEqual(before);
			expect(camera.up).toEqual(beforeUp);
			expect(controls.target.x).toBeNaN();
		});

		it('rejects distances at or below the minimum epsilon', () => {
			const target = new Vector3();
			const camera = cameraAt(target, EDITOR_CARDINAL_MIN_DISTANCE, [1, 0, 0]);
			const controls = createControls({ target: target.clone() });

			expect(snapEditorViewToCardinal('+X', camera, controls)).toBe(false);
		});

		it('flushes inertia only after a viable basis is confirmed', () => {
			// Degenerate distance with no fallback: the snap fails atomically —
			// no flush may run even though a fallback-less resolve also fails.
			const target = new Vector3();
			const camera = cameraAt(target, 0, [1, 0, 0]);
			let updates = 0;
			const controls = createControls({
				target: target.clone(),
				update: () => {
					updates += 1;
					return true;
				}
			});

			expect(snapEditorViewToCardinal('+X', camera, controls)).toBe(false);
			expect(updates).toBe(0);
		});
	});

	describe('createEditorBoundsNeutralFallback (P3B.1 composed fallback)', () => {
		const BOUNDS: LayoutBounds3 = {
			min: [-1, 0, -2],
			max: [3, 4, 2]
		};
		const CENTER = new Vector3(1, 2, 0);

		function resolverFor(
			currentPosition: Vector3,
			currentTarget: Vector3,
			layoutBounds: LayoutBounds3 | null = BOUNDS
		) {
			return createEditorBoundsNeutralFallback(
				layoutBounds,
				currentPosition,
				currentTarget
			);
		}

		it('frames bounds along the live viewing direction when it is valid', () => {
			const position = new Vector3(10, 2, 5);
			const target = new Vector3(1, 2, 0);
			const candidate = resolverFor(position, target)();

			expect(candidate).not.toBeNull();
			const frameTarget = new Vector3(...candidate!.target);
			expect(frameTarget.distanceTo(CENTER)).toBeLessThan(1e-8);
			const direction = position.clone().sub(target).normalize();
			const frameDirection = new Vector3(...candidate!.position).sub(frameTarget).normalize();
			expect(frameDirection.angleTo(direction)).toBeLessThan(1e-6);
		});

		it('frames bounds along the neutral gaze when the active target is non-finite', () => {
			const candidate = resolverFor(new Vector3(4, 1, 3), new Vector3(NaN, NaN, NaN))();

			expect(candidate).not.toBeNull();
			// Every vector must be finite — the poisoned-frame regression.
			expect(candidate!.position.toArray().every(Number.isFinite)).toBe(true);
			expect(candidate!.target.toArray().every(Number.isFinite)).toBe(true);
			const frameTarget = new Vector3(...candidate!.target);
			expect(frameTarget.distanceTo(CENTER)).toBeLessThan(1e-8);
			const neutralDirection = new Vector3(...EDITOR_NEUTRAL_CAMERA_POSITION)
				.sub(new Vector3(...EDITOR_NEUTRAL_CAMERA_TARGET))
				.normalize();
			const frameDirection = new Vector3(...candidate!.position).sub(frameTarget).normalize();
			expect(frameDirection.angleTo(neutralDirection)).toBeLessThan(1e-6);
		});

		it('frames bounds along the neutral gaze for a coincident pose', () => {
			const point = new Vector3(1, 2, 0);
			const candidate = resolverFor(point, point.clone())();

			expect(candidate).not.toBeNull();
			const frameTarget = new Vector3(...candidate!.target);
			const frameDirection = new Vector3(...candidate!.position).sub(frameTarget).normalize();
			const neutralDirection = new Vector3(...EDITOR_NEUTRAL_CAMERA_POSITION)
				.sub(new Vector3(...EDITOR_NEUTRAL_CAMERA_TARGET))
				.normalize();
			expect(frameDirection.angleTo(neutralDirection)).toBeLessThan(1e-6);
		});

		it('returns the neutral editor pose when no layout bounds exist', () => {
			const candidate = resolverFor(new Vector3(4, 1, 3), new Vector3(), null)();

			expect(candidate!.position.toArray()).toEqual(EDITOR_NEUTRAL_CAMERA_POSITION);
			expect(candidate!.target.toArray()).toEqual(EDITOR_NEUTRAL_CAMERA_TARGET);
		});

		it('falls back to the neutral editor pose when framing fails', () => {
			// Non-finite bounds yield a null frame inside the factory; the
			// neutral pose must survive it.
			const candidate = resolverFor(new Vector3(4, 1, 3), new Vector3(), {
				min: [Number.POSITIVE_INFINITY, 0, 0],
				max: [1, 1, 1]
			})();

			expect(candidate!.position.toArray()).toEqual(EDITOR_NEUTRAL_CAMERA_POSITION);
			expect(candidate!.target.toArray()).toEqual(EDITOR_NEUTRAL_CAMERA_TARGET);
		});
	});
});
