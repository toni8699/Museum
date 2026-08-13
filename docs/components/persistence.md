# Persistence and schema

**Read when:** scene/layout/project codecs, undo/history, import/export, dirty, fidelity.  
**Last reviewed:** 2026-08-12

---

**Scene v6:** `textures` · `materials` · `entities` · `clusters?` · `navigationNodes` · `connections`. Codec v1–v6 → canonical v6. Primitives: `box|plane|cylinder|sphere` only.

**Layout (P0):** `formatVersion: 1`, `units: 'meters'`, floors → rooms → draft paths → openings → layout objects. A1 openings are geometry-only; `offset` is meters along a segment, never a sample index. B4 adds explicit `connectsRoomIds: [string, string]` for interior portals. Visitor ignores layout until B4/B5.

**Layout A4/B3 session:** canonical `serializeLayoutDocument()` output is the layout baseline. Status is `blank | dirty | imported`; invalid-import feedback is independent and preserves the prior layout, model, selection, source, baseline, and dirty state. Layout import/copy/download/reset operate only on layout JSON (`museum-layout.json`). Scene replacement checks scene dirtiness, layout replacement checks layout dirtiness, and navigation/unload checks both. Layout remains preview-state-only for runtime, but B3 room-unit gestures and inspector rotation enter the shared chronological history as tagged `layout` entries.

**Layout object transforms:** `position` is world/layout center; Euler `rotation` is radians; `dimensions` are full local extents before rotation. Plan footprints and bounds use rotation-aware world AABBs. Authored `box | plane | cylinder | sphere` objects are editable; imported `profile` objects round-trip unchanged and are read-only in A4.

**Project (Track C / C0):** `{ formatVersion: 1, id, name, layout, scene }`; pure editor codec plan: [`../plans/2026-08-10-layout-cad-c0-project-codec.md`](../plans/2026-08-10-layout-cad-c0-project-codec.md). Nested layout/scene codecs own validation and canonicalization; project prefixes nested issues and emits canonical scene v6. No assets, binary payloads, UI, history, or visitor loading in C0.

**History:** one chronological undo stack; entries tagged `layout` | `scene`; 100-entry cap; scene/layout transactions validate before commit; undo/redo replaces only the entry's domain; no-op skips entry; scene or layout import/reset clears the stack.

**Session-only:** `scaleVector` map, lighting overrides, UI chrome, pending ghosts.

**Fidelity:** independent scale may be lossy for visitors until v7; editor-only meshes desync until shared factory/bake; no auto repo writeback.
