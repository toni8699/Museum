import { describe, expect, it } from 'vitest';
import {
  createNavigationGraph,
  museumNavigationGraph,
  museumScene,
  type RuntimeMuseumScene
} from '$lib/content/scene';
import type { MuseumConnection, NavigationNodeData } from '$lib/types/museum';
import { getCameraRoute } from './camera-route';

const nodes: NavigationNodeData[] = [
  {
    id: 'a',
    roomId: 'entrance',
    label: 'A',
    position: [0, 1, 0],
    cameraTarget: [0, 1, 1],
    connectedNodeIds: ['b']
  },
  {
    id: 'b',
    roomId: 'poland',
    label: 'B',
    position: [2, 1, 0],
    cameraTarget: [2, 1, 1],
    connectedNodeIds: ['a', 'c']
  },
  {
    id: 'c',
    roomId: 'departure',
    label: 'C',
    position: [4, 1, 2],
    cameraTarget: [4, 1, 3],
    connectedNodeIds: ['b']
  },
  {
    id: 'isolated',
    roomId: 'legacy',
    label: 'Isolated',
    position: [9, 1, 9],
    cameraTarget: [8, 1, 9],
    connectedNodeIds: []
  }
];

const connections: MuseumConnection[] = [
  {
    id: 'a-b',
    fromNodeId: 'a',
    toNodeId: 'b',
    clearance: 0.4,
    positionWaypoints: [
      [0, 1, 0],
      [1, 1, 0],
      [2, 1, 0]
    ]
  },
  {
    id: 'b-c',
    fromNodeId: 'b',
    toNodeId: 'c',
    clearance: 0.2,
    positionWaypoints: [
      [2, 1, 0],
      [3, 1, 1],
      [4, 1, 2]
    ]
  }
];

const customScene: RuntimeMuseumScene = {
  objects: [],
  navigationNodes: nodes,
  connections
};
const customGraph = createNavigationGraph(customScene);

describe('getCameraRoute', () => {
  it('uses only the injected graph for a forward multi-edge route', () => {
    expect(getCameraRoute('a', 'c', customGraph)).toEqual({
      positions: [
        [0, 1, 0],
        [1, 1, 0],
        [2, 1, 0],
        [3, 1, 1],
        [4, 1, 2]
      ],
      targets: [
        [0, 1, 1],
        [3, 1, 1],
        [4, 1, 2],
        [4, 1, 2],
        [4, 1, 3]
      ],
      clearance: 0.2,
      nodeIds: ['a', 'b', 'c']
    });
  });

  it('reverses edge polylines during reverse traversal', () => {
    const route = getCameraRoute('c', 'a', customGraph);

    expect(route.positions).toEqual([
      [4, 1, 2],
      [3, 1, 1],
      [2, 1, 0],
      [1, 1, 0],
      [0, 1, 0]
    ]);
    expect(route.nodeIds).toEqual(['c', 'b', 'a']);
    expect(route.targets[0]).toEqual(nodes[2].cameraTarget);
    expect(route.targets.at(-1)).toEqual(nodes[0].cameraTarget);
  });

  it('returns a cloned resting pose for a same-node route', () => {
    const route = getCameraRoute('b', 'b', customGraph);

    expect(route).toEqual({
      positions: [[2, 1, 0]],
      targets: [[2, 1, 1]],
      clearance: 0.35,
      nodeIds: ['b']
    });
    expect(route.positions[0]).not.toBe(nodes[1].position);
    expect(route.targets[0]).not.toBe(nodes[1].cameraTarget);
  });

  it('throws when the injected graph is disconnected', () => {
    expect(() => getCameraRoute('a', 'isolated', customGraph)).toThrow(
      'No camera route from a to isolated'
    );
  });

  it('rejects source and destination ids missing from the injected graph', () => {
    expect(() => getCameraRoute('missing', 'a', customGraph)).toThrow(
      'Unknown navigation node: missing'
    );
    expect(() => getCameraRoute('a', 'missing', customGraph)).toThrow(
      'Unknown navigation node: missing'
    );
  });

  it('keeps the checked-in scene as the default graph', () => {
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
