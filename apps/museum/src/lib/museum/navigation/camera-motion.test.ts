import { describe, expect, it } from 'vitest';
import {
  CubicBezierCurve3,
  LineCurve3,
  QuadraticBezierCurve3,
  Vector3
} from 'three';
import {
  CAMERA_MOTION_PATH,
  CAMERA_MOTION_TIMING,
  VISITOR_CAMERA_PROJECTION,
  cameraMotionProgressAtEdgeProgress,
  compileCameraPositionPath,
  createCameraMotion,
  createCameraMotionSample,
  createCameraPositionPath,
  sampleCameraMotion,
  type CameraRoute
} from './camera-motion';

function sample(motion: ReturnType<typeof createCameraMotion>, progress: number) {
  const output = createCameraMotionSample();
  sampleCameraMotion(motion, progress, output);
  return {
    position: output.position.toArray(),
    target: output.target.toArray()
  };
}

function sampleFull(
  motion: ReturnType<typeof createCameraMotion>,
  progress: number
) {
  const output = createCameraMotionSample();
  sampleCameraMotion(motion, progress, output);
  return output;
}

function smootherstep(progress: number) {
  return progress ** 3 * (progress * (progress * 6 - 15) + 10);
}

function inverseSmootherstep(target: number) {
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 60; iteration += 1) {
    const midpoint = (low + high) / 2;
    if (smootherstep(midpoint) < target) low = midpoint;
    else high = midpoint;
  }
  return (low + high) / 2;
}

function expectVectorClose(actual: Vector3, expected: Vector3, precision = 8) {
  expect(actual.x).toBeCloseTo(expected.x, precision);
  expect(actual.y).toBeCloseTo(expected.y, precision);
  expect(actual.z).toBeCloseTo(expected.z, precision);
}

describe('camera motion constants', () => {
  it('publishes visitor projection, timing, and path policies', () => {
    expect(VISITOR_CAMERA_PROJECTION).toEqual({ fov: 54, near: 0.1, far: 90 });
    expect(CAMERA_MOTION_TIMING).toEqual({
      unitsPerSecond: 6.2,
      minDurationSeconds: 1.25,
      maxDurationSeconds: 4.8
    });
    expect(CAMERA_MOTION_PATH).toEqual({
      positionCornerRadius: 0.42,
      targetCornerRadius: 0.65,
      cornerTrimRatio: 0.2,
      autoBezierAlpha: 0.5
    });
  });
});

describe('createCameraMotion', () => {
  it('clones its route and live start pose without mutating either input', () => {
    const route = {
      positionParts: [
        {
          kind: 'rounded-polyline',
          points: [
            [0, 1, 0],
            [10, 1, 0]
          ],
          clearance: 0.3
        }
      ],
      targetPoints: [
        [0, 1, 1],
        [10, 1, 1]
      ],
      edges: [
        {
          connectionId: 'straight',
          direction: 'forward',
          fromNodeId: 'a',
          toNodeId: 'b',
          positionSpan: {
            start: { partIndex: 0, pointIndex: 0 },
            end: { partIndex: 0, pointIndex: 1 }
          }
        }
      ]
    } as const satisfies CameraRoute;
    const startPose = {
      position: { x: -2, y: 3, z: 4 },
      target: { x: -1, y: 3, z: 4 },
      fov: 63
    } as const;
    const originalRoute = structuredClone(route);
    const originalStartPose = structuredClone(startPose);

    const motion = createCameraMotion(route, startPose);

    expect(route).toEqual(originalRoute);
    expect(startPose).toEqual(originalStartPose);
    expect(motion.positionEdgeSpans[0].positionSpan).not.toBe(
      route.edges[0].positionSpan
    );
    expect(motion.positionEdgeSpans[0]).toEqual(
      expect.objectContaining({
        connectionId: 'straight',
        direction: 'forward',
        startDistance: 0,
        endDistance: motion.positionPath.getLength(),
        length: motion.positionPath.getLength()
      })
    );
    expect(sample(motion, 0)).toEqual({
      position: [-2, 3, 4],
      target: [-1, 3, 4]
    });
    expect(sample(motion, 1)).toEqual({
      position: [10, 1, 0],
      target: [10, 1, 1]
    });
  });

  it('applies a live position before automatic tangents are generated', () => {
    const route = {
      positionParts: [
        {
          kind: 'auto-bezier',
          anchors: [
            [0, 0, 0],
            [2, 0, 1],
            [4, 0, 0]
          ]
        }
      ],
      targetPoints: [
        [0, 0, 1],
        [2, 0, 2],
        [4, 0, 1]
      ]
    } as const satisfies CameraRoute;
    const authoredPath = createCameraPositionPath(route.positionParts);
    const motion = createCameraMotion(route, {
      position: [-3, 1, 0],
      target: [-2, 1, 0],
      fov: 54
    });

    expect(sample(motion, 0).position).toEqual([-3, 1, 0]);
    expect(
      (motion.positionPath.curves[0] as CubicBezierCurve3).v1.equals(
        (authoredPath.curves[0] as CubicBezierCurve3).v1
      )
    ).toBe(false);
    expect(route.positionParts[0].anchors[0]).toEqual([0, 0, 0]);
  });

  it('keeps a live start continuous across a leading singleton mixed part', () => {
    const route = {
      positionParts: [
        { kind: 'rounded-polyline', points: [[0, 0, 0]] },
        {
          kind: 'auto-bezier',
          anchors: [
            [0, 0, 0],
            [5, 0, 0]
          ]
        }
      ],
      targetPoints: [
        [0, 0, 1],
        [5, 0, 1]
      ]
    } as const satisfies CameraRoute;
    const motion = createCameraMotion(route, {
      position: [-2, 1, 0],
      target: [-1, 1, 0],
      fov: 54
    });

    expect(sample(motion, 0)).toEqual({
      position: [-2, 1, 0],
      target: [-1, 1, 0]
    });
    expect(sample(motion, 1)).toEqual({
      position: [5, 0, 0],
      target: [5, 0, 1]
    });
    expect(
      motion.positionPath.curves[0]
        .getPoint(1, new Vector3())
        .equals(motion.positionPath.curves[1].getPoint(0, new Vector3()))
    ).toBe(true);
  });

  it('ignores a start override for a singleton route and returns a zero-duration pose', () => {
    const motion = createCameraMotion(
      {
        positionParts: [
          { kind: 'rounded-polyline', points: [[2, 3, 4]] }
        ],
        targetPoints: [[5, 6, 7]]
      },
      {
        position: [20, 30, 40],
        target: [50, 60, 70],
        fov: 80
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
        positionParts: [
          { kind: 'rounded-polyline', points: [[2, 3, 4]] }
        ],
        targetPoints: [[5, 6, 7]]
      },
      {
        position: [Number.NaN, 0, 0],
        target: [0, Number.POSITIVE_INFINITY, 0],
        fov: Number.NaN
      }
    );

    expect(motion.durationSeconds).toBe(0);
    expect(sample(motion, 1)).toEqual({ position: [2, 3, 4], target: [5, 6, 7] });
  });

  it('uses position distance with shared minimum, calculated, and maximum durations', () => {
    const motionForDistance = (distance: number) =>
      createCameraMotion({
        positionParts: [
          {
            kind: 'rounded-polyline',
            points: [
              [0, 0, 0],
              [distance, 0, 0]
            ]
          }
        ],
        targetPoints: [
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
      positionParts: [
        {
          kind: 'rounded-polyline',
          points: [
            [1, 2, 3],
            [1, 2, 3]
          ]
        }
      ],
      targetPoints: [
        [1, 2, 4],
        [11, 2, 4]
      ]
    });

    expect(motion.durationSeconds).toBe(CAMERA_MOTION_TIMING.minDurationSeconds);
    expect(sample(motion, 0.25).position).toEqual([1, 2, 3]);
    expect(sample(motion, 0.25).target[0]).toBeCloseTo(2.03515625);
  });

  it('preserves frozen Phase 6 rounded-path samples and duration', () => {
    const motion = createCameraMotion({
      positionParts: [
        {
          kind: 'rounded-polyline',
          points: [
            [0, 1, 0],
            [1, 1, 0],
            [2, 1, 0],
            [3, 1, 1],
            [4, 1, 2]
          ],
          clearance: 0.2
        }
      ],
      targetPoints: [
        [0, 1, 1],
        [3, 1, 1],
        [4, 1, 2],
        [4, 1, 2],
        [4, 1, 3]
      ]
    });

    expect(motion.positionPath.getLength()).toBeCloseTo(4.808289638378762, 12);
    expect(motion.durationSeconds).toBe(1.25);
    expect(sample(motion, 0.25).position).toEqual([
      0.4977291008015312,
      1,
      0
    ]);
    expect(sample(motion, 0.5).position[0]).toBeCloseTo(2.30002657873801, 12);
    expect(sample(motion, 0.5).position[2]).toBeCloseTo(0.30002657873801, 12);
    expect(sample(motion, 0.75).position[0]).toBeCloseTo(3.6480523776293534, 12);
    expect(sample(motion, 0.75).position[2]).toBeCloseTo(1.6480523776293534, 12);
  });

  it('hits authored edge targets and FOV exactly at position-distance progress', () => {
    const route = {
      positionParts: [
        {
          kind: 'rounded-polyline',
          points: [
            [0, 0, 0],
            [10, 0, 0]
          ]
        }
      ],
      targetPoints: [
        [0, 0, 1],
        [10, 0, 1]
      ],
      startFov: 50,
      endFov: 70,
      edges: [
        {
          connectionId: 'authored',
          direction: 'forward',
          fromNodeId: 'a',
          toNodeId: 'b',
          positionSpan: {
            start: { partIndex: 0, pointIndex: 0 },
            end: { partIndex: 0, pointIndex: 1 }
          },
          viewTrack: {
            start: { cameraTarget: [0, 0, 2], fov: 50 },
            keyframes: [
              {
                id: 'authored-view-forward-01',
                progress: 0.25,
                cameraTarget: [2.5, 2, 3],
                fov: 35
              },
              {
                id: 'authored-view-forward-02',
                progress: 0.75,
                cameraTarget: [7.5, -1, 4],
                fov: 90
              }
            ],
            end: { cameraTarget: [10, 0, 2], fov: 70 }
          },
          automaticTargetPoints: [
            [0, 0, 2],
            [10, 0, 2]
          ]
        }
      ]
    } as const satisfies CameraRoute;
    const original = structuredClone(route);
    const motion = createCameraMotion(route);

    const first = sampleFull(motion, inverseSmootherstep(0.25));
    expect(first.position.toArray()).toEqual([2.5, 0, 0]);
    expect(first.target.toArray()).toEqual([2.5, 2, 3]);
    expect(first.fov).toBe(35);

    const second = sampleFull(motion, inverseSmootherstep(0.75));
    expect(second.position.toArray()).toEqual([7.5, 0, 0]);
    expect(second.target.toArray()).toEqual([7.5, -1, 4]);
    expect(second.fov).toBe(90);
    expect(route).toEqual(original);
  });

  it('uses non-overshooting interval easing for authored targets and FOV', () => {
    const motion = createCameraMotion({
      positionParts: [
        {
          kind: 'rounded-polyline',
          points: [
            [0, 0, 0],
            [10, 0, 0]
          ]
        }
      ],
      targetPoints: [
        [0, 0, 1],
        [10, 0, 1]
      ],
      edges: [
        {
          connectionId: 'authored',
          direction: 'forward',
          fromNodeId: 'a',
          toNodeId: 'b',
          positionSpan: {
            start: { partIndex: 0, pointIndex: 0 },
            end: { partIndex: 0, pointIndex: 1 }
          },
          viewTrack: {
            start: { cameraTarget: [0, 0, 2], fov: 20 },
            keyframes: [
              {
                id: 'peak',
                progress: 0.5,
                cameraTarget: [5, 4, 2],
                fov: 100
              }
            ],
            end: { cameraTarget: [10, 0, 2], fov: 40 }
          }
        }
      ]
    });

    for (const localProgress of [0.1, 0.25, 0.4, 0.6, 0.75, 0.9]) {
      const output = sampleFull(motion, inverseSmootherstep(localProgress));
      expect(output.target.y).toBeGreaterThanOrEqual(0);
      expect(output.target.y).toBeLessThanOrEqual(4);
      expect(output.fov).toBeGreaterThanOrEqual(20);
      expect(output.fov).toBeLessThanOrEqual(100);
    }
  });

  it('keeps synthesized targets unchanged when only node FOV is authored', () => {
    const baseRoute = {
      positionParts: [
        {
          kind: 'rounded-polyline',
          points: [
            [0, 0, 0],
            [5, 0, 3],
            [10, 0, 0]
          ]
        }
      ],
      targetPoints: [
        [0, 1, 1],
        [7, 2, 4],
        [10, 1, 1]
      ]
    } as const satisfies CameraRoute;
    const automatic = createCameraMotion(baseRoute);
    const fovOnly = createCameraMotion({
      ...baseRoute,
      startFov: 40,
      endFov: 80,
      edges: [
        {
          connectionId: 'fov-only',
          direction: 'forward',
          fromNodeId: 'a',
          toNodeId: 'b',
          positionSpan: {
            start: { partIndex: 0, pointIndex: 0 },
            end: { partIndex: 0, pointIndex: 2 }
          },
          viewTrack: {
            start: { cameraTarget: [0, 1, 1], fov: 40 },
            keyframes: [],
            end: { cameraTarget: [10, 1, 1], fov: 80 }
          },
          automaticTargetPoints: baseRoute.targetPoints
        }
      ]
    });

    for (const progress of [0, 0.2, 0.5, 0.8, 1]) {
      const expected = sampleFull(automatic, progress);
      const actual = sampleFull(fovOnly, progress);
      expectVectorClose(actual.target, expected.target, 12);
    }
    expect(sampleFull(fovOnly, 0).fov).toBe(40);
    expect(sampleFull(fovOnly, 0.5).fov).toBe(60);
    expect(sampleFull(fovOnly, 1).fov).toBe(80);
  });

  it('keeps mixed automatic and authored edges continuous at their shared node', () => {
    const motion = createCameraMotion({
      positionParts: [
        {
          kind: 'rounded-polyline',
          points: [
            [0, 0, 0],
            [5, 0, 0],
            [10, 0, 0]
          ]
        }
      ],
      targetPoints: [
        [0, 0, 1],
        [5, 0, 1],
        [10, 0, 1]
      ],
      startFov: 45,
      endFov: 65,
      edges: [
        {
          connectionId: 'first',
          direction: 'forward',
          fromNodeId: 'a',
          toNodeId: 'b',
          positionSpan: {
            start: { partIndex: 0, pointIndex: 0 },
            end: { partIndex: 0, pointIndex: 1 }
          },
          viewTrack: {
            start: { cameraTarget: [0, 0, 1], fov: 45 },
            keyframes: [
              {
                id: 'first-view-forward-01',
                progress: 0.5,
                cameraTarget: [2.5, 2, 2],
                fov: 35
              }
            ],
            end: { cameraTarget: [5, 0, 1], fov: 55 }
          }
        },
        {
          connectionId: 'second',
          direction: 'forward',
          fromNodeId: 'b',
          toNodeId: 'c',
          positionSpan: {
            start: { partIndex: 0, pointIndex: 1 },
            end: { partIndex: 0, pointIndex: 2 }
          },
          viewTrack: {
            start: { cameraTarget: [5, 0, 1], fov: 55 },
            keyframes: [],
            end: { cameraTarget: [10, 0, 1], fov: 65 }
          },
          automaticTargetPoints: [
            [5, 0, 1],
            [10, 0, 1]
          ]
        }
      ]
    });

    const boundary = sampleFull(motion, 0.5);
    expect(boundary.position.toArray()).toEqual([5, 0, 0]);
    expect(boundary.target.toArray()).toEqual([5, 0, 1]);
    expect(boundary.fov).toBe(55);

    const before = sampleFull(motion, 0.499);
    const after = sampleFull(motion, 0.501);
    expect(before.target.distanceTo(after.target)).toBeLessThan(0.025);
    expect(Math.abs(before.fov - after.fov)).toBeLessThan(0.025);
  });

  it('uses live target and FOV as the generated departure view', () => {
    const route = {
      positionParts: [
        {
          kind: 'rounded-polyline',
          points: [
            [0, 0, 0],
            [10, 0, 0]
          ]
        }
      ],
      targetPoints: [
        [0, 0, 1],
        [10, 0, 1]
      ],
      startFov: 40,
      endFov: 60,
      edges: [
        {
          connectionId: 'live',
          direction: 'forward',
          fromNodeId: 'a',
          toNodeId: 'b',
          positionSpan: {
            start: { partIndex: 0, pointIndex: 0 },
            end: { partIndex: 0, pointIndex: 1 }
          },
          viewTrack: {
            start: { cameraTarget: [0, 0, 1], fov: 40 },
            keyframes: [
              {
                id: 'live-view-forward-01',
                progress: 0.5,
                cameraTarget: [5, 2, 2],
                fov: 50
              }
            ],
            end: { cameraTarget: [10, 0, 1], fov: 60 }
          }
        }
      ]
    } as const satisfies CameraRoute;
    const startPose = {
      position: [-2, 1, 0],
      target: [-1, 2, 3],
      fov: 77
    } as const;
    const originalRoute = structuredClone(route);
    const originalStartPose = structuredClone(startPose);
    const motion = createCameraMotion(route, startPose);

    const start = sampleFull(motion, 0);
    expect(start.position.toArray()).toEqual([-2, 1, 0]);
    expect(start.target.toArray()).toEqual([-1, 2, 3]);
    expect(start.fov).toBe(77);
    expect(sampleFull(motion, 1).fov).toBe(60);
    expect(route).toEqual(originalRoute);
    expect(startPose).toEqual(originalStartPose);
  });

  it('samples FOV for singleton and zero-distance authored motion', () => {
    const singleton = createCameraMotion({
      positionParts: [{ kind: 'rounded-polyline', points: [[1, 2, 3]] }],
      targetPoints: [[1, 2, 4]],
      startFov: 33,
      endFov: 33
    });
    expect(sampleFull(singleton, 0.5).fov).toBe(33);

    const targetOnly = createCameraMotion({
      positionParts: [
        {
          kind: 'rounded-polyline',
          points: [
            [1, 2, 3],
            [1, 2, 3]
          ]
        }
      ],
      targetPoints: [
        [1, 2, 4],
        [2, 2, 4]
      ],
      startFov: 40,
      endFov: 70,
      edges: [
        {
          connectionId: 'target-only',
          direction: 'forward',
          fromNodeId: 'a',
          toNodeId: 'b',
          positionSpan: {
            start: { partIndex: 0, pointIndex: 0 },
            end: { partIndex: 0, pointIndex: 1 }
          },
          viewTrack: {
            start: { cameraTarget: [1, 2, 4], fov: 40 },
            keyframes: [
              {
                id: 'target-only-view-forward-01',
                progress: 0.5,
                cameraTarget: [1.5, 3, 4],
                fov: 55
              }
            ],
            end: { cameraTarget: [2, 2, 4], fov: 70 }
          }
        }
      ]
    });
    const midpoint = sampleFull(targetOnly, 0.5);
    expect(midpoint.position.toArray()).toEqual([1, 2, 3]);
    expect(midpoint.target.toArray()).toEqual([1.5, 3, 4]);
    expect(midpoint.fov).toBe(55);
  });

  it('precomputes rounded position and target paths using separate radii', () => {
    const route = {
      positionParts: [
        {
          kind: 'rounded-polyline',
          points: [
            [0, 0, 0],
            [5, 0, 0],
            [5, 0, 5]
          ]
        }
      ],
      targetPoints: [
        [0, 1, 0],
        [5, 1, 0],
        [5, 1, 5]
      ]
    } as const satisfies CameraRoute;
    const motion = createCameraMotion(route);
    const limitedMotion = createCameraMotion({
      ...route,
      positionParts: [{ ...route.positionParts[0], clearance: 0.25 }]
    });

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
      'no position parts',
      { positionParts: [], targetPoints: [] },
      'Camera route must contain at least one position path part'
    ],
    [
      'an empty rounded part',
      {
        positionParts: [{ kind: 'rounded-polyline', points: [] }],
        targetPoints: []
      },
      'Camera route position part[0] must contain at least one point'
    ],
    [
      'an empty automatic part',
      {
        positionParts: [{ kind: 'auto-bezier', anchors: [] }],
        targetPoints: []
      },
      'Camera route position part[0] must contain at least one anchor'
    ],
    [
      'mismatched pose counts',
      {
        positionParts: [{ kind: 'rounded-polyline', points: [[0, 0, 0]] }],
        targetPoints: []
      },
      'Camera route ordered position points and target points must have the same length'
    ],
    [
      'a non-finite position',
      {
        positionParts: [
          { kind: 'rounded-polyline', points: [[0, Number.NaN, 0]] }
        ],
        targetPoints: [[0, 0, 0]]
      },
      'Camera route position part[0] point[0] must contain exactly three finite numbers'
    ],
    [
      'a non-finite target',
      {
        positionParts: [{ kind: 'rounded-polyline', points: [[0, 0, 0]] }],
        targetPoints: [[0, Number.POSITIVE_INFINITY, 0]]
      },
      'Camera route target[0] must contain exactly three finite numbers'
    ],
    [
      'negative clearance',
      {
        positionParts: [
          { kind: 'rounded-polyline', points: [[0, 0, 0]], clearance: -0.1 }
        ],
        targetPoints: [[0, 0, 0]]
      },
      'Camera route position part[0] clearance must be a finite non-negative number'
    ],
    [
      'non-finite clearance',
      {
        positionParts: [
          {
            kind: 'rounded-polyline',
            points: [[0, 0, 0]],
            clearance: Number.NaN
          }
        ],
        targetPoints: [[0, 0, 0]]
      },
      'Camera route position part[0] clearance must be a finite non-negative number'
    ],
    [
      'a non-contiguous join',
      {
        positionParts: [
          {
            kind: 'rounded-polyline',
            points: [
              [0, 0, 0],
              [1, 0, 0]
            ]
          },
          {
            kind: 'auto-bezier',
            anchors: [
              [2, 0, 0],
              [3, 0, 0]
            ]
          }
        ],
        targetPoints: [
          [0, 0, 1],
          [1, 0, 1],
          [3, 0, 1]
        ]
      },
      'Camera route position parts 0 and 1 must form a contiguous join'
    ]
  ])('rejects %s', (_label, route, message) => {
    expect(() => createCameraMotion(route as unknown as CameraRoute)).toThrow(message);
  });

  it('rejects invalid runtime view-track candidates', () => {
    const route = {
      positionParts: [
        {
          kind: 'rounded-polyline',
          points: [
            [0, 0, 0],
            [10, 0, 0]
          ]
        }
      ],
      targetPoints: [
        [0, 0, 1],
        [10, 0, 1]
      ],
      edges: [
        {
          connectionId: 'invalid-view',
          direction: 'forward',
          fromNodeId: 'a',
          toNodeId: 'b',
          positionSpan: {
            start: { partIndex: 0, pointIndex: 0 },
            end: { partIndex: 0, pointIndex: 1 }
          },
          viewTrack: {
            start: { cameraTarget: [0, 0, 1], fov: 54 },
            keyframes: [
              {
                id: 'duplicate',
                progress: 0.3,
                cameraTarget: [3, 1, 1],
                fov: 54
              },
              {
                id: 'duplicate',
                progress: 0.6,
                cameraTarget: [6, 1, 1],
                fov: 54
              }
            ],
            end: { cameraTarget: [10, 0, 1], fov: 54 }
          }
        }
      ]
    } as const satisfies CameraRoute;

    expect(() => createCameraMotion(route)).toThrow(
      'Camera route edge[0] view keyframe[1] id must be unique within the edge track'
    );

    const coincident = JSON.parse(JSON.stringify(route)) as CameraRoute;
    coincident.edges![0]!.viewTrack!.keyframes[1]!.id = 'distinct';
    coincident.edges![0]!.viewTrack!.keyframes[1]!.progress = 0.5;
    coincident.edges![0]!.viewTrack!.keyframes[1]!.cameraTarget = [5, 0, 0];
    expect(() => createCameraMotion(coincident)).toThrow(
      'Camera route edge[0] view keyframe[1] target must be farther than 0.000001 from its sampled position'
    );

    const invalidFov = JSON.parse(JSON.stringify(route)) as CameraRoute;
    invalidFov.edges![0]!.viewTrack!.keyframes[1]!.id = 'distinct';
    invalidFov.edges![0]!.viewTrack!.keyframes[1]!.fov = 121;
    expect(() => createCameraMotion(invalidFov)).toThrow(
      'Camera route edge[0] view keyframe[1] fov must be a finite number between 10 and 120'
    );
  });

  it('rejects invalid multi-pose live projection and coincident live view', () => {
    const route = {
      positionParts: [
        {
          kind: 'rounded-polyline',
          points: [
            [0, 0, 0],
            [10, 0, 0]
          ]
        }
      ],
      targetPoints: [
        [0, 0, 1],
        [10, 0, 1]
      ]
    } as const satisfies CameraRoute;

    expect(() =>
      createCameraMotion(route, {
        position: [1, 2, 3],
        target: [1, 2, 4],
        fov: 121
      })
    ).toThrow('Camera start fov must be a finite number between 10 and 120');
    expect(() =>
      createCameraMotion(route, {
        position: [1, 2, 3],
        target: [1, 2, 3],
        fov: 54
      })
    ).toThrow(
      'Camera start target must be farther than 0.000001 from its position'
    );
  });
});

describe('cameraMotionProgressAtEdgeProgress', () => {
  it('maps exact edge distance back through transition smootherstep', () => {
    const motion = createCameraMotion({
      positionParts: [
        {
          kind: 'rounded-polyline',
          points: [
            [0, 0, 0],
            [10, 0, 0]
          ]
        }
      ],
      targetPoints: [
        [0, 0, 1],
        [10, 0, 1]
      ],
      edges: [
        {
          connectionId: 'edge',
          direction: 'forward',
          fromNodeId: 'a',
          toNodeId: 'b',
          positionSpan: {
            start: { partIndex: 0, pointIndex: 0 },
            end: { partIndex: 0, pointIndex: 1 }
          }
        }
      ]
    });

    const progress = cameraMotionProgressAtEdgeProgress(motion, 0, 0.25);
    expect(progress).toBeCloseTo(inverseSmootherstep(0.25), 10);
    const sample = sampleFull(motion, progress);
    expect(sample.position.x).toBeCloseTo(2.5, 8);
    expect(cameraMotionProgressAtEdgeProgress(motion, 0, 0)).toBe(0);
    expect(cameraMotionProgressAtEdgeProgress(motion, 0, 1)).toBe(1);
  });
});

describe('createCameraPositionPath', () => {
  it('returns exact requested spans without changing rounded geometry or length', () => {
    const parts = [
      {
        kind: 'rounded-polyline',
        points: [
          [0, 1, 0],
          [1, 1, 0],
          [2, 1, 0],
          [3, 1, 1],
          [4, 1, 2]
        ],
        clearance: 0.2
      }
    ] as const;
    const shared = createCameraPositionPath(parts);
    const compiled = compileCameraPositionPath(parts, [
      {
        start: { partIndex: 0, pointIndex: 0 },
        end: { partIndex: 0, pointIndex: 2 }
      },
      {
        start: { partIndex: 0, pointIndex: 2 },
        end: { partIndex: 0, pointIndex: 4 }
      }
    ]);

    expect(compiled.positionPath.curves).toHaveLength(shared.curves.length + 1);
    expect(compiled.totalDistance).toBe(shared.getLength());
    expect(compiled.spans[0].startDistance).toBe(0);
    expect(compiled.spans[0].endDistance).toBe(
      compiled.spans[1].startDistance
    );
    expect(compiled.spans[1].endDistance).toBe(compiled.totalDistance);
    expect(compiled.spans[0].length + compiled.spans[1].length).toBeCloseTo(
      compiled.totalDistance,
      12
    );

    for (const progress of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      expectVectorClose(
        compiled.positionPath.getPointAt(progress, new Vector3()),
        shared.getPointAt(progress, new Vector3()),
        12
      );
    }
  });

  it('measures zero-radius and duplicate rounded boundaries monotonically', () => {
    const compiled = compileCameraPositionPath(
      [
        {
          kind: 'rounded-polyline',
          points: [
            [0, 0, 0],
            [0, 0, 0],
            [1, 0, 1],
            [2, 0, 0]
          ],
          clearance: 0
        }
      ],
      [
        {
          start: { partIndex: 0, pointIndex: 0 },
          end: { partIndex: 0, pointIndex: 1 }
        },
        {
          start: { partIndex: 0, pointIndex: 1 },
          end: { partIndex: 0, pointIndex: 3 }
        }
      ]
    );

    expect(compiled.spans[0].length).toBe(0);
    expect(compiled.spans[0].endDistance).toBe(
      compiled.spans[1].startDistance
    );
    expect(compiled.spans[1].endDistance).toBe(compiled.totalDistance);
    expect(compiled.totalDistance).toBeCloseTo(2, 12);
  });

  it.each([
    [
      'an unknown part',
      {
        start: { partIndex: 1, pointIndex: 0 },
        end: { partIndex: 1, pointIndex: 1 }
      },
      'Camera position span[0] start references an unknown position part'
    ],
    [
      'an unknown point',
      {
        start: { partIndex: 0, pointIndex: 0 },
        end: { partIndex: 0, pointIndex: 2 }
      },
      'Camera position span[0] end references an unknown position point'
    ],
    [
      'a reversed range',
      {
        start: { partIndex: 0, pointIndex: 1 },
        end: { partIndex: 0, pointIndex: 0 }
      },
      'Camera position span[0] ends before it starts'
    ]
  ])('rejects %s in requested distance spans', (_label, span, message) => {
    expect(() =>
      compileCameraPositionPath(
        [
          {
            kind: 'rounded-polyline',
            points: [
              [0, 0, 0],
              [1, 0, 0]
            ]
          }
        ],
        [span]
      )
    ).toThrow(message);
  });

  it('builds a straight cubic for two distinct automatic anchors', () => {
    const path = createCameraPositionPath([
      {
        kind: 'auto-bezier',
        anchors: [
          [0, 0, 0],
          [6, 3, 0]
        ]
      }
    ]);
    const curve = path.curves[0] as CubicBezierCurve3;

    expect(curve).toBeInstanceOf(CubicBezierCurve3);
    expect(curve.v0.toArray()).toEqual([0, 0, 0]);
    expect(curve.v1.toArray()).toEqual([2, 1, 0]);
    expect(curve.v2.toArray()).toEqual([4, 2, 0]);
    expect(curve.v3.toArray()).toEqual([6, 3, 0]);
  });

  it('passes through uneven anchors with C1 tangent direction', () => {
    const anchors = [
      [0, 0, 0],
      [1, 0, 0],
      [5, 0, 4],
      [6, 0, 4]
    ] as const;
    const path = createCameraPositionPath([
      { kind: 'auto-bezier', anchors }
    ]);

    expect(path.curves).toHaveLength(3);
    for (let index = 0; index < anchors.length; index += 1) {
      const curveIndex = Math.min(index, path.curves.length - 1);
      const point = path.curves[curveIndex].getPoint(
        index === anchors.length - 1 ? 1 : 0,
        new Vector3()
      );
      expect(point.toArray()).toEqual(anchors[index]);
    }

    for (let index = 0; index < path.curves.length - 1; index += 1) {
      const before = path.curves[index] as CubicBezierCurve3;
      const after = path.curves[index + 1] as CubicBezierCurve3;
      const incoming = before.v3.clone().sub(before.v2).normalize();
      const outgoing = after.v1.clone().sub(after.v0).normalize();
      expectVectorClose(incoming, outgoing);

			const previousInterval = Math.sqrt(
				new Vector3(...anchors[index + 1]).distanceTo(
					new Vector3(...anchors[index])
				)
			);
			const nextInterval = Math.sqrt(
				new Vector3(...anchors[index + 2]).distanceTo(
					new Vector3(...anchors[index + 1])
				)
			);
			const incomingKnotDerivative = before.v3
				.clone()
				.sub(before.v2)
				.multiplyScalar(3 / previousInterval);
			const outgoingKnotDerivative = after.v1
				.clone()
				.sub(after.v0)
				.multiplyScalar(3 / nextInterval);
			expectVectorClose(incomingKnotDerivative, outgoingKnotDerivative);
    }
  });

  it('keeps duplicate segments degenerate and all generated values finite', () => {
    const path = createCameraPositionPath([
      {
        kind: 'auto-bezier',
        anchors: [
          [0, 0, 0],
          [0, 0, 0],
          [3, 0, 2],
          [3, 0, 2],
          [7, 1, 0]
        ]
      }
    ]);

    expect(path.curves).toHaveLength(4);
    expect(path.curves[0].getLength()).toBeCloseTo(0, 12);
    expect(path.curves[2].getLength()).toBeCloseTo(0, 12);
    for (const curve of path.curves as CubicBezierCurve3[]) {
      for (const control of [curve.v0, curve.v1, curve.v2, curve.v3]) {
        expect(control.toArray().every(Number.isFinite)).toBe(true);
      }
    }
    for (const progress of [0, 0.1, 0.5, 0.9, 1]) {
      expect(
        path.getPointAt(progress, new Vector3()).toArray().every(Number.isFinite)
      ).toBe(true);
    }
  });

  it('samples reversed automatic anchors as the same geometry backward', () => {
    const anchors = [
      [0, 0, 0],
      [2, 1, 1],
      [7, -1, 3],
      [9, 0, 0]
    ] as const;
    const forward = createCameraPositionPath([
      { kind: 'auto-bezier', anchors }
    ]);
    const reverse = createCameraPositionPath([
      { kind: 'auto-bezier', anchors: [...anchors].reverse() }
    ]);

    for (const progress of [0, 0.1, 0.35, 0.5, 0.8, 1]) {
      expectVectorClose(
        forward.getPointAt(progress, new Vector3()),
        reverse.getPointAt(1 - progress, new Vector3()),
        7
      );
    }
  });

  it('combines contiguous mixed parts without smoothing across boundaries', () => {
    const path = createCameraPositionPath([
      {
        kind: 'rounded-polyline',
        points: [
          [0, 0, 0],
          [2, 0, 0]
        ],
        clearance: 0.2
      },
      {
        kind: 'auto-bezier',
        anchors: [
          [2, 0, 0],
          [3, 0, 1],
          [4, 0, 0]
        ]
      },
      {
        kind: 'rounded-polyline',
        points: [
          [4, 0, 0],
          [5, 0, 0]
        ],
        clearance: 0.4
      }
    ]);

    expect(path.curves).toHaveLength(4);
    expect(path.curves[0]).toBeInstanceOf(LineCurve3);
    expect(path.curves[1]).toBeInstanceOf(CubicBezierCurve3);
    expect(path.curves[2]).toBeInstanceOf(CubicBezierCurve3);
    expect(path.curves[3]).toBeInstanceOf(LineCurve3);
    expect(path.curves[0].getPoint(1, new Vector3()).toArray()).toEqual([2, 0, 0]);
    expect(path.curves[1].getPoint(0, new Vector3()).toArray()).toEqual([2, 0, 0]);
    expect(path.curves[2].getPoint(1, new Vector3()).toArray()).toEqual([4, 0, 0]);
    expect(path.curves[3].getPoint(0, new Vector3()).toArray()).toEqual([4, 0, 0]);
  });

  it('returns geometry identical to createCameraMotion', () => {
    const route = {
      positionParts: [
        {
          kind: 'auto-bezier',
          anchors: [
            [0, 0, 0],
            [2, 0, 1],
            [4, 0, 0]
          ]
        }
      ],
      targetPoints: [
        [0, 0, 1],
        [2, 0, 2],
        [4, 0, 1]
      ]
    } as const satisfies CameraRoute;
    const shared = createCameraPositionPath(route.positionParts);
    const motion = createCameraMotion(route);

    expect(shared.getLength()).toBe(motion.positionPath.getLength());
    for (const progress of [0, 0.2, 0.5, 0.85, 1]) {
      expectVectorClose(
        shared.getPointAt(progress, new Vector3()),
        motion.positionPath.getPointAt(progress, new Vector3())
      );
    }
  });
});

describe('sampleCameraMotion', () => {
  const motion = createCameraMotion({
    positionParts: [
      {
        kind: 'rounded-polyline',
        points: [
          [0, 0, 0],
          [10, 0, 0]
        ]
      }
    ],
    targetPoints: [
      [0, 0, 1],
      [10, 0, 1]
    ]
  });

  it('clamps progress and writes into supplied output vectors', () => {
    const output = createCameraMotionSample();
    output.position.set(100, 100, 100);
    output.target.set(200, 200, 200);

    expect(sampleCameraMotion(motion, -1, output)).toBeUndefined();
    expect(output.position.toArray()).toEqual([0, 0, 0]);
    expect(output.target.toArray()).toEqual([0, 0, 1]);
    expect(output.fov).toBe(54);

    sampleCameraMotion(motion, 2, output);
    expect(output.position.toArray()).toEqual([10, 0, 0]);
    expect(output.target.toArray()).toEqual([10, 0, 1]);
    expect(output.fov).toBe(54);
  });

  it('applies smootherstep before sampling precomputed paths', () => {
    const result = sample(motion, 0.25);

    expect(result.position[0]).toBeCloseTo(1.03515625);
    expect(result.target[0]).toBeCloseTo(1.03515625);
  });

  it('rejects non-finite progress', () => {
    expect(() =>
      sampleCameraMotion(motion, Number.NaN, createCameraMotionSample())
    ).toThrow('Camera motion progress must be finite');
  });
});
