# Interim Handoff — Remove Camera Workspace All Tab

## Status

- **Slice:** Corrective follow-on to Phase 2.1 — remove `[ All ] [ Cameras ]` sidebar filter.
- **Result:** Camera workspace always mounts `EditorCameraTree`. Scene objects stay pickable in the viewport only.
- **Schema:** Unchanged. No JSON, history, or dirty-baseline changes.
- **Commit:** None created. Preserve existing uncommitted Phase 2.1 worktree.

## Files Changed

- `apps/museum/src/lib/editor/EditorLeftSidebar.svelte`
- `apps/museum/src/lib/editor/museum-editor.svelte.ts`
- `apps/museum/src/lib/editor/museum-editor.test.ts`
- `docs/agent-handoffs/phase-2.1-persistent-camera-discovery.md`
- `docs/agent-handoffs/CURRENT.md`
- `docs/plans/museum-editor-workspace/README-museum-editor.md`
- This handoff

## Final Component Ownership

- `EditorLeftSidebar.svelte` branches only on `store.currentWorkspace`.
- Scene: Scene/Assets tabs → `EditorSceneTree` or `EditorAssetLibrary`.
- Camera: `Camera Tour` header + `EditorCameraTree` only (no filter tabs, no Scene tree remount).

## Store APIs Removed

- `EditorCameraTreeFilter`
- `cameraTreeFilter`
- `setCameraTreeFilter()`

All other Phase 2.1 session APIs remain (`activeCameraConnectionId`, `activeCameraDirection`, tree expansion, `isCameraKeyHelpersActive`, connection/key selection).

## Selection/Focus Preserved

- Selection never auto-switches workspace.
- Scene `leftPanel` memory across workspace switches unchanged.
- Viewport placement/cluster picking in Camera workspace unchanged.
- Camera tree Guided Tour / Free Nodes / Connections / keys unchanged.

## Tests and Commands

- Removed filter session-only test; default case no longer asserts `cameraTreeFilter`.
- Targeted: `museum-editor.test.ts` + `museum-editor-shell.test.ts` — 2 files / 107 tests passed.
- `npm test` — 20 files / 311 tests passed.
- `npm run check` — 0 errors, 0 warnings.
- `npm run build` — passed.
- `git diff --check` — clean.
- No leftover `cameraTreeFilter` / `setCameraTreeFilter` / `EditorCameraTreeFilter` in app source.

## Manual Acceptance

- Code path: Camera branch in `EditorLeftSidebar` renders only `Camera Tour` + `EditorCameraTree` (no All/Cameras tablist, no Scene-tree remount).
- Scene branch unchanged (Scene/Assets tabs).
- Interactive browser pass left for user confirmation in `/dev/museum-editor`: Camera workspace has no All tab; viewport scene picking still works.

## Known Gaps

- No Camera/Object selection-scope toggle (deferred product slice).
- Timeline content / scrub remains Phase 2.2.
- Interactive browser acceptance of the All-tab absence not instrumented in this agent run (code + tests + build gate only).

## Exact Next-Slice Recommendation

Phase 2.2 — Timeline selection and scrub (`EditorCameraTimelinePanel.svelte`). No `cameraTreeFilter` wiring.

## Verification

- Targeted editor tests: 107 passed.
- Full suite: 311 passed.
- Check + production build: clean.
- Whitespace check: clean.
