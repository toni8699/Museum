import type { Vec3 } from '$lib/types/scene';
import type { LayoutObject, LayoutVec2 } from './layout-types';
import type { CompiledLayoutObject } from './layout-geometry-types';
import { geometryId } from './layout-geometry-types';

export type LayoutObjectAabb = {
	min: Vec3;
	max: Vec3;
};

export type LayoutObjectDescriptor = CompiledLayoutObject;

/** Derive a render-neutral compiled descriptor for an authored layout object. */
export function describeLayoutObject(object: LayoutObject): LayoutObjectDescriptor {
	const samples = transformedObjectSamples(object);
	const min: Vec3 = [Infinity, Infinity, Infinity];
	const max: Vec3 = [-Infinity, -Infinity, -Infinity];
	for (const [x, y, z] of samples) {
		min[0] = Math.min(min[0], x);
		min[1] = Math.min(min[1], y);
		min[2] = Math.min(min[2], z);
		max[0] = Math.max(max[0], x);
		max[1] = Math.max(max[1], y);
		max[2] = Math.max(max[2], z);
	}
	const planFootprint = convexHull(samples.map(([x, , z]) => [x, z] as LayoutVec2));
	return {
		id: geometryId(['object', object.id]),
		cacheKey: JSON.stringify([
			'object',
			object.id,
			object.kind,
			object.position,
			object.rotation,
			object.dimensions,
			object.roomId
		]),
		objectId: object.id,
		kind: object.kind,
		position: [...object.position],
		rotation: [...object.rotation],
		dimensions: [...object.dimensions],
		...(object.roomId ? { roomId: object.roomId } : {}),
		readonly: object.kind === 'profile',
		worldAabb: { min, max },
		planFootprint
	};
}

export function findHitLayoutObject(
	descriptors: readonly LayoutObjectDescriptor[],
	point: LayoutVec2
): LayoutObjectDescriptor | null {
	for (const descriptor of [...descriptors].reverse()) {
		if (pointInPolygon(point, descriptor.planFootprint)) return descriptor;
	}
	return null;
}

export function transformedObjectSamples(object: LayoutObject): Vec3[] {
	if (object.kind === 'sphere') return transformedSphereSamples(object);
	if (object.kind === 'cylinder') return transformedCylinderSamples(object);
	return transformedObjectCorners(object);
}

export function transformObjectPoint(point: Vec3, object: LayoutObject): Vec3 {
	const rotated = rotateXyz(point, object.rotation);
	return [
		rotated[0] + object.position[0],
		rotated[1] + object.position[1],
		rotated[2] + object.position[2]
	];
}

export function pointInPolygon(point: LayoutVec2, polygon: readonly LayoutVec2[]): boolean {
	let inside = false;
	for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
		const currentPoint = polygon[index]!;
		const previousPoint = polygon[previous]!;
		if (
			currentPoint[1] > point[1] !== previousPoint[1] > point[1] &&
			point[0] <
				((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1])) /
					(previousPoint[1] - currentPoint[1]) +
					currentPoint[0]
		) {
			inside = !inside;
		}
	}
	return inside;
}

export function convexHull(points: readonly LayoutVec2[]): LayoutVec2[] {
	const unique = [...new Map(points.map((point) => [`${point[0]}:${point[1]}`, point])).values()].sort(
		(a, b) => a[0] - b[0] || a[1] - b[1]
	);
	if (unique.length <= 2) return unique.map((point) => [...point]);
	const cross = (origin: LayoutVec2, a: LayoutVec2, b: LayoutVec2) =>
		(a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);
	const lower: LayoutVec2[] = [];
	for (const point of unique) {
		while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) lower.pop();
		lower.push(point);
	}
	const upper: LayoutVec2[] = [];
	for (const point of [...unique].reverse()) {
		while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) upper.pop();
		upper.push(point);
	}
	return [...lower.slice(0, -1), ...upper.slice(0, -1)].map((point) => [...point]);
}

function transformedObjectCorners(object: LayoutObject): Vec3[] {
	const [halfX, halfY, halfZ] = object.dimensions.map((value) => value / 2) as Vec3;
	const corners: Vec3[] = [];
	for (const x of [-halfX, halfX]) {
		for (const y of [-halfY, halfY]) {
			for (const z of [-halfZ, halfZ]) {
				corners.push(transformObjectPoint([x, y, z], object));
			}
		}
	}
	return corners;
}

function transformedSphereSamples(object: LayoutObject, radialSteps = 64, latitudeSteps = 32): Vec3[] {
	const [halfX, halfY, halfZ] = object.dimensions.map((value) => value / 2) as Vec3;
	const samples: Vec3[] = [];
	for (let latitudeIndex = 0; latitudeIndex <= latitudeSteps; latitudeIndex += 1) {
		const latitude = -Math.PI / 2 + (latitudeIndex / latitudeSteps) * Math.PI;
		const ring = Math.cos(latitude);
		const y = Math.sin(latitude) * halfY;
		for (let radialIndex = 0; radialIndex < radialSteps; radialIndex += 1) {
			const angle = (radialIndex / radialSteps) * Math.PI * 2;
			samples.push(transformObjectPoint([
				Math.cos(angle) * ring * halfX,
				y,
				Math.sin(angle) * ring * halfZ
			], object));
		}
	}
	return samples;
}

function transformedCylinderSamples(object: LayoutObject, radialSteps = 64): Vec3[] {
	const [halfX, halfY, halfZ] = object.dimensions.map((value) => value / 2) as Vec3;
	const samples: Vec3[] = [];
	for (const y of [-halfY, halfY]) {
		for (let radialIndex = 0; radialIndex < radialSteps; radialIndex += 1) {
			const angle = (radialIndex / radialSteps) * Math.PI * 2;
			samples.push(transformObjectPoint([
				Math.cos(angle) * halfX,
				y,
				Math.sin(angle) * halfZ
			], object));
		}
	}
	return samples;
}

/** Matches Three.js Euler's default XYZ order. */
export function rotateXyz([x, y, z]: Vec3, [rx, ry, rz]: Vec3): Vec3 {
	const a = Math.cos(rx);
	const b = Math.sin(rx);
	const c = Math.cos(ry);
	const d = Math.sin(ry);
	const e = Math.cos(rz);
	const f = Math.sin(rz);
	const ae = a * e;
	const af = a * f;
	const be = b * e;
	const bf = b * f;
	return [
		c * e * x + (-c * f) * y + d * z,
		(af + be * d) * x + (ae - bf * d) * y - b * c * z,
		(bf - ae * d) * x + (be + af * d) * y + a * c * z
	];
}
