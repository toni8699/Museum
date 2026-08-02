import { describe, expect, it } from 'vitest';
import { createNavigationGraph, type RuntimeMuseumScene } from '$lib/content/scene';
import { createMuseumState } from './museum-state.svelte';

const scene: RuntimeMuseumScene = {
  textures: [],
  materials: [],
  entities: [],
  objects: [],
  navigationNodes: [
    {
      id: 'custom-start',
      roomId: 'entrance',
      label: 'Custom start',
      position: [0, 1.65, 0],
      cameraTarget: [0, 1, -1],
      fov: 54,
      connectedNodeIds: ['custom-next'],
      nextNodeId: 'custom-next',
      previousNodeId: 'custom-free'
    },
    {
      id: 'custom-next',
      roomId: 'poland',
      label: 'Custom next',
      position: [1, 1.65, 0],
      cameraTarget: [1, 1, -1],
      fov: 54,
      connectedNodeIds: ['custom-start', 'custom-free'],
      nextNodeId: 'custom-start',
      previousNodeId: 'custom-start'
    },
    {
      id: 'custom-free',
      roomId: 'departure',
      label: 'Custom free target',
      position: [2, 1.65, 0],
      cameraTarget: [2, 1, -1],
      fov: 54,
      connectedNodeIds: ['custom-next']
    }
  ],
  connections: [
    {
      id: 'custom-edge',
      fromNodeId: 'custom-start',
      toNodeId: 'custom-next',
      clearance: 0.35,
      positionPath: {
        kind: 'rounded-polyline',
        anchors: [
          { id: 'node:custom-start:position', position: [0, 1.65, 0] },
          { id: 'node:custom-next:position', position: [1, 1.65, 0] }
        ]
      }
    },
    {
      id: 'custom-free-edge',
      fromNodeId: 'custom-next',
      toNodeId: 'custom-free',
      clearance: 0.35,
      positionPath: {
        kind: 'rounded-polyline',
        anchors: [
          { id: 'node:custom-next:position', position: [1, 1.65, 0] },
          { id: 'node:custom-free:position', position: [2, 1.65, 0] }
        ]
      }
    }
  ]
};

describe('createMuseumState', () => {
  it('resolves every transition against the injected graph', () => {
    const graph = createNavigationGraph(scene);
    const state = createMuseumState(graph, 'custom-start');

    expect(state.activeNode).toBe(scene.navigationNodes[0]);
    expect(state.currentRoomId).toBe('entrance');

    state.goNext();
    expect(state.targetNode).toBe(scene.navigationNodes[1]);
    expect(state.isTransitioning).toBe(true);
    state.requestNode('custom-start');
    expect(state.targetNode).toBe(scene.navigationNodes[1]);

    state.completeTransition('custom-next');
    expect(state.activeNode).toBe(scene.navigationNodes[1]);
    expect(state.currentRoomId).toBe('poland');
    expect(state.visitedRoomIds).toEqual(new Set(['entrance', 'poland']));
  });

  it('allows guided backtracking only after the previous room was visited', () => {
    const state = createMuseumState(createNavigationGraph(scene), 'custom-start');

    state.goBack();
    expect(state.targetNodeId).toBeNull();

    state.goNext();
    state.completeTransition('custom-next');
    state.goBack();
    expect(state.targetNodeId).toBe('custom-start');
  });

  it('allows arbitrary valid nodes in free mode', () => {
    const state = createMuseumState(createNavigationGraph(scene), 'custom-start');

    state.toggleTourMode();
    state.requestNode('custom-free');
    expect(state.targetNodeId).toBe('custom-free');
  });

  it('keeps locked nodes non-navigable', () => {
    const lockedScene = structuredClone(scene);
    lockedScene.navigationNodes[1].lockInteraction = true;
    const state = createMuseumState(createNavigationGraph(lockedScene), 'custom-start');

    state.goNext();
    expect(state.targetNodeId).toBeNull();
    expect(state.isTransitioning).toBe(false);
  });
});
