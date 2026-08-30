import { describe, expect, it } from 'vitest';
import {
  createNavigationGraph,
  type RuntimeScene
} from '$lib/content/scene';
import { navigationGraph, scene } from '$lib/content/chopin-project';
import { loadFixtureScene } from '../../content/__fixtures__/load-fixture-scene';
import type {
  RuntimeConnection,
  NavigationNodeData,
  Vec3
} from '$lib/types/scene';
import {
  CAMERA_MOTION_TIMING,
  createCameraMotion,
  createCameraMotionSample,
  sampleCameraMotion
} from '@portfolio/camera-core';
import {
  getCameraConnectionRoute,
  getCameraRoute,
  getFlowLoopConnectionId,
  getFlowRoute
} from '@portfolio/camera-core';

const { graph: fixtureGraph } = loadFixtureScene();

const nodes: NavigationNodeData[] = [
  {
    id: 'a',
    roomId: 'entrance',
    label: 'A',
    position: [0, 1, 0],
    cameraTarget: [0, 1, 1],
    fov: 54,
    connectedNodeIds: ['b']
  },
  {
    id: 'b',
    roomId: 'poland',
    label: 'B',
    position: [2, 1, 0],
    cameraTarget: [2, 1, 1],
    fov: 54,
    connectedNodeIds: ['a', 'c']
  },
  {
    id: 'c',
    roomId: 'departure',
    label: 'C',
    position: [4, 1, 2],
    cameraTarget: [4, 1, 3],
    fov: 54,
    connectedNodeIds: ['b']
  },
  {
    id: 'isolated',
    roomId: 'legacy',
    label: 'Isolated',
    position: [9, 1, 9],
    cameraTarget: [8, 1, 9],
    fov: 54,
    connectedNodeIds: []
  }
];

function runtimeAnchors(connectionId: string, positions: readonly Vec3[]) {
  return positions.map((position, index) => ({
    id: `${connectionId}-${index}`,
    position: [...position] as Vec3
  }));
}

const connections: RuntimeConnection[] = [
  {
    id: 'a-b',
    fromNodeId: 'a',
    toNodeId: 'b',
    clearance: 0.4,
    positionPath: {
      kind: 'rounded-polyline',
      anchors: runtimeAnchors('a-b', [
        [0, 1, 0],
        [1, 1, 0],
        [2, 1, 0]
      ])
    }
  },
  {
    id: 'b-c',
    fromNodeId: 'b',
    toNodeId: 'c',
    clearance: 0.2,
    positionPath: {
      kind: 'rounded-polyline',
      anchors: runtimeAnchors('b-c', [
        [2, 1, 0],
        [3, 1, 1],
        [4, 1, 2]
      ])
    }
  }
];

const customScene: RuntimeScene = {
  textures: [],
  materials: [],
  entities: [],
  objects: [],
  navigationNodes: nodes,
  connections
};
const customGraph = createNavigationGraph(customScene);

/** Fixture tour edge midpoints — regenerate via loadFixtureScene + sampleCameraMotion(0.5). */
const FIXTURE_EDGE_MIDPOINTS: Array<{
  id: string;
  duration: number;
  position: Vec3;
  forwardTarget: Vec3;
  reverseTarget: Vec3;
}> = [
  {
    id: 'tour-a-b',
    duration: 4.1711491619918535,
    position: [-9.501975209857097, 1.65, 9.997893109485766],
    forwardTarget: [-6.999999999999998, 1.25, 7.500000000000002],
    reverseTarget: [-7.0000000000000036, 1.25, 7.4999999999999964]
  },
  {
    id: 'tour-b-paris',
    duration: 2.7666819277203705,
    position: [-14.25351582135361, 1.65, -7.7241269842340365],
    forwardTarget: [-12.554836792373221, 1.25, -6.073202467405213],
    reverseTarget: [-12.55483679237322, 1.25, -6.073202467405215]
  },
  {
    id: 'tour-paris-d',
    duration: 3.987604149935301,
    position: [0, 1.65, -16.41438026075828],
    forwardTarget: [-1.4694029336477836, 1.25, -11.384266483748316],
    reverseTarget: [-1.4694029336477339, 1.25, -11.384266483748313]
  },
  {
    id: 'tour-d-a',
    duration: 4.8,
    position: [5.327234105432248, 1.65, 4.584761510378474],
    forwardTarget: [4.085433858725455, 1.25, 2.18893598365692],
    reverseTarget: [4.085433858725469, 1.25, 2.1889359836568776]
  }
];

const FIXTURE_MULTI_HOP = [
  {
    from: 'tour-a',
    to: 'tour-paris',
    duration: 4.8,
    samples: [
      {
        progress: 0.25,
        position: [-3.7014311754302955, 1.65, 16.185140079541018] as Vec3,
        target: [-2.9877394836913584, 1.2939373453484024, 12.363759279095861] as Vec3
      },
      {
        progress: 0.5,
        position: [-15.352793102120025, 1.65, 3.7570206910719737] as Vec3,
        target: [-14.43134543066014, 1.4622256680979433, 2.2664599141234074] as Vec3
      },
      {
        progress: 0.75,
        position: [-13.72034928028996, 1.65, -11.812509661449276] as Vec3,
        target: [-13.799658516831052, 1.5, -11.20435726656925] as Vec3
      }
    ]
  },
  {
    from: 'tour-paris',
    to: 'tour-a',
    duration: 4.8,
    samples: [
      {
        progress: 0.25,
        position: [-13.720349280289964, 1.65, -11.81250966144925] as Vec3,
        target: [-12.966418396196588, 1.3288048352737265, -8.31762317458757] as Vec3
      },
      {
        progress: 0.5,
        position: [-15.352793102120007, 1.65, 3.7570206910719923] as Vec3,
        target: [-13.506540224841634, 1.5, 5.726357093502257] as Vec3
      },
      {
        progress: 0.75,
        position: [-3.7014311754302955, 1.65, 16.185140079541018] as Vec3,
        target: [-2.3574990998526513, 1.5, 17.61866762682384] as Vec3
      }
    ]
  }
] as const;

function sampleRoute(route: ReturnType<typeof getCameraRoute>, progress: number) {
  const motion = createCameraMotion(route);
  const output = createCameraMotionSample();
  sampleCameraMotion(motion, progress, output);
  return {
    motion,
    position: output.position.toArray(),
    target: output.target.toArray(),
    fov: output.fov
  };
}

function expectTupleClose(actual: number[], expected: Vec3, precision = 10) {
  for (let index = 0; index < 3; index += 1) {
    expect(actual[index]).toBeCloseTo(expected[index], precision);
  }
}

function expectedRouteEdge(
  connectionId: string,
  direction: 'forward' | 'reverse',
  fromNodeId: string,
  toNodeId: string,
  partIndex: number,
  startPointIndex: number,
  endPointIndex: number
) {
  return expect.objectContaining({
    connectionId,
    direction,
    fromNodeId,
    toNodeId,
    positionSpan: {
      start: { partIndex, pointIndex: startPointIndex },
      end: { partIndex, pointIndex: endPointIndex }
    }
  });
}

describe('getCameraRoute', () => {
  it.each(FIXTURE_MULTI_HOP)(
    'preserves fixture multi-hop motion from $from to $to',
    ({ from, to, duration, samples }) => {
      const route = getCameraRoute(from, to, fixtureGraph);
      const motion = createCameraMotion(route);
      expect(motion.durationSeconds).toBeCloseTo(duration, 12);

      for (const expected of samples) {
        const actual = sampleRoute(route, expected.progress);
        expectTupleClose(actual.position, expected.position);
        expectTupleClose(actual.target, expected.target);
      }
    }
  );

  it('coalesces a forward multi-edge legacy run with Phase 6 duplicate policy', () => {
    expect(getCameraRoute('a', 'c', customGraph)).toEqual({
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
      ],
      startFov: 54,
      endFov: 54,
      nodeIds: ['a', 'b', 'c'],
      edges: [
        expectedRouteEdge('a-b', 'forward', 'a', 'b', 0, 0, 2),
        expectedRouteEdge('b-c', 'forward', 'b', 'c', 0, 2, 4)
      ]
    });
  });

  it('compiles exact forward and reverse spans through a coalesced rounded join', () => {
    const forward = createCameraMotion(getCameraRoute('a', 'c', customGraph));
    const reverse = createCameraMotion(getCameraRoute('c', 'a', customGraph));
    const forwardSpans = forward.positionEdgeSpans;
    const reverseSpans = reverse.positionEdgeSpans;

    expect(forwardSpans.map((span) => span.connectionId)).toEqual(['a-b', 'b-c']);
    expect(forwardSpans.map((span) => span.direction)).toEqual([
      'forward',
      'forward'
    ]);
    expect(forwardSpans[0].startDistance).toBe(0);
    expect(forwardSpans[0].endDistance).toBe(forwardSpans[1].startDistance);
    expect(forwardSpans[1].endDistance).toBe(forward.positionPath.getLength());
    expect(forwardSpans[0].length + forwardSpans[1].length).toBeCloseTo(
      forward.positionPath.getLength(),
      12
    );

    // Point index 2 is the shared node. Its rounded quadratic is split into
    // two geometry-identical halves, and the edge boundary lands between them.
    expect(forward.positionPath.curves).toHaveLength(8);
    const splitBoundaryDistance = forward.positionPath.curves
      .slice(0, 4)
      .reduce((distance, curve) => distance + curve.getLength(), 0);
    expect(forwardSpans[0].endDistance).toBeCloseTo(splitBoundaryDistance, 12);

    expect(reverseSpans.map((span) => span.connectionId)).toEqual(['b-c', 'a-b']);
    expect(reverseSpans.map((span) => span.direction)).toEqual([
      'reverse',
      'reverse'
    ]);
    expect(reverseSpans[0].length).toBeCloseTo(forwardSpans[1].length, 12);
    expect(reverseSpans[1].length).toBeCloseTo(forwardSpans[0].length, 12);
    expect(reverseSpans[1].endDistance).toBe(reverse.positionPath.getLength());
  });

  it('retains contiguous exact distance spans on a representative multi-hop route', () => {
    const route = getCameraRoute('tour-a', 'tour-paris', fixtureGraph);
    const motion = createCameraMotion(route);

    expect(route.edges.map((edge) => edge.connectionId)).toEqual([
      'tour-a-b',
      'tour-b-paris'
    ]);
    expect(motion.positionEdgeSpans).toHaveLength(route.edges.length);
    expect(motion.positionEdgeSpans[0].startDistance).toBe(0);
    for (let index = 1; index < motion.positionEdgeSpans.length; index += 1) {
      expect(motion.positionEdgeSpans[index].startDistance).toBe(
        motion.positionEdgeSpans[index - 1].endDistance
      );
    }
    expect(motion.positionEdgeSpans.at(-1)?.endDistance).toBe(
      motion.positionPath.getLength()
    );
  });

  it('reverses legacy edge points during reverse traversal', () => {
    const route = getCameraRoute('c', 'a', customGraph);

    expect(route.positionParts).toEqual([
      {
        kind: 'rounded-polyline',
        points: [
          [4, 1, 2],
          [3, 1, 1],
          [2, 1, 0],
          [1, 1, 0],
          [0, 1, 0]
        ],
        clearance: 0.2
      }
    ]);
    expect(route.nodeIds).toEqual(['c', 'b', 'a']);
    expect(route.targetPoints[0]).toEqual(nodes[2].cameraTarget);
    expect(route.targetPoints.at(-1)).toEqual(nodes[0].cameraTarget);
  });

  it('returns a cloned resting pose for a same-node route', () => {
    const route = getCameraRoute('b', 'b', customGraph);

    expect(route).toEqual({
      positionParts: [
        {
          kind: 'rounded-polyline',
          points: [[2, 1, 0]],
          clearance: 0.35
        }
      ],
      targetPoints: [[2, 1, 1]],
      startFov: 54,
      endFov: 54,
      nodeIds: ['b'],
      edges: []
    });
    const part = route.positionParts[0];
    expect(part.kind).toBe('rounded-polyline');
    if (part.kind !== 'rounded-polyline') throw new Error('Expected rounded part');
    expect(part.points[0]).not.toBe(nodes[1].position);
    expect(route.targetPoints[0]).not.toBe(nodes[1].cameraTarget);
  });

  it('preserves two poses for a target-only connection between coincident eyes', () => {
    const coincidentNodes: NavigationNodeData[] = [
      {
        ...nodes[0],
        position: [3, 1, 3],
        cameraTarget: [3, 1, 4]
      },
      {
        ...nodes[1],
        position: [3, 1, 3],
        cameraTarget: [4, 1, 3]
      }
    ];
    const graph = createNavigationGraph({
      entities: [],
  objects: [],
      navigationNodes: coincidentNodes,
      connections: [
        {
          id: 'coincident',
          fromNodeId: 'a',
          toNodeId: 'b',
          clearance: 0.3,
          positionPath: {
            kind: 'rounded-polyline',
            anchors: runtimeAnchors('coincident', [
              [3, 1, 3],
              [3, 1, 3]
            ])
          }
        }
      ]
    });

    const route = getCameraRoute('a', 'b', graph);
    expect(route.positionParts).toEqual([
      {
        kind: 'rounded-polyline',
        points: [
          [3, 1, 3],
          [3, 1, 3]
        ],
        clearance: 0.3
      }
    ]);
    expect(route.targetPoints).toEqual([
      [3, 1, 4],
      [4, 1, 3]
    ]);

    const motion = createCameraMotion(route);
    const output = createCameraMotionSample();
    expect(motion.durationSeconds).toBe(CAMERA_MOTION_TIMING.minDurationSeconds);
    sampleCameraMotion(motion, 1, output);
    expect(output.position.toArray()).toEqual([3, 1, 3]);
    expect(output.target.toArray()).toEqual([4, 1, 3]);
  });

  it('retains mixed path boundaries and reverses every kind', () => {
    const mixedNodes: NavigationNodeData[] = [
      ...nodes.slice(0, 3),
      {
        id: 'd',
        roomId: 'paris',
        label: 'D',
        position: [7, 1, 2],
        cameraTarget: [7, 1, 3],
        fov: 54,
        connectedNodeIds: ['c']
      }
    ];
    const mixedConnections: RuntimeConnection[] = [
      connections[0],
      {
        ...connections[1],
        positionPath: {
          kind: 'auto-bezier',
          anchors: runtimeAnchors('b-c-auto', [
            [2, 1, 0],
            [3, 1.2, 2],
            [4, 1, 2]
          ])
        }
      },
      {
        id: 'c-d',
        fromNodeId: 'c',
        toNodeId: 'd',
        clearance: 0.1,
        positionPath: {
          kind: 'rounded-polyline',
          anchors: runtimeAnchors('c-d', [
            [4, 1, 2],
            [6, 1, 2],
            [7, 1, 2]
          ])
        }
      }
    ];
    const graph = createNavigationGraph({
      entities: [],
  objects: [],
      navigationNodes: mixedNodes,
      connections: mixedConnections
    });

    const forward = getCameraRoute('a', 'd', graph);
    expect(forward.positionParts).toEqual([
      {
        kind: 'rounded-polyline',
        points: [
          [0, 1, 0],
          [1, 1, 0],
          [2, 1, 0]
        ],
        clearance: 0.4
      },
      {
        kind: 'auto-bezier',
        anchors: [
          [2, 1, 0],
          [3, 1.2, 2],
          [4, 1, 2]
        ]
      },
      {
        kind: 'rounded-polyline',
        points: [
          [4, 1, 2],
          [6, 1, 2],
          [7, 1, 2]
        ],
        clearance: 0.1
      }
    ]);
    expect(forward.targetPoints).toEqual([
      [0, 1, 1],
      [3, 1, 2],
      [4, 1, 2],
      [6, 1.2, 2],
      [7, 1, 2],
      [7, 1, 2],
      [7, 1, 3]
    ]);
    expect(forward.nodeIds).toEqual(['a', 'b', 'c', 'd']);
    expect(forward.edges).toEqual([
      expectedRouteEdge('a-b', 'forward', 'a', 'b', 0, 0, 2),
      expectedRouteEdge('b-c', 'forward', 'b', 'c', 1, 0, 2),
      expectedRouteEdge('c-d', 'forward', 'c', 'd', 2, 0, 2)
    ]);
    const forwardMotion = createCameraMotion(forward);
    expect(forwardMotion.positionEdgeSpans[0].startDistance).toBe(0);
    expect(forwardMotion.positionEdgeSpans[0].endDistance).toBe(
      forwardMotion.positionEdgeSpans[1].startDistance
    );
    expect(forwardMotion.positionEdgeSpans[1].endDistance).toBe(
      forwardMotion.positionEdgeSpans[2].startDistance
    );
    expect(forwardMotion.positionEdgeSpans[2].endDistance).toBe(
      forwardMotion.positionPath.getLength()
    );

    const reverse = getCameraRoute('d', 'a', graph);
    expect(reverse.positionParts.map((part) => part.kind)).toEqual([
      'rounded-polyline',
      'auto-bezier',
      'rounded-polyline'
    ]);
    expect(reverse.positionParts[0]).toEqual({
      kind: 'rounded-polyline',
      points: [
        [7, 1, 2],
        [6, 1, 2],
        [4, 1, 2]
      ],
      clearance: 0.1
    });
    expect(reverse.positionParts[1]).toEqual({
      kind: 'auto-bezier',
      anchors: [
        [4, 1, 2],
        [3, 1.2, 2],
        [2, 1, 0]
      ]
    });
    expect(reverse.targetPoints).toEqual([
      [7, 1, 3],
      [3, 1, 2],
      [2, 1, 0],
      [1, 1.2, 0],
      [0, 1, 0],
      [0, 1, 0],
      [0, 1, 1]
    ]);
    expect(reverse.edges).toEqual([
      expectedRouteEdge('c-d', 'reverse', 'd', 'c', 0, 0, 2),
      expectedRouteEdge('b-c', 'reverse', 'c', 'b', 1, 0, 2),
      expectedRouteEdge('a-b', 'reverse', 'b', 'a', 2, 0, 2)
    ]);
    expect(() => createCameraMotion(forward)).not.toThrow();
    expect(() => createCameraMotion(reverse)).not.toThrow();
  });

  it('returns cloned route data without modifying connection anchors', () => {
    const route = getCameraRoute('a', 'c', customGraph);
    const part = route.positionParts[0];
    if (part.kind !== 'rounded-polyline') throw new Error('Expected rounded part');

    expect(part.points[1]).not.toBe(connections[0].positionPath.anchors[1].position);
    expect(connections[0].positionPath.anchors[1].position).toEqual([1, 1, 0]);
  });

  it('throws when injected graph is disconnected', () => {
    expect(() => getCameraRoute('a', 'isolated', customGraph)).toThrow(
      'No camera route from a to isolated'
    );
  });

  it('rejects non-contiguous connection joins before motion compilation', () => {
    const graph = createNavigationGraph({
      entities: [],
  objects: [],
      navigationNodes: nodes.slice(0, 3),
      connections: [
        {
          ...connections[0],
          positionPath: {
            kind: 'rounded-polyline',
            anchors: runtimeAnchors('bad-a-b', [
              [0, 1, 0],
              [1.9, 1, 0]
            ])
          }
        },
        connections[1]
      ]
    });

    expect(() => getCameraRoute('a', 'c', graph)).toThrow(
      'Camera route connections a-b and b-c must form a contiguous join'
    );
  });

  it('rejects source and destination ids missing from injected graph', () => {
    expect(() => getCameraRoute('missing', 'a', customGraph)).toThrow(
      'Unknown navigation node: missing'
    );
    expect(() => getCameraRoute('a', 'missing', customGraph)).toThrow(
      'Unknown navigation node: missing'
    );
  });

  it('keeps checked-in scene graph explicit at the call site (identity smoke)', () => {
    const start = navigationGraph.navigationNodes[0]!;
    const neighbor = start.connectedNodeIds[0];
    if (!neighbor) {
      expect(navigationGraph.connections.length).toBeGreaterThan(0);
      return;
    }
    expect(getCameraRoute(start.id, neighbor, navigationGraph)).toEqual(
      getCameraRoute(start.id, neighbor, navigationGraph)
    );
    expect(navigationGraph.navigationNodes).toBe(scene.navigationNodes);
  });
});

describe('getCameraConnectionRoute', () => {
  it.each(FIXTURE_EDGE_MIDPOINTS)(
    'preserves fixture motion for $id in both directions',
    ({ id, duration, position, forwardTarget, reverseTarget }) => {
      const forward = sampleRoute(getCameraConnectionRoute(id, 'forward', fixtureGraph), 0.5);
      const reverse = sampleRoute(getCameraConnectionRoute(id, 'reverse', fixtureGraph), 0.5);

      expect(forward.motion.durationSeconds).toBeCloseTo(duration, 12);
      expect(reverse.motion.durationSeconds).toBeCloseTo(duration, 12);
      expectTupleClose(forward.position, position);
      expectTupleClose(reverse.position, position);
      expectTupleClose(forward.target, forwardTarget);
      expectTupleClose(reverse.target, reverseTarget);
    }
  );

  it('resolves exact selected edge instead of using BFS and supports both directions', () => {
    const parallelConnections: RuntimeConnection[] = [
      {
        id: 'direct',
        fromNodeId: 'a',
        toNodeId: 'b',
        clearance: 0.3,
        positionPath: {
          kind: 'rounded-polyline',
          anchors: runtimeAnchors('direct', [
            [0, 1, 0],
            [2, 1, 0]
          ])
        }
      },
      {
        id: 'scenic',
        fromNodeId: 'a',
        toNodeId: 'b',
        clearance: 0.3,
        positionPath: {
          kind: 'auto-bezier',
          anchors: runtimeAnchors('scenic', [
            [0, 1, 0],
            [1, 2, 2],
            [2, 1, 0]
          ])
        }
      }
    ];
    const graph = createNavigationGraph({
      entities: [],
  objects: [],
      navigationNodes: nodes.slice(0, 2),
      connections: parallelConnections
    });

    expect(getCameraRoute('a', 'b', graph).positionParts[0].kind).toBe(
      'rounded-polyline'
    );
    expect(getCameraConnectionRoute('scenic', 'forward', graph)).toEqual({
      positionParts: [
        {
          kind: 'auto-bezier',
          anchors: [
            [0, 1, 0],
            [1, 2, 2],
            [2, 1, 0]
          ]
        }
      ],
      targetPoints: [
        [0, 1, 1],
        [2, 1.5, 0],
        [2, 1, 1]
      ],
      startFov: 54,
      endFov: 54,
      nodeIds: ['a', 'b'],
      edges: [expectedRouteEdge('scenic', 'forward', 'a', 'b', 0, 0, 2)]
    });
    expect(getCameraConnectionRoute('scenic', 'reverse', graph)).toEqual({
      positionParts: [
        {
          kind: 'auto-bezier',
          anchors: [
            [2, 1, 0],
            [1, 2, 2],
            [0, 1, 0]
          ]
        }
      ],
      targetPoints: [
        [2, 1, 1],
        [0, 1.5, 0],
        [0, 1, 1]
      ],
      startFov: 54,
      endFov: 54,
      nodeIds: ['b', 'a'],
      edges: [expectedRouteEdge('scenic', 'reverse', 'b', 'a', 0, 0, 2)]
    });
  });

  it('selects only the authored view track for the requested direction', () => {
    const directionalNodes: NavigationNodeData[] = [
      { ...nodes[0], fov: 42 },
      { ...nodes[1], fov: 68 }
    ];
    const directionalConnection: RuntimeConnection = {
      ...connections[0],
      viewTracks: {
        forward: [
          {
            id: 'a-b-view-forward-01',
            progress: 0.3,
            cameraTarget: [1, 2, 3],
            fov: 35
          }
        ],
        reverse: [
          {
            id: 'a-b-view-reverse-01',
            progress: 0.6,
            cameraTarget: [4, 5, 6],
            fov: 88
          }
        ],
        framingEnvelope: {
          forward: { enterStart: 0.1, enterEnd: 0.2, exitStart: 0.8, exitEnd: 0.9 },
          reverse: { enterStart: 0, enterEnd: 0.25, exitStart: 0.75, exitEnd: 1 }
        }
      }
    };
    const graph = createNavigationGraph({
      entities: [],
  objects: [],
      navigationNodes: directionalNodes,
      connections: [directionalConnection]
    });

    const forward = getCameraConnectionRoute('a-b', 'forward', graph);
    expect(forward.startFov).toBe(42);
    expect(forward.endFov).toBe(68);
    expect(forward.edges[0].viewTrack).toEqual({
      start: { cameraTarget: [0, 1, 1], fov: 42 },
      keyframes: [
        {
          id: 'a-b-view-forward-01',
          progress: 0.3,
          cameraTarget: [1, 2, 3],
          fov: 35
        }
      ],
      end: { cameraTarget: [2, 1, 1], fov: 68 },
      framingEnvelope: { enterStart: 0.1, enterEnd: 0.2, exitStart: 0.8, exitEnd: 0.9 }
    });

    const reverse = getCameraConnectionRoute('a-b', 'reverse', graph);
    expect(reverse.startFov).toBe(68);
    expect(reverse.endFov).toBe(42);
    expect(reverse.edges[0].viewTrack).toEqual({
      start: { cameraTarget: [2, 1, 1], fov: 68 },
      keyframes: [
        {
          id: 'a-b-view-reverse-01',
          progress: 0.6,
          cameraTarget: [4, 5, 6],
          fov: 88
        }
      ],
      end: { cameraTarget: [0, 1, 1], fov: 42 },
      framingEnvelope: { enterStart: 0, enterEnd: 0.25, exitStart: 0.75, exitEnd: 1 }
    });

    const forwardTarget = forward.edges[0].viewTrack?.keyframes[0].cameraTarget;
    if (!Array.isArray(forwardTarget)) throw new Error('Expected tuple target');
    (forwardTarget as number[])[0] = 99;
    expect(directionalConnection.viewTracks?.forward[0].cameraTarget).toEqual([
      1,
      2,
      3
    ]);
    const forwardEnvelope = forward.edges[0].viewTrack?.framingEnvelope;
    if (!forwardEnvelope) throw new Error('Expected forward framing envelope');
    forwardEnvelope.enterStart = 0.7;
    expect(directionalConnection.viewTracks?.framingEnvelope?.forward?.enterStart).toBe(0.1);

    delete directionalConnection.viewTracks?.framingEnvelope?.reverse;
    const reverseWithoutEnvelope = getCameraConnectionRoute('a-b', 'reverse', graph);
    expect(reverseWithoutEnvelope.edges[0].viewTrack).not.toHaveProperty('framingEnvelope');
  });

  it('does not reuse a forward view track as a reverse fallback', () => {
    const graph = createNavigationGraph({
      entities: [],
  objects: [],
      navigationNodes: nodes.slice(0, 2),
      connections: [
        {
          ...connections[0],
          viewTracks: {
            forward: [
              {
                id: 'forward-only',
                progress: 0.5,
                cameraTarget: [1, 4, 3],
                fov: 44
              }
            ],
            reverse: []
          }
        }
      ]
    });

    expect(
      getCameraConnectionRoute('a-b', 'forward', graph).edges[0].viewTrack
        ?.keyframes
    ).toHaveLength(1);
    expect(
      getCameraConnectionRoute('a-b', 'reverse', graph).edges[0].viewTrack
        ?.keyframes
    ).toEqual([]);
  });

  it('uses travel-facing reverse look-ahead when reverse has no authored keys', () => {
    const graph = createNavigationGraph({
      entities: [],
  objects: [],
      navigationNodes: nodes.slice(0, 2),
      connections: [connections[0]]
    });
    const reverse = getCameraConnectionRoute('a-b', 'reverse', graph);
    const targets = reverse.edges[0]!.automaticTargetPoints!;
    const start = targets[0] as Vec3;
    const bLook = nodes[1]!.cameraTarget;
    // Start look faces travel (toward A), not B's authored room look-at.
    expect(start).not.toEqual(bLook);
    expect(start[2]).toBeLessThan(bLook[2]);
  });

  it('rejects unknown connection ids', () => {
    expect(() =>
      getCameraConnectionRoute('missing', 'forward', customGraph)
    ).toThrow('Unknown camera connection: missing');
  });

  it('rejects unknown directions at runtime boundaries', () => {
    expect(() =>
      getCameraConnectionRoute(
        'a-b',
        'sideways' as unknown as 'forward',
        customGraph
      )
    ).toThrow('Unknown camera connection direction: sideways');
  });
});

describe('getFlowRoute', () => {
  it('resolves the open chain by default and appends the derived loop with loop: true', () => {
    const once = getFlowRoute('tour-a', fixtureGraph);
    expect(once.nodeIds).toEqual(['tour-a', 'tour-b', 'tour-paris', 'tour-d']);
    expect(once.edges.map((edge) => edge.connectionId)).toEqual([
      'tour-a-b',
      'tour-b-paris',
      'tour-paris-d'
    ]);

    const route = getFlowRoute('tour-a', fixtureGraph, { loop: true });
    expect(route.nodeIds).toEqual([
      'tour-a',
      'tour-b',
      'tour-paris',
      'tour-d',
      'tour-a'
    ]);
    expect(route.edges.map((edge) => edge.connectionId)).toEqual([
      'tour-a-b',
      'tour-b-paris',
      'tour-paris-d',
      'tour-d-a'
    ]);
    expect(route.edges.map((edge) => edge.direction)).toEqual(
      Array.from({ length: 4 }, () => 'forward')
    );
    expect(createCameraMotion(route).positionEdgeSpans).toHaveLength(4);
    const finalSample = sampleRoute(route, 1);
    expectTupleClose(
      finalSample.position,
      fixtureGraph.nodeById.get('tour-a')!.position
    );
    expectTupleClose(
      finalSample.target,
      fixtureGraph.nodeById.get('tour-a')!.cameraTarget
    );
    expect(getFlowLoopConnectionId('tour-a', fixtureGraph)).toBe('tour-d-a');
  });

  it('retains reverse traversal when a flow connection is authored backwards', () => {
    const reversedConnection = fixtureGraph.connections[0]!;
    const graph = createNavigationGraph({
      entities: [],
      objects: [],
      navigationNodes: [...fixtureGraph.navigationNodes],
      connections: [
        {
          ...reversedConnection,
          fromNodeId: reversedConnection.toNodeId,
          toNodeId: reversedConnection.fromNodeId,
          positionPath: {
            ...reversedConnection.positionPath,
            anchors: [...reversedConnection.positionPath.anchors].reverse()
          }
        },
        ...fixtureGraph.connections.slice(1)
      ]
    });

    const route = getFlowRoute('tour-a', graph, { loop: true });
    expect(route.edges[0]).toMatchObject({
      connectionId: 'tour-a-b',
      direction: 'reverse',
      fromNodeId: 'tour-a',
      toNodeId: 'tour-b'
    });
    expect(route.edges.slice(1).map((edge) => edge.direction)).toEqual(
      Array.from({ length: 3 }, () => 'forward')
    );
  });

  it('rotates the same legacy cycle from another start', () => {
    const route = getFlowRoute('tour-paris', fixtureGraph, { loop: true });

    expect(route.nodeIds[0]).toBe('tour-paris');
    expect(route.nodeIds.at(-1)).toBe('tour-paris');
    expect(route.edges).toHaveLength(4);
    expect(new Set(route.edges.map((edge) => edge.connectionId)).size).toBe(4);
  });

  it('S10.2 — a two-node pair never loops (distinct-connection test)', () => {
	    // Legacy closed 2-cycle: both nodes point at each other, sharing one
	    // undirected record. The pair's only record is also its chain
	    // transition, so the distinct-connection test yields no loop.
	    const pairGraph = createNavigationGraph({
	      entities: [],
	      objects: [],
	      navigationNodes: [
	        {
	          ...nodes[0]!,
	          connectedNodeIds: ['b'],
	          nextNodeId: 'b',
	          previousNodeId: 'b'
	        },
	        {
	          ...nodes[1]!,
	          connectedNodeIds: ['a'],
	          nextNodeId: 'a',
	          previousNodeId: 'a'
	        }
	      ],
	      connections: [connections[0]]
	    });

	    expect(getFlowLoopConnectionId('a', pairGraph)).toBeNull();
	    expect(getFlowRoute('a', pairGraph, { loop: true }).nodeIds).toEqual([
	      'a',
	      'b'
	    ]);
	  });

  it('S10.2 — an open chain with a distinct closing record loops; without one it plays Once', () => {
    // Open chain a → b → c with a separate c–a record.
    const flowNodes: NavigationNodeData[] = nodes.slice(0, 3).map((node, index) => ({
      ...node,
      connectedNodeIds:
        index === 0
          ? ['b', 'c']
          : index === 1
            ? ['a', 'c']
            : ['b', 'a']
    }));
    (flowNodes[0] as NavigationNodeData).nextNodeId = 'b';
    flowNodes[1]!.previousNodeId = 'a';
    flowNodes[1]!.nextNodeId = 'c';
    flowNodes[2]!.previousNodeId = 'b';
    const graph = createNavigationGraph({
      entities: [],
      objects: [],
      navigationNodes: flowNodes,
      connections: [
        connections[0],
        connections[1],
        {
          id: 'c-a',
          fromNodeId: 'c',
          toNodeId: 'a',
          clearance: 0.4,
          positionPath: {
            kind: 'rounded-polyline',
            anchors: runtimeAnchors('c-a', [
              [4, 1, 2],
              [2, 1, 1],
              [0, 1, 0]
            ])
          }
        }
      ]
    });

    expect(getFlowLoopConnectionId('a', graph)).toBe('c-a');
    expect(getFlowRoute('a', graph).nodeIds).toEqual(['a', 'b', 'c']);
    expect(getFlowRoute('a', graph, { loop: true }).nodeIds).toEqual([
      'a',
      'b',
      'c',
      'a'
    ]);
  });

  it('rejects broken reciprocal links and missing direct flow edges', () => {
    const navigationNodes = fixtureGraph.navigationNodes.map((node) => ({
      ...node,
      position: [...node.position] as Vec3,
      cameraTarget: [...node.cameraTarget] as Vec3,
      connectedNodeIds: [...node.connectedNodeIds]
    }));
    const tourB = navigationNodes.find((node) => node.id === 'tour-b')!;
    tourB.previousNodeId = 'tour-d';
    const brokenReciprocal = {
      navigationNodes,
      connections: fixtureGraph.connections,
      nodeById: new Map(navigationNodes.map((node) => [node.id, node]))
    };
    expect(() => getFlowRoute('tour-a', brokenReciprocal)).toThrow(
      /not reciprocal/
    );

    const missingEdge = {
      navigationNodes: fixtureGraph.navigationNodes,
      connections: fixtureGraph.connections.filter(
        (connection) => connection.id !== 'tour-a-b'
      ),
      nodeById: fixtureGraph.nodeById
    };
    expect(() => getFlowRoute('tour-a', missingEdge)).toThrow(
      'missing a connection from tour-a to tour-b'
    );
  });

  it('rejects a free-only start node', () => {
    expect(() => getFlowRoute('a', customGraph)).toThrow(
      'Camera node a is not on the flow (no nextNodeId)'
    );
  });
});
