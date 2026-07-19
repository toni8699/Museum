import {
  CubicBezierCurve3,
  CurvePath,
  LineCurve3,
  MathUtils,
  QuadraticBezierCurve3,
  Vector3
} from 'three';

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

export type CameraRoute = {
  positionParts: readonly CameraPositionPathPart[];
  targetPoints: readonly Vector3Like[];
};

export type CameraPose = {
  position: Vector3Like;
  target: Vector3Like;
};

export type CameraMotion = {
  readonly positionPath: CurvePath<Vector3>;
  readonly targetPath: CurvePath<Vector3>;
  readonly durationSeconds: number;
};

export const VISITOR_CAMERA_PROJECTION = {
  fov: 54,
  near: 0.1,
  far: 90
} as const;

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

function clonePoints(points: readonly Vector3Like[], label: string) {
  return points.map((point, index) => readVector3(point, `${label}[${index}]`));
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

function createRoundedPath(points: readonly Vector3[], maximumRadius: number) {
  const path = new CurvePath<Vector3>();

  if (points.length === 1) {
    path.add(new LineCurve3(points[0].clone(), points[0].clone()));
    return path;
  }

  let cursor = points[0].clone();

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

    if (trim < 0.01) continue;

    const beforeCorner = corner.clone().addScaledVector(incoming.normalize(), -trim);
    const afterCorner = corner.clone().addScaledVector(outgoing.normalize(), trim);
    path.add(new LineCurve3(cursor, beforeCorner));
    path.add(new QuadraticBezierCurve3(beforeCorner, corner.clone(), afterCorner));
    cursor = afterCorner;
  }

  path.add(new LineCurve3(cursor, points.at(-1)?.clone() ?? cursor.clone()));
  return path;
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

function compilePositionPath(parts: readonly PreparedPositionPathPart[]) {
  const path = new CurvePath<Vector3>();

  for (const part of parts) {
    const partPath =
      part.kind === 'rounded-polyline'
        ? createRoundedPath(
            part.points,
            Math.min(
              CAMERA_MOTION_PATH.positionCornerRadius,
              part.clearance ?? CAMERA_MOTION_PATH.positionCornerRadius
            )
          )
        : createAutoBezierPath(part.anchors);

    for (const curve of partPath.curves) path.add(curve);
  }

  return path;
}

/** Shared position geometry used by visitor motion, editor helpers, and picking. */
export function createCameraPositionPath(
  parts: readonly CameraPositionPathPart[],
  optionalStartPosition?: Vector3Like
) {
  const prepared = preparePositionParts(parts);
  if (optionalStartPosition && countOrderedPositionPoints(prepared) > 1) {
    replacePreparedStartPosition(
      prepared,
      readVector3(optionalStartPosition, 'Camera start position')
    );
  }
  return compilePositionPath(prepared);
}

export function createCameraMotion(
  route: CameraRoute,
  optionalStartPose?: CameraPose
): CameraMotion {
  const positionParts = preparePositionParts(route.positionParts);
  const positionPointCount = countOrderedPositionPoints(positionParts);
  const targets = clonePoints(route.targetPoints, 'Camera route target');

  if (targets.length !== positionPointCount) {
    throw new Error(
      'Camera route ordered position points and target points must have the same length'
    );
  }

  if (optionalStartPose && positionPointCount > 1) {
    replacePreparedStartPosition(
      positionParts,
      readVector3(optionalStartPose.position, 'Camera start position')
    );
    targets[0] = readVector3(optionalStartPose.target, 'Camera start target');
  }

  const positionPath = compilePositionPath(positionParts);
  const targetPath = createRoundedPath(targets, CAMERA_MOTION_PATH.targetCornerRadius);
  const positionLength = positionPath.getLength();

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
    durationSeconds
  };
}

export function sampleCameraMotion(
  motion: CameraMotion,
  progress: number,
  outPosition: Vector3,
  outTarget: Vector3
): void {
  if (!Number.isFinite(progress)) {
    throw new Error('Camera motion progress must be finite');
  }

  const clampedProgress = MathUtils.clamp(progress, 0, 1);
  const easedProgress =
    clampedProgress *
    clampedProgress *
    clampedProgress *
    (clampedProgress * (clampedProgress * 6 - 15) + 10);

  motion.positionPath.getPointAt(easedProgress, outPosition);
  motion.targetPath.getPointAt(easedProgress, outTarget);
}
