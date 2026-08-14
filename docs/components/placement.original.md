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

A4.1 keeps primitive authoring Plan-only. Box uses opposite rectangle corners; Cylinder and Sphere use center plus radius. Ownership resolves from the Box center or radial gesture center; footprints may extend outside the owning room. New objects use a 1 m default height, floor-relative stored center Y, and 0.25 m Plan snapping when enabled. Stored transform/dimensions are authoritative for rendering, bounds, and JSON, so Sphere may render as a vertically non-uniform spheroid. Select remains the only Plan movement tool: vertex/object candidates snap directly and whole-room moves apply one snapped rigid translation before the final pointer-up mutation. Imported `plane` and `profile` objects remain codec-compatible compatibility entries; profiles are read-only. Three-dimensional preview renders existing objects but does not select or edit them; 3D selection/gizmos are deferred to the unified layout/scene editing milestone.

## Room-unit relocate (B3)

Plan Select room-body drag moves boundary endpoints, curved anchors, openings, and all objects owned by the room as one rigid unit. Translation uses 0.25 m snap; selected room's centroid arm provides continuous positive-Y rotation, with Shift snapping to 15°. Escape, pointer-cancel, invalid geometry, and tool/view cancellation roll back; no-op gestures create no history. Inspector **Rotate by (°)** applies a relative delta and resets to zero. Each successful gesture is one tagged `layout` entry in shared chronological scene/layout history.
