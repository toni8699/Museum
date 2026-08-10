# Museum docs

**Audience:** agents + humans. **Last reviewed:** 2026-08-10

Bootstrap: [`../AGENTS.md`](../AGENTS.md). Live slice: [`hand-off/CURRENT.md`](./hand-off/CURRENT.md). Editor code: [`../apps/museum/src/lib/editor/README.md`](../apps/museum/src/lib/editor/README.md).

**Token rule:** Do **not** read this whole folder. Read **AGENTS.md** + **only the one component file** for your task (+ `hand-off/CURRENT.md` if starting a slice). Skip archive unless archaeology.

---

## Folder

```text
docs/
  README.md              ← thin hub (this file)
  north-star.md          ← vision / priority only
  architecture.md        ← ownership + Mode A/B boundary
  components/            ← one file per surface
  hand-off/CURRENT.md    ← live slice
  plans/                 ← active implementation
  archive/               ← not day-to-day authority
```

---

## How parts fit (read once if orientation needed)

```mermaid
flowchart TB
  Editor["/dev/museum-editor"] --> SceneDoc["museum-scene.json v6"]
  Editor --> LayoutDoc["LayoutDocument"]
  SceneDoc --> Resolve["scene.ts"]
  Rooms["rooms.ts"] --> Shell["MuseumShell"]
  LayoutDoc -.->|"B4/B5"| Rooms
  Resolve --> Motion["camera-route + camera-motion"]
  Shell --> Visitor["/museum"]
  Motion --> Visitor
```

Runtime shell = `rooms.ts` until cutover. Scene/tour = v6 JSON. Layout CAD = P0 editor draft → later runtime. One motion system. Editor prod 404.

---

## Read only what you touch

| Working on… | Read |
|-------------|------|
| Vision / what not to build | [`north-star.md`](./north-star.md) |
| `rooms.ts` vs layout / promotion | [`architecture.md`](./architecture.md) |
| Editor chrome / workspaces | [`components/shell.md`](./components/shell.md) |
| Entities / materials / library | [`components/scene-content.md`](./components/scene-content.md) |
| Ghost / gizmos / scale / surfaces | [`components/placement.md`](./components/placement.md) |
| Tour graph / timeline / preview | [`components/camera-tour.md`](./components/camera-tour.md) |
| Schema / I/O / history | [`components/persistence.md`](./components/persistence.md) |
| Paris GLB / assets | [`components/assets.md`](./components/assets.md) |
| **What to build now** | [`hand-off/CURRENT.md`](./hand-off/CURRENT.md) |
| Layout CAD tasks | [`plans/2026-08-10-layout-cad-foundation.md`](./plans/2026-08-10-layout-cad-foundation.md) — task section only; A0 has focused [`plans/2026-08-10-layout-cad-a0-codec.md`](./plans/2026-08-10-layout-cad-a0-codec.md) |
| Deep camera dump | [`archive/CAMERA_AND_LAYOUT.md`](./archive/CAMERA_AND_LAYOUT.md) |
| Asset checklist dump | [`archive/ASSET_WORKFLOW.md`](./archive/ASSET_WORKFLOW.md) |

**Typical budgets**

| Task type | Files |
|-----------|-------|
| Narrow bug in one surface | `AGENTS.md` + 1 `components/*.md` |
| New slice from handoff | `AGENTS.md` + `CURRENT.md` + plan § for that task (+ `architecture.md` if layout/shell) |
| Product / priority debate | `north-star.md` only |

Update the **matching component file** when that contract changes. Update this hub only if routing/diagram changes. Slice scratch → `CURRENT.md` only.

If archive conflicts with these files, **live docs win**.
