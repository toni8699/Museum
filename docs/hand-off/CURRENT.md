# Current handoff — live working-tree delta

Template per [`../README.md`](../README.md). This is a **sliding window**:
only the immediate previous slice (back-pointer) and the single next action
live here. History chains backward through the tracker's depends-on column.
## Working tree

- Current delta: **P8 S5 implemented (2026-08-22) — interaction matrix for the §G edge-case rows, plus tour hard-reset**. New `tests/lib/editor/app/p8-s5-interaction-matrix.test.ts` (7 tests, `wired()`-style composition mirroring `EditorApp`'s workspace mapping — `viewState.domain === 'camera'` → `setWorkspace('camera')`, so the G3 no-op is real): **Plan↔3D switch preserves an active edge preview** (same runId/transport/scope/direction/playhead/selection across `setView('camera','plan')` ↔ `'3d'`) and **a playing sequence preview** (not stopped, not reset — same runId, transport `playing`, playhead); **deleting the selected edge** stops the preview, clears the captured route + `edgeRepeat`, sets the status message (§G row, via the real facade `deleteConnection` — off-flow fixture `tour-b-free-e`, flow edges are `guided_connection`-locked); **undo/redo strict facade path** — `deleteConnection` → `undo()` (connection restored, timeline rebuilds, no stale preview/route) → `redo()` (re-deleted cleanly), exercising `#pruneInvalidCameraPreview`, not the S2 `pruneIfStale` bypass; **sequence edited while previewing** — paused Director **tour** hard-resets on ANY document replace (owner decision 2026-08-22: `refreshPausedDirector` tour branch stops it with the status message; no re-resolution, no runId bump; undo-while-paused also stopped + messaged), playing tour blocks the mutation; paused connection/node previews KEEP refreshing (they are the framing-authoring surface — a blanket reset broke 5 `museum-editor-camera` authoring tests and was rejected). One code change: `refreshPausedDirector` tour branch hard-reset. No commands, FSM, or UI (the 3D Preview Edge button idea was dropped per owner — selecting an edge + Play already previews). Finding-2 root cause eliminated: runId changes only on deliberate restarts (install/play/swap/repeat). Owner-ratified 2026-08-22: playback advancement stays Rig-owned — no auto-pause, no store-level tick; frozen-on-screen-while-in-Plan accepted.
- Previous slice: **P8 S4 implemented (2026-08-22) — explicit Preview Sequence scope**.
  `previewSequence` is now the canonical entry: AppBar ×2 ("Preview Flow" → "Preview Sequence", both call `store.previewSequence()`), hook `toggleTourPlayback` → pause or `previewSequence('director')` — context-sensitive reverse-edge hijack removed (edge transport owned by the S3 EdgeRuler), PreviewControls label "Resume preview" → "Replay" at `transport === 'complete'`. S4 acceptance fix: `previewSequence` keeps the current (scrubbed) playhead when nothing is saved — "play continues from exact local progress" from idle. Post-review D6 fix: saved-but-unbuildable timeline → reset to 0, even from a non-zero playhead (regression test strengthened in `p8-s2-preview-scope.test.ts` to seed `cameraTimelinePlayhead = 0.3`). Legacy `EditorAppBar.svelte` `canPreviewTour` now gates on `canStartTourPreview` (parity with `app/EditorAppBar.svelte`). Implementation finding: `walkFlowChain` throws on <2 ordered nodes (camera-route.ts:442) — one-node flows resolve to the null-timeline path, never a 0-edge timeline (plan D5/readiness/matrix amended; `seekCameraTimeline` no-op already covers). 10 new tests in `p8-s4-preview-sequence.test.ts` (boundary epsilon, play-from-scrub parity, end-of-sequence Replay, holds, one/two-node flows, loop-topology derivation + `edgeRepeat` topology invariant, demoted context-sensitive play, D6 valid-restore).
- Docs synced this slice: P8 Slice 5 design detail folded 2026-08-22 in P8 umbrella (D1–D6; owner ratified the D2 freeze behavior in writing; 3D Preview Edge buttons dropped); CURRENT.md advanced to S6.

## Next action

- **One action:** open **P8 Slice 6** — Legacy retirement (remove `kind: 'transition'` compatibility path once callers migrate; delete `tour`/`guided`-era aliases (D6); sweep internal naming to camera/edge/sequence — behavior-neutral, may ride with a later slice) per [`plans/2026-08-21-P8-camera-preview-scopes.md`](../plans/2026-08-21-P8-camera-preview-scopes.md) §F S6 (routing: DeepSeek V4 Flash per [`plans/model-assessment.md`](../plans/model-assessment.md)).

## Verification

- **1,970 tests green (1 skipped) · `svelte-check` 0 errors / 0 warnings ·
  `vite build` clean** (P8 S5 implementation, 2026-08-22).

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
