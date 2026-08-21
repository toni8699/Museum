# Current handoff — live working-tree delta

Template per [`../README.md`](../README.md). This is a **sliding window**:
only the immediate previous slice (back-pointer) and the single next action
live here. History chains backward through the tracker's depends-on column —
shipped/next lists never accumulate.## Working tree

- Current delta: **P1.7 shipped (2026-08-21)** — Camera domain reconciled:
  dedicated four-section `CameraSidebar` (Environment · Sequence Inspector ·
  Unsequenced · Connections; connections = chain records + retained tray,
  undirected `A — B`, delete only on retained rows), read-only "Main Visitor
  Tour" timeline selector, shared reduced-motion-aware `editorWorkspaceFade`
  (~200 ms) on workspace/timeline/sidebar roots. Review fixes folded in:
  **Camera 3D now shows guided order digits + Unsequenced badges**
  (`editor-camera-labels.ts` model + `EditorCameraLabelProjector`/
  `EditorCameraLabelsOverlay`, gizmo writer/overlay pattern, order from
  `store.mainFlowNodeIds` so Plan and 3D agree) and **2D keeps its viewport
  across Scene ⇄ Camera** (`EditorApp` renders both plan workspaces keep-mounted
  in `plan-cell` wrappers — G3 pattern; hidden cell `inert` + class-faded, each
  surface retains pan/zoom). Timeline drag-connect removed as the documented
  P1.8 prerequisite (P1.8 §6). **Owner follow-ups: the Camera timeline never
  auto-expands on a domain switch** (expansion state persists verbatim;
  `sceneTimelineExpanded` memory removed); **the Plan | 3D view is shared
  across domains** (`EditorViewState` single view, boot Scene → Plan — a
  Scene ⇄ Camera switch keeps the current view; shell spec §2 amended); and
  **all view/domain switches are instant** (shared fade helper + S10.1.6
  mount/context fades removed; shell spec §20 transition superseded). Brief archived:
  [`../archive/plans/2026-08-20-P1.7-camera-ui-reconciliation.md`](../archive/plans/2026-08-20-P1.7-camera-ui-reconciliation.md)
  (manual GUI walk owner-waived).
- Previous slice: **P1.6 implemented (2026-08-20)** — pure framing-authoring
  model + controller policy/history binding and the timeline band/handles +
  F1 viewMode threading + comfort diagnostics.
  Brief: [`../archive/plans/2026-08-20-P1.6-framing-authoring.md`](../archive/plans/2026-08-20-P1.6-framing-authoring.md).

## Next action

- **One action:** start **P1.8** camera sequence authoring
  ([brief](../plans/2026-08-21-P1.8-camera-sequence-authoring.md)) — last P1
  increment; ratify its D1/D2 gates first.

## Verification

- **1,894 tests green (1 skipped) · `svelte-check` 0 errors / 0 warnings ·
  `vite build` clean** (P1.7 implementation + review fixes, 2026-08-21).

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
