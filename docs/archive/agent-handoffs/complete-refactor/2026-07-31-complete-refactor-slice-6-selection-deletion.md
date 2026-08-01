# Slice 6 hand-off — selection deletion / expansion (5c)

**Status:** COMPLETE
**Date:** 2026-07-31
**Branch:** main
**Last commit:** no commit (slice is dirty working tree; user decides)

## What landed

Tree-expansion ownership is session-only (god `$state` dupes gone); `EditorSelectionStore.expand*` delegates to session. The 15 `selectX` orchestration methods left `MuseumEditorStore` and now live on `EditorSelectionActions` (`store.selectionActions.*`). Call sites and tests use that face; reducer stays pure. Browser smoke dropped entirely — manual `/dev/museum-editor` click-through instead.

## Files added / modified

- `apps/museum/src/lib/editor/store/selection-store.svelte.ts` — `bindSession` + `expandRoom` / `expandCluster` / `expandCameraConnection` / `expandCameraDirection`
- `apps/museum/src/lib/editor/store/selection-store.test.ts` — expand delegation micro-test
- `apps/museum/src/lib/editor/store/selection-actions.svelte.ts` — **NEW** orchestration controller + `EditorSelectionActionsHost`
- `apps/museum/src/lib/editor/store/selection-actions.test.ts` — **NEW** 4 invariant tests (fake host)
- `apps/museum/src/lib/editor/museum-editor.svelte.ts` — session facades for tree arrays; `#createSelectionHost`; hard-delete moved `selectX`; timeline wrappers still call actions
- `apps/museum/src/lib/editor/museum-editor.test.ts` — `store.selectionActions.*`; camera direction keys `connectionId::direction`
- Components: `EditorSelection.svelte`, `EditorSceneTree.svelte`, `EditorCameraTree.svelte`, `EditorCameraInspector.svelte`, `EditorInspector.svelte`, `MuseumEditorApp.svelte` — `store.selectionActions.X`
- `apps/museum/src/lib/editor/museum-editor-shell.test.ts` — call-site updates

## Public surface diff

### Removed from `MuseumEditorStore`

- `selectNavigationNode`, `selectCameraHandle`, `selectConnection`, `selectCameraConnectionDirection`, `selectAnchor`, `selectViewKeyframe`
- `selectPlacement`, `selectPlacements`, `togglePlacement`, `selectCluster`, `deselect`
- `selectRoom`, `selectPlacementFromTree`, `selectClusterFromTree`, `selectAllInRoom`
- `#clearPlacementSelection`, `#defaultCameraDirection`, `#expandActiveCameraDirection` (as god privates)

### Added

- `store.selectionActions: EditorSelectionActions` — all of the above as public methods (plus `clearPlacementSelection`, `expandActiveCameraDirection`)
- `store.selection.expand*` → session
- `store.treeExpanded*` — getters/setters → `session.treeExpanded*` (no local `$state`)

### Kept on god (delegate into actions)

- `selectCameraTimelineEdge` / `selectCameraTimelineNode` / `selectCameraTimelineViewKeyframe`
- `cyclePlacement` → `selectionActions.selectPlacement`
- `finishAnchorEditing` / `finishViewKeyframeEditing` → `expandActiveCameraDirection`
- Tree toggle/ensure helpers (guards + session writes / `selection.expandRoom`)

### Deletion order (why)

1. **6.1 expansion first** — select paths expand trees; single owner before moving orchestration.
2. **Extract `EditorSelectionActions` with host** — move bodies with behaviour parity before deleting god methods.
3. **Migrate components + tests to `selectionActions`** — then delete god methods (no dual facade).
4. **Reset triad** — absorbed inside actions (`cancelAssetPlacement` + `cancelPendingFrame` + room-only workspace); no orphaned `#clearPlacementSelection`.

### Tests deleted

None deleted wholesale. Signature invariants lifted into `selection-actions.test.ts` (4 new). Integration suite kept; call sites rewritten.

## Test results

- `cd apps/museum && npx vitest run` → **531 passed / 33 files**
- Editor-focused: `museum-editor.test.ts` 139 + shell 14 + store suites including selection-actions 4 / selection-store 10
- `npm run check` (museum) → **0 errors / 0 warnings**
- God LOC after: **4511** (was ~4808); `selection-actions.svelte.ts` **519**. Success measured by ownership, not plan’s ≈700 fantasy.

## Browser smoke

**Removed** per user decision. No `@vitest/browser` work. Manual test before merge:

1. Open `/dev/museum-editor`
2. Scene: select room → placement → multi-toggle → cluster from tree → deselect (room stays)
3. Camera: node → connection forward/reverse → anchor → view keyframe; tree expand stays open
4. Timeline edge/node/key select still works
5. Asset place cancel on nav select; Escape deselect

## Next-slice read list (DO NOT re-scan)

Slice 7 reads ONLY:

- This hand-off — public API of `EditorSelectionActions` + `EditorSelectionStore` + session tree arrays
- `apps/museum/src/lib/editor/store/selection-actions.svelte.ts` — orchestration surface panels will call
- `apps/museum/src/lib/editor/store/selection-store.svelte.ts` — workspace/navigation shape for panel props
- `docs/refactor-audit/2026-07-28-museum-editor.md` §4.A / §4.B — target panel splits
- `apps/museum/src/lib/editor/EditorSelection.svelte` — once, summarize (~30 lines notes)
- `apps/museum/src/lib/editor/EditorCameraTree.svelte` — once

DO NOT re-read god-file `selectX` bodies (gone). DO NOT re-scan Slice 5 bind inventory.

## Type-signature changes visible to the next slice

```ts
store.selectionActions.selectPlacement(id: string): boolean
store.selectionActions.selectPlacementFromTree(id, options?): boolean
store.selectionActions.selectClusterFromTree(id, options?): boolean
store.selectionActions.selectRoom(id: MuseumRoomId): boolean
store.selectionActions.selectNavigationNode(id: string): boolean
store.selectionActions.selectCameraConnectionDirection(id, direction, options?): boolean
store.selectionActions.deselect(): boolean
// …full set on EditorSelectionActions

store.selection.workspace / .navigation / .discoveryConnectionId / .discoveryDirection
store.selection.expandRoom / expandCluster / expandCameraConnection / expandCameraDirection

store.treeExpandedRoomIds // → session
store.treeExpandedClusterIds
store.treeExpandedCameraConnectionIds
store.treeExpandedCameraDirectionKeys // keys: `${connectionId}::${direction}`
```

## Known gotchas

- Run vitest **from `apps/museum`** (Svelte plugin). Root cwd → `$state is not defined` on `.svelte.ts`.
- Direction tree keys are `::`, not `CAMERA_HELPER_KEY_SEPARATOR` (`:`). Helper keys for 3D picks stay `:`.
- Host interface is thick (timeline sync, focus, guards) — panels should call `selectionActions`, not re-implement triad.
- Legacy derived getters (`selectedPlacementIds`, `navigationSelection`, …) still on god for reads; authoritative write path is `selection` / `selectionActions`.
- No Slice 4 hand-off existed; Slice 4 behaviour inferred from selection-store + Slice 5 HO.

## Open questions for next slice

- Whether panel split props take `selectionActions` wholesale vs thin callbacks (`onSelectPlacement`, …) — audit §4.A prefers callbacks; wire to `selectionActions` underneath.
- Optional later: collapse `session` / `sessionView` naming (carried from Slice 5).
- More micro-tests could still be lifted from `museum-editor.test.ts` into `selection-actions.test.ts` (not blocking).
