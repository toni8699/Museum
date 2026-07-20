import { VISITOR_CAMERA_PROJECTION } from '$lib/museum/navigation/camera-motion';
import { Box3, Group, Mesh, BoxGeometry, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
	captureEditorOrbitPose,
	createEditorBoundsCameraFrame,
	createEditorNodeCameraFrame,
	createEditorPanSpeed,
	createEditorPlacementCameraFrame,
	EDITOR_DIRECTOR_OBSERVER_OFFSET,
	EDITOR_NODE_FRAME_EXPANSION,
	EDITOR_PAN_BASE_SPEED,
	followEditorDirectorObserver,
	prepareEditorCameraPreview,
	recenterEditorDirectorObserver,
	restoreEditorOrbitPose,
	type EditorOrbitControlsLike
} from './editor-camera';

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
});
