# Current Museum Agent Handoff

## Status

**North star:** layout-first / Chopin-as-data — [`../north-star.md`](../north-star.md).  
**P0:** Layout CAD Foundation — [`../plans/2026-08-10-layout-cad-foundation.md`](../plans/2026-08-10-layout-cad-foundation.md).  
**Completed:** A0 LayoutDocument codec + B0 Chopin `rooms.ts` compiler + A1 pure line geometry/preview model/transaction stub + C0 `MuseumProject` codec + A2 read-only layout preview workspace + A2.1 rectangle/polygon drafting + A2.2 meter-scale editing and Chopin floor correction + A2.3 geometry-only opening authoring and numeric opening dimensions + A3 Bezier walls, arc-length openings, and derived arch profiles + A3.1 camera-style wall bend anchors, opening viz fix, and Plan opening drag + A4 layout objects, inspectors, and layout JSON I/O + A4.1 Layout Authoring Polish + B3 Room-Unit Relocate + B4 Runtime Dual-Read + B5 Serialized Project Runtime Cutover + G1 Shared Geometry Compiler + G2 Explicit Plan Render Boundary + G3 Graphics Performance Harness + G4 Procedural Architectural Meshes.

Full-track Phase 2 scene presets = deferred optional.

## Next slice

**G5 — Measured optimization and scale.** Apply optimizations in order — cache derived geometry, partial rebuilds for transient edits, stable render objects/keys, shared materials, merged `BufferGeometry`, viewport/frustum culling, zoom-dependent detail, spatial indexing, then instancing — stopping when the G3 budgets pass; spatial indexing only when profiling shows linear queries materially consuming a budget. G4 is implemented in [`../plans/2026-08-13-graphics-g4-procedural-architectural-meshes.md`](../plans/2026-08-13-graphics-g4-procedural-architectural-meshes.md); roadmap: [`../plans/2026-08-13-graphics-architecture-roadmap.md`](../plans/2026-08-13-graphics-architecture-roadmap.md). (No focused G5 plan yet — the roadmap G5 section is authoritative.)

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
- G1 compiler/parity/boundary hardening passed; full suite 95 files / 1160 tests passed; check 0 errors / 0 warnings; production build passed. Shared geometry now rejects unsafe sample budgets with structured issues, gives compiled entities and query records qualified identities, and routes Plan committed hit geometry through compiled queries; `buildLayoutArchitectureModel()` remains deleted.
- G1 close (codec collapse + review round): full suite 96 files / 1169 tests passed; check 0 errors / 0 warnings; production build passed. One strict `validateLayoutDocument` lives below `$lib/layout` (unique floor/room/object/opening/segment/anchor IDs, ID pattern, positive numbers, unknown-key rejection, v1/v2 bezier migration); the editor duplicate and its re-export shim are deleted, and the project codec and editor share the same layout import/save gate.
- G2 render boundary: full suite 102 files / 1231 tests passed; check 0 errors / 0 warnings; production build passed. Plan renders a pure `PlanRenderModel` through `PlanSvg.svelte`; hit resolution is the pure `plan-hit` module; camera/tour overlays project `project.scene` through the existing route/motion system; selection is encoded via style tokens (adapter is render-only). Review round fixed the wall-adjacent primitive placement regression, qualified selection identity for imported layouts, and adapter selection decoupling.
- G3 performance harness: full suite 107 files / 1251 tests (1250 passed, 1 opt-in skipped); check 0 errors / 0 warnings; production build passed. Deterministic seeded 10/100/1,000-room fixtures compile codec-valid with zero blocking issues; the Node tier (`plan-bench`) and deterministic browser tier (`browser-bench`) capture compile/model/hit/snap/cache-key/render-work/count metrics; `/dev/perf` is dev-only and 404-gated in production. Chopin budgets are checked in (`src/lib/bench/baselines/g3-baseline.json`) and enforced fail-closed on each CI pass; the full 4-tier measurement runs under `BENCH_FULL=1`.
- G4 procedural meshes: full suite 110 files / 1277 tests (1277 passed, 1 opt-in skipped); check 0 errors / 0 warnings; production build passed. The pure `wall-mesh-builder` (room-scoped, watertight, surface-major, offset-overlap rejection, profile-union boundary faces) feeds the Three `wall-geometry-adapter`; visitor `LayoutMuseumShell` and editor `LayoutPreviewScene` both render one indexed `BufferGeometry` per room, the per-span chord-box path is removed (boundary-tested), and the visitor keeps `textures="off"` tint parity. Browser smoke confirmed clean console + zero failure surfaces at `/museum`. Harness re-baselined under method version 3 via `npm run bench:record` (Chopin: 7 objects / 7 draw calls / 9,388 triangles, `wall-mesh-build` enforced).
- B5 production build passed; visitor chunk scan contains the canonical project and `LayoutMuseumShell`, with no architecture source toggle, runtime compiler, editor marker, standalone scene JSON, or legacy shell marker.
- B5 production browser QA passed: all nine guided nodes forward, reverse Back, free-mode direct navigation, reduced motion, HUD room updates, Paris and Music Chamber visuals, inert legacy query, clean browser errors, and `/editor` 404.

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
- G1 is shipped. Plan, editor 3D, and visitor 3D consume one visitor-safe `compileLayoutGeometry()`; no consumer resamples curves or reinterprets opening topology. Compiled entities and query records carry qualified identities/content keys; Plan committed hit geometry uses compiled point/span/polygon queries. Unsafe derived lengths and sample budgets fail as structured room issues. The editor preview model is a compiled-geometry adapter and its bounds come from `CompiledLayoutGeometry`. The only separate sampler is the frozen v1/v2 room-frame migration algorithm.
- One layout codec, below `$lib/layout`: strict structural validation (unique IDs scoped per room for segments/anchors, global for floors/rooms/objects/openings; `ID_PATTERN`; positive numbers; unknown-key rejection; legacy `bezier` migration on read) gates both project import (`project-codec.ts`) and editor in-memory documents. Wall geometry keys are room-scoped (`roomId` + `segmentId`); cross-room segment-ID reuse is valid and handled by the nested room→segment span map.
- G2 is shipped. Plan renders a pure, renderer-neutral `PlanRenderModel` (12 ordered layers) built from `CompiledLayoutGeometry` plus optional camera/tour and interaction projections; `PlanSvg.svelte` is the sole render consumer and sole applier of `worldToPlanScreen` and style-token→CSS mapping. Hit resolution is `resolvePlanHit` (vertex → interior anchor → opening → object → wall → room) over compiled query records; primitive placement uses a room-only containment query, not the selection priority. Selection is encoded through `PlanSelection`/`*-selected` tokens; no editor selection type leaks into the adapter. Camera/tour overlays (paths, view cones, look targets, portal crossings, collision warnings, timing labels) project `project.scene` through `camera-route.ts`/`camera-motion.ts` only (drop Y), gated behind the Plan Tour toggle (off by default).
- G3 is shipped. The harness owns measurement, not optimization: seeded deterministic 10/100/1,000-room fixtures (30% auto-bezier, 2 openings/room, 3 objects/room), a pure Node tier (`compile`/`plan-render-build`/`hit-test`/`snap-query`/`compiled-memory`/`cache-key-code-units`), a deterministic browser tier (initial render, synchronous render-work proxies, SVG node count, wall-mesh topology estimates), and a checked-in baseline whose Chopin budgets are enforced fail-closed — a missing sample, missing budget, or over-`fail` value on any enforced metric (node timings, `cache-key-code-units`, and the deterministic SVG/Three counts) fails the check. 10/100/1,000-room tiers are comparison data, never enforced. Budget changes require a recorded reason in `g3-baseline.json`. The harness leaves the backlog (#1–#4, #10) unimplemented — each is now traced to a measured signal for G5.
- G4 is shipped. The pure, renderer-neutral `buildRoomWallMesh(room)` in `$lib/layout/wall-mesh-builder.ts` emits one watertight, surface-major `IndexedWallMesh` per room: `±thickness/2` offset-line corner miters at every turn (with `miterLimit` bevel fallback), profile-interval union with `profileBaseY` + `floorElevation` offsets, exposed boundary faces only (no caps at closed joints), per-normal vertex splits for flat-shaded corners, metric floor-anchored UVs, and fail-closed `{ mesh?, issues }` on offset-overlap/clearance/self-fold. The Three-only `wall-geometry-adapter.ts` converts it to `BufferGeometry` with one `addGroup` per material group and carries `sectionToRange`/`wallRanges` as metadata; `dispose()` disposes geometry + invokes each material `release()` once, never a shared cache. Visitor `LayoutMuseumShell` and editor `LayoutPreviewScene` both consume the builder+adapter (per-span chord boxes removed, boundary-tested); the editor preflights `wallMeshesByRoom` on `LayoutPreviewState` (a `Map`, never in the undo snapshot) and renders wall/opening selection via range-set overlays rebuilt/disposed on selection change, with a selection-independent base classifier. Visitor walls keep `textures="off"` tint parity via `wall-material-factory.ts` (shared per-tint cache, factory-owned, never adapter-disposed). Harness re-baselined under `BENCH_METHOD_VERSION` 3 via `npm run bench:record` (not a default test): `three-*-estimate` now counts the indexed mesh (Chopin 7 objects / 7 draw calls / 9,388 triangles), `three-regen` is removed, and `wall-mesh-build` is enforced. Shared walls: verified no coincident cross-room pairs in Chopin or the scale fixtures; per-room rendering is exact and dedup stays deferred (never coordinate-guessed).

## Out of scope this slice

Phase 2 Wall presets · G5+ graphics roadmap work · visitor rendering of layout objects · GLB import · new camera system · opening assets/frames · 3D room gizmos.

## Reading order (token-minimal)

1. This file.  
2. [`../AGENTS.md`](../../AGENTS.md) hard rules.  
3. [`../architecture.md`](../architecture.md) (layout/`rooms.ts` only).  
4. For G5, read the parent graphics roadmap plus architecture/persistence contracts. A0/B0/A1/C0/A2/A2.1/A2.2/A2.3/A3/A3.1/A4/A4.1/B3/B4/B5/G1/G2/G3/G4 are shipped.

5. Skip other `docs/components/*` unless the task touches them.

After shipping: update the **matching** `docs/components/*.md` or `architecture.md` / `north-star.md`; bump hub routing only if needed.
