# Roadmap and strategy

**Read when:** sequencing features; reviewing pitches against north star.  
**Last reviewed:** 2026-08-10  
**Live status:** [`../agent-handoffs/CURRENT.md`](../agent-handoffs/CURRENT.md)  
**Vision:** [`north-star.md`](./north-star.md)

---

## North star (summary)

Empty canvas → draw/relocate rooms → serialize **MuseumProject** (layout + scene) → load complex → camera on top. Chopin migrates from `rooms.ts` to data. Parametric placeholders only—not Blender.

---

## Active P0 — Layout CAD + migration

| Track | Intent |
|-------|--------|
| **A** | Layout codec, line rooms, plan UX, then Bezier/arches/objects |
| **B** | Chopin `rooms.ts` → layout compile; dual-read; cutover |
| **C** | Project envelope (layout + scene) load/export |

**Plan:** [`../superpowers/plans/2026-08-10-layout-cad-foundation.md`](../superpowers/plans/2026-08-10-layout-cad-foundation.md)  
**Review:** [`../superpowers/reviews/2026-08-10-layout-cad-foundation-goal-alignment.md`](../superpowers/reviews/2026-08-10-layout-cad-foundation-goal-alignment.md)

**Next slices:** A0 → B0 → A1 → C0 → A2 … → A3/A4 → B3 → B4/B5

**Quality gate before P4:** single-floor room/complex draft, validation, 3D preview, serialization, reload, promotion/load, and camera authoring must work end to end without regressions.

---

## Shipped (still true)

| Era | Outcome |
|-----|---------|
| Workspace Phases 1–5 | Shell, camera timeline/graph, primitives/lights, textures + package |
| Phase 6.1 / 6.2 | Gizmo/selection parity, OBB, Active Object, settings |
| Full-track Phase 1 | Independent scale + placement ghost |

---

## Deferred / scrubbed

| Former plan | Status |
|-------------|--------|
| Full-track **Phase 2** scene architecture presets | Deferred optional dressing — [`../superpowers/plans/2026-08-09-museum-editor-full-track.md`](../superpowers/plans/2026-08-09-museum-editor-full-track.md) |
| Full-track **Phase 3** GLB import | After layout-backed complex load preferred |
| Dressing-only “poly-wall as scene entities” as shell path | Superseded by layout draft paths |
| Investing in legacy `rooms.ts` multi-opening as SoT | Avoid if cutover near |

---

## Future after the single-floor quality gate

**P4 — Multi-story building layouts**

Add stacked floors only after the single-floor layout/complex workflow is considered complete and stable.

Target hierarchy:

```text
Building
  ├─ Floor
  │   ├─ Rooms / boundaries
  │   ├─ Openings
  │   └─ Layout objects
  └─ Vertical links
      ├─ stairs
      └─ elevators / future connectors
```

P4 must preserve stable building, floor, room, opening, object, and camera references. It must not begin by solving terrain, civil CAD, or unrestricted structural modeling.

---

## Open product questions

1. Layout vs Museum viewport: hard mode switch vs muted overlay?  
2. Corridor = skinny layout room (default) vs open wall-strip epic?  
3. Scale deadstop (gizmo vs inspector) — still open for scene gizmos; unrelated to layout A0.  
4. When to extract shared mesh factory for visitor (at B4 vs B5)?

---

## Update when

North star, track priority, or deferred-plan status changes. Slice scratch → `CURRENT.md` only.
