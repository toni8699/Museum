# Museum editor (code)

Dev-only authoring UI. Prod stubbed out of visitor chunks.

## Docs (read one component)

Hub routing: [`docs/README.md`](../../../../docs/README.md)  
Live slice: [`docs/hand-off/CURRENT.md`](../../../../docs/hand-off/CURRENT.md)  
P0: [`docs/plans/2026-08-10-layout-cad-foundation.md`](../../../../docs/plans/2026-08-10-layout-cad-foundation.md)

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
| `MuseumEditorApp.svelte` | Shell |
| `store/` | Session, document, history, mutators |
| `layout/` | Layout CAD (P0) |
| `museum-editor.svelte.ts` | Facade |
| `Editor*.svelte` | UI / helpers |
| `hooks/shortcuts.svelte.ts` | Keyboard |
| `export/` `import/` | Package I/O |

Shared motion: `../museum/navigation/` — do not fork.
