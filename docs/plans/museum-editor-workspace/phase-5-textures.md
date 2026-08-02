# Phase 5 — Textures

**Goal:** add texture assets and material instances after camera and entity schemas are stable.

**Dependency:** Phase 4 complete, including schema v5 entities.

**Status:** Slice 5.1 complete. Canonical v6 schema and v1–v5 migration landed; next is 5.2 import/library/assignment.

## Release Split

Phase 5 has two gates:

1. **Texture MVP:** project-relative texture registration, material assignment, local preview, JSON round-trip.
2. **Package follow-on:** binary ingest, URI rewriting, validation, and downloadable package export.

Package export does not block Texture MVP.

## Texture MVP Scope

- Schema v6 texture assets and material instances.
- Assets → Textures list/search/import UI.
- Register existing project-relative texture URIs.
- Assign texture by dragging onto an entity or selecting it in Material inspector.
- Local editor and visitor preview through shared texture cache.
- JSON import/copy/download.

## Texture MVP Out of Scope

- No blob URLs in canonical JSON.
- No binary file upload stored only in browser memory.
- No ZIP/package generation.
- No URI rewriting.
- No unresolved-export state.
- No UV editor, shader graph, paint tool, or image editor.
- No texture scene objects.

## Canonical v6 Model

```ts
type SceneMaterialInstance = {
  id: string;
  name: string;
  baseMaterialId: MaterialId;
  baseTextureId?: string;
  roughness?: number;
  metalness?: number;
};

type SceneTextureAsset = {
  id: string;
  name: string;
  uri: string;
};
```

Extend canonical document:

```ts
version: 6;
textures: SceneTextureAsset[];
materials: SceneMaterialInstance[];
```

Entities reference a material instance ID. A material instance references the existing static catalogue as its base. Do not duplicate catalogue definitions into scene JSON.

## URI Contract for MVP

- Accept only stable project-relative/public texture URIs already available to the app.
- Reject `blob:`, `data:`, absolute filesystem paths, traversal, and unsupported protocols.
- Import means register URI plus name; it does not copy bytes.
- Verify load before commit.
- Failed load leaves document/history unchanged.
- JSON exports remain self-consistent because every canonical URI is stable.

Suggested form:

```text
Import Texture
Name: Museum Wall Detail
URI:  /museum/textures/wall-detail.webp
```

## Assets and Inspector UX

Assets tab categories:

```text
Models | Shapes | Textures
```

Textures view:

- Search.
- Import/register.
- Thumbnail grid.
- Recently used.
- Missing/error badge.

Assignment:

- Drag texture thumbnail onto rendered model/primitive.
- Or select texture from right Material inspector.
- If selected entity has no editable material instance, clone from its base material and assign in one transaction.
- If instance is shared, ask whether to edit shared or make unique before mutation.
- Texture drag creates/assigns at most one material instance and one history entry.

Material inspector:

```text
Material instance
Base material
Base texture
Roughness override
Metalness override
Make unique
```

Do not expose a full shader editor.

## Rendering Contract

- Reuse `MuseumMaterial.svelte` and `texture-cache.ts`.
- Cache by stable URI.
- Preserve texture tiling/color-space behavior from the base material catalogue.
- Clone only when entity-specific overrides require it.
- Release references when entities/materials disappear.
- Editor and visitor render identical material instances.
- No per-object texture loader.

## Package Follow-On

Only after Texture MVP is stable:

- Accept local binary texture files.
- Keep browser object URLs/session blobs outside canonical document.
- Track unresolved binary assets in editor session state.
- Export package containing canonical JSON plus texture binaries.
- Rewrite package JSON URIs to stable bundled paths.
- Validate duplicate names, unsupported formats, missing bytes, and failed loads.
- Block plain JSON export when it would reference unresolved session-only binaries.
- Revoke object URLs on replace/import/reset/unmount.

Choose one package format and document it before implementation. Do not add filesystem Save as part of package work.

## Files to Read

- `apps/museum/src/lib/content/scene.ts`
- `apps/museum/src/lib/content/scene-codec.ts`
- `apps/museum/src/lib/content/materials.ts`
- `apps/museum/src/lib/editor/museum-editor.svelte.ts`
- `apps/museum/src/lib/editor/EditorAssetLibrary.svelte`
- `apps/museum/src/lib/museum/materials/MuseumMaterial.svelte`
- `apps/museum/src/lib/museum/materials/texture-cache.ts`
- `apps/museum/src/lib/museum/materials/MaterialPreviewItem.svelte`
- Phase 4 shared entity renderer
- `docs/ASSET_WORKFLOW.md`

## Slices

| Slice | Deliverable | Complexity | Recommended model | Reasoning |
|---|---|---:|---|---|
| 5.1 | Schema v6 textures/material instances and v5 migration | Extreme | `gpt-5.6-sol` | Max |
| 5.2 | Project-relative import, texture library, and assignment | Very High | `gpt-5.6-sol` | XHigh |
| 5.3 | Shared material rendering, cache lifecycle, JSON round-trip | Very High | `gpt-5.6-sol` | XHigh |
| 5.4 | Binary session assets and package export follow-on | Extreme | `gpt-5.6-sol` | Max |
| 5.5 | Browser/production verification and handoff | High | `gpt-5.6-terra` | XHigh |

## Automated Acceptance — Texture MVP

- v1–v5 migrate deterministically to v6.
- Stable texture/material IDs round-trip.
- Invalid/unsafe URIs reject before mutation.
- Missing texture load does not commit.
- Drag/selector assignment is one history entry.
- Shared versus unique material behavior is deterministic.
- Cache loads once per URI and releases correctly.
- Editor and visitor render parity.
- Camera graph, timing, primitives, and lights remain unchanged.

## Automated Acceptance — Package Follow-On

- Binary preview URLs never serialize.
- Plain JSON export blocks unresolved binaries.
- Package includes each referenced binary once.
- Rewritten URIs resolve after unpack/load.
- Missing bytes, duplicate package paths, and failed rewrites reject.
- Reset/import/unmount revoke session URLs.

## Browser Acceptance — Texture MVP

1. Register a valid project-relative texture.
2. Confirm thumbnail and local preview.
3. Drag texture onto model and primitive.
4. Assign through Material inspector.
5. Make shared material unique; undo/redo.
6. Copy/download/import JSON and confirm render parity.
7. Reject missing, traversal, blob, data, and filesystem URIs.

## Browser Acceptance — Package Follow-On

1. Import supported local texture binary.
2. Preview without serializing object URL.
3. Confirm plain JSON export blocker.
4. Export package; reopen it; confirm rewritten texture loads.
5. Replace/delete/reset assets and confirm URL cleanup.

## Completion Gate

Texture MVP is complete when stable project-relative textures and material instances round-trip and render identically. Package export remains a separate follow-on gate and must not delay that release.
