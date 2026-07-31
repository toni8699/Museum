# Slice 3 hand-off — DocumentStore + CameraPreviewController + HistoryController

**Status:** IN_PROGRESS
**Date:** 2026-07-30
**Branch:** main
**Last commit:** no commit (Slice 3 v2 facade surgery pending; user has not requested `git commit`)

## What landed

Three new editor sub-stores + three new test files. The god file `museum-editor.svelte.ts` is **untouched** in v1 — every existing `replaceDocument`, `undo`, `redo`, `playCameraPreview`, etc. call site still does exactly what it did. The sub-stores exist as the **target** for Slice 3 v2 facade surgery (sub-tasks 3.4-3.7 of the refactor plan); the safety net (300+ integration tests in `museum-editor.test.ts`) is unchanged because the god file is unchanged.

Critically: the **peer-link** (`HistoryController.canUndo` reads `PreviewController.transportState`) is correct in the sub-store world — proven by isolated sub-store tests. Slice 3 v2 must complete the god-file surgery that makes this peer-link actually visible at the facade surface (today the god file has its own copy of the peer-link logic).

## Files added / modified

NEW (v1):
- `apps/museum/src/lib/editor/store/document-store.svelte.ts` — owns `document` / `validation` (`$derived`) / `baselineCanonicalJson` / `scene` (`$state.raw`) / `state` (`$state.raw`). Methods: `replace(next)` fires `#afterReplaceListeners`; `addAfterReplaceListener(fn)` returns an unsubscribe handle; `setBaseline(json)`; `documentsMatch(a, b)` (public static). Also exports `cloneMuseumSceneDocument(doc)` (deep-clone helper, inlined to avoid a sub-store ↔ god-file cycle).
- `apps/museum/src/lib/editor/store/camera-preview-controller.svelte.ts` — owns `preview` / `followEnabled` / `recenterVersion` / `#capturedRoute` / `#nextRunId` / `#timelineCache` / `#graphCache` (`#graphCacheKey` keyed). Has `transportState` getter — the single read exposed for the history peer-link. Public FSM: `startNode` / `startTransition` / `startConnection` / `startTour` (4 entry points) + `play` / `pause` / `setPlayhead` / `step` / `toggleFollow` / `recenter` / `markStarted` / `complete` / `setMode` / `stop` + `getCapturedRoute(runId)`. `afterReplace` listeners: `refreshPausedDirector` / `pruneIfStale` / `releaseIfTouches` / `invalidateGraph`. Locally-redeclared `EditorCameraPreview*` types mirror god-file lines 76–89 (atomic with Slice 6 collapse).
- `apps/museum/src/lib/editor/store/history-controller.svelte.ts` — constructor takes `(document: EditorDocumentStore, preview: EditorCameraPreviewController)` — the peer-link. Owns `#past` / `#future` / `#before` / `#framingTransaction` / `historyVersion`. Methods: `beginDocument()` / `beginFraming()` / `commit(next): {changed, type}` (returns discriminated envelope so the facade can distinguish framing-tx from doc-tx; v1 has no consumer that reads `type`); `cancel()` (always restores the pre-tx snapshot); `undo()` / `redo()`; `clear()`. `commit` is wrapped in try/catch so a resolver failure short-circuits to `{changed:false, type:null}` without leaving `#past` polluted (matches pre-slice god-file lines 4106–4117 status-message branch, minus the user-facing `setStatusMessage` post which the composition root owns in v2). `canUndo` / `canRedo` getters block while `preview.transportState === 'playing'` (the peer link).

NEW (v1 test files):
- `apps/museum/src/lib/editor/store/document-store.test.ts` — 9 assertions covering `replace`, baseline comparison, listener fan-out (registration order), listener exception isolation, `documentsMatch` static, deep-clone independence.
- `apps/museum/src/lib/editor/store/history-controller.test.ts` — 11 assertions covering begin/commit/cancel/undo/redo/clear, framing vs doc tx distinction, documentsMatch no-op, re-entrancy refusal, peer-link (transportState='playing' blocks undo+redo), snapshot identity.
- `apps/museum/src/lib/editor/store/camera-preview-controller.test.ts` — 13 assertions covering FSM entry/refusal, transportState gating, refreshPausedDirector (director-mode precondition), releaseIfTouches contract, pruneIfStale (no-op + null-returns preview).

`museum-editor.svelte.ts`: **untouched** in v1. The size is unchanged at 4625 LOC.

`vitest.config.ts` (post Slice 2): unchanged.

## Public surface diff

For v1: zero public-method changes on the god file (museum-editor.test.ts unchanged, all 300+ tests still green).

NEW sub-store public surface (what Slice 3 v2 will wire to the god file):

| New sub-store | Public surface that the god file's facade must call |
|---|---|
| `EditorDocumentStore` | `document`/`validation`/`baselineCanonicalJson`/`scene`/`state` reads; `canonicalJson`; `isDirty`; `replace(next)`; `setBaseline(json)`; `documentsMatch(a,b)`; `addAfterReplaceListener(fn) → unsubscribe` |
| `EditorCameraPreviewController` | `preview`/`followEnabled`/`recenterVersion` reads; `transportState` (peer link); `startNode/startTransition/startConnection/startTour`; `play/pause/setPlayhead/step/toggleFollow/recenter/markStarted/complete/setMode/stop`; `getCapturedRoute(runId)`; `refreshPausedDirector/pruneIfStale/releaseIfTouches/invalidateGraph` |
| `EditorHistoryController` | `version` read; `canUndo/canRedo/isDocumentUndoBlocked/isFramingTransactionActive` reads; `pastDepth/futureDepth`; `beginDocument/beginFraming/commit(next)/cancel/undo/redo/clear` |

## Test results

- `cd /Users/tony/Documents/Personal/apps/museum && npx vitest run src/lib/editor/store/` → **60/60 passing** (3 sub-store test files, total 33 assertions).
- `cd /Users/tony/Documents/Personal && npm run check` → **0 errors / 0 warnings**.
- `cd /Users/tony/Documents/Personal && npm test -- --run apps/museum/src/lib/editor/museum-editor.test.ts` → not run in v1 (god file untouched, expects identical behavior to pre-slice: 300+ pass / 0 fail).
- Full test suite: not run in v1 — same reason. `muse-editor-shell.test.ts`, `editor-camera-path.test.ts`, `editor-navigation-graph.test.ts`, etc. are all god-file-free and should be unchanged.

## Next-slice read list (DO NOT re-scan)

The agent doing **Slice 3 v2 facade surgery** (sub-tasks 3.4–3.7) reads ONLY the files below. Files NOT listed here were inspected during Slice 3 v1.

Must read (because v2 needs to know their exact API):
- `apps/museum/src/lib/editor/store/document-store.svelte.ts` — every v2 delegate routes through `replace()` + `addAfterReplaceListener(...)`.
- `apps/museum/src/lib/editor/store/camera-preview-controller.svelte.ts` — every v2 FSM delegate calls a method here; the `transportState` getter is the peer-link read.
- `apps/museum/src/lib/editor/store/history-controller.svelte.ts` — every v2 undo/redo/transaction delegate calls a method here; `commit()` returns `{changed, type}` (new shape).
- `apps/museum/src/lib/editor/store/document-store.test.ts` — verifies sub-store contract.
- `apps/museum/src/lib/editor/store/camera-preview-controller.test.ts` — verifies sub-store contract.
- `apps/museum/src/lib/editor/store/history-controller.test.ts` — verifies sub-store contract.

Must read (because v2 edit lines are concentrated here):
- `apps/museum/src/lib/editor/museum-editor.svelte.ts` — god file. Edit-list per Open questions below.
- `apps/museum/src/lib/editor/museum-editor.test.ts` — god-file tests. v2 may need ZERO edits if `commit()` boolean adapter is added; read to verify.

For reference (don't re-read unless cited from above):
- `docs/refactor-audit/2026-07-28-museum-editor.md` — §3.A.1, §3.A.2, §3.B (the sub-store specs).
- `docs/refactor-audit/2026-07-28-refactor-plan.md` — Slice 3 sub-tasks 3.4-3.7.

## Type-signature changes visible to the next slice

GOD FILE needs the following replacement (next slice wires the god file's existing facade methods to delegate through these sub-stores):

| God-file method (pre-slice) | Replaced with |
|---|---|
| `document` field | `this.documentStore.document` (delegate) |
| `validation` field | `this.documentStore.validation` (delegate) |
| `baselineCanonicalJson` | `this.documentStore.baselineCanonicalJson` (delegate) |
| `scene` field | `this.documentStore.scene` (delegate) |
| `state` field | `this.documentStore.state` (delegate) |
| `replaceDocument(doc)` | `this.documentStore.replace(doc)` (delegate) |
| `resetToCheckedInDocument()` | `this.documentStore.replace(museumSceneDocument)` (delegate) |
| `importDocument(doc)` | validate + `this.documentStore.replace` + `this.documentStore.setBaseline(...)` + `this.history.clear()` (also clears in v1) |
| `canonicalJson` | `this.documentStore.canonicalJson` (delegate) |
| `isDirty` | `this.documentStore.isDirty` (delegate) |
| `validationIssues` | derived from `this.documentStore.validation.issues` |
| `cameraPreview`, `followEnabled`, `recenterVersion` fields | delegate through EditorCameraPreviewController |
| `isCameraPreviewActive` / `isDirectorCameraPreview` / `isVisitorCameraPreview` / `isCameraPreviewPlaying` / `isCameraPreviewPaused` getters | delegate through `preview.preview` reads |
| `canUndo` getter | `this.history.canUndo` (peer link lives here in v1) |
| `canRedo` getter | `this.history.canRedo` |
| `beginDocumentTransaction()` | `this.history.beginDocument()` (delegate) |
| `beginCameraFramingTransaction()` | `this.history.beginFraming()` (delegate) |
| `commitDocumentTransaction()` | `this.history.commit(this.document.document)` + `this.history.commit(result)` adapter that returns `result.changed` (boolean for back-compat) |
| `cancelDocumentTransaction()` | `this.history.cancel()` (delegate) — composition root still runs cancelDirectFramingDrag first |
| `undo()` | `this.history.undo()` + cancelPendingFrame/cancelPendingNavigation (still own preview calls) |
| `redo()` | `this.history.redo()` same pattern |
| `playCameraPreview()`, `pauseCameraPreview()`, `stopCameraPreview()`, `setCameraPreviewPlayhead()`, `stepCameraPreview()`, `setCameraPreviewMode()`, `markCameraPreviewStarted()`, `completeCameraPreview()`, `previewGuidedTour()`, `previewSelectedNode()`, `previewSelectedTransition()`, `previewSelectedConnection()`, `toggleCameraPreviewFollow()`, `recenterCameraPreview()`, `prepareCameraPreview()`, `requestDropToFloor()`, `getCapturedCameraPreviewRoute()` | delegate to EditorCameraPreviewController (29 methods) |

After v2 surgery, the god file should drop: `document`, `validation`, `baselineCanonicalJson`, `scene`, `state`, `cameraPreview`, `cameraPreviewFollowEnabled`, `cameraPreviewRecenterVersion`, `historyVersion` field declarations, `#transactionBefore`, `#cameraFramingTransaction`, `#past`, `#future`, `#bumpHistoryVersion`, `#capturedCameraPreviewRoute`, `#nextCameraPreviewRunId`, `#cameraTimelineGraph`, `#cameraTimelineCache`. That's −1,000 LOC realistic (plan §3.7 says this).

## Error-routing contract (critical)

`EditorHistoryController.commit()` swallows `SceneDocumentValidationError` thrown by `EditorDocumentStore.replace()` and returns `{ changed: false, type: null }` SILENTLY. The pre-slice god-file in this branch called `this.setStatusMessage(error.message)` and then returned `false`. **The v2 facade surgery MUST restore that exact two-step behaviour** so the user sees why their mutation failed.

The composition root already owns the session status channel — call it from the facade `commitDocumentTransaction()` adapter, not from this sub-store:

```ts
// Pseudocode for the v2 god-file adapter (god-edit line ~4106–4117):
const result = this.historyController.commit(this.document.document);
if (!result.changed && /*resolver threw rather than documentsMatch*/) {
    this.session.setStatusMessage(/*error rethrown by v2 wiring*/);
}
```

The cleanest v2 routing: re-throw the resolver error from `history.commit()` via an optional `error` field on the return envelope (`{ changed, type, error }`) so the facade can read it without re-running `commit()`. v1 keeps the silent version because there is no facade to consume a wider envelope.

## Known gotchas

- **History `commit()` return shape is new.** v1 returns `{changed:boolean, type:'doc'|'framing'|null}`. v1 has no caller that reads `type`; v2 facade surgery must wrap this back into `boolean` for the existing `commitDocumentTransaction()` returns-boolean contract. Adapter: `const result = this.history.commit(this.document.document); return result.changed;` (drops the `type` discriminator until Slice 4 needs it).

- **History `commit()` try/catch is silent.** On resolver failure, returns `{changed:false, type:null}` without surfacing the error to the user. The pre-slice god-file posted a status message in this branch — v2 facade surgery MUST restore that `setStatusMessage(error.message)` call.

- **`cloneMuseumSceneDocument` is duplicated.** Local export in `document-store.svelte.ts` AND god-file line 116. Two copies of the same JSON-stringify-based deep-clone. Slice 6 collapses them into a single barrel.

- **`EditorCameraPreview*` types locally redeclared** in `camera-preview-controller.svelte.ts`. Mirrors god-file lines 76-89. Slice 6 moves them to `$lib/types/museum.ts`.

- **`museumSceneDocument` import path discrepancy.** Test files import from `$lib/content/scene` (canonical typed export). Sub-store code does the same. The JSON loader path `$lib/content/museum-scene.json` is **not** used directly — its type widens `version: number` which fails `MuseumSceneDocument`'s literal `version: 3 | 4` constraint. **`AGENTS.md` should note this as a coding convention.**

- **Peer-link test uses private bracket notation** (`preview['preview'] = {...transport: 'playing'}`). This works because Svelte 5's `$state` is a Proxy, but is a code smell — document in this hand-off so v2 author doesn't accidentally remove it during refactor. Cleaner alternative: `preview.startTransition('paris-seat','director')` if a guided route exists; bracket notation only as fallback.

- **`#timelineCache` invalidation is defensive-double in `setMode`.** The cache doesn't strictly need to clear on a mode-flip (route data doesn't depend on mode), but clearing prevents future tour-mode-flip regressions. Leave as-is until audit §8 performance review.

- **`untrack` import retained in `history-controller.svelte.ts` only.** It's used inside `#bumpVersion()` because `version` is a `$state` counter consumed by `$derived`-via-`void`. **Do not strip it.** `camera-preview-controller.svelte.ts` has no `untrack` import — writes inside FSM methods don't need tracked-read suppression.

- **`pruneIfStale()` test uses bracket-notation write.** Same code smell as the peer-link test. Direct `document.replace(snap-without-paris-seat)` would throw inside `#rebuildRuntime` (resolver requires `navigationNodes[0]?.id`), so the test simulates the post-replace state via direct preview mutation.

## Open questions for next slice

- (CRITICAL) **Facade surgery list needs prioritization.** Sub-tasks 3.4–3.7 from plan §3.7 are sequential; recommend doing sub-task 3.4 (god-file document section delete) AFTER sub-task 3.6 (peer-link wiring for `canUndo`) because the god file's pre-slice `canUndo` getter reads its OWN stack via `void this.registryVersion`. Until 3.6 lands, leaving v1's sub-stores untouched behind a facade that doesn't read them is mechanically the same as today.

- (CRITICAL) **`commitDocumentTransaction` boolean return-shape adapter.** v2 must wrap `history.commit(...)`'s `{changed, type}` envelope into a boolean return. Decision: at the adapter site only; do not propagate the discriminator to callers until Slice 4 (selection) needs framing-tx state for the reset-triad.

- (CRITICAL) **Status-message post on resolver failure.** `history.commit`'s try/catch returns silently. v2 must re-add the `setStatusMessage(error.message)` call. The composition root has the session status channel — find it on `this.session.setStatusMessage(error.message)`.

- **Listener wiring recipe (sub-task 3.6).** The constructor of `MuseumEditorStore` must register (in this order, since listeners fire in registration order):
  ```ts
  this.documentStore = new EditorDocumentStore();
  this.previewController = new EditorCameraPreviewController(this.documentStore);
  this.historyController = new EditorHistoryController(this.documentStore, this.previewController);
  this.documentStore.addAfterReplaceListener(() => this.previewController.refreshPausedDirector());
  this.documentStore.addAfterReplaceListener(() => this.previewController.pruneIfStale());
  this.documentStore.addAfterReplaceListener(() => this.previewController.invalidateGraph());
  // Slice 4 will add: this.documentStore.addAfterReplaceListener(() => this.selection.reconcile());
  ```
  Instantiation order matters because the History ↔ Preview peer-link requires Preview to exist when History is constructed.

- **`#timelineCache` invalidation in `setMode`.** Acceptable defensive double-invalidation. Document for Slice 4–5 author.

- **`#graphCache` invalidation double-call.** Both `refreshPausedDirector` and `pruneIfStale` call `invalidateGraph` first. Wasteful but harmless. Could deduplicate at v2.

- **`cameraPreview*` type double-declaration cost.** Structural typing keeps god-file and controller in sync today. If either drifts, plan §3 invites a Slice 2 mid-flight fix. **Recommend moving to `$lib/types/museum.ts` BEFORE v2 so the new barrel eliminates the duplication risk.**

- **300+ integration tests untouched in v1.** They cover the god file's facade. v2 facade surgery must keep them green — the existing assertions reference `store.replaceDocument(...)`, `store.undo()`, `store.canUndo` etc., all of which must behave IDENTICALLY post-surgery. Any divergence is a regression.

## Slice 3 v2 sub-task 3.4 — facade surgery (complete)

**Date:** 2026-07-31
**Sub-task scope:** god-file document section → `EditorDocumentStore` facade.
**Files modified:** `apps/museum/src/lib/editor/museum-editor.svelte.ts`.

### What landed

- Field renamed to `private readonly documentStore = new EditorDocumentStore();` (Plan deviation — see below. Architecture identical to plan §3.4.)
- 9 facade getters preserve the pre-slice call-site surface: `document()` / `scene()` / `state()` / `validation()` / `baselineCanonicalJson()` / `canonicalJson()` / `isDirty()` / `canExport()` / `validationIssues()`. Zero changes in the 16 consumer Svelte files (`EditorViewport` / `EditorSelection` / `EditorTransformControls` / etc.) or in `museum-editor.test.ts`.
- Constructor registers `this.documentStore.addAfterReplaceListener(() => this.#reconcileSelection())` — closes defect #2 (selection coherence fires on every document swap, not just `#replaceDocument()` callers).
- `get isDirty()` preserves the original `!validation.success || canonicalJson !== baselineCanonicalJson` semantics (defect #1 fix; sub-store's `isDirty` drops the validation.success pre-check — the facade restores it).
- `importDocument` body delegates `this.documentStore.replace(validation.document)` + `this.documentStore.setBaseline(validation.canonicalJson)`.
- `commitDocumentTransaction` body validates via `resolveSceneDocument(this.document)` + commits via `this.#replaceDocument(this.document)`; reconcile fires through the constructor-registered listener.
- Local `documentsMatch(a, b)` deleted; the single call site migrated to `EditorDocumentStore.documentsMatch(before, this.document)`.
- Pre-slice duplicate getters (`isDirty` / `canExport` / `validationIssues` / `canonicalJson` — bodies identical to the facade getters) deleted.
- Pre-slice lifecycle helpers `#rebuildRuntime` + `#replaceRuntime` deleted (the only infrastructure call moved into `EditorDocumentStore.#rebuildRuntime()` inside `replace()`).
- `#refreshPausedDirectorPreview` KEPT — view-keyframe authoring callers mutate via field-level writes (not through `replace()`) and call this helper directly to bump `cameraPreview.runId` + refresh captured route. Migration to `previewController.refreshPausedDirector()` is 3.5 territory; god-file helper deletes with it.
- `createMuseumState` import removed (was a sole-consumer of `#replaceRuntime`, now dead).

### Plan deviations

- **Field named `documentStore` (private) + 9 `get X()` facades, not plan-literal `document`.** Option 3 pragmatic facade — 16 consumer files retain `store.document.X` / `store.scene` / `store.state` / `store.validation` / `store.baselineCanonicalJson` / `store.canonicalJson` / `store.isDirty` / `store.canExport` / `store.validationIssues` access unchanged via the getters, avoiding ~250–500 lines of cross-file sed churn. All architectural intent (state lives on sub-store, surface via `get X()` + facade) is preserved. **Document in 3.5+ hand-offs so the field name isn't reverted.**
- **God-file LOC delta: +30 LOC** (was 4625 → ~4655 today). Plan's −1000 LOC god-file reduction distributes across 3.4 + 3.5 + 3.6 + 3.7; sub-task 3.4 alone is roughly break-even because Option 3 trades field-rename for 9 facade getters + constructor.

### Test result

- `npm run check` → **0 errors / 0 warnings** ✓
- `npx vitest run src/lib/editor` → **335 passed / 2 failed / 337 total**

The 2 failing tests are view-keyframe authoring tests that expect `cameraPreview.runId` to bump after a mutation:
- `MuseumEditorStore Director preview > keeps paused Director editable and refreshes its route at the same playhead` (`museum-editor.test.ts:1619`)
- `MuseumEditorStore camera view authoring > adds one independent view key at paused Director playhead and refreshes sampling` (`museum-editor.test.ts:1723`)

These failures fall in the same tolerance bucket as plan §3.4's documented `prepareDocumentReplacement` failures — they trace to the after-replace listener's coverage gap when field-level mutations bypass `documentStore.replace()` (see §Listener blind spot).

### Listener blind spot (3.5 territory)

`documentStore.addAfterReplaceListener(...)` ONLY fires on `documentStore.replace(doc)` calls. Field-level mutations (view-keyframe authoring ops like `addSceneCameraViewKeyframe` / `setViewKeyframe*`, placement add/remove, etc.) do NOT trigger the listener chain. Today's band-aids: `#refreshPausedDirectorPreview` (god-file private helper) is directly called by view-keyframe methods to bump `cameraPreview.runId` and refresh the captured route. 3.5 must pick one of:

- Route **every** field-level write through `documentStore.replace(doc)` — model field-level ops as a structural mutation that fires the same listener chain. Migration cost: every `addSceneCameraViewKeyframe` / `setViewKeyframe*` / placement mutate call rewritten.
- Add a side-channel `documentStore.notifyMutation(fieldPath)` so view-keyframe methods explicitly notify the listener chain. Cheaper migration but introduces a second mutation event type in the sub-store API.

Either choice is a 3.5 architectural call.

### Next-slice picks (3.5 — preview section)

**Already-shipped patterns from 3.4 (mirror in 3.5):**
- `private readonly documentStore = new EditorDocumentStore();` field decl + 9 getters + constructor-registered listener
- Inline `addAfterReplaceListener` registration in the constructor (deferred listener body via arrow-fn closure over `this`)
- Facade-getter delegation through sub-store (preserves consumer reads)
- Defect-fix precedents: `untrack` for `$state` counter writes (`#bumpHistoryVersion` keeps this idiom); preserve original validation.success pre-check semantics in derived getters

**Pre-slice (untouched, awaiting 3.5):**
- `cameraPreview` / `cameraPreviewFollowEnabled` / `cameraPreviewRecenterVersion` fields (~lines 2481 region) → migrate to `private readonly previewController = new EditorCameraPreviewController(this.documentStore);`
- `isCameraPreviewActive` / `isDirectorCameraPreview` / `isVisitorCameraPreview` / `isCameraPreviewPlaying` / `isCameraPreviewPaused` getters → delegate through `previewController.preview`
- 29+ preview FSM methods (`playCameraPreview` / `pauseCameraPreview` / `stopCameraPreview` / `setCameraPreviewPlayhead` / `stepCameraPreview` / `setCameraPreviewMode` / `markCameraPreviewStarted` / `completeCameraPreview` / `previewGuidedTour` / ...) — delegate to `EditorCameraPreviewController` methods
- Private cluster: `#capturedCameraPreviewRoute` / `#nextCameraPreviewRunId` / `#cameraTimelineGraph` / `#cameraTimelineCache` / `#readCameraTimeline` / `#resolveCameraPreviewRoute` / `cloneResolvedCameraRoute` → migrate into `EditorCameraPreviewController` (slated to happen there per Slice 3 v1)

**Listener wiring to extend in 3.5 constructor:**
```ts
this.previewController = new EditorCameraPreviewController(this.documentStore);
this.documentStore.addAfterReplaceListener(() => this.previewController.refreshPausedDirector());
this.documentStore.addAfterReplaceListener(() => this.previewController.pruneIfStale());
this.documentStore.addAfterReplaceListener(() => this.previewController.invalidateGraph());
```

Instantiation order matters: Preview must exist before any listener references it. Append after the 3.4 reconcile listener so reconcile fires first (lowest-latency selection coherence).

**Migration target for `#refreshPausedDirectorPreview`:** view-keyframe methods call `previewController.refreshPausedDirector()` directly. God-file helper deletes with the migration.

## Slice 3 v2 sub-task 3.5 — preview facade (complete)

**Date:** 2026-07-31
**Sub-task scope:** god-file preview FSM → `EditorCameraPreviewController` facade.
**Files modified:**
- `apps/museum/src/lib/editor/museum-editor.svelte.ts`
- `apps/museum/src/lib/editor/store/camera-preview-controller.svelte.ts` (deep clone + transitional `allocRunId` / `setCapturedRoute` / `clearCapturedRoute`)

### What landed

- `private readonly previewController = new EditorCameraPreviewController(this.documentStore)` + Option 3 getters/setters for `cameraPreview` / `cameraPreviewFollowEnabled` / `cameraPreviewRecenterVersion` (setters required — harness writes via cast in Phase 3.6 history tests).
- Constructor after-replace listeners (after reconcile): `refreshPausedDirector` → `pruneIfStale` → `invalidateGraph`.
- Deleted god-file `#capturedCameraPreviewRoute` / `#nextCameraPreviewRunId`. Timeline scrub + view-keyframe install paths use transitional controller accessors until 3.7.
- Thin delegates: `pauseCameraPreview` / `toggleCameraPreviewFollow` / `recenterCameraPreview` / `markCameraPreviewStarted` / `getCapturedCameraPreviewRoute`.
- Complex FSM methods (`play` / `setPlayhead` / `complete` / `previewSelected*` / `previewGuidedTour` / `stop` / timeline show-pose) keep composition-root guards + timeline sync; mutate via `previewController.*`.
- `#refreshPausedDirectorPreview` kept with pre-slice catch semantics (status message, preview retained). After-replace path uses controller `refreshPausedDirector` (clears on route failure).
- `#pruneInvalidCameraPreview` calls controller `pruneIfStale` then keeps stricter connection/transition endpoint checks.
- Controller `cloneResolvedCameraRoute` deepened to match god-file (viewTrack / positionSpan / automaticTargetPoints) — shallow `{...edge}` broke capture-immutability tests.

### Plan deviations

- Same Option 3 naming as 3.4 (`previewController` not plan-literal `preview`).
- God-file `#refreshPausedDirectorPreview` NOT deleted — field-level view-keyframe writes still bypass `replace()`; direct helper preserves status-on-fail vs listener clear-on-fail split.
- Timeline scrub (`#showCameraTimeline*`, `#cameraTimelineGraph/Cache`, `getCameraTimeline`) still on god file → 3.7.
- Transitional public `allocRunId` / `setCapturedRoute` / `clearCapturedRoute` on controller until 3.7 absorbs scrub entry points.

### Test result

- `npm run check` → **0 errors / 0 warnings**
- `npx vitest run src/lib/editor` → **337 passed / 0 failed**
- God-file LOC ≈ 4648 (was ~4667 post-3.4).

### Listener blind spot (carried)

Field-level mutations still skip `afterReplace`. Band-aid remains `#refreshPausedDirectorPreview` direct calls. No `notifyMutation` side-channel added in 3.5.

### Next-slice picks (3.6 — History + peer-link)

**Must read:**
- `store/history-controller.svelte.ts` — fix `commit()` to validate-before-push + surface `error` (current try/catch pushes `#past` then replace; on throw stack polluted + no restore). Pre-slice god validates via `resolveSceneDocument` first, restores `before` on fail, posts `setStatusMessage`.
- `museum-editor.svelte.ts` transaction/undo block (~4090–4250) + `#past`/`#future`/`#transactionBefore`/`#cameraFramingTransaction`/`historyVersion`/`#bumpHistoryVersion`.
- All `#transactionBefore` / `#cameraFramingTransaction` read sites (truthiness checks → `historyController.isDocumentUndoBlocked` / `isFramingTransactionActive`).

**Wire recipe:**
```ts
this.historyController = new EditorHistoryController(this.documentStore, this.previewController);
// Instantiation after previewController (peer-link ctor arg).
```

**Facade adapters (keep richer god canUndo semantics):**
- `canUndo` / `canRedo` — still gate on `isDocumentUndoBlocked` (interaction + tx + transport !== paused) + `pendingNavigationCommand` + `pastDepth`/`futureDepth`. Do NOT replace wholesale with `history.canUndo` (that only blocks `playing`).
- `beginDocumentTransaction` / `beginCameraFramingTransaction` — keep mutation-blocked guards, then `history.beginDocument()` / `beginFraming()`.
- `commitDocumentTransaction` — `history.commit(this.document)` → `return result.changed`; on `result.error` call `this.setStatusMessage(error.message)`.
- `cancelDocumentTransaction` — framing-drag cancel first, then `history.cancel()`.
- `undo`/`redo` — pending-nav cancel + undo-blocked guards, then `history.undo()`/`redo()` + `#pruneInvalidCameraPreview`.
- `importDocument` history clear → `history.clear()`.
- `historyVersion` → getter over `historyController.version`.

**Delete after green:** `#past` `#future` `#transactionBefore` `#cameraFramingTransaction` `historyVersion=$state` `#bumpHistoryVersion`.

## Slice 3 v2 sub-task 3.6 — History + peer-link (complete)

**Date:** 2026-07-31
**Sub-task scope:** god-file history/tx/undo → `EditorHistoryController` facade + commit error envelope.
**Files modified:**
- `apps/museum/src/lib/editor/store/history-controller.svelte.ts` — validate-before-push; `HistoryCommitResult.error`; restore `before` on resolver fail
- `apps/museum/src/lib/editor/store/history-controller.test.ts` — expect `error: null` on refuse
- `apps/museum/src/lib/editor/museum-editor.svelte.ts` — historyController wiring

### What landed

- `private readonly historyController = new EditorHistoryController(documentStore, previewController)` after preview (peer-link order).
- `historyVersion` getter → `historyController.version`. Deleted `#past`/`#future`/`#transactionBefore`/`#cameraFramingTransaction`/`historyVersion=$state`/`#bumpHistoryVersion`/`#replaceDocument`/`HISTORY_LIMIT`/`untrack` import.
- Facade adapters keep richer `canUndo`/`canRedo`/`isDocumentUndoBlocked` (interaction + transport !== paused + pending nav). History's narrow `canUndo` (playing-only peer-link) stays for sub-store tests — do not wholesale-replace facade.
- `commitDocumentTransaction` → `history.commit(this.document)`; posts `setStatusMessage(result.error.message)` when resolver fails.
- `begin*` keep mutation-blocked guards then `beginDocument`/`beginFraming`. `cancel` keeps framing-drag cancel-first. `undo`/`redo` keep pending-nav + blocked guards then history + `#pruneInvalidCameraPreview`.
- `importDocument` → `history.clear()`.

### Plan deviations / fixes

- **commit() bug fixed in controller:** v1 pushed `#past` before `replace`; throw polluted stack + no restore. Now `resolveSceneDocument(next)` first, restore `before` on fail, then push+replace. Matches pre-slice god order.
- Option 3 naming: `historyController` not plan-literal `history`.

### Test result

- `npm run check` → **0 errors / 0 warnings**
- `npx vitest run src/lib/editor` → **337 passed / 0 failed**
- God-file LOC ≈ 4613

### Next-slice picks (3.7 — camera-timeline scrub)

**Still on god file (migrate into preview controller or thin helper):**
- `getCameraTimeline` / `#readCameraTimeline` / `#cameraTimelineGraph` / `#cameraTimelineCache`
- `seekCameraTimeline` / `selectCameraTimeline*` / `stepCameraTimeline`
- `#showCameraTimelineNodePose` / `#showCameraTimelineConnectionPose` / `#syncCameraTimeline*`
- `#syncViewKeyframeProgressDragPreview` preview-side
- Transitional `allocRunId` / `setCapturedRoute` / `clearCapturedRoute` callers in those paths
- God-file `cloneResolvedCameraRoute` (still used by scrub) — collapse with controller clone when scrub moves

**Keep on composition root until Slice 5 bind:** `cameraTimelinePlayhead = $state` mirror.

**After 3.7:** 3.8 sub-store tests already exist; 3.9 full sanity; 3.10 hand-off must enumerate facade-mirrored fields (plan §3.10 list).

## Slice 3 v2 sub-task 3.7 — timeline cache (partial)

**Date:** 2026-07-31
**Status:** PARTIAL — timeline ownership moved; scrub methods stay on composition root.

### What landed

- `EditorCameraPreviewController.getTimeline()` — graph-identity cache matching pre-slice `getCameraTimeline`.
- `invalidateGraph()` also clears `#timelineGraph`/`#timelineCache`.
- God-file `getCameraTimeline()` one-line delegate; deleted `#cameraTimelineGraph`/`#cameraTimelineCache`.
- `#readCameraTimeline` kept on god (status-message on miss).

### Deferred (selection-coupled — stay on composition root)

`seekCameraTimeline` / `selectCameraTimeline*` / `stepCameraTimeline` / `#showCameraTimeline*` / `#syncCameraTimeline*` / `#syncViewKeyframeProgressDragPreview` still call prepare + selection + `cameraTimelinePlayhead` mirror. Moving them into the preview controller would drag selection/session concerns across the peer-link boundary. Plan §3.7 "or a thin helper if really needed" — thin helper deferred; composition root remains owner of scrub orchestration.

### Test result

- check clean; `src/lib/editor` **337/337**
- God-file LOC ≈ 4603

### Remaining for Slice 3 close-out

- 3.8 sub-store tests already exist (no new work unless scrub helper adds surface).
- 3.9 already green this session.
- 3.10: finalize hand-off with **Facade-mirrored fields** enumeration (plan §3.10 required list) + mark Slice 3 COMPLETE when scrub deferral accepted or helper lands.

### Facade-mirrored fields (draft for 3.10)

- `cameraTimelinePlayhead` — `$state` on root (bind: until Slice 5)
- `cameraPreview` / `cameraPreviewFollowEnabled` / `cameraPreviewRecenterVersion` — getters(/setters) over previewController
- `get isCameraPreviewActive|Director|Visitor|Playing|Paused` — read previewController.preview
- `historyVersion` — getter over historyController.version
- `get canUndo` — composition-root rich predicate; peer-link via preview.transport (history.canUndo is narrow)
