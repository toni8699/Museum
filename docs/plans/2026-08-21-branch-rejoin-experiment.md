# Branch rejoin — experiment brief (no schedule)

**Date:** 2026-08-21
**Status:** Experiment — deliberately **not scheduled**; no P number registered.
**Tracker:** [`docs/plans/README.md`](README.md) — stub row `— | Branch rejoin — experiment, no schedule`

## Goal

Author branches that **rejoin the main sequence at a later stop**
(`C → E → F → D`, merging back into playback at D) — the one piece of the
designer brief's `Branch { id, entryNodeId, nodeIds, rejoinNodeId? }` that the
shipped model cannot express. Return-to-origin branches (`C → E → C`) already
work via the shipped Branch return edge (S10.2).

## Current state (what exists)

- A Branch = head node carrying `detourOfNodeId = origin` (code field name kept
  for schema/back-compat; specs and UI say Branch); the chain is walked forward
  via `nextNodeId` links (`walkFlowComponentFrom`); the tail↔origin return edge
  is recognized and guarded from deletion (`isDetourReturnEdge`). One branch per
  origin (F6).
- Branches are **authoring-only**: they appear in the sidebar's Branches section
  and in `flowDetourGroups`; nothing plays them — the timeline is Sequence-only
  by design (P1.8 §19). `Camera-flow-specs.md` §21 already anticipates explicit
  traversal through branches ("a future Branch authoring system may explicitly
  define traversal through these neighbors").

## Gap

Rejoin into a *later* sequence node (D after origin C) is not representable: the
branch chain walk would absorb D into the chain, and the return edge is defined
only as tail ↔ origin.

## Modeling options

1. **Tail-node field (recommended for any future increment)** — e.g.
   `branchRejoinNodeId` on the chain tail. Smallest delta; matches the
   `detourOfNodeId` precedent (code field names stay; specs/UI say Branch).
   The codec is additive (strict allowed-keys list + reader + semantics +
   canonical serializer in `scene-codec/`; no version field, no migrations —
   old documents default the field to undefined).
2. **First-class `Branch` record** (the brief's TS type) — cleanest model, but a
   new top-level collection: codec allowed keys, reader, semantics, canonical
   serialization, exporter, contracts tests.
3. **Derived from the graph** (the tail already touches a later sequence node) —
   zero schema, but implicit: contradicts the brief's §4 ("sidequest must be
   explicit, not automatic") and silently breaks when the edge is deleted. Not
   recommended.

## Risk findings

| Layer | Risk | Why |
|---|---|---|
| Data | Low | Additive optional field; no version field / migrations |
| Validators / mutators | **Medium** | Every sequence mutation (insert, remove, reorder, re-root, connect create/delete, node delete) gains a rejoin-validity clause — e.g. the rejoin target must stay after the origin, and a rejoin edge must be delete-guarded like chain transitions |
| Playback / timeline | High, separable | No branch playback engine exists; timeline branch rendering (brief §7/§8) is a feature, not infrastructure |

## Open questions

- Does rejoin validity restrict re-root / reorder (the rejoin target must remain
  after the origin)?
- Should a rejoin edge be delete-guarded like chain transitions?
- Is timeline branch rendering (brief §7/§8) in scope of any future increment, or
  is branch authoring model-only?

## Status

Experiment — no schedule. Revisit when the P1–P3 queue clears or branch authoring
is prioritized; re-register with a P number at that point.
