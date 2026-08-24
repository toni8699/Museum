# Model assessment — pipeline routing (living doc)

**Created:** 2026-08-20 · **Owner:** plan owner
**Purpose:** per-increment difficulty (1–100) and model routing for the active
pipeline. **This table is living — update/remove rows as increments ship;
never let it go stale.** P3.4/P3.5 were marked undone on 2026-08-24 and moved into the proposed P3B
follow-up as a low-priority, non-blocking acceptance tail after core P3B. Status authority remains
the [tracker README](README.md).

## Methodology (brief)

- **Difficulty 1–100 = required Intelligence Index.** Capability yardstick
  from the artificialanalysis.ai GPT‑5.6 launch analysis (snapshot 2026-07-11):
  the Sol/Terra/Luna variants score index 33 (Luna low) → 59 (Sol max).
- **Capability % = `index / 59`** relative to Sol max (= 100%). Luna max =
  86% of Sol max; Sol high = 95%; Sol xhigh = 98%.
- **Model tier = cheapest model clearing the required index.** Luna effort
  retained as the capability reference; Sol tiers used above the Luna ceiling.
- **DeepSeek V4 Flash substitution (2026-08-20):** Luna max ≈ DeepSeek V4
  Flash. Any increment rated at **Luna difficulty (any effort)** routes to
  **DeepSeek V4 Flash** — the Luna effort stays in the table as the reference,
  it is not replaced. Sol tiers unchanged.
- **Margin** = chosen tier index − required index. Margin 0 → escalate on
  first failure; don't pre-pay.
- **Dominated tiers excluded:** Terra (all efforts) and Sol low — never on the
  cost/intelligence frontier.
- The index is a general reasoning measure, not exact per task (±3 index
  uncertainty). Close crossovers need a workload A/B, per the source guide.

## Tier table

| Req. index | Luna effort (ref) | Capability % of Sol max | Recommendation |
|---|---|---|---|
| ≤33 | low | 56% | DeepSeek V4 Flash |
| 34–38 | medium | 64% | DeepSeek V4 Flash |
| 39–46 | high | 78% | DeepSeek V4 Flash |
| 47–49 | xhigh | 83% | DeepSeek V4 Flash |
| 50–51 | max | 86% | DeepSeek V4 Flash |
| 52–54 | — | 92% | Sol medium |
| 55–56 | — | 95% | Sol high |
| 57–58 | — | 97–98% | Sol xhigh |
| 59 | — | 100% | Sol max |

## Assessment — active pipeline

Shipped as of 2026-08-24 (not assessed here): **P1.1–P1.9, P1.7 review-fixes close-out, P3.1–P3.3, P3.6, P6, P7.4, P8 S1–S6.** P3B core is proposed and assessed below; P3.4/P3.5 remain its separate deferred acceptance tail.

| Increment | Difficulty (req. index) | Capability % | Luna ref | Recommendation | Margin | Status |
|---|---|---|---|---|---|---|
| **P1.6** | 56 | 95% | — | Sol high | 0 | shipped |
| **P1.7** | 45 | 76% | Luna high | DeepSeek V4 Flash | +1 | shipped |
| **P2.1** | 48 | 81% | Luna xhigh | DeepSeek V4 Flash | +1 | shipped |
| **P2.2** | 53 | 90% | — | Sol medium | +1 | shipped |
| **P2.3** | 55 | 93% | — | Sol high | +1 | shipped |
| **P2.4** | 38 | 64% | Luna medium | DeepSeek V4 Flash | 0 | shipped |
| **P3.1** | 52 | 88% | — | Sol medium | +2 | shipped |
| **P3.2** | 51 | 86% | Luna max | DeepSeek V4 Flash (→ Sol medium if typography/icon judgment bites) | 0 | shipped |
| **P3.3** | 45 | 76% | Luna high | DeepSeek V4 Flash | +1 | shipped |
| **P3.4** | 54 | 92% | — | Sol medium (selection-before-menu + kebab command reuse) | 0 | undone — P3B.7b deferred tail; low priority, non-blocking |
| **P3.5** | 52 | 88% | — | Sol medium (depends P8 S2–S4; preview-FSM boundary + guards) | +2 | undone — P3B.7b deferred tail; low priority, non-blocking |
| **P3B.4a** | 53 | 90% | — | Sol medium (two Plan surfaces + pure grid/ruler/scale helpers + visual QA) | +1 | proposed — core Slice A |
| **P3B.1** | 55 | 93% | — | Sol high (snap-authority discovery/contract gate; no invented implementation) | +1 | proposed — core Slice B, blocked gate |
| **P3B.2** | 49 | 83% | Luna xhigh | DeepSeek V4 Flash (DOM/SVG hit isolation + camera API integration) | 0 | proposed — core Slice B |
| **P3B.3** | 43 | 73% | Luna high | DeepSeek V4 Flash (interaction states, cancellation, mount transitions) | +3 | proposed — core Slice B |
| **P3B.4** | 48 | 81% | Luna xhigh | DeepSeek V4 Flash (orientation behavior and non-mutation fixtures) | +1 | proposed — core Slice B |
| **P3B.5** | 54 | 92% | — | Sol medium (cross-surface preview affordances, scope labels, existing FSM boundaries) | 0 | proposed — core Slice C |
| **P3B.6** | 47 | 80% | Luna xhigh | DeepSeek V4 Flash (sequence adjacency derivation + single labeled edge entry) | +2 | proposed — core Slice C |
| **P3B.7a** | 52 | 88% | — | Sol medium (cross-slice regression, accessibility, independent selection/preview labels) | +2 | proposed — core QA |
| **P3B.7b** | 54 | 92% | — | Sol medium (combined deferred P3.4/P3.5 acceptance matrix) | 0 | deferred — non-blocking tail |
| **P3B.8** | 48 | 81% | Luna xhigh | DeepSeek V4 Flash (browser QA across four shell views and visual states) | +1 | proposed — core browser QA |
| **P4.1** | 54 | 92% | — | Sol medium | 0 | open |
| **P4.2** | 49 | 83% | Luna xhigh | DeepSeek V4 Flash | 0 | open |
| **P4.3** | 56 | 95% | — | Sol high | 0 | open |
| **P5.1** | 53 | 90% | — | Sol medium | +1 | open |
| **P5.2** | 57 | 97% | — | Sol xhigh | +1 | open |
| **P5.3** | 55 | 93% | — | Sol high | +1 | open |
| **P5.4** | 57 | 97% | — | Sol xhigh | +1 | open |
| **P5.5** | 53 | 90% | — | Sol medium | +1 | open |
| **P7.1** | 55 | 93% | — | Sol high | +1 | open |
| **P7.2** | 33 | 56% | Luna low | DeepSeek V4 Flash | 0 | open |
| **P7.3** | 37 | 63% | Luna medium | DeepSeek V4 Flash | +1 | open |
| **P7.5** | 57 | 97% | — | Sol xhigh | +1 | open |
| **P7.6** | 36 | 61% | Luna medium | DeepSeek V4 Flash (compile-gated find-replace at ~10× P7.2's volume; gate + name-map decisions already made in the brief) | +1 | open |
| **P8.S1** | 47 | 80% | Luna xhigh | DeepSeek V4 Flash | +2 | shipped |
| **P8.S2** | 54 | 92% | — | Sol medium | 0 | shipped |
| **P8.S3** | 49 | 83% | Luna xhigh | DeepSeek V4 Flash | 0 | shipped |
| **P8.S4** | 48 | 81% | Luna xhigh | DeepSeek V4 Flash | +1 | shipped |
| **P8.S5** | 46 | 78% | Luna high | DeepSeek V4 Flash | 0 | shipped |
| **P8.S6** | 33 | 56% | Luna low | DeepSeek V4 Flash | 0 | shipped |
| **D1** | 59 | 100% | — | Sol max | 0 | out of tracker — P4 companion, own plan |

**P3B routing summary:** the hardest core item is the B.1 snap-authority
discovery gate (55 → Sol high). Plan parity (53), preview reconciliation (54),
and cross-slice QA (52) route to Sol medium; the smaller orientation/edge/browser
slices fit DeepSeek V4 Flash. If B.1 finds no canonical authority, only B.1–B.4
pause; Slice A and Slice C remain independently runnable. P3B.7b inherits the
harder existing P3.4 estimate and remains a deferred, non-blocking tail.

**Capability spread check:** P1.6 (56, 95%) vs P1.7 (45, 76%) — 19% capability
gap for roughly 5× task cost. Pay the jump only where the threshold matters.
