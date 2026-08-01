# Interim Handoff — Phase 2.2 Timeline Selection and Scrub

## Status

- **Slice:** Phase 2.2 — global guided timeline selection and exact scrub.
- **Result:** Complete through automated acceptance.
- **Schema:** Unchanged v3. No scene JSON, topology, guided order, authored timing, dirty-baseline, or history changes.
- **Commit:** None created.

## Delivered

- Added `EditorCameraTimelinePanel.svelte` with the two product lanes:
  - `Guided Route` — exact oriented connection spans plus every guided node boundary, including the final return to `entrance-start`.
  - `Camera Framing` — one visible directional framing track per edge; the active connection uses its persistent Forward/Reverse direction.
- Added a session-only global playhead and time display derived from current shared connection-motion durations.
- Node diamonds, edge spans, key diamonds, the scrubber, and Previous/Next all select and seek exact authored/shared-motion samples.
- Timeline and 3D camera-key selection now enter the same exact timeline/key selection path as the Camera tree.
- Observer / Through Camera mode switching preserves the global playhead and existing observer pose behavior.
- Stop preserves the global playhead, selected connection direction, and selected camera key.
- `+ Camera Key` remains the existing paused-observer authoring command and uses the selected exact edge playhead.
- The corrective Phase 2.1 sidebar contract is preserved: Camera workspace still has no `[ All ]` filter.

## Shared-Motion Boundary

- `editor-camera-timeline.ts` is an index over the resolved navigation graph.
- Every edge obtains geometry and directional view data from `getCameraConnectionRoute()`.
- Every duration, progress conversion, and camera sample uses `camera-motion.ts`.
- No alternate route builder, curve compiler, camera sampler, persisted position, or timing field was added.
- The timeline sequences current exact edge motions only. The shared `getGuidedCameraRoute()` API and whole-cycle playback remain Phase 2.3.

## Store APIs

Added session-only state:

```ts
cameraTimelinePlayhead: number
```

Added methods:

```ts
getCameraTimeline()
seekCameraTimeline(progress)
selectCameraTimelineEdge(connectionId, direction, progress)
selectCameraTimelineNode(nodeId, boundaryIndex)
selectCameraTimelineViewKeyframe(connectionId, direction, keyframeId)
stepCameraTimeline(direction)
```

The timeline index is cached by resolved graph identity so frame-by-frame preview synchronization does not rebuild curves.

## Files Changed

- `apps/museum/src/lib/editor/editor-camera-timeline.ts` (new)
- `apps/museum/src/lib/editor/editor-camera-timeline.test.ts` (new)
- `apps/museum/src/lib/editor/EditorCameraTimelinePanel.svelte` (new)
- `apps/museum/src/lib/editor/EditorCameraTimelineFrame.svelte`
- `apps/museum/src/lib/editor/EditorCameraPreviewControls.svelte`
- `apps/museum/src/lib/editor/EditorCameraTree.svelte`
- `apps/museum/src/lib/editor/EditorSelection.svelte`
- `apps/museum/src/lib/editor/museum-editor.svelte.ts`
- Focused editor/store shell tests
- This handoff and `CURRENT.md`

## Verification

- Focused timeline/store/shell suite: 3 files / 116 tests passed.
- Full suite: 21 files / 320 tests passed.
- `npm run check`: 0 errors and 0 warnings.
- `npm run build`: passed.
- `git diff --check`: clean.
- Build retained only the known third-party unused-import, large-chunk, adapter-auto, and npm forwarding notices.

## Browser Acceptance

The local editor server started successfully at `/dev/museum-editor`, but the in-app browser runtime reported no available browser sessions. Interactive acceptance could not be completed in this run.

Manual follow-up:

1. Enter Camera workspace and confirm the open timeline shows eight guided spans and the return boundary.
2. Click/scrub node diamonds, edge spans, and camera keys; confirm exact observer pose updates.
3. Select a Reverse key from the tree and confirm the framing lane switches to Reverse for that connection.
4. Use Previous/Next across keys and node joins.
5. Switch Observer ↔ Through Camera and back; confirm playhead and observer pose persist.
6. Stop and reselect the same key from tree, timeline, and 3D.

## Out of Scope / Next Slice

- No whole-guided-tour route or playback (`Preview Tour`) — Phase 2.3.
- No timeline or 3D camera-key progress drag — Phase 2.4.
- No topology, guided-order, timing-schema, framing-handle, entity, or texture changes.

**Exact next slice:** Phase 2.3 — add `getGuidedCameraRoute()` and whole-cycle playback, then bind Play/Preview Tour to that one shared route.
