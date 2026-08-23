# Museum editor (code)

Dev-only authoring UI. Prod stubbed out of visitor chunks.

## Docs (read one component)

Hub routing: [`docs/README.md`](../../../../../docs/README.md)  
Live slice: [`docs/hand-off/CURRENT.md`](../../../../../docs/hand-off/CURRENT.md)  
P0 (archived): [`docs/archive/plans/pre-h1-letters/2026-08-10-layout-cad-foundation.md`](../../../../../docs/archive/plans/pre-h1-letters/2026-08-10-layout-cad-foundation.md)

| Working on | Doc |
|------------|-----|
| Vision | `docs/north-star.md` |
| Layout vs `rooms.ts` | `docs/architecture.md` |
| Chrome / workspaces | `docs/components/shell.md` |
| Entities / library | `docs/components/scene-content.md` |
| Ghost / gizmo / scale | `docs/components/placement.md` |
| Tour / timeline | `docs/components/camera-tour.md` |
| Schema / I/O | `docs/components/persistence.md` |
| GLB / catalogue | `docs/components/assets.md` |

**Do not** load every docs file. Update the matching doc when contracts change.

## Code map

| Area | Role |
|------|------|
| `app/` | Shell components — `EditorApp.svelte` (live), `MuseumEditorApp.svelte` (frozen relic shell) |
| `store/` | Session, document, history, mutators — controller-owned `$state` |
| `layout/` | Layout CAD |
| `camera/` · `fields/` | Camera surface · generic form widgets |
| `editor-store.svelte.ts` | Composition root (read-only getter delegates + wiring) |
| `Editor*.svelte` | UI / helpers |
| `hooks/shortcuts.svelte.ts` | Keyboard |
| `export/` `import/` | Package I/O |

Shared motion: `../museum/navigation/` — do not fork.
