# Future Plan — Phase 6.6 Camera View Authoring and Director Preview

**Status:** Proposed. No Phase 6.6 implementation exists yet.

**Planning baseline:** Phase 6.5 is complete in the working tree against clean commit `9299029`, but its changes are currently uncommitted. Preserve the existing worktree and do not reset or commit unless the user explicitly requests it.

**Feature boundary:** camera framing, projection, editor observation, and camera-authoring usability. Position-path geometry remains owned by Phase 6.5.

## Persistence Answer

Yes: authored camera view data must be part of the canonical scene document and must survive Copy JSON, Download, Import, undo/redo, reload through checked-in JSON, and visitor playback.

Persist and export:

- node FOV;
- stable directional connection view-keyframe IDs;
- keyframe progress;
- keyframe look target and its coordinate space;
- keyframe FOV.

Keep editor-session-only and never export:

- grid visibility;
- Director versus Visitor preview mode;
- playhead, play/pause state, follow mode, and observer offset;
- editor Orbit camera pose;
- virtual camera, frustum, grid, and helper Object3D instances.

Near/far projection planes remain shared runtime constants in this phase and are not authored.

## Outcome

Deliver one coherent camera-authoring workflow:

1. Finish anchor editing with an explicit **Done editing anchor** action and preview the parent connection without selection workarounds.
2. Toggle a non-raycastable editor calibration grid.
3. Observe a visible virtual visitor camera and frustum from an oblique top-down editor camera.
4. Pause, scrub, and step through an exact connection or transition.
5. Add independent view breakpoints without changing the position curve.
6. Edit yaw/pitch through a look target and edit FOV at nodes or view breakpoints.
7. Preview the same sampled motion in two modes:
   - **Director:** editor observer follows the virtual camera; paused authoring remains interactive.
   - **Visitor:** current exact first-person preview; editing remains modal and blocked.
8. Export/import all authored framing as canonical scene schema v3.
9. Preserve routes with no authored view track exactly, including legacy target samples, timing, reduced motion, Paris behavior, and exact Orbit restoration.

## Start Here — No Repo-Wide Rescan

Read in this order:

1. `AGENTS.md` — repository rules and current runtime contracts.
2. `docs/agent-handoffs/CURRENT.md` — actual working-tree baseline and verification status.
3. `docs/agent-handoffs/phase-6.5.md` — position paths, selection, exact-edge preview, production isolation.
4. This plan.
5. `docs/agent-handoffs/phase-6.md` — original camera helper, preview, transaction, and Orbit-restoration contracts.
6. `docs/agent-handoffs/phase-7.md` — strict codec, canonical export/import, dirty baseline, and browser-only persistence.
7. `docs/CAMERA_AND_LAYOUT.md` — current ownership map and Phase 6.5 behavior.
8. `apps/museum/src/lib/content/scene-codec.ts` — strict version parsing, migration, validation, canonicalization.
9. `apps/museum/src/lib/content/scene.ts` and `lib/types/museum.ts` — document/runtime types and local-to-world resolution.
10. `apps/museum/src/lib/content/museum-scene.json` — checked-in canonical scene.
11. `apps/museum/src/lib/museum/navigation/camera-route.ts` — oriented edges, multi-hop routes, synthesized targets.
12. `apps/museum/src/lib/museum/navigation/camera-motion.ts` — sole motion/projection constructor and sampler.
13. `apps/museum/src/lib/museum/navigation/CameraDirector.svelte` — visitor camera ownership, reduced motion, Paris behavior.
14. `apps/museum/src/lib/editor/museum-editor.svelte.ts` — document/history, selection, route capture, preview guards.
15. `apps/museum/src/lib/editor/EditorCameraRig.svelte`, `EditorViewport.svelte`, and `editor-camera.ts` — current single-camera preview and exact restoration.
16. `apps/museum/src/lib/editor/EditorCameraInspector.svelte`, `EditorSelection.svelte`, `editor-selection.ts`, `EditorTransformControls.svelte`, and `editor-transform.ts` — inspector, pointer, and one-gizmo ownership.
17. Adjacent tests: `scene-codec.test.ts`, `scene.test.ts`, `camera-route.test.ts`, `camera-motion.test.ts`, `museum-editor.test.ts`, `editor-selection.test.ts`, `editor-camera.test.ts`, and `editor-transform-target.test.ts`.
18. `apps/museum/vite/museum-editor-entry-plugin.ts` — production editor isolation.

The Phase 6.5 design record deliberately deferred authored look paths. Do not rewrite that record; this plan is the new authority only for camera view authoring.

## Verified Baseline and Confirmed Problems

### Anchor completion

- Direct anchor movement, gizmo movement, and numeric editing already commit atomically. There is no unsaved per-anchor draft requiring a Save command.
- The anchor inspector exposes XYZ and **Delete Anchor**, but no **Done / Back to path** or connection preview controls.
- `selectedConnection` already resolves from both connection and anchor selection, so preview does not require a store redesign.
- Clicking a clear section of the curve can reselect the connection, but anchor hit priority and the node-only outliner make that exit obscure.
- Treat this as an affordance bug. Use **Done**, not **Save**.

### Moving camera view

- Navigation nodes author eye plus `cameraTarget`; the Target handle controls only the resting endpoint view.
- Interior travel targets are synthesized in `camera-route.ts` from ordered position anchors.
- Persisted `targetWaypoints` remains dormant and unused by route/motion.
- Visitor FOV is one global constant (`54`) and is forced onto the editor camera during first-person preview.
- `CameraRoute`, `CameraMotion`, and `sampleCameraMotion()` currently carry position and target only.

### Editor viewport

- No grid is mounted or toggled.
- One `makeDefault` editor camera owns normal Orbit editing and is overwritten during preview while OrbitControls is disabled.
- There is no independent visitor-camera object or frustum to observe.
- Current preview is intentionally modal: it hides path helpers, blocks document mutation, and restores an exact Orbit snapshot.

## Locked Product Decisions

1. Introduce scene schema v3. Strict v1/v2 parsing and version-specific validation happen before deterministic migration.
2. Canonical serialization always emits v3. Authored node FOV and view tracks always round-trip through browser export/import.
3. View keyframes are independent of position anchors. Adding or moving framing must never bend the position path.
4. View tracks are direction-specific: `forward` and `reverse` never silently reuse one another.
5. `progress` is normalized arc-length progress on the exact connection in that track's travel direction, before transition smootherstep. Persist interior values only (`0 < progress < 1`).
6. Node `cameraTarget` plus node `fov` generate the connection endpoint views. Never serialize generated endpoint view keys.
7. Author yaw/pitch with a world look target. Keep world Y as camera up. Roll, raw Euler rotation, and quaternion editing are out of scope.
8. FOV is vertical degrees in the inclusive range `10–120`. Default/migration value is `54`. Near/far remain global.
9. Missing directional tracks use the current synthesized target behavior. A route with no authored view tracks and all node FOV values at `54` remains numerically identical to Phase 6.5.
10. Both editor modes and `/museum` consume the same immutable route and `CameraMotion` sampler. Do not create editor-only motion math.
11. Keep exactly one default render camera. The virtual visitor camera is non-default and editor-only.
12. Director paused permits editing. Director playing and Visitor preview block document mutation. Visitor remains fully modal.
13. Director uses an oblique top-down follow pose rather than a mathematically vertical camera, avoiding camera-up degeneracy.
14. Grid is editor-only, session-only, non-raycastable, hidden in Visitor mode, and excluded from document/history/dirty state.
15. **Done editing anchor** is selection-only and adds no history. It must allow a focused valid numeric field to commit through blur first; invalid/unchanged drafts restore normally.
16. Preserve atomic history, no-op suppression, exact cancellation, immutable Visitor preview capture, exact Orbit restoration, reduced motion, live-start departure, Paris activation/free-look, and production editor isolation.

## Scene Schema v3 and Canonical JSON

Use these semantic types; exact naming may follow existing style, but do not weaken the fields or direction semantics:

```ts
type SceneCameraViewKeyframe = {
  id: string;
  /** Exact-edge arc-length progress in this track's direction. */
  progress: number;
  /** Room-local when roomId exists, otherwise world-space. */
  cameraTarget: Vec3;
  roomId?: MuseumRoomId;
  /** Vertical perspective FOV in degrees. */
  fov: number;
};

type SceneConnectionViewTracks = {
  forward: SceneCameraViewKeyframe[];
  reverse: SceneCameraViewKeyframe[];
};

type SceneNavigationNodeV3 = SceneNavigationNodeV2 & {
  fov: number;
};

type SceneConnectionV3 = SceneConnectionV2 & {
  /** Omit only when both directions remain automatic. */
  viewTracks?: SceneConnectionViewTracks;
  /** Deprecated v1/v2 dormant data; preserve if imported, but do not activate. */
  targetWaypoints?: SceneWaypoint[];
};

type MuseumSceneDocumentV3 = {
  version: 3;
  objects: SceneObjectPlacement[];
  clusters?: SceneObjectCluster[];
  navigationNodes: SceneNavigationNodeV3[];
  connections: SceneConnectionV3[];
};
```

Illustrative export:

```json
{
  "version": 3,
  "navigationNodes": [
    {
      "id": "paris-seat",
      "cameraTarget": [0, 1.25, -3],
      "fov": 54
    }
  ],
  "connections": [
    {
      "id": "departure-paris",
      "viewTracks": {
        "forward": [
          {
            "id": "departure-paris-view-forward-01",
            "progress": 0.42,
            "roomId": "paris",
            "cameraTarget": [1.2, 1.4, -2.1],
            "fov": 48
          }
        ],
        "reverse": []
      }
    }
  ]
}
```

The illustration omits unrelated required fields; it is not a complete scene document.

### Validation

- Node FOV and keyframe FOV must be finite and within `10–120`.
- Keyframe IDs must be non-empty and unique across both tracks of one connection.
- Allocate the smallest free `${connectionId}-view-${direction}-${NN}` ID.
- Progress must be finite, strictly inside `(0, 1)`, unique, and strictly increasing within each directional array.
- `viewTracks`, when present, must contain exactly `forward` and `reverse`; empty arrays are valid.
- Target coordinates must be finite; optional room IDs must be known.
- Resolver/motion candidate validation must reject a keyframe whose sampled camera position and look target are coincident within the existing camera-pose epsilon.
- Strict version parsers reject fields from later versions and unknown nested keys.
- Cloning, validation, migration, resolution, history, route capture, and serialization must not alias or mutate caller input.

### Migration

1. Parse and validate v1 under original v1 rules, migrate v1 → v2, then migrate v2 → v3.
2. Parse and validate v2 under current v2 rules before migrating v2 → v3.
3. Add `fov: 54` to every migrated node.
4. Do not create `viewTracks` for ordinary v1/v2 connections. Their current synthesized look remains active.
5. Preserve dormant legacy `targetWaypoints` values and coordinate spaces unchanged in canonical v3, but do not silently activate them; they never affected Phase 6.5 playback. A later explicit conversion command can be designed separately.
6. Migrate the checked-in scene to version 3 with FOV `54` on every node and no authored view tracks until an author creates them.
7. `validateSceneDocument()`, JSON import, and resolver accept v1/v2/v3 and return canonical v3. `serializeSceneDocument()` always emits v3.
8. Current checked-in route positions, target samples, durations, reduced-motion destinations, and Paris behavior must remain frozen after migration.

## Runtime, Route, and Motion Contract

### Runtime resolution

- Resolve view-keyframe targets to fresh world-space values while retaining ID, direction, progress, and FOV.
- Keep generated node endpoint views out of serialized arrays.
- Extend runtime navigation nodes with FOV and runtime connections with optional directional view tracks.
- Exact-edge route capture must deep-clone view tracks and FOV alongside position and target data.

### Oriented edge boundaries

`camera-route.ts` must retain oriented connection boundaries in the resolved route. This is required to map an edge-local breakpoint to the same global position progress used by the camera.

- Forward selects only `viewTracks.forward` and travels `fromNodeId → toNodeId`.
- Reverse selects only `viewTracks.reverse` and travels `toNodeId → fromNodeId`.
- Do not reverse or reuse the opposite track as an implicit fallback.
- A **Copy forward to reverse** / **Copy reverse to forward** authoring command may map `progress` to `1 - progress`, reverse order, preserve world targets/FOV, and allocate fresh direction-local IDs.
- Multi-hop routes retain each oriented edge and compose view spans in route order.

### Exact edge-distance mapping

Do not sample target or FOV by an independent curve's arc length. View breakpoints must use the same eased position progress as the camera.

- Extend the shared position compiler to return exact per-connection cumulative distance spans together with the shared `CurvePath`.
- Preserve consecutive rounded-edge coalescing and all frozen legacy position samples.
- If a rounded corner crosses a connection boundary, split the underlying quadratic at the boundary without changing its geometry so each edge receives an exact cumulative distance span.
- Map local edge progress to global route distance, then to global normalized position progress.
- Keep `createCameraPositionPath()` as the public geometry source for visitor, visuals, picking, and preview; a richer compile result may sit underneath it.

### View sampling

- First apply the existing global transition smootherstep to raw transition progress.
- Locate the active oriented edge from shared position distance and derive that edge's local progress.
- If the active direction has no interior view keys, use the existing synthesized look result for that segment.
- If the track has keys, generate endpoint keys from the oriented start/end nodes and interpolate absolute target and FOV piecewise by local progress.
- Use non-overshooting per-interval smootherstep interpolation. Samples must hit every authored target/FOV exactly and remain continuous at node joins.
- Node endpoints guarantee the same target/FOV from adjoining edges at a shared node.
- Changing only node FOV must not activate an authored target track: keep synthesized targets and interpolate node FOV over the corresponding position-distance span.
- Keep the old global target-path branch unchanged when an entire route has no authored view tracks and all node FOV values remain `54`; frozen Phase 6/6.5 samples must pass exactly.
- Extend live-start pose with FOV so departure from an active camera cannot projection-pop.
- Extend reusable motion sample output with FOV. Avoid per-frame allocations.
- Update a PerspectiveCamera's `fov` and call `updateProjectionMatrix()` only when the sampled value changed beyond a small epsilon.
- Reduced motion lands on exact destination position, target, and node FOV.
- Stable Paris free-look retains the authored node FOV; yaw/pitch offsets remain applied around the authored node target.
- Duration remains position-length based. View keys never change speed or duration.

## Editor Preview State and Camera Ownership

Replace the binary preview assumption with explicit mode and transport while preserving source identity and immutable run IDs:

```ts
type EditorCameraPreviewMode = 'director' | 'visitor';
type EditorCameraPreviewTransport = 'paused' | 'playing' | 'complete';

type EditorCameraPreview = {
  source: 'node' | 'transition' | 'connection';
  mode: EditorCameraPreviewMode;
  transport: EditorCameraPreviewTransport;
  runId: number;
  playhead: number;
  // Existing node/connection/direction fields as appropriate.
};
```

Use explicit derived guards rather than replacing every current `cameraPreview` check mechanically:

| State | Render camera | Orbit | Path/grid/frustum | Document edits |
| --- | --- | --- | --- | --- |
| Normal | Editor camera | Enabled | Normal helpers/grid | Enabled |
| Director paused | Editor observer | Enabled | Visible | Enabled |
| Director playing | Editor observer | Enabled/following | Visible | Blocked |
| Visitor | Authored first-person pose | Disabled | Hidden | Blocked |

### Route capture

- Director paused uses the current committed document. After commit/undo/redo, rebuild the route and resample the same clamped playhead.
- Director playing freezes one immutable route until pause or stop.
- Visitor always captures one immutable route on entry and keeps current modal behavior.
- Switching Director → Visitor captures a fresh immutable route at the current playhead and stores the Director observer pose.
- Switching back restores the Director observer pose/playhead before re-enabling Orbit.
- Import/reset stops and fully restores preview before document replacement.

### Virtual visitor camera

Add an editor-only, non-default virtual `PerspectiveCamera` with a disposable `CameraHelper`/camera-body helper.

- `EditorCameraRig.svelte` remains the sole sampler and samples position, target, and FOV once per frame.
- Always apply the sample to the virtual camera while a Director/Visitor session exists.
- In Director mode, never apply visitor pose/projection to the default editor camera.
- In Visitor mode, copy the same sample onto the existing default render camera, matching current first-person behavior.
- Never swap the default camera identity; OrbitControls and TransformControls already depend on it.
- Virtual camera/frustum must be non-raycastable, editor-only, disposed on teardown, and absent from visitor imports/chunks.

### Director follow

- Director opens paused at the selected node or edge start.
- Default observer pose is an oblique top-down offset from the virtual camera; Orbit remains available.
- Follow mode translates the editor camera and Orbit target by the virtual camera's world delta, preserving the user's chosen orbit offset.
- Provide **Follow on/off** and **Recenter** controls; both are session-only.
- Provide Play/Pause, a `0–100%` scrubber, previous/next breakpoint, and Stop.
- Editing is allowed only while paused. Playback must pause before selection, target/FOV mutation, undo/redo, or path mutation.
- Stop/Escape/teardown restores the exact pre-session Orbit pose and camera projection/settings.

## Anchor Completion and Grid UX

### Anchor completion

- Add `finishAnchorEditing()` to the editor store. It validates the parent connection and changes selection from anchor to connection without a transaction, dirty change, or history entry.
- Add **Done editing anchor** as the anchor inspector's primary action.
- Show the parent connection's forward/reverse Director and Visitor controls in the anchor inspector.
- Escape priority:
  1. cancel active TransformControls/direct-path gesture;
  2. cancel pending command;
  3. selected anchor or view keyframe returns to its parent connection;
  4. otherwise deselect.
- Escape inside a numeric field restores that field first and must not unexpectedly leave the inspector.

### Grid

- Add editor-only `EditorGrid.svelte` mounted directly by `EditorViewport.svelte`, never by `MuseumScene`.
- Use a world XZ grid at `y = 0.002`, approximately `80 m` square with `1 m` cells. Default off.
- Add a Camera-panel toggle with `aria-pressed` and a session-only `gridVisible` store field.
- Disable raycasting explicitly or place the grid on a non-selection layer. Current selection walks scene children and an opaque helper could steal clicks.
- Grid casts/receives no shadows and owns/disposes its geometry/material.
- Show in normal and Director modes; hide in Visitor mode and production visitor rendering.
- Do not include grid visibility in document snapshots, history, dirty comparison, import/export, or checked-in JSON.

## View-Keyframe Authoring

### Selection and helper

Extend navigation selection with a stable-ID case:

```ts
type EditorNavigationSelection =
  | ExistingNodeConnectionAnchorCases
  | {
      kind: 'view-keyframe';
      connectionId: string;
      direction: 'forward' | 'reverse';
      keyframeId: string;
    };
```

- Add editor-only view-keyframe markers positioned by the exact shared position curve and key progress.
- Only the active direction's markers are shown.
- Selecting a key shows its target marker/connector and the virtual camera/frustum at that progress.
- The keyframe camera position is derived and read-only. Position-path anchors continue to own eye movement.
- Extend the one persistent TransformControls instance with a view-target case: world translation, no snap, rotation, scale, or grounding.
- View helper and target marker are non-raycastable except for explicit tagged pick roots.
- View-keyframe/target picks outrank curve bending; preserve modal shield and gizmo priority.

### Commands and inspector

- **Add view breakpoint at playhead** is enabled only for a selected exact edge/direction in Director paused mode.
- Capture the current sampled target and FOV, allocate the smallest free stable ID, insert by progress order, commit once, and select it.
- If launched from an anchor, first move the Director playhead to the nearest exact curve progress for that anchor; do not bind the resulting keyframe to the anchor.
- Inspector fields: stable ID, direction, progress percentage, target coordinate-space badge, target XYZ, FOV numeric/range, **Delete**, **Done**, and transport controls.
- Node inspector adds FOV editing alongside Position and Target.
- Allow progress editing only within `(0, 1)` and reorder atomically after commit.
- Direction-copy command allocates fresh IDs and is one transaction.
- Add/edit/move/delete/copy operations each produce at most one history entry.
- No-op epsilon, invalid data, Escape, blur cancellation, pointer cancel, capture loss, and teardown restore exact document/selection/Orbit state with no history.
- Undo/redo keeps a stable key selected while it exists, falls back to its parent connection if deleted, and clears only when the connection no longer exists.

## Implementation Slices

Implement and verify in this order:

### Slice 1 — Freeze baseline and repair local UX

**Difficulty:** Low · **Recommended agent:** `gpt-5.6-terra` (`medium`)

- Re-run Phase 6.5 frozen route/motion samples before changing schema or sampling.
- Add anchor **Done**, anchor-level parent preview controls, and Escape parent fallback.
- Add grid state/toggle/helper with non-raycast ownership and disposal tests.
- No scene-schema change in this slice.

### Slice 2 — Schema v3, migration, and export

**Difficulty:** High · **Recommended agent:** `gpt-5.6-sol` (`high`)

- Add v1/v2/v3 parser types and strict allowed-key sets.
- Validate old documents under old semantics before migration.
- Add node FOV and directional view-track types, cloning, validation, migration, canonical serialization, and resolver support.
- Preserve dormant `targetWaypoints` without activation.
- Migrate checked-in scene JSON to v3/FOV 54.
- Prove Copy/Download/import canonical JSON includes all authored view data and excludes all session state.

### Slice 3 — Route boundaries and shared position metrics

**Difficulty:** Very high · **Recommended agent:** `gpt-5.6-sol` (`xhigh`)

- Retain oriented connection identity/boundaries in `ResolvedCameraRoute`.
- Extend the shared position compiler with exact per-edge cumulative distance spans without altering geometry.
- Preserve legacy rounded coalescing and split cross-boundary primitives only geometrically, not visually.
- Add exact forward/reverse and representative multi-hop span fixtures.

### Slice 4 — Target/FOV motion sampling

**Difficulty:** Very high · **Recommended agent:** `gpt-5.6-sol` (`xhigh`)

- Add direction-specific view selection and generated node endpoints.
- Add segment-aligned target/FOV interpolation and reusable FOV sample output.
- Preserve the exact legacy branch when no authored tracks exist.
- Extend live start, reduced motion, immutable capture, and Paris stable/departure behavior.
- Update `CameraDirector.svelte` projection only when necessary.

### Slice 5 — Preview state and virtual camera

**Difficulty:** High · **Recommended agent:** `gpt-5.6-sol` (`high`)

- Introduce Director/Visitor mode plus paused/playing/complete transport.
- Separate mutation guards so Director paused remains editable.
- Add the non-default virtual camera, body/frustum, playhead, follow/recenter, and camera ownership restoration.
- Keep current Visitor first-person behavior and immutable capture.

### Slice 6 — View-keyframe helpers and authoring

**Difficulty:** Very high · **Recommended agent:** `gpt-5.6-sol` (`xhigh`)

- Add selection case, tagged markers, target helper registration, one-gizmo target ownership, inspector, add/edit/delete/copy commands, and history reconciliation.
- Reuse the exact shared curve/progress mapping. Do not approximate marker placement independently.
- Ensure paused edits refresh Director sampling without losing playhead.

### Slice 7 — Full verification and documentation

**Difficulty:** Medium · **Recommended agent:** `gpt-5.6-terra` (`high`)

- Run all automated checks and manual WebGL acceptance.
- Verify visitor/editor parity and every connection in both directions.
- Verify canonical v3 export/import with authored keys.
- Re-run development/production route and chunk-isolation checks.
- Update `AGENTS.md`, `README.md`, `docs/CAMERA_AND_LAYOUT.md`, `docs/agent-handoffs/CURRENT.md`, and create completed `docs/agent-handoffs/phase-6.6.md` only after implementation is actually complete.
- Leave this design record intact.

## Automated Test Plan

### Codec, migration, and export

- Strict v1, v2, and v3 parsing with version-specific unknown-field rejection.
- v1 → v2 → v3 and v2 → v3 deterministic migration.
- Migrated nodes receive FOV 54; no view tracks are synthesized.
- Dormant legacy `targetWaypoints` round-trip unchanged and remain inactive.
- Canonical v3 field order, two-space indentation, trailing newline, and input immutability.
- Export/import preserves key IDs, directions, progress, target coordinates/room ownership, and FOV.
- Export excludes grid, preview mode, playhead, follow offset, Orbit pose, and helper objects.
- Reject FOV bounds, non-finite values, duplicate/empty IDs, unordered/duplicate/out-of-range progress, unknown rooms, malformed track objects, and coincident sampled eye/target.
- Resolve yawed room-local targets correctly with no reference aliasing.

### Route and motion

- Retain connection boundaries and direction through exact-edge and BFS routes.
- Exact per-edge distance spans sum to total position length.
- Splitting a rounded cross-edge fillet does not change any frozen position sample or duration.
- Forward and reverse tracks are independent; absent reverse does not reuse forward.
- Direction-copy transformation maps progress and preserves world framing with fresh IDs.
- Fully automatic migrated routes retain every frozen Phase 6/6.5 position/target/duration sample.
- Mixed automatic/authored multi-hop routes remain target/FOV continuous at nodes.
- Samples hit every authored target and FOV exactly at its mapped progress.
- FOV interpolation stays finite/in bounds and does not overshoot.
- Target-only, duplicate-anchor, singleton, live-start, reduced-motion, and exact completion cases.
- FOV live-start prevents projection popping and does not mutate inputs.
- Shared sample reuse remains allocation-free.

### Editor store and interaction

- Anchor Done/Escape selects the parent connection with no history or dirty mutation.
- Focused valid numeric anchor edit commits before Done; invalid/unchanged draft restores.
- Anchor inspector starts exact parent edge Director/Visitor preview in both directions.
- Grid toggles session-only and never enters history/canonical JSON.
- Director paused allows commit/undo/redo; playing and Visitor reject mutations.
- Pause/resume/scrub/step clamp and preserve playhead deterministically.
- Paused route refreshes after commit/undo/redo; playing/Visitor route remains immutable.
- Virtual camera and Visitor render camera sample identical position/target/FOV at `0`, `.25`, `.5`, `.75`, and `1`.
- Follow preserves observer offset; Recenter is deterministic.
- Stop/Escape/mode switch/teardown restores exact camera position, target, FOV, near/far, zoom, Orbit limits, enabled state, and damping.
- View-key add/target move/FOV/progress/delete/direction-copy each commit once; no-op/cancel commit none.
- Stable selection reconciliation after undo/redo/delete.
- One TransformControls instance detaches before switching placement/node/anchor/view-target ownership.
- Grid/frustum/view markers cannot steal placement/path/Orbit pointer gestures.

## Manual WebGL Acceptance

1. Toggle grid repeatedly; confirm 1 m calibration, no selection interference, no shadows, and no visitor visibility.
2. Add/move an anchor, press Done, and immediately preview its parent edge without selecting another node.
3. Confirm first Escape from a focused invalid field restores the field; next Escape returns anchor/keyframe to connection.
4. Start Director on every connection forward/reverse; inspect virtual camera body/frustum from oblique top-down, orbit around it, Follow off/on, and Recenter.
5. Play, pause, scrub, and step breakpoints. Confirm paused edits are live and playing blocks mutation.
6. Add an independent view breakpoint without changing the position curve or duration.
7. Move its target and adjust FOV; confirm exact framing at the breakpoint and smooth finite interpolation around it.
8. Copy a direction track to the opposite direction, preview, then customize it independently.
9. Switch Director ↔ Visitor at start/middle/end and confirm identical authored pose/FOV plus exact observer restoration.
10. Exercise immediate Stop, mid-motion Stop, completed hold, Escape, viewport resize, repeated cycles, undo/redo, import, and reset.
11. Verify guided/free navigation, reduced motion, live Paris departure, Paris activation, and stable Paris free-look/FOV.
12. Copy/download v3 JSON and re-import it; confirm every view key survives and grid/mode/playhead do not appear.

## Production Verification

- `npm test`
- `npm run check`
- `npm run build`
- Development: `/museum` returns 200; `/dev/museum-editor` returns 200.
- Production: `/museum` returns 200; `/dev/museum-editor` returns 404.
- `/museum` renders no grid, virtual camera, frustum, view marker, path line, or editor helper.
- Visitor chunks contain no real editor grid/camera-helper/view-keyframe implementation.
- Editor and visitor sample the same shared motion output for authored position, target, and FOV.

## Non-Goals

- Camera roll, raw Euler/quaternion authoring, or orientation tangent handles.
- Binding view keys to position anchors.
- Per-edge speed, duration, easing, or a general timeline editor.
- Near/far plane authoring, depth-of-field, exposure, or post-processing tracks.
- Collision/navmesh or observer-camera wall avoidance.
- Guided-order editing, node/connection deletion, or multi-room layout authoring.
- Visitor-visible grids, camera bodies, frustums, paths, anchors, or editor helpers.
- Persisted editor preferences, autosave, repository writes, or hosted publishing.
- Multiple simultaneous rendered cameras, picture-in-picture, or shot compositing.
- Automatic activation of dormant legacy `targetWaypoints`.

## Completion Gate

Phase 6.6 is complete only when:

- anchor editing has an obvious no-history exit and direct parent preview;
- grid calibration works without affecting selection or export;
- Director can observe, follow, pause, scrub, and author one virtual visitor camera;
- Visitor mode remains exact first-person playback;
- independent directional view breakpoints author target/FOV without changing position geometry or duration;
- canonical v3 JSON round-trips all authored view data and no editor session state;
- unauthored migrated routes retain frozen Phase 6/6.5 behavior;
- history/cancellation/preview restoration remain atomic and exact;
- visitor/editor use one shared sampler; and
- production visitor output contains no editor implementation.

Do not create a commit unless the user asks.
