import { describe, expect, it, vi } from 'vitest';

import { createEmptyProject } from '$lib/project/project-codec';
import {
	clearPendingCloudSave,
	createProjectApi,
	createProjectAuth,
	createProjectId,
	PENDING_CLOUD_SAVE_KEY,
	PENDING_CLOUD_SAVE_MAX_AGE_MS,
	ProjectPersistenceError,
	projectFingerprint,
	readPendingCloudSave,
	sameProjectFingerprint,
	writePendingCloudSave
} from '$lib/editor/project-persistence';

const project = createEmptyProject({ id: 'project:one', name: 'One' });

describe('project persistence client', () => {
	it('uses secure cookie credentials and exact semantic request routes', async () => {
		const fetchImpl = vi.fn(async (_input: string, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body));
			expect(body.document).toEqual(project);
			expect(init?.credentials).toBe('include');
			expect(init?.headers).toMatchObject({ Accept: 'application/json', 'Content-Type': 'application/json' });
			expect(init?.headers).not.toHaveProperty('Authorization');
			return new Response(JSON.stringify({
				projectId: project.id,
				version: 1,
				name: project.name,
				updatedAt: '2026-08-31T00:00:00.000Z'
			}), { status: 200 });
		});
		const api = createProjectApi({ apiOrigin: 'https://api.example.test/' }, fetchImpl)!;

		await expect(api.saveProject(project)).resolves.toMatchObject({ projectId: project.id, version: 1 });
		expect(fetchImpl).toHaveBeenCalledWith(
			'https://api.example.test/projects/project%3Aone',
			expect.objectContaining({ method: 'PUT', credentials: 'include' })
		);
	});

	it('uses the session client for /auth/me and logout without exposing tokens', async () => {
		const fetchImpl = vi.fn(async (input: string, init?: RequestInit) => {
			if (input.endsWith('/auth/me')) {
				return new Response(JSON.stringify({ authenticated: true, user: { id: 'google:123' } }), { status: 200 });
			}
			expect(input).toBe('https://api.example.test/auth/logout');
			expect(init?.method).toBe('POST');
			expect(init?.credentials).toBe('include');
			return new Response(null, { status: 204 });
		});
		const auth = createProjectAuth('https://api.example.test/', fetchImpl);

		await expect(auth.getSession()).resolves.toEqual({ authenticated: true, user: { id: 'google:123' } });
		await expect(auth.signOut()).resolves.toBeUndefined();
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	it('maps a rejected session and bounded project errors', async () => {
		const fetchImpl = vi.fn(async (input: string) => {
			if (input.endsWith('/auth/me')) return new Response(JSON.stringify({ authenticated: false }), { status: 200 });
			return new Response(JSON.stringify({ error: { message: 'Not Found' } }), { status: 404 });
		});
		const auth = createProjectAuth('https://api.example.test', fetchImpl);
		await expect(auth.getSession()).resolves.toEqual({ authenticated: false });

		const api = createProjectApi({ apiOrigin: 'https://api.example.test' }, fetchImpl)!;
		await expect(api.loadProject(project.id)).rejects.toEqual(
			expect.objectContaining({ code: 'not-found', status: 404 })
		);
	});

	it('uses the configured fetch implementation when no call-site override is supplied', async () => {
		const fetch = vi.fn(async () => new Response(JSON.stringify({ projects: [] }), { status: 200 }));
		const api = createProjectApi({ apiOrigin: 'https://api.example.test', fetch })!;

		await expect(api.listProjects()).resolves.toEqual([]);
		expect(fetch).toHaveBeenCalledWith(
			'https://api.example.test/projects',
			expect.objectContaining({ method: 'GET', credentials: 'include' })
		);
	});

	it('keeps project ids native and fingerprints all three live fields', () => {
		expect(createProjectId(() => 'uuid')).toBe('project:uuid');
		const first = projectFingerprint('scene-a', 'layout-a', 'One');
		expect(sameProjectFingerprint(first, projectFingerprint('scene-a', 'layout-a', 'One'))).toBe(true);
		expect(sameProjectFingerprint(first, projectFingerprint('scene-b', 'layout-a', 'One'))).toBe(false);
		expect(sameProjectFingerprint(first, projectFingerprint('scene-a', 'layout-b', 'One'))).toBe(false);
		expect(sameProjectFingerprint(first, projectFingerprint('scene-a', 'layout-a', 'Two'))).toBe(false);
		expect(new ProjectPersistenceError('auth', 'Sign-in is required')).toBeInstanceOf(Error);
	});

	it('validates, bounds, and clears the session-only Save handoff', () => {
		const values = new Map<string, string>();
		const storage = {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value),
			removeItem: (key: string) => values.delete(key)
		};
		const now = 1_000_000;

		expect(writePendingCloudSave(project, storage, now)).toBe(true);
		expect(JSON.parse(values.get(PENDING_CLOUD_SAVE_KEY)!)).toEqual({ createdAt: now, project });
		expect(readPendingCloudSave(storage, now)).toEqual({ status: 'ready', project });

		values.set(PENDING_CLOUD_SAVE_KEY, JSON.stringify({ createdAt: now - PENDING_CLOUD_SAVE_MAX_AGE_MS - 1, project }));
		expect(readPendingCloudSave(storage, now)).toEqual({ status: 'expired' });
		expect(values.has(PENDING_CLOUD_SAVE_KEY)).toBe(false);

		values.set(PENDING_CLOUD_SAVE_KEY, JSON.stringify({ createdAt: now, project, token: 'never' }));
		expect(readPendingCloudSave(storage, now)).toEqual({ status: 'invalid' });
		expect(values.has(PENDING_CLOUD_SAVE_KEY)).toBe(false);

		writePendingCloudSave(project, storage, now);
		clearPendingCloudSave(storage);
		expect(values.has(PENDING_CLOUD_SAVE_KEY)).toBe(false);
	});
});
