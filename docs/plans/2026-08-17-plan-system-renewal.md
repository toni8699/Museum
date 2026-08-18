# Plan-System Renewal — Post-H1 Plan Tracking

**Date:** 2026-08-17
**Status:** Approved (2026-08-17) — the **hard-gated first step after H1**; no
other post-H1 work starts until this plan lands
**Parent:** [`../north-star.md`](../north-star.md) · [`../hand-off/CURRENT.md`](../hand-off/CURRENT.md) (renewal note)
**Handoff:** [`../../hand-off/CURRENT.md`](../../hand-off/CURRENT.md)
**Replaces:** the letter-coded plan families (A0–A4, B0–B5, C0/C1/C2, G1–G6, H1 S0–S12, D1, S9a) — archived by this plan

> **Why this plan exists.** The letter-coded plan families have become a
> liability. Letters collide across tracks (S means an H1 sub-slice *and* the
> S9a import slice; C0 is a codec plan, C1/C2 are product choices), numbered
> sequences carry gaps (H1 step 9 deferred, 8.1/8.2 inserted after the fact),
> and status lives in four places at once (umbrella, sub-plans, roadmap
> classification, hand-off narrative) with free-text variants like "Proposed —
> direction locked", "not scheduled", "deferred optional". After H1 lands,
> tracking restarts on one sequential scheme and the letter era is archived.

## Problem being solved

- **Confusing cross-track letters** — the same letter means different things in
  different families; new work has no obvious home.
- **Sequence gaps and retroactive insertion** — steps are deferred, renumbered,
  or inserted (S8.1/S8.2) after the fact, so "the plan numbers" no longer read
  as an order.
- **Duplicated status** — plan truth is spread across umbrella + sub-plans +
  roadmap + hand-off, and they drift.
- **No archive discipline** — shipped and superseded plans sit beside active
  ones in `docs/plans/`; `docs/archive/superpowers/` holds a second, older
  letter scheme that never merged.

## The new system (rules going forward)

1. **One flat namespace.** New plans are `docs/plans/YYYY-MM-DD-<slug>.md`.
   **No letter codes in titles, ever.** This plan itself follows the rule.
2. **One tracker, single source of truth.** `docs/plans/README.md` holds the
   complete table: sequential number (`P1`, `P2`, …), plan, status,
   depends-on, and doc link. Numbers exist **only in the tracker** — files are
   never renamed to carry numbers.
3. **One status enum.** `proposed | approved | in-progress | shipped |
   archived`. Every plan doc's `**Status:**` line matches the tracker; the
   tracker is authoritative when they drift.
4. **Dependencies by tracker number**, never by letter family.
5. **Archive on close.** When a plan ships, its doc moves to
   `docs/archive/plans/` (tracker keeps a one-line stub:
   `archived → <path>`).
6. **Re-registration, not re-lettering.** Approved-but-unscheduled work keeps
   its content and gains a new tracker number; its doc moves with the letter
   era into archive and the tracker links there.

## Execution steps (in order, all after the H1 gate)

1. **Create `docs/plans/README.md`** — the tracker, seeded with this plan as
   an **unnumbered process row** (a tracker cannot number its own bootstrap)
   and the re-registered work per the skeleton below.
2. **Archive the letter era.** Move every pre-renewal plan doc in
   `docs/plans/` — all 36 current files, letter-coded or not — to
   `docs/archive/plans/pre-h1-letters/` (one flat directory, filenames
   unchanged, git history preserved by the move). This includes the A/B/C/G
   tracks, the H1 umbrella + S0–S12 + S8.1/S8.2, the S9 seed, C1, the roadmap,
   and the two non-letter plans of the same era
   (`layout-viewport-switch-optimization`,
   `geometry-kernel-library-review`).
3. **Re-register approved work.** C1 (Plan staging mode, approved 2026-08-17)
   becomes **P2** in the tracker with `status: approved`, linking the archived
   C1 doc. Its content is unchanged.
4. **Fold the roadmap classification into the tracker.** The G-track
   `KEEP / LATER / EXPERIMENT / REJECT` classification and the north-star
   priority table become tracker columns (`track`, `priority`), not separate
   documents.
5. **Retire duplicates.** `docs/components/*.original.md` files and any
   stale archive-letter scheme notes move to the pre-H1-letters archive.
6. **Update the hand-off.** `CURRENT.md`'s "Next slice" points to the tracker
   as the plan source of truth and to the first scheduled work per the tracker
   (`P1` camera overhaul, per the 2026-08-18 scope decision).

## Tracker skeleton (seeded by this plan)

```text
| #  | Plan                                      | Status    | Depends on | Doc |
|----|-------------------------------------------|-----------|------------|-----|
| —  | Plan-system renewal (this plan — process row, creates this tracker) | approved | H1 gate | 2026-08-17-plan-system-renewal.md |
| P1 | Camera overhaul (was H1 S10.3 — inserted by the 2026-08-18 scope decision) | approved | renewal | 2026-08-18-post-h1-camera-overhaul.md |
| P2 | Plan staging mode — 2D furnishing (C1)    | approved  | P1         | archive/plans/pre-h1-letters/2026-08-14-graphics-h1-c1-plan-staging.md |
| P3 | UI overhaul (inserted by the 2026-08-18 scope decision) | approved | P1, P2 | (to write) |
| P4 | S9a — client GLB import (seed)            | proposed  | renewal    | archive/plans/pre-h1-letters/2026-08-14-graphics-h1-s9-asset-package.md |
| P5 | G5 — measured optimization and scale      | proposed  | renewal    | archive/plans/pre-h1-letters/2026-08-13-graphics-g4-procedural-architectural-meshes.md |
| …  | (future work re-registers here)           |           |            | |
```

## Hard gate

**This plan is the immediately next step after H1 lands — nothing else
proceeds first.** "H1 lands" includes the final H1 slice **S10.3 — camera
redesign** (successor domain×view shell + Camera Plan + framing envelope, from
the two 2026-08-18 design docs), sequenced by
[`2026-08-18-s10.1-camera-followup-sectioning-framing-and-camera-plan.md`](./2026-08-18-s10.1-camera-followup-sectioning-framing-and-camera-plan.md):
S10.1 closeout (B0 standalone placement + view-breakpoint Aim) → **S10.3** →
H1 sign-off → **this plan**. C1 (P2), S9a, G5, multi-story, material polish,
and any other post-H1 work are hard-gated behind this plan's execution. The
gate is recorded in `CURRENT.md`: "after the H1 gate, the renewal plan
executes before any other post-H1 work."

> **Amended 2026-08-18 by
> [`2026-08-18-scope-decision-close-h1-camera-first.md`](./2026-08-18-scope-decision-close-h1-camera-first.md):**
> "H1 lands" is redefined to **H1 sign-off after S10.1** (the camera redesign
> is not part of H1). This plan's trigger therefore fires now; the camera
> redesign re-registers as **P1** (first post-renewal work), C1 as **P2**,
> and the UI overhaul as **P3** (last) per the amended tracker seed in the
> scope decision; this plan itself becomes an unnumbered process row in the
> tracker. The S10.3 slice inside H1 is dissolved — no more S-numbers.

## Acceptance criteria

- No pre-renewal plan doc remains in the active `docs/plans/` root — every
  file is in `docs/archive/plans/pre-h1-letters/` except this plan.
- `docs/plans/README.md` exists and is the single status source; every plan
  doc's `**Status:**` matches the tracker.
- C1 is re-registered as `P2` with content unchanged and a tracker link.
- `CURRENT.md` points to the tracker as the plan source of truth and to `P1`
  (camera overhaul) as the first scheduled work, per the 2026-08-18 scope
  decision.
- No new plan doc contains a letter code; the naming rule is stated in the
  tracker README.

## Non-goals

- Re-planning or re-scoping any re-registered work (C1's content is fixed by
  its own approved doc).
- Renumbering git history or rewriting old docs — archives keep filenames.
- Touching application code, schemas, or benches.
- Choosing *what* to do beyond the committed P1–P3 order — the tracker just
  tracks; priorities remain the owner's call (the 2026-08-18 scope decision
  re-orders the first slots: camera P1, plan staging P2, UI overhaul P3; the
  north-star's S9a-first priority yields for those three).
