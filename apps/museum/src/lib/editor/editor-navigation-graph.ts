import type {
	MuseumSceneDocument,
	SceneConnection,
	SceneNavigationNode
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
	| 'missing_guided_start'
	| 'guided_start_not_first'
	| 'missing_guided_connection'
	| 'node_already_guided'
	| 'node_not_guided'
	| 'protected_guided_start'
	| 'invalid_guided_index';

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
};

export type EditorNavigationNodeDeletionPlan = {
	ok: true;
	node: SceneNavigationNode;
	incidentConnectionIds: string[];
	predecessorNodeId?: string;
	successorNodeId?: string;
};

export type EditorGuidedTourOrderPlan = {
	ok: true;
	nodeIds: string[];
};

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

function isGuidedNode(node: SceneNavigationNode) {
	return node.nextNodeId !== undefined && node.previousNodeId !== undefined;
}

function findConnectionBetween(
	document: MuseumSceneDocument,
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
	document: MuseumSceneDocument,
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
	const queue = [remainingNodeIds[0]!];
	while (queue.length > 0) {
		const nodeId = queue.shift()!;
		if (visited.has(nodeId)) continue;
		visited.add(nodeId);
		for (const neighborId of adjacency.get(nodeId) ?? []) {
			if (!visited.has(neighborId)) queue.push(neighborId);
		}
	}
	return visited.size === remainingNodeIds.length;
}

function guidedCycleRemainsValid(
	document: MuseumSceneDocument,
	deletedNodeId: string,
	predecessorNodeId: string,
	successorNodeId: string,
	excludedConnectionIds: ReadonlySet<string>
) {
	const guidedNodes = document.navigationNodes.filter(
		(node) => node.id !== deletedNodeId && isGuidedNode(node)
	);
	const guidedById = new Map(guidedNodes.map((node) => [node.id, node]));
	const readNext = (node: SceneNavigationNode) =>
		node.id === predecessorNodeId ? successorNodeId : node.nextNodeId;
	const readPrevious = (node: SceneNavigationNode) =>
		node.id === successorNodeId ? predecessorNodeId : node.previousNodeId;

	for (const node of guidedNodes) {
		const nextNodeId = readNext(node);
		const previousNodeId = readPrevious(node);
		if (!nextNodeId || !previousNodeId) return false;
		const next = guidedById.get(nextNodeId);
		const previous = guidedById.get(previousNodeId);
		if (!next || !previous) return false;
		if (readPrevious(next) !== node.id || readNext(previous) !== node.id) {
			return false;
		}
		if (
			!findConnectionBetween(
				document,
				node.id,
				nextNodeId,
				excludedConnectionIds
			)
		) {
			return false;
		}
	}

	const start = guidedNodes[0];
	if (!start) return false;
	const visited = new Set<string>();
	let cursor: SceneNavigationNode | undefined = start;
	while (cursor && !visited.has(cursor.id)) {
		visited.add(cursor.id);
		const nextNodeId = readNext(cursor);
		cursor = nextNodeId ? guidedById.get(nextNodeId) : undefined;
	}
	return visited.size === guidedNodes.length && cursor?.id === start.id;
}

/**
 * Read and validate the document's existing reciprocal guided cycle. The
 * returned display order is pinned to entrance-start whenever that node is
 * guided; no document state is changed.
 */
export function validateCurrentGuidedTourOrder(
	document: MuseumSceneDocument
): EditorGuidedTourOrderPlan | EditorNavigationGraphFailure {
	const guidedNodes = document.navigationNodes.filter(isGuidedNode);
	if (guidedNodes.length < 2) {
		return fail(
			'minimum_guided_nodes',
			'The guided tour must contain at least two camera nodes'
		);
	}
	const guidedById = new Map(guidedNodes.map((node) => [node.id, node]));
	const start =
		guidedById.get(EDITOR_GUIDED_TOUR_START_NODE_ID) ?? guidedNodes[0]!;
	const nodeIds: string[] = [];
	const visited = new Set<string>();
	let cursor: SceneNavigationNode | undefined = start;
	while (cursor && !visited.has(cursor.id)) {
		visited.add(cursor.id);
		nodeIds.push(cursor.id);
		const nextNodeId: string | undefined = cursor.nextNodeId;
		const next: SceneNavigationNode | undefined = nextNodeId
			? guidedById.get(nextNodeId)
			: undefined;
		if (!next || next.previousNodeId !== cursor.id) {
			return fail(
				'invalid_guided_cycle',
				'The current guided tour is not one reciprocal cycle'
			);
		}
		cursor = next;
	}
	if (cursor?.id !== start.id || visited.size !== guidedNodes.length) {
		return fail(
			'invalid_guided_cycle',
			'The current guided tour is not one reciprocal cycle'
		);
	}
	return validateGuidedTourOrder(document, nodeIds);
}

/** Pure validation for one complete guided display order and its return edge. */
export function validateGuidedTourOrder(
	document: MuseumSceneDocument,
	nodeIds: readonly string[]
): EditorGuidedTourOrderPlan | EditorNavigationGraphFailure {
	if (nodeIds.length < 2) {
		return fail(
			'minimum_guided_nodes',
			'The guided tour must contain at least two camera nodes'
		);
	}
	const uniqueNodeIds = new Set(nodeIds);
	if (uniqueNodeIds.size !== nodeIds.length) {
		return fail(
			'duplicate_guided_node',
			'A camera node can appear only once in the guided tour'
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
	if (nodeById.has(EDITOR_GUIDED_TOUR_START_NODE_ID)) {
		if (!uniqueNodeIds.has(EDITOR_GUIDED_TOUR_START_NODE_ID)) {
			return fail(
				'missing_guided_start',
				`The guided tour must include ${EDITOR_GUIDED_TOUR_START_NODE_ID}`
			);
		}
		if (nodeIds[0] !== EDITOR_GUIDED_TOUR_START_NODE_ID) {
			return fail(
				'guided_start_not_first',
				`Guided display order must start at ${EDITOR_GUIDED_TOUR_START_NODE_ID}`
			);
		}
	}

	for (let index = 0; index < nodeIds.length; index += 1) {
		const from = nodeById.get(nodeIds[index]!)!;
		const to = nodeById.get(nodeIds[(index + 1) % nodeIds.length]!)!;
		if (!findConnectionBetween(document, from.id, to.id)) {
			return fail(
				'missing_guided_connection',
				`Guided neighbors ${nodeName(from)} and ${nodeName(to)} need a direct connection`
			);
		}
	}
	return { ok: true, nodeIds: [...nodeIds] };
}

/** Pure plan for inserting one free node at a display-order gap. */
export function validateGuidedTourInsertion(
	document: MuseumSceneDocument,
	nodeId: string,
	index: number
): EditorGuidedTourOrderPlan | EditorNavigationGraphFailure {
	const node = document.navigationNodes.find((candidate) => candidate.id === nodeId);
	if (!node) return fail('unknown_node', `Camera node is unavailable: ${nodeId}`);
	const current = validateCurrentGuidedTourOrder(document);
	if (!current.ok) return current;
	if (current.nodeIds.includes(node.id)) {
		return fail(
			'node_already_guided',
			`${nodeName(node)} is already in the guided tour`
		);
	}
	if (!Number.isInteger(index) || index < 1 || index > current.nodeIds.length) {
		return fail(
			'invalid_guided_index',
			'Choose a guided-tour gap after the pinned start'
		);
	}
	const nodeIds = [...current.nodeIds];
	nodeIds.splice(index, 0, node.id);
	return validateGuidedTourOrder(document, nodeIds);
}

/** Pure plan for removing one non-start guided node. */
export function validateGuidedTourRemoval(
	document: MuseumSceneDocument,
	nodeId: string
): EditorGuidedTourOrderPlan | EditorNavigationGraphFailure {
	const node = document.navigationNodes.find((candidate) => candidate.id === nodeId);
	if (!node) return fail('unknown_node', `Camera node is unavailable: ${nodeId}`);
	const current = validateCurrentGuidedTourOrder(document);
	if (!current.ok) return current;
	if (!current.nodeIds.includes(node.id)) {
		return fail(
			'node_not_guided',
			`${nodeName(node)} is not in the guided tour`
		);
	}
	if (node.id === current.nodeIds[0]) {
		return fail(
			'protected_guided_start',
			`Cannot remove ${nodeName(node)}: the guided display start is pinned`
		);
	}
	return validateGuidedTourOrder(
		document,
		current.nodeIds.filter((candidate) => candidate !== node.id)
	);
}

/** Pure validation for one new undirected camera connection. */
export function validateConnectionCreation(
	document: MuseumSceneDocument,
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

/** Pure validation for deleting one connection without changing guided order. */
export function validateConnectionDeletion(
	document: MuseumSceneDocument,
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
	if (
		fromNode.nextNodeId === toNode.id ||
		fromNode.previousNodeId === toNode.id ||
		toNode.nextNodeId === fromNode.id ||
		toNode.previousNodeId === fromNode.id
	) {
		return fail(
			'guided_connection',
			`Cannot delete ${connection.id}: guided order requires the edge between ${nodeName(fromNode)} and ${nodeName(toNode)}`
		);
	}
	if (
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
	return { ok: true, connection };
}

/** Pure validation and rewrite plan for one free or guided camera node deletion. */
export function validateNavigationNodeDeletion(
	document: MuseumSceneDocument,
	nodeId: string
): EditorNavigationNodeDeletionPlan | EditorNavigationGraphFailure {
	const node = document.navigationNodes.find((candidate) => candidate.id === nodeId);
	if (!node) {
		return fail('unknown_node', `Camera node is unavailable: ${nodeId}`);
	}
	const incidentConnections = document.connections.filter(
		(connection) =>
			connection.fromNodeId === node.id || connection.toNodeId === node.id
	);
	const incidentConnectionIds = incidentConnections.map(
		(connection) => connection.id
	);
	const incidentConnectionIdSet = new Set(incidentConnectionIds);
	const excludedNodeIds = new Set([node.id]);

	if (!isGuidedNode(node)) {
		if (
			!graphRemainsConnected(
				document,
				excludedNodeIds,
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

	const guidedNodeCount = document.navigationNodes.filter(isGuidedNode).length;
	if (guidedNodeCount - 1 < 2) {
		return fail(
			'minimum_guided_nodes',
			`Cannot delete ${nodeName(node)}: the guided tour must retain at least two nodes`
		);
	}
	const predecessorNodeId = node.previousNodeId!;
	const successorNodeId = node.nextNodeId!;
	const predecessor = document.navigationNodes.find(
		(candidate) => candidate.id === predecessorNodeId
	)!;
	const successor = document.navigationNodes.find(
		(candidate) => candidate.id === successorNodeId
	)!;
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
	if (
		!guidedCycleRemainsValid(
			document,
			node.id,
			predecessor.id,
			successor.id,
			incidentConnectionIdSet
		)
	) {
		return fail(
			'invalid_guided_cycle',
			`Cannot delete ${nodeName(node)}: the reciprocal guided cycle would become invalid`
		);
	}
	if (
		!graphRemainsConnected(
			document,
			excludedNodeIds,
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
		successorNodeId
	};
}
