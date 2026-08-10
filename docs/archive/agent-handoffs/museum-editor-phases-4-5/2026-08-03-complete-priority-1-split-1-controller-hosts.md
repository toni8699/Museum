# Priority-1 Split 1 — Controller Hosts Extraction

**Status:** Complete
**Date:** 2026-08-03
**Plan:** [`../superpowers/plans/2026-08-03-priority-1-file-splits.md`](../superpowers/plans/2026-08-03-priority-1-file-splits.md)

## What landed

Extracted the seven private `#createXxxHost()` object-literal factories from
`MuseumEditorStore` (~524 LOC of pure host wiring) into a new module:

- `apps/museum/src/lib/editor/store/controller-hosts.ts` (new, 656 LOC):
  - `EditorControllerHostSource` — one structural interface listing every
    facade member the seven host literals read or write (guards, document/scene/
    state, selection-store, sub-controllers, selection reads, session-backed
    read/write slots, and the facade methods hosts call back into).
  - `EditorControllerHostBridges` — the two ECMAScript-private method bridges
    (`prepareCameraPreview`, `seedEmptyReverseForSelectedForwardTrack`) that
    are invisible through a structural cast.
  - `createControllerHosts(source, bridges)` — module-level factory returning
    `{ selection, navigationGraph, viewKeyframe, cameraTimeline, placementCluster,
    pathAnchor, materialResource }`, each literal `satisfies` its controller's
    `*Host` interface.
- `apps/museum/src/lib/editor/museum-editor.svelte.ts` (3 640 → 3 148 LOC):
  - Seven `#createXxxHost()` methods deleted.
  - One `private readonly hosts = createControllerHosts(this as unknown as
    EditorControllerHostSource, { bridges })` field; the store satisfies the
    source interface structurally via a single cast.
  - Constructor instantiations rewired to `this.hosts.selection` etc.
  - Seven now-unused `type *Host` imports removed from the import block.

No behavior change: host literals are byte-for-byte identical to the originals
(`self.X` → `source.X`), and the factories were previously invoked exactly once
each in the constructor, so building them once per store instance is equivalent.

## Files touched

- Create `apps/museum/src/lib/editor/store/controller-hosts.ts`
- Modify `apps/museum/src/lib/editor/museum-editor.svelte.ts` (imports, hosts
  field, constructor wiring, factory deletion)

## Verification evidence

- Typecheck: `npx tsc --noEmit -p apps/museum/tsconfig.json` — clean
- Focused store suites (10 files): **314/314 passed**
  (`museum-editor.test.ts` 169, `selection-actions` 20, `selection-store`,
  `session-state` 51, `history-controller`, `camera-preview-controller`,
  `document-store`, `mutation-guards` 4, `scene-roots`, `material-resource-mutator`)
- Full suite: **40 files / 660 tests passed**
- `npm run check -w @portfolio/museum`: **0 errors / 0 warnings**
- `git diff --check`: clean

## Notes / deviations from plan

- Plan Step 1 sketched the source interface listing facade members; the landed
  interface additionally exposes the four sub-controllers
  (`selectionStore`, `previewController`, `historyController`, `session`,
  `cameraTimelineController`) because the original literals referenced them
  directly (`self.selectionStore`, `self.previewController.*`,
  `self.historyController.*`, `self.session.*`, `self.cameraTimelineController.*`).
- Plan Step 2's "private getter or cast" hint resolved as a cast plus explicit
  bridges — the two `#`-private methods cannot appear on the structural
  interface, so the store binds them at the single call site.
- The interface keeps `navigationSelection` / `selectedClusterId` writable
  (the nav/placement host literals forward setter writes).

## Next slice

Slice 2 — extract preview + timeline playback commands to
`store/camera-preview-commands.svelte.ts`. The `#prepareCameraPreview` /
`#seedEmptyReverseForSelectedForwardTrack` bridges created here are the
hand-off points: Slice 2 moves `#prepareCameraPreview` into the new controller
and leaves a one-line facade delegate for `seedEmptyReverseForSelectedForwardTrack`
(`commitDocumentTransaction()` still calls it).
