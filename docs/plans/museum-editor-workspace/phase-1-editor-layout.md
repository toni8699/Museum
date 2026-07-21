# Phase 1 — Editor Layout

**Status:** Complete. Final handoff: [`../../agent-handoffs/phase-1-editor-ui-overhaul.md`](../../agent-handoffs/phase-1-editor-ui-overhaul.md).

**Goal:** replace the busy page with a persistent editor shell without changing scene schema or camera behavior.

## Scope

Build only:

- Persistent top bar, left sidebar, viewport, right inspector, and bottom panel.
- `Scene` and `Camera` workspaces sharing one document and viewport.
- Persistent `Scene` / `Assets` left tabs.
- Context-inspector extraction from `MuseumEditorApp.svelte`.
- Viewport-local transform toolbar.
- Collapsed/open camera-timeline frame.
- Move existing camera preview controls into the bottom panel.
- Move existing import/copy/download/reset actions into the application shell.

## Out of Scope

- No scene-schema change.
- No camera-route, camera-motion, graph, guided-order, keyframe, or preview behavior change.
- No whole-tour preview.
- No camera-key timeline rendering.
- No new camera placement flow.
- No primitives, lights, textures, or material instances.
- No File System Access API and no true `Save`.
- No package export.

## Shell Contract

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Museum Editor | Scene Camera | Undo Redo | Preview… | Import Export │
├──────────────┬──────────────────────────────────┬───────────────────┤
│ Scene Assets │                                  │ Inspector         │
│              │           3D VIEWPORT            │                   │
│ current tree │ Select Move Rotate Scale Snap Add│ current fields    │
│ current lib  │                                  │                   │
├──────────────┴──────────────────────────────────┴───────────────────┤
│ Camera timeline frame                                              │
└─────────────────────────────────────────────────────────────────────┘
```

Use CSS grid with stable regions. Avoid a second document or route reload.

### Top bar

- Left: `Museum Editor` and current project/file label.
- Center: `Scene` and `Camera` workspace tabs.
- Right: dirty state, Undo, Redo, preview action, project actions.
- Project actions in this release:
  - Import JSON file.
  - Import pasted JSON.
  - Copy JSON.
  - Download JSON.
  - Reset.
- Preserve current persistence semantics: copy/download do not mark saved.
- Keep existing discard confirmation on import, reset, refresh, and navigation.
- `Preview Museum` may open the canonical visitor route; it must not imply unsaved editor JSON is live there.
- `Preview Tour` remains unavailable until Phase 2; existing selected-camera preview stays in the bottom controls.

### Left sidebar

- Header tabs: `[ Scene ] [ Assets ]`.
- Scene tab contains the existing hierarchy, room groups, clusters, placements, and camera-node section.
- Assets tab contains the existing asset library.
- Preserve current asset filters, status rules, placement restrictions, and selection behavior.
- Do not add Cameras-only filtering until Phase 2.

### Viewport toolbar

Move viewport-related controls to a compact overlay at viewport top-left:

- Select.
- Move.
- Rotate.
- Scale.
- Local/World.
- Snap.
- Add.

Only render Add actions backed by existing behavior. Do not expose dead Box, Plane, Cylinder, Sphere, Light, or unrestricted Camera commands. Existing connected-camera creation may retain its explicit label and restrictions.

### Inspector

One right inspector with selection-dependent content:

- Nothing selected: concise editor help/status.
- Asset-library selection: existing asset details.
- Placement/cluster selection: current transform, placement, cluster, and metadata controls.
- Camera selection: current camera inspector.
- Existing path/key selection: current path/view controls.

Extraction is component movement only. Preserve command calls, transaction boundaries, keyboard behavior, and disabled states.

### Bottom panel

Two states:

- Collapsed: `36px`.
- Open: resizable `220–360px`; default `280px`.

Behavior:

- Camera workspace auto-opens.
- Scene workspace remembers the session choice.
- Resize height is session-only.
- Move `EditorCameraPreviewControls` and existing camera transport into this panel.
- No tracks, time ruler, key diamonds, or new playback semantics yet.

### Workspace switch

Session state:

```ts
type EditorWorkspace = 'scene' | 'camera';
type EditorLeftPanel = 'scene' | 'assets';
```

- Keep selection when switching.
- Keep one store, document, history, and viewport.
- Cancel pointer interactions safely before changing workspace.
- Stop active existing preview when leaving Camera if current store rules require it.
- Workspace, panel, timeline height, and expansion state do not affect dirty state or undo.

## Component Boundary

Recommended extractions:

```text
MuseumEditorApp.svelte
├─ EditorAppBar.svelte
├─ EditorLeftSidebar.svelte
│  ├─ EditorSceneTree.svelte
│  └─ EditorAssetLibrary.svelte
├─ EditorViewport.svelte
│  └─ EditorViewportToolbar.svelte
├─ EditorInspector.svelte
└─ EditorCameraTimelinePanel.svelte
   └─ EditorCameraPreviewControls.svelte
```

Keep store commands in `museum-editor.svelte.ts`. Do not move domain behavior into shell components.

## Files to Read

- `apps/museum/src/lib/editor/MuseumEditorApp.svelte`
- `apps/museum/src/lib/editor/museum-editor.svelte.ts`
- `apps/museum/src/lib/editor/EditorViewport.svelte`
- `apps/museum/src/lib/editor/EditorAssetLibrary.svelte`
- `apps/museum/src/lib/editor/EditorCameraInspector.svelte`
- `apps/museum/src/lib/editor/EditorCameraPreviewControls.svelte`
- `apps/museum/src/lib/editor/EditorPlacementInspector.svelte`
- `apps/museum/src/lib/editor/EditorTransformInspector.svelte`
- `apps/museum/src/routes/dev/museum-editor/+page.svelte`

## Slices

| Slice | Deliverable | Complexity | Recommended model | Reasoning |
|---|---|---:|---|---|
| 1.1 | Persistent shell and workspace state | Medium | `gpt-5.6-terra` | High |
| 1.2 | Scene tree and contextual inspector extraction | High | `gpt-5.6-sol` | High |
| 1.3 | Viewport toolbar and bottom timeline frame | High | `gpt-5.6-sol` | High |
| 1.4 | Responsive layout, browser acceptance, handoff | Medium | `gpt-5.6-terra` | High |

## Automated Acceptance

- Existing editor/store tests remain unchanged or receive layout-only updates.
- Workspace switch preserves document identity, history, selection, and dirty state.
- Timeline expansion/height and panel state never serialize.
- Import/copy/download/reset retain current validation and dirty semantics.
- Existing camera preview commands receive identical arguments after component movement.
- Production build keeps editor implementation out of visitor chunks.

## Browser Acceptance

1. Open `/dev/museum-editor` at desktop width.
2. Switch Scene/Camera repeatedly; confirm no reload or lost selection.
3. Switch Scene/Assets; confirm current filters and selection work.
4. Resize/collapse/open bottom panel; confirm viewport remains usable.
5. Move, rotate, scale, snap, undo, and redo through the viewport toolbar.
6. Run every existing camera preview action from the bottom panel.
7. Import, copy, download, and reset JSON; confirm existing warnings and dirty badge.
8. Test narrow width for non-overlapping panels and reachable controls.

## Completion Gate

- Layout is visibly simpler.
- Camera tools no longer occupy the general inspector stack.
- Existing scene and camera behavior is unchanged.
- No schema, JSON, route, motion, or visitor-runtime diff is introduced.
