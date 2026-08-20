import { describe, expect, expectTypeOf, it } from 'vitest';

import { museumSceneDocument } from '$lib/content/chopin-project';
import { createEmptySceneDocument, resolveSceneDocument } from '$lib/content/scene';
import { createMuseumEditorStore } from '$lib/editor/museum-editor.svelte';
import {
	EditorDocumentStore,
	pickInitialNavigationNodeId
} from '$lib/editor/store/document-store.svelte';
import { EditorInteractionStore } from '$lib/editor/store/editor-interaction-store.svelte';
import type { EditorViewMode } from '$lib/editor/app/editor-view-mode';
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
import { deriveActiveSelection } from '$lib/editor/app/active-editor-selection.svelte';
import type { LayoutSelection } from '$lib/editor/layout/layout-interaction';
import { cloneFixtureDocument } from '../../content/__fixtures__/load-fixture-scene';
import { museumEditorEntryPlugin } from '../../../../vite/museum-editor-entry-plugin';

const ROUTES_DIR = fileURLToPath(new URL('../../../../src/routes', import.meta.url));
const LIB_DIR = fileURLToPath(new URL('../../../../src/lib', import.meta.url));
const TEST_DIR = fileURLToPath(new URL('../../../../tests', import.meta.url));

function readRouteSource(routePath: string): string {
	return fs.readFileSync(path.join(ROUTES_DIR, routePath), 'utf8');
}

function readLibSource(relativePath: string): string {
	return fs.readFileSync(path.join(LIB_DIR, relativePath), 'utf8');
}

/** Recursively read every .ts/.svelte source under a `$lib` sub-directory. */
function readAllSourceFiles(relativeDir: string): { name: string; source: string }[] {
	const root = path.join(LIB_DIR, relativeDir);
	const sources: { name: string; source: string }[] = [];
	const stack = [root];
	while (stack.length > 0) {
		const entry = stack.pop()!;
		const stat = fs.statSync(entry);
		if (stat.isDirectory()) {
			for (const child of fs.readdirSync(entry)) {
				if (child.startsWith('.')) continue;
				stack.push(path.join(entry, child));
			}
		} else if (entry.endsWith('.ts') || entry.endsWith('.svelte')) {
			sources.push({ name: path.basename(entry), source: fs.readFileSync(entry, 'utf8') });
		}
	}
	return sources;
}

describe('empty project contract', () => {
	it('creates a codec-valid, fully-empty project', () => {
		const project = createEmptyMuseumProject({ id: 'project:blank', name: 'Blank' });

		expect(project.layout.units).toBe('meters');
		expect(project.layout.floors).toEqual([]);
		expect(project.layout.objects).toEqual([]);
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
			id: 'project:blank',
			name: 'Blank',
			layout: createEmptyLayoutDocument(),
			scene: createEmptySceneDocument()
		});

		expect(result.success).toBe(true);
	});

	it('keeps non-empty scene invariants: a populated scene still requires its rooms', () => {
		const result = validateMuseumProject({
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

describe('pinned types', () => {
	it('locks EditorViewMode to plan | 3d', () => {
		expectTypeOf<EditorViewMode>().toEqualTypeOf<'plan' | '3d'>();

		const modes: EditorViewMode[] = ['plan', '3d'];
		expect(modes).toEqual(['plan', '3d']);
	});
});

describe('zero-node policy + room-resolver seam', () => {
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

describe('relic isolation', () => {
	it('relic store rejects setWorkspace("layout"); the full editor allows it', () => {
		const relic = createMuseumEditorStore({ relic: true });
		expect(relic.setWorkspace('layout')).toBe(false);
		expect(relic.currentWorkspace).toBe('scene');

		const full = createMuseumEditorStore();
		expect(full.setWorkspace('layout')).toBe(true);
		expect(full.currentWorkspace).toBe('layout');
	});
});

describe('boot into an empty project', () => {
	it('boots blank: zero navigation nodes, no persisted node, no tour preview', () => {
		const project = createEmptyMuseumProject({ id: 'project:blank', name: 'Blank' });
		const store = createMuseumEditorStore({
			document: project.scene,
			rooms: createLayoutRoomRegistry(project.layout)
		});

		expect(store.document.navigationNodes).toEqual([]);
		expect(store.document.connections).toEqual([]);
		expect(store.document.entities).toEqual([]);
		expect(store.scene.navigationNodes).toEqual([]);
		expect(store.state.activeNodeId).toBe('');
		expect(store.canStartTourPreview).toBe(false);
	});

	it('locks tour preview until a guided chain exists (zero nodes, lone node, guided)', () => {
		// Zero nodes.
		const empty = createMuseumEditorStore({
			document: createEmptyMuseumProject({ id: 'p0', name: 'Empty' }).scene,
			rooms: createLayoutRoomRegistry(createEmptyLayoutDocument())
		});
		expect(empty.canStartTourPreview).toBe(false);

		// One node that is not part of a guided chain (no next/previous link).
		const lone = cloneFixtureDocument();
		const node = lone.navigationNodes[0]!;
		lone.navigationNodes = [node];
		lone.connections = [];
		node.nextNodeId = undefined;
		node.previousNodeId = undefined;
		node.connectedNodeIds = [];
		expect(createMuseumEditorStore({ document: lone }).canStartTourPreview).toBe(false);

		// A guided chain exists.
		expect(
			createMuseumEditorStore({ document: cloneFixtureDocument() }).canStartTourPreview
		).toBe(true);
	});

	it('reset restores the boot document (not Chopin) and clears history', () => {
		const store = createMuseumEditorStore({ document: cloneFixtureDocument() });
		const bootCanonical = store.canonicalJson;

		expect(store.beginDocumentTransaction()).toBe(true);
		const first = store.document.entities[0]!;
		first.rotation = [
			first.rotation[0],
			first.rotation[1] + 0.001,
			first.rotation[2]
		] as typeof first.rotation;
		expect(store.commitDocumentTransaction()).toBe(true);
		expect(store.canUndo).toBe(true);
		expect(store.isDirty).toBe(true);

		expect(store.resetToCheckedInDocument()).toBe(true);
		expect(store.canonicalJson).toBe(bootCanonical);
		expect(store.canUndo).toBe(false);
		expect(store.isDirty).toBe(false);
	});

	it('authors every node standalone, then unlocks preview once the two-node pair is connected', () => {
		const fixture = cloneFixtureDocument();
		fixture.navigationNodes = [];
		fixture.connections = [];
		const store = createMuseumEditorStore({ document: fixture });

		const roomId = store.rooms.entries[0]!.id;
		const floorWorld = store.rooms.point(roomId, [0, 0, 0]);

		// First node commits standalone as a free node (not in order yet).
		expect(store.beginCameraPlacement()).toBe(true);
		const firstNodeId = store.createPendingNavigationNodeAt(roomId, floorWorld, [0, 0, -1]);

		expect(firstNodeId).not.toBeNull();
		expect(store.document.navigationNodes).toHaveLength(1);
		expect(store.document.connections).toHaveLength(0);
		expect(store.pendingNavigationCommand).toBeNull();
		expect(store.canStartTourPreview).toBe(false); // lone node, no flow

		// Second node also commits standalone — no pending connect step (B0).
		expect(store.beginCameraPlacement()).toBe(true);
		const secondNodeId = store.createPendingNavigationNodeAt(
			roomId,
			store.rooms.point(roomId, [1, 0, 1]),
			[0, 0, -1]
		);
		expect(secondNodeId).not.toBeNull();
		expect(store.document.navigationNodes).toHaveLength(2);
		expect(store.document.connections).toHaveLength(0);
		expect(store.pendingNavigationCommand).toBeNull();

		// Connecting the only two free nodes seeds the open pair first → second
		// in the same transaction, so preview is immediately ready.
		expect(store.selectionActions.selectNavigationNode(firstNodeId!)).toBe(true);
		expect(store.beginConnectExistingNodes()).toBe(true);
		expect(store.selectionActions.selectNavigationNode(secondNodeId!)).toBe(true);
		expect(store.document.connections).toHaveLength(1);
		expect(store.guidedTourNodeIds).toEqual([firstNodeId!, secondNodeId!]);
		expect(store.canStartTourPreview).toBe(true);
	});
});

// The S1/S2 playback-lock contract (view switching rejected during camera
// playback) is already pinned by museum-editor-shell.test.ts — "rejects
// workspace switches during interaction or modal preview" — so it is not
// re-pinned here.

describe('Plan ↔ 3D switch preserves session state', () => {
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

	it('restores the layout ceiling toggle into the editor 3D View menu (S10 context contract), relic untouched', () => {
		const toolbar = readLibSource('editor/EditorViewportToolbar.svelte');
		const ws3d = readLibSource('editor/app/Workspace3DView.svelte');
		const viewport = readLibSource('editor/EditorViewport.svelte');

		// S10 — the editor camera-agnostic escape hatch is gone: the shared toolbar
		// takes the explicit context prop, Workspace3DView threads it, and the relic
		// mount passes neither (legacy camera-only fallback).
		expect(toolbar).toContain('onToggleCeilings');
		expect(toolbar).toContain('context?: \'scene\' | \'camera\'');
		expect(toolbar).not.toContain('cameraAgnosticViewMenu');
		expect(toolbar).toMatch(/role="menuitemcheckbox"[^]*?<span>Ceiling<\/span>/);
		expect(ws3d).toContain('context: \'scene\' | \'camera\'');
		expect(ws3d).not.toContain('cameraAgnosticViewMenu');
		expect(ws3d).toContain('onToggleCeilings={');
		expect(ws3d).toContain('toggleLayoutCeilings');
		// The relic mount feeds neither prop, keeping its LayoutDraftToolbar
		// Ceiling button as the single surface there.
		expect(viewport).not.toContain('onToggleCeilings');
		expect(viewport).not.toContain('context=');
	});
});

describe('route wiring (relic smoke proxy, no DOM harness)', () => {
	it('/museum/editor mounts the frozen legacy entry, not the editor shell', () => {
		const relic = readRouteSource('museum/editor/+page.svelte');
		expect(relic).toContain('virtual:museum-editor-entry');
		expect(relic).not.toContain('EditorApp');
	});

	it('/ and /editor mount the editor shell', () => {
		for (const routePath of ['+page.svelte', 'editor/+page.svelte']) {
			const source = readRouteSource(routePath);
			expect(source).toContain('EditorApp');
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

describe('unified hierarchy contracts', () => {
	it('mounts the editor sidebar + unified tree in the editor shell, never in the relic', () => {
		// editor shell imports the new sidebar (and the unified tree through it).
		const editorApp = readLibSource('editor/app/EditorApp.svelte');
		expect(editorApp).toContain('EditorSidebar');
		expect(editorApp).not.toContain('EditorLeftSidebar');

		// Relic: the route source imports only virtual:museum-editor-entry, and
		// the entry plugin's load() output is just a re-export, so assert on the
		// resolved module's file source (MuseumEditorApp.svelte) + the legacy
		// components themselves.
		const relicApp = readLibSource('editor/MuseumEditorApp.svelte');
		expect(relicApp).toContain('EditorLeftSidebar');
		expect(relicApp).not.toContain('EditorSidebar');
		expect(relicApp).not.toContain('UnifiedProjectTree');

		const relicSidebar = readLibSource('editor/EditorLeftSidebar.svelte');
		expect(relicSidebar).toContain('EditorSceneTree');
		expect(relicSidebar).toContain('EditorCameraTree');
		expect(relicSidebar).not.toContain('UnifiedProjectTree');

		for (const component of [
			'editor/EditorSceneTree.svelte',
			'editor/EditorCameraTree.svelte'
		]) {
			expect(readLibSource(component)).not.toContain('UnifiedProjectTree');
			expect(readLibSource(component)).not.toContain('EditorSidebar');
		}
	});

	it('keeps the camera tree internals reusable behind optional props (relic default behavior)', () => {
		const guided = readLibSource('editor/CameraFlowPanel.svelte');
		const connections = readLibSource('editor/NodeConnectionsPanel.svelte');
		const keyframes = readLibSource('editor/DirectionalKeyframeList.svelte');
		// The optional gate props default to true when absent.
		expect(guided).toMatch(/interactive\??:/);
		expect(connections).toMatch(/interactive\??:/);
		expect(keyframes).toMatch(/interactive\??:/);
	});

	it('gates every guided/free node-row pick in CameraFlowPanel behind interactive (Plan gate)', () => {
		// The Plan gate is behavioral, not just prop presence: the node-row
		// select click (and the connections chevron) must be no-ops when
		// interactive is false, exactly like the connection/direction rows — a
		// plain `onclick={() => selectNode(node.id)}` would leak the camera
		// domain into Plan (the plan's locked "scene/camera rows aria-disabled
		// no-ops" decision).
		const guided = readLibSource('editor/CameraFlowPanel.svelte');
		// Row select is gated and carries aria-disabled on both guided + free
		// rows (the three byte-identical row blocks share one handler shape;
		// S10.1.3 added the detour rows, which are gated identically).
		expect(guided).not.toContain('onclick={() => selectNode(node.id)}');
		expect(guided.match(/onclick=\{interactive \? \(\) => selectNode\(node\.id\) : undefined\}/g)).toHaveLength(3);
		expect(guided.match(/onclick=\{interactive \? \(\) => toggleNodeConnections\(node\.id\) : undefined\}/g)).toHaveLength(2);
		// aria-disabled appears on every gated surface: guided li + chevron +
		// row, free li + chevron + row, detour row.
		expect(guided.match(/aria-disabled=\{interactive \? undefined : true\}/g)).toHaveLength(7);
	});

	it('keeps the unified tree mounted across Hierarchy|Assets tabs and hides the boot header correctly', () => {
		const sidebar = readLibSource('editor/app/EditorSidebar.svelte');
		// The tree must not unmount when the Assets tab is active (its
		// component-local expansion state would be lost) — it renders
		// unconditionally and the inactive panel is hidden by class, with the
		// Assets library as a 3D-only sibling.
		expect(sidebar).toContain('<UnifiedProjectTree');
		expect(sidebar.match(/class:panel-content--hidden/g)?.length).toBe(2);
		// importError is `string | null`, so the boot-empty header check must
		// be `!== null` — `!== undefined` is always true and would show the
		// header strip on every blank boot.
		expect(sidebar).toContain('layoutPreview.importError !== null');
	});

	it('threads the active domain so the camera direction highlight is discovery-driven, gated to camera-or-none', () => {
		const connections = readLibSource('editor/NodeConnectionsPanel.svelte');
		const guided = readLibSource('editor/CameraFlowPanel.svelte');
		const tree = readLibSource('editor/UnifiedProjectTree.svelte');
		// The panel accepts the S3 active domain and highlights the discovery
		// direction row when domain is camera-or-none (scrubbing sets discovery
		// with no navigation selection); layout/scene never co-highlights.
		expect(connections).toMatch(/activeDomain\??:/);
		expect(connections).toContain("activeDomain === 'camera' || activeDomain === 'none'");
		// CameraFlowPanel forwards the domain to every embedded panel, and the
		// unified tree supplies it from the S3 active selection.
		// Svelte shorthand `{activeDomain}` on both embedded connections panels.
		expect(guided.match(/\{activeDomain\}/g)?.length).toBe(2);
		expect(tree).toContain('activeDomain={active.domain}');
	});

	it('expands the ancestor chain for every active layout/scene selection, not just rooms', () => {
		const tree = readLibSource('editor/UnifiedProjectTree.svelte');
		const model = readLibSource('editor/unified-project-tree-model.ts');
		// Viewport picks don't route through the tree's select* helpers (which
		// already expand), so the tree must reveal the picked row for any active
		// layout/scene selection — including cluster ancestors.
		expect(tree).toContain('layoutSelectionAncestorRoomId');
		expect(tree).toContain('ensureClusterTreeExpanded');
		expect(model).toContain('export function layoutSelectionAncestorRoomId');
	});
});

describe('layout 3D pick metadata', () => {
	it('keeps the pure builder + pick module free of renderer/Svelte imports', () => {
		const builder = readLibSource('layout/wall-mesh-builder.ts');
		const picking = readLibSource('editor/layout/layout-3d-picking.ts');
		for (const source of [builder, picking]) {
			expect(source).not.toMatch(/from\s+['"](three|svelte|@threlte|\$app)['"]/);
			expect(source).not.toMatch(/\$lib\/museum/);
		}
	});

	it('ships the selection-highlight shell while anchor helpers + hover stay deferred', () => {
		const scene = readLibSource('editor/layout/LayoutPreviewScene.svelte');
		// Ceiling is pick-identifiable (surfaceType 'ceiling' + roomId) but carries
		// no editorSurface, so placement grounding still ignores it.
		expect(scene).toMatch(/surfaceType: 'ceiling'/);
		// 2026-08-16 revision: the selection-highlight shell is LIVE again — it
		// renders from `interaction.selection` alone, so hierarchy (tree) wall
		// picks highlight even though direct 3D wall picks are deferred. The
		// anchor-helper octahedra and the hover shell stay commented out
		// (deferred); their authored identity and the pure placement derivation
		// are preserved inside the commented blocks for re-enabling.
		expect(scene).toContain('LayoutWallHighlight');
		expect(scene).toContain('buildWallHighlightMesh');
		expect(scene).toContain('matchWallRanges');
		expect(scene).toContain('matchOpeningRanges');
		expect(scene).toContain('WALL_HIGHLIGHT_MATERIAL');
		expect(scene).toContain('Deferred (2026-08-16)');
		expect(scene).toContain("editorEntity: 'layout-anchor'");
		expect(scene).toContain('layoutAnchorHelperPlacements');
		expect(scene).toContain('JSON.stringify([placement.roomId, placement.segmentId, placement.anchorId])');
	});

	it('defers direct 3D wall/interior-anchor picks behind isLayoutDirectPickDeferred', () => {
		const ws3d = readLibSource('editor/app/Workspace3DView.svelte');
		const picking = readLibSource('editor/layout/layout-3d-picking.ts');
		// The gate is pure + exported (unit-tested) and the coordinator falls
		// through to the normal dispatch for deferred resolutions; the wall/anchor
		// commit cases are gone from the shell.
		expect(picking).toContain('export function isLayoutDirectPickDeferred');
		expect(ws3d).toContain('isLayoutDirectPickDeferred(resolved.selection)');
		expect(ws3d).not.toContain('selectLayoutWall');
		expect(ws3d).not.toContain('selectLayoutInteriorAnchor');
	});

	it('disconnects the highlight feed: no showAnchors/hoverSelection/onLayoutHover passes remain', () => {
		const scene = readLibSource('editor/layout/LayoutPreviewScene.svelte');
		const ws3d = readLibSource('editor/app/Workspace3DView.svelte');
		// The S6 click coordinator still owns its optional props (onLayoutPick /
		// onLayoutHover — the contract), but the editor shell no longer feeds any of
		// the disconnected surfaces, so EditorSelection's hover guard makes the
		// whole hover resolution a no-op.
		expect(ws3d).not.toContain('showAnchors');
		expect(ws3d).not.toContain('hoverSelection');
		// Assert the wiring shape, not the bare identifier: the KNOWN DEBT
		// comment in Workspace3DView legitimately mentions the prop name.
		expect(ws3d).not.toContain('onLayoutHover={');
		expect(ws3d).toContain('onLayoutPick={store.isVisitorCameraPreview ? undefined : handleLayoutPick}');
	});

	it('fails the wall-mesh build closed on an untagged face (pick-tag guard)', () => {
		const builder = readLibSource('layout/wall-mesh-builder.ts');
		expect(builder).toContain('untagged face');
		expect(builder).toMatch(/if \(!face\.pick\) \{/);
	});

	it('carries pickRanges through the adapter as userData, never geometry groups', () => {
		const adapter = readLibSource('render/wall-geometry-adapter.ts');
		expect(adapter).toContain('geometry.userData.pickRanges = mesh.pickRanges');
		// Exactly one geometry.addGroup( call — the material-group loop only.
		// pickRanges is metadata on userData and must never add a group (zero
		// draw-call delta). The other addGroup mentions are doc comments.
		expect(adapter.match(/geometry\.addGroup\(/g)?.length).toBe(1);
	});

	it('keeps the preview-state pick index cache beside the wall-mesh cache', () => {
		const state = readLibSource('editor/layout/layout-preview-state.svelte.ts');
		expect(state).toContain('layout3dPickIndexByRoom');
		expect(state).toContain('buildLayout3dTriangleIndex');
	});
});

describe('centralized 3D layout selection', () => {
	it('extends the single coordinator with an optional onLayoutPick prop, absent on the relic', () => {
		const selection = readLibSource('editor/EditorSelection.svelte');
		expect(selection).toContain('onLayoutPick?:');
		expect(selection).toContain('competingSceneDistance: number | null');
		expect(selection).toContain('layoutCandidatesFromIntersections');

		const viewport = readLibSource('editor/EditorViewport.svelte');
		expect(viewport).toContain('<EditorSelection {store} {transformControls} />');
		expect(viewport).not.toContain('onLayoutPick');
	});

	it('wires the editor shell behind a visitor-preview gate', () => {
		const ws3d = readLibSource('editor/app/Workspace3DView.svelte');
		expect(ws3d).toContain('onLayoutPick={store.isVisitorCameraPreview ? undefined : handleLayoutPick}');
		expect(ws3d).toContain('resolveLayout3dHits');
		expect(ws3d).toContain('layoutPickBeatsSceneDistance');
	});

	it('tags the wall mesh with authored object-level identity in the shared scene', () => {
		const scene = readLibSource('editor/layout/LayoutPreviewScene.svelte');
		expect(scene).toContain("userData={{ surfaceType: 'wall', roomId: room.roomId }}");
	});

	it('exports the S6 resolution contracts from the pure picking module', () => {
		const picking = readLibSource('editor/layout/layout-3d-picking.ts');
		expect(picking).toContain('export type Layout3dHitCandidate');
		expect(picking).toContain('export type Layout3dResolvedHit');
		expect(picking).toContain('export function resolveLayout3dHits');
		expect(picking).toContain('export function layoutCandidatesFromIntersections');
		expect(picking).toContain('LAYOUT_3D_SAME_DEPTH_EPSILON = 1e-4');
	});
});

describe('single gizmo host', () => {
	/**
	 * Scene/camera session + raw-transaction mutators. The scene and camera
	 * *adapters* are the sanctioned session owners (the extraction moved the
	 * monolith's inline calls into them), so these markers are forbidden in
	 * every other gizmo file: host, controller, policy, contract, composer
	 * glue. Add tokens as adapters land.
	 */
	const SESSION_MUTATION_MARKERS = [
		'updatePlacementTransform',
		'beginDocumentTransaction',
		'commitDocumentTransaction',
		'cancelDocumentTransaction',
		'updateNavigationNodePoint',
		'updateConnectionAnchorWorldPoint',
		'updateSelectedViewKeyframeTargetWorldPoint'
	];
	/**
	 * The layout Plan mutators: forbidden in every gizmo file, including the
	 * layout adapter (the S8 adapter uses its own candidate path, never these).
	 */
	const LAYOUT_MUTATION_MARKERS = [
		'updateLayout',
		'previewLayoutRoomUnit',
		'restoreLayoutPreviewSnapshot'
	];
	/**
	 * The layout transaction facade (S8 owns it): the layout *adapter* is the
	 * sanctioned session owner, so these markers are exempted for that basename
	 * only — mirroring the SESSION_MUTATION_MARKERS exemption. `beginLayoutTransaction`
	 * joins the banned list in S8 (it was absent from the S7 markers).
	 */
	const LAYOUT_FACADE_MARKERS = [
		'beginLayoutTransaction',
		'commitLayoutTransaction',
		'cancelLayoutTransaction'
	];
	const ADAPTER_BASENAMES = new Set([
		'scene-gizmo-adapter.svelte.ts',
		'camera-gizmo-adapter.svelte.ts'
	]);
	/** The layout adapter basename exempted from the facade markers (S8 step 2). */
	const LAYOUT_ADAPTER_BASENAMES = new Set(['layout-gizmo-adapter.svelte.ts']);

	it('relocates the sole live TransformControls constructor into EditorTransformControlsHost.svelte', () => {
		const constructions = readAllSourceFiles('editor').reduce(
			(count, entry) =>
				count + (entry.source.match(/new ThreeTransformControls\(/g)?.length ?? 0),
			0
		);
		expect(constructions).toBe(1);
		// The one construction lives in the host; the composer is constructor-free.
		expect(
			readLibSource('editor/gizmo/EditorTransformControlsHost.svelte').match(/new ThreeTransformControls\(/g)
		).toHaveLength(1);
		expect(readLibSource('editor/EditorTransformControls.svelte')).not.toContain('new ThreeTransformControls');
	});

	it('mounts the shared composer exactly once from Workspace3DView and the relic viewport; neither constructs controls or helpers', () => {
		for (const [relativePath, label] of [
			['editor/app/Workspace3DView.svelte', 'Workspace3DView'],
			['editor/EditorViewport.svelte', 'EditorViewport']
		] as const) {
			const source = readLibSource(relativePath);
			expect((source.match(/<EditorTransformControls/g) ?? []).length, `${label} mounts`).toBe(1);
			expect(source, `${label}`).not.toContain('new ThreeTransformControls');
			expect(source, `${label}`).not.toContain('getHelper');
			expect(source, `${label}`).toContain('bind:controls');
		}
	});

	it('keeps EditorSelection on the bound controls with axis/dragging precedence before the S6 layout flow', () => {
		const selection = readLibSource('editor/EditorSelection.svelte');
		expect(selection).toContain('transformControls?: TransformControls;');
		// Pointerdown priority gate and the pointerup commit gate both check
		// the bound controls before the layout/normal selection flow runs.
		expect(selection).toContain('if (transformControls?.axis || transformControls?.dragging) return;');
		expect(selection).toContain('!transformControls?.axis &&');
	});

	it('scopes scene/camera session mutations to the adapters only; layout mutations stay out of every gizmo file (facade only in the layout adapter)', () => {
		for (const { name, source } of readAllSourceFiles('editor/gizmo')) {
			const isAdapter = ADAPTER_BASENAMES.has(name);
			const isLayoutAdapter = LAYOUT_ADAPTER_BASENAMES.has(name);
			for (const marker of SESSION_MUTATION_MARKERS) {
				if (isAdapter) continue; // adapters are the session owners (S7 step 3)
				expect(source, `${name}: ${marker}`).not.toContain(marker);
			}
			for (const marker of LAYOUT_MUTATION_MARKERS) {
				expect(source, `${name}: ${marker}`).not.toContain(marker);
			}
			for (const marker of LAYOUT_FACADE_MARKERS) {
				if (isLayoutAdapter) continue; // the layout adapter is the layout session owner (S8 step 2)
				expect(source, `${name}: ${marker}`).not.toContain(marker);
			}
		}
	});

	it('keeps the adapters constructor- and listener-free (host owns the Three surface)', () => {
		for (const [relativePath, label] of [
			['editor/gizmo/scene-gizmo-adapter.svelte.ts', 'scene adapter'],
			['editor/gizmo/camera-gizmo-adapter.svelte.ts', 'camera adapter']
		] as const) {
			const source = readLibSource(relativePath);
			expect(source, label).not.toContain('new ThreeTransformControls');
			expect(source, label).not.toContain('window.addEventListener');
		}
	});

	it('resolves the editor composer from the S3 active domain; the relic omits it and falls back to the legacy target', () => {
		// editor mounts with the S3 active-domain selector; the relic mount omits it.
		expect(readLibSource('editor/app/Workspace3DView.svelte')).toContain('activeSelection={activeSelection ?? undefined}');
		expect(readLibSource('editor/EditorViewport.svelte')).not.toContain('activeSelection=');
		// Composer: active domain wins; absent selector → legacy arbitration.
		const composer = readLibSource('editor/EditorTransformControls.svelte');
		expect(composer).toContain('if (activeSelection) return null;');
		expect(composer).toContain('getActiveTransformTarget');
	});

	it('records the fake-host lifecycle harness for orbit restore, single-cancel switch, and late mouseUp', () => {
		const harness = fs.readFileSync(
			path.join(TEST_DIR, 'lib/editor/gizmo/editor-gizmo-host.test.ts'),
			'utf8'
		);
		// The three host-level behaviors Step 0 deferred are pinned there.
		expect(harness).toMatch(/orbit.*(true|false)/i);
		expect(harness).toMatch(/cancels once|switch.*cancel|unmount/i);
		expect(harness).toMatch(/late mouseUp|mouseUp/i);
	});

	it('keeps the policy helper renderer-neutral (no Three/Svelte/runes)', () => {
		const policy = readLibSource('editor/gizmo/editor-gizmo-policy.ts');
		expect(policy).not.toMatch(/from\s+['"](three|svelte|@threlte)['"]/);
		expect(policy).not.toContain('$state');
	});

	it('keeps layout, G4 render, camera route/motion, and visitor sources free of gizmo imports', () => {
		for (const source of [
			...readAllSourceFiles('layout').map((entry) => entry.source),
			...readAllSourceFiles('render').map((entry) => entry.source),
			...readAllSourceFiles('museum').map((entry) => entry.source)
		]) {
			expect(source).not.toContain('editor/gizmo');
		}
		const cameraRoute = readLibSource('museum/navigation/camera-route.ts');
		const cameraMotion = readLibSource('museum/navigation/camera-motion.ts');
		expect(cameraRoute).not.toContain('TransformControls');
		expect(cameraMotion).not.toContain('TransformControls');
	});

	it('pins the shared FSM sync event and the shell-level-only ESC branch', () => {
		const fsm = readLibSource('editor/store/interaction-fsm.ts');
		expect(fsm).toContain("type: 'ACTIVE_TARGET_CHANGE'");
		expect(fsm).toContain('targetKey: string | null');
		const escCase = fsm.slice(fsm.indexOf("case 'ESC':"), fsm.indexOf("case 'KEY_W':"));
		// A live gizmo drag never dispatches ESC (every cancel reason routes
		// through the adapter's cancel + DRAG_END { cancelled: true }), so the
		// ESC branch must contain no Dragging-revert path.
		expect(escCase).not.toContain('RevertDragSideEffect');
		expect(escCase).not.toContain("state === 'Dragging'");
	});

	// Behavioral fixtures recorded before extraction (S7 step 0). The host
	// must keep producing exactly these FSM event sequences.
	it('records placement Escape: DRAG_END(cancelled) → deselect → ACTIVE_TARGET_CHANGE(null) ends Idle; a late mouseUp cannot commit', () => {
		const store = new EditorInteractionStore();
		store.dispatch({ type: 'CLICK', target: 'p1', shift: false, meta: false });
		store.dispatch({ type: 'DRAG_START' });
		expect(store.state).toBe('Dragging');
		// Cancel path: the adapter restores its snapshot and deselects; the
		// host never dispatches FSM ESC from a live drag.
		store.dispatch({ type: 'DRAG_END', cancelled: true });
		store.dispatch({ type: 'ACTIVE_TARGET_CHANGE', targetKey: null });
		expect(store.state).toBe('Idle');
		// Late natural mouseUp is inert — DRAG_END only transitions from Dragging.
		store.dispatch({ type: 'DRAG_END', cancelled: false });
		expect(store.state).toBe('Idle');
	});

	it('records camera Escape: cancel keeps its navigation selection, so the target persists → Selected', () => {
		const store = new EditorInteractionStore();
		store.dispatch({ type: 'ACTIVE_TARGET_CHANGE', targetKey: 'camera:node:pos' });
		store.dispatch({ type: 'DRAG_START' });
		expect(store.state).toBe('Dragging');
		store.dispatch({ type: 'DRAG_END', cancelled: true });
		// No ACTIVE_TARGET_CHANGE(null): the camera selection survives.
		expect(store.state).toBe('Selected');
	});

	it('records a target switch mid-drag: cancel first, then sync; a stray sync during Dragging is ignored', () => {
		const store = new EditorInteractionStore();
		store.dispatch({ type: 'ACTIVE_TARGET_CHANGE', targetKey: 'scene:placement' });
		store.dispatch({ type: 'DRAG_START' });
		expect(store.state).toBe('Dragging');
		// A straggler sync mid-drag can never silently retarget the FSM.
		store.dispatch({ type: 'ACTIVE_TARGET_CHANGE', targetKey: 'camera:node:pos' });
		expect(store.state).toBe('Dragging');
		// The real host switch order: cancel → DRAG_END → attach → sync.
		store.dispatch({ type: 'DRAG_END', cancelled: true });
		store.dispatch({ type: 'ACTIVE_TARGET_CHANGE', targetKey: 'camera:node:pos' });
		expect(store.state).toBe('Selected');
	});

	it('keeps the layout descriptor module renderer-neutral and mutation-free (S7 step 5)', () => {
		const descriptor = readLibSource('editor/gizmo/layout-gizmo-target.ts');
		expect(descriptor).not.toMatch(/from\s+['"](three|svelte|@threlte)['"]/);
		expect(descriptor).not.toContain('$state');
		// The descriptor exports the two S7 seams (S8 consumes the delta).
		expect(descriptor).toContain('export function resolveLayoutGizmoTarget');
		expect(descriptor).toContain('export function deriveLayoutGizmoDelta');
		// No layout preview/history mutation surface is reachable from it —
		// additionally enforced for every gizmo file by the layout-mutation
		// markers test above.
		expect(descriptor).not.toContain('updateLayout');
		expect(descriptor).not.toContain('commitLayoutTransaction');
		expect(descriptor).not.toContain('previewLayoutRoomUnit');
	});

	it('keeps the gizmo host descriptor-free while the composer resolves the live layout adapter (S8 flip)', () => {
		// S8 flips the S7 detached state: the composer's layout-domain branch now
		// resolves the descriptor and builds the live adapter. The host stays
		// constructor- and descriptor-free — it only forwards the input bag.
		expect(readLibSource('editor/EditorTransformControls.svelte')).toContain('layout-gizmo-target');
		expect(readLibSource('editor/gizmo/EditorTransformControlsHost.svelte')).not.toContain(
			'layout-gizmo-target'
		);
	});

	it('publishes the layout gate to the toolbar and shortcuts (stale identity, S8)', () => {
		// editor toolbar accepts the optional transformDisabled gate; the relic
		// mount omits it (no layout domain there). After S8 the gate fires only
		// for a stale/missing layout identity — a live one publishes its policy.
		const toolbar = readLibSource('editor/EditorViewportToolbar.svelte');
		expect(toolbar).toContain('transformDisabled?: boolean');
		expect(toolbar).toContain('transformDisabledFlag');
		expect(readLibSource('editor/app/Workspace3DView.svelte')).toContain(
			"transformDisabled={activeSelection?.active.domain === 'layout' && layoutDescriptor === null}"
		);
		expect(readLibSource('editor/EditorViewport.svelte')).not.toContain('transformDisabled');
		// Shortcuts refuse W/E/R/T/X while a detached layout selection is active.
		const shortcuts = readLibSource('editor/hooks/shortcuts.svelte.ts');
		expect(shortcuts).toContain('isLayoutSelectionActive');
		expect(shortcuts).toContain('if (isLayoutSelectionActive?.()) return;');
	});

	it('drives the toolbar from the generic capability projection, legacy relic fallback intact (S7 step 6)', () => {
		const toolbar = readLibSource('editor/EditorViewportToolbar.svelte');
		// The toolbar consumes the projection, not a hasNavigationTransform
		// special case, and the scale chain is scene-placement-only.
		expect(toolbar).toContain('gizmoCapabilities?: EditorGizmoCapabilities | null');
		expect(toolbar).toContain('caps.allowedModes.has(mode)');
		expect(toolbar).toContain("caps.scaleControl === 'scene-scale-mode'");
		// The relic keeps the legacy camera restriction when no projection is fed.
		expect(toolbar).toContain('hasNavigationTransform');
		expect(toolbar).toContain('toolDisabled');
	});

	it('shares one domain→capability projection between the toolbar and shortcuts (S7 step 6)', () => {
		const ws3d = readLibSource('editor/app/Workspace3DView.svelte');
		const app = readLibSource('editor/app/EditorApp.svelte');
		// Both feed the same pure projection with the same adapter-owned policies.
		for (const source of [ws3d, app]) {
			expect(source).toContain('projectDomainGizmoCapabilities');
			expect(source).toContain('SCENE_GIZMO_POLICY');
			expect(source).toContain('CAMERA_GIZMO_POLICY');
		}
		// The policies are one source shared with the host through the adapters.
		expect(readLibSource('editor/gizmo/scene-gizmo-adapter.svelte.ts')).toContain(
			'export const SCENE_GIZMO_POLICY'
		);
		expect(readLibSource('editor/gizmo/camera-gizmo-adapter.svelte.ts')).toContain(
			'export const CAMERA_GIZMO_POLICY'
		);
	});

	it('refuses unsupported W/E/R/T modes through the same capability policy (S7 step 6)', () => {
		const shortcuts = readLibSource('editor/hooks/shortcuts.svelte.ts');
		expect(shortcuts).toContain('getGizmoCapabilities');
		expect(shortcuts).toContain('caps.allowedModes.has(modeForKey)');
		// Relic camera targets refuse rotate/scale keys, matching the toolbar's
		// existing restriction; the Escape cascade and preview locks are intact.
		expect(shortcuts).toContain("hasNavigationTransform && modeForKey !== 'translate'");
		expect(shortcuts).toContain("if (store.cameraPreview) {");
	});
});

describe('layout candidate session', () => {
	it('keeps $lib/layout/** renderer-neutral; the S8 candidate pipeline is editor-side', () => {
		// The candidate pipeline (deriveLayoutCandidate + per-kind builders)
		// lives under $lib/editor/gizmo, never $lib/layout — which stays
		// Three/Svelte/DOM-free and gizmo-import-free (the S7 gizmo-import
		// assertion is extended here to the full renderer surface).
		for (const source of readAllSourceFiles('layout').map((entry) => entry.source)) {
			expect(source).not.toMatch(/from\s+['"](three|svelte|@threlte|\$app)['"]/);
			expect(source).not.toContain('editor/gizmo');
			expect(source).not.toContain('deriveLayoutCandidate');
		}
	});

	it('resolves a live layout adapter for a non-null descriptor and null for a stale/missing one; the relic never receives it', () => {
		const composer = readLibSource('editor/EditorTransformControls.svelte');
		// The S3 layout-domain branch resolves the descriptor and builds the
		// live adapter; a stale/missing identity resolves no adapter.
		expect(composer).toContain("active.domain === 'layout'");
		expect(composer).toContain('createLayoutGizmoAdapter');
		expect(composer).toContain('resolveLayoutGizmoTarget');
		expect(composer).toContain('if (!descriptor) return null;');
		// The composer stays constructor-free; the shared proxy is adapter-module-owned.
		expect(composer).not.toContain('new ThreeTransformControls');
		// The relic mount passes no active-selection/layout inputs, so the
		// layout branch is unreachable there.
		expect(readLibSource('editor/EditorViewport.svelte')).not.toContain('activeSelection=');
	});

	it('publishes the descriptor policy through a nullable layout slot; a stale identity stays disabled (explicit gate, not caps === null)', () => {
		const policy = readLibSource('editor/gizmo/editor-gizmo-policy.ts');
		expect(policy).toContain('layout: EditorGizmoPolicy | null');
		// Both editor call sites resolve the active selection's descriptor and pass
		// its per-kind policy (null for a stale/missing identity).
		for (const source of [
			readLibSource('editor/app/Workspace3DView.svelte'),
			readLibSource('editor/app/EditorApp.svelte')
		]) {
			expect(source).toContain('resolveLayoutGizmoTarget');
			expect(source).toContain('layout: layoutDescriptor?.policy ?? null');
		}
		// The toolbar gate is explicit (layout domain AND descriptor null), not
		// caps === null — a live layout publishes its policy.
		expect(readLibSource('editor/app/Workspace3DView.svelte')).toContain(
			"transformDisabled={activeSelection?.active.domain === 'layout' && layoutDescriptor === null}"
		);
		// Shortcuts refuse only a stale layout identity outright; a live one
		// falls through to the per-mode caps refusal.
		expect(readLibSource('editor/app/EditorApp.svelte')).toContain(
			"activeSelection.active.domain === 'layout' && layoutDescriptor === null"
		);
	});

	it('accepts the optional transient prop and feeds it from the adapter onTransient slot threaded through the composer', () => {
		const scene = readLibSource('editor/layout/LayoutPreviewScene.svelte');
		expect(scene).toContain('transient?: LayoutGizmoCandidateBundle | null');
		expect(scene).toContain('transient?.geometry ?? geometry');
		const ws3d = readLibSource('editor/app/Workspace3DView.svelte');
		expect(ws3d).toContain('transient={layoutTransient}');
		expect(ws3d).toContain('onLayoutTransient={(bundle) => (layoutTransient = bundle)}');
		// The composer forwards the editor slot setter into the adapter.
		expect(readLibSource('editor/EditorTransformControls.svelte')).toContain('onTransient: onLayoutTransient');
	});

	it('deriveLayoutCandidate returns { bundle | null, issue | null } and the adapter input includes isShiftHeld', () => {
		const candidate = readLibSource('editor/gizmo/layout-gizmo-candidate.ts');
		expect(candidate).toContain('export function deriveLayoutCandidate');
		expect(candidate).toContain('{ bundle: LayoutGizmoCandidateBundle | null; issue: string | null }');
		// The pure pipeline never throws — failures map to { bundle: null, issue }.
		expect(candidate).not.toContain('throw new Error');
		const adapter = readLibSource('editor/gizmo/layout-gizmo-adapter.svelte.ts');
		expect(adapter).toContain('isShiftHeld(): boolean');
		expect(adapter).toContain('beginLayoutTransaction');
	});
});

describe('camera context contracts', () => {
	it('threads the explicit context seam through the editor shell; the relic keeps its absent-prop fallback', () => {
		const app = readLibSource('editor/app/EditorApp.svelte');
		const ws3d = readLibSource('editor/app/Workspace3DView.svelte');
		const toolbar = readLibSource('editor/EditorViewportToolbar.svelte');
		const viewport = readLibSource('editor/EditorViewport.svelte');

		// P1.1 — the editor derives the 3D context from the domain axis and passes
		// it down; the toolbar split is context-prop-driven.
		expect(app).toContain('context={viewState.domain}');
		expect(ws3d).toMatch(/context: 'scene' \| 'camera'/);
		expect(toolbar).toMatch(/context\?: 'scene' \| 'camera'/);
		// The editor-only camera-agnostic escape hatch is removed.
		expect(ws3d).not.toContain('cameraAgnosticViewMenu');
		expect(toolbar).not.toContain('cameraAgnosticViewMenu');
		// The relic mount passes no context and keeps the legacy camera-only
		// View menu via currentWorkspace.
		expect(viewport).not.toContain('context=');
		expect(toolbar).toContain("context === undefined && store.currentWorkspace === 'camera'");
	});

	it('splits the View-menu rows: Scene exposes Ceiling only, Camera exposes the three camera-helper rows', () => {
		const toolbar = readLibSource('editor/EditorViewportToolbar.svelte');

		// The camera-helper rows are gated behind the camera branch; the Ceiling
		// row is gated behind the scene branch.
		expect(toolbar).toContain('showCameraHelperRows');
		expect(toolbar).toContain("context === 'camera'");
		expect(toolbar).toContain('showCeilingRow');
		expect(toolbar).toContain("context === 'scene' && onToggleCeilings !== undefined");
		// Row markers stay distinct: helper rows inside the camera branch, Ceiling
		// inside the scene branch (slice from the template usage, not the script
		// deriveds, so the rows themselves are what is asserted).
		const cameraBranch = toolbar.slice(
			toolbar.indexOf('{#if showCameraHelperRows}'),
			toolbar.indexOf('{#if showCeilingRow}')
		);
		expect(cameraBranch).toContain('Node handles');
		expect(cameraBranch).toContain('Tour paths');
		expect(cameraBranch).toContain('Framing &amp; FOV');
		expect(cameraBranch).not.toContain('Ceiling');
		const sceneBranch = toolbar.slice(toolbar.indexOf('showCeilingRow'));
		expect(sceneBranch).toContain('Ceiling');
	});

	it('mounts the camera timeline bottom frame for the Camera domain in both views, never Scene', () => {
		const app = readLibSource('editor/app/EditorApp.svelte');
		const frame = readLibSource('editor/EditorCameraTimelineFrame.svelte');
		expect(app).toContain("viewState.domain === 'camera'");
		// The frame keeps its full-width bottom-strip contract; only its mount
		// point is Camera-domain gated.
		expect(frame).toContain('grid-area: bottom');
	});

	it('keeps both Camera cells on the camera workspace so timeline state persists across views (G3)', () => {
		const app = readLibSource('editor/app/EditorApp.svelte');
		// G3 — `store.setWorkspace` collapses the timeline, stops previews, and
		// cancels pending navigation when leaving 'camera'; mapping both Camera
		// cells to the camera workspace means Camera 3D ↔ Plan toggles never
		// trigger those side effects (timeline expanded state persists).
		expect(app).toContain("if (viewState.domain === 'camera')");
		expect(app).toContain("store.setWorkspace('camera')");
	});

	it('mounts the live Camera Plan workspace in the Camera → Plan cell (P1.5, placeholder gone)', () => {
		const app = readLibSource('editor/app/EditorApp.svelte');
		// The center-cell matrix mounts the live authoring surface only for
		// Camera → Plan; Scene → Plan stays PlanWorkspace.
		expect(app).toContain('<CameraPlanWorkspace');
		expect(app).toContain("viewState.activeView === 'plan' && viewState.domain === 'scene'");
		expect(
			fs.existsSync(path.join(LIB_DIR, 'editor/app/CameraPlanPlaceholder.svelte'))
		).toBe(false);
	});

	it('mounts a persistent status bar region in every workspace with no authoring actions', () => {
		const app = readLibSource('editor/app/EditorApp.svelte');
		const status = readLibSource('editor/app/StatusBar.svelte');
		// The status bar is an unconditional shell region (design-spec §2/§18),
		// present in all four workspaces.
		expect(app).toContain('<StatusBar');
		expect(app).toContain("'status status status'");
		expect(status).toContain('grid-area: status');
		expect(app).toContain('{layoutPreview} {layoutInteraction} {viewState} {activeSelection}');
		expect(status).toContain('store.isDirty || layoutPreviewIsDirty(layoutPreview)');
		expect(status).toContain('layoutInteraction.planView.gridEnabled');
		expect(status).toContain('layoutInteraction.planView.snapEnabled');
		// Informational/supporting only — major authoring actions must not
		// migrate into it.
		expect(status).not.toContain('beginCameraPlacement');
		expect(status).not.toContain('connectNavigationNodes');
		expect(status).not.toContain('deleteConnection');
		expect(status).not.toContain('setLayoutDraftTool');
		expect(status).not.toContain('store.undo');
	});

	it('keeps Scene-only sidebar controls out of the Camera domain and mounts no empty camera rail', () => {
		const app = readLibSource('editor/app/EditorApp.svelte');
		const sidebar = readLibSource('editor/app/EditorSidebar.svelte');
		expect(sidebar).toContain("domain === 'scene' && in3d");
		expect(sidebar).toContain("onAddRoom={domain === 'scene' ? startRoomDraft : undefined}");
		expect(sidebar).toContain('{#if showScenePanelTabs}');
		expect(app).not.toContain('CameraDomainRail');
	});

	it('gates camera authoring overlays to Camera while keeping the rig always mounted', () => {
		const ws3d = readLibSource('editor/app/Workspace3DView.svelte');

		// EditorCameraRig stays mounted in both contexts (shared viewport infra).
		expect(ws3d).toContain('<EditorCameraRig');
		// Overlay groups are camera-context gated.
		expect(ws3d).toContain('isCameraContext && store.viewportShowPaths');
		expect(ws3d).toContain('isCameraContext && store.viewportShowFraming');
		// The node-handle group preserves the connect-flow force-mount override.
		expect(ws3d).toContain(
			'isCameraContext && (store.viewportShowNodes || store.forceMountCameraNodeHandles)'
		);
	});

	it('keeps the camera inspector selection-domain-driven, never context-driven', () => {
		const inspector = readLibSource('editor/EditorInspector.svelte');
		// The panel follows the active selection domain (a preserved camera
		// selection stays inspectable in Scene); context never hides it.
		expect(inspector).toContain('activeSelection.active.domain');
		expect(inspector).toContain('selectedNavigation');
		expect(inspector).not.toContain('active3dContext');
	});

	it('keeps Plan free of camera mutation surfaces and the relic route frozen', () => {
		const planView = readLibSource('editor/app/PlanWorkspace.svelte');
		const relicRoute = readRouteSource('museum/editor/+page.svelte');
		expect(planView).not.toContain('connectNavigationNodes');
		expect(planView).not.toContain('closeGuidedTourLoop');
		expect(planView).not.toContain('beginCameraPlacement');
		expect(relicRoute).not.toContain('EditorApp');
	});

	// S10.1.3 — Camera toolbar: `Select | Move | Rotate | Add camera | View`.
	it('composes the Camera toolbar with Rotate + Add camera and unmounts Scale', () => {
		const toolbar = readLibSource('editor/EditorViewportToolbar.svelte');
		// Select | Move | Rotate | Scale are icon + label transform tools.
		expect(toolbar).toContain('<MousePointer2 size={14}');
		expect(toolbar).toContain('<Move size={14}');
		expect(toolbar).toContain('<Rotate3d size={14}');
		expect(toolbar).toContain('<Scaling size={14}');
		expect(toolbar).toContain('Select');
		expect(toolbar).toContain('Rotate');
		// Scale and the scale-chain toggle unmount in the Camera context.
		expect(toolbar).toContain('{#if showScaleTool}');
		expect(toolbar).toContain('const showScaleTool = $derived(!isCameraContext)');
		// Add camera lives in the Camera toolbar (relocated from the app bar).
		expect(toolbar).toContain('isCameraContext');
		expect(toolbar).toContain('Add camera');
		expect(toolbar).toContain('<Video size={14}');
		expect(toolbar).toContain('store.beginCameraPlacement()');
	});

	it('removed the relocated Place-camera action from the app bar', () => {
		const appBar = readLibSource('editor/app/EditorAppBar.svelte');
		expect(appBar).not.toContain('beginCameraPlacement');
		expect(appBar).not.toContain('Place camera');
	});

	// S10.1 closeout — view-breakpoint Aim control (inspector yaw/pitch).
	it('exposes the inspector Aim control and routes it through the shared aim mutator', () => {
		const inspector = readLibSource('editor/EditorCameraInspector.svelte');
		expect(inspector).toContain('Aim look target');
		expect(inspector).toContain('Yaw Δ (°)');
		expect(inspector).toContain('Pitch Δ (°)');
		expect(inspector).toContain('Apply Aim');
		expect(inspector).toContain('store.commitSelectedViewKeyframeAim(');
	});

	// S10.1.3 — Sequence Inspector: derived loop row, detour groups, unused tray.
	it('renders the Sequence Inspector loop row as a derived readout, never a Close-loop mutation', () => {
		const panel = readLibSource('editor/CameraFlowPanel.svelte');
		expect(panel).toContain('Loops via:');
		expect(panel).toContain('Disconnect Loop');
		expect(panel).toContain('Stops at');
		expect(panel).toContain('+ Connect to');
		// The loop row only renders for N ≥ 3 (a two-node pair never loops and
		// never shows a loop row).
		expect(panel).toContain('showLoopRow = $derived(guidedTourChain.length >= 3)');
		// [Disconnect Loop] is a plain connection deletion; connecting is the
		// ordinary connect-existing flow. No Close-loop mutation anywhere.
		expect(panel).toContain('store.deleteConnection(flowLoopConnectionId)');
		expect(panel).toContain('store.beginConnectExistingNodes()');
		expect(panel).not.toContain('closeGuidedTourLoop');
		expect(panel).not.toContain('findClosableGuidedChain');
	});

	it('renders the detour groups and the Unused Connections tray in the Sequence Inspector', () => {
		const panel = readLibSource('editor/CameraFlowPanel.svelte');
		expect(panel).toContain('store.flowDetourGroups');
		expect(panel).toContain('store.flowLoopConnectionId');
		expect(panel).toContain('Detour at');
		expect(panel).toContain('store.removeDetour(');
		expect(panel).toContain('store.removeDetourNode(');
		expect(panel).toContain('Not in order yet');
		expect(panel).toContain('Connections / Advanced');
		expect(panel).toContain('store.appendDetourNode(');
	});

	// S10.1.4 — timeline derived-loop readout (replaces the dead-end message).
	it('shows the derived loop readout in the timeline panel with no Close-loop language', () => {
		const panel = readLibSource('editor/EditorCameraTimelinePanel.svelte');
		expect(panel).toContain('Loops via:');
		expect(panel).toContain('Stops at');
		expect(panel).toContain('store.flowLoopConnectionId');
		expect(panel).toContain('showLoopRow = $derived(chain.length >= 3)');
		// The stale guided-cycle repair message is gone; the empty state names
		// the actual gap (no flow, or a missing transition).
		expect(panel).not.toContain('Guided timeline unavailable');
		expect(panel).not.toContain('Repair the guided camera cycle');
		expect(panel).toContain('No camera flow yet');
		expect(panel).not.toContain('closeGuidedTourLoop');
	});

	// S10.1.7 — grid opacity/visibility control + XYZ orientation gizmo.
	it('mounts the bottom-right grid controls and the corner orientation gizmo in the 3D shell', () => {
		const ws3d = readLibSource('editor/app/Workspace3DView.svelte');
		const gridControls = readLibSource('editor/EditorViewportGridControls.svelte');
		const overlay = readLibSource('editor/EditorOrientationGizmoOverlay.svelte');
		expect(ws3d).toContain('<EditorViewportGridControls {store} />');
		expect(ws3d).toContain('<EditorOrientationGizmo />');
		expect(ws3d).toContain('<EditorOrientationGizmoOverlay />');
		// The grid control reuses session state (visibility + new opacity).
		expect(gridControls).toContain('store.toggleGrid()');
		expect(gridControls).toContain('store.gridOpacity = value');
		expect(gridControls).toContain('type="range"');
		// The orientation gizmo is a non-interactive indicator: it never
		// intercepts pointer events and is excluded from raycasting.
		expect(overlay).toContain('pointer-events: none');
		expect(overlay).toContain('aria-hidden="true"');
	});

	// S10.1.6 — workspace transition polish: canvas never remounts; fades are
	// CSS-only and disabled under prefers-reduced-motion.
	it('animates workspace switches with CSS fades and honors reduced motion', () => {
		const ws3d = readLibSource('editor/app/Workspace3DView.svelte');
		const planView = readLibSource('editor/app/PlanWorkspace.svelte');
		expect(ws3d).toContain('@keyframes view-fade-in');
		expect(ws3d).toContain('prefers-reduced-motion');
		expect(planView).toContain('@keyframes plan-fade-in');
		expect(planView).toContain('prefers-reduced-motion');
	});

	// S10.1 — Rooms hierarchy tree: per-row visibility + kebab actions + add.
	it('adds per-row visibility and kebab actions to the Rooms tree, plus a Rooms add button', () => {
		const tree = readLibSource('editor/UnifiedProjectTree.svelte');
		expect(tree).toContain('EllipsisVertical');
		expect(tree).toContain('<Eye size={14}');
		expect(tree).toContain('<EyeOff size={14}');
		expect(tree).toContain('<Plus size={14}');
		expect(tree).toContain('onAddRoom');
		expect(tree).toContain('store.toggleEntityVisibility(');
		expect(tree).toContain('store.focusRoom(');
		expect(tree).toContain('store.focusPlacement(');
		expect(tree).toContain('store.deletePlacements(');
		expect(tree).toContain('deleteLayoutRoom(');
		expect(tree).toContain('deleteLayoutObject(');
		expect(tree).toContain('deleteLayoutOpening(');
	});

	it('exposes session-only entity visibility through the store facade', () => {
		const facade = readLibSource('editor/museum-editor.svelte.ts');
		expect(facade).toContain('get hiddenEntityIds()');
		expect(facade).toContain('toggleEntityVisibility(');
	});
});

describe('cross-domain selection contracts', () => {
	it('forwards onSelectionActivate from the store options into the reducer', () => {
		let fired = 0;
		const store = createMuseumEditorStore({
			document: cloneFixtureDocument(),
			onSelectionActivate: () => {
				fired += 1;
			}
		});
		const entityId = store.document.entities[0]!.id;

		// Room-only latent context never fires the hook.
		expect(store.selectionActions.selectRoom(store.document.entities[0]!.roomId)).toBe(true);
		expect(fired).toBe(0);

		// An actionable placement pick fires it.
		expect(store.selectionActions.selectPlacement(entityId)).toBe(true);
		expect(fired).toBe(1);
	});

	it('preserves the active domain across view switches (pure mapping over untouched slots)', () => {
		const store = createMuseumEditorStore({ document: cloneFixtureDocument() });
		const entityId = store.document.entities[0]!.id;
		expect(store.selectionActions.selectPlacement(entityId)).toBe(true);

		// Synthetic fixture: the wrapper derives the active domain from the
		// untouched workspace/nav slots plus the (shell-owned) layout selection,
		// so a Plan↔3D switch cannot change it.
		const layoutSelection: LayoutSelection = { kind: 'room', roomId: 'paris' };
		const before = deriveActiveSelection(
			'scene',
			store.selection.workspace,
			store.selection.navigation,
			layoutSelection
		);

		expect(store.setWorkspace('layout')).toBe(true);
		expect(store.setWorkspace('camera')).toBe(true);
		expect(store.setWorkspace('scene')).toBe(true);

		const after = deriveActiveSelection(
			'scene',
			store.selection.workspace,
			store.selection.navigation,
			layoutSelection
		);
		expect(after).toEqual(before);
	});

	it('importDocument clears the scene selection slots; import begins with no active selection', () => {
		const store = createMuseumEditorStore({ document: cloneFixtureDocument() });
		const entityId = store.document.entities[0]!.id;
		expect(store.selectionActions.selectPlacement(entityId)).toBe(true);
		expect(
			store.selectionActions.selectNavigationNode(store.document.navigationNodes[0]!.id)
		).toBe(true);

		expect(store.importDocument(createEmptySceneDocument())).toBe(true);
		expect(store.selectedPlacementIds).toEqual([]);
		expect(store.selectedRoomId).toBeNull();
		expect(store.navigationSelection).toBeNull();
		expect(store.canUndo).toBe(false);
	});
});

describe('asset library selection contracts', () => {
	it('an explicit Models-tab click deselects the active selection so the asset panel shows; filters never do', () => {
		const library = readLibSource('editor/EditorAssetLibrary.svelte');
		const sidebar = readLibSource('editor/app/EditorSidebar.svelte');
		const app = readLibSource('editor/app/EditorApp.svelte');
		// The explicit-click channel is distinct from `onselectionchange` (which
		// also fires on filter-driven list changes and must never deselect a
		// scene pick).
		expect(library).toContain('onSelectAsset');
		expect(library).toContain('onSelectAsset?.(asset)');
		expect(library).toContain('onselectionchange');
		expect(sidebar).toContain('onSelectAsset');
		expect(app).toContain('onSelectAsset');
		expect(app).toContain('activeSelection.deselectActive()');
		// The relic keeps frozen behavior: no deselect-on-asset-click wiring.
		expect(readLibSource('editor/EditorLeftSidebar.svelte')).not.toContain('onSelectAsset');
	});
});

describe('P1.5 Camera Plan source contracts', () => {
	it('EditorApp mounts the live Camera Plan workspace, never a placeholder', () => {
		const editorApp = readLibSource('editor/app/EditorApp.svelte');
		expect(editorApp).toContain('CameraPlanWorkspace');
		expect(editorApp).toContain('createCameraPlanState');
		// P1.5 reactivity pin: the session state must be deep-proxied via
		// `$state`, or the viewport's pan/zoom/hover/tool mutations are
		// invisible and the surface renders frozen (no pan/zoom, stale
		// framing, ghost misalignment after resize).
		expect(editorApp).toContain('$state(createCameraPlanState())');
		expect(editorApp).not.toContain('CameraPlanPlaceholder');
		expect(
			fs.existsSync(path.join(LIB_DIR, 'editor/app/CameraPlanPlaceholder.svelte'))
		).toBe(false);
	});

	it('Camera Plan helpers carry no layout-selection mutation path', () => {
		for (const { name, source } of readAllSourceFiles('editor/camera-plan')) {
			expect(source, `${name} contains no selectLayout*`).not.toContain('selectLayout');
			expect(source, `${name} contains no clearLayoutSelection`).not.toContain('clearLayoutSelection');
			expect(source, `${name} never touches layoutInteraction`).not.toContain('layoutInteraction');
		}
		const projection = readLibSource('editor/layout/plan-camera-projection.ts');
		expect(projection).toContain('buildPlanCameraAuthoringProjection');
		expect(projection).toContain('resolvePlanSceneGraphFromDocument');
		expect(projection).not.toContain('selectLayout');
		expect(projection).not.toContain('clearLayoutSelection');
	});

	it('keeps Camera Plan editor-only: /museum routes import no camera-plan code', () => {
		const museum = readRouteSource('museum/+page.svelte');
		expect(museum).not.toContain('camera-plan');
		expect(museum).not.toContain('CameraPlan');
		expect(museum).not.toContain('plan-camera-projection');
	});

	it('the shared Camera Delete/Backspace branch routes anchors through deleteSelectedAnchor', () => {
		const shortcuts = readLibSource('editor/hooks/shortcuts.svelte.ts');
		expect(shortcuts).toContain("selection?.kind === 'anchor'");
		expect(shortcuts).toContain('store.deleteSelectedAnchor()');
	});

	it('EditorInspector routes Camera → Plan to the Plan inspector and keeps Scene Plan read-only', () => {
		const inspector = readLibSource('editor/EditorInspector.svelte');
		expect(inspector).toContain('CameraPlanInspector');
		expect(inspector).toContain("const isCameraPlan = $derived(viewMode === 'plan' && domain === 'camera')");
		expect(inspector).toContain("const readOnly = $derived(viewMode !== '3d' && !isCameraPlan)");
	});
});
