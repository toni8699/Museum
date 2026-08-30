import type { NavigationNodeData, RuntimeConnection } from './scene-types';

/** TEMPORARY TYPE HOME → project-model. Structural graph input for camera-core. */
export type NavigationGraph = {
  navigationNodes: readonly NavigationNodeData[];
  connections: readonly RuntimeConnection[];
  nodeById: ReadonlyMap<string, NavigationNodeData>;
};

export function getNode(id: string, graph: NavigationGraph): NavigationNodeData {
  const node = graph.nodeById.get(id);
  if (!node) throw new Error(`Unknown navigation node: ${id}`);
  return node;
}
