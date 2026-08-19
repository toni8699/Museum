# P7 — Museum-editor facade collapse (refactor umbrella)

**Date:** 2026-08-19
**Status:** Approved — Option B (P7.4 before P1.5, recorded 2026-08-19; **P7.4 shipped 2026-08-19**)
**Tracker:** [`docs/plans/README.md`](README.md) — **P7**, depends on: P1
**Source:** refactor audit (2026-08-19) — findings 1, 3, 4, 2; the H1-era
decomposition was halted mid-slice and the "once Slice 5/6 lands" promises in
`museum-editor.svelte.ts` are not scheduled anywhere in the current tracker.

## Original plan (archive) — what the decomposition intended

The facade split's origin is the archived
[`2026-08-03-priority-1-file-splits-plan.md`](../archive/plans/phase-5-textures/2026-08-03-priority-1-file-splits-plan.md)
(Phase 5.2 Priority-1 file splits). Facts that govern this plan:

- **The goal was a thin composition root, not a deleted facade.** The plan
  split the 3,640-LOC `museum-editor.svelte.ts` into `store/` controllers
  "leaving a thin composition root that keeps the facade surface
  **byte-identical**" (end-state target ≈ 2,400 LOC).
- **The residue was deferred on purpose, with a prescribed path.** Slice 3
  note: "The residual getter/setter/delegation blocks are the facade's public
  surface — they must stay for the freeze. List them in the hand-off as a
  future-slice candidate (**thinning them means moving their reads onto
  sub-stores**, which is a separate risk profile); do not over-extract here."
  That future slice never landed — **this plan IS that slice**.
- **The suggested next slice is explicit.** Slice 6's hand-off pointer: "fold
  `navigationStateFromLegacy` / `navigationSelectionFromState` into
  `selection-store.svelte.ts`". Both helpers are still in the facade today
  (lines 126–220) — but only the **read** adapter (`navigationSelectionFromState`)
  moves: `navigationStateFromLegacy` is a write-side adapter whose sole caller
  is the bridging setter P7.1 deletes (facade line 615), so it dies with it.
- **The selection end-state was designed in H1 s4** (archived
  [`2026-08-15-graphics-h1-s4-unified-hierarchy.md`](../archive/plans/pre-h1-letters/2026-08-15-graphics-h1-s4-unified-hierarchy.md)):
  reads derived from `selectionStore`, writes via `selectionActions`, camera
  direction owned by the discovery slots. The facade's bridging setters were
  the stopgap until "Slice 5 migrates" the call sites — the migration is this
  plan's job.
- **Type collapse already landed.** The `EditorCameraPreview` family now has
  one declaration in `museum-editor.types.ts` ("collapsing them here closes the
  todo one slice ahead of plan"); the controller imports from the barrel and
  only re-exports names for internal callers. The "Locally-redeclared… Slice 6
  collapses" comments still in `camera-preview-controller.svelte.ts`,
  `document-store.svelte.ts`, and the facade are stale tombstones — comment
  cleanup, not a type move (see residue removal).

So the correct framing is **continue the de-coupling the original plan
prescribed** — move reads onto sub-stores, fold the navigation helpers,
migrate the remaining single-owner logic — not "delete the residue" and stop.
The one deferred item that already landed on its own (the preview-type
collapse) needs only its stale comments cleaned.

## Outcome

Complete the decomposition the original plan deferred (see above) — continue
the de-coupling rather than stop at residue removal. Zero user-visible
behavior change: the editor and the `/museum/editor` relic keep working
exactly as today. End state: `MuseumEditorStore` is a **composition root +
delegation surface** — every piece of state and real logic is owned by a
sub-store/controller, and the public surface stays importable forthe relic, the 45 modules that import `MuseumEditorStore` today (39 `.svelte`
components — regenerate the inventory with `grep -rl "MuseumEditorStore"
apps/museum/src` at scheduling time; fixed counts rot), and the integration
suite (the freeze the original plan demanded).

1. **Selection decoupling** — the H1 s4 end-state: the read adapter folds
   into `selection-store`, the write adapter dies with the bridging setters
   whose write sites migrate to `selectionActions`; reads become derived
   getters.
2. **Facade thinning** — every remaining single-owner read/computation moves
   to its owning sub-store (the original plan's deferred "future slice":
   "moving their reads onto sub-stores"); cross-store combinators stay at the
   composition root.
3. **Residue removal rides along** — shims (`editor/project/*`,
   `editor/layout/*`), Chopin defaults, shell-boot duplication, alias blocks,
   stale "Slice 6" tombstone comments (the preview-type collapse itself
   already landed).

**Definition of done (P7 close):**
- P7.1 — `navigationSelectionFromState` lives in `selection-store.svelte.ts`;
  `navigationStateFromLegacy` deleted with the bridging setter it feeds; zero
  bridging setters on the facade; every write site uses `selectionActions`;
  reads are derived getters.
- P7.5 — zero **misplaced single-owner** logic on the facade beyond
  composition + delegation: `isDirty` / `validation*` semantics canonical on
  `document-store` **with the validation pre-check** (the sub-store currently
  drops it — the facade's version is the correct one); hover state owned by
  its controller; `cameraTimelinePlayhead` owned by the timeline controller.
  Cross-store combinators stay at the composition root by design: `canExport`
  (validation × transaction state), the cluster → member-id expansion
  (`selection-store` owns no document data), and the `getSelected*Root`
  selectors (selection × roots — the registries already live in
  `scene-roots`).
- P7.2 — zero shim files under `editor/project/` + `editor/layout/`;
  `layout-preview-geometry.ts` de-hybridized.
- P7.3 — zero Chopin symbols in `lib/editor/` outside `MuseumEditorApp.svelte`:
  grep gate on `chopinRuntime | chopinProject | museumSceneDocument` and on
  `$lib/content/chopin-` imports.
- P7.4 — both shells share the boot composable (dirty-guard + texture
  lifecycle; shortcuts shell-owned).
- Zero `Slice N` / "re-exported so consumers stable" comment tombstones.
- **1,802+ tests green · `svelte-check` 0/0 · build clean · relic routes
  behavior-equivalent** (route smoke per §P7.4 item 5 — not byte-identical,
  which is unverifiable after code moves).

**Not a DoD:** a line-count target. The original plan's ≈2,400-LOC end-state
assumed only the three Priority-1 extractions; P7's thinning goes further and
the freeze keeps the delegation surface by design — so no numeric target is
set. The itemized DoD above is the gate.

## Increments

| ID | Content | Finding | Depends | Behavior change |
|---|---|---|---|---|
| **P7.1** | Selection decoupling: read adapter folds into `selection-store`; write adapter dies with the bridging setters; write sites → `selectionActions` (the original plan's suggested slice) | 1 | — | none |
| **P7.2** | Delete dual-namespace shims (`editor/project/*`, `editor/layout/*`, de-hybrid `layout-preview-geometry.ts`) | 3 | — | none |
| **P7.3** | Chopin defaults → explicit inputs (`createMuseumEditorStore`, `editor-camera-path`, `editor-camera-view`) | 4 | — | none (relic passes Chopin explicitly) |
| **P7.4** | Extract shared editor-shell boot composable (`MuseumEditorApp` + `EditorApp`) — dirty guards + texture lifecycle only; shortcuts stay shell-owned | 2 | — | none |
| **P7.5** | Facade thinning: move remaining single-owner reads to owning sub-stores (the deferred "future slice"); close the `isDirty` divergence | 1 | P7.1 | none |

## Implementation readiness (2026-08-19)

Per-increment status after the pre-implementation surveys (grep-verified):

| ID | Status | Notes |
|---|---|---|
| **P7.1** | **need plan** | Write-site model incomplete: most writes are host-mediated, not `store.X =`. Writable host slots at `controller-hosts.ts` 315/414/564/641, consumed by `path-anchor-mutator` (×2), `navigation-graph-mutator` (×2), `view-keyframe-controller` (×2), `placement-cluster-mutator` (×1) via `this.host.… =`. Direct writes: `EditorSelection.svelte` 230–232, `camera-gizmo-adapter.svelte.ts` 342, facade internals 2531–2646. The acceptance grep misses host writes (only `svelte-check` catches them). Open decision: rewire the 4 host slots to `selectionActions`, or delete the slots and have controllers call `selectionActions` directly. |
| **P7.2** | **ready** | Mechanical; site list generated by grep; gates defined. |
| **P7.3** | **ready** | 10-site signature-trap inventory recorded; ~15 test files confirmed. Optional: enumerate `editor-camera-view`'s 4 default-site callers (covered by the pass-`store.rooms` pattern + `svelte-check`). |
| **P7.4** | **ready** | Contract decided (dirty-guard + texture lifecycle only); pure-core extraction + route smoke defined. |
| **P7.5** | **need plan** | Playhead has **three** write paths, not two: `viewKeyframe` host (422–426) → `view-keyframe-controller` (523); `cameraTimeline` host (489–493) → `camera-timeline-controller` (161/178/312/441/454/499); `camera-preview-commands` casts the **whole facade** as its host (`this as unknown as EditorCameraPreviewCommandsHost`, facade 480) and writes `facade.cameraTimelinePlayhead` directly (585/618/713) — a read-only facade getter breaks it at compile time. Hover owner open: single writer `setNavigationHover` (facade 2101–2102); readers `EditorViewport.svelte` 143, `Workspace3DView.svelte` 211, `EditorCameraPathHelpers.svelte` 188–189. `pendingFramePlacementIds`/`pendingFrameVersion` confirmation deferred. |

Both **need plan** items are small pre-briefs (the surveys above are already answered); they do not block scheduling, but a developer cannot pick up P7.1 or P7.5 without them.

## Sequencing

Two options; the repo's status authority (tracker + CURRENT) decides.

**Option A (default, no re-prioritization):** all increments land after
**P1 close** (P1.5 + P1.6 shipped). P1.5/P1.6 mount the camera Plan surface
and converge framing authoring; both edit the facade, its consumers, and
`EditorApp.svelte` — running the decoupling concurrently would fight over
`museum-editor.svelte.ts` diffs. After P1 ships, two waves:
- **Wave 1 (decoupling):** P7.1 → P7.5, in order (P7.5 depends on P7.1's
  nav-read move).
- **Wave 2 (mechanical):** P7.2 + P7.3 — dependency-independent, but land as
  **serial green diffs**, not parallel branches: both touch the same files as
  Wave 1 (`museum-editor.svelte.ts` — P7.2's alias re-exports, P7.3's
  `createMuseumEditorStore` options; `store/document-store.svelte.ts` —
  P7.3's Chopin seeds, P7.5's `isDirty`/validation moves), so concurrent
  branches collide on those diffs. Serial order, each green before the next.
- P7.4 is independent of the facade; see Option B.

**Option B (recommended, needs owner decision):** schedule **P7.4 before
P1.5** because it touches `MuseumEditorApp.svelte` + `EditorApp.svelte` only
and stops the two-shell divergence before P1.5 edits `EditorApp.svelte` —
smallest collision window. Requires the owner to (1) approve P7 and (2)
record the re-prioritization in the tracker + point CURRENT's single next
action at P7.4; otherwise Option A stands and the plan claims nothing about
order.

**Never:** Wave 1 concurrently with in-flight P1 slices.

## Gates

- **P1 close** — all increments start after the camera overhaul ships,
  **unless the owner approves Option B** (P7.4 before P1.5) and records it in
tracker + CURRENT.

## Boundaries

- **Behavior-preserving refactor.** No schema, export format, selection
  semantics, or rendered output changes. No new props on public components.
- **Public-surface freeze (from the original plan).** `MuseumEditorStore`
  exports and every consumer-visible method/getter stay importable with
  identical signatures — the facade shrinks by *delegation*, not by removal,
  except the bridging setters P7.1 migrates and the alias blocks P7.1
  delete (both compile-gated, svelte-check catches stragglers).
- **Relic freeze.** `/museum` + `/museum/editor` behavior unchanged. The relic
  keeps booting Chopin and stays layout-less / `onSelectionActivate`-less.
- **Visitor purity.** All touched files are editor-side; no editor code enters
  `/museum` visitor chunks.
- **No new abstraction.** Code moves onto the existing `store/` sub-stores and
  the controller-hosts pattern; no new layers. The one new file (P7.4 boot
  composable) replaces duplicated code, it does not wrap it.
- **No commits unless asked** (repo rule; rollback is per-slice revert, see §7
  of each brief).

## Out of scope (deferred)

- `EditorSelection.svelte` pick-core extraction (audit finding 5) — fold into
  P1.5 camera-plan pick work instead; same surface, do not run concurrently.
- `EditorSceneTree`'s `museumRooms` hardcode — relic-only path, dies with the
  relic; not a refactor.
- Dead workspace packages (`note-cursor`, `audio-plink`, `portfolio-content`,
  `portfolio-hud`, `scroll-travel`) — one-line lockfile cleanup, fold into any
  dependency touch (P4 GLB import is the natural owner).
- Frozen visitor lane (`camera-motion.ts`, `camera-route.ts`) and
  `wall-mesh-builder.ts` — size justified by cohesion, leave alone.

---

## P7.1 — Selection decoupling (brief)

### 1. User outcome and out-of-scope behavior

**Outcome:** the selection model reaches the H1 s4 end-state the original
plan designed. The facade's selection surface becomes **read-only derived**:
- `navigationSelectionFromState` moves into `store/selection-store.svelte.ts`
  (the original plan's explicit suggested next slice). `navigationStateFromLegacy`
  is **deleted, not moved** — its sole caller is the deleted `set
  navigationSelection` (facade line 615); it is a write-side adapter for the
  pre-slice surface and has no read role. Direction stays owned by the
  discovery slots per H1 s4 (`navigationSelectionFromState` drops direction —
  "discovery owns it").
- The four bridging setters (`set selectedRoomId`, `set selectedPlacementIds`,
  `set selectedClusterId`, `set navigationSelection`) are deleted **only
after every write site migrates** to `selectionActions` / the reducer; the
read getters stay, derived from `selectionStore`.
- No feature changes; components and tests that import `MuseumEditorStore`
  keep working (reads unchanged).

**Out of scope:** the state moves (`cameraTimelinePlayhead`, hover) — those
are P7.5; the alias-block deletion — P7.1c; stale "Slice 6" tombstone comment
cleanup — residue removal. This increment is selection only.

### 2. Source components and existing APIs to reuse

- `store/selection-store.svelte.ts` — the target home for the two navigation
  helpers and the derived getters.
- `store/selection-actions.svelte.ts` — the write path every bridged call
  site migrates to (already the reducer for the parallel-tuple model).
- The archived H1 s4 contract
  ([`2026-08-15-graphics-h1-s4-unified-hierarchy.md`](../archive/plans/pre-h1-letters/2026-08-15-graphics-h1-s4-unified-hierarchy.md))
  — the authoritative read/write semantics; its contract tests are the model
  for the migration assertions.
- `tests/lib/editor/app/contracts.test.ts` — pins the facade surface; stays
  green.
- `tests/lib/editor/editor-test-utils.ts` — shared test factory.

### 3. New props / state / dependencies

- **Moved (verbatim, `@internal` to `selection-store`):**
  `navigationSelectionFromState` (facade lines 161–220).
- **Deleted (after migration, compile-gated):** the four bridging setters
  and, with them, `navigationStateFromLegacy` (facade lines 126–158) — it
  exists only to serve the deleted setter. The read getters stay, now pure
  `selectionStore` derivations. The cluster → member-id expansion in
  `selectedPlacementIds` **stays at the composition root**: `selection-store`
  owns no document data (clusters resolve against `document.placements`), so
  moving it would force a new document dependency into the selection store.
- **No new dependencies.** No new public store options.

### 4. Mount/unmount and selection semantics

- **Mount/unmount:** none — selection is store-internal plumbing.
- **Selection semantics (unchanged, per H1 s4):** writes via
  `selectionActions` (workspace set, navigation set); direction stays owned
  by the reducer's discovery slots, never carried in the navigation
  selection type; room-only selection and deselect never fire
  `onSelectionActivate`; the S3 detach-then-attach contract is untouched.
- `#reconcileSelection` and the after-replace listener list stay on the
  facade (composition root) and keep reading through the same getters.

### 5. Acceptance tests and manual scenarios

- Grep gate (compile-time): `store.selectedRoomId =`, `store.
  selectedPlacementIds =`, `store.selectedClusterId =`, `store.
  navigationSelection =` → **zero matches** in `src/` after P7.1.
- `contracts.test.ts` green unchanged; existing selection/cluster/navigation
  describes in `museum-editor-*.test.ts` green with zero expectation edits.
- New/extended tests on `selection-store`: the moved read adapter behaves
  identically (direction dropped on read, discovery slot written on set).
- Manual: select room / multi-select placements / select cluster / select
  camera node + connection + direction via tree, viewport, and timeline;
  undo/redo across each; relic `/museum/editor` same smoke minus layout.

### 6. Relic / Plan / visitor boundaries

- Relic and visitor untouched behaviorally (same facade reads).
- P1.5's "Existing seams to reuse" list references `selectionActions.
  selectNavigationNode` / `selectConnection` etc. — those are the migration
  targets and stay valid.

### 7. Rollback / fallback split

- 7.1a move the two helpers into `selection-store` + migrate every write site
  to `selectionActions` (reversible; suite green — this is the bulk).
- 7.1b delete the four bridging setters (compile-gated).
- 7.1c delete the selection-adjacent alias blocks + tombstones.
- If a write site is found after 7.1b (missed grep), restore that setter for
  the site only — do not reintroduce the block.

---

## P7.2 — Shim deletion (brief)

### 1. Outcome / out of scope

One canonical path per module. Delete:
- `editor/project/project-codec.ts`, `editor/project/project-types.ts`
  (canonical: `$lib/project/*`).
- `editor/layout/` shims: `arch-profile.ts`, `curve-geometry.ts`,
  `draft-geometry.ts`, `layout-auto-bezier.ts`, `layout-preview-bounds.ts`,
  `layout-types.ts`, `layout-validation.ts`, `rooms-to-layout.ts`
  (canonical: `$lib/layout/*`; `rooms-to-layout` canonical:
  `$lib/content/rooms-to-layout`).
- De-hybrid `layout-preview-geometry.ts`: move `floorShapePoints` /
  `ceilingShapePoints` to a real module (e.g. `layout-shape-points.ts` under
  `editor/layout/`), delete the re-export line.
- The `museum-editor.svelte.ts` alias re-exports covered in P7.1c.

Out of scope: renaming any canonical module; touching `$lib/layout/*` contents.

### 2. Reuse

Existing canonical modules are the targets; `grep -rl` over `apps/museum/src`
for each shim name yields the full site list (~36 sites; 15 are relative
`./layout-types`-style imports inside `editor/layout/`).

### 3. New props/state/dependencies

None. Pure import-path rewrite.

### 4. Semantics

Import identity only. Note `editor/layout/rooms-to-layout.ts` re-exports
`$lib/content/rooms-to-layout` — the two lanes share that compiler; the shim's
only job was a stable relative path.

### 5. Acceptance tests

- `svelte-check` 0/0 (compile gate for all sites).
- Full suite green (tests import both namespaces today; update the ~4 test
  files that import `$lib/editor/project/*` to `$lib/project/*`).
- Grep gate: zero matches for `$lib/editor/project/` and `editor/layout/`
  shim names outside removed files.

### 6. Boundaries

No relic/visitor/plan impact (import paths only, editor-side).

### 7. Rollback

Mechanical; one diff per namespace (project, layout). Revert independently.

---

## P7.3 — Chopin defaults → explicit inputs (brief)

### 1. Outcome / out of scope

Editor-domain code never silently resolves against the frozen relic. Changes:
- `createMuseumEditorStore(options)`: `document` and `rooms` become **required**
  options (remove `museumSceneDocument` / `chopinRuntime.rooms` defaults).
  `MuseumEditorApp.svelte` passes
  `{ document: museumSceneDocument, rooms: chopinRuntime.rooms, relic }`
  explicitly.
- `editor-camera-path.ts` (**5** default params: lines 111, 136, 180, 192,
  207) and `editor-camera-view.ts` (**4** default params: lines 126, 165,
  181, 202): `rooms` becomes a required argument; callers pass `store.rooms`
  (already the pattern at the surviving call sites).
  **Signature trap (must land in the same diff):**
  `createDraftConnectionPositionPath(document, connectionId, direction =
  'forward', rooms = chopinRuntime.rooms)` (lines 132–136) has the optional
  `direction` **before** the `rooms` default. Removing only the `rooms`
  default creates a required parameter after an optional one — does not
  compile. **Best fix (verified against source): preserve parameter order,
  make both required** — `(document, connectionId, direction, rooms)`.
  Reordering is **not** an option: all 7 source callers pass `direction`
  positionally as the 3rd argument, so a reorder would silently land
  `direction` in the `rooms` slot. **Call-site migration (recorded — 10
  call sites across 5 files):**
  - 7 source calls already fit the required signature unchanged (each
    already passes all four args): `EditorSelection.svelte` (×3: ~540,
    ~712, ~756 — `handle.direction` / `'forward'` / `'forward'`),
    `editor-camera-view.ts` (~207 — `direction`), `EditorCameraPathHelpers
    .svelte` (~217 — `'forward'`), `store/view-keyframe-controller
    .svelte.ts` (×2: ~218, ~609 — `preview.direction` /
    `selection.direction`).
  - 3 test calls in `tests/lib/editor/editor-camera-path.test.ts` (~111,
    ~122, ~123–127) update to explicit `direction` + registry: two currently
    omit direction (default), one passes `'reverse'` positionally without
    rooms.
- `store/document-store.svelte.ts` and
  `layout/layout-preview-state.svelte.ts`: remove Chopin-seeded defaults
  (note `layout-preview-state.svelte.ts:1` imports both `chopinProject` and
  `museumSceneDocument` — both must go, see gate below); `EditorApp.svelte`
  already passes explicit seeds — extend to the remaining default sites.

**Counts are informational, not the acceptance gate.** The gate is a grep:
`grep -rn "chopinRuntime\|chopinProject\|museumSceneDocument" apps/museum/src/lib/editor`
**plus** `grep -rn "\$lib/content/chopin-" apps/museum/src/lib/editor` (imports
of `chopin-project`, `chopin-layout`, `chopin-room-presentation`)
→ zero matches outside `MuseumEditorApp.svelte`. Fragile counts rot; the gate
does not. The symbol gate alone misses `chopinProject` (used by
`layout-preview-state.svelte.ts`) — the import gate catches it.

Out of scope: changing the relic's boot data, `museum-scene.json`,
`chopin-project.json`, or visitor code.

### 2. Reuse

- `tests/lib/editor/editor-test-utils.ts` — add `createTestEditorStore()`
  that passes an explicit empty or fixture document + registry, and update the
  ~15 test files that call `createMuseumEditorStore(` with no options.
- `MuseumEditorApp.svelte` is the relic seed site (imports `chopinRuntime`
  once, deliberately).

### 3. New props/state/dependencies

`MuseumEditorStoreOptions` loses its two optional fields (or they become
required — same effect). No new deps.

### 4. Semantics

The editor's "boot empty" path (`EditorApp.svelte`) is unchanged — it already
passes `bootProject.scene` + `createLayoutRoomRegistry(bootProject.layout)`.
The only behavior-sensitive surface is the relic + tests, both updated in the
same increment. A store constructed with an empty document must contain no
Chopin rooms — that becomes the new regression test.

### 5. Acceptance tests

- New test: `createMuseumEditorStore` with empty doc/registry → `store.rooms`
  has zero entries and `store.document` contains no Chopin ids.
- New test: relic boot (`createMuseumEditorStore({ document:
  museumSceneDocument, rooms: chopinRuntime.rooms, relic: true })`) → boots
  Chopin exactly as today (mirror an existing relic assertion).
- Grep gate: `chopinRuntime` / `chopinProject` / `museumSceneDocument` and
  `$lib/content/chopin-` imports appear in `lib/editor/` only in
  `MuseumEditorApp.svelte` (and tests).
- `editor-camera-path.test.ts` compiles with the required-args signature
  (the 3 test calls updated); `svelte-check` 0/0 proves no other caller
  relies on the removed defaults.
- Full suite green; `svelte-check` 0/0.

### 6. Boundaries

Relic route passes Chopin explicitly — behavior identical. Visitor untouched.

### 7. Rollback

Reversible per call-site batch; the store-option change and the test-utils
helper land together so the suite is green in one diff.

---

## P7.4 — Shared shell-boot extraction (brief)

### 1. User outcome and out-of-scope behavior

**Outcome:** the boot glue duplicated between `MuseumEditorApp.svelte` (relic,
`/museum/editor`) and `EditorApp.svelte` (`/`, `/editor`) lives in one
composable. A dirty-tracking or texture-lifecycle fix is written once and both
routes pick it up.

**Out of scope:** merging the two shells' chrome (left sidebar, viewport,
workspace cells differ by design — P1.1 shell inversion). The relic stays a
separate component; only the shared *boot plumbing* is extracted.

**Scope boundary (review fix): dirty-guard + texture lifecycle only.**
Shortcut wiring is **not** extracted: the relic registers
`registerEditorShortcuts(store, refs, interactionStore)` (3-arg,
`MuseumEditorApp.svelte` ~line 121) while the editor passes deselection,
stale-layout, and gizmo-capability callbacks (6-arg, `EditorApp.svelte` ~line
228). A single composable signature cannot cover both without leaking the new
shell's gating model into the relic — so shortcuts stay shell-owned, and the
composable accepts no shortcut callbacks. If the two ever converge on the
capability model, that is a relic-unfreeze decision, not this plan.

### 2. Reuse

- `store/binary-texture-store.svelte.ts` — `clearExcept` teardown.
- `$lib/museum/materials/texture-cache` — `setDefaultTextureSourceLoader`.
- The `confirmSceneReplacement` / `confirmLayoutReplacement` /
  `confirmNavigation` + `beforeNavigate` + `beforeunload` block is currently
  copy-pasted verbatim in both files (verified identical in the audit).

### 3. New props/state/dependencies

New file `hooks/editor-shell-boot.svelte.ts` exporting a composable, e.g.
`useEditorShellBoot({ store, layoutPreview })`, returning the confirm helpers
(`confirmSceneReplacement`, `confirmLayoutReplacement`, `confirmNavigation`)
the shells pass to their app bars. Signature: reads `store.isDirty` +
`layoutPreviewIsDirty(layoutPreview)`; no new state beyond what the shells
already hold; **no `relic` flag and no shortcut/config callbacks** (the relic
needs no special handling once shortcuts stay shell-owned — both shells have
the same store + layoutPreview shapes). The composable also owns the
`beforeNavigate` guard + `beforeunload` effect + texture-loader
install/teardown, all parameterized only by the same two inputs.

### 4. Mount/unmount and selection semantics

- Mount: `setDefaultTextureSourceLoader(editorSourceLoader)` (loader created
  inside the composable).
- Unmount: `setDefaultTextureSourceLoader(null)` + `BinaryTextureStore
  .clearExcept(new Set())` (HMR object-URL revocation, per the existing
  comment).
- `beforeNavigate` + `beforeunload` effects registered/unregistered exactly as
the shells do today.
- Selection: untouched — the composable has no selection role.

### 5. Acceptance tests and manual scenarios

**Existing coverage is insufficient — do not assume it.**
`museum-editor-shell.test.ts` covers only the shortcut Escape cascade; nothing
tests `beforeNavigate`, `beforeunload`, or loader teardown. The composable
needs focused tests — but the harness does not exist yet: `vitest.config.ts`
runs `environment: 'node'` and the repo has no jsdom, happy-dom, or Svelte
component-testing dependency (`onMount` / `$effect` / `beforeNavigate` cannot
run under the current harness). Two options; **option 1 is preferred** (no new
dependency, matches "no new abstraction"):

1. **Pure-core extraction.** The composable file exposes the guard logic as
   pure, node-testable functions; the `.svelte.ts` wrapper stays a thin glue
   of `onMount` / `$effect` / `beforeNavigate` around them:
   - `computeConfirmNavigation({ sceneDirty, layoutDirty })` → boolean +
     label (the two shells' label logic preserved).
   - `createUnloadGuard(target: EventTargetLike)` → `{ attach, detach }`
     (listener added when dirty, removed when clean — testable against an
     injected fake `window`/`EventTarget` under node).
   - `createTextureLifecycle(loader, binaryStore)` → `{ install, teardown }`
     (`setDefaultTextureSourceLoader(…)` on install; `null` +
     `clearExcept` on teardown).
   Unit tests cover these three; the thin glue is verified by manual route
   smoke only.
2. **Add harness** (only if owner wants mounted-component tests): add
   `jsdom` (or `happy-dom`) + `@testing-library/svelte` to devDependencies
   and a jsdom `environmentMatchGlobs`/per-file environment for the composable
   test. This is a new dependency + config change; not required by the
   plan's outcome.

**Manual route smoke (the gate for the thin glue):**
- `/` and `/editor`: edit scene → navigate → confirm dialog; edit layout →
  navigate → confirm; reload mid-edit → beforeunload prompt; texture re-load
  after HMR remount (the original clearExcept bug scenario); shortcut smoke
  (W/E/R/T + Escape).
- `/museum/editor` (relic is **layout-less** — no layout scenario): edit
  scene → navigate → confirm; reload mid-edit → beforeunload prompt;
  shortcut smoke. Layout edit/confirm applies to `/` and `/editor` only.

### 6. Boundaries

- Relic behavior-equivalent (extraction moves code, so "identical" is
  unverifiable; the route smoke above is the gate). The composable must not
  import layout-preview gating into the relic path — both shells already pass
  a `layoutPreview` state, so no `relic` flag is needed.
- Visitor `/museum` untouched; composable is editor-side.

### 7. Rollback

Single-diff extraction; revert restores both shells. If the relic's
behavior forks during extraction (e.g. its `layoutPreview` state shape
differs), keep the composable's `layoutPreview` parameter optional and pass
the relic's instance — fallback split documented, not a design change.

---

## P7.5 — Facade thinning: reads onto sub-stores (brief)

### 1. User outcome and out-of-scope behavior

**Outcome:** the original plan's deferred "future slice" — every remaining
single-owner read/computation leaves the facade for its owning sub-store. End
state: `MuseumEditorStore` holds composition (constructor wiring,
after-replace listeners), orchestration (`#reconcileSelection`,
document-transaction glue, `#prepareDocumentReplacement`), one-line
delegates, and the cross-store combinators that are the composition root's
actual job (`canExport`, cluster → member-id expansion, `getSelected*Root`
selectors) — no **misplaced single-owner** logic. No feature changes; the
public surface is unchanged (delegates keep the signatures).

**Out of scope:** selection migration (P7.1), shims (P7.2), Chopin defaults
(P7.3), shell boot (P7.4), stale type-collapse tombstones (residue removal).

### 2. Source components and existing APIs to reuse

- `store/document-store.svelte.ts` — takes `isDirty` / `validationIssues`
  semantics. **Divergence to close:** the facade's `isDirty` preserves
  `!validation.success || …` (the pre-check), the sub-store's drops it (the
  facade comment calls the sub-store version a "behavioural regression caught
  by the review pass"). The sub-store adopts the pre-check; the facade getter
  becomes a delegate. `canExport` **stays at the composition root** — it
  combines document validation with `isDocumentTransactionActive`, two
  ownership domains.
- `store/selection-store.svelte.ts` — does **not** take the cluster →
  member-id expansion; `selectedPlacementIds` stays at the composition root
  (`selection-store` owns no document data, and clusters resolve against
  `document.placements`).
- `store/scene-roots.svelte.ts` — already owns the roots registries; the
  facade's register/unregister/get delegates are already one-line
  `this.roots.*` calls (facade 2680–2710) and stay as-is. The
  `getSelected*Root` selectors (facade 2708, 2728, 2776) **stay at the
  composition root** — they combine selection + root lookup, a cross-store
  combinator, not single-owner logic.
- `store/camera-timeline-controller.svelte.ts` — takes `cameraTimelinePlayhead`.
- `store/navigation-graph-mutator.svelte.ts` (or `session-state` per
  readership survey) — takes `hoveredConnectionId` / `hoveredAnchorId`.
- `store/controller-hosts.ts` — host slots for the moved state (see §3).

### 3. New props / state / dependencies

- **State moves:**
  - `cameraTimelinePlayhead` (facade `$state` ~line 743) → timeline
    controller as owned `$state`. **Host rewiring (mandatory):**
    `controller-hosts.ts` declares `cameraTimelinePlayhead: number` with
    **get+set** on two hosts (lines 107, 422–426, 489–493) assigning
    `source.cameraTimelinePlayhead = value`. Rewire both host setters to the
    controller's owned setter (e.g. `setPlayhead(value)`); getters read the
    controller state. Facade getter becomes read-only — never a write target.
    Survey which hosts write (preview FSM during playback, timeline
    controller on scrub) before dropping any setter.
  - `hoveredConnectionId` / `hoveredAnchorId` (facade `$state` ~804–805) →
    owner per readership; facade getter + `setNavigationHover` delegate keep
    the null-clears-anchor behavior.
  - `pendingFramePlacementIds` / `pendingFrameVersion` — confirm the getter
    path (already written to `session`) and remove any duplicated facade
    field.
- **Read moves:** `isDirty` / `validationIssues` / `baselineCanonicalJson`
  semantics → `document-store` (pre-check adopted). **Stays at the
  composition root:** `canExport` (validation × transaction state), the
  cluster → member-id expansion (`selectedPlacementIds`), and the
  `getSelected*Root` selectors (selection × roots). `projectExportBlocker`
  stays where it is (`store/project-export-store` already owns it — the
  facade getter becomes a delegate).
- **No new dependencies.** No new public store options; `createMuseumEditorStore`
  signature unchanged.

### 4. Mount/unmount and selection semantics

- None — state/read plumbing inside the already-mounted store. Selection
  reads still route through the same facade getters (now one-line delegates).

### 5. Acceptance tests and manual scenarios

- `contracts.test.ts` green unchanged (reads identical).
- New test: `documentStore.isDirty` returns true for an invalid document even
  when canonical JSON matches baseline (the pre-check the sub-store currently
  drops) — pins the divergence close.
- Move the playhead/hover assertions with the state into their owners' suites
  (session-state / camera-timeline / navigation-graph-mutator tests).
- Manual: dirty → export blocked; undo/redo → dirty flips; timeline scrub
  playhead; hover a connection edge in 3D; roots-driven gizmo behavior
  (transform on selected placement/camera helper); relic smoke.

### 6. Relic / Plan / visitor boundaries

- Relic and visitor untouched (same facade reads). No editor code into
  visitor chunks.

### 7. Rollback

- One diff per moved group (playhead+hover, dirty/validation, cluster
  expansion, roots). Each is reversible independently; suite green after
  each.

---

## Appendix — verified residue inventory (2026-08-19)

- `museum-editor.svelte.ts`: 2,850 lines; `$state` fields at ~743
  (`cameraTimelinePlayhead`), ~804–805 (`hoveredConnectionId`,
  `hoveredAnchorId`); bridging setters + `navigationStateFromLegacy`
  (126–158, deleted with the setters) + `navigationSelectionFromState`
  (161–220, moves to `selection-store`); alias re-export blocks at 219–222,
  229, 262–280, 1125–1130; stale "Slice 6 collapses" comments at 219, 261,
  398.
- Shims: `editor/project/{project-codec,project-types}.ts` (1–5 lines each);
  `editor/layout/` — `arch-profile` (8), `curve-geometry` (20), `draft-geometry`
  (9), `layout-auto-bezier` (11), `layout-preview-bounds` (1),
  `layout-types` (12), `layout-validation` (7), `rooms-to-layout` (8);
  `layout-preview-geometry.ts` hybrid (real fns + re-export).
- Chopin coupling: 18 `chopinRuntime`/`museumSceneDocument` references across
  `editor-camera-path.ts`, `editor-camera-view.ts`, `museum-editor.svelte.ts`,
  `store/document-store.svelte.ts`, `layout/layout-preview-state.svelte.ts`;
  `CURRENT.md` Traps documents the `store.rooms`-vs-`chopinRuntime.rooms`
  foot-gun.
- Shell duplication: `confirm*` trio + `beforeNavigate` + `beforeunload` +
  texture loader + `BinaryTextureStore.clearExcept` + shortcut registration
  duplicated in `MuseumEditorApp.svelte` (225 lines) and `EditorApp.svelte`
  (370 lines), with "keep in sync" comments in both.
- Type collapse already landed (no increment needed): the
  `EditorCameraPreview` family is declared once in `museum-editor.types.ts`
  ("collapsing them here closes the todo one slice ahead of plan"); the
  controller imports it from the barrel (`camera-preview-controller.svelte.ts`
  line 53) and re-exports `CameraPreviewNode`-family names only for internal
  callers. Remaining "Locally-redeclared… Slice 6 collapses" comments
  (`camera-preview-controller.svelte.ts` 23–24, 130; `document-store.svelte
  .ts` 25 — that one about the duplicated `cloneMuseumSceneDocument`, not
  preview types) are stale → comment cleanup under residue removal.
- Host writable state: `controller-hosts.ts` `cameraTimelinePlayhead`
  get+set on two hosts (107, 422–426, 489–493) — P7.5 rewiring.
- Archive pointer: original split intent in
  [`2026-08-03-priority-1-file-splits-plan.md`](../archive/plans/phase-5-textures/2026-08-03-priority-1-file-splits-plan.md)
  (deferred-thinning note in Slice 3; suggested next slice in Slice 6);
  selection end-state in
  [`2026-08-15-graphics-h1-s4-unified-hierarchy.md`](../archive/plans/pre-h1-letters/2026-08-15-graphics-h1-s4-unified-hierarchy.md).
