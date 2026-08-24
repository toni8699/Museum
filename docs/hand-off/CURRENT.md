# Current handoff — live working-tree delta

Template per [`../README.md`](../README.md). Sliding window: immediate previous
slice plus one next action only.

## Working tree

- Current delta: **P3 reopened; P10 remains shipped; all work is uncommitted.**
  The owner rejected P3's 2026-08-24 close because the result read as a
  token/color pass rather than the canonical structural overhaul. P3.6 now
  replaces Plan line/bar approximations with architectural wall thickness,
  door swings/leaves and window frames; makes room paper opaque; differentiates
  Camera Plan with a subdued canvas; and expands the Camera timeline into the
  five canonical display lanes inside the documented 288 px default shell.
- P3.4/P3.5 add one shared context-menu shell plus Scene 3D, Scene Plan
  Layout/Arrange, Outliner, Camera Plan/3D, and timeline adapters over existing
  commands. Final review fixed native-menu suppression, exact target identity
  selection-before-menu, Outliner opening/object selection, and blocked
  room-Rename handling. Context-menu models have 19 focused tests.
- Pre-P3 correctness work remains in this delta: authored piano Plan outline,
  mesh-readiness OBB invalidation, and stale child-`matrixWorld` repair.
- The P3 umbrella is active again and records the corrective source/state/QA
  boundaries. The earlier close note is explicitly rejected, not approval
  evidence. No commit.
- Previous slice: **P2 shipped uncommitted 2026-08-23** — Scene Plan staging,
  transforms/history, and render-boundary close-out. Archived plan is the
  back-pointer.

## Next action

- **Owner review:** compare the refreshed Scene Plan, Camera Plan, and expanded
  timeline captures with the canonical sketches. Approve P3.6 or return exact
  remaining structural deviations; do not archive/close P3 before that review.

## Verification

- `npm test`: **2,074 passed / 1 skipped** across 153 files.
- `npm run check`: **0 errors / 0 warnings**.
- `npm run build`: clean; existing third-party unused-import and chunk-size
  warnings only.
- `git diff --check`: clean.
- Legacy P3 gold-accent literals: zero in live editor scope; numeric typography
  uses tabular Inter, not monospace.
- Browser QA: authored room with door/window symbols, opaque Scene Plan room,
  populated Camera Plan on its distinct paper, two-node sequence preview with
  all five lanes and visible endpoint handles. Fresh browser session after a
  clean dev-server restart reports zero page errors.

## Known bugs / deferred

- Direct 3D wall/interior-anchor picks remain deferred; rooms, openings, and
  objects are directly pickable.
- Layout hover feed and anchor-helper octahedra remain disconnected.
- Drafted-room `focusRoom` still has a latent Paris-default path outside the
  fixed editor flow.
- Runtime logs expose existing Svelte `ownership_invalid_mutation` warnings for
  `cameraPlan` and `layoutInteraction`; static `svelte-check` remains clean.

## Traps

- Context-menu handlers call `preventDefault()` only after an approved custom
  menu resolves; editable targets and empty space retain native behavior.
- Selection-before-menu compares full target identity. Same-kind/different-id
  targets must select before menu; already-selected Scene members preserve
  multi-selection.
- Both Plan workspaces stay mounted. Hidden cell must retain `inert` and
  `plan-cell--hidden`; shared `view` remains one Plan|3D axis.
- Camera timeline edge keys include direction; preview-route memo keys on
  `preview.runId`, never cloned route identity.
- Camera means guided PerspectiveCamera navigation, never webcam.

## Non-negotiables

- `/museum` and `/museum/editor` frozen; `/museum` visitor chunks contain no
  editor/layout code; editor ships at `/` and `/editor`.
- No commits unless user asks.
- One nav + one motion: `camera-route.ts` + `camera-motion.ts` only.
- Svelte 5 runes / Threlte; no second selection, history, graph, motion,
  geometry, or transform system.
