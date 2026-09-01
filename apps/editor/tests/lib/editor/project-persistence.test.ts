import { describe, expect, it, vi } from 'vitest';

import { createEmptyProject } from '$lib/project/project-codec';
import {
	createProjectApi,
	createProjectId,
	ProjectPersistenceError,
	projectFingerprint,
	sameProjectFingerprint
} from '$lib/editor/project-persistence';

const project = createEmptyProject({ id: 'project:one', name: 'One' });

describe('project persistence client', () => {
	it('uses the bearer seam and exact semantic request routes', async () => {
		const fetchImpl = vi.fn(async (_input: string, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body));
			expect(body.document).toEqual(project);
			expect(init?.headers).toMatchObject({ Authorization: 'Bearer access-token' });
			return new Response(JSON.stringify({
				projectId: project.id,
				version: 1,
				name: project.name,
				updatedAt: '2026-08-31T00:00:00.000Z'
			}), { status: 200 });
		});
		const api = createProjectApi({
			apiOrigin: 'https://api.example.test/',
			auth: { getAccessToken: async () => 'access-token' }
		}, fetchImpl)!;

		await expect(api.saveProject(project)).resolves.toMatchObject({ projectId: project.id, version: 1 });
		expect(fetchImpl).toHaveBeenCalledWith(
			'https://api.example.test/projects/project%3Aone',
			expect.objectContaining({ method: 'PUT' })
		);
	});

	it('does not call the API without a token and maps bounded errors', async () => {
		const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Not Found' } }), { status: 404 }));
		const api = createProjectApi({
			apiOrigin: 'https://api.example.test',
			auth: { getAccessToken: async () => null }
		}, fetchImpl)!;

		await expect(api.listProjects()).rejects.toMatchObject({ code: 'auth' });
		expect(fetchImpl).not.toHaveBeenCalled();

		const authenticated = createProjectApi({
			apiOrigin: 'https://api.example.test',
			auth: { getAccessToken: async () => 'token' }
		}, fetchImpl)!;
		await expect(authenticated.loadProject(project.id)).rejects.toEqual(
			expect.objectContaining({ code: 'not-found', status: 404 })
		);
	});

	it('uses the configured fetch implementation when no call-site override is supplied', async () => {
		const fetch = vi.fn(async () => new Response(JSON.stringify({ projects: [] }), { status: 200 }));
		const api = createProjectApi({
			apiOrigin: 'https://api.example.test',
			auth: { getAccessToken: async () => 'token' },
			fetch
		})!;

		await expect(api.listProjects()).resolves.toEqual([]);
		expect(fetch).toHaveBeenCalledWith(
			'https://api.example.test/projects',
			expect.objectContaining({ method: 'GET' })
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
});
