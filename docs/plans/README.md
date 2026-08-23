# Plan tracker — single source of truth for plan status

**Created:** 2026-08-18 by the
[plan-system renewal](archive/plans/2026-08-17-plan-system-renewal.md) (process
row below, shipped and archived 2026-08-18).
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
   `docs/archive/plans/` (P-numbered era) or `docs/archive/plans/pre-h1-letters/`
   (letter era) and this tracker keeps a one-line stub: `archived → <path>`.
5. **Re-registration, not re-lettering.** Approved-but-unscheduled work keeps
   its content and gains a tracker number; that content lives **folded into
   the plan's umbrella doc** (sources were folded in 2026-08-18 and the
   originals deleted). Only shipped/superseded docs archive.
6. Execution order is **pinned in the table's depends-on column**, not implied
   by the numbers (registration order ≠ priority).
7. **No narrative in this tracker.** Rows and stubs stay one line each;
   shipped detail lives in the plan doc (archived on close), never here.

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

## Active

| # | Plan | Status | Depends on | Doc |
|---|------|--------|------------|-----|
| — | Plan-system renewal + documentation rework (process row — created this tracker and the five-doc model) | shipped | H1 gate | archived → [2026-08-17-plan-system-renewal.md](archive/plans/2026-08-17-plan-system-renewal.md) |
| P1 | Camera overhaul | shipped | renewal | archived → [2026-08-18-P1-camera-overhaul.md](../archive/plans/2026-08-18-P1-camera-overhaul.md) |
| P2 | Plan staging mode — 2D furnishing | approved | P1 | [2026-08-18-P2-plan-staging.md](2026-08-18-P2-plan-staging.md) |
| P3 | UI overhaul — primarily visual reconciliation/refresh pass over settled surfaces; context-menu interaction slice folded in (P3.4/P3.5) | approved | P1 (per-increment; P3.5 also P8 S2–S4; staging-dependent items await P2) | [2026-08-18-P3-ui-overhaul.md](2026-08-18-P3-ui-overhaul.md) |
| P4 | Client GLB import | proposed | renewal | [2026-08-18-P4-gltb-import.md](2026-08-18-P4-gltb-import.md) |
| P5 | Measured optimization and scale | proposed | renewal | [2026-08-18-P5-measured-optimization.md](2026-08-18-P5-measured-optimization.md) |
| P6 | Editor artifact rename (de-H1) | shipped | renewal | archived → [2026-08-18-P6-editor-rename.md](archive/plans/2026-08-18-P6-editor-rename.md) |
| P7 | Museum-editor facade decoupling — finish the deferred H1 splits (selection de-coupling, facade thinning, type collapse, shims, Chopin defaults, shell boot) + P7.6 museum-vocabulary scrub (drop-prefix scene vocabulary, relic keeps museum; format hard break) | **scheduled next (2026-08-22)** — P7.4 shipped 2026-08-19; P7.1–P7.6 unblocked by P8 S1–S6 | P1 | [2026-08-19-P7-editor-facade-collapse.md](2026-08-19-P7-editor-facade-collapse.md) + [P7.6 strings pre-inventory (annex)](2026-08-23-P7.6-strings-pre-inventory.md) |
| P8 | Camera preview scopes — Preview Camera / Preview Edge / Preview Sequence; directed-edge motion resolver + timing parity; edge-local timeline | **shipped — S1–S6 (2026-08-22)** | P1 | [2026-08-21-P8-camera-preview-scopes.md](2026-08-21-P8-camera-preview-scopes.md) |
| — | Branch rejoin — **experiment, no schedule** (rejoin into a later Sequence stop; dead-end return already ships; multi-edge playback would compose P8's edge primitive) | proposed | P8 conceptually | [2026-08-21-branch-rejoin-experiment.md](2026-08-21-branch-rejoin-experiment.md) |
| … | future work re-registers here | | | |

Execution order: **P6 → P1 → P8 → P7 → P2 → P3** — P1 shipped 2026-08-21; the
owner re-prioritized **P8 ahead of P2** on 2026-08-21
([scope decision](archive/plans/2026-08-21-scope-decision-p8-before-p2.md));
P8 shipped **S1–S6 on 2026-08-22**, completing the camera phase. On 2026-08-22
the owner re-prioritized **P7 (facade refactor) ahead of P2**: **P7.1 is the
active next action**, with P7's remaining increments (**P7.1 → P7.5 → P7.2 →
P7.3 → P7.6**) serial and green before the next; P2 resumes after P7, P3 stays
last. **P7.6** (added 2026-08-22) is the museum-vocabulary scrub — owner
decisions recorded in its pre-brief: drop-prefix scene vocabulary (relic
subtree keeps museum) and a hard-break format rename (`.scenepack.zip` /
`scene.json`); it lands last as its own commit series on top of the settled
P7.1–P7.5 code.
P3 is now visual polish **plus** the folded context-menu interaction slice:
**P3.4** (shared shell + Scene 3D / Layout / Outliner adapters) is
P8-independent, while **P3.5** (Camera / Timeline adapters binding Preview
Camera / Edge / Sequence) landed its P8 S2–S4 dependency when P8 completed.
P6 was the mechanical editor rename so P1.1's shell-inversion diff stays
behavior-only. P7.5's `cameraTimelinePlayhead` ownership item was partially
folded into P8 S2 acceptance (P8 S2/S4 added `lastSequencePlayhead` next to
it); the P7.5 brief was **re-baselined against that on 2026-08-22** (refresh
note + §3 in the umbrella; `lastSequencePlayhead` → preview controller,
three-surface playhead rewiring) before that increment starts. The prior camera-first order was committed by the
[2026-08-18 scope decision](archive/plans/2026-08-18-scope-decision-camera-first.md);
the 2026-08-21 decision extends the camera phase rather than reversing it.
P4/P5 stay unscheduled until the owner re-prioritizes.

P1 **closed 2026-08-22** — shipped 2026-08-21 with all increments through
**P1.9** (camera sidebar simplification: neighbor dropdown · drag-only reorder
· empty-chain promotion; sidebar matches `Design-shell-specs.md` §4 so P3
stays primarily visual), plus the P1.7 review-fixes + close-out pass archived
with a stub below.
Umbrella + briefs archived with stubs below.

## Archived plans

All archived: `archived → docs/archive/plans/pre-h1-letters/<file>`. Shipped
or superseded; non-authoritative. Links are relative to `docs/plans/` unless
prefixed.

- `archived → archive/plans/pre-h1-letters/2026-08-10-layout-cad-foundation.md` (A0–A4 track)
- `archived → archive/plans/pre-h1-letters/2026-08-10-layout-cad-a0-codec.md`
- `archived → archive/plans/pre-h1-letters/2026-08-10-layout-cad-a1-line-geometry.md`
- `archived → archive/plans/pre-h1-letters/2026-08-10-layout-cad-a2-editor-preview.md`
- `archived → archive/plans/pre-h1-letters/2026-08-10-layout-cad-a2-2-scale-editing.md`
- `archived → archive/plans/pre-h1-letters/2026-08-11-layout-cad-a2-3-opening-authoring.md`
- `archived → archive/plans/pre-h1-letters/2026-08-11-layout-cad-a3-bezier-arch-profiles.md`
- `archived → archive/plans/pre-h1-letters/2026-08-11-layout-cad-a3-1-camera-style-bend.md`
- `archived → archive/plans/pre-h1-letters/2026-08-11-layout-cad-a4-objects-inspectors-io.md`
- `archived → archive/plans/pre-h1-letters/2026-08-12-layout-cad-a4-1-polish.md`
- `archived → archive/plans/pre-h1-letters/2026-08-12-layout-cad-b3-room-unit-relocate.md`
- `archived → archive/plans/pre-h1-letters/2026-08-12-layout-cad-b4-runtime-dual-read.md`
- `archived → archive/plans/pre-h1-letters/2026-08-13-layout-cad-b5-runtime-cutover.md`
- `archived → archive/plans/pre-h1-letters/2026-08-10-layout-cad-c0-project-codec.md`
- `archived → archive/plans/pre-h1-letters/2026-08-13-graphics-g1-shared-geometry-compiler.md`
- `archived → archive/plans/pre-h1-letters/2026-08-13-graphics-g2-plan-render-model.md`
- `archived → archive/plans/pre-h1-letters/2026-08-13-graphics-g3-performance-harness.md`
- `archived → archive/plans/pre-h1-letters/2026-08-13-graphics-g4-procedural-architectural-meshes.md`
- `archived → archive/plans/pre-h1-letters/2026-08-13-graphics-architecture-roadmap.md`
- `archived → archive/plans/pre-h1-letters/2026-08-14-graphics-h1-unified-3d-editing.md` (H1 umbrella)
- `archived → archive/plans/pre-h1-letters/2026-08-14-graphics-h1-s0-contracts.md`
- `archived → archive/plans/pre-h1-letters/2026-08-14-graphics-h1-s1-editor-shell.md`
- `archived → archive/plans/pre-h1-letters/2026-08-14-graphics-h1-s2-boot-empty.md`
- `archived → archive/plans/pre-h1-letters/2026-08-14-graphics-h1-s2.1-room-delete.md`
- `archived → archive/plans/pre-h1-letters/2026-08-14-graphics-h1-s3-cross-domain-selection.md`
- `archived → archive/plans/pre-h1-letters/2026-08-15-graphics-h1-s4-unified-hierarchy.md`
- `archived → archive/plans/pre-h1-letters/2026-08-15-graphics-h1-s5-layout-3d-pick-metadata.md`
- `archived → archive/plans/pre-h1-letters/2026-08-15-graphics-h1-s6-layout-3d-selection.md`
- `archived → archive/plans/pre-h1-letters/2026-08-16-graphics-h1-s7-single-gizmo-host.md`
- `archived → archive/plans/pre-h1-letters/2026-08-16-graphics-h1-s8-layout-gizmo-candidate-session.md`
- `archived → archive/plans/pre-h1-letters/2026-08-17-graphics-h1-s8.1-room-agnostic-placement.md`
- `archived → archive/plans/pre-h1-letters/2026-08-17-graphics-h1-s8.2-room-focus-cluster-expansion.md`
- `archived → archive/plans/pre-h1-letters/2026-08-17-graphics-h1-s10-camera-extraction.md`
- `archived → archive/plans/pre-h1-letters/2026-08-17-graphics-h1-s10.2-camera-flow-model.md`
- `archived → archive/plans/pre-h1-letters/2026-08-17-graphics-h1-s10.1-camera-workspace-ui-rework.md`
- `archived → archive/plans/pre-h1-letters/2026-08-18-camera-framing-design-review.md`
- `archived → archive/plans/pre-h1-letters/2026-08-15-geometry-kernel-library-review.md`
- `archived → archive/plans/pre-h1-letters/2026-08-13-layout-viewport-switch-optimization.md`
- `archived → ../archive/superpowers/plans/2026-08-12-layout-room-name-canonical-export.md` (letter-era implementation plan; behavior landed via the A-track layout work)

**Archived (renewal era):**

- `archived → archive/plans/2026-08-17-plan-system-renewal.md` (process row)
- `archived → archive/plans/2026-08-18-scope-decision-camera-first.md`
- `archived → archive/plans/2026-08-21-scope-decision-p8-before-p2.md` (owner priority call; P8 ahead of P2)
- `archived → archive/plans/2026-08-18-P6-editor-rename.md` (shipped 2026-08-18)
- `archived → archive/plans/2026-08-18-P1.2-framing-envelope-serialization.md` (shipped 2026-08-18)
- `archived → archive/plans/2026-08-18-P1.3-envelope-sampler-guards.md` (shipped 2026-08-18)
- `archived → archive/plans/2026-08-19-P1.4-envelope-invariants-policy.md` (shipped 2026-08-19)
- `archived → archive/plans/2026-08-19-P1.5-camera-plan-surface.md` (shipped 2026-08-19)
- `archived → archive/plans/2026-08-20-P1.6-framing-authoring.md` (shipped 2026-08-20)
- `archived → archive/plans/2026-08-20-P1.7-camera-ui-reconciliation.md` (shipped 2026-08-21)
- `archived → archive/plans/2026-08-21-P1.8-camera-sequence-authoring.md` (shipped 2026-08-21)
- `archived → archive/plans/2026-08-21-P1.9-sidebar-simplification.md` (shipped 2026-08-21 — final P1 slice)
- `archived → archive/plans/2026-08-21-P1.7-review-fixes-2d-viewport-persistence.md` (P1.7 review fixes + close-out — shipped 2026-08-21, archived 2026-08-22; closes P1)

**Sources:** all source content is folded into the umbrella docs (P1 §A–§D ·
P2 §A · P4 §A · P5 §A); the original source files were deleted 2026-08-18.

**Not archived (active):** this tracker · the umbrella plans (P1–P5).
