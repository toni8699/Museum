import { describe, expect, it } from 'vitest';
import { Group, Object3D, PerspectiveCamera } from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { applyEditorGizmoSingleEnding } from '$lib/editor/styles/scene-palette';

/**
 * P21.5 §2.4 — the single-ending walker is cosmetic-only: negative-end tip
 * meshes (arrow cones / scale grips) are DETACHED from the visible `gizmo`
 * subtree (hide would be undone per frame — `TransformControlsRoot
 * .updateMatrixWorld()` re-enables every handle with `visible = true`),
 * while every axis keeps its `+` tip and the invisible `picker` mode groups
 * (hit-testing/snap/hover/active) are left byte-identical. Presence, not
 * pixels — geometry/identity assertions only.
 */

type Vec3 = { x: number; y: number; z: number };
type BoundingBox = { min: Vec3; max: Vec3 };
type MeshLike = {
	visible: boolean;
	isMesh?: boolean;
	geometry: {
		boundingBox: BoundingBox | null;
	} | null;
	children?: unknown[];
};

const TIP_RADIUS = 0.3;

function meshCenter(mesh: MeshLike): Vec3 | null {
	const box = mesh.geometry?.boundingBox;
	if (!box) return null;
	return {
		x: (box.min.x + box.max.x) / 2,
		y: (box.min.y + box.max.y) / 2,
		z: (box.min.z + box.max.z) / 2
	};
}

/** +1 / −1 when the mesh is an axis tip on a single dominant axis, else null. */
function tipSign(mesh: MeshLike): 1 | -1 | null {
	const center = meshCenter(mesh);
	if (!center) return null;
	const magnitudes: Array<[keyof Vec3, number]> = [
		['x', Math.abs(center.x)],
		['y', Math.abs(center.y)],
		['z', Math.abs(center.z)]
	];
	magnitudes.sort((a, b) => b[1] - a[1]);
	const [axis, magnitude] = magnitudes[0]!;
	return magnitude >= TIP_RADIUS ? (Math.sign(center[axis]) as 1 | -1) : null;
}

type NodeRecord = MeshLike & { children?: unknown[] };
type Recorded = { node: NodeRecord; parent: NodeRecord | null; picker: boolean };

/** Depth-first record with picker tracking: a node lives under an invisible
 *  (group-hidden) ancestor — the picker's hiding mechanism in current three
 *  (the groups are hidden at the END of the gizmo constructor). A node's OWN
 *  visible flag is not "picker"; only ancestry decides picker membership. */
function collect(root: { children?: unknown[] }): Recorded[] {
	const out: Recorded[] = [];
	const visit = (child: unknown, parent: NodeRecord | null, underHiddenGroup: boolean): void => {
		const node = child as NodeRecord;
		// Tip classification needs each mesh's bounding box; geometries start
		// with `boundingBox = null` until computed (the walker computes it too).
		const geometry = node.geometry as {
			boundingBox: BoundingBox | null;
			computeBoundingBox?: () => void;
		} | null;
		if (node.isMesh && geometry && geometry.boundingBox === null && geometry.computeBoundingBox) {
			geometry.computeBoundingBox();
		}
		out.push({ node, parent, picker: underHiddenGroup });
		for (const grandchild of node.children ?? []) {
			visit(grandchild, node, underHiddenGroup || node.visible === false);
		}
	};
	for (const child of root.children ?? []) visit(child, null, false);
	return out;
}

function buildControls() {
	const camera = new PerspectiveCamera();
	const domStub = {
		style: {},
		ownerDocument: { addEventListener() {}, removeEventListener() {} },
		addEventListener() {},
		removeEventListener() {}
	};
	const controls = new TransformControls(camera, domStub as never);
	const root = controls.getHelper() as unknown as {
		children?: unknown[];
		updateMatrixWorld(force: boolean): void;
	};
	// TransformControlsRoot.updateMatrixWorld() decomposes
	// object.parent.matrixWorld, so the attached object must sit in a scene
	// graph (mirrors real usage where the controls attach to scene objects).
	const parent = new Group();
	const object = new Object3D();
	parent.add(object);
	controls.attach(object);
	return { controls, root };
}

describe('applyEditorGizmoSingleEnding (P21.5 §2.4)', () => {
	it('detaches the six negative-end tips for good (per-frame updates + mode cycles) and leaves the picker subtree byte-identical', () => {
		const { controls, root } = buildControls();
		const before = collect(root);
		const meshesBefore = before.filter((record) => record.node.isMesh);
		const pickerBefore = meshesBefore.filter((record) => record.picker).map((record) => record.node);
		const pickerGroupsBefore = before.filter(
			(record) => record.picker && !record.node.isMesh && Array.isArray(record.node.children)
		);
		const negativeTipsBefore = meshesBefore
			.filter((record) => !record.picker && tipSign(record.node) === -1)
			.map((record) => record.node);
		const positiveTipsBefore = meshesBefore
			.filter((record) => !record.picker && tipSign(record.node) === 1)
			.map((record) => record.node);
		// Sanity: the picker must contain meshes to protect, and the tip
		// geometry must exist before the walker runs.
		expect(pickerBefore.length, 'the picker must contain meshes to protect').toBeGreaterThan(0);
		expect(negativeTipsBefore).toHaveLength(6);
		expect(positiveTipsBefore).toHaveLength(6);
		for (const mesh of pickerBefore) expect(mesh.visible).toBe(true);

		applyEditorGizmoSingleEnding(root);

		// Per-frame updates — the exact loop that killed the one-shot hide:
		// `handle.visible = true` for every handle three still owns.
		for (let frame = 0; frame < 3; frame++) root.updateMatrixWorld(true);
		// Mode cycles: each group's handles get re-enabled when its mode is
		// active again (translate → scale → rotate → translate).
		for (const mode of ['translate', 'scale', 'rotate', 'translate'] as const) {
			controls.setMode(mode);
			root.updateMatrixWorld(true);
		}

		const after = collect(root);
		const meshesAfter = after.filter((record) => record.node.isMesh).map((record) => record.node);
		// Exactly the six tips are gone; nothing else was touched.
		expect(meshesAfter.length).toBe(meshesBefore.length - 6);

		const remaining = new Set(meshesAfter);
		// Picker subtree byte-identical: every picker mesh and group survives.
		for (const mesh of pickerBefore) {
			expect(remaining.has(mesh), 'a picker mesh was removed').toBe(true);
		}
		for (const group of pickerGroupsBefore) {
			expect(remaining.has(group.node as unknown as MeshLike), 'a picker group was removed').toBe(true);
			expect(group.node.children?.length).toBeGreaterThan(0);
		}
		// Negative-end tips are detached for good…
		for (const mesh of negativeTipsBefore) {
			expect(remaining.has(mesh), 'a negative-end tip survived').toBe(false);
		}
		// …and every + tip is still present and visible after frames + cycles.
		for (const mesh of positiveTipsBefore) {
			expect(remaining.has(mesh), 'a positive-end tip was removed').toBe(true);
			expect(mesh.visible, 'a positive-end tip must stay visible').toBe(true);
		}
		// No remaining non-picker mesh is a negative tip (picker meshes
		// legitimately sit at ±0.5 positions — they were never touched).
		const pickerSet = new Set(pickerBefore);
		for (const mesh of meshesAfter) {
			if (!pickerSet.has(mesh)) expect(tipSign(mesh)).not.toBe(-1);
		}
		controls.dispose();
	});
});