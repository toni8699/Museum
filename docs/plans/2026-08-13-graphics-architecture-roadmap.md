# Graphics Architecture Roadmap

**Date:** 2026-08-13
**Status:** Active post-B5 roadmap; G1 + G2 + G3 + G4 implemented, G5 next
**Prerequisite:** B5 runtime cutover
**Architecture:** [`../architecture.md`](../architecture.md) · **Vision:** [`../north-star.md`](../north-star.md)

## 1. Outcome

Make graphics architecture a product capability of the layout-first museum, not a
technology showcase. `MuseumProject` remains the envelope, `project.layout`
remains the semantic architecture source, Three.js/Threlte remains the production
3D stack, and the existing camera route/motion system remains the only one.

Every proposal must answer:

> What current product, architecture, correctness, or measured performance
> problem does this solve that the existing stack does not solve cleanly?

If the answer is mainly resume signaling, “Rust is faster,” “WebGPU is newer,” or
“a custom renderer sounds impressive,” reject it or isolate it as research.

This roadmap starts after B5. It must not expand or delay the B5 cutover.

## 2. Current baseline and debt

| Concern | Current implementation |
|---------|------------------------|
| Persisted architecture | `LayoutDocument` v3 in `$lib/layout/layout-types.ts`; no renderer state |
| Editor geometry | `compileLayoutGeometry()` (G1) feeds editor preview state, Plan, and 3D |
| Visitor geometry | `compileLayoutGeometry()` (G1) feeds `LayoutMuseumShell` |
| Plan rendering | `LayoutPlanViewport.svelte` delegates to `PlanSvg.svelte`, which renders an explicit `PlanRenderModel` |
| Editor 3D | `LayoutPreviewScene.svelte` renders prebuilt `IndexedWallMesh` via `wall-geometry-adapter` (G4) |
| Visitor 3D | `LayoutMuseumShell.svelte` renders one watertight indexed `BufferGeometry` per room (G4) |
| Scene/tour | `museum-scene.json` v6 plus `camera-route.ts` and `camera-motion.ts` |

B4 established a runtime-safe layout projection and line-layout parity for the
current Chopin fixture. It did **not** finish universal geometry consolidation:
the editor path has adaptive auto-Bezier sampling, tangent/normal data, and richer
arch/opening handling, while the runtime architecture builder independently
samples and splits walls. G1 owns that consolidation after B5; B5 should not grow
into a graphics rewrite.

## 3. Target architecture

```text
MuseumProject.project.layout
          ↓
    LayoutDocument
          ↓
 compileLayoutGeometry()
          ↓
 CompiledLayoutGeometry
 ├─ sampled curves + arc-length tables
 ├─ tangents + normals
 ├─ wall solid sections
 ├─ openings + elevation profiles
 ├─ floor + ceiling polygons
 ├─ object footprints
 ├─ bounds + query records
 └─ render-neutral geometry
          │
          ├─────────────────────────┐
          ↓                         ↓
  buildPlanRenderModel()     wall-geometry-adapter
          ↓                         ↓
   PlanRenderModel          procedural BufferGeometry
          ↓                         ↓
     SVG renderer              Threlte / Three.js
    (production first)             ↓
                               WebGL / WebGPU
```

Camera/tour overlays join only at the Plan projection boundary:

```text
project.scene → existing camera-route/camera-motion projection ─┐
CompiledLayoutGeometry ──────────────────────────────────────────┴→ PlanRenderModel
```

They do not become `LayoutDocument` fields and do not create a second path or
motion implementation.

## 4. Ownership contracts

| Layer | Owns | Must not own |
|-------|------|--------------|
| `LayoutDocument` | Authored rooms, paths, openings, portal relations, layout objects, dimensions | Samples, triangulation, SVG paths, Three objects, buffers, GPU resources, pixels |
| `compileLayoutGeometry()` | Pure deterministic derivation, geometry issues, sampled/sectioned/query-ready data | UI state, scene entities, materials, cameras, render-backend state |
| `CompiledLayoutGeometry` | Immutable-by-convention render-neutral values; typed arrays are allowed when backend-neutral | SVG/DOM nodes, `THREE.*`, WebGL/WebGPU handles |
| `PlanRenderModel` | Ordered world-space drawing primitives, semantic style tokens, hit identities, overlays | Document mutation, geometry recomputation, persisted styling, camera ownership |
| Plan view transform | World/screen conversion and zoom-dependent screen sizing | Document mutation or render ordering |
| SVG renderer | DOM creation, SVG attributes, visual theme | Layout geometry rules or hit-test geometry generation |
| `wall-geometry-adapter` | Positions, normals, UVs, indices, Three geometry lifecycle and groups | Semantic layout ownership or scene/tour mutation |
| Three/Threlte | Scene graph, GLBs, materials/PBR, lights, shadows, cameras, resource lifecycle | Authored layout semantics or a duplicate geometry compiler |

Derived geometry is disposable and cacheable. It is invalidated by relevant
layout changes and is never serialized into `MuseumProject`.

## 5. Roadmap

Two tracks: the **G-track** below builds the graphics foundation; **H1** (unified
3D editing) is a separate milestone that depends on G1+G4 and may run in parallel
with G5.

### G0 — Finish the source-of-truth cutover (`KEEP`, implemented)

B5 promotes serialized layout architecture while preserving scene/tour behavior,
stable room IDs, the single camera system, and visitor isolation. Deprecate or
generate `rooms.ts` only within the B5 contract. Do not fold G1–G6 into B5.

### G1 — Shared geometry compiler (`KEEP`, implemented)

Focused implementation plan:
[`2026-08-13-graphics-g1-shared-geometry-compiler.md`](./2026-08-13-graphics-g1-shared-geometry-compiler.md).

Introduce one pure visitor-safe API:

```ts
compileLayoutGeometry(document: LayoutDocument): CompiledLayoutGeometryResult
```

The result carries compiled data plus structured geometry issues. It must not
mutate the document, read Svelte state, or import Three/SVG/browser APIs.

Consolidate the existing editor/runtime logic for:

- adaptive line and auto-Bezier sampling;
- cumulative arc-length tables, parameter values, tangents, and normals;
- opening interval normalization and wall solid splitting;
- rectangular, rounded, and pointed opening elevation profiles;
- floor and ceiling polygons;
- layout-object footprints;
- room, wall, opening, object, floor, and document bounds;
- precomputed query geometry (segments, spans, polygons, and AABBs) with stable
  IDs, cache keys, and data suitable for a later grid/R-tree index.

Migrate Plan, editor 3D, and visitor shell adapters incrementally. Once migrated,
no consumer may independently resample layout curves or reinterpret opening
topology.

Parity fixtures must cover line/L-shaped rooms, auto-Bezier walls, multiple doors
and windows, all opening profiles, floor elevation, objects, and invalid geometry.
Compare normalized samples, arc lengths, tangents/normals, wall sections,
profiles, polygons, and bounds across all three consumers.

### G2 — Explicit Plan render boundary (`KEEP`, implemented)

Focused implementation plan:
[`2026-08-13-graphics-g2-plan-render-model.md`](./2026-08-13-graphics-g2-plan-render-model.md).

Derive a pure `PlanRenderModel` from `CompiledLayoutGeometry` plus optional
renderer-neutral camera/tour and interaction projections. The model defines this
back-to-front order:

1. fills;
2. strokes;
3. walls;
4. openings;
5. objects;
6. camera paths;
7. view cones and look targets;
8. portal crossings and collision warnings;
9. timing labels;
10. selection overlays;
11. interaction handles;
12. labels.

Keep six concerns separate: document mutation, compiled geometry, world-to-screen
view transforms, rendering order, transient interaction overlays, and visual
styling. Use stable semantic keys and world-space primitives; the SVG adapter
owns SVG attributes and applies the view transform. SVG remains the production
renderer until the performance gate proves it is the limiting layer.

### G3 — Graphics performance harness (`KEEP`, implemented)

Focused implementation plan:
[`2026-08-13-graphics-g3-performance-harness.md`](./2026-08-13-graphics-g3-performance-harness.md).

Before changing renderer technology or claiming an optimization, add deterministic
generated layouts at 10, 100, and 1,000 rooms. Each scale must contain a fixed mix
of lines/curves, openings/profiles, and objects so results remain comparable.

Capture at least:

- layout compilation time;
- initial Plan render time;
- pan/zoom p50 and p95 frame time;
- drag/edit p50 and p95 frame time;
- hit-test and snapping-query latency;
- SVG node count;
- Three object and material counts;
- draw calls and triangles;
- GPU/frame time where the browser exposes it;
- memory; and
- 3D regeneration time.

Pin browser version, device profile, fixture seed, warm-up, sample count, and
measurement method. Check in fixture generators and baseline results. Before G4
or G5 optimization begins, record explicit target and fail budgets for the
currently supported product scale; 10/100/1,000-room results are comparison tiers,
not an unsupported claim that every tier must be interactive. A budget change
requires a recorded product or measurement reason, not a quieter regression.

### G4 — Procedural architectural meshes (`KEEP`, implemented)

Focused implementation plan:
[`2026-08-13-graphics-g4-procedural-architectural-meshes.md`](./2026-08-13-graphics-g4-procedural-architectural-meshes.md).

Replace sampled wall-chord boxes progressively with meshes built from compiled
wall sections:

```text
Compiled wall sections
        ↓
   mesh builder
        ↓
positions · normals · uvs · indices
        ↓
THREE.BufferGeometry
```

Required work includes indexed topology, wall thickness/corners, opening side and
lintel faces, arch profiles, stable UV generation, material reuse, and disposal.
Merge/batch at a room-and-material scale where measurement supports it. Preserve
reasonable edit/selection granularity through stable groups or section-to-index
metadata. Do not create one giant museum mesh, and do not replace Three.js as the
scene/material/camera/resource layer.

The G3 harness records the before baseline and verifies each migration slice.
Visual parity fixtures cover curve joins, wall ends, opening reveals, normals,
UV continuity, shadows, and 2D/3D agreement.

### G5 — Measured optimization and scale (`KEEP` then `LATER`)

Apply optimizations in this order, stopping when budgets pass:

```text
measure
  ↓
cache derived geometry
  ↓
avoid whole-document work during transient edits / use partial rebuilds
  ↓
stable render objects and keys
  ↓
shared materials
  ↓
continuous or merged BufferGeometry
  ↓
viewport/frustum culling
  ↓
zoom-dependent detail
  ↓
spatial indexing
  ↓
instancing where appropriate
  ↓
only then investigate lower-level renderer changes
```

Spatial indexing is conditional. Add a render-neutral uniform grid or R-tree only
when profiling shows linear queries materially consuming the hit-test, snapping,
collision, selection, nearby-wall/opening, or culling budgets. Build it from
compiled query records, benchmark construction/update cost, and keep a linear
reference path for parity tests.

### G6 — Bounded graphics experiments (`EXPERIMENT`)

After the SVG/Three baseline and in-stack optimization, one isolated Plan backend
experiment may target a measured problem: GPU CAD primitives, anti-aliased stroke
or infinite-grid shaders, GPU picking, path/view-cone rendering, or heat-map/debug
visualization.

```text
PlanRenderModel
      ├─→ SVG production baseline
      └─→ experimental WebGPU/WGSL backend
```

The experiment stays dev-only, persists no GPU/shader state, and benchmarks the
same fixtures against SVG. Production consideration requires a meaningful budget
win, feature/visual parity, supported-browser behavior, maintainable fallback,
and a concrete product need. “Newer API” is not evidence.

### H1 — Unified 3D editing (`KEEP`, separate track; proposed)

Focused implementation plan:
[`2026-08-14-graphics-h1-unified-3d-editing.md`](./2026-08-14-graphics-h1-unified-3d-editing.md).

3D gizmos are not part of the G-track exit. They return at the unified
layout/scene editing milestone (`CURRENT.md`): 3D room/wall/opening/object editing
with identity mapped back to `LayoutDocument`, in-context camera/tour authoring
through the existing camera-route/camera-motion system, a unified outliner, and
edits routed through the shared chronological history (`layout`-tagged ops,
already shipped in B3).

Target:

- gizmo translate/rotate/scale on rooms, walls, openings, and layout objects in 3D;
- picking against compiled geometry and procedural section identity — never
  anonymous chord boxes;
- plan and 3D remain two views of one `LayoutDocument`; no second geometry source;
- edits validate through `compileLayoutGeometry()` so plan/3D parity holds;
- export already flows through the serialized project (B5), so the closed loop is
  plan → 3D show → 3D edit → export.

Gates:

- after **G1** — gizmo edits must validate against the one compiled geometry;
- after **G4** — section→index metadata is the bridge between a rendered mesh and
  an editable document element;
- **G3/G5 non-blocking** — H1 may run in parallel with G5;
- mirror **G2**'s hit-identity/key pattern for 3D picking.

## 6. Conditional technology gates

Rust/WASM is not a numbered production milestone. Reconsider it only after
algorithmic and TypeScript improvements leave a measured CPU-heavy kernel such as
large-scale curve flattening, polygon triangulation, spatial-index construction,
or bulk intersection/collision queries.

Any proposal requires a batched JS/WASM boundary, typed-array-friendly I/O, a
TypeScript reference implementation, parity tests, and a benchmark that includes
transfer/serialization overhead. A full geometry-engine rewrite stays rejected
unless evidence changes the product constraint.

A custom Three replacement, native `wgpu` 3D backend, or alternate production 3D
renderer is research-only unless Three/Threlte presents a concrete limitation
that survives profiling and existing-stack optimization.

## 7. Classification

| Proposal | Class | Reason/gate |
|----------|-------|-------------|
| Shared geometry compiler | `KEEP` | Removes real editor/runtime duplication and creates correctness parity |
| `PlanRenderModel` + SVG adapter | `KEEP` | Establishes the existing Plan contract without renderer churn |
| Procedural indexed `BufferGeometry` | `KEEP` | Fixes current chord-box topology/object-count debt within Three |
| Performance fixtures, budgets, regressions | `KEEP` | Required evidence for every later optimization |
| Caching, partial rebuilds, stable keys/materials | `KEEP` | First-line responses to measured work |
| Culling, zoom detail, spatial index, instancing | `LATER` | Add only when the harness identifies the relevant scaling cost |
| WebGPU/WGSL Plan backend | `EXPERIMENT` | One bounded comparison after SVG optimization |
| Targeted Rust/WASM kernel | `LATER` | Only for an isolated measured CPU bottleneck with boundary-cost proof |
| Full Three.js replacement / custom `wgpu` engine | `REJECT` | Duplicates a capable production scene/resource stack without a current problem |
| Multiple speculative render backends | `REJECT` | Ongoing complexity without evidence |
| Unified 3D gizmo editing (`H1`) | `KEEP` (separate track) | Closes the authoring loop (plan → 3D → gizmo → export); gated after G1+G4 |

## 8. Explicit non-goals

- full Three.js replacement or a custom production `wgpu` 3D engine;
- production Rust geometry rewrite;
- multiple speculative render backends;
- arbitrary shader persistence;
- custom text/glyph system;
- native desktop/window-system work;
- real-time general CSG or Blender-style mesh editing;
- GPU compute merely for demonstration;
- a second scene, navigation graph, camera route, or motion system; and
- moving scene entities, materials, camera data, or generated geometry into
  `LayoutDocument`.

## 9. Program exit criteria

The graphics foundation is established when Plan, editor 3D, and visitor 3D use
one compiled geometry contract; Plan renders through an explicit model; wall
architecture uses verified procedural buffers at justified granularity; baseline
fixtures and budgets are reproducible; and every later optimization or experiment
is traceable to a measured product problem.

H1 (unified 3D editing) is a separate track and is **not** required for this
graphics exit; it becomes schedulable once G1 and G4 land.

## 10. Known optimization backlog (uncommitted)

Deferred work surfaced during the G1 close and the layout viewport-switch
review. Each item is traced to a measured or static-analysis cost; none is a
correctness blocker today. Assign to **G3** (performance harness) unless marked
quick-win (safe, isolated, output-preserving).

| # | Optimization | Cost today | Home |
|---|--------------|-----------|------|
| 1 | Incremental per-room recompile | every edit deep-clones + validates twice + recompiles the whole document | G3 |
| 2 | Merge validate + compile into one pass | two full-document validation passes per edit | G3 |
| 3 | Drop `cloneJson` per edit (structural / `$state` updates) | JSON round-trip of the whole layout per mutation | G3 |
| 4 | Spatial index for self-intersection + picking | O(n²) all-pairs segment intersection | G3 |
| 5 | Binary-search `pointAlongSamples`, unify with `pointAtDistance` | linear scan per lookup; O(samples²) in solid-span build | quick-win |
| 6 | Thread precomputed cubics into auto-bezier tangent eval | cubics recompiled per sample (O(N·A²)) | quick-win |
| 7 | Unify duplicate layout codecs (shared vs editor) | divergent unique-id strictness across import/save | quick-win |
| 8 | `frameloop="demand"` + invalidate for idle 3D | render loop ticks at 60fps while idle | quick-win (with viewport switch) |
| 9 | Cull invisible ceiling meshes | hidden ceilings still draw (opacity 0) | quick-win |
| 10 | Lazy / cheaper `cacheKey` (not `JSON.stringify`) | per-query-record stringify allocation | G3 |
| 11 | One shared `Shape` per room (floor + ceiling) | `Shape` allocated twice per room per rebuild | quick-win |
