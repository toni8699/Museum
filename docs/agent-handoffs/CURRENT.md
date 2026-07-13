# Current Museum Agent Handoff

- **Current completed phase:** Phase 2 — placement selection (loop fix + bloat trim).
- **Branch / baseline commit:** `main` at `9019a62`; Phase 0–2 changes are currently uncommitted.
- **Latest handoff:** [`phase-2.md`](./phase-2.md)
- **Verification:** After trim: hard-refresh `/dev/museum-editor` — no `effect_update_depth_exceeded`; select → BoxHelper. `notifyPlacementRootChanged` kept for Phase 3.
- **Next phase:** Phase 3 — TransformControls, uniform scale, inspector, snapshot history.
- **Blocker:** none. Room/camera framing deferred.

## Required Reading Order

1. [`phase-2.md`](./phase-2.md)
2. [`../../apps/museum/src/lib/editor/museum-editor.svelte.ts`](../../apps/museum/src/lib/editor/museum-editor.svelte.ts)
3. [`../../apps/museum/src/lib/editor/EditorSelection.svelte`](../../apps/museum/src/lib/editor/EditorSelection.svelte)
4. [`../../apps/museum/src/lib/editor/EditorSelectionHelper.svelte`](../../apps/museum/src/lib/editor/EditorSelectionHelper.svelte)
5. [`../../apps/museum/src/lib/museum/assets/AssetModel.svelte`](../../apps/museum/src/lib/museum/assets/AssetModel.svelte)
6. [`../../apps/museum/src/lib/editor/MuseumEditorApp.svelte`](../../apps/museum/src/lib/editor/MuseumEditorApp.svelte)

Start Phase 3 by attaching one TransformControls instance to the registered outer placement root and wiring snapshot history before numeric inspector edits.
