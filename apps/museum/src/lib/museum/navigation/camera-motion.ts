import {
  CurvePath,
  LineCurve3,
  MathUtils,
  QuadraticBezierCurve3,
  Vector3
} from 'three';

export type Vector3Like =
  | readonly [number, number, number]
  | Readonly<{ x: number; y: number; z: number }>;

export type CameraRoute = {
  positions: readonly Vector3Like[];
  targets: readonly Vector3Like[];
  clearance?: number;
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
  cornerTrimRatio: 0.2
} as const;

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

export function createCameraMotion(
  route: CameraRoute,
  optionalStartPose?: CameraPose
): CameraMotion {
  if (route.positions.length === 0) {
    throw new Error('Camera route must contain at least one pose');
  }
  if (route.positions.length !== route.targets.length) {
    throw new Error('Camera route positions and targets must have the same length');
  }
  if (
    route.clearance !== undefined &&
    (!Number.isFinite(route.clearance) || route.clearance < 0)
  ) {
    throw new Error('Camera route clearance must be a finite non-negative number');
  }

  const positions = clonePoints(route.positions, 'Camera route position');
  const targets = clonePoints(route.targets, 'Camera route target');

  if (optionalStartPose && positions.length > 1) {
    const startPosition = readVector3(optionalStartPose.position, 'Camera start position');
    const startTarget = readVector3(optionalStartPose.target, 'Camera start target');
    positions[0] = startPosition;
    targets[0] = startTarget;
  }

  const positionRadius = Math.min(
    CAMERA_MOTION_PATH.positionCornerRadius,
    route.clearance ?? CAMERA_MOTION_PATH.positionCornerRadius
  );
  const positionPath = createRoundedPath(positions, positionRadius);
  const targetPath = createRoundedPath(targets, CAMERA_MOTION_PATH.targetCornerRadius);
  const positionLength = positionPath.getLength();

  // Curve.getPointAt() lazily builds arc-length tables. Prime both paths here so
  // frame-by-frame sampling only writes into the caller's reusable vectors.
  positionPath.getLengths();
  targetPath.getLength();
  targetPath.getLengths();

  const durationSeconds =
    positions.length === 1
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
