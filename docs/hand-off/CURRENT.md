# Current handoff — live working-tree delta

Template per [`../README.md`](../README.md). Sliding window: immediate previous
slice plus one next action only.

## Working tree

- Current delta: **P3B is in progress; Group A and P3B.1–P3B.5 are shipped;
  all work is uncommitted.** P3B.4 adds the pure cardinal snap sampler in the
  camera-motion authority (320ms ease-out great-circle direction/distance/up
  plus a target-blend channel for fallback-replaced targets), the exported
  two-phase resolution split consumed by both commit paths, projector-driven
  flight with the fixture-pinned landing handoff, mid-flight retarget from the
  last applied sample, cancel on manual orbit (`start` event), and the
  reduced-motion instant path. Review fix: every cancellation path (manual
  orbit, preview takeover, teardown, missing-ref teardown, reduced-motion
  replacement) routes through the non-terminal
  `cancelEditorOrientationSnap` handoff — global +Y restore + inertia drain —
  so an interrupted ±Y flight cannot leak its interpolated lookAt/up reference;
  fixtures pin mid-flight cancel on both polar faces and exact eye/target
  continuity.
- P3B.5 adds selection-free named camera preview, one shared Plan/3D edge
  affordance, sequence-adjacent predecessor→successor direction derivation,
  explicit two-direction choices for all other edges, Sequence Inspector /
  Timeline sequence ownership, and named Camera/Edge/Sequence scope labels.
- Post-P3B.5 review fix (2026-08-25): timeline ▶ now controls the *current*
  preview scope per the P3B.5 grammar — resumes/replays an active edge or
  sequence instead of hijacking to Sequence; idle/camera-hold still starts the
  default sequence transport. Orphaned S3 EdgeRuler hook methods removed
  (`toggleEdgePlayback`, `previewActiveEdge`, `stepEdge`, `seekEdge`,
  `toggleEdgeReverse`, hook-level `setEdgeRepeat`). Known follow-up:
  `swapEdgePreviewDirection` / store-level `setEdgePreviewRepeat` have no UI
  caller since the shared edge-affordance rewrite — owner decision pending.
  Post-review fixes preserve pending navigation across every preview entry,
  restore the mutation gate on Insert/Disconnect Loop, use CirclePlay rather
  than Eye for node preview, unify sequenced/unsequenced preview availability,
  and expose the edge actions as an accessible labeled group.
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
- Previous slice: **P3B.4 cardinal snap motion**, closed 2026-08-25.
  The active P3B umbrella is the back-pointer.

## Next action

- Execute **P3B.6 retained-edge selection parity** from the active umbrella:
  unsequenced connections must show hover/selection feedback over (without
  losing) their retained dashed/desaturated base. No unresolved gate.

## Verification

- Last known verification: `npm test` 2,156 passed / 1 skipped across 158
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
- Snap flights (P3B.4) write sampled poses per frame and land via
  `controls.update()` + global `+Y` restore; every *interruption* (manual
  orbit, preview takeover, teardown) must route through the non-terminal
  `cancelEditorOrientationSnap` handoff — a raw runtime clear leaks the
  interpolated `camera.up` into OrbitControls' live lookAt/update orientation.
  Cancellation
  listens on the controls `start` event, so programmatic updates never cancel
  a flight. Retarget replaces the flight from the last applied sample and
  must not call the handoff.
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
