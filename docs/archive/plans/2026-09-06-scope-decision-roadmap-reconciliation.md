# Scope decision — roadmap reconciliation (audit review)

**Date:** 2026-09-06
**Status:** Decision recorded (ratified 2026-09-06) and archived
**Amends (extends):** the 2026-09-05 long-term tier reservations (P23 Layout
Depth, P24 Scene/Staging Depth, P25 Experience Foundation, P26+ expansion)
and the 2026-08-31 north-star ratification. This decision does **not** reopen
the two-mode `Spatial | Experience` shell, document ownership, or any shipped
plan; it reconciles sequencing/depth semantics after the advisory
[product/architecture audit](../../2026-09-05-product-architecture-audit.md).
**No P-number:** this is a decision-support record, not an implementation plan.
Status/order stays in the tracker; canonical live truth stays in
[`north-star.md`](../../north-star.md) and [`architecture.md`](../../architecture.md).
This file records rationale only.

## 1. The decision

1. **Broad product category retained.** Museum Editor stays a web-native
   platform for authoring, directing, revising, and publishing interactive
   spatial experiences. Guided exhibitions/showrooms are candidate early
   validation wedges, not the permanent category boundary; no market
   validation is claimed.
2. **P21/P22 unchanged.** P21 finishes exactly its current scope (P21.5
   presentation-only → final acceptance → close); P22 stays Basic Publish +
   cold visitor runtime, with no Experience authoring, agent API, Assets
   workspace, collaboration, or generic SDK.
3. **P23/P24 become staged depth families with separate ownership kept.**
   `P23 = Layout Depth family`, `P24 = Scene/Staging Depth family`. Each
   ships a minimum useful slice first; optional depth tails register later
   as separately numbered follow-ups per tracker rules (no `P23A`-style
   filenames; prose: minimum slice / optional depth tail / later registered
   follow-up).
4. **P25 may follow the P23/P24 minima before the optional tails.** Narrow
   complete Experience foundation (destination + navigation + content +
   small semantic trigger/action set, visitor-safe) — not a general app
   builder, no `ExperienceDocument` schema now.
5. **Bounded agent/reuse proof moves earlier**, after the first complete
   vertical slice (P22 + minima + narrow P25), before broad platform
   expansion. Small useful operation set; replaceable transport; no planner,
   chat UI, generic framework, or large MCP surface.
6. **Thesis ratified as strategy to validate, not moat.** Durable advantage
   = accumulated, tested reusable behavior across authoring, revision,
   validation, runtime, and publishing. AI is a client of the product.
   Cheaper/more-reliable-than-bespoke is a hypothesis for the comparative
   success test (canonical operations vs strong reusable-code baseline,
   revisions measured), not a claim.

## 2. Why

- The audit's technical findings (ownership, compiler, camera, history,
  preview isolation) are sound; its narrow exhibition/showroom category and
  assured-moat wording are not ratified.
- Waiting for broad Build + Stage catalogues before any Experience proof
  delays visitor/revision learning; minima-first sequencing tests the
  complete loop sooner without merging Layout/Scene ownership.
- Leaving the agent thesis in generic P26+ buries the central bet;
  a bounded proof after the first vertical slice falsifies it cheaply.

## 3. What this does not do

- No code, schema, codec, migration, store, workspace, runtime API,
  template system, MCP surface, or new P-number.
- No renumbering of shipped plans; no rewrite of archive history.
- No P22/P23/P25 implementation design; briefs register normally when due.

> Canonical product direction: [`north-star.md`](../../north-star.md) ·
> ownership/boundaries: [`architecture.md`](../../architecture.md) ·
> tracker + long-term roadmap: [`plans/README.md`](../../plans/README.md).
