# Current handoff — live working-tree delta

Template per [`../README.md`](../README.md). This is a **sliding window**:
only the immediate previous slice (back-pointer) and the single next action
live here. History chains backward through the tracker's depends-on column.
## Working tree

- Current delta: **P8 S3 implemented (2026-08-22) — edge-local timeline + Preview Edge UI (primary local authoring preview)**. New
  `editor-camera-timeline.ts:createEdgeLocalTimeline(graph,id,dir,{route?})` pure wrapper around `resolveDirectedEdgeMotionByDirection`; hook `hooks/use-camera-timeline.svelte.ts` exposes `edgeTimeline` memoized by `graph+id+dir+preview.runId` (stable vs `cloneResolvedCameraRoute` thrash at `camera-preview-controller.svelte.ts:673`/`museum-editor.svelte.ts:1960`), `edgePlayhead`/`edgeDurationSeconds`/`edgeEndpoints`/`edgeScrubDisabled`/`edgeReverseDisabled`/`edgeRepeat`; new `EditorCameraEdgeRuler.svelte` local ruler `00:02.10 / 00:04.20`, scrub `0..1 step 0.0005`, endpoint labels, Reverse (paused-only, `1-e` flip), Repeat (edge-only) with candidate/read-only mode; `EditorCameraTimelinePanel.svelte` scope branch **before** `{#if timeline}` (`edge`→EdgeRuler, `camera`→controls only, `sequence`→guided, `!preview && activeConnectionId`→candidate — fixes legacy `transition` regression), idle candidate keeps disabled scrub/Reverse/Repeat + CTA; `app/CameraPlanInspector.svelte` adds Preview Edge forward/reverse + Repeat/Reverse sync (Unsequenced endpoints included). Consume-only — no visitor/Rig/controller mutation. 7 new tests in `p8-s3-edge-timeline.test.ts` (unsequenced `C—E`, distinct-instance parity, active-preview precedence, disabled-state contract).
- Previous slice: **P8 S2 implemented (2026-08-22)** — explicit preview scopes + transport semantics (`previewScopeOf`, `edgeRepeat` scoped to `connection`, `swapEdgeDirection` via fresh opposite route + `1-e` edge-domain flip, `previewEdge`/`previewSequence`/`swapEdgePreviewDirection`/`setEdgePreviewRepeat`/`resetPreviewToScopeStart`, `completeCameraPreview` repeat branch with zero-duration guard). Brief: S2 design detail folded 2026-08-21/22 in P8 umbrella.
- Docs synced this slice: P8 Slice 3 design detail folded 2026-08-22 (runId memo fix `controller:673`/`facade:1960`, `1-e` flip, idle candidate disabled state, panel `!preview` guard) + review fixes; `Neighbour-2D.png` / `Empty-3D.png` rename carried.

## Next action

- **One action:** open **P8 Slice 4** — explicit Preview Sequence scope (global ruler becomes sequence-scoped, `Sequence = adjacent pairs` via S1 primitive, global seconds domain, loop derived from real tail→head topology) per [`plans/2026-08-21-P8-camera-preview-scopes.md`](../plans/2026-08-21-P8-camera-preview-scopes.md) §F S4 (routing: DeepSeek V4 Flash per [`plans/model-assessment.md`](../plans/model-assessment.md)).

## Verification

- **1,952 tests green (1 skipped) · `svelte-check` 0 errors / 0 warnings ·
  `vite build` clean** (P8 S3 implementation, 2026-08-22).

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

- **Edge timeline memo must key on `preview.runId`, not route identity:** `getCapturedCameraPreviewRoute(runId)` at `camera-preview-controller.svelte.ts:673`/`museum-editor.svelte.ts:1960` returns `cloneResolvedCameraRoute` per call — route identity thrashes every `$derived`; `createEdgeLocalTimeline` opts `{route}` must be fetched via `preview.runId` stable key.
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
