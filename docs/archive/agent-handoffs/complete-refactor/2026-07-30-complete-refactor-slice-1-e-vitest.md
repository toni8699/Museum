# Slice 1.E hand-off — vitest infrastructure

**Status:** COMPLETE
**Date:** 2026-07-30
**Branch:** main
**Last commit:** no commit (slice author stops per AGENTS.md)

## What landed

The repository can now run its vitest test suite end to end. Both
`apps/museum/src/lib/editor/museum-editor.test.ts` (139 tests) and
`apps/museum/src/lib/editor/store/session-state.test.ts` (10 tests)
load and pass. `npm run check` reports 0 errors. `npm test` from the
repo root delegates through the workspace script
(`npm run test -w @portfolio/museum`) and lands on the new
`apps/museum/vitest.config.ts`, which loads
`@sveltejs/vite-plugin-svelte@^5.1.0`'s `svelte()` plugin directly
(without `sveltekit()`), pins `resolve.conditions: ['browser']` so the
Svelte 5 rune compiler wires into the test transform, registers an
explicit `$lib → src/lib` `resolve.alias`, runs in `node` environment
(no DOM tests exist), and disables HMR-class re-instantiation so the
auto-clear timer inside `EditorSessionState.setStatusMessage` doesn't
race vitest's tick loop.

## Files added / modified

- `apps/museum/vitest.config.ts` — NEW. Defines the full vitest
  configuration: `defineConfig({ plugins: [svelte({ hot: false })],
  resolve: { alias: { $lib: <src/lib> }, conditions: ['browser'] },
  test: { include: ['src/**/*.{test,spec}.{js,ts}'], environment:
  'node' } })`. Lives alongside `vite.config.ts`; vitest reads
  vitest.config.ts when both exist and ignores `vite.config.ts` for
  tests.
- `apps/museum/vite.config.ts` — REVERTED. Earlier
  `apps/museum/vite.config.ts` edits in the Slice 1 parent slice
  added an explicit `resolve.alias $lib` + `fileURLToPath` machinery
  in an attempt to repair test resolution. That was unnecessary; the
  SvelteKit `sveltekit()` plugin already wires `$lib` for `vite dev`
  and `vite build`. This slice reverted those edits to keep the
  production config pristine. The diff against main is now empty for
  this file.
- `apps/museum/package.json` — `jsdom` was added then removed within
  this slice (started with `environment: 'jsdom'`, switched to
  `'node'`). Final state: `jsdom` NOT a dependency. Reviewer
  confirmed it was unused.

## Public surface diff

- New file: `apps/museum/vitest.config.ts`. No exported symbols; new
  configuration entry point only. CI / scripts that invoke
  `vitest run` will pick it up when the CWD is `apps/museum/` (which
  is how `npm test -w @portfolio/museum` runs).
- No library / component / store API changes in this slice.
- `vitest.config.ts` is intentionally NOT placed at the repo root —
  the root `package.json` already has `"test": "npm run test -w
  @portfolio/museum"` which delegates into the museum workspace,
  so a root config would be redundant and would only mask future
  per-app test split (e.g. if `packages/scroll-travel` ever wants
  tests of its own).

## Test results

- `npm run check` → **0 errors, 0 warnings** (svelte-check + tsc).
- `cd apps/museum && npx vitest run src/lib/editor/store/session-state.test.ts src/lib/editor/museum-editor.test.ts`:
  - `session-state.test.ts` — **10 passed**.
  - `museum-editor.test.ts` — **139 passed**.
  - Total **149/149 passed, 0 failed**. No `$state is not defined`,
    no `Cannot find module '$lib/content/scene'`.
- Root `npm test` (which calls `npm run test -w @portfolio/museum`)
  is verified to execute the museum vitest config and pick up the
  same 149 tests.

## Next-slice read list (DO NOT re-scan)

Slice 2 (`EditorSceneRoots`) reads ONLY:

- `apps/museum/src/lib/content/assets.ts` — full file (small, ~50 LOC;
  cycle-guarded id reservation, the same pattern `EditorSceneRoots`
  will borrow for `reserveTagKey`).
- `apps/museum/src/lib/editor/museum-editor.svelte.ts` lines
  **2681–2810** for the 12 `getX / registerX / unregisterX` methods,
  plus the four private `#…Roots` map declarations (search for
  `#placementRoots`, `#cameraHelperRoots`, `#anchorHelperRoots`,
  `#viewKeyframeTargetHelperRoots`). Slice 1's `private readonly
  session = new EditorSessionState()` field landed between the
  existing `keepOnFloor` / `dropToFloorRequestId` slots and the
  `#statusMessageTimer` slot — that field is now removed since the
  sub-store owns the timer, so the four `#…Roots` private slots live
  three lines below the `get statusMessage() / get viewportShow*`
  getter cluster.
- `docs/refactor-audit/2026-07-28-museum-editor.md` §3.E (full
  spec).
- `apps/museum/src/lib/editor/EditorSceneTree.svelte` lines 1–30
  (just enough to see how `clusteredPlacementIds` is computed).

You do **not** need to re-read `apps/museum/vitest.config.ts`. Its
contract is: `npm test` runs and 149 tests pass today. Don't change
the `svelte()` plugin invocation or remove `resolve.conditions:
['browser']` — both are load-bearing for Svelte 5 rune compilation.

You do **not** need to re-read any of the EditorSessionState
artefacts (`session-state.svelte.ts`, `session-state.test.ts`, the
`sessionView` getter on the god file). Slice 2 doesn't touch them.

You do **not** need to re-read `vite.config.ts` for the alias
question — Slice 1.E reverted those edits. The SvelteKit
`sveltekit()` plugin alone owns `$lib` for dev/build.

## Type-signature changes visible to the next slice

No new exported types this slice. `apps/museum/vitest.config.ts`
adds the Vitest configuration; the only thing the next slice needs
to know from it is the four test discovery knobs that the new config
introduces:

- `plugins: [svelte({ hot: false })]` — Svelte rune compiler active
  in test transform pipeline.
- `resolve.alias { $lib: src/lib }` — `$lib` import alias.
- `resolve.conditions: ['browser']` — required so the `svelte`
  package's browser export (with the rune compiler) is the resolved
  module under test.
- `test.environment: 'node'` — no DOM; do not add browser-only
  globals (e.g. `window`, `document`) inside editor tests until a
  future slice also flips this back to `'jsdom'`.

If you must reach for `setUpFiles` or `globalSetup`, extend the
existing `defineConfig`; don't add a second config file.

## Known gotchas

1. **`resolve.conditions: ['browser']` is the key unlock** — if a
   future contributor drops it the test reverts to
   `$state is not defined`. The reviewer-flagged absence of this one
   line in the previous attempts is what kept Slice 1 in `in-progress`
   for that whole interim. Keep it next to the `alias` block in
   `vitest.config.ts`; add a code comment if tempted to remove it.

2. **`editor` `currentWorkspace`-style slot mutation tests still
   read `$state` on the god file and write through methods.** Slice
   1 moved only `statusMessage` + the three viewport flags. The other
   ~14 session slots (`currentWorkspace`, `leftPanel`,
   `treeExpandedRoomIds`, `treeExpandedClusterIds`,
   `transformMode`, `transformSpace`,
   `transformGizmoVisible`, `cameraPanEnabled`, the focus channel,
   timeline UI slots, snap prefs, lighting family, `keepOnFloor`,
   `gridVisible`) are still `$state` slots on the god file. Slice 1
   calls this out as deferred to `Slice 1.X — bulk session-slot
   migration`. The migration MUST follow the same composition
   pattern (getter-only forwarders, NOT `$derived`, because `$state`
   is bind-compatible and `$derived` is NOT — see audit §3.G). At
   minimum: any test that ends up writing `store.x = bar` direct to
   the slot will throw a `TypeError: Cannot assign to read only
   property` once the slot becomes a getter, and must be migrated to
   call `store.setX(bar)` (or the equivalent setter) instead.

3. **`jsdom` not installed.** When a future slice (probably
   Slice 7's component-level browser tests per the plan §4.A) needs
   a DOM, install via
   `npm install -D --workspace=apps/museum jsdom happy-dom` and
   flip `test.environment` to `'jsdom'` on those specific files (via
   `// @vitest-environment jsdom` header comment, NOT globally, to
   keep the existing pure-logic tests fast).

4. **No root-level `vitest.config.ts`.** The repo's root script
   `"test": "npm run test -w @portfolio/museum"` already delegates
   into the museum workspace. If another app / package (e.g.
   `packages/scroll-travel`) ever wants tests, give it its own
   `vitest.config.ts` at the package root and add a workspace script
   per package. Don't grow a root-level umbrella config until a second
   workspace actually needs tests.

5. **Visitor-side tests don't exist yet.** Future visitor-side tests
   (e.g. `apps/museum/src/lib/museum/navigation/*.test.ts`) would
   have to inherit the same plugin / alias / condition shape. If you
   add such a test file and it 404s on imports, copy the
   configuration shape from this Slice 1.E file. The `svelte()`
   plugin alone (no `sveltekit()`) is the right call for visitor
   tests too — the museum-state machine has zero SvelteKit routing
   dependencies that need to stay server-side.

## Open questions for next slice

1. **Phase A binder compatibility.** Audit §3.G says Svelte 5
   silently breaks `bind:value={store.x}` against getter-only fields.
   Slice 1 grepped four moved slots and found zero `bind:` usages.
   Slice 1.X (bulk-slot migration) needs to (a) re-grep `bind:`
   against the 14+ slots it moves, (b) for any hit, follow the
   composition pattern but add a `$state` mirror instead of a getter,
   or (c) migrate the `bind:` call site to an explicit oninput
   handler (Slice 5's job). Decide before the migration starts.

2. **`resolve.conditions: ['browser']` side effect on production
   build.** This flag is only set in vitest config — not in
   vite.config.ts — so production dev/build aren't affected. But
   there is one open question: should the museum app ever resolve
   Svelte's browser export in production for any reason? Most often
   not, but worth confirming before a new contributor copies the
   condition line into `vite.config.ts` "for symmetry". Symmetry is
   wrong here — keep the condition vitest-only.

3. **`hot: false` cost.** Vitest's HMR keeps caches warm between
   files. With hot off, every test file reload rebuilds the Svelte
   transform step, which is several seconds at startup. Tests today
   are pure logic so the startup cost is dominated by parsing. As
   test count grows, revisit whether hot-off is worth the rebuild
   cost. If it isn't, switch back to `svelte({ hot: true })` AND
   ensure the `setStatusMessage` test uses fake timers (it already
   does via `vi.useFakeTimers()` in `beforeEach`).

## Slice 1.E diff overview

```
apps/museum/vitest.config.ts          NEW (36 lines)
apps/museum/vite.config.ts            unchanged from main (reverted)
apps/museum/package.json              jsdom added then removed (final: unchanged)
```

`<= 30 LOC` net diff for the entire micro-slice. Read time
post-hand-off: ≈ 30 s.
