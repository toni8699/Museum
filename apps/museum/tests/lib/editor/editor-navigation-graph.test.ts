import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cloneFixtureDocument } from '../content/__fixtures__/load-fixture-scene';
import type {
	MuseumSceneDocument,
	SceneConnection,
	SceneNavigationNode
} from '$lib/content/scene';
import {
	currentMainFlowNodeIds,
	flowDetourGroups,
	flowLoopConnectionId,
	validateConnectionCreation,
	validateConnectionDeletion,
	validateCurrentGuidedTourOrder,
	validateDetourAppend,
	validateDetourCreation,
	validateDetourNodeRemoval,
	validateDetourRemoval,
	moveGuidedTourNodeIndex,
	validateGuidedTourInsertion,
	validateGuidedTourOrder,
	validateGuidedTourRemoval,
	validateNavigationNodeDeletion
} from '$lib/editor/editor-navigation-graph';

const FIXTURE_GUIDED_ORDER = ['tour-a', 'tour-b', 'tour-paris', 'tour-d'] as const;

function documentClone(): MuseumSceneDocument {
	return cloneFixtureDocument();
}

function guidedOrderFrom(document: MuseumSceneDocument): string[] {
	const result = validateCurrentGuidedTourOrder(document);
	if (!result.ok) {
		throw new Error(`Fixture guided order invalid: ${result.code}`);
	}
	return result.nodeIds;
}

function addConnection(
	document: MuseumSceneDocument,
	fromNodeId: string,
	toNodeId: string,
	id = `${fromNodeId}-${toNodeId}`
) {
	const from = document.navigationNodes.find((node) => node.id === fromNodeId)!;
	const to = document.navigationNodes.find((node) => node.id === toNodeId)!;
	from.connectedNodeIds.push(to.id);
	to.connectedNodeIds.push(from.id);
	document.connections.push({
		id,
		fromNodeId,
		toNodeId,
		clearance: 0.35,
		positionPath: { kind: 'auto-bezier', anchors: [] }
	});
}

function addFreeNode(
	document: MuseumSceneDocument,
	id: string,
	connectedNodeId: string
) {
	const node: SceneNavigationNode = {
		id,
		roomId: 'paris',
		label: id,
		position: [0, 1.65, 0],
		cameraTarget: [0, 1.25, -3],
		fov: 54,
		connectedNodeIds: []
	};
	document.navigationNodes.push(node);
	addConnection(document, connectedNodeId, id);
	return node;
}

describe('editor camera graph command validation', () => {
	it('accepts one distinct missing edge and rejects unavailable, self, and duplicate endpoints', () => {
		const document = documentClone();
		expect(validateConnectionCreation(document, 'tour-a', 'tour-paris')).toEqual(
			expect.objectContaining({
				ok: true,
				sourceNode: expect.objectContaining({ id: 'tour-a' }),
				destinationNode: expect.objectContaining({ id: 'tour-paris' })
			})
		);
		expect(validateConnectionCreation(document, 'missing', 'tour-paris')).toEqual(
			expect.objectContaining({ ok: false, code: 'unknown_source_node' })
		);
		expect(validateConnectionCreation(document, 'tour-paris', 'missing')).toEqual(
			expect.objectContaining({ ok: false, code: 'unknown_destination_node' })
		);
		expect(validateConnectionCreation(document, 'tour-paris', 'tour-paris')).toEqual(
			expect.objectContaining({ ok: false, code: 'self_connection' })
		);
		expect(validateConnectionCreation(document, 'tour-a', 'tour-b')).toEqual(
			expect.objectContaining({ ok: false, code: 'duplicate_connection' })
		);
	});

	it('allows deleting a redundant free edge but rejects guided and graph-bridge edges', () => {
		const redundant = documentClone();
		addConnection(redundant, 'tour-a', 'tour-paris', 'shortcut');
		expect(validateConnectionDeletion(redundant, 'shortcut')).toEqual(
			expect.objectContaining({ ok: true })
		);

		const guided = validateConnectionDeletion(documentClone(), 'tour-a-b');
		expect(guided).toEqual(
			expect.objectContaining({ ok: false, code: 'guided_connection' })
		);
		expect(guided.ok ? '' : guided.message).toContain('the flow order requires');

		const bridge = documentClone();
		addFreeNode(bridge, 'free-leaf', 'tour-paris');
		expect(validateConnectionDeletion(bridge, 'tour-paris-free-leaf')).toEqual(
			expect.objectContaining({ ok: false, code: 'disconnected_graph' })
		);
	});

	it('allows a free leaf node deletion and rejects deleting a free articulation node', () => {
		const leaf = documentClone();
		addFreeNode(leaf, 'free-leaf', 'tour-paris');
		expect(validateNavigationNodeDeletion(leaf, 'free-leaf')).toEqual(
			expect.objectContaining({
				ok: true,
				incidentConnectionIds: ['tour-paris-free-leaf']
			})
		);

		const articulation = documentClone();
		addFreeNode(articulation, 'free-middle', 'tour-paris');
		addFreeNode(articulation, 'free-leaf', 'free-middle');
		expect(validateNavigationNodeDeletion(articulation, 'free-middle')).toEqual(
			expect.objectContaining({ ok: false, code: 'disconnected_graph' })
		);
	});

	it('requires a guided predecessor-successor bridge and returns a valid splice plan', () => {
		const missingBridge = validateNavigationNodeDeletion(documentClone(), 'tour-b');
		expect(missingBridge).toEqual(
			expect.objectContaining({ ok: false, code: 'missing_guided_bridge' })
		);
		expect(missingBridge.ok ? '' : missingBridge.message).toContain(
			'need a direct connection'
		);

		const bridged = documentClone();
		addConnection(bridged, 'tour-a', 'tour-paris', 'tour-a-paris');
		expect(validateNavigationNodeDeletion(bridged, 'tour-b')).toEqual(
			expect.objectContaining({
				ok: true,
				predecessorNodeId: 'tour-a',
				successorNodeId: 'tour-paris',
				incidentConnectionIds: expect.arrayContaining(['tour-a-b', 'tour-b-paris'])
			})
		);

		const brokenCycle = documentClone();
		addConnection(brokenCycle, 'tour-a', 'tour-paris', 'tour-a-paris');
		brokenCycle.navigationNodes.find((node) => node.id === 'tour-d')!.nextNodeId =
			'tour-paris';
		expect(validateNavigationNodeDeletion(brokenCycle, 'tour-b')).toEqual(
			expect.objectContaining({ ok: false, code: 'invalid_guided_cycle' })
		);
	});

	it('preserves two guided nodes and checks connectivity after a valid guided splice', () => {
		const twoGuided = documentClone();
		for (const node of twoGuided.navigationNodes) {
			delete node.nextNodeId;
			delete node.previousNodeId;
		}
		const entrance = twoGuided.navigationNodes.find((node) => node.id === 'tour-a')!;
		const middle = twoGuided.navigationNodes.find((node) => node.id === 'tour-b')!;
		entrance.nextNodeId = middle.id;
		entrance.previousNodeId = middle.id;
		middle.nextNodeId = entrance.id;
		middle.previousNodeId = entrance.id;
		expect(validateNavigationNodeDeletion(twoGuided, entrance.id)).toEqual(
			expect.objectContaining({ ok: false, code: 'missing_guided_bridge' })
		);

		const disconnected = documentClone();
		addConnection(disconnected, 'tour-a', 'tour-paris', 'tour-a-paris');
		addFreeNode(disconnected, 'tour-b-free-leaf', 'tour-b');
		expect(validateNavigationNodeDeletion(disconnected, 'tour-b')).toEqual(
			expect.objectContaining({ ok: false, code: 'disconnected_graph' })
		);
	});
});

describe('editor guided-tour order validation', () => {
	it('reads one reciprocal cycle pinned to tour-a', () => {
		const document = documentClone();
		expect(validateCurrentGuidedTourOrder(document)).toEqual({
			ok: true,
			nodeIds: [...FIXTURE_GUIDED_ORDER]
		});
		expect(guidedOrderFrom(document)).toEqual([...FIXTURE_GUIDED_ORDER]);

		const broken = documentClone();
		broken.navigationNodes.find((node) => node.id === 'tour-d')!.nextNodeId =
			'tour-paris';
		expect(validateCurrentGuidedTourOrder(broken)).toEqual(
			expect.objectContaining({ ok: false, code: 'invalid_guided_cycle' })
		);
	});

	it('rejects short, duplicate, unknown, unpinned, and missing-edge orders', () => {
		const document = documentClone();
		const guidedOrder = guidedOrderFrom(document);
		expect(validateGuidedTourOrder(document, ['tour-a'])).toEqual(
			expect.objectContaining({ ok: true })
		);
		expect(
			validateGuidedTourOrder(document, ['tour-a', 'tour-b', 'tour-b'])
		).toEqual(expect.objectContaining({ ok: false, code: 'duplicate_guided_node' }));
		expect(validateGuidedTourOrder(document, ['tour-a', 'missing'])).toEqual(
			expect.objectContaining({ ok: false, code: 'unknown_node' })
		);
		expect(
			validateGuidedTourOrder(document, [
				'tour-a',
				'tour-paris',
				...guidedOrder.slice(3),
				'tour-b'
			])
		).toEqual(expect.objectContaining({ ok: false, code: 'missing_guided_connection' }));
	});

	it('accepts reorder only after every consecutive and return edge exists', () => {
		const document = documentClone();
		addConnection(document, 'tour-a', 'tour-paris', 'tour-a-paris');
		addConnection(document, 'tour-b', 'tour-d', 'tour-b-d');
		const reordered = ['tour-a', 'tour-paris', 'tour-b', 'tour-d'];
		expect(validateGuidedTourOrder(document, reordered)).toEqual({
			ok: true,
			nodeIds: reordered
		});
	});

	it('plans free-node insertion strictly — no auto-created edges (P1.8 D2)', () => {
		// P1.8 D2 — strict: a gap with a missing edge rejects with copy
		// naming the missing pair. No auto-create.
		const missing = documentClone();
		addFreeNode(missing, 'free-node', 'tour-paris');
		expect(validateGuidedTourInsertion(missing, 'free-node', 2)).toEqual(
			expect.objectContaining({ ok: false, code: 'missing_guided_connection' })
		);

		const insertable = documentClone();
		addFreeNode(insertable, 'free-node', 'tour-b');
		addConnection(insertable, 'free-node', 'tour-paris', 'free-paris');
		expect(validateGuidedTourInsertion(insertable, 'free-node', 2)).toEqual({
			ok: true,
			nodeIds: ['tour-a', 'tour-b', 'free-node', 'tour-paris', 'tour-d']
		});
		expect(validateGuidedTourInsertion(insertable, 'tour-a', 2)).toEqual(
			expect.objectContaining({ ok: false, code: 'node_already_guided' })
		);
		// P1.8 D1 — index 0 is now a valid insertion position (head gap).
		expect(validateGuidedTourInsertion(insertable, 'free-node', 0)).toEqual(
			expect.objectContaining({ ok: false, code: 'missing_guided_connection' })
		);

		// Two missing consecutive edges also reject (same strict path).
		const twoMissing = documentClone();
		twoMissing.navigationNodes.push({
			id: 'free-node',
			roomId: 'paris',
			label: 'Free Node',
			position: [0, 1.65, 0],
			cameraTarget: [0, 1.25, -3],
			fov: 54,
			connectedNodeIds: []
		});
		expect(validateGuidedTourInsertion(twoMissing, 'free-node', 2)).toEqual(
			expect.objectContaining({
				ok: false,
				code: 'missing_guided_connection'
			})
		);
	});

	it('plans removal only when the predecessor-successor edge exists (P1.8 D1: head removal valid)', () => {
		const missing = documentClone();
		expect(validateGuidedTourRemoval(missing, 'tour-b')).toEqual(
			expect.objectContaining({ ok: false, code: 'missing_guided_connection' })
		);
		// P1.8 D1 — head removal is now valid (spec §12 "Head — always valid").
		expect(validateGuidedTourRemoval(missing, 'tour-a')).toEqual({
			ok: true,
			nodeIds: FIXTURE_GUIDED_ORDER.filter((nodeId) => nodeId !== 'tour-a')
		});

		const removable = documentClone();
		addConnection(removable, 'tour-a', 'tour-paris', 'tour-a-paris');
		expect(validateGuidedTourRemoval(removable, 'tour-b')).toEqual({
			ok: true,
			nodeIds: FIXTURE_GUIDED_ORDER.filter((nodeId) => nodeId !== 'tour-b')
		});
	});

	it('moves a guided node one position within bounds — head reorder no longer pinned (P1.8)', () => {
		const order = [...FIXTURE_GUIDED_ORDER];
		// P1.8 D1 — the second row may move up to index 0 (plain reorder,
		// all nodes stay sequenced). The old `destination <= 0` guard made
		// this a silent no-op.
		expect(moveGuidedTourNodeIndex(order, 'tour-b', -1)).toEqual([
			'tour-b',
			'tour-a',
			'tour-paris',
			'tour-d'
		]);
		// The head may move down (old `index <= 0` guard blocked it).
		expect(moveGuidedTourNodeIndex(order, 'tour-a', 1)).toEqual([
			'tour-b',
			'tour-a',
			'tour-paris',
			'tour-d'
		]);
		// Interior moves still work.
		expect(moveGuidedTourNodeIndex(order, 'tour-paris', -1)).toEqual([
			'tour-a',
			'tour-paris',
			'tour-b',
			'tour-d'
		]);
		expect(moveGuidedTourNodeIndex(order, 'tour-paris', 1)).toEqual([
			'tour-a',
			'tour-b',
			'tour-d',
			'tour-paris'
		]);
		// Out of bounds and unknown nodes return null (no mutation).
		expect(moveGuidedTourNodeIndex(order, 'tour-a', -1)).toBeNull();
		expect(moveGuidedTourNodeIndex(order, 'tour-d', 1)).toBeNull();
		expect(moveGuidedTourNodeIndex(order, 'missing', -1)).toBeNull();
		expect(order).toEqual([...FIXTURE_GUIDED_ORDER]);
	});

});

describe('S10.2 — flow walk and detour validation', () => {
	/** The 4-node fixture cycle broken into an open chain tour-a → tour-b → tour-paris → tour-d. */
	function openChainDocument(): MuseumSceneDocument {
		const document = documentClone();
		const tourA = document.navigationNodes.find((node) => node.id === 'tour-a')!;
		const tourD = document.navigationNodes.find((node) => node.id === 'tour-d')!;
		delete tourD.nextNodeId;
		delete tourA.previousNodeId;
		return document;
	}

	function addFreeNode(document: MuseumSceneDocument, id: string): SceneNavigationNode {
		const node: SceneNavigationNode = {
			id,
			roomId: 'paris',
			label: id,
			position: [0, 1.65, 0],
			cameraTarget: [0, 1.25, -3],
			fov: 54,
			connectedNodeIds: []
		};
		document.navigationNodes.push(node);
		return node;
	}

	it('walks an open chain, a legacy closed cycle, and rejects a broken order', () => {
		expect(currentMainFlowNodeIds(openChainDocument())).toEqual([
			'tour-a',
			'tour-b',
			'tour-paris',
			'tour-d'
		]);
		// The legacy closed cycle resolves to the same derived open chain.
		expect(currentMainFlowNodeIds(documentClone())).toEqual([
			'tour-a',
			'tour-b',
			'tour-paris',
			'tour-d'
		]);
		// Broken reciprocity (tour-d.next = tour-paris breaks the walk) yields null.
		const broken = openChainDocument();
		broken.navigationNodes.find((node) => node.id === 'tour-d')!.nextNodeId =
			'tour-paris';
		expect(currentMainFlowNodeIds(broken)).toBeNull();
	});

	it('plans a detour only from a main-route origin onto a free node, once per origin', () => {
		const document = openChainDocument();
		addFreeNode(document, 'detour-head');
		expect(validateDetourCreation(document, 'tour-b', 'detour-head')).toEqual(
			expect.objectContaining({
				ok: true,
				headId: 'detour-head',
				tailId: 'detour-head',
				chainNodeIds: ['detour-head']
			})
		);

		// Origin not on the main route (a free node cannot branch a detour).
		addFreeNode(document, 'free-origin');
		expect(validateDetourCreation(document, 'free-origin', 'detour-head')).toEqual(
			expect.objectContaining({ ok: false, code: 'detour_origin_not_on_flow' })
		);
		// Head already on the flow.
		expect(validateDetourCreation(document, 'tour-b', 'tour-paris')).toEqual(
			expect.objectContaining({ ok: false, code: 'detour_node_not_free' })
		);
		// Self-branch.
		expect(validateDetourCreation(document, 'tour-b', 'tour-b')).toEqual(
			expect.objectContaining({ ok: false, code: 'self_connection' })
		);
		// One detour per origin (F6).
		expect(validateDetourCreation(document, 'tour-b', 'detour-head')).toEqual(
			expect.objectContaining({ ok: true })
		);
		expect(
			validateDetourCreation(
				{
					...document,
					navigationNodes: document.navigationNodes.map((node) =>
						node.id === 'detour-head'
							? { ...node, detourOfNodeId: 'tour-b' }
							: node
					)
				},
				'tour-b',
				'detour-head'
			)
		).toEqual(expect.objectContaining({ ok: false, code: 'detour_node_not_free' }));

		const secondHead = addFreeNode(document, 'second-head');
		expect(secondHead).toBeDefined();
		const withDetour = {
			...document,
			navigationNodes: document.navigationNodes.map((node) =>
				node.id === 'detour-head' ? { ...node, detourOfNodeId: 'tour-b' } : node
			)
		};
		expect(validateDetourCreation(withDetour, 'tour-b', 'second-head')).toEqual(
			expect.objectContaining({ ok: false, code: 'detour_already_exists' })
		);
	});

	it('appends detour nodes and refuses nodes already on a flow', () => {
		const document = openChainDocument();
		addFreeNode(document, 'detour-head');
		addFreeNode(document, 'detour-2');
		const withDetour = {
			...document,
			navigationNodes: document.navigationNodes.map((node) =>
				node.id === 'detour-head' ? { ...node, detourOfNodeId: 'tour-b' } : node
			)
		};
		expect(validateDetourAppend(withDetour, 'tour-b', 'detour-2')).toEqual(
			expect.objectContaining({
				ok: true,
				tailId: 'detour-head',
				chainNodeIds: ['detour-head']
			})
		);
		expect(validateDetourAppend(withDetour, 'tour-a', 'detour-2')).toEqual(
			expect.objectContaining({ ok: false, code: 'unknown_detour' })
		);
		expect(validateDetourAppend(withDetour, 'tour-b', 'tour-paris')).toEqual(
			expect.objectContaining({ ok: false, code: 'detour_node_not_free' })
		);
	});

	it('plans detour node removal with the strict T9 splice and head/whole removal', () => {
		const document = openChainDocument();
		addFreeNode(document, 'detour-head');
		addFreeNode(document, 'detour-2');
		addFreeNode(document, 'detour-3');
		const withDetour = {
			...document,
			navigationNodes: document.navigationNodes.map((node) =>
				node.id === 'detour-head' ? { ...node, detourOfNodeId: 'tour-b' } : node
			)
		};

		// Middle removal needs a direct detour-head–detour-3 edge (T9).
		const middleMissing = {
			...withDetour,
			navigationNodes: withDetour.navigationNodes.map((node) =>
				node.id === 'detour-head'
					? { ...node, nextNodeId: 'detour-2' }
					: node.id === 'detour-2'
						? { ...node, previousNodeId: 'detour-head', nextNodeId: 'detour-3' }
						: node.id === 'detour-3'
							? { ...node, previousNodeId: 'detour-2' }
							: node
			)
		};
		expect(validateDetourNodeRemoval(middleMissing, 'tour-b', 'detour-2')).toEqual(
			expect.objectContaining({ ok: false, code: 'missing_guided_connection' })
		);

		// With the splice edge present, the plan carries pred/succ.
		const spliceEdge: SceneConnection = {
			id: 'detour-head-detour-3',
			fromNodeId: 'detour-head',
			toNodeId: 'detour-3',
			clearance: 0.35,
			positionPath: { kind: 'auto-bezier', anchors: [] }
		};
		const bridged = {
			...middleMissing,
			connections: [...middleMissing.connections, spliceEdge]
		};
		expect(validateDetourNodeRemoval(bridged, 'tour-b', 'detour-2')).toEqual(
			expect.objectContaining({
				ok: true,
				predecessorNodeId: 'detour-head',
				successorNodeId: 'detour-3'
			})
		);

		// Head removal needs no splice edge.
		expect(validateDetourNodeRemoval(middleMissing, 'tour-b', 'detour-head')).toEqual(
			expect.objectContaining({
				ok: true,
				predecessorNodeId: undefined,
				successorNodeId: 'detour-2'
			})
		);

		// Unknown chain / node not in the chain.
		expect(validateDetourNodeRemoval(withDetour, 'tour-a', 'detour-head')).toEqual(
			expect.objectContaining({ ok: false, code: 'unknown_detour' })
		);
		expect(validateDetourNodeRemoval(withDetour, 'tour-b', 'tour-paris')).toEqual(
			expect.objectContaining({ ok: false, code: 'detour_node_not_in_chain' })
		);

		// Whole-detour removal returns the full chain.
		expect(validateDetourRemoval(withDetour, 'tour-b')).toEqual(
			expect.objectContaining({ ok: true, chainNodeIds: ['detour-head'] })
		);
		expect(validateDetourRemoval(withDetour, 'tour-a')).toEqual(
			expect.objectContaining({ ok: false, code: 'unknown_detour' })
		);
	});

	it('refuses deleting a detour return edge but allows unused non-chain edges', () => {
		const document = openChainDocument();
		addFreeNode(document, 'detour-head');
		const withDetour = {
			...document,
			navigationNodes: document.navigationNodes.map((node) =>
				node.id === 'detour-head' ? { ...node, detourOfNodeId: 'tour-b' } : node
			)
		};
		// The tail–origin return edge (tour-b–detour-head) exists as a chain of
		// one: origin ↔ head is the same record.
		const returnEdge: SceneConnection = {
			id: 'tour-b-detour-head',
			fromNodeId: 'tour-b',
			toNodeId: 'detour-head',
			clearance: 0.35,
			positionPath: { kind: 'auto-bezier', anchors: [] }
		};
		const connected = {
			...withDetour,
			connections: [...withDetour.connections, returnEdge]
		};
		expect(validateConnectionDeletion(connected, 'tour-b-detour-head')).toEqual(
			expect.objectContaining({ ok: false, code: 'guided_connection' })
		);
		// A redundant chord (the open chain's unused tour-d-a edge) remains deletable.
		expect(validateConnectionDeletion(withDetour, 'tour-d-a')).toEqual(
			expect.objectContaining({ ok: true })
		);
	});

	it('splices open-chain head/tail deletion and carries whole-detour deletion plans', () => {
		const open = openChainDocument();
		// Tail deletion: predecessor only, no bridge needed.
		expect(validateNavigationNodeDeletion(open, 'tour-d')).toEqual(
			expect.objectContaining({
				ok: true,
				predecessorNodeId: 'tour-paris',
				successorNodeId: undefined
			})
		);
		// Head deletion: successor only.
		expect(validateNavigationNodeDeletion(open, 'tour-a')).toEqual(
			expect.objectContaining({
				ok: true,
				predecessorNodeId: undefined,
				successorNodeId: 'tour-b'
			})
		);
		// Deleting the detour origin carries the whole chain (bridge edge present).
		const detourDocument = {
			...open,
			navigationNodes: [
				...open.navigationNodes.map((node) =>
					node.id === 'tour-b' ? { ...node, detourOfNodeId: undefined } : node
				),
				{
					id: 'detour-head',
					roomId: 'paris',
					label: 'Detour Head',
					position: [0, 1.65, 0],
					cameraTarget: [0, 1.25, -3],
					fov: 54,
					connectedNodeIds: [],
					detourOfNodeId: 'tour-b'
				}
			],
			connections: [
				...open.connections,
				{
					id: 'tour-a-tour-paris',
					fromNodeId: 'tour-a',
					toNodeId: 'tour-paris',
					clearance: 0.35,
					positionPath: { kind: 'auto-bezier', anchors: [] } as const
				} as SceneConnection
			]
		} as MuseumSceneDocument;
		expect(validateNavigationNodeDeletion(detourDocument, 'tour-b')).toEqual(
			expect.objectContaining({
				ok: true,
				detourChainNodeIds: ['detour-head'],
				detourOriginNodeId: 'tour-b'
			})
		);
	});

	it('refuses inserting or dropping a detour node onto the main flow', () => {
		const document = openChainDocument();
		addFreeNode(document, 'detour-head');
		const withDetour = {
			...document,
			navigationNodes: document.navigationNodes.map((node) =>
				node.id === 'detour-head' ? { ...node, detourOfNodeId: 'tour-b' } : node
			)
		};
		// A detour head cannot be spliced into the main flow in one op
		// (remove-from-detour + insert-into-main is a separate combined op).
		expect(validateGuidedTourInsertion(withDetour, 'detour-head', 1)).toEqual(
			expect.objectContaining({ ok: false, code: 'detour_node_not_free' })
		);
	});

	it('stays pure and renderer-neutral (no three/svelte imports)', () => {
		const source = readFileSync(
			new URL('../../../src/lib/editor/editor-navigation-graph.ts', import.meta.url),
			'utf8'
		);
		expect(source).not.toMatch(/from\s+['"](three|svelte|@threlte|\$app)['"]/);
	});

	it('derives the loop record with the distinct-connection test (S10.1.3 loop row)', () => {
		// Distinct tail→head record → loop (the fixture's tour-d→tour-a edge),
		// even when the order links are broken (loop is derived, never stored).
		const loopDocument = documentClone();
		expect(flowLoopConnectionId(loopDocument)).toBe('tour-d-a');
		// Open chain with no closing record → no loop.
		const open = openChainDocument();
		open.connections = open.connections.filter(
			(connection) => connection.id !== 'tour-d-a'
		);
		expect(flowLoopConnectionId(open)).toBeNull();
		// Two-node pair: its only record is also its chain transition → never loops.
		const pair = openChainDocument();
		const pairNodes = pair.navigationNodes.filter((node) =>
			['tour-a', 'tour-b'].includes(node.id)
		);
		pair.navigationNodes = pairNodes.map((node) => {
			if (node.id === 'tour-b') return { ...node, previousNodeId: 'tour-a' };
			return node;
		});
		pair.connections = pair.connections.filter(
			(connection) => connection.id === 'tour-a-tour-b'
		);
		expect(flowLoopConnectionId(pair)).toBeNull();
	});

	it('groups detour chains by origin for the Sequence Inspector (S10.1.3)', () => {
		const document = openChainDocument();
		const head = addFreeNode(document, 'detour-head');
		const second = addFreeNode(document, 'detour-second');
		second.previousNodeId = head.id;
		head.nextNodeId = second.id;
		const withDetour = {
			...document,
			navigationNodes: document.navigationNodes.map((node) =>
				node.id === 'detour-head' ? { ...node, detourOfNodeId: 'tour-b' } : node
			)
		};
		expect(flowDetourGroups(withDetour)).toEqual([
			{
				originNodeId: 'tour-b',
				headNodeId: 'detour-head',
				chainNodeIds: ['detour-head', 'detour-second']
			}
		]);
		expect(flowDetourGroups(openChainDocument())).toEqual([]);
	});
});
