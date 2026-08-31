# Scope decision — Experience / Interaction authoring boundary

**Date:** 2026-08-31
**Status:** Decision recorded (ratified 2026-08-31) and archived
**Amends (extends):** the 2026-08-31 north-star ratification that introduced
the two-mode `Spatial | Experience` project shell. This decision does **not**
reopen that shell decision; it decomposes `Experience` and pins the authority
boundary between Spatial camera/path authoring and Experience Interaction
authoring.
**No P-number:** this is a decision-support record, not an implementation plan.
Status/order stays in the tracker; canonical live truth stays in
[`north-star.md`](../../north-star.md) and [`architecture.md`](../../architecture.md).
This file records rationale only.

## 1. The decision

1. **Interaction authoring is an Experience-mode sub-surface, not a third
   project mode.** The project shell keeps exactly two creative modes —
   `Spatial` and `Experience` — with project-level `Assets` and `Publish`
   surfaces. `Experience` decomposes conceptually into **Navigation · Content ·
   Interactions**; `Interactions` is one authoring lens within Experience
   (an `Event → Target → Action` semantic behavior model), never a sibling
   three-item competitor to the two-mode shell.
2. **Spatial remains the sole authority for authored camera/path/timing/framing
   truth.** `Spatial → Camera` owns camera node pose, path geometry/anchors,
   connection topology, sequence, transition duration, target/orientation, FOV,
   and framing. Experience may **reference and observe** this state but must
   not become another camera editor (no `ExperienceScene`,
   `ExperienceCameraGraph`, `ExperienceCameraPath`, or independent XYZ/FOV
   interpolation).
3. **Experience may reuse the same 3D preview/render surface** of the same
   project without becoming a second spatial authority. It is a different
   authoring lens over the same project, same scene, same cameras, same assets,
   and same runtime — not an independent renderer or alternate scene.
4. **Semantic `Event → Target → Action` behavior remains the underlying
   interaction model**, with semantic triggers (Enter/Leave Room, Reach Camera,
   Click Object, Sequence/Transition start/end) preferred over raw seconds.
   Advanced temporal triggers may exist later but must evaluate against the
   canonical authored transition/timeline, never a copied copy of timing.
5. **Persistence ownership for interactions remains deferred.** This decision
   ratifies product/UI ownership (interaction authoring lives under Experience)
   only; it does not determine document ownership. `Project` keeps
   `layout` / `scene` / `experience (future)`, and the future placement of
   interactions (e.g. `ExperienceDocument └─ interactions` vs a sibling
   `Project └─ interactions`) is explicitly unresolved.

## 2. Why

- **Avoids a third top-level mode.** A project's two creative axes are the
  world itself (Spatial) and how visitors experience it (Experience);
  interaction is how the visitor reacts to the authored world, so it belongs
  inside the visitor-facing authoring surface.
- **Keeps visitor-facing authoring cohesive.** Navigation, content, and
  interaction are different lenses over the same visitor experience; splitting
  interaction into its own mode would fragment that surface.
- **Prevents a second camera/timeline authority.** The canonical camera graph /
  route / motion pipeline stays the single authority; Experience reacts to it
  instead of editing or duplicating it.
- **Lets interactions react to authored movement without duplicating it.**
  Semantic + relative timing (e.g. "at 60% of the transition") re-evaluates
  against canonical duration instead of copying it into a second source of
  truth.
- **Preserves future schema freedom.** Leaving durable ownership unresolved now
  avoids locking an interaction schema, codec, migration, or document before a
  future design slice.

## 3. What this does not do

- No code, schema, codec, migration, store, workspace, runtime API, camera
  event implementation, or new P-number.
- No `docs/components/interaction.md`; interaction is future direction, not a
  current implemented subsystem with a stable contract.
- No choice between `ExperienceDocument └─ interactions` and
  `Project └─ interactions` durable ownership options.
- No change to the current implemented `Scene | Camera` × `Plan | 3D` Spatial
  shell or to current asset behavior.

> Canonical product direction: [`north-star.md`](../../north-star.md) ·
> ownership/boundaries: [`architecture.md`](../../architecture.md) ·
> tracker + long-term roadmap: [`plans/README.md`](../../plans/README.md).