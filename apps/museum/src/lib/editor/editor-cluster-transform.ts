import { Box3, Matrix4, Vector3, type Object3D } from 'three';
import {
	placementTransformFromObject,
	type PlacementTransform
} from './editor-transform';

export type MemberTransformBaseline = {
	id: string;
	root: Object3D;
	startWorldMatrix: Matrix4;
};

export function getCombinedWorldBounds(roots: Object3D[]) {
	const bounds = new Box3();
	for (const root of roots) {
		root.updateWorldMatrix(true, true);
		bounds.expandByObject(root);
	}
	return bounds;
}

export function resetSessionPivot(pivot: Object3D, roots: Object3D[]) {
	const bounds = getCombinedWorldBounds(roots);
	if (bounds.isEmpty()) return false;
	pivot.position.copy(bounds.getCenter(new Vector3()));
	pivot.rotation.set(0, 0, 0);
	pivot.scale.setScalar(1);
	pivot.updateMatrixWorld(true);
	return true;
}

export function captureMemberTransformBaselines(
	ids: string[],
	roots: Object3D[]
): MemberTransformBaseline[] {
	return roots.map((root, index) => {
		root.updateWorldMatrix(true, true);
		return {
			id: ids[index]!,
			root,
			startWorldMatrix: root.matrixWorld.clone()
		};
	});
}

export function calculatePivotMatrixDelta(
	startPivotWorldMatrix: Matrix4,
	currentPivotWorldMatrix: Matrix4
) {
	return currentPivotWorldMatrix
		.clone()
		.multiply(startPivotWorldMatrix.clone().invert());
}

/**
 * Recompute every member from its drag-start world matrix. No preview depends on
 * the previous preview, so long drags cannot accumulate transform drift.
 */
export function applyRigidPivotDelta(
	startPivotWorldMatrix: Matrix4,
	currentPivotWorldMatrix: Matrix4,
	members: MemberTransformBaseline[]
): Map<string, PlacementTransform> {
	const delta = calculatePivotMatrixDelta(startPivotWorldMatrix, currentPivotWorldMatrix);
	const transforms = new Map<string, PlacementTransform>();

	for (const member of members) {
		const parentWorldInverse = member.root.parent
			? member.root.parent.matrixWorld.clone().invert()
			: new Matrix4();
		const localMatrix = parentWorldInverse
			.multiply(delta)
			.multiply(member.startWorldMatrix);
		localMatrix.decompose(
			member.root.position,
			member.root.quaternion,
			member.root.scale
		);
		const uniformScale = Math.max(
			0.01,
			(member.root.scale.x + member.root.scale.y + member.root.scale.z) / 3
		);
		member.root.scale.setScalar(uniformScale);
		member.root.updateMatrixWorld(true);
		transforms.set(member.id, placementTransformFromObject(member.root));
	}

	return transforms;
}

/** Snap a world-space pivot in the selected room parent's local axes. */
export function snapPivotRoomLocal(
	pivot: Object3D,
	roomParent: Object3D | null,
	step: number,
	snapY: boolean
) {
	if (!(step > 0) || !Number.isFinite(step)) return;
	const local = pivot.getWorldPosition(new Vector3());
	if (roomParent) roomParent.worldToLocal(local);
	local.x = Math.round(local.x / step) * step;
	if (snapY) local.y = Math.round(local.y / step) * step;
	local.z = Math.round(local.z / step) * step;
	if (roomParent) roomParent.localToWorld(local);
	pivot.position.copy(local);
	pivot.updateMatrixWorld(true);
}
