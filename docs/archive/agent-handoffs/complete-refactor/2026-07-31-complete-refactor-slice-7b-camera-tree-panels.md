# Slice 7.B hand-off — `EditorCameraTree` panel split

**Status:** COMPLETE (7.B only)
**Date:** 2026-07-31
**Branch:** main
**Last commit:** no commit (dirty working tree; user decides)

## Scope note — 7.A skipped

**7.A (`EditorSelection.svelte` → Room/Cluster/CameraWorkspace/Asset panels) not done this slice.**
User directive: skip 7.A — left sidebar already decomposed (`EditorLeftSidebar` → `EditorSceneTree` / `EditorAssetLibrary` / `EditorCameraTree`). Plan §7.A still open if anyone later wants to carve the remaining `EditorSelection.svelte` (~1011 LOC) god; not blocking Slice 8.

## What landed

`EditorCameraTree.svelte` (was 482) → composer **33 LOC** + three panels:

| File | Role | LOC |
|------|------|-----|
| `GuidedTourPanel.svelte` | Guided tour stops + free nodes + drag/reorder (plan’s `TreeShortcuts` name was wrong — file had tour UI, not keyboard kill-switch) | ~360 |
| `ConnectionListPanel.svelte` | Connection rows + forward/reverse direction toggles | ~295 |
| `DirectionalKeyframeList.svelte` | View-key rows under an expanded direction | ~147 |
| `EditorCameraTree.svelte` | Composes GuidedTour + ConnectionList; empty “No cameras” | **33** |

Props pattern: `{ store }` only (matches `EditorSceneTree`).

### Bugfix while splitting

Direction expand checks used `` `${connectionId}:${direction}` `` (single `:`). Session/store keys are `` `${connectionId}::${direction}` ``. Expand UI never matched toggle writes. Fixed in `ConnectionListPanel` via `directionTreeKey` → `::`.

## Files added / modified

- **NEW** `apps/museum/src/lib/editor/GuidedTourPanel.svelte`
- **NEW** `apps/museum/src/lib/editor/ConnectionListPanel.svelte`
- **NEW** `apps/museum/src/lib/editor/DirectionalKeyframeList.svelte`
- **REWRITE** `apps/museum/src/lib/editor/EditorCameraTree.svelte` — composer only

No store / god-file API changes. No snapshot tests existed for `EditorCameraTree` (7.B.5 N/A).

## Test results

- `cd apps/museum && npx vitest run src/lib/editor` → **396 passed / 25 files**
- `npm run check` → **0 errors / 0 warnings**
- svelte-autofixer on all four files → clean

## Browser smoke

**Still removed** (Slice 6 decision). Manual `/dev/museum-editor` camera workspace:

1. Guided tour: select stop, ↑/↓ reorder, remove (non-start), drag free→guided, insert gap when free selected
2. Connections: expand connection → expand forward/reverse (chevron must stick open — `::` fix)
3. Select connection / direction / view key; timeline key select still works

## Next-slice read list (DO NOT re-scan)

Slice 8 reads ONLY:

- This hand-off + Slice 6 HO (`2026-07-31-complete-refactor-slice-6-selection-deletion.md`)
- New panels above if wiring hooks/shortcuts near camera tree
- `EditorCameraRig.svelte` / `EditorCameraTimelinePanel.svelte` / `EditorAppBar.svelte` / `MuseumEditorApp.svelte` keydown (plan §8)

DO NOT reopen 7.A unless explicitly scoped. DO NOT re-read full former `EditorCameraTree` body (split done).

## Known gotchas

- Plan name `TreeShortcuts` ≠ reality → shipped as `GuidedTourPanel` (tour + free nodes). Keyboard shortcut extract stays Slice 8 (`registerEditorShortcuts`).
- Direction tree keys: `::` not `:`. Helper keys for 3D picks still `:`.
- Style duplication across panels (scoped CSS). Acceptable for extract; shared class sheet later if needed.
- `EditorSelection.svelte` still ~1011 — leftover from skipped 7.A.

## Open questions for next slice

- Whether Slice 8 shortcuts should live near `GuidedTourPanel` or only app-shell `registerEditorShortcuts` (plan: app shell only).
- Optional: export `cameraDirectionTreeKey` from helpers so UI can’t drift from store again.
