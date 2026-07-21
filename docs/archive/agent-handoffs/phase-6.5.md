# Phase 6.5 Handoff — Camera Path Expansion and Authoring

## Phase Result

- **Goal:** create and shape graph connections directly in the development editor while visitor/editor playback uses identical camera geometry.
- **Implemented slices:** schema/migration; route/motion; visitor path removal; navigation selection/helpers; direct manipulation; node/topology commands; inspector/exact-edge preview; regression documentation.
- **Preserved:** Phase 7 import/export and dirty guards, Phase 6 atomic history and exact Orbit restoration, reduced motion, Paris activation/live departure/free-look, and development-editor production isolation.
- **Schema result:** checked-in scene is v2 with eight legacy connections and 41 stable interior anchors, all retained as `rounded-polyline` until explicitly converted or bent.
- **Verification status:** `npm test` passed 18 files / 238 tests; `npm run check` passed with 0 errors / 0 warnings; `npm run build` passed. Development HTTP smoke returned 200 for `/museum` and `/dev/museum-editor`. Production returned 200 for `/museum` and 404 for `/dev/museum-editor`; built output contains no editor path-helper symbols or visitor-to-editor imports. Interactive WebGL acceptance remains manual because no browser-control backend was available in the implementation session.

## Schema and Runtime Graph

- `museum-scene.json`, not `rooms.ts`, owns placements, camera nodes, guided links, and connection interiors. `rooms.ts` owns static architecture and coordinate transforms only.
- Scene v2 replaces `positionWaypoints` with `positionPath`, whose kind is `rounded-polyline` or `auto-bezier` and whose interior anchors have stable IDs.
- Anchor coordinates remain room-local when `roomId` exists and world-space otherwise. Resolver clones them into world space and inserts fresh `node:<id>:position` endpoint anchors; generated endpoints are never serialized.
- Codec rejects duplicate/empty anchor IDs, endpoint-ID collisions, non-finite points, bad clearance, unknown/self/duplicate edges, asymmetric adjacency, and a disconnected graph.
- Strict v1 data is parsed and validated under v1 all-node-cycle semantics first. Successful migration assigns deterministic `${connectionId}-anchor-${NN}` IDs and canonicalizes to v2 `rounded-polyline`. Validation/import/serialization return v2 without mutating input.
- Version 2 permits free-only nodes: each node defines both guided links or neither. Guided nodes form one reciprocal cycle; whole undirected graph remains connected.

## Route and Motion Contracts

- `CameraRoute` now carries typed `positionParts` plus `targetPoints`; `ResolvedCameraRoute` retains traversed `nodeIds` for Paris activation.
- `camera-route.ts` owns BFS, edge reversal, join validation, part assembly, and synthesized look targets. Consecutive rounded edges coalesce with duplicate suppression and minimum clearance, preserving legacy route samples/timing.
- Auto-Bézier edges remain separate parts. `getCameraConnectionRoute(connectionId, direction, graph?)` resolves the exact selected edge without BFS ambiguity.
- `camera-motion.ts` remains sole Three.js curve owner. `createCameraPositionPath()` supplies identical position geometry to visitor motion, editor drawing/picking, and exact-edge preview.
- Rounded parts keep the Phase 6 line/quadratic fillet implementation. Auto parts use duplicate-safe centripetal Catmull–Rom tangents (`alpha = 0.5`) converted to cubic Bézier spans; controls are derived, not persisted.
- Shared projection, smootherstep, global length-based duration, precomputed arc lengths, allocation-free sampling, live-start replacement, reduced motion, target-only minimum duration, and exact completion remain intact.

## Editor Selection and Path Helpers

- Navigation selection is discriminated as node, connection, or stable-ID anchor. Navigation and placement selections remain mutually exclusive.
- Undo/redo keeps an anchor selected while its ID exists, falls back to its connection if only the anchor disappeared, and clears selection if the connection disappeared.
- One persistent TransformControls instance serves placements, node handles, and anchors. Anchor/node targets are world-space, translate-only, unsnapped, and never inherit placement rotation/scale/grounding settings.
- `EditorCameraPathHelpers.svelte` is mounted only in editor viewport, outside `MuseumScene`. It renders exact shared curves with thin `Line2` visuals, separate generous transparent pick surfaces, and anchor markers only for selected connection.
- Visual sampling uses 8 segments/meter, clamped 32–512. Visual lines do not raycast. Helpers dispose geometry/materials and hide during preview or pending placement/topology modes.
- Pointer ownership remains centralized: modal shield → gizmo → active path drag → pending mode → node/anchor helper → curve → Orbit → placement selection. Alt stays placement-only.

## Direct Manipulation and Atomic History

- Click connection selects without framing/history. Crossing existing 4 px drag threshold starts one path transaction.
- Empty-line drag captures connection plus nearest progress (128 coarse steps + 12 refinements), converts rounded path if needed, inserts one smallest-free stable anchor, selects it, and continues same gesture.
- Existing-anchor direct drag uses horizontal world plane through initial Y; X/Z change while Y stays fixed. Shared gizmo and XYZ inspector handle deliberate Y edits.
- Existing anchor keeps coordinate basis. New anchor is room-local only when initial hit is inside active editable room’s yaw-aware footprint; otherwise world-space.
- A `1e-4 m` no-op, Escape, blur, pointer cancel, lost capture, or teardown restores exact document, selection, and Orbit ownership with no history. Successful release commits once and attaches shared gizmo.
- Explicit conversion, numeric edit, gizmo move, direct move/insertion, and anchor deletion each create at most one history entry. Anchor deletion preserves current path kind.

## Topology, Inspector, and Preview

- Central defaults: eye `1.65 m`, target `1.25 m`, target distance `3 m`, clearance `0.35 m`.
- **Add Connected Camera Node** captures selected source and active editable room (Paris). Valid floor click creates room-local node plus first straight auto connection atomically, updates adjacency symmetrically, leaves guided links absent, selects/framed new eye, and never exposes isolated committed node.
- Camera IDs/labels use smallest free `camera-node-N` / `Camera Node N`; connection IDs start `${sourceId}-${destinationId}` with collision suffixing; anchor IDs use smallest free `${connectionId}-anchor-${NN}`.
- **Connect Existing Nodes** creates one straight auto connection between valid distinct unconnected nodes, updates both adjacency lists, leaves guided links unchanged, and commits once.
- Inspector supports node label editing, connection kind/clearance details, explicit smooth conversion, bidirectional exact-edge preview, anchor XYZ, and anchor deletion.
- Preview captures immutable committed route and existing exact Orbit snapshot. Stop/Escape/teardown restore exact pre-preview camera/controls; preview never mutates history.

## Visitor and Production Boundaries

- `StaffPath.svelte` was removed and `MuseumScene` no longer mounts visitor path geometry. `/museum` shows no ribbons, connection curves, anchors, tangents, or editor helpers.
- Free-mode routing can reach free-only nodes. Guided Next/Back remain disabled at a free-only active node because it has no guided links.
- Editor curve modules remain reachable only through development editor entry. Production `/dev/museum-editor` must return 404, and visitor chunks must contain no real editor path-helper implementation.
- Scene JSON browser tools continue to Copy/Download only; no browser filesystem writes, autosave, or `localStorage` were added.

## Manual Acceptance

1. Open `/museum`; confirm no route ribbon/curve/anchor/helper, then test guided Next/Back, free multi-hop, reduced motion, and Paris free-look/live departure.
2. In `/dev/museum-editor`, select every line; confirm slim visual, generous hit area, selected-only anchors, correct hover, empty-space Orbit, and Alt placement-only behavior.
3. Bend empty rounded line in one gesture; confirm conversion + insertion + drag is one undo entry and one undo restores exact rounded path.
4. Move anchors directly, through gizmo, and through XYZ inspector; test yawed-room local coordinates, fixed direct-drag Y, deliberate gizmo Y, no-op, Escape, blur, cancel, lost capture, and redo selection reconciliation.
5. Add connected node and connect existing nodes; verify IDs/defaults, symmetric adjacency, free-only behavior, invalid-floor/self/duplicate rejection, cancellation, and one-step undo/redo.
6. Convert and preview each legacy edge forward/reverse. Check doors, walls, ceilings, duration, synthesized look, target-only behavior, and representative mixed/multi-hop routes.
7. Exercise preview Stop immediately/mid-motion/after completion, resize, repeated cycles, and unusual Orbit settings; confirm exact restoration and no history.
8. Import legacy v1 and canonical v2 JSON; verify deterministic migration, v2 export, dirty guards, invalid import atomicity, and no generated endpoints in export.

## Verification Result

- `npm test` — 18 files / 238 tests passed.
- `npm run check` — 0 errors / 0 warnings.
- `npm run build` — passed.
- Development HTTP smoke — `/museum` 200; `/dev/museum-editor` 200.
- Production preview — `/museum` 200; `/dev/museum-editor` 404.
- Built chunk/source import search — no real editor path-helper symbols in production output and no editor imports from visitor modules.
- Interactive WebGL checklist above — not executed; browser-control backend unavailable in this session.

## Deferred Work

Explicit tangent handles · authored look curves / `targetWaypoints` UI · per-edge timing · collision/navmesh · guided-order editing · node/connection deletion · multiple active editable rooms · visitor-visible path lines.

No commit was created for this phase unless later handoff amendment records one.
