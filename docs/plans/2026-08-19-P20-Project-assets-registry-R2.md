# P20 — Project Asset Registry + R2 asset storage

**Status:** proposed umbrella plan.
**Depends on:** P19 shipped, including the live Google OIDC / deployed Save–Load gate.
**Source:** ratified backend/persistence migration review Pass 6 + current North Star shared-assets direction.
**Amended:** owner-ratified amendment direction (SceneDocument vs registry ownership, portable package semantics, shared-package purity, R2 test seam, key/dedup isolation, tightened v1 scope, targeted P20.0 inventory, S-slice naming) — P20.0 must resolve the durable texture-reference contract before P20.1.
**Purpose:** add the first durable project-level asset system without introducing Experience, Publish, user-wide libraries, or a second scene/asset authority.

---

## Outcome

Turn project assets into durable cloud resources.

An authenticated owned project can ingest an asset, assign it stable project-level identity and metadata, store heavy bytes in Cloudflare R2 where required, reference that asset from the existing Spatial authoring system, Save the `ProjectDocument`, refresh/Load later, and resolve the same bytes again.

The durable flow becomes:

```text
Guest/local authoring
        ↓
authenticate + own project
        ↓
Project Asset Registry
        ↓
    ┌───┴────┐
metadata     bytes
Postgres      R2
        ↓
Spatial now
Experience later
```

P20 implements the registry for **current Spatial use**.

It does not implement Experience or Publish.

---

# Product contract

The project has **one asset registry**.

```text
Project Asset Registry
        ↓
   Spatial
        ↓
Experience later
```

Asset source is acquisition metadata, not a separate authoring system.

The broad source classes remain:

```text
Built-in
Upload
Online
```

Implementation forms may differ:

```text
built-in/procedural
→ metadata/reference only
→ no R2 object required

uploaded file
→ registry metadata
→ R2 bytes

online/provider import
→ registry metadata + provenance
→ R2 bytes when imported/copied into project storage
```

Do not force procedural or built-in semantic assets to pretend to be GLBs.

Do not create:

```text
SpatialAssetStore
ExperienceAssetStore
TextureCloudStore
ModelCloudStore
```

as competing durable systems.

---

# Current starting point

P20 begins after P19/P19.4 established:

```text
Entry
→ Project Hub
→ Project Shell
→ Spatial Editor
```

A guest can author without authentication.

An authenticated user owns durable cloud projects.

Cloud asset persistence therefore belongs only to an **authenticated owned project**.

Do not introduce anonymous database users or anonymous R2 ownership.

The current Spatial asset model already contains concepts such as:

```text
assetId
category
placementSurface
footprint
defaultScale
defaultRotation
fallback
source/provenance
license/attribution
productionFile
```

and scene placements already reference assets by `assetId`.

Current texture handling separately has local/package binary references and `projectExportBlocker` prevents cloud Save when those bytes are not durable.

P20 must reconcile these existing systems rather than placing a new registry alongside them.

---

# Architectural boundaries

## Postgres owns

Durable project asset identity and metadata:

```text
project association
stable asset identity
kind/category
storage kind
mime
byte size
SHA-256
R2 object reference when applicable
source/provenance
creator
license
attribution
provider/source reference
import state
created/updated metadata
```

The exact schema is decided in P20.0 after code inventory.

## R2 owns

Heavy immutable or replaceable binary resources such as:

```text
GLB/model bytes
textures
images
audio
video
other project media
```

R2 does **not** own semantic project structure.

The long-term registry remains broad (3D, images, audio, video, presentation media, provider imports). P20 implementation is intentionally narrow: **textures/images first** (`image/png`, `image/webp`, `image/jpeg`); GLB only if current code already has a viable import/placement path without a new subsystem; no audio/video pipelines. The design must not prevent those later.

## ProjectDocument owns

Semantic authored references to project assets where required by Scene/Material/etc.

It does not store:

```text
binary bytes
bucket
R2 key
R2 credentials
signed URLs
R2 implementation details
storage status
SHA dedup state
upload state
HTTP state
provider credentials
```

A Scene document may reference a project asset, but it must not become the asset registry.

## Shared-package purity

`@portfolio/project-model`, `@portfolio/layout-core`, and `@portfolio/camera-core` remain storage- and infrastructure-neutral. They must gain no dependencies on:

```text
R2
AWS SDK
S3
Fastify
pg
Node-only storage APIs
editor session state
```

Pure model changes required for durable semantic references are allowed. Storage implementation is not. The R2/S3 client belongs under `apps/api`; editor code consumes an authenticated API/resource-resolution seam, never an R2 SDK. This mirrors the existing P19 application-boundary rule. Add a static boundary guard (e.g. project-model must not import storage/server SDKs) alongside the visitor-bundle pin.

## Existing Spatial owners remain

P20 must not disturb:

* `LayoutDocument` / `SceneDocument` separation;
* room-local transforms;
* editor selection/history;
* layout compiler ownership;
* camera graph/motion authority;
* current Svelte 5 / Threlte lifecycle;
* whole-project P19 Save/Load semantics.

---

# Core invariant — authored references do not point at R2

Authored project state should reference stable asset identity, not physical object-storage location.

Preferred conceptual direction:

```text
Scene / Material
      ↓
project assetId
      ↓
Project Asset Registry
      ↓
storage metadata
      ↓
R2 object key
```

Never:

```text
SceneDocument
→ raw bucket name / R2 key / presigned URL
```

Storage layout may change without rewriting authored project truth.

## P1 gate — SceneDocument vs Project Asset Registry ownership (blocks P20.1)

P20 must not proceed with the vague instruction:

```text
/local/... → durable asset reference
```

without defining what that reference means in the canonical project model. Current truth is `SceneTextureAsset = { id, name, uri }` with the shared scene codec accepting only a safe root-relative `uri`.

### Ownership rule

```text
Project Asset Registry
→ owns durable asset identity, provenance and storage metadata

SceneDocument
→ owns only the semantic reference required by the authored material/texture relationship

R2
→ owns bytes only
```

### P20.0 must choose one canonical representation

Inspect the current codec and loader and explicitly decide between:

**A. project-model schema change** — evolve texture references to distinguish a durable project asset from a legacy/static URI.

**B. app-local resolution over the existing URI model** — only if this preserves a meaningful portable semantic contract without treating an API/R2 URL as project truth.

Do not choose B merely to avoid a schema migration.

The detailed plan must answer:

1. What does a durable texture reference look like?
2. Does `@portfolio/project-model` change?
3. How do existing `{ id, name, uri }` documents continue to validate?
4. Is this a schema-version change or a backward-compatible extension (Scene currently has no version field)?
5. How does the editor resolve the reference?
6. How does visitor-safe/package resolution work?
7. What exactly replaces `/local/...` after successful cloud conversion?

Preferred principle:

```text
SceneTextureAsset
→ semantic project asset reference

Project Asset Registry
→ asset reference → storage metadata

API
→ storage metadata → R2
```

Never:

```text
SceneTextureAsset
→ R2 URL/key
```

If the current texture/schema model cannot adopt asset identity cleanly inside P20, the implementation plan may define a migration-safe intermediate representation, but must:

1. identify the debt explicitly;
2. preserve project-model validation;
3. avoid making R2 URLs canonical project identity.

---

# Main design decision — catalogue vs registry

This is P20's primary architecture gate.

The existing `Asset` type mixes several concerns:

### Catalogue / acquisition information

```text
sourceFile
productionFile
sourceUrl
creator
license
attribution
status
```

### Authoring semantics

```text
placementSurface
footprint
defaultScale
defaultRotation
fallback
shadow defaults
```

### Runtime/loading concerns

```text
productionFile
load/fallback behavior
```

P20 must not blindly serialize the whole current `Asset` object into Postgres.

The intended ownership is:

```text
Built-in catalogue / external provider
          ↓ ingest / accept
Project Asset Registry
          ↓
stable project asset
```

A catalogue/provider is a **source**.

Once an asset becomes part of a project, metadata required for deterministic authoring must not silently change because an upstream catalogue entry changes later.

The P20.0 plan must explicitly answer:

* which metadata remains catalogue-owned;
* which metadata is snapshotted into the project asset record;
* which metadata belongs only to Scene placement;
* how `footprint`, placement rules and default transforms remain deterministic;
* how existing shipped catalogue IDs are preserved/migrated;
* whether built-in assets receive project-local registry rows immediately or lazily when first used;
* whether any types genuinely need a shared pure-TS home.

Do not move the whole catalogue into `@portfolio/project-model`.

P16 deliberately kept catalogue concerns out of the project-model boundary; changing that requires explicit justification.

---

# Stable identity

P20 must preserve one stable authored asset identity.

Conceptually:

```text
project
└─ asset
   ├─ assetId
   ├─ metadata
   └─ optional storage object
```

The detailed plan must inspect current `assetId` semantics before choosing:

```text
global UUID
project-local ID
(project_id, asset_id) composite identity
namespaced built-in identity
```

Prefer the smallest scheme that:

* preserves existing scene references where possible;
* avoids rewriting asset identity when storage changes;
* allows the same built-in source to be accepted by many projects independently;
* avoids collisions;
* remains compatible with future Experience consumers.

---

# P20.0 — asset contract + R2 infrastructure gate

Before implementation, perform code inventory and ratify the durable contract.

## Required code inventory

Record the known baseline directly instead of re-investigating it:

```text
SceneTextureAsset = { id, name, uri }

scene codec
→ safe root-relative URI validation

projectExportBlocker
→ BinaryTextureStore first
→ package/local URI without bytes blocked
→ safe static URI otherwise resolved

package exporter
→ resolve texture bytes
→ fingerprint
→ embed bytes
→ rewrite to package-local /textures/... URI
```

Then focus investigation only on the actual unanswered questions:

1. exact current texture URI forms and all producers;
2. exact texture loader/resolver path;
3. how a registry-backed texture can enter that resolver without R2 semantics entering project-model;
4. schema/backward-compatibility implications of durable references;
5. package export after cloud conversion;
6. package import → local binary → optional cloud conversion;
7. history semantics when replacing a local reference with a durable one;
8. current GLB import/placement maturity;
9. guest-local binary → OAuth → authenticated upload behavior.

The detailed plan must cite exact files/functions for these decisions.

Do not implement against assumptions from old plans if current code differs.

## R2 owner-run gate

Pin:

* Cloudflare account;
* one private R2 bucket for project asset bytes;
* bucket location hint/access geography appropriate to Render/Neon users;
* API credentials;
* Render secrets/environment names;
* local-development strategy;
* upload limits;
* supported initial MIME/file classes — v1 is `image/png`, `image/webp`, `image/jpeg` using existing image support; GLB conditional (see v1 scope); no audio/video pipelines.

Consume R2 through its S3-compatible API.

Do not add a generic object-storage abstraction unless a concrete second backend already exists.

## Pin lifecycle semantics

P20.0 must ratify:

```text
register
upload
resolve
reference
Save
Load
download/fetch
remove
```

including failure behavior.

Also decide:

* R2 key format — deterministic **project namespace**, server-owned opaque object identity (e.g. `projects/{projectId}/assets/{assetId}/{opaque-server-suffix}`; exact format after review). Do not make the full object key deterministic: the namespace is deterministic, the final storage identifier is opaque. Hard rules: client never supplies the R2 key; key is always project-scoped; asset ID must be authorized against that project; raw object key is never sufficient authorization; byte GET repeats the same session → project ownership check as metadata GET; bucket remains private; no guessable/public R2 URLs as the normal contract;
* SHA-256 integrity;
* duplicate-byte behavior — if SHA-256 dedup ships, scope it to the project (`(project_id, sha256)` or equivalent); no cross-user/cross-project dedup in P20 (avoids existence inference, ownership leakage, and coupled retention). Dedup may be deferred entirely; integrity hashing alone suffices for v1;
* metadata/object creation order;
* orphan-object cleanup;
* what happens when DB metadata exists but the R2 object is missing;
* whether physical deletion ships in P20.

---

# Guest boundary

Guest authoring remains first-class.

Guest users may continue to use existing built-in/local authoring functionality and portable export according to current behavior.

But:

```text
R2 persistence
registry-backed cloud asset ownership
→ require authenticated owned project
```

No anonymous R2 objects.

No temporary server-side guest accounts.

## Guest local-binary → cloud transition

P19.4's OAuth handoff intentionally persists only semantic `ProjectDocument`; it does not persist arbitrary binary bytes across the full-page Google redirect.

P20 must explicitly resolve this edge case before changing the current Save blocker:

```text
guest has local binary
→ requests cloud Save
→ authentication navigation would lose in-memory bytes
```

The detailed plan must choose one bounded v1 behavior.

Preferred priority:

1. preserve current local/portable behavior;
2. do not invent anonymous R2 storage;
3. do not silently lose bytes;
4. do not weaken `projectExportBlocker`.

Acceptable v1 directions include:

### A — authenticated conversion only

Require authentication before converting local binary assets into cloud assets. Existing guest-local projects with unresolved binary references remain portable/local-only until the user signs in while those bytes can be safely preserved.

### B — bounded browser handoff

Persist only the required unresolved asset bytes into a short-lived browser-local binary handoff specifically for the OAuth transition, then upload after authentication.

If B materially expands P20 into an IndexedDB/offline subsystem, reject it and keep A.

The detailed implementation plan must make the tradeoff explicit.

Do not hide this behavior inside ad-hoc session storage or silently discard local binary state.

---

# P20.1 — registry database + R2 API

Add the first durable `assets` schema and API.

## Conceptual schema

Expected shape:

```text
assets
  id
  project_id
  name
  kind/category
  storage_kind
  mime
  byte_size
  sha256
  object_key nullable
  source_kind
  source_ref nullable
  source_url nullable
  creator nullable
  license
  attribution nullable
  import_state
  created_at
  updated_at
```

This is directional, not a literal required schema.

Built-in/procedural assets must allow:

```text
object_key = null
```

when there are no project-owned bytes.

Use direct SQL and the existing migration runner.

Do not add an ORM.

## Authorization

Every project-asset operation resolves:

```text
secure session
→ authenticated user
→ owned project
→ asset
```

Preserve P19's information-hiding semantics:

```text
unknown project
non-owned project
→ same generic 404
```

Do not accept `ownerId` from the client.

Byte retrieval repeats the same session → project ownership check as metadata retrieval. Raw object keys, bucket names, or signed URLs are never accepted from the client and never exposed as the normal contract.

## Object-store test seam

P20.1 must make object storage injectable at the API composition boundary. Keep the smallest interface covering only the operations P20 actually uses (e.g. put/get; omit delete if physical deletion does not ship):

```text
createApp → R2/S3-backed implementation (production)
createApp → deterministic in-memory/fake object store (tests)
```

`npm run test:api` must not contact Cloudflare. Do not create a generic workspace-level storage package; keep the interface local to `apps/api` unless another real consumer later justifies extraction.

## Minimum API

Plan the smallest authenticated surface for:

```text
list project assets
read asset metadata
create/register asset
upload asset bytes
retrieve asset bytes
remove asset from active project where safe
```

Exact HTTP shapes belong to the detailed implementation plan.

Binary requests must not inherit the P19 2 MiB semantic-document limit.

P20 gets its own explicit upload bounds.

Stream bytes rather than buffering the whole object in Fastify memory.

For v1:

```text
browser
→ Fastify
→ R2
```

is acceptable.

Do not introduce yet:

```text
presigned direct browser upload
multipart/resumable orchestration
background workers
CDN architecture
transcoding pipeline
```

unless code inventory proves an immediate requirement.

---

# Upload transaction semantics

Prefer:

```text
validate request
→ authenticate / authorize
→ stream/hash upload
→ create/finalize registry metadata
→ return stable asset identity
```

The detailed plan must prevent a durable registry entry from claiming usable storage when its upload failed.

If perfect DB+R2 atomicity is impossible, define a small explicit state machine such as:

```text
pending
ready
failed
```

or equivalent cleanup semantics.

Do not let half-written asset records masquerade as usable assets.

---

# P20.2 — Spatial registry integration

Integrate the registry into the **existing Spatial asset system**.

Do not build the final project-level Assets workspace yet.

The existing asset library becomes progressively a contextual view over:

```text
built-in catalogue
+
current project's accepted registry assets
```

with one placement path after acceptance.

Minimum workflow:

```text
choose/import asset
→ register/upload if required
→ receive stable assetId
→ existing Spatial placement
→ existing selection/history/transforms
```

Do not create a second placement command set for cloud assets.

## Built-in assets

Existing built-ins must keep working without R2.

When a built-in is used in a cloud project, the detailed plan determines whether its project registry metadata is:

```text
created on first use
```

or:

```text
derived until first durable Save
```

but the result must preserve provenance and deterministic authoring semantics.

## Uploaded assets

Uploaded assets become:

```text
file
→ validation
→ registry ingest
→ R2
→ stable project asset identity
→ normal Spatial use
```

P20 does not require a polished import wizard.

Use the smallest existing asset-library UI seam.

## Online assets

Provider architecture remains future-compatible but provider search itself is not required.

If existing assets already carry provider/source URLs, preserve them as provenance.

Do not hard-code Sketchfab into the durable registry model.

---

# P20.3 — resolve current binary Save blockers

P20 should make the first real cloud fidelity improvement by converting currently unresolved file-backed project resources into registry-backed durable assets.

Start with the actual existing blocker, especially local/package texture bytes.

Current shape:

```text
ProjectDocument
→ local/package texture reference
→ BinaryTextureStore
→ projectExportBlocker
→ cloud Save blocked
```

Target:

```text
local texture
→ registry ingest
→ R2 upload
→ durable asset reference
→ blocker clears for that asset
→ P19 Save
```

Do not globally relax `projectExportBlocker`.

A blocker clears only after the corresponding asset is provably durable and resolvable.

The detailed plan must pin:

* which current URI forms can be migrated;
* what durable reference replaces them;
* whether document replacement is undoable;
* what happens if upload succeeds but semantic document mutation fails;
* what happens if mutation succeeds but later project Save fails;
* retry semantics;
* how portable package export continues to behave.

## Save remains atomic

Keep the existing sequencing principle:

```text
upload/resolve asset first
→ ProjectDocument points at durable asset
→ normal P19 whole-project Save
```

Do not persist:

```text
pending-upload URI
blob:
temporary object URL
/local/...
fake cloud reference
```

into durable cloud project truth.

## Portable package semantics

Portable packages remain portable. A registry-backed cloud texture exported as a portable package is resolved to bytes and embedded using the existing package manifest/rewrite model:

```text
cloud project asset
→ authorized asset resolver
→ bytes
→ existing package exporter
→ embedded texture
→ package-local URI
```

Do not emit R2 URLs, authenticated API URLs, or project-registry lookup dependencies into an exported package. Portable export must not require access to the original user's authenticated cloud project after export. Missing bytes at export time fail closed with a clear error.

Package import restores its current package/local binary form. It does not automatically upload imported bytes to R2; cloud conversion remains an explicit later action.

---

# P20.4 — Load/runtime resolution + deployment smoke

A cloud project must survive the complete persistence round trip.

On Load:

```text
ProjectDocument
→ stable asset reference
→ project registry lookup/resolution
→ R2 bytes when applicable
→ existing renderer/loader
```

Do not create a new scene renderer.

Do not let R2 storage semantics leak into `AssetModel` callers unnecessarily; add the smallest resolution seam around the current loader.

## Required smoke

At minimum:

```text
authenticate
→ create project
→ ingest local texture
→ upload/register
→ use it in authored scene/material
→ Save project
→ refresh
→ Load project
→ resolve registry asset
→ fetch R2 bytes
→ render successfully
```

If current GLB import is sufficiently implemented and does not require a new subsystem, also prove:

```text
upload GLB
→ register
→ place
→ Save
→ refresh
→ Load
→ fetch
→ render
```

Do not expand P20 merely to make the second smoke possible.

---

# Asset deletion and immutable project versions

P19 stores immutable historical `project_versions`.

Therefore physical asset deletion is not equivalent to deleting an item from the current UI.

An older project version may still reference the binary.

P20 must not:

```text
delete registry record / R2 bytes
because current latest document no longer references it
```

unless historical version semantics have been accounted for.

Preferred P20 v1:

```text
remove/archive from active asset list
≠
physical object garbage collection
```

Defer actual unreferenced-object GC until reference/version retention semantics are deliberately designed.

If deletion is not required for the useful P20 outcome, omit physical deletion entirely.

---

# Security and validation

P20 must explicitly pin:

* upload maximum bytes;
* allowed initial MIME/file types — v1 is `image/png`, `image/webp`, `image/jpeg`;
* filename normalization;
* server-side MIME sniffing/validation using existing helpers where compatible (confirm magic-byte sniffing vs extension mapping; never trust the browser's declared MIME alone);
* SHA-256 computation;
* object-key generation;
* path/key injection prevention;
* authenticated project ownership before asset exposure;
* bounded errors;
* request timeout behavior;
* logging redaction;
* R2 credentials server-only;
* no arbitrary bucket/object access supplied by clients.

Do not trust:

```text
client MIME
client size
client SHA
client R2 key
client project owner
```

without server validation.

---

# Project Shell relationship

P19.4 already established:

```text
Project Shell
└─ Spatial
```

P20 does **not** need the final Assets surface design.

The shell may remain:

```text
Project Shell
└─ Spatial
```

while asset management stays contextual inside the existing Spatial library.

If a minimal `/project/[id]/assets` route becomes clearly useful during implementation, treat it only as a thin project-asset management surface over the same registry.

Do not create a second asset store to support that route.

Do not delay P20 for final Project Shell visual design.

---

# Visitor and relic boundaries

Hard rules:

## `/museum`

* remains read-only visitor;
* does not authenticate;
* does not list private project assets;
* does not receive R2 management credentials or editor APIs;
* does not consume the Project Asset Registry as an editor service.

The existing checked-in museum assets continue to work independently.

## `/museum/editor`

* remains frozen relic behavior;
* does not adopt cloud asset management as cleanup;
* does not mount P20 registry state/controller unless a separate explicit relic decision is made.

Do not use P20 to merge visitor/editor asset infrastructure.

Shared pure utilities are acceptable where they remain visitor-safe.

---

# Acceptance

## Registry / database

1. An authenticated user can create/list/read assets only inside owned projects.
2. A second user cannot discover or access another user's project assets.
3. Built-in/procedural records can exist without R2 object keys.
4. File-backed assets record stable metadata and integrity information.
5. No scene/layout entities are normalized into the asset tables.
6. Applying P20 migration through the existing migration runner is idempotent.

## R2

7. Heavy bytes upload successfully without whole-file API buffering.
8. Failed upload cannot produce a registry asset reported as ready.
9. Stored bytes can be fetched only through the authorized project asset path chosen by the plan; byte GET repeats the same session → project ownership check as metadata GET, and a second user cannot fetch another user's bytes.
10. R2 credentials/object keys never enter authored project JSON as storage authority.

## Object-store seam and portability

33. `npm run test:api` covers upload success, object-store failure, missing object, stream/read failure, registry rollback/state behavior, and ownership rejection before bytes are exposed — without contacting Cloudflare.
34. Portable export of a registry-backed texture embeds resolved bytes via the existing package manifest/rewrite model; exported packages carry no R2/API URLs and require no authenticated cloud access.
35. Shared-package purity guard remains green: no R2/S3/Fastify/pg/Node-storage imports in `@portfolio/project-model`, `@portfolio/layout-core`, or `@portfolio/camera-core`.

## Spatial

11. Existing built-in catalogue assets still place/render through existing commands.
12. Registry-backed assets use the same selection, placement, transforms, history and renderer pathways after acceptance.
13. No parallel Spatial/cloud placement system appears.
14. Catalogue metadata and registry metadata have one explicitly documented ownership boundary.

## Save/Load

15. An unresolved local binary continues to block cloud Save until its durable conversion succeeds.
16. Uploading/converting that asset replaces the unresolved reference with the canonical durable reference.
17. Normal P19 whole-project Save then succeeds.
18. Refresh + explicit Load restores the same semantic project.
19. Asset bytes resolve again from R2 and render/use successfully.
20. Asset upload failure cannot reset project Save dirty baselines.

## Guest/auth

21. Guest authoring still requires no account.
22. Guest activity creates no DB user/project/R2 object merely by opening the editor.
23. Cloud asset persistence requires authenticated project ownership.
24. The unresolved guest-binary/OAuth edge follows the explicit P20.0 contract and never silently loses bytes.

## Regression

25. Existing plain JSON/package export remains supported according to current portable format semantics.
26. `LayoutDocument` / `SceneDocument` ownership remains unchanged.
27. camera/navigation systems remain unchanged.
28. selection/history remains deterministic and editor-owned.
29. `/museum` makes no private project-asset/auth request.
30. `/museum/editor` retains relic behavior.
31. visitor-bundle boundary checks remain green.
32. API/editor/project persistence tests and builds remain green.

---

# Explicitly out of scope

P20 does not implement:

* Experience asset picker;
* Experience document/schema;
* Experience Content or Interactions;
* final Project Assets workspace design;
* user-wide “My Assets”;
* cross-project reusable user libraries;
* sharing/teams;
* marketplace/store;
* provider search UI;
* Sketchfab-specific architecture;
* generated asset AI;
* thumbnail generation pipeline;
* model optimization service;
* automatic LOD generation;
* transcoding;
* background workers;
* CDN/public delivery architecture;
* multipart/resumable uploads unless required by explicit v1 limits;
* publish/player work;
* public visitor asset serving;
* asset GC system;
* final Project Shell design.

---

# Internal delivery structure

Use one umbrella P-number:

```text
P20 — Project Asset Registry + R2
```

with internal slices (never registered as separate tracker rows; S-names avoid confusion with the tracker's flat P-number namespace):

```text
S0
Asset ownership + durable-reference (P1 gate) + guest-binary + R2 gate

S1
Postgres registry + R2 client + authenticated API + test seam

S2
Spatial ingest / built-in + upload registry integration

S3
Texture/local-binary durable conversion + Save blocker integration + portable export

S4
Load resolution + deployed end-to-end fidelity smoke
```

Do not register each internal slice as a new P-number.

In-body references to P20.0–P20.4 below denote these same S0–S4 slices.

If code inventory proves two adjacent slices are mechanically inseparable, merge them rather than preserving this numbering artificially.

---

# Close condition

P20 ships when this statement is true:

> An authenticated project can own a durable file-backed texture asset (PNG/WebP/JPEG), Spatial can use it through the existing authoring system, P19 can Save a semantic reference to it, and after refresh + Load the same bytes resolve from R2 and the project renders correctly.

That is the P20 product boundary.

P20 does not need Experience, Publish, final Assets UI, provider search, or asset-processing infrastructure to close.
