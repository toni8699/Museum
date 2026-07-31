# Slice 3 hand-off — DocumentStore + CameraPreviewController + HistoryController

**Status:** COMPLETE
**Date:** 2026-07-31
**Branch:** main
**Last commit:** no commit required for this close-out (user decides). Prior Slice 3 work may already be on HEAD.

## What landed

Document, history, and camera-preview ownership moved into three sub-stores behind Option 3 facades on `MuseumEditorStore`. Peer-link (History ← Preview `transportState`) is wired. After-replace listeners reconcile selection, refresh paused Director (status-on-fail, preview kept), prune stale previews, and invalidate graph/timeline caches. Timeline **cache** lives on the preview controller; scrub orchestration stays on the composition root. Close-out deleted dead `#refreshPausedDirectorPreview` and restored pre-slice refresh failure UX.

## Files added / modified

- `apps/museum/src/lib/editor/store/document-store.svelte.ts` — document / validation / baseline / scene / state + `replace` + afterReplace
- `apps/museum/src/lib/editor/store/camera-preview-controller.svelte.ts` — preview FSM + `getTimeline` + `refreshPausedDirector(): Error | null`
- `apps/museum/src/lib/editor/store/history-controller.svelte.ts` — tx / undo / redo / peer-link; `HistoryCommitResult.error`
- `apps/museum/src/lib/editor/store/*-{document,history,camera-preview}*.test.ts` — sub-store coverage
- `apps/museum/src/lib/editor/museum-editor.svelte.ts` — composition root facades + listeners; dead refresh helper removed
- `docs/refactor-audit/2026-07-28-refactor-plan.md` — Slice 3 marked COMPLETE; Slice 1 debt → 3.11–3.13

## Public surface diff

Public `MuseumEditorStore` method names unchanged (tests/components untouched). Internal ownership:

| Facade (unchanged call sites) | Owns |
|---|---|
| `document` / `scene` / `state` / `validation` / `isDirty` / … | `documentStore` |
| `cameraPreview*` / preview FSM methods | `previewController` |
| `historyVersion` / begin/commit/cancel/undo/redo | `historyController` (rich `canUndo` stays on root) |

Transitional (delete when scrub fully leaves root): `allocRunId`, `setCapturedRoute`, `clearCapturedRoute` on preview controller.

## Test results

- `npx vitest run src/lib/editor/store/ src/lib/editor/museum-editor.test.ts` → **203 passed / 0 failed**
- `npm run check` → **0 errors / 0 warnings**
- God-file LOC ≈ **4572** (Option 3; ownership moved, facade thick)

## Next-slice read list (DO NOT re-scan)

Slice 4 reads ONLY:

- This hand-off (Facade-mirrored fields + Slice 1 debt + peer-link)
- `docs/refactor-audit/2026-07-28-museum-editor.md` — §3.D only (selection parallel-tuple)
- `docs/refactor-audit/2026-07-28-refactor-plan.md` — Slice 4 + Slice 3 §Slice 1 debt (3.11–3.13)
- `apps/museum/src/lib/editor/editor-selection.ts` — type vocabulary
- `apps/museum/src/lib/editor/museum-editor.svelte.ts` — selection fields + `selectX` methods (plan line anchors; line numbers drifted)
- `apps/museum/src/lib/editor/store/document-store.svelte.ts` — `addAfterReplaceListener` (Slice 4 adds `selection.reconcile`)
- `apps/museum/src/lib/editor/museum-editor.test.ts` — selection-related describes only

Do **not** re-read preview/history controller bodies unless a selection test fails on undo/preview interaction.

## Type-signature changes visible to the next slice

- `EditorDocumentStore.addAfterReplaceListener(fn) → unsubscribe`
- `EditorHistoryController.commit(next) → { changed, type, error }` — facade adapts to boolean + `setStatusMessage`
- `EditorCameraPreviewController.refreshPausedDirector() → Error | null` — keep preview on fail; root posts status
- `EditorCameraPreviewController.getTimeline()` — graph-identity cache
- Field names: `documentStore` / `previewController` / `historyController` (not plan-literal `document` / `preview` / `history`)

## Facade-mirrored fields

Composition root still exposes these for Phase A / Slice 5 `bind:`:

- `cameraTimelinePlayhead` — `$state` on root (bind: until Slice 5); not owned by preview controller
- `cameraPreview` / `cameraPreviewFollowEnabled` / `cameraPreviewRecenterVersion` — getters(/setters) over `previewController`
- `get isCameraPreviewActive` / `isDirectorCameraPreview` / `isVisitorCameraPreview` / `isCameraPreviewPlaying` / `isCameraPreviewPaused` — read `previewController.preview`
- `historyVersion` — getter over `historyController.version`
- `get canUndo` / `get canRedo` — **rich** composition-root predicates (interaction + transport !== paused + pending nav + stack depth). History’s narrow `canUndo` (playing-only peer-link) is for sub-store tests — do **not** wholesale-replace the facade.
- Peer-link: History ctor takes Preview; `history.canUndo` reads `preview.transportState !== 'playing'`. Facade layers additional gates on top.

Session slots still on the god file (Slice 1 debt 3.13) are also Phase A mirrors once migrated — see below.

## Known gotchas

- **§3.7 scrub deferred (accepted):** `seekCameraTimeline` / `selectCameraTimeline*` / `stepCameraTimeline` / `#show*` / `#sync*` stay on root (selection + playhead coupled). Only timeline **cache** moved.
- **Field-level mutations never fire `afterReplace`.** Only `documentStore.replace()` does. View-keyframe / placement field writes that need preview refresh must call preview APIs explicitly (or go through `replace`).
- **`cloneMuseumSceneDocument` + `EditorCameraPreview*` types duplicated** until 3.11 / Slice 6 barrel.
- **Sub-store `isDirty` ≠ facade `isDirty`.** Facade keeps `!validation.success || …`; sub-store compares canonical JSON only.
- **Double prune on undo/redo:** history calls `pruneIfStale` after replace; afterReplace also prunes; facade `#pruneInvalidCameraPreview` adds stricter connection checks. Harmless; don’t “fix” without care.
- **Option 3 naming is intentional** — do not rename `documentStore` → `document` without a consumer migration pass.

## Slice 1 debt (plan 3.11–3.13) — finish before Slice 5

Not blocking Slice 4 start. Owned here so it is not lost:

1. **3.11** `museum-editor.types.ts` — extract god-file exported types; collapse preview type redeclarations.
2. **3.12** `helpers/validators-runner.ts` + `runOrFail` — fix generic to match real validator unions; adopt at remaining status-message sites.
3. **3.13** Remaining `EditorSessionState` slots (~14) + Phase A mirrors + expand session tests.

## Open questions for next slice

- Slice 4: register `selection.reconcile` on `afterReplace` **after** the existing reconcile listener order decision (today root `#reconcileSelection` already runs first — fold or replace carefully).
- Whether 3.11–3.13 land as Slice 3.b before Slice 4 or as Slice 4 prep — either is fine; **must** land before Slice 5.
- Do not assume field-level mutations notify listeners.
