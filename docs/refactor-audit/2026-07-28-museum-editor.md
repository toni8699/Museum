# Museum editor — refactor audit

**Date:** 2026-07-28
**Branch:** main (2 commits ahead of `origin/main`)
**Scope:** `apps/museum/src/lib/editor/**`, plus the visitor-side consumers in `apps/museum/src/lib/museum/**` that touch editor modules.
**Method:** line-count inventory, dependency sweep, full reads of the top five suspects, characterisation of mutation + history + selection surface.

This is an **audit**. It proposes boundaries and sequencing. It does **not** itself change code.

---

## TL;DR

The museum editor has **one 4 609-LOC class** (`MuseumEditorStore`) bundling **11 concerns** under a single seam. Recent phase work (2.1 persistent camera discovery, 2.2 timeline ruler, 2.4 view-keyframe progress drag, 3.7 connection timing) all **stacked into that file**, and 18 components import it. The structural fix is a six-cell sub-store composition behind a thin facade: document, history, selection, camera preview, session, scene roots. Ten-step migration, ≈ 2–3 dev weeks. Step **5** (selection reducer) and step **8** (`EditorSelection.svelte` split) are the high-risk single PRs; everything else is facade-stable.

---

## 1. Measured inventory

Line counts are post-3.7 work (timing-on-connections / hold / easing). All numbers are from `wc -l` against the current working tree.

### 1.1 The editor folder

Top offenders measured; rest of the folder is small enough not to be a structural problem.

| file | lines | kind |
|---|---:|---|
| `museum-editor.svelte.ts` | **4609** | `./MuseumEditorStore` class — **the god file** |
| `museum-editor.test.ts` | 3631 | exhaustive vitest suite covering the store |
| `EditorSelection.svelte` | **1011** | placement/camera/anchor/cluster selection picker UI |
| `museum-editor-shell.test.ts` | 280 | shell routing tests |
| `editor-camera-timeline.test.ts` | 371 | camera-timeline helper tests |
| `editor-camera-timeline.ts` | 442 | `EditorCameraTimeline` builder |
| `editor-navigation-graph.ts` | 599 | pure validators for guided tour / topology |
| `editor-placement.ts` | 295 | snap / placement transform helpers |
| `EditorCameraRig.svelte` | **531** | visitor / director / paused preview camera rig |
| `editor-camera-path.ts` | 292 | path anchor read/write helpers |
| `editor-camera-view.ts` | 126 | view keyframe read/write helpers |
| `EditorCameraTimelinePanel.svelte` | **504** | bottom-panel ruler + dots |
| `editor-cluster-transform.ts` | 107 | pure cluster transform math |
| `editor-cluster-transform.test.ts` | 74 | |
| `EditorCameraTree.svelte` | **482** | camera workspace tree (rooms + connections + directions) |
| `EditorTransformControls.svelte` | **456** | gizmo + transform mode dispatch + drag commit |
| `EditorInspector.svelte` | **325** | right-rail mode-switching inspector |
| `editor-selection.ts` | 425 | three.js hit-climb + resolveNormalSelection rules |
| `EditorAppBar.svelte` | 314 | app bar, undo/redo, project menu, import/export |
| `MuseumEditorApp.svelte` | 268 | shell + global keyboard handler |
| `editor-camera.ts` | 287 | editor → placement camera setup helpers |
| `editor-camera-path.test.ts` | 271 | |
| `EditorCameraViewHelpers.svelte` | 284 | eye / target / FOV handles render |
| `EditorCameraPathHelpers.svelte` | 257 | path curve + anchor drawings (editor-only) |
| `EditorCameraFramingHelpers.svelte` | 196 | keyframe marker helpers |
| `EditorCameraTimelineFrame.svelte` | 194 | bottom-panel chrome |
| `EditorTransformInspector.svelte` | 187 | numeric XYZ + scale inspector |
| `EditorPlacementInspector.svelte` | 174 | dropdowns/snap/keep-on-floor toggles |
| `EditorSceneTree.svelte` | 209 | scene-workspace tree (rooms + placements + clusters) — small, healthy |
| `editor-vector.ts` | 27 | tiny vec helpers |
| `editor-navigation-graph.test.ts` | 437 | |
| `editor-assets.ts` | 41 | cycle-guarded id reservation |
| `editor-assets.test.ts` | 37 | |
| `MuseumEditorStub.svelte` | 2 | router placeholder |
| `EditorNumberField.svelte` / `EditorVec3Field.svelte` / `EditorCameraFovField.svelte` / `EditorProgressField.svelte` | 116 / 159 / 108 / 74 | commit-on-blur numeric inputs |

Verified fact: `clusteredPlacementIds` lives at `museum-editor.svelte.ts:2874` as a real class getter (`get clusteredPlacementIds(): Set<string>`). The local `$derived` in `EditorSceneTree.svelte:17` re-derives the same set locally for template-only use. The duplication is minor but worth fixing in §3.C (move to `EditorSessionState` or drop the duplication).

### 1.2 Reader view

- **Editor folder total:** ~12 000 lines including tests; **~7 600** without tests.
- **Four large Svelte suspects** (paths to look at first when planning): `museum-editor.svelte.ts`, `EditorSelection.svelte` (1011), `EditorCameraRig.svelte` (531), `EditorCameraTimelinePanel.svelte` (504). `EditorCameraTree.svelte` (482) joins the cohort as the camera-workspace tree (a real, follow-along god component). `EditorTransformControls.svelte` (456) is right at the edge.
- One class — `MuseumEditorStore` — is **the** reason a lot of editor code is awkward: it owns every byte of editor state and every mutation.
- **77 internal `$lib/...` imports** across the editor folder. The hottest imports are `$lib/content/scene` (resolvers + types), `$lib/museum/navigation/camera-motion` (motion sample/sample-at-progress), `$lib/content/scene-codec` (validate/serialize), `$lib/state/museum-state.svelte` (visitor FSM clone). Sane — no duplication.
- **18 files import `MuseumEditorStore`** as a type and 3 import runtime helpers (`cloneMuseumSceneDocument`, `createMuseumEditorStore`, `validateSceneConnectionTiming`). The class is the implicit single seam: every component, helper, and test funnels through it.

### 1.3 The god file — what it actually does

`MuseumEditorStore` (4609 LOC) bundles **11 separable concerns** under one class. Each has its own `$state` fields, private state, derived getters, mutable methods, and external canceller slots.

| # | Concern | State (sample) | Public surface (sample) | Why it lives in the store today |
|---|---|---|---|---|
| 1 | Authoring document | `document`, `validation`, `baselineCanonicalJson` | `replaceDocument`, `resetToCheckedInDocument`, `importDocument`, `canonicalJson` | needed everywhere |
| 2 | History / transactions | `#past`, `#future`, `#transactionBefore`, `#cameraFramingTransaction`, `historyVersion` | `undo`, `redo`, `beginDocumentTransaction`, `commitDocumentTransaction`, `cancelDocumentTransaction`, `beginCameraFramingTransaction` | needed everywhere, touches both `(1)` and `(3)` |
| 3 | Placement / cluster selection | `selectedRoomId`, `selectedPlacementIds`, `selectedClusterId`, `pendingFramePlacementIds`, `pendingFrameVersion` | `selectRoom`, `selectPlacement`, `selectPlacements`, `selectCluster`, `cyclePlacement`, `selectAllInRoom`, `focusPlacement`, `focusSelection` | because selection sometimes drives transform, sometimes the camera, sometimes the tree |
| 4 | Navigation / camera selection | `navigationSelection`, `activeCameraConnectionId`, `activeCameraDirection`, `pendingNavigationCommand`, `treeExpanded…` | `selectNavigationNode`, `selectCameraHandle`, `selectConnection`, `selectAnchor`, `selectViewKeyframe`, `finishAnchorEditing`, `finishViewKeyframeEditing` | mixed-style discriminated union is convenient here but the tree-expansion arrays leak |
| 5 | Camera preview FSM | `cameraPreview`, `#capturedCameraPreviewRoute`, `#nextCameraPreviewRunId`, `cameraPreviewFollowEnabled`, `cameraPreviewRecenterVersion` | `stopCameraPreview`, `previewGuidedTour`, `playCameraPreview`, `pauseCameraPreview`, `requestDropToFloor` | because preview must outlive any one component and own a captured route snapshot |
| 6 | Director timeline scrub | `cameraTimelinePlayhead`, `#cameraTimelineGraph`, `#cameraTimelineCache` | `seekCameraTimeline`, `selectCameraTimelineEdge`, `selectCameraTimelineNode`, `selectCameraTimelineViewKeyframe`, `stepCameraTimeline`, `getCameraTimeline` | needs the graph from `(1)` and timeline cache both |
| 7 | Asset placement / pending drop | `pendingPlacementAssetId` | `beginAssetPlacement`, `cancelAssetPlacement`, `requestDropToFloor`, `dropToFloorRequestId` | minor but coupled to `(3)` |
| 8 | Pointer / drag interaction flags + cancellers | `transformInteractionActive`, `transformInteractionKind`, `directPathInteractionActive`, `directFramingInteractionActive`, `viewKeyframeProgressDrag`, `#cancelTransform`, `#cancelDirectPathDrag`, `#cancelDirectFramingDrag`, `#restoreCameraPreview` | `setTransformCanceler`, `setDirectPathDragCanceler`, `setDirectFramingDragCanceler`, `setCameraPreviewRestorer`, `cancelViewKeyframeProgressDrag` | modal guards need cross-component sync |
| 9 | Status messages + focus requests + dirty / save lifecycle | `statusMessage`, `cameraFocusVersion`, `cameraFocusKind`, `cameraFocusPlacementId`, `cameraFocusNodeId` | `setStatusMessage`, `focusNavigationNode`, `focusPlacement`, `focusSelection`, `consumeCameraFocus`, **also `canonicalJson`, `isDirty`, `canExport`, `applyLightingPreset`** | dirty/save lifecycle bleeds across `(1)` and `(9)`; the export buttons in `EditorAppBar` read these getters directly |
| 10 | Lighting + fog + grid + panning | `ambientIntensity`, `directionalIntensity`, `fogEnabled`, `fogNear`, `fogFar`, `gridVisible`, `cameraPanEnabled` | `applyLightingPreset`, `toggleGrid`, `toggleCameraPan` | exclusively viewport-affecting |
| 11 | Placement tools / snap preferences + Object3D registry | `translationSnapEnabled`, `translationSnap`, `rotationSnapEnabled`, `rotationSnapDegrees`, `keepOnFloor`, `registryVersion`, `#placementRoots`, `#cameraHelperRoots`, `#anchorHelperRoots`, `#viewKeyframeTargetHelperRoots` | `getPlacementRoot`, `getCameraHelperRoot`, `getAnchorHelperRoot`, `getViewKeyframeTargetHelperRoot`, `registerPlacementRoot`, … | helpers use them, also touch `(3)` |

It also exposes an **exported top-level** `validateSceneConnectionTiming` and `cloneMuseumSceneDocument` that have nothing to do with the class.

Note that concern 9 in the audit's reading is broader than it first appears — `isDirty`, `canExport`, and `canonicalJson` are paired with `baselineCanonicalJson` (concern 1) and read by `EditorAppBar` for the project menu. If we move session state to a sub-store, dirty/export checks should move with them.

---

## 2. Findings (ranked)

Each finding is rated by **Pain × Friction**. Pain is the cost of *not* doing it (bug surface, slow edits, broken mental model). Friction is the cost of *doing* it now. The recommendation column is biased hard toward "do this".

| # | Finding | Pain | Friction | Recommend? |
|---|---|---|---|---|
| **F1** | `MuseumEditorStore` is one giant class with 11 concerns co-mingled (4609 lines, ~60 `$state`, ~50 public methods, ~25 private methods, ~20 internal #fields). | **Very high.** Single seam = every change touches the file. Recent work (Phase 2.1, 2.2, 2.4, 3.7) all added more methods here. | **Med.** Wide test coverage acts as a refactor guard. | **Yes.** Decompose into sub-stores (see §3). |
| **F2** | **Trees, focus channels, asset placement, drag flags, lighting**, and **placement-tool preferences** are session-only UI state that has nothing to do with document mutation. They ride along on `#reconcileSelection` / `#replaceDocument`. | High. Forces every document write to also reconcile these unrelated slots. | Low. | **Yes.** Move into `EditorSessionState`. |
| **F3** | Two parallel "current focus" concepts: `navigationSelection` (kind discriminated union) and `activeCameraConnectionId` + `activeCameraDirection`. They are kept in sync by code comments like "Phase 2.1: leaving a connection focus cancels the persistent camera discovery" repeated **5 times** as inline resets in `selectX` methods. | High. Every selection mutation must remember to clear/preserve both. | Med. | **Yes.** Collapse to a single step reducer (§3.D). |
| **F4** | Three selection surfaces (`placement`, `cluster`, `navigation`) and 4 navigation sub-kinds (`node`, `connection`, `anchor`, `view-keyframe`). Each has its own `select*`, `selectXFromTree`, `finish*`, and "clears the others" method. Pattern is repeated across `selectNavigationNode`, `selectCameraHandle`, `selectConnection`, `selectAnchor`, `selectViewKeyframe`, `selectPlacement`, `selectPlacements`, `togglePlacement`, `selectCluster`, `selectClusterFromTree`, `deselect` — 11 methods, all doing ≈ the same dance. | High. Adding a new selection kind costs ~150 LOC. | Med. Mostly mechanical. | **Yes.** Extract a `useSelection` reducer-style API (see §3.D). |
| **F5** | **Camera preview FSM** (`kind × mode × transport × runId`) is hard-baked into the store with a private `#capturedCameraPreviewRoute` snapshot tied to `#nextCameraPreviewRunId` monotonicity. Its 4 cleanup paths (`#prepareCameraPreview`, `#refreshPausedDirectorPreview`, `#pruneInvalidCameraPreview`, `#releasePausedPreviewForTopology`) are all in the class and only reachable from the class methods. | High. The 3631-line test suite devotes ~1000 LOC to FSM transitions. | Med. | **Yes.** Pull into `EditorCameraPreviewController` (see §3.B). |
| **F6** | **Document history** is reinvented as `#past / #future / #transactionBefore / #cameraFramingTransaction`. The transaction-making/break tests already encode "documents match → silently no-op", "framing transaction skips undo block", "transaction + drag refuses cancel". That is a state machine, not a method bag. **However:** `canUndo` cannot be a pure data predicate — it reads `cameraPreview.transport` to block undo during playback. The history controller must take the preview controller as a collaborator, not the underlying `cameraPreview` field. | High. Recurrence of `if (this.isDocumentUndoBlocked || this.#transactionBefore || preview.transport !== 'paused')` in 8+ callers. | Med. | **Yes.** Extract `EditorHistoryController` (see §3.A.2). |
| **F7** | `EditorSelection.svelte` (1011) and `EditorCameraTree.svelte` (482) are sibling rendering god components. `EditorSelection.svelte` mixes 3D picking, room/placement tree, camera tree, cluster drag/drop, and audio/asset list. `EditorCameraTree.svelte` mixes camera connection / direction tree, keyframe row + drag connectors, the kill-switch route list, and the timeline scrub context menu. | High. Three.js pickers belong with their 3D counterparts. | High. | **Defer.** Split after §3 is shipped; one piece at a time. |
| **F8** | `EditorCameraRig.svelte` (531) and `EditorCameraTimelinePanel.svelte` (504) are close to the same problem at smaller scale. Both reach into 12+ store slots — most of them `cameraPreview`, `cameraTimelinePlayhead`, `isCameraPreviewPlaying`, etc. | Med-High. | Med. | **Yes** — extract hooks that wrap `store.cameraPreview` and `store.cameraTimelinePlayhead` so the components see only 3–4 props. Suggested names: `useDirectorPreview`, `useVisitorPreview`, `useCameraTimeline`. |
| **F9** | `editor-navigation-graph.ts` (599) is a pure validator mudball (21 failure codes, 8 validators, all returning sum types). Good already — but its callers (mostly the god file) duplicate the "capture `validation.ok === false` → `setStatusMessage(validation.message)` → `return false`" pattern repeatedly. **Verified count: 8 occurrences in the god file** at lines `3279`, `3330`, `3343`, `3359`, `3387`, `3490`, `3529`, and `4115`. | Med. | Low. | **Yes.** Wrap validators with `runOrFail(store, validator, args)` returning `result` and posting the message. |
| **F10** | Status message timer is private to the store and re-creates `setTimeout` on every call. If two messages queue, the prior timer is dropped silently. | Low-Med. | Low. | **Yes.** Promote to `EditorSessionState`. |
| **F11** | Lighting + fog + grid + panning are 5 fields that the visitor/Film rendering does not use but the editor reads. Single `applyLightingPreset` could be an action over a `Record<'bright' \| 'visitor', EditorLightingSettings>`. | Low. | Low. | **Yes** in the same PR as F2. |
| **F12** | `Object3D` registry (`#placementRoots`, `#cameraHelperRoots`, `#anchorHelperRoots`, `#viewKeyframeTargetHelperRoots`) is 4 private maps exposed via 12 `getX / registerX / unregisterX` methods, with a separate `registryVersion` `$state` bumping trick to re-trigger `$derived`s. | Med. | Med. | **Yes.** Move into `EditorSceneRoots` — single map keyed by a tagged key union. |
| **F13** | Two state-snapshot functions (`#replaceDocument`, `#replaceRuntime`) emit side effects to `Math.min/Math.max` reorderings, `cleanUp` arrays, and a `#refreshPausedDirectorPreview` whose failure path posts a status. This is hard to follow without breakpoints. | Med. | Med. | **Yes** — once §3.A and §3.B are done. |
| **F14** | `cancelDocumentTransaction` refuses silently when `#cancelDirectFramingDrag` returns `false` and posts a generic "Cancel the framing drag before aborting this transaction" message. The store conflates "user requested cancel" and "transaction was modelling a parameter mutation that's still being dragged". | Low-Med. | Low. | **Yes** — split into `cancelFramingDragOrDeferTransaction`. |
| **F15** | `cloneResolvedCameraRoute` is a private helper that's tens of lines because it deep-clones a `ResolvedCameraRoute` deep-shape just so it can be re-attached to a `#capturedCameraPreviewRoute`. This is the price of having the FSM live in the store. | Low. | Low. | **Yes** — disappears when §3.B is shipped. |
| **F16** | Editor keyboard handling (lines 67–135 of `MuseumEditorApp.svelte`) cascades six cancellation paths in load-bearing order: `cameraPreview.Escape → stopCameraPreview → cancelPendingNavigation → cancelAssetPlacement → finishAnchorEditing → finishViewKeyframeEditing → deselect`. The order matters since each handler may treat the same Escape differently. | Low. | Low. | **Defer.** Document the cascade; long term, replace with a `EditorShortcutMap`. |
| **F17** | The store imports 8 validate/transform helpers but barely 80 LOC of independent logic. Acceptable today; if extraction (per §3) shrinks the file to <800 LOC, consider an inlined barrel. | Low. | None. | **No.** Don't preemptively de-helper. |
| **F18** | Visitor-side `MuseumScene.svelte`, `MuseumAssets.svelte`, and `EditorPlacementRoot.svelte` consume `placement-registry.ts` (8 LOC) — independent from the store's `#placementRoots`. Two parallel registries is a future bug magnet. | Med. | High. | **Defer.** Document and merge in §3 only if a natural seam appears. |

---

## 3. Decomposition of `museum-editor.svelte.ts`

The proposed end state. The store is the **composition root**; everything else is a sub-store or a pure helper. Nothing in the existing call sites needs to change in step (1) — we keep `MuseumEditorStore` as a facade.

```
apps/museum/src/lib/editor/
  museum-editor.svelte.ts          ← composition root (target ≈ 600 LOC)
  store/
    document-store.svelte.ts       ← §3.A1
    history-controller.svelte.ts   ← §3.A2
    selection-store.svelte.ts      ← §3.D
    camera-preview-controller.svelte.ts ← §3.B
    session-state.svelte.ts        ← §3.C
    scene-roots.svelte.ts          ← §3.E
  helpers/                         ← pure, testable files (already exist mostly)
    clone-resolved-camera-route.ts
    scene-keys.ts                  ← consolidates cameraHelperKey etc.
    vec3.ts
    validators-runner.ts           ← §3.F
  museum-editor.types.ts           ← shared type aliases (pulled out)
```

### 3.A Document + History

The biggest, deepest pain point. Two halves:

#### 3.A1 Document store (`document-store.svelte.ts`)
Owns `document`, `validation = $derived`, `baselineCanonicalJson`, and a single `replace(next)` operation.

```ts
export class EditorDocumentStore {
  document = $state(cloneMuseumSceneDocument(museumSceneDocument));
  validation = $derived(validateSceneDocument(this.document));
  baselineCanonicalJson = $state(serializeSceneDocument(museumSceneDocument));
  scene = $derived(resolveSceneDocument(this.document));   // remove $state.raw
  state = createMuseumState(createNavigationGraph(this.scene), 'paris-seat'); // $state but rebuilt by #replaceDocument
  ...
}
```

Lifts `resolveSceneDocument`, `createNavigationGraph`, room-aware transforms. Single `replace(next: MuseumSceneDocument)` that re-runs validation + resolves runtime + state.

#### 3.A2 History controller (`history-controller.svelte.ts`)

```ts
export class EditorHistoryController {
  #before: MuseumSceneDocument | null = null;
  #past: MuseumSceneDocument[] = [];
  #future: MuseumSceneDocument[] = [];
  #framingTransaction = false;
  version = $state(0);

  constructor(private readonly preview: EditorCameraPreviewController) {}

  beginDocument(document: MuseumSceneDocument): boolean;
  beginFraming(document: MuseumSceneDocument): boolean;
  commit(document: MuseumSceneDocument): { changed: boolean; type: 'doc' | 'framing' | null };
  cancel(restore: () => MuseumSceneDocument): boolean;
  undo(current: MuseumSceneDocument): MuseumSceneDocument | null;
  redo(current: MuseumSceneDocument): MuseumSceneDocument | null;
  canUndo: boolean; canRedo: boolean;
}
```

**Critical:** the controller takes `EditorCameraPreviewController` as a constructor collaborator because `canUndo` reads `preview.transport` (see F6). It is **not** a pure data controller. The pure-data illusion breaks here; the test suite encodes this dependency with `expect(store.canUndo).toBe(false)` while a preview is in flight. The History + Preview split is therefore a **peer** split, not a "History depends on Preview" hierarchy.

Pure data churn: the controller. Side-effect churn: `documentsMatch` deduper, the framing-tx-vs-doc-tx split, `reconcileSelection` (the hook stays in the composition root — selection is not history's concern).

### 3.B Camera preview controller (`camera-preview-controller.svelte.ts`)

```ts
export class EditorCameraPreviewController {
  preview = $state<EditorCameraPreview>(null);
  followEnabled = $state(true);
  recenterVersion = $state(0);
  #capturedRoute: { runId: number; route: ResolvedCameraRoute } | null = null;
  #nextRunId = 1;
  #restore: (() => boolean) | null = null;

  start(node): boolean;
  start(connection, direction): boolean;
  pause(): void;
  resume(): void;
  stop(): void;
  setPlayhead(progress: number): boolean;
  refresh(graph: NavigationGraph): void;
  pruneIfStale(document): void;
  releaseIfTouches(nodeIds, connectionIds): boolean;

  // public read-only predicates consumed by History (3.A.2)
  get transportState(): 'paused' | 'playing' | 'complete' | null;
}
```

Consumes `EditorDocumentStore.document` to validate against current topology. **Exposes `transportState` as a stable read-only** so `EditorHistoryController.canUndo` doesn't reach through the whole preview object.

The captured-route deep-clone (`cloneResolvedCameraRoute`, lines 213–272 of the god file) becomes a small private here, ~70 LOC.

### 3.C Session state (`session-state.svelte.ts`)

Owns state that has **zero** reason to live in the document or history:

- `currentWorkspace`, `leftPanel`, `timelineExpanded`, `sceneTimelineExpanded`, `timelineHeight`
- `transformMode`, `transformGizmoVisible`, `transformSpace`
- `cameraPanEnabled`, `cameraFocusKind`, `cameraFocusPlacementId`, `cameraFocusNodeId`, `cameraFocusVersion`
- `pendingFramePlacementIds`, `pendingFrameVersion`
- `pendingNavigationCommand`, `pendingPlacementAssetId`
- `treeExpandedRoomIds`, `treeExpandedClusterIds`, `treeExpandedCameraConnectionIds`, `treeExpandedCameraDirectionKeys`
- `transformInteractionActive`, `transformInteractionKind`, `directPathInteractionActive`, `directFramingInteractionActive`, `viewKeyframeProgressDrag` (selected identity) + `#cancel…` callbacks
- `statusMessage` + the timer
- `clusteredPlacementIds` getter (currently duplicated locally in `EditorSceneTree.svelte:17`)

Methods are tiny: `setStatusMessage`, `cancelAssetPlacement`, `cancelPendingNavigation`, `cancelPendingFrame`, `cancelViewKeyframeProgressDrag`, focus channel `consumeCameraFocus`, the tree-expansion helpers already in the store class.

This is the home for **F2**, **F10**, **F11**.

### 3.D Selection reducer (`selection-store.svelte.ts`)

**Important correction:** selection is **not** a single god-union, and the audit's earlier draft of a one-discriminator union was wrong. Inspect the existing code: `selectedPlacementIds` and `navigationSelection` are separate state slots because the editor deliberately allows *no parallel selection*, but `pendingPlacementAssetId`, the pending preview, and the focus channel can coexist with a placement selection. The right shape is **two parallel selections**:

```ts
type WorkspaceSelection =
  | { kind: 'none' }
  | { kind: 'placement'; ids: string[]; clusterId: string | null; roomId: MuseumRoomId }
  | { kind: 'cluster'; clusterId: string; roomId: MuseumRoomId };

type NavigationSelection =
  | { kind: 'none' }
  | { kind: 'node'; nodeId: string; handle: 'position' | 'target' }
  | { kind: 'connection'; connectionId: string; direction: CameraConnectionDirection }
  | { kind: 'anchor'; connectionId: string; anchorId: string }
  | { kind: 'view-keyframe'; connectionId: string; direction: CameraConnectionDirection; keyframeId: string };

class EditorSelectionStore {
  workspace = $state<WorkspaceSelection>({ kind: 'none' });
  navigation = $state<NavigationSelection>({ kind: 'none' });
  // Discovery (which connection the camera-workspace is currently scrubbing):
  discoveryConnectionId = $state<string | null>(null);
  discoveryDirection = $state<CameraConnectionDirection>('forward');
  // Cross-cutting invariants: leaving navigation clears discovery; entering navigation clears the workspace selection.
  setWorkspace(s): void;
  setNavigation(s): void;
  // helpers: selectRoom, selectPlacement, cyclePlacement, etc., each a one-liner
}
```

The cross-clearing invariant (the comment "Phase 2.1: leaving a connection focus cancels the persistent camera discovery" that repeats 5 times in `selectX` methods) collapses to a single line in the reducer: `setNavigation(s = { kind: 'none' }) → discoveryConnectionId = null`.

The 11 existing `selectX` methods then become one-liners that dispatch the right `setX` call. The `selectXFromTree` methods stay (they differ in focus + tree expansion).

### 3.E Scene roots (`scene-roots.svelte.ts`)

Replaces 4 private `Map<string, Object3D>` and 12 get/register/unregister methods with:

```ts
type SceneRootKey =
  | { type: 'placement'; id: string }
  | { type: 'camera-helper'; nodeId: string; handle: EditorCameraHandle }
  | { type: 'anchor-helper'; connectionId: string; anchorId: string }
  | { type: 'view-keyframe-target'; connectionId: string; direction: CameraConnectionDirection; keyframeId: string };

class EditorSceneRoots {
  version = $state(0);
  #roots = new Map<string, Object3D>();
  register(key, root): void;
  unregister(key, root): void;
  get(key): Object3D | undefined;
  ids(type): SceneRootKey[];
}
```

Registry version bumps on each write — keeps the workaround.

### 3.F Validators runner (`validators-runner.ts`)

A thin helper that wraps each validator and forwards failure messages to `EditorSessionState.setStatusMessage`.

```ts
export function runOrFail<T extends { ok: false; message: string }>(
  session: EditorSessionState,
  validator: () => true | T
): boolean {
  const result = validator();
  if (result === true) return true;
  session.setStatusMessage(result.message);
  return false;
}
```

Replaces the 8 documented sites of `setStatusMessage(validation.message)` in the god file (see F9).

### 3.G The composition root

`MuseumEditorStore` becomes a thin facade whose constructor wires the six sub-stores. ~600 LOC. Public surface stays 1-for-1 — every existing caller keeps working *for read access*, but **write access and `bind:` bindings require a one-time migration** of call sites — see caveat below.

```ts
export class MuseumEditorStore {
  document = new EditorDocumentStore();
  history = new EditorHistoryController(this.preview);
  selection = new EditorSelectionStore();
  preview = new EditorCameraPreviewController();
  session = new EditorSessionState();
  roots = new EditorSceneRoots();
  // facade methods forward to sub-stores with the same signatures
}
```

#### Caveat: Svelte 5 reactivity + facade getters

**A naive facade that exposes sub-store fields via computed getters will break `bind:` bindings.** Svelte 5's `bind:value={store.selectedPlacementIds}` requires an assignable target. A `get selectedPlacementIds() { return this.selection.workspace.ids; }` getter is read-only and will silently fail to bind; `$derived` proxies work for *reads* but not *writes*. The migration is therefore **two-phase for each field**:

1. Phase A (Steps 1–4, 6): introduce the sub-store, but the composition root keeps the field as a real `$state` that both facade getters AND mutations write to, until no caller uses `bind:` against the field.
2. Phase B (Step 5, 8): audit callers for `bind:` and convert to event handlers (`oninput={…}`); only then is the field migrated to the sub-store.

During Phase A the "facade-stable" claim means "read paths behave identically and the lock-step with the existing tests passes". It does **not** mean the call sites stay frozen. Each Step in `§5` calls this out.

---

## 4. Svelte components — split recommendations

Ordered by payoff-to-risk. Don't ship all at once.

### 4.A `EditorSelection.svelte` (1011 LOC) → 4 files

Look at the inline `editable / dragend / dropstart` callbacks — 200 LOC of mixed UI events. Recommended target shape:

- `RoomTreePanel.svelte` — rooms + placements, drag/drop, toggle
- `ClusterTreePanel.svelte` — cluster member rows + rename
- `CameraWorkspaceTree.svelte` — connections + directional keyframe lists
- `AssetLibraryPanel.svelte` — search + filters + place button
- `EditorSelection.svelte` — now <250 LOC: composes the four panels

`EditorSelection.svelte` carries the workspace + asset-tab switch and room framing. It delegates.

### 4.B `EditorCameraTree.svelte` (482 LOC) → 3 files

Same shape as 4.A but for the camera-workspace tree:

- `ConnectionListPanel.svelte` — connection rows + direction toggles
- `DirectionalKeyframeList.svelte` — forward / reverse keyframe rows with drag connectors
- `TreeShortcuts.svelte` — keyboard handlers, kill-switch route list
- `EditorCameraTree.svelte` — composes the three, ~100 LOC

### 4.C `EditorCameraRig.svelte` (531) → 2 components + a hook

Already does "Visitor / Director / Paused-preview" with three branches. Introduce:

```ts
useDirectorPreview(store): { sample, recenter, follow }
useVisitorPreview(store): { sample, recenter }
```

These wrap the camera-preview state from §3.B. The component layout is small — the work is wiring.

### 4.D `EditorCameraTimelinePanel.svelte` (504) → 2 components

- `EditorCameraTimelineRuler.svelte` — playhead drag, scrub, step buttons
- `EditorCameraTimelineDots.svelte` — node + directional key dots overlay
- Plus a `useCameraTimeline(store)` hook.

### 4.E `EditorTransformControls.svelte` (456) → keep one + extract selection helper

Already cohesive. Extract `EditorSelectionHelper.svelte` is already 40 LOC; consider grouping `EditorTransformModeTabs.svelte` (rotate/translate + snap toggles) so the gizmo component owns only Three.js wiring.

### 4.F `EditorInspector.svelte` (325) and the three sub-inspectors

Already mode-switches via store. After §3.D lands, the inspector can map `store.selection.focus.kind` / `.workspace.kind` to a small `<ModeAwareInspector>` switch. ~150 LOC saved by collapsing the duplicated "if selection kind === X" headers.

### 4.G `EditorAppBar.svelte` (314)

Already reasonable. The **Project menu** (paste-JSON textarea, copy/download buttons, dirty/saved pill) is its own 110-LOC dialog. Extract `EditorProjectMenu.svelte` and pass `store` as a prop.

### 4.H `MuseumEditorApp.svelte` (268)

Keep most of it. Replace the inline key handler (`onKeyDown`) with a `registerEditorShortcuts(store)` utility that returns an unregister callback — easier to test and re-mount.

---

## 5. Sequencing and migration plan

**Ten steps** (a couple of which are split into sub-steps — see below). Each step explicitly names which sub-stores and whether `bind:` migration is required.

| Step | What lands | LOC delta in `museum-editor.svelte.ts` | `bind:` migration? | Component changes | Risk |
|---|---|---|---|---|---|
| **1** | Promote `EditorSessionState` (§3.C). Move the 14–16 slot fields + their helpers into a sub-store. Composition root keeps the field as a real `$state` mirrored from the sub-store, gated on whether callers use `bind:` (`selectedRoomId`, `leftPanel`, `currentWorkspace`, `timelineHeight` need the bind-migration sub-step). | -350 LOC | partial | minor UI coord | Low |
| **2** | Promote `EditorDocumentStore` (§3.A1). Move document + validation + scene resolution. | -150 LOC | none | none | Low |
| **3** | Promote `EditorHistoryController` (§3.A2) with `EditorCameraPreviewController` peer-link. Move `#past`, `#future`, transactions. Move `documentsMatch`. | -300 LOC | none | `EditorAppBar` calls `store.undo/redo` only — unchanged | Med |
| **4** | Promote `EditorCameraPreviewController` (§3.B). Move the FSM. Drop `cloneResolvedCameraRoute` from the file (becomes private to the sub-store). | -700 LOC | none, all callers use facade methods | none | Med |
| **4b** | Add `validators-runner.ts` and rewrite the 8 call sites at lines 3279, 3330, 3343, 3359, 3387, 3490, 3529, 4115. | -50 LOC | none | none | Low |
| **5a** | Introduce `EditorSelectionStore` (§3.D) **without** changing the public method names — `selectX` methods start routing through `selection.workspace` / `selection.navigation` private slots. Tests unchanged; façade 1:1. | -200 LOC | none | none | Med |
| **5b** | Migrate **all** `bind:` call sites that read `selectedPlacementIds`, `navigationSelection`, `selectedClusterId`, `selectedRoomId` to use event handlers + explicit `setWorkspace` / `setNavigation` calls. | none | yes — ~12 components touched | inline edits across `EditorInspector`, `EditorSelection`, `EditorAppBar`, `EditorSceneTree`, `EditorCameraTree`, `EditorAssetLibrary`, `EditorTransformControls` | High |
| **5c** | Delete the 11 `selectX` methods on the store, leaving only the 3 `selectXFromTree` callers and the per-component calls to `setWorkspace` / `setNavigation`. Tree-expansion arrays migrate to `EditorSessionState` (since they were driven by these calls). | -200 LOC | yes (already done in 5b) | tests in `museum-editor.test.ts` rewritten (~140 KB) | High |
| **5d** | Promote `EditorSceneRoots` (§3.E). | -100 LOC | none | none | Low |
| **6** | Split `EditorSelection.svelte` (§4.A) into the 4-panel composition. **Cost: substantial.** Around 1000 LOC of `<script>` state and 60+ event bindings need threading to four components. Snapshot tests are re-recorded. | none | per sub-panel | 4 new components, snapshot rewrite | **High** |
| **7** | Split `EditorCameraTree.svelte` (§4.B) into the 3-panel composition. Cost: ~700 LOC of script state distributed. | none | per sub-panel | 3 new components, snapshot rewrite | High |
| **8** | Extract `EditorCameraRig` & `EditorCameraTimelinePanel` hooks (§4.C/4.D). Hooks `useDirectorPreview`, `useVisitorPreview`, `useCameraTimeline`. | none | none | 4 new files / 2 hooks | Med |
| **9** | Project menu + shortcut handler decomposition (§4.G/4.H). | none | minor | cosmetic | Low |

End-state: `museum-editor.svelte.ts` ≈ 600 LOC, six small sub-stores/tests, ~13 components, all existing tests green after the per-step migration.

**Sequencing constraints:**

- **5a → 5b → 5c** is a strict pipeline. 5b cannot be skipped because Svelte 5 `bind:` will silently fail against a getter-backed field.
- **5c → 6 → 7**: §4.A and §4.B both reach into `navigationSelection` / `selectedPlacementIds` from inside their `<script>`. They MUST run after 5c's public-method rename so they consume the new selection-store fields directly. Splitting them before 5c means double-handling the same rewrite.
- **3 ↔ 4**: the History ↔ Preview peer-link means a partial 3 without a working 4 will leave `canUndo` permanently wrong. Ship both, or neither.

**Estimated dev cost, conservative:**

- Steps 1, 2, 3, 4, 4b, 5a, 5d, 9 combined: ~5–7 dev days.
- Step 5b alone: ~3–8 dev days depending on how many `bind:` sites are updateable in one shot.
- Step 5c alone: ~3 dev days + test update churn.
- Steps 6, 7, 8 alone: ~5–7 dev days.
- Review buffer: ~3 dev days.

**Realistic pacing:** 2.5 to 3.5 dev weeks plus review. The previously-quoted 1.5–2.5 weeks was overly optimistic against Step 5b and the panel splits.

---

## 6. Test strategy

- The 3631-line `museum-editor.test.ts` is the **safety net**, but it's a coverage shape worth understanding:
  - **~1000 LOC** of preview-FSM transitions across `mode × transport × preview.kind` × drag cancelers.
  - **~700 LOC** of guided-tour manipulation including drag-drop, deletion plans, missing-edge inserts.
  - **~500 LOC** of camera timeline scrub / node-boundary selection.
  - **~400 LOC** of selection / tree-from-tree picking.
  - **~300 LOC** of camera-framing keyframe mutation.
  - **~200 LOC** of cluster / asset-placement / lighting toggles.
  - The remaining ~500 LOC are setup, fixtures, and `<describe>` scaffolds.
- The proposed order keeps the suite's contract per step:
  - **Steps 1, 2, 3, 4, 4b, 5a, 5d**: every existing test passes with **zero expectation changes**. The store's read signatures are facade-stable.
  - **Step 5b**: each component touched needs a quick test added (`onChange` handler is now manually wired). Expect ~10–15 component-side tests.
  - **Step 5c**: ~140 KB of tests in `museum-editor.test.ts` are rewritten to consume `selection.workspace` / `selection.navigation` directly. New micro-tests in `selection-store.test.ts` cover shape invariants.
  - **Steps 6, 7, 8**: snapshot tests are re-recorded per component; assert the four / three sub-panels render.
  - **Step 9**: no test changes — purely structural.
- Add micro-tests alongside each sub-store:
  - `document-store.test.ts` — replace + reconcile + validation propagation
  - `history-controller.test.ts` — undo/redo, framing transaction rules, `documentsMatch` no-op cancellation (lift the most signature tests from the god file's suite)
  - `camera-preview-controller.test.ts` — FSM transitions, captured route invalidation, follower/orphan paths
  - `selection-store.test.ts` — cross-clearing invariants (Phase 2.1 comment-driven resets become one assertion)
  - `session-state.test.ts` — status timer, tree expansion helpers, drag canceller plumbing
- **Gap: no browser-rendered integration test exists today.** `npm test` will pass after Step 5c even if the developer split selection wrong. Recommend adding one Vitest-browser smoke that opens `/dev/museum-editor`, clicks a node, edits an FOV, and saves, before Step 5b lands.
- Leave the existing **integration** tests in `museum-editor.test.ts`: they prove the wiring of sub-stores works end-to-end.

---

## 7. Anti-patterns to address while we are in there

These appear repeatedly in the current code; the refactor is a chance to clear them.

1. **Phase-banner comments that re-state invariants.** The phrase *"Phase 2.1: leaving a connection focus cancels the persistent camera discovery"* appears five times in the selection methods. That is a sign of a mis-modelled invariant. After §3.D's parallel-selection reducer, it should be a single line in the reduction step.
2. **`void this.historyVersion;` and `void this.registryVersion;`** inside getters are 2-line sight-gags for "we read a $state so the getter re-runs". They are the equivalent of `console.log('hi');`. Promote them to `$derived(…)` so the dependency is declared, not faked.
3. **`isDocumentMutationBlocked` / `isDocumentFramingMutationBlocked` / `isDocumentUndoBlocked` / `isCameraFramingMutationBlocked`** are four overlapping guards. After §3.B + §3.A2, collapse to one `canMutate(scope)` predicate and `scopes`: `{ document, framing, undo }`. Caller-side specificity goes away.
4. **Per-method "transient reset" dance.** "Active preview FSM" cleanup sites repeat `this.cancelAssetPlacement(); this.cancelPendingFrame(); this.#clearPlacementSelection(); ...` in the same five-line order at the top of selection methods. The verifier found **42 occurrences** across the god file for those three reset calls. **One single function**, called `clearTransientSelection()`, owns this dance — and §3.D removes the duplication by treating "transient selection" as a non-`focus` state.
   - The **`selectedPlacementIds = [id]` reset pattern** appears at seven lines: `3699, 3716, 3737, 3752, 3798, 4250, 4253`. Each of these is one valid instance of the dance, but each is also a place where the selection reducer could be the only mutator.
5. **Two registries (visitor `placement-registry.ts` and editor `#placementRoots`).** Long term, merge — but **not** in this refactor. Just document with a comment at both sites.
6. **`#replaceRuntime` mutates `MuseumState` via `createMuseumState`.** Mutation is fine; the smell is that the code's two callers sit in different parts of the file. After §3.A2 lands, it'll have one home.
7. **Inline JSON in tests.** The big store test inlines whole fixtures; once we have sub-store tests, factor out the `createReadyDocument()` helper to keep them DRY.

---

## 8. Do NOT recommend

Surfaced during the audit; explicitly **not** recommended:

- **Convert the store to a Redux/Zustand-style reducer.** Svelte 5 runes are *already* a good model for this. The store is gnarly because it bundles eleven concerns, not because runes are wrong.
- **Split into N micro-Svelte-stores** where each component imports its own. 18 files import `MuseumEditorStore` today; fragmenting will create a fan-out problem without solving the seam. Sub-stores (§3) is the right granularity.
- **Promote the store to a `Web Worker` or Vite plugin.** Irrelevant to current pain and out of scope.
- **Replace `$state.raw` on `scene` with `$state`.** Today `scene` is `resolveSceneDocument(this.document)` materialised once. Promoting it to `$state` causes a resolve storm on every dependent read. Keep it `$state.raw` and recompute only on `replaceDocument`.
- **Move visitor-side `museum-state.svelte.ts` into editor.** That is its own FSM and serves `/museum`. Leave it (the AGENTS.md contract says so).
- **Auto-lint hunted snapshot tests for component splits.** They will have to be updated by hand with new selectors.
- **Truncate selection to a single discriminator.** A previous draft of this audit did that and was wrong — selection is a tuple of two parallel state slots, not a god-union. See §3.D.

---

## 9. Open questions / risks

- **Sub-store reactivity:** sub-stores that hold `$state` across the facade are technically the same class instance. We need to confirm that destructuring `$state` getters across sub-store boundaries doesn't accidentally disable reactivity in tests — likely fine but worth a smoke test in §3.G.
- **Phase-3.7 work in flight** (timing + holdSeconds) has overlapping edit surfaces: `setConnectionTiming`, `setNodeHoldSeconds`, `setViewKeyframeTiming` are all god-file-level. Schedule §3.A1 → §3.C **before** adding the 3.8 phase, otherwise we re-stack.
- **Editor keyboard handler ordering** is fragile (§7 #4). Promoting to a `registerEditorShortcuts` util helps, but we should pin an integration test that asserts Esc's full cascade before refactoring that file.
- **Visitor touchpoints** (`museum-state`, scene rendering) are not on the table, but renaming any public field of `MuseumEditorStore` will affect 18 imports. The "thin facade" step lets us migrate call sites one method at a time.
- **`clusteredPlacementIds` duplication** between the store getter (line 2874) and `EditorSceneTree.svelte:17` is currently harmless because both build a `Set` lazily. Move the canonical one to `EditorSessionState` and have `EditorSceneTree` consume it.

---

## 10. Closing

This is structural surgery, not a rewrite. The end-state system still has ≈ 4 KLOC of editor code; the goal is **seams**, not line-count. If we collapse the 11 concerns into 6 sub-stores, fix the bind-migration trap, and stop adding 200 LOC to the god file every phase, future agents can hold the whole editor in working memory without grep. The two real risks are Step 5 (selection reducer, **public-shape change**) and Steps 6–7 (component panel splits, **massive test churn**); both are honestly rated, both deserve their own review.
