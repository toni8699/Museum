import { describe, expect, it } from 'vitest';
import {
  CubicBezierCurve3,
  LineCurve3,
  MathUtils,
  QuadraticBezierCurve3,
  Vector3
} from 'three';
import {
  CAMERA_FRAMING_GUARD_POLICY,
  CAMERA_MOTION_PATH,
  CAMERA_MOTION_TIMING,
  VISITOR_CAMERA_PROJECTION,
  cameraApplyEasing,
  cameraInverseEasing,
  cameraMotionEdgeProgressAtProgress,
  cameraMotionProgressAtEdgeProgress,
  compileCameraPositionPath,
  createCameraMotion,
  createCameraMotionSample,
  createCameraPositionPath,
  resolveCameraMotionDuration,
  readCameraFramingGuardStatus,
  sampleFramingEnvelopeWeight,
  sampleCameraMotion,
  smootherstepRamp,
  type CameraFramingGuardStatus,
  type CameraRoute
} from '$lib/museum/navigation/camera-motion';
import {
  MUSEUM_CAMERA_FOV,
  type CameraEasing,
  type RuntimeCameraFramingEnvelope
} from '$lib/types/museum';

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
    expect(CAMERA_FRAMING_GUARD_POLICY).toEqual({
      minTargetStandoffMeters: VISITOR_CAMERA_PROJECTION.near,
      targetStandoffShoulderMeters: VISITOR_CAMERA_PROJECTION.near * 2,
      directionEpsilonMeters: 1e-6,
      maxAngularRateRadiansPerSecond: Math.PI * 1.5,
      angularInterpolationPeakRateFactor: 1.875,
      maxSampleAngularDeltaRadians: Math.PI / 36,
      maxTargetDistanceCurvatureMeters: VISITOR_CAMERA_PROJECTION.near / 2,
      baseSampleSegments: 24,
      maxAdaptiveDepth: 8,
      doubleWhipOffAxisRadians: Math.PI / 12,
      doubleWhipPathExcessRadians: Math.PI / 18,
      sphericalLerpLinearDotThreshold: 1 - 1e-6
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

  it('carries an isolated framing envelope into the prepared edge view', () => {
    const route = {
      positionParts: [{
        kind: 'rounded-polyline',
        points: [[0, 1, 0], [10, 1, 0]]
      }],
      targetPoints: [[0, 1, 1], [10, 1, 1]],
      edges: [{
        connectionId: 'straight',
        direction: 'forward',
        fromNodeId: 'a',
        toNodeId: 'b',
        positionSpan: {
          start: { partIndex: 0, pointIndex: 0 },
          end: { partIndex: 0, pointIndex: 1 }
        },
        viewTrack: {
          start: { cameraTarget: [0, 1, 1], fov: 54 },
          keyframes: [],
          end: { cameraTarget: [10, 1, 1], fov: 48 },
          framingEnvelope: {
            enterStart: 0.1,
            enterEnd: 0.25,
            exitStart: 0.8,
            exitEnd: 1
          }
        }
      }]
    } as const satisfies CameraRoute;

    const motion = createCameraMotion(route);
    expect(motion.edgeViews[0]?.framingEnvelope).toEqual(
      route.edges[0].viewTrack.framingEnvelope
    );
    expect(motion.edgeViews[0]?.framingEnvelope).not.toBe(
      route.edges[0].viewTrack.framingEnvelope
    );

    const { framingEnvelope: _envelope, ...viewTrackWithoutEnvelope } =
      route.edges[0].viewTrack;
    const legacyMotion = createCameraMotion({
      ...route,
      edges: [{ ...route.edges[0], viewTrack: viewTrackWithoutEnvelope }]
    });
    for (const progress of [0, 0.2, 0.5, 0.8, 1]) {
      const withEnvelope = sampleFull(motion, progress);
      const withoutEnvelope = sampleFull(legacyMotion, progress);
      expect(withEnvelope.position.toArray()).toEqual(withoutEnvelope.position.toArray());
      expect(withEnvelope.target.toArray()).toEqual(withoutEnvelope.target.toArray());
      expect(withEnvelope.fov).toBe(withoutEnvelope.fov);
    }
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

    expect(
      cameraMotionEdgeProgressAtProgress(motion, 0, progress)
    ).toBeCloseTo(0.25, 10);
    expect(cameraMotionEdgeProgressAtProgress(motion, 0, 0)).toBe(0);
    expect(cameraMotionEdgeProgressAtProgress(motion, 0, 1)).toBe(1);
    expect(() => cameraMotionEdgeProgressAtProgress(motion, 1, 0.5)).toThrow(
      'Camera motion edge index is out of range'
    );
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

describe('P1.3 framing envelope sampler and guards', () => {
  const envelope = {
    enterStart: 0.2,
    enterEnd: 0.4,
    exitStart: 0.8,
    exitEnd: 1
  } as const;

  function createEnvelopeRoute(
    overrides: Partial<NonNullable<CameraRoute['edges']>[number]> = {}
  ): CameraRoute {
    return {
      positionParts: [{
        kind: 'rounded-polyline',
        points: [[0, 0, 0], [10, 0, 0]]
      }],
      targetPoints: [[0, 0, 2], [10, 0, 2]],
      startFov: 40,
      endFov: 60,
      edges: [{
        connectionId: 'enveloped',
        direction: 'forward',
        fromNodeId: 'a',
        toNodeId: 'b',
        positionSpan: {
          start: { partIndex: 0, pointIndex: 0 },
          end: { partIndex: 0, pointIndex: 1 }
        },
        viewTrack: {
          start: { cameraTarget: [0, 0, 2], fov: 40 },
          keyframes: [{
            id: 'subject',
            progress: 0.5,
            cameraTarget: [5, 4, 4],
            fov: 80
          }],
          end: { cameraTarget: [10, 0, 2], fov: 60 },
          framingEnvelope: envelope
        },
        automaticTargetPoints: [[0, 0, 2], [10, 0, 2]],
        ...overrides
      }]
    };
  }

  it('samples rising, falling, plateau, and degenerate smootherstep ramps', () => {
    expect(smootherstepRamp(-1, 0.2, 0.4, true)).toBe(0);
    expect(smootherstepRamp(0.3, 0.2, 0.4, true)).toBeCloseTo(0.5, 12);
    expect(smootherstepRamp(1, 0.2, 0.4, true)).toBe(1);
    expect(smootherstepRamp(-1, 0.6, 0.8, false)).toBe(1);
    expect(smootherstepRamp(0.7, 0.6, 0.8, false)).toBeCloseTo(0.5, 12);
    expect(smootherstepRamp(1, 0.6, 0.8, false)).toBe(0);
    expect(smootherstepRamp(0.5, 0.5, 0.5, true)).toBe(1);
    expect(smootherstepRamp(0.5, 0.5, 0.5, false)).toBe(1);
    expect(smootherstepRamp(0.500001, 0.5, 0.5, false)).toBe(0);

    expect(sampleFramingEnvelopeWeight(envelope, 0)).toBe(0);
    expect(sampleFramingEnvelopeWeight(envelope, 0.3)).toBeCloseTo(0.5, 12);
    expect(sampleFramingEnvelopeWeight(envelope, 0.5)).toBe(1);
    expect(sampleFramingEnvelopeWeight(envelope, 0.9)).toBeCloseTo(0.5, 12);
    expect(sampleFramingEnvelopeWeight(envelope, 1)).toBe(0);
    const allEqual = {
      enterStart: 0.5,
      enterEnd: 0.5,
      exitStart: 0.5,
      exitEnd: 0.5
    };
    for (const progress of [0, 0.5, 0.500001, 1]) {
      const weight = sampleFramingEnvelopeWeight(allEqual, progress);
      expect(Number.isFinite(weight)).toBe(true);
      expect(weight).toBeGreaterThanOrEqual(0);
      expect(weight).toBeLessThanOrEqual(1);
    }
    expect(sampleFramingEnvelopeWeight(allEqual, 0.5)).toBe(1);
  });

  it('blends automatic and authored target/FOV at edge-local distance progress', () => {
    const motion = createCameraMotion(createEnvelopeRoute(), undefined, {
      durationSeconds: 10,
      easing: 'linear'
    });
    const automatic = sampleFull(motion, 0.1);
    expectVectorClose(automatic.target, new Vector3(1, 0, 2), 12);
    expect(automatic.fov).toBe(42);

    const fractional = sampleFull(motion, 0.3);
    expectVectorClose(fractional.target, new Vector3(3, 1.2, 2.6), 10);
    expect(fractional.fov).toBeCloseTo(55, 10);

    const authored = sampleFull(motion, 0.5);
    expect(authored.target.toArray()).toEqual([5, 4, 4]);
    expect(authored.fov).toBe(80);
  });

  it('pins enveloped endpoints and preserves caller-owned vectors and inputs', () => {
    const route = createEnvelopeRoute();
    const original = structuredClone(route);
    const firstMotion = createCameraMotion(route, undefined, { easing: 'linear' });
    const secondMotion = createCameraMotion(route, undefined, { easing: 'linear' });
    const output = createCameraMotionSample();
    const position = output.position;
    const target = output.target;

    sampleCameraMotion(firstMotion, 0, output);
    expect(output.position.toArray()).toEqual([0, 0, 0]);
    expect(output.target.toArray()).toEqual([0, 0, 2]);
    expect(output.fov).toBe(40);
    sampleCameraMotion(firstMotion, 1, output);
    expect(output.position.toArray()).toEqual([10, 0, 0]);
    expect(output.target.toArray()).toEqual([10, 0, 2]);
    expect(output.fov).toBe(60);
    expect(output.position).toBe(position);
    expect(output.target).toBe(target);
    expect(route).toEqual(original);
    expect(firstMotion.edgeViews[0]).not.toBe(secondMotion.edgeViews[0]);
    expect(firstMotion.edgeViews[0]?.automaticTargetPath).not.toBe(
      secondMotion.edgeViews[0]?.automaticTargetPath
    );
  });

  it('uses the oriented envelope for reverse keys and ignores envelopes without keys', () => {
    const reversed = createCameraMotion(createEnvelopeRoute({
      direction: 'reverse'
    }), undefined, { durationSeconds: 10, easing: 'linear' });
    const reversedFractional = sampleFull(reversed, 0.3);
    expectVectorClose(
      reversedFractional.target,
      new Vector3(3, 1.2, 2.6),
      10
    );

    const withoutKeys = createCameraMotion(createEnvelopeRoute({
      viewTrack: {
        start: { cameraTarget: [0, 0, 2], fov: 40 },
        keyframes: [],
        end: { cameraTarget: [10, 0, 2], fov: 60 },
        framingEnvelope: envelope
      }
    }), undefined, { easing: 'linear' });
    expect(withoutKeys.usesLegacyTargetPath).toBe(true);
    expectVectorClose(
      sampleFull(withoutKeys, 0.3).target,
      new Vector3(3, 0, 2),
      12
    );
  });

  it('keeps a collinear-zero blend finite, continuous, and outside near clip', () => {
    const route = createEnvelopeRoute({
      viewTrack: {
        start: { cameraTarget: [0, 0, 1], fov: 54 },
        keyframes: [{
          id: 'cross-through-eye',
          progress: 0.5,
          cameraTarget: [5, 0, -1],
          fov: 54
        }],
        end: { cameraTarget: [10, 0, 1], fov: 54 },
        framingEnvelope: {
          enterStart: 0,
          enterEnd: 1,
          exitStart: 1,
          exitEnd: 1
        }
      },
      automaticTargetPoints: [[0, 0, 1], [10, 0, 1]]
    });
    const motion = createCameraMotion(route, undefined, { easing: 'linear' });
    const before = sampleFull(motion, 0.499);
    const center = sampleFull(motion, 0.5);
    const after = sampleFull(motion, 0.501);
    for (const result of [before, center, after]) {
      expect(result.target.toArray().every(Number.isFinite)).toBe(true);
      expect(result.target.distanceTo(result.position)).toBeGreaterThanOrEqual(
        VISITOR_CAMERA_PROJECTION.near - 1e-12
      );
    }
    expect(before.target.clone().sub(before.position).dot(
      after.target.clone().sub(after.position)
    )).toBeGreaterThan(0);
  });

  it('bounds POI angular rate deterministically for forward and random seeks', () => {
    const route = createEnvelopeRoute({
      viewTrack: {
        start: { cameraTarget: [5, 0, 0], fov: 54 },
        keyframes: [{
          id: 'fixed-poi',
          progress: 0.5,
          cameraTarget: [5, 0.001, 0],
          fov: 54
        }],
        end: { cameraTarget: [5, 0, 0], fov: 54 },
        framingEnvelope: {
          enterStart: 0,
          enterEnd: 0,
          exitStart: 1,
          exitEnd: 1
        }
      },
      automaticTargetPoints: [[5, 0, 0], [5, 0, 0]]
    });
    const motion = createCameraMotion(route, undefined, {
      durationSeconds: 2,
      easing: 'linear'
    });
    const progresses = Array.from({ length: 101 }, (_, index) => index / 100);
    const forward = new Map(
      progresses.map((progress) => [progress, sampleFull(motion, progress).target.toArray()])
    );
    const randomOrder = progresses.map(
      (_progress, index) => progresses[(index * 37) % progresses.length]
    );
    for (const progress of randomOrder) {
      expect(sampleFull(motion, progress).target.toArray()).toEqual(
        forward.get(progress)
      );
    }
    for (let index = 1; index < progresses.length; index += 1) {
      const previous = sampleFull(motion, progresses[index - 1]);
      const current = sampleFull(motion, progresses[index]);
      const angle = previous.target.clone().sub(previous.position).angleTo(
        current.target.clone().sub(current.position)
      );
      const rate = angle / (2 / 100);
      expect(rate).toBeLessThanOrEqual(
        CAMERA_FRAMING_GUARD_POLICY.maxAngularRateRadiansPerSecond * 1.1
      );
    }
  });

  it('bypasses only a hazardous late off-axis exit', () => {
    const hazardousRoute = createEnvelopeRoute({
      viewTrack: {
        start: { cameraTarget: [0, 0, 5], fov: 54 },
        keyframes: [{
          id: 'hold-subject',
          progress: 0.8,
          cameraTarget: [8, 0, 5],
          fov: 54
        }],
        end: { cameraTarget: [10, 0, 5], fov: 54 },
        framingEnvelope: {
          enterStart: 0,
          enterEnd: 0,
          exitStart: 0.8,
          exitEnd: 0.9
        }
      },
      automaticTargetPoints: [[0, 0, 5], [30, 0, -5], [10, 0, 5]]
    });
    const hazardous = createCameraMotion(hazardousRoute, undefined, {
      durationSeconds: 0.5,
      easing: 'linear'
    });
    const enoughTime = createCameraMotion(hazardousRoute, undefined, {
      durationSeconds: 10,
      easing: 'linear'
    });
    const aligned = createCameraMotion(createEnvelopeRoute({
      viewTrack: hazardousRoute.edges![0].viewTrack,
      automaticTargetPoints: [[0, 0, 5], [10, 0, 5]]
    }), undefined, { durationSeconds: 0.5, easing: 'linear' });

    expect(hazardous.edgeViews[0]?.guard?.bypass).not.toBeNull();
    expect(enoughTime.edgeViews[0]?.guard?.bypass ?? null).toBeNull();
    expect(aligned.edgeViews[0]?.guard?.bypass ?? null).toBeNull();
    expect(sampleFull(hazardous, 1).target.toArray()).toEqual([10, 0, 5]);
  });
});

describe('P1.3 guard repairs', () => {
  it('interpolates antipodal guard directions along a deterministic great circle', () => {
    // The automatic gaze holds a fixed point of interest (so the raw blended
    // gaze swings through ~180 deg inside the envelope), forcing the
    // over-capacity fallback onto an antipodal chord from +x to -x.
    const route: CameraRoute = {
      positionParts: [{
        kind: 'rounded-polyline',
        points: [[0, 0, 0], [5, 0, 0], [10, 0, 0]]
      }],
      targetPoints: [[5, 0, 0], [5, 0, 0], [5, 0, 0]],
      startFov: 54,
      endFov: 54,
      edges: [{
        connectionId: 'antipodal',
        direction: 'forward',
        fromNodeId: 'a',
        toNodeId: 'b',
        positionSpan: {
          start: { partIndex: 0, pointIndex: 0 },
          end: { partIndex: 0, pointIndex: 2 }
        },
        viewTrack: {
          start: { cameraTarget: [5, 0, 0], fov: 54 },
          keyframes: [{
            id: 'ahead-of-eye',
            progress: 0.5,
            cameraTarget: [5, 0, 1],
            fov: 54
          }],
          end: { cameraTarget: [5, 0, 0], fov: 54 },
          framingEnvelope: {
            enterStart: 0.3,
            enterEnd: 0.4,
            exitStart: 0.5,
            exitEnd: 0.6
          }
        },
        automaticTargetPoints: [[5, 0, 0], [5, 0, 0]]
      }]
    };
    const motion = createCameraMotion(route, undefined, {
      durationSeconds: 1.5,
      easing: 'linear'
    });
    const guard = motion.edgeViews[0]?.guard;
    expect(guard).not.toBeNull();
    expect(guard?.limitsAngularRate).toBe(true);

    // Mid-chord the corrected gaze must ride the deterministic great circle
    // (through +z here), never the stall-then-flip of linear interpolation and
    // never collapsing the target onto the position.
    const center = sampleFull(motion, 0.45);
    const centerDirection = center.target.clone().sub(center.position);
    expect(centerDirection.length()).toBeGreaterThan(0);
    expect(centerDirection.normalize().z).toBeGreaterThan(0.9);
    expect(center.target.distanceTo(center.position)).toBeGreaterThanOrEqual(
      VISITOR_CAMERA_PROJECTION.near - 1e-12
    );
    expect(center.target.toArray().every(Number.isFinite)).toBe(true);

    for (const progress of [10 / 24, 11 / 24, 12 / 24]) {
      const result = sampleFull(motion, progress);
      const direction = result.target.clone().sub(result.position).normalize();
      expect(direction.z).toBeGreaterThan(0.5);
      expect(direction.x).toBeLessThan(0.7);
    }

    const progresses = Array.from({ length: 101 }, (_, index) => index / 100);
    const forward = new Map(
      progresses.map((progress) => [
        progress,
        sampleFull(motion, progress).target.toArray()
      ])
    );
    const randomOrder = progresses.map(
      (_progress, index) => progresses[(index * 37) % progresses.length]
    );
    for (const progress of randomOrder) {
      expect(sampleFull(motion, progress).target.toArray()).toEqual(
        forward.get(progress)
      );
    }
    for (const progress of progresses) {
      const result = sampleFull(motion, progress);
      expect(result.target.distanceTo(result.position)).toBeGreaterThanOrEqual(
        VISITOR_CAMERA_PROJECTION.near - 1e-12
      );
    }
  });

  it('restricts over-capacity correction to the envelope-active interval', () => {
    // The automatic gaze turns sharply near the start of the edge while the
    // authored keys swing the gaze inside the envelope, so an over-capacity
    // fallback that remapped the full edge would visibly rewrite the automatic
    // framing outside the envelope.
    const route: CameraRoute = {
      positionParts: [{
        kind: 'rounded-polyline',
        points: [[0, 0, 0], [5, 0, 0], [10, 0, 0]]
      }],
      targetPoints: [[1.5, 0, 0.5], [1.5, 0, 0.5], [1.5, 0, 0.5]],
      startFov: 54,
      endFov: 54,
      edges: [{
        connectionId: 'pinned',
        direction: 'forward',
        fromNodeId: 'a',
        toNodeId: 'b',
        positionSpan: {
          start: { partIndex: 0, pointIndex: 0 },
          end: { partIndex: 0, pointIndex: 2 }
        },
        viewTrack: {
          start: { cameraTarget: [1.5, 0, 0.5], fov: 54 },
          keyframes: [{
            id: 'swing-behind',
            progress: 0.55,
            cameraTarget: [5, 0, 5],
            fov: 54
          }],
          end: { cameraTarget: [1.5, 0, 0.5], fov: 54 },
          framingEnvelope: {
            enterStart: 0.4,
            enterEnd: 0.5,
            exitStart: 0.6,
            exitEnd: 0.7
          }
        },
        automaticTargetPoints: [[1.5, 0, 0.5], [1.5, 0, 0.5], [1.5, 0, 0.5]]
      }]
    };
    const guarded = createCameraMotion(route, undefined, {
      durationSeconds: 1.5,
      easing: 'linear'
    });
    const reference = createCameraMotion({
      positionParts: route.positionParts,
      targetPoints: route.targetPoints
    });
    const guard = guarded.edgeViews[0]?.guard;
    expect(guard).not.toBeNull();
    expect(guard?.limitsAngularRate).toBe(true);

    // Where the envelope weight is zero the guarded framing must equal the
    // unguarded automatic framing exactly (samples land on the base grid).
    for (let segment = 0; segment <= 24; segment += 1) {
      const progress = segment / 24;
      const weight = sampleFramingEnvelopeWeight(
        route.edges![0].viewTrack!.framingEnvelope!,
        progress
      );
      if (weight > 0) continue;
      const guardedSample = sampleFull(guarded, progress);
      const referenceSample = sampleFull(reference, progress);
      expectVectorClose(guardedSample.target, referenceSample.target, 6);
    }

    const interior = sampleFull(guarded, 0.55);
    expect(interior.target.distanceTo(interior.position)).toBeGreaterThanOrEqual(
      VISITOR_CAMERA_PROJECTION.near - 1e-12
    );

    const progresses = Array.from({ length: 101 }, (_, index) => index / 100);
    const forward = new Map(
      progresses.map((progress) => [
        progress,
        sampleFull(guarded, progress).target.toArray()
      ])
    );
    const randomOrder = progresses.map(
      (_progress, index) => progresses[(index * 37) % progresses.length]
    );
    for (const progress of randomOrder) {
      expect(sampleFull(guarded, progress).target.toArray()).toEqual(
        forward.get(progress)
      );
    }
  });
});

describe('P1.6 framing guard-status accessor (F3)', () => {
  function guardRoute(options: {
    viewTrack: NonNullable<CameraRoute['edges']>[number]['viewTrack'];
    automaticTargetPoints: [number, number, number][];
    positionPoints?: [number, number, number][];
    targetPoints?: [number, number, number][];
  }): CameraRoute {
    const positionPoints = options.positionPoints ?? [[0, 0, 0], [10, 0, 0]];
    const targetPoints = options.targetPoints ?? [[0, 0, 2], [10, 0, 2]];
    return {
      positionParts: [{ kind: 'rounded-polyline', points: positionPoints }],
      targetPoints,
      startFov: 54,
      endFov: 54,
      edges: [{
        connectionId: 'guarded',
        direction: 'forward',
        fromNodeId: 'a',
        toNodeId: 'b',
        positionSpan: {
          start: { partIndex: 0, pointIndex: 0 },
          end: { partIndex: 0, pointIndex: positionPoints.length - 1 }
        },
        viewTrack: options.viewTrack,
        automaticTargetPoints: options.automaticTargetPoints
      }]
    };
  }

  const angularLimitRoute = () => guardRoute({
    positionPoints: [[0, 0, 0], [5, 0, 0], [10, 0, 0]],
    targetPoints: [[5, 0, 0], [5, 0, 0], [5, 0, 0]],
    automaticTargetPoints: [[5, 0, 0], [5, 0, 0]],
    viewTrack: {
      start: { cameraTarget: [5, 0, 0], fov: 54 },
      keyframes: [{
        id: 'ahead-of-eye',
        progress: 0.5,
        cameraTarget: [5, 0, 1],
        fov: 54
      }],
      end: { cameraTarget: [5, 0, 0], fov: 54 },
      framingEnvelope: {
        enterStart: 0.3,
        enterEnd: 0.4,
        exitStart: 0.5,
        exitEnd: 0.6
      }
    }
  });

  const bypassRoute = () => guardRoute({
    automaticTargetPoints: [[0, 0, 5], [30, 0, -5], [10, 0, 5]],
    viewTrack: {
      start: { cameraTarget: [0, 0, 5], fov: 54 },
      keyframes: [{
        id: 'hold-subject',
        progress: 0.8,
        cameraTarget: [8, 0, 5],
        fov: 54
      }],
      end: { cameraTarget: [10, 0, 5], fov: 54 },
      framingEnvelope: {
        enterStart: 0,
        enterEnd: 0,
        exitStart: 0.8,
        exitEnd: 0.9
      }
    }
  });

  const standoffRoute = () => guardRoute({
    targetPoints: [[0.15, 0, 0], [10.15, 0, 0]],
    automaticTargetPoints: [[0.15, 0, 0], [10.15, 0, 0]],
    viewTrack: {
      start: { cameraTarget: [0.15, 0, 0], fov: 54 },
      keyframes: [{
        id: 'track-ahead',
        progress: 0.5,
        cameraTarget: [5.15, 0, 0],
        fov: 54
      }],
      end: { cameraTarget: [10.15, 0, 0], fov: 54 },
      framingEnvelope: {
        enterStart: 0,
        enterEnd: 0,
        exitStart: 1,
        exitEnd: 1
      }
    }
  });

  // Targets hug the camera path (standoff danger) in the automatic region
  // while the authored key swings the camera off-axis (angular-rate limit).
  // Both flags must be reported simultaneously — the case a synthetic
  // standoff heuristic could not distinguish.
  const standoffWithAngularLimitRoute = () => guardRoute({
    positionPoints: [[0, 0, 0], [5, 0, 0], [10, 0, 0]],
    targetPoints: [[0.15, 0, 0], [5.15, 0, 0], [10.15, 0, 0]],
    automaticTargetPoints: [[0.15, 0, 0], [10.15, 0, 0]],
    viewTrack: {
      start: { cameraTarget: [0.15, 0, 0], fov: 54 },
      keyframes: [{
        id: 'swing-off-path',
        progress: 0.5,
        cameraTarget: [5, 0, 1],
        fov: 54
      }],
      end: { cameraTarget: [10.15, 0, 0], fov: 54 },
      framingEnvelope: {
        enterStart: 0.3,
        enterEnd: 0.4,
        exitStart: 0.5,
        exitEnd: 0.6
      }
    }
  });

  it('exposes angular-limit, bypass, and standoff status from the compiled guard', () => {
    const angular = createCameraMotion(angularLimitRoute(), undefined, {
      durationSeconds: 1.5,
      easing: 'linear'
    });
    expect(readCameraFramingGuardStatus(angular, 0)).toEqual({
      limitsAngularRate: true,
      hasBypass: false,
      hasStandoff: false
    } satisfies CameraFramingGuardStatus);

    const bypass = createCameraMotion(bypassRoute(), undefined, {
      durationSeconds: 0.5,
      easing: 'linear'
    });
    expect(bypass.edgeViews[0]?.guard?.bypass).not.toBeNull();
    expect(readCameraFramingGuardStatus(bypass, 0)).toEqual({
      limitsAngularRate: bypass.edgeViews[0]!.guard!.limitsAngularRate,
      hasBypass: true,
      hasStandoff: false
    } satisfies CameraFramingGuardStatus);

    const standoff = createCameraMotion(standoffRoute(), undefined, {
      durationSeconds: 10,
      easing: 'linear'
    });
    const standoffGuard = standoff.edgeViews[0]?.guard;
    expect(standoffGuard).not.toBeNull();
    expect(standoffGuard?.limitsAngularRate).toBe(false);
    expect(standoffGuard?.bypass).toBeNull();
    expect(readCameraFramingGuardStatus(standoff, 0)).toEqual({
      limitsAngularRate: false,
      hasBypass: false,
      hasStandoff: true
    } satisfies CameraFramingGuardStatus);
  });

  it('reports standoff accurately when it coexists with angular-rate limiting', () => {
    const motion = createCameraMotion(standoffWithAngularLimitRoute(), undefined, {
      durationSeconds: 1.5,
      easing: 'linear'
    });
    const guard = motion.edgeViews[0]?.guard;
    expect(guard).not.toBeNull();
    expect(guard?.hasStandoffDanger).toBe(true);
    expect(guard?.limitsAngularRate).toBe(true);
    expect(readCameraFramingGuardStatus(motion, 0)).toEqual({
      limitsAngularRate: true,
      hasBypass: false,
      hasStandoff: true
    } satisfies CameraFramingGuardStatus);
  });

  it('returns null for an unguarded or out-of-range edge', () => {
    const motion = createCameraMotion(guardRoute({
      automaticTargetPoints: [[0, 0, 2], [10, 0, 2]],
      viewTrack: {
        start: { cameraTarget: [0, 0, 2], fov: 40 },
        keyframes: [],
        end: { cameraTarget: [10, 0, 2], fov: 60 },
        framingEnvelope: {
          enterStart: 0.2,
          enterEnd: 0.4,
          exitStart: 0.8,
          exitEnd: 1
        }
      }
    }), undefined, { durationSeconds: 10, easing: 'linear' });
    expect(readCameraFramingGuardStatus(motion, 0)).toBeNull();
    expect(readCameraFramingGuardStatus(motion, -1)).toBeNull();
    expect(readCameraFramingGuardStatus(motion, 1)).toBeNull();
    expect(readCameraFramingGuardStatus(motion, 1.5)).toBeNull();
  });

  it('reading guard status leaves sampled motion output byte-identical', () => {
    const motion = createCameraMotion(angularLimitRoute(), undefined, {
      durationSeconds: 1.5,
      easing: 'linear'
    });
    const output = createCameraMotionSample();
    sampleCameraMotion(motion, 0.45, output);
    const before = {
      position: output.position.toArray(),
      target: output.target.toArray(),
      fov: output.fov
    };
    readCameraFramingGuardStatus(motion, 0);
    sampleCameraMotion(motion, 0.45, output);
    const after = {
      position: output.position.toArray(),
      target: output.target.toArray(),
      fov: output.fov
    };
    expect(after).toEqual(before);
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

describe('Phase 3.7 easing library', () => {
  const easings: CameraEasing[] = [
    'linear',
    'smoothstep',
    'smootherstep',
    'ease-in',
    'ease-out',
    'ease-in-out'
  ];

  it('keeps every easing pinned at the endpoints', () => {
    for (const easing of easings) {
      expect(cameraApplyEasing(easing, 0)).toBe(0);
      expect(cameraApplyEasing(easing, 1)).toBe(1);
      expect(cameraInverseEasing(easing, 0)).toBe(0);
      expect(cameraInverseEasing(easing, 1)).toBe(1);
    }
  });

  it('matches a hand-rolled sample for every easing', () => {
    expect(cameraApplyEasing('linear', 0.4)).toBeCloseTo(0.4, 12);
    expect(cameraApplyEasing('ease-in', 0.4)).toBeCloseTo(0.16, 12);
    expect(cameraApplyEasing('ease-out', 0.4)).toBeCloseTo(0.64, 12);
    expect(cameraApplyEasing('smoothstep', 0.4)).toBeCloseTo(0.352, 12);
    expect(cameraApplyEasing('ease-in-out', 0.4)).toBeCloseTo(0.352, 12);
    expect(cameraApplyEasing('smootherstep', 0.4)).toBeCloseTo(0.31744, 12);
  });

  it('inverts round-trip deterministically', () => {
    for (const easing of easings) {
      for (const t of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
        const eased = cameraApplyEasing(easing, t);
        expect(cameraInverseEasing(easing, eased)).toBeCloseTo(t, 6);
      }
    }
  });
});

describe('Phase 3.7 authored motion duration + easing', () => {
  const route: CameraRoute = {
    positionParts: [{ kind: 'auto-bezier', anchors: [[0, 0, 0], [10, 0, 0], [20, 0, 0]] }],
    targetPoints: [[0, 0, -1], [0, 0, -1], [0, 0, -1]],
    startFov: 54,
    endFov: 54
  };

  it('returns the rate-derived duration under the clamp by default', () => {
    const motion = createCameraMotion(route);
    expect(motion.durationSeconds).toBeGreaterThan(CAMERA_MOTION_TIMING.minDurationSeconds - 1e-6);
    expect(motion.durationSeconds).toBeLessThan(CAMERA_MOTION_TIMING.maxDurationSeconds + 1e-6);
    expect(motion.easing).toBe('smootherstep');
  });

  it('honors an authored override for duration + easing without clamping', () => {
    const motion = createCameraMotion(route, undefined, {
      durationSeconds: 7.5,
      easing: 'ease-in'
    });
    expect(motion.durationSeconds).toBe(7.5);
    expect(motion.easing).toBe('ease-in');
  });

  it('lets resolveCameraMotionDuration fall back without an override', () => {
    expect(resolveCameraMotionDuration(undefined, 0, 1)).toBe(0);
    const override = resolveCameraMotionDuration(9, 30, 3);
    expect(override).toBe(9);
  });
});

// ============================================================================
// P1.4 — dense whole-transition acceptance matrices (2026-08-19)
// ============================================================================
// Deterministic fixture matrices sample edge-local distance progress densely
// (base grid of >= 1001 values plus exact envelope bounds, key progresses,
// compiled guard sample progresses, and ±epsilon neighborhoods) and map every
// value to the motion playhead with `cameraMotionProgressAtEdgeProgress`. A
// uniform global playhead grid is insufficient for multi-edge envelope/ramp
// assertions.

const EDGE_LOCAL_EPSILON = 1e-6;
const NON_DEGENERACY_EPSILON = 1e-9;
const RATE_BOUND_TOLERANCE = 1e-6;

type DenseMotionFixture = {
  label: string;
  route: CameraRoute;
  options?: { durationSeconds?: number; easing?: CameraEasing };
  /** True when the envelope carries an intentional zero-width ramp step. */
  zeroWidthRamp?: boolean;
};

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function greatestCommonDivisor(left: number, right: number): number {
  return right === 0 ? left : greatestCommonDivisor(right, left % right);
}

function coprimeStep(count: number) {
  let step = 2;
  while (step < count) {
    if (greatestCommonDivisor(step, count) === 1) return step;
    step += 1;
  }
  return 1;
}

function motionFovRange(motion: ReturnType<typeof createCameraMotion>) {
  const edgeView = motion.edgeViews[0];
  const values = edgeView ? edgeView.points.map((point) => point.fov) : [];
  return {
    min: Math.min(...values),
    max: Math.max(...values)
  };
}

/**
 * The dense playhead set for one edge: base grid, envelope bounds, keyframe
 * progresses, compiled guard sample progresses, and ±epsilon neighborhoods,
 * each mapped through the engine's exact edge→playhead mapping.
 */
function buildDensePlayheads(
  motion: ReturnType<typeof createCameraMotion>,
  edgeIndex: number
) {
  const values = new Set<number>();
  for (let index = 0; index <= 1000; index += 1) {
    values.add(index / 1000);
  }
  const edgeView = motion.edgeViews[edgeIndex];
  if (edgeView) {
    const envelope = edgeView.framingEnvelope;
    if (envelope) {
      for (const bound of [
        envelope.enterStart,
        envelope.enterEnd,
        envelope.exitStart,
        envelope.exitEnd
      ]) {
        values.add(clamp01(bound));
        values.add(clamp01(bound - EDGE_LOCAL_EPSILON));
        values.add(clamp01(bound + EDGE_LOCAL_EPSILON));
      }
    }
    for (const point of edgeView.points) {
      values.add(clamp01(point.progress));
      values.add(clamp01(point.progress - EDGE_LOCAL_EPSILON));
      values.add(clamp01(point.progress + EDGE_LOCAL_EPSILON));
    }
    const guard = edgeView.guard;
    if (guard) {
      for (const direction of guard.directions) {
        values.add(clamp01(direction.progress));
        values.add(clamp01(direction.progress - EDGE_LOCAL_EPSILON));
        values.add(clamp01(direction.progress + EDGE_LOCAL_EPSILON));
      }
    }
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.map((edgeProgress) => ({
    edgeProgress,
    progress: cameraMotionProgressAtEdgeProgress(motion, edgeIndex, edgeProgress)
  }));
}

/**
 * The exact per-sample time the engine uses: the playhead mapped back through
 * inverse easing of the edge-local value placed in its compiled global span.
 */
function derivedTimeAtEdgeProgress(
  motion: ReturnType<typeof createCameraMotion>,
  edgeIndex: number,
  edgeProgress: number
) {
  return (
    cameraMotionProgressAtEdgeProgress(motion, edgeIndex, edgeProgress) *
    motion.durationSeconds
  );
}

function gazeDirection(result: ReturnType<typeof createCameraMotionSample>) {
  return result.target.clone().sub(result.position).normalize();
}

function sampleAtEdgeProgress(
  motion: ReturnType<typeof createCameraMotion>,
  edgeIndex: number,
  edgeProgress: number
) {
  return sampleFull(
    motion,
    cameraMotionProgressAtEdgeProgress(motion, edgeIndex, edgeProgress)
  );
}

function maxAdjacentGazeAngle(
  motion: ReturnType<typeof createCameraMotion>,
  edgeIndex: number,
  edgeProgresses: readonly number[]
) {
  let maximum = 0;
  for (let index = 1; index < edgeProgresses.length; index += 1) {
    const previous = sampleAtEdgeProgress(
      motion,
      edgeIndex,
      edgeProgresses[index - 1]
    );
    const current = sampleAtEdgeProgress(motion, edgeIndex, edgeProgresses[index]);
    maximum = Math.max(
      maximum,
      gazeDirection(previous).angleTo(gazeDirection(current))
    );
  }
  return maximum;
}

function totalGazeSwing(
  motion: ReturnType<typeof createCameraMotion>,
  edgeIndex: number,
  edgeProgresses: readonly number[]
) {
  let total = 0;
  for (let index = 1; index < edgeProgresses.length; index += 1) {
    const previous = sampleAtEdgeProgress(
      motion,
      edgeIndex,
      edgeProgresses[index - 1]
    );
    const current = sampleAtEdgeProgress(motion, edgeIndex, edgeProgresses[index]);
    total += gazeDirection(previous).angleTo(gazeDirection(current));
  }
  return total;
}

function denseMaxAngularRate(
  motion: ReturnType<typeof createCameraMotion>,
  edgeIndex: number,
  samples: readonly { edgeProgress: number; progress: number }[]
) {
  let maximum = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const previousSample = sampleFull(motion, previous.progress);
    const currentSample = sampleFull(motion, current.progress);
    const angle = gazeDirection(previousSample).angleTo(gazeDirection(currentSample));
    const deltaTime =
      derivedTimeAtEdgeProgress(motion, edgeIndex, current.edgeProgress) -
      derivedTimeAtEdgeProgress(motion, edgeIndex, previous.edgeProgress);
    if (deltaTime <= 0) continue;
    maximum = Math.max(maximum, angle / deltaTime);
  }
  return maximum;
}

/**
 * The public sampler's expected peak: each adjacent pair of compiled guard
 * directions swept by the smootherstep interpolation reaches
 * `angle / segmentTime × angularInterpolationPeakRateFactor`; the expected
 * peak is their maximum.
 */
function compiledAngularPeak(
  motion: ReturnType<typeof createCameraMotion>,
  edgeIndex: number
) {
  const guard = motion.edgeViews[edgeIndex]?.guard;
  if (!guard) return null;
  const directions = guard.directions;
  let peak = 0;
  for (let index = 0; index < directions.length - 1; index += 1) {
    const start = new Vector3(
      directions[index].directionX,
      directions[index].directionY,
      directions[index].directionZ
    );
    const end = new Vector3(
      directions[index + 1].directionX,
      directions[index + 1].directionY,
      directions[index + 1].directionZ
    );
    const segmentAngle = start.angleTo(end);
    const deltaTime =
      derivedTimeAtEdgeProgress(motion, edgeIndex, directions[index + 1].progress) -
      derivedTimeAtEdgeProgress(motion, edgeIndex, directions[index].progress);
    if (deltaTime <= 0) continue;
    peak = Math.max(
      peak,
      (segmentAngle / deltaTime) *
        CAMERA_FRAMING_GUARD_POLICY.angularInterpolationPeakRateFactor
    );
  }
  return peak;
}

function assertNonDegenerateSamples(
  motion: ReturnType<typeof createCameraMotion>,
  samples: readonly { progress: number }[],
  fovRange: { min: number; max: number }
) {
  for (const { progress } of samples) {
    const result = sampleFull(motion, progress);
    expect(result.position.toArray().every(Number.isFinite)).toBe(true);
    expect(result.target.toArray().every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(result.fov)).toBe(true);
    const distance = result.position.distanceTo(result.target);
    expect(distance).toBeGreaterThanOrEqual(
      VISITOR_CAMERA_PROJECTION.near - NON_DEGENERACY_EPSILON
    );
    expect(gazeDirection(result).toArray().every(Number.isFinite)).toBe(true);
    expect(result.fov).toBeGreaterThanOrEqual(
      MUSEUM_CAMERA_FOV.min - NON_DEGENERACY_EPSILON
    );
    expect(result.fov).toBeLessThanOrEqual(
      MUSEUM_CAMERA_FOV.max + NON_DEGENERACY_EPSILON
    );
    expect(result.fov).toBeGreaterThanOrEqual(fovRange.min - NON_DEGENERACY_EPSILON);
    expect(result.fov).toBeLessThanOrEqual(fovRange.max + NON_DEGENERACY_EPSILON);
  }
}

/** Forward, reversed, and fixed-coprime-permuted seeks return bit-identical targets. */
function assertSeekOrderStable(
  motion: ReturnType<typeof createCameraMotion>,
  samples: readonly { progress: number }[]
) {
  const count = samples.length;
  const step = coprimeStep(count);
  const forward = samples.map((sample) =>
    sampleFull(motion, sample.progress).target.toArray()
  );
  for (let index = 0; index < count; index += 1) {
    const reversedIndex = count - 1 - index;
    expect(sampleFull(motion, samples[reversedIndex].progress).target.toArray()).toEqual(
      forward[reversedIndex]
    );
  }
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    expect(sampleFull(motion, samples[cursor].progress).target.toArray()).toEqual(
      forward[cursor]
    );
    cursor = (cursor + step) % count;
  }
}

/** Halving the uniform edge-local step must shrink the max adjacent angle (continuity). */
function assertUniformHalvingConvergence(
  motion: ReturnType<typeof createCameraMotion>,
  edgeIndex: number
) {
  const coarse = Array.from({ length: 1001 }, (_, index) => index / 1000);
  const fine = Array.from({ length: 2001 }, (_, index) => index / 2000);
  const coarseAngle = maxAdjacentGazeAngle(motion, edgeIndex, coarse);
  const fineAngle = maxAdjacentGazeAngle(motion, edgeIndex, fine);
  expect(fineAngle).toBeLessThanOrEqual(coarseAngle * 0.9 + 1e-12);
}

/** Around every compiled guard boundary, halving the step converges instead of revealing a fixed jump. */
function assertGuardBoundaryConvergence(
  motion: ReturnType<typeof createCameraMotion>,
  edgeIndex: number
) {
  const guard = motion.edgeViews[edgeIndex]?.guard;
  if (!guard) return;
  for (const direction of guard.directions) {
    const center = direction.progress;
    const coarse = [
      clamp01(center - 4e-3),
      clamp01(center - 2e-3),
      center,
      clamp01(center + 2e-3),
      clamp01(center + 4e-3)
    ];
    const fine = [
      clamp01(center - 2e-3),
      clamp01(center - 1e-3),
      center,
      clamp01(center + 1e-3),
      clamp01(center + 2e-3)
    ];
    const coarseAngle = maxAdjacentGazeAngle(motion, edgeIndex, coarse);
    const fineAngle = maxAdjacentGazeAngle(motion, edgeIndex, fine);
    expect(fineAngle).toBeLessThanOrEqual(coarseAngle * 0.9 + 1e-12);
  }
}

const ORDINARY_ENVELOPE = {
  enterStart: 0.2,
  enterEnd: 0.4,
  exitStart: 0.8,
  exitEnd: 1
} as const;

function createOrdinaryRoute(
  envelope: RuntimeCameraFramingEnvelope = ORDINARY_ENVELOPE,
  overrides: Partial<NonNullable<CameraRoute['edges']>[number]> = {}
): CameraRoute {
  return {
    positionParts: [{
      kind: 'rounded-polyline',
      points: [[0, 0, 0], [10, 0, 0]]
    }],
    targetPoints: [[0, 0, 2], [10, 0, 2]],
    startFov: 40,
    endFov: 60,
    edges: [{
      connectionId: 'enveloped',
      direction: 'forward',
      fromNodeId: 'a',
      toNodeId: 'b',
      positionSpan: {
        start: { partIndex: 0, pointIndex: 0 },
        end: { partIndex: 0, pointIndex: 1 }
      },
      viewTrack: {
        start: { cameraTarget: [0, 0, 2], fov: 40 },
        keyframes: [{
          id: 'subject',
          progress: 0.5,
          cameraTarget: [5, 4, 4],
          fov: 80
        }],
        end: { cameraTarget: [10, 0, 2], fov: 60 },
        framingEnvelope: envelope
      },
      automaticTargetPoints: [[0, 0, 2], [10, 0, 2]],
      ...overrides
    }]
  };
}

const DENSE_FIXTURES: DenseMotionFixture[] = [
  {
    label: 'ordinary blend',
    route: createOrdinaryRoute(),
    options: { durationSeconds: 6, easing: 'linear' }
  },
  {
    label: 'exact collinear-zero straddle',
    route: createOrdinaryRoute(
      { enterStart: 0, enterEnd: 1, exitStart: 1, exitEnd: 1 },
      {
        viewTrack: {
          start: { cameraTarget: [0, 0, 1], fov: 54 },
          keyframes: [{
            id: 'cross-through-eye',
            progress: 0.5,
            cameraTarget: [5, 0, -1],
            fov: 54
          }],
          end: { cameraTarget: [10, 0, 1], fov: 54 },
          framingEnvelope: { enterStart: 0, enterEnd: 1, exitStart: 1, exitEnd: 1 }
        },
        automaticTargetPoints: [[0, 0, 1], [10, 0, 1]]
      }
    ),
    options: { durationSeconds: 6, easing: 'linear' }
  },
  {
    label: 'epsilon-offset straddle',
    route: createOrdinaryRoute(
      { enterStart: 0.4, enterEnd: 0.5, exitStart: 0.5, exitEnd: 0.6 },
      {
        viewTrack: {
          start: { cameraTarget: [0, 0, 1], fov: 54 },
          keyframes: [{
            id: 'nearly-through-eye',
            progress: 0.5,
            cameraTarget: [5, 0, -0.001],
            fov: 54
          }],
          end: { cameraTarget: [10, 0, 1], fov: 54 },
          framingEnvelope: { enterStart: 0.4, enterEnd: 0.5, exitStart: 0.5, exitEnd: 0.6 }
        },
        automaticTargetPoints: [[0, 0, 1], [10, 0, 1]]
      }
    ),
    options: { durationSeconds: 6, easing: 'linear' }
  },
  {
    label: 'near-antipodal POI swing',
    route: createOrdinaryRoute(
      { enterStart: 0.3, enterEnd: 0.4, exitStart: 0.5, exitEnd: 0.6 },
      {
        viewTrack: {
          start: { cameraTarget: [5, 0, 0], fov: 54 },
          keyframes: [{
            id: 'ahead-of-eye',
            progress: 0.5,
            cameraTarget: [5, 0, 1],
            fov: 54
          }],
          end: { cameraTarget: [5, 0, 0], fov: 54 },
          framingEnvelope: { enterStart: 0.3, enterEnd: 0.4, exitStart: 0.5, exitEnd: 0.6 }
        },
        automaticTargetPoints: [[5, 0, 0], [5, 0, 0]]
      }
    ),
    options: { durationSeconds: 1.5, easing: 'linear' }
  },
  {
    label: 'path-through-POI',
    route: {
      positionParts: [{
        kind: 'rounded-polyline',
        points: [[0, 0, 0], [5, 0, 0], [10, 0, 0]]
      }],
      targetPoints: [[5, 0.0001, 0], [5, 0.0001, 0], [5, 0.0001, 0]],
      startFov: 54,
      endFov: 54,
      edges: [{
        connectionId: 'poi-on-path',
        direction: 'forward',
        fromNodeId: 'a',
        toNodeId: 'b',
        positionSpan: {
          start: { partIndex: 0, pointIndex: 0 },
          end: { partIndex: 0, pointIndex: 2 }
        },
        viewTrack: {
          start: { cameraTarget: [5, 0.0001, 0], fov: 54 },
          keyframes: [{
            id: 'poi-on-path',
            progress: 0.5,
            cameraTarget: [5, 0.0001, 0],
            fov: 54
          }],
          end: { cameraTarget: [5, 0.0001, 0], fov: 54 },
          framingEnvelope: { enterStart: 0.2, enterEnd: 0.4, exitStart: 0.6, exitEnd: 0.8 }
        },
        automaticTargetPoints: [[5, 0.0001, 0], [5, 0.0001, 0], [5, 0.0001, 0]]
      }]
    },
    options: { durationSeconds: 2, easing: 'linear' }
  },
  {
    label: 'zero-width envelope ramps',
    route: createOrdinaryRoute({
      enterStart: 0.2,
      enterEnd: 0.2,
      exitStart: 0.8,
      exitEnd: 0.8
    }),
    options: { durationSeconds: 6, easing: 'linear' },
    zeroWidthRamp: true
  },
  {
    label: 'zero-length position path',
    route: {
      positionParts: [{
        kind: 'rounded-polyline',
        points: [[1, 2, 3], [1, 2, 3]]
      }],
      targetPoints: [[1, 2, 4], [2, 2, 4]],
      startFov: 40,
      endFov: 70,
      edges: [{
        connectionId: 'zero-length',
        direction: 'forward',
        fromNodeId: 'a',
        toNodeId: 'b',
        positionSpan: {
          start: { partIndex: 0, pointIndex: 0 },
          end: { partIndex: 0, pointIndex: 1 }
        },
        viewTrack: {
          start: { cameraTarget: [1, 2, 4], fov: 40 },
          keyframes: [{
            id: 'stationary-subject',
            progress: 0.5,
            cameraTarget: [1.5, 3, 4],
            fov: 55
          }],
          end: { cameraTarget: [2, 2, 4], fov: 70 },
          framingEnvelope: { enterStart: 0.2, enterEnd: 0.4, exitStart: 0.6, exitEnd: 0.8 }
        },
        automaticTargetPoints: [[1, 2, 4], [2, 2, 4]]
      }]
    },
    options: { durationSeconds: 1.25, easing: 'linear' }
  },
  {
    label: 'short positive duration',
    route: createOrdinaryRoute(),
    options: { durationSeconds: 0.1, easing: 'linear' }
  }
];

describe('P1.4 dense non-degeneracy and finiteness', () => {
  for (const fixture of DENSE_FIXTURES) {
    it(`keeps ${fixture.label} finite, off the near clip, and FOV-bounded at every dense sample`, () => {
      const motion = createCameraMotion(fixture.route, undefined, fixture.options);
      const samples = buildDensePlayheads(motion, 0);
      assertNonDegenerateSamples(motion, samples, motionFovRange(motion));
      assertSeekOrderStable(motion, samples);
    });
  }

  it('keeps a live start pose projected into the same dense invariants', () => {
    const route = createOrdinaryRoute();
    const motion = createCameraMotion(
      route,
      { position: [-2, 1, 0], target: [-1, 1, 2], fov: 45 },
      { durationSeconds: 6, easing: 'linear' }
    );
    const samples = buildDensePlayheads(motion, 0);
    assertNonDegenerateSamples(motion, samples, motionFovRange(motion));
    assertSeekOrderStable(motion, samples);
  });
});

describe('P1.4 endpoint and branch matrix', () => {
  it('hits canonical oriented node eye/target/FOV at p = 0/1 for forward keys with an envelope', () => {
    const motion = createCameraMotion(createOrdinaryRoute(), undefined, {
      durationSeconds: 6,
      easing: 'linear'
    });
    const start = sampleFull(motion, 0);
    expect(start.position.toArray()).toEqual([0, 0, 0]);
    expect(start.target.toArray()).toEqual([0, 0, 2]);
    expect(start.fov).toBe(40);
    const end = sampleFull(motion, 1);
    expect(end.position.toArray()).toEqual([10, 0, 0]);
    expect(end.target.toArray()).toEqual([10, 0, 2]);
    expect(end.fov).toBe(60);
  });

  it('hits canonical reversed node values for reverse keys with an envelope', () => {
    const route = createOrdinaryRoute(ORDINARY_ENVELOPE, {
      direction: 'reverse',
      viewTrack: {
        start: { cameraTarget: [10, 0, 2], fov: 60 },
        keyframes: [{
          id: 'reversed-subject',
          progress: 0.5,
          cameraTarget: [5, 4, 4],
          fov: 80
        }],
        end: { cameraTarget: [0, 0, 2], fov: 40 },
        framingEnvelope: ORDINARY_ENVELOPE
      },
      automaticTargetPoints: [[10, 0, 2], [0, 0, 2]]
    });
    const motion = createCameraMotion(route, undefined, {
      durationSeconds: 6,
      easing: 'linear'
    });
    expect(sampleFull(motion, 0).target.toArray()).toEqual([10, 0, 2]);
    expect(sampleFull(motion, 0).fov).toBe(60);
    expect(sampleFull(motion, 1).target.toArray()).toEqual([0, 0, 2]);
    expect(sampleFull(motion, 1).fov).toBe(40);
  });

  it('ignores an envelope on a reverse track without reverse keys (automatic samples unchanged)', () => {
    const route = createOrdinaryRoute(ORDINARY_ENVELOPE, {
      direction: 'reverse',
      viewTrack: {
        start: { cameraTarget: [10, 0, 2], fov: 60 },
        keyframes: [],
        end: { cameraTarget: [0, 0, 2], fov: 40 },
        framingEnvelope: ORDINARY_ENVELOPE
      },
      automaticTargetPoints: [[10, 0, 2], [0, 0, 2]]
    });
    const { framingEnvelope: _envelope, ...viewTrackWithoutEnvelope } =
      route.edges![0]!.viewTrack!;
    const withoutEnvelope = createCameraMotion(
      {
        ...route,
        edges: [{ ...route.edges![0], viewTrack: viewTrackWithoutEnvelope }]
      },
      undefined,
      { durationSeconds: 6, easing: 'linear' }
    );
    const motion = createCameraMotion(route, undefined, {
      durationSeconds: 6,
      easing: 'linear'
    });
    expect(motion.usesLegacyTargetPath).toBe(true);
    for (const progress of [0, 0.2, 0.5, 0.8, 1]) {
      const withEnvelope = sampleFull(motion, progress);
      const reference = sampleFull(withoutEnvelope, progress);
      expectVectorClose(withEnvelope.target, reference.target, 12);
      expect(withEnvelope.fov).toBe(reference.fov);
    }
  });

  it('keeps legacy full-authored framing unchanged when keys have no envelope', () => {
    const route = createOrdinaryRoute();
    delete route.edges![0]!.viewTrack!.framingEnvelope;
    const motion = createCameraMotion(route, undefined, {
      durationSeconds: 6,
      easing: 'linear'
    });
    const samples = buildDensePlayheads(motion, 0);
    for (const { edgeProgress } of samples) {
      const result = sampleAtEdgeProgress(motion, 0, edgeProgress);
      expect(result.target.distanceTo(result.position)).toBeGreaterThan(
        VISITOR_CAMERA_PROJECTION.near
      );
    }
    // The authored key is hit exactly at its edge-local progress.
    const keyed = sampleAtEdgeProgress(motion, 0, 0.5);
    expect(keyed.target.toArray()).toEqual([5, 4, 4]);
    expect(keyed.fov).toBe(80);
  });

  it('keeps automatic samples unchanged when an envelope has no keys', () => {
    const route = createOrdinaryRoute(ORDINARY_ENVELOPE, {
      viewTrack: {
        start: { cameraTarget: [0, 0, 2], fov: 40 },
        keyframes: [],
        end: { cameraTarget: [10, 0, 2], fov: 60 },
        framingEnvelope: ORDINARY_ENVELOPE
      }
    });
    const motion = createCameraMotion(route, undefined, {
      durationSeconds: 6,
      easing: 'linear'
    });
    const reference = createCameraMotion(
      {
        positionParts: route.positionParts,
        targetPoints: route.targetPoints,
        startFov: route.startFov,
        endFov: route.endFov
      },
      undefined,
      { durationSeconds: 6, easing: 'linear' }
    );
    expect(motion.usesLegacyTargetPath).toBe(true);
    for (const progress of [0, 0.2, 0.5, 0.8, 1]) {
      const actual = sampleFull(motion, progress);
      const expected = sampleFull(reference, progress);
      expectVectorClose(actual.target, expected.target, 12);
      expect(actual.fov).toBe(expected.fov);
    }
  });

  it('lets target guards leave eye, FOV, envelope weight, route input, and node endpoints untouched', () => {
    const fixture = DENSE_FIXTURES.find((candidate) =>
      candidate.label.includes('near-antipodal')
    )!;
    const originalRoute = structuredClone(fixture.route);
    const motion = createCameraMotion(fixture.route, undefined, fixture.options);
    const guard = motion.edgeViews[0]?.guard;
    expect(guard).not.toBeNull();
    expect(guard?.limitsAngularRate).toBe(true);
    const guardBefore = structuredClone(guard);

    const samples = buildDensePlayheads(motion, 0);
    for (const { progress } of samples) {
      const result = sampleFull(motion, progress);
      // Eye never changes: it is always the raw position path at the eased playhead.
      const easedProgress = cameraApplyEasing(motion.easing, progress);
      const expectedEye = motion.positionPath.getPointAt(easedProgress, new Vector3());
      expectVectorClose(result.position, expectedEye, 9);
      // FOV never changes: it is the envelope blend alone (no guard term).
      const edgeView = motion.edgeViews[0]!;
      const localProgress = easedProgress;
      const automaticFov = MathUtils.lerp(
        edgeView.points[0].fov,
        edgeView.points.at(-1)!.fov,
        cameraApplyEasing(motion.easing, localProgress)
      );
      const authored = sampleAuthoredViewAtEdgeProgress(motion, localProgress);
      const weight = sampleFramingEnvelopeWeight(edgeView.framingEnvelope!, localProgress);
      expect(result.fov).toBeCloseTo(
        MathUtils.lerp(automaticFov, authored, weight),
        9
      );
    }
    expect(motion.edgeViews[0]?.guard).toEqual(guardBefore);
    expect(fixture.route).toEqual(originalRoute);
    expect(sampleFull(motion, 0).target.toArray()).toEqual([5, 0, 0]);
    expect(sampleFull(motion, 1).target.toArray()).toEqual([5, 0, 0]);
  });
});

/** The interval-eased authored FOV at an edge-local progress (mirrors `sampleAuthoredView`). */
function sampleAuthoredViewAtEdgeProgress(
  motion: ReturnType<typeof createCameraMotion>,
  localProgress: number
) {
  const edgeView = motion.edgeViews[0]!;
  const points = edgeView.points;
  let endIndex = 1;
  while (endIndex < points.length - 1 && localProgress > points[endIndex].progress) {
    endIndex += 1;
  }
  const start = points[endIndex - 1];
  const end = points[endIndex];
  const intervalLength = end.progress - start.progress;
  const intervalProgress =
    intervalLength <= Number.EPSILON
      ? 1
      : MathUtils.clamp((localProgress - start.progress) / intervalLength, 0, 1);
  return MathUtils.lerp(
    start.fov,
    end.fov,
    cameraApplyEasing(motion.easing, intervalProgress)
  );
}

describe('P1.4 smooth continuity and angular pacing', () => {
  for (const fixture of DENSE_FIXTURES) {
    it(`measures ${fixture.label} with bounded swing, no pops, and halving convergence`, () => {
      const motion = createCameraMotion(fixture.route, undefined, fixture.options);
      const samples = buildDensePlayheads(motion, 0);
      const edgeProgresses = samples.map((sample) => sample.edgeProgress);
      const swing = totalGazeSwing(motion, 0, edgeProgresses);
      expect(swing).toBeLessThanOrEqual(Math.PI * 2 + 1e-9);
      if (fixture.zeroWidthRamp) return;
      const denseAngle = maxAdjacentGazeAngle(motion, 0, edgeProgresses);
      expect(denseAngle).toBeLessThan(Math.PI - 1e-6);
      assertUniformHalvingConvergence(motion, 0);
      assertGuardBoundaryConvergence(motion, 0);
      const peak = compiledAngularPeak(motion, 0);
      const guard = motion.edgeViews[0]?.guard;
      if (peak !== null && guard?.limitsAngularRate) {
        const measured = denseMaxAngularRate(motion, 0, samples);
        expect(measured).toBeLessThanOrEqual(
          peak * (1 + RATE_BOUND_TOLERANCE) + 1e-12
        );
      }
    });
  }

  it('converges the sampled peak to the compiled guard segment peak', () => {
    // The near-antipodal fixture exceeds angular capacity, so the compiler
    // remaps the active interval to a smootherstep great-circle sweep. The
    // derived peak (max of segmentAngle/segmentTime × peak-rate factor) is
    // well above the nominal policy constant by design (the plan forbids
    // substituting maxAngularRate × peakRateFactor); the public sampler must
    // converge up to that derived value, never above it.
    const motion = createCameraMotion(
      DENSE_FIXTURES.find((candidate) =>
        candidate.label.includes('near-antipodal')
      )!.route,
      undefined,
      { durationSeconds: 1.5, easing: 'linear' }
    );
    const peak = compiledAngularPeak(motion, 0);
    expect(peak).not.toBeNull();
    expect(peak!).toBeGreaterThan(0);
    const measured = denseMaxAngularRate(motion, 0, buildDensePlayheads(motion, 0));
    expect(measured).toBeLessThanOrEqual(
      peak! * (1 + RATE_BOUND_TOLERANCE) + 1e-12
    );
    // The finite-difference grid samples a symmetric neighborhood of each
    // segment's smootherstep midpoint, so it converges up to the derived peak
    // while remaining strictly below it (the 5% band absorbs the grid spacing).
    expect(measured).toBeGreaterThanOrEqual(peak! * (1 - 5e-2));
  });

  it('keeps zero-width envelope ramps exact on both sides of the bound', () => {
    const motion = createCameraMotion(
      createOrdinaryRoute({
        enterStart: 0.2,
        enterEnd: 0.2,
        exitStart: 0.8,
        exitEnd: 0.8
      }),
      undefined,
      { durationSeconds: 6, easing: 'linear' }
    );
    const envelope = motion.edgeViews[0]!.framingEnvelope!;
    for (const progress of [0, 0.1, 0.5, 0.9, 1]) {
      const weight = sampleFramingEnvelopeWeight(envelope, progress);
      expect(Number.isFinite(weight)).toBe(true);
      expect(weight).toBe(progress < 0.2 || progress > 0.8 ? 0 : 1);
    }
    const beforeEnter = sampleAtEdgeProgress(motion, 0, 0.2 - EDGE_LOCAL_EPSILON);
    const atEnter = sampleAtEdgeProgress(motion, 0, 0.2);
    const afterExit = sampleAtEdgeProgress(motion, 0, 0.8 + EDGE_LOCAL_EPSILON);
    const atExit = sampleAtEdgeProgress(motion, 0, 0.8);
    expect(atEnter.target.toArray().every(Number.isFinite)).toBe(true);
    expect(atExit.target.toArray().every(Number.isFinite)).toBe(true);
    expect(beforeEnter.target.distanceTo(beforeEnter.position)).toBeGreaterThanOrEqual(
      VISITOR_CAMERA_PROJECTION.near
    );
    expect(afterExit.target.distanceTo(afterExit.position)).toBeGreaterThanOrEqual(
      VISITOR_CAMERA_PROJECTION.near
    );
    // The step lands exactly on the interval-eased authored value at the bound
    // (within float round-off from the eased interpolation).
    expectVectorClose(atEnter.target, new Vector3(2, 1.6, 2.8), 9);
    expectVectorClose(atExit.target, new Vector3(8, 1.6, 2.8), 9);
  });
});

function createPoiRoute(
  offsetY: number,
  options: {
    durationSeconds?: number;
    direction?: 'forward' | 'reverse';
    envelope?: RuntimeCameraFramingEnvelope;
  } = {}
): CameraRoute {
  const envelope =
    options.envelope ?? {
      enterStart: 0.2,
      enterEnd: 0.4,
      exitStart: 0.6,
      exitEnd: 0.8
    };
  return {
    positionParts: [{
      kind: 'rounded-polyline',
      points: [[0, 0, 0], [5, 0, 0], [10, 0, 0]]
    }],
    targetPoints: [[5, offsetY, 0], [5, offsetY, 0], [5, offsetY, 0]],
    startFov: 54,
    endFov: 54,
    edges: [{
      connectionId: 'poi',
      direction: options.direction ?? 'forward',
      fromNodeId: 'a',
      toNodeId: 'b',
      positionSpan: {
        start: { partIndex: 0, pointIndex: 0 },
        end: { partIndex: 0, pointIndex: 2 }
      },
      viewTrack: {
        start: { cameraTarget: [5, offsetY, 0], fov: 54 },
        keyframes: [{
          id: 'poi-key',
          progress: 0.5,
          cameraTarget: [5, offsetY, 0],
          fov: 54
        }],
        end: { cameraTarget: [5, offsetY, 0], fov: 54 },
        framingEnvelope: envelope
      },
      automaticTargetPoints: [[5, offsetY, 0], [5, offsetY, 0], [5, offsetY, 0]]
    }]
  };
}

const DOUBLE_WHIP_DIRECT_ANGLE = Math.PI / 6;

/**
 * Late-exit gaze spike on an otherwise straight +z track. The detour is the
 * authored offset at the ramp midpoint (`w = 1/2`), so the blended peak offset
 * is exactly `detour / 2` and every policy measurement telescopes exactly:
 * `maxOffAxis = atan(detour / 2)` and `angularPath = 2 · atan(detour / 2)`.
 */
function createDoubleWhipRoute(options: {
  detour?: number;
  durationSeconds?: number;
  exitStart?: number;
  exitEnd?: number;
}): CameraRoute {
  const detour = options.detour ?? 0;
  const exitStart = options.exitStart ?? 0.8;
  // The double-whip bypass only compiles for exits that do not reach the end
  // (exitEnd < 1); the spike lives inside the ramp [exitStart, exitEnd].
  const exitEnd = options.exitEnd ?? 0.9;
  const mid = (exitStart + exitEnd) / 2;
  return {
    positionParts: [{
      kind: 'rounded-polyline',
      points: [[0, 0, 0], [10, 0, 0]]
    }],
    targetPoints: [[0, 0, 1], [10, 0, 1]],
    startFov: 54,
    endFov: 54,
    edges: [{
      connectionId: 'double-whip',
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
            id: 'exit-entry',
            progress: exitStart,
            cameraTarget: [10 * exitStart, 0, 1],
            fov: 54
          },
          {
            id: 'spike-left',
            progress: mid - 0.01,
            cameraTarget: [10 * (mid - 0.01), 0, 1],
            fov: 54
          },
          {
            id: 'spike-peak',
            progress: mid,
            cameraTarget: [10 * mid + detour, 0, 1],
            fov: 54
          },
          {
            id: 'spike-right',
            progress: mid + 0.01,
            cameraTarget: [10 * (mid + 0.01), 0, 1],
            fov: 54
          },
          {
            id: 'exit-tail',
            progress: exitEnd,
            cameraTarget: [10 * exitEnd, 0, 1],
            fov: 54
          }
        ],
        end: { cameraTarget: [10, 0, 1], fov: 54 },
        framingEnvelope: {
          enterStart: exitStart,
          enterEnd: exitStart,
          exitStart,
          exitEnd
        }
      },
      automaticTargetPoints: [[0, 0, 1], [10, 0, 1]]
    }]
  };
}

/**
 * Exit gaze that overshoots the direct chord and returns to the automatic
 * track. The automatic target ends at `DOUBLE_WHIP_DIRECT_ANGLE`, so the
 * direct angle is exactly that constant while the authored peak adds a
 * symmetric overshoot: `angularPath = 2·peak − 2·auto(0.95)` telescopes
 * exactly, giving `pathExcess = 2·(peak − auto(0.95))` with off-axis and
 * angular rate already exceeded for every peak near the flip.
 */
function createPathExcessRoute(peakRadians: number): CameraRoute {
  const exitStart = 0.92;
  const exitEnd = 0.96;
  const autoOffset = (progress: number) =>
    progress * Math.tan(DOUBLE_WHIP_DIRECT_ANGLE);
  // At the ramp midpoint (w = 1/2) the blended offset equals tan(peak), so the
  // authored key must compensate for the automatic baseline exactly.
  const peakOffset = 2 * Math.tan(peakRadians) - autoOffset(0.94);
  return {
    positionParts: [{
      kind: 'rounded-polyline',
      points: [[0, 0, 0], [10, 0, 0]]
    }],
    targetPoints: [[0, 0, 1], [10 + Math.tan(DOUBLE_WHIP_DIRECT_ANGLE), 0, 1]],
    startFov: 54,
    endFov: 54,
    edges: [{
      connectionId: 'path-excess',
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
            id: 'exit-entry',
            progress: exitStart,
            cameraTarget: [10 * exitStart, 0, 1],
            fov: 54
          },
          {
            id: 'overshoot-peak',
            progress: 0.94,
            cameraTarget: [9.4 + peakOffset, 0, 1],
            fov: 54
          },
          {
            id: 'overshoot-return',
            progress: 0.95,
            cameraTarget: [9.5 + autoOffset(0.95), 0, 1],
            fov: 54
          },
          {
            id: 'exit-tail',
            progress: exitEnd,
            cameraTarget: [9.6 + autoOffset(0.96), 0, 1],
            fov: 54
          }
        ],
        end: {
          cameraTarget: [10 + Math.tan(DOUBLE_WHIP_DIRECT_ANGLE), 0, 1],
          fov: 54
        },
        framingEnvelope: {
          enterStart: 0,
          enterEnd: 0,
          exitStart,
          exitEnd
        }
      },
      automaticTargetPoints: [[0, 0, 1], [10 + Math.tan(DOUBLE_WHIP_DIRECT_ANGLE), 0, 1]]
    }]
  };
}

describe('P1.4 singularity and double-whip matrix', () => {
  for (const offsetY of [1e-4, 0.05, -0.05]) {
    for (const durationSeconds of [1, 2.1, 4]) {
      for (const direction of ['forward', 'reverse'] as const) {
        it(`keeps POI offset ${offsetY} (${direction}, ${durationSeconds}s) non-degenerate, seek-stable, and rate-bounded`, () => {
          const route = createPoiRoute(offsetY, { durationSeconds, direction });
          const motion = createCameraMotion(route, undefined, {
            durationSeconds,
            easing: 'linear'
          });
          const samples = buildDensePlayheads(motion, 0);
          assertNonDegenerateSamples(motion, samples, { min: 54, max: 54 });
          assertSeekOrderStable(motion, samples);
          const peak = compiledAngularPeak(motion, 0);
          if (peak !== null) {
            const measured = denseMaxAngularRate(motion, 0, samples);
            expect(measured).toBeLessThanOrEqual(
              peak * (1 + RATE_BOUND_TOLERANCE) + 1e-12
            );
          }
        });
      }
    }
  }

  it('falls back to a deterministic great circle when capacity is exceeded', () => {
    const route = createPoiRoute(0.05, { durationSeconds: 1 });
    const first = createCameraMotion(route, undefined, {
      durationSeconds: 1,
      easing: 'linear'
    });
    const second = createCameraMotion(route, undefined, {
      durationSeconds: 1,
      easing: 'linear'
    });
    expect(first.edgeViews[0]?.guard?.limitsAngularRate).toBe(true);
    const samples = buildDensePlayheads(first, 0);
    for (const { progress } of samples) {
      const a = sampleFull(first, progress);
      const b = sampleFull(second, progress);
      expectVectorClose(a.target, b.target, 9);
    }
    // The mid-chord never stalls or crosses the zero vector: it rides the
    // deterministic great-circle side of the near-antipodal remap.
    const mid = sampleAtEdgeProgress(first, 0, 0.5);
    expect(mid.target.distanceTo(mid.position)).toBeGreaterThanOrEqual(
      VISITOR_CAMERA_PROJECTION.near
    );
    const direction = gazeDirection(mid);
    expect(Math.abs(direction.y)).toBeGreaterThan(0.9);
  });

  it('preserves exact raw automatic framing wherever the envelope weight is zero', () => {
    const route = createPoiRoute(0.05, { durationSeconds: 4 });
    const motion = createCameraMotion(route, undefined, {
      durationSeconds: 4,
      easing: 'linear'
    });
    expect(motion.edgeViews[0]?.guard?.bypass ?? null).toBeNull();
    // Same edges and spans, but no authored keys and no envelope, so the
    // reference samples the raw automatic target path on the same edge.
    const reference = createCameraMotion(
      {
        positionParts: route.positionParts,
        targetPoints: route.targetPoints,
        startFov: route.startFov,
        endFov: route.endFov,
        edges: route.edges!.map((edge) => ({
          ...edge,
          viewTrack: {
            start: edge.viewTrack!.start,
            keyframes: [],
            end: edge.viewTrack!.end
          }
        }))
      },
      undefined,
      { durationSeconds: 4, easing: 'linear' }
    );
    const envelope = route.edges![0]!.viewTrack!.framingEnvelope!;
    const guard = motion.edgeViews[0]?.guard;
    const guardProgresses = guard?.directions.map((direction) => direction.progress) ?? [];
    const sampleProgresses = [
      ...new Set([0, 0.1, 0.2, 0.8, 0.9, 1, ...guardProgresses])
    ].sort((left, right) => left - right);
    for (const edgeProgress of sampleProgresses) {
      const weight = sampleFramingEnvelopeWeight(envelope, edgeProgress);
      if (weight !== 0) continue;
      const actual = sampleAtEdgeProgress(motion, 0, edgeProgress);
      const expected = sampleFull(
        reference,
        cameraMotionProgressAtEdgeProgress(reference, 0, edgeProgress)
      );
      // Outside the active interval the compiled directions are pinned to the
      // raw samples, so at each compiled guard progress automatic framing is
      // preserved exactly. Between compiled samples the rate limiter re-derives
      // the direction through the same smootherstep interpolation, which holds
      // the exact value to the interpolation's own numeric tolerance.
      const isGuardSample = guardProgresses.includes(edgeProgress);
      expectVectorClose(actual.target, expected.target, isGuardSample ? 9 : 2);
      expect(actual.fov).toBeCloseTo(expected.fov, 9);
    }
  });

  function hasBypass(options: {
    detour?: number;
    durationSeconds?: number;
    exitStart?: number;
    exitEnd?: number;
  }) {
    const motion = createCameraMotion(createDoubleWhipRoute(options), undefined, {
      durationSeconds: options.durationSeconds ?? 0.5,
      easing: 'linear'
    });
    return motion.edgeViews[0]?.guard?.bypass !== null &&
      motion.edgeViews[0]?.guard?.bypass !== undefined;
  }

  it('bypasses only a hazardous late off-axis insufficient-time exit', () => {
    expect(hasBypass({ detour: 0.6, durationSeconds: 0.5 })).toBe(true);
    expect(hasBypass({ detour: 0.6, durationSeconds: 1.5 })).toBe(false);
    expect(hasBypass({ detour: 0, durationSeconds: 0.5 })).toBe(false);
    expect(hasBypass({ detour: 0.6, durationSeconds: 0.5, exitStart: 0.3 })).toBe(false);
  });

  function findFlip(
    low: number,
    high: number,
    predicate: (value: number) => boolean
  ) {
    for (let iteration = 0; iteration < 24; iteration += 1) {
      const midpoint = (low + high) / 2;
      if (predicate(midpoint)) high = midpoint;
      else low = midpoint;
    }
    return (low + high) / 2;
  }

  it('flips the bypass decision exactly at the off-axis policy threshold', () => {
    const threshold = 2 * Math.tan(CAMERA_FRAMING_GUARD_POLICY.doubleWhipOffAxisRadians);
    const flip = findFlip(0.2, 1, (detour) => hasBypass({ detour, durationSeconds: 0.5 }));
    expect(flip).toBeGreaterThan(threshold - 0.01);
    expect(flip).toBeLessThan(threshold + 0.01);
    expect(hasBypass({ detour: threshold - 0.005, durationSeconds: 0.5 })).toBe(false);
    expect(hasBypass({ detour: threshold + 0.005, durationSeconds: 0.5 })).toBe(true);
  });

  it('flips the bypass decision exactly at the angular-rate policy threshold', () => {
    // The spike's telescoped angular path is exactly 2·atan(0.3) and the exit
    // window spans 0.2 of the linear-eased duration, so the bypass turns on
    // exactly when 2·atan(0.3)/(0.2·duration) exceeds the policy rate. The
    // predicate falls with duration, so findFlip bisects its complement.
    const analyticFlip = 0.583 / (0.2 * CAMERA_FRAMING_GUARD_POLICY.maxAngularRateRadiansPerSecond);
    const flip = findFlip(0.3, 1.5, (durationSeconds) =>
      !hasBypass({ detour: 0.6, durationSeconds })
    );
    expect(flip).toBeGreaterThan(analyticFlip - 0.02);
    expect(flip).toBeLessThan(analyticFlip + 0.02);
    expect(hasBypass({ detour: 0.6, durationSeconds: analyticFlip - 0.01 })).toBe(true);
    expect(hasBypass({ detour: 0.6, durationSeconds: analyticFlip + 0.01 })).toBe(false);
  });

  it('flips the bypass decision exactly at the path-excess policy threshold', () => {
    // The gaze sweeps straight through the 30° direct chord, overshoots to
    // `peak`, and returns to the automatic track at 0.95. The rising flank,
    // return, and automatic tail each telescope (monotone in angle), so
    // angularPath = peak + (peak − auto(0.95)) + (30° − auto(0.95)) and
    // pathExcess = 2·(peak − auto(0.95)) exactly, while off-axis (~26°) and
    // angular rate (~21 rad/s) stay exceeded. The bypass turns on precisely
    // when peak crosses auto(0.95) + pi/36.
    function hasPathExcessBypass(peakRadians: number) {
      const motion = createCameraMotion(createPathExcessRoute(peakRadians), undefined, {
        durationSeconds: 0.4,
        easing: 'linear'
      });
      return (
        motion.edgeViews[0]?.guard?.bypass !== null &&
        motion.edgeViews[0]?.guard?.bypass !== undefined
      );
    }
    const thresholdRadians =
      Math.atan(0.95 * Math.tan(DOUBLE_WHIP_DIRECT_ANGLE)) +
      CAMERA_FRAMING_GUARD_POLICY.doubleWhipPathExcessRadians / 2;
    expect(hasPathExcessBypass(thresholdRadians - 0.02)).toBe(false);
    expect(hasPathExcessBypass(thresholdRadians + 0.02)).toBe(true);
    const flip = findFlip(
      thresholdRadians - 0.1,
      thresholdRadians + 0.1,
      hasPathExcessBypass
    );
    expect(flip).toBeGreaterThan(thresholdRadians - 0.01);
    expect(flip).toBeLessThan(thresholdRadians + 0.01);
    expect(hasPathExcessBypass(thresholdRadians - 0.005)).toBe(false);
    expect(hasPathExcessBypass(thresholdRadians + 0.005)).toBe(true);
  });

  it('keeps bypass onset/end neighborhoods continuous and arrives at Node B exactly', () => {
    const route = createDoubleWhipRoute({ detour: 0.6, durationSeconds: 0.5 });
    const motion = createCameraMotion(route, undefined, {
      durationSeconds: 0.5,
      easing: 'linear'
    });
    const guard = motion.edgeViews[0]?.guard;
    expect(guard?.bypass).not.toBeNull();
    expect(guard?.bypass?.startProgress).toBe(0.8);

    const before = sampleAtEdgeProgress(motion, 0, 0.8 - EDGE_LOCAL_EPSILON);
    const after = sampleAtEdgeProgress(motion, 0, 0.8 + EDGE_LOCAL_EPSILON);
    expect(before.target.distanceTo(after.target)).toBeLessThan(1e-3);

    const mid = sampleAtEdgeProgress(motion, 0, 0.9);
    expectVectorClose(mid.target, new Vector3(9, 0, 1), 6);

    const end = sampleFull(motion, 1);
    expect(end.target.toArray()).toEqual([10, 0, 1]);
  });
});

describe('P1.4 FOV pacing', () => {
  function handComputedFov(
    motion: ReturnType<typeof createCameraMotion>,
    edgeProgress: number
  ) {
    const edgeView = motion.edgeViews[0]!;
    const start = edgeView.points[0];
    const end = edgeView.points.at(-1)!;
    const automaticFov = MathUtils.lerp(
      start.fov,
      end.fov,
      cameraApplyEasing(motion.easing, edgeProgress)
    );
    const authoredFov = sampleAuthoredViewAtEdgeProgress(motion, edgeProgress);
    const weight = sampleFramingEnvelopeWeight(
      edgeView.framingEnvelope!,
      edgeProgress
    );
    return MathUtils.lerp(automaticFov, authoredFov, weight);
  }

  it('equals the hand-computed envelope blend at every dense sample', () => {
    for (const fixture of DENSE_FIXTURES) {
      const motion = createCameraMotion(fixture.route, undefined, fixture.options);
      if (!motion.edgeViews[0]?.framingEnvelope) continue;
      for (const { edgeProgress } of buildDensePlayheads(motion, 0)) {
        const result = sampleAtEdgeProgress(motion, 0, edgeProgress);
        const expected = handComputedFov(motion, edgeProgress);
        expect(result.fov).toBeCloseTo(expected, 9);
      }
    }
  });

  it('leaves every FOV sample unchanged by target-only standoff/angular/bypass guards', () => {
    const routes = [
      createOrdinaryRoute(),
      createPoiRoute(0.05, { durationSeconds: 0.5 }),
      createDoubleWhipRoute({ detour: 0.6, durationSeconds: 0.5 })
    ];
    for (const route of routes) {
      const motion = createCameraMotion(route, undefined, {
        durationSeconds: 0.5,
        easing: 'linear'
      });
      for (const { edgeProgress } of buildDensePlayheads(motion, 0)) {
        const result = sampleAtEdgeProgress(motion, 0, edgeProgress);
        expect(result.fov).toBeCloseTo(handComputedFov(motion, edgeProgress), 9);
      }
    }
  });

  it('keeps non-degenerate ramps finite, continuous, and zero-slope at the bounds', () => {
    const motion = createCameraMotion(createOrdinaryRoute(), undefined, {
      durationSeconds: 6,
      easing: 'linear'
    });
    const envelope = motion.edgeViews[0]!.framingEnvelope!;
    for (const bound of [
      envelope.enterStart,
      envelope.enterEnd,
      envelope.exitStart,
      envelope.exitEnd
    ]) {
      const before = sampleFramingEnvelopeWeight(envelope, bound - EDGE_LOCAL_EPSILON);
      const at = sampleFramingEnvelopeWeight(envelope, bound);
      const after = sampleFramingEnvelopeWeight(envelope, bound + EDGE_LOCAL_EPSILON);
      expect(Number.isFinite(before)).toBe(true);
      expect(Number.isFinite(after)).toBe(true);
      expect(Math.abs(after - before)).toBeLessThan(1e-4);
      const fovBefore = sampleAtEdgeProgress(motion, 0, bound - EDGE_LOCAL_EPSILON).fov;
      const fovAfter = sampleAtEdgeProgress(motion, 0, bound + EDGE_LOCAL_EPSILON).fov;
      expect(Number.isFinite(fovBefore)).toBe(true);
      expect(Number.isFinite(fovAfter)).toBe(true);
      expect(Math.abs(fovAfter - fovBefore)).toBeLessThan(1e-3);
      void at;
      // Shrinking finite differences of the weight show zero slope at the bound.
      const coarseSlope =
        (sampleFramingEnvelopeWeight(envelope, bound + 1e-3) -
          sampleFramingEnvelopeWeight(envelope, bound)) /
        1e-3;
      const fineSlope =
        (sampleFramingEnvelopeWeight(envelope, bound + 1e-4) -
          sampleFramingEnvelopeWeight(envelope, bound)) /
        1e-4;
      expect(Math.abs(fineSlope)).toBeLessThanOrEqual(Math.abs(coarseSlope) + 1e-9);
    }
  });

  it('keeps degenerate ramps at their documented deterministic step semantics', () => {
    const motion = createCameraMotion(
      createOrdinaryRoute({
        enterStart: 0.2,
        enterEnd: 0.2,
        exitStart: 0.8,
        exitEnd: 0.8
      }),
      undefined,
      { durationSeconds: 6, easing: 'linear' }
    );
    expect(sampleFramingEnvelopeWeight(motion.edgeViews[0]!.framingEnvelope!, 0.2)).toBe(1);
    expect(sampleFramingEnvelopeWeight(motion.edgeViews[0]!.framingEnvelope!, 0.2 - 1e-9)).toBe(0);
    expect(sampleFramingEnvelopeWeight(motion.edgeViews[0]!.framingEnvelope!, 0.8 + 1e-9)).toBe(0);
  });

  it('keeps larger FOV wider and smaller FOV tighter through the same envelope', () => {
    const motion = createCameraMotion(createOrdinaryRoute(), undefined, {
      durationSeconds: 6,
      easing: 'linear'
    });
    const automatic = sampleAtEdgeProgress(motion, 0, 0.1);
    const plateau = sampleAtEdgeProgress(motion, 0, 0.5);
    expect(plateau.fov).toBe(80);
    expect(plateau.fov).toBeGreaterThan(automatic.fov);
    expect(sampleAtEdgeProgress(motion, 0, 0.9).fov).toBeLessThan(plateau.fov);
  });
});


