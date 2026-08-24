# Model assessment — pipeline routing (living doc)

**Created:** 2026-08-20 · **Owner:** plan owner
**Purpose:** estimate each task's required intensity on a direct 1–100 scale,
where **Sol Max = 100**, then route it using the supplied GPT‑5.6 model-selection
analysis. The score is task intensity, not a benchmark percentage. This table
is living; keep statuses aligned with [`README.md`](README.md).

## Methodology

- **Sol Max is the 100-point reference.** It is the most intensive setting, but
  the routing policy does not require using Sol Max.
- Estimate the task's required intensity from ambiguity, cross-system scope,
  consequence of failure, design judgment, and verification burden.
- Compare that task intensity to the approximate ceiling of each useful model
  setting from the supplied analysis:

| Setting | Intelligence index | Capacity vs Sol Max |
|---|---:|---:|
| Luna low | 33 | 56% |
| Luna medium | 38 | 64% |
| Luna high | 46 | 78% |
| Luna xhigh | 49 | 83% |
| Luna max | 51 | 86% |
| Sol medium | 54 | 92% |
| Sol high | 56 | 95% |
| Sol xhigh | 58 | 98% |
| Sol max | 59 | 100% |

- Choose the cheapest setting whose capacity clears the task score. Treat
  Terra as dominated by the Luna/Sol frontier unless workload evidence shows a
  specific latency, style, reliability, or provider advantage.
- **No task is automatically routed to Sol Max.** Sol Max is reserved only as
  an explicit owner-approved exceptional override; normal routing tops out at
  Sol xhigh.
- Start at the cheapest plausible setting and escalate on concrete capability
  failure, not prompt length or stylistic preference.

## Routing interpretation

| Task intensity | Default route | Rationale |
|---:|---|---|
| 1–55 | Luna setting selected by the capacity table | Bounded/mechanical work or established patterns |
| 56–86 | Sol medium/high/xhigh selected by the capacity table | Cross-surface implementation, state integration, or broad verification |
| 87–100 | Sol xhigh by default; Sol Max only by explicit exception | Near-frontier ambiguity or high consequence; avoid reflexive Max use |

The numeric score remains a task estimate. The capacity table determines the
model setting; it is not a claim that benchmark index points equal guaranteed
success percentages.

## Assessment — active pipeline

| Increment | Intensity / 100 | Recommended setting | Status / rationale |
|---|---:|---|---|
| **P1.6** | 78 | Sol high | shipped — framing authoring and persistence integration |
| **P1.7** | 68 | Sol medium | shipped — cross-surface camera UI reconciliation |
| **P2.1** | 62 | Sol medium | shipped — layout staging foundation |
| **P2.2** | 70 | Sol medium | shipped — room/object staging interaction |
| **P2.3** | 74 | Sol medium | shipped — staging selection and mutation boundaries |
| **P2.4** | 48 | Luna high | shipped — bounded staging polish and guards |
| **P3.1** | 73 | Sol medium | shipped — structural visual reconciliation |
| **P3.2** | 64 | Sol medium | shipped — token/typography/icon architecture |
| **P3.3** | 52 | Luna high | shipped — bounded interaction-state polish |
| **P3.4** | 70 | Sol medium | undone — P3B.7b deferred tail; broad context-menu acceptance |
| **P3.5** | 72 | Sol medium | undone — P3B.7b deferred tail; camera-menu identity/FSM coverage |
| **P3B.4a** | 68 | Sol medium | proposed — two Plan surfaces, pure helpers, visual/browser QA |
| **P3B.1** | 92 | Sol xhigh | approved/unblocked — owner-approved six-face contract; instant snap, preview-disabled state, shared threshold, and fallback API required |
| **P3B.2** | 61 | Sol medium | proposed — isolated DOM/SVG hit targets and camera integration |
| **P3B.3** | 44 | Luna high | proposed — interaction states, cancellation, mount behavior |
| **P3B.4** | 59 | Sol medium | proposed — orientation fixtures and non-mutation assertions |
| **P3B.5** | 76 | Sol high | proposed — cross-surface preview controls, labels, timeline scope |
| **P3B.6** | 67 | Sol medium | proposed — canonical adjacency plus chooser behavior |
| **P3B.7a** | 79 | Sol high | proposed — cross-slice regression and accessibility coverage |
| **P3B.7b** | 73 | Sol medium | deferred — combined P3.4/P3.5 acceptance matrix |
| **P3B.8** | 63 | Sol medium | proposed — browser QA across all four shell views |
| **P4.1** | 70 | Sol medium | open |
| **P4.2** | 58 | Sol medium | open |
| **P4.3** | 80 | Sol high | open |
| **P5.1** | 65 | Sol medium | open |
| **P5.2** | 84 | Sol high | open |
| **P5.3** | 78 | Sol high | open |
| **P5.4** | 86 | Sol high | open |
| **P5.5** | 67 | Sol medium | open |
| **P7.1** | 82 | Sol high | open |
| **P7.2** | 32 | Luna low/medium | open |
| **P7.3** | 41 | Luna high | open |
| **P7.5** | 88 | Sol xhigh | open |
| **P7.6** | 46 | Luna high | open |
| **P8.S1** | 58 | Sol medium | shipped |
| **P8.S2** | 75 | Sol medium | shipped — preview scope/playhead ownership |
| **P8.S3** | 61 | Sol medium | shipped — edge preview integration |
| **P8.S4** | 57 | Sol medium | shipped — timeline and transport integration |
| **P8.S5** | 54 | Luna xhigh | shipped — interaction matrix and preservation |
| **P8.S6** | 38 | Luna medium | shipped — bounded terminology/contract cleanup |
| **D1** | 96 | Sol xhigh | out of tracker — P4 companion, own plan; Max only by exception |

## P3B routing summary

- **P3B.1 (92)** is the hardest item because it may require a shell/view
  contract if no canonical snap authority exists. Route it to Sol xhigh, not
  Sol Max; the task must stop rather than improvise if the authority is absent.
- **P3B.5 (76)** and **P3B.7a (79)** need Sol high because they cross multiple
  surfaces and require behavioral/accessibility verification.
- **P3B.4a (68)**, **P3B.6 (67)**, **P3B.7b (73)**, and **P3B.8 (63)** fit Sol
  medium because their boundaries and existing primitives are known.
- **P3B.2 (61)** and **P3B.4 (59)** are Sol-medium integration/fixture tasks;
  **P3B.3 (44)** is bounded Luna-high work.
- If P3B.1 finds no authority, pause only B.1–B.4. Slices A and C continue
  independently. No P3B item requires Sol Max by default.

The supplied analysis supports this conservative policy: Luna max reaches 86%
of Sol Max capability at much lower cost, Sol xhigh reaches 98%, and the final
Sol Max point is a premium specialist tail. Use Sol Max only when a measured
workload shows that the last increment changes acceptance or consequence.
