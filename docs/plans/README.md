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

## Active

| # | Plan | Status | Depends on | Doc |
|---|------|--------|------------|-----|
| — | Plan-system renewal + documentation rework (process row — created this tracker and the five-doc model) | shipped | H1 gate | archived → [2026-08-17-plan-system-renewal.md](archive/plans/2026-08-17-plan-system-renewal.md) |
| P1 | Camera overhaul | in-progress — **P1.1 shipped 2026-08-18** | renewal | [2026-08-18-P1-camera-overhaul.md](2026-08-18-P1-camera-overhaul.md) |
| P2 | Plan staging mode — 2D furnishing | approved | P1 | [2026-08-18-P2-plan-staging.md](2026-08-18-P2-plan-staging.md) |
| P3 | UI overhaul — reconciliation/refresh pass over settled surfaces | approved | P1, P2 | [2026-08-18-P3-ui-overhaul.md](2026-08-18-P3-ui-overhaul.md) |
| P4 | Client GLB import | proposed | renewal | [2026-08-18-P4-gltb-import.md](2026-08-18-P4-gltb-import.md) |
| P5 | Measured optimization and scale | proposed | renewal | [2026-08-18-P5-measured-optimization.md](2026-08-18-P5-measured-optimization.md) |
| P6 | Editor artifact rename (de-H1) | shipped | renewal | archived → [2026-08-18-P6-editor-rename.md](archive/plans/2026-08-18-P6-editor-rename.md) |
| … | future work re-registers here | | | |

Execution order: **P6 (before P1.1) → P1 → P2 → P3**. P6 is the mechanical
editor rename so P1.1's shell-inversion diff stays behavior-only. P4/P5 and
later entries do not start until P1–P3 are scheduled or re-prioritized by the
owner. The order is committed by the
[2026-08-18 scope decision](archive/plans/2026-08-18-scope-decision-camera-first.md)
(camera first, plan staging second, UI overhaul last).

**P1.1 (successor domain×view shell) shipped 2026-08-18** — shell inversion
ratified (§A); the Camera → Plan placeholder cell is ready for **P1.5** to
mount into; the engine track **P1.2–P1.4** runs in parallel. The design-spec
conformance mapping is **P1 §A.2** (target:
`docs/Design-specs/Design-shell-specs.md`).

**P1.2 shipped 2026-08-18** — archived →
[2026-08-18-P1.2-framing-envelope-serialization.md](../archive/plans/2026-08-18-P1.2-framing-envelope-serialization.md).
The engine track continues with **P1.3**.

## Archived plans (2026-08-10 → 2026-08-18)

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

**Archived (renewal era, shipped 2026-08-18):**

- `archived → archive/plans/2026-08-17-plan-system-renewal.md` (process row)
- `archived → archive/plans/2026-08-18-scope-decision-camera-first.md`
- `archived → archive/plans/2026-08-18-P6-editor-rename.md`

**Sources:** all source content is folded into the umbrella docs (P1 §A–§D ·
P2 §A · P4 §A · P5 §A); the original source files were deleted 2026-08-18.

**Not archived (active):** this tracker · the umbrella plans (P1–P5).
