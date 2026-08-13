# G1 — Shared Geometry Compiler

**Date:** 2026-08-13  
**Status:** Implemented  
**Parent:** [`2026-08-13-graphics-architecture-roadmap.md`](./2026-08-13-graphics-architecture-roadmap.md)  
**Prerequisite:** [`2026-08-13-layout-cad-b5-runtime-cutover.md`](./2026-08-13-layout-cad-b5-runtime-cutover.md)  
**Handoff:** [`../hand-off/CURRENT.md`](../hand-off/CURRENT.md)  
**Contracts:** [`../architecture.md`](../architecture.md) · [`../components/persistence.md`](../components/persistence.md)

## Goal

Replace the editor/runtime geometry split with one pure visitor-safe compiler:

```ts
compileLayoutGeometry(document: LayoutDocument): CompiledLayoutGeometryResult
```

Plan, editor 3D, and visitor 3D must consume the same sampled curves, opening
topology, elevation profiles, polygons, object footprints, bounds, and query
records. The authored `LayoutDocument` remains unchanged and generated geometry
remains disposable, cacheable, and absent from `MuseumProject` JSON.

G1 preserves the current production rendering technologies and visual strategy:
SVG in Plan and sampled chord boxes in Threlte/Three. It consolidates what those
renderers receive; it does not implement the G2 `PlanRenderModel` or G4
procedural `BufferGeometry` stages.

## Current gaps

| Concern | Editor today | Visitor today | G1 outcome |
|---------|--------------|---------------|------------|
| Curves | Adaptive centripetal auto-Bezier samples with distance, `t`, tangent, and normal | Lines are densified; auto-Beziers are reduced to authored-anchor polylines | One adaptive sampler with the locked `0.01 m` flatness and `0.25 m` maximum span |
| Openings | Sorted intervals, sill solids, lintels, rounded/pointed profiles | Separate interval split; no sill solid and no compiled profile boundary | One normalized interval and solid-section model |
| Polygons | Preview model samples curved boundaries | Runtime builder reconstructs them separately | One floor/ceiling polygon per compiled room |
| Objects | Editor-only transform sampling, footprint, and AABB derivation | Not rendered | Shared compiled descriptors; visitor rendering remains out of scope |
| Bounds | Aggregate editor preview bounds only | None | Room, wall, opening, object, floor, and document bounds |
| Queries | Plan repeatedly resamples and scans authored geometry inline | Portal transforms use finite-difference probes | Stable precomputed point/span/polygon/AABB records with linear reference queries |
| Aggregate | `buildLayoutPreviewModel()` | `buildLayoutArchitectureModel()` | `compileLayoutGeometry()` only |

The third sampler inside `layout-room-frame.ts` is different: it is a frozen
layout v1/v2 persistence-migration algorithm. Its numerical output determines
canonical v3 room frames. G1 must cover it with golden tests and leave it
versioned and isolated; it is not a renderer/query path and must not be silently
replaced by the adaptive production sampler.

## Locked decisions

- Put the public compiler, its types, and all reusable geometry kernels under
  `$lib/layout/**`. Nothing in the compiler graph may import `$lib/editor/**`,
  Svelte, DOM/SVG, browser APIs, Threlte, or Three.js.
- Use plain render-neutral values and readonly-by-convention arrays in G1. Typed
  arrays remain allowed later but are not required for this migration.
- Preserve document order for floors, rooms, walls, openings, and objects.
  Deterministic stable keys supplement that order; they do not reorder authored
  content.
- Compile each room once. A blocking room issue omits that room and its derived
  records while other valid rooms and layout objects remain available to the
  editor. The result always returns compiled geometry plus all structured issues.
- The canonical visitor runtime compiles once beside project validation and
  fails closed if any blocking geometry issue exists. It passes the compiled
  result into `LayoutMuseumShell`; the shell does not compile reactively.
- Preserve the current richer editor geometry as the compatibility reference:
  adaptive auto-Beziers, sill solids, and rounded/pointed profiles become visitor
  behavior too. Line-layout output must retain Chopin parity.
- Precompute both semantic wall sections and renderer-neutral clipped solid
  spans. The existing 3D adapters emit chord boxes directly from those spans;
  they may style them but may not clip sections or evaluate arch profiles again.
- Compile committed layout-object footprints and rotation-aware world AABBs for
  `box | plane | cylinder | sphere | profile`. Preserve current `profile` object
  transform/dimensions behavior; G1 does not introduce profile extrusion.
- Query records use stable qualified IDs and exact deterministic content keys.
  Content keys include only relevant authored inputs and dependency keys, so an
  unrelated edit does not invalidate every record. G1 emits the keys but adds no
  cache, incremental rebuild, grid, or R-tree.
- Plan keeps the current hit priority:
  vertex → interior anchor → opening → object → wall → room. It uses compiled
  query records for committed geometry while transient drafts/drag ghosts remain
  interaction-owned overlays.
- Opening `offset` remains meters along the compiled sampled arc. Portal
  transforms use the compiled opening center frame; geometry never creates or
  infers navigation or room adjacency.
- Bounds are axis-aligned and renderer-neutral. Room bounds describe room
  architecture; object bounds stay separate; floor bounds include its room
  architecture plus objects assigned to those rooms; document bounds include
  all compiled architecture and objects.
- Do not change `LayoutDocument` v3 or serialize any compiled value.
- Keep `camera-route.ts`, `camera-motion.ts`, the tour FSM, and scene resolution
  untouched.

## Public contract

The exact file split may vary, but the public contract must express these
relationships:

```ts
type LayoutGeometryIssue = {
  path: string;
  code: string;
  message: string;
  targetId?: string;
  severity?: 'warning' | 'error';
};

type LayoutBounds2 = { min: LayoutVec2; max: LayoutVec2 };
type LayoutBounds3 = { min: Vec3; max: Vec3 };

type CompiledCurveSample = {
  point: LayoutVec2;
  distance: number;
  t: number;
  tangent: LayoutVec2;
  normal: LayoutVec2;
};

type CompiledLayoutGeometry = {
  floors: readonly CompiledLayoutFloor[];
  rooms: readonly CompiledLayoutRoom[];
  objects: readonly CompiledLayoutObject[];
  queries: CompiledLayoutQueryGeometry;
  bounds: LayoutBounds3 | null;
};

type CompiledLayoutGeometryResult = {
  geometry: CompiledLayoutGeometry;
  issues: LayoutGeometryIssue[];
};
```

Each compiled entity and query record carries:

```ts
type CompiledIdentity = {
  id: string;       // qualified semantic identity
  cacheKey: string; // deterministic relevant-input identity
};
```

Use collision-safe tuple serialization for keys rather than delimiter parsing.
Examples are conceptual:

```ts
geometryId(['wall', floorId, roomId, segmentId]);
geometryId(['opening', floorId, roomId, openingId]);
geometryId(['wall-span', floorId, roomId, segmentId, sampleIndex]);
```

### Curves and walls

Every compiled wall contains:

- its source floor, room, and segment IDs;
- total sampled length;
- ordered samples with cumulative distance, parameter, tangent, and normal;
- ordered curve spans between consecutive samples, each with a 2D AABB;
- normalized opening intervals and opening centerline polylines;
- opening-free centerline polylines for the current Plan wall strokes;
- solid sections for side, sill, and lintel regions;
- compiled rectangular, rounded, or pointed elevation profiles;
- clipped solid spans with start/end points and distances plus resolved
  bottom/top elevation values for the existing chord-box adapters; and
- wall and opening 2D/3D bounds.

Line segments are densified by the same maximum-span rule as curves. All arc
lookups, projections, range slicing, and profile-height evaluation live in shared
pure helpers operating on compiled data.

### Rooms, floors, and objects

Every compiled room contains the floor/ceiling elevations and thicknesses,
sampled floor/ceiling polygons, compiled walls, and architectural bounds. A
compiled floor carries stable room IDs and aggregate bounds. A compiled object
carries its stored transform/dimensions, readonly state, plan footprint, and
world AABB.

The compiler output may repeat small identity fields to keep consumers simple,
but it must not contain Maps tied to mutable UI state, DOM/SVG paths, Three
objects, materials, cameras, or GPU resources.

### Query geometry

Emit flat, deterministic record arrays suitable for the current linear queries
and a later spatial index:

- points: authored room vertices and auto-Bezier interior anchors;
- spans: sampled wall spans, normalized opening spans, and wall solid spans;
- polygons: room floor polygons and committed object footprints; and
- AABBs: one on every query record plus entity-level room, wall, opening,
  object, floor, and document bounds.

Opening records also retain a render-neutral center point, tangent, and normal;
the Three adapter converts that frame to portal yaw without finite-difference
probes. Records retain semantic IDs, stable order, source IDs, and enough
geometry for projection/containment without reopening `LayoutDocument` or
resampling a curve.
The query module provides a linear reference implementation for projection,
point-in-polygon, range, and hit lookup. G1 does not build an index.

## Issue and determinism rules

- Reuse one shared `LayoutGeometryIssue` contract. Move the current pure room
  geometry validation below `$lib/layout`; do not duplicate validation inside
  the compiler.
- Run a finite/connectivity preflight before sampling. The compiler then builds
  one prepared sampled-room intermediate and passes it into geometry validation,
  section/profile compilation, bounds, and queries; validation must not resample
  it. A convenience validator used by edit candidates may create that same
  intermediate through the shared kernel.
- Structural/schema validation remains the layout/project codec's job. Geometry
  validation owns effective lengths, connectivity, intersections, opening
  intervals, wall height, and profile viability.
- Keep exact paths and target IDs for existing issue codes. Add focused codes
  only where compiling object geometry or bounds can fail safely.
- Invalid rooms produce issues and no partial wall/polygon/query records for that
  room. Valid rooms compile normally in the same result.
- Layout objects compile independently after structural validation. An invalid
  object produces an object-targeted issue and is omitted from geometry/bounds.
- The compiler does not mutate input arrays or points. A deep-frozen fixture must
  compile without throwing, and repeated compilation of equal canonical JSON
  must deep-equal after the parity normalizer.
- Normalize only at test boundaries. Production geometry retains full numeric
  precision and does not round authored or derived values.

## Implementation sequence

### 1. Freeze compatibility fixtures

1. Add shared G1 fixtures for a line rectangle, an L-shaped room, an
   auto-Bezier wall, multiple non-overlapping doors/windows, all three opening
   profiles, an elevated floor, all layout-object kinds, and invalid geometry.
2. Add canonical Chopin line-layout normalized goldens before deleting either
   aggregate builder.
3. Add layout v1/v2 room-frame migration goldens, including a curved room, to
   prove G1 does not change persisted migration origin/yaw.
4. Define one test-only numeric normalizer for samples, distances,
   tangents/normals, sections, profiles, polygons, and bounds. Use a documented
   tolerance; do not hand-round production code.

### 2. Establish the visitor-safe kernel

1. Move/extract auto-Bezier compilation and adaptive curve sampling into
   `$lib/layout/**`; update editor editing/validation imports to use it.
2. Move/extract opening interval, wall split, and arch-profile derivation into
   shared modules.
3. Split pure object transform/footprint/AABB derivation from editor mutation
   commands and move only the derivation below `$lib/layout`.
4. Move pure geometry validation and its issue type below `$lib/layout`.
5. Preserve editor-path compatibility re-exports only during the migration;
   remove them once all imports move.
6. Keep the versioned v1/v2 room-frame sampler private and covered by its frozen
   goldens.

### 3. Implement `compileLayoutGeometry()`

1. Preflight, sample, and validate each room through one prepared intermediate;
   each accepted segment is sampled exactly once per compilation.
2. Build sampled walls, curve spans, normalized openings, profiles, solid
   sections, clipped solid spans, and floor/ceiling polygons from the same
   samples.
3. Compile layout-object descriptors.
4. Derive entity-level and aggregate bounds.
5. Emit stable IDs, relevant-input cache keys, and flat query records.
6. Add pure lookup/project/range/containment helpers over compiled records.
7. Prove document immutability, deterministic output, stable ordering/keys, and
   structured partial failure.

### 4. Migrate editor preview state

1. Replace `LayoutPreviewModel`, separately computed preview bounds, and repeated
   rebuild calls with one stored `CompiledLayoutGeometryResult` or its geometry,
   issues, and document bounds.
2. Keep compiled geometry session-only and rebuild it after committed/transient
   preview document replacement exactly where the old model was rebuilt.
3. Preserve independent layout/scene baselines, dirty state, snapshots, history,
   import/reset behavior, and replacement-only reframing.
4. Do not introduce caching or partial compilation in this stage.

### 5. Migrate Plan

1. Render committed room polygons, wall solid-centerline spans, opening
   centerlines, and object footprints from compiled data.
2. Replace committed-geometry resampling in framing, wall/opening projection,
   room containment, and object hit testing with compiled query records and the
   linear reference queries.
3. Preserve vertex/anchor handles, selection overlays, dimensions, drafts,
   object drag ghosts, snapping UX, and current hit priority.
4. Keep world/screen transforms, inline SVG ordering, styles, and interaction
   overlays in `LayoutPlanViewport.svelte`; moving them into a `PlanRenderModel`
   belongs to G2.

### 6. Migrate editor 3D

1. Feed `LayoutPreviewScene.svelte` compiled room polygons, objects, and clipped
   wall solid spans.
2. Remove local section clipping, arc-distance interpolation, and arch-profile
   evaluation.
3. Preserve current mesh names, selection colors, surface `userData`, ceiling
   toggle, primitive object rendering, and chord-box topology.
4. Keep Three `Shape` construction, materials, and mesh lifecycle inside the
   adapter.

### 7. Migrate visitor 3D

1. Compile `chopinProject.layout` once in `chopin-project.ts` after project
   validation; reject the runtime with the first blocking geometry issue.
2. Add compiled geometry to `MuseumRuntime` and pass it through
   `MuseumScene` to `LayoutMuseumShell`.
3. Render floors, ceilings, wall chord boxes, and portals from compiled rooms,
   solid spans, and opening center frames.
4. Remove runtime curve sampling, section splitting, finite-difference portal
   tangents, and reactive architecture compilation from the shell.
5. Keep layout objects absent from the visitor scene in G1.

### 8. Retire duplicate paths and guard the boundary

1. Delete `buildLayoutArchitectureModel()` and its duplicate runtime helpers.
2. Delete `buildLayoutPreviewModel()`, editor-only preview bounds aggregation,
   and geometry-only wrappers after their last consumers migrate.
3. Split remaining editor mutation helpers from removed render/query helpers;
   retain shared kernel calls needed to validate candidate edits.
4. Add a source/import-boundary test proving Plan, editor 3D, and visitor 3D do
   not import or define independent curve sampling, wall splitting, profile
   evaluation, or geometry bounds logic.
5. Extend the visitor import graph test to require the shared compiler and still
   forbid editor, legacy room/compiler, standalone scene, and legacy shell paths.

### 9. Close the slice

1. Run focused compiler/kernel/adapter tests, the full museum suite, Svelte
   check, and the production build.
2. Inspect visitor chunks/imports for the shared compiler and for absence of
   editor helpers and retired aggregate builders.
3. Perform editor Plan/3D and visitor visual QA on the parity fixtures and the
   canonical Chopin project.
4. Update architecture/persistence contracts only if implementation changes a
   documented contract, mark G1 implemented in the roadmap/handoff, and name G2
   as the next slice.

## Parity and regression matrix

| Fixture | Required assertions |
|---------|---------------------|
| Rectangle + L room | Polygon order, line density, lengths, wall sections, floor/ceiling elevations, per-entity/document bounds |
| Auto-Bezier | Adaptive sample positions/parameters, monotonic arc distances, maximum span, unit tangents/normals, opening range slicing |
| Multiple openings | Stable interval ordering, solid stubs, window sill, lintels, overlap/out-of-bounds issues |
| Profile matrix | Rectangular/rounded/pointed top boundaries, resolved chord-span bottoms, invalid-rise issues |
| Elevated floor | Floor/ceiling/slab Y extents, wall/opening 3D bounds, floor/document aggregation |
| Object matrix | Stored transforms/dimensions, rotation-aware footprints/AABBs, readonly profile behavior, stable hit order |
| Invalid geometry | Non-finite/zero/disconnected/self-intersecting rooms, missing opening segment, overlap, out-of-bounds, over-height, invalid profile, partial valid-room output |
| Chopin project | Same room count/IDs/order, line samples, rectangular cutouts, polygons, elevations, portal center transforms, zero blocking issues |
| Consumer parity | Normalized samples, lengths, tangents/normals, sections, profiles, polygons, objects, bounds, and stable IDs received by Plan/editor/visitor adapters |
| Persistence migration | Exact frozen v1/v2-derived frame origin/yaw and canonical v3 serialization |

Numerical tests should combine exact identity/order assertions with tolerance-based
geometry assertions. Tangents and normals must be finite, unit length within
tolerance, mutually perpendicular, and consistently oriented.

## Expected files

New/shared, conceptually:

```text
apps/museum/src/lib/layout/layout-geometry.ts
apps/museum/src/lib/layout/layout-geometry-types.ts
apps/museum/src/lib/layout/layout-geometry-curve.ts
apps/museum/src/lib/layout/layout-geometry-openings.ts
apps/museum/src/lib/layout/layout-geometry-objects.ts
apps/museum/src/lib/layout/layout-geometry-queries.ts
apps/museum/src/lib/layout/layout-geometry-validation.ts
apps/museum/src/lib/layout/__fixtures__/layout-g1-fixtures.ts
apps/museum/src/lib/layout/layout-geometry.test.ts
apps/museum/src/lib/layout/layout-geometry-parity.test.ts
apps/museum/src/lib/layout/layout-geometry-boundary.test.ts
```

Primary edits:

```text
apps/museum/src/lib/content/chopin-project.ts
apps/museum/src/lib/editor/EditorViewport.svelte
apps/museum/src/lib/editor/layout/layout-preview-state.svelte.ts
apps/museum/src/lib/editor/layout/LayoutPlanViewport.svelte
apps/museum/src/lib/editor/layout/LayoutPreviewScene.svelte
apps/museum/src/lib/museum/MuseumScene.svelte
apps/museum/src/lib/museum/layout/LayoutMuseumShell.svelte
apps/museum/src/lib/museum/visitor-import-boundary.test.ts
apps/museum/src/lib/layout/layout-room-frame.test.ts
editor layout mutation/validation imports and focused tests
```

Move, split, or remove after migration:

```text
apps/museum/src/lib/layout/layout-architecture.ts
apps/museum/src/lib/editor/layout/layout-auto-bezier.ts
apps/museum/src/lib/editor/layout/curve-geometry.ts
apps/museum/src/lib/editor/layout/draft-geometry.ts
apps/museum/src/lib/editor/layout/arch-profile.ts
apps/museum/src/lib/editor/layout/layout-validation.ts
apps/museum/src/lib/editor/layout/layout-mesh-factory.ts
apps/museum/src/lib/editor/layout/layout-preview-bounds.ts
geometry portions of layout-editing.ts, layout-opening-editing.ts,
and layout-object-editing.ts
```

Exact helper filenames may be consolidated if the public compiler boundary,
visitor safety, and test ownership stay clear.

## Verification

Automated:

```text
npm test -w @portfolio/museum -- <focused G1 layout test files>
npm test -w @portfolio/museum
npm run check -w @portfolio/museum
npm run build -w @portfolio/museum
```

Manual editor QA:

- Plan and 3D agree for line, L-shaped, and auto-Bezier rooms.
- Door/window gaps and all profile kinds agree in Plan and 3D.
- Opening place/drag, wall bend, room relocation, object place/drag, selection,
  hit priority, undo/redo, import/reset, dirty state, and replacement reframing
  behave as before.
- Elevated floors, ceiling toggle, object transforms, invalid-room issues, and
  mixed valid/invalid partial previews remain correct.

Manual visitor QA:

- All nine guided nodes, Back, free/direct navigation, reduced motion, and HUD
  room updates remain unchanged.
- Canonical floors, ceilings, rectangular portals, Music Chamber exclusion, room
  presentation, ground plinth, and shadows render once and in the same locations.
- Curved/profile parity fixtures render through the visitor adapter without
  editor imports.
- `/dev/museum-editor` remains production 404 and browser errors stay clean.

## Exit criteria

G1 is complete only when:

- one visitor-safe `compileLayoutGeometry()` derives all committed layout
  samples, sections, profiles, polygons, object footprints, bounds, and query
  records;
- Plan, editor 3D, and visitor 3D consume that contract and no longer resample
  curves or reinterpret opening topology;
- the only separate sampler is the explicitly frozen v1/v2 room-frame migration
  algorithm, protected by exact persistence goldens;
- every required parity fixture passes across the three consumers;
- invalid geometry returns stable structured issues and never leaks non-finite
  render/query data;
- no compiled geometry enters layout/project serialization;
- the visitor import graph remains editor-free and production builds cleanly;
  and
- the full test suite, Svelte check, production build, and editor/visitor QA pass.

## Explicit non-goals

- `PlanRenderModel`, SVG render-order extraction, or Plan styling changes (G2);
- performance harnesses, budgets, or scale claims (G3);
- indexed `BufferGeometry`, wall joins/reveals/UVs, mesh batching, or replacing
  chord boxes (G4);
- caching, partial rebuilds, spatial indexes, culling, LOD, or instancing (G5);
- WebGPU, Rust/WASM, or alternate renderers;
- visitor rendering/editing of layout objects;
- layout schema/version changes or generated geometry persistence;
- portal adjacency inference, CSG, opening assets/frames, or 3D room gizmos; and
- any new scene, navigation graph, camera route, or motion system.
