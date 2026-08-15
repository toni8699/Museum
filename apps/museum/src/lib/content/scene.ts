import { getAssetById } from './assets';
import {
  SceneDocumentValidationError,
  validateSceneDocument
} from './scene-codec';
import type { AssetId, AssetPlacement, SceneObjectFallback } from '$lib/types/assets';
import type { MaterialId } from '$lib/types/materials';
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

/** Runtime / editor projection of a model entity (no kind/name). */
export type SceneObjectPlacement = AssetPlacement & {
  roomId: MuseumRoomId;
};

export type SceneObjectCluster = {
  id: string;
  name: string;
  roomId: MuseumRoomId;
  memberIds: string[];
};

export type SceneTextureAsset = {
  id: string;
  name: string;
  uri: string;
};

export type SceneMaterialInstance = {
  id: string;
  name: string;
  baseMaterialId: MaterialId;
  baseTextureId?: string;
  roughness?: number;
  metalness?: number;
};

export type ScenePrimitiveKind = 'box' | 'plane' | 'cylinder' | 'sphere';
export type SceneLightKind = 'point' | 'spot' | 'directional';

export type SceneEntityTransform = {
  position: Vec3;
  rotation: Vec3;
  scale?: number;
};

export type SceneEntityBase = SceneEntityTransform & {
  id: string;
  name: string;
  roomId: MuseumRoomId;
};

export type SceneRenderableEntityBase = SceneEntityBase & {
  materialInstanceId?: string;
};

export type SceneModelEntity = SceneRenderableEntityBase & {
  kind: 'model';
  assetId: AssetId;
  fallback: SceneObjectFallback;
};

export type SceneBoxDimensions = {
  width: number;
  height: number;
  depth: number;
};

export type ScenePlaneDimensions = {
  width: number;
  height: number;
};

export type SceneCylinderDimensions = {
  radius: number;
  height: number;
};

export type SceneSphereDimensions = {
  radius: number;
};

export type ScenePrimitiveDimensions =
  | SceneBoxDimensions
  | ScenePlaneDimensions
  | SceneCylinderDimensions
  | SceneSphereDimensions;

export type ScenePrimitiveEntity =
	| (SceneRenderableEntityBase & {
			kind: 'primitive';
			primitive: 'box';
			dimensions: SceneBoxDimensions;
			materialId: MaterialId;
			castShadow: boolean;
			receiveShadow: boolean;
	  })
	| (SceneRenderableEntityBase & {
			kind: 'primitive';
			primitive: 'plane';
			dimensions: ScenePlaneDimensions;
			materialId: MaterialId;
			castShadow: boolean;
			receiveShadow: boolean;
	  })
	| (SceneRenderableEntityBase & {
			kind: 'primitive';
			primitive: 'cylinder';
			dimensions: SceneCylinderDimensions;
			materialId: MaterialId;
			castShadow: boolean;
			receiveShadow: boolean;
	  })
	| (SceneRenderableEntityBase & {
			kind: 'primitive';
			primitive: 'sphere';
			dimensions: SceneSphereDimensions;
			materialId: MaterialId;
			castShadow: boolean;
			receiveShadow: boolean;
	  });

export type SceneLightEntity =
	| (SceneEntityBase & {
			kind: 'light';
			light: 'point';
			color: string;
			intensity: number;
			range?: number;
			castShadow: boolean;
	  })
	| (SceneEntityBase & {
			kind: 'light';
			light: 'spot';
			color: string;
			intensity: number;
			range?: number;
			angle: number;
			penumbra?: number;
			castShadow: boolean;
	  })
	| (SceneEntityBase & {
			kind: 'light';
			light: 'directional';
			color: string;
			intensity: number;
			castShadow: boolean;
	  });

export type SceneEntity = SceneModelEntity | ScenePrimitiveEntity | SceneLightEntity;

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

/** Current scene schema version. v1–v5 migrate to canonical v6 resources. */
export const MUSEUM_SCENE_SCHEMA_VERSION = 6 as const;

/**
 * Authoring-empty scene document: the editor boots into this state before the
 * first entity, navigation node, or connection is authored. It is a valid v6
 * document — the runtime tour/preview guards a blank project separately, so a
 * project with no navigation graph cannot start a broken tour.
 */
export function createEmptySceneDocument(): MuseumSceneDocument {
	return {
		version: MUSEUM_SCENE_SCHEMA_VERSION,
		textures: [],
		materials: [],
		entities: [],
		navigationNodes: [],
		connections: []
	};
}

export type MuseumSceneDocument = {
  version: 6;
  textures: SceneTextureAsset[];
  materials: SceneMaterialInstance[];
  entities: SceneEntity[];
  /** Editor-only hierarchy metadata. Visitor rendering intentionally stays flat. */
  clusters?: SceneObjectCluster[];
  navigationNodes: SceneNavigationNode[];
  connections: SceneConnection[];
};

/** Runtime type that the document parser canonicalises into. */
export type CanonicalMuseumSceneDocument = MuseumSceneDocument;

export type RuntimeMuseumScene = {
  /** Registered texture assets; rendering support lands in Phase 5.3. */
  textures: SceneTextureAsset[];
  /** Material instances; rendering support lands in Phase 5.3. */
  materials: SceneMaterialInstance[];
  /**
   * All scene entities with room-local transforms (cloned from the document).
   * MuseumEntities dispatches by `kind` for shared visitor/editor rendering.
   */
  entities: SceneEntity[];
  /**
   * Model placements only, projected from `kind: 'model'` entities.
   * Kept for Paris activation and legacy callers that still key off `objects`.
   */
  objects: SceneObjectPlacement[];
  /** World-space camera poses. */
  navigationNodes: NavigationNodeData[];
  /** World-space waypoints, including fresh node endpoints. */
  connections: MuseumConnection[];
};

export function isSceneModelEntity(entity: SceneEntity): entity is SceneModelEntity {
  return entity.kind === 'model';
}

export function isScenePrimitiveEntity(
  entity: SceneEntity
): entity is ScenePrimitiveEntity {
  return entity.kind === 'primitive';
}

export function isSceneLightEntity(entity: SceneEntity): entity is SceneLightEntity {
  return entity.kind === 'light';
}

export function listSceneModelEntities(
  document: MuseumSceneDocument
): SceneModelEntity[] {
  return document.entities.filter(isSceneModelEntity);
}

export function modelEntityToPlacement(entity: SceneModelEntity): SceneObjectPlacement {
  return {
    id: entity.id,
    roomId: entity.roomId,
    assetId: entity.assetId,
    fallback: entity.fallback,
    position: entity.position,
    rotation: entity.rotation,
    ...(entity.scale === undefined ? {} : { scale: entity.scale })
  };
}

/** Deep-clone one entity for runtime resolution (room-local poses preserved). */
export function cloneSceneEntity(entity: SceneEntity): SceneEntity {
  const transform = {
    id: entity.id,
    name: entity.name,
    roomId: entity.roomId,
    position: cloneVec3(entity.position),
    rotation: cloneVec3(entity.rotation),
    ...(entity.scale === undefined ? {} : { scale: entity.scale })
  };

  if (entity.kind === 'model') {
    return {
      ...transform,
      kind: 'model',
      assetId: entity.assetId,
      fallback: entity.fallback,
      ...(entity.materialInstanceId === undefined
        ? {}
        : { materialInstanceId: entity.materialInstanceId })
    };
  }

  if (entity.kind === 'primitive') {
    return {
      ...transform,
      kind: 'primitive',
      primitive: entity.primitive,
      dimensions: { ...entity.dimensions },
      materialId: entity.materialId,
      castShadow: entity.castShadow,
      receiveShadow: entity.receiveShadow,
      ...(entity.materialInstanceId === undefined
        ? {}
        : { materialInstanceId: entity.materialInstanceId })
    } as ScenePrimitiveEntity;
  }

  if (entity.light === 'point') {
    return {
      ...transform,
      kind: 'light',
      light: 'point',
      color: entity.color,
      intensity: entity.intensity,
      castShadow: entity.castShadow,
      ...(entity.range === undefined ? {} : { range: entity.range })
    };
  }

  if (entity.light === 'spot') {
    return {
      ...transform,
      kind: 'light',
      light: 'spot',
      color: entity.color,
      intensity: entity.intensity,
      angle: entity.angle,
      castShadow: entity.castShadow,
      ...(entity.range === undefined ? {} : { range: entity.range }),
      ...(entity.penumbra === undefined ? {} : { penumbra: entity.penumbra })
    };
  }

  return {
    ...transform,
    kind: 'light',
    light: 'directional',
    color: entity.color,
    intensity: entity.intensity,
    castShadow: entity.castShadow
  };
}

export function placementToModelEntity(
  placement: SceneObjectPlacement,
  name?: string
): SceneModelEntity {
  const assetName = getAssetById(placement.assetId)?.name;
  return {
    kind: 'model',
    id: placement.id,
    name: name?.trim() || assetName || placement.id,
    roomId: placement.roomId,
    assetId: placement.assetId,
    fallback: placement.fallback,
    position: placement.position,
    rotation: placement.rotation,
    ...(placement.scale === undefined ? {} : { scale: placement.scale })
  };
}

export type NavigationGraph = {
  navigationNodes: readonly NavigationNodeData[];
  connections: readonly MuseumConnection[];
  nodeById: ReadonlyMap<string, NavigationNodeData>;
};

export type SceneRoomResolver = {
  has(roomId: string): boolean;
  point(roomId: string, localPoint: Vec3): Vec3;
};

function cloneVec3(point: Vec3): Vec3 {
  return [...point];
}

function resolveWaypoint(waypoint: SceneWaypoint, rooms: SceneRoomResolver): Vec3 {
  return waypoint.roomId
    ? rooms.point(waypoint.roomId, waypoint.position)
    : cloneVec3(waypoint.position);
}

function resolveViewKeyframe(
  keyframe: SceneCameraViewKeyframe,
  rooms: SceneRoomResolver
): RuntimeCameraViewKeyframe {
  return {
    id: keyframe.id,
    progress: keyframe.progress,
    cameraTarget: keyframe.roomId
      ? rooms.point(keyframe.roomId, keyframe.cameraTarget)
      : cloneVec3(keyframe.cameraTarget),
    fov: keyframe.fov,
    ...(keyframe.holdSeconds === undefined ? {} : { holdSeconds: keyframe.holdSeconds }),
    ...(keyframe.easing === undefined ? {} : { easing: keyframe.easing })
  };
}

export function resolveSceneDocument(input: unknown, rooms: SceneRoomResolver): RuntimeMuseumScene {
  const validation = validateSceneDocument(input);
  if (!validation.success) throw new SceneDocumentValidationError(validation.issues[0]!);
  const document = validation.document;

  const navigationNodes = document.navigationNodes.map((node): NavigationNodeData => ({
    ...node,
    position: rooms.point(node.roomId, node.position),
    cameraTarget: rooms.point(node.roomId, node.cameraTarget),
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
        position: resolveWaypoint(anchor, rooms)
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
        ...connection.targetWaypoints.map((waypoint) => resolveWaypoint(waypoint, rooms)),
        cloneVec3(toNode.cameraTarget)
      ];
    }

    if (connection.viewTracks) {
      resolved.viewTracks = {
        forward: connection.viewTracks.forward.map((keyframe) => resolveViewKeyframe(keyframe, rooms)),
        reverse: connection.viewTracks.reverse.map((keyframe) => resolveViewKeyframe(keyframe, rooms))
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

  const entities = document.entities.map(cloneSceneEntity);
  const textures = document.textures.map((texture) => ({ ...texture }));
  const materials = document.materials.map((material) => ({ ...material }));
  const objects = listSceneModelEntities(document).map(
    (entity): SceneObjectPlacement => ({
      ...modelEntityToPlacement(entity),
      position: cloneVec3(entity.position),
      rotation: cloneVec3(entity.rotation)
    })
  );

  return { textures, materials, entities, objects, navigationNodes, connections };
}

export function createNavigationGraph<
  T extends Pick<RuntimeMuseumScene, 'navigationNodes' | 'connections'>
>(
  scene: T
): NavigationGraph {
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

export function getNode(id: string, graph: NavigationGraph) {
  const node = graph.nodeById.get(id);
  if (!node) throw new Error(`Unknown navigation node: ${id}`);
  return node;
}
