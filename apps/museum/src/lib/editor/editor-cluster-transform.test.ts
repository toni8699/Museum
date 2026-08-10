import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Matrix4, Mesh, Vector3 } from 'three';
import {
	applyRigidPivotDelta,
	captureMemberTransformBaselines,
	resetSessionPivot,
	snapPivotRoomLocal
} from './editor-cluster-transform';

function expectMatrixClose(actual: Matrix4, expected: Matrix4) {
	actual.elements.forEach((value, index) => {
		expect(value).toBeCloseTo(expected.elements[index]!, 7);
	});
}

describe('session pivot matrix delta', () => {
	it('applies one rigid delta through a yaw-rotated Paris room parent without drift', () => {
		const scene = new Group();
		const room = new Group();
		room.position.set(11, 0, -6);
		room.rotation.y = Math.PI / 3;
		scene.add(room);

		const first = new Group();
		first.position.set(-1, 0.5, 0);
		first.add(new Mesh(new BoxGeometry(1, 1, 1)));
		const second = new Group();
		second.position.set(2, 0.5, 1);
		second.rotation.y = 0.2;
		second.add(new Mesh(new BoxGeometry(1, 1, 1)));
		room.add(first, second);

		const pivot = new Group();
		scene.add(pivot);
		scene.updateMatrixWorld(true);
		expect(resetSessionPivot(pivot, [first, second])).toBe(true);
		const pivotStart = pivot.matrixWorld.clone();
		const baselines = captureMemberTransformBaselines(['first', 'second'], [first, second]);
		const firstStart = first.matrixWorld.clone();

		pivot.position.add(new Vector3(1.25, 0.4, -0.75));
		pivot.rotation.y = Math.PI / 6;
		pivot.scale.setScalar(1.4);
		pivot.updateMatrixWorld(true);
		const delta = pivot.matrixWorld.clone().multiply(pivotStart.clone().invert());
		const expectedFirstWorld = delta.clone().multiply(firstStart);

		applyRigidPivotDelta(pivotStart, pivot.matrixWorld, baselines);
		expectMatrixClose(first.matrixWorld, expectedFirstWorld);
		const afterFirstPreview = first.matrixWorld.clone();

		applyRigidPivotDelta(pivotStart, pivot.matrixWorld, baselines);
		expectMatrixClose(first.matrixWorld, afterFirstPreview);
		expect(first.scale.x).toBeCloseTo(first.scale.y);
		expect(first.scale.y).toBeCloseTo(first.scale.z);
	});

	it('snaps the world pivot along room-local axes and can leave Y unsnapped', () => {
		const scene = new Group();
		const room = new Group();
		room.rotation.y = Math.PI / 2;
		scene.add(room);
		const pivot = new Group();
		pivot.position.set(0.26, 0.26, -0.14);
		scene.add(pivot);
		scene.updateMatrixWorld(true);

		snapPivotRoomLocal(pivot, room, 0.1, false);
		const local = room.worldToLocal(pivot.getWorldPosition(new Vector3()));
		expect(local.x / 0.1).toBeCloseTo(Math.round(local.x / 0.1));
		expect(local.z / 0.1).toBeCloseTo(Math.round(local.z / 0.1));
		expect(local.y).toBeCloseTo(0.26);
	});
});

describe('applyRigidPivotDelta — Phase 1a scaleMode gate', () => {
	function buildCluster() {
		const scene = new Group();
		const room = new Group();
		scene.add(room);
		const a = new Group();
		a.position.set(-0.5, 0, 0);
		a.add(new Mesh(new BoxGeometry(1, 1, 1)));
		room.add(a);
		const b = new Group();
		b.position.set(0.5, 0, 0);
		b.add(new Mesh(new BoxGeometry(1, 1, 1)));
		room.add(b);
		return { scene, room, members: [{ id: 'a', root: a, startWorldMatrix: a.matrixWorld.clone() }, { id: 'b', root: b, startWorldMatrix: b.matrixWorld.clone() }] };
	}

	it('uniform mode collapses per-axis pivot scale to scalar', () => {
		const { scene, members } = buildCluster();
		scene.updateMatrixWorld(true);
		const pivot = new Group();
		pivot.position.set(0, 0.5, 0);
		scene.add(pivot);
		scene.updateMatrixWorld(true);
		const startPivotWorldMatrix = pivot.matrixWorld.clone();
		pivot.scale.x = 2.5;
		pivot.scale.y = 0.2;
		pivot.scale.z = 4;
		pivot.updateMatrixWorld(true);
		const result = applyRigidPivotDelta(
			startPivotWorldMatrix,
			pivot.matrixWorld,
			members,
			'uniform'
		);
		for (const id of ['a', 'b']) {
			const root = members.find((m) => m.id === id)!.root;
			expect(root.scale.x).toBeCloseTo(root.scale.y, 6);
			expect(root.scale.y).toBeCloseTo(root.scale.z, 6);
			const t = result.get(id)!;
			expect(t.scaleMode).toBe('uniform');
		}
	});

	it('independent mode preserves per-axis decomposition on every cluster member', () => {
		const { scene, members } = buildCluster();
		scene.updateMatrixWorld(true);
		const pivot = new Group();
		pivot.position.set(0, 0.5, 0);
		scene.add(pivot);
		scene.updateMatrixWorld(true);
		const startPivotWorldMatrix = pivot.matrixWorld.clone();
		pivot.scale.x = 2.5;
		pivot.scale.y = 0.2;
		pivot.scale.z = 4;
		pivot.updateMatrixWorld(true);
		const result = applyRigidPivotDelta(
			startPivotWorldMatrix,
			pivot.matrixWorld,
			members,
			'independent'
		);
		for (const id of ['a', 'b']) {
			const root = members.find((m) => m.id === id)!.root;
			expect(root.scale.x).toBeCloseTo(2.5, 4);
			expect(root.scale.y).toBeCloseTo(0.2, 4);
			expect(root.scale.z).toBeCloseTo(4, 4);
			const t = result.get(id)!;
			expect(t.scaleMode).toBe('independent');
			expect(t.scaleVector).toEqual([root.scale.x, root.scale.y, root.scale.z]);
		}
	});
});
