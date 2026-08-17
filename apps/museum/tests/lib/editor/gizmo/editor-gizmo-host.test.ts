/**
 * H1 S7 step 2 — fake-host lifecycle specs.
 *
 * The controller (`$lib/editor/gizmo/editor-gizmo-host-controller.ts`) is
 * the pure, Three/Svelte-free core the `.svelte` host wraps. These specs
 * drive it with honest fakes (a TransformControls surface, an orbit
 * controls surface, a session-recording adapter, and the real
 * `EditorInteractionStore` as the FSM) and pin the S7 lifecycle contract:
 *  - one drag session per drag, commit exactly once, preview never drifts;
 *  - begin refusal: no session, no orbit change, no FSM, no history;
 *  - every cancel reason routes through `adapter.cancel(reason)` exactly
 *    once + `DRAG_END { cancelled: true }`; a late natural mouseUp can
 *    never commit;
 *  - orbit exact-restore on commit/cancel/switch/unmount;
 *  - target switch mid-drag cancels first, syncs next;
 *  - ACTIVE_TARGET_CHANGE drives Selected/Idle outside drags;
 *  - policy gating: unsupported mode/axis never reaches the adapter.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { Object3D } from 'three';
import { EditorInteractionStore } from '$lib/editor/store/editor-interaction-store.svelte';
import type { EditorGizmoPolicy } from '$lib/editor/gizmo/editor-gizmo-contract';
import {
	EditorGizmoHostController,
	type EditorGizmoHostControls,
	type EditorGizmoHostDeps,
	type EditorGizmoSnapPreferences
} from '$lib/editor/gizmo/editor-gizmo-host-controller';

const FULL_POLICY: EditorGizmoPolicy = {
	defaultMode: 'translate',
	allowedModes: new Set(['translate', 'rotate', 'scale']),
	allowedAxes: () => new Set(['x', 'y', 'z', 'xy', 'xz', 'yz', 'xyz']),
	space: () => 'world',
	scaleControl: 'scene-scale-mode'
};

const ROTATE_Y_ONLY_POLICY: EditorGizmoPolicy = {
	defaultMode: 'translate',
	allowedModes: new Set(['translate', 'rotate']),
	allowedAxes: (mode) =>
		mode === 'translate' ? new Set(['x', 'z', 'xz']) : new Set(['y']),
	space: () => 'world',
	scaleControl: 'hidden'
};

/** A TransformControls surface the controller can drive. */
function makeHostControls(): EditorGizmoHostControls & {
	attachedObject: Object3D | null;
	attachCount: number;
	detachCount: number;
} {
	const fake = {
		camera: new Object3D(),
		attachedObject: null as Object3D | null,
		attachCount: 0,
		detachCount: 0,
		axis: null as string | null,
		dragging: false,
		enabled: true,
		mode: 'translate',
		space: 'world' as 'local' | 'world',
		showX: true,
		showY: true,
		showZ: true,
		translationSnap: -1,
		rotationSnap: -1,
		scaleSnap: -1,
		attach(object: Object3D) {
			this.attachedObject = object;
			this.attachCount += 1;
		},
		detach() {
			this.attachedObject = null;
			this.detachCount += 1;
		},
		reset() {},
		dispose() {},
		pointerUp() {},
		addEventListener() {},
		removeEventListener() {}
	};
	return fake;
}

function makeOrbit() {
	const orbit = { enabled: true };
	return {
		orbit,
		get: () => orbit,
		set(enabled: boolean) {
			orbit.enabled = enabled;
		}
	};
}

function makeAdapter(overrides?: {
	policy?: EditorGizmoPolicy;
	refuseBegin?: boolean;
	key?: string;
	proxy?: Object3D;
}) {
	const session = {
		previews: [] as Array<{ axis: string | null }>,
		commits: 0,
		cancels: [] as string[]
	};
	const adapter = {
		key: overrides?.key ?? 'scene:placement',
		domain: 'scene' as const,
		proxy: overrides?.proxy ?? new Object3D(),
		policy: overrides?.policy ?? FULL_POLICY,
		beginCalls: 0,
		begin: () => {
			adapter.beginCalls += 1;
			if (overrides?.refuseBegin) return null;
			return {
				preview(input: { axis: string | null }) {
					session.previews.push({ axis: input.axis });
				},
				commit() {
					session.commits += 1;
				},
				cancel(reason: string) {
					session.cancels.push(reason);
				}
			};
		}
	};
	return { adapter, session };
}

function makeDeps(
	store: EditorInteractionStore,
	controls: ReturnType<typeof makeHostControls>,
	orbit: ReturnType<typeof makeOrbit>,
	prefsOverride?: Partial<EditorGizmoSnapPreferences>
): EditorGizmoHostDeps {
	return {
		controls,
		getOrbit: () => orbit.get(),
		getMode: () => store.mode,
		getSnapPreferences: (): EditorGizmoSnapPreferences => ({
			translationSnap: 0.1,
			rotationSnapDegrees: 15,
			scaleSnap: 1,
			translationSnapEnabled: false,
			rotationSnapEnabled: false,
			...prefsOverride
		}),
		dispatch: (event) => store.dispatch(event),
		recomputeCursor: (dragging) => store.recomputeCursor(dragging),
		invalidate: () => {}
	};
}

describe('EditorGizmoHostController — attach/detach + ACTIVE_TARGET_CHANGE', () => {
	let store: EditorInteractionStore;
	let controls: ReturnType<typeof makeHostControls>;
	let orbit: ReturnType<typeof makeOrbit>;
	let host: EditorGizmoHostController;

	beforeEach(() => {
		store = new EditorInteractionStore();
		controls = makeHostControls();
		orbit = makeOrbit();
		host = new EditorGizmoHostController(makeDeps(store, controls, orbit));
	});

	it('attach publishes ACTIVE_TARGET_CHANGE(key) → Selected; detach null → Idle', () => {
		const { adapter } = makeAdapter();
		host.setAdapter(adapter);
		expect(store.state).toBe('Selected');
		expect(controls.attachCount).toBe(1);
		expect(controls.attachedObject).toBe(adapter.proxy);
		expect(host.hasLiveTarget()).toBe(true);
		// The host detaches before every attach (monolith parity), so the
		// initial bind counts one detach too.
		expect(controls.detachCount).toBe(1);

		host.setAdapter(null);
		expect(store.state).toBe('Idle');
		expect(controls.attachedObject).toBeNull();
		expect(controls.detachCount).toBe(2);
		expect(host.hasLiveTarget()).toBe(false);
	});

	it('configures mode/space/show-axes from the adapter policy and remembered mode', () => {
		store.setMode('rotate');
		const { adapter } = makeAdapter({ policy: ROTATE_Y_ONLY_POLICY });
		host.setAdapter(adapter);
		expect(controls.mode).toBe('rotate');
		expect(controls.space).toBe('world');
		expect(controls.showX).toBe(false);
		expect(controls.showY).toBe(true);
		expect(controls.showZ).toBe(false);

		// A target that refuses the remembered mode falls back to default
		// without overwriting the remembered value.
		store.setMode('scale');
		host.refreshConfiguration();
		expect(controls.mode).toBe('translate');
		expect(controls.showX).toBe(true);
		expect(controls.showZ).toBe(true);
	});

	it('does not rebind when the resolved target key is unchanged', () => {
		const { adapter } = makeAdapter();
		host.setAdapter(adapter);
		const attaches = controls.attachCount;
		host.setAdapter(adapter);
		expect(controls.attachCount).toBe(attaches);
		expect(store.state).toBe('Selected');
	});

	it('re-attaches a same-key adapter whose proxy changed (remounted helper root)', () => {
		const { adapter } = makeAdapter();
		host.setAdapter(adapter);
		expect(controls.attachedObject).toBe(adapter.proxy);
		const attaches = controls.attachCount;

		// A remounted camera helper registers a *new* root Object3D with the
		// same collision-safe key (e.g. `camera:node-1:position`). The composer
		// resolves it to a fresh adapter object wrapping the new proxy; the
		// host must not keep the old (scene-removed) proxy attached, or the
		// gizmo disappears while the node selection stays valid.
		const { adapter: rebound } = makeAdapter({ key: adapter.key });
		expect(rebound.proxy).not.toBe(adapter.proxy);
		host.setAdapter(rebound);
		expect(controls.attachCount).toBe(attaches + 1);
		expect(controls.attachedObject).toBe(rebound.proxy);
		expect(store.state).toBe('Selected');
		expect(host.hasLiveTarget()).toBe(true);

		// A fresh adapter object wrapping the *same* proxy still skips
		// (the common reactive recompute from the composer).
		const { adapter: recomputed } = makeAdapter({
			key: adapter.key,
			proxy: rebound.proxy
		});
		const afterRebind = controls.attachCount;
		host.setAdapter(recomputed);
		expect(controls.attachCount).toBe(afterRebind);
	});
});

describe('EditorGizmoHostController — begin / preview / commit', () => {
	let store: EditorInteractionStore;
	let controls: ReturnType<typeof makeHostControls>;
	let orbit: ReturnType<typeof makeOrbit>;
	let host: EditorGizmoHostController;
	let draft: ReturnType<typeof makeAdapter>;

	function newHost() {
		store = new EditorInteractionStore();
		controls = makeHostControls();
		orbit = makeOrbit();
		draft = makeAdapter();
		host = new EditorGizmoHostController(makeDeps(store, controls, orbit));
		host.setAdapter(draft.adapter);
	}

	it('begin + previews + one commit: FSM Dragging → Selected, orbit exact-restore, single commit', () => {
		newHost();
		expect(store.state).toBe('Selected');

		controls.axis = 'X';
		controls.dragging = true;
		host.onControlsMouseDown();
		host.onDraggingChanged(true);
		expect(store.state).toBe('Dragging');
		expect(orbit.get().enabled).toBe(false);

		host.onControlsObjectChange('X');
		host.onControlsObjectChange('XY');
		host.onControlsMouseUp();
		expect(draft.session.previews).toEqual([
			{ axis: 'X' },
			{ axis: 'XY' },
			{ axis: 'X' }
		]);
		expect(draft.session.commits).toBe(1);

		controls.dragging = false;
		host.onDraggingChanged(false);
		expect(store.state).toBe('Selected');
		expect(orbit.get().enabled).toBe(true);
	});

	it('orbit initially false restores exactly false', () => {
		newHost();
		orbit.set(false);
		controls.axis = 'X';
		controls.dragging = true;
		host.onControlsMouseDown();
		host.onDraggingChanged(true);
		expect(orbit.get().enabled).toBe(false);
		host.onControlsMouseUp();
		controls.dragging = false;
		host.onDraggingChanged(false);
		expect(orbit.get().enabled).toBe(false);
		expect(store.state).toBe('Selected');
	});
});

describe('EditorGizmoHostController — begin refusal', () => {
	let store: EditorInteractionStore;
	let controls: ReturnType<typeof makeHostControls>;
	let orbit: ReturnType<typeof makeOrbit>;
	let host: EditorGizmoHostController;

	beforeEach(() => {
		store = new EditorInteractionStore();
		controls = makeHostControls();
		orbit = makeOrbit();
		host = new EditorGizmoHostController(makeDeps(store, controls, orbit));
	});

	it('refused begin: no session, no orbit change, no FSM drag, and a later mouseUp cannot commit', () => {
		const { adapter, session } = makeAdapter({ refuseBegin: true });
		host.setAdapter(adapter);
		expect(store.state).toBe('Selected');

		controls.axis = 'X';
		controls.dragging = true;
		host.onControlsMouseDown();
		host.onDraggingChanged(true);
		expect(adapter.beginCalls).toBe(1);
		expect(session.previews).toHaveLength(0);
		expect(orbit.get().enabled).toBe(true); // never disabled
		expect(store.state).toBe('Selected'); // never entered Dragging

		host.onControlsMouseUp();
		controls.dragging = false;
		host.onDraggingChanged(false);
		expect(session.commits).toBe(0);
		expect(store.state).toBe('Selected');
	});

	it('an unsupported handle axis never reaches the adapter (defensive begin guard)', () => {
		const { adapter, session } = makeAdapter({ policy: ROTATE_Y_ONLY_POLICY });
		host.setAdapter(adapter);
		store.setMode('rotate');
		host.refreshConfiguration();
		controls.axis = 'X';
		host.onControlsMouseDown();
		expect(adapter.beginCalls).toBe(0);
		expect(session.previews).toHaveLength(0);
		expect(orbit.get().enabled).toBe(true);
	});
});

describe('EditorGizmoHostController — cancel paths', () => {
	let store: EditorInteractionStore;
	let controls: ReturnType<typeof makeHostControls>;
	let orbit: ReturnType<typeof makeOrbit>;
	let host: EditorGizmoHostController;
	let draft: ReturnType<typeof makeAdapter>;

	beforeEach(() => {
		store = new EditorInteractionStore();
		controls = makeHostControls();
		orbit = makeOrbit();
		draft = makeAdapter();
		host = new EditorGizmoHostController(makeDeps(store, controls, orbit));
		host.setAdapter(draft.adapter);
	});

	function beginDrag() {
		controls.axis = 'X';
		controls.dragging = true;
		host.onControlsMouseDown();
		host.onDraggingChanged(true);
		expect(store.state).toBe('Dragging');
	}

	it('mid-drag Escape: adapter.cancel("escape") once + DRAG_END cancelled; a late mouseUp cannot commit (target persists → Selected)', () => {
		beginDrag();
		expect(host.onKeyDown({ key: 'Escape' })).toBe(true);
		expect(draft.session.cancels).toEqual(['escape']);
		expect(store.state).toBe('Selected'); // camera-style: target persists
		expect(orbit.get().enabled).toBe(true);
		// Late natural mouseUp is inert.
		host.onControlsObjectChange('X');
		host.onControlsMouseUp();
		controls.dragging = false;
		host.onDraggingChanged(false);
		expect(draft.session.commits).toBe(0);
		expect(draft.session.previews).toEqual([]);
		expect(store.state).toBe('Selected');
	});

	it('placement-style Escape: the follow-up detached sync produces Idle', () => {
		beginDrag();
		host.onKeyDown({ key: 'Escape' });
		host.setAdapter(null); // placement cancel deselects → composer resolves null
		expect(store.state).toBe('Idle');
		expect(draft.session.cancels).toEqual(['escape']);
	});

	it('target switch mid-drag: cancel first ("target-change"), then detach/attach + sync; a new drag is a fresh begin', () => {
		beginDrag();
		const next = makeAdapter({ key: 'camera:node:pos' });
		host.setAdapter(next.adapter);
		expect(draft.session.cancels).toEqual(['target-change']);
		expect(store.state).toBe('Selected');
		expect(controls.attachedObject).toBe(next.adapter.proxy);
		// A fresh drag begins fresh — never carries the old session.
		controls.axis = 'Y';
		host.onControlsMouseDown();
		expect(next.adapter.beginCalls).toBe(1);
		expect(draft.session.commits).toBe(0);
	});

	it('every explicit cancel reason routes adapter.cancel once; a second cancel is a no-op', () => {
		for (const reason of ['pointer-cancel', 'view-change', 'external-replacement'] as const) {
			draft.session.cancels = [];
			beginDrag();
			expect(host.cancelSession(reason)).toBe(true);
			expect(draft.session.cancels).toEqual([reason]);
			expect(store.state).toBe('Selected');
			expect(host.cancelSession(reason)).toBe(false); // no double cancel
			expect(draft.session.cancels).toEqual([reason]);
			// Natural mouseUp afterwards can never commit.
			host.onControlsMouseUp();
			expect(draft.session.commits).toBe(0);
		}
	});

	it('unmount with a live drag cancels once, detaches exactly once more, and leaves the FSM consistent', () => {
		beginDrag();
		const detachesBefore = controls.detachCount; // the pre-attach detach
		host.dispose();
		expect(draft.session.cancels).toEqual(['unmount']);
		expect(store.state).toBe('Selected');
		expect(controls.detachCount).toBe(detachesBefore + 1);
	});

	it('Escape with no live session is not handled', () => {
		expect(host.onKeyDown({ key: 'Escape' })).toBe(false);
		expect(draft.session.cancels).toHaveLength(0);
	});

	it('window blur clears Shift and restores the configured rotation snap (keyup may never arrive)', () => {
		const controls = makeHostControls();
		const orbit = makeOrbit();
		const host = new EditorGizmoHostController(
			makeDeps(store, controls, orbit, ({ rotationSnapEnabled: true }))
		);
		host.setAdapter(makeAdapter().adapter);
		expect(controls.rotationSnap).toBe(Math.PI / 12);

		host.onKeyDown({ key: 'Shift' });
		expect(controls.rotationSnap).toBe(0);
		// Blur while Shift is held: the keyup never fires in the app, so the
		// host must restore the configured snap row itself.
		host.onWindowBlur();
		expect(host.isShiftHeld()).toBe(false);
		expect(controls.rotationSnap).toBe(Math.PI / 12);
	});
});