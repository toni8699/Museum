# Final Handoff — Phase 2.4 Camera-Key Progress Drag

## Status

- **Slice:** Phase 2.4 — timeline and 3D camera-key progress drag.
- **Result:** Complete through automated, build, and production-isolation acceptance.
- **Schema:** Unchanged v3. No scene JSON, topology, guided order, timing, target, FOV, or connection-anchor changes.
- **Commit:** None created.

## Delivered

- Added the store command family `beginViewKeyframeProgressDrag`, `updateViewKeyframeProgressDrag`, `commitViewKeyframeProgressDrag`, and `cancelViewKeyframeProgressDrag` around one cancel-safe document transaction.
- Timeline camera-key diamonds now support pointer-captured horizontal drag across their exact guided edge span.
- Added the inverse timeline mapping from global ruler progress to persisted directional edge progress through the existing shared motion conversions.
- 3D derived-eye markers now drag on a stable camera-facing plane, then project the world hit onto the exact shared directional connection curve with the existing nearest-progress refinement.
- Target handles are tagged separately and take precedence over overlapping eye markers, preserving target-gizmo interaction.
- Progress clamps strictly inside `(0, 1)` and rejects collisions with another key in the same directional track.
- Every live update refreshes the paused Director route at the moved key, keeping the playhead, target, and FOV sample synchronized.
- Orbit and TransformControls release ownership during timeline or 3D key dragging.
- Pointer up after real movement creates one history entry. Escape, pointer cancel, capture loss, blur, workspace switch, preview Stop, teardown, endpoint return, and no-op restore the original progress and create none.
- Stable key ID, camera target, FOV, connection path/anchors, topology, and opposite-direction framing track remain unchanged.

## Files Changed

- `apps/museum/src/lib/editor/museum-editor.svelte.ts`
- `apps/museum/src/lib/editor/editor-camera-timeline.ts`
- `apps/museum/src/lib/editor/EditorCameraTimelinePanel.svelte`
- `apps/museum/src/lib/editor/EditorCameraViewHelpers.svelte`
- `apps/museum/src/lib/editor/EditorSelection.svelte`
- `apps/museum/src/lib/editor/EditorTransformControls.svelte`
- `apps/museum/src/lib/editor/EditorViewport.svelte`
- Focused timeline, selection, and store tests.
- This handoff, `CURRENT.md`, the release index, and the camera/layout guide.

## Verification

- Focused timeline/selection/store suite: 3 files / 124 tests passed.
- Full suite: 21 files / 337 tests passed.
- `npm run check`: 0 errors and 0 warnings.
- `npm run build`: passed.
- `git diff --check`: clean.
- Production smoke: `/museum` = 200; `/dev/museum-editor` = 404.
- Production visitor output contains no progress-drag store APIs or editor drag status strings.

## Browser Acceptance

- The local editor server started successfully.
- Interactive pointer acceptance could not run because the in-app browser runtime exposed no browser instances in this session.
- Manual follow-up: import a v3 document with directional view keys; drag forward/reverse keys in the timeline and 3D; verify the path does not bend; cancel with Escape, pointer cancel/capture loss, blur, and workspace switch; confirm target-handle overlap still manipulates framing rather than progress.

## Release Boundary

- Phase 2 camera editing MVP is complete.
- Phase 3 may add graph authoring, guided-order editing, framing handles, and later timing only in its planned order. Do not fold schema v4 timing into initial graph commands.
