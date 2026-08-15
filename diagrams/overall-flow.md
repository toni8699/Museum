# Overall Flow

**In one breath:** author layout + scene JSON → validate into one project → derive
renderer-neutral geometry → plan, 3D, and hit-testing consume it; the scene also
projects into the camera tour. Only authored data persists.

```mermaid
flowchart LR
    A["LayoutDocument<br/>rooms, walls, openings, objects"] --> B["Validate<br/>strict schema + cross-validation"]
    B --> C["Project JSON<br/>serialized MuseumProject"]

    C --> D["Geometry derivation<br/>compileLayoutGeometry()"]
    D --> E["Compiled geometry<br/>points, spans, polygons,<br/>normals, bounds, queries"]
    E --> F["2D Plan (SVG)<br/>PlanRenderModel"]
    E --> G["3D Preview<br/>procedural Three.js"]
    E --> H["Visitor 3D<br/>LayoutMuseumShell"]
    E --> I["Selection & hit testing<br/>resolvePlanHit"]

    J["SceneDocument<br/>entities, materials, camera graph"] --> C
    J -.-> K["Camera tour<br/>camera-route + camera-motion"]
    K --> H

    C -. "only authored data is saved" .-> P["Persisted"]
    E -. "derived; rebuilt when needed" .-> N["Not persisted"]
```

## Notes

- Authoring produces two documents: a **layout** (rooms, walls, openings, objects) and a
  **scene** (entities, materials, camera graph), which validate into one serialized project.
- Both the editor and the visitor consume the same compiled geometry: one source of truth,
  no runtime geometry derivation.
- The plan is a pure render model over that geometry; hit testing runs over compiled query
  records (`resolvePlanHit`).
- The camera tour projects scene data through the single route/motion system
  (`camera-route.ts` + `camera-motion.ts`).
- Only authored data persists; compiled geometry is derived and rebuilt when needed.
- Documents carry no version fields; the codecs parse one canonical shape each
  (see [`architecture.md`](./architecture.md#0-documents-one-shape-no-versioning)).
