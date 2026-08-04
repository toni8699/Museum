# Priority-1 File Splits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan slice-by-slice. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> This is a **behavior-preserving structural refactor**. Every slice is a green-test checkpoint: the existing suites are the safety net, so no slice may change observable behavior. Follow the previous refactor's precedent (`docs/archive/refactor-audit/2026-07-28-refactor-plan.md`): edit → verify → hand-off → stop. **No commits unless the user explicitly requests them.**

**Goal:** Split the three Priority-1 oversized files so future phase work stops stacking into a 3 640-LOC facade, a 4 350-LOC test monolith, and a 2 337-LOC codec kitchen sink.

**Architecture:** (1) `museum-editor.svelte.ts` sheds host-factory object literals, preview/timeline playback commands, and the Phase 5.2 texture orchestration into three focused `store/` controllers, leaving a thin composition root that keeps the facade surface byte-identical. (2) `museum-editor.test.ts` sheds its pure-helper describes into the dedicated `editor-*.test.ts` files and its store-integration describes into themed sibling suites sharing one test-utils module. (3) `scene-codec.ts` becomes a `scene-codec/` directory split by responsibility (types / readers / entity+nodes+connection parsers / validate / canonical / migrate / index barrel) with the public export surface frozen so all 7 consumers import unchanged.

**Tech Stack:** TypeScript 5.8 strict, Svelte 5 runes, Vitest 3 node environment, existing store sub-store composition pattern (`store/*.svelte.ts` + host interfaces), existing fixture loader (`$lib/content/__fixtures__/load-fixture-scene.ts`).

---

## Global Constraints (apply to every slice)

- **No behavior change.** The full museum suite (`npm run test -w @portfolio/museum`, currently 40 files / 660 tests) must stay green after every slice. If a test must move, it moves with its source; expectations never change.
- **Public-surface freeze.** `MuseumEditorStore` exports (`createMuseumEditorStore`, `MuseumEditorStoreOptions`, `cloneMuseumSceneDocument`, `EDITOR_VISITOR_LIGHTING`, `EDITOR_BRIGHT_LIGHTING`, `EditorLightingSettings`, all type re-exports from `museum-editor.types.ts`, and every public method/getter the 40 consumer files call) stay importable from `museum-editor.svelte.ts` with identical signatures. `scene-codec.ts` keeps exactly these exports: `SceneDocumentIssue`, `SceneDocumentValidationResult`, `SceneDocumentValidationError`, `cameraSceneConnectionTimingFailureReason`, `validateSceneDocument`, `parseSceneDocumentJson`, `serializeSceneDocument`.
- **Move verbatim, don't rewrite.** Moved functions are copied byte-for-byte with their exact signatures; only the private-vs-internal export status may change where a split requires it.
- **Type-only imports across new module boundaries** (e.g., `import type { MuseumSceneDocument } from '$lib/content/scene'`) to avoid introducing new runtime circular imports. Preserve the existing type-only `scene ↔ scene-codec` cycle as-is.
- **No new dependencies.** No new runtime packages; no new test frameworks.
- **Phase banner comments die at the slice boundary** that makes them redundant (same rule as the 2026-07-28 plan).
- **Verification command (every slice):**
  ```bash
  cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run <focused-files> && npm run test -w @portfolio/museum && npm run check -w @portfolio/museum
  ```
- **No commits at all unless the user explicitly asks — full stop, per `AGENTS.md`.** A "slice" is a logical green-test checkpoint + hand-off file, not a commit.
- **Hand-off contract:** every slice writes `docs/agent-handoffs/2026-08-03-<status>-priority-1-split-<N>-<name>.md` with sections: Status / Date / What landed / Files touched / Verification evidence (exact counts) / Next slice pointer. Do not skip it.

---

## Reference index (read once)

| Need | File |
|---|---|
| Previous refactor conventions | `docs/archive/refactor-audit/2026-07-28-refactor-plan.md` |
| Project conventions | `AGENTS.md` |
| Scene JSON contract | `docs/CAMERA_AND_LAYOUT.md` |
| Facade being split | `apps/museum/src/lib/editor/museum-editor.svelte.ts` (3 640 LOC) |
| Suite being split | `apps/museum/src/lib/editor/museum-editor.test.ts` (4 350 LOC, 28 describes) |
| Codec being split | `apps/museum/src/lib/content/scene-codec.ts` (2 337 LOC) |
| Codec safety net | `apps/museum/src/lib/content/scene-codec.test.ts` (887 LOC) |
| Existing sub-store pattern | `apps/museum/src/lib/editor/store/*.svelte.ts` + their `*Host` interfaces |
| Fixture loader | `apps/museum/src/lib/content/__fixtures__/load-fixture-scene.ts` |
| Codec consumers (must not change imports) | `load-fixture-scene.ts`, `document-store.svelte.ts`, `document-store.test.ts`, `navigation-graph-mutator.svelte.ts`, `museum-editor.svelte.ts`, `museum-editor.test.ts`, `EditorProjectMenu.svelte` |

---

## End-state file tree (target)

```
apps/museum/src/lib/editor/
  museum-editor.svelte.ts               ← lean composition root (target ≈ 2 400 LOC; residual getter surface flagged for a later slice)
  museum-editor.types.ts                ← unchanged
  editor-test-utils.ts                  ← NEW shared suite fixtures
  store/
    controller-hosts.ts                 ← NEW: all 7 host object-literal factories
    camera-preview-commands.svelte.ts   ← NEW: preview/timeline playback orchestration
    texture-library-controller.svelte.ts ← NEW: Phase 5.2 texture orchestration
    (existing store/ modules unchanged)
  (sibling themed suites, see Slice 4)

apps/museum/src/lib/content/
  scene-codec/                          ← NEW directory (was scene-codec.ts)
    index.ts                            ← public barrel (~250 LOC)
    types.ts                            ← issues/results/error + legacy doc types
    readers.ts                          ← field readers + issue helpers
    parse-entities.ts                   ← entity/primitive/light/cluster/texture/material
    parse-nodes.ts                      ← parseNodeV1V2 / V3 / V4
    parse-connections.ts                ← waypoints/paths/views/timing/connections
    validate.ts                         ← validateSemantics + V2 tour + view-keyframe poses
    canonical.ts                        ← clone* + canonicalDocument
    migrate.ts                          ← migrateVersionOne/Two/Five/Six
```

---

## Slice 1: Store — extract host factories to `store/controller-hosts.ts`

**Files:**
- Create: `apps/museum/src/lib/editor/store/controller-hosts.ts`
- Modify: `apps/museum/src/lib/editor/museum-editor.svelte.ts`

**Context:** The class holds seven private `#createXxxHost()` methods (object literals that close over `const self = this`) at lines ~450–905: `#createSelectionHost`, `#createNavigationGraphMutatorHost`, `#createViewKeyframeControllerHost`, `#createCameraTimelineControllerHost`, `#createPlacementClusterMutatorHost`, `#createPathAnchorMutatorHost`, `#createMaterialResourceMutatorHost`. Together ≈ 450 LOC of pure wiring. The host types (`EditorSelectionActionsHost`, `EditorNavigationGraphMutatorHost`, …) already live in their controller files.

- [x] **Step 1: Declare one structural source interface**

At the top of `store/controller-hosts.ts`, declare `EditorControllerHostSource` listing every facade member the seven hosts read/write (compile by walking each literal; the set is: `isDocumentMutationBlocked`, `isCameraFramingMutationBlocked`, `isEditorInteractionActive`, `document`, `scene`, `state`, `selection` (the `EditorSelectionStore`), `session`/`sessionView`, `cameraPreview`, `currentWorkspace`, `pendingNavigationCommand` (+ setter), `pendingNavigationNode`, `selectedNavigationNode`, `selectedRoomId`, `selectedPlacementIds`, `selectedClusterId`, `activeCameraConnectionId` (+ setter), `activeCameraDirection` (+ setter), `navigationSelection` (+ setter), `treeExpandedCameraConnectionIds` (+ setter), `treeExpandedCameraDirectionKeys` (+ setter), `transformMode`, `clusters`, `isPendingNavigationNode`, `connectPendingNavigationNode`, `cancelAssetPlacement`, `cancelPendingFrame`, `cancelPendingNavigation`, `setStatusMessage`, `focusNavigationNode`, `focusPlacement`, `focusSelection`, `ensureRoomTreeExpanded`, `ensureClusterTreeExpanded`, `isPlacementSelectable`, `setNavigationHover`, `getCapturedCameraPreviewRoute`, `setCameraPreviewPlayhead`, `requestPlacementFrame`, `beginDocumentTransaction`, `beginCameraFramingTransaction`, `commitDocumentTransaction`, `cancelDocumentTransaction`, `getCameraTimeline`, `stopCameraPreview`, `syncCameraTimelineForNode`, `showCameraTimelineNodePose`, `syncCameraTimelineForConnection`, `showCameraTimelineConnectionPose`, `seedEmptyReverseForSelectedForwardTrack`, `allocPreviewRunId`, `setCapturedPreviewRoute`, `setCameraPreview`, `selectCameraTimelineViewKeyframe`).

- [x] **Step 2: Move the seven object literals**

Copy each `#createXxxHost()` body into `controller-hosts.ts` as a module-level factory keyed on the source interface, e.g.:

```ts
export function createControllerHosts(source: EditorControllerHostSource) {
  const selection = {
    get isDocumentMutationBlocked() { return source.isDocumentMutationBlocked; },
    // … verbatim from the current #createSelectionHost literal
  } satisfies EditorSelectionActionsHost;
  // … six more literals
  return { selection, navigationGraph, viewKeyframe, cameraTimeline, placementCluster, pathAnchor, materialResource };
}
```

The store satisfies the source interface structurally; pass `this` (add a `/** Internal host surface — controllers only. */` getter or cast at the single call site).

- [x] **Step 3: Wire the constructor**

In `museum-editor.svelte.ts`, delete the seven `#createXxxHost()` methods, create `private readonly hosts = createControllerHosts(this as unknown as EditorControllerHostSource);` before `selectionActions`, and rewrite the seven constructor instantiations to read from `this.hosts.*` (e.g. `new EditorSelectionActions(this.selectionStore, this.hosts.selection)`).

- [x] **Step 4: Verify**

Run: `npm run test -w @portfolio/museum -- --run src/lib/editor/museum-editor.test.ts src/lib/editor/store/selection-actions.test.ts src/lib/editor/store/selection-store.test.ts src/lib/editor/store/session-state.test.ts src/lib/editor/store/history-controller.test.ts src/lib/editor/store/camera-preview-controller.test.ts src/lib/editor/store/document-store.test.ts src/lib/editor/store/mutation-guards.test.ts src/lib/editor/store/scene-roots.test.ts src/lib/editor/store/material-resource-mutator.test.ts`
Expected: all pass with zero edits to expectations. Then the full suite + check.

- [x] **Step 5: Hand-off** — write `docs/agent-handoffs/2026-08-03-complete-priority-1-split-1-controller-hosts.md`.

---

## Slice 2: Store — extract preview + timeline playback commands

**Files:**
- Create: `apps/museum/src/lib/editor/store/camera-preview-commands.svelte.ts`
- Modify: `apps/museum/src/lib/editor/museum-editor.svelte.ts`

**Context:** The facade still carries the playback orchestration block (≈ 500 LOC, roughly lines 1850–2700): timeline seek/select/step (`seekCameraTimeline`, `toggleCameraEdgeReverse`, `setCameraEdgeTravel`, `selectCameraTimelineEdge`, `selectCameraTimelineNode`, `selectCameraTimelineViewKeyframe`, `stepCameraTimeline`), edge/guide/node/transition preview entry (`playActiveConnectionEdge`, `previewActiveConnectionReverse`, `previewGuidedTour`, `previewSelectedNode`, `previewSelectedTransition`), FSM commands (`setCameraPreviewMode`, `playCameraPreview`, `pauseCameraPreview`, `setCameraPreviewPlayhead`, `stepCameraPreview`, `toggleCameraPreviewFollow`, `recenterCameraPreview`, `markCameraPreviewStarted`, `completeCameraPreview`, `stopCameraPreview`, `getCapturedCameraPreviewRoute`), and the private route plumbing (`#resolveCameraPreviewRoute`, `#prepareCameraPreview`, `#seedEmptyReverseForSelectedForwardTrack`). The FSM *state* already lives in `camera-preview-controller.svelte.ts`; this slice moves the *commands* that orchestrate it.

- [ ] **Step 1: Create the controller + host**

```ts
// store/camera-preview-commands.svelte.ts
export interface EditorCameraPreviewCommandsHost { /* same source members as Slice 1, narrowed */ }
export class EditorCameraPreviewCommands {
  constructor(
    private readonly selectionActions: EditorSelectionActions,
    private readonly host: EditorCameraPreviewCommandsHost
  ) {}
  playCameraPreview(): boolean { /* verbatim body */ }
  // … every method listed above, moved verbatim
}
```

`#resolveCameraPreviewRoute` / `#prepareCameraPreview` move as private methods; `#seedEmptyReverseForSelectedForwardTrack` moves here and the host exposes `seedEmptyReverseForSelectedForwardTrack()` back to the store because `commitDocumentTransaction()` still calls it (keep a one-line facade delegate that forwards to the controller).

- [ ] **Step 2: Rewire the facade**

Delete the moved methods from `MuseumEditorStore`; add `readonly cameraPreviewCommands: EditorCameraPreviewCommands;` and one-line delegations with the exact same signatures (e.g. `playCameraPreview() { return this.cameraPreviewCommands.playCameraPreview(); }`). The store passes `this` as the host source.

- [ ] **Step 3: Verify**

Run the preview/timeline suites: `--run src/lib/editor/museum-editor.test.ts src/lib/editor/store/camera-preview-controller.test.ts src/lib/editor/editor-camera-timeline.test.ts src/lib/editor/editor-camera.test.ts src/lib/editor/editor-camera-path.test.ts src/lib/editor/editor-camera-view.test.ts src/lib/editor/editor-camera-framing.test.ts` — all green, then full suite + check.

- [ ] **Step 4: Hand-off** — `docs/agent-handoffs/2026-08-03-complete-priority-1-split-2-preview-commands.md`.

---

## Slice 3: Store — extract texture facade + module helpers

**Files:**
- Create: `apps/museum/src/lib/editor/store/texture-library-controller.svelte.ts`
- Modify: `apps/museum/src/lib/editor/museum-editor.svelte.ts`
- Create: `apps/museum/src/lib/editor/helpers/route-clone.ts`
- Create: `apps/museum/src/lib/editor/helpers/document-clone.ts`
- Modify: `apps/museum/src/lib/editor/helpers/scene-keys.ts`

**Context:** The Phase 5.2 texture facade (lines ~3101–3270) holds async orchestration: `registerTexture`, `probeTexture`, `requestMaterialEdit`, `requestTextureAssignment`, `confirmPendingMaterialEdit`, `cancelPendingMaterialEdit`, `makeMaterialInstanceUnique` — plus the `textureVerifier` field and its constructor option. The pure mutator (`store/material-resource-mutator.svelte.ts`) stays where it is; only the orchestration moves.

- [ ] **Step 1: Create `EditorTextureLibraryController`**

```ts
// store/texture-library-controller.svelte.ts
export interface EditorTextureLibraryControllerHost {
  readonly isDocumentMutationBlocked: boolean;
  readonly isEditorInteractionActive: boolean;
  readonly document: MuseumSceneDocument;
  readonly session: EditorSessionState;           // or narrowed session surface
  readonly materialResourceMutator: EditorMaterialResourceMutator;
  readonly textureVerifier: TextureVerifier;
  setStatusMessage(message: string | null): void;
  selectPlacement(entityId: string): boolean;      // delegates to selectionActions
}
export class EditorTextureLibraryController {
  constructor(private readonly host: EditorTextureLibraryControllerHost) {}
  async registerTexture(name: string, uri: string): Promise<string | null> { /* verbatim */ }
  async probeTexture(textureId: string): Promise<boolean> { /* verbatim */ }
  requestMaterialEdit(entityId: string, patch: MaterialInstancePatch): boolean { /* verbatim */ }
  requestTextureAssignment(entityId: string, textureId: string): boolean { /* verbatim */ }
  confirmPendingMaterialEdit(decision: MaterialEditDecision): boolean { /* verbatim */ }
  cancelPendingMaterialEdit(): boolean { /* verbatim */ }
  makeMaterialInstanceUnique(entityId: string): boolean { /* verbatim */ }
}
```

The store moves `textureVerifier` ownership onto the controller (constructor still accepts `options.textureVerifier ?? createTextureVerifier()` and passes it in); facade methods become one-line delegates; `recentTextureIds` / `textureLoadStates` / `pendingMaterialEdit` getters stay on the facade (they are the public session surface). `requestTextureAssignment`'s success `selectPlacement` moves into the controller via the host.

- [ ] **Step 2: Extract module helpers**

- Move `cloneRoutePoint` + `isRoutePointTuple` + `cloneResolvedCameraRoute` → `helpers/route-clone.ts` (exports `cloneResolvedCameraRoute`).
- Move `cloneMuseumSceneDocument` → `helpers/document-clone.ts`; re-export from `museum-editor.svelte.ts` so the 40 consumer imports keep working (the file already re-exports `cloneMuseumSceneDocument`).
- Move `cameraDirectionTreeKey` → `helpers/scene-keys.ts` (next to `CAMERA_DIRECTION_TREE_KEY_SEPARATOR`).
- `navigationStateFromLegacy` / `navigationSelectionFromState` are only used by the store's legacy setters — keep them in `museum-editor.svelte.ts` for now (they may fold into `selection-store.svelte.ts` in a later slice; not required here).

- [ ] **Step 3: Verify**

Run: `--run src/lib/editor/museum-editor.test.ts src/lib/editor/store/material-resource-mutator.test.ts src/lib/editor/store/session-state.test.ts src/lib/editor/editor-textures.test.ts src/lib/editor/texture-verifier.test.ts src/lib/content/scene-codec.test.ts` — all green; full suite + check.

- [ ] **Step 4: Record the new size** — confirm `museum-editor.svelte.ts` dropped below ~2 500 LOC (from 3 640; this slice removes ≈ 260 LOC: texture orchestration + three module-helper moves). The residual getter/setter/delegation blocks are the facade's public surface — they must stay for the freeze. List them in the hand-off as a future-slice candidate (thinning them means moving their reads onto sub-stores, which is a separate risk profile); do not over-extract here.

- [ ] **Step 5: Hand-off** — `docs/agent-handoffs/2026-08-03-complete-priority-1-split-3-texture-controller.md`.

---

## Slice 4: Split `museum-editor.test.ts` (4 350 LOC → themed suites)

**Files:**
- Create: `apps/museum/src/lib/editor/editor-test-utils.ts`
- Create: `apps/museum/src/lib/editor/museum-editor-selection.test.ts`
- Create: `apps/museum/src/lib/editor/museum-editor-placement.test.ts`
- Create: `apps/museum/src/lib/editor/museum-editor-camera.test.ts`
- Create: `apps/museum/src/lib/editor/museum-editor-textures.test.ts`
- Modify: `apps/museum/src/lib/editor/museum-editor.test.ts` (residual)
- Modify: `apps/museum/src/lib/editor/editor-selection.test.ts`, `editor-transform.test.ts`, `editor-camera-framing.test.ts` (merge pure-helper describes)

**Context:** 28 describes in one file. The existing `store/*.test.ts` files already cover the sub-stores; the remaining describes are (a) pure-helper suites that duplicate the dedicated `editor-*.test.ts` files and (b) store-integration suites that exercise the facade. Split by concern, mirroring the modules the tests exercise. The safety net here is **moving tests verbatim** — expectations never change.

- [ ] **Step 1: Extract shared fixtures to `editor-test-utils.ts`**

Move `FIXTURE_GUIDED_ORDER`, `cloneFixtureDocumentWithEntityCount`, `createFixtureEditorStore` (lines ~40–72) into `editor-test-utils.ts` with the same imports they need (`cloneFixtureDocument`, `createMuseumEditorStore`, `MuseumSceneDocument`). Keep the per-describe local helpers (`importWithViewKeys`, `addDocumentConnection`, `documentWithFreeInsertableNode`, `documentWithFreeNode`, `importWithDragKeys`, `installPausedVisitorNodePreview`, `makeHistory`, `translatedTransform`, `firstForwardSelection`) **with their describing blocks** — do not hoist them globally.

- [ ] **Step 2: Merge the pure-helper describes into their dedicated files**

- `describe('editor-selection helpers', …)` (line 2521) → append to `editor-selection.test.ts` (import the helpers it exercises from `editor-selection.ts`; delete from the mega-suite).
- `describe('editor placement transforms', …)` (line 2363) → append to `editor-transform.test.ts` if its assertions exercise `placementTransformFromDocument` / `writePlacementTransform` directly; otherwise move to the placement suite.
- `describe('editor room camera framing', …)` (line 1059) → append to `editor-camera-framing.test.ts` if pure (`createEditorRoomCameraFrame`), else to the camera suite.

- [ ] **Step 3: Move the store-integration describes by theme**

| New file | Describe blocks (line) |
|---|---|
| `museum-editor-selection.test.ts` | selection (248), clusters (498), Phase 2.1 persistent camera discovery (2569) |
| `museum-editor-placement.test.ts` | Phase 5 placement commands (646), Phase 4.3 primitive creation (825), Phase 4.4 light creation (941), placement settings (2459) |
| `museum-editor-camera.test.ts` | Phase 6 camera nodes (1080), Phase 6.5 camera paths (1478), Director preview (1932), camera view authoring (2032), Phase 2.2 timeline selection/scrub (2818), Phase 2.3 whole guided-tour playback (3036), Phase 3.1 selection/Play parity (3116), Phase 2.4 progress drag (3270), Phase 3.4 guided-order (3446), Phase 3.5 drag-connect (3607), Phase 3.6 framing controls (3797), Phase 3.6 framing cleanup (3880) |
| `museum-editor-textures.test.ts` | Phase 5.2 texture facade (4094) |

Each new file imports from `./editor-test-utils`, `./museum-editor.svelte`, and the fixture loader, and keeps its describing-block-local helpers. Residual `museum-editor.test.ts` keeps: `cloneMuseumSceneDocument` (75), `createMuseumEditorStore` (94), `MuseumEditorStore history` (2396), `viewport visibility flags` (4046) — the smoke + history core.

- [ ] **Step 4: Verify after every move**

Run the new file alone (`npm run test -w @portfolio/museum -- --run <file>`), then the residual mega-suite, then the full suite + check. A moved describe must pass with zero expectation edits — if it doesn't, the move introduced a bad import or a lost fixture; fix the import, never the assertion.

- [ ] **Step 5: Hand-off** — `docs/agent-handoffs/2026-08-03-complete-priority-1-split-4-test-split.md`.

---

## Slice 5: Split `scene-codec.ts` → `scene-codec/` directory

**Files:**
- Create: `apps/museum/src/lib/content/scene-codec/types.ts`
- Create: `apps/museum/src/lib/content/scene-codec/readers.ts`
- Create: `apps/museum/src/lib/content/scene-codec/parse-entities.ts`
- Create: `apps/museum/src/lib/content/scene-codec/parse-nodes.ts`
- Create: `apps/museum/src/lib/content/scene-codec/parse-connections.ts`
- Create: `apps/museum/src/lib/content/scene-codec/validate.ts`
- Create: `apps/museum/src/lib/content/scene-codec/canonical.ts`
- Create: `apps/museum/src/lib/content/scene-codec/migrate.ts`
- Create: `apps/museum/src/lib/content/scene-codec/index.ts`
- Delete: `apps/museum/src/lib/content/scene-codec.ts` (after `git mv` + split)

**Context:** 2 337 LOC organized as: types + issue plumbing (41–118), entity/nodes/connection/resource parsers (119–1520), semantic validation (1537–1897), canonical clone + normalization (1897–2063), migrations (2063–2125), public entry `validateSceneDocument` / `parseSceneDocumentJson` / `serializeSceneDocument` (2125–2337). Every internal function below is currently module-private; moving them to sibling modules requires exporting them internally (mark with `/** @internal — scene-codec only */`), while the **public barrel exports only the frozen surface**. SvelteKit/TS resolves `$lib/content/scene-codec` → `scene-codec/index.ts`, so all 7 consumers import unchanged.

- [ ] **Step 1: `git mv` the file into place**

```bash
mkdir apps/museum/src/lib/content/scene-codec
git mv apps/museum/src/lib/content/scene-codec.ts apps/museum/src/lib/content/scene-codec/index.ts
```

Verify consumers still compile at this point (index.ts is still the whole codec). Run the codec suite: `npm run test -w @portfolio/museum -- --run src/lib/content/scene-codec.test.ts src/lib/content/scene.test.ts`.

- [ ] **Step 2: Extract `types.ts`**

Move `JsonRecord` (63), `SceneDocumentIssue` (41), `SceneDocumentValidationResult` (47), `SceneDocumentValidationError` (51), `MuseumSceneDocumentV3V4` (77), `MuseumSceneDocumentV5` (82), `MuseumSceneDocumentV2` (89), `LegacyMuseumSceneDocument` (101), `ParsedMuseumSceneDocument` (106). Import them into `index.ts` and re-export the three public ones.

- [ ] **Step 3: Extract `readers.ts`**

Move `isRecord` (139), `addIssue` (143), `assertAllowedKeys` (152), `readRequiredString` (165), `readOptionalString` (182), `readRequiredBoolean` (192), `readRequiredNumber` (206), `readUnitInterval` (224), `readVec3` (323), `isKnownRoomId` (343), `readRoomId` (352), `readStringArray` (366), `readPositiveDimension` (429), `readHoldSeconds` (1302), `readEasing` (1322), `stringifyUnknown` (1366), `jsonErrorMessage` (2314). Export each with `/** @internal */`.

- [ ] **Step 4: Extract `parse-entities.ts`**

Move `modelEntityFromPlacement` (119), `documentEntities` (134), `parsePlacement` (386), `parsePrimitiveDimensions` (444), `parseEntityTransform` (482), `parseModelEntity` (501), `parsePrimitiveEntity` (562), `parseLightEntity` (644), `parseEntity` (795), `parseCluster` (815), `parseTextureAsset` (245), `parseMaterialInstance` (270).

- [ ] **Step 5: Extract `parse-nodes.ts`**

Move `parseNodeV1V2` (833), `parseNodeV3` (867), `parseNodeV4` (948).

- [ ] **Step 6: Extract `parse-connections.ts`**

Move `parseWaypoint` (1032), `parsePathAnchor` (1049), `parseWaypoints` (1067), `parseConnectionBase` (1084), `parseLegacyConnection` (1125), `parsePositionPath` (1149), `parseViewKeyframe` (1184), `parseViewTrack` (1265), `parseViewTracks` (1285), `cameraSceneConnectionTimingFailureReason` (1351 — **public**, re-export from index), `parseConnectionTiming` (1370), `parseConnectionTimingPair` (1404), `parseConnectionV2` (1433), `parseConnectionV3` (1453), `parseConnectionV4` (1481), `assertUnique` (1520).

- [ ] **Step 7: Extract `validate.ts`**

Move `distance` (1533), `validateSemantics` (1537), `validateVersionTwoTour` (1757), `validateViewKeyframePoses` (1845).

- [ ] **Step 8: Extract `canonical.ts`**

Move `cloneWaypoint` (1897), `cloneViewKeyframe` (1904), `cloneEntity` (1918), `canonicalDocument` (2003).

- [ ] **Step 9: Extract `migrate.ts`**

Move `migrateVersionOneDocument` (2063), `migrateVersionTwoDocument` (2088), `migrateToVersionFive` (2101), `migrateToVersionSix` (2113).

- [ ] **Step 10: Reduce `index.ts` to the entry + barrel**

Keep only `validateSceneDocument` (2125), `parseSceneDocumentJson` (2325), `serializeSceneDocument` (2333) in `index.ts`, importing every internal from its new module, and re-export the public surface:

```ts
export type { SceneDocumentIssue, SceneDocumentValidationResult } from './types';
export { SceneDocumentValidationError } from './types';
export { cameraSceneConnectionTimingFailureReason } from './parse-connections';
export { validateSceneDocument, parseSceneDocumentJson, serializeSceneDocument };
```

- [ ] **Step 11: Verify**

Run: `npm run test -w @portfolio/museum -- --run src/lib/content/scene-codec.test.ts src/lib/content/scene.test.ts src/lib/editor/museum-editor.test.ts src/lib/editor/store/document-store.test.ts src/lib/editor/store/navigation-graph-mutator.test.ts` — all green with **zero edits to any consumer or test expectation**. Then full suite + check + `npm run build -w @portfolio/museum` + `git diff --check`.

- [ ] **Step 12: Hand-off** — `docs/agent-handoffs/2026-08-03-complete-priority-1-split-5-codec.md`.

---

## Slice 6: Final gate + release handoff

**Files:**
- Create: `docs/agent-handoffs/2026-08-03-complete-priority-1-splits.md`
- Modify: `docs/agent-handoffs/CURRENT.md`
- Modify: `docs/plans/museum-editor-workspace/README-museum-editor.md`

- [ ] **Step 1: Full automated gate**

```bash
npm run test -w @portfolio/museum
npm run check -w @portfolio/museum
npm run build -w @portfolio/museum
git diff --check
```

Expected: full suite green (≥ 660 tests), check 0 errors / 0 warnings, build exit 0 (adapter-auto env note only), diff-check silent.

- [ ] **Step 2: Record the new sizes**

`wc -l` the three split targets. Acceptance: `museum-editor.svelte.ts` ≤ ~2 500 LOC (from 3 640 — the residual is facade getter/setter/delegation surface), `museum-editor.test.ts` residual + themed suites each ≤ ~1 000 LOC, `scene-codec/` modules each ≤ ~400 LOC with `index.ts` ≤ ~250 LOC.

- [ ] **Step 3: Write the final handoff**

Record: files created/moved, exact test/check/build counts, post-split LOC table, any residual getter blocks left on the facade (candidate for a future slice), and the next-slice pointer (suggested: fold `navigationStateFromLegacy` / `navigationSelectionFromState` into `selection-store.svelte.ts`, or start Phase 5.3 shared material rendering). Update `CURRENT.md` and the release README status lines. **No commits.**

---

## Execution Notes

- Execute slices in order; each slice consumes only its predecessor.
- Keep every slice's focused test command visible in output.
- Use a fresh implementation subagent per slice when using subagent-driven development.
- Run a requirements review after Slice 5 and before the final gate.
- No commits are authorized by this plan.
