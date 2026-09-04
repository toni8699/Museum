import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import { cloneFixtureDocument } from '../content/__fixtures__/load-fixture-scene';
import { chopinRuntime } from '$lib/content/chopin-project';
import { createEditorStore } from '$lib/editor/editor-store.svelte';
import { registerVerifiedProjectAsset } from '$lib/editor/helpers/register-verified-project-asset';
import { sha256Bytes } from '@portfolio/project-model';
import type { TextureVerificationResult } from '$lib/editor/texture-verifier';

const LIB_DIR = fileURLToPath(new URL('../../../src/lib', import.meta.url));

function readLibSource(relativePath: string): string {
	return readFileSync(`${LIB_DIR}/${relativePath}`, 'utf8');
}

describe('P20.2 Spatial registry integration', () => {
	it('keeps registry lifecycle in the main app and the relic out of it', () => {
		const app = readLibSource('editor/app/EditorApp.svelte');
		const sidebar = readLibSource('editor/app/EditorSidebar.svelte');
		const library = readLibSource('editor/EditorAssetLibrary.svelte');
		const upload = readLibSource('editor/project-asset-upload.ts');
		const relic = readLibSource('editor/MuseumEditorApp.svelte');

		for (const method of ['listAssets', 'registerAsset', 'loadAssetContent']) {
			expect(app).toMatch(new RegExp(`projectApi!?\\.${method}`));
		}
		expect(app).toContain('completeProjectAssetUpload');
		expect(upload).toMatch(/api\.uploadAsset/);
		expect(sidebar).toContain('onAcceptProjectTexture');
		expect(sidebar).toContain('BinaryTextureStore.objectUrlFor(uri) ?? uri');
		expect(sidebar).toContain("source.startsWith('/project-assets/') ? null : source");
		expect(library).toContain('Cloud file');
		expect(library).toContain('resolveTextureImageSrc = (uri: string) => uri');
		expect(library).not.toContain('BinaryTextureStore');
		expect(library).not.toContain('<img src={texture.uri}');
		expect(app).toContain('store.document.textures.some((texture) => texture.uri === uri)');
		expect(library.indexOf('file.size > PROJECT_ASSET_MAX_BYTES')).toBeLessThan(
			library.indexOf('file.arrayBuffer()')
		);
		expect(relic).not.toContain('createProjectApi');
	});

	it('does not invoke cache registration for an integrity mismatch', async () => {
		const bytes = new Uint8Array([1, 2, 3]);
		const register = vi.fn();
		const expectedSha256 = await sha256Bytes(new Uint8Array([4, 5, 6]));

		await expect(registerVerifiedProjectAsset(bytes, expectedSha256, register)).rejects.toMatchObject({
			code: 'invalid'
		});
		expect(register).not.toHaveBeenCalled();

		await registerVerifiedProjectAsset(bytes, await sha256Bytes(bytes), register);
		expect(register).toHaveBeenCalledWith(await sha256Bytes(bytes));
	});

	it('drops stale async texture registration before it can create history', async () => {
		let resolveVerification!: (result: TextureVerificationResult) => void;
		const verifier = () =>
			new Promise<TextureVerificationResult>((resolve) => {
				resolveVerification = resolve;
			});
		const store = createEditorStore({
			document: cloneFixtureDocument(),
			rooms: chopinRuntime.rooms,
			textureVerifier: verifier
		});
		const before = JSON.stringify(store.document);
		const historyBefore = store.historyVersion;
		let current = true;
		const pending = store.registerTexture(
			'Cloud texture',
			'/project-assets/123e4567-e89b-12d3-a456-426614174000',
			() => current
		);

		current = false;
		resolveVerification({ status: 'ready' });

		expect(await pending).toBeNull();
		expect(JSON.stringify(store.document)).toBe(before);
		expect(store.historyVersion).toBe(historyBefore);
	});

	it('keeps accepted cloud textures on the existing assignment path', async () => {
		const store = createEditorStore({
			document: cloneFixtureDocument(),
			rooms: chopinRuntime.rooms,
			textureVerifier: async () => ({ status: 'ready' })
		});
		const textureId = await store.registerTexture(
			'Cloud texture',
			'/project-assets/123e4567-e89b-12d3-a456-426614174000'
		);
		const historyAfterRegister = store.historyVersion;
		store.document.entities.push({
			kind: 'primitive',
			primitive: 'box',
			id: 'cloud-assignment-box',
			name: 'Cloud Assignment Box',
			roomId: 'paris',
			position: [1, 0, 1],
			rotation: [0, 0, 0],
			dimensions: { width: 1, height: 1, depth: 1 },
			materialId: 'wood-walnut',
			castShadow: true,
			receiveShadow: true
		});

		expect(textureId).toBe('cloud-texture');
		expect(store.requestTextureAssignment('cloud-assignment-box', textureId!)).toBe(true);
		expect(store.selectedPlacementId).toBe('cloud-assignment-box');
		expect(store.historyVersion).toBeGreaterThan(historyAfterRegister);
		expect(
			store.document.materials.find((material) => material.id === 'cloud-assignment-box-material')
				?.baseTextureId
		).toBe(textureId);
	});
});
