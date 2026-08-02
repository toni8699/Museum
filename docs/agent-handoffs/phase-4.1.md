# Phase 4.1 — Schema v5 entity union

**Status:** Complete  
**Plan:** [`../plans/museum-editor-workspace/phase-4-scene-creation.md`](../plans/museum-editor-workspace/phase-4-scene-creation.md) slice 4.1

## Delivered

- Canonical document is `version: 5` with `entities: SceneEntity[]` (`model` | `primitive` | `light`).
- v1–v4 still parse; `objects[]` migrate one-for-one into `kind: 'model'` entities (IDs, transforms, assetId, fallback, clusters preserved; `name` from asset catalogue).
- Serialize / import / export emit only canonical v5. Unknown keys still rejected.
- Runtime `resolveSceneDocument` still exposes `objects` as model-only projections for `MuseumAssets` until 4.2.
- Editor placement CRUD / tree / selection read-write `document.entities`.
- Free-only tour rules and view-keyframe pose checks apply on v4 and v5 (same as v2/v3 guided subset).
- Checked-in `museum-scene.json` rewritten to v5 entities.
- Codec tests cover primitive + light validate / round-trip and invalid dimensions / unexpected light fields.

## Not in this slice

- Shared entity renderer / selection helpers (4.2).
- Add menu / Assets → Shapes / primitive inspector (4.3).
- Light creation UI / light viewport mounts (4.4).
- Textures / material instances (Phase 5).

## Key files

- `apps/museum/src/lib/content/scene.ts` — entity types + helpers
- `apps/museum/src/lib/content/scene-codec.ts` — parse / migrate / canonicalize
- `apps/museum/src/lib/content/museum-scene.json` — v5 data
- `apps/museum/src/lib/content/materials.ts` — `isMaterialId`
- Editor placement / selection paths that previously used `document.objects`

## Verify

```bash
cd apps/museum && npx vitest run
```

## Next

Phase 4.2 — one scene-entity renderer dispatching by kind; stable-ID selection registration; keep editor helpers out of visitor bundles.
