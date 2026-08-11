# A2.3 — Geometry-Only Opening Authoring and Numeric Opening Dimensions

**Date:** 2026-08-11  
**Status:** Implemented  
**Parent:** [`2026-08-10-layout-cad-foundation.md`](./2026-08-10-layout-cad-foundation.md)  
**Previous slice:** [`2026-08-10-layout-cad-a2-2-scale-editing.md`](./2026-08-10-layout-cad-a2-2-scale-editing.md)  
**Handoff:** [`../hand-off/CURRENT.md`](../hand-off/CURRENT.md)

## Goal

Advance the A2.2 Plan workspace from editable room boundaries to basic architectural opening authoring:

**Chosen interaction: B — tools hit any wall.** Prior wall selection is not required.

```text
choose Door or Window
  → click any wall position
  → edit exact opening dimensions
  → regenerate geometry-only wall gap/lintel
```

Selecting a wall first is optional. Inspector Door/Window actions only arm the corresponding tool; the next Plan click may target any wall.

A2.3 makes openings authorable and measurable without introducing Blender-style mesh editing, runtime portal semantics, or a second persistence/history system. Chopin is a fixture/regression source only — same layout rules apply to draft rooms and compiled Chopin rooms.

## Product boundary

### In scope

- wall-segment and opening selection in Plan view;
- Door and Window creation tools (click any wall; no prior wall selection required);
- projection of Plan click to wall segment;
- numeric opening fields: offset, width, height, sill height;
- default rectangular door/window profiles;
- opening deletion;
- selected wall/opening styling and readouts;
- immediate wall-gap and lintel regeneration in 3D;
- over-height opening validation (`sillHeight + height <= floor.height`);
- pure opening mutation and validation helpers;
- focused tests for placement, editing, validation, room-edit fail-closed, and geometry regeneration.

### Explicitly deferred

- room/edge numeric dimension field editing (A2.2 live readouts stay display-only);
- semantic room adjacency or portal relations (`connectsRoomIds`, B4);
- door leaves, window frames, handles, or imported assets;
- rounded and pointed opening profiles (A3);
- Bezier walls or curved openings (A3);
- drag-to-resize opening handles;
- opening rotation;
- place-at-wall-midpoint from Inspector without a Plan click;
- shared scene/layout Undo/Redo;
- layout persistence/import/export UI;
- multi-floor editing;
- visitor `/museum`, `rooms.ts`, camera, or runtime changes.

## Locked model contracts

### Existing opening model

Use existing `LayoutOpening` without schema changes:

```ts
type LayoutOpening = {
  id: string;
  segmentId: string;
  kind: 'door' | 'window';
  offset: number;       // meters from segment start
  width: number;        // meters
  height: number;       // meters
  sillHeight: number;   // meters above floor
  profile: 'rectangular' | 'rounded' | 'pointed';
};
```

A2.3 creates only `profile: 'rectangular'`. `offset` remains distance from the persisted segment start, never a sample index or screen coordinate.

### Selection model

Replace A2.2's flat `selectedRoomId` with a tagged layout-local selection that scales to future targets (A4 objects) without null-field combinatorics:

```ts
type LayoutSelection =
  | { kind: 'none' }
  | { kind: 'room'; roomId: string }
  | { kind: 'wall'; roomId: string; segmentId: string }
  | { kind: 'opening'; roomId: string; segmentId: string; openingId: string };
```

Rules:

- exactly one selection kind at a time;
- wall selection implies known parent `roomId`, but does not also become a room selection;
- opening selection implies known parent room + segment, but does not also become a wall selection;
- parent IDs drive highlighting and mutation lookup only;
- clearing selection returns `{ kind: 'none' }`;
- scene selection/history remains untouched.

### Defaults

- Door: width `0.9 m`, height `2.1 m`, sill `0 m`.
- Window: width `1.2 m`, height `1.2 m`, sill `1.0 m`.
- New opening offset centers the default interval at the projected click when possible, clamped to the valid segment range.
- Stable IDs use the existing layout-local ID strategy and remain unchanged when fields are edited.

### Validation

Extend existing `layout-validation.ts` (do not fork a parallel validator). An opening mutation is valid only when:

- referenced room and line segment exist;
- all values are finite;
- width and height are greater than zero;
- sill height is non-negative;
- `offset >= 0`;
- `offset + width <= segment length`;
- `sillHeight + height <= floor.height` (new explicit check);
- no opening intervals overlap on the same segment.

Reuse `splitWallAroundOpenings` for mesh sections. Invalid edits return a structured result, preserve the last valid project/model, preserve selection, and expose a warning in the inspector.

Room/vertex commits use the same document validation path for every room (draft or Chopin). If a boundary edit would leave openings out of bounds, overlapping, or over-height, reject the edit fail-closed — no silent clamp, no Chopin-specific repair.

## Interaction design

### Plan tools

Extend the layout-local tool set with `door` and `window`:

- **Select:** hit-test with CAD priority below; empty space clears selection.
- **Door:** with no prior wall selection required, click any wall segment; project the click onto that segment; create a rectangular door; select it; return to Select.
- **Window:** same behavior with window defaults; return to Select.
- `Escape` on Door/Window returns to Select with no create (single-click tools have no in-progress gesture).
- `Backspace`/`Delete` removes a selected opening; polygon Backspace behavior remains unchanged when no opening is selected.

### Hit priority (typical CAD)

Deterministic Plan hit order near crowded corners:

1. vertex handle  
2. opening interval  
3. wall segment  
4. room fill  

Room/vertex dragging remains available through Select and must not begin when a higher-priority target was hit. Door/Window tools also respect the vertex priority: a vertex-handle hit does not create an opening; move the pointer onto the wall span.

### Wall and opening picking

Add pure helpers for:

- nearest point on a line segment;
- distance from Plan world point to segment;
- projected distance along segment;
- wall/opening/vertex hit-target resolution;
- default offset clamping.

Pointer coordinates pass through the existing `planScreenToWorld` transform. When Plan snap is on, snap **along-segment meters** on the projected `offset` (0.25 m), not world XY then re-project. World coordinates remain meters.

### Inspector

When a wall is selected, show:

- room ID;
- segment ID;
- wall length;
- Door and Window actions that switch the active tool (placement still requires a Plan click on a wall).

When an opening is selected, show:

- kind;
- room ID and segment ID;
- offset from segment start;
- width;
- height;
- sill height;
- profile (read-only rectangular);
- Delete opening action;
- validation warning, when present.

Numeric fields parse finite values and commit through pure mutation helpers. Invalid input does not overwrite committed geometry. Field edits regenerate the preview model immediately.

Room/edge numeric fields stay deferred; keep existing display-only dimension readouts from A2.2.

### Visual output

Plan view shows:

- selected wall highlight;
- opening interval marker and selected opening highlight;
- wall/opening labels sufficient to identify the active target;
- existing room dimensions and vertex handles unchanged.

3D view consumes the existing preview model. `splitWallAroundOpenings` regenerates side/lintel sections immediately. No real-time CSG or raw topology is persisted.

## Architecture and files

Keep opening state inside layout preview state; do not route it through `MuseumEditorStore` scene selection/history.

Expected pure module:

```text
apps/museum/src/lib/editor/layout/layout-opening-editing.ts
apps/museum/src/lib/editor/layout/layout-opening-editing.test.ts
```

Pure module responsibilities:

- line projection and segment distance;
- opening interval bounds;
- default opening creation;
- opening field updates;
- delete/update-by-ID helpers;
- opening mutation validation helpers that compose with document validation;
- deterministic hit-target data.

Expected existing-file changes:

```text
apps/museum/src/lib/editor/layout/layout-validation.ts
apps/museum/src/lib/editor/layout/layout-validation.test.ts
apps/museum/src/lib/editor/layout/layout-interaction.ts
apps/museum/src/lib/editor/layout/layout-interaction.test.ts
apps/museum/src/lib/editor/layout/layout-preview-state.svelte.ts
apps/museum/src/lib/editor/layout/layout-preview-state.test.ts
apps/museum/src/lib/editor/layout/LayoutPlanViewport.svelte
apps/museum/src/lib/editor/layout/LayoutDraftToolbar.svelte
apps/museum/src/lib/editor/EditorInspector.svelte
apps/museum/src/lib/editor/layout/LayoutPreviewScene.svelte
```

Use existing `layout-types.ts`, `draft-geometry.ts`, `layout-mesh-factory.ts`, and Plan transforms. Do not add a parallel opening schema or renderer.

## State and mutation flow

```text
Plan pointer
  → plan screen → world
  → CAD hit test (vertex → opening → wall → room)
  → layout-local selection / tool action
  → pure opening or room mutation
  → clone + validate LayoutDocument (incl. openings vs floor height)
  → buildLayoutPreviewModel
  → update Plan and 3D preview
```

Preview mutation functions should follow the existing room-edit pattern:

- clone layout before mutation;
- locate room/segment/opening by stable IDs;
- validate resulting room/document;
- create a canonical project through the existing project codec;
- replace project/model/issues/bounds only after success;
- leave state unchanged on failure;
- set source to `draft` after a successful mutation.

Selection is layout-local and may survive a valid field edit. Deletion clears the deleted opening selection and selects its wall when available (`{ kind: 'wall', roomId, segmentId }`).

## Error handling

- Missing room, segment, or opening returns a structured failure.
- Invalid numeric input leaves prior valid values intact and reports field-level feedback.
- Out-of-bounds, over-height, and overlapping openings are rejected before model replacement.
- Room/vertex edits that invalidate openings are rejected the same way for draft and Chopin rooms; no silent repair.
- A malformed legacy fixture opening follows existing layout validation and preview-warning behavior; A2.3 performs no silent repair.
- Empty layout and rooms without openings remain unchanged.
- No error path mutates scene document, scene selection, shared history, visitor data, or `rooms.ts`.

## Tests

### Pure opening helpers

1. project clicks onto horizontal, vertical, and rotated segments;
2. return deterministic segment distance and offset;
3. snap along-segment offset when Plan snap is enabled;
4. center and clamp default door/window intervals;
5. create stable rectangular door/window values;
6. update each numeric field without changing ID or segment ID;
7. delete only the requested opening;
8. reject missing segment, non-finite, non-positive, out-of-bounds, over-height (`sillHeight + height > floor.height`), and overlapping openings;
9. preserve other rooms/openings during mutation.

### State and UI contracts

10. `LayoutSelection` kinds remain mutually exclusive;
11. Door/Window tools place on any hit wall without prior wall selection; selecting a wall first does not constrain the tool to that wall;
12. successful creation sets source to `draft`, rebuilds model, and selects the opening;
13. failed mutation leaves project/model/version unchanged;
14. deletion clears opening selection and retains wall selection;
15. ceiling state remains unchanged;
16. Layout mutations do not touch `MuseumEditorStore` scene data/history.

### Room-edit + openings (generic fixtures)

17. shortening a segment under an opening via vertex/room edit is rejected fail-closed on a draft rectangle fixture (not Chopin-specific);
18. editing an unrelated room leaves openings and IDs in other rooms stable;
19. valid room edits that keep openings in bounds succeed and preserve opening IDs.

### Geometry regression

20. door creates side sections plus lintel;
21. window creates sill side sections plus lintel;
22. multiple openings remain sorted by segment distance;
23. existing Chopin openings and floor alignment remain correct (load/regression only);
24. A0/B0/A1/C0/A2/A2.1/A2.2 tests remain green;
25. `layout-validation` covers over-height openings.

## Manual verification

1. Open `/dev/museum-editor`.
2. Select **Layout → Plan**.
3. Choose **Door**, click any wall center (no prior wall select); verify selected opening and visible gap.
4. Edit width, height, and offset; verify Plan marker and 3D wall/lintel update.
5. Choose **Window**, click another wall; edit sill height; verify sill and lintel geometry.
6. Select a wall via Select; use Inspector Door/Window to switch tool; place with a Plan click.
7. Attempt an overlapping, out-of-bounds, or over-height opening; verify warning and unchanged valid geometry.
8. Select and delete an opening; verify wall closes and wall selection remains.
9. On a draft room with an opening, drag a vertex to shorten that wall past the opening; verify reject and prior geometry kept.
10. Edit an unrelated room; verify other rooms' opening IDs/geometry remain stable.
11. Load Chopin; verify existing openings still preview correctly (regression only).
12. Switch Scene/Camera; verify existing scene behavior remains unchanged.
13. Open `/museum` separately; verify visitor render and camera behavior remain unchanged.

## Verification gate

```bash
npm run test -w @portfolio/museum -- --run \
  src/lib/editor/layout/layout-opening-editing.test.ts \
  src/lib/editor/layout/layout-validation.test.ts \
  src/lib/editor/layout/layout-interaction.test.ts \
  src/lib/editor/layout/layout-preview-state.test.ts \
  src/lib/editor/layout/draft-geometry.test.ts \
  src/lib/editor/layout/layout-mesh-factory.test.ts \
  src/lib/editor/museum-editor-shell.test.ts \
  src/lib/editor/museum-editor-camera.test.ts
npm run check -w @portfolio/museum
npm test
npm run build
```

Existing four `npm run check` diagnostics in `MuseumEntities.svelte` and `EditorViewport.svelte` remain baseline debt. A2.3 must add no diagnostics or warnings.

## Future polish (not A2.3)

- Inspector place-at-midpoint without Plan click.
- Drag-to-resize opening handles.
- Room/edge numeric dimension fields.
- Richer wall/opening labels and hover affordances.

## Completion gate

A2.3 is complete when users can create rectangular door/window openings by clicking any wall, select walls/openings, edit exact opening dimensions, see valid geometry regenerate in Plan and 3D, recover safely from invalid opening or room-boundary edits under one validation path, and do all of this without changing visitor runtime, scene data/history, persistence, or portal semantics.

## Implementation result

Implemented with tagged layout selection, any-wall Door/Window tools, along-segment snapping, numeric opening inspector fields, deletion, selected Plan/3D highlighting, over-height validation, and fail-closed room edits.

Verification:

- A2.3 focused layout + shell/camera tests: 147 passed.
- Full suite: 1062 passed.
- `npm run check -w @portfolio/museum`: same four baseline diagnostics in `MuseumEntities.svelte` and `EditorViewport.svelte`; no A2.3 diagnostics or warnings.
- `npm run build -w @portfolio/museum`: passed.
- `git diff --check`: passed.
