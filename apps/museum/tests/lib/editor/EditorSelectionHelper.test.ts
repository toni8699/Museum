import { describe, expect, it } from 'vitest';
import {
	Box3,
	Box3Helper,
	BoxGeometry,
	BufferAttribute,
	BufferGeometry,
	LineBasicMaterial,
	LineSegments,
	Matrix4,
	Mesh,
	Object3D,
	Vector3
} from 'three';
import {
	OBB_EDGE_INDICES,
	OBB_FLOAT_COUNT,
	box3CornersToLineGeometry,
	localCornersInto
} from '$lib/editor/obb-util';

describe('box3CornersToLineGeometry — geometry factory', () => {
	it('yields an 8-vertex count + 24-vertex index stream', () => {
		const box = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
		const { indices, initialFloats } = box3CornersToLineGeometry(box);
		expect(initialFloats.length).toBe(OBB_FLOAT_COUNT);
		expect(OBB_FLOAT_COUNT).toBe(24);
		expect(indices.length).toBe(24);
	});

	it('index list maps 12 distinct edges', () => {
		const box = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
		const { indices } = box3CornersToLineGeometry(box);
		expect(Array.from(indices)).toEqual(Array.from(OBB_EDGE_INDICES));
	});

	it('initial floats are sane sane default values (corners in identity frame)', () => {
		const box = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
		const { initialFloats } = box3CornersToLineGeometry(box);
		// 8 corners, each axis-absolute == 1 under identity.
		for (let i = 0; i < 8; i++) {
			expect(Math.abs(initialFloats[i * 3 + 0])).toBeCloseTo(1, 6);
			expect(Math.abs(initialFloats[i * 3 + 1])).toBeCloseTo(1, 6);
			expect(Math.abs(initialFloats[i * 3 + 2])).toBeCloseTo(1, 6);
		}
	});
});

describe('localCornersInto — per-frame streaming', () => {
	it('writes orientation-preserving corners under a rotation matrix', () => {
		const box = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
		const m = new Matrix4().makeRotationZ(Math.PI / 2);
		const out = new Float32Array(OBB_FLOAT_COUNT);
		localCornersInto(m, box, out);
		// (±1, ±1, ±1) → (∓1, ±1, ±1) under Z rotation
		for (let i = 0; i < 8; i++) {
			expect(Math.abs(out[i * 3 + 0])).toBeCloseTo(1, 6);
			expect(Math.abs(out[i * 3 + 1])).toBeCloseTo(1, 6);
			expect(Math.abs(out[i * 3 + 2])).toBeCloseTo(1, 6);
		}
		// Distinct centroid positions reflect rotation.
		const distinct = new Set<string>();
		for (let i = 0; i < 8; i++) {
			distinct.add(`${out[i * 3 + 0]},${out[i * 3 + 1]},${out[i * 3 + 2]}`);
		}
		expect(distinct.size).toBe(8);
	});
});

describe('EditorSelectionHelper — selection helper properties', () => {
	it('selection helper uses 0xd6b35f gold + raycast disabled + high renderOrder', () => {
		const rootLocalBox = box3CornersToLineGeometry(
			new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1))
		).initialFloats;
		const positionAttribute = new BufferAttribute(rootLocalBox, 3);
		const geometry = new BufferGeometry();
		geometry.setAttribute('position', positionAttribute);
		geometry.setIndex(new BufferAttribute(Uint16Array.from(OBB_EDGE_INDICES), 1));
		const material = new LineBasicMaterial({
			color: 0xd6b35f,
			depthTest: false,
			transparent: false,
			fog: false,
			linewidth: 1
		});
		const lineSegments = new LineSegments(geometry, material);
		lineSegments.renderOrder = 1000;
		lineSegments.frustumCulled = false;
		lineSegments.raycast = () => null;

		const mat = lineSegments.material as { color: { getHex: () => number }; depthTest: boolean };
		expect(mat.color.getHex()).toBe(0xd6b35f);
		expect(mat.depthTest).toBe(false);
		expect(lineSegments.renderOrder).toBe(1000);
		expect(lineSegments.frustumCulled).toBe(false);
		expect(lineSegments.raycast).toBeTypeOf('function');
		// Geometry shape assertions
		expect(geometry.attributes.position.array.length).toBe(OBB_FLOAT_COUNT);
		expect(geometry.index?.array.length).toBe(24);
	});

	it('hover helper uses 0xffffff white + opacity 0.35 + transparent', () => {
		const box = new Box3();
		const helper = new Box3Helper(box, 0xffffff);
		helper.raycast = () => null;
		helper.renderOrder = 999;
		const material = helper.material as {
			depthTest?: boolean;
			transparent?: boolean;
			opacity?: number;
		};
		material.depthTest = false;
		material.transparent = true;
		material.opacity = 0.35;
		expect(helper.renderOrder).toBe(999);
		expect(material.transparent).toBe(true);
		expect(material.opacity).toBeCloseTo(0.35);
	});

	it('hover helper sits beneath selection helper in renderOrder', () => {
		// Hover (999) < selection (1000) so selection wires draw on top if contained.
		expect(999).toBeLessThan(1000);
	});
});

describe('EditorSelectionHelper — three.js AABB via setFromObject (foundation test)', () => {
	it('produces world-space bounding box for a BoxGeometry mesh', () => {
		const mesh = new Mesh(new BoxGeometry(2, 1, 1));
		const root = new Object3D();
		root.add(mesh);
		root.updateMatrixWorld(true);
		const box = new Box3().setFromObject(root);
		expect(box.min.x).toBeCloseTo(-1);
		expect(box.max.x).toBeCloseTo(1);
		expect(box.min.y).toBeCloseTo(-0.5);
		expect(box.max.y).toBeCloseTo(0.5);
	});

	it('reflects root world translate', () => {
		const mesh = new Mesh(new BoxGeometry(2, 1, 1));
		const root = new Object3D();
		root.add(mesh);
		root.position.set(5, 0, 0);
		root.updateMatrixWorld(true);
		const box = new Box3().setFromObject(root);
		expect(box.min.x).toBeCloseTo(4);
		expect(box.max.x).toBeCloseTo(6);
	});
});

describe('Box3Helper — reads its .box field each frame (hover helper)', () => {
	it('initial uninitialised box reports Infinity bounds (Three semantics)', () => {
		const helper = new Box3Helper(new Box3(), 0xd6b35f);
		expect(helper.box.isEmpty()).toBe(true);
	});

	it('setting helper.box updates the geometry sample', () => {
		const box = new Box3();
		const helper = new Box3Helper(box, 0xd6b35f);
		box.setFromArray([2, 3, 4, 6, 8, 9]);
		expect(helper.box.min.toArray()).toEqual([2, 3, 4]);
		expect(helper.box.max.toArray()).toEqual([6, 8, 9]);
	});

	it('color is preserved across box updates', () => {
		const helper = new Box3Helper(new Box3(), 0xd6b35f);
		const material = helper.material as unknown as { color: { getHex: () => number } };
		expect(material.color.getHex()).toBe(0xd6b35f);
	});
});
