# Current Museum Agent Handoff

## Status

**North star:** layout-first / Chopin-as-data — [`../north-star.md`](../north-star.md).  
**P0:** Layout CAD Foundation — [`../plans/2026-08-10-layout-cad-foundation.md`](../plans/2026-08-10-layout-cad-foundation.md).  
Full-track Phase 2 scene presets = deferred optional.

## Next slice

**A0 → B0 → A1** (no Bezier before A1):

1. **A0** — Layout types + codec + tests; focused spec/plan: [`../plans/2026-08-10-layout-cad-a0-codec.md`](../plans/2026-08-10-layout-cad-a0-codec.md).  
2. **B0** — `rooms.ts` → `LayoutDocument` + Chopin golden fixture.  
3. **A1** — Line rooms, validation, mesh preview, history stub; visitor unchanged.

Then **C0** project envelope, then **A2** plan UX.

## Locked decisions

- Single undo stack; ops tagged `layout` | `scene`.
- Layout mode vs Museum mode mutex before plan UX.
- Visitor on `rooms.ts` until **B4**.
- Rectangle click-drag OK in plan tools; object place = ghost commit.
- A1 corridor = ordinary skinny `LayoutRoom` with optional two rectangular geometry-only cutouts; no corridor type or adjacency semantics yet.
- A1 `LayoutOpening.offset` is meters along its segment; B4 adds explicit `connectsRoomIds` for portals.
- No commits unless user asks.

## Out of scope this slice

Phase 2 Wall presets · Bezier/arches (A3) · semantic room adjacency/portal graph (B4) · cutover (B5) · GLB import · new camera system.

## Reading order (token-minimal)

1. This file.  
2. [`../AGENTS.md`](../../AGENTS.md) hard rules.  
3. [`../architecture.md`](../architecture.md) (layout/`rooms.ts` only).  
4. For A0, read [`../plans/2026-08-10-layout-cad-a0-codec.md`](../plans/2026-08-10-layout-cad-a0-codec.md); for B0/A1, read only those sections in the foundation plan.  
5. Skip other `docs/components/*` unless the task touches them.

After shipping: update the **matching** `docs/components/*.md` or `architecture.md` / `north-star.md`; bump hub routing only if needed.
