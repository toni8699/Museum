# Slice 9.4 hand-off — EditorCameraTimelineController

**Status:** COMPLETE
**Date:** 2026-08-01
**Branch:** main
**Last commit:** no commit (user decides)

## What landed

[`store/camera-timeline-controller.svelte.ts`](../../apps/museum/src/lib/editor/store/camera-timeline-controller.svelte.ts) (**567 LOC**) — `EditorCameraTimelineController` + `EditorCameraTimelineControllerHost`.

Moved bodies: `getCameraTimeline`, seek/step/select timeline, edge reverse/travel, `read`/`sync*`/`show*` helpers, private seek/travel/cue helpers, and local `EditorCameraTimelineCue`.

Facade methods are thin delegates. Preview start/play/pause/stop/complete remain on the facade and call `cameraTimelineController.sync*` / `readCameraTimeline` / `show*`. Selection, nav-mutator, and view-keyframe hosts retarget timeline hooks to the new controller.

## Test results

- From `apps/museum`: `npm test -- src/lib/editor` → **409 passed / 26 files**
  - Prefer `npm test -- …` (workspace script picks `vitest.config.ts`). Bare `npx vitest` from repo root misses `$lib` / Svelte plugin.
- `npm run check` → **0 errors / 0 warnings**
- Svelte autofixer on the new `.svelte.ts`: no actionable suggestions (tool reported an internal parse noop)

## LOC delta

| File | Change |
|------|--------|
| `museum-editor.svelte.ts` | **−252 net** (164 insertions / 416 deletions) |
| `camera-timeline-controller.svelte.ts` | **+567** (new) |

## Next-slice read list (9.5)

Placement/cluster mutator + leftovers. Read ONLY:

- This HO + 9.1–9.4 HOs
- Remaining mutation bodies on `museum-editor.svelte.ts` (placement create/transform/copy, cluster CRUD/membership, asset placement, drop-to-floor, any leftover document writes not already on nav/view-key/timeline controllers)
- Host patterns: `navigation-graph-mutator.svelte.ts` + `camera-timeline-controller.svelte.ts`
- Do NOT re-read timeline seek/select/show bodies (moved)

## Gotchas

- `cameraTimelinePlayhead` still facade `$state` — host get/set only.
- Preview start / play / pause / stop / complete stay on the facade (selection side-effects); only timeline sync after install moved to controller calls.
- `selectCameraTimelineViewKeyframe` now lives on the timeline controller; view-keyframe host calls it via `self.cameraTimelineController.*` (no longer the facade public method body).
- Progress-drag (9.3) still builds paused connection previews via view-key host `allocPreviewRunId` / `setCapturedPreviewRoute` / `setCameraPreview` — not the timeline controller's `showCameraTimelineConnectionPose`. Keep those paths distinct.
- `#prepareCameraPreview` stays private on the facade; exposed to the timeline host as `prepareCameraPreview()`.
- Silent focus clear uses `session.clearCameraFocusRequest()` via host (no version bump) — do not use `clearCameraFocus`.
