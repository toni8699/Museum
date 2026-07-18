# Current Museum Agent Handoff

- **Current completed phase:** Phase 4 — asset manifest and library migration.
- **Branch / baseline commit:** `main` at `c7b3f69` (`phase 2`); Phases 3–3.5 changes may still be uncommitted.
- **Latest handoff:** [`phase-4.md`](./phase-4.md)
- **Prior handoff:** [`phase-3.6.md`](./phase-3.6.md)
- **Verification:** 98/98 tests; check 0 errors / 0 warnings; build passed.
- **Outstanding manual check:** interactive WebGL acceptance (right-panel grouping, folder auto-expand, rename focus/Save/Escape, pivot transforms, End drop, rigid Keep Group on Floor, F framing, focus-guarded shortcuts) — run in `/dev/museum-editor`. The in-app browser backend was unavailable during implementation.
- **Next phase:** Phase 5 — placement creation and asset-library editor workflows.

## Required Reading Order

1. [`phase-4.md`](./phase-4.md)
2. [`phase-3.6.md`](./phase-3.6.md)
3. [`phase-3.5.md`](./phase-3.5.md)
4. [`../../apps/museum/src/lib/content/assets.ts`](../../apps/museum/src/lib/content/assets.ts)
5. [`../../apps/museum/src/lib/types/assets.ts`](../../apps/museum/src/lib/types/assets.ts)
6. [`../../apps/museum/src/lib/content/scene.ts`](../../apps/museum/src/lib/content/scene.ts)
