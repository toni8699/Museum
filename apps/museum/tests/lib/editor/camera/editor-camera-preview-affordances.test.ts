import { describe, expect, it } from 'vitest';

import { getCameraEdgePreviewChoices } from '$lib/editor/camera/editor-camera-preview-affordances';
import { cameraTimelineProgressAtEdgePlayhead } from '$lib/editor/camera/editor-camera-timeline';
import { createFixtureEditorStore } from '../editor-test-utils';

describe('P3B.5 camera preview affordances', () => {
	it('derives one sequence-edge direction from predecessor to immediate successor', () => {
		const store = createFixtureEditorStore();
		const [predecessor, successor] = store.guidedTourNodeIds;
		const connection = store.document.connections.find(
			(candidate) =>
				(candidate.fromNodeId === predecessor && candidate.toNodeId === successor) ||
				(candidate.fromNodeId === successor && candidate.toNodeId === predecessor)
		)!;
		const result = getCameraEdgePreviewChoices(
			store.document,
			store.guidedTourNodeIds,
			connection
		);
		expect(result.sequenceAdjacent).toBe(true);
		expect(result.choices).toHaveLength(1);
		expect(result.choices[0]).toMatchObject({ fromNodeId: predecessor, toNodeId: successor });
	});

	it('offers both labeled directions for a non-sequence-adjacent edge', () => {
		const store = createFixtureEditorStore();
		const connection = store.document.connections[0]!;
		const result = getCameraEdgePreviewChoices(store.document, [], connection);
		expect(result.sequenceAdjacent).toBe(false);
		expect(result.choices.map((item) => item.direction)).toEqual(['forward', 'reverse']);
		expect(result.choices.every((item) => item.label.includes('→'))).toBe(true);
	});

	it('changes named camera and edge preview scope without changing selection', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		const selectedNode = store.document.navigationNodes[0]!;
		const previewNode = store.document.navigationNodes.at(-1)!;
		store.selectionActions.selectNavigationNode(selectedNode.id);
		const selection = store.navigationSelection;

		expect(store.previewCamera(previewNode.id, 'visitor')).toBe(true);
		expect(store.cameraPreview).toMatchObject({ kind: 'camera', nodeId: previewNode.id });
		expect(store.navigationSelection).toEqual(selection);

		const connection = store.document.connections[0]!;
		expect(store.previewEdge(connection.id, 'reverse', 'director')).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'edge', connectionId: connection.id, direction: 'reverse'
		});
		expect(store.navigationSelection).toEqual(selection);
	});

	it('P11.1 migration — selection installs paused scopes and the ruler follows the scope', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		expect(store.seekCameraTimeline(0.41)).toBe(true);
		const node = store.document.navigationNodes.at(-1)!;
		expect(store.selectionActions.selectNavigationNode(node.id)).toBe(true);
		// Selection now installs the matching paused Camera scope…
		expect(store.cameraPreview).toMatchObject({
			kind: 'camera',
			nodeId: node.id,
			transport: 'paused'
		});
		// …and the global ruler follows the installed scope (supersedes the
		// P3B.5 "selection preserves the playhead" rule).
		expect(store.cameraTimelinePlayhead).toBeGreaterThanOrEqual(0);
		const connection = store.document.connections[0]!;
		expect(store.selectionActions.selectConnection(connection.id)).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'edge',
			connectionId: connection.id,
			direction: 'forward',
			transport: 'paused',
			playhead: 0
		});
		const timeline = store.getCameraTimeline();
		expect(timeline).not.toBeNull();
		expect(store.cameraTimelinePlayhead).toBe(
			cameraTimelineProgressAtEdgePlayhead(timeline!, connection.id, 'forward', 0)
		);
	});

	it('an explicit sequence action replaces a playing edge preview without selecting it', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		const selectedNode = store.document.navigationNodes[0]!;
		const connection = store.document.connections[0]!;
		store.selectionActions.selectNavigationNode(selectedNode.id);
		expect(store.previewEdge(connection.id, 'forward', 'director')).toBe(true);
		expect(store.playCameraPreview()).toBe(true);
		expect(store.previewSequence('director')).toBe(true);
		expect(store.cameraPreview?.kind).toBe('sequence');
		expect(store.navigationSelection).toMatchObject({ kind: 'node', nodeId: selectedNode.id });
	});
});
