import { describe, expect, it } from 'vitest';

import { cloneFixtureDocument } from '../../content/__fixtures__/load-fixture-scene';
import { serializeSceneDocument } from '$lib/content/scene-codec';
import type { SceneDocument } from '$lib/content/scene';
import { sceneDocument, chopinRuntime } from '$lib/content/chopin-project';

import {
	cloneSceneDocument,
	EditorDocumentStore,
	pickInitialNavigationNodeId
} from '$lib/editor/store/document-store.svelte';

/**
 * Mutate a leaf of the scene document in a way the validator will accept
 * and that produces a distinct canonical JSON. `entities[0].rotation[1]` is
 * a float angle; nudging it 0.001 keeps the value plausible.
 */
function fingerprint(doc: SceneDocument): SceneDocument {
	const next = cloneSceneDocument(doc);
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
		const store = new EditorDocumentStore(sceneDocument, chopinRuntime.rooms);
		expect(store.document).toEqual(sceneDocument);
		expect(store.validation.success).toBe(true);
		expect(
			store.document.navigationNodes.some((node) => node.id === store.state.activeNodeId)
		).toBe(true);
		expect(store.state.activeNodeId).toBe(pickInitialNavigationNodeId(store.scene));
	});

	it('reports not-dirty at boot (baseline matches live canonical JSON)', () => {
		const store = new EditorDocumentStore(sceneDocument, chopinRuntime.rooms);
		expect(store.isDirty).toBe(false);
		expect(store.canonicalJson).toBe(store.baselineCanonicalJson);
	});

	it('replace(next) swaps the document and rebuilds validation/scene/state', () => {
		const seed = cloneFixtureDocument();
		const store = new EditorDocumentStore(seed, chopinRuntime.rooms);
		const next = fingerprint(seed);
		store.replace(next);
		expect(store.document.entities[0]!.rotation[1]).not.toBe(seed.entities[0]!.rotation[1]);
		expect(store.isDirty).toBe(true);
		expect(store.canonicalJson).not.toBe(store.baselineCanonicalJson);
	});

	it('setBaseline(json) resets the dirty comparison', () => {
		const seed = cloneFixtureDocument();
		const store = new EditorDocumentStore(seed, chopinRuntime.rooms);
		store.replace(fingerprint(seed));
		expect(store.isDirty).toBe(true);
		store.setBaseline(serializeSceneDocument(store.document));
		expect(store.isDirty).toBe(false);
	});

	it('P7.5 — isDirty is true for an invalid document even when canonical JSON matches baseline (pre-check)', () => {
		const seed = cloneFixtureDocument();
		const store = new EditorDocumentStore(seed, chopinRuntime.rooms);
		expect(store.validation.success).toBe(true);
		// Invalid: a node whose cameraTarget points at its own position is
		// rejected by the validator (same recipe as the facade import tests).
		const invalid = cloneSceneDocument(seed);
		invalid.navigationNodes[0]!.cameraTarget = [...invalid.navigationNodes[0]!.position];
		// Direct assignment through the public `$state` document seam —
		// `replace()` validates and would throw, so this pins the getter
		// semantics in isolation (the pre-check the sub-store used to drop).
		store.document = invalid;
		expect(store.validation.success).toBe(false);
		expect(store.validationIssues.length).toBeGreaterThan(0);
		// P7.5 pre-check adopted: invalid ⇒ dirty regardless of baseline,
		// without calling serializeSceneDocument (which would throw).
		expect(store.isDirty).toBe(true);
	});

	it('replace(next) fires every afterReplace listener in registration order', () => {
		const store = new EditorDocumentStore(cloneFixtureDocument(), chopinRuntime.rooms);
		const calls: string[] = [];
		store.addAfterReplaceListener(() => calls.push('a'));
		store.addAfterReplaceListener(() => calls.push('b'));
		store.addAfterReplaceListener(() => calls.push('c'));
		store.replace(fingerprint(store.document));
		expect(calls).toEqual(['a', 'b', 'c']);
	});

	it('addAfterReplaceListener returns an unsubscribe handle', () => {
		const store = new EditorDocumentStore(cloneFixtureDocument(), chopinRuntime.rooms);
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
		const store = new EditorDocumentStore(cloneFixtureDocument(), chopinRuntime.rooms);
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
		const a = cloneSceneDocument(seed);
		const b = cloneSceneDocument(seed);
		expect(EditorDocumentStore.documentsMatch(a, b)).toBe(true);
		const another = fingerprint(seed);
		expect(EditorDocumentStore.documentsMatch(a, another)).toBe(false);
	});

	it('cloneSceneDocument returns a deep-clone (not the same reference)', () => {
		const seed = cloneFixtureDocument();
		const cloned = cloneSceneDocument(seed);
		expect(cloned).toEqual(seed);
		expect(cloned).not.toBe(seed);
		cloned.entities[0]!.rotation[1] = 999;
		expect(seed.entities[0]!.rotation[1]).not.toBe(999);
	});

	it('replace(next) atomically rebuilds scene + state.graph — committed topology is never stale', () => {
		// Regression for the P8 S6 "stale graph" red herring: `state.graph`
		// is rebuilt on every successful replace (commit/undo/redo/import),
		// so route resolution always sees committed topology.
		const seed = cloneFixtureDocument();
		const store = new EditorDocumentStore(seed, chopinRuntime.rooms);
		const sceneBefore = store.scene;
		const graphBefore = store.state.graph;
		const connection = store.document.connections.find((candidate) => candidate.id === 'tour-paris-d');
		expect(connection).toBeDefined();

		// Simulate an authoring mutation: clear every interior anchor.
		connection!.positionPath.anchors = [];
		store.replace(store.document);

		// replace() swapped scene and state to fresh instances built from
		// the mutated document — no cached stale graph survives.
		expect(store.scene).not.toBe(sceneBefore);
		expect(store.state.graph).not.toBe(graphBefore);

		// The resolved scene always injects the two node endpoints, so a
		// zero-interior-anchor connection still resolves to exactly 2
		// anchors — a legal straight-line route, never an unresolvable
		// one (this is why the retired transition tests' "unroutable"
		// setups can never produce a route error through the exact-edge
		// command: resolved connections always have >= 2 anchors).
		const resolved = store.scene.connections.find(
			(candidate) => candidate.id === 'tour-paris-d'
		)!;
		expect(resolved.positionPath.anchors).toHaveLength(2);
		expect(resolved.positionPath.anchors[0]!.id).toContain('node:');
		expect(resolved.positionPath.anchors[1]!.id).toContain('node:');
	});
});
