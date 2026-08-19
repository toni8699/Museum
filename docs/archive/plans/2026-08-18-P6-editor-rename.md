# P6 — Editor artifact rename (de-H1)

**Date:** 2026-08-18
**Status:** Shipped (2026-08-18) — executed; gate green (1690 tests, svelte-check 0/0, build clean)
**Tracker:** [`docs/plans/README.md`](../../plans/README.md) — **P6**, shipped

## Outcome

The letter-era "H1" naming is removed from the editor artifact. The successor
editor shell (`src/lib/editor/h1/`, `tests/lib/editor/h1/`) is renamed to
`src/lib/editor/app/` with durable product names, and the "H1 S#" slice
provenance comments are stripped to their descriptive bodies. **Zero behavior
change** — pure paths, symbols, and comments. This lands before **P1.1** so the
shell-inversion slice's diff stays behavior-only and the domain×view shell
lands on the clean names.

## Increments

| ID | Content | Depends |
|---|---|---|
| **P6.1** | Mechanical rename: `git mv` + import/symbol updates + comment scrub | — |

## Naming

| Now | After |
|---|---|
| `src/lib/editor/h1/` | `src/lib/editor/app/` |
| `H1EditorApp.svelte` | `EditorApp.svelte` |
| `H1AppBar.svelte` | `EditorAppBar.svelte` |
| `H1Sidebar.svelte` | `EditorSidebar.svelte` |
| `H1PlanView.svelte` | `PlanWorkspace.svelte` (distinct from the `LayoutPlanViewport` it wraps) |
| `H13DView.svelte` | `Workspace3DView.svelte` (P1.1 splits it per domain, so keep it neutral) |
| `active-editor-selection.svelte.ts` · `editor-view-mode.ts` · `editor-view-state.svelte.ts` | unchanged names, moved with the dir |
| `tests/lib/editor/h1/` | `tests/lib/editor/app/` |

## Gates

- **P6.1 gate:** full test suite green + `svelte-check` 0 errors/warnings + build
  clean — the rename is invisible to behavior, so the suite is the gate.

## Boundaries

- **Relic freeze:** files under the frozen `/museum` relic surface (including
  `MuseumEditorApp.svelte` and its `h1/H1EditorApp` comment mention) stay
  **byte-for-byte untouched** — F7 relic isolation. The rename does not reach
  into the relic.
- The three non-H1-named modules change paths only, not names.
- HTML `<h1>` headings and bench `H1` heading types are **not** the artifact —
  untouched.

## Out of scope (deferred)

- **Standalone S# slice codes** (e.g. `S10.1.6 —` comments without an H1
  prefix) stay — the full letter-era sweep is a separate decision.
- `MuseumEditorApp` itself is not renamed (relic).
- Doc provenance: archived plans and the P4 plan's "deferred from H1" wording
  stay as historical record.

## Definition of done (P6 close)

- No `H1`/`h1` reference remains in live (non-relic) code or live docs; the
  "H1 S#" provenance comments are stripped to their bodies.
- All imports updated; full suite green, `svelte-check` 0, build clean.
- Tracker marks **P6 shipped**; this doc moves to archive with a stub.
