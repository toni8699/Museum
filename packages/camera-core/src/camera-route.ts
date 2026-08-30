import { getNode, type CameraGraph } from './navigation';
import type {
  CameraConnectionDirection,
  CameraGraphConnection,
  CameraGraphNode,
  Vec3
} from './scene-types';
export type { CameraConnectionDirection } from './scene-types';
import type {
  CameraMotionOptions,
  CameraPositionPathPart,
  CameraRoute,
  CameraRouteEdge,
  CameraRouteViewTrack
} from './camera-motion';

type OrientedConnection = {
  connection: CameraGraphConnection;
  fromNodeId: string;
  toNodeId: string;
  reversed: boolean;
};

export type CameraRouteErrorKind = 'no-flow' | 'gap';

/**
 * P11.3 §9 — typed route failure. Kinds are data-shaped, never message
 * parsing: `gap` carries the missing connection's flow endpoints, `no-flow`
 * means no ordered flow exists. Genuine defects (malformed path data,
 * non-contiguous joins, broken reciprocal links) stay plain `Error` so the
 * single `{ timeline, diagnostic }` boundary can tell user-state
 * diagnostics from data errors.
 */
export class CameraRouteError extends Error {
	readonly kind: CameraRouteErrorKind;
	readonly fromNodeId?: string;
	readonly toNodeId?: string;

	constructor(
		kind: CameraRouteErrorKind,
		message: string,
		options: { fromNodeId?: string; toNodeId?: string } = {}
	) {
		super(message);
		this.name = 'CameraRouteError';
		this.kind = kind;
		this.fromNodeId = options.fromNodeId;
		this.toNodeId = options.toNodeId;
	}
}

export type ResolvedCameraRoute = CameraRoute & {
  nodeIds: string[];
  edges: CameraRouteEdge[];
};

function connectedEdges(nodeId: string, graph: CameraGraph): OrientedConnection[] {
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
  graph: CameraGraph
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

function findDirectConnectionSafe(
  fromNodeId: string,
  toNodeId: string,
  graph: CameraGraph
): OrientedConnection | undefined {
  const connection = graph.connections.find(
    (candidate) =>
      (candidate.fromNodeId === fromNodeId && candidate.toNodeId === toNodeId) ||
      (candidate.fromNodeId === toNodeId && candidate.toNodeId === fromNodeId)
  );
  if (!connection) return undefined;
  const reversed = connection.toNodeId === fromNodeId;
  return { connection, fromNodeId, toNodeId, reversed };
}

function findDirectConnection(
  fromNodeId: string,
  toNodeId: string,
  graph: CameraGraph
): OrientedConnection {
  const direct = findDirectConnectionSafe(fromNodeId, toNodeId, graph);
  if (!direct) {
    throw new CameraRouteError(
      'gap',
      `The guided camera route is missing a connection from ${fromNodeId} to ${toNodeId}`,
      { fromNodeId, toNodeId }
    );
  }
  return direct;
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

function travelFacingTarget(positions: readonly Vec3[], index: number): Vec3 {
	const lastIndex = positions.length - 1;
	const position = positions[index]!;
	if (index < lastIndex) {
		const lookAhead = positions[Math.min(lastIndex, index + 2)]!;
		return [lookAhead[0], Math.min(position[1], 1.5), lookAhead[2]];
	}
	// Past the final sample: keep facing the last travel direction.
	const from = positions[Math.max(0, lastIndex - 2)]!;
	return [
		position[0] + (position[0] - from[0]),
		Math.min(position[1], 1.5),
		position[2] + (position[2] - from[2])
	];
}

function buildLookAheadTargets(
  fromNodeId: string,
  toNodeId: string,
  positions: readonly Vec3[],
  graph: CameraGraph,
	options: { travelFacingEnds?: boolean } = {}
): Vec3[] {
	const lastIndex = positions.length - 1;
	const travelFacingEnds = options.travelFacingEnds === true;

	return positions.map((position, index) => {
		if (travelFacingEnds) {
			return travelFacingTarget(positions, index);
		}
		if (index === 0) return [...getNode(fromNodeId, graph).cameraTarget];
		if (index === lastIndex) return [...getNode(toNodeId, graph).cameraTarget];

		const lookAhead = positions[Math.min(lastIndex, index + 2)]!;
		return [lookAhead[0], Math.min(position[1], 1.5), lookAhead[2]];
	});
}

function buildOrientedViewTrack(
  edge: OrientedConnection,
  graph: CameraGraph
): CameraRouteViewTrack {
  const startNode = getNode(edge.fromNodeId, graph);
  const endNode = getNode(edge.toNodeId, graph);
  const direction = edge.reversed ? 'reverse' : 'forward';
  const keyframes = edge.connection.viewTracks?.[direction] ?? [];
  const framingEnvelope = edge.connection.viewTracks?.framingEnvelope?.[direction];

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
    },
    ...(framingEnvelope === undefined
      ? {}
      : { framingEnvelope: { ...framingEnvelope } })
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
  graph: CameraGraph
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
        graph,
        {
          // Reverse with no authored reverse keys should face travel (go backward),
          // not snap to node look-ats (which reads as a turn-around at the start).
          travelFacingEnds:
            edge.reversed &&
            (edge.connection.viewTracks?.reverse.length ?? 0) === 0
        }
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
  graph: CameraGraph
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
  graph: CameraGraph
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
  graph: CameraGraph
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

type FlowChain = {
  head: CameraGraphNode;
  tail: CameraGraphNode;
  nodeIds: string[];
  path: OrientedConnection[];
  connectionIds: ReadonlySet<string>;
  gap: FlowRouteGap | null;
};

export type FlowRouteGap = {
  fromNodeId: string;
  toNodeId: string;
};

export type FlowRouteResolution = {
  route: ResolvedCameraRoute | null;
  gap: FlowRouteGap | null;
};

/**
 * Walk one ordered flow from `startNodeId` following `nextNodeId` links.
 * The walk stops at the open tail (`nextNodeId` undefined) or — for a legacy
 * closed-cycle document — at the node whose next points back at the start
 * (the derived chain never takes the closing edge). Order links choose
 * topology; this never substitutes a BFS path for a missing flow edge.
 */
function walkFlowChain(startNodeId: string, graph: CameraGraph): FlowChain {
  const start = getNode(startNodeId, graph);
  if (start.nextNodeId === undefined) {
    throw new Error(`Camera node ${startNodeId} is not on the flow (no nextNodeId)`);
  }

  const visited = new Set<string>();
  const path: OrientedConnection[] = [];
  const connectionIds = new Set<string>();
  let cursor = start;

  while (true) {
    if (visited.has(cursor.id)) {
      throw new Error(`The flow repeats ${cursor.id} before returning to ${start.id}`);
    }
    visited.add(cursor.id);

    const nextNodeId = cursor.nextNodeId;
    if (nextNodeId === undefined) break;
    const next = getNode(nextNodeId, graph);
    if (next.previousNodeId !== cursor.id) {
      throw new Error(`Flow link ${cursor.id} → ${next.id} is not reciprocal`);
    }
    if (next.id === start.id) break; // legacy closed cycle — stop at the derived tail

    let edge: OrientedConnection;
    try {
      edge = findDirectConnection(cursor.id, next.id, graph);
    } catch (error) {
      if (!(error instanceof CameraRouteError) || error.kind !== 'gap') throw error;
      return {
        head: start,
        tail: cursor,
        nodeIds: [...visited],
        path,
        connectionIds,
        gap: { fromNodeId: cursor.id, toNodeId: next.id }
      };
    }
    path.push(edge);
    connectionIds.add(edge.connection.id);
    cursor = next;
  }

  return {
    head: start,
    tail: cursor,
    nodeIds: [...visited],
    path,
    connectionIds,
    gap: null
  };
}

function flowGapError(gap: FlowRouteGap) {
  return new CameraRouteError(
    'gap',
    `The guided camera route is missing a connection from ${gap.fromNodeId} to ${gap.toNodeId}`,
    gap
  );
}

function appendFlowLoop(
  chain: FlowChain,
  path: OrientedConnection[],
  graph: CameraGraph
) {
  const closing = findDirectConnectionSafe(chain.tail.id, chain.head.id, graph);
  if (!closing || chain.connectionIds.has(closing.connection.id)) {
    return chain.tail.id;
  }
  path.push(closing);
  return chain.head.id;
}

/** Resolve ordered flow while retaining any evaluable prefix before a gap. */
export function resolveFlowRoute(
  startNodeId: string,
  graph: CameraGraph,
  options: { loop?: boolean } = {}
): FlowRouteResolution {
  const chain = walkFlowChain(startNodeId, graph);
  const path = [...chain.path];
  if (chain.gap) {
    return {
      route:
        path.length > 0
          ? buildResolvedRoute(chain.head.id, chain.tail.id, path, graph)
          : null,
      gap: chain.gap
    };
  }
  const endNodeId = options.loop === true
    ? appendFlowLoop(chain, path, graph)
    : chain.tail.id;
  return {
    route: buildResolvedRoute(chain.head.id, endNodeId, path, graph),
    gap: null
  };
}

/**
 * S10.2 — the distinct-connection loop test. Returns the closing connection
 * record id joining the flow tail back to its head when (a) such a record
 * exists and (b) it is NOT already a chain transition record. Uniform for all
 * N: a two-node pair's only record is also its chain transition, so it never
 * loops — no special case. `null` means the flow is open (plays Once).
 */
export function getFlowLoopConnectionId(
  startNodeId: string,
  graph: CameraGraph
): string | null {
  const chain = walkFlowChain(startNodeId, graph);
  if (chain.gap) throw flowGapError(chain.gap);
  const closing = findDirectConnectionSafe(chain.tail.id, chain.head.id, graph);
  if (!closing) return null;
  if (chain.connectionIds.has(closing.connection.id)) return null;
  return closing.connection.id;
}

/**
 * Resolve the ordered flow starting at `startNodeId`. By default the route is
 * the open chain (Once playback: head → … → tail). With `options.loop: true`
 * the derived closing record is appended when the distinct-connection test
 * holds (Loop playback over the authored return edge).
 */
export function getFlowRoute(
  startNodeId: string,
  graph: CameraGraph,
  options: { loop?: boolean } = {}
): ResolvedCameraRoute {
  const resolution = resolveFlowRoute(startNodeId, graph, options);
  if (resolution.gap) throw flowGapError(resolution.gap);
  if (!resolution.route) {
    throw new Error(`Camera route from ${startNodeId} is empty`);
  }
  return resolution.route;
}

/** Phase 3.7: project a connection's authored timing pair onto per-direction motion options consumed by `createCameraMotion`. Only `timing` is read. */
export function getCameraMotionOptions(
  connection: Pick<CameraGraphConnection, 'timing'>,
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
