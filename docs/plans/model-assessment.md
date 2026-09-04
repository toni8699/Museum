# Model assessment — pipeline routing (living doc)

**Created:** 2026-08-20 · **Owner:** plan owner
**Purpose:** estimate each task's required intensity on a direct 1–100 scale,
where **Sol xhigh = 100**, then route it using the supplied GPT‑5.6 model-selection
analysis. The score is task intensity, not a benchmark percentage. This table
is living; keep statuses aligned with [`README.md`](README.md).
**Re-calibrated 2026-08-27:** Sol xhigh is the 100-point reference; **Sol Max is
removed from the policy and never used**. Shipped rows were scrubbed 2026-08-27 —
the table tracks open/active work only.

## Methodology

- **Sol xhigh is the 100-point reference.** It is the most intensive setting in
  the policy; no higher tier exists.
- Estimate the task's required intensity from ambiguity, cross-system scope,
  consequence of failure, design judgment, and verification burden.
- Compare that task intensity to the approximate ceiling of each useful model
  setting from the supplied analysis:

| Setting | Intelligence index | Capacity vs Sol xhigh |
|---|---:|---:|
| Luna low | 33 | 57% |
| Luna medium | 38 | 66% |
| Luna high | 46 | 79% |
| Luna xhigh | 49 | 84% |
| Luna max | 51 | 88% |
| Sol medium | 54 | 93% |
| Sol high | 56 | 97% |
| Sol xhigh | 58 | 100% |

- Choose the cheapest setting whose capacity clears the task score. Treat
  Terra as dominated by the Luna/Sol frontier unless workload evidence shows a
  specific latency, style, reliability, or provider advantage.
- **Normal routing tops out at Sol xhigh** — the 100-point reference. There is
  no Sol Max tier; it was removed 2026-08-27 and is never used.
- Start at the cheapest plausible setting and escalate on concrete capability
  failure, not prompt length or stylistic preference.

## Routing interpretation

| Task intensity | Default route | Rationale |
|---:|---|---|
| 1–55 | Luna setting selected by the capacity table | Bounded/mechanical work or established patterns |
| 56–86 | Sol medium/high/xhigh selected by the capacity table | Cross-surface implementation, state integration, or broad verification |
| 87–100 | Sol xhigh by default | Near-frontier ambiguity or high consequence |

The numeric score remains a task estimate. The capacity table determines the
model setting; it is not a claim that benchmark index points equal guaranteed
success percentages.

## Assessment — active pipeline

| Increment | Intensity / 100 | Recommended setting | Status / rationale |
|---|---:|---|---|
| **P3.4** | 70 | Sol medium | undone — P3B.7b deferred tail; broad context-menu acceptance |
| **P3.5** | 72 | Sol medium | undone — P3B.7b deferred tail; camera-menu identity/FSM coverage |
| **P3B.7a** | 79 | Sol high | open — P11/P12-dependent cross-slice regression + accessibility coverage; part of the P12/P3B hard gate |
| **P3B.7b** | 73 | Sol medium | deferred — combined P3.4/P3.5 acceptance matrix |
| **P3B.8** | 63 | Sol medium | open — browser QA across all four shell views; part of the P12/P3B hard gate |
| **P12** | 78 | Sol high | approved 2026-08-26 — ratified contract freeze; four implementation slices on the P11.4 baseline; low ambiguity (fully specified), high breadth (supersedes three pinned contracts per §9 migration table); **hard gate with P3B (owner 2026-08-27)** |
| **P14** | 42 | Luna high | approved 2026-08-28 — Camera Plan passive object footprints; fully specified (ratified `Camera-layout-design.md`), bounded breadth (one viewport + CSS tokens + test pins), mechanical wiring with existing layer; scheduled immediately after P12 |
| **P20.S0** | 70 | Sol medium | shipped 2026-09-04 — asset contract + R2 gate (investigation/planning slice); high ambiguity (9 targeted unknowns, P1 A-vs-B schema decision with version-policy consequences, guest-binary tradeoff) but no implementation or verification load; was blocked on P19 ship; output is the S1–S4 slice briefs |
| **P20.S1** | 78 | Sol high | shipped 2026-09-04, unregistered — Postgres registry + R2 streaming client + authenticated API + test seam; verified by local live smoke vs real R2 (also fixed the `RETURNING` 42702 the smoke exposed) |
| **P20.S2** | 72 | Sol medium | shipped 2026-09-04, unregistered — new cloud-file ingest + Spatial acceptance reuse existing placement/selection/history; built-ins stay catalogue-only; verified by local live browser smoke vs real R2 |
| **P20.S3** | 76 | Sol high | shipped 2026-09-04, unregistered — explicit local/package texture conversion + readiness-aware Save blocker + portable export; failure matrix pins upload/mutation/Save retries; verified by local live browser smoke vs real R2 |
| **P20.S4** | 64 | Sol medium | shipped 2026-09-04, unregistered — pre-replacement Load hydration through the existing binary cache/renderer + round-trip smoke; bounded implementation, verification-heavy (refresh/Load/render fidelity); verified by local live browser smoke vs real R2 |

All shipped rows (P1.6–P3.3, P3B.1–P3B.6, P7.1–P7.6, P8.S1–S6, P11.1–P11.5,
P12.S1–S4) were scrubbed 2026-08-27 — shipped work is not re-assessed here.

## Hard gate (2026-08-27)

P4 (client GLB import), P5 (optimization), and the short-lived P13/P4 backend
registration were removed from the tracker and deleted 2026-08-27 — the plans
were stale relative to the current roadmap, and product direction is not
re-created as plans (the north star holds the final polished product vision).**P3B + P12 are the hard gate: nothing else is implemented or continues until both close.** **P14** (Camera Plan passive object footprints) is approved and scheduled **immediately after P12** — the first work after the gate; it is assessed above. Future work (backend/accounts/publish, GLB import, optimization) re-registers after the gate and is assessed here at that point.

## Scale policy (2026-08-27)

Luna max reaches 88% of Sol xhigh capability at much lower cost, and Sol xhigh
is the 100-point reference. The Sol Max tier is removed — no task routes to it,
and no task is scored above what Sol xhigh can clear.
