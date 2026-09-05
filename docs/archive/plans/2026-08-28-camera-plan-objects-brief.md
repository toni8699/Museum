# Design brief — Camera Plan: show placed objects while drafting camera paths

**Audience:** independent designer, working from this brief only (no codebase
access required). **Owner:** Museum editor (camera tour / Camera Plan surface).
**Date:** 2026-08-28. **Deliverable:** a footprint-style review — state sheet,
density samples, and a legibility recommendation. No code. This brief proposes
a small, deliberate change; the reviewer's job is to confirm or push back on
the visual treatment and the interaction rules below.

**Status: APPROVED & RATIFIED — 2026-08-28.** This brief's treatment is
ratified and superseded by
[`Camera-layout-design.md`](Camera-layout-design.md). Review resolutions:
the shared passive footprint language is the baseline (1.5px / `5 4`,
QA-tunable on the toned paper); footprints stay visually constant on
selection; plan-authored primitives unify onto the footprint tokens on the
Camera Plan surface only; and every object remains present at every zoom.

## 1. What the surfaces are

The editor has three views of the same indoor scene:

1. **Scene Plan** — a bright 2D drafting view (rooms, walls, doors, windows,
   and placed objects). This is where the floor plan is drawn and where
   objects are positioned.
2. **Camera Plan** — a second 2D drafting view for authoring the camera tour.
   It shows the same floor plan (rooms/walls/openings, slightly muted) plus the
   **camera graph**: numbered camera nodes, connection curves between them,
   bend anchors, and order/timing labels. This is where camera paths are drawn
   and edited.
3. **Scene 3D** — the live 3D viewport.

All three share the same underlying scene data. Camera Plan and Scene Plan are
both drawn with the same 2D renderer — they are two projections of one model.

## 2. The problem

**Camera Plan hides the objects.** The room shells and walls render, but the
objects placed in the scene — furniture models, boxes/cylinders/spheres,
clustered arrangements — do not appear on the Camera Plan surface at all.
Two object kinds are affected:

- **Scene-placed objects** (assets and primitives added through the scene /
  3D workflow, including grouped arrangements): completely invisible.
- **Plan-authored primitives** (objects drawn directly on the plan): rendered
  so faintly (light beige fill on white paper, thin gray outline) that they
  read as background noise rather than objects.

The consequence is a drafting blind spot: while connecting camera nodes into a
path, there is no way to see whether the path passes **through** a table,
partition, or display case. The user only discovers the conflict after
switching to the 3D view, and must shuttle back and forth to fine-tune the
path around objects it could not see. Camera tours are spatial by nature —
where the camera stands and what it must avoid — yet the surface used to
author them is the only one that hides the space's contents.

## 3. The proposed change

Render the same **passive object footprints** the Scene Plan already uses onto
the Camera Plan surface, drawn **underneath** the camera graph so the topology
stays the foreground:

- Every placed object shows as a **footprint outline** — the object's
  floor-projected extent (rectangle for boxes, ellipse for cylinders/spheres,
  authored outline for models), rotated and scaled with the object.
- Footprints are **passive**: no fill emphasis, no selection, no hover, no
  drag. They are context, exactly like the walls they sit against. They must
  never compete with camera nodes, curves, or anchors for attention.
- The camera graph (nodes, curves, labels) renders **on top** of footprints,
  unchanged in color, weight, or z-order. Footprints only fill the visual
  space that is currently empty.
- The scene's architectural content (room floors, walls, doors, windows)
  stays exactly as it is today.

This is a *visibility* change only: it adds no new editing ability to Camera
Plan and removes none. Objects remain non-selectable there; the Scene Plan and
3D views keep owning object editing.

## 4. Why this treatment

The footprint already exists as a designed artifact on the Scene Plan surface:
a **faint dashed outline** (muted gray stroke, ~12% fill, thin dash rhythm).
Reusing it verbatim on Camera Plan gives cross-surface consistency for free —
the same object reads the same way on both plans. The open question the brief
wants answered is whether the **camera paper** (slightly toned vs Scene Plan's
bright white) needs a stronger variant to stay legible under the dense camera
graph, or whether the shared treatment is sufficient.

## 5. What the reviewer should produce

1. **Footprint treatment on Camera Plan paper:** recommend the exact outline
   (stroke weight, dash pattern, fill opacity, color token) for objects under
   the camera graph. Confirm whether a Camera Plan–specific variant token is
   warranted or whether the shared Scene Plan footprint is legible enough.
   Show the footprint **at three zoom levels** (room overview, path-drafting
   zoom, close-up) — dash rhythm and stroke weight must survive all three
   without turning into noise or disappearing.
2. **Density sample:** one busy room — a wall of furniture, a central display
   case, a few scattered primitives — with a camera path threading between
   them, to prove objects read as obstacles without overwhelming the graph.
3. **Interplay states:** how footprints sit under (a) a selected connection,
   (b) a selected node, (c) an in-progress placement ghost, and (d) the
   timing/order labels. Nothing the graph draws may be visually downgraded by
   the new layer underneath.
4. **Recommendation on selected-node dimming (optional):** when a camera node
   is selected, should the footprints **recede** (e.g., reduce to outline-only)
   to focus the eye on the node's surroundings, or stay constant? The brief's
   default is: stay constant — constant context beats state-dependent context
   at this density — but this is the reviewer's call.
5. **Plan-primitive parity (optional):** the plan-authored primitives that
   already render (barely) should either be promoted to the same footprint
   treatment or stay as-is. Recommend one.

## 6. Hard constraints (non-negotiable)

- Footprints are **presentation-only and non-interactive** on Camera Plan:
  no pointer events, no hit-testing, no selection, no editing, no hover
  affordances. The camera graph keeps the entire interaction surface.
- Footprints render **below** the camera graph layer, never above or mixed
  into it.
- Architectural rendering (rooms, walls, openings) is unchanged — same colors,
  same weights, same order.
- No new rendering technology: same 2D SVG renderer, same shared render model
  both plans already use.
- Token-only colors — no new inline hex; any Camera Plan variant must be a
  named token derived from the existing plan palette.
- Lights and objects without a room association are excluded (they have no
  floor footprint) — they should not be forced into the plan.
- Out of scope: automatic "path clips object" warnings. This brief covers
  *seeing* objects; detecting and flagging intersections is a separate,
  later feature (and this change is its prerequisite).

## 7. Open questions for the reviewer

1. Does the shared Scene Plan footprint treatment stay legible on Camera
   Plan's toned paper under the camera graph, or does it need a dedicated
   variant? If a variant: how much stronger without stealing from the graph?
2. Dash rhythm and stroke weight that survive all three zoom levels without
   reading as solid outlines (which would compete with walls).
3. Selected-node behavior: constant footprints (brief's default) vs receding
   footprints.
4. Should plan-authored primitives (today near-invisible) be unified onto the
   same footprint language, or intentionally left distinct?
5. Is there any case where a footprint should be allowed to *fade to nothing*
   (e.g., tiny objects at room zoom), or must every object stay present at
   every zoom?
