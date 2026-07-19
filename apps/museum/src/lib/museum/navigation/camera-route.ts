import {
  getNode,
  museumNavigationGraph,
  type NavigationGraph
} from '$lib/content/scene';
import type { MuseumConnection, Vec3 } from '$lib/types/museum';
import type {
  CameraPositionPathPart,
  CameraRoute
} from './camera-motion';

type OrientedConnection = {
  connection: MuseumConnection;
  fromNodeId: string;
  toNodeId: string;
  reversed: boolean;
};

export type CameraConnectionDirection = 'forward' | 'reverse';

export type ResolvedCameraRoute = CameraRoute & {
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

function pointsEqual(left: Vec3, right: Vec3) {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

function appendDistinct(destination: Vec3[], points: readonly Vec3[]) {
  for (const point of points) {
    const previous = destination.at(-1);
    if (previous && pointsEqual(previous, point)) continue;
    destination.push([...point]);
  }
}

function partPoints(part: CameraPositionPathPart) {
  return part.kind === 'rounded-polyline' ? part.points : part.anchors;
}

function flattenOrderedPoints(parts: readonly CameraPositionPathPart[]) {
  const points: Vec3[] = [];

  for (const [partIndex, part] of parts.entries()) {
    const source = partPoints(part) as readonly Vec3[];
    for (let pointIndex = 0; pointIndex < source.length; pointIndex += 1) {
      if (partIndex > 0 && pointIndex === 0) continue;
      points.push([...source[pointIndex]]);
    }
  }

  return points;
}

function buildLookAheadTargets(
  fromNodeId: string,
  toNodeId: string,
  positions: readonly Vec3[],
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

function orientedConnectionPoints(edge: OrientedConnection) {
  const points = edge.connection.positionPath.anchors.map((anchor) => anchor.position);
  return edge.reversed ? points.reverse() : points;
}

function assertOrientedPathContiguous(path: readonly OrientedConnection[]) {
  let previousEnd: Vec3 | undefined;

  for (const [index, edge] of path.entries()) {
    const points = orientedConnectionPoints(edge);
    if (points.length === 0) {
      throw new Error(`Camera connection ${edge.connection.id} has no position anchors`);
    }
    if (previousEnd && !pointsEqual(previousEnd, points[0])) {
      throw new Error(
        `Camera route connections ${path[index - 1].connection.id} and ${edge.connection.id} must form a contiguous join`
      );
    }
    previousEnd = points.at(-1);
  }
}

function buildPositionParts(path: readonly OrientedConnection[]) {
  const parts: CameraPositionPathPart[] = [];

  for (const edge of path) {
    const points = orientedConnectionPoints(edge);

    if (edge.connection.positionPath.kind === 'rounded-polyline') {
      const previousPart = parts.at(-1);
      if (previousPart?.kind === 'rounded-polyline') {
        appendDistinct(previousPart.points as Vec3[], points);
        previousPart.clearance = Math.min(
          previousPart.clearance ?? edge.connection.clearance,
          edge.connection.clearance
        );
      } else {
        const legacyPoints: Vec3[] = [];
        appendDistinct(legacyPoints, points);
        parts.push({
          kind: 'rounded-polyline',
          points: legacyPoints,
          clearance: edge.connection.clearance
        });
      }
      continue;
    }

    parts.push({
      kind: 'auto-bezier',
      anchors: points.map((point): Vec3 => [...point])
    });
  }

  return parts;
}

function assertPositionPartsContiguous(parts: readonly CameraPositionPathPart[]) {
  for (const [index, part] of parts.entries()) {
    const points = partPoints(part) as readonly Vec3[];
    if (points.length === 0) {
      throw new Error(`Camera route position part[${index}] must contain at least one point`);
    }
    if (index === 0) continue;

    const previous = partPoints(parts[index - 1]) as readonly Vec3[];
    if (!pointsEqual(previous.at(-1) as Vec3, points[0])) {
      throw new Error(
        `Camera route position parts ${index - 1} and ${index} must form a contiguous join`
      );
    }
  }
}

function preserveTargetOnlyMotion(parts: CameraPositionPathPart[]) {
  const positions = flattenOrderedPoints(parts);
  if (positions.length !== 1) return positions;

  const finalPart = parts.at(-1);
  if (!finalPart) return positions;
  if (finalPart.kind === 'rounded-polyline') {
    (finalPart.points as Vec3[]).push([...positions[0]]);
  } else {
    (finalPart.anchors as Vec3[]).push([...positions[0]]);
  }
  positions.push([...positions[0]]);
  return positions;
}

function buildResolvedRoute(
  fromNodeId: string,
  toNodeId: string,
  path: readonly OrientedConnection[],
  graph: NavigationGraph
): ResolvedCameraRoute {
  assertOrientedPathContiguous(path);
  const positionParts = buildPositionParts(path);
  assertPositionPartsContiguous(positionParts);
  const positions = preserveTargetOnlyMotion(positionParts);

  return {
    positionParts,
    targetPoints: buildLookAheadTargets(fromNodeId, toNodeId, positions, graph),
    nodeIds: [fromNodeId, ...path.map((edge) => edge.toNodeId)]
  };
}

export function getCameraRoute(
  fromNodeId: string,
  toNodeId: string,
  graph: NavigationGraph = museumNavigationGraph
): ResolvedCameraRoute {
  if (fromNodeId === toNodeId) {
    const node = getNode(fromNodeId, graph);
    return {
      positionParts: [
        {
          kind: 'rounded-polyline',
          points: [[...node.position]],
          clearance: 0.35
        }
      ],
      targetPoints: [[...node.cameraTarget]],
      nodeIds: [fromNodeId]
    };
  }

  getNode(fromNodeId, graph);
  getNode(toNodeId, graph);
  return buildResolvedRoute(
    fromNodeId,
    toNodeId,
    findConnectionPath(fromNodeId, toNodeId, graph),
    graph
  );
}

export function getCameraConnectionRoute(
  connectionId: string,
  direction: CameraConnectionDirection,
  graph: NavigationGraph = museumNavigationGraph
): ResolvedCameraRoute {
  if (direction !== 'forward' && direction !== 'reverse') {
    throw new Error(`Unknown camera connection direction: ${String(direction)}`);
  }
  const connection = graph.connections.find((candidate) => candidate.id === connectionId);
  if (!connection) throw new Error(`Unknown camera connection: ${connectionId}`);

  const reversed = direction === 'reverse';
  const fromNodeId = reversed ? connection.toNodeId : connection.fromNodeId;
  const toNodeId = reversed ? connection.fromNodeId : connection.toNodeId;
  getNode(fromNodeId, graph);
  getNode(toNodeId, graph);

  return buildResolvedRoute(
    fromNodeId,
    toNodeId,
    [{ connection, fromNodeId, toNodeId, reversed }],
    graph
  );
}
