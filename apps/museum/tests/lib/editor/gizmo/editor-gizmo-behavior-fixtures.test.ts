/**
 * step 0 — behavioral fixtures recorded BEFORE extraction.
 *
 * The scene/camera sessions currently live inside
 * `EditorTransformControls.svelte` (untested component logic). These
 * fixtures record the exact seams the S7 scene + camera adapters must
 * reproduce: the store mutation contract, the pivot-baseline math, the snap
 * and keep-on-floor branches, and the epsilon no-op rules. They mirror the
 * monolith's call shapes line-for-line, so steps 3/4 can diff adapter output
 * against this file instead of the component.
 *
 * Host-only behavior (orbit state capture/restore, target switch/unmount
 * mid-drag, late-mouseUp suppression) needs the Three host harness and stays
 * pinned as `it.todo` in `tests/lib/editor/app/contracts.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
	BoxGeometry,
	DoubleSide,
	Group,
	Mesh,
	MeshBasicMaterial,
	PlaneGeometry,
	Scene
} from 'three';
import {
	applyRigidPivotDelta,
	captureMemberTransformBaselines,
	resetSessionPivot,
	snapPivotRoomLocal
} from '$lib/editor/editor-cluster-transform';
import { groundSelectionRigidly, rotationSnapRadians } from '$lib/editor/editor-placement';
import { placementTransformFromObject } from '$lib/editor/editor-transform';
import {
	EDITOR_CAMERA_PATH_MOVE_EPSILON,
	getScenePathAnchorWorldPosition
} from '$lib/editor/editor-camera-path';
import { EDITOR_CAMERA_VIEW_MOVE_EPSILON } from '$lib/editor/editor-camera-view';
import { createFixtureEditorStore, createRelicFixtureEditorStore } from '../editor-test-utils';
import { cloneFixtureDocument } from '../../content/__fixtures__/load-fixture-scene';
import type { Vec3 } from '$lib/types/museum';

function makeRoot(id: string, position: Vec3): Mesh {
	const root = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), new MeshBasicMaterial());
	root.position.set(...position);
	root.name = id;
	return root;
}

describe('S7 step 0 — scene placement session fixtures', () => {
	/**
	 * Records the monolith preview loop: capture one immutable baseline,
	 * re-derive every preview from it (no drift), keep one document
	 * transaction, write once per drag.
	 */
	it('derives translate/rotate/uniform/independent previews from the immutable baseline and commits one history entry', () => {
		const store = createFixtureEditorStore();
		// Placement selection is room-scoped: select the first entity's room,
		// then take the room's first three entities as the session members.
		// Placement selection is room-scoped: select the first entity's room,
		// then take that room's entities as the session members.
		const roomId = store.document.entities[0]!.roomId;
		const entities = store.document.entities
			.filter((entity) => entity.roomId === roomId)
			.slice(0, 2);
		const ids = entities.map((entity) => entity.id);
		expect(store.selectionActions.selectRoom(roomId)).toBe(true);
		// Symmetric roots around the world origin make the delta math exact.
		const positions: [number, number, number][] = [
			[-1, 0, 0],
			[1, 0, 0]
		];
		const roots = ids.map((id, index) => {
			const root = makeRoot(id, positions[index]!);
			root.userData.roomId = entities[index]!.roomId;
			store.registerPlacementRoot(id, root);
			return root;
		});
		store.selectionActions.selectPlacements(ids);
		expect(store.selectedPlacementIds).toHaveLength(2);

		const pivot = new Group();
		expect(resetSessionPivot(pivot, roots)).toBe(true);
		const startPivotWorldMatrix = pivot.matrixWorld.clone();
		const members = captureMemberTransformBaselines(ids, roots);
		// Multi-selection pivots on the centroid.
		expect(pivot.position.toArray()).toEqual([0, 0, 0]);

		const historyBefore = store.historyVersion;
		expect(store.beginDocumentTransaction()).toBe(true);

		// Translate (0.25 m-aligned for readability).
		pivot.position.set(1.25, 0, -0.5);
		pivot.updateMatrixWorld(true);
		applyRigidPivotDelta(startPivotWorldMatrix, pivot.matrixWorld, members, 'uniform');
		expect(roots[1]!.position.x).toBeCloseTo(2.25);
		// Rigid spacing preserved.
		expect(roots[1]!.position.distanceTo(roots[0]!.position)).toBeCloseTo(2);

		// Preview number two: no drift — returning the pivot to baseline
		// restores every member from the captured baseline.
		pivot.position.set(0, 0, 0);
		pivot.updateMatrixWorld(true);
		applyRigidPivotDelta(startPivotWorldMatrix, pivot.matrixWorld, members, 'uniform');
		expect(roots[1]!.position.x).toBeCloseTo(1);

		// Rotate (90° about the centroid about Y).
		pivot.rotation.y = Math.PI / 2;
		pivot.updateMatrixWorld(true);
		applyRigidPivotDelta(startPivotWorldMatrix, pivot.matrixWorld, members, 'uniform');
		expect(roots[0]!.position.x).toBeCloseTo(0);
		expect(roots[0]!.position.z).toBeCloseTo(1);
		expect(roots[1]!.position.x).toBeCloseTo(0);
		expect(roots[1]!.position.z).toBeCloseTo(-1);

		// Uniform scale doubles every member about the centroid.
		pivot.rotation.set(0, 0, 0);
		pivot.scale.setScalar(2);
		pivot.updateMatrixWorld(true);
		applyRigidPivotDelta(startPivotWorldMatrix, pivot.matrixWorld, members, 'uniform');
		expect(roots[0]!.position.x).toBeCloseTo(-2);
		expect(roots[0]!.scale.x).toBeCloseTo(2);

		// Independent scale keeps the per-axis decomposition.
		pivot.scale.set(2, 1, 1);
		pivot.updateMatrixWorld(true);
		applyRigidPivotDelta(startPivotWorldMatrix, pivot.matrixWorld, members, 'independent');
		expect(roots[0]!.scale.toArray()).toEqual([2, 1, 1]);
		expect(roots[0]!.position.x).toBeCloseTo(-2); // untouched axis

		// One commit for the whole drag (all previews were in-flight).
		expect(store.canUndo).toBe(false);
		for (const member of members) {
			store.updatePlacementTransform(
				member.id,
				placementTransformFromObject(member.root)
			);
		}
		expect(store.commitDocumentTransaction()).toBe(true);
		expect(store.historyVersion).toBe(historyBefore + 1);
		expect(store.canUndo).toBe(true);
		const written = store.document.entities.find((entity) => entity.id === ids[1]!);
		expect(written?.position[0]).toBeCloseTo(2);
	});

	it('derives the session pivot from the centroid for multi-root selection', () => {
		const store = createFixtureEditorStore(2);
		const ids = store.document.entities.slice(0, 2).map((entity) => entity.id);
		const roots = [
			makeRoot(ids[0]!, [0, 0, 0]),
			makeRoot(ids[1]!, [2, 0, 0])
		];
		for (const root of roots) store.registerPlacementRoot(root.name, root);
		const pivot = new Group();
		expect(resetSessionPivot(pivot, roots)).toBe(true);
		expect(pivot.position.x).toBeCloseTo(1);
		// Single-root selection pivots on its own origin.
		const lone = new Group();
		expect(resetSessionPivot(lone, [roots[0]!])).toBe(true);
		expect(lone.position.toArray()).toEqual([0, 0, 0]);
	});

	it('refuses the session when member roots are missing (monolith begin guard) and cancels the transaction', () => {
		const store = createFixtureEditorStore(2);
		const roomId = store.document.entities[0]!.roomId;
		const ids = store.document.entities
			.filter((entity) => entity.roomId === roomId)
			.map((entity) => entity.id);
		// Only the first root is registered — the second id resolves to nothing.
		store.registerPlacementRoot(ids[0]!, makeRoot(ids[0]!, [0, 0, 0]));
		expect(store.selectionActions.selectRoom(roomId)).toBe(true);
		store.selectionActions.selectPlacements(ids);
		expect(store.selectedPlacementIds).toHaveLength(2);
		const roots = store.getPlacementRoots();
		expect(roots).toHaveLength(1);

		// Monolith guard: `ids.length === 0 || roots.length !== ids.length`
		// → cancel + return, leaving no history or partial writes.
		const historyBefore = store.historyVersion;
		expect(store.beginDocumentTransaction()).toBe(true);
		expect(ids.length === 0 || roots.length !== ids.length).toBe(true);
		store.cancelDocumentTransaction();
		expect(store.canUndo).toBe(false);
		expect(store.historyVersion).toBe(historyBefore);
	});

	it('snaps the pivot to the room-local grid exactly like the monolith snap call site', () => {
		const store = createFixtureEditorStore();
		store.translationSnap = 0.25;
		const pivot = new Group();
		const room = new Group();
		room.add(pivot);
		pivot.position.set(1.37, 2.42, 3.11);
		store.keepOnFloor = true;
		// Monolith: `snapPivotRoomLocal(pivot, parent, store.translationSnap,
		// !store.keepOnFloor)` — Y stays untouched when keepOnFloor is on.
		snapPivotRoomLocal(pivot, room, store.translationSnap, !store.keepOnFloor);
		expect(pivot.position.x).toBeCloseTo(1.25);
		expect(pivot.position.z).toBeCloseTo(3);
		expect(pivot.position.y).toBeCloseTo(2.42);
		// The Shift bypass and disabled-snap guards come before the call:
		for (const [shiftHeld, snapEnabled, expected] of [
			[false, true, true],
			[true, true, false],
			[false, false, false]
		] as const) {
			store.translationSnapEnabled = snapEnabled;
			expect(store.translationSnapEnabled && !shiftHeld).toBe(expected);
		}
	});

	it('rotation snap: Shift bypasses the 15° step exactly like effectiveRotationSnap', () => {
		const store = createFixtureEditorStore();
		store.rotationSnapEnabled = true;
		store.rotationSnapDegrees = 15;
		const shiftHeld = false;
		const step = store.rotationSnapEnabled && !shiftHeld
			? rotationSnapRadians(store.rotationSnapDegrees)
			: null;
		expect(step).toBeCloseTo(Math.PI / 12);
		// Shift held → null.
		const shiftHeldCancel = true;
		expect(
			store.rotationSnapEnabled && !shiftHeldCancel
				? rotationSnapRadians(store.rotationSnapDegrees)
				: null
		).toBeNull();
		// Disabled → null.
		store.rotationSnapEnabled = false;
		expect(
			store.rotationSnapEnabled && !shiftHeld
				? rotationSnapRadians(store.rotationSnapDegrees)
				: null
		).toBeNull();
	});
});

describe('S7 step 0 — keep-on-floor session fixtures', () => {
	function makeFloorScene(): Scene {
		const scene = new Scene();
		const floor = new Mesh(
			new PlaneGeometry(20, 20),
			new MeshBasicMaterial({ side: DoubleSide })
		);
		floor.rotation.x = -Math.PI / 2;
		floor.userData = {
			surfaceType: 'floor',
			roomId: 'paris',
			editorSurface: { type: 'floor', placeable: true, roomId: 'paris' }
		};
		scene.add(floor);
		// Headless three: no render loop ever touches matrixWorld, so refresh
		// it explicitly or the raycast hits the plane's identity matrix.
		scene.updateMatrixWorld(true);
		return scene;
	}

	it('grounds a selection and commits exactly one history entry', () => {
		const store = createFixtureEditorStore();
		const entity = store.document.entities[0]!;
		const root = makeRoot(entity.id, [0, 2, 0]);
		root.userData.roomId = entity.roomId;
		store.registerPlacementRoot(entity.id, root);
		store.selectionActions.selectPlacement(entity.id);
		const scene = makeFloorScene();

		expect(store.beginDocumentTransaction()).toBe(true);
		const result = groundSelectionRigidly([root], [scene]);
		expect(result).toEqual({ grounded: true, deltaY: -1.75 });
		expect(root.position.y).toBeCloseTo(0.25);
		const before = store.historyVersion;
		store.updatePlacementTransform(entity.id, placementTransformFromObject(root));
		expect(store.commitDocumentTransaction()).toBe(true);
		expect(store.historyVersion).toBe(before + 1);
		expect(store.document.entities[0]!.position[1]).toBeCloseTo(0.25);
	});

	it('reports failure when no floor is below and never mutates the document', () => {
		const store = createFixtureEditorStore();
		const entity = store.document.entities[0]!;
		const root = makeRoot(entity.id, [50, 2, 50]); // outside the 20×20 floor
		root.userData.roomId = 'paris';
		store.registerPlacementRoot(entity.id, root);
		const scene = makeFloorScene();

		const historyBefore = store.historyVersion;
		expect(store.beginDocumentTransaction()).toBe(true);
		const result = groundSelectionRigidly([root], [scene]);
		expect(result).toEqual({ grounded: false, deltaY: 0 });
		expect(root.position.y).toBeCloseTo(2);
		store.cancelDocumentTransaction();
		expect(store.canUndo).toBe(false);
		expect(store.historyVersion).toBe(historyBefore);
	});
});

describe('S7 step 0 — camera session fixtures', () => {
	it('authored node position/target preview commits one history entry; cancel restores', () => {
		const store = createFixtureEditorStore();
		const node = store.document.navigationNodes[0]!;
		// The monolith previews route through the selected camera helper, so
		// the fixture must reproduce that selection first.
		expect(store.selectionActions.selectNavigationNode(node.id)).toBe(true);
		expect(store.selectionActions.selectCameraHandle('target')).toBe(true);
		const worldTarget = store.rooms.point(node.roomId, node.cameraTarget);
		const moved = [
			worldTarget[0] + 2,
			worldTarget[1],
			worldTarget[2] + 1
		] as Vec3;

		// The monolith previews convert world → room-local before writing.
		const movedLocal = store.rooms.localPoint(node.roomId, moved);
		expect(store.beginDocumentTransaction()).toBe(true);
		expect(store.updateNavigationNodePoint(node.id, 'target', movedLocal)).toBe(true);
		expect(store.canUndo).toBe(false); // in-flight
		const before = store.historyVersion;
		expect(store.commitDocumentTransaction()).toBe(true);
		expect(store.historyVersion).toBe(before + 1);
		const after = store.document.navigationNodes.find((candidate) => candidate.id === node.id)!;
		expect(after.cameraTarget[0]).toBeCloseTo(movedLocal[0]!);
		expect(after.cameraTarget[2]).toBeCloseTo(movedLocal[2]!);

		// Cancel restores the node and creates no history.
		const originalPosition = [...after.position] as Vec3;
		expect(store.selectionActions.selectCameraHandle('position')).toBe(true);
		expect(store.beginDocumentTransaction()).toBe(true);
		expect(
			store.updateNavigationNodePoint(node.id, 'position', [
				originalPosition[0]! + 1,
				originalPosition[1]!,
				originalPosition[2]!
			])
		).toBe(true);
		store.cancelDocumentTransaction();
		expect(store.canUndo).toBe(true); // only the earlier commit is undoable
		expect(
			store.document.navigationNodes.find((candidate) => candidate.id === node.id)!.position
		).toEqual(originalPosition);
	});

	it('pending-node drafts stay out of history and cancel restores the start point', () => {
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
		expect(store.isPendingNavigationNode(id!)).toBe(true);
		// Draft previews route through the active camera-handle selection, and
		// pending-node placement selects the node's position helper up front.
		expect(store.cameraSelection).toMatchObject({ nodeId: id, handle: 'position' });
		const start = [...store.pendingNavigationNode!.position] as Vec3;
		const moved = [start[0]! + 1, start[1]!, start[2]!] as Vec3;

		expect(store.updateNavigationNodePoint(id!, 'position', moved)).toBe(true);
		expect(store.pendingNavigationNode!.position[0]).toBeCloseTo(moved[0]!);
		expect(store.canUndo).toBe(false); // draft — no transaction

		// Monolith cancel restores startLocalPoint through the same writer.
		expect(store.updateNavigationNodePoint(id!, 'position', start)).toBe(true);
		expect(store.pendingNavigationNode!.position).toEqual(start);
		expect(store.canUndo).toBe(false);
	});

	it('path-anchor preview beyond ε commits once; inside ε is a no-op cancel', () => {
		const store = createFixtureEditorStore();
		const connection = store.document.connections[0]!;
		const anchorId = connection.positionPath.anchors[0]?.id;
		expect(anchorId).toBeTruthy();
		const anchor = connection.positionPath.anchors.find((candidate) => candidate.id === anchorId)!;
		const start = getScenePathAnchorWorldPosition(anchor);
		const moved = [start[0]! + 1, start[1]!, start[2]!] as Vec3;

		expect(store.beginDocumentTransaction()).toBe(true);
		expect(store.updateConnectionAnchorWorldPoint(connection.id, anchorId!, moved)).toBe(true);
		const before = store.historyVersion;
		expect(store.commitDocumentTransaction()).toBe(true);
		expect(store.historyVersion).toBe(before + 1);
		const movedAnchor = store.document.connections
			.find((candidate) => candidate.id === connection.id)!
			.positionPath.anchors.find((candidate) => candidate.id === anchorId)!;
		expect(getScenePathAnchorWorldPosition(movedAnchor)[0]).toBeCloseTo(moved[0]!);

		// Inside ε the monolith cancels the transaction and restores the start.
		const tiny = [
			start[0]! + EDITOR_CAMERA_PATH_MOVE_EPSILON / 2,
			start[1]!,
			start[2]!
		] as Vec3;
		expect(
			Math.hypot(
				tiny[0]! - start[0]!,
				tiny[1]! - start[1]!,
				tiny[2]! - start[2]!
			)
		).toBeLessThanOrEqual(EDITOR_CAMERA_PATH_MOVE_EPSILON);
		expect(store.beginDocumentTransaction()).toBe(true);
		expect(store.updateConnectionAnchorWorldPoint(connection.id, anchorId!, tiny)).toBe(true);
		store.cancelDocumentTransaction();
		expect(store.canUndo).toBe(true);
		const restored = store.document.connections
			.find((candidate) => candidate.id === connection.id)!
			.positionPath.anchors.find((candidate) => candidate.id === anchorId)!;
		expect(getScenePathAnchorWorldPosition(restored)[0]).toBeCloseTo(moved[0]!);
	});

	it('view-target preview beyond ε commits once; inside ε is a no-op cancel', () => {
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
		const start = [...store.selectedViewKeyframe!.cameraTarget] as Vec3;
		const moved = [start[0]! + 2, start[1]!, start[2]!] as Vec3;

		expect(store.beginDocumentTransaction()).toBe(true);
		expect(store.updateSelectedViewKeyframeTargetWorldPoint(moved)).toBe(true);
		const before = store.historyVersion;
		expect(store.commitDocumentTransaction()).toBe(true);
		expect(store.historyVersion).toBe(before + 1);
		expect(store.selectedViewKeyframe!.cameraTarget[0]).toBeCloseTo(start[0]! + 2);

		// Inside ε (EDITOR_CAMERA_VIEW_MOVE_EPSILON) the monolith treats the
		// drag as a no-op: cancel the transaction, restore the start.
		const tiny = [
			start[0]! + EDITOR_CAMERA_VIEW_MOVE_EPSILON / 2,
			start[1]!,
			start[2]!
		] as Vec3;
		expect(
			Math.hypot(tiny[0]! - start[0]!, tiny[1]! - start[1]!, tiny[2]! - start[2]!)
		).toBeLessThanOrEqual(EDITOR_CAMERA_VIEW_MOVE_EPSILON);
		expect(store.beginDocumentTransaction()).toBe(true);
		expect(store.updateSelectedViewKeyframeTargetWorldPoint(tiny)).toBe(true);
		store.cancelDocumentTransaction();
		// The cancel restores the pre-drag snapshot — the committed moved
		// value, never an epsilon-delta beyond it.
		expect(store.selectedViewKeyframe!.cameraTarget[0]).toBeCloseTo(start[0]! + 2);
		expect(store.canUndo).toBe(true);
	});
});