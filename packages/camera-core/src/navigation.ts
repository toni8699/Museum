import type { CameraGraphConnection, CameraGraphNode } from './scene-types';

/**
 * Structural graph input for camera-core (P16 final state — stays here).
 * Durable scene/runtime model types live in @portfolio/project-model; this
 * package intentionally keeps its own minimal structural shape so the
 * dependency stays one-way (camera-core never imports project-model).
 */
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
