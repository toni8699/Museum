# Current handoff — live working-tree delta

Template per [`../README.md`](../README.md). This is a **sliding window**:
only the immediate previous slice (back-pointer) and the single next action
live here. History chains backward through the tracker's depends-on column —
shipped/next lists never accumulate.

## Working tree

- Current delta: **P1.2 shipped (2026-08-18)** — optional per-direction
  `framingEnvelope` now validates and round-trips through scene/project codecs,
  resolves and routes without direction remapping, survives motion preparation
  and both editor clone paths, and remains uninterpreted so playback is
  unchanged. Last-key deletion and reverse-key sync preserve authored envelopes.
- Previous slice: **P1.1 domain×view shell** (2026-08-18, shipped). Chain back
  via [`../plans/README.md`](../plans/README.md).
- **P1.1 committed** (`dc31ddc feat(editor): add domain-view workspace shell`).
  P1.2 implementation and plan/doc closeout remain uncommitted.

## Next action

- **One action:** implement **P1.3**, the envelope sampler blend `w(p)` plus its
  singularity, collinear-zero, and double-whip engine guards. **P1.5** remains
  the parallel Camera Plan surface track; **P1.6** converges both tracks.

## Verification

- **1707 tests green (1 skipped) · `svelte-check` 0 errors / 0 warnings · build
  clean** (P1.2, 2026-08-18).

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
