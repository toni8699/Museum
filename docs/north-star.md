# North star

**Read when:** choosing what to build; reviewing pitches.  
**Do not read** for a narrow gizmo/tour/entity bug.  
**Last reviewed:** 2026-08-13
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
| **P1** | Room relocate → dual-read → B5 production cutover; one layout SoT |
| P2 | Graphics architecture foundation: shared geometry compiler → `PlanRenderModel` → procedural Three geometry — [`plans/2026-08-13-graphics-architecture-roadmap.md`](./plans/2026-08-13-graphics-architecture-roadmap.md) |
| P3 | Performance baseline → measured caching/partial rebuilds/batching/culling; conditional spatial index |
| P4 | GLB import + product-useful Plan/camera overlays + proven material effects |
| P5 | Multi-story — after the single-floor gate |

### Graphics architecture gate

After B5, follow the canonical [graphics architecture roadmap](./plans/2026-08-13-graphics-architecture-roadmap.md): compile `LayoutDocument` once into backend-neutral geometry, project an explicit world-space `PlanRenderModel`, and adapt compiled wall sections into procedural Three `BufferGeometry`. SVG and Three/Threlte remain the production renderers.

Camera paths, view cones, look targets, portal crossings, collision warnings, timing labels, and selection/interaction layers are product-useful Plan projections. Their source data remains in `project.scene` and the existing camera route/motion system; they do not become layout fields.

Benchmark 10/100/1,000-room fixtures and set budgets before optimization. Cache, rebuild less, stabilize render objects/materials, batch, cull, reduce detail, and add a spatial index only in response to measurements. WebGPU/WGSL stays a bounded Plan-backend experiment; Rust/WASM requires an isolated CPU bottleneck and boundary-inclusive proof. Neither belongs on the production critical path by default.

### GLSL polish gate

- Do not expand scene schema or polish temporary `rooms.ts` architecture during B3–B5.
- After B5 runtime cutover, prototype GLSL effects in `/dev/materials` with runtime-only parameters.
- Re-evaluate against imported GLBs after P2; promote only proven, performant effects into P3.
- Prefer controlled presets such as plaster aging, velvet sheen, or exhibit reveal. Never persist arbitrary shader source in `MuseumProject` / `museum-scene.json`.
- Material effects must preserve existing PBR lighting, shadows, fog, and tone mapping. Global post-processing comes after material experiments and a visitor performance baseline.

## Non-goals

Blender mesh editor · auto tour from floorplan · multi-tenant CMS · second path engine · investing in `rooms.ts` multi-opening as long-term SoT if cutover near.
