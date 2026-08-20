# Model assessment — pipeline routing (living doc)

**Created:** 2026-08-20 · **Owner:** plan owner
**Purpose:** per-increment difficulty (1–100) and model routing for the active
pipeline. **This table is living — update/remove rows as increments ship;
never let it go stale.** Status authority remains the
[tracker README](README.md).

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

Shipped as of 2026-08-20 (not assessed here): **P1.1–P1.5, P6, P7.4.**

| Increment | Difficulty (req. index) | Capability % | Luna ref | Recommendation | Margin | Status |
|---|---|---|---|---|---|---|
| **P1.6** | 56 | 95% | — | Sol high | 0 | open |
| **P1.7** | 45 | 76% | Luna high | DeepSeek V4 Flash | +1 | open |
| **P2.1** | 48 | 81% | Luna xhigh | DeepSeek V4 Flash | +1 | open |
| **P2.2** | 53 | 90% | — | Sol medium | +1 | open |
| **P2.3** | 55 | 93% | — | Sol high | +1 | open |
| **P2.4** | 38 | 64% | Luna medium | DeepSeek V4 Flash | 0 | open |
| **P3.1** | 52 | 88% | — | Sol medium | +2 | open |
| **P3.2** | 51 | 86% | Luna max | DeepSeek V4 Flash (→ Sol medium if typography/icon judgment bites) | 0 | open |
| **P3.3** | 45 | 76% | Luna high | DeepSeek V4 Flash | +1 | open |
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
| **D1** | 59 | 100% | — | Sol max | 0 | out of tracker — P4 companion, own plan |

**Capability spread check:** P1.6 (56, 95%) vs P1.7 (45, 76%) — 19% capability
gap for roughly 5× task cost. Pay the jump only where the threshold matters.
