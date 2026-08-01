# Slice 9.3 hand-off — EditorViewKeyframeController

**Status:** COMPLETE
**Date:** 2026-07-31
**Branch:** main
**Last commit:** no commit (user decides)

## What landed

[`store/view-keyframe-controller.svelte.ts`](../../apps/museum/src/lib/editor/store/view-keyframe-controller.svelte.ts) (~823 LOC) — add/update/commit/delete keys, progress-drag FSM, copy track, finish editing, `setViewKeyframeTiming`, `canAddViewKeyframeAtPlayhead`.

Facade thin delegates. Framing vs document tx semantics preserved.

## Test results

- editor vitest: **409 passed** (run with `--root apps/museum` or from apps/museum cwd)
- `npm run check`: 0 errors / 0 warnings

## Next-slice read list (9.4)

- This HO + 9.2/9.1
- Timeline methods on facade: `getCameraTimeline`, seek/step/select, `#syncCameraTimeline*`, `#showCameraTimeline*`, edge reverse/travel
- Preview start orchestration that only syncs timeline after `previewController.start*`
- `EditorSelectionActionsHost` timeline methods — retarget to new controller
- Do NOT re-read view-key bodies

## Gotchas

- `selectCameraTimelineViewKeyframe` still on store; view-key controller calls via host.
- `cameraTimelinePlayhead` still facade `$state`.
- Progress-drag builds paused connection preview via host alloc/set — reconcile with 9.4 preview orchestration.
- Verify from `apps/museum` cwd so vitest picks Svelte config.
