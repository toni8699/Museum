# A3.1 — Camera-style wall bend + opening viz fix

**Date:** 2026-08-11  
**Status:** Implemented  
**Parent:** [`2026-08-11-layout-cad-a3-bezier-arch-profiles.md`](./2026-08-11-layout-cad-a3-bezier-arch-profiles.md)  
**Handoff:** [`../hand-off/CURRENT.md`](../hand-off/CURRENT.md)

## Goal

Polish A3 interaction and opening preview:

- Fix Plan/3D openings missing or wiping whole walls on coarse line samples.
- Plan-drag openings along walls after place.
- Replace Bezier room tool + authored `handleOut`/`handleIn` with camera-style **interior bend anchors** on walls (pure 2D auto-bezier, not `camera-motion`).

## Shipped

- Line samples densified by `CURVE_MAX_SAMPLE_SPAN` (0.25 m).
- Plan wall polylines split at opening interval endpoints (solid stubs always kept).
- 3D wall boxes clipped to section × sample distance overlap.
- Plan opening drag updates `offset` with snap.
- `DraftSegment`: `line` | `auto-bezier` with `interiorAnchors`; codec migrates legacy `bezier`.
- Pure 2D centripetal auto-bezier in `layout-auto-bezier.ts` (decoupled from Three/`camera-motion`).
- Select-tool: click wall selects without insert; mid-span drag past 4 px inserts/moves anchors; Delete removes anchor (empty → `line`).
- Hit priority: vertex → interior anchor → opening → wall → room.
- Bezier room tool / Finish Bezier room / Convert-to-Bezier / Add bend inspector removed.
- Corner vertex drag still resizes rooms.
- Escape rolls back in-progress interior-anchor / opening Plan drags via preview snapshot.
- Plan selected-room edge labels use arc length (`segmentLength`), matching Inspector.
- 3D curved walls remain chord `BoxGeometry` strips (known thickness gap/overlap at sharp bends).

## Non-goals

- Importing `camera-motion` / sharing Three curves.
- Shared history, persistence, visitor cutover, A4 objects/I/O.
- Lossless round-trip of legacy authored cubics (codec migrates to midpoint interior + auto-bezier).
- Exact thick-wall CSG / continuous extruded strips.
