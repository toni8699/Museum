# Current handoff — live working-tree delta

Template per [`../README.md`](../README.md). Sliding window: immediate previous
slice plus one next action only.

## Working tree

- Current delta: **Layout bugfixes on top of P11.1 (2026-08-25,
  uncommitted).** (1) Sequential-transform loss: the gizmo host's
  same-target fast path retains the pre-commit adapter, so scale→move/rotate
  derived dimensions from the stale baseline and reverted them;
  `layout-gizmo-adapter` `begin()` now re-resolves the descriptor against the
  canonical layout at drag start (fallback to captured descriptor when the
  identity no longer resolves); the two `layout-gizmo-adapter`
  sequential-transform pins that were failing red now pass. (2) Sphere
  pancake: spheres render/pick/AABB at their X/Z footprint diameter on every
  axis (`sphereRenderScale` moved to `$lib/layout/layout-geometry-objects`,
  re-exported by `layout-object-editing`; wired into `transformedSphereSamples`
  + `LayoutPreviewScene`), and Plan placement stores the resting center
  (floor + radius). Legacy documents with old centers may sit slightly off;
  Y-dimension edits no longer distort spheres. Golden object-matrix digest and
  three pinned sphere tests migrated as intentional geometry corrections.
- Previous delta: **P11.1 — selection-driven scope seam — implemented
  2026-08-25 (uncommitted).** Camera node/connection selection now installs
  the matching paused preview scope through a new host seam
  (`selectionActions → installSelectionPreviewScope → cameraPreviewCommands.
  installSelectionScope`), superseding P8 D1 / P3B Group C and the P8 S5
  leave-Sequence-playing rule. Seam contract: resolve route before mutating
  (failed installs leave the current scope untouched); never autoplay; pause
  Sequence by scope replacement with `lastSequencePlayhead` snapshot, no
  `stopCameraPreview()` teardown; current-edge handoff maps local progress
  only when the global ruler sits inside the selected edge's span
  (`cameraTimelineEdgePlayheadAtProgress` clamps, so the span check is the
  staleness gate); idempotent for matching paused scopes; re-selecting the
  playing edge pauses it in place; Observer/Through mode preserved on scope
  switches, director on idle entry; scrub-driven selects forward
  `preservePreviewObserver` to keep Follow framing and skip recenter.
  Explicit entries: `previewSelectedConnection` now blocks only on *playing*
  previews (paused selection-scopes are ordinary authoring state);
  `previewSelectedNode`/`previewEdge`/`previewSequence` unchanged. Selection
  guards dropped `isDocumentMutationBlocked` but bar the new
  `isCameraPreviewStopping` window (stop/restore re-entrancy).
- Migrated superseded pins (renamed/commented as P11.1 migrations):
  Phase 3.1 parity pair, guards matrix, Director-blocks-mutations, Phase 2.1
  helpers visibility, both Phase 2.2 scrub tests, P3B.5 playhead-preservation,
  three P8 S3 hook-level tests. New suite:
  `tests/lib/editor/store/p11-s1-selection-scope.test.ts` (12 cases).
- P3B.1–P3B.6 remain shipped in tree (see previous slices below); P3B.4 adds the pure cardinal snap sampler in the
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
  `toggleEdgeReverse`, hook-level `setEdgeRepeat`). Resolved follow-up
  (2026-08-25): the orphaned `swapEdgePreviewDirection` / store-level
  `setEdgePreviewRepeat` APIs are dispositioned into P11 — its Edge Reverse /
  Repeat controls become their UI callers (P11 plan §10, P11.4); no interim
  wiring before that slice.
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
- P3B.6 retained-edge selection parity is closed 2026-08-25: retained
  dashed/desaturated edges preserve their base presentation while exposing
  visible hover and selection feedback; focused tests, type checking, and
  build validation passed.
- Previous slice: **P3B.6 retained-edge selection parity**, closed 2026-08-25.
  The active P3B umbrella is the back-pointer.

## Next action

- **P11.2 — Mutation policy / paused authoring**, starting with the mutation-
  gate pre-inventory annex (~100 `isDocumentMutationBlocked` sites) per P11 §11.
  Outstanding before P11 close: §15 contract reconciliation in
  `camera-tour.md` + shell/design specs. P3B.7a/P3B.8 QA stays blocked until
  P11 semantics settle.

## Verification

- Working tree (P11.1 + review fixes + layout bugfixes): `npm run check`
  0 errors / 0 warnings. `npm test`: **2 failures remain and both are
  pre-existing on the pre-P11.1 tree** (`editor-store-camera > rejects guided
  and disconnecting connection deletion…`, `app/contracts > keeps pending
  navigation intact…`). The earlier concurrent layout/sphere golden +
  preview-state failures are resolved by the layout bugfixes above.
  Owner triage pending on the two pre-existing rows.
- New coverage: `tests/lib/editor/store/p11-s1-selection-scope.test.ts`
  (15 cases incl. edge canUndo, stop→select re-entrancy bars, and the
  failed-install-does-not-snapshot ordering pin);
  `layout-gizmo-adapter` sequential-transform pins now green;
  sphere diameter contract pinned in `layout-object-editing`,
  `layout-preview-state`, and the regenerated `layout-geometry-golden`
  object-matrix digest (sphere-only diff).
- Browser QA accepted P3B.3 earlier: exact six-face-then-axis Tab order,
  proxy cues, hover/focus/pressed/active states, keyboard activation, pointer
  capture, >4px cancellation, ≤4px snapping pass. Widget-scoped axe:
  0 violations.

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
- P11.1 seam ordering: resolve the route BEFORE any preview mutation — a
  failed install must leave the current scope intact. The edge local-progress
  handoff needs an explicit span check (`getEditorCameraTimelineLocation`);
  `cameraTimelineEdgePlayheadAtProgress` clamps out-of-span positions to 0/1
  and never rejects. Selection during `stopCameraPreview` is barred via
  `isCameraPreviewStopping`, not the broad mutation gate.
- P11.1 review-fix policy: transaction/stopping bars live at SELECTOR entry
  (no reducer-commit-then-fail). If edge route resolution fails after the
  reducer write, selection stays canonical with NO scope; status explains and
  the next successful action repairs — never roll navigation back.
  Second review round: `lastSequencePlayhead` snapshot happens only AFTER
  seam validation (a failed install no longer clobbers the saved playhead),
  and `isCameraPreviewStopping` spans the whole `stopCameraPreview` body
  (keyframe-drag cancel → framing-cancel → restore → clear), single
  try/finally.
- Camera means guided PerspectiveCamera navigation, never webcam.

## Non-negotiables

- `/museum` and `/museum/editor` frozen; `/museum` visitor chunks contain no
  editor/layout code; editor ships at `/` and `/editor`.
- No commits unless user asks.
- One nav + one motion: `camera-route.ts` + `camera-motion.ts` only.
- Svelte 5 runes / Threlte; no second selection, history, graph, motion,
  geometry, or transform system.
