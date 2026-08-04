# Current Museum Agent Handoff

- **Current slice:** Priority-1 file splits — final gate **complete**. Six slices landed (controller-hosts, preview-commands, texture-controller, test split, scene-codec split, final gate). `museum-editor.svelte.ts` 3 640 → 2 554, `museum-editor.test.ts` 4 350 → themed suites + 305-LOC residual, `scene-codec.ts` 2 337 → 9-file directory with 274-LOC barrel.
- **Latest handoff:** [`./2026-08-03-complete-priority-1-splits.md`](./2026-08-03-complete-priority-1-splits.md)
- **Active release index:** [`../plans/museum-editor-workspace/README-museum-editor.md`](../plans/museum-editor-workspace/README-museum-editor.md)
- **Next recommended slice:** Phase 5.3 — shared material-instance rendering + texture-cache lifecycle; continue from [`../plans/museum-editor-workspace/phase-5-textures.md`](../plans/museum-editor-workspace/phase-5-textures.md)
  - Optional precursor (only if the user wants another refactor round): residual getter-surface thinning on `museum-editor.svelte.ts` — see Step 6 of the final release handoff.
- **Do not commit** unless the user requests it.

Historical handoffs and superseded plans live under [`../archive/`](../archive/README.md).

## Required Reading Order

1. [`../plans/museum-editor-workspace/README-museum-editor.md`](../plans/museum-editor-workspace/README-museum-editor.md)
2. [`../plans/museum-editor-workspace/phase-5-textures.md`](../plans/museum-editor-workspace/phase-5-textures.md)
3. [`../superpowers/specs/2026-08-02-phase-5-2-texture-library-assignment-design.md`](../superpowers/specs/2026-08-02-phase-5-2-texture-library-assignment-design.md)
4. [`../superpowers/plans/2026-08-02-phase-5-2-texture-library-assignment.md`](../superpowers/plans/2026-08-02-phase-5-2-texture-library-assignment.md)
5. [`./phase-5.2.md`](./phase-5.2.md)
6. [`./phase-5.1.md`](./phase-5.1.md)
7. [`./2026-08-03-complete-priority-1-splits.md`](./2026-08-03-complete-priority-1-splits.md)
8. [`../CAMERA_AND_LAYOUT.md`](../CAMERA_AND_LAYOUT.md)
9. [`../ASSET_WORKFLOW.md`](../ASSET_WORKFLOW.md) (when touching assets / Paris models)
10. `AGENTS.md` (repo root)

Optional history (not required for Phase 5.3):

- Phase 4 gate: [`./phase-4.5.md`](./phase-4.5.md)
- Priority-1 slice handoffs: Splits 1–5 (`./2026-08-03-complete-priority-1-split-{1..5}-*.md`)
- Workspace phases 1–3: [`../archive/agent-handoffs/workspace-phases/`](../archive/agent-handoffs/workspace-phases/)
- Complete-refactor diary: [`../archive/agent-handoffs/complete-refactor/`](../archive/agent-handoffs/complete-refactor/)
- Pre–workspace-release phases: [`../archive/agent-handoffs/`](../archive/agent-handoffs/)
