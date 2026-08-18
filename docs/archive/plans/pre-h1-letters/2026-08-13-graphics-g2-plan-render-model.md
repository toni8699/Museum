# G2 — Explicit Plan Render Boundary

**Date:** 2026-08-13
**Status:** Implemented
**Parent:** [`2026-08-13-graphics-architecture-roadmap.md`](./2026-08-13-graphics-architecture-roadmap.md)
**Prerequisite:** [`2026-08-13-graphics-g1-shared-geometry-compiler.md`](./2026-08-13-graphics-g1-shared-geometry-compiler.md)
**Handoff:** [`../hand-off/CURRENT.md`](../hand-off/CURRENT.md)
**Contracts:** [`../architecture.md`](../architecture.md) · [`../components/persistence.md`](../components/persistence.md)

## Goal

Derive a pure `PlanRenderModel` from `CompiledLayoutGeometry` plus optional
renderer-neutral camera/tour and interaction projections. The model is one
ordered list of world-space primitives with semantic style tokens and hit
identities. The SVG adapter consumes the model, applies the view transform, and
owns SVG attributes and visual theme. `LayoutPlanViewport.svelte` shrinks to
pointer/keyboard/wheel plumbing plus overlay projection; it stops assembling
render order or SVG geometry inline.

Six concerns become separate:

1. **document mutation** — `layout-preview-state.svelte.ts` and the editing
   modules; unchanged by G2.
2. **compiled geometry** — `compileLayoutGeometry()` (G1); unchanged by G2.
3. **world-to-screen view transforms** — `layout-plan-transform.ts` (already a
   separate module); the only consumer that transforms world → screen.
4. **rendering order** — the new `PlanRenderModel` builder.
5. **transient interaction overlays** — interaction-owned world-space data,
   inserted by the model at fixed layers.
6. **visual styling** — the SVG adapter maps semantic style tokens to CSS.

G2 keeps SVG as the production Plan renderer (per the roadmap gate). It changes
*what* the Plan renders through and *where* the order lives; it does not change
the visual strategy, the camera system, or the geometry compiler.

## Current gaps

| Concern | Today | G2 outcome |
|---------|-------|------------|
| Render order | Inline `{#each}`/`{#if}` template order in `LayoutPlanViewport.svelte` (1163 lines) | One ordered `PlanRenderModel` with the 12-layer back-to-front order |
| Primitives | SVG elements assembled ad hoc from `model.rooms`, `model.objects`, `interaction` | World-space `polygon`/`polyline`/`circle`/`text` records with stable keys |
| View transform | `worldToPlanScreen` called inline all over the template | SVG adapter applies the transform once per primitive |
| Styling | CSS classes bound inline from `interaction.selection` | Semantic style tokens (`room-fill`, `wall-line-selected`, …) mapped in the adapter |
| Hit testing | `findPlanHitTarget` + five `nearest*`/`find*` helpers inline in the viewport | One pure `plan-hit` module over the model's hit identities + compiled queries |
| Camera/tour overlays | None — Plan has no camera path, view cone, portal, or timing visualization | Projected from `project.scene` via `camera-route.ts`/`camera-motion.ts` (drop Y) |
| Interaction overlays | Draft ghosts, handles, rotation arm, dimensions inline | Interaction projection produces world-space records slotted into fixed layers |
| Backend coupling | Viewport imports layout geometry, queries, transform, interaction, editing | Viewport imports adapter + hit + overlay projection only |

The current Plan already consumes `CompiledLayoutGeometry` for committed
geometry (G1). G2 does not revisit sampling or topology: it only moves how the
already-compiled data is turned into drawable, hittable, ordered primitives.

## Locked decisions

- `PlanRenderModel` types and the pure builder live under `$lib/layout/**` and
  must not import Svelte, DOM/SVG, Threlte, or Three. They import compiled
  geometry types and pure geometry kernels only.
- The model is **world-space and renderer-neutral**. Geometry is `LayoutVec2`
  (plan = XZ plane); screen-size hints (handle radius, hit radius) are explicit
  `px` fields, not SVG units.
- The builder owns **order only** for committed layers. Transient interaction
  overlays are supplied as an input projection; the builder assigns them to
  their fixed layers and keeps their world coordinates untouched.
- The camera/tour projection is a separate editor-only pure module that reads
  `project.scene` through `camera-route.ts`/`camera-motion.ts` and projects
  `Vec3` → `LayoutVec2` by dropping Y. It must not add a second route, motion,
  or projection implementation.
- `PlanRenderModel` carries the 12-layer back-to-front order verbatim:

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

- Every primitive has a collision-safe stable key (`geometryId`-style tuple
  serialization, as in G1) and a semantic style token. Interactive primitives
  also carry a `hit` identity resolving to a semantic target.
- Hit priority stays exactly as locked today:
  vertex → interior anchor → opening → object → wall → room. Hit resolution
  moves to a pure module; it reads the model's hit identities and compiled
  query records, never reopened `LayoutDocument` or resampled curves.
- The SVG adapter owns DOM creation, SVG attributes, CSS class mapping, and the
  view transform. It is the only component that calls `worldToPlanScreen` for
  rendering; hit radius and handle sizing stay zoom-independent in screen px.
- Grid, scale bar, and plan meta are chrome, not `PlanRenderModel` layers; they
  remain viewport-owned and are drawn outside the model.
- `CompiledLayoutGeometry` and `LayoutDocument` are unchanged. No compiled or
  render-model data is serialized into `MuseumProject`.
- `camera-route.ts`, `camera-motion.ts`, the tour FSM, and scene resolution are
  untouched. Portal crossings use `projectLayoutPortalRelations()` +
  `CompiledOpeningCenter`; collision warnings use structured
  `LayoutGeometryIssue` targets, not new inference.

## Public contract

The exact file split may vary, but the public contract must express these
relationships:

```ts
type PlanStyleToken =
  | 'room-fill' | 'room-fill-selected'
  | 'room-outline' | 'room-outline-selected'
  | 'wall-line' | 'wall-line-selected' | 'wall-line-opening-selected'
  | 'opening-line' | 'opening-line-selected'
  | 'layout-object' | 'layout-object-selected' | 'layout-object-readonly'
  | 'camera-path' | 'view-cone' | 'look-target'
  | 'portal-crossing' | 'collision-warning' | 'timing-label'
  | 'selection-bounds' | 'rotation-arm' | 'rotation-handle' | 'rotation-feedback'
  | 'vertex-handle' | 'interior-anchor' | 'interior-anchor-selected'
  | 'primitive-ghost' | 'draft-outline' | 'draft-point'
  | 'dimension-label' | 'selection-label' | 'scale-label';

type PlanHitIdentity =
  | { kind: 'vertex'; roomId: string; vertexIndex: number }
  | { kind: 'interiorAnchor'; roomId: string; segmentId: string; anchorId: string }
  | { kind: 'opening'; roomId: string; segmentId: string; openingId: string }
  | { kind: 'object'; objectId: string }
  | { kind: 'wall'; roomId: string; segmentId: string }
  | { kind: 'room'; roomId: string };

type PlanRenderPrimitive =
  | { kind: 'polygon'; key: string; points: LayoutVec2[]; style: PlanStyleToken; hit?: PlanHitIdentity }
  | { kind: 'polyline'; key: string; points: LayoutVec2[]; style: PlanStyleToken; hit?: PlanHitIdentity }
  | { kind: 'circle'; key: string; center: LayoutVec2; radiusPx: number; style: PlanStyleToken; hit?: PlanHitIdentity }
  | { kind: 'text'; key: string; anchor: LayoutVec2; text: string; style: PlanStyleToken };

type PlanRenderLayer = {
  order: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  primitives: PlanRenderPrimitive[];
};

type PlanRenderModel = {
  layers: PlanRenderLayer[];
  bounds: LayoutBounds2 | null;
};
```

Camera/tour projection input (produced editor-side, consumed by the pure
builder):

```ts
type PlanCameraProjection = {
  paths: { key: string; polyline: LayoutVec2[]; connectionId?: string }[];
  viewCones: { key: string; origin: LayoutVec2; target: LayoutVec2; fovDegrees: number; nodeId: string }[];
  lookTargets: { key: string; point: LayoutVec2; nodeId: string }[];
  portalCrossings: { key: string; point: LayoutVec2; openingId: string }[];
  collisionWarnings: { key: string; point: LayoutVec2; issueCode: string }[];
  timingLabels: { key: string; anchor: LayoutVec2; text: string; connectionId: string }[];
};
```

Interaction projection input (editor-side world-space overlays):

```ts
type PlanInteractionProjection = {
  selection?: { kind: string; key: string; primitives: PlanRenderPrimitive[] };
  handles: PlanRenderPrimitive[];
  drafts: PlanRenderPrimitive[];
  labels: PlanRenderPrimitive[];
};
```

Builder:

```ts
buildPlanRenderModel(
  compiled: CompiledLayoutGeometry,
  camera?: PlanCameraProjection,
  interaction?: PlanInteractionProjection
): PlanRenderModel;
```

- Layers 1–5 are built deterministically from compiled rooms/walls/openings/
  objects, preserving document order and G1 qualified IDs as keys.
- Layers 6–9 are built only when a camera projection is supplied.
- Layers 10–12 receive interaction primitives; empty projections yield empty
  layers, never reordering committed content.
- `bounds` derives from compiled document bounds (plan XZ), not from re-scanning
  primitives.

The SVG adapter (a Svelte component, e.g. `PlanSvg.svelte`) accepts the model
and the `PlanViewportState`, walks layers in order, applies
`worldToPlanScreen`, and maps tokens → CSS classes. It is the only render
consumer of the model; tests assert it emits no layout-geometry logic.

## Implementation sequence

### 1. Freeze parity fixtures

1. Add G2 fixtures reusing the G1 compiled fixtures: line rectangle, L-shaped
   room, auto-Bezier wall, multi-opening wall, all opening profiles, objects,
   elevated floor, invalid geometry.
2. Add a scene fixture with a small navigation graph (nodes, a guided cycle,
   connection timing) for the camera projection goldens.
3. Add render-order goldens: expected layer sequence, per-layer primitive
   counts, stable keys, and world coordinates equal to the compiled source.
4. Add hit goldens: for each fixture, the target resolved at known world points
   (vertex/anchor/opening/object/wall/room) must match today's priority.

### 2. Introduce the pure model

1. Add `plan-render-model.ts` with `PlanRenderPrimitive`, `PlanRenderLayer`,
   `PlanRenderModel`, style tokens, hit identities, and
   `buildPlanRenderModel()` for layers 1–5 and 10–12.
2. Prove the builder is visitor-safe (no Svelte/DOM/Three imports) and
   deterministic: deep-frozen compiled fixtures build without throwing; equal
   canonical inputs deep-equal.
3. Cover layer order, key stability, and world-coordinate fidelity in unit
   tests.

### 3. Extract hit resolution

1. Move `findPlanHitTarget`, `nearestVertexTarget`,
   `nearestInteriorAnchorTarget`, `nearestOpeningTarget`, `nearestWallTarget`,
   `findHitRoom`, and `projectPointToWall` out of the viewport into a pure
   `plan-hit.ts`.
2. Resolve hits against the model's hit identities plus compiled query records
   (points/spans/polygons); preserve the locked priority and the 12 px radius.
3. Return a semantic `PlanHitResult` (the `PlanHitIdentity` + any projection
   data callers still need, e.g. opening `offset`). Do not return Svelte or DOM
   values.
4. Port the existing interaction tests to the new module unchanged in outcome.

### 4. Project camera/tour overlays

1. Add `plan-camera-projection.ts` that builds `PlanCameraProjection` from
   `project.scene` using `getGuidedCameraRoute`/`getCameraConnectionRoute` and
   the existing `museumNavigationGraph`.
2. Flatten each resolved route's ordered positions to a 2D polyline by dropping
   Y; derive view cones from node `cameraTarget`/`fov` and look targets from
   `cameraTarget`; place timing labels from `connection.timing` via
   `getCameraMotionOptions`.
3. Add portal crossings from `projectLayoutPortalRelations()` and compiled
   opening centers; add collision warnings from structured geometry issues that
   carry target IDs.
4. Do not render this projection by default until a Plan "show tour" toggle
   exists; the builder must accept an absent projection and still produce layers
   1–5, 10–12.

### 5. Extract interaction overlays

1. Add `plan-overlays.ts` that turns `interaction`/`preview` state into
   `PlanInteractionProjection` (selection bounds, rotation arm/handle, vertex
   handles, interior anchors, primitive ghost, draft outline/points, dimension/
   selection/status labels).
2. Keep all transient geometry world-space; move the rotation-handle
   screen-offset logic (28 px) into a px hint on the overlay record.
3. The viewport stops computing overlay screen coordinates; it forwards state
   into the projection.

### 6. Add the SVG adapter and rewire the viewport

1. Add `PlanSvg.svelte` that renders `PlanRenderModel` → SVG using
   `worldToPlanScreen` and the style-token → class map; port the current CSS
   classes under the token names.
2. Rebuild `LayoutPlanViewport.svelte` to: hold `svgElement`; compute
   `buildPlanRenderModel(model, cameraProjection, interactionProjection)` via
   `$derived`; call `planHit()` on pointerdown; keep pointer/keyboard/wheel
   handlers, pointer capture, pan/zoom, and draft/commit flow.
3. Grid, scale bar, and meta stay in the viewport, outside the model.
4. Delete the inline hit helpers, inline SVG assembly, and inline
   `worldToPlanScreen` calls from the viewport.

### 7. Guard the boundary

1. Add a source/import-boundary test proving:
   - `plan-render-model.ts` and `plan-hit.ts` import no Svelte/DOM/Three;
   - `PlanSvg.svelte` imports no layout-geometry kernel and no camera-route
     resolution (it renders only);
   - the viewport no longer computes render order, hit geometry, or
     world→screen transforms inline.
2. Add a camera-projection test proving it reuses `camera-route.ts`/
   `camera-motion.ts` and produces 2D polylines identical to flattening the
   resolved route (drop Y), with no new motion math.

### 8. Close the slice

1. Run focused model/hit/projection/adapter tests, the full museum suite,
   Svelte check, and the production build.
2. Inspect editor chunks for the model in the Plan path and confirm the visitor
   import graph still rejects editor/layout UI (no change to visitor isolation).
3. Manual Plan QA: line/L/Bezier rooms, openings, objects, selection, room
   relocate/rotate, vertex edit, wall bend, opening drag, object drag, undo/
   redo, draft/commit, pan/zoom, snap, and the new tour overlay toggle.
4. Manual visitor QA: `/museum` unchanged (nine guided nodes, Back, free/direct
   navigation, reduced motion, HUD).
5. Update `architecture.md` Plan-presentation row if a contract changed, mark G2
   implemented in the roadmap/handoff, and name G3 next.

## Parity and regression matrix

| Fixture | Required assertions |
|---------|---------------------|
| Rectangle + L room | Layers 1–2 emit one fill + one outline per room in document order; world coords equal compiled polygons |
| Auto-Bezier wall | Layer 3 wall polylines equal compiled `solidCenterlinePolylines`; keys carry floor/room/segment |
| Multi-opening wall | Layer 4 opening polylines equal compiled `centerPolyline`; opening hit identity correct |
| Profile matrix | Committed layers unchanged by profile kind; no resampling in the model |
| Object matrix | Layer 5 footprints equal compiled `planFootprint`; readonly/selected tokens correct |
| Chopin project | Same room/wall/opening/object counts per layer; zero camera-projection issues when scene is valid |
| Camera projection | Guided-cycle and connection routes flatten to exact ordered 2D polylines; timing labels match `connection.timing` |
| Hit priority | vertex → anchor → opening → object → wall → room at fixtures, identical to pre-G2 behavior |
| Interaction overlays | Selection/handles/drafts/labels land in layers 10–12 only; rotation handle uses px hint, not viewport math |
| Determinism | Deep-frozen compiled input builds without throwing; repeated builds deep-equal |
| Boundary | Model/hit modules are DOM/Svelte/Three-free; adapter is render-only |

## Expected files

New, conceptually:

```text
apps/museum/src/lib/layout/plan-render-model.ts
apps/museum/src/lib/layout/plan-render-model.test.ts
apps/museum/src/lib/editor/layout/plan-hit.ts
apps/museum/src/lib/editor/layout/plan-hit.test.ts
apps/museum/src/lib/editor/layout/plan-camera-projection.ts
apps/museum/src/lib/editor/layout/plan-camera-projection.test.ts
apps/museum/src/lib/editor/layout/plan-overlays.ts
apps/museum/src/lib/editor/layout/PlanSvg.svelte
apps/museum/src/lib/layout/plan-render-boundary.test.ts
```

Primary edits:

```text
apps/museum/src/lib/editor/layout/LayoutPlanViewport.svelte
apps/museum/src/lib/editor/layout/layout-plan-transform.ts   (only if px hints need a shared constant)
apps/museum/src/lib/editor/layout/layout-interaction.ts       (only if overlay input shapes move)
```

Retire inline helpers after migration:

```text
LayoutPlanViewport.svelte: findPlanHitTarget, nearestVertexTarget,
nearestInteriorAnchorTarget, nearestOpeningTarget, nearestWallTarget,
findHitRoom, projectPointToWall, compiledWallLength, compiledRoomEdgeLength,
renderObjectFootprint, rotation-handle screen math, inline SVG assembly.
```

Exact helper filenames may be consolidated if the public model boundary, visitor
safety, and test ownership stay clear.

## Verification

Automated:

```text
npm test -w @portfolio/museum -- <focused G2 plan files>
npm test -w @portfolio/museum
npm run check -w @portfolio/museum
npm run build -w @portfolio/museum
```

Manual editor QA:

- Plan renders identically to today for line, L-shaped, and auto-Bezier rooms.
- Opening place/drag, wall bend, room relocate/rotate, object place/drag,
  selection, hit priority, undo/redo, import/reset, dirty state, and replacement
  reframing behave as before.
- The new tour overlay toggle shows camera paths, view cones, look targets,
  portal crossings, collision warnings, and timing labels; disabling it restores
  the pure layout view.

Manual visitor QA:

- All nine guided nodes, Back, free/direct navigation, reduced motion, and HUD
  room updates remain unchanged.
- `/editor` remains a production 404 in the default build and browser errors stay clean.

## Exit criteria

G2 is complete only when:

- `buildPlanRenderModel()` produces the one ordered 12-layer model from
  `CompiledLayoutGeometry` plus optional camera/tour and interaction
  projections;
- the model is world-space, renderer-neutral, deterministic, and free of
  Svelte/DOM/Three imports;
- the SVG adapter is the sole render consumer and the sole applier of the view
  transform and styling;
- hit resolution is a pure module preserving the locked priority with no
  document reopening or curve resampling;
- camera/tour overlays project `project.scene` exclusively through
  `camera-route.ts`/`camera-motion.ts` with no second motion path;
- `LayoutPlanViewport.svelte` no longer assembles render order, hit geometry,
  or world→screen transforms inline;
- no render-model or projection data enters project serialization; and
- the full test suite, Svelte check, production build, and editor/visitor QA
  pass.

## Explicit non-goals

- performance harnesses, budgets, or scale claims (G3);
- indexed `BufferGeometry`, wall joins/reveals/UVs, mesh batching, or replacing
  chord boxes (G4);
- caching, partial rebuilds, spatial indexes, culling, LOD, or instancing (G5);
- WebGPU/WGSL Plan backends, Rust/WASM, or alternate renderers (G6);
- changing `CompiledLayoutGeometry`, `LayoutDocument`, or the geometry compiler
  (G1 scope);
- a second navigation graph, camera route, motion system, or scene resolution;
- moving camera, materials, or scene entities into layout/compiled data;
- visitor rendering/editing of layout objects; and
- unified 3D gizmo editing (H1, gated after G1+G4).

## Shipped (2026-08-13)

All eight implementation steps landed. The pure model, hit resolution, camera
projection, interaction overlays, SVG adapter, and boundary guard are the files
listed in **Expected files**; `LayoutPlanViewport.svelte` shrank from 1,163 to
823 lines and no longer assembles render order or world→screen transforms.

Review round fixes folded in before close:

- **P1 placement regression** — primitive placement no longer routes through the
  selection priority `resolvePlanHit`; it uses a room-only containment query,
  restoring wall-adjacent object/room placement.
- **P2 qualified selection identity** — `PlanSvg` and `plan-overlays` compare
  `roomId` + `segmentId`/`anchorId` (and room-scoped `openingId`), so imported or
  custom layouts with cross-room ID reuse no longer highlight unrelated
  entities. `plan-hit.ts` already carried the qualified `PlanHitIdentity`.
- **P2 selection decoupling** — selection is encoded through `PlanSelection` and
  the `*-selected` style tokens in the model/interaction projection;
  `PlanSvg.svelte` no longer imports `LayoutSelection` or derives styles itself.
- **Toolbar mutation** — Snap/Grid/Tour toggles moved to
  `togglePlanViewportOption()`, silencing the `ownership_invalid_mutation`
  warning.

Verification at close: full museum suite **102 files / 1231 tests passed**,
`svelte-check` 0 errors/warnings, production build clean, and agent-browser QA of
the reworked Plan (committed layers, tour overlay, room selection) with no console
errors.
