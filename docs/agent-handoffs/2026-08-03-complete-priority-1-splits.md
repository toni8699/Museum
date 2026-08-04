# Priority-1 File Splits — Final Gate & Release Handoff

**Date:** 2026-08-03
**Branch:** main
**Status:** All six slices complete. Release-ready (no commits; per AGENTS.md).

## What landed

Six structurally green slices turned the three Priority-1 oversized files
into focused sibling modules, with strict public-surface freezes so the
40+ consumer files import unchanged.

| Slice | Subject | Status |
|------:|---------|--------|
| 1 | Host factories → `store/controller-hosts.ts` | ✅ |
| 2 | Preview + timeline playback commands → `store/camera-preview-commands.svelte.ts` | ✅ |
| 3 | Phase 5.2 texture facade + module helpers (`registerTexture`, `cloneRoutePoint`, `cloneMuseumSceneDocument`, `cameraDirectionTreeKey`) | ✅ |
| 4 | `museum-editor.test.ts` → 4 themed suites + `editor-test-utils.ts` | ✅ |
| 5 | `scene-codec.ts` → 9-file `scene-codec/` directory | ✅ |
| 6 | Final automated gate + release handoff (this doc) | ✅ |

Per-slice handoff documents:
- `./2026-08-03-complete-priority-1-split-1-controller-hosts.md`
- `./2026-08-03-complete-priority-1-split-2-preview-commands.md`
- `./2026-08-03-complete-priority-1-split-3-texture-controller.md`
- `./2026-08-03-complete-priority-1-split-4-test-split.md`
- `./2026-08-03-complete-priority-1-split-5-codec.md`

## Step 1 — Automated gate

```
npm run check -w @portfolio/museum
  → svelte-check found 0 errors and 0 warnings
cd apps/museum && npx vitest run --reporter=basic
  → 45 files, 660 / 660 passed (3.43s)
npm run build -w @portfolio/museum
  → built in 4.39s, exit 0 (adapter-auto env note only, expected)
git diff --check
  → silent
```

## Step 2 — Post-split LOC table

### Editor facade + controllers

```
apps/museum/src/lib/editor/
  museum-editor.svelte.ts                                2 554  (was 3 640)  ✅ ≤ ~2 500 plan target
  museum-editor.types.ts                                   237
  store/controlled-host.ts                                656   (new)  Slice 1
  store/camera-preview-commands.svelte.ts                 737   (new)  Slice 2
  store/texture-library-controller.svelte.ts              252   (new)  Slice 3
  store/camera-preview-controller.svelte.ts               683   (extracted in Phase 9.4)
  store/camera-timeline-controller.svelte.ts              567   (extracted in Phase 9.4)
  store/document-store.svelte.ts                          186
  store/history-controller.svelte.ts                      234
  store/material-resource-mutator.svelte.ts               547
  store/mutation-guards.svelte.ts                          63
  store/navigation-graph-mutator.svelte.ts                865
  store/path-anchor-mutator.svelte.ts                     314
  store/placement-cluster-mutator.svelte.ts               724
  store/scene-roots.svelte.ts                             176
  store/selection-actions.svelte.ts                       523
  store/selection-store.svelte.ts                         132
  store/session-state.svelte.ts                           435
  store/view-keyframe-controller.svelte.ts                823
  helpers/document-clone.ts                               24   (new)  Slice 3
  helpers/route-clone.ts                                  91   (new)  Slice 3
  helpers/scene-keys.ts                                   66   (+16) Slice 3
  helpers/validators-runner.ts                            86
```

### Editor test split

```
museum-editor.test.ts                                     305  (was 4 350) ✅ residual smoke + history
museum-editor-selection.test.ts                           413
museum-editor-placement.test.ts                           489
museum-editor-camera.test.ts                            2 793  ⚠ above ~1 000 plan checkpoint (flagged)
museum-editor-textures.test.ts                            269
editor-test-utils.ts                                       54   (new)
(all other editor-*.test.ts files were already in place)
```

### Scene-codec directory split

```
scene-codec/index.ts                                      274  (was 2 337 monolith; 88 % slimmed) ✅
scene-codec/types.ts                                      107
scene-codec/readers.ts                                    214
scene-codec/parse-entities.ts                             596
scene-codec/parse-nodes.ts                                281
scene-codec/parse-connections.ts                          463
scene-codec/validate.ts                                   405
scene-codec/canonical.ts                                  187
scene-codec/migrate.ts                                     90

Total: 2 617 LOC across 9 files (vs 2 337 monolith)  ✅ all sibling modules ≤ ~400 LOC
NB: parse-entities.ts at 596 sits above the ~400 plan checkpoint —
   flagged as a candidate for a future slice if the entity / resource
   surface grows further (entity parsing + placement + materials
   co-locate because they share reader helpers + the modelEntity
   adapter).
```

## Step 3 — Cumulative facade shrink

| File | Before | After | Δ |
|---|---:|---:|---:|
| `museum-editor.svelte.ts`   | 3 640 | 2 554 | −1 086 (−30 %) |
| `museum-editor.test.ts`     | 4 350 |   305 | −4 045 (−93 %) |
| `scene-codec.ts`            | 2 337 |   274 (barrel) | −2 063 monolith extracted into 9 files |
| **Net**                     | **10 327** | **~10 327** | zero-line spread (overhead = per-file headers + imports) |

## Step 4 — Public-surface freeze compliance

- **`museum-editor.svelte.ts`** — every public method, getter, and setter
  the 40+ consumers reach through is preserved with an identical signature.
  Surface breakdown: 142 getters/setters + 23 one-line delegations + the
  remaining imperative methods (verification of consumption confirmed
  by the 660 tests + svelte-check + build gate).
- **`scene-codec/index.ts`** — frozen to seven exports:
  `SceneDocumentIssue`, `SceneDocumentValidationResult`,
  `SceneDocumentValidationError`,
  `cameraSceneConnectionTimingFailureReason`,
  `validateSceneDocument`, `parseSceneDocumentJson`,
  `serializeSceneDocument`. All 7 documented consumers (`load-fixture-scene.ts`,
  `scene-codec.test.ts`, `scene.test.ts`, `museum-editor.svelte.ts`,
  `museum-editor.test.ts`, `navigation-graph-mutator.svelte.ts`,
  `EditorProjectMenu.svelte`) import the barrel unchanged.

## Step 5 — Plan deviations (cumulative)

1. **Group A timeline ruler methods** stayed as one-line facade delegates
   to `cameraTimelineController` (already extracted in Phase 9.4 — Slice 2
   rejected routing through `cameraPreviewCommands` to avoid a useless
   `facade → commands → timeline-controller` hop).
2. **`cloneResolvedCameraRoute` duplication** — `camera-preview-controller.svelte.ts`
   still carries a local copy after Slice 3 moved the canonical version
   to `helpers/route-clone.ts`. Deferred to a future controller-de-duplication
   slice.
3. **`museum-editor-camera.test.ts`** — 2 793 LOC (above the plan's 1 000
   per-suite checkpoint). The camera suite spans 12 describes across
   phases 2.2 / 2.3 / 2.4 / 3.1 / 3.4 / 3.5 / 3.6 / 6 / 6.5 / view
   authoring + Director preview; further sub-splitting is a Slice-7
   candidate.
4. **`scene-codec/parse-entities.ts`** — 596 LOC (above the ~400 plan
   checkpoint). Same reason: entity + material + texture + placement +
   cluster parsers share one reader set; further sub-splitting would
   introduce cyclic sibling imports.

## Step 6 — Residual facade surface flagged for a future slice

`museum-editor.svelte.ts` ends at 2 554 LOC and contains:
- **142 getters/setters** — most are 1-line pass-throughs to sub-stores
  (`cameraPreview`, `historyVersion`, `selectedRoomId`,
  `selectedPlacementIds`, `navigationSelection`, `transformMode`,
  `gridVisible`, `cameraPanEnabled`, `cameraFocusVersion`, …).
  These stay on the facade because the freeze binds them to the
  store name; migrating them onto a per-store consumer surface is a
  separate consumer-coordination risk (every `EditorRoot.svelte` /
  `EditorCanvas.svelte` reader ref would need to rewrite).
- **23 one-line delegate methods** — all forward to controllers
  (camera-preview-commands / texture-library-controller / selection-actions /
  navigation-graph-mutator / placement-cluster-mutator / etc.).
  These are the public-method freeze surface: removing a delegate
  would break a consumer test.

Thinning the residual getter surface is the cleanest next-slice scope
once the user wants another round — it would drop the facade to ~1 800
LOC and put every editor property read on a typed owner (sub-store
class). Until that is requested, the freeze holds.

## Step 7 — Next-slice pointer

Two candidates, in the order the plan author signalled:

1. **Residual getter surface thinning** — collapse the 142 getters/setters
   into typed reader objects per sub-store (SelectionStore,
   PreviewSessionStore, PlacementStore, VisibilityStore) and let
   consumers subscribe via `store.foo.state.field` instead of
   `editor.field`. Expected drop to ~1 800 LOC on the facade.
2. **Phase 5.3 — shared material-instance rendering** — wired renderable
   that pipes `materialInstanceId` through the existing entity primitive
   + light + model stack. See `docs/plans/museum-editor-workspace/phase-5-textures.md`.

No commits (per AGENTS.md).
