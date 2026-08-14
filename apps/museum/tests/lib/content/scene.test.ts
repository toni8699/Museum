import { describe, expect, it } from 'vitest';
import { getRoom, museumRooms, roomLocalPoint, roomPoint } from '$lib/content/rooms';
import {
	assertNavigationGraphMatchesScene,
	createNavigationGraph,
	modelEntityToPlacement,
	resolveSceneDocument as resolveSceneDocumentWithRooms,
	type MuseumSceneDocument,
	type SceneModelEntity
} from '$lib/content/scene';
import { chopinRuntime, museumSceneDocument } from '$lib/content/chopin-project';
import {
	serializeSceneDocument,
	validateSceneDocument
} from '$lib/content/scene-codec';
import {
	cloneFixtureDocument,
	loadFixtureScene
} from './__fixtures__/load-fixture-scene';

const resolveSceneDocument = (input: unknown) =>
	resolveSceneDocumentWithRooms(input, chopinRuntime.rooms);

function fixtureDocument(): MuseumSceneDocument {
	return cloneFixtureDocument('tour-minimal');
}

function versionOneFrom(document: MuseumSceneDocument): unknown {
	const {
		entities,
		textures: _textures,
		materials: _materials,
		...rest
	} = document;
	return {
		...rest,
		version: 1,
		objects: entities
			.filter((entity): entity is SceneModelEntity => entity.kind === 'model')
			.map(({ kind: _kind, name: _name, ...placement }) => placement),
		navigationNodes: document.navigationNodes.map(
			({ fov: _fov, holdSeconds: _hold, ...node }) => node
		),
		connections: document.connections.map(
			({
				positionPath,
				viewTracks: _viewTracks,
				targetWaypoints: _targetWaypoints,
				timing: _timing,
				...connection
			}) => ({
				...connection,
				positionWaypoints: positionPath.anchors.map(({ id: _id, ...waypoint }) => waypoint)
			})
		)
	};
}

function versionThreeFrom(document: MuseumSceneDocument): unknown {
	const {
		entities,
		textures: _textures,
		materials: _materials,
		...rest
	} = document;
	return {
		...rest,
		version: 3,
		objects: entities
			.filter((entity): entity is SceneModelEntity => entity.kind === 'model')
			.map(({ kind: _kind, name: _name, ...placement }) => placement)
	};
}

function assertGuidedCycleInvariant(document: MuseumSceneDocument) {
	const guided = document.navigationNodes.filter(
		(node) => node.nextNodeId !== undefined || node.previousNodeId !== undefined
	);
	if (guided.length === 0) return;

	const nodeById = new Map(document.navigationNodes.map((node) => [node.id, node]));
	const startId = guided[0]!.id;
	const visited = new Set<string>();
	let cursor = nodeById.get(startId);

	while (cursor && !visited.has(cursor.id)) {
		visited.add(cursor.id);
		cursor = cursor.nextNodeId ? nodeById.get(cursor.nextNodeId) : undefined;
	}

	expect(visited.size).toBe(guided.length);
	expect(cursor?.id).toBe(startId);
}

describe('checked-in museum-scene.json smoke', () => {
	it('validates, resolves, and serializes without mutation', () => {
		const before = JSON.stringify(museumSceneDocument);
		const validation = validateSceneDocument(museumSceneDocument);
		expect(validation.success).toBe(true);
		if (!validation.success) return;

		const resolved = resolveSceneDocument(museumSceneDocument);
		expect(resolved.navigationNodes.length).toBeGreaterThan(0);
		expect(resolved.connections.length).toBeGreaterThan(0);
		expect(resolved.entities).toHaveLength(museumSceneDocument.entities.length);

		const json = serializeSceneDocument(museumSceneDocument);
		expect(json).toMatch(/^\{\n  "version": 6,\n/);
		expect(JSON.stringify(museumSceneDocument)).toBe(before);
	});

	it('keeps guided tour links as one reciprocal cycle when guided links exist', () => {
		assertGuidedCycleInvariant(museumSceneDocument);
	});

	it('survives adding a free-only node without breaking smoke invariants', () => {
		const mutated = cloneFixtureDocument('tour-minimal');
		// Prove live-smoke helpers stay topology-agnostic: mutate a clone, not live.
		mutated.navigationNodes.push({
			id: 'free-only-extra',
			roomId: 'legacy',
			label: 'Free only',
			position: [0, 1.65, 0],
			cameraTarget: [0, 1.25, -1],
			fov: 54,
			connectedNodeIds: ['tour-a']
		});
		const tourA = mutated.navigationNodes.find((node) => node.id === 'tour-a')!;
		tourA.connectedNodeIds = [...tourA.connectedNodeIds, 'free-only-extra'];
		mutated.connections.push({
			id: 'tour-a-free',
			fromNodeId: 'tour-a',
			toNodeId: 'free-only-extra',
			clearance: 0.35,
			positionPath: {
				kind: 'rounded-polyline',
				anchors: [
					{ id: 'tour-a-free-01', roomId: 'entrance', position: [1, 1.65, 1] }
				]
			}
		});

		const validation = validateSceneDocument(mutated);
		expect(validation.success).toBe(true);
		if (!validation.success) return;
		expect(() => resolveSceneDocument(validation.document)).not.toThrow();
		assertGuidedCycleInvariant(validation.document);
	});
});

describe('resolveSceneDocument', () => {
	it('rejects unknown placement asset IDs at the scene boundary', () => {
		const base = fixtureDocument();
		const invalid = {
			...base,
			entities: base.entities.map((object, index) =>
				index === 0 ? { ...object, assetId: 'missing-asset' } : object
			)
		};

		expect(() => resolveSceneDocument(invalid)).toThrow(/Unknown museum asset/);
	});

	it('rejects invalid scene-authoritative placement fallbacks', () => {
		const invalid = fixtureDocument();
		(invalid.entities[0] as unknown as { fallback: string }).fallback = 'not-a-fallback';
		expect(() => resolveSceneDocument(invalid)).toThrow(/invalid_fallback/);
	});

	it('resolves the fixture document with room-local objects intact', () => {
		const document = fixtureDocument();
		const resolved = resolveSceneDocument(document);

		expect(resolved.entities).toHaveLength(document.entities.length);
		expect(resolved.objects).toHaveLength(
			document.entities.filter((entity) => entity.kind === 'model').length
		);
		expect(resolved.navigationNodes).toHaveLength(document.navigationNodes.length);
		expect(resolved.connections).toHaveLength(document.connections.length);

		for (const [index, node] of document.navigationNodes.entries()) {
			expect(resolved.navigationNodes[index].position).toEqual(
				roomPoint(node.roomId, node.position)
			);
			expect(resolved.navigationNodes[index].cameraTarget).toEqual(
				roomPoint(node.roomId, node.cameraTarget)
			);
		}

		for (const object of resolved.objects) {
			expect(() => getRoom(object.roomId)).not.toThrow();
			expect(object.position).toEqual(
				document.entities.find((candidate) => candidate.id === object.id)?.position
			);
		}
	});

	it('projects primitive and light entities into runtime without converting them to objects', () => {
		const base = fixtureDocument();
		const withExtras: MuseumSceneDocument = {
			...base,
			entities: [
				...base.entities,
				{
					kind: 'primitive',
					id: 'test-box',
					name: 'Test Box',
					roomId: 'paris',
					position: [1, 0.5, -1],
					rotation: [0, 0.2, 0],
					primitive: 'box',
					dimensions: { width: 1, height: 1, depth: 1 },
					materialId: 'wood-walnut',
					castShadow: true,
					receiveShadow: true
				},
				{
					kind: 'light',
					id: 'test-point',
					name: 'Test Point',
					roomId: 'paris',
					position: [0, 2.4, 0],
					rotation: [0, 0, 0],
					light: 'point',
					color: '#ffffff',
					intensity: 1.2,
					range: 8,
					castShadow: false
				}
			]
		};

		const resolved = resolveSceneDocument(withExtras);
		expect(resolved.entities.some((entity) => entity.id === 'test-box')).toBe(true);
		expect(resolved.entities.some((entity) => entity.id === 'test-point')).toBe(true);
		expect(resolved.objects.some((object) => object.id === 'test-box')).toBe(false);
		expect(resolved.objects.some((object) => object.id === 'test-point')).toBe(false);
		expect(resolved.objects).toHaveLength(
			base.entities.filter((entity) => entity.kind === 'model').length
		);
	});

	it('is deterministic, non-mutating, and independently allocated', () => {
		const document = fixtureDocument();
		document.textures.push({
			id: 'runtime-texture',
			name: 'Runtime Texture',
			uri: '/museum/textures/runtime.webp'
		});
		document.materials.push({
			id: 'runtime-material',
			name: 'Runtime Material',
			baseMaterialId: 'plaster-warm',
			baseTextureId: 'runtime-texture',
			roughness: 0.6
		});
		const renderable = document.entities[0]!;
		if (renderable.kind === 'light') throw new Error('Fixture needs a renderable entity');
		renderable.materialInstanceId = 'runtime-material';
		const serializedBefore = JSON.stringify(document);
		const first = resolveSceneDocument(document);
		const second = resolveSceneDocument(document);

		expect(JSON.stringify(document)).toBe(serializedBefore);
		expect(first).toEqual(second);
		expect(first).not.toBe(second);
		expect(first.textures).toEqual(document.textures);
		expect(first.materials).toEqual(document.materials);
		expect(first.textures).not.toBe(document.textures);
		expect(first.materials).not.toBe(document.materials);
		expect(first.textures[0]).not.toBe(document.textures[0]);
		expect(first.materials[0]).not.toBe(document.materials[0]);
		expect(first.entities[0]).toHaveProperty('materialInstanceId', 'runtime-material');
		expect(first.objects[0]).not.toBe(second.objects[0]);
		expect(first.navigationNodes[0].position).not.toBe(second.navigationNodes[0].position);
		expect(first.connections[0].positionPath).not.toBe(second.connections[0].positionPath);
		expect(first.connections[0].positionPath.anchors).not.toBe(
			second.connections[0].positionPath.anchors
		);
	});

	it('inserts value-equal node endpoints without sharing their arrays', () => {
		const resolved = resolveSceneDocument(fixtureDocument());
		const nodeById = new Map(resolved.navigationNodes.map((node) => [node.id, node]));

		for (const connection of resolved.connections) {
			const fromNode = nodeById.get(connection.fromNodeId);
			const toNode = nodeById.get(connection.toNodeId);
			const first = connection.positionPath.anchors[0];
			const last = connection.positionPath.anchors.at(-1);

			expect(fromNode).toBeDefined();
			expect(toNode).toBeDefined();
			expect(first?.id).toBe(`node:${fromNode?.id}:position`);
			expect(last?.id).toBe(`node:${toNode?.id}:position`);
			expect(first?.position).toEqual(fromNode?.position);
			expect(last?.position).toEqual(toNode?.position);
			expect(first?.position).not.toBe(fromNode?.position);
			expect(last?.position).not.toBe(toNode?.position);
		}
	});

	it('survives a JSON serialization round-trip', () => {
		const document = fixtureDocument();
		const roundTripped = JSON.parse(JSON.stringify(document)) as MuseumSceneDocument;

		expect(roundTripped).toEqual(document);
		expect(resolveSceneDocument(roundTripped)).toEqual(resolveSceneDocument(document));
	});

	it('resolves a valid version 1 document to the migrated runtime (modulo v3-only refinements)', () => {
		const document = fixtureDocument();
		const legacy = versionOneFrom(document);
		const before = JSON.stringify(legacy);

		const expected = resolveSceneDocument(document);
		expect(expected).not.toBe(resolveSceneDocument(document));

		for (const connection of expected.connections) {
			if ('viewTracks' in connection) delete connection.viewTracks;
			if ('targetWaypoints' in connection) delete connection.targetWaypoints;
			connection.positionPath.kind = 'rounded-polyline';
		}
		for (const node of expected.navigationNodes) {
			node.fov = 54;
		}

		expect(resolveSceneDocument(legacy)).toEqual(expected);
		expect(JSON.stringify(legacy)).toBe(before);
	});

	it('resolves mixed-space position and target waypoints with fresh endpoints', () => {
		const document: MuseumSceneDocument = {
			version: 6,
			textures: [],
			materials: [],
			entities: [
				{
					kind: 'model',
					id: 'scaled-object',
					name: 'Scaled Object',
					roomId: 'paris',
					assetId: 'paris-book',
					fallback: 'books',
					position: [1, 2, 3],
					rotation: [0, 0.5, 0],
					scale: 0.75
				}
			],
			navigationNodes: [
				{
					id: 'from',
					roomId: 'entrance',
					label: 'From',
					position: [0, 1.65, 0],
					cameraTarget: [0, 1, -1],
					fov: 54,
					connectedNodeIds: ['to'],
					nextNodeId: 'to',
					previousNodeId: 'to'
				},
				{
					id: 'to',
					roomId: 'poland',
					label: 'To',
					position: [0, 1.65, 0],
					cameraTarget: [0, 1, -1],
					fov: 54,
					connectedNodeIds: ['from'],
					nextNodeId: 'from',
					previousNodeId: 'from'
				}
			],
			connections: [
				{
					id: 'from-to',
					fromNodeId: 'from',
					toNodeId: 'to',
					clearance: 0.4,
					positionPath: {
						kind: 'auto-bezier',
						anchors: [
							{ id: 'from-to-anchor-01', roomId: 'poland', position: [1, 1.65, 0] },
							{ id: 'from-to-anchor-02', position: [8, 1.65, 8] }
						]
					},
					viewTracks: {
						forward: [
							{
								id: 'from-to-view-forward-01',
								progress: 0.3,
								roomId: 'paris',
								cameraTarget: [1, 1.4, 2],
								fov: 48
							}
						],
						reverse: [
							{
								id: 'from-to-view-reverse-01',
								progress: 0.65,
								cameraTarget: [20, 1.2, 20],
								fov: 62
							}
						]
					},
					targetWaypoints: [
						{ roomId: 'entrance', position: [1, 1, -1] },
						{ position: [7, 1, 7] }
					]
				}
			]
		};
		const resolved = resolveSceneDocument(document);
		const [from, to] = resolved.navigationNodes;
		const [connection] = resolved.connections;

		expect(connection.positionPath).toEqual({
			kind: 'auto-bezier',
			anchors: [
				{ id: 'node:from:position', position: from.position },
				{ id: 'from-to-anchor-01', position: roomPoint('poland', [1, 1.65, 0]) },
				{ id: 'from-to-anchor-02', position: [8, 1.65, 8] },
				{ id: 'node:to:position', position: to.position }
			]
		});
		expect(connection.targetWaypoints).toEqual([
			from.cameraTarget,
			roomPoint('entrance', [1, 1, -1]),
			[7, 1, 7],
			to.cameraTarget
		]);
		expect(connection.viewTracks).toEqual({
			forward: [
				{
					id: 'from-to-view-forward-01',
					progress: 0.3,
					cameraTarget: roomPoint('paris', [1, 1.4, 2]),
					fov: 48
				}
			],
			reverse: [
				{
					id: 'from-to-view-reverse-01',
					progress: 0.65,
					cameraTarget: [20, 1.2, 20],
					fov: 62
				}
			]
		});
		expect(connection.positionPath.anchors[0]?.position).not.toBe(from.position);
		expect(connection.targetWaypoints?.[0]).not.toBe(from.cameraTarget);
		expect(connection.viewTracks?.forward[0]?.cameraTarget).not.toBe(
			document.connections[0]!.viewTracks?.forward[0]?.cameraTarget
		);
		expect(connection.viewTracks?.forward[0]).not.toHaveProperty('roomId');
		expect(resolved.objects[0]).toEqual(
			modelEntityToPlacement(document.entities[0] as SceneModelEntity)
		);
	});

	it('rejects unsupported versions, duplicate ids, and unknown endpoints', () => {
		const cloneDocument = () => fixtureDocument();
		const unsupported = cloneDocument();
		(unsupported as unknown as { version: number }).version = 7;
		expect(() => resolveSceneDocument(unsupported)).toThrow(
			'Unsupported museum scene document version: 7'
		);

		const duplicate = cloneDocument();
		duplicate.entities.push({ ...duplicate.entities[0] });
		expect(() => resolveSceneDocument(duplicate)).toThrow(
			`Duplicate scene entity id: ${duplicate.entities[0].id}`
		);

		const unknownEndpoint = cloneDocument();
		unknownEndpoint.connections[0].toNodeId = 'missing-node';
		expect(() => resolveSceneDocument(unknownEndpoint)).toThrow(
			'Unknown navigation node: missing-node'
		);
	});

	it('migrates v3 input without timing fields to canonical v6', () => {
		const document = fixtureDocument();
		const clone = versionThreeFrom(document);
		expect((clone as { version: number }).version).toBe(3);
		const validation = validateSceneDocument(clone);
		expect(validation.success).toBe(true);
		if (validation.success) {
			expect(validation.document.version).toBe(6);
			expect(validation.document.entities).toHaveLength(document.entities.length);
			expect(validation.document.entities[0]).toMatchObject({
				kind: 'model',
				id: document.entities[0]!.id
			});
		}
	});

	it('accepts authored v4 timing and projects it onto runtime scene/instances', () => {
		const document = fixtureDocument();
		const model = document.entities[0] as SceneModelEntity;
		const holdNodeId = document.navigationNodes[1]!.id;
		const v4 = {
			version: 4,
			objects: [modelEntityToPlacement(model)],
			navigationNodes: document.navigationNodes.map((node, index) =>
				index === 1 ? { ...node, holdSeconds: 2.5 } : node
			),
			connections: [
				{
					...document.connections[0]!,
					timing: {
						forward: { durationSeconds: 3.2, easing: 'ease-in-out' }
					},
					viewTracks: {
						forward: [
							{
								id: 'kf-1',
								progress: 0.5,
								cameraTarget: [1, 1.4, -2],
								fov: 48,
								holdSeconds: 1.0,
								easing: 'ease-in'
							}
						],
						reverse: []
					}
				},
				...document.connections.slice(1)
			]
		};
		const resolved = resolveSceneDocument(v4);
		const held = resolved.navigationNodes.find((node) => node.id === holdNodeId)!;
		expect(held.holdSeconds).toBe(2.5);
		const connection = resolved.connections[0]!;
		expect(connection.timing?.forward?.durationSeconds).toBe(3.2);
		expect(connection.timing?.forward?.easing).toBe('smoothstep');
		expect(connection.viewTracks?.forward[0]?.holdSeconds).toBe(1.0);
		expect(connection.viewTracks?.forward[0]?.easing).toBe('ease-in');
	});

	it('rejects v4 documents with malformed timing payloads', () => {
		const document = fixtureDocument();
		const model = document.entities[0] as SceneModelEntity;
		const v4 = {
			version: 4,
			objects: [modelEntityToPlacement(model)],
			navigationNodes: document.navigationNodes,
			connections: [
				{
					...document.connections[0]!,
					timing: {
						forward: { durationSeconds: 0 }
					}
				},
				...document.connections.slice(1)
			]
		};
		expect(() => resolveSceneDocument(v4)).toThrow(/invalid_duration_seconds/);
	});

	it('validates editor clusters while keeping runtime rendering flat', () => {
		const document = fixtureDocument();
		const [first, second] = document.entities;
		document.clusters = [
			{
				id: 'cluster-1',
				name: 'Reading corner',
				roomId: first.roomId,
				memberIds: [first.id, second.id]
			}
		];
		const resolved = resolveSceneDocument(document);
		expect(resolved.objects).toHaveLength(
			document.entities.filter((entity) => entity.kind === 'model').length
		);
		expect(resolved).not.toHaveProperty('clusters');

		const duplicateMember = JSON.parse(JSON.stringify(document)) as MuseumSceneDocument;
		duplicateMember.clusters![0]!.memberIds = [first.id, first.id];
		expect(() => resolveSceneDocument(duplicateMember)).toThrow('Duplicate member');

		const tooSmall = JSON.parse(JSON.stringify(document)) as MuseumSceneDocument;
		tooSmall.clusters![0]!.memberIds = [first.id];
		expect(() => resolveSceneDocument(tooSmall)).toThrow('at least two members');

		const missing = JSON.parse(JSON.stringify(document)) as MuseumSceneDocument;
		missing.clusters![0]!.memberIds = [first.id, 'missing'];
		expect(() => resolveSceneDocument(missing)).toThrow('Unknown member');
	});

	it('requires navigation state and scene data to share one runtime instance', () => {
		const document = fixtureDocument();
		const first = resolveSceneDocument(document);
		const second = resolveSceneDocument(document);
		const graph = createNavigationGraph(first);

		expect(() => assertNavigationGraphMatchesScene(graph, first)).not.toThrow();
		expect(() => assertNavigationGraphMatchesScene(graph, second)).toThrow(
			'Museum navigation state must use the same resolved scene instance'
		);
	});

	it('keeps node adjacency, connection edges, and guided links consistent', () => {
		const { document, scene } = loadFixtureScene();
		const adjacency = new Map<string, Set<string>>(
			scene.navigationNodes.map((node) => [node.id, new Set<string>()])
		);

		for (const connection of scene.connections) {
			adjacency.get(connection.fromNodeId)?.add(connection.toNodeId);
			adjacency.get(connection.toNodeId)?.add(connection.fromNodeId);
		}

		for (const node of scene.navigationNodes) {
			expect(new Set(node.connectedNodeIds)).toEqual(adjacency.get(node.id));
			expect(adjacency.get(node.id)?.has(node.nextNodeId ?? '')).toBe(true);
			expect(adjacency.get(node.id)?.has(node.previousNodeId ?? '')).toBe(true);
		}

		assertGuidedCycleInvariant(document);
	});
});

describe('room coordinate transforms', () => {
	const localSamples = [
		[0, 0, 0],
		[1.25, 2.4, -3.75],
		[-4.1, 1.65, 2.2]
	] as const;
	const worldSamples = [
		[0, 1.65, 0],
		[-12.4, 3.2, 8.75],
		[19.1, -0.2, -17.6]
	] as const;

	for (const room of museumRooms) {
		it(`round-trips local and world points for ${room.id}`, () => {
			for (const local of localSamples) {
				const recovered = roomLocalPoint(room.id, roomPoint(room.id, [...local]));
				local.forEach((value, index) => expect(recovered[index]).toBeCloseTo(value, 12));
			}

			for (const world of worldSamples) {
				const recovered = roomPoint(room.id, roomLocalPoint(room.id, [...world]));
				world.forEach((value, index) => expect(recovered[index]).toBeCloseTo(value, 12));
			}
		});
	}
});
