# Architecture — ownership and boundaries

**Read when:** ownership questions, editor vs relic boundary, import/export.
For a specific surface, go straight to the matching contract doc (table below).

## Two isolated lanes

```text
Editor (greenfield)          /museum (frozen Chopin relic)
  New Project → Plan → 3D        checked-in chopin-project.json + runtime
  → portable export/import       /museum/editor = frozen legacy editor relic
```

- No Chopin project/editor state/history migration into the editor.
- No editor export promotion into `/museum`.
- The editor ships in production builds (no build-flag gating).
- Shared visitor-safe geometry/render modules may serve both lanes; session,
  selection, hierarchy, gizmo, import, and asset-store code stay editor-only.

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
| Shell / workspaces / timeline | [`components/shell.md`](./components/shell.md) | `apps/museum/src/lib/editor/app/` |
| Entities / materials / lights | [`components/scene-content.md`](./components/scene-content.md) | `apps/museum/src/lib/content/` |
| Gizmo / placement / transforms | [`components/placement.md`](./components/placement.md) | `apps/museum/src/lib/editor/gizmo/` |
| Camera / tour / motion | [`components/camera-tour.md`](./components/camera-tour.md) | `packages/camera-core/src/` · visitor components in `apps/museum/src/lib/museum/navigation/` |
| Persistence / schema / history | [`components/persistence.md`](./components/persistence.md) | `packages/project-model/src/` · `packages/layout-core/src/` · app facades |
| Scene codec internals | [`components/scene-codec.md`](./components/scene-codec.md) | `packages/project-model/src/scene-codec/` · app facade |
| Assets / catalogue | [`components/assets.md`](./components/assets.md) | `apps/museum/src/lib/content/assets.ts` |

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
layout-only import · hide the editor behind a build flag.
