import { registerVerifiedProjectAsset } from '$lib/editor/helpers/register-verified-project-asset';
import {
	ProjectPersistenceError,
	type ProjectApi,
	type ProjectAssetMetadata,
	type ProjectAssetMime
} from '$lib/editor/project-persistence';
import { BinaryTextureStore } from '$lib/editor/store/binary-texture-store.svelte';

export type ProjectAssetIntent =
	| { kind: 'register' }
	| { kind: 'replace'; textureId: string; sourceUri: string };

export type ProjectAssetRetry = {
	projectId: string;
	assetId: string;
	name: string;
	bytes: Uint8Array;
	intent: ProjectAssetIntent;
	ready: ProjectAssetMetadata | null;
};

export type ProjectAssetUploadOperation = {
	projectId: string;
	controller: AbortController;
	isCurrent: () => boolean;
	isCurrentIntent: (retry: ProjectAssetRetry) => boolean;
};

type ProjectAssetUploadStore = {
	replaceTextureUri(textureId: string, expectedUri: string, nextUri: string): boolean;
};

export type ProjectAssetUploadInput = {
	api: Pick<ProjectApi, 'uploadAsset'>;
	store: ProjectAssetUploadStore;
	registerTexture: (name: string, uri: string) => Promise<string | null>;
	operation: ProjectAssetUploadOperation;
	retry: ProjectAssetRetry;
	mime: ProjectAssetMime;
	readyMatches: (
		asset: ProjectAssetMetadata,
		assetId: string,
		bytes: Uint8Array,
		mime: ProjectAssetMime
	) => boolean;
	onReady: (asset: ProjectAssetMetadata) => void;
};

export async function primeVerifiedProjectAsset(
	uri: string,
	bytes: Uint8Array,
	mime: ProjectAssetMime,
	expectedSha256: string,
	isCurrent: () => boolean
): Promise<boolean> {
	if (!isCurrent()) return false;
	let registered = false;
	await registerVerifiedProjectAsset(bytes, expectedSha256, (fingerprint) => {
		if (!isCurrent()) return;
		registered = true;
		return BinaryTextureStore.register(uri, bytes, mime, fingerprint);
	});
	return registered && isCurrent();
}

export async function completeProjectAssetUpload(
	input: ProjectAssetUploadInput
): Promise<string | null> {
	const { api, store, operation, retry, mime } = input;
	if (!operation.isCurrentIntent(retry)) return null;

	let uploaded = retry.ready;
	if (!uploaded) {
		uploaded = await api.uploadAsset(
			operation.projectId,
			retry.assetId,
			retry.bytes,
			operation.controller.signal
		);
		if (!operation.isCurrentIntent(retry)) return null;
		if (
			!input.readyMatches(uploaded, retry.assetId, retry.bytes, mime) ||
			!uploaded.sha256?.trim()
		) {
			throw new ProjectPersistenceError('invalid', 'Cloud asset upload returned invalid metadata');
		}
		retry.ready = uploaded;
	} else if (
		!input.readyMatches(uploaded, retry.assetId, retry.bytes, mime) ||
		!uploaded.sha256?.trim()
	) {
		throw new ProjectPersistenceError('invalid', 'Cached cloud asset metadata is no longer valid');
	}

	input.onReady(uploaded);
	const uri = `/project-assets/${retry.assetId}`;
	if (!(await primeVerifiedProjectAsset(uri, retry.bytes, mime, uploaded.sha256, operation.isCurrent))) {
		return null;
	}

	if (retry.intent.kind === 'replace') {
		if (
			!operation.isCurrentIntent(retry) ||
			!store.replaceTextureUri(retry.intent.textureId, retry.intent.sourceUri, uri)
		) {
			throw new ProjectPersistenceError('invalid', 'Could not replace the texture reference');
		}
		return retry.intent.textureId;
	}

	const textureId = await input.registerTexture(retry.name, uri);
	return operation.isCurrent() ? textureId : null;
}
