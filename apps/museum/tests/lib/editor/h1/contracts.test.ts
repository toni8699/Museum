import { describe, expect, expectTypeOf, it } from 'vitest';

import { museumSceneDocument } from '$lib/content/chopin-project';
import { createEmptySceneDocument, resolveSceneDocument } from '$lib/content/scene';
import { createMuseumEditorStore } from '$lib/editor/museum-editor.svelte';
import {
	EditorDocumentStore,
	pickInitialNavigationNodeId
} from '$lib/editor/store/document-store.svelte';
import { EditorInteractionStore } from '$lib/editor/store/editor-interaction-store.svelte';
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
import { deriveActiveSelection } from '$lib/editor/h1/active-editor-selection.svelte';
import type { LayoutSelection } from '$lib/editor/layout/layout-interaction';
import { cloneFixtureDocument } from '../../content/__fixtures__/load-fixture-scene';
import { museumEditorEntryPlugin } from '../../../../vite/museum-editor-entry-plugin';

const ROUTES_DIR = fileURLToPath(new URL('../../../../src/routes', import.meta.url));
const LIB_DIR = fileURLToPath(new URL('../../../../src/lib', import.meta.url));

function readRouteSource(routePath: string): string {
	return fs.readFileSync(path.join(ROUTES_DIR, routePath), 'utf8');
}

function readLibSource(relativePath: string): string {
	return fs.readFileSync(path.join(LIB_DIR, relativePath), 'utf8');
}

describe('H1 S0 — empty project contract', () => {
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

describe('H1 S2 — boot into an empty project', () => {
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

	it('authors the first camera node standalone, then unlocks preview once a second node forms a guided chain', () => {
		const fixture = cloneFixtureDocument();
		fixture.navigationNodes = [];
		fixture.connections = [];
		const store = createMuseumEditorStore({ document: fixture });

		const roomId = store.rooms.entries[0]!.id;
		const floorWorld = store.rooms.point(roomId, [0, 0, 0]);

		// First node on a blank graph commits standalone (no destination).
		expect(store.beginCameraPlacement()).toBe(true);
		const firstNodeId = store.createPendingNavigationNodeAt(roomId, floorWorld, [0, 0, -1]);

		expect(firstNodeId).not.toBeNull();
		expect(store.document.navigationNodes).toHaveLength(1);
		expect(store.document.connections).toHaveLength(0);
		expect(store.pendingNavigationCommand).toBeNull();
		expect(store.canStartTourPreview).toBe(false); // lone node, no guided chain

		// Second node connects to the first, but a connection alone is not a
		// guided chain.
		expect(store.beginCameraPlacement()).toBe(true);
		const secondNodeId = store.createPendingNavigationNodeAt(
			roomId,
			store.rooms.point(roomId, [1, 0, 1]),
			[0, 0, -1]
		);
		expect(secondNodeId).not.toBeNull();
		expect(store.document.navigationNodes).toHaveLength(1); // still pending
		expect(store.connectPendingNavigationNode(firstNodeId!)).toBe(true);
		expect(store.document.navigationNodes).toHaveLength(2);
		expect(store.document.connections).toHaveLength(1);
		expect(store.canStartTourPreview).toBe(false); // connected but not guided

		// Ordering the two nodes into a reciprocal cycle forms the guided chain.
		expect(store.setGuidedTourOrder([firstNodeId!, secondNodeId!])).toBe(true);
		expect(store.canStartTourPreview).toBe(true);
	});
});

// The S1/S2 playback-lock contract (view switching rejected during camera
// playback) is already pinned by museum-editor-shell.test.ts — "rejects
// workspace switches during interaction or modal preview" — so it is not
// re-pinned here.

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

	it('restores the layout ceiling toggle into the H1 3D View menu (camera-agnostic), relic untouched', () => {
		const toolbar = readLibSource('editor/EditorViewportToolbar.svelte');
		const h13d = readLibSource('editor/h1/H13DView.svelte');
		const viewport = readLibSource('editor/EditorViewport.svelte');

		// The shared toolbar gains a Ceiling menuitem only when fed by the H1
		// shell, and its View menu surfaces in both 3D contexts via the
		// H1-only cameraAgnosticViewMenu prop.
		expect(toolbar).toContain('onToggleCeilings');
		expect(toolbar).toContain('cameraAgnosticViewMenu');
		expect(toolbar).toMatch(/role="menuitemcheckbox"[^]*?<span>Ceiling<\/span>/);
		expect(h13d).toContain('cameraAgnosticViewMenu');
		expect(h13d).toContain('onToggleCeilings={');
		expect(h13d).toContain('toggleLayoutCeilings');
		// The relic mount feeds neither prop, keeping its LayoutDraftToolbar
		// Ceiling button as the single surface there.
		expect(viewport).not.toContain('onToggleCeilings');
		expect(viewport).not.toContain('cameraAgnosticViewMenu');
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

describe('H1 S4 — unified hierarchy contracts', () => {
	it('mounts the H1 sidebar + unified tree in the H1 shell, never in the relic', () => {
		// H1 shell imports the new sidebar (and the unified tree through it).
		const h1App = readLibSource('editor/h1/H1EditorApp.svelte');
		expect(h1App).toContain('H1Sidebar');
		expect(h1App).not.toContain('EditorLeftSidebar');

		// Relic: the route source imports only virtual:museum-editor-entry, and
		// the entry plugin's load() output is just a re-export, so assert on the
		// resolved module's file source (MuseumEditorApp.svelte) + the legacy
		// components themselves.
		const relicApp = readLibSource('editor/MuseumEditorApp.svelte');
		expect(relicApp).toContain('EditorLeftSidebar');
		expect(relicApp).not.toContain('H1Sidebar');
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
			expect(readLibSource(component)).not.toContain('H1Sidebar');
		}
	});

	it('keeps the camera tree internals reusable behind optional props (relic default behavior)', () => {
		const guided = readLibSource('editor/GuidedTourPanel.svelte');
		const connections = readLibSource('editor/NodeConnectionsPanel.svelte');
		const keyframes = readLibSource('editor/DirectionalKeyframeList.svelte');
		// The optional H1 S4 gate props default to true when absent.
		expect(guided).toMatch(/interactive\??:/);
		expect(connections).toMatch(/interactive\??:/);
		expect(keyframes).toMatch(/interactive\??:/);
	});

	it('gates every guided/free node-row pick in GuidedTourPanel behind interactive (Plan gate)', () => {
		// The Plan gate is behavioral, not just prop presence: the node-row
		// select click (and the connections chevron) must be no-ops when
		// interactive is false, exactly like the connection/direction rows — a
		// plain `onclick={() => selectNode(node.id)}` would leak the camera
		// domain into Plan (the plan's locked "scene/camera rows aria-disabled
		// no-ops" decision).
		const guided = readLibSource('editor/GuidedTourPanel.svelte');
		// Row select is gated and carries aria-disabled on both guided + free
		// rows (the two byte-identical row blocks share one handler shape).
		expect(guided).not.toContain('onclick={() => selectNode(node.id)}');
		expect(guided.match(/onclick=\{interactive \? \(\) => selectNode\(node\.id\) : undefined\}/g)).toHaveLength(2);
		expect(guided.match(/onclick=\{interactive \? \(\) => toggleNodeConnections\(node\.id\) : undefined\}/g)).toHaveLength(2);
		// aria-disabled appears on every gated surface: guided li + chevron +
		// row, free li + chevron + row.
		expect(guided.match(/aria-disabled=\{interactive \? undefined : true\}/g)).toHaveLength(6);
	});

	it('keeps the unified tree mounted across Hierarchy|Assets tabs and hides the boot header correctly', () => {
		const sidebar = readLibSource('editor/h1/H1Sidebar.svelte');
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
		const guided = readLibSource('editor/GuidedTourPanel.svelte');
		const tree = readLibSource('editor/UnifiedProjectTree.svelte');
		// The panel accepts the S3 active domain and highlights the discovery
		// direction row when domain is camera-or-none (scrubbing sets discovery
		// with no navigation selection); layout/scene never co-highlights.
		expect(connections).toMatch(/activeDomain\??:/);
		expect(connections).toContain("activeDomain === 'camera' || activeDomain === 'none'");
		// GuidedTourPanel forwards the domain to every embedded panel, and the
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

describe('H1 S5 — layout 3D pick metadata', () => {
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
		const h13d = readLibSource('editor/h1/H13DView.svelte');
		const picking = readLibSource('editor/layout/layout-3d-picking.ts');
		// The gate is pure + exported (unit-tested) and the coordinator falls
		// through to the normal dispatch for deferred resolutions; the wall/anchor
		// commit cases are gone from the shell.
		expect(picking).toContain('export function isLayoutDirectPickDeferred');
		expect(h13d).toContain('isLayoutDirectPickDeferred(resolved.selection)');
		expect(h13d).not.toContain('selectLayoutWall');
		expect(h13d).not.toContain('selectLayoutInteriorAnchor');
	});

	it('disconnects the highlight feed: no showAnchors/hoverSelection/onLayoutHover passes remain', () => {
		const scene = readLibSource('editor/layout/LayoutPreviewScene.svelte');
		const h13d = readLibSource('editor/h1/H13DView.svelte');
		// The S6 click coordinator still owns its optional props (onLayoutPick /
		// onLayoutHover — the contract), but the H1 shell no longer feeds any of
		// the disconnected surfaces, so EditorSelection's hover guard makes the
		// whole hover resolution a no-op.
		expect(h13d).not.toContain('showAnchors');
		expect(h13d).not.toContain('hoverSelection');
		// Assert the wiring shape, not the bare identifier: the KNOWN DEBT
		// comment in H13DView legitimately mentions the prop name.
		expect(h13d).not.toContain('onLayoutHover={');
		expect(h13d).toContain('onLayoutPick={store.isVisitorCameraPreview ? undefined : handleLayoutPick}');
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

describe('H1 S6 — centralized 3D layout selection', () => {
	it('extends the single coordinator with an optional onLayoutPick prop, absent on the relic', () => {
		const selection = readLibSource('editor/EditorSelection.svelte');
		expect(selection).toContain('onLayoutPick?:');
		expect(selection).toContain('competingSceneDistance: number | null');
		expect(selection).toContain('layoutCandidatesFromIntersections');

		const viewport = readLibSource('editor/EditorViewport.svelte');
		expect(viewport).toContain('<EditorSelection {store} {transformControls} />');
		expect(viewport).not.toContain('onLayoutPick');
	});

	it('wires the H1 shell behind a visitor-preview gate', () => {
		const h13d = readLibSource('editor/h1/H13DView.svelte');
		expect(h13d).toContain('onLayoutPick={store.isVisitorCameraPreview ? undefined : handleLayoutPick}');
		expect(h13d).toContain('resolveLayout3dHits');
		expect(h13d).toContain('layoutPickBeatsSceneDistance');
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

describe('H1 S7 — single gizmo host', () => {
	/**
	 * Document mutations the host/adapters/descriptors must never call
	 * directly (scene/camera mutators + the layout preview/history surface
	 * S8 owns). Add tokens as adapters land; the walk covers every file
	 * under `$lib/editor/gizmo`, present or future.
	 */
	const GIZMO_MUTATION_MARKERS = [
		'updatePlacementTransform',
		'beginDocumentTransaction',
		'commitDocumentTransaction',
		'cancelDocumentTransaction',
		'updateNavigationNodePoint',
		'updateConnectionAnchorWorldPoint',
		'updateSelectedViewKeyframeTargetWorldPoint',
		'updateLayout',
		'previewLayoutRoomUnit',
		'restoreLayoutPreviewSnapshot',
		'commitLayoutTransaction',
		'cancelLayoutTransaction'
	];

	function readAllSourceFiles(relativeDir: string): string[] {
		const root = path.join(LIB_DIR, relativeDir);
		const sources: string[] = [];
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
				sources.push(fs.readFileSync(entry, 'utf8'));
			}
		}
		return sources;
	}

	it('keeps exactly one live TransformControls constructor in editor source', () => {
		const constructions = readAllSourceFiles('editor').reduce(
			(count, source) =>
				count + (source.match(/new ThreeTransformControls\(/g)?.length ?? 0),
			0
		);
		expect(constructions).toBe(1);
		// Until S7 step 2 relocates it, the sole constructor lives in the
		// monolith composer — extraction must relocate, never duplicate.
		expect(
			readLibSource('editor/EditorTransformControls.svelte').match(/new ThreeTransformControls\(/g)
		).toHaveLength(1);
	});

	it('mounts the shared composer exactly once from H13DView and the relic viewport; neither constructs controls or helpers', () => {
		for (const [relativePath, label] of [
			['editor/h1/H13DView.svelte', 'H13DView'],
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

	it('keeps every gizmo module free of direct document/layout/history mutation calls', () => {
		for (const source of readAllSourceFiles('editor/gizmo')) {
			for (const marker of GIZMO_MUTATION_MARKERS) {
				expect(source, marker).not.toContain(marker);
			}
		}
	});

	it('keeps the policy helper renderer-neutral (no Three/Svelte/runes)', () => {
		const policy = readLibSource('editor/gizmo/editor-gizmo-policy.ts');
		expect(policy).not.toMatch(/from\s+['"](three|svelte|@threlte)['"]/);
		expect(policy).not.toContain('$state');
	});

	it('keeps layout, G4 render, camera route/motion, and visitor sources free of gizmo imports', () => {
		for (const source of [
			...readAllSourceFiles('layout'),
			...readAllSourceFiles('render'),
			...readAllSourceFiles('museum')
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

	// Fixtures that need the S7 host/adapter seams, enabled as each lands.
	it.todo('relocates the sole constructor into EditorTransformControlsHost.svelte (S7 step 2)');
	it.todo('host contains no scene/camera/layout document-mutator calls (S7 step 2)');
	it.todo('scene/camera adapters construct no TransformControls and register no window listeners (S7 steps 3/4)');
	it.todo('H1 composer resolves from the S3 active domain; relic omits it and all layout adapter input (S7 steps 2/3)');
	it.todo('layout descriptor module calls no layout preview/history mutation and the host never receives a live layout adapter (S7 step 5)');
	it.todo('fake-host lifecycle: orbit true/false restore exactly once, target switch/unmount cancels once, late mouseUp suppression (S7 step 2 harness)');
});

describe('H1 S3 — cross-domain selection contracts', () => {
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
			store.selection.workspace,
			store.selection.navigation,
			layoutSelection
		);

		expect(store.setWorkspace('layout')).toBe(true);
		expect(store.setWorkspace('camera')).toBe(true);
		expect(store.setWorkspace('scene')).toBe(true);

		const after = deriveActiveSelection(
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
