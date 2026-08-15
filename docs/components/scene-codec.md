# Scene codec layout

**Read when:** working inside `apps/museum/src/lib/content/scene-codec/`.  
**Last reviewed:** 2026-08-15

---

Five files, one public surface. The document has one canonical shape; no version field, no migrations.

```text
scene-codec/
  index.ts          ← public barrel: validate/parse/serialize + public types
  readers.ts        ← leaf: typed JSON readers + JsonRecord, shared by all parsers
  parse-entities.ts ← entities, materials, textures, clusters
  parse-document.ts ← nodes, waypoints, connections, timing, semantic validation
  canonical.ts      ← clone helpers + deterministic serializer (consumed by index only)
```

## Boundary rule

- **Only `index.ts` is public.** Consumers (editor, project codec, tests) import from `$lib/content/scene-codec`, never from the siblings.
- The boundary is **convention, not enforced by the module system.** The `@internal` JSDoc tags are the contract: they forbid sibling imports. Restructuring the five files is safe as long as the `index.ts` surface is unchanged.
- Public surface (frozen): `SceneDocumentIssue`, `SceneDocumentValidationResult`, `SceneDocumentValidationError`, `cameraSceneConnectionTimingFailureReason`, `validateSceneDocument`, `parseSceneDocumentJson`, `serializeSceneDocument`.

## Dependency direction

Value imports flow **into** the barrel: `index.ts` imports from `readers`, `parse-entities`, `parse-document`, `canonical`. Siblings may import the public issue type from `./index` as `import type` only — erased at compile time, so there is no runtime cycle. `readers.ts` is the shared leaf; keep helpers several parsers use there instead of duplicating them.
