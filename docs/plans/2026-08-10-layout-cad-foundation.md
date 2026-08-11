# Layout CAD Foundation

**Date:** 2026-08-10  
**Status:** Active P0 — design + implementation in this file  
**Authority:** Supersedes full-track Phase 2 as *next* work  
**Handoff:** [`../hand-off/CURRENT.md`](../hand-off/CURRENT.md)  
**Contracts:** [`../README.md`](../README.md) (routing) · [`../architecture.md`](../architecture.md) · [`../north-star.md`](../north-star.md)  
**Token rule:** implementers read **only** the Task section they are on + `architecture.md` if touching `rooms.ts`/layout boundary.

---

## 1. Goal

Foundation for a **layout-first, serializable museum complex**:

- blank-canvas room drafting (rectangle / polygon; later Bezier);
- generated floor, ceiling, walls; semantic doors/windows/arches;
- parametric placeholder objects (not free mesh);
- plan/3D editing; undoable cancel-safe edits;
- standalone layout JSON **and** project envelope (layout + scene);
- **Chopin migration:** compile `rooms.ts` → layout → dual-read → cutover.

`/museum` stays on `rooms.ts` until Track B dual-read is explicitly enabled.

---

## 2. Current boundary

Already have: `/dev/museum-editor`, placement/gizmos/ghost/history, package I/O, `rooms.ts` shell, scene v6, shared camera pipeline.

This phase = **editor-only layout mode**. Does not replace `rooms.ts`, change `/museum` shell, or alter v6 visitor scene until B4/B5.

```text
Editor project
  ├─ museum-scene.json v6   (entities + camera)
  └─ museum-layout.json     (floors / rooms / paths / openings / objects)
```

Layout document owns room/draft geometry. Generated Three meshes are previews — never serialized as raw topology.

---

## 3. Document model

```ts
type LayoutDocument = {
  formatVersion: 1;
  units: 'meters';
  floors: LayoutFloor[];
  objects: LayoutObject[];
};

type LayoutFloor = {
  id: string;
  name: string;
  elevation: number; // 0 for foundation floor
  height: number;
  rooms: LayoutRoom[];
};

type LayoutRoom = {
  id: string;
  name: string;
  boundary: DraftPath;
  wallThickness: number;
  floorThickness: number;
  ceilingThickness: number;
  openings: LayoutOpening[];
};

type DraftPath = { closed: true; segments: DraftSegment[] };

type DraftSegment =
  | { id: string; kind: 'line'; start: Vec2; end: Vec2 }
  | {
      id: string;
      kind: 'bezier';
      start: Vec2;
      handleOut: Vec2;
      handleIn: Vec2;
      end: Vec2;
    };

type LayoutOpening = {
  id: string;
  segmentId: string;
  kind: 'door' | 'window';
  offset: number; // meters along segment; never sample-index based
  width: number;
  height: number;
  sillHeight: number;
  profile: 'rectangular' | 'rounded' | 'pointed';
};

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

Openings attach to stable `segmentId`; `offset` is meters along the segment. Curve sampling is a mesh/picking approximation only; changing sample density must not change persisted opening meaning. Phase 1 edits **one** floor only (`floors[]` reserved for later).

**Opening semantics boundary:** A1 openings are geometry-only cutouts. Do not infer room adjacency from overlapping coordinates or shared walls. B4 introduces an explicit `connectsRoomIds: [string, string]` relation for portal/containment behavior. External windows remain unpaired.

**Profile rule:** A committed profile object requires a closed `DraftPath`; active wall/path drafts may remain open until closed and validated.

**Project envelope (C0):** `{ formatVersion, id, name, layout, scene }`.

---

## 4. Interaction & generation (design)

**Plan mode:** top-down, grid/snap, dims, path/opening tools.  
**3D mode:** generated room + layout object place (same document).

Room create: Rectangle (click-drag) · Polygon (click + close) · Curve wall (Bezier insert, A3). Esc cancel; Backspace last point; Shift angle; invalid close blocked.

Openings: snap to segment; drag along wall; resize; inspector exact dims; never silently deleted.

Objects: reuse ghost → commit; gizmos + dimension handles.

```text
LayoutDocument → validate → sample → floor/ceiling → wall strips → opening gaps → editor preview
```

No real-time CSG. Invalid drafts stay editable with warnings; last valid preview retained; commits blocked.

**Tools:** Select · Room · Wall/Path · Door · Window · Object · Measure · Snap.

**CAD vs Blender:** semantic params only; app owns topology. No vertex sculpt / UV / free CSG.

---

## 5. Global constraints

- Versioned layout doc; projects = layout + scene.
- No visitor behavior change until **B4**.
- No `rooms.ts` delete until **B5**.
- No second camera/path system.
- Reuse selection, transform, ghost, history, facade patterns.
- Pure geometry helpers free of Svelte where possible.
- Stable IDs for rooms, segments, openings, objects.
- **History:** single undo stack; ops tagged `layout` | `scene`.
- **Viewport:** Layout vs Museum mode selection mutex before plan UX.
- Rectangle click-drag OK in plan tools only.
- Update matching `docs/architecture.md` / `docs/components/*.md` / `docs/north-star.md` when contracts land; hub routing only if needed. Editor README if code map changes.
- No commits unless user asks.

---

## 6. Track map

```text
A0 codec → B0 Chopin compile fixture → A1 line rooms+preview
  → C0 project envelope → A2 editor preview → A2.1 plan UX → B1 load Chopin in editor
  → A3/A4 Bezier/arches/objects/I/O → B3 relocate → B4 dual-read → B5 cutover
```

Ship **A1 before A3**. Do not start Bezier/arches until A1 acceptance passes.

---

## 7. Track A — Layout CAD drafting

### A0 — Layout types and codec

Focused spec/plan: [`2026-08-10-layout-cad-a0-codec.md`](./2026-08-10-layout-cad-a0-codec.md).

**Create:** `layout-types.ts`, `layout-codec.ts`, `layout-codec.test.ts` under `apps/museum/src/lib/editor/layout/`.

**Implement:** public `LayoutDocument` model; `LayoutVec2` local type + existing `Vec3`; `validateLayoutDocument`, `parseLayoutDocumentJson`, `serializeLayoutDocument`, `createEmptyLayoutDocument`; structural validation; canonical JSON; typed issues/errors; stable IDs and `segmentId` openings.

**A0 boundary:** committed room/profile paths are closed; openings are geometry-only; `offset` is meters along segment; no `connectsRoomIds`, geometry sampling, self-intersection checks, Svelte, Three, history, or UI.

**Tests:** blank; rectangle/L/triangle/Bezier fixtures; two corridor cutouts; profile round-trip; reject bad version/units/keys/types/IDs/non-finite/non-positive/unclosed/missing segments; malformed JSON issue; deterministic export; input does not mutate.

**Gate:** focused codec tests + `npm run check`; no visitor or scene behavior changes.

### A1 — Line rooms, validation, preview model, transaction stub *(first vertical slice)*

Focused spec/plan: [`2026-08-10-layout-cad-a1-line-geometry.md`](./2026-08-10-layout-cad-a1-line-geometry.md).

**Implement:** pure line geometry; endpoint/zero-length/self-intersection validation; Bezier deferral issue; rectangular opening intervals/gaps/lintels; skinny corridor as ordinary `LayoutRoom` with two geometry-only cutouts; floor/ceiling/wall preview data; pure begin/commit/cancel transaction stub.

**UI boundary:** no editor viewport, toolbar, facade, shortcut, Plan/Museum mode, Svelte preview mount, shared Undo/Redo, layout I/O, or visitor changes. A2 owns first user-facing UI and consumes the A1 `LayoutPreviewModel`.

**Acceptance:** rectangle/L/corridor fixtures produce valid preview data; invalid geometry returns structured issues; one transaction commit/cancel works; A0/B0/full existing tests stay green; `/museum` and camera behavior unchanged.

**Defer to A3:** Bezier sampling, arches, and curve-handle polish.

### A2 — Layout preview in editor *(implemented)*

Focused spec/plan: [`2026-08-10-layout-cad-a2-editor-preview.md`](./2026-08-10-layout-cad-a2-editor-preview.md).

**Implement first:** Layout workspace; validated C0/B0 fixture preview; A1 model → Three adapter; generated floor/ceiling/wall/lintel geometry; existing editor camera framing; read-only source/status panel; scene-tool isolation.

**UI boundary:** A2 preview has no room selection, mutators, snapping, Plan view, drafting tools, layout history, or import/export. A2.1 owns first authoring interaction. A2 preview is implemented; visitor runtime remains unchanged.

### A2.1 — Plan workspace and drafting interaction *(implemented)*

**Create:** `LayoutPlanViewport.svelte`, `LayoutDraftToolbar.svelte`, `layout-interaction.ts`.

**Modify:** layout preview state and editor viewport/sidebar/inspector wiring.

**Implement:** Layout-local Plan/3D switch; Select/Rectangle/Polygon tools; rectangle pointer drag; polygon click-to-add with first-point or Finish close; Escape cancellation; validated layout-only room commits; draft source/status updates; Layout vs Museum mutex.

**Boundary:** grid rendering is present, but angle snapping, Backspace point removal, room selection/handles, openings, shared history, and persistence remain deferred. Draft commits are in-memory preview state only and never mutate scene data.

### A3 — Bezier walls and arch profiles

Extend geometry/validation/mesh/inspectors for Bezier + `rounded` | `pointed` openings. Adaptive sampling. Distance-along-curve openings.

### A4 — Objects, inspectors, layout I/O UI

Ghost place layout objects; room/wall/opening/object inspectors; Project menu Layout Import/Copy/Download/Reset; blank/dirty/imported/invalid status.

---

## 8. Track B — Chopin migration & runtime

### B0 — `rooms.ts` → `LayoutDocument` compiler *(right after A0)*

**Create:** `rooms-to-layout.ts` (+ tests).

Deterministic compile of `museumRooms` → layout fixture (stable room ids, rectangle boundaries from dims/poses, openings → segment sides). Document fidelity limits (yaw, sightlines).

**Tests:** golden Chopin snapshot; canonicalize idempotent; every room id; opening count ≥ doors.

### B1 — Load Chopin layout in editor

Import fixture / “Load Chopin layout”. Preview without writing `rooms.ts`.

### B3 — Room-unit relocate

Move/rotate whole room boundary + openings + child objects as one undo transaction.

### B4 — Runtime dual-read

`architectureSource: 'rooms.ts' | 'layout'`. Default Chopin = `rooms.ts`. Add explicit `connectsRoomIds: [string, string]` for interior door/portal openings; never infer adjacency from geometry. Migrate corridor end cutouts and room doors into semantic portal relations. External windows remain unpaired. Parity checklist before enable. No editor UI in visitor chunks.

### B5 — Cutover

Chopin ships as serialized project. `rooms.ts` deprecated or generated. Tour stays on shared motion; room ids stable.

---

## 9. Track C — Project envelope

### C0 — `MuseumProject` codec *(implemented)*

Focused spec/plan: [`2026-08-10-layout-cad-c0-project-codec.md`](./2026-08-10-layout-cad-c0-project-codec.md).

Implemented pure editor project types/codec for `{ formatVersion, id, name, layout, scene }`. Delegates nested validation/canonicalization to the public layout and scene codecs; prefixes nested issues; canonicalizes scene to v6; rejects partial/unknown envelope data. Tests round-trip an empty project and Chopin-sized compiled-layout + scene-v6 fixture. No UI, package binaries, visitor loading, history integration, or cutover.

### C1 — Editor open/export project

Folder or zip; single undo stack; layout-only and scene-only actions remain.

### C2 — Visitor loads project when flagged

Wire B4 to project load. Prod still 404s editor.

---

## 10. Verification

```bash
npm run test -w @portfolio/museum -- --run <focused>
npm run check -w @portfolio/museum
```

End of A1 and each B/C gate: `npm run build` + visitor chunk grep for layout/editor symbols.

### A1 verification

A1 has no plan-drawing UX yet; use focused tests/store API or a temporary dev fixture to seed the layout.

1. Seed blank, rectangle, L-shaped, and skinny-corridor fixtures.
2. Generate floor/walls/ceiling and two rectangular corridor cutouts.
3. Verify cutouts are geometry-only; no adjacency/portal relation exists.
4. Exercise one undo/redo transaction and layout codec round-trip.
5. Confirm `/museum` + camera behavior remain unchanged.

Plan-drawing manual walkthrough begins at A2.

### Manual B1+

1. Load Chopin layout; rooms visible.
2. Relocate room (B3); openings follow.
3. Dual-read flag on fixture (B4); walk parity.
4. Cutover dry-run (B5) on branch only.

### Foundation complete (minimum)

A0–A2 + B0 + C0 merged, tests green, Chopin golden fixture, visitor default unchanged, docs reflect Mode B. Full-track Phase 2 must not block.

**Product north star complete** only after B4/B5.

---

## 11. Non-goals (foundation)

Multiple floors · semantic room adjacency/portal graph before B4 · terrain/civil CAD · asset import pipeline · free mesh editing · auto camera collision/tour · visitor shell migration (until B4/B5) · treating scene Wall presets as shell path.

---

## 12. Locked decisions (from goal review)

- Single undo stack; ops tagged `layout` | `scene`.
- Layout vs Museum selection mutex before plan UX.
- Thin A1 before Bezier/arches (A3).
- Full-track Phase 2 dressing = deferred optional.
- Corridor = skinny layout room (default).

---

## 13. Related

- Deferred full-track: [`../archive/superpowers/plans/2026-08-09-museum-editor-full-track.md`](../archive/superpowers/plans/2026-08-09-museum-editor-full-track.md)
- Goal-alignment review (archived): [`../archive/superpowers/reviews/2026-08-10-layout-cad-foundation-goal-alignment.md`](../archive/superpowers/reviews/2026-08-10-layout-cad-foundation-goal-alignment.md)
- Prior split design (archived): [`../archive/superpowers/specs/`](../archive/superpowers/specs/) — superseded by §§1–4, 11–12 here
