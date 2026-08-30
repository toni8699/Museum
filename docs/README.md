# Museum docs — context router

**Audience:** agents + humans. **Last reviewed:** 2026-08-30 (P17 shipped; P3B.7b remains deferred; north star holds product vision).
**Bootstrap (hard rules):** [`../AGENTS.md`](../AGENTS.md) ·
**Plan status / what's next:** [`plans/README.md`](./plans/README.md) (tracker) ·
**Live working-tree state:** [`hand-off/CURRENT.md`](./hand-off/CURRENT.md) ·
**Roadmap gate:** P12, core P3B, P14, P15, and P16 are shipped. P3B.7b remains deferred and non-blocking; P13 remains proposed/unscheduled.

## Context discipline (progressive disclosure)

Do not preload the documentation tree. Start here, identify the task surface,
then read **only the referenced documents required for that task**. Archive is
historical evidence, not current product truth. A task should need 80–200
relevant lines, not the whole live tree.

## Truth precedence — when live docs conflict, highest wins

```text
source code + tests      → enforced reality
hand-off/CURRENT.md      → current working-tree state (uncommitted)
active plan              → intended current change
component contract       → stable subsystem behavior
architecture.md          → ownership / boundaries
north-star.md            → product direction
archive/                 → rationale only
```

Two separations: **status authority** (what's next) is the tracker's job, not
this chain's; **direction/priority conflicts are owner decisions**, not doc
conflicts — never "resolve" a product question by doc order.

## Decide what to read

| Task | Read |
|------|------|
| Implement current slice | [`hand-off/CURRENT.md`](./hand-off/CURRENT.md) → [`plans/README.md`](./plans/README.md) → active plan → relevant component |
| Work on a surface | relevant `components/<surface>.md` (`CURRENT.md` only if it touches current work) |
| Architecture / ownership question | [`architecture.md`](./architecture.md) → relevant component |
| Product / design question | [`north-star.md`](./north-star.md) → relevant component |
| UI / shell / workspace spec | [`Design-specs/Design-specs.md`](./Design-specs/Design-specs.md) (visual) · [`Design-specs/Design-shell-specs.md`](./Design-specs/Design-shell-specs.md) (global/cross-domain) · [`Shell-scene-workspaces.md`](./Design-specs/Shell-scene-workspaces.md) · [`Shell-camera-workspaces.md`](./Design-specs/Shell-camera-workspaces.md) (per-domain §6–§13) |
| Historical question | [`archive/`](./archive/) (opt-in; nothing here is current truth) |

## Folder map

```text
docs/
  README.md              ← this router (navigation, rules, meta)
  plans/README.md        ← plan tracker (status, order, archive stubs)
  plans/                 ← active (post-renewal) plans only
  hand-off/CURRENT.md    ← live working-tree delta
  Design-specs/          ← canonical UI design system + shell/workspace specs
  components/            ← one contract per surface
  architecture.md        ← ownership / boundaries + pointers
  north-star.md          ← final product vision only
  archive/               ← cold storage; linked only from here + tracker stubs
```

**Archive:** the only reference points are this folder link and the tracker's
one-line `archived → <path>` stubs. No live doc explains what is archived.

## Product surface

| Route | Role |
|---|---|
| `/` or `/editor` | Main editor, always ships in production |
| `/museum` | Frozen Chopin visitor relic (checked-in `chopin-project.json`) |
| `/museum/editor` | Frozen legacy editor relic (Scene · Camera, no Layout) |
| `/dev/materials` · `/dev/assets` · `/dev/perf` | Development previews / G3 harness |

The editor boots into a fresh empty project; no Chopin/legacy state is loaded
or migrated. Persistence is portable export/import only.

## Read what you need

| Surface | Contract doc | Key source |
|---------|--------------|------------|
| Shell / workspaces / timeline | [`components/shell.md`](./components/shell.md) · [`Design-specs/Design-shell-specs.md`](./Design-specs/Design-shell-specs.md) (+ per-domain [`Shell-scene-workspaces.md`](./Design-specs/Shell-scene-workspaces.md) / [`Shell-camera-workspaces.md`](./Design-specs/Shell-camera-workspaces.md)) | `apps/editor/src/lib/editor/app/` |
| Scene entities / materials / lights | [`components/scene-content.md`](./components/scene-content.md) | app-local `src/lib/content/` facades |
| Gizmo / placement / transforms | [`components/placement.md`](./components/placement.md) | `apps/editor/src/lib/editor/gizmo/` |
| Camera / tour / motion | [`components/camera-tour.md`](./components/camera-tour.md) | `packages/camera-core/src/` · visitor components in `apps/museum/src/lib/museum/navigation/` |
| Persistence / schema / history | [`components/persistence.md`](./components/persistence.md) | `packages/project-model/src/` · `packages/layout-core/src/` · app facades |
| Scene codec internals | [`components/scene-codec.md`](./components/scene-codec.md) | `packages/project-model/src/scene-codec/` · app facade |
| Assets / catalogue | [`components/assets.md`](./components/assets.md) | app-local `src/lib/content/assets.ts` |
| Tests | [`../apps/editor/tests/README.md`](../apps/editor/tests/README.md) | |

## Meta — how to write the hand-off and the next plan

**Hand-off (`hand-off/CURRENT.md`)** — strict template, live delta only:

```text
## Working tree    — what is in the tree right now (uncommitted)
## Next action     — tracker pointer + immediate artifact + any gate
## Verification    — test count, svelte-check, build state
## Known bugs      — live defects, one line each
## Traps           — terse gotchas that cost debugging time
## Non-negotiables — relic frozen, no commits unless asked, visitor purity
```

Lifecycle: on **slice open**, update Working tree + Next action. On **slice
close**, mark the tracker `shipped`, move the plan doc to `archive/plans/`,
keep the tracker's one-line stub, advance CURRENT's Status + Next action.
**Shipped narrative → archive, never CURRENT** (archive owns history).

**Sliding window:** CURRENT references only the **immediate previous slice**
(one back-pointer) and the **single next action** — never enumerate shipped
slices or the full plan sequence. History is chased backward through the
tracker's depends-on column (and each archived plan's own prerequisites);
archaeology follows the chain, it is not pre-loaded. Keep **Known bugs** /
**Traps** bounded — delete entries when resolved or deferred elsewhere.

**Next plan** — file `docs/plans/YYYY-MM-DD-P<number>-<slug>.md` — the
P-number is assigned on registration and carried in the filename (e.g.
`2026-08-18-P1-camera-overhaul.md`); the tracker
([`plans/README.md`](./plans/README.md)) owns its status, order, and
depends-on. Before implementing any increment,
write a brief covering: (1) user outcome and out-of-scope behavior, (2) source
components and existing APIs to reuse, (3) new props/state/dependencies, (4)
mount/unmount and selection semantics, (5) exact acceptance tests and manual
scenarios, (6) relic/Plan/visitor boundaries, and (7) rollback or fallback
split if the increment expands.

## Update rules

- Contract change → matching `components/*.md` or `architecture.md`.
- Plan status / order → [`plans/README.md`](./plans/README.md) (tracker).
- Working-tree delta → `hand-off/CURRENT.md`.
- Direction / priority change → owner decision, recorded as a scope decision
  and reflected in the tracker.
- Archive reference → only this router's link + tracker stubs; never explain
  what is archived inline.
