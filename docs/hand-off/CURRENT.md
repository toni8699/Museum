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
  scale chrome, token cleanup, metadata clearance, the shared lower-left
  `Z ↑` / `X →` ruler key, explicit preview-target labels, and canonical
  edge-direction derivation. It targets the current
  Scene|Camera × Plan|3D shell; P3B creates no additional workspace or state
  system. Deferred P3.4/P3.5 acceptance remains a non-blocking tail.
- Previous slice: **P3.6 structural visual reconciliation**, now closed under
  P3. The archived umbrella plan is the back-pointer.

## Next action

- P3B.1 discovery is complete and recorded: no canonical orientation snap
  authority exists in the searched camera, viewport, view-state, and gizmo
  sources. The owner has approved the literal six-face snap contract,
  preservation rules, fallback order, post-snap `+Y` orbit pole, and narrow
  helper boundary in the P3B plan — **amended 2026-08-24: the snap animates
  through `camera-motion.ts` and lands on the exact approved commit.** Group A
  (P3B.4a → P3B.4b) Plan parity is
  implemented; the bottom-right colored `Z ↑` / `X →` corner key is included.
  Group B is unblocked. P3B.1 is implemented in-tree: the six-face
  `snapEditorViewToCardinal` helper (fallback resolver cited against
  `createEditorBoundsCameraFrame` and `EDITOR_NEUTRAL_CAMERA_POSITION` /
  `EDITOR_NEUTRAL_CAMERA_TARGET`), the shared `EDITOR_DRAG_THRESHOLD_PX`,
  and the inert orientation token family, with focused tests green. P3B.2 is
  implemented in-tree: the Scene-3D-only orientation box (custom isometric
  SVG cube with six face + six axis-arrowhead hit targets wired to
  `snapEditorViewToCardinal`, projector/overlay writer split, derived
  camera-pose highlight, Enter/Space activation, preview gate) mounted only
  in the Scene 3D context, plus the layout-box white/light treatment
  (light-neutral `--editor-layout-box` tokens, palette mirror, layout-object
  albedo). Browser QA against `scene-3d-assets.png` / `x-y-z-box.png` found
  open P3B.2 render gaps: the cube is static (contract requires
  camera-projected rotation), face names (TOP/FRONT/RIGHT…) are missing, axis
  arrows run through the body instead of outward from corners, and the cube
  under-fills the tile. Snap itself works; it is instant pending the amended
  animated motion. Designer brief for the projected render + motion:
  `../Design-specs/Orientation-box-render-brief.md`. The designer's spec
  (`../Design-specs/Designer-brieft-box.md`, rev 6) is reconciled with the
  codebase and owner dispositions: mount contract + preserved-state split
  restated locally, back-face invisible hit targets specified (all six faces
  snappable), face-hover retuned to a dark-navy overlay for light faces, and
  §5.2 marked a P3B.4 gate — polar `camera.up` cannot rest at the snapped pose
  (Threlte runs `controls.update()` every frame while damping is on); the
  restore-`+Y` handoff is now **fixture-proven**
  (`tests/lib/editor/camera/polar-orbit-handoff.test.ts`: no roll pop at ±Y,
  global `+Y` orbit pole, Plan-North roll preserved) — **P3B.4 is unblocked.**
  Widget tokens
  (radius, light-face trio, face overlays, edge stroke, face-label size)
  registered in `tokens.css` and `Design-specs.md` §8; `edge-ghost` retired
  with the ghost faces. Next execute the P3B.2
  render rework per that brief, then P3B.3 (interaction states, cancellation,
  preview-disabled behavior), then P3B.4, followed by Group C
  (P3B.5–P3B.6) preview affordances, then P3B.7a core QA, P3B.8 browser QA,
  and finally P3B.7b deferred P3.4/P3.5 acceptance.

## Verification

- Last known verification: `npm test` 2,097 passed / 1 skipped across 154
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
