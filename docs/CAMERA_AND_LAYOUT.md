# Camera, layout & features guide

Guide for future work on the museum’s **3D camera**, **spatial layout**, and related features. Companion to [`AGENTS.md`](../AGENTS.md).

> Camera here = Three.js `PerspectiveCamera` guided along a graph. There is no webcam, MediaStream, or video capture.

---

## 1. Mental model

Author once in data; derive everything else.

```
rooms.ts
  ├── museumRooms        → MuseumShell walls, floors, openings, portals
  ├── navigationNodes    → resting camera pose + clickable spheres + tour links
  └── navigationConnections → StaffPath ribbons + CameraDirector motion
```

| Layer | Job | Must not |
|-------|-----|----------|
| Content (`rooms.ts`) | Positions, narrative IDs, waypoints | Know about Three curves or DPR |
| Route (`camera-route.ts`) | BFS edges → polyline + look targets | Own duration/easing |
| Director (`CameraDirector.svelte`) | Rounded path, smootherstep, `lookAt` | Own tour eligibility |
| State (`museum-state.svelte.ts`) | Who may move where / when | Own geometry |
| Shell / StaffPath | Visualize content | Invent a second path graph |

Historical note: an older layered system (separate shell builders, visitor rigs, 16-node graphs) was intentionally replaced by this graybox. Prefer extending this pipeline over restoring parallel systems.

---

## 2. Layout system

### Coordinate space

- World Y-up; rooms sit on Y = 0 floors.
- Each room has `position` (world) and `rotation` (yaw on Y used by `roomPoint`).
- Prefer **local** points via `roomPoint(roomId, [x, y, z])` so rotating a room moves its nodes and waypoints together.
- Music-chamber stops currently use some **world** coordinates — keep them consistent with openings when editing that room.

### Rooms (`MuseumRoom`)

| Field | Meaning |
|-------|---------|
| `dimensions` | `[width, height, depth]` local box |
| `openings[]` | Cutouts on `neg-x` / `pos-x` / `neg-z` / `pos-z` |
| `openings[].kind` | `door` (portal frame) or `sightline` (window cut) |
| `openings[].offset` | Shift opening along the wall (default 0 = center) |
| `navigationNodeIds` | Which stops belong in this room |
| `color` / `accentColor` | Shell / prop tint |

`music-chamber` is special: shell skips it; `CentralChamber.svelte` draws the circular floor + piano.

### Adding or reshaping a room

1. Add/edit entry in `museumRooms` (pose, dims, openings, colors).
2. Add or update room component under `lib/museum/rooms/` and mount it in `MuseumScene.svelte`.
3. Add navigation node(s) with `roomPoint` positions/targets.
4. Wire `connectedNodeIds`, `nextNodeId`, `previousNodeId` for the circular (or branched) tour.
5. Add `navigationConnections` polylines that pass through door openings, not through solid walls.
6. Visually verify StaffPath ribbons and play the transition in guided + free mode.

### Openings checklist

- Door width/height in data must match the gap the camera path uses.
- Sightlines face the chamber for framed views; they are not traversal edges unless you also add a connection.
- One opening per wall side in the current shell builder — do not assume multi-opening walls without extending `MuseumShell`.

### Staff path

`StaffPath.svelte` draws connection polylines as parallel gold box segments. If the ribbon looks wrong, fix **waypoints**, not the ribbon math (unless the visualizer itself is buggy).

---

## 3. Navigation graph

### Nodes (`NavigationNodeData`)

| Field | Role |
|-------|------|
| `position` | Camera / sphere at rest (eye ~1.65) |
| `cameraTarget` | `lookAt` at rest |
| `connectedNodeIds` | Undirected neighbors (must match edges) |
| `nextNodeId` / `previousNodeId` | Guided tour sequence |
| `lockInteraction` | Supported in state; **unused in current data** |

Tour loop (8 nodes):

```
entrance-start → poland-threshold → departure-corridor → paris-seat
→ workshop-desk → music-entry → music-center → legacy-return
→ entrance-start
```

### Connections (`MuseumConnection`)

| Field | Role |
|-------|------|
| `fromNodeId` / `toNodeId` | Directed authoring; traversal is undirected |
| `positionWaypoints` | Ordered polyline including endpoints |
| `clearance` | Min corridor feel; used as corner fillet cap (~0.35) |
| `targetWaypoints` | Typed, **unused** — look targets are synthesized |

Waypoints should:

1. Start and end on the connected node positions.
2. Pass through door centers / corridors with room to spare (clearance).
3. Keep Y stable near eye height unless a deliberate rise/drop is intended.
4. Avoid sharp zigzags denser than fillet radius (~0.42) can smooth.

When reversing an edge, `camera-route.ts` reverses the waypoint array automatically.

---

## 4. Camera system

### Pipeline

1. UI / keys / spheres → `museumState.requestNode(id)`.
2. State sets `targetNodeId` + `isTransitioning` if `canNavigateTo`.
3. `CameraDirector` `$effect` calls `getCameraRoute(active, target)`.
4. Route = BFS over connections → concatenated positions + look-ahead targets.
5. Director builds rounded `CurvePath` (line segments + quadratic corner fillets).
6. Each frame: smootherstep along path; duration ≈ `pathLength / 6.2` clamped to **1.25–4.8s**.
7. At `t >= 1` → `completeTransition` updates active node + visited rooms.
8. At rest, camera snaps to active node `position` / `cameraTarget`.

### Camera defaults

- FOV **54**, near **0.1**, far **90**
- DPR capped **[1, 1.5]**, shadows **off**
- Look mid-path: look ahead ~2 waypoints, Y capped to **1.5**
- Reduced motion: `transitionProgress` starts at 1 (instant)

### Keyboard (Director)

| Keys | Action |
|------|--------|
| `→` `↓` `Space` | Next |
| `←` `↑` `Backspace` | Back |
| `M` | Toggle guided / free |
| `R` | Toggle reduced motion |

### Extending camera behavior (recommended order)

| Goal | Where | Notes |
|------|-------|-------|
| Better resting framing | Node `cameraTarget` / `position` | Cheapest, data-only |
| Smoother / safer travel | Connection waypoints + `clearance` | Still data-first |
| Multi-hop free jumps | Already via BFS | Ensure graph connectivity |
| Custom mid-path look | Implement `targetWaypoints` in route builder | Currently ignored |
| Free-look at rest | New Director state after transition | Do not fight path `lookAt` mid-flight |
| Scroll-driven travel | Optional `scroll-travel` package | Different paradigm; don’t mix casually |
| Collision / navmesh | New system | Not present; waypoints remain authoritative until then |

### Anti-patterns

- Hardcoding world path arrays in components instead of `rooms.ts`.
- Second camera in the scene (`makeDefault` already set).
- Animating HUD camera independently of `museumState`.
- Importing `buildCameraPath` from `scroll-travel` for node-graph tours without a deliberate redesign.
- Assuming `targetWaypoints` or `lockInteraction` do something without wiring them.

---

## 5. Features map

### Implemented (Phase 1)

| Feature | Location |
|---------|----------|
| Procedural room shells + portals | `MuseumShell`, `RoomPortal` |
| Central chamber + graybox piano | `CentralChamber` |
| Per-room prop placeholders | `rooms/*.svelte` |
| Floor staff-path viz | `StaffPath` |
| Node-to-node guided camera | `CameraDirector`, `camera-route` |
| Guided / free tour modes | `museum-state` |
| Visited-room backtracking | `canNavigateTo` |
| Reduced motion | state + Director |
| Clickable nav spheres | `NavigationNode` |
| DOM HUD (title, next/back, mode, route list) | `MuseumHUD` |
| Landing → museum entry | `/`, `/museum` |

### Typed or stubbed but incomplete

| Item | Status |
|------|--------|
| `MuseumConnection.targetWaypoints` | Unused; look synthesized |
| `lockInteraction` on nodes | Checked in state; no node sets it |
| `audioEnabled` | Dead flag |
| Music genre portals | Decorative only |
| `@portfolio/scroll-travel` dep | Declared, not imported |

### Explicitly out of Phase 1

Final materials / GLTF exhibits · shadow maps / postprocessing · spatial or music audio · free-look / orbit · collision / navmesh · continuous scroll travel inside museum · SSR-friendly 3D · mobile free-look gestures beyond HUD buttons/spheres.

---

## 6. Limitations & failure modes

| Limitation | Consequence | Mitigation |
|------------|-------------|------------|
| No collision | Bad waypoints clip walls/ceilings | Author paths through openings; watch StaffPath |
| Look synthesized on travel | Mid-path framing can feel floaty | Tune waypoints; later wire `targetWaypoints` |
| Discrete nodes only | No continuous wander | Add nodes/edges or redesign paradigm |
| Guided is linear loop | No branching narrative yet | Extend `next`/`previous` + state rules carefully |
| Shell: one opening per side | Complex facades unsupported | Extend `buildWall` if needed |
| Music chamber shell skipped | Must keep `CentralChamber` in sync with nodes | Edit both when resizing chamber |
| Selective shadows / GLTF only in Paris | Other rooms retain the graybox look | Keep Phase 4 asset and shadow work scoped to Paris |
| Far plane 90 / fog 22–54 | Distant geometry fades | Raise fog/far if world grows |
| Free mode still graph-bound | Disconnected nodes throw in route builder | Keep graph connected for all free targets |
| Mobile HUD hides route list | Discovery via Next/spheres only | Accept or add mobile route UI |

---

## 7. Validation checklist

After layout or camera edits:

- [ ] `roomPoint` used for yaw-rotated rooms where possible
- [ ] Node `connectedNodeIds` ↔ connection `from`/`to` agree
- [ ] Guided next/prev forms a coherent loop (or intentional branch)
- [ ] Waypoints enter/exit through door openings
- [ ] StaffPath ribbons stay in corridors
- [ ] Play every new edge in both directions
- [ ] Free-mode multi-hop to a far node still clears geometry
- [ ] Reduced motion lands on correct `cameraTarget`
- [ ] HUD title/mood match the active room
- [ ] `npm run check -w @portfolio/museum` clean

---

## 8. File quick reference

| Task | Edit first |
|------|------------|
| Move a room | `rooms.ts` → `museumRooms` |
| Better resting shot | node `position` / `cameraTarget` |
| Fix clipping on move | connection `positionWaypoints` |
| Door too narrow for path | opening width + matching waypoints |
| Change tour order | `nextNodeId` / `previousNodeId` (+ connections) |
| Camera feel (speed/ease) | `CameraDirector.svelte` duration / smootherstep / fillet |
| Who can click what | `museum-state.svelte.ts` `canNavigateTo` |
| Shell look | `MuseumShell.svelte` / room colors |
| New exhibit prop | `rooms/<Room>.svelte` (keep graybox unless asked) |
