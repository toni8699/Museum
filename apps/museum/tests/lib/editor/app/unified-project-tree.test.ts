import { describe, expect, it } from 'vitest';
import type { LayoutDocument } from '$lib/layout/layout-types';
import type { MuseumSceneDocument, SceneEntity } from '$lib/content/scene';
import type { ActiveEditorSelection } from '$lib/editor/app/active-editor-selection.svelte';	import {
		buildUnifiedProjectTreeModel,
		filterUnifiedProjectTreeModel,
		isUnifiedTreeRowInteractive,
		isUnifiedTreeRowSelected,
		layoutRowToSelection,
		layoutSelectionAncestorRoomId,
		type UnifiedProjectTreeModel,
		type UnifiedTreeDiscovery,
		type UnifiedTreeRow
	} from '$lib/editor/unified-project-tree-model';

function makeLayout(): LayoutDocument {
	return {
		units: 'meters',
		floors: [
			{
				id: 'floor-1',
				name: 'Floor 1',
				elevation: 0,
				height: 3,
				rooms: [
					{
						id: 'room-a',
						name: 'Atrium',
						frame: { origin: [0, 0], yaw: 0 },
						boundary: {
							closed: true,
							segments: [
								{ id: 'wall-a', kind: 'line', start: [0, 0], end: [4, 0] },
								{
									id: 'wall-b',
									kind: 'auto-bezier',
									start: [4, 0],
									end: [4, 3],
									interiorAnchors: [{ id: 'anchor-1', point: [4, 1.5] }]
								}
							]
						},
						wallThickness: 0.2,
						floorThickness: 0.1,
						ceilingThickness: 0.1,
						openings: [
							{
								id: 'opening-1',
								segmentId: 'wall-a',
								kind: 'door',
								offset: 1,
								width: 1,
								height: 2.1,
								sillHeight: 0,
								profile: 'rectangular'
							}
						]
					},
					{
						id: 'room-b',
						name: 'Gallery',
						frame: { origin: [6, 0], yaw: 0 },
						boundary: {
							closed: true,
							segments: [{ id: 'wall-c', kind: 'line', start: [6, 0], end: [10, 0] }]
						},
						wallThickness: 0.2,
						floorThickness: 0.1,
						ceilingThickness: 0.1,
						openings: []
					}
				]
			}
		],
		objects: [
			{
				id: 'object-1',
				kind: 'box',
				position: [1, 0, 1],
				rotation: [0, 0, 0],
				dimensions: [1, 1, 1],
				roomId: 'room-a'
			},
			{
				id: 'object-2',
				kind: 'sphere',
				position: [7, 0, 1],
				rotation: [0, 0, 0],
				dimensions: [1, 1, 1],
				roomId: 'room-b'
			},
			// Unowned object: must not nest under any room.
			{
				id: 'object-unowned',
				kind: 'box',
				position: [50, 0, 50],
				rotation: [0, 0, 0],
				dimensions: [1, 1, 1]
			}
		]
	};
}

function makeEntity(
	id: string,
	roomId: string,
	name = id
): SceneEntity {
	return {
		kind: 'primitive',
		primitive: 'box',
		id,
		name,
		roomId,
		position: [0, 0, 0],
		rotation: [0, 0, 0],
		dimensions: { width: 1, height: 1, depth: 1 },
		materialId: 'plaster-warm',
		castShadow: true,
		receiveShadow: true
	};
}

function makeScene(): MuseumSceneDocument {
	return {
		textures: [],
		materials: [],
		entities: [
			makeEntity('entity-a1', 'room-a'),
			makeEntity('entity-a2', 'room-a'),
			makeEntity('entity-b1', 'room-b')
		],
		clusters: [
			{ id: 'cluster-a', name: 'Sculpture', roomId: 'room-a', memberIds: ['entity-a1'] }
		],
		navigationNodes: [
			{
				id: 'node-1',
				roomId: 'room-a',
				label: 'Entrance',
				position: [0, 0, 0],
				cameraTarget: [1, 0, 1],
				fov: 60,
				connectedNodeIds: ['node-2'],
				nextNodeId: 'node-2'
			},
			{
				id: 'node-2',
				roomId: 'room-b',
				label: 'Exit',
				position: [1, 0, 1],
				cameraTarget: [0, 0, 0],
				fov: 60,
				connectedNodeIds: ['node-1'],
				previousNodeId: 'node-1'
			}
		],
		connections: [
			{
				id: 'connection-1',
				fromNodeId: 'node-1',
				toNodeId: 'node-2',
				clearance: 0.4,
				positionPath: { kind: 'rounded-polyline', anchors: [] }
			}
		]
	};
}

function buildModel(guidedTourNodeIds: string[] = ['node-1', 'node-2']): UnifiedProjectTreeModel {
	return buildUnifiedProjectTreeModel({
		layout: makeLayout(),
		scene: makeScene(),
		guidedTourNodeIds
	});
}

const discovery: UnifiedTreeDiscovery = { connectionId: 'connection-1', direction: 'forward' };

function layoutActive(
	selection: Extract<ActiveEditorSelection, { domain: 'layout' }>['selection']
): ActiveEditorSelection {
	return { domain: 'layout', selection } as ActiveEditorSelection;
}

describe('unified tree model', () => {
	it('orders rooms from the layout (floors flatMap) with qualified architecture children', () => {
		const model = buildModel();
		expect(model.rooms.map((room) => room.roomId)).toEqual(['room-a', 'room-b']);

		const atrium = model.rooms[0]!;
		expect(atrium.name).toBe('Atrium');
		expect(atrium.walls).toEqual([
			{ roomId: 'room-a', segmentId: 'wall-a', kind: 'line', anchors: [] },
			{
				roomId: 'room-a',
				segmentId: 'wall-b',
				kind: 'auto-bezier',
				anchors: [{ roomId: 'room-a', segmentId: 'wall-b', anchorId: 'anchor-1' }]
			}
		]);
		expect(atrium.openings).toEqual([
			{ roomId: 'room-a', segmentId: 'wall-a', openingId: 'opening-1', kind: 'door' }
		]);
		expect(atrium.objects).toEqual([{ objectId: 'object-1', kind: 'box' }]);
	});

	it('nests clusters and entities under their explicit roomId and drops unowned content', () => {
		const model = buildModel();
		const atrium = model.rooms[0]!;
		expect(atrium.clusters).toEqual([
			{ clusterId: 'cluster-a', name: 'Sculpture', memberIds: ['entity-a1'] }
		]);
		expect(atrium.entities.map((entity) => entity.entityId)).toEqual(['entity-a1', 'entity-a2']);

		const gallery = model.rooms[1]!;
		expect(gallery.entities.map((entity) => entity.entityId)).toEqual(['entity-b1']);
		expect(gallery.clusters).toEqual([]);

		// Unowned layout object and no dangling entities anywhere.
		const allObjectIds = model.rooms.flatMap((room) => room.objects.map((object) => object.objectId));
		expect(allObjectIds).not.toContain('object-unowned');
		const allEntityIds = model.rooms.flatMap((room) => room.entities.map((entity) => entity.entityId));
		expect(allEntityIds).not.toContain('entity-roomless');
	});

	it('keeps the camera tour root flat: guided chain in order + free nodes', () => {
		const model = buildModel(['node-2', 'node-1']);
		expect(model.cameraTour.guidedNodeIds).toEqual(['node-2', 'node-1']);
		expect(model.cameraTour.freeNodeIds).toEqual([]);

		const partial = buildModel(['node-1']);
		expect(partial.cameraTour.guidedNodeIds).toEqual(['node-1']);
		expect(partial.cameraTour.freeNodeIds).toEqual(['node-2']);
	});

	it('carries the exact LayoutSelection identity for every layout row', () => {
		const model = buildModel();
		const rows: UnifiedTreeRow[] = [
			{ kind: 'room', roomId: 'room-a' },
			{ kind: 'wall', roomId: 'room-a', segmentId: 'wall-b' },
			{ kind: 'opening', roomId: 'room-a', segmentId: 'wall-a', openingId: 'opening-1' },
			{ kind: 'interiorAnchor', roomId: 'room-a', segmentId: 'wall-b', anchorId: 'anchor-1' },
			{ kind: 'object', objectId: 'object-1' }
		];
		expect(rows.map((row) => layoutRowToSelection(row))).toEqual([
			{ kind: 'room', roomId: 'room-a' },
			{ kind: 'wall', roomId: 'room-a', segmentId: 'wall-b' },
			{ kind: 'opening', roomId: 'room-a', segmentId: 'wall-a', openingId: 'opening-1' },
			{ kind: 'interiorAnchor', roomId: 'room-a', segmentId: 'wall-b', anchorId: 'anchor-1' },
			{ kind: 'object', objectId: 'object-1' }
		]);
	});
});

describe('row selection matching', () => {
	it('highlights exactly the selected layout row for every layout kind', () => {
		const room: UnifiedTreeRow = { kind: 'room', roomId: 'room-a' };
		const wall: UnifiedTreeRow = { kind: 'wall', roomId: 'room-a', segmentId: 'wall-b' };
		const opening: UnifiedTreeRow = { kind: 'opening', roomId: 'room-a', segmentId: 'wall-a', openingId: 'opening-1' };
		const anchor: UnifiedTreeRow = { kind: 'interiorAnchor', roomId: 'room-a', segmentId: 'wall-b', anchorId: 'anchor-1' };
		const object: UnifiedTreeRow = { kind: 'object', objectId: 'object-1' };

		expect(isUnifiedTreeRowSelected(layoutActive({ kind: 'room', roomId: 'room-a' }), discovery, room)).toBe(true);
		expect(isUnifiedTreeRowSelected(layoutActive({ kind: 'room', roomId: 'room-a' }), discovery, wall)).toBe(false);
		expect(isUnifiedTreeRowSelected(layoutActive({ kind: 'wall', roomId: 'room-a', segmentId: 'wall-b' }), discovery, wall)).toBe(true);
		expect(isUnifiedTreeRowSelected(layoutActive({ kind: 'wall', roomId: 'room-a', segmentId: 'wall-b' }), discovery, opening)).toBe(false);
		expect(isUnifiedTreeRowSelected(layoutActive({ kind: 'opening', roomId: 'room-a', segmentId: 'wall-a', openingId: 'opening-1' }), discovery, opening)).toBe(true);
		expect(isUnifiedTreeRowSelected(layoutActive({ kind: 'interiorAnchor', roomId: 'room-a', segmentId: 'wall-b', anchorId: 'anchor-1' }), discovery, anchor)).toBe(true);
		expect(isUnifiedTreeRowSelected(layoutActive({ kind: 'object', objectId: 'object-1' }), discovery, object)).toBe(true);
		expect(isUnifiedTreeRowSelected(layoutActive({ kind: 'object', objectId: 'object-1' }), discovery, room)).toBe(false);
	});

	it('highlights a demoted selection (opening → wall) on the wall row', () => {
		const wall: UnifiedTreeRow = { kind: 'wall', roomId: 'room-a', segmentId: 'wall-a' };
		expect(
			isUnifiedTreeRowSelected(layoutActive({ kind: 'wall', roomId: 'room-a', segmentId: 'wall-a' }), discovery, wall)
		).toBe(true);
	});

	it('highlights scene rows from the workspace slot; room-only context stays out of the pure matcher', () => {
		const entity: UnifiedTreeRow = { kind: 'entity', entityId: 'entity-a2' };
		const cluster: UnifiedTreeRow = { kind: 'cluster', clusterId: 'cluster-a' };
		const room: UnifiedTreeRow = { kind: 'room', roomId: 'room-a' };

		const placement: ActiveEditorSelection = {
			domain: 'scene',
			selection: { kind: 'placement', ids: ['entity-a2'], clusterId: null, roomId: 'room-a' }
		};
		expect(isUnifiedTreeRowSelected(placement, discovery, entity)).toBe(true);
		expect(isUnifiedTreeRowSelected(placement, discovery, cluster)).toBe(false);
		// Multi-select: all selected ids highlight.
		const multi: ActiveEditorSelection = {
			domain: 'scene',
			selection: { kind: 'placement', ids: ['entity-a1', 'entity-a2'], clusterId: null, roomId: 'room-a' }
		};
		expect(isUnifiedTreeRowSelected(multi, discovery, { kind: 'entity', entityId: 'entity-a1' })).toBe(true);
		expect(isUnifiedTreeRowSelected(multi, discovery, { kind: 'entity', entityId: 'entity-a2' })).toBe(true);

		const clusterActive: ActiveEditorSelection = {
			domain: 'scene',
			selection: { kind: 'cluster', clusterId: 'cluster-a', roomId: 'room-a' }
		};
		expect(isUnifiedTreeRowSelected(clusterActive, discovery, cluster)).toBe(true);
		expect(isUnifiedTreeRowSelected(clusterActive, discovery, entity)).toBe(false);

		// Room-only latent context derives to domain 'none' (S3: context, never
		// actionable), so the pure matcher alone cannot see it — the component
		// adds the latent room-row highlight via `store.selectedRoomId` (the
		// same read the relic scene tree uses). The matcher stays `active`-only.
		const roomOnly: ActiveEditorSelection = { domain: 'none' };
		expect(isUnifiedTreeRowSelected(roomOnly, discovery, room)).toBe(false);
		expect(isUnifiedTreeRowSelected(roomOnly, discovery, entity)).toBe(false);
	});

	it('highlights camera rows from navigation; connection header covers anchor + keyframe children', () => {
		const node: UnifiedTreeRow = { kind: 'camera-node', nodeId: 'node-1' };
		const connection: UnifiedTreeRow = { kind: 'camera-connection', connectionId: 'connection-1' };
		const direction: UnifiedTreeRow = { kind: 'camera-direction', connectionId: 'connection-1', direction: 'forward' };
		const keyframe: UnifiedTreeRow = { kind: 'camera-keyframe', connectionId: 'connection-1', direction: 'forward', keyframeId: 'key-1' };

		const nodeActive: ActiveEditorSelection = {
			domain: 'camera',
			selection: { kind: 'node', nodeId: 'node-1', handle: 'position' }
		};
		expect(isUnifiedTreeRowSelected(nodeActive, discovery, node)).toBe(true);
		expect(isUnifiedTreeRowSelected(nodeActive, discovery, connection)).toBe(false);

		const connectionActive: ActiveEditorSelection = {
			domain: 'camera',
			selection: { kind: 'connection', connectionId: 'connection-1', direction: 'forward' }
		};
		expect(isUnifiedTreeRowSelected(connectionActive, discovery, connection)).toBe(true);
		expect(isUnifiedTreeRowSelected(connectionActive, discovery, direction)).toBe(true);
		expect(isUnifiedTreeRowSelected(connectionActive, discovery, keyframe)).toBe(false);

		const keyframeActive: ActiveEditorSelection = {
			domain: 'camera',
			selection: { kind: 'view-keyframe', connectionId: 'connection-1', direction: 'forward', keyframeId: 'key-1' }
		};
		expect(isUnifiedTreeRowSelected(keyframeActive, discovery, keyframe)).toBe(true);
		expect(isUnifiedTreeRowSelected(keyframeActive, discovery, connection)).toBe(true);
	});

	it('highlights direction rows from discovery with no navigation selection (scrubbing), gated to camera-or-none', () => {
		const direction: UnifiedTreeRow = { kind: 'camera-direction', connectionId: 'connection-1', direction: 'forward' };

		// No selection at all, discovery set → scrub highlight preserved.
		expect(isUnifiedTreeRowSelected({ domain: 'none' }, discovery, direction)).toBe(true);
		expect(isUnifiedTreeRowSelected({ domain: 'none' }, { connectionId: null, direction: 'forward' }, direction)).toBe(false);

		// A layout selection never co-highlights a camera row.
		expect(
			isUnifiedTreeRowSelected(layoutActive({ kind: 'room', roomId: 'room-a' }), discovery, direction)
		).toBe(false);
		// A scene selection never co-highlights a camera row.
		const scene: ActiveEditorSelection = {
			domain: 'scene',
			selection: { kind: 'placement', ids: ['entity-a1'], clusterId: null, roomId: 'room-a' }
		};
		expect(isUnifiedTreeRowSelected(scene, discovery, direction)).toBe(false);
	});

	it('highlights an anchor direction row only when selection and discovery agree on the connection', () => {
		const direction: UnifiedTreeRow = { kind: 'camera-direction', connectionId: 'connection-1', direction: 'forward' };
		const anchorActive: ActiveEditorSelection = {
			domain: 'camera',
			selection: { kind: 'anchor', connectionId: 'connection-1', anchorId: 'anchor-1' }
		};

		// Selection and discovery both on connection-1 forward → highlight.
		expect(isUnifiedTreeRowSelected(anchorActive, discovery, direction)).toBe(true);
		// Discovery direction differs on the same connection → no highlight.
		expect(
			isUnifiedTreeRowSelected(
				anchorActive,
				{ connectionId: 'connection-1', direction: 'reverse' },
				direction
			)
		).toBe(false);
		// Discovery moved to another connection while the anchor selection
		// persists → no highlight (direction rows are discovery-owned, so the
		// discovery connection must match the row too).
		expect(
			isUnifiedTreeRowSelected(
				anchorActive,
				{ connectionId: 'connection-2', direction: 'forward' },
				direction
			)
		).toBe(false);
		// No discovery at all → no highlight.
		expect(isUnifiedTreeRowSelected(anchorActive, null, direction)).toBe(false);
	});

	it('never highlights across domains: layout active hides scene rows and vice versa', () => {
		const entity: UnifiedTreeRow = { kind: 'entity', entityId: 'entity-a1' };
		const layout: ActiveEditorSelection = { domain: 'layout', selection: { kind: 'room', roomId: 'room-a' } };
		expect(isUnifiedTreeRowSelected(layout, discovery, entity)).toBe(false);
		expect(isUnifiedTreeRowSelected(layout, discovery, { kind: 'cluster', clusterId: 'cluster-a' })).toBe(false);
		expect(isUnifiedTreeRowSelected(layout, discovery, { kind: 'camera-node', nodeId: 'node-1' })).toBe(false);

		const scene: ActiveEditorSelection = {
			domain: 'scene',
			selection: { kind: 'placement', ids: ['entity-a1'], clusterId: null, roomId: 'room-a' }
		};
		expect(isUnifiedTreeRowSelected(scene, discovery, { kind: 'wall', roomId: 'room-a', segmentId: 'wall-a' })).toBe(false);
	});
});

describe('domain×view-aware interactivity (P1.1, G1)', () => {
	it('keeps layout rows interactive in both Scene views and read-only in the Camera domain', () => {
		const room: UnifiedTreeRow = { kind: 'room', roomId: 'room-a' };
		const wall: UnifiedTreeRow = { kind: 'wall', roomId: 'room-a', segmentId: 'wall-a' };
		const opening: UnifiedTreeRow = { kind: 'opening', roomId: 'room-a', segmentId: 'wall-a', openingId: 'opening-1' };
		const anchor: UnifiedTreeRow = { kind: 'interiorAnchor', roomId: 'room-a', segmentId: 'wall-b', anchorId: 'anchor-1' };
		const object: UnifiedTreeRow = { kind: 'object', objectId: 'object-1' };
		for (const row of [room, wall, opening, anchor, object]) {
			expect(isUnifiedTreeRowInteractive(row, 'scene', 'plan')).toBe(true);
			expect(isUnifiedTreeRowInteractive(row, 'scene', '3d')).toBe(true);
			// Camera domain: the scene plan is read-only spatial context (§C §4.6).
			expect(isUnifiedTreeRowInteractive(row, 'camera', 'plan')).toBe(false);
			expect(isUnifiedTreeRowInteractive(row, 'camera', '3d')).toBe(false);
		}
	});

	it('gates scene rows to Scene → 3D only', () => {
		const entity: UnifiedTreeRow = { kind: 'entity', entityId: 'entity-a1' };
		const cluster: UnifiedTreeRow = { kind: 'cluster', clusterId: 'cluster-a' };
		for (const row of [entity, cluster]) {
			expect(isUnifiedTreeRowInteractive(row, 'scene', '3d')).toBe(true);
			expect(isUnifiedTreeRowInteractive(row, 'scene', 'plan')).toBe(false);
			expect(isUnifiedTreeRowInteractive(row, 'camera', '3d')).toBe(false);
		}
	});

	it('gates camera rows to the Camera domain, both views', () => {
		const node: UnifiedTreeRow = { kind: 'camera-node', nodeId: 'node-1' };
		const connection: UnifiedTreeRow = { kind: 'camera-connection', connectionId: 'conn-a' };
		const direction: UnifiedTreeRow = { kind: 'camera-direction', connectionId: 'conn-a', direction: 'forward' };
		const keyframe: UnifiedTreeRow = { kind: 'camera-keyframe', connectionId: 'conn-a', direction: 'forward', keyframeId: 'kf-1' };
		for (const row of [node, connection, direction, keyframe]) {
			expect(isUnifiedTreeRowInteractive(row, 'camera', 'plan')).toBe(true);
			expect(isUnifiedTreeRowInteractive(row, 'camera', '3d')).toBe(true);
			expect(isUnifiedTreeRowInteractive(row, 'scene', '3d')).toBe(false);
		}
	});
});

describe('pick-expand ancestor resolution', () => {
	const layout = makeLayout();

	it('returns the carrying roomId for room/wall/opening/anchor selections', () => {
		expect(layoutSelectionAncestorRoomId({ kind: 'room', roomId: 'room-a' }, layout)).toBe('room-a');
		expect(
			layoutSelectionAncestorRoomId({ kind: 'wall', roomId: 'room-a', segmentId: 'wall-a' }, layout)
		).toBe('room-a');
		expect(
			layoutSelectionAncestorRoomId(
				{ kind: 'opening', roomId: 'room-a', segmentId: 'wall-a', openingId: 'opening-1' },
				layout
			)
		).toBe('room-a');
		expect(
			layoutSelectionAncestorRoomId(
				{ kind: 'interiorAnchor', roomId: 'room-a', segmentId: 'wall-b', anchorId: 'anchor-1' },
				layout
			)
		).toBe('room-a');
	});

	it('resolves an object selection through the layout document', () => {
		expect(layoutSelectionAncestorRoomId({ kind: 'object', objectId: 'object-1' }, layout)).toBe('room-a');
		expect(layoutSelectionAncestorRoomId({ kind: 'object', objectId: 'object-2' }, layout)).toBe('room-b');
	});

	it('returns null for none / missing / unowned object selections', () => {
		expect(layoutSelectionAncestorRoomId({ kind: 'none' }, layout)).toBeNull();
		expect(
			layoutSelectionAncestorRoomId({ kind: 'object', objectId: 'object-missing' }, layout)
		).toBeNull();
		expect(
			layoutSelectionAncestorRoomId({ kind: 'object', objectId: 'object-unowned' }, layout)
		).toBeNull();
	});
});

describe('hierarchy filter', () => {
	it('returns the model untouched for an empty or whitespace query', () => {
		const model = buildModel();
		expect(filterUnifiedProjectTreeModel(model, '')).toBe(model);
		expect(filterUnifiedProjectTreeModel(model, '   ')).toBe(model);
	});

	it('narrows rooms by name and prunes non-matching rooms', () => {
		const filtered = filterUnifiedProjectTreeModel(buildModel(), 'Atrium');
		expect(filtered.rooms.map((room) => room.roomId)).toEqual(['room-a']);
	});

	it('keeps the ancestor room when only a descendant matches', () => {
		const filtered = filterUnifiedProjectTreeModel(buildModel(), 'wall-b');
		expect(filtered.rooms.map((room) => room.roomId)).toEqual(['room-a']);
		expect(filtered.rooms[0]!.walls.map((wall) => wall.segmentId)).toEqual(['wall-b']);
	});

	it('matches a wall through its bend anchor and keeps the wall', () => {
		const filtered = filterUnifiedProjectTreeModel(buildModel(), 'anchor-1');
		expect(filtered.rooms[0]!.walls.map((wall) => wall.segmentId)).toEqual(['wall-b']);
	});

	it('matches openings and objects by kind or id', () => {
		const byKind = filterUnifiedProjectTreeModel(buildModel(), 'door');
		expect(byKind.rooms[0]!.openings.map((opening) => opening.openingId)).toEqual(['opening-1']);

		const byObjectId = filterUnifiedProjectTreeModel(buildModel(), 'object-2');
		expect(byObjectId.rooms.map((room) => room.roomId)).toEqual(['room-b']);
		expect(byObjectId.rooms[0]!.objects.map((object) => object.objectId)).toEqual(['object-2']);
	});

	it('matches cluster members by entity name and prunes non-matching members', () => {
		const filtered = filterUnifiedProjectTreeModel(buildModel(), 'entity-a1');
		const room = filtered.rooms[0]!;
		expect(room.clusters).toEqual([
			{ clusterId: 'cluster-a', name: 'Sculpture', memberIds: ['entity-a1'] }
		]);
		expect(room.entities.map((entity) => entity.entityId)).toContain('entity-a1');
	});

	it('matches standalone entities by name or id', () => {
		const filtered = filterUnifiedProjectTreeModel(buildModel(), 'entity-b1');
		expect(filtered.rooms.map((room) => room.roomId)).toEqual(['room-b']);
		expect(filtered.rooms[0]!.entities.map((entity) => entity.entityId)).toEqual(['entity-b1']);
	});

	it('is case-insensitive and carries the camera tour through unchanged', () => {
		const model = buildModel();
		const filtered = filterUnifiedProjectTreeModel(model, 'ATRIUM');
		expect(filtered.rooms.map((room) => room.roomId)).toEqual(['room-a']);
		expect(filtered.cameraTour).toBe(model.cameraTour);
	});

	it('yields an empty room list when nothing matches', () => {
		const filtered = filterUnifiedProjectTreeModel(buildModel(), 'zzz-no-match');
		expect(filtered.rooms).toEqual([]);
	});
});
