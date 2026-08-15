import { describe, expect, it } from 'vitest';
import {
	resolveSceneDocument as resolveSceneDocumentWithRooms,
	type MuseumSceneDocument
} from '$lib/content/scene';
import { chopinRuntime, museumSceneDocument } from '$lib/content/chopin-project';
import { chopinProject } from '$lib/content/chopin-project';
import { validateMuseumProject } from '$lib/project/project-codec';
import { createCameraPositionPath } from '$lib/museum/navigation/camera-motion';
import {
	parseSceneDocumentJson,
	serializeSceneDocument,
	validateSceneDocument
} from '$lib/content/scene-codec';
import { cloneFixtureDocument } from './__fixtures__/load-fixture-scene';

const resolveSceneDocument = (input: unknown) =>
	resolveSceneDocumentWithRooms(input, chopinRuntime.rooms);

function cloneDocument() {
	return cloneFixtureDocument('tour-minimal');
}

function modelPlacementsFromDocument(document: MuseumSceneDocument) {
	return document.entities
		.filter((entity): entity is Extract<typeof entity, { kind: 'model' }> => entity.kind === 'model')
		.map(({ kind: _kind, name: _name, ...placement }) => placement);
}

function versionTwoDocument(): unknown {
	const document = cloneDocument();
	const {
		entities: _entities,
		textures: _textures,
		materials: _materials,
		...rest
	} = document;
	return {
		...rest,
		version: 2,
		objects: modelPlacementsFromDocument(document),
		navigationNodes: document.navigationNodes.map(({ fov: _fov, holdSeconds: _hold, ...node }) => node),
		connections: document.connections.map(
			({ viewTracks: _viewTracks, timing: _timing, ...connection }) => connection
		)
	};
}

function versionOneDocument(): unknown {
	const document = versionTwoDocument() as {
		version: number;
		connections: Array<Record<string, unknown> & {
			positionPath: { anchors: Array<{ id: string }> };
		}>;
	};
	return {
		...document,
		version: 1,
		connections: document.connections.map(({ positionPath, ...connection }) => ({
			...connection,
			positionWaypoints: positionPath.anchors.map(({ id: _id, ...waypoint }) => waypoint)
		}))
	};
}

function versionFiveDocument(): unknown {
	const document = cloneDocument();
	const {
		textures: _textures,
		materials: _materials,
		...rest
	} = document;
	return {
		...rest,
		version: 5,
		entities: document.entities.map((entity) => {
			const { materialInstanceId: _materialInstanceId, ...legacyEntity } =
				entity as typeof entity & { materialInstanceId?: string };
			return legacyEntity;
		})
	};
}

function versionSixDocument(): {
	version: number;
	textures: Array<Record<string, unknown>>;
	materials: Array<Record<string, unknown>>;
	entities: Array<Record<string, unknown>>;
	[key: string]: unknown;
} {
	const document = cloneDocument() as unknown as {
		version: number;
		entities: Array<Record<string, unknown>>;
		[key: string]: unknown;
	};
	return {
		...document,
		version: 6,
		textures: [],
		materials: []
	};
}

function expectIssue(input: unknown, code: string, path?: string) {
	const result = validateSceneDocument(input);
	expect(result.success).toBe(false);
	if (result.success) return;
	expect(result.issues).toContainEqual(
		expect.objectContaining({ code, ...(path === undefined ? {} : { path }) })
	);
}

describe('scene document codec', () => {
	it('serializes the checked-in scene canonically without mutating it', () => {
		const before = JSON.stringify(museumSceneDocument);
		const json = serializeSceneDocument(museumSceneDocument);
		const parsed = parseSceneDocumentJson(json);

		expect(json).toMatch(
			/^\{\n  "version": 6,\n  "textures": \[\],\n  "materials": \[\],\n  "entities": \[/
		);
		expect(json).toContain('\n  "navigationNodes": [');
		expect(json).not.toContain('\n  "clusters":');
		expect(json.endsWith('\n')).toBe(true);
		expect(parsed.success).toBe(true);
		if (parsed.success) expect(parsed.canonicalJson).toBe(json);
		expect(JSON.stringify(museumSceneDocument)).toBe(before);
	});

	it('canonicalizes numeric spelling while preserving array order and optional empty arrays', () => {
		const document = cloneDocument();
		document.clusters = [];
		document.entities[0]!.position[0] = -0;
		const json = serializeSceneDocument(document);
		const parsed = JSON.parse(json) as MuseumSceneDocument;

		expect(json).toContain('"clusters": []');
		expect(Object.is(parsed.entities[0]!.position[0], -0)).toBe(false);
		expect(parsed.entities.map((object) => object.id)).toEqual(document.entities.map((object) => object.id));
	});

	it('reports malformed JSON separately and rejects strict unknown or null fields', () => {
		const malformed = parseSceneDocumentJson('{\n  "version": 1,\n');
		expect(malformed).toEqual({
			success: false,
			issues: [expect.objectContaining({ path: '$', code: 'invalid_json' })]
		});

		const unknown = cloneDocument() as unknown as { navigationNodes: Array<Record<string, unknown>> };
		unknown.navigationNodes[0]!.cameraTaret = [0, 1, 2];
		const unknownResult = validateSceneDocument(unknown);
		expect(unknownResult.success).toBe(false);
		if (!unknownResult.success) expect(unknownResult.issues).toContainEqual(expect.objectContaining({ path: '$.navigationNodes[0].cameraTaret', code: 'unknown_property' }));

		const nullOptional = cloneDocument() as unknown as { navigationNodes: Array<Record<string, unknown>> };
		nullOptional.navigationNodes[0]!.nextNodeId = null;
		const nullResult = validateSceneDocument(nullOptional);
		expect(nullResult.success).toBe(false);
		if (!nullResult.success) expect(nullResult.issues).toContainEqual(expect.objectContaining({ path: '$.navigationNodes[0].nextNodeId', code: 'invalid_type' }));
	});

	it('reports graph, pose, and cluster semantic blockers', () => {
		const document = cloneDocument();
		document.navigationNodes[0]!.connectedNodeIds.push(document.navigationNodes[0]!.connectedNodeIds[0]!);
		document.navigationNodes[1]!.cameraTarget = [...document.navigationNodes[1]!.position];
		document.clusters = [
			{
				id: 'empty-name',
				name: 'Cluster',
				roomId: document.entities[0]!.roomId,
				memberIds: [document.entities[0]!.id, document.entities[0]!.id]
			}
		];
		const result = validateSceneDocument(document);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.issues.map((issue) => issue.code)).toEqual(
				expect.arrayContaining(['duplicate_adjacency', 'camera_target_too_close', 'duplicate_cluster_member'])
			);
		}
	});

	it('rejects split guided cycles even when the navigation graph remains connected', () => {
		const document = cloneDocument();
		const [a, b, c, d] = document.navigationNodes;
		a!.nextNodeId = b!.id;
		a!.previousNodeId = b!.id;
		b!.nextNodeId = a!.id;
		b!.previousNodeId = a!.id;
		c!.nextNodeId = d!.id;
		c!.previousNodeId = d!.id;
		d!.nextNodeId = c!.id;
		d!.previousNodeId = c!.id;
		const result = validateSceneDocument(document);
		expect(result.success).toBe(false);
		if (!result.success) expect(result.issues).toContainEqual(expect.objectContaining({ code: 'invalid_tour_cycle' }));
	});

	it('strictly validates version 1 before deterministic migration to canonical version 6', () => {
		const legacy = versionOneDocument() as {
			connections: Array<Record<string, unknown>>;
		};
		legacy.connections[0]!.targetWaypoints = [
			{ roomId: 'entrance', position: [0.5, 1.4, -1] }
		];
		const before = JSON.stringify(legacy);
		const result = validateSceneDocument(legacy);

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(JSON.stringify(legacy)).toBe(before);
		expect(result.document.version).toBe(6);
		expect(result.document.textures).toEqual([]);
		expect(result.document.materials).toEqual([]);
		expect(result.document.entities.every((entity) => entity.kind === 'model')).toBe(true);
		expect(result.document.navigationNodes.every((node) => node.fov === 54)).toBe(true);
		expect(result.document.connections.every((connection) => connection.positionPath.kind === 'rounded-polyline')).toBe(true);
		const fixtureAnchorIds = cloneDocument().connections.flatMap((connection) =>
			connection.positionPath.anchors.map((anchor) => anchor.id)
		);
		expect(
			result.document.connections.flatMap((connection) =>
				connection.positionPath.anchors.map((anchor) => anchor.id)
			)
		).toEqual(fixtureAnchorIds);
		expect(result.canonicalJson).toContain('"version": 6');
		expect(result.canonicalJson).not.toContain('positionWaypoints');
		expect(result.document.connections[0]!.targetWaypoints).toEqual(
			legacy.connections[0]!.targetWaypoints
		);
		expect(serializeSceneDocument(legacy as MuseumSceneDocument)).toBe(result.canonicalJson);

		const repeated = validateSceneDocument(legacy);
		expect(repeated).toEqual(result);
	});

	it('migrates version 2 directly to v6 while preserving dormant target waypoints', () => {
		const legacy = versionTwoDocument() as {
			connections: Array<Record<string, unknown>>;
		};
		legacy.connections[0]!.targetWaypoints = [
			{ roomId: 'entrance', position: [0.5, 1.4, -1] },
			{ position: [12, 1.3, 8] }
		];
		const before = JSON.stringify(legacy);
		const result = validateSceneDocument(legacy);

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(JSON.stringify(legacy)).toBe(before);
		expect(result.document.version).toBe(6);
		expect(result.document.navigationNodes.every((node) => node.fov === 54)).toBe(true);
		expect(result.document.connections.every((connection) => !connection.viewTracks)).toBe(true);
		expect(result.document.connections[0]!.targetWaypoints).toEqual(
			legacy.connections[0]!.targetWaypoints
		);
		expect(result.document.connections[0]!.targetWaypoints).not.toBe(
			legacy.connections[0]!.targetWaypoints
		);
	});

	it('round-trips canonical directional view tracks with stable field order and fresh values', () => {
		const document = cloneDocument();
		document.navigationNodes[0]!.fov = 48;
		document.connections[0]!.viewTracks = {
			forward: [
				{
					id: 'fixture-view-forward-01',
					progress: 0.25,
					roomId: 'entrance',
					cameraTarget: [1.2, 1.4, -2.1],
					fov: 42
				},
				{
					id: 'fixture-view-forward-02',
					progress: 0.75,
					cameraTarget: [100, 2, 100],
					fov: 60
				}
			],
			reverse: []
		};
		const before = JSON.stringify(document);
		const result = validateSceneDocument(document);

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(JSON.stringify(document)).toBe(before);
		expect(result.document).not.toBe(document);
		expect(result.document.connections[0]!.viewTracks).not.toBe(
			document.connections[0]!.viewTracks
		);
		expect(result.document.connections[0]!.viewTracks?.forward[0]?.cameraTarget).not.toBe(
			document.connections[0]!.viewTracks?.forward[0]?.cameraTarget
		);
		expect(result.canonicalJson).toContain('"viewTracks": {\n        "forward": [');
		expect(result.canonicalJson).toContain('"reverse": []');
		expect(result.canonicalJson.indexOf('"progress"')).toBeLessThan(
			result.canonicalJson.indexOf('"roomId": "entrance"', result.canonicalJson.indexOf('"progress"'))
		);
		const repeated = parseSceneDocumentJson(result.canonicalJson);
		expect(repeated).toEqual(result);
	});

	it('rejects invalid FOV, malformed tracks, IDs, progress, targets, and rooms', () => {
		const nodeFov = cloneDocument();
		nodeFov.navigationNodes[0]!.fov = 9.99;
		expectIssue(nodeFov, 'invalid_fov', '$.navigationNodes[0].fov');

		const malformed = cloneDocument() as unknown as {
			connections: Array<Record<string, unknown>>;
		};
		malformed.connections[0]!.viewTracks = { forward: [] };
		expectIssue(malformed, 'invalid_type', '$.connections[0].viewTracks.reverse');

		const unknownNested = cloneDocument() as unknown as {
			connections: Array<Record<string, unknown>>;
		};
		unknownNested.connections[0]!.viewTracks = {
			forward: [
				{
					id: 'unknown-field',
					progress: 0.2,
					cameraTarget: [100, 2, 100],
					fov: 54,
					rotation: [0, 0, 0]
				}
			],
			reverse: [],
			automatic: true
		};
		expectIssue(unknownNested, 'unknown_property');

		const duplicate = cloneDocument();
		duplicate.connections[0]!.viewTracks = {
			forward: [
				{ id: 'duplicate', progress: 0.2, cameraTarget: [100, 2, 100], fov: 54 }
			],
			reverse: [
				{ id: 'duplicate', progress: 0.3, cameraTarget: [101, 2, 100], fov: 54 }
			]
		};
		expectIssue(duplicate, 'duplicate_view_keyframe_id');

		const unordered = cloneDocument();
		unordered.connections[0]!.viewTracks = {
			forward: [
				{ id: 'later', progress: 0.7, cameraTarget: [100, 2, 100], fov: 54 },
				{ id: 'earlier', progress: 0.4, cameraTarget: [101, 2, 100], fov: 54 }
			],
			reverse: []
		};
		expectIssue(unordered, 'unordered_view_progress');

		const outOfRange = cloneDocument();
		outOfRange.connections[0]!.viewTracks = {
			forward: [
				{ id: 'endpoint', progress: 1, cameraTarget: [100, 2, 100], fov: 54 }
			],
			reverse: []
		};
		expectIssue(outOfRange, 'invalid_view_progress');

		const keyframeFov = cloneDocument();
		keyframeFov.connections[0]!.viewTracks = {
			forward: [
				{ id: 'bad-fov', progress: 0.5, cameraTarget: [100, 2, 100], fov: 121 }
			],
			reverse: []
		};
		expectIssue(keyframeFov, 'invalid_fov');

		const invalidTarget = cloneDocument();
		invalidTarget.connections[0]!.viewTracks = {
			forward: [
				{ id: 'nan-target', progress: 0.5, cameraTarget: [Number.NaN, 2, 100], fov: 54 }
			],
			reverse: []
		};
		expectIssue(invalidTarget, 'non_finite_number');

		const unknownRoom = cloneDocument();
		unknownRoom.connections[0]!.viewTracks = {
			forward: [
				{
					id: 'unknown-room',
					progress: 0.5,
					roomId: 'missing-room' as never,
					cameraTarget: [1, 2, 3],
					fov: 54
				}
			],
			reverse: []
		};
		expect(validateSceneDocument(unknownRoom).success).toBe(true);
		const projectResult = validateMuseumProject({
			formatVersion: 1,
			id: 'project:test',
			name: 'Test',
			layout: chopinProject.layout,
			scene: unknownRoom
		});
		expect(projectResult.success).toBe(false);
		if (!projectResult.success) {
			expect(projectResult.issues).toContainEqual(expect.objectContaining({
				path: '$.scene.connections[0].viewTracks.forward[0].roomId',
				code: 'unknown_room'
			}));
		}
	});

	it('rejects view targets coincident with exact forward and reverse edge positions', () => {
		for (const direction of ['forward', 'reverse'] as const) {
			const document = cloneDocument();
			const connection = document.connections[0]!;
			const runtimeConnection = resolveSceneDocument(document).connections[0]!;
			const runtimeAnchors = runtimeConnection.positionPath.anchors.map(
				(anchor) => anchor.position
			);
			const path = createCameraPositionPath([
				runtimeConnection.positionPath.kind === 'rounded-polyline'
					? {
							kind: 'rounded-polyline',
							points: runtimeAnchors,
							clearance: runtimeConnection.clearance
						}
					: { kind: 'auto-bezier', anchors: runtimeAnchors }
			]);
			const progress = 0.37;
			const eye = path.getPointAt(direction === 'forward' ? progress : 1 - progress);
			connection.viewTracks = {
				forward: [],
				reverse: []
			};
			connection.viewTracks[direction].push({
				id: `coincident-${direction}`,
				progress,
				cameraTarget: [eye.x, eye.y, eye.z],
				fov: 54
			});

			const projectResult = validateMuseumProject({
				formatVersion: 1,
				id: 'project:test',
				name: 'Test',
				layout: chopinProject.layout,
				scene: document
			});
			expect(projectResult.success).toBe(false);
			if (!projectResult.success) {
				expect(projectResult.issues).toContainEqual(expect.objectContaining({
					path: `$.scene.connections[0].viewTracks.${direction}[0].cameraTarget`,
					code: 'camera_target_too_close'
				}));
			}
		}
	});

	it('does not reinterpret fields across scene document versions', () => {
		const legacy = versionOneDocument() as {
			navigationNodes: Array<Record<string, unknown>>;
			connections: Array<Record<string, unknown>>;
		};
		legacy.connections[0]!.positionPath = { kind: 'rounded-polyline', anchors: [] };
		const legacyResult = validateSceneDocument(legacy);
		expect(legacyResult.success).toBe(false);
		if (!legacyResult.success) {
			expect(legacyResult.issues).toContainEqual(
				expect.objectContaining({
					path: '$.connections[0].positionPath',
					code: 'unknown_property'
				})
			);
		}

		const versionTwo = versionTwoDocument() as {
			navigationNodes: Array<Record<string, unknown>>;
			connections: Array<Record<string, unknown>>;
		};
		versionTwo.navigationNodes[0]!.fov = 54;
		versionTwo.connections[0]!.viewTracks = { forward: [], reverse: [] };
		const versionTwoResult = validateSceneDocument(versionTwo);
		expect(versionTwoResult.success).toBe(false);
		if (!versionTwoResult.success) {
			expect(versionTwoResult.issues).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						path: '$.navigationNodes[0].fov',
						code: 'unknown_property'
					}),
					expect.objectContaining({
						path: '$.connections[0].viewTracks',
						code: 'unknown_property'
					})
				])
			);
		}

		const current = cloneDocument() as unknown as {
			connections: Array<Record<string, unknown>>;
		};
		current.connections[0]!.positionWaypoints = [];
		const currentResult = validateSceneDocument(current);
		expect(currentResult.success).toBe(false);
		if (!currentResult.success) {
			expect(currentResult.issues).toContainEqual(
				expect.objectContaining({
					path: '$.connections[0].positionWaypoints',
					code: 'unknown_property'
				})
			);
		}
	});

	it('keeps v1 all-node tour rules and permits connected free-only v2 nodes', () => {
		const legacy = versionOneDocument() as {
			navigationNodes: Array<Record<string, unknown>>;
		};
		delete legacy.navigationNodes[0]!.nextNodeId;
		delete legacy.navigationNodes[0]!.previousNodeId;
		const legacyResult = validateSceneDocument(legacy);
		expect(legacyResult.success).toBe(false);
		if (!legacyResult.success) {
			expect(legacyResult.issues).toContainEqual(
				expect.objectContaining({ code: 'missing_tour_link' })
			);
		}

		const current = cloneDocument();
		const source = current.navigationNodes[0]!;
		current.navigationNodes.push({
			id: 'free-only-node',
			roomId: 'entrance',
			label: 'Free only',
			position: [1, 1.65, 1],
			cameraTarget: [1, 1.25, -1],
			fov: 54,
			connectedNodeIds: [source.id]
		});
		source.connectedNodeIds.push('free-only-node');
		current.connections.push({
			id: 'entrance-free-only',
			fromNodeId: source.id,
			toNodeId: 'free-only-node',
			clearance: 0.35,
			positionPath: { kind: 'auto-bezier', anchors: [] }
		});
		expect(validateSceneDocument(current).success).toBe(true);

		const allFreeOnly = cloneDocument();
		for (const node of allFreeOnly.navigationNodes) {
			delete node.nextNodeId;
			delete node.previousNodeId;
		}
		// H1 S2 — a multi-node graph with no guided cycle is a valid authoring
		// state; runtime tour preview is gated by `canStartTourPreview`.
		expect(validateSceneDocument(allFreeOnly).success).toBe(true);
	});

	it('rejects duplicate, empty, and generated-endpoint anchor IDs', () => {
		const duplicate = cloneDocument();
		const anchors = duplicate.connections[0]!.positionPath.anchors;
		anchors[1]!.id = anchors[0]!.id;
		const duplicateResult = validateSceneDocument(duplicate);
		expect(duplicateResult.success).toBe(false);
		if (!duplicateResult.success) {
			expect(duplicateResult.issues).toContainEqual(
				expect.objectContaining({ code: 'duplicate_anchor_id' })
			);
		}

		const empty = cloneDocument();
		empty.connections[0]!.positionPath.anchors[0]!.id = '';
		const emptyResult = validateSceneDocument(empty);
		expect(emptyResult.success).toBe(false);
		if (!emptyResult.success) {
			expect(emptyResult.issues).toContainEqual(expect.objectContaining({ code: 'empty_string' }));
		}

		const endpoint = cloneDocument();
		const connection = endpoint.connections[0]!;
		connection.positionPath.anchors[0]!.id = `node:${connection.fromNodeId}:position`;
		const endpointResult = validateSceneDocument(endpoint);
		expect(endpointResult.success).toBe(false);
		if (!endpointResult.success) {
			expect(endpointResult.issues).toContainEqual(
				expect.objectContaining({ code: 'endpoint_anchor_id' })
			);
		}

		const otherEndpoint = cloneDocument();
		const otherConnection = otherEndpoint.connections[0]!;
		const unrelatedNode = otherEndpoint.navigationNodes.find(
			(node) =>
				node.id !== otherConnection.fromNodeId &&
				node.id !== otherConnection.toNodeId
		)!;
		otherConnection.positionPath.anchors[0]!.id =
			`node:${unrelatedNode.id}:position`;
		const otherEndpointResult = validateSceneDocument(otherEndpoint);
		expect(otherEndpointResult.success).toBe(false);
		if (!otherEndpointResult.success) {
			expect(otherEndpointResult.issues).toContainEqual(
				expect.objectContaining({ code: 'endpoint_anchor_id' })
			);
		}

		const nonFinite = cloneDocument();
		nonFinite.connections[0]!.positionPath.anchors[0]!.position[2] = Number.NaN;
		const nonFiniteResult = validateSceneDocument(nonFinite);
		expect(nonFiniteResult.success).toBe(false);
		if (!nonFiniteResult.success) {
			expect(nonFiniteResult.issues).toContainEqual(
				expect.objectContaining({ code: 'non_finite_number' })
			);
		}

		const invalidKind = cloneDocument() as unknown as {
			connections: Array<{ positionPath: { kind: string } }>;
		};
		invalidKind.connections[0]!.positionPath.kind = 'spline';
		const kindResult = validateSceneDocument(invalidKind);
		expect(kindResult.success).toBe(false);
		if (!kindResult.success) {
			expect(kindResult.issues).toContainEqual(
				expect.objectContaining({ code: 'invalid_path_kind' })
			);
		}
	});

	it('validates and round-trips primitive and light entities on v6', () => {
		const document = cloneDocument();
		document.entities.push(
			{
				kind: 'primitive',
				id: 'box-01',
				name: 'Box',
				roomId: 'paris',
				primitive: 'box',
				dimensions: { width: 1, height: 0.5, depth: 2 },
				materialId: 'wood-walnut',
				castShadow: true,
				receiveShadow: true,
				position: [0, 0, 0],
				rotation: [0, 0, 0]
			},
			{
				kind: 'light',
				id: 'spot-01',
				name: 'Spot',
				roomId: 'paris',
				light: 'spot',
				color: '#ffcc88',
				intensity: 2,
				range: 8,
				angle: Math.PI / 6,
				penumbra: 0.25,
				castShadow: false,
				position: [0, 3, 0],
				rotation: [-0.5, 0, 0]
			}
		);

		const result = validateSceneDocument(document);
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.document.version).toBe(6);
		expect(result.document.entities.some((entity) => entity.kind === 'primitive')).toBe(true);
		expect(result.document.entities.some((entity) => entity.kind === 'light')).toBe(true);
		expect(serializeSceneDocument(result.document)).toBe(result.canonicalJson);

		const badBox = cloneDocument();
		badBox.entities.push({
			kind: 'primitive',
			id: 'bad-box',
			name: 'Bad',
			roomId: 'paris',
			primitive: 'box',
			dimensions: { width: 0, height: 1, depth: 1 },
			materialId: 'wood-walnut',
			castShadow: true,
			receiveShadow: false,
			position: [0, 0, 0],
			rotation: [0, 0, 0]
		});
		expectIssue(
			badBox,
			'invalid_dimension',
			`$.entities[${badBox.entities.length - 1}].dimensions.width`
		);

		const badLight = cloneDocument();
		badLight.entities.push({
			kind: 'light',
			id: 'bad-dir',
			name: 'Dir',
			roomId: 'paris',
			light: 'directional',
			color: '#ffffff',
			intensity: 1,
			range: 4,
			castShadow: true,
			position: [0, 4, 0],
			rotation: [0, 0, 0]
		} as never);
		expectIssue(
			badLight,
			'unexpected_property',
			`$.entities[${badLight.entities.length - 1}].range`
		);
	});

	it('migrates canonical v5 input to deterministic v6 empty resource arrays', () => {
		const legacy = versionFiveDocument();
		const before = JSON.stringify(legacy);
		const first = validateSceneDocument(legacy);
		const second = validateSceneDocument(legacy);

		expect(first.success).toBe(true);
		if (!first.success) return;
		expect(first.document.version).toBe(6);
		expect(first.document.textures).toEqual([]);
		expect(first.document.materials).toEqual([]);
		expect(first.canonicalJson).toMatch(
			/^\{\n  "version": 6,\n  "textures": \[\],\n  "materials": \[\],\n  "entities": \[/
		);
		expect(second).toEqual(first);
		expect(JSON.stringify(legacy)).toBe(before);
	});

	it('round-trips stable v6 texture and material instance IDs with renderable references', () => {
		const document = versionSixDocument();
		document.textures = [
			{
				id: 'texture-wall-detail',
				name: 'Wall Detail',
				uri: '/museum/textures/wall-detail.webp'
			}
		];
		document.materials = [
			{
				id: 'material-wall-detail',
				name: 'Wall Detail',
				baseMaterialId: 'plaster-warm',
				baseTextureId: 'texture-wall-detail',
				roughness: 0.7,
				metalness: 0.1
			}
		];
		document.entities[0]!.materialInstanceId = 'material-wall-detail';
		document.entities.push({
			kind: 'primitive',
			id: 'textured-box',
			name: 'Textured Box',
			roomId: 'paris',
			primitive: 'box',
			dimensions: { width: 1, height: 1, depth: 1 },
			materialId: 'wood-walnut',
			materialInstanceId: 'material-wall-detail',
			castShadow: true,
			receiveShadow: true,
			position: [0, 0.5, 0],
			rotation: [0, 0, 0]
		});
		const before = JSON.stringify(document);

		const result = validateSceneDocument(document);

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.document.textures).toEqual(document.textures);
		expect(result.document.materials).toEqual(document.materials);
		expect(result.document.textures).not.toBe(document.textures);
		expect(result.document.materials).not.toBe(document.materials);
		expect(result.document.entities[0]).toHaveProperty(
			'materialInstanceId',
			'material-wall-detail'
		);
		expect(result.document.entities.at(-1)).toHaveProperty(
			'materialInstanceId',
			'material-wall-detail'
		);
		expect(parseSceneDocumentJson(result.canonicalJson)).toEqual(result);
		expect(JSON.stringify(document)).toBe(before);
	});

	it.each([
		'blob:https://museum.test/texture',
		'data:image/png;base64,AAAA',
		'https://museum.test/texture.png',
		'file:///tmp/texture.png',
		'//museum.test/texture.png',
		'/../texture.png',
		'/%2e%2e/texture.png',
		'/%252e%252e/texture.png',
		'/%E0%A4%A',
		'/textures\\texture.png',
		'/textures/texture.png?cache=1',
		'/textures/texture.png#preview'
	])('rejects unsafe texture URI %s', (uri) => {
		const document = versionSixDocument();
		document.textures = [{ id: 'unsafe-texture', name: 'Unsafe', uri }];

		expectIssue(document, 'unsafe_texture_uri', '$.textures[0].uri');
	});

	it('rejects duplicate resources and unresolved material references', () => {
		const duplicateTextures = versionSixDocument();
		duplicateTextures.textures = [
			{ id: 'same-texture', name: 'First', uri: '/textures/first.png' },
			{ id: 'same-texture', name: 'Second', uri: '/textures/second.png' }
		];
		expectIssue(duplicateTextures, 'duplicate_id', '$.textures[1].id');

		const duplicateMaterials = versionSixDocument();
		duplicateMaterials.materials = [
			{ id: 'same-material', name: 'First', baseMaterialId: 'plaster-warm' },
			{ id: 'same-material', name: 'Second', baseMaterialId: 'wood-walnut' }
		];
		expectIssue(duplicateMaterials, 'duplicate_id', '$.materials[1].id');

		const unknownTexture = versionSixDocument();
		unknownTexture.materials = [
			{
				id: 'unknown-texture-material',
				name: 'Unknown Texture',
				baseMaterialId: 'plaster-warm',
				baseTextureId: 'missing-texture'
			}
		];
		expectIssue(unknownTexture, 'unknown_texture', '$.materials[0].baseTextureId');

		const unknownMaterial = versionSixDocument();
		unknownMaterial.entities[0]!.materialInstanceId = 'missing-material';
		expectIssue(
			unknownMaterial,
			'unknown_material_instance',
			'$.entities[0].materialInstanceId'
		);
	});

	it('rejects invalid material bases, overrides, and light material references', () => {
		const unknownBase = versionSixDocument();
		unknownBase.materials = [
			{ id: 'bad-base', name: 'Bad Base', baseMaterialId: 'missing-material' }
		];
		expectIssue(unknownBase, 'unknown_material', '$.materials[0].baseMaterialId');

		for (const [key, value] of [
			['roughness', -0.01],
			['roughness', 1.01],
			['metalness', -0.01],
			['metalness', 1.01]
		] as const) {
			const invalidOverride = versionSixDocument();
			invalidOverride.materials = [
				{
					id: `bad-${key}-${value}`,
					name: 'Bad Override',
					baseMaterialId: 'plaster-warm',
					[key]: value
				}
			];
			expectIssue(invalidOverride, `invalid_${key}`, `$.materials[0].${key}`);
		}

		const lightReference = versionSixDocument();
		lightReference.entities.push({
			kind: 'light',
			id: 'material-light',
			name: 'Material Light',
			roomId: 'paris',
			light: 'point',
			color: '#ffffff',
			intensity: 1,
			castShadow: false,
			position: [0, 2, 0],
			rotation: [0, 0, 0],
			materialInstanceId: 'missing-material'
		});
		expectIssue(
			lightReference,
			'unknown_property',
			`$.entities[${lightReference.entities.length - 1}].materialInstanceId`
		);
	});

	it('requires v6 resource arrays and keeps v6-only fields out of v5', () => {
		const missingTextures = versionSixDocument();
		delete (missingTextures as Partial<typeof missingTextures>).textures;
		expectIssue(missingTextures, 'invalid_type', '$.textures');

		const missingMaterials = versionSixDocument();
		delete (missingMaterials as Partial<typeof missingMaterials>).materials;
		expectIssue(missingMaterials, 'invalid_type', '$.materials');

		const legacyRoot = versionFiveDocument() as Record<string, unknown>;
		legacyRoot.textures = [];
		expectIssue(legacyRoot, 'unknown_property', '$.textures');

		const legacyEntity = versionFiveDocument() as {
			entities: Array<Record<string, unknown>>;
		};
		legacyEntity.entities[0]!.materialInstanceId = 'material-wall-detail';
		expectIssue(
			legacyEntity,
			'unknown_property',
			'$.entities[0].materialInstanceId'
		);
	});
});
