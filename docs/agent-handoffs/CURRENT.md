# Current Museum Agent Handoff

- **Current completed phase:** Phase 6.5 — camera path expansion and authoring.
- **Branch / baseline commit:** `main` at `9299029` (`doc`); Phase 6.5 changes are uncommitted.
- **Latest handoff:** [`phase-6.5.md`](./phase-6.5.md)
- **Prior handoff:** [`phase-7.md`](./phase-7.md)
- **Next proposed work:** Phase 6.6 — [`camera view authoring and Director preview`](../plans/camera-view-authoring.md). This is a plan only; no Phase 6.6 code exists yet.
- **Verification:** `npm test` 18 files / 238 tests; `npm run check` 0 errors / 0 warnings; production build passed. Development HTTP smoke returned 200 for museum/editor. Production returned `/museum` 200 and `/dev/museum-editor` 404; no editor path-helper symbols or visitor editor imports were found.
- **Outstanding manual check:** interactive WebGL path-authoring in `/dev/museum-editor`, visual clearance for every connection in both directions, visitor visual regression in `/museum`, and repeated exact Orbit restoration. Browser control was unavailable during implementation.
- **Deferred after the proposed Phase 6.6 work:** tangent/orientation handles, camera roll, per-edge timing, collision/navmesh, guided-order editing, node/connection deletion, and multi-room authoring.

## Required Reading Order

1. [`phase-6.5.md`](./phase-6.5.md)
2. [`../plans/camera-view-authoring.md`](../plans/camera-view-authoring.md) for the proposed Phase 6.6 implementation contract
3. [`../CAMERA_AND_LAYOUT.md`](../CAMERA_AND_LAYOUT.md)
4. [`../../apps/museum/src/lib/content/scene-codec.ts`](../../apps/museum/src/lib/content/scene-codec.ts)
5. [`../../apps/museum/src/lib/content/scene.ts`](../../apps/museum/src/lib/content/scene.ts)
6. [`../../apps/museum/src/lib/museum/navigation/camera-route.ts`](../../apps/museum/src/lib/museum/navigation/camera-route.ts)
7. [`../../apps/museum/src/lib/museum/navigation/camera-motion.ts`](../../apps/museum/src/lib/museum/navigation/camera-motion.ts)
8. [`../../apps/museum/src/lib/editor/museum-editor.svelte.ts`](../../apps/museum/src/lib/editor/museum-editor.svelte.ts)
9. [`../../apps/museum/src/lib/editor/editor-camera-path.ts`](../../apps/museum/src/lib/editor/editor-camera-path.ts)
10. [`phase-7.md`](./phase-7.md) for import/export and dirty-state contracts
11. [`../plans/camera-path-authoring.md`](../plans/camera-path-authoring.md) for the original Phase 6.5 locked design
