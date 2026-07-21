# Phase 3 — Camera Graph Authoring

**Goal:** complete the camera workflow: unify selection/Play with the timeline, define nodes, connect them, order the guided tour (including timeline drag-connect), frame any point, then author timing.

**Dependency:** Phase 2 complete.

## Scope

Build in this order:

1. Selection seeks preview + movie-editor Play.
2. Any-room camera-node placement.
3. Node connection and guarded deletion.
4. Guided-order editing.
5. Timeline drag-to-connect + straight auto path.
6. Direct FOV/aim handles and paused Through-Camera editing.
7. Timing schema and scheduler.

## Out of Scope

- No primitives or lights.
- No textures or material instances.
- No branching tours or multiple guided sequences.
- No independent animation curves.
- No camera roll/quaternion authoring.
- No collision/navmesh or smart door-routing path planners.
- No automatic edge creation during list/API guided reorder (timeline drag-connect is the documented exception).

## Authoring Workflow

```text
Select/Play parity → Define nodes → Connect nodes → Configure paths → Define guided order
  → Timeline drag-connect (optional) → Add camera keys → Frame → Timing
```

Two ways to add a stop into the tour graph:

1. **Place then connect** — Add → Camera, first connection, then guided-order insert (slices 3.2–3.4).
2. **Timeline drag-connect** — Drag a node onto the Guided Route; may auto-create a missing straight edge and insert guided links in one transaction (slice 3.5).

Both share the same connection transaction, empty `auto-bezier` path, and existing path fine-tune tools. Do not add another path model.

## Selection Seeks Preview

Unify Camera-workspace selection onto the existing timeline pose helpers. Paused Director preview only; Through-Camera mutation stays slice 3.6.

| Entry | Action |
|---|---|
| Guided / free **node** (tree or viewport) | Same as timeline node: select → sync playhead → node pose preview → **hard recenter** when `nodeId` changes |
| **Connection** / **Forward** / **Reverse** (tree) | Select direction → connection pose at edge start → **hard recenter** when connection or direction changes |
| Timeline node / edge / key | Keep seek; hard recenter when node or connection+direction changes |
| Same-row re-click | No-op |

Reuse `#showCameraTimelineNodePose` / `#showCameraTimelineConnectionPose` and `recenterEditorDirectorObserver`. Consume stuck orbit focus while preview is active. Leave inspector Director buttons for this slice; retire with framing UX in 3.6.

## Movie-editor Play

Primary Play means the **whole guided tour** from the current global `cameraTimelinePlayhead`.

- Timeline ▶, top-bar Preview Tour, and bottom transport Play share one resume path.
- If preview is already `kind: 'tour'` and paused/complete → resume (complete → restart at 0).
- If preview is `connection` / `node` / absent → promote/start `kind: 'tour'` at the **current** playhead (do not reset to 0), then play.
- Label the primary control Play guided tour / Pause. Do not surface **Play selected edge** as the primary action.
- Pause leaves playhead where it stopped; Stop preserves selection/direction per Phase 2.1 rules.

## Any-Room Camera Placement

Remove Paris-room selection from camera creation.

1. Choose Add → Camera.
2. Click any floor carrying `editorSurface` room metadata.
3. Infer `roomId` from the hit surface.
4. Create a session-only pending camera-node ghost.
5. Initialize eye height `1.65m`, target height `1.25m`, target distance `3m`, FOV `54`.
6. Allow pending pose adjustment.
7. Choose an existing node for the first connection.
8. Commit node, symmetric adjacency, and one straight `auto-bezier` connection atomically.
9. Cancel before connection with no document/history mutation.

The document must never contain a disconnected canonical node.

Floor picking contract:

```ts
findPlaceableFloorIntersection(intersections, roomId?)
  -> { intersection, roomId } | null
```

Omitted `roomId` accepts any tagged floor. Room-local conversion must remain yaw-aware. Asset placement restrictions are unchanged.

## Connect and Delete

### Connect

- Choose source and destination nodes.
- Reject self-edge and duplicate edge.
- Commit connection plus symmetric `connectedNodeIds` once.
- Start with zero interior anchors and `auto-bezier`.
- Select new connection and hand it to existing path tools.

### Delete connection

Allow only when:

- Full graph remains connected.
- Guided order does not require the edge.
- No active interaction or playback owns it.

Delete its directional camera keys with the edge in one transaction.

### Delete node

- Free node: delete node and incident edges only if remaining graph stays connected.
- Guided node: predecessor/successor must have a direct connection and resulting cycle must stay valid.
- Delete all incident edges and their keys atomically.
- Preserve at least two guided nodes.

Every rejection reports the exact failed invariant and makes no mutation.

## Guided Order

Locked rules:

- One reciprocal cycle.
- Display start pinned to `entrance-start`.
- Guided subset may exclude free nodes.
- Multiple nodes may belong to one room.
- Drag free node between guided nodes only when direct edges to both exist.
- Reorder validates every consecutive pair, including final → start.
- List/API guided reorder never creates missing edges automatically.
- Timeline drag-connect (slice 3.5) is the documented exception that may create a missing straight edge.
- Remove guided node only when previous → next edge exists.
- One transaction rewrites all reciprocal `nextNodeId` / `previousNodeId` links.

Recommended store APIs:

```ts
setGuidedTourOrder(nodeIds)
insertNodeIntoGuidedTour(nodeId, index)
removeNodeFromGuidedTour(nodeId)
deleteNavigationNode(nodeId)
deleteConnection(connectionId)
```

Validation must be pure and separately tested before store mutation.

## Timeline Drag Connect

Second authoring path beside place-then-connect. Calls the same connect + guided-order APIs; does not invent a second graph or path model.

1. On the Guided Route timeline, drag from a node boundary (or free-node chip) and drop between two guided stops (or onto a gap).
2. One atomic transaction:
   - If the undirected edge is missing → create connection with empty `auto-bezier` interiors and default clearance (same as connect).
   - Insert/reorder guided links so the drop order is valid.
3. Reject with status (no partial write): self-drop, invalid duplicate, broken reciprocal cycle, graph disconnect, interaction/playback blocked.
4. Select the new/updated connection and hand it to existing path tools for fine-tune.
5. Nodes are not created from empty timeline space; placement remains Add → Camera (slice 3.2).

Out of scope: collision avoidance, door heuristics, multi-edge corridor generation.

## Framing Controls

Make framing visible without requiring Director selection.

- Selected node/key shows virtual camera, center aim marker, connector, and finite frustum.
- Frustum depth: `clamp(distanceToTarget, 2, 8)` meters.
- Runtime camera near/far remain unchanged.
- Drag aim marker to edit target.
- Drag frustum side handles to edit vertical FOV.
- Keep numeric FOV slider for fine adjustment.
- FOV range stays `10–120°`; slider precision `0.1°`.
- Camera key eye remains derived from connection progress.
- Paused Through Camera allows target and FOV edits.
- Playing preview blocks mutation.
- Remove modal pointer shield while paused; retain it while playing.

At any point along a connection, user adds/selects a camera key, drags it to the desired breakpoint, then edits target/FOV.

## Timing — Final Slice Only

Do not begin timing until graph, selection, playback, key drag, timeline drag-connect, and framing controls are stable.

Introduce canonical scene schema v4 independently from later entity/material schemas.

```ts
type CameraEasing =
  | 'linear'
  | 'smoothstep'
  | 'smootherstep'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out';

type SceneConnectionTiming = {
  durationSeconds?: number;
  easing?: CameraEasing;
};
```

Add:

- Camera node: optional `holdSeconds`.
- Connection: optional `timing`.
- Camera key: optional `holdSeconds` and optional easing to next framing sample.

Contracts:

- Missing fields preserve exact current length/speed/clamp/smootherstep output.
- v1/v2/v3 migration omits timing fields.
- Global key time remains derived; never persist it.
- Key eye position remains derived; never persist it.
- Duration excludes holds.
- Holds are explicit zero-position-motion schedule spans.
- Reduced motion skips movement and holds, landing exactly.
- Timeline lane structure does not change.

## Files to Read

- `apps/museum/src/lib/editor/museum-editor.svelte.ts`
- `apps/museum/src/lib/editor/EditorSelection.svelte`
- `apps/museum/src/lib/editor/EditorCameraPathHelpers.svelte`
- `apps/museum/src/lib/editor/EditorCameraViewHelpers.svelte`
- `apps/museum/src/lib/editor/EditorCameraRig.svelte`
- `apps/museum/src/lib/editor/EditorCameraInspector.svelte`
- `apps/museum/src/lib/editor/EditorCameraTimelinePanel.svelte`
- `apps/museum/src/lib/editor/EditorCameraPreviewControls.svelte`
- `apps/museum/src/lib/editor/EditorCameraTree.svelte`
- `apps/museum/src/lib/editor/editor-camera.ts`
- `apps/museum/src/lib/editor/editor-camera-path.ts`
- `apps/museum/src/lib/editor/editor-camera-view.ts`
- `apps/museum/src/lib/editor/editor-camera-timeline.ts`
- `apps/museum/src/lib/editor/editor-placement.ts`
- `apps/museum/src/lib/content/rooms.ts`
- `apps/museum/src/lib/content/scene.ts`
- `apps/museum/src/lib/content/scene-codec.ts`
- `apps/museum/src/lib/museum/navigation/camera-route.ts`
- `apps/museum/src/lib/museum/navigation/camera-motion.ts`
- `apps/museum/src/lib/state/museum-state.svelte.ts`

## Slices

| Slice | Deliverable | Complexity | Recommended model | Reasoning |
|---|---|---:|---|---|
| 3.1 | Selection seeks preview + movie-editor Play | Very High | `gpt-5.6-sol` | XHigh |
| 3.2 | Any-room pending camera node and first connection | Very High | `gpt-5.6-sol` | XHigh |
| 3.3 | Connect command and guarded node/connection deletion | Very High | `gpt-5.6-sol` | XHigh |
| 3.4 | Guided-order editing and reciprocal-cycle validation | Very High | `gpt-5.6-sol` | XHigh |
| 3.5 | Timeline drag-to-connect + straight auto path | Very High | `gpt-5.6-sol` | XHigh |
| 3.6 | Finite frustum, aim/FOV handles, paused editing | Very High | `gpt-5.6-sol` | XHigh |
| 3.7 | Schema v4 timing, scheduler, migration parity | Extreme | `gpt-5.6-sol` | Max |

## Automated Acceptance

- Tree/viewport node and connection/Forward/Reverse selection enter paused Director pose and hard-recenter on identity change.
- Scrub mid-timeline then Play starts `kind: 'tour'` near that playhead; pause/resume keep position; complete replays from 0.
- Primary Play is whole-tour; no primary Play selected edge.
- Every tagged room floor resolves correct room ownership/local coordinates.
- Missing metadata and non-floor hits reject cleanly.
- Pending cancel leaves document/history unchanged.
- First connection commits node, adjacency, and path once.
- Self/duplicate/disconnecting graph actions reject atomically.
- Guided list/API reorder rewrites a valid reciprocal cycle once and never auto-creates edges.
- Timeline drag-connect may create one missing straight `auto-bezier` edge and insert guided links in one transaction; rejects leave no partial write.
- Node/edge deletion preserves graph and guided invariants.
- FOV/target drags are one history entry; cancellation is none.
- Paused Through Camera edits; playing preview blocks edits.
- v1/v2/v3 migrate deterministically to v4.
- Documents without authored timing retain frozen samples and duration.
- Explicit durations, holds, easing, and reduced motion are deterministic.

## Browser Acceptance

1. Select guided nodes and connections from the tree; confirm preview seek and hard recenter.
2. Scrub mid-tour; Play continues the whole tour from that playhead; Pause/Stop behave as specified.
3. Add a camera node on every room floor without choosing Paris/layout.
4. Add multiple stops inside one room.
5. Connect nodes; configure anchors through existing path tools.
6. Delete allowed and forbidden nodes/edges; verify messages and undo.
7. Insert/reorder/remove guided nodes via list/API; preview the full loop.
8. Timeline-drag a free or guided node into the tour; confirm straight path + guided links; fine-tune anchors.
9. Select and drag a camera key to any path breakpoint.
10. Drag aim and FOV handles at node and key positions.
11. Edit framing while Through Camera is paused; confirm playback blocks it.
12. Test FOV `10`, `54`, and `120`; helper remains readable.
13. Author duration/hold/easing only after all earlier actions pass.

## Completion Gate

- Tree, timeline, and Play share one selection/seek/tour-playhead model.
- Node → connection → path → order workflow supports multiple stops per room.
- Timeline drag-connect and place-then-connect share one connect/path system.
- Camera breakpoints remain discoverable and directly relocatable.
- Framing has immediate viewport feedback.
- Guided graph remains connected and reciprocal through every mutation.
- Timing ships as an isolated v4 migration after interaction stability.
