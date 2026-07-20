import {
  CubicBezierCurve3,
  CurvePath,
  LineCurve3,
  MathUtils,
  QuadraticBezierCurve3,
  Vector3
} from 'three';
import {
  MUSEUM_CAMERA_FOV,
  type CameraConnectionDirection
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

export const CAMERA_MOTION_PATH = {
  positionCornerRadius: 0.42,
  targetCornerRadius: 0.65,
  cornerTrimRatio: 0.2,
  autoBezierAlpha: 0.5
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
      end: prepareRouteView(edge.viewTrack.end, `${label} end view`)
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
    hasAuthoredKeyframes: track.keyframes.length > 0
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
  optionalStartPose?: CameraPose
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

  const durationSeconds =
    positionPointCount === 1
      ? 0
      : MathUtils.clamp(
          positionLength / CAMERA_MOTION_TIMING.unitsPerSecond,
          CAMERA_MOTION_TIMING.minDurationSeconds,
          CAMERA_MOTION_TIMING.maxDurationSeconds
        );

  return {
    positionPath,
    targetPath,
    positionEdgeSpans,
    edgeViews,
    totalPositionDistance: positionLength,
    usesLegacyTargetPath,
    startFov,
    endFov,
    durationSeconds
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
  return inverseSmootherstep01(distance / motion.totalPositionDistance);
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
  const easedIntervalProgress = smootherstep01(intervalProgress);
  output.target
    .copy(start.cameraTarget)
    .lerp(end.cameraTarget, easedIntervalProgress);
  output.fov = MathUtils.lerp(start.fov, end.fov, easedIntervalProgress);
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
  const easedProgress = smootherstep01(clampedProgress);

  motion.positionPath.getPointAt(easedProgress, output.position);

  const edgeIndex = findActiveEdgeIndex(motion, easedProgress);
  const edgeView = edgeIndex < 0 ? null : motion.edgeViews[edgeIndex];
  const localProgress = getEdgeLocalProgress(motion, edgeIndex, easedProgress);

  if (motion.usesLegacyTargetPath || !edgeView) {
    motion.targetPath.getPointAt(easedProgress, output.target);
  } else if (edgeView.hasAuthoredKeyframes) {
    sampleAuthoredView(edgeView, localProgress, output);
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
      smootherstep01(localProgress)
    );
  } else {
    output.fov = MathUtils.lerp(
      motion.startFov,
      motion.endFov,
      smootherstep01(easedProgress)
    );
  }
}
