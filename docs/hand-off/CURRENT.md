# Current handoff — live working-tree delta

Template per [`../README.md`](../README.md). Sliding window: immediate previous
slice plus one next action only.

## Working tree

- Current planning delta: **P18 backend provisioning — in progress.** The plan
  scopes Slice 4 to a Render-hosted
  `apps/api`, separately provisioned Neon Postgres through secret
  `DATABASE_URL`, and live/ready health checks; persistence remains a later
  slice. R2 and managed auth are ratified future boundaries, not P18 work.
- Current delta: **P18 local API boundary implemented, uncommitted.** Added the
  Fastify workspace, bounded Postgres pool/readiness check, guarded shutdown,
  Node-native tests, canonical document type pin, and API-only Render
  Blueprint. No Neon or Render resource has been provisioned or synced.
- Current delta: **P17 editor / visitor app split — shipped 2026-08-30,
  uncommitted.**
  `apps/editor` owns the authoring routes and gated relic;
  `apps/museum` owns only the read-only `/museum` visitor.
- Visitor-app cleanup (uncommitted): removed dead monolith leftovers from
  `apps/museum/src` — legacy `content/rooms*`/`chopin-layout`, unused
  facade/render files, editor placement/material-preview components, the
  dead `virtual:museum-editor-entry` ambient declaration, and dangling
  `sourceFile` manifest metadata.

## Next action

- Confirm owner-approved Render service name/region/plan and supply a Neon
  `DATABASE_URL`; then sync/provision and run the live/ready smoke. P13 remains
  proposed/unscheduled; P3B.7b remains deferred and non-blocking.

## Verification

- Full Vitest: 170 files passed, 1 skipped; 2,288 tests passed, 1 skipped.
- `npm run check`: 0 errors / 0 warnings.
- `npm run check:camera-core`, `npm run check:layout-core`, and
  `npm run check:project-model`: passed.
- API: `check:api`, `test:api` (6 passed), and `build:api` passed. Real Neon
  smoke remains unrun because `DATABASE_URL` is absent.
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
- P18 Render/Neon provisioning and real-database smoke await owner-approved
  resource values and credentials.

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
