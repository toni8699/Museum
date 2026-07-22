import { describe, expect, it } from 'vitest';
import {
	museumSceneDocument,
	type MuseumSceneDocument,
	type SceneNavigationNode
} from '$lib/content/scene';
import {
	validateConnectionCreation,
	validateConnectionDeletion,
	validateNavigationNodeDeletion
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
