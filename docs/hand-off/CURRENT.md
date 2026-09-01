# Current handoff — live working-tree delta

Template per [`../README.md`](../README.md). Sliding window: immediate previous
slice plus one next action only.

## Working tree

- Current planning delta: **P19 first project persistence — implementation in
  progress behind the provider/live deployment gate.** P18's owner-run
  Render/Neon provisioning and passing live/ready smoke remain prerequisites
  for production Save/Load.
- Current delta: **P19.1/P19.2 implemented, uncommitted.** Added the checked-in
  JSONB/version migration, direct owner-scoped API queries, injected bearer
  verifier seam, bounded body/CORS handling, and greenfield editor cloud
  Save/Load with snapshot baselines, atomic room-registry replacement, and
  owned-project UI. No provider SDK, production secret, migration application,
  or live API call was added.
- Immediate previous slice: **P18 backend provisioning — shipped 2026-08-30.**
  The local Fastify/Postgres boundary and API-only Render Blueprint are in the
  tree; resource provisioning remains owner-run.

## Next action

- Confirm the owner-approved managed provider, API/editor origins, and passing
  P18 live/ready smoke; then wire the official verifier, apply the migration,
  configure secrets, and run authenticated deployed Save → refresh → Load.

## Verification

- Full Vitest: 171 files passed, 1 skipped; 2,291 tests passed, 1 skipped.
- `npm run check`: 0 errors / 0 warnings.
- `npm run check:camera-core`, `npm run check:layout-core`, and
  `npm run check:project-model`: passed.
- API: `check:api`, `test:api` (11 passed), and `build:api` passed. Migration
  idempotency is covered with an injected database client; real Neon smoke and
  migration application remain unrun.
- `npm run build`: both app builds passed; known unused-import and chunk-size
  warnings only.
- `verify:visitor-bundle`: passed; standalone `/museum` reached 4 server and
  9 client entries with no editor entry.
- Browser QA passed standalone `/museum` Entrance → Poland navigation and
  editor `/`, `/editor`, and `/museum/editor` mounting.

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
- Owner-approved provider configuration, Render/Neon provisioning, and real
  authenticated persistence smoke remain the P19 release gate.

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
