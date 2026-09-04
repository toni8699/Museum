import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { sha256Bytes } from '@portfolio/project-model';
import { hydrateProjectAssets, ownsProjectLoad } from '$lib/editor/project-asset-load';
import type {
	ProjectApi,
	ProjectAssetContent,
	ProjectAssetMetadata
} from '$lib/editor/project-persistence';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const LIB_DIR = fileURLToPath(new URL('../../../src/lib', import.meta.url));

async function readyAsset(overrides: Partial<ProjectAssetMetadata> = {}): Promise<ProjectAssetMetadata> {
	return {
		id: 'asset-1',
		projectId: 'project-1',
		name: 'Wall Detail',
		kind: 'texture',
		storageKind: 'r2',
		sourceKind: 'upload',
		sourceRef: null,
		mime: 'image/png',
		byteSize: PNG_BYTES.byteLength,
		sha256: await sha256Bytes(PNG_BYTES),
		importState: 'ready',
		createdAt: '2026-09-03T00:00:00.000Z',
		updatedAt: '2026-09-03T00:00:00.000Z',
		...overrides
	};
}

function setup(assets: ProjectAssetMetadata[], content: ProjectAssetContent = { mime: 'image/png', bytes: PNG_BYTES }) {
	const listAssets = vi.fn(async () => assets);
	const loadAssetContent = vi.fn(async () => content);
	const getEntry = vi.fn<
		(uri: string) => { bytes: Uint8Array; mime: string; fingerprint: string; objectUrl: string | null } | null
	>(() => null);
	const controller = new AbortController();
	return {
		input: {
			projectId: 'project-1',
			textures: [{ uri: '/project-assets/asset-1' }],
			api: { listAssets, loadAssetContent } as Pick<ProjectApi, 'listAssets' | 'loadAssetContent'>,
			cache: { getEntry },
			signal: controller.signal,
			isCurrent: () => true
		},
		listAssets,
		loadAssetContent,
		getEntry,
		controller
	};
}

describe('P20.4 load-time asset resolution', () => {
	it('leaves projects without logical asset refs on the existing load path', async () => {
		const state = setup([]);
		state.input.textures = [{ uri: '/museum/textures/wall.png' }];

		expect(await hydrateProjectAssets(state.input)).toEqual({ assets: null, staged: [] });
		expect(state.listAssets).not.toHaveBeenCalled();
	});

	it('deduplicates refs and reuses metadata-matching verified cache bytes', async () => {
		const asset = await readyAsset();
		const state = setup([asset]);
		state.input.textures = [
			{ uri: '/project-assets/asset-1' },
			{ uri: '/project-assets/asset-1' }
		];
		state.getEntry.mockReturnValue({
			bytes: PNG_BYTES,
			mime: asset.mime!,
			fingerprint: asset.sha256!,
			objectUrl: null
		});

		const result = await hydrateProjectAssets(state.input);
		expect(result).toEqual({ assets: [asset], staged: [] });
		expect(state.getEntry).toHaveBeenCalledTimes(1);
		expect(state.loadAssetContent).not.toHaveBeenCalled();
	});

	it('fetches and stages verified bytes without mutating the injected cache', async () => {
		const asset = await readyAsset();
		const state = setup([asset]);

		const result = await hydrateProjectAssets(state.input);
		expect(result.staged).toEqual([
			{
				uri: '/project-assets/asset-1',
				bytes: PNG_BYTES,
				mime: 'image/png',
				fingerprint: asset.sha256
			}
		]);
		expect(state.loadAssetContent).toHaveBeenCalledWith(
			'project-1',
			'asset-1',
			state.controller.signal
		);
	});

	it.each([
		['missing', async () => []],
		['duplicate', async () => [await readyAsset(), await readyAsset()]],
		['foreign', async () => [await readyAsset({ projectId: 'project-2' })]],
		['pending', async () => [await readyAsset({ importState: 'pending' })]],
		['failed', async () => [await readyAsset({ importState: 'failed' })]],
		['wrong kind', async () => [await readyAsset({ kind: 'procedural' })]],
		['wrong storage', async () => [await readyAsset({ storageKind: 'none' })]],
		['wrong source', async () => [await readyAsset({ sourceKind: 'builtin' })]],
		['oversized', async () => [await readyAsset({ byteSize: 25 * 1024 * 1024 + 1 })]],
		['incomplete', async () => [await readyAsset({ sha256: null })]]
	])('rejects %s registry metadata before content fetch', async (_case, makeAssets) => {
		const state = setup(await makeAssets());
		await expect(hydrateProjectAssets(state.input)).rejects.toMatchObject({ code: 'invalid' });
		expect(state.loadAssetContent).not.toHaveBeenCalled();
	});

	it.each([
		['response MIME', { mime: 'image/jpeg' as const, bytes: PNG_BYTES }],
		['byte size', { mime: 'image/png' as const, bytes: PNG_BYTES.slice(0, 7) }],
		['sniffed MIME', { mime: 'image/png' as const, bytes: new Uint8Array(PNG_BYTES.length) }]
	])('rejects a %s mismatch atomically', async (_case, content) => {
		const state = setup([await readyAsset()], content);
		await expect(hydrateProjectAssets(state.input)).rejects.toMatchObject({ code: 'invalid' });
	});

	it('rejects a SHA mismatch after MIME and size validation', async () => {
		const asset = await readyAsset({ sha256: await sha256Bytes(new Uint8Array([1, 2, 3])) });
		const state = setup([asset]);
		await expect(hydrateProjectAssets(state.input)).rejects.toMatchObject({ code: 'invalid' });
	});

	it('propagates content authorization and network failures without a staged result', async () => {
		const state = setup([await readyAsset()]);
		state.input.api.loadAssetContent = vi.fn(async () => {
			throw new Error('network');
		});
		await expect(hydrateProjectAssets(state.input)).rejects.toThrow('network');
	});

	it('stops after a request becomes stale and returns no staged result', async () => {
		const asset = await readyAsset();
		let finish!: (content: ProjectAssetContent) => void;
		let current = true;
		const state = setup([asset]);
		state.input.isCurrent = () => current;
		state.input.api.loadAssetContent = vi.fn(
			() => new Promise<ProjectAssetContent>((resolve) => (finish = resolve))
		);
		const pending = hydrateProjectAssets(state.input);
		await vi.waitFor(() => expect(state.input.api.loadAssetContent).toHaveBeenCalled());
		current = false;
		finish({ mime: 'image/png', bytes: PNG_BYTES });

		await expect(pending).rejects.toMatchObject({ code: 'invalid' });
	});

	it('wires hydration before replacement and keeps both relics resolver-free', () => {
		const app = readFileSync(`${LIB_DIR}/editor/app/EditorApp.svelte`, 'utf8');
		const relic = readFileSync(`${LIB_DIR}/editor/MuseumEditorApp.svelte`, 'utf8');
		const load = app.slice(app.indexOf('async function loadProject'));

		expect(load.indexOf('await hydrateProjectAssets')).toBeLessThan(
			load.indexOf('store.replaceProjectDocument')
		);
		expect(load.indexOf('BinaryTextureStore.register')).toBeLessThan(
			load.indexOf('store.replaceProjectDocument')
		);
		expect(load).toContain("projectAssetsStatus = 'ready'");
		expect(relic).not.toContain('hydrateProjectAssets');
		expect(relic).not.toContain('project-asset-load');
	});

	it('supersedes an active project request on Load, Save, or sign-out', () => {
		const app = readFileSync(`${LIB_DIR}/editor/app/EditorApp.svelte`, 'utf8');
		const load = app.slice(app.indexOf('async function loadProject'));
		const save = app.slice(app.indexOf('async function saveProject'), app.indexOf('async function continueSaveAuthentication'));
		const signOut = app.slice(app.indexOf('async function signOutFromProjects'), app.indexOf('async function saveProject'));

		expect(load).toContain('canStartProjectMutation(true)');
		expect(load).toContain('cancelProjectMutation();');
		expect(save).toContain('cancelProjectMutation();');
		expect(signOut).toContain('cancelProjectMutation();');
	});

	it('does not let a stale overlapping Load prune the replacement Load cache', () => {
		const first = new AbortController();
		const second = new AbortController();
		const cache = new Set(['/project-assets/replacement']);
		const retain = vi.fn(() => cache.clear());
		const cleanup = (token: number, controller: AbortController) => {
			if (ownsProjectLoad(token, controller, 2, second) && !controller.signal.aborted) retain();
		};

		cleanup(1, first);

		expect(cache).toEqual(new Set(['/project-assets/replacement']));
		expect(retain).not.toHaveBeenCalled();
		expect(ownsProjectLoad(2, second, 2, second)).toBe(true);

		const app = readFileSync(`${LIB_DIR}/editor/app/EditorApp.svelte`, 'utf8');
		const loadCatch = app.slice(app.indexOf('} catch (error) {', app.indexOf('async function loadProject')));
		expect(loadCatch.indexOf('ownsProjectLoad(')).toBeLessThan(
			loadCatch.indexOf('retainCurrentSceneTextureBytes();')
		);
	});
});
