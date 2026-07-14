# Current Museum Agent Handoff

- **Current completed phase:** Phase 3.6 — clustering hierarchy and editor camera framing.
- **Branch / baseline commit:** `main` at `c7b3f69` (`phase 2`); Phases 3–3.5 changes may still be uncommitted.
- **Latest handoff:** [`phase-3.6.md`](./phase-3.6.md)
- **Prior handoff:** [`phase-3.5.md`](./phase-3.5.md)
- **Verification:** 88/88 tests; check 0 errors / 0 warnings; build passed.
- **Outstanding manual check:** interactive WebGL acceptance (multi-select, cluster actions, pivot transforms, End drop, rigid Keep Group on Floor, F framing, focus-guarded shortcuts) — run in `/dev/museum-editor`. The in-app browser backend was unavailable during implementation.
- **Next phase:** Phase 4 — asset manifest/library migration; confirm exact creation/placement scope before implementation.

## Required Reading Order

1. [`phase-3.6.md`](./phase-3.6.md)
2. [`phase-3.5.md`](./phase-3.5.md)
3. [`../../apps/museum/src/lib/editor/museum-editor.svelte.ts`](../../apps/museum/src/lib/editor/museum-editor.svelte.ts)
4. [`../../apps/museum/src/lib/editor/editor-placement.ts`](../../apps/museum/src/lib/editor/editor-placement.ts)
5. [`../../apps/museum/src/lib/content/assets.ts`](../../apps/museum/src/lib/content/assets.ts)
6. [`../../apps/museum/src/lib/types/assets.ts`](../../apps/museum/src/lib/types/assets.ts)
