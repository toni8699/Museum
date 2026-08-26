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
| **P3B.4a** | 68 | Sol medium | shipped — two Plan surfaces, pure helpers, visual/browser QA; two review rounds caught a token-cycle contrast regression and hover retune |
| **P3B.4b** | 36 | Luna medium | shipped — shared bottom-right corner key, presentational SVG |
| **P3B.1** | 92 | Sol xhigh | shipped — six-face snap helper, shared threshold, inert orientation tokens; discovery risk retired (no authority existed → owner-approved contract), polar handoff fixture-proven; residual two-phase boundary refactor is frozen-behavior ≈ 42 Luna high |
| **P3B.2** | 74 | Sol high | shipped — pure camera projection, immutable per-frame snapshots, front-face SVG, labels/fades, corner axes/reticles, focused fixtures + browser QA; interaction proxies remain P3B.3, motion remains P3B.4 |
| **P3B.3** | 48 | Luna high | shipped — six-face direct/proxy targets with hysteresis and hit priority; shared-threshold pointer capture; cardinal-active tolerance; keyboard/a11y/disabled states; focused + browser QA |
| **P3B.4** | 56 | Sol medium | shipped — pure sampler + two-phase resolution split in existing authorities; projector-driven flight with fixture-pinned polar handoff; retarget/cancel/reduced-motion verified (animated ≡ instant convergence fixture); interruption paths route through the non-terminal +Y handoff, mid-flight cancel fixture-pinned on both poles |
| **P3B.5** | 76 | Sol high | shipped — selection-free cross-surface preview commands, deterministic edge direction affordances, explicit scope labels, focused + full regression coverage |
| **P3B.6** | 67 | Sol medium | shipped — retained-edge selection parity and hover/selection presentation |
| **P3B.7a** | 79 | Sol high | proposed — P11-dependent cross-slice regression and accessibility coverage |
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
| **P11.1** | 79 | Sol high | shipped (uncommitted 2026-08-25) — selection→scope seam; superseded-contract tests migrated by name; 2 pre-existing baseline failures remain (not P11.1) |
| **P11.2** | 84 | Sol high | open — mutation-gate pre-inventory (~100 `isDocumentMutationBlocked` sites, 9 files) then auto-pause seam; one-gesture-one-transaction + auto-pause-before-pointer-capture invariants; failure corrupts history |
| **P11.3** | 65 | Sol medium | open — scope-aware timeline shell; panel/ruler/controller exposure collapse, shared Plan/3D mount preserved |
| **P11.4** | 67 | Sol medium | open — compact controls parity across Timeline/Inspector/Plan/3D; wires orphaned edge APIs |
| **P11.5** | 48 | Luna high | open — focused regression + six-doc contract reconciliation (mechanical but wide) |
| **D1** | 96 | Sol xhigh | out of tracker — P4 companion, own plan; Max only by exception |

## P3B routing summary

- **P3B.1 (92)** is retired as the hardest item: the discovery risk it priced
  in is resolved — no snap authority existed, the owner approved the contract,
  and the polar handoff is fixture-proven. Its residual (two-phase helper
  boundary refactor, frozen behavior) is ≈42 Luna-high work.
- **P3B.2 shipped at 74, Sol high.** Rework replaced the failed static cube
  with pure camera projection, immutable per-frame SVG snapshots, front-face
  culling, label fades, corner axes, and foreshortening reticles. Focused
  fixtures plus browser QA cover reference/cardinal/free-orbit poses.
- **P3B.4 drops 59 → 56, stays Sol medium:** the blocker that carried its
  uncertainty (polar handoff) is retired by fixture; the sampler signature,
  easing, duration, and reduced-motion path are pinned.
- **P3B.3 shipped at 48, Luna high.** Six-face direct/proxy targets, both
  hysteresis boundaries, gesture ownership, cardinal-active tolerance, and
  disabled/keyboard semantics are fixture- and browser-verified.
- **P3B.5 shipped at 76, Sol high.** Selection-free named preview commands,
  deterministic edge-direction affordances, and explicit scope labels now span
  Sidebar, Plan/3D Inspectors, and Timeline. **P3B.7a (79)** keeps Sol high.
  **P3B.4a (68)**, **P3B.4b (36)**,
  **P3B.6 (67)** is shipped; **P3B.7b (73)** and **P3B.8 (63)** remain unchanged,
  with P3B.7a/P3B.8 deferred until P11 semantics are verified.
- No P3B item requires Sol Max by default.

## P11 routing summary (assessed 2026-08-25, pre-implementation)

- **P11.2 (84)** is the peak: breadth is priced in the pre-inventory (~100 gate
  sites), risk in transaction/auto-pause ordering. Stays Sol high — below the
  87+ xhigh band because it is a policy split, not a structural refactor like
  P7.5; escalate on first demonstrated failure per policy.
- **P11.1 (79) Sol high** — closest anchor P8.S2 (75) plus contract-
  supersession migration cost (tests must name the P8 D1/S5 replacement).
- **P11.3 (65) / P11.4 (67) Sol medium** — single-subsystem UI/controller
  reconciliation on established P8.S3/S4 patterns.
- **P11.5 (48) Luna high** — bounded mechanical pass; no DeepSeek Flash
  substitution trigger (that applies to Luna-rated items only if routed there;
  Luna high retains effort as capability reference).
- No P11 item requires Sol Max by default.

The supplied analysis supports this conservative policy: Luna max reaches 86%
of Sol Max capability at much lower cost, Sol xhigh reaches 98%, and the final
Sol Max point is a premium specialist tail. Use Sol Max only when a measured
workload shows that the last increment changes acceptance or consequence.
