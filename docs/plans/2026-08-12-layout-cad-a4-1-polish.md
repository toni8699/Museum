# A4.1 — Layout Authoring Polish

**Date:** 2026-08-12  
**Status:** Implemented — focused/full tests, typecheck, and build passed; latest Plan framing/sphere floor fixes verified; manual browser QA pending
**Parent:** [`2026-08-11-layout-cad-a4-objects-inspectors-io.md`](./2026-08-11-layout-cad-a4-objects-inspectors-io.md)  
**Handoff:** [`../hand-off/CURRENT.md`](../hand-off/CURRENT.md)  
**Contracts:** [`../components/placement.md`](../components/placement.md) · [`../components/shell.md`](../components/shell.md)

## Goal

Polish the shipped A4 layout workflow around the actual authoring tasks:

```text
Top bar = view + room drafting + view options
Right sidebar = place + object list + selected-item inspector
Primitive tool = direct Plan gesture + tool-specific footprint ghost
Select = snapped Plan movement + contextual inspection
```

A4.1 changes editor interaction and presentation only. It does not change `LayoutDocument`, layout JSON, visitor runtime, scene history, or the `rooms.ts` architecture boundary.

## Locked product decisions

### Top bar

The Layout top bar contains, in this order:

```text
Plan | 3D · Select · Rect room · Polygon room · Snap / Grid (Plan) or Ceiling (3D)
```

- Rename `Rectangle` to `Rect room` and `Polygon` to `Polygon room`.
- Remove Door, Window, and Object from the top bar.
- Remove the object-kind dropdown.
- Keep the existing Plan/3D mode switch, Select behavior, Plan Snap/Grid toggles, and 3D Ceiling toggle.
- Snap remains explicitly `0.25 m`; Grid remains independently toggleable.
- A pending placement or draft still exposes the existing cancel/Escape behavior without adding another persistent tool group.

### Right sidebar

In the Layout workspace, replace the monolithic inspector presentation with three accordion sections in this order:

1. **Place** — Door · Window · Box · Cylinder · Sphere
2. **Objects** — object list with select and delete actions
3. **Selection** — contextual inspector for the current room, vertex/wall, opening, or object selection

Accordion state is session-only UI state. It is not serialized and does not enter layout or scene history.

The existing layout source/status/counts, import error, mutation error, and geometry-warning feedback remain visible in the right sidebar without being mistaken for selected-item fields.

### Place tools

- Door and Window retain their existing opening-authoring behavior; moving them only changes where the tools are armed.
- Box, Cylinder, and Sphere are distinct tools/buttons. There is no generic Object tool or kind picker in the UI.
- Primitive object placement is Plan-only. In 3D, Box/Cylinder/Sphere cannot be armed or committed; existing objects may still render in the 3D preview.
- Drop Plane from all authoring UI. Do not delete `plane` from the schema or codec; imported plane data must continue to parse, serialize, render, select, and round-trip.
- Do not add polygon/profile object authoring. Existing codec compatibility for imported `profile` objects remains unchanged and read-only.
- Switching tool or view cancels any uncommitted primitive gesture without a document write.
- A successful placement commits exactly one object, selects it, and returns to Select.

## Primitive Plan gestures

Object creation uses the same pointer-capture shape as room rectangle drafting, with no intermediate kind dropdown:

### Box

```text
pointer-down = first rectangle corner
pointer-move = opposite corner + rectangular footprint ghost
pointer-up = commit centered box footprint
```

- X/Z dimensions come from the dragged rectangle.
- Y dimension defaults to `1.0 m`.
- The committed position is the rectangle center at `floor.elevation + 0.5 m`.

### Cylinder

```text
pointer-down = center
pointer-move = radius + circular footprint ghost
pointer-up = commit cylinder
```

- Radius is the Plan distance from the center to the current pointer.
- X/Z dimensions are the full diameter.
- Y dimension defaults to `1.0 m`.

### Sphere

```text
pointer-down = center
pointer-move = radius + circular footprint ghost
pointer-up = commit sphere
```

- Radius is the Plan distance from the center to the current pointer.
- X/Z dimensions are the full diameter.
- Y dimension defaults to `1.0 m` and remains independently editable, so the stored primitive may be vertically non-uniform.

### Shared gesture rules

- Resolve placement only against a room on `floors[0]`, matching existing Plan policy.
- Assign `roomId` from the resolved room and center Y from that floor's elevation plus half the object height.
- When Snap is enabled, snap the gesture points to the existing `0.25 m` Plan grid before deriving center, radius, or dimensions.
- A zero-size or otherwise invalid gesture commits nothing and preserves the last valid document/model.
- Escape, pointer cancel, tool change, or view change discards only transient gesture state.
- Pointer movement and ghost rendering never change canonical layout JSON, dirty state, preview model, or bounds.
- Pointer-up performs one validated preview-state mutation.
- Plan viewport framing remains stable after ordinary edits and reframes only after import/reset/Reload Chopin. Stored Sphere position/dimensions drive rendering and bounds exactly; the default 1 m height rests on the assigned floor and may produce a spheroid.

## Ghost contract

Each primitive tool owns one footprint-style Plan preview:

| Tool | Ghost |
|------|-------|
| Box | dragged rectangle footprint |
| Cylinder | dragged circular footprint |
| Sphere | dragged circular footprint, visually distinct from Cylinder |

- Do not show a generic primitive AABB ghost or a kind selector.
- The ghost communicates valid/invalid placement using the existing layout valid/invalid styling.
- The ghost is derived entirely from transient gesture state and is never serialized.
- No 3D object-placement ghost is required because primitive placement is Plan-only.

## Objects accordion

- List every layout object in stable document/render order.
- Each row shows a concise kind label and stable ID.
- Clicking a row selects the object and switches the active tool to Select.
- Each authored object row has a direct Delete action.
- Delete removes only that object, clears its selection when selected, and uses the existing validated layout mutation path.
- Imported read-only profile rows remain non-deletable under the existing A4 compatibility rule.
- Plane/profile are compatibility entries, not Place tools; do not add authoring controls for them.
- Keep list selection synchronized with Plan selection and the Selection accordion. Three-dimensional selection/editing is deferred to the unified layout/scene editing milestone.

## Selection accordion

Render the inspector for whatever is currently selected, preserving the existing room, wall/interior-anchor, and opening fields and validation.

For authored Box/Cylinder/Sphere objects:

- display stable ID and kind read-only;
- do not expose Position X/Y/Z;
- X/Z position changes through Plan drag only;
- expose `Height (m)`, defaulting to `1.0` on new placement;
- expose `Width (m)` and `Depth (m)` for Box;
- expose `Radius (m)` and `Height (m)` for Cylinder and Sphere, mapping radius to equal X/Z half-extents;
- preserve optional room ownership as display-only metadata during A4.1; Plan drag does not reassign `roomId`;
- keep numeric edits fail-closed through the existing layout mutation/validation path;
- keep Delete available either here or through the Objects row without creating a second deletion implementation.

Do not expose raw rotation or dimension vectors as the primary A4.1 object UI. Existing serialized rotation and unsupported imported dimensions remain data-compatible and round-trip unchanged unless an explicitly supported field is edited.

Imported plane/profile objects use a compatibility inspector: stable ID, kind, stored dimensions/transform, and room metadata may be displayed, but no new authoring affordance is added.

## Select and snapping

The existing Select tool remains the only movement tool.

- Object Plan drag continues to change X/Z only and preserves Y, rotation, dimensions, and `roomId`.
- Room move and vertex move must both snap their candidate Plan coordinates to `0.25 m` when Snap is enabled.
- With Snap disabled, room, vertex, and object movement retain unsnapped Plan coordinates.
- Snapping applies to the transient candidate before preview and to the final pointer-up commit, so the preview cannot disagree with the stored result.
- Keep the existing one-mutation-on-pointer-up and Escape rollback behavior.

## State and implementation shape

Replace generic pending-object selection with explicit transient primitive drafting state. Conceptually:

```ts
type LayoutPlaceTool = 'door' | 'window' | 'box' | 'cylinder' | 'sphere';

type LayoutPrimitiveDraft =
  | { kind: 'box'; start: LayoutVec2; current: LayoutVec2; roomId?: string; valid: boolean }
  | { kind: 'cylinder' | 'sphere'; center: LayoutVec2; current: LayoutVec2; roomId?: string; valid: boolean };
```

This type is illustrative; reuse `LayoutInteractionState` and existing Plan transforms rather than creating a parallel placement controller.

Required behavior boundaries:

- `LayoutDocument.objects` remains the only persisted object source.
- `layout-object-editing.ts` remains the pure object construction/patch/delete/footprint helper boundary.
- `layout-preview-state.svelte.ts` remains the only layout mutation/status/baseline owner.
- Do not use scene `pendingPlacement*`, scene history, Three gizmos, or camera motion.
- Remove or retire the layout-local 3D primitive commit path from UI reach; do not create a second Plan placement system.

## Expected files

Primary changes:

```text
apps/museum/src/lib/editor/layout/LayoutDraftToolbar.svelte
apps/museum/src/lib/editor/EditorInspector.svelte
apps/museum/src/lib/editor/layout/LayoutPlanViewport.svelte
apps/museum/src/lib/editor/layout/layout-interaction.ts
apps/museum/src/lib/editor/layout/layout-object-editing.ts
```

Likely supporting changes:

```text
apps/museum/src/lib/editor/layout/LayoutPreviewScene.svelte
apps/museum/src/lib/editor/layout/LayoutInteraction3D.svelte
apps/museum/src/lib/editor/layout/layout-interaction.test.ts
apps/museum/src/lib/editor/layout/layout-object-editing.test.ts
apps/museum/src/lib/editor/layout/layout-preview-state.test.ts
apps/museum/src/lib/editor/museum-editor-shell.test.ts
```

Extract a small Layout right-sidebar component only if it materially reduces `EditorInspector.svelte`; do not create a new store or document owner.

## Implementation sequence

1. Refactor layout interaction state from generic Object + kind dropdown to explicit Box/Cylinder/Sphere tools and transient drag geometry.
2. Add pure box/radius-to-object helpers with `1.0 m` default height and existing stable ID/validation rules.
3. Implement Plan pointer-down/move/up primitive gestures and tool-specific footprint ghosts.
4. Reduce the top bar to the locked controls and remove layout primitive placement reachability from 3D.
5. Build the right-sidebar Place, Objects, and Selection accordions; wire them to the existing tool, selection, and mutation owners.
6. Replace raw object Position XYZ/vector editing with contextual dimensions while preserving codec compatibility.
7. Ensure room, vertex, and object transient/final movement use the same `0.25 m` snap policy.
8. Add focused interaction, UI, compatibility, and regression tests; then update the placement/shell contracts and handoff after implementation.

## Tests

### Toolbar and sidebar

1. Top bar exposes only Plan/3D, Select, Rect room, Polygon room, and the mode-specific options.
2. Door, Window, Box, Cylinder, Sphere, Object, Plane, and the kind dropdown are absent from the top bar.
3. Right sidebar renders Place, Objects, and Selection accordions in locked order.
4. Place exposes Door/Window/Box/Cylinder/Sphere and no Plane/Profile/generic Object control.
5. Box/Cylinder/Sphere cannot arm or commit while in 3D.
6. Accordion open state does not mutate either document or dirty state.

### Primitive gestures

7. Box drag derives center plus X/Z extents and commits Y extent `1.0 m`.
8. Cylinder drag derives radius, equal X/Z diameters, and Y extent `1.0 m`.
9. Sphere drag derives radius, equal X/Z diameters, and Y extent `1.0 m`.
10. Each tool renders its own footprint ghost with no kind dropdown.
11. Ghost movement leaves canonical JSON/status/model/bounds unchanged.
12. Valid pointer-up commits exactly one object with stable ID, resolved `roomId`, and correct floor-relative Y.
13. Zero-size/invalid gestures and Escape/pointer cancel/tool/view changes commit nothing.
14. Snap-enabled gesture points use `0.25 m`; Snap-disabled gestures preserve unsnapped values.

### Objects and selection

15. Object list order is stable; row selection synchronizes Plan selection and Selection inspector; 3D selection remains deferred.
16. Row Delete removes only the targeted authored object and clears matching selection.
17. Selection shows contextual inspector content for room, wall/anchor, opening, and object selections.
18. Authored objects expose no Position X/Y/Z fields.
19. Box Width/Depth/Height edits map to dimensions and fail closed on invalid values.
20. Cylinder/Sphere Radius edits keep X/Z diameters equal; Height edits only Y.
21. Plan object drag changes only X/Z and preserves Y/rotation/dimensions/`roomId`.
22. Plane/profile remain codec-compatible, renderable, selectable compatibility objects with no Place tool.

### Room/vertex snap and regression

23. Snap-enabled whole-room movement produces `0.25 m` coordinates for every moved vertex.
24. Snap-enabled vertex movement produces a `0.25 m` coordinate and revalidates openings/geometry.
25. Snap-disabled room/vertex movement remains unsnapped.
26. Door/Window placement behavior is unchanged after moving its controls to Place.
27. Layout import/export canonical JSON and independent dirty/baseline behavior are unchanged.
28. Scene workspaces, scene placement/history, `/museum`, `rooms.ts`, camera routing, and camera motion are unchanged.
29. No new check diagnostics or visitor-chunk editor imports.

## Manual verification

1. Open `/dev/museum-editor` → Layout and verify the locked top-bar order in Plan and 3D.
2. Verify the right sidebar has Place, Objects, and Selection accordions in order.
3. In Plan, place a Door and Window from Place and confirm existing opening behavior.
4. Drag-place Box, Cylinder, and Sphere; verify distinct footprint ghosts, `1.0 m` height, selection, and list rows.
5. Attempt primitive placement in 3D and verify it cannot arm or commit.
6. Select each object from the canvas and list; verify synchronized selection and no Position XYZ fields.
7. Edit Box dimensions and Cylinder/Sphere radius/height; verify invalid edits fail closed.
8. Drag an object in Plan with Snap on/off; verify only X/Z changes and ownership remains unchanged.
9. Move a room and one vertex with Snap enabled; verify all committed coordinates land on `0.25 m` increments.
10. Import JSON containing a plane and profile; verify round-trip compatibility without Place controls.
11. Verify layout status/I/O, Scene/Camera workspaces, and `/museum` behavior remain unchanged.

## Verification gate

```bash
npm run test -w @portfolio/museum -- --run \
  src/lib/editor/layout/layout-interaction.test.ts \
  src/lib/editor/layout/layout-object-editing.test.ts \
  src/lib/editor/layout/layout-preview-state.test.ts \
  src/lib/editor/museum-editor-shell.test.ts \
  src/lib/editor/museum-editor-camera.test.ts
npm run check -w @portfolio/museum
npm test
npm run build
```

Existing baseline diagnostics remain acceptable only if A4.1 adds none. Confirm `/museum` visitor chunks do not import editor/layout modules.

## Explicitly deferred

- Polygon-to-profile object authoring.
- Object Bezier/profile editing.
- 3D object gizmos or 3D object placement.
- 3D object selection/editing until the unified layout/scene editing milestone.
- Objects-follow-room behavior; that remains B3.
- Any second navigation graph, camera motion system, or visitor layout cutover.

## Documentation after implementation

- Mark this plan implemented and record focused/full verification.
- Update [`../hand-off/CURRENT.md`](../hand-off/CURRENT.md) with the shipped slice and next task.
- Update [`../components/shell.md`](../components/shell.md) with the locked top-bar/right-sidebar structure.
- Update [`../components/placement.md`](../components/placement.md) with Plan-only drag placement, footprint ghosts, and `0.25 m` room/vertex snapping.
- Keep persistence, visitor, scene, and camera contracts unchanged unless implementation reveals a real contract change.
- Future shell milestone: evaluate a unified left-side outliner for scene assets plus layout rooms/objects after B3 and before or alongside B4; A4.1 intentionally keeps layout objects in the right sidebar and keeps document ownership separate.
