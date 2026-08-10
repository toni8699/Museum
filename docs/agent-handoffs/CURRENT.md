# Current Museum Agent Handoff

## Status

**Phase 6.2 shipped** (commit `847c9d1`). Visitor chunk graph clean; svelte-check 0 / 0; production build exit 0; 899 / 899 tests pass.

**Phases 1a + 1b of the Full Track landed** in this branch's working diff (uncommitted):

- **Phase 1a — Independent Scale UX.** Chain toggle in transform inspector; X/Y/Z fields expand; `PlacementTransform` carries `scaleScalar / scaleVector / scaleMode`. Gizmo + cluster non-uniform propagation gated by `EditorInteractionStore.scaleMode`. Visitor render path falls back to `average(vector)` (documented lossiness).
- **Phase 1b — Placement Ghost Preview.** Wireframe OBB ghost follows cursor once a primitive / asset is armed; click commits via existing `createPendingPrimitiveAt` / `createPendingPlacementAt` / `createPendingLightAt`; Esc cancels; cluster-mode respected. No drag-and-drop — `EditorPlacementTools` (existing) stays the click path; ghost is visual-only.

Test count rose 899 → 954 across 67 vitest files (+46 net). 0 svelte-check regressions. Visitor `/museum` chunk carries zero Phase 1 markers — editor-only routes remain dev-only.

**Next slice:** Phase 2 (Architecture Shape Catalogue) + Phase 3 (Local Asset Import + Compression + Cross-Room Editing). Phase 4+ TBD. See [plan doc](../superpowers/plans/2026-08-09-museum-editor-full-track.md) for task breakdowns.

## Active plan pointer

- **Design:** [`../superpowers/specs/2026-08-09-museum-editor-full-track-design.md`](../superpowers/specs/2026-08-09-museum-editor-full-track-design.md) — vision, design constraints, decisions, out-of-scope seams.
- **Plan:** [`../superpowers/plans/2026-08-09-museum-editor-full-track.md`](../superpowers/plans/2026-08-09-museum-editor-full-track.md) — phased work breakdown with task checklists.
- **Phase 1 handoff (1a + 1b):** [`./phase-6-full-track-1.md`](./phase-6-full-track-1.md) — landed in this branch's working diff; awaits commit when user requests.

The previous Phase 6.5 split (separate `6.5.1 Independent Scale UX` and `6.5.2 Architecture Shape Catalogue` handoffs) is now rolled into this single umbrella track as Phase 1 + Phase 2. Both old docs sit at [`../archive/superpowers/{specs,plans}/museum-editor-full-track/`](../archive/superpowers/specs/museum-editor-full-track/) for archaeology.

## Working diff (uncommitted)

Live branches off 6.2 with three ongoing edits inside `apps/museum/src/lib/editor/`:

1. Cluster OBB rewrite — `cluster-obb.ts` + tests replace per-root AABB with a per-frame PCA-tight OBB around the cluster. Rotates with member gizmo moves.
2. Tool-simplification sweep — `EditorViewportToolbar.svelte` chips removed (Local/Snap/Pivot/gear/Add menu); `EditorSettingsPopover.svelte`, `settings-store.svelte.ts`, `pivot-resolve.ts`, `editor-context-keys.ts` deleted.
3. Persist-tool-mode — gizmo mode no longer resets to translate on every new selection-set (Phase 6.4 carve-out).

This diff needs to becarved up into a clean **Phase 6.4** spec + handoff before merging. The full-track Phase 2 will reintroduce **parts** of the deleted toolbar (Add menu, gear icon) by its own Add submenu route.

## Reading order for next slice

1. [`../plans/museum-editor-workspace/README-museum-editor.md`](../plans/museum-editor-workspace/README-museum-editor.md) — release index stays the source of truth for what ships.
2. [`../superpowers/specs/2026-08-09-museum-editor-full-track-design.md`](../superpowers/specs/2026-08-09-museum-editor-full-track-design.md) — design constraints and decisions.
3. [`../superpowers/plans/2026-08-09-museum-editor-full-track.md`](../superpowers/plans/2026-08-09-museum-editor-full-track-plan.md) — phased work breakdown.
4. [`./phase-6.2.md`](./phase-6.2.md) + [`./phase-6.1.md`](./phase-6.1.md) — last two shipped editor gates.
5. [`../CAMERA_AND_LAYOUT.md`](../CAMERA_AND_LAYOUT.md) — living camera/route contract (untouched by full track).
6. [`../ASSET_WORKFLOW.md`](../ASSET_WORKFLOW.md) — Paris asset workflow (Phase 3 will extend this).
7. `AGENTS.md` (repo root) — repo-wide conventions.

Historical phase handoffs (Phase 1–5, priority-1 file splits, complete-refactor diary, pre-workspace phases) live under [`../archive/agent-handoffs/`](../archive/agent-handoffs/) and are **not** required reading.

## Out-of-scope reminders

- Architecture (rooms) stays owned by `apps/museum/src/lib/content/rooms.ts`. Rough graybox walls / floors are NOT architectural truth — they are Phase 2 placeholders that Phase 3+ asset replace flow swaps for real GLBs.
- Single-museum scope. Multi-project is explicitly out per "limited to single museum project" brief.
- No collision / navmesh. Openings remain visual authoring guidance.
- Editor-only code stays out of visitor chunks. Default-export + chunk-grep gates stand each phase.
- Do not commit unless user requests.
