# Phase 5.1 Schema v6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add canonical schema v6 texture assets, material instances, optional renderable-entity material-instance references, and deterministic v1–v5 migration without changing rendering behavior.

**Architecture:** Keep v6 additive. Canonical documents require `textures` and `materials`; model and primitive entities may reference `materialInstanceId`, while primitives retain catalogue `materialId` as fallback. Strict codec parsing validates IDs, references, numeric overrides, and root-relative public texture URIs before canonicalization. Runtime resolution deep-clones new document data but does not apply it until Phase 5.3.

**Tech Stack:** TypeScript 5.8, Vitest 3, SvelteKit 2, existing strict scene codec.

## Global Constraints

- Canonical schema version is `6`; only canonical v6 serializes.
- v1–v5 inputs migrate deterministically and remain unmodified.
- `textures` and `materials` are required arrays in v6 and become empty arrays during legacy migration.
- `materialInstanceId` is optional on model and primitive entities; light entities cannot define it.
- Primitive `materialId` remains the static-catalogue fallback in Phase 5.1.
- Texture URIs are root-relative public paths beginning with one `/`; reject protocols, `//`, traversal, backslashes, query/hash fragments, and encoded traversal.
- `roughness` and `metalness` overrides must be finite numbers in `[0, 1]`.
- Texture/material/entity references must resolve inside the same canonical document.
- No rendering, editor UI, assignment, upload, blob URL, ZIP, or package-export work.
- No commit unless user explicitly requests one.

---

### Task 1: Lock schema-v6 behavior with failing codec tests

**Files:**
- Modify: `apps/museum/src/lib/content/scene-codec.test.ts`
- Modify: `apps/museum/src/lib/content/scene.test.ts`

**Interfaces:**
- Consumes: `validateSceneDocument(input: unknown)`, `serializeSceneDocument(document: unknown)`.
- Produces: executable contract for v6 types, migration, validation, canonical order, and runtime cloning.

- [ ] **Step 1: Add a v5 fixture converter**

Create a helper that strips v6-only root arrays and entity `materialInstanceId` fields from a cloned canonical document, then sets `version: 5`.

- [ ] **Step 2: Add migration tests**

Assert v1, v2, v3, v4, and v5 each validate to `version: 6`, preserve old scene/navigation data, add fresh empty `textures`/`materials`, do not mutate input, and produce repeatable canonical JSON.

- [ ] **Step 3: Add canonical v6 round-trip tests**

Use:

```ts
textures: [
  { id: 'texture-wall-detail', name: 'Wall Detail', uri: '/museum/textures/wall-detail.webp' }
],
materials: [
  {
    id: 'material-wall-detail',
    name: 'Wall Detail',
    baseMaterialId: 'plaster-warm',
    baseTextureId: 'texture-wall-detail',
    roughness: 0.7,
    metalness: 0.1
  }
]
```

Assign `materialInstanceId: 'material-wall-detail'` to one model and one primitive. Assert stable field order, stable IDs, preserved array order, deep-cloned values, and canonical repeatability.

- [ ] **Step 4: Add rejection tests**

Cover:

```text
duplicate texture ID
duplicate material ID
unknown baseMaterialId
unknown baseTextureId
unknown entity materialInstanceId
materialInstanceId on light
roughness or metalness outside [0, 1]
blob:, data:, http:, https:, file:
//host/path
/../path
/%2e%2e/path
/path\file.png
/path/file.png?cache=1
/path/file.png#fragment
v5 root textures/materials
v5 entity materialInstanceId
v6 missing textures/materials
```

- [ ] **Step 5: Run focused tests and verify RED**

Run:

```bash
npm run test -w @portfolio/museum -- --run src/lib/content/scene-codec.test.ts src/lib/content/scene.test.ts
```

Expected: failures because version 6 is unsupported and new fields are rejected or absent.

### Task 2: Add canonical v6 document and runtime types

**Files:**
- Modify: `apps/museum/src/lib/content/scene.ts`

**Interfaces:**
- Produces:

```ts
export type SceneTextureAsset = {
  id: string;
  name: string;
  uri: string;
};

export type SceneMaterialInstance = {
  id: string;
  name: string;
  baseMaterialId: MaterialId;
  baseTextureId?: string;
  roughness?: number;
  metalness?: number;
};
```

- [ ] **Step 1: Add optional renderable material references**

Add `materialInstanceId?: string` to `SceneModelEntity` and each `ScenePrimitiveEntity` branch. Do not add it to `SceneEntityBase` or `SceneLightEntity`.

- [ ] **Step 2: Advance canonical document version**

Set `MUSEUM_SCENE_SCHEMA_VERSION` to `6`, change `MuseumSceneDocument.version` to `6`, and add required `textures` and `materials` arrays before `entities`.

- [ ] **Step 3: Extend runtime projection**

Add `textures` and `materials` to `RuntimeMuseumScene`. Clone optional entity material references and both resource arrays in `resolveSceneDocument`.

### Task 3: Parse, validate, migrate, and serialize v6

**Files:**
- Modify: `apps/museum/src/lib/content/scene-codec.ts`

**Interfaces:**
- Consumes: new scene types from Task 2.
- Produces: strict v1–v6 validation returning canonical v6.

- [ ] **Step 1: Separate parsed v5 and v6 shapes**

Keep v5 as an entities-based legacy document without v6 root arrays or entity material references. Parse v6 with required `textures`, `materials`, and v6 entity keys.

- [ ] **Step 2: Add texture parser**

Validate exact keys `id`, `name`, `uri`. Require non-empty strings and a root-relative public URI. Reject unsafe decoded or encoded paths before constructing `SceneTextureAsset`.

- [ ] **Step 3: Add material-instance parser**

Validate exact keys `id`, `name`, `baseMaterialId`, `baseTextureId`, `roughness`, `metalness`. Require a known catalogue `baseMaterialId`; validate optional numeric overrides in `[0, 1]`.

- [ ] **Step 4: Add semantic reference validation**

Assert unique texture and material IDs. Resolve each `baseTextureId` and each renderable entity `materialInstanceId`. Keep light entity keys strict so light material references fail as unknown properties.

- [ ] **Step 5: Add deterministic migration**

Migrate v1→v2→v3→v5 as before, then v5→v6 by adding empty arrays. Canonicalize every accepted version through one v6 cloning path.

- [ ] **Step 6: Canonicalize new fields**

Emit root order:

```text
version
textures
materials
entities
clusters (when present)
navigationNodes
connections
```

Clone every nested value and omit absent optional fields.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run Task 1 command. Expected: all focused tests pass.

### Task 4: Migrate checked-in JSON and typed test fixtures

**Files:**
- Modify: `apps/museum/src/lib/content/museum-scene.json`
- Modify: `apps/museum/src/lib/content/__fixtures__/tour-minimal.json`
- Modify: `apps/museum/src/lib/editor/editor-camera-path.test.ts`
- Modify: `apps/museum/src/lib/editor/editor-camera-view.test.ts`
- Modify: `apps/museum/src/lib/editor/store/selection-actions.test.ts`
- Modify: `apps/museum/src/lib/state/museum-state.test.ts`
- Modify: `apps/museum/src/lib/museum/navigation/camera-route.test.ts`
- Modify other typed `MuseumSceneDocument` or `RuntimeMuseumScene` literals reported by `svelte-check`.

**Interfaces:**
- Consumes: required v6 root arrays and runtime resource arrays.
- Produces: canonical checked-in scene and type-correct test fixtures.

- [ ] **Step 1: Canonicalize JSON documents**

Set `"version": 6`, then add:

```json
"textures": [],
"materials": [],
```

before `"entities"`.

- [ ] **Step 2: Update typed document literals**

Set `version: 6` and add `textures: []`, `materials: []`.

- [ ] **Step 3: Update typed runtime literals**

Add `textures: []`, `materials: []`.

- [ ] **Step 4: Update old assertions**

Expect canonical v6. Unsupported-version tests use `7`. Keep explicit v5 migration coverage through the v5 converter.

### Task 5: Verify scope and document handoff

**Files:**
- Create: `docs/agent-handoffs/phase-5.1.md`
- Modify: `docs/agent-handoffs/CURRENT.md`
- Modify: `docs/plans/museum-editor-workspace/README-museum-editor.md`

**Interfaces:**
- Produces: completion evidence and next-slice pointer to Phase 5.2.

- [ ] **Step 1: Run focused tests**

```bash
npm run test -w @portfolio/museum -- --run src/lib/content/scene-codec.test.ts src/lib/content/scene.test.ts
```

- [ ] **Step 2: Run full museum tests**

```bash
npm run test -w @portfolio/museum
```

- [ ] **Step 3: Run type and Svelte checks**

```bash
npm run check -w @portfolio/museum
```

- [ ] **Step 4: Check edited-file diagnostics**

Confirm no new IDE lint errors in edited TypeScript files.

- [ ] **Step 5: Write handoff**

Record schema contract, migration behavior, validation rules, test/check counts, files changed, and Phase 5.2 next step. Do not claim rendering or UI support.
