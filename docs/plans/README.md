# Plan tracker — single source of truth for plan status

**Created:** 2026-08-18 · **Pruned:** 2026-09-05 (owner decision: shipped
history lives on disk under `docs/archive/plans/`, not in this file).
**Status enum:** `proposed | approved | in-progress | shipped | archived`.
The tracker is authoritative when a plan doc's `**Status:**` drifts.

## Rules

1. **One flat namespace.** New plans are
   `docs/plans/YYYY-MM-DD-P<number>-<slug>.md` — the P-number is assigned on
   registration and written into the filename (e.g.
   `2026-08-18-P1-camera-overhaul.md`). No letter codes beyond the P-number.
2. **Numbers live in filenames and this tracker.** Sequential numbers
   (`P1`, `P2`, …) are assigned on registration and carried in the filename;
   this tracker is the register that owns them (status, depends-on, order)
   and never renumbers files. The renewal that created the tracker is an
   **unnumbered process row** (a tracker cannot number its own bootstrap).
3. **Dependencies by tracker number**, never by letter family.
4. **Archive on close.** When a plan ships, its doc moves to
   `docs/archive/plans/` and this tracker lists stubs for the **5 most recent
   archived artifacts only** (see `Archived plans`). Older history stays on
   disk, unlisted (owner decision 2026-09-05).
5. **Re-registration, not re-lettering.** Approved-but-unscheduled work keeps
   its content and gains a tracker number; that content lives **folded into
   the plan's umbrella doc**. Only shipped/superseded docs archive.
6. Execution order is **pinned in the table's depends-on column**, not implied
   by the numbers (registration order ≠ priority).
7. **No narrative in this tracker.** Rows and stubs stay one line each;
   shipped detail lives in the plan doc (archived on close), never here.
8. **Collapse on ship.** Archiving a doc and collapsing its Active row happen
   in the same edit — shipped rows never linger in the table.

## Model routing

Per-increment difficulty (1–100) and model routing live in the living
assessment doc — [`model-assessment.md`](model-assessment.md) — not in this
tracker. Update it as increments ship.

Policy rules:

- **DeepSeek V4 Flash substitution (2026-08-20):** Luna max ≈ DeepSeek V4
  Flash. Any increment rated at **Luna difficulty (any effort)** routes to
  **DeepSeek V4 Flash** — the Luna effort is retained as the capability
  reference, not replaced. Sol tiers unchanged.
- **Never route to Terra (all efforts) or Sol low** — dominated points on the
  cost/intelligence frontier.
- **Escalate by evidence, not habit:** start at the cheapest tier clearing the
  required index; escalate one tier on a demonstrated capability failure,
  sending the stronger model the original failure state (not a summary).
- **Margin** = chosen tier index − required index. Margin 0 → escalate on
  first failure; don't pre-pay.
- Adjacent tiers differ 2–8% capability for 1.3–2.6× per-task cost — pay the
  jump only when the threshold matters.

## Active (live work only)

| # | Plan | Status | Depends on | Doc |
|---|------|--------|------------|-----|
| P13 | Sequence stop-at-node playback | proposed — nice-to-have, unscheduled (owner 2026-08-27) | P12 | [2026-08-27-P13-stop-at-node-playback.md](2026-08-27-P13-stop-at-node-playback.md) |
| P19 | First project persistence | shipped 2026-09-03 — live smoke passed; doc archival pending | P18 | [umbrella](2026-08-30-P19-project-persistence.md) · [P19.4 annex](2026-09-02-P19.4-editor-shell.md) |
| P20 | Project Asset Registry + R2 | shipped 2026-09-04 — local smoke vs real R2; prod-topology smoke deferred; doc archival pending | P19 | [umbrella](2026-08-19-P20-Project-assets-registry-R2.md) · [S2](2026-09-03-P20.2-spatial-registry-integration.md) · [S3](2026-09-03-P20.3-texture-durable-conversion.md) · [S4](2026-09-03-P20.4-load-runtime-resolution.md) |
| P21 | Unified Project Shell + Spatial UI reconciliation | in-progress — P21.1–P21.4 complete; P21.5 pending; final acceptance gate pending | P20 | [umbrella](2026-09-04-P21-unified-project-shell-spatial-reconciliation.md) · [P21.4](2026-09-05-P21.4-preview-project-flows.md) · [P21.5](2026-09-05-P21.5-ui-polish-pass.md) |
| — | Branch rejoin — experiment, no schedule | proposed | P8 conceptually | [2026-08-21-branch-rejoin-experiment.md](2026-08-21-branch-rejoin-experiment.md) |
| … | future work re-registers here | | | |

**Pending archival (live files for shipped work — not tracked rows; owner follow-up):**

- Done 2026-09-05: P7 umbrella + P7.6 annex + P8 umbrella moved to
  `docs/archive/plans/` (moved as a set — the annex link at umbrella `:1179`
  is relative and survives); byte-identical P11.2 annex deleted (archive holds
  the copy); 0-byte P12.2 live husk deleted (archive holds the content).
- Reconcile-then-delete (live copy has **diverged** from the archived copy —
  diff before dropping either side): `2026-08-18-P1-camera-overhaul.md`.
- Done 2026-09-05: `hand-off/designer-context-packet.md` moved to
  `docs/archive/designer-context-packet-2026-09-03.md` (one-off 2026-09-03
  packet; its output already landed as the P21.5 brief; `hand-off/` holds
  `CURRENT.md` only per the folder map).
- Done 2026-09-05: superseded `Design-specs/Camera-plan-objects-brief.md`
  moved to `docs/archive/plans/`, stub left behind pointing at frozen
  `Camera-layout-design.md`.
- P19/P20 umbrellas + briefs stay live until P21 closeout, then archive per Rule 4.

## Gate status

Ship narrative for P1–P20 (execution order, scope decisions, the P12/P3B hard
gate) now lives in the archived docs, not here.

- Next: P21.5 polish → final acceptance gate (full Vitest + `check` + `build`
  + bundle gates + six-PNG comparison + axe sweep), then the P22 brief.
- Deferred / non-blocking: P3B.7b (incl. the P3.4/P3.5 acceptance tail).
- Proposed / unscheduled: P13, branch rejoin.
- Shipped baseline: P12 + core P3B gate 2026-08-28; P14–P18 extraction slice;
  P19 live smoke 2026-09-03; P20 local-vs-R2 smoke 2026-09-04
  (production-topology smoke deferred).

## Archived plans (recent 5 only)

- `archived → [2026-08-31-scope-decision-experience-interaction-boundary.md](../archive/plans/2026-08-31-scope-decision-experience-interaction-boundary.md)` (scope decision — Experience/Interaction authoring boundary; ratified 2026-08-31)
- `archived → [2026-08-30-P18-backend-provisioning.md](../archive/plans/2026-08-30-P18-backend-provisioning.md)` (shipped 2026-08-30)
- `archived → [2026-08-30-P17-app-split.md](../archive/plans/2026-08-30-P17-app-split.md)` (shipped 2026-08-30)
- `archived → [2026-08-30-P16-project-model-layout-core-extraction.md](../archive/plans/2026-08-30-P16-project-model-layout-core-extraction.md)` (shipped 2026-08-30)
- `archived → [2026-08-29-P15-camera-core-extraction.md](../archive/plans/2026-08-29-P15-camera-core-extraction.md)` (shipped 2026-08-30 — S0–S4 complete)

Older history — P14 and earlier, the letter-era A–H tracks, prior scope
decisions — lives on disk under `docs/archive/plans/` (renewal era) and
`docs/archive/plans/pre-h1-letters/` (letter era), unlisted by owner decision
2026-09-05. When a plan ships, its stub enters this list and the oldest stub
drops off (Rule 4).

## Long-term roadmap (direction only — not registered)

Ratified 2026-08-31 with the north-star amendment: the project shell has two
primary creative modes — **Spatial** (the current editor) and **Experience**
(future) — plus project-level **Assets** and **Publish** surfaces, all
operating on one portable project truth. Direction lives in
[`../north-star.md`](../north-star.md) and its final conceptual hierarchy;
this section records only the sequencing tiers. Nothing here is a registered
P-number; the numbered tiers below are next-free-number reservations
(direction only) that become registered only when their plan docs are filed
(owner roadmap revised 2026-09-03):

- **Now — Design track in parallel** (no P-number; design only — no major
  implementation yet): product flow / IA / shell / Hub / editor UX concepts
  running alongside the implementation tiers. Concepts and specs land in
  [`../Design-specs`](../Design-specs/); nothing commits to implementation
  until its plan doc is filed.
- **P20 — Project Asset Registry + R2.** Shipped 2026-09-04 (local live smoke
  vs real R2 passed; production-topology smoke deferred).
- **P21 — Product shell + Project Hub + core editor UX polish.** In progress —
  see the Active table (P21.1–P21.4 complete; P21.5 + final gate pending).
- **P22 — Basic Publish + visitor runtime.** Publish an owned project, resolve
  project assets, hosted visitor-safe output, and basic preview/publish
  status. Direction only; its brief is written once P21 closes — after the
  P21.5 UI polish pass, not before.
- **P23 — Typed DB layer.** A typed database layer (Drizzle/Kysely-style
  schema-owned types, typed query access) once the raw-parameterized-SQL
  surface from P19–P22 — projects, versions, assets — plus P25+ tenant shapes
  justify it. Deliberate deferral: P19/P20 keep their no-ORM pins; no ORM,
  query builder, or generic storage package before this tier.
- **P24 — Experience foundation.** Navigation · Content · Interactions,
  referencing existing Spatial / camera / assets work. Direction only; the
  long-term Experience bullet below holds the remaining detail.
- **P25+ — Expansion.** Sharing / teams, domains, reusable My Assets, provider
  imports, richer Publish, and collaboration / billing if needed. Not one
  work item — each entry gets its own P-number and plan doc when scheduled,
  starting at P25.

- **Current / near-term platform work** (grounded in active rows): core
  extraction / app boundaries (P15–P17 shipped), backend provisioning (P18
  shipped), project Save/Load + first Google OIDC + app-owned secure-session
  integration + single-user ownership (P19 shipped 2026-09-03 — live smoke
  passed), then the numbered tier sequence above:
  R2-backed project assets with Spatial integration (P20, shipped 2026-09-04 —
  local live smoke vs real R2; production-topology smoke deferred), the
  product shell + Project Hub + editor UX polish (P21, including the P21.5
  UI polish pass before P22), the basic publish/visitor-runtime boundary
  (P22), the typed DB layer (P23), the
  Experience foundation (P24), and expansion (P25+). The design track runs
  in parallel from Now. Auth UX/hardening and richer permissions ride with
  the P25+ collaborative tier, not P19/P20.
- **Medium-term product infrastructure** (possible direction, unscheduled):
  hosted project loading and published project versions ride with P22;
  portable project/export hardening, project asset management, and generic
  visitor/player extraction when genuinely needed.
- **Long-term Experience work** (unscheduled beyond the P24 foundation):
  Experience mode shell, `ExperienceDocument` design, visitor menu authoring,
  destination bindings, contextual titles/info cards, visitor preferences,
  reduced-motion behavior, the Experience asset picker, the developer runtime
  SDK, headless runtime, and community/gallery surfaces. Experience is
  composed of **Navigation · Content · Interactions**; Interactions are an
  authoring lens within Experience (an `Event → Target → Action` semantic
  model), never a separate mode — ratified 2026-08-31
  ([scope decision](../archive/plans/2026-08-31-scope-decision-experience-interaction-boundary.md)).

Constraints: no Experience implementation tickets are created now, and
Experience work must not displace persistence or Spatial completion.
`ExperienceDocument` gets no codecs, migrations, or backend endpoints.
R2 and managed-auth integration remain out of P18. P19 includes the first
Google OIDC (Authorization Code + PKCE) + app-owned secure-session
integration and single-user ownership required for Save/Load; broader auth
UX/hardening and richer permissions remain later.
P19 has no Experience schema and no R2.

P19–P22 stay raw parameterized SQL: the no-ORM pins in the P19/P20 plans are
scope-limited to those tiers and are revisited only by the P23 typed-DB
tier. P21–P23 hold no Experience schema; Experience work remains P24+.
