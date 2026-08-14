import { describe, expect, it } from 'vitest';

import { cloneFixtureDocument } from '../../content/__fixtures__/load-fixture-scene';
import { serializeSceneDocument } from '$lib/content/scene-codec';
import type { MuseumSceneDocument } from '$lib/content/scene';
import { museumSceneDocument } from '$lib/content/chopin-project';

import {
	cloneMuseumSceneDocument,
	EditorDocumentStore,
	pickInitialNavigationNodeId
} from '$lib/editor/store/document-store.svelte';

/**
 * Mutate a leaf of the scene document in a way the validator will accept
 * and that produces a distinct canonical JSON. `entities[0].rotation[1]` is
 * a float angle; nudging it 0.001 keeps the value plausible.
 */
function fingerprint(doc: MuseumSceneDocument): MuseumSceneDocument {
	const next = cloneMuseumSceneDocument(doc);
	const first = next.entities[0];
	if (!first) throw new Error('scene document has no entities');
	first.rotation = [
		first.rotation[0],
		first.rotation[1] + 0.001,
		first.rotation[2]
	] as typeof first.rotation;
	return next;
}

describe('EditorDocumentStore', () => {
	it('starts with the bundled scene document as the source of truth', () => {
		const store = new EditorDocumentStore();
		expect(store.document).toEqual(museumSceneDocument);
		expect(store.validation.success).toBe(true);
		expect(
			store.document.navigationNodes.some((node) => node.id === store.state.activeNodeId)
		).toBe(true);
		expect(store.state.activeNodeId).toBe(pickInitialNavigationNodeId(store.scene));
	});

	it('reports not-dirty at boot (baseline matches live canonical JSON)', () => {
		const store = new EditorDocumentStore();
		expect(store.isDirty).toBe(false);
		expect(store.canonicalJson).toBe(store.baselineCanonicalJson);
	});

	it('replace(next) swaps the document and rebuilds validation/scene/state', () => {
		const seed = cloneFixtureDocument();
		const store = new EditorDocumentStore(seed);
		const next = fingerprint(seed);
		store.replace(next);
		expect(store.document.entities[0]!.rotation[1]).not.toBe(seed.entities[0]!.rotation[1]);
		expect(store.isDirty).toBe(true);
		expect(store.canonicalJson).not.toBe(store.baselineCanonicalJson);
	});

	it('setBaseline(json) resets the dirty comparison', () => {
		const seed = cloneFixtureDocument();
		const store = new EditorDocumentStore(seed);
		store.replace(fingerprint(seed));
		expect(store.isDirty).toBe(true);
		store.setBaseline(serializeSceneDocument(store.document));
		expect(store.isDirty).toBe(false);
	});

	it('replace(next) fires every afterReplace listener in registration order', () => {
		const store = new EditorDocumentStore(cloneFixtureDocument());
		const calls: string[] = [];
		store.addAfterReplaceListener(() => calls.push('a'));
		store.addAfterReplaceListener(() => calls.push('b'));
		store.addAfterReplaceListener(() => calls.push('c'));
		store.replace(fingerprint(store.document));
		expect(calls).toEqual(['a', 'b', 'c']);
	});

	it('addAfterReplaceListener returns an unsubscribe handle', () => {
		const store = new EditorDocumentStore(cloneFixtureDocument());
		const calls: string[] = [];
		const unsub = store.addAfterReplaceListener(() => calls.push('keep'));
		const unsubDrop = store.addAfterReplaceListener(() => calls.push('drop'));
		unsubDrop();
		store.replace(fingerprint(store.document));
		expect(calls).toEqual(['keep']);
		unsub();
		store.replace(fingerprint(store.document));
		expect(calls).toEqual(['keep']);
	});

	it('listener exceptions are caught and logged without aborting the chain', () => {
		const store = new EditorDocumentStore(cloneFixtureDocument());
		const calls: string[] = [];
		const originalError = console.error;
		console.error = () => undefined;
		try {
			store.addAfterReplaceListener(() => {
				throw new Error('listener kaboom');
			});
			store.addAfterReplaceListener(() => calls.push('survivor'));
			store.replace(fingerprint(store.document));
			expect(calls).toEqual(['survivor']);
		} finally {
			console.error = originalError;
		}
	});

	it('documentsMatch(a, b) reflects JSON-shape equality', () => {
		const seed = cloneFixtureDocument();
		const a = cloneMuseumSceneDocument(seed);
		const b = cloneMuseumSceneDocument(seed);
		expect(EditorDocumentStore.documentsMatch(a, b)).toBe(true);
		const another = fingerprint(seed);
		expect(EditorDocumentStore.documentsMatch(a, another)).toBe(false);
	});

	it('cloneMuseumSceneDocument returns a deep-clone (not the same reference)', () => {
		const seed = cloneFixtureDocument();
		const cloned = cloneMuseumSceneDocument(seed);
		expect(cloned).toEqual(seed);
		expect(cloned).not.toBe(seed);
		cloned.entities[0]!.rotation[1] = 999;
		expect(seed.entities[0]!.rotation[1]).not.toBe(999);
	});
});
