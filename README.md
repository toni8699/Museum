# Spatial Sketch Editor

Layout-first editor for indoor 3D experiences.

```text
New Project
  → empty Plan
  → rooms, openings, rough objects
  → unified 3D
  → architecture refinement, assets, materials, camera tour
  → saved to the user's session/account
  → portable export
  → later import and continue
```

Editor targets galleries, offices, stores, venues, museums, and similar spaces.
Semantic layout drives generated architecture; app owns mesh generation.

## Product boundary

| Route | Role |
|---|---|
| `/` or `/editor` | Editor (H1 target = Plan · 3D) |
| `/museum` | Frozen Chopin visitor relic using checked-in `chopin-project.json` |
| `/museum/editor` | Frozen pre-H1 editor relic (Scene · Camera, no Layout) |
| `/dev/materials` · `/dev/assets` | Development previews |
| `/dev/perf` | G3 performance harness |

`/museum` proves shipped visitor/runtime work; `/museum/editor` freezes the
pre-H1 Scene · Camera editor. H1 editor does not load, migrate, or preserve
Chopin editor/session/history state. The editor boots into a fresh empty
project; H1 ships export/import-only persistence, and the complete product
adds session/account save on the same portable package format.

## H1 editor target

Two top-level views:

- **Plan** — draw rooms, bend walls, add openings, place rough
  Box/Cylinder/Sphere objects, relocate rooms, edit dimensions.
- **3D** — generated architecture + scene entities + catalogue/project assets +
  materials + camera/tour tools in one Canvas, hierarchy, inspector, active
  selection domain, and contextual TransformControls gizmo.

Layout and scene remain separate data domains:

```text
MuseumProject
  ├─ layout   ← rooms, openings, rough layout objects
  └─ scene    ← placed assets, primitives, lights, materials, camera graph

Portable package
  ├─ project.json
  ├─ project-local GLBs
  └─ textures
```

Import/export starts at H1 format. Import replaces whole project atomically,
clears session history/selection, and cross-validates room references. Future
explicit migrations may extend H1 format. No Chopin/legacy editor migration.

Focused plan: [`docs/plans/2026-08-14-graphics-h1-unified-3d-editing.md`](./docs/plans/2026-08-14-graphics-h1-unified-3d-editing.md).

## Current implementation

B5 project runtime cutover and G1–G4 graphics foundation shipped: serialized
layout/scene project, shared geometry compiler, explicit Plan render model,
performance harness, procedural indexed wall meshes. Until H1 lands, the editor
shows legacy Scene · Camera · Layout workspaces; that pre-H1 editor is frozen
as a relic at `/museum/editor`.

## Run locally

Requires Node.js 20+ and WebGL-capable browser.

```bash
npm install
npm run dev
```

- `/` or `/editor` → editor
- `/museum` → Chopin visitor relic
- `/museum/editor` → pre-H1 Scene · Camera editor relic

```bash
npm run build   # production build
npm run check   # Svelte + TypeScript checks
npm test        # test suite
```

## Editor shipping

The editor always ships: `/` and `/editor` render it in production too, and
`/dev/*` stays development-only. Editing is local-first and client-side — no
server writes and no account/save backend; projects persist only through
portable export/import.

## `/museum` controls

- **Next / Back:** HUD, arrows, `Space`, `Backspace`
- **Navigation nodes:** click glowing nodes
- **M:** guided/free tour
- **R:** reduced motion
- **Paris Salon:** drag or arrow keys to look

## Technology

SvelteKit · Svelte 5 · Threlte · Three.js · TypeScript · npm workspaces.

## Non-goals

Blender-style mesh editing · automatic tour generation · second camera/motion
system · multi-story before single-floor flow ships · importing Chopin/legacy
editor state into H1.
