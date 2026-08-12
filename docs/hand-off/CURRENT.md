# Current Museum Agent Handoff

## Status

**North star:** layout-first / Chopin-as-data — [`../north-star.md`](../north-star.md).  
**P0:** Layout CAD Foundation — [`../plans/2026-08-10-layout-cad-foundation.md`](../plans/2026-08-10-layout-cad-foundation.md).  
**Completed:** A0 LayoutDocument codec + B0 Chopin `rooms.ts` compiler + A1 pure line geometry/preview model/transaction stub + C0 `MuseumProject` codec + A2 read-only layout preview workspace + A2.1 rectangle/polygon drafting + A2.2 meter-scale editing and Chopin floor correction + A2.3 geometry-only opening authoring and numeric opening dimensions + A3 Bezier walls, arc-length openings, and derived arch profiles + A3.1 camera-style wall bend anchors, opening viz fix, and Plan opening drag + A4 layout objects, inspectors, and layout JSON I/O.

Full-track Phase 2 scene presets = deferred optional.

## Next slice

**B3** — Room-unit relocate: move/rotate a room boundary, openings, and child objects together. A4 is implemented in [`../plans/2026-08-11-layout-cad-a4-objects-inspectors-io.md`](../plans/2026-08-11-layout-cad-a4-objects-inspectors-io.md).

A4 adds primitive layout-object placement in Plan and 3D, transient Plan object dragging, room/wall/opening/object numeric inspectors, canonical layout JSON I/O, and independent layout baseline/status/dirty handling. Layout remains editor-only and outside shared scene history.

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
- A4 focused layout suite: 41 passed after final object/state additions.
- Full suite: 85 files / 1100 tests passed.
- Museum build passed.
- `npm run check -w @portfolio/museum`: same 4 baseline diagnostics in `MuseumEntities.svelte` and `EditorViewport.svelte`; no A4 additions.
- In-app Browser manual QA remains pending: Browser runtime returned `Browser is not available: iab` on 2026-08-12.

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
- A3.1 walls use `line` | `auto-bezier` with camera-style interior anchors (pure 2D centripetal cubics); no Bezier room tool; no authored `handleOut`/`handleIn` edit model; legacy `bezier` migrates on codec read. Bend via mid-span **drag** (4 px threshold); click selects wall without inserting an anchor; corners resize rooms. Plan-only anchors; 3D sampled preview only.
- A3 curve mutations remain preview-state-only; no shared editor history or persistence.
- A4 layout object mutations and layout I/O remain preview-state-only; scene dirty/history are independent. Navigation/unload protects either dirty document.
- A1 `LayoutOpening.offset` is meters along its segment; B4 adds explicit `connectsRoomIds` for portals.
- Layout auto-bezier must not import `camera-motion` / Three.
- No commits unless user asks.

## Out of scope this slice

Phase 2 Wall presets · semantic room adjacency/portal graph (B4) · cutover (B5) · GLB import · new camera system · opening assets/frames · shared layout history/persistence.

## Reading order (token-minimal)

1. This file.  
2. [`../AGENTS.md`](../../AGENTS.md) hard rules.  
3. [`../architecture.md`](../architecture.md) (layout/`rooms.ts` only).  
4. For B3, read the foundation plan task section + the matching component contract. A0/B0/A1/C0/A2/A2.1/A2.2/A2.3/A3/A3.1/A4 are shipped.

5. Skip other `docs/components/*` unless the task touches them.

After shipping: update the **matching** `docs/components/*.md` or `architecture.md` / `north-star.md`; bump hub routing only if needed.
