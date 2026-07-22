# Final Handoff — Phase 3.2 Any-Room Camera Placement

## Status

- **Slice:** Phase 3.2 — any-room pending camera node and atomic first connection.
- **Result:** Complete through automated, build, development-route, and production-isolation acceptance.
- **Schema:** Unchanged v3. No scene JSON, guided-order, deletion, timing, framing-handle, or path-schema changes.
- **Commit:** None created.

## Delivered

- Add → Camera no longer requires a selected source node or Paris room.
- Floor picking accepts any placeable floor with valid `editorSurface.roomId` metadata and returns the hit plus inferred museum room.
- Floor click creates only a session draft. The canonical document, dirty state, and history remain untouched while it is pending.
- Pending camera defaults remain eye `1.65 m`, target `1.25 m`, horizontal target distance `3 m`, FOV `54`, and connection clearance `0.35 m`.
- Pending eye/target stay yaw-aware and room-local. Inspector numeric fields and existing TransformControls adjust eye/target/FOV/label without history.
- Existing camera nodes stay pickable in viewport and Camera Tour while the draft ghost is active.
- Choosing one existing node commits the draft node, symmetric adjacency, and one zero-interior-anchor `auto-bezier` connection in one history entry.
- Escape, inspector Cancel, workspace change, and Undo during placement discard the draft and restore prior selection without document mutation.
- The document never contains a disconnected pending node.

## Files Changed

- `apps/museum/src/lib/editor/museum-editor.svelte.ts`
- `apps/museum/src/lib/editor/editor-placement.ts`
- `apps/museum/src/lib/editor/EditorSelection.svelte`
- `apps/museum/src/lib/editor/EditorCameraHelpers.svelte`
- `apps/museum/src/lib/editor/EditorTransformControls.svelte`
- `apps/museum/src/lib/editor/EditorCameraInspector.svelte`
- `apps/museum/src/lib/editor/EditorInspector.svelte`
- `apps/museum/src/lib/editor/EditorViewport.svelte`
- `apps/museum/src/lib/editor/EditorViewportToolbar.svelte`
- Focused placement, store, and shell tests.
- This handoff, `CURRENT.md`, release index, and camera/layout guide.

## Verification

- Focused placement/store/shell suite: 3 files / 146 tests passed.
- Full suite: 21 files / 345 tests passed.
- `npm run check`: 0 errors and 0 warnings.
- `npm run build`: passed.
- `git diff --check`: clean.
- Development `/dev/museum-editor` = 200.
- Production `/museum` = 200; `/dev/museum-editor` = 404.
- Production visitor output contains no pending-camera store/UI symbols.

## Browser Acceptance

- Browser-control runtime exposed no browser instances, so interactive floor clicks and gizmo drags could not run in this session.
- Manual follow-up: Add → Camera on every room floor, adjust both handles and FOV, connect through viewport/tree, Undo once, then repeat and cancel with Escape/workspace switch.

## Release Boundary

- Phase 3.2 is complete.
- **Exact next slice:** Phase 3.3 — standalone Connect command plus guarded node/connection deletion.
- Do not pull guided-order, timeline drag-connect, framing handles, or timing schema into Phase 3.3.
