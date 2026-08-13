# Placement and transforms

**Read when:** ghosts, gizmos, snap, scale modes, placeable surfaces, selection outlines.  
**Last reviewed:** 2026-08-12

---

```text
Arm library item → PlacementGhost (OBB) → click floor → commit (1 history)
Esc / invalid → cancel (no history)
```

| Surface | Placeable? |
|---------|------------|
| Tagged floor + `roomId` | **Yes** |
| Wall / ceiling / entity faces | **No** (yet) |

Tools: Select · Move · Rotate · Scale. World gizmo. OBB outlines. Active Object multi-pivot. Snap; **Shift** while drag bypasses. Drop to Floor (End).

Scale: **uniform** (default, scalar in v6) vs **independent** (session `scaleVector` — visitor may be lossy until v7).

Nav selection ⊥ placement selection. **No** viewport DnD for place. Plan rectangle click-drag = CAD exception only ([`../north-star.md`](../north-star.md)).

## Layout objects (A4/A4.1)

Layout object placement is editor-local and separate from scene placement/history:

```text
Place → Box/Cylinder/Sphere Plan gesture → footprint ghost → commit LayoutObject
Escape / invalid gesture / tool change → cancel (document unchanged)
```

A4.1 keeps primitive authoring Plan-only. Box uses opposite rectangle corners; Cylinder and Sphere use center plus radius. New objects use a 1 m default height, first-floor room ownership, floor-relative center Y, and 0.25 m Plan snapping when enabled. Select remains the only movement tool: room, vertex, and object candidates snap before the one final pointer-up mutation. Imported `plane` and `profile` objects remain codec-compatible compatibility entries; profiles are read-only. Three-dimensional preview renders existing objects and supports selection, but has no primitive placement or gizmos.
