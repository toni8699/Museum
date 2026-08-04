import { describe, expect, it } from 'vitest';
import { cloneFixtureDocument } from '$lib/content/__fixtures__/load-fixture-scene';
import { serializeSceneDocument } from '$lib/content/scene-codec';
import {
	cloneMuseumSceneDocument,
	createMuseumEditorStore,
	MuseumEditorStore,
	type MuseumSceneDocument
} from './museum-editor.svelte';
import { createFixtureEditorStore } from './editor-test-utils';
import type { TextureVerifier } from './texture-verifier';

describe('MuseumEditorStore Phase 5.2 texture facade', () => {
	const readyVerifier: TextureVerifier = async (uri) =>
		uri.includes('missing') || uri.includes('bad')
			? { success: false, code: 'load-failed', message: `failed: ${uri}` }
			: { success: true };

	function createTextureStore(verifier: TextureVerifier = readyVerifier) {
		const document = cloneFixtureDocument();
		return createMuseumEditorStore({ document, textureVerifier: verifier });
	}

	function registerTexture(store: MuseumEditorStore, uri: string) {
		return store.registerTexture('Warm Stone', uri);
	}

	it('registers one undoable texture after a successful load', async () => {
		const store = createTextureStore();
		const before = store.document.textures.length;

		const id = await registerTexture(store, '/textures/warm-stone/map.png');

		expect(id).toBe('warm-stone');
		expect(store.document.textures).toHaveLength(before + 1);
		expect(store.document.textures.at(-1)?.uri).toBe('/textures/warm-stone/map.png');
		expect(store.recentTextureIds).toContain(id);
		expect(store.canUndo).toBe(true);
		expect(store.undo()).toBe(true);
		expect(store.document.textures).toHaveLength(before);
		expect(store.redo()).toBe(true);
		expect(store.document.textures.at(-1)?.uri).toBe('/textures/warm-stone/map.png');
	});

	it('failed load leaves document and history untouched', async () => {
		const store = createTextureStore();
		const before = serializeSceneDocument(store.document);
		const historyBefore = store.historyVersion;

		const id = await registerTexture(store, '/textures/bad/map.png');

		expect(id).toBeNull();
		expect(serializeSceneDocument(store.document)).toBe(before);
		expect(store.historyVersion).toBe(historyBefore);
		expect(store.statusMessage).toBe('failed: /textures/bad/map.png');
	});

	it('unsafe URI is rejected before any loader call', async () => {
		let loaderCalls = 0;
		const verifier: TextureVerifier = async (uri) => {
			loaderCalls += 1;
			return { success: true };
		};
		const store = createTextureStore(verifier);

		expect(await registerTexture(store, 'https://evil.example/map.png')).toBeNull();
		expect(loaderCalls).toBe(0);
		expect(store.document.textures).toHaveLength(0);
	});

	it('exact duplicate URI reuses the existing texture without history', async () => {
		const store = createTextureStore();
		const first = await registerTexture(store, '/textures/dup/map.png');
		expect(first).not.toBeNull();
		const historyAfterFirst = store.historyVersion;
		const countAfterFirst = store.document.textures.length;

		const second = await registerTexture(store, '/textures/dup/map.png');

		expect(second).toBe(first);
		expect(store.document.textures).toHaveLength(countAfterFirst);
		expect(store.historyVersion).toBe(historyAfterFirst);
		expect(store.recentTextureIds[0]).toBe(first);
	});

	it('probeTexture reports load state without mutating the document', async () => {
		const store = createTextureStore();
		const id = await registerTexture(store, '/textures/probe/map.png');
		expect(id).not.toBeNull();
		const snapshot = serializeSceneDocument(store.document);

		expect(await store.probeTexture(id!)).toBe(true);
		expect(serializeSceneDocument(store.document)).toBe(snapshot);
		expect(store.textureLoadStates['/textures/probe/map.png']).toEqual({ status: 'ready' });
	});

	it('probeTexture flags a missing texture error without touching canonical JSON', async () => {
		const store = createTextureStore();
		// Imported documents may carry safe-but-unloadable URIs; probe must
		// badge the error without mutating or stripping the reference.
		store.document.textures.push({
			id: 'imported-missing',
			name: 'Imported Missing',
			uri: '/textures/missing/imported.png'
		});
		const snapshot = serializeSceneDocument(store.document);

		expect(await store.probeTexture('imported-missing')).toBe(false);
		expect(serializeSceneDocument(store.document)).toBe(snapshot);
		expect(store.textureLoadStates['/textures/missing/imported.png']).toMatchObject({
			status: 'error'
		});
	});

	it('primitive first assignment derives catalogue base and selects the entity', async () => {
		const store = createTextureStore();
		const textureId = await registerTexture(store, '/textures/assign/map.png');
		expect(textureId).not.toBeNull();
		// Fixture has two models; add one primitive to the session document.
		store.document.entities.push({
			kind: 'primitive',
			primitive: 'box',
			id: 'prim-assign',
			name: 'Assign Box',
			roomId: 'paris',
			position: [1, 0, 1],
			rotation: [0, 0, 0],
			dimensions: { width: 1, height: 1, depth: 1 },
			materialId: 'wood-walnut',
			castShadow: true,
			receiveShadow: true
		});

		expect(store.requestTextureAssignment('prim-assign', textureId!)).toBe(true);

		const primitive = store.document.entities.find(
			(entity) => entity.id === 'prim-assign' && entity.kind === 'primitive'
		);
		expect(primitive?.kind === 'primitive' ? primitive.materialInstanceId : null).not.toBeNull();
		const instanceId = primitive?.kind === 'primitive' ? primitive.materialInstanceId : null;
		const instance = store.document.materials.find((material) => material.id === instanceId);
		expect(instance?.baseMaterialId).toBe('wood-walnut');
		expect(instance?.baseTextureId).toBe(textureId);
		expect(store.selectedPlacementId).toBe('prim-assign');
		expect(store.canUndo).toBe(true);
	});

	it('model first assignment queues a base-material decision; confirm commits once', async () => {
		const store = createTextureStore();
		const textureId = await registerTexture(store, '/textures/model/map.png');
		expect(textureId).not.toBeNull();

		expect(store.requestTextureAssignment('fixture-chair', textureId!)).toBe(true);
		expect(store.pendingMaterialEdit?.needsBaseMaterial).toBe(true);
		expect(store.pendingMaterialEdit?.sharedMaterialInstanceId).toBeNull();
		expect(store.document.materials).toHaveLength(0);

		expect(store.confirmPendingMaterialEdit({ baseMaterialId: 'plaster-warm' })).toBe(true);
		expect(store.pendingMaterialEdit).toBeNull();
		const chair = store.document.entities.find((entity) => entity.id === 'fixture-chair');
		const instanceId = chair?.kind === 'model' ? chair.materialInstanceId : null;
		expect(instanceId).not.toBeNull();
		const instance = store.document.materials.find((material) => material.id === instanceId);
		expect(instance?.baseMaterialId).toBe('plaster-warm');
		expect(instance?.baseTextureId).toBe(textureId);
		expect(store.selectedPlacementId).toBe('fixture-chair');
		expect(store.canUndo).toBe(true);
	});

	it('cancel leaves the document unchanged and clears the pending request', async () => {
		const store = createTextureStore();
		const textureId = await registerTexture(store, '/textures/cancel/map.png');
		expect(textureId).not.toBeNull();
		const snapshot = serializeSceneDocument(store.document);

		expect(store.requestTextureAssignment('fixture-chair', textureId!)).toBe(true);
		expect(store.cancelPendingMaterialEdit()).toBe(true);
		expect(store.pendingMaterialEdit).toBeNull();
		expect(serializeSceneDocument(store.document)).toBe(snapshot);
	});

	it('makeMaterialInstanceUnique clones a shared instance and repoints one entity', async () => {
		const store = createTextureStore();
		const textureId = await registerTexture(store, '/textures/shared/map.png');
		expect(textureId).not.toBeNull();
		// Share one instance across both fixture models.
		store.document.materials.push({
			id: 'shared-instance',
			name: 'Shared Material',
			baseMaterialId: 'plaster-warm',
			baseTextureId: textureId ?? undefined
		});
		for (const entity of store.document.entities) {
			if (entity.kind === 'model') entity.materialInstanceId = 'shared-instance';
		}

		expect(store.makeMaterialInstanceUnique('fixture-chair')).toBe(true);

		const chair = store.document.entities.find((entity) => entity.id === 'fixture-chair');
		const chairInstanceId = chair?.kind === 'model' ? chair.materialInstanceId : null;
		expect(chairInstanceId).not.toBe('shared-instance');
		expect(store.document.materials.some((material) => material.id === chairInstanceId)).toBe(
			true
		);
		const piano = store.document.entities.find((entity) => entity.id === 'fixture-piano');
		expect(piano?.kind === 'model' ? piano.materialInstanceId : null).toBe('shared-instance');
		expect(store.canUndo).toBe(true);
		expect(store.undo()).toBe(true);
		expect(
			store.document.entities.find((entity) => entity.id === 'fixture-chair')?.kind === 'model'
				? (store.document.entities.find((entity) => entity.id === 'fixture-chair') as {
						materialInstanceId?: string;
				  }).materialInstanceId
				: null
		).toBe('shared-instance');
	});

	it('lights reject assignment with a status message and no mutation', async () => {
		const store = createTextureStore();
		const textureId = await registerTexture(store, '/textures/light/map.png');
		expect(textureId).not.toBeNull();

		store.document.entities.push({
			kind: 'light',
			light: 'point',
			id: 'light-reject',
			name: 'Reject Light',
			roomId: 'paris',
			position: [2, 2, 2],
			rotation: [0, 0, 0],
			color: '#ffffff',
			intensity: 1,
			castShadow: false
		});
		const snapshot = serializeSceneDocument(store.document);

		expect(store.requestTextureAssignment('light-reject', textureId!)).toBe(false);
		expect(store.statusMessage).toBe('Lights cannot accept material assignments');
		expect(serializeSceneDocument(store.document)).toBe(snapshot);
	});

	it('inspector patch on an unshared instance commits in one history entry', async () => {
		const store = createTextureStore();
		const textureId = await registerTexture(store, '/textures/inspect/map.png');
		expect(textureId).not.toBeNull();
		store.document.materials.push({
			id: 'inspect-instance',
			name: 'Inspect Material',
			baseMaterialId: 'wood-walnut'
		});
		// Reference the instance from exactly one entity so it is unshared.
		const chair = store.document.entities.find((entity) => entity.id === 'fixture-chair');
		if (chair?.kind === 'model') chair.materialInstanceId = 'inspect-instance';
		const historyBefore = store.historyVersion;

		expect(store.requestMaterialEdit('fixture-chair', { roughness: 0.42 })).toBe(true);

		const instance = store.document.materials.find(
			(material) => material.id === 'inspect-instance'
		);
		expect(instance?.roughness).toBe(0.42);
		expect(store.historyVersion).toBeGreaterThan(historyBefore);
		expect(store.undo()).toBe(true);
		expect(
			store.document.materials.find((material) => material.id === 'inspect-instance')
				?.roughness
		).toBeUndefined();
	});
});
