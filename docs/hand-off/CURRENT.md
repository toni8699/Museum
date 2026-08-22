# Current handoff — live working-tree delta

Template per [`../README.md`](../README.md). This is a **sliding window**:
only the immediate previous slice (back-pointer) and the single next action
live here. History chains backward through the tracker's depends-on column.
## Working tree

- Current delta: **P8 S1 implemented (2026-08-21) — directed-edge motion
  resolver + editor timing parity**. New
  `lib/editor/editor-directed-edge-motion.ts`: pure core
  `resolveDirectedEdgeMotionForConnection` (+ graph-based `…ByDirection`,
  orientation-checked `resolveDirectedEdgeMotion`, pair helper);
  `durationFallback` flags rejected authored durations (codec validation
  already blocks those upstream — defense-in-depth only). The guided
  timeline (`editor-camera-timeline.ts`) and Plan timing readout compile
  through it; six previously-bare preview/authoring sites now apply authored
  timing/easing: preview-controller/preview-commands step breakpoints, Rig
  sampling, view-key authoring sample, drag-preview sync, keyframe-selection
  playhead jump. Legacy `kind:'transition'` keeps bare compilation (multi-edge
  BFS route; retired in S6); visitor `CameraDirector` untouched — authored-
  timing parity there remains a **documented discrepancy** for a separate
  runtime slice. `getCameraMotionOptions` widened structurally (reads
  `timing` only) so persisted + runtime connection records both feed the
  resolver. 11 new tests in `editor-directed-edge-motion.test.ts`, incl.
  direct-edge == guided-timeline sampling parity and Unsequenced-endpoint
  resolution.
- Previous slice: **P1.8 implemented (2026-08-21)** — sequence authoring
  (re-root, strict insertion, preview). Brief:
  [`../archive/plans/2026-08-21-P1.8-camera-sequence-authoring.md`](../archive/plans/2026-08-21-P1.8-camera-sequence-authoring.md).
- Docs synced this slice: `Neighbour-2D.png` registered as the neighbor-
  accordion ground truth ([`2026-08-18-P3-ui-overhaul.md`](../plans/2026-08-18-P3-ui-overhaul.md)
  mapping #10 + QA note; P1.9 Decisions updated), `Empty-staging.png` →
  `Empty-3D.png` rename recorded.

## Next action

- **One action:** open **P8 Slice 2** — readiness survey + design detail
  folded into the umbrella ([Slice 2 design — design detail folded 2026-08-21](../plans/2026-08-21-P8-camera-preview-scopes.md#slice-2--design-detail-folded-2026-08-21),
  grep-verified inventory of preview FSM / session / history hook points),
  then implement explicit preview scopes + transport semantics per
  [`plans/2026-08-21-P8-camera-preview-scopes.md`](../plans/2026-08-21-P8-camera-preview-scopes.md)
  §F S2 (routing: Sol medium per [`plans/model-assessment.md`](../plans/model-assessment.md)).

## Verification

- **1,921 tests green (1 skipped) · `svelte-check` 0 errors / 0 warnings ·
  `vite build` clean** (P8 S1 implementation, 2026-08-21).

## Known bugs / deferred

- Direct 3D **wall/interior-anchor picks deferred** (S6.1):
  `Workspace3DView.handleLayoutPick` falls through for those resolutions; rooms /
  openings / objects stay directly pickable.
- **Layout hover feed** (`onLayoutHover`) + anchor-helper octahedra stay
  disconnected (deferred).
- **Paris-gated `focusRoom` latent** on drafted rooms (throws via Chopin
  `getRoom`) — editor path fixed by S8.2; benign Chopin defaults remain, cleanup
  optional at relic removal.

## Traps

- **Zero-flow documents are legal (P1.9):** `validateCurrentGuidedTourOrder`
  must keep its `< 2` guard before `mainFlowStart` — the seed dereference has
  no internal guard, and flowless graphs are reachable (no auto-promote on
  connect). Empty-chain recovery is the manual Start Sequence path only.
- **Sidebar expansion is component-local (P1.9):** `expandedNodeIds` lives in
  `CameraFlowPanel`; do not reintroduce store-level tree-expansion APIs for
  node rows (the surviving `treeExpandedCameraConnectionIds` session keys are
  delete-time prune targets only).
- **Keep-mounted plan cells (P1.7):** both plan workspaces stay mounted in
  `EditorApp` — the hidden one must keep `inert` + `plan-cell--hidden`, or it
  eats pointer/shortcut input while invisible. The shared fade on their roots
  fires only on Plan ↔ 3D mount/unmount; domain switches use the class fade.
- **Shared view axis (P1.7 follow-up):** `EditorViewState.view` is one shared
  Plan|3D mode for both domains — never reintroduce per-domain view memory
  (`sceneView`/`cameraView`); domain switches must not touch the view.
- **Instant shell swaps (P1.7 follow-up):** no fade/animation on view, domain,
  sidebar, or timeline swaps — `editorWorkspaceFade`, `view-fade-in`,
  `plan-fade-in` are deleted by owner decision; contracts pin their absence.
- **Camera 3D labels (P1.7):** positions resolve through
  `store.getRuntimeNavigationNode` (runtime scene = rooms truth), order from
  `store.mainFlowNodeIds` (not `guidedTourNodeIds`) to match the Plan
  projection; overlay is display-only (`aria-hidden`, no pointer events).
- **Two-node camera cycle:** timeline edges must key
  `` `${connectionId}:${direction}` ``, never `connectionId` alone
  (`each_key_duplicate` crash).
- **Editor camera path/view math** must resolve points through `store.rooms`,
  never `chopinRuntime.rooms` (root cause of the gizmo freeze on drafted
  rooms; `TransformControls` stayed attached to an unmounted helper root).
- **Shortcut cascade:** Escape must run before the W/E/R/T mode-key branch,
  or `cancelPendingNavigation` never fires.
- **S3 `onLayoutSelectionChanged`:** write slots only when they differ —
  unconditional writes spin `effect_update_depth_exceeded`.
- **Camera Plan (P1.5):** shipped — backdrop is hit-testable for placement but
  never commits a layout selection; Camera Plan helpers contain no
  `selectLayout*`/`clearLayoutSelection`/`layoutInteraction` path (source
  asserted). `store.document` + `store.rooms` are scene truth, never the
  boot-time `layoutPreview.project.scene` copy. The viewport rebuilds the plan
  model from a derived projection on pointer moves (established LayoutPlanViewport
  pattern); keep pointer-only state out of the projection so pan/zoom/hover
  stays cheap.
- **Camera = 3D guided PerspectiveCamera navigation**, not a webcam.

## Non-negotiables

- `/museum` + `/museum/editor` frozen; no editor/layout code in `/museum`
  visitor chunks; editor ships in production (no build-flag gating).
- **No commits unless the user asks.**
- One nav + one motion: `camera-route.ts` + `camera-motion.ts` only.
- Svelte 5 runes / Threlte patterns; no second graph/motion/geometry compiler.
