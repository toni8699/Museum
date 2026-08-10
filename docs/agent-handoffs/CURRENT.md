# Current Museum Agent Handoff

## Status

**Phase 6.2 shipped.** Last commit `847c9d1`. Visitor chunk graph clean; svelte-check 0 / 0; production build exit 0; 899 / 899 tests pass.

**Next slice:** **Phase 6.5 — Architecture Shaping** (independent scale UX + named architecture shape catalogue). Spec + plan drafted today, both kept separate under `docs/superpowers/specs/` and `docs/superpowers/plans/`. Not implementing yet.

## Working diff (uncommitted)

Live branches off 6.2 with three ongoing edits inside `apps/museum/src/lib/editor/`:

1. Cluster OBB rewrite — `cluster-obb.ts` + tests replace per-root AABB with a per-frame PCA-tight OBB around the cluster. Rotates with member gizmo moves.
2. Tool-simplification sweep — `EditorViewportToolbar.svelte` chips removed (Local/Snap/Pivot/gear/Add menu); `EditorSettingsPopover.svelte`, `settings-store.svelte.ts`, `pivot-resolve.ts`, `editor-context-keys.ts` deleted.
3. Persist-tool-mode — gizmo mode no longer resets to translate on every new selection-set (Phase 6.4 carve-out).

Move this diff into a clean 6.4 spec + handoff before merging; it currently lives as scratch comments.

## Active plan pointer — Phase 6.5

- Design: [`../superpowers/specs/2026-08-09-phase-6-5-architecture-shaping-design.md`](../superpowers/specs/2026-08-09-phase-6-5-architecture-shaping-design.md)
- Plan: [`../superpowers/plans/2026-08-09-phase-6-5-architecture-shaping.md`](../superpowers/plans/2026-08-09-phase-6-5-architecture-shaping.md)

Phase 6.5 lands in two sub-slices:

| Slice | Scope |
|---|---|
| **6.5.1** | Independent Scale UX — `PlacementTransform.scaleVector`, `EditorInteractionStore.scaleMode` (default `uniform` persists), chain-icon toggle in inspector, per-axis gizmo, cluster non-uniform propagation, no schema bump (visitor still scalar) |
| **6.5.2** | Architecture Shape Catalogue — semantic `Wall / Floor / Ceiling / Column / Door / Window` named entries layered on existing `box / plane / cylinder / sphere` kinds (no new primitives), importable from `Add → Architecture` menu |

## Reading order for next slice

1. [`../plans/museum-editor-workspace/README-museum-editor.md`](../plans/museum-editor-workspace/README-museum-editor.md) — release index stays the source of truth for what ships.
2. [`../superpowers/specs/2026-08-09-phase-6-5-architecture-shaping-design.md`](../superpowers/specs/2026-08-09-phase-6-5-architecture-shaping-design.md) — design constraints and decisions for 6.5.
3. [`../superpowers/plans/2026-08-09-phase-6-5-architecture-shaping.md`](../superpowers/plans/2026-08-09-phase-6-5-architecture-shaping.md) — phased work breakdown.
4. [`./phase-6.2.md`](./phase-6.2.md) + [`./phase-6.1.md`](./phase-6.1.md) — last two shipped editor gates.
5. [`../CAMERA_AND_LAYOUT.md`](../CAMERA_AND_LAYOUT.md) — living camera/route contract (untouched by 6.5).
6. [`../ASSET_WORKFLOW.md`](../ASSET_WORKFLOW.md) — Paris asset workflow (untouched by 6.5).
7. `AGENTS.md` (repo root) — repo-wide conventions.

Historical phase handoffs (Phase 4 scene creation, Phase 5 texture/material/package, priority-1 file splits, complete-refactor diary) live under [`../archive/agent-handoffs/`](../archive/agent-handoffs/) and are **not** required reading for 6.5.

## Out-of-scope reminders

- Architecture (rooms) stays owned by `apps/museum/src/lib/content/rooms.ts`. Rough 6.5 boxes are graybox, not architectural truth.
- No collision / navmesh. Openings remain visual authoring guidance.
- Editor-only code stays out of visitor chunks. Default-export + chunk-grep gates stand.
- Do not commit unless user requests.
