# Slice 5 hand-off — `bind:` migration (Phase B per audit §3.G)

**Status:** COMPLETE
**Date:** 2026-07-31
**Branch:** main (no commit landed — user decides)

## What landed

Svelte 5 `bind:value` / `bind:checked` against **session-owned store fields** is
gone. Phase B deletes the composition-root `$state` mirrors and routes writes
through `EditorSessionState` setters.

### Inventory (5.1) — `bind:` against `store.*`

| Component | Field | Disposition |
|-----------|-------|-------------|
| `EditorInspector.svelte` | `ambientIntensity`, `directionalIntensity`, `fogNear`, `fogFar` | migrated → `value` + `sessionView.setX` |
| `EditorInspector.svelte` | `fogEnabled` | migrated → `checked` + `sessionView.setFogEnabled` |
| `EditorPlacementInspector.svelte` | `translationSnapEnabled`, `rotationSnapEnabled`, `keepOnFloor` | migrated → `checked` + `sessionView.setX` |
| Plan candidate list (`selectedPlacementIds`, `navigationSelection`, tree expansion, workspace, transformMode, …) | — | **no `bind:` consumers** — Phase A accept is final |

Remaining `bind:` in `apps/museum/src/lib/editor/**/*.svelte` are **only**:
`bind:this`, Threlte `bind:ref`, local component state (`query`, `labelDraft`,
`clusterNameDraft`, …), or child `bind:controls` — **not** store session/selection
fields.

### Also fixed this close-out

- Session `translationSnap` default was wrongly `0.5`; aligned to
  `DEFAULT_TRANSLATION_SNAP` (`0.1`) from `editor-placement.ts`.
- God-file snap / keep-on-floor / drop-request `$state` deleted; facade
  getters (+ setters for test/JS assignment) forward to session.
- `toggleActiveTransformSnap` / `requestDropToFloor` write session only.

## Files added / modified

### New

- `apps/museum/src/lib/editor/museum-editor-bind-migration.test.ts` — contract
  smoke: zero `bind:(value|checked)={store.` in editor Svelte files; lighting +
  snap write paths round-trip through `sessionView`.

### Modified

- `apps/museum/src/lib/editor/store/session-state.svelte.ts` — correct snap
  defaults; `setTranslationSnapEnabled` / `setRotationSnapEnabled` /
  `setKeepOnFloor` for checkbox absolute writes.
- `apps/museum/src/lib/editor/store/session-state.test.ts` — default + setter
  coverage.
- `apps/museum/src/lib/editor/museum-editor.svelte.ts` — Phase B snap facade.
- `apps/museum/src/lib/editor/EditorPlacementInspector.svelte` — 3 checkbox
  binds → `checked` + `onchange` handlers; selects write via `sessionView`.
- `apps/museum/src/lib/editor/EditorInspector.svelte` — lighting binds
  (already migrated earlier in the slice).

## Public surface diff

- Snap / keep-on-floor / drop-request on `MuseumEditorStore`: still readable as
  `store.X`; JS assignment `store.X = v` still works (setter → session). Prefer
  `store.sessionView.setX(v)` from components.
- New session setters: `setTranslationSnapEnabled`, `setRotationSnapEnabled`,
  `setKeepOnFloor` (plus existing `setTranslationSnap` /
  `setRotationSnapDegrees`).

## Test results

- `npm run check` → **0 errors / 0 warnings**
- `npx vitest run` (museum) → editor + store suites green (includes bind-migration
  contract file)

## Browser smoke (plan §5.5) — deferred with reason

`@vitest/browser` / Playwright are **not** in `apps/museum/package.json`. Adding
them + a SvelteKit `webServer` for `/dev/museum-editor` is a separate infra
task. Unit contract smoke above covers the migrated write paths and the
zero-`bind:store` inventory gate.

To land real browser smoke later:

```bash
npm i -D -w @portfolio/museum @vitest/browser playwright
# then vitest projects split + museum-editor-bind-migration.browser.test.ts
```

## Next-slice read list (DO NOT re-scan)

Slice 6 reads:

- `apps/museum/src/lib/editor/store/selection-store.svelte.ts` — selection
  reducer (Slice 4; green after direction/room fixes).
- `apps/museum/src/lib/editor/store/session-state.svelte.ts` — Phase B owners
  for lighting + snap.
- `docs/refactor-audit/2026-07-28-refactor-plan.md` — Slice 6 (`selectX` delete).

DO NOT re-read god-file lighting/snap `$state` declarations (deleted).

## Known gotchas

- Inline-mutation gap on remaining god `$state` (tree expansion, transform,
  workspace chrome, …) still dual-writes vs session for non-bound fields —
  Slice 6+ cleanup, not bind-blockers.
- `sessionView` JSDoc still says “read-only face” but exposes setters — polish.
- Plan wording “`bind:` is zero across editor” is **false** if counted literally
  (`bind:this` etc.); correct gate is zero `bind:(value|checked)={store.`.

## Open questions for Slice 6

- Collapse `session` / `sessionView` naming.
- Delete legacy `selectX` once tests assert `selection.workspace` /
  `selection.navigation` directly.
- Optional: wire `@vitest/browser` smoke against `/dev/museum-editor`.
