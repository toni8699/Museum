# P16 — project-model + layout-core extraction (slice 2 of the ratified migration)

**Status:** `shipped` — S0–S5 complete 2026-08-30; package extraction,
boundary pins, parity checks, and browser smoke all pass.
**Depends on:** P15 (shipped 2026-08-30) + the ratified
[backend/persistence migration review](2026-08-29-backend-persistence-migration-review.md)
§0.2, pass 2.
**Baseline:** P15's `@portfolio/camera-core` package, explicit graph-taking
camera APIs, visitor source/runtime boundary pins, and the current
`chopin-project.json`/Scene v6 contract.

## Goal

Extract the canonical, pure document and layout primitives from
`apps/museum` into shared packages:

- `@portfolio/project-model` owns the project/scene semantic model, project
  validation and codec, scene validation and codec, room-reference semantics,
  room-resolved scene projection, navigation-graph construction, and the pure
  portable package/fingerprint primitives.
- `@portfolio/layout-core` owns the shared authored-layout leaf and its pure
  geometry compiler: layout types/codec, room-frame transforms, portal
  projection, compiled geometry, geometry validation, curve/opening helpers,
  and query geometry.

The editor and visitor continue to consume one canonical implementation. The
existing app files become thin compatibility facades, fixture composition, or
renderer/editor adapters. JSON shapes, canonical serialization, generated
endpoint rules, route/motion behavior, and all current production surfaces
remain unchanged.

This is a package extraction only. It does not split `apps/museum`, create
`apps/editor` or `apps/api`, add Save/Load, provision Postgres/R2, or create a
generic `runtime`/`api-contract` package.

## Ratified boundary decisions carried into P16

1. **One-way camera dependency.** `@portfolio/camera-core` stays independent
   of `@portfolio/project-model`. It may expose small structural execution
   inputs for camera routes and motion. `project-model` may consume those
   inputs/pure camera math, but camera-core never imports project-model.
2. **Durable model types leave the P15 temporary home.** The P15 temporary
   `NavigationNodeData`, runtime connection/view/path types, and model-level
   tuple aliases move to their final model package. Camera-core retains only
   the minimum structural input types needed to execute a route or motion.
   The package must not retain a second durable scene model.
3. **No generated data is promoted to the document.** Scene endpoints inserted
   by `resolveSceneDocument` remain fresh runtime values. They are never
   emitted by a serializer, stored in a package, or added to a history entry.
4. **Layout is semantic; geometry is derived.** `LayoutDocument` remains the
   authored source. `CompiledLayoutGeometry` remains deterministic,
   renderer-handle-free, and non-serialized. `wall-mesh-builder` and Three
   resource ownership remain app adapters.
5. **Catalogue and renderer dependencies stay outside the model.** The
   project-model package cannot import the museum asset catalogue, material
   catalogue, editor helpers, Svelte, Threlte, DOM, or Three scene objects.
   If codec checks need catalogue knowledge, the package exposes a small
   validator/context seam and the museum facade supplies the existing
   catalogue predicates. No asset binary is added to the model envelope.
6. **No schema redesign.** The current project envelope remains
   `{ id, name, layout, scene }`; layout and scene keep their current
   canonical shapes, strict unknown-key behavior, array ordering, and
   no-version-field rules. P16 may relocate existing compatibility helpers,
   but it does not invent a version field or activate migrations.
7. **No app topology change.** `/`, `/editor`, `/museum`, and
   `/museum/editor` remain in the current app. The later app-split pass owns
   the route move and the stronger whole-app visitor source pin.

## Package graph

The recommended graph is deliberately acyclic:

```text
@portfolio/camera-core       @portfolio/layout-core
          │                         │
          └────────────┬────────────┘
                       ▼
              @portfolio/project-model
                       ▼
                 apps/museum
```

`layout-core` is the layout leaf: it owns the layout document shape and the
layout-only codec/geometry implementation, while `project-model` re-exports
the canonical layout contract as part of the project surface. This keeps the
room-transform/geometry implementation from depending back on
project-model. `project-model` owns the cross-document project rules and may
use `layout-core`'s room registry plus camera-core's pure path math. No
package may import `apps/museum` or any `editor/**` implementation.

## Scope

### In

- New pure TypeScript workspace packages:
  `packages/project-model` and `packages/layout-core`.
- Relocation of the authored layout model, layout codec, pure geometry
  compiler/validation, room transforms, and portal projection.
- Relocation of the scene model, scene codec, project model/codec, project
  room-reference and world-space camera-pose validation, scene resolution, and
  navigation graph construction.
- Relocation of `content/package-format.ts` and
  `editor/helpers/package-sha.ts` into project-model-owned portable package
  primitives, removing the `package-format → editor` dependency.
- App compatibility facades and importer migration so existing editor,
  visitor, fixture, and test call sites keep their current behavior while the
  implementation lives in the packages.
- Standalone package checks, package boundary tests, canonical JSON/geometry
  parity tests, and the existing visitor source/runtime bundle checks.
- Ownership documentation updates after the extraction is verified.

### Out

- `apps/editor` creation or any route/app split.
- `/museum/editor` relic fork, relocation, removal, or behavior change.
- Fastify, Render, Postgres, R2, authentication, Save/Load, project versions,
  or API contracts.
- A generic `player` or Svelte `runtime` package.
- Editor session state, selection, history, gizmos, hover, Arrange gestures,
  UI components, Threlte components, Three objects/materials, or binary asset
  storage.
- Any new scene/layout schema field, generated endpoint persistence, automatic
  room adjacency inference, or second graph/geometry implementation.

## S0 recorded inventory (opened 2026-08-30)

The inventory was produced from the current tree with `rg -l` over
`apps/museum/src` and `apps/museum/tests`; paths below are the direct-import
surfaces, not transitive dependants.

| Current seam | Final owner | Direct production importers | Direct test importers / source readers |
| --- | --- | --- | --- |
| `content/scene.ts` | `project-model`, except catalogue-backed placement adapters | editor `*.svelte*`, editor camera/store modules, `content/chopin-project.ts`, `content/chopin-room-presentation.ts`, `museum/**`, `state/runtime-state.svelte.ts`, `project/**`, benches, and `content/rooms-to-layout.ts` | `tests/lib/content/**`, editor app/camera/store/layout/project tests, layout fixture tests, museum navigation/paris/state tests; `editor/app/contracts.test.ts` and `museum/visitor-import-boundary.test.ts` read source/import graphs |
| `content/scene-codec/` | `project-model` codec barrel + private parser siblings | `editor/EditorProjectMenu.svelte`, editor document/import/export/store modules, `project/project-codec.ts` | content scene/fixture tests, editor app/import/store/layout tests; `editor/app/contracts.test.ts` reads implementation paths |
| `layout/layout-types.ts`, `layout/layout-codec.ts`, `layout/layout-room-frame.ts`, `layout/layout-portals.ts` | `layout-core` | `content/chopin-layout.ts`, `content/rooms-to-layout.ts`, `content/chopin-project.ts`, `project/**`, editor layout/gizmo/camera/plan modules, museum layout, benches | content Chopin tests, editor layout/gizmo/project tests, layout fixtures/codec/frame/portal/plan/wall tests; `layout/layout-geometry-boundary.test.ts` reads ownership paths |
| `layout/layout-geometry*.ts` | `layout-core` | `content/chopin-project.ts`, benches, routes/dev/perf, editor camera/layout/plan modules, museum layout, plus `wall-mesh-builder.ts` as app adapter | layout geometry/golden/parity/fixture/plan/shared-wall/wall tests, editor layout/camera/plan tests, bench/render boundary tests; `layout/layout-geometry-boundary.test.ts`, `plan-render-boundary.test.ts`, and `wall-mesh-builder.test.ts` read source |
| `project/project-types.ts`, `project/project-codec.ts`, `project/project-layout-semantics.ts` | `project-model` | `content/chopin-project.ts`, `content/chopin-room-presentation.ts`, editor app/store/layout/gizmo/camera modules, museum runtime/render modules | content Chopin tests, editor app/camera/layout/project/store tests, museum visitor tests; contract/boundary tests read source |
| `content/package-format.ts` | `project-model` | editor import/export, MIME helper, texture-library/project-export stores | content package-format and editor package round-trip/import tests |
| `editor/helpers/package-sha.ts` | `project-model` | `content/package-format.ts`, editor import/export/binary-texture store | editor package-sha/import tests |

### S0 ownership decisions

- `Project` becomes the temporary compatibility alias of final
  `ProjectDocument`; serialized keys stay `{ id, name, layout, scene }`.
- `SceneDocument`, authored scene entities/resources/clusters, camera nodes,
  connections, path/view/timing data, `RuntimeScene`, `SceneRoomResolver`,
  `createNavigationGraph`, and graph identity assertions belong to
  `project-model`. `NavigationGraph`/`getNode` currently re-exported by
  `camera-core` are temporary homes and will be reduced to structural camera
  execution inputs after model types land.
- `Vec3` is a structural tuple in package contracts; the durable scene/model
  alias is exported by `project-model`. `layout-core` owns its layout-local
  tuple/geometry types and does not import back into the model package.
- `SceneObjectPlacement`, `placementToModelEntity`, asset/material IDs,
  catalogue lookups, fallback predicates, and texture-URI policy remain
  museum adapters. The model codec will receive optional pure validation
  predicates for known assets/materials/fallbacks and safe texture URIs.
- `LayoutDocument` and all renderer-neutral layout geometry/compiler/query
  helpers belong to `layout-core`. `plan-render-model.ts`, editor session and
  interaction modules, `PlanSvg.svelte`, `wall-mesh-builder.ts`, and all Three/
  Svelte ownership remain in the app.
- `chopin-project.ts`, `chopin-layout.ts`, `rooms-to-layout.ts`, presentation
  metadata, `rooms.ts`, and the visitor FSM remain app/fixture composition;
  the packages do not import Chopin, catalogue, editor, Svelte, Threlte, DOM,
  or renderer handles.

### S0 frozen fixture baseline

- `src/lib/content/chopin-project.json`: 45,586 bytes;
  SHA-256 `f0d69396d096133e0d08437e299fa08c8dce143a0acdb41e77f64d053b3a6a16`.
- Existing parity anchors: `content/chopin-project.test.ts` locks canonical
  bytes, seven room frames, seven explicit portal relations, resolved
  node/connection identity, and fresh generated endpoints; it also asserts
  room-reference issue paths. `layout-geometry-golden.test.ts` locks the
  checked-in Chopin geometry plus G1/G2 fixture outputs.
- Package anchors: `content/package-format.test.ts`,
  `editor/helpers/package-sha.test.ts`, and
  `editor/export/package-roundtrip-smoke.test.ts` lock manifest/fingerprint,
  hard-break filename/URI rules, and byte round-trips.
- Non-import source readers to migrate or update are
  `editor/app/contracts.test.ts`, `museum/camera-core-boundary.test.ts`,
  `museum/visitor-import-boundary.test.ts`, `layout/layout-geometry-boundary.test.ts`,
  `layout/plan-render-boundary.test.ts`, `layout/wall-mesh-builder.test.ts`,
  and `src/lib/bench/record-baseline.ts`.

**S0 gate state:** closed 2026-08-30. The package graph is acyclic, every
moved symbol has one owner, the catalogue seam is explicit, fixture
hashes/anchors are recorded, and package boundary tests are machine-checked.

## Slices

### S0 — Pre-inventory and ownership gate — complete

No implementation move starts until this inventory is recorded in the plan
closeout notes or an attached code comment where the source is the authority.

- Enumerate every direct importer of the current seams:
  `content/scene.ts`, `content/scene-codec/`, `layout/layout-types.ts`,
  `layout/layout-codec.ts`, `layout/layout-geometry*`,
  `layout/layout-room-frame.ts`, `layout/layout-portals.ts`,
  `project/project-*.ts`, `content/package-format.ts`, and
  `editor/helpers/package-sha.ts`.
- Classify each exported symbol as `project-model`, `layout-core`,
  `camera-core structural input`, `museum catalogue/fixture`, or
  `editor-only`. The inventory must explicitly classify `Project` versus the
  final `ProjectDocument` name, `RuntimeScene`, `NavigationGraph`,
  `SceneRoomResolver`, all `Runtime*` camera types, `Vec3`, material/fallback
  IDs, and every helper currently importing `assets`, `materials`, or
  `texture-uri`.
- Confirm the package graph has no cycle. If a symbol would make
  `layout-core ↔ project-model`, keep the layout leaf's implementation and
  expose a structural interface rather than adding a package back-edge.
- Record the exact app/test path list and non-import source readers, including
  contract tests that inspect implementation paths. Distinguish compatibility
  facades from moved implementations.
- Freeze before/after fixtures for:
  `chopin-project.json` canonical bytes, the seven Chopin room frames and
  portal relations, resolved node/connection identity, generated endpoint
  exclusion, geometry golden outputs, and package manifest/fingerprint output.
- Decide the codec adapter boundary. The recommended public seam is a pure
  `SceneValidationOptions`/context with optional predicates for known asset
  IDs, known material IDs, and safe texture URIs. The museum facade passes the
  existing predicates so current unknown-asset/material and unsafe-URI errors
  retain their exact codes and paths; the shared package remains usable by a
  future backend without importing the catalogue.

**Gate:** every moved symbol has one owner, every package edge is one-way, the
current JSON and geometry fixtures are captured, and no unresolved catalogue
or `Project`/`ProjectDocument` decision remains.

### S1 — Package skeletons and public contracts — complete

- Create `packages/project-model` and `packages/layout-core` using the
  workspace/package conventions established by `camera-core`:
  `type: module`, explicit `exports`, `files: ["src"]`, standalone
  `tsconfig.json`, and a `check` script.
- Add matching workspace dependencies and lockfile entries. Add root
  `check:project-model` and `check:layout-core` commands without changing the
  root commands' museum target.
- Establish public barrels. Internal parser/geometry siblings remain private
  behind their package barrel, matching the existing scene-codec contract.
- Make the final public naming explicit. Prefer `ProjectDocument` as the
  durable package name with `Project` as a temporary compatibility alias if
  the current app surface still needs it; do not change serialized keys or
  force an unrelated editor-wide rename.
- Define package-local structural camera inputs in camera-core as needed by
  route/motion. Remove P15's temporary model-shaped types from camera-core
  only after the model equivalents and all adapters compile. The resulting
  camera-core source must contain no project-model import.
- Add boundary tests that import each public barrel directly and reject
  `$lib`, `editor/**`, Svelte, Threlte, DOM, renderer-handle, and app-catalogue
  imports from both packages. Pure Three math is allowed only in camera-core;
  layout-core and the model codecs remain Three-free.

### S2 — Extract layout-core — complete

Move the shared layout leaf without moving editor interaction or renderer
ownership:

- Move `layout-types.ts` and `layout-codec.ts` into the layout-core public
  contract. Preserve `units: 'meters'`, explicit room frames, normalized yaw,
  meter-based opening offsets, explicit door portal pairs, profile-object
  round trips, strict unknown-key rejection, and canonical ordering.
- Move the pure geometry modules:
  `layout-geometry.ts`, `layout-geometry-types.ts`,
  `layout-geometry-curve.ts`, `layout-geometry-openings.ts`,
  `layout-geometry-objects.ts`, `layout-geometry-queries.ts`, and
  `layout-geometry-validation.ts`.
- Move `layout-room-frame.ts` and `layout-portals.ts` so world/local frame
  conversion and explicit portal projection have one owner.
- Keep `plan-render-model.ts`, `PlanSvg.svelte`, editor preview/session state,
  gizmo/hit/interaction modules, and `wall-mesh-builder.ts` in the app. The
  latter consumes compiled geometry and owns Three buffers/materials/raycast
  identity; it must not move into layout-core.
- Update app imports to `@portfolio/layout-core` (or a documented app facade
  that only re-exports package symbols). No production importer may retain a
  second local implementation.
- Preserve geometry cache-key/identity behavior and the single compile path
  used by Plan, editor 3D, visitor 3D, and camera-plan footprints.

**S2 acceptance:** layout codec tests, layout-room-frame tests, geometry
goldens/parity, plan-render boundary tests, performance fixtures, and the
checked-in Chopin geometry all match the pre-extraction results. The package
has no Svelte, DOM, Three, editor, or visitor-fixture import.

### S3 — Extract project-model document types and codecs — complete

- Move the canonical scene model types and pure helpers from `content/scene.ts`
  into project-model: `SceneDocument`, authored node/connection/path/view
  types, entities/resources/clusters, `RuntimeScene`, empty-document creation,
  cloning, type guards, scene resolution, and graph construction/assertion.
- Move the five-file scene codec as one public surface, preserving its exact
  issue codes/paths, canonical deep-clone behavior, directional view tracks,
  framing-envelope validation, strict v6 shape, and no-generated-endpoint
  serialization rule.
- Move `project-types.ts`, `project-codec.ts`, and the cross-document semantic
  checks currently in `project-layout-semantics.ts`. The project codec must
  continue to validate nested layout and scene documents, prefix nested issue
  paths, reject unknown room references, and repeat camera-pose/envelope
  checks at the project boundary.
- Keep the project room registry on the model side, backed by layout-core's
  room/frame semantics. It must continue to provide one registry and one
  resolved scene instance to `chopin-project.ts`; graph identity assertions
  remain enforced.
- Keep `chopin-project.ts` as the app-owned checked-in fixture/runtime
  composition. It validates the raw fixture once, creates the model registry,
  resolves the scene, builds the graph, and compiles geometry through the
  packages. It does not move Chopin presentation metadata or the hardcoded
  visitor FSM into project-model.
- Keep renderer/catalogue adapters in the app. In particular, any
  `getAssetById`-based naming or material rendering behavior remains in the
  museum app; model validation receives pure predicates/context instead of
  importing the catalogue.
- Add app facades at the old `$lib` paths only where they preserve existing
  import ergonomics. Facades may configure museum validation options and
  re-export package types; they may not contain a copied codec/resolver.
- Migrate direct production and test consumers to package barrels where no
  app-specific adapter is needed. Update source-reading contract tests to
  assert package ownership rather than old implementation paths.

**S3 acceptance:** all scene/project codec, scene resolution, Chopin fixture,
editor document-store/history, camera graph, importer/exporter, and visitor
tests pass with identical semantic results. `serializeProject` and
`serializeSceneDocument` produce byte-identical canonical output for the
checked-in fixtures; runtime endpoint arrays are fresh and absent from
serialized documents.

### S4 — Relocate package format and SHA helper — complete

- Move the pure `sha256Bytes` implementation into project-model and export it
  from the package barrel. Keep the cross-runtime `globalThis.crypto.subtle`
  behavior and `sha256-<lowercase-hex>` format.
- Move the pure manifest/id/filename helpers from
  `content/package-format.ts` into project-model. Preserve the hard-break
  `.scenepack.zip` format, `manifest.json`/texture path conventions, MIME
  allow-list, filename sanitization, collision suffixes, deterministic package
  IDs, and timestamp formatting.
- Keep ZIP/Blob/File/browser orchestration in editor import/export modules.
  Those modules consume project-model primitives; project-model must never
  import the editor to obtain hashing or package helpers.
- Remove the old editor helper implementation after all importers and tests
  migrate. If a compatibility path is retained, it is a re-export shim only.

**S4 acceptance:** package-format, package SHA, package round-trip, texture
verification, and editor archive tests pass; a source scan finds no
`content/package-format.ts → editor/**` edge and no duplicate SHA helper.

### S5 — Integration verification and closeout — complete

Run and record all of the following before marking P16 shipped:

- `npm run check:project-model`
- `npm run check:layout-core`
- `npm test`
- `npm run check` with 0 errors and 0 warnings
- `npm run build`
- `npm run verify:visitor-bundle -w @portfolio/museum` after the build
- Browser smoke for `/museum` visitor navigation, `/`, `/editor`, and the
  `/museum/editor` relic entry.

Add or retain separate boundary pins:

- package source scans: no `$lib`, `editor/**`, Svelte, Threlte, DOM, or
  renderer-handle imports in project-model/layout-core; no project-model edge
  in camera-core;
- visitor source scan: `src/lib/museum/**` remains editor-free;
- built `/museum` closure scan: no reachable editor entry/chunk, including
  `EditorApp` and `virtual:museum-editor-entry`.

Update the live docs only after the checks pass:
`docs/README.md`, `docs/architecture.md`,
`docs/components/persistence.md`, `docs/components/scene-codec.md`, the
camera/layout ownership pointers, `docs/hand-off/CURRENT.md`, and the plan
tracker. On close, mark P16 shipped, move this plan to
`docs/archive/plans/`, and leave the tracker's one-line archive stub.

## Files and ownership

| Area | Planned change |
| --- | --- |
| `packages/project-model/` | New package for project/scene types, scene/project codecs, cross-document validation, room-resolved runtime projection, graph construction, package format, and SHA helper. |
| `packages/layout-core/` | New package for layout types/codec, room-frame transforms, portal projection, compiled geometry/types, curve/opening/object/query helpers, and geometry validation. |
| `packages/camera-core/` | Replace P15 temporary model-shaped inputs with minimal structural execution inputs; retain route/motion ownership and no reverse model dependency. |
| `apps/museum/src/lib/content/scene.ts` | Thin app facade/adapters over project-model; retain only museum catalogue/renderer-specific placement helpers if required. |
| `apps/museum/src/lib/content/scene-codec/` | Facade or migrated test boundary over the project-model scene codec; no copied parser implementation. |
| `apps/museum/src/lib/layout/` | Facades for package symbols; keep Plan presentation, wall mesh/Three adapters, and editor-only interaction local. |
| `apps/museum/src/lib/project/` | Facades or editor integration over project-model; no duplicate project codec or cross-document semantic implementation. |
| `apps/museum/src/lib/content/chopin-project.ts` | App-owned fixture/presentation/runtime composition using the packages. |
| `apps/museum/src/lib/content/package-format.ts`, `apps/museum/src/lib/editor/helpers/package-sha.ts` | Move pure implementation to project-model; remove the editor leak and leave only re-export compatibility if needed. |
| `apps/museum/tests/` and package boundary tests | Keep integration/golden coverage, migrate imports, add direct package and boundary coverage, and update source readers. |
| `package.json`, app manifests, `package-lock.json` | Register both workspaces, package dependencies, and standalone checks without changing root museum targets. |
| `docs/` and `apps/museum/src/lib/editor/README.md` | Update ownership pointers only after implementation verification. |

## Acceptance contract

P16 is complete only when all of these are true:

- There is exactly one project/scene codec, one room-resolution path, one
  navigation graph builder, and one layout geometry compiler.
- `@portfolio/project-model` and `@portfolio/layout-core` compile standalone,
  are pure TypeScript, and import no app/editor/UI/rendering code.
- `@portfolio/camera-core` imports no project-model and continues to own the
  only route/motion engines; all graph-taking calls remain explicit.
- `chopin-project.json` and the current Scene v6/layout documents round-trip
  canonically with unchanged bytes, issue paths, array order, and optional
  field behavior.
- Resolved camera positions, view targets, graph identity, room transforms,
  geometry identities, and generated endpoint freshness match the current
  tests; no generated endpoint is serialized.
- Editor package import/export still works, but hashing/package-format
  primitives no longer reach into `editor/helpers`.
- The visitor still mounts and navigates, the editor and relic still mount,
  and the built `/museum` route closure contains no editor code.
- No `apps/editor`, `apps/api`, backend, auth, Save/Load, R2, runtime, or
  collaboration surface has been introduced.

## Closeout (2026-08-30)

- Added standalone `@portfolio/layout-core` and `@portfolio/project-model`
  packages with explicit workspace exports and checks. Layout model/codec,
  renderer-neutral geometry, room-frame/portal semantics, scene/project model
  and codecs, room resolution/graph construction, package format, and SHA
  primitives now have one package owner.
- Left app paths as thin facades/adapters where compatibility or museum
  catalogue policy requires them. Camera-core now exposes only structural
  `CameraGraph*` execution inputs; durable scene/runtime types live in
  project-model. No package imports app, editor, Svelte, Threlte, DOM, or
  renderer handles; camera-core has no project-model edge.
- Added direct package/boundary coverage and preserved the existing source
  readers. The checked-in JSON, generated-endpoint freshness, graph identity,
  geometry goldens, package manifest/fingerprint, and visitor closure remain
  pinned by the existing tests.
- Verification: `npm test` — 170 files passed, 1 skipped; 2,288 tests passed,
  1 skipped. Root `npm run check`, `npm run check:camera-core`,
  `npm run check:layout-core`, and `npm run check:project-model` pass;
  `npm run build` passes with existing dependency/chunk warnings;
  `npm run verify:visitor-bundle -w @portfolio/museum` passes. Browser smoke
  passed `/museum` Entrance → Poland navigation, `/`, `/editor`, and
  `/museum/editor` mounting.

## Rollback and fallback split

- If S0 finds that extracting layout-core with project-model creates a cycle,
  land the leaf layout package first and keep project-model's public facade
  pointed at it; never copy the compiler or add a reverse package edge.
- If catalogue validation cannot be made package-neutral without changing
  current errors, keep the existing museum codec facade as a thin configured
  adapter and defer only the backend-neutral validator context. The canonical
  model and codec implementation still must not import the catalogue.
- If the combined pass is too broad after inventory, split before S2 into
  **P16a: project-model + package-sha/package-format** and a separately
  registered layout-core increment. Preserve the same package graph, facades,
  fixtures, and boundary gates; do not begin the app-split pass until both
  leaves are green.
- Any failed parity or visitor-boundary check stops the slice at the current
  facade boundary. Restore the old app import path through a re-export shim
  while correcting the package; do not alter the production JSON contract or
  route/motion behavior to make the extraction compile.
