# P18 — backend provisioning

**Status:** in-progress. **Date:** 2026-08-30.
**Depends on:** P17. **Source:** backend/persistence migration review, Slice 4 /
Backend-provisioning pass.

## Outcome

Ship a deployable `@museum/api` Fastify service on Render and a Neon
Postgres database wired to it through `DATABASE_URL`. The service exposes
separate liveness and database-backed readiness checks, starts from the npm
workspace, and leaves the next persistence slice a stable process/deployment
boundary on which to add project Save/Load.

Out of scope: project tables or migrations, Save/Load endpoints, auth and
ownership, managed-auth integration, editor integration, CORS, R2 resources,
asset metadata, publishing, background workers, and changes to the editor,
visitor, or relic.

## Ratified platform boundary

```text
API compute              Render
Postgres                 Neon
Object storage           Cloudflare R2
Identity authentication  Managed auth provider
Product authorization    Fastify + Postgres
```

P18 provisions only the Render API and Neon database. It creates no R2 bucket
and integrates no auth provider. A future managed-auth slice proves identity;
Fastify and Postgres continue to own project permissions.

## Existing APIs and ownership

- Reuse the root npm workspace and `@portfolio/tsconfig` conventions.
- Declare `@portfolio/project-model` as the API's canonical document
  dependency; do not copy its types, validation, codecs, or schema into the
  service.
- Keep `ProjectDocument` as one JSONB document in the later persistence slice;
  P18 creates no parallel wall/object/camera tables.
- Use Fastify's built-in injection for HTTP tests and Node's test/assert APIs.
- Use the Postgres driver directly. Do not add an ORM, repository layer,
  migration framework, config library, or API-contract package before the
  persistence slice has a schema or endpoint that needs one.
- Use Neon's direct connection URL with one process-owned `pg.Pool`. Keep the
  pool cap as configuration/tuning, not an architecture contract. If
  horizontal scale later threatens direct connection limits, switch
  `DATABASE_URL` to Neon's pooled endpoint without changing application code.

## Service and lifecycle contract

- Add `apps/api` / `@museum/api` as a pure TypeScript Node service. Keep
  app construction separate from process startup so tests never bind a port.
- `GET /health/live` returns success when the Fastify process is responsive;
  it does not query Postgres.
- `GET /health/ready` runs `SELECT 1`, returns success only while Postgres is
  reachable, and returns a generic `503` without exposing connection details
  when it is not.
- Startup validates `DATABASE_URL` and `PORT`, opens no listener when required
  configuration is invalid, and binds `0.0.0.0` for Render.
- Fastify owns database shutdown: register pool cleanup in `onClose`.
  `SIGTERM` and `SIGINT` invoke one guarded `app.close()` path, which stops
  requests and closes the pool exactly once. No session, selection, history,
  document mutation, or browser mount/unmount semantics enter this service.

## Deployment boundary

```text
Render
└─ @museum/api
      │ DATABASE_URL secret
      ▼
   Neon Postgres

Future: @museum/api → Cloudflare R2 + managed auth provider
```

- Add one root `render.yaml` Blueprint containing only the API web service.
- Declare `DATABASE_URL` with `sync: false`, then supply the Neon URL through
  the Render dashboard. Never commit credentials.
- Provision Neon separately from the Render Blueprint. Do not add Neon IaC in
  P18.
- Choose geographically close Render and Neon regions where practical to
  minimize query latency.
- Point Render's recurring HTTP health check at `/health/live` so platform
  probes do not query Neon and prevent scale-to-zero. Keep `/health/ready` as
  the database-backed endpoint for deployment/integration smoke, diagnostics,
  and later monitoring with an intentionally chosen cadence.
- Use the workspace install/start commands and the repository's supported
  Node version. Do not add Docker, a second lockfile, or per-app dependency
  installation.
- Before provisioning either system, confirm the Neon project/database name
  and region plus the Render service name, region, and plan with the owner.
  After approval, `render.yaml` must pin the approved service `name`, `region`,
  and `plan` explicitly; none may fall through to Render defaults.

## Implementation slices

### P18.0 — pin the boundary

- Inventory the final P17 workspace and confirm there is no API or deployment
  manifest to preserve.
- Verify final P17 document ownership before adding API imports:
  `@portfolio/layout-core` owns `LayoutDocument` and
  `@portfolio/project-model` owns `SceneDocument`. Import those canonical
  packages; do not create alternate document ownership.
- Record the exact `apps/api`, root-script, Blueprint, and test surface before
  editing; keep the frontend build and visitor-boundary commands unchanged.
- Inspect the final workspace/package/TypeScript conventions, then lock the
  smallest compatible production compiler and emitted entry. The resulting
  contract must be `apps/api` package `build` + `start`, root `build:api`, and
  Render build/start commands that build once and run compiled JavaScript.

### P18.1 — headless API process

- Add the API workspace, Fastify app factory, process entry, liveness route,
  configuration validation, and graceful shutdown.
- Add only the dependencies required to run, type-check, and test that
  process, including the existing `@portfolio/project-model` workspace
  package.
- Add root `dev:api`, `check:api`, and `test:api` commands; retain root `dev`
  and `test` as editor defaults.
- Add API package `build` and `start` plus root `build:api`. Development may
  run TypeScript directly; production `start` must execute the compiled entry.

### P18.2 — Postgres readiness

- Add one small process-owned `pg.Pool`, initially using Neon's direct
  connection URL, and the `SELECT 1` readiness route.
- Configure finite Postgres connection and query timeouts so readiness failure
  cannot hang indefinitely. Exact durations remain operational tuning.
- Register one `pg.Pool` `error` listener for idle-client/network failures.
  Log sanitized error information only; never `DATABASE_URL` or credentials.
- Cover ready, unavailable, invalid-config, and one-time shutdown behavior
  with Fastify injection and a stubbed query/close boundary; tests do not
  require a developer database.
- Run one explicit integration smoke against a real `DATABASE_URL` before
  closeout. Do not create application tables.

### P18.3 — Render provisioning and smoke

- After owner approval, provision the Neon project/database in the selected
  region and obtain its `DATABASE_URL`.
- Add and validate the API-only Render Blueprint with the owner-approved
  service `name`, `region`, and `plan` written explicitly, `DATABASE_URL`
  declared as an unmanaged secret, `/health/live` as `healthCheckPath`, and
  exact `buildCommand` / `startCommand` values that use `build:api` and the API
  package's compiled `start` entry.
- Provision the Render web service in a nearby region, supply `DATABASE_URL`
  through the dashboard, and verify a clean deploy plus successful
  `/health/live` and `/health/ready` responses.
- Re-run editor/museum checks, builds, visitor boundary verification, and API
  checks so the new workspace cannot weaken P17 isolation.

## Acceptance

1. `npm run check:api`, `npm run test:api`, and `npm run build:api` pass; tests
   bind no network port and need no local Postgres process. The API package
   exposes `build` and `start`, and production `start` runs compiled JavaScript.
2. Missing/invalid required configuration fails before listen with a concise
   error; no secret or connection string appears in HTTP responses or logs.
3. `/health/live` stays independent of Postgres. `/health/ready` returns `2xx`
   after `SELECT 1` and a bounded `503` when connection, query, or timeout
   fails.
4. The pool closes through Fastify `onClose`; a termination signal invokes one
   guarded `app.close()` path and closes Fastify and the pool exactly once.
5. The API declares and type-checks against `@portfolio/project-model`; it
   contains no copied project schema and no Svelte, Threlte, DOM, editor, or
   museum dependency.
6. The Blueprint defines only one Node web service; explicitly pins the
   owner-approved service `name`, `region`, and `plan`; declares `DATABASE_URL`
   with `sync: false`; contains no database resource or secret value; defines
   production `buildCommand` and `startCommand`; and uses `/health/live` as
   `healthCheckPath`. `/health/ready` remains the database-backed endpoint used
   by deployment/integration smoke.
7. With owner-approved Render and Neon resources, a clean deploy and both
   health endpoints pass; the two services are geographically close where
   available.
8. `npm run check`, `npm run build`, the full editor suite, and
   `verify:visitor-bundle` still pass; `/museum` remains editor/API-free and
   `/museum/editor` remains the gated editor relic.

## Relic, Plan, and visitor boundaries

P18 adds no frontend route, UI, editor state, scene/layout mutation, camera
behavior, or visitor dependency. `/museum` remains the checked-in read-only
Chopin visitor, `/museum/editor` remains inside `apps/editor`, and the API has
no route capable of loading or changing either relic. P18.0 verifies the final
P17 package ownership and imports those canonical packages; P18 creates no
alternate document ownership. Generated endpoints are never persisted.

## Fallback

If Render or Neon provisioning is blocked, close P18.0–P18.2 only after the API
passes locally against an owner-supplied Neon `DATABASE_URL`, and leave P18.3
open with the validated API-only Blueprint. Do not substitute another database
provider, local files, browser storage, an ORM, or a second document model. If
the first persistence endpoint later proves direct SQL insufficient, choose
migrations/query tooling in that slice against its concrete schema rather than
speculating here.
