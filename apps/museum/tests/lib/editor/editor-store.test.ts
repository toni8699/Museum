import { describe, expect, it } from 'vitest';
import { cloneFixtureDocument } from '../content/__fixtures__/load-fixture-scene';
import {
	assertNavigationGraphMatchesScene,
	type SceneDocument
} from '$lib/content/scene';
import { chopinRuntime, sceneDocument } from '$lib/content/chopin-project';
import { pickInitialNavigationNodeId } from '$lib/editor/store/document-store.svelte';
import { serializeSceneDocument } from '$lib/content/scene-codec';
import { placementTransformFromDocument } from '$lib/editor/editor-transform';
import {
	cloneSceneDocument,
	createEditorStore,
	EDITOR_BRIGHT_LIGHTING,
	EDITOR_VISITOR_LIGHTING,
	EditorStore
} from '$lib/editor/editor-store.svelte';
import { createFixtureEditorStore } from './editor-test-utils';
import { createEmptyProject } from '$lib/project/project-codec';
import { createLayoutRoomRegistry } from '$lib/project/project-layout-semantics';

describe('cloneSceneDocument', () => {
	it('does not mutate the checked-in sceneDocument singleton', () => {
		const clone = cloneSceneDocument(sceneDocument);
		const originalFirstId = sceneDocument.entities[0]?.id;
		const originalObjectCount = sceneDocument.entities.length;

		clone.entities[0]!.id = 'mutated-placement-id';
		clone.entities.push({
			...clone.entities[0]!,
			id: 'extra-placement'
		});

		expect(sceneDocument.entities[0]?.id).toBe(originalFirstId);
		expect(sceneDocument.entities).toHaveLength(originalObjectCount);
		expect(clone.entities[0]?.id).toBe('mutated-placement-id');
		expect(clone.entities).toHaveLength(originalObjectCount + 1);
	});
});

describe('createEditorStore', () => {
	it('resolves default object and node counts from a fixture session clone', () => {
		const fixture = cloneFixtureDocument();
		const store = createEditorStore({ document: fixture, rooms: chopinRuntime.rooms });

		expect(store.document).not.toBe(sceneDocument);
		expect(store.document).not.toBe(fixture);
		expect(store.document.entities).toHaveLength(fixture.entities.length);
		expect(store.document.navigationNodes).toHaveLength(fixture.navigationNodes.length);
		expect(store.scene.entities).toHaveLength(fixture.entities.length);
		expect(store.scene.objects).toHaveLength(
			fixture.entities.filter((entity) => entity.kind === 'model').length
		);
		expect(store.scene.navigationNodes).toHaveLength(fixture.navigationNodes.length);
		expect(store.state.activeNodeId).toBe(pickInitialNavigationNodeId(store.scene));
		expect(store.state.currentRoomId).toBe('entrance');
	});

	it('boots from the checked-in document without mutating the singleton', () => {
		const store = createEditorStore({
			document: sceneDocument,
			rooms: chopinRuntime.rooms
		});

		expect(store.document).not.toBe(sceneDocument);
		expect(store.document.entities).toHaveLength(sceneDocument.entities.length);
		expect(store.document.navigationNodes).toHaveLength(
			sceneDocument.navigationNodes.length
		);
		expect(
			store.document.navigationNodes.some((node) => node.id === store.state.activeNodeId)
		).toBe(true);
		expect(store.state.activeNodeId).toBe(pickInitialNavigationNodeId(store.scene));
	});

	it('keeps the checked-in document intact when the session document mutates', () => {
		const store = createEditorStore({
			document: sceneDocument,
			rooms: chopinRuntime.rooms
		});
		const originalFirstId = sceneDocument.entities[0]?.id;

		store.document.entities[0]!.id = 'session-only-id';

		expect(sceneDocument.entities[0]?.id).toBe(originalFirstId);
		expect(store.document.entities[0]?.id).toBe('session-only-id');
	});

	it('P7.3 — boots empty with an empty project + registry: zero rooms, no Chopin ids', () => {
		const project = createEmptyProject({ id: 'project:blank', name: 'Blank' });
		const store = createEditorStore({
			document: project.scene,
			rooms: createLayoutRoomRegistry(project.layout)
		});

		expect(store.rooms.entries).toHaveLength(0);
		expect(store.rooms.has('paris')).toBe(false);
		expect(store.document.entities).toHaveLength(0);
		expect(store.document.navigationNodes).toHaveLength(0);
	});

	it('P7.3 — explicit Chopin boot (relic) still resolves the frozen rooms', () => {
		const store = createEditorStore({
			document: sceneDocument,
			rooms: chopinRuntime.rooms,
			relic: true
		});

		expect(store.isRelic).toBe(true);
		expect(store.currentWorkspace).toBe('scene');
		expect(store.setWorkspace('layout')).toBe(false);
		expect(store.rooms.has('paris')).toBe(true);
		expect(store.rooms.entries.length).toBeGreaterThan(0);
	});

	it('defaults to bright editor lighting and can restore the visitor preset', () => {
		const store = createFixtureEditorStore();

		expect(store.ambientIntensity).toBe(EDITOR_BRIGHT_LIGHTING.ambientIntensity);
		expect(store.fogEnabled).toBe(false);

		store.applyLightingPreset(EDITOR_VISITOR_LIGHTING);

		expect(store.ambientIntensity).toBe(EDITOR_VISITOR_LIGHTING.ambientIntensity);
		expect(store.directionalIntensity).toBe(EDITOR_VISITOR_LIGHTING.directionalIntensity);
		expect(store.fogEnabled).toBe(true);
	});

	it('tracks canonical baselines across edits, imports, undo, and reset', () => {
		const store = createFixtureEditorStore();
		const bootPosition = [...store.document.entities[0]!.position] as [
			number,
			number,
			number
		];
		expect(store.isDirty).toBe(false);
		store.selectionActions.selectRoom('paris');
		const placement = store.document.entities[0]!;
		expect(
			store.commitPlacementTransform(placement.id, {
				position: [placement.position[0] + 1, placement.position[1], placement.position[2]],
				rotation: [...placement.rotation],
				scale: placement.scale ?? 1,
				scaleScalar: placement.scale ?? 1,
				scaleVector: null,
				scaleMode: 'uniform'
			})
		).toBe(true);
		expect(store.isDirty).toBe(true);
		expect(store.undo()).toBe(true);
		expect(store.isDirty).toBe(false);

		const imported = JSON.parse(serializeSceneDocument(sceneDocument)) as SceneDocument;
		imported.entities[0]!.position[0] += 0.25;
		expect(store.importDocument(imported)).toBe(true);
		expect(store.isDirty).toBe(false);
		expect(store.resetToCheckedInDocument()).toBe(true);
		// reset restores the boot document (the fixture), not the
		// hardcoded Chopin checked-in scene.
		expect(store.document.entities[0]!.position).toEqual(bootPosition);
		expect(store.isDirty).toBe(false);
	});

	it('rejects invalid imports without changing the current scene or baseline', () => {
		const store = createFixtureEditorStore();
		const before = serializeSceneDocument(store.document);
		const invalid = cloneSceneDocument(sceneDocument);
		invalid.navigationNodes[0]!.cameraTarget = [...invalid.navigationNodes[0]!.position];

		expect(store.importDocument(invalid)).toBe(false);
		expect(serializeSceneDocument(store.document)).toBe(before);
		expect(store.isDirty).toBe(false);
		expect(store.canExport).toBe(true);
	});

	it('rejects an inverted framing envelope without changing the current scene or baseline', () => {
		const store = createFixtureEditorStore();
		const before = serializeSceneDocument(store.document);
		const invalid = cloneSceneDocument(sceneDocument);
		const connection = invalid.connections.find((candidate) => candidate.viewTracks);
		expect(connection?.viewTracks).toBeDefined();
		if (!connection?.viewTracks) return;
		connection.viewTracks.framingEnvelope = {
			forward: { enterStart: 0.1, enterEnd: 0.8, exitStart: 0.2, exitEnd: 1 }
		};

		expect(store.importDocument(invalid)).toBe(false);
		expect(serializeSceneDocument(store.document)).toBe(before);
		expect(store.isDirty).toBe(false);
		expect(store.canExport).toBe(true);
	});

	it('preserves authored v3 view data through import, history, and canonical export', () => {
		const store = createFixtureEditorStore();
		const imported = cloneSceneDocument(sceneDocument);
		imported.navigationNodes[0]!.fov = 47;
		imported.connections[0]!.viewTracks = {
			forward: [
				{
					id: 'tour-a-b-view-forward-01',
					progress: 0.35,
					roomId: 'entrance',
					cameraTarget: [1, 1.4, -2],
					fov: 48
				}
			],
			reverse: [
				{
					id: 'tour-a-b-view-reverse-01',
					progress: 0.65,
					cameraTarget: [100, 2, 100],
					fov: 64
				}
			]
		};

		expect(store.importDocument(imported)).toBe(true);
		expect(store.isDirty).toBe(false);
		expect(store.canonicalJson).toContain('"fov": 47');
		expect(store.canonicalJson).toContain('"tour-a-b-view-forward-01"');
		expect(store.canonicalJson).toContain('"tour-a-b-view-reverse-01"');

		const connectionId = imported.connections[0]!.id;
		store.selectionActions.selectConnection(connectionId);
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


describe('EditorStore history', () => {
	function translatedTransform(store: ReturnType<typeof createEditorStore>, x: number) {
		const transform = placementTransformFromDocument(store.document.entities[0]!);
		transform.position[0] = x;
		return transform;
	}

	it('collapses previews into one commit and restores scene/state identity', () => {
		const store = createFixtureEditorStore();
		const id = store.document.entities[0]!.id;
		const originalX = store.document.entities[0]!.position[0];
		store.selectionActions.selectRoom('paris');
		store.selectionActions.selectPlacement(id);

		expect(store.beginDocumentTransaction()).toBe(true);
		store.updatePlacementTransform(id, translatedTransform(store, 2));
		store.updatePlacementTransform(id, translatedTransform(store, 3));
		expect(store.commitDocumentTransaction()).toBe(true);
		expect(store.canUndo).toBe(true);
		expect(store.document.entities[0]!.position[0]).toBe(3);
		assertNavigationGraphMatchesScene(store.state.graph, store.scene);

		expect(store.undo()).toBe(true);
		expect(store.document.entities[0]!.position[0]).toBe(originalX);
		expect(store.selectedPlacementId).toBe(id);
		assertNavigationGraphMatchesScene(store.state.graph, store.scene);

		expect(store.redo()).toBe(true);
		expect(store.document.entities[0]!.position[0]).toBe(3);
		assertNavigationGraphMatchesScene(store.state.graph, store.scene);
	});

	it('suppresses no-ops and clears redo after a divergent edit', () => {
		const store = createFixtureEditorStore();
		const id = store.document.entities[0]!.id;
		store.selectionActions.selectRoom('paris');

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
		const store = createFixtureEditorStore();
		const id = store.document.entities[0]!.id;
		store.selectionActions.selectRoom('paris');

		for (let index = 1; index <= 105; index += 1) {
			store.commitPlacementTransform(id, translatedTransform(store, index));
		}

		let undoCount = 0;
		while (store.undo()) undoCount += 1;
		expect(undoCount).toBe(100);
	});
});


describe('viewport visibility flags', () => {
	it('default to true and never touch the document or history on toggle', () => {
		const store = createFixtureEditorStore();
		expect(store.viewportShowNodes).toBe(true);
		expect(store.viewportShowPaths).toBe(true);
		expect(store.viewportShowFraming).toBe(true);
		expect(store.forceMountCameraNodeHandles).toBe(false);

		const snapshotBeforeHistory = store.historyVersion;
		const documentBefore = serializeSceneDocument(store.document);

		store.toggleViewportShowNodes();
		store.toggleViewportShowPaths();
		store.toggleViewportShowFraming();
		expect(store.viewportShowNodes).toBe(false);
		expect(store.viewportShowPaths).toBe(false);
		expect(store.viewportShowFraming).toBe(false);
		expect(store.historyVersion).toBe(snapshotBeforeHistory);
		expect(store.isDirty).toBe(false);
		expect(serializeSceneDocument(store.document)).toBe(documentBefore);

		store.toggleViewportShowNodes();
		store.toggleViewportShowPaths();
		store.toggleViewportShowFraming();
		expect(store.viewportShowNodes).toBe(true);
		expect(store.viewportShowPaths).toBe(true);
		expect(store.viewportShowFraming).toBe(true);
	});

	it('forceMountCameraNodeHandles is true only for connect-* commands', () => {
		const store = createFixtureEditorStore();
		expect(store.forceMountCameraNodeHandles).toBe(false);

		// beginConnectExistingNodes needs a node selection to seed sourceNodeId.
		expect(store.selectionActions.selectNavigationNode(store.document.navigationNodes[0]!.id)).toBe(true);
		expect(store.beginConnectExistingNodes()).toBe(true);
		expect(store.forceMountCameraNodeHandles).toBe(true);
		store.cancelPendingNavigation('reset');
		expect(store.forceMountCameraNodeHandles).toBe(false);

		// Pending placement alone must NOT force-mount nodes.
		expect(store.beginCameraPlacement()).toBe(true);
		expect(store.forceMountCameraNodeHandles).toBe(false);
		store.cancelPendingNavigation('reset');
		expect(store.forceMountCameraNodeHandles).toBe(false);
	});
});
