import { Box3, Matrix4, Vector3 } from 'three';

export const OBB_VERTEX_COUNT = 8;
export const OBB_FLOATS_PER_VERTEX = 3;
export const OBB_FLOAT_COUNT = OBB_VERTEX_COUNT * OBB_FLOATS_PER_VERTEX;

export const OBB_EDGE_INDICES: readonly number[] = [
	0, 1, 1, 2, 2, 3, 3, 0,
	4, 5, 5, 6, 6, 7, 7, 4,
	0, 4, 1, 5, 2, 6, 3, 7
];

const VERTEX_OFFSETS: readonly number[] = [
	0b000, 0b001, 0b011, 0b010,
	0b100, 0b101, 0b111, 0b110
];

const VEC = /* @__PURE__ */ new Vector3();
const SIZE = /* @__PURE__ */ new Vector3();

/**
 * Static 12-edge index list and a sane-default Float32Array for the corners
 * (computed against an identity matrix). The per-frame write paths stream
 * new corners into the same buffer via {@link localCornersInto}.
 */
export function box3CornersToLineGeometry(box: Box3): {
	indices: Uint16Array;
	initialFloats: Float32Array;
} {
	const initialFloats = new Float32Array(OBB_FLOAT_COUNT);
	localCornersInto(new Matrix4(), box, initialFloats);
	const indices = Uint16Array.from(OBB_EDGE_INDICES);
	return { indices, initialFloats };
}

/**
 * Streams 8 world-space corners of an *axis-aligned* placement-local Box3
 * into a Float32Array of length OBB_FLOAT_COUNT.
 *
 * The module-side Vector3 + size vector are reused across calls so the helper
 * doesn't allocate per frame.
 */
export function localCornersInto(
	matrixWorld: Matrix4,
	box: Box3,
	out: Float32Array
): void {
	const min = box.min;
	box.getSize(SIZE);
	for (let i = 0; i < OBB_VERTEX_COUNT; i++) {
		const bit = VERTEX_OFFSETS[i];
		VEC.set(
			min.x + (bit & 0b001 ? SIZE.x : 0),
			min.y + (bit & 0b010 ? SIZE.y : 0),
			min.z + (bit & 0b100 ? SIZE.z : 0)
		);
		VEC.applyMatrix4(matrixWorld);
		out[i * 3 + 0] = VEC.x;
		out[i * 3 + 1] = VEC.y;
		out[i * 3 + 2] = VEC.z;
	}
}
