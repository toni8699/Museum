import { describe, expect, it } from 'vitest';

import { serializeSceneDocument } from '$lib/content/scene-codec';
import { museumSceneDocument, type MuseumSceneDocument } from '$lib/content/scene';

import {
	cloneMuseumSceneDocument,
	EditorDocumentStore
} from './document-store.svelte';

/**
 * Mutate a leaf of the scene document in a way the validator will accept
 * and that produces a distinct canonical JSON. `entities[0].rotation[1]` is
 * a float angle; nudging it 0.001 keeps the value plausible.
 */
function fingerprint(doc: MuseumSceneDocument): MuseumSceneDocument {
	const next = cloneMuseumSceneDocument(doc);
	const first = next.entities[0];
	if (!first) throw new Error('museumSceneDocument has no entities');
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
	});

	it('reports not-dirty at boot (baseline matches live canonical JSON)', () => {
		const store = new EditorDocumentStore();
		expect(store.isDirty).toBe(false);
		expect(store.canonicalJson).toBe(store.baselineCanonicalJson);
	});

	it('replace(next) swaps the document and rebuilds validation/scene/state', () => {
		const store = new EditorDocumentStore();
		const next = fingerprint(museumSceneDocument);
		store.replace(next);
		expect(store.document.entities[0]!.rotation[1]).not.toBe(
			museumSceneDocument.entities[0]!.rotation[1]
		);
		expect(store.isDirty).toBe(true);
		expect(store.canonicalJson).not.toBe(store.baselineCanonicalJson);
	});

	it('setBaseline(json) resets the dirty comparison', () => {
		const store = new EditorDocumentStore();
		store.replace(fingerprint(museumSceneDocument));
		expect(store.isDirty).toBe(true);
		store.setBaseline(serializeSceneDocument(store.document));
		expect(store.isDirty).toBe(false);
	});

	it('replace(next) fires every afterReplace listener in registration order', () => {
		const store = new EditorDocumentStore();
		const calls: string[] = [];
		store.addAfterReplaceListener(() => calls.push('a'));
		store.addAfterReplaceListener(() => calls.push('b'));
		store.addAfterReplaceListener(() => calls.push('c'));
		store.replace(fingerprint(museumSceneDocument));
		expect(calls).toEqual(['a', 'b', 'c']);
	});

	it('addAfterReplaceListener returns an unsubscribe handle', () => {
		const store = new EditorDocumentStore();
		const calls: string[] = [];
		const unsub = store.addAfterReplaceListener(() => calls.push('keep'));
		const unsubDrop = store.addAfterReplaceListener(() => calls.push('drop'));
		unsubDrop();
		store.replace(fingerprint(museumSceneDocument));
		expect(calls).toEqual(['keep']);
		unsub();
		store.replace(fingerprint(museumSceneDocument));
		expect(calls).toEqual(['keep']);
	});

	it('listener exceptions are caught and logged without aborting the chain', () => {
		const store = new EditorDocumentStore();
		const calls: string[] = [];
		const originalError = console.error;
		console.error = () => undefined;
		try {
			store.addAfterReplaceListener(() => {
				throw new Error('listener kaboom');
			});
			store.addAfterReplaceListener(() => calls.push('survivor'));
			store.replace(fingerprint(museumSceneDocument));
			expect(calls).toEqual(['survivor']);
		} finally {
			console.error = originalError;
		}
	});

	it('documentsMatch(a, b) reflects JSON-shape equality', () => {
		const a = cloneMuseumSceneDocument(museumSceneDocument);
		const b = cloneMuseumSceneDocument(museumSceneDocument);
		expect(EditorDocumentStore.documentsMatch(a, b)).toBe(true);
		const another = fingerprint(museumSceneDocument);
		expect(EditorDocumentStore.documentsMatch(a, another)).toBe(false);
	});

	it('cloneMuseumSceneDocument returns a deep-clone (not the same reference)', () => {
		const cloned = cloneMuseumSceneDocument(museumSceneDocument);
		expect(cloned).toEqual(museumSceneDocument);
		expect(cloned).not.toBe(museumSceneDocument);
		cloned.entities[0]!.rotation[1] = 999;
		expect(museumSceneDocument.entities[0]!.rotation[1]).not.toBe(999);
	});
});
