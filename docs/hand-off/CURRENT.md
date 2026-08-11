# Current Museum Agent Handoff

## Status

**North star:** layout-first / Chopin-as-data — [`../north-star.md`](../north-star.md).  
**P0:** Layout CAD Foundation — [`../plans/2026-08-10-layout-cad-foundation.md`](../plans/2026-08-10-layout-cad-foundation.md).  
**Completed:** A0 LayoutDocument codec + B0 Chopin `rooms.ts` compiler + A1 pure line geometry/preview model/transaction stub + C0 `MuseumProject` codec + A2 read-only layout preview workspace + A2.1 rectangle/polygon drafting + A2.2 meter-scale editing and Chopin floor correction + A2.3 geometry-only opening authoring and numeric opening dimensions + A3 Bezier walls, arc-length openings, and derived arch profiles + A3.1 camera-style wall bend anchors, opening viz fix, and Plan opening drag.

Full-track Phase 2 scene presets = deferred optional.

## Next slice

**A4** — Objects, inspectors, and layout I/O UI. A3.1 is implemented in [`../plans/2026-08-11-layout-cad-a3-1-camera-style-bend.md`](../plans/2026-08-11-layout-cad-a3-1-camera-style-bend.md). A3 is implemented in [`../plans/2026-08-11-layout-cad-a3-bezier-arch-profiles.md`](../plans/2026-08-11-layout-cad-a3-bezier-arch-profiles.md). A2.3 is implemented in [`../plans/2026-08-11-layout-cad-a2-3-opening-authoring.md`](../plans/2026-08-11-layout-cad-a2-3-opening-authoring.md); A2.2 is implemented in [`../plans/2026-08-10-layout-cad-a2-2-scale-editing.md`](../plans/2026-08-10-layout-cad-a2-2-scale-editing.md).

A2.1 provides Plan/3D switching, rectangle drag, polygon close/Finish, Escape cancellation, and in-memory layout-only room commits. A2.2 adds stable meter scale, selection/editing, ceiling visibility, and Chopin floor alignment correction. A3 adds sampled curved walls, arc-length openings, and derived rounded/pointed profiles. A3.1 replaces Bezier-room drafting with mid-span camera-style interior anchors (`auto-bezier`), densified line samples, interval-based opening gaps, and Plan opening drag. C0 shipped the project envelope.

## Completed verification

- A0 codec: 20 focused tests passed.
- B0 compiler: 9 focused tests passed.
- A1 focused tests: 18 passed.
- C0 project codec: 11 focused tests passed.
- A2 preview focused tests: 28 passed.
- A2.1 drafting tests: 9 passed.
- A2.1 focused shell/camera regression set: 117 passed.
- A2.2 focused tests: 21 passed.
- A2.3 focused layout + shell/camera tests: 149 passed.
- A3 focused layout suite: 98 passed.
- A3.1 focused layout suite: 107 passed.
- `npm run check`: same 4 baseline diagnostics in `MuseumEntities.svelte` and `EditorViewport.svelte`; no A3.1 additions.
- Full suite: see latest local `npm run test` after A3.1.
- Museum build passed for prior A3 gate; re-verify after A3.1 if shipping.

## Locked decisions

- Single undo stack; ops tagged `layout` | `scene`.
- Layout mode vs Museum mode mutex before plan UX.
- Visitor on `rooms.ts` until **B4**.
- Rectangle click-drag OK in plan tools; object place = ghost commit.
- A1 corridor = ordinary skinny `LayoutRoom` with optional two rectangular geometry-only cutouts; no corridor type or adjacency semantics yet.
- A2 preview renders generated geometry; A2.1 drafts rooms in an isolated in-memory layout preview only.
- A2.1 does not add shared history, persistence, openings, room selection, or snapping.
- A2.2 uses layout-local meter coordinates, 0.25 m snap, 15° Shift angle snap, room/vertex edits, and ceiling visibility; no shared history or persistence.
- A2.3 opening authoring chooses interaction B: Door/Window tools hit any wall with no prior wall selection; selecting a wall first is optional, and Inspector actions only arm the tool without constraining the next click. Tagged `LayoutSelection` includes `interiorAnchor` after A3.1. Numeric fields are opening-only (room/edge numeric fields deferred). Hit priority: vertex → interior anchor → opening → wall → room. Over-height validation in `layout-validation`; room/vertex edits that invalidate openings fail closed for all rooms (no Chopin special case). A2.3 openings are rectangular by default and geometry-only; A3 supersedes the rectangular-profile restriction with derived `rounded` and `pointed` profiles. Plan opening drag adjusts `offset` after place. No adjacency, shared history, or persistence.
- A1 preview output is pure data; A2 owns the Three/Svelte rendering adapter.
- A3/A3.1 curve sampling uses `0.01 m` flatness, `0.25 m` maximum sample span (lines densified too), `1e-4 m` self-intersection tolerance, and existing `12 px` Plan hit radius.
- A3.1 walls use `line` | `auto-bezier` with camera-style interior anchors (pure 2D centripetal cubics); no Bezier room tool; no authored `handleOut`/`handleIn` edit model; legacy `bezier` migrates on codec read. Bend via mid-span grab; corners resize rooms. Plan-only anchors; 3D sampled preview only.
- A3 curve mutations remain preview-state-only; no shared editor history or persistence.
- A1 `LayoutOpening.offset` is meters along its segment; B4 adds explicit `connectsRoomIds` for portals.
- Layout auto-bezier must not import `camera-motion` / Three.
- No commits unless user asks.

## Out of scope this slice

Phase 2 Wall presets · semantic room adjacency/portal graph (B4) · cutover (B5) · GLB import · new camera system · opening assets/frames · shared layout history/persistence.

## Reading order (token-minimal)

1. This file.  
2. [`../AGENTS.md`](../../AGENTS.md) hard rules.  
3. [`../architecture.md`](../architecture.md) (layout/`rooms.ts` only).  
4. For A4, read the foundation plan task section + the matching component contract. A0/B0/A1/C0/A2/A2.1/A2.2/A2.3/A3/A3.1 are shipped.

5. Skip other `docs/components/*` unless the task touches them.

After shipping: update the **matching** `docs/components/*.md` or `architecture.md` / `north-star.md`; bump hub routing only if needed.
