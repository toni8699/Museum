import { describe, expect, it } from 'vitest';
import { LineCurve3, QuadraticBezierCurve3, Vector3 } from 'three';
import {
  CAMERA_MOTION_PATH,
  CAMERA_MOTION_TIMING,
  VISITOR_CAMERA_PROJECTION,
  createCameraMotion,
  sampleCameraMotion,
  type CameraRoute
} from './camera-motion';

function sample(motion: ReturnType<typeof createCameraMotion>, progress: number) {
  const position = new Vector3();
  const target = new Vector3();
  sampleCameraMotion(motion, progress, position, target);
  return {
    position: position.toArray(),
    target: target.toArray()
  };
}

describe('camera motion constants', () => {
  it('publishes the visitor projection and motion policy as named constants', () => {
    expect(VISITOR_CAMERA_PROJECTION).toEqual({ fov: 54, near: 0.1, far: 90 });
    expect(CAMERA_MOTION_TIMING).toEqual({
      unitsPerSecond: 6.2,
      minDurationSeconds: 1.25,
      maxDurationSeconds: 4.8
    });
    expect(CAMERA_MOTION_PATH).toEqual({
      positionCornerRadius: 0.42,
      targetCornerRadius: 0.65,
      cornerTrimRatio: 0.2
    });
  });
});

describe('createCameraMotion', () => {
  it('clones its route and live start pose without mutating either input', () => {
    const route = {
      positions: [
        [0, 1, 0],
        [10, 1, 0]
      ],
      targets: [
        [0, 1, 1],
        [10, 1, 1]
      ],
      clearance: 0.3
    } as const satisfies CameraRoute;
    const startPose = {
      position: { x: -2, y: 3, z: 4 },
      target: { x: -1, y: 3, z: 4 }
    } as const;
    const originalRoute = structuredClone(route);
    const originalStartPose = structuredClone(startPose);

    const motion = createCameraMotion(route, startPose);

    expect(route).toEqual(originalRoute);
    expect(startPose).toEqual(originalStartPose);
    expect(sample(motion, 0)).toEqual({
      position: [-2, 3, 4],
      target: [-1, 3, 4]
    });
    expect(sample(motion, 1)).toEqual({
      position: [10, 1, 0],
      target: [10, 1, 1]
    });
  });

  it('ignores a start override for a singleton route and returns a zero-duration pose', () => {
    const motion = createCameraMotion(
      {
        positions: [[2, 3, 4]],
        targets: [[5, 6, 7]]
      },
      {
        position: [20, 30, 40],
        target: [50, 60, 70]
      }
    );

    expect(motion.durationSeconds).toBe(0);
    expect(sample(motion, 0)).toEqual({ position: [2, 3, 4], target: [5, 6, 7] });
    expect(sample(motion, 0.5)).toEqual({ position: [2, 3, 4], target: [5, 6, 7] });
    expect(sample(motion, 1)).toEqual({ position: [2, 3, 4], target: [5, 6, 7] });
  });

  it('does not inspect an ignored singleton start override', () => {
    const motion = createCameraMotion(
      {
        positions: [[2, 3, 4]],
        targets: [[5, 6, 7]]
      },
      {
        position: [Number.NaN, 0, 0],
        target: [0, Number.POSITIVE_INFINITY, 0]
      }
    );

    expect(motion.durationSeconds).toBe(0);
    expect(sample(motion, 1)).toEqual({ position: [2, 3, 4], target: [5, 6, 7] });
  });

  it('uses position distance with shared minimum, calculated, and maximum durations', () => {
    const motionForDistance = (distance: number) =>
      createCameraMotion({
        positions: [
          [0, 0, 0],
          [distance, 0, 0]
        ],
        targets: [
          [0, 0, 1],
          [distance, 0, 1]
        ]
      }).durationSeconds;

    expect(motionForDistance(1)).toBe(CAMERA_MOTION_TIMING.minDurationSeconds);
    expect(motionForDistance(12.4)).toBeCloseTo(2);
    expect(motionForDistance(100)).toBe(CAMERA_MOTION_TIMING.maxDurationSeconds);
  });

  it('keeps a multi-pose zero-length position route at the minimum duration', () => {
    const motion = createCameraMotion({
      positions: [
        [1, 2, 3],
        [1, 2, 3]
      ],
      targets: [
        [1, 2, 4],
        [11, 2, 4]
      ]
    });

    expect(motion.durationSeconds).toBe(CAMERA_MOTION_TIMING.minDurationSeconds);
    expect(sample(motion, 0.25).position).toEqual([1, 2, 3]);
    expect(sample(motion, 0.25).target[0]).toBeCloseTo(2.03515625);
  });

  it('precomputes rounded position and target paths using their separate radii', () => {
    const route = {
      positions: [
        [0, 0, 0],
        [5, 0, 0],
        [5, 0, 5]
      ],
      targets: [
        [0, 1, 0],
        [5, 1, 0],
        [5, 1, 5]
      ]
    } as const;
    const motion = createCameraMotion(route);
    const limitedMotion = createCameraMotion({ ...route, clearance: 0.25 });

    expect(motion.positionPath.curves).toHaveLength(3);
    expect(motion.positionPath.curves[0]).toBeInstanceOf(LineCurve3);
    expect(motion.positionPath.curves[1]).toBeInstanceOf(QuadraticBezierCurve3);
    expect(motion.positionPath.curves[0].getPoint(1, new Vector3()).toArray()).toEqual([
      4.58,
      0,
      0
    ]);
    expect(motion.targetPath.curves[0].getPoint(1, new Vector3()).toArray()).toEqual([
      4.35,
      1,
      0
    ]);
    expect(
      limitedMotion.positionPath.curves[0].getPoint(1, new Vector3()).toArray()
    ).toEqual([4.75, 0, 0]);
  });

  it.each([
    [
      'an empty route',
      { positions: [], targets: [] },
      'Camera route must contain at least one pose'
    ],
    [
      'mismatched pose counts',
      { positions: [[0, 0, 0]], targets: [] },
      'Camera route positions and targets must have the same length'
    ],
    [
      'a non-finite position',
      { positions: [[0, Number.NaN, 0]], targets: [[0, 0, 0]] },
      'Camera route position[0] must contain exactly three finite numbers'
    ],
    [
      'a non-finite target',
      { positions: [[0, 0, 0]], targets: [[0, Number.POSITIVE_INFINITY, 0]] },
      'Camera route target[0] must contain exactly three finite numbers'
    ],
    [
      'negative clearance',
      { positions: [[0, 0, 0]], targets: [[0, 0, 0]], clearance: -0.1 },
      'Camera route clearance must be a finite non-negative number'
    ],
    [
      'non-finite clearance',
      { positions: [[0, 0, 0]], targets: [[0, 0, 0]], clearance: Number.NaN },
      'Camera route clearance must be a finite non-negative number'
    ]
  ])('rejects %s', (_label, route, message) => {
    expect(() => createCameraMotion(route as unknown as CameraRoute)).toThrow(message);
  });
});

describe('sampleCameraMotion', () => {
  const motion = createCameraMotion({
    positions: [
      [0, 0, 0],
      [10, 0, 0]
    ],
    targets: [
      [0, 0, 1],
      [10, 0, 1]
    ]
  });

  it('clamps progress and writes into the supplied output vectors', () => {
    const position = new Vector3(100, 100, 100);
    const target = new Vector3(200, 200, 200);

    expect(sampleCameraMotion(motion, -1, position, target)).toBeUndefined();
    expect(position.toArray()).toEqual([0, 0, 0]);
    expect(target.toArray()).toEqual([0, 0, 1]);

    sampleCameraMotion(motion, 2, position, target);
    expect(position.toArray()).toEqual([10, 0, 0]);
    expect(target.toArray()).toEqual([10, 0, 1]);
  });

  it('applies smootherstep before sampling the precomputed paths', () => {
    const result = sample(motion, 0.25);

    expect(result.position[0]).toBeCloseTo(1.03515625);
    expect(result.target[0]).toBeCloseTo(1.03515625);
  });

  it('rejects non-finite progress', () => {
    expect(() =>
      sampleCameraMotion(motion, Number.NaN, new Vector3(), new Vector3())
    ).toThrow('Camera motion progress must be finite');
  });
});
