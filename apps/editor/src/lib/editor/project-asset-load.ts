import type { SceneTextureAsset } from '$lib/content/scene';
import { registerVerifiedProjectAsset } from '$lib/editor/helpers/register-verified-project-asset';
import { PROJECT_ASSET_MAX_BYTES, sniffImageMime } from '$lib/editor/helpers/mime-sniff';
import {
	ProjectPersistenceError,
	type ProjectApi,
	type ProjectAssetMetadata,
	type ProjectAssetMime
} from '$lib/editor/project-persistence';
import { isProjectAssetUri } from '$lib/editor/store/project-export-store.svelte';

export type StagedProjectAsset = {
	uri: string;
	bytes: Uint8Array;
	mime: ProjectAssetMime;
	fingerprint: string;
};

export type ProjectAssetHydration = {
	assets: ProjectAssetMetadata[] | null;
	staged: StagedProjectAsset[];
};

export function ownsProjectLoad(
	token: number,
	controller: AbortController,
	currentToken: number,
	currentController: AbortController | null
): boolean {
	return token === currentToken && controller === currentController;
}

type CachedProjectAsset = {
	bytes: Uint8Array;
	mime: string;
	fingerprint: string;
};

export async function hydrateProjectAssets(input: {
	projectId: string;
	textures: readonly Pick<SceneTextureAsset, 'uri'>[];
	api: Pick<ProjectApi, 'listAssets' | 'loadAssetContent'>;
	cache: { getEntry(uri: string): CachedProjectAsset | null };
	signal: AbortSignal;
	isCurrent: () => boolean;
}): Promise<ProjectAssetHydration> {
	const references = new Map<string, string>();
	for (const { uri } of input.textures) {
		if (isProjectAssetUri(uri)) references.set(uri, uri.slice('/project-assets/'.length));
	}
	if (references.size === 0) return { assets: null, staged: [] };

	assertCurrent(input);
	const assets = await input.api.listAssets(input.projectId, input.signal);
	assertCurrent(input);
	const staged: StagedProjectAsset[] = [];

	for (const [uri, assetId] of references) {
		const matches = assets.filter((asset) => asset.id === assetId);
		if (matches.length !== 1 || !isReadyProjectTextureMetadata(matches[0]!, input.projectId)) {
			throw new ProjectPersistenceError('invalid', `Cloud texture ${assetId} is not ready`);
		}
		const asset = matches[0]!;
		const cached = input.cache.getEntry(uri);
		if (
			cached?.fingerprint === asset.sha256 &&
			cached.mime === asset.mime &&
			cached.bytes.byteLength === asset.byteSize
		) {
			continue;
		}

		const content = await input.api.loadAssetContent(input.projectId, asset.id, input.signal);
		assertCurrent(input);
		if (
			content.mime !== asset.mime ||
			content.bytes.byteLength !== asset.byteSize ||
			sniffImageMime(content.bytes) !== content.mime
		) {
			throw new ProjectPersistenceError('invalid', `Cloud texture ${asset.name || asset.id} failed validation`);
		}
		let fingerprint = '';
		await registerVerifiedProjectAsset(content.bytes, asset.sha256!, (verified) => {
			fingerprint = verified;
		});
		assertCurrent(input);
		staged.push({ uri, bytes: content.bytes, mime: content.mime, fingerprint });
	}

	return { assets, staged };
}

export function isReadyProjectTextureMetadata(
	asset: ProjectAssetMetadata,
	projectId: string
): boolean {
	return (
		asset.projectId === projectId &&
		asset.kind === 'texture' &&
		asset.storageKind === 'r2' &&
		asset.sourceKind === 'upload' &&
		asset.importState === 'ready' &&
		asset.mime !== null &&
		asset.byteSize !== null &&
		Number.isSafeInteger(asset.byteSize) &&
		asset.byteSize > 0 &&
		asset.byteSize <= PROJECT_ASSET_MAX_BYTES &&
		asset.sha256 !== null &&
		asset.sha256.trim().length > 0
	);
}

function assertCurrent(input: { signal: AbortSignal; isCurrent: () => boolean }): void {
	input.signal.throwIfAborted();
	if (!input.isCurrent()) {
		throw new ProjectPersistenceError('invalid', 'Project changed while loading; please load again');
	}
}
