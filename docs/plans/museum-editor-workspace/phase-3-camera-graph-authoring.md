# Phase 3 — Camera Graph Authoring

**Goal:** complete the camera workflow: define nodes, connect them, configure paths, order the guided tour, frame any point, then author timing.

**Dependency:** Phase 2 complete.

## Scope

Build in this order:

1. Any-room camera-node placement.
2. Node connection and guarded deletion.
3. Guided-order editing.
4. Direct FOV/aim handles and paused Through-Camera editing.
5. Timing schema and scheduler.

## Out of Scope

- No primitives or lights.
- No textures or material instances.
- No branching tours or multiple guided sequences.
- No independent animation curves.
- No camera roll/quaternion authoring.
- No collision/navmesh.
- No automatic edge creation during guided reorder.

## Authoring Workflow

```text
Define nodes → Connect nodes → Configure paths → Define guided order → Add camera keys
```

Use existing connection-path authoring for path configuration. Do not add another path model.

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
- Never create missing edges automatically.
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

Do not begin timing until graph, selection, playback, key drag, and framing controls are stable.

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
- `apps/museum/src/lib/editor/editor-camera.ts`
- `apps/museum/src/lib/editor/editor-camera-path.ts`
- `apps/museum/src/lib/editor/editor-camera-view.ts`
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
| 3.1 | Any-room pending camera node and first connection | Very High | `gpt-5.6-sol` | XHigh |
| 3.2 | Connect command and guarded node/connection deletion | Very High | `gpt-5.6-sol` | XHigh |
| 3.3 | Guided-order editing and reciprocal-cycle validation | Very High | `gpt-5.6-sol` | XHigh |
| 3.4 | Finite frustum, aim/FOV handles, paused editing | Very High | `gpt-5.6-sol` | XHigh |
| 3.5 | Schema v4 timing, scheduler, migration parity | Extreme | `gpt-5.6-sol` | Max |

## Automated Acceptance

- Every tagged room floor resolves correct room ownership/local coordinates.
- Missing metadata and non-floor hits reject cleanly.
- Pending cancel leaves document/history unchanged.
- First connection commits node, adjacency, and path once.
- Self/duplicate/disconnecting graph actions reject atomically.
- Guided reorder rewrites a valid reciprocal cycle once.
- Missing adjacency rejects reorder without auto-creating edges.
- Node/edge deletion preserves graph and guided invariants.
- FOV/target drags are one history entry; cancellation is none.
- Paused Through Camera edits; playing preview blocks edits.
- v1/v2/v3 migrate deterministically to v4.
- Documents without authored timing retain frozen samples and duration.
- Explicit durations, holds, easing, and reduced motion are deterministic.

## Browser Acceptance

1. Add a camera node on every room floor without choosing Paris/layout.
2. Add multiple stops inside one room.
3. Connect nodes; configure anchors through existing path tools.
4. Delete allowed and forbidden nodes/edges; verify messages and undo.
5. Insert/reorder/remove guided nodes; preview the full loop.
6. Select and drag a camera key to any path breakpoint.
7. Drag aim and FOV handles at node and key positions.
8. Edit framing while Through Camera is paused; confirm playback blocks it.
9. Test FOV `10`, `54`, and `120`; helper remains readable.
10. Author duration/hold/easing only after all earlier actions pass.

## Completion Gate

- Node → connection → path → order workflow supports multiple stops per room.
- Camera breakpoints remain discoverable and directly relocatable.
- Framing has immediate viewport feedback.
- Guided graph remains connected and reciprocal through every mutation.
- Timing ships as an isolated v4 migration after interaction stability.
