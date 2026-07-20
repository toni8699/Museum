import { describe, expect, it } from 'vitest';
import {
  createNavigationGraph,
  museumNavigationGraph,
  museumScene,
  type RuntimeMuseumScene
} from '$lib/content/scene';
import type {
  MuseumConnection,
  NavigationNodeData,
  Vec3
} from '$lib/types/museum';
import { Vector3 } from 'three';
import {
  CAMERA_MOTION_TIMING,
  createCameraMotion,
  createCameraMotionSample,
  sampleCameraMotion
} from './camera-motion';
import {
  getCameraConnectionRoute,
  getCameraRoute
} from './camera-route';

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

const connections: MuseumConnection[] = [
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

const customScene: RuntimeMuseumScene = {
  objects: [],
  navigationNodes: nodes,
  connections
};
const customGraph = createNavigationGraph(customScene);

const PHASE_SIX_EDGE_MIDPOINTS: Array<{
  id: string;
  duration: number;
  position: Vec3;
  forwardTarget: Vec3;
  reverseTarget: Vec3;
}> = [
  {
    id: 'entrance-poland',
    duration: 2.621279562648275,
    position: [-6.902731043055389, 1.65, 16.41935069083306],
    forwardTarget: [-8.069453639463351, 1.5, 15.759473370965573],
    reverseTarget: [-5.166354185611171, 1.5, 17.318309651340886]
  },
  {
    id: 'poland-departure',
    duration: 2.4884923981310987,
    position: [-16.270738758760515, 1.65, 6.538599396867829],
    forwardTarget: [-16.923349106569347, 1.5, 4.28526272865614],
    reverseTarget: [-15.698355745264491, 1.5, 8.037954820726634]
  },
  {
    id: 'departure-paris',
    duration: 4.8,
    position: [-13.297075206035123, 1.65, -6.207447585300129],
    forwardTarget: [-16.764431142787974, 1.5, -12.212304362009139],
    reverseTarget: [-14.31588931431527, 1.5, -7.279883488752916]
  },
  {
    id: 'paris-workshop',
    duration: 4.202122491669538,
    position: [0.1497328690470181, 1.65, -19.296753629915564],
    forwardTarget: [1.8434945769679407, 1.5, -19.273011487594875],
    reverseTarget: [-0.9188798365883082, 1.5, -19.279623120988383]
  },
  {
    id: 'workshop-music-entry',
    duration: 3.0440874871987953,
    position: [4.696781287568541, 1.65, -10.417315781019129],
    forwardTarget: [4.524241260102292, 1.5, -6.192886192108908],
    reverseTarget: [4.453097354533614, 1.4998699101073787, -8.203678316587908]
  },
  {
    id: 'music-entry-center',
    duration: 1.25,
    position: [3.3683773167799846, 1.65, 0.400465812228886],
    forwardTarget: [0, 1.175, 0],
    reverseTarget: [0, 1.175, 0]
  },
  {
    id: 'music-center-legacy',
    duration: 2.4983333161460313,
    position: [8.458987790738268, 1.65, 6.412708294008823],
    forwardTarget: [6.4622651791490435, 1.5, 4.548342454368116],
    reverseTarget: [5.958608144204856, 1.5, 4.02867351695642]
  },
  {
    id: 'legacy-entrance',
    duration: 4.304337431021139,
    position: [12.373306778717218, 1.65, 16.224406858350623],
    forwardTarget: [7.755569993235693, 1.5, 18.372215003382156],
    reverseTarget: [14.263762800185729, 1.5, 14.91759614650124]
  }
];

const PHASE_SIX_MULTI_HOP = [
  {
    from: 'entrance-start',
    to: 'paris-seat',
    duration: 4.8,
    samples: [
      {
        progress: 0.25,
        position: [-6.324462126338117, 1.65, 16.746604519483263] as Vec3,
        target: [-7.1421178677072605, 1.5, 16.283876947335898] as Vec3
      },
      {
        progress: 0.5,
        position: [-16.970071776025556, 1.65, 3] as Vec3,
        target: [-14.836476258959307, 1.5, 3] as Vec3
      },
      {
        progress: 0.75,
        position: [-12.695228782987266, 1.65, -15.973276156734942] as Vec3,
        target: [-10.336133195451932, 1.5, -17.787965070223663] as Vec3
      }
    ]
  },
  {
    from: 'paris-seat',
    to: 'entrance-start',
    duration: 4.8,
    samples: [
      {
        progress: 0.25,
        position: [-12.695228782987282, 1.65, -15.97327615673493] as Vec3,
        target: [-16.85334400441098, 1.5, -11.426156996187961] as Vec3
      },
      {
        progress: 0.5,
        position: [-16.970071776025573, 1.65, 3] as Vec3,
        target: [-21.172058717789554, 1.5, 3.0000000000000004] as Vec3
      },
      {
        progress: 0.75,
        position: [-6.324462126338102, 1.65, 16.74660451948327] as Vec3,
        target: [-3.605021620872647, 1.4999999999999998, 17.973637854318742] as Vec3
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
  it.each(PHASE_SIX_MULTI_HOP)(
    'preserves frozen Phase 6 multi-hop motion from $from to $to',
    ({ from, to, duration, samples }) => {
      const route = getCameraRoute(from, to);
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
    const route = getCameraRoute('entrance-start', 'paris-seat');
    const motion = createCameraMotion(route);

    expect(route.edges.map((edge) => edge.connectionId)).toEqual([
      'entrance-poland',
      'poland-departure',
      'departure-paris'
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
    const mixedConnections: MuseumConnection[] = [
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

  it('keeps checked-in scene as default graph and preserves Paris node traversal data', () => {
    expect(getCameraRoute('entrance-start', 'music-center')).toEqual(
      getCameraRoute('entrance-start', 'music-center', museumNavigationGraph)
    );
    expect(getCameraRoute('entrance-start', 'music-center').nodeIds).toEqual([
      'entrance-start',
      'legacy-return',
      'music-center'
    ]);
    expect(museumNavigationGraph.navigationNodes).toBe(museumScene.navigationNodes);
  });
});

describe('getCameraConnectionRoute', () => {
  it.each(PHASE_SIX_EDGE_MIDPOINTS)(
    'preserves frozen Phase 6 motion for $id in both directions',
    ({ id, duration, position, forwardTarget, reverseTarget }) => {
      const forward = sampleRoute(getCameraConnectionRoute(id, 'forward'), 0.5);
      const reverse = sampleRoute(getCameraConnectionRoute(id, 'reverse'), 0.5);

      expect(forward.motion.durationSeconds).toBeCloseTo(duration, 12);
      expect(reverse.motion.durationSeconds).toBeCloseTo(duration, 12);
      expectTupleClose(forward.position, position);
      expectTupleClose(reverse.position, position);
      expectTupleClose(forward.target, forwardTarget);
      expectTupleClose(reverse.target, reverseTarget);
    }
  );

  it('resolves exact selected edge instead of using BFS and supports both directions', () => {
    const parallelConnections: MuseumConnection[] = [
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
    const directionalConnection: MuseumConnection = {
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
        ]
      }
    };
    const graph = createNavigationGraph({
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
      end: { cameraTarget: [2, 1, 1], fov: 68 }
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
      end: { cameraTarget: [0, 1, 1], fov: 42 }
    });

    const forwardTarget = forward.edges[0].viewTrack?.keyframes[0].cameraTarget;
    if (!Array.isArray(forwardTarget)) throw new Error('Expected tuple target');
    (forwardTarget as number[])[0] = 99;
    expect(directionalConnection.viewTracks?.forward[0].cameraTarget).toEqual([
      1,
      2,
      3
    ]);
  });

  it('does not reuse a forward view track as a reverse fallback', () => {
    const graph = createNavigationGraph({
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
