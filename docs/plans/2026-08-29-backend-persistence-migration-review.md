# Backend / persistence migration — plan review + relic decoupling & freeze

**Type:** review / assessment memo. **Not** a numbered increment — no P-number
is registered (per tracker rule 1, numbers go on implementation plans; this is
a decision-support doc). Archive on acceptance.
**Status:** **ratified 2026-08-29** — owner accepted the consolidated findings
and resolved all open decisions (§0). P15 (the `camera-core` extraction) was
approved **with 4 amendments** recorded in §0.3; later slices build on this
record.
**Platform amendment:** **2026-08-30** — owner superseded the prior database
choice with Neon Postgres and ratified managed identity auth as the future auth
boundary; Render remains API compute and R2 remains object storage.
**Date:** 2026-08-29. **Trigger:** proposal to split `apps/museum` into
`apps/editor` + `apps/museum` (visitor) + `apps/api`, extract shared packages,
and add DB-backed persistence.

The plan under review is largely sound. The current-state claims are accurate,
the proposed boundaries are right, and the "don't over-package" discipline is
correct. This memo records the corrections, the relic decoupling/freeze
analysis, and the gaps the plan must close before work starts. All gaps are now
closed — see the ratification in §0.

---

## 0. Owner ratification (2026-08-29)

### 0.1 Decisions

1. **Shared canonical packages, not frozen copies.** Extract `camera-core`,
   `project-model`, and `layout-core` as `@portfolio/*` packages consumed by
   both editor and visitor. "Frozen visitor" = frozen product behavior and
   dependency surface, **not** a second implementation of canonical pure logic.
   No literal package-version pinning yet — enforce the freeze with dependency
   boundaries + tests: **museum may import `camera-core` / `project-model` /
   `layout-core`; museum may NOT import `editor/*`.** Add an import/bundle check
   (CI) so the visitor cannot accidentally acquire editor/session infrastructure.
2. **Extraction order:** `camera-core` first (it already is the canonical
   single camera route/motion system and is pure TS); then relocate
   `package-sha` / remove the `package-format → editor` leak; then
   `project-model`; then `layout-core` only for genuinely shared renderer-neutral
   layout logic (`compileLayoutGeometry`, room/local transform semantics) — no
   editor manipulation state or Svelte presentation.
3. **App split:** `apps/editor` (greenfield authoring product: shell,
   inspector, timeline UI, selection, history, hover, gizmos, Arrange
   interaction, asset-management UI, workspace/session state, Threlte editor
   overlays), `apps/museum` (read-only Chopin visitor surface only),
   `apps/api`.
4. **Relic:** `/museum/editor` stays a **gated relic entry into `apps/editor`**
   with relic behavior preserved — no architectural fork. Final removal is an
   explicit future product decision, never an accidental consequence of the
   split.
5. **Platform:** TypeScript + **Fastify** on **Render**; **Neon Postgres**;
   **Cloudflare R2** for object storage; a **managed auth provider** for identity
   authentication. Conventional Node service (not edge/serverless) so future
   background workers stay straightforward. Backend consumes
   `@portfolio/project-model`. Python/Rust workers only when a real workload
   demands them. Managed auth proves identity; Fastify + Postgres own product
   authorization and project permissions.
6. **Persistence:** Neon Postgres owns platform state + versioned semantic
   documents (`users`, `projects`, `project_versions`, `assets`,
   `published_versions` later); `project_versions` stores the serialized
   `ProjectDocument` as JSONB.
   **Never** normalize into `walls` / `scene_objects` / `camera_nodes` /
   `path_anchors` tables — that would create a second scene model. R2 owns heavy
   bytes (GLB, textures, images, audio, video, thumbnails); DB owns identity,
   metadata, provenance/license/import state, and storage references. Supports
   built-in/procedural (no R2 object), uploaded, and provider-imported assets.
7. **First auth/persistence scope:** managed identity auth plus single-user
   product ownership only. Durable model
   `User → Projects (metadata + ProjectVersions) → Assets`; first workflow is
   Save → persist → reload → Load restores the same project. **Deferred:**
   teams, memberships, collaboration, billing, realtime presence, complex
   permissions.

### 0.2 Revised implementation order (ratified — merged into passes)

> The twelve numbered increments are grouped into **six passes**, each sub-plannable
> independently (sub-plan only after the passes it depends on land). Pass 1 is
> already in progress as P15; passes 2–6 are the remaining work.

1. **P15 (in progress) — extract `camera-core`.** Both current consumers switch
   to `@portfolio/camera-core`; no behavior change. See §0.3 for the approved
   amendments. Kept as its own pass — it is the unblocking leaf and its
   dependents need its output. *Skipped for sub-planning (already underway).*
2. **Package-extraction pass — `project-model` + `package-sha` + `layout-core`.**
   Relocate `package-sha` into `project-model` (removes the `package-format →
   editor` leak), extract `project-model` (ProjectDocument, LayoutDocument,
   SceneDocument, types, schema, validation, codec, package format, migrations,
   portable import/export primitives — Svelte/runes-free), and `layout-core`
   where genuinely shared. Same pure-TS extraction mechanics throughout; no app
   topology change. Starts only after Pass 1 lands (`project-model`'s
   `SceneDocument` depends on the extracted `camera-core`).
3. **App-split pass — lift visitor + split editor + gate relic.** Lift
   `/museum` into a standalone visitor app on pinned shared packages, split the
   greenfield editor into `apps/editor`, and keep `/museum/editor` as a gated
   relic entry (or explicitly deprecate later). One topological restructure of
   `apps/*`; CI verifies the visitor-safe dependency closure and the editor-free
   `/museum` runtime.
4. **Backend-provisioning pass — Render `apps/api` (Fastify) + Neon Postgres.**
   Provision Neon separately, pass its `DATABASE_URL` to the Render service as
   an unmanaged secret, and keep both regions geographically close where
   practical; backend consumes `@portfolio/project-model`. No R2 bucket or
   managed-auth integration in this pass.
5. **First persistence slice — project Save/Load + minimal ownership.**
   Implement Save/Load, project versions, and single-user auth/ownership only.
   Right-sized per §0.1.7/§5.3.
6. **Asset storage — R2 + asset metadata.** Add R2 object storage and asset
   metadata for built-in/procedural, uploaded, and provider-imported assets.
   Standalone/orthogonal; may proceed in parallel with later passes.

**Deferred deliberately:** generic `player`, `runtime` package, `api-contract`
package, collaboration, teams/memberships, full auth beyond single-user,
Python workers, Rust workers, full publishing platform. The restructuring
establishes long-term boundaries now without prematurely implementing the
long-term platform.

### 0.3 P15 approval amendments (2026-08-29)

P15 was approved **with 4 amendments** refining the extraction mechanics:

1. **Minimum dependency surface.** P15 extracts the route/motion *execution
   system*, not ownership of every type it touches. Only compile-required
   symbols move (`NavigationGraph`, `getNode`); `createNavigationGraph` and
   `assertNavigationGraphMatchesScene` stay in `content/scene.ts` unless S0
   proves otherwise. Temporarily moved types are marked
   `TEMPORARY TYPE HOME → project-model`. Dependency direction pinned:
   `project-model ↓ camera-core`, never the reverse — the project model must
   never import a camera execution package to define `SceneDocument`.
2. **Headless-core wording.** `three` is a peer dependency, so camera-core is
   *not* "renderer-neutral" in the strict sense; it is a **UI-free, runes-free,
   renderer-handle-free headless camera core** using Three math primitives only
   (allowed: `Vector3`, `Quaternion`, `MathUtils`; forbidden: `Scene`,
   `Object3D` ownership, `WebGLRenderer`, materials, meshes, DOM, Threlte,
   Svelte, editor state).
3. **Explicit-graph API tightening.** Removing the `navigationGraph` defaults
   is an intentional API change; "zero behavior change" is qualified to *zero
   runtime behavior change for existing production call sites*, and test
   migrations to explicit `fixtureGraph` are contract migration.
4. **Two boundary pins.** Source pin (`src/lib/museum/**` never imports
   `editor/**`) and runtime pin (built `/museum` closure contains no editor
   chunks) are verified separately; the app split later strengthens the source
   pin to the whole `apps/museum`.

---

## 1. Verified current state (ground truth)

- Monorepo already exists: `apps/museum` + packages `audio-plink`,
  `note-cursor`, `portfolio-content`, `portfolio-hud`, `scroll-travel`,
  `tsconfig`; root `package.json` with `workspaces: ["apps/*","packages/*"]`.
  No monorepo invention needed.
- Routes live in one app: `/`, `/editor`, and the frozen relic `/museum/editor`
  (mounted via the `virtual:museum-editor-entry` vite plugin →
  `MuseumEditorApp.svelte`).
- `src/lib` has `editor, museum, project, layout, content, render, state` —
  deployment boundary ≠ ownership boundary yet.
- The persistence "truth" already exists:
  `project/project-types.ts` → `Project = { id, name, layout: LayoutDocument,
  scene: SceneDocument }`, exactly the `ProjectDocument` the proposal wants to
  serialize/version.
- **Editor and visitor are structurally different sizes:** `editor/` = 102
  Svelte files (shell/inspector/gizmo/selection/history/session), `museum/` = 31.

## 2. What the plan gets right

- **Backend owns platform things, not scene structure.** The visitor
  `SceneDocument`, layout compiler, and camera core are all pure TS today. A
  serialized, versioned `Project` document (not `rooms`/`walls`/
  `camera_nodes`/`scene_objects` tables) is the correct, low-risk persistence
  model and matches the existing code.
- **Keep UI/session inside the editor.** Matches the documented editor-only
  surface: shell, inspector, timeline UI, selection, undo/redo, hover, gizmo,
  Arrange interaction, asset-management UI, workspace/session state.
- **No `player` extraction yet; keep `museum` as the visitor proof.** Nothing
  in the current visitor justifies a second migration now.
- **Keep Svelte 5 + Threlte as the frontend stack; keep extracted packages
  renderer-neutral / runes-free.**

## 3. Migration-order corrections (grounded in the repo)

### 3.1 `camera-core` is on the critical path, *before* `project-model`

The proposal says extract `project-model` first, then layout/camera/runtime.
That order cannot be honored today because the **editor already depends on the
visitor side**: ~22 editor files *and* `project/project-layout-semantics.ts`
import `museum/navigation/camera-route.ts` + `camera-motion.ts` (the canonical
"one nav + one motion" modules, currently visitor-held). Concretely:

- You cannot "freeze apps/museum with no editor imports from it" until
  `camera-core` is extracted — the editor physically reaches into those two
  visitor files today.
- Both files are pure `.ts` (no runes), so renderer-neutral extraction is clean.

Revised order: **camera-core → project-model → split apps → api.**

### 3.2 Hidden editor dependency inside a package source

`content/package-format.ts` imports `sha256Bytes` from
`editor/helpers/package-sha`. Extracting `project-model` from `content` means
relocating that crypto helper into the package too, or the package leaks back
into editor.

### 3.3 `runtime` package is fuzzy — pin it or drop it

The visitor FSM state (`state/runtime-state.svelte.ts`) is **Svelte runes
(`.svelte.ts`)** and depends on the hardcoded `content/chopin-project`. The only
visitor-safe pure logic is the navigation graph in `content/scene.ts`, which
belongs with `project-model`. There is no standalone non-Svelte "runtime" to
extract today. **Recommendation:** defer `runtime` until a real `player` app
exists; keep only pure navigation logic in `project-model`. By the same logic,
defer `api-contract` until Save/Load is actually shaped — don't invent the
contract early.

### 3.4 The frozen relic's fate is unaddressed

`CURRENT.md` non-negotiables list `/museum/editor` as a shipping surface. The
proposal's target drops it silently. Must be decided explicitly (see §5).

## 4. Relic decoupling & freeze — the key reframe

There are **two different things both called "museum"**, and the effort differs
by ~an order of magnitude.

### 4.1 The `/museum` visitor — already nearly editor-free; LOW effort to freeze

The visitor's runtime closure (`museum/*`, `state/runtime-state.svelte.ts`,
`render/wall-geometry-adapter.ts`, `content/chopin-*` + scene/rooms, and the
`project`/`layout` modules `chopin-project.ts` pulls in) has **no import into
`editor/`**. The only editor import anywhere in those six dirs is
`content/package-format.ts → editor/helpers/package-sha`, and that file is
imported **only by editor files** (export/import/store/mime-sniff) — i.e.
**off-closure** for the visitor. The visitor already is a self-contained,
editor-free subset.

The one coupling that exists runs the **reverse direction**: the editor (and the
shared `project` layer) import `museum/navigation` camera route/motion. That is
exactly the `camera-core` extraction. It must happen regardless, but it does not
block freezing the visitor.

**Estimated effort: LOW** — ~60–75 files, near-zero logic change. Most of the
work is routing/build/bundle verification, not refactoring:
1. Extract `camera-core` (unblocks the reverse coupling).
2. Lift the visitor (`museum/`, `state/runtime-state`, `render/`,
   visitor-facing `content/`+`project/`+`layout/`+`types/` modules) into a
   standalone read-only SvelteKit app (or pinned package).
3. Re-verify `/museum` chunks stay editor-free (the current bounty guard is
   behavioral; keep the check).

### 4.2 The `/museum/editor` relic — NOT extractable; it *is* the editor

`MuseumEditorApp.svelte` is a ~40-line shell composing the **live editor** —
`EditorAppBar`, `EditorLeftSidebar`, `EditorViewport`, `EditorInspector`,
`EditorCameraTimelineFrame`, `EditorMaterialChoiceDialog`, the shared
store/layout/camera state, `useEditorShellBoot`, all tokens/styles — seeded with
the Chopin document and `relic: true`. "Frozen" means **behavioral** (the
`relic` flag disables Layout editing and midline history), not **code
ownership**. There is no distinct legacy code body behind that route.

"Extract the relic into a self-contained no-dependency folder" would therefore
require a **complete editor fork** (189 files incl. 102 Svelte components,
camera core, gizmo, selection, history, Three/Threlte, token system) into a
progressively-divergent copy that still needs `content`/`project`/`layout`/
`types`. That is several days of work plus permanent drift/security liability,
and contradicts the editor's own "one store, shared chrome" design.
**Recommendation: do not fork the relic.**

### 4.3 The real decision: fork vs. pinned-share for shared pure modules

"Self-contained, no dependency" forces a choice for the shared pure modules the
visitor needs (layout compiler, project codec/types, scene model, camera core):

- **Copied frozen folder** — maximally isolated, but duplicates code the editor
  keeps evolving → two compilers, guaranteed divergence.
- **Pinned shared package** (`camera-core` + `project-model` + `layout-core`,
  exported and version-pinned) — visitor and editor consume one copy; "frozen"
  means pin the interface/version, not fork the code. This is the cheap,
  correct option and is the same packages the backend plan wants anyway.
  **Recommended.**

**Net recommendation:** extract `camera-core` first; lift `/museum` into a
standalone read-only app consuming pinned shared packages; keep `/museum/editor`
as a gated editor entry (or deprecate/redirect it) rather than a frozen fork.

## 5. Things the plan must address before starting

*All resolved by the §0 ratification (2026-08-29).*

1. **Frozen-relic fate.** Keep `/museum/editor` as an editor relic entry
   (status quo) vs. deprecate/redirect into the live editor. Decide explicitly;
   silent removal is a product change.
2. **Backend stack + deploy topology.** Three deployables need explicit hosts.
   Name the API framework and how editor/museum/api/database each ship.
3. **Auth is the biggest new surface — right-size the first slice.**
   Consider single-user/local (or storage-backed) Save/Load before full DB +
   auth (sessions/ownership/memberships).
4. **Package scoping.** The monorepo is `personal-portfolios` and hosts
   unrelated anchors (`note-cursor`, `portfolio-hud`, `audio-plink`,
   `portfolio-content`); museum only actually depends on `@portfolio/scroll-travel`.
   Adopt `@portfolio/{editor,museum,api}` and name new packages
   `@portfolio/{project-model,layout-core,camera-core}`.
5. **Keep packages runes-free.** Any `.svelte.ts` state stays in-app; extracted
   packages remain pure TS so backend/player consumers never need a Svelte build.

## 6. Recommended sequence (synthesis)

Same shape as the passes in §0.2 (note: §6.1 fixes the earlier wording —
`package-sha` is relocated mechanically into `project-model`, i.e. it rides
with the Pass 2 extraction, not with `camera-core`):

1. Extract `camera-core` (in progress, P15) — unblocks both directions.
2. Package-extraction pass: `project-model` + `package-sha` + `layout-core`
   (when both apps genuinely need `layout-core`).
3. Freeze + lift the `/museum` visitor app on the pinned packages (the actual
   cheap freeze) — App-split pass.
4. Split the editor app; trim editor→visitor imports — same App-split pass.
5. Decide relic fate explicitly (keep as gated editor relic entry or
   deprecate/redirect) — folded into the App-split pass.
6. Backend-provisioning pass (Render `apps/api` + Neon Postgres), then the first
   persistence slice (Save/Load + managed identity + minimal ownership), then
   R2 asset storage. Defer `runtime`/`api-contract`/`player` and broader auth
   until real need.

## 7. Open decisions — resolved

All four open decisions were resolved by the owner on 2026-08-29 (§0.1):

- Fork vs. pinned-share → **pinned-share** (§0.1.1).
- The `/museum/editor` relic fate → **gated relic entry, no fork** (§0.1.4).
- Platform stack + deploy → **Fastify / Render / Neon Postgres / R2 / managed
  identity auth** (§0.1.5).
- Auth scope for the first slice → **managed identity + single-user Save/Load
  authorization only** (§0.1.7).

§6 remains the ratified execution sequence; §0.2 is the authoritative numbered
order.
