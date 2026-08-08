# Current Museum Agent Handoff

- **Current slice:** **Phase 5 shipped.** Binary upload, object URLs, package export **complete** through Tasks 1–11 + phase-5.5 browser smoke + polish-batch fixes (MIME-aligned archive filenames, HMR-safe `clearExcept` teardown, drop-zone non-image guard, `aria-describedby` parity on Project menu). 791 / 791 tests pass; svelte-check 0 / 0; build exits 0; visitor chunk isolation confirmed (no 5.4 module leak in `/museum`'s production bundle).
- **Latest handoff:** [`./phase-5.4.md`](./phase-5.4.md)
- **Textured MVP closed.** Texture import + material instances + package export — every Phase 5 deliverable landed. The plan-level slice 5.5 (final verification, browser-smoke, handoff) collapsed into the Phase 5.4 wrap.
- **Active release index:** [`../plans/museum-editor-workspace/README-museum-editor.md`](../plans/museum-editor-workspace/README-museum-editor.md)
- **Open follow-up (cosmetic, non-blocking):** `EditorInspector.svelte` preview thumbnail `<img src={uri}>` falls back to a direct fetch for `/local/...` URIs (404) instead of routing through `BinaryTextureStore.objectUrlFor`. One-line fix.
- **Next recommended slice:** Phase 6 —- a fresh wire-up (not a 5.6 polish). Brainstorm + spec first per the brainstorming skill; the editor + visitor surfaces from Phase 5 are the readymade platform.
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
