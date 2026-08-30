# P15 — camera-core extraction (slice 1 of the ratified migration)

**Status:** `shipped` — 2026-08-30; S0–S4 complete; slice 1 of the ratified
migration review
([2026-08-29-backend-persistence-migration-review.md](../../plans/2026-08-29-backend-persistence-migration-review.md)
§0.2, steps 1–2). Owner approved 2026-08-29 **with 4 amendments** (§Amendments):
minimum dependency surface, headless-core wording, explicit-graph API
tightening, and source vs. runtime boundary pins.
**Depends on:** P14 (shipped 2026-08-29) + the ratified migration memo.
**Baseline:** P14 frozen contract + shipped P14 S1–S3 baseline.

---

## Goal

Extract the canonical single camera route/motion system —
`museum/navigation/camera-route.ts` + `camera-motion.ts` — out of the app and
into a **UI-free, runes-free, renderer-handle-free headless camera core**
(`@portfolio/camera-core`, Three math primitives only), so the **editor↔visitor
dependency runs through a shared package instead of through the route/motion
implementation currently housed under `museum/navigation/`**. The visitor-only
`CameraDirector.svelte` and `NavigationNode.svelte` remain app components.
**Zero runtime behavior change for existing production
call sites** — with one intentional API tightening (graph-taking functions
require an explicit `NavigationGraph`, §S2). The package is consumed by both
sides. This unblocks freezing `/museum` (visitor may import
`camera-core`/`project-model`/`layout-core`, never `editor/*`) and lets the
editor stop importing a "visitor" path.

## Amendments (owner, 2026-08-29)

1. **Minimum dependency surface.** P15 extracts the route/motion *execution
   system*; it does not claim ownership of every type it touches. Move only
   what is compile-required to make route/motion standalone (`NavigationGraph`,
   `getNode`). Leave `createNavigationGraph` and
   `assertNavigationGraphMatchesScene` in `content/scene.ts` unless S0 proves
   the package code genuinely needs them. Any type that must move temporarily
   is marked **`TEMPORARY TYPE HOME → P16/project-model owns the final durable
   model type`**. P15 introduces no `camera-core → project-model` import:
   camera-core uses package-local structural inputs until P16 decides whether
   to adapt or relocate them. The permitted dependency direction is
   **`project-model → camera-core`**, never the reverse; `SceneDocument` remains
   definable without a camera execution package.
2. **Headless-core wording, not "renderer-neutral".** `three` as a peer
   dependency means the package is not renderer-*independent* in the strict
   sense. The boundary is: **allowed — `Vector3`, `Quaternion`, `MathUtils`,
   other pure Three math; forbidden — `Scene`, `Object3D` ownership,
   `WebGLRenderer`, materials, meshes, DOM, Threlte, Svelte, editor state.**
3. **Explicit-graph API tightening.** Removing the `= navigationGraph`
   defaults is an intentional API change, even though production call sites
   all pass a graph today. "Zero behavior change" is qualified to **zero
   runtime behavior change for existing production call sites**; test
   migrations that add an explicit `fixtureGraph` are contract migration, not
   pretending nothing changed.
4. **Two boundary pins, not one.** Source boundary (P15): `src/lib/museum/**`
   imports no `editor/**`. Runtime boundary (P15): the built `/museum` visitor
   closure contains no editor chunks. The app split later strengthens the
   source pin to the whole `apps/museum`.

## Why this slice is bounded (ground truth, 2026-08-29)

- `camera-motion.ts` (2,083 lines) imports **only** `three` and
  `$lib/types/scene` (camera-domain scalars/consts).
- `camera-route.ts` (637 lines) imports `getNode` + `NavigationGraph` from
  `$lib/content/scene`, `navigationGraph` from `$lib/content/chopin-project`
  (a **visitor fixture** used only as default parameter values), camera-domain
  types from `$lib/types/scene`, and `./camera-motion`.
- The current inventory is **24 application importer files + 17 test importer
  files** (39 source import declarations + 22 test declarations), including
  one relative import (`editor-orientation-gizmo.svelte.ts` →
  `../museum/navigation/…`) and three dynamic type imports in
  `EditorCameraFramingControls.svelte`. The two moved files are excluded from
  the importer-file count; S0 records the exact path list and separately tracks
  source readers such as `contracts.test.ts`.
- **Every `src` call site of `getCameraRoute` / `getCameraConnectionRoute` /
  `resolveFlowRoute` / `getFlowRoute` passes an explicit graph** (visitor:
  `CameraDirector.svelte`, `paris-activation.ts`; editor: `host.graph`,
  `state.graph`, `#graph()`). `getCameraMotionOptions` takes no graph. The
  Chopin default is therefore severable — only tests need auditing.
- `createNavigationGraph` and `assertNavigationGraphMatchesScene` (scene
  construction/validation) are **not** required by route/motion and stay in
  `content/scene.ts` for P15 — `project-model` territory, not camera-core's.
- Package precedent exists: `packages/scroll-travel` (`@portfolio/scroll-travel`,
  `type: module`, exports `./src/index.ts`, `three` as peer dependency). Unlike
  that source-only precedent, P15 adds an explicit package tsconfig and check
  command because standalone compilation is an acceptance requirement.

## Scope

**In:**
1. Create `packages/camera-core` mirroring `scroll-travel` conventions
   (`@portfolio/camera-core`; exports `./src/index.ts`; `three` peer dep;
   tsconfig base; pure TS, zero runes, zero `$lib/` imports).
2. Move `camera-route.ts` + `camera-motion.ts` into the package with no logic
   changes; only import paths and the explicitly approved type/API boundary
   change.
3. Move the **minimum compile-required type surface** into the package and
   invert the dependency: `$lib/types/scene` and `$lib/content/scene` become
   re-export shims over `@portfolio/camera-core`, so their ~dozens of consumers
   see zero behavior change. Only symbols S0 proves are needed move; each is
   classified `camera-owned | temporary until project-model` (§S0 table).
4. Sever the `chopin-project` default: remove the `= navigationGraph` defaults
   (5 sites) and the fixture import from the package.
5. Migrate all **24 application importer files + 17 test importer files** (src
   + tests, including the relative and dynamic type-import sites) to
   `@portfolio/camera-core`; update non-import source readers too.
6. Delete only the two extracted files from
   `apps/museum/src/lib/museum/navigation/`. Retain the visitor-only
   `CameraDirector.svelte` and `NavigationNode.svelte` components in that
   directory; relocating them is out of scope.
7. Add the **visitor boundary pins** (CI-able): source pin — `src/lib/museum/**`
   imports no `editor/**`; runtime pin — the built `/museum` closure contains
   no editor chunks (tightened to the whole visitor app at split time).
8. Re-verify the `/museum` visitor bundle stays editor-free with the
   post-build runtime guard defined in S4.

**Out (deferred by the ratified memo):** `project-model`, `layout-core`,
`runtime`, `api-contract`, the app split itself, all backend work. This slice
moves code and changes import paths only.

## Slices

### S0 — Pre-inventory (gate for S1)

- Start from the actual direct imports, not the former file's broad type
  modules. `camera-motion.ts` directly consumes `CAMERA_EASING`, `CAMERA_FOV`,
  `CameraConnectionDirection`, `CameraEasing`, and
  `RuntimeCameraFramingEnvelope`. `camera-route.ts` directly consumes `getNode`,
  `NavigationGraph`, `CameraConnectionDirection`, `RuntimeConnection`,
  `NavigationNodeData`, and `Vec3`, plus the route/motion types from
  `camera-motion.ts`.
- Record the exact importer inventory before edits: 24 application importer
  files + 17 test importer files, 39 source import declarations + 22 test
  declarations, and three dynamic type imports. Record the full path list and
  separately list non-import references, including the source reads of the old
  files in `tests/lib/editor/app/contracts.test.ts` and the live editor README
  and architecture pointers.
- **Classify every candidate symbol** as `camera-owned | temporary structural
  input until project-model | stays in place`; S1 is blocked while any
  compile-required symbol remains undecided:

  | Symbol | Needed by | P15 home | Final disposition |
  | --- | --- | --- | --- |
  | `CameraMotion` and route/motion public types | route + motion | camera-core | camera-core |
  | `CameraConnectionDirection`, `CameraEasing`, `CAMERA_EASING`, `CAMERA_FOV` | route/motion | camera-core | camera-core |
  | `RuntimeCameraFramingEnvelope` | motion | camera-core | camera-core |
  | `NavigationGraph` | route + graph consumers | package-local structural type; temporary if model-shaped | project-model owns durable model; no reverse import |
  | `NavigationNodeData` | route + `getNode` consumers | package-local structural input; temporary | project-model owns durable model |
  | `RuntimeConnection` and required view/timing members | route + timing consumers | package-local structural input; temporary | project-model owns durable model |
  | `getNode` | route + visitor/editor consumers | camera-core temporary helper/shim | project-model graph helper later, without a camera-core → project-model import |
  | `Vec3` | route internals | local package tuple alias unless S0 proves a public shim is required | no app-wide move by default |
  | `RoomId`, `TourMode`, `RuntimeCameraViewKeyframe`, persisted `CameraFramingEnvelope` | not directly consumed by the moved modules | stays in app/model types | project-model later where applicable |
  | `createNavigationGraph` | scene construction | `content/scene.ts` | project-model later |
  | `assertNavigationGraphMatchesScene` | scene validation | `content/scene.ts` | project-model later |

  Package-local structural inputs may preserve the existing public names where
  required for compatibility, but must not import `$lib` or `project-model`.
  Temporary moves carry the `TEMPORARY TYPE HOME → project-model` marker in code
  and this doc. The P15 dependency rule is one-way: `project-model →
  camera-core`; P15 never adds the reverse edge.
- Audit every call site of the graph-taking functions **in tests** for reliance
  on the Chopin default; list them for S3 (evidence says `src` is clean).
- Record the three import-path shapes to migrate (absolute `$lib/…`, relative
  `../museum/…`, dynamic `import('…')`).

### S1 — Package creation + type inversion

- `packages/camera-core`: `package.json` (`@portfolio/camera-core`,
  `@portfolio/tsconfig` base, `three` peer range matching `scroll-travel`,
  `@types/three` + matching `three` dev dependencies, and a `check` script),
  `tsconfig.json` extending `@portfolio/tsconfig/base.json`,
  `src/index.ts` (re-export route + motion + types), `src/camera-route.ts`,
  `src/camera-motion.ts`, plus `src/navigation.ts` / `src/scene-types.ts`
  **only for symbols S0 classifies as compile-required** (e.g. `NavigationGraph`,
  `getNode`); `createNavigationGraph` and `assertNavigationGraphMatchesScene`
  stay in `content/scene.ts` unless S0 proves otherwise. Temporarily moved
  symbols are marked `TEMPORARY TYPE HOME → project-model` in code comments.
- `apps/museum/package.json`: add `@portfolio/camera-core: "*"` as a runtime
  dependency and a `verify:visitor-bundle` script. Add the package workspace
  entry to `package-lock.json`; do not change the root `check`/`build` targets
  away from the museum app. Add an auxiliary root `check:camera-core` script
  that runs the package's standalone TypeScript check.
- `apps/museum/src/lib/types/scene.ts`: keep the file; re-export the moved
  symbols from `@portfolio/camera-core` so every consumer is untouched.
- `apps/museum/src/lib/content/scene.ts`: import + re-export the moved
  navigation symbols from `@portfolio/camera-core`; internal uses keep working.
- Add a package-boundary compile/import smoke test that imports the public API
  from `@portfolio/camera-core` directly; the existing app tests remain
  integration coverage rather than the standalone package check.
- Contract pins: `packages/camera-core` contains no `$lib/` import, no
  `chopin-project` import, and no forbidden renderer surface (`Scene`,
  `Object3D`, `WebGLRenderer`, materials, meshes, DOM, Threlte, Svelte, editor
  state) — CI grep + test. Allowed Three math: `Vector3`, `Quaternion`,
  `MathUtils`, and other pure math primitives.

### S2 — Sever the Chopin default (intentional API tightening)

- Remove `import { navigationGraph } …` from the package's `camera-route.ts`;
  drop `graph: NavigationGraph = navigationGraph` defaults at the five
  functions (`getCameraRoute`, `getCameraConnectionRoute`, `resolveFlowRoute`,
  `getFlowLoopConnectionId`, `getFlowRoute`). **This is an intentional API
  change** — graph is now required; no fixture/default exists in the package.
- Confirm every remaining caller passes an explicit graph; the visitor passes
  its runtime graph (`chopinRuntime.graph`), the editor its
  store/host-derived graph — both already do. Any test that relied on the
  default moves to an explicit `fixtureGraph` (contract migration). The known
  identity smoke in `tests/lib/museum/navigation/camera-route.test.ts` around
  line 648 is one such test and must be listed in the S0 inventory.

### S3 — Importer migration

- Rewrite all 24 application importer files + 17 test importer files to
  `@portfolio/camera-core`, including the relative import in
  `editor-orientation-gizmo.svelte.ts` and the three dynamic type imports in
  `EditorCameraFramingControls.svelte`.
- Fix any test that relied on the Chopin default (S0 audit) by passing an
  explicit graph fixture.
- Update or remove non-import source readers of the old paths, especially the
  camera source reads in `tests/lib/editor/app/contracts.test.ts`; no test may
  assume the moved files still exist under `$lib/museum/navigation/`.
- Delete only `apps/museum/src/lib/museum/navigation/camera-route.ts` and
  `camera-motion.ts`. Keep `CameraDirector.svelte` and `NavigationNode.svelte`
  in the visitor navigation directory and update their camera imports to the
  package.
- Add the **source boundary pin** (source-scan, existing `contracts.test.ts`
  style): `src/lib/museum/**` must not import `$lib/editor/` or `../editor/`;
  `@portfolio/camera-core` allowed. The **runtime boundary pin** (built
  `/museum` closure, no editor chunks) is verified in S4.

### S4 — Verification + close

- Run the standalone package check, full Vitest, `npm run check` (0/0), and
  `npm run build`.
- Add `apps/museum/scripts/verify-visitor-bundle.mjs` (or an equivalent
  post-build verifier) and wire it as `npm run verify:visitor-bundle -w
  @portfolio/museum`. Run it **after** `npm run build:museum`: resolve the
  `/museum` leaf from the generated SvelteKit server/client manifests, follow
  its static and dynamic imports, and fail if any reachable entry is sourced
  from `editor/**`, `EditorApp`, or `virtual:museum-editor-entry`. Shared
  `@portfolio/camera-core`, Three, and visitor entries are allowed. This is a
  route-closure check, not a grep over every build chunk (other production
  routes intentionally contain editor chunks).
- Keep the source boundary pin as a separate Vitest contract: scan
  `src/lib/museum/**` for `$lib/editor/` and relative editor imports, and scan
  `packages/camera-core/src/**` for `$lib/`, `chopin-project`, renderer handles,
  Svelte, Threlte, and editor-state imports. The existing source-only visitor
  graph must not be treated as the runtime bundle proof.
- Browser QA all production surfaces affected by the shared package:
  `/museum` visitor tour, `/` and `/editor` editor entry, and
  `/museum/editor` relic entry. Confirm route/motion behavior and relic
  mounting are unchanged.
- Update the live ownership/docs pointers (`docs/README.md`,
  `docs/architecture.md`, `docs/components/camera-tour.md`, and
  `apps/museum/src/lib/editor/README.md`) to name `@portfolio/camera-core` as
  the route/motion owner while retaining the visitor component directory.
- Update `docs/hand-off/CURRENT.md`, flip the tracker to `shipped`, and move
  this plan to `docs/archive/plans/`, leaving the tracker's one-line archive
  stub as required by the documentation lifecycle.

## Files

| File | Change |
| :--- | :--- |
| `packages/camera-core/{package.json,tsconfig.json,src/index.ts,src/camera-route.ts,src/camera-motion.ts,src/navigation.ts?,src/scene-types.ts?}` | New package (moves, no logic change; `navigation.ts`/`scene-types.ts` only for S0-required symbols) |
| `apps/museum/package.json`, `package-lock.json`, root `package.json` | Runtime workspace dependency, visitor-bundle verification script, lockfile entry, and standalone `check:camera-core` command; keep root `check`/`build` museum-only |
| `apps/museum/src/lib/types/scene.ts` | Re-export shim over the package |
| `apps/museum/src/lib/content/scene.ts` | Import + re-export moved navigation symbols |
| 24 application importer files + 17 test importer files | Path rewrite to `@portfolio/camera-core`, including the relative and dynamic type-import sites; exact paths recorded in S0 |
| `tests/lib/editor/app/contracts.test.ts` and other non-import source readers | Update old-path source reads and assertions; no reader may assume the extracted files still exist |
| `apps/museum/src/lib/museum/navigation/camera-route.ts`, `camera-motion.ts` | Deleted after migration; retain `CameraDirector.svelte` and `NavigationNode.svelte` in this directory |
| `apps/museum/scripts/verify-visitor-bundle.mjs` + new package-boundary/visitor guard test | Standalone package/runtime closure verification and source boundary pin |
| `docs/README.md`, `docs/architecture.md`, `docs/components/camera-tour.md`, `apps/museum/src/lib/editor/README.md` | Ownership pointers updated to `@portfolio/camera-core` while retaining visitor component ownership |
| `docs/plans/README.md`, `docs/hand-off/CURRENT.md` | Registration + close delta |

No behavior change to route/motion logic, the visitor, or the editor camera
graph. `project-model`/`layout-core` extraction (steps 3–4 of the ratified
order) build on this package.

## Contract notes

- **One canonical implementation.** No fork, no copy of the compiler, project
  model, or camera motion — the ratified memo's core rule.
- **Headless camera core.** UI-free, runes-free, renderer-handle-free. Allowed:
  pure Three math (`Vector3`, `Quaternion`, `MathUtils`, …). Forbidden: `Scene`,
  `Object3D` ownership, `WebGLRenderer`, materials, meshes, DOM, Threlte,
  Svelte, app state, `$lib`. `three` is a peer dependency.
- **Dependency direction pinned:** `project-model → camera-core`, never the
  reverse. P15 must not add a `camera-core → project-model` import; the project
  model must remain able to define `SceneDocument` without a camera execution
  package. Types moved temporarily carry the
  `TEMPORARY TYPE HOME → project-model` marker and stay package-local until
  P16 chooses the durable model boundary.
- **The visitor stays editor-free.** After this slice, the only remaining
  editor→visitor coupling is gone; `museum/**` must not import `editor/**`
  (guard enforced in CI from this slice forward).
- **Chopin is data, not a default.** The visitor graph is passed explicitly at
  its call sites; the package holds no fixture.

## Acceptance pins

- `@portfolio/camera-core` builds standalone via `check:camera-core`; no
  `$lib/`, `chopin-project`, or forbidden renderer-surface imports inside the
  package (CI).
- No remaining import of `museum/navigation/camera-route` or
  `museum/navigation/camera-motion`; only those two files are deleted, while
  visitor components remain in the navigation directory.
- `types/scene.ts` + `content/scene.ts` re-export from the package; full suite
  green — **zero runtime behavior change for existing production call sites**.
- Source boundary pin green: `src/lib/museum/**` never imports `editor/**`.
- Runtime boundary pin green: the post-build `/museum` route closure contains
  no editor chunks; other production route chunks may still contain editor
  code.
- `npm run check` 0 errors / 0 warnings; standalone package check, full Vitest,
  build, and `/museum/editor` relic QA are green.

## Verification

- Final verification: 169 files passed, 1 skipped; 2,284 tests passed, 1
  skipped; `npm run check` reported 0 errors / 0 warnings; build and the
  visitor-bundle guard passed.
- Browser QA: `/museum` visitor tour, `/` and `/editor` editor camera
  timeline/preview, and `/museum/editor` relic mounting behave identically
  after the import-path migration.

## Status

Shipped — 2026-08-30. S0–S4 complete. P13 stays proposed/unscheduled;
P3B.7b remains deferred and non-blocking.
