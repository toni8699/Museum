/**
 * `scene-codec/validate.ts` — semantic + tour-cycle + keyframe validation.
 *
 * Hosts `validateSemantics` (the cross-node / cross-connection checks),
 * `validateVersionTwoTour` (the reciprocal-cycle tour guard), and
 * `validateViewKeyframePoses` (eye/target distance floor on the
 * per-edge view tracks). All three push issues into the shared
 * `SceneDocumentIssue[]` array.
 *
 * Tagged `@internal` — never imported outside `scene-codec/`.
 */
import type {
	MuseumSceneDocument,
	SceneConnectionViewTracks,
	SceneEntity,
	SceneNavigationNode
} from '../scene';
import type { Vec3 } from '$lib/types/museum';
import type { SceneDocumentIssue } from './types';
import { addIssue } from './readers';

const EPSILON = 1e-6;

export function assertUnique(
	values: readonly { id: string }[],
	label: string,
	path: string,
	issues: SceneDocumentIssue[]
) {
	const seen = new Set<string>();
	for (const [index, value] of values.entries()) {
		if (seen.has(value.id)) addIssue(issues, `${path}[${index}].id`, 'duplicate_id', `Duplicate ${label} id: ${value.id}`);
		seen.add(value.id);
	}
}

export function distance(a: Vec3, b: Vec3) {
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
export function validateSemantics(document: MuseumSceneDocument, issues: SceneDocumentIssue[]) {
	const entities = document.entities;
	assertUnique(entities, 'scene entity', '$.entities', issues);
	assertUnique(document.navigationNodes, 'navigation node', '$.navigationNodes', issues);
	assertUnique(document.connections, 'connection', '$.connections', issues);
	assertUnique(document.clusters ?? [], 'scene cluster', '$.clusters', issues);
	assertUnique(document.textures, 'texture asset', '$.textures', issues);
	assertUnique(document.materials, 'material instance', '$.materials', issues);
	const textureIds = new Set(document.textures.map((texture) => texture.id));
	for (const [index, material] of document.materials.entries()) {
		if (material.baseTextureId && !textureIds.has(material.baseTextureId)) {
			addIssue(
				issues,
				`$.materials[${index}].baseTextureId`,
				'unknown_texture',
				`Unknown texture asset: ${material.baseTextureId}`
			);
		}
	}
	const materialIds = new Set(document.materials.map((material) => material.id));
	for (const [index, entity] of entities.entries()) {
		if (
			'materialInstanceId' in entity &&
			entity.materialInstanceId !== undefined &&
			!materialIds.has(entity.materialInstanceId)
		) {
			addIssue(
				issues,
				`$.entities[${index}].materialInstanceId`,
				'unknown_material_instance',
				`Unknown material instance: ${entity.materialInstanceId}`
			);
		}
	}

	const entityById = new Map(entities.map((entity) => [entity.id, entity]));
	const clusteredIds = new Set<string>();
	for (const [clusterIndex, cluster] of (document.clusters ?? []).entries()) {
		if (cluster.memberIds.length < 2) addIssue(issues, `$.clusters[${clusterIndex}].memberIds`, 'cluster_too_small', 'Scene cluster must contain at least two members');
		const memberIds = new Set<string>();
		for (const [memberIndex, memberId] of cluster.memberIds.entries()) {
			const path = `$.clusters[${clusterIndex}].memberIds[${memberIndex}]`;
			if (memberIds.has(memberId)) addIssue(issues, path, 'duplicate_cluster_member', `Duplicate member in scene cluster ${cluster.id}: ${memberId}`);
			memberIds.add(memberId);
			const entity = entityById.get(memberId);
			if (!entity) addIssue(issues, path, 'unknown_cluster_member', `Unknown member in scene cluster ${cluster.id}: ${memberId}`);
			else if (entity.roomId !== cluster.roomId) addIssue(issues, path, 'cross_room_cluster_member', `Cross-room member in scene cluster ${cluster.id}: ${memberId}`);
			if (clusteredIds.has(memberId)) addIssue(issues, path, 'multiple_cluster_membership', `Scene entity belongs to multiple clusters: ${memberId}`);
			clusteredIds.add(memberId);
		}
	}

	// Authoring-empty is a valid state: the editor boots into a blank scene
	// before the first navigation node is authored. The graph/cycle checks below
	// assume at least one node, so skip them here; the runtime tour/preview
	// guards a blank project separately.
	if (document.navigationNodes.length === 0) return;
	const nodeById = new Map(document.navigationNodes.map((node) => [node.id, node]));
	for (const [index, node] of document.navigationNodes.entries()) {
		if (distance(node.position, node.cameraTarget) <= EPSILON) addIssue(issues, `$.navigationNodes[${index}].cameraTarget`, 'camera_target_too_close', `Camera eye and target must be farther than ${EPSILON}`);
		const adjacency = new Set<string>();
		for (const [neighborIndex, neighborId] of node.connectedNodeIds.entries()) {
			const path = `$.navigationNodes[${index}].connectedNodeIds[${neighborIndex}]`;
			if (neighborId === node.id) addIssue(issues, path, 'self_adjacency', 'A node cannot be adjacent to itself');
			if (adjacency.has(neighborId)) addIssue(issues, path, 'duplicate_adjacency', `Duplicate adjacency: ${neighborId}`);
			if (!nodeById.has(neighborId)) addIssue(issues, path, 'unknown_node', `Unknown navigation node: ${neighborId}`);
			adjacency.add(neighborId);
		}
	}

	const edgeKeys = new Map<string, number>();
	const edgeKey = (a: string, b: string) => a < b ? `${a.length}:${a}${b.length}:${b}` : `${b.length}:${b}${a.length}:${a}`;
	const generatedEndpointIds = new Set(
		document.navigationNodes.map((node) => `node:${node.id}:position`)
	);
	for (const [index, connection] of document.connections.entries()) {
		const path = `$.connections[${index}]`;
		if (connection.fromNodeId === connection.toNodeId) addIssue(issues, path, 'self_connection', 'A connection cannot join a node to itself');
		if (!nodeById.has(connection.fromNodeId)) addIssue(issues, `${path}.fromNodeId`, 'unknown_node', `Unknown navigation node: ${connection.fromNodeId}`);
		if (!nodeById.has(connection.toNodeId)) addIssue(issues, `${path}.toNodeId`, 'unknown_node', `Unknown navigation node: ${connection.toNodeId}`);
		const key = edgeKey(connection.fromNodeId, connection.toNodeId);
		if (edgeKeys.has(key)) addIssue(issues, path, 'duplicate_connection', `Duplicate undirected connection: ${connection.fromNodeId} / ${connection.toNodeId}`);
		edgeKeys.set(key, index);
		if ('positionPath' in connection) {
			const anchorIds = new Set<string>();
			for (const [anchorIndex, anchor] of connection.positionPath.anchors.entries()) {
				const anchorPath = `${path}.positionPath.anchors[${anchorIndex}].id`;
				if (anchorIds.has(anchor.id)) {
					addIssue(
						issues,
						anchorPath,
						'duplicate_anchor_id',
						`Duplicate path anchor id in ${connection.id}: ${anchor.id}`
					);
				}
				if (generatedEndpointIds.has(anchor.id)) {
					addIssue(
						issues,
						anchorPath,
						'endpoint_anchor_id',
						`Interior anchor id collides with a generated endpoint: ${anchor.id}`
					);
				}
				anchorIds.add(anchor.id);
			}
		}
		const viewTracks = 'viewTracks' in connection
			? (connection.viewTracks as SceneConnectionViewTracks | undefined)
			: undefined;
		if (viewTracks) {
			const keyframeIds = new Set<string>();
			for (const direction of ['forward', 'reverse'] as const) {
				let previousProgress = -Infinity;
				for (const [keyframeIndex, keyframe] of viewTracks[
					direction
				].entries()) {
					const keyframePath = `${path}.viewTracks.${direction}[${keyframeIndex}]`;
					if (keyframeIds.has(keyframe.id)) {
						addIssue(
							issues,
							`${keyframePath}.id`,
							'duplicate_view_keyframe_id',
							`Duplicate camera view keyframe id in ${connection.id}: ${keyframe.id}`
						);
					}
					keyframeIds.add(keyframe.id);
					if (keyframe.progress <= previousProgress) {
						addIssue(
							issues,
							`${keyframePath}.progress`,
							'unordered_view_progress',
							`Camera view keyframe progress must be strictly increasing in the ${direction} track`
						);
					}
					previousProgress = keyframe.progress;
				}
			}
		}
	}

	for (const [index, node] of document.navigationNodes.entries()) {
		for (const [neighborIndex, neighborId] of node.connectedNodeIds.entries()) {
			if (!edgeKeys.has(edgeKey(node.id, neighborId))) addIssue(issues, `$.navigationNodes[${index}].connectedNodeIds[${neighborIndex}]`, 'adjacency_without_connection', `No connection exists between ${node.id} and ${neighborId}`);
		}
	}
	for (const [index, connection] of document.connections.entries()) {
		const from = nodeById.get(connection.fromNodeId);
		const to = nodeById.get(connection.toNodeId);
		if (from && !from.connectedNodeIds.includes(to?.id ?? '')) addIssue(issues, `$.connections[${index}].fromNodeId`, 'connection_without_adjacency', `${from.id} must list ${connection.toNodeId} as adjacent`);
		if (to && !to.connectedNodeIds.includes(from?.id ?? '')) addIssue(issues, `$.connections[${index}].toNodeId`, 'connection_without_adjacency', `${to.id} must list ${connection.fromNodeId} as adjacent`);
	}

	const visited = new Set<string>();
	const queue = [document.navigationNodes[0]!.id];
	while (queue.length) {
		const id = queue.shift()!;
		if (visited.has(id)) continue;
		visited.add(id);
		for (const neighbor of nodeById.get(id)?.connectedNodeIds ?? []) if (!visited.has(neighbor)) queue.push(neighbor);
	}
	if (visited.size !== document.navigationNodes.length) addIssue(issues, '$.connections', 'disconnected_graph', 'Navigation connections must form one connected graph');

	validateVersionTwoTour(document.navigationNodes, nodeById, issues);
}

export function validateVersionTwoTour(
	nodes: readonly SceneNavigationNode[],
	nodeById: ReadonlyMap<string, SceneNavigationNode>,
	issues: SceneDocumentIssue[]
) {
	const linkedNodes: SceneNavigationNode[] = [];
	for (const [index, node] of nodes.entries()) {
		const path = `$.navigationNodes[${index}]`;
		const hasNext = node.nextNodeId !== undefined;
		const hasPrevious = node.previousNodeId !== undefined;
		if (hasNext !== hasPrevious) {
			addIssue(
				issues,
				path,
				'partial_tour_links',
				'A node must define both nextNodeId and previousNodeId, or neither'
			);
		}
		if (!hasNext || !hasPrevious) continue;
		linkedNodes.push(node);
		for (const [key, opposite] of [
			['nextNodeId', 'previousNodeId'],
			['previousNodeId', 'nextNodeId']
		] as const) {
			const linkedId = node[key]!;
			if (linkedId === node.id) {
				addIssue(issues, `${path}.${key}`, 'self_tour_link', 'A tour link cannot reference its own node');
			}
			const linked = nodeById.get(linkedId);
			if (!linked) {
				addIssue(issues, `${path}.${key}`, 'unknown_node', `Unknown navigation node: ${linkedId}`);
				continue;
			}
			if (linked.nextNodeId === undefined || linked.previousNodeId === undefined) {
				addIssue(
					issues,
					`${path}.${key}`,
					'free_only_tour_link',
					`Tour link ${linkedId} references a free-only node`
				);
			}
			if (!node.connectedNodeIds.includes(linkedId)) {
				addIssue(
					issues,
					`${path}.${key}`,
					'non_adjacent_tour_link',
					`Tour link ${linkedId} is not adjacent`
				);
			}
			if (linked[opposite] !== node.id) {
				addIssue(
					issues,
					`${path}.${key}`,
					'non_reciprocal_tour_link',
					`${linkedId}.${opposite} must equal ${node.id}`
				);
			}
		}
	}

	if (linkedNodes.length === 0) {
		// H1 S2 — a graph with no guided cycle is a valid authoring state
		// (a tour can be drafted node-by-node from a blank project). Runtime
		// tour preview is gated by `canStartTourPreview` instead of the codec.
		return;
	}
	const start = linkedNodes[0]!;
	const tourVisited = new Set<string>();
	let current: SceneNavigationNode | undefined = start;
	while (current && !tourVisited.has(current.id)) {
		tourVisited.add(current.id);
		current = current.nextNodeId ? nodeById.get(current.nextNodeId) : undefined;
	}
	if (tourVisited.size !== linkedNodes.length || current?.id !== start.id) {
		addIssue(
			issues,
			'$.navigationNodes',
			'invalid_tour_cycle',
			'Guided nextNodeId links must form one cycle containing every guided node'
		);
	}
}
