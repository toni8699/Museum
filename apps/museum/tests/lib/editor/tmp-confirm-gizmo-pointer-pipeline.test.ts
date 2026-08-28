/**
 * REGRESSION SEED — camera-node gizmo pointer pipeline ("drag rotates the
 * view instead of moving the node").
 *
 * Wires the REAL three.js TransformControls + REAL EditorGizmoHostController +
 * REAL camera gizmo adapter + a fixture store, then dispatches synthetic
 * pointer events at the gizmo the way the browser would.
 *
 * The live root cause lives at the component boundary: entering the transform
 * interaction used to make `isFramingBlocked` true, unmounting the selected
 * `EditorCameraHelpers` root and cancelling the host session as a target
 * change. Component contract coverage pins that mount rule; this lower-level
 * seed keeps the real Three pointer/session pipeline and refusal defenses.
 *
 * Delete or promote these cases into the permanent suites later.
 */

import { describe, expect, it } from 'vitest';
import {
	PerspectiveCamera,
	Scene,
	Vector3
} from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { createCameraGizmoAdapter } from '$lib/editor/gizmo/camera-gizmo-adapter.svelte';
import {
	EditorGizmoHostController,
	type EditorGizmoHostControls
} from '$lib/editor/gizmo/editor-gizmo-host-controller';
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
		controls: transformControls as unknown as EditorGizmoHostControls,
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
		// three r175 fires dragging-changed(true) BEFORE mouseDown, so the
		// session is null in onDraggingChanged there — the host now emits
		// DRAG_START from onControlsMouseDown instead (exactly-once via the
		// dragActive guard), so the FSM enters 'Dragging' again and DRAG_END
		// fires on the natural release.
		expect(dragStarted).toBe(1);
		expect(dragEnded).toBe(1);
	});

	const buildHarness = () => {
		(globalThis as { document?: unknown }).document = { pointerLockElement: null };
		const scene = new Scene();
		const camera = new PerspectiveCamera(55, VIEW_W / VIEW_H, 0.05, 120);
		camera.position.set(4, 3, 6);
		camera.updateProjectionMatrix();
		camera.updateMatrixWorld(true);
		scene.add(camera);
		const dom = makeFakeDom();
		const transformControls = new TransformControls(camera, dom as unknown as HTMLElement);
		scene.add(transformControls.getHelper());
		return { scene, camera, dom, transformControls };
	};

	const probeHover = (
		dom: ReturnType<typeof makeFakeDom>,
		transformControls: TransformControls,
		camera: PerspectiveCamera,
		center: Vector3
	): [number, number] => {
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
		return hoverPixel!;
	};

	it('a preview mode flip mid-drag refuses the commit but NO LONGER leaks the transaction (facade fix)', () => {
		const store = createFixtureEditorStore();
		const node = store.document.navigationNodes.find((n) => n.id === 'tour-a')!;
		expect(store.selectionActions.selectNavigationNode(node.id)).toBe(true);

		// Paused Director preview authors freely — a drag can begin here.
		expect(store.previewSequence('director')).toBe(true);
		store.pauseCameraPreview();
		expect(store.isDocumentMutationBlocked).toBe(false);

		const { scene, camera, dom, transformControls } = buildHarness();
		const runtime = store.getRuntimeNavigationNode(node.id)!;
		camera.lookAt(...(runtime.position as Vec3));
		camera.updateMatrixWorld(true);

		const root = new Object3D();
		root.position.set(...(runtime.position as Vec3));
		scene.add(root);
		root.updateMatrixWorld(true);
		store.registerCameraHelperRoot(node.id, 'position', root);

		const adapter = createCameraGizmoAdapter({ store })!;
		expect(adapter).not.toBeNull();
		const orbit = { enabled: true };
		const host = new EditorGizmoHostController({
			controls: transformControls as unknown as EditorGizmoHostControls,
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
		transformControls.addEventListener('objectChange', () =>
			host.onControlsObjectChange(transformControls.axis)
		);
		transformControls.addEventListener('mouseUp', () => host.onControlsMouseUp());
		scene.updateMatrixWorld(true);

		// Document positions are room-local — baseline against the authored
		// pre-drag local position (captured before the drag), not the
		// world-space runtime node.
		const authoredBefore = [
			...store.document.navigationNodes.find((n) => n.id === node.id)!.position
		] as Vec3;

		const hover = probeHover(dom, transformControls, camera, new Vector3(...(runtime.position as Vec3)));
		dom.dispatch('pointerdown', pointerEvent(hover[0], hover[1]));
		expect(transformControls.dragging).toBe(true);
		expect(orbit.enabled).toBe(false); // live drag owns the gesture
		expect(store.isDocumentUndoBlocked).toBe(true); // the drag holds the transaction

		// Move the proxy mid-drag (preview() writes the node document).
		root.updateMatrixWorld(true);
		dom.dispatch('pointermove', pointerEvent(hover[0] + 60, hover[1] - 30, -1));
		const dragged = store.document.navigationNodes.find((n) => n.id === node.id)!.position;
		expect(distance3(dragged, authoredBefore)).toBeGreaterThan(0);

		// THE TRIGGER: an unguarded preview-state write lands mid-transaction
		// and flips isDocumentMutationBlocked while the transaction is open.
		// Every preview *command* refuses mid-transaction — but the command
		// module's internal `previewController.preview` writes are exactly the
		// class of unguarded mutation that can flip the block mid-drag
		// (current or future code paths); mirror one here.
		const previewController = (
			store as unknown as {
				previewController: { preview: unknown };
			}
		).previewController;
		previewController.preview = { ...store.cameraPreview!, mode: 'visitor' };
		expect(store.isDocumentMutationBlocked).toBe(true);

		// Release: mouseUp → session.commit → commitDocumentTransaction.
		// PRE-FIX this refused WITHOUT closing — the leaked transaction then
		// disabled every later gizmo drag (begin refuses) while the gizmo
		// stayed attached, so orbit ate every drag (the reported bug).
		dom.dispatch('pointerup', pointerEvent(hover[0] + 60, hover[1] - 30));
		expect(transformControls.dragging).toBe(false);
		expect(orbit.enabled).toBe(true);

		// POST-FIX: the refusal rolled back and CLOSED the transaction.
		expect(store.isDocumentUndoBlocked).toBe(false);
		expect(store.transformInteractionActive).toBe(false);
		// The un-committable drag was rolled back to the pre-drag document.
		const restored = store.document.navigationNodes.find((n) => n.id === node.id)!.position;
		expect(distance3(restored, authoredBefore)).toBeLessThan(1e-9);

		// And once the block clears, the next drag begins normally again.
		store.stopCameraPreview();
		expect(store.beginDocumentTransaction()).toBe(true);
		store.cancelDocumentTransaction();
	});

	it('a refused begin releases TransformControls\' already-started drag and leaves orbit enabled', () => {
		const store = createFixtureEditorStore();
		const node = store.document.navigationNodes.find((n) => n.id === 'tour-a')!;
		expect(store.selectionActions.selectNavigationNode(node.id)).toBe(true);

		// Leaked open transaction (any begin-without-commit path): begin
		// refuses. With the composer gate this state also detaches the gizmo;
		// at the controller level the refused grab must stay inert.
		expect(store.beginDocumentTransaction()).toBe(true);

		const { scene, camera, dom, transformControls } = buildHarness();
		const runtime = store.getRuntimeNavigationNode(node.id)!;
		camera.lookAt(...(runtime.position as Vec3));
		camera.updateMatrixWorld(true);

		const root = new Object3D();
		root.position.set(...(runtime.position as Vec3));
		scene.add(root);
		root.updateMatrixWorld(true);
		store.registerCameraHelperRoot(node.id, 'position', root);

		const adapter = createCameraGizmoAdapter({ store })!;
		const orbit = { enabled: true };
		const host = new EditorGizmoHostController({
			controls: transformControls as unknown as EditorGizmoHostControls,
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

		const hover = probeHover(dom, transformControls, camera, new Vector3(...(runtime.position as Vec3)));
		dom.dispatch('pointerdown', pointerEvent(hover[0], hover[1]));
		// begin() refused, so the host released the control drag (r175 had
		// already set `dragging`) and left orbit enabled — the click is inert
		// instead of phantom-dragging the proxy while the view rotates.
		expect(transformControls.dragging).toBe(false);
		expect(orbit.enabled).toBe(true);
	});
});

// three's Object3D is imported lazily via the scene graph above; keep the
// import local to avoid polluting other temp suites.
import { Object3D } from 'three';
