import {
  getNode,
  museumNavigationGraph,
  type NavigationGraph
} from '$lib/content/scene';
import type { MuseumConnection, Vec3 } from '$lib/types/museum';

type OrientedConnection = {
  connection: MuseumConnection;
  fromNodeId: string;
  toNodeId: string;
  reversed: boolean;
};

export type CameraRoute = {
  positions: Vec3[];
  targets: Vec3[];
  clearance: number;
  nodeIds: string[];
};

function connectedEdges(nodeId: string, graph: NavigationGraph): OrientedConnection[] {
  const edges: OrientedConnection[] = [];

  for (const connection of graph.connections) {
    if (connection.fromNodeId === nodeId) {
      edges.push({
        connection,
        fromNodeId: connection.fromNodeId,
        toNodeId: connection.toNodeId,
        reversed: false
      });
    }
    if (connection.toNodeId === nodeId) {
      edges.push({
        connection,
        fromNodeId: connection.toNodeId,
        toNodeId: connection.fromNodeId,
        reversed: true
      });
    }
  }

  return edges;
}

function findConnectionPath(
  fromNodeId: string,
  toNodeId: string,
  graph: NavigationGraph
) {
  const queue: { nodeId: string; path: OrientedConnection[] }[] = [
    { nodeId: fromNodeId, path: [] }
  ];
  const visited = new Set([fromNodeId]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (current.nodeId === toNodeId) return current.path;

    for (const edge of connectedEdges(current.nodeId, graph)) {
      if (visited.has(edge.toNodeId)) continue;
      visited.add(edge.toNodeId);
      queue.push({ nodeId: edge.toNodeId, path: [...current.path, edge] });
    }
  }

  throw new Error(`No camera route from ${fromNodeId} to ${toNodeId}`);
}

function appendDistinct(destination: Vec3[], points: Vec3[]) {
  for (const point of points) {
    const previous = destination.at(-1);
    if (
      previous &&
      previous[0] === point[0] &&
      previous[1] === point[1] &&
      previous[2] === point[2]
    ) {
      continue;
    }
    destination.push([...point]);
  }
}

function buildLookAheadTargets(
  fromNodeId: string,
  toNodeId: string,
  positions: Vec3[],
  graph: NavigationGraph
): Vec3[] {
  const lastIndex = positions.length - 1;

  return positions.map((position, index) => {
    if (index === 0) return [...getNode(fromNodeId, graph).cameraTarget];
    if (index === lastIndex) return [...getNode(toNodeId, graph).cameraTarget];

    const lookAhead = positions[Math.min(lastIndex, index + 2)];
    return [lookAhead[0], Math.min(position[1], 1.5), lookAhead[2]];
  });
}

export function getCameraRoute(
  fromNodeId: string,
  toNodeId: string,
  graph: NavigationGraph = museumNavigationGraph
): CameraRoute {
  if (fromNodeId === toNodeId) {
    const node = getNode(fromNodeId, graph);
    return {
      positions: [[...node.position]],
      targets: [[...node.cameraTarget]],
      clearance: 0.35,
      nodeIds: [fromNodeId]
    };
  }

  getNode(fromNodeId, graph);
  getNode(toNodeId, graph);
  const path = findConnectionPath(fromNodeId, toNodeId, graph);
  const positions: Vec3[] = [];

  for (const edge of path) {
    const edgePositions = edge.reversed
      ? [...edge.connection.positionWaypoints].reverse()
      : edge.connection.positionWaypoints;
    appendDistinct(positions, edgePositions);
  }

  return {
    positions,
    targets: buildLookAheadTargets(fromNodeId, toNodeId, positions, graph),
    clearance: Math.min(...path.map((edge) => edge.connection.clearance)),
    nodeIds: [fromNodeId, ...path.map((edge) => edge.toNodeId)]
  };
}
