import {
	isFlowNode,
	type SceneDocument,
	type SceneConnection,
	type SceneNavigationNode
} from '$lib/content/scene';

export type EditorNavigationGraphFailureCode =
	| 'unknown_source_node'
	| 'unknown_destination_node'
	| 'self_connection'
	| 'duplicate_connection'
	| 'unknown_connection'
	| 'guided_connection'
	| 'disconnected_graph'
	| 'unknown_node'
	| 'minimum_guided_nodes'
	| 'missing_guided_bridge'
	| 'invalid_guided_cycle'
	| 'duplicate_guided_node'
	| 'missing_guided_connection'
	| 'node_already_guided'
	| 'node_not_guided'
	| 'invalid_guided_index'
	// S10.2 detour failures.
	| 'unknown_detour'
	| 'detour_origin_not_on_flow'
	| 'detour_node_not_free'
	| 'detour_node_not_in_chain'
	| 'detour_already_exists';

export type EditorNavigationGraphFailure = {
	ok: false;
	code: EditorNavigationGraphFailureCode;
	message: string;
};

export type EditorConnectionCreationPlan = {
	ok: true;
	sourceNode: SceneNavigationNode;
	destinationNode: SceneNavigationNode;
};

export type EditorConnectionDeletionPlan = {
	ok: true;
	connection: SceneConnection;
	/** Deleting the last two-node sequence edge intentionally returns both nodes to Unsequenced. */
	dissolvesGuidedFlow?: boolean;
};

export type EditorNavigationNodeDeletionPlan = {
	ok: true;
	node: SceneNavigationNode;
	incidentConnectionIds: string[];
	predecessorNodeId?: string;
	successorNodeId?: string;
	/** S10.2 — whole-detour deletion with the node (origin or orphaned head). */
	detourChainNodeIds?: string[];
	detourOriginNodeId?: string;
};

export type EditorGuidedTourOrderPlan = {
	ok: true;
	nodeIds: string[];
};

/**
 * P1.8 D1 — the preferred/default start when resolving or seeding sequence
 * state where author intent has not overridden it. This defines only the
 * preferred seed in `mainFlowStart` / `findGuidedStart`; it no longer
 * defines valid sequence structure. Do not restore the pin from the name
 * alone — any camera can head the sequence.
 */
export const EDITOR_GUIDED_TOUR_START_NODE_ID = 'entrance-start';

function fail(
	code: EditorNavigationGraphFailureCode,
	message: string
): EditorNavigationGraphFailure {
	return { ok: false, code, message };
}

function nodeName(node: SceneNavigationNode) {
	return `${node.label} (${node.id})`;
}


function findConnectionBetween(
	document: SceneDocument,
	leftNodeId: string,
	rightNodeId: string,
	excludedConnectionIds: ReadonlySet<string> = new Set()
) {
	return document.connections.find(
		(connection) =>
			!excludedConnectionIds.has(connection.id) &&
			((connection.fromNodeId === leftNodeId &&
				connection.toNodeId === rightNodeId) ||
				(connection.fromNodeId === rightNodeId &&
					connection.toNodeId === leftNodeId))
	);
}

function graphRemainsConnected(
	document: SceneDocument,
	excludedNodeIds: ReadonlySet<string>,
	excludedConnectionIds: ReadonlySet<string>
) {
	const remainingNodeIds = document.navigationNodes
		.map((node) => node.id)
		.filter((nodeId) => !excludedNodeIds.has(nodeId));
	if (remainingNodeIds.length <= 1) return true;

	const adjacency = new Map(
		remainingNodeIds.map((nodeId) => [nodeId, new Set<string>()])
	);
	for (const connection of document.connections) {
		if (
			excludedConnectionIds.has(connection.id) ||
			excludedNodeIds.has(connection.fromNodeId) ||
			excludedNodeIds.has(connection.toNodeId)
		) {
			continue;
		}
		adjacency.get(connection.fromNodeId)?.add(connection.toNodeId);
		adjacency.get(connection.toNodeId)?.add(connection.fromNodeId);
	}

	const visited = new Set<string>();
	// Exclude always-standalone nodes (zero edges in the original document)
	// from the connectivity check. Nodes that would BECOME zero-edge after the
	// deletion are still checked — stranding a connected node must be rejected.
	const originalEdgeCount = new Map<string, number>();
	for (const connection of document.connections) {
		originalEdgeCount.set(
			connection.fromNodeId,
			(originalEdgeCount.get(connection.fromNodeId) ?? 0) + 1
		);
		originalEdgeCount.set(
			connection.toNodeId,
			(originalEdgeCount.get(connection.toNodeId) ?? 0) + 1
		);
	}
	const nodesInCore = remainingNodeIds.filter(
		(nodeId) => (originalEdgeCount.get(nodeId) ?? 0) > 0
	);
	if (nodesInCore.length <= 1) return true;
	const queue = [nodesInCore[0]!];
	while (queue.length > 0) {
		const nodeId = queue.shift()!;
		if (visited.has(nodeId)) continue;
		visited.add(nodeId);
		for (const neighborId of adjacency.get(nodeId) ?? []) {
			if (!visited.has(neighborId)) queue.push(neighborId);
		}
	}
	return visited.size === nodesInCore.length;
}

/**
 * S10.2 — walk one ordered flow component from `startNodeId` following
 * `nextNodeId` links. Stops at the open tail or at the node whose next points
 * back at the start (legacy closed cycle). Returns null when the order
 * structure is invalid (unknown link target, non-reciprocal link, repeat).
 */
function walkFlowComponentFrom(
	document: SceneDocument,
	startNodeId: string,
	nodeById: ReadonlyMap<string, SceneNavigationNode>
): { nodeIds: string[]; headId: string; tailId: string } | null {
	const start = nodeById.get(startNodeId);
	if (!start) return null;
	const visited = new Set<string>([start.id]);
	const nodeIds = [start.id];
	let cursor = start;
	while (true) {
		const nextNodeId = cursor.nextNodeId;
		if (nextNodeId === undefined) break;
		const next = nodeById.get(nextNodeId);
		if (!next) return null;
		if (next.previousNodeId !== cursor.id) return null;
		if (next.id === start.id) break; // legacy closed cycle
		if (visited.has(next.id)) return null;
		visited.add(next.id);
		nodeIds.push(next.id);
		cursor = next;
	}
	return { nodeIds, headId: start.id, tailId: cursor.id };
}

/**
 * S10.2 — the main flow component start: the component head containing the
 * pinned entrance-start, else the first on-flow node in document order. For a
 * legacy closed cycle the seed itself is returned so the derived chain keeps
 * its display order (the walk stops at the node whose next = start).
 */
function mainFlowStart(
	document: SceneDocument,
	nodeById: ReadonlyMap<string, SceneNavigationNode>
): SceneNavigationNode {
	const flowNodes = document.navigationNodes.filter(isFlowNode);
	const seed =
		flowNodes.find((node) => node.id === EDITOR_GUIDED_TOUR_START_NODE_ID) ??
		flowNodes[0]!;
	const seen = new Set([seed.id]);
	let cursor = seed;
	while (cursor.previousNodeId !== undefined) {
		const previous = nodeById.get(cursor.previousNodeId);
		if (!previous || !isFlowNode(previous)) break;
		if (previous.id === seed.id) return seed; // legacy closed cycle
		if (seen.has(previous.id)) break;
		seen.add(previous.id);
		cursor = previous;
	}
	return cursor;
}

/**
 * S10.2 — the current main flow component's ordered node ids (head → tail),
 * or null when the document has no valid flow. Detour components are separate
 * and excluded by design.
 */
export function currentMainFlowNodeIds(
	document: SceneDocument
): string[] | null {
	const flowNodes = document.navigationNodes.filter(isFlowNode);
	if (flowNodes.length === 0) return null;
	const nodeById = new Map(document.navigationNodes.map((node) => [node.id, node]));
	const start = mainFlowStart(document, nodeById);
	const walked = walkFlowComponentFrom(document, start.id, nodeById);
	return walked?.nodeIds ?? null;
}

/**
 * S10.2 — the derived-loop record id for the main flow (the distinct-
 * connection test): the tail↔head connection id when it exists and is not a
 * chain transition, or null (open flow — plays Once). A two-node pair never
 * loops (its only record is also its chain transition). Serves the Sequence
 * Inspector loop row and the timeline readout.
 */
export function flowLoopConnectionId(
	document: SceneDocument
): string | null {
	const flowNodeIds = currentMainFlowNodeIds(document);
	if (!flowNodeIds || flowNodeIds.length < 3) return null;
	const headId = flowNodeIds[0];
	const tailId = flowNodeIds.at(-1);
	if (headId === undefined || tailId === undefined) return null;
	const closing = document.connections.find(
		(connection) =>
			(connection.fromNodeId === headId && connection.toNodeId === tailId) ||
			(connection.fromNodeId === tailId && connection.toNodeId === headId)
	);
	return closing?.id ?? null;
}

/**
 * S10.2 — every detour chain grouped by its origin (main-route node). Each
 * group carries the head marker node and the ordered chain node ids
 * (head → … → tail). Used by the Sequence Inspector's detour grouping.
 */
export function flowDetourGroups(
	document: SceneDocument
): Array<{ originNodeId: string; headNodeId: string; chainNodeIds: string[] }> {
	const nodeById = new Map(document.navigationNodes.map((node) => [node.id, node]));
	const groups: Array<{ originNodeId: string; headNodeId: string; chainNodeIds: string[] }> = [];
	for (const head of document.navigationNodes) {
		if (head.detourOfNodeId === undefined) continue;
		const chain = findDetourChain(document, head.detourOfNodeId, nodeById);
		if (!chain) continue;
		groups.push({
			originNodeId: head.detourOfNodeId,
			headNodeId: chain.headNode.id,
			chainNodeIds: chain.chainNodeIds
		});
	}
	return groups;
}

/**
 * S10.2 — the detour chain (head → … → tail) declared for `originNodeId`, or
 * null when no detour branches from that origin. A one-node detour is a
 * singleton chain.
 */
function findDetourChain(
	document: SceneDocument,
	originNodeId: string,
	nodeById: ReadonlyMap<string, SceneNavigationNode>
): { headNode: SceneNavigationNode; chainNodeIds: string[] } | null {
	const head = document.navigationNodes.find(
		(node) => node.detourOfNodeId === originNodeId
	);
	if (!head) return null;
	const walked = walkFlowComponentFrom(document, head.id, nodeById);
	if (!walked) return null;
	return { headNode: head, chainNodeIds: walked.nodeIds };
}

/** S10.2 — the detour origin a node belongs to, or undefined when it is not on a detour. */
export function detourOriginOf(
	document: SceneDocument,
	nodeId: string,
	nodeById: ReadonlyMap<string, SceneNavigationNode>
): string | undefined {
	const node = nodeById.get(nodeId);
	if (!node) return undefined;
	let cursor = node;
	const seen = new Set([cursor.id]);
	while (cursor.previousNodeId !== undefined) {
		const previous = nodeById.get(cursor.previousNodeId);
		if (!previous || !isFlowNode(previous)) break;
		if (seen.has(previous.id)) break;
		seen.add(previous.id);
		cursor = previous;
	}
	return cursor.detourOfNodeId;
}

/** S10.2 — true when the connection is a detour's return edge (detour tail ↔ origin). */
function isDetourReturnEdge(
	document: SceneDocument,
	connection: SceneConnection
) {
	const nodeById = new Map(document.navigationNodes.map((node) => [node.id, node]));
	for (const node of document.navigationNodes) {
		if (node.detourOfNodeId === undefined) continue;
		const chain = findDetourChain(document, node.detourOfNodeId, nodeById);
		if (!chain) continue;
		const tailId = chain.chainNodeIds.at(-1)!;
		const originId = node.detourOfNodeId;
		if (
			(connection.fromNodeId === tailId && connection.toNodeId === originId) ||
			(connection.fromNodeId === originId && connection.toNodeId === tailId)
		) {
			return true;
		}
	}
	return false;
}

/**
 * S10.1.3 — retained (inactive) connection records: authored connections not
 * used by the main flow chain, not the derived loop record, and not a detour
 * chain transition or return edge. These render as desaturated dashed splines
 * in the Camera viewport with a View-menu visibility toggle.
 */
export function flowRetainedConnectionIds(
	document: SceneDocument
): string[] {
	const activeIds = new Set<string>();
	const flowNodeIds = currentMainFlowNodeIds(document);
	if (flowNodeIds) {
		for (let index = 0; index + 1 < flowNodeIds.length; index += 1) {
			const fromId = flowNodeIds[index];
			const toId = flowNodeIds[index + 1];
			const record = document.connections.find(
				(connection) =>
					(connection.fromNodeId === fromId && connection.toNodeId === toId) ||
					(connection.fromNodeId === toId && connection.toNodeId === fromId)
			);
			if (record) activeIds.add(record.id);
		}
		const loopId = flowLoopConnectionId(document);
		if (loopId) activeIds.add(loopId);
	}
	const nodeById = new Map(document.navigationNodes.map((node) => [node.id, node]));
	for (const node of document.navigationNodes) {
		if (node.detourOfNodeId === undefined) continue;
		const chain = findDetourChain(document, node.detourOfNodeId, nodeById);
		if (!chain) continue;
		for (let index = 0; index + 1 < chain.chainNodeIds.length; index += 1) {
			const fromId = chain.chainNodeIds[index];
			const toId = chain.chainNodeIds[index + 1];
			const record = document.connections.find(
				(connection) =>
					(connection.fromNodeId === fromId && connection.toNodeId === toId) ||
					(connection.fromNodeId === toId && connection.toNodeId === fromId)
			);
			if (record) activeIds.add(record.id);
		}
		const tailId = chain.chainNodeIds.at(-1)!;
		const originId = node.detourOfNodeId;
		const returnRecord = document.connections.find(
			(connection) =>
				(connection.fromNodeId === tailId && connection.toNodeId === originId) ||
				(connection.fromNodeId === originId && connection.toNodeId === tailId)
		);
		if (returnRecord) activeIds.add(returnRecord.id);
	}
	return document.connections
		.filter((connection) => !activeIds.has(connection.id))
		.map((connection) => connection.id);
}

/**
 * Read and validate the document's existing main flow order. The returned
 * display order follows the component head (resolved by `mainFlowStart` —
 * the entrance-start node is preferred as seed but not pinned); detour
 * components are ignored. No document state is changed.
 */
export function validateCurrentGuidedTourOrder(
	document: SceneDocument
): EditorGuidedTourOrderPlan | EditorNavigationGraphFailure {
	const flowNodes = document.navigationNodes.filter(isFlowNode);
	// P1.9 — zero-flow documents are reachable (3+ connected cameras with no
	// sequence never auto-promote). Fail with the D4 floor code instead of
	// letting `mainFlowStart` dereference a missing seed.
	if (flowNodes.length < 2) {
		return fail(
			'minimum_guided_nodes',
			'The camera flow must contain at least two camera nodes'
		);
	}

	const nodeById = new Map(document.navigationNodes.map((node) => [node.id, node]));
	const start = mainFlowStart(document, nodeById);
	const walked = walkFlowComponentFrom(document, start.id, nodeById);
	if (!walked || walked.nodeIds.length < 2) {
		return fail(
			'invalid_guided_cycle',
			'The current camera flow is not one reciprocal open chain'
		);
	}
	return validateGuidedTourOrder(document, walked.nodeIds);
}

/**
 * Pure validation for one complete flow display order. The order is an open
 * chain: every consecutive pair needs a direct connection, but there is NO
 * wraparound pair — the loop is derived from the connection graph, never an
 * order requirement (S10.2).
 */
export function validateGuidedTourOrder(
	document: SceneDocument,
	nodeIds: readonly string[]
): EditorGuidedTourOrderPlan | EditorNavigationGraphFailure {
	const uniqueNodeIds = new Set(nodeIds);
	if (uniqueNodeIds.size !== nodeIds.length) {
		return fail(
			'duplicate_guided_node',
			'A camera node can appear only once in the flow'
		);
	}
	const nodeById = new Map(
		document.navigationNodes.map((node) => [node.id, node])
	);
	for (const nodeId of nodeIds) {
		if (!nodeById.has(nodeId)) {
			return fail('unknown_node', `Camera node is unavailable: ${nodeId}`);
		}
	}
	// P1.8 D1 — the entrance-start pin is retired. The constant survives
	// only as a preferred/default seed in `mainFlowStart` / timeline
	// `findGuidedStart`; it no longer constrains valid sequence structure.

	const missing = missingConsecutiveConnections(document, nodeById, nodeIds);
	if (missing.length > 0) {
		const first = missing[0]!;
		return fail(
			'missing_guided_connection',
			`Missing transition: ${nodeName(nodeById.get(first.fromNodeId)!)} → ${nodeName(nodeById.get(first.toNodeId)!)} — connect them first`
		);
	}
	return { ok: true, nodeIds: [...nodeIds] };
}

/**
 * P1.8 — move one guided node one position up (-1) or down (+1) in a
 * display order. Pure swap; the caller validates the resulting order. Returns
 * null when the move is out of bounds (unknown node, head cannot move up,
 * tail cannot move down). The head is no longer pinned, so the second row
 * may move up to index 0 and the head may move down — both produce a plain
 * reorder (all nodes stay sequenced), distinct from re-root (Set as First).
 */
export function moveGuidedTourNodeIndex(
	nodeIds: readonly string[],
	nodeId: string,
	delta: -1 | 1
): string[] | null {
	const index = nodeIds.indexOf(nodeId);
	const destination = index + delta;
	if (index < 0 || destination < 0 || destination >= nodeIds.length) return null;
	const next = [...nodeIds];
	[next[index], next[destination]] = [next[destination]!, next[index]!];
	return next;
}

/** Consecutive open-chain pairs lacking a direct connection. */
function missingConsecutiveConnections(
	document: SceneDocument,
	nodeById: ReadonlyMap<string, SceneNavigationNode>,
	nodeIds: readonly string[]
) {
	const missing: Array<{ fromNodeId: string; toNodeId: string }> = [];
	for (let index = 0; index + 1 < nodeIds.length; index += 1) {
		const from = nodeById.get(nodeIds[index]!);
		const to = nodeById.get(nodeIds[index + 1]!);
		if (!from || !to) continue;
		if (!findConnectionBetween(document, from.id, to.id)) {
			missing.push({ fromNodeId: from.id, toNodeId: to.id });
		}
	}
	return missing;
}

export type EditorGuidedTourInsertionPlan = EditorGuidedTourOrderPlan;

/**
 * P1.8 D2 — strict: no silent connection creation anywhere, insertion
 * included. A drop whose gap edges are not both present rejects with a copy
 * naming the missing pair. The old `missingConnection` auto-create field
 * is retired.
 */
export function validateGuidedTourInsertion(
	document: SceneDocument,
	nodeId: string,
	index: number
): EditorGuidedTourInsertionPlan | EditorNavigationGraphFailure {
	const node = document.navigationNodes.find((candidate) => candidate.id === nodeId);
	if (!node) return fail('unknown_node', `Camera node is unavailable: ${nodeId}`);
	const current = validateCurrentGuidedTourOrder(document);
	if (!current.ok) return current;
	if (current.nodeIds.includes(node.id)) {
		return fail(
			'node_already_guided',
			`${nodeName(node)} is already in the flow`
		);
	}
	// S10.2 — a detour node cannot be spliced into the main flow in one op
	// (it must first be removed from its detour; the combined move is a
	// separate transaction per the plan's mutation table).
	const detourOrigin = detourOriginOf(
		document,
		node.id,
		new Map(document.navigationNodes.map((candidate) => [candidate.id, candidate]))
	);
	if (node.detourOfNodeId !== undefined || detourOrigin !== undefined) {
		return fail(
			'detour_node_not_free',
			`${nodeName(node)} is on a branch — remove it from the branch first`
		);
	}
	if (!Number.isInteger(index) || index < 0 || index > current.nodeIds.length) {
		return fail(
			'invalid_guided_index',
			'Choose a flow gap'
		);
	}
	const nodeIds = [...current.nodeIds];
	nodeIds.splice(index, 0, node.id);

	const nodeById = new Map(
		document.navigationNodes.map((candidate) => [candidate.id, candidate])
	);
	// P1.8 D2 — strict: any missing gap edge rejects with copy naming the
	// missing pair. No auto-create, no silent topology mutation.
	const missing = missingConsecutiveConnections(document, nodeById, nodeIds);
	if (missing.length > 0) {
		const first = missing[0]!;
		return fail(
			'missing_guided_connection',
			`Cannot insert ${nodeName(node)} here — no connection between ${nodeName(nodeById.get(first.fromNodeId)!)} and ${nodeName(nodeById.get(first.toNodeId)!)}`
		);
	}
	return {
		ok: true,
		nodeIds
	};
}

/** Pure plan for removing one non-start guided node. */
export function validateGuidedTourRemoval(
	document: SceneDocument,
	nodeId: string
): EditorGuidedTourOrderPlan | EditorNavigationGraphFailure {
	const node = document.navigationNodes.find((candidate) => candidate.id === nodeId);
	if (!node) return fail('unknown_node', `Camera node is unavailable: ${nodeId}`);
	const current = validateCurrentGuidedTourOrder(document);
	if (!current.ok) return current;
	if (!current.nodeIds.includes(node.id)) {
		return fail(
			'node_not_guided',
			`${nodeName(node)} is not on the camera flow`
		);
	}
	// P1.8 D1 — head removal is now valid (spec §12 "Head — always valid").
	// The old `protected_guided_start` pin is retired; the remaining order
	// is validated as a connected chain (a two-node chain rejects via the
	// minimum floor below, matching D4).
	return validateGuidedTourOrder(
		document,
		current.nodeIds.filter((candidate) => candidate !== node.id)
	);
}

export type EditorDetourPlan = {
	ok: true;
	originNode: SceneNavigationNode;
	headNode: SceneNavigationNode;
	chainNodeIds: string[];
	headId: string;
	tailId: string;
};

export type EditorDetourNodeRemovalPlan = EditorDetourPlan & {
	node: SceneNavigationNode;
	predecessorNodeId?: string;
	successorNodeId?: string;
};

/**
 * S10.2 — plan a new detour: a free node branches from a main-route origin.
 * The origin–head edge is auto-created by the mutator when missing (F5).
 */
export function validateDetourCreation(
	document: SceneDocument,
	originNodeId: string,
	headNodeId: string
): EditorDetourPlan | EditorNavigationGraphFailure {
	const nodeById = new Map(document.navigationNodes.map((node) => [node.id, node]));
	const origin = nodeById.get(originNodeId);
	if (!origin) return fail('unknown_node', `Camera node is unavailable: ${originNodeId}`);
	const head = nodeById.get(headNodeId);
	if (!head) return fail('unknown_node', `Camera node is unavailable: ${headNodeId}`);
	if (origin.id === head.id) {
		return fail('self_connection', 'A detour cannot branch back to its origin');
	}
	if (isFlowNode(head) || head.detourOfNodeId !== undefined) {
		return fail(
			'detour_node_not_free',
			`${nodeName(head)} is already on a flow`
		);
	}
	// F6 — one detour per origin (an origin's flow-degree never exceeds 2).
	if (document.navigationNodes.some((node) => node.detourOfNodeId === origin.id)) {
		return fail(
			'detour_already_exists',
			`${nodeName(origin)} already heads a branch`
		);
	}
	// F4 — the origin must live on the main route.
	if (!isFlowNode(origin)) {
		return fail(
			'detour_origin_not_on_flow',
			`${nodeName(origin)} is not on the main route`
		);
	}
	const start = mainFlowStart(document, nodeById);
	const walked = walkFlowComponentFrom(document, start.id, nodeById);
	if (!walked || !walked.nodeIds.includes(origin.id)) {
		return fail(
			'detour_origin_not_on_flow',
			`${nodeName(origin)} is not on the main route`
		);
	}
	return {
		ok: true,
		originNode: origin,
		headNode: head,
		chainNodeIds: [head.id],
		headId: head.id,
		tailId: head.id
	};
}

/**
 * S10.2 — plan appending a free node to an existing detour. The mutator
 * auto-creates the tail→new chain edge and the new tail→origin return edge
 * (F5) when missing.
 */
export function validateDetourAppend(
	document: SceneDocument,
	originNodeId: string,
	newNodeId: string
): (EditorDetourPlan & { tailNode: SceneNavigationNode }) | EditorNavigationGraphFailure {
	const nodeById = new Map(document.navigationNodes.map((node) => [node.id, node]));
	const origin = nodeById.get(originNodeId);
	if (!origin) return fail('unknown_node', `Camera node is unavailable: ${originNodeId}`);
	const chain = findDetourChain(document, originNodeId, nodeById);
	if (!chain) {
		return fail('unknown_detour', `No detour branches from ${nodeName(origin)}`);
	}
	const newNode = nodeById.get(newNodeId);
	if (!newNode) return fail('unknown_node', `Camera node is unavailable: ${newNodeId}`);
	if (isFlowNode(newNode) || newNode.detourOfNodeId !== undefined) {
		return fail(
			'detour_node_not_free',
			`${nodeName(newNode)} is already on a flow`
		);
	}
	const tailId = chain.chainNodeIds.at(-1)!;
	return {
		ok: true,
		originNode: origin,
		headNode: chain.headNode,
		chainNodeIds: [...chain.chainNodeIds],
		headId: chain.headNode.id,
		tailId,
		tailNode: nodeById.get(tailId)!
	};
}

/**
 * S10.2 — plan removing one node from a detour chain (order-only; edges stay
 * authored). Strict per T9: when the removal creates a new pred–succ
 * adjacency, that pair must already have a connection.
 */
export function validateDetourNodeRemoval(
	document: SceneDocument,
	originNodeId: string,
	nodeId: string
): EditorDetourNodeRemovalPlan | EditorNavigationGraphFailure {
	const nodeById = new Map(document.navigationNodes.map((node) => [node.id, node]));
	const origin = nodeById.get(originNodeId);
	if (!origin) return fail('unknown_node', `Camera node is unavailable: ${originNodeId}`);
	const chain = findDetourChain(document, originNodeId, nodeById);
	if (!chain) {
		return fail('unknown_detour', `No detour branches from ${nodeName(origin)}`);
	}
	const node = nodeById.get(nodeId);
	if (!node || !chain.chainNodeIds.includes(node.id)) {
		return fail(
			'detour_node_not_in_chain',
			`${node?.label ?? nodeId} is not on the branch at ${nodeName(origin)}`
		);
	}
	const predecessorNodeId = node.previousNodeId;
	const successorNodeId = node.nextNodeId;
	if (predecessorNodeId && successorNodeId) {
		const predecessor = nodeById.get(predecessorNodeId)!;
		const successor = nodeById.get(successorNodeId)!;
		if (!findConnectionBetween(document, predecessor.id, successor.id)) {
			return fail(
				'missing_guided_connection',
				`Missing transition: ${nodeName(predecessor)} → ${nodeName(successor)} — connect them first`
			);
		}
	}
	return {
		ok: true,
		originNode: origin,
		headNode: chain.headNode,
		chainNodeIds: [...chain.chainNodeIds],
		headId: chain.headNode.id,
		tailId: chain.chainNodeIds.at(-1)!,
		node,
		predecessorNodeId,
		successorNodeId
	};
}

/** S10.2 — plan removing a whole detour (chain nodes become free). */
export function validateDetourRemoval(
	document: SceneDocument,
	originNodeId: string
): EditorDetourPlan | EditorNavigationGraphFailure {
	const nodeById = new Map(document.navigationNodes.map((node) => [node.id, node]));
	const origin = nodeById.get(originNodeId);
	if (!origin) return fail('unknown_node', `Camera node is unavailable: ${originNodeId}`);
	const chain = findDetourChain(document, originNodeId, nodeById);
	if (!chain) {
		return fail('unknown_detour', `No detour branches from ${nodeName(origin)}`);
	}
	return {
		ok: true,
		originNode: origin,
		headNode: chain.headNode,
		chainNodeIds: [...chain.chainNodeIds],
		headId: chain.headNode.id,
		tailId: chain.chainNodeIds.at(-1)!
	};
}
/** Pure validation for one new undirected camera connection. */
export function validateConnectionCreation(
	document: SceneDocument,
	sourceNodeId: string,
	destinationNodeId: string
): EditorConnectionCreationPlan | EditorNavigationGraphFailure {
	const sourceNode = document.navigationNodes.find(
		(node) => node.id === sourceNodeId
	);
	if (!sourceNode) {
		return fail('unknown_source_node', `Source camera node is unavailable: ${sourceNodeId}`);
	}
	const destinationNode = document.navigationNodes.find(
		(node) => node.id === destinationNodeId
	);
	if (!destinationNode) {
		return fail(
			'unknown_destination_node',
			`Destination camera node is unavailable: ${destinationNodeId}`
		);
	}
	if (sourceNode.id === destinationNode.id) {
		return fail('self_connection', 'A camera node cannot connect to itself');
	}
	if (findConnectionBetween(document, sourceNode.id, destinationNode.id)) {
		return fail('duplicate_connection', 'These camera nodes are already connected');
	}
	return { ok: true, sourceNode, destinationNode };
}

/**
 * A two-node sequence has no removable sequence membership of its own: its
 * only chain edge is also the only connection that keeps the pair sequenced.
 * Deleting that edge is therefore an explicit, reversible transition back to
 * two Unsequenced cameras rather than a rejected guided-edge deletion.
 */
function isFinalTwoNodeFlowConnection(
	document: SceneDocument,
	connection: SceneConnection
): boolean {
	const flowNodeIds = currentMainFlowNodeIds(document);
	if (!flowNodeIds || flowNodeIds.length !== 2) return false;
	const [headId, tailId] = flowNodeIds;
	if (!headId || !tailId) return false;
	return findConnectionBetween(document, headId, tailId)?.id === connection.id;
}

/** Pure validation for deleting one connection without changing guided order. */
export function validateConnectionDeletion(
	document: SceneDocument,
	connectionId: string
): EditorConnectionDeletionPlan | EditorNavigationGraphFailure {
	const connection = document.connections.find(
		(candidate) => candidate.id === connectionId
	);
	if (!connection) {
		return fail('unknown_connection', `Camera connection is unavailable: ${connectionId}`);
	}
	const fromNode = document.navigationNodes.find(
		(node) => node.id === connection.fromNodeId
	)!;
	const toNode = document.navigationNodes.find(
		(node) => node.id === connection.toNodeId
	)!;
	const dissolvesGuidedFlow = isFinalTwoNodeFlowConnection(document, connection);
	if (
		!dissolvesGuidedFlow &&
		(fromNode.nextNodeId === toNode.id ||
			fromNode.previousNodeId === toNode.id ||
			toNode.nextNodeId === fromNode.id ||
			toNode.previousNodeId === fromNode.id)
	) {
		return fail(
			'guided_connection',
			`Cannot delete ${connection.id}: the flow order requires the edge between ${nodeName(fromNode)} and ${nodeName(toNode)}`
		);
	}
	// S10.2 — a detour's return edge (tail ↔ origin) is flow-critical even
	// though the endpoints carry no order link to each other.
	if (isDetourReturnEdge(document, connection)) {
		return fail(
			'guided_connection',
			`Cannot delete ${connection.id}: the edge returns a branch to its origin`
		);
	}
	if (
		!dissolvesGuidedFlow &&
		!graphRemainsConnected(
			document,
			new Set(),
			new Set([connection.id])
		)
	) {
		return fail(
			'disconnected_graph',
			`Cannot delete ${connection.id}: the navigation graph would become disconnected`
		);
	}
	return {
		ok: true,
		connection,
		...(dissolvesGuidedFlow ? { dissolvesGuidedFlow: true } : {})
	};
}

/**
 * Pure validation and rewrite plan for one camera node deletion.
 *
 * S10.2 — open-chain semantics: a flow node's splice may end at the chain
 * head or tail (no predecessor / no successor), the affected chain must be a
 * valid open chain (or legacy closed cycle) right now, and the new
 * pred–succ adjacency needs a direct connection (T9, strict). Deleting a
 * detour origin or a detour head deletes the whole detour chain with it
 * (one transaction, one status message).
 */
export function validateNavigationNodeDeletion(
	document: SceneDocument,
	nodeId: string
): EditorNavigationNodeDeletionPlan | EditorNavigationGraphFailure {
	const node = document.navigationNodes.find((candidate) => candidate.id === nodeId);
	if (!node) {
		return fail('unknown_node', `Camera node is unavailable: ${nodeId}`);
	}
	const nodeById = new Map(
		document.navigationNodes.map((candidate) => [candidate.id, candidate])
	);

	// S10.2 — whole-detour deletion: the deleted node is a detour head (the
	// rest of the chain would be orphaned) or a detour origin (F5 chains
	// branch only from it).
	let detourChainNodeIds: string[] | undefined;
	let detourOriginNodeId: string | undefined;
	if (node.detourOfNodeId !== undefined) {
		detourOriginNodeId = node.detourOfNodeId;
		const chain = findDetourChain(document, node.detourOfNodeId, nodeById);
		if (chain) {
			detourChainNodeIds = chain.chainNodeIds.filter(
				(candidate) => candidate !== node.id
			);
		}
	} else {
		const originOf = document.navigationNodes.find(
			(candidate) => candidate.detourOfNodeId === node.id
		);
		if (originOf) {
			detourOriginNodeId = node.id;
			const chain = findDetourChain(document, node.id, nodeById);
			detourChainNodeIds = chain?.chainNodeIds;
		}
	}

	const deletedNodeIds = new Set([node.id, ...(detourChainNodeIds ?? [])]);
	const incidentConnectionIds = document.connections
		.filter(
			(connection) =>
				deletedNodeIds.has(connection.fromNodeId) ||
				deletedNodeIds.has(connection.toNodeId)
		)
		.map((connection) => connection.id);
	const incidentConnectionIdSet = new Set(incidentConnectionIds);

	const onFlow = isFlowNode(node) || node.detourOfNodeId !== undefined;
	if (!onFlow) {
		if (
			!graphRemainsConnected(
				document,
				deletedNodeIds,
				incidentConnectionIdSet
			)
		) {
			return fail(
				'disconnected_graph',
				`Cannot delete ${nodeName(node)}: the remaining navigation graph would become disconnected`
			);
		}
		return { ok: true, node, incidentConnectionIds };
	}

	// The affected flow component must be a valid open chain (or legacy
	// closed cycle) right now — never splice a broken order.
	const mainFlow = currentMainFlowNodeIds(document);
	const nodeOnMainFlow = mainFlow?.includes(node.id) ?? false;
	if (nodeOnMainFlow) {
	} else if (isFlowNode(node) && mainFlow === null) {
		return fail(
			'invalid_guided_cycle',
			`Cannot delete ${nodeName(node)}: the camera flow order is not a valid open chain`
		);
	}
	if (!nodeOnMainFlow && (isFlowNode(node) || node.detourOfNodeId !== undefined)) {
		// Detour chain node — the chain itself must be intact.
		const originId = node.detourOfNodeId ?? detourOriginOf(document, node.id, nodeById);
		const chain = originId ? findDetourChain(document, originId, nodeById) : null;
		if (!chain) {
			return fail(
				'invalid_guided_cycle',
				`Cannot delete ${nodeName(node)}: the branch order is not a valid open chain`
			);
		}
	}

	const predecessorNodeId = node.previousNodeId;
	const successorNodeId = node.nextNodeId;
	if (predecessorNodeId && successorNodeId) {
		const predecessor = nodeById.get(predecessorNodeId)!;
		const successor = nodeById.get(successorNodeId)!;
		if (
			!findConnectionBetween(
				document,
				predecessor.id,
				successor.id,
				incidentConnectionIdSet
			)
		) {
			return fail(
				'missing_guided_bridge',
				`Cannot delete ${nodeName(node)}: guided predecessor ${nodeName(predecessor)} and successor ${nodeName(successor)} need a direct connection`
			);
		}
	}
	if (
		!graphRemainsConnected(
			document,
			deletedNodeIds,
			incidentConnectionIdSet
		)
	) {
		return fail(
			'disconnected_graph',
			`Cannot delete ${nodeName(node)}: the remaining navigation graph would become disconnected`
		);
	}
	return {
		ok: true,
		node,
		incidentConnectionIds,
		predecessorNodeId,
		successorNodeId,
		detourChainNodeIds,
		detourOriginNodeId
	};
}
