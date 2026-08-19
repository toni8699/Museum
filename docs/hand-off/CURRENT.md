# Current handoff — live working-tree delta

Template per [`../README.md`](../README.md). This is a **sliding window**:
only the immediate previous slice (back-pointer) and the single next action
live here. History chains backward through the tracker's depends-on column —
shipped/next lists never accumulate.

## Working tree

- Current delta: **P1.4 shipped (2026-08-19)** — dense whole-transition
  non-degeneracy, endpoint, continuity, singularity, double-whip, seek-order,
  and FOV-pacing acceptance matrices in `camera-motion.test.ts` plus pure
  auto-managed/manual framing-envelope editor policy
  (`editor-camera-framing-envelope.ts`). Archived brief:
  [`../archive/plans/2026-08-19-P1.4-envelope-invariants-policy.md`](../archive/plans/2026-08-19-P1.4-envelope-invariants-policy.md).
- Previous slice: **P1.3 shipped (2026-08-18)** — envelope sampler and compiled
  standoff, angular-rate, and late-exit guards. Archived brief:
  [`../archive/plans/2026-08-18-P1.3-envelope-sampler-guards.md`](../archive/plans/2026-08-18-P1.3-envelope-sampler-guards.md).
- **P1.5 implementation brief ready (2026-08-19):**
  [`../plans/2026-08-19-P1.5-camera-plan-surface.md`](../plans/2026-08-19-P1.5-camera-plan-surface.md).

## Next action

- **One action:** implement the now-briefed **P1.5** Camera Plan surface in the
  P1.1 shell; **P1.6** then converges both tracks with framing authoring UX bound
  to P1.4's pure policy.

## Verification

- **1,802 tests green (1 skipped) · `svelte-check` 0 errors / 0 warnings · build
  clean** (P1.4 closeout, 2026-08-19).

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
