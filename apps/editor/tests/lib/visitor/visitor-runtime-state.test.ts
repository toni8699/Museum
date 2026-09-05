import { describe, expect, it } from 'vitest';
import {
	createVisitorRuntimeState,
	visitorFirstValidNodeId,
	visitorMainFlowNodeIds,
	visitorStartNodeId
} from '$lib/visitor/visitor-runtime-state.svelte';
import type { NavigationGraph } from '@portfolio/project-model';

function graphWith(
	nodes: Array<{
		id: string;
		roomId?: string;
		nextNodeId?: string;
		previousNodeId?: string;
		lockInteraction?: boolean;
	}>
): NavigationGraph {
	const navigationNodes = nodes.map((node, index) => ({
		id: node.id,
		roomId: node.roomId ?? `room-${index}`,
		label: node.id,
		position: [0, 1, 0] as [number, number, number],
		cameraTarget: [0, 1, -1] as [number, number, number],
		fov: 54,
		connectedNodeIds: [] as string[],
		...(node.nextNodeId === undefined ? {} : { nextNodeId: node.nextNodeId }),
		...(node.previousNodeId === undefined ? {} : { previousNodeId: node.previousNodeId }),
		...(node.lockInteraction === undefined ? {} : { lockInteraction: node.lockInteraction })
	}));
	return {
		navigationNodes,
		connections: [],
		nodeById: new Map(navigationNodes.map((node) => [node.id, node]))
	};
}

describe('visitor runtime core (explicit graph, no Chopin defaults)', () => {
	it('treats zero nodes as a valid neutral state (never empty-string lookup)', () => {
		const graph = graphWith([]);
		expect(visitorStartNodeId(graph)).toBeNull();
		expect(visitorFirstValidNodeId(graph)).toBeNull();
		expect(visitorMainFlowNodeIds(graph)).toBeNull();
		const state = createVisitorRuntimeState(graph, null);
		expect(state.activeNodeId).toBe('');
		expect(state.targetNodeId).toBeNull();
		expect(state.isTransitioning).toBe(false);
	});

	it('starts at the Sequence entry when present, else first valid camera', () => {
		const sequenced = graphWith([
			{ id: 'b', nextNodeId: 'c', previousNodeId: 'a' },
			{ id: 'a', nextNodeId: 'b' },
			{ id: 'c', previousNodeId: 'b' },
			{ id: 'solo' }
		]);
		// Document order is b,a,c,solo; the flow head is a.
		expect(visitorMainFlowNodeIds(sequenced)).toEqual(['a', 'b', 'c']);
		expect(visitorStartNodeId(sequenced)).toBe('a');

		const unsequenced = graphWith([{ id: 'first' }, { id: 'second' }]);
		expect(visitorMainFlowNodeIds(unsequenced)).toBeNull();
		expect(visitorStartNodeId(unsequenced)).toBe('first');
	});

	it('navigates only along valid Sequence links (locked ignored)', () => {
		const graph = graphWith([
			{ id: 'a', nextNodeId: 'b' },
			{ id: 'b', previousNodeId: 'a', nextNodeId: 'c' },
			{ id: 'c', previousNodeId: 'b', lockInteraction: true }
		]);
		const state = createVisitorRuntimeState(graph, 'a');
		expect(state.activeNodeId).toBe('a');
		state.goNext();
		expect(state.targetNodeId).toBe('b');
		expect(state.isTransitioning).toBe(true);
		state.completeTransition('b');
		expect(state.activeNodeId).toBe('b');
		// Locked next is not requested.
		state.goNext();
		expect(state.targetNodeId).toBeNull();
		expect(state.activeNodeId).toBe('b');
	});

	it('works in arbitrary room IDs (no Paris restriction)', () => {
		const graph = graphWith([{ id: 'n1', roomId: 'custom-room-9' }]);
		const state = createVisitorRuntimeState(graph, 'n1');
		expect(state.currentRoomId).toBe('custom-room-9');
		expect(state.activeNodeId).toBe('n1');
	});
});
