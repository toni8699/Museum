# Current handoff — live working-tree delta

Template per [`../README.md`](../README.md). This is a **sliding window**:
only the immediate previous slice (back-pointer) and the single next action
live here. History chains backward through the tracker's depends-on column —
shipped/next lists never accumulate.## Working tree

- Current delta: **P1.6 implemented (2026-08-20)** — both checkpoints landed:
  pure framing-authoring model + controller policy/history binding (F2/F3,
  first-key seed, auto-expand, forward↔reverse mirror, preset/handle manual
  flips) and the timeline band/handles + F1 viewMode threading + comfort
  diagnostics. Store/history and F3 guard-status tests added. Manual
  acceptance scenarios still to be walked in the GUI before closeout.
  Brief: [`../plans/2026-08-20-P1.6-framing-authoring.md`](../plans/2026-08-20-P1.6-framing-authoring.md).
- Previous slice: **P1.5 shipped (2026-08-19)** — Camera Plan surface mounted
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

## Next action

- **One action:** walk the P1.6 **manual acceptance** scenarios (Camera 3D
  presets/handles/diagnostics, Plan ⇄ 3D timing parity, Undo atomicity), then
  archive the brief and start **P1.7** camera UI reconciliation.

## Verification

- **1,888 tests green (1 skipped) · `svelte-check` 0 errors / 0 warnings ·
  `vite build` clean** (P1.6 implementation, 2026-08-20).

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
