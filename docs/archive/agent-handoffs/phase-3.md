# Phase 3 Handoff — Room-Focused Placement Transforms

## Phase Result

- **Phase goal:** make Paris Salon the first room-scoped editing surface, center the editor camera on the selected room, transform registered placement roots with standard gizmos, edit transforms numerically, and provide capped snapshot undo/redo.
- **Completed:** Paris-only room accordion and selection gate; reusable room camera framing; middle-button camera pan with inspector toggle; one `@threlte/extras` TransformControls instance; rotate-on-new-selection with default red X / green Y / blue Z axes; translate/rotate/uniform-scale modes; gizmo/selection/Orbit pointer coordination; room-local numeric inspector with degrees↔radians; full-document transaction history (100 undo steps); runtime scene/graph/state re-resolution on commit/restore; keyboard and button undo/redo.
- **Intentionally not completed:** other editable rooms, duplicate/delete, floor placement, asset library/manifest migration, navigation or camera-pose editing, persistence/import/export, and main architecture documentation (Phases 4–8).
- **Acceptance status:** `npm test` 54/54, `npm run check` 0/0, `npm run build` passed. Dev SSR returns the closed Paris accordion and six placeholder rooms. Production preview returns 404 for `/dev/museum-editor` and 200 for `/museum`; production bundles contain no real Phase 3 editor strings. Interactive WebGL acceptance remains pending because no browser backend was available in this session.

## Main Changes

| Area | Main API / behavior | Important decisions |
|---|---|---|
| Store and history | `selectedRoomId`, `transformMode`, `cameraFocusVersion`, document transactions, `undo`/`redo`, `canUndo`/`canRedo`. | Snapshots contain only the full scene document; selection, room, camera, lighting, mode, and Object3D registry remain ephemeral. Runtime scene/state rebuild together after commits and restores. |
| Camera | `createEditorRoomCameraFrame(room, fov)` and room-aware `EditorCameraRig`. | Neutral overview remains until Paris is clicked. Room framing uses dimensions + yaw; middle-drag pans when the session toggle is on, and clicking Paris resets the frame. Objects never reframe the camera. |
| Selection | Existing explicit raycaster now validates placements against the selected room and shares the live TransformControls ref. | No placement can be selected before Paris. Empty/shell/Escape clears only the object. Gizmo axis/drag ownership suppresses selection. |
| Gizmo | `EditorTransformControls.svelte` attaches to the registered outer root. | New selection defaults to rotate; reselect preserves mode. Standard Three colors are untouched: X red, Y green, Z blue. World space, no snapping. OrbitControls auto-pauses during drag. |
| Transform data | `editor-transform.ts` owns transform extraction, validation, degrees/radians, and uniform-scale enforcement. | Object roots stay room-local; scale is one positive scalar, clamped to `0.01`; unit scale deletes the optional JSON field. |
| UI | Paris room accordion, placeholder room rows, transform inspector, axis legend, and history controls. | Number fields use local drafts; blur/Enter commits one snapshot, Escape/invalid input restores without history. Nodes were removed from the editor sidebar. |

### Selection replacement fix

- Selection-bound BoxHelper, TransformControls, and numeric inspector instances are keyed by `selectedPlacementId`.
- Switching object rows therefore destroys the old helper/control lifecycle before attaching to the new registered root; the old yellow box cannot remain attached while the store points at the new placement.

## Runtime Flow

1. The editor opens at the neutral camera with no selected room and no selectable placements.
2. Clicking Paris selects the room, expands its document-ordered placements, clears any previous object on first selection, and focuses the room camera.
3. Outliner or raycast selection attaches BoxHelper + TransformControls to the registered outer root and selects rotate mode.
4. Gizmo object changes mutate the root and session document live without rebuilding the scene per frame.
5. Mouse-up commits one before-snapshot, clears redo, and rebuilds the canonical runtime scene/graph/state pair. Numeric edits use the same transaction boundary.
6. Undo/redo swaps cloned document snapshots and rebuilds the paired runtime objects while retaining valid selections.

## Contracts and Invariants

- Only Paris is an editable/selectable room in Phase 3; every other room row is non-interactive placeholder text.
- TransformControls must attach to `EditorPlacementRoot`, never a nested GLB mesh or AssetModel-local default transform.
- Object3D refs, registry maps, controls, and camera state never enter `$state` document snapshots.
- Keep `scene` and `state.graph` paired after every document restore; use the `paris-seat` editor seed.
- A drag produces at most one history entry; clicking a gizmo without movement produces none.
- Do not bump `registryVersion` for each transform frame. BoxHelper already updates in `useTask`; per-frame bumps would recreate its effect-owned helper.
- Standard TransformControls axis materials are not overridden (`#ff0000`, `#00ff00`, `#0000ff`).
- Production isolation remains dual-layer: server 404 plus virtual production stub.

## How to Verify

1. `npm test` — expected 5 files / 54 tests.
2. `npm run check` — expected 0 errors / 0 warnings.
3. `npm run build` — expected success; museum-editor client node remains stub-sized and real editor strings are absent.
4. Production preview: `/dev/museum-editor` → 404; `/museum` → 200.
5. Dev `/dev/museum-editor` manual pass still required:
   - initial accordion closed; six room placeholders; no object selectable
   - click Paris → accordion opens and camera centers; orbit/zoom work, middle-drag pans, and the inspector toggle disables/re-enables pan
   - select a Paris object → gold BoxHelper and red/green/blue rotation rings
   - select a second sidebar object directly → old BoxHelper/gizmo disappear and the new object owns helper, gizmo, and inspector values without an intermediate Deselect click
   - switch Translate/Scale; choose another object → mode returns to Rotate
   - gizmo drags do not orbit/deselect; scale stays uniform and positive
   - inspector updates live; blur/Enter is one undo step; invalid/Escape is no step
   - undo/redo buttons and shortcuts restore both root and numeric values
   - hard refresh has no `effect_update_depth_exceeded`; Paris still uses real GLBs

## Known Problems

- The interactive WebGL pass above was not run because the in-app browser reported no available browser backend. Static, unit, SSR, build, and preview verification passed.
- The Phase 0 visitor visual tour check remains pending.
- The neutral overview exists before Paris selection by product choice; room-centered control begins only after the first Paris click.

## Next Phase Entry Point

### Expected next goal

Phase 4 asset manifest/library migration: make asset IDs data-driven (`string`), colocate editor/runtime asset metadata, remove the legacy `MuseumAsset.rooms` coupling, and expose assets to later placement creation without adding a second loader or manifest.

### Read first

1. [`phase-3.md`](./phase-3.md)
2. [`../../apps/museum/src/lib/editor/museum-editor.svelte.ts`](../../apps/museum/src/lib/editor/museum-editor.svelte.ts)
3. [`../../apps/museum/src/lib/content/assets.ts`](../../apps/museum/src/lib/content/assets.ts)
4. [`../../apps/museum/src/lib/types/assets.ts`](../../apps/museum/src/lib/types/assets.ts)
5. [`../../apps/museum/src/lib/museum/assets/AssetModel.svelte`](../../apps/museum/src/lib/museum/assets/AssetModel.svelte)

Confirm the detailed Phase 4 product scope before implementing creation/duplication/floor placement; Phase 3 supplies transform/history primitives but deliberately does not define those workflows.
