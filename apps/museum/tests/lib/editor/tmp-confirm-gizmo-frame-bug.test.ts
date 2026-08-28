/**
 * TEMPORARY diagnostic — result of assessing the reviewer finding.
 *
 * FINDING VERDICT: REFUTED on its root cause.
 * The claim was that `EditorCameraHelpers.syncFromStore` places helper roots
 * with raw room-local `node.position`, displacing the TransformControls gizmo
 * by the room frame (origin/yaw/elevation). In fact `syncFromStore` reads
 * `store.getRuntimeNavigationNode(...)`, whose authored branch returns
 * `store.scene.navigationNodes` — and `resolveSceneDocument`
 * (src/lib/content/scene.ts:466) already maps node positions through
 * `rooms.point(...)` into WORLD space. Helper roots, markers, labels, frustum,
 * and the gizmo proxy all sit on the same world pose. A fix shaped as the
 * reviewer suggested (re-convert through `rooms.point`) would DOUBLE-convert
 * and introduce the very displacement described.
 *
 * The frustum-gating (bug 2) store inputs ARE confirmed below: paused
 * Director + selected node leaves the moving preview frustum hidden while the
 * static framing frustum stays; playing Director shows both.
 *
 * Delete this file after assessment.
 */

import { describe, expect, it } from 'vitest';
import { Object3D, Vector3 } from 'three';
import type { Vec3 } from '$lib/types/scene';
import { createCameraGizmoAdapter } from '$lib/editor/gizmo/camera-gizmo-adapter.svelte';
import { createFixtureEditorStore } from './editor-test-utils';
import type { EditorStore } from '$lib/editor/editor-store.svelte';

function worldOf(root: Object3D): Vec3 {
	const v = new Vector3();
	root.getWorldPosition(v);
	return [v.x, v.y, v.z];
}

function distance3(a: Vec3, b: Vec3): number {
	return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
}

/** EXACT replica of `EditorCameraHelpers.syncFromStore` placement. */
function placeHelperRootComponentStyle(
	store: EditorStore,
	nodeId: string,
	handle: 'position' | 'target'
): Object3D {
	const node = store.getRuntimeNavigationNode(nodeId)!;
	const root = new Object3D();
	const point = handle === 'position' ? node.position : node.cameraTarget;
	root.position.set(...point);
	store.registerCameraHelperRoot(nodeId, handle, root);
	return root;
}

describe('TMP — reviewer finding falsification (camera-node gizmo frame)', () => {
	it('getRuntimeNavigationNode returns WORLD coordinates for authored nodes', () => {
		const store = createFixtureEditorStore();
		// tour-b lives in `departure` (frame origin [-17, 0], yaw -90°): local
		// [0, 1.65, 0] resolves to world [-17, 1.65, 0].
		const node = store.document.navigationNodes.find((n) => n.id === 'tour-b')!;
		const trueWorld = store.rooms.point(node.roomId, node.position);
		const authored = store.getRuntimeNavigationNode(node.id)!;
		expect(distance3(authored.position, trueWorld)).toBeLessThan(1e-6);
		expect(distance3(authored.position, node.position)).toBeGreaterThan(16);
	});

	it('component-style helper placement lands exactly on the true camera pose', () => {
		const store = createFixtureEditorStore();
		const node = store.document.navigationNodes.find((n) => n.id === 'tour-b')!;
		const trueWorld = store.rooms.point(node.roomId, node.position);
		const root = placeHelperRootComponentStyle(store, node.id, 'position');
		expect(distance3(worldOf(root), trueWorld)).toBeLessThan(1e-6);
	});

	it('a full gizmo translate session on a rotated-room node moves the node exactly by the world drag delta', () => {
		const store = createFixtureEditorStore();
		const node = store.document.navigationNodes.find((n) => n.id === 'tour-b')!;
		expect(store.selectionActions.selectNavigationNode(node.id)).toBe(true);

		const trueStart = store.rooms.point(node.roomId, node.position);
		placeHelperRootComponentStyle(store, node.id, 'position');

		const adapter = createCameraGizmoAdapter({ store })!;
		const session = adapter.begin({ targetKey: adapter.key });
		expect(session).not.toBeNull();
		const root = store.getCameraHelperRoot(node.id, 'position')!;
		root.position.x += 1;
		session!.preview({ targetKey: adapter.key, axis: 'X' });
		session!.commit({ targetKey: adapter.key });

		const committed = store.document.navigationNodes.find((n) => n.id === node.id)!;
		const newWorld = store.rooms.point(committed.roomId, committed.position);
		expect(
			distance3(newWorld, [trueStart[0]! + 1, trueStart[1]!, trueStart[2]!])
		).toBeLessThan(1e-6);
	});
});

describe('TMP — frustum gating inputs (bug 2) — CONFIRMED', () => {
	it('paused Director + selected node: mutation not blocked (static frustum stays, moving frustum hidden)', () => {
		const store = createFixtureEditorStore();
		const node = store.document.navigationNodes.find((n) => n.id === 'tour-a')!;
		expect(store.selectionActions.selectNavigationNode(node.id)).toBe(true);
		expect(store.previewSequence('director')).toBe(true);
		store.pauseCameraPreview();

		const preview = store.cameraPreview!;
		expect(preview.mode).toBe('director');
		expect(preview.transport).toBe('paused');

		// Inputs read by EditorCameraRig.showDirectorPreviewFrustum and
		// EditorCameraFramingHelpers.framingPose:
		expect(store.isVisitorCameraPreview).toBe(false);
		expect(store.isCameraPreviewPlaying).toBe(false);
		expect(store.isDocumentMutationBlocked).toBe(false); // paused Director authors freely
		expect(store.navigationSelection?.kind).toBe('node'); // selectedFraming === true
		// ⇒ showDirectorPreviewFrustum = director && (playing || !selectedFraming) = FALSE
		//   (no moving frustum while scrubbing), while framingPose's guard
		//   (visitor && playing) is false ⇒ the selected node's static frustum
		//   stays. Exactly the reported scrub behavior.
	});

	it('playing Director: two-frustum combination (preview shows, static frustum guard stays false)', () => {
		const store = createFixtureEditorStore();
		const node = store.document.navigationNodes.find((n) => n.id === 'tour-a')!;
		expect(store.selectionActions.selectNavigationNode(node.id)).toBe(true);
		expect(store.previewSequence('director')).toBe(true);

		const preview = store.cameraPreview!;
		expect(preview.transport).toBe('playing');
		// showDirectorPreviewFrustum: playing ⇒ TRUE (moving frustum appears).
		expect(preview.mode === 'director' && preview.transport === 'playing').toBe(true);
		// framingPose guard (isVisitorCameraPreview && isCameraPreviewPlaying):
		// visitor is FALSE ⇒ guard false ⇒ the selected node's static frustum
		// ALSO stays ⇒ two amber frustums during Director play.
		expect(store.isVisitorCameraPreview).toBe(false);
		expect(store.isCameraPreviewPlaying).toBe(true);
		// And the document is mutation-blocked ⇒ the transform gizmo detaches
		// mid-play (gates.previewActive) while the frustums remain.
		expect(store.isDocumentMutationBlocked).toBe(true);
	});
});
