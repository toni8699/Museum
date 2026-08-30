# Tests — `apps/editor/tests/`

All Vitest suites live here, mirrored to `src/lib/`. A test for `src/lib/editor/editor-selection.ts`
sits at `tests/lib/editor/editor-selection.test.ts`. **No `.test.ts` files live under `src/`.**

## Import rules

1. **Import source modules via `$lib` aliases, never relative paths.** Tests are
   location-independent by design: `import { editorSelection } from '$lib/editor/editor-selection'`.
   The `$lib` alias is configured in `vitest.config.ts` and in the SvelteKit-generated
   tsconfig (inherited by `svelte-check`), so tests typecheck in place.
2. **Relative imports are reserved for sibling test helpers and fixtures** that move
   together with the test (e.g. `./__fixtures__/layout-g1-fixtures`).
3. No extension on imports: `allowImportingTsExtensions` is off, so
   `'$lib/editor/editor-selection'` not `'$lib/editor/editor-selection.ts'`.

## What lives here vs in `src/`

| Thing | Where |
|---|---|
| Test suites | `tests/lib/...`, mirrored to `src/lib/...` |
| Test-only helpers (`editor-test-utils.ts`, `layout-a1-fixtures.ts`) | `tests/lib/...` next to their consumers |
| Fixtures (`__fixtures__/` dirs with `.ts` + `.json`) | `tests/lib/.../__fixtures__/` |
| Modules imported by both tests **and** `src/` | stay in `src/lib/` (e.g. `bench-types.ts`, `plan-bench.ts` — used by the dev perf route) |

If a helper starts being imported from `src/`, move it back to `src/lib/` and flip the
imports back to `$lib`.

## Caveats

- **Boundary tests walk `src/` via `import.meta.url`** (`bench-boundary`,
  `plan-render-boundary`, `layout-geometry-boundary`, `visitor-import-boundary`,
  `editor-store-bind-migration`, `wall-mesh-builder`). They compute roots as
  `resolve(import.meta.url, '../../../src')` — update them if `tests/` moves.
- **The dev perf route** (`src/routes/dev/perf/+page.svelte`) imports scale fixtures
  from here via a relative path. Keep that in sync if fixtures move.

## Running

```bash
npm test        # vitest run (include pattern: tests/**/*.{test,spec}.{js,ts})
npm run check   # svelte-check — picks up tests/ via the generated tsconfig
```
