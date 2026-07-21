# Phase 1 Handoff — Protected Museum Editor Shell

## Phase Result

- **Phase goal:** add a production-isolated `/dev/museum-editor` with a Svelte 5 rune store, three-column shell, Threlte viewport, and one OrbitControls-driven default camera — without mounting the visitor HUD, `CameraDirector`, or navigation spheres.
- **Completed:** Vite `virtual:museum-editor-entry` plugin (real app in serve, stub in build); server `+page.server.ts` 404 outside `dev`; thin route page; editor store with session clone of `museumSceneDocument`; `MuseumEditorApp` / `EditorViewport` / `EditorCameraRig`; unit tests for clone independence.
- **Intentionally not completed:** selection/raycast, TransformControls, history, asset manifest/library, floor placement, camera helpers/preview, browser persistence, semantic import validation, and architecture doc updates (Phases 2–8).
- **Acceptance status:** `npm test` 35/35, `npm run check` 0/0, `npm run build` passed. Production preview returns 404 for `/dev/museum-editor` and 200 for `/museum`. Client editor node is a 346-byte stub with no `MuseumEditorApp` / `EditorCameraRig` / “Phase 1 shell” strings. Dev `/dev/museum-editor` returns 200 with editor shell markup. Browser/WebGL orbit interaction was not manually exercised in this session.

## Files Changed

### Isolation

| File | Purpose and main API | Important decisions |
|---|---|---|
| [`apps/museum/vite/museum-editor-entry-plugin.ts`](../../apps/museum/vite/museum-editor-entry-plugin.ts) | Vite plugin for `virtual:museum-editor-entry`. | `command === 'serve'` → `MuseumEditorApp.svelte`; `command === 'build'` → `MuseumEditorStub.svelte`. |
| [`apps/museum/vite.config.ts`](../../apps/museum/vite.config.ts) | Registers the editor-entry plugin before `sveltekit()`. | First custom Vite plugin in the museum app. |
| [`apps/museum/src/vite-env.d.ts`](../../apps/museum/src/vite-env.d.ts) | Declares the virtual module as a Svelte `Component`. | Keeps the route page typed without importing `$lib/editor`. |
| [`apps/museum/src/routes/dev/museum-editor/+page.server.ts`](../../apps/museum/src/routes/dev/museum-editor/+page.server.ts) | `load()` calls `error(404)` when `!dev`. | First museum `+page.server.ts`; production isolation layer. |
| [`apps/museum/src/routes/dev/museum-editor/+page.svelte`](../../apps/museum/src/routes/dev/museum-editor/+page.svelte) | Thin shell: imports virtual entry; renders only when `dev`. | Does not statically import `$lib/editor/*`. |
| [`apps/museum/src/lib/editor/MuseumEditorStub.svelte`](../../apps/museum/src/lib/editor/MuseumEditorStub.svelte) | Empty production stub component. | Safe to ship; pulls no editor UI or Three controls. |

### Editor store and UI

| File | Purpose and main API | Important decisions |
|---|---|---|
| [`apps/museum/src/lib/editor/museum-editor.svelte.ts`](../../apps/museum/src/lib/editor/museum-editor.svelte.ts) | `cloneMuseumSceneDocument`, `MuseumEditorStore`, `createMuseumEditorStore`. | Session clone only. Scene/state resolved once at construction so `state.graph` shares array identity with `scene`. Initial node `paris-seat` enables Paris salon GLBs. Do not put `createMuseumState` inside `$derived`. |
| [`apps/museum/src/lib/editor/museum-editor.test.ts`](../../apps/museum/src/lib/editor/museum-editor.test.ts) | Clone independence + default counts + Paris seed. | Mutating the session document must not touch `museumSceneDocument`. |
| [`apps/museum/src/lib/editor/MuseumEditorApp.svelte`](../../apps/museum/src/lib/editor/MuseumEditorApp.svelte) | Three-column shell: outliner / viewport / inspector. | Left panel lists object and node IDs read-only; right panel is a Phase 2+ placeholder. |
| [`apps/museum/src/lib/editor/EditorViewport.svelte`](../../apps/museum/src/lib/editor/EditorViewport.svelte) | Own `Canvas` + `MuseumScene` with camera snippet. | `showNavigationNodes={false}`; never uses `MuseumCanvas`. |
| [`apps/museum/src/lib/editor/EditorCameraRig.svelte`](../../apps/museum/src/lib/editor/EditorCameraRig.svelte) | Single `makeDefault` PerspectiveCamera + OrbitControls. | Museum overview defaults: position `[0,18,24]`, target `[0,1,0]`, `maxDistance` 60. |

## Current Architecture

### Data flow

1. Route page imports `virtual:museum-editor-entry` only.
2. Dev serve resolves to `MuseumEditorApp`, which creates a `MuseumEditorStore`.
3. Store clones `museumSceneDocument`, resolves once to `scene`, and builds `createMuseumState(graph, 'paris-seat')`.
4. `EditorViewport` mounts `MuseumScene` with that pair, suppresses nav spheres, and supplies `EditorCameraRig` via the `camera` snippet.

### Runtime/editor separation

- Visitor `/museum` is unchanged.
- Editor never mounts `CameraDirector`, `MuseumHUD`, or `NavigationNode`.
- Production build replaces the virtual entry with `MuseumEditorStub`; server load 404s the route when `!dev`.

## Contracts and Invariants

- Never mutate `museumSceneDocument` in place — always session-clone.
- Custom editor `scene` must be paired with a dedicated `createMuseumState` from `createNavigationGraph(scene)`; never reuse global `museumState`.
- Only one `makeDefault` camera: `EditorCameraRig` via the `camera` snippet.
- Scene/state array identity must hold for `assertNavigationGraphMatchesScene`. When later phases mutate node topology, rebuild graph + state; do not wrap `createMuseumState` in `$derived`.
- No automatic disk save. Persistence remains Phase 7.

## How to Verify

Run from the repository root:

1. `npm test` — Expected: 5 files / 35 tests pass.
2. `npm run check` — Expected: 0 errors / 0 warnings.
3. `npm run build` — Expected: exit 0; client node for museum-editor stays stub-sized; no `MuseumEditorApp` / `EditorCameraRig` in client chunks.
4. `npm run preview -w @portfolio/museum -- --host 127.0.0.1 --port 4173`
   - `curl` `/dev/museum-editor` → `404`
   - `curl` `/museum` → `200`
5. `npm run dev -w @portfolio/museum -- --host 127.0.0.1 --port 5173`
   - `curl` `/dev/museum-editor` → `200` with “Museum editor” markup
   - Manual: orbit the graybox; Paris salon models visible; no HUD / nav spheres / guided camera

## Known Problems

- Phase 0 pending browser/WebGL visitor tour check is still open.
- Editor store does not yet re-resolve scene/state when the document mutates (acceptable for Phase 1; required before transform/edit phases).
- `AGENTS.md` / camera docs still describe pre–Phase 0 ownership; Phase 8 will update them.
- Manual OrbitControls interaction in a browser was not run in this implementation session.

## Next Phase Entry Point

### Exact next goal

Phase 2: placement root registry with `userData.editorEntity`, explicit raycaster selection (not per-mesh click), Alt-cycle, BoxHelper, and outliner selection. Locked geometry never selectable.

### Read first, in order

1. [`docs/agent-handoffs/phase-1.md`](./phase-1.md)
2. [`apps/museum/src/lib/editor/MuseumEditorApp.svelte`](../../apps/museum/src/lib/editor/MuseumEditorApp.svelte)
3. [`apps/museum/src/lib/editor/EditorViewport.svelte`](../../apps/museum/src/lib/editor/EditorViewport.svelte)
4. [`apps/museum/src/lib/editor/museum-editor.svelte.ts`](../../apps/museum/src/lib/editor/museum-editor.svelte.ts)
5. [`apps/museum/src/lib/museum/MuseumAssets.svelte`](../../apps/museum/src/lib/museum/MuseumAssets.svelte)
6. [`apps/museum/src/lib/museum/MuseumScene.svelte`](../../apps/museum/src/lib/museum/MuseumScene.svelte)

### Suggested first implementation step

Add a placement-root registry (outer Object3D per scene object) with `userData.editorEntity`, then an explicit Threlte/Three raycaster in the editor viewport that selects those roots and drives a `selectedId` field on the editor store.

### Likely risks

- Selecting nested GLB meshes instead of placement roots.
- Making shell/floor/locked geometry selectable.
- Reintroducing per-mesh `onclick` instead of a single raycaster.
- Breaking OrbitControls while picking (need clear pointer ownership rules).

## Important Decisions

- Production isolation is dual-layer: server 404 + virtual stub; the route page never statically imports `$lib/editor/*`.
- Paris assets are enabled by seeding editor state at `paris-seat` rather than adding a `MuseumScene` activation override.
- Scene/state are constructed once (not `$derived`) to satisfy reference equality and avoid creating rune stores inside deriveds.
- Outliner lists are read-only scaffolding for Phase 2; inspector is intentionally empty.
