import { describe, expect, it } from 'vitest';
import { Box3, BoxGeometry, Matrix4, Mesh, Object3D, Quaternion, Vector3 } from 'three';

type RootLocalBoxFn = (root: Object3D) => Box3;

/**
 * Mirror of `computeRootLocalBox` after the Phase 6.2 Bug 2 fix. Mesh
 * geometry-AABBs are projected into placement-local via
 * `root.matrixWorld.invert() × child.matrixWorld` so child transforms are
 * preserved.
 */
const computeRootLocalBox: RootLocalBoxFn = (root: Object3D) => {
	const box = new Box3().makeEmpty();
	root.updateWorldMatrix(true, false);
	const rootInverse = root.matrixWorld.clone().invert();
	const childToRoot = new Matrix4();
	root.traverse((child) => {
		if (!(child instanceof Mesh)) return;
		if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
		const childBox = (child.geometry.boundingBox ?? new Box3()).clone();
		childToRoot.multiplyMatrices(rootInverse, child.matrixWorld);
		childBox.applyMatrix4(childToRoot);
		box.union(childBox);
	});
	return box;
};

function makeMeshBox(
	halfSize: number,
	childPosition = new Vector3(0, 0, 0),
	childRotation = new Quaternion()
): Mesh {
	const mesh = new Mesh(new BoxGeometry(halfSize * 2, halfSize * 2, halfSize * 2));
	mesh.position.copy(childPosition);
	mesh.quaternion.copy(childRotation);
	mesh.updateMatrixWorld(true);
	return mesh;
}

describe('computeRootLocalBox — places geometry-AABBs into placement-local (Bug 2)', () => {
	it('identity parent + identity child → box equals geometry-AABB', () => {
		const root = new Object3D();
		root.add(makeMeshBox(0.5));
		root.updateMatrixWorld(true);

		const box = computeRootLocalBox(root);
		expect(box.min).toEqual(new Vector3(-0.5, -0.5, -0.5));
		expect(box.max).toEqual(new Vector3(0.5, 0.5, 0.5));
	});

	it('parent translated → box stays (= root-local frame)', () => {
		const root = new Object3D();
		root.position.set(2, 0, 0);
		root.add(makeMeshBox(0.5));
		root.updateMatrixWorld(true);

		const box = computeRootLocalBox(root);
		expect(box.min).toEqual(new Vector3(-0.5, -0.5, -0.5));
		expect(box.max).toEqual(new Vector3(0.5, 0.5, 0.5));
	});

	it('child translated → box carries child offset (NOT zeroed out)', () => {
		const root = new Object3D();
		root.add(makeMeshBox(0.5, new Vector3(1, 0, 0)));
		root.updateMatrixWorld(true);

		const box = computeRootLocalBox(root);
		// Bug 2 regression: the pre-fix chain collapsed back to geomAABB at
		// origin. Post-fix box must include the +1m offset on X.
		expect(box.min.x).toBeCloseTo(0.5, 6);
		expect(box.max.x).toBeCloseTo(1.5, 6);
	});

	it('two children at different offsets → union of their root-local boxes', () => {
		const root = new Object3D();
		root.add(makeMeshBox(0.5, new Vector3(-2, 0, 0)));
		root.add(makeMeshBox(0.5, new Vector3(2, 0, 0)));
		root.updateMatrixWorld(true);

		const box = computeRootLocalBox(root);
		expect(box.min.x).toBeCloseTo(-2.5, 6);
		expect(box.max.x).toBeCloseTo(2.5, 6);
	});

	it('parent rotated 90° around Y — child at (1, 0, 0) sits at root-local box (0.5…1.5, ±0.5, ±0.5)', () => {
		const root = new Object3D();
		const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
		root.quaternion.copy(q);
		root.add(makeMeshBox(0.5, new Vector3(1, 0, 0)));
		root.updateMatrixWorld(true);

		const box = computeRootLocalBox(root);
		// child.position is in root-local; root-local frame may itself be rotated,
		// but the mesh inside root has no own rotation so /its/ local AABB just
		// shifts by (1, 0, 0) before being captured by `childToRoot`.
		expect(box.min).toEqual(new Vector3(0.5, -0.5, -0.5));
		expect(box.max).toEqual(new Vector3(1.5, 0.5, 0.5));
	});

	it('GLB-style: nested Group inside root — sub-mesh box projects through all parents', () => {
		const root = new Object3D();
		const group = new Object3D();
		group.position.set(0, 1, 0);
		group.add(makeMeshBox(0.5, new Vector3(0.5, 0, 0)));
		root.add(group);
		root.updateMatrixWorld(true);

		const box = computeRootLocalBox(root);
		expect(box.min.y).toBeCloseTo(0.5, 6);
		expect(box.max.y).toBeCloseTo(1.5, 6);
		expect(box.min.x).toBeCloseTo(0.0, 6);
		expect(box.max.x).toBeCloseTo(1.0, 6);
	});
});
