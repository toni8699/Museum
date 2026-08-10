# Scene content

**Read when:** changing entities, asset library, materials/textures, lights, clusters/groups.  
**Last reviewed:** 2026-08-10

---

## What lives in the scene document

Editable scene content (schema v6) includes:

| Kind | Notes |
|------|--------|
| **Model entities** | Catalogue GLB + transform + optional material instance; fallback primitive |
| **Primitive entities** | `box` \| `plane` \| `cylinder` \| `sphere` + kind-locked dimensions |
| **Light entities** | `point` \| `spot` \| `directional` + intensity/cone/shadow fields |
| **Textures** | Registered URI / local package textures |
| **Material instances** | Reference shared PBR catalogue + optional texture, roughness/metalness |
| **Clusters** | Named groups of same-room member entity ids (editor hierarchy; visitor renders flat) |

Architecture shell rooms are **not** scene entities (see [`architecture-boundary.md`](./architecture-boundary.md)).

---

## Asset library (Scene → Assets)

| Tab | Capability today |
|-----|------------------|
| Models | Search/filter catalogue; place (Paris-oriented gate in practice) |
| Shapes | Box / plane / cylinder / sphere — arm placement |
| Lights | Point / spot / directional — arm placement |
| Textures | Public URI or local file; recent list; drag onto models/primitives |

Texture is never a scene object by itself — it binds through materials.

---

## Outliner / hierarchy

- Rooms appear as **context** (from architecture), not as editable shell folders.
- Entities list under rooms / clusters.
- Clusters: create, rename, ungroup; Shift multi-select; Cmd/Ctrl+G / Shift+G.
- Duplicate / Delete placements.

Clusters persist in the document and can be duplicated with members. There is **no** reusable prefab library (“save bay as template”) yet.

---

## Materials

- Inspect base material / texture, roughness, metalness.
- **Make unique** vs edit shared (modal when shared).
- Shared PBR catalogue (`materials.ts`) is referenced by id — not rewritten as a full material editor.

---

## Lights (current limits)

- Aimed by **rotation** (local −Z); no saved `targetEntityId`.
- Typically placed on a **floor** at a default height — not ceiling/sconce mount policies yet.
- Session lighting/fog overrides (Bright/Visitor, ambient, fog) are **preview aids** and are **not** saved to the scene JSON.

---

## Known gates

- Model placement remains **Paris-oriented** until full-track Phase 3 lifts the gate.
- Primitive kinds are only the four listed — semantic “Wall/Door” presets (Phase 2) are still the same kinds with names/default sizes.
- Asset type metadata may mention wall/ceiling surfaces; editor placement does not use them yet (see [`placement-and-transforms.md`](./placement-and-transforms.md)).

---

## Update when

Entity kinds/fields, library tabs, material/texture flows, cluster/prefab behavior, Paris/cross-room gates, or light capabilities change.
