import { describe, expect, it } from 'vitest';

import { EditorDocumentStore } from '$lib/editor/store/document-store.svelte';
import { EditorCameraPreviewController } from '$lib/editor/store/camera-preview-controller.svelte';
import { chopinRuntime } from '$lib/content/chopin-project';

function makeControllers() {
	const document = new EditorDocumentStore(undefined, chopinRuntime.rooms);
	const preview = new EditorCameraPreviewController(document);
	return { document, preview };
}

describe('EditorCameraPreviewController', () => {
	it('starts with no active preview and transportState === null', () => {
		const { preview } = makeControllers();
		expect(preview.preview).toBe(null);
		expect(preview.transportState).toBe(null);
		expect(preview.followEnabled).toBe(true);
		expect(preview.recenterVersion).toBe(0);
	});

	it('startNode() resets followEnabled + bumps recenter + sets transport=paused', () => {
		const { preview } = makeControllers();
		expect(preview.startNode('paris-seat', 'visitor')).toBe(true);
		expect(preview.preview?.kind).toBe('camera');
		expect(preview.preview?.transport).toBe('paused');
		expect(preview.transportState).toBe('paused');
		expect(preview.followEnabled).toBe(true);
		expect(preview.recenterVersion).toBe(1);
	});

	it('startNode() refuses when a preview is already active', () => {
		const { preview } = makeControllers();
		expect(preview.startNode('paris-seat', 'visitor')).toBe(true);
		expect(preview.startNode('paris-seat', 'visitor')).toBe(false);
	});

	it('startNode() refuses for a node that does not exist in the document', () => {
		const { preview } = makeControllers();
		expect(preview.startNode('not-a-node', 'visitor')).toBe(false);
		expect(preview.preview).toBe(null);
	});

	it('stop() drops the FSM to idle', () => {
		const { preview } = makeControllers();
		preview.startNode('paris-seat', 'visitor');
		expect(preview.stop()).toBe(true);
		expect(preview.preview).toBe(null);
		expect(preview.transportState).toBe(null);
		expect(preview.stop()).toBe(false); // already idle
	});

	it('toggleFollow() / recenter() are director-only', () => {
		const { preview } = makeControllers();
		preview.startNode('paris-seat', 'visitor');
		expect(preview.toggleFollow()).toBe(false); // visitor mode
		expect(preview.recenter()).toBe(false); // visitor mode
		preview.stop();
	});

	it('play() / pause() / complete() / markStarted() guard on playing state', () => {
		const { preview } = makeControllers();
		preview.startNode('paris-seat', 'visitor');
		// Node previews cannot play (transport stuck at paused).
		expect(preview.play()).toBe(false);
		expect(preview.pause()).toBe(false);
		expect(preview.markStarted(1, 1000)).toBe(false);
		expect(preview.complete(1)).toBe(false);
		preview.stop();
		// No preview → all calls refuse.
		expect(preview.play()).toBe(false);
		expect(preview.pause()).toBe(false);
		expect(preview.setPlayhead(0.5)).toBe(false);
	});

	it('setPlayhead() refuses when no preview is active', () => {
		const { preview } = makeControllers();
		expect(preview.setPlayhead(0.5)).toBe(false);
	});

	it('step() refuses for non-director previews or while playing', () => {
		const { preview } = makeControllers();
		preview.startNode('paris-seat', 'visitor');
		expect(preview.step(1)).toBe(false);
		preview.stop();
	});

	it('releaseIfTouches() drops the FSM when the preview source node is deleted', () => {
		const { preview } = makeControllers();
		preview.startNode('paris-seat', 'visitor');
		expect(preview.releaseIfTouches(['paris-seat'], [])).toBe(true);
		expect(preview.preview).toBe(null);
		expect(preview.releaseIfTouches(['something-else'], [])).toBe(false);
	});

	it('releaseIfTouches() is a no-op when there is no preview', () => {
		const { preview } = makeControllers();
		expect(preview.releaseIfTouches(['paris-seat'], [])).toBe(false);
	});

	it('pruneIfStale() is a no-op when no preview is active', () => {
		const { preview } = makeControllers();
		expect(preview.preview).toBe(null);
		preview.pruneIfStale();
		expect(preview.preview).toBe(null);
	});

	it('pruneIfStale() is a no-op while the source node still exists', () => {
		const { preview } = makeControllers();
		preview.startNode('paris-seat', 'visitor');
		const before = preview.preview;
		preview.pruneIfStale();
		// Source node still in document → preview survives pruneIfStale.
		expect(preview.preview).toBe(before);
	});

	it('pruneIfStale() drops the FSM when the source node is missing', () => {
		const { preview } = makeControllers();
		preview.startNode('paris-seat', 'visitor');
		// Simulate the post-afterReplace state where paris-seat has been
		// removed from the document. Direct proxy write mirrors the
		// integration scenario without needing to construct a
		// cross-ref-free document (museumSceneDocument references
		// paris-seat from connectedNodeIds — adding it back breaks
		// SceneDocumentValidationError). releaseIfTouches covers the
		// topology-mutation path; this covers the afterReplace-listener
		// path (audit §3.A.2 — `kind === 'camera'` branch).
		preview['preview'] = {
			kind: 'camera',
			nodeId: 'paris-deleted',
			mode: 'visitor',
			transport: 'paused',
			runId: 1,
			playhead: 0,
			startedAtMs: null
		};
		preview.pruneIfStale();
		expect(preview.preview).toBe(null);
	});

	it('pruneIfStale() is a no-op for an alive sequence preview', () => {
		const { preview } = makeControllers();
		// startTour() sets kind === 'sequence' and primes the timeline cache
		// for the live document. Subsequent pruneIfStale() enters the
		// `kind === 'sequence'` branch, re-resolves the timeline (still
		// resolvable from the live scene's guided tour), and skips the
		// drop-FSM defensive path. (audit §3.A.2 — `kind === 'sequence'`
		// alive path.)
		expect(preview.startTour('director')).toBe(true);
		expect(preview.preview?.kind).toBe('sequence');
		const before = preview.preview;
		preview.pruneIfStale();
		expect(preview.preview).toBe(before);
	});

	it('refreshPausedDirector() bumps runId for paused director node previews', () => {
		const { preview } = makeControllers();
		// refreshPausedDirector requires mode === 'director' AND transport
		// === 'paused'. Visitor mode previews are intentionally
		// early-returned. Camera/edge previews KEEP
		// refreshing (they are the framing-authoring surface — P8 S5 hard
		// reset applies to paused Director SEQUENCE previews only).
		preview.startNode('paris-seat', 'director');
		expect(preview.preview?.mode).toBe('director');
		expect(preview.preview?.transport).toBe('paused');
		const initialRunId = preview.preview?.runId ?? 0;
		expect(preview.refreshPausedDirector()).toBeNull();
		// Camera kind → capturedRoute cleared, runId bumped.
		expect(preview.preview?.runId).toBeGreaterThan(initialRunId);
		expect(preview.preview?.kind).toBe('camera');
	});

	it('refreshPausedDirector() hard-resets a paused director SEQUENCE preview', () => {
		const { preview } = makeControllers();
		// P8 S5 owner decision — hard reset is scoped to paused Director
		// SEQUENCE previews: any document swap stops them (a sequence is
		// not an authoring surface; re-resolving would silently re-map the
		// pause point onto edited flow content).
		expect(preview.startTour('director')).toBe(true);
		expect(preview.preview?.kind).toBe('sequence');
		expect(preview.preview?.transport).toBe('playing');
		preview.preview = { ...preview.preview!, transport: 'paused' };
		const error = preview.refreshPausedDirector();
		expect(error).toBeInstanceOf(Error);
		expect(preview.preview).toBeNull();
	});

	it('refreshPausedDirector() is a no-op for visitor-mode previews', () => {
		const { preview } = makeControllers();
		preview.startNode('paris-seat', 'visitor');
		const initialRunId = preview.preview?.runId ?? 0;
		expect(preview.refreshPausedDirector()).toBeNull();
		// Visitor mode → early return, runId unchanged.
		expect(preview.preview?.runId).toBe(initialRunId);
	});

	it('refreshPausedDirector() keeps edge previews and returns Error on route failure', () => {
		const { document, preview } = makeControllers();
		const connection = document.document.connections[0]!;
		expect(preview.startConnection(connection.id, 'forward', 'director')).toBe(true);
		expect(preview.preview?.kind).toBe('edge');
		const before = preview.preview;
		// Force a resolve failure by pointing at a missing connection.
		preview.preview = {
			kind: 'edge',
			connectionId: 'no-such-connection',
			direction: 'forward',
			fromNodeId: connection.fromNodeId,
			toNodeId: connection.toNodeId,
			mode: before!.mode,
			transport: 'paused',
			runId: before!.runId,
			playhead: before!.playhead,
			startedAtMs: before!.startedAtMs
		};
		const error = preview.refreshPausedDirector();
		expect(error).toBeInstanceOf(Error);
		// Non-sequence previews keep the refresh contract (P8 S5 hard reset
		// is sequence-scoped): the preview stays, route failure is reported.
		expect(preview.preview).toEqual({
			kind: 'edge',
			connectionId: 'no-such-connection',
			direction: 'forward',
			fromNodeId: connection.fromNodeId,
			toNodeId: connection.toNodeId,
			mode: before!.mode,
			transport: 'paused',
			runId: before!.runId,
			playhead: before!.playhead,
			startedAtMs: before!.startedAtMs
		});
	});

	it('returns isolated captured-route framing envelopes', () => {
		const { document, preview } = makeControllers();
		const connection = document.document.connections.find((candidate) => candidate.viewTracks);
		expect(connection).toBeDefined();
		if (!connection?.viewTracks) return;
		connection.viewTracks.framingEnvelope = {
			forward: { enterStart: 0.1, enterEnd: 0.2, exitStart: 0.8, exitEnd: 0.9 }
		};
		document.replace(document.document);
		expect(preview.startConnection(connection.id, 'forward', 'director')).toBe(true);
		const runId = preview.preview?.runId;
		expect(runId).toBeDefined();
		if (runId === undefined) return;
		const first = preview.getCapturedRoute(runId);
		expect(first?.edges[0]?.viewTrack?.framingEnvelope).toEqual({
			enterStart: 0.1,
			enterEnd: 0.2,
			exitStart: 0.8,
			exitEnd: 0.9
		});
		first!.edges[0]!.viewTrack!.framingEnvelope!.enterStart = 0.7;
		const second = preview.getCapturedRoute(runId);
		expect(second?.edges[0]?.viewTrack?.framingEnvelope?.enterStart).toBe(0.1);
		expect(document.document.connections.find((candidate) => candidate.id === connection.id)
			?.viewTracks?.framingEnvelope?.forward?.enterStart).toBe(0.1);
	});
});
