# Camera and tour

**Read when:** nodes, connections, paths, guided order, timeline, framing, tour preview.  
**Last reviewed:** 2026-08-10  
**Deep dump (rare):** [`../archive/CAMERA_AND_LAYOUT.md`](../archive/CAMERA_AND_LAYOUT.md)

---

| Term | Meaning |
|------|---------|
| Camera node | Eye / target / FOV (room-local) |
| Connection | Edge; JSON stores **interior** anchors only |
| Path kinds | `rounded-polyline` · `auto-bezier` (no tangent handles) |
| Order | Open chain (main route + detours); loop derived from a distinct tail↔head connection |

Defaults: eye **1.65 m**, target **1.25 m**, distance **3 m**, clearance **0.35 m**.  
Resolver inserts `node:<id>:position` — **never** persist those as interiors.  
Editor preview + visitor share **`camera-route` + `camera-motion` only**.

Visitor: plays the open-chain order (loop derived); free nodes via BFS; transitioning = no nav; Paris = fixed eye + free-look. No ribbons on `/museum`.

Limits: no collision/navmesh; synthesized look; timeline drag-connect ≤1 new edge; guarded deletes.
