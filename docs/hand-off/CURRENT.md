# Current handoff — live working-tree delta

Template per [`../README.md`](../README.md). This is a **sliding window**:
only the immediate previous slice (back-pointer) and the single next action
live here. History chains backward through the tracker's depends-on column —
shipped/next lists never accumulate.## Working tree

- Current delta: **P1.5 shipped (2026-08-19)** — Camera Plan surface mounted
  in the P1.1 Camera → Plan cell: live architectural backdrop + top-down
  camera-graph authoring (Add Camera / Connect / XZ node+anchor drag / direct
  path bend via existing store commands, one history entry each), exact shared
  draft-curve projection with order/free/retained/selection visuals, node →
  anchor → edge → empty hit priority, no-framing profile assertions,
  bidirectional effective timing labels, Plan-only timing Inspector with
  authored/automatic switching, workspace-specific Plan inspector authority,
  and anchor Delete/Backspace routing. `CameraPlanPlaceholder` removed. Archived
  brief:
  [`../archive/plans/2026-08-19-P1.5-camera-plan-surface.md`](../archive/plans/2026-08-19-P1.5-camera-plan-surface.md).
- Previous slice: **P7.4 shipped (2026-08-19)** — shared editor-shell boot
  composable (`useEditorShellBoot`) extracted from `MuseumEditorApp.svelte` +
  `app/EditorApp.svelte`: dirty guard (`beforeNavigate` + `beforeunload`) and
  texture-loader lifecycle; shortcut wiring stays shell-owned. Brief: §P7.4 of
  [`../plans/2026-08-19-P7-editor-facade-collapse.md`](../plans/2026-08-19-P7-editor-facade-collapse.md).

## Next action

- **One action:** implement **P1.6** — converge both tracks: framing authoring
  UX bound to P1.4's pure envelope policy plus the Camera 3D Connection-
  Inspector duration field (same per-direction connection timing authored in
  P1.5).

## Verification

- **1,834 tests green (1 skipped) · `svelte-check` 0 errors / 0 warnings · build
  clean** (P1.5 closeout, 2026-08-19).

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
