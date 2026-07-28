import {
  getNode,
  museumNavigationGraph,
  type NavigationGraph
} from '$lib/content/scene';
import type {
  CameraConnectionDirection,
  MuseumConnection,
  Vec3
} from '$lib/types/museum';
export type { CameraConnectionDirection } from '$lib/types/museum';
import type {
  CameraMotionOptions,
  CameraPositionPathPart,
  CameraRoute,
  CameraRouteEdge,
  CameraRouteViewTrack
} from './camera-motion';

type OrientedConnection = {
  connection: MuseumConnection;
  fromNodeId: string;
  toNodeId: string;
  reversed: boolean;
};

export type ResolvedCameraRoute = CameraRoute & {
  nodeIds: string[];
  edges: CameraRouteEdge[];
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

function findDirectConnection(
  fromNodeId: string,
  toNodeId: string,
  graph: NavigationGraph
): OrientedConnection {
  const connection = graph.connections.find(
    (candidate) =>
      (candidate.fromNodeId === fromNodeId && candidate.toNodeId === toNodeId) ||
      (candidate.fromNodeId === toNodeId && candidate.toNodeId === fromNodeId)
  );
  if (!connection) {
    throw new Error(
      `The guided camera route is missing a connection from ${fromNodeId} to ${toNodeId}`
    );
  }
  const reversed = connection.toNodeId === fromNodeId;
  return { connection, fromNodeId, toNodeId, reversed };
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

function buildOrientedViewTrack(
  edge: OrientedConnection,
  graph: NavigationGraph
): CameraRouteViewTrack {
  const startNode = getNode(edge.fromNodeId, graph);
  const endNode = getNode(edge.toNodeId, graph);
  const direction = edge.reversed ? 'reverse' : 'forward';
  const keyframes = edge.connection.viewTracks?.[direction] ?? [];

  return {
    start: {
      cameraTarget: [...startNode.cameraTarget],
      fov: startNode.fov
    },
    keyframes: keyframes.map((keyframe) => ({
      id: keyframe.id,
      progress: keyframe.progress,
      cameraTarget: [...keyframe.cameraTarget],
      fov: keyframe.fov
    })),
    end: {
      cameraTarget: [...endNode.cameraTarget],
      fov: endNode.fov
    }
  };
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

function buildPositionParts(
  path: readonly OrientedConnection[],
  graph: NavigationGraph
) {
  const parts: CameraPositionPathPart[] = [];
  const routeEdges: CameraRouteEdge[] = [];

  for (const edge of path) {
    const points = orientedConnectionPoints(edge);
    let partIndex: number;
    let startPointIndex: number;
    let endPointIndex: number;

    if (edge.connection.positionPath.kind === 'rounded-polyline') {
      const previousPart = parts.at(-1);
      if (previousPart?.kind === 'rounded-polyline') {
        partIndex = parts.length - 1;
        startPointIndex = previousPart.points.length - 1;
        appendDistinct(previousPart.points as Vec3[], points);
        endPointIndex = previousPart.points.length - 1;
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
        partIndex = parts.length - 1;
        startPointIndex = 0;
        endPointIndex = legacyPoints.length - 1;
      }
    } else {
      const anchors = points.map((point): Vec3 => [...point]);
      parts.push({
        kind: 'auto-bezier',
        anchors
      });
      partIndex = parts.length - 1;
      startPointIndex = 0;
      endPointIndex = anchors.length - 1;
    }

    routeEdges.push({
      connectionId: edge.connection.id,
      direction: edge.reversed ? 'reverse' : 'forward',
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      positionSpan: {
        start: { partIndex, pointIndex: startPointIndex },
        end: { partIndex, pointIndex: endPointIndex }
      },
      viewTrack: buildOrientedViewTrack(edge, graph),
      automaticTargetPoints: buildLookAheadTargets(
        edge.fromNodeId,
        edge.toNodeId,
        points,
        graph
      )
    });
  }

  return { parts, routeEdges };
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

function preserveTargetOnlyMotion(
  parts: CameraPositionPathPart[],
  routeEdges: CameraRouteEdge[]
) {
  const positions = flattenOrderedPoints(parts);
  if (positions.length !== 1) return positions;

  const finalPart = parts.at(-1);
  if (!finalPart) return positions;
  if (finalPart.kind === 'rounded-polyline') {
    (finalPart.points as Vec3[]).push([...positions[0]]);
  } else {
    (finalPart.anchors as Vec3[]).push([...positions[0]]);
  }
  const finalEdge = routeEdges.at(-1);
  if (finalEdge) {
    finalEdge.positionSpan.end.pointIndex += 1;
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
  const { parts: positionParts, routeEdges: edges } = buildPositionParts(path, graph);
  assertPositionPartsContiguous(positionParts);
  const positions = preserveTargetOnlyMotion(positionParts, edges);

  return {
    positionParts,
    targetPoints: buildLookAheadTargets(fromNodeId, toNodeId, positions, graph),
    startFov: getNode(fromNodeId, graph).fov,
    endFov: getNode(toNodeId, graph).fov,
    nodeIds: [fromNodeId, ...path.map((edge) => edge.toNodeId)],
    edges
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
      startFov: node.fov,
      endFov: node.fov,
      nodeIds: [fromNodeId],
      edges: []
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

/**
 * Resolve exactly one reciprocal guided cycle, including the final edge back to
 * the requested start. Guided links choose topology; this never substitutes a
 * BFS path for a missing guided edge.
 */
export function getGuidedCameraRoute(
  startNodeId: string,
  graph: NavigationGraph = museumNavigationGraph
): ResolvedCameraRoute {
  const start = getNode(startNodeId, graph);
  if (start.nextNodeId === undefined || start.previousNodeId === undefined) {
    throw new Error(`Camera node ${startNodeId} is not part of the guided tour`);
  }

  const guidedNodeCount = graph.navigationNodes.filter(
    (node) => node.nextNodeId !== undefined && node.previousNodeId !== undefined
  ).length;
  const visited = new Set<string>();
  const path: OrientedConnection[] = [];
  let cursor = start;

  while (true) {
    if (visited.has(cursor.id)) {
      throw new Error(
        `The guided camera route repeats ${cursor.id} before returning to ${start.id}`
      );
    }
    visited.add(cursor.id);

    const nextNodeId = cursor.nextNodeId;
    if (!nextNodeId) {
      throw new Error(`Guided camera node ${cursor.id} has no next node`);
    }
    const next = getNode(nextNodeId, graph);
    if (next.previousNodeId !== cursor.id) {
      throw new Error(`Guided camera link ${cursor.id} → ${next.id} is not reciprocal`);
    }

    path.push(findDirectConnection(cursor.id, next.id, graph));
    if (next.id === start.id) break;
    cursor = next;

    if (path.length > guidedNodeCount) {
      throw new Error('The guided camera route does not form one cycle');
    }
  }

  if (visited.size !== guidedNodeCount) {
    throw new Error('The guided camera route does not include every guided node');
  }

  return buildResolvedRoute(start.id, start.id, path, graph);
}

/** Phase 3.7: project a connection's authored timing pair onto per-direction motion options consumed by `createCameraMotion`. */
export function getCameraMotionOptions(
  connection: MuseumConnection,
  direction: CameraConnectionDirection
): CameraMotionOptions {
  const timing = connection.timing?.[direction];
  if (!timing) return {};
  const options: CameraMotionOptions = {};
  if (typeof timing.durationSeconds === 'number') {
    options.durationSeconds = timing.durationSeconds;
  }
  if (timing.easing !== undefined) {
    options.easing = timing.easing;
  }
  return options;
}
