import { describe, expect, it } from 'vitest';
import { Box3, Group, Mesh, BoxGeometry, Vector3 } from 'three';
import {
	createEditorBoundsCameraFrame,
	createEditorPanSpeed,
	createEditorPlacementCameraFrame,
	EDITOR_PAN_BASE_SPEED
} from './editor-camera';

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
});
