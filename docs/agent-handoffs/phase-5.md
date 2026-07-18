# Phase 5 Handoff — Asset Library and Placement Commands

## Phase Result

- **Phase goal:** browse the data-driven asset manifest in the editor and add, duplicate, or delete Paris placements through atomic document history.
- **Completed:** required placement-surface metadata; shared fallback normalization; scene fallback validation; searchable/filterable library; one-shot semantic-floor placement; batch-safe creation/copy IDs; selection-aware duplication; flat cluster reconstruction; selection deletion/cluster cleanup; atomic candidate validation; delayed registry-backed framing; guarded commands and shortcuts.
- **Intentionally not completed:** manifest editing, persistence/import/export, thumbnails, additional editable rooms, wall/ceiling/object-surface placement, collision handling, nested clusters, or visitor hierarchy parenting.
- **Acceptance status:** `npm test` 115/115, `npm run check` 0 errors / 0 warnings, `npm run build` passed. Production preview returned 200 for `/museum` and 404 for `/dev/museum-editor`; editor strings were absent from production client output. Interactive WebGL acceptance remains manual because no controllable browser backend was available.

## Important Contracts

- `MuseumAsset.placementSurface` is required. `surface` means another object such as a table or pedestal; only `floor` is placeable in Phase 5.
- `resolveAssetFallback(asset)` returns the normalized scene fallback without mutating the manifest. Every scene placement persists its fallback, and that placement value remains renderer-authoritative.
- Manifest `defaultRotation` is a renderer-owned Euler-radian correction. New scene placements always persist authored `rotation: [0, 0, 0]` and omit unit placement scale.
- Floor placement accepts only the existing combined `surfaceType` and `editorSurface.type/placeable/roomId` metadata. It never infers floors from mesh names or orientation.
- Pointer ownership is TransformControls, then orbit/pan drag, then pending placement, then normal selection.
- Creation/duplication reserve IDs against both the document and the current batch. Cluster copies remain flat and are rebuilt only when every source member is selected.
- Candidate documents resolve successfully before history/runtime replacement. Invalid mutations restore the pre-transaction document and add no history.
- Frame requests wait for every requested placement root and are replaced/cancelled by newer focus, selection, deletion, or history changes.

## Manual Acceptance

1. Open `/dev/museum-editor`, choose Assets, and verify search/category/status filtering and read-only provenance details.
2. Confirm the default filter hides rejected assets and non-floor assets explain their deferred placement mode.
3. Start chair placement, switch to table placement, orbit without creating an object, then click the Paris floor. Confirm one object appears, is selected, and frames after mounting.
4. Start placement again; verify invalid geometry creates nothing, Escape cancels, and switching back to Scene cancels.
5. Duplicate single, loose multi-selected, fully clustered, and partially clustered objects. Confirm offsets, unique IDs, primary selection, cluster-copy rules, one-step undo, and delayed framing.
6. Delete one member from two- and three-member clusters; verify cleanup/order and undo restoration.
7. Verify `Cmd/Ctrl+D`, Delete/Backspace, F, End, group shortcuts, and Escape are ignored while typing or while TransformControls owns a drag.

## Verification

- `npm test` — 11 files / 115 tests passed.
- `npm run check` — 0 errors / 0 warnings.
- `npm run build` — passed; only existing dependency unused-import, large-chunk, and adapter-auto notices remain.
- Production preview — `/museum` 200; `/dev/museum-editor` 404.

## Next Phase Entry Point

Confirm Phase 6 product scope before implementation. Preserve the manifest as the only asset registry, the flat visitor object render, explicit scene fallbacks, atomic document history, and the Phase 7 boundary for persistence/import validation.
