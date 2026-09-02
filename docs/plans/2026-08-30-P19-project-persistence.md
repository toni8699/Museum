# P19 — first project persistence

**Status:** in-progress. **Date:** 2026-08-30. **Depends on:** P18.
**Source:** backend/persistence migration review §0.1.6–§0.1.7 and P18,
first-persistence pass.
**Amended:** 2026-08-31 — five review amendments applied.
**Amended:** 2026-09-01 — auth-boundary amendment: Google OIDC (Authorization
Code + PKCE) plus an app-owned `@fastify/secure-session` cookie replace the
managed-provider bearer-token integration. Persistence scope and the project
model are unchanged.
**Amended:** 2026-09-01 (owner review) — production session contract pins a
same-site editor/API topology with `SameSite=Lax` cookies (no third-party
cookies), the roles of OAuth `state` / PKCE / OIDC `nonce` are corrected, and
lazy `users` row materialization is pinned.

## Outcome

Turn the P18 Fastify/Neon boundary into the first durable editor workflow:
an authenticated user can Save the current `ProjectDocument`, refresh the
editor, see their owned projects, and explicitly Load the latest version of a
selected project. Each accepted Save appends an immutable `project_versions`
record; Load restores the same canonical layout + scene document and reports
its version.

The editor continues to boot into a fresh empty project. It does not
auto-load the most recent project on refresh. Save and Load are explicit
actions in the existing project surface, and a successful Save only resets
the dirty baselines; it does not create a history entry or change selection.

Out of scope: teams, memberships, collaboration, billing, realtime state,
publishing, visitor project reads, R2 or any binary asset upload, asset
metadata, GLB import, a version picker/rollback UI, a generic `runtime` or
`api-contract` package, custom password/session UI, and changes to camera
navigation, Plan geometry, the `/museum` visitor, or the `/museum/editor`
relic behavior.

P19 starts only after P18.3 has a confirmed Render/Neon deployment and a
passing live/ready smoke. The owner-approved Google OAuth web application
(client ID/secret), the approved callback URL terminating on the API, the
deployed editor and API production origins, and the `SESSION_KEY` must be
pinned before Google OIDC code or production secrets are added. Google
OpenID Connect is the only identity provider for v1; this plan does not
invent a provider.

## Existing APIs and ownership

- Reuse P18's `createApp`, `DatabasePool`, `readConfig`, `startServer`,
  Fastify injection tests, `pg`, and `@portfolio/project-model` dependency.
- Use `validateProject` from `@portfolio/project-model` as the API's object
  boundary. Keep `parseProjectJson` and `serializeProject` for text-file and
  portable-package boundaries; the API must not copy `ProjectDocument`,
  scene/layout validation, codecs, or schema.
- Compose the saved document at the `apps/editor` composition root from the
  live `store.document`, `layoutPreview.project.layout`, and the current
  project `id`/`name`. Do not serialize `layoutPreview.project.scene` as a
  substitute for the live scene store.
- Reuse `EditorStore`'s `document`, `canonicalJson`, `isDirty`,
  `projectExportBlocker`, `importDocument`, `clearSharedHistory`, existing
  replacement guards, and the current selection/session teardown paths.
- Reuse `layoutPreviewCanonicalJson`, `layoutPreviewIsDirty`,
  `derivePreviewBundle`, `createLayoutRoomRegistry`, and the existing layout
  preview baseline/compiled-geometry lifecycle. The persistence coordinator
  belongs at the editor composition root; it is not a second document store,
  selection store, or history controller.
- Keep `apps/api` free of Svelte, Threlte, DOM, editor, museum, and relic
  imports. `apps/museum` receives no API dependency or auth client.

## Durable document and database contract

The only persisted product document is exactly:

```ts
type ProjectDocument = {
  id: string;
  name: string;
  layout: LayoutDocument;
  scene: SceneDocument;
};
```

- `project_versions.document` stores the canonical `ProjectDocument` as one
  JSONB value. The database never receives normalized walls, objects, camera
  nodes, connections, path anchors, or generated endpoints.
- The API validates the incoming unknown value with the shared project model,
  requires `document.id === :projectId`, and sends/stores the canonical
  `result.project` object returned by `validateProject`. No API-added
  `version` field enters the document; version is database metadata only.
- JSONB contains semantic references only. P19 accepts shipped catalogue and
  safe static texture references; reuse `store.projectExportBlocker` to refuse
  unresolved `/local/...` and package-rewrite texture URIs with a clear Save
  error. No binary bytes are silently treated as durable.
- Load validates and canonicalizes the JSONB result again with
  `validateProject(response.document)` before returning `result.project`. The
  fidelity assertion uses that result's `canonicalJson`, not PostgreSQL key
  order or raw JSONB byte identity.

### Minimal schema

Add one checked-in SQL migration under `apps/api/migrations/`:

```sql
users
  id text primary key                         -- provider-qualified verified OIDC subject, e.g. google:<sub>
  created_at timestamptz not null

projects
  id text primary key
  owner_id text not null references users(id)
  name text not null
  latest_version integer not null default 0
  created_at timestamptz not null
  updated_at timestamptz not null

project_versions
  id bigint generated always as identity primary key
  project_id text not null references projects(id)
  version integer not null
  document jsonb not null
  created_at timestamptz not null
  unique (project_id, version)
```

Use `now()` defaults, a descending owner/updated index for the project list,
and a JSON-object check on `project_versions.document`. `users.id` holds the
provider-qualified verified OIDC subject `google:<sub>`, derived only from
Google's stable verified `sub` claim; it is the only durable identity P19
stores. Do not add password fields, session tables, OAuth token tables,
provider-profile tables, roles, teams, memberships, or permissions in P19 —
the secure session is not part of `ProjectDocument` and is not project
persistence. Keep the migration
runner tiny and direct: a versioned SQL file plus a `schema_migrations` table,
one transaction per migration, and a root `migrate:api` command. Do not add an
ORM or migration framework. The API process must not mutate schema at
startup; run the migration explicitly as the approved deployment
pre-deploy/release step or once against the owner-approved Neon database
before the API route smoke.

Save runs in one transaction: ensure the authenticated `users` row, create or
lock the owned `projects` row, increment `latest_version`, insert the JSONB
version, update project metadata/timestamps, and commit. A project belonging
to another user is indistinguishable from an unknown project (`404`). The
first slice deliberately uses the project-row lock and last-successful-save
wins for multiple tabs; `ponytail: add expectedVersion optimistic locking if
multi-tab concurrency becomes a real product requirement.`

Pin the project request body limit explicitly at **2 MiB**, based on the
largest checked-in canonical project fixture currently measuring 45,586 bytes
and headroom for semantic growth without allowing unbounded JSON. A body just
over the limit returns `413 Payload Too Large`; malformed JSON remains a
separate `400` response. Do not inherit Fastify's default accidentally.

## HTTP and identity contract

Authentication is **Google OpenID Connect → Authorization Code + PKCE →
Fastify callback → app-owned secure session cookie → Fastify/Postgres
authorization**. Google proves identity; Museum Editor owns its own session
and product authorization. This is lightweight external authentication, not
home-grown authentication: Google owns credentials and account security;
Museum Editor owns only the OIDC handshake, its secure application session,
and product authorization. The product identity derives only from Google's
verified stable OIDC `sub` claim.

Health routes remain public and unchanged. The auth surface is:

| Method | Route | Behavior |
|---|---|---|
| `GET` | `/auth/login` | Fresh PKCE verifier/challenge + OAuth `state` (+ OIDC `nonce` where required) bound to the initiating browser session; `302` to Google's authorization endpoint; scopes `openid email profile` only, no unrelated Google API permissions |
| `GET` | `/auth/callback` | Validate the authorization response through `openid-client` (state, nonce, PKCE verifier); exchange the code; accept identity only from the validated OIDC `sub`; clear transient login state; establish the Museum Editor session; `302` to the owner-approved editor origin |
| `GET` | `/auth/me` | Session cookie → `{ authenticated: false }` or `{ authenticated: true, user: { id: "google:<sub>" } }` |
| `POST` | `/auth/logout` | Clear/invalidate the Museum Editor session cookie; never attempts a global Google account logout |

The Google redirect URI terminates on the API (`{API_ORIGIN}/auth/callback`),
never on the editor. The flow is: `GET /auth/login` → Google → `GET
/auth/callback` → establish the secure Museum Editor session → redirect to
the editor.

Project routes require the authenticated Museum Editor secure-session cookie:

| Method | Route | Request | Success |
|---|---|---|---|
| `GET` | `/projects` | session cookie | `{ projects: [{ id, name, version, updatedAt }] }` |
| `PUT` | `/projects/:projectId` | session cookie + `{ document: unknown }` | `{ projectId, version, name, updatedAt }` |
| `GET` | `/projects/:projectId` | session cookie | `{ projectId, version, name, updatedAt, document }` for latest |

- The session cookie is `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, with
  bounded expiry, and never readable by editor JavaScript. Production
  authenticated Save/Load requires a **same-site** editor/API topology —
  preferably sibling subdomains under one registrable domain (for example
  `app.example.com` editor → `api.example.com` API): cross-origin but
  same-site, so CORS is still required yet the session never depends on
  third-party cookie behavior. The temporary `*.vercel.app` →
  `*.onrender.com` topology is cross-site and is acceptable only for
  API/OIDC development and browser compatibility testing, not as the
  production session contract; loosen `SameSite` only if the actual
  topology requires it. Do not hard-code deployment assumptions into
  project persistence logic.
- The editor generates a new first-save ID with native
  `crypto.randomUUID()` (for example, `project:<uuid>`), then keeps it in
  root session state. Subsequent Saves use the same ID. The API never trusts
  an owner ID, email, or project name supplied outside the validated document.
- Missing or invalid sessions return a generic `401`; invalid documents, ID
  mismatches, and malformed bodies return structured `400` responses;
  oversized bodies return `413`, all without stack traces. Unknown or
  non-owned projects return generic `404` responses. Database failures
  return a generic bounded `503`; the Google client secret, session key,
  authorization codes, tokens, cookies, and database URL never appear in
  responses or logs.
- Identity is the Google-verified stable OIDC `sub`, converted to the
  canonical internal identity `google:<sub>` (`users.id`). The callback
  never trusts query parameters, email, name, or any browser-provided
  identity data as authorization identity. Store only the minimum durable
  session identity the app requires — the internal user ID. Do not persist
  Google access tokens in Postgres and do not retain refresh tokens: P19
  needs authentication, not access to Google services.
- Materialize `users` lazily: the Google callback establishes only the
  authenticated session — `google:<sub>` lives in the session, not as a
  database write. The first successful Save upserts the `users` row and
  creates the project/version inside that one transaction (per the Save
  contract below); `/auth/me` never performs a database write.
- Do not implement: passwords, password reset, email verification, custom
  credential storage, a home-grown OAuth/OIDC implementation, custom JWT
  signing, refresh-token infrastructure, multiple identity providers, a
  generic auth package, Clerk/Auth0/Supabase Auth/WorkOS SDKs, or
  browser-visible auth tokens. No generic provider interface is created
  merely to support hypothetical future providers.
- Session identity is resolved by `@fastify/secure-session` at the API edge.
  Production composes the real `openid-client` Google configuration;
  `createApp` keeps the smallest app-local OIDC/session seams needed for
  tests (tests never contact Google). Do not create `@portfolio/auth-core`.
  Any injectable type stays inside `apps/api` and is shaped around the
  actual OIDC operations P19 uses; project authorization is tested
  independently of Google network calls. The API never accepts a
  client-supplied identity claim.
- Authorization is unchanged by the transport swap: secure session →
  authenticated internal user id → Fastify project route → Postgres
  ownership check → project. Google answers "Who authenticated?"; Museum
  Editor answers "What can this user access?". Database authorization is
  never delegated to Google.
- `/auth/me` returns the minimal editor-visible session state. The current
  UI shows only Sign in/out and project status; if a display name, avatar,
  or email is genuinely needed later, inspect the existing UI first. Do not
  add profile persistence merely because Google supplies the claims.
- CORS/CSRF for cross-origin editor/API deployments: allow only the
  owner-approved editor origin with credentialed CORS; never
  `Access-Control-Allow-Origin: *`; allow only the required methods
  (`GET`, `PUT`, `POST`, `OPTIONS`) and headers (`Content-Type`); require
  the expected `Origin` for unsafe authenticated browser requests (project
  `PUT` and logout `POST`). Project mutations remain JSON requests. OAuth
  authorization-request CSRF/correlation is protected by `state`; PKCE
  binds the authorization code to the initiating client, and the OIDC
  `nonce` binds and replay-protects the ID-token authentication response
  where applicable — never rely on CORS alone. If host routing later makes
  editor/API same-origin, simplify the configuration while preserving the
  same authorization rules.

## Editor Save/Load behavior

### Session bootstrap

On mount the editor calls `GET {API_ORIGIN}/auth/me` with
`credentials: 'include'`: authenticated → list owned projects; not
authenticated → show the Sign in action. Sign in navigates the browser to
`GET {API_ORIGIN}/auth/login`; after the Google callback the API establishes
the secure session cookie and redirects back to the editor. Logout `POST`s
`/auth/logout` and clears the in-memory session state. All project API calls
are normal JSON requests with `credentials: 'include'`. The editor never
holds an OAuth access token and stores no token in localStorage,
sessionStorage, Svelte stores, `ProjectDocument`, or URL query parameters.
No Google browser SDK belongs in `apps/editor` unless code inspection
demonstrates the redirect-based OIDC flow genuinely requires it — the
default is no browser SDK; the editor's only involvement in the OIDC flow is
the redirect handoff.

Add root-owned project metadata and persistence status, not a parallel store:

```ts
projectId: string | null;
projectName: string;
savedProjectName: string;
projectVersion: number | null;
```

The editor also keeps session presentation state (`checking | authenticated |
unauthenticated | error`) derived from `/auth/me` at mount and from the Sign
in/logout actions. This remains in-memory session/UI state and is never
serialized.

The existing app bar/menu receives optional Save/Load callbacks and status.
The greenfield `EditorApp` supplies them; `MuseumEditorApp` supplies none, so
the relic keeps its existing checked-in project actions. The project menu gets
one small name field and an owned-project list, not a project-management
surface.

The combined dirty predicate is:

```ts
projectIsDirty =
  store.isDirty ||
  layoutPreviewIsDirty(layoutPreview) ||
  projectName !== savedProjectName;
```

Keep one shared Save/Load request mutex. Local document edits may remain
responsive during a Save, but a second Save or Load cannot start until the
first request has settled; only the current request token may update
`projectVersion`.

### Save

1. Refuse while a document gesture/transaction is active, while either
   document is invalid, or while `projectExportBlocker` reports unresolved
   local/package texture bytes.
2. Compose the full `{ id, name, layout, scene }` from the live stores and
   run `validateProject(composed)`. On success, capture a `SaveSnapshot`
   containing the exact request document plus `sceneCanonicalJson`,
   `layoutCanonicalJson`, `projectName`, and `projectId`; send `result.project`
   as the JSON object body. Cross-document failure leaves both documents,
   selection, history, and dirty state untouched.
3. Require the authenticated Museum Editor session and `PUT` the snapshot's
   canonical object as a credentialed JSON request (`credentials: 'include'`
   so the session cookie travels with the request), and only after a
   successful response update `projectId` and `projectVersion`. Set the
   scene/layout baselines and `savedProjectName` from the snapshot, never by
   reading live state at response time. If the user edited the scene,
   layout, or name while Save was in flight, the current state remains dirty
   against that snapshot.
4. Saving preserves the current domain/view, selection, camera preview
   session, and undo/redo history. The combined project dirty indicator is
   `projectIsDirty`, including the project-name comparison above.

Add the smallest snapshot-aware baseline-only facades needed for this behavior
(for example, `EditorStore.markSaved(snapshot.sceneCanonicalJson)` and a
layout baseline helper). Do not implement Save by importing the same document,
because import intentionally clears selection and history.

### Load

1. Use the authenticated session established at mount and list only the
   current user's projects. Refreshing the page leaves the blank boot
   project in place until the user chooses Load.
2. Use one combined dirty confirmation when either scene, layout, or project
   name is dirty, then capture a live scene/layout/name fingerprint.
   Fetch the selected latest project, validate its response object through
   `validateProject(response.document)`, and preflight the complete
   replacement with `derivePreviewBundle` and the remote room registry before
   mutating either live document.
3. Refuse during an active gesture; stop/cancel camera preview and pending
   placement through the existing replacement guards.
4. Install the preflighted layout + scene as one composition-root operation,
   passing the remote room registry into the scene replacement seam so a
   remote layout and scene cannot briefly resolve against the old rooms. Just
   before commit, compare the live scene/layout/name fingerprint and re-check
   that no document gesture or transaction is active. If either check fails,
   abort with a re-load message and leave the current project unchanged. On
   any validation, geometry, auth, or network failure before commit, the same
   no-mutation guarantee applies.
5. After success, clear active scene/layout selection, pending placement,
   preview-only navigation, and shared undo/redo history; set both baselines,
   `savedProjectName`, project metadata, and status from the validated load.
   Preserve the current Scene|Camera and Plan|3D view choice unless the
   existing replacement guard requires a teardown.

The only new cross-domain seam is the minimum root-owned full-project
replacement operation plus the existing store/layout baseline hooks required
to make that operation safe. It must not become a second history, graph,
motion, selection, or geometry system.

## Implementation slices

### P19.0 — ratify the Google OIDC integration gate

- Confirm the P18.3 Render/Neon health smoke and the API origin; the owner
  creates/approves the Google OAuth web application.
- Pin the deployment environment ownership: API private secrets
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_KEY`, `DATABASE_URL`;
  API configuration `EDITOR_ORIGIN` (and the callback base if needed);
  editor public configuration `PUBLIC_API_ORIGIN`. Never commit secrets, and
  never expose `GOOGLE_CLIENT_SECRET` or `SESSION_KEY` through public
  SvelteKit environment variables.
- Pin the approved Google callback URL (terminating on the API,
  `{API_ORIGIN}/auth/callback`), the editor production origin, and generate
  the 32-byte secure-session secret.
- Require a same-site production editor/API topology (preferably sibling
  subdomains under one registrable domain) for authenticated Save/Load;
  the default cookie config is `HttpOnly`, `Secure`, `SameSite=Lax`,
  `Path=/`. The temporary `*.vercel.app` → `*.onrender.com` topology is
  for API/OIDC development and browser compatibility testing only, not the
  production session contract. If a shared domain is unavailable at P19.3,
  use a same-origin proxy/BFF route or explicitly block production
  acceptance rather than weakening the session model; loosen `SameSite`
  only if the actual topology requires it.
- Pin the exact `/auth/login`, `/auth/callback`, `/auth/me`, `/auth/logout`
  route shapes before editor integration, plus the request/response shapes,
  object-based `validateProject` boundary, 2 MiB body limit, and the
  `project_versions` JSONB policy in API tests.

### P19.1 — schema, API persistence, and authentication

- Add the SQL migration, tiny `migrate:api` runner, tables, constraints, and
  owner/updated index, with integer public version columns and a bigint-only
  surrogate row ID if retained. `users.id` is the provider-qualified verified
  OIDC subject (`google:<sub>`).
- Add direct SQL functions for list, transactional Save, and latest Load.
  Keep query code close to the API; no repository abstraction for one schema.
- Install/configure `openid-client` and `@fastify/secure-session`; add
  `/auth/login`, `/auth/callback`, `/auth/me`, and `/auth/logout` per the
  HTTP contract above (PKCE verifier/challenge + state + nonce bound to the
  initiating browser session; validated exchange; transient login state
  cleared before the authenticated session is established).
- Protect project routes with session-derived identity (`google:<sub>` →
  `users.id`). Keep health and shutdown behavior unchanged.
- Ordinary API unit tests never contact Google: OIDC authorization/callback
  behavior receives the smallest app-local injected stub, and authenticated
  project-route tests use real `@fastify/secure-session` behavior or a
  narrowly scoped test session helper. Project authorization stays tested
  independently of Google network calls.

### P19.2 — editor session and Save/Load integration

- Replace the provider SDK/token seam with: session bootstrap via
  `/auth/me`, Sign in navigation to `{API_ORIGIN}/auth/login`, a logout
  action, and credentialed project API requests (`credentials: 'include'`).
- Add root project metadata, name/save-baseline state, session presentation
  state (`checking | authenticated | unauthenticated | error`), combined
  dirty state, Save/Load actions, name editing, owned-project list,
  one-request mutex, busy/error status, and abortable mount-time
  project-list fetch to `apps/editor`.
- Add the full-project preflight/install seam, scene-room-registry handoff,
  snapshot-based Save completion, load fingerprint guard, and
  selection/history teardown on Load.
- No Google browser SDK and no token storage; the editor never holds an
  OAuth access token.
- Keep existing plain JSON/package import/export as-is; cloud Save is semantic
  JSON only and does not alter the portable package format.

### P19.3 — deployment smoke

- Register the Google approved redirect URI (`{API_ORIGIN}/auth/callback`)
  and approved origin where required; configure the API secrets
  (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_KEY`, `DATABASE_URL`),
  `EDITOR_ORIGIN`, the secure-session key, and exact editor-origin CORS;
  apply the migration to the owner-approved Neon database; deploy the
  existing API service without changing the Render/Neon topology.
- Run the authenticated smoke against the deployed stack: visit editor →
  Sign in with Google → callback establishes the app session → `/auth/me`
  succeeds → edit → Save v1 → refresh → authenticated session remains → list
  → Load → logout → `/auth/me` reports unauthenticated → project routes
  return `401`. Also verify a second Google identity cannot access the first
  identity's projects. Then rerun API, editor, visitor-boundary, build, and
  browser checks.

## Acceptance

### API and database

1. `npm run check:api`, `npm run test:api`, `npm run build:api`, and
   `npm run migrate:api` pass. Reapplying the migration is a no-op; public
   project version values are JS numbers, not `pg` `bigint` strings.
2. Unauthenticated, invalid-session, malformed-body, invalid-project, and
   document-ID-mismatch requests fail without SQL writes or secret leakage;
   a valid just-under-limit body succeeds, just-over-limit bodies return
   `413`, and malformed JSON returns `400`.
3. An authenticated user can list only owned projects, Save a new project as
   version 1, Save it again as version 2, and Load the latest canonical
   document. The earlier version remains immutable in `project_versions`.
4. A second identity cannot list, Save over, or Load the first identity's
   project; the API returns the same generic `404` for unknown and non-owned
   IDs.
5. Every stored document passes `@portfolio/project-model` validation and is
   one JSONB `ProjectDocument`; no normalized scene/layout tables, generated
   endpoints, session state, selection, history, or binary bytes are stored.
6. Transaction/query failures return bounded generic errors, rollback the
   Save, and do not advance `latest_version`. Health routes and one-time pool
   shutdown still pass their P18 tests.

### Editor and regression

7. Save composes the live scene and layout, validates the object with
   `validateProject`, rejects cross-document invalidity and unresolved
   local/package texture references, and leaves the prior state untouched on
   failure. A successful Save resets baselines from its captured snapshot,
   including `savedProjectName`, without clearing selection or history.
8. A Save that sends snapshot A, receives a response after the user edits to
   B, and completes leaves B dirty; a second Save/Load cannot overlap the
   first or regress `projectVersion`.
9. Load preflights the whole project, uses one dirty confirmation, restores
   layout + scene together with the remote room registry, clears selection and
   shared history after success, and leaves the current state unchanged on
   validation/auth/network/preflight failure or a changed live fingerprint.
10. A browser smoke passes: sign in → edit scene/layout → Save → observe v1 →
   edit again → Save v2 → refresh → Load → verify room frames, layout objects,
   scene entities, camera nodes/connections, and derived runtime geometry.
11. Browser smoke covers canceling a dirty Load, a failed Save, an expired or
   invalid session, an empty owned-project list, and two users' isolation.
12. The greenfield editor exposes the cloud actions; `/museum/editor` keeps
   its relic actions and never constructs the cloud persistence controller
   or the new auth/persistence client; `/museum` makes no API/auth request
   and remains visitor-only.
13. `npm run check`, `npm run build`, the full editor suite,
   `verify:visitor-bundle`, and existing `/`, `/editor`, `/museum`, and
   `/museum/editor` browser smoke all pass.

### OIDC, session, and deployment (2026-09-01 auth amendment)

14. `/auth/login` creates a fresh authorization request with PKCE/state and
    the expected API callback URL.
15. Tampered or missing OAuth `state` fails; no session is created.
16. Missing or wrong PKCE verification fails; no session is created.
17. An invalid callback, token, or identity response never creates an
    authenticated session.
18. A successful callback stores only the canonical internal identity
    (`google:<sub>`) in the Museum Editor secure session. It performs no
    database write; the corresponding `users.id` row is materialized lazily
    inside the first successful Save transaction.
19. Project routes reject missing or invalid sessions with a generic `401`.
20. An authenticated session can list, Save, and Load owned projects.
21. A second Google subject cannot list, Load, or overwrite the first
    subject's project.
22. Logout clears the session, and project requests subsequently fail with
    `401`.
23. No Google client secret, session key, authorization code, token, cookie,
    or database URL appears in logs or responses.
24. `/museum` performs no auth/API requests.
25. `/museum/editor` does not construct the new auth/persistence client.
26. Cookie/CORS behavior passes against the real deployed editor/API
    topology.
27. Cross-origin unauthorized origins cannot perform authenticated project
    mutations.
28. OAuth callback attacks with invalid state/nonce/PKCE fail closed.

## Mount, relic, Plan, and visitor boundaries

- API pool, routes, and session verification are process-owned; tests use
  Fastify injection and injected identity/database seams without binding a
  port and without network calls to Google.
- Browser session state mounts only in the greenfield `EditorApp`. Unmount
  aborts pending list/load requests; no API call is started by the relic or
  visitor route, and `/museum/editor` never constructs the auth/persistence
  client.
- Save/Load is a whole-project operation. There is no separate cloud Layout
  save, Scene save, camera save, selection persistence, or history persistence.
  Existing Plan|3D and Scene|Camera mounts, camera preview teardown, and
  selection ownership stay under their current contracts.
- `/museum` remains the checked-in Chopin visitor and cannot read user
  projects. `/museum/editor` remains a gated editor relic with its checked-in
  Chopin document and existing reset/import/export semantics. No cloud data
  is promoted into either relic surface.
- `@portfolio/project-model` remains the canonical document owner;
  `@portfolio/layout-core` remains the layout owner; generated endpoints and
  compiled geometry are derived after Load and are never persisted.

## Fallback

- If the Google OAuth credentials or origins are not owner-approved,
  production authentication and Save/Load do not ship. Persistence/query
  tests may continue behind injected test identity/session seams, but do not
  fall back to unauthenticated project routes, local passwords, a custom JWT
  service, or storing Google tokens as a shortcut.
- Do not broaden to multiple OAuth providers during P19; no generic auth
  package and no `@portfolio/auth-core` are created. If editor/API
  cross-site cookie deployment proves operationally unacceptable, evaluate
  same-site or proxy routing as deployment work before replacing the auth
  architecture.
- If the full-project editor replacement is too broad after preflight, land
  P19a (schema, auth, API, and direct route tests) before P19b (editor
  Save/Load). Do not expose independent durable scene/layout endpoints.
- If deployment routing is cross-origin, configure one approved origin or use
  host-level same-origin routing. Never loosen CORS to `*` to unblock a smoke.
- If asset fidelity is required before R2, leave Save explicitly blocked for
  unresolved binary references and retain portable package export. Re-register
  the asset-storage slice rather than storing bytes or fake metadata in P19.
