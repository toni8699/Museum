# Current handoff — live working-tree delta

Template per [`../README.md`](../README.md). Sliding window: immediate previous
slice plus one next action only.

## Working tree

- Current planning delta: **P20 S0 asset contract + cloud-Save durability gate,
  P20.1/S1 API, P20.2/S2 Spatial integration, and P20.3/S3 durable
  texture-conversion are implemented locally on 2026-09-03; the P20.4/S4
  Load-resolution brief is ready and implementation remains, all behind the
  owner-run R2 provisioning.** P19 shipped 2026-09-03 — its
  owner-run Google OIDC/live deployment smoke passed and production Save/Load
  is live. The 2026-09-01 auth amendment ratifies Google
  OIDC (Authorization Code + PKCE) + an app-owned `@fastify/secure-session`
  cookie; no managed-provider bearer contract remains.
- Current implementation baseline: **P20.1/S1 registry API + R2 seam,
  P20.2/S2 Spatial ingest/list/accept, and P20.3/S3 durable conversion are
  implemented locally.** The API keeps
  object keys out of metadata, streams bounded image uploads, hashes bytes,
  and never serves pending/failed assets. The editor keeps registry lifecycle
  in `EditorApp`, uses logical `/project-assets/{assetId}` references, primes
  verified session bytes, and reuses existing texture/history/assignment paths.
  P19 persistence, Google OIDC/session behavior, P19.4 guest-first shell, and
  P20 S0's separate cloud-Save durability gate remain in the baseline. No
  production secret, migration application, or live API call was added.
- Immediate previous slice: **P20.3/S3 — local implementation complete
  2026-09-03.** Explicit local/package texture conversion reuses the existing
  binary cache, project registry, guarded Scene transaction, cloud-Save gate,
  and package exporter; P20.4 owns automatic refresh/Load resolution. P20.2
  was the preceding Spatial integration slice. P18 backend provisioning
  remains the infrastructure baseline.
  The local Fastify/Postgres boundary and API-only Render Blueprint are in the
  tree; resource provisioning remains owner-run.

## Next action

- P19 is shipped (2026-09-03 — Google OIDC/live deployment smoke passed).
  Next: configure P20's private R2 bucket/secrets, then run the authenticated
  register → upload → list/read → byte-fetch smoke (the P20.1 owner gate);
  after that, implement the ready P20.4 automatic refresh/Load-time asset
  resolution brief.

## Verification

- Full Vitest: 173 files passed, 1 skipped; 2,320 tests passed, 1 skipped.
- `npm run check`: 0 errors / 0 warnings.
- `npm run check:camera-core`, `npm run check:layout-core`, and
  `npm run check:project-model`: passed.
- API: `check:api`, `test:api` (23 passed), and `build:api` passed. Migration
  idempotency and the local asset registry/R2 seam are covered with injected
  clients; the P19 live/ready authenticated smoke passed 2026-09-03 (owner-run,
  including the real Neon migration); real R2 calls and the P20.1 live asset
  smoke remain unrun.
- P20.3 targeted conversion/package/mutator behavior and P20 cloud-save
  predicate tests passed; full editor suite (2,320 passed, 1 skipped) passed;
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
- P19 shipped 2026-09-03: owner-approved Google OAuth configuration,
  Render/Neon provisioning, and the real authenticated persistence smoke are
  complete.
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
