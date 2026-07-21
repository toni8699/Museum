import { describe, expect, it } from 'vitest';
import {
	assertNavigationGraphMatchesScene,
	museumSceneDocument,
	type MuseumSceneDocument
} from '$lib/content/scene';
import { getRoom, roomLocalPoint, roomPoint } from '$lib/content/rooms';
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
import { serializeSceneDocument } from '$lib/content/scene-codec';
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

	it('tracks canonical baselines across edits, imports, undo, and reset', () => {
		const store = createMuseumEditorStore();
		expect(store.isDirty).toBe(false);
		store.selectRoom('paris');
		const placement = store.document.objects[0]!;
		expect(
			store.commitPlacementTransform(placement.id, {
				position: [placement.position[0] + 1, placement.position[1], placement.position[2]],
				rotation: [...placement.rotation],
				scale: placement.scale ?? 1
			})
		).toBe(true);
		expect(store.isDirty).toBe(true);
		expect(store.undo()).toBe(true);
		expect(store.isDirty).toBe(false);

		const imported = JSON.parse(serializeSceneDocument(museumSceneDocument)) as MuseumSceneDocument;
		imported.objects[0]!.position[0] += 0.25;
		expect(store.importDocument(imported)).toBe(true);
		expect(store.isDirty).toBe(false);
		expect(store.resetToCheckedInDocument()).toBe(true);
		expect(store.document.objects[0]!.position).toEqual(museumSceneDocument.objects[0]!.position);
		expect(store.isDirty).toBe(false);
	});

	it('rejects invalid imports without changing the current scene or baseline', () => {
		const store = createMuseumEditorStore();
		const before = serializeSceneDocument(store.document);
		const invalid = cloneMuseumSceneDocument(museumSceneDocument);
		invalid.navigationNodes[0]!.cameraTarget = [...invalid.navigationNodes[0]!.position];

		expect(store.importDocument(invalid)).toBe(false);
		expect(serializeSceneDocument(store.document)).toBe(before);
		expect(store.isDirty).toBe(false);
		expect(store.canExport).toBe(true);
	});

	it('preserves authored v3 view data through import, history, and canonical export', () => {
		const store = createMuseumEditorStore();
		const imported = cloneMuseumSceneDocument(museumSceneDocument);
		imported.navigationNodes[0]!.fov = 47;
		imported.connections[0]!.viewTracks = {
			forward: [
				{
					id: 'entrance-poland-view-forward-01',
					progress: 0.35,
					roomId: 'entrance',
					cameraTarget: [1, 1.4, -2],
					fov: 48
				}
			],
			reverse: [
				{
					id: 'entrance-poland-view-reverse-01',
					progress: 0.65,
					cameraTarget: [100, 2, 100],
					fov: 64
				}
			]
		};

		expect(store.importDocument(imported)).toBe(true);
		expect(store.isDirty).toBe(false);
		expect(store.canonicalJson).toContain('"fov": 47');
		expect(store.canonicalJson).toContain('"entrance-poland-view-forward-01"');
		expect(store.canonicalJson).toContain('"entrance-poland-view-reverse-01"');

		const connectionId = imported.connections[0]!.id;
		store.selectConnection(connectionId);
		expect(store.previewSelectedConnection('forward')).toBe(true);
		const runId = store.cameraPreview!.runId;
		const captured = store.getCapturedCameraPreviewRoute(runId)!;
		const capturedJson = JSON.stringify(captured);
		const capturedKeyframe = captured.edges[0]!.viewTrack!.keyframes[0]!;
		(capturedKeyframe.cameraTarget as [number, number, number])[0] += 100;
		capturedKeyframe.fov = 99;
		(captured.edges[0]!.automaticTargetPoints![0] as [number, number, number])[0] += 100;
		store.scene.connections[0]!.viewTracks!.forward[0]!.cameraTarget[0] += 200;
		expect(JSON.stringify(store.getCapturedCameraPreviewRoute(runId))).toBe(
			capturedJson
		);
		expect(store.stopCameraPreview()).toBe(true);

		expect(store.beginDocumentTransaction()).toBe(true);
		store.document.connections[0]!.viewTracks!.forward[0]!.fov = 49;
		expect(store.commitDocumentTransaction()).toBe(true);
		expect(store.undo()).toBe(true);
		expect(store.document.connections[0]!.viewTracks?.forward[0]?.fov).toBe(48);
		expect(store.redo()).toBe(true);
		expect(store.document.connections[0]!.viewTracks?.forward[0]?.fov).toBe(49);

		store.toggleGrid();
		const exported = store.canonicalJson!;
		expect(exported).not.toContain('gridVisible');
		expect(exported).not.toContain('cameraPreview');
		expect(exported).not.toContain('baselineCanonicalJson');
	});
});

describe('MuseumEditorStore selection', () => {
	it('finishes anchor editing without mutating history or the document', () => {
		const store = createMuseumEditorStore();
		const connection = store.document.connections.find(
			(candidate) => candidate.positionPath.anchors.length > 0
		)!;
		const anchor = connection.positionPath.anchors[0]!;
		const before = serializeSceneDocument(store.document);

		expect(store.selectAnchor(connection.id, anchor.id)).toBe(true);
		expect(store.finishAnchorEditing()).toBe(true);
		expect(store.navigationSelection).toEqual({ kind: 'connection', connectionId: connection.id });
		expect(serializeSceneDocument(store.document)).toBe(before);
		expect(store.canUndo).toBe(false);
	});

	it('keeps calibration grid session-only', () => {
		const store = createMuseumEditorStore();
		const before = store.canonicalJson;

		expect(store.gridVisible).toBe(false);
		expect(store.toggleGrid()).toBe(true);
		expect(store.gridVisible).toBe(true);
		expect(store.canonicalJson).toBe(before);
		expect(store.isDirty).toBe(false);
		expect(store.canUndo).toBe(false);
	});

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

	it('selects and frames a placement from the tree without room preselection', () => {
		const store = createMuseumEditorStore();
		const placement = store.document.objects.find((object) => object.roomId === 'paris')!;
		store.toggleRoomTreeExpansion('paris');
		store.selectNavigationNode('departure-corridor');
		const beforeFocus = store.cameraFocusVersion;
		const beforeHistory = store.historyVersion;
		const beforeJson = store.canonicalJson;

		expect(store.selectedRoomId).toBeNull();
		expect(store.treeExpandedRoomIds).not.toContain('paris');
		expect(store.selectPlacementFromTree(placement.id)).toBe(true);

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
		const store = createMuseumEditorStore();
		const [first, second] = store.document.objects.filter((object) => object.roomId === 'paris');
		store.toggleRoomTreeExpansion('paris');
		store.selectNavigationNode('departure-corridor');
		store.consumeCameraFocus(store.cameraFocusVersion);
		const beforeFocus = store.cameraFocusVersion;
		const beforeHistory = store.historyVersion;
		const beforeJson = store.canonicalJson;

		expect(store.selectPlacementFromTree(first.id, { additive: true })).toBe(true);
		expect(store.selectedRoomId).toBe('paris');
		expect(store.treeExpandedRoomIds).toContain('paris');
		expect(store.selectedPlacementIds).toEqual([first.id]);
		expect(store.navigationSelection).toBeNull();
		expect(store.cameraFocusVersion).toBe(beforeFocus);
		expect(store.cameraFocusKind).toBeNull();

		expect(store.selectPlacementFromTree(second.id, { additive: true })).toBe(true);
		expect(store.selectedPlacementIds).toEqual([first.id, second.id]);
		expect(store.cameraFocusVersion).toBe(beforeFocus);
		expect(store.historyVersion).toBe(beforeHistory);
		expect(store.canonicalJson).toBe(beforeJson);
		expect(store.isDirty).toBe(false);
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
	it('selects, reveals, and frames a cluster from the tree without room preselection', () => {
		const store = createMuseumEditorStore();
		const [first, second] = store.document.objects.filter((object) => object.roomId === 'paris');
		store.selectRoom('paris');
		store.selectPlacements([first.id, second.id]);
		const clusterId = store.createCluster('Tree cluster')!;
		const beforeJson = store.canonicalJson;
		const beforeHistory = store.historyVersion;
		const beforeDirty = store.isDirty;

		store.selectNavigationNode('departure-corridor');
		expect(store.selectedClusterId).toBeNull();
		expect(store.selectedPlacementIds).toEqual([]);
		store.consumeCameraFocus(store.cameraFocusVersion);
		store.selectedRoomId = null;
		store.toggleRoomTreeExpansion('paris');
		const beforeFocus = store.cameraFocusVersion;

		expect(store.selectClusterFromTree(clusterId)).toBe(true);
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
		expect(store.document.objects.find((object) => object.id === a.id)?.position[0]).toBe(originalX);
	});
});

describe('MuseumEditorStore Phase 5 placement commands', () => {
	it('replaces pending floor assets, rejects unsupported surfaces, and cancels stale assets', () => {
		const store = createMuseumEditorStore();
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
		expect(store.createPendingPlacementAt([0, 0, 0])).toBeNull();
		expect(store.pendingPlacementAssetId).toBeNull();
	});

	it('creates explicit scene fields with reserved IDs and one undo entry', () => {
		const store = createMuseumEditorStore();
		store.selectRoom('paris');
		const focusVersion = store.cameraFocusVersion;
		expect(store.beginAssetPlacement('paris-salon-chair')).toBe(true);
		const firstId = store.createPendingPlacementAt([1, 0.01, 2]);
		expect(firstId).toBe('paris-salon-chair-placement');
		const first = store.document.objects.find((object) => object.id === firstId);
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
		expect(store.document.objects.some((object) => object.id === firstId)).toBe(false);
		expect(store.pendingFramePlacementIds).toEqual([]);

		expect(store.redo()).toBe(true);
		store.beginAssetPlacement('paris-salon-chair');
		expect(store.createPendingPlacementAt([2, 0.01, 3])).toBe('paris-salon-chair-placement-2');
	});

	it('preserves Paris local coordinates across its authored yaw and scene rebuild', () => {
		const store = createMuseumEditorStore();
		const expectedLocal: [number, number, number] = [2.25, 0.01, -1.75];
		const world = roomPoint('paris', expectedLocal);
		const local = roomLocalPoint('paris', world);
		store.beginAssetPlacement('paris-salon-table');
		const id = store.createPendingPlacementAt(local)!;
		const documentPosition = store.document.objects.find((object) => object.id === id)!.position;
		const runtimePosition = store.scene.objects.find((object) => object.id === id)!.position;
		expect(documentPosition[0]).toBeCloseTo(expectedLocal[0], 8);
		expect(documentPosition[2]).toBeCloseTo(expectedLocal[2], 8);
		expect(runtimePosition).toEqual(documentPosition);
	});

	it('duplicates selected sources with batch-safe IDs and preserves the first copy as primary', () => {
		const store = createMuseumEditorStore();
		store.selectRoom('paris');
		const [first, second] = store.document.objects.filter(
			(object) => object.assetId === 'paris-salon-chair'
		);
		store.selectPlacements([first.id, second.id]);
		const originalCount = store.objectCount;
		expect(store.duplicateSelection()).toBe(true);
		const copyIds = store.document.objects.slice(originalCount).map((object) => object.id);
		expect(new Set(copyIds).size).toBe(2);
		expect(copyIds).toEqual([`${second.id}-copy`, `${first.id}-copy`]);
		expect(store.primaryPlacementId).toBe(copyIds[0]);
		for (const copy of store.document.objects.slice(originalCount)) {
			const sourceId = [...store.document.objects]
				.filter((object) => !copyIds.includes(object.id))
				.find((object) => `${object.id}-copy` === copy.id)?.id;
			expect(sourceId).toBeTruthy();
		}
	});

	it('recreates complete flat clusters with collision-safe cluster IDs', () => {
		const store = createMuseumEditorStore();
		const [a, b, c, d] = store.document.objects;
		store.selectRoom('paris');
		store.selectPlacements([a.id, b.id]);
		const sourceClusterId = store.createCluster('Salon pair')!;
		store.selectPlacements([c.id, d.id]);
		const occupiedClusterId = store.createCluster('Occupied')!;
		expect(store.beginDocumentTransaction()).toBe(true);
		store.clusters.find((cluster) => cluster.id === occupiedClusterId)!.id = `${sourceClusterId}-copy`;
		expect(store.commitDocumentTransaction()).toBe(true);

		store.selectCluster(sourceClusterId);
		expect(store.duplicateSelection()).toBe(true);
		const copiedCluster = store.clusters.find(
			(cluster) => cluster.id === `${sourceClusterId}-copy-2`
		);
		expect(copiedCluster).toMatchObject({ name: 'Salon pair Copy', roomId: 'paris' });
		expect(copiedCluster?.memberIds).toHaveLength(2);
		expect(copiedCluster?.memberIds.every((id) => id.includes('-copy'))).toBe(true);
	});

	it('does not reconstruct a partially selected source cluster', () => {
		const store = createMuseumEditorStore();
		const [a, b] = store.document.objects;
		store.selectRoom('paris');
		store.selectPlacements([a.id, b.id]);
		store.createCluster('Pair');
		const beforeClusters = store.clusters.length;
		store.selectPlacement(a.id);
		expect(store.duplicateSelection()).toBe(true);
		expect(store.clusters).toHaveLength(beforeClusters);
	});

	it('deletes cluster members with stable cleanup rules and undo restoration', () => {
		const store = createMuseumEditorStore();
		const [a, b, c] = store.document.objects;
		store.selectRoom('paris');
		store.selectPlacements([a.id, b.id, c.id]);
		const clusterId = store.createCluster('Trio')!;

		store.selectPlacement(a.id);
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

		store.selectPlacement(a.id);
		store.selectPlacements([a.id, b.id]);
		expect(store.deleteSelection()).toBe(true);
		expect(store.clusters.some((cluster) => cluster.id === clusterId)).toBe(false);
	});

	it('rolls invalid mutations back atomically without history', () => {
		const store = createMuseumEditorStore();
		const before = JSON.stringify(store.document);
		expect(store.beginDocumentTransaction()).toBe(true);
		store.document.objects.push({
			...store.document.objects[0]!,
			id: 'invalid-placement',
			fallback: 'invalid' as never
		});
		expect(store.commitDocumentTransaction()).toBe(false);
		expect(JSON.stringify(store.document)).toBe(before);
		expect(store.canUndo).toBe(false);
	});

	it('replaces and cancels delayed frame requests on selection changes', () => {
		const store = createMuseumEditorStore();
		store.selectRoom('paris');
		const [a, b] = store.document.objects;
		store.selectPlacement(a.id);
		expect(store.requestPlacementFrame([a.id])).toBe(true);
		store.requestPlacementFrame([b.id]);
		expect(store.pendingFramePlacementIds).toEqual([b.id]);
		store.selectPlacement(a.id);
		expect(store.pendingFramePlacementIds).toEqual([]);
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

describe('MuseumEditorStore Phase 6 camera nodes', () => {
	it('uses one camera selection, defaults rows to position, and avoids redundant focus', () => {
		const store = createMuseumEditorStore();
		const nodeId = 'paris-seat';

		expect(store.selectNavigationNode(nodeId)).toBe(true);
		expect(store.cameraSelection).toEqual({ nodeId, handle: 'position' });
		const focusVersion = store.cameraFocusVersion;
		expect(store.selectNavigationNode(nodeId)).toBe(false);
		expect(store.cameraFocusVersion).toBe(focusVersion);
		expect(store.canUndo).toBe(false);

		expect(store.selectCameraHandle('target')).toBe(true);
		expect(store.cameraSelection).toEqual({ nodeId, handle: 'target' });
		expect(store.selectNavigationNode(nodeId)).toBe(true);
		expect(store.cameraSelection).toEqual({ nodeId, handle: 'position' });
		expect(store.cameraFocusVersion).toBe(focusVersion);
	});

	it('never changes workspace in response to placement or camera selection', () => {
		const store = createMuseumEditorStore();
		const placement = store.document.objects.find((object) => object.roomId === 'paris')!;

		expect(store.setWorkspace('camera')).toBe(true);
		expect(store.selectPlacementFromTree(placement.id)).toBe(true);
		expect(store.currentWorkspace).toBe('camera');

		expect(store.setWorkspace('scene')).toBe(true);
		expect(store.selectNavigationNode('paris-seat')).toBe(true);
		expect(store.currentWorkspace).toBe('scene');
	});

	it('clears placement and cluster selection without changing workspace or redundant focus', () => {
		const store = createMuseumEditorStore();
		const [first, second] = store.document.objects.filter((object) => object.roomId === 'paris');
		store.selectRoom('paris');
		store.selectPlacements([first.id, second.id]);
		const clusterId = store.createCluster('Camera handoff')!;
		expect(store.selectedClusterId).toBe(clusterId);
		expect(store.setWorkspace('camera')).toBe(true);
		const beforeHistory = store.historyVersion;

		expect(store.selectNavigationNode('paris-seat')).toBe(true);
		expect(store.currentWorkspace).toBe('camera');
		expect(store.navigationSelection).toEqual({
			kind: 'node',
			nodeId: 'paris-seat',
			handle: 'position'
		});
		expect(store.selectedPlacementIds).toEqual([]);
		expect(store.selectedClusterId).toBeNull();
		const focusVersion = store.cameraFocusVersion;
		expect(store.selectNavigationNode('paris-seat')).toBe(false);
		expect(store.cameraFocusVersion).toBe(focusVersion);
		expect(store.currentWorkspace).toBe('camera');
		expect(store.historyVersion).toBe(beforeHistory);
	});

	it('consumes an applied camera focus request exactly once', () => {
		const store = createMuseumEditorStore();
		store.selectNavigationNode('paris-seat');
		const version = store.cameraFocusVersion;

		expect(store.consumeCameraFocus(version - 1)).toBe(false);
		expect(store.cameraFocusKind).toBe('navigation-node');
		expect(store.consumeCameraFocus(version)).toBe(true);
		expect(store.cameraFocusKind).toBeNull();
		expect(store.cameraFocusNodeId).toBeNull();
		expect(store.consumeCameraFocus(version)).toBe(false);
	});

	it('keeps camera and placement selection mutually exclusive while asset placement is latent', () => {
		const store = createMuseumEditorStore();
		const placementId = store.document.objects[0]!.id;
		store.selectNavigationNode('departure-corridor');
		expect(store.beginAssetPlacement('paris-salon-chair')).toBe(true);
		expect(store.cameraSelection?.nodeId).toBe('departure-corridor');
		expect(store.pendingPlacementAssetId).toBe('paris-salon-chair');

		store.cancelAssetPlacement();
		store.selectPlacement(placementId);
		expect(store.cameraSelection).toBeNull();
		expect(store.selectedPlacementId).toBe(placementId);

		store.selectNavigationNode('paris-seat');
		expect(store.selectedPlacementIds).toEqual([]);
		expect(store.cameraSelection).toEqual({ nodeId: 'paris-seat', handle: 'position' });
	});

	it('registers selected camera helper roots without persisting them', () => {
		const store = createMuseumEditorStore();
		const root = new Object3D();
		const version = store.registryVersion;
		store.registerCameraHelperRoot('paris-seat', 'position', root);
		expect(store.registryVersion).toBe(version + 1);
		expect(store.getCameraHelperRoot('paris-seat', 'position')).toBe(root);

		store.selectNavigationNode('paris-seat');
		expect(store.getSelectedCameraHelperRoot()).toBe(root);
		expect(JSON.stringify(store.document)).not.toContain('camera-handle');

		store.unregisterCameraHelperRoot('paris-seat', 'position', root);
		expect(store.getSelectedCameraHelperRoot()).toBeUndefined();
	});

	it('persists room-local eye edits and derives only incident runtime endpoints', () => {
		const store = createMuseumEditorStore();
		const nodeId = 'paris-seat';
		const originalInteriors = store.document.connections.map((connection) =>
			connection.positionPath.anchors.map((anchor) => ({
				...anchor,
				position: [...anchor.position]
			}))
		);
		const originalPosition = [...store.document.navigationNodes.find(
			(node) => node.id === nodeId
		)!.position] as [number, number, number];
		const nextPosition: [number, number, number] = [
			originalPosition[0] + 0.75,
			originalPosition[1] + 0.1,
			originalPosition[2] - 0.5
		];

		store.selectNavigationNode(nodeId);
		expect(store.commitNavigationNodePoint(nodeId, 'position', nextPosition)).toBe(true);
		expect(store.selectedNavigationNode?.position).toEqual(nextPosition);
		const runtimeNode = store.scene.navigationNodes.find((node) => node.id === nodeId)!;
		expect(runtimeNode.position).toEqual(roomPoint('paris', nextPosition));

		for (const connection of store.scene.connections) {
			if (connection.fromNodeId === nodeId) {
				expect(connection.positionPath.anchors[0]?.position).toEqual(runtimeNode.position);
			}
			if (connection.toNodeId === nodeId) {
				expect(connection.positionPath.anchors.at(-1)?.position).toEqual(runtimeNode.position);
			}
		}
		expect(
			store.document.connections.map((connection) => connection.positionPath.anchors)
		).toEqual(originalInteriors);
		assertNavigationGraphMatchesScene(store.state.graph, store.scene);

		expect(store.undo()).toBe(true);
		expect(store.selectedNavigationNode?.position).toEqual(originalPosition);
		expect(store.redo()).toBe(true);
		expect(store.selectedNavigationNode?.position).toEqual(nextPosition);
	});

	it('updates camera targets without changing any connection position path', () => {
		const store = createMuseumEditorStore();
		const nodeId = 'departure-corridor';
		store.selectNavigationNode(nodeId);
		store.selectCameraHandle('target');
		const beforePaths = store.scene.connections.map((connection) =>
			connection.positionPath.anchors.map((anchor) => [...anchor.position])
		);
		const target = store.selectedNavigationNode!.cameraTarget;
		const nextTarget: [number, number, number] = [
			target[0] - 1,
			target[1] + 0.2,
			target[2] + 0.4
		];

		expect(store.commitNavigationNodePoint(nodeId, 'target', nextTarget)).toBe(true);
		expect(
			store.scene.connections.map((connection) =>
				connection.positionPath.anchors.map((anchor) => anchor.position)
			)
		).toEqual(beforePaths);
		expect(store.selectedRuntimeNavigationNode?.cameraTarget).toEqual(
			roomPoint('departure', nextTarget)
		);
	});

	it('collapses camera drag previews into one history entry and suppresses no movement', () => {
		const store = createMuseumEditorStore();
		const nodeId = 'workshop-desk';
		store.selectNavigationNode(nodeId);
		const original = [...store.selectedNavigationNode!.position] as [number, number, number];

		expect(store.beginDocumentTransaction()).toBe(true);
		expect(
			store.updateNavigationNodePoint(nodeId, 'position', [original[0] + 1, original[1], original[2]])
		).toBe(true);
		expect(
			store.updateNavigationNodePoint(nodeId, 'position', [original[0] + 2, original[1], original[2]])
		).toBe(true);
		expect(store.commitDocumentTransaction()).toBe(true);
		expect(store.undo()).toBe(true);
		expect(store.selectedNavigationNode?.position).toEqual(original);

		expect(store.beginDocumentTransaction()).toBe(true);
		expect(store.updateNavigationNodePoint(nodeId, 'position', original)).toBe(false);
		expect(store.commitDocumentTransaction()).toBe(false);
	});

	it('refuses live camera writes outside a document transaction', () => {
		const store = createMuseumEditorStore();
		const nodeId = 'workshop-desk';
		store.selectNavigationNode(nodeId);
		const documentPosition = [...store.selectedNavigationNode!.position];
		const runtimePosition = [...store.selectedRuntimeNavigationNode!.position];

		expect(store.updateNavigationNodePoint(nodeId, 'position', [99, 98, 97])).toBe(false);
		expect(store.selectedNavigationNode?.position).toEqual(documentPosition);
		expect(store.selectedRuntimeNavigationNode?.position).toEqual(runtimePosition);
		expect(store.canUndo).toBe(false);
	});

	it('creates modal node and transition previews without document history', () => {
		const store = createMuseumEditorStore();
		const placementId = store.document.objects[0]!.id;
		store.selectNavigationNode('paris-seat');
		store.beginAssetPlacement('paris-salon-chair');
		store.requestPlacementFrame([placementId]);

		expect(store.previewSelectedNode()).toBe(true);
		expect(store.cameraPreview).toMatchObject({ kind: 'node', nodeId: 'paris-seat' });
		expect(store.pendingPlacementAssetId).toBeNull();
		expect(store.pendingFramePlacementIds).toEqual([]);
		expect(store.cameraFocusKind).toBeNull();
		expect(store.canUndo).toBe(false);
		expect(store.selectPlacement(placementId)).toBe(false);
		expect(store.beginAssetPlacement('paris-salon-chair')).toBe(false);
		expect(store.requestPlacementFrame([placementId])).toBe(false);
		expect(store.commitNavigationNodePoint('paris-seat', 'position', [0, 1, 0])).toBe(false);
		expect(store.stopCameraPreview()).toBe(true);
		expect(store.cameraSelection?.nodeId).toBe('paris-seat');

		expect(store.previewSelectedTransition()).toBe(true);
		const preview = store.cameraPreview;
		expect(preview).toMatchObject({
			kind: 'transition',
			fromNodeId: 'paris-seat',
			toNodeId: 'workshop-desk',
			startedAtMs: null,
			transport: 'playing'
		});
		const runId = preview!.runId;
		expect(store.completeCameraPreview(runId)).toBe(false);
		expect(store.markCameraPreviewStarted(runId, 1234)).toBe(true);
		expect(store.markCameraPreviewStarted(runId, 5678)).toBe(false);
		expect(store.completeCameraPreview(runId)).toBe(true);
		expect(store.completeCameraPreview(runId)).toBe(false);
		expect(store.stopCameraPreview()).toBe(true);
		expect(store.canUndo).toBe(false);
	});

	it('restores camera ownership before releasing preview modal guards', () => {
		const store = createMuseumEditorStore();
		store.selectNavigationNode('paris-seat');
		expect(store.previewSelectedNode()).toBe(true);

		const events: string[] = [];
		store.setCameraPreviewRestorer(() => {
			expect(store.cameraPreview).not.toBeNull();
			expect(store.selectNavigationNode('workshop-desk')).toBe(false);
			events.push('restore');
			return true;
		});

		expect(store.stopCameraPreview()).toBe(true);
		expect(events).toEqual(['restore']);
		expect(store.cameraPreview).toBeNull();

		expect(store.previewSelectedNode()).toBe(true);
		store.setCameraPreviewRestorer(() => false);
		expect(store.stopCameraPreview()).toBe(false);
		expect(store.cameraPreview).not.toBeNull();
		store.setCameraPreviewRestorer(null);
		expect(store.stopCameraPreview()).toBe(true);
	});

	it('blocks selection changes during a camera drag and cancels it before preview', () => {
		const store = createMuseumEditorStore();
		store.selectNavigationNode('paris-seat');
		expect(store.beginDocumentTransaction()).toBe(true);
		store.setTransformInteractionActive(true, 'camera');
		expect(store.selectCameraHandle('target')).toBe(false);
		expect(store.selectNavigationNode('workshop-desk')).toBe(false);

		let cancelCount = 0;
		store.setCameraTransformCanceler(() => {
			cancelCount += 1;
			store.setTransformInteractionActive(false);
			store.cancelDocumentTransaction();
			return true;
		});

		expect(store.previewSelectedNode()).toBe(true);
		expect(cancelCount).toBe(1);
		expect(store.transformInteractionActive).toBe(false);
		expect(store.isDocumentTransactionActive).toBe(false);
		expect(store.stopCameraPreview()).toBe(true);
	});

	it('guards every document and editor-command category while preview is modal', () => {
		const store = createMuseumEditorStore();
		const placementId = store.document.objects[0]!.id;
		store.selectNavigationNode('paris-seat');
		const position = [...store.selectedNavigationNode!.position] as [number, number, number];
		expect(
			store.commitNavigationNodePoint('paris-seat', 'position', [
				position[0] + 0.1,
				position[1],
				position[2]
			])
		).toBe(true);
		expect(store.undo()).toBe(true);
		expect(store.canRedo).toBe(true);
		expect(store.previewSelectedNode()).toBe(true);

		const documentBefore = JSON.stringify(store.document);
		const dropRequestBefore = store.dropToFloorRequestId;
		const panBefore = store.cameraPanEnabled;
		const ambientBefore = store.ambientIntensity;

		expect(store.canUndo).toBe(false);
		expect(store.canRedo).toBe(false);
		expect(store.undo()).toBe(false);
		expect(store.redo()).toBe(false);
		expect(store.beginDocumentTransaction()).toBe(false);
		expect(store.selectNavigationNode('workshop-desk')).toBe(false);
		expect(store.selectCameraHandle('target')).toBe(false);
		expect(store.selectRoom('paris')).toBe(false);
		expect(store.selectPlacement(placementId)).toBe(false);
		expect(store.selectPlacements([placementId])).toBe(false);
		expect(store.togglePlacement(placementId)).toBe(false);
		expect(store.cyclePlacement([placementId])).toBe(false);
		expect(store.selectAllInRoom()).toBe(false);
		expect(store.deselect()).toBe(false);
		expect(store.focusNavigationNode('paris-seat')).toBe(false);
		expect(store.focusRoom('paris')).toBe(false);
		expect(store.focusPlacement(placementId)).toBe(false);
		expect(store.focusSelection()).toBe(false);
		expect(store.requestPlacementFrame([placementId])).toBe(false);
		expect(store.beginAssetPlacement('paris-salon-chair')).toBe(false);
		expect(store.createPendingPlacementAt([0, 0, 0])).toBeNull();
		expect(store.duplicateSelection()).toBe(false);
		expect(store.deletePlacements([placementId])).toBe(false);
		expect(store.createCluster()).toBeNull();
		expect(store.ungroupCluster(store.clusters[0]?.id ?? null)).toBe(false);
		expect(store.toggleCameraPan()).toBe(false);
		expect(store.applyLightingPreset(EDITOR_VISITOR_LIGHTING)).toBe(false);
		expect(
			store.commitNavigationNodePoint('paris-seat', 'position', [0, 1, 0])
		).toBe(false);
		store.requestDropToFloor();

		expect(store.dropToFloorRequestId).toBe(dropRequestBefore);
		expect(store.cameraPanEnabled).toBe(panBefore);
		expect(store.ambientIntensity).toBe(ambientBefore);
		expect(JSON.stringify(store.document)).toBe(documentBefore);
		expect(store.stopCameraPreview()).toBe(true);
		expect(store.canRedo).toBe(true);
	});

	it('rejects invalid outgoing transitions without entering preview', () => {
		const store = createMuseumEditorStore();
		const nodeId = 'music-entry';
		store.selectNavigationNode(nodeId);
		expect(store.beginDocumentTransaction()).toBe(true);
		store.document.navigationNodes.find((node) => node.id === nodeId)!.nextNodeId = 'missing';
		expect(store.commitDocumentTransaction()).toBe(false);

		expect(store.previewSelectedTransition()).toBe(true);
		expect(store.cameraPreview).not.toBeNull();
		store.stopCameraPreview();
		expect(store.statusMessage).toContain('Unknown navigation node');
	});

	it('reports missing and unroutable next nodes without starting preview', () => {
		const missingStore = createMuseumEditorStore();
		missingStore.selectNavigationNode('music-entry');
		expect(missingStore.beginDocumentTransaction()).toBe(true);
		delete missingStore.document.navigationNodes.find(
			(node) => node.id === 'music-entry'
		)!.nextNodeId;
		expect(missingStore.commitDocumentTransaction()).toBe(false);
		expect(missingStore.previewSelectedTransition()).toBe(true);
		expect(missingStore.cameraPreview).not.toBeNull();
		missingStore.stopCameraPreview();
		expect(missingStore.statusMessage).toContain('free-only node');

		const unroutableStore = createMuseumEditorStore();
		unroutableStore.selectNavigationNode('music-entry');
		expect(unroutableStore.beginDocumentTransaction()).toBe(true);
		unroutableStore.document.connections = [];
		expect(unroutableStore.commitDocumentTransaction()).toBe(false);
		expect(unroutableStore.previewSelectedTransition()).toBe(true);
		expect(unroutableStore.cameraPreview).not.toBeNull();
		unroutableStore.stopCameraPreview();
		expect(unroutableStore.statusMessage).toContain('No connection exists');
	});
});

describe('MuseumEditorStore Phase 6.5 camera paths', () => {
	it('selects connections and anchors without framing or placement ownership', () => {
		const store = createMuseumEditorStore();
		const connection = store.document.connections[0]!;
		const anchor = connection.positionPath.anchors[0]!;

		expect(store.selectConnection(connection.id)).toBe(true);
		expect(store.navigationSelection).toEqual({
			kind: 'connection',
			connectionId: connection.id
		});
		expect(store.cameraFocusKind).toBeNull();

		expect(store.selectAnchor(connection.id, anchor.id)).toBe(true);
		expect(store.navigationSelection).toEqual({
			kind: 'anchor',
			connectionId: connection.id,
			anchorId: anchor.id
		});
		expect(store.cameraSelection).toBeNull();
	});

	it('converts legacy connections atomically and preserves stable anchors through history', () => {
		const store = createMuseumEditorStore();
		const connection = store.document.connections[0]!;
		const anchorId = connection.positionPath.anchors[0]!.id;
		store.selectConnection(connection.id);

		expect(connection.positionPath.kind).toBe('rounded-polyline');
		expect(store.convertSelectedConnectionToSmooth()).toBe(true);
		expect(store.selectedConnection?.positionPath.kind).toBe('auto-bezier');
		expect(store.selectedConnection?.positionPath.anchors[0]!.id).toBe(anchorId);

		expect(store.undo()).toBe(true);
		expect(store.selectedConnection?.positionPath.kind).toBe('rounded-polyline');
		expect(store.redo()).toBe(true);
		expect(store.selectedConnection?.positionPath.kind).toBe('auto-bezier');
	});

	it('edits and deletes anchors with one history entry while preserving coordinate basis', () => {
		const store = createMuseumEditorStore();
		const connection = store.document.connections.find(
			(candidate) => candidate.positionPath.anchors.some((anchor) => anchor.roomId)
		)!;
		const anchor = connection.positionPath.anchors.find((candidate) => candidate.roomId)!;
		const original = [...anchor.position] as [number, number, number];
		const next: [number, number, number] = [original[0] + 0.25, original[1], original[2] - 0.5];
		store.selectConnection(connection.id);
		store.selectAnchor(connection.id, anchor.id);

		expect(store.commitSelectedAnchorPoint(next)).toBe(true);
		expect(store.selectedAnchor?.roomId).toBe(anchor.roomId);
		expect(store.selectedAnchor?.position).toEqual(next);
		expect(store.selectedConnection?.positionPath.kind).toBe('auto-bezier');

		expect(store.undo()).toBe(true);
		expect(store.navigationSelection).toEqual({
			kind: 'anchor',
			connectionId: connection.id,
			anchorId: anchor.id
		});
		expect(store.selectedAnchor?.position).toEqual(original);

		expect(store.deleteSelectedAnchor()).toBe(true);
		expect(store.navigationSelection).toEqual({
			kind: 'connection',
			connectionId: connection.id
		});
		expect(store.selectedConnection?.positionPath.kind).toBe('rounded-polyline');
	});

	it('inserts and drags one anchor inside one cancelable transaction', () => {
		const store = createMuseumEditorStore();
		const connection = store.document.connections[0]!;
		const originalCount = connection.positionPath.anchors.length;
		store.selectConnection(connection.id);

		expect(store.beginDocumentTransaction()).toBe(true);
		const anchorId = store.insertConnectionAnchorAtWorldPoint(
			connection.id,
			1,
			[0, 1.65, 0]
		);
		expect(anchorId).toBe(`${connection.id}-anchor-06`);
		expect(
			store.updateConnectionAnchorWorldPoint(connection.id, anchorId!, [1, 1.65, -1])
		).toBe(true);
		expect(store.commitDocumentTransaction()).toBe(true);
		expect(store.selectedConnection?.positionPath.anchors).toHaveLength(originalCount + 1);
		expect(store.selectedConnection?.positionPath.kind).toBe('auto-bezier');

		expect(store.undo()).toBe(true);
		expect(store.navigationSelection).toEqual({
			kind: 'connection',
			connectionId: connection.id
		});
		expect(store.selectedConnection?.positionPath.anchors).toHaveLength(originalCount);
	});

	it('creates a free-only node and first smooth edge in one transaction', () => {
		const store = createMuseumEditorStore();
		store.selectRoom('paris');
		store.selectNavigationNode('paris-seat');
		const originalNodeCount = store.document.navigationNodes.length;
		const originalConnectionCount = store.document.connections.length;

		expect(store.beginConnectedNodePlacement()).toBe(true);
		const nodeId = store.createPendingNavigationNodeAt(
			roomPoint('paris', [0, 0, 0]),
			[0, 0, -1]
		);
		expect(nodeId).toBe('camera-node-1');
		const node = store.document.navigationNodes.find((candidate) => candidate.id === nodeId)!;
		expect(node.label).toBe('Camera Node 1');
		expect(node.fov).toBe(54);
		expect(node.connectedNodeIds).toEqual(['paris-seat']);
		expect(node.nextNodeId).toBeUndefined();
		expect(node.previousNodeId).toBeUndefined();
		expect(store.document.navigationNodes).toHaveLength(originalNodeCount + 1);
		expect(store.document.connections).toHaveLength(originalConnectionCount + 1);
		expect(store.document.connections.at(-1)?.positionPath).toEqual({
			kind: 'auto-bezier',
			anchors: []
		});
		expect(store.navigationSelection).toEqual({
			kind: 'node',
			nodeId,
			handle: 'position'
		});

		expect(store.undo()).toBe(true);
		expect(store.document.navigationNodes).toHaveLength(originalNodeCount);
		expect(store.document.connections).toHaveLength(originalConnectionCount);
	});

	it('connects existing nodes symmetrically and rejects self or duplicate edges', () => {
		const store = createMuseumEditorStore();
		store.selectNavigationNode('entrance-start');
		expect(store.beginConnectExistingNodes()).toBe(true);
		expect(store.selectNavigationNode('entrance-start')).toBe(false);
		expect(store.statusMessage).toContain('cannot connect to itself');
		expect(store.selectNavigationNode('paris-seat')).toBe(true);
		const connection = store.document.connections.find(
			(candidate) => candidate.id === 'entrance-start-paris-seat'
		)!;
		expect(connection.positionPath).toEqual({ kind: 'auto-bezier', anchors: [] });
		expect(
			store.document.navigationNodes.find((node) => node.id === 'entrance-start')
				?.connectedNodeIds
		).toContain('paris-seat');
		expect(
			store.document.navigationNodes.find((node) => node.id === 'paris-seat')
				?.connectedNodeIds
		).toContain('entrance-start');

		expect(store.undo()).toBe(true);
		store.selectNavigationNode('entrance-start');
		expect(store.beginConnectExistingNodes()).toBe(true);
		expect(store.selectNavigationNode('poland-threshold')).toBe(false);
		expect(store.statusMessage).toContain('already connected');
	});

	it('edits labels and previews exact connections without history', () => {
		const store = createMuseumEditorStore();
		store.selectNavigationNode('paris-seat');
		expect(store.commitSelectedNodeLabel('  Salon Close-up  ')).toBe(true);
		expect(store.selectedNavigationNode?.label).toBe('Salon Close-up');
		expect(store.undo()).toBe(true);

		const connectionId = store.document.connections[0]!.id;
		store.selectConnection(connectionId);
		expect(store.previewSelectedConnection('reverse')).toBe(true);
		const runId = store.cameraPreview!.runId;
		const captured = store.getCapturedCameraPreviewRoute(runId)!;
		const capturedJson = JSON.stringify(captured);
		expect(store.cameraPreview).toEqual(
			expect.objectContaining({
				kind: 'connection',
				connectionId,
				direction: 'reverse'
			})
		);
		const capturedPart = captured.positionParts[0]!;
		const capturedPoint =
			capturedPart.kind === 'rounded-polyline'
				? capturedPart.points[0]
				: capturedPart.anchors[0];
		(capturedPoint as [number, number, number])[0] += 100;
		captured.edges[0]!.positionSpan.start.pointIndex += 100;
		store.scene.connections[0]!.positionPath.anchors[0]!.position[0] += 200;
		expect(JSON.stringify(store.getCapturedCameraPreviewRoute(runId))).toBe(
			capturedJson
		);
		expect(store.canUndo).toBe(false);
		expect(store.stopCameraPreview()).toBe(true);
		expect(store.getCapturedCameraPreviewRoute(runId)).toBeNull();
	});

	it('registers selected anchor helper roots outside serialized history', () => {
		const store = createMuseumEditorStore();
		const connection = store.document.connections[0]!;
		const anchor = connection.positionPath.anchors[0]!;
		const root = new Object3D();
		store.registerAnchorHelperRoot(connection.id, anchor.id, root);
		store.selectConnection(connection.id);
		store.selectAnchor(connection.id, anchor.id);
		expect(store.getSelectedAnchorHelperRoot()).toBe(root);
		expect(JSON.stringify(store.document)).not.toContain('camera-anchor');
		store.unregisterAnchorHelperRoot(connection.id, anchor.id, root);
		expect(store.getSelectedAnchorHelperRoot()).toBeUndefined();
	});
});

describe('MuseumEditorStore Director preview', () => {
	it('keeps paused Director editable and refreshes its route at the same playhead', () => {
		const store = createMuseumEditorStore();
		const connection = store.document.connections[0]!;
		const source = store.document.navigationNodes.find(
			(node) => node.id === connection.fromNodeId
		)!;
		store.selectConnection(connection.id);

		expect(store.previewSelectedConnection('forward', 'director')).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			mode: 'director',
			transport: 'paused',
			playhead: 0
		});
		expect(store.isDocumentMutationBlocked).toBe(false);
		expect(store.setCameraPreviewPlayhead(0.37)).toBe(true);
		const firstRunId = store.cameraPreview!.runId;

		expect(store.beginDocumentTransaction()).toBe(true);
		source.fov += 1;
		expect(store.commitDocumentTransaction()).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			mode: 'director',
			transport: 'paused',
			playhead: 0.37
		});
		expect(store.cameraPreview!.runId).not.toBe(firstRunId);
		expect(
			store.getCapturedCameraPreviewRoute(store.cameraPreview!.runId)?.startFov
		).toBe(source.fov);
		expect(store.undo()).toBe(true);
		expect(store.cameraPreview?.playhead).toBe(0.37);
		expect(store.redo()).toBe(true);
		expect(store.cameraPreview?.playhead).toBe(0.37);
	});

	it('blocks mutations while Director plays and throughout Visitor mode', () => {
		const store = createMuseumEditorStore();
		const connection = store.document.connections[0]!;
		store.selectConnection(connection.id);
		expect(store.previewSelectedConnection('forward', 'director')).toBe(true);

		expect(store.playCameraPreview()).toBe(true);
		expect(store.cameraPreview?.transport).toBe('playing');
		expect(store.isDocumentMutationBlocked).toBe(true);
		expect(store.beginDocumentTransaction()).toBe(false);
		expect(store.selectNavigationNode(connection.fromNodeId)).toBe(false);

		expect(store.pauseCameraPreview()).toBe(true);
		expect(store.isDocumentMutationBlocked).toBe(false);
		expect(store.selectNavigationNode(connection.fromNodeId)).toBe(true);
		expect(store.setCameraPreviewMode('visitor')).toBe(true);
		expect(store.cameraPreview).toMatchObject({ mode: 'visitor', transport: 'paused' });
		expect(store.isDocumentMutationBlocked).toBe(true);
		expect(store.beginDocumentTransaction()).toBe(false);

		expect(store.setCameraPreviewMode('director')).toBe(true);
		expect(store.cameraPreview).toMatchObject({ mode: 'director', transport: 'paused' });
		expect(store.isDocumentMutationBlocked).toBe(false);
	});

	it('scrubs, steps authored breakpoints, and keeps follow/recenter session-only', () => {
		const store = createMuseumEditorStore();
		const imported = cloneMuseumSceneDocument(museumSceneDocument);
		const connection = imported.connections[0]!;
		connection.viewTracks = {
			forward: [
				{
					id: `${connection.id}-view-forward-01`,
					progress: 0.5,
					cameraTarget: [100, 2, 100],
					fov: 48
				}
			],
			reverse: []
		};
		expect(store.importDocument(imported)).toBe(true);
		store.selectConnection(connection.id);
		expect(store.previewSelectedConnection('forward', 'director')).toBe(true);

		expect(store.stepCameraPreview(1)).toBe(true);
		expect(store.cameraPreview?.playhead).toBeCloseTo(0.5, 8);
		expect(store.stepCameraPreview(1)).toBe(true);
		expect(store.cameraPreview?.playhead).toBe(1);
		expect(store.stepCameraPreview(-1)).toBe(true);
		expect(store.cameraPreview?.playhead).toBeCloseTo(0.5, 8);

		const canonical = store.canonicalJson;
		const recenterVersion = store.cameraPreviewRecenterVersion;
		expect(store.cameraPreviewFollowEnabled).toBe(true);
		expect(store.toggleCameraPreviewFollow()).toBe(true);
		expect(store.cameraPreviewFollowEnabled).toBe(false);
		expect(store.recenterCameraPreview()).toBe(true);
		expect(store.cameraPreviewRecenterVersion).toBe(recenterVersion + 1);
		expect(store.canonicalJson).toBe(canonical);
		expect(store.isDirty).toBe(false);
	});
});

describe('MuseumEditorStore camera view authoring', () => {
	it('adds one independent view key at paused Director playhead and refreshes sampling', () => {
		const store = createMuseumEditorStore();
		const connection = store.document.connections[0]!;
		const positionPathBefore = JSON.stringify(connection.positionPath);
		store.selectConnection(connection.id);
		expect(store.previewSelectedConnection('forward', 'director')).toBe(true);
		expect(store.canAddViewKeyframeAtPlayhead).toBe(false);
		expect(store.setCameraPreviewPlayhead(0.42)).toBe(true);
		expect(store.canAddViewKeyframeAtPlayhead).toBe(true);
		const runIdBefore = store.cameraPreview!.runId;

		expect(store.addViewKeyframeAtPlayhead()).toBe(true);
		expect(store.navigationSelection).toMatchObject({
			kind: 'view-keyframe',
			connectionId: connection.id,
			direction: 'forward'
		});
		const keyframe = store.selectedViewKeyframe!;
		expect(keyframe.id).toBe(`${connection.id}-view-forward-01`);
		expect(keyframe.progress).toBeGreaterThan(0);
		expect(keyframe.progress).toBeLessThan(1);
		expect(Number.isFinite(keyframe.fov)).toBe(true);
		expect(JSON.stringify(store.selectedConnection!.positionPath)).toBe(
			positionPathBefore
		);
		expect(store.cameraPreview).toMatchObject({
			mode: 'director',
			transport: 'paused',
			playhead: 0.42
		});
		expect(store.cameraPreview!.runId).not.toBe(runIdBefore);
		expect(
			store.getCapturedCameraPreviewRoute(store.cameraPreview!.runId)?.edges[0]
				.viewTrack?.keyframes
		).toHaveLength(1);

		expect(store.undo()).toBe(true);
		expect(store.selectedConnection?.viewTracks).toBeUndefined();
		expect(store.navigationSelection).toEqual({
			kind: 'connection',
			connectionId: connection.id
		});
		expect(store.redo()).toBe(true);
		expect(store.selectedConnection?.viewTracks?.forward).toHaveLength(1);
	});

	it('moves anchor-launched authoring to nearest exact curve progress first', () => {
		const store = createMuseumEditorStore();
		const connection = store.document.connections[0]!;
		const anchor = connection.positionPath.anchors[0]!;
		store.selectAnchor(connection.id, anchor.id);
		expect(store.previewSelectedConnection('forward', 'director')).toBe(true);
		expect(store.cameraPreview?.playhead).toBe(0);
		expect(store.canAddViewKeyframeAtPlayhead).toBe(true);

		expect(store.addViewKeyframeAtPlayhead()).toBe(true);
		expect(store.cameraPreview!.playhead).toBeGreaterThan(0);
		expect(store.cameraPreview!.playhead).toBeLessThan(1);
		expect(store.navigationSelection?.kind).toBe('view-keyframe');
		expect(store.selectedViewKeyframe?.progress).toBeGreaterThan(0);
	});

	it('edits target, FOV, and progress atomically while preserving stable selection', () => {
		const store = createMuseumEditorStore();
		const connection = store.document.connections[0]!;
		store.selectConnection(connection.id);
		store.previewSelectedConnection('forward', 'director');
		store.setCameraPreviewPlayhead(0.35);
		store.addViewKeyframeAtPlayhead();
		const keyframeId = store.selectedViewKeyframe!.id;
		const initialTarget = [...store.selectedViewKeyframe!.cameraTarget] as [number, number, number];
		const initialFov = store.selectedViewKeyframe!.fov;
		const initialProgress = store.selectedViewKeyframe!.progress;

		const nextTarget: [number, number, number] = [
			initialTarget[0] + 0.4,
			initialTarget[1] + 0.2,
			initialTarget[2] - 0.3
		];
		expect(
			store.commitSelectedViewKeyframeTarget([
				initialTarget[0] + 1e-6,
				initialTarget[1],
				initialTarget[2]
			])
		).toBe(false);
		expect(store.commitSelectedViewKeyframeTarget(nextTarget)).toBe(true);
		expect(store.selectedViewKeyframe?.cameraTarget).toEqual(nextTarget);
		expect(store.commitSelectedViewKeyframeFov(Math.max(10, initialFov - 5))).toBe(true);
		expect(store.selectedViewKeyframe?.fov).toBe(Math.max(10, initialFov - 5));
		const nextProgress = Math.min(0.9, initialProgress + 0.08);
		expect(store.commitSelectedViewKeyframeProgress(nextProgress)).toBe(true);
		expect(store.selectedViewKeyframe?.progress).toBe(nextProgress);
		expect(store.navigationSelection).toMatchObject({
			kind: 'view-keyframe',
			keyframeId
		});

		expect(store.undo()).toBe(true);
		expect(store.selectedViewKeyframe?.progress).toBe(initialProgress);
		expect(store.navigationSelection).toMatchObject({
			kind: 'view-keyframe',
			keyframeId
		});
		expect(store.redo()).toBe(true);
		expect(store.selectedViewKeyframe?.progress).toBe(nextProgress);
	});

	it('copies directions with mirrored progress, world framing, fresh IDs, and one undo', () => {
		const store = createMuseumEditorStore();
		const connection = store.document.connections[0]!;
		store.selectConnection(connection.id);
		store.previewSelectedConnection('forward', 'director');
		store.setCameraPreviewPlayhead(0.3);
		store.addViewKeyframeAtPlayhead();
		store.setCameraPreviewPlayhead(0.7);
		store.addViewKeyframeAtPlayhead();
		const forward = store.selectedConnection!.viewTracks!.forward.map((keyframe) => ({
			...keyframe,
			cameraTarget: [...keyframe.cameraTarget] as [number, number, number]
		}));

		expect(store.copySelectedConnectionViewTrack('forward')).toBe(true);
		const reverse = store.selectedConnection!.viewTracks!.reverse;
		expect(reverse).toHaveLength(2);
		expect(reverse.map((keyframe) => keyframe.progress)).toEqual(
			[...forward].reverse().map((keyframe) => 1 - keyframe.progress)
		);
		expect(reverse.map((keyframe) => keyframe.cameraTarget)).toEqual(
			[...forward].reverse().map((keyframe) => keyframe.cameraTarget)
		);
		expect(reverse.map((keyframe) => keyframe.fov)).toEqual(
			[...forward].reverse().map((keyframe) => keyframe.fov)
		);
		expect(reverse.every((keyframe) => keyframe.id.includes('-view-reverse-'))).toBe(true);
		expect(
			new Set([...forward, ...reverse].map((keyframe) => keyframe.id)).size
		).toBe(4);

		expect(store.undo()).toBe(true);
		expect(store.selectedConnection?.viewTracks?.reverse).toEqual([]);
		expect(store.redo()).toBe(true);
		expect(store.selectedConnection?.viewTracks?.reverse).toHaveLength(2);
	});

	it('owns one view-target helper, supports world gizmo drafts, and reconciles deletion', () => {
		const store = createMuseumEditorStore();
		const connection = store.document.connections[0]!;
		store.selectConnection(connection.id);
		store.previewSelectedConnection('forward', 'director');
		store.setCameraPreviewPlayhead(0.5);
		store.addViewKeyframeAtPlayhead();
		const selection = store.navigationSelection;
		if (selection?.kind !== 'view-keyframe') throw new Error('Expected view selection');
		const root = new Object3D();
		store.registerViewKeyframeTargetHelperRoot(
			selection.connectionId,
			selection.direction,
			selection.keyframeId,
			root
		);
		expect(store.getSelectedViewKeyframeTargetHelperRoot()).toBe(root);
		const world = store.selectedViewKeyframeWorldTarget!;
		const moved: [number, number, number] = [world[0] + 0.5, world[1], world[2] - 0.5];
		expect(store.beginDocumentTransaction()).toBe(true);
		expect(store.updateSelectedViewKeyframeTargetWorldPoint(moved)).toBe(true);
		expect(store.commitDocumentTransaction()).toBe(true);
		expect(store.selectedViewKeyframeWorldTarget).toEqual(moved);

		expect(store.deleteSelectedViewKeyframe()).toBe(true);
		expect(store.navigationSelection).toEqual({
			kind: 'connection',
			connectionId: connection.id
		});
		expect(store.selectedConnection?.viewTracks).toBeUndefined();
		store.unregisterViewKeyframeTargetHelperRoot(
			selection.connectionId,
			selection.direction,
			selection.keyframeId,
			root
		);
	});

	it('edits node FOV once and exposes view Done as selection-only', () => {
		const store = createMuseumEditorStore();
		store.selectNavigationNode('paris-seat');
		const initialFov = store.selectedNavigationNode!.fov;
		expect(store.commitSelectedNodeFov(initialFov - 3)).toBe(true);
		expect(store.selectedNavigationNode?.fov).toBe(initialFov - 3);
		expect(store.commitSelectedNodeFov(121)).toBe(false);
		expect(store.undo()).toBe(true);
		expect(store.selectedNavigationNode?.fov).toBe(initialFov);

		const connection = store.document.connections[0]!;
		store.selectConnection(connection.id);
		store.previewSelectedConnection('forward', 'director');
		store.setCameraPreviewPlayhead(0.5);
		store.addViewKeyframeAtPlayhead();
		const documentBefore = serializeSceneDocument(store.document);
		expect(store.finishViewKeyframeEditing()).toBe(true);
		expect(store.navigationSelection).toEqual({
			kind: 'connection',
			connectionId: connection.id
		});
		expect(serializeSceneDocument(store.document)).toBe(documentBefore);
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

describe('MuseumEditorStore Phase 2.1 persistent camera discovery', () => {
	function importWithViewKeys() {
		const imported = cloneMuseumSceneDocument(museumSceneDocument);
		const connection = imported.connections[0]!;
		connection.viewTracks = {
			forward: [
				{
					id: `${connection.id}-view-forward-01`,
					progress: 0.42,
					roomId: 'entrance',
					cameraTarget: [1, 1.4, -2],
					fov: 48
				}
			],
			reverse: [
				{
					id: `${connection.id}-view-reverse-01`,
					progress: 0.66,
					cameraTarget: [4, 1.6, 1],
					fov: 56
				}
			]
		};
		return imported;
	}

	it('defaults to the Cameras filter with no active connection', () => {
		const store = createMuseumEditorStore();
		expect(store.cameraTreeFilter).toBe('cameras');
		expect(store.activeCameraConnectionId).toBeNull();
		expect(store.activeCameraDirection).toBe('forward');
	});

	it('selects a connection, persists its direction, and remembers it after a no-op toggle', () => {
		const store = createMuseumEditorStore();
		const connectionId = store.document.connections[0]!.id;

		expect(store.selectConnection(connectionId)).toBe(true);
		expect(store.activeCameraConnectionId).toBe(connectionId);
		expect(store.activeCameraDirection).toBe('forward');
		expect(store.navigationSelection).toEqual({
			kind: 'connection',
			connectionId
		});
		expect(store.treeExpandedCameraConnectionIds).toContain(connectionId);
		expect(store.treeExpandedCameraDirectionKeys).toContain(
			`${connectionId}:forward`
		);

		expect(store.selectConnection(connectionId)).toBe(false);
		expect(store.activeCameraConnectionId).toBe(connectionId);
	});

	it('switches direction with selectCameraConnectionDirection and stays idempotent', () => {
		const store = createMuseumEditorStore();
		const connectionId = store.document.connections[0]!.id;

		expect(store.selectCameraConnectionDirection(connectionId, 'reverse')).toBe(true);
		expect(store.activeCameraConnectionId).toBe(connectionId);
		expect(store.activeCameraDirection).toBe('reverse');
		expect(store.treeExpandedCameraDirectionKeys).toContain(
			`${connectionId}:reverse`
		);

		expect(store.selectCameraConnectionDirection(connectionId, 'reverse')).toBe(false);
		expect(store.activeCameraDirection).toBe('reverse');
	});

	it('anchor selection adopts the active direction and reveals it in the tree', () => {
		const store = createMuseumEditorStore();
		const connection = store.document.connections.find(
			(candidate) => candidate.positionPath.anchors.length > 0
		)!;
		const anchor = connection.positionPath.anchors[0]!;

		expect(store.selectCameraConnectionDirection(connection.id, 'reverse')).toBe(true);
		expect(store.selectAnchor(connection.id, anchor.id)).toBe(true);
		expect(store.navigationSelection).toEqual({
			kind: 'anchor',
			connectionId: connection.id,
			anchorId: anchor.id
		});
		expect(store.activeCameraConnectionId).toBe(connection.id);
		expect(store.activeCameraDirection).toBe('reverse');
	});

	it('anchor selection defaults to forward when switching connections', () => {
		const store = createMuseumEditorStore();
		const connections = store.document.connections.filter(
			(candidate) => candidate.positionPath.anchors.length > 0
		);
		const first = connections[0]!;
		const second = connections[1]!;

		expect(store.selectCameraConnectionDirection(first.id, 'reverse')).toBe(true);
		expect(
			store.selectAnchor(second.id, second.positionPath.anchors[0]!.id)
		).toBe(true);
		expect(store.activeCameraConnectionId).toBe(second.id);
		expect(store.activeCameraDirection).toBe('forward');
		expect(store.treeExpandedCameraDirectionKeys).toContain(
			`${second.id}:forward`
		);
	});

	it('selecting a camera key establishes the persistent trio and auto-expands its direction', () => {
		const store = createMuseumEditorStore();
		expect(store.importDocument(importWithViewKeys())).toBe(true);
		const connectionId = store.document.connections[0]!.id;
		const forwardId = store.document.connections[0]!.viewTracks!.forward[0]!.id;

		expect(store.selectViewKeyframe(connectionId, 'forward', forwardId)).toBe(true);
		expect(store.activeCameraConnectionId).toBe(connectionId);
		expect(store.activeCameraDirection).toBe('forward');
		expect(store.treeExpandedCameraConnectionIds).toContain(connectionId);
		expect(store.treeExpandedCameraDirectionKeys).toContain(
			`${connectionId}:forward`
		);
	});

	it('Done editing view keeps the active connection and its direction', () => {
		const store = createMuseumEditorStore();
		expect(store.importDocument(importWithViewKeys())).toBe(true);
		const connectionId = store.document.connections[0]!.id;
		const reverseId = store.document.connections[0]!.viewTracks!.reverse[0]!.id;

		expect(store.selectViewKeyframe(connectionId, 'reverse', reverseId)).toBe(true);
		expect(store.finishViewKeyframeEditing()).toBe(true);
		expect(store.activeCameraConnectionId).toBe(connectionId);
		expect(store.activeCameraDirection).toBe('reverse');
		expect(store.navigationSelection).toEqual({
			kind: 'connection',
			connectionId
		});
	});

	it('Preview Stop preserves the active connection and direction', () => {
		const store = createMuseumEditorStore();
		expect(store.importDocument(importWithViewKeys())).toBe(true);
		const connectionId = store.document.connections[0]!.id;
		const forwardId = store.document.connections[0]!.viewTracks!.forward[0]!.id;

		expect(store.selectViewKeyframe(connectionId, 'forward', forwardId)).toBe(true);
		expect(store.previewSelectedConnection('forward', 'director')).toBe(true);
		expect(store.cameraPreview).not.toBeNull();
		expect(store.stopCameraPreview()).toBe(true);
		expect(store.cameraPreview).toBeNull();
		expect(store.activeCameraConnectionId).toBe(connectionId);
		expect(store.activeCameraDirection).toBe('forward');
		expect(store.navigationSelection).toEqual({
			kind: 'view-keyframe',
			connectionId,
			direction: 'forward',
			keyframeId: forwardId
		});
	});

	it('connection preview adopts its traversal direction and preserves it after Stop', () => {
		const store = createMuseumEditorStore();
		expect(store.importDocument(importWithViewKeys())).toBe(true);
		const connectionId = store.document.connections[0]!.id;
		const forwardId = store.document.connections[0]!.viewTracks!.forward[0]!.id;

		expect(store.selectViewKeyframe(connectionId, 'forward', forwardId)).toBe(true);
		expect(store.previewSelectedConnection('reverse', 'director')).toBe(true);
		expect(store.activeCameraConnectionId).toBe(connectionId);
		expect(store.activeCameraDirection).toBe('reverse');
		expect(store.treeExpandedCameraDirectionKeys).toContain(
			`${connectionId}:reverse`
		);
		expect(store.navigationSelection).toEqual({
			kind: 'connection',
			connectionId
		});

		expect(store.stopCameraPreview()).toBe(true);
		expect(store.activeCameraConnectionId).toBe(connectionId);
		expect(store.activeCameraDirection).toBe('reverse');
	});

	it('clear camera-key helpers visibility across Camera, Scene, and visitor preview', () => {
		const store = createMuseumEditorStore();
		const connectionId = store.document.connections[0]!.id;
		expect(store.setWorkspace('camera')).toBe(true);
		expect(store.selectCameraConnectionDirection(connectionId, 'forward')).toBe(true);
		expect(store.isCameraKeyHelpersActive).toBe(true);

		expect(store.setWorkspace('scene')).toBe(true);
		expect(store.isCameraKeyHelpersActive).toBe(false);

		expect(store.setWorkspace('camera')).toBe(true);
		expect(store.isCameraKeyHelpersActive).toBe(true);

		expect(store.selectNavigationNode('paris-seat')).toBe(true);
		expect(store.previewSelectedNode()).toBe(true);
		expect(store.isCameraKeyHelpersActive).toBe(false);
		expect(store.stopCameraPreview()).toBe(true);
		// selectNavigationNode cleared the active connection focus, so the helpers stay
		// hidden after Stop. The user can re-select a connection/key to bring them back.
		expect(store.isCameraKeyHelpersActive).toBe(false);
	});

	it('camera filter is session-only and Scene workspace ignores it', () => {
		const store = createMuseumEditorStore();
		expect(store.cameraTreeFilter).toBe('cameras');
		expect(store.setCameraTreeFilter('all')).toBe(true);
		expect(store.cameraTreeFilter).toBe('all');

		expect(store.setWorkspace('camera')).toBe(true);
		expect(store.cameraTreeFilter).toBe('all');
		expect(store.setWorkspace('scene')).toBe(true);
		expect(store.cameraTreeFilter).toBe('all');
		expect(store.setWorkspace('camera')).toBe(true);
		expect(store.cameraTreeFilter).toBe('all');
		expect(store.setCameraTreeFilter('all')).toBe(false);
	});

	it('camera connection and direction expansion toggle independently and persist', () => {
		const store = createMuseumEditorStore();
		const connectionId = store.document.connections[0]!.id;
		expect(store.toggleCameraConnectionTreeExpansion(connectionId)).toBe(true);
		expect(store.treeExpandedCameraConnectionIds).toContain(connectionId);
		expect(store.toggleCameraDirectionTreeExpansion(connectionId, 'reverse')).toBe(
			true
		);
		expect(store.treeExpandedCameraDirectionKeys).toContain(
			`${connectionId}:reverse`
		);
		expect(store.toggleCameraConnectionTreeExpansion(connectionId)).toBe(true);
		expect(store.treeExpandedCameraConnectionIds).not.toContain(connectionId);
		expect(store.toggleCameraDirectionTreeExpansion(connectionId, 'reverse')).toBe(
			true
		);
		expect(store.treeExpandedCameraDirectionKeys).not.toContain(
			`${connectionId}:reverse`
		);
	});

	it('selecting a node or placement clears the active connection discovery', () => {
		const store = createMuseumEditorStore();
		const connectionId = store.document.connections[0]!.id;
		const placement = store.document.objects[0]!;

		store.selectCameraConnectionDirection(connectionId, 'reverse');
		expect(store.activeCameraConnectionId).toBe(connectionId);

		expect(store.selectNavigationNode('paris-seat')).toBe(true);
		expect(store.activeCameraConnectionId).toBeNull();
		expect(store.activeCameraDirection).toBe('forward');

		store.selectCameraConnectionDirection(connectionId, 'forward');
		store.selectRoom('paris');
		expect(store.selectPlacement(placement.id)).toBe(true);
		expect(store.activeCameraConnectionId).toBeNull();
		expect(store.deselect()).toBe(true);
		expect(store.activeCameraConnectionId).toBeNull();
	});
});
