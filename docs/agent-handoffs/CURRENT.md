# Current Museum Agent Handoff

- **Current completed phase:** Phase 6 — camera editing and drift-free preview.
- **Branch / baseline commit:** `main` at `f4324a4` (`phase 4`); Phase 5 and Phase 6 changes are uncommitted.
- **Latest handoff:** [`phase-6.md`](./phase-6.md)
- **Prior handoff:** [`phase-5.md`](./phase-5.md)
- **Verification:** 173/173 tests; check 0 errors / 0 warnings; build passed; production `/museum` 200 and `/dev/museum-editor` 404; editor implementation absent from production chunks.
- **Outstanding manual check:** interactive WebGL acceptance for the Phase 5 placement workflows and Phase 6 helper picking, persistent gizmo/orbit ownership, yawed-room camera editing, preview timing/hold/Stop/Escape, and repeated exact restoration. The in-app browser backend was unavailable during implementation.
- **Next phase:** Phase 7 persistence/import/export and runtime document validation; broader architecture documentation remains Phase 8.

## Required Reading Order

1. [`phase-6.md`](./phase-6.md)
2. [`phase-5.md`](./phase-5.md)
3. [`../../apps/museum/src/lib/editor/museum-editor.svelte.ts`](../../apps/museum/src/lib/editor/museum-editor.svelte.ts)
4. [`../../apps/museum/src/lib/editor/EditorCameraRig.svelte`](../../apps/museum/src/lib/editor/EditorCameraRig.svelte)
5. [`../../apps/museum/src/lib/museum/navigation/camera-motion.ts`](../../apps/museum/src/lib/museum/navigation/camera-motion.ts)
6. [`../../apps/museum/src/lib/content/scene.ts`](../../apps/museum/src/lib/content/scene.ts)
