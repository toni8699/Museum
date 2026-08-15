# C1 — Plan Staging Mode (2D Furnishing)

Post-H1 polish slice: place and edit scene furniture directly in Plan.

**Date:** 2026-08-14
**Status:** Proposed — direction locked (C2 rejected); not scheduled
**Parent:** [`2026-08-14-graphics-h1-unified-3d-editing.md`](./2026-08-14-graphics-h1-unified-3d-editing.md) (Post-H1 polish slices) · [`2026-08-13-graphics-architecture-roadmap.md`](./2026-08-13-graphics-architecture-roadmap.md)
**Handoff:** [`../../hand-off/CURRENT.md`](../../hand-off/CURRENT.md)

> **Why this plan exists.** The umbrella plan locks 2D furnishing as the
> post-H1 "Plan staging mode" (C1) and rejects C2 (catalogue assets as layout
> objects). This is the focused slice plan for C1. It is a design record, not
> an implementation-ready plan; the phases below are sketches to be refined
> when C1 is scheduled.

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

### Phase 1 — Metadata & passive projection (may land mid-H1 as Path A)

- Author `MuseumAsset.footprint: { width, depth, height }` (+ optional
  `footprintOutline: LayoutVec2[]`) from the existing `notes` text.
- `plan-scene-footprint.ts` — pure projection module: reads `project.scene`
  entities + footprint metadata → layer-5.5 renderable vector model (sibling
  of `plan-camera-projection.ts`; drop Y).
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

- Route 2D drag/yaw gestures to existing scene mutators: X/Z + yaw, preserve
  Y; commit one tagged `scene` history entry per gesture. No new mutation
  machinery.

### Phase 4 — Invariants & regression documentation

- Document the B3 room-drag behavior (Alpha) as designed behavior.
- Update `components/placement.md`, north-star, and CURRENT.md when C1 lands.

## Footprint sources (locked)

| Asset origin | Footprint source | Persisted? |
|---|---|---|
| Catalogue (`MuseumAsset`) | Authored `footprint` metadata | In the asset manifest (not the package) |
| Imported project-local GLB | Derived from loaded model world AABB at render time | No — session-cached |

## Dependencies / gates

- No hard H1 dependency. Phase 1 may land mid-H1 — it is the Path A interim
  the umbrella names. Phases 2–4 are post-H1.
- Imported-in-staging requires S9's scene-only composite registry (already
  locked: the package manifest persists no footprint fields).
- S3 stays generic; the staging → scene-domain line is added when Phase 2
  lands.

## Open questions (resolve when C1 is scheduled)

- Imported footprints: derived-lazily is locked, but confirm no import-time
  persistence is wanted for offline/round-trip stability.
- Staging selection priority vs layout content when footprints overlap.
- Inspector surface in staging mode: reuse the scene inspector, or a
  Plan-staging variant.
- Whether the faint layer-5.5 outlines need a toggle (drafting vs staging
  density).

## Non-goals

- Merging `LayoutDocument` / `SceneDocument` or their identity types.
- C2 — catalogue assets as layout objects (rejected).
- Moving lights, cameras, materials, clusters, or tour data into layout.
- GLB loading or 3D hit-testing in Plan.
- Beta — compound room + furniture relocation.
- Plan camera mutation (unchanged from H1).

## Verification (sketch)

- Footprint projection: pure-module tests for catalogue + derived footprints,
  rotation-aware transforms, drop-Y parity.
- Hit resolver: point-in-polygon unit tests incl. overlap and rotation.
- Mutation: X/Z + yaw only, Y preserved; one `scene` history entry per
  gesture; parity with the 3D placement commit path.
- Visitor invariance: staging edits render in `/museum` unchanged.
- Mode bridges: drawer auto-activate, hover affordance.
