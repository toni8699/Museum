# A4 — Objects, Inspectors, and Layout I/O UI

**Date:** 2026-08-11  
**Status:** Implemented — automated verification passed; in-app Browser QA pending because the Browser runtime was unavailable on 2026-08-12  
**Parent:** [`2026-08-10-layout-cad-foundation.md`](./2026-08-10-layout-cad-foundation.md) §A4  
**Handoff:** [`../hand-off/CURRENT.md`](../hand-off/CURRENT.md)  
**Contracts:** [`../components/placement.md`](../components/placement.md) · [`../components/shell.md`](../components/shell.md) · [`../components/persistence.md`](../components/persistence.md)

## Goal

Complete the first useful layout authoring loop without changing the layout schema or visitor runtime:

```text
Object tool → ghost → floor hit → commit LayoutObject
  + room/wall/object inspectors
  + shared wall thickness and floor-height edits
  + Layout JSON import/copy/download/reset
  + blank/dirty/imported session status
  + independent invalid-import feedback
```

A4 remains editor-only. `/museum` stays on `rooms.ts`; no layout runtime loading, B4 room adjacency, B5 cutover, package payload, shared layout undo stack, or visitor changes.

## Locked decisions

### Product boundary

- Lean layout objects only. No layout TransformControls, world gizmos, dimension handles, or profile-drafting tool.
- Scene-mode entity gizmos and scene placement remain untouched.
- Layout mutations remain preview-state-only. Do not add layout entries to `MuseumEditorStore` history.
- Existing `LayoutObject` schema remains unchanged.
- `profile` objects are codec/I/O round-trip only. They have no authoring tool or profile editor.
- Profile objects imported successfully render as non-editable AABB/placeholder descriptors.
- Invalid structural/profile input fails import; no silent repair.
- Geometry warnings retain the current codec/geometry boundary: structural codec validation gates import, while post-import geometry issues remain preview warnings.
- Layout objects may exist outside room bounds. `roomId` is ownership metadata, not a containment constraint.

### Layout status and baseline

Add layout-local session state:

```ts
type LayoutBaselineKind = 'blank' | 'imported';
type LayoutSessionStatus = 'blank' | 'dirty' | 'imported';
type LayoutPreviewSource = 'chopin-fixture' | 'empty' | 'draft' | 'imported';

// On LayoutPreviewState, conceptually:
baselineLayoutJson: string;
baselineKind: LayoutBaselineKind;
readonly isLayoutDirty: boolean;
readonly status: LayoutSessionStatus;
statusMessage: string | null;
importError: string | null;
```

Use `serializeLayoutDocument()` as the canonical comparison operand. Never compare layout dirty state with `JSON.stringify()` or scene/project JSON.

Derive `isLayoutDirty` independently:

```ts
isLayoutDirty = serializeLayoutDocument(project.layout) !== baselineLayoutJson;
```

`status` is presentation state derived from `isLayoutDirty` and `baselineKind`: `dirty` when the canonical JSON differs; otherwise the baseline kind. Import errors never replace or hide dirty state.

Status rules:

- Initial Chopin fixture: `imported`; baseline is its canonical serialized layout.
- Successful layout JSON import: `imported`; replace layout and baseline, set `baselineKind` to `imported`, and set source to `imported` even when the imported document is empty.
- Successful Chopin reload: `imported`; replace layout and baseline, set `baselineKind` to `imported`, and set source to `chopin-fixture`.
- Successful empty reset: `blank`; baseline is canonical `createEmptyLayoutDocument()`, `baselineKind` is `blank`, and source is `empty`.
- Any successful layout mutation whose canonical JSON differs from baseline: `dirty`.
- Any layout equal to its baseline returns to `baselineKind`; this preserves the distinction between an imported empty document and an empty reset.
- Failed import: set `importError` with a transient message; preserve layout, model, selection, source, baseline, baseline kind, status, dirty state, and prior valid preview.
- Successful mutation, import, reset, or Chopin reload clears a prior `importError`.

Layout status is independent from `MuseumEditorStore.isDirty`, scene canonical JSON, and scene history. Leaving the editor prompts when either scene or layout has unsaved state.

Status and invalid-import feedback are visible in the Layout inspector header, Layout sidebar summary, and Project menu. The scene dirty badge remains scene-scoped; it must not claim layout edits are scene edits.

### Object transform semantics

`LayoutObject` fields retain their existing shape:

```ts
type LayoutObject = {
  id: string;
  kind: 'box' | 'plane' | 'cylinder' | 'sphere' | 'profile';
  position: Vec3;
  rotation: Vec3;
  dimensions: Vec3;
  profile?: DraftPath;
  roomId?: string;
};
```

A4 locks these meanings:

- `position` is object center in layout/world coordinates `[x, y, z]`.
- `rotation` is Euler radians, matching the existing editor transform convention.
- `dimensions` are full X/Y/Z extents for every authored primitive.
- Floor placement sets `position.y = floor.elevation + dimensions.y / 2`; Plan drag changes only `position.x` and `position.z`.
- Default dimensions:
  - box: `[1, 1, 1]`
  - plane: `[2, 0.01, 2]`
  - cylinder: `[1, 1, 1]`
  - sphere: `[1, 1, 1]`
- Cylinder and sphere accept editable full extents; rendering applies those extents as non-uniform primitive scale when needed.
- Layout `plane` renders as a thin horizontal `BoxGeometry` slab using its full `[x, y, z]` extents. No implicit base rotation is added; `rotation` is applied directly. This keeps zero rotation horizontal and makes its AABB/Plan footprint match serialized dimensions.
- Imported profile placeholders use `dimensions` for their AABB while preserving `profile` unchanged.
- Placement hit assigns `roomId` only when a room resolves from the hit. Plan drag preserves the existing `roomId`; explicit inspector selection is the only later room ownership change.

## Scope

### In scope

- Layout toolbar Object tool with kind picker defaulting to box.
- Authored kinds: box, plane, cylinder, sphere.
- Pending layout-local object ghost in Plan and 3D.
- Ghost commit on tagged 3D layout floor or Plan room-floor hit.
- Stable object IDs and optional room assignment.
- Object selection, Plan X/Z drag, 0.25 m snap, and Delete.
- Object AABB/primitive preview descriptors in Plan and 3D.
- Object inspector for transform, dimensions, and optional roomId.
- Read-only object ID and kind fields.
- Room name and shared room thickness inspectors.
- Wall inspector write-through to parent room thicknesses and parent floor height.
- Fail-closed numeric commits and opening revalidation.
- Layout JSON file/paste import, clipboard copy, download, reset, and status display.
- Layout dirty confirmation for destructive replacement/reset/navigation.
- Focused layout tests and shell regression checks.

### Explicitly deferred

- Layout world gizmos, TransformControls, dimension handles, and 3D dragging.
- Profile object authoring or profile geometry editing.
- Free mesh/asset/frame authoring.
- Per-segment wall thickness or height schema fields.
- Multi-floor UI; existing `floors[]` remains data-compatible. Plan object placement targets `floors[0]` only. 3D placement targets the exact floor resolved from the tagged hit. A later floor picker may replace the Plan policy without schema changes.
- Shared layout/scene history or undo stack.
- C1 folder/zip/project package export and layout package payload.
- B4 `connectsRoomIds`, B5 cutover, visitor layout loading, and `/museum` changes.

## Inspectors

### Room selection

Editable:

- name;
- wall thickness;
- floor thickness;
- ceiling thickness;
- parent floor height.

Display-only:

- room ID;
- bounds;
- edge lengths.

Room edits clone the layout, validate the resulting document/geometry, rebuild the preview, and replace state only on success.

### Wall / interior-anchor selection

Editable through the parent room/floor:

- wall thickness;
- floor thickness;
- ceiling thickness;
- floor height.

Display-only:

- segment ID;
- effective segment length;
- segment kind;
- existing Door/Window actions.

Wall thickness writes through to `LayoutRoom.wallThickness`; floor height writes through to `LayoutFloor.height`. No per-segment dimensions are introduced.

### Opening selection

Keep existing A2.3/A3 fields and behavior unchanged:

- kind;
- offset;
- width;
- height;
- sill height;
- profile;
- delete.

### Object selection

Authored `box` / `plane` / `cylinder` / `sphere` objects are editable:

- position X/Y/Z;
- rotation X/Y/Z;
- dimensions X/Y/Z;
- optional roomId.

Display-only:

- stable ID;
- kind.

`kind` becomes read-only after placement. Numeric commits reject non-finite or invalid values, preserve the last valid preview, restore the field value, and set `lastMutationMessage`. `roomId` accepts `Unassigned` or an existing room ID; unknown IDs fail closed.

Imported `profile` objects are selectable for inspection only. Their ID, kind, transform, dimensions, and room ID are display-only. They cannot be dragged, deleted, or mutated in A4; their profile data round-trips unchanged.

## Validation and mutation flow

Use one generic layout mutation path instead of opening-specific result handling:

```text
input / pointer gesture
  → clone LayoutDocument
  → locate stable IDs
  → apply pure patch
  → validate structural document through layout codec
  → validate relevant geometry/opening constraints
  → buildLayoutPreviewModel
  → replace project/model/issues/bounds only after success
  → serialize current layout and update status
```

The mutation helper must:

- avoid mutating the committed document on failed input;
- preserve the last valid model and bounds on failure;
- preserve selection unless the target was deleted;
- clear stale mutation messages after successful mutation;
- mark source as `draft` after a successful edit;
- derive status as `dirty` unless canonical JSON equals the baseline, then restore `baselineKind`;
- avoid all scene document/history writes.

### Numeric validation

Reuse the existing opening mutation pattern and `layout-validation.ts`:

- all numeric values finite;
- wall/floor/ceiling thicknesses greater than zero;
- floor height greater than zero;
- object dimensions greater than zero;
- object position and rotation finite;
- object room references absent or present in the document;
- object profile present only for `profile` kind;
- floor-height changes validate every room on that floor;
- `opening.sillHeight + opening.height <= floor.height` remains enforced;
- invalid room/wall/object edits do not partially apply.

`validateLayoutDocument()` remains the import/serialization structural gate. `validateLayoutDocumentGeometry()` and existing room validation handle geometry/opening warnings and mutation rejection where required.

### Thickness preview

Extend preview data so all editable room thickness fields have defined visual/bounds behavior:

- wall thickness controls wall descriptor thickness;
- floor thickness renders a slab extending downward from `floor.elevation` while preserving the floor surface elevation;
- ceiling thickness renders a slab extending upward from `floor.elevation + floor.height` while preserving the ceiling surface elevation;
- Plan footprint remains the room boundary;
- preview bounds include wall extents, floor slab depth, ceiling slab height, and object extents.

No raw topology is serialized.

## Object interaction

### Tool and pending ghost

Extend `LayoutDraftTool` with `object`. Add a layout-local pending object state; do not use scene `pendingPlacement*` fields:

```ts
type LayoutPendingObject = {
  kind: 'box' | 'plane' | 'cylinder' | 'sphere';
  dimensions: Vec3;
  position: Vec3 | null;
  roomId?: string;
  valid: boolean;
  message?: string;
};
```

The toolbar exposes the four authored kinds and defaults to box. Selecting Object arms the pending ghost. Selecting another tool clears the pending ghost.

Escape cancels with no document write. Pointer movement over an invalid target keeps the ghost armed and marks it invalid. Clicking an invalid target cancels the pending ghost with no document write and exposes a status message. Plan and 3D use this same behavior.

### Plan placement

On Object tool pointer movement:

- convert screen to world through existing Plan transforms;
- resolve the containing room on `project.layout.floors[0]` only; no floor means an invalid candidate;
- return both floor and room from hit resolution, then use `floor.elevation + dimensions.y / 2` for center Y;
- render a primitive/AABB ghost at the candidate position;
- mark the candidate invalid when no room floor resolves.

On valid Plan floor click:

- generate a collision-free stable object ID;
- write one `LayoutObject` with defaults and resolved `roomId`;
- rebuild preview and select the new object;
- return to Select.

### 3D placement

Tag generated layout floor meshes with the existing editor floor surface contract:

```ts
userData.surfaceType = 'floor';
userData.editorSurface = {
  type: 'floor',
  placeable: true,
  roomId
};
```

Add a layout-local 3D pointer/raycast path. It must use tagged layout floors, never scene placement state. Resolve the exact floor and room from the tagged hit. Candidate world position uses the hit point plus half the object Y extent. A valid click commits exactly one object; clicking a non-floor target cancels the pending ghost, leaves the document unchanged, and exposes a status message.

### Object preview model

Extend `LayoutPreviewModel` with object descriptors. Each descriptor includes:

- stable object ID;
- kind;
- transform;
- dimensions;
- optional room ID;
- rotation-aware world AABB;
- Plan footprint for hit testing.

Render authored primitives in `LayoutPreviewScene.svelte` and Plan. Render imported profile objects as non-editable AABB placeholders. Mark object roots with layout-object editor metadata so 3D raycasts can resolve IDs without coupling to scene entities.

### Object selection and drag

Extend `LayoutSelection`:

```ts
| { kind: 'object'; objectId: string }
```

Plan hit priority is deterministic:

```text
vertex → interiorAnchor → opening → object → wall → room
```

Object Plan hit testing uses the rendered/derived 2D footprint, including rotation. For overlapping objects, nearest/topmost stable render order resolves consistently.

With Select + object selection:

- drag changes only X/Z position;
- snap X/Z to 0.25 m when Plan snap is enabled;
- preserve Y, rotation, dimensions, and roomId;
- store original and candidate positions in layout-local interaction state;
- render candidate position as a transient drag preview without changing `project.layout`, canonical JSON, baseline, status, model, or bounds;
- Escape/cancel discards transient state with no rollback mutation;
- commit one final preview mutation on pointer release;
- Delete removes the object and clears selection.

No object world drag or gizmo is added in A4.

Conceptually:

```ts
type LayoutObjectDrag = {
  objectId: string;
  originalPosition: Vec3;
  candidatePosition: Vec3;
};
```

Profile placeholders never enter object drag state.

## Layout JSON I/O

### Project menu

Mount `EditorProjectMenu` in Layout workspace while preserving the existing Scene JSON section unchanged. Add a Layout JSON section alongside it:

- Import file;
- paste JSON;
- Import pasted JSON;
- Copy JSON;
- Download JSON as `museum-layout.json`;
- Reset.

Layout actions call only layout codec/state helpers. Scene JSON and package actions retain current behavior.

Replacement confirmations are document-scoped:

- Scene JSON/package import and scene Reset consult scene dirty state only, because they do not replace layout.
- Layout import, Reset, and Reload Chopin consult `isLayoutDirty` only, because they preserve scene.
- Editor navigation and browser unload consult the combined scene/layout dirty condition.
- Confirming one document replacement never clears, rebases, or claims to discard the other document.

### Import

For file and paste input:

1. parse with `parseLayoutDocumentJson()`;
2. reject structural/profile-invalid input;
3. on failure set `importError` and message, preserving the complete prior layout state, status, and dirty state;
4. on success preserve project ID/name/scene, replace only `project.layout`, rebuild model, set baseline to returned canonical JSON, set `baselineKind`, source, and status to `imported`, and clear mutation/import messages.

Successful import must not mutate scene state or scene baseline.

### Copy/download

- Serialize current layout with `serializeLayoutDocument()`.
- Copy canonical JSON through the existing clipboard pattern.
- Download canonical JSON with filename `museum-layout.json`.
- Report clipboard/download failures without changing document or status baseline.

### Reset and Chopin reload

`resetLayoutPreview()` creates `createEmptyLayoutDocument()`, preserves scene data, sets source `empty`, baseline to canonical empty JSON, `baselineKind` to `blank`, and status to `blank`.

`loadChopinLayoutPreview()` loads a fresh `roomsToLayout()` result, preserves scene data, sets source `chopin-fixture`, baseline to its canonical JSON, `baselineKind` to `imported`, and status to `imported`.

Sidebar Reload Chopin and Reset empty use the same helpers as Project menu and confirm when layout is dirty.

### Dirty leave confirmation

Extend editor navigation/before-unload protection to consider:

```ts
store.isDirty || layoutPreview.isLayoutDirty
```

Scene and layout confirmation messages may identify which document has unsaved changes. Layout confirmation must not alter scene dirty state.

## Architecture and files

Expected existing-file changes:

```text
apps/museum/src/lib/editor/EditorAppBar.svelte
apps/museum/src/lib/editor/EditorProjectMenu.svelte
apps/museum/src/lib/editor/EditorInspector.svelte
apps/museum/src/lib/editor/EditorLeftSidebar.svelte
apps/museum/src/lib/editor/EditorViewport.svelte
apps/museum/src/lib/editor/MuseumEditorApp.svelte
apps/museum/src/lib/editor/layout/LayoutDraftToolbar.svelte
apps/museum/src/lib/editor/layout/LayoutPlanViewport.svelte
apps/museum/src/lib/editor/layout/LayoutPreviewScene.svelte
apps/museum/src/lib/editor/layout/layout-interaction.ts
apps/museum/src/lib/editor/layout/layout-mesh-factory.ts
apps/museum/src/lib/editor/layout/layout-preview-bounds.ts
apps/museum/src/lib/editor/layout/layout-preview-state.svelte.ts
apps/museum/src/lib/editor/layout/layout-types.ts
apps/museum/src/lib/editor/layout/layout-codec.ts
apps/museum/src/lib/editor/layout/layout-validation.ts
```

Required focused pure helper/tests:

```text
apps/museum/src/lib/editor/layout/layout-object-editing.ts
apps/museum/src/lib/editor/layout/layout-object-editing.test.ts
```

Pure object helper responsibilities:

- default dimensions;
- stable ID allocation;
- object patching and deletion;
- Plan footprint/AABB derivation;
- object hit testing;
- floor-position conversion;
- 0.25 m X/Z snap;
- room ID validation.

Do not create a second scene placement or persistence system.

## Tests

### Status and I/O

1. Initial Chopin state is `imported` with canonical baseline.
2. Empty reset produces `blank` and canonical empty baseline.
3. Successful layout import replaces layout only and produces `imported`; importing an empty document still has imported baseline kind.
4. Invalid JSON preserves prior layout/model/selection/baseline/baseline kind/status and sets `importError`.
5. Invalid import while layout is dirty preserves `isLayoutDirty === true`; navigation remains protected.
6. Invalid profile input follows the same fail-closed import path.
7. Mutation changes status to `dirty` and canonical JSON differs from baseline.
8. Returning canonical JSON to baseline restores its `blank` or `imported` baseline kind.
9. Successful mutation, import, reset, or Chopin reload clears prior `importError`.
10. Copy/download use canonical layout JSON and correct filename.
11. Scene canonical JSON, scene dirty state, and scene history remain unchanged after layout I/O.
12. Scene replacement confirms only scene dirtiness; layout replacement confirms only layout dirtiness; navigation/unload considers both.

### Room/wall fields

13. Room name mutation succeeds and marks layout dirty.
14. Wall thickness writes through to the parent room and regenerates wall preview.
15. Floor and ceiling thicknesses update slab descriptors and bounds.
16. Wall inspector writes floor height through to the parent floor.
17. Floor-height mutation rejects when any opening on that floor becomes over-height.
18. Failed numeric commits preserve prior layout/model/bounds and expose `lastMutationMessage`.
19. Room and wall edits preserve stable room/segment/opening IDs.

### Objects

20. Object tool defaults to box and exposes box/plane/cylinder/sphere only.
21. Ghost movement never changes serialized layout.
22. Escape cancels a ghost with no document write.
23. Invalid hover keeps the ghost armed; invalid click cancels it and commits nothing in Plan and 3D.
24. Plan floor hit targets `floors[0]`, commits one object with resolved room ID, and sets Y to floor elevation plus half-height.
25. Overlapping rooms on later floors cannot steal a Plan object placement from `floors[0]`.
26. 3D tagged-floor hit resolves the exact elevated floor and commits one object with correct center/Y placement.
27. IDs remain stable and collision-free across repeated placements/imported IDs.
28. Objects round-trip through codec/I/O for all authored kinds and profile.
29. Layout plane renders as a horizontal thin slab at zero rotation; rotated footprint and world AABB match full XYZ extents.
30. Profile objects render as selectable, read-only placeholders and reject drag, Delete, and inspector mutations.
31. Selection priority is vertex → interior anchor → opening → object → wall → room.
32. During Plan object drag, canonical JSON/status/model/bounds remain unchanged; pointer release applies one snapped X/Z mutation preserving Y/rotation/dimensions/roomId.
33. Escape during Plan object drag discards transient position with no document mutation.
34. Delete removes only the selected authored object and clears selection.
35. Authored-object inspector edits transforms/dimensions/roomId and rejects invalid numeric/reference values.
36. Object preview model includes AABBs/descriptors and Plan/3D render paths.

### Regression

37. Existing opening, A3 curve, Plan, and preview tests remain green.
38. Scene Project menu behavior remains unchanged outside Layout workspace.
39. `/museum` remains on `rooms.ts`; camera behavior remains unchanged.
40. No new check diagnostics.

## Manual verification

1. Open `/dev/museum-editor` and choose Layout.
2. Verify Project menu is available and shows Layout JSON controls plus unchanged Scene JSON controls.
3. Verify initial Chopin status is imported.
4. Reset empty; confirm status blank and no rooms/objects.
5. Draw a room, choose Object → box, move the ghost, press Escape, and verify layout JSON is unchanged.
6. Place box, plane, cylinder, and sphere in Plan; verify selection, room ID, preview, and status dirty.
7. Place an object on a tagged elevated 3D layout floor; verify `floor.elevation + dimensions.y / 2` center Y and room ID.
8. Drag an object in Plan with Snap enabled; before release verify JSON/status stay unchanged, then verify one 0.25 m X/Z commit and unchanged room ID.
9. Edit object transform/dimensions/room ID; try invalid values and verify fail-closed behavior.
10. Delete an object and verify only that object disappears.
11. Import a profile object; verify read-only inspection, placeholder rendering, and blocked drag/Delete/edit.
12. Select a room and edit name/thickness/height; verify preview regeneration.
13. Select a wall/interior anchor and edit shared room/floor fields; verify write-through.
14. Lower floor height below an opening top; verify rejection and unchanged geometry.
15. Copy and download `museum-layout.json`; import it back and verify status imported.
16. Make layout dirty, import malformed JSON or invalid profile data, and verify prior document, dirty state, leave protection, and status remain while invalid-import feedback appears.
17. Verify scene replacement prompts only for scene dirtiness, layout replacement prompts only for layout dirtiness, and navigation prompts for either.
18. Switch Scene/Camera and verify scene dirty/I/O/history behavior remains unchanged.
19. Open `/museum` separately and verify visitor render/camera behavior remains unchanged.

## Verification gate

```bash
npm run test -w @portfolio/museum -- --run \
  src/lib/editor/layout/layout-codec.test.ts \
  src/lib/editor/layout/layout-validation.test.ts \
  src/lib/editor/layout/layout-interaction.test.ts \
  src/lib/editor/layout/layout-preview-state.test.ts \
  src/lib/editor/layout/layout-mesh-factory.test.ts \
  src/lib/editor/layout/layout-preview-bounds.test.ts \
  src/lib/editor/layout/layout-object-editing.test.ts \
  src/lib/editor/museum-editor-shell.test.ts \
  src/lib/editor/museum-editor-camera.test.ts
npm run check -w @portfolio/museum
npm test
npm run build
```

Existing baseline diagnostics remain acceptable only if A4 adds none. Confirm `/museum` visitor chunks do not import editor/layout modules.

## Documentation after implementation

- Mark A4 implemented in the parent foundation plan.
- Update [`../hand-off/CURRENT.md`](../hand-off/CURRENT.md) with shipped slice, verification, and next slice.
- Update [`../components/shell.md`](../components/shell.md) with Layout Project menu and status behavior.
- Update [`../components/placement.md`](../components/placement.md) with layout object ghost/Plan drag and gizmos deferred.
- Update [`../components/persistence.md`](../components/persistence.md) with layout baseline/status, object transform semantics, and independent scene/layout dirty state.
- Keep `/museum`, scene contracts, and camera docs unchanged unless implementation exposes a real regression.
