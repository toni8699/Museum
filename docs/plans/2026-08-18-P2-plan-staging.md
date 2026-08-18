# P2 — Plan staging mode (umbrella)

**Date:** 2026-08-18
**Status:** Approved — umbrella; content unchanged from the approved C1 plan (re-registered, no re-scope)
**Tracker:** [`docs/plans/README.md`](README.md) — **P2**, depends on: P1
**Folded source (2026-08-18, content preserved; original deleted):** §A — the
approved C1 plan (Plan Staging Mode, approved 2026-08-17, direction locked,
C2 rejected).

## Outcome

Place and edit scene furniture directly in **Plan** (2D furnishing): authored
and derived footprints projected to a layer-5.5 read-only outline, a staging
tool + selection domain, and 2D drag/rotate/delete routed to the existing
scene mutators with one tagged `scene` history entry per gesture.

**v1 scope boundary (locked):** Path A visibility + staging *edit* only. 2D
ghost *placement* of new furniture from Plan is a follow-up slice, not part of
the approved execution spec.

## Increments (map to §A's phases; refined at scheduling)

| ID | Content | §A phase | Depends |
|---|---|---|---|
| **P2.1** | `MuseumAsset.footprint` metadata + `plan-scene-footprint.ts` passive projection (layer-5.5 dashed outlines, read-only) | 1 (Path A) | P1 |
| **P2.2** | Staging tool (`PlanViewMode: 'layout' \| 'staging'`) + `plan-scene-hit.ts` + scene-domain selection | 2 | P2.1 |
| **P2.3** | 2D scene mutations: drag/rotate/delete via existing mutators, tagged `scene` history entries + universal-history wrap (`beginLayoutTransaction`/`commitLayoutTransaction`) | 3 | P2.2 |
| **P2.4** | Invariants + regression documentation (B3 room-drag as designed; component docs update) | 4 | P2.3 |

## Gates

- **P1 close** — plan staging starts after the camera overhaul lands.

## Boundaries

- Inherits the **P1.1 domain×view shell** and the **P1.5 backdrop/hit-test
  discipline** (Plan stays read-only as a domain; staging never commits a
  layout selection).
- Baked catalogue materials for v1 — no per-instance material overrides
  (forward-compatible: furniture stays in `SceneDocument`).
- Scale is part of the projection: translate → rotate(yaw) → scale (uniform +
  independent `scaleVector`), matching the 3D world transform.
- Non-goals (from §A): no `LayoutDocument`/`SceneDocument` merge, no C2
  (catalogue assets as layout objects), no lights/cameras/materials in layout,
  no GLB loading or 3D hit-testing in Plan, no compound room + furniture
  relocation, no Plan camera mutation.

## Definition of done (P2 close)

- Footprint projection pure-module tests (catalogue + derived) green;
  staging interactions + history-tag assertions pass; suite green,
  `svelte-check` 0, build clean; tracker marks **P2 shipped**.

---

## A — Source: C1 — Plan Staging Mode (approved 2026-08-17), folded

## C1 — Plan Staging Mode (2D Furnishing)

Polish slice: place and edit scene furniture directly in Plan.

**Date:** 2026-08-14
**Status:** Approved (2026-08-17) — direction locked (C2 rejected); execution-spec revision below; not scheduled — H1 lands first, all C1 work (including Path A) starts after the H1 gate
**Parent:** [`2026-08-14-graphics-h1-unified-3d-editing.md`](../archive/plans/pre-h1-letters/2026-08-14-graphics-h1-unified-3d-editing.md) (polish slices) · [`2026-08-13-graphics-architecture-roadmap.md`](../archive/plans/pre-h1-letters/2026-08-13-graphics-architecture-roadmap.md)
**Handoff:** [`../hand-off/CURRENT.md`](../hand-off/CURRENT.md)

> **Why this plan exists.** The umbrella plan locks 2D furnishing as the
> "Plan staging mode" (C1) and rejects C2 (catalogue assets as layout
> objects). This is the focused slice plan for C1. It is a design record, not
> an implementation-ready plan; the phases below are sketches refined by the
> approved execution-spec revision (2026-08-17) and finalized when C1 is
> scheduled.

## Revision (2026-08-17) — approved execution spec amendments

The 2026-08-17 review approved the C1 direction and locked **baked catalogue
materials for v1** (no per-instance material overrides on furniture in this
slice; forward-compatible because furniture stays in `SceneDocument`). Four
execution-spec amendments from that review are folded into the phases below:

1. **Scaled footprints.** The layer-5.5 projection applies each entity's
   placement scale (uniform + independent `scaleVector`) in addition to
   translation + yaw — a 2×-scaled model has a 2× footprint.
2. **Per-kind footprint rules.** Models use authored `MuseumAsset.footprint`
   × scale; primitives derive footprints from dimensions × scale (no GLB,
   no metadata); lights render no footprint in v1.
3. **2D rotation gesture.** Staging rotation uses a footprint rotate handle
   (B3 rotation-arm pattern) with Shift 15° snap and inspector numeric yaw
   parity.
4. **Staging-mode delete coverage.** Delete in staging mode commits exactly
   one tagged `scene` history entry, mirroring the layout-side history fix.

## Summary

Give the editor the Sweet Home 3D experience — drag a catalogue (or imported)
item onto the 2D floorplan, move/rotate it with 2D handles, see it update in
the 3D view — **without** merging `LayoutDocument` and `SceneDocument`. Scene
entities stay in `project.scene`; Plan gains a `layout | staging` tool mode
plus a read-only footprint projection of scene content.

## Why C1 (locked rationale)

Three validated pillars (verified against the codebase):

1. **Visitor invariant.** `/museum` renders architecture from layout
   (`LayoutMuseumShell` ← `CompiledLayoutGeometry`) and everything else from
   scene (`MuseumEntities` ← `project.scene`). Layout objects are editor-only
   (`LayoutPreviewScene`). C1 gets visitor rendering of staged furniture for
   free; C2 would require new visitor support for layout-referenced assets.
2. **Content engine gravity.** `SceneDocument` already owns materials
   (`materialInstanceId`), lights, camera/tour, clusters. Keeping furniture in
   scene avoids duplicating that machinery into `LayoutDocument`.
3. **Asset uniformity.** Catalogue and user-imported models both enter the
   system as `SceneModelEntity`; C1 gives both one staging, projection, and
   mutation path in Plan.

C2 (catalogue assets as layout objects, `LayoutObject.kind: 'asset'`) is
**rejected**: it reverses the locked "ownership remains separate" decision,
needs new visitor rendering, and splits catalogue vs imported behavior by
origin.

## Product model

```text
PlanViewMode
  ├─ 'layout'   CAD as today (rooms / walls / openings / layout objects)
  │              scene entities render as faint dashed layer-5.5 outlines
  └─ 'staging'  scene entities selectable + mutable in Plan
                  catalogue drawer auto-activates staging
```

- Staging selection activates the **scene** domain — the one amendment to the
  "Plan selection always activates the layout domain" policy. S3's
  `ActiveEditorSelection` machinery is domain-generic; no H1 rework.
- 2D mutations write `position[0]/[2]` + yaw (`rotation[1]`) only;
  `position[1]` (elevation) is preserved — a lamp raised onto a table in 3D
  stays raised when dragged in 2D.
- One tagged `scene` history entry per completed gesture (pointerup commit) —
  parity with 3D gizmo drags.
- Plan never loads GLBs. Rendering + hit-testing use footprint polygons:
  catalogue footprints from authored `MuseumAsset.footprint` metadata;
  imported footprints derived from the loaded model's world AABB at render
  time, session-cached, never serialized.
- Snapping reads `LayoutDocument` (walls / corners / rooms), writes only
  `SceneDocument`.
- Low-friction mode bridges: picking an asset in the catalogue drawer
  auto-activates staging; hovering a scene entity in layout mode offers a
  1-click "switch to staging" affordance.

## Room drag (B3) — locked policy

- **Alpha (v1, locked):** room drag relocates `LayoutDocument` rooms and owned
  layout objects only (`transformLayoutRoomUnit`); scene entities keep world
  X/Z. Out-of-polygon furniture is flagged by the existing
  collision/placement warnings. This desync already exists in the editor today;
  C1 surfaces it, it does not create it.
- **Beta (explicitly out of scope):** coordinated room + furniture relocation
  is a multi-domain atomicity project — it conflicts with the domain-tagged
  history contract ("undo/redo restores only the touched document") and is
  classified Frontier+. Documented as expected behavior, not a bug.

## Phases

### Phase 1 — Metadata & passive projection (Path A)

- Author `MuseumAsset.footprint: { width, depth, height }` (+ optional
  `footprintOutline: LayoutVec2[]`) from the existing `notes` text.
- `plan-scene-footprint.ts` — pure projection module: reads the **live
  editor scene document** (the store's authoritative `SceneDocument` — never
  `layoutPreview.project.scene`, a boot-time copy that never syncs with scene
  edits, mirroring the room-delete policy) → layer-5.5 renderable vector
  model (sibling of `plan-camera-projection.ts`; drop Y).
- **Per-kind footprint rules (locked):**
  - **Model entities** → authored `MuseumAsset.footprint` × placement scale,
    rotated by `rotation[1]` (yaw).
  - **Primitive entities** (box / cylinder / sphere) → footprint derived from
    `dimensions` × placement scale (rectangle / circle / ellipse; no GLB, no
    metadata needed).
  - **Light entities** → no footprint in v1 (non-interactive; a tiny marker
    is a later enhancement, never a pick target).
- **Scale is part of the projection (amendment 1):** the transform chain is
  translate → rotate(yaw) → scale (uniform + independent `scaleVector`),
  matching the 3D world transform — a scaled model's footprint scales.
- Render layer 5.5 as faint dashed outlines — passive spatial context in
  layout mode. Read-only: no selection, no mutation.

### Phase 2 — Staging tool & selection domain

- Add `PlanViewMode: 'layout' | 'staging'` to Plan tool state (a
  `LayoutDraftTool`-style entry; catalogue drawer auto-switches).
- `plan-scene-hit.ts` — pure 2D point-in-polygon resolver over transformed
  footprints, active only in staging mode; isolated from `plan-hit.ts`.
- Staging selection activates the scene domain (`ActiveEditorSelection`).
- Hover/click bridge in layout mode.

### Phase 3 — 2D scene mutations

- Route 2D drag gestures to existing scene mutators: X/Z + yaw, preserve
  `position[1]`; commit one tagged `scene` history entry per gesture
  (`beginDocumentTransaction` → mutator → `commitDocumentTransaction` on
  pointerup; cancel restores). No new mutation machinery.
- **Rotation gesture (amendment 3):** a rotate handle on the selected
  footprint, following the B3 room rotation-arm pattern — pivot at the
  footprint center, continuous positive-Y rotation, Shift snaps to 15°;
  inspector numeric yaw is parity (mirrors B3 "Rotate by (°)").
- **Delete coverage (amendment 4):** Delete/Backspace in staging mode and
  the inspector delete path each commit exactly one tagged `scene` history
  entry — the same transaction wrap as drags. The layout-side analogue
  (layout-object create/move/delete/resize) gets the identical
  `beginLayoutTransaction`/`commitLayoutTransaction` wrap in the same slice:
  the universal-history fix closes the Plan-side gap on both sides.

### Phase 4 — Invariants & regression documentation

- Document the B3 room-drag behavior (Alpha) as designed behavior.
- Update `components/placement.md`, north-star, and CURRENT.md when C1 lands.

## Footprint sources (locked)

| Asset origin | Footprint source | Persisted? |
|---|---|---|
| Catalogue (`MuseumAsset`) | Authored `footprint` metadata | In the asset manifest (not the package) |
| Imported project-local GLB | Derived from loaded model world AABB at render time | No — session-cached |

## Dependencies / gates

- **Scheduling (locked 2026-08-17):** H1 lands first. All C1 work —
  including Path A (Phase 1) — starts only after the H1 gate closes. C1
  stays approved and is re-registered under the plan-tracking system
  (letter families archived; see the CURRENT.md note). The ordering is
  sequencing discipline, not a technical gate — the document side has no
  hard H1 dependency.
- Imported-in-staging requires S9's scene-only composite registry (already
  locked: the package manifest persists no footprint fields).
- S3 stays generic; the staging → scene-domain line is added when Phase 2
  lands.

## Open questions (resolve when C1 is scheduled)

- Imported footprints: derived-lazily is locked, but confirm no import-time
  persistence is wanted for offline/round-trip stability.
- Staging selection priority vs layout content when footprints overlap
  (still open — the approved spec does not resolve it).
- Inspector surface in staging mode: reuse the scene inspector, or a
  Plan-staging variant.
- Whether the faint layer-5.5 outlines need a toggle (drafting vs staging
  density).
- **Scope boundary (locked for this slice):** C1 v1 is Path A visibility +
  staging *edit* only. 2D ghost *placement* of new furniture from Plan
  ("2D → Add a box, desk, table → ghost outline") is a follow-up slice, not
  part of the approved execution spec.

## Non-goals

- Merging `LayoutDocument` / `SceneDocument` or their identity types.
- C2 — catalogue assets as layout objects (rejected).
- Moving lights, cameras, materials, clusters, or tour data into layout.
- GLB loading or 3D hit-testing in Plan.
- Beta — compound room + furniture relocation.
- Plan camera mutation (unchanged from H1).

## Verification (sketch)

- Footprint projection: pure-module tests for catalogue + derived footprints,
  **scale-aware** transforms (uniform + independent), rotation-aware
  transforms, drop-Y parity, and per-kind rules (model / primitive / light).
  The projection reads the live editor scene document, not the preview copy.
- Hit resolver: point-in-polygon unit tests incl. overlap and rotation;
  inactive in layout mode (pass-through to `plan-hit.ts`).
- Mutation: X/Z + yaw only, Y preserved; **rotate-handle gesture with 15°
  Shift snap**; one `scene` history entry per drag, rotate, and **delete**
  gesture; parity with the 3D placement commit path.
- History: Ctrl+Z after a staging drag/rotate/delete restores
  `SceneDocument` in one step; the layout-side object fix restores
  `LayoutDocument` in one step.
- Visitor invariance: staging edits render in `/museum` unchanged.
- Mode bridges: drawer auto-activate, hover affordance.
