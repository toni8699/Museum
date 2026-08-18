# A2 — Layout Preview in Editor

**Date:** 2026-08-10  
**Status:** Implemented  
**Parent:** [`2026-08-10-layout-cad-foundation.md`](./2026-08-10-layout-cad-foundation.md)  
**Handoff:** [`../hand-off/CURRENT.md`](../hand-off/CURRENT.md)

## Goal

Put the first generated layout preview inside `/editor`.

```text
MuseumProject fixture
  → LayoutPreviewModel
  → Three render adapter
  → existing editor Canvas + camera
```

This slice proves that the A0/B0/A1 data pipeline is visible and useful before adding room drafting. It is a preview workspace, not yet a CAD authoring surface.

The preview source is the deterministic compiled Chopin fixture from B0. It must be possible to return to an empty layout in memory, but the initial A2 preview opens with the Chopin fixture so the workspace has visible geometry on first launch.

## Product boundary

### In scope

- new `Layout` editor workspace beside existing `Scene` and `Camera` workspaces;
- in-memory `MuseumProject` preview state using the C0 codec and B0 compiler;
- generated floor, ceiling, wall-side, and wall-lintel rendering;
- geometry-only rectangular openings;
- neutral layout preview materials and clear layout-vs-scene visual distinction;
- existing editor orbit camera and lighting reused;
- one-shot camera framing from layout bounds on entering the workspace;
- preview status panel showing source, room count, and validation issues;
- layout workspace keyboard focus and safe workspace switching;
- tests for source state, preview bounds, workspace transitions, and visitor isolation.

### Explicitly deferred

- rectangle click-drag;
- polygon drawing or editing;
- Plan view and 2D handles;
- selection, room mutation, snapping, dimensions, or gizmos;
- layout undo/redo and shared tagged history;
- project import/export UI;
- Bezier, arches, semantic adjacency, and object placement;
- multi-floor support;
- runtime `/museum` layout loading.

A2.1 will add drafting interaction after this preview gate passes. Do not hide drafting behind unfinished preview code in this slice.

## Architecture

### Separate layout preview state

Create a small layout-owned state/controller instead of adding layout fields to `MuseumEditorStore`'s scene document state.

```ts
export type LayoutPreviewSource = 'chopin-fixture' | 'empty';

export type LayoutPreviewBounds = {
  min: [number, number, number];
  max: [number, number, number];
};

export type LayoutPreviewState = {
  source: LayoutPreviewSource;
  project: MuseumProject;
  model: LayoutPreviewModel;
  issues: LayoutGeometryIssue[];
  bounds: LayoutPreviewBounds | null;
};
```

Recommended state API:

```ts
createLayoutPreviewState(): LayoutPreviewStateController;
loadChopinLayoutPreview(): boolean;
resetLayoutPreview(): boolean;
refreshLayoutPreview(): void;
```

Rules:

- initialize the Chopin fixture through `createMuseumProject`, not by manually assembling an unvalidated project;
- use `roomsToLayout()` only as the B0 source of the fixture;
- layout preview state owns the project copy and never mutates `museumSceneDocument` or the scene store;
- `resetLayoutPreview()` creates an empty layout while preserving the scene document in the project envelope;
- A2 does not serialize the preview state or enter shared history;
- invalid rooms remain absent from the model according to A1 behavior and appear in the status panel.

### Workspace integration

Extend the editor workspace union:

```ts
type EditorWorkspace = 'scene' | 'camera' | 'layout';
```

Workspace rules:

- `Scene` keeps current dressing behavior;
- `Camera` keeps current camera authoring behavior;
- `Layout` shows layout preview and disables scene placement/selection tools;
- switching away from `Camera` uses existing camera-preview stop behavior;
- switching to `Layout` clears scene selection affordances without deleting scene data;
- switching back to `Scene` restores existing scene tools and selection;
- layout workspace never changes `rooms.ts`, visitor state, camera tour data, or scene history.

Keep scene `Undo`/`Redo` disabled or hidden while `Layout` is active rather than creating a second visible history stack.

### Reuse existing camera system

Do not create a layout-specific camera or collision system.

`EditorCameraRig` remains the single editor camera owner. Layout state provides a serializable bounds tuple; the rig uses existing `createEditorBoundsCameraFrame` helpers to frame it once when the layout workspace or preview source changes. Orbit controls, pan, zoom, and current camera preview behavior remain shared.

Framing requirements:

- frame all valid preview rooms, including rotated B0 rooms;
- use existing camera near/far and distance clamps;
- do not continuously recenter while orbiting;
- do not infer collision avoidance;
- if no valid rooms exist, retain neutral editor camera pose and show an empty-state message.

## Rendering adapter

Create an editor-only Svelte/Three adapter:

```text
apps/museum/src/lib/editor/layout/LayoutPreviewScene.svelte
```

The adapter consumes `LayoutPreviewModel` and does not write to the document.

### Render mapping

Layout coordinates are `[worldX, worldZ]` and map to Three `[x, y, z]`.

- floor polygon → flat polygon mesh at `floor.elevation`;
- ceiling polygon → translucent polygon mesh at `floor.elevation + floor.height`;
- wall side section → rectangular prism between `startDistance` and `endDistance`;
- wall lintel section → rectangular prism above an opening;
- opening gaps remain empty geometry; no CSG;
- floor, wall, ceiling, and warning materials remain editor-only.

The adapter may use Three triangulation and disposable render objects. It must never serialize generated vertices, indices, materials, or object references.

Use stable keyed room and wall groups. Dispose replaced geometry/materials when the preview model changes or the component unmounts. Disable raycasting on preview meshes until A2.1 adds layout selection.

### Visual language

- generated layout mesh: neutral warm gray;
- floor: slightly darker neutral;
- ceiling: low-opacity neutral or hidden by default if it blocks inspection;
- openings: visible empty gaps with no fake portal semantics;
- invalid-room warning: orange/red status, not silent removal;
- scene workspace visuals remain unchanged.

No layout object gizmo, raw vertex handle, or scene placement helper appears in Layout mode.

## Editor shell changes

Modify only the existing editor shell surfaces needed for the workspace:

```text
apps/museum/src/lib/editor/museum-editor.types.ts
apps/museum/src/lib/editor/store/session-state.svelte.ts
apps/museum/src/lib/editor/museum-editor.svelte.ts
apps/museum/src/lib/editor/MuseumEditorApp.svelte
apps/museum/src/lib/editor/EditorAppBar.svelte
apps/museum/src/lib/editor/EditorLeftSidebar.svelte
apps/museum/src/lib/editor/EditorInspector.svelte
apps/museum/src/lib/editor/EditorViewport.svelte
apps/museum/src/lib/editor/EditorCameraRig.svelte
apps/museum/src/lib/museum/MuseumScene.svelte
```

Add new focused modules rather than expanding the scene store:

```text
apps/museum/src/lib/editor/layout/layout-preview-state.svelte.ts
apps/museum/src/lib/editor/layout/layout-preview-bounds.ts
apps/museum/src/lib/editor/layout/LayoutPreviewScene.svelte
apps/museum/src/lib/editor/layout/layout-preview-state.test.ts
apps/museum/src/lib/editor/layout/layout-preview-bounds.test.ts
```

`MuseumScene.svelte` may gain an editor-only `showArchitecture` prop defaulting to `true`. In Layout mode, keep its graph/camera callback available but omit shell, room, and entity geometry. The visitor route passes no prop and must render exactly as before.

`EditorViewport.svelte` should conditionally render:

```text
Scene/Camera workspace:
  current MuseumScene + existing helpers/tools

Layout workspace:
  MuseumScene(showArchitecture=false) for shared camera/background
  LayoutPreviewScene for generated layout geometry
  no scene selection, placement, transform, or camera-node helpers
```

This keeps one Canvas and one camera while preventing duplicate architecture from obscuring the layout preview.

## Sidebar and inspector

Layout workspace sidebar is read-only in A2:

- title: `Layout preview`;
- source badge: `Chopin fixture` or `Empty layout`;
- room count and floor count;
- valid/invalid room count;
- buttons: `Reload Chopin preview`, `Reset empty`;
- note: `Drafting tools arrive in A2.1`.

Layout inspector is read-only:

- selected state: no layout selection in A2;
- source/project name;
- total rooms and openings;
- geometry warning list with stable paths/IDs;
- explicit statement: openings are geometry-only in this phase.

Do not expose fake editable dimensions or controls before mutators exist.

## Error handling

- C0 project construction failure prevents preview mount and shows a clear status message;
- geometry issues keep valid rooms visible and list invalid rooms;
- empty layout renders grid/background plus an empty-state panel;
- render adapter failures are surfaced through the editor status channel and clean up partial resources;
- no invalid geometry is silently repaired or serialized;
- scene document validation/history errors remain owned by the existing scene store.

## Tests

Pure/controller tests:

1. initial state loads validated Chopin project;
2. reset produces empty layout without mutating scene data;
3. reload restores the same canonical Chopin project;
4. geometry issues are exposed with room IDs;
5. bounds include floor polygons and wall heights;
6. rotated room bounds are correct;
7. empty layout returns null bounds;
8. workspace transitions support `scene → layout → scene`;
9. camera workspace preview is stopped before entering layout;
10. layout state never enters scene undo history;
11. current scene document and canonical JSON remain unchanged.

Component/manual verification:

1. Open `/editor`.
2. Select `Layout`.
3. See all seven compiled Chopin rooms in one 3D preview.
4. Verify floors, walls, ceilings, rectangular door/window gaps, and corridor cutouts.
5. Orbit, pan, and zoom with the existing camera controls.
6. Switch Scene → Layout → Camera → Scene; no duplicate shell or stale scene gizmos remain.
7. Reset to empty; verify neutral camera and empty-state message.
8. Reload Chopin preview; verify deterministic geometry and framing.
9. Open `/museum` separately; verify shell, camera tour, and visitor behavior unchanged.

## Verification gate

```bash
npm run test -w @portfolio/museum -- --run \
  src/lib/editor/layout/layout-preview-state.test.ts \
  src/lib/editor/layout/layout-preview-bounds.test.ts \
  src/lib/editor/museum-editor-shell.test.ts \
  src/lib/editor/museum-editor-camera.test.ts
npm run check -w @portfolio/museum
npm test
```

The existing four `npm run check` diagnostics in `MuseumEntities.svelte` and `EditorViewport.svelte` are baseline debt. A2 must not add diagnostics or alter their count/type. Build verification and visitor-module isolation remain required before marking the slice complete.

## Completion gate

A2 preview is complete when:

- Layout workspace is visible in the editor;
- validated B0/C0 fixture renders through A1 preview data;
- openings remain geometry-only gaps;
- existing editor camera is reused and frames valid layout bounds;
- layout mode has no scene gizmos or scene mutation controls;
- reset/reload preview state works without shared history;
- full tests pass;
- `/museum` behavior remains unchanged;
- docs handoff moves to A2.1 drafting interaction.

## Future A2.1 polish seams

Keep these decisions out of this slice but preserve extension points:

- hard Plan/3D switch vs split view;
- rectangle click-drag and polygon close interaction;
- layout selection colors and handles;
- grid/angle snapping;
- semantic inspector fields;
- layout dirty state and shared tagged history;
- camera framing controls and manual recenter action;
- ceiling visibility toggle;
- B1 “Load Chopin layout” product wording;
- responsive/mobile plan workspace;
- Bezier handle UX and curve preview.
