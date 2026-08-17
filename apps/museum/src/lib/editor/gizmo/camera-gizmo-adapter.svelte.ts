/**
 * H1 S7 steps 2/4 — camera gizmo adapter.
 *
 * Owns the three navigation target kinds the monolith handled inline:
 *  - camera node position / target helpers;
 *  - connection path anchors;
 *  - view-keyframe targets.
 *
 * World-space translate only (no rotation/scale handles, no snaps), on every
 * world axis — the pre-S7 monolith never restricted camera handles, so the
 * full X/Y/Z translate set is locked for parity (see `CAMERA_AXES`). Node
 * previews convert the proxy world position through `store.rooms.localPoint`
 * and go through the existing `updateNavigationNodePoint` path; anchor and
 * view-target previews call their existing world-point mutators. Authored
 * targets begin one scene document transaction; pending camera nodes keep
 * the no-transaction draft path and restore `startLocalPoint` on cancel.
 * Anchor/view-target epsilon no-ops stay at
 * `EDITOR_CAMERA_PATH_MOVE_EPSILON` / `EDITOR_CAMERA_VIEW_MOVE_EPSILON`.
 *
 * The adapter never constructs any TransformControls, registers listeners,
 * or mutates layout state. The host controller owns *when* the session
 * methods run. Pinned by the S7 camera-session fixtures.
 */

import { Vector3 } from 'three';
import type { Object3D } from 'three';
import type { Vec3 } from '$lib/types/museum';
import type { MuseumEditorStore } from '../museum-editor.svelte';
import { EDITOR_CAMERA_PATH_MOVE_EPSILON } from '../editor-camera-path';
import { EDITOR_CAMERA_VIEW_MOVE_EPSILON } from '../editor-camera-view';
import type {
	EditorGizmoCancelReason,
	EditorGizmoDragSession,
	EditorGizmoPolicy,
	EditorGizmoTargetAdapter,
	GizmoAxis
} from './editor-gizmo-contract';

/**
 * Full XYZ translate handles, matching the pre-S7 monolith (which never
 * called `showX/showY/showZ`), so a camera node's eye height (`position[1]`)
 * stays draggable. The host derives `showX/showY/showZ` from this set.
 */
const CAMERA_AXES: ReadonlySet<GizmoAxis> = new Set([
	'x',
	'y',
	'z',
	'xy',
	'xz',
	'yz',
	'xyz'
]);

export interface CameraGizmoAdapterInput {
	store: MuseumEditorStore;
}

type CameraTarget =
	| {
			kind: 'camera';
			key: string;
			nodeId: string;
			handle: 'position' | 'target';
			root: Object3D;
	  }
	| {
			kind: 'anchor';
			key: string;
			connectionId: string;
			anchorId: string;
			root: Object3D;
	  }
	| {
			kind: 'view-target';
			key: string;
			connectionId: string;
			direction: 'forward' | 'reverse';
			keyframeId: string;
			root: Object3D;
	  };

type CameraDragSession = {
	target: CameraTarget;
	root: Object3D;
	startWorldPosition: Vector3;
	startLocalPoint?: Vec3;
	pending?: boolean;
};

/** Monolith `getActiveTransformTarget` camera branch: helper root required. */
function resolveCameraTarget(input: CameraGizmoAdapterInput): CameraTarget | null {
	const store = input.store;
	const navigationSelection =
		store.navigationSelection ??
		(store.cameraSelection
			? {
					kind: 'node' as const,
					nodeId: store.cameraSelection.nodeId,
					handle: store.cameraSelection.handle
				}
			: null);
	if (!navigationSelection) return null;

	if (navigationSelection.kind === 'anchor') {
		const root = store.getSelectedAnchorHelperRoot();
		if (!root) return null;
		return {
			kind: 'anchor',
			key: `anchor:${navigationSelection.connectionId}:${navigationSelection.anchorId}`,
			connectionId: navigationSelection.connectionId,
			anchorId: navigationSelection.anchorId,
			root
		};
	}
	if (navigationSelection.kind === 'view-keyframe') {
		const root = store.getSelectedViewKeyframeTargetHelperRoot();
		if (!root) return null;
		return {
			kind: 'view-target',
			key: `view-target:${navigationSelection.connectionId}:${navigationSelection.direction}:${navigationSelection.keyframeId}`,
			connectionId: navigationSelection.connectionId,
			direction: navigationSelection.direction,
			keyframeId: navigationSelection.keyframeId,
			root
		};
	}
	if (navigationSelection.kind !== 'node') return null;
	const root = store.getSelectedCameraHelperRoot();
	if (!root) return null;
	return {
		kind: 'camera',
		key: `camera:${navigationSelection.nodeId}:${navigationSelection.handle}`,
		nodeId: navigationSelection.nodeId,
		handle: navigationSelection.handle,
		root
	};
}

/**
 * Resolve the live camera target, or `null` when the navigation selection
 * is absent, connection-only, or its helper is unmounted.
 */
export function createCameraGizmoAdapter(
	input: CameraGizmoAdapterInput
): EditorGizmoTargetAdapter | null {
	const store = input.store;
	const target = resolveCameraTarget(input);
	if (!target) return null;

	const policy: EditorGizmoPolicy = {
		defaultMode: 'translate',
		allowedModes: new Set(['translate']),
		allowedAxes: () => CAMERA_AXES,
		space: () => 'world',
		scaleControl: 'hidden'
	};

	return {
		key: target.key,
		domain: 'camera',
		proxy: target.root,
		policy,
		begin() {
			const root = target.root;
			if (target.kind !== 'camera') {
				if (!store.beginDocumentTransaction()) return null;
				store.setTransformInteractionActive(true, target.kind);
				return makeCameraSession(store, {
					target,
					root,
					startWorldPosition: root.getWorldPosition(new Vector3())
				});
			}
			const pending = store.isPendingNavigationNode(target.nodeId);
			if (!pending && !store.beginDocumentTransaction()) return null;
			const node = pending ? store.pendingNavigationNode : store.selectedNavigationNode;
			if (!node || node.id !== target.nodeId) {
				store.setTransformInteractionActive(false);
				if (!pending) store.cancelDocumentTransaction();
				return null;
			}
			store.setTransformInteractionActive(true, 'camera');
			const startLocalPoint: Vec3 =
				target.handle === 'position' ? [...node.position] : [...node.cameraTarget];
			return makeCameraSession(store, {
				target,
				root,
				startWorldPosition: root.getWorldPosition(new Vector3()),
				startLocalPoint,
				pending
			});
		}
	};
}

function makeCameraSession(
	store: MuseumEditorStore,
	session: CameraDragSession
): EditorGizmoDragSession {
	return {
		preview() {
			previewCameraSession(store, session);
		},
		commit() {
			commitCameraSession(store, session);
		},
		cancel(reason) {
			cancelCameraSession(store, session, reason);
		}
	};
}

function previewCameraSession(store: MuseumEditorStore, session: CameraDragSession) {
	const world = session.root.getWorldPosition(new Vector3()).toArray() as Vec3;
	const target = session.target;
	if (target.kind === 'camera') {
		const node = session.pending
			? store.pendingNavigationNode
			: store.document.navigationNodes.find(
					(candidate) => candidate.id === target.nodeId
				);
		if (!node) return;
		store.updateNavigationNodePoint(
			target.nodeId,
			target.handle,
			store.rooms.localPoint(node.roomId, world)
		);
		return;
	}
	if (session.target.kind === 'anchor') {
		store.updateConnectionAnchorWorldPoint(
			session.target.connectionId,
			session.target.anchorId,
			world
		);
		return;
	}
	store.updateSelectedViewKeyframeTargetWorldPoint(world);
}

function commitCameraSession(store: MuseumEditorStore, session: CameraDragSession) {
	previewCameraSession(store, session);
	if (session.target.kind === 'camera' && session.pending) {
		// Pending drafts stay out of history; the commit just ends the session.
		store.setTransformInteractionActive(false);
		return;
	}
	if (session.target.kind !== 'anchor' && session.target.kind !== 'view-target') {
		// Monolith parity: authored camera-node drags always commit — the
		// epsilon no-op is anchor/view-target only (plan: “Node transaction
		// behavior remains unchanged; S7 does not add a new epsilon.”)
		store.commitDocumentTransaction();
		store.setTransformInteractionActive(false);
		return;
	}
	const epsilon =
		session.target.kind === 'anchor'
			? EDITOR_CAMERA_PATH_MOVE_EPSILON
			: EDITOR_CAMERA_VIEW_MOVE_EPSILON;
	const distance = session.root
		.getWorldPosition(new Vector3())
		.distanceTo(session.startWorldPosition);
	if (distance <= epsilon) {
		store.cancelDocumentTransaction();
		session.root.position.copy(session.startWorldPosition);
	} else {
		store.commitDocumentTransaction();
	}
	store.setTransformInteractionActive(false);
}

function cancelCameraSession(
	store: MuseumEditorStore,
	session: CameraDragSession,
	reason: EditorGizmoCancelReason
) {
	void reason;
	if (session.target.kind === 'camera' && session.pending) {
		store.navigationSelection = {
			kind: 'node',
			nodeId: session.target.nodeId,
			handle: session.target.handle
		};
		store.updateNavigationNodePoint(
			session.target.nodeId,
			session.target.handle,
			session.startLocalPoint!
		);
	} else {
		store.cancelDocumentTransaction();
	}
	session.root.position.copy(session.startWorldPosition);
	store.setTransformInteractionActive(false);
}