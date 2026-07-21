# Interim Handoff — Museum Editor Phase 1, Slice 1.3

## Status

- **Slice:** 1.3 — viewport toolbar and bottom timeline frame.
- **Result:** Implemented; automated checks pass.
- **Phase status:** Phase 1 remains in progress. Slice 1.4 owns responsive layout, browser acceptance, and the final Phase 1 handoff.
- **Scene/runtime data:** unchanged. No schema, scene JSON, camera route/motion, graph, or visitor-runtime behavior was edited.
- **Commit:** none created.

## Delivered

- Added `EditorViewportToolbar.svelte` as a compact viewport overlay.
- Moved Select, Move, Rotate, and Scale tool selection out of the transform inspector.
- Added session-only placement Local/World orientation and active translate/rotate snap toggling.
- Kept navigation-node, anchor, and view-target helpers constrained to their existing unsnapped world-space Move behavior.
- Moved Add Connected Camera into the toolbar Add menu without exposing unsupported primitives, lights, or unrestricted cameras.
- Replaced the placeholder bottom frame with a collapsible panel that is pointer- and keyboard-resizable from 220–360 px and remains 36 px when collapsed.
- Moved the active `EditorCameraPreviewControls` transport from the inspector into the bottom panel without changing command arguments or playback semantics.
- Made every successful selected-camera preview open the bottom panel before transport interaction can become modal.
- Kept the open/height/tool/space state session-only and outside canonical JSON, dirty comparison, and undo history.
- Added focused store tests for the new session state and preview auto-open behavior.

## Verification

- `npm run check` — 0 errors, 0 warnings.
- `npm test -- --run` — 20 files / 292 tests passed.
- `npm run build` — passed.
- `git diff --check` — passed.
- Development route SSR contains the new toolbar and collapsed timeline frame.
- Production output search found none of the new editor-only toolbar/timeline labels.

The build retains the existing third-party unused-import, large-chunk, adapter-auto, and npm CLI forwarding notices.

## Manual Acceptance Remaining

The in-app browser backend was unavailable in this session, so visual/pointer acceptance remains for Slice 1.4:

- Confirm the toolbar does not obscure important viewport content at desktop and narrow widths.
- Exercise Select/Move/Rotate/Scale, Local/World, and mode-specific Snap on real placements.
- Confirm camera helpers visibly stay Move-only, world-space, and unsnapped.
- Open the Add menu with and without a selected camera node; complete and cancel connected-camera placement.
- Switch Scene/Camera repeatedly and confirm Camera auto-opens the panel without losing selection/history.
- Drag and keyboard-resize the panel to both clamps, then collapse/reopen it.
- Run node, transition, and bidirectional connection previews in Director and Visitor modes; exercise every moved transport control.

## Next Slice Boundary

Slice 1.4 should address responsive/non-overlapping layout, run full browser acceptance, fix only Phase 1 layout regressions, and produce the final Phase 1 handoff. Do not pull Phase 2 tracks, rulers, camera-key rendering, scrubbing semantics, or whole-tour preview forward.
