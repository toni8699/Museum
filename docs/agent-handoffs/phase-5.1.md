# Phase 5.1 — Schema v6 textures and material instances

**Status:** Complete  
**Plan:** [`../plans/museum-editor-workspace/phase-5-textures.md`](../plans/museum-editor-workspace/phase-5-textures.md) slice 5.1

## Delivered

- Canonical document is `version: 6` with required `textures`, `materials`, and `entities` arrays.
- Added `SceneTextureAsset` and `SceneMaterialInstance` types.
- Model and primitive entities may reference an optional `materialInstanceId`; lights cannot.
- Primitive `materialId` remains the static-catalogue fallback until assignment/rendering slices.
- v1–v5 migrate deterministically to v6 with empty texture/material arrays.
- v6 parsing validates:
  - unique texture and material IDs;
  - known catalogue `baseMaterialId`;
  - existing `baseTextureId` and entity `materialInstanceId` references;
  - roughness/metalness overrides in `[0, 1]`;
  - safe root-relative public texture URIs, including encoded traversal rejection.
- Canonical serialization and runtime resolution deep-clone all new resource data.
- Checked-in scene and stable test fixture now use v6.

## Not in this slice

- Texture load verification or project-relative import UI.
- Texture/material assignment and history transactions.
- Material-instance rendering or texture-cache lifecycle changes.
- Binary uploads, blob URLs, URI rewriting, ZIP, or package export.

## Verification

- Focused schema/runtime tests: **56 / 56 passed**.
- Full museum suite: **583 / 583 passed** across 36 files.
- `npm run check -w @portfolio/museum`: **0 errors / 0 warnings**.
- `npm run build -w @portfolio/museum`: exit 0; existing third-party unused-import and chunk-size warnings only.
- `git diff --check`: passed.
- Independent code review: no actionable findings; residual risk limited to URI fuzzing and load verification deferred to 5.2.

## Key files

- `apps/museum/src/lib/content/scene.ts`
- `apps/museum/src/lib/content/scene-codec.ts`
- `apps/museum/src/lib/content/scene-codec.test.ts`
- `apps/museum/src/lib/content/scene.test.ts`
- `apps/museum/src/lib/content/museum-scene.json`
- `apps/museum/src/lib/content/__fixtures__/tour-minimal.json`

## Next

Phase 5.2 — register and verify stable public texture URIs, add Textures library/search/import UI, and implement atomic model/primitive assignment against the v6 contract.
