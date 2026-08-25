# Current handoff — live working-tree delta

Template per [`../README.md`](../README.md). Sliding window: immediate previous
slice plus one next action only.

## Working tree

- Current delta: **P3B is in progress; Group A, P3B.1, and P3B.2 are shipped;
  all work is uncommitted.** P3B.2 replaced the rejected static orientation
  cube with pure camera-projected geometry, immutable per-frame snapshots,
  front-face SVG rendering, uppercase face labels with edge-on fades, unique
  dark edges, corner-anchored positive axes, and bidirectional foreshortening
  reticles. Scene-3D-only mounting, preview gate, keyboard activation, and the
  canonical six-face snap authority remain intact.
- Existing P3.4/P3.5 context-menu implementation remains in the tree, but those
  increments are explicitly **undone and deferred as low priority for later
  revisit**, after the rest of P3B is complete. Broader surface, interaction,
  backing-identity, validator, and relic-boundary tests are required before
  acceptance. The work is tracked in
  [`../plans/2026-08-24-P3B-orientation-preview-affordances.md`](../plans/2026-08-24-P3B-orientation-preview-affordances.md).
- Previous slice: **P3B.2 orientation projection/render rework**, closed
  2026-08-24. The active P3B umbrella is the back-pointer.

## Next action

- Execute **P3B.3 orientation interaction states** from the active umbrella:
  six-face perimeter/proxy hit geometry with hysteresis and hit priority;
  explicit active-cardinal tolerance; pointer capture plus the shared 4px
  click-vs-drag threshold; hover/pressed/focus/disabled presentation; guarded
  preview behavior; and pointer/keyboard isolation tests. Consume P3B.2's
  immutable face centers/directions and eye direction; do not reread mutable
  camera refs in the DOM overlay. No unresolved gate.

## Verification

- Last known verification: `npm test` 2,119 passed / 1 skipped across 156
  files; `npm run check` 0 errors / 0 warnings; `npm run build` clean with
  existing third-party unused-import and chunk-size warnings; `git diff --check`
  clean.
- Browser QA accepted P3B.2: free-orbit snapshots rotate the SVG immediately;
  Top/Right snaps, keyboard activation, culling/labels/axes/reticles, and the
  Scene-only mount gate pass. Widget-scoped axe: 0 violations; one manual
  contrast review on token-driven SVG text.

## Known bugs / deferred

- P3.4/P3.5 are implemented but undone/not accepted; they are low priority and
  deferred for later revisit after the rest of P3B.
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
- Stable mutable Three camera refs are not orientation-render signals. P3B.2's
  immutable projection snapshot is the DOM overlay authority.
- Camera means guided PerspectiveCamera navigation, never webcam.

## Non-negotiables

- `/museum` and `/museum/editor` frozen; `/museum` visitor chunks contain no
  editor/layout code; editor ships at `/` and `/editor`.
- No commits unless user asks.
- One nav + one motion: `camera-route.ts` + `camera-motion.ts` only.
- Svelte 5 runes / Threlte; no second selection, history, graph, motion,
  geometry, or transform system.
