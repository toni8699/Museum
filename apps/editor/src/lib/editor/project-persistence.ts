import type { ProjectDocument } from '@portfolio/project-model';

export type ProjectSummary = {
	id: string;
	name: string;
	version: number;
	updatedAt: string;
};

export type SavedProject = Omit<ProjectSummary, 'id'> & { projectId: string };
export type LoadedProject = SavedProject & { document: unknown };

export type ProjectAuth = {
	getAccessToken(signal?: AbortSignal): Promise<string | null>;
	signIn?: () => Promise<void>;
	signOut?: () => Promise<void> | void;
	onChange?: (listener: (signedIn: boolean) => void) => () => void;
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

export function createProjectApi(
	config: ProjectPersistenceConfig,
	fetchImpl?: FetchLike
): ProjectApi | null {
	const origin = normalizeApiOrigin(config.apiOrigin ?? '');
	if (!origin || !config.auth) return null;
	const requestFetch = fetchImpl ?? config.fetch ?? globalThis.fetch?.bind(globalThis);
	if (!requestFetch) throw new ProjectPersistenceError('configuration', 'Cloud requests are unavailable');

	return {
		listProjects: (signal) => requestJson(requestFetch, origin, config.auth!, '/projects', { method: 'GET' }, signal).then(readProjectList),
		saveProject: (project, signal) =>
			requestJson(
				requestFetch,
				origin,
				config.auth!,
				`/projects/${encodeURIComponent(project.id)}`,
				{ method: 'PUT', body: JSON.stringify({ document: project }) },
				signal
			).then(readSavedProject),
		loadProject: (projectId, signal) =>
			requestJson(
				requestFetch,
				origin,
				config.auth!,
				`/projects/${encodeURIComponent(projectId)}`,
				{ method: 'GET' },
				signal
			).then(readLoadedProject)
	};
}

export function createProjectId(randomUUID: () => string = () => globalThis.crypto.randomUUID()): string {
	return `project:${randomUUID()}`;
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

async function requestJson(
	fetchImpl: FetchLike,
	origin: string,
	auth: ProjectAuth,
	path: string,
	init: RequestInit,
	signal?: AbortSignal
): Promise<unknown> {
	let token: string | null;
	try {
		token = await auth.getAccessToken(signal);
	} catch (error) {
		if (isAbort(error, signal)) throw error;
		throw new ProjectPersistenceError('auth', 'Sign-in is required');
	}
	if (!token) throw new ProjectPersistenceError('auth', 'Sign-in is required');

	let response: Response;
	try {
		response = await fetchImpl(`${origin}${path}`, {
			...init,
			signal,
			headers: {
				Accept: 'application/json',
				...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
				Authorization: `Bearer ${token}`
			}
		});
	} catch (error) {
		if (isAbort(error, signal)) throw error;
		throw new ProjectPersistenceError('network', 'Cloud request failed');
	}

	let body: unknown = null;
	try {
		body = await response.json();
	} catch {
		// Empty error bodies are mapped by status below.
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
