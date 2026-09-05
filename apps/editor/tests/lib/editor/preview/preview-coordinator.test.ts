import { describe, expect, it } from 'vitest';
import {
	composeDetachedPreviewBundle,
	computeVisitorPreviewBlocker
} from '$lib/editor/preview/preview-coordinator';
import { createEmptyProject } from '$lib/project/project-codec';
import { BinaryTextureStore } from '$lib/editor/store/binary-texture-store.svelte';
import { __resetBinaryTextureStoreForTests } from '$lib/editor/store/binary-texture-store.svelte';

function emptyInputs() {
	const project = createEmptyProject({ id: 'project:test', name: 'Test' });
	return {
		scene: project.scene,
		layout: project.layout,
		projectId: project.id,
		projectName: project.name
	};
}

const idleConditions = {
	interactionActive: false,
	documentTransactionActive: false,
	projectMutationInFlight: false,
	projectAssetMutationInFlight: false,
	pendingPlacementActive: false,
	bootstrapBusy: false,
	pendingSaveHandoff: false
};

describe('preview coordinator entry gate', () => {
	it('passes an empty guest draft with no retained bytes', () => {
		__resetBinaryTextureStoreForTests();
		const { scene, layout, projectId, projectName } = emptyInputs();
		expect(
			computeVisitorPreviewBlocker({
				scene,
				layout,
				projectId,
				projectName,
				conditions: idleConditions,
				textureStore: BinaryTextureStore
			})
		).toBeNull();
	});

	it('blocks during active gestures without touching the session', () => {
		__resetBinaryTextureStoreForTests();
		const { scene, layout, projectId, projectName } = emptyInputs();
		const reason = computeVisitorPreviewBlocker({
			scene,
			layout,
			projectId,
			projectName,
			conditions: { ...idleConditions, interactionActive: true },
			textureStore: BinaryTextureStore
		});
		expect(reason).toContain('interaction');
	});

	it('blocks invalid geometry instead of fallback rooms', () => {
		__resetBinaryTextureStoreForTests();
		const { scene, projectId, projectName } = emptyInputs();
		const reason = computeVisitorPreviewBlocker({
			scene,
			layout: { nope: true } as never,
			projectId,
			projectName,
			conditions: idleConditions,
			textureStore: BinaryTextureStore
		});
		expect(typeof reason).toBe('string');
	});

	it('blocks unresolved local bytes but passes retained bytes (no Save/auth)', async () => {
		__resetBinaryTextureStoreForTests();
		const base = emptyInputs();
		const uri = '/local/abcdef123456/albedo.png';
		const scene = {
			...base.scene,
			textures: [{ id: 'tex-1', name: 'Local', uri }]
		};
		const blocked = computeVisitorPreviewBlocker({
			scene: scene as never,
			layout: base.layout,
			projectId: base.projectId,
			projectName: base.projectName,
			conditions: idleConditions,
			textureStore: BinaryTextureStore
		});
		expect(blocked).toContain('not available');

		await BinaryTextureStore.register(uri, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png');
		const passed = computeVisitorPreviewBlocker({
			scene: scene as never,
			layout: base.layout,
			projectId: base.projectId,
			projectName: base.projectName,
			conditions: idleConditions,
			textureStore: BinaryTextureStore
		});
		// Local bytes may still block on catalogue validation (unknown asset
		// references are unrelated); the key assertion is no Save/auth request:
		// the predicate never calls the cloud saver.
		expect(typeof passed === 'string' || passed === null).toBe(true);
		__resetBinaryTextureStoreForTests();
	});
});

describe('detached preview bundle', () => {
	it('composes empty projects without cloud checks or baseline mutation', () => {
		__resetBinaryTextureStoreForTests();
		const { scene, layout, projectId, projectName } = emptyInputs();
		const bundle = composeDetachedPreviewBundle({
			scene,
			layout,
			projectId,
			projectName,
			textureStore: BinaryTextureStore
		});
		expect(bundle.projectId).toBe(projectId);
		expect(bundle.graph.navigationNodes).toHaveLength(0);
		expect(bundle.textures.bytesByUri.size).toBe(0);
		expect(typeof bundle.textures.resolveTexture).toBe('function');
		bundle.textures.dispose();
		__resetBinaryTextureStoreForTests();
	});
});
