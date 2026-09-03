# Current handoff — live working-tree delta

Template per [`../README.md`](../README.md). Sliding window: immediate previous
slice plus one next action only.

## Working tree

- Current planning delta: **P20 S0 asset contract + cloud-Save durability gate
  complete on 2026-09-03; P20.1/S1 API implementation is complete locally on
  2026-09-03, behind the P19 Google OIDC/live deployment gate and owner-run R2
  provisioning.** P19's owner-run
  Render/Neon provisioning and passing live/ready smoke remain prerequisites
  for production Save/Load. The 2026-09-01 auth amendment ratifies Google
  OIDC (Authorization Code + PKCE) + an app-owned `@fastify/secure-session`
  cookie; no managed-provider bearer contract remains.
- Current delta: **P20.1/S1's registry migration, authenticated metadata/content
  API, injected object-store seam, and production R2 adapter are implemented
  locally; changes remain uncommitted.** The API keeps object keys out of
  metadata, streams bounded image uploads, hashes bytes, and never serves
  pending/failed assets. P19 persistence, Google OIDC/session behavior, P19.4's
  guest-first entry/Project Shell, and P20 S0's separate cloud-Save durability
  predicate plus stale-draft re-check remain implemented locally. Save retries
  retain their first project ID, trimmed names
  settle the baseline, stale project lists are discarded, cloud chrome is
  disabled when unconfigured, and guest Save resumes through a validated
  browser-session handoff. The API owns the Google Authorization Code + PKCE
  exchange and secure session; the editor uses `/auth/me`, bounded intent
  redirects, logout, and credentialed JSON requests. No production secret,
  migration application, or live API call was added.
- Immediate previous slice: **P20.1/S1 — local implementation complete
  2026-09-03.** Migration, owner-scoped routes, streaming validation, failure
  states, and R2 composition are covered locally; P20 S0 was the preceding
  contract/gate slice. P18 backend provisioning remains the infrastructure
  baseline.
  The local Fastify/Postgres boundary and API-only Render Blueprint are in the
  tree; resource provisioning remains owner-run.

## Next action

- Finish P19's owner-approved Google OAuth web application, same-site
  production editor/API origins, Render secrets, and Neon migration; configure
  P20's private R2 bucket/secrets; then run the authenticated register → upload
  → list/read → byte-fetch smoke before opening S2 registry integration.

## Verification

- Full Vitest: 171 files passed, 1 skipped; 2,305 tests passed, 1 skipped.
- `npm run check`: 0 errors / 0 warnings.
- `npm run check:camera-core`, `npm run check:layout-core`, and
  `npm run check:project-model`: passed.
- API: `check:api`, `test:api` (23 passed), and `build:api` passed. Migration
  idempotency and the local asset registry/R2 seam are covered with injected
  clients; real Neon migration, R2 calls, and live authenticated smoke remain
  unrun.
- P20 cloud-save predicate tests: targeted 34 tests plus the submit-boundary
  contract and the full editor suite (2,305 passed, 1 skipped) passed;
  local/package URIs remain blocked for cloud
  Save even when session bytes exist, while the existing plain-export
  predicate remains unchanged for current packages.
- `npm run build`: passed for Editor and Museum with the current
  `adapter-vercel` configuration. Known unused-import and chunk-size warnings
  remain.
- `verify:visitor-bundle`: passed; standalone `/museum` reached 3 server and
  9 client entries with no editor entry.
- Local browser QA passed editor entry → new Spatial project, Project Hub →
  new project, `/editor` compatibility redirect, explicit `load=1` cleanup,
  and the authenticated-projects root trampoline. Existing standalone
  `/museum` Entrance → Poland navigation and `/museum/editor` mounting remain
  covered by the prior smoke.

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
- P20.1's owner-run private R2 bucket, credentials, Render secrets, and live
  asset smoke remain the P20 S1 release gate.

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
