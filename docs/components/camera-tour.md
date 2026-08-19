# Camera and tour

**Read when:** nodes, connections, paths, guided order, timeline, framing, tour preview.  
**Last reviewed:** 2026-08-18
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

Visitor: plays the open-chain order (loop derived); free nodes via BFS; transitioning = no nav; Paris = fixed eye + free-look. No ribbons on `/museum`.

Limits: no collision/navmesh; synthesized look; timeline drag-connect ≤1 new edge; guarded deletes.
