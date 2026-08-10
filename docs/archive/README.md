# Archived Museum Docs

Historical plans, handoffs, specs, and deep guides. **Not active implementation authority.**

## Live authority

| Doc | Role |
|-----|------|
| [`../README.md`](../README.md) | Architecture + component contracts |
| [`../hand-off/CURRENT.md`](../hand-off/CURRENT.md) | Live slice |
| [`../plans/2026-08-10-layout-cad-foundation.md`](../plans/2026-08-10-layout-cad-foundation.md) | Active P0 (design + plan merged) |

If archive conflicts with live tree, **live tree wins**.

## Contents

### Top-level deep guides (moved here 2026-08-10)

- `CAMERA_AND_LAYOUT.md` — long camera/path authoring checklist (contracts summarized in live README).
- `ASSET_WORKFLOW.md` — Paris GLB optimization checklist (summary in live README).

### `museum-editor/`

Former sectioned durable context (north-star, shell, scene, …). Folded into [`../README.md`](../README.md) 2026-08-10.

### `agent-handoffs/`

Shipped phase diaries (workspace 1–3, phases 0–7, 4–5, 6.x, full-track Phase 1, complete-refactor slices).

### `plans/`

Completed workspace / phase-4 / phase-5 plans; old camera authoring plans; workspace release index.

### `refactor-audit/`

Jul 28 museum-editor audit + 9-slice refactor plan. Done.

### `superpowers/`

| Subfolder | What |
|-----------|------|
| `specs/` | Shipped designs (phase-5 textures, phase-6, full-track, old layout CAD design split) |
| `plans/` | Shipped/deferred plans (phase-6, full-track Phase 2/3 archaeology) |
| `reviews/` | Goal-alignment review for layout CAD (decisions now in live plan §12) |

## How to read

Handoffs = post-ship diaries. Plans = pre-implementation roadmaps. Specs = design for that phase. Prefer live `plans/` when a merged active file exists.
