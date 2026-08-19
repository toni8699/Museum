/**
 * shared editor gizmo contracts.
 *
 * One actual TransformControls host + explicit scene/camera/layout target
 * adapter boundaries. This module declares the seams only: the host owns
 * *when* methods run (Three lifecycle, camera rebinding, attach/detach,
 * orbit, pointer lifecycle, Escape, teardown), and each domain adapter owns
 * *what* they mean (target resolution, proxy/baseline state, document
 * mapping, commit/cancel semantics).
 *
 * Only `EditorTransformControlsHost.svelte` may instantiate
 * Three's `TransformControls`. Adapters never construct controls, add
 * helpers, register global listeners, or call document mutators directly.
 *
 * S7 keeps layout target descriptors detached: a layout selection resolves a
 * descriptor (tested math) but no live layout adapter is handed to the host
 * until S8 supplies its candidate-session.
 */

import type { Object3D } from 'three';

/**
 * Tool-driven transform modes. These are the *semantic* modes; whether a
 * target supports them is decided by its `EditorGizmoPolicy`.
 */
export type GizmoMode = 'translate' | 'rotate' | 'scale';

/**
 * Lowercase semantic axis handles. Combinations exist only when every
 * component axis is allowed; the set maps exactly to the public Three
 * handles (see `semanticAxisToThree`).
 */
export type GizmoAxis = 'x' | 'y' | 'z' | 'xy' | 'xz' | 'yz' | 'xyz';

/**
 * Uppercase handle axes as reported by Three's `TransformControls.axis`.
 * `E` (screen) and `XYZE` (free) are rotate-only derived handles — never
 * semantic axes, accepted by the host only when all component rotation
 * axes are allowed.
 */
export type ThreeGizmoAxis =
	| 'X'
	| 'Y'
	| 'Z'
	| 'XY'
	| 'XZ'
	| 'YZ'
	| 'XYZ'
	| 'E'
	| 'XYZE';

export type GizmoSpace = 'world' | 'local';

/**
 * How scale output behaves for the target:
 * - `scene-scale-mode` — scene placements reuse the schema-v6
 *   uniform/independent scale-vector session state;
 * - `fixed-independent` — authored dimensions (layout objects/openings)
 *   scale per-axis in the proxy without scene scale-mode state;
 * - `hidden` — no scale handles.
 */
export type EditorGizmoScaleControl = 'scene-scale-mode' | 'fixed-independent' | 'hidden';

/**
 * One capability policy drives the host, the toolbar, and the W/E/R/T
 * shortcuts: an unsupported mode/axis can never start through any of them.
 */
export interface EditorGizmoPolicy {
	/** Mode used when the user's remembered mode is unsupported. */
	defaultMode: GizmoMode;
	allowedModes: ReadonlySet<GizmoMode>;
	/** Allowed semantic axes for one mode (possibly derived to the effective mode). */
	allowedAxes(mode: GizmoMode): ReadonlySet<GizmoAxis>;
	/** Space for one mode (may switch by mode, e.g. rotate local on layout objects). */
	space(mode: GizmoMode): GizmoSpace;
	/** Scale-handle / scale-chain behavior for the toolbar. */
	scaleControl: EditorGizmoScaleControl;
}

export interface EditorGizmoBeginInput {
	/** Collision-safe adapter key of the attached target (never a placement id). */
	targetKey: string;
}

export interface EditorGizmoPreviewInput {
	targetKey: string;
	/**
	 * Uppercase handle axis reported by TransformControls during the drag.
	 * `null` when unavailable; host defensive guards run before `begin`.
	 */
	axis: ThreeGizmoAxis | null;
}

export interface EditorGizmoCommitInput {
	targetKey: string;
}

export type EditorGizmoCancelReason =
	| 'escape'
	| 'pointer-cancel'
	| 'target-change'
	| 'view-change'
	| 'unmount'
	| 'external-replacement';

/**
 * One drag session produced by `EditorGizmoTargetAdapter.begin`. The host
 * calls `preview` on `objectChange`, performs one final preview + one
 * `commit` on `mouseUp`, and routes every cancellation path to `cancel`
 * exactly once — a later natural `mouseUp` after cancellation is ignored
 * and cannot commit.
 */
export interface EditorGizmoDragSession {
	preview(input: EditorGizmoPreviewInput): void;
	commit(input: EditorGizmoCommitInput): void;
	cancel(reason: EditorGizmoCancelReason): void;
}

/**
 * One attachable gizmo target. The host never inspects the proxy's meaning
 * or the target's document identity — it only detaches → configures →
 * attaches the proxy, then calls into the session.
 */
export interface EditorGizmoTargetAdapter {
	/** Collision-safe adapter key (e.g. `camera:node:pos`), never a placement id. */
	key: string;
	domain: 'scene' | 'camera' | 'layout';
	/** Session-only proxy; never serialized into MuseumProject/snapshots/export. */
	proxy: Object3D;
	policy: EditorGizmoPolicy;
	/**
	 * Optional pre-attach hook (e.g. re-centering a shared pivot before the
	 * host attaches). Called by the composer, never by the host.
	 */
	prepare?(): void;
	/** Refused begins create no session, no orbit change, and no history. */
	begin(input: EditorGizmoBeginInput): EditorGizmoDragSession | null;
}