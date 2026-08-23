# Camera and tour

**Read when:** nodes, connections, paths, guided order, timeline, framing, sequence preview.  
**Last reviewed:** 2026-08-22
**Deep dump (rare):** [`../archive/CAMERA_AND_LAYOUT.md`](../archive/CAMERA_AND_LAYOUT.md)

---

| Term | Meaning |
|------|---------|
| Camera node | Eye / target / FOV (room-local) |
| Connection | Edge; JSON stores **interior** anchors only |
| Path kinds | `rounded-polyline` · `auto-bezier` (no tangent handles) |
| Order | Open chain (main route + branches); loop derived from a distinct tail↔head connection |

Defaults: eye **1.65 m**, target **1.25 m**, distance **3 m**, clearance **0.35 m**.  
Resolver inserts `node:<id>:position` — **never** persist those as interiors.  
Editor preview + visitor share **`camera-route` + `camera-motion` only**.

Directional view tracks may carry one optional `framingEnvelope` per travel
direction: `0 ≤ enterStart ≤ enterEnd ≤ exitStart ≤ exitEnd ≤ 1`. Route
construction selects and deep-copies only the oriented direction's envelope;
motion samples its enter/exit smootherstep ramps against edge-local distance
progress and applies the resulting weight to both Cartesian target and FOV.
Missing envelope preserves legacy full-authored framing; envelopes on tracks
without authored keys remain automatic. Motion creation compiles stateless
minimum-standoff, POI angular-rate, and hazardous late-exit bypass guards;
runtime seeks apply those target-only corrections deterministically. Larger FOV
is wider / zoomed out; smaller FOV is tighter / zoomed in.

Verified dense invariants (P1.4, 2026-08-19): over whole transitions and at
arbitrary seeks, enveloped motion stays finite with `distance(target, eye) ≥
VISITOR_CAMERA_PROJECTION.near`, canonical node poses at `p = 0/1` in every
branch (forward keys · reversed keys · reversed-no-key `travelFacingEnds` ·
legacy no-envelope · automatic no-key), deterministic great-circle fallback on
over-capacity and near-antipodal remaps, no adjacent 180° pops, bounded angular
rate wherever compiled rate limiting applies (peak measured from the compiled
segment pairs, never the nominal policy constant), and bypass/standoff guards
that change only the target. The double-whip bypass turns on exactly at the
policy off-axis, path-excess, and angular-rate thresholds. FOV rides the same
envelope weight as the target and is never changed by target-only guards.

One exception is deliberate, not a defect: **zero-width envelope ramps**
(`enterStart = enterEnd` or `exitStart = exitEnd`) are legal intentional steps.
They are exempt from the smooth-ramp rate assertion; they must still be
deterministic, finite, non-degenerate, and exact on both sides of the bound.

## Camera Plan (P1.5)

**Canonical for camera-graph authoring behavior.** Routing/chrome:
[`shell.md`](./shell.md) · exposure MUSTs:
[`../Design-specs/Shell-camera-workspaces.md`](../Design-specs/Shell-camera-workspaces.md) §9.

Camera → Plan is the live top-down camera-graph authoring surface over the
architectural backdrop. It answers **where** cameras and paths are; framing
stays in Camera 3D. Camera Plan reads `store.document` + `store.rooms`
(`resolvePlanSceneGraphFromDocument`), samples the exact shared draft curve
(`createDraftConnectionPositionPath` + the visual sample-count policy), and
reuses every store command (`beginCameraPlacement`,
`createPendingNavigationNodeAt`, `beginConnectExistingNodes`,
`connectPendingNavigationNode`, `connectNavigationNodes`,
`deleteNavigationNode`, `deleteConnection`, `setConnectionTiming`) and
selection action (`selectNavigationNode`, `selectConnection`,
`selectCameraConnectionDirection`, `selectAnchor`). Node/edge/connection
selection, discovery direction, Sequence panel, timeline, and history survive
Plan ↔ 3D; a persisted view-keyframe selection gets only a passive
“Edit framing in Camera 3D” message.

- **Backdrop:** live compiled geometry, subdued, never selectable — Camera
  Plan contains no `selectLayout*`/`clearLayoutSelection`/`layoutInteraction`
  path (source-asserted). Add Camera needs a room-floor hit.
- **Hit priority:** camera node → visible interior anchor → connection curve →
  empty (deselects the active camera selection). Tolerances are screen-px
  constants divided by `pixelsPerMeter`.
- **Edges:** every connection once, undirected, no arrowheads; retained
  (non-flow) edges stay visible in a distinct style. Order changes numbering,
  never the edge set.
- **Order/free:** ordered nodes show stable `1…N` labels from
  `store.mainFlowNodeIds`; unsequenced nodes show an unnumbered dashed ring and
  “Unsequenced” in the inspector.
- **Anchors:** interior anchors render only for the selected connection;
  dragging an edge with no anchor inserts one at the nearest curve progress
  (shared `getCameraPathInsertionIndex` / `insertConnectionAnchorAtWorldPoint`
  ownership rules) then drags it. Authored node/anchor Y is preserved
  byte-for-byte; snap adjusts X/Z only.
- **Timing:** each edge labels both directions with the effective duration
  (`A→B` / `B→A`), authored values distinguished from automatic fallbacks.
  The Camera Plan connection inspector authors `durationSeconds` per direction
  through `setConnectionTiming` (finite-positive validation, one undo step,
  “Use automatic” removes only duration, preserving easing). Path length,
  effective duration, and derived speed come from the exact per-direction
  `CameraMotion` the timeline constructs — never UI-local math.
- **History:** add, connect, delete, node drag, anchor insert/drag, and timing
  edits each produce one scene-history entry; selection/hover/pan/zoom/toolbar
  changes and failed/cancelled gestures produce none. Escape cancels an active
  drag first (capture-phase, cannot fall through to pending-command
  cancellation), then the pending navigation command, then returns to Select.

Visitor: plays the open-chain order (loop derived); free nodes via BFS; transitioning = no nav; Paris = fixed eye + free-look. No ribbons on `/museum`.

Limits: no collision/navmesh; synthesized look; timeline drag-connect ≤1 new edge; guarded deletes.
