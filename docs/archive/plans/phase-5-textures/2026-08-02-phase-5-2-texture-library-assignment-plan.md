# Phase 5.2 Texture Library and Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe public-texture registration, a searchable editor texture library, and atomic material-instance assignment for model and primitive entities without pulling Phase 5.3 rendering/cache work forward.

**Architecture:** Extract one shared URI policy from the v6 codec, then keep browser image verification and library status in editor-only modules. Add one focused material-resource mutator behind `MuseumEditorStore`; all registration and assignment changes use existing document transactions. Svelte components consume the store facade, while session-only recent/load/dialog state stays outside canonical JSON.

**Tech Stack:** TypeScript 5.8, Svelte 5 runes, SvelteKit 2, Vitest 3 node environment, Three.js/Threlte viewport raycasting, existing strict v6 scene codec and editor history controllers.

## Global Constraints

- Canonical scene schema remains v6; no migration or persisted-field additions.
- Only root-relative public texture URIs are accepted. Reject protocols, `//`, traversal, encoded traversal, backslashes, query strings, and fragments.
- Registration verifies image load/decode before a document transaction begins.
- Duplicate exact trimmed URIs reuse the existing texture with no history entry.
- Models require an explicit catalogue base material for their first material instance.
- Shared edits default to `make-unique`; `edit-shared` remains available.
- Every successful assignment creates exactly one history entry and at most one material instance.
- Recently used IDs, texture load status, and pending material choices are session-only.
- Structurally valid JSON imports even when a safe texture URI is currently unloadable.
- Phase 5.2 does not modify `MuseumMaterial.svelte`, production `texture-cache.ts`, model/primitive renderers, or visitor behavior.
- Use Svelte 5 runes and existing Threlte event patterns.
- Do not add dependencies.
- Do not commit unless the user explicitly requests one.

---

### Task 1: Extract the shared texture URI policy

**Files:**
- Create: `apps/museum/src/lib/content/texture-uri.ts`
- Create: `apps/museum/src/lib/content/texture-uri.test.ts`
- Modify: `apps/museum/src/lib/content/scene-codec.ts:244-305`
- Modify: `apps/museum/src/lib/content/scene-codec.test.ts`

**Interfaces:**
- Produces:

```ts
export function isSafeTextureUri(uri: string): boolean;
```

- Consumers: v6 codec parsing, editor texture verifier, editor registration UI.

^- [x] **Step 1: Write failing URI-policy tests**

Add direct tests for accepted paths:

```ts
[
  '/textures/plaster-warm/map.png',
  '/museum/textures/wall detail.webp',
  '/museum/textures/%E2%9C%93.webp'
]
```

Add rejected cases:

```ts
[
  '',
  'textures/map.png',
  '//cdn.example/map.png',
  'https://example.com/map.png',
  'blob:abc',
  'data:image/png;base64,abc',
  'file:///tmp/map.png',
  '/../map.png',
  '/%2e%2e/map.png',
  '/%252e%252e/map.png',
  '/./map.png',
  '/path\\map.png',
  '/map.png?cache=1',
  '/map.png#fragment',
  '/%E0%A4%A'
]
```

Retain codec coverage proving unsafe v6 texture assets report `unsafe_texture_uri`.

^- [x] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm run test -w @portfolio/museum -- --run src/lib/content/texture-uri.test.ts src/lib/content/scene-codec.test.ts
```

Expected: `texture-uri.ts` import fails because the shared helper does not exist.

^- [x] **Step 3: Move the predicate without changing behavior**

Implement the current eight-pass decode and segment checks in `texture-uri.ts`. Import it from `scene-codec.ts` and remove the private duplicate.

^- [x] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: both files pass; existing v6 codec expectations remain unchanged.

### Task 2: Add pure texture-library and assignment helpers

**Files:**
- Create: `apps/museum/src/lib/editor/editor-textures.ts`
- Create: `apps/museum/src/lib/editor/editor-textures.test.ts`

**Interfaces:**
- Produces:

```ts
export const TEXTURE_DRAG_MIME = 'application/x-museum-texture';
export type MaterialShareMode = 'make-unique' | 'edit-shared';

export type MaterialInstancePatch = {
  baseMaterialId?: MaterialId;
  baseTextureId?: string | null;
  roughness?: number | null;
  metalness?: number | null;
};

export type MaterialEditDecision = {
  baseMaterialId?: MaterialId;
  shareMode?: MaterialShareMode;
};

export function filterTextureLibraryItems(
  textures: readonly SceneTextureAsset[],
  query: string
): SceneTextureAsset[];

export function resourceIdBase(value: string, fallback: string): string;
export function reserveResourceId(base: string, ids: Iterable<string>): string;
export function materialInstanceUsageCount(
  document: MuseumSceneDocument,
  materialInstanceId: string
): number;
export function orderRecentlyUsedTextures(
  textures: readonly SceneTextureAsset[],
  recentIds: readonly string[]
): SceneTextureAsset[];
export function firstRenderablePlacementId(
  hits: readonly SelectionHitInfo[],
  entities: readonly SceneEntity[]
): string | null;
```

^- [x] **Step 1: Write failing helper tests**

Cover:

- name/URI case-insensitive search without source mutation;
- blank query preserving document order;
- slug normalization and empty fallback;
- smallest numeric suffix with no `-1`;
- material usage counting only model/primitive references;
- recent IDs first, deduplicated, stale IDs removed, remaining document order preserved;
- first visible placement hit resolving only model/primitive entities and rejecting lights;
- exact `TEXTURE_DRAG_MIME`.

Use v6 fixture fragments such as:

```ts
const textures = [
  { id: 'wall', name: 'Wall Detail', uri: '/textures/wall.webp' },
  { id: 'floor', name: 'Floor Grain', uri: '/textures/floor.png' }
];
```

^- [x] **Step 2: Run tests and verify RED**

```bash
npm run test -w @portfolio/museum -- --run src/lib/editor/editor-textures.test.ts
```

Expected: module-not-found failure.

^- [x] **Step 3: Implement pure helpers**

Reuse `reserveEntityId` semantics but keep resource naming local to this module. Do not import editor state or mutate inputs. Treat URI search as case-insensitive but duplicate URI identity elsewhere as exact and case-sensitive.

^- [x] **Step 4: Run tests and verify GREEN**

Run the Step 2 command. Expected: all helper tests pass.

### Task 3: Add retryable editor-only image verification

**Files:**
- Create: `apps/museum/src/lib/editor/texture-verifier.ts`
- Create: `apps/museum/src/lib/editor/texture-verifier.test.ts`

**Interfaces:**
- Produces:

```ts
export type TextureVerificationResult =
  | { success: true }
  | {
      success: false;
      code: 'unsafe-uri' | 'load-failed';
      message: string;
    };

export type TextureImageLoader = (uri: string) => Promise<void>;
export type TextureVerifier = (uri: string) => Promise<TextureVerificationResult>;

export function loadBrowserTextureImage(uri: string): Promise<void>;
export function createTextureVerifier(
  loadImage?: TextureImageLoader
): TextureVerifier;
```

^- [x] **Step 1: Write failing verifier tests with an injected loader**

Assert:

- unsafe URI returns `unsafe-uri` and never invokes the loader;
- successful loader returns `{ success: true }`;
- loader rejection returns `load-failed`;
- two concurrent calls for one URI invoke the loader once;
- pending entry is deleted after settle;
- a failed URI invokes the loader again on retry;
- distinct URIs do not share work.

^- [x] **Step 2: Run tests and verify RED**

```bash
npm run test -w @portfolio/museum -- --run src/lib/editor/texture-verifier.test.ts
```

Expected: module-not-found failure.

^- [x] **Step 3: Implement verifier**

`loadBrowserTextureImage` creates `new Image()`, sets `decoding = 'async'`, resolves on `load`, rejects on `error`, and calls `image.decode()` when available. `createTextureVerifier` owns `Map<string, Promise<TextureVerificationResult>>`; delete the map entry in `finally` so failures remain retryable.

^- [x] **Step 4: Run tests and verify GREEN**

Run the Step 2 command. Expected: all verifier tests pass under the node environment because tests inject the loader.

### Task 4: Add session-only texture and decision state

**Files:**
- Modify: `apps/museum/src/lib/editor/store/session-state.svelte.ts`
- Modify: `apps/museum/src/lib/editor/store/session-state.test.ts`
- Modify: `apps/museum/src/lib/editor/museum-editor.types.ts`

**Interfaces:**
- Add:

```ts
export type EditorTextureLoadState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

export type EditorPendingMaterialEdit = {
  entityId: string;
  patch: MaterialInstancePatch;
  needsBaseMaterial: boolean;
  sharedMaterialInstanceId: string | null;
};
```

- Session API:

```ts
recentTextureIds: string[];
textureLoadStates: Record<string, EditorTextureLoadState>;
pendingMaterialEdit: EditorPendingMaterialEdit | null;

markTextureRecentlyUsed(textureId: string): void;
setTextureLoadState(uri: string, state: EditorTextureLoadState): void;
clearTextureLoadState(uri: string): void;
setPendingMaterialEdit(request: EditorPendingMaterialEdit | null): void;
```

^- [x] **Step 1: Write failing session-state tests**

Assert:

- recents prepend, deduplicate, and cap at eight IDs;
- texture load state updates and clears by exact URI, so an imported document may reuse an ID with a different URI without inheriting stale status;
- pending edit stores and clears without touching document/history types;
- a fresh session starts with empty recents, empty load states, and no pending edit.

^- [x] **Step 2: Run tests and verify RED**

```bash
npm run test -w @portfolio/museum -- --run src/lib/editor/store/session-state.test.ts
```

Expected: new state members and methods are absent.

^- [x] **Step 3: Implement state and setters with Svelte 5 runes**

Use `$state<string[]>([])`, `$state<Record<string, EditorTextureLoadState>>({})`, and `$state<EditorPendingMaterialEdit | null>(null)`. Key load state by exact URI and replace records on write so consumers receive stable reactive updates.

^- [x] **Step 4: Run tests and verify GREEN**

Run the Step 2 command. Expected: session-state tests pass.

### Task 5: Add atomic texture/material resource mutations

**Files:**
- Create: `apps/museum/src/lib/editor/store/material-resource-mutator.svelte.ts`
- Create: `apps/museum/src/lib/editor/store/material-resource-mutator.test.ts`
- Modify: `apps/museum/src/lib/editor/museum-editor.svelte.ts`
- Modify: `apps/museum/src/lib/editor/museum-editor.test.ts`

**Interfaces:**
- Mutator host:

```ts
export interface EditorMaterialResourceMutatorHost {
  readonly isDocumentMutationBlocked: boolean;
  readonly isEditorInteractionActive: boolean;
  readonly document: MuseumSceneDocument;
  setStatusMessage(message: string | null): void;
  beginDocumentTransaction(): boolean;
  commitDocumentTransaction(): boolean;
  cancelDocumentTransaction(): boolean;
}
```

- Mutator results and methods:

```ts
export type RegisterTextureResult =
  | { status: 'created'; textureId: string }
  | { status: 'existing'; textureId: string }
  | { status: 'rejected' };

export type MaterialEditResult =
  | { status: 'committed'; entityId: string; textureId?: string }
  | { status: 'decision-required'; request: EditorPendingMaterialEdit }
  | { status: 'rejected' };

registerVerifiedTexture(name: string, uri: string): RegisterTextureResult;
applyMaterialPatch(
  entityId: string,
  patch: MaterialInstancePatch,
  decision?: MaterialEditDecision
): MaterialEditResult;
makeMaterialInstanceUnique(entityId: string): boolean;
```

- Store facade:

```ts
registerTexture(name: string, uri: string): Promise<string | null>;
probeTexture(textureId: string): Promise<boolean>;
requestMaterialEdit(entityId: string, patch: MaterialInstancePatch): boolean;
requestTextureAssignment(entityId: string, textureId: string): boolean;
confirmPendingMaterialEdit(decision: MaterialEditDecision): boolean;
cancelPendingMaterialEdit(): boolean;
makeMaterialInstanceUnique(entityId: string): boolean;
```

- Extend `MuseumEditorStoreOptions`:

```ts
textureVerifier?: TextureVerifier;
```

^- [x] **Step 1: Write mutator tests before implementation**

Use a minimal host with a cloned v6 fixture and real begin/commit counters. Cover:

- successful registration appends one asset and commits once;
- exact duplicate URI returns `existing` with zero transaction calls;
- blank name or unsafe URI rejects;
- blocked mutation rejects;
- primitive first assignment derives `baseMaterialId` from `materialId`;
- model first assignment returns `decision-required` until `baseMaterialId` is supplied;
- unshared instance updates in place;
- shared instance returns `decision-required`;
- `make-unique` clones under smallest available ID, applies patch, and repoints one entity;
- `edit-shared` updates the existing shared instance;
- roughness/metalness outside `[0, 1]`, unknown texture IDs, lights, stale entities, no-ops, and invalid decisions reject without history;
- explicit null removes optional overrides;
- Make unique button clones/repoints once and no-ops when already unique.

^- [x] **Step 2: Run mutator tests and verify RED**

```bash
npm run test -w @portfolio/museum -- --run src/lib/editor/store/material-resource-mutator.test.ts
```

Expected: mutator module is absent.

^- [x] **Step 3: Implement the host-injected mutator**

Re-resolve entity, texture, current material, and usage count on every call. For a new instance:

```ts
{
  id: reserveResourceId(`${entity.id}-material`, document.materials.map(({ id }) => id)),
  name: `${entity.name} Material`,
  baseMaterialId,
  ...validatedPatch
}
```

For unique clone:

```ts
{
  ...source,
  id: reserveResourceId(`${source.id}-copy`, document.materials.map(({ id }) => id)),
  name: `${source.name} Copy`,
  ...validatedPatch
}
```

Begin the transaction only after all choices and validation succeed. If commit fails, rely on existing history rollback and return `rejected`.

^- [x] **Step 4: Wire the store facade and verifier orchestration**

Create the mutator alongside existing controllers, add a `#createMaterialResourceMutatorHost`, and delegate public methods. `registerTexture` must:

1. trim and safety-check input;
2. reuse an existing exact URI before verification;
3. await the injected/default verifier;
4. recheck current state;
5. call `registerVerifiedTexture`;
6. mark successful/reused IDs recent.

`probeTexture` updates session load state but never mutates the document. `requestMaterialEdit` stores `decision-required` requests. Confirmation replays the patch against current state and only clears the request after commit or definitive rejection.

`requestTextureAssignment` and successful pending confirmation select the target entity through `selectionActions.selectPlacement` and mark the texture recent. `requestMaterialEdit` returns `true` when it either commits or queues a valid decision request; it returns `false` on rejection.

^- [x] **Step 5: Add facade/history integration tests**

Use `createMuseumEditorStore({ document, textureVerifier })` to prove:

- failed load causes no canonical JSON/history change;
- async success creates one undoable texture;
- duplicate reuse adds no history and updates recents;
- assignment undo/redo restores material rows and entity references together;
- pending decisions are session-only;
- import/reset leaves safe missing texture references intact.

^- [x] **Step 6: Run focused store tests and verify GREEN**

```bash
npm run test -w @portfolio/museum -- --run src/lib/editor/store/material-resource-mutator.test.ts src/lib/editor/museum-editor.test.ts
```

Expected: both files pass.

### Task 6: Build the Textures asset-library UI

**Files:**
- Modify: `apps/museum/src/lib/editor/EditorAssetLibrary.svelte`
- Modify: `apps/museum/src/lib/editor/EditorLeftSidebar.svelte`
- Modify: `apps/museum/src/lib/editor/MuseumEditorApp.svelte`

**Interfaces:**
- Asset-library tabs become:

```ts
type AssetLibraryTab = 'models' | 'shapes' | 'lights' | 'textures';
```

- Texture drag payload:

```ts
event.dataTransfer?.setData(TEXTURE_DRAG_MIME, texture.id);
event.dataTransfer!.effectAllowed = 'copy';
```

^- [x] **Step 1: Extend the library state and derived lists**

Add texture selection, registration drafts, pending state, filtered texture list, recent list, and session load-state reads keyed by `texture.uri`. Keep model `onselectionchange` behavior unchanged; texture selection remains local to the library.

^- [x] **Step 2: Add registration and probe handlers**

`submitTextureRegistration` awaits `store.registerTexture(nameDraft, uriDraft)`, selects the returned ID, clears drafts only on success, and prevents duplicate submissions. An effect probes unobserved document textures through `store.probeTexture`.

^- [x] **Step 3: Add Textures markup**

Add:

- fourth tab;
- search placeholder `Name or URI` in texture mode;
- name and public-URI registration form;
- Recently used list when non-empty;
- all matching textures in a keyed thumbnail grid;
- `loading`, `ready`, and `error` labels;
- Retry button for errors;
- `draggable="true"` only when state is `ready`;
- custom MIME only, with no `text/plain`.

Use ordinary `<img src={texture.uri} alt="" />`; do not instantiate Three.js materials.

^- [x] **Step 4: Preserve responsive layout and accessibility**

Change tab grid to four equal columns, label form controls, expose status through `role="status"`, and keep keyboard selection separate from drag initiation.

^- [x] **Step 5: Validate changed Svelte files**

Run the Svelte autofixer on each changed `.svelte` file until no issues remain, then:

```bash
npm run check -w @portfolio/museum
```

Expected: 0 errors and 0 warnings.

### Task 7: Add the Material inspector and explicit choice dialog

**Files:**
- Create: `apps/museum/src/lib/editor/EditorMaterialInspector.svelte`
- Create: `apps/museum/src/lib/editor/EditorMaterialChoiceDialog.svelte`
- Modify: `apps/museum/src/lib/editor/EditorInspector.svelte`
- Modify: `apps/museum/src/lib/editor/EditorPrimitiveInspector.svelte`
- Modify: `apps/museum/src/lib/editor/MuseumEditorApp.svelte`

**Interfaces:**
- `EditorMaterialInspector` props:

```ts
let { store }: { store: MuseumEditorStore } = $props();
```

- `EditorMaterialChoiceDialog` reads `store.pendingMaterialEdit`, defaults shared choice to `make-unique`, and confirms through `store.confirmPendingMaterialEdit`.

^- [x] **Step 1: Build the Material inspector**

For one selected model/primitive, derive the referenced instance and usage count. Render:

- read-only generated instance name;
- base catalogue material select;
- base texture select with `None`;
- roughness and metalness numeric fields with `Use base`;
- shared usage count;
- Make unique button when usage exceeds one;
- explanatory copy that viewport rendering lands in Phase 5.3.

Each field calls `store.requestMaterialEdit` with one `MaterialInstancePatch`. Selecting None sends `null`; no-instance model edits trigger the global base-material choice.

^- [x] **Step 2: Build the choice dialog**

Render a modal dialog only when `pendingMaterialEdit` exists. Show:

- base-material select when `needsBaseMaterial`;
- Make unique/Edit shared radio group when `sharedMaterialInstanceId` exists;
- Confirm and Cancel;
- Escape cancellation;
- Confirm disabled until all required choices exist.

The default share mode is `make-unique`. Dialog state is recreated from each request and never serialized.

^- [x] **Step 3: Compose inspector precedence**

Change `showAssetInspector` so one selected model/primitive overrides generic Assets inspection. Mount `EditorMaterialInspector` after model and primitive entity controls. Preserve asset-tab/search state. Rename the existing primitive catalogue select label to `Fallback material`.

^- [x] **Step 4: Mount the global dialog**

Render `EditorMaterialChoiceDialog` once from `MuseumEditorApp`, outside the WebGL canvas and inspector branches, so viewport drops and inspector edits share one decision path.

^- [x] **Step 5: Validate changed Svelte files**

Run the Svelte autofixer repeatedly on all Task 7 components, then:

```bash
npm run check -w @portfolio/museum
```

Expected: 0 errors and 0 warnings.

### Task 8: Wire viewport texture drop through existing raycasting

**Files:**
- Modify: `apps/museum/src/lib/editor/EditorSelection.svelte`
- Modify: `apps/museum/src/lib/editor/editor-selection.test.ts`
- Modify: `apps/museum/src/lib/editor/editor-textures.test.ts`

**Interfaces:**
- Reuse:

```ts
firstRenderablePlacementId(
  intersections.map(selectionHitFromIntersection),
  store.document.entities
)
```

- Store call:

```ts
store.requestTextureAssignment(entityId, textureId);
```

^- [x] **Step 1: Add pure drop-target tests**

Assert nearest visible model/primitive wins, nested placement hits deduplicate naturally, light-only and empty hits return null, and stale entity IDs reject.

^- [x] **Step 2: Generalize pointer coordinate helpers**

Allow `toNdc` and `raycast` to accept any `{ clientX: number; clientY: number }`, preserving all existing pointer behavior.

^- [x] **Step 3: Add canvas drag/drop listeners**

On `dragover`, call `preventDefault()` only when `dataTransfer.types` contains `TEXTURE_DRAG_MIME`. On `drop`:

1. prevent default and stop propagation;
2. read the texture ID;
3. raycast current coordinates;
4. resolve one model/primitive;
5. report unsupported targets through `store.setStatusMessage`;
6. call `store.requestTextureAssignment`.

Do not add drag-hover geometry or accept `text/plain`.

^- [x] **Step 4: Register and remove listeners**

Add capture-phase `dragover` and `drop` listeners beside existing canvas pointer listeners in `onMount`, and remove both in cleanup.

^- [x] **Step 5: Run focused tests and Svelte validation**

```bash
npm run test -w @portfolio/museum -- --run src/lib/editor/editor-selection.test.ts src/lib/editor/editor-textures.test.ts
npm run check -w @portfolio/museum
```

Expected: focused tests pass; check reports 0 errors and 0 warnings. Run Svelte autofixer on `EditorSelection.svelte` until clean before the check.

### Task 9: Verify Phase 5.2 and update handoff documents

**Files:**
- Create: `docs/agent-handoffs/phase-5.2.md`
- Modify: `docs/agent-handoffs/CURRENT.md`
- Modify: `docs/plans/museum-editor-workspace/README-museum-editor.md`
- Modify: `docs/plans/museum-editor-workspace/phase-5-textures.md`

**Interfaces:**
- Produces: reproducible verification evidence and next-slice pointer to Phase 5.3.

^- [x] **Step 1: Run all focused Phase 5.2 tests**

```bash
npm run test -w @portfolio/museum -- --run \
  src/lib/content/texture-uri.test.ts \
  src/lib/content/scene-codec.test.ts \
  src/lib/editor/editor-textures.test.ts \
  src/lib/editor/texture-verifier.test.ts \
  src/lib/editor/store/session-state.test.ts \
  src/lib/editor/store/material-resource-mutator.test.ts \
  src/lib/editor/editor-selection.test.ts \
  src/lib/editor/museum-editor.test.ts
```

Expected: all focused tests pass.

^- [x] **Step 2: Run the full automated gate**

```bash
npm run test -w @portfolio/museum
npm run check -w @portfolio/museum
npm run build -w @portfolio/museum
git diff --check
```

Expected: full suite passes; check has 0 errors/0 warnings; build exits 0 except existing third-party/chunk warnings; diff check is silent.

^- [x] **Step 3: Browser-smoke the development editor**

Start or reuse `npm run dev:museum`, then verify:

1. valid `/textures/...` URI registers and shows a thumbnail;
2. duplicate URI reselects without duplicate resource/history;
3. unsafe and missing URI registration fails without dirty/history change;
4. search and Recently used update;
5. drag to primitive assigns in one undo entry;
6. drag to model asks for base material;
7. shared edit defaults to Make unique and undo/redo restores exact state;
8. inspector fields change canonical JSON but not rendering;
9. imported safe missing URI remains with an error badge;
10. camera navigation and existing selection gestures still work.

^- [x] **Step 4: Recheck production isolation**

Build/preview and confirm `/museum` remains 200 while `/dev/museum-editor` remains 404 in production. Inspect built chunks for editor-only texture library, verifier, mutator, and dialog symbols; none may be reachable from visitor output.

^- [x] **Step 5: Write the handoff**

Record:

- delivered files and behavior;
- exact test/check/build counts;
- browser results;
- production isolation result;
- known limitation that assigned materials do not render until 5.3;
- next slice: Phase 5.3 shared material rendering, cache lifecycle, and JSON visual parity.

Update CURRENT, release README, and Phase 5 status to mark 5.2 complete only after all gates pass.

## Execution Notes

- Execute tasks in order; Task 5 consumes Tasks 1–4, and UI tasks consume Task 5.
- Keep every RED/GREEN cycle visible in command output.
- Use a fresh implementation subagent per task when using subagent-driven development.
- Run a requirements review after Task 8 and before final verification.
- No commits are authorized by this plan.
