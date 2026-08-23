# Assets

**Read when:** Paris GLBs, licences, catalogue, import/replace models.  
**Last reviewed:** 2026-08-23  
**Full checklist:** [`../archive/ASSET_WORKFLOW.md`](../archive/ASSET_WORKFLOW.md)

---

| Stage | Location |
|-------|----------|
| Source models | `apps/museum/assets-source/models/` |
| Licences | `apps/museum/assets-source/licenses/` |
| Production GLBs | `apps/museum/static/museum/models/` |
| Manifest | `apps/museum/src/lib/content/assets.ts` |
| Placements | `scene.json` via editor |

`AssetModel.svelte` owns load/clone/fallback. Do not add room-local GLTF loaders.  
GLB import pipeline = **deferred** (tracker P4).

## Plan footprint metadata (P2.1)

Floor catalogue models may declare optional canonical `Asset.footprint` metadata:
`{ width, depth, outline? }`, in metres after asset normalization and relative
to the placement pivot. `outline` uses finite `[x, z]` points without a repeated
closing point; valid simple concave polygons are accepted and winding is
normalized. Invalid metadata is rejected by manifest validation; missing or
invalid model metadata is ineligible for Scene Plan projection. `defaultScale`
and `defaultRotation` are already reflected in canonical footprint values and
are not applied again.
