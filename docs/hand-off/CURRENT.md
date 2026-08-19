# Current handoff — live working-tree delta

Template per [`../README.md`](../README.md). This is a **sliding window**:
only the immediate previous slice (back-pointer) and the single next action
live here. History chains backward through the tracker's depends-on column —
shipped/next lists never accumulate.

## Working tree

- Current delta: **P1.3 shipped (2026-08-18)** — edge-local smootherstep
  envelopes now blend automatic/authored Cartesian targets and FOV in the sole
  motion sampler. Motion creation adaptively compiles deterministic minimum-
  standoff, collinear/POI angular-rate, and hazardous late-exit bypass guards;
  frame sampling stays allocation-free and random-access stable. Focused branch,
  guard, ownership, legacy, relic, and full-suite coverage is green. Archived
  brief: [`../archive/plans/2026-08-18-P1.3-envelope-sampler-guards.md`](../archive/plans/2026-08-18-P1.3-envelope-sampler-guards.md).
- Previous slice: **P1.2 shipped (2026-08-18)** — framing-envelope schema,
  codec, route, motion-preparation, and clone-path threading; committed as
  `50f34ea P1.2`.

## Next action

- **One action:** write and review the **P1.4 implementation brief** for dense
  envelope invariants, auto-managed/manual policy, guard continuity, and FOV-
  pacing acceptance matrices. **P1.5** remains the parallel Camera Plan track;
  **P1.6** converges both tracks.

## Verification

- **1714 tests green (1 skipped) · `svelte-check` 0 errors / 0 warnings · build
  clean** (P1.3, 2026-08-18).

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
