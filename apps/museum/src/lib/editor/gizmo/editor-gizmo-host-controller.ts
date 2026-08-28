/**
 * step 2 — the gizmo host controller (pure core).
 *
 * Everything the host must own, minus the Three/Svelte/DOM glue:
 *  - one TransformControls surface lifecycle (attach/detach/config),
 *  - orbit state capture + exact restore (once per drag),
 *  - `mouseDown → objectChange* → mouseUp` against exactly one
 *    `EditorGizmoDragSession` per drag,
 *  - every cancellation path (Escape / pointer-cancel / target-change /
 *    view-change / unmount / external-replacement) through the active
 *    adapter's `cancel(reason)` at most once + `DRAG_END { cancelled: true }`,
 *  - FSM dispatch (`ACTIVE_TARGET_CHANGE`, `DRAG_START`, `DRAG_END`) and
 *    cursor recomputation,
 *  - policy configuration (mode/space/show-axes/snaps) + defensive
 *    begin-axis guard.
 *
 * The domain adapters own *what* begin/preview/commit/cancel mean; the
 * controller owns *when*. `EditorTransformControlsHost.svelte` is the only
 * component that constructs `ThreeTransformControls`; it wires this
 * controller to the real controls, orbit, and window events.
 *
 * The controller itself is pure: no Three construction, no DOM, no window
 * listeners — only the injected control surface + callbacks, so the whole
 * lifecycle is testable with fakes (`editor-gizmo-host.test.ts`).
 */

import type { Object3D } from 'three';
import type { FSMEvent } from '../store/interaction-fsm';
import { rotationSnapRadians } from '../editor-placement';
import type {
	EditorGizmoCancelReason,
	EditorGizmoDragSession,
	EditorGizmoTargetAdapter,
	GizmoMode,
	ThreeGizmoAxis
} from './editor-gizmo-contract';
import {
	deriveShowAxes,
	isThreeAxisAllowed,
	resolveEffectiveMode
} from './editor-gizmo-policy';

/**
 * The TransformControls surface the controller drives. The `EditorGizmoHost`
 * component bridges the real control object here; tests use fakes.
 */
export interface EditorGizmoHostControls {
	camera: unknown;
	attach(object: Object3D): void;
	detach(): void;
	reset(): void;
	dispose(): void;
	pointerUp(state: unknown): void;
	addEventListener(type: string, listener: (event?: unknown) => void): void;
	removeEventListener(type: string, listener: (event?: unknown) => void): void;
	mode: string;
	space: 'world' | 'local';
	showX: boolean;
	showY: boolean;
	showZ: boolean;
	translationSnap: number;
	rotationSnap: number;
	scaleSnap: number;
	enabled: boolean;
	axis: string | null;
	dragging: boolean;
}

/** Snap preferences the host reads from the editor session, never mutations. */
export interface EditorGizmoSnapPreferences {
	translationSnap: number;
	rotationSnapDegrees: number;
	scaleSnap: number;
	translationSnapEnabled: boolean;
	rotationSnapEnabled: boolean;
}

export interface EditorGizmoHostDeps {
	controls: EditorGizmoHostControls;
	/** Lazy orbit-controls accessor; `null` when no orbit controls exist. */
	getOrbit(): { enabled: boolean } | null;
	/** Remembered user transform mode (store `mode`, fallback store `transformMode`). */
	getMode(): GizmoMode;
	getSnapPreferences(): EditorGizmoSnapPreferences;
	dispatch(event: FSMEvent): void;
	recomputeCursor(dragging: boolean): void;
	invalidate(): void;
}

/**
 * One controller instance per mounted 3D Canvas. `setAdapter` is the only
 * entry the composer uses for target changes; the controller never inspects
 * the adapter's domain meaning or touches a document.
 */
export class EditorGizmoHostController {
	private adapter: EditorGizmoTargetAdapter | null = null;
	private session: EditorGizmoDragSession | null = null;
	private orbitWasEnabled: boolean | null = null;
	private dragActive = false;
	private shiftHeld = false;

	constructor(private readonly deps: EditorGizmoHostDeps) {}

	/** True while a live attachable gizmo target is attached. */
	hasLiveTarget(): boolean {
		return this.adapter !== null;
	}

	/** Host-owned Shift state, read by domain adapters for snap bypass policy. */
	isShiftHeld(): boolean {
		return this.shiftHeld;
	}

	/**
	 * Host lifecycle on any target change or disappearance: cancel the old
	 * live session first (`'target-change'`), detach the old proxy, attach
	 * the new adapter (or none), then sync `ACTIVE_TARGET_CHANGE`. A live
	 * session is never carried across targets. Same-key resolves are
	 * skipped only when the proxy is unchanged, so reactive recomputes do
	 * not churn the attached proxy — but a remounted helper root (new
	 * `Object3D`, same collision-safe key, e.g. `camera:node:pos`) must
	 * re-attach: the old proxy may already be removed from the scene, and
	 * leaving the gizmo bound to it makes the handles vanish while the
	 * selection stays valid.
	 */
	setAdapter(adapter: EditorGizmoTargetAdapter | null) {
		const sameTarget =
			this.adapter === adapter ||
			(this.adapter !== null &&
				adapter !== null &&
				this.adapter.key === adapter.key &&
				this.adapter.proxy === adapter.proxy);
		if (sameTarget) return;
		if (this.session) this.cancelSession('target-change');
		const controls = this.deps.controls;
		controls.detach();
		if (adapter) {
			this.applyConfiguration(adapter);
			controls.attach(adapter.proxy);
		}
		this.adapter = adapter;
		this.deps.dispatch({
			type: 'ACTIVE_TARGET_CHANGE',
			targetKey: adapter?.key ?? null
		});
		this.deps.invalidate();
	}

	/** Re-apply policy config without churning the attached proxy (mode/snap preference changes). */
	refreshConfiguration() {
		if (!this.adapter) return;
		this.applyRotationSnap();
		this.applyModeAndAxes(this.adapter);
		this.deps.invalidate();
	}

	private applyConfiguration(adapter: EditorGizmoTargetAdapter) {
		const controls = this.deps.controls;
		controls.translationSnap = 0;
		controls.scaleSnap = 0;
		this.applyRotationSnap();
		this.applyModeAndAxes(adapter);
	}

	/** Shared snap rows (rotation snap honors the Shift bypass). */
	private applyRotationSnap() {
		const prefs = this.deps.getSnapPreferences();
		this.deps.controls.rotationSnap =
			prefs.rotationSnapEnabled && !this.shiftHeld
				? rotationSnapRadians(prefs.rotationSnapDegrees)
				: 0;
	}

	// begin / preview / commit -------------------------------------------------

	/**
	 * TransformControls `mouseDown`: validate the active policy/mode/axis,
	 * then ask the adapter for a fresh session. A refused begin creates no
	 * session, no orbit change, and no history.
	 */
	onControlsMouseDown() {
		const adapter = this.adapter;
		if (!adapter) return;
		const controls = this.deps.controls;
		if (
			controls.axis !== null &&
			!isThreeAxisAllowed(resolveEffectiveMode(this.deps.getMode(), adapter.policy), controls.axis, adapter.policy)
		) {
			this.releaseControlDrag();
			return;
		}
		const session = adapter.begin({ targetKey: adapter.key });
		if (!session) {
			// Refused begin: three r175 has already set `dragging` (it fires
			// dragging-changed BEFORE this mouseDown), so without a release the
			// control would phantom-drag the proxy while orbit also consumes
			// the gesture. Release the control drag and stay inert; orbit
			// stays enabled.
			this.releaseControlDrag();
			return;
		}
		this.session = session;
		const orbit = this.deps.getOrbit();
		this.orbitWasEnabled = orbit?.enabled ?? null;
		if (orbit) orbit.enabled = false;
		// three r175 fires `dragging-changed(true)` BEFORE `mouseDown`, so
		// onDraggingChanged always sees `session === null` there — emit
		// DRAG_START here instead. `dragActive` makes this exactly-once under
		// either event order (older three dispatched mouseDown first).
		if (!this.dragActive) {
			this.dragActive = true;
			this.deps.dispatch({ type: 'DRAG_START' });
		}
	}

	/** TransformControls `objectChange`: one live session preview. */
	onControlsObjectChange(axis: string | null) {
		if (!this.session || !this.adapter) return;
		this.session.preview({
			targetKey: this.adapter.key,
			axis: (axis ?? null) as ThreeGizmoAxis | null
		});
		this.deps.invalidate();
	}

	/** TransformControls `mouseUp`: one final preview, then one commit. */
	onControlsMouseUp() {
		const session = this.session;
		const adapter = this.adapter;
		if (!session || !adapter) return;
		session.preview({
			targetKey: adapter.key,
			axis: (this.deps.controls.axis ?? null) as ThreeGizmoAxis | null
		});
		session.commit({ targetKey: adapter.key });
		this.session = null;
		this.restoreOrbit();
	}

	/**
	 * TransformControls `dragging-changed`: FSM/cursor state only — never
	 * captures, restores, commits, or classifies domain data. `DRAG_END`
	 * fires exactly once per drag (on the natural release); a cancel already
	 * emitted it, so this stays a no-op for the dead session.
	 */
	onDraggingChanged(value: unknown) {
		if (value === true) {
			if (this.session) {
				this.dragActive = true;
				this.deps.dispatch({ type: 'DRAG_START' });
			}
			this.deps.recomputeCursor(true);
			return;
		}
		if (this.dragActive) {
			this.dragActive = false;
			this.deps.dispatch({ type: 'DRAG_END', cancelled: false });
		}
		this.deps.recomputeCursor(false);
	}

	// cancellation --------------------------------------------------------------

	/**
	 * One shared cancellation path for every reason.
	 * `adapter.cancel(reason)` at most once → `DRAG_END { cancelled: true }`
	 * at most once → orbit restore exactly once → release the in-flight drag
	 * (r170 private-flag workaround + `pointerUp(null)`). A later natural
	 * `mouseUp` finds `session === null` and cannot commit.
	 */
	cancelSession(reason: EditorGizmoCancelReason): boolean {
		const session = this.session;
		if (!session) return false;
		session.cancel(reason);
		this.session = null;
		if (this.dragActive) {
			this.dragActive = false;
			this.deps.dispatch({ type: 'DRAG_END', cancelled: true });
		}
		this.restoreOrbit();
		this.releaseControlDrag();
		this.deps.recomputeCursor(false);
		return true;
	}

	private restoreOrbit() {
		if (this.orbitWasEnabled === null) return;
		const orbit = this.deps.getOrbit();
		if (orbit) orbit.enabled = this.orbitWasEnabled;
		this.orbitWasEnabled = null;
	}

	/**
	 * Release an in-flight TransformControls drag. Three has no public
	 * cancelDrag(): `reset()` clears the drag plane, flipping `dragging`
	 * fires `dragging-changed(false)`, and `pointerUp(null)` releases the
	 * pointer capture (r175).
	 */
	private releaseControlDrag() {
		const controls = this.deps.controls;
		controls.reset();
		(controls as { dragging?: boolean }).dragging = false;
		controls.pointerUp(null);
	}

	// keyboard / modifier routing ------------------------------------------------

	/**
	 * Escape with a live session is a host cancel (`'escape'`); the FSM never
	 * sees `ESC` from a live gizmo drag. Returns true when handled.
	 */
	onKeyDown(event: { key: string }): boolean {
		if (event.key === 'Shift') {
			this.shiftHeld = true;
			this.applyRotationSnap();
			return false;
		}
		if (event.key === 'Escape') {
			if (this.session) return this.cancelSession('escape');
			return false;
		}
		return false;
	}

	onKeyUp(event: { key: string }) {
		if (event.key !== 'Shift') return;
		this.shiftHeld = false;
		this.applyRotationSnap();
	}

	/** Ctrl/Cmd while dragging enables full snaps; releasing disables mid-drag. */
	onSnapModifierChange(event: { ctrlKey: boolean; metaKey: boolean }) {
		// Monolith parity note: the monolith gated on `state === 'Dragging' ||
		// controls.dragging`; a live session is a wider window (pointer-down →
		// mouseUp), but rows reset on attach and are only consumed mid-drag,
		// so the observable boundary matches.
		if (!this.session) return;
		const controls = this.deps.controls;
		const prefs = this.deps.getSnapPreferences();
		if (event.ctrlKey || event.metaKey) {
			controls.translationSnap = prefs.translationSnap;
			controls.rotationSnap = rotationSnapRadians(prefs.rotationSnapDegrees);
			controls.scaleSnap = prefs.scaleSnap;
		} else {
			controls.translationSnap = 0;
			// Deliberate deviation: the monolith zeroed rotationSnap on Ctrl
			// release; restoring the preference row keeps rotation snap on for
			// the rest of the drag when the user had it enabled.
			controls.rotationSnap = prefs.rotationSnapEnabled && !this.shiftHeld
				? rotationSnapRadians(prefs.rotationSnapDegrees)
				: 0;
			controls.scaleSnap = 0;
		}
	}

	onWindowBlur() {
		this.shiftHeld = false;
		// Monolith parity: blur must restore the configured snap rows — the
		// Shift keyup may never arrive while the window is unfocused, and
		// without this the rotation snap silently stays disabled.
		this.applyRotationSnap();
	}

	private applyModeAndAxes(adapter: EditorGizmoTargetAdapter) {
		const controls = this.deps.controls;
		const mode = resolveEffectiveMode(this.deps.getMode(), adapter.policy);
		controls.mode = mode;
		controls.space = adapter.policy.space(mode);
		const axes = deriveShowAxes(mode, adapter.policy);
		controls.showX = axes.showX;
		controls.showY = axes.showY;
		controls.showZ = axes.showZ;
	}

	// teardown -------------------------------------------------------------------

	/** Unmount: cancel any live session once, detach the proxy. Caller owns controls disposal. */
	dispose() {
		if (this.session) this.cancelSession('unmount');
		this.deps.controls.detach();
		this.adapter = null;
	}
}