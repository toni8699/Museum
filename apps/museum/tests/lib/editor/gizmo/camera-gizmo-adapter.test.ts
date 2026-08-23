/**
 * S7 step 4 — camera-gizmo-adapter session tests.
 *
 * Drives `createCameraGizmoAdapter` against a real `EditorStore` with
 * registered helper roots, exercising the session seams the monolith ran
 * inline: node position/target previews (world → room-local), authored-node
 * always-commit (no epsilon), pending-node draft path, path-anchor and
 * view-target epsilon no-ops, cancel restore, and null resolution when a
 * selection has no live helper root.
 */

import { describe, expect, it } from 'vitest';
import { Object3D, Vector3 } from 'three';
import type { Vec3 } from '$lib/types/scene';
import { createCameraGizmoAdapter } from '$lib/editor/gizmo/camera-gizmo-adapter.svelte';
import { deriveShowAxes } from '$lib/editor/gizmo/editor-gizmo-policy';
import { createFixtureEditorStore, createRelicFixtureEditorStore } from '../editor-test-utils';
import { cloneFixtureDocument } from '../../content/__fixtures__/load-fixture-scene';
import {
	EDITOR_CAMERA_PATH_MOVE_EPSILON,
	getScenePathAnchorWorldPosition
} from '$lib/editor/camera/editor-camera-path';
import { EDITOR_CAMERA_VIEW_MOVE_EPSILON } from '$lib/editor/camera/editor-camera-view';

function makeRoot(position: Vec3): Object3D {
	const root = new Object3D();
	root.position.set(position[0], position[1], position[2]);
	return root;
}

function worldDistance(a: Vec3, b: Vec3): number {
	return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
}

describe('camera-gizmo-adapter — authored node sessions', () => {
	it('resolves null without a navigation selection or a live helper root', () => {
		const store = createFixtureEditorStore();
		// No selection at all.
		expect(createCameraGizmoAdapter({ store })).toBeNull();

		// Navigation selection present, but the helper root is unmounted.
		const node = store.document.navigationNodes[0]!;
		expect(store.selectionActions.selectNavigationNode(node.id)).toBe(true);
		expect(store.cameraSelection).toMatchObject({ nodeId: node.id, handle: 'position' });
		expect(createCameraGizmoAdapter({ store })).toBeNull();
	});

	it('camera policy allows full XYZ translate axes (pre-S7 monolith parity)', () => {
		const store = createFixtureEditorStore();
		const node = store.document.navigationNodes[0]!;
		expect(store.selectionActions.selectNavigationNode(node.id)).toBe(true);

		const startWorld = store.rooms.point(node.roomId, node.position);
		const root = makeRoot(startWorld);
		store.registerCameraHelperRoot(node.id, 'position', root);

		const adapter = createCameraGizmoAdapter({ store })!;
		expect(adapter.policy.allowedModes).toEqual(new Set(['translate', 'rotate']));
		expect(adapter.policy.allowedAxes('translate')).toEqual(
			new Set(['x', 'y', 'z', 'xy', 'xz', 'yz', 'xyz'])
		);
		expect(adapter.policy.allowedAxes('rotate')).toEqual(new Set(['x', 'y', 'z']));
		// The host derives showX/showY/showZ from the policy, so the Y handle
		// must render — the S7 extraction previously hid it (XZ-only).
		expect(deriveShowAxes('translate', adapter.policy)).toEqual({
			showX: true,
			showY: true,
			showZ: true
		});

		// The Y handle is not decorative: a Y-axis drag moves the node's eye
		// height (position[1]) and commits one history entry like any other
		// authored node drag.
		const session = adapter.begin({ targetKey: adapter.key })!;
		const raised = [startWorld[0]!, startWorld[1]! + 0.5, startWorld[2]!] as Vec3;
		root.position.set(raised[0], raised[1], raised[2]);
		session.preview({ targetKey: adapter.key, axis: 'Y' });
		const expectedLocal = store.rooms.localPoint(node.roomId, raised);
		const previewed = store.document.navigationNodes.find(
			(candidate) => candidate.id === node.id
		)!;
		expect(previewed.position[1]).toBeCloseTo(expectedLocal[1]!);

		const before = store.historyVersion;
		session.commit({ targetKey: adapter.key });
		expect(store.historyVersion).toBe(before + 1);
		const committed = store.document.navigationNodes.find(
			(candidate) => candidate.id === node.id
		)!;
		expect(committed.position[1]).toBeCloseTo(expectedLocal[1]!);
	});

	it('node position: room-local preview writes, exactly one commit, exact root tracking', () => {
		const store = createFixtureEditorStore();
		const node = store.document.navigationNodes[0]!;
		expect(store.selectionActions.selectNavigationNode(node.id)).toBe(true);

		const startWorld = store.rooms.point(node.roomId, node.position);
		const root = makeRoot(startWorld);
		store.registerCameraHelperRoot(node.id, 'position', root);

		const adapter = createCameraGizmoAdapter({ store });
		expect(adapter).not.toBeNull();
		expect(adapter!.key).toBe(`camera:${node.id}:position`);
		expect(adapter!.policy.allowedModes).toEqual(new Set(['translate', 'rotate']));

		const session = adapter!.begin({ targetKey: adapter!.key });
		expect(session).not.toBeNull();
		expect(store.isDocumentTransactionActive).toBe(true);

		// Preview after begin: the adapter converts the proxy world position
		// to room-local before writing.
		const movedWorld = [startWorld[0]! + 2, startWorld[1]!, startWorld[2]!] as Vec3;
		root.position.set(movedWorld[0], movedWorld[1], movedWorld[2]);
		session!.preview({ targetKey: adapter!.key, axis: 'X' });
		const expectedLocal = store.rooms.localPoint(node.roomId, movedWorld);
		const previewed = store.document.navigationNodes.find(
			(candidate) => candidate.id === node.id
		)!;
		expect(previewed.position[0]).toBeCloseTo(expectedLocal[0]!);
		expect(previewed.position[2]).toBeCloseTo(expectedLocal[2]!);
		expect(store.canUndo).toBe(false); // in-flight

		const before = store.historyVersion;
		session!.commit({ targetKey: adapter!.key });
		expect(store.historyVersion).toBe(before + 1);
		expect(store.isDocumentTransactionActive).toBe(false);
		const committed = store.document.navigationNodes.find(
			(candidate) => candidate.id === node.id
		)!;
		expect(committed.position[0]).toBeCloseTo(expectedLocal[0]!);
	});

	it('node position: a sub-ε drag still commits one history entry (monolith parity)', () => {
		const store = createFixtureEditorStore();
		const node = store.document.navigationNodes[0]!;
		expect(store.selectionActions.selectNavigationNode(node.id)).toBe(true);

		const startWorld = store.rooms.point(node.roomId, node.position);
		const root = makeRoot(startWorld);
		store.registerCameraHelperRoot(node.id, 'position', root);

		const adapter = createCameraGizmoAdapter({ store })!;
		const session = adapter.begin({ targetKey: adapter.key })!;

		// Far below either epsilon: the monolith committed node drags
		// unconditionally, and the plan forbids adding a node epsilon.
		root.position.set(startWorld[0]! + 0.0001, startWorld[1]!, startWorld[2]!);
		session!.preview({ targetKey: adapter!.key, axis: 'X' });

		const before = store.historyVersion;
		session.commit({ targetKey: adapter.key });
		expect(store.historyVersion).toBe(before + 1);
	});

	it('node target: preview + commit through the cameraTarget handle', () => {
		const store = createFixtureEditorStore();
		const node = store.document.navigationNodes[0]!;
		expect(store.selectionActions.selectNavigationNode(node.id)).toBe(true);
		expect(store.selectionActions.selectCameraHandle('target')).toBe(true);

		const startWorld = store.rooms.point(node.roomId, node.cameraTarget);
		const root = makeRoot(startWorld);
		store.registerCameraHelperRoot(node.id, 'target', root);

		const adapter = createCameraGizmoAdapter({ store })!;
		expect(adapter.key).toBe(`camera:${node.id}:target`);
		const session = adapter.begin({ targetKey: adapter.key })!;

		root.position.set(startWorld[0]!, startWorld[1]!, startWorld[2]! + 1.5);
		session.preview({ targetKey: adapter.key, axis: 'Z' });
		const expectedLocal = store.rooms.localPoint(node.roomId, [
			startWorld[0]!,
			startWorld[1]!,
			startWorld[2]! + 1.5
		]);
		const previewed = store.document.navigationNodes.find(
			(candidate) => candidate.id === node.id
		)!;
		expect(previewed.cameraTarget[2]).toBeCloseTo(expectedLocal[2]!);

		const before = store.historyVersion;
		session.commit({ targetKey: adapter.key });
		expect(store.historyVersion).toBe(before + 1);
	});

	it('node rotate: the gizmo delta orbits the look target around the eye, one commit', () => {
		const store = createFixtureEditorStore();
		const node = store.document.navigationNodes[0]!;
		expect(store.selectionActions.selectNavigationNode(node.id)).toBe(true);

		const startEyeWorld = store.rooms.point(node.roomId, node.position);
		const startTargetWorld = store.rooms.point(node.roomId, node.cameraTarget);
		const root = makeRoot(startEyeWorld);
		store.registerCameraHelperRoot(node.id, 'position', root);

		const adapter = createCameraGizmoAdapter({ store })!;
		const session = adapter.begin({ targetKey: adapter.key })!;

		// A pure 90° yaw about world Y: the target must swing around the eye
		// with the eye fixed and the aim distance preserved.
		root.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
		session.preview({ targetKey: adapter.key, axis: 'Y' });

		const previewed = store.document.navigationNodes.find(
			(candidate) => candidate.id === node.id
		)!;
		const expectedEye = new Vector3(...startEyeWorld);
		const expectedTarget = new Vector3(...startTargetWorld);
		const offset = expectedTarget.clone().sub(expectedEye);
		// yaw +90° about Y: (x, z) → (z, -x) — the orbit applies exactly the
		// gizmo's delta rotation.
		const expected = new Vector3(
			expectedEye.x + offset.z,
			expectedEye.y + offset.y,
			expectedEye.z - offset.x
		);
		const previewedWorld = store.rooms.point(node.roomId, previewed.cameraTarget);
		expect(previewedWorld[0]!).toBeCloseTo(expected.x);
		expect(previewedWorld[1]!).toBeCloseTo(expected.y);
		expect(previewedWorld[2]!).toBeCloseTo(expected.z);
		// The eye never moves during a rotate drag.
		expect(previewed.position[0]).toBeCloseTo(node.position[0]);
		expect(previewed.position[1]).toBeCloseTo(node.position[1]);

		const before = store.historyVersion;
		session.commit({ targetKey: adapter.key });
		expect(store.historyVersion).toBe(before + 1);
	});

	it('node rotate cancel restores the target and the root, and adds no history', () => {
		const store = createFixtureEditorStore();
		const node = store.document.navigationNodes[0]!;
		const originalTarget = [...node.cameraTarget] as Vec3;
		expect(store.selectionActions.selectNavigationNode(node.id)).toBe(true);

		const startEyeWorld = store.rooms.point(node.roomId, node.position);
		const root = makeRoot(startEyeWorld);
		store.registerCameraHelperRoot(node.id, 'position', root);

		const adapter = createCameraGizmoAdapter({ store })!;
		const session = adapter.begin({ targetKey: adapter.key })!;
		root.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 4);
		session.preview({ targetKey: adapter.key, axis: 'Y' });
		expect(store.canUndo).toBe(false);

		session.cancel('escape');
		expect(store.canUndo).toBe(false);
		expect(store.isDocumentTransactionActive).toBe(false);
		const restored = store.document.navigationNodes.find(
			(candidate) => candidate.id === node.id
		)!;
		expect(restored.cameraTarget[0]).toBeCloseTo(originalTarget[0]!);
		expect(restored.cameraTarget[1]).toBeCloseTo(originalTarget[1]!);
		expect(restored.cameraTarget[2]).toBeCloseTo(originalTarget[2]!);
		expect(root.quaternion.x).toBe(0);
		expect(root.quaternion.y).toBe(0);
		expect(root.quaternion.z).toBe(0);
		expect(root.quaternion.w).toBe(1);
	});

	it('cancel restores the node, the root, and adds no history', () => {
		const store = createFixtureEditorStore();
		const node = store.document.navigationNodes[0]!;
		// Capture values, not references: the transaction rollback replaces
		// the node's position array, so a held node object goes stale.
		const originalPosition = [...node.position] as Vec3;
		expect(store.selectionActions.selectNavigationNode(node.id)).toBe(true);

		const startWorld = store.rooms.point(node.roomId, originalPosition);
		const root = makeRoot(startWorld);
		store.registerCameraHelperRoot(node.id, 'position', root);

		const adapter = createCameraGizmoAdapter({ store })!;
		const session = adapter.begin({ targetKey: adapter.key })!;
		root.position.set(startWorld[0]! + 3, startWorld[1]!, startWorld[2]!);
		session!.preview({ targetKey: adapter!.key, axis: 'X' });
		expect(store.canUndo).toBe(false);

		session.cancel('escape');
		expect(store.canUndo).toBe(false);
		expect(store.isDocumentTransactionActive).toBe(false);
		expect(root.position.x).toBeCloseTo(startWorld[0]!);
		const restored = store.document.navigationNodes.find(
			(candidate) => candidate.id === node.id
		)!;
		expect(restored.position[0]).toBeCloseTo(originalPosition[0]!);
	});
});

describe('camera-gizmo-adapter — pending-node drafts', () => {
	it('begin/preview/commit stay out of history; cancel restores the start point and root', () => {
		// B0 (S10.1 closeout) made standalone placement the editor behavior; the
		// pending-node draft contract is now the frozen relic path.
		const store = createRelicFixtureEditorStore();
		const roomId = store.rooms.entries[0]!.id;
		expect(store.beginCameraPlacement()).toBe(true);
		const id = store.createPendingNavigationNodeAt(
			roomId,
			store.rooms.point(roomId, [1, 0, 1]),
			[0, 0, -1]
		);
		expect(id).not.toBeNull();
		const pending = store.pendingNavigationNode!;
		const startWorld = store.rooms.point(roomId, pending.position);
		const root = makeRoot(startWorld);
		store.registerCameraHelperRoot(id!, 'position', root);

		const adapter = createCameraGizmoAdapter({ store });
		expect(adapter).not.toBeNull();
		expect(adapter!.key).toBe(`camera:${id}:position`);

		// Commit path: preview writes through the draft, commit adds nothing.
		const session = adapter!.begin({ targetKey: adapter!.key });
		expect(session).not.toBeNull();
		expect(store.isDocumentTransactionActive).toBe(false); // draft — no transaction
		root.position.set(startWorld[0]! + 1, startWorld[1]!, startWorld[2]!);
		session!.preview({ targetKey: adapter!.key, axis: 'X' });
		expect(store.pendingNavigationNode!.position[0]).toBeCloseTo(
			store.rooms.localPoint(roomId, [startWorld[0]! + 1, startWorld[1]!, startWorld[2]!])[0]!
		);
		const historyBefore = store.historyVersion;
		session!.commit({ targetKey: adapter!.key });
		expect(store.historyVersion).toBe(historyBefore); // drafts never commit

		// Cancel path: a fresh begin captures the current draft pose, then
		// cancel restores to that captured start.
		const session2 = adapter!.begin({ targetKey: adapter!.key })!;
		root.position.set(startWorld[0]! + 2, startWorld[1]!, startWorld[2]!);
		session2.preview({ targetKey: adapter!.key, axis: 'X' });
		session2.cancel('escape');
		// startLocalPoint was captured after the +1 preview move, so cancel
		// restores the +1 pose (the pre-session value), not the original.
		expect(store.pendingNavigationNode!.position[0]).toBeCloseTo(
			store.rooms.localPoint(roomId, [startWorld[0]! + 1, startWorld[1]!, startWorld[2]!])[0]!
		);
		expect(root.position.x).toBeCloseTo(startWorld[0]! + 1);
		expect(store.historyVersion).toBe(historyBefore);
	});
});

describe('camera-gizmo-adapter — anchor and view-target epsilon no-ops', () => {
	it('path anchor: beyond ε commits once; inside ε is a no-op cancel', () => {
		const store = createFixtureEditorStore();
		const connection = store.document.connections[0]!;
		const anchorId = connection.positionPath.anchors[0]!.id;
		const anchor = connection.positionPath.anchors.find(
			(candidate) => candidate.id === anchorId
		)!;
		const start = getScenePathAnchorWorldPosition(anchor, store.rooms);
		const root = makeRoot(start);
		expect(store.selectionActions.selectAnchor(connection.id, anchorId)).toBe(true);
		store.registerAnchorHelperRoot(connection.id, anchorId, root);

		const adapter = createCameraGizmoAdapter({ store });
		expect(adapter).not.toBeNull();
		expect(adapter!.key).toBe(`anchor:${connection.id}:${anchorId}`);

		// Beyond ε: one commit.
		const moved = [start[0]! + 1, start[1]!, start[2]!] as Vec3;
		const session = adapter!.begin({ targetKey: adapter!.key })!;
		root.position.set(moved[0], moved[1], moved[2]);
		session!.preview({ targetKey: adapter!.key, axis: 'X' });
		const before = store.historyVersion;
		session.commit({ targetKey: adapter!.key });
		expect(store.historyVersion).toBe(before + 1);
		const committedAnchor = store.document.connections
			.find((candidate) => candidate.id === connection.id)!
			.positionPath.anchors.find((candidate) => candidate.id === anchorId)!;
		expect(getScenePathAnchorWorldPosition(committedAnchor, store.rooms)[0]).toBeCloseTo(moved[0]!);

		// Inside ε: cancel the transaction, restore the root, no history.
		const tiny = [moved[0]! + EDITOR_CAMERA_PATH_MOVE_EPSILON / 2, moved[1]!, moved[2]!] as Vec3;
		expect(worldDistance(tiny, moved)).toBeLessThanOrEqual(EDITOR_CAMERA_PATH_MOVE_EPSILON);
		const session2 = adapter!.begin({ targetKey: adapter!.key })!;
		root.position.set(tiny[0], tiny[1], tiny[2]);
		session2.preview({ targetKey: adapter!.key, axis: 'X' });
		session2.commit({ targetKey: adapter!.key });
		expect(store.historyVersion).toBe(before + 1); // unchanged
		expect(root.position.x).toBeCloseTo(moved[0]!); // restored to the drag start
	});

	it('view target: beyond ε commits once; inside ε is a no-op cancel', () => {
		const document = cloneFixtureDocument();
		const connection = document.connections[0]!;
		connection.viewTracks = {
			forward: [
				{
					id: `${connection.id}-view-forward-01`,
					progress: 0.4,
					cameraTarget: [2, 1.5, 3],
					fov: 48
				}
			],
			reverse: []
		};
		const store = createFixtureEditorStore();
		expect(store.importDocument(document)).toBe(true);
		const keyframeId = store.document.connections[0]!.viewTracks!.forward[0]!.id;
		expect(
			store.selectCameraTimelineViewKeyframe(connection.id, 'forward', keyframeId)
		).toBe(true);
		const roomId = store.document.navigationNodes[0]!.roomId;
		const startLocal = [...store.selectedViewKeyframe!.cameraTarget] as Vec3;
		const start = store.rooms.point(roomId, startLocal);
		const root = makeRoot(start);
		store.registerViewKeyframeTargetHelperRoot(connection.id, 'forward', keyframeId, root);

		const adapter = createCameraGizmoAdapter({ store });
		expect(adapter).not.toBeNull();
		expect(adapter!.key).toBe(`view-target:${connection.id}:forward:${keyframeId}`);

		// Beyond ε: one commit. The existing `updateSelectedViewKeyframeTargetWorldPoint`
		// stores the helper world position verbatim (monolith parity), so the
		// document value must equal the moved world position, not a re-converted
		// room-local value.
		const moved = [start[0]! + 2, start[1]!, start[2]!] as Vec3;
		const session = adapter!.begin({ targetKey: adapter!.key })!;
		root.position.set(moved[0], moved[1], moved[2]);
		session!.preview({ targetKey: adapter!.key, axis: 'X' });
		const before = store.historyVersion;
		session.commit({ targetKey: adapter!.key });
		expect(store.historyVersion).toBe(before + 1);
		expect(store.selectedViewKeyframe!.cameraTarget[0]).toBeCloseTo(moved[0]!);

		// Inside ε: no-op cancel restores the root, no history. The stored
		// value is world-space, so the tiny move is ε/2 beyond it directly.
		const committedWorld = [...store.selectedViewKeyframe!.cameraTarget] as Vec3;
		const tiny = [
			committedWorld[0]! + EDITOR_CAMERA_VIEW_MOVE_EPSILON / 2,
			committedWorld[1]!,
			committedWorld[2]!
		] as Vec3;
		const session2 = adapter!.begin({ targetKey: adapter!.key })!;
		root.position.set(tiny[0], tiny[1], tiny[2]);
		session2.preview({ targetKey: adapter!.key, axis: 'X' });
		session2.commit({ targetKey: adapter!.key });
		expect(store.historyVersion).toBe(before + 1); // unchanged
		expect(root.position.x).toBeCloseTo(committedWorld[0]!);
	});
});
