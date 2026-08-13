# North star

**Read when:** choosing what to build; reviewing pitches.  
**Do not read** for a narrow gizmo/tour/entity bug.  
**Last reviewed:** 2026-08-10  
**Live slice:** [`hand-off/CURRENT.md`](./hand-off/CURRENT.md)

---

## Vision

**Layout-first museum complex editor:** empty canvas → draw/relocate rooms → openings + parametric placeholders (not free mesh) → serialize `MuseumProject` (layout + scene) → load in editor/visitor → author **camera tour on that complex**. Chopin is the first **data project**, not a permanent `rooms.ts` special case.

Foundation = **single floor**. Corridors are ordinary skinny layout rooms; early cutouts are geometry-only. Semantic room/portal adjacency arrives at B4. Multi-story only after single-floor draft → validate → preview → serialize → reload → promote → tour works without regressions.

```text
MuseumProject
  ├─ layout   ← rooms, openings, layout objects  (today: rooms.ts)
  ├─ scene    ← entities, materials, camera graph (today: museum-scene.json)
  └─ assets…
```

## Sacred contracts

1. Semantic drafting, not Blender — app owns mesh; no arbitrary CSG/sculpt.  
2. Serialize/load — leave `rooms.ts` via compile → dual-read → cutover.  
3. One camera/motion system.  
4. Visitor isolation until promotion APIs shared.  
5. Object place = ghost → commit; plan rectangle click-drag = CAD exception only.

## Priority

| Pri | Track |
|-----|-------|
| **P0** | Layout CAD + Chopin compile + project envelope — [`plans/2026-08-10-layout-cad-foundation.md`](./plans/2026-08-10-layout-cad-foundation.md) |
| P1 | Room relocate; dual-read; cutover |
| P2 | GLB import (after layout-backed load) |
| P3 | 2D rendering expansion + visual polish: Plan performance, camera overlays, Scene Wall presets, proven GLSL effects — optional; **not** shell |
| P4 | Multi-story — after single-floor gate |

### 2D graphics expansion gate

After B5, treat the Plan workspace as the primary graphics-engineering expansion surface while keeping the museum product goal intact:

- Derive a pure `PlanRenderModel` from `LayoutDocument`: ordered fills, strokes, openings, objects, camera paths, selection overlays, and labels. Keep document mutation and rendering separate.
- Keep SVG as the default renderer. Add Canvas/WebGL only when large-layout benchmarks identify a measured SVG bottleneck; do not build multiple speculative backends.
- Prioritize product-useful 2D work: camera paths, view cones, look targets, portal crossings, collision warnings, timing labels, and synchronized playback position.
- Benchmark representative heavy layouts for initial render, pan/zoom frame time, edit and hit-test latency, DOM count, memory, and 3D regeneration time. Record performance budgets and regression tests.
- Optimize only from evidence: cached derived geometry, stable keyed elements, viewport culling, zoom-dependent detail, spatial indexing for hit testing/snapping, hidden-layer suppression, and demand-based rendering.
- Add visual correctness coverage for curves, openings, selection layers, zoom levels, and 2D/3D geometry consistency.
- C++, WASM, native window systems, IPC, custom compositors, and renderer rewrites are not roadmap requirements. Reconsider only for a demonstrated product bottleneck or a separately approved research goal.

### GLSL polish gate

- Do not expand scene schema or polish temporary `rooms.ts` architecture during B3–B5.
- After B5 runtime cutover, prototype GLSL effects in `/dev/materials` with runtime-only parameters.
- Re-evaluate against imported GLBs after P2; promote only proven, performant effects into P3.
- Prefer controlled presets such as plaster aging, velvet sheen, or exhibit reveal. Never persist arbitrary shader source in `MuseumProject` / `museum-scene.json`.
- Material effects must preserve existing PBR lighting, shadows, fog, and tone mapping. Global post-processing comes after material experiments and a visitor performance baseline.

## Non-goals

Blender mesh editor · auto tour from floorplan · multi-tenant CMS · second path engine · investing in `rooms.ts` multi-opening as long-term SoT if cutover near.
