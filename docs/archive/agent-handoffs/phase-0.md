# Phase 0 Handoff — Museum Scene Data Architecture

## Phase Result

- **Phase goal:** move placements and tour navigation into a checked-in scene document, resolve it into explicit runtime coordinates, inject that graph into every visitor consumer, and preserve the current Paris loading/camera behavior before deleting legacy authorship.
- **Completed:** added the versioned scene document and pure resolver; added the local/world inverse transform; migrated 21 Paris placements, 8 nodes, 8 connections, and 41 interior waypoints; injected the resolved graph through route building, state, camera, HUD, node markers, staff path, and Paris activation; extracted `MuseumAssets`; removed the old navigation arrays and Paris layout module; added Vitest and a frozen full-runtime parity fixture.
- **Intentionally not completed:** no editor route, editor store, OrbitControls, selection, transforms, asset discovery/plugin, placement UI, camera editing, browser persistence, semantic import validation, or production editor isolation. `AssetId = string`, asset metadata colocation, and removal of `MuseumAsset.rooms` remain Phase 4 work. Main architecture documentation updates remain scheduled for Phase 8.
- **Acceptance status:** exact old/new runtime parity is locked by the golden fixture; tests, typecheck, production build, approved-model existence check, and `/museum` HTTP smoke passed. A browser/WebGL visual tour was not run because the browser backend was unavailable, so that manual acceptance check remains pending.

## Files Changed

### Scene data and tests

| File | Purpose and main API | Important decisions |
|---|---|---|
| [`apps/museum/src/lib/content/museum-scene.json`](../../apps/museum/src/lib/content/museum-scene.json) | Authoritative version-1 document for room-local objects/nodes and interior connection waypoints. | Objects and nodes are room-local. Waypoints with `roomId` are room-local; omitted `roomId` means world-space. Connection endpoints are not stored. |
| [`apps/museum/src/lib/content/scene.ts`](../../apps/museum/src/lib/content/scene.ts) | Defines `MuseumSceneDocument`, `SceneObjectPlacement`, `SceneNavigationNode`, `SceneWaypoint`, `SceneConnection`, `RuntimeMuseumScene`, and `NavigationGraph`. Exports `resolveSceneDocument`, `createNavigationGraph`, `assertNavigationGraphMatchesScene`, `museumSceneDocument`, `museumScene`, `museumNavigationGraph`, `nodeById`, and `getNode`. | Resolver clones data, leaves objects room-local, resolves nodes/connections to world space, and inserts fresh endpoint arrays. The JSON import has one explicit type assertion; full untrusted-input validation is deferred. |
| [`apps/museum/src/lib/content/rooms.ts`](../../apps/museum/src/lib/content/rooms.ts) | Retains static room architecture, `roomById`, `getRoom`, `roomPoint`, and new `roomLocalPoint`. | Navigation arrays and duplicate `navigationNodeIds` were removed. This file no longer owns the tour graph. |
| [`apps/museum/src/lib/types/museum.ts`](../../apps/museum/src/lib/types/museum.ts) | Shared museum runtime types. | Removed `MuseumRoom.navigationNodeIds` because the scene document now owns node membership. |
| `apps/museum/src/lib/content/paris-salon-layout.ts` | **Deleted:** former Paris placement source. | Placement authorship now exists only in `museum-scene.json`. |
| [`apps/museum/src/lib/content/__fixtures__/legacy-runtime-scene.json`](../../apps/museum/src/lib/content/__fixtures__/legacy-runtime-scene.json) | Test-only frozen pre-migration runtime output. | Keeps numerical parity provable without retaining a second production graph. Do not import it from runtime code. |
| [`apps/museum/src/lib/content/scene.test.ts`](../../apps/museum/src/lib/content/scene.test.ts) | Resolver, parity, serialization, mixed-space waypoint, error-path, graph-pairing, topology, and every-room coordinate tests. | Full deep equality against the golden fixture guards all legacy transforms and paths. |

### Navigation and state

| File | Purpose and main API | Important decisions |
|---|---|---|
| [`apps/museum/src/lib/museum/navigation/camera-route.ts`](../../apps/museum/src/lib/museum/navigation/camera-route.ts) | Exports `getCameraRoute(from, to, graph?)`. | BFS now accepts an injected `NavigationGraph`; the resolved default graph remains the optional default. Route shape, reversal, look synthesis, and clearance behavior are unchanged. |
| [`apps/museum/src/lib/museum/navigation/camera-route.test.ts`](../../apps/museum/src/lib/museum/navigation/camera-route.test.ts) | Covers injected forward/reverse/multi-hop/same-node routes, disconnected and unknown IDs, and default-graph parity. | Custom IDs ensure no hidden default graph is consulted. |
| [`apps/museum/src/lib/state/museum-state.svelte.ts`](../../apps/museum/src/lib/state/museum-state.svelte.ts) | Exports `MuseumStateStore`, `createMuseumState`, and default `museumState`. | Each store owns one injected graph. Every lookup uses that graph; initial node ID is injectable. Existing guided/free/visited/locked/transition rules remain intact. |
| [`apps/museum/src/lib/state/museum-state.test.ts`](../../apps/museum/src/lib/state/museum-state.test.ts) | Covers injected graph transitions, guided backtracking, free mode, locked nodes, and transition re-entry rejection. | Tests use IDs absent from the visitor graph. |
| [`apps/museum/src/lib/museum/navigation/CameraDirector.svelte`](../../apps/museum/src/lib/museum/navigation/CameraDirector.svelte) | Guided default camera and Paris free-look. Accepts `graph` and `state`. | Existing Paris mouse/arrow free-look, path smoothing, reduced motion, and camera constants were preserved. The editor must not mount this component. |
| [`apps/museum/src/lib/museum/navigation/NavigationNode.svelte`](../../apps/museum/src/lib/museum/navigation/NavigationNode.svelte) | Visitor navigation marker. Accepts `node` and matching `state`. | No static graph import remains. |

### Scene assembly and Paris assets

| File | Purpose and main API | Important decisions |
|---|---|---|
| [`apps/museum/src/lib/museum/MuseumScene.svelte`](../../apps/museum/src/lib/museum/MuseumScene.svelte) | Scene assembly. Accepts `scene`, matching `state`, optional `camera` snippet, and `showNavigationNodes`. | Derives the graph from `scene` and fails fast if `state.graph` belongs to another runtime scene. A later editor should supply its own camera and set `showNavigationNodes={false}`. |
| [`apps/museum/src/lib/museum/MuseumCanvas.svelte`](../../apps/museum/src/lib/museum/MuseumCanvas.svelte) | Visitor Threlte canvas wrapper. Accepts and forwards `scene` and `state`. | Visitor defaults remain `museumScene` and `museumState`; shadows/DPR are unchanged. |
| [`apps/museum/src/lib/museum/MuseumAssets.svelte`](../../apps/museum/src/lib/museum/MuseumAssets.svelte) | Mounts `scene.objects` beneath their owning room transforms and renders `AssetModel`. | Placements remain room-local. Every model stays mounted; activation changes only `enabled`, preserving fallback/cache/disposal behavior. |
| [`apps/museum/src/lib/museum/paris-activation.ts`](../../apps/museum/src/lib/museum/paris-activation.ts) | Exports `getParisAssetActivation` and `isSceneObjectEnabled`. | Piano hero gate is separate from the rest of the salon. Route-crossing checks use the injected graph. |
| [`apps/museum/src/lib/museum/paris-activation.test.ts`](../../apps/museum/src/lib/museum/paris-activation.test.ts) | Locks Departure preload, Paris-route activation, outgoing-transition behavior, and per-placement enable rules. | Non-Paris future placements default to enabled. |
| [`apps/museum/src/lib/museum/rooms/ParisSalon.svelte`](../../apps/museum/src/lib/museum/rooms/ParisSalon.svelte) | Paris light rig only; accepts `preloadHero`. | Exact working-tree light transforms/settings remain. Models moved to `MuseumAssets`, not to another room-local loader. |
| [`apps/museum/src/lib/museum/ui/MuseumHUD.svelte`](../../apps/museum/src/lib/museum/ui/MuseumHUD.svelte) | Visitor HUD; accepts `scene` and matching `state`. | Route list comes from `scene.navigationNodes`; actions remain state-owned. It verifies scene/state pairing. |
| [`apps/museum/src/routes/museum/+page.svelte`](../../apps/museum/src/routes/museum/+page.svelte) | Visitor page wiring. | Passes the same default scene/state pair to canvas and HUD. |

### Tooling

| File | Purpose and main API | Important decisions |
|---|---|---|
| [`apps/museum/package.json`](../../apps/museum/package.json) | Adds `vitest` as the only new direct dev dependency and a `test` script. | No new 3D dependency was introduced. |
| [`package.json`](../../package.json) | Adds root `npm test` forwarding to the museum workspace. | Root `dev`, `check`, and `build` behavior is unchanged. |

## Current Architecture

### Data flow

1. `rooms.ts` provides static architecture and yaw transforms.
2. `museum-scene.json` provides editable placements, local camera poses, and interior edge waypoints.
3. `resolveSceneDocument()` produces `museumScene`: room-local objects, world-space navigation nodes, and world-space connections with cloned endpoints.
4. `createNavigationGraph()` adds the node index used by routing and state.
5. `/museum` passes one scene/state pair to `MuseumCanvas`/`MuseumScene` and `MuseumHUD`.

### Component relationships

- `MuseumScene` owns scene assembly, derives the graph, mounts `CameraDirector` unless a camera snippet is supplied, passes resolved connections to `StaffPath`, and passes nodes/state to `NavigationNode`.
- `MuseumAssets` groups placements by `roomId`, applies each static room transform once, and delegates loading/cloning/fallbacks to `AssetModel`.
- `ParisSalon` now owns only lights. `getParisAssetActivation()` feeds both its hero gate and the asset enable gates.

### State ownership

- `MuseumStateStore` owns visitor tour state and one immutable graph reference.
- Geometry and routes are not authored by the state store.
- A custom resolved scene must be paired with a state created from `createNavigationGraph(scene)`; mismatches throw deliberately.

### Runtime/editor separation

- Phase 0 contains no editor route or editor state.
- The runtime API is editor-ready: resolve a mutable document clone, create its graph, use a dedicated state only if visitor navigation is needed, provide a custom camera snippet, and suppress visitor markers.
- The future editor must never mount `CameraDirector`, `MuseumHUD`, or visitor navigation spheres, and must never mutate `museumSceneDocument` directly.

## Contracts and Invariants

- `/museum` visitor tour order, guided/free eligibility, reduced motion, staff path, Paris free-look, lighting, fallbacks, and asset loading timing must remain behavior-identical.
- `museum-scene.json` has `version: 1`. Objects require `roomId` and remain room-local at runtime.
- Document node `position` and `cameraTarget` are local to the node's `roomId`; resolved nodes are world-space.
- Document connection waypoints are interior-only objects. `roomId` present means room-local; absent means world-space. The resolver inserts fresh from/to endpoint arrays.
- Do not reintroduce navigation or placement arrays in `rooms.ts`, room components, or another layout module.
- All navigation consumers must receive the same graph, directly or through a graph-owning state store. Do not fall back to default lookups inside custom/editor flows.
- Keep all Paris `AssetModel` instances mounted and key them by placement ID. Toggle `enabled`; do not conditionally mount or hide them.
- Paris piano/lights activate in Departure, Paris, or when a route crosses Paris. Other salon models activate only in Paris or on a route crossing Paris.
- `MuseumScene` permits only one active camera: default `CameraDirector` or the supplied camera snippet.
- No automatic disk save exists. Browser import/download/copy/reset belongs to Phase 7; a filesystem save endpoint is explicitly deferred.
- No editor route or editor-only dependency is present yet. Phase 1 must add production isolation before exposing `/dev/museum-editor`.

## How to Verify

Run from the repository root:

1. `npm run check`
   - Expected: `svelte-check found 0 errors and 0 warnings`.
2. `npm test`
   - Expected: 4 test files and 32 tests pass.
3. `npm run build`
   - Expected: exit code 0 and client/server bundles complete. Existing Threlte unused-import, large-chunk, and adapter-auto notices are non-fatal.
4. `npm run dev -w @portfolio/museum -- --host 127.0.0.1 --port 5173`
   - Expected: Vite serves `http://127.0.0.1:5173/`.
5. `curl -fsSL --output /dev/null --write-out '%{http_code}\n' http://127.0.0.1:5173/museum`
   - Expected: `200`.
6. Manual `/museum` browser check:
   - Expected: initial Entrance HUD; Next completes the eight-stop loop; Back requires a visited previous room; free mode reaches any node through graph routes; reduced motion lands instantly; Departure enables piano/lights; entering/crossing Paris enables salon GLBs; leaving Paris keeps them active through the transition; stable Paris drag/arrows change look target without moving the eye.

## Known Problems

- The browser/WebGL manual check above was not completed in Phase 0 because no browser backend was available in the implementation session.
- `AGENTS.md`, `README.md`, and `docs/CAMERA_AND_LAYOUT.md` still describe `rooms.ts` as the navigation source. For scene/navigation work, this handoff and current code supersede those ownership sections until the planned Phase 8 documentation update.
- Scene JSON crosses the TypeScript boundary with an assertion; semantic validation of imported user JSON is deferred to Phase 7.
- `MuseumStateStore.graph` is fixed at construction. If an editor changes node IDs, create a newly resolved scene/graph instead of mutating a visitor store's indexed graph in place.
- `targetWaypoints` are resolved when present but remain unused by `camera-route.ts`.
- `AssetId` remains a union and `MuseumAsset.rooms` remains present; both are scheduled for the Phase 4 manifest migration.
- Existing museum limitations remain: no collision/navmesh, fixed-eye Paris-only free-look, and waypoint-authored clearance.

## Next Phase Entry Point

### Exact next goal

Phase 1: add a production-isolated `/dev/museum-editor` shell with a Svelte 5 rune store, three-column UI, Threlte editor viewport, and one OrbitControls-driven default camera. Production must return 404 and must not include the real editor entry chunk. Do not mount the visitor HUD, `CameraDirector`, or visitor navigation spheres.

### Read first, in order

1. [`docs/agent-handoffs/phase-0.md`](./phase-0.md)
2. [`apps/museum/src/lib/content/scene.ts`](../../apps/museum/src/lib/content/scene.ts)
3. [`apps/museum/src/lib/content/museum-scene.json`](../../apps/museum/src/lib/content/museum-scene.json)
4. [`apps/museum/src/lib/museum/MuseumScene.svelte`](../../apps/museum/src/lib/museum/MuseumScene.svelte)
5. [`apps/museum/src/lib/museum/MuseumAssets.svelte`](../../apps/museum/src/lib/museum/MuseumAssets.svelte)
6. [`apps/museum/src/routes/dev/assets/+page.svelte`](../../apps/museum/src/routes/dev/assets/+page.svelte)
7. [`apps/museum/vite.config.ts`](../../apps/museum/vite.config.ts)
8. [`apps/museum/src/lib/state/museum-state.svelte.ts`](../../apps/museum/src/lib/state/museum-state.svelte.ts)

### Usually do not reread

- Individual graybox room components, material internals, `AssetFallback`, model optimization licences, the large legacy golden fixture, and unrelated portfolio packages.
- Read `AssetModel.svelte` only if the editor viewport changes model lifecycle or registration.

### Suggested first implementation step

Implement and test production isolation first: add the `virtual:museum-editor-entry` dev/stub Vite module plus `/dev/museum-editor/+page.server.ts` production 404. Then scaffold the editor store from a mutable clone of `museumSceneDocument` and resolve it through `resolveSceneDocument()`.

### Likely risks

- Accidentally bundling editor code or Three controls into production despite hiding the route.
- Reusing global `museumState` with a mutable editor scene, which will violate the scene/state pairing contract.
- Mounting two default cameras or leaving `CameraDirector` active beside OrbitControls.
- Rendering visitor node spheres, which would interfere with later editor raycasting.
- Mutating the imported repository-default JSON object instead of a session clone.

## Important Decisions

- Kept architecture in `rooms.ts` and moved only placements/navigation to JSON, matching the locked four-layer design.
- Stored connection interiors only and regenerated fresh endpoints to eliminate the old shared node-position references.
- Retained a test-only full legacy runtime golden instead of retaining production legacy arrays.
- Used explicit graph injection with a default resolved graph; custom scene/state mismatches fail fast instead of silently mixing graphs.
- Moved asset instances into `MuseumAssets` while leaving Paris lights separate, which preserves exact room transforms and loading gates without introducing another GLTF loader.
- Preserved disabled-model fallbacks by keeping `AssetModel` mounted and changing only `enabled`; conditional rendering was rejected because it changes visible/loading behavior.
- Kept Phase 4 asset-manifest/type changes and Phase 7 validation/persistence out of Phase 0 to avoid mixing phase ownership.
