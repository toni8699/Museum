# Priority-1 Split 2 — Preview + Timeline Playback Commands

**Status:** Complete
**Date:** 2026-08-03
**Plan:** [`../superpowers/plans/2026-08-03-priority-1-file-splits.md`](../superpowers/plans/2026-08-03-priority-1-file-splits.md)

## What landed

Extracted the preview + timeline playback orchestration block (~470 LOC) out of
`MuseumEditorStore` into a new orchestration controller:

- `apps/museum/src/lib/editor/store/camera-preview-commands.svelte.ts` (new,
  738 LOC, 30 public methods):
  - `EditorCameraPreviewCommandsHost` — structural surface the controller
    depends on; lists every facade member the orchestration reads or writes
    (guards, document/scene/state, selection reducer + actions, the two child
    sub-controllers, the facade-owned cancellers + restorer + session clear,
    and the writable `cameraTimelinePlayhead` / `timelineExpanded` slots).
  - `EditorCameraPreviewCommands` — the orchestration class. Constructor
    takes a single host argument; the FSM *state* continues to live in
    `store/camera-preview-controller.svelte.ts` and the timeline *ruler*
    continues to live in `store/camera-timeline-controller.svelte.ts`.
- `apps/museum/src/lib/editor/museum-editor.svelte.ts`
  (3 148 → 2 728 LOC, **−420 LOC**; the 17-LOC gap vs. the raw method-body
  count is from the extended Slice-2 doc block on the new controller field
  and the `@internal` JSDoc on the five shim methods):
  - New `private readonly cameraPreviewCommands: EditorCameraPreviewCommands`
    field, instantiated in the constructor right after
    `historyController` so the bridge arrows in `slice 1`'s `controller-hosts`
    have a live target to forward to.
  - 19 public method bodies deleted; one-line delegations with identical
    signatures (`playActiveConnectionEdge(mode?) { return this
    .cameraPreviewCommands.playActiveConnectionEdge(mode); }`, …) keep the
    pre-slice public surface byte-compatible.
  - Three previously-private methods dropped from the facade (their bodies
    moved verbatim): `#resolveCameraPreviewRoute`,
    `#prepareCameraPreview`, `#seedEmptyReverseForSelectedForwardTrack`.
  - Five `@internal` shim methods added on the facade so the structural
    cast in `controller-hosts`'s bridge arrow implementations can invoke
    the ECMAScript-private canceller/restorer/session-clear state without
    promoting those private fields to public class members (callers can
    distinguish `null` = no callback installed from `false` = refused):
    - `cancelTransform(): boolean | null`
    - `cancelDirectPathDrag(): boolean | null`
    - `cancelDirectFramingDragOrFail(): boolean`
    - `restoreCameraPreview(): boolean | null`
    - `clearCameraFocusRequest(): void`
  - These shims are documented as `@internal` bridge surface and are not
    part of the public consumer-facing API (the 40 consumer files do not
    call them; the facade calls them only from the new controller's
    host via the structural cast).

No behavior change: each moved body is byte-for-byte identical except for the
mechanical `this.X` → `this.host.X` rewrite (mechanical cast discipline).
The bridge in `controller-hosts.ts` (now lines 463–466) forwards to
`cameraPreviewCommands.prepareCameraPreview()` and the `viewKeyframe` host
literal (now lines 420–422) forwards to
`cameraPreviewCommands.seedEmptyReverseForSelectedForwardTrack()` instead of
calling facade-private methods.

## Plan deviation: Group A timeline methods stay on the facade

The plan's "timeline seek/select/step" set — `seekCameraTimeline`,
`toggleCameraEdgeReverse`, `setCameraEdgeTravel`,
`selectCameraTimelineEdge`, `selectCameraTimelineNode`,
`selectCameraTimelineViewKeyframe`, `stepCameraTimeline` — were already
moved to `store/camera-timeline-controller.svelte.ts` in Phase 9.4. The
facade kept them as one-line delegates (e.g. `seekCameraTimeline(p) {
return this.cameraTimelineController.seekCameraTimeline(p); }`) at
lines ~1359–1414 — well outside the plan's claimed line range
(1 850–2 700). Re-routing them through `cameraPreviewCommands` here would
build an `facade → commands → timeline-controller` hop for no
architectural benefit (thinker pass before the slice confirmed the
deviation). They stay where Phase 9.4 left them; this is documented for the
post-Slice-2 requirements review.

## Files touched

- Create `apps/museum/src/lib/editor/store/camera-preview-commands.svelte.ts`
- Modify `apps/museum/src/lib/editor/museum-editor.svelte.ts`
  - New import block (two lines) for the new controller.
  - New `cameraPreviewCommands` field declaration (type-only, three lines
    including a Slice-2 doc block).
  - New constructor initialization (six lines).
  - 19 public method bodies deleted and replaced with one-line
    delegations.
  - 3 `#`-private method bodies deleted.
  - 5 public shim methods added next to the existing setter trio.
  - `commitDocumentTransaction` updated to call
    `this.cameraPreviewCommands.seedEmptyReverseForSelectedForwardTrack()`.
  - The bridge arrow bodies in the slice-1
    `private readonly hosts = createControllerHosts(...)` line now forward
    to `cameraPreviewCommands.*` instead of `#`-private methods.

## Verification evidence

- Typecheck: `npx tsc --noEmit -p apps/museum/tsconfig.json` — clean
- Focused preview/timeline suites (7 files per plan Step 3):
  **232 / 232 passed**
  (`museum-editor.test.ts` 169, `camera-preview-controller` 18,
  `editor-camera-timeline` 11, `editor-camera` 12, `editor-camera-path`
  13, `editor-camera-view` 6, `editor-camera-framing` 3)
- Full suite: **40 files / 660 tests passed**
- `npm run check -w @portfolio/museum`: **0 errors / 0 warnings**
- `git diff --check`: clean
- File sizes: `museum-editor.svelte.ts` 3 148 → 2 728 LOC (−420 LOC, target
  met — plan Step 4 said the slice removes ~470 LOC); new controller
  737 LOC (includes substantial doc comments; method-body count is ~470
  LOC of verbatim code).

## Next slice

Slice 3 — extract the Phase 5.2 texture facade
(`registerTexture` / `probeTexture` / `requestMaterialEdit` /
`requestTextureAssignment` / `confirmPendingMaterialEdit` /
`cancelPendingMaterialEdit` / `makeMaterialInstanceUnique`) and three
module helpers (`cloneRoutePoint` + `isRoutePointTuple` +
`cloneResolvedCameraRoute` → `helpers/route-clone.ts`;
`cloneMuseumSceneDocument` → `helpers/document-clone.ts`;
`cameraDirectionTreeKey` → `helpers/scene-keys.ts`). The
`material-resource-mutator` stays put; only the façade orchestration
moves. The host-callable shim methods added this slice (esp.
`clearCameraFocusRequest` / `cancelDirectFramingDragOrFail`) are the
last private-state escape hatch on the façade for this refactor
sequence — Slice 3's texture-controller host won't need any of them.
