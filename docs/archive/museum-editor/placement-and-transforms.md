# Placement and transforms

**Read when:** changing ghosts, transform tools, snap, scale modes, placeable surfaces, selection outlines.  
**Last reviewed:** 2026-08-10

---

## Placement UX (locked pattern)

```text
Click library item → armed
  → PlacementGhost (wireframe OBB) follows cursor
       green = valid placeable floor + room
       red   = invalid
  → Click floor → commit entity (one history entry)
  → Esc / click invalid → cancel (no history)
```

**No viewport drag-and-drop** for arming/committing — it fights orbit and gizmos. File import (Phase 3) stays native file picker, not drop zones on the 3D view.

Camera node creation uses a similar **pending ghost** pattern (session-only until connected).

---

## Placeable surfaces today

| Surface | Placeable? |
|---------|------------|
| Tagged **floor** with valid `roomId` | **Yes** |
| Shell wall / ceiling | **No** (rejected even if marked placeable) |
| Primitive/entity faces | **No** |

Ghosts and commits are **floor-aligned** (up = +Y). Normal-aligned wall/ceiling mounting is roadmap, not current behavior.

---

## Transform tools

Viewport tools: **Select · Move · Rotate · Scale**.

| Concern | Behavior |
|---------|----------|
| Gizmo | Three.js TransformControls; world space |
| Selection | Click; Shift-add; Ctrl/Cmd-toggle; Alt cycle (placement) |
| Outlines | Rotation-aware **OBB** hover/selection |
| Multi-select pivot | **Active Object** (last selected) |
| Snap | Translation/rotation steps; **Shift while drag** bypasses |
| Grounding | Keep-on-floor / **Drop to Floor** (End) |
| Settings | Snap steps + pivot mode in `localStorage` |

Navigation selection and placement selection are **mutually exclusive**.

---

## Scale: uniform vs independent

| Mode | UX | Persistence |
|------|-----|-------------|
| **Uniform** (default) | Single scale / chained axes | Scalar `scale` in v6 |
| **Independent** | Per-axis X/Y/Z + toolbar/inspector chain toggle | Session `scaleVector` for re-edit; document still largely scalar → **visitor can be lossy** until schema v7 |

**Scale deadstop** (Phase 2): clamp at minimum scale; flatten OK; never flip through zero/mirror. Open product Q: gizmo only vs inspector fields too.

---

## Pointer priority (viewport)

Preview/modal shield → TransformControls → path drag → pending placement → node/anchor helpers → curve pick → Orbit → placement select.

Orbit: LMB rotate; middle/right pan (pan can be gated).

---

## Shortcuts (placement-relevant)

| Keys | Action |
|------|--------|
| W/T · E · R · X | Translate · Rotate · Scale · Toggle space |
| End · F | Drop to floor · Focus |
| Cmd/Ctrl+D | Duplicate |
| Cmd/Ctrl+G · Shift+G | Group / Ungroup |
| Escape | Cancel cascade (preview → place → edit → deselect) |

Editable text fields skip shortcuts. Input scope: keyboard + mouse (no touch/pen requirement).

---

## Update when

Ghost rules, placeable surface types, tool modes, snap/pivot/scale contracts, selection outlines, or shortcut ownership change.
