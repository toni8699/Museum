import type { CameraConnectionDirection } from '$lib/types/museum';
import type { EditorCameraHandle } from '../editor-selection';

/**
 * Separator used to compose multi-part Object3D registry keys for the four
 * helper families (`camera-helper`, `anchor-helper`, `view-keyframe-target-
 * helper`). Existed as an inline constant in `museum-editor.svelte.ts`
 * before Slice 2; pulled into this module so the `EditorSceneRoots`
 * sub-store can read these keys without importing the god-file class.
 */
export const CAMERA_HELPER_KEY_SEPARATOR = ':';

/**
 * Separator used to compose Camera-workspace tree expansion keys
 * (`${connectionId}::${direction}`). Distinct from the Object3D registry
 * separator above. Shared by `MuseumEditorStore.cameraDirectionTreeKey` (tree
 * expand writes) and `EditorNavigationGraphMutator` (delete-time key parsing),
 * so it lives here as the single source of truth.
 */
export const CAMERA_DIRECTION_TREE_KEY_SEPARATOR = '::';

/** Stable string key for one camera-handle helper (`nodeId:handle`). */
export function cameraHelperKey(nodeId: string, handle: EditorCameraHandle) {
	return `${nodeId}${CAMERA_HELPER_KEY_SEPARATOR}${handle}`;
}

/** Stable string key for one anchor helper (`connectionId:anchorId`). */
export function anchorHelperKey(connectionId: string, anchorId: string) {
	return `${connectionId}${CAMERA_HELPER_KEY_SEPARATOR}${anchorId}`;
}

/** Stable string key for one view-keyframe target helper. */
export function viewKeyframeHelperKey(
	connectionId: string,
	direction: CameraConnectionDirection,
	keyframeId: string
) {
	return [connectionId, direction, keyframeId].join(CAMERA_HELPER_KEY_SEPARATOR);
}

/**
 * Stable `${connectionId}::${direction}` key for Camera workspace tree
 * expansion. Single source of truth shared by
 * `MuseumEditorStore.toggleCameraDirectionTreeExpansion` (tree expand
 * writes) and `EditorNavigationGraphMutator` (delete-time key parsing).
 *
 * Slice 3 of the Priority-1 file-split refactor moves this helper out of
 * the facade so both call sites import from one place.
 */
export function cameraDirectionTreeKey(
	connectionId: string,
	direction: CameraConnectionDirection
) {
	return `${connectionId}${CAMERA_DIRECTION_TREE_KEY_SEPARATOR}${direction}`;
}

/**
 * Tag for the four `Map`s owned by `EditorSceneRoots`. Used by `ids(...)`
 * to return only the keys of one family — handy for tests and debugging,
 * not used by the runtime registry path itself.
 */
export type SceneRootKind =
	| 'placement'
	| 'camera-helper'
	| 'anchor-helper'
	| 'view-keyframe-target-helper';
