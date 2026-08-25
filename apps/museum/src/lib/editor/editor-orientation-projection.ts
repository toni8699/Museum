import { Quaternion, Vector3 } from 'three';
import type { CardinalView } from './camera/editor-camera';

export const ORIENTATION_VIEWBOX_SIZE = 88;
export const ORIENTATION_WIDGET_CENTER = [44, 44] as const;
export const ORIENTATION_CUBE_HALF_EXTENT = 15;
export const ORIENTATION_AXIS_EXTENSION = 10;
export const ORIENTATION_AXIS_ARROW_LENGTH = 4.5;
export const ORIENTATION_AXIS_ARROW_BASE = 3.5;

const ORIENTATION_LABEL_FADE_START = Math.sin((18 * Math.PI) / 180);
const ORIENTATION_LABEL_FADE_END = Math.sin((28 * Math.PI) / 180);
const ORIENTATION_AXIS_RETICLE_DOT_MIN = Math.cos((12 * Math.PI) / 180);
const ORIENTATION_PROJECTION_POINT_EPSILON = 0.1;
const ORIENTATION_PROJECTION_ANGLE_EPSILON = 1e-5;
const VECTOR_EPSILON_SQ = 1e-12;

export type OrientationPoint2 = readonly [x: number, y: number];

export type OrientationProjectionInput = {
	cameraQuaternion: readonly [x: number, y: number, z: number, w: number];
	/** Normalized target-to-eye direction sampled from camera/controls. */
	eyeDirection: readonly [x: number, y: number, z: number];
};

export type ProjectedOrientationFace = {
	face: CardinalView;
	polygon: readonly OrientationPoint2[];
	center: OrientationPoint2;
	directionFromCubeCenter: OrientationPoint2;
	viewDot: number;
	depth: number;
	painted: boolean;
	lightAmount: number;
	labelOpacity: number;
};

export type ProjectedOrientationAxis = {
	face: '+X' | '+Y' | '+Z';
	projectedAnchor: OrientationPoint2;
	projectedShaftEnd: OrientationPoint2;
	arrowPolygon: readonly OrientationPoint2[] | null;
	reticleCenter: OrientationPoint2 | null;
	glyphCenter: OrientationPoint2;
	foreshortened: boolean;
};

export type ProjectedOrientationEdge = {
	start: OrientationPoint2;
	end: OrientationPoint2;
};

export type OrientationProjectionSnapshot = {
	cameraQuaternion: readonly [number, number, number, number];
	eyeDirection: readonly [number, number, number];
	/** All six faces, ordered far to near; `painted` controls visual output. */
	faces: readonly ProjectedOrientationFace[];
	axes: readonly ProjectedOrientationAxis[];
	/** Unique edges belonging to at least one painted face. */
	edges: readonly ProjectedOrientationEdge[];
};

type FaceDefinition = {
	face: CardinalView;
	normal: readonly [number, number, number];
	fixedAxis: 0 | 1 | 2;
	fixedSign: -1 | 1;
};

type AxisDefinition = {
	face: '+X' | '+Y' | '+Z';
	direction: readonly [number, number, number];
	anchor: readonly [number, number, number];
};

type ProjectedVertex = {
	key: string;
	point: OrientationPoint2;
};

type WorkingFace = ProjectedOrientationFace & {
	vertices: readonly ProjectedVertex[];
};

const FACE_DEFINITIONS: readonly FaceDefinition[] = [
	{ face: '+X', normal: [1, 0, 0], fixedAxis: 0, fixedSign: 1 },
	{ face: '-X', normal: [-1, 0, 0], fixedAxis: 0, fixedSign: -1 },
	{ face: '+Y', normal: [0, 1, 0], fixedAxis: 1, fixedSign: 1 },
	{ face: '-Y', normal: [0, -1, 0], fixedAxis: 1, fixedSign: -1 },
	{ face: '+Z', normal: [0, 0, 1], fixedAxis: 2, fixedSign: 1 },
	{ face: '-Z', normal: [0, 0, -1], fixedAxis: 2, fixedSign: -1 }
];

const H = ORIENTATION_CUBE_HALF_EXTENT;
const AXIS_DEFINITIONS: readonly AxisDefinition[] = [
	{ face: '+X', direction: [1, 0, 0], anchor: [H, -H, H] },
	{ face: '+Y', direction: [0, 1, 0], anchor: [H, H, -H] },
	{ face: '+Z', direction: [0, 0, 1], anchor: [-H, -H, H] }
];

const ORIENTATION_VIEW_LIGHT = new Vector3(-0.35, 0.85, 1).normalize();

function point(x: number, y: number): OrientationPoint2 {
	return Object.freeze([x, y] as [number, number]);
}

function tuple3(vector: Vector3): readonly [number, number, number] {
	return Object.freeze([vector.x, vector.y, vector.z] as [number, number, number]);
}

function tuple4(quaternion: Quaternion): readonly [number, number, number, number] {
	return Object.freeze([
		quaternion.x,
		quaternion.y,
		quaternion.z,
		quaternion.w
	] as [number, number, number, number]);
}

function vector3(value: readonly [number, number, number]): Vector3 {
	return new Vector3(value[0], value[1], value[2]);
}

function project(vector: Vector3, viewRotation: Quaternion): { point: OrientationPoint2; depth: number } {
	const viewed = vector.clone().applyQuaternion(viewRotation);
	return {
		point: point(
			ORIENTATION_WIDGET_CENTER[0] + viewed.x,
			ORIENTATION_WIDGET_CENTER[1] - viewed.y
		),
		depth: viewed.z
	};
}

function faceVertices(definition: FaceDefinition): Vector3[] {
	const freeAxes = ([0, 1, 2] as const).filter((axis) => axis !== definition.fixedAxis);
	const vertices: Vector3[] = [];
	for (const first of [-1, 1] as const) {
		for (const second of [-1, 1] as const) {
			const coordinates: [number, number, number] = [0, 0, 0];
			coordinates[definition.fixedAxis] = definition.fixedSign * H;
			coordinates[freeAxes[0]!] = first * H;
			coordinates[freeAxes[1]!] = second * H;
			vertices.push(new Vector3(...coordinates));
		}
	}
	return vertices;
}

function vertexKey(vertex: Vector3): string {
	return `${vertex.x},${vertex.y},${vertex.z}`;
}

function labelOpacity(viewDot: number): number {
	if (viewDot < ORIENTATION_LABEL_FADE_START) return 0;
	if (viewDot > ORIENTATION_LABEL_FADE_END) return 1;
	return (
		(viewDot - ORIENTATION_LABEL_FADE_START) /
		(ORIENTATION_LABEL_FADE_END - ORIENTATION_LABEL_FADE_START)
	);
}

function normalizedQuaternion(input: OrientationProjectionInput['cameraQuaternion']): Quaternion {
	const quaternion = new Quaternion(input[0], input[1], input[2], input[3]);
	if (
		!Number.isFinite(quaternion.x) ||
		!Number.isFinite(quaternion.y) ||
		!Number.isFinite(quaternion.z) ||
		!Number.isFinite(quaternion.w) ||
		quaternion.lengthSq() <= VECTOR_EPSILON_SQ
	) {
		return new Quaternion();
	}
	return quaternion.normalize();
}

function normalizedEyeDirection(
	input: OrientationProjectionInput['eyeDirection'],
	cameraQuaternion: Quaternion
): Vector3 {
	const direction = vector3(input);
	if (
		!Number.isFinite(direction.x) ||
		!Number.isFinite(direction.y) ||
		!Number.isFinite(direction.z) ||
		direction.lengthSq() <= VECTOR_EPSILON_SQ
	) {
		return new Vector3(0, 0, 1).applyQuaternion(cameraQuaternion);
	}
	return direction.normalize();
}

function freezeFace(face: WorkingFace): ProjectedOrientationFace {
	return Object.freeze({
		face: face.face,
		polygon: Object.freeze(face.polygon.slice()),
		center: face.center,
		directionFromCubeCenter: face.directionFromCubeCenter,
		viewDot: face.viewDot,
		depth: face.depth,
		painted: face.painted,
		lightAmount: face.lightAmount,
		labelOpacity: face.labelOpacity
	});
}

/** Pure camera-orientation projection for the Scene 3D SVG orientation box. */
export function projectOrientationGeometry(
	input: OrientationProjectionInput
): OrientationProjectionSnapshot {
	const cameraQuaternion = normalizedQuaternion(input.cameraQuaternion);
	const viewRotation = cameraQuaternion.clone().invert();
	const eyeDirection = normalizedEyeDirection(input.eyeDirection, cameraQuaternion);

	const workingFaces: WorkingFace[] = FACE_DEFINITIONS.map((definition) => {
		const normal = vector3(definition.normal);
		const projectedCenter = project(normal.clone().multiplyScalar(H), viewRotation);
		const projectedVertices = faceVertices(definition)
			.map((vertex) => ({
				key: vertexKey(vertex),
				point: project(vertex, viewRotation).point
			}))
			.sort((a, b) => {
				const angleA = Math.atan2(
					a.point[1] - projectedCenter.point[1],
					a.point[0] - projectedCenter.point[0]
				);
				const angleB = Math.atan2(
					b.point[1] - projectedCenter.point[1],
					b.point[0] - projectedCenter.point[0]
				);
				return angleA - angleB;
			});
		const viewDot = normal.dot(eyeDirection);
		const viewNormal = normal.clone().applyQuaternion(viewRotation);
		return {
			face: definition.face,
			polygon: projectedVertices.map((vertex) => vertex.point),
			center: projectedCenter.point,
			directionFromCubeCenter: point(
				projectedCenter.point[0] - ORIENTATION_WIDGET_CENTER[0],
				projectedCenter.point[1] - ORIENTATION_WIDGET_CENTER[1]
			),
			viewDot,
			depth: projectedCenter.depth,
			painted: viewDot > 0,
			lightAmount: Math.max(0, Math.min(1, viewNormal.dot(ORIENTATION_VIEW_LIGHT))),
			labelOpacity: labelOpacity(viewDot),
			vertices: projectedVertices
		};
	}).sort((a, b) => a.depth - b.depth || a.face.localeCompare(b.face));

	const edgeMap = new Map<string, ProjectedOrientationEdge>();
	for (const face of workingFaces) {
		if (!face.painted) continue;
		for (let index = 0; index < face.vertices.length; index += 1) {
			const start = face.vertices[index]!;
			const end = face.vertices[(index + 1) % face.vertices.length]!;
			const key = start.key < end.key ? `${start.key}|${end.key}` : `${end.key}|${start.key}`;
			if (!edgeMap.has(key)) {
				edgeMap.set(key, Object.freeze({ start: start.point, end: end.point }));
			}
		}
	}

	const axes = AXIS_DEFINITIONS.map((definition): ProjectedOrientationAxis => {
		const direction = vector3(definition.direction);
		const anchor = vector3(definition.anchor);
		const shaftEnd = anchor.clone().addScaledVector(direction, ORIENTATION_AXIS_EXTENSION);
		const projectedAnchor = project(anchor, viewRotation).point;
		const projectedShaftEnd = project(shaftEnd, viewRotation).point;
		const dx = projectedShaftEnd[0] - projectedAnchor[0];
		const dy = projectedShaftEnd[1] - projectedAnchor[1];
		const projectedLength = Math.hypot(dx, dy);
		const foreshortened =
			Math.abs(direction.dot(eyeDirection)) > ORIENTATION_AXIS_RETICLE_DOT_MIN ||
			projectedLength <= 1e-6;

		if (foreshortened) {
			return Object.freeze({
				face: definition.face,
				projectedAnchor,
				projectedShaftEnd,
				arrowPolygon: null,
				reticleCenter: projectedAnchor,
				glyphCenter: projectedAnchor,
				foreshortened: true
			});
		}

		const ux = dx / projectedLength;
		const uy = dy / projectedLength;
		const halfBase = ORIENTATION_AXIS_ARROW_BASE / 2;
		const apex = point(
			projectedShaftEnd[0] + ux * ORIENTATION_AXIS_ARROW_LENGTH,
			projectedShaftEnd[1] + uy * ORIENTATION_AXIS_ARROW_LENGTH
		);
		const arrowPolygon = Object.freeze([
			apex,
			point(projectedShaftEnd[0] - uy * halfBase, projectedShaftEnd[1] + ux * halfBase),
			point(projectedShaftEnd[0] + uy * halfBase, projectedShaftEnd[1] - ux * halfBase)
		]);
		return Object.freeze({
			face: definition.face,
			projectedAnchor,
			projectedShaftEnd,
			arrowPolygon,
			reticleCenter: null,
			glyphCenter: point(apex[0] + ux * 4, apex[1] + uy * 4),
			foreshortened: false
		});
	});

	return Object.freeze({
		cameraQuaternion: tuple4(cameraQuaternion),
		eyeDirection: tuple3(eyeDirection),
		faces: Object.freeze(workingFaces.map(freezeFace)),
		axes: Object.freeze(axes),
		edges: Object.freeze([...edgeMap.values()])
	});
}

function quaternionAngularDelta(
	a: readonly [number, number, number, number],
	b: readonly [number, number, number, number]
): number {
	const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
	return 2 * Math.acos(Math.min(1, Math.max(-1, dot)));
}

function vectorAngularDelta(
	a: readonly [number, number, number],
	b: readonly [number, number, number]
): number {
	const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
	return Math.acos(Math.min(1, Math.max(-1, dot)));
}

function pointMoved(a: OrientationPoint2, b: OrientationPoint2): boolean {
	return Math.hypot(a[0] - b[0], a[1] - b[1]) > ORIENTATION_PROJECTION_POINT_EPSILON;
}

/** Compares against the last published snapshot so slow sub-threshold orbit accumulates. */
export function orientationProjectionMateriallyChanged(
	previous: OrientationProjectionSnapshot | null,
	next: OrientationProjectionSnapshot
): boolean {
	if (previous === null) return true;
	if (
		quaternionAngularDelta(previous.cameraQuaternion, next.cameraQuaternion) >
		ORIENTATION_PROJECTION_ANGLE_EPSILON
	) {
		return true;
	}
	if (
		vectorAngularDelta(previous.eyeDirection, next.eyeDirection) >
		ORIENTATION_PROJECTION_ANGLE_EPSILON
	) {
		return true;
	}

	for (const nextFace of next.faces) {
		const previousFace = previous.faces.find((face) => face.face === nextFace.face);
		if (!previousFace || previousFace.painted !== nextFace.painted) return true;
		if (pointMoved(previousFace.center, nextFace.center)) return true;
		if (pointMoved(previousFace.directionFromCubeCenter, nextFace.directionFromCubeCenter)) return true;
		for (let index = 0; index < nextFace.polygon.length; index += 1) {
			if (pointMoved(previousFace.polygon[index]!, nextFace.polygon[index]!)) return true;
		}
	}

	for (const nextAxis of next.axes) {
		const previousAxis = previous.axes.find((axis) => axis.face === nextAxis.face);
		if (!previousAxis || previousAxis.foreshortened !== nextAxis.foreshortened) return true;
		if (
			pointMoved(previousAxis.projectedAnchor, nextAxis.projectedAnchor) ||
			pointMoved(previousAxis.projectedShaftEnd, nextAxis.projectedShaftEnd) ||
			pointMoved(previousAxis.glyphCenter, nextAxis.glyphCenter)
		) {
			return true;
		}
	}

	return false;
}
