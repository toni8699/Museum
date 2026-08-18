# P5 — Measured optimization and scale (umbrella)

**Date:** 2026-08-18
**Status:** Proposed — plan seed; filled in before code
**Tracker:** [`docs/plans/README.md`](README.md) — **P5**, depends on: renewal
**Folded source (2026-08-18, content preserved):** §A — the G5 seed, from the
archived roadmap (`KEEP` then `LATER`).

## Outcome

Apply optimizations **in this order, stopping when budgets pass**:

measure → cache derived geometry → avoid whole-document work during transient
edits / partial rebuilds → stable render objects and keys → shared materials →
continuous/merged BufferGeometry → viewport/frustum culling → zoom-dependent
detail → spatial indexing (conditional) → instancing where appropriate → only
then investigate lower-level renderer changes.

## Rules (locked from §A)

- **Record explicit target and fail budgets before any optimization begins.**
- **Spatial indexing is conditional:** add a render-neutral uniform grid or
  R-tree only when profiling shows linear queries materially consuming the
  hit-test / snapping / collision / selection / nearby-wall-opening / culling
  budgets. Build it from compiled query records, benchmark construction/update
  cost, and keep a linear reference path for parity tests.

## Increments

| ID | Content | Depends |
|---|---|---|
| **P5.1** | Benchmark harness + target/fail budgets recorded | — |
| **P5.2** | Derived-geometry cache + partial rebuilds (stop if budgets pass) | P5.1 |
| **P5.3** | Render-object stability + shared materials + merged geometry | P5.2 |
| **P5.4** | Culling + zoom-dependent detail (+ conditional spatial indexing) | P5.3 |
| **P5.5** | Instancing + parity tests vs the linear reference path | P5.4 |

## Definition of done (P5 close)

- Budgets pass at each stop point; parity tests vs the linear reference path;
  no behavioral drift; suite green, `svelte-check` 0, build clean.

---

## A — Source: G5 seed, folded from the archived roadmap


Apply optimizations in this order, stopping when budgets pass:

```text
measure
  ↓
cache derived geometry
  ↓
avoid whole-document work during transient edits / use partial rebuilds
  ↓
stable render objects and keys
  ↓
shared materials
  ↓
continuous or merged BufferGeometry
  ↓
viewport/frustum culling
  ↓
zoom-dependent detail
  ↓
spatial indexing
  ↓
instancing where appropriate
  ↓
only then investigate lower-level renderer changes
```

Spatial indexing is conditional. Add a render-neutral uniform grid or R-tree only
when profiling shows linear queries materially consuming the hit-test, snapping,
collision, selection, nearby-wall/opening, or culling budgets. Build it from
compiled query records, benchmark construction/update cost, and keep a linear
reference path for parity tests.

