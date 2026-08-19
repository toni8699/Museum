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

Visitor: plays the open-chain order (loop derived); free nodes via BFS; transitioning = no nav; Paris = fixed eye + free-look. No ribbons on `/museum`.

Limits: no collision/navmesh; synthesized look; timeline drag-connect ≤1 new edge; guarded deletes.
