# Phase 4 Handoff — Asset Manifest and Library Migration

## Phase Result

- **Phase goal:** make asset IDs data-driven, remove asset-to-room coupling, expose manifest lookup/search helpers, and reject unknown scene asset references before rendering.
- **Completed:** `AssetId = string`; `MuseumAsset.rooms` removed; private manifest map; `getAssetById`; filtered/case-insensitive `listMuseumAssets`; manifest validation; scene-boundary asset validation; optional production files for non-approved fallback assets.
- **Intentionally not completed:** placement creation, duplication, deletion, floor placement, asset-library UI, persistence/import/export, and additional editable rooms.
- **Acceptance status:** `npm test` 98/98, `npm run check` 0 errors / 0 warnings, `npm run build` passed. Interactive WebGL acceptance remains manual in `/dev/museum-editor`.

## Important Contracts

- `museumAssets` is the only asset catalog. The lookup `Map<string, MuseumAsset>` is a private index derived from it; do not add a second manifest or loader.
- `getAssetById(id)` returns `MuseumAsset | undefined`; unknown IDs must never silently substitute another asset.
- `getMuseumAsset(id)` remains the explicit throwing helper for callers that require a resolved asset.
- `AssetCategory`, `AssetStatus`, and `FallbackKind` remain strict unions. Only `AssetId` is open-ended.
- Approved assets require a non-empty `productionFile`. Assets without a production file require a valid fallback and a non-approved status. Duplicate file paths are allowed.
- `resolveSceneDocument()` validates every placement asset ID before resolving the runtime scene.
- Room availability is placement/document-driven; `MuseumAsset` does not own room membership.
- Visitor rendering remains flat and continues through the existing `AssetModel` loader/fallback path.

## Verification

- Manifest tests cover lookup, search/filter behavior, duplicate IDs, metadata constraints, approved-file requirements, fileless fallbacks, and duplicate production paths.
- Scene tests prove the checked-in `museum-scene.json` passes unchanged and unknown placement asset IDs are rejected at the scene boundary.
- Run `npm test`, `npm run check`, and `npm run build` after future changes to the manifest or scene schema.

## Next Phase Entry Point

Phase 5 may build asset-library and placement workflows on these APIs. Add creation/duplication/deletion and floor-placement behavior without introducing another asset registry or bypassing scene-boundary validation.
