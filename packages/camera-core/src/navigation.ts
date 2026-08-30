import type { CameraGraphConnection, CameraGraphNode } from './scene-types';

/** TEMPORARY TYPE HOME → project-model. Structural graph input for camera-core. */
export type CameraGraph = {
  navigationNodes: readonly CameraGraphNode[];
  connections: readonly CameraGraphConnection[];
  nodeById: ReadonlyMap<string, CameraGraphNode>;
};

export function getNode(id: string, graph: CameraGraph): CameraGraphNode {
  const node = graph.nodeById.get(id);
  if (!node) throw new Error(`Unknown navigation node: ${id}`);
  return node;
}
