# Persistence and schema

**Read when:** scene/layout/project codecs, undo/history, import/export, dirty, fidelity.  
**Last reviewed:** 2026-08-13

---

**Scene v6:** `textures` · `materials` · `entities` · `clusters?` · `navigationNodes` · `connections`. Codec v1–v6 → canonical v6. Primitives: `box|plane|cylinder|sphere` only. The standalone scene codec validates room IDs syntactically; the project codec owns cross-document room-reference and world-space camera-pose validation.

**Layout (P0):** canonical `formatVersion: 3`, `units: 'meters'`, floors → rooms → stable room frame + draft paths → openings → layout objects. The codec accepts v1–v3 and always emits v3. V1/v2 migration derives each frame deterministically from the sampled-boundary centroid and first non-zero tangent; v3 requires finite `frame.origin: [x, z]` and normalized radian `frame.yaw`. Opening `offset` is meters along a segment, never a sample index. Door-only `connectsRoomIds: [string, string]` relations are explicit, validated, and never inferred from geometry; windows remain unpaired.

**Editor layout session:** canonical `serializeLayoutDocument()` output is the layout baseline. Status is `blank | dirty | imported`; invalid-import feedback is independent and preserves the prior layout, model, selection, source, baseline, and dirty state. Layout import/copy/download/reset operate only on layout JSON (`museum-layout.json`). Scene replacement checks scene dirtiness, layout replacement checks layout dirtiness, and navigation/unload checks both. Room-unit relocation moves the frame, boundary, and owned objects atomically in one tagged `layout` history entry; vertex, bend, and opening edits leave the frame unchanged. The editor may hold intentionally independent transient scene/layout documents, so preview state validates each edited domain without requiring every intermediate pair to form a valid project.

**Layout object transforms:** `position` is world/layout center; Euler `rotation` is radians; `dimensions` are full local extents before rotation. Plan footprints and bounds use rotation-aware world AABBs. Authored `box | plane | cylinder | sphere` objects are editable; imported `profile` objects round-trip unchanged and are read-only in A4.

**Project:** `{ formatVersion: 1, id, name, layout, scene }`. The visitor-safe shared codec accepts nested layout v1–v3, emits layout v3 + scene v6, prefixes nested issues, and rejects scene room references that are absent from the same layout. `chopin-project.json` is the sole production layout/scene source; `chopin-project.ts` validates it once and exposes the project, one room registry, resolved scene, navigation graph, and runtime. No assets, binary payloads, UI, or history live in the envelope.

**History:** one chronological undo stack; entries tagged `layout` | `scene`; 100-entry cap; scene/layout transactions validate before commit; undo/redo replaces only the entry's domain; no-op skips entry; scene or layout import/reset clears the stack.

**Session-only:** `scaleVector` map, lighting overrides, UI chrome, pending ghosts.

**Fidelity:** independent scale may be lossy for visitors until v7; editor-only meshes desync until shared factory/bake; no auto repo writeback.
