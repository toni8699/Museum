import { describe, expect, it } from 'vitest';
import { Object3D } from 'three';
import { cloneFixtureDocument } from '../content/__fixtures__/load-fixture-scene';
import {
	assertNavigationGraphMatchesScene,
	type MuseumSceneDocument,
	type SceneNavigationNode
} from '$lib/content/scene';
import { museumSceneDocument } from '$lib/content/chopin-project';
import { getRoom, roomLocalPoint, roomPoint } from '$lib/content/rooms';
import { serializeSceneDocument } from '$lib/content/scene-codec';
import {
	cameraMotionProgressAtEdgeProgress,
	createCameraMotion,
	createCameraMotionSample,
	sampleCameraMotion
} from '$lib/museum/navigation/camera-motion';
import {
	cloneMuseumSceneDocument,
	createMuseumEditorStore,
	EDITOR_BRIGHT_LIGHTING,
	EDITOR_VISITOR_LIGHTING,
	MuseumEditorStore,
	type EditorCameraPreview
} from '$lib/editor/museum-editor.svelte';
import {
	getSceneCameraViewKeyframeWorldPosition,
	orbitWorldLookTarget
} from '$lib/editor/editor-camera-view';
import {
	cameraTimelineEdgePlayheadAtProgress,
	cameraTimelineProgressAtEdgeProgress,
	type EditorCameraTimeline
} from '$lib/editor/editor-camera-timeline';
import {
	createFixtureEditorStore,
	createRelicFixtureEditorStore,
	FIXTURE_GUIDED_ORDER
} from './editor-test-utils';

describe('MuseumEditorStore Phase 6 camera nodes', () => {
	it('uses one camera selection, defaults rows to position, and avoids redundant focus', () => {
		const store = createFixtureEditorStore();
		const nodeId = 'tour-paris';

		expect(store.selectionActions.selectNavigationNode(nodeId)).toBe(true);
		expect(store.cameraSelection).toEqual({ nodeId, handle: 'position' });
		const focusVersion = store.cameraFocusVersion;
		expect(store.selectionActions.selectNavigationNode(nodeId)).toBe(false);
		expect(store.cameraFocusVersion).toBe(focusVersion);
		expect(store.canUndo).toBe(false);

		expect(store.selectionActions.selectCameraHandle('target')).toBe(true);
		expect(store.cameraSelection).toEqual({ nodeId, handle: 'target' });
		expect(store.selectionActions.selectNavigationNode(nodeId)).toBe(true);
		expect(store.cameraSelection).toEqual({ nodeId, handle: 'position' });
		expect(store.cameraFocusVersion).toBe(focusVersion);
	});

	it('never changes workspace in response to placement or camera selection', () => {
		const store = createFixtureEditorStore();
		const placement = store.document.entities.find((object) => object.roomId === 'paris')!;

		expect(store.setWorkspace('camera')).toBe(true);
		expect(store.selectionActions.selectPlacementFromTree(placement.id)).toBe(true);
		expect(store.currentWorkspace).toBe('camera');

		expect(store.setWorkspace('scene')).toBe(true);
		expect(store.selectionActions.selectNavigationNode('tour-paris')).toBe(true);
		expect(store.currentWorkspace).toBe('scene');
	});

	it('clears placement and cluster selection without changing workspace or redundant focus', () => {
		const store = createFixtureEditorStore();
		const [first, second] = store.document.entities.filter((object) => object.roomId === 'paris');
		store.selectionActions.selectRoom('paris');
		store.selectionActions.selectPlacements([first.id, second.id]);
		const clusterId = store.createCluster('Camera handoff')!;
		expect(store.selectedClusterId).toBe(clusterId);
		expect(store.setWorkspace('camera')).toBe(true);
		const beforeHistory = store.historyVersion;

		expect(store.selectionActions.selectNavigationNode('tour-paris')).toBe(true);
		expect(store.currentWorkspace).toBe('camera');
		expect(store.navigationSelection).toEqual({
			kind: 'node',
			nodeId: 'tour-paris',
			handle: 'position'
		});
		expect(store.selectedPlacementIds).toEqual([]);
		expect(store.selectedClusterId).toBeNull();
		const focusVersion = store.cameraFocusVersion;
		expect(store.selectionActions.selectNavigationNode('tour-paris')).toBe(false);
		expect(store.cameraFocusVersion).toBe(focusVersion);
		expect(store.currentWorkspace).toBe('camera');
		expect(store.historyVersion).toBe(beforeHistory);
	});

	it('consumes an applied camera focus request exactly once', () => {
		const store = createFixtureEditorStore();
		store.selectionActions.selectNavigationNode('tour-paris');
		const version = store.cameraFocusVersion;

		expect(store.consumeCameraFocus(version - 1)).toBe(false);
		expect(store.cameraFocusKind).toBe('navigation-node');
		expect(store.consumeCameraFocus(version)).toBe(true);
		expect(store.cameraFocusKind).toBeNull();
		expect(store.cameraFocusNodeId).toBeNull();
		expect(store.consumeCameraFocus(version)).toBe(false);
	});

	it('keeps camera and placement selection mutually exclusive while asset placement is latent', () => {
		const store = createFixtureEditorStore();
		const placementId = store.document.entities[0]!.id;
		store.selectionActions.selectNavigationNode('tour-b');
		expect(store.beginAssetPlacement('paris-salon-chair')).toBe(true);
		expect(store.cameraSelection?.nodeId).toBe('tour-b');
		expect(store.pendingPlacementAssetId).toBe('paris-salon-chair');

		store.cancelAssetPlacement();
		store.selectionActions.selectPlacement(placementId);
		expect(store.cameraSelection).toBeNull();
		expect(store.selectedPlacementId).toBe(placementId);

		store.selectionActions.selectNavigationNode('tour-paris');
		expect(store.selectedPlacementIds).toEqual([]);
		expect(store.cameraSelection).toEqual({ nodeId: 'tour-paris', handle: 'position' });
	});

	it('registers selected camera helper roots without persisting them', () => {
		const store = createFixtureEditorStore();
		const root = new Object3D();
		const version = store.registryVersion;
		store.registerCameraHelperRoot('tour-paris', 'position', root);
		expect(store.registryVersion).toBe(version + 1);
		expect(store.getCameraHelperRoot('tour-paris', 'position')).toBe(root);

		store.selectionActions.selectNavigationNode('tour-paris');
		expect(store.getSelectedCameraHelperRoot()).toBe(root);
		expect(JSON.stringify(store.document)).not.toContain('camera-handle');

		store.unregisterCameraHelperRoot('tour-paris', 'position', root);
		expect(store.getSelectedCameraHelperRoot()).toBeUndefined();
	});

	it('persists room-local eye edits and derives only incident runtime endpoints', () => {
		const store = createFixtureEditorStore();
		const nodeId = 'tour-paris';
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

		store.selectionActions.selectNavigationNode(nodeId);
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
		const store = createFixtureEditorStore();
		const nodeId = 'tour-b';
		store.selectionActions.selectNavigationNode(nodeId);
		store.selectionActions.selectCameraHandle('target');
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
		const store = createFixtureEditorStore();
		const nodeId = 'tour-d';
		store.selectionActions.selectNavigationNode(nodeId);
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
		const store = createFixtureEditorStore();
		const nodeId = 'tour-d';
		store.selectionActions.selectNavigationNode(nodeId);
		const documentPosition = [...store.selectedNavigationNode!.position];
		const runtimePosition = [...store.selectedRuntimeNavigationNode!.position];

		expect(store.updateNavigationNodePoint(nodeId, 'position', [99, 98, 97])).toBe(false);
		expect(store.selectedNavigationNode?.position).toEqual(documentPosition);
		expect(store.selectedRuntimeNavigationNode?.position).toEqual(runtimePosition);
		expect(store.canUndo).toBe(false);
	});

	it('creates modal node and transition previews without document history', () => {
		const store = createFixtureEditorStore();
		const placementId = store.document.entities[0]!.id;
		store.selectionActions.selectNavigationNode('tour-paris');
		store.beginAssetPlacement('paris-salon-chair');
		store.requestPlacementFrame([placementId]);

		expect(store.previewSelectedNode()).toBe(true);
		expect(store.cameraPreview).toMatchObject({ kind: 'node', nodeId: 'tour-paris' });
		expect(store.pendingPlacementAssetId).toBeNull();
		expect(store.pendingFramePlacementIds).toEqual([]);
		expect(store.cameraFocusKind).toBeNull();
		expect(store.canUndo).toBe(false);
		expect(store.selectionActions.selectPlacement(placementId)).toBe(false);
		expect(store.beginAssetPlacement('paris-salon-chair')).toBe(false);
		expect(store.requestPlacementFrame([placementId])).toBe(false);
		expect(store.commitNavigationNodePoint('tour-paris', 'position', [0, 1, 0])).toBe(false);
		expect(store.stopCameraPreview()).toBe(true);
		expect(store.cameraSelection?.nodeId).toBe('tour-paris');

		expect(store.previewSelectedTransition()).toBe(true);
		const preview = store.cameraPreview;
		expect(preview).toMatchObject({
			kind: 'transition',
			fromNodeId: 'tour-paris',
			toNodeId: 'tour-d',
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
		const store = createFixtureEditorStore();
		store.selectionActions.selectNavigationNode('tour-paris');
		expect(store.previewSelectedNode()).toBe(true);

		const events: string[] = [];
		store.setCameraPreviewRestorer(() => {
			expect(store.cameraPreview).not.toBeNull();
			expect(store.selectionActions.selectNavigationNode('tour-d')).toBe(false);
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
		const store = createFixtureEditorStore();
		store.selectionActions.selectNavigationNode('tour-paris');
		expect(store.beginDocumentTransaction()).toBe(true);
		store.setTransformInteractionActive(true, 'camera');
		expect(store.selectionActions.selectCameraHandle('target')).toBe(false);
		expect(store.selectionActions.selectNavigationNode('tour-d')).toBe(false);

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
		const store = createFixtureEditorStore();
		const placementId = store.document.entities[0]!.id;
		store.selectionActions.selectNavigationNode('tour-paris');
		const position = [...store.selectedNavigationNode!.position] as [number, number, number];
		expect(
			store.commitNavigationNodePoint('tour-paris', 'position', [
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
		expect(store.selectionActions.selectNavigationNode('tour-d')).toBe(false);
		// Phase 3.6 unlocks framing handle edits while Through Camera is paused.
		// While the preview plays, even the 'target' handle is locked down.
		expect(store.selectionActions.selectCameraHandle('target')).toBe(false);
		expect(store.selectionActions.selectRoom('paris')).toBe(false);
		expect(store.selectionActions.selectPlacement(placementId)).toBe(false);
		expect(store.selectionActions.selectPlacements([placementId])).toBe(false);
		expect(store.selectionActions.togglePlacement(placementId)).toBe(false);
		expect(store.cyclePlacement([placementId])).toBe(false);
		expect(store.selectionActions.selectAllInRoom()).toBe(false);
		expect(store.selectionActions.deselect()).toBe(false);
		expect(store.focusNavigationNode('tour-paris')).toBe(false);
		expect(store.focusRoom('paris')).toBe(false);
		expect(store.focusPlacement(placementId)).toBe(false);
		expect(store.focusSelection()).toBe(false);
		expect(store.requestPlacementFrame([placementId])).toBe(false);
		expect(store.beginAssetPlacement('paris-salon-chair')).toBe(false);
		expect(store.createPendingPlacementAt([0, 0, 0], 'paris')).toBeNull();
		expect(store.duplicateSelection()).toBe(false);
		expect(store.deletePlacements([placementId])).toBe(false);
		expect(store.createCluster()).toBeNull();
		expect(store.ungroupCluster(store.clusters[0]?.id ?? null)).toBe(false);
		expect(store.toggleCameraPan()).toBe(false);
		expect(store.applyLightingPreset(EDITOR_VISITOR_LIGHTING)).toBe(false);
		expect(
			store.commitNavigationNodePoint('tour-paris', 'position', [0, 1, 0])
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
		const store = createFixtureEditorStore();
		const nodeId = 'tour-paris';
		store.selectionActions.selectNavigationNode(nodeId);
		expect(store.beginDocumentTransaction()).toBe(true);
		store.document.navigationNodes.find((node) => node.id === nodeId)!.nextNodeId = 'missing';
		expect(store.commitDocumentTransaction()).toBe(false);

		expect(store.previewSelectedTransition()).toBe(true);
		expect(store.cameraPreview).not.toBeNull();
		store.stopCameraPreview();
		expect(store.statusMessage).toContain('Unknown navigation node');
	});

	it('reports missing and unroutable next nodes without starting preview', () => {
		const missingStore = createFixtureEditorStore();
		missingStore.selectionActions.selectNavigationNode('tour-paris');
		expect(missingStore.beginDocumentTransaction()).toBe(true);
		delete missingStore.document.navigationNodes.find(
			(node) => node.id === 'tour-paris'
		)!.nextNodeId;
		expect(missingStore.commitDocumentTransaction()).toBe(false);
		expect(missingStore.previewSelectedTransition()).toBe(true);
		expect(missingStore.cameraPreview).not.toBeNull();
		missingStore.stopCameraPreview();
		expect(missingStore.statusMessage).toContain('non_reciprocal_tour_link');

		const unroutableStore = createFixtureEditorStore();
		unroutableStore.selectionActions.selectNavigationNode('tour-paris');
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
		const store = createFixtureEditorStore();
		const connection = store.document.connections[0]!;
		const anchor = connection.positionPath.anchors[0]!;

		expect(store.selectionActions.selectConnection(connection.id)).toBe(true);
		expect(store.navigationSelection).toEqual({
			kind: 'connection',
			connectionId: connection.id
		});
		expect(store.cameraFocusKind).toBeNull();

		expect(store.selectionActions.selectAnchor(connection.id, anchor.id)).toBe(true);
		expect(store.navigationSelection).toEqual({
			kind: 'anchor',
			connectionId: connection.id,
			anchorId: anchor.id
		});
		expect(store.cameraSelection).toBeNull();
	});

	it('converts legacy connections atomically and preserves stable anchors through history', () => {
		const store = createFixtureEditorStore();
		const connection = store.document.connections[0]!;
		const anchorId = connection.positionPath.anchors[0]!.id;
		store.selectionActions.selectConnection(connection.id);

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
		const store = createFixtureEditorStore();
		const connection = store.document.connections.find(
			(candidate) => candidate.positionPath.anchors.some((anchor) => anchor.roomId)
		)!;
		const anchor = connection.positionPath.anchors.find((candidate) => candidate.roomId)!;
		const original = [...anchor.position] as [number, number, number];
		const next: [number, number, number] = [original[0] + 0.25, original[1], original[2] - 0.5];
		store.selectionActions.selectConnection(connection.id);
		store.selectionActions.selectAnchor(connection.id, anchor.id);

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
		const store = createFixtureEditorStore();
		const connection = store.document.connections[0]!;
		const originalCount = connection.positionPath.anchors.length;
		store.selectionActions.selectConnection(connection.id);

		expect(store.beginDocumentTransaction()).toBe(true);
		const anchorId = store.insertConnectionAnchorAtWorldPoint(
			connection.id,
			1,
			[0, 1.65, 0]
		);
		expect(anchorId).toBe(`${connection.id}-anchor-03`);
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

	it('places an any-room camera standalone, then connects it in a separate transaction', () => {
		const store = createFixtureEditorStore();
		const originalNodeCount = store.document.navigationNodes.length;
		const originalConnectionCount = store.document.connections.length;

		expect(store.beginCameraPlacement()).toBe(true);
		const nodeId = store.createPendingNavigationNodeAt(
			'workshop',
			roomPoint('workshop', [1, 0, 2]),
			[0, 0, -1]
		);
		expect(nodeId).toBe('camera-node-1');
		// B0 — standalone placement commits immediately, no pending command.
		expect(store.document.navigationNodes).toHaveLength(originalNodeCount + 1);
		expect(store.document.connections).toHaveLength(originalConnectionCount);
		expect(store.pendingNavigationCommand).toBeNull();
		expect(store.canUndo).toBe(true);

		const node = store.document.navigationNodes.find((candidate) => candidate.id === nodeId)!;
		expect(node.label).toBe('Camera Node 1');
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
		expect(store.statusMessage).toContain('not in order yet');

		expect(store.commitSelectedNodeLabel('  Workshop close-up  ')).toBe(true);
		expect(store.commitSelectedNodeFov(62)).toBe(true);
		expect(
			store.commitNavigationNodePoint(nodeId!, 'position', [1.5, 1.7, 2.25])
		).toBe(true);

		// Connect the free node in its own transaction via connect-existing.
		expect(store.beginConnectExistingNodes()).toBe(true);
		expect(store.selectionActions.selectNavigationNode('tour-d')).toBe(true);
		expect(store.document.connections).toHaveLength(originalConnectionCount + 1);
		const committed = store.document.navigationNodes.find(
			(candidate) => candidate.id === nodeId
		)!;
		expect(committed.label).toBe('Workshop close-up');
		expect(committed.fov).toBe(62);
		expect(committed.position).toEqual([1.5, 1.7, 2.25]);
		expect(committed.connectedNodeIds).toEqual(['tour-d']);
		const connection = store.document.connections.at(-1)!;
		expect(connection.fromNodeId).toBe(nodeId);
		expect(connection.toNodeId).toBe('tour-d');
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
		expect(store.document.connections).toHaveLength(originalConnectionCount);
	});

	it('keeps the relic connect-pending-node contract: draft edits then one atomic edge commit', () => {
		const store = createRelicFixtureEditorStore();
		const originalNodeCount = store.document.navigationNodes.length;
		const originalConnectionCount = store.document.connections.length;
		const originalJson = store.canonicalJson;

		expect(store.beginCameraPlacement()).toBe(true);
		const nodeId = store.createPendingNavigationNodeAt(
			'workshop',
			roomPoint('workshop', [1, 0, 2]),
			[0, 0, -1]
		);
		expect(nodeId).toBe('camera-node-1');
		// Relic: the node stays pending until its first edge commits.
		expect(store.document.navigationNodes).toHaveLength(originalNodeCount);
		expect(store.document.connections).toHaveLength(originalConnectionCount);
		expect(store.canonicalJson).toBe(originalJson);
		expect(store.pendingNavigationCommand?.kind).toBe('connect-pending-node');
		expect(store.canUndo).toBe(false);

		const node = store.pendingNavigationNode!;
		expect(node.label).toBe('Camera Node 1');
		expect(store.commitSelectedNodeLabel('  Workshop close-up  ')).toBe(true);
		expect(store.commitSelectedNodeFov(62)).toBe(true);
		expect(
			store.commitNavigationNodePoint(nodeId!, 'position', [1.5, 1.7, 2.25])
		).toBe(true);
		expect(store.canUndo).toBe(false);

		expect(store.selectionActions.selectNavigationNode('tour-d')).toBe(true);
		expect(store.document.navigationNodes).toHaveLength(originalNodeCount + 1);
		expect(store.document.connections).toHaveLength(originalConnectionCount + 1);
		const committed = store.document.navigationNodes.find(
			(candidate) => candidate.id === nodeId
		)!;
		expect(committed.label).toBe('Workshop close-up');
		expect(committed.fov).toBe(62);
		expect(committed.position).toEqual([1.5, 1.7, 2.25]);
		expect(committed.connectedNodeIds).toEqual(['tour-d']);
		const connection = store.document.connections.at(-1)!;
		expect(connection.fromNodeId).toBe('tour-d');
		expect(connection.toNodeId).toBe(nodeId);
		expect(store.pendingNavigationCommand).toBeNull();

		expect(store.undo()).toBe(true);
		expect(store.document.navigationNodes).toHaveLength(originalNodeCount);
		expect(store.document.connections).toHaveLength(originalConnectionCount);
	});

	it('cancels a pending camera and all pose edits without document or history mutation', () => {
		// B0 — the pending-placement contract is now the frozen relic path.
		const store = createRelicFixtureEditorStore();
		store.setWorkspace('camera');
		store.selectionActions.selectNavigationNode('tour-paris');
		const selectionBefore = store.navigationSelection;
		const jsonBefore = store.canonicalJson;

		expect(store.beginCameraPlacement()).toBe(true);
		const nodeId = store.createPendingNavigationNodeAt(
			'legacy',
			roomPoint('legacy', [0.5, 0, -1]),
			[1, 0, 0]
		)!;
		expect(store.commitSelectedNodeFov(80)).toBe(true);
		expect(store.selectionActions.selectCameraHandle('target')).toBe(true);
		expect(store.commitNavigationNodePoint(nodeId, 'target', [2, 1.4, -1])).toBe(true);
		expect(store.cancelPendingNavigation()).toBe(true);

		expect(store.pendingNavigationCommand).toBeNull();
		expect(store.canonicalJson).toBe(jsonBefore);
		expect(store.canUndo).toBe(false);
		expect(store.navigationSelection).toEqual(selectionBefore);
	});

	it('connects existing nodes symmetrically and rejects self or duplicate edges', () => {
		const store = createFixtureEditorStore();
		store.selectionActions.selectNavigationNode('tour-a');
		expect(store.beginConnectExistingNodes()).toBe(true);
		expect(store.selectionActions.selectNavigationNode('tour-a')).toBe(false);
		expect(store.statusMessage).toContain('cannot connect to itself');
		expect(store.selectionActions.selectNavigationNode('tour-paris')).toBe(true);
		const connection = store.document.connections.find(
			(candidate) => candidate.id === 'tour-a-tour-paris'
		)!;
		expect(connection.positionPath).toEqual({ kind: 'auto-bezier', anchors: [] });
		expect(
			store.document.navigationNodes.find((node) => node.id === 'tour-a')
				?.connectedNodeIds
		).toContain('tour-paris');
		expect(
			store.document.navigationNodes.find((node) => node.id === 'tour-paris')
				?.connectedNodeIds
		).toContain('tour-a');
		expect(store.navigationSelection).toEqual({
			kind: 'connection',
			connectionId: connection.id
		});
		expect(store.activeCameraConnectionId).toBe(connection.id);
		expect(store.activeCameraDirection).toBe('forward');

		expect(store.undo()).toBe(true);
		store.selectionActions.selectNavigationNode('tour-a');
		expect(store.beginConnectExistingNodes()).toBe(true);
		expect(store.selectionActions.selectNavigationNode('tour-b')).toBe(false);
		expect(store.statusMessage).toContain('already connected');
	});

	it('deletes a redundant connection and both view tracks in one undoable transaction', () => {
		const store = createFixtureEditorStore();
		expect(store.connectNavigationNodes('tour-a', 'tour-paris')).toBe(true);
		const connection = store.document.connections.find(
			(candidate) => candidate.id === 'tour-a-tour-paris'
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
			store.document.navigationNodes.find((node) => node.id === 'tour-a')
				?.connectedNodeIds
		).not.toContain('tour-paris');
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
			store.document.navigationNodes.find((node) => node.id === 'tour-a')
				?.connectedNodeIds
		).toContain('tour-paris');
	});

	it('rejects guided and disconnecting connection deletion without mutation or history', () => {
		const store = createFixtureEditorStore();
		const before = store.canonicalJson;
		const historyBefore = store.historyVersion;
		expect(store.deleteConnection('tour-a-b')).toBe(false);
		expect(store.statusMessage).toContain('the flow order requires');
		expect(store.canonicalJson).toBe(before);
		expect(store.historyVersion).toBe(historyBefore);

		expect(store.beginCameraPlacement()).toBe(true);
		const nodeId = store.createPendingNavigationNodeAt(
			'paris',
			roomPoint('paris', [0, 0, 0]),
			[0, 0, -1]
		)!;
		// B0 — placement commits standalone; connect the free node as a leaf.
		expect(store.beginConnectExistingNodes()).toBe(true);
		expect(store.selectionActions.selectNavigationNode('tour-paris')).toBe(true);
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
		const store = createFixtureEditorStore();
		expect(store.beginCameraPlacement()).toBe(true);
		const nodeId = store.createPendingNavigationNodeAt(
			'workshop',
			roomPoint('workshop', [1, 0, 1]),
			[0, 0, -1]
		)!;
		// B0 — placement commits standalone; connect the free node to tour-d.
		expect(store.beginConnectExistingNodes()).toBe(true);
		expect(store.selectionActions.selectNavigationNode('tour-d')).toBe(true);
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
			store.document.navigationNodes.find((node) => node.id === 'tour-d')
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
		const rejected = createFixtureEditorStore();
		const before = rejected.canonicalJson;
		expect(rejected.deleteNavigationNode('tour-b')).toBe(false);
		expect(rejected.statusMessage).toContain('need a direct connection');
		expect(rejected.canonicalJson).toBe(before);
		expect(rejected.canUndo).toBe(false);

		const store = createFixtureEditorStore();
		expect(store.connectNavigationNodes('tour-a', 'tour-paris')).toBe(true);
		const historyBeforeDelete = store.historyVersion;
		expect(store.deleteNavigationNode('tour-b')).toBe(true);
		expect(store.historyVersion).toBe(historyBeforeDelete + 1);
		expect(
			store.document.navigationNodes.some((node) => node.id === 'tour-b')
		).toBe(false);
		expect(
			store.document.navigationNodes.find((node) => node.id === 'tour-a')
				?.nextNodeId
		).toBe('tour-paris');
		expect(
			store.document.navigationNodes.find((node) => node.id === 'tour-paris')
				?.previousNodeId
		).toBe('tour-a');
		expect(
			store.document.connections.some((connection) => connection.id === 'tour-a-b')
		).toBe(false);
		expect(
			store.document.connections.some((connection) => connection.id === 'tour-b-paris')
		).toBe(false);
		expect(store.validation.success).toBe(true);

		expect(store.undo()).toBe(true);
		expect(
			store.document.navigationNodes.find((node) => node.id === 'tour-b')
				?.nextNodeId
		).toBe('tour-paris');
	});

	it('blocks topology deletion while an interaction or playback owns the document', () => {
		const store = createFixtureEditorStore();
		const before = store.canonicalJson;
		expect(store.beginDocumentTransaction()).toBe(true);
		store.setTransformInteractionActive(true, 'camera');
		expect(store.deleteConnection('tour-a-b')).toBe(false);
		expect(store.statusMessage).toContain('editor interaction is active');
		store.setTransformInteractionActive(false);
		expect(store.cancelDocumentTransaction()).toBe(true);

		store.selectionActions.selectConnection('tour-a-b');
		expect(store.previewSelectedConnection('forward', 'visitor')).toBe(true);
		expect(store.deleteConnection('tour-a-b')).toBe(false);
		expect(store.statusMessage).toContain('active camera playback');
		expect(store.canonicalJson).toBe(before);
		expect(store.canUndo).toBe(false);
	});

	it('edits labels and previews exact connections without history', () => {
		const store = createFixtureEditorStore();
		store.selectionActions.selectNavigationNode('tour-paris');
		expect(store.commitSelectedNodeLabel('  Salon Close-up  ')).toBe(true);
		expect(store.selectedNavigationNode?.label).toBe('Salon Close-up');
		expect(store.undo()).toBe(true);

		const connectionId = store.document.connections[0]!.id;
		store.selectionActions.selectConnection(connectionId);
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
		const store = createFixtureEditorStore();
		const connection = store.document.connections[0]!;
		const anchor = connection.positionPath.anchors[0]!;
		const root = new Object3D();
		store.registerAnchorHelperRoot(connection.id, anchor.id, root);
		store.selectionActions.selectConnection(connection.id);
		store.selectionActions.selectAnchor(connection.id, anchor.id);
		expect(store.getSelectedAnchorHelperRoot()).toBe(root);
		expect(JSON.stringify(store.document)).not.toContain('camera-anchor');
		store.unregisterAnchorHelperRoot(connection.id, anchor.id, root);
		expect(store.getSelectedAnchorHelperRoot()).toBeUndefined();
	});
});

describe('MuseumEditorStore Director preview', () => {
	it('keeps paused Director editable and refreshes its route at the same playhead', () => {
		const store = createFixtureEditorStore();
		const connection = store.document.connections[0]!;
		const source = store.document.navigationNodes.find(
			(node) => node.id === connection.fromNodeId
		)!;
		store.selectionActions.selectConnection(connection.id);

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
		const store = createFixtureEditorStore();
		const connection = store.document.connections[0]!;
		store.selectionActions.selectConnection(connection.id);
		expect(store.previewSelectedConnection('forward', 'director')).toBe(true);

		expect(store.playCameraPreview()).toBe(true);
		expect(store.cameraPreview?.transport).toBe('playing');
		expect(store.isDocumentMutationBlocked).toBe(true);
		expect(store.beginDocumentTransaction()).toBe(false);
		expect(store.selectionActions.selectNavigationNode(connection.fromNodeId)).toBe(false);

		expect(store.pauseCameraPreview()).toBe(true);
		expect(store.isDocumentMutationBlocked).toBe(false);
		expect(store.selectionActions.selectNavigationNode(connection.fromNodeId)).toBe(true);
		expect(store.setCameraPreviewMode('visitor')).toBe(true);
		expect(store.cameraPreview).toMatchObject({ mode: 'visitor', transport: 'paused' });
		expect(store.isDocumentMutationBlocked).toBe(true);
		expect(store.beginDocumentTransaction()).toBe(false);

		expect(store.setCameraPreviewMode('director')).toBe(true);
		expect(store.cameraPreview).toMatchObject({ mode: 'director', transport: 'paused' });
		expect(store.isDocumentMutationBlocked).toBe(false);
	});

	it('scrubs, steps authored breakpoints, and keeps follow/recenter session-only', () => {
		const store = createFixtureEditorStore();
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
		store.selectionActions.selectConnection(connection.id);
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
		const store = createFixtureEditorStore();
		const connection = store.document.connections[0]!;
		const positionPathBefore = JSON.stringify(connection.positionPath);
		store.selectionActions.selectConnection(connection.id);
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
		const store = createFixtureEditorStore();
		const connection = store.document.connections[0]!;
		const anchor = connection.positionPath.anchors[0]!;
		store.selectionActions.selectAnchor(connection.id, anchor.id);
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
		const store = createFixtureEditorStore();
		const connection = store.document.connections[0]!;
		store.selectionActions.selectConnection(connection.id);
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

	it('aims a view breakpoint look target around its eye with one history entry', () => {
		const document = cloneFixtureDocument();
		const connection = document.connections[0]!;
		connection.viewTracks = {
			forward: [
				{
					id: `${connection.id}-view-forward-01`,
					progress: 0.5,
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

		const keyframe = store.selectedViewKeyframe!;
		const fovBefore = keyframe.fov;
		const eyeWorld = getSceneCameraViewKeyframeWorldPosition(
			store.document,
			connection.id,
			'forward',
			keyframe.progress,
			store.rooms
		);
		const targetWorld = store.selectedViewKeyframeWorldTarget!;
		const radiusBefore = Math.hypot(
			targetWorld[0] - eyeWorld[0],
			targetWorld[1] - eyeWorld[1],
			targetWorld[2] - eyeWorld[2]
		);
		const historyBefore = store.historyVersion;

		const yaw = Math.PI / 2;
		expect(store.commitSelectedViewKeyframeAim(yaw, 0)).toBe(true);

		const aimedWorld = store.selectedViewKeyframeWorldTarget!;
		const expectedWorld = orbitWorldLookTarget(eyeWorld, targetWorld, yaw, 0);
		expect(aimedWorld[0]).toBeCloseTo(expectedWorld[0], 6);
		expect(aimedWorld[1]).toBeCloseTo(expectedWorld[1], 6);
		expect(aimedWorld[2]).toBeCloseTo(expectedWorld[2], 6);
		// Fixed-radius orbit: the eye→target distance is preserved.
		const radiusAfter = Math.hypot(
			aimedWorld[0] - eyeWorld[0],
			aimedWorld[1] - eyeWorld[1],
			aimedWorld[2] - eyeWorld[2]
		);
		expect(radiusAfter).toBeCloseTo(radiusBefore, 6);
		// Aim moves only the look target; FOV and path progress are untouched.
		expect(store.selectedViewKeyframe!.fov).toBe(fovBefore);
		expect(store.selectedViewKeyframe!.progress).toBe(keyframe.progress);
		expect(store.historyVersion).toBe(historyBefore + 1);

		expect(store.undo()).toBe(true);
		expect(store.selectedViewKeyframeWorldTarget).toEqual(targetWorld);
	});

	it('refuses to aim a view breakpoint with a coincident or unchanged eye→target pose', () => {
		const document = cloneFixtureDocument();
		const connection = document.connections[0]!;
		connection.viewTracks = {
			forward: [
				{
					id: `${connection.id}-view-forward-01`,
					progress: 0.5,
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
		const historyBefore = store.historyVersion;

		// Zero delta is a no-op: no history entry.
		expect(store.commitSelectedViewKeyframeAim(0, 0)).toBe(false);
		expect(store.historyVersion).toBe(historyBefore);

		// Coincident eye→target degeneracy is refused with a status message.
		const eyeWorld = getSceneCameraViewKeyframeWorldPosition(
			store.document,
			connection.id,
			'forward',
			store.selectedViewKeyframe!.progress,
			store.rooms
		);
		store.selectedViewKeyframe!.cameraTarget = eyeWorld;
		expect(store.commitSelectedViewKeyframeAim(Math.PI, 0)).toBe(false);
		expect(store.statusMessage).toContain('too close to aim');
		expect(store.historyVersion).toBe(historyBefore);
	});

	it('copies directions with mirrored progress, world framing, fresh IDs, and one undo', () => {
		const store = createFixtureEditorStore();
		const connection = store.document.connections[0]!;
		store.selectionActions.selectConnection(connection.id);
		store.previewSelectedConnection('forward', 'director');
		store.setCameraPreviewPlayhead(0.3);
		store.addViewKeyframeAtPlayhead();
		store.setCameraPreviewPlayhead(0.7);
		store.addViewKeyframeAtPlayhead();
		const forward = store.selectedConnection!.viewTracks!.forward.map((keyframe) => ({
			...keyframe,
			cameraTarget: [...keyframe.cameraTarget] as [number, number, number]
		}));
		// Forward edits keep reverse mirrored to the full forward track.
		expect(store.selectedConnection?.viewTracks?.reverse).toHaveLength(2);
		const syncedReverseIds = store.selectedConnection!.viewTracks!.reverse.map(
			(keyframe) => keyframe.id
		);

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
		expect(reverse.map((keyframe) => keyframe.id)).not.toEqual(syncedReverseIds);

		expect(store.undo()).toBe(true);
		expect(store.selectedConnection?.viewTracks?.reverse.map((keyframe) => keyframe.id)).toEqual(
			syncedReverseIds
		);
		expect(store.redo()).toBe(true);
		expect(store.selectedConnection?.viewTracks?.reverse).toHaveLength(2);
	});

	it('seeds empty reverse from forward when adding a forward view key', () => {
		const store = createFixtureEditorStore();
		const connection = store.document.connections[0]!;
		store.selectionActions.selectConnection(connection.id);
		store.previewSelectedConnection('forward', 'director');
		store.setCameraPreviewPlayhead(0.4);
		expect(store.addViewKeyframeAtPlayhead()).toBe(true);
		const forward = store.selectedConnection!.viewTracks!.forward;
		const reverse = store.selectedConnection!.viewTracks!.reverse;
		expect(forward).toHaveLength(1);
		expect(reverse).toHaveLength(1);
		expect(reverse[0]!.progress).toBeCloseTo(1 - forward[0]!.progress, 6);
		expect(reverse[0]!.cameraTarget).toEqual(forward[0]!.cameraTarget);
		expect(reverse[0]!.fov).toBe(forward[0]!.fov);
	});

	it('re-syncs reverse from forward when additional forward keys are added', () => {
		const store = createFixtureEditorStore();
		const connection = store.document.connections[0]!;
		store.selectionActions.selectConnection(connection.id);
		store.previewSelectedConnection('forward', 'director');
		store.setCameraPreviewPlayhead(0.35);
		expect(store.addViewKeyframeAtPlayhead()).toBe(true);
		store.selectedConnection!.viewTracks!.reverse[0]!.cameraTarget = [9, 9, 9];

		store.setCameraPreviewPlayhead(0.65);
		expect(store.addViewKeyframeAtPlayhead()).toBe(true);
		const forward = store.selectedConnection!.viewTracks!.forward;
		const reverse = store.selectedConnection!.viewTracks!.reverse;
		expect(forward).toHaveLength(2);
		expect(reverse).toHaveLength(2);
		expect(reverse.map((keyframe) => keyframe.cameraTarget)).toEqual(
			[...forward].reverse().map((keyframe) => keyframe.cameraTarget)
		);
	});

	it('previewActiveConnectionReverse seeds empty reverse and plays the reverse edge', () => {
		const store = createFixtureEditorStore();
		const connection = store.document.connections[0]!;
		connection.viewTracks = {
			forward: [
				{
					id: `${connection.id}-view-forward-01`,
					progress: 0.4,
					cameraTarget: [1, 2, 3],
					fov: 48
				}
			],
			reverse: []
		};
		store.setWorkspace('camera');
		store.selectionActions.selectCameraConnectionDirection(connection.id, 'forward');
		expect(store.previewActiveConnectionReverse('visitor')).toBe(true);
		expect(store.activeCameraDirection).toBe('reverse');
		expect(store.selectedConnection?.viewTracks?.reverse).toHaveLength(1);
		expect(store.cameraPreview).toMatchObject({
			kind: 'connection',
			connectionId: connection.id,
			direction: 'reverse',
			mode: 'visitor',
			transport: 'playing',
			playhead: 0
		});
		expect(store.setCameraPreviewMode('director')).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			mode: 'director',
			transport: 'playing'
		});
		expect(store.setCameraPreviewMode('visitor')).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			mode: 'visitor',
			transport: 'playing'
		});
	});

	it('toggleCameraEdgeReverse keeps scrub on reverse travel until leaving the edge', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		const connection = store.document.connections[0]!;
		store.selectionActions.selectCameraConnectionDirection(connection.id, 'forward');
		const timeline = store.getCameraTimeline()!;
		const edge = timeline.edges.find((candidate) => candidate.connectionId === connection.id)!;
		const mid =
			(edge.motionStartSeconds + edge.motionEndSeconds) / (2 * timeline.durationSeconds);

		expect(store.toggleCameraEdgeReverse()).toBe(true);
		expect(store.activeCameraDirection).toBe('reverse');
		expect(store.seekCameraTimeline(mid)).toBe(true);
		expect(store.activeCameraDirection).toBe('reverse');
		expect(store.cameraPreview).toMatchObject({
			kind: 'connection',
			connectionId: connection.id,
			direction: 'reverse',
			transport: 'paused'
		});

		expect(store.playActiveConnectionEdge('director')).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			direction: 'reverse',
			mode: 'director',
			transport: 'playing'
		});
		expect(store.pauseCameraPreview()).toBe(true);

		const otherEdge = timeline.edges.find(
			(candidate) => candidate.connectionId !== connection.id
		)!;
		const otherMid =
			(otherEdge.motionStartSeconds + otherEdge.motionEndSeconds) /
			(2 * timeline.durationSeconds);
		expect(store.seekCameraTimeline(otherMid)).toBe(true);
		expect(store.activeCameraConnectionId).toBe(otherEdge.connectionId);
		expect(store.activeCameraDirection).toBe(otherEdge.direction);
	});
	it('owns one view-target helper, supports world gizmo drafts, and reconciles deletion', () => {
		const store = createFixtureEditorStore();
		const connection = store.document.connections[0]!;
		store.selectionActions.selectConnection(connection.id);
		store.previewSelectedConnection('forward', 'director');
		store.setCameraPreviewPlayhead(0.5);
		store.addViewKeyframeAtPlayhead();
		store.selectedConnection!.viewTracks!.framingEnvelope = {
			forward: { enterStart: 0.1, enterEnd: 0.2, exitStart: 0.8, exitEnd: 0.9 }
		};
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
		expect(store.selectedConnection?.viewTracks).toEqual({
			forward: [],
			reverse: [],
			framingEnvelope: {
				forward: { enterStart: 0.1, enterEnd: 0.2, exitStart: 0.8, exitEnd: 0.9 }
			}
		});
		store.unregisterViewKeyframeTargetHelperRoot(
			selection.connectionId,
			selection.direction,
			selection.keyframeId,
			root
		);
	});

	it('edits node FOV once and exposes view Done as selection-only', () => {
		const store = createFixtureEditorStore();
		store.selectionActions.selectNavigationNode('tour-paris');
		const initialFov = store.selectedNavigationNode!.fov;
		expect(store.commitSelectedNodeFov(initialFov - 3)).toBe(true);
		expect(store.selectedNavigationNode?.fov).toBe(initialFov - 3);
		expect(store.commitSelectedNodeFov(121)).toBe(false);
		expect(store.undo()).toBe(true);
		expect(store.selectedNavigationNode?.fov).toBe(initialFov);

		const connection = store.document.connections[0]!;
		store.selectionActions.selectConnection(connection.id);
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


describe('MuseumEditorStore Phase 2.1 persistent camera discovery', () => {
	function importWithViewKeys() {
		const imported = cloneFixtureDocument();
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
		const store = createFixtureEditorStore();
		expect(store.activeCameraConnectionId).toBeNull();
		expect(store.activeCameraDirection).toBe('forward');
	});

	it('selects a connection, persists its direction, and remembers it after a no-op toggle', () => {
		const store = createFixtureEditorStore();
		const connectionId = store.document.connections[0]!.id;

		expect(store.selectionActions.selectConnection(connectionId)).toBe(true);
		expect(store.activeCameraConnectionId).toBe(connectionId);
		expect(store.activeCameraDirection).toBe('forward');
		expect(store.navigationSelection).toEqual({
			kind: 'connection',
			connectionId
		});
		expect(store.treeExpandedCameraConnectionIds).toContain(connectionId);
		expect(store.treeExpandedCameraDirectionKeys).toContain(
			`${connectionId}::forward`
		);

		expect(store.selectionActions.selectConnection(connectionId)).toBe(false);
		expect(store.activeCameraConnectionId).toBe(connectionId);
	});

	it('switches direction with selectCameraConnectionDirection and stays idempotent', () => {
		const store = createFixtureEditorStore();
		const connectionId = store.document.connections[0]!.id;

		expect(store.selectionActions.selectCameraConnectionDirection(connectionId, 'reverse')).toBe(true);
		expect(store.activeCameraConnectionId).toBe(connectionId);
		expect(store.activeCameraDirection).toBe('reverse');
		expect(store.treeExpandedCameraDirectionKeys).toContain(
			`${connectionId}::reverse`
		);

		expect(store.selectionActions.selectCameraConnectionDirection(connectionId, 'reverse')).toBe(false);
		expect(store.activeCameraDirection).toBe('reverse');
	});

	it('anchor selection adopts the active direction and reveals it in the tree', () => {
		const store = createFixtureEditorStore();
		const connection = store.document.connections.find(
			(candidate) => candidate.positionPath.anchors.length > 0
		)!;
		const anchor = connection.positionPath.anchors[0]!;

		expect(store.selectionActions.selectCameraConnectionDirection(connection.id, 'reverse')).toBe(true);
		expect(store.selectionActions.selectAnchor(connection.id, anchor.id)).toBe(true);
		expect(store.navigationSelection).toEqual({
			kind: 'anchor',
			connectionId: connection.id,
			anchorId: anchor.id
		});
		expect(store.activeCameraConnectionId).toBe(connection.id);
		expect(store.activeCameraDirection).toBe('reverse');
	});

	it('anchor selection defaults to forward when switching connections', () => {
		const store = createFixtureEditorStore();
		const connections = store.document.connections.filter(
			(candidate) => candidate.positionPath.anchors.length > 0
		);
		const first = connections[0]!;
		const second = connections[1]!;

		expect(store.selectionActions.selectCameraConnectionDirection(first.id, 'reverse')).toBe(true);
		expect(
			store.selectionActions.selectAnchor(second.id, second.positionPath.anchors[0]!.id)
		).toBe(true);
		expect(store.activeCameraConnectionId).toBe(second.id);
		expect(store.activeCameraDirection).toBe('forward');
		expect(store.treeExpandedCameraDirectionKeys).toContain(
			`${second.id}::forward`
		);
	});

	it('selecting a camera key establishes the persistent trio and auto-expands its direction', () => {
		const store = createFixtureEditorStore();
		expect(store.importDocument(importWithViewKeys())).toBe(true);
		const connectionId = store.document.connections[0]!.id;
		const forwardId = store.document.connections[0]!.viewTracks!.forward[0]!.id;

		expect(store.selectionActions.selectViewKeyframe(connectionId, 'forward', forwardId)).toBe(true);
		expect(store.activeCameraConnectionId).toBe(connectionId);
		expect(store.activeCameraDirection).toBe('forward');
		expect(store.treeExpandedCameraConnectionIds).toContain(connectionId);
		expect(store.treeExpandedCameraDirectionKeys).toContain(
			`${connectionId}::forward`
		);
	});

	it('Done editing view keeps the active connection and its direction', () => {
		const store = createFixtureEditorStore();
		expect(store.importDocument(importWithViewKeys())).toBe(true);
		const connectionId = store.document.connections[0]!.id;
		const reverseId = store.document.connections[0]!.viewTracks!.reverse[0]!.id;

		expect(store.selectionActions.selectViewKeyframe(connectionId, 'reverse', reverseId)).toBe(true);
		expect(store.finishViewKeyframeEditing()).toBe(true);
		expect(store.activeCameraConnectionId).toBe(connectionId);
		expect(store.activeCameraDirection).toBe('reverse');
		expect(store.navigationSelection).toEqual({
			kind: 'connection',
			connectionId
		});
	});

	it('Preview Stop preserves the active connection and direction', () => {
		const store = createFixtureEditorStore();
		expect(store.importDocument(importWithViewKeys())).toBe(true);
		const connectionId = store.document.connections[0]!.id;
		const forwardId = store.document.connections[0]!.viewTracks!.forward[0]!.id;

		expect(store.selectionActions.selectViewKeyframe(connectionId, 'forward', forwardId)).toBe(true);
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
		const store = createFixtureEditorStore();
		expect(store.importDocument(importWithViewKeys())).toBe(true);
		const connectionId = store.document.connections[0]!.id;
		const forwardId = store.document.connections[0]!.viewTracks!.forward[0]!.id;

		expect(store.selectionActions.selectViewKeyframe(connectionId, 'forward', forwardId)).toBe(true);
		expect(store.previewSelectedConnection('reverse', 'director')).toBe(true);
		expect(store.activeCameraConnectionId).toBe(connectionId);
		expect(store.activeCameraDirection).toBe('reverse');
		expect(store.treeExpandedCameraDirectionKeys).toContain(
			`${connectionId}::reverse`
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
		const store = createFixtureEditorStore();
		const connectionId = store.document.connections[0]!.id;
		expect(store.setWorkspace('camera')).toBe(true);
		expect(store.selectionActions.selectCameraConnectionDirection(connectionId, 'forward')).toBe(true);
		expect(store.isCameraKeyHelpersActive).toBe(true);

		expect(store.setWorkspace('scene')).toBe(true);
		expect(store.isCameraKeyHelpersActive).toBe(false);

		expect(store.setWorkspace('camera')).toBe(true);
		expect(store.isCameraKeyHelpersActive).toBe(true);

		expect(store.selectionActions.selectNavigationNode('tour-paris')).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'node',
			nodeId: 'tour-paris',
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
		const store = createFixtureEditorStore();
		const connectionId = store.document.connections[0]!.id;
		expect(store.toggleCameraConnectionTreeExpansion(connectionId)).toBe(true);
		expect(store.treeExpandedCameraConnectionIds).toContain(connectionId);
		expect(store.toggleCameraDirectionTreeExpansion(connectionId, 'reverse')).toBe(
			true
		);
		expect(store.treeExpandedCameraDirectionKeys).toContain(
			`${connectionId}::reverse`
		);
		expect(store.toggleCameraConnectionTreeExpansion(connectionId)).toBe(true);
		expect(store.treeExpandedCameraConnectionIds).not.toContain(connectionId);
		expect(store.toggleCameraDirectionTreeExpansion(connectionId, 'reverse')).toBe(
			true
		);
		expect(store.treeExpandedCameraDirectionKeys).not.toContain(
			`${connectionId}::reverse`
		);
	});

	it('selecting a node or placement clears the active connection discovery', () => {
		const store = createFixtureEditorStore();
		const connectionId = store.document.connections[0]!.id;
		const placement = store.document.entities[0]!;

		store.selectionActions.selectCameraConnectionDirection(connectionId, 'reverse');
		expect(store.activeCameraConnectionId).toBe(connectionId);

		expect(store.selectionActions.selectNavigationNode('tour-paris')).toBe(true);
		expect(store.activeCameraConnectionId).toBeNull();
		expect(store.activeCameraDirection).toBe('forward');

		store.selectionActions.selectCameraConnectionDirection(connectionId, 'forward');
		store.selectionActions.selectRoom('paris');
		expect(store.selectionActions.selectPlacement(placement.id)).toBe(true);
		expect(store.activeCameraConnectionId).toBeNull();
		expect(store.selectionActions.deselect()).toBe(true);
		expect(store.activeCameraConnectionId).toBeNull();
	});
});

describe('MuseumEditorStore Phase 2.2 timeline selection and scrub', () => {
	function importWithDirectionalKeys() {
		const imported = cloneFixtureDocument();
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
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		const before = store.canonicalJson;
		const timeline = store.getCameraTimeline()!;
		const progress = 0.27;

		expect(store.seekCameraTimeline(progress)).toBe(true);
		const seconds = progress * timeline.durationSeconds;
		const edge = timeline.edges.find(
			(candidate) => seconds < candidate.motionEndSeconds
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
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		const timeline = store.getCameraTimeline()!;
		const firstEdge = timeline.edges[0]!;
		const secondEdge = timeline.edges[1]!;

		expect(store.seekCameraTimeline(firstEdge.motionStartSeconds / timeline.durationSeconds + 0.01)).toBe(true);
		expect(store.toggleCameraPreviewFollow()).toBe(true);
		expect(store.cameraPreviewFollowEnabled).toBe(false);
		const recenterVersion = store.cameraPreviewRecenterVersion;
		const nextProgress =
			(secondEdge.motionStartSeconds + secondEdge.motionDurationSeconds * 0.35) /
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
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		const timeline = store.getCameraTimeline()!;
		const firstProgress =
			(timeline.edges[0]!.motionStartSeconds + timeline.edges[0]!.motionDurationSeconds * 0.2) /
			timeline.durationSeconds;
		const secondProgress =
			(timeline.edges[1]!.motionStartSeconds + timeline.edges[1]!.motionDurationSeconds * 0.4) /
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
		const store = createFixtureEditorStore();
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
			nodeId: 'tour-a',
			handle: 'position'
		});
		expect(store.cameraPreview).toMatchObject({
			kind: 'node',
			nodeId: 'tour-a',
			mode: 'director'
		});
	});

	it('selects and samples reverse framing keys at exact edge-local progress', () => {
		const store = createFixtureEditorStore();
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
			edge.motionEndSeconds / timeline.durationSeconds
		);
	});

	it('steps through visible camera keys and guided node boundaries', () => {
		const store = createFixtureEditorStore();
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
			nodeId: 'tour-b'
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
		const store = createFixtureEditorStore();
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
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		const before = store.canonicalJson;

		expect(store.previewGuidedTour()).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'tour',
			startNodeId: 'tour-a',
			mode: 'visitor',
			transport: 'playing',
			playhead: 0
		});
		const runId = store.cameraPreview!.runId;
		expect(store.getCapturedCameraPreviewRoute(runId)).toBeNull();
		const timeline = store.getCameraTimeline()!;
		expect(timeline.nodeBoundaries[0]!.nodeId).toBe('tour-a');
		expect(timeline.nodeBoundaries.at(-1)!.nodeId).toBe('tour-a');
		expect(timeline.edges).toHaveLength(4);
		expect(new Set(timeline.edges.map((edge) => edge.connectionId)).size).toBe(4);

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
		const store = createFixtureEditorStore();
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
		const store = createFixtureEditorStore();
		const poland = store.state.graph.nodeById.get('tour-b')!;
		poland.previousNodeId = 'tour-d';

		expect(store.previewGuidedTour()).toBe(false);
		expect(store.cameraPreview).toBeNull();
		expect(store.statusMessage).toMatch(/not reciprocal/);
	});
});

describe('MuseumEditorStore Phase 3.1 selection and primary Play parity', () => {
	it('seeks Camera-workspace node selection, hard-recenters on identity, and ignores re-clicks', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		const timeline = store.getCameraTimeline()!;

		expect(store.selectionActions.selectNavigationNode('tour-paris')).toBe(true);
		const boundary = timeline.nodeBoundaries
			.filter((candidate) => candidate.nodeId === 'tour-paris')
			.reduce((nearest, candidate) =>
				Math.abs(candidate.progress) < Math.abs(nearest.progress)
					? candidate
					: nearest
			);
		expect(store.cameraTimelinePlayhead).toBe(boundary.progress);
		expect(store.cameraPreview).toMatchObject({
			kind: 'node',
			nodeId: 'tour-paris',
			mode: 'director',
			transport: 'paused'
		});
		expect(store.cameraFocusKind).toBeNull();
		const runId = store.cameraPreview!.runId;
		const recenterVersion = store.cameraPreviewRecenterVersion;

		expect(store.selectionActions.selectNavigationNode('tour-paris')).toBe(false);
		expect(store.cameraPreview!.runId).toBe(runId);
		expect(store.cameraPreviewRecenterVersion).toBe(recenterVersion);

		expect(store.selectionActions.selectNavigationNode('tour-d')).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'node',
			nodeId: 'tour-d',
			mode: 'director',
			transport: 'paused'
		});
		expect(store.cameraPreviewRecenterVersion).toBe(recenterVersion + 1);
	});

	it('seeks connection starts and hard-recenters only when connection identity changes', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		const connection = store.document.connections[0]!;

		expect(
			store.selectionActions.selectCameraConnectionDirection(connection.id, 'forward')
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
			store.selectionActions.selectCameraConnectionDirection(connection.id, 'forward')
		).toBe(false);
		expect(store.cameraPreview!.runId).toBe(runId);
		expect(store.cameraPreviewRecenterVersion).toBe(recenterVersion);

		expect(
			store.selectionActions.selectCameraConnectionDirection(connection.id, 'reverse')
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
		const edgeMiddle = (edge.motionStartSeconds + edge.motionEndSeconds) /
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
				otherEdge.direction,    otherEdge.motionStartSeconds / timeline.durationSeconds
			)
		).toBe(true);
		expect(store.cameraPreviewRecenterVersion).toBe(directionRecenterVersion + 1);

		store.stopCameraPreview();
		expect(store.focusNavigationNode('tour-paris')).toBe(true);
		expect(store.cameraFocusKind).toBe('navigation-node');
		expect(
			store.selectionActions.selectCameraConnectionDirection(connection.id, 'forward')
		).toBe(true);
		expect(store.cameraFocusKind).toBeNull();
	});

	it('promotes paused selection and stopped playheads into the whole tour without resetting', () => {
		const store = createFixtureEditorStore();
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
		const store = createFixtureEditorStore();
		expect(store.importDocument(importWithDragKeys())).toBe(true);
		store.setWorkspace('camera');
		const selection = firstForwardSelection(store);
		const keyframe = store.document.connections[0]!.viewTracks!.forward[0]!;
		const positionPathBefore = JSON.stringify(store.document.connections[0]!.positionPath);
		const targetBefore = [...keyframe.cameraTarget];
		const fovBefore = keyframe.fov;

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
		const forward = store.selectedConnection!.viewTracks!.forward;
		const reverse = store.selectedConnection!.viewTracks!.reverse;
		expect(reverse).toHaveLength(forward.length);
		expect(reverse.map((keyframe) => keyframe.progress)).toEqual(
			[...forward].reverse().map((keyframe) => 1 - keyframe.progress)
		);
		expect(reverse.map((keyframe) => keyframe.cameraTarget)).toEqual(
			[...forward].reverse().map((keyframe) => [...keyframe.cameraTarget])
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
			const store = createFixtureEditorStore();
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
		const store = createFixtureEditorStore();
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
		const store = createFixtureEditorStore();
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

describe('MuseumEditorStore Phase 3.4 guided-order editing', () => {
	const checkedInOrder = [...FIXTURE_GUIDED_ORDER];

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
		const document = cloneFixtureDocument();
		const template = document.navigationNodes.find((node) => node.id === 'tour-paris')!;
		document.navigationNodes.push({
			...template,
			id: 'free-tour-node',
			label: 'Free Tour Node',
			connectedNodeIds: []
		});
		const free = document.navigationNodes.at(-1)!;
		delete free.nextNodeId;
		delete free.previousNodeId;
		addDocumentConnection(document, 'tour-b', free.id, 'tour-b-free-tour');
		addDocumentConnection(document, free.id, 'tour-paris', 'free-tour-paris');
		return document;
	}

	it('exposes the reciprocal display order pinned to tour-a', () => {
		const store = createFixtureEditorStore();
		expect(store.guidedTourNodeIds).toEqual(checkedInOrder);
	});

	it('rewrites one complete reciprocal cycle in one undoable transaction', () => {
		const document = cloneFixtureDocument();
		addDocumentConnection(document, 'tour-a', 'tour-paris', 'tour-a-paris');
		addDocumentConnection(document, 'tour-b', 'tour-d', 'tour-b-d');
		const store = createFixtureEditorStore();
		expect(store.importDocument(document)).toBe(true);
		const reordered = ['tour-a', 'tour-paris', 'tour-b', 'tour-d'];
		const historyBefore = store.historyVersion;

		expect(store.setGuidedTourOrder(reordered)).toBe(true);
		expect(store.guidedTourNodeIds).toEqual(reordered);
		expect(store.historyVersion).toBe(historyBefore + 1);
		for (const [index, nodeId] of reordered.entries()) {
			const node = store.document.navigationNodes.find(
				(candidate) => candidate.id === nodeId
			)!;
			const expectedPrev =
				index === 0 ? undefined : reordered[index - 1];
			const expectedNext =
				index === reordered.length - 1
					? undefined
					: reordered[index + 1];
			expect(node.previousNodeId).toBe(expectedPrev);
			expect(node.nextNodeId).toBe(expectedNext);
		}
		expect(store.validation.success).toBe(true);

		expect(store.undo()).toBe(true);
		expect(store.guidedTourNodeIds).toEqual(checkedInOrder);
	});

	it('rejects invalid reorder without mutation, history, or auto-created edges', () => {
		const store = createFixtureEditorStore();
		const before = store.canonicalJson;
		const connectionCount = store.document.connections.length;
		const invalid = ['tour-a', 'tour-paris', 'tour-b', 'tour-d'];

		expect(store.setGuidedTourOrder(invalid)).toBe(false);
		expect(store.statusMessage).toContain('Missing transition');
		expect(store.canonicalJson).toBe(before);
		expect(store.document.connections).toHaveLength(connectionCount);
		expect(store.canUndo).toBe(false);
		expect(store.setGuidedTourOrder(checkedInOrder)).toBe(true);
		const afterNormalize = store.canonicalJson;
		expect(store.setGuidedTourOrder(checkedInOrder)).toBe(false);
		expect(store.canonicalJson).toBe(afterNormalize);
	});

	it('inserts and removes a free node while retaining all graph connections', () => {
		const store = createFixtureEditorStore();
		expect(store.importDocument(documentWithFreeInsertableNode())).toBe(true);
		const connectionIds = store.document.connections.map((connection) => connection.id);
		const historyBefore = store.historyVersion;

		expect(store.insertNodeIntoGuidedTour('free-tour-node', 2)).toBe(true);
		expect(store.guidedTourNodeIds).toEqual([
			'tour-a',
			'tour-b',
			'free-tour-node',
			'tour-paris',
			'tour-d'
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
		const rejected = createFixtureEditorStore();
		expect(rejected.removeNodeFromGuidedTour('tour-b')).toBe(false);
		expect(rejected.statusMessage).toContain('Missing transition');
		expect(rejected.removeNodeFromGuidedTour('tour-a')).toBe(false);
		expect(rejected.statusMessage).toContain('display start is pinned');
		expect(rejected.canUndo).toBe(false);

		const document = cloneFixtureDocument();
		addDocumentConnection(document, 'tour-a', 'tour-paris', 'tour-a-paris');
		const store = createFixtureEditorStore();
		expect(store.importDocument(document)).toBe(true);
		expect(store.removeNodeFromGuidedTour('tour-b')).toBe(true);
		const middle = store.document.navigationNodes.find((node) => node.id === 'tour-b')!;
		expect(middle.nextNodeId).toBeUndefined();
		expect(middle.previousNodeId).toBeUndefined();
		expect(store.document.connections.some((edge) => edge.id === 'tour-a-b')).toBe(true);
		expect(store.validation.success).toBe(true);
	});

	it('blocks guided-order writes during interaction, playback, and pending commands', () => {
		const store = createFixtureEditorStore();
		const before = store.canonicalJson;
		expect(store.beginDocumentTransaction()).toBe(true);
		store.setTransformInteractionActive(true, 'camera');
		expect(store.setGuidedTourOrder(checkedInOrder)).toBe(false);
		expect(store.statusMessage).toContain('active editor interaction');
		store.setTransformInteractionActive(false);
		expect(store.cancelDocumentTransaction()).toBe(true);

		store.selectionActions.selectNavigationNode('tour-paris');
		expect(store.previewSelectedNode('visitor')).toBe(true);
		expect(store.removeNodeFromGuidedTour('tour-paris')).toBe(false);
		expect(store.statusMessage).toContain('active camera playback');
		expect(store.stopCameraPreview()).toBe(true);

		expect(store.beginCameraPlacement()).toBe(true);
		expect(store.setGuidedTourOrder(checkedInOrder)).toBe(false);
		expect(store.statusMessage).toContain('Finish or cancel');
		expect(store.canonicalJson).toBe(before);
		expect(store.canUndo).toBe(false);
	});
});

describe('MuseumEditorStore S10.2 camera-flow mutations', () => {
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

	function addFreeNode(
		document: MuseumSceneDocument,
		id: string
	): SceneNavigationNode {
		const node: SceneNavigationNode = {
			id,
			roomId: 'paris',
			label: id,
			position: [0, 1.65, 0],
			cameraTarget: [0, 1.25, -3],
			fov: 54,
			connectedNodeIds: []
		};
		document.navigationNodes.push(node);
		return node;
	}

	function hasConnection(
		document: MuseumSceneDocument,
		fromNodeId: string,
		toNodeId: string
	) {
		return document.connections.some(
			(connection) =>
				(connection.fromNodeId === fromNodeId && connection.toNodeId === toNodeId) ||
				(connection.fromNodeId === toNodeId && connection.toNodeId === fromNodeId)
		);
	}

	it('seeds an open two-node pair (head→tail, no wraparound) and unlocks preview', () => {
		const blank = cloneFixtureDocument();
		blank.navigationNodes = [];
		blank.connections = [];
		const store = createFixtureEditorStore();
		expect(store.importDocument(blank)).toBe(true);
		expect(store.canStartTourPreview).toBe(false);

		const roomId = store.rooms.entries[0]!.id;
		expect(store.beginCameraPlacement()).toBe(true);
		const firstNodeId = store.createPendingNavigationNodeAt(
			roomId,
			store.rooms.point(roomId, [0, 0, 0]),
			[0, 0, -1]
		)!;
		expect(store.beginCameraPlacement()).toBe(true);
		const secondNodeId = store.createPendingNavigationNodeAt(
			roomId,
			store.rooms.point(roomId, [1, 0, 1]),
			[0, 0, -1]
		)!;
		// B0 — both nodes are committed free nodes; connecting the pair seeds
		// the open flow source → destination in one transaction.
		expect(store.selectionActions.selectNavigationNode(firstNodeId)).toBe(true);
		expect(store.beginConnectExistingNodes()).toBe(true);
		expect(store.selectionActions.selectNavigationNode(secondNodeId)).toBe(true);

		const first = store.document.navigationNodes.find(
			(node) => node.id === firstNodeId
		)!;
		const second = store.document.navigationNodes.find(
			(node) => node.id === secondNodeId
		)!;
		// Open pair 1 → 2: the head keeps no previous, the tail keeps no next.
		expect(first.nextNodeId).toBe(second.id);
		expect(first.previousNodeId).toBeUndefined();
		expect(second.previousNodeId).toBe(first.id);
		expect(second.nextNodeId).toBeUndefined();
		expect(store.guidedTourNodeIds).toEqual([firstNodeId, secondNodeId]);
		expect(store.canStartTourPreview).toBe(true);
		expect(store.statusMessage).toContain('two-node camera flow');
		expect(store.validation.success).toBe(true);
	});

	it('appending to a two-node pair never announces a loop-off', () => {
		const store = createFixtureEditorStore();
		expect(store.guidedTourNodeIds).toEqual([...FIXTURE_GUIDED_ORDER]);
		// Shrink the flow to an open pair tour-a → tour-b (keep one edge; the
		// pair's only record is also its chain transition, so it never loops).
		const pairDocument = cloneFixtureDocument();
		pairDocument.navigationNodes = pairDocument.navigationNodes
			.filter((node) => node.id === 'tour-a' || node.id === 'tour-b')
			.map((node) => {
				const copy = { ...node, connectedNodeIds: [] as string[] };
				delete copy.nextNodeId;
				delete copy.previousNodeId;
				return copy;
			});
		const pairA = pairDocument.navigationNodes.find((node) => node.id === 'tour-a')!;
		const pairB = pairDocument.navigationNodes.find((node) => node.id === 'tour-b')!;
		pairA.nextNodeId = pairB.id;
		pairB.previousNodeId = pairA.id;
		pairDocument.connections = [];
		addDocumentConnection(pairDocument, 'tour-a', 'tour-b', 'tour-a-tour-b');
		addFreeNode(pairDocument, 'free-3');
		addDocumentConnection(pairDocument, 'tour-b', 'free-3', 'tour-b-free-3');
		// B0 — the append-on-connect flow is now the frozen relic path.
		const pairStore = createRelicFixtureEditorStore();
		expect(pairStore.importDocument(pairDocument)).toBe(true);
		expect(pairStore.validation.success).toBe(true);

		// Append a third node to the pair tail: no loop was on, so the plain
		// append microcopy applies — never the loop-off announcement.
		expect(pairStore.beginCameraPlacement()).toBe(true);
		const pendingId = pairStore.createPendingNavigationNodeAt(
			'legacy',
			[0, 0, 0],
			[0, 0, -1]
		)!;
		expect(pendingId).toBeTruthy();
		expect(pairStore.connectPendingNavigationNode('tour-b')).toBe(true);
		expect(pairStore.statusMessage).toContain('the path now ends at');
		expect(pairStore.statusMessage).not.toContain('is now the end of the tour');
		expect(pairStore.validation.success).toBe(true);
	});

	it('appends a placed node to the flow tail and keeps a mid-route connection free', () => {
		// B0 — the append-on-connect convenience is now the frozen relic path.
		const store = createRelicFixtureEditorStore();
		const historyBefore = store.historyVersion;
		expect(store.guidedTourNodeIds).toEqual([...FIXTURE_GUIDED_ORDER]);

		// Connecting the new node to the tail appends it to the flow.
		expect(store.beginCameraPlacement()).toBe(true);
		const tailId = store.createPendingNavigationNodeAt(
			'legacy',
			roomPoint('legacy', [2, 0, 2]),
			[0, 0, -1]
		)!;
		expect(store.connectPendingNavigationNode('tour-d')).toBe(true);
		const tail = store.document.navigationNodes.find((node) => node.id === 'tour-d')!;
		const appended = store.document.navigationNodes.find(
			(node) => node.id === tailId
		)!;
		expect(tail.nextNodeId).toBe(appended.id);
		expect(appended.previousNodeId).toBe('tour-d');
		expect(appended.nextNodeId).toBeUndefined();
		// The fixture is a legacy closed cycle (tour-d → tour-a record exists),
		// so appending announces the loop-off transition per the microcopy
		// contract — never silent.
		expect(store.statusMessage).toContain('is now the end of the tour');
		expect(store.statusMessage).toContain('inactive');
		expect(store.statusMessage).toContain('to loop');
		expect(store.historyVersion).toBe(historyBefore + 1);
		expect(store.validation.success).toBe(true);

		// Connecting a further node to a mid-route node keeps it free.
		expect(store.beginCameraPlacement()).toBe(true);
		const freeId = store.createPendingNavigationNodeAt(
			'legacy',
			roomPoint('legacy', [3, 0, 3]),
			[0, 0, -1]
		)!;
		expect(store.connectPendingNavigationNode('tour-b')).toBe(true);
		const free = store.document.navigationNodes.find((node) => node.id === freeId)!;
		expect(free.nextNodeId).toBeUndefined();
		expect(free.previousNodeId).toBeUndefined();
		expect(store.guidedTourNodeIds).toEqual([...FIXTURE_GUIDED_ORDER, tailId]);
	});

	it('inserts a free node with at most one auto-created edge and announces it', () => {
		const document = cloneFixtureDocument();
		addFreeNode(document, 'free-node');
		addDocumentConnection(document, 'tour-paris', 'free-node', 'tour-paris-free');
		const store = createFixtureEditorStore();
		expect(store.importDocument(document)).toBe(true);
		const historyBefore = store.historyVersion;

		expect(store.insertNodeIntoGuidedTour('free-node', 2)).toBe(true);
		const node = store.document.navigationNodes.find(
			(candidate) => candidate.id === 'free-node'
		)!;
		expect(node.previousNodeId).toBe('tour-b');
		expect(node.nextNodeId).toBe('tour-paris');
		// The one missing edge (tour-b → free-node) was auto-created in the
		// same transaction.
		expect(hasConnection(store.document, 'tour-b', 'free-node')).toBe(true);
		// The pre-existing tour-paris edge is retained, never auto-deleted.
		expect(hasConnection(store.document, 'tour-paris', 'free-node')).toBe(true);
		expect(store.statusMessage).toContain('created the missing transition');
		expect(store.historyVersion).toBe(historyBefore + 1);
		expect(store.validation.success).toBe(true);

		expect(store.undo()).toBe(true);
		const undone = store.document.navigationNodes.find(
			(candidate) => candidate.id === 'free-node'
		)!;
		expect(undone.nextNodeId).toBeUndefined();
		expect(undone.previousNodeId).toBeUndefined();
		expect(store.document.connections).toHaveLength(document.connections.length);
	});

	it('removes a node from the flow with free-node microcopy and rejects missing bridges', () => {
		const rejected = createFixtureEditorStore();
		expect(rejected.removeNodeFromGuidedTour('tour-b')).toBe(false);
		expect(rejected.statusMessage).toContain('connect them first');
		expect(rejected.canUndo).toBe(false);

		const document = cloneFixtureDocument();
		addDocumentConnection(document, 'tour-a', 'tour-paris', 'tour-a-paris');
		const store = createFixtureEditorStore();
		expect(store.importDocument(document)).toBe(true);
		expect(store.removeNodeFromGuidedTour('tour-b')).toBe(true);
		const middle = store.document.navigationNodes.find(
			(node) => node.id === 'tour-b'
		)!;
		expect(middle.nextNodeId).toBeUndefined();
		expect(middle.previousNodeId).toBeUndefined();
		expect(store.statusMessage).toContain('is now a free node');
		expect(store.guidedTourNodeIds).toEqual(['tour-a', 'tour-paris', 'tour-d']);
		expect(store.validation.success).toBe(true);
	});

	it('rewrites the order into an open chain and rejects missing-edge reorders strictly', () => {
		// Strict reject: a consecutive pair without an edge refuses before any
		// mutation (only the a–paris chord is present; b–d is missing).
		const rejected = createFixtureEditorStore();
		const rejectedDocument = cloneFixtureDocument();
		addDocumentConnection(rejectedDocument, 'tour-a', 'tour-paris', 'tour-a-paris');
		expect(rejected.importDocument(rejectedDocument)).toBe(true);
		const before = rejected.canonicalJson;
		expect(
			rejected.setGuidedTourOrder(['tour-a', 'tour-paris', 'tour-b', 'tour-d'])
		).toBe(false);
		expect(rejected.statusMessage).toContain('connect them first');
		expect(rejected.canonicalJson).toBe(before);
		expect(rejected.canUndo).toBe(false);

		// With both chords present the reorder commits as one open-chain
		// rewrite: head keeps no previous, tail keeps no next.
		const document = cloneFixtureDocument();
		addDocumentConnection(document, 'tour-a', 'tour-paris', 'tour-a-paris');
		addDocumentConnection(document, 'tour-b', 'tour-d', 'tour-b-d');
		const store = createFixtureEditorStore();
		expect(store.importDocument(document)).toBe(true);
		const historyBefore = store.historyVersion;
		expect(
			store.setGuidedTourOrder(['tour-a', 'tour-paris', 'tour-b', 'tour-d'])
		).toBe(true);
		const tourA = store.document.navigationNodes.find((node) => node.id === 'tour-a')!;
		const tourD = store.document.navigationNodes.find((node) => node.id === 'tour-d')!;
		expect(tourA.previousNodeId).toBeUndefined();
		expect(tourA.nextNodeId).toBe('tour-paris');
		expect(tourD.previousNodeId).toBe('tour-b');
		expect(tourD.nextNodeId).toBeUndefined();
		expect(store.guidedTourNodeIds).toEqual(['tour-a', 'tour-paris', 'tour-b', 'tour-d']);
		expect(store.historyVersion).toBe(historyBefore + 1);
		expect(store.validation.success).toBe(true);
	});

	it('adds, appends, and removes a detour with F5 return edges and strict splices', () => {
		// Free nodes need an edge to keep the navigation graph connected
		// (codec rule); chain edges are authored, the F5 return edges are not.
		const document = cloneFixtureDocument();
		addFreeNode(document, 'detour-1');
		addFreeNode(document, 'detour-2');
		addFreeNode(document, 'detour-3');
		addDocumentConnection(document, 'tour-b', 'detour-1', 'tour-b-detour-1');
		addDocumentConnection(document, 'detour-1', 'detour-2', 'detour-1-detour-2');
		addDocumentConnection(document, 'detour-2', 'detour-3', 'detour-2-detour-3');
		const store = createFixtureEditorStore();
		expect(store.importDocument(document)).toBe(true);
		const historyBefore = store.historyVersion;

		// Add detour at tour-b with a fully free node: origin–head edge
		// auto-created (F5, one-node detour needs no extra return edge).
		expect(store.addDetourNode('tour-b', 'detour-1')).toBe(true);
		let detour1 = store.document.navigationNodes.find(
			(node) => node.id === 'detour-1'
		)!;
		expect(detour1.detourOfNodeId).toBe('tour-b');
		expect(hasConnection(store.document, 'tour-b', 'detour-1')).toBe(true);
		expect(store.statusMessage).toContain('Detour added at');
		expect(store.guidedTourNodeIds).toEqual([...FIXTURE_GUIDED_ORDER]);
		expect(store.historyVersion).toBe(historyBefore + 1);
		expect(store.validation.success).toBe(true);

		// Append: the chain edge detour-1–detour-2 exists already; the F5
		// return edge detour-2–tour-b is auto-created once.
		expect(store.appendDetourNode('tour-b', 'detour-2')).toBe(true);
		detour1 = store.document.navigationNodes.find((node) => node.id === 'detour-1')!;
		const detour2 = store.document.navigationNodes.find(
			(node) => node.id === 'detour-2'
		)!;
		expect(detour1.nextNodeId).toBe('detour-2');
		expect(detour2.previousNodeId).toBe('detour-1');
		expect(detour2.detourOfNodeId).toBeUndefined();
		expect(hasConnection(store.document, 'detour-1', 'detour-2')).toBe(true);
		expect(hasConnection(store.document, 'detour-2', 'tour-b')).toBe(true);
		expect(store.validation.success).toBe(true);

		// The detour return edge is flow-critical: connection deletion refuses.
		const returnEdge = store.document.connections.find(
			(connection) =>
				(connection.fromNodeId === 'detour-2' && connection.toNodeId === 'tour-b') ||
				(connection.fromNodeId === 'tour-b' && connection.toNodeId === 'detour-2')
		)!;
		expect(store.deleteConnection(returnEdge.id)).toBe(false);
		expect(store.statusMessage).toContain('returns a detour');

		// Strict T9: removing the middle node needs a direct detour-1–detour-3
		// edge; the mutator rejects without mutation.
		expect(store.appendDetourNode('tour-b', 'detour-3')).toBe(true);
		const before = store.canonicalJson;
		expect(store.removeDetourNode('tour-b', 'detour-2')).toBe(false);
		expect(store.statusMessage).toContain('connect them first');
		expect(store.canonicalJson).toBe(before);

		// Head removal transfers the origin marker to the new head.
		expect(store.removeDetourNode('tour-b', 'detour-1')).toBe(true);
		const newHead = store.document.navigationNodes.find(
			(node) => node.id === 'detour-2'
		)!;
		expect(newHead.detourOfNodeId).toBe('tour-b');
		expect(newHead.previousNodeId).toBeUndefined();
		const removedHead = store.document.navigationNodes.find(
			(node) => node.id === 'detour-1'
		)!;
		expect(removedHead.nextNodeId).toBeUndefined();
		expect(removedHead.previousNodeId).toBeUndefined();
		expect(removedHead.detourOfNodeId).toBeUndefined();
		expect(store.statusMessage).toContain('kept as free');
		expect(store.validation.success).toBe(true);

		// Whole-detour removal clears the marker and links; edges stay authored.
		expect(store.removeDetour('tour-b')).toBe(true);
		expect(newHead.detourOfNodeId).toBeUndefined();
		expect(hasConnection(store.document, 'detour-2', 'tour-b')).toBe(true);
		expect(store.statusMessage).toContain('Removed the detour at');
		expect(store.validation.success).toBe(true);
	});

	it('keeps detour chain links intact across main-flow order ops', () => {
		const document = cloneFixtureDocument();
		addFreeNode(document, 'detour-1');
		addFreeNode(document, 'detour-2');
		addDocumentConnection(document, 'tour-b', 'detour-1', 'tour-b-detour-1');
		addDocumentConnection(document, 'detour-1', 'detour-2', 'detour-1-detour-2');
		const store = createFixtureEditorStore();
		expect(store.importDocument(document)).toBe(true);
		expect(store.addDetourNode('tour-b', 'detour-1')).toBe(true);
		expect(store.appendDetourNode('tour-b', 'detour-2')).toBe(true);

		// Removing a main-route tail node must not wipe detour order links.
		expect(store.removeNodeFromGuidedTour('tour-d')).toBe(true);
		const detour1 = store.document.navigationNodes.find((node) => node.id === 'detour-1')!;
		const detour2 = store.document.navigationNodes.find((node) => node.id === 'detour-2')!;
		expect(detour1.nextNodeId).toBe('detour-2');
		expect(detour2.previousNodeId).toBe('detour-1');
		expect(detour1.detourOfNodeId).toBe('tour-b');
		expect(store.validation.success).toBe(true);

		// Inserting a free node into the main route likewise leaves the detour.
		const second = cloneFixtureDocument();
		addFreeNode(second, 'detour-1');
		addFreeNode(second, 'detour-2');
		addFreeNode(second, 'free-insert');
		addDocumentConnection(second, 'tour-b', 'detour-1', 'tour-b-detour-1');
		addDocumentConnection(second, 'detour-1', 'detour-2', 'detour-1-detour-2');
		addDocumentConnection(second, 'tour-a', 'free-insert', 'tour-a-free-insert');
		addDocumentConnection(second, 'free-insert', 'tour-b', 'free-insert-tour-b');
		const insertStore = createFixtureEditorStore();
		expect(insertStore.importDocument(second)).toBe(true);
		expect(insertStore.addDetourNode('tour-b', 'detour-1')).toBe(true);
		expect(insertStore.appendDetourNode('tour-b', 'detour-2')).toBe(true);
		expect(insertStore.insertNodeIntoGuidedTour('free-insert', 1)).toBe(true);
		const kept1 = insertStore.document.navigationNodes.find((node) => node.id === 'detour-1')!;
		const kept2 = insertStore.document.navigationNodes.find((node) => node.id === 'detour-2')!;
		expect(kept1.nextNodeId).toBe('detour-2');
		expect(kept2.previousNodeId).toBe('detour-1');
		expect(kept1.detourOfNodeId).toBe('tour-b');
		expect(insertStore.validation.success).toBe(true);
	});

	it('deletes a whole detour when its origin or head is deleted', () => {
		const document = cloneFixtureDocument();
		addDocumentConnection(document, 'tour-a', 'tour-paris', 'tour-a-paris');
		addFreeNode(document, 'detour-1');
		addFreeNode(document, 'detour-2');
		addDocumentConnection(document, 'tour-b', 'detour-1', 'tour-b-detour-1');
		addDocumentConnection(document, 'detour-1', 'detour-2', 'detour-1-detour-2');
		const store = createFixtureEditorStore();
		expect(store.importDocument(document)).toBe(true);
		expect(store.addDetourNode('tour-b', 'detour-1')).toBe(true);
		expect(store.appendDetourNode('tour-b', 'detour-2')).toBe(true);

		// Deleting the origin deletes the whole detour in one transaction.
		const historyBefore = store.historyVersion;
		expect(store.deleteNavigationNode('tour-b')).toBe(true);
		expect(store.statusMessage).toContain('and the detour at');
		expect(
			store.document.navigationNodes.some(
				(node) => node.id === 'detour-1' || node.id === 'detour-2'
			)
		).toBe(false);
		expect(store.historyVersion).toBe(historyBefore + 1);
		expect(store.validation.success).toBe(true);

		// Orphaned head deletion: deleting the head removes the whole chain.
		const second = cloneFixtureDocument();
		addFreeNode(second, 'detour-3');
		addFreeNode(second, 'detour-4');
		addDocumentConnection(second, 'tour-b', 'detour-3', 'tour-b-detour-3');
		addDocumentConnection(second, 'detour-3', 'detour-4', 'detour-3-detour-4');
		const headStore = createFixtureEditorStore();
		expect(headStore.importDocument(second)).toBe(true);
		expect(headStore.addDetourNode('tour-b', 'detour-3')).toBe(true);
		expect(headStore.appendDetourNode('tour-b', 'detour-4')).toBe(true);
		expect(headStore.deleteNavigationNode('detour-3')).toBe(true);
		expect(headStore.statusMessage).toContain('and the detour at Tour B');
		expect(
			headStore.document.navigationNodes.some(
				(node) => node.id === 'detour-3' || node.id === 'detour-4'
			)
		).toBe(false);
		expect(headStore.validation.success).toBe(true);
	});

	it('preserves detour chains across main-flow remove and reorder', () => {
		const document = cloneFixtureDocument();
		addFreeNode(document, 'detour-1');
		addFreeNode(document, 'detour-2');
		addDocumentConnection(document, 'tour-b', 'detour-1', 'tour-b-detour-1');
		addDocumentConnection(document, 'detour-1', 'detour-2', 'detour-1-detour-2');
		// A direct a–paris edge so the reorder below stays T9-valid.
		addDocumentConnection(document, 'tour-a', 'tour-paris', 'tour-a-paris');
		const store = createFixtureEditorStore();
		expect(store.importDocument(document)).toBe(true);
		expect(store.addDetourNode('tour-b', 'detour-1')).toBe(true);
		expect(store.appendDetourNode('tour-b', 'detour-2')).toBe(true);

		// Remove a main-flow node: the detour chain links must survive the
		// main-flow order rewrite (order rewrites are main-component scoped;
		// detour order links are separate components).
		expect(store.removeNodeFromGuidedTour('tour-d')).toBe(true);
		let detour1 = store.document.navigationNodes.find((node) => node.id === 'detour-1')!;
		let detour2 = store.document.navigationNodes.find((node) => node.id === 'detour-2')!;
		expect(detour1.nextNodeId).toBe('detour-2');
		expect(detour2.previousNodeId).toBe('detour-1');
		expect(detour1.detourOfNodeId).toBe('tour-b');
		expect(store.validation.success).toBe(true);

		// Reorder the main flow: the detour still survives.
		expect(store.setGuidedTourOrder(['tour-a', 'tour-paris', 'tour-b'])).toBe(true);
		detour1 = store.document.navigationNodes.find((node) => node.id === 'detour-1')!;
		detour2 = store.document.navigationNodes.find((node) => node.id === 'detour-2')!;
		expect(detour1.nextNodeId).toBe('detour-2');
		expect(detour2.previousNodeId).toBe('detour-1');
		expect(detour1.detourOfNodeId).toBe('tour-b');
		expect(store.validation.success).toBe(true);
	});

	it('refuses to splice a detour node into the main flow', () => {
		const document = cloneFixtureDocument();
		addFreeNode(document, 'detour-1');
		addFreeNode(document, 'detour-2');
		addDocumentConnection(document, 'tour-b', 'detour-1', 'tour-b-detour-1');
		addDocumentConnection(document, 'detour-1', 'detour-2', 'detour-1-detour-2');
		const store = createFixtureEditorStore();
		expect(store.importDocument(document)).toBe(true);
		expect(store.addDetourNode('tour-b', 'detour-1')).toBe(true);
		expect(store.appendDetourNode('tour-b', 'detour-2')).toBe(true);

		// The detour head is not a free node: main-flow insertion must reject
		// (remove-from-detour + insert-into-main is a separate combined op).
		const before = store.canonicalJson;
		expect(store.insertNodeIntoGuidedTour('detour-1', 1)).toBe(false);
		expect(store.statusMessage).toContain('remove it from the detour first');
		expect(store.canonicalJson).toBe(before);

		// A detour interior node is likewise refused by the drag-drop path.
		expect(store.timelineDragConnectNode('detour-2', 'tour-b', 'tour-paris')).toBe(false);
		expect(store.statusMessage).toContain('remove it from the detour first');
		expect(store.canonicalJson).toBe(before);
		expect(store.validation.success).toBe(true);
	});
});

describe('MuseumEditorStore Phase 3.5 timeline drag-connect', () => {
	const checkedInOrder = [...FIXTURE_GUIDED_ORDER];

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
		const document = cloneFixtureDocument();
		const template = document.navigationNodes.find((node) => node.id === 'tour-paris')!;
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
		const document = documentWithFreeNode('tour-paris');
		const store = createFixtureEditorStore();
		expect(store.importDocument(document)).toBe(true);
		store.setWorkspace('camera');
		const before = store.canonicalJson;
		const historyBefore = store.historyVersion;
		const connectionCount = store.document.connections.length;

		expect(
			store.timelineDragConnectNode(
				'timeline-free-node',
				'tour-b',
				'tour-paris'
			)
		).toBe(true);
		expect(store.historyVersion).toBe(historyBefore + 1);
		expect(store.document.connections).toHaveLength(connectionCount + 1);
		const connection = store.document.connections.find(
			(candidate) =>
				candidate.fromNodeId === 'tour-b' &&
				candidate.toNodeId === 'timeline-free-node'
		)!;
		expect(connection).toMatchObject({
			clearance: 0.35,
			positionPath: { kind: 'auto-bezier', anchors: [] }
		});
		expect(
			store.document.navigationNodes.find((node) => node.id === 'tour-b')!
				.connectedNodeIds
		).toContain('timeline-free-node');
		expect(store.guidedTourNodeIds).toEqual([
			'tour-a',
			'tour-b',
			'timeline-free-node',
			'tour-paris',
			'tour-d'
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
		const document = documentWithFreeNode('tour-b');
		addDocumentConnection(
			document,
			'timeline-free-node',
			'tour-paris',
			'timeline-free-paris'
		);
		const store = createFixtureEditorStore();
		expect(store.importDocument(document)).toBe(true);
		store.setWorkspace('camera');
		const connectionIds = store.document.connections.map((connection) => connection.id);

		expect(
			store.timelineDragConnectNode(
				'timeline-free-node',
				'tour-b',
				'tour-paris'
			)
		).toBe(true);
		expect(store.document.connections.map((connection) => connection.id)).toEqual(
			connectionIds
		);
		expect(store.activeCameraConnectionId).toBe('tour-b-timeline-free');
		expect(store.activeCameraDirection).toBe('forward');
		expect(store.canUndo).toBe(true);
	});

	it('rejects self, invalid-gap, and multi-edge drops without partial writes', () => {
		const store = createFixtureEditorStore();
		const before = store.canonicalJson;
		expect(
			store.timelineDragConnectNode(
				'tour-b',
				'tour-b',
				'tour-b'
			)
		).toBe(false);
		expect(store.statusMessage).toContain('own guided-route boundary');
		expect(
			store.timelineDragConnectNode('tour-b', 'tour-a', 'tour-d')
		).toBe(false);
		expect(store.statusMessage).toContain('consecutive guided');
		expect(store.canonicalJson).toBe(before);
		expect(store.canUndo).toBe(false);

		const multiEdge = createFixtureEditorStore();
		expect(multiEdge.importDocument(documentWithFreeNode('tour-d'))).toBe(true);
		const imported = multiEdge.canonicalJson;
		expect(
			multiEdge.timelineDragConnectNode(
				'timeline-free-node',
				'tour-b',
				'tour-paris'
			)
		).toBe(false);
		expect(multiEdge.statusMessage).toContain('only one missing guided connection');
		expect(multiEdge.canonicalJson).toBe(imported);
		expect(multiEdge.canUndo).toBe(false);
	});

	it('blocks timeline drops during playback, interaction, and pending commands', () => {
		const store = createFixtureEditorStore();
		const before = store.canonicalJson;
		store.selectionActions.selectNavigationNode('tour-paris');
		expect(store.previewSelectedNode('visitor')).toBe(true);
		expect(
			store.timelineDragConnectNode(
				'tour-b',
				'tour-b',
				'tour-paris'
			)
		).toBe(false);
		expect(store.statusMessage).toContain('active camera playback');
		expect(store.stopCameraPreview()).toBe(true);

		store.setTransformInteractionActive(true, 'camera');
		expect(
			store.timelineDragConnectNode(
				'tour-b',
				'tour-b',
				'tour-paris'
			)
		).toBe(false);
		store.setTransformInteractionActive(false);

		expect(store.beginCameraPlacement()).toBe(true);
		expect(
			store.timelineDragConnectNode(
				'tour-b',
				'tour-b',
				'tour-paris'
			)
		).toBe(false);
		expect(store.canonicalJson).toBe(before);
		expect(store.canUndo).toBe(false);
	});
});

describe('MuseumEditorStore Phase 3.6 framing controls', () => {
	it('commits node framing while Through Camera is paused and blocks it while playing', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		expect(store.selectionActions.selectNavigationNode('tour-paris')).toBe(true);
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
		const store = createFixtureEditorStore();
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
		const id = store.document.entities[0]!.id;
		store.selectionActions.selectRoom('paris');
		store.selectionActions.selectPlacement(id);
		expect(store.beginDocumentTransaction()).toBe(true);
		store.document.entities[0]!.position[0] += 1;
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
		const store = createFixtureEditorStore();
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
		const store = createFixtureEditorStore();
		makeHistory(store);
		installPausedVisitorNodePreview(store, 'missing-node-id');
		expect(store.canUndo).toBe(true);
		expect(store.undo()).toBe(true);
		expect(store.cameraPreview).toBeNull();
	});

	it('auto-stops tour preview when undo invalidates the start node', () => {
		const store = createFixtureEditorStore();
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
		const store = createFixtureEditorStore();
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
		const store = createFixtureEditorStore();
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
		const store = createFixtureEditorStore();
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
		const store = createFixtureEditorStore();
		expect(store.selectionActions.selectNavigationNode('tour-paris')).toBe(true);
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
		const store = createFixtureEditorStore();
		expect(store.selectionActions.selectNavigationNode('tour-paris')).toBe(true);
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
