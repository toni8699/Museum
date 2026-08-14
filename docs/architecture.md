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
| Codec boundary | shared layout, scene, project codecs | same |
| Resolve + generated endpoints | `scene.ts` with explicit project room resolver | same |
| Shell cutouts | `LayoutMuseumShell` from `CompiledLayoutGeometry` | shared compiled geometry (G1 implemented) |
| Legacy room compatibility | deprecated editor/test projection in `rooms.ts`; no visitor import | delete when consumers migrate |
| Derived layout geometry | one pure `compileLayoutGeometry()` (G1 implemented) | same |
| Plan presentation | `CompiledLayoutGeometry` → pure `PlanRenderModel` → `PlanSvg.svelte` SVG adapter (G2 implemented) | same |
| 3D architecture meshes | `wall-mesh-builder` → `wall-geometry-adapter` → one watertight indexed `BufferGeometry` per room (G4 implemented) | same |
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
  compiled --> three["wall-geometry-adapter → Threlte/Three"]
  three --- entities
  shell --- entities
```

## Geometry and render boundary

G1 replaces both legacy projections (`buildLayoutArchitectureModel()` + editor's
independent `buildLayoutPreviewModel()` sampling) with one pure
`compileLayoutGeometry()`: adaptive curves, arc lengths, tangents/normals,
openings/profiles, polygons, bounds, query records. Plan, editor 3D, visitor 3D all
consume `CompiledLayoutGeometry`; no longer resample curves or reinterpret opening
topology. Canonical Chopin layout line-based.

`LayoutDocument` remains authored semantic CAD data. Compiled geometry = derived,
cacheable, renderer-neutral, never serialized. May contain plain values or
backend-neutral typed arrays, never SVG nodes/path strings, `THREE.*` objects,
WebGL/WebGPU handles, materials, cameras, or UI state.

Plan branch owns ordered world-space render primitives. World/screen transforms, SVG
attributes, styling, transient interaction = separate. Plan camera/tour overlays may
project `project.scene` through existing `camera-route.ts` / `camera-motion.ts`; that
does not transfer camera ownership to layout or create another motion path.

Three adapter owns indexed vertex/index buffers, normals, UVs, mesh groups, resource
disposal. Three/Threlte continues to own scene graph, GLBs, materials/PBR, lights,
shadows, cameras, visitor lifecycle. Mesh merging bounded by measured room/material
batching + edit granularity; never compile whole museum into one mesh.

## Mode A vs B

| Mode | Meaning | Status |
|------|---------|--------|
| **A — Dressing** | Props inside fixed architecture | Supported; presets deferred |
| **B — Layout authorship** | Draw/relocate rooms in layout data | **North star**; P0 |

- Layout meshes = previews in editor + sole production shell source in `/museum`; both use visitor-safe shared layout modules. No editor layout UI/store imports in visitor chunks.
- A3 layout paths accept line + Bezier segments; openings use meter offsets along sampled arc length; rounded/pointed profiles affect wall elevation only.
- Corridors = skinny **layout rooms** (or later open wall-strip).  
- Cutouts = segment-split; no real-time CSG.  
- **Do not** treat scene Wall presets as shell authorship.

## Corridor and opening decision

P0 models corridors as ordinary skinny `LayoutRoom` footprints, not special corridor entity. Corridor may have two rectangular geometric cutouts in A1; reuses room generation, avoids second wall-strip system.

**Pros:** simplest MVP; same floor/wall/ceiling generation; future room containment + camera IDs; no corridor-specific renderer.  
**Cons:** duplicated/shared wall geometry remains future authoring concern; B4 now carries explicit portal semantics, renders layout shell parity without changing navigation.

A1 openings geometry-only. Layout v3 retains B4's explicit `connectsRoomIds: [string, string]` for interior doors/portals; windows unpaired. `projectLayoutPortalRelations()` de-duplicates pairs for inspection only. Geometry never creates, repairs, or guesses adjacency. Visitor reads these relations only from `project.layout`.

## Hard don’ts

Dual nav graphs · persist `node:<id>:position` endpoints · put render-backend state in `LayoutDocument` or compiled geometry · build a second geometry compiler in a render adapter · replace Three without a measured production limitation · wire `@portfolio/scroll-travel` casually · ship editor to prod visitors (`/editor` → 404; sole exception: explicit build-time `VITE_MUSEUM_EDITOR=1` demo deploy).
