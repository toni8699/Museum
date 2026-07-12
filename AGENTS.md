# Agent context — Personal / Museum

Read this before changing the museum or monorepo. Detailed camera/layout authoring lives in [`docs/CAMERA_AND_LAYOUT.md`](./docs/CAMERA_AND_LAYOUT.md). Human overview: [`README.md`](./README.md).

## What this repo is

npm workspaces monorepo (`apps/*`, `packages/*`). **Only live app:** `@portfolio/museum` — Phase 1 Threlte/Three **graybox** of a Chopin museum.

“Camera” means **3D guided PerspectiveCamera navigation**, not webcam/video.

**Missing but still referenced:** `apps/chopin`, `apps/brownie`. Root `dev` / `build` scripts and lockfile links to those apps are stale. Prefer `npm run dev:museum` / `build:museum`.

## Architecture (museum)

```mermaid
flowchart TB
  Landing["/+page.svelte"] -->|link| Page["/museum/+page.svelte"]
  Page --> Canvas["MuseumCanvas"]
  Page --> HUD["MuseumHUD"]
  Canvas --> Scene["MuseumScene"]
  Scene --> Cam["CameraDirector"]
  Scene --> Shell["MuseumShell"]
  Scene --> Path["StaffPath"]
  Scene --> Center["CentralChamber"]
  Scene --> Rooms["Room props x7"]
  Scene --> Nodes["NavigationNode x8"]
  Cam --> State["museumState"]
  Nodes --> State
  HUD --> State
  Cam --> Route["camera-route.ts BFS"]
  Route --> Content["rooms.ts"]
  State --> Content
  Shell --> Content
```

**Single source of truth for space + tour:** `apps/museum/src/lib/content/rooms.ts`

| Concern | Owns |
|---------|------|
| Room poses, dims, openings, colors | `museumRooms` |
| Stops: eye position + look target | `navigationNodes` |
| Edge polylines + clearance | `navigationConnections` |
| Local → world (yaw) | `roomPoint()` |
| Shell cutouts / portals | `MuseumShell.svelte` (derives from rooms) |
| Path motion | `camera-route.ts` → `CameraDirector.svelte` |
| Tour rules / FSM | `museum-state.svelte.ts` |
| Types | `lib/types/museum.ts` |

Do **not** reintroduce parallel shell builders, hand-traced paths disconnected from `navigationConnections`, or a second nav graph.

## Key paths

```
apps/museum/src/
  routes/+page.svelte              landing
  routes/museum/+page.svelte       immersive page
  lib/content/rooms.ts             DATA: rooms, nodes, connections
  lib/types/museum.ts              types
  lib/state/museum-state.svelte.ts tour FSM
  lib/museum/MuseumCanvas.svelte   Threlte canvas
  lib/museum/MuseumScene.svelte    scene assembly
  lib/museum/navigation/
    CameraDirector.svelte          camera + easing + keys
    camera-route.ts                BFS + waypoints → route
    NavigationNode.svelte          clickable spheres
  lib/museum/layout/
    MuseumShell.svelte             procedural walls/floors
    CentralChamber.svelte          circular floor + piano
    StaffPath.svelte               floor ribbons from connections
    RoomPortal.svelte              door frames
  lib/museum/rooms/*.svelte        graybox props per room
  lib/museum/ui/MuseumHUD.svelte   DOM overlay
```

## Runtime contracts

- **Guided mode:** only `nextNodeId`, or `previousNodeId` if that room was visited.
- **Free mode:** any other node; routes still follow graph edges (multi-hop BFS).
- **During transition:** no new navigation (`isTransitioning`).
- **Reduced motion:** skip path animation (instant).
- **Music chamber genre portals** in `MusicChamber.svelte` are decorative — not navigation.
- **`@portfolio/scroll-travel`** is a museum dependency but **unused**; do not wire it in unless intentionally switching to scroll/section travel.
- **`audioEnabled`** on state is unused; shared audio/cursor/HUD packages are for missing portfolio apps.

## Conventions for agents

1. Prefer editing `rooms.ts` for layout/path/tour changes; keep shell and camera as consumers.
2. Eye height for path waypoints is typically **1.65**; look targets often ~1.0–1.5.
3. Keep `clearance` honest (~0.35); it drives corner fillet radius in `CameraDirector`.
4. Match door openings in room data to path waypoints that pass through those openings — no collision system will save bad waypoints.
5. Svelte 5 runes only (`$state` / `$derived` / `$effect` / `$props`). Follow existing Threlte patterns.
6. Stay graybox unless asked for art: primitives, no new GLTF/texture pipeline by default.
7. Do not “fix” root `dev` by recreating chopin/brownie unless the user asks.
8. No commits unless the user requests them.

## Known limitations (do not assume fixed)

No collision/navmesh · no free-look at rest · no shadows · no GLTF/exhibits · no spatial audio · `targetWaypoints` typed but unused (look synthesized) · `lockInteraction` unused in data · mobile hides route list · camera can clip walls if waypoints are wrong.

Full authoring checklist and limits: [`docs/CAMERA_AND_LAYOUT.md`](./docs/CAMERA_AND_LAYOUT.md).
