# Current handoff — live working-tree delta

Template per [`../README.md`](../README.md). Sliding window: immediate previous
slice plus one next action only.

## Working tree

- Current planning delta: **P19 first project persistence — implementation in
  progress behind the Google OIDC/live deployment gate.** P18's owner-run
  Render/Neon provisioning and passing live/ready smoke remain prerequisites
  for production Save/Load. The 2026-09-01 auth amendment ratifies Google
  OIDC (Authorization Code + PKCE) + an app-owned `@fastify/secure-session`
  cookie; no managed-provider bearer contract remains.
- Current delta: **P19 persistence plus the Google OIDC/session amendment is
  implemented locally; review fixes remain uncommitted.** Save retries retain
  their first project ID, trimmed names settle the baseline, stale project
  lists are discarded, cloud chrome is disabled when unconfigured, and the
  API/editor acceptance coverage is expanded. The API now owns the Google
  Authorization Code + PKCE exchange and secure session; the editor uses
  `/auth/me`, redirect sign-in, logout, and credentialed JSON requests. No
  production secret, migration application, or live API call was added.
- Immediate previous slice: **P18 backend provisioning — shipped 2026-08-30.**
  The local Fastify/Postgres boundary and API-only Render Blueprint are in the
  tree; resource provisioning remains owner-run.

## Next action

- Configure the owner-approved Google OAuth web application, same-site
  production editor/API origins, Render secrets, and Neon migration; then run
  authenticated deployed Sign in → Save → refresh → Load → logout smoke.

## Verification

- Full Vitest: 171 files passed, 1 skipped; 2,296 tests passed, 1 skipped.
- `npm run check`: 0 errors / 0 warnings.
- `npm run check:camera-core`, `npm run check:layout-core`, and
  `npm run check:project-model`: passed.
- API: `check:api`, `test:api` (14 passed), and `build:api` passed. Migration
  idempotency is covered with an injected database client; real Neon smoke and
  migration application remain unrun.
- `npm run build`: passed for Editor and Museum with the current
  `adapter-vercel` configuration. Known unused-import and chunk-size warnings
  remain.
- `verify:visitor-bundle`: passed; standalone `/museum` reached 3 server and
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
- Owner-approved Google OAuth configuration, Render/Neon provisioning, and
  real authenticated persistence smoke remain the P19 release gate.

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
