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
- Current delta: **P1.1 shipped (2026-08-18)** — successor **domain×view
  shell** (§A ratified; implemented per **P1 §A.1** with the G1–G6 review
  amendments): domain×view matrix + per-domain view memory + **domain-gated
  selection** + **Camera-domain timeline** ownership + Camera → Plan
  placeholder cell + per-row-type sidebar gating. Review follow-up removed the
  empty Camera rail, hid Scene-only sidebar tabs/Assets/Add Room in Camera,
  and made status-bar save/grid/snap/hints workspace-aware.
- **Status bar added** (design-spec §2/§18 — the one shell-region gap):
  persistent bottom region in every workspace (workspace, selection, save
  state, nav hints, grid/snap/units).
- **Design-spec conformance mapping folded into P1 §A.2** (target:
  `docs/Design-specs/Design-shell-specs.md`).
- **P1.2 implementation brief added as a separate active doc:**
  [`2026-08-18-P1.2-framing-envelope-serialization.md`](../plans/2026-08-18-P1.2-framing-envelope-serialization.md).
- **P1.1 committed** (`dc31ddc feat(editor): add domain-view workspace shell`).
  Plan/doc updates (this hand-off, the P1 umbrella's P1.1 close note, and the
  P1.2 brief) remain uncommitted.

## Next action

- **One action:** implement the now-briefed engine track **P1.2–P1.4** (framing envelope
  serialization + ordering validation + `resolveSceneDocument` threading + FOV
  copy fix + clone-survival test) runs in parallel with **P1.5** — the
  **Camera Plan surface** mounts into the P1.1 shell (the placeholder cell).
  **P1.6** converges both tracks; **P1.7** last.

## Verification

- **1697 tests green · `svelte-check` 0 errors / 0 warnings · build clean**
  (P1.1 review fixes, 2026-08-18).

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
