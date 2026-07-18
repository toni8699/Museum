import rawMuseumSceneDocument from './museum-scene.json';
import { getAssetById, isSceneObjectFallback } from './assets';
import { roomPoint } from './rooms';
import type { AssetPlacement } from '$lib/types/assets';
import type {
  MuseumConnection,
  MuseumRoomId,
  NavigationNodeData,
  Vec3
} from '$lib/types/museum';

export type SceneObjectPlacement = AssetPlacement & {
  roomId: MuseumRoomId;
};

export type SceneObjectCluster = {
  id: string;
  name: string;
  roomId: MuseumRoomId;
  memberIds: string[];
};

export type SceneNavigationNode = Omit<
  NavigationNodeData,
  'position' | 'cameraTarget'
> & {
  /** Room-local eye position. */
  position: Vec3;
  /** Room-local look target. */
  cameraTarget: Vec3;
};

export type SceneWaypoint = {
  /** Room-local when roomId is present, otherwise world-space. */
  position: Vec3;
  roomId?: MuseumRoomId;
};

export type SceneConnection = Omit<
  MuseumConnection,
  'positionWaypoints' | 'targetWaypoints'
> & {
  /** Interior waypoints only; the resolver inserts fresh node endpoints. */
  positionWaypoints: SceneWaypoint[];
  /** Interior look waypoints only; currently unused by camera-route. */
  targetWaypoints?: SceneWaypoint[];
};

export type MuseumSceneDocument = {
  version: 1;
  objects: SceneObjectPlacement[];
  /** Editor-only hierarchy metadata. Visitor rendering intentionally stays flat. */
  clusters?: SceneObjectCluster[];
  navigationNodes: SceneNavigationNode[];
  connections: SceneConnection[];
};

export type RuntimeMuseumScene = {
  /** Room-local placements, mounted beneath room transforms. */
  objects: SceneObjectPlacement[];
  /** World-space camera poses. */
  navigationNodes: NavigationNodeData[];
  /** World-space waypoints, including fresh node endpoints. */
  connections: MuseumConnection[];
};

export type NavigationGraph = {
  navigationNodes: readonly NavigationNodeData[];
  connections: readonly MuseumConnection[];
  nodeById: ReadonlyMap<string, NavigationNodeData>;
};

function cloneVec3(point: Vec3): Vec3 {
  return [...point];
}

function resolveWaypoint(waypoint: SceneWaypoint): Vec3 {
  return waypoint.roomId
    ? roomPoint(waypoint.roomId, waypoint.position)
    : cloneVec3(waypoint.position);
}

function assertUniqueIds(label: string, ids: string[]) {
  const seen = new Set<string>();

  for (const id of ids) {
    if (seen.has(id)) throw new Error(`Duplicate ${label} id: ${id}`);
    seen.add(id);
  }
}

export function resolveSceneDocument(document: MuseumSceneDocument): RuntimeMuseumScene {
  if (document.version !== 1) {
    throw new Error(`Unsupported museum scene document version: ${String(document.version)}`);
  }

  assertUniqueIds('scene object', document.objects.map((object) => object.id));
  const clusters = document.clusters ?? [];
  assertUniqueIds('scene cluster', clusters.map((cluster) => cluster.id));
  assertUniqueIds('navigation node', document.navigationNodes.map((node) => node.id));
  assertUniqueIds('connection', document.connections.map((connection) => connection.id));

  for (const object of document.objects) {
    if (!getAssetById(object.assetId)) {
      throw new Error(`Unknown museum asset in scene object ${object.id}: ${object.assetId}`);
    }
    if (!isSceneObjectFallback(object.fallback)) {
      throw new Error(`Invalid fallback in scene object ${object.id}: ${String(object.fallback)}`);
    }
  }

  const objectById = new Map(document.objects.map((object) => [object.id, object]));
  const clusteredMemberIds = new Set<string>();

  for (const cluster of clusters) {
    if (cluster.memberIds.length < 2) {
      throw new Error(`Scene cluster must contain at least two members: ${cluster.id}`);
    }

    const memberIds = new Set<string>();
    for (const memberId of cluster.memberIds) {
      if (memberIds.has(memberId)) {
        throw new Error(`Duplicate member in scene cluster ${cluster.id}: ${memberId}`);
      }
      memberIds.add(memberId);

      const placement = objectById.get(memberId);
      if (!placement) {
        throw new Error(`Unknown member in scene cluster ${cluster.id}: ${memberId}`);
      }
      if (placement.roomId !== cluster.roomId) {
        throw new Error(`Cross-room member in scene cluster ${cluster.id}: ${memberId}`);
      }
      if (clusteredMemberIds.has(memberId)) {
        throw new Error(`Scene object belongs to multiple clusters: ${memberId}`);
      }
      clusteredMemberIds.add(memberId);
    }
  }

  const navigationNodes = document.navigationNodes.map((node): NavigationNodeData => ({
    ...node,
    position: roomPoint(node.roomId, node.position),
    cameraTarget: roomPoint(node.roomId, node.cameraTarget),
    connectedNodeIds: [...node.connectedNodeIds]
  }));
  const resolvedNodeById = new Map(navigationNodes.map((node) => [node.id, node]));

  const getResolvedNode = (id: string) => {
    const node = resolvedNodeById.get(id);
    if (!node) throw new Error(`Unknown navigation node in scene connection: ${id}`);
    return node;
  };

  const connections = document.connections.map((connection): MuseumConnection => {
    const fromNode = getResolvedNode(connection.fromNodeId);
    const toNode = getResolvedNode(connection.toNodeId);
    const resolved: MuseumConnection = {
      id: connection.id,
      fromNodeId: connection.fromNodeId,
      toNodeId: connection.toNodeId,
      clearance: connection.clearance,
      positionWaypoints: [
        cloneVec3(fromNode.position),
        ...connection.positionWaypoints.map(resolveWaypoint),
        cloneVec3(toNode.position)
      ]
    };

    if (connection.targetWaypoints) {
      resolved.targetWaypoints = [
        cloneVec3(fromNode.cameraTarget),
        ...connection.targetWaypoints.map(resolveWaypoint),
        cloneVec3(toNode.cameraTarget)
      ];
    }

    return resolved;
  });

  const objects = document.objects.map((object): SceneObjectPlacement => ({
    ...object,
    position: cloneVec3(object.position),
    rotation: cloneVec3(object.rotation)
  }));

  return { objects, navigationNodes, connections };
}

export function createNavigationGraph(scene: RuntimeMuseumScene): NavigationGraph {
  return {
    navigationNodes: scene.navigationNodes,
    connections: scene.connections,
    nodeById: new Map(scene.navigationNodes.map((node) => [node.id, node]))
  };
}

export function assertNavigationGraphMatchesScene(
  graph: NavigationGraph,
  scene: RuntimeMuseumScene
) {
  if (
    graph.navigationNodes !== scene.navigationNodes ||
    graph.connections !== scene.connections
  ) {
    throw new Error('Museum navigation state must use the same resolved scene instance');
  }
}

// JSON inference widens tuple and literal types. Runtime validation is a Phase 7 concern;
// Phase 0 keeps one explicit, checked-in document boundary.
export const museumSceneDocument = rawMuseumSceneDocument as unknown as MuseumSceneDocument;
export const museumScene = resolveSceneDocument(museumSceneDocument);
export const museumNavigationGraph = createNavigationGraph(museumScene);
export const nodeById = museumNavigationGraph.nodeById;

export function getNode(id: string, graph: NavigationGraph = museumNavigationGraph) {
  const node = graph.nodeById.get(id);
  if (!node) throw new Error(`Unknown navigation node: ${id}`);
  return node;
}
