# Slice 8 hand-off — polish (hooks + project menu + shortcuts)

**Status:** COMPLETE (final polish slice of 2026-07-28 refactor plan)
**Date:** 2026-07-31
**Branch:** main
**Last commit:** no commit (dirty working tree includes 7.B + 8; user decides)

## What landed

| Deliverable | Path | Notes |
|-------------|------|-------|
| Preview hooks | `hooks/use-camera-preview.svelte.ts` | `useDirectorPreview` + `useVisitorPreview` (shared sample via optional 2nd arg) |
| Timeline hook | `hooks/use-camera-timeline.svelte.ts` | `useCameraTimeline` — playhead / scrub / transport flags |
| Shortcuts | `hooks/shortcuts.svelte.ts` | `createEditorShortcutHandler` + `registerEditorShortcuts(store, host)` |
| Rig | `EditorCameraRig.svelte` | Uses director/visitor hooks for sample/follow/recenter |
| Timeline split | `EditorCameraTimelinePanel` → `Ruler` + `Dots` | Panel ~40 LOC composer |
| Project menu | `EditorProjectMenu.svelte` | Extracted from AppBar; `bind:open` |
| App shell | `MuseumEditorApp.svelte` | Inline keydown → `registerEditorShortcuts` |

Escape cascade (audit F16 / §7 #4) preserved:

`cameraPreview Escape → stop` then `cancelPendingNavigation → cancelAssetPlacement → finishAnchorEditing → finishViewKeyframeEditing → deselect`.

## Files added / modified

**NEW**

- `apps/museum/src/lib/editor/hooks/use-camera-preview.svelte.ts`
- `apps/museum/src/lib/editor/hooks/use-camera-timeline.svelte.ts`
- `apps/museum/src/lib/editor/hooks/shortcuts.svelte.ts`
- `apps/museum/src/lib/editor/EditorCameraTimelineRuler.svelte`
- `apps/museum/src/lib/editor/EditorCameraTimelineDots.svelte`
- `apps/museum/src/lib/editor/EditorProjectMenu.svelte`

**REWRITE / slim**

- `EditorCameraRig.svelte`
- `EditorCameraTimelinePanel.svelte`
- `EditorAppBar.svelte`
- `MuseumEditorApp.svelte`
- `museum-editor-shell.test.ts` (Escape cascade specs)
- `docs/refactor-audit/2026-07-28-refactor-plan.md` (§8 checkboxes)

Plus uncommitted Slice 7.B panels still in tree (see 7.B hand-off).

## Test results

- `cd apps/museum && npx vitest run src/lib/editor` → **398 passed / 25 files** (+2 Escape cascade)
- `npm run check` → **0 errors / 0 warnings**
- Browser smoke: still removed (Slice 6 decision)

## Post-refactor LOC (closing summary)

Plan end-state claimed `museum-editor.svelte.ts` ≈ 600 LOC. **Not reached** — facade still **4511** after Slices 1–8. Sub-stores exist under `store/` but many document/nav/mutation methods remain on the composition root.

| Area | LOC | Smell |
|------|----:|-------|
| `museum-editor.svelte.ts` | 4511 | Still god facade; further method extraction = future work, not Slice 8 |
| `EditorSelection.svelte` | 1011 | 7.A skipped (user directive) |
| `EditorCameraRig.svelte` | 511 | Three.js preview runtime; hooks only peel store coupling |
| `camera-preview-controller` | 683 | Largest sub-store; OK |
| `selection-actions` | 519 | Fat but cohesive |
| `EditorCameraTimelineDots` | 402 | Lane + key-drag logic |
| `GuidedTourPanel` | 360 | From 7.B |
| `EditorTransformControls` | 456 | Audit §4.E left as-is |
| `EditorCameraInspector` | 448 | Untouched this plan |
| Hooks (3 files) | ~396 | New |

**What Slice 8 did achieve:** seams for preview/timeline UI + testable shortcut cascade + project menu isolation. No store API change. No `bind:` churn.

## Known residual smells (next work, not this plan)

1. **Facade still ~4.5k** — next phase should lift remaining mutation/nav methods into focused modules; do not grow the root.
2. **7.A still open** — `EditorSelection.svelte` ~1011.
3. **Rig / TransformControls / CameraInspector** still >400 LOC each.
4. **Plan LOC targets** (Rig → 300, root → 600) were optimistic; treat seams as success metric, not raw LOC.
5. Optional: export `cameraDirectionTreeKey` (`::`) from helpers (7.B open question).

## Gotchas

- Hooks close over **stable store instance**; `svelte-ignore state_referenced_locally` on call sites.
- Do **not** object-spread sampler returns (kills getters) — director hook redeclares getters explicitly.
- `registerEditorShortcuts` needs DOM host getters (viewport / outliner / cluster name input).
- Shortcuts live **app shell only** — not GuidedTourPanel.

## Next

Refactor plan Slices 1–8 **done** (7.A optionally deferred). Future editor work = feature / further facade thinning outside this plan.
