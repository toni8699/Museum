# Current Museum Agent Handoff

- **Current completed phase:** Phase 1 — production-isolated `/dev/museum-editor` shell, editor store, three-column UI, OrbitControls viewport.
- **Branch / baseline commit:** `main` at `9019a62`; Phase 0 + Phase 1 changes are currently uncommitted.
- **Latest handoff:** [`phase-1.md`](./phase-1.md)
- **Verification:** `npm test` — 35/35 passed; `npm run check` — 0 errors/0 warnings; `npm run build` — passed; production preview `/dev/museum-editor` — 404; `/museum` — 200; client editor chunk is stub-only. Dev `/dev/museum-editor` — 200. Browser/WebGL orbit + pending visitor visual tour remain manual.
- **Next phase:** Phase 2 — placement root registry, raycast selection, outliner, BoxHelper.
- **Blocker:** none for implementation. A browser-capable session is needed for orbit interaction and the pending visitor regression check.

## Required Reading Order

1. [`phase-1.md`](./phase-1.md)
2. [`../../apps/museum/src/lib/editor/MuseumEditorApp.svelte`](../../apps/museum/src/lib/editor/MuseumEditorApp.svelte)
3. [`../../apps/museum/src/lib/editor/EditorViewport.svelte`](../../apps/museum/src/lib/editor/EditorViewport.svelte)
4. [`../../apps/museum/src/lib/editor/museum-editor.svelte.ts`](../../apps/museum/src/lib/editor/museum-editor.svelte.ts)
5. [`../../apps/museum/src/lib/museum/MuseumAssets.svelte`](../../apps/museum/src/lib/museum/MuseumAssets.svelte)
6. [`../../apps/museum/src/lib/museum/MuseumScene.svelte`](../../apps/museum/src/lib/museum/MuseumScene.svelte)

Start Phase 2 by registering outer placement roots with `userData.editorEntity`, then wiring an explicit editor raycaster (not per-mesh click).
