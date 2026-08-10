# Camera and tour

**Read when:** changing navigation nodes, connections, paths, guided order, timeline, framing keys, tour preview.  
**Last reviewed:** 2026-08-10

---

## Shared vocabulary

| Term | Meaning |
|------|---------|
| **Camera node** | Visitor stop: eye, target, FOV; room-local pose |
| **Connection** | Undirected graph edge between two nodes (authored both ways in adjacency) |
| **Position path** | Movement geometry for one connection (interior anchors only) |
| **Camera key / view key** | Framing breakpoint on a directional track: progress, target, FOV |
| **Guided order** | Ordered subset forming **one reciprocal cycle** (start pinned) |
| **Free-only node** | No guided next/prev; still graph-reachable in free visitor mode |

Never create a second navigation graph, route builder, or curve sampler. Editor preview and visitor both use `camera-route` + `camera-motion`.

---

## Defaults (new nodes)

| Quantity | Typical value |
|----------|----------------|
| Eye height | 1.65 m |
| Target height | 1.25 m |
| Target distance | 3 m |
| Clearance | 0.35 m |

---

## Topology authoring

| Action | Behavior |
|--------|----------|
| **Add camera** | Click placeable floor → pending ghost → pick existing node → commit free node + symmetric edge + straight `auto-bezier` |
| **Connect** | Source → distinct unconnected destination → one straight `auto-bezier`, zero interior anchors |
| **Timeline drag-connect** | Drop node onto guided gap → at most **one** missing edge + cycle rewrite (one undo) |
| **Delete** | Guarded: must keep graph connected; guided cycle invariants; bridge edges protected. Failures explain why and mutate nothing |

Guided tour list: reorder / insert free nodes into gaps / remove (with edge requirements). List edits **do not** create edges except via the timeline drag-connect exception.

---

## Path editing

- Path kinds: `rounded-polyline` (legacy fillets) and `auto-bezier` (Catmull–Rom–derived; no authored tangent handles).
- Click curve to select; drag empty curve to insert interior anchor; drag anchors on horizontal plane; gizmo for XYZ.
- Endpoints are **resolver-generated** (`node:<id>:position`) — never persist them as author data.
- Anchors with `roomId` are room-local; without are world-space.
- Mid-path **look** is largely synthesized; authored look paths deferred. `targetWaypoints` typed but unused.

---

## Timeline and preview

- Seek nodes/edges; scrub; add camera keys; drag key progress on ruler or in 3D.
- Transport: Observer vs Through Camera; Play / Pause / Follow / Recenter / Stop.
- Whole-tour preview advances the guided ruler using **exact** per-connection motions (same as visitor).
- Preview adds **no** history; Stop/Escape restores prior orbit/camera.
- View toggles (Camera ws): node handles / tour paths / framing & FOV.

---

## Visitor coupling

| Mode | Rule |
|------|------|
| Guided | Only next (or previous if visited) |
| Free | Any other node; still follows graph edges (BFS) |
| Transitioning | No new navigation |
| Paris stop | Fixed eye + clamped free-look; elsewhere guided camera authoritative |

Visitor `/museum` never shows ribbons, anchors, or editor helpers.

---

## Limits that affect product design

- No collision/navmesh — curves can clip walls.
- Auto edges are C0 at nodes — multi-hop can kink.
- Timeline drag-connect cannot invent 2+ edges in one drop.
- No tangent handles; no full per-edge speed product surface yet.

Deep checklist: [`../CAMERA_AND_LAYOUT.md`](../CAMERA_AND_LAYOUT.md).

---

## Update when

Topology rules, path kinds, guided-cycle invariants, timeline/preview transport, framing-key behavior, or visitor coupling contracts change.
