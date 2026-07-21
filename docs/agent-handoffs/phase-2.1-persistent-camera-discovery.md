# Interim Handoff — Phase 2.1 Persistent Camera Discovery

## Status

- **Slice:** Phase 2.1 — Persistent connection direction and camera-key discovery + Camera workspace filter.
- **Result:** Complete after review fixes. `npm run check` clean; `npm test` passes 20 files / 312 tests.
- **Schema:** Unchanged. Scene JSON, history, dirty-baseline, and timing untouched.
- **Commit:** None created.

## Files Changed

- `apps/museum/src/lib/editor/museum-editor.svelte.ts`
- `apps/museum/src/lib/editor/EditorCameraViewHelpers.svelte`
- `apps/museum/src/lib/editor/EditorLeftSidebar.svelte`
- `apps/museum/src/lib/editor/EditorCameraTree.svelte` (full rewrite)
- `apps/museum/src/lib/editor/museum-editor.test.ts`
- This handoff and `docs/agent-handoffs/CURRENT.md`

## Store API Surface

Added session-only fields (no JSON, no history, no dirty baseline):

```ts
activeCameraConnectionId: string | null
activeCameraDirection: CameraConnectionDirection  // 'forward' | 'reverse'
treeExpandedCameraConnectionIds: string[]
treeExpandedCameraDirectionKeys: string[]          // `${connectionId}:${direction}`
cameraTreeFilter: 'all' | 'cameras'               // default 'cameras'
```

Added methods:

- `selectCameraConnectionDirection(connectionId, direction)` — primary entry; idempotent on identical state; auto-expands tree to reveal the direction.
- `setCameraTreeFilter(value)` — session-only filter switch.
- `toggleCameraConnectionTreeExpansion(connectionId)` and `toggleCameraDirectionTreeExpansion(connectionId, direction)` — tree expansion toggles.
- `isCameraKeyHelpersActive` getter — single source of truth for helper visibility (Camera workspace + non-blocked preview + connection still in document).

`selectConnection(id)` now delegates to `selectCameraConnectionDirection` with a default direction that preserves the prior direction when the same connection is re-selected.

## Selection/Focus Contracts

- `selectConnection` / `selectCameraConnectionDirection` → establish active connection + direction.
- `selectAnchor` → establishes active connection, preserves or defaults direction.
- `selectViewKeyframe` → establishes `{ connectionId, direction }` and auto-expands.
- `finishAnchorEditing` → preserves active connection + direction.
- `finishViewKeyframeEditing` → preserves direction; navigationSelection becomes `connection`.
- `selectNavigationNode` / `selectCameraHandle` / `selectPlacement[ s ]` / `togglePlacement` / `selectCluster` / `deselect` → clear active connection + direction.
- `stopCameraPreview` → preserves active connection + direction (per plan rule).
- Exact-connection preview adopts its requested traversal direction; selecting the opposite direction from a view key returns selection to the parent connection so selection and helper direction remain coherent.

## Visibility

`EditorCameraViewHelpers.svelte` reads `isCameraKeyHelpersActive` and `activeCameraConnectionId` / `activeCameraDirection`. Helpers stay visible in the Camera workspace even when no Director preview is active, and hide in Scene workspace, during visitor preview, asset placement, or pending navigation commands.

## Camera Filter

- Sidebar shows `[ All ] [ Cameras ]` tabs only when `currentWorkspace === 'camera'`.
- Filter is session-only; Scene workspace ignores it.
- Default is `'cameras'` per the plan.
- All mode mounts `EditorSceneTree` so users can still select walls/artworks in the Camera workspace.

## Tree Hierarchy (Cameras filter)

- **Guided Tour** — chain walked from `entrance-start` via `nextNodeId`.
- **Free Nodes** — navigation nodes outside the guided chain.
- **Connections** — one section per connection, with **Forward** and **Reverse** collapsible subsections. Each subsection lists view keyframes as separate rows with progress percentage metadata.
- Selecting a connection row, a Forward/Reverse subsection header, or a keyframe row all establish the persistent trio; row visual state stays in sync via `isConnectionHeaderSelected` / `isDirectionSelected` / `isKeyframeSelected` (all of which honor `connection | anchor | view-keyframe` selection kinds).

## 3D Selection

- Keyframe spheres still carry `EditorCameraViewKeyframeUserData` so `findNavigationSelectionFromObject` climbs to the selection, and `EditorSelection` routes `select-navigation` results through `selectViewKeyframe`.
- Helpers are now reachable through Camera workspace without an active preview, so 3D pickers work in that state.

## Verification

- `npm run check` — 0 errors, 0 warnings.
- `npm test` — 20 files / 312 tests pass.
- `git diff --check` — clean.
- Focused coverage: default filter; connection selection persistence; idempotent direction switch; same-connection anchor direction preservation; cross-connection anchor forward default; keyframe trio; Done editing preserves direction; exact-edge preview direction adoption; Preview Stop preserves connection + direction + selection; helpers visibility across Camera / Scene / visitor-preview / Stop cycles; session-only filter; expansion toggle independence; node / placement clearing active state.

## Known Gaps / Out of Scope

- Per plan, Phase 2.1 intentionally does not include: node/connection creation/deletion, guided-order editing, any-room placement, new FOV/aim handles, paused Through-Camera mutation, timing fields, schema changes. All deferred.
- The new tree sections default to collapsed; auto-expand only fires on the active selection's tree path.

## Exact Next-Slice Recommendation

Phase 2.2 — Camera filter (UI polish), timeline selection, and scrub. Most of the selection plumbing already exists; the next slice wires the existing `cameraTreeFilter` to timeline lanes and adds the timeline component (`EditorCameraTimelinePanel.svelte`). Whole-tour route and playback remain Phase 2.3.
