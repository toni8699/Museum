# Slice 5 — scene-codec split (Priority-1)

**Date:** 2026-08-03
**Branch:** main
**Status:** Complete — 660/660 green, svelte-check clean.

## What landed

`apps/museum/src/lib/content/scene-codec.ts` (2 337 LOC monolith) is split
into a `scene-codec/` directory that keeps the existing barrel import
path `$lib/content/scene-codec` resolving to a slim 275-LOC `index.ts`.

| File | LOC | Hosts |
|------|----:|-------|
| `scene-codec/index.ts` | 275 | Public barrel |
| `scene-codec/types.ts` | 107 | Public types + V1-V5 legacy shapes |
| `scene-codec/readers.ts` | 214 | Leaf JSON readers + icon constants |
| `scene-codec/parse-entities.ts` | 596 | Entity/material/texture/placement/cluster parsers |
| `scene-codec/parse-nodes.ts` | 281 | Navigation nodes + waypoints + path anchors |
| `scene-codec/parse-connections.ts` | 463 | Connection shapes + timing helpers |
| `scene-codec/validate.ts` | 405 | Semantic + V2 tour + keyframe validation |
| `scene-codec/canonical.ts` | 187 | Clone helpers + deterministic serializer |
| `scene-codec/migrate.ts` | 90 | V1→V2→V3/V4→V5→V6 migrations |

Total: 2 618 LOC across 9 files (+281 vs the monolith, all overhead is the
trimmed per-file header blocks and explicit imports).

## Public surface

Frozen to: `SceneDocumentIssue`, `SceneDocumentValidationResult`,
`SceneDocumentValidationError`, `cameraSceneConnectionTimingFailureReason`,
`validateSceneDocument`, `parseSceneDocumentJson`, `serializeSceneDocument`.
Everything else tagged `@internal — scene-codec only` and lives behind
relative imports between the sibling modules.

The 7 consumer imports documented in the plan (`load-fixture-scene.ts`,
`scene-codec.test.ts`, `scene.test.ts`, `museum-editor.svelte.ts`,
`museum-editor.test.ts`, `EditorProjectMenu.svelte`,
`navigation-graph-mutator.svelte.ts`, plus the
`document-store.svelte.ts` reference) all keep compiling against the
barrel without modification.

## Plan deviations

- `readHoldSeconds` was originally bucket-planned with `parse-nodes.ts`
  (lines 1302-1320 of the original). Both `parse-nodes` and
  `parse-connections` called it; to avoid a circular sibling import it
  was moved into `readers.ts` as a leaf helper next to `readRequiredNumber`.
  `readEasing` stayed in `parse-connections.ts` because only that module
  reads it.
- `modelEntityFromPlacement` and `documentEntities` were bucketed in the
  plan with `parse-entities.ts` (used by `validate.ts` and
  `migrate.ts`). They ended up there as planned; they sit alongside the
  entity/`parse*` parsers because they are the placement→entity adapter
  those parsers feed.
- `EPSILON` (originally a top-of-file constant in
  `scene-codec.ts`) is now a module-local constant inside
  `validate.ts` because that is the only consumer.

## Verification

- `npx tsc --noEmit -p apps/museum/tsconfig.json` — clean.
- `npx vitest run --reporter=basic` — 660/660 across 45 files.
- `npm run check -w @portfolio/museum` — 0 errors, 0 warnings.

## Next slice

Slice 6 (final) — split `EditorCameraPathHelpers.svelte` / `scene-codec`
test fixture blob, plus the post-split public-surface review that the
plan flagged at the end of Priority-1.
