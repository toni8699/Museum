# Current handoff — live working-tree delta

Template per [`../README.md`](../README.md). Sliding window: immediate previous
slice plus one next action only.

## Working tree

- Current delta: **P3B is in progress; Group A and P3B.1–P3B.3 are shipped;
  all work is uncommitted.** P3B.3 adds six ordered cardinal face targets,
  direct-polygon/perimeter-proxy and direction-fallback hysteresis, explicit
  cardinal-active tolerance, pointer capture with the shared 4px drag gate,
  hit priority, keyboard/a11y order, preview-disabled guards, and complete
  hover/pressed/focus/active presentation over P3B.2's immutable projection
  snapshots.
- Post-ship P3B.2/P3B.3 review fixes (2026-08-25, owner-dispositioned):
  removed the vestigial `targetStillValid` gate from pointer activation,
  aligned proxy/axis focus-visible to the specified 2px `--editor-gizmo-hover`
  ring, fixed an axis press tinting the matching face overlay, and documented
  the intentional ≤4px release slop under pointer capture (test + comment).
- Existing P3.4/P3.5 context-menu implementation remains in the tree, but those
  increments are explicitly **undone and deferred as low priority for later
  revisit**, after the rest of P3B is complete. Broader surface, interaction,
  backing-identity, validator, and relic-boundary tests are required before
  acceptance. The work is tracked in
  [`../plans/2026-08-24-P3B-orientation-preview-affordances.md`](../plans/2026-08-24-P3B-orientation-preview-affordances.md).
- Previous slice: **P3B.3 orientation interaction states**, closed 2026-08-25.
  The active P3B umbrella is the back-pointer.

## Next action

- Execute **P3B.4 cardinal snap motion** from the active umbrella: add the pure
  320ms ease-out sampler in the existing camera-motion authority, wire widget
  snaps without a second motion system, preserve the fixture-proven polar
  OrbitControls handoff, support mid-animation retarget/cancel, and honor
  reduced motion. No unresolved gate.

## Verification

- Last known verification: `npm test` 2,122 passed / 1 skipped across 156
  files; `npm run check` 0 errors / 0 warnings; `npm run build` clean with
  existing third-party unused-import and chunk-size warnings; `git diff --check`
  clean.
- Browser QA accepted P3B.3: exact six-face-then-axis Tab order, proxy cues,
  hover/focus/pressed/active states, keyboard activation, pointer capture,
  >4px cancellation, and ≤4px snapping pass. Widget-scoped axe: 0 violations;
  one manual contrast review on token-driven SVG text.

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
- P3B.3 target hysteresis state must persist across projection snapshots; do
  not derive hit mode or proxy fallback from one frame in isolation.
- Camera means guided PerspectiveCamera navigation, never webcam.

## Non-negotiables

- `/museum` and `/museum/editor` frozen; `/museum` visitor chunks contain no
  editor/layout code; editor ships at `/` and `/editor`.
- No commits unless user asks.
- One nav + one motion: `camera-route.ts` + `camera-motion.ts` only.
- Svelte 5 runes / Threlte; no second selection, history, graph, motion,
  geometry, or transform system.
