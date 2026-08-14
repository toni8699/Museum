# A2.2 — Meter-Scale Plan Editing

**Date:** 2026-08-10  
**Status:** Implemented  
**Parent:** [`2026-08-10-layout-cad-foundation.md`](./2026-08-10-layout-cad-foundation.md)  
**Handoff:** [`../hand-off/CURRENT.md`](../hand-off/CURRENT.md)

## Goal

Turn A2.1's drawing demo into the first dependable layout-authoring surface:

```text
stable meter coordinates
  → visible scale/grid
  → draw room
  → select room
  → edit room
  → aligned floor/walls/ceiling in 3D
```

This slice also fixes the Chopin preview geometry defect where floor polygons are mirrored away from their wall boundaries.

## Product boundary

### In scope

- shared, explicit Layout 2D → Three coordinate conversion;
- Chopin floor/wall alignment correction;
- floor and ceiling footprint contract;
- Plan meter grid, labels, scale indicator, zoom, and pan;
- optional 0.25 m snapping;
- Shift-based 15° angle snapping while drafting;
- room selection and selected-room styling;
- whole-room dragging;
- line-vertex handles and vertex dragging;
- Backspace removal of the last active polygon draft point;
- live rectangle dimensions and selected-room/edge readouts;
- layout-only ceiling visibility toggle;
- pure mutation helpers and focused tests.

### Explicitly deferred

- numeric dimension editing fields;
- wall/opening selection;
- door/window authoring;
- Bezier curves and arches;
- shared scene/layout Undo/Redo;
- layout persistence/import/export;
- multi-floor editing;
- visitor `/museum` changes;
- automatic camera collision or recentering.

## Locked geometry contracts

### Coordinate mapping

Persisted layout coordinates remain `[worldX, worldZ]` in meters. Plan conversion must be centralized in pure helpers instead of deriving a new `viewBox` from every pointer event.

- `world → plan screen` applies origin, pan, zoom, and viewport dimensions;
- `plan screen → world` is its exact inverse;
- resizing the viewport does not change world coordinates;
- zoom/pan changes presentation only;
- draft points remain stable when existing rooms or draft extents change.

### Chopin floor alignment

`LayoutPreviewScene.svelte` currently renders floor `ShapeGeometry` with a `-90°` X rotation while passing `[worldX, worldZ]` directly as shape `[x, y]`. That transforms shape Y into `-worldZ`, mirroring floors across the X axis while walls use unflipped world Z.

Fix through a shared adapter helper with tests. Do not patch individual Chopin rooms or change `roomsToLayout()` coordinates.

Room boundaries remain wall centerlines for this slice. Floor and ceiling footprints use the same boundary coordinates; wall thickness masks the centerline edge. Polygon offset/inset geometry is deferred until a dedicated slab contract is needed.

### Ceiling behavior

Ceiling mesh remains generated at `floor.elevation + floor.height`. Layout preview state owns `showCeilings`, defaulting to `false` for overview readability. A Layout-only toggle enables translucent ceilings for inspection. No scene or visitor lighting state changes.

## Interaction design

### Plan navigation

- initial fit occurs once when entering Plan or loading/resetting a layout;
- subsequent zoom and pan preserve world coordinates;
- grid major lines represent 1 m; minor lines represent 0.25 m;
- scale indicator displays current visible meters;
- snap toggle defaults on at 0.25 m and can be disabled;
- Shift constrains active rectangle edges/polygon segments to 15° increments;
- Escape cancels the active draft or drag.

### Drafting

Rectangle and polygon tools keep A2.1 behavior. Pointer coordinates pass through the centralized transform, then optional snap/angle constraints, before entering interaction state.

Polygon Backspace removes the most recent uncommitted point. Closing still requires three valid points and runs existing line-room validation before commit.

### Selection and editing

Select tool behavior:

- clicking a room fill selects that room;
- clicking empty Plan space clears layout selection;
- selected room receives distinct fill/outline styling;
- selected boundary vertices render handles;
- dragging selected room translates all boundary points together;
- dragging one vertex updates only that boundary vertex and adjacent line segments;
- invalid edits remain represented as a warning draft and do not replace the last valid preview;
- selection state remains layout-local and never enters scene selection/history.

A2.2 exposes read-only dimensions: live rectangle width/depth, selected edge length, and selected-room bounds. Numeric editing fields remain deferred.

## Architecture

Keep layout interaction separate from `MuseumEditorStore` scene state.

Expected pure modules:

```text
apps/museum/src/lib/editor/layout/layout-plan-transform.ts
apps/museum/src/lib/editor/layout/layout-plan-transform.test.ts
apps/museum/src/lib/editor/layout/layout-editing.ts
apps/museum/src/lib/editor/layout/layout-editing.test.ts
apps/museum/src/lib/editor/layout/layout-preview-geometry.ts
apps/museum/src/lib/editor/layout/layout-preview-geometry.test.ts
```

Expected UI changes:

```text
apps/museum/src/lib/editor/layout/LayoutPlanViewport.svelte
apps/museum/src/lib/editor/layout/LayoutDraftToolbar.svelte
apps/museum/src/lib/editor/layout/layout-interaction.ts
apps/museum/src/lib/editor/layout/layout-preview-state.svelte.ts
apps/museum/src/lib/editor/layout/LayoutPreviewScene.svelte
apps/museum/src/lib/editor/EditorInspector.svelte
```

Pure helpers own:

- world/screen conversion;
- grid and angle snapping;
- room translation and vertex replacement;
- room bounds and edge dimensions;
- ShapeGeometry coordinate conversion;
- ceiling visibility data.

Svelte components own pointer events, rendering, focus, and status messaging. No generated Three topology is persisted.

## Error handling

- invalid room edits do not mutate the committed preview project;
- warnings identify room/segment IDs and remain visible in the inspector;
- zero-length, disconnected, self-intersecting, or non-finite edits are rejected by existing A1 validation;
- failed room mutation leaves selection and last valid preview intact;
- empty layout keeps neutral Plan grid and scale indicator;
- scene document, scene history, visitor routes, and `rooms.ts` remain unchanged.

## Tests

1. world/screen conversion round-trips within tolerance;
2. viewport resize does not alter world coordinates;
3. zoom/pan changes screen coordinates but not persisted points;
4. 0.25 m grid snap is deterministic and toggleable;
5. Shift angle snap constrains segments to 15°;
6. rectangle live dimensions report meters;
7. Backspace removes only the last uncommitted polygon point;
8. room translation preserves segment connectivity and openings;
9. vertex drag updates adjacent segments and preserves stable IDs;
10. invalid room edit is rejected without mutating committed state;
11. selected room/edge bounds and lengths are correct;
12. floor ShapeGeometry mapping round-trips world Z without mirroring;
13. Chopin preview floor footprints align with corresponding wall centerlines;
14. ceiling visibility state is layout-local;
15. existing A0/B0/A1/C0/A2/A2.1 tests remain green;
16. scene document canonical JSON and visitor behavior remain unchanged.

## Manual verification

1. Open `/editor` and select **Layout → Plan**.
2. Confirm meter grid, labels, scale indicator, and stable origin.
3. Draw rectangle; verify live meter width/depth.
4. Draw polygon; use Backspace and Escape during draft.
5. Select a Chopin room; verify highlight and vertex handles.
6. Drag whole room and one vertex; verify connected walls update.
7. Switch to 3D; verify floor footprints align with walls.
8. Toggle ceilings on/off; verify translucent ceiling inspection.
9. Reset empty, draw a room, zoom/pan, then switch Plan/3D; verify coordinates persist.
10. Open `/museum` separately; verify no visitor or camera changes.

## Verification gate

```bash
npm run test -w @portfolio/museum -- --run \
  src/lib/editor/layout/layout-plan-transform.test.ts \
  src/lib/editor/layout/layout-editing.test.ts \
  src/lib/editor/layout/layout-preview-geometry.test.ts \
  src/lib/editor/layout/layout-preview-state.test.ts \
  src/lib/editor/museum-editor-shell.test.ts \
  src/lib/editor/museum-editor-camera.test.ts
npm run check -w @portfolio/museum
npm test
npm run build
```

Existing four `npm run check` diagnostics in `MuseumEntities.svelte` and `EditorViewport.svelte` remain baseline debt. A2.2 must add no diagnostics or warnings.

## Completion gate

A2.2 is complete when users can see real meter scale, draw stable rooms, select and edit room geometry, and inspect aligned 3D output without touching scene data, shared history, visitor runtime, or `rooms.ts`.
