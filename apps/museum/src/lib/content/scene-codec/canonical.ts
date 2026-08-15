/**
 * `scene-codec/canonical.ts` — clone helpers + deterministic serializer.
 *
 * Hosts the three entity-tree clones (`cloneWaypoint`, `cloneViewKeyframe`,
 * `cloneEntity`) used to copy user state while leaving the canonical
 * document untouched, plus `canonicalDocument` which is the JSON
 * round-trip assembly used by `validateSceneDocument` to surface the
 * stable serialization alongside the parsed shape.
 *
 * Tagged `@internal` — never imported outside `scene-codec/`.
 */
import type {
	SceneCameraViewKeyframe,
	SceneEntity,
	SceneModelEntity,
	ScenePrimitiveEntity,
	SceneWaypoint
} from '../scene';
import type { MuseumSceneDocument } from '../scene';

export function cloneWaypoint(value: SceneWaypoint): SceneWaypoint {
	return {
		...(value.roomId === undefined ? {} : { roomId: value.roomId }),
		position: [...value.position]
	};
}

export function cloneViewKeyframe(
	value: SceneCameraViewKeyframe
): SceneCameraViewKeyframe {
	return {
		id: value.id,
		progress: value.progress,
		...(value.roomId === undefined ? {} : { roomId: value.roomId }),
		cameraTarget: [...value.cameraTarget],
		fov: value.fov,
		...(value.holdSeconds === undefined ? {} : { holdSeconds: value.holdSeconds }),
		...(value.easing === undefined ? {} : { easing: value.easing })
	};
}

export function cloneEntity(entity: SceneEntity): SceneEntity {
	if (entity.kind === 'model') {
		return {
			kind: 'model',
			id: entity.id,
			name: entity.name,
			roomId: entity.roomId,
			assetId: entity.assetId,
			fallback: entity.fallback,
			position: [...entity.position],
			rotation: [...entity.rotation],
			...(entity.scale === undefined ? {} : { scale: entity.scale }),
			...(entity.materialInstanceId === undefined
				? {}
				: { materialInstanceId: entity.materialInstanceId })
		};
	}
	if (entity.kind === 'primitive') {
		return {
			kind: 'primitive',
			id: entity.id,
			name: entity.name,
			roomId: entity.roomId,
			primitive: entity.primitive,
			dimensions: { ...entity.dimensions },
			materialId: entity.materialId,
			castShadow: entity.castShadow,
			receiveShadow: entity.receiveShadow,
			position: [...entity.position],
			rotation: [...entity.rotation],
			...(entity.scale === undefined ? {} : { scale: entity.scale }),
			...(entity.materialInstanceId === undefined
				? {}
				: { materialInstanceId: entity.materialInstanceId })
		} as ScenePrimitiveEntity;
	}
	if (entity.light === 'spot') {
		return {
			kind: 'light',
			id: entity.id,
			name: entity.name,
			roomId: entity.roomId,
			light: 'spot',
			color: entity.color,
			intensity: entity.intensity,
			angle: entity.angle,
			castShadow: entity.castShadow,
			position: [...entity.position],
			rotation: [...entity.rotation],
			...(entity.scale === undefined ? {} : { scale: entity.scale }),
			...(entity.range === undefined ? {} : { range: entity.range }),
			...(entity.penumbra === undefined ? {} : { penumbra: entity.penumbra })
		};
	}
	if (entity.light === 'point') {
		return {
			kind: 'light',
			id: entity.id,
			name: entity.name,
			roomId: entity.roomId,
			light: 'point',
			color: entity.color,
			intensity: entity.intensity,
			castShadow: entity.castShadow,
			position: [...entity.position],
			rotation: [...entity.rotation],
			...(entity.scale === undefined ? {} : { scale: entity.scale }),
			...(entity.range === undefined ? {} : { range: entity.range })
		};
	}
	return {
		kind: 'light',
		id: entity.id,
		name: entity.name,
		roomId: entity.roomId,
		light: 'directional',
		color: entity.color,
		intensity: entity.intensity,
		castShadow: entity.castShadow,
		position: [...entity.position],
		rotation: [...entity.rotation],
		...(entity.scale === undefined ? {} : { scale: entity.scale })
	};
}

export function canonicalDocument(document: MuseumSceneDocument): MuseumSceneDocument {
	return {
		textures: document.textures.map((texture) => ({
			id: texture.id,
			name: texture.name,
			uri: texture.uri
		})),
		materials: document.materials.map((material) => ({
			id: material.id,
			name: material.name,
			baseMaterialId: material.baseMaterialId,
			...(material.baseTextureId === undefined
				? {}
				: { baseTextureId: material.baseTextureId }),
			...(material.roughness === undefined ? {} : { roughness: material.roughness }),
			...(material.metalness === undefined ? {} : { metalness: material.metalness })
		})),
		entities: document.entities.map(cloneEntity),
		...(document.clusters === undefined ? {} : { clusters: document.clusters.map((cluster) => ({ id: cluster.id, name: cluster.name, roomId: cluster.roomId, memberIds: [...cluster.memberIds] })) }),
		navigationNodes: document.navigationNodes.map((node) => ({ id: node.id, roomId: node.roomId, label: node.label, position: [...node.position], cameraTarget: [...node.cameraTarget], fov: node.fov, connectedNodeIds: [...node.connectedNodeIds], ...(node.nextNodeId === undefined ? {} : { nextNodeId: node.nextNodeId }), ...(node.previousNodeId === undefined ? {} : { previousNodeId: node.previousNodeId }), ...(node.lockInteraction === undefined ? {} : { lockInteraction: node.lockInteraction }), ...(node.holdSeconds === undefined ? {} : { holdSeconds: node.holdSeconds }) })),
		connections: document.connections.map((connection) => ({
			id: connection.id,
			fromNodeId: connection.fromNodeId,
			toNodeId: connection.toNodeId,
			clearance: connection.clearance,
			positionPath: {
				kind: connection.positionPath.kind,
				anchors: connection.positionPath.anchors.map((anchor) => ({
					id: anchor.id,
					...cloneWaypoint(anchor)
				}))
			},
			...(connection.viewTracks === undefined
				? {}
				: {
						viewTracks: {
							forward: connection.viewTracks.forward.map(cloneViewKeyframe),
							reverse: connection.viewTracks.reverse.map(cloneViewKeyframe)
						}
					}),
			...(connection.targetWaypoints === undefined
				? {}
				: { targetWaypoints: connection.targetWaypoints.map(cloneWaypoint) }),
			...(connection.timing === undefined
				? {}
				: {
						timing: {
							...(connection.timing.forward === undefined
								? {}
								: { forward: { ...connection.timing.forward } }),
							...(connection.timing.reverse === undefined
								? {}
								: { reverse: { ...connection.timing.reverse } })
						}
					})
		}))
	};
}
