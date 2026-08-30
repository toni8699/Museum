/**
 * P1.7 — Camera-domain node label kinds (shell spec "Viewport MUST show":
 * guided sequence numbering + unsequenced distinction, in Plan *and* 3D).
 *
 * Pure model shared by the 3D label overlay: the main flow carries the
 * 1-based order (same accessor the Camera Plan projection uses,
 * `store.mainFlowNodeIds`); every other navigation node is unsequenced.
 * Detour nodes are not on the main flow, so they badge like the Plan
 * surface does — Plan and 3D stay visually consistent by construction.
 */

export type CameraNodeLabelKind = {
	nodeId: string;
	/** 1-based main-flow position, or null when off the main flow. */
	order: number | null;
	unsequenced: boolean;
};

export function buildCameraNodeLabelKinds(
	mainFlowNodeIds: readonly string[],
	navigationNodes: readonly { id: string }[]
): CameraNodeLabelKind[] {
	const orderByNodeId = new Map(
		mainFlowNodeIds.map((nodeId, index) => [nodeId, index + 1] as const)
	);
	return navigationNodes.map((node) => {
		const order = orderByNodeId.get(node.id) ?? null;
		return { nodeId: node.id, order, unsequenced: order === null };
	});
}
