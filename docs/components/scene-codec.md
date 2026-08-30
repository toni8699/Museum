# Scene codec layout

**Read when:** working inside `packages/project-model/src/scene-codec/` or its app facade.
**Last reviewed:** 2026-08-30 (P17 visitor cleanup)

---

Five files, one public surface. The document has one canonical shape; no version field, no migrations.

```text
packages/project-model/src/scene-codec/
  index.ts          ← public barrel: validate/parse/serialize + public types
  readers.ts        ← leaf: typed JSON readers + JsonRecord, shared by all parsers
  parse-entities.ts ← entities, materials, textures, clusters
  parse-document.ts ← nodes, waypoints, connections, timing, semantic validation
  canonical.ts      ← clone helpers + deterministic serializer (consumed by index only)
```

## Boundary rule

- **Only `index.ts` is public.** Package consumers import from `@portfolio/project-model`; the editor facade at `apps/editor/src/lib/content/scene-codec/` configures the same barrel for catalogue validation. The visitor has no codec facade: `apps/museum/src/lib/content/scene.ts` calls the package directly through its catalogue-policy seam. No consumer imports the siblings.
- The boundary is **convention, not enforced by the module system.** The `@internal` JSDoc tags are the contract: they forbid sibling imports. The app facade is a thin adapter, not a second codec; restructuring the five files is safe as long as the package `index.ts` surface is unchanged.
- Public surface (frozen): `SceneDocumentIssue`, `SceneDocumentValidationResult`, `SceneDocumentValidationError`, `cameraSceneConnectionTimingFailureReason`, `validateSceneDocument`, `parseSceneDocumentJson`, `serializeSceneDocument`.

## Dependency direction

Value imports flow **into** the barrel: `index.ts` imports from `readers`, `parse-entities`, `parse-document`, `canonical`. Siblings may import the public issue type from `./index` as `import type` only — erased at compile time, so there is no runtime cycle. `readers.ts` is the shared leaf; keep helpers several parsers use there instead of duplicating them. Catalogue/material/texture policy enters through the pure `SceneValidationOptions` seam supplied by each app's `scene-validation.ts` adapter.
