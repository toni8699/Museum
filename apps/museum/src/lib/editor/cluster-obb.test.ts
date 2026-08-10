import { describe, expect, it } from 'vitest';
import { BoxGeometry, Mesh, Object3D, Vector3 } from 'three';
import { computeClusterOBB, computeRootLocalBox } from './cluster-obb';

/**
 * Cluster OBB math: a tight wire box around every member root, rotated to
 * match the cluster's principal spread axis in the XZ plane and rendered each
 * frame so it rotates with the cluster as a rigid unit.
 *
 * Convention:
 *   - `forward` = unit XZ-plane vector pointing along the largest-variance
 *     direction of the unioned corners, sign-stable (`forward.x ≥ 0` if
 *     possible, else `forward.z ≥ 0`).
 *   - `right` = `(-forward.z, 0, forward.x)` — perpendicular in XZ with the
 *     right-hand rule about world-up.
 *   - `position` = XZ centroid of all corners, mid-Y.
 *   - `localBox` stores CENTROID-RELATIVE projections on the (forward, Y,
 *     right) basis — so `localBox.min.x = -halfForward` and
 *     `localBox.max.x = +halfForward`. The frame matrix maps
 *     `(lx, ly, lr)` → `position + lx*forward + ly*up + lr*right`.
 */

function makeBoxRoot(half: number, position: Vector3, rotationY = 0) {
	const mesh = new Mesh(new BoxGeometry(half * 2, half * 2, half * 2));
	mesh.position.copy(position);
	const root = new Object3D();
	root.add(mesh);
	root.rotation.y = rotationY;
	root.updateMatrixWorld(true);
	return root;
}

function rotateAroundOrigin(root: Object3D, meshLocal: Vector3, angle: number) {
	// Mesh's world position = RotY(angle) × meshLocal when root.position = origin.
	root.position.set(0, 0, 0);
	root.rotation.y = angle;
	const mesh = root.children[0] as Mesh;
	mesh.position.copy(meshLocal);
	root.updateMatrixWorld(true);
}

describe('computeClusterOBB — single root axis-aligned', () => {
	it('cube at (1,0,0) → forward = +X, centroid-relative span ±0.5', () => {
		const root = makeBoxRoot(0.5, new Vector3(1, 0, 0));
		const obb = computeClusterOBB([root]);
		expect(obb).not.toBeNull();
		// σzz = σxz = 0 → angle = 0 → forward = +X.
		expect(obb!.forward.x).toBeCloseTo(1, 6);
		expect(obb!.forward.z).toBeCloseTo(0, 6);
		// Centroid-relative ±halfSize.
		expect(obb!.localBox.min.x).toBeCloseTo(-0.5, 6);
		expect(obb!.localBox.max.x).toBeCloseTo(0.5, 6);
		expect(obb!.localBox.min.y).toBeCloseTo(-0.5, 6);
		expect(obb!.localBox.max.y).toBeCloseTo(0.5, 6);
		// Position = XZ centroid of corners.
		expect(obb!.position.x).toBeCloseTo(1, 6);
		expect(obb!.position.z).toBeCloseTo(0, 6);
	});
});

describe('computeClusterOBB — multi-root alignment', () => {
	it('two roots along +X → forward = +X, half-span = 1.5', () => {
		const a = makeBoxRoot(0.5, new Vector3(-1, 0, 0));
		const b = makeBoxRoot(0.5, new Vector3(1, 0, 0));
		const obb = computeClusterOBB([a, b]);
		expect(obb).not.toBeNull();
		expect(obb!.forward.x).toBeCloseTo(1, 6);
		expect(obb!.forward.z).toBeCloseTo(0, 6);
		expect(obb!.localBox.min.x).toBeCloseTo(-1.5, 6);
		expect(obb!.localBox.max.x).toBeCloseTo(1.5, 6);
		expect(obb!.position.x).toBeCloseTo(0, 6);
	});

	it('two roots on +Z axis → forward = +Z, half-span = 1.5', () => {
		const a = makeBoxRoot(0.5, new Vector3(0, 0, -1));
		const b = makeBoxRoot(0.5, new Vector3(0, 0, 1));
		const obb = computeClusterOBB([a, b]);
		expect(obb).not.toBeNull();
		// σzz > σxx → canonical forward = +Z.
		expect(obb!.forward.x).toBeCloseTo(0, 6);
		expect(obb!.forward.z).toBeCloseTo(1, 6);
		expect(obb!.localBox.min.x).toBeCloseTo(-1.5, 6);
		expect(obb!.localBox.max.x).toBeCloseTo(1.5, 6);
	});

	it('two roots at 45° diagonal → forward = (cos45, 0, sin45)', () => {
		const a = makeBoxRoot(0.5, new Vector3(0, 0, 0));
		const b = makeBoxRoot(0.5, new Vector3(1.5, 0, 1.5));
		const obb = computeClusterOBB([a, b]);
		expect(obb).not.toBeNull();
		const sqrtHalf = Math.SQRT1_2;
		expect(obb!.forward.x).toBeCloseTo(sqrtHalf, 6);
		expect(obb!.forward.z).toBeCloseTo(sqrtHalf, 6);
		// Half-span along forward = 1.25·√2 (cube centers diagonally ±0.75·√2,
		// plus ±0.5·√2/2 corner projection on each end).
		expect(obb!.localBox.max.x - obb!.localBox.min.x).toBeCloseTo(2.5 * Math.SQRT2, 5);
		// Right axis = (-sin45, 0, cos45); perpendicular half-span = √2/2.
		expect(obb!.localBox.max.z - obb!.localBox.min.z).toBeCloseTo(Math.SQRT2, 5);
	});
});

describe('computeClusterOBB — rotation tracks cluster transform', () => {
	it('rotating both members 90° rigidly rotates +X spread to +Z spread', () => {
		const a = makeBoxRoot(0.5, new Vector3(1, 0, 0));
		const b = makeBoxRoot(0.5, new Vector3(-1, 0, 0));
		const pre = computeClusterOBB([a, b]);
		expect(pre!.forward.x).toBeCloseTo(1, 6);
		expect(pre!.forward.z).toBeCloseTo(0, 6);
		// Rotate the WHOLE cluster 90° around the origin. Each root's mesh
		// local position stays (±1, 0, 0); the wrapper carries the rotation.
		// Mesh world centers move to (0, 0, ∓1).
		rotateAroundOrigin(a, new Vector3(1, 0, 0), Math.PI / 2);
		rotateAroundOrigin(b, new Vector3(-1, 0, 0), Math.PI / 2);
		const post = computeClusterOBB([a, b]);
		expect(post!.forward.x).toBeCloseTo(0, 6);
		expect(post!.forward.z).toBeCloseTo(1, 6);
		expect(post!.localBox.min.x).toBeCloseTo(-1.5, 6);
		expect(post!.localBox.max.x).toBeCloseTo(1.5, 6);
	});

	it('rotating both members 45° rotates forward by 45° in XZ', () => {
		const a = makeBoxRoot(0.5, new Vector3(1, 0, 0));
		const b = makeBoxRoot(0.5, new Vector3(-1, 0, 0));
		const pre = computeClusterOBB([a, b]);
		expect(pre!.forward.x).toBeCloseTo(1, 6);
		expect(pre!.forward.z).toBeCloseTo(0, 6);
		// Mesh world centers after π/4 about origin: RotY(π/4) · (±1, 0, 0)
		// = (±cos45, 0, ∓sin45). Spread line is along (±cos45, 0, ∓sin45).
		// The eigenvector of largest variance is direction-ambiguous; the
		// canonical sign convention picks (+cos45, 0, -sin45) — either sign
		// is the same wire cube visually.
		rotateAroundOrigin(a, new Vector3(1, 0, 0), Math.PI / 4);
		rotateAroundOrigin(b, new Vector3(-1, 0, 0), Math.PI / 4);
		const post = computeClusterOBB([a, b]);
		const sqrtHalf = Math.SQRT1_2;
		expect(Math.abs(post!.forward.x)).toBeCloseTo(sqrtHalf, 6);
		expect(Math.abs(post!.forward.z)).toBeCloseTo(sqrtHalf, 6);
	});
});

describe('computeClusterOBB — vertical extents', () => {
	it('one tall + one flat root → box Y spans both, XZ tight', () => {
		const tall = makeBoxRoot(0.5, new Vector3(-1, 0, 0));
		const flat = makeBoxRoot(0.5, new Vector3(1, 0.75, 0));
		const obb = computeClusterOBB([tall, flat]);
		expect(obb).not.toBeNull();
		expect(obb!.localBox.min.y).toBeCloseTo(-0.5, 6);
		expect(obb!.localBox.max.y).toBeCloseTo(1.25, 6);
		expect(obb!.localBox.min.x).toBeCloseTo(-1.5, 6);
		expect(obb!.localBox.max.x).toBeCloseTo(1.5, 6);
	});
});

describe('computeClusterOBB — edge cases', () => {
	it('empty roots → null', () => {
		expect(computeClusterOBB([])).toBeNull();
	});

	it('collapsed covariance → forward = +X (canonical tie-break)', () => {
		// Two roots at the exact same position → covariance matrix is zero.
		const a = makeBoxRoot(0.1, new Vector3(2, 0, 3));
		const b = makeBoxRoot(0.1, new Vector3(2, 0, 3));
		const obb = computeClusterOBB([a, b]);
		expect(obb).not.toBeNull();
		expect(obb!.forward.x).toBeCloseTo(1, 6);
		expect(obb!.forward.z).toBeCloseTo(0, 6);
		expect(obb!.position.x).toBeCloseTo(2, 6);
		expect(obb!.position.z).toBeCloseTo(3, 6);
	});

	it('sign stability — atan2(0, negative) flip → forward = +Z (canonical)', () => {
		// Construct a covariance where the only difference between +Z and −Z
		// is a JS neg-zero summation. The canonical tie-breaker pins it to +Z.
		const a = makeBoxRoot(0.5, new Vector3(0, 0, -1));
		const b = makeBoxRoot(0.5, new Vector3(0, 0, 1));
		const obb = computeClusterOBB([a, b]);
		expect(obb!.forward.z).toBeCloseTo(1, 6);
	});
});

describe('computeRootLocalBox — exported for shared use', () => {
	it('single root at origin → localBox = (±halfSize)³', () => {
		const root = makeBoxRoot(0.5, new Vector3(0, 0, 0));
		const box = computeRootLocalBox(root);
		expect(box.min.x).toBeCloseTo(-0.5, 6);
		expect(box.min.y).toBeCloseTo(-0.5, 6);
		expect(box.min.z).toBeCloseTo(-0.5, 6);
		expect(box.max.x).toBeCloseTo(0.5, 6);
		expect(box.max.y).toBeCloseTo(0.5, 6);
		expect(box.max.z).toBeCloseTo(0.5, 6);
	});
});
