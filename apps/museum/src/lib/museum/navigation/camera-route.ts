import { getNode, navigationConnections } from '$lib/content/rooms';
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
};

function connectedEdges(nodeId: string): OrientedConnection[] {
  const edges: OrientedConnection[] = [];

  for (const connection of navigationConnections) {
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

function findConnectionPath(fromNodeId: string, toNodeId: string) {
  const queue: { nodeId: string; path: OrientedConnection[] }[] = [
    { nodeId: fromNodeId, path: [] }
  ];
  const visited = new Set([fromNodeId]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (current.nodeId === toNodeId) return current.path;

    for (const edge of connectedEdges(current.nodeId)) {
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

function buildLookAheadTargets(fromNodeId: string, toNodeId: string, positions: Vec3[]): Vec3[] {
  const lastIndex = positions.length - 1;

  return positions.map((position, index) => {
    if (index === 0) return [...getNode(fromNodeId).cameraTarget];
    if (index === lastIndex) return [...getNode(toNodeId).cameraTarget];

    const lookAhead = positions[Math.min(lastIndex, index + 2)];
    return [lookAhead[0], Math.min(position[1], 1.5), lookAhead[2]];
  });
}

export function getCameraRoute(fromNodeId: string, toNodeId: string): CameraRoute {
  if (fromNodeId === toNodeId) {
    const node = getNode(fromNodeId);
    return {
      positions: [[...node.position]],
      targets: [[...node.cameraTarget]],
      clearance: 0.35
    };
  }

  const path = findConnectionPath(fromNodeId, toNodeId);
  const positions: Vec3[] = [];

  for (const edge of path) {
    const edgePositions = edge.reversed
      ? [...edge.connection.positionWaypoints].reverse()
      : edge.connection.positionWaypoints;
    appendDistinct(positions, edgePositions);
  }

  return {
    positions,
    targets: buildLookAheadTargets(fromNodeId, toNodeId, positions),
    clearance: Math.min(...path.map((edge) => edge.connection.clearance))
  };
}
