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

## Layout objects (A4)

Layout object placement is editor-local and separate from scene placement/history:

```text
Object tool + primitive kind → layout ghost → Plan room floor or tagged 3D layout floor → commit LayoutObject
Escape / invalid target → cancel (document unchanged)
```

Plan placement uses the first layout floor, 0.25 m X/Z snap, room ownership from the hit footprint, and center Y = floor elevation + half object height. Three-dimensional placement resolves the exact tagged layout floor and room. Plan dragging previews X/Z transiently and commits once on pointer-up; invalid drops restore the original position. Imported `profile` objects are selectable read-only placeholders. Layout gizmos, world drag, profile authoring, and dimension handles remain deferred.
