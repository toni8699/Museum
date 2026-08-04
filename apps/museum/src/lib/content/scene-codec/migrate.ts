/**
 * `scene-codec/migrate.ts` — V1→V2→V3/V4→V5→V6 deterministic migrations.
 *
 * Hosts the four sequential upgrades:
 *   1. `migrateVersionOneDocument` — strips version label + node forwards.
 *   2. `migrateVersionTwoDocument` — promotes nodes to V3 { fov } shape.
 *   3. `migrateToVersionFive` — wraps objects/clusters into entities.
 *   4. `migrateToVersionSix` — adds texture/material resources.
 *
 * Each function is pure and immutable. `validateSceneDocument` chains them
 * when a lower-version document is loaded.
 *
 * Tagged `@internal` — never imported outside `scene-codec/`.
 */
import { MUSEUM_CAMERA_FOV } from '$lib/types/museum';
import type {
	MuseumSceneDocument,
	SceneConnection,
	SceneObjectPlacement
} from '../scene';
import type {
	LegacyMuseumSceneDocument,
	MuseumSceneDocumentV2,
	MuseumSceneDocumentV3V4,
	MuseumSceneDocumentV5,
	MuseumSceneDocumentWithObjects
} from './types';
import { modelEntityFromPlacement } from './parse-entities';

export function migrateVersionOneDocument(document: LegacyMuseumSceneDocument): MuseumSceneDocumentV2 {
	return {
		version: 2,
		objects: document.objects,
		...(document.clusters === undefined ? {} : { clusters: document.clusters }),
		navigationNodes: document.navigationNodes,
		connections: document.connections.map((connection) => ({
			id: connection.id,
			fromNodeId: connection.fromNodeId,
			toNodeId: connection.toNodeId,
			clearance: connection.clearance,
			positionPath: {
				kind: 'rounded-polyline' as const,
				anchors: connection.positionWaypoints.map((waypoint, index) => ({
					id: `${connection.id}-anchor-${String(index + 1).padStart(2, '0')}`,
					...waypoint
				}))
			},
			...(connection.targetWaypoints === undefined
				? {}
				: { targetWaypoints: connection.targetWaypoints })
		}))
	};
}

export function migrateVersionTwoDocument(document: MuseumSceneDocumentV2): MuseumSceneDocumentV3V4 {
	return {
		version: 3,
		objects: document.objects,
		...(document.clusters === undefined ? {} : { clusters: document.clusters }),
		navigationNodes: document.navigationNodes.map((node) => ({
			...node,
			fov: MUSEUM_CAMERA_FOV.default
		})),
		connections: document.connections
	};
}

export function migrateToVersionFive(
	document: MuseumSceneDocumentWithObjects
): MuseumSceneDocumentV5 {
	return {
		version: 5,
		entities: document.objects.map((object) => modelEntityFromPlacement(object)),
		...(document.clusters === undefined ? {} : { clusters: document.clusters }),
		navigationNodes: document.navigationNodes,
		connections: document.connections
	};
}

export function migrateToVersionSix(document: MuseumSceneDocumentV5): MuseumSceneDocument {
	return {
		version: 6,
		textures: [],
		materials: [],
		entities: document.entities,
		...(document.clusters === undefined ? {} : { clusters: document.clusters }),
		navigationNodes: document.navigationNodes,
		connections: document.connections
	};
}
