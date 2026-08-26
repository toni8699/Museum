import type {
	PlanCameraAuthoringProjection,
	PlanRenderModel,
	PlanStyleToken
} from '$lib/layout/plan-render-model';
import type { CameraPlanHit } from './camera-plan-hit';

/**
 * Pure post-model Camera Plan hover application (P1.5). Pointer moves update
 * `cameraPlan.hover` on every move, so feeding hover into the authoring
 * projection would re-run the whole document resolve + draft-curve sampling +
 * per-direction motion builds on every pointer move. Instead the committed
 * projection is hover-free and this remaps the already-built render model's
 * camera tokens by stable primitive key — one O(primitives) mapping with no
 * geometry or motion work. Token precedence mirrors the model builder:
 * selected wins over hovered, and retained edges keep their dashed/desaturated
 * identity while receiving selected/hovered state tokens.
 * A stale/missing hover identity or a `null` hover is a no-op that returns the
 * input model unchanged (no allocation, no re-render).
 */

/**
 * Resolve the hovered primitive keys to their target hover tokens. Selected
 * primitives keep their selected token; retained edges use a retained-hovered
 * token so their dashed/desaturated base remains distinguishable.
 */
function hoverTargetKeys(
	authoring: PlanCameraAuthoringProjection | undefined,
	hover: CameraPlanHit
): Map<string, PlanStyleToken> {
	const targets = new Map<string, PlanStyleToken>();
	if (!authoring || !hover) return targets;
	if (hover.kind === 'node') {
		const node = authoring.nodes.find((candidate) => candidate.nodeId === hover.nodeId);
		if (node && !node.selected) targets.set(node.key, 'camera-node-hovered');
	} else if (hover.kind === 'edge') {
		const connection = authoring.connections.find(
			(candidate) => candidate.connectionId === hover.connectionId
		);
		if (connection && !connection.selected) {
			targets.set(
				connection.key,
				connection.retained ? 'camera-edge-retained-hovered' : 'camera-edge-hovered'
			);
		}
	} else if (hover.kind === 'anchor') {
		const anchor = authoring.anchors.find(
			(candidate) =>
				candidate.connectionId === hover.connectionId &&
				candidate.anchorId === hover.anchorId
		);
		if (anchor && !anchor.selected) targets.set(anchor.key, 'camera-anchor-hovered');
	}
	return targets;
}

/**
 * Apply a Camera Plan hover identity to a built render model. Camera authoring
 * primitives live in layers 7–9 (edges, anchors, nodes); this remaps only the
 * primitives whose stable key matches the hovered identity. Returns the input
 * model untouched when nothing changes.
 */
export function applyCameraPlanHover(
	model: PlanRenderModel,
	authoring: PlanCameraAuthoringProjection | undefined,
	hover: CameraPlanHit
): PlanRenderModel {
	const targets = hoverTargetKeys(authoring, hover);
	if (targets.size === 0) return model;
	const layers = model.layers.map((layer) => {
		if (layer.order < 7 || layer.order > 9) return layer;
		let changed = false;
		const primitives = layer.primitives.map((primitive) => {
			const token = targets.get(primitive.key);
			if (!token) return primitive;
			changed = true;
			return { ...primitive, style: token };
		});
		return changed ? { ...layer, primitives } : layer;
	});
	return { ...model, layers };
}
