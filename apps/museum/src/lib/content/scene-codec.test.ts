import { describe, expect, it } from 'vitest';
import {
	museumSceneDocument,
	resolveSceneDocument,
	type MuseumSceneDocument
} from './scene';
import { createCameraPositionPath } from '$lib/museum/navigation/camera-motion';
import {
	parseSceneDocumentJson,
	serializeSceneDocument,
	validateSceneDocument
} from './scene-codec';

function cloneDocument() {
	return JSON.parse(JSON.stringify(museumSceneDocument)) as MuseumSceneDocument;
}

function versionTwoDocument(): unknown {
	const document = cloneDocument();
	return {
		...document,
		version: 2,
		navigationNodes: document.navigationNodes.map(({ fov: _fov, ...node }) => node),
		connections: document.connections.map(({ viewTracks: _viewTracks, ...connection }) => connection)
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

		expect(json).toMatch(/^\{\n  "version": 3,\n  "objects": \[/);
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
		document.objects[0]!.position[0] = -0;
		const json = serializeSceneDocument(document);
		const parsed = JSON.parse(json) as MuseumSceneDocument;

		expect(json).toContain('"clusters": []');
		expect(Object.is(parsed.objects[0]!.position[0], -0)).toBe(false);
		expect(parsed.objects.map((object) => object.id)).toEqual(document.objects.map((object) => object.id));
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
				roomId: document.objects[0]!.roomId,
				memberIds: [document.objects[0]!.id, document.objects[0]!.id]
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

	it('strictly validates version 1 before deterministic migration to canonical version 3', () => {
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
		expect(result.document.version).toBe(3);
		expect(result.document.navigationNodes.every((node) => node.fov === 54)).toBe(true);
		expect(result.document.connections.every((connection) => connection.positionPath.kind === 'rounded-polyline')).toBe(true);
		expect(
			result.document.connections.flatMap((connection) =>
				connection.positionPath.anchors.map((anchor) => anchor.id)
			)
		).toEqual(
			museumSceneDocument.connections.flatMap((connection) =>
				connection.positionPath.anchors.map((anchor) => anchor.id)
			)
		);
		expect(result.canonicalJson).toContain('"version": 3');
		expect(result.canonicalJson).not.toContain('positionWaypoints');
		expect(result.document.connections[0]!.targetWaypoints).toEqual(
			legacy.connections[0]!.targetWaypoints
		);
		expect(serializeSceneDocument(legacy as MuseumSceneDocument)).toBe(result.canonicalJson);

		const repeated = validateSceneDocument(legacy);
		expect(repeated).toEqual(result);
	});

	it('migrates version 2 directly to v3 while preserving dormant target waypoints', () => {
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
		expect(result.document.version).toBe(3);
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
					id: 'entrance-poland-view-forward-01',
					progress: 0.25,
					roomId: 'entrance',
					cameraTarget: [1.2, 1.4, -2.1],
					fov: 42
				},
				{
					id: 'entrance-poland-view-forward-02',
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
		expectIssue(unknownRoom, 'unknown_room');
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

			expectIssue(
				document,
				'camera_target_too_close',
				`$.connections[0].viewTracks.${direction}[0].cameraTarget`
			);
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
		const allFreeOnlyResult = validateSceneDocument(allFreeOnly);
		expect(allFreeOnlyResult.success).toBe(false);
		if (!allFreeOnlyResult.success) {
			expect(allFreeOnlyResult.issues).toContainEqual(
				expect.objectContaining({ code: 'missing_guided_cycle' })
			);
		}
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
});
