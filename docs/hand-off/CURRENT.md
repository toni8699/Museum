# Current Museum Agent Handoff

## Status

**North star:** layout-first / Chopin-as-data — [`../north-star.md`](../north-star.md).  
**P0:** Layout CAD Foundation — [`../plans/2026-08-10-layout-cad-foundation.md`](../plans/2026-08-10-layout-cad-foundation.md).  
**Completed:** A0 LayoutDocument codec + B0 Chopin `rooms.ts` compiler + A1 pure line geometry/preview model/transaction stub + C0 `MuseumProject` codec + A2 read-only layout preview workspace + A2.1 rectangle/polygon drafting + A2.2 meter-scale editing + Chopin floor correction + A2.3 geometry-only opening authoring + numeric opening dimensions + A3 Bezier walls, arc-length openings, derived arch profiles + A3.1 camera-style wall bend anchors, opening viz fix, Plan opening drag + A4 layout objects, inspectors, layout JSON I/O + A4.1 Layout Authoring Polish + B3 Room-Unit Relocate + B4 Runtime Dual-Read + B5 Serialized Project Runtime Cutover + G1 Shared Geometry Compiler + G2 Explicit Plan Render Boundary + G3 Graphics Performance Harness + G4 Procedural Architectural Meshes.

Full-track Phase 2 scene presets = deferred optional.

## Next slice

**H1 S1 — Editor shell (Plan | 3D).** Consolidate the legacy editor shell into the new H1 entry: promote the Plan surface to a top-level view, merge the two Threlte Canvas branches into one 3D view, and freeze the pre-H1 editor untouched at `/museum/editor`. Plan: [`../plans/2026-08-14-graphics-h1-s1-editor-shell.md`](../plans/2026-08-14-graphics-h1-s1-editor-shell.md); roadmap: [`../plans/2026-08-14-graphics-h1-unified-3d-editing.md`](../plans/2026-08-14-graphics-h1-unified-3d-editing.md).

**H1 S0 is Partial.** Landed: `createEmptySceneDocument` + `createEmptyMuseumProject`, authoring-empty validator loosening, `EditorViewMode`, injectable scene room-resolver + zero-node policy (`pickInitialNavigationNodeId` returns `null`), and the relic store/menu guard (relic cannot reach the Layout workspace). Open `it.todo` contracts in `tests/lib/editor/h1/contracts.test.ts` (close with S1/S2): boot-blank session camera, preview lockout, view-switch preservation, playback locks, relic isolation smoke test. Plan: [`../plans/2026-08-14-graphics-h1-s0-contracts.md`](../plans/2026-08-14-graphics-h1-s0-contracts.md).

(Deferred, not abandoned — **G5 — Measured optimization and scale**: apply optimizations in order — cache derived geometry, partial rebuilds, stable render objects/keys, shared materials, merged `BufferGeometry`, culling, LOD, spatial indexing, instancing — stop when G3 budgets pass. G4 in [`../plans/2026-08-13-graphics-g4-procedural-architectural-meshes.md`](../plans/2026-08-13-graphics-g4-procedural-architectural-meshes.md); roadmap [`../plans/2026-08-13-graphics-architecture-roadmap.md`](../plans/2026-08-13-graphics-architecture-roadmap.md). No focused G5 plan yet.)

A4 adds primitive layout-object placement in Plan + 3D, transient Plan object dragging, room/wall/opening/object numeric inspectors, canonical layout JSON I/O, independent layout baseline/status/dirty handling. A4.1 refines into Plan-only Box/Cylinder/Sphere gestures, transformed primitive footprints, Place/Objects/Selection accordions, contextual dimensions, replacement-only Plan reframing. Stored object transform/dimensions drive rendering, bounds, JSON exactly. B3 adds shared chronological scene/layout history: entries tagged by domain, undo/redo restores only touched document, import/reset clears shared stack.

B5 makes checked-in `chopin-project.json` the sole production layout/scene source. Layout v3 owns stable room frames; shared project codec cross-validates every room-relative scene surface; `/museum` always renders `LayoutMuseumShell`; `rooms.ts` remains only as deprecated editor/test projection, absent from visitor imports. Editor keeps independent transient layout + scene baselines.

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
- G1 compiler/parity/boundary hardening passed; full suite 95 files / 1160 tests passed; check 0/0; production build passed. Shared geometry rejects unsafe sample budgets with structured issues, gives compiled entities + query records qualified identities, routes Plan committed hit geometry through compiled queries; `buildLayoutArchitectureModel()` remains deleted.
- G1 close (codec collapse + review round): full suite 96 files / 1169 tests passed; check 0/0; production build passed. One strict `validateLayoutDocument` below `$lib/layout` (unique floor/room/object/opening/segment/anchor IDs, ID pattern, positive numbers, unknown-key rejection, v1/v2 bezier migration); editor duplicate + its re-export shim deleted; project codec + editor share same layout import/save gate.
- G2 render boundary: full suite 102 files / 1231 tests passed; check 0/0; production build passed. Plan renders pure `PlanRenderModel` through `PlanSvg.svelte`; hit resolution = pure `plan-hit` module; camera/tour overlays project `project.scene` through existing route/motion system; selection encoded via style tokens (adapter render-only). Review round fixed wall-adjacent primitive placement regression, qualified selection identity for imported layouts, adapter selection decoupling.
- G3 performance harness: full suite 107 files / 1251 tests (1250 passed, 1 opt-in skipped); check 0/0; production build passed. Deterministic seeded 10/100/1,000-room fixtures compile codec-valid, zero blocking issues; Node tier (`plan-bench`) + deterministic browser tier (`browser-bench`) capture compile/model/hit/snap/cache-key/render-work/count metrics; `/dev/perf` dev-only, 404-gated in production. Chopin budgets checked in (`src/lib/bench/baselines/g3-baseline.json`), enforced fail-closed each CI pass; full 4-tier measurement under `BENCH_FULL=1`.
- G4 procedural meshes: full suite 112 files / 1296 tests (1296 passed, 1 opt-in skipped); check 0/0; production build passed. Pure `wall-mesh-builder` (room-scoped, watertight, surface-major, offset-overlap rejection, profile-union boundary faces, profile-aware bevel bridge + endpoint-reveal corner fixes) feeds Three `wall-geometry-adapter`; visitor `LayoutMuseumShell` + editor `LayoutPreviewScene` both render one indexed `BufferGeometry` per room; per-span chord-box path removed (boundary-tested); visitor keeps `textures="off"` tint parity. Browser smoke: clean console + zero failure surfaces at `/museum`. Harness re-baselined under method version 3 via `npm run bench:record` (Chopin: 6 objects / 6 draw calls / 12,876 triangles — bespoke music-chamber excluded before build; `wall-mesh-build` enforced; `/dev/perf` live WebGL honors the same exclusion).
- B5 production build passed; visitor chunk scan contains canonical project + `LayoutMuseumShell`, no architecture source toggle, runtime compiler, editor marker, standalone scene JSON, or legacy shell marker.
- B5 production browser QA passed: all nine guided nodes forward, reverse Back, free-mode direct navigation, reduced motion, HUD room updates, Paris + Music Chamber visuals, inert legacy query, clean browser errors, `/editor` 404.
- H1 S0 (partial): `createEmptySceneDocument`/`createEmptyMuseumProject` codec-valid + byte-stable; `empty_navigation` loosened for authoring-empty without weakening non-empty invariants; `EditorViewMode` pinned; scene room-resolver injected (no `chopinRuntime` in the editor sub-stores) + `pickInitialNavigationNodeId` returns `null` on zero nodes; relic store guard + Project-menu gating so `/museum/editor` cannot reach the Layout workspace. 5 `it.todo` contracts (session camera, preview lockout, view-switch preservation, playback locks, relic smoke) close with S1/S2.

## Locked decisions

- Single undo stack; ops tagged `layout` | `scene`.
- Layout mode vs Museum mode mutex before plan UX.
- Visitor validates one serialized project, always renders architecture from `project.layout`; no runtime source toggle or legacy fallback.
- Rectangle click-drag OK in plan tools; object place = ghost commit.
- A1 corridor = ordinary skinny `LayoutRoom` with optional two rectangular geometry-only cutouts; no corridor type or adjacency semantics yet.
- A2 preview renders generated geometry; A2.1 drafts rooms in isolated in-memory layout preview only.
- A2.1 does not add shared history, persistence, openings, room selection, snapping.
- A2.2 uses layout-local meter coordinates, 0.25 m snap, 15° Shift angle snap, room/vertex edits, ceiling visibility; no shared history or persistence.
- A2.3 opening authoring = interaction B: Door/Window tools hit any wall with no prior wall selection; selecting wall first optional, Inspector actions only arm the tool without constraining next click. Tagged `LayoutSelection` includes `interiorAnchor` after A3.1. Numeric fields opening-only (room/edge deferred). Hit priority: vertex → interior anchor → opening → wall → room. Over-height validation in `layout-validation`; room/vertex edits that invalidate openings fail closed for all rooms (no Chopin special case). A2.3 openings rectangular by default, geometry-only; A3 supersedes with derived `rounded` + `pointed` profiles. Plan opening drag adjusts `offset` after place. No adjacency, shared history, or persistence.
- A1 preview output = pure data; A2 owns Three/Svelte rendering adapter.
- A3/A3.1 curve sampling: `0.01 m` flatness, `0.25 m` max sample span (lines densified too), `1e-4 m` self-intersection tolerance, existing `12 px` Plan hit radius.
- A3.1 walls use `line` | `auto-bezier` with camera-style interior anchors (pure 2D centripetal cubics); no Bezier room tool; no authored `handleOut`/`handleIn` edit model; legacy `bezier` migrates on codec read. Bend via mid-span **drag** (4 px threshold); click selects wall without inserting anchor; corners resize rooms. Plan-only anchors; 3D sampled preview only.
- A3 curve mutations remain preview-state-only; no shared editor history or persistence.
- A4 layout object mutations + layout I/O remain preview-state-only; scene/layout dirty baselines independent. B3 room-unit gestures + inspector rotation = first layout mutations routed through shared chronological history. Navigation/unload protects either dirty document.
- A4.1 layout chrome uses Plan-only Box/Cylinder/Sphere gestures, Place/Objects/Selection accordion state, 0.25 m room/vertex/object candidate snapping; primitive placement not reachable in 3D.
- A4.1 ordinary edits do not auto-reframe; import/reset/Reload Chopin do. Primitive room ownership resolves from derived center, whole-room snap = rigid translation, stored Sphere height/position authoritative + floor-aligned at creation.
- A4.1 3D preview renders layout objects but does not select/edit them; B3 remains Plan-only, 3D room gizmos return with unified layout/scene editing milestone.
- A1 `LayoutOpening.offset` = meters along its segment; B4 adds explicit `connectsRoomIds` for portals.
- Layout auto-bezier must not import `camera-motion` / Three.
- No commits unless user asks.
- Layout v3 persists stable room frame. V1/v2 migration derives origin from sampled-boundary centroid + yaw from first non-zero tangent; room relocation moves frame/boundary/owned objects atomically.
- B3 translation snaps 0.25 m; Shift rotation snaps 15°; room body/rotation-arm gestures + inspector rotation each create at most one `layout` history entry.
- B5 shipped. `rooms.ts` = deprecated project-derived editor/test compatibility projection, cannot enter visitor imports. Unified outliner remains future work.
- G1 shipped. Plan, editor 3D, visitor 3D consume one visitor-safe `compileLayoutGeometry()`; no consumer resamples curves or reinterprets opening topology. Compiled entities + query records carry qualified identities/content keys; Plan committed hit geometry uses compiled point/span/polygon queries. Unsafe derived lengths + sample budgets fail as structured room issues. Editor preview model = compiled-geometry adapter; its bounds come from `CompiledLayoutGeometry`. Only separate sampler = frozen v1/v2 room-frame migration algorithm.
- One layout codec below `$lib/layout`: strict structural validation (unique IDs scoped per room for segments/anchors, global for floors/rooms/objects/openings; `ID_PATTERN`; positive numbers; unknown-key rejection; legacy `bezier` migration on read) gates both project import (`project-codec.ts`) + editor in-memory documents. Wall geometry keys room-scoped (`roomId` + `segmentId`); cross-room segment-ID reuse valid, handled by nested room→segment span map.
- G2 shipped. Plan renders pure, renderer-neutral `PlanRenderModel` (12 ordered layers) built from `CompiledLayoutGeometry` + optional camera/tour + interaction projections; `PlanSvg.svelte` = sole render consumer + sole applier of `worldToPlanScreen` + style-token→CSS mapping. Hit resolution = `resolvePlanHit` (vertex → interior anchor → opening → object → wall → room) over compiled query records; primitive placement uses room-only containment query, not selection priority. Selection encoded through `PlanSelection`/`*-selected` tokens; no editor selection type leaks into adapter. Camera/tour overlays (paths, view cones, look targets, portal crossings, collision warnings, timing labels) project `project.scene` through `camera-route.ts`/`camera-motion.ts` only (drop Y), gated behind Plan Tour toggle (off by default).
- G3 shipped. Harness owns measurement, not optimization: seeded deterministic 10/100/1,000-room fixtures (30% auto-bezier, 2 openings/room, 3 objects/room), pure Node tier (`compile`/`plan-render-build`/`hit-test`/`snap-query`/`compiled-memory`/`cache-key-code-units`), deterministic browser tier (initial render, synchronous render-work proxies, SVG node count, wall-mesh topology estimates), checked-in baseline whose Chopin budgets enforced fail-closed — missing sample, missing budget, or over-`fail` value on any enforced metric (node timings, `cache-key-code-units`, deterministic SVG/Three counts) fails check. 10/100/1,000-room tiers = comparison data, never enforced. Budget changes require recorded reason in `g3-baseline.json`. Harness leaves backlog (#1–#4, #10) unimplemented — each traced to measured signal for G5.
- G4 shipped. Pure, renderer-neutral `buildRoomWallMesh(room)` in `$lib/layout/wall-mesh-builder.ts` emits one watertight, surface-major `IndexedWallMesh` per room: `±thickness/2` offset-line corner miters at every turn (with `miterLimit` profile-aware bevel bridge), profile-interval union with `profileBaseY` + `floorElevation` offsets, exposed boundary faces only (no caps at closed joints), per-normal vertex splits for flat-shaded corners, metric floor-anchored UVs, fail-closed `{ mesh?, issues }` on offset-overlap/clearance/self-fold. Three-only `wall-geometry-adapter.ts` converts to `BufferGeometry` with one `addGroup` per material group, carries `sectionToRange`/`wallRanges` metadata; `dispose()` disposes geometry + invokes each material `release()` once, never shared cache. Visitor `LayoutMuseumShell` + editor `LayoutPreviewScene` both consume builder+adapter (per-span chord boxes removed, boundary-tested); editor preflights `wallMeshesByRoom` on `LayoutPreviewState` (a `Map`, never in undo snapshot), renders wall/opening selection via range-set overlays rebuilt/disposed on selection change, selection-independent base classifier. Visitor walls keep `textures="off"` tint parity via `wall-material-factory.ts` (shared per-tint cache, factory-owned, never adapter-disposed). Harness re-baselined under `BENCH_METHOD_VERSION` 3 via `npm run bench:record` (not default test): `three-*-estimate` counts indexed mesh (Chopin 6 objects / 6 draw calls / 12,876 triangles — bespoke music-chamber shell excluded before build, matching the live scene), `three-regen` removed, `wall-mesh-build` enforced; `buildWallMeshScene` honors `excludedRoomIds` so `/dev/perf` live WebGL reports the same 6-room counts. Shared walls: no coincident cross-room pairs in Chopin or scale fixtures; per-room rendering exact, dedup deferred (never coordinate-guessed).

## Out of scope this slice

Phase 2 Wall presets · G5+ graphics roadmap work · visitor rendering of layout objects · GLB import · new camera system · opening assets/frames · 3D room gizmos.

## Reading order (token-minimal)

1. This file.  
2. [`../AGENTS.md`](../../AGENTS.md) hard rules.  
3. [`../architecture.md`](../architecture.md) (layout/`rooms.ts` only).  
4. A0/B0/A1/C0/A2/A2.1/A2.2/A2.3/A3/A3.1/A4/A4.1/B3/B4/B5/G1/G2/G3/G4 shipped. H1 in progress: S0 partial → S1 shell next. Read [`../plans/2026-08-14-graphics-h1-unified-3d-editing.md`](../plans/2026-08-14-graphics-h1-unified-3d-editing.md) + its S0/S1 sub-plans.

5. Skip other `docs/components/*` unless task touches them.

After shipping: update **matching** `docs/components/*.md` or `architecture.md` / `north-star.md`; bump hub routing only if needed.
