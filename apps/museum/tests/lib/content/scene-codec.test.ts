import { describe, expect, it } from 'vitest';
import {
	resolveSceneDocument as resolveSceneDocumentWithRooms,
	type SceneDocument
} from '$lib/content/scene';
import { chopinRuntime, sceneDocument } from '$lib/content/chopin-project';
import { chopinProject } from '$lib/content/chopin-project';
import { validateProject } from '$lib/project/project-codec';
import { createCameraPositionPath } from '@portfolio/camera-core';
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
		const before = JSON.stringify(sceneDocument);
		const json = serializeSceneDocument(sceneDocument);
		const parsed = parseSceneDocumentJson(json);

		expect(json).toMatch(
			/^\{\n  "textures": \[\],\n  "materials": \[\],\n  "entities": \[/
		);
		expect(json).toContain('\n  "navigationNodes": [');
		expect(json).not.toContain('\n  "clusters":');
		expect(json.endsWith('\n')).toBe(true);
		expect(parsed.success).toBe(true);
		if (parsed.success) expect(parsed.canonicalJson).toBe(json);
		expect(JSON.stringify(sceneDocument)).toBe(before);
	});

	it('canonicalizes numeric spelling while preserving array order and optional empty arrays', () => {
		const document = cloneDocument();
		document.clusters = [];
		document.entities[0]!.position[0] = -0;
		const json = serializeSceneDocument(document);
		const parsed = JSON.parse(json) as SceneDocument;

		expect(json).toContain('"clusters": []');
		expect(Object.is(parsed.entities[0]!.position[0], -0)).toBe(false);
		expect(parsed.entities.map((object) => object.id)).toEqual(document.entities.map((object) => object.id));
	});

	it('reports malformed JSON separately and rejects strict unknown or null fields', () => {
		const malformed = parseSceneDocumentJson('{\n  "textures": [],\n');
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

	it('S10.2 — accepts an open chain with single-link head and tail, plus one open detour chain', () => {
		const document = cloneDocument();
		const [a, b, c, d] = document.navigationNodes;
		// Main route: a → b → c (open tail at c, head at a).
		a!.nextNodeId = b!.id;
		delete a!.previousNodeId;
		b!.nextNodeId = c!.id;
		b!.previousNodeId = a!.id;
		c!.previousNodeId = b!.id;
		delete c!.nextNodeId;
		// Detour: d heads off b and returns via an ordinary edge.
		d!.detourOfNodeId = b!.id;
		delete d!.nextNodeId;
		delete d!.previousNodeId;

		const result = validateSceneDocument(document);
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.document.navigationNodes[3]).toHaveProperty('detourOfNodeId', b!.id);
		expect(result.canonicalJson).toContain('"detourOfNodeId": "tour-b"');
	});

	it('B0 — accepts isolated standalone free nodes, but still rejects split graphs', () => {
		// A valid connected graph plus two isolated free nodes is a valid
		// authoring state (standalone placement before connecting).
		const withIsolated = cloneDocument();
		withIsolated.navigationNodes.push(
			{
				id: 'camera-node-1',
				roomId: 'entrance',
				label: 'Camera Node 1',
				position: [2, 1.65, 2],
				cameraTarget: [2, 1.25, -1],
				fov: 54,
				connectedNodeIds: []
			},
			{
				id: 'camera-node-2',
				roomId: 'entrance',
				label: 'Camera Node 2',
				position: [3, 1.65, 2],
				cameraTarget: [3, 1.25, -1],
				fov: 54,
				connectedNodeIds: []
			}
		);
		expect(validateSceneDocument(withIsolated).success).toBe(true);

		// Two disjoint connected components are still rejected: the relaxed
		// check only exempts edge-less standalone nodes.
		const split = cloneDocument();
		const [a, b, c, d] = split.navigationNodes;
		a!.connectedNodeIds = [b!.id];
		b!.connectedNodeIds = [a!.id];
		c!.connectedNodeIds = [d!.id];
		d!.connectedNodeIds = [c!.id];
		for (const node of split.navigationNodes) {
			delete node.nextNodeId;
			delete node.previousNodeId;
		}
		split.connections = [
			{
				id: 'tour-a-b',
				fromNodeId: a!.id,
				toNodeId: b!.id,
				clearance: 0.35,
				positionPath: { kind: 'auto-bezier', anchors: [] }
			},
			{
				id: 'tour-c-d',
				fromNodeId: c!.id,
				toNodeId: d!.id,
				clearance: 0.35,
				positionPath: { kind: 'auto-bezier', anchors: [] }
			}
		];
		expectIssue(split, 'disconnected_graph', '$.connections');
	});

	it('S10.2 — accepts a one-node detour chain (origin–head edge serves as the return)', () => {
		const document = cloneDocument();
		const [a] = document.navigationNodes;
		for (const node of document.navigationNodes) {
			delete node.nextNodeId;
			delete node.previousNodeId;
		}
		const origin = document.navigationNodes[0]!;
		origin.connectedNodeIds.push('detour-d1', 'detour-d1-tail');
		document.navigationNodes.push({
			id: 'detour-d1',
			roomId: 'entrance',
			label: 'Detour D1',
			position: [2, 1.65, 2],
			cameraTarget: [2, 1.25, -1],
			fov: 54,
			connectedNodeIds: [origin.id, 'detour-d1-tail'],
			nextNodeId: 'detour-d1-tail',
			detourOfNodeId: origin.id
		});
		document.navigationNodes.push({
			id: 'detour-d1-tail',
			roomId: 'entrance',
			label: 'Detour tail',
			position: [3, 1.65, 2],
			cameraTarget: [3, 1.25, -1],
			fov: 54,
			connectedNodeIds: [origin.id, 'detour-d1'],
			previousNodeId: 'detour-d1'
		});
		document.connections.push(
			{
				id: 'origin-d1',
				fromNodeId: origin.id,
				toNodeId: 'detour-d1',
				clearance: 0.35,
				positionPath: { kind: 'auto-bezier', anchors: [] }
			},
			{
				id: 'd1-tail',
				fromNodeId: 'detour-d1',
				toNodeId: 'detour-d1-tail',
				clearance: 0.35,
				positionPath: { kind: 'auto-bezier', anchors: [] }
			},
			{
				id: 'tail-origin',
				fromNodeId: 'detour-d1-tail',
				toNodeId: origin.id,
				clearance: 0.35,
				positionPath: { kind: 'auto-bezier', anchors: [] }
			}
		);
		expect(validateSceneDocument(document).success).toBe(true);
	});

	it('S10.2 — rejects a detour marker on a non-head and an unknown detour origin', () => {
		const badHead = cloneDocument();
		badHead.navigationNodes[1]!.detourOfNodeId = 'tour-a';
		expectIssue(badHead, 'detour_not_head', '$.navigationNodes[1].detourOfNodeId');

		const unknownOrigin = cloneDocument();
		const [a] = unknownOrigin.navigationNodes;
		// Keep tour-a as a chain head (next only) so the origin check runs.
		delete a!.previousNodeId;
		a!.detourOfNodeId = 'missing-origin';
		expectIssue(unknownOrigin, 'unknown_node', '$.navigationNodes[0].detourOfNodeId');
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

	it('round-trips directional framing envelopes in canonical order without aliases', () => {
		const document = cloneDocument();
		document.connections[0]!.viewTracks = {
			forward: [],
			reverse: [],
			framingEnvelope: {
				forward: { enterStart: 0.1, enterEnd: 0.25, exitStart: 0.8, exitEnd: 1 },
				reverse: { enterStart: 0, enterEnd: 0, exitStart: 1, exitEnd: 1 }
			}
		};
		const before = JSON.stringify(document);
		const result = validateSceneDocument(document);

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(JSON.stringify(document)).toBe(before);
		expect(result.document.connections[0]!.viewTracks?.framingEnvelope).toEqual(
			document.connections[0]!.viewTracks.framingEnvelope
		);
		expect(result.document.connections[0]!.viewTracks?.framingEnvelope).not.toBe(
			document.connections[0]!.viewTracks.framingEnvelope
		);
		expect(result.document.connections[0]!.viewTracks?.framingEnvelope?.forward).not.toBe(
			document.connections[0]!.viewTracks.framingEnvelope?.forward
		);
		expect(result.canonicalJson).toContain(
			'"framingEnvelope": {\n          "forward": {\n            "enterStart": 0.1,\n            "enterEnd": 0.25,\n            "exitStart": 0.8,\n            "exitEnd": 1'
		);
		expect(parseSceneDocumentJson(result.canonicalJson)).toEqual(result);
	});

	it('round-trips a forward-only framing envelope without synthesizing reverse data', () => {
		const document = cloneDocument();
		document.connections[0]!.viewTracks = {
			forward: [],
			reverse: [],
			framingEnvelope: {
				forward: { enterStart: 0.1, enterEnd: 0.25, exitStart: 0.8, exitEnd: 1 }
			}
		};
		const result = validateSceneDocument(document);
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.document.connections[0]!.viewTracks?.framingEnvelope).toEqual({
			forward: { enterStart: 0.1, enterEnd: 0.25, exitStart: 0.8, exitEnd: 1 }
		});
		expect(result.document.connections[0]!.viewTracks?.framingEnvelope).not.toHaveProperty(
			'reverse'
		);
		expect(parseSceneDocumentJson(result.canonicalJson)).toEqual(result);
	});

	it('keeps legacy no-envelope serialization byte-stable across repeated codec passes', () => {
		const first = serializeSceneDocument(cloneDocument());
		const parsed = parseSceneDocumentJson(first);
		expect(parsed.success).toBe(true);
		if (!parsed.success) return;
		expect(parsed.document.connections[0]!.viewTracks).toBeUndefined();
		expect(parsed.canonicalJson).toBe(first);
		expect(serializeSceneDocument(parsed.document)).toBe(first);
	});

	it('accepts equal framing-envelope bounds and rejects malformed envelopes at exact paths', () => {
		const equal = cloneDocument();
		equal.connections[0]!.viewTracks = {
			forward: [],
			reverse: [],
			framingEnvelope: {
				forward: { enterStart: 0.5, enterEnd: 0.5, exitStart: 0.5, exitEnd: 0.5 }
			}
		};
		expect(validateSceneDocument(equal).success).toBe(true);

		const baseEnvelope = () => {
			const value = cloneDocument() as unknown as { connections: Array<Record<string, any>> };
			value.connections[0]!.viewTracks = {
				forward: [],
				reverse: [],
				framingEnvelope: {
					forward: { enterStart: 0.1, enterEnd: 0.2, exitStart: 0.8, exitEnd: 1 }
				}
			};
			return value;
		};
		const missing = baseEnvelope();
		delete missing.connections[0]!.viewTracks.framingEnvelope.forward.enterEnd;
		expectIssue(missing, 'invalid_type', '$.connections[0].viewTracks.framingEnvelope.forward.enterEnd');
		const nonFinite = baseEnvelope();
		nonFinite.connections[0]!.viewTracks.framingEnvelope.forward.exitStart = Number.NaN;
		expectIssue(nonFinite, 'non_finite_number', '$.connections[0].viewTracks.framingEnvelope.forward.exitStart');
		const outOfRange = baseEnvelope();
		outOfRange.connections[0]!.viewTracks.framingEnvelope.forward.enterStart = -0.1;
		expectIssue(outOfRange, 'invalid_framing_envelope', '$.connections[0].viewTracks.framingEnvelope.forward.enterStart');
		const unordered = baseEnvelope();
		unordered.connections[0]!.viewTracks.framingEnvelope.forward.enterEnd = 0.05;
		expectIssue(unordered, 'invalid_framing_envelope', '$.connections[0].viewTracks.framingEnvelope.forward.enterEnd');
		const unknown = baseEnvelope();
		unknown.connections[0]!.viewTracks.framingEnvelope.forward.extra = 0.4;
		expectIssue(unknown, 'unknown_property', '$.connections[0].viewTracks.framingEnvelope.forward.extra');
		const invalidContainer = baseEnvelope();
		invalidContainer.connections[0]!.viewTracks.framingEnvelope = [];
		expectIssue(invalidContainer, 'invalid_type', '$.connections[0].viewTracks.framingEnvelope');
		const invalidEnvelope = baseEnvelope();
		invalidEnvelope.connections[0]!.viewTracks.framingEnvelope.forward = [];
		expectIssue(invalidEnvelope, 'invalid_type', '$.connections[0].viewTracks.framingEnvelope.forward');
		const invalidDirection = baseEnvelope();
		invalidDirection.connections[0]!.viewTracks.framingEnvelope.sideways = {
			enterStart: 0, enterEnd: 0, exitStart: 1, exitEnd: 1
		};
		expectIssue(invalidDirection, 'unknown_property', '$.connections[0].viewTracks.framingEnvelope.sideways');
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
		const projectResult = validateProject({
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

			const projectResult = validateProject({
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

	it('rejects stale legacy fields on the current shape', () => {
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

	it('permits connected free-only nodes and all-free-only graphs', () => {
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
		// a multi-node graph with no guided cycle is a valid authoring
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

	it('round-trips texture and material instance IDs with renderable references', () => {
		const document = cloneDocument();
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
		(document.entities[0] as { materialInstanceId?: string }).materialInstanceId =
			'material-wall-detail';
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
		const document = cloneDocument();
		document.textures = [{ id: 'unsafe-texture', name: 'Unsafe', uri }];

		expectIssue(document, 'unsafe_texture_uri', '$.textures[0].uri');
	});

	it('rejects duplicate resources and unresolved material references', () => {
		const duplicateTextures = cloneDocument();
		duplicateTextures.textures = [
			{ id: 'same-texture', name: 'First', uri: '/textures/first.png' },
			{ id: 'same-texture', name: 'Second', uri: '/textures/second.png' }
		];
		expectIssue(duplicateTextures, 'duplicate_id', '$.textures[1].id');

		const duplicateMaterials = cloneDocument();
		duplicateMaterials.materials = [
			{ id: 'same-material', name: 'First', baseMaterialId: 'plaster-warm' },
			{ id: 'same-material', name: 'Second', baseMaterialId: 'wood-walnut' }
		];
		expectIssue(duplicateMaterials, 'duplicate_id', '$.materials[1].id');

		const unknownTexture = cloneDocument();
		unknownTexture.materials = [
			{
				id: 'unknown-texture-material',
				name: 'Unknown Texture',
				baseMaterialId: 'plaster-warm',
				baseTextureId: 'missing-texture'
			}
		];
		expectIssue(unknownTexture, 'unknown_texture', '$.materials[0].baseTextureId');

		const unknownMaterial = cloneDocument();
		(unknownMaterial.entities[0] as { materialInstanceId?: string }).materialInstanceId =
			'missing-material';
		expectIssue(
			unknownMaterial,
			'unknown_material_instance',
			'$.entities[0].materialInstanceId'
		);
	});

	it('rejects invalid material bases, overrides, and light material references', () => {
		const unknownBase = cloneDocument();
		unknownBase.materials = [
			{ id: 'bad-base', name: 'Bad Base', baseMaterialId: 'missing-material' }
		] as unknown as SceneDocument['materials'];
		expectIssue(unknownBase, 'unknown_material', '$.materials[0].baseMaterialId');

		for (const [key, value] of [
			['roughness', -0.01],
			['roughness', 1.01],
			['metalness', -0.01],
			['metalness', 1.01]
		] as const) {
			const invalidOverride = cloneDocument();
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

		const lightReference = cloneDocument();
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
		} as never);
		expectIssue(
			lightReference,
			'unknown_property',
			`$.entities[${lightReference.entities.length - 1}].materialInstanceId`
		);
	});

	it('requires textures and materials resource arrays', () => {
		const missingTextures = cloneDocument();
		delete (missingTextures as Partial<typeof missingTextures>).textures;
		expectIssue(missingTextures, 'invalid_type', '$.textures');

		const missingMaterials = cloneDocument();
		delete (missingMaterials as Partial<typeof missingMaterials>).materials;
		expectIssue(missingMaterials, 'invalid_type', '$.materials');
	});
});
