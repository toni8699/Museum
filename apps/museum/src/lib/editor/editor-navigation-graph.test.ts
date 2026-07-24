import { describe, expect, it } from 'vitest';
import {
	museumSceneDocument,
	type MuseumSceneDocument,
	type SceneNavigationNode
} from '$lib/content/scene';
import {
	validateConnectionCreation,
	validateConnectionDeletion,
	validateCurrentGuidedTourOrder,
	validateGuidedTourInsertion,
	validateGuidedTourOrder,
	validateGuidedTourRemoval,
	validateNavigationNodeDeletion,
	validateTimelineGuidedTourDrop
} from './editor-navigation-graph';

function documentClone(): MuseumSceneDocument {
	return JSON.parse(JSON.stringify(museumSceneDocument)) as MuseumSceneDocument;
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
		expect(
			validateConnectionCreation(document, 'entrance-start', 'paris-seat')
		).toEqual(
			expect.objectContaining({
				ok: true,
				sourceNode: expect.objectContaining({ id: 'entrance-start' }),
				destinationNode: expect.objectContaining({ id: 'paris-seat' })
			})
		);
		expect(validateConnectionCreation(document, 'missing', 'paris-seat')).toEqual(
			expect.objectContaining({ ok: false, code: 'unknown_source_node' })
		);
		expect(validateConnectionCreation(document, 'paris-seat', 'missing')).toEqual(
			expect.objectContaining({ ok: false, code: 'unknown_destination_node' })
		);
		expect(
			validateConnectionCreation(document, 'paris-seat', 'paris-seat')
		).toEqual(expect.objectContaining({ ok: false, code: 'self_connection' }));
		expect(
			validateConnectionCreation(document, 'entrance-start', 'poland-threshold')
		).toEqual(expect.objectContaining({ ok: false, code: 'duplicate_connection' }));
	});

	it('allows deleting a redundant free edge but rejects guided and graph-bridge edges', () => {
		const redundant = documentClone();
		addConnection(redundant, 'entrance-start', 'departure-corridor', 'shortcut');
		expect(validateConnectionDeletion(redundant, 'shortcut')).toEqual(
			expect.objectContaining({ ok: true })
		);

		const guided = validateConnectionDeletion(
			documentClone(),
			'entrance-poland'
		);
		expect(guided).toEqual(
			expect.objectContaining({ ok: false, code: 'guided_connection' })
		);
		expect(guided.ok ? '' : guided.message).toContain('guided order requires');

		const bridge = documentClone();
		addFreeNode(bridge, 'free-leaf', 'paris-seat');
		expect(
			validateConnectionDeletion(bridge, 'paris-seat-free-leaf')
		).toEqual(expect.objectContaining({ ok: false, code: 'disconnected_graph' }));
	});

	it('allows a free leaf node deletion and rejects deleting a free articulation node', () => {
		const leaf = documentClone();
		addFreeNode(leaf, 'free-leaf', 'paris-seat');
		expect(validateNavigationNodeDeletion(leaf, 'free-leaf')).toEqual(
			expect.objectContaining({
				ok: true,
				incidentConnectionIds: ['paris-seat-free-leaf']
			})
		);

		const articulation = documentClone();
		addFreeNode(articulation, 'free-middle', 'paris-seat');
		addFreeNode(articulation, 'free-leaf', 'free-middle');
		expect(
			validateNavigationNodeDeletion(articulation, 'free-middle')
		).toEqual(expect.objectContaining({ ok: false, code: 'disconnected_graph' }));
	});

	it('requires a guided predecessor-successor bridge and returns a valid splice plan', () => {
		const missingBridge = validateNavigationNodeDeletion(
			documentClone(),
			'poland-threshold'
		);
		expect(missingBridge).toEqual(
			expect.objectContaining({ ok: false, code: 'missing_guided_bridge' })
		);
		expect(missingBridge.ok ? '' : missingBridge.message).toContain(
			'need a direct connection'
		);

		const bridged = documentClone();
		addConnection(
			bridged,
			'entrance-start',
			'departure-corridor',
			'entrance-departure'
		);
		expect(validateNavigationNodeDeletion(bridged, 'poland-threshold')).toEqual(
			expect.objectContaining({
				ok: true,
				predecessorNodeId: 'entrance-start',
				successorNodeId: 'departure-corridor',
				incidentConnectionIds: expect.arrayContaining([
					'entrance-poland',
					'poland-departure'
				])
			})
		);

		const brokenCycle = documentClone();
		addConnection(
			brokenCycle,
			'entrance-start',
			'departure-corridor',
			'entrance-departure'
		);
		brokenCycle.navigationNodes.find(
			(node) => node.id === 'music-entry'
		)!.previousNodeId = 'paris-seat';
		expect(
			validateNavigationNodeDeletion(brokenCycle, 'poland-threshold')
		).toEqual(expect.objectContaining({ ok: false, code: 'invalid_guided_cycle' }));
	});

	it('preserves two guided nodes and checks connectivity after a valid guided splice', () => {
		const twoGuided = documentClone();
		for (const node of twoGuided.navigationNodes) {
			delete node.nextNodeId;
			delete node.previousNodeId;
		}
		const entrance = twoGuided.navigationNodes.find(
			(node) => node.id === 'entrance-start'
		)!;
		const poland = twoGuided.navigationNodes.find(
			(node) => node.id === 'poland-threshold'
		)!;
		entrance.nextNodeId = poland.id;
		entrance.previousNodeId = poland.id;
		poland.nextNodeId = entrance.id;
		poland.previousNodeId = entrance.id;
		expect(validateNavigationNodeDeletion(twoGuided, entrance.id)).toEqual(
			expect.objectContaining({ ok: false, code: 'minimum_guided_nodes' })
		);

		const disconnected = documentClone();
		addConnection(
			disconnected,
			'entrance-start',
			'departure-corridor',
			'entrance-departure'
		);
		addFreeNode(disconnected, 'poland-free-leaf', 'poland-threshold');
		expect(
			validateNavigationNodeDeletion(disconnected, 'poland-threshold')
		).toEqual(expect.objectContaining({ ok: false, code: 'disconnected_graph' }));
	});
});

describe('editor guided-tour order validation', () => {
	const checkedInOrder = [
		'entrance-start',
		'poland-threshold',
		'departure-corridor',
		'paris-seat',
		'workshop-desk',
		'music-entry',
		'music-center',
		'legacy-return'
	];

	it('reads one reciprocal cycle pinned to entrance-start', () => {
		expect(validateCurrentGuidedTourOrder(documentClone())).toEqual({
			ok: true,
			nodeIds: checkedInOrder
		});

		const broken = documentClone();
		broken.navigationNodes.find((node) => node.id === 'music-entry')!.previousNodeId =
			'paris-seat';
		expect(validateCurrentGuidedTourOrder(broken)).toEqual(
			expect.objectContaining({ ok: false, code: 'invalid_guided_cycle' })
		);
	});

	it('rejects short, duplicate, unknown, unpinned, and missing-edge orders', () => {
		const document = documentClone();
		expect(validateGuidedTourOrder(document, ['entrance-start'])).toEqual(
			expect.objectContaining({ ok: false, code: 'minimum_guided_nodes' })
		);
		expect(
			validateGuidedTourOrder(document, [
				'entrance-start',
				'poland-threshold',
				'poland-threshold'
			])
		).toEqual(expect.objectContaining({ ok: false, code: 'duplicate_guided_node' }));
		expect(
			validateGuidedTourOrder(document, ['entrance-start', 'missing'])
		).toEqual(expect.objectContaining({ ok: false, code: 'unknown_node' }));
		expect(validateGuidedTourOrder(document, checkedInOrder.slice(1))).toEqual(
			expect.objectContaining({ ok: false, code: 'missing_guided_start' })
		);
		expect(
			validateGuidedTourOrder(document, [
				'poland-threshold',
				'entrance-start',
				...checkedInOrder.slice(2)
			])
		).toEqual(expect.objectContaining({ ok: false, code: 'guided_start_not_first' }));
		expect(
			validateGuidedTourOrder(document, [
				'entrance-start',
				'departure-corridor',
				...checkedInOrder.slice(3),
				'poland-threshold'
			])
		).toEqual(expect.objectContaining({ ok: false, code: 'missing_guided_connection' }));
	});

	it('accepts reorder only after every consecutive and return edge exists', () => {
		const document = documentClone();
		addConnection(document, 'entrance-start', 'departure-corridor', 'entrance-departure');
		addConnection(document, 'poland-threshold', 'paris-seat', 'poland-paris');
		const reordered = [
			'entrance-start',
			'departure-corridor',
			'poland-threshold',
			'paris-seat',
			...checkedInOrder.slice(4)
		];
		expect(validateGuidedTourOrder(document, reordered)).toEqual({
			ok: true,
			nodeIds: reordered
		});
	});

	it('plans free-node insertion only across two existing edges', () => {
		const missing = documentClone();
		addFreeNode(missing, 'free-node', 'paris-seat');
		expect(validateGuidedTourInsertion(missing, 'free-node', 4)).toEqual(
			expect.objectContaining({ ok: false, code: 'missing_guided_connection' })
		);

		const insertable = documentClone();
		addFreeNode(insertable, 'free-node', 'departure-corridor');
		addConnection(insertable, 'free-node', 'paris-seat', 'free-paris');
		expect(validateGuidedTourInsertion(insertable, 'free-node', 3)).toEqual({
			ok: true,
			nodeIds: [
				...checkedInOrder.slice(0, 3),
				'free-node',
				...checkedInOrder.slice(3)
			]
		});
		expect(validateGuidedTourInsertion(insertable, 'entrance-start', 2)).toEqual(
			expect.objectContaining({ ok: false, code: 'node_already_guided' })
		);
		expect(validateGuidedTourInsertion(insertable, 'free-node', 0)).toEqual(
			expect.objectContaining({ ok: false, code: 'invalid_guided_index' })
		);
	});

	it('plans removal only when the predecessor-successor edge exists', () => {
		const missing = documentClone();
		expect(validateGuidedTourRemoval(missing, 'poland-threshold')).toEqual(
			expect.objectContaining({ ok: false, code: 'missing_guided_connection' })
		);
		expect(validateGuidedTourRemoval(missing, 'entrance-start')).toEqual(
			expect.objectContaining({ ok: false, code: 'protected_guided_start' })
		);

		const removable = documentClone();
		addConnection(
			removable,
			'entrance-start',
			'departure-corridor',
			'entrance-departure'
		);
		expect(validateGuidedTourRemoval(removable, 'poland-threshold')).toEqual({
			ok: true,
			nodeIds: checkedInOrder.filter((nodeId) => nodeId !== 'poland-threshold')
		});
	});

	it('plans one atomic timeline insertion with exactly one missing straight edge', () => {
		const document = documentClone();
		addFreeNode(document, 'free-node', 'paris-seat');

		expect(
			validateTimelineGuidedTourDrop(
				document,
				'free-node',
				'departure-corridor',
				'paris-seat'
			)
		).toEqual({
			ok: true,
			nodeIds: [
				...checkedInOrder.slice(0, 3),
				'free-node',
				...checkedInOrder.slice(3)
			],
			missingConnection: {
				fromNodeId: 'departure-corridor',
				toNodeId: 'free-node'
			},
			focusConnection: {
				fromNodeId: 'departure-corridor',
				toNodeId: 'free-node'
			}
		});
	});

	it('uses existing edges and rejects self, invalid-gap, and multi-edge drops', () => {
		const insertable = documentClone();
		addFreeNode(insertable, 'free-node', 'departure-corridor');
		addConnection(insertable, 'free-node', 'paris-seat', 'free-paris');
		expect(
			validateTimelineGuidedTourDrop(
				insertable,
				'free-node',
				'departure-corridor',
				'paris-seat'
			)
		).toEqual(
			expect.objectContaining({ ok: true, missingConnection: null })
		);

		const document = documentClone();
		expect(
			validateTimelineGuidedTourDrop(
				document,
				'poland-threshold',
				'poland-threshold',
				'departure-corridor'
			)
		).toEqual(expect.objectContaining({ ok: false, code: 'guided_self_drop' }));
		expect(
			validateTimelineGuidedTourDrop(
				document,
				'poland-threshold',
				'departure-corridor',
				'workshop-desk'
			)
		).toEqual(expect.objectContaining({ ok: false, code: 'invalid_guided_gap' }));

		addFreeNode(document, 'free-node', 'music-center');
		expect(
			validateTimelineGuidedTourDrop(
				document,
				'free-node',
				'departure-corridor',
				'paris-seat'
			)
		).toEqual(
			expect.objectContaining({
				ok: false,
				code: 'too_many_missing_guided_connections'
			})
		);
	});

	it('moves a guided node when final order needs at most one new edge', () => {
		const document = documentClone();
		addConnection(document, 'entrance-start', 'departure-corridor', 'entrance-departure');
		const result = validateTimelineGuidedTourDrop(
			document,
			'poland-threshold',
			'departure-corridor',
			'paris-seat'
		);
		expect(result).toEqual(
			expect.objectContaining({
				ok: true,
				missingConnection: {
					fromNodeId: 'poland-threshold',
					toNodeId: 'paris-seat'
				}
			})
		);
		expect(result.ok ? result.nodeIds : []).toEqual([
			'entrance-start',
			'departure-corridor',
			'poland-threshold',
			...checkedInOrder.slice(3)
		]);
	});
});
