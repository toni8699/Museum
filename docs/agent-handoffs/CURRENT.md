# Current Museum Agent Handoff

- **Current slice:** **Phase 6.2 shipped.** OBB selection outline (rotation-aware corners-stream), Active Object multi-select pivot, editor settings popover (snap step sliders + snap default + pivot mode) persisted to `museum-editor:settings:v1` localStorage, toolbar mode/space/pivot chips bound to `interactionStore` + `settingsStore`, `Cmd+,` opens popover. **899 / 899** tests pass (+38 over 6.1); svelte-check 0 / 0; production build exit 0; visitor chunk graph clean.
- **Latest handoff:** [`./phase-6.2.md`](./phase-6.2.md)
- **What's next:** Phase 6.3 — marquee box-select + Individual Origins multi-select pivot (carry-overs from 6.1 §5).
- **Open follow-up (cosmetic):** Mode chip in viewport toolbar not yet bound to `interactionStore.mode`. One-line binding; trivial.
- **Active release index:** [`../plans/museum-editor-workspace/README-museum-editor.md`](../plans/museum-editor-workspace/README-museum-editor.md)
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
11. [`./phase-5.4.md`](./phase-5.4.md) — current slice

Optional history (not required for Phase 5 close):

- Phase 4 gate: [`./phase-4.5.md`](./phase-4.5.md)
- Priority-1 slice handoffs: Splits 1–5 (`./2026-08-03-complete-priority-1-split-{1..5}-*.md`)
- Workspace phases 1–3: [`../archive/agent-handoffs/workspace-phases/`](../archive/agent-handoffs/workspace-phases/)
- Complete-refactor diary: [`../archive/agent-handoffs/complete-refactor/`](../archive/agent-handoffs/complete-refactor/)
- Pre–workspace-release phases: [`../archive/agent-handoffs/`](../archive/agent-handoffs/)
