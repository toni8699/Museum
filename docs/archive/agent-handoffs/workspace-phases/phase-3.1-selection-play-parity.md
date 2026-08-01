# Final Handoff — Phase 3.1 Selection and Play Parity

## Status

- **Slice:** Phase 3.1 — selection seeks preview + movie-editor Play.
- **Result:** Complete through automated, build, and production-isolation acceptance.
- **Schema:** Unchanged v3. No scene JSON, topology, guided order, timing, target, FOV, or path changes.
- **Commit:** None created.

## Delivered

- Camera-workspace node selection from the tree or viewport now synchronizes the global timeline and enters its paused Director pose.
- Camera-workspace connection and Forward/Reverse selection now synchronizes to the directed edge start and enters paused Director preview.
- Timeline node, edge, and key selection keeps exact seeking while hard-recentering only when node identity or connection/direction identity changes.
- Re-clicking the same row is a no-op: no new preview run and no observer recenter.
- Paused-preview selection clears stale Orbit focus requests so Stop cannot apply a delayed framing jump.
- Timeline Play, top-bar Preview Tour, and bottom transport Play all call the same whole-guided-tour resume path.
- Primary Play promotes node, connection, or absent preview state to `kind: 'tour'` at the current global playhead instead of resetting to zero.
- Paused tours resume in their current preview mode and position; completed tours restart at zero.
- The primary bottom transport no longer offers **Play selected edge**. Inspector edge Director/Visitor buttons remain for this slice.
- Pause and Stop preserve the existing global playhead and connection-direction selection contracts.

## Files Changed

- `apps/museum/src/lib/editor/museum-editor.svelte.ts`
- `apps/museum/src/lib/editor/EditorCameraTimelinePanel.svelte`
- `apps/museum/src/lib/editor/EditorCameraPreviewControls.svelte`
- `apps/museum/src/lib/editor/EditorAppBar.svelte`
- `apps/museum/src/lib/editor/museum-editor.test.ts`
- This handoff, `CURRENT.md`, the release index, and the camera/layout guide.

## Verification

- Focused store/shell suite: 2 files / 122 tests passed.
- Full suite: 21 files / 340 tests passed.
- `npm run check`: 0 errors and 0 warnings.
- `npm run build`: passed.
- `git diff --check`: clean.
- Production smoke: `/museum` = 200; `/dev/museum-editor` = 404.
- Production visitor output contains no `previewGuidedTour`, `MuseumEditorStore`, or primary camera transport labels.

## Browser Acceptance

- Local development server started successfully.
- Interactive acceptance could not run because the in-app browser runtime exposed no browser instances.
- Manual follow-up: select guided/free nodes and both connection directions from tree/viewport; confirm paused Director pose and one hard recenter per identity change. Scrub mid-tour, press every primary Play entry, then verify whole-tour continuation, pause/resume, and completed replay from zero.

## Release Boundary

- Phase 3.1 is complete.
- **Exact next slice:** Phase 3.2 — any-room pending camera-node placement and atomic first connection.
- Do not pull connect/delete, guided-order, framing-handle, or timing-schema work into Phase 3.2.
