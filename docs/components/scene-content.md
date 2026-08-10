# Scene content

**Read when:** entities, asset library, materials/textures, lights, clusters.  
**Last reviewed:** 2026-08-10

---

v6 editable: **model** / **primitive** (`box|plane|cylinder|sphere`) / **light** · textures · material instances · clusters.  
**Architecture rooms are not scene entities** — see [`../architecture.md`](../architecture.md).

| Assets tab | Today |
|------------|--------|
| Models | Catalogue; Paris-oriented placement gate |
| Shapes | Box / plane / cylinder / sphere |
| Lights | Point / spot / directional — aim by rotation |
| Textures | URI/file → bind via materials (not scene objects) |

Clusters = named same-room member groups; visitor renders flat; **no** prefab library yet.  
Session lighting/fog = preview only, not saved.  
GLB provenance: [`assets.md`](./assets.md).
