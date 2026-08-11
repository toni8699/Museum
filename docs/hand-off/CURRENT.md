# Current Museum Agent Handoff

## Status

**North star:** layout-first / Chopin-as-data — [`../north-star.md`](../north-star.md).  
**P0:** Layout CAD Foundation — [`../plans/2026-08-10-layout-cad-foundation.md`](../plans/2026-08-10-layout-cad-foundation.md).  
**Completed:** A0 LayoutDocument codec + B0 Chopin `rooms.ts` compiler + A1 pure line geometry/preview model/transaction stub + C0 `MuseumProject` codec + A2 read-only layout preview workspace + A2.1 rectangle/polygon drafting.

Full-track Phase 2 scene presets = deferred optional.

## Next slice

**A2.2** — layout selection and drafting polish: select rooms, inspect draft boundaries, add Backspace point removal, and decide grid/angle snapping before opening authoring.

A2.1 now provides Plan/3D switching, rectangle drag, polygon close/Finish, Escape cancellation, and in-memory layout-only room commits. A1 shipped pure line geometry, validation, preview model, and transaction stub. C0 shipped the project envelope. No Bezier before A3.

## Completed verification

- A0 codec: 20 focused tests passed.
- B0 compiler: 9 focused tests passed.
- A1 focused tests: 18 passed.
- C0 project codec: 11 focused tests passed.
- A2 preview focused tests: 28 passed.
- A2.1 drafting tests: 9 passed.
- A2.1 focused shell/camera regression set: 117 passed.
- Full suite: 1037 tests passed.
- `npm run check`: same 4 baseline diagnostics in `MuseumEntities.svelte` and `EditorViewport.svelte`; no A2.1 diagnostics or warnings.
- `npm run check`: still blocked by 4 pre-existing diagnostics in `MuseumEntities.svelte` and `EditorViewport.svelte`.

## Locked decisions

- Single undo stack; ops tagged `layout` | `scene`.
- Layout mode vs Museum mode mutex before plan UX.
- Visitor on `rooms.ts` until **B4**.
- Rectangle click-drag OK in plan tools; object place = ghost commit.
- A1 corridor = ordinary skinny `LayoutRoom` with optional two rectangular geometry-only cutouts; no corridor type or adjacency semantics yet.
- A2 preview renders generated geometry; A2.1 drafts rooms in an isolated in-memory layout preview only.
- A2.1 does not add shared history, persistence, openings, room selection, or snapping.
- A1 preview output is pure data; A2 owns the Three/Svelte rendering adapter.
- A1 `LayoutOpening.offset` is meters along its segment; B4 adds explicit `connectsRoomIds` for portals.
- No commits unless user asks.

## Out of scope this slice

Phase 2 Wall presets · Bezier/arches (A3) · semantic room adjacency/portal graph (B4) · cutover (B5) · GLB import · new camera system.

## Reading order (token-minimal)

1. This file.  
2. [`../AGENTS.md`](../../AGENTS.md) hard rules.  
3. [`../architecture.md`](../architecture.md) (layout/`rooms.ts` only).  
4. For A2.2, read the A2.1 section in the foundation plan + the A1 plan for the preview model contract. A0/B0/A1/C0/A2/A2.1 are shipped.

5. Skip other `docs/components/*` unless the task touches them.

After shipping: update the **matching** `docs/components/*.md` or `architecture.md` / `north-star.md`; bump hub routing only if needed.
