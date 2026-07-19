# Future Plan — Intuitive Camera Path Authoring

**Status:** Proposed; implement after the single-room layout/editor work is complete.

**Planning baseline:** `main` at `60846ca` (`phase 5-6`).

**Feature boundary:** navigation nodes and position paths only. This is not the persistence phase, a collision system, or custom look-path authoring.

## Outcome

Add an editor workflow for creating connected camera stops and shaping the travel curve directly in the viewport:

1. Select camera node A and create a connected camera node C on the active room floor.
2. The editor creates A–C as a straight smooth connection in the same document transaction.
3. Click the connection to select it.
4. Press and drag an empty part of the line to insert a curve anchor and bend the line in that same gesture.
5. Drag an existing anchor directly, or use the shared translate gizmo/XYZ inspector for precise adjustment.
6. Preview the exact visitor motion in either direction.

Navigation nodes and curve anchors are deliberately different entities:

- A **navigation node** is a graph stop with an authored eye and look target.
- A **curve anchor** shapes travel between two nodes and never becomes a stop.
- Tangents are generated automatically. The UI does not expose tangent handles.

The curve visualization is a slim editor-only overlay. Remove the existing thick `StaffPath` geometry from `MuseumScene`; `/museum` must render no navigation lines, anchors, or path helpers.

## Start Here — No Repo-Wide Rescan

Read these files in order, then work from the implementation slices below:

1. `AGENTS.md` — repository rules and current visitor contracts.
2. `docs/agent-handoffs/CURRENT.md` — confirm the actual baseline after intervening work.
3. This plan.
4. `docs/agent-handoffs/phase-6.md` — camera selection, shared gizmo, preview, modal guards, and exact Orbit restoration.
5. `docs/agent-handoffs/phase-0.md` — scene document/resolver and visitor/editor graph separation.
6. `apps/museum/src/lib/content/scene.ts` — authoritative document/runtime types and endpoint generation.
7. `apps/museum/src/lib/content/museum-scene.json` — current eight nodes, eight connections, and 41 interior position waypoints.
8. `apps/museum/src/lib/content/rooms.ts` — `roomPoint()` / `roomLocalPoint()` and room transforms.
9. `apps/museum/src/lib/museum/navigation/camera-route.ts` — undirected BFS, edge reversal, multi-hop joining, and synthesized look targets.
10. `apps/museum/src/lib/museum/navigation/camera-motion.ts` — the sole owner of Three.js motion paths, duration, easing, projection, and sampling.
11. `apps/museum/src/lib/editor/museum-editor.svelte.ts` — session document, transactions, history, graph replacement, selection, and preview commands.
12. `apps/museum/src/lib/editor/editor-selection.ts` and `EditorSelection.svelte` — raycast tags, click/drag threshold, pointer capture, Alt-cycle, and Escape behavior.
13. `apps/museum/src/lib/editor/editor-transform.ts` and `EditorTransformControls.svelte` — the one-gizmo resolver and drag transaction lifecycle.
14. `apps/museum/src/lib/editor/EditorCameraHelpers.svelte`, `EditorCameraRig.svelte`, and `EditorViewport.svelte` — helper registration, preview ownership, and editor-only scene mounting.
15. `apps/museum/src/lib/editor/MuseumEditorApp.svelte` and `EditorCameraInspector.svelte` — navigation outliner and inspector integration.
16. `apps/museum/src/lib/museum/MuseumScene.svelte` and `lib/museum/layout/StaffPath.svelte` — remove the visitor path visual here.
17. Adjacent tests: `scene.test.ts`, `camera-route.test.ts`, `camera-motion.test.ts`, `museum-editor.test.ts`, `editor-selection.test.ts`, and `editor-transform-target.test.ts`.
18. `apps/museum/vite/museum-editor-entry-plugin.ts` — production editor isolation.

Do not use `docs/CAMERA_AND_LAYOUT.md` as an authority until this feature updates it. It still describes pre-Phase-0 navigation ownership, persisted endpoints, Director-owned motion, and the obsolete staff path.

## Current Baseline Contracts

### Data and runtime

- `museum-scene.json`, not `rooms.ts`, owns editable camera nodes and connection interiors.
- Document node eye/target values are local to the node's `roomId`.
- A document connection currently stores interior `SceneWaypoint` objects only. A waypoint with `roomId` is room-local; one without it is world-space.
- `resolveSceneDocument()` clones and resolves points into world space, then inserts fresh from/to node-eye endpoints. Generated endpoints are never persisted.
- `camera-route.ts` traverses connections in either direction, reverses edge points when needed, and uses BFS for multi-hop routes.
- `camera-route.ts` currently synthesizes look targets. `targetWaypoints` remains typed but unused.
- `camera-motion.ts` currently converts a position polyline to lines plus quadratic corner fillets. It owns global speed, min/max duration, smoothing, visitor projection, and allocation-free sampling.
- Visitor `CameraDirector` and editor preview consume the same `CameraMotion`; keep that single implementation.

### Editor

- The store mutates a deep session clone, not the imported repository document.
- One document transaction produces at most one history entry. No movement or invalid data produces none.
- Draft helper/document values can change during a drag, but the resolved runtime scene/graph/state is rebuilt only on commit.
- History is capped at 100. Candidate documents must resolve successfully before replacing the paired scene/graph/state.
- Object3D/helper/curve instances stay outside serializable store state and history.
- One persistent Three `TransformControls` instance is shared by placement and camera editing. Target changes detach before attach.
- Camera preview uses a committed immutable graph, blocks document mutation, adds no history, and restores the exact pre-preview Orbit pose.
- `/dev/museum-editor` is development-only. Production returns 404 and must not bundle real editor components.

## Locked Product Decisions

- Provide separate tools for navigation nodes and curve anchors.
- A new node is committed only together with its first connection; never commit an isolated node.
- New connections use an automatically smoothed cubic Bézier position path.
- Auto tangents are derived, not persisted or directly editable.
- Direct line dragging is the primary bend interaction; do not require double-click followed by gizmo dragging.
- Direct dragging stays on the anchor's horizontal world plane. The shared gizmo and XYZ form provide deliberate Y editing.
- The selected anchor gets the existing translate-only, unsnapped, world-space camera gizmo after the direct drag completes.
- The visitor retains no visual path. Delete/unmount `StaffPath`; only the editor overlay draws curves.
- Keep the existing global motion speed/timing. Per-connection speed or duration is deferred because multi-hop travel needs segment-aware time mapping.
- Keep synthesized look targets. `targetWaypoints` editing is deferred.
- Adding a node does not alter guided `nextNodeId` / `previousNodeId`; it becomes reachable in free mode through its new connection.
- No explicit tangent handles, collision/navmesh, guided-tour ordering UI, or node deletion in this feature.

## Data Contract and Migration

Introduce the next scene-document version (version 2 relative to the current baseline; if persistence work has already incremented the schema, use the next available number). Do not silently change the meaning of version 1.

```ts
type ScenePathAnchor = SceneWaypoint & {
  id: string;
};

type ScenePositionPath =
  | {
      kind: 'rounded-polyline';
      anchors: ScenePathAnchor[];
    }
  | {
      kind: 'auto-bezier';
      anchors: ScenePathAnchor[];
    };

type SceneConnection = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  clearance: number;
  positionPath: ScenePositionPath;
  targetWaypoints?: SceneWaypoint[];
};
```

Migration rules:

- Convert each version-1 `positionWaypoints` entry to a stable anchor under `positionPath`.
- Use deterministic IDs based on connection ID and original order, for example `departure-paris-anchor-01`.
- Migrate existing connections as `rounded-polyline`. Their visitor samples, direction reversal, and durations must remain unchanged before an author edits/converts them.
- New connections default to `{ kind: 'auto-bezier', anchors: [] }`, which resolves to a straight cubic between node eyes.
- Clicking a legacy line only selects it. Beginning a bend/anchor transform converts that connection to `auto-bezier` inside the same transaction. Escape or undo restores the exact legacy path.
- An explicit **Convert to Smooth Curve** inspector command performs the same conversion as one atomic history entry.
- Conversion preserves endpoint IDs, interior anchor IDs/positions/coordinate spaces, topology, and clearance. The resulting geometry may become smoother; require preview/manual clearance verification before accepting the conversion.
- `clearance` remains the legacy fillet cap for `rounded-polyline`. For `auto-bezier`, retain it as authored safety/corridor metadata only; it must not secretly alter generated tangents.

Validation must reject non-finite coordinates, empty IDs, duplicate anchor IDs within a connection, unknown endpoints, self-connections, duplicate undirected edges, invalid clearance, asymmetric `connectedNodeIds`, and a committed graph that leaves any visitor node unreachable.

Runtime endpoints remain resolver-owned. Resolve interior anchors to world space and insert generated endpoint anchors with derived IDs such as `node:<id>:position`; never serialize those endpoints.

## Shared Curve and Motion Contract

Evolve the shared route input so it can preserve connection boundaries and mix untouched legacy edges with smooth edges:

```ts
type CameraPositionPathPart =
  | {
      kind: 'rounded-polyline';
      points: readonly Vector3Like[];
      clearance?: number;
    }
  | {
      kind: 'auto-bezier';
      anchors: readonly Vector3Like[];
    };

type CameraRoute = {
  positionParts: readonly CameraPositionPathPart[];
  targetPoints: readonly Vector3Like[];
};
```

- `camera-route.ts` emits path parts in BFS order and reverses an edge's anchors when traversed backward.
- Coalesce consecutive legacy edges into the same flattened rounded part with their minimum clearance so all-legacy routes remain numerically identical to Phase 6.
- Keep auto-Bézier edges as separate parts. Adjacent parts must meet at the same generated node endpoint; reject non-contiguous joins.
- Continue building synthesized target points from the flattened ordered position anchors. Do not activate `targetWaypoints` here.
- Add an exact-edge route helper keyed by connection ID and direction for editor visualization/preview. Do not use BFS for selected-connection preview because future parallel paths could choose another edge.

`camera-motion.ts` remains the only owner of curve construction:

- Compile `rounded-polyline` parts with the existing line/quadratic implementation and constants.
- Compile each `auto-bezier` part into `CubicBezierCurve3` segments that pass through every endpoint/interior anchor.
- Derive automatic tangents with centripetal Catmull–Rom parameterization (`alpha = 0.5`) converted to cubic Bézier controls. Use one-sided endpoint tangents; do not persist controls.
- Two distinct anchors produce a straight cubic with controls at one-third and two-thirds of the segment.
- Adjacent duplicate anchors produce a degenerate segment and must not create NaN/Infinity. Tangents use the nearest distinct neighbor where available.
- Auto paths are C1-continuous at non-degenerate interior anchors. Separate graph connections are guaranteed only C0 continuity at their shared node; authors align them by placing nearby anchors and checking multi-hop preview.
- Preserve input cloning, finite validation, precomputed arc lengths, reused sample outputs, progress clamping, smootherstep, and shared projection/timing constants.
- Duration remains total position arc length divided by the shared global units/second, clamped by the existing min/max. A true singleton is zero duration; distinct-node zero-position/target-only motion retains minimum duration.
- The optional live start pose replaces the first cloned endpoint before automatic tangents are calculated. Preserve Paris live-departure behavior, reduced motion, and exact completion.

Expose one shared way to obtain/sample the constructed position `CurvePath` so the editor line, picking refinement, visitor motion, and editor preview use identical geometry. Do not create a second editor spline approximation.

## Navigation Selection and One-Gizmo Ownership

Replace the node-only camera selection with one discriminated navigation selection:

```ts
type EditorNavigationSelection =
  | null
  | {
      kind: 'node';
      nodeId: string;
      handle: 'position' | 'target';
    }
  | {
      kind: 'connection';
      connectionId: string;
    }
  | {
      kind: 'anchor';
      connectionId: string;
      anchorId: string;
    };
```

- Selecting navigation clears placement selection; selecting placement clears navigation selection.
- Node-row behavior remains Phase 6: a new node selects `position` and frames once; selecting its active position is a no-op.
- Clicking a line selects its connection without history or framing.
- Clicking an anchor selects it without history.
- Stable anchor IDs, never array indices, back selection, drag sessions, and undo reconciliation.
- After undo/redo, keep the anchor selected if its ID still exists; otherwise fall back to its connection. Clear selection if the connection no longer exists.
- Block selection changes during a gizmo or direct-path drag.

Extend `ActiveTransformTarget` with an anchor case. Camera-node and anchor targets always use world-space translate mode with no snap, rotation, scale, floor grounding, or inherited placement settings. A target change must detach before reconfiguration/attachment.

Anchor gizmo drag follows the Phase 6 camera transaction rules: update the draft document/helper/inspector live, rebuild the runtime graph only on pointer-up commit, cancel and restore on Escape, and suppress no-op history. Preserve an existing anchor's `roomId`; convert world movement with `roomLocalPoint()` when it is room-local.

## Direct Click-and-Drag Interaction

Implement a dedicated path pointer session in the central editor selection coordinator; TransformControls cannot inherit an already-running line drag.

### Gesture behavior

- Hovering a curve gives it a subtle highlight and bend cursor.
- Pointer-down/up without exceeding the existing 4 px threshold selects the connection and creates no history.
- Pointer-down on an empty curve followed by movement beyond 4 px:
  1. Claim the pointer before OrbitControls.
  2. Capture the exact connection and closest curve parameter from the initial hit.
  3. Begin one document transaction.
  4. Convert a legacy connection to `auto-bezier` if necessary.
  5. Insert one stable anchor at the sampled curve position.
  6. Select that anchor and drag it immediately; there is no second click.
- Pointer-down/drag on an existing anchor moves that anchor in the same dedicated session.
- Direct dragging intersects the pointer ray with a horizontal plane through the anchor's initial world Y. It changes X/Z and preserves Y.
- After commit, attach the shared translate gizmo so deliberate XYZ/Y refinement remains available.
- If the drag returns within the no-op epsilon, cancel the transaction; a newly inserted anchor disappears and no history is added.
- Pointer-up commits once. Escape, pointer-cancel, lost capture, component teardown, or window blur cancels and restores the original curve/selection/Orbit state.

### Coordinate ownership

- Preserve the coordinate basis of an existing anchor.
- For a new anchor, store it room-local to the active editable room when the initial hit lies inside that room's yaw-aware footprint; otherwise store it world-space with no `roomId`.
- Add a pure yaw-aware room containment helper instead of inspecting mesh names.
- The direct gesture stays horizontal even in a yawed room; the saved room-local point must resolve back to the exact dragged world point.

### Pointer precedence

1. Preview/modal shield blocks all editing.
2. Active TransformControls axis/drag.
3. Active direct-path drag.
4. Pending asset placement, connected-node placement, or connection creation.
5. Camera node/anchor helper.
6. Curve pick and direct bend.
7. Orbit/pan when no editor helper claimed the gesture.
8. Placement selection on click.

Hide path helpers during preview and all pending placement modes. `Alt` remains placement-only: curve and anchor helpers ignore Alt and never enter Alt-cycle results.

## Editor-Only Curve Visual

Add `EditorCameraPathHelpers.svelte` beneath `EditorViewport`, outside `MuseumScene`.

- Draw every connection from the exact shared position curve.
- Use a screen-space thin line: approximately 1–1.25 px, low-opacity neutral gold for unselected curves; at most 2 px and brighter for the selected curve.
- Show small anchor markers only for the selected connection. Do not show tangent handles.
- Keep visual geometry non-raycastable. Use a separate transparent pick tube or equivalent generous hit surface so the line stays visually slim but easy to grab.
- Tag pick roots with explicit editor-only connection/anchor `userData`; climb parents in the existing selection utilities.
- Rebuild the selected helper curve from draft document anchors during a drag. Do not force a committed runtime graph rebuild for every pointer move.
- Dispose line geometry, pick geometry, materials, and helper roots on selection change/teardown.
- Hide all curve/anchor helpers during camera preview, asset placement, and connected-node placement.
- Never import the helper from `MuseumScene`, `CameraDirector`, or any visitor module.

Remove the `StaffPath` import/mount from `MuseumScene.svelte` and delete the obsolete component once no imports remain. This intentionally changes `/museum`: no gold route ribbons or replacement camera lines are visible.

## Adding Nodes and Connections

### Add Connected Camera Node

The command requires a selected source node and an active editable room. It enters a pending placement mode and commits nothing until a valid room-floor click.

On a valid floor hit, create the node and first connection in one transaction:

- Eye = floor hit plus `1.65 m` world Y.
- Target height = floor hit plus `1.25 m` world Y.
- Target direction = the editor camera's horizontal forward vector, normalized, at a distance of `3 m`; fall back to active-room local `-Z` if the projection is degenerate.
- Convert eye and target to the active room's local coordinates before persistence.
- Generate collision-free deterministic IDs from the current document. Default label is `Camera Node N`; ID is read-only and label is atomically editable afterward.
- New node adjacency contains the source node. Add the new node ID to the source's `connectedNodeIds` exactly once.
- Create a straight `auto-bezier` connection with no interior anchors.
- Leave `nextNodeId` and `previousNodeId` absent and do not modify the source's guided links.
- Resolve/validate the candidate, commit once, select the new node's position handle, and frame its eye/target pair.

An invalid floor hit reports status and remains pending. Escape cancels without history. Preview start and asset placement cancel this pending mode. Starting it cancels framing, asset placement, and any connection-creation mode.

Put default values in one named constant object; do not duplicate `1.65`, `1.25`, or `3` in UI/store/helpers.

### Connect Existing Nodes

- Start from a selected source node, enter **Connect to Existing**, then click a destination node row/helper.
- Reject self-links and an existing undirected edge with a status message.
- Add one straight `auto-bezier` connection and update both nodes' `connectedNodeIds` in one transaction.
- Do not change guided links.
- Select the new connection after commit. Escape cancels the pending source without history.

Do not support committed isolated nodes. Node deletion, connection deletion, and guided-order editing remain outside this feature; undo covers newly created entities during the session.

## Inspector and Preview

- Node inspector retains eye/target selection, atomic XYZ editing, node preview, and next transition preview.
- Add node label editing as one atomic text commit; ID and room remain read-only.
- Connection inspector shows endpoint labels/IDs, path kind, anchor count, clearance, **Convert to Smooth Curve**, **Preview A → C**, and **Preview C → A**.
- Anchor inspector shows stable ID, coordinate-space badge, and one atomic XYZ vector form. Provide **Delete Anchor** as one transaction; deleting the final interior anchor leaves a valid straight connection.
- Numeric edits are rejected during preview or any active transform. Empty/non-finite/partial/unchanged values restore without history.
- Connection preview resolves that exact edge and direction, captures an immutable route, uses shared visitor projection/motion, holds at the destination, and restores the exact editor Orbit pose on Stop/Escape.
- Preview cannot start during a gizmo/direct path drag. It never frames, mutates the document, or enters history.

Escape priority becomes:

1. Cancel TransformControls camera-node/anchor drag.
2. Cancel direct path drag.
3. Stop preview and restore Orbit.
4. Cancel connected-node placement / connection creation / asset placement.
5. Run normal selection clearing.

## Implementation Slices

1. **Schema and migration:** add stable anchors and discriminated path kinds; migrate v1 to the next version; extend cloning/validation and exact legacy parity tests.
2. **Shared route/motion:** retain path parts through BFS, implement auto-Bézier compilation/reversal/mixed routes, expose exact-edge routes, and keep visitor/editor samples shared.
3. **Remove visitor path:** remove `StaffPath` from `MuseumScene` and verify no replacement path visual reaches visitor imports.
4. **Selection and helpers:** add discriminated navigation selection, connection/anchor tags, registry, slim editor curve, pick surface, disposal, and one-gizmo anchor ownership.
5. **Direct manipulation:** centralize pointer claiming, implement threshold-to-bend transaction, horizontal drag plane, legacy conversion, cancellation, and Orbit restoration.
6. **Node/topology commands:** add connected-node placement, connection-to-existing workflow, stable IDs, symmetric adjacency, defaults, and candidate validation.
7. **Inspector and preview:** add connection/anchor UI, label/vector commits, deletion/conversion, and exact-edge bidirectional preview.
8. **Regression/documentation:** run automated/manual acceptance, update camera/layout ownership documentation, and create a completed feature handoff.

Keep pure curve math, nearest-parameter/refinement, room-space conversion, ID allocation, and selection resolution outside Svelte components with focused unit tests. Svelte components should own lifecycle and event wiring, not duplicate geometry policy.

## Automated Test Plan

### Schema, migration, and graph

- Version-1 migration assigns deterministic stable anchor IDs and preserves every legacy runtime position sample/duration before conversion.
- Inputs remain unmodified; generated endpoints are fresh and never serialized.
- Room-local and world-space anchors resolve correctly in yawed rooms.
- Duplicate/empty anchor IDs, non-finite points, bad clearance, unknown endpoints, self/duplicate edges, asymmetric adjacency, and disconnected graphs fail predictably.
- New node plus first connection is one history entry and never exposes an isolated committed node.
- New/existing connection commands update adjacency symmetrically without modifying guided links.

### Curve and motion

- Auto curves pass through all anchors, are straight with only two endpoints, and are C1-continuous at non-degenerate interior anchors.
- Centripetal tangent generation is deterministic for uneven spacing, duplicate/coincident anchors, and zero-length segments.
- Forward and reversed traversal sample the same geometry in opposite directions.
- Mixed legacy/auto multi-hop routes remain contiguous and use the minimum legacy clearance only where applicable.
- Exact samples at 0/1, clamped progress, smootherstep, output-vector reuse, singleton zero duration, distinct-node zero-position minimum duration, and global min/calculated/max durations remain covered.
- Live start-pose override begins at the supplied eye/target without mutating authored data and preserves Paris departure behavior.
- Editor connection visualization and connection preview sample the exact same shared position curve as the visitor.

### Interaction and history

- Click line selects only; no frame/history.
- Line drag below threshold does not insert an anchor.
- Crossing the threshold inserts exactly one stable anchor and continues the same drag.
- Direct dragging preserves Y, uses the correct room/world basis, and commits once.
- Legacy bend conversion plus anchor insertion is one undoable transaction; Escape restores the exact legacy path kind and points.
- Existing anchor direct drag, gizmo drag, XYZ commit, Delete Anchor, conversion, node label edit, node creation, and connection creation each create at most one history entry.
- No movement, invalid input, pointer-cancel, lost capture, window blur, and Escape create no history and restore helper/document/Orbit state.
- Selection is blocked during drag and reconciles by stable ID after undo/redo.
- Switching placement ↔ node ↔ anchor detaches the old gizmo before attaching the new target; camera targets never inherit placement snap/mode/grounding.
- Alt-cycle remains placement-only. Pending placement and preview hide paths and reject path mutations.

### Preview, visitor, and production

- Exact-edge preview works in both directions, including parallel-route fixtures, and adds no history.
- Stop immediately, mid-motion, at completion, after resize, and repeated start/stop restore the exact Orbit snapshot.
- Preview remains immutable if external references change and rejects new selection/framing/mutation commands.
- `MuseumScene` no longer mounts `StaffPath`; visitor render/component tests contain no path visual.
- Editor curve helpers are unreachable from visitor imports.
- Production `/dev/museum-editor` returns 404 and production chunks contain no editor path-helper entry or symbols.

## Manual WebGL Acceptance

1. Confirm `/museum` has no gold staff ribbon, curve line, anchor, or editor helper.
2. In `/dev/museum-editor`, confirm all connections use a subtle slim line and only the selected connection shows anchors.
3. Click a line, orbit from empty space, and Alt-cycle placements. Confirm pointer ownership feels unambiguous.
4. Drag an empty line in one gesture; verify an anchor appears under the pointer, the curve bends smoothly without tangent handles, Y stays fixed, and one undo restores the original path.
5. Drag existing anchors directly and with TransformControls; verify yawed-room local coordinates, Escape cancellation, no-movement behavior, and XYZ/Y refinement.
6. Convert and preview every legacy connection in both directions. Check doors, corridors, walls, ceilings, motion duration, synthesized look, and multi-hop free navigation.
7. Add a connected node from a source node; verify default eye/target, symmetric adjacency, straight initial curve, label editing, free-mode reachability, and unchanged guided order.
8. Connect two existing nodes; verify duplicate/self rejection and one-step undo/redo.
9. Exercise pending asset placement, node placement, curve dragging, preview, selection changes, Escape, and repeated Orbit restore transitions.
10. Regression-check guided navigation, reduced motion, Paris live departure/free-look, unusual editor zoom/damping/distance limits, and viewport resize during preview.

## Verification and Acceptance

From the repository root:

- `npm test`
- `npm run check`
- `npm run build`
- Development WebGL pass at `/dev/museum-editor` and `/museum`
- Production preview: `/museum` returns 200; `/dev/museum-editor` returns 404
- Inspect the production chunk graph: no editor path-helper entry and no editor component reachable from visitor imports

The feature is complete only when direct line bending is comfortable without requiring tangent knowledge, every edited route clears the graybox in both directions, preview and visitor samples match, undo/redo/cancellation are atomic, visitor path visuals are gone, and production isolation remains intact.

## Non-Goals and Deferred Work

- Explicit Bézier tangent handles or free/aligned/broken tangent modes.
- Per-connection speed/duration and segment-aware multi-hop timing.
- Authored look curves or `targetWaypoints` editing.
- Collision, navmesh, automatic door avoidance, or clearance enforcement.
- Guided `nextNodeId` / `previousNodeId` authoring.
- Node/connection deletion and graph branch management.
- Multi-room simultaneous editing; use the active single-room context for new authored entities.
- Visitor-visible route lines or replacement floor ribbons.

## Documentation/Handoff Work During Implementation

- Correct `docs/CAMERA_AND_LAYOUT.md`: scene JSON ownership, interior-only persisted anchors, generated endpoints, `camera-route` → `camera-motion` ownership, auto-Bézier behavior, editor path workflow, and removal of `StaffPath`.
- Update `docs/agent-handoffs/CURRENT.md` to the actual implementation commit and verification counts.
- Add a completed handoff under `docs/agent-handoffs/` only after implementation; keep this file as the proposed design record.
- Preserve the Phase 6 contracts for shared motion, committed preview graphs, exact Orbit restoration, modal guards, and the one persistent gizmo.
