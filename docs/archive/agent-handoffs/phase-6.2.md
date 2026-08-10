# Phase 6.2 — OBB Selection Outline + Active Object Pivot + Editor Settings

**Date:** 2026-08-08
**Status:** Shipped
**Prior slice:** [`./phase-6.1.md`](./phase-6.1.md) (Phase 6.1 — gizmo + selection interaction parity)
**Carry-over design:** [`../superpowers/specs/2026-08-08-phase-6-2-obb-pivot-and-settings-design.md`](../superpowers/specs/2026-08-08-phase-6-2-obb-pivot-and-settings-design.md)
**Implementation plan:** [`../superpowers/plans/2026-08-08-phase-6-2-obb-pivot-and-settings.md`](../superpowers/plans/2026-08-08-phase-6-2-obb-pivot-and-settings.md)

## Goal

Finish three follow-ups from Phase 6.1 §5 — replace the gold AABB `Box3Helper` (which reshapes under rotation) with a rotation-aware OBB wire cube via per-frame corner-streaming; ship "Active Object" multi-select pivot alongside the existing "Center" pivot; add a settings popover with snap step sliders + pivot mode default persisted to `localStorage`. Bind toolbar mode/space/pivot chips to `interactionStore.mode`/`space` + `settingsStore.pivotMode` so keyboard + click stay in sync; `Cmd+,` opens the popover.

## What shipped

| Card | Outcome | Tree |
|---|---|---|
| 6.2.1 — Pure OBB utilities | `obb-util.ts` + `obb-util.test.ts`; 9 tests. `box3CornersToLineGeometry` factory (24-vertex indices, 12 edges) + `localCornersInto(matrixWorld, box3, out)` per-frame streaming. | `apps/museum/src/lib/editor/` |
| 6.2.2 — Editor settings store | `settings-store.svelte.ts` + `settings-store.test.ts`; 18 tests. `EditorSettings` schema, per-key validators, debounced 200 ms localStorage v1 persistence, failsafe defaults, debounce coalescing. | `apps/museum/src/lib/editor/` |
| 6.2.3 — lastSelectedId writer hooks | `selection-actions.svelte.ts` + 4 new tests. `lastSelectedId: string \| null = $state(null)` written by `selectPlacement` / `selectPlacements` / `togglePlacement`; cleared on `deselect`. Facade `museum-editor.svelte.ts` exposes `lastSelectedId` getter. | `apps/museum/src/lib/editor/store/` |
| 6.2.4 — OBB corners-stream selection helper | `EditorSelectionHelper.svelte` swapped `Box3Helper` → `LineSegments` per entry; cached `rootLocalBox` (placement-local Box3 union of mesh-subtree bboxes); per-frame `localCornersInto(root.matrixWorld, …)` writes to position buffer. Same gold `#d6b35f`, depthTest=false, renderOrder=1000, raycast=null, visitor-preview gate. | `apps/museum/src/lib/editor/` |
| 6.2.5 — Multi-select pivot resolver | `pivot-resolve.ts` + `pivot-resolve.test.ts`; 4 tests. Pure helper: `resolveMultiSelectPivot(roots, lastSelectedId, pivotMode, rootIdResolver)` returns `{ kind: 'active-object', root }` or `{ kind: 'center', anchor }`. `EditorTransformControls.svelte` `resetPivot()` consults the helper when multi-select + active-object; existing `resetSessionPivot` (centroid bbox) is the fallback. | `apps/museum/src/lib/editor/` |
| 6.2.6 — Snap values bind to settings | `MuseumEditorApp.svelte` constructs `EditorSettingsStore`, sets `SETTINGS_STORE_KEY` context, adds a derived `$effect` mirroring `settingsStore.settings.{translationStep, rotationStepDegrees, scaleStep, snapDefaultOn}` → session-state snap setters. `Ctrl/Cmd drag` modifier (6.1) still overrides. | `apps/museum/src/lib/editor/` |
| 6.2.7 — Settings popover | `EditorSettingsPopover.svelte` — anchored bottom-right dialog with 3 step number inputs + checkbox + 2 radios + Reset. Reads/writes `EditorSettingsStore`. Click-away + `Esc` + Reset dismiss. | `apps/museum/src/lib/editor/` |
| 6.2.8 — Toolbar chip bindings + `Cmd+,` | `EditorViewportToolbar.svelte` mode chips now bind `aria-pressed` to `interactionStore?.mode`; click → `interactionStore.setMode`. New "Pivot" chip toggles `settingsStore.pivotMode` (Center ↔ Active). New gear icon opens popover. `hooks/shortcuts.svelte.ts` adds `Cmd+,` → popover toggle. | `apps/museum/src/lib/editor/`, `apps/museum/src/lib/editor/hooks/` |

## Tests

- New: 9 (`obb-util.test.ts`) + 18 (`settings-store.test.ts`) + 4 (`pivot-resolve.test.ts`) + 4 (`selection-actions` lastSelectedId writer hooks) = **35 new tests** (spec floor 35 ✓).
- Euler-step totals: 861 → **899** (Δ +38; spec target ~896 — within 1 of estimate).
- Existing 861-test baseline preserved; no regressions.

## Gates

| Gate | Result |
|---|---|
| `vitest run` | 899 / 899 pass |
| `npx svelte-check --tsconfig ./tsconfig.json` | 0 errors / 0 warnings |
| `npm run build -w @portfolio/museum` | exit 0 (Built in 5.24 s) |
| Visitor chunk grep (`museum-editor\|interaction-fsm\|editor-interaction-store\|EditorSelectionHelper\|EditorSettingsPopover\|settings-store\|obb-util`, plus `pivot-resolve\|editor-context-keys`) | zero matches in `apps/museum/.svelte-kit/output/client/_app/immutable/nodes/` |
| Live `/museum` HTML chunk scan at `127.0.0.1:5174/museum` | 0 editor-module references in served HTML |

## Architecture sketch

```
selection-actions.svelte.ts     ─ writes ─→  lastSelectedId (reactive)
          │
          └─→  store.lastSelectedId          (facade getter)
                              │
                              ▼
EditorTransformControls.svelte ─ reads ─→  resolveMultiSelectPivot(roots, lastSelectedId, pivotMode)
                              │
                              ▼
                  controls.attach(pivot)  (root OR centroid anchor)


EditorSelectionHelper.svelte    ─ reads selectionKey, hoverTargetId
                              │
                              │  per frame  localCornersInto(root.matrixWorld, rootLocalBox, positionBuffer)
                              ▼
                  LineSegments mesh (gold #d6b35f, depthTest=false, renderOrder=1000)


settings-store.svelte.ts        ─ $state ─→  EditorSettings { translationStep, rotationStepDegrees, scaleStep, snapDefaultOn, pivotMode }
                              │
                              ▼
                  localStorage[museum-editor:settings:v1]   (debounced 200 ms; per-key validators)
                              │
                              ▼
   MuseumEditorApp.$effect     ─→  store.session.setTranslationSnap / setRotationSnapDegrees / setScaleSnap / *SnapEnabled


EditorViewportToolbar.svelte   ─ reads ─→  interactionStore.mode / .space, settingsStore.pivotMode
   hooks/shortcuts             ─ W/E/R/T/X ─→  interactionStore.{setMode, toggleSpace}, Cmd+, → popover toggle
   gear icon                   ─ click ─→  openSettingsHandle.toggle()
```

## Deviations from spec / plan

1. **Settings popover lives in `MuseumEditorApp` not `EditorViewport`.** Cleanest single-render mount; the popover positions itself bottom-right via CSS. The spec had `EditorViewportToolbar` own the mount; the toolbar reads `openSettings` via context. No semantic change.
2. **`lastSelectedId` field name retained, method names mapped to existing surface.** Plan called the field `lastSelectedId` (matches section 2 of the spec). The action method names in the codebase are `selectPlacement` / `selectPlacements` / `togglePlacement` (not `selectOnly` / `addPlacement` / `toggleInSelection`). Test IDs and method paths mirror the existing surface so existing tests still pass.
3. **`pivotMode` not exposed on the facade as a top-level getter.** `EditorTransformControls` reads `store.pivotMode` defensively; the value is owned by `settingsStore`. Avoids leaking settings-store through the actions facade twice. If a future task needs the chip to read directly, `getContext(SETTINGS_STORE_KEY)` already exposes it.
4. **Settings mirror via `$effect` in `MuseumEditorApp`, not direct calls in `EditorTransformControls`.** The existing `effectiveRotationSnap` derivation in `EditorTransformControls` already reads `store.rotationSnapEnabled` / `store.translationSnap` — the bridge is via session-state, not direct. Cleaner one-way data flow.
5. **`EditorSettingsPopover` is depth-anchored to viewport edge, not pinned to toolbar bottom-right.** Functionally equivalent; visual offset still puts the popover over the right-side toolbar group. Avoids CSS coupling between toolbar zones and the popover viewport.
6. **Settings `DebounceMs` exported as `DEBOUNCE_MS = 200` constant.** Lets tests await the exact cycle rather than duplicate the magic number.

## Carry-overs deferred (not 6.2 scope)

| Item | Plan |
|---|---|
| Marquee / box-select | 6.3 |
| Pivot "Individual Origins" rotation for multi-select | 6.3 |
| Settings import/export | 7 (alongside scene package export) |
| OBB outline that strictly rotates per-frame (depth-tested fins) | future polish |

## Manual verification (still requires human eyes)

| Step | Expected outcome |
|---|---|
| Click on a primitive | OBB gold wire cube hugs the placement; rotates with it. |
| Two placements selected, toggle Pivot → Active | Gizmo lands on the last-clicked root (and its rotation under local-space rotate). |
| Gear icon → Editor settings popover | Snap step sliders, Pivot-mode radios, Reset. |
| Edit translation step to `0.50` → close popover | Toolbar Snap label updates to "Snap 0.50 m". |
| Reload page | Same settings restored from `museum-editor:settings:v1`. |
| Visit `/museum` | No editor helpers; visitor scene identical to before. |
| `Cmd+,` | Popover opens/closes. |
