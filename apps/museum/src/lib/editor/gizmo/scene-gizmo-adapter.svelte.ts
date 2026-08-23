/**
 * steps 2/3 — scene placement gizmo adapter.
 *
 * Owns the placement session the monolith `EditorTransformControls.svelte`
 * used to run inline: pivot baseline, rigid member deltas, uniform /
 * independent scale, room-local translation snap + Shift bypass, rotation
 * snap preference routing, keep-on-floor grounding, one document
 * transaction per drag, and the placement-cancel deselect.
 *
 * Resolution rule (editor + relic): a scene placement target exists only when
 * every selected placement id resolves to a live root — missing roots
 * return `null` (the refuses-begin contract) and no session is attached.
 *
 * The adapter never constructs TransformControls, registers listeners, or
 * mutates layout state. The host controller owns *when* these methods run.
 *
 * Behavior is pinned by `tests/lib/editor/gizmo/editor-gizmo-behavior-fixtures.test.ts`
 * and the pre-extraction cluster/placement/scale-vector suites.
 */

import { Group, Matrix4, Quaternion, Vector3 } from 'three';
import type { Object3D, Scene } from 'three';
import type { EditorStore } from '../editor-store.svelte';
import type { EditorInteractionStore } from '../store/editor-interaction-store.svelte';
import {
	applyRigidPivotDelta,
	captureMemberTransformBaselines,
	resetSessionPivot,
	snapPivotRoomLocal,
	type MemberTransformBaseline
} from '../editor-cluster-transform';
import { groundSelectionRigidly } from '../editor-placement';
import {
	enforceUniformObjectScale,
	placementTransformFromObject
} from '../editor-transform';
import type {
	EditorGizmoPolicy,
	EditorGizmoTargetAdapter,
	GizmoAxis,
	GizmoMode,
	ThreeGizmoAxis
} from './editor-gizmo-contract';

const ALL_AXES: readonly GizmoAxis[] = ['x', 'y', 'z', 'xy', 'xz', 'yz', 'xyz'];

/**
 * Scene placement capability policy — one source shared by the host, the
 * toolbar, and the W/E/R/T shortcuts (scene targets get the full transform
 * set, world space, and the scene-scale-mode chain).
 */
export const SCENE_GIZMO_POLICY: EditorGizmoPolicy = {
	defaultMode: 'translate',
	allowedModes: new Set(['translate', 'rotate', 'scale']),
	allowedAxes: () => new Set(ALL_AXES),
	space: () => 'world',
	scaleControl: 'scene-scale-mode'
};

export interface SceneGizmoAdapterInput {
	store: EditorStore;
	/** Threlte scene used for keep-on-floor grounding raycasts. */
	scene: Scene;
	/** Shared session pivot (adapter-created via `createSceneGizmoPivot`, pose managed here). */
	pivot: Group;
	interactionStore?: EditorInteractionStore;
	/** Remembered user transform mode (`interactionStore.mode`, fallback `store.transformMode`). */
	getMode(): GizmoMode;
	/** Host-owned Shift state (skips translation/rotation snap). */
	isShiftHeld(): boolean;
}

/**
 * Create the one placement pivot for a mounted 3D Canvas (S7 step 3: pivot
 * creation and reset live in the scene adapter module — the composer only
 * holds the reference and calls `disposeSceneGizmoPivot` on unmount).
 */
export function createSceneGizmoPivot(scene: Scene): Group {
	const pivot = new Group();
	pivot.name = 'EditorSelectionPivot';
	pivot.userData.editorEntity = 'selection-pivot';
	scene.add(pivot);
	return pivot;
}

/** Remove the shared pivot from its scene exactly once (host teardown). */
export function disposeSceneGizmoPivot(pivot: Group): void {
	pivot.removeFromParent();
}

type SceneDragSnapshot = {
	position: Vector3;
	quaternion: Quaternion;
	scale: Vector3;
};

type SceneDragSession = {
	startPivotWorldMatrix: Matrix4;
	members: MemberTransformBaseline[];
	/** Drag-start local transforms for cancel-restore (replaces the former dragSnapshot). */
	restore: SceneDragSnapshot[];
	/** Root order owning the session (for keep-on-floor + commit writes). */
	roots: Object3D[];
};

/**
 * Resolve the live scene placement target, or `null` when the selection has
 * no complete placement-root set. Every selected placement id must resolve;
 * missing members refuse the target itself, so no session can ever begin
 * with a partial set.
 */
export function createSceneGizmoAdapter(
	input: SceneGizmoAdapterInput
): EditorGizmoTargetAdapter | null {
	const ids = [...input.store.selectedPlacementIds];
	if (ids.length === 0) return null;
	const roots = input.store.getPlacementRoots(ids);
	if (roots.length !== ids.length) return null;

	const policy = SCENE_GIZMO_POLICY;

	return {
		key: `placement:${input.store.selectionKey}`,
		domain: 'scene',
		proxy: input.pivot,
		policy,
		/** Re-center the pivot before the host attaches (monolith `resetPivot`). */
		prepare: () => {
			prepareScenePivot(input);
		},
		begin() {
			if (!input.store.beginDocumentTransaction()) return null;
			const members = captureMemberTransformBaselines(ids, roots);
			input.pivot.updateMatrixWorld(true);
			input.store.setTransformInteractionActive(true, 'placement');
			const session: SceneDragSession = {
				startPivotWorldMatrix: input.pivot.matrixWorld.clone(),
				members,
				roots,
				restore: roots.map((root) => ({
					position: root.position.clone(),
					quaternion: root.quaternion.clone(),
					scale: root.scale.clone()
				}))
			};
			return {
				preview(input2: { axis: ThreeGizmoAxis | null }) {
					previewPlacementSession(input, session, input2.axis);
				},
				commit() {
					commitPlacementSession(input, session);
				},
				cancel(reason) {
					cancelPlacementSession(input, session, reason);
				}
			};
		}
	};
}

/** Re-center the shared pivot on the current roots before attaching (monolith `resetPivot`). */
export function prepareScenePivot(input: SceneGizmoAdapterInput): void {
	const roots = input.store.getPlacementRoots();
	if (!resetSessionPivot(input.pivot, roots)) return;
	if (roots.length === 1) {
		const ref = roots[0]!;
		ref.updateWorldMatrix(true, false);
		input.pivot.quaternion.copy(ref.getWorldQuaternion(new Quaternion()));
		input.pivot.updateMatrixWorld(true);
	}
}

function previewPlacementSession(
	input: SceneGizmoAdapterInput,
	session: SceneDragSession,
	axis: ThreeGizmoAxis | null
) {
	const mode = input.getMode();
	const scaleMode = input.interactionStore?.scaleMode ?? ('uniform' as const);
	const pivot = input.pivot;

	if (mode === 'scale') {
		if (scaleMode === 'uniform') {
			enforceUniformObjectScale(pivot, axis ?? null);
		}
	}
	const prefs = placementSnapPreferences(input.store);
	if (mode === 'translate' && prefs.translationSnapEnabled && !input.isShiftHeld()) {
		snapPivotRoomLocal(
			pivot,
			session.members[0]?.root.parent ?? null,
			prefs.translationSnap,
			!prefs.keepOnFloor
		);
	}

	pivot.updateMatrixWorld(true);
	// Transient preview (parity with the layout adapter): the live placement
	// roots are the drag preview. The document is deliberately NOT written per
	// frame — `updatePlacementTransform` mutates the reactive document, and the
	// placement root's `scale` prop reads that document live (`getPlacementScale`),
	// so a per-frame write re-binds the prop mid-drag and races the direct root
	// mutation (the released gizmo "snaps back" to the committed value). Commit
	// installs every member's final transform once.
	applyRigidPivotDelta(
		session.startPivotWorldMatrix,
		pivot.matrixWorld,
		session.members,
		scaleMode
	);
}

function commitPlacementSession(input: SceneGizmoAdapterInput, session: SceneDragSession) {
	if (input.store.keepOnFloor) {
		const result = groundSelectionRigidly(session.roots, [input.scene]);
		if (!result.grounded) {
			input.store.setStatusMessage('No floor below selection');
		}
	}
	// Install the final member transforms once (transient → document), then
	// commit a single history entry. The commit re-resolves the runtime scene
	// from the document, so the reactive root props re-apply the same values
	// the drag previewed — the scale holds instead of snapping back.
	for (const member of session.members) {
		input.store.updatePlacementTransform(
			member.id,
			placementTransformFromObject(member.root)
		);
	}
	input.store.setTransformInteractionActive(false);
	input.store.commitDocumentTransaction();
	prepareScenePivot(input);
}

function cancelPlacementSession(
	input: SceneGizmoAdapterInput,
	session: SceneDragSession,
	reason: string
) {
	// Restore every live root from the drag-start snapshot, then roll back
	// the document transaction — the visual and the document stay in sync.
	for (const [index, root] of session.roots.entries()) {
		const snapshot = session.restore[index]!;
		root.position.copy(snapshot.position);
		root.quaternion.copy(snapshot.quaternion);
		root.scale.copy(snapshot.scale);
	}
	input.store.setTransformInteractionActive(false);
	input.store.cancelDocumentTransaction();
	prepareScenePivot(input);
	// Placement Escape deselects so the follow-up ACTIVE_TARGET_CHANGE(null)
	// lands the FSM in Idle; other reasons keep the selection intact.
	if (reason === 'escape' || reason === 'pointer-cancel') {
		input.store.selectionActions.deselect();
	}
}

function placementSnapPreferences(store: EditorStore) {
	return {
		translationSnap: store.translationSnap,
		translationSnapEnabled: store.translationSnapEnabled,
		rotationSnapEnabled: store.rotationSnapEnabled,
		rotationSnapDegrees: store.rotationSnapDegrees,
		keepOnFloor: store.keepOnFloor
	};
}