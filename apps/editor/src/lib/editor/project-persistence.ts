import type { ProjectDocument } from '@portfolio/project-model';
import { validateProject } from '$lib/project/project-codec';

export type ProjectLoginIntent = 'projects' | 'save';

export const PENDING_CLOUD_SAVE_KEY = 'museum:pending-cloud-save:v1';
export const PENDING_CLOUD_SAVE_MAX_AGE_MS = 15 * 60 * 1000;

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
			).then(readLoadedProject)
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
