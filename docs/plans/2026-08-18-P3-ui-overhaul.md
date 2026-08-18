# P3 — UI overhaul (umbrella)

**Date:** 2026-08-18
**Status:** Approved (2026-08-18 scope decision §6) — scope pinned
**Tracker:** [`docs/plans/README.md`](README.md) — **P3**, depends on: P1, P2

## Outcome

A single **reconciliation/refresh pass** over the settled surfaces — not an
open-ended redesign. The product stays visually raw through P1 + P2; this is
the refresh that follows them.

## Scope (pinned)

- **Covers:** the domain×view shell (P1.1), Camera Plan (P1.5), framing UX
  surfaces (P1.6), and Plan-staging surfaces (P2) — everything P1 + P2 added,
  reconciled with the **S10.1.7 tokens** already landed.
- **Must not:** change behavior contracts, restructure the shell, or re-polish
  during P1/P2 (the P1.7 light pass covers interim presentation).

## Increments

| ID | Content | Depends |
|---|---|---|
| **P3.1** | Visual QA against the concept sketches + recorded deviation list | P1, P2 |
| **P3.2** | Token / typography / icon reconciliation to a defined state | P3.1 |
| **P3.3** | Non-behavioral defect-fix pass (visual only) | P3.2 |

## Definition of done (P3 close)

- One visual QA vs the concept sketches with recorded deviations; a defined
  token/typography/icon state; **no behavioral drift**; suite green,
  `svelte-check` 0, build clean; tracker marks **P3 shipped**.
