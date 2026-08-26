/**
 * `editor-types.ts` — editor-wide type aliases barrel.
 *
 * Slice 3 debt 3.11 (formerly Slice 1.1): type-only exports previously inlined
 * in `editor-store.svelte.ts:140-220`. The barrel also collapses the locally
 * redeclared `EditorCameraPreview*` variants that `camera-preview-controller.svelte.ts`
 * advertises as "Slice 6 collapses these" — collapsing them here closes the
 * todo one slice ahead of plan.
 *
 * **Architectural intent.** Anything shared between sub-stores, helpers, and
 * the composition root passes through this file. Re-exports from
 * `editor-store.svelte.ts` keep the pre-slice call sites compiling unchanged
 * (Phase A mirror for back-compat, deleted by Slice 6).
 *
 * **No `$state` runes here.** This file is purely a types module; it imports
 * no Svelte runtime. Sub-stores and helpers consume `EditorSessionState`'s
 * `setStatusMessage` shape via `Pick<…>` to avoid an accidental rune dep.
 */

import type { CameraConnectionDirection, RoomId } from '$lib/types/scene';
import type { SceneNavigationNode } from '$lib/content/scene';
import type { EditorCameraHandle } from './editor-selection';
import type { MaterialId } from '$lib/types/materials';
// =====================================================================
// Lighting preset slot shape (god file lines 141-147).
// =====================================================================

export type EditorLightingSettings = {
	ambientIntensity: number;
	directionalIntensity: number;
	fogEnabled: boolean;
	fogNear: number;
	fogFar: number;
};

// =====================================================================
// Camera preview FSM types (god file lines 148-181 + controller mirror).
//
// The previous controller redeclaration listed four distinct `CameraPreview*`
// interfaces. Barrel exposes them as named members of the discriminated union
// so both the composition root and the controller can write each `kind`
// case as a single structural type.
// =====================================================================

export type EditorCameraPreviewMode = 'director' | 'visitor';

/** P12 S1 — transport is binary; completion is derived from playhead. */
export type EditorCameraPreviewTransport = 'paused' | 'playing';

export interface EditorCameraPreviewState {
	mode: EditorCameraPreviewMode;
	transport: EditorCameraPreviewTransport;
	runId: number;
	/** Canonical active-scope evaluation progress, normalized to [0, 1]. */
	playhead: number;
	startedAtMs: number | null;
}

export type CameraPreviewCamera = EditorCameraPreviewState & {
	kind: 'camera';
	nodeId: string;
};

export type CameraPreviewEdge = EditorCameraPreviewState & {
	kind: 'edge';
	connectionId: string;
	direction: CameraConnectionDirection;
	fromNodeId: string;
	toNodeId: string;
};

export type CameraPreviewSequence = EditorCameraPreviewState & {
	kind: 'sequence';
	startNodeId: string;
};

export type EditorCameraPreview =
	| null
	| CameraPreviewCamera
	| CameraPreviewEdge
	| CameraPreviewSequence;

export type PreviewScope = 'camera' | 'edge' | 'sequence';

/**
 * P11.1 — selection-driven preview scope request. Session-only orchestration
 * input (never serialized): the canonical Camera selection asks the preview
 * commands layer to install the matching paused scope. Sequence is
 * deliberately absent — it stays an explicit whole-route entry.
 */
export type EditorSelectionPreviewScopeRequest =
	| { kind: 'camera'; nodeId: string }
	| { kind: 'edge'; connectionId: string; direction: CameraConnectionDirection };

// =====================================================================
// Pending navigation command + workspace + panel chrome (god file lines
// 182-203). Single discriminated union; "kind === 'place-camera'" lives at
// the top so visit/dismiss logic stays short.
// =====================================================================

export type EditorPendingNavigationCommand =
	| null
	| {
			kind: 'place-camera';
	  }
	| {
			kind: 'connect-pending-node';
			node: SceneNavigationNode;
	  }
	| {
			kind: 'connect-existing';
			sourceNodeId: string;
	  };

export type EditorWorkspace = 'scene' | 'camera' | 'layout';

export type EditorLeftPanel = 'scene' | 'assets';

export type EditorPlacementTreeSelectionOptions = {
	additive?: boolean;
	focus?: boolean;
};

export type EditorClusterTreeSelectionOptions = {
	focus?: boolean;
};

// =====================================================================
// Drag + transform session slots (god file lines 214-221).
// =====================================================================

export type EditorViewKeyframeProgressDragSelection = {
	connectionId: string;
	direction: CameraConnectionDirection;
	keyframeId: string;
};

export type EditorTransformSpace = 'local' | 'world';

/** Stable identity for one focused camera navigator target. */
export type EditorCameraFocusKind =
	| 'room'
	| 'placement'
	| 'selection'
	| 'navigation-node'
	| null;

/** Stable identity for one in-flight transform interaction. */
export type EditorTransformInteractionKind =
	| 'placement'
	| 'camera'
	| 'anchor'
	| 'view-target'
	| 'layout'
	| null;

// =====================================================================
// Selection reducer parallel-tuple shape (audit §3.D, Slice 4).
//
// Workspaces and navigations are two parallel state slots owned by
// `EditorSelectionStore` so the god file's `selectX` methods collapse into
// one reducer-call per site. The cross-clearing invariants (leaving nav
// clears persisted discovery; entering nav clears the workspace selection;
// entering a workspace selection closes any open navigation) are encoded
// inside the reducer and the *derived* `discoveryConnectionId` slot mirrors
// the connection shape when nav.kind ∈ {connection, anchor, view-keyframe}.
// =====================================================================

export type WorkspaceSelection =
	| { kind: 'none' }
	| {
			kind: 'placement';
			ids: string[];
			clusterId: string | null;
			roomId: RoomId;
	  }
	| {
			kind: 'cluster';
			clusterId: string;
			roomId: RoomId;
	  };

export type NavigationSelection =
	| { kind: 'none' }
	| {
			kind: 'node';
			nodeId: string;
			handle: EditorCameraHandle;
	  }
	| {
			kind: 'connection';
			connectionId: string;
			direction: CameraConnectionDirection;
	  }
	| {
			kind: 'anchor';
			connectionId: string;
			anchorId: string;
	  }
	| {
			kind: 'view-keyframe';
			connectionId: string;
			direction: CameraConnectionDirection;
			keyframeId: string;
	  };

// =====================================================================
// Phase 5.2 session-only material edit + texture load state.
// =====================================================================

/** Per-field patch a Material inspector / drop sends into the mutator. `null`
 * removes the optional override. */
export type MaterialInstancePatch = {
	baseMaterialId?: MaterialId;
	baseTextureId?: string | null;
	roughness?: number | null;
	metalness?: number | null;
};

/** Decision the user makes for a shared-first-assignment dialog. */
export type MaterialShareMode = 'make-unique' | 'edit-shared';

export type MaterialEditDecision = {
	baseMaterialId?: MaterialId;
	shareMode?: MaterialShareMode;
};

/** Why the editor is waiting for user input before committing a material edit. */
export type EditorPendingMaterialEdit = {
	entityId: string;
	/** Model first assignment requires an explicit catalogue base. */
	needsBaseMaterial: boolean;
	/** Non-null when the target instance is shared (Make unique / Edit shared). */
	sharedMaterialInstanceId: string | null;
	/** Patch the dialog will re-apply on confirm. */
	patch: MaterialInstancePatch;
	/** Texture id when this pending edit is a texture assignment (for recents). */
	recentTextureId: string | null;
};

/** Browser image load + import status for one safe texture URI. */
export type EditorTextureLoadState =
	| { status: 'loading' }
	| { status: 'ready' }
	| { status: 'error'; message: string };
