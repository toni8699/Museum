# Architecture — ownership and boundaries

**Read when:** ownership questions, editor vs relic boundary, import/export.
For a specific surface, go straight to the matching contract doc (table below).

## Two isolated lanes

```text
apps/editor (greenfield)     apps/museum (frozen Chopin visitor)
  New Project → Plan → 3D        checked-in chopin-project.json + runtime
  → portable export/import       /museum/editor = frozen legacy editor relic
```

- No Chopin project/editor state/history migration into the editor.
- No editor export promotion into `/museum`.
- The editor ships in production builds (no build-flag gating).
- Shared visitor-safe geometry/render modules may serve both lanes; session,
  selection, hierarchy, gizmo, import, and asset-store code stay editor-only.

## Platform boundary

| Concern | Ratified owner |
|---------|-----------------|
| API runtime + compute | Fastify + TypeScript on Render |
| Platform/database state | Neon Postgres |
| Heavy asset bytes | Cloudflare R2 |
| Identity authentication | Managed auth provider |
| Product/project authorization | Fastify + Postgres |

P18 provisions only the Render API and Neon database through secret
`DATABASE_URL`. R2 and managed-auth integration remain later slices; P19 is
authenticated project Save/Load only. Experience mode/schema, R2, and project
persistence endpoints are not P18/P19 scope. The auth provider proves
identity; it never owns project permissions.

## Project-level surfaces (future)

The current `Scene | Camera` × `Plan | 3D` workspaces are the canonical
**Spatial** authoring surface and remain unchanged. Long-term, the project
shell adds three project-level surfaces without renaming or flattening the
Spatial model:

- **Experience** — visitor-facing navigation and presentation. It *references*
  Spatial truth (existing cameras, rooms, authored destinations) and never
  creates duplicate camera positions/graphs/sequences/paths, room definitions,
  scene objects, or layout geometry. Experience navigation intent resolves
  through the canonical camera route/motion system; Experience UI never
  performs independent XYZ/FOV interpolation. Interactions are an Experience
  authoring lens (not a third mode) using an `Event → Target → Action`
  semantic model that references Spatial entities + the shared asset registry.
  **Spatial → Camera owns authored camera/path/timing/framing truth**;
  Experience interactions may reference spatial entities and canonical
  temporal evaluation, and may reuse the same 3D preview/render surface, but
  never own or edit duplicate path/camera truth. `ExperienceDocument` is a
  future ownership boundary only — no schema, codecs, migrations, or backend
  scope now.
- **Assets** — one shared project asset registry serving Spatial and
  Experience; no independent per-mode asset stores.
- **Publish** — visitor-safe runtime + Experience UI + project data/assets;
  developer/export consumption levels are future direction (no runtime SDK
  defined now).

## Ownership

| Concern | Source of truth |
|---------|-----------------|
| Rooms, frames, boundaries, openings | `project.layout` / `LayoutDocument` (`@portfolio/layout-core`) |
| Rough parametric layout objects | `project.layout.objects` |
| Scene models, primitives, lights, materials | `project.scene` / `SceneDocument` (`@portfolio/project-model`) |
| Camera nodes, connections, paths, view tracks | `project.scene` |
| Derived geometry | pure `compileLayoutGeometry()` (`@portfolio/layout-core`) |
| Project/scene validation, codecs, room semantics, runtime graph | `@portfolio/project-model` |
| Plan presentation | `CompiledLayoutGeometry` → `PlanRenderModel` → `PlanSvg.svelte` |
| 3D wall meshes | `wall-mesh-builder` → `wall-geometry-adapter` |
| Camera route/motion | `@portfolio/camera-core` (`camera-route.ts` + `camera-motion.ts`) only |
| Project-local GLB bytes | portable package manifest + editor asset store |
| Selection, history, gizmo proxies, UI | editor session only |

Generated geometry, Three objects, renderer handles, selection, and history
are never serialized.

## Where to look (per surface)

| Working on… | Read | Key source |
|---|---|---|
| Shell / workspaces / timeline | [`components/shell.md`](./components/shell.md) | `apps/editor/src/lib/editor/app/` |
| Entities / materials / lights | [`components/scene-content.md`](./components/scene-content.md) | app-local `src/lib/content/` facades |
| Gizmo / placement / transforms | [`components/placement.md`](./components/placement.md) | `apps/editor/src/lib/editor/gizmo/` |
| Camera / tour / motion | [`components/camera-tour.md`](./components/camera-tour.md) | `packages/camera-core/src/` · visitor components in `apps/museum/src/lib/museum/navigation/` |
| Persistence / schema / history | [`components/persistence.md`](./components/persistence.md) | `packages/project-model/src/` · `packages/layout-core/src/` · app facades |
| Scene codec internals | [`components/scene-codec.md`](./components/scene-codec.md) | `packages/project-model/src/scene-codec/` · app facade |
| Assets / catalogue | [`components/assets.md`](./components/assets.md) | app-local `src/lib/content/assets.ts` |

## Geometry boundary

`LayoutDocument` = authored semantic CAD. `CompiledLayoutGeometry` = derived,
cacheable, renderer-neutral, never serialized; both are owned by
`@portfolio/layout-core`. No SVG strings, `THREE.*`, DOM,
WebGL/WebGPU handles, materials, cameras, or UI state below the layout
boundary. Plan and unified 3D consume the same compile; no consumer resamples
curves or reinterprets opening topology. The Three adapter owns buffers,
materials, resource lifetime, and raycast identity adaptation.

## Hard don'ts

Dual nav graphs · second motion/gizmo/geometry compiler · persist generated
endpoints · persist Three/render state · infer room ownership/adjacency from
coordinates · import Chopin/legacy editor state into the editor · independent
layout-only import · hide the editor behind a build flag · Experience UI
performing independent camera interpolation · Experience Interaction editing
camera/path truth outside Spatial · duplicating canonical timing/path values
into Experience truth · independent Experience camera evaluation · a separate
Interaction asset store · `ExperienceScene` / `ExperienceCameraGraph` /
`ExperienceCameraPath` / `ExperienceRenderer` as a second spatial authority ·
separate Spatial and Experience asset stores.
