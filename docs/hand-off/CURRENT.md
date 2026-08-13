# Current Museum Agent Handoff

## Status

**North star:** layout-first / Chopin-as-data — [`../north-star.md`](../north-star.md).  
**P0:** Layout CAD Foundation — [`../plans/2026-08-10-layout-cad-foundation.md`](../plans/2026-08-10-layout-cad-foundation.md).  
**Completed:** A0 LayoutDocument codec + B0 Chopin `rooms.ts` compiler + A1 pure line geometry/preview model/transaction stub + C0 `MuseumProject` codec + A2 read-only layout preview workspace + A2.1 rectangle/polygon drafting + A2.2 meter-scale editing and Chopin floor correction + A2.3 geometry-only opening authoring and numeric opening dimensions + A3 Bezier walls, arc-length openings, and derived arch profiles + A3.1 camera-style wall bend anchors, opening viz fix, and Plan opening drag + A4 layout objects, inspectors, and layout JSON I/O + A4.1 Layout Authoring Polish + B3 Room-Unit Relocate + B4 Runtime Dual-Read + B5 Serialized Project Runtime Cutover.

Full-track Phase 2 scene presets = deferred optional.

## Next slice

**G1 — Shared geometry compiler.** Consolidate editor/runtime curve sampling, openings/profiles, polygons, bounds, and query geometry behind one pure visitor-safe `compileLayoutGeometry()` contract. Roadmap: [`../plans/2026-08-13-graphics-architecture-roadmap.md`](../plans/2026-08-13-graphics-architecture-roadmap.md). B5 is implemented in [`../plans/2026-08-13-layout-cad-b5-runtime-cutover.md`](../plans/2026-08-13-layout-cad-b5-runtime-cutover.md).

A4 adds primitive layout-object placement in Plan and 3D, transient Plan object dragging, room/wall/opening/object numeric inspectors, canonical layout JSON I/O, and independent layout baseline/status/dirty handling. A4.1 refines this into Plan-only Box/Cylinder/Sphere gestures, transformed primitive footprints, Place/Objects/Selection accordions, contextual dimensions, and replacement-only Plan reframing. Stored object transform/dimensions now drive rendering, bounds, and JSON exactly. B3 adds shared chronological scene/layout history: entries are tagged by domain, undo/redo restores only the touched document, and import/reset clears the shared stack.

B5 makes checked-in `chopin-project.json` the sole production layout/scene source. Layout v3 owns stable room frames; the shared project codec cross-validates every room-relative scene surface; `/museum` always renders `LayoutMuseumShell`; `rooms.ts` remains only as a deprecated editor/test projection and is absent from visitor imports. The editor keeps independent transient layout and scene baselines.

## Completed verification

- A0 codec: 20 focused tests passed.
- B0 compiler: 9 focused tests passed.
- A1 focused tests: 18 passed.
- C0 project codec: 11 focused tests passed.
- A2 preview focused tests: 28 passed.
- A2.1 drafting tests: 9 passed.
- A2.1 focused shell/camera regression set: 117 passed.
- A2.2 focused tests: 21 passed.
- A2.3 focused layout + shell/camera tests: 149 passed.
- A3 focused layout suite: 98 passed.
- A3.1 focused layout suite: 107 passed.
- A4 focused layout suite: 41 passed after final object/state additions.
- A4.1 focused layout/shell set: 54 passed.
- A4.1 review focused layout/shell/camera set: 7 files / 158 tests passed.
- B3 transform/history focused set: 3 files / 40 tests passed.
- Full suite before B4: 86 files / 1112 tests passed.
- B4 full suite: 89 files / 1121 tests passed.
- B5 full suite: 92 files / 1130 tests passed.
- B5 `npm run check -w @portfolio/museum`: 0 errors / 0 warnings.
- B5 production build passed; visitor chunk scan contains the canonical project and `LayoutMuseumShell`, with no architecture source toggle, runtime compiler, editor marker, standalone scene JSON, or legacy shell marker.
- B5 production browser QA passed: all nine guided nodes forward, reverse Back, free-mode direct navigation, reduced motion, HUD room updates, Paris and Music Chamber visuals, inert legacy query, clean browser errors, and `/dev/museum-editor` 404.

## Locked decisions

- Single undo stack; ops tagged `layout` | `scene`.
- Layout mode vs Museum mode mutex before plan UX.
- Visitor validates one serialized project and always renders architecture from `project.layout`; there is no runtime source toggle or legacy fallback.
- Rectangle click-drag OK in plan tools; object place = ghost commit.
- A1 corridor = ordinary skinny `LayoutRoom` with optional two rectangular geometry-only cutouts; no corridor type or adjacency semantics yet.
- A2 preview renders generated geometry; A2.1 drafts rooms in an isolated in-memory layout preview only.
- A2.1 does not add shared history, persistence, openings, room selection, or snapping.
- A2.2 uses layout-local meter coordinates, 0.25 m snap, 15° Shift angle snap, room/vertex edits, and ceiling visibility; no shared history or persistence.
- A2.3 opening authoring chooses interaction B: Door/Window tools hit any wall with no prior wall selection; selecting a wall first is optional, and Inspector actions only arm the tool without constraining the next click. Tagged `LayoutSelection` includes `interiorAnchor` after A3.1. Numeric fields are opening-only (room/edge numeric fields deferred). Hit priority: vertex → interior anchor → opening → wall → room. Over-height validation in `layout-validation`; room/vertex edits that invalidate openings fail closed for all rooms (no Chopin special case). A2.3 openings are rectangular by default and geometry-only; A3 supersedes the rectangular-profile restriction with derived `rounded` and `pointed` profiles. Plan opening drag adjusts `offset` after place. No adjacency, shared history, or persistence.
- A1 preview output is pure data; A2 owns the Three/Svelte rendering adapter.
- A3/A3.1 curve sampling uses `0.01 m` flatness, `0.25 m` maximum sample span (lines densified too), `1e-4 m` self-intersection tolerance, and existing `12 px` Plan hit radius.
- A3.1 walls use `line` | `auto-bezier` with camera-style interior anchors (pure 2D centripetal cubics); no Bezier room tool; no authored `handleOut`/`handleIn` edit model; legacy `bezier` migrates on codec read. Bend via mid-span **drag** (4 px threshold); click selects wall without inserting an anchor; corners resize rooms. Plan-only anchors; 3D sampled preview only.
- A3 curve mutations remain preview-state-only; no shared editor history or persistence.
- A4 layout object mutations and layout I/O remain preview-state-only; scene/layout dirty baselines remain independent. B3 room-unit gestures and inspector rotation are the first layout mutations routed through shared chronological history. Navigation/unload protects either dirty document.
- A4.1 layout chrome uses Plan-only Box/Cylinder/Sphere gestures, Place/Objects/Selection accordion state, and 0.25 m room/vertex/object candidate snapping; primitive placement is not reachable in 3D.
- A4.1 ordinary edits do not auto-reframe; import/reset/Reload Chopin do. Primitive room ownership resolves from the derived center, whole-room snap is a rigid translation, and stored Sphere height/position remain authoritative and floor-aligned at creation.
- A4.1 3D preview renders layout objects but intentionally does not select/edit them; B3 remains Plan-only and 3D room gizmos return with the unified layout/scene editing milestone.
- A1 `LayoutOpening.offset` is meters along its segment; B4 adds explicit `connectsRoomIds` for portals.
- Layout auto-bezier must not import `camera-motion` / Three.
- No commits unless user asks.
- Layout v3 persists a stable room frame. V1/v2 migration derives origin from the sampled-boundary centroid and yaw from the first non-zero tangent; room relocation moves frame/boundary/owned objects atomically.
- B3 translation snaps 0.25 m; Shift rotation snaps 15°; room body/rotation-arm gestures and inspector rotation each create at most one `layout` history entry.
- B5 is shipped. `rooms.ts` is a deprecated project-derived editor/test compatibility projection and cannot enter visitor imports. Unified outliner remains future work.

## Out of scope this slice

Phase 2 Wall presets · G1+ graphics roadmap work · visitor rendering of layout objects · GLB import · new camera system · opening assets/frames · 3D room gizmos.

## Reading order (token-minimal)

1. This file.  
2. [`../AGENTS.md`](../../AGENTS.md) hard rules.  
3. [`../architecture.md`](../architecture.md) (layout/`rooms.ts` only).  
4. For G1, read the graphics architecture roadmap plus architecture/persistence contracts. A0/B0/A1/C0/A2/A2.1/A2.2/A2.3/A3/A3.1/A4/A4.1/B3/B4/B5 are shipped.

5. Skip other `docs/components/*` unless the task touches them.

After shipping: update the **matching** `docs/components/*.md` or `architecture.md` / `north-star.md`; bump hub routing only if needed.
