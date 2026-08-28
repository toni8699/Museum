/**
 * TEMPORARY — headless repro of the camera-node gizmo pointer pipeline.
 *
 * Wires the REAL three.js TransformControls + REAL EditorGizmoHostController +
 * REAL camera gizmo adapter + a fixture store, then dispatches synthetic
 * pointer events at the gizmo the way the browser would. If hover/drag works
 * here, the adapter/session chain is clean and the app-only difference is
 * DOM-level (canvas listener order, threlte interactivity), not the gizmo
 * session pipeline.
 *
 * Delete this file after assessment.
 */

import { describe, expect, it } from 'vitest';
import {
	PerspectiveCamera,
	Scene,
	Vector3
} from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { createCameraGizmoAdapter } from '$lib/editor/gizmo/camera-gizmo-adapter.svelte';
import { EditorGizmoHostController } from '$lib/editor/gizmo/editor-gizmo-host-controller';
import { createFixtureEditorStore } from './editor-test-utils';
import type { Vec3 } from '$lib/types/scene';

const VIEW_W = 800;
const VIEW_H = 600;

/** Minimal domElement surface TransformControls + the pointer pipeline touch. */
function makeFakeDom() {
	const listeners = new Map<string, Array<(event: unknown) => void>>();
	return {
		style: {} as Record<string, string>,
		addEventListener(type: string, listener: (event: unknown) => void) {
			const list = listeners.get(type) ?? [];
			list.push(listener);
			listeners.set(type, list);
		},
		removeEventListener(type: string, listener: (event: unknown) => void) {
			listeners.set(
				type,
				(listeners.get(type) ?? []).filter((candidate) => candidate !== listener)
			);
		},
		getBoundingClientRect() {
			return {
				left: 0,
				top: 0,
				right: VIEW_W,
				bottom: VIEW_H,
				width: VIEW_W,
				height: VIEW_H,
				x: 0,
				y: 0
			};
		},
		setPointerCapture() {},
		releasePointerCapture() {},
		hasPointerCapture: () => false,
		ownerDocument: { pointerLockElement: null },
		dispatch(type: string, event: unknown) {
			for (const listener of [...(listeners.get(type) ?? [])]) listener(event);
		}
	};
}

function pointerEvent(clientX: number, clientY: number, button = 0) {
	return {
		clientX,
		clientY,
		button,
		pointerId: 1,
		pointerType: 'mouse',
		preventDefault() {},
		stopImmediatePropagation() {},
		stopPropagation() {}
	};
}

/** Project a world point to canvas pixels through the same camera math. */
function toPixels(world: Vector3, camera: PerspectiveCamera): [number, number] {
	const ndc = world.clone().project(camera);
	return [(ndc.x * 0.5 + 0.5) * VIEW_W, (-ndc.y * 0.5 + 0.5) * VIEW_H];
}

function distance3(a: Vec3, b: Vec3): number {
	return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
}

describe('TMP — camera gizmo pointer pipeline (real TransformControls)', () => {
	it('hover over the translate arrow sets axis; pointerdown starts a drag, disables orbit, and the session writes the node', () => {
		// TransformControls' onPointerDown reads the bare `document` global.
		(globalThis as { document?: unknown }).document = { pointerLockElement: null };

		const store = createFixtureEditorStore();
		const node = store.document.navigationNodes.find((n) => n.id === 'tour-b')!;
		expect(store.selectionActions.selectNavigationNode(node.id)).toBe(true);

		const scene = new Scene();
		const camera = new PerspectiveCamera(55, VIEW_W / VIEW_H, 0.05, 120);
		camera.position.set(4, 3, 6);
		camera.lookAt(0, 1.65, 0);
		camera.updateProjectionMatrix();
		camera.updateMatrixWorld(true);
		scene.add(camera);

		const dom = makeFakeDom();
		const transformControls = new TransformControls(
			camera,
			dom as unknown as HTMLElement
		);
		scene.add(transformControls.getHelper());

		// Helper root exactly the way EditorCameraHelpers mounts it (runtime
		// node = world coordinates).
		const runtime = store.getRuntimeNavigationNode(node.id)!;
		const root = new Object3D();
		root.position.set(...(runtime.position as Vec3));
		scene.add(root);
		root.updateMatrixWorld(true);
		store.registerCameraHelperRoot(node.id, 'position', root);

		const adapter = createCameraGizmoAdapter({ store })!;
		expect(adapter).not.toBeNull();

		const orbit = { enabled: true };
		let dragStarted = 0;
		let dragEnded = 0;
		const host = new EditorGizmoHostController({
			controls: transformControls as unknown as Parameters<
				typeof EditorGizmoHostController
			>[0]['controls'],
			getOrbit: () => orbit,
			getMode: () => 'translate',
			getSnapPreferences: () => ({
				translationSnap: 0,
				rotationSnapDegrees: 15,
				scaleSnap: 0,
				translationSnapEnabled: false,
				rotationSnapEnabled: false
			}),
			dispatch: (event) => {
				if (event.type === 'DRAG_START') dragStarted += 1;
				if (event.type === 'DRAG_END') dragEnded += 1;
			},
			recomputeCursor: () => {},
			invalidate: () => {}
		});
		host.setAdapter(adapter);
		expect(transformControls.object).toBe(root);

		// The app host wires these four listeners (EditorTransformControlsHost
		// lines 88-98); mirror that wiring here.
		transformControls.addEventListener('mouseDown', () => host.onControlsMouseDown());
		transformControls.addEventListener('objectChange', () =>
			host.onControlsObjectChange(transformControls.axis)
		);
		transformControls.addEventListener('mouseUp', () => host.onControlsMouseUp());
		transformControls.addEventListener('dragging-changed', (event) =>
			host.onDraggingChanged((event as { value: unknown }).value)
		);

		scene.updateMatrixWorld(true);

		// Probe a grid of pixels around the gizmo's world position for a hover
		// hit, like a user moving the mouse across the arrows.
		const center = new Vector3(...(runtime.position as Vec3));
		let hoverPixel: [number, number] | null = null;
		for (let dx = -140; dx <= 140 && !hoverPixel; dx += 8) {
			for (let dy = -140; dy <= 140 && !hoverPixel; dy += 8) {
				const [px, py] = toPixels(center, camera);
				const x = Math.round(px + dx);
				const y = Math.round(py + dy);
				dom.dispatch('pointermove', pointerEvent(x, y));
				if (transformControls.axis !== null) hoverPixel = [x, y];
			}
		}

		// THE decisive assertion: does hovering the rendered gizmo set an axis?
		expect(hoverPixel).not.toBeNull();

		// Then the drag: pointerdown at the hover pixel starts a drag,
		// dispatches mouseDown → host disables orbit.
		dom.dispatch('pointerdown', pointerEvent(hoverPixel![0], hoverPixel![1]));
		expect(transformControls.dragging).toBe(true);
		expect(orbit.enabled).toBe(false);

		// Move the gizmo and release: the proxy follows, and the session write
		// path moves the node in world space along the dragged handle.
		const before = store.rooms.point(
			node.roomId,
			store.document.navigationNodes.find((n) => n.id === node.id)!.position
		);
		const proxyBefore = root.position.clone();
		root.updateMatrixWorld(true);
		// PointerEvents spec: a move without a button change reports button -1
		// (three's pointerMove guard requires it).
		dom.dispatch('pointermove', pointerEvent(hoverPixel![0] + 60, hoverPixel![1] - 30, -1));
		dom.dispatch('pointerup', pointerEvent(hoverPixel![0] + 60, hoverPixel![1] - 30));
		expect(root.position.distanceTo(proxyBefore)).toBeGreaterThan(0);

		const after = store.rooms.point(
			node.roomId,
			store.document.navigationNodes.find((n) => n.id === node.id)!.position
		);
		// The session write path works end-to-end: the drag moved the node in
		// world space along whichever handle the probe happened to hover.
		expect(distance3(after, before)).toBeGreaterThan(0);
		// NOTE: DRAG_START never fires in this wiring — three r175 sets
		// `dragging` (dispatching 'dragging-changed' via the property setter)
		// BEFORE dispatching 'mouseDown', so host.onDraggingChanged(true) always
		// sees `session === null` and never dispatches DRAG_START/DRAG_END. The
		// FSM never enters 'Dragging'. Documented degradation, not a blocker.
		expect(dragStarted).toBe(0);
		expect(dragEnded).toBe(0);
	});

	it('a stuck-open history transaction reproduces the EXACT reported symptom: gizmo visible, drag refused, orbit rotates', () => {
		(globalThis as { document?: unknown }).document = { pointerLockElement: null };

		const store = createFixtureEditorStore();
		const node = store.document.navigationNodes.find((n) => n.id === 'tour-a')!;
		expect(store.selectionActions.selectNavigationNode(node.id)).toBe(true);

		// Simulate a leaked transaction: open one and never close it (any
		// path that calls beginDocumentTransaction and then fails to commit —
		// e.g. commitDocumentTransaction refusing mid-preview — leaves this).
		expect(store.beginDocumentTransaction()).toBe(true);
		expect(store.isDocumentUndoBlocked).toBe(true);

		const scene = new Scene();
		const runtime = store.getRuntimeNavigationNode(node.id)!;
		const camera = new PerspectiveCamera(55, VIEW_W / VIEW_H, 0.05, 120);
		camera.position.set(4, 3, 6);
		camera.lookAt(...(runtime.position as Vec3));
		camera.updateProjectionMatrix();
		camera.updateMatrixWorld(true);
		scene.add(camera);

		const dom = makeFakeDom();
		const transformControls = new TransformControls(camera, dom as unknown as HTMLElement);
		scene.add(transformControls.getHelper());

		const root = new Object3D();
		root.position.set(...(runtime.position as Vec3));
		scene.add(root);
		root.updateMatrixWorld(true);
		store.registerCameraHelperRoot(node.id, 'position', root);

		// The adapter RESOLVES (gates.previewActive never checks
		// isDocumentUndoBlocked) — the gizmo is visible and attached.
		const adapter = createCameraGizmoAdapter({ store })!;
		expect(adapter).not.toBeNull();

		const orbit = { enabled: true };
		const host = new EditorGizmoHostController({
			controls: transformControls as unknown as Parameters<
				typeof EditorGizmoHostController
			>[0]['controls'],
			getOrbit: () => orbit,
			getMode: () => 'translate',
			getSnapPreferences: () => ({
				translationSnap: 0,
				rotationSnapDegrees: 15,
				scaleSnap: 0,
				translationSnapEnabled: false,
				rotationSnapEnabled: false
			}),
			dispatch: () => {},
			recomputeCursor: () => {},
			invalidate: () => {}
		});
		host.setAdapter(adapter);
		transformControls.addEventListener('mouseDown', () => host.onControlsMouseDown());
		scene.updateMatrixWorld(true);

		// Hover the gizmo: axis sets, the user sees a live gizmo.
		const center = new Vector3(...(runtime.position as Vec3));
		let hoverPixel: [number, number] | null = null;
		for (let dx = -140; dx <= 140 && !hoverPixel; dx += 8) {
			for (let dy = -140; dy <= 140 && !hoverPixel; dy += 8) {
				const [px, py] = toPixels(center, camera);
				const x = Math.round(px + dx);
				const y = Math.round(py + dy);
				dom.dispatch('pointermove', pointerEvent(x, y));
				if (transformControls.axis !== null) hoverPixel = [x, y];
			}
		}
		expect(hoverPixel).not.toBeNull();

		// Pointerdown: TransformControls starts dragging (it does not know
		// about the refusal), mouseDown fires, adapter.begin() returns null
		// (beginDocumentTransaction refuses on isDocumentUndoBlocked)…
		dom.dispatch('pointerdown', pointerEvent(hoverPixel![0], hoverPixel![1]));
		expect(transformControls.dragging).toBe(true);
		// …so orbit is NEVER disabled: the view rotates for the whole drag.
		expect(orbit.enabled).toBe(true);
	});
});

// three's Object3D is imported lazily via the scene graph above; keep the
// import local to avoid polluting other temp suites.
import { Object3D } from 'three';
