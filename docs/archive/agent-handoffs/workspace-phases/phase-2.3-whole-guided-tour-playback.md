# Interim Handoff — Phase 2.3 Whole Guided-Tour Playback

## Status

- **Slice:** Phase 2.3 — whole-guided-tour route and playback.
- **Result:** Complete through automated acceptance.
- **Schema:** Unchanged v3. No scene JSON, topology, guided order, authored timing, dirty-baseline, or history changes.
- **Commit:** None created.

## Delivered

- Added `getGuidedCameraRoute(startNodeId, graph)` beside the existing route assembly.
  - Follows reciprocal `nextNodeId` links exactly once.
  - Includes the final connection returning to the requested start.
  - Preserves exact connection IDs and traversal directions.
  - Rejects free-only starts, broken reciprocity, incomplete cycles, and missing direct guided edges without falling back to BFS.
- Refactored the editor timeline to obtain its edge/node order from the shared guided route instead of walking guided topology independently.
- Added `kind: 'tour'` to the editor preview state and `previewGuidedTour()` to the store.
- Bound the Camera-workspace top-bar `Preview Tour` action and the timeline Play/Pause control to the shared guided timeline.
- Whole-tour playback advances the global ruler across the timeline's existing exact per-connection `CameraMotion` objects. It never compiles a second route-wide camera curve.
- Tour playhead updates stay synchronized with the global timeline, including pause, resume, completion, Observer / Through Camera switching, replay, and Stop.
- Reduced motion immediately samples the final exact-edge pose and completes through the existing preview completion path.
- The editor and `/museum` now sample the same connection paths, look tracks, FOV tracks, easing, and durations. Departure, Paris, and Workshop therefore retain the live camera's stops, turns, and backtracking before the next edge begins.

## Files Changed

- `apps/museum/src/lib/museum/navigation/camera-route.ts`
- `apps/museum/src/lib/museum/navigation/camera-route.test.ts`
- `apps/museum/src/lib/editor/editor-camera-timeline.ts`
- `apps/museum/src/lib/editor/editor-camera-timeline.test.ts`
- `apps/museum/src/lib/editor/museum-editor.svelte.ts`
- `apps/museum/src/lib/editor/museum-editor.test.ts`
- `apps/museum/src/lib/editor/EditorCameraRig.svelte`
- `apps/museum/src/lib/editor/EditorCameraTimelinePanel.svelte`
- `apps/museum/src/lib/editor/EditorCameraPreviewControls.svelte`
- `apps/museum/src/lib/editor/EditorAppBar.svelte`
- This handoff, `CURRENT.md`, and the release index.

## Verification

- Focused route/timeline/store suite: 3 files / 141 tests passed.
- Full suite: 21 files / 331 tests passed.
- `npm run check`: 0 errors and 0 warnings.
- `npm run build`: passed.
- `git diff --check`: clean.
- Production smoke: `/museum` = 200; `/dev/museum-editor` = 404.
- Production visitor output contains no `Preview Tour`, `previewGuidedTour`, `MuseumEditorStore`, or guided-route editor status strings.
- Build retained only the known third-party unused-import, large-chunk, adapter-auto, and npm forwarding notices.

## Browser Acceptance

- In-app browser inspection compared the live Departure/Paris checkpoints and the live Paris → Workshop turn/backtrack with Through Camera tour playback in the editor.
- The editor now lands on the authored Paris pose, then turns/backtracks along the same outgoing connection instead of continuing a route-wide curve and flipping at a checkpoint.
- Automated parity coverage also compares position, target, and FOV samples from every editor timeline edge against the exact `CameraDirector`-style visitor motion construction.

## Out of Scope / Next Slice

- No timeline or 3D camera-key progress drag — Phase 2.4.
- No topology, guided-order, timing-schema, framing-handle, entity, or texture changes.

**Exact next slice:** Phase 2.4 — camera-key progress drag in the timeline and along the exact shared 3D connection curve.
