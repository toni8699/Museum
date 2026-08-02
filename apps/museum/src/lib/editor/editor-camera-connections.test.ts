import { describe, expect, it } from 'vitest';
import { cloneFixtureDocument } from '$lib/content/__fixtures__/load-fixture-scene';
import { getNodeConnections } from './editor-camera-connections';

function connectionWithViewTracks(
	document: ReturnType<typeof cloneFixtureDocument>,
	baseId: string,
	viewTrack: { forward: number; reverse: number }
) {
	const connection = document.connections.find((candidate) => candidate.id === baseId);
	if (!connection) throw new Error(`Unknown connection id ${baseId}`);
	const makeKey = (index: number) => ({
		id: `${baseId}-view-${index.toString().padStart(2, '0')}`,
		progress: 0.25 + index * 0.1,
		cameraTarget: [0, 1, 0] as [number, number, number],
		fov: 50
	});
	return {
		...connection,
		viewTracks: {
			forward: Array.from({ length: viewTrack.forward }, (_, i) => makeKey(i + 1)),
			reverse: Array.from({ length: viewTrack.reverse }, (_, i) => makeKey(i + 5))
		}
	};
}

describe('getNodeConnections', () => {
	it('returns an empty bucket pair for a node with no connections', () => {
		const document = cloneFixtureDocument();
		const freeId = 'definitely-not-in-scene';
		const result = getNodeConnections(document, freeId);
		expect(result.outgoing).toEqual([]);
		expect(result.incoming).toEqual([]);
	});

	it('classifies outgoing vs incoming by direction with stable id ordering', () => {
		const document = cloneFixtureDocument();
		const entranceId = document.navigationNodes[0]!.id;
		const result = getNodeConnections(document, entranceId);
		expect(result.outgoing.length).toBeGreaterThan(0);
		expect(result.outgoing.every((row) => row.bucket === 'outgoing')).toBe(true);
		expect(result.outgoing.every((row) => row.partnerId !== entranceId)).toBe(true);
		for (const incoming of result.incoming) {
			expect(incoming.bucket).toBe('incoming');
			expect(incoming.partnerId).not.toBe(entranceId);
		}
		const ids = result.outgoing.map((row) => row.connectionId);
		expect(ids).toEqual([...ids].sort());
	});

	it('populates keyCounts across forward + reverse tracks', () => {
		const document = cloneFixtureDocument();
		const baseId = document.connections[0]!.id;
		const docWithTracks = {
			...document,
			connections: [
				connectionWithViewTracks(document, baseId, { forward: 2, reverse: 3 }),
				...document.connections.slice(1)
			]
		};
		const fromId = document.connections[0]!.fromNodeId;
		const row = getNodeConnections(docWithTracks, fromId).outgoing[0];
		expect(row?.keyCounts).toEqual({ forward: 2, reverse: 3, total: 5 });
		expect(row?.anchorsCount).toBe(document.connections[0]!.positionPath.anchors.length);
		expect(row?.kind).toBe(document.connections[0]!.positionPath.kind);
	});

	it('skips rows whose partner node is missing from the document', () => {
		const document = cloneFixtureDocument();
		const firstConnection = document.connections[0]!;
		const ghostDoc = {
			...document,
			connections: [
				{
					...firstConnection,
					toNodeId: 'ghost-partner'
				},
				...document.connections.slice(1)
			]
		};
		const fromId = firstConnection.fromNodeId;
		const list = getNodeConnections(ghostDoc, fromId);
		expect(list.outgoing.map((row) => row.connectionId)).not.toContain(firstConnection.id);
	});

	it('reports zero counts when a connection has no view tracks', () => {
		const document = cloneFixtureDocument();
		const baseId = document.connections[0]!.id;
		const stripped = {
			...document,
			connections: document.connections.map((connection) =>
				connection.id === baseId ? { ...connection, viewTracks: undefined } : connection
			)
		};
		const fromId = document.connections[0]!.fromNodeId;
		const row = getNodeConnections(stripped, fromId).outgoing.find(
			(candidate) => candidate.connectionId === baseId
		);
		expect(row?.keyCounts).toEqual({ forward: 0, reverse: 0, total: 0 });
	});
});
