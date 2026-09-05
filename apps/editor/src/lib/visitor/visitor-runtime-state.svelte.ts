/**
 * P21.4 — explicit-graph visitor runtime core.
 *
 * Generic navigation semantics with no Chopin defaults. The caller supplies
 * the navigation graph and the initial node explicitly; zero nodes is a valid
 * state (neutral orbit branch). The legacy wrapper under `lib/state` keeps its
 * entrance defaults and is never imported here.
 */
import { getNode } from '@portfolio/camera-core';
import type { NavigationGraph, NavigationNodeData } from '@portfolio/project-model';

export type VisitorTourMode = 'guided' | 'free';

export class VisitorRuntimeState {
	currentRoomId = $state<string>('');
	activeNodeId = $state<string>('');
	targetNodeId = $state<string | null>(null);
	isTransitioning = $state(false);
	tourMode = $state<VisitorTourMode>('guided');
	reducedMotion = $state(false);
	visitedRoomIds = $state(new Set<string>());

	constructor(
		readonly graph: NavigationGraph,
		initialNodeId: string | null
	) {
		const initialNode =
			initialNodeId === null ? undefined : graph.nodeById.get(initialNodeId);
		if (initialNode) {
			this.activeNodeId = initialNode.id;
			this.currentRoomId = initialNode.roomId;
			this.visitedRoomIds = new Set([initialNode.roomId]);
		} else {
			// Zero-node / no-valid-start policy: empty active id, inert FSM.
			// The surface takes the neutral orbit branch; never `getNode('')`.
			this.activeNodeId = '';
			this.currentRoomId = '';
			this.visitedRoomIds = new Set();
		}
	}

	get activeNode() {
		return getNode(this.activeNodeId, this.graph);
	}

	get targetNode() {
		return this.targetNodeId ? getNode(this.targetNodeId, this.graph) : null;
	}

	get currentRoom() {
		return this.activeNode.roomId;
	}

	get connectedNodes() {
		return this.activeNode.connectedNodeIds
			.filter((id) => this.canNavigateTo(id))
			.map((id) => getNode(id, this.graph));
	}

	canNavigateTo(nodeId: string) {
		if (!this.activeNodeId || nodeId === this.activeNodeId || this.isTransitioning)
			return false;
		if (this.tourMode === 'free') return true;
		let active;
		try {
			active = getNode(this.activeNodeId, this.graph);
		} catch {
			return false;
		}
		if (nodeId === active.nextNodeId) return true;
		if (nodeId !== active.previousNodeId) return false;
		try {
			return this.visitedRoomIds.has(getNode(nodeId, this.graph).roomId);
		} catch {
			return false;
		}
	}

	requestNode(nodeId: string) {
		if (!this.activeNodeId) return;
		let next;
		try {
			next = getNode(nodeId, this.graph);
		} catch {
			return;
		}
		if (!this.canNavigateTo(nodeId)) return;
		if (nodeId === this.activeNodeId || next.lockInteraction || this.isTransitioning)
			return;
		this.targetNodeId = nodeId;
		this.isTransitioning = true;
	}

	completeTransition(nodeId: string) {
		const next = getNode(nodeId, this.graph);
		this.activeNodeId = nodeId;
		this.currentRoomId = next.roomId;
		this.targetNodeId = null;
		this.isTransitioning = false;
		this.visitedRoomIds = new Set([...this.visitedRoomIds, next.roomId]);
	}

	goNext() {
		if (!this.activeNodeId) return;
		let active;
		try {
			active = getNode(this.activeNodeId, this.graph);
		} catch {
			return;
		}
		const nextNodeId = active.nextNodeId;
		if (nextNodeId) this.requestNode(nextNodeId);
	}

	goBack() {
		if (!this.activeNodeId) return;
		let active;
		try {
			active = getNode(this.activeNodeId, this.graph);
		} catch {
			return;
		}
		const previousNodeId = active.previousNodeId;
		if (previousNodeId) this.requestNode(previousNodeId);
	}
}

export function createVisitorRuntimeState(
	graph: NavigationGraph,
	initialNodeId: string | null
) {
	return new VisitorRuntimeState(graph, initialNodeId);
}

/**
 * Generic Sequence helpers with no Chopin pin. Flow nodes are those with
 * next/previous links; the head is found by walking `previousNodeId` from the
 * first on-flow node in document order.
 */
export function visitorMainFlowNodeIds(graph: NavigationGraph): string[] | null {
	const nodes = graph.navigationNodes;
	const isFlow = (id: string) => {
		const node = graph.nodeById.get(id);
		return !!node && (node.nextNodeId !== undefined || node.previousNodeId !== undefined);
	};
	const flowNodes = nodes.filter((node: NavigationNodeData) => isFlow(node.id));
	if (flowNodes.length === 0) return null;
	const nodeById = graph.nodeById;
	const seed = flowNodes[0]!;
	// Walk to the head via previous links.
	const seen = new Set([seed.id]);
	let cursor = seed;
	while (cursor.previousNodeId !== undefined) {
		const previous = nodeById.get(cursor.previousNodeId);
		if (!previous || !isFlow(previous.id)) break;
		if (previous.id === seed.id) return [seed.id];
		if (seen.has(previous.id)) break;
		seen.add(previous.id);
		cursor = previous;
	}
	// Walk forward from the head.
	const ordered: string[] = [];
	const visited = new Set<string>();
	let current: typeof cursor | undefined = cursor;
	while (current) {
		if (visited.has(current.id)) break;
		visited.add(current.id);
		ordered.push(current.id);
		const nextId = current.nextNodeId;
		if (nextId === undefined) break;
		const next = nodeById.get(nextId);
		if (!next || next.previousNodeId !== current.id) break;
		if (next.id === cursor.id) break;
		current = next;
	}
	return ordered.length > 0 ? ordered : null;
}

/** First valid camera in document order (unlocked preferred). Never ''. */
export function visitorFirstValidNodeId(graph: NavigationGraph): string | null {
	const nodes = graph.navigationNodes;
	if (nodes.length === 0) return null;
	const unlocked = nodes.find((node: NavigationNodeData) => !node.lockInteraction);
	return (unlocked ?? nodes[0]!)!.id;
}

/** Authored Sequence entry when present, else first valid camera, else null. */
export function visitorStartNodeId(graph: NavigationGraph): string | null {
	const flow = visitorMainFlowNodeIds(graph);
	if (flow && flow.length > 0) {
		const head = graph.nodeById.get(flow[0]!);
		if (head && !head.lockInteraction) return head.id;
		const unlockedInFlow = flow.find((id) => {
			const node = graph.nodeById.get(id);
			return node && !node.lockInteraction;
		});
		if (unlockedInFlow) return unlockedInFlow;
		return flow[0]!;
	}
	return visitorFirstValidNodeId(graph);
}
