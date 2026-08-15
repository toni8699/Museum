# Museum docs

**Audience:** agents + humans. **Last reviewed:** 2026-08-14

Bootstrap: [`../AGENTS.md`](../AGENTS.md). Live slice:
[`hand-off/CURRENT.md`](./hand-off/CURRENT.md). Editor code:
[`../apps/museum/src/lib/editor/README.md`](../apps/museum/src/lib/editor/README.md).

**Token rule:** read this routing hub, then only task-listed file(s). Skip archive
unless archaeology.

## Folder

```text
docs/
  README.md              ← routing hub
  north-star.md          ← product vision + priority
  architecture.md        ← ownership + editor/relic boundary
  components/            ← one contract per surface
  hand-off/CURRENT.md    ← live slice
  plans/                 ← active implementation
  archive/               ← non-authoritative history
```

## Runtime lanes

```mermaid
flowchart TB
  New["New Project"] --> EditorProject["H1 MuseumProject session"]
  Import["Import H1 package"] --> EditorProject
  EditorProject --> Layout["LayoutDocument"]
  EditorProject --> Scene["SceneDocument"]
  Layout --> Plan["PlanRenderModel → Plan"]
  Layout --> Compile["compileLayoutGeometry()"]
  Compile --> Editor3D["Unified editor 3D Canvas"]
  Scene --> Editor3D
  Scene --> Motion["camera-route + camera-motion"]
  Motion --> Editor3D
  EditorProject --> Export["Portable H1 package"]

  Chopin["checked-in chopin-project.json"] --> Museum["/museum relic visitor"]
```

No lane crossing: H1 editor never imports/migrates Chopin, legacy workspace
state, selection, or history. `/museum` keeps checked-in visitor runtime. H1
import/export handles H1-created projects plus future explicit migrations.

## Product surface

Route → role (moved from root README when it became human-only):

| Route | Role |
|---|---|
| `/` or `/editor` | Main H1 editor (Plan · 3D), always ships in production |
| `/museum` | Frozen Chopin visitor relic using checked-in `chopin-project.json` |
| `/museum/editor` | Frozen pre-H1 editor relic (Scene · Camera, no Layout) |
| `/dev/materials` · `/dev/assets` | Development previews |
| `/dev/perf` | G3 performance harness |

Editor shipping policy: the editor boots into a fresh empty project; no
Chopin/legacy editor state is loaded, migrated, or preserved. Persistence is
portable export/import only (session/account save is future work).

## Read only what task needs

| Working on… | Read |
|-------------|------|
| Vision / priority / product-fit | [`north-star.md`](./north-star.md) |
| Ownership / editor versus relic | [`architecture.md`](./architecture.md) |
| H1 Plan → 3D editor | [`plans/2026-08-14-graphics-h1-unified-3d-editing.md`](./plans/2026-08-14-graphics-h1-unified-3d-editing.md) |
| Graphics foundation / G5 | [`plans/2026-08-13-graphics-architecture-roadmap.md`](./plans/2026-08-13-graphics-architecture-roadmap.md) |
| Shared geometry compiler | [`plans/2026-08-13-graphics-g1-shared-geometry-compiler.md`](./plans/2026-08-13-graphics-g1-shared-geometry-compiler.md) |
| Geometry-kernel library review | [`plans/2026-08-15-geometry-kernel-library-review.md`](./plans/2026-08-15-geometry-kernel-library-review.md) |
| Editor shell / views | [`components/shell.md`](./components/shell.md) |
| Entities / materials / library | [`components/scene-content.md`](./components/scene-content.md) |
| Gizmo / placement / transforms | [`components/placement.md`](./components/placement.md) |
| Camera/tour | [`components/camera-tour.md`](./components/camera-tour.md) |
| Schema / import/export / history | [`components/persistence.md`](./components/persistence.md) |
| GLBs / asset registry | [`components/assets.md`](./components/assets.md) |
| Current work | [`hand-off/CURRENT.md`](./hand-off/CURRENT.md) |
| Tests | [`../apps/museum/tests/README.md`](../apps/museum/tests/README.md) |
| Old layout CAD tasks | [`plans/2026-08-10-layout-cad-foundation.md`](./plans/2026-08-10-layout-cad-foundation.md) task section only |

## Update rules

- Contract change → matching `components/*.md` or `architecture.md`.
- Product priority change → `north-star.md`.
- Routing change → this file.
- Slice scratch/handoff → `CURRENT.md`.
- Archive conflict → live docs win.
