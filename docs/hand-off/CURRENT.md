# Current handoff — live working-tree delta

Template per [`../README.md`](../README.md). Sliding window: immediate previous
slice plus one next action only.

## Working tree

- Current delta: **P15 camera-core extraction — shipped 2026-08-30,
  uncommitted.** `@portfolio/camera-core` now owns the canonical route/motion
  engines and their minimum structural camera/graph types. The Chopin graph is
  explicit at every route call site; the visitor navigation components remain
  app-owned. Source and built `/museum` visitor-boundary pins are enforced.
- Previous delta: **P14 Camera Plan passive object footprints — shipped
  2026-08-29, uncommitted (review fixes 1+2 applied).** Camera Plan now derives
  the live Scene footprint projection, renders eligible passive footprints
  below the camera graph, and gives Camera-only layout objects (including
  imported plan-drawn `profile` objects) the same muted dashed treatment.
  Footprints resolve the same session-aware placement scale as Scene Plan/3D.
  No collision, validation, interaction, or geometry changes were added.

## Next action

- P13 remains proposed/unscheduled, and P3B.7b remains a deferred,
  non-blocking acceptance tail. The next migration slice is not registered yet.

## Verification

- Full Vitest: 169 files passed, 1 skipped; 2,284 tests passed, 1 skipped.
- `npm run check`: 0 errors / 0 warnings.
- `npm run check:camera-core`: passed.
- `npm run build`: passed; known unused-import and chunk-size warnings only.
- `verify:visitor-bundle`: passed; `/museum` closure reached no editor entry.
- Browser QA passed `/museum` Entrance → Poland navigation, `/`, `/editor`,
  and `/museum/editor` mounting.

## Known bugs / deferred

- P3.4/P3.5 remain undone/not accepted and low-priority deferred.
- Direct 3D wall/interior-anchor picks remain deferred.
- Layout hover feed and anchor-helper octahedra remain disconnected.
- Drafted-room `focusRoom` retains a latent Paris-default path outside the
  fixed editor flow.
- Runtime logs retain known Svelte `ownership_invalid_mutation` warnings for
  `cameraPlan` and `layoutInteraction`; static checking is clean.
- A browser axe audit still reports generic editor color-contrast review items
  in empty/status text and SVG labels; these are outside the closed P3B gate.

## Traps

- Both Plan workspaces stay mounted. Hidden cells retain `inert` and
  `plan-cell--hidden`; shared `view` remains one Plan|3D axis.
- Camera 3D rig unmount during a main-editor Camera Plan switch must preserve
  the paused preview session. Leaving the Camera workspace stops it through
  `setWorkspace`; the relic retains stop-on-unmount/stop-on-Escape behavior.
- P12 ordinary selection never enters Camera/Edge scope. Only explicit preview
  actions do; sequenced-node selection in Sequence seeks + pauses.
- Camera timeline edge keys include direction; preview-route memo keys on
  `preview.runId`, never cloned route identity.
- Camera means guided PerspectiveCamera navigation, never webcam.

## Non-negotiables

- `/museum` is visitor-only and its chunks contain no editor/layout code.
  Editor ships at `/`, `/editor`, and frozen relic `/museum/editor`.
- No commits unless the user asks.
- One nav + one motion: `@portfolio/camera-core` owns `camera-route.ts` +
  `camera-motion.ts` only.
- Svelte 5 runes / Threlte; no second selection, history, graph, motion,
  geometry, or transform system.
