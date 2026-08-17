/**
 * S7 step 3 — scene-gizmo-adapter session tests.
 *
 * Drives `createSceneGizmoAdapter` against a real `MuseumEditorStore` with
 * registered placement roots, exercising the adapter seams the monolith ran
 * inline: null resolution (empty/partial selection), pivot prepare, begin's
 * transaction + baseline + restore capture, preview writes through the rigid
 * pivot delta, mode routing, keep-on-floor commit with one history entry,
 * translation-snap routing, and cancel restore + reason-routed deselect.
 *
 * The pure math (`applyRigidPivotDelta`, `snapPivotRoomLocal`,
 * `groundSelectionRigidly`) stays pinned by
 * `editor-gizmo-behavior-fixtures.test.ts`; this suite pins the adapter's own
 * glue — the plan's expected `scene-gizmo-adapter.test.ts` that the camera
 * adapter already has.
 */

import { describe, expect, it } from 'vitest';
import {
	BoxGeometry,
	DoubleSide,
	Mesh,
	MeshBasicMaterial,
	PlaneGeometry,
	Scene
} from 'three';
import type { Vec3 } from '$lib/types/museum';
import type { MuseumEditorStore } from '$lib/editor/museum-editor.svelte';
import {
	SCENE_GIZMO_POLICY,
	createSceneGizmoAdapter,
	createSceneGizmoPivot,
	type SceneGizmoAdapterInput
} from '$lib/editor/gizmo/scene-gizmo-adapter.svelte';
import { createFixtureEditorStore } from '../editor-test-utils';

function makeRoot(id: string, position: Vec3): Mesh {
	const root = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), new MeshBasicMaterial());
	root.position.set(position[0], position[1], position[2]);
	root.name = id;
	return root;
}

/**
 * Select the first `count` placements of the fixture's first room and mount
 * symmetric roots around the world origin (±1 on X) so the centroid pivot and
 * the rigid delta math are exact.
 */
function selectPlacementRoots(
	store: MuseumEditorStore,
	count = 2
): { ids: string[]; roots: Mesh[]; roomId: string } {
	const roomId = store.document.entities[0]!.roomId;
	const ids = store.document.entities
		.filter((entity) => entity.roomId === roomId)
		.slice(0, count)
		.map((entity) => entity.id);
	const roots = ids.map((id, index) => {
		const root = makeRoot(id, [index === 0 ? -1 : 1, 0, 0]);
		root.userData.roomId = roomId;
		store.registerPlacementRoot(id, root);
		return root;
	});
	// `selectPlacements` requires the room context first (monolith fixture
	// call shape: selectRoom, then selectPlacements).
	expect(store.selectionActions.selectRoom(roomId)).toBe(true);
	expect(store.selectionActions.selectPlacements(ids)).toBe(true);
	return { ids, roots, roomId };
}

/** 20×20 floor at y=0 for keep-on-floor grounding raycasts (fixture parity). */
function makeFloorScene(roomId: string): Scene {
	const scene = new Scene();
	const floor = new Mesh(
		new PlaneGeometry(20, 20),
		new MeshBasicMaterial({ side: DoubleSide })
	);
	floor.rotation.x = -Math.PI / 2;
	floor.userData = {
		surfaceType: 'floor',
		roomId,
		editorSurface: { type: 'floor', placeable: true, roomId }
	};
	scene.add(floor);
	// Headless three: refresh world matrices explicitly or the raycast hits
	// the plane's identity matrix.
	scene.updateMatrixWorld(true);
	return scene;
}

function makeInput(
	store: MuseumEditorStore,
	overrides: Partial<SceneGizmoAdapterInput> = {}
): SceneGizmoAdapterInput {
	const scene = new Scene();
	const pivot = createSceneGizmoPivot(scene);
	return {
		store,
		scene,
		pivot,
		getMode: () => 'translate',
		isShiftHeld: () => false,
		...overrides
	};
}

describe('scene-gizmo-adapter — resolution and identity', () => {
	it('resolves null for an empty selection and refuses partial root sets', () => {
		const store = createFixtureEditorStore();
		// No selection at all.
		expect(createSceneGizmoAdapter(makeInput(store))).toBeNull();

		// Selected placements exist, but only one of two roots is mounted —
		// the adapter refuses the target itself, so no session can ever begin
		// with a partial set.
		const roomId = store.document.entities[0]!.roomId;
		const ids = store.document.entities
			.filter((entity) => entity.roomId === roomId)
			.slice(0, 2)
			.map((entity) => entity.id);
		const root = makeRoot(ids[0]!, [0, 0, 0]);
		root.userData.roomId = roomId;
		store.registerPlacementRoot(ids[0]!, root);
		expect(store.selectionActions.selectRoom(roomId)).toBe(true);
		expect(store.selectionActions.selectPlacements(ids)).toBe(true);
		expect(store.selectedPlacementIds).toHaveLength(2);
		expect(createSceneGizmoAdapter(makeInput(store))).toBeNull();
	});

	it('exposes the placement key, scene domain, and shared policy; prepare centers the pivot', () => {
		const store = createFixtureEditorStore();
		selectPlacementRoots(store);
		const input = makeInput(store);
		const adapter = createSceneGizmoAdapter(input);
		expect(adapter).not.toBeNull();
		expect(adapter!.key).toBe(`placement:${store.selectionKey}`);
		expect(adapter!.domain).toBe('scene');
		expect(adapter!.proxy).toBe(input.pivot);
		expect(adapter!.policy).toBe(SCENE_GIZMO_POLICY);
		expect(adapter!.policy.allowedModes).toEqual(
			new Set(['translate', 'rotate', 'scale'])
		);

		// The composer calls prepare() before the host attaches: the shared
		// pivot re-centers on the selected roots (symmetric ±1 → world origin).
		adapter!.prepare?.();
		expect(input.pivot.position.toArray()).toEqual([0, 0, 0]);
	});
});

describe('scene-gizmo-adapter — begin / preview / commit', () => {
	it('begin opens one transaction, captures baselines + restore snapshots, and marks the interaction active', () => {
		const store = createFixtureEditorStore();
		selectPlacementRoots(store);
		const input = makeInput(store);
		const adapter = createSceneGizmoAdapter(input)!;
		adapter.prepare?.();

		const historyBefore = store.historyVersion;
		const session = adapter.begin({ targetKey: adapter.key });
		expect(session).not.toBeNull();
		expect(store.isDocumentTransactionActive).toBe(true);
		expect(store.canUndo).toBe(false);
		expect(store.transformInteractionActive).toBe(true);
		expect(store.transformInteractionKind).toBe('placement');

		// A second begin while the transaction is open refuses — no double
		// session, no second baseline.
		expect(adapter.begin({ targetKey: adapter.key })).toBeNull();
		expect(store.transformInteractionActive).toBe(true);

		session!.cancel('target-change');
		expect(store.isDocumentTransactionActive).toBe(false);
		expect(store.canUndo).toBe(false);
		expect(store.historyVersion).toBe(historyBefore);
	});

	it('begin refuses when a document transaction is already open', () => {
		const store = createFixtureEditorStore();
		selectPlacementRoots(store);
		const adapter = createSceneGizmoAdapter(makeInput(store))!;
		expect(store.beginDocumentTransaction()).toBe(true);
		expect(adapter.begin({ targetKey: adapter.key })).toBeNull();
		expect(store.transformInteractionActive).toBe(false);
		store.cancelDocumentTransaction();
		expect(store.canUndo).toBe(false);
	});

	it('previews rigid deltas in-flight and commits exactly one history entry', () => {
		const store = createFixtureEditorStore();
		const { ids, roots } = selectPlacementRoots(store);
		const input = makeInput(store);
		const adapter = createSceneGizmoAdapter(input)!;
		adapter.prepare?.();
		expect(input.pivot.position.toArray()).toEqual([0, 0, 0]);

		const historyBefore = store.historyVersion;
		const session = adapter.begin({ targetKey: adapter.key })!;

		// Preview: move the pivot and re-derive every member from the
		// drag-start baseline.
		input.pivot.position.set(1.25, 0, -0.5);
		input.pivot.updateMatrixWorld(true);
		session.preview({ targetKey: adapter.key, axis: 'X' });
		expect(roots[0]!.position.x).toBeCloseTo(0.25);
		expect(roots[1]!.position.x).toBeCloseTo(2.25);
		expect(store.canUndo).toBe(false); // in-flight
		const previewed = store.document.entities.find(
			(entity) => entity.id === ids[1]!
		)!;
		expect(previewed.position[0]).toBeCloseTo(2.25);

		// Preview number two: returning the pivot to baseline restores every
		// member — no preview ever depends on the previous one.
		input.pivot.position.set(0, 0, 0);
		input.pivot.updateMatrixWorld(true);
		session.preview({ targetKey: adapter.key, axis: 'X' });
		expect(roots[1]!.position.x).toBeCloseTo(1);

		session.commit({ targetKey: adapter.key });
		expect(store.historyVersion).toBe(historyBefore + 1);
		expect(store.canUndo).toBe(true);
		expect(store.isDocumentTransactionActive).toBe(false);
		expect(store.transformInteractionActive).toBe(false);
		const committed = store.document.entities.find(
			(entity) => entity.id === ids[1]!
		)!;
		expect(committed.position[0]).toBeCloseTo(1);
		// Commit re-centers the pivot on the committed roots.
		expect(input.pivot.position.toArray()).toEqual([0, 0, 0]);
	});

	it('routes the effective mode into the preview: rotate spins the cluster about the centroid', () => {
		const store = createFixtureEditorStore();
		const { roots } = selectPlacementRoots(store);
		const input = makeInput(store, { getMode: () => 'rotate' });
		const adapter = createSceneGizmoAdapter(input)!;
		adapter.prepare?.();

		const historyBefore = store.historyVersion;
		const session = adapter.begin({ targetKey: adapter.key })!;
		input.pivot.rotation.y = Math.PI / 2;
		input.pivot.updateMatrixWorld(true);
		session.preview({ targetKey: adapter.key, axis: 'Y' });
		expect(roots[0]!.position.x).toBeCloseTo(0);
		expect(roots[0]!.position.z).toBeCloseTo(1);
		expect(roots[1]!.position.x).toBeCloseTo(0);
		expect(roots[1]!.position.z).toBeCloseTo(-1);

		session.commit({ targetKey: adapter.key });
		expect(store.historyVersion).toBe(historyBefore + 1);
	});

	it('commit keeps the selection on the floor and lands one history entry', () => {
		const store = createFixtureEditorStore();
		const entity = store.document.entities[0]!;
		const root = makeRoot(entity.id, [0, 2, 0]);
		root.userData.roomId = entity.roomId;
		store.registerPlacementRoot(entity.id, root);
		expect(store.selectionActions.selectPlacement(entity.id)).toBe(true);

		store.keepOnFloor = true;
		const input = makeInput(store, { scene: makeFloorScene(entity.roomId) });
		const adapter = createSceneGizmoAdapter(input)!;
		adapter.prepare?.();
		// Single-root prepare pivots on the root's own origin.
		expect(input.pivot.position.toArray()).toEqual([0, 2, 0]);

		const historyBefore = store.historyVersion;
		const session = adapter.begin({ targetKey: adapter.key })!;
		input.pivot.position.set(0, 4, 0);
		input.pivot.updateMatrixWorld(true);
		session.preview({ targetKey: adapter.key, axis: 'Y' });
		expect(root.position.y).toBeCloseTo(4);

		session.commit({ targetKey: adapter.key });
		// Grounded on the floor at y=0: root half-height 0.25 → y = 0.25.
		expect(root.position.y).toBeCloseTo(0.25);
		expect(store.document.entities[0]!.position[1]).toBeCloseTo(0.25);
		expect(store.historyVersion).toBe(historyBefore + 1);
		expect(store.canUndo).toBe(true);
		expect(store.transformInteractionActive).toBe(false);
		// Commit re-centers the pivot on the grounded root.
		expect(input.pivot.position.toArray()).toEqual([0, 0.25, 0]);
	});

	it('commit without a floor below reports failure but still closes the transaction once', () => {
		const store = createFixtureEditorStore();
		const entity = store.document.entities[0]!;
		const root = makeRoot(entity.id, [50, 2, 50]); // outside the 20×20 floor
		root.userData.roomId = entity.roomId;
		store.registerPlacementRoot(entity.id, root);
		expect(store.selectionActions.selectPlacement(entity.id)).toBe(true);

		store.keepOnFloor = true;
		const input = makeInput(store, { scene: makeFloorScene(entity.roomId) });
		const adapter = createSceneGizmoAdapter(input)!;
		adapter.prepare?.();

		const historyBefore = store.historyVersion;
		const session = adapter.begin({ targetKey: adapter.key })!;
		input.pivot.position.set(50, 4, 50);
		input.pivot.updateMatrixWorld(true);
		session.preview({ targetKey: adapter.key, axis: 'Y' });
		expect(root.position.y).toBeCloseTo(4);

		session.commit({ targetKey: adapter.key });
		expect(store.statusMessage).toBe('No floor below selection');
		// No grounding write, but the single transaction still closes with the
		// previewed pose (monolith parity).
		expect(root.position.y).toBeCloseTo(4);
		expect(store.document.entities[0]!.position[1]).toBeCloseTo(4);
		expect(store.historyVersion).toBe(historyBefore + 1);
		expect(store.transformInteractionActive).toBe(false);
	});
});

describe('scene-gizmo-adapter — snap routing and cancel', () => {
	it('routes translation snap through the preference + Shift guard', () => {
		const store = createFixtureEditorStore();
		const { roots } = selectPlacementRoots(store);
		store.translationSnapEnabled = true;
		store.translationSnap = 0.25;

		// Snap enabled, no Shift: the pivot snaps to the 0.25 grid before the
		// rigid delta (1.37 → 1.25, 3.11 → 3).
		const input = makeInput(store);
		const adapter = createSceneGizmoAdapter(input)!;
		adapter.prepare?.();
		const session = adapter.begin({ targetKey: adapter.key })!;
		input.pivot.position.set(1.37, 0, 3.11);
		input.pivot.updateMatrixWorld(true);
		session.preview({ targetKey: adapter.key, axis: 'X' });
		expect(roots[0]!.position.x).toBeCloseTo(0.25);
		expect(roots[0]!.position.z).toBeCloseTo(3);
		session.cancel('target-change');
		expect(roots[0]!.position.x).toBeCloseTo(-1);

		// Shift held: the raw move writes through untouched.
		const shifted = makeInput(store, { isShiftHeld: () => true });
		const adapterShift = createSceneGizmoAdapter(shifted)!;
		adapterShift.prepare?.();
		const sessionShift = adapterShift.begin({ targetKey: adapterShift.key })!;
		shifted.pivot.position.set(1.37, 0, 3.11);
		shifted.pivot.updateMatrixWorld(true);
		sessionShift.preview({ targetKey: adapterShift.key, axis: 'X' });
		expect(roots[0]!.position.z).toBeCloseTo(3.11);
		sessionShift.cancel('target-change');
	});

	it('cancel restores every root, rolls back the transaction, and escape deselects', () => {
		const store = createFixtureEditorStore();
		const { roots } = selectPlacementRoots(store);
		const input = makeInput(store);
		const adapter = createSceneGizmoAdapter(input)!;
		adapter.prepare?.();

		const historyBefore = store.historyVersion;
		const session = adapter.begin({ targetKey: adapter.key })!;
		input.pivot.position.set(1.25, 0, -0.5);
		input.pivot.updateMatrixWorld(true);
		session.preview({ targetKey: adapter.key, axis: 'X' });
		expect(roots[1]!.position.x).toBeCloseTo(2.25);

		session.cancel('escape');
		// Visual roots restore from the drag-start snapshots and nothing lands
		// in history — the visual and the document stay in sync.
		expect(roots[0]!.position.x).toBeCloseTo(-1);
		expect(roots[1]!.position.x).toBeCloseTo(1);
		expect(store.canUndo).toBe(false);
		expect(store.historyVersion).toBe(historyBefore);
		expect(store.isDocumentTransactionActive).toBe(false);
		expect(store.transformInteractionActive).toBe(false);
		// Placement Escape deselects so the follow-up ACTIVE_TARGET_CHANGE(null)
		// lands the FSM in Idle.
		expect(store.selectedPlacementIds).toHaveLength(0);
	});

	it('non-escape cancel restores and rolls back but keeps the selection', () => {
		const store = createFixtureEditorStore();
		const { roots } = selectPlacementRoots(store);
		const input = makeInput(store);
		const adapter = createSceneGizmoAdapter(input)!;
		adapter.prepare?.();

		const session = adapter.begin({ targetKey: adapter.key })!;
		input.pivot.position.set(1.25, 0, -0.5);
		input.pivot.updateMatrixWorld(true);
		session.preview({ targetKey: adapter.key, axis: 'X' });

		session.cancel('target-change');
		expect(roots[1]!.position.x).toBeCloseTo(1);
		expect(store.canUndo).toBe(false);
		expect(store.isDocumentTransactionActive).toBe(false);
		expect(store.transformInteractionActive).toBe(false);
		expect(store.selectedPlacementIds).toHaveLength(2);
	});
});
