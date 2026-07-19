# Camera, layout & path-authoring guide

Guide for future work on museum **3D camera**, spatial layout, navigation graph, and development editor. Companion to [`AGENTS.md`](../AGENTS.md).

> Camera here = Three.js `PerspectiveCamera` guided along a graph. No webcam, MediaStream, or video capture.

---

## 1. Mental model and ownership

Author static architecture in room data; author editable scene content and navigation in versioned scene JSON; resolve once; reuse one graph and one motion implementation.

```text
rooms.ts                                  museum-scene.json v2
  room pose/dimensions/openings             placements
  roomPoint / roomLocalPoint                node eye/target + guided links
  yaw-aware room containment                connection path kind + interior anchors
              │                                      │
              └──────────────┬───────────────────────┘
                             ▼
                    scene-codec.ts
             strict v1/v2 validation + v1 migration
                             ▼
                        scene.ts
        room-local → world + fresh generated endpoints
                             ▼
                 one resolved navigation graph
                    ┌────────┴────────┐
                    ▼                 ▼
             camera-route.ts    museum-state.svelte.ts
           BFS / edge routes       eligibility / FSM
                    ▼
             camera-motion.ts
       shared curves / timing / easing / sampling
                    ├──────── visitor CameraDirector
                    └──────── editor helpers + preview
```

| Layer | Owns | Must not own |
|-------|------|--------------|
| `rooms.ts` | Room architecture and yaw transforms | Placements, navigation nodes, connections |
| `museum-scene.json` | Editable placements, nodes, guided links, connection interiors | Generated endpoints or Three.js controls |
| `scene-codec.ts` | Strict parsing, semantic validation, v1 migration, canonical v2 serialization | Runtime world-space mutation |
| `scene.ts` | Local/world resolution, generated endpoint anchors, runtime graph | Alternate validation/schema policy |
| `camera-route.ts` | BFS, edge orientation, path-part assembly, synthesized targets | Three.js curve construction or timing |
| `camera-motion.ts` | Three.js position/target curves, projection, timing, easing, sampling | Graph traversal or tour eligibility |
| `CameraDirector.svelte` | Visitor playback, transition completion, Paris free-look | Duplicate route/curve math |
| Editor store/components | Transactions, history, selection, authoring UX | Visitor imports or another runtime graph |

Historical note: navigation and Paris placement arrays were removed from `rooms.ts`; the former Paris layout module and visitor `StaffPath` were deleted. Do not restore them.

---

## 2. Static layout and coordinate space

### Rooms

- World is Y-up; room floors sit at Y = 0.
- Each `MuseumRoom` has a world `position`, Y-axis `rotation`, dimensions, openings, and colors.
- `roomPoint(roomId, localPoint)` resolves room-local data to world space.
- `roomLocalPoint(roomId, worldPoint)` is the inverse yaw transform used when editor drags room-owned data.
- `isWorldPointInsideRoomXZ()` tests a point against the room’s yaw-aware footprint.
- `music-chamber` is special: `MuseumShell` skips it; `CentralChamber.svelte` draws its circular floor and piano.

### Room fields

| Field | Meaning |
|-------|---------|
| `dimensions` | `[width, height, depth]` local room box |
| `openings[]` | Wall cutouts on `neg-x` / `pos-x` / `neg-z` / `pos-z` |
| `openings[].kind` | `door` portal or `sightline` window |
| `openings[].offset` | Shift along wall; default zero |
| `color` / `accentColor` | Shell and prop tint |

Current shell supports one opening per wall side. Extend `MuseumShell` before relying on multiple openings on one side.

### Adding or reshaping a room

1. Add/edit `museumRooms` in `rooms.ts`.
2. Add/update room component under `lib/museum/rooms/` and mount it in `MuseumScene.svelte`.
3. Add/edit scene placements and navigation through `/dev/museum-editor`; export canonical scene JSON and replace checked-in `museum-scene.json` manually.
4. Place connection anchors through actual door openings with visible clearance.
5. Preview every affected connection in both directions and test multi-hop visitor travel.

Architecture and navigation remain separate sources. Moving/rotating a room automatically moves room-local nodes/anchors, but world-space anchors must be checked manually.

---

## 3. Scene document v2

`apps/museum/src/lib/content/museum-scene.json` is the checked-in editable source for placements and navigation.

### Connection shape

```ts
type ScenePathAnchor = {
  id: string;
  position: Vec3;
  roomId?: MuseumRoomId;
};

type ScenePositionPath =
  | { kind: 'rounded-polyline'; anchors: ScenePathAnchor[] }
  | { kind: 'auto-bezier'; anchors: ScenePathAnchor[] };

type SceneConnection = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  clearance: number;
  positionPath: ScenePositionPath;
  targetWaypoints?: SceneWaypoint[];
};
```

Persist **interior anchors only**. Each anchor ID is stable within its connection and drives selection, history reconciliation, and undo/redo. `roomId` means its position is room-local; omitted `roomId` means world-space.

`resolveSceneDocument()` resolves interiors and inserts fresh world-space endpoints:

```text
node:<fromNodeId>:position
authored interior anchors...
node:<toNodeId>:position
```

Generated endpoints are never serialized. Interior IDs matching either generated endpoint ID are invalid. Moving a node therefore updates all incident runtime endpoints without rewriting connection interiors.

### Version compatibility

- Codec parses v1 and v2 with version-specific strict keys and semantics.
- Valid v1 is checked under original all-node guided-cycle rules before migration.
- Migration maps every v1 `positionWaypoints` item to a stable `${connectionId}-anchor-${NN}` interior anchor and marks path `rounded-polyline`.
- Validation/import returns canonical v2; serialization always emits v2 with two-space indentation and trailing newline.
- Do not reinterpret v1 fields or add another parser around the resolver.

### Path kinds

`rounded-polyline`

- Compatibility representation for migrated paths.
- Uses straight spans plus quadratic corner fillets.
- `clearance` caps position corner radius; default authored value is about `0.35 m`.
- Consecutive rounded edges are coalesced by the route builder with duplicate suppression and minimum clearance, preserving legacy multi-hop samples/timing.

`auto-bezier`

- Default for newly created connections and converted/bent paths.
- Passes through every generated endpoint and authored interior anchor.
- Uses automatically derived centripetal Catmull–Rom tangents (`alpha = 0.5`) converted to cubic Bézier spans.
- Two distinct endpoints form a straight cubic; duplicate anchors remain finite/degenerate-safe.
- Non-degenerate interior anchors are C1 continuous within one connection. Separate graph edges guarantee only C0 at their shared node.
- Tangent controls are derived, never persisted, and not exposed in editor.
- `clearance` remains corridor metadata; it does not alter auto tangents.

`targetWaypoints` remains typed but unused. Travel look targets are synthesized from ordered position anchors.

### Validation invariants

- IDs non-empty and unique in their required scope; anchor IDs unique within each connection.
- Finite coordinates; positive clearance; camera eye and target distinct.
- No unknown endpoints, self-connections, duplicate undirected edges, or asymmetric adjacency.
- Entire undirected navigation graph connected.
- v2 node defines both guided links or neither.
- Guided subset forms one reciprocal `next`/`previous` cycle; unlinked nodes are free-only.

---

## 4. Navigation and visitor behavior

### Nodes

| Field | Role |
|-------|------|
| `position` | Resting camera eye; typically `1.65 m` above floor |
| `cameraTarget` | Resting `lookAt`; new-node default height `1.25 m` |
| `connectedNodeIds` | Undirected neighbors; must exactly match connections |
| `nextNodeId` / `previousNodeId` | Guided cycle links; both present or both absent |
| `lockInteraction` | Supported by state; unused in checked-in data |

Current guided loop has eight nodes:

```text
entrance-start → poland-threshold → departure-corridor → paris-seat
→ workshop-desk → music-entry → music-center → legacy-return
→ entrance-start
```

Editor-created nodes deliberately omit guided links. They are free-only until a future guided-order workflow exists.

### Eligibility

- Guided mode allows `nextNodeId`, plus `previousNodeId` only after that room was visited.
- Free mode allows any other node; motion still follows graph edges through BFS.
- A free-only active node has no eligible guided Next/Back; HUD buttons remain disabled until free navigation reaches a guided node.
- No navigation request starts during `isTransitioning`.
- Reduced motion resolves the same route but lands instantly.

### Visitor visual contract

`/museum` draws no navigation ribbon, path line, curve anchor, tangent, or editor helper. Clickable navigation spheres remain part of visitor interaction. Curve visualization exists only under development editor entry.

---

## 5. Route and shared motion

### Route assembly

`camera-route.ts` owns topology only:

1. Resolve a BFS edge sequence for node-to-node travel.
2. Reverse connection anchors when traversing authored direction backward.
3. Emit typed `positionParts` retaining `rounded-polyline` versus `auto-bezier` boundaries.
4. Coalesce consecutive rounded edges for legacy parity; keep auto edges separate.
5. Verify contiguous shared endpoints.
6. Flatten ordered anchors only to synthesize look-ahead `targetPoints`.
7. Return traversed `nodeIds` for Paris activation.

`getCameraConnectionRoute(connectionId, direction, graph?)` resolves exactly one selected edge in either direction. Editor connection preview uses this helper, not BFS.

### Curve and playback

`camera-motion.ts` is sole owner of Three.js camera geometry:

- `createCameraPositionPath()` builds exact shared position `CurvePath` used by visitor, editor visuals, picking, and preview.
- `createCameraMotion()` clones/validates input, applies optional live start pose before tangent construction, compiles target path, primes arc lengths, and calculates duration.
- `sampleCameraMotion()` clamps progress, applies smootherstep, and writes into reusable output vectors.
- Duration = total position arc length / `6.2 units/s`, clamped to `1.25–4.8 s`.
- True singleton route is zero duration; distinct-node target-only motion retains minimum duration.
- FOV `54`, near `0.1`, far `90`; visitor DPR capped `[1, 1.5]`; shadows off.
- Synthesized mid-path look uses roughly two ordered anchors ahead with Y capped at `1.5`.

`CameraDirector.svelte` consumes shared motion and retains transition completion, reduced motion, Paris route activation, live-departure override, and clamped stable-stop Paris free-look.

Never approximate editor curves separately: rendered line, generous pick surface, nearest-progress refinement, exact-edge preview, and visitor must all trace `createCameraPositionPath()` geometry.

---

## 6. Development editor path workflow

`/dev/museum-editor` uses one discriminated navigation selection:

```ts
type EditorNavigationSelection =
  | null
  | { kind: 'node'; nodeId: string; handle: 'position' | 'target' }
  | { kind: 'connection'; connectionId: string }
  | { kind: 'anchor'; connectionId: string; anchorId: string };
```

Navigation and placement selection are mutually exclusive. Stable IDs, not array indices, back connection/anchor selection and undo reconciliation.

### Curves and anchors

- Every connection gets a slim editor-only screen-space curve from shared motion geometry.
- Visual line is non-raycastable; separate transparent generous-width geometry handles picking.
- Selected connection alone shows its interior anchor markers.
- Click curve selects connection without history or framing.
- Drag empty curve past 4 px threshold converts legacy path if needed, inserts one stable anchor at nearest curve progress, and drags it in the same transaction.
- Drag existing anchor directly on its starting horizontal world plane: X/Z change; Y stays fixed.
- Shared persistent TransformControls then provides unsnapped world-space XYZ translation. Numeric inspector supports exact XYZ edits.
- Existing room ownership is preserved. New anchor becomes room-local only if initial hit is inside active room’s yaw-aware footprint; otherwise it is world-space.
- Returning within `1e-4 m`, Escape, pointer cancel, capture loss, blur, or teardown restores original document/selection/Orbit state and adds no history.
- Explicit **Convert to Smooth Curve** and **Delete Anchor** each commit atomically. Deleting an anchor preserves current path kind.

Helper sampling is `8 samples/m`, clamped to `32–512`. Nearest insertion uses 128 coarse steps plus 12 refinement iterations.

### Creating topology

**Add Connected Camera Node** requires selected source node and active editable room (currently Paris):

- Valid room-floor click creates node plus first connection in one transaction; no isolated committed node.
- Defaults: eye `1.65 m`, target `1.25 m`, horizontal target distance `3 m`, clearance `0.35 m`.
- Eye/target persist room-local; initial connection is straight `auto-bezier` with no interior anchors.
- Symmetric adjacency is updated. Guided links remain absent, so new node is free-only.
- IDs use smallest free `camera-node-N`; label defaults `Camera Node N`; connection ID starts from `${sourceId}-${destinationId}` and resolves collisions.

**Connect Existing Nodes** captures selected source and accepts a valid distinct unconnected destination. It creates one straight auto connection, updates adjacency symmetrically, leaves guided links unchanged, and commits once.

### Pointer and modal ownership

Priority: preview/modal shield → TransformControls → active direct-path drag → pending creation/placement → node/anchor helpers → curve picking → Orbit → placement selection.

Alt is placement-only. Curves/anchors ignore Alt. Preview and pending placement/connection modes hide all path helpers. One persistent gizmo detaches before changing targets; anchor/node targets never inherit placement snap, rotate, scale, or grounding.

### Preview and persistence

- Node and exact-edge preview use an immutable committed graph and shared `CameraMotion`.
- Preview adds no history and restores exact pre-preview Orbit/camera state on Stop, Escape, completion teardown, or repeated cycles.
- Editor session is a deep clone. One transaction creates at most one history entry; invalid/no-op/cancel creates none.
- Browser Copy/Download exports canonical v2 but never writes repository files or clears dirty state.
- Valid v1/v2 import normalizes to v2. Replace checked-in JSON manually, then test/build.

---

## 7. Production isolation

- `EditorCameraPathHelpers` mounts only through editor viewport, outside `MuseumScene`.
- Visitor modules must never import editor store, path helpers, inspector, or editor entry.
- Vite production editor-entry plugin substitutes stub behavior; `/dev/museum-editor` returns 404.
- Production verification must inspect built chunks as well as route status: no real editor/path-helper symbols reachable from visitor output.

---

## 8. Limits and failure modes

| Limitation | Consequence | Mitigation |
|------------|-------------|------------|
| No collision/navmesh | Curves can clip walls/ceilings | Author through openings; preview both directions |
| Look targets synthesized | Mid-path framing can float | Tune position anchors; authored look paths deferred |
| Auto edges C0 across connections | Multi-hop direction can kink at a node | Align nearby anchors and preview multi-hop route |
| No tangent handles | Exact tangent shaping unavailable | Add/move pass-through anchors |
| No per-edge timing | Long/short edges share global speed policy | Keep current global motion constants |
| Guided order not editable | New nodes are free-only | Use free mode; future guided-order workflow required |
| No node/connection deletion | Topology cleanup requires future tooling/manual JSON | Validate exported scene before replacing checked-in file |
| One active editable room | New room-local entities scoped to Paris | Extend editor room context deliberately |
| Free-look only at stable Paris stop | Eye fixed; yaw/pitch clamped | Extend Director without adding second camera |
| Far plane 90 / fog 22–54 | Distant geometry fades | Raise fog/far if world grows |
| Mobile hides route list | Discovery through Next/spheres only | Add mobile route UI if needed |

---

## 9. Validation checklist

After architecture, scene, or camera edits:

- [ ] `roomPoint` / `roomLocalPoint` used for room-owned data; yawed rooms checked
- [ ] Scene export is canonical version 2; no generated endpoint IDs persisted
- [ ] Stable anchor IDs remain unique within each connection
- [ ] `connectedNodeIds` exactly match undirected connection edges
- [ ] Guided nodes define reciprocal next/previous links; free-only nodes define neither
- [ ] Entire graph remains connected
- [ ] Curves enter/exit through openings and clear walls/ceilings
- [ ] Every edited edge previewed forward and reverse
- [ ] Representative mixed/multi-hop route clears geometry
- [ ] Reduced motion lands on exact destination eye/target
- [ ] Paris live departure and stable-stop free-look still work
- [ ] `/museum` shows no route lines or editor helpers
- [ ] Undo/redo, no-op, Escape, blur, and pointer-cancel remain atomic
- [ ] `npm test`, `npm run check`, and `npm run build` pass
- [ ] Production `/museum` = 200; `/dev/museum-editor` = 404; editor implementation absent from chunks

---

## 10. Quick reference

| Task | Edit/use first |
|------|----------------|
| Move/reshape room or opening | `rooms.ts` |
| Place/move exhibit asset | `/dev/museum-editor` → export `museum-scene.json` |
| Improve resting shot | Select node position/target in editor |
| Fix travel clipping | Select connection; move/add stable anchors |
| Preserve old path behavior | Keep `rounded-polyline` |
| Smooth a connection | Convert/bend to `auto-bezier`; preview both ways |
| Add free-only stop | **Add Connected Camera Node** |
| Connect existing stops | **Connect Existing Nodes** |
| Change guided order | Manual schema edit only; UI deferred |
| Change route traversal | `camera-route.ts` |
| Change curve/timing/easing/projection | `camera-motion.ts` |
| Change navigation eligibility | `museum-state.svelte.ts` |
| Change editor path interaction | `editor-camera-path.ts` + editor selection/store |
| Change path visual/picking | `EditorCameraPathHelpers.svelte` |
| Change shell look | `MuseumShell.svelte` / materials |
