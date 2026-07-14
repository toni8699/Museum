import { describe, expect, it } from 'vitest';
import {
	BoxGeometry,
	Group,
	Mesh,
	MeshBasicMaterial,
	PlaneGeometry,
	Vector3
} from 'three';
import {
	applyWorldYDeltaToPlacement,
	calculateGroundDeltaY,
	dropPlacementToFloor,
	findFloorBelowPlacement,
	getPlacementWorldBounds,
	GROUND_EPSILON,
	groundPlacementToFloor,
	groundSelectionRigidly,
	isEditorPlaceableFloor,
	rotationSnapRadians,
	snapRoomLocalPosition
} from './editor-placement';

function makeFloor(y = 0, roomId?: string) {
	const mesh = new Mesh(new PlaneGeometry(20, 20), new MeshBasicMaterial());
	mesh.rotation.x = -Math.PI / 2;
	mesh.position.y = y;
	mesh.userData.surfaceType = 'floor';
	mesh.userData.roomId = roomId;
	mesh.userData.editorSurface = { type: 'floor', placeable: true, roomId };
	mesh.updateMatrixWorld(true);
	return mesh;
}

function makeBoxPlacement(options?: {
	size?: number;
	position?: [number, number, number];
	scale?: number;
	rotationY?: number;
}) {
	const size = options?.size ?? 1;
	const root = new Group();
	const mesh = new Mesh(new BoxGeometry(size, size, size), new MeshBasicMaterial());
	root.add(mesh);
	if (options?.position) root.position.set(...options.position);
	if (options?.scale != null) root.scale.setScalar(options.scale);
	if (options?.rotationY != null) root.rotation.y = options.rotationY;
	root.updateMatrixWorld(true);
	return root;
}

describe('rotationSnapRadians', () => {
	it('converts degrees to radians for TransformControls', () => {
		expect(rotationSnapRadians(15)).toBeCloseTo(Math.PI / 12, 8);
		expect(rotationSnapRadians(90)).toBeCloseTo(Math.PI / 2, 8);
		expect(rotationSnapRadians(180)).toBeCloseTo(Math.PI, 8);
	});
});

describe('isEditorPlaceableFloor', () => {
	it('accepts only placeable floor surfaces', () => {
		const floor = makeFloor();
		expect(isEditorPlaceableFloor(floor)).toBe(true);

		const wall = new Mesh(new PlaneGeometry(1, 1));
		wall.userData.editorSurface = { type: 'wall', placeable: true };
		expect(isEditorPlaceableFloor(wall)).toBe(false);

		const locked = new Mesh(new PlaneGeometry(1, 1));
		locked.userData.editorSurface = { type: 'floor', placeable: false };
		expect(isEditorPlaceableFloor(locked)).toBe(false);
	});
});

describe('calculateGroundDeltaY', () => {
	it('computes downward offset when object bottom is above the floor', () => {
		const root = makeBoxPlacement({ position: [0, 2, 0] });
		const bounds = getPlacementWorldBounds(root);
		// Unit box centered at origin → bottom at y=-0.5 local; world bottom = 1.5
		expect(bounds.min.y).toBeCloseTo(1.5, 5);
		expect(calculateGroundDeltaY(bounds, 0)).toBeCloseTo(-1.5, 5);
	});

	it('computes upward offset when object bottom is below the floor', () => {
		const root = makeBoxPlacement({ position: [0, -1, 0] });
		const bounds = getPlacementWorldBounds(root);
		expect(bounds.min.y).toBeCloseTo(-1.5, 5);
		expect(calculateGroundDeltaY(bounds, 0)).toBeCloseTo(1.5, 5);
	});
});

describe('dropPlacementToFloor', () => {
	it('grounds a centered-pivot object using AABB bottom, not origin', () => {
		const root = makeBoxPlacement({ position: [0, 2, 0] });
		const floorHit = { point: new Vector3(0, 0, 0), distance: 2, object: makeFloor() };

		dropPlacementToFloor(root, floorHit);

		const bounds = getPlacementWorldBounds(root);
		expect(bounds.min.y).toBeCloseTo(0, 4);
		// Pivot stays at half-height above the floor for a unit cube.
		expect(root.position.y).toBeCloseTo(0.5, 4);
	});

	it('grounds scaled bounds correctly', () => {
		const root = makeBoxPlacement({ position: [0, 3, 0], scale: 2 });
		const floorHit = { point: new Vector3(0, 0.01, 0), distance: 3, object: makeFloor(0.01) };

		dropPlacementToFloor(root, floorHit);

		const bounds = getPlacementWorldBounds(root);
		expect(bounds.min.y).toBeCloseTo(0.01, 4);
		expect(root.position.y).toBeCloseTo(1.01, 4);
	});

	it('uses updated world-space box after rotation', () => {
		const root = makeBoxPlacement({
			position: [0, 2, 0],
			rotationY: Math.PI / 4
		});
		const before = getPlacementWorldBounds(root);
		const floorHit = { point: new Vector3(0, 0, 0), distance: 2, object: makeFloor() };

		dropPlacementToFloor(root, floorHit);

		const after = getPlacementWorldBounds(root);
		expect(after.min.y).toBeCloseTo(0, 4);
		// Rotated AABB width grows in XZ; Y extent for a Y-rotated box stays the same.
		expect(after.max.y - after.min.y).toBeCloseTo(before.max.y - before.min.y, 4);
	});

	it('returns no transform when there is no floor hit', () => {
		const root = makeBoxPlacement({ position: [0, 2, 0] });
		const beforeY = root.position.y;

		const result = groundPlacementToFloor(root, []);
		expect(result.grounded).toBe(false);
		expect(result.deltaY).toBe(0);
		expect(root.position.y).toBe(beforeY);
	});

	it('updates local position correctly under a transformed parent', () => {
		const parent = new Group();
		parent.position.set(10, 1, -5);
		parent.rotation.y = Math.PI / 2;
		parent.updateMatrixWorld(true);

		const root = makeBoxPlacement({ position: [0, 2, 0] });
		parent.add(root);
		parent.updateMatrixWorld(true);

		const floorHit = {
			point: new Vector3(0, 0.01, 0),
			distance: 1,
			object: makeFloor(0.01)
		};
		dropPlacementToFloor(root, floorHit);

		const bounds = getPlacementWorldBounds(root);
		expect(bounds.min.y).toBeCloseTo(0.01, 3);
	});
});

describe('findFloorBelowPlacement', () => {
	it('finds the nearest placeable floor below the object', () => {
		const root = makeBoxPlacement({ position: [0, 2, 0] });
		const floor = makeFloor(0.01);
		const scene = new Group();
		scene.add(floor);
		scene.add(root);
		scene.updateMatrixWorld(true);

		const hit = findFloorBelowPlacement(root, [scene]);
		expect(hit).not.toBeNull();
		expect(hit!.point.y).toBeCloseTo(0.01, 3);
		expect(isEditorPlaceableFloor(hit!.object)).toBe(true);
	});

	it('starts above the bounds and chooses the highest same-room floor', () => {
		const root = makeBoxPlacement({ position: [0, 2, 0] });
		root.userData.roomId = 'paris';
		const parisLow = makeFloor(0, 'paris');
		const parisHigh = makeFloor(0.75, 'paris');
		const otherRoomHigher = makeFloor(1.25, 'workshop');
		const scene = new Group();
		scene.add(parisLow, parisHigh, otherRoomHigher, root);
		scene.updateMatrixWorld(true);

		const hit = findFloorBelowPlacement(root, [scene]);
		expect(hit?.point.y).toBeCloseTo(0.75, 4);
		expect(hit?.object.userData.roomId).toBe('paris');
	});

	it('can recover from a floor intersecting the object and respects max drop distance', () => {
		const intersecting = makeBoxPlacement({ position: [0, 2, 0] });
		const raisedFloor = makeFloor(2.2);
		const raisedScene = new Group();
		raisedScene.add(raisedFloor, intersecting);
		raisedScene.updateMatrixWorld(true);
		expect(findFloorBelowPlacement(intersecting, [raisedScene])?.point.y).toBeCloseTo(2.2, 4);

		const distant = makeBoxPlacement({ position: [0, 100, 0] });
		const distantScene = new Group();
		distantScene.add(makeFloor(0), distant);
		distantScene.updateMatrixWorld(true);
		expect(findFloorBelowPlacement(distant, [distantScene])).toBeNull();
	});

	it('ignores unmarked geometry and the selected object itself', () => {
		const root = makeBoxPlacement({ position: [0, 2, 0] });
		const unmarked = new Mesh(new PlaneGeometry(20, 20), new MeshBasicMaterial());
		unmarked.rotation.x = -Math.PI / 2;
		unmarked.position.y = 0;
		unmarked.updateMatrixWorld(true);

		const scene = new Group();
		scene.add(unmarked);
		scene.add(root);
		scene.updateMatrixWorld(true);

		expect(findFloorBelowPlacement(root, [scene])).toBeNull();
	});
});

describe('applyWorldYDeltaToPlacement / snapRoomLocalPosition', () => {
	it('applies a world Y delta through a translated parent', () => {
		const parent = new Group();
		parent.position.set(0, 5, 0);
		parent.updateMatrixWorld(true);

		const root = new Group();
		parent.add(root);
		root.position.set(1, 0, 2);
		parent.updateMatrixWorld(true);

		applyWorldYDeltaToPlacement(root, -1.5);
		expect(root.position.y).toBeCloseTo(-1.5, 5);
		expect(root.position.x).toBeCloseTo(1, 5);
		expect(root.position.z).toBeCloseTo(2, 5);
	});

	it('snaps room-local translation to the configured step', () => {
		const root = new Group();
		root.position.set(0.14, 0.07, -0.26);
		snapRoomLocalPosition(root, 0.1);
		expect(root.position.x).toBeCloseTo(0.1, 8);
		expect(root.position.y).toBeCloseTo(0.1, 8);
		expect(root.position.z).toBeCloseTo(-0.3, 8);
	});

	it('can snap X/Z while preserving Y for keep-on-floor transforms', () => {
		const root = new Group();
		root.position.set(0.14, 0.07, -0.26);
		snapRoomLocalPosition(root, 0.1, { snapY: false });
		expect(root.position.toArray()).toEqual([0.1, 0.07, -0.30000000000000004]);
	});

	it('treats near-zero ground deltas as no-ops', () => {
		const root = makeBoxPlacement({ position: [0, 0.5, 0] });
		const before = root.position.y;
		applyWorldYDeltaToPlacement(root, GROUND_EPSILON / 2);
		expect(root.position.y).toBe(before);
	});
});

describe('groundSelectionRigidly', () => {
	it('uses one shared Y delta and preserves member spacing', () => {
		const first = makeBoxPlacement({ position: [-1, 2, 0] });
		const second = makeBoxPlacement({ position: [1, 4, 0] });
		first.userData.roomId = 'paris';
		second.userData.roomId = 'paris';
		const floor = makeFloor(0, 'paris');
		const scene = new Group();
		scene.add(floor, first, second);
		scene.updateMatrixWorld(true);
		const beforeSpacing = second.position.y - first.position.y;

		const result = groundSelectionRigidly([first, second], [scene]);
		expect(result.grounded).toBe(true);
		expect(getPlacementWorldBounds(first).min.y).toBeCloseTo(0, 4);
		expect(second.position.y - first.position.y).toBeCloseTo(beforeSpacing, 8);
	});
});
