import { describe, expect, it } from 'vitest';
import { chopinRuntime } from '$lib/content/chopin-project';
import { createFixtureEditorStore } from '../editor-test-utils';
import { cloneFixtureDocument } from '../../content/__fixtures__/load-fixture-scene';
import { createEditorStore } from '$lib/editor/editor-store.svelte';
import { useCameraTimeline } from '$lib/editor/hooks/use-camera-timeline.svelte';
import {
	createEdgeLocalTimeline,
	createEditorCameraTimeline
} from '$lib/editor/camera/editor-camera-timeline';
import { CameraRouteError, getFlowRoute } from '$lib/museum/navigation/camera-route';

/**
 * P11.3 — scope-aware timeline shell (slice verification gate, §12).
 *
 * Scope-first projection per the §10 table: Camera is static (no ruler /
 * lanes / time), Edge renders the edge-local ruler with lanes hidden even
 * when the global Sequence cannot build, Sequence/idle keep the global ruler
 * + Dots. One `{ timeline, diagnostic }` boundary (§9) maps the typed
 * `CameraRouteError` (no-flow / gap) and derives the invalid-target marker
 * from canonical selection — never from parsed status strings.
 */

/** A document with every flow link cleared → no-flow timeline build. */
function unsequencedDocument() {
	const doc = cloneFixtureDocument();
	doc.navigationNodes.forEach((node) => {
		delete (node as { nextNodeId?: string }).nextNodeId;
		delete (node as { previousNodeId?: string }).previousNodeId;
	});
	return doc;
}

describe('P11.3 scope-first projection (per §10 table)', () => {
	it('Camera scope → static: no ruler/lanes/time even while a buildable Sequence exists', () => {
		const store = createFixtureEditorStore();
		expect(store.previewCamera('tour-paris', 'director')).toBe(false);
		const unsequenced = createEditorStore({
			document: unsequencedDocument(),
			rooms: chopinRuntime.rooms
		});
		expect(unsequenced.previewCamera('tour-a', 'director')).toBe(true);
		// The global Sequence builds — the projection must still be static.
		expect(unsequenced.getCameraTimeline()).toBeNull();

		const api = useCameraTimeline(unsequenced);
		expect(api.scope).toBe('camera');
		expect(api.timelineResult.timeline).toBeNull();
		expect(api.timelineResult.diagnostic).toEqual({ kind: 'ok' });
	});

	it('Edge scope → edge-local timeline data for the local ruler', () => {
		const store = createFixtureEditorStore();
		expect(store.previewEdge('tour-a-b', 'forward', 'director')).toBe(true);

		const api = useCameraTimeline(store);
		expect(api.scope).toBe('edge');
		const result = api.timelineResult;
		expect(result.diagnostic).toEqual({ kind: 'ok' });
		expect(result.timeline).not.toBeNull();
		expect((result.timeline as { connectionId: string }).connectionId).toBe('tour-a-b');
		expect((result.timeline as { durationSeconds: number }).durationSeconds).toBeGreaterThan(0);
	});

	it('Sequence scope / idle → global timeline data', () => {
		const store = createFixtureEditorStore();
		const idle = useCameraTimeline(store);
		expect(idle.scope).toBe('idle');
		expect(idle.timelineResult.timeline).not.toBeNull();
		expect(idle.timelineResult.diagnostic).toEqual({ kind: 'ok' });

		expect(store.previewSequence('director')).toBe(true);
		const sequence = useCameraTimeline(store);
		expect(sequence.scope).toBe('sequence');
		expect(sequence.timelineResult.timeline).not.toBeNull();
		expect(sequence.timelineResult.diagnostic).toEqual({ kind: 'ok' });
	});

	it('Camera scope transport is inert — ▶ never starts the Sequence', () => {
		const store = createEditorStore({
			document: unsequencedDocument(),
			rooms: chopinRuntime.rooms
		});
		expect(store.previewCamera('tour-a', 'director')).toBe(true);
		expect(store.cameraPreview).toMatchObject({ kind: 'camera', transport: 'paused' });

		useCameraTimeline(store).toggleTourPlayback();

		expect(store.cameraPreview).toMatchObject({ kind: 'camera', transport: 'paused' });
		expect(store.cameraTimelinePlayhead).toBe(0);
	});
});

describe('P11.3 exact Play/Pause grammar (§5)', () => {
	it('paused uses Play, playing uses Pause, at end still uses Play — Resume is gone', () => {
		const store = createFixtureEditorStore();
		expect(store.previewEdge('tour-a-b', 'forward', 'director')).toBe(true);
		const api = useCameraTimeline(store);
		expect(api.playLabel).toBe('Play');

		expect(store.playCameraPreview()).toBe(true);
		expect(api.playLabel).toBe('Pause');

		const runId = store.cameraPreview!.runId;
		expect(store.markCameraPreviewStarted(runId, 1000)).toBe(true);
		expect(store.completeCameraPreview(runId)).toBe(true);
		expect(store.cameraPreview).toMatchObject({ kind: 'edge', transport: 'paused' });
		expect(api.playLabel).toBe('Play');
	});

	it('sequence scope follows the same grammar; idle keeps the default Sequence label', () => {
		const store = createFixtureEditorStore();
		expect(store.previewSequence('director')).toBe(true);
		const api = useCameraTimeline(store);
		expect(api.playLabel).toBe('Pause');
		expect(store.pauseCameraPreview()).toBe(true);
		expect(api.playLabel).toBe('Play');
		expect(store.stopCameraPreview()).toBe(true);
		expect(api.playLabel).toBe('Play camera flow');
	});
});

describe('P11.3 Edge scope with an unbuildable Sequence (§9)', () => {
	it('valid selected Edge renders the edge-local ruler even when Sequence cannot build', () => {
		const store = createEditorStore({
			document: unsequencedDocument(),
			rooms: chopinRuntime.rooms
		});
		expect(store.getCameraTimeline()).toBeNull();
		expect(store.previewEdge('tour-a-b', 'forward', 'director')).toBe(true);

		const api = useCameraTimeline(store);
		expect(api.scope).toBe('edge');
		const result = api.timelineResult;
		expect(result.diagnostic).toEqual({ kind: 'ok' });
		expect(result.timeline).not.toBeNull();
		expect((result.timeline as { connectionId: string }).connectionId).toBe('tour-a-b');
		expect((result.timeline as { durationSeconds: number }).durationSeconds).toBeGreaterThan(0);
	});
});

describe('P11.3 scope capsule (§4)', () => {
	it('agrees with canonical selection after every successful scope install', () => {
		const store = createFixtureEditorStore();
		const api = useCameraTimeline(store);
		expect(api.scopeCapsule).toBeNull(); // idle — workspace label owns the header

		const cameraStore = createEditorStore({
			document: unsequencedDocument(),
			rooms: chopinRuntime.rooms
		});
		const cameraApi = useCameraTimeline(cameraStore);
		expect(cameraStore.previewCamera('tour-a', 'director')).toBe(true);
		expect(cameraApi.scopeCapsule).toBe('Camera · Tour A: Entrance · Static');

		expect(store.previewEdge('tour-a-b', 'forward', 'director')).toBe(true);
		expect(api.scopeCapsule).toBe('Edge · Tour A: Entrance → Tour B: Departure');

		store.previewSequence('director');
		expect(api.scopeCapsule).toBe('Sequence');
	});

	it('failed invalid-target install: capsule names the retained scope, diagnostic names the invalid selection', () => {
		const store = createFixtureEditorStore();
		expect(store.previewEdge('tour-a-b', 'forward', 'director')).toBe(true);
		expect(store.previewSequence('director')).toBe(true);
		expect(store.pauseCameraPreview()).toBe(true);
		// Retained Sequence scope + canonical selection pointing at a deleted edge.
		store.document.connections = store.document.connections.filter((c) => c.id !== 'tour-a-b');
		store.selection.setNavigation({
			kind: 'connection',
			connectionId: 'tour-a-b',
			direction: 'forward'
		});
		expect(store.cameraPreview).toMatchObject({ kind: 'sequence', transport: 'paused' });

		const api = useCameraTimeline(store);
		expect(api.scopeCapsule).toBe('Sequence');
		expect(api.timelineResult.diagnostic).toEqual({ kind: 'invalid-target' });
	});

	it('retained Camera scope over a stale node selection: capsule names the camera, diagnostic names the invalid selection', () => {
		const store = createEditorStore({
			document: unsequencedDocument(),
			rooms: chopinRuntime.rooms
		});
		expect(store.previewCamera('tour-a', 'director')).toBe(true);
		expect(store.cameraPreview).toMatchObject({ kind: 'camera', nodeId: 'tour-a' });
		// Canonical selection moves to a node deleted from the live document —
		// the retained-scope failed-install shell §9 pins (the seam refuses and
		// keeps the prior Camera scope; the panel must render the marker in the
		// Camera branch too, not only edge/sequence/idle).
		store.document.navigationNodes = store.document.navigationNodes.filter(
			(node) => node.id !== 'tour-b'
		);
		store.selection.setNavigation({ kind: 'node', nodeId: 'tour-b', handle: 'position' });

		const api = useCameraTimeline(store);
		expect(api.scope).toBe('camera');
		expect(api.scopeCapsule).toBe('Camera · Tour A: Entrance · Static');
		expect(api.timelineResult.diagnostic).toEqual({ kind: 'invalid-target' });
	});
});

describe('P11.3 diagnostics from the single { timeline, diagnostic } boundary (§9)', () => {
	it('no-flow maps to the typed kind (never a status string)', () => {
		const doc = unsequencedDocument();
		const store = createEditorStore({ document: doc, rooms: chopinRuntime.rooms });
		const api = useCameraTimeline(store);

		expect(api.timelineResult).toEqual({
			timeline: null,
			diagnostic: { kind: 'no-flow' },
			lastEvaluableBoundary: null
		});

		try {
			createEditorCameraTimeline(store.state.graph);
			expect.unreachable('no-flow build should throw');
		} catch (error) {
			expect(error).toBeInstanceOf(CameraRouteError);
			expect((error as CameraRouteError).kind).toBe('no-flow');
		}
	});

	it('typed gap carries the missing connection endpoints', () => {
		// The codec keeps documents gap-free (tour links must be adjacency-
		// backed and adjacency requires a connection), so the gap state lives
		// at the derived-graph layer — drive it like the defect test below.
		const store = createFixtureEditorStore();
		store.state.graph.connections = store.state.graph.connections.filter(
			(c) => c.id !== 'tour-a-b'
		);
		const api = useCameraTimeline(store);

		expect(api.timelineResult).toEqual({
			timeline: null,
			diagnostic: { kind: 'gap', fromNodeId: 'tour-a', toNodeId: 'tour-b' },
			lastEvaluableBoundary: null
		});

		try {
			getFlowRoute('tour-a', store.state.graph, { loop: true });
			expect.unreachable('gapped flow should throw');
		} catch (error) {
			expect(error).toBeInstanceOf(CameraRouteError);
			expect((error as CameraRouteError).kind).toBe('gap');
			expect((error as CameraRouteError).fromNodeId).toBe('tour-a');
			expect((error as CameraRouteError).toNodeId).toBe('tour-b');
		}
	});

	it('unexpected defect → status channel only, never a panel marker', () => {
		// The codec catches document-level defects, so the boundary's plain-
		// error path is driven by corrupting the derived runtime graph (a flow
		// link pointing at a node the graph no longer resolves).
		const store = createFixtureEditorStore();
		(store.state.graph.nodeById as Map<string, unknown>).delete('tour-b');
		const api = useCameraTimeline(store);

		const result = api.timelineResult;

		expect(result.timeline).toBeNull();
		// Single-report boundary: the defect lands in the status message, not
		// as a gap/no-flow/invalid-target marker.
		expect(result.diagnostic.kind).toBe('ok');
		expect(store.statusMessage).toMatch(/Unknown navigation node/i);
	});

	it('invalid-Edge marker derives from canonical selection and clears on selection change', () => {
		const store = createFixtureEditorStore();
		expect(store.selectionActions.selectConnection('tour-a-b')).toBe(true);
		// Delete the record under the canonical selection (graph staleness is
		// irrelevant: identity reads the live document, like the scope seam).
		store.document.connections = store.document.connections.filter((c) => c.id !== 'tour-a-b');
		store.cameraPreview = null; // harness write — idle shell

		const api = useCameraTimeline(store);
		expect(api.scope).toBe('idle');
		expect(api.scopeCapsule).toBeNull();
		expect(api.timelineResult.diagnostic).toEqual({ kind: 'invalid-target' });

		// Explicit Preview Edge clears the marker and enters the valid scope.
		expect(store.previewEdge('tour-b-paris', 'forward', 'director')).toBe(true);
		expect(api.timelineResult.diagnostic).toEqual({ kind: 'ok' });
		expect(api.scopeCapsule).toBe('Edge · Tour B: Departure → Tour Paris');
	});

	it('invalid-Camera marker derives from canonical selection and clears on selection change', () => {
		const store = createEditorStore({
			document: unsequencedDocument(),
			rooms: chopinRuntime.rooms
		});
		expect(store.previewCamera('tour-a', 'director')).toBe(true);
		store.document.navigationNodes = store.document.navigationNodes.filter(
			(node) => node.id !== 'tour-b'
		);
		const api = useCameraTimeline(store);
		store.selection.setNavigation({ kind: 'node', nodeId: 'tour-b', handle: 'position' });
		expect(api.timelineResult.diagnostic).toEqual({ kind: 'invalid-target' });

		expect(store.selectionActions.selectNavigationNode('tour-a')).toBe(true);
		expect(api.timelineResult.diagnostic).toEqual({ kind: 'ok' });
		expect(api.scopeCapsule).toBe('Camera · Tour A: Entrance · Static');
	});
});

describe('P11.3 createEdgeLocalTimeline identity-null contract (§9)', () => {
	it('returns null only for missing identity; genuine defects rethrow', () => {
		const store = createFixtureEditorStore();
		const graph = store.state.graph;

		expect(createEdgeLocalTimeline(graph, 'tour-a-b', 'backwards' as never)).toBeNull();
		expect(createEdgeLocalTimeline(graph, 'ghost-connection', 'forward')).toBeNull();

		const graphWithoutNode = {
			...graph,
			navigationNodes: graph.navigationNodes.filter((node) => node.id !== 'tour-a'),
			nodeById: new Map(
				graph.navigationNodes
					.filter((node) => node.id !== 'tour-a')
					.map((node) => [node.id, node])
			)
		};
		expect(createEdgeLocalTimeline(graphWithoutNode, 'tour-a-b', 'forward')).toBeNull();

		// A path with no points is a data defect, not an identity miss — it
		// must rethrow, not return null (the runtime graph always carries the
		// node endpoints, so corrupt the derived graph like the global defect
		// test above).
		(graph.connections.find((c) => c.id === 'tour-a-b') as any).positionPath.anchors = [];
		expect(() => createEdgeLocalTimeline(graph, 'tour-a-b', 'forward')).toThrow(
			/position anchors/i
		);
	});
});
