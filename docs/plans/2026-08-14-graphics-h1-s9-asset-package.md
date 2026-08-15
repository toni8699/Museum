# S9+ — Project-Local GLB Import, Server Asset Pipeline & Account Persistence (Post-H1 Plan Seed)

**Date:** 2026-08-14 (re-labeled 2026-08-15 — deferred out of H1)
**Status:** Post-H1 plan seed — deferred from H1 (owner decision, 2026-08-15); filled in before code
**Parent:** [`2026-08-14-graphics-h1-unified-3d-editing.md`](./2026-08-14-graphics-h1-unified-3d-editing.md) (step 9 — deferred) · "Post-H1 polish slices" · S9+
**Handoff:** [`../../hand-off/CURRENT.md`](../../hand-off/CURRENT.md)

> **Why this exists.** H1 (owner decision, 2026-08-15) ships catalogue-only asset
> placement; user GLB import, the project-local half of the composite asset
> registry, the container/package format decision, and the backend are deferred
> to this post-H1 plan. H1 changes no package-manifest contract. This record
> keeps the open questions so the plan is not designed ad hoc later; the full
> S9a/D1 plan replaces this seed before code.

## Scope — two contract-first halves

**S9a — client import → workspace → place.** Upload → server fingerprint /
validate / optimize → asset-record `{ id, status, optimizedBytes, footprint }` →
Assets panel (processing → ready) → ghost placement → scene entity commit.
Implemented against a **typed stub asset-record API** so the client is fully
testable before any server exists. Effort 5 · risk 5 → **6/10** — plan
**Frontier**, implementation **Frontier**.

**D1 — server asset pipeline + account persistence.** Upload endpoint,
optimization pipeline (GLB compression, texture downscaling, size limits, hash
dedup, world-AABB footprint computed at import), storage, project/asset records
per account, session save/load. Effort 8 · risk 8 → **9/10** — plan
**Frontier+**, implementation **Frontier+** (pipeline) / **Frontier** (CRUD).

**Boundary rules (locked):** boot stays local and offline-first; the server is a
sync/save target, never a boot dependency; `/museum` stays hermetic on one
validated container; the pure shared container codec is the contract both sides
implement; the visitor never gains a network dependency.

## Open questions the plan must answer

### Manifest / format

- Manifest schema: per-asset entry (id, fingerprint/hash, mime, byte length,
  referenced-by), its canonical key order, and its format version.
- **Footprints (locked):** the manifest persists no footprint fields.
  Catalogue footprints are authored `MuseumAsset.footprint` metadata; imported
  footprints are computed by the server at import time (world AABB) and live in
  the asset record — never a manifest field. C2 (layout asset objects) is
  rejected — the composite registry stays scene-only.
- How catalogue (checked-in) ids and account/project-local ids are namespaced so
  they can never collide in the composite registry.
- Container/package format decision: content-addressed blobs + hash-referencing
  root (greenfield) vs the current directory-of-named-files manifest — and the
  migration story if it changes.
- Byte-stability contract: does export produce a deterministic artifact
  (stable canonical order) for diffing/`contentHash`?

### Security / validation limits

- Allowed file extensions and MIME sniffing; how spoofed/unsupported files are
  rejected with structured feedback and **no** partial registration.
- Size limits (per asset and per package) and the failure UX when exceeded;
  server-side optimization of oversized files before placement.
- Fingerprint algorithm (hash) and how collisions / duplicate imports are
  handled (reuse existing asset vs. new id).
- Validation depth: parse-only, or load-and-verify via the shared loader before
  registration; what the server validates vs the client's cheap pre-check.

### Lifecycle

- When project-local bytes are loaded/decoded vs. released; who owns object-URL
  revocation on unmount, import replacement, and undo of a placement commit.
- How import failure leaves the session unchanged (atomicity), mirroring the
  full-project import rule in S0; the server transaction owns register-atomically.

## Explicitly out of scope

- Changing `SceneDocument` / `MuseumProject` schemas — assets stay referenced by
  `assetId`, bytes stay in the package store / server asset store.
- Layout asset objects (`LayoutObject.kind: 'asset'`) — rejected; 2D furnishing
  is the post-H1 Plan staging slice (C1).
- Persisting footprint fields in the manifest — imported footprints are computed
  at import (server asset record); catalogue footprints stay in `MuseumAsset`
  metadata.
- Making the server a boot dependency or adding a visitor network dependency.

## Verification (to be filled by the full plan)

At minimum: one user-imported GLB registers (processing → ready), places, edits,
exports, and re-imports with identical bytes/id, and an unsafe file is rejected
atomically. S9a passes with the stub API alone; D1 passes the same contract
against the real server.
