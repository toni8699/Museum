# P19 — first project persistence

**Status:** proposed. **Date:** 2026-08-30. **Depends on:** P18.
**Source:** backend/persistence migration review §0.1.6–§0.1.7 and P18,
first-persistence pass.

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
passing live/ready smoke. The managed identity provider, API audience/issuer,
and deployed editor origin must be owner-approved before provider-specific
code or production secrets are added; this plan does not invent a provider.

## Existing APIs and ownership

- Reuse P18's `createApp`, `DatabasePool`, `readConfig`, `startServer`,
  Fastify injection tests, `pg`, and `@portfolio/project-model` dependency.
- Use `validateProject`, `parseProjectJson`, and `serializeProject` from
  `@portfolio/project-model` as the only project boundary. The API must not
  copy `ProjectDocument`, scene/layout validation, codecs, or schema.
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
  requires `document.id === :projectId`, and stores the canonical object
  returned by that validation. No API-added `version` field enters the
  document; version is database metadata only.
- JSONB contains semantic references only. P19 accepts shipped catalogue and
  safe static texture references; reuse `store.projectExportBlocker` to refuse
  unresolved `/local/...` and package-rewrite texture URIs with a clear Save
  error. No binary bytes are silently treated as durable.
- Load validates and canonicalizes the JSONB result again before returning it.
  The fidelity assertion is canonical `serializeProject` equivalence, not
  PostgreSQL key order or raw JSONB byte identity.

### Minimal schema

Add one checked-in SQL migration under `apps/api/migrations/`:

```sql
users
  id text primary key                         -- managed identity subject
  created_at timestamptz not null

projects
  id text primary key
  owner_id text not null references users(id)
  name text not null
  latest_version bigint not null default 0
  created_at timestamptz not null
  updated_at timestamptz not null

project_versions
  id bigint generated always as identity primary key
  project_id text not null references projects(id)
  version bigint not null
  document jsonb not null
  created_at timestamptz not null
  unique (project_id, version)
```

Use `now()` defaults, a descending owner/updated index for the project list,
and a JSON-object check on `project_versions.document`. Keep the migration
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

## HTTP and identity contract

Health routes remain public and unchanged. Project routes require a verified
managed-provider bearer token:

| Method | Route | Request | Success |
|---|---|---|---|
| `GET` | `/projects` | bearer token | `{ projects: [{ id, name, version, updatedAt }] }` |
| `PUT` | `/projects/:projectId` | `{ document: unknown }` | `{ projectId, version, name, updatedAt }` |
| `GET` | `/projects/:projectId` | bearer token | `{ projectId, version, name, updatedAt, document }` for latest |

- The editor generates a new first-save ID with native
  `crypto.randomUUID()` (for example, `project:<uuid>`), then keeps it in
  root session state. Subsequent Saves use the same ID. The API never trusts
  an owner ID, email, or project name supplied outside the validated document.
- Missing or invalid bearer credentials return a generic `401`. Invalid
  documents, ID mismatches, and oversized/malformed bodies return structured
  `400` responses without stack traces. Unknown or non-owned projects return
  generic `404` responses. Database failures return a generic bounded `503`;
  connection strings and provider tokens never appear in responses or logs.
- Keep provider verification at the API edge. Inject the verifier into
  `createApp` for Node tests, and use the provider's official smallest server
  verifier in production. Do not create a generic auth package or accept a
  client-supplied identity claim.
- If the deployed editor and Render API are cross-origin, allow only the
  owner-approved editor origin and the required `GET`, `PUT`, and preflight
  headers. No wildcard production origin is permitted. If host routing makes
  them same-origin, omit CORS code.

## Editor Save/Load behavior

Add root-owned project metadata and persistence status, not a parallel store:

```ts
projectId: string | null;
projectName: string;
projectVersion: number | null;
```

The existing app bar/menu receives optional Save/Load callbacks and status.
The greenfield `EditorApp` supplies them; `MuseumEditorApp` supplies none, so
the relic keeps its existing checked-in project actions. The project menu gets
one small name field and an owned-project list, not a project-management
surface.

### Save

1. Refuse while a document gesture/transaction is active, while either
   document is invalid, or while `projectExportBlocker` reports unresolved
   local/package texture bytes.
2. Compose the full `{ id, name, layout, scene }` from the live stores and
   run `serializeProject` once. Cross-document room-reference failure leaves
   both documents, selection, history, and dirty state untouched.
3. Acquire the provider access token, `PUT` the canonical document, and only
   after a successful response update `projectId`, `projectName`,
   `projectVersion`, both document baselines, and the status message.
4. Saving preserves the current domain/view, selection, camera preview
   session, and undo/redo history. The combined project dirty indicator is
   `store.isDirty || layoutPreviewIsDirty(layoutPreview)`.

Add the smallest baseline-only facades needed for this behavior (for example,
`EditorStore.markSaved()` and a layout baseline helper). Do not implement Save
by importing the same document, because import intentionally clears selection
and history.

### Load

1. Authenticate and list only the current user's projects. Refreshing the
   page leaves the blank boot project in place until the user chooses Load.
2. Fetch the selected latest project, parse it through `parseProjectJson`, and
   preflight the complete replacement with `derivePreviewBundle` and the
   remote room registry before mutating either live document.
3. Use one combined dirty confirmation when either scene or layout is dirty.
   Refuse during an active gesture; stop/cancel camera preview and pending
   placement through the existing replacement guards.
4. Install the preflighted layout + scene as one composition-root operation,
   passing the remote room registry into the scene replacement seam so a
   remote layout and scene cannot briefly resolve against the old rooms. On
   any parse, validation, geometry, auth, or network failure before commit,
   the current project remains unchanged.
5. After success, clear active scene/layout selection, pending placement,
   preview-only navigation, and shared undo/redo history; set both baselines,
   project metadata, and status. Preserve the current Scene|Camera and
   Plan|3D view choice unless the existing replacement guard requires a
   teardown.

The only new cross-domain seam is the minimum root-owned full-project
replacement operation plus the existing store/layout baseline hooks required
to make that operation safe. It must not become a second history, graph,
motion, selection, or geometry system.

## Implementation slices

### P19.0 — ratify the integration gate

- Confirm P18.3 Render/Neon health smoke, the API origin, the editor origin,
  and the managed identity provider's subject/audience/issuer verification
  settings with the owner.
- Record provider configuration as deployment secrets/environment values;
  do not commit tokens, JWKS credentials, or Neon URLs.
- Pin the request/response shapes above and the `project_versions` JSONB
  policy in API tests before adding editor UI.

### P19.1 — schema and direct persistence queries

- Add the SQL migration, tiny `migrate:api` runner, tables, constraints, and
  owner/updated index.
- Add direct SQL functions for list, transactional Save, and latest Load.
  Keep query code close to the API; no repository abstraction for one schema.
- Add the provider-verifier injection and authenticated route handlers to the
  existing Fastify app. Keep health and shutdown behavior unchanged.

### P19.2 — editor client and full-document replacement

- Add the smallest provider browser sign-in/token seam and API-origin config;
  use the provider's hosted/native sign-in flow rather than custom credentials.
- Add root project metadata, combined dirty state, Save/Load actions, name
  editing, owned-project list, busy/error status, and abortable mount-time
  project-list fetch to `apps/editor`.
- Add the full-project preflight/install seam, scene-room-registry handoff,
  baseline-only Save completion, and selection/history teardown on Load.
- Keep existing plain JSON/package import/export as-is; cloud Save is semantic
  JSON only and does not alter the portable package format.

### P19.3 — deployment and end-to-end smoke

- Apply the migration to the owner-approved Neon database, configure managed
  auth/API/editor origins, and deploy the existing API service without
  changing the Render/Neon topology.
- Run authenticated Save → refresh → list → Load against the deployed API,
  then rerun API, editor, visitor-boundary, build, and browser checks.

## Acceptance

### API and database

1. `npm run check:api`, `npm run test:api`, `npm run build:api`, and
   `npm run migrate:api` pass. Reapplying the migration is a no-op.
2. Unauthenticated, invalid-token, malformed-body, invalid-project, and
   document-ID-mismatch requests fail without SQL writes or secret leakage.
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

7. Save composes the live scene and layout, rejects cross-document invalidity
   and unresolved local/package texture references, and leaves the prior
   state untouched on failure. A successful Save resets both dirty baselines
   without clearing selection or history.
8. Load preflights the whole project, uses one dirty confirmation, restores
   layout + scene together with the remote room registry, clears selection and
   shared history after success, and leaves the current state unchanged on
   parse/auth/network/preflight failure.
9. A browser smoke passes: sign in → edit scene/layout → Save → observe v1 →
   edit again → Save v2 → refresh → Load → verify room frames, layout objects,
   scene entities, camera nodes/connections, and derived runtime geometry.
10. Browser smoke covers canceling a dirty Load, a failed Save, an expired or
    rejected token, an empty owned-project list, and two users' isolation.
11. The greenfield editor exposes the cloud actions; `/museum/editor` keeps
    its relic actions and never constructs the cloud persistence controller;
    `/museum` makes no API/auth request and remains visitor-only.
12. `npm run check`, `npm run build`, the full editor suite,
    `verify:visitor-bundle`, and existing `/`, `/editor`, `/museum`, and
    `/museum/editor` browser smoke all pass.

## Mount, relic, Plan, and visitor boundaries

- API pool, routes, and auth verification are process-owned; tests use
  Fastify injection and injected identity/database seams without binding a
  port or contacting a provider.
- Browser auth/listener/token state mounts only in the greenfield `EditorApp`.
  Unmount aborts pending list/load requests and removes provider listeners;
  no API call is started by the relic or visitor route.
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

- If the identity provider is not approved, stop before production Save/Load.
  The schema/query/API tests may be prepared behind injected test identity,
  but do not ship unauthenticated project routes or replace managed identity
  with local storage, passwords, or a home-grown JWT verifier.
- If provider SDK integration is the only blocker, split P19 into the
  concrete SQL/API persistence slice and a provider adapter slice while
  preserving the same bearer/request contract. Do not add an `api-contract`
  package for the split.
- If the full-project editor replacement is too broad after preflight, land
  P19a (schema, auth, API, and direct route tests) before P19b (editor
  Save/Load). Do not expose independent durable scene/layout endpoints.
- If deployment routing is cross-origin, configure one approved origin or use
  host-level same-origin routing. Never loosen CORS to `*` to unblock a smoke.
- If asset fidelity is required before R2, leave Save explicitly blocked for
  unresolved binary references and retain portable package export. Re-register
  the asset-storage slice rather than storing bytes or fake metadata in P19.
