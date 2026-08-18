# Scope decision — close H1 after S10.1; post-renewal order: camera overhaul → plan staging → UI overhaul

**Date:** 2026-08-18
**Status:** Shipped (2026-08-18) — decision recorded, executed, and archived
**Supersedes:** the 2026-08-18 classification that placed the camera redesign
inside H1 as slice **S10.3** (sectioning strategy
§D of the P1 umbrella, §6
decision 2). **No more S-numbers after this decision.**
**Amends:** [`2026-08-17-plan-system-renewal.md`](./2026-08-17-plan-system-renewal.md) —
its hard-gate reading "H1 lands includes S10.3" is replaced by this decision's
definition of "H1 lands".
**Carries forward:** the pending **shell-inversion ratification** (sectioning
plan decision 1, scheduled for S10.1 closeout but never recorded) — it becomes
the gate of the camera overhaul's first increment (P1.1 below).

## 1. The decision (four moves)

1. **Close H1 after S10.1.** H1's locked scope — the 2026-08-15 revision:
   S0–S8 + S8.1/S8.2 + S10 + S10.2 + S10.1 — is fully shipped, including the
   S10.1 closeout (B0 standalone placement + view-breakpoint Aim; 1690 tests
   green, `svelte-check` 0, build clean, relic frozen, visitor pure). The
   camera redesign is **not** part of H1; the 2026-08-18 amendment that pulled
   it in is reverted. **H1 sign-off happens now.**
2. **Run the plan-system renewal immediately** (P1, already hard-gated as the
   next step). Its trigger "H1 lands" fires at S10.1 sign-off; its hard-gate
   text is amended (§4 of this document).
3. **Commit the post-renewal order:** camera overhaul **first** (P1), plan
   staging **second** (P2), UI overhaul **last** (P3). This restores the
   "camera lands first" guarantee that the S10.3-inside-H1 classification
   existed to provide — now expressed in the new tracker instead of inside H1.
   (This overrides the north-star's stated S9a-first priority for the first
   three slots — the owner's call, per the renewal's own non-goal.)
4. **Map the camera increments to the new tracking scheme.** The S10.3
   increment IDs (A0–A2, B1–B3, A3, polish) and their doc titles are archived
   with the letter era; the same content re-registers as **P1** with numeric
   increments P1.1–P1.7 (§5).

## 2. Why

- **Close H1 now.** H1's locked scope never required the camera redesign; it
  was reclassified into H1 on 2026-08-18 only to keep it ahead of the renewal
  gate. Signing off now is legitimate, ships a clean H1, and lets the renewal
  (already the hard-gated next step) run on schedule. The camera work is not
  lost — it re-registers (§3, §5).
- **Camera first.** The camera design docs were written 2026-08-18 against the
  live tree and are ready to execute; the shell-inversion ratification is
  time-sensitive (it touches freshly-landed S10.1 invariants); and the A/B
  workstreams are file-disjoint, so the umbrella can parallelize from day one.
  This is the same "camera lands first" priority the S10.3 classification
  guaranteed — pinned in the tracker instead of inside H1.
- **Plan staging second.** C1 is the "scene-content top-down surface" the H1
  workspace design explicitly rejected — it belongs on the **settled** matrix:
  after the camera shell defines cell ownership, after Camera Plan establishes
  the Plan-surface conventions (read-only backdrop discipline, filtered
  overlay profiles, hit-testing that never crosses domains), and after the
  reducer becomes domain-gated (C1's own machinery was built domain-generic
  for exactly this).
- **UI overhaul last.** Never redesign chrome before the architecture settles.
  The camera umbrella still ships a **light reconciliation pass** (P1.7) so
  the product is not visually raw through the camera + staging stretch; the
  full UI overhaul (P4) is one refresh pass over the settled surfaces, defined
  up front so it cannot balloon (§6).

## 3. What "close H1" means concretely

- **Shipped into sign-off:** S0 (shell) · S1 · S2 (+2.1) · S3 · S4 · S5 · S6 ·
  S7 · S8 (+8.1 room-agnostic placement, +8.2 room focus/cluster expansion) ·
  S10 technical extraction · S10.2 Camera Flow model · S10.1 UX/UI rework +
  closeout (B0 standalone placement, view-breakpoint Aim). G1–G4 also shipped
  under their own tracks.
- **Sign-off criteria met:** full suite green (1690), `svelte-check` 0,
  production build clean, `/museum/editor` relic frozen byte-for-byte,
  `/museum` visitor chunk graph free of editor markers, G3 benches unchanged.
- **Not part of H1 (unchanged):** S9a GLB import, S11 full import/export,
  S6.1 direct 3D wall/anchor picks, hover feed, framing futures
  (arrival/departure shots, custom weight curves) — now under the new tracker.

## 4. Tracker re-seed (amends the renewal skeleton)

The renewal's tracker skeleton numbered itself **P1** (C1 **P2**, S9a **P3**,
G5 **P4**) — which made the first *product* plan read as "P2". This decision
re-seeds: the renewal becomes an **unnumbered process row** (it creates the
tracker; a tracker cannot number its own bootstrap), and product plans start
at **P1** — camera P1, C1 P2, UI P3, S9a P4, G5 P5. Numbers are the tracker's
registration order, not a priority ranking; the execution order is pinned in
the table.

```text
| #  | Plan                                 | Status    | Depends on | Doc |
|----|--------------------------------------|-----------|------------|-----|
| —  | Plan-system renewal (process row — creates this tracker) | approved | H1 gate | 2026-08-17-plan-system-renewal.md |
| P1 | Camera overhaul                     | approved  | renewal    | 2026-08-18-P1-camera-overhaul.md |
| P2 | Plan staging mode                    | approved  | P1         | 2026-08-18-P2-plan-staging.md |
| P3 | UI overhaul                          | approved  | P1, P2     | 2026-08-18-P3-ui-overhaul.md |
| P4 | Client GLB import                    | proposed  | renewal    | 2026-08-18-P4-gltb-import.md |
| P5 | Measured optimization and scale      | proposed  | renewal    | 2026-08-18-P5-measured-optimization.md |
| …  | (future work re-registers here)      |           |            | |
```

Execution order is **P1 → P2 → P3**; P4/P5 and later entries do not start
until P1–P3 are scheduled or re-prioritized by the owner. **C1's content is
not re-scoped** — only its slot moves.

## 5. Camera overhaul (P1) — increments mapped to the new scheme

Same content as the S10.3 sectioning; new names. No letter codes; parallel
tracks are expressed in the depends-on column, not the IDs.

| New ID | Content | Old ID (archived) | Depends on |
|---|---|---|---|
| **P1.1** | Successor domain×view shell + shell contract; **gate = shell-inversion ratification** | B1 (was S10.3.1) | — |
| **P1.2** | `framingEnvelope` serialization + ordering validation + `resolveSceneDocument` threading | A0 | — |
| **P1.3** | Envelope sampler blend `w(p)` in `sampleCameraMotion` | A1 | P1.2 |
| **P1.4** | Envelope invariant + auto-managed/manual policy tests | A2 | P1.2, P1.3 |
| **P1.5** | Camera Plan surface + backdrop/visual-rule assertions | B2 + B3 (was S10.3.2) | P1.1 |
| **P1.6** | Framing authoring UX + FOV copy fix | A3 (was S10.3.3) | P1.2–P1.4, P1.1 |
| **P1.7** | Camera UI reconciliation pass (light — see §6) | S10.3.4 | P1.5, P1.6 |

Parallel execution: **P1.1 ∥ P1.2–P1.4** (shell vs engine, file-disjoint;
P1.1 must not touch `museum/navigation/**` or the visitor bundle, and the
engine track must not touch the shell). P1.5 after P1.1; **P1.6 converges**
after both tracks; P1.7 last. The S10.1 closeout increments (C0/B0) are
already shipped and are not part of P1.

Sources folded into the **P1 umbrella** (§A–§D, 2026-08-18): the successor
shell ratification (P1.1 gate) · the adopted framing model · the camera graph
workspace design · the sectioning and sequencing strategy. Originals deleted.

## 6. UI overhaul (P4) — scope pin

Approved as a **single reconciliation/refresh pass over the settled surfaces**,
not an open-ended redesign:

- Covers: the domain×view shell (P1.1), Camera Plan (P1.5), framing UX
  surfaces (P1.6), and Plan-staging surfaces (P2) — i.e. everything P1 + P2
  added, reconciled with the S10.1.7 tokens already landed.
- Must not: change behavior contracts, restructure the shell, or re-polish
  during P1/P2 (the P1.7 light pass covers interim presentation).
- Exit: one visual QA against the concept sketches with recorded deviations; a
  defined token/typography/icon state; no behavioral drift.

## 7. Naming rules (no more S10, no letter codes)

- S-numbers are retired with H1. The camera work is **P1 / P1.1–P1.7**;
  product plans start at P1 (the renewal is an unnumbered process row).
- Per the renewal (amended 2026-08-18): plan titles are
  `YYYY-MM-DD-P<number>-<slug>.md` — the P-number is assigned on registration
  and carried in the filename (e.g. `2026-08-18-P1-camera-overhaul.md`); no
  other letter codes; numbers are owned by `docs/plans/README.md` and never
  renumbered; docs archive on close.

## 8. Follow-ups (in order)

1. Write the **P1 umbrella doc** — **done 2026-08-18**
   (`2026-08-18-P1-camera-overhaul.md`, with the §5 increment table,
   sequencing, the P1.1 ratification gate, and the folded sources).
2. Amend the renewal doc's hard-gate text to this decision's "H1 lands"
   definition (this decision carries the amendment; apply it when P1 executes).
3. Run the renewal: create `docs/plans/README.md` (process row + P1–P3
   seed), archive the letter era (all 36+ pre-renewal docs including the S10.3
   set), re-register P1/P2/P3.
4. Update `docs/hand-off/CURRENT.md`: roadmap points at the tracker, P1
   (camera overhaul) first scheduled work, S10.3 references retired.

## 9. Non-goals (this decision changes no code)

- No application-code, schema, or bench changes — this is a planning
  decision only.
- No re-scoping of C1 (P2) or of the camera content (P1) — only naming, order,
  and umbrella.
- No re-litigation of the domain×view matrix (that is the P1.1 ratification
  gate, unchanged from the sectioning plan).

> **Amended 2026-08-18:** the six unimplemented letter-era plans were restored
> from archive and **composed into the P1–P5 umbrella docs** under the
> P-number naming: `2026-08-18-P1-camera-overhaul.md` ·
> `2026-08-18-P2-plan-staging.md` · `2026-08-18-P3-ui-overhaul.md` ·
> `2026-08-18-P4-gltb-import.md` · `2026-08-18-P5-measured-optimization.md`.
> Source content is folded in (§A–§D), originals deleted; §5's "docs move to
> archive" phrasing is superseded; §8 follow-up 1 is complete.
