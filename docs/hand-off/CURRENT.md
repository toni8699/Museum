# Current Museum Agent Handoff

## Status

**North star:** layout-first / Chopin-as-data — [`../north-star.md`](../north-star.md).  
**P0:** Layout CAD Foundation — [`../plans/2026-08-10-layout-cad-foundation.md`](../plans/2026-08-10-layout-cad-foundation.md).  
**Completed:** A0 LayoutDocument codec + B0 Chopin `rooms.ts` compiler + A1 pure line geometry/preview model/transaction stub + C0 `MuseumProject` codec + A2 read-only layout preview workspace.

Full-track Phase 2 scene presets = deferred optional.

## Next slice

**A2.1** — first layout authoring interaction: Plan/3D workspace, rectangle/polygon drafting, and layout selection. A2 preview is shipped in the focused plan [`../plans/2026-08-10-layout-cad-a2-editor-preview.md`](../plans/2026-08-10-layout-cad-a2-editor-preview.md).

A1 shipped pure line geometry, validation, preview model, and transaction stub. C0 shipped the project envelope. A2 adds read-only generated geometry; no Bezier before A3.

## Completed verification

- A0 codec: 20 focused tests passed.
- B0 compiler: 9 focused tests passed.
- A1 focused tests: 18 passed.
- C0 project codec: 11 focused tests passed.
- A2 preview focused tests: 28 passed.
- Full suite: 1032 tests passed.
- `npm run check`: still blocked by 4 pre-existing diagnostics in `MuseumEntities.svelte` and `EditorViewport.svelte`.

## Locked decisions

- Single undo stack; ops tagged `layout` | `scene`.
- Layout mode vs Museum mode mutex before plan UX.
- Visitor on `rooms.ts` until **B4**.
- Rectangle click-drag OK in plan tools; object place = ghost commit.
- A1 corridor = ordinary skinny `LayoutRoom` with optional two rectangular geometry-only cutouts; no corridor type or adjacency semantics yet.
- A2 preview workspace is read-only; no layout mutators, shared history, or Plan drafting until A2.1.
- A1 preview output is pure data; A2 owns the Three/Svelte rendering adapter.
- A1 `LayoutOpening.offset` is meters along its segment; B4 adds explicit `connectsRoomIds` for portals.
- No commits unless user asks.

## Out of scope this slice

Phase 2 Wall presets · Bezier/arches (A3) · semantic room adjacency/portal graph (B4) · cutover (B5) · GLB import · new camera system.

## Reading order (token-minimal)

1. This file.  
2. [`../AGENTS.md`](../../AGENTS.md) hard rules.  
3. [`../architecture.md`](../architecture.md) (layout/`rooms.ts` only).  
4. For A2.1, read the A2 section in the foundation plan + the A1 plan for the preview model contract. A0/B0/A1/C0/A2 preview are shipped.

5. Skip other `docs/components/*` unless the task touches them.

After shipping: update the **matching** `docs/components/*.md` or `architecture.md` / `north-star.md`; bump hub routing only if needed.
