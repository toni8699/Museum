# Phase 2 — Camera Editing MVP

**Goal:** make every existing camera node, connection, and camera key discoverable and editable through one global guided-tour timeline.

**Dependency:** Phase 1 complete.

## Scope

Build:

- Persistent camera-key discovery independent from preview mode.
- Scene-tree filter `[ All ] [ Cameras ]`, defaulting to Cameras in Camera workspace.
- One whole-tour timeline with `Guided Route` and `Camera Framing` lanes.
- Selection and scrub for existing nodes, connections, and camera keys.
- Whole guided-cycle preview using the existing graph.
- Camera-key progress drag in timeline and 3D.

## Out of Scope

- No node or connection creation/deletion.
- No guided-order editing.
- No any-room placement.
- No new FOV/aim handles.
- No paused Through-Camera mutation.
- No authored duration, hold, or easing fields.
- No schema change.
- No independent Position, Target, or FOV tracks.

## Existing-Graph Rule

This release reads and edits only the checked-in v3 graph and camera view tracks. It must not mutate topology or guided links.

Timeline time derives from current `camera-motion.ts` length/speed/clamp behavior. Do not add timing fields to JSON while building timeline selection, scrub, or playback.

## Camera Discovery

Add session state independent from preview:

```ts
type CameraConnectionDirection = 'forward' | 'reverse';

activeCameraConnectionId: string | null;
activeCameraDirection: CameraConnectionDirection;
```

Rules:

- Selecting a connection establishes active direction.
- Selecting a camera key establishes its connection and direction.
- `Done editing view` selects the parent connection and preserves direction.
- Preview Stop preserves selected connection and direction.
- Camera-key helpers remain visible in Camera workspace without Director preview.
- Keys are selectable from tree, timeline, and 3D marker.
- Stable identity remains `{ connectionId, direction, keyframeId }`.

### Camera filter

Camera workspace defaults to:

```text
[ All ] [ Cameras ]

Guided Tour
Free Nodes
Connections
  connection-id
    Forward
      key-id
    Reverse
      key-id
```

`All` restores the normal scene hierarchy immediately. Search applies inside the active filter. The filter is session-only.

## Timeline Contract

```text
|<   ▶   >|    00:04.20     + Camera Key     Preview Tour

Guided Route
◆────────────◆──────────◆────────────◆

Camera Framing
    ◇────◇──────────◇─────────◇
```

- Node diamond: guided stop boundary.
- Edge span: exact oriented connection.
- Interior diamond: camera key on its directional track.
- One camera-framing lane only.
- Click node: select node and seek its boundary.
- Click edge: select connection/direction and seek nearest point.
- Click key: select and seek exact sampled pose.
- Previous/Next seeks next node or camera key.
- Scrub samples exact shared route/motion output.
- Observer/Through Camera switching preserves playhead and observer pose.

## Whole-Tour Route

Add a shared route API near existing route assembly:

```ts
getGuidedCameraRoute(startNodeId, graph): ResolvedCameraRoute
```

Contract:

- Start at `entrance-start` when available.
- Follow reciprocal `nextNodeId` links exactly once.
- Include the final connection returning to start.
- Retain connection IDs and traversal directions.
- Reuse existing edge orientation, path-part assembly, and `camera-motion.ts` sampling.
- Reject broken cycles or missing required edges with editor status; never guess.
- No timeline-only route, curve, or camera sampler.

Extend preview state with `kind: 'tour'`. Playback runs one full cycle and then becomes complete. Reduced motion lands at the final sampled pose using existing reduced-motion policy.

## Camera-Key Progress Drag

Camera-key position stays derived from edge-local progress.

### Timeline drag

- Horizontal drag maps pointer to selected edge span.
- Clamp strictly inside `(0, 1)`.
- Reject progress collision with another key in same directional track.
- Live-update playhead, target, and FOV.
- Pointer-up creates one history entry.
- Escape/cancel/no-op creates none.

### 3D drag

- Marker drag slides key along the exact shared position curve.
- Disable Orbit/transform controls during drag.
- Convert pointer to world point on a stable drag plane.
- Project to shared curve with existing nearest-progress refinement.
- Target handle takes precedence when marker overlap occurs.
- Never move the derived eye off the connection path.
- Never change connection anchors during key drag.

Store command family:

```ts
selectCameraConnectionDirection(connectionId, direction)
beginViewKeyframeProgressDrag(selection)
updateViewKeyframeProgressDrag(progressOrWorldPoint)
commitViewKeyframeProgressDrag()
cancelViewKeyframeProgressDrag()
previewGuidedTour()
```

## Files to Read

- `apps/museum/src/lib/editor/museum-editor.svelte.ts`
- `apps/museum/src/lib/editor/MuseumEditorApp.svelte`
- `apps/museum/src/lib/editor/EditorCameraTimelinePanel.svelte` from Phase 1
- `apps/museum/src/lib/editor/EditorCameraPathHelpers.svelte`
- `apps/museum/src/lib/editor/EditorCameraViewHelpers.svelte`
- `apps/museum/src/lib/editor/EditorSelection.svelte`
- `apps/museum/src/lib/editor/EditorCameraPreviewControls.svelte`
- `apps/museum/src/lib/editor/editor-camera-view.ts`
- `apps/museum/src/lib/editor/editor-camera-path.ts`
- `apps/museum/src/lib/museum/navigation/camera-route.ts`
- `apps/museum/src/lib/museum/navigation/camera-motion.ts`
- `apps/museum/src/lib/content/scene.ts`

## Slices

| Slice | Deliverable | Complexity | Recommended model | Reasoning |
|---|---|---:|---|---|
| 2.1 | Persistent connection direction and camera-key discovery | High | `gpt-5.6-sol` | High |
| 2.2 | Camera filter, timeline selection, and scrub | Very High | `gpt-5.6-sol` | XHigh |
| 2.3 | Whole-guided-tour route and playback | Very High | `gpt-5.6-sol` | XHigh |
| 2.4 | Timeline and 3D camera-key progress drag | Very High | `gpt-5.6-sol` | XHigh |

## Automated Acceptance

- Done + Stop leaves every key selectable from tree, timeline, and 3D.
- Forward/reverse directional tracks remain independent.
- Whole route contains each guided edge once plus final return edge.
- Timeline boundaries resolve to exact node/edge/key samples.
- Scrub and playback call shared route/motion code.
- Key drag changes progress only.
- Endpoint, collision, cancel, no-op, blur, and capture loss create no history.
- Successful key drag creates one history entry and preserves stable ID.
- Legacy/current JSON round-trips byte-equivalent canonically; schema remains v3.

## Browser Acceptance

1. Enter Camera workspace; timeline opens and Cameras filter is active.
2. Switch to All; select a wall or artwork; return to Cameras.
3. Select a previously hidden key after Done and preview Stop.
4. Scrub every node, edge, and key in both directions.
5. Preview one whole guided loop including the return edge.
6. Drag a key in timeline and 3D; confirm curve does not bend.
7. Cancel drags with Escape, pointer cancel, and workspace switch.
8. Confirm Scene workspace remains usable and camera helpers stay editor-only.

## Completion Gate

- Existing camera work is always rediscoverable.
- Whole-tour selection, scrub, and preview are stable.
- Camera keys can be relocated directly along paths.
- Graph topology, guided order, schema, and timing remain unchanged.
