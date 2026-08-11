# Persistence and schema

**Read when:** scene/layout/project codecs, undo/history, import/export, dirty, fidelity.  
**Last reviewed:** 2026-08-10

---

**Scene v6:** `textures` · `materials` · `entities` · `clusters?` · `navigationNodes` · `connections`. Codec v1–v6 → canonical v6. Primitives: `box|plane|cylinder|sphere` only.

**Layout (P0):** `formatVersion: 1`, `units: 'meters'`, floors → rooms → draft paths → openings → layout objects. A1 openings are geometry-only; `offset` is meters along a segment, never a sample index. B4 adds explicit `connectsRoomIds: [string, string]` for interior portals. Visitor ignores layout until B4/B5.

**Project (Track C / C0):** `{ formatVersion: 1, id, name, layout, scene }`; pure editor codec plan: [`../plans/2026-08-10-layout-cad-c0-project-codec.md`](../plans/2026-08-10-layout-cad-c0-project-codec.md). Nested layout/scene codecs own validation and canonicalization; project prefixes nested issues and emits canonical scene v6. No assets, binary payloads, UI, history, or visitor loading in C0.

**History:** one undo stack; ops tagged `layout` | `scene`; ~100 cap; validate-on-commit; no-op skips entry.

**Session-only:** `scaleVector` map, lighting overrides, UI chrome, pending ghosts.

**Fidelity:** independent scale may be lossy for visitors until v7; editor-only meshes desync until shared factory/bake; no auto repo writeback.
