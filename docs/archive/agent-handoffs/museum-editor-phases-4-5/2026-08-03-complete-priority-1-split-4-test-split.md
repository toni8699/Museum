# Priority-1 Split 4 — Test Suite Split

**Status:** Complete
**Date:** 2026-08-03
**Plan:** [`../superpowers/plans/2026-08-03-priority-1-file-splits.md`](../superpowers/plans/2026-08-03-priority-1-file-splits.md)

## What landed

Split the 4 350-LOC `museum-editor.test.ts` mega-suite (28 describes) into
focused themed test files plus shared fixtures. The mega-suite's surface
shrinks to a smoke + history + viewport-visibility core, the rest moves by
describe-block theme:

- Created `apps/museum/src/lib/editor/editor-test-utils.ts` (54 LOC):
  - `FIXTURE_GUIDED_ORDER` — stable tour ordering the
    `MuseumEditorStore Phase 3.4 guided-order editing` describes assert
    against after edits.
  - `cloneFixtureDocumentWithEntityCount(minCount)` — pads the fixture
    document to a known entity count (offsets each added entity by 0.5 m
    on world-X).
  - `createFixtureEditorStore(entityCount?)` — wraps the fixture loader +
    `cloneFixtureDocumentWithEntityCount` to build a `MuseumEditorStore`
    with predictable session state. The per-describe local helpers
    (`translatedTransform`, `importWithViewKeys`, `addDocumentConnection`,
    `documentWithFreeInsertableNode`, `documentWithFreeNode`,
    `importWithDragKeys`, `installPausedVisitorNodePreview`, `makeHistory`,
    `firstForwardSelection`) stay inside their describing blocks per the
    plan's "move-only-shared-fixtures" directive.

- Created `apps/museum/src/lib/editor/museum-editor-selection.test.ts`
  (413 LOC, 20 tests): carries the **selection**, **clusters**, and
  **Phase 2.1 persistent camera discovery** describes. Verbatim — every
  expectation unchanged.

- Created `apps/museum/src/lib/editor/museum-editor-placement.test.ts`
  (489 LOC, 24 tests): carries the **Phase 5 placement commands**,
  **Phase 4.3 primitive creation**, **Phase 4.4 light creation**, and
  **placement settings** describes. Verbatim — every expectation unchanged.

- Created `apps/museum/src/lib/editor/museum-editor-camera.test.ts`
  (2 793 LOC, 92 tests): carries the 12 Phase 6 / Phase 6.5 / Director
  preview / camera view authoring / Phase 2.2 / 2.3 / 2.4 / 3.1 / 3.4 /
  3.5 / 3.6 camera-side describes. The mega file is large because these
  describes cover the bulk of the camera preview / timeline scrub / view
  authoring integration surface; future slices may further split it
  (the plan target ≤ 1 000 LOC per suite was a checkpoint, not a hard cap;
  Split 6 / final-gate revisit if the team wants tighter scoping).

- Created `apps/museum/src/lib/editor/museum-editor-textures.test.ts`
  (269 LOC, 12 tests): carries the **Phase 5.2 texture facade** describe
  block — Slice 3's texture controller's store-integration coverage in
  isolation.

- Created `apps/museum/src/lib/editor/editor-transform.test.ts` (49 LOC,
  3 tests): new file dedicated to the editor-transform module's pure
  helpers. Carries the **editor placement transforms** describe (the
  plan's "append to `editor-transform.test.ts` if it directly exercises
  `placementTransformFromDocument` / `writePlacementTransform`";
  confirmed yes).

- Modified `apps/museum/src/lib/editor/editor-selection.test.ts`
  (301 → 354 LOC): appended the **editor-selection helpers** describe
  block (pure-module helpers like `resolveNormalSelection`,
  `filterEffectiveHits`, `nextPlacementCycleId`). Imports for
  `NEAR_INVISIBLE_OPACITY`, `nextPlacementCycleId`, `filterEffectiveHits`,
  and the `SelectionHitInfo` type added to the existing `editor-selection`
  import block.

- Modified `apps/museum/src/lib/editor/editor-camera-framing.test.ts`
  (53 → 79 LOC): appended the **editor room camera framing** describe
  block (pure-helper call against `createEditorRoomCameraFrame` /
  `getRoom('paris')`). Imports for `getRoom` (from `$lib/content/rooms`)
  and `createEditorRoomCameraFrame` (from `./editor-camera`) added.

- Reduced `apps/museum/src/lib/editor/museum-editor.test.ts`
  (4 350 → 305 LOC, **−4 045 LOC**): retains only the residual
  **cloneMuseumSceneDocument**, **createMuseumEditorStore**,
  **MuseumEditorStore history**, and **viewport visibility flags**
  describes (13 tests). All expects unchanged.

No behavior change: every describe block was moved byte-for-byte. The
sole code-level edit was the `museumSceneDocument` import path inside
the merged `editor-transform.test.ts` (`from '$lib/content/scene'`,
not `'./museum-editor.svelte'` — the facade does not re-export the
singleton).

## Files touched

- Create `apps/museum/src/lib/editor/editor-test-utils.ts`
- Create `apps/museum/src/lib/editor/museum-editor-selection.test.ts`
- Create `apps/museum/src/lib/editor/museum-editor-placement.test.ts`
- Create `apps/museum/src/lib/editor/museum-editor-camera.test.ts`
- Create `apps/museum/src/lib/editor/museum-editor-textures.test.ts`
- Create `apps/museum/src/lib/editor/editor-transform.test.ts`
- Modify `apps/museum/src/lib/editor/editor-selection.test.ts` (append
  `editor-selection helpers` describe + add 4 imports)
- Modify `apps/museum/src/lib/editor/editor-camera-framing.test.ts`
  (append `editor room camera framing` describe + add 2 imports)
- Modify `apps/museum/src/lib/editor/museum-editor.test.ts` (residual)

## Verification evidence

- Typecheck: `npx tsc --noEmit -p apps/museum/tsconfig.json` — clean
- Full suite: **45 files / 660 tests passed** (was 40 files / 660 tests
  before the split; 5 new test files added, no test lost, no test
  moved between files except as describe blocks)
- Themed suite spot-runs per Step 4:
  - `museum-editor-selection.test.ts` **20 / 20 passed**
  - `museum-editor-placement.test.ts` **24 / 24 passed**
  - `museum-editor-camera.test.ts` **92 / 92 passed**
  - `museum-editor-textures.test.ts` **12 / 12 passed**
  - `museum-editor.test.ts` (residual) **13 / 13 passed**
- `npm run check -w @portfolio/museum`: **0 errors / 0 warnings**
- `git diff --check`: clean
- File sizes: mega `museum-editor.test.ts` 4 350 → 305 LOC (−4 045);
  themed suites 413 + 489 + 2 793 + 269 = 3 964 LOC; shared fixtures 54
  LOC; pure-helper suites +53 + 26 LOC. Total LOC growth from per-file
  import blocks + Slice-4 doc comments is ~150 LOC across the new
  files — net reduction ~3 800 LOC vs the original mega-suite.

## Notes / deviations from plan

- Plan Step 2 hint: "append to editor-transform.test.ts if its
  assertions exercise `placementTransformFromDocument` /
  `writePlacementTransform` directly; otherwise move to the placement
  suite." Confirmed yes and put it on the transform suite.
- Plan Step 4 per-suite ≤ 1 000 LOC checkpoint is exceeded by
  `museum-editor-camera.test.ts` (2 793 LOC). The plan called it a
  checkpoint, not a hard cap; this is left as a Split 6 / final-gate
  revisit candidate if the team wants tighter scoping (further split
  between Director / Visitor preview / view authoring / timeline scrub).
- `museumSceneDocument` import path in the merged
  `editor-transform.test.ts` corrected from `./museum-editor.svelte`
  (which has no re-export) to `$lib/content/scene`. No behavior change,
  but flagged here for the post-Slice-4 requirements review in case
  the team decides to re-export the singleton from the facade in a
  future slice.

## Next slice

Slice 5 — split `scene-codec.ts` (2 337 LOC) into a `scene-codec/`
directory: barrel (`index.ts`), `types.ts`, `readers.ts`,
`parse-entities.ts`, `parse-nodes.ts`, `parse-connections.ts`,
`validate.ts`, `canonical.ts`, `migrate.ts`. Every internal function
gets a `/** @internal — scene-codec only */` tag. The 7 consumer imports
(load-fixture-scene.ts, document-store.svelte.ts,
document-store.test.ts, navigation-graph-mutator.svelte.ts,
museum-editor.svelte.ts, museum-editor.test.ts,
EditorProjectMenu.svelte) keep importing from `$lib/content/scene-codec`
which resolves to the new barrel. Public surface (3 functions +
SceneDocumentIssue / SceneDocumentValidationResult /
SceneDocumentValidationError + `cameraSceneConnectionTimingFailureReason`)
frozen.
