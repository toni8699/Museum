# Phase 4.2 — Shared entity renderer + selection registration

**Status:** Complete  
**Plan:** [`../plans/museum-editor-workspace/phase-4-scene-creation.md`](../plans/museum-editor-workspace/phase-4-scene-creation.md) slice 4.2

## Delivered

- `RuntimeMuseumScene.entities` clones all document entities (room-local poses). `objects` stays model-only for Paris activation / legacy callers.
- `MuseumEntities.svelte` is the single kind-dispatch renderer (model → `AssetModel`, primitive → `EntityPrimitive`, light → `EntityLight`).
- Editor path wraps every entity in `EditorPlacementRoot` (stable `placementId` = entity id). Lights get an invisible pick-proxy sphere for raycast / BoxHelper.
- Visitor path mounts the same entities without registry / pick proxies. Editor helpers stay in `EditorViewport`, not `MuseumScene`.
- Scene tree lists all Paris entities (name + kind meta). Cluster add stays model-only. Inspector transform works for any single selected entity; asset fields stay model-only.
- `MuseumAssets.svelte` is a thin alias → `MuseumEntities`.

## Not in this slice

- Add menu / Assets → Shapes / primitive create+inspector (4.3).
- Light create UI / richer light helpers (4.4).
- Checked-in sample primitive/light rows in `museum-scene.json` (creation comes later).
- Textures / material instances (Phase 5).

## Key files

- `apps/museum/src/lib/content/scene.ts` — `entities` on runtime + `cloneSceneEntity`
- `apps/museum/src/lib/museum/MuseumEntities.svelte`
- `apps/museum/src/lib/museum/entities/EntityPrimitive.svelte`
- `apps/museum/src/lib/museum/entities/EntityLight.svelte`
- `apps/museum/src/lib/museum/MuseumScene.svelte`
- `apps/museum/src/lib/editor/EditorSceneTree.svelte`
- `apps/museum/src/lib/editor/EditorInspector.svelte`

## Verify

```bash
cd apps/museum && npx vitest run
```

## Next

Phase 4.3 — primitive creation, placement, inspector, and history.
