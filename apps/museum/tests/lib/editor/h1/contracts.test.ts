import { describe, expect, expectTypeOf, it } from 'vitest';

import { museumSceneDocument } from '$lib/content/chopin-project';
import { createEmptySceneDocument, resolveSceneDocument } from '$lib/content/scene';
import { createMuseumEditorStore } from '$lib/editor/museum-editor.svelte';
import {
	EditorDocumentStore,
	pickInitialNavigationNodeId
} from '$lib/editor/store/document-store.svelte';
import type { EditorViewMode } from '$lib/editor/h1/editor-view-mode';
import { createEmptyLayoutDocument } from '$lib/layout/layout-codec';
import { createLayoutRoomRegistry } from '$lib/project/project-layout-semantics';
import {
	createEmptyMuseumProject,
	parseMuseumProjectJson,
	serializeMuseumProject,
	validateMuseumProject
} from '$lib/project/project-codec';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serializeSceneDocument } from '$lib/content/scene-codec';
import { cloneFixtureDocument } from '../../content/__fixtures__/load-fixture-scene';
import { museumEditorEntryPlugin } from '../../../../vite/museum-editor-entry-plugin';

const ROUTES_DIR = fileURLToPath(new URL('../../../../src/routes', import.meta.url));

function readRouteSource(routePath: string): string {
	return fs.readFileSync(path.join(ROUTES_DIR, routePath), 'utf8');
}

describe('H1 S0 — empty project contract', () => {
	it('creates a codec-valid, fully-empty project', () => {
		const project = createEmptyMuseumProject({ id: 'project:blank', name: 'Blank' });

		expect(project.formatVersion).toBe(1);
		expect(project.layout.formatVersion).toBe(3);
		expect(project.layout.units).toBe('meters');
		expect(project.layout.floors).toEqual([]);
		expect(project.layout.objects).toEqual([]);
		expect(project.scene.version).toBe(6);
		expect(project.scene.textures).toEqual([]);
		expect(project.scene.materials).toEqual([]);
		expect(project.scene.entities).toEqual([]);
		expect(project.scene.navigationNodes).toEqual([]);
		expect(project.scene.connections).toEqual([]);

		const result = validateMuseumProject(project);
		expect(result.success).toBe(true);
	});

	it('round-trips a blank project byte-stably through the codec', () => {
		const project = createEmptyMuseumProject({ id: 'project:blank', name: 'Blank' });
		const json = serializeMuseumProject(project);
		const parsed = parseMuseumProjectJson(json);

		expect(parsed.success).toBe(true);
		if (!parsed.success) return;
		expect(parsed.project).toEqual(project);
		expect(serializeMuseumProject(parsed.project)).toBe(json);
	});

	it('accepts an authoring-empty scene document with an empty layout', () => {
		const result = validateMuseumProject({
			formatVersion: 1,
			id: 'project:blank',
			name: 'Blank',
			layout: createEmptyLayoutDocument(),
			scene: createEmptySceneDocument()
		});

		expect(result.success).toBe(true);
	});

	it('keeps non-empty scene invariants: a populated scene still requires its rooms', () => {
		const result = validateMuseumProject({
			formatVersion: 1,
			id: 'project:blank',
			name: 'Blank',
			layout: createEmptyLayoutDocument(),
			scene: museumSceneDocument
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.issues[0]).toMatchObject({
				path: '$.scene.entities[0].roomId',
				code: 'unknown_room'
			});
		}
	});
});

describe('H1 S0 — pinned types', () => {
	it('locks EditorViewMode to plan | 3d', () => {
		expectTypeOf<EditorViewMode>().toEqualTypeOf<'plan' | '3d'>();

		const modes: EditorViewMode[] = ['plan', '3d'];
		expect(modes).toEqual(['plan', '3d']);
	});
});

describe('H1 S0 — zero-node policy + room-resolver seam', () => {
	it('pickInitialNavigationNodeId returns null for a scene with no navigation nodes', () => {
		const rooms = createLayoutRoomRegistry(createEmptyLayoutDocument());
		const scene = resolveSceneDocument(createEmptySceneDocument(), rooms);

		expect(scene.navigationNodes).toEqual([]);
		expect(pickInitialNavigationNodeId(scene)).toBeNull();
	});

	it('boots a zero-node scene against injected rooms without reaching for Chopin', () => {
		const rooms = createLayoutRoomRegistry(createEmptyLayoutDocument());
		const store = new EditorDocumentStore(createEmptySceneDocument(), rooms);

		expect(store.scene.navigationNodes).toEqual([]);
		expect(store.state.activeNodeId).toBe('');
	});
});

describe('H1 S0 — relic isolation', () => {
	it('relic store rejects setWorkspace("layout"); the full editor allows it', () => {
		const relic = createMuseumEditorStore({ relic: true });
		expect(relic.setWorkspace('layout')).toBe(false);
		expect(relic.currentWorkspace).toBe('scene');

		const full = createMuseumEditorStore();
		expect(full.setWorkspace('layout')).toBe(true);
		expect(full.currentWorkspace).toBe('layout');
	});
});

describe('H1 S0 — session/shell contracts (closed by later slices)', () => {
	it.todo(
		'S2: booting the editor leaves navigationNodes empty and uses a session-only free camera (no persisted node/endpoint)'
	);
	it.todo(
		'S2: visitor/tour preview is unavailable on a blank project until a valid node/route exists'
	);
	it.todo(
		'S1/S2: document mutation and view switching are rejected during camera playback; framing edits are blocked during director framing'
	);
});

describe('H1 S1 — Plan ↔ 3D switch preserves session state', () => {
	it('switches workspace without touching document, history, dirty state, or selection', () => {
		const store = createMuseumEditorStore({ document: cloneFixtureDocument() });

		// Make one real mutation so the undo stack is non-empty and the doc is dirty.
		expect(store.beginDocumentTransaction()).toBe(true);
		const first = store.document.entities[0]!;
		first.rotation = [
			first.rotation[0],
			first.rotation[1] + 0.001,
			first.rotation[2]
		] as typeof first.rotation;
		expect(store.commitDocumentTransaction()).toBe(true);
		expect(store.canUndo).toBe(true);

		const documentJson = serializeSceneDocument(store.document);
		const historyVersion = store.historyVersion;
		const dirty = store.isDirty;
		const selection = JSON.parse(JSON.stringify(store.selection.workspace)) as unknown;

		expect(store.setWorkspace('layout')).toBe(true); // Plan
		expect(store.setWorkspace('camera')).toBe(true); // 3D camera
		expect(store.setWorkspace('scene')).toBe(true); // 3D scene

		expect(serializeSceneDocument(store.document)).toBe(documentJson);
		expect(store.historyVersion).toBe(historyVersion);
		expect(store.canUndo).toBe(true);
		expect(store.isDirty).toBe(dirty);
		expect(JSON.parse(JSON.stringify(store.selection.workspace))).toEqual(selection);
	});
});

describe('H1 S1 — route wiring (relic smoke proxy, no DOM harness)', () => {
	it('/museum/editor mounts the frozen legacy entry, not the H1 shell', () => {
		const relic = readRouteSource('museum/editor/+page.svelte');
		expect(relic).toContain('virtual:museum-editor-entry');
		expect(relic).not.toContain('H1EditorApp');
	});

	it('/ and /editor mount the H1 shell', () => {
		for (const routePath of ['+page.svelte', 'editor/+page.svelte']) {
			const source = readRouteSource(routePath);
			expect(source).toContain('H1EditorApp');
			expect(source).not.toContain('virtual:museum-editor-entry');
		}
	});

	it('virtual:museum-editor-entry resolves to the legacy MuseumEditorApp', () => {
		const plugin = museumEditorEntryPlugin() as {
			resolveId?(id: string): string | null | undefined;
			load?(id: string): string | undefined;
		};
		const resolved = plugin.resolveId?.('virtual:museum-editor-entry');
		expect(resolved).toBeTruthy();
		const loaded = plugin.load?.(resolved!);
		expect(loaded).toContain('MuseumEditorApp.svelte');
	});
});
