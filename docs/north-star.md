# North star

**Read when:** choosing product direction or reviewing pitches.  
**Last reviewed:** 2026-08-14  
**Live slice:** [`hand-off/CURRENT.md`](./hand-off/CURRENT.md)

## Vision

Greenfield, local-first spatial editor:

```text
New Project
  → empty Plan
  → rooms, openings, rough parametric objects
  → unified 3D
  → architecture refinement, imported assets, materials, camera tour
  → saved to the user's session/account
  → portable export
  → later import and continue
```

Plan = layout CAD. 3D = integrated project editor. No separate Scene, Camera,
or Layout-3D workspace after H1.

`/museum` = frozen Chopin visitor relic; `/museum/editor` = frozen pre-H1
Scene · Camera editor relic (no Layout tab). Both keep checked-in
`chopin-project.json` / `museum-scene.json`; H1 editor never loads/migrates
Chopin project, legacy workspace state, selection, or history.

## Project truth

```text
MuseumProject
  ├─ layout   ← rooms, boundaries, openings, rough layout objects
  └─ scene    ← entities, materials, lights, camera graph

Portable package
  ├─ project.json
  ├─ project-local GLBs
  └─ textures
```

`LayoutDocument` and `SceneDocument` stay separate SoTs. Unified 3D composes
both. Three objects, gizmo proxies, selection, generated geometry, decoded GLBs,
and history remain session-only.

Projects are saved for the user — session drafts locally and, in the complete
product, account persistence — both layered on the same portable package
format. H1 ships the export/import-only slice first; the document model does
not change when account save arrives.

## Sacred contracts

1. Semantic drafting, not Blender. App owns generated mesh; no arbitrary CSG/sculpt.
2. One editor shell: Plan | 3D. One 3D Canvas, active selection domain, hierarchy,
   inspector, contextual gizmo host.
3. One geometry compiler. Plan and 3D derive from `compileLayoutGeometry()`.
4. One camera graph/motion path: `camera-route.ts` + `camera-motion.ts`.
5. Greenfield H1: New Project starts empty. No Chopin/legacy editor migration.
6. Versioned full-project import/export. Import atomic; clears history/selection;
   future migrations root at H1 format.
7. `/museum` visitor and `/museum/editor` pre-H1 editor relic stay frozen. The
   editor ships in production builds; no build-flag gating.
8. Object placement = ghost → commit. Completed gesture = one history entry.

## Priority

| Pri | Track |
|-----|-------|
| Shipped | B5 serialized runtime cutover + G1–G4 graphics foundation |
| **P0** | H1 unified Plan-to-3D project editor — [`plans/2026-08-14-graphics-h1-unified-3d-editing.md`](./plans/2026-08-14-graphics-h1-unified-3d-editing.md) |
| P1 | H1 project-local GLB/package sub-slice + full round-trip |
| P2 | Measured optimization from G3 budgets; cache/rebuild/batch/cull only when proven |
| P3 | Material polish and product-useful effects |
| P4 | Multi-story after single-floor New Project → export/import gate |

## H1 product gate

H1 ships only when one new project completes:

```text
empty Plan → valid rooms → generated 3D → layout fine-tune
→ asset placement → camera authoring/playback → export → fresh import
```

Imported project must reproduce layout, scene, assets, and camera tour. No
visitor promotion or Chopin migration required.

## Technology gates

- SVG + Three/Threlte remain production renderers.
- Optimize only against G3 measurements.
- WebGPU/WGSL stays bounded experiment.
- Rust/WASM needs isolated CPU bottleneck + boundary-inclusive proof.
- Shader source never persists in project data.

## Non-goals

Blender mesh editor · auto tour from floor plan · multi-tenant CMS · second
camera/motion system · legacy/Chopin editor migration · independent layout-only
import · multi-story before H1 single-floor round-trip.
