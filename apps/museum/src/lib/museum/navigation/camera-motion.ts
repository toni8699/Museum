import {
  CubicBezierCurve3,
  CurvePath,
  LineCurve3,
  MathUtils,
  QuadraticBezierCurve3,
  Vector3
} from 'three';
import {
  MUSEUM_CAMERA_EASING,
  MUSEUM_CAMERA_FOV,
  type CameraConnectionDirection,
  type CameraEasing,
  type RuntimeCameraFramingEnvelope
} from '$lib/types/museum';

export type Vector3Like =
  | readonly [number, number, number]
  | Readonly<{ x: number; y: number; z: number }>;

export type CameraPositionPathPart =
  | {
      kind: 'rounded-polyline';
      points: readonly Vector3Like[];
      clearance?: number;
    }
  | {
      kind: 'auto-bezier';
      anchors: readonly Vector3Like[];
    };

export type CameraPositionPathLocation = {
  partIndex: number;
  pointIndex: number;
};

export type CameraPositionPathSpan = {
  start: CameraPositionPathLocation;
  end: CameraPositionPathLocation;
};

export type CameraRouteView = {
  cameraTarget: Vector3Like;
  /** Vertical PerspectiveCamera field of view in degrees. */
  fov: number;
};

export type CameraRouteViewKeyframe = CameraRouteView & {
  id: string;
  /** Exact-edge arc-length progress in this track's travel direction. */
  progress: number;
};

export type CameraRouteViewTrack = {
  /** Generated from the oriented source node; never persisted. */
  start: CameraRouteView;
  /** Authored interior keys from this direction only. */
  keyframes: readonly CameraRouteViewKeyframe[];
  /** Generated from the oriented destination node; never persisted. */
  end: CameraRouteView;
  /** Direction-owned travel-relative automatic/authored framing blend bounds. */
  framingEnvelope?: RuntimeCameraFramingEnvelope;
};

export type CameraRouteEdge = {
  connectionId: string;
  direction: CameraConnectionDirection;
  fromNodeId: string;
  toNodeId: string;
  /** Locations in the coalesced position parts for this oriented edge. */
  positionSpan: CameraPositionPathSpan;
  /** Present on resolved graph routes; optional for low-level motion callers. */
  viewTrack?: CameraRouteViewTrack;
  /** Existing synthesized target data scoped to this exact oriented edge. */
  automaticTargetPoints?: readonly Vector3Like[];
};

export type CameraRoute = {
  positionParts: readonly CameraPositionPathPart[];
  targetPoints: readonly Vector3Like[];
  /** Generated endpoint FOV values; defaults to 54 for low-level callers. */
  startFov?: number;
  endFov?: number;
  /** Required on resolved graph routes; optional for low-level motion callers. */
  edges?: readonly CameraRouteEdge[];
};

export type CameraPose = {
  position: Vector3Like;
  target: Vector3Like;
  fov: number;
};

export type CameraMotionSample = {
  position: Vector3;
  target: Vector3;
  fov: number;
};

export type CameraMotion = {
  readonly positionPath: CurvePath<Vector3>;
  readonly targetPath: CurvePath<Vector3>;
  readonly positionEdgeSpans: readonly CameraPositionEdgeDistanceSpan[];
  readonly edgeViews: readonly (CameraMotionEdgeView | null)[];
  readonly totalPositionDistance: number;
  readonly usesLegacyTargetPath: boolean;
  readonly startFov: number;
  readonly endFov: number;
  readonly durationSeconds: number;
  /** Phase 3.7 authored easing applied across the motion span. */
  readonly easing: CameraEasing;
};

/** Phase 3.7 authored overrides for one direction of a connection. */
export type CameraMotionOptions = {
  /** Exactly replace the formula-derived motion duration (no clamp). */
  durationSeconds?: number;
  /** Override the default easing applied to the motion span. */
  easing?: CameraEasing;
};

export type CameraPositionDistanceSpan = {
  readonly startDistance: number;
  readonly endDistance: number;
  readonly length: number;
};

export type CameraPositionEdgeDistanceSpan = CameraRouteEdge &
  CameraPositionDistanceSpan;

export type CompiledCameraPositionPath = {
  readonly positionPath: CurvePath<Vector3>;
  /** Same order as the requested path spans. */
  readonly spans: readonly CameraPositionDistanceSpan[];
  readonly totalDistance: number;
};

export const VISITOR_CAMERA_PROJECTION = {
  fov: MUSEUM_CAMERA_FOV.default,
  near: 0.1,
  far: 90
} as const;

export const CAMERA_FOV_UPDATE_EPSILON = 1e-4;
export const CAMERA_POSE_EPSILON = 1e-6;

export const CAMERA_MOTION_TIMING = {
  unitsPerSecond: 6.2,
  minDurationSeconds: 1.25,
  maxDurationSeconds: 4.8
} as const;

/** Default easing used when a motion has no authored override. */
export const CAMERA_MOTION_DEFAULT_EASING: CameraEasing = 'smootherstep';

export const CAMERA_MOTION_PATH = {
  positionCornerRadius: 0.42,
  targetCornerRadius: 0.65,
  cornerTrimRatio: 0.2,
  autoBezierAlpha: 0.5
} as const;

export const CAMERA_FRAMING_GUARD_POLICY = {
  minTargetStandoffMeters: VISITOR_CAMERA_PROJECTION.near,
  targetStandoffShoulderMeters: VISITOR_CAMERA_PROJECTION.near * 2,
  directionEpsilonMeters: CAMERA_POSE_EPSILON,
  maxAngularRateRadiansPerSecond: Math.PI * 1.5,
  angularInterpolationPeakRateFactor: 1.875,
  maxSampleAngularDeltaRadians: Math.PI / 36,
  maxTargetDistanceCurvatureMeters: VISITOR_CAMERA_PROJECTION.near / 2,
  baseSampleSegments: 24,
  maxAdaptiveDepth: 8,
  doubleWhipOffAxisRadians: Math.PI / 12,
  doubleWhipPathExcessRadians: Math.PI / 18,
  sphericalLerpLinearDotThreshold: 1 - CAMERA_POSE_EPSILON
} as const;

type PreparedPositionPathPart =
  | {
      kind: 'rounded-polyline';
      points: Vector3[];
      clearance?: number;
    }
  | {
      kind: 'auto-bezier';
      anchors: Vector3[];
    };

type PreparedCameraRouteView = {
  cameraTarget: Vector3;
  fov: number;
};

type PreparedCameraRouteViewKeyframe = PreparedCameraRouteView & {
  id: string;
  progress: number;
};

type PreparedCameraRouteViewTrack = {
  start: PreparedCameraRouteView;
  keyframes: PreparedCameraRouteViewKeyframe[];
  end: PreparedCameraRouteView;
  framingEnvelope?: RuntimeCameraFramingEnvelope;
};

type PreparedCameraRouteEdge = Omit<
  CameraRouteEdge,
  'viewTrack' | 'automaticTargetPoints'
> & {
  viewTrack?: PreparedCameraRouteViewTrack;
  automaticTargetPoints?: Vector3[];
};

type CameraMotionViewPoint = {
  progress: number;
  cameraTarget: Vector3;
  fov: number;
};

type CameraMotionEdgeView = {
  points: CameraMotionViewPoint[];
  automaticTargetPath: CurvePath<Vector3> | null;
  hasAuthoredKeyframes: boolean;
  framingEnvelope?: RuntimeCameraFramingEnvelope;
  guard: CameraFramingGuard | null;
};

type CameraFramingDirectionSample = {
  readonly progress: number;
  readonly directionX: number;
  readonly directionY: number;
  readonly directionZ: number;
};

type CameraFramingBypass = {
  readonly startProgress: number;
  readonly startTarget: Vector3;
  readonly endTarget: Vector3;
};

type CameraFramingGuard = {
  readonly directions: readonly CameraFramingDirectionSample[];
  readonly limitsAngularRate: boolean;
  readonly bypass: CameraFramingBypass | null;
};

function isVectorTuple(
  value: Vector3Like
): value is readonly [number, number, number] {
  return Array.isArray(value);
}

function readVector3(value: Vector3Like, label: string) {
  const components = isVectorTuple(value)
    ? value
    : [value.x, value.y, value.z];

  if (
    components.length !== 3 ||
    components.some((component) => !Number.isFinite(component))
  ) {
    throw new Error(`${label} must contain exactly three finite numbers`);
  }

  return new Vector3(components[0], components[1], components[2]);
}

function readFov(value: number, label: string) {
  if (
    !Number.isFinite(value) ||
    value < MUSEUM_CAMERA_FOV.min ||
    value > MUSEUM_CAMERA_FOV.max
  ) {
    throw new Error(
      `${label} must be a finite number between ${MUSEUM_CAMERA_FOV.min} and ${MUSEUM_CAMERA_FOV.max}`
    );
  }
  return value;
}

function clonePoints(points: readonly Vector3Like[], label: string) {
  return points.map((point, index) => readVector3(point, `${label}[${index}]`));
}

function prepareRouteView(
  view: CameraRouteView,
  label: string
): PreparedCameraRouteView {
  return {
    cameraTarget: readVector3(view.cameraTarget, `${label} cameraTarget`),
    fov: readFov(view.fov, `${label} fov`)
  };
}

function prepareRouteEdge(
  edge: CameraRouteEdge,
  edgeIndex: number
): PreparedCameraRouteEdge {
  const label = `Camera route edge[${edgeIndex}]`;
  if (edge.direction !== 'forward' && edge.direction !== 'reverse') {
    throw new Error(`${label} has an unknown direction`);
  }

  let viewTrack: PreparedCameraRouteViewTrack | undefined;
  if (edge.viewTrack) {
    let previousProgress = 0;
    const keyframeIds = new Set<string>();
    const keyframes = edge.viewTrack.keyframes.map((keyframe, keyframeIndex) => {
      const keyframeLabel = `${label} view keyframe[${keyframeIndex}]`;
      if (keyframe.id.trim().length === 0) {
        throw new Error(`${keyframeLabel} id must be non-empty`);
      }
      if (keyframeIds.has(keyframe.id)) {
        throw new Error(`${keyframeLabel} id must be unique within the edge track`);
      }
      keyframeIds.add(keyframe.id);
      if (
        !Number.isFinite(keyframe.progress) ||
        keyframe.progress <= previousProgress ||
        keyframe.progress >= 1
      ) {
        throw new Error(
          `${keyframeLabel} progress must be finite, strictly increasing, and inside (0, 1)`
        );
      }
      previousProgress = keyframe.progress;
      return {
        id: keyframe.id,
        progress: keyframe.progress,
        ...prepareRouteView(keyframe, keyframeLabel)
      };
    });
    viewTrack = {
      start: prepareRouteView(edge.viewTrack.start, `${label} start view`),
      keyframes,
      end: prepareRouteView(edge.viewTrack.end, `${label} end view`),
      ...(edge.viewTrack.framingEnvelope === undefined
        ? {}
        : { framingEnvelope: { ...edge.viewTrack.framingEnvelope } })
    };
  }

  const automaticTargetPoints = edge.automaticTargetPoints
    ? clonePoints(edge.automaticTargetPoints, `${label} automatic target`)
    : undefined;
  if (automaticTargetPoints?.length === 0) {
    throw new Error(`${label} automatic targets must contain at least one point`);
  }

  return {
    connectionId: edge.connectionId,
    direction: edge.direction,
    fromNodeId: edge.fromNodeId,
    toNodeId: edge.toNodeId,
    positionSpan: {
      start: { ...edge.positionSpan.start },
      end: { ...edge.positionSpan.end }
    },
    ...(viewTrack ? { viewTrack } : {}),
    ...(automaticTargetPoints ? { automaticTargetPoints } : {})
  };
}

function pointsForPart(part: PreparedPositionPathPart) {
  return part.kind === 'rounded-polyline' ? part.points : part.anchors;
}

function preparePositionParts(parts: readonly CameraPositionPathPart[]) {
  if (parts.length === 0) {
    throw new Error('Camera route must contain at least one position path part');
  }

  const prepared = parts.map((part, partIndex): PreparedPositionPathPart => {
    if (part.kind === 'rounded-polyline') {
      if (part.points.length === 0) {
        throw new Error(`Camera route position part[${partIndex}] must contain at least one point`);
      }
      if (
        part.clearance !== undefined &&
        (!Number.isFinite(part.clearance) || part.clearance < 0)
      ) {
        throw new Error(
          `Camera route position part[${partIndex}] clearance must be a finite non-negative number`
        );
      }
      return {
        kind: part.kind,
        points: clonePoints(part.points, `Camera route position part[${partIndex}] point`),
        clearance: part.clearance
      };
    }

    if (part.kind === 'auto-bezier') {
      if (part.anchors.length === 0) {
        throw new Error(
          `Camera route position part[${partIndex}] must contain at least one anchor`
        );
      }
      return {
        kind: part.kind,
        anchors: clonePoints(
          part.anchors,
          `Camera route position part[${partIndex}] anchor`
        )
      };
    }

    throw new Error(`Camera route position part[${partIndex}] has an unknown kind`);
  });

  for (let index = 1; index < prepared.length; index += 1) {
    const previousPoints = pointsForPart(prepared[index - 1]);
    const currentPoints = pointsForPart(prepared[index]);
    if (!previousPoints.at(-1)?.equals(currentPoints[0])) {
      throw new Error(
        `Camera route position parts ${index - 1} and ${index} must form a contiguous join`
      );
    }
  }

  return prepared;
}

function countOrderedPositionPoints(parts: readonly PreparedPositionPathPart[]) {
  return parts.reduce((count, part, index) => {
    const pointCount = pointsForPart(part).length;
    return count + pointCount - (index === 0 ? 0 : 1);
  }, 0);
}

function replacePreparedStartPosition(
  parts: PreparedPositionPathPart[],
  startPosition: Vector3
) {
  for (const part of parts) {
    const points = pointsForPart(part);
    points[0] = startPosition.clone();
    if (points.length > 1) return;
  }
}

type CompiledPositionPart = {
  path: CurvePath<Vector3>;
  pointDistances: number[];
  totalDistance: number;
};

function splitQuadraticAtMidpoint(curve: QuadraticBezierCurve3) {
  const firstControl = curve.v0.clone().lerp(curve.v1, 0.5);
  const secondControl = curve.v1.clone().lerp(curve.v2, 0.5);
  const midpoint = firstControl.clone().lerp(secondControl, 0.5);
  const first = new QuadraticBezierCurve3(
    curve.v0.clone(),
    firstControl,
    midpoint
  );
  const second = new QuadraticBezierCurve3(
    midpoint.clone(),
    secondControl,
    curve.v2.clone()
  );

  // Preserve the original curve's arc-length sampling grid exactly: each half
  // owns the same number of original parameter intervals that it replaced.
  const firstDivisions = Math.max(1, Math.floor(curve.arcLengthDivisions / 2));
  first.arcLengthDivisions = firstDivisions;
  second.arcLengthDivisions = Math.max(
    1,
    curve.arcLengthDivisions - firstDivisions
  );
  return [first, second] as const;
}

function addRoundedLine(
  path: CurvePath<Vector3>,
  start: Vector3,
  end: Vector3,
  skippedPointIndices: readonly number[],
  points: readonly Vector3[],
  boundaryPointIndices: ReadonlySet<number>,
  pointDistances: number[],
  startDistance: number
) {
  const rawChain = [
    start,
    ...skippedPointIndices.map((index) => points[index]),
    end
  ];
  const rawCumulativeDistances = [0];
  for (let index = 1; index < rawChain.length; index += 1) {
    rawCumulativeDistances.push(
      rawCumulativeDistances[index - 1] +
        rawChain[index - 1].distanceTo(rawChain[index])
    );
  }

  const rawTotalDistance = rawCumulativeDistances.at(-1) ?? 0;
  const lineLength = start.distanceTo(end);
  const boundaryFractions: number[] = [];

  for (const [offset, pointIndex] of skippedPointIndices.entries()) {
    const fraction =
      rawTotalDistance === 0
        ? (offset + 1) / (skippedPointIndices.length + 1)
        : rawCumulativeDistances[offset + 1] / rawTotalDistance;
    pointDistances[pointIndex] = startDistance + lineLength * fraction;
    if (boundaryPointIndices.has(pointIndex)) boundaryFractions.push(fraction);
  }

  let cursor = start.clone();
  let previousFraction = 0;
  for (const fraction of boundaryFractions) {
    if (fraction <= previousFraction || fraction >= 1) continue;
    const boundary = start.clone().lerp(end, fraction);
    path.add(new LineCurve3(cursor, boundary));
    cursor = boundary;
    previousFraction = fraction;
  }
  path.add(new LineCurve3(cursor, end.clone()));
  return startDistance + lineLength;
}

function compileRoundedPositionPart(
  points: readonly Vector3[],
  maximumRadius: number,
  boundaryPointIndices: ReadonlySet<number>
): CompiledPositionPart {
  const path = new CurvePath<Vector3>();
  const pointDistances = new Array<number>(points.length);
  pointDistances[0] = 0;

  if (points.length === 1) {
    path.add(new LineCurve3(points[0].clone(), points[0].clone()));
    return { path, pointDistances, totalDistance: 0 };
  }

  let cursor = points[0].clone();
  let totalDistance = 0;
  let skippedPointIndices: number[] = [];

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const corner = points[index];
    const next = points[index + 1];
    const incoming = corner.clone().sub(previous);
    const outgoing = next.clone().sub(corner);
    const trim = Math.min(
      maximumRadius,
      incoming.length() * CAMERA_MOTION_PATH.cornerTrimRatio,
      outgoing.length() * CAMERA_MOTION_PATH.cornerTrimRatio
    );

    if (trim < 0.01) {
      skippedPointIndices.push(index);
      continue;
    }

    const beforeCorner = corner.clone().addScaledVector(incoming.normalize(), -trim);
    const afterCorner = corner.clone().addScaledVector(outgoing.normalize(), trim);
    totalDistance = addRoundedLine(
      path,
      cursor,
      beforeCorner,
      skippedPointIndices,
      points,
      boundaryPointIndices,
      pointDistances,
      totalDistance
    );
    skippedPointIndices = [];

    const cornerCurve = new QuadraticBezierCurve3(
      beforeCorner,
      corner.clone(),
      afterCorner
    );
    if (boundaryPointIndices.has(index)) {
      const [firstHalf, secondHalf] = splitQuadraticAtMidpoint(cornerCurve);
      path.add(firstHalf);
      totalDistance += firstHalf.getLength();
      pointDistances[index] = totalDistance;
      path.add(secondHalf);
      totalDistance += secondHalf.getLength();
    } else {
      path.add(cornerCurve);
      const cornerLength = cornerCurve.getLength();
      pointDistances[index] = totalDistance + cornerLength / 2;
      totalDistance += cornerLength;
    }
    cursor = afterCorner;
  }

  totalDistance = addRoundedLine(
    path,
    cursor,
    points.at(-1)?.clone() ?? cursor.clone(),
    skippedPointIndices,
    points,
    boundaryPointIndices,
    pointDistances,
    totalDistance
  );
  pointDistances[points.length - 1] = totalDistance;
  return { path, pointDistances, totalDistance };
}

function createRoundedPath(points: readonly Vector3[], maximumRadius: number) {
  return compileRoundedPositionPart(points, maximumRadius, new Set()).path;
}

function nearestDistinctPoint(
  points: readonly Vector3[],
  index: number,
  direction: -1 | 1
) {
  const point = points[index];
  for (
    let candidateIndex = index + direction;
    candidateIndex >= 0 && candidateIndex < points.length;
    candidateIndex += direction
  ) {
    const candidate = points[candidateIndex];
    if (!candidate.equals(point)) return candidate;
  }
  return null;
}

function centripetalInterval(from: Vector3, to: Vector3) {
  return Math.pow(from.distanceTo(to), CAMERA_MOTION_PATH.autoBezierAlpha);
}

function createAutomaticTangent(points: readonly Vector3[], index: number) {
  const point = points[index];
  const previous = nearestDistinctPoint(points, index, -1);
  const next = nearestDistinctPoint(points, index, 1);

  if (!previous && !next) return new Vector3();

  if (!previous) {
    const interval = centripetalInterval(point, next!);
    return next!.clone().sub(point).divideScalar(interval);
  }

  if (!next) {
    const interval = centripetalInterval(previous, point);
    return point.clone().sub(previous).divideScalar(interval);
  }

  const previousInterval = centripetalInterval(previous, point);
  const nextInterval = centripetalInterval(point, next);
  const incoming = point
    .clone()
    .sub(previous)
    .multiplyScalar(nextInterval / previousInterval);
  const outgoing = next
    .clone()
    .sub(point)
    .multiplyScalar(previousInterval / nextInterval);

  return incoming.add(outgoing).divideScalar(previousInterval + nextInterval);
}

function createAutoBezierPath(anchors: readonly Vector3[]) {
  const path = new CurvePath<Vector3>();

  if (anchors.length === 1) {
    path.add(new CubicBezierCurve3(
      anchors[0].clone(),
      anchors[0].clone(),
      anchors[0].clone(),
      anchors[0].clone()
    ));
    return path;
  }

  if (anchors.length === 2 && !anchors[0].equals(anchors[1])) {
    path.add(new CubicBezierCurve3(
      anchors[0].clone(),
      anchors[0].clone().lerp(anchors[1], 1 / 3),
      anchors[0].clone().lerp(anchors[1], 2 / 3),
      anchors[1].clone()
    ));
    return path;
  }

  const tangents = anchors.map((_anchor, index) =>
    createAutomaticTangent(anchors, index)
  );

  for (let index = 0; index < anchors.length - 1; index += 1) {
    const start = anchors[index];
    const end = anchors[index + 1];
    const interval = centripetalInterval(start, end);

    if (interval === 0) {
      path.add(new CubicBezierCurve3(
        start.clone(),
        start.clone(),
        end.clone(),
        end.clone()
      ));
      continue;
    }

    path.add(new CubicBezierCurve3(
      start.clone(),
      start.clone().addScaledVector(tangents[index], interval / 3),
      end.clone().addScaledVector(tangents[index + 1], -interval / 3),
      end.clone()
    ));
  }

  return path;
}

function compileAutoBezierPositionPart(
  anchors: readonly Vector3[]
): CompiledPositionPart {
  const path = createAutoBezierPath(anchors);
  const pointDistances = new Array<number>(anchors.length);
  pointDistances[0] = 0;
  let totalDistance = 0;

  for (let index = 0; index < anchors.length - 1; index += 1) {
    totalDistance += path.curves[index].getLength();
    pointDistances[index + 1] = totalDistance;
  }

  return { path, pointDistances, totalDistance };
}

function validatePositionPathLocation(
  location: CameraPositionPathLocation,
  parts: readonly PreparedPositionPathPart[],
  label: string
) {
  if (!Number.isInteger(location.partIndex)) {
    throw new Error(`${label} partIndex must be an integer`);
  }
  const part = parts[location.partIndex];
  if (!part) throw new Error(`${label} references an unknown position part`);
  if (!Number.isInteger(location.pointIndex)) {
    throw new Error(`${label} pointIndex must be an integer`);
  }
  if (!pointsForPart(part)[location.pointIndex]) {
    throw new Error(`${label} references an unknown position point`);
  }
}

function compilePreparedPositionPath(
  parts: readonly PreparedPositionPathPart[],
  spans: readonly CameraPositionPathSpan[]
): CompiledCameraPositionPath {
  const boundaryPointIndices = parts.map(() => new Set<number>());
  for (const [spanIndex, span] of spans.entries()) {
    validatePositionPathLocation(
      span.start,
      parts,
      `Camera position span[${spanIndex}] start`
    );
    validatePositionPathLocation(
      span.end,
      parts,
      `Camera position span[${spanIndex}] end`
    );
    boundaryPointIndices[span.start.partIndex].add(span.start.pointIndex);
    boundaryPointIndices[span.end.partIndex].add(span.end.pointIndex);
  }

  const positionPath = new CurvePath<Vector3>();
  const globalPointDistances: number[][] = [];
  let totalDistance = 0;

  for (const [partIndex, part] of parts.entries()) {
    const compiledPart =
      part.kind === 'rounded-polyline'
        ? compileRoundedPositionPart(
            part.points,
            Math.min(
              CAMERA_MOTION_PATH.positionCornerRadius,
              part.clearance ?? CAMERA_MOTION_PATH.positionCornerRadius
            ),
            boundaryPointIndices[partIndex]
          )
        : compileAutoBezierPositionPart(part.anchors);

    globalPointDistances.push(
      compiledPart.pointDistances.map((distance) => totalDistance + distance)
    );
    totalDistance += compiledPart.totalDistance;
    for (const curve of compiledPart.path.curves) positionPath.add(curve);
  }

  // Match CurvePath's own sequential accumulation exactly at the route end.
  totalDistance = positionPath.getLength();
  const finalPointDistances = globalPointDistances.at(-1);
  if (finalPointDistances) {
    finalPointDistances[finalPointDistances.length - 1] = totalDistance;
  }

  const compiledSpans = spans.map((span, spanIndex): CameraPositionDistanceSpan => {
    const startDistance =
      globalPointDistances[span.start.partIndex][span.start.pointIndex];
    const endDistance =
      globalPointDistances[span.end.partIndex][span.end.pointIndex];
    if (endDistance < startDistance) {
      throw new Error(`Camera position span[${spanIndex}] ends before it starts`);
    }
    return {
      startDistance,
      endDistance,
      length: endDistance - startDistance
    };
  });

  return { positionPath, spans: compiledSpans, totalDistance };
}

/**
 * Shared position compiler. Requested spans split cross-edge rounded primitives
 * without changing their geometry and return cumulative path distances.
 */
export function compileCameraPositionPath(
  parts: readonly CameraPositionPathPart[],
  spans: readonly CameraPositionPathSpan[] = [],
  optionalStartPosition?: Vector3Like
): CompiledCameraPositionPath {
  const prepared = preparePositionParts(parts);
  if (optionalStartPosition && countOrderedPositionPoints(prepared) > 1) {
    replacePreparedStartPosition(
      prepared,
      readVector3(optionalStartPosition, 'Camera start position')
    );
  }
  return compilePreparedPositionPath(prepared, spans);
}

/** Shared position geometry used by visitor motion, editor helpers, and picking. */
export function createCameraPositionPath(
  parts: readonly CameraPositionPathPart[],
  optionalStartPosition?: Vector3Like
) {
  return compileCameraPositionPath(parts, [], optionalStartPosition).positionPath;
}

function createMotionEdgeView(
  edge: PreparedCameraRouteEdge
): CameraMotionEdgeView | null {
  const track = edge.viewTrack;
  if (!track) return null;

  const points: CameraMotionViewPoint[] = [
    {
      progress: 0,
      cameraTarget: track.start.cameraTarget.clone(),
      fov: track.start.fov
    },
    ...track.keyframes.map((keyframe) => ({
      progress: keyframe.progress,
      cameraTarget: keyframe.cameraTarget.clone(),
      fov: keyframe.fov
    })),
    {
      progress: 1,
      cameraTarget: track.end.cameraTarget.clone(),
      fov: track.end.fov
    }
  ];
  const automaticTargetPath = edge.automaticTargetPoints
    ? createRoundedPath(
        edge.automaticTargetPoints,
        CAMERA_MOTION_PATH.targetCornerRadius
      )
    : null;
  if (automaticTargetPath) {
    automaticTargetPath.getLength();
    automaticTargetPath.getLengths();
  }

  return {
    points,
    automaticTargetPath,
    hasAuthoredKeyframes: track.keyframes.length > 0,
    guard: null,
    ...(track.framingEnvelope === undefined
      ? {}
      : { framingEnvelope: { ...track.framingEnvelope } })
  };
}

function validateAuthoredViewPoses(
  positionPath: CurvePath<Vector3>,
  totalPositionDistance: number,
  positionEdgeSpans: readonly CameraPositionEdgeDistanceSpan[],
  edges: readonly PreparedCameraRouteEdge[]
) {
  const sampledPosition = new Vector3();

  for (const [edgeIndex, edge] of edges.entries()) {
    const track = edge.viewTrack;
    const span = positionEdgeSpans[edgeIndex];
    if (!track || !span) continue;

    for (const [keyframeIndex, keyframe] of track.keyframes.entries()) {
      const distance = span.startDistance + span.length * keyframe.progress;
      const globalProgress =
        totalPositionDistance <= Number.EPSILON
          ? keyframe.progress
          : distance / totalPositionDistance;
      positionPath.getPointAt(globalProgress, sampledPosition);
      if (
        sampledPosition.distanceTo(keyframe.cameraTarget) <= CAMERA_POSE_EPSILON
      ) {
        throw new Error(
          `Camera route edge[${edgeIndex}] view keyframe[${keyframeIndex}] target must be farther than ${CAMERA_POSE_EPSILON} from its sampled position`
        );
      }
    }
  }
}

export function createCameraMotion(
  route: CameraRoute,
  optionalStartPose?: CameraPose,
  options?: CameraMotionOptions
): CameraMotion {
  const positionParts = preparePositionParts(route.positionParts);
  const positionPointCount = countOrderedPositionPoints(positionParts);
  const targets = clonePoints(route.targetPoints, 'Camera route target');
  const edges = (route.edges ?? []).map((edge, edgeIndex) =>
    prepareRouteEdge(edge, edgeIndex)
  );
  let startFov = readFov(
    route.startFov ?? edges[0]?.viewTrack?.start.fov ?? MUSEUM_CAMERA_FOV.default,
    'Camera route start fov'
  );
  const endFov = readFov(
    route.endFov ?? edges.at(-1)?.viewTrack?.end.fov ?? MUSEUM_CAMERA_FOV.default,
    'Camera route end fov'
  );

  if (targets.length !== positionPointCount) {
    throw new Error(
      'Camera route ordered position points and target points must have the same length'
    );
  }

  if (optionalStartPose && positionPointCount > 1) {
    const livePosition = readVector3(
      optionalStartPose.position,
      'Camera start position'
    );
    const liveTarget = readVector3(optionalStartPose.target, 'Camera start target');
    if (livePosition.distanceTo(liveTarget) <= CAMERA_POSE_EPSILON) {
      throw new Error(
        `Camera start target must be farther than ${CAMERA_POSE_EPSILON} from its position`
      );
    }
    replacePreparedStartPosition(positionParts, livePosition);
    startFov = readFov(optionalStartPose.fov, 'Camera start fov');
    targets[0] = liveTarget.clone();

    const firstEdge = edges[0];
    if (firstEdge?.viewTrack) {
      firstEdge.viewTrack.start.cameraTarget.copy(liveTarget);
      firstEdge.viewTrack.start.fov = startFov;
    }
    if (firstEdge?.automaticTargetPoints?.[0]) {
      firstEdge.automaticTargetPoints[0].copy(liveTarget);
    }
  }

  const compiledPosition = compilePreparedPositionPath(
    positionParts,
    edges.map((edge) => edge.positionSpan)
  );
  const positionPath = compiledPosition.positionPath;
  const targetPath = createRoundedPath(targets, CAMERA_MOTION_PATH.targetCornerRadius);
  const positionLength = compiledPosition.totalDistance;
  const positionEdgeSpans = edges.map(
    (edge, index): CameraPositionEdgeDistanceSpan => ({
      ...edge,
      positionSpan: {
        start: { ...edge.positionSpan.start },
        end: { ...edge.positionSpan.end }
      },
      ...compiledPosition.spans[index]
    })
  );
  validateAuthoredViewPoses(
    positionPath,
    positionLength,
    positionEdgeSpans,
    edges
  );
  const edgeViews = edges.map(createMotionEdgeView);
  const usesLegacyTargetPath = !edgeViews.some(
    (edgeView) => edgeView?.hasAuthoredKeyframes
  );

  // Curve.getPointAt() lazily builds arc-length tables. Prime both paths here so
  // frame-by-frame sampling only writes into the caller's reusable vectors.
  positionPath.getLengths();
  targetPath.getLength();
  targetPath.getLengths();

  const durationSeconds = resolveCameraMotionDuration(
    options?.durationSeconds,
    positionLength,
    positionPointCount
  );
  const easing = resolveCameraMotionEasing(options?.easing);

  for (const [edgeIndex, edgeView] of edgeViews.entries()) {
    if (!edgeView?.hasAuthoredKeyframes || !edgeView.framingEnvelope) continue;
    edgeView.guard = compileCameraFramingGuard({
      edgeView,
      edgeSpan: positionEdgeSpans[edgeIndex],
      positionPath,
      targetPath,
      totalPositionDistance: positionLength,
      durationSeconds,
      easing
    });
  }

  return {
    positionPath,
    targetPath,
    positionEdgeSpans,
    edgeViews,
    totalPositionDistance: positionLength,
    usesLegacyTargetPath,
    startFov,
    endFov,
    durationSeconds,
    easing
  };
}

export function createCameraMotionSample(): CameraMotionSample {
  return {
    position: new Vector3(),
    target: new Vector3(),
    fov: MUSEUM_CAMERA_FOV.default
  };
}

function smootherstep01(progress: number) {
  return (
    progress *
    progress *
    progress *
    (progress * (progress * 6 - 15) + 10)
  );
}

export function smootherstepRamp(
  progress: number,
  start: number,
  end: number,
  rising: boolean
) {
  if (![progress, start, end].every(Number.isFinite)) return rising ? 0 : 1;
  if (end <= start) {
    if (rising) return progress < start ? 0 : 1;
    return progress <= start ? 1 : 0;
  }
  const rampProgress = MathUtils.clamp((progress - start) / (end - start), 0, 1);
  const weight = smootherstep01(rampProgress);
  return rising ? weight : 1 - weight;
}

export function sampleFramingEnvelopeWeight(
  envelope: RuntimeCameraFramingEnvelope,
  progress: number
) {
  const enterWeight = smootherstepRamp(
    progress,
    envelope.enterStart,
    envelope.enterEnd,
    true
  );
  const exitWeight = smootherstepRamp(
    progress,
    envelope.exitStart,
    envelope.exitEnd,
    false
  );
  return MathUtils.clamp(enterWeight * exitWeight, 0, 1);
}

function inverseSmootherstep01(progress: number) {
  const target = MathUtils.clamp(progress, 0, 1);
  if (target === 0 || target === 1) return target;
  let lower = 0;
  let upper = 1;
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const midpoint = (lower + upper) / 2;
    if (smootherstep01(midpoint) < target) lower = midpoint;
    else upper = midpoint;
  }
  return (lower + upper) / 2;
}

function smoothstep(progress: number) {
  return progress * progress * (3 - 2 * progress);
}

function inverseSmoothstep(progress: number) {
  const target = MathUtils.clamp(progress, 0, 1);
  if (target === 0 || target === 1) return target;
  let lower = 0;
  let upper = 1;
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const midpoint = (lower + upper) / 2;
    if (smoothstep(midpoint) < target) lower = midpoint;
    else upper = midpoint;
  }
  return (lower + upper) / 2;
}

/** Phase 3.7 easing helpers. Linear-affine and polynomial forms use closed-form inverses; smoothstep relies on bisection. */
export function cameraApplyEasing(
  easing: CameraEasing,
  progress: number
): number {
  const clamped = MathUtils.clamp(progress, 0, 1);
  switch (easing) {
    case 'linear':
      return clamped;
    case 'smoothstep':
    case 'ease-in-out':
      return smoothstep(clamped);
    case 'smootherstep':
      return smootherstep01(clamped);
    case 'ease-in':
      return clamped * clamped;
    case 'ease-out':
      return 1 - (1 - clamped) * (1 - clamped);
  }
}

export function cameraInverseEasing(
  easing: CameraEasing,
  progress: number
): number {
  const clamped = MathUtils.clamp(progress, 0, 1);
  switch (easing) {
    case 'linear':
      return clamped;
    case 'smoothstep':
    case 'ease-in-out':
      return inverseSmoothstep(clamped);
    case 'smootherstep':
      return inverseSmootherstep01(clamped);
    case 'ease-in':
      return Math.sqrt(clamped);
    case 'ease-out':
      return 1 - Math.sqrt(1 - clamped);
  }
}

export function resolveCameraMotionEasing(
  easing: CameraEasing | undefined
): CameraEasing {
  if (easing === undefined) return CAMERA_MOTION_DEFAULT_EASING;
  return easing === 'ease-in-out' ? 'smoothstep' : easing;
}

export function resolveCameraMotionDuration(
  overridingDuration: number | undefined,
  positionLength: number,
  positionPointCount: number
): number {
  if (typeof overridingDuration === 'number' && Number.isFinite(overridingDuration) && overridingDuration > 0) {
    return overridingDuration;
  }
  if (positionPointCount === 1) return 0;
  return MathUtils.clamp(
    positionLength / CAMERA_MOTION_TIMING.unitsPerSecond,
    CAMERA_MOTION_TIMING.minDurationSeconds,
    CAMERA_MOTION_TIMING.maxDurationSeconds
  );
}

/** Map exact edge-local distance progress back to raw transition/playhead progress. */
export function cameraMotionProgressAtEdgeProgress(
  motion: CameraMotion,
  edgeIndex: number,
  edgeProgress: number
) {
  if (!Number.isInteger(edgeIndex) || edgeIndex < 0 || edgeIndex >= motion.positionEdgeSpans.length) {
    throw new Error('Camera motion edge index is out of range');
  }
  if (!Number.isFinite(edgeProgress)) {
    throw new Error('Camera motion edge progress must be finite');
  }
  const span = motion.positionEdgeSpans[edgeIndex];
  const localProgress = MathUtils.clamp(edgeProgress, 0, 1);
  if (motion.totalPositionDistance <= Number.EPSILON) {
    return MathUtils.clamp(
      (edgeIndex + localProgress) / motion.positionEdgeSpans.length,
      0,
      1
    );
  }
  const distance = span.startDistance + span.length * localProgress;
  return cameraInverseEasing(motion.easing, distance / motion.totalPositionDistance);
}

/** Map raw transition/playhead progress to exact edge-local distance progress. */
export function cameraMotionEdgeProgressAtProgress(
  motion: CameraMotion,
  edgeIndex: number,
  progress: number
) {
  if (!Number.isInteger(edgeIndex) || edgeIndex < 0 || edgeIndex >= motion.positionEdgeSpans.length) {
    throw new Error('Camera motion edge index is out of range');
  }
  if (!Number.isFinite(progress)) {
    throw new Error('Camera motion progress must be finite');
  }
  return getEdgeLocalProgress(
    motion,
    edgeIndex,
    cameraApplyEasing(motion.easing, MathUtils.clamp(progress, 0, 1))
  );
}

function findActiveEdgeIndex(motion: CameraMotion, easedProgress: number) {
  const spans = motion.positionEdgeSpans;
  if (spans.length === 0) return -1;
  if (easedProgress >= 1) return spans.length - 1;

  if (motion.totalPositionDistance <= Number.EPSILON) {
    return Math.min(spans.length - 1, Math.floor(easedProgress * spans.length));
  }

  const distance = easedProgress * motion.totalPositionDistance;
  for (let index = 0; index < spans.length; index += 1) {
    const span = spans[index];
    if (span.length <= Number.EPSILON) continue;
    if (distance < span.endDistance || index === spans.length - 1) return index;
  }
  return spans.length - 1;
}

function getEdgeLocalProgress(
  motion: CameraMotion,
  edgeIndex: number,
  easedProgress: number
) {
  const span = motion.positionEdgeSpans[edgeIndex];
  if (!span) return easedProgress;
  if (motion.totalPositionDistance <= Number.EPSILON) {
    const scaledProgress = easedProgress * motion.positionEdgeSpans.length;
    return MathUtils.clamp(scaledProgress - edgeIndex, 0, 1);
  }
  if (span.length <= Number.EPSILON) return easedProgress >= 1 ? 1 : 0;
  const distance = easedProgress * motion.totalPositionDistance;
  return MathUtils.clamp(
    (distance - span.startDistance) / span.length,
    0,
    1
  );
}

function sampleAuthoredView(
  edgeView: CameraMotionEdgeView,
  localProgress: number,
  easing: CameraEasing,
  output: CameraMotionSample
) {
  const points = edgeView.points;
  let endIndex = 1;
  while (
    endIndex < points.length - 1 &&
    localProgress > points[endIndex].progress
  ) {
    endIndex += 1;
  }
  const start = points[endIndex - 1];
  const end = points[endIndex];
  const intervalLength = end.progress - start.progress;
  const intervalProgress =
    intervalLength <= Number.EPSILON
      ? 1
      : MathUtils.clamp(
          (localProgress - start.progress) / intervalLength,
          0,
          1
        );
  const easedIntervalProgress = cameraApplyEasing(easing, intervalProgress);
  output.target
    .copy(start.cameraTarget)
    .lerp(end.cameraTarget, easedIntervalProgress);
  output.fov = MathUtils.lerp(start.fov, end.fov, easedIntervalProgress);
}

type CameraFramingGuardCompileContext = {
  edgeView: CameraMotionEdgeView;
  edgeSpan: CameraPositionEdgeDistanceSpan;
  positionPath: CurvePath<Vector3>;
  targetPath: CurvePath<Vector3>;
  totalPositionDistance: number;
  durationSeconds: number;
  easing: CameraEasing;
};

type RawCameraFramingGuardSample = {
  progress: number;
  timeSeconds: number;
  position: Vector3;
  target: Vector3;
  distance: number;
  direction: Vector3;
};

function edgeGlobalDistanceProgress(
  context: CameraFramingGuardCompileContext,
  progress: number
) {
  if (context.totalPositionDistance <= Number.EPSILON) return progress;
  return (
    context.edgeSpan.startDistance + context.edgeSpan.length * progress
  ) / context.totalPositionDistance;
}

function sampleRawCameraFraming(
  context: CameraFramingGuardCompileContext,
  progress: number
): RawCameraFramingGuardSample {
  const globalProgress = edgeGlobalDistanceProgress(context, progress);
  const timeSeconds =
    cameraInverseEasing(context.easing, globalProgress) *
    context.durationSeconds;
  const position = context.positionPath.getPointAt(globalProgress, new Vector3());
  const target = new Vector3();
  const edgeView = context.edgeView;
  if (edgeView.automaticTargetPath) {
    edgeView.automaticTargetPath.getPointAt(progress, target);
  } else {
    context.targetPath.getPointAt(globalProgress, target);
  }

  const automaticTargetX = target.x;
  const automaticTargetY = target.y;
  const automaticTargetZ = target.z;
  const start = edgeView.points[0];
  const end = edgeView.points.at(-1)!;
  const automaticFov = MathUtils.lerp(
    start.fov,
    end.fov,
    cameraApplyEasing(context.easing, progress)
  );
  const authored = { position, target, fov: automaticFov };
  sampleAuthoredView(edgeView, progress, context.easing, authored);
  const weight = sampleFramingEnvelopeWeight(edgeView.framingEnvelope!, progress);
  target.set(
    MathUtils.lerp(automaticTargetX, target.x, weight),
    MathUtils.lerp(automaticTargetY, target.y, weight),
    MathUtils.lerp(automaticTargetZ, target.z, weight)
  );
  const direction = target.clone().sub(position);
  const distance = direction.length();
  if (distance > CAMERA_FRAMING_GUARD_POLICY.directionEpsilonMeters) {
    direction.multiplyScalar(1 / distance);
  }
  return { progress, timeSeconds, position, target, distance, direction };
}

function collectAdaptiveFramingSamples(
  context: CameraFramingGuardCompileContext
) {
  const progressValues = new Set<number>();
  const envelope = context.edgeView.framingEnvelope!;
  for (
    let segment = 0;
    segment <= CAMERA_FRAMING_GUARD_POLICY.baseSampleSegments;
    segment += 1
  ) {
    progressValues.add(
      segment / CAMERA_FRAMING_GUARD_POLICY.baseSampleSegments
    );
  }
  for (const progress of [
    envelope.enterStart,
    envelope.enterEnd,
    envelope.exitStart,
    envelope.exitEnd,
    ...context.edgeView.points.map((point) => point.progress)
  ]) {
    progressValues.add(MathUtils.clamp(progress, 0, 1));
  }

  const initial = [...progressValues]
    .sort((left, right) => left - right)
    .map((progress) => sampleRawCameraFraming(context, progress));
  const refined: RawCameraFramingGuardSample[] = [initial[0]];

  function refine(
    start: RawCameraFramingGuardSample,
    end: RawCameraFramingGuardSample,
    depth: number
  ) {
    const midpointProgress = (start.progress + end.progress) / 2;
    const midpoint = sampleRawCameraFraming(context, midpointProgress);
    const endpointsHaveDirection =
      start.distance > CAMERA_FRAMING_GUARD_POLICY.directionEpsilonMeters &&
      end.distance > CAMERA_FRAMING_GUARD_POLICY.directionEpsilonMeters;
    const angularDelta = endpointsHaveDirection
      ? start.direction.angleTo(end.direction)
      : Math.PI;
    const distanceCurvature = Math.abs(
      midpoint.distance - (start.distance + end.distance) / 2
    );
    const shouldRefine =
      depth < CAMERA_FRAMING_GUARD_POLICY.maxAdaptiveDepth &&
      (angularDelta >
        CAMERA_FRAMING_GUARD_POLICY.maxSampleAngularDeltaRadians ||
        distanceCurvature >
          CAMERA_FRAMING_GUARD_POLICY.maxTargetDistanceCurvatureMeters ||
        midpoint.distance <
          CAMERA_FRAMING_GUARD_POLICY.targetStandoffShoulderMeters);
    if (shouldRefine) {
      refine(start, midpoint, depth + 1);
      refine(midpoint, end, depth + 1);
    } else {
      refined.push(end);
    }
  }

  for (let index = 1; index < initial.length; index += 1) {
    refine(initial[index - 1], initial[index], 0);
  }
  return refined;
}

function normalizedDirectionLerp(
  start: Vector3,
  end: Vector3,
  progress: number
) {
  const direction = start.clone().lerp(end, progress);
  if (
    direction.lengthSq() <=
    CAMERA_FRAMING_GUARD_POLICY.directionEpsilonMeters ** 2
  ) {
    return start.clone();
  }
  return direction.normalize();
}

function orthogonalDirectionReference(direction: Vector3) {
  const absX = Math.abs(direction.x);
  const absY = Math.abs(direction.y);
  const absZ = Math.abs(direction.z);
  if (absX <= absY && absX <= absZ) return new Vector3(1, 0, 0);
  if (absY <= absZ) return new Vector3(0, 1, 0);
  return new Vector3(0, 0, 1);
}

/**
 * Deterministic great-circle path for antipodal directions where both slerp
 * and normalized linear interpolation degenerate (their midpoint is the zero
 * vector). Sweeps from `start` through a fixed orthogonal reference to
 * `-start`, which is within the linear-dot threshold of `end`.
 */
function antipodalDirectionInterpolate(
  start: Vector3,
  progress: number,
  output: Vector3
) {
  const orth = start
    .clone()
    .cross(orthogonalDirectionReference(start))
    .normalize();
  const angle = Math.PI * progress;
  output
    .copy(start)
    .multiplyScalar(Math.cos(angle))
    .addScaledVector(orth, Math.sin(angle));
}

function sphericalDirectionLerp(
  start: Vector3,
  end: Vector3,
  progress: number
) {
  const dot = MathUtils.clamp(start.dot(end), -1, 1);
  if (dot < -CAMERA_FRAMING_GUARD_POLICY.sphericalLerpLinearDotThreshold) {
    const output = new Vector3();
    antipodalDirectionInterpolate(start, progress, output);
    return output;
  }
  if (dot > CAMERA_FRAMING_GUARD_POLICY.sphericalLerpLinearDotThreshold) {
    return normalizedDirectionLerp(start, end, progress);
  }
  const angle = Math.acos(dot);
  const sinAngle = Math.sin(angle);
  return start.clone()
    .multiplyScalar(Math.sin((1 - progress) * angle) / sinAngle)
    .addScaledVector(end, Math.sin(progress * angle) / sinAngle)
    .normalize();
}

function continueSingularDirections(samples: RawCameraFramingGuardSample[]) {
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (sample.distance > CAMERA_FRAMING_GUARD_POLICY.directionEpsilonMeters) {
      continue;
    }
    let previousIndex = index - 1;
    while (
      previousIndex >= 0 &&
      samples[previousIndex].distance <=
        CAMERA_FRAMING_GUARD_POLICY.directionEpsilonMeters
    ) {
      previousIndex -= 1;
    }
    let nextIndex = index + 1;
    while (
      nextIndex < samples.length &&
      samples[nextIndex].distance <=
        CAMERA_FRAMING_GUARD_POLICY.directionEpsilonMeters
    ) {
      nextIndex += 1;
    }
    if (previousIndex >= 0 && nextIndex < samples.length) {
      const interval = samples[nextIndex].progress - samples[previousIndex].progress;
      const progress = interval <= Number.EPSILON
        ? 0
        : (sample.progress - samples[previousIndex].progress) / interval;
      sample.direction.copy(
        normalizedDirectionLerp(
          samples[previousIndex].direction,
          samples[nextIndex].direction,
          progress
        )
      );
    } else if (previousIndex >= 0) {
      sample.direction.copy(samples[previousIndex].direction);
    } else if (nextIndex < samples.length) {
      sample.direction.copy(samples[nextIndex].direction);
    }
  }
}

function limitFramingAngularRate(
  samples: RawCameraFramingGuardSample[],
  envelope: RuntimeCameraFramingEnvelope
) {
  const cumulativeAngles = [0];
  for (let index = 1; index < samples.length; index += 1) {
    cumulativeAngles.push(
      cumulativeAngles[index - 1] +
      samples[index - 1].direction.angleTo(samples[index].direction)
    );
  }

  // The guard may only correct gaze where the envelope weight is positive.
  // Outside the active interval raw directions are pinned so automatic
  // framing is preserved exactly.
  const activeStart = MathUtils.clamp(envelope.enterStart, 0, 1);
  const activeEnd = MathUtils.clamp(envelope.exitEnd, 0, 1);
  let activeStartIndex = 0;
  while (
    activeStartIndex < samples.length - 1 &&
    samples[activeStartIndex].progress < activeStart
  ) {
    activeStartIndex += 1;
  }
  let activeEndIndex = samples.length - 1;
  while (activeEndIndex > 0 && samples[activeEndIndex].progress > activeEnd) {
    activeEndIndex -= 1;
  }
  if (activeEndIndex <= activeStartIndex) {
    return {
      directions: samples.map((sample) => sample.direction),
      changed: false
    };
  }

  const startDirection = samples[activeStartIndex].direction;
  const endDirection = samples[activeEndIndex].direction;
  const intervalAngle =
    cumulativeAngles[activeEndIndex] - cumulativeAngles[activeStartIndex];
  const intervalStartTimeSeconds = samples[activeStartIndex].timeSeconds;
  const intervalEndTimeSeconds = samples[activeEndIndex].timeSeconds;
  const intervalCapacity =
    CAMERA_FRAMING_GUARD_POLICY.maxAngularRateRadiansPerSecond *
    (intervalEndTimeSeconds - intervalStartTimeSeconds) /
    CAMERA_FRAMING_GUARD_POLICY.angularInterpolationPeakRateFactor;
  if (intervalAngle > intervalCapacity) {
    return {
      directions: samples.map((sample, index) => {
        if (index <= activeStartIndex || index >= activeEndIndex) {
          return sample.direction;
        }
        const intervalProgress =
          (sample.progress - activeStart) / (activeEnd - activeStart);
        return sphericalDirectionLerp(
          startDirection,
          endDirection,
          smootherstep01(intervalProgress)
        );
      }),
      changed: true
    };
  }

  const correctedAngles = cumulativeAngles.slice();
  let changed = false;
  for (let index = activeStartIndex + 1; index < activeEndIndex; index += 1) {
    const stepCapacity =
      CAMERA_FRAMING_GUARD_POLICY.maxAngularRateRadiansPerSecond *
      (samples[index].timeSeconds - samples[index - 1].timeSeconds) /
      CAMERA_FRAMING_GUARD_POLICY.angularInterpolationPeakRateFactor;
    const remainingCapacity =
      CAMERA_FRAMING_GUARD_POLICY.maxAngularRateRadiansPerSecond *
      (intervalEndTimeSeconds - samples[index].timeSeconds) /
      CAMERA_FRAMING_GUARD_POLICY.angularInterpolationPeakRateFactor;
    const relativeRawAngle =
      cumulativeAngles[index] - cumulativeAngles[activeStartIndex];
    const lowerBound = Math.max(
      correctedAngles[index - 1] - cumulativeAngles[activeStartIndex],
      intervalAngle - remainingCapacity
    );
    const upperBound =
      correctedAngles[index - 1] -
      cumulativeAngles[activeStartIndex] +
      stepCapacity;
    const correctedRelativeAngle = MathUtils.clamp(
      relativeRawAngle,
      lowerBound,
      upperBound
    );
    correctedAngles[index] =
      cumulativeAngles[activeStartIndex] + correctedRelativeAngle;
    if (
      Math.abs(correctedAngles[index] - cumulativeAngles[index]) >
      Number.EPSILON
    ) {
      changed = true;
    }
  }

  const corrected = correctedAngles.map((correctedAngle, index) => {
    if (index <= activeStartIndex || index >= activeEndIndex) {
      return samples[index].direction;
    }
    let endIndex = 1;
    while (
      endIndex < cumulativeAngles.length - 1 &&
      correctedAngle > cumulativeAngles[endIndex]
    ) {
      endIndex += 1;
    }
    const startAngle = cumulativeAngles[endIndex - 1];
    const endAngle = cumulativeAngles[endIndex];
    const intervalAngle = endAngle - startAngle;
    const intervalProgress = intervalAngle <= Number.EPSILON
      ? 1
      : (correctedAngle - startAngle) / intervalAngle;
    return sphericalDirectionLerp(
      samples[endIndex - 1].direction,
      samples[endIndex].direction,
      intervalProgress
    );
  });
  return { directions: corrected, changed };
}

function compileDoubleWhipBypass(
  context: CameraFramingGuardCompileContext,
  samples: RawCameraFramingGuardSample[]
): CameraFramingBypass | null {
  const envelope = context.edgeView.framingEnvelope!;
  if (envelope.exitEnd >= 1) return null;
  const exitSamples = samples.filter(
    (sample) => sample.progress >= envelope.exitStart
  );
  if (exitSamples.length < 2) return null;
  const startDirection = exitSamples[0].direction;
  const endDirection = exitSamples.at(-1)!.direction;
  let angularPath = 0;
  let maxOffAxis = 0;
  for (let index = 0; index < exitSamples.length; index += 1) {
    if (index > 0) {
      angularPath += exitSamples[index - 1].direction.angleTo(
        exitSamples[index].direction
      );
    }
    const directProgress =
      (exitSamples[index].progress - envelope.exitStart) /
      (1 - envelope.exitStart);
    const directDirection = normalizedDirectionLerp(
      startDirection,
      endDirection,
      directProgress
    );
    maxOffAxis = Math.max(
      maxOffAxis,
      directDirection.angleTo(exitSamples[index].direction)
    );
  }
  const directAngle = startDirection.angleTo(endDirection);
  const remainingSeconds =
    exitSamples.at(-1)!.timeSeconds - exitSamples[0].timeSeconds;
  const angularRate = remainingSeconds <= Number.EPSILON
    ? Number.POSITIVE_INFINITY
    : angularPath / remainingSeconds;
  if (
    maxOffAxis <= CAMERA_FRAMING_GUARD_POLICY.doubleWhipOffAxisRadians ||
    angularPath - directAngle <=
      CAMERA_FRAMING_GUARD_POLICY.doubleWhipPathExcessRadians ||
    angularRate <=
      CAMERA_FRAMING_GUARD_POLICY.maxAngularRateRadiansPerSecond
  ) {
    return null;
  }

  const authored = createCameraMotionSample();
  sampleAuthoredView(
    context.edgeView,
    envelope.exitStart,
    context.easing,
    authored
  );
  return {
    startProgress: envelope.exitStart,
    startTarget: authored.target.clone(),
    endTarget: context.edgeView.points.at(-1)!.cameraTarget.clone()
  };
}

function compileCameraFramingGuard(
  context: CameraFramingGuardCompileContext
): CameraFramingGuard | null {
  const samples = collectAdaptiveFramingSamples(context);
  const hasStandoffDanger = samples.some(
    (sample) =>
      sample.distance <
      CAMERA_FRAMING_GUARD_POLICY.targetStandoffShoulderMeters
  );
  continueSingularDirections(samples);
  const limited = limitFramingAngularRate(
    samples,
    context.edgeView.framingEnvelope!
  );
  const bypass = compileDoubleWhipBypass(context, samples);
  if (!hasStandoffDanger && !limited.changed && !bypass) return null;
  return {
    directions: samples.map((sample, index) => ({
      progress: sample.progress,
      directionX: limited.directions[index].x,
      directionY: limited.directions[index].y,
      directionZ: limited.directions[index].z
    })),
    limitsAngularRate: limited.changed,
    bypass
  };
}

function sampleCompiledGuardDirection(
  guard: CameraFramingGuard,
  progress: number,
  output: Vector3
) {
  const samples = guard.directions;
  let endIndex = 1;
  while (
    endIndex < samples.length - 1 &&
    progress > samples[endIndex].progress
  ) {
    endIndex += 1;
  }
  const start = samples[endIndex - 1];
  const end = samples[endIndex];
  const interval = end.progress - start.progress;
  const intervalProgress = interval <= Number.EPSILON
    ? 1
    : MathUtils.clamp((progress - start.progress) / interval, 0, 1);
  const easedIntervalProgress = smootherstep01(intervalProgress);
  const dot = MathUtils.clamp(
    start.directionX * end.directionX +
      start.directionY * end.directionY +
      start.directionZ * end.directionZ,
    -1,
    1
  );
  if (dot < -CAMERA_FRAMING_GUARD_POLICY.sphericalLerpLinearDotThreshold) {
    antipodalDirectionInterpolate(
      new Vector3(start.directionX, start.directionY, start.directionZ),
      easedIntervalProgress,
      output
    );
  } else if (
    dot >
    CAMERA_FRAMING_GUARD_POLICY.sphericalLerpLinearDotThreshold
  ) {
    output.set(
      MathUtils.lerp(start.directionX, end.directionX, easedIntervalProgress),
      MathUtils.lerp(start.directionY, end.directionY, easedIntervalProgress),
      MathUtils.lerp(start.directionZ, end.directionZ, easedIntervalProgress)
    );
  } else {
    const angle = Math.acos(dot);
    const sinAngle = Math.sin(angle);
    const startWeight =
      Math.sin((1 - easedIntervalProgress) * angle) / sinAngle;
    const endWeight = Math.sin(easedIntervalProgress * angle) / sinAngle;
    output.set(
      start.directionX * startWeight + end.directionX * endWeight,
      start.directionY * startWeight + end.directionY * endWeight,
      start.directionZ * startWeight + end.directionZ * endWeight
    );
  }
  const lengthSquared = output.lengthSq();
  if (
    lengthSquared >
    CAMERA_FRAMING_GUARD_POLICY.directionEpsilonMeters ** 2
  ) {
    output.multiplyScalar(1 / Math.sqrt(lengthSquared));
  }
}

function applyCameraFramingGuard(
  guard: CameraFramingGuard,
  progress: number,
  output: CameraMotionSample
) {
  if (progress <= 0 || progress >= 1) return;
  const bypass = guard.bypass;
  const bypassApplied = bypass !== null && progress >= bypass.startProgress;
  if (bypass && bypassApplied) {
    const interval = 1 - bypass.startProgress;
    const bypassProgress = interval <= Number.EPSILON
      ? 1
      : smootherstep01(
          MathUtils.clamp((progress - bypass.startProgress) / interval, 0, 1)
        );
    output.target.copy(bypass.startTarget).lerp(bypass.endTarget, bypassProgress);
  }

  const targetX = output.target.x - output.position.x;
  const targetY = output.target.y - output.position.y;
  const targetZ = output.target.z - output.position.z;
  const rawDistance = Math.hypot(targetX, targetY, targetZ);
  const needsStandoff =
    rawDistance < CAMERA_FRAMING_GUARD_POLICY.targetStandoffShoulderMeters;
  if ((!guard.limitsAngularRate || bypassApplied) && !needsStandoff) return;

  if (
    (guard.limitsAngularRate && !bypassApplied) ||
    rawDistance <= CAMERA_FRAMING_GUARD_POLICY.directionEpsilonMeters
  ) {
    sampleCompiledGuardDirection(guard, progress, output.target);
  } else {
    output.target.set(targetX / rawDistance, targetY / rawDistance, targetZ / rawDistance);
  }
  const minDistance = CAMERA_FRAMING_GUARD_POLICY.minTargetStandoffMeters;
  const shoulderDistance =
    CAMERA_FRAMING_GUARD_POLICY.targetStandoffShoulderMeters;
  let correctedDistance = rawDistance;
  if (rawDistance <= minDistance) {
    correctedDistance = minDistance;
  } else if (rawDistance < shoulderDistance) {
    const shoulderProgress =
      (rawDistance - minDistance) / (shoulderDistance - minDistance);
    correctedDistance = MathUtils.lerp(
      minDistance,
      rawDistance,
      smootherstep01(shoulderProgress)
    );
  }
  output.target.multiplyScalar(correctedDistance).add(output.position);
}

export function sampleCameraMotion(
  motion: CameraMotion,
  progress: number,
  output: CameraMotionSample
): void {
  if (!Number.isFinite(progress)) {
    throw new Error('Camera motion progress must be finite');
  }

  const clampedProgress = MathUtils.clamp(progress, 0, 1);
  const easedProgress = cameraApplyEasing(motion.easing, clampedProgress);

  motion.positionPath.getPointAt(easedProgress, output.position);

  const edgeIndex = findActiveEdgeIndex(motion, easedProgress);
  const edgeView = edgeIndex < 0 ? null : motion.edgeViews[edgeIndex];
  const localProgress = getEdgeLocalProgress(motion, edgeIndex, easedProgress);

  if (motion.usesLegacyTargetPath || !edgeView) {
    motion.targetPath.getPointAt(easedProgress, output.target);
  } else if (edgeView.hasAuthoredKeyframes) {
    if (!edgeView.framingEnvelope) {
      sampleAuthoredView(edgeView, localProgress, motion.easing, output);
      return;
    }
    if (edgeView.automaticTargetPath) {
      edgeView.automaticTargetPath.getPointAt(localProgress, output.target);
    } else {
      motion.targetPath.getPointAt(easedProgress, output.target);
    }
    const automaticTargetX = output.target.x;
    const automaticTargetY = output.target.y;
    const automaticTargetZ = output.target.z;
    const start = edgeView.points[0];
    const end = edgeView.points.at(-1)!;
    const automaticFov = MathUtils.lerp(
      start.fov,
      end.fov,
      cameraApplyEasing(motion.easing, localProgress)
    );
    sampleAuthoredView(edgeView, localProgress, motion.easing, output);
    const weight = sampleFramingEnvelopeWeight(
      edgeView.framingEnvelope,
      localProgress
    );
    output.target.set(
      MathUtils.lerp(automaticTargetX, output.target.x, weight),
      MathUtils.lerp(automaticTargetY, output.target.y, weight),
      MathUtils.lerp(automaticTargetZ, output.target.z, weight)
    );
    output.fov = MathUtils.lerp(automaticFov, output.fov, weight);
    if (edgeView.guard) {
      applyCameraFramingGuard(edgeView.guard, localProgress, output);
    }
    return;
  } else if (edgeView.automaticTargetPath) {
    edgeView.automaticTargetPath.getPointAt(localProgress, output.target);
  } else {
    motion.targetPath.getPointAt(easedProgress, output.target);
  }

  if (edgeView) {
    const start = edgeView.points[0];
    const end = edgeView.points.at(-1)!;
    output.fov = MathUtils.lerp(
      start.fov,
      end.fov,
      cameraApplyEasing(motion.easing, localProgress)
    );
  } else {
    output.fov = MathUtils.lerp(
      motion.startFov,
      motion.endFov,
      cameraApplyEasing(motion.easing, easedProgress)
    );
  }
}
