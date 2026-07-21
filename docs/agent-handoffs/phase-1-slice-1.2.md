# Interim Handoff — Museum Editor Phase 1, Slice 1.2

## Status

- **Slice:** 1.2 — scene tree and contextual inspector extraction.
- **Result:** Implemented; automated checks pass.
- **Phase status:** Phase 1 remains in progress. Slice 1.3 owns the viewport toolbar and bottom timeline controls.
- **Scene/runtime data:** unchanged. No schema, route, motion, graph, or visitor-runtime behavior was edited.
- **Worktree:** the existing `README.md` → `README-museum-editor.md` plan-doc change was preserved and is not part of this slice.
- **Commit:** none created.

## Delivered

- Extracted the complete room/cluster/placement/camera hierarchy into `EditorSceneTree.svelte`.
- Reduced `EditorLeftSidebar.svelte` to persistent Scene/Assets tab orchestration.
- Extracted the right panel from `MuseumEditorApp.svelte` into `EditorInspector.svelte`.
- Kept camera node/connection/anchor/view inspectors and placement/cluster commands on the same store methods and transaction boundaries.
- Moved the existing selected-asset details and placement action from the left library into the contextual inspector.
- Kept asset search, category/status filters, fallback rules, placement restrictions, and visible-list selection behavior in `EditorAssetLibrary.svelte`.
- Added concise no-selection and no-matching-asset inspector states.
- Preserved global shortcuts, cluster-name focus after grouping, discard confirmation, import/export/reset behavior, camera/lighting controls, and active preview controls.
- Reduced `MuseumEditorApp.svelte` to store/session orchestration, navigation protection, shortcuts, and shell composition.

## Files

- Added `apps/museum/src/lib/editor/EditorSceneTree.svelte`.
- Added `apps/museum/src/lib/editor/EditorInspector.svelte`.
- Updated `EditorLeftSidebar.svelte`, `EditorAssetLibrary.svelte`, and `MuseumEditorApp.svelte`.

## Verification

- `npm run check` — 0 errors, 0 warnings.
- `npm test -- --run` — 20 files / 291 tests passed.
- `npm run build` — passed.
- `git diff --check` — passed.
- Production output search found none of the new inspector/tree labels in visitor or production editor-stub entry output.

Build retains the existing third-party unused-import, large-chunk, adapter-auto, and npm CLI forwarding notices.

## Manual Acceptance Remaining

- Confirm Scene/Assets switching updates the right inspector without losing existing library filters during the mounted session.
- Confirm room, cluster, placement, camera node, connection, anchor, and view-key selections show their existing controls.
- Confirm group/ungroup and cluster-name autofocus work from both buttons and Cmd/Ctrl+G shortcuts.
- Confirm supported floor assets still enter placement mode and unsupported assets remain blocked.
- Confirm import, copy, download, reset, preview controls, lighting, and editor-camera controls remain reachable pending their later Phase 1 moves.

## Next Slice Boundary

Slice 1.3 should add the viewport-local transform toolbar and resizable/collapsible timeline panel, then move existing camera preview transport into the bottom panel. Do not add Phase 2 tracks, key rendering, scrub semantics, or whole-tour preview.
