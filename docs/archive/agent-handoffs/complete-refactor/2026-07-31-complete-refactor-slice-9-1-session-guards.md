# Slice 9.1 hand-off — session dual-write collapse + mutation guards

**Status:** COMPLETE
**Date:** 2026-07-31
**Branch:** main
**Last commit:** no commit (user decides)

## What landed

1. **`EditorMutationGuards`** — [`store/mutation-guards.svelte.ts`](../../apps/museum/src/lib/editor/store/mutation-guards.svelte.ts) owns `isDocumentMutationBlocked` / `isCameraFramingMutationBlocked` / `isEditorInteractionActive` / `isDocumentUndoBlocked`. Facade getters delegate. Micro-tests in `mutation-guards.test.ts`.

2. **Session owns the 23 former twin slots.** Facade `$state` deleted for transform/focus/workspace/timeline chrome/pending frame+nav+asset/interaction flags/`viewKeyframeProgressDrag`. Replaced with getters/setters → `EditorSessionState`.

3. **Focus paths** use `session.setCameraFocus` / `clearCameraFocusRequest` (no version bump) / consume uses silent clear. Fixed prior facade-only focus writes.

4. **Dual-write setters removed** (`setWorkspace` / `setLeftPanel` / timeline) — single write via facade setter → session.

## Remaining facade `$state`

- `cameraTimelinePlayhead`
- `hoveredConnectionId` / `hoveredAnchorId`
- Canceler callbacks + pending-nav restore snapshots (private)

## Test results

- `npx vitest run src/lib/editor` → **409 passed / 26 files**
- `npm run check` → **0 errors / 0 warnings**

## Next-slice read list (DO NOT re-scan)

Slice 9.2 reads ONLY:

- This hand-off + Phase 9 plan section
- `museum-editor.svelte.ts` methods: pending nav, guided tour, delete connection/node, `setConnectionTiming`, `setNodeHoldSeconds`
- `store/selection-actions.svelte.ts` (`EditorSelectionActionsHost` pattern)
- `store/mutation-guards.svelte.ts`
- `helpers/validators-runner.ts` + `editor-navigation-graph.ts`

## Known gotchas

- `clearCameraFocusRequest` ≠ `clearCameraFocus` (version bump). Preview pose paths must stay silent.
- `pendingFrame*` must use `session.setPendingFramePlacementIds` / `clearPendingFramePlacementIds` — do not `+=` on facade version getter.
- Option-3 facade: keep public method names; extract bodies only.
