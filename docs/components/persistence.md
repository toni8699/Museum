# Persistence and schema

**Read when:** scene/layout/project codecs, undo/history, import/export, dirty, fidelity.  
**Last reviewed:** 2026-08-13

---

**Scene:** `textures` · `materials` · `entities` · `clusters?` · `navigationNodes` · `connections`. One canonical shape; no version field, no migrations. Primitives: `box|plane|cylinder|sphere` only. Standalone scene codec validates room IDs syntactically; project codec owns cross-document room-reference + world-space camera-pose validation.

**Layout (P0):** canonical `units: 'meters'`, floors → rooms → stable room frame + draft paths → openings → layout objects. No version field; rooms always carry a finite `frame.origin: [x, z]` + normalized radian `frame.yaw`. Opening `offset` = meters along a segment, never a sample index. Door-only `connectsRoomIds: [string, string]` relations explicit, validated, never inferred from geometry; windows unpaired.

**Editor layout session:** canonical `serializeLayoutDocument()` output = layout baseline. Status = `blank | dirty | imported`; invalid-import feedback independent, preserves prior layout, model, selection, source, baseline, dirty state. Layout import/copy/download/reset operate only on layout JSON (`museum-layout.json`). Scene replacement checks scene dirtiness, layout replacement checks layout dirtiness, navigation/unload checks both. Room-unit relocation moves frame, boundary, owned objects atomically in one tagged `layout` history entry; vertex, bend, opening edits leave frame unchanged. Editor may hold intentionally independent transient scene/layout documents, so preview state validates each edited domain without requiring every intermediate pair to form valid project.

**Layout object transforms:** `position` = world/layout center; Euler `rotation` = radians; `dimensions` = full local extents before rotation. Plan footprints + bounds use rotation-aware world AABBs. Authored `box | plane | cylinder | sphere` objects editable; imported `profile` objects round-trip unchanged, read-only in A4.

**Project:** `{ id, name, layout, scene }`. Visitor-safe shared codec validates nested layout + scene in one shape, prefixes nested issues, rejects scene room references absent from same layout. `chopin-project.json` = sole production layout/scene source; `chopin-project.ts` validates once, exposes project, one room registry, resolved scene, navigation graph, runtime. No assets, binary payloads, UI, or history in envelope.

**History:** one chronological undo stack; entries tagged `layout` | `scene`; 100-entry cap; scene/layout transactions validate before commit; undo/redo replaces only entry's domain; no-op skips entry; scene or layout import/reset clears stack.

**Session-only:** `scaleVector` map, lighting overrides, UI chrome, pending ghosts.

**Fidelity:** independent scale may be lossy for visitors; editor-only meshes desync until shared factory/bake; no auto repo writeback.
