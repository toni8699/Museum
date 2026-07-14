# Phase 3.6 Handoff — Clustering Hierarchy and Editor Camera Framing

## Phase Result

- **Phase goal:** add editor camera framing, ordered multi-selection, flat document clusters, rigid group transforms, group grounding policies, hierarchy UI, and guarded editor shortcuts.
- **Completed:** Phase 3.5.1 grounding corrections; distance-based pan speed; bounds framing that preserves view direction; selection/focus separation; cluster schema validation and history commands; session-pivot matrix-delta transforms; rigid Keep Group on Floor; independent Drop Selection to Floor; Paris hierarchy UI; guarded shortcuts; unit/store regression coverage.
- **Intentionally not completed:** nested or cross-room clusters, visitor Three parenting, collision/navmesh, magnetic snap, persisted camera focus, asset-library work.
- **Acceptance status:** `npm test` 88/88, `npm run check` 0 errors / 0 warnings, `npm run build` passed. The in-app browser backend was unavailable, so interactive WebGL acceptance remains manual in `/dev/museum-editor`.

## Main Changes

| Area | Behavior |
|---|---|
| Camera | `createEditorPanSpeed`, placement/bounds frame helpers, current-ray framing, explicit left-orbit / middle-pan / right-pan mapping, and separate `focusPlacement`, `focusSelection`, `focusRoom` APIs. |
| Selection | Ordered `selectedPlacementIds` plus `selectedClusterId`; `selectedPlacementId` is compatibility-derived only. Shift toggles without reframing; normal selection and hierarchy rows explicitly compose selection + focus. |
| Clusters | Optional document `clusters` normalize to `[]`; validation rejects invalid ids/members/rooms/ownership; create/rename/add/remove/ungroup/delete cleanup all use document history. Visitor runtime remains a flat `objects` array. |
| Transforms | One scene pivot captures member world matrices at drag start. Every preview applies `pivotNow * inverse(pivotStart) * memberStart`, then converts through the room parent. Members are never independently snapped during group drag. |
| Grounding | Floor rays start above `bounds.max.y`, cap drop distance, choose the highest valid floor, and prefer the placement room. Keep Group on Floor applies one shared Y delta; End/button drops members independently in one transaction. |
| UI / keys | Paris outliner shows clusters and indented members with create/rename/add/remove/ungroup actions. `Cmd/Ctrl+G`, `Cmd/Ctrl+Shift+G`, and `Cmd/Ctrl+A` only intercept when viewport/outliner owns focus; `End`, `F`, `Escape`, and typing guards are wired. |

## Important Contracts

- The selection pivot is session-only and never appears in `museum-scene.json` or visitor rendering.
- Group previews always derive from drag-start matrices; do not incrementally apply deltas to already-previewed member transforms.
- Translation/rotation/scale snapping targets the pivot only. With Keep on Floor enabled, Y is not quantized.
- Drop Selection grounds each member independently but records one history snapshot.
- A placement belongs to at most one cluster; valid clusters contain at least two same-room members.

## How to Verify Manually

1. Run `npm run dev`, then open `/dev/museum-editor`.
2. Select Paris, Shift-select two objects, press `Cmd/Ctrl+G`, rename the cluster, then undo/redo.
3. Rotate, translate, and uniformly scale the cluster; confirm spacing stays rigid under Paris room yaw and each drag creates one undo step.
4. Toggle Keep Group on Floor and transform; confirm all members receive the same Y shift.
5. Raise two members to different heights, press `End`, and confirm each lands independently with one undo step.
6. Orbit to a new angle and press `F`; confirm framing preserves the viewing direction. Compare middle-pan close to an object versus room overview.
7. Verify `Cmd/Ctrl+G` and `Cmd/Ctrl+A` are not intercepted while typing in the cluster name field.

## Next Phase Entry Point

Phase 4 asset manifest/library migration remains next; preserve the flat visitor object render and editor-only cluster metadata boundary.
