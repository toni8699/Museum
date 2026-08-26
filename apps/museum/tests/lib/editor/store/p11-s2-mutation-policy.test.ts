import { describe, expect, it } from 'vitest';
import { roomPoint } from '$lib/content/rooms';
import { createFixtureEditorStore } from '../editor-test-utils';

/**
 * P11.2 — mutation-gate policy (plan §8 buckets + owner decisions 2026-08-26).
 *
 * Contract under test:
 * - AP: authoring intent auto-pauses a *playing Director* preview in place,
 *   preserving physical progress, writing no history entry from the pause
 *   itself, and completing as exactly ONE transaction (one-gesture rule).
 * - Visitor floor: visitor previews refuse document authoring (paused or
 *   playing); framing stays editable through a PAUSED visitor camera (P1.6).
 * - DEL: topology deletion pauses first; the release chain keeps a paused
 *   preview mounted when it does not touch the deleted topology (the touching
 *   force-stop case is pinned in p8-s5-interaction-matrix D4).
 * - CH·AA: workspace/sidebar/timeline-shell/tree-expansion session writes
 *   stay allowed while a preview plays.
 * - SB: placement-cluster writes stay blocked while playing; cancel is AA
 *   session cleanup.
 */
describe('P11.2 mutation-gate policy', () => {
	it('AP: a node-hold write pauses a playing Director edge and commits exactly one transaction', () => {
		const store = createFixtureEditorStore();
		store.selectionActions.selectConnection('tour-a-b');
		expect(store.previewSelectedConnection('forward', 'director')).toBe(true);
		expect(store.playCameraPreview()).toBe(true);
		expect(store.cameraPreview?.transport).toBe('playing');
		const historyBefore = store.historyVersion;

		expect(store.setNodeHoldSeconds('tour-paris', 1.5)).toBe(true);

		// The pause itself writes no history; the authoring op is one entry.
		expect(store.cameraPreview?.transport).toBe('paused');
		expect(store.historyVersion).toBe(historyBefore + 1);
		expect(
			store.document.navigationNodes.find((node) => node.id === 'tour-paris')
				?.holdSeconds
		).toBe(1.5);
		expect(store.undo()).toBe(true);
		expect(
			store.document.navigationNodes.find((node) => node.id === 'tour-paris')
				?.holdSeconds
		).toBeUndefined();
	});

	it('AP: a connection-timing write pauses a playing Director edge in place', () => {
		const store = createFixtureEditorStore();
		store.selectionActions.selectConnection('tour-a-b');
		expect(store.previewSelectedConnection('forward', 'director')).toBe(true);
		expect(store.playCameraPreview()).toBe(true);
		const historyBefore = store.historyVersion;

		expect(
			store.setConnectionTiming('tour-a-b', 'forward', {
				durationSeconds: 2,
				easing: 'linear'
			})
		).toBe(true);

		expect(store.cameraPreview?.transport).toBe('paused');
		expect(store.historyVersion).toBe(historyBefore + 1);
		expect(store.document.connections[0]?.timing?.forward).toEqual({
			durationSeconds: 2,
			easing: 'linear'
		});
	});

	it('AP: beginCameraPlacement pauses a playing tour before staging the pending command', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		expect(store.previewSequence('director')).toBe(true);
		expect(store.cameraPreview?.transport).toBe('playing');
		const historyBefore = store.historyVersion;

		expect(store.beginCameraPlacement()).toBe(true);

		expect(store.cameraPreview?.transport).toBe('paused');
		expect(store.pendingNavigationCommand?.kind).toBe('place-camera');
		expect(store.historyVersion).toBe(historyBefore);
		store.cancelPendingNavigation('reset');
	});

	it('DEL: deleting the previewed leaf edge pauses then force-stops the edge preview', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		// Free node + leaf connection off the guided flow.
		expect(store.beginCameraPlacement()).toBe(true);
		const nodeId = store.createPendingNavigationNodeAt(
			'paris',
			roomPoint('paris', [0, 0, 0]),
			[0, 0, -1]
		)!;
		expect(store.beginConnectExistingNodes()).toBe(true);
		expect(store.selectionActions.selectNavigationNode('tour-paris')).toBe(true);
		const leaf = store.document.connections.at(-1)!;

		// Preview the leaf edge as a Director scope, then play it.
		expect(store.previewEdge(leaf.id, 'forward', 'director')).toBe(true);
		expect(store.playCameraPreview()).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'edge',
			connectionId: leaf.id,
			transport: 'playing'
		});
		const historyBefore = store.historyVersion;

		expect(store.deleteConnection(leaf.id)).toBe(true);

		// DEL — the paused edge preview touches the deleted connection, so the
		// release chain force-stops it (P8 S5 teardown preserved).
		expect(store.cameraPreview).toBeNull();
		expect(store.document.connections.some((c) => c.id === leaf.id)).toBe(false);
		expect(store.document.navigationNodes.some((node) => node.id === nodeId)).toBe(true);
		expect(store.historyVersion).toBe(historyBefore + 1);
	});

	it('DEL: deleting an untouching lone free node keeps a paused edge preview mounted', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		// B0 — a standalone free node with no incident edges (never connected).
		expect(store.beginCameraPlacement()).toBe(true);
		const nodeId = store.createPendingNavigationNodeAt(
			'paris',
			roomPoint('paris', [0, 0, 0]),
			[0, 0, -1]
		)!;
		expect(store.document.navigationNodes.some((node) => node.id === nodeId)).toBe(true);

		// Preview a tour edge as a Director scope and play it.
		expect(store.previewEdge('tour-a-b', 'forward', 'director')).toBe(true);
		expect(store.playCameraPreview()).toBe(true);
		expect(store.cameraPreview?.transport).toBe('playing');

		expect(store.deleteNavigationNode(nodeId)).toBe(true);

		// The lone node is not on the previewed edge, so the release chain
		// leaves the paused edge mounted (re-resolved on the document swap;
		// touching deletions force-stop — pinned above and in p8-s5 D4).
		expect(store.cameraPreview).not.toBeNull();
		expect(store.cameraPreview?.transport).toBe('paused');
		expect(store.document.navigationNodes.some((node) => node.id === nodeId)).toBe(false);
	});

	it('CTC AP: scrubbing a playing tour auto-pauses at the requested progress', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		expect(store.previewSequence('director')).toBe(true);
		expect(store.cameraPreview?.transport).toBe('playing');
		const historyBefore = store.historyVersion;

		expect(store.seekCameraTimeline(0.2)).toBe(true);

		expect(store.cameraPreview?.transport).toBe('paused');
		expect(store.cameraTimelinePlayhead).toBeCloseTo(0.2, 6);
		expect(store.historyVersion).toBe(historyBefore);
	});

	it('visitor floor: paused visitor previews refuse document authoring but allow framing', () => {
		const store = createFixtureEditorStore();
		store.selectionActions.selectNavigationNode('tour-paris');
		expect(store.previewSelectedNode('visitor')).toBe(true);
		expect(store.cameraPreview).toMatchObject({ mode: 'visitor', transport: 'paused' });

		// Document authoring refuses (seam returns false for visitor).
		expect(store.setNodeHoldSeconds('tour-paris', 1.5)).toBe(false);
		expect(store.beginCameraPlacement()).toBe(false);
		expect(store.deleteConnection('tour-a-b')).toBe(false);
		// SB placement writes refuse.
		expect(store.beginAssetPlacement('paris-salon-chair')).toBe(false);

		// Framing stays editable through the paused visitor camera (P1.6).
		const fov = store.selectedNavigationNode!.fov;
		expect(store.commitSelectedNodeFov(fov + 1)).toBe(true);
		expect(store.selectedNavigationNode!.fov).toBeCloseTo(fov + 1);
	});

	it('placement-cluster SB while playing; AA cancel runs in fresh-preview teardown', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		expect(store.beginAssetPlacement('paris-salon-chair')).toBe(true);
		expect(store.pendingPlacementAssetId).toBe('paris-salon-chair');

		// AA — cancel is session cleanup: fresh-preview teardown clears the
		// pending placement (no blocked refusal) while the tour installs.
		expect(store.previewSequence('director')).toBe(true);
		expect(store.cameraPreview?.transport).toBe('playing');
		expect(store.pendingPlacementAssetId).toBeNull();

		// SB — placement writes refuse while the tour plays.
		const placementId = store.document.entities[0]!.id;
		expect(store.requestPlacementFrame([placementId])).toBe(false);
		expect(store.beginAssetPlacement('paris-salon-chair')).toBe(false);
		expect(store.pendingPlacementAssetId).toBeNull();
	});

	it('path-anchor AP: anchor deletion pauses a playing preview and commits one transaction', () => {
		const store = createFixtureEditorStore();
		const connection = store.document.connections[0]!;
		const anchorId = connection.positionPath.anchors[0]!.id;
		expect(store.selectionActions.selectConnection(connection.id)).toBe(true);
		expect(store.selectionActions.selectAnchor(connection.id, anchorId)).toBe(true);
		expect(store.previewSelectedConnection('forward', 'director')).toBe(true);
		expect(store.cameraPreview?.transport).toBe('paused');
		expect(store.playCameraPreview()).toBe(true);
		expect(store.cameraPreview?.transport).toBe('playing');
		const historyBefore = store.historyVersion;

		expect(store.deleteSelectedAnchor()).toBe(true);

		expect(store.cameraPreview?.transport).toBe('paused');
		expect(store.historyVersion).toBe(historyBefore + 1);
		expect(
			store.document.connections[0]!.positionPath.anchors.some(
				(anchor) => anchor.id === anchorId
			)
		).toBe(false);
		expect(store.undo()).toBe(true);
		expect(
			store.document.connections[0]!.positionPath.anchors.some(
				(anchor) => anchor.id === anchorId
			)
		).toBe(true);
	});

	it('ordering: a prohibited gesture never pauses a playing Director preview', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		store.selectionActions.selectConnection('tour-a-b');
		expect(store.previewSelectedConnection('forward', 'director')).toBe(true);
		expect(store.playCameraPreview()).toBe(true);
		expect(store.cameraPreview?.transport).toBe('playing');

		// An active gesture bars the drag-begin BEFORE the seam: the preview
		// must stay playing (the prohibited gesture is rejected without pausing).
		store.setDirectFramingInteractionActive(true);
		expect(
			store.beginViewKeyframeProgressDrag({
				connectionId: 'tour-a-b',
				direction: 'forward',
				keyframeId: 'anything'
			})
		).toBe(false);
		expect(store.cameraPreview?.transport).toBe('playing');
		store.setDirectFramingInteractionActive(false);
	});

	it('ordering: unchanged/invalid commits never pause a playing Director preview', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		store.selectionActions.selectConnection('tour-a-b');
		expect(store.previewSelectedConnection('forward', 'director')).toBe(true);
		expect(store.playCameraPreview()).toBe(true);
		expect(store.cameraPreview?.transport).toBe('playing');

		// Hold no-op / hold out-of-range / timing invalid / timing no-op all
		// validate BEFORE the seam: none pauses.
		expect(store.setNodeHoldSeconds('tour-paris', null)).toBe(false);
		expect(store.cameraPreview?.transport).toBe('playing');
		expect(store.setNodeHoldSeconds('tour-paris', -1)).toBe(false);
		expect(store.cameraPreview?.transport).toBe('playing');
		expect(
			store.setConnectionTiming('tour-a-b', 'forward', {
				durationSeconds: -1,
				easing: 'linear'
			})
		).toBe(false);
		expect(store.cameraPreview?.transport).toBe('playing');
		expect(store.setConnectionTiming('tour-a-b', 'forward', null)).toBe(false);
		expect(store.cameraPreview?.transport).toBe('playing');
	});

	it('ordering: a stale drag target never pauses a playing Director preview', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		store.selectionActions.selectConnection('tour-a-b');
		expect(store.previewSelectedConnection('forward', 'director')).toBe(true);
		expect(store.playCameraPreview()).toBe(true);
		expect(store.cameraPreview?.transport).toBe('playing');

		// A keyframe id that does not exist resolves to nothing BEFORE the seam.
		expect(
			store.beginViewKeyframeProgressDrag({
				connectionId: 'tour-a-b',
				direction: 'forward',
				keyframeId: 'missing-keyframe'
			})
		).toBe(false);
		expect(store.cameraPreview?.transport).toBe('playing');
	});

	it('ordering: an endpoint Add-Keyframe click never pauses a playing preview', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		store.selectionActions.selectConnection('tour-a-b');
		expect(store.previewSelectedConnection('forward', 'director')).toBe(true);
		expect(store.playCameraPreview()).toBe(true);
		expect(store.cameraPreview?.transport).toBe('playing');
		expect(store.cameraTimelinePlayhead).toBe(0);

		// Playhead at the edge start → edgeProgress at the endpoint → the
		// sample/range validation rejects BEFORE the seam; the preview stays
		// playing (no keyframe was added).
		expect(store.addViewKeyframeAtPlayhead()).toBe(false);
		expect(store.cameraPreview?.transport).toBe('playing');
		expect(store.document.connections[0]!.viewTracks).toBeUndefined();
	});

	it('ordering: a zero-delta Aim commit never pauses a playing preview', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		store.selectionActions.selectConnection('tour-a-b');
		expect(store.previewSelectedConnection('forward', 'director')).toBe(true);
		expect(store.seekCameraTimeline(0.4)).toBe(true);
		// Add a breakpoint at an interior progress (selects the new keyframe).
		expect(store.addViewKeyframeAtPlayhead()).toBe(true);
		expect(store.playCameraPreview()).toBe(true);
		expect(store.cameraPreview?.transport).toBe('playing');

		// yaw/pitch 0 orbits to the same target → zero-delta rejection BEFORE
		// the framing seam; the preview stays playing.
		expect(store.commitSelectedViewKeyframeAim(0, 0)).toBe(false);
		expect(store.cameraPreview?.transport).toBe('playing');
	});

	it('ordering: equal hold/timing values are no-ops that never pause', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		store.selectionActions.selectConnection('tour-a-b');
		expect(store.previewSelectedConnection('forward', 'director')).toBe(true);
		expect(store.playCameraPreview()).toBe(true);

		// First write pauses (AP); re-writing the SAME value is a no-op that
		// leaves the preview playing and writes no second history entry.
		expect(store.setNodeHoldSeconds('tour-paris', 1.5)).toBe(true);
		expect(store.cameraPreview?.transport).toBe('paused');
		expect(store.playCameraPreview()).toBe(true);
		expect(store.setNodeHoldSeconds('tour-paris', 1.5)).toBe(false);
		expect(store.cameraPreview?.transport).toBe('playing');

		// Preview is still playing; the equal timing write below must also no-op.
		expect(
			store.setConnectionTiming('tour-a-b', 'forward', {
				durationSeconds: 2,
				easing: 'linear'
			})
		).toBe(true);
		expect(store.cameraPreview?.transport).toBe('paused');
		expect(store.playCameraPreview()).toBe(true);
		expect(
			store.setConnectionTiming('tour-a-b', 'forward', {
				durationSeconds: 2,
				easing: 'linear'
			})
		).toBe(false);
		expect(store.cameraPreview?.transport).toBe('playing');
	});

<<<<<<< HEAD
	it('ordering: an already-applied guided-tour order is a no-op that never pauses', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		// Normalize the fixture's closed cycle into the open guided order first
		// (the cycle → open-chain rewrite is a real change).
		expect(store.setGuidedTourOrder([...store.guidedTourNodeIds])).toBe(true);
		store.selectionActions.selectConnection('tour-a-b');
		expect(store.previewSelectedConnection('forward', 'director')).toBe(true);
		expect(store.playCameraPreview()).toBe(true);
		expect(store.cameraPreview?.transport).toBe('playing');

		// Rewriting the CURRENT order validates, then the no-op returns false
		// BEFORE the seam: the preview stays playing and no transaction opens.
		expect(store.setGuidedTourOrder(store.guidedTourNodeIds)).toBe(false);
		expect(store.cameraPreview?.transport).toBe('playing');
		expect(store.isDocumentTransactionActive).toBe(false);
	});

=======
>>>>>>> 728c7e6f66e48e5c1ea36b14544c3d226d0dde98
	it('ordering: clearing an absent timing direction never pauses', () => {
		const store = createFixtureEditorStore();
		expect(
			store.setConnectionTiming('tour-a-b', 'reverse', {
				durationSeconds: 2,
				easing: 'linear'
			})
		).toBe(true);
		store.setWorkspace('camera');
		store.selectionActions.selectConnection('tour-a-b');
		expect(store.previewSelectedConnection('forward', 'director')).toBe(true);
		expect(store.playCameraPreview()).toBe(true);
		const historyBefore = store.historyVersion;

		// The timing object exists for reverse, but forward is already absent.
		expect(store.setConnectionTiming('tour-a-b', 'forward', null)).toBe(false);
		expect(store.cameraPreview?.transport).toBe('playing');
		expect(store.historyVersion).toBe(historyBefore);
	});

	it('ordering: the seam fires before begin-transaction and writes exactly one entry', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		store.selectionActions.selectConnection('tour-a-b');
		expect(store.previewSelectedConnection('forward', 'director')).toBe(true);
		expect(store.playCameraPreview()).toBe(true);
		const historyBefore = store.historyVersion;

		expect(store.setNodeHoldSeconds('tour-paris', 1.5)).toBe(true);

		// Pause before the write: one entry for the hold commit, none for the
		// pause, and no dangling transaction remains open.
		expect(store.cameraPreview?.transport).toBe('paused');
		expect(store.historyVersion).toBe(historyBefore + 1);
		expect(store.isDocumentTransactionActive).toBe(false);
		expect(
			store.document.navigationNodes.find((node) => node.id === 'tour-paris')
				?.holdSeconds
		).toBe(1.5);
	});

	it('CH·AA: chrome/session writes stay allowed while a Director preview plays', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		store.selectionActions.selectConnection('tour-a-b');
		expect(store.previewSelectedConnection('forward', 'director')).toBe(true);
		expect(store.playCameraPreview()).toBe(true);
		expect(store.cameraPreview?.transport).toBe('playing');

		expect(store.setLeftPanel('assets')).toBe(true);
		expect(store.setTimelineExpanded(true)).toBe(true);
		expect(store.toggleClusterTreeExpansion('cluster-a')).toBe(true);
		expect(store.leftPanel).toBe('assets');
		expect(store.timelineExpanded).toBe(true);

		// Workspace switching is chrome too; leaving Camera keeps its
		// preview-teardown contract.
		expect(store.setWorkspace('scene')).toBe(true);
		expect(store.cameraPreview).toBeNull();
	});
});
