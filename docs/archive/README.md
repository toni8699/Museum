# Archived Museum Docs

Historical plans, handoffs, and audits kept for archaeology. **Not active implementation authority.**

## Active authority

- Release index: [`../plans/museum-editor-workspace/README-museum-editor.md`](../plans/museum-editor-workspace/README-museum-editor.md)
- Current handoff: [`../agent-handoffs/CURRENT.md`](../agent-handoffs/CURRENT.md)
- Active specs/plans: [`../superpowers/specs/`](../superpowers/specs/), [`../superpowers/plans/`](../superpowers/plans/)
- Living contracts: [`../CAMERA_AND_LAYOUT.md`](../CAMERA_AND_LAYOUT.md), [`../ASSET_WORKFLOW.md`](../ASSET_WORKFLOW.md)

## Contents

### `agent-handoffs/`

- Pre–workspace-release editor phases (0–7, including old 3.5 / 3.6) and Phase 1 interim slices (1.2 / 1.3).
- `museum-editor-phases-4-5/` — Phase 4 scene-creation + Phase 5 texture/material/package-export handoffs plus the priority-1 file-split slice handoffs (all shipped, see `phase-4.5.md` and `phase-5.4.md` for gate authorities).
- `workspace-phases/` — completed Museum Editor Workspace phases 1–3 slice handoffs (through 3.6).
- `complete-refactor/` — god-file split diary (Jul 28–Aug 1, slices 1–9.5). Done; not Phase 4+ authority.
- `phase-6.5.md`, `phase-6.6-slice-6.md` — stale path-camera workspace phases that predate the editor rebuild.

### `plans/`

- `museum-editor-workspace.md` — old single-file workspace shim.
- `camera-path-authoring.md` — Phase 6.5 path-authoring plan (shipped; contracts live in code + `../CAMERA_AND_LAYOUT.md`).
- `camera-view-authoring.md` — Phase 6.6 view-authoring plan (partially delivered).
- `museum-editor-workspace/` — completed workspace phase plans 1–3.
- `phase-4-scene-creation/` — Phase 4 release plan + the `museum-editor-workspace/phase-4-scene-creation.md` it absorbed.
- `phase-5-textures/` — texture/material/package-export release plan + the four phase-5 sub-plans + the priority-1 splits plan it absorbed.

### `refactor-audit/`

Jul 28 museum-editor audit + 9-slice refactor plan. All slices landed; keep for archaeology only.

### `superpowers/specs/`

- Pre-workspace camera UX specs.
- `phase-5-textures/` — texture/material/package-export design specs (all shipped; engineering contracts live in code).
- `museum-editor-full-track/` — Phase 6.5 split plans/specs rolled into [`../../superpowers/specs/2026-08-09-museum-editor-full-track-design.md`](../../superpowers/specs/2026-08-09-museum-editor-full-track-design.md) for archaeology.

### `superpowers/plans/`

- `museum-editor-full-track/` — same rollup as `superpowers/specs/museum-editor-full-track/`.

## How to read archived material

Find a phase in the table of contents above. Handoffs (`agent-handoffs/`) are post-shipper diaries — they record what landed, deviations, and gates. Plans (`plans/`) are pre-implementation roadmaps. Specs (`superpowers/specs/`) are design decisions carrying the binding requirements for that phase.

If a doc there conflicts with a doc in the live tree, the live tree wins.
