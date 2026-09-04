import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chopinRuntime } from '$lib/content/chopin-project';
import { cloneFixtureDocument } from '../content/__fixtures__/load-fixture-scene';
import { createEditorStore, type EditorStore } from '$lib/editor/editor-store.svelte';
import {
	completeProjectAssetUpload,
	type ProjectAssetRetry,
	type ProjectAssetUploadOperation
} from '$lib/editor/project-asset-upload';
import {
	BinaryTextureStore,
	__resetBinaryTextureStoreForTests
} from '$lib/editor/store/binary-texture-store.svelte';
import type { ProjectAssetMetadata } from '$lib/editor/project-persistence';
import { sha256Bytes } from '@portfolio/project-model';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function freshStore(): EditorStore {
	return createEditorStore({ document: cloneFixtureDocument(), rooms: chopinRuntime.rooms });
}

async function readyAsset(
	projectId: string,
	assetId: string,
	bytes: Uint8Array
): Promise<ProjectAssetMetadata> {
	return {
		id: assetId,
		projectId,
		name: 'Wall Detail',
		kind: 'texture',
		storageKind: 'r2',
		sourceKind: 'upload',
		sourceRef: null,
		mime: 'image/png',
		byteSize: bytes.byteLength,
		sha256: await sha256Bytes(bytes),
		importState: 'ready',
		createdAt: '2026-09-03T00:00:00.000Z',
		updatedAt: '2026-09-03T00:00:00.000Z'
	};
}

function operation(
	current: { value: boolean },
	isCurrentIntent: ProjectAssetUploadOperation['isCurrentIntent'] = () => current.value
): ProjectAssetUploadOperation {
	return {
		projectId: 'project-1',
		controller: new AbortController(),
		isCurrent: () => current.value,
		isCurrentIntent
	};
}

function retryFor(
	sourceUri: string,
	bytes: Uint8Array,
	ready: ProjectAssetMetadata | null = null,
	textureId = 'texture-1'
): ProjectAssetRetry {
	return {
		projectId: 'project-1',
		assetId: 'asset-1',
		name: 'Wall Detail',
		bytes,
		intent: { kind: 'replace', textureId, sourceUri },
		ready
	};
}

function matchesReady(
	asset: ProjectAssetMetadata,
	assetId: string,
	bytes: Uint8Array,
	mime: string
): boolean {
	return (
		asset.id === assetId &&
		asset.projectId === 'project-1' &&
		asset.kind === 'texture' &&
		asset.storageKind === 'r2' &&
		asset.sourceKind === 'upload' &&
		asset.importState === 'ready' &&
		asset.mime === mime &&
		asset.byteSize === bytes.byteLength &&
		asset.sha256 !== null
	);
}

describe('P20.3 durable texture conversion behavior', () => {
	beforeEach(() => {
		__resetBinaryTextureStoreForTests();
	});

	it('converts cached local bytes through one undoable URI replacement', async () => {
		const store = freshStore();
		const textureId = await store.registerLocalFileTexture('Wall Detail', PNG_BYTES, 'image/png');
		if (!textureId) throw new Error('fixture texture registration failed');
		const sourceUri = store.document.textures.find((texture) => texture.id === textureId)!.uri;
		const bytes = (await BinaryTextureStore.resolve(sourceUri)).slice();
		const asset = await readyAsset('project-1', 'asset-1', bytes);
		const current = { value: true };
		const retry = retryFor(sourceUri, bytes, undefined, textureId);
		const historyBefore = store.historyVersion;
		const uploadAsset = vi.fn(
			async (
				_projectId: string,
				_assetId: string,
				_bytes: Uint8Array,
				_signal?: AbortSignal
			) => asset
		);

		const result = await completeProjectAssetUpload({
			api: { uploadAsset },
			store,
			registerTexture: vi.fn(async () => null),
			operation: operation(current, (candidate) => {
				const intent = candidate.intent;
				return (
					current.value &&
					intent.kind === 'replace' &&
					store.document.textures.some(
						(texture) => texture.id === intent.textureId && texture.uri === sourceUri
					)
				);
			}),
			retry,
			mime: 'image/png',
			readyMatches: matchesReady,
			onReady: vi.fn()
		});

		expect(result).toBe(textureId);
		expect(uploadAsset).toHaveBeenCalledTimes(1);
		expect(store.document.textures[0]!.uri).toBe('/project-assets/asset-1');
		expect(store.historyVersion).toBe(historyBefore + 1);
		expect(store.undo()).toBe(true);
		expect(store.document.textures[0]!.uri).toBe(sourceUri);
		expect(store.redo()).toBe(true);
		expect(store.document.textures[0]!.uri).toBe('/project-assets/asset-1');
	});

	it('retries a failed PUT with the same asset id and bytes', async () => {
		const store = freshStore();
		const sourceUri = '/local/aabbccddeeff/wall.png';
		await BinaryTextureStore.register(sourceUri, PNG_BYTES, 'image/png');
		store.document.textures.push({ id: 'texture-1', name: 'Wall Detail', uri: sourceUri });
		const asset = await readyAsset('project-1', 'asset-1', PNG_BYTES);
		const retry = retryFor(sourceUri, PNG_BYTES.slice());
		const current = { value: true };
		let attempt = 0;
		const uploadAsset = vi.fn(
			async (
				_projectId: string,
				_assetId: string,
				_bytes: Uint8Array,
				_signal?: AbortSignal
			) => {
				attempt += 1;
				if (attempt === 1) throw new Error('network');
				return asset;
			}
		);
		const input = {
			api: { uploadAsset },
			store,
			registerTexture: vi.fn(async () => null),
			operation: operation(current),
			retry,
			mime: 'image/png' as const,
			readyMatches: matchesReady,
			onReady: vi.fn()
		};

		await expect(completeProjectAssetUpload(input)).rejects.toThrow('network');
		await expect(completeProjectAssetUpload(input)).resolves.toBe('texture-1');
		expect(uploadAsset).toHaveBeenCalledTimes(2);
		expect(uploadAsset.mock.calls[0]![1]).toBe('asset-1');
		expect(Array.from(uploadAsset.mock.calls[0]![2] as Uint8Array)).toEqual(
			Array.from(uploadAsset.mock.calls[1]![2] as Uint8Array)
		);
	});

	it('drops a stale project completion before cache or document mutation', async () => {
		const store = freshStore();
		const sourceUri = '/local/aabbccddeeff/wall.png';
		await BinaryTextureStore.register(sourceUri, PNG_BYTES, 'image/png');
		store.document.textures.push({ id: 'texture-1', name: 'Wall Detail', uri: sourceUri });
		const asset = await readyAsset('project-1', 'asset-1', PNG_BYTES);
		const current = { value: true };
		let resolveUpload!: (value: ProjectAssetMetadata) => void;
		const uploadAsset = vi.fn(
			() => new Promise<ProjectAssetMetadata>((resolve) => (resolveUpload = resolve))
		);
		const onReady = vi.fn();
		const pending = completeProjectAssetUpload({
			api: { uploadAsset },
			store,
			registerTexture: vi.fn(async () => null),
			operation: operation(current),
			retry: retryFor(sourceUri, PNG_BYTES.slice()),
			mime: 'image/png',
			readyMatches: matchesReady,
			onReady
		});

		current.value = false;
		resolveUpload(asset);

		expect(await pending).toBeNull();
		expect(onReady).not.toHaveBeenCalled();
		expect(store.document.textures[0]!.uri).toBe(sourceUri);
		expect(BinaryTextureStore.has('/project-assets/asset-1')).toBe(false);
	});

	it('retries replacement from ready metadata without another PUT', async () => {
		const sourceUri = '/local/aabbccddeeff/wall.png';
		const bytes = PNG_BYTES.slice();
		const asset = await readyAsset('project-1', 'asset-1', bytes);
		const retry = retryFor(sourceUri, bytes);
		const current = { value: true };
		const replaceTextureUri = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
		const uploadAsset = vi.fn(
			async (
				_projectId: string,
				_assetId: string,
				_bytes: Uint8Array,
				_signal?: AbortSignal
			) => asset
		);
		const input = {
			api: { uploadAsset },
			store: { replaceTextureUri },
			registerTexture: vi.fn(async () => null),
			operation: operation(current),
			retry,
			mime: 'image/png' as const,
			readyMatches: matchesReady,
			onReady: vi.fn()
		};

		await expect(completeProjectAssetUpload(input)).rejects.toMatchObject({ code: 'invalid' });
		expect(retry.ready).toBe(asset);
		await expect(completeProjectAssetUpload(input)).resolves.toBe('texture-1');
		expect(uploadAsset).toHaveBeenCalledTimes(1);
		expect(replaceTextureUri).toHaveBeenCalledTimes(2);
	});
});
