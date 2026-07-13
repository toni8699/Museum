import { describe, expect, it } from 'vitest';
import { museumSceneDocument } from '$lib/content/scene';
import {
	cloneMuseumSceneDocument,
	createMuseumEditorStore,
	EDITOR_BRIGHT_LIGHTING,
	EDITOR_VISITOR_LIGHTING
} from './museum-editor.svelte';

describe('cloneMuseumSceneDocument', () => {
	it('does not mutate the checked-in museumSceneDocument singleton', () => {
		const clone = cloneMuseumSceneDocument(museumSceneDocument);
		const originalFirstId = museumSceneDocument.objects[0]?.id;
		const originalObjectCount = museumSceneDocument.objects.length;

		clone.objects[0]!.id = 'mutated-placement-id';
		clone.objects.push({
			...clone.objects[0]!,
			id: 'extra-placement'
		});

		expect(museumSceneDocument.objects[0]?.id).toBe(originalFirstId);
		expect(museumSceneDocument.objects).toHaveLength(originalObjectCount);
		expect(clone.objects[0]?.id).toBe('mutated-placement-id');
		expect(clone.objects).toHaveLength(originalObjectCount + 1);
	});
});

describe('createMuseumEditorStore', () => {
	it('resolves default object and node counts from a session clone', () => {
		const store = createMuseumEditorStore();

		expect(store.document).not.toBe(museumSceneDocument);
		expect(store.document.objects).toHaveLength(museumSceneDocument.objects.length);
		expect(store.document.navigationNodes).toHaveLength(
			museumSceneDocument.navigationNodes.length
		);
		expect(store.scene.objects).toHaveLength(museumSceneDocument.objects.length);
		expect(store.scene.navigationNodes).toHaveLength(
			museumSceneDocument.navigationNodes.length
		);
		expect(store.state.activeNodeId).toBe('paris-seat');
		expect(store.state.currentRoomId).toBe('paris');
	});

	it('keeps the checked-in document intact when the session document mutates', () => {
		const store = createMuseumEditorStore();
		const originalFirstId = museumSceneDocument.objects[0]?.id;

		store.document.objects[0]!.id = 'session-only-id';

		expect(museumSceneDocument.objects[0]?.id).toBe(originalFirstId);
		expect(store.document.objects[0]?.id).toBe('session-only-id');
	});

	it('defaults to bright editor lighting and can restore the visitor preset', () => {
		const store = createMuseumEditorStore();

		expect(store.ambientIntensity).toBe(EDITOR_BRIGHT_LIGHTING.ambientIntensity);
		expect(store.fogEnabled).toBe(false);

		store.applyLightingPreset(EDITOR_VISITOR_LIGHTING);

		expect(store.ambientIntensity).toBe(EDITOR_VISITOR_LIGHTING.ambientIntensity);
		expect(store.directionalIntensity).toBe(EDITOR_VISITOR_LIGHTING.directionalIntensity);
		expect(store.fogEnabled).toBe(true);
	});
});
