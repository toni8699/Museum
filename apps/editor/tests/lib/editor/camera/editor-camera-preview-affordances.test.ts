import { describe, expect, it } from 'vitest';

import { getCameraEdgePreviewChoices } from '$lib/editor/camera/editor-camera-preview-affordances';
import { chopinRuntime } from '$lib/content/chopin-project';
import { createEditorStore } from '$lib/editor/editor-store.svelte';
import { createFixtureEditorStore } from '../editor-test-utils';
import { cloneFixtureDocument } from '../../content/__fixtures__/load-fixture-scene';

function createStoreWithFreeCamera() {
	const document = cloneFixtureDocument();
	const template = document.navigationNodes[0]!;
	document.navigationNodes.push({
		...template,
		id: 'free-camera',
		label: 'Free Camera',
		connectedNodeIds: [],
		nextNodeId: undefined,
		previousNodeId: undefined
	});
	return createEditorStore({ document, rooms: chopinRuntime.rooms });
}

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

	it('explicit Camera and Edge preview commands change scope and canonical selection', () => {
		const store = createStoreWithFreeCamera();
		store.setWorkspace('camera');
		const selectedNode = store.document.navigationNodes[0]!;
		const previewNode = store.document.navigationNodes.at(-1)!;
		store.selectionActions.selectNavigationNode(selectedNode.id);

		expect(store.previewCamera(previewNode.id, 'visitor')).toBe(true);
		expect(store.cameraPreview).toMatchObject({ kind: 'camera', nodeId: previewNode.id });
		expect(store.navigationSelection).toMatchObject({ kind: 'node', nodeId: previewNode.id });

		const connection = store.document.connections[0]!;
		expect(store.previewEdge(connection.id, 'reverse', 'director')).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'edge', connectionId: connection.id, direction: 'reverse'
		});
		expect(store.navigationSelection).toMatchObject({ kind: 'connection', connectionId: connection.id });
	});

	it('P12.2 migration — selection preserves the active Sequence scope', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		expect(store.previewSequence('director')).toBe(true);
		const node = store.document.navigationNodes.at(-1)!;
		expect(store.selectionActions.selectNavigationNode(node.id)).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'sequence',
			transport: 'paused'
		});
		const connection = store.document.connections[0]!;
		expect(store.selectionActions.selectConnection(connection.id)).toBe(true);
		expect(store.cameraPreview).toMatchObject({
			kind: 'sequence',
			transport: 'paused'
		});
	});

	it('an explicit sequence action replaces a playing edge preview and keeps canonical selection', () => {
		const store = createFixtureEditorStore();
		store.setWorkspace('camera');
		const selectedNode = store.document.navigationNodes[0]!;
		const connection = store.document.connections[0]!;
		store.selectionActions.selectNavigationNode(selectedNode.id);
		expect(store.previewEdge(connection.id, 'forward', 'director')).toBe(true);
		expect(store.playCameraPreview()).toBe(true);
		expect(store.previewSequence('director')).toBe(true);
		expect(store.cameraPreview?.kind).toBe('sequence');
		expect(store.navigationSelection).toMatchObject({ kind: 'connection', connectionId: connection.id });
	});
});
