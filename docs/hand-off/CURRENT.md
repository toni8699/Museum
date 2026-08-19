# Current handoff — live working-tree delta

Template per [`../README.md`](../README.md). This is a **sliding window**:
only the immediate previous slice (back-pointer) and the single next action
live here. History chains backward through the tracker's depends-on column —
shipped/next lists never accumulate.

## Working tree

- Previous slice: **plan-system renewal + documentation rework** (2026-08-18,
  shipped and archived). Chain back via
  [`../plans/README.md`](../plans/README.md) (depends-on) and the archived
  [2026-08-18 scope decision](../archive/plans/2026-08-18-scope-decision-camera-first.md).
- Current delta: execution order committed (**P1 → P2 → P3**); 38 shipped
  letter-era plans archived; **P1–P5 umbrella docs** composed with all source
  content folded in (originals deleted); `docs/` rebuilt as the context router.
- All plan/doc changes **uncommitted**; no application-code changes in flight.

## Next action

- **One action:** ratify the **shell inversion** (P1.1's gate — approve
  superseding the prior shell invariants 1, 3, parts of 2; enumerated in
  **P1 §A**), then implement **P1.1** (successor domain×view shell); the engine
  track **P1.2–P1.4** runs in parallel.

## Verification

- **1690 tests green · `svelte-check` 0 · build clean** (S10.1 closeout,
  2026-08-18). Doc rework adds no code.

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
- **Camera Plan (P1.5):** the read-only backdrop must stay hit-testable for
  placement but never commit a layout selection (old `layout > scene > camera`
  reducer would detach the camera selection).
- **Camera = 3D guided PerspectiveCamera navigation**, not a webcam.

## Non-negotiables

- `/museum` + `/museum/editor` frozen; no editor/layout code in `/museum`
  visitor chunks; editor ships in production (no build-flag gating).
- **No commits unless the user asks.**
- One nav + one motion: `camera-route.ts` + `camera-motion.ts` only.
- Svelte 5 runes / Threlte patterns; no second graph/motion/geometry compiler.
