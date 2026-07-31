# Slice 1 debt hand-off — types barrel + `runOrFail` + session slots

**Status:** COMPLETE
**Date:** 2026-07-31
**Branch:** main (2 commits ahead of `origin/main` per `AGENTS.md` — no commit landed)
**Last commit:** no commit required for this close-out (user decides)

## What landed

Slice 1 debt (3.11 + 3.12 + 3.13 from `docs/refactor-audit/2026-07-28-refactor-plan.md`)
ships in one slice. **No `bind:` migration** required, so the audit §3.G
Phase A rules apply: composition root keeps real `$state` fields for every
session mirror and the sub-store owns the canonical truth for `sessionView`
consumers.

- **3.11** — type-only barrel `museum-editor.types.ts`. Twenty-two types
  exported; the controller's locally redeclared `CameraPreviewNode` etc.
  collapse to barrel imports (Slice 6 plan marked superseded).
- **3.12** — pure helper `helpers/validators-runner.ts` with `runOrFail<T>`.
  Generic constraint `T extends { ok: boolean; message: string }`,
  TS-narrowed return `Extract<T, { ok: true }> | null`. Six unit assertions.
- **3.13** — `EditorSessionState` extended from 4 to 22 slots covering every
  audit §3.C field. Phase A mirrors added at six public setter sites on the
  composition root; inline-mutation gaps remain and are documented below.

## Files added / modified

### New

- `apps/museum/src/lib/editor/museum-editor.types.ts` — type-only barrel.
  - `EditorLightingSettings`
  - `EditorCameraPreviewMode`, `EditorCameraPreviewTransport`,
    `EditorCameraPreviewState`, `EditorCameraPreview`, and the four
    `'node'|'transition'|'connection'|'tour'` variant interfaces.
  - `EditorPendingNavigationCommand`
  - `EditorWorkspace`, `EditorLeftPanel`,
    `EditorPlacementTreeSelectionOptions`, `EditorClusterTreeSelectionOptions`
  - `EditorViewKeyframeProgressDragSelection`, `EditorTransformSpace`
  - `EditorCameraFocusKind`, `EditorTransformInteractionKind`
- `apps/museum/src/lib/editor/helpers/validators-runner.ts` —
  `EditorValidatorFailure` + `runOrFail<T>` + `ValidatorSessionChannel`.
  No Svelte-rune dependency (`Pick<EditorSessionState, 'setStatusMessage'>`).
- `apps/museum/src/lib/editor/helpers/validators-runner.test.ts` — six
  assertions covering success variant, plan destructure, failure post, double-post,
  validator call count, and `Pick<…>` session smuggling.

### Modified

- `apps/museum/src/lib/editor/museum-editor.svelte.ts`
  - Imports `runOrFail` from the helpers file (line 113).
  - Imports the nine barrel types (lines 116–131).
  - Re-exports the nine barrel types from the god file (lines 153–167).
  - Replaces **seven** `setStatusMessage(validation.message)` sites with
    `runOrFail(this.session, () => validateX(...))`. The audit counted **8**;
    the eighth line (`4115`) drifted out of the codebase; only 7 exist.
    See Open Questions.
  - Phase A mirrors added at: `applyLightingPreset`, `setWorkspace`,
    `setLeftPanel`, `setTimelineExpanded`, `toggleTimeline`,
    `setTimelineHeight` (with the assigned-back fix).
  - `setTimelineHeight` body lost the `this.timelineHeight = nextHeight`
    assignment in an earlier edit; fixed in this slice.
- `apps/museum/src/lib/editor/store/session-state.svelte.ts`
  - 22 `$state` slots added: workspace chrome, timeline chrome, transform,
    focus channel, camera pan, grid, lighting (5 fields), snap (4 fields),
    keep-on-floor, drop-to-floor, pending frame/nav/asset, tree expansion
    (4 arrays), interaction flags (4 booleans), progress-drag identity.
  - Per-slot setters exposed for the god-file's Phase A mirror write path.
- `apps/museum/src/lib/editor/store/session-state.test.ts`
  - Expanded from 9 assertions (status timer + viewport toggles) to **35**
    assertions covering workspace, lighting, snap, tree expansion,
    interaction, focus channel, pending frame/nav/asset.
- `apps/museum/src/lib/editor/store/camera-preview-controller.svelte.ts`
  - 4 variant interfaces (`CameraPreviewNode/Transition/Connection/Tour`)
    collapsed to barrel imports + controller-side re-exports.

## Public surface diff

- `MuseumEditorStore` adds no new public methods.
- `museum-editor.types.ts` is a public export consumed by callers that want
  the canonical `EditorCameraPreview` shape or `EditorWorkspace`.
- `validators-runner.ts` exports `EditorValidatorFailure` + `runOrFail`.
- `EditorSessionState` keeps the same public method names; only the
  slot count grew.

## Test results

- `npm run check` (svelte-check + tsc) → **0 errors, 0 warnings** ✓
- `npx vitest run --reporter=basic` → **30 of 30 test files pass; 505/505
  tests pass** ✓ (was 479/479 before this slice — 26 new assertions added).

## Next-slice read list (DO NOT re-scan)

The agent doing Slice 4 (selection reducer) reads ONLY the files below.

- `apps/museum/src/lib/editor/museum-editor.types.ts` — the canonical
  discriminated unions. Adds types consumed by the new
  `EditorSelectionStore`.
- `apps/museum/src/lib/editor/helpers/validators-runner.ts` —
  `runOrFail<R>` API + `Extract<R, { ok: true }> | null` return type.
- `apps/museum/src/lib/editor/store/document-store.svelte.ts` — minimum
  re-read for the after-replace listener that the selection store will
  register against for `reconcile()`.
- `docs/refactor-audit/2026-07-28-museum-editor.md` §3.D — selection
  reducer parallel-tuple spec (corrected).
- `docs/agent-handoffs/2026-07-31-complete-refactor-slice-3-document-history-preview.md`
  — adjacent hand-off covers the document/history/preview peer-link that
  selection sits beside.

Slice 5 (`bind:` migration) reads:

- `apps/museum/src/lib/editor/store/session-state.svelte.ts` — 22 slots,
  Phase A mirror contract.
- `apps/museum/src/lib/editor/museum-editor.svelte.ts` (read-only) — only
  the inline-mutation mirror list below. Slice 5 deletes these inline
  mutations and converts the corresponding component `bind:` sites to
  handler calls.

## Type-signature changes visible to the next slice

`runOrFail<R extends { ok: boolean; message: string }>(session, validator)`
returns `Extract<R, { ok: true }> | null`. Callers destructure around
`ok: true` (the success variant retains it per Plan §3.F wording, with
the trade-off explained in Open Questions).

`museum-editor.types.ts` exports:

```ts
EditorCameraPreview =
  | null
  | CameraPreviewNode
  | CameraPreviewTransition
  | CameraPreviewConnection
  | CameraPreviewTour;
```

`EditorSessionState` is the home for 22 volatile UI slots — Slice 4 can
read these via `store.sessionView.X` without disturbing god's bind-truth
mirror.

## Known gotchas

- **Phase A inline-mutation mirrors cover 6 setter sites only.** The
  following eleven+ method bodies write `this.X = v` directly without
  `this.session.X = v`:

  - `toggleRoomTreeExpansion`
  - `toggleClusterTreeExpansion`
  - `removeClusterTreeExpansion`
  - `ensureRoomTreeExpanded`
  - `ensureClusterTreeExpanded`
  - `toggleCameraConnectionTreeExpansion`
  - `toggleCameraDirectionTreeExpansion`
  - `setTransformInteractionActive`
  - `setDirectPathInteractionActive`
  - `setDirectFramingInteractionActive`
  - `beginAssetPlacement` / `cancelAssetPlacement`
  - the four `focusX` methods (`focusRoom` / `focusPlacement` /
    `focusSelection` / `focusNavigationNode`)
  - `toggleCameraPan`, `toggleGrid`
  - `applyTransformTool`, `applyTransformSpace`
  - `cancelPendingNavigationCommand` (no setter yet — needs one)
  - `setNavigationHover`
  - inline lighting assignments inside `setupLightingPreset` (now mirrored)
  - `#expandActiveCameraDirection` private helper

  Slice 5 picks every one of these up at `bind:` removal time. Leaving
  inline mutations unmirrored is the audit-required choice for Slice 1
  debt; do not add `this.session.X = v` lines ad hoc.

- **`#viewKeyframeProgressDragInitialProgress`** (private on god file,
  ~line 521) — drag-identity initial-progress slot. Migrates when bind-removal
  drops the god file mirror.

- **8 → 7 validator sites drift.** Plan audit counted 8 occurrences at
  pre-slice lines `3279, 3330, 3343, 3359, 3387, 3490, 3529, 4115`. Line
  4115 is now `beginDocumentTransaction()` etc., with no validator.
  Current code has 7 sites. Slice 5 should not expect a ghost eighth site.

- **`runOrFail` keeps `ok: true` in success variant.** Plan §3.F said
  "strip `{ok: true}`". An earlier try with `Omit<Extract<...>, 'ok'>`
  regressed two test assertions (caller code in components would have
  broken too). Current shape retains `ok: true`; callers destructure
  around it. Acceptable deviation, documented for future polish.

- **`EditorValidator<T>` alias** removed in the polish pass. Only
  `EditorValidatorFailure` and `runOrFail` remain as public exports.

- **Lighting constants** (`EDITOR_VISITOR_LIGHTING`, `EDITOR_BRIGHT_LIGHTING`)
  stay on `museum-editor.svelte.ts` outside the type-only barrel.
  `session-state.test.ts` inlines matching constants. Consider a
  `museum-editor.constants.ts` if a third consumer appears.

- **`EditorTransformMode` import path split.** `session-state.svelte.ts`
  imports from `../editor-transform.ts`; god file re-exports via
  barrel. Canonical home is `editor-transform.ts`; Slice 6 collapse
  deletes the god-file re-export.

## Open questions for next slice

- (non-blocking) Compose a `private mirror(slot, value)` helper on the
  composition root to dedupe the `this.X = v; this.session.X = v`
  dance once Slice 5 lands and bulk-replaces inline mutations.
- (non-blocking) `runOrFail` could expose a second helper
  `runOrFailDoing<R, Out>(s, validator, onSuccess: (plan) => Out): Out | null`
  if a future Slice 4 site wants to return the plan fields rather than
  re-narrow them.
- (Slice 4 prep) The selection reducer's `setWorkspace`/`setNavigation`
  callbacks should call into session-state directly, not via the god
  file's `selectX` methods, to avoid Phase A mirror drift when bind-
  removal lands.

## Phase A contract reminder

Per audit §3.G, **Phase B** (Slice 5) deletes the god file's parallel
`$state` field for each migrated slot, converts component `bind:` sites to
`oninput` / `onclick` handlers, and the session becomes the only owner.
Until then, god's `bind:value={store.X}` is the truth.
