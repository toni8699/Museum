# B3 — Room-Unit Relocate

**Date:** 2026-08-12  
**Status:** Implemented  
**Authority:** Layout CAD Foundation B3 slice  
**Handoff:** [`../hand-off/CURRENT.md`](../hand-off/CURRENT.md)

## Shipped

- Pure `transformLayoutRoomUnit(document, roomId, transform)` derives the sampled-boundary shoelace centroid internally, applies meter translation and positive-Three-Y yaw, and validates the complete result atomically.
- Boundary endpoints, auto-Bezier interior anchors, and matching `LayoutObject` X/Z positions move as one rigid unit. Matching object Y, dimensions, IDs, opening metadata, segment metadata, and curve shape remain unchanged; child object Y rotation receives the exact yaw delta. Unassigned and unrelated objects remain fixed.
- Plan Select room-body drag previews the complete unit and commits once. Translation snaps to 0.25 m. Selected rooms expose a centroid rotation arm; rotation is continuous and Shift snaps deltas to 15°.
- Escape, pointer-cancel, invalid transform results, and tool/view cancellation restore the exact pre-gesture layout. No-op gestures do not add history. Selection remains on the room after commit/undo/redo.
- Room inspector adds relative **Rotate by (°)**; each apply is one layout history entry and resets the control to `0`.
- Scene and layout operations share one chronological 100-entry history. Entries are tagged `scene` or `layout`; undo/redo restores only the entry's domain while retaining the other document's current state. Layout import/reset and scene import/reset clear shared history.
- Layout JSON remains format v1; no persistent room yaw or schema migration.

## Verification

- Focused transform, history, and layout-preview tests pass.
- `npm run check -w @portfolio/museum` passes with 0 errors / 0 warnings.
- Full museum tests and build remain required at slice handoff.
- Manual Plan QA: load Chopin fixture, choose Layout → Plan → Select, drag a room body, drag the rotation arm, verify openings/anchors/owned objects follow, then exercise Undo/Redo and Escape.

## Boundaries

B4 adjacency/portal semantics, B5 visitor runtime cutover, 3D room gizmos, shared-room semantics, and the future unified scene/layout outliner remain out of scope.
