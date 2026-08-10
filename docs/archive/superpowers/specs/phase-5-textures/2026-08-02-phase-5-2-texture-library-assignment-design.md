# Phase 5.2 — Texture Library and Assignment Design

**Date:** 2026-08-02  
**Status:** Approved design; awaiting written-spec review  
**Parent plan:** [`../../plans/museum-editor-workspace/phase-5-textures.md`](../../plans/museum-editor-workspace/phase-5-textures.md)  
**Prior slice:** [`../../agent-handoffs/phase-5.1.md`](../../agent-handoffs/phase-5.1.md)

## Goal

Add editor support for registering stable public texture URIs, browsing and searching registered textures, and assigning them atomically to model or primitive entities through the canonical v6 texture/material schema.

Phase 5.2 establishes editor data and UX contracts only. Phase 5.3 remains responsible for applying material instances in the shared editor/visitor renderer and for production texture-cache lifecycle management.

## Scope

Phase 5.2 includes:

- safe root-relative public texture URI registration;
- successful image-load verification before registration commits;
- Textures category in the Assets library;
- search, thumbnails, session-only recently used ordering, and load/error badges;
- texture assignment through viewport drag/drop and the Material inspector;
- full v6 material-instance fields in the inspector;
- deterministic shared-versus-unique material behavior;
- atomic document history for registration and assignment;
- structural JSON import compatibility with asynchronous missing-texture badges.

Phase 5.2 excludes:

- use of `materialInstanceId` by model or primitive renderers;
- visitor material-instance rendering;
- changes to `MuseumMaterial.svelte` or production `texture-cache.ts`;
- render-cache acquisition, reference counting, and disposal;
- binary uploads, object URLs, URI rewriting, ZIP/package export, and filesystem save;
- UV editing, shader editing, image editing, and texture scene objects.

## Locked Product Decisions

1. Rendering and shared cache work remain in Phase 5.3.
2. A model's first texture assignment opens a base-material chooser because model entities have no catalogue `materialId`.
3. When a material instance is shared, the choice UI defaults to **Make unique** and also offers **Edit shared**.
4. Registering an existing URI reuses and selects the existing texture without creating history.
5. Texture and material-instance IDs use deterministic slugs with numeric collision suffixes.
6. The Material inspector exposes base material, base texture, roughness, metalness, and Make unique.
7. Successful viewport drop selects the target entity and opens its Material inspector.
8. Structurally valid JSON with a safe but unloadable texture URI still imports; the library shows an error badge.
9. Recently used texture IDs are session-only and never enter scene JSON, dirty comparison, or document history.

## Architecture

### Shared URI policy

Move the existing private safe-texture-URI predicate out of `scene-codec.ts` into a small content-layer helper. Both the codec and editor registration path must call the same predicate.

The policy remains unchanged:

- URI must be root-relative and public, beginning with one `/`;
- reject protocol-relative URLs, protocols, query strings, fragments, backslashes, traversal, and encoded traversal;
- reject `blob:`, `data:`, `file:`, absolute filesystem paths, and unsupported protocols.

The editor must not duplicate or weaken codec validation. Codec validation remains the canonical structural boundary.

### Editor texture helpers

Add a pure `editor-textures.ts` module for:

- case-insensitive name/URI search;
- duplicate URI lookup;
- deterministic texture and material-instance ID reservation;
- texture usage counts;
- shared material-instance detection;
- recently used ordering against the current document;
- assignment planning and required-decision detection.

Pure helpers return values or typed failures and do not mutate the document, selection, history, or session state.

### Load verification

Add an editor-only image verifier that loads and decodes a root-relative URI without creating a Three.js material or touching the production render cache.

Requirements:

- URI safety is checked before any request;
- success means the browser loaded and decoded an image;
- failure returns a concise typed error;
- tests can inject a fake loader;
- concurrent checks for the same URI share one pending promise;
- a failed check can be retried and must not become a permanent cached rejection;
- verification does not begin a document transaction.

This verifier is a registration and library-status tool. Phase 5.3 may replace its internal loading path with a shared source cache, but its observable success/failure contract should remain stable.

### Material resource mutator

Add a focused store mutator, wired through the existing `MuseumEditorStore` facade, for texture and material-resource changes.

Its public operations should cover:

- register a verified texture;
- assign a registered texture to a model or primitive;
- update base material;
- update or clear base texture;
- update or clear roughness and metalness overrides;
- make one entity's shared material instance unique.

Every operation follows existing editor mutation guards and `beginDocumentTransaction` / `commitDocumentTransaction` behavior. Components do not mutate `document.textures`, `document.materials`, or `entity.materialInstanceId` directly.

## Registration Flow

1. User opens Assets → Textures and enters name plus public URI.
2. UI trims input and checks required fields.
3. Shared URI policy rejects unsafe input before network access.
4. If the exact trimmed URI already exists, select that texture, report reuse, and create no history entry. URI identity is case-sensitive because public paths may be case-sensitive.
5. Verify image load and decode asynchronously.
6. Immediately before commit, re-read the current document:
   - recheck mutation guards;
   - recheck duplicate URI;
   - reserve the ID against current IDs.
7. Begin one document transaction, append one `SceneTextureAsset`, and commit.
8. Select the registered texture and update session-only recently used state.

An async race with Reset, Import, Undo, or another registration must never overwrite newer state. The post-load recheck determines the final action.

Generated texture IDs use a normalized name slug, with URI filename as fallback and `texture` as final fallback. Collision handling appends the smallest available numeric suffix.

First-assignment material IDs use a normalized `${entity.id}-material` base. Unique clones use a normalized `${sourceMaterial.id}-copy` base. Both append the smallest available numeric suffix. First-assignment names use `${entity.name} Material`; clones use `${sourceMaterial.name} Copy`.

## Library UX

The Assets library categories become:

```text
Models | Shapes | Lights | Textures
```

Textures view contains:

- search across name and URI;
- Register Texture action and form;
- recently used section, filtered to IDs still present in the current document;
- thumbnail grid for all matching textures;
- URI and usage count in accessible metadata;
- loading and error states;
- draggable entries only for currently loadable textures.

Thumbnails use ordinary image elements in this slice. They do not instantiate `MuseumMaterial` or Three.js textures.

Imported documents are probed asynchronously after replacement. A failed probe adds a session-only error badge and does not mutate, strip, or reject the imported document. Retry is available.

## Assignment Planning

Only model and primitive entities accept texture assignment. Lights and non-entity scene objects reject without mutation.

### Entity with no material instance

- Primitive: use its existing catalogue `materialId` as `baseMaterialId`.
- Model: require the user to choose `baseMaterialId`.
- Create one `SceneMaterialInstance`.
- Set its `baseTextureId` to the dropped/selected texture.
- Point the entity's `materialInstanceId` to the new instance.
- Commit all changes as one history entry.

The chooser completes before the transaction begins. Cancel creates no document change or history.

### Entity with an unshared material instance

Update that instance's `baseTextureId` in one history entry. No new material instance is created.

### Entity with a shared material instance

Before mutation, show:

- **Make unique** — preselected;
- **Edit shared**;
- Cancel.

Make unique clones the current instance under a fresh stable ID, applies the new texture to the clone, and repoints only the target entity. Edit shared changes the existing instance and therefore all referencing entities. Either successful choice is one history entry and creates at most one new material instance.

Shared means two or more current model/primitive entities reference the same material-instance ID.

## Viewport Drag/Drop

Texture cards use one custom MIME type dedicated to texture assignment. They do not publish `text/plain`, avoiding collisions with existing camera-tree and timeline drops.

The viewport drop handler:

1. confirms the MIME type and registered texture ID;
2. raycasts using the existing editor selection/placement-root path;
3. resolves one model or primitive entity;
4. requests any required base-material or shared-instance choice;
5. invokes the store assignment operation;
6. on success, selects the target entity and reveals its Material inspector.

Phase 5.2 adds no drag-hover target decoration. A canceled, invalid, or stale drop creates no transaction.

## Material Inspector

For selected model and primitive entities, add a Material section containing:

- generated material-instance name, displayed read-only;
- base catalogue material;
- base texture, including None;
- roughness override, including Use base;
- metalness override, including Use base;
- shared usage count;
- Make unique.

Behavior:

- no instance: choosing a base material, texture, roughness, or metalness creates an instance;
- primitive creation defaults from `entity.materialId`;
- model creation requires explicit base-material choice before any instance field can commit;
- choosing None for base texture on an entity without an instance is a no-op;
- shared instance edits first ask shared versus unique, defaulting to unique;
- Make unique clones and repoints in one history entry;
- no-op edits and canceled choices create no history;
- values remain editable despite no visual material change until Phase 5.3.

The existing primitive `materialId` remains the catalogue fallback. Creating or editing a material instance does not delete it.

Assets-tab state must not permanently mask the selected entity's Material inspector. Successful viewport assignment gives entity inspection precedence while preserving the user's Assets tab and texture search state.

## Recently Used

Recently used texture IDs live in editor session state.

- Registration and successful assignment move a texture ID to the front.
- Duplicate-URI reuse also moves the existing ID to the front.
- The list is deduplicated and bounded to eight IDs.
- IDs absent from the current document are filtered from display.
- Reset, Import, Undo, and Redo do not serialize or history-track this list.

## Transaction and History Contract

- Registration: zero entries on validation/load failure; one entry on successful new registration.
- Duplicate registration: zero entries.
- Assignment: exactly one entry on success.
- First assignment may create one material instance and set one entity reference in that same entry.
- Make unique may create one material instance and change one entity reference in that same entry.
- Edit shared changes one material instance in one entry.
- Inspector edits each create at most one entry.
- Cancel, stale target, no-op, load failure, blocked mutation, and invalid entity create zero entries.
- Undo/redo restores texture assets, material instances, and entity references together.

Registration and later assignment are separate user actions and therefore separate history entries. Dragging from the library always references an already registered texture.

## Error Handling

Use concise editor status messages for:

- unsafe URI;
- image load/decode failure;
- stale or missing texture ID;
- unsupported drop target;
- missing model base-material choice;
- stale entity or material instance;
- blocked mutation;
- failed document validation at commit.

Load errors remain session state. Schema errors remain codec errors. Do not store error flags in canonical JSON.

If state changes while a dialog is open, assignment must re-resolve the entity, texture, material instance, and sharing count before transaction start. If the requested operation is no longer valid, close with an error and no mutation.

## Expected File Boundaries

Expected new files:

- `apps/museum/src/lib/content/texture-uri.ts`
- `apps/museum/src/lib/editor/editor-textures.ts`
- `apps/museum/src/lib/editor/editor-textures.test.ts`
- `apps/museum/src/lib/editor/texture-verifier.ts`
- `apps/museum/src/lib/editor/texture-verifier.test.ts`
- `apps/museum/src/lib/editor/store/material-resource-mutator.svelte.ts`
- `apps/museum/src/lib/editor/store/material-resource-mutator.test.ts`
- `apps/museum/src/lib/editor/EditorMaterialInspector.svelte`
- `apps/museum/src/lib/editor/EditorMaterialChoiceDialog.svelte`

Expected modified files:

- `apps/museum/src/lib/content/scene-codec.ts`
- `apps/museum/src/lib/content/scene-codec.test.ts`
- `apps/museum/src/lib/editor/museum-editor.svelte.ts`
- `apps/museum/src/lib/editor/EditorAssetLibrary.svelte`
- `apps/museum/src/lib/editor/EditorLeftSidebar.svelte`
- `apps/museum/src/lib/editor/EditorInspector.svelte`
- `apps/museum/src/lib/editor/EditorSelection.svelte`
- `apps/museum/src/lib/editor/store/session-state.svelte.ts`
- editor session/selection type and test files that own the affected contracts.

Files explicitly deferred to Phase 5.3:

- `apps/museum/src/lib/museum/materials/MuseumMaterial.svelte`
- `apps/museum/src/lib/museum/materials/texture-cache.ts`
- `apps/museum/src/lib/museum/entities/EntityPrimitive.svelte`
- `apps/museum/src/lib/museum/assets/AssetModel.svelte`
- shared visitor/editor material-instance rendering.

## Test Design

### Pure helpers

- safe and unsafe URI parity with codec;
- search by name and URI;
- duplicate URI reuse;
- deterministic slug and collision suffixes;
- usage counts and shared detection;
- recently used ordering and stale-ID filtering;
- model versus primitive assignment planning.

### Verifier

- unsafe URI makes no load call;
- successful decode resolves;
- load and decode failures reject with typed errors;
- concurrent checks share pending work;
- failure can be retried;
- injected loader keeps tests browser-independent.

### Store and history

- successful registration adds one texture and one undo entry;
- failed verification and duplicate reuse add no history;
- primitive first assignment derives base material;
- model first assignment requires explicit base material;
- unshared assignment mutates existing instance;
- shared Make unique clones once and repoints one entity;
- shared Edit shared updates all consumers through one instance;
- cancel/no-op/stale/blocked operations do not mutate;
- roughness and metalness enforce `[0, 1]`;
- Make unique, undo, and redo restore exact document state;
- lights reject assignment.

### UI and integration

- Textures category, search, form, thumbnails, recent ordering, and badges;
- custom drag MIME does not trigger camera drop paths;
- viewport drop resolves a placement root and selects the target after success;
- model base-material chooser and shared-choice dialog are cancel-safe;
- imported missing textures display errors without changing canonical JSON;
- Svelte check reports no errors or warnings.

## Acceptance Gate

Phase 5.2 is complete when:

1. A safe, loadable public texture URI registers once and is undoable.
2. Unsafe or unloadable registration leaves document and history unchanged.
3. Textures are searchable, thumbnail-visible, retryable, and draggable.
4. Drag/drop and Material inspector assignment work for models and primitives.
5. Model base selection and shared/unique decisions are explicit and cancel-safe.
6. Every successful assignment is one history entry and creates at most one material instance.
7. JSON import preserves safe missing references and reports them through session badges.
8. Existing camera, entity, import/export, and production-isolation tests remain unchanged in behavior.
9. No Phase 5.3 renderer or cache lifecycle work has been pulled forward.

## Handoff to Phase 5.3

Phase 5.3 will resolve each entity's optional `materialInstanceId`, combine its catalogue base with scene overrides, load `baseTextureId` through the shared URI cache, and render identical results in editor and visitor. It will also own cache reference counting, release behavior, and visual JSON round-trip parity.
