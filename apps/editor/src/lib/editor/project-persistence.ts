import type { ProjectDocument } from '@portfolio/project-model';
import { validateProject } from '$lib/project/project-codec';
import { PROJECT_ASSET_MAX_BYTES } from '$lib/editor/helpers/mime-sniff';

export type ProjectLoginIntent = 'projects' | 'save';

export const PENDING_CLOUD_SAVE_KEY = 'museum:pending-cloud-save:v1';
export const PENDING_CLOUD_SAVE_MAX_AGE_MS = 15 * 60 * 1000;
export { PROJECT_ASSET_MAX_BYTES } from '$lib/editor/helpers/mime-sniff';

export type ProjectAssetMime = 'image/png' | 'image/webp' | 'image/jpeg';
export type ProjectAssetImportState = 'pending' | 'ready' | 'failed';

export type ProjectAssetMetadata = {
	id: string;
	projectId: string;
	name: string;
	kind: 'texture' | 'procedural';
	storageKind: 'r2' | 'none';
	sourceKind: 'upload' | 'builtin' | 'procedural';
	sourceRef: string | null;
	mime: ProjectAssetMime | null;
	byteSize: number | null;
	sha256: string | null;
	importState: ProjectAssetImportState;
	createdAt: string;
	updatedAt: string;
};

export type ProjectAssetContent = {
	mime: ProjectAssetMime;
	bytes: Uint8Array;
};

export type SessionStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type PendingCloudSaveResult =
	| { status: 'missing' }
	| { status: 'invalid' | 'expired' }
	| { status: 'ready'; project: ProjectDocument };

export type ProjectSummary = {
	id: string;
	name: string;
	version: number;
	updatedAt: string;
};

export type SavedProject = Omit<ProjectSummary, 'id'> & { projectId: string };
export type LoadedProject = SavedProject & { document: unknown };

export type ProjectSession =
	| { authenticated: false }
	| { authenticated: true; user: { id: string } };

export type ProjectAuth = {
	getSession(signal?: AbortSignal): Promise<ProjectSession>;
	signIn: (intent?: ProjectLoginIntent) => void | Promise<void>;
	signOut: (signal?: AbortSignal) => Promise<void>;
};

export type ProjectPersistenceConfig = {
	apiOrigin?: string;
	auth?: ProjectAuth | null;
	fetch?: FetchLike;
};

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type ProjectApi = {
	listProjects(signal?: AbortSignal): Promise<ProjectSummary[]>;
	saveProject(project: ProjectDocument, signal?: AbortSignal): Promise<SavedProject>;
	loadProject(projectId: string, signal?: AbortSignal): Promise<LoadedProject>;
	listAssets(projectId: string, signal?: AbortSignal): Promise<ProjectAssetMetadata[]>;
	registerAsset(projectId: string, name: string, signal?: AbortSignal): Promise<ProjectAssetMetadata>;
	uploadAsset(
		projectId: string,
		assetId: string,
		bytes: Uint8Array,
		signal?: AbortSignal
	): Promise<ProjectAssetMetadata>;
	loadAssetContent(projectId: string, assetId: string, signal?: AbortSignal): Promise<ProjectAssetContent>;
};

export type ProjectPersistenceErrorCode =
	| 'configuration'
	| 'auth'
	| 'invalid'
	| 'not-found'
	| 'too-large'
	| 'network'
	| 'server';

export class ProjectPersistenceError extends Error {
	constructor(
		readonly code: ProjectPersistenceErrorCode,
		message: string,
		readonly status?: number
	) {
		super(message);
		this.name = 'ProjectPersistenceError';
	}
}

export function createProjectAuth(apiOrigin: string, fetchImpl?: FetchLike): ProjectAuth {
	const origin = normalizeApiOrigin(apiOrigin);
	const requestFetch = fetchImpl ?? globalThis.fetch?.bind(globalThis);
	if (!origin || !requestFetch) {
		throw new ProjectPersistenceError('configuration', 'Cloud requests are unavailable');
	}

	return {
		getSession: (signal) =>
			requestJson(requestFetch, origin, '/auth/me', { method: 'GET' }, signal).then(readSession),
		signIn: (intent = 'projects') => {
			if (typeof window === 'undefined') throw new ProjectPersistenceError('configuration', 'Sign-in is unavailable');
			window.location.assign(`${origin}/auth/login?intent=${encodeURIComponent(intent)}`);
		},
		signOut: (signal) =>
			requestJson(requestFetch, origin, '/auth/logout', { method: 'POST' }, signal).then(() => undefined)
	};
}

export function createProjectApi(
	config: ProjectPersistenceConfig,
	fetchImpl?: FetchLike
): ProjectApi | null {
	const origin = normalizeApiOrigin(config.apiOrigin ?? '');
	if (!origin) return null;
	const requestFetch = fetchImpl ?? config.fetch ?? globalThis.fetch?.bind(globalThis);
	if (!requestFetch) throw new ProjectPersistenceError('configuration', 'Cloud requests are unavailable');

	return {
		listProjects: (signal) =>
			requestJson(requestFetch, origin, '/projects', { method: 'GET' }, signal).then(readProjectList),
		saveProject: (project, signal) =>
			requestJson(
				requestFetch,
				origin,
				`/projects/${encodeURIComponent(project.id)}`,
				{ method: 'PUT', body: JSON.stringify({ document: project }) },
				signal
			).then(readSavedProject),
		loadProject: (projectId, signal) =>
			requestJson(
				requestFetch,
				origin,
				`/projects/${encodeURIComponent(projectId)}`,
				{ method: 'GET' },
				signal
			).then(readLoadedProject),
		listAssets: (projectId, signal) =>
			requestJson(
				requestFetch,
				origin,
				`${assetPath(projectId)}`,
				{ method: 'GET' },
				signal
			).then(readAssetList),
		registerAsset: (projectId, name, signal) =>
			requestJson(
				requestFetch,
				origin,
				`${assetPath(projectId)}`,
				{ method: 'POST', body: JSON.stringify({ name }) },
				signal
			).then(readAssetMetadata),
		uploadAsset: (projectId, assetId, bytes, signal) =>
			requestAssetUpload(
				requestFetch,
				origin,
				`${assetPath(projectId)}/${encodeURIComponent(assetId)}/content`,
				bytes,
				signal
			).then(readAssetMetadata),
		loadAssetContent: (projectId, assetId, signal) =>
			requestAssetBytes(
				requestFetch,
				origin,
				`${assetPath(projectId)}/${encodeURIComponent(assetId)}/content`,
				{ method: 'GET' },
				signal
			)
	};
}

export function createProjectId(randomUUID: () => string = () => globalThis.crypto.randomUUID()): string {
	return `project:${randomUUID()}`;
}

export function writePendingCloudSave(
	project: unknown,
	storage: SessionStorageLike | null = browserSessionStorage(),
	createdAt = Date.now()
): boolean {
	if (!storage || !Number.isFinite(createdAt)) return false;
	const validation = validateProject(project);
	if (!validation.success) return false;
	try {
		storage.setItem(
			PENDING_CLOUD_SAVE_KEY,
			JSON.stringify({ createdAt, project: JSON.parse(validation.canonicalJson) })
		);
		return true;
	} catch {
		return false;
	}
}

export function readPendingCloudSave(
	storage: SessionStorageLike | null = browserSessionStorage(),
	now = Date.now()
): PendingCloudSaveResult {
	if (!storage) return { status: 'missing' };
	const raw = storage.getItem(PENDING_CLOUD_SAVE_KEY);
	if (!raw) return { status: 'missing' };
	try {
		const value: unknown = JSON.parse(raw);
		if (!isRecord(value) || Object.keys(value).some((key) => !['createdAt', 'project'].includes(key))) {
			throw new Error('invalid handoff');
		}
		if (typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt) || value.createdAt > now) {
			throw new Error('invalid timestamp');
		}
		if (now - value.createdAt > PENDING_CLOUD_SAVE_MAX_AGE_MS) {
			storage.removeItem(PENDING_CLOUD_SAVE_KEY);
			return { status: 'expired' };
		}
		const validation = validateProject(value.project);
		if (!validation.success) throw new Error('invalid project');
		return { status: 'ready', project: JSON.parse(validation.canonicalJson) as ProjectDocument };
	} catch {
		try {
			storage.removeItem(PENDING_CLOUD_SAVE_KEY);
		} catch {
			// Session storage can disappear while a tab is closing.
		}
		return { status: 'invalid' };
	}
}

export function clearPendingCloudSave(storage: SessionStorageLike | null = browserSessionStorage()): void {
	try {
		storage?.removeItem(PENDING_CLOUD_SAVE_KEY);
	} catch {
		// Best-effort cleanup; the slot is session-scoped and expires on read.
	}
}

export type ProjectFingerprint = {
	sceneCanonicalJson: string;
	layoutCanonicalJson: string;
	projectName: string;
};

export function projectFingerprint(
	sceneCanonicalJson: string,
	layoutCanonicalJson: string,
	projectName: string
): ProjectFingerprint {
	return { sceneCanonicalJson, layoutCanonicalJson, projectName };
}

export function sameProjectFingerprint(a: ProjectFingerprint, b: ProjectFingerprint): boolean {
	return (
		a.sceneCanonicalJson === b.sceneCanonicalJson &&
		a.layoutCanonicalJson === b.layoutCanonicalJson &&
		a.projectName === b.projectName
	);
}

function normalizeApiOrigin(origin: string): string {
	return origin.trim().replace(/\/+$/, '');
}

function assetPath(projectId: string): string {
	return `/projects/${encodeURIComponent(projectId)}/assets`;
}

function browserSessionStorage(): SessionStorageLike | null {
	if (typeof window === 'undefined') return null;
	try {
		return window.sessionStorage;
	} catch {
		return null;
	}
}

async function requestJson(
	fetchImpl: FetchLike,
	origin: string,
	path: string,
	init: RequestInit,
	signal?: AbortSignal
): Promise<unknown> {
	let response: Response;
	try {
		response = await fetchImpl(`${origin}${path}`, {
			...init,
			credentials: 'include',
			signal,
			headers: {
				Accept: 'application/json',
				...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
				...(init.headers ?? {})
			}
		});
	} catch (error) {
		if (isAbort(error, signal)) throw error;
		throw new ProjectPersistenceError('network', 'Cloud request failed');
	}

	let body: unknown = null;
	if (response.status !== 204) {
		try {
			body = await response.json();
		} catch {
			// Empty error bodies are mapped by status below.
		}
	}
	if (response.ok) return body;
	throw responseError(response.status, body);
}

async function requestAssetUpload(
	fetchImpl: FetchLike,
	origin: string,
	path: string,
	bytes: Uint8Array,
	signal?: AbortSignal
): Promise<unknown> {
	let response: Response;
	try {
		response = await fetchImpl(`${origin}${path}`, {
			method: 'PUT',
			body: bytes.slice(),
			credentials: 'include',
			signal,
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/octet-stream'
			}
		});
	} catch (error) {
		if (isAbort(error, signal)) throw error;
		throw new ProjectPersistenceError('network', 'Cloud request failed');
	}

	let body: unknown = null;
	if (response.status !== 204) {
		try {
			body = await response.json();
		} catch {
			// Empty error bodies are mapped by status below.
		}
	}
	if (response.ok) return body;
	throw responseError(response.status, body);
}

async function requestAssetBytes(
	fetchImpl: FetchLike,
	origin: string,
	path: string,
	init: RequestInit,
	signal?: AbortSignal
): Promise<ProjectAssetContent> {
	let response: Response;
	try {
		response = await fetchImpl(`${origin}${path}`, {
			...init,
			credentials: 'include',
			signal,
			headers: {
				Accept: 'image/png, image/webp, image/jpeg',
				...(init.headers ?? {})
			}
		});
	} catch (error) {
		if (isAbort(error, signal)) throw error;
		throw new ProjectPersistenceError('network', 'Cloud request failed');
	}

	if (!response.ok) {
		let body: unknown = null;
		try {
			body = await response.json();
		} catch {
			// Empty error bodies are mapped by status below.
		}
		throw responseError(response.status, body);
	}

	const contentLength = readAssetContentLength(response.headers.get('content-length'));
	try {
		const mime = readAssetMime(response.headers.get('content-type'));
		const bytes = await readBoundedAssetBody(response, contentLength);
		return { mime, bytes };
	} catch (error) {
		if (isAbort(error, signal)) throw error;
		if (error instanceof ProjectPersistenceError) throw error;
		throw new ProjectPersistenceError('network', 'Cloud response could not be read');
	}
}

function readAssetContentLength(value: string | null): number {
	if (value === null || !/^\d+$/.test(value.trim())) throw invalidResponse();
	const length = Number(value);
	if (!Number.isSafeInteger(length) || length < 1 || length > PROJECT_ASSET_MAX_BYTES) {
		throw invalidResponse();
	}
	return length;
}

async function readBoundedAssetBody(response: Response, expectedLength: number): Promise<Uint8Array> {
	if (!response.body) throw invalidResponse();
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > expectedLength || total > PROJECT_ASSET_MAX_BYTES) {
				try {
					await reader.cancel();
				} catch {
					// The response is already invalid; preserve that result.
				}
				throw invalidResponse();
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	if (total !== expectedLength) throw invalidResponse();

	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}

function responseError(status: number, body: unknown): ProjectPersistenceError {
	if (status === 401) return new ProjectPersistenceError('auth', 'Sign-in is required', status);
	if (status === 404) return new ProjectPersistenceError('not-found', 'Project not found', status);
	if (status === 413) return new ProjectPersistenceError('too-large', 'Project payload is too large', status);
	if (status >= 500) return new ProjectPersistenceError('server', 'Cloud service is unavailable', status);
	return new ProjectPersistenceError('invalid', readErrorMessage(body) ?? 'Cloud request was rejected', status);
}

function readSession(value: unknown): ProjectSession {
	if (!isRecord(value) || typeof value.authenticated !== 'boolean') throw invalidResponse();
	if (!value.authenticated) return { authenticated: false };
	if (!isRecord(value.user)) throw invalidResponse();
	return { authenticated: true, user: { id: readString(value.user.id) } };
}

function readProjectList(value: unknown): ProjectSummary[] {
	if (!isRecord(value) || !Array.isArray(value.projects)) throw invalidResponse();
	return value.projects.map(readSummary);
}

function readAssetList(value: unknown): ProjectAssetMetadata[] {
	if (
		!isRecord(value) ||
		Object.keys(value).length !== 1 ||
		!Array.isArray(value.assets)
	) {
		throw invalidResponse();
	}
	return value.assets.map(readAssetMetadata);
}

const PROJECT_ASSET_METADATA_KEYS = [
	'id',
	'projectId',
	'name',
	'kind',
	'storageKind',
	'sourceKind',
	'sourceRef',
	'mime',
	'byteSize',
	'sha256',
	'importState',
	'createdAt',
	'updatedAt'
] as const;

function readAssetMetadata(value: unknown): ProjectAssetMetadata {
	if (
		!isRecord(value) ||
		Object.keys(value).length !== PROJECT_ASSET_METADATA_KEYS.length ||
		PROJECT_ASSET_METADATA_KEYS.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
	) {
		throw invalidResponse();
	}
	return {
		id: readAssetId(value.id),
		projectId: readString(value.projectId),
		name: readString(value.name),
		kind: readEnum(value.kind, ['texture', 'procedural']),
		storageKind: readEnum(value.storageKind, ['r2', 'none']),
		sourceKind: readEnum(value.sourceKind, ['upload', 'builtin', 'procedural']),
		sourceRef: readNullableString(value.sourceRef),
		mime: readNullableEnum(value.mime, ['image/png', 'image/webp', 'image/jpeg']),
		byteSize: readNullableAssetByteSize(value.byteSize),
		sha256: readNullableSha256(value.sha256),
		importState: readEnum(value.importState, ['pending', 'ready', 'failed']),
		createdAt: readString(value.createdAt),
		updatedAt: readString(value.updatedAt)
	};
}

function readSavedProject(value: unknown): SavedProject {
	if (!isRecord(value)) throw invalidResponse();
	return {
		projectId: readString(value.projectId),
		name: readString(value.name),
		version: readVersion(value.version),
		updatedAt: readString(value.updatedAt)
	};
}

function readLoadedProject(value: unknown): LoadedProject {
	if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, 'document')) {
		throw invalidResponse();
	}
	return { ...readSavedProject(value), document: value.document };
}

function readSummary(value: unknown): ProjectSummary {
	if (!isRecord(value)) throw invalidResponse();
	return {
		id: readString(value.id),
		name: readString(value.name),
		version: readVersion(value.version),
		updatedAt: readString(value.updatedAt)
	};
}

function readVersion(value: unknown): number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw invalidResponse();
	return value;
}

function readAssetId(value: unknown): string {
	const id = readString(value);
	if (!/^[A-Za-z0-9_-]+$/.test(id)) throw invalidResponse();
	return id;
}

function readEnum<const Values extends readonly string[]>(value: unknown, values: Values): Values[number] {
	if (typeof value !== 'string' || !values.includes(value)) throw invalidResponse();
	return value as Values[number];
}

function readNullableString(value: unknown): string | null {
	if (value === null) return null;
	return readString(value);
}

function readNullableEnum<const Values extends readonly string[]>(
	value: unknown,
	values: Values
): Values[number] | null {
	if (value === null) return null;
	return readEnum(value, values);
}

function readAssetMime(value: string | null): ProjectAssetMime {
	const mime = value?.split(';', 1)[0]?.trim().toLowerCase();
	if (mime !== 'image/png' && mime !== 'image/webp' && mime !== 'image/jpeg') {
		throw invalidResponse();
	}
	return mime;
}

function readNullableAssetByteSize(value: unknown): number | null {
	if (value === null) return null;
	if (
		typeof value !== 'number' ||
		!Number.isSafeInteger(value) ||
		value < 1 ||
		value > PROJECT_ASSET_MAX_BYTES
	) {
		throw invalidResponse();
	}
	return value;
}

function readNullableSha256(value: unknown): string | null {
	if (value === null) return null;
	if (typeof value !== 'string' || !/^sha256-[0-9a-f]{64}$/.test(value)) {
		throw invalidResponse();
	}
	return value;
}

function readString(value: unknown): string {
	if (typeof value !== 'string' || value.length === 0) throw invalidResponse();
	return value;
}

function invalidResponse(): ProjectPersistenceError {
	return new ProjectPersistenceError('server', 'Cloud response was invalid');
}

function readErrorMessage(value: unknown): string | null {
	if (!isRecord(value) || !isRecord(value.error) || typeof value.error.message !== 'string') return null;
	return value.error.message;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
	return signal?.aborted === true || (error instanceof DOMException && error.name === 'AbortError');
}
