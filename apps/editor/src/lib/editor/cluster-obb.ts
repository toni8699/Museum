import { Box3, Matrix4, Mesh, Object3D, Vector3 } from 'three';

/**
 * Axis-aligned box in *placement-local* space covering every Mesh sub-tree
 * child of `root`. Walks the tree, projects each child's geometry-AABB through
 * `root.matrixWorld.invert() × child.matrixWorld`, and unions the result.
 *
 * mesh → placement-local:
 *   childBox.applyMatrix4((root.matrixWorld.invert()).multiply(child.matrixWorld))
 *
 * The transform must NOT round-trip back to geomAABB (a
 * `childBox.applyMatrix4(rootMW * child.matrix).applyMatrix4(rootMW.invert())`
 * chain is a no-op and drops child transforms). For multi-mesh GLBs this
 * matters — each sub-mesh geometry-AABB has to ride the child's own world
 * matrix, otherwise the merged union inflates.
 */
const TMP_ROOT_INVERSE = /* @__PURE__ */ new Matrix4();
const TMP_CHILD_TO_ROOT = /* @__PURE__ */ new Matrix4();
export function computeRootLocalBox(root: Object3D): Box3 {
	const box = new Box3().makeEmpty();
	// `updateWorldMatrix(true, true)` recomputes the root AND every descendant
	// from their current local transforms. Using `(true, false)` here reads
	// each child's *last-rendered* matrixWorld, which is stale (identity) for a
	// freshly attached GLB subtree — the P3 pre-brief readiness recompute runs
	// in the same flush as the attach, before the render loop has ever updated
	// the new meshes. The stale matrices bake a wrong offset into the
	// placement-local box, so the selection wireframe shows the old (fallback
	// / plan-footprint) box until a later move triggers a recompute.
	root.updateWorldMatrix(true, true);
	TMP_ROOT_INVERSE.copy(root.matrixWorld).invert();
	root.traverse((child) => {
		if (!(child instanceof Mesh)) return;
		const geom = child.geometry as Mesh['geometry'] & {
			boundingBox?: Box3;
			computeBoundingBox?: () => void;
		};
		if (!geom.boundingBox) geom.computeBoundingBox?.();
		const childBox = (geom.boundingBox ?? new Box3()).clone();
		TMP_CHILD_TO_ROOT.multiplyMatrices(TMP_ROOT_INVERSE, child.matrixWorld);
		childBox.applyMatrix4(TMP_CHILD_TO_ROOT);
		box.union(childBox);
	});
	return box;
}

// Box3 corner offsets in (x, y, z) flags matching `obb-util.ts`'s
// VERTEX_OFFSETS — index order used by `localCornersInto` and `OBB_EDGE_INDICES`.
const CORNER_FLAGS: readonly number[] = [
	0b000, 0b001, 0b011, 0b010, 0b100, 0b101, 0b111, 0b110
];

/**
 * Cluster OBB — tight, rotation-aware box around every member root.
 *
 * Steps:
 *   1. Stream each member's 8 placement-local corners through
 *      root.matrixWorld → 8N world points.
 *   2. Run XZ-plane PCA on those points to recover the *forward* axis
 *      (largest-variance direction in XZ). Skew-stable sign convention:
 *      forward.x > 0 if nonzero, otherwise forward.z > 0.
 *   3. Project every corner onto (forward, perpendicular right, Y), take
 *      min/max per axis, build a Box3 in cluster-local space + a basis matrix
 *      that maps (x, y, z) → position + x*forward + y*up + z*right.
 *
 * Critically: when the cluster is rotated as a unit (gizmo applies the same
 * rotation to every member — e.g. the table-sofa cluster rotated 45°), the
 * world corners rotate around the same centroid → the principal axis rotates
 * accordingly → the wire box rotates with the cluster automatically. That's
 * the "outline square at 45°" behaviour the spec asks for.
 */
const TMP_CORNER = /* @__PURE__ */ new Vector3();
const WORLD_UP = /* @__PURE__ */ new Vector3(0, 1, 0);

const _worldCorners: Vector3[] = [];

export type ClusterOBB = {
	/** World-space position of the cluster's frame origin (XZ centroid). */
	position: Vector3;
	/** Forward axis in world space (XZ-plane unit vector, sign-stable). */
	forward: Vector3;
	/** Perpendicular-to-forward in XZ plane (right-hand rule about world-up). */
	right: Vector3;
	/**
	 * Cluster-local Box3. (lx, ly, lr) ∈ [min, max] are world projections in
	 * the cluster's frame — so lx-axis extent is the cluster's "forward
	 * spread", lr-axis the perpendicular spread.
	 */
	localBox: Box3;
	/** Local → world basis: (x, y, z) → position + x*forward + y*up + z*right. */
	frameMatrix: Matrix4;
};

/**
 * Sign-stable 2D PCA on the XZ-plane coordinates of `points`. Picks the
 * eigenvector of the largest eigenvalue and applies the canonical sign
 * convention `forward.x > 0` if possible, else `forward.z > 0`. Avoids the
 * ±π ambiguous-output of `atan2(0, negative)` (JS neg-zero summation).
 */
function xzPrincipalAxis(points: Vector3[]): { axis: Vector3; centroid: Vector3 } {
	let cx = 0;
	let cz = 0;
	for (const p of points) {
		cx += p.x;
		cz += p.z;
	}
	cx /= points.length;
	cz /= points.length;

	let sxx = 0;
	let sxz = 0;
	let szz = 0;
	for (const p of points) {
		const dx = p.x - cx;
		const dz = p.z - cz;
		sxx += dx * dx;
		sxz += dx * dz;
		szz += dz * dz;
	}

	let vx = 0;
	let vz = 0;
	if (Math.abs(sxz) < 1e-12) {
		// Axis-aligned covariance — pick the axis with the larger variance.
		if (sxx >= szz) {
			vx = 1;
			vz = 0;
		} else {
			vx = 0;
			vz = 1;
		}
	} else {
		// Eigenvector of the largest eigenvalue: (M - λ₁ · I) · v = 0.
		//   (sxx - λ₁) · vx + sxz · vz = 0  ⇒  vx = sxz, vz = λ₁ - sxx.
		const trace = sxx + szz;
		const det = sxx * szz - sxz * sxz;
		const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
		const lambda1 = trace / 2 + disc;
		vx = sxz;
		vz = lambda1 - sxx;
		const len = Math.sqrt(vx * vx + vz * vz);
		vx /= len;
		vz /= len;
	}

	// Canonical sign convention — eliminates ±π ambiguities and JS neg-zero.
	if (vx < 0 || (Math.abs(vx) < 1e-12 && vz < 0)) {
		vx = -vx;
		vz = -vz;
	}

	return {
		axis: new Vector3(vx, 0, vz),
		centroid: new Vector3(cx, 0, cz)
	};
}

export function computeClusterOBB(
	roots: readonly Object3D[]
): ClusterOBB | null {
	if (roots.length === 0) return null;

	// 1. Stream world corners.
	_worldCorners.length = 0;
	for (const root of roots) {
		root.updateWorldMatrix(true, false);
		const localBox = computeRootLocalBox(root);
		const min = localBox.min;
		const max = localBox.max;
		for (let i = 0; i < 8; i++) {
			const flags = CORNER_FLAGS[i] ?? 0;
			TMP_CORNER.set(
				(flags & 0b001) !== 0 ? max.x : min.x,
				(flags & 0b010) !== 0 ? max.y : min.y,
				(flags & 0b100) !== 0 ? max.z : min.z
			).applyMatrix4(root.matrixWorld);
			_worldCorners.push(new Vector3(TMP_CORNER.x, TMP_CORNER.y, TMP_CORNER.z));
		}
	}

	if (_worldCorners.length === 0) return null;

	// 2. XZ-plane PCA.
	const { axis, centroid } = xzPrincipalAxis(_worldCorners);

	// 3. Project every corner onto (forward = axis, right = ⟂ axis in XZ, up = Y).
	//    `right = (axis × Y)` keeps the basis right-handed with world-up.
	const right = new Vector3(-axis.z, 0, axis.x);

	let fMin = Infinity;
	let fMax = -Infinity;
	let rMin = Infinity;
	let rMax = -Infinity;
	let yMin = Infinity;
	let yMax = -Infinity;
	for (const c of _worldCorners) {
		const dx = c.x - centroid.x;
		const dz = c.z - centroid.z;
		const f = dx * axis.x + dz * axis.z;
		const r = dx * right.x + dz * right.z;
		if (f < fMin) fMin = f;
		if (f > fMax) fMax = f;
		if (r < rMin) rMin = r;
		if (r > rMax) rMax = r;
		if (c.y < yMin) yMin = c.y;
		if (c.y > yMax) yMax = c.y;
	}

	if (!Number.isFinite(fMin) || !Number.isFinite(yMin)) return null;

	// 4. World position = XZ centroid + mid-Y.
	const position = new Vector3(centroid.x, (yMin + yMax) * 0.5, centroid.z);
	// 5. Basis matrix: (x, y, z) → position + x*forward + y*up + z*right.
	const frameMatrix = new Matrix4()
		.makeBasis(axis, WORLD_UP, right)
		.setPosition(position);

	const localBox = new Box3(
		new Vector3(fMin, yMin, rMin),
		new Vector3(fMax, yMax, rMax)
	);

	return {
		position,
		forward: axis,
		right,
		localBox,
		frameMatrix
	};
}
