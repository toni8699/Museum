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
	EDITOR_VISITOR_LIGHTING,
	MuseumEditorStore,
	type EditorCameraPreview
} from './museum-editor.svelte';
import { serializeSceneDocument } from '$lib/content/scene-codec';
import { createEditorRoomCameraFrame } from './editor-camera';
import {
	cameraMotionProgressAtEdgeProgress,
	createCameraMotion,
	createCameraMotionSample,
	sampleCameraMotion
} from '$lib/museum/navigation/camera-motion';
import { getSceneCameraViewKeyframeWorldPosition } from './editor-camera-view';
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
			toNodeId: 'camera-node-1',
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

	it('guards every document and editor-command category while preview is playing', () => {
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
		expect(store.previewSelectedTransition()).toBe(true);

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
		// Phase 3.6 unlocks framing handle edits while Through Camera is paused.
		// While the preview plays, even the 'target' handle is locked down.
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

	it('keeps an any-room camera pending until its first smooth edge commits atomically', () => {
		const store = createMuseumEditorStore();
		const originalNodeCount = store.document.navigationNodes.length;
		const originalConnectionCount = store.document.connections.length;
		const originalJson = store.canonicalJson;

		expect(store.beginCameraPlacement()).toBe(true);
		const nodeId = store.createPendingNavigationNodeAt(
			'workshop',
			roomPoint('workshop', [1, 0, 2]),
			[0, 0, -1]
		);
		expect(nodeId).toBe('camera-node-2');
		expect(store.document.navigationNodes).toHaveLength(originalNodeCount);
		expect(store.document.connections).toHaveLength(originalConnectionCount);
		expect(store.canonicalJson).toBe(originalJson);
		expect(store.canUndo).toBe(false);

		const node = store.pendingNavigationNode!;
		expect(node.label).toBe('Camera Node 2');
		expect(node.roomId).toBe('workshop');
		expect(node.position[0]).toBeCloseTo(1);
		expect(node.position[1]).toBeCloseTo(1.65);
		expect(node.position[2]).toBeCloseTo(2);
		const floorWorld = roomPoint('workshop', [1, 0, 2]);
		const targetWorld = roomPoint('workshop', node.cameraTarget);
		expect(targetWorld[0]).toBeCloseTo(floorWorld[0]);
		expect(targetWorld[1]).toBeCloseTo(floorWorld[1] + 1.25);
		expect(targetWorld[2]).toBeCloseTo(floorWorld[2] - 3);
		expect(node.fov).toBe(54);
		expect(node.connectedNodeIds).toEqual([]);
		expect(node.nextNodeId).toBeUndefined();
		expect(node.previousNodeId).toBeUndefined();
		expect(store.commitSelectedNodeLabel('  Workshop close-up  ')).toBe(true);
		expect(store.commitSelectedNodeFov(62)).toBe(true);
		expect(
			store.commitNavigationNodePoint(nodeId!, 'position', [1.5, 1.7, 2.25])
		).toBe(true);
		expect(store.canUndo).toBe(false);

		expect(store.selectNavigationNode('workshop-desk')).toBe(true);
		expect(store.document.navigationNodes).toHaveLength(originalNodeCount + 1);
		expect(store.document.connections).toHaveLength(originalConnectionCount + 1);
		const committed = store.document.navigationNodes.find(
			(candidate) => candidate.id === nodeId
		)!;
		expect(committed.label).toBe('Workshop close-up');
		expect(committed.fov).toBe(62);
		expect(committed.position).toEqual([1.5, 1.7, 2.25]);
		expect(committed.connectedNodeIds).toEqual(['workshop-desk']);
		const connection = store.document.connections.at(-1)!;
		expect(connection.fromNodeId).toBe('workshop-desk');
		expect(connection.toNodeId).toBe(nodeId);
		expect(connection.positionPath).toEqual({
			kind: 'auto-bezier',
			anchors: []
		});
		expect(store.navigationSelection).toEqual({
			kind: 'connection',
			connectionId: connection.id
		});
		expect(store.pendingNavigationCommand).toBeNull();

		expect(store.undo()).toBe(true);
		expect(store.document.navigationNodes).toHaveLength(originalNodeCount);
		expect(store.document.connections).toHaveLength(originalConnectionCount);
	});

	it('cancels a pending camera and all pose edits without document or history mutation', () => {
		const store = createMuseumEditorStore();
		store.setWorkspace('camera');
		store.selectNavigationNode('paris-seat');
		const selectionBefore = store.navigationSelection;
		const jsonBefore = store.canonicalJson;

		expect(store.beginCameraPlacement()).toBe(true);
		const nodeId = store.createPendingNavigationNodeAt(
			'legacy',
			roomPoint('legacy', [0.5, 0, -1]),
			[1, 0, 0]
		)!;
		expect(store.commitSelectedNodeFov(80)).toBe(true);
		expect(store.selectCameraHandle('target')).toBe(true);
		expect(store.commitNavigationNodePoint(nodeId, 'target', [2, 1.4, -1])).toBe(true);
		expect(store.cancelPendingNavigation()).toBe(true);

		expect(store.pendingNavigationCommand).toBeNull();
		expect(store.canonicalJson).toBe(jsonBefore);
		expect(store.canUndo).toBe(false);
		expect(store.navigationSelection).toEqual(selectionBefore);
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
		expect(store.navigationSelection).toEqual({
			kind: 'connection',
			connectionId: connection.id
		});
		expect(store.activeCameraConnectionId).toBe(connection.id);
		expect(store.activeCameraDirection).toBe('forward');

		expect(store.undo()).toBe(true);
		store.selectNavigationNode('entrance-start');
		expect(store.beginConnectExistingNodes()).toBe(true);
		expect(store.selectNavigationNode('poland-threshold')).toBe(false);
		expect(store.statusMessage).toContain('already connected');
	});

	it('deletes a redundant connection and both view tracks in one undoable transaction', () => {
		const store = createMuseumEditorStore();
		expect(
			store.connectNavigationNodes('entrance-start', 'departure-corridor')
		).toBe(true);
		const connection = store.document.connections.find(
			(candidate) => candidate.id === 'entrance-start-departure-corridor'
		)!;
		connection.viewTracks = {
			forward: [
				{
					id: 'forward-key',
					progress: 0.4,
					cameraTarget: [100, 1.25, 100],
					fov: 54
				}
			],
			reverse: [
				{
					id: 'reverse-key',
					progress: 0.6,
					cameraTarget: [-100, 1.25, -100],
					fov: 54
				}
			]
		};
		const historyBeforeDelete = store.historyVersion;

		expect(store.deleteConnection(connection.id)).toBe(true);
		expect(store.historyVersion).toBe(historyBeforeDelete + 1);
		expect(
			store.document.connections.some((candidate) => candidate.id === connection.id)
		).toBe(false);
		expect(
			store.document.navigationNodes.find((node) => node.id === 'entrance-start')
				?.connectedNodeIds
		).not.toContain('departure-corridor');
		expect(store.activeCameraConnectionId).toBeNull();
		expect(store.navigationSelection).toBeNull();

		expect(store.undo()).toBe(true);
		const restored = store.document.connections.find(
			(candidate) => candidate.id === connection.id
		)!;
		expect(restored.viewTracks?.forward.map((key) => key.id)).toEqual([
			'forward-key'
		]);
		expect(restored.viewTracks?.reverse.map((key) => key.id)).toEqual([
			'reverse-key'
		]);
		expect(
			store.document.navigationNodes.find((node) => node.id === 'entrance-start')
				?.connectedNodeIds
		).toContain('departure-corridor');
	});

	it('rejects guided and disconnecting connection deletion without mutation or history', () => {
		const store = createMuseumEditorStore();
		const before = store.canonicalJson;
		const historyBefore = store.historyVersion;
		expect(store.deleteConnection('entrance-poland')).toBe(false);
		expect(store.statusMessage).toContain('guided order requires');
		expect(store.canonicalJson).toBe(before);
		expect(store.historyVersion).toBe(historyBefore);

		expect(store.beginCameraPlacement()).toBe(true);
		const nodeId = store.createPendingNavigationNodeAt(
			'paris',
			roomPoint('paris', [0, 0, 0]),
			[0, 0, -1]
		)!;
		expect(store.selectNavigationNode('paris-seat')).toBe(true);
		const leafConnectionId = store.document.connections.at(-1)!.id;
		const leafBefore = store.canonicalJson;
		const leafHistoryBefore = store.historyVersion;
		expect(store.deleteConnection(leafConnectionId)).toBe(false);
		expect(store.statusMessage).toContain('would become disconnected');
		expect(store.document.navigationNodes.some((node) => node.id === nodeId)).toBe(true);
		expect(store.canonicalJson).toBe(leafBefore);
		expect(store.historyVersion).toBe(leafHistoryBefore);
	});

	it('deletes free nodes with incident paths and keys, then restores them with one undo', () => {
		const store = createMuseumEditorStore();
		expect(store.beginCameraPlacement()).toBe(true);
		const nodeId = store.createPendingNavigationNodeAt(
			'workshop',
			roomPoint('workshop', [1, 0, 1]),
			[0, 0, -1]
		)!;
		expect(store.selectNavigationNode('workshop-desk')).toBe(true);
		const incident = store.document.connections.at(-1)!;
		incident.viewTracks = {
			forward: [
				{
					id: 'incident-view',
					progress: 0.5,
					cameraTarget: [100, 1.25, 100],
					fov: 54
				}
			],
			reverse: []
		};
		const historyBeforeDelete = store.historyVersion;

		expect(store.deleteNavigationNode(nodeId)).toBe(true);
		expect(store.historyVersion).toBe(historyBeforeDelete + 1);
		expect(store.document.navigationNodes.some((node) => node.id === nodeId)).toBe(false);
		expect(
			store.document.connections.some((connection) => connection.id === incident.id)
		).toBe(false);
		expect(
			store.document.navigationNodes.find((node) => node.id === 'workshop-desk')
				?.connectedNodeIds
		).not.toContain(nodeId);

		expect(store.undo()).toBe(true);
		expect(store.document.navigationNodes.some((node) => node.id === nodeId)).toBe(true);
		expect(
			store.document.connections.find((connection) => connection.id === incident.id)
				?.viewTracks?.forward[0]?.id
		).toBe('incident-view');
	});

	it('splices a guided node only across an existing direct edge and rejects otherwise', () => {
		const rejected = createMuseumEditorStore();
		const before = rejected.canonicalJson;
		expect(rejected.deleteNavigationNode('poland-threshold')).toBe(false);
		expect(rejected.statusMessage).toContain('need a direct connection');
		expect(rejected.canonicalJson).toBe(before);
		expect(rejected.canUndo).toBe(false);

		const store = createMuseumEditorStore();
		expect(
			store.connectNavigationNodes('entrance-start', 'departure-corridor')
		).toBe(true);
		const historyBeforeDelete = store.historyVersion;
		expect(store.deleteNavigationNode('poland-threshold')).toBe(true);
		expect(store.historyVersion).toBe(historyBeforeDelete + 1);
		expect(
			store.document.navigationNodes.some((node) => node.id === 'poland-threshold')
		).toBe(false);
		expect(
			store.document.navigationNodes.find((node) => node.id === 'entrance-start')
				?.nextNodeId
		).toBe('departure-corridor');
		expect(
			store.document.navigationNodes.find((node) => node.id === 'departure-corridor')
				?.previousNodeId
		).toBe('entrance-start');
		expect(
			store.document.connections.some((connection) => connection.id === 'entrance-poland')
		).toBe(false);
		expect(
			store.document.connections.some((connection) => connection.id === 'poland-departure')
		).toBe(false);
		expect(store.validation.success).toBe(true);

		expect(store.undo()).toBe(true);
		expect(
			store.document.navigationNodes.find((node) => node.id === 'poland-threshold')
				?.nextNodeId
		).toBe('departure-corridor');
	});

	it('blocks topology deletion while an interaction or playback owns the document', () => {
		const store = createMuseumEditorStore();
		const before = store.canonicalJson;
		expect(store.beginDocumentTransaction()).toBe(true);
		store.setTransformInteractionActive(true, 'camera');
		expect(store.deleteConnection('entrance-poland')).toBe(false);
		expect(store.statusMessage).toContain('editor interaction is active');
		store.setTransformInteractionActive(false);
		expect(store.cancelDocumentTransaction()).toBe(true);

		store.selectConnection('entrance-poland');
		expect(store.previewSelectedConnection('forward', 'visitor')).toBe(true);
		expect(store.deleteConnection('entrance-poland')).toBe(false);
		expect(store.statusMessage).toContain('active camera playback');
		expect(store.canonicalJson).toBe(before);
		expect(store.canUndo).toBe(false);
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

	it('defaults with no active connection or direction focus', () => {
		const store = createMuseumEditorStore();
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
		expect(store.cameraPreview).toMatchObject({
			kind: 'node',
			nodeId: 'paris-seat',
			mode: 'director',
			transport: 'paused'
		});
		expect(store.setCameraPreviewMode('visitor')).toBe(true);
		expect(store.isCameraKeyHelpersActive).toBe(false);
		expect(store.stopCameraPreview()).toBe(true);
		// selectNavigationNode cleared the active connection focus, so the helpers stay
		// hidden after Stop. The user can re-select a connection/key to bring them back.
		expect(store.isCameraKeyHelpersActive).toBe(false);
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

describe('MuseumEditorStore Phase 2.2 timeline selection and scrub', () => {
	function importWithDirectionalKeys() {
		const imported = cloneMuseumSceneDocument(museumSceneDocument);
		const connection = imported.connections[0]!;
		connection.viewTracks = {
			forward: [
				{
					id: `${connection.id}-view-forward-01`,
					progress: 0.42,
					cameraTarget: [100, 2, 100],
					fov: 48
				}
			],
			reverse: [
				{
					id: `${connection.id}-view-reverse-01`,
					progress: 0.66,
					cameraTarget: [90, 2, 90],
					fov: 56
				}
			]
		};
		return imported;
	}

	it('scrubs the global ruler into one exact guided connection without history', () => {
		const store = createMuseumEditorStore();
		store.setWorkspace('camera');
		const before = store.canonicalJson;
		const timeline = store.getCameraTimeline()!;
		const progress = 0.27;

		expect(store.seekCameraTimeline(progress)).toBe(true);
		const seconds = progress * timeline.durationSeconds;
		const edge = timeline.edges.find(
			(candidate) => seconds < candidate.endSeconds
		)!;
		expect(store.cameraTimelinePlayhead).toBe(progress);
		expect(store.navigationSelection).toEqual({
			kind: 'connection',
			connectionId: edge.connectionId
		});
		expect(store.activeCameraDirection).toBe(edge.direction);
		expect(store.cameraPreview).toMatchObject({
			kind: 'connection',
			mode: 'director',
			transport: 'paused',
			connectionId: edge.connectionId,
			direction: edge.direction
		});
		expect(store.getCapturedCameraPreviewRoute(store.cameraPreview!.runId)?.edges[0]).toMatchObject({
			connectionId: edge.connectionId,
			direction: edge.direction
		});
		expect(store.canonicalJson).toBe(before);
		expect(store.canUndo).toBe(false);
	});

	it('keeps observer framing and Follow state while scrub crosses connection sections', () => {
		const store = createMuseumEditorStore();
		store.setWorkspace('camera');
		const timeline = store.getCameraTimeline()!;
		const firstEdge = timeline.edges[0]!;
		const secondEdge = timeline.edges[1]!;

		expect(store.seekCameraTimeline(firstEdge.startSeconds / timeline.durationSeconds + 0.01)).toBe(true);
		expect(store.toggleCameraPreviewFollow()).toBe(true);
		expect(store.cameraPreviewFollowEnabled).toBe(false);
		const recenterVersion = store.cameraPreviewRecenterVersion;
		const nextProgress =
			(secondEdge.startSeconds + secondEdge.durationSeconds * 0.35) /
			timeline.durationSeconds;

		expect(store.seekCameraTimeline(nextProgress)).toBe(true);
		expect(store.cameraPreviewFollowEnabled).toBe(false);
		expect(store.cameraPreviewRecenterVersion).toBe(recenterVersion);
		expect(store.cameraPreview).toMatchObject({
			kind: 'connection',
			connectionId: secondEdge.connectionId,
			direction: secondEdge.direction
		});
	});

	it('allows timeline knob scrubbing while paused in Through Camera mode', () => {
		const store = createMuseumEditorStore();
		store.setWorkspace('camera');
		const timeline = store.getCameraTimeline()!;
		const firstProgress =
			(timeline.edges[0]!.startSeconds + timeline.edges[0]!.durationSeconds * 0.2) /
			timeline.durationSeconds;
		const secondProgress =
			(timeline.edges[1]!.startSeconds + timeline.edges[1]!.durationSeconds * 0.4) /
			timeline.durationSeconds;

		expect(store.seekCameraTimeline(firstProgress)).toBe(true);
		expect(store.setCameraPreviewMode('visitor')).toBe(true);
		expect(store.cameraPreview).toMatchObject({ mode: 'visitor', transport: 'paused' });

		expect(store.seekCameraTimeline(secondProgress)).toBe(true);
		expect(store.cameraTimelinePlayhead).toBe(secondProgress);
		expect(store.cameraPreview).toMatchObject({
			kind: 'connection',
			mode: 'visitor',
			transport: 'paused',
			connectionId: timeline.edges[1]!.connectionId
		});
	});

	it('selects either occurrence of the loop start as an exact node boundary', () => {
		const store = createMuseumEditorStore();
		store.setWorkspace('camera');
		const timeline = store.getCameraTimeline()!;
		const finalBoundary = timeline.nodeBoundaries.at(-1)!;

		expect(
			store.selectCameraTimelineNode(
				finalBoundary.nodeId,
				finalBoundary.boundaryIndex
			)
		).toBe(true);
		expect(store.cameraTimelinePlayhead).toBe(1);
		expect(store.navigationSelection).toEqual({
			kind: 'node',
			nodeId: 'entrance-start',
			handle: 'position'
		});
		expect(store.cameraPreview).toMatchObject({
			kind: 'node',
			nodeId: 'entrance-start',
			mode: 'director'
		});
	});

	it('selects and samples reverse framing keys at exact edge-local progress', () => {
		const store = createMuseumEditorStore();
		expect(store.importDocument(importWithDirectionalKeys())).toBe(true);
		store.setWorkspace('camera');
		const connection = store.document.connections[0]!;
		const keyframe = connection.viewTracks!.reverse[0]!;
		const timeline = store.getCameraTimeline()!;
		const edge = timeline.edges.find(
			(candidate) => candidate.connectionId === connection.id
		)!;
		const expectedPlayhead = cameraMotionProgressAtEdgeProgress(
			edge.motions.reverse,
			0,
			keyframe.progress
		);

		expect(
			store.selectCameraTimelineViewKeyframe(
				connection.id,
				'reverse',
				keyframe.id
			)
		).toBe(true);
		expect(store.navigationSelection).toEqual({
			kind: 'view-keyframe',
			connectionId: connection.id,
			direction: 'reverse',
			keyframeId: keyframe.id
		});
		expect(store.cameraPreview).toMatchObject({
			kind: 'connection',
			connectionId: connection.id,
			direction: 'reverse',
			playhead: expectedPlayhead
		});
		expect(store.cameraTimelinePlayhead).toBeGreaterThan(0);
		expect(store.cameraTimelinePlayhead).toBeLessThan(
			edge.endSeconds / timeline.durationSeconds
		);
	});

	it('steps through visible camera keys and guided node boundaries', () => {
		const store = createMuseumEditorStore();
		expect(store.importDocument(importWithDirectionalKeys())).toBe(true);
		store.setWorkspace('camera');
		const connection = store.document.connections[0]!;
		const forwardKey = connection.viewTracks!.forward[0]!;

		expect(store.stepCameraTimeline(1)).toBe(true);
		expect(store.navigationSelection).toEqual({
			kind: 'view-keyframe',
			connectionId: connection.id,
			direction: 'forward',
			keyframeId: forwardKey.id
		});
		expect(store.stepCameraTimeline(1)).toBe(true);
		expect(store.navigationSelection).toMatchObject({
			kind: 'node',
			nodeId: 'poland-threshold'
		});
		expect(store.stepCameraTimeline(-1)).toBe(true);
		expect(store.navigationSelection).toEqual({
			kind: 'view-keyframe',
			connectionId: connection.id,
			direction: 'forward',
			keyframeId: forwardKey.id
		});
	});

	it('preserves the global playhead across observer mode switches and Stop', () => {
		const store = createMuseumEditorStore();
		store.setWorkspace('camera');
		expect(store.seekCameraTimeline(0.38)).toBe(true);
		const playhead = store.cameraTimelinePlayhead;

		expect(store.setCameraPreviewMode('visitor')).toBe(true);
		expect(store.cameraTimelinePlayhead).toBe(playhead);
		expect(store.setCameraPreviewMode('director')).toBe(true);
		expect(store.cameraTimelinePlayhead).toBe(playhead);
		expect(store.stopCameraPreview()).toBe(true);
		expect(store.cameraPreview).toBeNull();
		expect(store.cameraTimelinePlayhead).toBe(playhead);
	});
});

describe('MuseumEditorStore Phase 2.3 whole guided-tour playback', () => {
	it('plays and completes one full exact-edge guided cycle without document history', () => {
		const store = createMuseumEditorStore();
		store.setWorkspace('camera');
		const before = store.canonicalJson;

		expect(store.previewGuidedTour()).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'tour',
			startNodeId: 'entrance-start',
			mode: 'visitor',
			transport: 'playing',
			playhead: 0
		});
		const runId = store.cameraPreview!.runId;
		expect(store.getCapturedCameraPreviewRoute(runId)).toBeNull();
		const timeline = store.getCameraTimeline()!;
		expect(timeline.nodeBoundaries[0]!.nodeId).toBe('entrance-start');
		expect(timeline.nodeBoundaries.at(-1)!.nodeId).toBe('entrance-start');
		expect(timeline.edges).toHaveLength(9);
		expect(new Set(timeline.edges.map((edge) => edge.connectionId)).size).toBe(9);

		expect(store.markCameraPreviewStarted(runId, 100)).toBe(true);
		expect(store.setCameraPreviewPlayhead(0.63, runId)).toBe(true);
		expect(store.cameraTimelinePlayhead).toBe(0.63);
		expect(store.completeCameraPreview(runId)).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'tour',
			transport: 'complete',
			playhead: 1
		});
		expect(store.cameraTimelinePlayhead).toBe(1);
		expect(store.canonicalJson).toBe(before);
		expect(store.canUndo).toBe(false);
	});

	it('replaces a paused scrub pose and preserves tour playhead across modes and Stop', () => {
		const store = createMuseumEditorStore();
		store.setWorkspace('camera');
		expect(store.seekCameraTimeline(0.38)).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'connection',
			mode: 'director',
			transport: 'paused'
		});

		expect(store.previewGuidedTour('director')).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'tour',
			mode: 'director',
			transport: 'playing',
			playhead: 0.38
		});
		expect(store.pauseCameraPreview()).toBe(true);
		expect(store.setCameraPreviewPlayhead(0.41)).toBe(true);
		expect(store.setCameraPreviewMode('visitor')).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'tour',
			mode: 'visitor',
			transport: 'paused',
			playhead: 0.41
		});
		expect(store.setCameraPreviewMode('director')).toBe(true);
		expect(store.cameraTimelinePlayhead).toBe(0.41);
		expect(store.stopCameraPreview()).toBe(true);
		expect(store.cameraPreview).toBeNull();
		expect(store.cameraTimelinePlayhead).toBe(0.41);
	});

	it('reports a broken guided cycle instead of guessing a route', () => {
		const store = createMuseumEditorStore();
		const poland = store.state.graph.nodeById.get('poland-threshold')!;
		poland.previousNodeId = 'legacy-return';

		expect(store.previewGuidedTour()).toBe(false);
		expect(store.cameraPreview).toBeNull();
		expect(store.statusMessage).toMatch(/not reciprocal/);
	});
});

describe('MuseumEditorStore Phase 3.1 selection and primary Play parity', () => {
	it('seeks Camera-workspace node selection, hard-recenters on identity, and ignores re-clicks', () => {
		const store = createMuseumEditorStore();
		store.setWorkspace('camera');
		const timeline = store.getCameraTimeline()!;

		expect(store.selectNavigationNode('paris-seat')).toBe(true);
		const boundary = timeline.nodeBoundaries
			.filter((candidate) => candidate.nodeId === 'paris-seat')
			.reduce((nearest, candidate) =>
				Math.abs(candidate.progress) < Math.abs(nearest.progress)
					? candidate
					: nearest
			);
		expect(store.cameraTimelinePlayhead).toBe(boundary.progress);
		expect(store.cameraPreview).toMatchObject({
			kind: 'node',
			nodeId: 'paris-seat',
			mode: 'director',
			transport: 'paused'
		});
		expect(store.cameraFocusKind).toBeNull();
		const runId = store.cameraPreview!.runId;
		const recenterVersion = store.cameraPreviewRecenterVersion;

		expect(store.selectNavigationNode('paris-seat')).toBe(false);
		expect(store.cameraPreview!.runId).toBe(runId);
		expect(store.cameraPreviewRecenterVersion).toBe(recenterVersion);

		expect(store.selectNavigationNode('workshop-desk')).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'node',
			nodeId: 'workshop-desk',
			mode: 'director',
			transport: 'paused'
		});
		expect(store.cameraPreviewRecenterVersion).toBe(recenterVersion + 1);
	});

	it('seeks connection starts and hard-recenters only when connection identity changes', () => {
		const store = createMuseumEditorStore();
		store.setWorkspace('camera');
		const connection = store.document.connections[0]!;

		expect(
			store.selectCameraConnectionDirection(connection.id, 'forward')
		).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'connection',
			connectionId: connection.id,
			direction: 'forward',
			mode: 'director',
			transport: 'paused',
			playhead: 0
		});
		const runId = store.cameraPreview!.runId;
		const recenterVersion = store.cameraPreviewRecenterVersion;

		expect(
			store.selectCameraConnectionDirection(connection.id, 'forward')
		).toBe(false);
		expect(store.cameraPreview!.runId).toBe(runId);
		expect(store.cameraPreviewRecenterVersion).toBe(recenterVersion);

		expect(
			store.selectCameraConnectionDirection(connection.id, 'reverse')
		).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'connection',
			connectionId: connection.id,
			direction: 'reverse',
			playhead: 0
		});
		expect(store.cameraPreviewRecenterVersion).toBe(recenterVersion + 1);

		const timeline = store.getCameraTimeline()!;
		const edge = timeline.edges.find(
			(candidate) => candidate.connectionId === connection.id
		)!;
		const edgeMiddle = (edge.startSeconds + edge.endSeconds) /
			(2 * timeline.durationSeconds);
		const directionRecenterVersion = store.cameraPreviewRecenterVersion;
		expect(
			store.selectCameraTimelineEdge(connection.id, 'reverse', edgeMiddle)
		).toBe(true);
		expect(store.cameraPreviewRecenterVersion).toBe(directionRecenterVersion);

		const otherEdge = timeline.edges.find(
			(candidate) => candidate.connectionId !== connection.id
		)!;
		expect(
			store.selectCameraTimelineEdge(
				otherEdge.connectionId,
				otherEdge.direction,
				otherEdge.startSeconds / timeline.durationSeconds
			)
		).toBe(true);
		expect(store.cameraPreviewRecenterVersion).toBe(directionRecenterVersion + 1);

		store.stopCameraPreview();
		expect(store.focusNavigationNode('paris-seat')).toBe(true);
		expect(store.cameraFocusKind).toBe('navigation-node');
		expect(
			store.selectCameraConnectionDirection(connection.id, 'forward')
		).toBe(true);
		expect(store.cameraFocusKind).toBeNull();
	});

	it('promotes paused selection and stopped playheads into the whole tour without resetting', () => {
		const store = createMuseumEditorStore();
		store.setWorkspace('camera');

		expect(store.seekCameraTimeline(0.38)).toBe(true);
		expect(store.previewGuidedTour()).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'tour',
			mode: 'director',
			transport: 'playing',
			playhead: 0.38
		});

		expect(store.pauseCameraPreview()).toBe(true);
		expect(store.setCameraPreviewPlayhead(0.46)).toBe(true);
		expect(store.previewGuidedTour('visitor')).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'tour',
			mode: 'director',
			transport: 'playing',
			playhead: 0.46
		});

		const runId = store.cameraPreview!.runId;
		expect(store.markCameraPreviewStarted(runId, 100)).toBe(true);
		expect(store.completeCameraPreview(runId)).toBe(true);
		expect(store.previewGuidedTour()).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'tour',
			mode: 'director',
			transport: 'playing',
			playhead: 0
		});

		expect(store.stopCameraPreview()).toBe(true);
		expect(store.seekCameraTimeline(0.62)).toBe(true);
		expect(store.stopCameraPreview()).toBe(true);
		expect(store.previewGuidedTour()).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'tour',
			mode: 'visitor',
			transport: 'playing',
			playhead: 0.62
		});
	});
});

describe('MuseumEditorStore Phase 2.4 camera-key progress drag', () => {
	function importWithDragKeys() {
		const imported = cloneMuseumSceneDocument(museumSceneDocument);
		const connection = imported.connections[0]!;
		connection.viewTracks = {
			forward: [
				{
					id: `${connection.id}-view-forward-01`,
					progress: 0.3,
					cameraTarget: [100, 2, 100],
					fov: 48
				},
				{
					id: `${connection.id}-view-forward-02`,
					progress: 0.7,
					cameraTarget: [90, 2, 90],
					fov: 58
				}
			],
			reverse: [
				{
					id: `${connection.id}-view-reverse-01`,
					progress: 0.4,
					cameraTarget: [80, 2, 80],
					fov: 52
				}
			]
		};
		return imported;
	}

	function firstForwardSelection(store: ReturnType<typeof createMuseumEditorStore>) {
		const connection = store.document.connections[0]!;
		return {
			connectionId: connection.id,
			direction: 'forward' as const,
			keyframeId: connection.viewTracks!.forward[0]!.id
		};
	}

	it('live-updates progress, playhead, target, and FOV before one stable-ID commit', () => {
		const store = createMuseumEditorStore();
		expect(store.importDocument(importWithDragKeys())).toBe(true);
		store.setWorkspace('camera');
		const selection = firstForwardSelection(store);
		const keyframe = store.document.connections[0]!.viewTracks!.forward[0]!;
		const positionPathBefore = JSON.stringify(store.document.connections[0]!.positionPath);
		const targetBefore = [...keyframe.cameraTarget];
		const fovBefore = keyframe.fov;
		const reverseTrackBefore = JSON.stringify(
			store.document.connections[0]!.viewTracks!.reverse
		);

		expect(store.beginViewKeyframeProgressDrag(selection)).toBe(true);
		expect(store.isDocumentTransactionActive).toBe(true);
		expect(store.isEditorInteractionActive).toBe(true);
		expect(store.updateViewKeyframeProgressDrag(0.48)).toBe(true);
		expect(store.selectedViewKeyframe?.progress).toBe(0.48);
		expect(store.cameraPreview).toMatchObject({
			kind: 'connection',
			mode: 'director',
			transport: 'paused'
		});
		const route = store.getCapturedCameraPreviewRoute(store.cameraPreview!.runId)!;
		const routeKey = route.edges[0]!.viewTrack!.keyframes.find(
			(candidate) => candidate.id === selection.keyframeId
		)!;
		expect(routeKey.progress).toBe(0.48);
		const sample = createCameraMotionSample();
		sampleCameraMotion(createCameraMotion(route), store.cameraPreview!.playhead, sample);
		for (const [index, value] of sample.target.toArray().entries()) {
			expect(value).toBeCloseTo(targetBefore[index]!, 8);
		}
		expect(sample.fov).toBeCloseTo(fovBefore, 8);

		expect(store.commitViewKeyframeProgressDrag()).toBe(true);
		expect(store.isDocumentTransactionActive).toBe(false);
		expect(store.viewKeyframeProgressDrag).toBeNull();
		expect(store.canUndo).toBe(true);
		expect(store.selectedViewKeyframe).toMatchObject({
			id: selection.keyframeId,
			progress: 0.48,
			cameraTarget: targetBefore,
			fov: fovBefore
		});
		expect(JSON.stringify(store.selectedConnection!.positionPath)).toBe(positionPathBefore);
		expect(JSON.stringify(store.selectedConnection!.viewTracks!.reverse)).toBe(
			reverseTrackBefore
		);

		expect(store.undo()).toBe(true);
		expect(store.selectedViewKeyframe).toMatchObject({
			id: selection.keyframeId,
			progress: 0.3
		});
		expect(store.redo()).toBe(true);
		expect(store.selectedViewKeyframe).toMatchObject({
			id: selection.keyframeId,
			progress: 0.48
		});
	});

	it('projects a world point onto the exact shared curve in both directions', () => {
		for (const direction of ['forward', 'reverse'] as const) {
			const store = createMuseumEditorStore();
			expect(store.importDocument(importWithDragKeys())).toBe(true);
			store.setWorkspace('camera');
			const connection = store.document.connections[0]!;
			const selection = {
				connectionId: connection.id,
				direction,
				keyframeId: connection.viewTracks![direction][0]!.id
			};
			const worldPoint = getSceneCameraViewKeyframeWorldPosition(
				store.document,
				selection.connectionId,
				selection.direction,
				0.59
			);

			expect(store.beginViewKeyframeProgressDrag(selection)).toBe(true);
			expect(store.updateViewKeyframeProgressDrag(worldPoint)).toBe(true);
			expect(store.selectedViewKeyframe!.progress).toBeCloseTo(0.59, 3);
			expect(store.commitViewKeyframeProgressDrag()).toBe(true);
		}
	});

	it('clamps endpoints strictly inside the edge and rejects directional collisions', () => {
		const store = createMuseumEditorStore();
		expect(store.importDocument(importWithDragKeys())).toBe(true);
		store.setWorkspace('camera');
		const selection = firstForwardSelection(store);

		expect(store.beginViewKeyframeProgressDrag(selection)).toBe(true);
		expect(store.updateViewKeyframeProgressDrag(0)).toBe(true);
		expect(store.selectedViewKeyframe!.progress).toBeGreaterThan(0);
		expect(store.updateViewKeyframeProgressDrag(1)).toBe(true);
		expect(store.selectedViewKeyframe!.progress).toBeLessThan(1);
		expect(store.updateViewKeyframeProgressDrag(0.7)).toBe(false);
		expect(store.selectedViewKeyframe!.progress).toBeLessThan(1);
		expect(store.cancelViewKeyframeProgressDrag()).toBe(true);
		expect(store.selectedViewKeyframe!.progress).toBe(0.3);
		expect(store.canUndo).toBe(false);
	});

	it('creates no history for no-op/cancel and cancels atomically on workspace switch', () => {
		const store = createMuseumEditorStore();
		expect(store.importDocument(importWithDragKeys())).toBe(true);
		store.setWorkspace('camera');
		const selection = firstForwardSelection(store);

		expect(store.beginViewKeyframeProgressDrag(selection)).toBe(true);
		expect(store.commitViewKeyframeProgressDrag()).toBe(false);
		expect(store.canUndo).toBe(false);

		expect(store.beginViewKeyframeProgressDrag(selection)).toBe(true);
		expect(store.updateViewKeyframeProgressDrag(0.52)).toBe(true);
		expect(store.cancelViewKeyframeProgressDrag()).toBe(true);
		expect(store.selectedViewKeyframe!.progress).toBe(0.3);
		expect(store.canUndo).toBe(false);

		expect(store.beginViewKeyframeProgressDrag(selection)).toBe(true);
		expect(store.updateViewKeyframeProgressDrag(0.56)).toBe(true);
		expect(store.setWorkspace('scene')).toBe(true);
		expect(store.currentWorkspace).toBe('scene');
		expect(store.viewKeyframeProgressDrag).toBeNull();
		expect(store.isDocumentTransactionActive).toBe(false);
		expect(store.selectedViewKeyframe!.progress).toBe(0.3);
		expect(store.cameraPreview).toBeNull();
		expect(store.canUndo).toBe(false);
	});
});

describe('MuseumEditorStore Phase 3.4 guided-order editing', () => {		const checkedInOrder = [
			'entrance-start',
			'poland-threshold',
			'departure-corridor',
			'paris-seat',
			'camera-node-1',
			'workshop-desk',
			'music-entry',
			'music-center',
			'legacy-return'
		];

	function addDocumentConnection(
		document: MuseumSceneDocument,
		fromNodeId: string,
		toNodeId: string,
		id: string
	) {
		const from = document.navigationNodes.find((node) => node.id === fromNodeId)!;
		const to = document.navigationNodes.find((node) => node.id === toNodeId)!;
		from.connectedNodeIds.push(to.id);
		to.connectedNodeIds.push(from.id);
		document.connections.push({
			id,
			fromNodeId,
			toNodeId,
			clearance: 0.35,
			positionPath: { kind: 'auto-bezier', anchors: [] }
		});
	}

	function documentWithFreeInsertableNode() {
		const document = cloneMuseumSceneDocument(museumSceneDocument);
		const template = document.navigationNodes.find(
			(node) => node.id === 'paris-seat'
		)!;
		document.navigationNodes.push({
			...template,
			id: 'free-tour-node',
			label: 'Free Tour Node',
			connectedNodeIds: []
		});
		const free = document.navigationNodes.at(-1)!;
		delete free.nextNodeId;
		delete free.previousNodeId;
		addDocumentConnection(
			document,
			'departure-corridor',
			free.id,
			'departure-free-tour'
		);
		addDocumentConnection(document, free.id, 'paris-seat', 'free-tour-paris');
		return document;
	}

	it('exposes the reciprocal display order pinned to entrance-start', () => {
		const store = createMuseumEditorStore();
		expect(store.guidedTourNodeIds).toEqual(checkedInOrder);
	});

	it('rewrites one complete reciprocal cycle in one undoable transaction', () => {
		const document = cloneMuseumSceneDocument(museumSceneDocument);
		addDocumentConnection(
			document,
			'entrance-start',
			'departure-corridor',
			'entrance-departure'
		);
		addDocumentConnection(document, 'poland-threshold', 'paris-seat', 'poland-paris');
		const store = createMuseumEditorStore();
		expect(store.importDocument(document)).toBe(true);
		const reordered = [
			'entrance-start',
			'departure-corridor',
			'poland-threshold',
			'paris-seat',
			...checkedInOrder.slice(4)
		];
		const historyBefore = store.historyVersion;

		expect(store.setGuidedTourOrder(reordered)).toBe(true);
		expect(store.guidedTourNodeIds).toEqual(reordered);
		expect(store.historyVersion).toBe(historyBefore + 1);
		for (const [index, nodeId] of reordered.entries()) {
			const node = store.document.navigationNodes.find(
				(candidate) => candidate.id === nodeId
			)!;
			expect(node.previousNodeId).toBe(
				reordered[(index - 1 + reordered.length) % reordered.length]
			);
			expect(node.nextNodeId).toBe(reordered[(index + 1) % reordered.length]);
		}
		expect(store.validation.success).toBe(true);

		expect(store.undo()).toBe(true);
		expect(store.guidedTourNodeIds).toEqual(checkedInOrder);
	});

	it('rejects invalid reorder without mutation, history, or auto-created edges', () => {
		const store = createMuseumEditorStore();
		const before = store.canonicalJson;
		const connectionCount = store.document.connections.length;
		const invalid = [
			'entrance-start',
			'departure-corridor',
			'poland-threshold',
			...checkedInOrder.slice(3)
		];

		expect(store.setGuidedTourOrder(invalid)).toBe(false);
		expect(store.statusMessage).toContain('need a direct connection');
		expect(store.canonicalJson).toBe(before);
		expect(store.document.connections).toHaveLength(connectionCount);
		expect(store.canUndo).toBe(false);
		expect(store.setGuidedTourOrder(checkedInOrder)).toBe(false);
		expect(store.canUndo).toBe(false);
	});

	it('inserts and removes a free node while retaining all graph connections', () => {
		const store = createMuseumEditorStore();
		expect(store.importDocument(documentWithFreeInsertableNode())).toBe(true);
		const connectionIds = store.document.connections.map((connection) => connection.id);
		const historyBefore = store.historyVersion;

		expect(store.insertNodeIntoGuidedTour('free-tour-node', 3)).toBe(true);
		expect(store.guidedTourNodeIds).toEqual([
			...checkedInOrder.slice(0, 3),
			'free-tour-node',
			...checkedInOrder.slice(3)
		]);
		expect(store.historyVersion).toBe(historyBefore + 1);
		expect(store.document.connections.map((connection) => connection.id)).toEqual(
			connectionIds
		);

		expect(store.removeNodeFromGuidedTour('free-tour-node')).toBe(true);
		const free = store.document.navigationNodes.find(
			(node) => node.id === 'free-tour-node'
		)!;
		expect(free.nextNodeId).toBeUndefined();
		expect(free.previousNodeId).toBeUndefined();
		expect(store.guidedTourNodeIds).toEqual(checkedInOrder);
		expect(store.document.connections.map((connection) => connection.id)).toEqual(
			connectionIds
		);
		expect(store.validation.success).toBe(true);
	});

	it('requires a retained bridge when removing a guided node and pins the start', () => {
		const rejected = createMuseumEditorStore();
		expect(rejected.removeNodeFromGuidedTour('poland-threshold')).toBe(false);
		expect(rejected.statusMessage).toContain('need a direct connection');
		expect(rejected.removeNodeFromGuidedTour('entrance-start')).toBe(false);
		expect(rejected.statusMessage).toContain('display start is pinned');
		expect(rejected.canUndo).toBe(false);

		const document = cloneMuseumSceneDocument(museumSceneDocument);
		addDocumentConnection(
			document,
			'entrance-start',
			'departure-corridor',
			'entrance-departure'
		);
		const store = createMuseumEditorStore();
		expect(store.importDocument(document)).toBe(true);
		expect(store.removeNodeFromGuidedTour('poland-threshold')).toBe(true);
		const poland = store.document.navigationNodes.find(
			(node) => node.id === 'poland-threshold'
		)!;
		expect(poland.nextNodeId).toBeUndefined();
		expect(poland.previousNodeId).toBeUndefined();
		expect(store.document.connections.some((edge) => edge.id === 'entrance-poland')).toBe(
			true
		);
		expect(store.validation.success).toBe(true);
	});

	it('blocks guided-order writes during interaction, playback, and pending commands', () => {
		const store = createMuseumEditorStore();
		const before = store.canonicalJson;
		expect(store.beginDocumentTransaction()).toBe(true);
		store.setTransformInteractionActive(true, 'camera');
		expect(store.setGuidedTourOrder(checkedInOrder)).toBe(false);
		expect(store.statusMessage).toContain('active editor interaction');
		store.setTransformInteractionActive(false);
		expect(store.cancelDocumentTransaction()).toBe(true);

		store.selectNavigationNode('paris-seat');
		expect(store.previewSelectedNode('visitor')).toBe(true);
		expect(store.removeNodeFromGuidedTour('paris-seat')).toBe(false);
		expect(store.statusMessage).toContain('active camera playback');
		expect(store.stopCameraPreview()).toBe(true);

		expect(store.beginCameraPlacement()).toBe(true);
		expect(store.setGuidedTourOrder(checkedInOrder)).toBe(false);
		expect(store.statusMessage).toContain('Finish or cancel');
		expect(store.canonicalJson).toBe(before);
		expect(store.canUndo).toBe(false);
	});
});

describe('MuseumEditorStore Phase 3.5 timeline drag-connect', () => {		const checkedInOrder = [
			'entrance-start',
			'poland-threshold',
			'departure-corridor',
			'paris-seat',
			'camera-node-1',
			'workshop-desk',
			'music-entry',
			'music-center',
			'legacy-return'
		];

	function addDocumentConnection(
		document: MuseumSceneDocument,
		fromNodeId: string,
		toNodeId: string,
		id: string
	) {
		const from = document.navigationNodes.find((node) => node.id === fromNodeId)!;
		const to = document.navigationNodes.find((node) => node.id === toNodeId)!;
		from.connectedNodeIds.push(to.id);
		to.connectedNodeIds.push(from.id);
		document.connections.push({
			id,
			fromNodeId,
			toNodeId,
			clearance: 0.35,
			positionPath: { kind: 'auto-bezier', anchors: [] }
		});
	}

	function documentWithFreeNode(connectedNodeId: string) {
		const document = cloneMuseumSceneDocument(museumSceneDocument);
		const template = document.navigationNodes.find((node) => node.id === 'paris-seat')!;
		document.navigationNodes.push({
			...template,
			id: 'timeline-free-node',
			label: 'Timeline Free Node',
			connectedNodeIds: []
		});
		const free = document.navigationNodes.at(-1)!;
		delete free.nextNodeId;
		delete free.previousNodeId;
		addDocumentConnection(
			document,
			connectedNodeId,
			free.id,
			`${connectedNodeId}-timeline-free`
		);
		return document;
	}

	it('creates one straight edge and rewrites guided links in one undo entry', () => {
		const document = documentWithFreeNode('paris-seat');
		const store = createMuseumEditorStore();
		expect(store.importDocument(document)).toBe(true);
		store.setWorkspace('camera');
		const before = store.canonicalJson;
		const historyBefore = store.historyVersion;
		const connectionCount = store.document.connections.length;

		expect(
			store.timelineDragConnectNode(
				'timeline-free-node',
				'departure-corridor',
				'paris-seat'
			)
		).toBe(true);
		expect(store.historyVersion).toBe(historyBefore + 1);
		expect(store.document.connections).toHaveLength(connectionCount + 1);
		const connection = store.document.connections.find(
			(candidate) =>
				candidate.fromNodeId === 'departure-corridor' &&
				candidate.toNodeId === 'timeline-free-node'
		)!;
		expect(connection).toMatchObject({
			clearance: 0.35,
			positionPath: { kind: 'auto-bezier', anchors: [] }
		});
		expect(
			store.document.navigationNodes.find((node) => node.id === 'departure-corridor')!
				.connectedNodeIds
		).toContain('timeline-free-node');
		expect(store.guidedTourNodeIds).toEqual([
			...checkedInOrder.slice(0, 3),
			'timeline-free-node',
			...checkedInOrder.slice(3)
		]);
		expect(store.navigationSelection).toEqual({
			kind: 'connection',
			connectionId: connection.id
		});
		expect(store.activeCameraDirection).toBe('forward');
		expect(store.validation.success).toBe(true);

		expect(store.undo()).toBe(true);
		expect(store.canonicalJson).toBe(before);
	});

	it('uses existing paths without creating a connection', () => {
		const document = documentWithFreeNode('departure-corridor');
		addDocumentConnection(
			document,
			'timeline-free-node',
			'paris-seat',
			'timeline-free-paris'
		);
		const store = createMuseumEditorStore();
		expect(store.importDocument(document)).toBe(true);
		store.setWorkspace('camera');
		const connectionIds = store.document.connections.map((connection) => connection.id);

		expect(
			store.timelineDragConnectNode(
				'timeline-free-node',
				'departure-corridor',
				'paris-seat'
			)
		).toBe(true);
		expect(store.document.connections.map((connection) => connection.id)).toEqual(
			connectionIds
		);
		expect(store.activeCameraConnectionId).toBe('departure-corridor-timeline-free');
		expect(store.activeCameraDirection).toBe('forward');
		expect(store.canUndo).toBe(true);
	});

	it('rejects self, invalid-gap, and multi-edge drops without partial writes', () => {
		const store = createMuseumEditorStore();
		const before = store.canonicalJson;
		expect(
			store.timelineDragConnectNode(
				'poland-threshold',
				'poland-threshold',
				'departure-corridor'
			)
		).toBe(false);
		expect(store.statusMessage).toContain('own guided-route boundary');
		expect(
			store.timelineDragConnectNode(
				'poland-threshold',
				'departure-corridor',
				'workshop-desk'
			)
		).toBe(false);
		expect(store.statusMessage).toContain('consecutive guided');
		expect(store.canonicalJson).toBe(before);
		expect(store.canUndo).toBe(false);

		const multiEdge = createMuseumEditorStore();
		expect(multiEdge.importDocument(documentWithFreeNode('music-center'))).toBe(true);
		const imported = multiEdge.canonicalJson;
		expect(
			multiEdge.timelineDragConnectNode(
				'timeline-free-node',
				'departure-corridor',
				'paris-seat'
			)
		).toBe(false);
		expect(multiEdge.statusMessage).toContain('only one missing guided connection');
		expect(multiEdge.canonicalJson).toBe(imported);
		expect(multiEdge.canUndo).toBe(false);
	});

	it('blocks timeline drops during playback, interaction, and pending commands', () => {
		const store = createMuseumEditorStore();
		const before = store.canonicalJson;
		store.selectNavigationNode('paris-seat');
		expect(store.previewSelectedNode('visitor')).toBe(true);
		expect(
			store.timelineDragConnectNode(
				'poland-threshold',
				'departure-corridor',
				'paris-seat'
			)
		).toBe(false);
		expect(store.statusMessage).toContain('active camera playback');
		expect(store.stopCameraPreview()).toBe(true);

		store.setTransformInteractionActive(true, 'camera');
		expect(
			store.timelineDragConnectNode(
				'poland-threshold',
				'departure-corridor',
				'paris-seat'
			)
		).toBe(false);
		store.setTransformInteractionActive(false);

		expect(store.beginCameraPlacement()).toBe(true);
		expect(
			store.timelineDragConnectNode(
				'poland-threshold',
				'departure-corridor',
				'paris-seat'
			)
		).toBe(false);
		expect(store.canonicalJson).toBe(before);
		expect(store.canUndo).toBe(false);
	});
});

describe('MuseumEditorStore Phase 3.6 framing controls', () => {
	it('commits node framing while Through Camera is paused and blocks it while playing', () => {
		const store = createMuseumEditorStore();
		store.setWorkspace('camera');
		expect(store.selectNavigationNode('paris-seat')).toBe(true);
		expect(store.setCameraPreviewMode('visitor')).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'node',
			mode: 'visitor',
			transport: 'paused'
		});
		expect(store.isDocumentMutationBlocked).toBe(true);
		expect(store.isCameraFramingMutationBlocked).toBe(false);
		const initialFov = store.selectedNavigationNode!.fov;
		expect(store.commitSelectedNodeFov(initialFov - 0.1)).toBe(true);
		expect(store.selectedNavigationNode!.fov).toBeCloseTo(initialFov - 0.1);
		expect(store.stopCameraPreview()).toBe(true);
		expect(store.undo()).toBe(true);
		expect(store.selectedNavigationNode!.fov).toBe(initialFov);

		expect(store.previewSelectedTransition('visitor')).toBe(true);
		expect(store.isCameraPreviewPlaying).toBe(true);
		expect(store.isCameraFramingMutationBlocked).toBe(true);
		expect(store.commitSelectedNodeFov(initialFov - 1)).toBe(false);
	});

	it('keeps one live target/FOV drag in one undo entry during paused Through Camera', () => {
		const document = cloneMuseumSceneDocument(museumSceneDocument);
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
		const store = createMuseumEditorStore();
		expect(store.importDocument(document)).toBe(true);
		store.setWorkspace('camera');
		const keyframeId = connection.viewTracks.forward[0]!.id;
		expect(
			store.selectCameraTimelineViewKeyframe(
				connection.id,
				'forward',
				keyframeId
			)
		).toBe(true);
		expect(store.setCameraPreviewMode('visitor')).toBe(true);
		expect(store.isCameraKeyHelpersActive).toBe(true);
		const initialTarget = [...store.selectedViewKeyframe!.cameraTarget] as [
			number,
			number,
			number
		];
		const initialFov = store.selectedViewKeyframe!.fov;

		expect(store.beginCameraFramingTransaction()).toBe(true);
		store.setDirectFramingInteractionActive(true);
		expect(
			store.updateSelectedViewKeyframeTargetWorldPoint([3, 2, 4])
		).toBe(true);
		expect(store.updateSelectedViewKeyframeFov(52.4)).toBe(true);
		store.setDirectFramingInteractionActive(false);
		expect(store.commitDocumentTransaction()).toBe(true);
		expect(store.selectedViewKeyframe).toMatchObject({
			id: keyframeId,
			cameraTarget: [3, 2, 4],
			fov: 52.4
		});
		expect(store.stopCameraPreview()).toBe(true);
		expect(store.undo()).toBe(true);
		expect(store.selectedViewKeyframe).toMatchObject({
			id: keyframeId,
			cameraTarget: initialTarget,
			fov: initialFov
		});
	});
});

describe('MuseumEditorStore Phase 3.6 history + framing-drag cleanup', () => {
	function makeHistory(store: MuseumEditorStore) {
		const id = store.document.objects[0]!.id;
		store.selectRoom('paris');
		store.selectPlacement(id);
		expect(store.beginDocumentTransaction()).toBe(true);
		store.document.objects[0]!.position[0] += 1;
		expect(store.commitDocumentTransaction()).toBe(true);
	}

	function installPausedVisitorNodePreview(store: MuseumEditorStore, nodeId: string) {
		const preview: EditorCameraPreview = {
			kind: 'node',
			nodeId,
			mode: 'visitor',
			transport: 'paused',
			runId: 9999,
			playhead: 0,
			startedAtMs: null
		};
		(store as unknown as { cameraPreview: EditorCameraPreview }).cameraPreview =
			preview;
		return preview;
	}

	it('undo/redo work while Visitor preview is paused with framing history', () => {
		const store = createMuseumEditorStore();
		makeHistory(store);
		installPausedVisitorNodePreview(
			store,
			store.document.navigationNodes[0]!.id
		);

		expect(store.isVisitorCameraPreview).toBe(true);
		expect(store.isCameraPreviewPaused).toBe(true);
		expect(store.canUndo).toBe(true);
		expect(store.canRedo).toBe(false);

		expect(store.undo()).toBe(true);
		expect(store.cameraPreview).not.toBeNull();
		expect(store.canRedo).toBe(true);

		expect(store.redo()).toBe(true);
		expect(store.cameraPreview).not.toBeNull();
	});

	it('auto-stops preview when undo invalidates the referenced node', () => {
		const store = createMuseumEditorStore();
		makeHistory(store);
		installPausedVisitorNodePreview(store, 'missing-node-id');
		expect(store.canUndo).toBe(true);
		expect(store.undo()).toBe(true);
		expect(store.cameraPreview).toBeNull();
	});

	it('auto-stops tour preview when undo invalidates the start node', () => {
		const store = createMuseumEditorStore();
		makeHistory(store);
		const tourPreview: EditorCameraPreview = {
			kind: 'tour',
			startNodeId: 'missing-tour-node',
			mode: 'director',
			transport: 'paused',
			runId: 9998,
			playhead: 0,
			startedAtMs: null
		};
		(store as unknown as { cameraPreview: EditorCameraPreview }).cameraPreview =
			tourPreview;
		expect(store.undo()).toBe(true);
		expect(store.cameraPreview).toBeNull();
	});

	it('stopCameraPreview clears directFramingInteractionActive via the canceler', () => {
		const store = createMuseumEditorStore();
		let cancelCalls = 0;
		store.setDirectFramingDragCanceler(() => {
			cancelCalls += 1;
			return true;
		});
		installPausedVisitorNodePreview(
			store,
			store.document.navigationNodes[0]!.id
		);
		store.setDirectFramingInteractionActive(true);

		expect(store.stopCameraPreview()).toBe(true);
		expect(cancelCalls).toBe(1);
		expect(store.directFramingInteractionActive).toBe(false);
		expect(store.cameraPreview).toBeNull();
	});

	it('stopCameraPreview refuses when the framing canceler returns false', () => {
		const store = createMuseumEditorStore();
		let cancelCalls = 0;
		store.setDirectFramingDragCanceler(() => {
			cancelCalls += 1;
			return false;
		});
		installPausedVisitorNodePreview(
			store,
			store.document.navigationNodes[0]!.id
		);
		store.setDirectFramingInteractionActive(true);

		expect(store.stopCameraPreview()).toBe(false);
		expect(cancelCalls).toBe(1);
		expect(store.directFramingInteractionActive).toBe(true);
		expect(store.cameraPreview).not.toBeNull();
	});

	it('importDocument clears directFramingInteractionActive via the canceler', () => {
		const store = createMuseumEditorStore();
		let cancelCalls = 0;
		store.setDirectFramingDragCanceler(() => {
			cancelCalls += 1;
			return true;
		});
		store.setDirectFramingInteractionActive(true);

		expect(store.importDocument(museumSceneDocument)).toBe(true);
		expect(cancelCalls).toBe(1);
		expect(store.directFramingInteractionActive).toBe(false);
	});

	it('cancelDocumentTransaction releases the framing-drag lock on success', () => {
		const store = createMuseumEditorStore();
		expect(store.selectNavigationNode('paris-seat')).toBe(true);
		let cancelCalls = 0;
		store.setDirectFramingDragCanceler(() => {
			cancelCalls += 1;
			return true;
		});
		const node = store.selectedNavigationNode!;
		const originalFov = node.fov;
		expect(store.beginCameraFramingTransaction()).toBe(true);
		store.setDirectFramingInteractionActive(true);
		expect(store.updateSelectedNodeFov(originalFov - 0.1)).toBe(true);
		expect(store.cancelDocumentTransaction()).toBe(true);
		expect(cancelCalls).toBe(1);
		expect(store.directFramingInteractionActive).toBe(false);
		expect(store.selectedNavigationNode!.fov).toBeCloseTo(originalFov);
	});

	it('cancelDocumentTransaction refuses without rolling back when the framing canceler refuses', () => {
		const store = createMuseumEditorStore();
		expect(store.selectNavigationNode('paris-seat')).toBe(true);
		let cancelCalls = 0;
		store.setDirectFramingDragCanceler(() => {
			cancelCalls += 1;
			return false;
		});
		const node = store.selectedNavigationNode!;
		const originalFov = node.fov;
		expect(store.beginCameraFramingTransaction()).toBe(true);
		store.setDirectFramingInteractionActive(true);
		expect(store.updateSelectedNodeFov(originalFov - 0.1)).toBe(true);
		const documentBefore = JSON.stringify(store.document);
		expect(store.cancelDocumentTransaction()).toBe(false);
		expect(cancelCalls).toBe(1);
		expect(store.directFramingInteractionActive).toBe(true);
		expect(store.statusMessage).toContain('framing drag');
		expect(JSON.stringify(store.document)).toBe(documentBefore);
	});
});
