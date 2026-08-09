import { describe, expect, it } from 'vitest';
import { Box3, Matrix4, Vector3 } from 'three';
import {
	OBB_EDGE_INDICES,
	OBB_FLOAT_COUNT,
	OBB_VERTEX_COUNT,
	box3CornersToLineGeometry,
	localCornersInto
} from './obb-util';

const IDENTITY = new Matrix4();

describe('box3CornersToLineGeometry', () => {
	it('produces 24-float corner buffer and a 24-index edge list', () => {
		const box = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
		const { indices, initialFloats } = box3CornersToLineGeometry(box);
		expect(initialFloats.length).toBe(OBB_FLOAT_COUNT);
		expect(OBB_FLOAT_COUNT).toBe(24);
		expect(indices.length).toBe(24);
		expect(OBB_EDGE_INDICES.length).toBe(24);
	});

	it('index list maps every vertex into [0, OBB_VERTEX_COUNT)', () => {
		const box = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
		const { indices } = box3CornersToLineGeometry(box);
		for (let i = 0; i < indices.length; i++) {
			expect(indices[i]).toBeGreaterThanOrEqual(0);
			expect(indices[i]).toBeLessThan(OBB_VERTEX_COUNT);
		}
	});

	it('edge indices form 12 distinct edges (each pair once)', () => {
		const box = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
		const { indices } = box3CornersToLineGeometry(box);
		expect(OBB_EDGE_INDICES).toEqual([
			0, 1, 1, 2, 2, 3, 3, 0,
			4, 5, 5, 6, 6, 7, 7, 4,
			0, 4, 1, 5, 2, 6, 3, 7
		]);
		expect(indices.length / 2).toBe(12);
	});
});

describe('localCornersInto', () => {
	it('writes 8 corners under identity transform — covers all 8 sign combinations', () => {
		const box = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
		const out = new Float32Array(OBB_FLOAT_COUNT);
		localCornersInto(IDENTITY, box, out);

		const seen = new Set<string>();
		for (let i = 0; i < OBB_VERTEX_COUNT; i++) {
			const x = out[i * 3 + 0];
			const y = out[i * 3 + 1];
			const z = out[i * 3 + 2];
			expect([Math.abs(x), Math.abs(y), Math.abs(z)]).toEqual([1, 1, 1]);
			seen.add(`${x},${y},${z}`);
		}
		expect(seen.size).toBe(8);
	});

	it('translates corners under a translation matrix', () => {
		const box = new Box3(new Vector3(0, 0, 0), new Vector3(1, 1, 1));
		const m = new Matrix4().makeTranslation(10, -5, 3);
		const out = new Float32Array(OBB_FLOAT_COUNT);
		localCornersInto(m, box, out);

		const expected = [
			10, -5, 3, 11, -5, 3, 11, -4, 3, 10, -4, 3,
			10, -5, 4, 11, -5, 4, 11, -4, 4, 10, -4, 4
		];
		const actual: number[] = [];
		for (let i = 0; i < out.length; i++) actual.push(out[i]);
		expect(actual).toEqual(expected);
	});

	it('rotates corners non-trivially under a 90° Z rotation', () => {
		const box = new Box3(new Vector3(-1, -1, 0), new Vector3(0, 1, 0));
		const m = new Matrix4().makeRotationZ(Math.PI / 2);
		const out = new Float32Array(OBB_FLOAT_COUNT);
		localCornersInto(m, box, out);

		// Box3(-1,-1,0) → (0,1,0); 90° Z rotation: (x,y) → (-y, x); z unchanged
		// Bottom face (-1,-1), (0,-1), (0,1), (-1,1)
		//        →     ( 1,-1), ( 1, 0), (-1, 0), (-1,-1)
		// Top face same z=0 in this zero-thickness box.
		const expectedXY = [
			[1, -1], [1, 0], [-1, 0], [-1, -1],
			[1, -1], [1, 0], [-1, 0], [-1, -1]
		];
		for (let i = 0; i < OBB_VERTEX_COUNT; i++) {
			expect(out[i * 3 + 0]).toBeCloseTo(expectedXY[i][0], 6);
			expect(out[i * 3 + 1]).toBeCloseTo(expectedXY[i][1], 6);
			expect(out[i * 3 + 2]).toBeCloseTo(0, 6);
		}
	});

	it('scales corners uniformly', () => {
		const box = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
		const m = new Matrix4().makeScale(2, 2, 2);
		const out = new Float32Array(OBB_FLOAT_COUNT);
		localCornersInto(m, box, out);

		for (let i = 0; i < OBB_VERTEX_COUNT; i++) {
			expect(Math.abs(out[i * 3 + 0])).toBeCloseTo(2, 6);
			expect(Math.abs(out[i * 3 + 1])).toBeCloseTo(2, 6);
			expect(Math.abs(out[i * 3 + 2])).toBeCloseTo(2, 6);
		}
	});

	it('is idempotent under repeated calls with stable module-side Vector3', () => {
		const box = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
		const outA = new Float32Array(OBB_FLOAT_COUNT);
		const outB = new Float32Array(OBB_FLOAT_COUNT);
		localCornersInto(IDENTITY, box, outA);
		localCornersInto(IDENTITY, box, outB);
		expect(Float32Array.from(outA)).toEqual(Float32Array.from(outB));
	});

	it('overwrites prior buffer contents (no carry-over)', () => {
		const box = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
		const out = new Float32Array(OBB_FLOAT_COUNT);
		// poison
		for (let i = 0; i < out.length; i++) out[i] = 99;
		localCornersInto(IDENTITY, box, out);
		for (let i = 0; i < OBB_VERTEX_COUNT * 3; i++) {
			expect(out[i]).not.toBe(99);
		}
	});
});
