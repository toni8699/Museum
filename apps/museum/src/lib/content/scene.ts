import rawMuseumSceneDocument from './museum-scene.json';
import { roomPoint } from './rooms';
import {
  SceneDocumentValidationError,
  validateSceneDocument
} from './scene-codec';
import type { AssetPlacement } from '$lib/types/assets';
import type {
  CameraEasing,
  MuseumConnection,
  MuseumRoomId,
  NavigationNodeData,
  RuntimeCameraViewKeyframe,
  RuntimePathAnchor,
  SceneConnectionTiming,
  SceneViewKeyframeTiming,
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

export type SceneCameraViewKeyframe = {
  /** Stable within both directional tracks of this connection. */
  id: string;
  /** Exact-edge arc-length progress in this track's travel direction. */
  progress: number;
  /** Room-local when roomId is present, otherwise world-space. */
  cameraTarget: Vec3;
  roomId?: MuseumRoomId;
  /** Vertical PerspectiveCamera field of view in degrees. */
  fov: number;
  /** Phase 3.7 authored post-key timing. */
  holdSeconds?: number;
  /** Phase 3.7 authored easing to the next framing sample. */
  easing?: CameraEasing;
};

export type SceneConnectionViewTracks = {
  forward: SceneCameraViewKeyframe[];
  reverse: SceneCameraViewKeyframe[];
};

export type SceneConnectionTimingPair = {
  forward?: SceneConnectionTiming;
  reverse?: SceneConnectionTiming;
};

export type SceneWaypoint = {
  /** Room-local when roomId is present, otherwise world-space. */
  position: Vec3;
  roomId?: MuseumRoomId;
};

export type ScenePathAnchor = SceneWaypoint & {
  /** Stable within this connection and across serialization/history. */
  id: string;
};

export type ScenePositionPath =
  | {
      kind: 'rounded-polyline';
      anchors: ScenePathAnchor[];
    }
  | {
      kind: 'auto-bezier';
      anchors: ScenePathAnchor[];
    };

export type SceneConnection = Omit<
  MuseumConnection,
  'positionPath' | 'viewTracks' | 'targetWaypoints' | 'timing'
> & {
  /** Interior anchors only; the resolver inserts fresh node endpoints. */
  positionPath: ScenePositionPath;
  /** Direction-specific interior view keys. Node views supply generated endpoints. */
  viewTracks?: SceneConnectionViewTracks;
  /** Interior look waypoints only; currently unused by camera-route. */
  targetWaypoints?: SceneWaypoint[];
  /** Phase 3.7 authored connection timing, applied per direction. */
  timing?: SceneConnectionTimingPair;
};

/** Current scene schema version. Documents without timing canonicalise to v3. */
export const MUSEUM_SCENE_SCHEMA_VERSION = 4 as const;

export type MuseumSceneDocument = {
  version: 3 | 4;
  objects: SceneObjectPlacement[];
  /** Editor-only hierarchy metadata. Visitor rendering intentionally stays flat. */
  clusters?: SceneObjectCluster[];
  navigationNodes: SceneNavigationNode[];
  connections: SceneConnection[];
};

/** Runtime type that the document parser canonicalises into. */
export type CanonicalMuseumSceneDocument = MuseumSceneDocument;

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

function resolveViewKeyframe(
  keyframe: SceneCameraViewKeyframe
): RuntimeCameraViewKeyframe {
  return {
    id: keyframe.id,
    progress: keyframe.progress,
    cameraTarget: keyframe.roomId
      ? roomPoint(keyframe.roomId, keyframe.cameraTarget)
      : cloneVec3(keyframe.cameraTarget),
    fov: keyframe.fov,
    ...(keyframe.holdSeconds === undefined ? {} : { holdSeconds: keyframe.holdSeconds }),
    ...(keyframe.easing === undefined ? {} : { easing: keyframe.easing })
  };
}

export function resolveSceneDocument(input: unknown): RuntimeMuseumScene {
  const validation = validateSceneDocument(input);
  if (!validation.success) throw new SceneDocumentValidationError(validation.issues[0]!);
  const document = validation.document;

  const navigationNodes = document.navigationNodes.map((node): NavigationNodeData => ({
    ...node,
    position: roomPoint(node.roomId, node.position),
    cameraTarget: roomPoint(node.roomId, node.cameraTarget),
    connectedNodeIds: [...node.connectedNodeIds],
    ...(node.holdSeconds === undefined ? {} : { holdSeconds: node.holdSeconds })
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
    const interiorAnchors = connection.positionPath.anchors.map(
      (anchor): RuntimePathAnchor => ({
        id: anchor.id,
        position: resolveWaypoint(anchor)
      })
    );
    const resolved: MuseumConnection = {
      id: connection.id,
      fromNodeId: connection.fromNodeId,
      toNodeId: connection.toNodeId,
      clearance: connection.clearance,
      positionPath: {
        kind: connection.positionPath.kind,
        anchors: [
          { id: `node:${fromNode.id}:position`, position: cloneVec3(fromNode.position) },
          ...interiorAnchors,
          { id: `node:${toNode.id}:position`, position: cloneVec3(toNode.position) }
        ]
      }
    };

    if (connection.targetWaypoints) {
      resolved.targetWaypoints = [
        cloneVec3(fromNode.cameraTarget),
        ...connection.targetWaypoints.map(resolveWaypoint),
        cloneVec3(toNode.cameraTarget)
      ];
    }

    if (connection.viewTracks) {
      resolved.viewTracks = {
        forward: connection.viewTracks.forward.map(resolveViewKeyframe),
        reverse: connection.viewTracks.reverse.map(resolveViewKeyframe)
      };
    }

    const timing = connection.timing;
    if (
      (timing?.forward !== undefined) ||
      (timing?.reverse !== undefined)
    ) {
      resolved.timing = {
        ...(timing?.forward === undefined ? {} : { forward: { ...timing.forward } }),
        ...(timing?.reverse === undefined ? {} : { reverse: { ...timing.reverse } })
      };
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

// JSON inference widens tuple and literal types; resolveSceneDocument validates this boundary.
export const museumSceneDocument = rawMuseumSceneDocument as unknown as MuseumSceneDocument;
export const museumScene = resolveSceneDocument(museumSceneDocument);
export const museumNavigationGraph = createNavigationGraph(museumScene);
export const nodeById = museumNavigationGraph.nodeById;

export function getNode(id: string, graph: NavigationGraph = museumNavigationGraph) {
  const node = graph.nodeById.get(id);
  if (!node) throw new Error(`Unknown navigation node: ${id}`);
  return node;
}
