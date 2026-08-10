# North star

**Read when:** choosing what to build; reviewing pitches.  
**Do not read** for a narrow gizmo/tour/entity bug.  
**Last reviewed:** 2026-08-10  
**Live slice:** [`hand-off/CURRENT.md`](./hand-off/CURRENT.md)

---

## Vision

**Layout-first museum complex editor:** empty canvas → draw/relocate rooms → openings + parametric placeholders (not free mesh) → serialize `MuseumProject` (layout + scene) → load in editor/visitor → author **camera tour on that complex**. Chopin is the first **data project**, not a permanent `rooms.ts` special case.

Foundation = **single floor**. Corridors are ordinary skinny layout rooms; early cutouts are geometry-only. Semantic room/portal adjacency arrives at B4. Multi-story only after single-floor draft → validate → preview → serialize → reload → promote → tour works without regressions.

```text
MuseumProject
  ├─ layout   ← rooms, openings, layout objects  (today: rooms.ts)
  ├─ scene    ← entities, materials, camera graph (today: museum-scene.json)
  └─ assets…
```

## Sacred contracts

1. Semantic drafting, not Blender — app owns mesh; no arbitrary CSG/sculpt.  
2. Serialize/load — leave `rooms.ts` via compile → dual-read → cutover.  
3. One camera/motion system.  
4. Visitor isolation until promotion APIs shared.  
5. Object place = ghost → commit; plan rectangle click-drag = CAD exception only.

## Priority

| Pri | Track |
|-----|-------|
| **P0** | Layout CAD + Chopin compile + project envelope — [`plans/2026-08-10-layout-cad-foundation.md`](./plans/2026-08-10-layout-cad-foundation.md) |
| P1 | Room relocate; dual-read; cutover |
| P2 | GLB import (after layout-backed load) |
| P3 | Scene Wall presets as dressing — optional; **not** shell |
| P4 | Multi-story — after single-floor gate |

## Non-goals

Blender mesh editor · auto tour from floorplan · multi-tenant CMS · second path engine · investing in `rooms.ts` multi-opening as long-term SoT if cutover near.
