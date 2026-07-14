# Current Museum Agent Handoff

- **Current completed phase:** Phase 3.5 — precision placement and plane grounding.
- **Branch / baseline commit:** `main` at `c7b3f69` (`phase 2`); Phases 3–3.5 changes may still be uncommitted.
- **Latest handoff:** [`phase-3.5.md`](./phase-3.5.md)
- **Prior handoff:** [`phase-3.md`](./phase-3.md)
- **Verification:** 71/71 tests; check 0/0; build passed; production museum-editor client stub remains tiny; Phase 3.5 UI strings (`Drop to Floor`, `Keep on floor`, `precision placement`) absent from production client output.
- **Outstanding manual check:** interactive WebGL acceptance (snap while dragging, Shift bypass, Drop to Floor / G, Keep on Floor after rotate/scale, undo/redo) — run in `/dev/museum-editor`.
- **Next phase:** Phase 4 — asset manifest/library migration; confirm exact creation/placement scope before implementation.

## Required Reading Order

1. [`phase-3.5.md`](./phase-3.5.md)
2. [`phase-3.md`](./phase-3.md)
3. [`../../apps/museum/src/lib/editor/museum-editor.svelte.ts`](../../apps/museum/src/lib/editor/museum-editor.svelte.ts)
4. [`../../apps/museum/src/lib/editor/editor-placement.ts`](../../apps/museum/src/lib/editor/editor-placement.ts)
5. [`../../apps/museum/src/lib/content/assets.ts`](../../apps/museum/src/lib/content/assets.ts)
6. [`../../apps/museum/src/lib/types/assets.ts`](../../apps/museum/src/lib/types/assets.ts)
