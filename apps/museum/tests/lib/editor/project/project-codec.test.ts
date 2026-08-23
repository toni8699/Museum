import { describe, expect, it } from 'vitest';

import type { MuseumSceneDocument } from '$lib/content/scene';
import { museumSceneDocument } from '$lib/content/chopin-project';
import { roomsToLayout } from '$lib/content/rooms-to-layout';
import { createEmptyLayoutDocument } from '$lib/layout/layout-codec';

import {
	createMuseumProject,
	MuseumProjectValidationError,
	parseMuseumProjectJson,
	serializeMuseumProject,
	validateMuseumProject
} from '$lib/project/project-codec';
import type { MuseumProject } from '$lib/project/project-types';

function validScene(): MuseumSceneDocument {
	return JSON.parse(JSON.stringify(museumSceneDocument)) as MuseumSceneDocument;
}

function chopinProject(): MuseumProject {
	return createMuseumProject({
		id: 'project:chopin',
		name: 'Chopin Museum',
		layout: roomsToLayout(),
		scene: museumSceneDocument
	});
}

describe('MuseumProject codec', () => {
	it('rejects a scene whose room references are absent from the project layout', () => {
		const scene = validScene();
		const result = validateMuseumProject({
			id: 'project:empty',
			name: 'Empty Museum',
			layout: createEmptyLayoutDocument(),
			scene
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.issues[0]).toMatchObject({
				path: '$.scene.entities[0].roomId',
				code: 'unknown_room'
			});
		}
	});

	it('validates all compiled Chopin rooms with the current scene', () => {
		const project = chopinProject();

		expect(project.layout.floors[0]!.rooms).toHaveLength(7);
	});

	it('round-trips a canonical Chopin project without changing data', () => {
		const project = chopinProject();
		const json = serializeMuseumProject(project);
		const parsed = parseMuseumProjectJson(json);

		expect(parsed.success).toBe(true);
		if (!parsed.success) return;
		expect(parsed.project).toEqual(project);
		expect(serializeMuseumProject(parsed.project)).toBe(json);
	});

	it('uses stable root key order regardless of input key order', () => {
		const project = chopinProject();
		const reordered = {
			scene: project.scene,
			name: project.name,
			layout: project.layout,
			id: project.id
		};

		const canonical = validateMuseumProject(reordered);
		expect(canonical.success).toBe(true);
		if (!canonical.success) return;
		expect(canonical.canonicalJson.indexOf('"id"')).toBeLessThan(
			canonical.canonicalJson.indexOf('"name"')
		);
		expect(canonical.canonicalJson.indexOf('"name"')).toBeLessThan(
			canonical.canonicalJson.indexOf('"layout"')
		);
		expect(canonical.canonicalJson.indexOf('"layout"')).toBeLessThan(
			canonical.canonicalJson.indexOf('"scene"')
		);
		expect(canonical.canonicalJson).toBe(serializeMuseumProject(project));
	});

	it('preserves layout and scene array ordering', () => {
		const project = chopinProject();
		const result = validateMuseumProject(project);

		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.project.layout.floors[0]!.rooms.map((room) => room.id)).toEqual(
			project.layout.floors[0]!.rooms.map((room) => room.id)
		);
		expect(result.project.scene.entities.map((entity) => entity.id)).toEqual(
			project.scene.entities.map((entity) => entity.id)
		);
	});

	it('rejects missing and invalid envelope fields', () => {
		const project = chopinProject();
		const cases: Array<[string, Record<string, unknown>]> = [
			['id', { ...project, id: 'not valid' }],
			['name', { ...project, name: '   ' }],
			['layout', { ...project, layout: undefined }],
			['scene', { ...project, scene: null }]
		];

		for (const [field, input] of cases) {
			const result = validateMuseumProject(input);
			expect(result.success, field).toBe(false);
		}
	});

	it('rejects unknown root keys and partial nested documents', () => {
		const project = chopinProject();
		const unknown = validateMuseumProject({ ...project, assets: [] });
		const partialLayout = validateMuseumProject({ ...project, layout: {} });
		const partialScene = validateMuseumProject({ ...project, scene: {} });

		expect(unknown.success).toBe(false);
		expect(unknown.success ? [] : unknown.issues).toContainEqual(
			expect.objectContaining({ path: '$.assets', code: 'unknown_key' })
		);
		expect(partialLayout.success).toBe(false);
		expect(partialLayout.success ? [] : partialLayout.issues).toContainEqual(
			expect.objectContaining({ path: '$.layout.units' })
		);
		expect(partialScene.success).toBe(false);
		expect(partialScene.success ? [] : partialScene.issues).toContainEqual(
			expect.objectContaining({ path: '$.scene.textures' })
		);
	});

	it('prefixes nested layout and scene issue paths', () => {
		const project = chopinProject();
		const layoutIssue = validateMuseumProject({
			...project,
			layout: { ...project.layout, units: 'feet' }
		});
		const sceneIssue = validateMuseumProject({
			...project,
			scene: { ...project.scene, version: 99 }
		});

		expect(layoutIssue.success).toBe(false);
		expect(layoutIssue.success ? [] : layoutIssue.issues).toContainEqual(
			expect.objectContaining({ path: '$.layout.units', code: 'unsupported_units' })
		);
		expect(sceneIssue.success).toBe(false);
		expect(sceneIssue.success ? [] : sceneIssue.issues).toContainEqual(
			expect.objectContaining({ path: '$.scene.version', code: 'unknown_property' })
		);
	});

	it('reports malformed JSON as one invalid_json issue', () => {
		const result = parseMuseumProjectJson('{"formatVersion":');

		expect(result).toEqual({
			success: false,
			issues: [expect.objectContaining({ path: '$', code: 'invalid_json' })]
		});
	});

	it('does not mutate input and throws typed errors for invalid serialization', () => {
		const project = chopinProject();
		const input = JSON.parse(JSON.stringify(project)) as MuseumProject;
		const before = JSON.stringify(input);

		validateMuseumProject(input);
		createMuseumProject(input);
		serializeMuseumProject(input);

		expect(JSON.stringify(input)).toBe(before);
		expect(() => serializeMuseumProject({})).toThrow(MuseumProjectValidationError);
	});
});
