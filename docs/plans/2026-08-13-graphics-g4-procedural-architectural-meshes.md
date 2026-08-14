# G4 — Procedural Architectural Meshes

**Date:** 2026-08-13
**Status:** Proposed
**Parent:** [`2026-08-13-graphics-architecture-roadmap.md`](./2026-08-13-graphics-architecture-roadmap.md)
**Prerequisite:** [`2026-08-13-graphics-g1-shared-geometry-compiler.md`](./2026-08-13-graphics-g1-shared-geometry-compiler.md) · [`2026-08-13-graphics-g3-performance-harness.md`](./2026-08-13-graphics-g3-performance-harness.md)
**Handoff:** [`../hand-off/CURRENT.md`](../hand-off/CURRENT.md)
**Contracts:** [`../architecture.md`](../architecture.md) · [`../components/persistence.md`](../components/persistence.md)

## Goal

Replace the sampled wall-chord `BoxGeometry` strips with **indexed procedural
`BufferGeometry`** built from compiled wall sections. Wall architecture becomes a
real extruded solid — indexed topology, wall thickness and corners, opening side
and lintel faces, arch profiles, stable UVs, material reuse, and disposal —
instead of one axis-aligned box per solid span.

The primary output is **one watertight, surface-major `IndexedWallMesh` per
room**: corner edges share positions (no crack/z-fight) while hard corners split
vertex tuples per face normal, indices are laid out so draw calls collapse to
surface-class count rather than section count, and semantic section ranges are
metadata for future H1 picking. Geometry is derived once from
`CompiledLayoutGeometry`, stays disposable and cacheable, is never serialized
into `MuseumProject`, and keeps Three/Threlte as the scene/material/camera/
resource layer. Unsafe inputs (offset-contour overlap — local curvature folds and global
non-adjacent overlaps) are rejected with structured issues, matching the G1
compiler.

G1 gave one shared `compileLayoutGeometry()` and G2 gave one explicit
`PlanRenderModel`. G4 is the first slice that makes the **3D wall topology**
match the compiled semantics it already describes — the chord-box debt the
roadmap classifies as `KEEP` because it is a real object-count/topology problem
within Three, not a renderer-technology change.

## Current state

Both 3D consumers emit the same chord-box approximation from
`wall.solidSpans`:

| Consumer | File | Shape |
|----------|------|-------|
| Visitor 3D | `LayoutMuseumShell.svelte` | one `T.BoxGeometry [length, topY−bottomY, thickness]` per span, positioned at the span midpoint, yaw-rotated by `-atan2(dz, dx)` |
| Editor 3D | `LayoutPreviewScene.svelte` | same box shape per span, with per-section material buckets |

The debt this causes:

| Concern | Today | G4 outcome |
|---------|-------|------------|
| Topology | Boxes overlap/gap at sharp bends, wall ends, and corners; no reveal/jamb faces; lintel is a plain box, not an arch | Extruded indexed solid with opening faces and corner joins |
| Arch profiles | `CompiledArchProfile.topBoundary` exists but is never rendered — rounded/pointed tops flatten to a box | Lintel underside follows the profile boundary at the correct elevation |
| Object/draw count | One mesh per span (`three-object-estimate` = 1,166 for Chopin) | One wall mesh per room; draw calls = surface-class count, not section count |
| UVs | Per-box mapping, resets every span | Metric UVs (arc length × floor-anchored height), continuous across a wall |
| Normals | Per-box faces | Tangent/normal-derived; smooth on curves, hard at corners (per-normal splits) |
| Selection/edit granularity | One object per span, anonymous | Wall/opening highlight via range-set overlays; `sectionToRange`/`wallRanges` metadata for future H1 picking |
| Disposal | Every span re-allocs geometry per rebuild | Adapter owns `BufferGeometry` lifecycle and releases only what it acquired |

The G3 harness currently *models* this debt: `analyticalThreeCounts()` and
`buildChordBoxScene()` both assume "one box per span, 12 triangles per box" —
that is the before baseline G4 must move.

## Target architecture

```text
CompiledRoom (walls + samples + tangents + normals + sections + solidSpans + openings)
        ↓
   wall-mesh-builder.ts  (pure, backend-neutral, no Three; room-scoped, watertight)
        ↓
   IndexedWallMesh { positions · normals · uvs · indices · materialGroups · sectionToRange · wallRanges }
        ↓
   wall-geometry-adapter.ts  (Three; wraps into THREE.BufferGeometry + material array)
        ↓
   Threlte <T.Mesh> — one per room
```

Ownership is unchanged from the roadmap table: the **pure builder** lives under
`$lib/layout/**` and imports no Svelte/DOM/Three; the **adapter** owns
`THREE.BufferGeometry` construction, material resolution, coalesced groups, and
disposal. Semantics stay in `CompiledLayoutGeometry`; scene/tour/materials stay
in the consumer.

### Mesh construction (locked approach)

The builder is **room-scoped** and emits **one watertight buffer per room**:

- **Profile interval union**: the wall's solid region is the union of each
  section's vertical profile in arc-length × height space — a rectangle
  (`bottomY → topY`) for **side** sections, and for **lintels** a polygon
  bounded below by `profile.topBoundary` (the arch curve, **opening-local**) and
  above by `topY`. `profile.topBoundary` is offset by `profileBaseY` into
  wall-local height, then by `room.floorElevation` into world elevation — the
  arch sits at its real height, not the sill height. Only the union's
  **exposed boundary edges** are swept into faces: opening jambs/reveals, sill
  tops, and arch undersides. Interior edges between adjacent section profiles
  (side→sill, lintel→side) emit no faces.
- **Closed boundary (no wall-end caps)**: a room boundary is a validated closed
  loop, so walls are continuous at every segment joint — **no cap faces are
  emitted at joints**. The only vertical exposed faces are opening
  jambs/reveals where a solid interval meets an opening gap, plus profile
  transitions (sill top, arch underside). An opening touching a segment
  endpoint joins **profile-aware**: the overlapping solid portions of the two
  walls weld (shared positions), and a partial reveal is emitted only for the
  profile difference, keeping the corner manifold — pinned by door/window-at-corner
  fixtures.
- **Strip**: each solid interval extrudes `±thickness/2` along the sample
  normal; curved undersides follow the arch polyline so rounded/pointed tops
  render, not flatten.
- **Wall top/bottom faces**: each section's exposed horizontal faces sit at its
  **actual elevations** — bottom face at `bottomY` (a floor face only when
  `bottomY === 0`), top face at `topY` (ceiling for full walls/lintels, sill
  height for sills), and the lintel's lower boundary following
  `profile.topBoundary`. The room solid is closed from above and below, not just
  at corners/reveals.
- **Corners**: because the room is one buffer, walls sharing a corner are
  watertight — coincident edge positions are shared. The `±thickness/2` offset
  lines are **intersected at every turn, including 90°**, to form clean outer
  corners, with a miter-limit and bevel fallback for sharp angles.
- **Offset-overlap rejection**: the builder offsets every wall strip and
  detects any self-intersection or overlap across the **whole room** — local
  curvature folds (`thickness/2 > curve radius`) **and** global overlaps between
  non-adjacent walls (straight parallel walls closer than the wall thickness,
  narrow concave necks). Any overlap returns structured issues with no mesh;
  the consumer fails closed. Validation may also fast-fail (minimum clearance /
  `wall_thickness_exceeds_curve_radius`). Tight-curve, narrow-neck, and
  close-parallel-wall fixtures pin this.
- **Normals**: from compiled tangents/normals — smooth across curved walls,
  hard at section boundaries and corners. Hard edges **split the vertex tuple
  per face normal** (the position is duplicated with a different normal);
  positions stay watertight at shared edges. Watertightness is asserted on
  shared-edge positions, never on identical indices.
- **Shared walls**: G4 does **not** guess adjacency from coordinates. Each room
  renders its own walls exactly as the chord-box shell does today. Step 0
  verifies the compiled Chopin + fixtures contain no geometrically coincident
  walls across rooms; if a pair exists it is recorded and deferred to a
  per-owner half-thickness follow-up — never deduped by lowest `roomId`.
- **UVs (metric)**: `u` = cumulative arc length (m) along the wall; `v` = height
  (m) above the room floor. Reveal/cap faces project `u` across the thickness
  and `v` over their height. The builder emits raw metric UVs; tile repeat is a
  material-factory concern (see locked decisions).
- **Surface-major index layout**: indices are ordered by surface class (default
  `kind`: all `side` faces contiguous, then all `lintel` faces), so one
  contiguous index range per surface class = one draw call. A consumer
  `classifySurface` refines the key (e.g. a single room wall-material key) to
  collapse further. `materialGroups` are the draw-call units; `sectionToRange`
  (per section) and `wallRanges` (per wall) are **pure metadata** — no geometry
  groups, no draw calls.
- **Selection highlight** is an **overlay over a matched range set**, not a
  group-material swap: `matchWallRanges(segmentId)` or
  `matchOpeningRanges(openingId)` returns the index ranges to shell, and
  `buildWallHighlightMesh` extrudes a thin translucent shell over them once per
  selection change; the overlay geometry is disposed on every selection change,
  clear, and unmount. The base mesh is immutable during selection.

## Locked decisions

- The pure builder (`buildRoomWallMesh`) lives under `$lib/layout/**`, is
  deterministic, and imports only compiled-geometry types and pure math — no
  Svelte, DOM, Threlte, or Three. It is covered by the same boundary guard as
  G1/G2 (no Three import reaches `$lib/layout`).
- The output is **renderer-neutral typed arrays** plus semantic metadata.
  `CompiledLayoutGeometry` itself does not change; the mesh is derived,
  disposable, and never serialized into `MuseumProject`.
- **The builder returns structured issues and rejects unsafe geometry**, like
  G1's `CompiledLayoutGeometryResult`: `buildRoomWallMesh` returns
  `{ mesh?, issues }`. Offset overlap (local curvature folds **and** global
  non-adjacent overlap) produces issues and no mesh.
- **Mesh issues have a delivery path.** The editor preflights the room build in
  `layout-preview-state.svelte.ts` (where `compileLayoutGeometry` already runs),
  stores the result in a new `wallMeshesByRoom: ReadonlyMap<string, IndexedWallMesh>`
  field (a derived cache keyed by `roomId`; a `Map`, not a plain object, so valid
  IDs like `constructor` cannot collide with prototype keys), and merges mesh
  issues into
  `layoutPreview.issues`. `EditorViewport` threads `wallMeshesByRoom` into
  `LayoutPreviewScene`, which renders only prebuilt meshes and never builds
  geometry inline. The cache rebuilds with `model`/`geometry` on every document
  mutation and is **not** part of the undo snapshot — undo restores the document
  and the cache rebuilds. The visitor renders an explicit failure surface for a
  room whose mesh fails to build — it never silently omits a room.
- **Primary output is one watertight room buffer.** Corner edges share
  positions; `materialGroups` are surface-major (draw calls = distinct surface
  classes); `sectionToRange` and `wallRanges` are metadata, never geometry
  groups. Hard corners split vertex tuples per face normal, so watertightness
  is tested on shared-edge positions, not identical indices.
- **Rooms are closed: no caps at segment joints.** The boundary is a validated
  loop; walls are continuous at joints. Exposed faces appear only at opening
  gaps (jambs/reveals) and profile transitions (sill top, arch underside).
- **Material identity is a consumer concern, not a builder concern.** The
  builder emits `kind: 'side' | 'lintel'`, `openingId`, `roomId`, and
  `segmentId` plus a `surfaceKey`; each consumer supplies a material factory:
  - **editor** — a **selection-independent** classifier (default `kind`), so the
    base mesh's surface-major ordering never changes on selection.
    `wallSectionMaterialKey` is **not** used for the base mesh (it depends on
    the current selection); selection color is applied only by the overlay
    mesh. Shared wall material instances, no per-span allocation;
  - **visitor** — an imperative factory that reproduces the **current wall
    surface** (`textures="off"`, plain `ChopinRoomPresentation` tint, no
    texture map) as a `THREE.Material` per distinct tint. `MuseumMaterial.svelte`
    is a Threlte component and cannot sit in a material array directly; extract
    its underlying plain-tint material path or build the wall material array
    imperatively with the same surface. Textures stay off in G4.
- **The adapter owns material-lifecycle truth.** Its factory returns
  `{ material, release? }`; `dispose()` disposes the geometry and invokes each
  `release()` once (for ref-counted/acquired variants such as
  `acquireMaterialVariant`), never disposing shared cache entries.
- **Selection highlight uses range-set overlays.** Wall highlight = all ranges
  of one `segmentId`; opening highlight = sill + lintel ranges of one
  `openingId`. No base-geometry rebuild, no group-material swap. The overlay
  `BufferGeometry` is disposed on every selection change, clear, and unmount.
  `sectionToRange` is **not** a G4 selection feature — it is future H1
  3D-picking metadata only.
- **UV convention is metric; tile repeat is material-side.** The builder emits
  raw meter UVs (no tile size). The material factory applies an inverse
  `[x, y]` tile-size repeat, so all room tints share one program with only
  `color` differing and there is no double-scale with `surfaceSize`.
- **No coordinate-guessed adjacency.** Coincident walls across rooms are
  verified absent in step 0; if present, deferred — never deduped by geometry.
- **No one giant museum mesh.** Granularity is one buffer per room.
- Door leaves/portal hardware (`RoomPortal.svelte`) stay separate; G4 folds the
  **wall reveal/jamb/lintel** into the wall mesh, not the door leaf.
- Curved walls are smooth-shaded; straight walls and corners are flat-shaded via
  per-normal vertex splits. Normals come from compiled data, never recomputed
  from the document.
- G3 harness re-baselines with a **method-version bump and a recorded reason**:
  `BENCH_METHOD_VERSION` goes 2→3 because `estimateWallMeshTopology` changes
  metric *meaning* (one-box-per-span → indexed topology), the baseline
  regenerates under the new version via an executable recorder, and every
  changed `three-*-estimate` budget carries a new reason (object/draw/triangle
  counts *should* drop).

## Public contract

```ts
// pure builder (backend-neutral, under $lib/layout/**)
type WallMeshSectionRef = {
  roomId: string;
  segmentId: string;
  sectionIndex: number;
  openingId?: string;
  kind: 'side' | 'lintel';
};

type WallMeshSurfaceKey = string; // 'side' | 'lintel' by default; consumer-overridable

type IndexedWallMesh = {
  roomId: string;
  positions: Float32Array;   // world XYZ; corner-edge positions shared (watertight)
  normals: Float32Array;     // world XYZ; hard edges split per face normal
  uvs: Float32Array;         // raw metric: u = arc length (m), v = height above floor (m)
  indices: Uint16Array | Uint32Array;   // surface-major order
  materialGroups: Array<{ surfaceKey: WallMeshSurfaceKey; start: number; count: number }>;
  sectionToRange: Array<WallMeshSectionRef & { surfaceKey: WallMeshSurfaceKey; start: number; count: number }>;
  wallRanges: Array<{ segmentId: string; ranges: Array<{ start: number; count: number }> }>;
  bounds: { min: Vec3; max: Vec3 };
};

type WallMeshOptions = {
  weldTolerance?: number;
  miterLimit?: number;        // corner miter limit; exceeded → bevel fallback
  smoothCurves?: boolean;     // default true
  classifySurface?: (ref: WallMeshSectionRef) => WallMeshSurfaceKey; // default: kind
};

// Structured result: unsafe geometry yields issues and no mesh (fail closed).
type WallMeshBuildResult = {
  mesh?: IndexedWallMesh;
  issues: LayoutGeometryIssue[];
};

// One watertight, surface-major room buffer; corner edges share positions.
buildRoomWallMesh(room: CompiledRoom, options?: WallMeshOptions): WallMeshBuildResult;

// Three adapter (outside $lib/layout) — one per consumer, with its own factory
type ResolvedWallMaterial = {
  material: THREE.Material;
  release?: () => void;       // invoked once on dispose (acquired/ref-counted variants)
};
type WallMeshMaterialFactory = (
  surfaceKey: WallMeshSurfaceKey,
  mesh: IndexedWallMesh
) => ResolvedWallMaterial;

toWallBufferGeometry(
  mesh: IndexedWallMesh,
  resolve: WallMeshMaterialFactory
): {
  geometry: THREE.BufferGeometry;   // addGroup per materialGroup, materialIndex set
  materials: THREE.Material[];      // parallel to materialGroups
  dispose: () => void;              // disposes geometry + invokes each release() once
};

// Selection overlays (editor): address a matched range set, not one range
matchWallRanges(mesh: IndexedWallMesh, segmentId: string): Array<{ start: number; count: number }>;
matchOpeningRanges(mesh: IndexedWallMesh, openingId: string): Array<{ start: number; count: number }>;
buildWallHighlightMesh(
  mesh: IndexedWallMesh,
  ranges: Array<{ start: number; count: number }>
): THREE.BufferGeometry;

// G3 harness (updated): topology estimate replaces "one box per span".
// Draw/material counts only make sense under the same render policy the
// adapters use, so the policy is an explicit argument.
type WallMeshRenderPolicy = {
  classifySurface: (ref: WallMeshSectionRef) => WallMeshSurfaceKey;
  presentation: Readonly<Record<string, { tint: string }>>;   // per-room tint identity
};

estimateWallMeshTopology(
  compiled: CompiledLayoutGeometry,
  policy: WallMeshRenderPolicy
): {
  objectCount: number;
  materialCount: number;
  drawCalls: number;
  triangles: number;
};

// Live WebGL scene for /dev/perf: builds real meshes via the builder + adapter
// (same policy) and disposes. It returns no renderer stats — the caller renders
// the scene and reads renderer.info via readThreeRenderStats.
buildWallMeshScene(
  compiled: CompiledLayoutGeometry,
  policy: WallMeshRenderPolicy
): {
  scene: THREE.Scene;
  counts: { objectCount: number; materialCount: number; drawCalls: number; triangles: number };
  dispose: () => void;
};

// Executable version-3 baseline recorder (Node + browser tiers, all four tiers).
// Invoked via the `bench:record` npm script, NOT a default-suite test. Provenance
// records HEAD SHA plus a treeDirty flag and a deterministic contentHash of the
// relevant sources (a dirty-tree baseline stays reproducible); these extend
// BenchProvenance.
recordBaseline(options?: { full?: boolean }): BudgetBaseline;
```

`Vec3`, `CompiledRoom`/`CompiledWall`, and `LayoutGeometryIssue` are the existing
G1 types; nothing in `layout-geometry-types.ts` changes shape. `dispose()`
disposes the geometry and invokes each material's `release()` once, never
disposing shared caches. `buildWallMeshScene` derives its analytical counts from
the same generated meshes the live scene renders.

## Implementation sequence

### 0. Verify no coincident walls

Confirm the compiled Chopin project and the G3 scale fixtures contain no
geometrically coincident walls across rooms. If a pair exists, record it and
defer shared-wall handling (per-owner half-thickness faces) — do not implement
coordinate-guessed dedup.

### 1. Build the pure room-scoped builder

Add `wall-mesh-builder.ts` under `$lib/layout/**` with
`buildRoomWallMesh(room)` returning `{ mesh?, issues }`. Input is one
`CompiledRoom`; output is one watertight, surface-major `IndexedWallMesh`.
Implement profile-interval union with `profileBaseY`/`floorElevation` offsets,
closed-boundary joints (no caps), strip extrusion, wall top/bottom faces,
corner offset-line mitering with bevel fallback, offset-overlap rejection,
per-normal vertex splits for hard
edges, metric floor-anchored UVs, surface-major index layout, and semantic
`sectionToRange`/`wallRanges`. No Three/Svelte/DOM imports.

### 2. Golden-test the builder

Unit + golden tests assert, for each fixture: index count (no duplicate box
interiors), triangle count matches the expected strip/exposed-cap formula,
interior side→sill/lintel junctions emit no faces, rounded/pointed arch
undersides follow `profile.topBoundary` **offset by `profileBaseY` +
`floorElevation`** (arches do not sink by sill height), segment joints emit no  cap faces, corner edges are watertight (shared positions, per-normal splits for
  hard corners), wall top/bottom faces are emitted, the solid is manifold
  (every edge shared by exactly two faces, no T-junctions), 90° corners miter
  cleanly with a bevel fallback past the miter limit, tight-curve, narrow-neck,
  and close-parallel-wall fixtures return issues with no mesh, door/window-at-
  corner fixtures join profile-aware, `materialGroups` are
contiguous surface-class ranges (draw calls = distinct classes, not sections),
UV `u` is monotonic and `v` never resets at section boundaries, and normals are
tangent/normal-derived. Boundary test: the builder imports no Svelte/DOM/Three.

### 3. Add the Three adapter

`wall-geometry-adapter.ts` wraps an `IndexedWallMesh` into
`THREE.BufferGeometry` with `addGroup` per `materialGroup`, a per-consumer
factory returning `{ material, release? }`, and `sectionToRange` carried on
`userData` for picking. `dispose()` covers geometry + one `release()` call per
material. Unit-test group ranges, material resolution, and release/disposal
ownership.

### 4. Swap the visitor shell

`LayoutMuseumShell.svelte` replaces the per-span `T.BoxGeometry` loop with one
wall mesh per room (one `materialGroup` per tint). Add the visitor wall-material
factory — an imperative plain-tint `THREE.Material` matching the current
`textures="off"` wall surface, with an inverse `[x, y]` tile-size repeat.
Floor/ceiling `ShapeGeometry` and `RoomPortal` stay. A room whose mesh fails to
build renders an explicit failure surface (visible placeholder), never silently
omitted. Verify Chopin renders pixel-comparable (textures off), casts/receives
shadows, and the door reveals/lintels read correctly.

### 5. Swap the editor preview

`EditorViewport.svelte` threads `layoutPreview.geometry` (the compiled
`CompiledLayoutGeometry`, whose rooms are `CompiledRoom`) **and
`layoutPreview.wallMeshesByRoom` (the prebuilt `IndexedWallMesh` per room)**
into `LayoutPreviewScene.svelte` — the scene currently receives only the
`LayoutPreviewModel` projection, whose rooms are not `CompiledRoom`.
`LayoutPreviewScene.svelte` then replaces its per-span chord boxes with the
prebuilt meshes + adapter (one mesh per room), using a **selection-independent**
base classifier. The room build preflights in `layout-preview-state.svelte.ts`,
rebuilding with `model`/`geometry` on mutation, and merges mesh issues into
`layoutPreview.issues`; the scene renders only prebuilt meshes and never builds
geometry inline. Wall/opening highlight uses `matchWallRanges`/
`matchOpeningRanges` + `buildWallHighlightMesh` overlays (selection color lives
on the overlay, never the base mesh); object meshes stay as-is. Verify
wall/opening highlight parity with the pre-G4 editor and that selection never
rebuilds the base geometry.

### 6. Wire disposal and rebuilds

On model change, room removal, or unmount, dispose replaced geometry (and call
each material `release()`). Dispose the replaced highlight overlay on every
selection change, clear, and unmount. Confirm no retained geometry grows across
repeated edits or repeated selection changes, and no shared material cache is
disposed.

### 7. Re-baseline the G3 harness with a version bump

Bump `BENCH_METHOD_VERSION` 2→3. Replace
`analyticalThreeCounts()`/`buildChordBoxScene()` with the policy-aware
`estimateWallMeshTopology(compiled, policy)` for CI counts **and**
`buildWallMeshScene(compiled, policy)` for the live `/dev/perf` WebGL path
(real builder + adapter meshes, deterministic disposal; the page renders the
scene and reads `renderer.info` via `readThreeRenderStats`; counts derived from
the same generated meshes). Add a `wall-mesh-build` timing metric to
`BenchMetricName` (Node tier) and **enforce it with a Chopin `target`/`fail`
budget** — it is deterministic and sits beside the already-enforced
`layout-compile`/`plan-render-build`. Add the `recordBaseline()` recorder. Wire
it through an explicit `bench:record` npm script (Node + browser tiers, all four
tiers, stamps version 3 + HEAD commit SHA plus a `treeDirty` flag and a
  deterministic `contentHash` of the relevant sources + per-tier provenance,
  writes `g3-baseline.json`). Any test that touches the baseline stays temp-only or
env-gated so a default `npm test` never rewrites it. Re-record and update the G3
plan's metric table with a recorded before→after reason per changed budget.

### 8. Close the slice

Update `architecture.md` (Three adapter row), the roadmap (G4 implemented,
G5 next), and `CURRENT.md` (next slice, locked decisions, verification). No
code commits unless requested.

## Parity and regression matrix

| Fixture / concern | Required assertion |
|-------------------|--------------------|
| L-shaped line room | Corner watertight: shared edge positions, zero crack/z-fight; **no cap face at the corner joint** |
| 90° corner miter | Offset lines intersect cleanly at right angles; bevel fallback beyond the miter limit |
| Tight curve / narrow neck / close parallel walls | Offset-contour overlap (local folds and non-adjacent overlap) returns structured issues and no mesh (fail closed) |
| Auto-Bezier curved room | Smooth normals across the curve; no chord faceting gap; UV `u` monotonic |
| Door (rectangular) | Jamb faces + flat lintel underside; opening width/height match the compiled opening |
| Window (rectangular / rounded / pointed) | Sill top flat; lintel underside follows `profile.topBoundary` at `profileBaseY` + floor; side reveals closed |
| Profile union | side→sill and lintel→side junctions emit no interior faces; caps exist only at opening gaps and profile transitions |
| Opening at segment endpoint | Profile-aware corner union: weld overlapping solid, partial reveal for the profile difference, no cap |
| Floor elevation + thickness | Mesh sits at `floorElevation`; thickness offset is `±thickness/2` along the normal |
| UV continuity | `v` anchored to room floor, no reset at lintel/sill boundaries; raw metric UVs, tile repeat material-side |
| Draw-call count | `materialGroups` = distinct surface classes, not sections; visitor wall = one draw call per room tint |
| Wall top/bottom | Faces at each section's actual elevations: floor face only at `bottomY === 0`, sill top at sill height, lintel top at ceiling, arch underside follows profile |
| Manifold topology | Every edge shared by exactly two faces, no T-junctions; positional-weld assertion |
| Multi-room shared wall | Step 0 verifies no coincident pairs; per-room rendering exact. If a pair exists, deferred — never coordinate-deduped |
| Shadows | `castShadow`/`receiveShadow` parity with pre-G4 visitor shell |
| 2D/3D agreement | Plan wall stroke (G2) and 3D wall centerline agree within sample tolerance |
| Selection granularity | Wall/opening highlight via range-set overlay; base geometry never rebuilt on selection; no section-level selection |
| Mesh failure delivery | Editor issues visible in `layoutPreview.issues`; visitor renders explicit failure, never silently omits a room |
| Disposal | Rebuild/unmount disposes replaced geometry + one `release()` per acquired material; highlight overlay disposed on selection change/clear/unmount; shared cache untouched |
| Boundary | Builder under `$lib/layout` imports no Svelte/DOM/Three; adapter is Three-only |
| Harness | `estimateWallMeshTopology` accepts the render policy; `/dev/perf` live WebGL uses `buildWallMeshScene`; budgets carry a recorded reason under `BENCH_METHOD_VERSION` 3 |

## Expected files

New, conceptually:

```text
apps/museum/src/lib/layout/wall-mesh-builder.ts
apps/museum/src/lib/layout/wall-mesh-builder.test.ts
apps/museum/src/lib/render/wall-geometry-adapter.ts       (or an equivalent non-layout home)
apps/museum/src/lib/render/wall-geometry-adapter.test.ts
apps/museum/src/lib/museum/layout/wall-material-factory.ts (imperative visitor material factory)
apps/museum/src/lib/bench/record-baseline.ts               (invoked via bench:record, not a default test)
```

Primary edits:

```text
apps/museum/package.json                                 (bench:record script)
apps/museum/src/lib/museum/layout/LayoutMuseumShell.svelte
apps/museum/src/lib/editor/EditorViewport.svelte         (thread layoutPreview.geometry)
apps/museum/src/lib/editor/layout/layout-preview-state.svelte.ts (preflight + merge mesh issues)
apps/museum/src/lib/editor/layout/LayoutPreviewScene.svelte
apps/museum/src/lib/bench/bench-types.ts                  (BENCH_METHOD_VERSION 2→3 + wall-mesh-build metric + treeDirty/contentHash provenance)
apps/museum/src/lib/bench/browser-bench.ts                (policy-aware topology estimate)
apps/museum/src/lib/bench/three-stats.ts                  (buildChordBoxScene → buildWallMeshScene)
apps/museum/src/routes/dev/perf/+page.svelte              (live WebGL path uses buildWallMeshScene)
apps/museum/src/lib/bench/plan-bench.ts                   (wall-mesh-build metric)
apps/museum/src/lib/bench/baselines/g3-baseline.json      (re-recorded budgets, version 3)
apps/museum/src/lib/layout/layout-geometry-boundary.test.ts (extend the boundary guard)
apps/museum/src/lib/layout/layout-geometry-validation.ts   (optional fast-fail: wall_thickness_exceeds_curve_radius)
docs/plans/2026-08-13-graphics-architecture-roadmap.md    (mark G4 close)
docs/hand-off/CURRENT.md
```

Exact helper filenames may be consolidated if the pure-builder boundary, the
Three-adapter boundary, the watertight room-buffer contract, and the
surface-major draw-call contract stay clear.

## Verification

Automated:

```text
npm test -w @portfolio/museum -- <wall-mesh-builder + adapter + parity test files>
npm test -w @portfolio/museum
npm run check -w @portfolio/museum
npm run build -w @portfolio/museum
```

Harness re-baseline (method version 3, explicit script — not a default test):

```text
npm run bench:record -w @portfolio/museum   # Node + browser tiers, all four tiers
```

Manual QA:

- Visitor Chopin renders wall solids with correct corners, reveals, and arch
  undersides; shadows and room tints are unchanged, walls stay `textures="off"`.
- Editor wall/opening selection highlight matches pre-G4 behavior via range-set
  overlays, with no base-geometry rebuild on selection.
- Repeated edits/rebuilds do not grow retained geometry (disposal verified).
- `/dev/perf` renders the live WebGL wall-mesh scene via `buildWallMeshScene`
  (not the removed chord-box scene) and reports `wall-mesh-build` timing under
  method version 3; production `/museum` and the editor are unchanged.

## Exit criteria

G4 is complete only when:

- the pure builder and Three adapter exist, and the builder imports no
  Svelte/DOM/Three;
- both editor 3D and visitor 3D consume the builder — the per-span chord-box
  path is removed from `LayoutMuseumShell.svelte` and
  `LayoutPreviewScene.svelte`, pinned by a boundary test;
- the builder returns `{ mesh?, issues }` and rejects unsafe geometry (offset
  overlap: local folds and global non-adjacent overlap) with structured issues;
- prebuilt wall meshes live in `wallMeshesByRoom` on `LayoutPreviewState` and
  are threaded to `LayoutPreviewScene`; mesh issues merge into
  `layoutPreview.issues` and the visitor renders an explicit failure surface,
  never silently omitting a room;
- the builder emits one watertight room buffer whose corner edges share
  positions (per-normal splits for hard corners) and whose walls render as
  indexed extruded solids with opening side/lintel faces and arch-profile
  undersides at `profileBaseY` + floor elevation — with **no cap faces at
  segment joints and no interior faces at side→sill/lintel junctions**;
- draw calls collapse to distinct surface classes (not sections) via
  surface-major `materialGroups`, while `sectionToRange`/`wallRanges` stay
  metadata (H1 picking only, no section selection in G4);
- UVs are raw metric (arc length × floor-anchored height) with material-side
  tile repeat, and normals are tangent/normal-derived;
- material factories return `{ material, release? }` and disposal disposes
  geometry plus one `release()` per acquired material on rebuild/unmount;
- the visitor wall surface stays `textures="off"` (pixel parity, texture
  non-goal intact);
- the editor base classifier is selection-independent; wall/opening selection
  highlight uses range-set overlays (disposed on selection change/clear/unmount)
  and never rebuilds base geometry;
- the editor threads `layoutPreview.geometry` through `EditorViewport` so the
  scene consumes `CompiledRoom`, not the `LayoutPreviewModel` projection;
- step 0 verifies no coincident walls (or records a deferral);
- the G3 harness re-baselines under `BENCH_METHOD_VERSION` 3 via the
  `bench:record` script (not a default test), and `/dev/perf`'s live WebGL path
  uses `buildWallMeshScene`, with a recorded reason and all Chopin budgets
  passing; and
- the full test suite, Svelte check, production build, and parity fixtures pass.

## Explicit non-goals

- real-time CSG or Blender-style mesh editing;
- one fused whole-museum mesh;
- replacing Three/Threlte as the scene/material/camera/resource layer;
- LOD, culling, instancing, or caching/partial rebuild (G5);
- H1 unified 3D gizmo editing (separate track; G4 only supplies the
  section→index metadata H1 will consume);
- section-level editor selection (G4 selection is wall/opening only);
- changing `CompiledLayoutGeometry`, `PlanRenderModel`, or `LayoutDocument`
  shapes;
- serializing generated mesh data into `MuseumProject`;
- texture/surface authoring changes — visitor walls stay `textures="off"`;
- async workers, WASM, or any off-main-thread geometry build; and
- coordinate-guessed adjacency or shared-wall dedup (deferred, never guessed).
