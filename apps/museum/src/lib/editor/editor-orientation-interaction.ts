import type { CardinalView } from './camera/editor-camera';
import { EDITOR_DRAG_THRESHOLD_PX } from './interaction-constants';
import {
	ORIENTATION_WIDGET_CENTER,
	type OrientationPoint2,
	type OrientationProjectionSnapshot,
	type ProjectedOrientationFace
} from './editor-orientation-projection';

export const ORIENTATION_CARDINAL_ACTIVE_DOT_MIN = 0.999;
export const ORIENTATION_FACE_HIT_ENTER_PROXY_PX = 14;
export const ORIENTATION_FACE_HIT_LEAVE_PROXY_PX = 16;
export const ORIENTATION_OPPOSITE_FACE_PROXY_RADIUS = 36;
export const ORIENTATION_PROXY_HIT_SIZE = 14;
export const ORIENTATION_PROXY_DIRECTION_ENTER_FALLBACK_PX = 2;
export const ORIENTATION_PROXY_DIRECTION_LEAVE_FALLBACK_PX = 3;

export const ORIENTATION_CARDINAL_FACE_ORDER: readonly CardinalView[] = [
	'+X',
	'-X',
	'+Y',
	'-Y',
	'+Z',
	'-Z'
];

const CARDINAL_NORMALS: Readonly<Record<CardinalView, readonly [number, number, number]>> = {
	'+X': [1, 0, 0],
	'-X': [-1, 0, 0],
	'+Y': [0, 1, 0],
	'-Y': [0, -1, 0],
	'+Z': [0, 0, 1],
	'-Z': [0, 0, -1]
};

const PROXY_FALLBACK_DIRECTIONS: Readonly<
	Record<CardinalView, readonly [number, number]>
> = {
	'+X': [1, 0],
	'-X': [-1, 0],
	'+Y': [0, -1],
	'-Y': [0, 1],
	'+Z': [-Math.SQRT1_2, Math.SQRT1_2],
	'-Z': [Math.SQRT1_2, -Math.SQRT1_2]
};

export type OrientationFaceTargetMode = 'polygon' | 'proxy';
export type OrientationProxyDirectionMode = 'projected' | 'fallback';

export type OrientationInteractionHysteresisState = {
	faceModes: Readonly<Partial<Record<CardinalView, OrientationFaceTargetMode>>>;
	proxyDirectionModes: Readonly<
		Partial<Record<CardinalView, OrientationProxyDirectionMode>>
	>;
};

export type OrientationFaceTarget = {
	face: CardinalView;
	mode: OrientationFaceTargetMode;
	polygon: readonly OrientationPoint2[] | null;
	proxyCenter: OrientationPoint2 | null;
	proxyCueCenter: OrientationPoint2 | null;
	painted: boolean;
};

export type OrientationFaceTargetResult = {
	targets: readonly OrientationFaceTarget[];
	state: OrientationInteractionHysteresisState;
};

export type OrientationPointerGesture = {
	pointerId: number;
	startClientX: number;
	startClientY: number;
	targetId: string;
	face: CardinalView;
	cancelled: boolean;
};

function point(x: number, y: number): OrientationPoint2 {
	return Object.freeze([x, y] as [number, number]);
}

function faceBounds(face: ProjectedOrientationFace): { width: number; height: number } {
	const xs = face.polygon.map(([x]) => x);
	const ys = face.polygon.map(([, y]) => y);
	return {
		width: Math.max(...xs) - Math.min(...xs),
		height: Math.max(...ys) - Math.min(...ys)
	};
}

function resolveFaceMode(
	face: ProjectedOrientationFace,
	previous: OrientationFaceTargetMode | undefined
): OrientationFaceTargetMode {
	if (!face.painted) return 'proxy';
	const bounds = faceBounds(face);
	const minimumDimension = Math.min(bounds.width, bounds.height);
	if (previous === 'proxy') {
		return minimumDimension > ORIENTATION_FACE_HIT_LEAVE_PROXY_PX ? 'polygon' : 'proxy';
	}
	return minimumDimension < ORIENTATION_FACE_HIT_ENTER_PROXY_PX ? 'proxy' : 'polygon';
}

function resolveProxyDirectionMode(
	directionLength: number,
	previous: OrientationProxyDirectionMode | undefined
): OrientationProxyDirectionMode {
	if (previous === 'fallback') {
		return directionLength > ORIENTATION_PROXY_DIRECTION_LEAVE_FALLBACK_PX
			? 'projected'
			: 'fallback';
	}
	return directionLength < ORIENTATION_PROXY_DIRECTION_ENTER_FALLBACK_PX
		? 'fallback'
		: 'projected';
}

function proxyCenter(
	face: ProjectedOrientationFace,
	directionMode: OrientationProxyDirectionMode
): OrientationPoint2 {
	let directionX: number;
	let directionY: number;
	if (directionMode === 'fallback') {
		[directionX, directionY] = PROXY_FALLBACK_DIRECTIONS[face.face];
	} else {
		const length = Math.hypot(...face.directionFromCubeCenter);
		directionX = face.directionFromCubeCenter[0] / length;
		directionY = face.directionFromCubeCenter[1] / length;
	}
	return point(
		ORIENTATION_WIDGET_CENTER[0] + directionX * ORIENTATION_OPPOSITE_FACE_PROXY_RADIUS,
		ORIENTATION_WIDGET_CENTER[1] + directionY * ORIENTATION_OPPOSITE_FACE_PROXY_RADIUS
	);
}

function proxyCueCenter(center: OrientationPoint2): OrientationPoint2 {
	return point(
		Math.max(24, Math.min(64, center[0])),
		Math.max(9, Math.min(79, center[1]))
	);
}

/** Six stable face targets with entry/exit hysteresis for thin faces and proxies. */
export function deriveOrientationFaceTargets(
	snapshot: OrientationProjectionSnapshot,
	previous: OrientationInteractionHysteresisState | null = null
): OrientationFaceTargetResult {
	const faceModes: Partial<Record<CardinalView, OrientationFaceTargetMode>> = {};
	const proxyDirectionModes: Partial<
		Record<CardinalView, OrientationProxyDirectionMode>
	> = {};
	const targets = ORIENTATION_CARDINAL_FACE_ORDER.map((faceName): OrientationFaceTarget => {
		const face = snapshot.faces.find((candidate) => candidate.face === faceName)!;
		const mode = resolveFaceMode(face, previous?.faceModes[faceName]);
		faceModes[faceName] = mode;
		const directionLength = Math.hypot(...face.directionFromCubeCenter);
		const directionMode = resolveProxyDirectionMode(
			directionLength,
			previous?.proxyDirectionModes[faceName]
		);
		proxyDirectionModes[faceName] = directionMode;
		if (mode === 'polygon') {
			return Object.freeze({
				face: faceName,
				mode,
				polygon: face.polygon,
				proxyCenter: null,
				proxyCueCenter: null,
				painted: face.painted
			});
		}
		const center = proxyCenter(face, directionMode);
		return Object.freeze({
			face: faceName,
			mode,
			polygon: null,
			proxyCenter: center,
			proxyCueCenter: proxyCueCenter(center),
			painted: face.painted
		});
	});

	return Object.freeze({
		targets: Object.freeze(targets),
		state: Object.freeze({
			faceModes: Object.freeze(faceModes),
			proxyDirectionModes: Object.freeze(proxyDirectionModes)
		})
	});
}

/** Returns a face only inside the approved 0.999 cardinal-alignment tolerance. */
export function deriveActiveCardinalFace(
	eyeDirection: readonly [number, number, number]
): CardinalView | null {
	const length = Math.hypot(...eyeDirection);
	if (!Number.isFinite(length) || length <= 1e-12) return null;
	const normalized: readonly [number, number, number] = [
		eyeDirection[0] / length,
		eyeDirection[1] / length,
		eyeDirection[2] / length
	];
	for (const face of ORIENTATION_CARDINAL_FACE_ORDER) {
		const normal = CARDINAL_NORMALS[face];
		const dot =
			normal[0] * normalized[0] +
			normal[1] * normalized[1] +
			normal[2] * normalized[2];
		if (dot >= ORIENTATION_CARDINAL_ACTIVE_DOT_MIN) return face;
	}
	return null;
}

export function createOrientationPointerGesture(input: {
	pointerId: number;
	clientX: number;
	clientY: number;
	targetId: string;
	face: CardinalView;
}): OrientationPointerGesture {
	return Object.freeze({
		pointerId: input.pointerId,
		startClientX: input.clientX,
		startClientY: input.clientY,
		targetId: input.targetId,
		face: input.face,
		cancelled: false
	});
}

export function moveOrientationPointerGesture(
	gesture: OrientationPointerGesture,
	pointerId: number,
	clientX: number,
	clientY: number
): OrientationPointerGesture {
	if (pointerId !== gesture.pointerId || gesture.cancelled) return gesture;
	if (
		Math.hypot(clientX - gesture.startClientX, clientY - gesture.startClientY) <=
		EDITOR_DRAG_THRESHOLD_PX
	) {
		return gesture;
	}
	return Object.freeze({ ...gesture, cancelled: true });
}

/**
 * Pointerup activation gate. Target validity is established by the stable
 * six-face/three-axis target sets plus pointer/target identity and the
 * disabled guard — no separate validity probe is needed.
 */
export function shouldActivateOrientationPointerGesture(
	gesture: OrientationPointerGesture | null,
	input: {
		pointerId: number;
		targetId: string;
		disabled: boolean;
	}
): boolean {
	return (
		gesture !== null &&
		gesture.pointerId === input.pointerId &&
		gesture.targetId === input.targetId &&
		!gesture.cancelled &&
		!input.disabled
	);
}
