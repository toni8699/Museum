import { describe, expect, it } from 'vitest';

import { chopinRuntime } from '$lib/content/chopin-project';
import { serializeSceneDocument } from '$lib/content/scene-codec';
import { createEditorStore } from '$lib/editor/editor-store.svelte';
import { EditorViewState } from '$lib/editor/app/editor-view-state.svelte';
import {
	createLayoutInteractionState,
	type LayoutInteractionState
} from '$lib/editor/layout/layout-interaction';
import {
	captureLayoutPreviewSnapshot,
	commitLayoutDraftRoom,
	createEmptyLayoutPreviewState,
	restoreLayoutPreviewSnapshot
} from '$lib/editor/layout/layout-preview-state.svelte';
import {
	hydrateProjectAssets,
	isReadyProjectTextureMetadata,
	ownsProjectLoad
} from '$lib/editor/project-asset-load';
import { ProjectAssetRequestScope } from '$lib/editor/project-asset-request-scope';
import { serializeLayoutDocument } from '$lib/layout/layout-codec';
import type { ProjectAssetMetadata } from '$lib/editor/project-persistence';
import { cloneFixtureDocument } from '../../content/__fixtures__/load-fixture-scene';

/**
 * A→B project-session teardown regression (P21.1).
 *
 * The shared project layout mounts one session per projectId inside
 * `{#key page.params.projectId}`: navigating A→B destroys A's subtree and
 * mounts B through the identical boot path (fresh store, layout preview,
 * view state, asset context, and request tokens). There is no DOM harness in
 * this suite, so navigation is modeled in two faithful halves:
 *
 * - mount freshness: boot two sessions through the same constructor path
 *   EditorApp uses, dirty A on every session axis, and prove B observes none
 *   of it;
 * - real teardown: drive the actual session-teardown entry points the
 *   unmount path calls (`ProjectAssetRequestScope.invalidate()`, the exact
 *   call inside `invalidateProjectAssets()`, plus the `ownsProjectLoad` /
 *   hydration currency gates) through an in-flight → teardown → reboot
 *   sequence — nothing here is reimplemented or manually simulated.
 *
 * The `{#key}` source pin in `contracts.test.ts` closes the loop
 * (remount ⇒ this boot path + this teardown).
 */
function bootSession() {
	const layoutPreview = createEmptyLayoutPreviewState();
	const store = createEditorStore({
		document: cloneFixtureDocument(),
		rooms: chopinRuntime.rooms
	});
	store.registerLayoutHistory({
		capture: () => captureLayoutPreviewSnapshot(layoutPreview),
		replace: (snapshot) =>
			restoreLayoutPreviewSnapshot(
				layoutPreview,
				snapshot as ReturnType<typeof captureLayoutPreviewSnapshot>
			),
		matches: (a, b) =>
			JSON.stringify((a as { project: { layout: unknown } }).project.layout) ===
			JSON.stringify((b as { project: { layout: unknown } }).project.layout)
	});
	const viewState = new EditorViewState();
	const layoutInteraction: LayoutInteractionState = createLayoutInteractionState();
	return { store, layoutPreview, viewState, layoutInteraction };
}

function dirtySceneDocument(store: ReturnType<typeof createEditorStore>): void {
	expect(store.beginDocumentTransaction()).toBe(true);
	const first = store.document.entities[0]!;
	first.rotation = [first.rotation[0], first.rotation[1] + 0.001, first.rotation[2]];
	expect(store.commitDocumentTransaction()).toBe(true);
}

function readyAsset(projectId: string): ProjectAssetMetadata {
	return {
		id: 'asset-a',
		projectId,
		name: 'Oak',
		kind: 'texture',
		storageKind: 'r2',
		sourceKind: 'upload',
		sourceRef: null,
		mime: 'image/png',
		byteSize: 1024,
		sha256: 'fingerprint-a',
		importState: 'ready',
		createdAt: '2026-09-04T00:00:00.000Z',
		updatedAt: '2026-09-04T00:00:00.000Z'
	};
}

describe('A→B project-session teardown', () => {
	it('does not carry the scene document or layout draft into the next session', () => {
		const a = bootSession();
		const b = bootSession();
		const docBefore = serializeSceneDocument(b.store.document);
		dirtySceneDocument(a.store);
		const drafted = commitLayoutDraftRoom(a.layoutPreview, [[0, 0], [4, 0], [4, 3], [0, 3]]);
		expect(drafted.success).toBe(true);

		expect(serializeSceneDocument(a.store.document)).not.toBe(docBefore);
		expect(serializeSceneDocument(b.store.document)).toBe(docBefore);
		expect(b.layoutPreview.project.layout.floors).toEqual([]);
		expect(serializeLayoutDocument(b.layoutPreview.project.layout)).not.toBe(
			serializeLayoutDocument(a.layoutPreview.project.layout)
		);
	});

	it('does not carry history entries into the next session', () => {
		const a = bootSession();
		const b = bootSession();
		dirtySceneDocument(a.store);

		expect(a.store.historyVersion).toBe(1);
		expect(a.store.canUndo).toBe(true);
		expect(b.store.historyVersion).toBe(0);
		expect(b.store.canUndo).toBe(false);
	});

	it('does not carry scene or camera selection into the next session', () => {
		const a = bootSession();
		const b = bootSession();
		const entityId = a.store.document.entities[0]!.id;
		expect(a.store.selectionActions.selectPlacement(entityId)).toBe(true);
		expect(a.store.selectedPlacementIds).toEqual([entityId]);
		// The workspace/nav pair cross-clears inside the reducer: arming the
		// camera slot drops the scene pick in the same session.
		expect(a.store.selectionActions.selectNavigationNode('tour-paris')).toBe(true);
		expect(a.store.navigationSelection).toMatchObject({ kind: 'node' });
		expect(a.store.selectedPlacementIds).toEqual([]);
		expect(b.store.selectedPlacementIds).toEqual([]);
		expect(b.store.navigationSelection).toBeNull();
	});

	it('does not carry domain, view, or Timeline chrome into the next session', () => {
		const a = bootSession();
		const b = bootSession();
		expect(a.viewState.setDomain('camera')).toBe(true);
		expect(a.viewState.setView('camera', '3d')).toBe(true);
		expect(a.store.setTimelineExpanded(true)).toBe(true);
		expect(a.store.setTimelineHeight(300)).toBe(true);

		expect(b.viewState.domain).toBe('scene');
		expect(b.viewState.activeView).toBe('plan');
		expect(b.store.timelineExpanded).toBe(false);
		expect(b.store.timelineHeight).toBe(288);
	});

	it('scopes asset metadata to its owning project and refuses stale hydration', async () => {
		const asset = readyAsset('project:A');
		expect(isReadyProjectTextureMetadata(asset, 'project:A')).toBe(true);
		expect(isReadyProjectTextureMetadata(asset, 'project:B')).toBe(false);

		// Control: a current session with no references resolves cleanly.
		await expect(
			hydrateProjectAssets({
				projectId: 'project:B',
				textures: [],
				api: {
					listAssets: () => Promise.reject(new Error('must not be called')),
					loadAssetContent: () => Promise.reject(new Error('must not be called'))
				},
				cache: { getEntry: () => null },
				signal: new AbortController().signal,
				isCurrent: () => true
			})
		).resolves.toEqual({ assets: null, staged: [] });

		// A's hydration racing B's mount aborts instead of staging A's bytes.
		await expect(
			hydrateProjectAssets({
				projectId: 'project:A',
				textures: [{ uri: '/project-assets/asset-a' }],
				api: {
					listAssets: () => Promise.reject(new Error('must not be called')),
					loadAssetContent: () => Promise.reject(new Error('must not be called'))
				},
				cache: { getEntry: () => null },
				signal: new AbortController().signal,
				isCurrent: () => false
			})
		).rejects.toThrow('Project changed while loading');
	});

	it('tears down in-flight asset work on navigation through the real request scope', async () => {
		// A's mount owns a fresh scope (EditorApp constructs one per mount).
		const scopeA = new ProjectAssetRequestScope();
		// A starts a list fetch, an upload mutation, and a byte export.
		const list = scopeA.beginList();
		const mutation = scopeA.beginMutation();
		const exportController = new AbortController();
		scopeA.trackExport(exportController);

		// A starts hydrating its registry while the list is in flight.
		let resolveList!: (assets: ProjectAssetMetadata[]) => void;
		const hydration = hydrateProjectAssets({
			projectId: 'project:A',
			textures: [{ uri: '/project-assets/asset-a' }],
			api: {
				listAssets: () => new Promise<ProjectAssetMetadata[]>((resolve) => (resolveList = resolve)),
				loadAssetContent: () => Promise.reject(new Error('must not be reached after teardown'))
			},
			cache: { getEntry: () => null },
			signal: new AbortController().signal,
			// Same shape as the production currency check: the captured token
			// must still match the scope's live token.
			isCurrent: () => list.token === scopeA.listToken
		});

		// Navigation A→B: the layout destroys A's subtree and unmount runs the
		// same teardown EditorApp wires (`invalidateProjectAssets` delegates here).
		scopeA.invalidate();

		// Late A-responses disown themselves through the live counters…
		expect(list.token).not.toBe(scopeA.listToken);
		expect(mutation.token).not.toBe(scopeA.mutationToken);
		expect(scopeA.releaseMutationController(mutation.token)).toBe(false);
		// …every in-flight controller fired…
		expect(list.controller.signal.aborted).toBe(true);
		expect(mutation.controller.signal.aborted).toBe(true);
		expect(exportController.signal.aborted).toBe(true);
		expect(scopeA.exportCount).toBe(0);
		expect(scopeA.listController).toBeNull();
		expect(scopeA.mutationController).toBeNull();
		// …and the racing hydration refuses instead of staging A's bytes.
		resolveList([readyAsset('project:A')]);
		await expect(hydration).rejects.toThrow('Project changed while loading');

		// B mounts with a pristine scope: counters at zero, no controllers.
		const scopeB = new ProjectAssetRequestScope();
		expect(scopeB.epoch).toBe(0);
		expect(scopeB.listToken).toBe(0);
		expect(scopeB.mutationToken).toBe(0);
		const fresh = scopeB.beginMutation();
		expect(scopeB.releaseMutationController(fresh.token)).toBe(true);
		expect(fresh.controller.signal.aborted).toBe(false);
	});

	it('disowns in-flight project requests once the project ID changes', () => {
		// A's load in flight under epoch 1; navigation remounts B with a fresh
		// epoch, so A's late response fails the live-token gate.
		const controllerA = new AbortController();
		const controllerB = new AbortController();
		expect(ownsProjectLoad(1, controllerA, 2, controllerB)).toBe(false);
		expect(ownsProjectLoad(2, controllerB, 2, controllerB)).toBe(true);
	});
});
