import { describe, expect, it } from 'vitest';
import { Object3D } from 'three';
import { cloneFixtureDocument } from '$lib/content/__fixtures__/load-fixture-scene';
import { museumSceneDocument, type MuseumSceneDocument } from '$lib/content/scene';
import { serializeSceneDocument } from '$lib/content/scene-codec';
import { placementTransformFromDocument } from './editor-transform';
import {
	cloneMuseumSceneDocument,
	EDITOR_BRIGHT_LIGHTING,
	EDITOR_VISITOR_LIGHTING,
	MuseumEditorStore,
	type EditorCameraPreview
} from './museum-editor.svelte';
import { createFixtureEditorStore } from './editor-test-utils';

describe('MuseumEditorStore selection', () => {
	it('finishes anchor editing without mutating history or the document', () => {
		const store = createFixtureEditorStore();
		const connection = store.document.connections.find(
			(candidate) => candidate.positionPath.anchors.length > 0
		)!;
		const anchor = connection.positionPath.anchors[0]!;
		const before = serializeSceneDocument(store.document);

		expect(store.selectionActions.selectAnchor(connection.id, anchor.id)).toBe(true);
		expect(store.finishAnchorEditing()).toBe(true);
		expect(store.navigationSelection).toEqual({ kind: 'connection', connectionId: connection.id });
		expect(serializeSceneDocument(store.document)).toBe(before);
		expect(store.canUndo).toBe(false);
	});

	it('keeps calibration grid session-only', () => {
		const store = createFixtureEditorStore();
		const before = store.canonicalJson;

		expect(store.gridVisible).toBe(false);
		expect(store.toggleGrid()).toBe(true);
		expect(store.gridVisible).toBe(true);
		expect(store.canonicalJson).toBe(before);
		expect(store.isDirty).toBe(false);
		expect(store.canUndo).toBe(false);
	});

	it('selects document ids and adopts their room without a registered root', () => {
		const store = createFixtureEditorStore();
		const id = store.document.entities[0]!.id;

		expect(store.selectedRoomId).toBeNull();
		store.selectionActions.selectPlacement(id);

		expect(store.selectedRoomId).toBe('paris');
		expect(store.selectedPlacementId).toBe(id);
		expect(store.getPlacementRoot(id)).toBeUndefined();
		expect(store.selectedObject?.id).toBe(id);
	});

	it('selects and frames a placement from the tree without room preselection', () => {
		const store = createFixtureEditorStore();
		const placement = store.document.entities.find((object) => object.roomId === 'paris')!;
		store.toggleRoomTreeExpansion('paris');
		store.selectionActions.selectNavigationNode('tour-b');
		const beforeFocus = store.cameraFocusVersion;
		const beforeHistory = store.historyVersion;
		const beforeJson = store.canonicalJson;

		expect(store.selectedRoomId).toBeNull();
		expect(store.treeExpandedRoomIds).not.toContain('paris');
		expect(store.selectionActions.selectPlacementFromTree(placement.id)).toBe(true);

		expect(store.selectedRoomId).toBe('paris');
		expect(store.treeExpandedRoomIds).toContain('paris');
		expect(store.selectedPlacementIds).toEqual([placement.id]);
		expect(store.selectedClusterId).toBeNull();
		expect(store.navigationSelection).toBeNull();
		expect(store.cameraFocusVersion).toBe(beforeFocus + 1);
		expect(store.cameraFocusKind).toBe('placement');
		expect(store.cameraFocusPlacementId).toBe(placement.id);
		expect(store.historyVersion).toBe(beforeHistory);
		expect(store.canonicalJson).toBe(beforeJson);
		expect(store.isDirty).toBe(false);
		expect(store.canUndo).toBe(false);
	});

	it('shift-selects the first tree placement in order without requesting focus', () => {
		const store = createFixtureEditorStore();
		const [first, second] = store.document.entities.filter((object) => object.roomId === 'paris');
		store.toggleRoomTreeExpansion('paris');
		store.selectionActions.selectNavigationNode('tour-b');
		store.consumeCameraFocus(store.cameraFocusVersion);
		const beforeFocus = store.cameraFocusVersion;
		const beforeHistory = store.historyVersion;
		const beforeJson = store.canonicalJson;

		expect(store.selectionActions.selectPlacementFromTree(first.id, { additive: true })).toBe(true);
		expect(store.selectedRoomId).toBe('paris');
		expect(store.treeExpandedRoomIds).toContain('paris');
		expect(store.selectedPlacementIds).toEqual([first.id]);
		expect(store.navigationSelection).toBeNull();
		expect(store.cameraFocusVersion).toBe(beforeFocus);
		expect(store.cameraFocusKind).toBeNull();

		expect(store.selectionActions.selectPlacementFromTree(second.id, { additive: true })).toBe(true);
		expect(store.selectedPlacementIds).toEqual([first.id, second.id]);
		expect(store.cameraFocusVersion).toBe(beforeFocus);
		expect(store.historyVersion).toBe(beforeHistory);
		expect(store.canonicalJson).toBe(beforeJson);
		expect(store.isDirty).toBe(false);
	});

	it('ignores unknown ids without clearing the current selection', () => {
		const store = createFixtureEditorStore();
		const id = store.document.entities[0]!.id;
		store.selectionActions.selectRoom('paris');
		store.selectionActions.selectPlacement(id);

		store.selectionActions.selectPlacement('not-a-real-placement');

		expect(store.selectedPlacementId).toBe(id);
	});

	it('deselects the current placement', () => {
		const store = createFixtureEditorStore();
		store.selectionActions.selectRoom('paris');
		store.selectionActions.selectPlacement(store.document.entities[0]!.id);
		store.selectionActions.deselect();
		expect(store.selectedPlacementId).toBeNull();
		expect(store.selectedRoomId).toBe('paris');
	});

	it('cycles with empty / absent / wrap rules', () => {
		const store = createFixtureEditorStore(3);
		const a = store.document.entities[0]!.id;
		const b = store.document.entities[1]!.id;
		const c = store.document.entities[2]!.id;

		store.cyclePlacement([]);
		expect(store.selectedPlacementId).toBeNull();

		store.selectionActions.selectRoom('paris');
		store.selectionActions.selectPlacement(a);
		store.cyclePlacement([b, c]);
		expect(store.selectedPlacementId).toBe(b);

		store.cyclePlacement([b, c]);
		expect(store.selectedPlacementId).toBe(c);

		store.cyclePlacement([b, c]);
		expect(store.selectedPlacementId).toBe(b);
	});

	it('resets a newly selected placement to rotate but preserves the current mode on reselect', () => {
		const store = createFixtureEditorStore();
		const a = store.document.entities[0]!.id;
		const b = store.document.entities[1]!.id;
		store.selectionActions.selectRoom('paris');

		store.selectionActions.selectPlacement(a);
		store.transformMode = 'translate';
		store.selectionActions.selectPlacement(a);
		expect(store.transformMode).toBe('translate');

		store.selectionActions.selectPlacement(b);
		expect(store.selectedPlacementId).toBe(b);
		expect(store.selectedObject?.id).toBe(b);
		expect(store.transformMode).toBe('rotate');
	});

	it('toggles middle-button camera panning independently of room selection', () => {
		const store = createFixtureEditorStore();
		expect(store.cameraPanEnabled).toBe(true);
		store.toggleCameraPan();
		expect(store.cameraPanEnabled).toBe(false);
		expect(store.selectedRoomId).toBeNull();
	});

	it('bumps registryVersion on register and unregister', () => {
		const store = createFixtureEditorStore();
		const id = store.document.entities[0]!.id;
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

	it('selects and registers primitive/light entities with the same placement root API', () => {
		const store = createFixtureEditorStore();
		store.selectionActions.selectRoom('paris');

		const primitiveId = 'phase-4-2-box';
		const lightId = 'phase-4-2-point';
		expect(store.beginDocumentTransaction()).toBe(true);
		store.document.entities.push(
			{
				kind: 'primitive',
				id: primitiveId,
				name: 'Phase 4.2 Box',
				roomId: 'paris',
				position: [0.5, 0.5, -0.5],
				rotation: [0, 0, 0],
				primitive: 'sphere',
				dimensions: { radius: 0.4 },
				materialId: 'wood-walnut',
				castShadow: false,
				receiveShadow: true
			},
			{
				kind: 'light',
				id: lightId,
				name: 'Phase 4.2 Point',
				roomId: 'paris',
				position: [0, 2.2, 0],
				rotation: [0, 0, 0],
				light: 'point',
				color: '#ffd9a0',
				intensity: 1,
				castShadow: false
			}
		);
		expect(store.commitDocumentTransaction()).toBe(true);

		expect(store.scene.entities.some((entity) => entity.id === primitiveId)).toBe(true);
		expect(store.scene.entities.some((entity) => entity.id === lightId)).toBe(true);
		expect(store.scene.objects.some((object) => object.id === primitiveId)).toBe(false);

		const primitiveRoot = new Object3D();
		const lightRoot = new Object3D();
		store.registerPlacementRoot(primitiveId, primitiveRoot);
		store.registerPlacementRoot(lightId, lightRoot);

		expect(store.selectionActions.selectPlacement(primitiveId)).toBe(true);
		expect(store.selectedObject?.kind).toBe('primitive');
		expect(store.getPlacementRoot(primitiveId)).toBe(primitiveRoot);
		expect(store.getPlacementRoots()).toEqual([primitiveRoot]);

		expect(store.selectionActions.selectPlacement(lightId)).toBe(true);
		expect(store.selectedObject?.kind).toBe('light');
		expect(store.getPlacementRoots()).toEqual([lightRoot]);
	});

	it('keeps ordered multi-selection as the only mutable selection source', () => {
		const store = createFixtureEditorStore(3);
		const [a, b, c] = store.document.entities;
		store.selectionActions.selectRoom('paris');
		store.selectionActions.selectPlacement(a.id);
		store.selectionActions.togglePlacement(b.id);
		store.selectionActions.togglePlacement(c.id);
		expect(store.selectedPlacementIds).toEqual([a.id, b.id, c.id]);
		expect(store.primaryPlacementId).toBe(c.id);

		store.selectionActions.togglePlacement(b.id);
		expect(store.selectedPlacementIds).toEqual([a.id, c.id]);
		store.selectionActions.selectPlacement(b.id);
		expect(store.selectedPlacementIds).toEqual([b.id]);
	});
});

describe('MuseumEditorStore clusters', () => {
	it('selects, reveals, and frames a cluster from the tree without room preselection', () => {
		const store = createFixtureEditorStore();
		const [first, second] = store.document.entities.filter((object) => object.roomId === 'paris');
		store.selectionActions.selectRoom('paris');
		store.selectionActions.selectPlacements([first.id, second.id]);
		const clusterId = store.createCluster('Tree cluster')!;
		const beforeJson = store.canonicalJson;
		const beforeHistory = store.historyVersion;
		const beforeDirty = store.isDirty;

		store.selectionActions.selectNavigationNode('tour-b');
		expect(store.selectedClusterId).toBeNull();
		expect(store.selectedPlacementIds).toEqual([]);
		store.consumeCameraFocus(store.cameraFocusVersion);
		store.selectedRoomId = null;
		store.toggleRoomTreeExpansion('paris');
		const beforeFocus = store.cameraFocusVersion;

		expect(store.selectionActions.selectClusterFromTree(clusterId)).toBe(true);
		expect(store.selectedRoomId).toBe('paris');
		expect(store.treeExpandedRoomIds).toContain('paris');
		expect(store.treeExpandedClusterIds).toContain(clusterId);
		expect(store.selectedClusterId).toBe(clusterId);
		expect(store.selectedPlacementIds).toEqual([first.id, second.id]);
		expect(store.navigationSelection).toBeNull();
		expect(store.cameraFocusVersion).toBe(beforeFocus + 1);
		expect(store.cameraFocusKind).toBe('selection');
		expect(store.historyVersion).toBe(beforeHistory);
		expect(store.canonicalJson).toBe(beforeJson);
		expect(store.isDirty).toBe(beforeDirty);
	});

	it('creates, selects, renames, and ungroups through document history', () => {
		const store = createFixtureEditorStore();
		const [a, b] = store.document.entities;
		store.selectionActions.selectRoom('paris');
		store.selectionActions.selectPlacements([a.id, b.id]);
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
		const store = createFixtureEditorStore();
		const [a, b] = store.document.entities;
		store.selectionActions.selectRoom('paris');
		store.selectionActions.selectPlacements([a.id, b.id]);
		const clusterId = store.createCluster('Piano grouping')!;

		expect(store.renameCluster(clusterId, '   ')).toBe(false);
		expect(store.renameCluster(clusterId, 'Piano grouping')).toBe(false);
		expect(store.clusters[0]?.name).toBe('Piano grouping');

		// The only history entry is cluster creation; invalid/no-op renames add none.
		expect(store.undo()).toBe(true);
		expect(store.clusters).toHaveLength(0);
	});

	it('clears cluster identity when a member is toggled and reconciles deleted clusters on undo', () => {
		const store = createFixtureEditorStore();
		const [a, b] = store.document.entities;
		store.selectionActions.selectRoom('paris');
		store.selectionActions.selectPlacements([a.id, b.id]);
		const clusterId = store.createCluster()!;
		store.selectionActions.togglePlacement(a.id);
		expect(store.selectedClusterId).toBeNull();
		expect(store.selectedPlacementIds).toEqual([b.id]);

		store.selectionActions.selectCluster(clusterId);
		expect(store.undo()).toBe(true);
		expect(store.clusters).toHaveLength(0);
		expect(store.selectedClusterId).toBeNull();
		expect(store.selectedPlacementIds).toEqual([]);
	});

	it('adds and removes members with one-cluster ownership and auto-ungroup rules', () => {
		const store = createFixtureEditorStore(4);
		const [a, b, c, d] = store.document.entities;
		store.selectionActions.selectRoom('paris');
		store.selectionActions.selectPlacements([a.id, b.id]);
		const firstCluster = store.createCluster()!;
		expect(store.addMemberToCluster(firstCluster, c.id)).toBe(true);
		expect(store.clusters[0]?.memberIds).toEqual([a.id, b.id, c.id]);

		store.selectionActions.selectPlacements([c.id, d.id]);
		expect(store.createCluster()).toBeNull();
		expect(store.clusters).toHaveLength(1);

		expect(store.removeMemberFromCluster(firstCluster, c.id)).toBe(true);
		expect(store.removeMemberFromCluster(firstCluster, b.id)).toBe(true);
		expect(store.clusters).toHaveLength(0);
	});

	it('auto-ungroups when deletion leaves one member and restores everything on undo', () => {
		const store = createFixtureEditorStore();
		const [a, b] = store.document.entities;
		store.selectionActions.selectRoom('paris');
		store.selectionActions.selectPlacements([a.id, b.id]);
		store.createCluster();
		expect(store.deletePlacement(a.id)).toBe(true);
		expect(store.document.entities.some((object) => object.id === a.id)).toBe(false);
		expect(store.clusters).toHaveLength(0);

		expect(store.undo()).toBe(true);
		expect(store.document.entities.some((object) => object.id === a.id)).toBe(true);
		expect(store.clusters[0]?.memberIds).toEqual([a.id, b.id]);
	});

	it('restores cluster membership and transforms together from one snapshot', () => {
		const store = createFixtureEditorStore();
		const [a, b] = store.document.entities;
		const originalX = a.position[0];
		store.selectionActions.selectRoom('paris');
		store.selectionActions.selectPlacements([a.id, b.id]);
		expect(store.beginDocumentTransaction()).toBe(true);
		(store.document.clusters ??= []).push({
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
		expect(store.document.entities.find((object) => object.id === a.id)?.position[0]).toBe(originalX);
	});
});

