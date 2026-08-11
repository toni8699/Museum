# A3 — Bezier Walls and Arch Profiles

**Date:** 2026-08-11  
**Status:** Implemented  
**Parent plan:** [`2026-08-10-layout-cad-foundation.md`](./2026-08-10-layout-cad-foundation.md)  
**Handoff:** [`../hand-off/CURRENT.md`](../hand-off/CURRENT.md)  
**Prerequisites:** A0, B0, A1, C0, A2, A2.1, A2.2, A2.3

## Goal

Extend layout CAD from line-only rooms to curved wall paths and semantic arch profiles while preserving serialized geometry and meter-based opening offsets. A3 owns Plan-mode curve authoring and 3D curved preview; 3D handle editing stays out of scope.

```text
DraftPath with Bezier segments
  → validate curve + openings
  → adaptive sample / arc-length map
  → generate curved floor, ceiling, wall, and opening preview data
  → edit handles and opening profiles in Plan; preview result in 3D
```

A3 remains editor-only. `/museum` remains on `rooms.ts`; no runtime layout loading or camera changes land here.

## Scope

### Bezier wall geometry

- Accept closed paths containing `line` and `bezier` segments.
- Evaluate cubic Bezier points and tangents in layout X/Z coordinates.
- Build adaptive samples from geometric error and segment length limits.
- Build an arc-length lookup so `LayoutOpening.offset` remains meters from segment start.
- Provide point-at-distance, tangent-at-distance, and normal-at-distance helpers.
- Preserve stable segment IDs; sample density never becomes persisted meaning.

### Validation

Replace A1's `bezier-deferred` result with curve-aware validation:

- finite start, end, `handleOut`, and `handleIn` values;
- endpoint continuity between every adjacent segment;
- non-zero effective curve length;
- degenerate handles reported as warnings only when curve remains valid, errors when length or tangent is unusable;
- sampled self-intersection detection with target IDs and deterministic tolerance;
- opening offset/width inside arc length;
- opening overlap checks using meter intervals;
- sill plus height not above floor height;
- rounded/pointed profiles only where their dimensions can produce valid geometry.

Validation must fail closed for commit. Invalid drafts retain the last valid preview, matching A2.3 behavior.

### Arch profiles

Profiles remain enum-only; no schema migration or profile parameters land in A3. Derive every elevation profile from opening `width`, `height`, and `sillHeight`:

- `rectangular`: existing vertical side/lintel behavior.
- `rounded`: semicircle radius `width / 2`, centered at `[width / 2, height - width / 2]`; arc endpoints are `[0, height - width / 2]` and `[width, height - width / 2]`; rise is `width / 2`; vertical side height is `height - rise`. Reject when `width <= epsilon`, `height <= epsilon`, or `rise > height + epsilon` with `arch_profile_width_invalid`, `arch_profile_height_invalid`, or `rounded_arch_rise_exceeds_height`.
- `pointed`: vertical sides meet spring points `[0, height - width / 2]` and `[width, height - width / 2]`; two straight symmetric edges meet at apex `[width / 2, height]`. Rise is `width / 2`; reject when `width <= epsilon`, `height <= epsilon`, or `rise > height + epsilon` with `arch_profile_width_invalid`, `arch_profile_height_invalid`, or `pointed_arch_rise_exceeds_height`.

Profile generation returns pure section/profile data; no Three or Svelte imports in geometry modules. Opening assets, frames, trims, and materials remain deferred.

### Preview

Extend `LayoutPreviewModel` with explicit sampled path data; do not pass a Bezier chord to the A2 adapter:

- each wall exposes ordered samples containing `point`, cumulative `distance`, `tangent`, and `normal`;
- floor and ceiling boundaries use sampled room paths;
- wall sections carry opening IDs, meter intervals, and vertical profile data;
- arch profile data contains deterministic 2D elevation points for rectangular, rounded, and pointed shapes;
- `LayoutPreviewScene.svelte` rewrites wall/floor/ceiling preview geometry from samples and normals, including curved wall strips and profile lintels;
- line segments retain existing output values and expose a normalized two-sample path `[start, end]`;
- compatibility means legacy fields (`segmentId`, `start`, `end`, `height`, `thickness`, `sections`) equal prior A2 output; new `samples` is excluded from legacy equality and must not require whole-object snapshot equality;
- sampling constants are fixed in A3.1 for deterministic tests and stable visual output.

Do not persist generated vertices, sampled endpoints, normals, or mesh topology.

### Editor interaction

> **Superseded by A3.1** ([`2026-08-11-layout-cad-a3-1-camera-style-bend.md`](./2026-08-11-layout-cad-a3-1-camera-style-bend.md)): no Bezier room drafting, no Convert-to-Bezier, no authored `handleOut`/`handleIn` gizmos. Walls use `line` | `auto-bezier` with camera-style interior anchors; mid-span grab bends; Finish Bezier room removed. Hit priority: vertex → interior anchor → opening → wall → room. Plan opening drag adjusts offset.

Historical A3 intent (kept for archaeology only):

- Add Bezier insert to active room drafting: click first anchor, click second anchor to complete one segment, then edit its handles; segment completion never closes the room.
- Room close remains a separate action: click the first anchor or press Finish only after the active segment is complete and the path has at least three segments; committed segments remain editable in preview state.
- Allow Convert-to-Bezier for a selected line wall; initialize handles on the line midpoint with no shape change.
- Do not add a separate new-curve-room mode; existing rectangle/polygon room creation remains authoritative.
- Escape cancels the active handle or incomplete segment; Backspace removes the last incomplete anchor or completed segment before room close; invalid close remains blocked.
- Support handle placement and drag editing for selected curve segments in Plan mode only. 3D view shows the generated result but has no handle editing.
- Draw selected curves as sampled polylines plus control polygon/handles; curve hit testing uses those samples and `LAYOUT_PLAN_HIT_RADIUS_PX` only, projected from pixels into layout meters.
- Allow Door/Window tools to hit line or Bezier walls.
- Add profile selection/editing for selected openings, with numeric validation messages and default `rectangular` on new openings.
- Keep existing hit priority: vertex → opening → wall → room.
- Keep Layout vs Museum workspace mutex.
- Mutations stay in layout preview state only; do not touch `MuseumEditorStore`, shared history, scene data, persistence, or undo/redo.

## Non-goals

- Portal adjacency or `connectsRoomIds`: B4.
- Runtime dual-read or `rooms.ts` migration: B4.
- Serialized project persistence UI: A4/C1.
- GLB import, opening frames, trims, and final artwork.
- Boolean CSG, free-mesh editing, sculpting, or UV authoring.
- Multiple floors or stacked rooms.
- Camera collision, auto-tour generation, or a second motion system.
- Curved opening plan footprints or exact CSG wall topology. A3 openings attach to Bezier segments by arc-length interval; profile curvature exists only in the wall elevation.

## Proposed implementation slices

### A3.1 — Pure curve geometry

Create focused pure helpers, likely alongside `draft-geometry.ts` or in a dedicated curve module:

- cubic evaluation;
- derivative/tangent;
- adaptive sampling;
- cumulative arc-length table;
- distance lookup;
- curve self-intersection support;
- curve opening intervals and wall sections.

Lock constants in this slice and use them everywhere: endpoint/geometry epsilon `1e-6 m`, flatness tolerance `0.01 m`, maximum sample span `0.25 m`, self-intersection tolerance `1e-4 m`, and Plan hit radius `12 px` via existing `LAYOUT_PLAN_HIT_RADIUS_PX`. Export curve constants for tests; A3.5 must not redefine them.

Add fixtures for a straight-equivalent Bezier, bowed wall, S-curve, mixed line/Bezier room, invalid curves, and each arch profile.

### A3.2 — Validation and preview model

- Update `layout-validation.ts` to validate mixed paths.
- Update `layout-mesh-factory.ts` to consume line and curve preview data.
- Keep line fixture output unchanged where possible.
- Add deterministic curved room and arch preview snapshots/data assertions.
- Preserve omission of invalid rooms and issue reporting.

### A3.3 — Three preview adapter

Rewrite the existing `LayoutPreviewScene.svelte` adapter contract instead of feeding Bezier chords into A2's `BoxGeometry` path:

- Render sampled curved floor/ceiling boundaries.
- Render wall strips following sampled centerline and normals, with opening intervals split along cumulative distance.
- Render rectangular, rounded, and pointed opening gaps/lintels from explicit arch section points.
- Verify winding, floor elevation, ceiling visibility, and wall thickness in both Plan and 3D views.
- Keep rendering adapter outside pure geometry modules.
- Preserve A2.3 legacy line-room fields and default rectangular openings bit-identically; compare only the documented legacy fields, plus a separate normalized `[start, end]` sample assertion.

### A3.4 — Plan authoring and inspectors

- Add Curve/Bezier insert and Convert-to-Bezier actions with the draft rules above.
- Add control-handle editing with cancel-safe preview-state behavior.
- Extend wall/opening hit testing to sampled curves using `1e-4 m` only for self-intersection checks and existing `LAYOUT_PLAN_HIT_RADIUS_PX` (`12 px`, projected by scale) only for Plan hit testing.
- Extend `layout-opening-editing.ts` and opening inspector state for profile selection and derived arch validation.
- Render sampled curve polylines in Plan; chord-only rendering does not meet A3 acceptance.
- Confirm existing rectangle/polygon/line-room workflows remain unchanged.

### A3.5 — Documentation and gate

Update matching layout/editor component docs plus `CURRENT.md`. Record:

- sampling tolerance and maximum segment length;
- arc-length approximation limits;
- self-intersection tolerance;
- arch profile equations/parameters;
- any wall-thickness approximation.

## Suggested files

Likely pure modules/tests:

```text
apps/museum/src/lib/editor/layout/curve-geometry.ts
apps/museum/src/lib/editor/layout/curve-geometry.test.ts
apps/museum/src/lib/editor/layout/arch-profile.ts
apps/museum/src/lib/editor/layout/arch-profile.test.ts
```

Likely existing modules to extend:

```text
apps/museum/src/lib/editor/layout/draft-geometry.ts
apps/museum/src/lib/editor/layout/layout-validation.ts
apps/museum/src/lib/editor/layout/layout-mesh-factory.ts
apps/museum/src/lib/editor/layout/layout-preview-geometry.ts
apps/museum/src/lib/editor/layout/LayoutPlanViewport.svelte
apps/museum/src/lib/editor/layout/layout-interaction.ts
apps/museum/src/lib/editor/layout/layout-preview-state.svelte.ts
apps/museum/src/lib/editor/layout/LayoutPreviewScene.svelte
apps/museum/src/lib/editor/layout/layout-opening-editing.ts
```

Avoid modifying visitor runtime files unless a type-only boundary requires it.

## Tests

Pure geometry:

1. cubic endpoints and derivative values;
2. adaptive sampling is finite, ordered, and deterministic;
3. straight-equivalent Bezier matches line length within tolerance;
4. bowed curve length exceeds its chord;
5. point/tangent/normal lookup at start, middle, and end;
6. opening offset uses arc length, not sample index;
7. mixed line/Bezier path continuity;
8. degenerate and non-finite curve rejection;
9. curve self-intersection detection;
10. rectangular, rounded, and pointed arch profile data;
11. rounded width `2 m` / height `0.9 m` rejects because rise `1 m` exceeds height;
12. pointed width `2 m` / height `0.9 m` rejects with `pointed_arch_rise_exceeds_height`;
13. opening bounds and overlap validation;
14. no input document mutation.

Preview/editor:

1. curved floor/ceiling preview output;
2. curved wall sections around openings;
3. opening lintel profile output;
4. invalid room omitted while valid rooms remain;
5. curve wall hit testing;
6. handle drag commit/cancel;
7. opening selection and profile editing;
8. existing A2.1–A2.3 interaction regressions;
9. completing a Bezier segment leaves room draft open and room close is blocked while a segment is incomplete;
10. Convert-to-Bezier preserves line geometry and initializes handles without changing endpoints;
11. Escape cancels active handle/incomplete-segment drafts and Backspace removes the last incomplete anchor or completed segment;
12. Plan renders sampled curve polylines rather than chords;
13. visitor shell/camera regression set;
14. A2.3 legacy wall fields remain bit-identical, line samples normalize to `[start, end]`, and new openings default to `rectangular`.

## Verification gate

```bash
npm run test -w @portfolio/museum -- --run \
  src/lib/editor/layout/curve-geometry.test.ts \
  src/lib/editor/layout/arch-profile.test.ts \
  src/lib/editor/layout/layout-validation.test.ts \
  src/lib/editor/layout/layout-mesh-factory.test.ts \
  src/lib/editor/layout/layout-interaction.test.ts \
  src/lib/editor/layout/layout-preview-state.test.ts \
  src/lib/editor/layout/layout-opening-editing.test.ts
npm run check
npm run test
npm run build
```

Acceptance:

- Bezier rooms validate and preview in editor.
- Openings remain stable under sampling changes.
- All three profiles produce deterministic preview data.
- Invalid drafts cannot commit and preserve last valid preview.
- Completing a Bezier segment does not close its room; close/Finish accepts only complete segments.
- Convert-to-Bezier preserves endpoints and line geometry.
- Escape and Backspace cancel/remove drafts according to the documented interaction state.
- Existing line-room, rectangle, polygon, opening, and scale workflows stay green.
- A2.3 rectangular preview legacy fields remain bit-identical; line samples normalize to `[start, end]`; newly created openings default to `rectangular`.
- Full suite remains green.
- `npm run check` retains only known baseline diagnostics, with no A3 additions.
- Museum build passes.
- `/museum` remains unchanged and production editor isolation remains intact.

## Exit and next phase

A3 exits when pure curve contracts, sampled preview generation, Plan-only editor authoring, and regression gates pass. Then begin **A4 — objects, inspectors, and layout I/O UI**. **B1 — Chopin layout loading** remains a separate follow-up slice. Do not begin B4 dual-read until A4 and B1 parity evidence exists.
