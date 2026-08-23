import { describe, expect, it } from 'vitest';
import { chopinRuntime } from '$lib/content/chopin-project';
import { Object3D } from 'three';
import { cloneFixtureDocument } from '../content/__fixtures__/load-fixture-scene';
import { getRoom, roomLocalPoint, roomPoint } from '$lib/content/rooms';
import { placementTransformFromDocument } from '$lib/editor/editor-transform';
import {
	cloneSceneDocument,
	createEditorStore,
	EditorStore,
	type SceneDocument
} from '$lib/editor/editor-store.svelte';
import { createFixtureEditorStore, createRelicFixtureEditorStore } from './editor-test-utils';

describe('EditorStore Phase 5 placement commands', () => {
	it('replaces pending floor assets, rejects unsupported surfaces, and cancels stale assets', () => {
		const store = createRelicFixtureEditorStore();
		const focusVersion = store.cameraFocusVersion;
		expect(store.beginAssetPlacement('paris-salon-chair')).toBe(true);
		expect(store.selectedRoomId).toBe('paris');
		expect(store.pendingPlacementAssetId).toBe('paris-salon-chair');
		expect(store.cameraFocusVersion).toBe(focusVersion);

		expect(store.beginAssetPlacement('paris-salon-table')).toBe(true);
		expect(store.pendingPlacementAssetId).toBe('paris-salon-table');
		expect(store.beginAssetPlacement('paris-table-lamp')).toBe(false);
		expect(store.pendingPlacementAssetId).toBe('paris-salon-table');

		store.pendingPlacementAssetId = 'missing-asset';
		expect(store.createPendingPlacementAt([0, 0, 0], 'paris')).toBeNull();
		expect(store.pendingPlacementAssetId).toBeNull();
	});

	it('creates explicit scene fields with reserved IDs and one undo entry', () => {
		const store = createRelicFixtureEditorStore();
		store.selectionActions.selectRoom('paris');
		const focusVersion = store.cameraFocusVersion;
		expect(store.beginAssetPlacement('paris-salon-chair')).toBe(true);
		const firstId = store.createPendingPlacementAt([1, 0.01, 2], 'paris');
		expect(firstId).toBe('paris-salon-chair-placement');
		const first = store.document.entities.find((object) => object.id === firstId);
		expect(first).toMatchObject({
			roomId: 'paris',
			assetId: 'paris-salon-chair',
			fallback: 'chair',
			position: [1, 0.01, 2],
			rotation: [0, 0, 0]
		});
		expect(first).not.toHaveProperty('scale');
		expect(store.pendingFramePlacementIds).toEqual([]);
		expect(store.cameraFocusVersion).toBe(focusVersion);

		expect(store.undo()).toBe(true);
		expect(store.document.entities.some((object) => object.id === firstId)).toBe(false);
		expect(store.pendingFramePlacementIds).toEqual([]);

		expect(store.redo()).toBe(true);
		store.beginAssetPlacement('paris-salon-chair');
		expect(store.createPendingPlacementAt([2, 0.01, 3], 'paris')).toBe(
			'paris-salon-chair-placement-2'
		);
	});

	it('preserves Paris local coordinates across its authored yaw and scene rebuild', () => {
		const store = createRelicFixtureEditorStore();
		const expectedLocal: [number, number, number] = [2.25, 0.01, -1.75];
		const world = roomPoint('paris', expectedLocal);
		const local = roomLocalPoint('paris', world);
		store.beginAssetPlacement('paris-salon-table');
		const id = store.createPendingPlacementAt(local, 'paris')!;
		const documentPosition = store.document.entities.find((object) => object.id === id)!.position;
		const runtimePosition = store.scene.objects.find((object) => object.id === id)!.position;
		expect(documentPosition[0]).toBeCloseTo(expectedLocal[0], 8);
		expect(documentPosition[2]).toBeCloseTo(expectedLocal[2], 8);
		expect(runtimePosition).toEqual(documentPosition);
	});

	it('duplicates selected sources with batch-safe IDs and preserves the first copy as primary', () => {
		const document = cloneFixtureDocument();
		const chair = document.entities.find(
			(object) => object.kind === 'model' && object.assetId === 'paris-salon-chair'
		)!;
		document.entities.push({
			...chair,
			id: 'fixture-chair-b',
			position: [chair.position[0] + 1, chair.position[1], chair.position[2]]
		});
		const store = createEditorStore({ document, rooms: chopinRuntime.rooms });
		store.selectionActions.selectRoom('paris');
		const first = document.entities.find((object) => object.id === 'fixture-chair')!;
		const second = document.entities.find((object) => object.id === 'fixture-chair-b')!;
		store.selectionActions.selectPlacements([first.id, second.id]);
		const originalCount = store.objectCount;
		expect(store.duplicateSelection()).toBe(true);
		const copyIds = store.document.entities.slice(originalCount).map((object) => object.id);
		expect(new Set(copyIds).size).toBe(2);
		expect(copyIds).toEqual([`${second.id}-copy`, `${first.id}-copy`]);
		expect(store.primaryPlacementId).toBe(copyIds[0]);
		for (const copy of store.document.entities.slice(originalCount)) {
			const sourceId = [...store.document.entities]
				.filter((object) => !copyIds.includes(object.id))
				.find((object) => `${object.id}-copy` === copy.id)?.id;
			expect(sourceId).toBeTruthy();
		}
	});

	it('recreates complete flat clusters with collision-safe cluster IDs', () => {
		const store = createFixtureEditorStore(4);
		const [a, b, c, d] = store.document.entities;
		store.selectionActions.selectRoom('paris');
		store.selectionActions.selectPlacements([a.id, b.id]);
		const sourceClusterId = store.createCluster('Salon pair')!;
		store.selectionActions.selectPlacements([c.id, d.id]);
		const occupiedClusterId = store.createCluster('Occupied')!;
		expect(store.beginDocumentTransaction()).toBe(true);
		store.clusters.find((cluster) => cluster.id === occupiedClusterId)!.id = `${sourceClusterId}-copy`;
		expect(store.commitDocumentTransaction()).toBe(true);

		store.selectionActions.selectCluster(sourceClusterId);
		expect(store.duplicateSelection()).toBe(true);
		const copiedCluster = store.clusters.find(
			(cluster) => cluster.id === `${sourceClusterId}-copy-2`
		);
		expect(copiedCluster).toMatchObject({ name: 'Salon pair Copy', roomId: 'paris' });
		expect(copiedCluster?.memberIds).toHaveLength(2);
		expect(copiedCluster?.memberIds.every((id) => id.includes('-copy'))).toBe(true);
	});

	it('does not reconstruct a partially selected source cluster', () => {
		const store = createFixtureEditorStore();
		const [a, b] = store.document.entities;
		store.selectionActions.selectRoom('paris');
		store.selectionActions.selectPlacements([a.id, b.id]);
		store.createCluster('Pair');
		const beforeClusters = store.clusters.length;
		store.selectionActions.selectPlacement(a.id);
		expect(store.duplicateSelection()).toBe(true);
		expect(store.clusters).toHaveLength(beforeClusters);
	});

	it('deletes cluster members with stable cleanup rules and undo restoration', () => {
		const store = createFixtureEditorStore(3);
		const [a, b, c] = store.document.entities;
		store.selectionActions.selectRoom('paris');
		store.selectionActions.selectPlacements([a.id, b.id, c.id]);
		const clusterId = store.createCluster('Trio')!;

		store.selectionActions.selectPlacement(a.id);
		expect(store.deleteSelection()).toBe(true);
		expect(store.clusters.find((cluster) => cluster.id === clusterId)?.memberIds).toEqual([
			b.id,
			c.id
		]);
		expect(store.undo()).toBe(true);
		expect(store.clusters.find((cluster) => cluster.id === clusterId)?.memberIds).toEqual([
			a.id,
			b.id,
			c.id
		]);

		store.selectionActions.selectPlacement(a.id);
		store.selectionActions.selectPlacements([a.id, b.id]);
		expect(store.deleteSelection()).toBe(true);
		expect(store.clusters.some((cluster) => cluster.id === clusterId)).toBe(false);
	});

	it('rolls invalid mutations back atomically without history', () => {
		const store = createFixtureEditorStore();
		const before = JSON.stringify(store.document);
		expect(store.beginDocumentTransaction()).toBe(true);
		const source = store.document.entities[0]!;
		if (source.kind !== 'model') throw new Error('expected model entity');
		store.document.entities.push({
			...source,
			id: 'invalid-placement',
			fallback: 'invalid' as never
		});
		expect(store.commitDocumentTransaction()).toBe(false);
		expect(JSON.stringify(store.document)).toBe(before);
		expect(store.canUndo).toBe(false);
	});

	it('replaces and cancels delayed frame requests on selection changes', () => {
		const store = createFixtureEditorStore();
		store.selectionActions.selectRoom('paris');
		const [a, b] = store.document.entities;
		store.selectionActions.selectPlacement(a.id);
		expect(store.requestPlacementFrame([a.id])).toBe(true);
		store.requestPlacementFrame([b.id]);
		expect(store.pendingFramePlacementIds).toEqual([b.id]);
		store.selectionActions.selectPlacement(a.id);
		expect(store.pendingFramePlacementIds).toEqual([]);
	});
});

describe('EditorStore Phase 4.3 primitive creation', () => {
	it('arms primitive placement for any room floor and clears asset pending', () => {
		const store = createFixtureEditorStore();
		expect(store.beginAssetPlacement('paris-salon-chair')).toBe(true);
		expect(store.beginPrimitivePlacement('box')).toBe(true);
		expect(store.pendingPlacementAssetId).toBeNull();
		expect(store.pendingPlacementPrimitiveKind).toBe('box');
		expect(store.statusMessage).toMatch(/floor/i);
	});

	it('creates room-local primitives with defaults and one undo entry', () => {
		const store = createFixtureEditorStore();
		expect(store.beginPrimitivePlacement('cylinder')).toBe(true);
		const id = store.createPendingPrimitiveAt('workshop', [1.25, 0.01, -0.5]);
		expect(id).toBe('cylinder-placement');
		const entity = store.document.entities.find((candidate) => candidate.id === id);
		expect(entity).toMatchObject({
			kind: 'primitive',
			primitive: 'cylinder',
			name: 'Cylinder',
			roomId: 'workshop',
			position: [1.25, 0.01, -0.5],
			rotation: [0, 0, 0],
			dimensions: { radius: 0.5, height: 1 },
			materialId: 'wood-walnut',
			castShadow: true,
			receiveShadow: true
		});
		expect(store.pendingPlacementPrimitiveKind).toBeNull();
		expect(store.primaryPlacementId).toBe(id);
		expect(store.selectedRoomId).toBe('workshop');

		expect(store.undo()).toBe(true);
		expect(store.document.entities.some((candidate) => candidate.id === id)).toBe(false);
		expect(store.redo()).toBe(true);
		expect(store.document.entities.some((candidate) => candidate.id === id)).toBe(true);
	});

	it('preserves yawed-room local coordinates across create', () => {
		const store = createFixtureEditorStore();
		const expectedLocal: [number, number, number] = [1.5, 0.01, -1];
		const world = roomPoint('paris', expectedLocal);
		const local = roomLocalPoint('paris', world);
		store.beginPrimitivePlacement('sphere');
		const id = store.createPendingPrimitiveAt('paris', local)!;
		const documentPosition = store.document.entities.find((entity) => entity.id === id)!
			.position;
		expect(documentPosition[0]).toBeCloseTo(expectedLocal[0], 8);
		expect(documentPosition[2]).toBeCloseTo(expectedLocal[2], 8);
	});

	it('commits name, dimensions, material, and shadows as atomic history entries', () => {
		const store = createFixtureEditorStore();
		store.beginPrimitivePlacement('box');
		const id = store.createPendingPrimitiveAt('paris', [0, 0.01, 0])!;

		expect(store.updatePrimitiveName(id, 'Salon Box')).toBe(true);
		expect(store.document.entities.find((entity) => entity.id === id)?.name).toBe('Salon Box');
		expect(store.updatePrimitiveDimensions(id, { width: 2, height: 0.5, depth: 1.25 })).toBe(
			true
		);
		expect(store.updatePrimitiveMaterial(id, 'marble-light')).toBe(true);
		expect(store.updatePrimitiveShadows(id, { castShadow: false, receiveShadow: true })).toBe(
			true
		);

		const entity = store.document.entities.find((candidate) => candidate.id === id);
		expect(entity).toMatchObject({
			name: 'Salon Box',
			dimensions: { width: 2, height: 0.5, depth: 1.25 },
			materialId: 'marble-light',
			castShadow: false,
			receiveShadow: true
		});

		expect(store.updatePrimitiveDimensions(id, { width: 0, height: 1, depth: 1 })).toBe(false);
		expect(store.document.entities.find((candidate) => candidate.id === id)).toMatchObject({
			dimensions: { width: 2, height: 0.5, depth: 1.25 }
		});

		expect(store.undo()).toBe(true);
		expect(store.document.entities.find((candidate) => candidate.id === id)).toMatchObject({
			castShadow: true
		});
	});

	it('duplicates primitives with offset copies and undo', () => {
		const store = createFixtureEditorStore();
		store.beginPrimitivePlacement('plane');
		const id = store.createPendingPrimitiveAt('paris', [0, 0.01, 0])!;
		store.selectionActions.selectPlacement(id);
		expect(store.duplicateSelection()).toBe(true);
		const copy = store.document.entities.find((entity) => entity.id === `${id}-copy`);
		expect(copy).toMatchObject({
			kind: 'primitive',
			primitive: 'plane',
			position: [0.5, 0.01, 0.5]
		});
		expect(store.undo()).toBe(true);
		expect(store.document.entities.some((entity) => entity.id === `${id}-copy`)).toBe(false);
	});

	it('cancels primitive placement on escape path and nav select', () => {
		const store = createFixtureEditorStore();
		expect(store.beginPrimitivePlacement('box')).toBe(true);
		expect(store.cancelPrimitivePlacement('Placement cancelled')).toBe(true);
		expect(store.pendingPlacementPrimitiveKind).toBeNull();
		expect(store.statusMessage).toBe('Placement cancelled');

		store.beginPrimitivePlacement('sphere');
		store.beginAssetPlacement('paris-salon-chair');
		expect(store.pendingPlacementPrimitiveKind).toBeNull();
		expect(store.pendingPlacementAssetId).toBe('paris-salon-chair');
	});
});

describe('EditorStore Phase 4.4 light creation', () => {
	it('arms light placement and clears other pending modes', () => {
		const store = createFixtureEditorStore();
		expect(store.beginAssetPlacement('paris-salon-chair')).toBe(true);
		expect(store.beginLightPlacement('point')).toBe(true);
		expect(store.pendingPlacementAssetId).toBeNull();
		expect(store.pendingPlacementPrimitiveKind).toBeNull();
		expect(store.pendingPlacementLightKind).toBe('point');
		expect(store.statusMessage).toMatch(/floor/i);

		expect(store.beginPrimitivePlacement('box')).toBe(true);
		expect(store.pendingPlacementLightKind).toBeNull();
		expect(store.pendingPlacementPrimitiveKind).toBe('box');
	});

	it('creates room-local lights with defaults and one undo entry', () => {
		const store = createFixtureEditorStore();
		expect(store.beginLightPlacement('spot')).toBe(true);
		const id = store.createPendingLightAt('workshop', [1.25, 0.01, -0.5]);
		expect(id).toBe('spot-light-placement');
		const entity = store.document.entities.find((candidate) => candidate.id === id);
		expect(entity).toMatchObject({
			kind: 'light',
			light: 'spot',
			name: 'Spot Light',
			roomId: 'workshop',
			position: [1.25, 2.5, -0.5],
			rotation: [0, 0, 0],
			color: '#fff4e0',
			intensity: 1,
			range: 8,
			angle: Math.PI / 6,
			penumbra: 0.15,
			castShadow: false
		});
		expect(store.pendingPlacementLightKind).toBeNull();
		expect(store.primaryPlacementId).toBe(id);
		expect(store.selectedRoomId).toBe('workshop');

		expect(store.undo()).toBe(true);
		expect(store.document.entities.some((candidate) => candidate.id === id)).toBe(false);
		expect(store.redo()).toBe(true);
		expect(store.document.entities.some((candidate) => candidate.id === id)).toBe(true);
	});

	it('preserves yawed-room local XZ across create', () => {
		const store = createFixtureEditorStore();
		const expectedLocal: [number, number, number] = [1.5, 0.01, -1];
		const world = roomPoint('paris', expectedLocal);
		const local = roomLocalPoint('paris', world);
		store.beginLightPlacement('directional');
		const id = store.createPendingLightAt('paris', local)!;
		const documentPosition = store.document.entities.find((entity) => entity.id === id)!
			.position;
		expect(documentPosition[0]).toBeCloseTo(expectedLocal[0], 8);
		expect(documentPosition[1]).toBe(2.5);
		expect(documentPosition[2]).toBeCloseTo(expectedLocal[2], 8);
	});

	it('commits name and light fields as atomic history entries', () => {
		const store = createFixtureEditorStore();
		store.beginLightPlacement('point');
		const id = store.createPendingLightAt('paris', [0, 0.01, 0])!;

		expect(store.updateLightName(id, 'Salon Key')).toBe(true);
		expect(store.updateLightFields(id, { intensity: 2, range: 12, castShadow: true })).toBe(
			true
		);
		expect(store.document.entities.find((entity) => entity.id === id)).toMatchObject({
			name: 'Salon Key',
			intensity: 2,
			range: 12,
			castShadow: true
		});

		expect(store.updateLightFields(id, { range: -1 })).toBe(false);
		expect(store.document.entities.find((candidate) => candidate.id === id)).toMatchObject({
			range: 12
		});

		expect(store.undo()).toBe(true);
		expect(store.document.entities.find((candidate) => candidate.id === id)).toMatchObject({
			intensity: 1,
			range: 8,
			castShadow: false
		});
	});

	it('duplicates lights with offset copies and undo', () => {
		const store = createFixtureEditorStore();
		store.beginLightPlacement('point');
		const id = store.createPendingLightAt('paris', [0, 0.01, 0])!;
		store.selectionActions.selectPlacement(id);
		expect(store.duplicateSelection()).toBe(true);
		const copy = store.document.entities.find((entity) => entity.id === `${id}-copy`);
		expect(copy).toMatchObject({
			kind: 'light',
			light: 'point',
			position: [0.5, 2.5, 0.5]
		});
		expect(store.undo()).toBe(true);
		expect(store.document.entities.some((entity) => entity.id === `${id}-copy`)).toBe(false);
	});

	it('cancels light placement on escape path and mutual clear', () => {
		const store = createFixtureEditorStore();
		expect(store.beginLightPlacement('directional')).toBe(true);
		expect(store.cancelLightPlacement('Placement cancelled')).toBe(true);
		expect(store.pendingPlacementLightKind).toBeNull();
		expect(store.statusMessage).toBe('Placement cancelled');

		store.beginLightPlacement('spot');
		store.beginAssetPlacement('paris-salon-chair');
		expect(store.pendingPlacementLightKind).toBeNull();
		expect(store.pendingPlacementAssetId).toBe('paris-salon-chair');
	});
});


describe('EditorStore placement settings', () => {
	it('defaults snap and keep-on-floor settings outside document history', () => {
		const store = createFixtureEditorStore();
		expect(store.translationSnapEnabled).toBe(false);
		expect(store.translationSnap).toBe(0.1);
		expect(store.rotationSnapEnabled).toBe(false);
		expect(store.rotationSnapDegrees).toBe(15);
		expect(store.scaleSnapEnabled).toBe(false);
		expect(store.scaleSnap).toBe(0.1);
		expect(store.keepOnFloor).toBe(false);

		const id = store.document.entities[0]!.id;
		store.selectionActions.selectRoom('paris');
		store.translationSnapEnabled = false;
		store.rotationSnapDegrees = 45;
		store.keepOnFloor = true;

		const transform = placementTransformFromDocument(store.document.entities[0]!);
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
		const store = createFixtureEditorStore();
		const id = store.document.entities[0]!.id;
		const originalY = store.document.entities[0]!.position[1];
		store.selectionActions.selectRoom('paris');
		store.selectionActions.selectPlacement(id);

		const transform = placementTransformFromDocument(store.document.entities[0]!);
		transform.position[1] = originalY + 1.5;
		expect(store.commitPlacementTransform(id, transform)).toBe(true);
		expect(store.document.entities[0]!.position[1]).toBeCloseTo(originalY + 1.5);

		expect(store.undo()).toBe(true);
		expect(store.document.entities[0]!.position[1]).toBeCloseTo(originalY);

		expect(store.redo()).toBe(true);
		expect(store.document.entities[0]!.position[1]).toBeCloseTo(originalY + 1.5);
	});

	it('bumps drop requests only when a placement is selected', () => {
		const store = createFixtureEditorStore();
		expect(store.dropToFloorRequestId).toBe(0);

		store.requestDropToFloor();
		expect(store.dropToFloorRequestId).toBe(0);
		expect(store.statusMessage).toBe('Select a placement to drop to floor');

		const id = store.document.entities[0]!.id;
		store.selectionActions.selectRoom('paris');
		store.selectionActions.selectPlacement(id);
		store.requestDropToFloor();
		expect(store.dropToFloorRequestId).toBe(1);
	});
});

