# P14 — Camera Plan passive object footprints (shipped)

**Status:** `shipped` — 2026-08-29; P14 S1–S3 complete.
**Tracker:** [`../../plans/README.md`](../../plans/README.md) — **P14**, depends on: P12.
**Placement:** Design already ratified — `Design-specs/Camera-layout-design.md`
(2026-08-28) + approved designer brief
(`Design-specs/Camera-plan-objects-brief.md`) + amended `Design-specs.md`
§3/§10/§27. No owner decision pending; this plan schedules the ratified work.
**Baseline:** P12 frozen contract + shipped P12 S1–S4 baseline (P11.4 + fixes).

---

## Goal

Camera Plan renders **passive floor footprints of placed objects** beneath the
camera graph, so camera paths are drafted against visible furniture instead of
invisible space. Visualization only: **no collision, no validation, no
interaction** — per the ratified spec's core rule ("Footprints communicate
projected floor presence… but DO NOT indicate collision, path validity, or
guaranteed clearance bounds").

Scope of ingested footprints (ratified §2): placed catalogue assets, plan-
authored primitives, native layout-object identities, and cluster members
(rendered as their member footprints — no group outline). Excluded: lights,
roomless/floating entities, and anything without a canonical floor projection.
No new geometry is synthesized.

## Current behavior

- Both plans already consume the **same render model** (`buildPlanRenderModel`,
  13 fixed layers) and the same SVG renderer (`PlanSvg`). Layer 6 is the
  **passive Scene footprint layer** — already styled (muted outline, neutral
  ~12% fill, `5 4` dash, `vector-effect="non-scaling-stroke"`,
  `pointer-events: none`) and already rendered. No new layer needs building.
- **Scene Plan** feeds it: `LayoutPlanViewport` derives
  `buildPlanSceneFootprintProjection(scene, rooms, …)` and passes it as the 4th
  `buildPlanRenderModel` argument. It also uses footprints for Arrange
  hit-testing — that part stays Scene-Plan-only.
- **Camera Plan** does not: `CameraPlanViewport` calls `buildPlanRenderModel`
  with only geometry + the camera-authoring projection. Placed scene entities
  (assets, scene primitives, cluster members) are therefore **invisible** on
  the Camera Plan surface.
- Plan-authored primitives do render (layer 5) but with the legacy faint beige
  `.layout-object` styling — effectively invisible against the paper.
- This is the documented gap the ratification reverses: the prior master-spec
  rule ("Camera Plan passes no Scene footprint projection") is amended
  2026-08-28.

## Why this is a small change (no rewrite)

1. **The layer exists.** `buildPlanRenderModel` already emits layer-6
   `scene-footprint` primitives whenever a `PlanSceneProjection` is passed;
   `PlanSvg` already renders them inert.
2. **The data is already in hand.** `CameraPlanViewport` holds
   `store.document` (the live `SceneDocument`) and `store.rooms`
   (`LayoutRoomRegistry`) — the exact inputs
   `buildPlanSceneFootprintProjection` requires. `LayoutPlanViewport:229–245`
   is the reference wiring.
3. **Token precedent.** The camera canvas already scopes a plan token
   (`--editor-plan-room-bg` override). The two new semantic
   `--editor-camera-footprint-*` aliases are bound to renderer-neutral effective
   variables on that canvas only, so Camera-specific tuning cannot leak into
   Scene Plan.

## Slices

### S1 — Wire the scene footprint layer into Camera Plan

- `CameraPlanViewport`: add a derived `sceneProjection` via
  `buildPlanSceneFootprintProjection(store.document, store.rooms)`, keyed to
  `preview.previewVersion` (same staleness guard as Layout Plan), and pass it as
  the fourth, scene argument of `buildPlanRenderModel` in **both** model paths:
  the normal authoring-projection path and the no-authoring/failure path
  (`buildPlanRenderModel(preview.geometry, undefined, undefined,
  sceneProjection)`). Footprints therefore remain visible with zero navigation
  nodes/connections or a failed camera projection. They land at layer 6 — above
  architecture, below camera layers 7–10 — with the graph untouched.
- Tokens (`editor/styles/plan.css`): define `--editor-camera-footprint-stroke`
  and `--editor-camera-footprint-fill` as aliases of the shared footprint
  presentation (muted outline ink + neutral ~12% gray fill), per ratified §3.1.
- `PlanSvg`: make `.scene-footprint` consume renderer-neutral effective
  variables with the current Scene presentation as fallback. On
  `CameraPlanViewport`'s `.plan-canvas` only, bind those effective variables to
  `--editor-camera-footprint-stroke` / `--editor-camera-footprint-fill`.
  Scene Plan therefore keeps its existing presentation even if Camera tokens
  are tuned later.
- No hit-testing changes: footprints stay `pointer-events: none`; "Add Camera"
  floor clicks pass through (ratified §7).

### S2 — Plan-primitive parity

- On the Camera Plan surface only, `.layout-object` adopts the unified
  footprint presentation through canvas-scoped effective layout-object
  variables (`fill`/`stroke` → Camera aliases, `stroke-dasharray: 5 4`). Shared
  `PlanSvg` fallbacks remain the existing beige Scene Plan values. Authored
  identity, behavior, and Scene Plan appearance are unchanged (ratified §3.2).

### S3 — Tests, contract pins, QA, close

- Extend `tests/lib/layout/plan-render-model.test.ts` and
  `tests/lib/editor/layout/plan-scene-footprint.test.ts` for the shared
  layer-order/inertness and eligibility behavior: passive `scene-footprint`
  primitives occupy layer 6 **under** camera layers 7–10 with no hit authority;
  cluster members project as member footprints; lights and roomless entities
  are excluded.
- New focused suite `tests/lib/editor/camera-plan/p14-camera-plan-footprints.test.ts`:
  Camera Plan wires the scene projection through both render-model branches,
  including an empty navigation graph/no-authoring projection, and scopes the
  effective footprint/layout-object variables on its canvas.
- `tests/lib/editor/app/contracts.test.ts`: source pins that the Camera Plan
  semantic aliases exist and that shared `PlanSvg` retains Scene-safe
  fallbacks; it must fail if Camera-specific variables are consumed globally.
- Full verification (`npm run check`, full suite, `npm run build`) + browser
  QA across zoom (25% → 300%) on the toned paper. Record the QA decision —
  stroke weight within the ratified 1px–1.5px tune range and `5 4` vs `4 3`
  dash — in this plan on close.
- Close: `docs/hand-off/CURRENT.md` delta, tracker flip to `shipped`.

## Files (est. ~60–90 production lines + tests)

| File | Change |
| :--- | :--- |
| `editor/camera-plan/CameraPlanViewport.svelte` | Derived scene projection + 4th `buildPlanRenderModel` arg in both branches + canvas-local effective variables (S1/S2) |
| `editor/styles/plan.css` | `--editor-camera-footprint-stroke` / `--editor-camera-footprint-fill` aliases (S1) |
| `editor/layout/PlanSvg.svelte` | Renderer-neutral fallback indirection for `.scene-footprint` and `.layout-object` (S1/S2) |
| `tests/lib/layout/plan-render-model.test.ts` + `tests/lib/editor/layout/plan-scene-footprint.test.ts` | Shared layer/inertness + eligibility pins (S3) |
| `tests/lib/editor/camera-plan/p14-camera-plan-footprints.test.ts` | Both viewport branches + surface-scoping pins (S3) |
| `tests/lib/editor/app/contracts.test.ts` | Semantic aliases + Scene-safe fallback pins (S3) |
| `docs/hand-off/CURRENT.md` (+ tracker rows) | Close delta; `shipped` flip (S3) |

No changes to the render model, geometry compiler, camera projection, hit-
testing, selection, persistence, or any other surface. Scene Plan and 3D are
byte-identical.

## Contract notes

- **Inertness.** Footprints never hover, select, drag, or tooltip; clicks fall
  through to the architectural floor hit-target (ratified §7).
- **Below the graph.** Footprints render under camera nodes/edges/labels; the
  graph's colors, weights, and z-order are unchanged (ratified §3).
- **No collision semantics.** Overlap is permissive; true clearance validation,
  if ever added, must evaluate 3D camera motion, not Plan overlap (ratified
  §1.1).
- **Direction never drawn.** Connections stay arrowhead-free; sequenced
  direction is implied by order (ratified §1/§6).
- **Labels keep the halo.** No opaque backing plates; the canvas-paper stroke
  halo stays (ratified §6).
- **Relic/visitor frozen.** Camera Plan surface only; `/museum` and the visitor
  runtime are untouched.

## Acceptance pins (when implemented)

- Camera Plan shows dashed footprint outlines of every eligible placed object
  (catalogue assets, scene primitives, layout objects, cluster members) beneath
  the camera graph.
- Plan-authored primitives render with the unified footprint presentation on
  the Camera Plan surface only.
- Footprints are inert: no hover/select/drag, and "Add Camera" clicks pass
  through footprints to the floor.
- Scene Plan and 3D rendering identical to before (shared fallbacks).
- Camera graph visuals (nodes, edges, anchors, labels) unchanged.
- Lights and roomless entities do not appear.
- `npm run check` 0 errors; full suite green; QA decision (stroke weight +
  dash) recorded on close.

## Verification

- `npm run check`: 0 errors / 0 warnings.
- Full Vitest: 168 files passed, 1 skipped; 2,280 tests passed, 1 skipped.
- `npm run build`: passed; known unused-import, chunk-size, and adapter-auto
  warnings only.
- Browser QA used a representative layout/scene with catalogue models,
  primitives, a light, and a cluster: Camera Plan rendered four eligible
  Scene footprints plus two layout objects, kept the graph above them, and
  left footprints inert. Scene Plan retained its filled-object presentation;
  lights and the cluster outline were absent. The accepted baseline is a
  1.5px footprint stroke with a `5 4` dash on the toned paper, legible from
  overview through close-up zoom.

## Status

Shipped — 2026-08-29. P13 stays proposed/unscheduled; P3B.7b remains deferred
and non-blocking.
