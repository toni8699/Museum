# Placement and transforms

**Read when:** ghosts, gizmos, snap, scale modes, placeable surfaces, selection outlines.  
**Last reviewed:** 2026-08-10

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
