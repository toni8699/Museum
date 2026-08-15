/**
 * H1 S4 — pure unified-project-tree model + selection matchers.
 *
 * One hierarchy over both documents, never a merged identity type. This module
 * is deliberately renderer-neutral: **no Three/DOM/Svelte imports** (same rule
 * as `$lib/layout/**`). The tree component renders the model; the matchers
 * decide row highlight/interactivity.
 *
 * Row identity is **exactly** the identity the selection types use
 * (`LayoutSelection`, `WorkspaceSelection`, `NavigationSelection`) so
 * selection matching is exact, never coordinate- or index-guessed.
 *
 * Camera connection/direction rows are not modeled here: the tree embeds the
 * existing `GuidedTourPanel` / `NodeConnectionsPanel` /
 * `DirectionalKeyframeList`, which derive them from `getNodeConnections` and
 * own their selection/expansion behavior. The matcher still pins the camera
 * row contract (and the discovery-driven direction-row rule) for tests.
 */

import type { LayoutDocument } from '$lib/layout/layout-types';
import type { MuseumSceneDocument } from '$lib/content/scene';
import type { CameraConnectionDirection } from '$lib/types/museum';
import type { LayoutSelection } from './layout/layout-interaction';
import type { WorkspaceSelection, NavigationSelection } from './museum-editor.types';
import type { ActiveEditorSelection } from './h1/active-editor-selection.svelte';

export type UnifiedTreeRow =
	| { kind: 'room'; roomId: string }
	| { kind: 'wall'; roomId: string; segmentId: string }
	| { kind: 'opening'; roomId: string; segmentId: string; openingId: string }
	| { kind: 'interiorAnchor'; roomId: string; segmentId: string; anchorId: string }
	| { kind: 'object'; objectId: string }
	| { kind: 'cluster'; clusterId: string }
	| { kind: 'entity'; entityId: string }
	| { kind: 'camera-node'; nodeId: string }
	| { kind: 'camera-connection'; connectionId: string }
	| { kind: 'camera-direction'; connectionId: string; direction: CameraConnectionDirection }
	| { kind: 'camera-keyframe'; connectionId: string; direction: CameraConnectionDirection; keyframeId: string };

/**
 * Camera **discovery** slots (`store.activeCameraConnectionId` /
 * `activeCameraDirection` = the reducer's `discoveryConnectionId` /
 * `discoveryDirection`). The camera selection type's public surface omits
 * direction (`navigationSelectionFromState` drops it — "discovery owns it"),
 * so direction rows are discovery-driven. Discovery can be set with **no**
 * navigation selection at all (timeline scrubbing), hence the explicit slot.
 */
export type UnifiedTreeDiscovery = {
	connectionId: string | null;
	direction: CameraConnectionDirection;
};

export type UnifiedTreeWall = {
	roomId: string;
	segmentId: string;
	kind: 'line' | 'auto-bezier';
	anchors: { roomId: string; segmentId: string; anchorId: string }[];
};

export type UnifiedTreeOpening = {
	roomId: string;
	segmentId: string;
	openingId: string;
	kind: 'door' | 'window';
};

export type UnifiedTreeObject = {
	objectId: string;
	kind: 'box' | 'plane' | 'cylinder' | 'sphere' | 'profile';
};

export type UnifiedTreeCluster = {
	clusterId: string;
	name: string;
	memberIds: string[];
};

export type UnifiedTreeEntity = {
	entityId: string;
	name: string;
};

export type UnifiedTreeRoom = {
	roomId: string;
	name: string;
	walls: UnifiedTreeWall[];
	openings: UnifiedTreeOpening[];
	objects: UnifiedTreeObject[];
	clusters: UnifiedTreeCluster[];
	entities: UnifiedTreeEntity[];
};

export type UnifiedTreeCameraTour = {
	guidedNodeIds: string[];
	freeNodeIds: string[];
};

export type UnifiedProjectTreeModel = {
	rooms: UnifiedTreeRoom[];
	cameraTour: UnifiedTreeCameraTour;
};

/**
 * Build the tree model. Rooms come from the layout in **document order**
 * (floors flatMap rooms). Scene clusters/entities nest under the room whose
 * explicit `roomId` matches; content whose `roomId` names no layout room is
 * left out of every room — never silently attached (the umbrella's "geometry
 * never guesses ownership"). Layout objects nest under their explicit
 * `roomId`; unowned objects are not shown in the tree (the inspector's object
 * list still reaches them). Camera nodes stay under the Camera Tour root
 * (guided chain in order + free nodes) — never nested under rooms.
 */	export function buildUnifiedProjectTreeModel(input: {
		layout: LayoutDocument;
		scene: MuseumSceneDocument;
		guidedTourNodeIds: string[];
	}): UnifiedProjectTreeModel {
		const { layout, scene } = input;

		const rooms: UnifiedTreeRoom[] = layout.floors.flatMap((floor) =>
		floor.rooms.map((room): UnifiedTreeRoom => ({
			roomId: room.id,
			name: room.name,
			walls: room.boundary.segments.map((segment) => ({
				roomId: room.id,
				segmentId: segment.id,
				kind: segment.kind,
				anchors:
					segment.kind === 'auto-bezier'
						? segment.interiorAnchors.map((anchor) => ({
								roomId: room.id,
								segmentId: segment.id,
								anchorId: anchor.id
							}))
						: []
			})),
			openings: room.openings.map((opening) => ({
				roomId: room.id,
				segmentId: opening.segmentId,
				openingId: opening.id,
				kind: opening.kind
			})),
			objects: layout.objects
				.filter((object) => object.roomId === room.id)
				.map((object) => ({ objectId: object.id, kind: object.kind })),
			clusters: (scene.clusters ?? [])
				.filter((cluster) => cluster.roomId === room.id)
				.map((cluster) => ({
					clusterId: cluster.id,
					name: cluster.name,
					memberIds: [...cluster.memberIds]
				})),
			entities: scene.entities
				.filter((entity) => entity.roomId === room.id)
				.map((entity) => ({ entityId: entity.id, name: entity.name }))
		}))
	);

	const guided = new Set(input.guidedTourNodeIds);
	const cameraTour: UnifiedTreeCameraTour = {
		guidedNodeIds: [...input.guidedTourNodeIds],
		freeNodeIds: scene.navigationNodes
			.map((node) => node.id)
			.filter((nodeId) => !guided.has(nodeId))
	};

	return { rooms, cameraTour };
}

/**
 * Does the active selection highlight this row? Domain-first: layout rows
 * match `active.selection` exactly; scene rows match the workspace slot;
 * camera rows match `navigation`. The **room row** additionally highlights on
 * room-only *latent* context — but that derives to `active.domain === 'none'`
 * (S3: room-only placement is context, never actionable), so the pure matcher
 * cannot see it. The tree component therefore ORs `store.selectedRoomId ===
 * row.roomId` onto the room-row result (the same read the relic scene tree
 * uses) — documented here so the split stays intentional.
 *
 * **Direction rows are discovery-driven, gated to camera-or-none domain.**
 * `active.domain === 'camera'` highlights the selected direction; with
 * `active.domain === 'none'` a discovery match still highlights (scrub
 * highlight preserved). A layout/scene selection never co-highlights a camera
 * row — one highlighted domain per view, even though discovery itself may
 * persist per the S3 invariant.
 */
export function isUnifiedTreeRowSelected(
	active: ActiveEditorSelection,
	discovery: UnifiedTreeDiscovery | null,
	row: UnifiedTreeRow
): boolean {
	switch (row.kind) {
		case 'room': {
			if (active.domain === 'layout' && active.selection.kind === 'room') {
				return active.selection.roomId === row.roomId;
			}
			if (active.domain === 'scene') {
				const selection = active.selection;
				return (
					(selection.kind === 'placement' || selection.kind === 'cluster') &&
					selection.roomId === row.roomId
				);
			}
			return false;
		}
		case 'wall':
			return (
				active.domain === 'layout' &&
				active.selection.kind === 'wall' &&
				active.selection.roomId === row.roomId &&
				active.selection.segmentId === row.segmentId
			);
		case 'opening':
			return (
				active.domain === 'layout' &&
				active.selection.kind === 'opening' &&
				active.selection.roomId === row.roomId &&
				active.selection.segmentId === row.segmentId &&
				active.selection.openingId === row.openingId
			);
		case 'interiorAnchor':
			return (
				active.domain === 'layout' &&
				active.selection.kind === 'interiorAnchor' &&
				active.selection.roomId === row.roomId &&
				active.selection.segmentId === row.segmentId &&
				active.selection.anchorId === row.anchorId
			);
		case 'object':
			return (
				active.domain === 'layout' &&
				active.selection.kind === 'object' &&
				active.selection.objectId === row.objectId
			);
		case 'cluster':
			return (
				active.domain === 'scene' &&
				active.selection.kind === 'cluster' &&
				active.selection.clusterId === row.clusterId
			);
		case 'entity':
			return (
				active.domain === 'scene' &&
				active.selection.kind === 'placement' &&
				active.selection.ids.includes(row.entityId)
			);
		case 'camera-node':
			return (
				active.domain === 'camera' &&
				active.selection.kind === 'node' &&
				active.selection.nodeId === row.nodeId
			);
		case 'camera-connection': {
			if (active.domain !== 'camera') return false;
			const selection = active.selection;
			return (
				selection.kind === 'connection' ||
				selection.kind === 'anchor' ||
				selection.kind === 'view-keyframe'
			) && selection.connectionId === row.connectionId;
		}
		case 'camera-direction': {
			if (active.domain === 'camera') {
				const selection = active.selection;
				if (selection.kind === 'connection') {
					return (
						selection.connectionId === row.connectionId &&
						selection.direction === row.direction
					);
				}
				if (selection.kind === 'view-keyframe') {
					return (
						selection.connectionId === row.connectionId &&
						selection.direction === row.direction
					);
				}
				if (selection.kind === 'anchor') {
					// Direction rows are discovery-driven: the anchor selection
					// pins the connection, but the direction (and its connection)
					// must agree with discovery — otherwise a scrubbed direction
					// on a different connection would co-highlight this row.
					return (
						selection.connectionId === row.connectionId &&
						discovery?.connectionId === row.connectionId &&
						discovery?.direction === row.direction
					);
				}
				return false;
			}
			if (active.domain === 'none') {
				return (
					discovery !== null &&
					discovery.connectionId === row.connectionId &&
					discovery.direction === row.direction
				);
			}
			return false;
		}
		case 'camera-keyframe':
			return (
				active.domain === 'camera' &&
				active.selection.kind === 'view-keyframe' &&
				active.selection.connectionId === row.connectionId &&
				active.selection.direction === row.direction &&
				active.selection.keyframeId === row.keyframeId
			);
	}
}

/**
 * View-aware pick gating. Layout rows are interactive in both views; scene and
 * camera rows are interactive only in 3D — in Plan they render read-only
 * (`aria-disabled`, no-op) per S3's locked "Plan selection always activates
 * the layout domain" and the umbrella's "Plan is layout CAD only" / "Plan
 * exposes no camera mutation path". C1 (post-H1 Plan staging) flips the scene
 * branch by extending this predicate.
 */
export function isUnifiedTreeRowInteractive(
	row: UnifiedTreeRow,
	viewMode: 'plan' | '3d'
): boolean {
	if (viewMode === '3d') return true;
	switch (row.kind) {
		case 'room':
		case 'wall':
		case 'opening':
		case 'interiorAnchor':
		case 'object':
			return true;
		default:
			return false;
	}
}

/**
 * The layout room an active layout selection lives in — the ancestor chain the
 * tree must expand to reveal the picked row. Room/wall/opening/anchor
 * selections carry `roomId`; an object selection is the one qualified identity
 * without a room, so it resolves through the layout document (unowned objects
 * resolve to `null` and are not shown in the tree anyway).
 */
export function layoutSelectionAncestorRoomId(
	selection: LayoutSelection,
	layout: LayoutDocument
): string | null {
	switch (selection.kind) {
		case 'room':
		case 'wall':
		case 'opening':
		case 'interiorAnchor':
			return selection.roomId;
		case 'object':
			return (
				layout.objects.find((object) => object.id === selection.objectId)?.roomId ?? null
			);
		case 'none':
			return null;
	}
}

/** Qualified-identity helper for tests (row ↔ LayoutSelection). */
export function layoutRowToSelection(row: UnifiedTreeRow): LayoutSelection | null {
	switch (row.kind) {
		case 'room':
			return { kind: 'room', roomId: row.roomId };
		case 'wall':
			return { kind: 'wall', roomId: row.roomId, segmentId: row.segmentId };
		case 'opening':
			return {
				kind: 'opening',
				roomId: row.roomId,
				segmentId: row.segmentId,
				openingId: row.openingId
			};
		case 'interiorAnchor':
			return {
				kind: 'interiorAnchor',
				roomId: row.roomId,
				segmentId: row.segmentId,
				anchorId: row.anchorId
			};
		case 'object':
			return { kind: 'object', objectId: row.objectId };
		default:
			return null;
	}
}

/** Qualified-identity helpers for tests (scene/camera rows). */
export function sceneRowToWorkspaceSelection(
	row: UnifiedTreeRow,
	roomId: string
): WorkspaceSelection | null {
	switch (row.kind) {
		case 'cluster':
			return { kind: 'cluster', clusterId: row.clusterId, roomId };
		case 'entity':
			return { kind: 'placement', ids: [row.entityId], clusterId: null, roomId };
		default:
			return null;
	}
}

export function cameraRowToNavigationSelection(
	row: UnifiedTreeRow
): NavigationSelection | null {
	switch (row.kind) {
		case 'camera-node':
			return { kind: 'node', nodeId: row.nodeId, handle: 'position' };
		case 'camera-connection':
			return { kind: 'connection', connectionId: row.connectionId, direction: 'forward' };
		case 'camera-direction':
			return {
				kind: 'connection',
				connectionId: row.connectionId,
				direction: row.direction
			};
		case 'camera-keyframe':
			return {
				kind: 'view-keyframe',
				connectionId: row.connectionId,
				direction: row.direction,
				keyframeId: row.keyframeId
			};
		default:
			return null;
	}
}
