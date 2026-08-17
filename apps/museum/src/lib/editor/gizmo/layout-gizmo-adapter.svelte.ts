/**
 * H1 S8 step 2 — the live layout candidate-session adapter.
 *
 * Activates the S7 detached descriptors: a layout selection drags through the
 * same single host the scene/camera adapters use, previews a validated
 * transient candidate bundle, and commits exactly one `layout` history entry
 * on pointer-up. The canonical `layoutPreview` is never written during a drag
 * — the transient is a separate session-only bundle rendered beside the
 * committed project and discarded on cancel.
 *
 * This adapter is the **only** gizmo file allowed to call the layout
 * transaction facade (`beginLayoutTransaction` / `commitLayoutTransaction` /
 * `cancelLayoutTransaction`) — pinned by the re-scoped `LAYOUT_FACADE_MARKERS`
 * contract test.
 *
 * The proxy is composer-owned (`createLayoutGizmoProxy` adds one shared
 * session-only Object3D per mounted canvas, like the scene pivot); this module
 * only sets its pose per descriptor. The adapter never constructs controls,
 * registers listeners, or mutates layout state directly.
 */

import { Object3D } from 'three';
import type { Scene } from 'three';
import type { MuseumEditorStore } from '../museum-editor.svelte';
import type { LayoutInteractionState } from '../layout/layout-interaction';
import type { LayoutPreviewState } from '../layout/layout-preview-state.svelte';
import {
	captureLayoutPreviewSnapshot,
	commitLayoutCandidate
} from '../layout/layout-preview-state.svelte';
import { snapToGrid } from '../layout/layout-plan-transform';
import type {
	EditorGizmoCancelReason,
	EditorGizmoDragSession,
	EditorGizmoTargetAdapter
} from './editor-gizmo-contract';
import {
	deriveLayoutGizmoDelta,
	type LayoutGizmoDelta,
	type LayoutGizmoProxyPose,
	type LayoutGizmoTargetDescriptor
} from './layout-gizmo-target';
import {
	deriveLayoutCandidate,
	type LayoutGizmoCandidateBundle
} from './layout-gizmo-candidate';

export interface LayoutGizmoAdapterInput {
	store: MuseumEditorStore;
	layoutPreview: LayoutPreviewState;
	layoutInteraction: LayoutInteractionState;
	descriptor: LayoutGizmoTargetDescriptor;
	/** Session-only shared proxy (composer-owned; added to the scene once per mount). */
	proxy: Object3D;
	/** Host-owned Shift state for the adapter's own snap policy. */
	isShiftHeld(): boolean;
	/** Reactive render slot — writes the transient bundle into the H1 shell. */
	onTransient(bundle: LayoutGizmoCandidateBundle | null): void;
}

/** Create the one session-only layout proxy for a mounted 3D Canvas. */
export function createLayoutGizmoProxy(scene: Scene): Object3D {
	const proxy = new Object3D();
	proxy.name = 'LayoutGizmoProxy';
	proxy.userData.editorEntity = 'layout-gizmo-proxy';
	scene.add(proxy);
	return proxy;
}

/** Remove the layout proxy from its scene exactly once (host teardown). */
export function disposeLayoutGizmoProxy(proxy: Object3D): void {
	proxy.removeFromParent();
}

function applyProxyPose(proxy: Object3D, pose: LayoutGizmoProxyPose): void {
	proxy.position.set(pose.position[0], pose.position[1], pose.position[2]);
	proxy.rotation.set(pose.rotation[0], pose.rotation[1], pose.rotation[2]);
	proxy.scale.set(pose.scale[0], pose.scale[1], pose.scale[2]);
	proxy.updateMatrixWorld(true);
}

function readProxyPose(proxy: Object3D): LayoutGizmoProxyPose {
	return {
		position: [proxy.position.x, proxy.position.y, proxy.position.z],
		rotation: [proxy.rotation.x, proxy.rotation.y, proxy.rotation.z],
		scale: [proxy.scale.x, proxy.scale.y, proxy.scale.z]
	};
}

/**
 * The adapter owns *what* begin/preview/commit/cancel mean for the layout
 * domain; the host owns *when*. `descriptor` is resolved by the composer, so a
 * non-null descriptor always yields a live adapter (stale identities resolve
 * no descriptor → no adapter).
 */
export function createLayoutGizmoAdapter(
	input: LayoutGizmoAdapterInput
): EditorGizmoTargetAdapter {
	const { descriptor, proxy } = input;
	return {
		key: descriptor.key,
		domain: 'layout',
		proxy,
		policy: descriptor.policy,
		/** Reset the shared proxy to the descriptor baseline before attach (like the scene pivot). */
		prepare: () => applyProxyPose(proxy, descriptor.proxyPose),
		begin() {
			if (!input.store.beginLayoutTransaction()) return null;
			applyProxyPose(proxy, descriptor.proxyPose);
			input.store.setTransformInteractionActive(true, 'layout');
			return makeLayoutSession(input);
		}
	};
}

type LayoutDragSession = {
	lastValid: LayoutGizmoCandidateBundle | null;
	lastIssue: string | null;
};

function makeLayoutSession(input: LayoutGizmoAdapterInput): EditorGizmoDragSession {
	const session: LayoutDragSession = { lastValid: null, lastIssue: null };
	return {
		preview() {
			previewLayoutSession(input, session);
		},
		commit() {
			commitLayoutSession(input, session);
		},
		cancel(reason) {
			cancelLayoutSession(input, reason);
		}
	};
}

/**
 * Adapter-owned snap policy inputs. The pure policy math is exported so the
 * S8-specific behaviors (grid-drift prevention, 15° angle snap) are testable
 * without a full store/session harness.
 */
export interface LayoutSnapPolicy {
	basePosition: readonly [number, number, number];
	snapEnabled: boolean;
	angleSnapEnabled: boolean;
}

/**
 * Adapter-owned snap policy (B3 contract): room translation snaps to the
 * 0.25 m Plan grid when `snapEnabled` and Shift is not held; room rotation
 * snaps to 15° when Shift is held and `angleSnapEnabled`. Other identities
 * stay raw (no snapping), and the scene adapter's Shift-bypass behavior is
 * untouched.
 */
export function applyLayoutSnapPolicy(
	delta: LayoutGizmoDelta,
	policy: LayoutSnapPolicy,
	isShiftHeld: boolean
): LayoutGizmoDelta {
	if (delta.kind !== 'room') return delta;
	const gridSnap = policy.snapEnabled && !isShiftHeld;
	const angleSnap = isShiftHeld && policy.angleSnapEnabled;
	let translation = delta.translation;
	if (gridSnap) {
		// Snap the absolute proxy position (grid-aligned), then re-derive the
		// delta so the grid never drifts relative to the baseline.
		const snapped = snapToGrid([
			policy.basePosition[0] + delta.translation[0],
			policy.basePosition[2] + delta.translation[1]
		]);
		translation = [
			snapped[0] - policy.basePosition[0],
			snapped[1] - policy.basePosition[2]
		];
	}
	let yaw = delta.yaw;
	if (angleSnap) {
		const increment = Math.PI / 12;
		yaw = Math.round(yaw / increment) * increment;
	}
	return { kind: 'room', translation, yaw };
}

function previewLayoutSession(input: LayoutGizmoAdapterInput, session: LayoutDragSession): void {
	const pose = readProxyPose(input.proxy);
	const rawDelta = deriveLayoutGizmoDelta(input.descriptor, pose);
	if (!rawDelta) return; // non-finite pose — keep the last valid bundle
	const delta = applyLayoutSnapPolicy(
		rawDelta,
		{
			basePosition: input.descriptor.proxyPose.position,
			snapEnabled: input.layoutInteraction.planView.snapEnabled,
			angleSnapEnabled: input.layoutInteraction.planView.angleSnapEnabled
		},
		input.isShiftHeld()
	);
	const result = deriveLayoutCandidate(
		input.descriptor,
		delta,
		input.layoutPreview.project.layout,
		input.layoutPreview.project.scene,
		input.layoutPreview.geometry,
		input.layoutPreview.project.id,
		input.layoutPreview.project.name
	);
	if (result.bundle) {
		session.lastValid = result.bundle;
		session.lastIssue = null;
		input.store.setStatusMessage(null);
		input.onTransient(result.bundle);
	} else {
		// Invalid candidate: keep the last-valid bundle rendered and surface
		// the first blocking issue (once, so repeated invalid frames don't
		// spam the status slot); the canonical layoutPreview is never written.
		if (session.lastIssue === null) {
			session.lastIssue = result.issue;
			input.store.setStatusMessage(result.issue ?? 'Layout candidate is invalid');
		}
	}
}

function commitLayoutSession(input: LayoutGizmoAdapterInput, session: LayoutDragSession): void {
	if (!session.lastValid) {
		// No candidate was ever valid — commit behaves as cancel.
		input.store.cancelLayoutTransaction();
		input.store.setTransformInteractionActive(false);
		input.store.setStatusMessage(null);
		input.onTransient(null);
		return;
	}
	// Defensive: begin succeeded, so the transaction must still be open. If it
	// was closed out-of-band, installing the candidate now would leave a
	// mutation with no undo entry — refuse to install.
	if (!input.store.isDocumentTransactionActive) {
		input.store.setTransformInteractionActive(false);
		input.store.setStatusMessage(null);
		input.onTransient(null);
		return;
	}
	// Install the last-valid candidate atomically, then commit exactly one
	// `layout` history entry. The history controller's JSON `matches` makes a
	// no-op commit add no entry, so its `false` return is expected.
	commitLayoutCandidate(input.layoutPreview, session.lastValid);
	input.store.commitLayoutTransaction(captureLayoutPreviewSnapshot(input.layoutPreview));
	input.store.setTransformInteractionActive(false);
	input.store.setStatusMessage(null);
	input.onTransient(null);
}

function cancelLayoutSession(input: LayoutGizmoAdapterInput, reason: EditorGizmoCancelReason): void {
	void reason;
	// The facade restores the pre-gesture snapshot through the registered
	// layout host. Layout Escape keeps the selection (the target persists, so
	// the FSM returns to Selected), matching camera.
	input.store.cancelLayoutTransaction();
	input.store.setTransformInteractionActive(false);
	input.store.setStatusMessage(null);
	input.onTransient(null);
}
