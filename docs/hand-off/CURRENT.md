# Current handoff — live working-tree delta

Template per [`../README.md`](../README.md). Sliding window: immediate previous
slice plus one next action only.

## Working tree

- Current delta: **P3 closed 2026-08-24; P3B is the new clean-state proposed
  follow-up; P10 remains shipped; all work is uncommitted.** P3.1–P3.3 and P3.6
  are accepted: structural Plan walls/openings, opaque rooms, distinct Camera
  Plan paper, the persistent five-lane timeline, and removal of the blocking
  XYZ overlay.
- Existing P3.4/P3.5 context-menu implementation remains in the tree, but those
  increments are explicitly **undone and deferred as low priority for later
  revisit**, after the rest of P3B is complete. Broader surface, interaction,
  backing-identity, validator, and relic-boundary tests are required before
  acceptance. The work is tracked in
  [`../plans/2026-08-24-P3B-orientation-preview-affordances.md`](../plans/2026-08-24-P3B-orientation-preview-affordances.md).
- P3B owns three core slices: Scene 3D orientation interaction, Scene/Camera
  Plan chrome parity, and Camera preview-affordance reconciliation. This
  includes white/light passive layout boxes, X/Z rulers, grid LOD, segmented
  scale chrome, token cleanup, metadata clearance, explicit preview-target
  labels, and canonical edge-direction derivation. It targets the current
  Scene|Camera × Plan|3D shell; P3B creates no additional workspace or state
  system. Deferred P3.4/P3.5 acceptance remains a non-blocking tail.
- Previous slice: **P3.6 structural visual reconciliation**, now closed under
  P3. The archived umbrella plan is the back-pointer.

## Next action

- Start P3B slices A and C in parallel where useful: Plan chrome parity and
  preview affordance reconciliation can proceed independently while the
  orientation branch performs snap-authority discovery. If no snap authority
  exists, pause only B.1–B.4; do not invent behavior. Revisit P3.4/P3.5 later
  as the separate low-priority acceptance tail.

## Verification

- Last known verification: `npm test` 2,075 passed / 1 skipped across 153
  files; `npm run check` 0 errors / 0 warnings; `npm run build` clean with
  existing third-party unused-import and chunk-size warnings; `git diff --check`
  clean.
- Browser QA accepted P3.6: architectural room symbols, opaque Scene Plan,
  distinct Camera Plan paper, five-lane camera/edge/sequence previews, and
  XYZ-free Camera 3D.

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
- Camera means guided PerspectiveCamera navigation, never webcam.

## Non-negotiables

- `/museum` and `/museum/editor` frozen; `/museum` visitor chunks contain no
  editor/layout code; editor ships at `/` and `/editor`.
- No commits unless user asks.
- One nav + one motion: `camera-route.ts` + `camera-motion.ts` only.
- Svelte 5 runes / Threlte; no second selection, history, graph, motion,
  geometry, or transform system.
