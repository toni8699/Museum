import { describe, expect, it, vi } from 'vitest';
import { chopinRuntime } from '$lib/content/chopin-project';
import { cloneFixtureDocument } from '../content/__fixtures__/load-fixture-scene';
import { createEditorShortcutHandler } from '$lib/editor/hooks/shortcuts.svelte';
import { createEditorStore } from '$lib/editor/editor-store.svelte';
import { EditorInteractionStore } from '$lib/editor/store/editor-interaction-store.svelte';
import { projectGizmoCapabilities } from '$lib/editor/gizmo/editor-gizmo-policy';
import { SCENE_GIZMO_POLICY } from '$lib/editor/gizmo/scene-gizmo-adapter.svelte';
import { CAMERA_GIZMO_POLICY } from '$lib/editor/gizmo/camera-gizmo-adapter.svelte';

function createFixtureEditorStore() {
	return createEditorStore({ document: cloneFixtureDocument(), rooms: chopinRuntime.rooms });
}

function createUnsequencedStore(relic = false) {
	const document = cloneFixtureDocument();
	for (const node of document.navigationNodes) {
		delete (node as { nextNodeId?: string }).nextNodeId;
		delete (node as { previousNodeId?: string }).previousNodeId;
	}
	return createEditorStore({ document, rooms: chopinRuntime.rooms, relic });
}

function makeKeyEvent(key: string): KeyboardEvent {
	let defaultPrevented = false;
	return {
		key,
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		shiftKey: false,
		target: null,
		get defaultPrevented() {
			return defaultPrevented;
		},
		preventDefault() {
			defaultPrevented = true;
		},
		stopPropagation() {}
	} as KeyboardEvent;
}

const nullShortcutHost = {
	getViewportElement: () => null,
	getOutlinerElement: () => null,
	getClusterNameInput: () => null
};

describe('EditorStore Phase 1 shell session state', () => {
	it('defaults workspace, panel, and timeline to the documented initial values', () => {
		const store = createFixtureEditorStore();
		expect(store.currentWorkspace).toBe('scene');
		expect(store.leftPanel).toBe('scene');
		expect(store.timelineExpanded).toBe(false);
		expect(store.timelineHeight).toBe(288);
		expect(store.cameraTimelinePlayhead).toBe(0);
		expect(store.transformGizmoVisible).toBe(true);
		expect(store.transformSpace).toBe('world');
		expect(store.treeExpandedRoomIds).toEqual(['paris']);
		expect(store.treeExpandedClusterIds).toEqual([]);
	});

	it('never auto-expands the timeline on a workspace switch (P1.7 owner follow-up)', () => {
		const store = createFixtureEditorStore();
		// Entering Camera keeps the panel collapsed — no forced expansion.
		expect(store.setWorkspace('camera')).toBe(true);
		expect(store.currentWorkspace).toBe('camera');
		expect(store.timelineExpanded).toBe(false);

		// The user's choice persists verbatim across every domain round trip.
		store.toggleTimeline();
		expect(store.timelineExpanded).toBe(true);
		expect(store.setWorkspace('scene')).toBe(true);
		expect(store.timelineExpanded).toBe(true);
		expect(store.setWorkspace('camera')).toBe(true);
		expect(store.timelineExpanded).toBe(true);
		store.toggleTimeline();
		expect(store.timelineExpanded).toBe(false);
		expect(store.setWorkspace('scene')).toBe(true);
		expect(store.timelineExpanded).toBe(false);
	});

	it('enters and leaves Layout without changing scene document history', () => {
		const store = createFixtureEditorStore();
		const beforeJson = store.canonicalJson;
		const beforeHistory = store.historyVersion;

		expect(store.setWorkspace('layout')).toBe(true);
		expect(store.currentWorkspace).toBe('layout');
		expect(store.timelineExpanded).toBe(false);
		expect(store.setWorkspace('scene')).toBe(true);
		expect(store.canonicalJson).toBe(beforeJson);
		expect(store.historyVersion).toBe(beforeHistory);
		expect(store.canUndo).toBe(false);
	});

	it('keeps the Scene sidebar tab choice across workspace switches without document history', () => {
		const store = createFixtureEditorStore();
		expect(store.setLeftPanel('assets')).toBe(true);
		const beforeJson = store.canonicalJson;
		const beforeHistory = store.historyVersion;

		expect(store.setWorkspace('camera')).toBe(true);
		expect(store.currentWorkspace).toBe('camera');
		expect(store.leftPanel).toBe('assets');
		expect(store.setWorkspace('scene')).toBe(true);
		expect(store.currentWorkspace).toBe('scene');
		expect(store.leftPanel).toBe('assets');

		expect(store.canonicalJson).toBe(beforeJson);
		expect(store.historyVersion).toBe(beforeHistory);
		expect(store.isDirty).toBe(false);
		expect(store.canUndo).toBe(false);
	});

	it('makes setWorkspace a no-op when the requested workspace equals the current one', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		const version = store.historyVersion;
		expect(store.setWorkspace('camera')).toBe(false);
		expect(store.currentWorkspace).toBe('camera');
		expect(store.historyVersion).toBe(version);
	});

	it('stops an active camera preview only when leaving Camera', () => {
		const store = createUnsequencedStore();
		expect(store.previewCamera('tour-paris', 'director')).toBe(true);
		expect(store.cameraPreview).not.toBeNull();
		expect(store.timelineExpanded).toBe(true);

		// Entering Camera with a preview already running keeps the preview untouched.
		expect(store.setWorkspace('camera')).toBe(true);
		expect(store.cameraPreview).not.toBeNull();

		// Leaving Camera clears the active preview.
		expect(store.setWorkspace('scene')).toBe(true);
		expect(store.cameraPreview).toBeNull();
	});

	it('rejects workspace switches during interaction; chrome switches stay allowed during modal preview', () => {
		const store = createUnsequencedStore();
		expect(store.beginDocumentTransaction()).toBe(true);
		store.setTransformInteractionActive(true, 'camera');
		expect(store.setWorkspace('camera')).toBe(false);
		store.setTransformInteractionActive(false);
		expect(store.cancelDocumentTransaction()).toBe(true);
		expect(store.setWorkspace('camera')).toBe(true);

		// P11.2 (CH·AA) — workspace switching is chrome: always allowed; leaving
		// Camera keeps its existing preview-teardown contract.
		expect(store.previewCamera('tour-paris', 'visitor')).toBe(true);
		expect(store.setWorkspace('scene')).toBe(true);
		expect(store.cameraPreview).toBeNull();
	});

	it('blocks shell-state changes during interaction; chrome stays allowed during modal preview', () => {
		const store = createUnsequencedStore();
		store.toggleClusterTreeExpansion('cluster-a');
		const expectInteractionBlocked = () => {
			expect(store.setTransformTool('select')).toBe(false);
			expect(store.setTransformSpace('local')).toBe(false);
			expect(store.toggleActiveTransformSnap()).toBe(false);
			expect(store.setLeftPanel('assets')).toBe(false);
			expect(store.setTimelineExpanded(true)).toBe(false);
			expect(store.setTimelineHeight(320)).toBe(false);
			expect(store.toggleTimeline()).toBe(false);
			expect(store.toggleRoomTreeExpansion('paris')).toBe(false);
			expect(store.toggleClusterTreeExpansion('cluster-b')).toBe(false);
			expect(store.removeClusterTreeExpansion('cluster-a')).toBe(false);
			expect(store.ensureRoomTreeExpanded('entrance')).toBe(false);
			expect(store.ensureClusterTreeExpanded('cluster-b')).toBe(false);
			expect(store.leftPanel).toBe('scene');
			expect(store.timelineExpanded).toBe(false);
			expect(store.timelineHeight).toBe(288);
			expect(store.transformGizmoVisible).toBe(true);
			expect(store.transformSpace).toBe('world');
			expect(store.treeExpandedRoomIds).toEqual(['paris']);
			expect(store.treeExpandedClusterIds).toEqual(['cluster-a']);
		};

		expect(store.beginDocumentTransaction()).toBe(true);
		store.setTransformInteractionActive(true, 'placement');
		expectInteractionBlocked();
		store.setTransformInteractionActive(false);
		expect(store.cancelDocumentTransaction()).toBe(true);

		// P11.2 (CH·AA) — chrome/session writes (sidebar, timeline shell, tree
		// expansion) stay allowed during a modal preview; only the transform-tool
		// trio keeps its SB gate (P11.4 candidate).
		expect(store.previewCamera('tour-paris', 'visitor')).toBe(true);
		expect(store.setLeftPanel('assets')).toBe(true);
		expect(store.setTimelineExpanded(true)).toBe(true);
		expect(store.setTimelineHeight(320)).toBe(true);
		expect(store.toggleTimeline()).toBe(true);
		expect(store.toggleRoomTreeExpansion('paris')).toBe(true);
		expect(store.toggleClusterTreeExpansion('cluster-b')).toBe(true);
		expect(store.removeClusterTreeExpansion('cluster-a')).toBe(true);
		expect(store.ensureRoomTreeExpanded('entrance')).toBe(true);
		expect(store.ensureClusterTreeExpanded('cluster-b')).toBe(true);
		expect(store.setTransformTool('select')).toBe(false);
		expect(store.setTransformSpace('local')).toBe(false);
		expect(store.toggleActiveTransformSnap()).toBe(false);
		expect(store.leftPanel).toBe('assets');
		expect(store.timelineExpanded).toBe(false); // set(true) then toggleTimeline
		expect(store.timelineHeight).toBe(300); // clamped to EDITOR_TIMELINE_MAX_HEIGHT
		expect(store.transformGizmoVisible).toBe(true);
		expect(store.transformSpace).toBe('world');
		expect(store.treeExpandedRoomIds).toEqual(['entrance']); // paris toggled off, entrance added
		expect(store.treeExpandedClusterIds).toEqual(['cluster-b']); // cluster-a removed, cluster-b added
	});

	it('keeps viewport transform tools session-only and toggles snap for the active mode', () => {
		const store = createFixtureEditorStore();
		const before = store.canonicalJson;

		expect(store.setTransformTool('select')).toBe(true);
		expect(store.transformGizmoVisible).toBe(false);
		expect(store.toggleActiveTransformSnap()).toBe(false);

		expect(store.setTransformTool('translate')).toBe(true);
		expect(store.transformMode).toBe('translate');
		expect(store.transformGizmoVisible).toBe(true);
		expect(store.toggleActiveTransformSnap()).toBe(true);
		expect(store.translationSnapEnabled).toBe(true);

		expect(store.setTransformSpace('local')).toBe(true);
		expect(store.transformSpace).toBe('local');
		expect(store.setTransformTool('scale')).toBe(true);
		expect(store.toggleActiveTransformSnap()).toBe(false);

		expect(store.canonicalJson).toBe(before);
		expect(store.isDirty).toBe(false);
		expect(store.canUndo).toBe(false);
	});

	it('cancels asset placement when the user navigates back from Assets to Scene', () => {
		const store = createFixtureEditorStore();
		store.setLeftPanel('assets');
		expect(store.leftPanel).toBe('assets');
		expect(store.beginAssetPlacement('paris-salon-chair')).toBe(true);
		expect(store.pendingPlacementAssetId).toBe('paris-salon-chair');

		expect(store.setLeftPanel('scene')).toBe(true);
		expect(store.leftPanel).toBe('scene');
		expect(store.pendingPlacementAssetId).toBeNull();

		// Switching to assets again does not cancel anything because no placement is pending.
		expect(store.setLeftPanel('assets')).toBe(true);
		expect(store.pendingPlacementAssetId).toBeNull();
	});

	it('cancels pending camera placement on workspace switch without touching history', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		store.selectionActions.selectNavigationNode('tour-paris');
		const before = store.canonicalJson;

		expect(store.beginCameraPlacement()).toBe(true);
		expect(store.pendingNavigationCommand?.kind).toBe('place-camera');
		expect(store.setWorkspace('scene')).toBe(true);
		expect(store.pendingNavigationCommand).toBeNull();
		expect(store.navigationSelection).toEqual({
			kind: 'node',
			nodeId: 'tour-paris',
			handle: 'position'
		});
		expect(store.canonicalJson).toBe(before);
		expect(store.canUndo).toBe(false);
	});

	it('clamps timeline height into the documented range and rejects non-finite values', () => {
		const store = createFixtureEditorStore();
		expect(store.setTimelineHeight(150)).toBe(true);
		expect(store.timelineHeight).toBe(240);
		expect(store.setTimelineHeight(500)).toBe(true);
		expect(store.timelineHeight).toBe(300);
		expect(store.setTimelineHeight(290.6)).toBe(true);
		expect(store.timelineHeight).toBe(291);
		expect(store.setTimelineHeight(Number.NaN)).toBe(false);
		expect(store.setTimelineHeight(Number.POSITIVE_INFINITY)).toBe(false);
	});

	it('toggles room and cluster expansion additively without duplicates', () => {
		const store = createFixtureEditorStore();
		expect(store.treeExpandedRoomIds).toEqual(['paris']);

		store.toggleRoomTreeExpansion('paris');
		expect(store.treeExpandedRoomIds).toEqual([]);

		store.toggleRoomTreeExpansion('paris');
		expect(store.treeExpandedRoomIds).toEqual(['paris']);

		store.ensureRoomTreeExpanded('paris');
		expect(store.treeExpandedRoomIds).toEqual(['paris']);
		store.ensureRoomTreeExpanded('entrance');
		expect(store.treeExpandedRoomIds).toEqual(['paris', 'entrance']);

		store.toggleClusterTreeExpansion('cluster-a');
		expect(store.treeExpandedClusterIds).toEqual(['cluster-a']);
		store.ensureClusterTreeExpanded('cluster-a');
		expect(store.treeExpandedClusterIds).toEqual(['cluster-a']);
		store.ensureClusterTreeExpanded('cluster-b');
		expect(store.treeExpandedClusterIds).toEqual(['cluster-a', 'cluster-b']);

		store.toggleClusterTreeExpansion('cluster-a');
		expect(store.treeExpandedClusterIds).toEqual(['cluster-b']);
	});

	it('collapses a cluster row through removeClusterTreeExpansion without toggling others', () => {
		const store = createFixtureEditorStore();
		store.toggleClusterTreeExpansion('cluster-a');
		store.toggleClusterTreeExpansion('cluster-b');
		expect(store.treeExpandedClusterIds).toEqual(['cluster-a', 'cluster-b']);

		store.removeClusterTreeExpansion('cluster-a');
		expect(store.treeExpandedClusterIds).toEqual(['cluster-b']);

		// Removing an id that is not in the expanded list is a no-op (no spurious add).
		store.removeClusterTreeExpansion('cluster-c');
		expect(store.treeExpandedClusterIds).toEqual(['cluster-b']);
	});

	it('keeps shell session state and tree expansion out of the canonical JSON', () => {
		const store = createFixtureEditorStore();
		const before = store.canonicalJson;

		store.setWorkspace('camera');
		store.setLeftPanel('assets');
		store.toggleTimeline();
		store.setTimelineHeight(300);
		store.seekCameraTimeline(0.25);
		store.setTransformTool('select');
		store.setTransformSpace('local');
		store.toggleRoomTreeExpansion('paris');
		store.toggleClusterTreeExpansion('cluster-x');
		store.removeClusterTreeExpansion('cluster-y');

		const after = store.canonicalJson;
		expect(after).toBe(before);
		expect(after).not.toContain('currentWorkspace');
		expect(after).not.toContain('leftPanel');
		expect(after).not.toContain('timelineExpanded');
		expect(after).not.toContain('sceneTimelineExpanded');
		expect(after).not.toContain('timelineHeight');
		expect(after).not.toContain('cameraTimelinePlayhead');
		expect(after).not.toContain('transformGizmoVisible');
		expect(after).not.toContain('transformSpace');
		expect(after).not.toContain('treeExpandedRoomIds');
		expect(after).not.toContain('treeExpandedClusterIds');
		expect(store.isDirty).toBe(false);
		expect(store.canUndo).toBe(false);
	});
});

describe('registerEditorShortcuts Escape cascade', () => {
	it('keeps the relic stop-on-Escape lifecycle before later cancel paths', () => {
		const store = createUnsequencedStore(true);
		expect(store.previewCamera('tour-paris', 'director')).toBe(true);
		expect(store.cameraPreview).not.toBeNull();

		const handler = createEditorShortcutHandler(store, nullShortcutHost);
		handler(makeKeyEvent('Escape'));

		expect(store.cameraPreview).toBeNull();
	});

	it('pauses a playing main-editor temporal preview on Escape without tearing down scope', () => {
		const store = createFixtureEditorStore();
		expect(store.previewSequence('visitor')).toBe(true);
		expect(store.setCameraPreviewPlayhead(0.35)).toBe(true);
		const selection = store.navigationSelection;

		const handler = createEditorShortcutHandler(store, nullShortcutHost);
		handler(makeKeyEvent('Escape'));

		expect(store.cameraPreview).toMatchObject({
			kind: 'sequence',
			transport: 'paused',
			playhead: 0.35
		});
		expect(store.navigationSelection).toEqual(selection);
	});

	it('cancels pending navigation on Escape when no preview is active', () => {
		const store = createFixtureEditorStore();
		expect(store.beginCameraPlacement()).toBe(true);
		expect(store.pendingNavigationCommand).not.toBeNull();

		const handler = createEditorShortcutHandler(store, nullShortcutHost);
		handler(makeKeyEvent('Escape'));

		expect(store.pendingNavigationCommand).toBeNull();
		expect(store.statusMessage).toBe('Camera command cancelled');
	});

	it('cancels pending navigation on Escape with an editor interaction store (mode-key branch no longer swallows it)', () => {
		const store = createFixtureEditorStore();
		const interactionStore = new EditorInteractionStore();
		expect(store.beginCameraPlacement()).toBe(true);
		expect(store.pendingNavigationCommand).not.toBeNull();

		const handler = createEditorShortcutHandler(
			store,
			nullShortcutHost,
			interactionStore,
			() => false
		);
		handler(makeKeyEvent('Escape'));

		expect(store.pendingNavigationCommand).toBeNull();
		expect(store.statusMessage).toBe('Camera command cancelled');
	});
});

describe('createEditorShortcutHandler — Scene mutation authority (P2.3)', () => {
	it('keeps ineligible Staging-owned Scene shortcuts selection-only', () => {
		const store = createFixtureEditorStore();
		const entityId = store.document.entities[0]!.id;
		expect(store.selectionActions.selectPlacement(entityId)).toBe(true);
		const activeElement = {};
		vi.stubGlobal('document', { activeElement });
		vi.stubGlobal('HTMLElement', class {});
		const handler = createEditorShortcutHandler(
			store,
			{
				getViewportElement: () => ({ contains: () => true }) as unknown as HTMLElement,
				getOutlinerElement: () => null,
				getClusterNameInput: () => null
			},
			undefined,
			undefined,
			undefined,
			undefined,
			() => false
		);
		const beforeJson = store.canonicalJson;
		const beforeHistory = store.historyVersion;

		try {
			for (const key of ['Delete', 'End']) handler(makeKeyEvent(key));
			for (const key of ['d', 'g', 'a']) {
				const event = makeKeyEvent(key);
				Object.defineProperty(event, 'metaKey', { value: true });
				handler(event);
			}
		} finally {
			vi.unstubAllGlobals();
		}

		expect(store.canonicalJson).toBe(beforeJson);
		expect(store.historyVersion).toBe(beforeHistory);
		expect(store.selectedPlacementIds).toEqual([entityId]);
	});

	it('allows exactly the staging Delete command through the narrow delete gate', () => {
		const store = createFixtureEditorStore();
		const entityId = store.document.entities[0]!.id;
		expect(store.selectionActions.selectPlacement(entityId)).toBe(true);
		const activeElement = {};
		vi.stubGlobal('document', { activeElement });
		vi.stubGlobal('HTMLElement', class {});
		const handler = createEditorShortcutHandler(
			store,
			{
				getViewportElement: () => ({ contains: () => true }) as unknown as HTMLElement,
				getOutlinerElement: () => null,
				getClusterNameInput: () => null
			},
			undefined,
			undefined,
			undefined,
			undefined,
			() => false,
			() => true
		);
		try {
			handler(makeKeyEvent('Delete'));
		} finally {
			vi.unstubAllGlobals();
		}
		expect(store.document.entities.some((entity) => entity.id === entityId)).toBe(false);
		expect(store.undo()).toBe(true);
		expect(store.document.entities.some((entity) => entity.id === entityId)).toBe(true);
	});
});

describe('createEditorShortcutHandler — W/E/R/T refuse unsupported modes (S7 step 6)', () => {
	const SCENE_CAPS = projectGizmoCapabilities(SCENE_GIZMO_POLICY, 'scale');
	const CAMERA_CAPS = projectGizmoCapabilities(CAMERA_GIZMO_POLICY, 'scale');

	it('refuses scale but allows rotate/translate keys on a camera target through the editor capability projection', () => {
		const store = createFixtureEditorStore();
		const interactionStore = new EditorInteractionStore();
		expect(CAMERA_CAPS.allowedModes.has('scale')).toBe(false);
		expect(CAMERA_CAPS.allowedModes.has('rotate')).toBe(true);
		const handler = createEditorShortcutHandler(
			store,
			nullShortcutHost,
			interactionStore,
			undefined,
			undefined,
			() => CAMERA_CAPS
		);

		handler(makeKeyEvent('r'));
		expect(interactionStore.mode).toBe('translate'); // scale refused
		handler(makeKeyEvent('e'));
		expect(interactionStore.mode).toBe('rotate'); // rotate allowed (target-orbit aim)
		handler(makeKeyEvent('w'));
		expect(interactionStore.mode).toBe('translate'); // translate allowed
	});

	it('allows every mode on a scene target through the editor capability projection', () => {
		const store = createFixtureEditorStore();
		const interactionStore = new EditorInteractionStore();
		const handler = createEditorShortcutHandler(
			store,
			nullShortcutHost,
			interactionStore,
			undefined,
			undefined,
			() => SCENE_CAPS
		);

		handler(makeKeyEvent('r'));
		expect(interactionStore.mode).toBe('scale');
		handler(makeKeyEvent('e'));
		expect(interactionStore.mode).toBe('rotate');
		handler(makeKeyEvent('w'));
		expect(interactionStore.mode).toBe('translate');
	});

	it('keeps the keys live when the projection is null (no interactive target)', () => {
		const store = createFixtureEditorStore();
		const interactionStore = new EditorInteractionStore();
		const handler = createEditorShortcutHandler(
			store,
			nullShortcutHost,
			interactionStore,
			undefined,
			undefined,
			() => null
		);

		handler(makeKeyEvent('r'));
		expect(interactionStore.mode).toBe('scale');
	});

	it('refuses rotate/scale keys on a relic camera target (legacy restriction, no caps getter)', () => {
		const store = createFixtureEditorStore();
		store.selectionActions.selectNavigationNode('tour-paris');
		const interactionStore = new EditorInteractionStore();
		const handler = createEditorShortcutHandler(store, nullShortcutHost, interactionStore);

		handler(makeKeyEvent('r'));
		expect(interactionStore.mode).toBe('translate'); // scale refused
		handler(makeKeyEvent('e'));
		expect(interactionStore.mode).toBe('translate'); // rotate refused
		handler(makeKeyEvent('w'));
		expect(interactionStore.mode).toBe('translate');
	});

	it('allows all modes on a relic scene target (no navigation selection)', () => {
		const store = createFixtureEditorStore();
		const interactionStore = new EditorInteractionStore();
		const handler = createEditorShortcutHandler(store, nullShortcutHost, interactionStore);

		handler(makeKeyEvent('r'));
		expect(interactionStore.mode).toBe('scale');
		handler(makeKeyEvent('w'));
		expect(interactionStore.mode).toBe('translate');
	});
});
