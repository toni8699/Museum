import { describe, expect, it } from 'vitest';
import { cloneFixtureDocument } from '../content/__fixtures__/load-fixture-scene';
import type { MuseumSceneDocument, SceneNavigationNode } from '$lib/content/scene';
import {
	validateConnectionCreation,
	validateConnectionDeletion,
	validateCurrentGuidedTourOrder,
	validateGuidedTourInsertion,
	validateGuidedTourOrder,
	validateGuidedTourRemoval,
	validateNavigationNodeDeletion,
	validateTimelineGuidedTourDrop
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
		expect(guided.ok ? '' : guided.message).toContain('guided order requires');

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
			expect.objectContaining({ ok: false, code: 'minimum_guided_nodes' })
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
			expect.objectContaining({ ok: false, code: 'minimum_guided_nodes' })
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

	it('plans free-node insertion only across two existing edges', () => {
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
		expect(validateGuidedTourInsertion(insertable, 'free-node', 0)).toEqual(
			expect.objectContaining({ ok: false, code: 'invalid_guided_index' })
		);
	});

	it('plans removal only when the predecessor-successor edge exists', () => {
		const missing = documentClone();
		expect(validateGuidedTourRemoval(missing, 'tour-b')).toEqual(
			expect.objectContaining({ ok: false, code: 'missing_guided_connection' })
		);
		expect(validateGuidedTourRemoval(missing, 'tour-a')).toEqual(
			expect.objectContaining({ ok: false, code: 'protected_guided_start' })
		);

		const removable = documentClone();
		addConnection(removable, 'tour-a', 'tour-paris', 'tour-a-paris');
		expect(validateGuidedTourRemoval(removable, 'tour-b')).toEqual({
			ok: true,
			nodeIds: FIXTURE_GUIDED_ORDER.filter((nodeId) => nodeId !== 'tour-b')
		});
	});

	it('plans one atomic timeline insertion with exactly one missing straight edge', () => {
		const document = documentClone();
		addFreeNode(document, 'free-node', 'tour-paris');

		expect(
			validateTimelineGuidedTourDrop(document, 'free-node', 'tour-b', 'tour-paris')
		).toEqual({
			ok: true,
			nodeIds: ['tour-a', 'tour-b', 'free-node', 'tour-paris', 'tour-d'],
			missingConnection: {
				fromNodeId: 'tour-b',
				toNodeId: 'free-node'
			},
			focusConnection: {
				fromNodeId: 'tour-b',
				toNodeId: 'free-node'
			}
		});
	});

	it('uses existing edges and rejects self, invalid-gap, and multi-edge drops', () => {
		const insertable = documentClone();
		addFreeNode(insertable, 'free-node', 'tour-b');
		addConnection(insertable, 'free-node', 'tour-paris', 'free-paris');
		expect(
			validateTimelineGuidedTourDrop(
				insertable,
				'free-node',
				'tour-b',
				'tour-paris'
			)
		).toEqual(expect.objectContaining({ ok: true, missingConnection: null }));

		const document = documentClone();
		expect(
			validateTimelineGuidedTourDrop(
				document,
				'tour-b',
				'tour-b',
				'tour-paris'
			)
		).toEqual(expect.objectContaining({ ok: false, code: 'guided_self_drop' }));
		expect(
			validateTimelineGuidedTourDrop(document, 'tour-b', 'tour-a', 'tour-d')
		).toEqual(expect.objectContaining({ ok: false, code: 'invalid_guided_gap' }));

		addFreeNode(document, 'free-node', 'tour-d');
		expect(
			validateTimelineGuidedTourDrop(document, 'free-node', 'tour-b', 'tour-paris')
		).toEqual(
			expect.objectContaining({
				ok: false,
				code: 'too_many_missing_guided_connections'
			})
		);
	});

	it('moves a guided node when final order needs at most one new edge', () => {
		const document = documentClone();
		addConnection(document, 'tour-a', 'tour-paris', 'tour-a-paris');
		const result = validateTimelineGuidedTourDrop(
			document,
			'tour-b',
			'tour-paris',
			'tour-d'
		);
		expect(result).toEqual(
			expect.objectContaining({
				ok: true,
				missingConnection: {
					fromNodeId: 'tour-b',
					toNodeId: 'tour-d'
				}
			})
		);
		expect(result.ok ? result.nodeIds : []).toEqual([
			'tour-a',
			'tour-paris',
			'tour-b',
			'tour-d'
		]);
	});
});
