# Interim Handoff — Phase 6.6 Slice 6 View-Keyframe Authoring

## Status

- **Slice:** 6 — view-keyframe helpers and authoring.
- **Result:** Implemented and automated checks pass.
- **Baseline:** `4a554be` (`slice 5`). Slice 6 changes are staged but uncommitted at handoff time.
- **Phase status:** Phase 6.6 not complete. Slice 7 verification, manual WebGL acceptance, and final docs remain.
- **Scene data:** `museum-scene.json` unchanged. Checked-in scene stays v3 with node FOV `54` and no authored view tracks.
- **Do not commit** unless user asks.

## Read First

1. `AGENTS.md`
2. `docs/plans/camera-view-authoring.md` — locked Phase 6.6 contract
3. This file
4. `docs/agent-handoffs/phase-6.5.md`
5. `apps/museum/src/lib/editor/museum-editor.svelte.ts`
6. `apps/museum/src/lib/editor/editor-camera-view.ts`
7. `apps/museum/src/lib/editor/EditorCameraViewHelpers.svelte`
8. `apps/museum/src/lib/editor/EditorTransformControls.svelte`
9. `apps/museum/src/lib/editor/EditorCameraInspector.svelte`
10. Adjacent tests listed below

Do not update `CURRENT.md` or create final `phase-6.6.md` until Slice 7 completion gate passes.

## Delivered

- Added `view-keyframe` navigation selection with stable `connectionId`, direction, and keyframe ID.
- Added tagged position markers for active direction only.
- Added selected target marker + connector; exact target root registers with shared TransformControls.
- Added marker placement through shared connection curve. No independent curve approximation.
- Added exact raw-playhead ↔ edge-local progress conversion.
- Added Director-paused **Add view breakpoint at playhead**.
- Anchor-launched add first maps anchor to nearest exact directional curve progress.
- Captures current sampled target/FOV, creates one stable key, commits once, selects key.
- Added target XYZ, progress percentage, and FOV editing.
- Added node FOV numeric/range editing.
- Added view delete, Done, parent preview, and forward↔reverse copy commands.
- Added world-space gizmo movement while preserving key target coordinate ownership.
- Added Escape fallback from view key to parent connection.
- Added undo/redo reconciliation: stable key stays selected while present; missing key falls back to parent connection.
- Paused Director route rebuild keeps playhead after commit/undo/redo.
- Visitor and production imports remain free of Slice 6 editor helpers.

## Ownership and Exact Math

### Shared motion

`camera-motion.ts` now exports:

```ts
cameraMotionEdgeProgressAtProgress(motion, edgeIndex, progress)
```

It applies same transition smootherstep and exact edge distance spans used by visitor sampling. Inverse remains:

```ts
cameraMotionProgressAtEdgeProgress(motion, edgeIndex, edgeProgress)
```

Do not replace either with linear playhead math.

### Draft connection direction

`createDraftConnectionPositionPath(document, connectionId, direction)` now accepts `forward | reverse`. Reverse rebuilds same shared path compiler with reversed authored points/anchors. View marker position uses this function plus `CurvePath.getPointAt(key.progress)`.

### View data helpers

`editor-camera-view.ts` owns pure editor helpers:

- `allocateCameraViewKeyframeId()`
- `findSceneCameraViewKeyframe()`
- `getSceneCameraViewKeyframeWorldTarget()`
- `writeSceneCameraViewKeyframeWorldTarget()`
- `createSceneCameraViewKeyframeAtWorldTarget()`
- `getSceneCameraViewKeyframeWorldPosition()`

New targets become room-local only when target lies inside active room XZ footprint. Existing target ownership never changes during gizmo movement.

## Store API

Main commands/getters in `museum-editor.svelte.ts`:

- `selectedViewKeyframe`
- `selectedViewKeyframeWorldTarget`
- `activeViewKeyframeDirection`
- `canAddViewKeyframeAtPlayhead`
- `selectViewKeyframe()`
- `finishViewKeyframeEditing()`
- `commitSelectedNodeFov()`
- `addViewKeyframeAtPlayhead()`
- `updateSelectedViewKeyframeTargetWorldPoint()`
- `commitSelectedViewKeyframeTarget()`
- `commitSelectedViewKeyframeFov()`
- `commitSelectedViewKeyframeProgress()`
- `deleteSelectedViewKeyframe()`
- `copySelectedConnectionViewTrack()`
- `registerViewKeyframeTargetHelperRoot()` / unregister/get variants

Each authored command uses existing document transaction boundary. No second history, scene, route, or motion implementation added.

## Selection and Gizmo Contracts

Pointer priority remains:

```text
modal shield → TransformControls → active path drag → pending mode
→ node/view/anchor helper → connection curve → Orbit → placement
```

- View and target spheres use `camera-view-keyframe` tagged roots.
- Connector line never raycasts.
- View hits bypass path bending and outrank connection curves.
- Alt cycling stays placement-only.
- Shared TransformControls gets new `view-target` target/session case.
- View target uses world translation, no snap/rotation/scale/grounding.
- Movement ≤ `1e-4 m` cancels with no history.
- Escape/teardown uses existing transform cancellation and Orbit restoration path.

## Authoring Flow

1. Select connection or anchor.
2. Start exact connection Director preview, forward or reverse.
3. Pause/scrub to interior playhead. Anchor selection auto-remaps add location.
4. Click **Add view breakpoint at playhead**.
5. Selected key shows position marker, target marker/connector, virtual camera/frustum, inspector fields, and gizmo.
6. Edit target/FOV/progress. Position remains read-only and path geometry/duration stay unchanged.
7. Use Done to return to connection. Copy direction track if needed.

Add rejects endpoints and progress collisions. Progress edit requires strict interior unique value and reorders track atomically.

Direction copy:

- maps `progress` to `1 - progress`;
- reverses order;
- clones target coordinate data and FOV;
- allocates fresh destination IDs while treating old source/destination IDs as occupied;
- replaces destination track in one transaction.

## UI Files

- `EditorCameraViewHelpers.svelte` — view markers, selected target, connector, target-root registry/disposal.
- `EditorCameraFovField.svelte` — numeric + range FOV, one commit after edit.
- `EditorProgressField.svelte` — normalized progress shown/edited as percentage.
- `EditorCameraInspector.svelte` — node FOV, direction counts/copy, view inspector, Done/Delete/parent preview.
- `EditorCameraPreviewControls.svelte` — add-at-playhead action.
- `EditorViewport.svelte` — mounts view helpers editor-only.
- `EditorSelection.svelte` / `editor-selection.ts` — tags, pick priority, selection routing.
- `EditorTransformControls.svelte` / `editor-transform.ts` — one-gizmo view-target ownership.

## Automated Verification

Completed after final edits:

- `npm test` — **19 files / 280 tests passed**.
- `npm run check` — **0 errors / 0 warnings**.
- `npm run build` — passed.
- `git diff --check` — passed.
- Production output search found no `EditorCameraViewKeyframe`, `EditorCameraViewTarget`, `camera-view-keyframe`, or add-view UI symbols.

New/expanded coverage:

- `editor-camera-view.test.ts`
- `editor-camera-path.test.ts`
- `editor-selection.test.ts`
- `editor-transform-target.test.ts`
- `museum-editor.test.ts`
- `camera-motion.test.ts`

Build still prints existing third-party unused-import, large-chunk, adapter-auto notices.

## Manual Acceptance Still Required

Browser runtime reported no available browser backends. No WebGL interaction test ran.

Next agent should manually verify:

1. Director forward/reverse markers match exact camera path and active direction only.
2. Marker and target clicks beat curve bending; gizmo beats helper picks.
3. Target gizmo attaches once, moves target smoothly, preserves room/world basis, cancels on Escape.
4. Add from anchor jumps playhead to nearest exact curve point before key creation.
5. Add/edit/delete/copy each create one undo entry; no-op/invalid edits create none.
6. Progress reorder keeps stable selection and virtual pose finite.
7. Selected marker moves Director playhead to exact key pose/FOV.
8. Direction copy preserves framing when previewed opposite way.
9. Director paused edits refresh without playhead loss; playing/Visitor block mutation.
10. Visitor mode hides view/path helpers and keeps exact first-person pose/FOV.
11. Stop/Escape/mode switching restores exact observer Orbit pose.
12. Copy/download/import round-trip keys; session state remains absent.

## Improvement Targets

- Add component/browser tests for numeric/range blur, Escape, pointer cancel, and Done-after-blur ordering.
- Inspect helper lifecycle under repeated select/undo/redo/HMR; confirm no stale registry roots or disposed TransformControls target.
- Inspect connector depth/render order and marker scale across near/far observer distances.
- Consider hover state for view markers if visual discovery feels weak; keep pick priority unchanged.
- Consider confirmation or clearer copy wording before overwriting non-empty opposite track.
- Store view-authoring block is large. Extraction may improve maintenance, but keep transaction/history/runtime refresh ownership in one store and pure math in `editor-camera-view.ts`.
- Run full Slice 7 route/chunk HTTP smoke and final docs only after manual acceptance.

## Safety Boundaries

- Do not persist generated endpoint view keys.
- Do not bind view keys to position anchors.
- Do not add editor-only sampling math.
- Do not import editor helper modules into visitor code.
- Do not activate dormant `targetWaypoints`.
- Do not update `museum-scene.json` with demo keys unless user explicitly authors/approves them.
- Do not create final Phase 6.6 handoff or mark completion before Slice 7 gate passes.
