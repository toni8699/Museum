# Current handoff — live working-tree delta

Template per [`../README.md`](../README.md). Sliding window: immediate previous
slice plus one next action only.

## Working tree

- P21.1 shared shell + P21.2 Scene reconciliation + P21.3 Camera reconciliation + P21.4 Preview + project flows + P21.5 Slices 1–3 (surface-step/buttons, canvas de-clutter + §2.6 gizmo detach + 2B node colors, Inspector density + selection isolation) implemented; registered in the tracker.

- Planning delta: **Roadmap revised 2026-09-05 (owner), reconciled 2026-09-06:**
  P21.5 stays strictly presentation-only (no authoring-depth expansion —
  lighting, staging, layout objects, CAD features belong to Build/Stage
  tiers, not polish) and P21 closes clean before P22. Long-term tiers —
  **P22** Basic Publish + visitor runtime (first complete
  author → preview → publish → visitor loop; stress-tests visitor/editor
  isolation early), **P23** Layout Depth family (minimum useful Build set
  first; optional depth tail later), **P24** Scene/Staging Depth family
  (minimum useful Stage set first; optional depth tail later), **P25**
  narrow Experience foundation after the P23/P24 minima (before the tails),
  then a bounded agent/reuse proof before broad expansion. P23/P24 stay
  separate ownership domains. The former "P23 Typed DB layer"
  is demoted to **conditional infrastructure** — adopt only on demonstrated
  SQL-surface pain, as a slice inside/before a later tier, never a numbered
  milestone; P19/P20 no-ORM pins unchanged. Tracker Long-term roadmap +
  `Design-Plan(P21+).md` Experience-Workspace cell updated.
- Planning delta: **P20 shipped 2026-09-04 — S0–S4 verified by local live
  smoke against real R2 (`biskiq-assets-test`) + local Postgres.** P20.1 API
  15/15 (register → upload → list/read → byte-fetch, user-2 `404`s, bad-magic
  `415`, oversized `413`); P20.2 browser Cloud-file → ready → Use flow; P20.3
  browser local-import → Save-block → `Save to project` → Save v11 → undo/redo
  loop; P20.4 browser Save v9 → refresh (blank boot) → Load (hydrated `blob:`
  render, clean, no history) → re-Save v10 with no re-upload → package export
  (byte-identical embed, no R2/API-URL leakage). Drag-onto-entity and
  project-switch-during-upload were not browser-exercised (unit-covered only).
  Production Render/Neon-topology smoke is deferred, not a close item.
- Code delta (uncommitted): **`apps/api/src/asset-persistence.ts` —
  `returningColumns()` takes a table prefix; the two `UPDATE … FROM projects`
  sites pass `'a.'`, the INSERT stays unqualified.** The smoke exposed Postgres
  `42702` (ambiguous `RETURNING` — no upload could reach `ready`); the stubbed
  API suite never caught it. `check:api` + `test:api` (23 passed) green after.
- Auth diagnostics delta (uncommitted): `apps/api/src/app.ts` now logs bounded
  OIDC login/callback stages and session presence without OAuth values, tokens,
  cookie contents, or user IDs; the API suite checks exchange errors stay
  redacted. This exposes the documented cross-site Vercel → Render cookie trap.
- Deployment proxy delta: the Vercel build injects an external `/api/*` edge
  route into the adapter-generated Build Output config (a top-level rewrite
  was discarded); the API accepts that public base path when constructing the
  Google callback. Production `API_ORIGIN` and `PUBLIC_API_ORIGIN` must both
  use the editor's `/api` URL so `SameSite=Lax` stays first-party.
- Smoke residue (local only, not shipped state): `project:smoke-p20s1` v11 +
  ~20 asset rows in local Postgres + test objects in the `biskiq-assets-test`
  R2 bucket. No production secret, migration, or live deployment was touched.
- Immediate previous slice: **P20 smoke + `RETURNING` fix, 2026-09-04.**
  P19 (Google OIDC/live deployment smoke, 2026-09-03) is the prior baseline.
  The local Fastify/Postgres boundary and API-only Render Blueprint are in the
  tree; resource provisioning remains owner-run.

## Next action

- Implement P21.5 Slice 4 (all-theme verification sweep + typography grammar) then Slice 5 (timeline density) per [the P21.5 brief](../plans/2026-09-05-P21.5-ui-polish-pass.md) (presentation-only, no behavior change) — §2.6 gizmo detach + [Slice 2B camera node colors](../plans/2026-09-06-P21.5-slice-2B-camera-node-colors.md) are code-complete with owner eye-test QA pending — then run the P21 final acceptance gate (six-reference visual comparison + axe/contrast sweep) and close the tracker.

## Verification

- Full Vitest: 186 files passed, 1 skipped; 2,431 tests passed, 1 skipped.
- `npm run check`: 0 errors / 0 warnings.
- `npm run check:camera-core`, `npm run check:layout-core`, and
  `npm run check:project-model`: passed.
- API: `check:api`, `test:api` (23 passed), and `build:api` passed. Migration
  idempotency holds; the asset registry/R2 seam was additionally proven by the
  2026-09-04 local live smoke (15/15 API checks + browser S2/S3/S4 flows +
  package fidelity) against local Postgres + real R2. P19's live/ready
  authenticated smoke passed 2026-09-03 (owner-run, including the real Neon
  migration).
- P21.4: preview coordinator/blocker/bundle, visitor runtime/Sequence, closure
  validator fixtures, and project-flow contracts green within the full suite;
  `vite build` enforces the new preview-surface boundary plugin.
- `npm run build`: passed for Editor and Museum with the current
  `adapter-vercel` configuration. Known unused-import and chunk-size warnings
  remain.
- `verify:visitor-bundle`: passed; standalone `/museum` reached 3 server and
  9 client entries with no editor entry.
- `verify-preview-surface`: passed; 7 visitor files, root + plugin wired, no static leaks.
- Local browser QA passed editor entry → new Spatial project, Project Hub →
  new project, `/editor` compatibility redirect, explicit `load=1` cleanup,
  and the authenticated-projects root trampoline. Existing standalone
  `/museum` Entrance → Poland navigation and `/museum/editor` mounting remain
  covered by the prior smoke. The 2026-09-04 P20 browser smoke (Cloud-file
  import, local→durable conversion + undo/redo, Save → refresh → Load →
  render → re-Save, package export) passed on the same local stack.

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
- Deployed Render/Neon-topology smoke is deferred to the publish tier or an
  owner-scheduled pass (local P19/P20 smokes passed 2026-09-03/04).

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
