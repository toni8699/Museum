# Final Handoff — Phase 3.5 Timeline Drag-Connect

## Status

- **Slice:** Phase 3.5 — timeline drag-to-connect plus one missing straight-edge exception.
- **Result:** Complete through automated, build, HTTP, production-isolation, and rendered-browser acceptance.
- **Schema:** Unchanged v3. No scene JSON, framing-handle, timing, or visitor behavior changes.
- **Commit:** None created.

## Delivered

- Guided Route node boundaries are draggable except the pinned `entrance-start` boundary.
- Camera-tree free/guided node drags share a typed camera-node payload with the timeline.
- Every directed guided edge is a visible drop gap. Dropping an existing node proposes the final reciprocal cycle around that exact gap.
- Added pure planning for free-node insertion and guided-node movement, including wrap-gap handling, pinned-start protection, self-drop/invalid-gap rejection, connected-input validation, and a strict one-missing-edge cap.
- A valid drop may create exactly one symmetric connection with default `0.35` clearance, empty interiors, and `auto-bezier`; two or more missing final-cycle edges reject without mutation.
- Optional connection creation and the complete guided-link rewrite commit in one document transaction and one undo entry.
- Existing list/API reorder and insertion stay strict and never auto-create edges.
- Success selects the new/existing oriented connection, expands its path tools, and seeks its paused Director start pose for fine-tuning.
- Active interaction, active/Visitor playback, document transactions, and pending camera commands block timeline drag-connect.

## Files Changed

- `apps/museum/src/lib/editor/editor-navigation-graph.ts`
- `apps/museum/src/lib/editor/editor-navigation-graph.test.ts`
- `apps/museum/src/lib/editor/museum-editor.svelte.ts`
- `apps/museum/src/lib/editor/museum-editor.test.ts`
- `apps/museum/src/lib/editor/EditorCameraTimelinePanel.svelte`
- `apps/museum/src/lib/editor/EditorCameraTree.svelte`
- Agent/release/camera-layout documentation.

## Verification

- Focused graph/store suite: 2 files / 140 tests passed.
- Full suite: 22 files / 376 tests passed.
- `npm run check`: 0 errors and 0 warnings.
- `npm run build`: passed.
- `git diff --check`: clean.
- Production `/museum` = 200; `/dev/museum-editor` = 404.
- Production visitor output contains no Phase 3.5 command, validation, or timeline-drop symbols.
- Browser rendered draggable node boundaries, edge drop targets, blocking states, and no console warnings/errors. Browser backend did not synthesize native HTML5 drop, so mutation/undo acceptance is covered by pure/store tests and remains a manual pointer follow-up.

## Browser Follow-Up

1. Add one bridge so a guided-node move needs only one new final-cycle edge.
2. Drag its timeline diamond onto another guided edge; confirm one straight path appears, order changes, connection selects, and one Undo restores both.
3. Drag a free-node chip with one neighbor edge onto the matching timeline gap; confirm the same result.
4. Try a self-drop and a drop needing two edges; confirm exact status and no partial write.

## Release Boundary

- Phase 3.5 is complete.
- **Exact next slice:** Phase 3.6 — finite frustum, direct aim/FOV handles, and paused Through-Camera editing.
- Do not pull schema v4 timing into Phase 3.6.
