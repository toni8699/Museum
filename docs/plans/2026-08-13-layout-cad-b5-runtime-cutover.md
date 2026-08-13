# B5 — Serialized Project Runtime Cutover

**Date:** 2026-08-13  
**Status:** Implemented
**Parent:** [`2026-08-10-layout-cad-foundation.md`](./2026-08-10-layout-cad-foundation.md)  
**Prerequisite:** [`2026-08-12-layout-cad-b4-runtime-dual-read.md`](./2026-08-12-layout-cad-b4-runtime-dual-read.md)  
**Handoff:** [`../hand-off/CURRENT.md`](../hand-off/CURRENT.md)  
**Contracts:** [`../architecture.md`](../architecture.md) · [`../components/persistence.md`](../components/persistence.md)

## Goal

Make one validated, serialized `MuseumProject` the production source for Chopin
architecture and scene/tour data.

```text
chopin-project.json
  -> visitor-safe project validation
  -> project.layout -> room frames + LayoutMuseumShell
  -> project.scene  -> existing scene resolver + navigation graph
  -> camera-route.ts + camera-motion.ts (unchanged)
```

After B5, `/museum` always renders architecture from `project.layout`. It never
compiles or falls back to handwritten `rooms.ts`. Stable room IDs keep scene,
tour, HUD, bespoke dressing, and portal relations joined across the cutover.

## Current gaps B5 must close

- `chopin-layout.ts` still calls `roomsToLayout()` at module load; B4 therefore
  proves layout rendering but does not yet load serialized layout bytes.
- `MuseumProject` types/codec live below `$lib/editor/**`, so visitor code cannot
  use the project envelope without violating visitor isolation.
- `scene.ts`, scene validation, state defaults, entities, HUD, room dressing, and
  layout presentation still read global transforms or metadata from `rooms.ts`.
- Layout v2 stores world-space room boundaries but no explicit room-local frame.
  Scene nodes, entities, path anchors, and view targets remain room-local, so a
  production cutover needs one stable layout-owned local/world transform.
- B4 defaults to `MuseumShell`, retains a dev query toggle, and hard-codes the
  Music Chamber generic-shell exception inside `LayoutMuseumShell`.

A source flip alone would leave `rooms.ts` as the real transform and metadata
owner. B5 removes those hidden reads before changing the production default.

## Locked decisions

- Keep `MuseumProject.formatVersion: 1`. Its nested layout becomes canonical v3;
  its scene remains canonical v6.
- Promote project types and codec into visitor-safe shared modules. Editor paths
  may re-export them during migration, but visitor imports must never cross
  `$lib/editor/**`.
- Layout v3 adds an explicit room frame. Layout owns room identity, architecture,
  elevation, and local/world placement; scene owns entities and camera/tour data.
- `roomId` is an opaque validated layout room ID, not a closed union enforced by
  `rooms.ts`. Chopin-only code may keep a local `ChopinRoomId` union.
- Production loads one checked-in `chopin-project.json`. Standalone
  `museum-scene.json`, runtime `roomsToLayout()`, and `chopin-layout.ts` are not
  parallel production sources.
- `/museum` has one architecture path after cutover: `LayoutMuseumShell`. Remove
  the production source prop/query and the silent legacy fallback.
- Existing bespoke room dressing stays code-owned. Its world transform comes
  from the layout room frame. Chopin render overrides are explicit validated
  presentation policy, never geometry inferred from room IDs inside the generic
  layout renderer.
- Layout objects remain editor/layout data and do not become visitor scene
  entities in B5. Visitor content still comes from `project.scene`.
- Portal relations remain semantic inspection data. They do not create camera
  edges, tour order, or a second navigation graph.
- Keep current `buildLayoutArchitectureModel()` for cutover. Shared geometry
  compiler, `PlanRenderModel`, procedural meshes, adaptive curve parity, and
  renderer experiments remain post-B5 work.
- Rollback is a source revert, not a permanent runtime fallback branch. Keep the
  B4 branch only until B5 parity passes; remove it before the exit gate.

## Layout v3 room frame

Add one field to every canonical `LayoutRoom`:

```ts
type LayoutRoomFrame = {
  /** World/layout XZ position of room-local [0, 0, 0]. */
  origin: LayoutVec2;
  /** Three.js positive-Y yaw in radians. */
  yaw: number;
};

type LayoutRoom = {
  // existing fields
  frame: LayoutRoomFrame;
};
```

Floor elevation supplies the local Y origin. Shared pure transforms are:

```ts
layoutRoomPoint(room, floor, [localX, localY, localZ]) -> world Vec3
layoutRoomLocalPoint(room, floor, worldPoint)          -> local Vec3
```

The mapping must exactly match the existing Three.js positive-Y convention used
by `roomPoint()` and `roomLocalPoint()`.

### Migration and editing rules

- Codec accepts layout v1/v2 and emits canonical v3.
- v1/v2 migration derives `origin` from the sampled-boundary shoelace centroid
  and `yaw` from the first non-degenerate boundary tangent. The pure frame helper
  is shared; do not import editor state or build the post-B5 geometry compiler.
- The compiled Chopin rectangles must recover every current `rooms.ts` position
  and yaw within `1e-9`.
- New room drafting initializes a frame once when the room is committed.
- Whole-room translation/rotation transforms boundary, owned layout objects, and
  frame in the same tagged `layout` transaction.
- Vertex, bend-anchor, wall, and opening edits do not silently recalculate the
  frame. Otherwise local scene content would drift when architecture is reshaped.
- Frame numbers must be finite. Canonical output normalizes yaw consistently.
- Frame origin is authored semantic data, not derived renderer state. It may be
  outside a later-edited polygon without making the document structurally invalid.

## Visitor-safe project boundary

Move the C0 project contract to a shared path, conceptually:

```text
$lib/project/project-types.ts
$lib/project/project-codec.ts
$lib/project/project-layout-semantics.ts
```

Project validation runs in this order:

1. Validate/canonicalize nested layout v1-v3.
2. Build the room ID index and room-frame resolver from canonical layout.
3. Parse/canonicalize nested scene v1-v6 without consulting global rooms.
4. Validate every scene `roomId` against the project layout: entities,
   navigation nodes, position anchors, target waypoints, and view keyframes.
5. Run world-space camera pose checks through the layout room resolver.
6. Prefix nested and cross-document failures under exact `$.layout...` or
   `$.scene...` paths and emit canonical project JSON.

`validateSceneDocument()` keeps scene-internal schema/topology validation but no
longer imports `getRoom()` or `roomPoint()`. Project-level validation owns
cross-document room existence and room-relative pose semantics.

Change runtime scene resolution from hidden global state:

```ts
resolveSceneDocument(sceneDocument)
```

to an explicit dependency:

```ts
resolveSceneDocument(sceneDocument, roomResolver)
```

Generated `node:<id>:position` endpoints remain resolver-owned runtime values and
are never serialized.

## Canonical Chopin project

Check in `apps/museum/src/lib/content/chopin-project.json` with:

- project id/name;
- canonical layout v3, including explicit room frames and v2 portal relations;
- canonical scene v6 copied into `project.scene`;
- stable existing room, entity, node, anchor, and connection IDs.

Add a small visitor-safe loader that validates once and exports a composed runtime:

```ts
type MuseumRuntime = {
  project: MuseumProject;
  rooms: LayoutRoomRegistry;
  scene: RuntimeMuseumScene;
  graph: NavigationGraph;
};
```

The loader fails closed on invalid bytes, missing room references, or invalid
room frames. No compile-from-rooms or partial project fallback is allowed.

Canonical fixture tests must prove:

- checked-in bytes equal `serializeMuseumProject()` output;
- nested layout and scene are already canonical;
- current room frames and portal relations survived migration;
- no runtime module imports `rooms-to-layout` to construct the project.

Use a one-time migration script or test fixture to create the initial JSON from
the current B4 sources. Do not keep both old and new checked-in documents as
hand-maintained production inputs.

## Room registry and presentation

Create one layout-derived registry keyed by room ID. Each entry exposes the floor,
room, frame transforms, and layout room name. Unknown IDs fail precisely at the
project boundary.

Move Chopin-only display/style values out of `rooms.ts` into a non-geometric
presentation map:

```ts
type ChopinRoomPresentation = {
  subtitle?: string;
  mood?: string;
  color: string;
  accentColor: string;
  shell: 'layout' | 'bespoke';
};
```

Rules:

- Layout `room.name` supplies the primary room title.
- Presentation keys must reference rooms in the loaded project.
- Unknown future rooms receive neutral style fallback.
- Presentation never supplies position, yaw, dimensions, boundaries, openings,
  or navigation.
- The Music Chamber's current bespoke shell/dressing policy is declared once in
  this map. `LayoutMuseumShell` receives explicit exclusions and contains no
  hard-coded `roomId === 'music-chamber'` branch.
- Bespoke components receive or inherit the registry frame; they do not import
  `rooms.ts`.

## Runtime cutover

Wire the composed project runtime through the existing visitor surfaces:

- `/museum` creates/uses state from `runtime.graph` and passes one consistent
  runtime to Canvas and HUD.
- `MuseumCanvas`/`MuseumScene` receive layout, resolved scene, room registry, and
  presentation explicitly or through one visitor-safe runtime object.
- `MuseumScene` mounts `LayoutMuseumShell` only. Remove `architectureSource`, the
  dev `?architecture=layout` switch, and production `MuseumShell` import.
- `MuseumEntities` groups room-local entities by layout-derived frame.
- Room dressing components render below a shared room-frame wrapper instead of
  calling `getRoom()` themselves.
- HUD reads title from layout and optional subtitle/mood from presentation.
- Scene resolver, camera defaults, state defaults, and graph exports are derived
  from the same project instance. No independently constructed singleton may
  disagree with the rendered project.
- Preserve the shared ground plinth and render the Music Chamber exactly once.
- Keep `camera-route.ts`, `camera-motion.ts`, and the tour FSM behavior unchanged.

Editor consumers that convert room-local/world coordinates must receive the
active project's room resolver. Compatibility re-exports may reduce churn, but
they must derive from the active layout and must not restore handwritten room
geometry as a second source.

## Legacy retirement

After automated and manual parity pass:

- remove handwritten production `rooms.ts` geometry/transforms;
- remove `MuseumShell.svelte` from the visitor path;
- remove runtime `roomsToLayout()` and `chopin-layout.ts` construction;
- stop importing standalone `museum-scene.json` in production;
- replace tests that need legacy parity with a frozen test-only fixture or
  normalized golden values;
- add an import-boundary test forbidding visitor dependencies on legacy room
  geometry, editor modules, and the rooms compiler.

If temporary editor compatibility needs a `rooms` module during the same change,
it must be a projection of `MuseumProject.layout`, clearly deprecated, and absent
from visitor imports. Delete it before declaring B5 complete when feasible.

## Implementation sequence

1. Add layout v3 room-frame types, v1/v2 migration, validation, canonical write,
   coordinate transforms, and focused tests.
2. Update room drafting and B3 room-unit transforms so frames initialize once and
   move atomically with their room units.
3. Promote project types/codec to `$lib/project`; keep editor re-exports while
   migrating imports.
4. Remove `rooms.ts` knowledge from scene parsing/validation; add project-level
   room-reference and room-relative camera-pose validation.
5. Make `resolveSceneDocument()` require a layout room resolver and migrate tests
   and editor call sites.
6. Generate and check in canonical `chopin-project.json`; add exact canonical and
   cross-document validation tests.
7. Add the project runtime composer, layout room registry, and non-geometric
   Chopin presentation policy.
8. Migrate entities, HUD, room dressing, state defaults, and camera/scene defaults
   from global rooms to the composed runtime.
9. Make `LayoutMuseumShell` the only `/museum` shell, pass explicit bespoke room
   policy, and remove source toggle/fallback wiring.
10. Run normalized legacy-vs-project parity before removing legacy runtime files.
11. Remove or isolate legacy room/compiler/scene fixtures and add visitor import
    boundary tests.
12. Run focused tests, full suite, Svelte check, production build, chunk/import
    inspection, and manual visitor QA.
13. After implementation, update architecture/persistence contracts, mark B5
    shipped in handoff/foundation, and start the post-B5 graphics roadmap.

## Expected files

New/shared:

```text
apps/museum/src/lib/project/project-types.ts
apps/museum/src/lib/project/project-codec.ts
apps/museum/src/lib/project/project-layout-semantics.ts
apps/museum/src/lib/layout/layout-room-frame.ts
apps/museum/src/lib/content/chopin-project.json
apps/museum/src/lib/content/chopin-project.ts
apps/museum/src/lib/content/chopin-room-presentation.ts
```

Primary edits:

```text
apps/museum/src/lib/layout/layout-types.ts
apps/museum/src/lib/layout/layout-codec.ts
apps/museum/src/lib/content/scene.ts
apps/museum/src/lib/content/scene-codec/*
apps/museum/src/lib/state/museum-state.svelte.ts
apps/museum/src/lib/museum/MuseumCanvas.svelte
apps/museum/src/lib/museum/MuseumScene.svelte
apps/museum/src/lib/museum/MuseumEntities.svelte
apps/museum/src/lib/museum/layout/LayoutMuseumShell.svelte
apps/museum/src/lib/museum/rooms/*.svelte
apps/museum/src/lib/museum/ui/MuseumHUD.svelte
apps/museum/src/routes/museum/+page.svelte
apps/museum/src/lib/editor/project/*
apps/museum/src/lib/editor/layout/layout-room-transform.ts
editor room-coordinate consumers
```

Legacy removal or test-only isolation:

```text
apps/museum/src/lib/content/rooms.ts
apps/museum/src/lib/content/rooms-to-layout.ts
apps/museum/src/lib/content/chopin-layout.ts
apps/museum/src/lib/content/museum-scene.json
apps/museum/src/lib/museum/layout/MuseumShell.svelte
```

Exact compatibility file moves may differ. Ownership, visitor isolation, and one
production data path are non-negotiable.

## Implementation record

Implemented 2026-08-13:

- added canonical layout v3 room frames plus deterministic v1/v2 migration and
  atomic room-frame relocation;
- promoted project types, codec, cross-document validation, room registry, and
  scene resolution to visitor-safe shared modules;
- checked in canonical `chopin-project.json` and exposed one validated runtime;
- cut `/museum` over to `LayoutMuseumShell`, project-derived room presentation,
  project scene/tour data, and the existing single camera route/motion path;
- removed the legacy visitor shell and source toggle, isolated `rooms.ts` and the
  old compiler/scene fixture to deprecated editor/test compatibility, and added a
  recursive visitor import-boundary test;
- preserved independent transient scene/layout validation inside the editor.

Verification passed: 92 test files / 1130 tests, Svelte check with 0 errors and
0 warnings, production build, visitor chunk/compiled editor-guard inspection,
and production browser QA across all guided nodes, reverse/free/direct travel,
reduced motion, HUD updates, Paris/Music Chamber visuals, the inert legacy query,
and the editor 404 boundary. Browser errors remained empty.

## Verification

### Layout and project schema

1. Layout v1/v2 read as canonical v3 with deterministic room frames.
2. Existing Chopin rooms recover current origin/yaw within `1e-9`; round-trip is
   byte-stable and idempotent.
3. Non-finite frame origin/yaw fails at the exact JSON path.
4. Whole-room relocate updates frame, boundary, and owned objects in one history
   entry; undo/redo restores all three.
5. Vertex/bend/opening edits leave room frame unchanged.
6. Project v1 accepts nested layout v1-v3 and emits nested canonical layout v3.
7. Unknown scene room references fail at exact `$.scene...roomId` paths for every
   room-relative scene surface.
8. Checked-in `chopin-project.json` validates and equals canonical serialization.

### Runtime parity

9. Project-derived world transforms match the B4 legacy baseline for every room,
   scene entity group, navigation node, camera target, path anchor, target
   waypoint, and view keyframe within `1e-4 m` / `1e-6 rad`.
10. Navigation graph, guided cycle, route samples, transition timing, reduced
    motion, Paris activation, and HUD room identity remain unchanged.
11. Layout shell normalized floors, ceilings, walls, openings, portal frames,
    colors, and accents retain B4 layout-mode output.
12. Music Chamber bespoke content and shared ground render exactly once.
13. Missing/invalid project data fails closed; no legacy shell appears.
14. `/museum` mounts `LayoutMuseumShell` with no production/query source toggle.

### Isolation and regression

15. Visitor import graph contains no `$lib/editor/**`, editor CSS/store/history,
    handwritten legacy room geometry, or runtime rooms compiler.
16. Production chunks contain the serialized project and layout runtime, not a
    second handwritten architecture definition.
17. `/dev/museum-editor` keeps its production 404 guard.
18. Full museum tests, `npm run check -w @portfolio/museum`, and museum production
    build pass.

### Manual QA

- Compare the last B4 legacy build and B5 project build at every camera node and
  doorway, including Entrance, Paris, Music Chamber, and Legacy.
- Traverse guided forward/reverse and free mode; verify reduced motion, direct
  node requests, Back/Next, and HUD updates.
- Verify Paris preload/activation, room dressing placement, lights, floor hits,
  portal alignment, and no doubled shell/chamber/plinth.
- Inspect production network/chunks and confirm editor/layout-authoring code is
  absent from `/museum`.

## Out of scope

- Shared `compileLayoutGeometry()` / `PlanRenderModel` / Three geometry adapter.
- Procedural mesh generation, WebGPU, Rust/WASM, renderer replacement, or mesh
  batching work from the graphics roadmap.
- Using portal relations for navigation, pathfinding, or tour ordering.
- Visitor rendering of `LayoutObject` primitives.
- Arbitrary remote project loading, URL project selection, C1 project import/
  export UI, or package/zip format changes.
- Editor portal-link UI, unified outliner, 3D room gizmos, GLB import, multi-floor
  visitor UX, collision, or a new camera system.
- Converting all bespoke Chopin room dressing into scene entities.

## Exit gate

B5 completes when canonical `chopin-project.json` is the sole production source
for layout and scene data, layout v3 owns stable room-local frames, `/museum`
renders only the layout shell, all room-relative scene/tour resolution uses the
loaded project, legacy `rooms.ts` geometry is absent from visitor imports, parity
and isolation checks pass, and the production build remains editor-free.
