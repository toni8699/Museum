# Layout CAD Foundation — Implementation Plan

> **North star:** [`../../museum-editor/north-star.md`](../../museum-editor/north-star.md)  
> **Goal alignment review:** [`../reviews/2026-08-10-layout-cad-foundation-goal-alignment.md`](../reviews/2026-08-10-layout-cad-foundation-goal-alignment.md)  
> **Design:** [`../specs/2026-08-10-layout-cad-foundation-design.md`](../specs/2026-08-10-layout-cad-foundation-design.md)  
> **Authority:** Active P0 implementation plan (supersedes full-track Phase 2 as *next* work).

## Goal

Foundation for a **layout-first, serializable museum complex**:

- blank-canvas room drafting (rectangle / polygon; later Bezier);
- generated floor, ceiling, walls; semantic doors/windows/arches;
- parametric placeholder objects (not free mesh);
- plan/3D editing; undoable cancel-safe edits;
- standalone layout JSON **and** a project envelope (layout + scene);
- **Chopin migration path:** compile `rooms.ts` → layout, dual-read runtime, cutover.

Current `/museum` stays on `rooms.ts` until Track B dual-read is explicitly enabled.

## Global constraints

- Layout data lives in a versioned **editor layout document**; projects combine layout + scene.
- Do not change visitor behavior until **B4** flag says so.
- Do not replace `rooms.ts` until **B5** cutover.
- No real-time CSG, arbitrary mesh editing, or second camera/path system.
- Reuse selection, transform, placement ghost, history, and editor facade patterns.
- Pure geometry helpers free of Svelte/editor state where possible.
- Stable IDs for rooms, segments, openings, objects.
- **History:** single undo stack; ops tagged `layout` | `scene`; dirty flags may be per document.
- **Viewport:** Layout mode vs Museum mode (selection mutex); document before plan UX ships.
- Rectangle **click-drag** allowed in plan tools only; object place stays click → ghost → commit.
- Update durable docs when contracts land (`docs/museum-editor/*`, editor README).
- No commits unless explicitly requested.

## Track map (incremental)

```text
A0 codec → B0 Chopin compile fixture → A1 line rooms+preview
  → C0 project envelope → A2 plan UX → B1 load Chopin in editor
  → A3/A4 Bezier/arches/objects/I/O → B3 relocate → B4 dual-read → B5 cutover
```

Ship **A1 before A3**. Do not start Bezier/arches until A1 acceptance passes.

---

## Track A — Layout CAD drafting

### Task A0 — Layout types and codec

**Create:** `layout-types.ts`, `layout-codec.ts`, `layout-codec.test.ts` under `apps/museum/src/lib/editor/layout/`.

**Implement:** `LayoutDocument`, floors/rooms, line/Bezier segments, openings, objects (`plane` included); `formatVersion: 1`, `units: 'meters'`; validate; canonicalize; deep-clone; openings use `segmentId`.

**Tests:** blank doc; rectangle/L/triangle/Bezier fixtures; opening round-trip; reject bad version/units/IDs/non-finite; deterministic export; import does not mutate input.

### Task A1 — Line rooms, validation, mesh preview, history stub *(first vertical slice)*

**Create:** `draft-geometry.ts`, `layout-validation.ts`, `layout-mesh-factory.ts`, `LayoutPreview.svelte`, store/mutator stubs, focused tests.

**Implement:**

1. Line-segment evaluation, closed-path / zero-length / self-intersection checks.
2. Opening bounds on **line** segments; gap walls without CSG (rect openings only).
3. Floor/ceiling from closed polygon; straight wall prisms.
4. Layout document store + atomic create/update/delete room; begin/commit/cancel; no-op skips history.
5. Preview in editor only; last valid preview retained when draft invalid.
6. Mesh factory editor-local (extract shared module only at promotion).

**Acceptance:** draw/commit rectangle + L via API or minimal UI; undo once; export layout JSON; `/museum` unchanged.

**Defer to A3:** Bezier sampling, pointed/rounded arches, measure tool polish.

### Task A2 — Plan workspace and drafting interaction

**Create:** `EditorPlanViewport.svelte`, `LayoutDraftHelpers.svelte`, `layout-interaction.ts`.

**Modify:** viewport toolbar, shortcuts, selection integration.

**Implement:** Plan/3D switch; tools Select / Room / Wall-Path / Door / Window / Object / Snap; rectangle click-drag; polygon click + close; Esc / Backspace; grid + angle snap; hit-test; mutator-only commits; Layout vs Museum mode mutex.

**Tests:** tool FSM; Esc/Backspace; one Bezier-handle drag = one history entry (when A3 exists); invalid close blocked; mode switch preserves layout selection.

### Task A3 — Bezier walls and arch profiles

Extend geometry, validation, mesh factory, inspectors for Bezier segments and `rounded` | `pointed` openings. Adaptive/bounded sampling. Opening distance-along-curve.

### Task A4 — Objects, inspectors, layout I/O UI

Layout object placement via existing ghost flow; room/wall/opening/object inspectors; Project menu: Import/Copy/Download/Reset **Layout** (scene actions unchanged); blank/dirty/imported/invalid status.

---

## Track B — Chopin migration & runtime

### Task B0 — `rooms.ts` → `LayoutDocument` compiler *(immediately after A0)*

**Create:** `rooms-to-layout.ts` (+ tests) under editor layout or `lib/content/migration/`.

**Implement:** Deterministic compile of current `museumRooms` into a layout fixture (stable room ids, approximate rectangle boundaries from dimensions/poses, openings mapped to segment sides). Document known fidelity limits (yawed rooms, sightlines).

**Tests:** golden snapshot of Chopin compile; idempotent canonicalize; every room id present; opening count ≥ door openings.

### Task B1 — Load Chopin layout in editor

Import compiled fixture / “Load Chopin layout” action. Preview without writing `rooms.ts`. Selection/picking policy vs live museum shell documented and tested.

### Task B3 — Room-unit relocate

Select room → move/rotate entire boundary + openings + child layout objects as one transaction. Undo-safe. Openings keep `segmentId`.

### Task B4 — Runtime dual-read

`architectureSource: 'rooms.ts' | 'layout'` (project or feature flag). Visitor/editor shell resolution can read layout when flagged. Default Chopin remains `rooms.ts`. Parity checklist vs current `/museum` before enabling.

**Tests:** flag off = byte-compatible shell path; flag on = layout-backed shell for fixture project; no editor UI in visitor chunks.

### Task B5 — Cutover

Chopin ships as serialized project (layout + scene). `rooms.ts` deprecated or generated from layout. Tour camera continues on shared motion; room ids stable across compile.

---

## Track C — Project envelope

### Task C0 — `MuseumProject` codec *(after A0, ideally with B0)*

**Create:** project types/codec: `{ formatVersion, id, name, layout, scene }`.

**Tests:** round-trip Chopin-sized fixture (compiled layout + current scene JSON); reject partial/invalid; scene v6 still validates via existing codec.

### Task C1 — Editor open/export project

Open/export project (folder or zip). Per-part dirty optional; single undo stack retained. Layout-only and scene-only actions remain available.

### Task C2 — Visitor loads project when flagged

Wire B4 to project load path. Production still 404s editor.

---

## Verification

After each task:

```bash
npm run test -w @portfolio/museum -- --run <focused>
npm run check -w @portfolio/museum
```

End of A1 and each B/C gate: `npm run build` + visitor chunk grep for layout/editor symbols.

### Manual acceptance (A1)

1. Blank layout in `/dev/museum-editor`.
2. Create rectangle + L room (API or plan UI).
3. Add rectangular door; see gap in preview.
4. Undo/redo; export layout JSON; reset; re-import.
5. Confirm `/museum` and camera unchanged.

### Manual acceptance (B1+)

1. Load Chopin compiled layout; rooms visible in layout preview.
2. Relocate one room (B3); openings follow.
3. Dual-read flag on fixture project (B4); walk `/museum` parity checklist.
4. Cutover dry-run (B5) on branch only.

## Completion criteria (foundation = through A2 + B0 + C0 minimum)

- A0–A2, B0, C0 merged with tests green.
- Chopin golden layout fixture checked in or generated in tests.
- Visitor default path unchanged.
- Durable docs + north star reflect Mode B migration.
- Full-track Phase 2 not blocking this work.

**Foundation complete for “start drafting + prove Chopin is data”** at A2+B0+C0.  
**Product north star complete** only after B4/B5.

## Related scrubbed plans

- Full-track Phase 2 dressing presets: **deferred optional** — [`2026-08-09-museum-editor-full-track.md`](./2026-08-09-museum-editor-full-track.md)
- Full-track Phase 3 GLB: **after** layout-backed complex loadable (post B4 preferred)
