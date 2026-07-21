import { describe, expect, it } from 'vitest';
import { createMuseumEditorStore } from './museum-editor.svelte';

describe('MuseumEditorStore Phase 1.1 persistent shell session state', () => {
	it('defaults workspace, panel, and timeline to the documented initial values', () => {
		const store = createMuseumEditorStore();
		expect(store.currentWorkspace).toBe('scene');
		expect(store.leftPanel).toBe('scene');
		expect(store.timelineExpanded).toBe(false);
		expect(store.timelineHeight).toBe(280);
		expect(store.treeExpandedRoomIds).toEqual(['paris']);
		expect(store.treeExpandedClusterIds).toEqual([]);
	});

	it('auto-expands the timeline only when transitioning scene → camera with the panel collapsed', () => {
		const store = createMuseumEditorStore();
		expect(store.setWorkspace('camera')).toBe(true);
		expect(store.currentWorkspace).toBe('camera');
		expect(store.timelineExpanded).toBe(true);

		// Entering with timeline already true keeps it true (no-op on the timeline field).
		store.setWorkspace('scene');
		expect(store.timelineExpanded).toBe(true);
		expect(store.setWorkspace('camera')).toBe(true);
		expect(store.timelineExpanded).toBe(true);

		// After a full leave/enter with timeline collapsed, the rule re-fires.
		expect(store.setWorkspace('scene')).toBe(true);
		store.toggleTimeline();
		expect(store.timelineExpanded).toBe(false);
		expect(store.setWorkspace('camera')).toBe(true);
		expect(store.timelineExpanded).toBe(true);
	});

	it('makes setWorkspace a no-op when the requested workspace equals the current one', () => {
		const store = createMuseumEditorStore();
		store.setWorkspace('camera');
		const version = store.historyVersion;
		expect(store.setWorkspace('camera')).toBe(false);
		expect(store.currentWorkspace).toBe('camera');
		expect(store.historyVersion).toBe(version);
	});

	it('stops an active camera preview only when leaving Camera', () => {
		const store = createMuseumEditorStore();
		store.selectNavigationNode('paris-seat');
		expect(store.previewSelectedNode('director')).toBe(true);
		expect(store.cameraPreview).not.toBeNull();

		// Entering Camera with a preview already running keeps the preview untouched.
		expect(store.setWorkspace('camera')).toBe(true);
		expect(store.cameraPreview).not.toBeNull();

		// Leaving Camera clears the active preview.
		expect(store.setWorkspace('scene')).toBe(true);
		expect(store.cameraPreview).toBeNull();
	});

	it('rejects workspace switches during interaction or modal preview', () => {
		const store = createMuseumEditorStore();
		store.selectNavigationNode('paris-seat');
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
		const store = createMuseumEditorStore();
		store.toggleClusterTreeExpansion('cluster-a');
		const expectShellStateToRemainUnchanged = () => {
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
			expect(store.timelineHeight).toBe(280);
			expect(store.treeExpandedRoomIds).toEqual(['paris']);
			expect(store.treeExpandedClusterIds).toEqual(['cluster-a']);
		};

		expect(store.beginDocumentTransaction()).toBe(true);
		store.setTransformInteractionActive(true, 'placement');
		expectShellStateToRemainUnchanged();
		store.setTransformInteractionActive(false);
		expect(store.cancelDocumentTransaction()).toBe(true);

		store.selectNavigationNode('paris-seat');
		expect(store.previewSelectedNode('visitor')).toBe(true);
		expectShellStateToRemainUnchanged();
	});

	it('cancels asset placement when the user navigates back from Assets to Scene', () => {
		const store = createMuseumEditorStore();
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

	it('clamps timeline height into the documented range and rejects non-finite values', () => {
		const store = createMuseumEditorStore();
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
		const store = createMuseumEditorStore();
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
		const store = createMuseumEditorStore();
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
		const store = createMuseumEditorStore();
		const before = store.canonicalJson;

		store.setWorkspace('camera');
		store.setLeftPanel('assets');
		store.toggleTimeline();
		store.setTimelineHeight(300);
		store.toggleRoomTreeExpansion('paris');
		store.toggleClusterTreeExpansion('cluster-x');
		store.removeClusterTreeExpansion('cluster-y');

		const after = store.canonicalJson;
		expect(after).toBe(before);
		expect(after).not.toContain('currentWorkspace');
		expect(after).not.toContain('leftPanel');
		expect(after).not.toContain('timelineExpanded');
		expect(after).not.toContain('timelineHeight');
		expect(after).not.toContain('treeExpandedRoomIds');
		expect(after).not.toContain('treeExpandedClusterIds');
		expect(store.isDirty).toBe(false);
		expect(store.canUndo).toBe(false);
	});
});
