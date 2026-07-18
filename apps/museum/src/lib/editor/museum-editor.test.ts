import { describe, expect, it } from 'vitest';
import {
	assertNavigationGraphMatchesScene,
	museumSceneDocument
} from '$lib/content/scene';
import { getRoom } from '$lib/content/rooms';
import { Object3D } from 'three';
import {
	filterEffectiveHits,
	nextPlacementCycleId,
	NEAR_INVISIBLE_OPACITY,
	resolveNormalSelection,
	uniquePlacementIdsInOrder,
	type SelectionHitInfo
} from './editor-selection';
import {
	cloneMuseumSceneDocument,
	createMuseumEditorStore,
	EDITOR_BRIGHT_LIGHTING,
	EDITOR_VISITOR_LIGHTING
} from './museum-editor.svelte';
import { createEditorRoomCameraFrame } from './editor-camera';
import {
	degreesToRadians,
	enforceUniformObjectScale,
	MIN_PLACEMENT_SCALE,
	placementTransformFromDocument,
	radiansToDegrees,
	writePlacementTransform
} from './editor-transform';

describe('cloneMuseumSceneDocument', () => {
	it('does not mutate the checked-in museumSceneDocument singleton', () => {
		const clone = cloneMuseumSceneDocument(museumSceneDocument);
		const originalFirstId = museumSceneDocument.objects[0]?.id;
		const originalObjectCount = museumSceneDocument.objects.length;

		clone.objects[0]!.id = 'mutated-placement-id';
		clone.objects.push({
			...clone.objects[0]!,
			id: 'extra-placement'
		});

		expect(museumSceneDocument.objects[0]?.id).toBe(originalFirstId);
		expect(museumSceneDocument.objects).toHaveLength(originalObjectCount);
		expect(clone.objects[0]?.id).toBe('mutated-placement-id');
		expect(clone.objects).toHaveLength(originalObjectCount + 1);
	});
});

describe('createMuseumEditorStore', () => {
	it('resolves default object and node counts from a session clone', () => {
		const store = createMuseumEditorStore();

		expect(store.document).not.toBe(museumSceneDocument);
		expect(store.document.objects).toHaveLength(museumSceneDocument.objects.length);
		expect(store.document.navigationNodes).toHaveLength(
			museumSceneDocument.navigationNodes.length
		);
		expect(store.scene.objects).toHaveLength(museumSceneDocument.objects.length);
		expect(store.scene.navigationNodes).toHaveLength(
			museumSceneDocument.navigationNodes.length
		);
		expect(store.state.activeNodeId).toBe('paris-seat');
		expect(store.state.currentRoomId).toBe('paris');
	});

	it('keeps the checked-in document intact when the session document mutates', () => {
		const store = createMuseumEditorStore();
		const originalFirstId = museumSceneDocument.objects[0]?.id;

		store.document.objects[0]!.id = 'session-only-id';

		expect(museumSceneDocument.objects[0]?.id).toBe(originalFirstId);
		expect(store.document.objects[0]?.id).toBe('session-only-id');
	});

	it('defaults to bright editor lighting and can restore the visitor preset', () => {
		const store = createMuseumEditorStore();

		expect(store.ambientIntensity).toBe(EDITOR_BRIGHT_LIGHTING.ambientIntensity);
		expect(store.fogEnabled).toBe(false);

		store.applyLightingPreset(EDITOR_VISITOR_LIGHTING);

		expect(store.ambientIntensity).toBe(EDITOR_VISITOR_LIGHTING.ambientIntensity);
		expect(store.directionalIntensity).toBe(EDITOR_VISITOR_LIGHTING.directionalIntensity);
		expect(store.fogEnabled).toBe(true);
	});
});

describe('MuseumEditorStore selection', () => {
	it('requires an editable room and selects document ids without a registered root', () => {
		const store = createMuseumEditorStore();
		const id = store.document.objects[0]!.id;

		store.selectPlacement(id);
		expect(store.selectedPlacementId).toBeNull();

		store.selectRoom('paris');
		store.selectPlacement(id);

		expect(store.selectedPlacementId).toBe(id);
		expect(store.getPlacementRoot(id)).toBeUndefined();
		expect(store.selectedObject?.id).toBe(id);
	});

	it('ignores unknown ids without clearing the current selection', () => {
		const store = createMuseumEditorStore();
		const id = store.document.objects[0]!.id;
		store.selectRoom('paris');
		store.selectPlacement(id);

		store.selectPlacement('not-a-real-placement');

		expect(store.selectedPlacementId).toBe(id);
	});

	it('deselects the current placement', () => {
		const store = createMuseumEditorStore();
		store.selectRoom('paris');
		store.selectPlacement(store.document.objects[0]!.id);
		store.deselect();
		expect(store.selectedPlacementId).toBeNull();
		expect(store.selectedRoomId).toBe('paris');
	});

	it('cycles with empty / absent / wrap rules', () => {
		const store = createMuseumEditorStore();
		const a = store.document.objects[0]!.id;
		const b = store.document.objects[1]!.id;
		const c = store.document.objects[2]!.id;

		store.cyclePlacement([]);
		expect(store.selectedPlacementId).toBeNull();

		store.selectRoom('paris');
		store.selectPlacement(a);
		store.cyclePlacement([b, c]);
		expect(store.selectedPlacementId).toBe(b);

		store.cyclePlacement([b, c]);
		expect(store.selectedPlacementId).toBe(c);

		store.cyclePlacement([b, c]);
		expect(store.selectedPlacementId).toBe(b);
	});

	it('resets a newly selected placement to rotate but preserves the current mode on reselect', () => {
		const store = createMuseumEditorStore();
		const a = store.document.objects[0]!.id;
		const b = store.document.objects[1]!.id;
		store.selectRoom('paris');

		store.selectPlacement(a);
		store.transformMode = 'translate';
		store.selectPlacement(a);
		expect(store.transformMode).toBe('translate');

		store.selectPlacement(b);
		expect(store.selectedPlacementId).toBe(b);
		expect(store.selectedObject?.id).toBe(b);
		expect(store.transformMode).toBe('rotate');
	});

	it('toggles middle-button camera panning independently of room selection', () => {
		const store = createMuseumEditorStore();
		expect(store.cameraPanEnabled).toBe(true);
		store.toggleCameraPan();
		expect(store.cameraPanEnabled).toBe(false);
		expect(store.selectedRoomId).toBeNull();
	});

	it('bumps registryVersion on register and unregister', () => {
		const store = createMuseumEditorStore();
		const id = store.document.objects[0]!.id;
		const root = new Object3D();
		const version0 = store.registryVersion;

		store.registerPlacementRoot(id, root);
		expect(store.registryVersion).toBe(version0 + 1);
		expect(store.getPlacementRoot(id)).toBe(root);

		store.registerPlacementRoot(id, root);
		expect(store.registryVersion).toBe(version0 + 1);

		store.unregisterPlacementRoot(id, root);
		expect(store.registryVersion).toBe(version0 + 2);
		expect(store.getPlacementRoot(id)).toBeUndefined();
	});

	it('keeps ordered multi-selection as the only mutable selection source', () => {
		const store = createMuseumEditorStore();
		const [a, b, c] = store.document.objects;
		store.selectRoom('paris');
		store.selectPlacement(a.id);
		store.togglePlacement(b.id);
		store.togglePlacement(c.id);
		expect(store.selectedPlacementIds).toEqual([a.id, b.id, c.id]);
		expect(store.primaryPlacementId).toBe(c.id);

		store.togglePlacement(b.id);
		expect(store.selectedPlacementIds).toEqual([a.id, c.id]);
		store.selectPlacement(b.id);
		expect(store.selectedPlacementIds).toEqual([b.id]);
	});
});

describe('MuseumEditorStore clusters', () => {
	it('creates, selects, renames, and ungroups through document history', () => {
		const store = createMuseumEditorStore();
		const [a, b] = store.document.objects;
		store.selectRoom('paris');
		store.selectPlacements([a.id, b.id]);
		const clusterId = store.createCluster('Salon pair');
		expect(clusterId).toBeTruthy();
		expect(store.selectedClusterId).toBe(clusterId);
		expect(store.selectedPlacementIds).toEqual([a.id, b.id]);
		expect(store.clusters[0]?.name).toBe('Salon pair');
		expect(store.statusMessage).toBe('Grouped 2 objects');

		expect(store.renameCluster(clusterId!, 'Reading pair')).toBe(true);
		expect(store.clusters[0]?.name).toBe('Reading pair');
		expect(store.undo()).toBe(true);
		expect(store.clusters[0]?.name).toBe('Salon pair');
		expect(store.redo()).toBe(true);
		expect(store.clusters[0]?.name).toBe('Reading pair');

		expect(store.ungroupCluster(clusterId)).toBe(true);
		expect(store.clusters).toHaveLength(0);
		expect(store.undo()).toBe(true);
		expect(store.clusters[0]?.memberIds).toEqual([a.id, b.id]);
	});

	it('rejects empty and unchanged rename attempts without adding history', () => {
		const store = createMuseumEditorStore();
		const [a, b] = store.document.objects;
		store.selectRoom('paris');
		store.selectPlacements([a.id, b.id]);
		const clusterId = store.createCluster('Piano grouping')!;

		expect(store.renameCluster(clusterId, '   ')).toBe(false);
		expect(store.renameCluster(clusterId, 'Piano grouping')).toBe(false);
		expect(store.clusters[0]?.name).toBe('Piano grouping');

		// The only history entry is cluster creation; invalid/no-op renames add none.
		expect(store.undo()).toBe(true);
		expect(store.clusters).toHaveLength(0);
	});

	it('clears cluster identity when a member is toggled and reconciles deleted clusters on undo', () => {
		const store = createMuseumEditorStore();
		const [a, b] = store.document.objects;
		store.selectRoom('paris');
		store.selectPlacements([a.id, b.id]);
		const clusterId = store.createCluster()!;
		store.togglePlacement(a.id);
		expect(store.selectedClusterId).toBeNull();
		expect(store.selectedPlacementIds).toEqual([b.id]);

		store.selectCluster(clusterId);
		expect(store.undo()).toBe(true);
		expect(store.clusters).toHaveLength(0);
		expect(store.selectedClusterId).toBeNull();
		expect(store.selectedPlacementIds).toEqual([]);
	});

	it('adds and removes members with one-cluster ownership and auto-ungroup rules', () => {
		const store = createMuseumEditorStore();
		const [a, b, c, d] = store.document.objects;
		store.selectRoom('paris');
		store.selectPlacements([a.id, b.id]);
		const firstCluster = store.createCluster()!;
		expect(store.addMemberToCluster(firstCluster, c.id)).toBe(true);
		expect(store.clusters[0]?.memberIds).toEqual([a.id, b.id, c.id]);

		store.selectPlacements([c.id, d.id]);
		expect(store.createCluster()).toBeNull();
		expect(store.clusters).toHaveLength(1);

		expect(store.removeMemberFromCluster(firstCluster, c.id)).toBe(true);
		expect(store.removeMemberFromCluster(firstCluster, b.id)).toBe(true);
		expect(store.clusters).toHaveLength(0);
	});

	it('auto-ungroups when deletion leaves one member and restores everything on undo', () => {
		const store = createMuseumEditorStore();
		const [a, b] = store.document.objects;
		store.selectRoom('paris');
		store.selectPlacements([a.id, b.id]);
		store.createCluster();
		expect(store.deletePlacement(a.id)).toBe(true);
		expect(store.document.objects.some((object) => object.id === a.id)).toBe(false);
		expect(store.clusters).toHaveLength(0);

		expect(store.undo()).toBe(true);
		expect(store.document.objects.some((object) => object.id === a.id)).toBe(true);
		expect(store.clusters[0]?.memberIds).toEqual([a.id, b.id]);
	});

	it('restores cluster membership and transforms together from one snapshot', () => {
		const store = createMuseumEditorStore();
		const [a, b] = store.document.objects;
		const originalX = a.position[0];
		store.selectRoom('paris');
		store.selectPlacements([a.id, b.id]);
		expect(store.beginDocumentTransaction()).toBe(true);
		store.document.clusters!.push({
			id: 'combined-snapshot',
			name: 'Combined snapshot',
			roomId: 'paris',
			memberIds: [a.id, b.id]
		});
		const transform = placementTransformFromDocument(a);
		transform.position[0] += 2;
		store.updatePlacementTransform(a.id, transform);
		expect(store.commitDocumentTransaction()).toBe(true);

		expect(store.undo()).toBe(true);
		expect(store.clusters).toHaveLength(0);
		expect(store.document.objects.find((object) => object.id === a.id)?.position[0]).toBe(originalX);
	});
});

describe('editor room camera framing', () => {
	it('centers the target in Paris and follows its authored yaw', () => {
		const room = getRoom('paris');
		const frame = createEditorRoomCameraFrame(room);

		expect(frame.target).toEqual([
			room.position[0],
			room.position[1] + room.dimensions[1] / 2,
			room.position[2]
		]);
		expect(frame.position.every(Number.isFinite)).toBe(true);
		expect(frame.radius).toBeGreaterThan(0);
		expect(frame.minDistance).toBe(0.2);
		expect(frame.minDistance).toBeLessThan(frame.maxDistance);

		const dx = frame.position[0] - frame.target[0];
		const dz = frame.position[2] - frame.target[2];
		expect(Math.atan2(dx, dz)).toBeCloseTo(room.rotation[1]);
	});
});

describe('editor placement transforms', () => {
	it('converts degrees and radians at the inspector boundary', () => {
		expect(radiansToDegrees(Math.PI / 2)).toBeCloseTo(90);
		expect(degreesToRadians(180)).toBeCloseTo(Math.PI);
	});

	it('enforces one positive scale from the active axis', () => {
		const root = new Object3D();
		root.scale.set(2, 3, 4);
		expect(enforceUniformObjectScale(root, 'Y')).toBe(3);
		expect(root.scale.toArray()).toEqual([3, 3, 3]);

		root.scale.set(-2, -2, -2);
		expect(enforceUniformObjectScale(root, 'X')).toBe(MIN_PLACEMENT_SCALE);
		expect(root.scale.toArray()).toEqual([
			MIN_PLACEMENT_SCALE,
			MIN_PLACEMENT_SCALE,
			MIN_PLACEMENT_SCALE
		]);
	});

	it('omits unit scale and rejects invalid transform values', () => {
		const placement = cloneMuseumSceneDocument(museumSceneDocument).objects[0]!;
		const transform = placementTransformFromDocument(placement);
		transform.scale = 1;
		expect(writePlacementTransform(placement, transform)).toBe(true);
		expect(placement.scale).toBeUndefined();

		transform.position[0] = Number.NaN;
		expect(writePlacementTransform(placement, transform)).toBe(false);
	});
});

describe('MuseumEditorStore history', () => {
	function translatedTransform(store: ReturnType<typeof createMuseumEditorStore>, x: number) {
		const transform = placementTransformFromDocument(store.document.objects[0]!);
		transform.position[0] = x;
		return transform;
	}

	it('collapses previews into one commit and restores scene/state identity', () => {
		const store = createMuseumEditorStore();
		const id = store.document.objects[0]!.id;
		const originalX = store.document.objects[0]!.position[0];
		store.selectRoom('paris');
		store.selectPlacement(id);

		expect(store.beginDocumentTransaction()).toBe(true);
		store.updatePlacementTransform(id, translatedTransform(store, 2));
		store.updatePlacementTransform(id, translatedTransform(store, 3));
		expect(store.commitDocumentTransaction()).toBe(true);
		expect(store.canUndo).toBe(true);
		expect(store.document.objects[0]!.position[0]).toBe(3);
		assertNavigationGraphMatchesScene(store.state.graph, store.scene);

		expect(store.undo()).toBe(true);
		expect(store.document.objects[0]!.position[0]).toBe(originalX);
		expect(store.selectedPlacementId).toBe(id);
		assertNavigationGraphMatchesScene(store.state.graph, store.scene);

		expect(store.redo()).toBe(true);
		expect(store.document.objects[0]!.position[0]).toBe(3);
		assertNavigationGraphMatchesScene(store.state.graph, store.scene);
	});

	it('suppresses no-ops and clears redo after a divergent edit', () => {
		const store = createMuseumEditorStore();
		const id = store.document.objects[0]!.id;
		store.selectRoom('paris');

		store.beginDocumentTransaction();
		expect(store.commitDocumentTransaction()).toBe(false);
		expect(store.canUndo).toBe(false);

		store.commitPlacementTransform(id, translatedTransform(store, 2));
		store.undo();
		expect(store.canRedo).toBe(true);
		store.commitPlacementTransform(id, translatedTransform(store, 4));
		expect(store.canRedo).toBe(false);
	});

	it('keeps at most 100 undoable document commits', () => {
		const store = createMuseumEditorStore();
		const id = store.document.objects[0]!.id;
		store.selectRoom('paris');

		for (let index = 1; index <= 105; index += 1) {
			store.commitPlacementTransform(id, translatedTransform(store, index));
		}

		let undoCount = 0;
		while (store.undo()) undoCount += 1;
		expect(undoCount).toBe(100);
	});
});

describe('MuseumEditorStore placement settings', () => {
	it('defaults snap and keep-on-floor settings outside document history', () => {
		const store = createMuseumEditorStore();
		expect(store.translationSnapEnabled).toBe(true);
		expect(store.translationSnap).toBe(0.1);
		expect(store.rotationSnapEnabled).toBe(true);
		expect(store.rotationSnapDegrees).toBe(15);
		expect(store.keepOnFloor).toBe(false);

		const id = store.document.objects[0]!.id;
		store.selectRoom('paris');
		store.translationSnapEnabled = false;
		store.rotationSnapDegrees = 45;
		store.keepOnFloor = true;

		const transform = placementTransformFromDocument(store.document.objects[0]!);
		transform.position[1] = 1.25;
		store.commitPlacementTransform(id, transform);
		expect(store.undo()).toBe(true);

		expect(store.translationSnapEnabled).toBe(false);
		expect(store.rotationSnapDegrees).toBe(45);
		expect(store.keepOnFloor).toBe(true);
		expect(JSON.stringify(store.document)).not.toContain('translationSnap');
		expect(JSON.stringify(store.document)).not.toContain('keepOnFloor');
	});

	it('records one history entry when a grounded Y change is committed', () => {
		const store = createMuseumEditorStore();
		const id = store.document.objects[0]!.id;
		const originalY = store.document.objects[0]!.position[1];
		store.selectRoom('paris');
		store.selectPlacement(id);

		const transform = placementTransformFromDocument(store.document.objects[0]!);
		transform.position[1] = originalY + 1.5;
		expect(store.commitPlacementTransform(id, transform)).toBe(true);
		expect(store.document.objects[0]!.position[1]).toBeCloseTo(originalY + 1.5);

		expect(store.undo()).toBe(true);
		expect(store.document.objects[0]!.position[1]).toBeCloseTo(originalY);

		expect(store.redo()).toBe(true);
		expect(store.document.objects[0]!.position[1]).toBeCloseTo(originalY + 1.5);
	});

	it('bumps drop requests only when a placement is selected', () => {
		const store = createMuseumEditorStore();
		expect(store.dropToFloorRequestId).toBe(0);

		store.requestDropToFloor();
		expect(store.dropToFloorRequestId).toBe(0);
		expect(store.statusMessage).toBe('Select a placement to drop to floor');

		const id = store.document.objects[0]!.id;
		store.selectRoom('paris');
		store.selectPlacement(id);
		store.requestDropToFloor();
		expect(store.dropToFloorRequestId).toBe(1);
	});
});

describe('editor-selection helpers', () => {
	const hits = (entries: Array<[number, string | null]>): SelectionHitInfo[] =>
		entries.map(([opacity, placementId]) => ({ opacity, placementId }));

	it('filters near-invisible hits for normal selection', () => {
		expect(
			resolveNormalSelection(
				hits([
					[NEAR_INVISIBLE_OPACITY - 0.01, 'ghost'],
					[1, 'piano']
				])
			)
		).toEqual({ action: 'select', id: 'piano' });

		expect(resolveNormalSelection(hits([[1, null]]))).toEqual({ action: 'deselect' });
		expect(resolveNormalSelection(hits([]))).toEqual({ action: 'deselect' });
	});

	it('dedupes placement ids while preserving hit order', () => {
		expect(
			uniquePlacementIdsInOrder(
				hits([
					[0.01, 'a'],
					[1, 'b'],
					[1, 'c'],
					[1, 'b'],
					[1, 'd']
				])
			)
		).toEqual(['b', 'c', 'd']);
	});

	it('implements cycle next-id rules', () => {
		expect(nextPlacementCycleId('x', [])).toBeUndefined();
		expect(nextPlacementCycleId(null, ['a', 'b'])).toBe('a');
		expect(nextPlacementCycleId('z', ['a', 'b'])).toBe('a');
		expect(nextPlacementCycleId('a', ['a', 'b'])).toBe('b');
		expect(nextPlacementCycleId('b', ['a', 'b'])).toBe('a');
	});

	it('keeps near-invisible hits out of effective lists', () => {
		expect(filterEffectiveHits(hits([[0.01, 'a'], [0.05, 'b'], [1, 'c']]))).toEqual([
			{ opacity: 0.05, placementId: 'b' },
			{ opacity: 1, placementId: 'c' }
		]);
	});
});
