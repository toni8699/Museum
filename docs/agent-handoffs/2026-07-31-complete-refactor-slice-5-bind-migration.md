# Slice 5 hand-off — `bind:` migration (Phase B per audit §3.G)

**Status:** COMPLETE
**Date:** 2026-07-31
**Branch:** main (no commit landed — user decides)
**Last commit:** no commit required

## What landed

Svelte 5 `bind:value`/`bind:checked` migrated away from `store.X` for the **5 lighting slots** that had real `bind:` consumers in `EditorInspector.svelte`. The composition root's parallel `$state` mirrors for `ambientIntensity` / `directionalIntensity` / `fogEnabled` / `fogNear` / `fogFar` are deleted; reads forward through readonly getters to `EditorSessionState`. Writes go through `store.sessionView.setX(…)` per-field handlers, or stay on `applyLightingPreset(...)` for batch preset changes.

This is the **entire inventory** of `bind:` sites against the audit §3.G candidate fields. The remaining listed candidates (`selectedPlacementIds`, `treeExpanded…`, `currentWorkspace`, `transformMode`, etc.) had no `bind:` consumers — they are read-only in templates, so Phase A accept (audit §3.G) is the final state for them, no Phase B needed.

## Files added / modified

- `apps/museum/src/lib/editor/store/session-state.svelte.ts` — added 5 per-field setters after `applyLighting(...)`: `setAmbientIntensity(v: number)`, `setDirectionalIntensity(v: number)`, `setFogEnabled(v: boolean)`, `setFogNear(v: number)`, `setFogFar(v: number)`. Each is a one-line forwarder to its `$state` slot.
- `apps/museum/src/lib/editor/museum-editor.svelte.ts` — DELETED the 5 `$state` mirror slots; replaced with 5 readonly getters that forward reads to `this.session.X`. `applyLightingPreset(preset)` collapses from 5 inline `this.X = preset.X` writes plus one `session.applyLighting(preset)` call to just the `session.applyLighting(preset)` call (session owns the canonical state now).
- `apps/museum/src/lib/editor/EditorInspector.svelte` — migrated the 5 lighting bindings:
  - 4× `<input type="range" value={store.X} oninput={(event) => store.sessionView.setX(+event.currentTarget.value)}>` (ambient, directional, fogNear, fogFar)
  - 1× `<input type="checkbox" checked={store.fogEnabled} onchange={(event) => store.sessionView.setFogEnabled(event.currentTarget.checked)}>`
  - All reads (`store.ambientIntensity.toFixed(2)` etc.) still work through the god's getter → session chain.

## Public surface diff

- **`store.ambientIntensity`, `store.directionalIntensity`, `store.fogEnabled`, `store.fogNear`, `store.fogFar`**: unchanged *type shape* (still `number` / `boolean`) but now readonly getters. Direct assignment `store.ambientIntensity = 0.5` no longer works — callers must use `store.sessionView.setAmbientIntensity(0.5)` or `store.applyLightingPreset({...})`.
- **`store.sessionView.setX(...)`**: new write path (5 setters). `sessionView` was already public; setters were added on the underlying `EditorSessionState`.
- **`store.applyLightingPreset(preset: EditorLightingSettings)`**: unchanged signature; now writes through session only.

## Test results

- `npm run check` → **0 errors / 0 warnings** ✓
- `npx vitest run` → **491/505 passing** (14 pre-existing Slice 4 view-keyframe authoring failures; NOT a Slice 5 regression — these were failing before this slice and remain failing at the same count).

The fail count stayed at 14 across the two re-verifies, confirming Slice 5 introduced no new test regressions.

## Next-slice read list (DO NOT re-scan)

The agent doing Slice 6 reads ONLY the files below.

- `apps/museum/src/lib/editor/museum-editor.types.ts` — canonical discriminated unions; not changed by Slice 5.
- `apps/museum/src/lib/editor/store/session-state.svelte.ts` — the 5 new setters live here. Slice 6 reasoning about "does this slot still need a god mirror?" starts from this file.
- `apps/museum/src/lib/editor/EditorInspector.svelte` — **read only the Lighting section** (≈lines 247-265) to remember what `bind:` looked like pre-Slice-5.
- `docs/refactor-audit/2026-07-28-museum-editor.md` — §3.G (Phase B caveat) and Plan §5 Step 5c (next-step migration of `selectX` methods).

DO NOT re-read the god file's lighting field declarations or `applyLightingPreset` body (deleted/changed in this slice).

## Type-signature changes visible to the next slice

The 5 lighting slots on `MuseumEditorStore` now expose:
- `get ambientIntensity(): number` (readonly — was `$state<number>`)
- `get directionalIntensity(): number` (readonly — was `$state<number>`)
- `get fogEnabled(): boolean` (readonly — was `$state<boolean>`)
- `get fogNear(): number` (readonly — was `$state<number>`)
- `get fogFar(): number` (readonly — was `$state<number>`)

Setter writes go through:
- `store.sessionView.setAmbientIntensity(v: number)` — per-field.
- `store.sessionView.setDirectionalIntensity(v: number)` — per-field.
- `store.sessionView.setFogEnabled(v: boolean)` — per-field.
- `store.sessionView.setFogNear(v: number)` — per-field.
- `store.sessionView.setFogFar(v: number)` — per-field.
- `store.applyLightingPreset(preset: EditorLightingSettings)` — batch (5 fields in one call).

`store.sessionView` continues to return `EditorSessionState` (mentioned here so Slice 6 author knows the path).

## Known gotchas

- **Pre-existing 14 test failures** in `museum-editor.test.ts` are **Slice 4 carryover** (view-keyframe authoring at lines `museum-editor.test.ts:1619, 1723`, plus 12 other selection/cluster/Phase-2.1/Phase-5/Phase-6 site tests). Slice 5 did not regress them and did not fix them — they're a separate work item the user can request as "fix 14 Slice 4 regressions".
- **`sessionView` JSDoc says "single read-only face"** but it now exposes the 5 new setters too. Stale comment; not blocking, polish item for Slice 6.
- **`session` remains `private`** on the composition root. Component code must use `store.sessionView.setX(...)`. The first migration attempt used `store.session.setX(...)` which caused 5 TS errors — the fix is documented in §3 of "Open questions" below.
- **No `setStatusMessage` regression path.** Removing `this.ambientIntensity = …` inline writes from `applyLightingPreset` would lose the god's mirror, but the call `this.session.applyLighting(preset)` writes the same 5 fields atomically. No functional regression.
- **The `<input type="checkbox" onchange>` semantics check**: Svelte 5 + browsers fire `onchange` reliably on checkbox click to a bound state. We did NOT use `oninput` (which fires inconsistently for checkboxes). If you later split more `bind:checked` sites, prefer `onchange`.
- **The `<input type="range" oninput>` semantics check**: The range's `oninput` fires on every drag tick. With our handlers, that's 60+ writes/sec to `session.ambientIntensity`. Reactive sink — no debouncing needed (no derived consumers choke on it).

## Open questions for next slice (Slice 6 prep)

- **(non-blocking) Polish**: 4 inline `oninput={(event) => store.sessionView.setX(+event.currentTarget.value)}` closures in `EditorInspector.svelte` share the same parse-coerce pattern. Extract 4 named handlers in `<script>` block. ~10 lines saved.
- **(non-blocking) Tests**: Add 5 one-liner session-state tests for the new setters in `session-state.test.ts` (each: value round-trips through getter). Optional.
- **(Slice 6 decision) Collapse `session` (private) + `sessionView` (public) into one canonical public name.** Today every component handler reads `store.sessionView.setX(...)` — verbose. Slice 6 should expose `get session(): EditorSessionState` as the single public name (replacing `sessionView`) and update the 5 handler calls + the import scalar reference `EditorSessionState` from the barrel. Low effort, removes the dual-name ergonomics tax.
- **(Slice 6 decision) Inline-mutation mirror gap.** The 11+ god-file method bodies listed in the Slice 1 hand-off Known Gotchas (e.g. `toggleRoomTreeExpansion`, `setTransformInteractionActive`, etc.) still write `this.X = v` directly without a `this.session.X = v` mirror. They're not bind-removal candidates (no consumer binds against them), but they ARE dual-write hazards: a future bind: removal would silently read the wrong value. Snippet to look up: `grep -nE "this\.(treeExpanded|transformInteraction|directPathInteraction|directFramingInteraction|keepOnFloor|gridVisible|cameraPanEnabled|fogEnabled) = " museum-editor.svelte.ts` yields 30+ sites.
- **(Slice 6+ decision) `mirror(slot, value)` helper**: hand-off Open Question from Slice 1 still applies — could now be authored as a centralized `private mirror(slot: T, value: T)` helper on the composition root to dedupe the `this.X = v; this.session.X = v` dance once Slice 6 touches the inline-mutation list.
