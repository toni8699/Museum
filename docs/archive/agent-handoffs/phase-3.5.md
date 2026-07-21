# Phase 3.5 Handoff — Precision Placement and Plane Grounding

## Phase Result

- **Phase goal:** make selected placement transforms precise with configurable snapping, Drop to Floor grounding from world AABB bottoms, and optional Keep on Floor after transform end.
- **Completed:** session-only snap / keep-on-floor settings; TransformControls rotation snap; room-local translation quantization (Paris yaw-safe); floor meshes tagged `editorSurface`; AABB raycast drop; Keep on Floor on gizmo mouse-up; G shortcut; Placement inspector section; unit + store history tests.
- **Intentionally not completed:** collision resolution, wall/ceiling/object magnetic snapping, multi-object transforms, pivot editing, measurement rulers, asset library migration (Phase 4).
- **Acceptance status:** `npm test` 71/71, `npm run check` 0/0, `npm run build` passed. Production client output has no Phase 3.5 placement UI strings. Interactive WebGL acceptance remains a manual check in `/dev/museum-editor`.

## Main Changes

| Area | Behavior |
|---|---|
| Settings | `translationSnap*`, `rotationSnap*`, `keepOnFloor`, `statusMessage`, `dropToFloorRequestId` on `MuseumEditorStore` — session-only, never in document snapshots. |
| Snap | Rotation via TransformControls `rotationSnap` (degrees→radians). Translation via `snapRoomLocalPosition` in preview (Three world snap is unreliable under rotated room parents). Shift temporarily disables both. |
| Floor tag | `Floor.svelte` and music-chamber circle stamp `userData.editorSurface = { type: 'floor', placeable: true }`. |
| Drop / Keep | `editor-placement.ts` bounds + downward multi-origin raycast; `commitPlacementTransform` / transaction commit for one history entry. |
| UI | `EditorPlacementInspector` + `EditorPlacementTools` (G + drop request observer). |

## Contracts

- Transform placement roots only; never GLTF children.
- One user command → one history snapshot.
- Editor settings must not appear in visitor scene JSON.
- No valid floor → status message, no history entry.

## How to Verify

1. `npm test`
2. `npm run check`
3. `npm run build`
4. Production preview: `/dev/museum-editor` → 404; `/museum` → 200
5. Dev manual: snap toggles, Shift bypass, Drop to Floor / G, Keep on Floor after rotate/scale, undo/redo Y

## Next Phase Entry Point

Phase 4 — asset manifest/library migration (confirm creation/placement scope first).
