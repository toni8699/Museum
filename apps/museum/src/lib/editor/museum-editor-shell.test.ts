import { describe, expect, it } from 'vitest';
import { cloneFixtureDocument } from '$lib/content/__fixtures__/load-fixture-scene';
import { createEditorShortcutHandler } from './hooks/shortcuts.svelte';
import { createMuseumEditorStore } from './museum-editor.svelte';

function createFixtureEditorStore() {
	return createMuseumEditorStore({ document: cloneFixtureDocument() });
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

describe('MuseumEditorStore Phase 1 shell session state', () => {
	it('defaults workspace, panel, and timeline to the documented initial values', () => {
		const store = createFixtureEditorStore();
		expect(store.currentWorkspace).toBe('scene');
		expect(store.leftPanel).toBe('scene');
		expect(store.timelineExpanded).toBe(false);
		expect(store.sceneTimelineExpanded).toBe(false);
		expect(store.timelineHeight).toBe(280);
		expect(store.cameraTimelinePlayhead).toBe(0);
		expect(store.transformGizmoVisible).toBe(true);
		expect(store.transformSpace).toBe('world');
		expect(store.treeExpandedRoomIds).toEqual(['paris']);
		expect(store.treeExpandedClusterIds).toEqual([]);
	});

	it('auto-expands Camera while restoring Scene\'s remembered timeline choice', () => {
		const store = createFixtureEditorStore();
		expect(store.setWorkspace('camera')).toBe(true);
		expect(store.currentWorkspace).toBe('camera');
		expect(store.timelineExpanded).toBe(true);

		// Scene started collapsed and restores that preference after Camera forced the panel open.
		expect(store.setWorkspace('scene')).toBe(true);
		expect(store.timelineExpanded).toBe(false);

		// A user choice made in Scene survives a full Camera round trip.
		store.toggleTimeline();
		expect(store.timelineExpanded).toBe(true);
		expect(store.sceneTimelineExpanded).toBe(true);
		expect(store.setWorkspace('camera')).toBe(true);
		expect(store.timelineExpanded).toBe(true);
		store.toggleTimeline();
		expect(store.timelineExpanded).toBe(false);
		expect(store.sceneTimelineExpanded).toBe(true);
		expect(store.setWorkspace('scene')).toBe(true);
		expect(store.timelineExpanded).toBe(true);
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
		const store = createFixtureEditorStore();
		store.selectionActions.selectNavigationNode('tour-paris');
		expect(store.previewSelectedNode('director')).toBe(true);
		expect(store.cameraPreview).not.toBeNull();
		expect(store.timelineExpanded).toBe(true);

		// Entering Camera with a preview already running keeps the preview untouched.
		expect(store.setWorkspace('camera')).toBe(true);
		expect(store.cameraPreview).not.toBeNull();

		// Leaving Camera clears the active preview.
		expect(store.setWorkspace('scene')).toBe(true);
		expect(store.cameraPreview).toBeNull();
	});

	it('rejects workspace switches during interaction or modal preview', () => {
		const store = createFixtureEditorStore();
		store.selectionActions.selectNavigationNode('tour-paris');
		expect(store.beginDocumentTransaction()).toBe(true);
		store.setTransformInteractionActive(true, 'camera');
		expect(store.setWorkspace('camera')).toBe(false);
		store.setTransformInteractionActive(false);
		expect(store.cancelDocumentTransaction()).toBe(true);
		expect(store.setWorkspace('camera')).toBe(true);

		expect(store.previewSelectedNode('visitor')).toBe(true);
		expect(store.setWorkspace('scene')).toBe(false);
		expect(store.cameraPreview).not.toBeNull();
		expect(store.stopCameraPreview()).toBe(true);
		expect(store.setWorkspace('scene')).toBe(true);
	});

	it('rejects every other shell-state change during interaction or modal preview', () => {
		const store = createFixtureEditorStore();
		store.toggleClusterTreeExpansion('cluster-a');
		const expectShellStateToRemainUnchanged = (timelineExpanded: boolean) => {
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
			expect(store.timelineExpanded).toBe(timelineExpanded);
			expect(store.timelineHeight).toBe(280);
			expect(store.transformGizmoVisible).toBe(true);
			expect(store.transformSpace).toBe('world');
			expect(store.treeExpandedRoomIds).toEqual(['paris']);
			expect(store.treeExpandedClusterIds).toEqual(['cluster-a']);
		};

		expect(store.beginDocumentTransaction()).toBe(true);
		store.setTransformInteractionActive(true, 'placement');
		expectShellStateToRemainUnchanged(false);
		store.setTransformInteractionActive(false);
		expect(store.cancelDocumentTransaction()).toBe(true);

		store.selectionActions.selectNavigationNode('tour-paris');
		expect(store.previewSelectedNode('visitor')).toBe(true);
		expectShellStateToRemainUnchanged(true);
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
		expect(store.translationSnapEnabled).toBe(false);

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
		expect(store.timelineHeight).toBe(220);
		expect(store.setTimelineHeight(500)).toBe(true);
		expect(store.timelineHeight).toBe(360);
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
	it('stops an active camera preview on Escape before later cancel paths', () => {
		const store = createFixtureEditorStore();
		store.selectionActions.selectNavigationNode('tour-paris');
		expect(store.previewSelectedNode('director')).toBe(true);
		expect(store.cameraPreview).not.toBeNull();

		const handler = createEditorShortcutHandler(store, nullShortcutHost);
		handler(makeKeyEvent('Escape'));

		expect(store.cameraPreview).toBeNull();
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
});
