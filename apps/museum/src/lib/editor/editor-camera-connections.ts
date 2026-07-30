import type { MuseumSceneDocument } from '$lib/content/scene';

export type NodeConnectionBucket = 'outgoing' | 'incoming';

export type NodeConnectionRow = {
	bucket: NodeConnectionBucket;
	connectionId: string;
	partnerId: string;
	partnerRoomId: string;
	anchorsCount: number;
	kind: 'rounded-polyline' | 'auto-bezier';
	clearance: number;
	keyCounts: {
		forward: number;
		reverse: number;
		total: number;
	};
};

export type NodeConnections = {
	outgoing: NodeConnectionRow[];
	incoming: NodeConnectionRow[];
};

/**
 * Bucket a node's connections into outgoing (from this node) and incoming (to this node).
 * Partner rows whose navigation node is no longer in the document are skipped so the
 * list stays readable. Each bucket is sorted by `connectionId` for stable row order.
 */
export function getNodeConnections(
	document: MuseumSceneDocument,
	nodeId: string
): NodeConnections {
	const nodes = new Map(
		document.navigationNodes.map((node) => [node.id, node])
	);
	const outgoing: NodeConnectionRow[] = [];
	const incoming: NodeConnectionRow[] = [];
	for (const connection of document.connections) {
		const isOutgoing = connection.fromNodeId === nodeId;
		const isIncoming = connection.toNodeId === nodeId;
		if (!isOutgoing && !isIncoming) continue;
		const partnerId = isOutgoing
			? connection.toNodeId
			: connection.fromNodeId;
		const partner = nodes.get(partnerId);
		if (!partner) continue;
		const forward = connection.viewTracks?.forward ?? [];
		const reverse = connection.viewTracks?.reverse ?? [];
		const row: NodeConnectionRow = {
			bucket: isOutgoing ? 'outgoing' : 'incoming',
			connectionId: connection.id,
			partnerId,
			partnerRoomId: partner.roomId,
			anchorsCount: connection.positionPath.anchors.length,
			kind: connection.positionPath.kind,
			clearance: connection.clearance,
			keyCounts: {
				forward: forward.length,
				reverse: reverse.length,
				total: forward.length + reverse.length
			}
		};
		(isOutgoing ? outgoing : incoming).push(row);
	}
	outgoing.sort((a, b) => a.connectionId.localeCompare(b.connectionId));
	incoming.sort((a, b) => a.connectionId.localeCompare(b.connectionId));
	return { outgoing, incoming };
}
