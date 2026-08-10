# Current Museum Agent Handoff

## Status

**North star:** layout-first / Chopin-as-data — [`../north-star.md`](../north-star.md).  
**P0:** Layout CAD Foundation — [`../plans/2026-08-10-layout-cad-foundation.md`](../plans/2026-08-10-layout-cad-foundation.md).  
**Completed:** A0 LayoutDocument codec + B0 Chopin `rooms.ts` compiler.  
Full-track Phase 2 scene presets = deferred optional.

## Next slice

**A1** — line rooms, validation, mesh preview, history stub; visitor unchanged. No Bezier before A1.

A1 consumes the stable types/codec and deterministic Chopin layout compiler completed in A0/B0. Then **C0** project envelope, then **A2** plan UX.

## Completed verification

- A0 codec: 20 focused tests passed.
- B0 compiler: 9 focused tests passed.
- Full suite: 995 tests passed.
- `npm run check`: still blocked by 4 pre-existing diagnostics in `MuseumEntities.svelte` and `EditorViewport.svelte`.

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
4. For A1, read only the A1 section in the foundation plan; A0/B0 contracts are already shipped.  
5. Skip other `docs/components/*` unless the task touches them.

After shipping: update the **matching** `docs/components/*.md` or `architecture.md` / `north-star.md`; bump hub routing only if needed.
