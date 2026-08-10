# Assets

**Read when:** Paris GLBs, licences, catalogue, import/replace models.  
**Last reviewed:** 2026-08-10  
**Full checklist:** [`../archive/ASSET_WORKFLOW.md`](../archive/ASSET_WORKFLOW.md)

---

| Stage | Location |
|-------|----------|
| Source models | `apps/museum/assets-source/models/` |
| Licences | `apps/museum/assets-source/licenses/` |
| Production GLBs | `apps/museum/static/museum/models/` |
| Manifest | `apps/museum/src/lib/content/assets.ts` |
| Placements | `museum-scene.json` via editor |

`AssetModel.svelte` owns load/clone/fallback. Do not add room-local GLTF loaders.  
GLB import pipeline (full-track Phase 3) = **deferred** until layout-backed load preferred ([`../north-star.md`](../north-star.md)).
