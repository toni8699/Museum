# H1 S9 — Project-Local GLB Import & Portable Package (Stub)

**Date:** 2026-08-14
**Status:** Stub — S9 fills this in before code
**Parent:** [`2026-08-14-graphics-h1-unified-3d-editing.md`](./2026-08-14-graphics-h1-unified-3d-editing.md)
**Prerequisite:** S0 · Pin the product/session contracts
**Handoff:** [`../../hand-off/CURRENT.md`](../../hand-off/CURRENT.md)

> **Why this stub exists.** The umbrella plan requires a focused asset/package
> sub-plan *before* the portable package manifest format or security limits
> change. This records the open questions so the manifest is not changed ad hoc
> in S9. The body below is intentionally skeletal; S9 replaces it with a full
> plan and deletes this note.

## Scope

- Project-local GLB import: fingerprint, validate, assign a stable project-local
  asset id, register in the Assets panel, and load through the shared
  `AssetModel` path (never a room-local GLTF loader).
- Portable package: model bytes + metadata live in the manifest/asset store,
  **not** inside `MuseumProject` JSON or `SceneDocument`. Scene entities persist
  only an `assetId` (scene v6, unchanged).
- Export/import cross-validates every referenced project-local asset and
  round-trips its bytes; object URLs / decoded GLTFs / renderer handles stay
  session-only and are released on replacement/unmount.

## Open questions S9 must answer

### Manifest / format

- Manifest schema: per-asset entry (id, fingerprint/hash, mime, byte length,
  referenced-by), its canonical key order, and its format version.
- How catalogue (checked-in) ids and project-local ids are namespaced so they
  can never collide in the composite registry.
- Whether the package stays a directory/archive of named files (current shape)
  or becomes a single container — and the migration story if it changes.
- Byte-stability contract: does export produce a deterministic artifact
  (stable canonical order) for diffing/`contentHash`?

### Security / validation limits

- Allowed file extensions and MIME sniffing; how spoofed/unsupported files are
  rejected with structured feedback and **no** partial registration.
- Size limits (per asset and per package) and the failure UX when exceeded.
- Fingerprint algorithm (hash) and how collisions / duplicate imports are
  handled (reuse existing asset vs. new id).
- Validation depth: parse-only, or load-and-verify via the shared loader before
  registration.

### Lifecycle

- When project-local bytes are loaded/decoded vs. released; who owns object-URL
  revocation on unmount, import replacement, and undo of a placement commit.
- How import failure leaves the session unchanged (atomicity), mirroring the
  full-project import rule in S0.

## Explicitly out of scope

- Changing `SceneDocument` / `MuseumProject` schemas — assets stay referenced by
  `assetId`, bytes stay in the package store.
- Account/session persistence — export remains the only save in H1.

## Verification (to be filled by S9)

At minimum: one user-imported GLB registers, places, edits, exports, and
re-imports with identical bytes/id, and an unsafe file is rejected atomically.
