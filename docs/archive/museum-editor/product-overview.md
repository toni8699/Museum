# Product overview

**Read when:** starting editor work; explaining the product without code.  
**Last reviewed:** 2026-08-10  
**North star:** [`north-star.md`](./north-star.md)

---

## What it is becoming

A **layout-first, development-only** authoring surface for **serialized museum complexes**. Authors draw rooms on an empty canvas, rearrange them, place parametric placeholders, export a project (layout + scene), and author the guided **camera tour** on that complex. Chopin is the first complex to migrate from code (`rooms.ts`) into data. Foundation scope is one floor; multi-story buildings and stacked rooms come only after the single-floor room/complex workflow is reliable end to end.

It is **not** Blender, not a multi-tenant cloud CMS, and not visitor-facing. Production `/dev/museum-editor` returns **404**.

---

## What it is today (transition)

| Layer | Today | Target |
|-------|-------|--------|
| Architecture | Static `rooms.ts` → `MuseumShell` | `project.layout` → generated shell |
| Scene content | `museum-scene.json` v6 | Same, inside project envelope |
| Layout CAD | Not shipped | Editor `museum-layout.json` / project.layout; single-floor first |
| Building levels | Not shipped | Future stacked floors after single-floor quality gate |
| Tour | Nodes/paths on current museum | Same motion system; room ids from layout after cutover |

Until dual-read/cutover, visitor `/museum` still uses `rooms.ts`. Layout drafting is editor-preview first (see layout CAD plan).

---

## Dual-layer model (still critical)

| Layer | Meaning |
|-------|---------|
| **Architecture** | Walkable rooms, openings, floors/walls/ceilings |
| **Scene content** | Props, lights, materials, camera graph |

**Mode A (dressing):** props inside fixed architecture — still useful for art; **not** how rooms are born.  
**Mode B (north star):** architecture authored in layout data, then promoted/loaded.

Placing a box that looks like a wall is still a prop unless it lives in **layout** (or is promoted).

---

## Locked decisions

- Layout-first north star; Chopin → serialized project.  
- One guided tour loop (+ free nodes) on the complex.  
- Scene vs Camera workspaces (attention); Layout mode added for CAD.  
- Object placement: click → ghost → commit (plan rectangle drag = CAD exception).  
- One camera/motion pipeline.  
- Schema v6 scene until project/layout cutover says otherwise.

---

## Future expansion gate

After a single-floor room/complex can be drafted, validated, previewed, serialized, reloaded, promoted, and toured without regressions, extend the hierarchy to multi-story buildings:

```text
Building → Floors → Rooms → Openings / Objects
```

Floor-to-floor links, stairs, elevators, vertical camera routing, and cross-floor room IDs belong to that later track.

## Non-goals

- Arbitrary mesh editing / sculpt / UV DCC  
- Auto tour generation from floorplan  
- Shipping editor UI to production visitors  
- Treating full-track Phase 2 scene Wall presets as shell authorship  
- Multi-story building authoring in the single-floor foundation  

---

## Update when

Scope, north star, migration stage, or locked decisions change.
