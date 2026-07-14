# Current Museum Agent Handoff

- **Current completed phase:** Phase 3 — room-focused placement transforms and snapshot history.
- **Branch / baseline commit:** `main` at `c7b3f69` (`phase 2`); Phase 3 changes are uncommitted.
- **Latest handoff:** [`phase-3.md`](./phase-3.md)
- **Verification:** 54/54 tests; check 0/0; build passed; production preview editor 404 and museum 200; real editor strings absent from production output.
- **Outstanding manual check:** interactive WebGL acceptance (camera focus, gizmo gesture ownership, live GLBs, hard-refresh loop check) could not run because no browser backend was available.
- **Next phase:** Phase 4 — asset manifest/library migration; confirm exact creation/placement scope before implementation.

## Required Reading Order

1. [`phase-3.md`](./phase-3.md)
2. [`../../apps/museum/src/lib/editor/museum-editor.svelte.ts`](../../apps/museum/src/lib/editor/museum-editor.svelte.ts)
3. [`../../apps/museum/src/lib/content/assets.ts`](../../apps/museum/src/lib/content/assets.ts)
4. [`../../apps/museum/src/lib/types/assets.ts`](../../apps/museum/src/lib/types/assets.ts)
5. [`../../apps/museum/src/lib/museum/assets/AssetModel.svelte`](../../apps/museum/src/lib/museum/assets/AssetModel.svelte)

Phase 3 keeps all edits session-only. Do not add persistence or a second asset loader while beginning Phase 4.
