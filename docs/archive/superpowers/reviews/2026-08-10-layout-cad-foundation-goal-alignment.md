# Review: Layout CAD Foundation ↔ north-star alignment

**Date:** 2026-08-10  
**Plan:** [`../plans/2026-08-10-layout-cad-foundation.md`](../plans/2026-08-10-layout-cad-foundation.md)  
**Design:** [`../specs/2026-08-10-layout-cad-foundation-design.md`](../specs/2026-08-10-layout-cad-foundation-design.md)  
**North star:** [`../../museum-editor/north-star.md`](../../museum-editor/north-star.md)

---

## Goal under review

Product evolves to: **empty canvas → draw/relocate rooms → serialize project → load complex → camera on top**. Chopin migrates from `rooms.ts` into that serialized world. Placeholders stay parametric shapes—not Blender free mesh.

---

## Verdict

**Approve as P0 foundation** for the authoring format and editor drafting tools.  
**Conditional:** plan must include (now written into the plan) **Track B migration** (`rooms.ts` → layout compile, dual-read, cutover) and **Track C project envelope** (layout + scene), plus **thin A1 slice** before Bezier/arches. Without B/C, the plan only builds a sandbox that never absorbs Chopin.

---

## Fit matrix

| North-star need | Foundation plan | Gap / add |
|-----------------|-----------------|-----------|
| Empty canvas + draw rooms | Yes (Tasks 1–6) | Thin A1 before Bezier |
| Serialize layout | `museum-layout.json` | Add **project** envelope (layout+scene) |
| Many complexes as data | Implied | Project id + load path; not multi-CMS |
| Chopin leave `rooms.ts` | Explicitly deferred | **B0 compile + B4 dual-read + B5 cutover** |
| Relocate rooms | Missing | **B3** room-unit transform |
| Camera on complex | Correctly out of foundation | After promotion; keep one motion system |
| No Blender mesh | Yes | Keep sacred |
| Incremental + testable | Tasks ordered well | Golden Chopin fixture; architectureSource flag |

---

## Conflicts scrubbed by this review

| Prior authority | Conflict | Resolution |
|-----------------|----------|------------|
| Full-track Phase 2 next (scene Wall presets) | Competes with Mode B; presets ≠ authored shell | **Defer** Phase 2 dressing; optional later |
| Dressing roadmap “poly-wall as scene entities” | Wrong layer for room authorship | Layout draft paths own walls; scene props remain content |
| “Single Chopin project forever in code” | Blocks many-complex serialization | Chopin = first **data project** |
| Layout dirty “independent” undo wording | Ambiguous | **Single undo stack**, ops tagged `layout` \| `scene` |

---

## Decisions locked for implementers

1. **Primary track** = Layout CAD + Chopin migration (not full-track Phase 2).  
2. **History** = one stack, tagged ops; dirty flags may still be per-document.  
3. **Viewport** = Layout mode vs Museum mode (or equivalent mutex)—document in plan before Task 5.  
4. **Rectangle click-drag** = allowed plan-tool exception; object place stays ghost commit.  
5. **Corridors** = prefer skinny **layout rooms** (or explicit open wall-strip epic); not scene-only fakes for circulation.  
6. **Visitor** stays on `rooms.ts` until dual-read flag is green.  
7. **Mesh factory** stays editor-local until promotion extracts a shared module.

---

## Incremental test ladder (must stay green)

```text
A0 codec
 → B0 rooms.ts → LayoutDocument (Chopin golden fixture)
 → A1 line rooms + preview + history stub
 → C0 MuseumProject envelope round-trip
 → A2 plan UX
 → B1 Load Chopin layout in editor
 → A3/A4 Bezier/arches/objects/I/O as needed
 → B3 relocate room unit
 → B4 architectureSource dual-read
 → B5 Chopin cutover
```

Each step: focused unit tests + “visitor unchanged” until B4.

---

## Recommendation

Treat [`2026-08-10-layout-cad-foundation.md`](../plans/2026-08-10-layout-cad-foundation.md) as **active implementation authority**. Mark full-track Phase 2 as deferred optional. Update durable north star / handoff / READMEs accordingly (done in the same docs pass as this review).
