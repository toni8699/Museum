# North star — final product vision

**Read when:** choosing product direction or reviewing pitches. **Priorities
and what's next live in the tracker:** [`plans/README.md`](./plans/README.md).

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
or Layout-3D workspace.

`/museum` = frozen Chopin visitor relic; `/museum/editor` = frozen legacy
Scene · Camera editor relic (no Layout tab). Both keep checked-in
`chopin-project.json` / `museum-scene.json`; the editor never loads or
migrates Chopin project, legacy workspace state, selection, or history.

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

`LayoutDocument` and `SceneDocument` stay separate sources of truth. Unified
3D composes both. Three objects, gizmo proxies, selection, generated geometry,
decoded GLBs, and history remain session-only.

Projects are saved for the user — session drafts locally and, in the complete
product, account persistence — both layered on the same portable package
format. The document model does not change when account save arrives.

## Sacred contracts

1. Semantic drafting, not Blender. App owns generated mesh; no arbitrary CSG/sculpt.
2. One editor shell: Plan | 3D. One 3D Canvas, active selection domain, hierarchy,
   inspector, contextual gizmo host.
3. One geometry compiler. Plan and 3D derive from `compileLayoutGeometry()`.
4. One camera graph/motion path: `camera-route.ts` + `camera-motion.ts`.
5. Greenfield: New Project starts empty. No Chopin/legacy editor migration.
6. Versioned full-project import/export. Import atomic; clears history/selection;
   future migrations root at the editor format.
7. `/museum` visitor and `/museum/editor` legacy editor relic stay frozen. The
   editor ships in production builds; no build-flag gating.
8. Object placement = ghost → commit. Completed gesture = one history entry.

## Technology gates

- SVG + Three/Threlte remain production renderers.
- Optimize only against G3 measurements.
- WebGPU/WGSL stays a bounded experiment.
- Rust/WASM needs an isolated CPU bottleneck + boundary-inclusive proof.
- Shader source never persists in project data.

## Non-goals

Blender mesh editor · auto tour from floor plan · multi-tenant CMS · second
camera/motion system · legacy/Chopin editor migration · independent layout-only
import · multi-story before single-floor round-trip.
