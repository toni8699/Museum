# Persistence and schema

**Read when:** changing scene JSON shape, codec, undo/history, import/export, dirty tracking, scale fidelity, layout/project docs.  
**Last reviewed:** 2026-08-10  
**North star:** [`north-star.md`](./north-star.md)

---

## Document shape (v6) — scene

Canonical scene document fields:

- `version` (6)  
- `textures`  
- `materials`  
- `entities` (model | primitive | light)  
- `clusters?`  
- `navigationNodes`  
- `connections`  

Codec accepts **v1–v6** and migrates to canonical v6. Scene stays v6 while layout CAD lands; project envelope wraps scene + layout (plan Track C).

**Primitive kinds in codec today:** `box` | `plane` | `cylinder` | `sphere` only — not `primitive_wall` / arch types.

## Layout document (P0) — editor / project.layout

Separate versioned doc (`formatVersion: 1`, meters): floors → rooms → draft paths (line/Bezier) → openings → layout objects. See layout CAD design/plan. Visitor does **not** read it until dual-read/cutover (B4/B5).

## Project envelope (Track C)

`MuseumProject`: `{ formatVersion, id, name, layout, scene }` — serialize/load whole complex. Chopin becomes one project after compile + cutover.

---

## Session vs document

| Concern | In JSON / history? | Notes |
|---------|-------------------|--------|
| Entity transforms, materials, nav, clusters | **Yes** | Undoable document snapshots |
| Independent `scaleVector` | **Session map** | v6 scalar export can be lossy for visitors |
| Editor lighting/fog overrides | **Session only** | Not dirty for package fidelity the same way |
| UI layout, tool mode, timeline height | **Session / localStorage** | Never in scene JSON |
| Pending placement / camera ghosts | **Session only** | No history until commit |

History: prefer **single undo stack** with ops tagged `layout` | `scene` (north star). Cap ~100. Validate-on-commit; no-op if unchanged; clears redo. Mutations blocked during visitor preview / non-paused transport; undo blocked during drag/tx/play. Dirty flags may remain per document.

---

## Import / export

| Action | Effect |
|--------|--------|
| Import JSON / paste | Validate → replace session → clear history → new baseline |
| Import `.museumpack.zip` | Strict v6 + embedded textures |
| Export package | Preferred persistence path for textured scenes |
| Copy / Download JSON | Canonical export; **does not** clear dirty; may block if textures unresolved |
| Reset | Reload checked-in `museum-scene.json` |

There is **no** automatic writeback into the git working tree. Promoting exports is a human/repo step.

---

## Resolver rules (do not break)

- Room-local positions resolve via architecture transforms.
- Connection **endpoints** are inserted at resolve time — never author-persisted.
- Interior anchors keep stable ids; must not collide with generated endpoint ids.

---

## Fidelity gaps (known)

1. Independent non-uniform scale → visitor may see averaged/scalar scale until **v7 `scaleVector`**.  
2. Editor-only procedural params without a shared visitor mesh factory (or bake) will desync `/museum`.  
3. Session lighting does not round-trip through export.

---

## Persistence models for future parametric shapes

When adding “walls with parameters,” pick explicitly:

| Model | Meaning |
|-------|---------|
| **Preset** | Still box/cylinder under the hood; name + default dims (Phase 2) |
| **Shared factory** | Params in schema; editor + visitor build the same mesh |
| **Bake on export** | Rich editor → frozen geometry; re-edit may be lossy |

Do not claim “custom payload on v6, visitor ignores how it was drawn” unless bake or shared factory is real.

---

## Update when

Schema version/fields, codec rules, history limits/guards, import/export paths, dirty semantics, or fidelity/lossiness contracts change.
