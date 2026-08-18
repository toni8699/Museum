# Plan-System Renewal — Plan Tracking + Documentation Rework

**Date:** 2026-08-17
**Status:** Shipped (2026-08-18) — executed in full and archived. Originally
approved 2026-08-17 as the hard-gated transition step; revised 2026-08-18
(accepted amendment) to also own the **documentation rework** — progressive
disclosure, truth precedence, the five-doc model, and the strict doc templates
below (reviewer-approved 2026-08-18).
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
- **Lengthy live narratives** — the hand-off (`CURRENT.md`) runs 435 lines of
  per-slice shipped history; every live doc references and re-explains
  archived plans; ~30 links broke when the letter era moved.
- **No conflict resolution for agents** — when docs disagree, nothing says
  which source wins, so an agent can blend stale narratives into a fake
  state.

## The new system (rules going forward)

> **Amended 2026-08-18 (accepted amendment):** the rules below now include
> the documentation rework — progressive disclosure (rule 7), truth
> precedence (rule 8), and fixed doc templates (rule 9). The five-doc model
> and the strict templates follow in the next section.

1. **One flat namespace.** New plans are
   `docs/plans/YYYY-MM-DD-P<number>-<slug>.md` — the P-number is assigned on
   registration and written into the filename (e.g.
   `2026-08-18-P1-camera-overhaul.md`); no other letter codes in titles
   (**amended 2026-08-18**: filenames now carry the P-number).
2. **One tracker, single source of truth.** `docs/plans/README.md` holds the
   complete table: sequential number (`P1`, `P2`, …), plan, status,
   depends-on, and doc link. Numbers are assigned on registration and carried
   in filenames; the tracker owns them and never renumbers files.
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
7. **Progressive disclosure (context discipline).** `docs/README.md` is the
   **context router**: agents start there and load **only the referenced docs
   required for the task** — never preload the tree. Archive is **opt-in**
   historical evidence, not current product truth. Target consumption: 80–200
   relevant lines per task, not the whole live tree.
8. **Truth precedence.** When live docs conflict, this order wins (highest
   first):
   `source code + tests → CURRENT.md (current working-tree state) → active
   plan (intended change) → component contract (stable behavior) →
   architecture.md (ownership/boundaries) → north-star.md (direction) →
   archive (rationale only)`.
   Two separations: **status authority** is the tracker's job (the precedence
   chain resolves content truth, not what's next), and **direction/priority
   conflicts are owner decisions, not doc conflicts** (an agent must not
   "resolve" a product question by doc order).
9. **Fixed doc templates.** `CURRENT.md` and every `components/*.md` follow
   the strict templates in the next section. Live docs carry **no
   implementation history** — shipped narrative belongs to archive.

## Documentation rework — five-doc model (amendment 2026-08-18)

Target: the live tree is a small, task-routable surface; archive is cold
storage. The goal is **minimum authoritative context for one task**, not a
line-count target (350 live lines is acceptable if a task needs only 80–200
of them).

| Doc | Role | Target size |
|---|---|---|
| `docs/README.md` | **Context router**: folder map, product surface, roadmap (pointer to the tracker), read-what-you-need decision tree, meta (how to write the hand-off + next plan), **single archive link** | ~80–100 |
| `docs/plans/README.md` | **Tracker**: status, execution order, one-line archive stubs. The only place that names what is archived | ~95 |
| `docs/hand-off/CURRENT.md` | **Live slice**: working-tree delta only — strict template below | ~50–80 |
| `docs/architecture.md` | **Pointer doc**: ownership/boundaries (editor vs relic) + links to `components/*.md` and key source paths; no plan references | ~40 |
| `docs/north-star.md` | **Vision only**: final product vision, principles, frozen-relic rules; no priorities, no plan references | ~30 |

**Strict CURRENT.md template** (no background; no rationale unless needed to
avoid a mistake):

```text
## Working tree      — what is actually in the tree right now (uncommitted)
## Next action       — pointer to the tracker + the immediate artifact + any gate
## Verification      — test count, svelte-check, build state
## Known bugs        — live defects, one line each
## Traps             — terse gotchas that cost debugging time
## Non-negotiables   — relic frozen, no commits unless asked, visitor purity
```

**Strict component template** (`components/*.md`):

```text
Purpose · Current contract · Ownership / source paths · Invariants · Known traps
```

No implementation history in either.

**Context-router decision tree** (condensed, for `docs/README.md`):

```text
Always read: docs/README.md

Implement current slice → CURRENT.md → plans/README.md → active plan → relevant component
Work on a surface    → relevant component doc (CURRENT.md only if it touches current work)
Architecture question → architecture.md → relevant component doc
Product/design question → north-star.md → relevant component doc
Historical question   → archive/ (single link; opt-in)
```

**Context discipline rule** (AGENTS.md hard rule + README restatement): *Do not
preload the documentation tree. Start at the router, identify the task
surface, then read only referenced documents. Archive is historical evidence,
not current product truth.*

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

**Documentation-rework steps (amendment 2026-08-18):**

7. **Rewrite `docs/README.md`** as the context router: folder map, product
   surface, roadmap (pointer to the tracker, never a copy), read-what-you-need
   decision tree, meta (how to write the hand-off + next plan — reference the
   archived S10.1 plan's 7-point increment-brief template), single archive
   link, and the context-discipline + truth-precedence rules.
8. **Slim `docs/hand-off/CURRENT.md`** to the strict template (live delta
   only); shipped narrative is **not** copied in — archive owns it.
9. **Strip `docs/north-star.md`** to vision + principles + relic rules;
   the priority table is removed (priorities live in the tracker).
10. **Make `docs/architecture.md` a pointer doc** — ownership/boundaries +
    component links; drop every plan reference.
11. **Sweep `docs/components/*.md`** to the strict template; remove plan
    references; retire the `*.original.md` duplicates (and the
    `docs/*.original.md` backups) to archive.
12. **Update `AGENTS.md`**: add progressive-disclosure + truth-precedence as
    a hard rule, and refresh the stale `Where to look` table (tracker link;
    no archived-plan links).

## Tracker skeleton (seeded by this plan)

```text
| #  | Plan                                      | Status    | Depends on | Doc |
|----|-------------------------------------------|-----------|------------|-----|
| —  | Plan-system renewal + documentation rework (this plan — process row, creates this tracker and the five-doc model) | approved | H1 gate | 2026-08-17-plan-system-renewal.md |
| P1 | Camera overhaul | approved | renewal | 2026-08-18-P1-camera-overhaul.md |
| P2 | Plan staging mode — 2D furnishing         | approved  | P1         | 2026-08-18-P2-plan-staging.md |
| P3 | UI overhaul (inserted by the 2026-08-18 scope decision) | approved | P1, P2 | (to write) |
| P4 | Client GLB import                         | proposed  | renewal    | 2026-08-18-P4-gltb-import.md |
| P5 | G5 — measured optimization and scale      | proposed  | renewal    | archive/plans/pre-h1-letters/2026-08-13-graphics-architecture-roadmap.md |
| …  | (future work re-registers here)           |           |            | |
```

## Hard gate

**This plan is the immediately next step after H1 lands — nothing else
proceeds first.** "H1 lands" includes the final H1 slice **S10.3 — camera
redesign** (successor domain×view shell + Camera Plan + framing envelope, from
the two 2026-08-18 design docs), sequenced by
[`2026-08-18-P1-camera-overhaul.md`](./2026-08-18-P1-camera-overhaul.md):
S10.1 closeout (B0 standalone placement + view-breakpoint Aim) → **S10.3** →
H1 sign-off → **this plan**. C1 (P2), S9a, G5, multi-story, material polish,
and any other work are hard-gated behind this plan's execution. The
gate is recorded in `CURRENT.md`: "after the H1 gate, the renewal plan
executes before any other work."

> **Amended 2026-08-18 by
> [`2026-08-18-scope-decision-camera-first.md`](./2026-08-18-scope-decision-camera-first.md):**
> "H1 lands" is redefined to **H1 sign-off after S10.1** (the camera redesign
> is not part of H1). This plan's trigger therefore fires now; the camera
> redesign re-registers as **P1** (first post-renewal work), C1 as **P2**,
> and the UI overhaul as **P3** (last) per the amended tracker seed in the
> scope decision; this plan itself becomes an unnumbered process row in the
> tracker. The S10.3 slice inside H1 is dissolved — no more S-numbers.

> **Amended 2026-08-18 (owner decision):** the six **unimplemented** letter-era
> plans were restored from archive and **composed into the P1–P5 umbrella
> docs** — all source content folded in (P1 §A–§D, P2 §A, P4 §A, P5 §A),
> originals deleted. Only shipped/superseded docs archive. Acceptance
> criterion 1 is amended accordingly.

## Acceptance criteria

- No **shipped/superseded** pre-renewal plan doc remains in the active
  `docs/plans/` root — every shipped doc is in
  `docs/archive/plans/pre-h1-letters/`, except this plan and the five
  umbrella plans (P1–P5) whose source content was folded in 2026-08-18.
- `docs/plans/README.md` exists and is the single status source; every plan
  doc's `**Status:**` matches the tracker.
- C1 is re-registered as `P2` with content unchanged and a tracker link.
- `CURRENT.md` points to the tracker as the plan source of truth and to `P1`
  (camera overhaul) as the first scheduled work, per the 2026-08-18 scope
  decision.
- No new plan doc contains a letter code; the naming rule is stated in the
  tracker README.
- `docs/README.md` is the context router: decision tree, roadmap pointer,
  meta, single archive link, and the context-discipline + truth-precedence
  rules.
- `CURRENT.md` is template-faithful and ≤ ~80 lines; no live doc carries
  implementation history.
- `north-star.md` is vision-only; `architecture.md` is a pointer doc;
  `components/*.md` are template-faithful with zero plan references.
- `AGENTS.md` has the hard rule and a refreshed `Where to look` table.
- No live doc references archived plans except the single README link + the
  tracker's one-line stubs.
- Live docs ≈ 350 lines total; a task should need only 80–200 relevant.

## Non-goals

- Re-planning or re-scoping any re-registered work (C1's content is fixed by
  its own approved doc).
- Renumbering git history or rewriting old docs — archives keep filenames.
- Touching application code, schemas, or benches.
- Rewriting archive content or re-scoping archived plans — the rework only
  points to archive; the older archive trees (museum-editor/superpowers)
  stay untouched.
- Choosing *what* to do beyond the committed P1–P3 order — the tracker just
  tracks; priorities remain the owner's call (the 2026-08-18 scope decision
  re-orders the first slots: camera P1, plan staging P2, UI overhaul P3; the
  north-star's S9a-first priority yields for those three).
