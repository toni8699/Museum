# Phase 6 Handoff — Camera Editing and Drift-Free Preview

## Phase Result

- **Phase goal:** edit all authored navigation-node eye/target poses and preview the exact visitor camera motion without losing or drifting the editor orbit pose.
- **Completed:** shared camera-motion construction/sampling/constants; visitor director migration; valid-by-construction camera selection; selected-node eye/target helpers; one persistent translate-only camera/placement gizmo; room-local drag and atomic numeric editing; resolver-derived connection endpoints; node/transition preview; immutable route capture; exact OrbitControls snapshot/restore; modal command guards; production editor isolation.
- **Intentionally not completed:** node creation/deletion/renaming, topology or interior-waypoint editing, `targetWaypoints`, collision authoring, persistence/import/export, and broader architecture documentation.
- **Acceptance status:** `npm test` 15 files / 173 tests, `npm run check` 0 errors / 0 warnings, and production build passed. Production preview returned 200 for `/museum` and 404 for `/dev/museum-editor`; no editor implementation symbols were present in production client/server chunks. Pointer-level WebGL acceptance remains manual because the browser-control backend was unavailable.

## Shared Motion Contract

- `camera-motion.ts` is the only owner of visitor projection, motion timing, rounded-path constants, construction, smootherstep, and sampling.
- `createCameraMotion()` validates and clones equal non-empty pose arrays. A live start pose replaces only the first cloned pose of a multi-pose route; a true singleton ignores it and has zero duration.
- Motion paths and duration are precomputed. `sampleCameraMotion()` clamps progress and writes into caller-owned `Vector3` outputs without reconstructing paths.
- Distinct connected nodes with coincident eyes retain two identical position poses. Their different targets therefore animate for the shared minimum duration instead of collapsing into a singleton.
- `CameraDirector.svelte` consumes the shared motion while retaining reduced motion, transition completion, Paris free-look, and the live departure pose override.

## Camera Editing Contracts

- `cameraSelection` is either `null` or `{ nodeId, handle: 'position' | 'target' }`. A new row selects `position`, clears placement selection, cancels pending placement/framing, and issues one frame request. Re-selecting the same position is a no-op; target-to-position switching does not reframe.
- Only the selected node mounts helpers. Eye and target markers are pickable; the connector line has no raycast; helpers disappear during pending placement and preview. Alt-cycle remains placement-only.
- Node framing resolves both committed world-space points, expands their `Box3` by 0.5 m, and consumes the focus version once. Commits, undo, and redo do not replay old framing.
- The editor creates one persistent Three `TransformControls` instance. Target changes detach before attach. Placement targets retain existing transform behavior; camera targets are world-space translate-only with no snap, rotation, scaling, or floor handling.
- A camera gizmo drag owns one document transaction. Document/helper/inspector values preview live in room-local coordinates; the runtime graph rebuilds only on commit. Escape resets and terminates the drag, restores the committed root, cancels the transaction, and consumes the key. No movement creates no history.
- The active vector form owns all three string drafts. Enter, whole-form blur, and native step changes commit one complete finite `Vec3`; incomplete, non-finite, and unchanged drafts restore without history.
- Runtime connection endpoints remain resolver-owned. Eye edits regenerate incident first/last position endpoints; authored interiors are unchanged; target edits never alter connection position paths; generated values are not persisted.

## Preview and Orbit Ownership

- The store keeps only serializable preview IDs/timing/completion. `EditorCameraRig` owns the cloned pose/route, `CameraMotion`, reusable output vectors, and Orbit snapshot.
- Preview preparation cancels a camera drag, pending placement, and all frame requests before capturing the author orbit pose. It then disables Orbit input and its update task, flushes once with damping off, applies shared visitor projection, and starts the immutable preview.
- Transition preview is selected node to `nextNodeId`. Missing, unknown, and unroutable destinations leave preview inactive and report status in the camera inspector.
- Playback samples elapsed time once per frame, forces an exact final sample, marks completion once, and holds without looping. Singleton motion completes immediately. Stop works before the first frame, in flight, and after completion.
- Stop invokes the rig restorer synchronously before the store clears modal state. Teardown also restores and releases preview ownership, preventing hot-reload remount drift.
- Restore keeps Orbit disabled/damping off; restores camera position, zoom, FOV, near/far and target; updates projection; performs one unrestricted-distance controls update; then restores distance limits, damping, and enabled state. Aspect is intentionally never restored, so viewport resize remains authoritative.

## Modal and Escape Contracts

- Store commands and UI both block preview-time selection, framing, transforms, numeric commits, placement, asset-library actions, grouping, duplicate/delete, undo/redo, outliner mutation, camera settings, and new frame requests.
- Escape priority is camera-drag cancellation, preview stop/restoration, pending placement cancellation, then normal deselection.
- Preview and helper selection never enter document history.

## Manual Acceptance

1. Open `/dev/museum-editor`; select nodes in yawed and unrotated rooms. Verify eye/target helpers, marker switching, one-shot two-point framing, and one translate gizmo.
2. Drag eye and target helpers; test no movement, Escape cancellation, selection blocking during drag, one-step undo/redo, room-local inspector values, and generated-route endpoint behavior.
3. Test Enter, X-to-Y-to-Z focus movement, whole-form blur, spinner arrows, partial minus, empty, `NaN`/`Infinity`, and unchanged numeric drafts.
4. Start/cancel asset placement with a camera node selected. Verify helpers/gizmo hide and return, pending framing clears, and Alt-cycle remains placement-only.
5. Preview a node and a transition. Verify visitor projection/timing, exact destination hold, modal UI, Escape/Stop ordering, immediate Stop, completion Stop, repeated cycles, and no history.
6. Before preview, test disabled OrbitControls, disabled damping, unusual zoom/distance/projection, and a resized viewport. Confirm every value except aspect restores exactly.
7. Compare visitor/editor transition samples and regression-check guided navigation, reduced motion, and Paris free-look.

## Verification

- `npm test` — 15 files / 173 tests passed.
- `npm run check` — 0 errors / 0 warnings.
- `npm run build` — passed; only existing dependency unused-import, large-chunk, and adapter-auto notices remain.
- Production preview — `/museum` 200; `/dev/museum-editor` 404.
- Production output — the required SvelteKit 404 route shell remains tiny; no real editor implementation entry, component symbol, or visitor import reachability is present.

## Next Phase Entry Point

Phase 7 can take on persistence/import/export and runtime document validation. Preserve the shared motion contract, resolver-owned generated endpoints, one transaction per authored camera pose edit, the serializable/live preview boundary, and production editor isolation. Broader architecture documentation remains Phase 8.
