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
| P2 | Plan staging mode — 2D furnishing | **shipped 2026-08-23 — P2.1–P2.4 complete** | P1 + P9 | archived → [2026-08-18-P2-plan-staging.md](../archive/plans/2026-08-18-P2-plan-staging.md) |
| P3 | UI overhaul — accepted structural visual reconciliation (P3.1–P3.3, P3.6) | **shipped 2026-08-24** | P9 + P1 | archived → [2026-08-18-P3-ui-overhaul.md](../archive/plans/2026-08-18-P3-ui-overhaul.md) |
| P3B | Scene|Camera × Plan|3D orientation interaction, Plan-surface parity, camera preview affordances, and deferred P3.4/P3.5 acceptance tail | **shipped 2026-08-28 — core P3B.1–P3B.8 complete; P3B.7b remains deferred/non-blocking** | P3 + P8 | archived → [2026-08-24-P3B-orientation-preview-affordances.md](../archive/plans/2026-08-24-P3B-orientation-preview-affordances.md) |
| P6 | Editor artifact rename (de-H1) | shipped | renewal | archived → [2026-08-18-P6-editor-rename.md](archive/plans/2026-08-18-P6-editor-rename.md) |
| P7 | Museum-editor facade decoupling — finish the deferred H1 splits (selection de-coupling, facade thinning, type collapse, shims, Chopin defaults, shell boot) + P7.6 museum-vocabulary scrub (drop-prefix scene vocabulary, relic keeps museum; format hard break) | **shipped 2026-08-23 — P7.1 + P7.5 + P7.2 + P7.3 + P7.6 all complete; P7 closed** | P1 | [2026-08-19-P7-editor-facade-collapse.md](2026-08-19-P7-editor-facade-collapse.md) + [P7.6 strings pre-inventory (annex)](2026-08-23-P7.6-strings-pre-inventory.md) |
| P8 | Camera preview scopes — Preview Camera / Preview Edge / Preview Sequence; directed-edge motion resolver + timing parity; edge-local timeline | **shipped — S1–S6 (2026-08-22)** | P1 | [2026-08-21-P8-camera-preview-scopes.md](2026-08-21-P8-camera-preview-scopes.md) |
| P9 | Design reconciliation — current shell/spec truth + one canonical PNG set before P2 | **shipped 2026-08-23** | P7 + P8 | archived → [2026-08-23-P9-design-reconciliation.md](../archive/plans/2026-08-23-P9-design-reconciliation.md) |
| P10 | Plan Arrange Objects redesign — owner-aware Arrange surface for Layout objects + eligible Scene entities; no cross-document gestures | **shipped 2026-08-24 — P10.0–P10.5 complete** | P2 + P9 | archived → [2026-08-23-P10-plan-arrange-objects.md](../archive/plans/2026-08-23-P10-plan-arrange-objects.md) |
| P11 | Camera Timeline / Preview UX redesign — selection-driven Camera/Edge scope, compact non-modal transport, paused authoring, and scope-aware timeline shell | **shipped 2026-08-26 — P11.1–P11.5 complete** (P11.3 `ab1210a` + bad-merge revert `45bcd6d`; P11.4 `e2fb450` + close docs `c718c80`); P12 ratifies the follow-on contract | P8 + P3B.5 | archived → [2026-08-25-P11-camera-timeline-preview-ux-redesign.md](../archive/plans/2026-08-25-P11-camera-timeline-preview-ux-redesign.md) (+ [P11.2 pre-inventory annex](../archive/plans/2026-08-25-P11.2-mutation-gate-pre-inventory.md)) |
| P12 | Camera Timeline / Preview contract freeze — five laws, binary transport, explicit scopes, one-shell lanes, integrated temporal mini-player | **shipped 2026-08-28 — P12.1–P12.5 complete** | P11 | archived → [2026-08-26-P12-camera-timeline-contract-freeze.md](../archive/plans/2026-08-26-P12-camera-timeline-contract-freeze.md) |
| P13 | Sequence stop-at-node playback — Sequence-scope Play stops at the beginning of each node (boundary), with a toggle to play full end-to-end; single-increment, no rewrite | **proposed — nice-to-have, not scheduled** (owner 2026-08-27); follows the P3B + P12 gate | P12 | [2026-08-27-P13-stop-at-node-playback.md](2026-08-27-P13-stop-at-node-playback.md) |
| P14 | Camera Plan passive object footprints — ratified `Camera-layout-design.md`: scene footprint layer + plan-primitive parity on the Camera Plan surface, inert beneath the camera graph (no collision/validation) | **shipped 2026-08-29 — P14 S1–S3 complete** | P12 | archived → [2026-08-28-P14-camera-plan-footprints.md](../archive/plans/2026-08-28-P14-camera-plan-footprints.md) |
| P15 | camera-core extraction — slice 1 of the ratified migration review: move `museum/navigation/camera-route.ts` + `camera-motion.ts` (and the minimum compile-required type surface) into `@portfolio/camera-core`, sever the Chopin default, migrate all importers, add source + runtime visitor-boundary pins; zero runtime behavior change for existing production call sites | **shipped 2026-08-30 — S0–S4 complete** | P14 + [migration review](2026-08-29-backend-persistence-migration-review.md) | archived → [2026-08-29-P15-camera-core-extraction.md](../archive/plans/2026-08-29-P15-camera-core-extraction.md) |
| P16 | project-model + layout-core extraction — slice 2 of the ratified migration review: extract pure project/scene/layout documents, codecs, room semantics, compiled geometry, package format, and SHA primitives behind shared packages; preserve canonical JSON, generated-endpoint, graph, geometry, editor, visitor, and relic behavior | **shipped 2026-08-30 — S0–S5 complete** | P15 | archived → [2026-08-30-P16-project-model-layout-core-extraction.md](../archive/plans/2026-08-30-P16-project-model-layout-core-extraction.md) |
| P17 | editor / visitor app split — slice 3 of the ratified migration review: standalone `@portfolio/editor` and read-only `@portfolio/museum`, with the relic gated into editor and source/runtime visitor boundary pins | **shipped 2026-08-30** | P16 | archived → [2026-08-30-P17-app-split.md](../archive/plans/2026-08-30-P17-app-split.md) |
| P18 | backend provisioning — slice 4 of the ratified migration review: deploy `@biskiq/api` Fastify compute on Render, connect it to separately provisioned Neon Postgres through secret `DATABASE_URL`, and add process/database health checks with no persistence schema yet | **shipped 2026-08-30 — infrastructure boundary; owner-run Render/Neon provisioning remains the P19 gate** | P17 | archived → [2026-08-30-P18-backend-provisioning.md](../archive/plans/2026-08-30-P18-backend-provisioning.md) |
| P19 | first project persistence — authenticated semantic-document Save/Load, immutable project versions, single-user ownership, and P19.4 guest-first entry/Project Shell closeout | **shipped 2026-09-03 — Google OIDC/live deployment smoke passed** | P18 | [umbrella](2026-08-30-P19-project-persistence.md) · [P19.4 annex](2026-09-02-P19.4-editor-shell.md) |
| P20 | Project Asset Registry + R2 — durable project-scoped texture assets, authenticated storage, Spatial integration, portable package fidelity, and refresh/Load resolution | in-progress — S0 + S1 + S2 + S3 / P20.3 implemented locally (2026-09-03); **P20.4 remains**; owner-run R2 provisioning/smoke remains | P19 | [umbrella](2026-08-19-P20-Project-assets-registry-R2.md) · [P20.2 brief](2026-09-03-P20.2-spatial-registry-integration.md) · [P20.3 brief](2026-09-03-P20.3-texture-durable-conversion.md) |
| — | Branch rejoin — **experiment, no schedule** (rejoin into a later Sequence stop; dead-end return already ships; multi-edge playback would compose P8's edge primitive) | proposed | P8 conceptually | [2026-08-21-branch-rejoin-experiment.md](2026-08-21-branch-rejoin-experiment.md) |
| … | future work re-registers here | | | |

**Hard gate:** P12 shipped 2026-08-28; core P3B shipped 2026-08-28 after
P3B.7a/P3B.8 closed. P3B.7b remains deferred and non-blocking. P14 shipped as
the first work after P3B. P13 remains proposed and unscheduled. **P15
(camera-core extraction) shipped 2026-08-30 as slice 1 of the ratified
migration review** — the first step toward the editor/visitor/api split. **P16
(project-model + layout-core extraction) shipped 2026-08-30 as slice 2 of the
ratified migration review.** **P17 (editor / visitor app split) shipped
2026-08-30 as slice 3.** **P18 (backend provisioning) shipped 2026-08-30 as
slice 4's infrastructure boundary.** **P19 (first project persistence) shipped
2026-09-03 — Google OIDC/live deployment smoke passed.**
Product vision lives in the north star.

Execution order: **P6 → P1 → P8 → P7 → P9 → P2 → P3 → P11** — P1 shipped
2026-08-21; the owner re-prioritized **P8 ahead of P2** on 2026-08-21
([scope decision](archive/plans/2026-08-21-scope-decision-p8-before-p2.md));
P8 shipped **S1–S6 on 2026-08-22**, completing the camera phase. On 2026-08-22
the owner re-prioritized **P7 (facade refactor) ahead of P2**: **P7.1, P7.5,
P7.2, P7.3, and P7.6 all shipped 2026-08-23 — P7 is closed** (P7.4 shipped earlier via P1); P2 resumes next, P3 stays last. **P7.6** (added 2026-08-22)
was the museum-vocabulary scrub — owner decisions recorded in its pre-brief:
drop-prefix scene vocabulary (relic subtree keeps museum) and a hard-break
format rename (`.scenepack.zip` / `scene.json`); it landed last as its own
commit series on top of the settled P7.1–P7.5 code, with the identifier
zero-match gate (keep-list 41) and the bare-museum tolerated-set gate (179/184
P/T; +2 legacy-format pin lines added post-close — the hard-break test now also
rejects the pre-break `museum-scene.json` member, documented in the annex §4)
both green.
P3 is the accepted structural visual reconciliation: **P3.1–P3.3 and P3.6
shipped 2026-08-24**. P3B has one pinned sequential group order, now coordinated with P11: Group A Plan parity
(P3B.4a → P3B.4b), Group B orientation, Group C preview affordances (P3B.5
and closed P3B.6), P11 behavior slices, core QA, then the non-blocking deferred
P3.4/P3.5 tail. The undone P3.4/P3.5 work remains a low-priority deferred
acceptance tail in **P3B** and does not block core P3B shipment. P11 is a new
behavior plan, not a P3 cosmetic slice: it intentionally supersedes P8/P3B's
selection-independent preview contract before remaining P3B preview QA and
visual polish.
P6 was the mechanical editor rename so P1.1's shell-inversion diff stays
behavior-only. P7.5's `cameraTimelinePlayhead` ownership item was partially
folded into P8 S2 acceptance (P8 S2/S4 added `lastSequencePlayhead` next to
it); the P7.5 brief was **re-baselined against that on 2026-08-22** (refresh
note + §3 in the umbrella; `lastSequencePlayhead` → preview controller,
three-surface playhead rewiring) before that increment starts. The prior camera-first order was committed by the
[2026-08-18 scope decision](archive/plans/2026-08-18-scope-decision-camera-first.md);
the 2026-08-21 decision extends the camera phase rather than reversing it.
P9 shipped 2026-08-23 as the docs/PNG-only canonical design reconciliation;
P2 shipped 2026-08-23; P10 shipped 2026-08-24. On **2026-08-27 the owner
removed P4 (client GLB import), P5 (optimization), and the short-lived
P13/P4 backend-persistence registration from the tracker and deleted the plan
docs** — the plans were stale relative to the current roadmap. Product
direction is not re-created as plans; the north star holds the final polished
product vision. P12 shipped 2026-08-28; **P3B.7a/P3B.8 closed on 2026-08-28 and
core P3B shipped**. P3B.7b remains a non-blocking deferred tail. P13 remains
proposed and unscheduled; P14 shipped as the first post-P3B slice.

P12 (2026-08-26) ratifies the Camera timeline/preview contract after the designer
review of the P11 UX findings; it supersedes the conflicting P11.2–P11.4 rows
(visitor seek refusal, selection-driven scope install, edge mini-shell,
capsule/dense-row annex, swap pose preservation, Escape teardown) per its §9
migration table and schedules four implementation slices (§10) on top of the
P11.4 + bug-fix baseline. On 2026-08-27, the owner amended P12 S4 before S5
closeout to adopt the integrated temporal mini-player and expanded lane-based
scrubbing, retain only node navigation / Play-Pause / POV-Observer /
Center-Follow controls, remove main-editor Repeat/loop/Replay and inferred
unmatched controls, and preserve `+ View Key` as a reserved code-backed slot.
P11.5 shipped before the freeze. P12 completed canonical-doc reconciliation,
assertion migration, browser QA, and full verification in S5 on 2026-08-28.

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
- `archived → ../archive/plans/2026-08-23-P9-design-reconciliation.md` (shipped 2026-08-23 — docs/PNG prerequisite before P2)
- `archived → ../archive/plans/2026-08-18-P2-plan-staging.md` (shipped 2026-08-23 — Scene Plan staging complete)
- `archived → ../archive/plans/2026-08-23-P3.1-visual-qa-deviations.md` (historical QA annex; its prior close was rejected 2026-08-24)
- `archived → ../archive/plans/2026-08-23-P10-plan-arrange-objects.md` (shipped 2026-08-24 — P10.0–P10.5 complete)
- `archived → ../archive/plans/2026-08-18-P3-ui-overhaul.md` (shipped 2026-08-24 — accepted P3.1–P3.3 + P3.6; P3.4/P3.5 and P3B extracted to P3B)
- `archived → ../archive/plans/2026-08-25-P11-camera-timeline-preview-ux-redesign.md` (shipped 2026-08-26 — P11.1–P11.5 complete; P12 ratifies the follow-on contract)
- `archived → ../archive/plans/2026-08-25-P11.2-mutation-gate-pre-inventory.md` (P11.2 annex — superseded by the shipped P11.2 implementation)
- `archived → ../archive/plans/2026-08-26-P12-camera-timeline-contract-freeze.md` (shipped 2026-08-28 — P12.1–P12.5 complete)
- `archived → ../archive/plans/2026-08-26-P12.2-slice-brief.md` (shipped P12.2 brief)
- `archived → ../archive/plans/2026-08-26-P12.3-slice-brief.md` (shipped P12.3 brief)
- `archived → ../archive/plans/2026-08-27-P12-S4-designer-brief-amendment.md` (shipped P12 S4 amendment)
- `archived → ../archive/plans/2026-08-24-P3B-orientation-preview-affordances.md` (core shipped 2026-08-28 — P3B.7a/P3B.8 closed; P3B.7b remains deferred/non-blocking)
- `archived → ../archive/plans/2026-08-28-P14-camera-plan-footprints.md` (shipped 2026-08-29 — P14 S1–S3 complete)
- `archived → ../archive/plans/2026-08-29-P15-camera-core-extraction.md` (shipped 2026-08-30 — S0–S4 complete)
- `archived → ../archive/plans/2026-08-30-P18-backend-provisioning.md` (shipped 2026-08-30 — infrastructure boundary; owner-run Render/Neon provisioning remains the P19 gate)
- `archived → ../archive/plans/2026-08-31-scope-decision-experience-interaction-boundary.md` (scope decision — Experience/Interaction authoring boundary; ratified 2026-08-31)

**Sources:** all source content is folded into the umbrella docs (P1 §A–§D ·
P2 §A); the original source files were deleted 2026-08-18. P4/P5 sources were
removed with the deleted plans 2026-08-27.

**Not archived (active):** this tracker · P13 · the branch-rejoin experiment.

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
- **P20 — Project Asset Registry + R2.** Registered and in-progress — see the
  active row above (S0 + S1 + S2 + S3 / P20.3 implemented locally; **P20.4
  remains**; held by owner-run R2 provisioning/smoke).
- **P21 — Product shell + Project Hub + core editor UX polish.** Landing/entry
  flow, dashboard / project cards, shell navigation, Save/auth/account states,
  asset entry points, and editor chrome/density cleanup. Direction only; the
  design track feeds it.
- **P22 — Basic Publish + visitor runtime.** Publish an owned project, resolve
  project assets, hosted visitor-safe output, and basic preview/publish
  status. Direction only; its brief is written once P20's Spatial integration
  and P21's shell are close.
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
  R2-backed project assets with Spatial integration (P20, in progress), the
  product shell + Project Hub + editor UX polish (P21), the basic
  publish/visitor-runtime boundary (P22), the typed DB layer (P23), the
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
