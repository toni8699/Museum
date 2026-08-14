# Architecture

**Read when:** `rooms.ts`, layout CAD, promotion/cutover, ownership disputes.  
**Skip if:** only editing a scene prop, material, or tour key inside existing rooms.  
**Last reviewed:** 2026-08-13
**Hub:** [`README.md`](./README.md) · **Vision:** [`north-star.md`](./north-star.md) · **Graphics roadmap:** [`plans/2026-08-13-graphics-architecture-roadmap.md`](./plans/2026-08-13-graphics-architecture-roadmap.md)

---

## Ownership

| Concern | Today | Target |
|---------|-------|--------|
| Room frames, footprints, openings | `project.layout` / `LayoutDocument` v3 | same |
| Editor layout drafts | `LayoutDocument` / `museum-layout.json` | same schema; independent session baseline |
| Entities, nodes, paths, materials | `project.scene` / `SceneDocument` v6 | same |
| Codec boundary | shared layout, scene, and project codecs | same |
| Resolve + generated endpoints | `scene.ts` with an explicit project room resolver | same |
| Shell cutouts | `LayoutMuseumShell` from `CompiledLayoutGeometry` | shared compiled geometry (G1 implemented) |
| Legacy room compatibility | deprecated editor/test projection in `rooms.ts`; no visitor import | delete when consumers migrate |
| Derived layout geometry | one pure `compileLayoutGeometry()` (G1 implemented) | same |
| Plan presentation | `CompiledLayoutGeometry` → pure `PlanRenderModel` → `PlanSvg.svelte` SVG adapter (G2 implemented) | same |
| 3D architecture meshes | sampled wall-chord `BoxGeometry` in editor/runtime layout shells | `CompiledLayoutGeometry` → `ThreeGeometryAdapter` → indexed `BufferGeometry` |
| Routes / curves | `camera-route` + `camera-motion` only | unchanged |
| Tour FSM | `museum-state.svelte.ts` | unchanged |
| Editor session | `museum-editor.svelte.ts` | layout-tagged history ops (B3 implemented) |

**Camera** = 3D guided PerspectiveCamera, not webcam.

```mermaid
flowchart LR
  project["chopin-project.json"] --> layout["LayoutDocument v3"]
  project --> scene["SceneDocument v6"]
  layout --> registry["room registry"]
  layout --> compile["compileLayoutGeometry()"]
  compile --> compiled["CompiledLayoutGeometry"]
  compiled --> shell["LayoutMuseumShell"]
  scene --> resolve["resolveSceneDocument()"]
  registry --> resolve
  resolve --> entities["MuseumEntities"]
  resolve --> motion["camera-route + camera-motion"]
  compiled --> plan["PlanRenderModel → SVG"]
  compiled --> three["ThreeGeometryAdapter → Threlte/Three"]
  three --- entities
  shell --- entities
```

## Geometry and render boundary

G1 replaces both legacy projections (`buildLayoutArchitectureModel()` and the
editor's independent `buildLayoutPreviewModel()` sampling) with one pure
`compileLayoutGeometry()`: adaptive curves, arc lengths, tangents/normals,
openings/profiles, polygons, bounds, and query records. Plan, editor 3D, and
visitor 3D all consume `CompiledLayoutGeometry` and no longer resample curves or
reinterpret opening topology. The canonical Chopin layout is line-based.

`LayoutDocument` remains authored semantic CAD data. Compiled geometry is derived,
cacheable, renderer-neutral, and never serialized. It may contain plain values or
backend-neutral typed arrays, but never SVG nodes/path strings, `THREE.*` objects,
WebGL/WebGPU handles, materials, cameras, or UI state.

The Plan branch owns ordered world-space render primitives. World/screen
transforms, SVG attributes, styling, and transient interaction are separate. Plan
camera/tour overlays may project `project.scene` through the existing
`camera-route.ts` / `camera-motion.ts`; that does not transfer camera ownership to
layout or create another motion path.

The Three adapter owns indexed vertex/index buffers, normals, UVs, mesh groups,
and resource disposal. Three/Threlte continues to own the scene graph, GLBs,
materials/PBR, lights, shadows, cameras, and visitor lifecycle. Mesh merging is
bounded by measured room/material batching and edit granularity; never compile the
whole museum into one mesh.

## Mode A vs B

| Mode | Meaning | Status |
|------|---------|--------|
| **A — Dressing** | Props inside fixed architecture | Supported; presets deferred |
| **B — Layout authorship** | Draw/relocate rooms in layout data | **North star**; P0 |

- Layout meshes are previews in editor and the sole production shell source in `/museum`; both use visitor-safe shared layout modules. No editor layout UI/store imports in visitor chunks.
- A3 layout paths accept line + Bezier segments; openings use meter offsets along sampled arc length, while rounded/pointed profiles affect wall elevation only.
- Corridors = skinny **layout rooms** (or later open wall-strip).  
- Cutouts = segment-split; no real-time CSG.  
- **Do not** treat scene Wall presets as shell authorship.

## Corridor and opening decision

P0 models corridors as ordinary skinny `LayoutRoom` footprints, not a special corridor entity. A corridor may have two rectangular geometric cutouts in A1; this reuses room generation and avoids a second wall-strip system.

**Pros:** simplest MVP; same floor/wall/ceiling generation; future room containment and camera IDs; no corridor-specific renderer.  
**Cons:** duplicated/shared wall geometry remains a future authoring concern; B4 now carries explicit portal semantics and renders layout shell parity without changing navigation.

A1 openings were geometry-only. Layout v3 retains B4's explicit `connectsRoomIds: [string, string]` for interior doors/portals; windows remain unpaired. `projectLayoutPortalRelations()` de-duplicates pairs for inspection only. Geometry never creates, repairs, or guesses adjacency. The visitor reads these relations only from `project.layout`.

## Hard don’ts

Dual nav graphs · persist `node:<id>:position` endpoints · put render-backend state in `LayoutDocument` or compiled geometry · build a second geometry compiler in a render adapter · replace Three without a measured production limitation · wire `@portfolio/scroll-travel` casually · ship editor to prod visitors (`/editor` → 404; sole exception: an explicit build-time `VITE_MUSEUM_EDITOR=1` demo deploy).
