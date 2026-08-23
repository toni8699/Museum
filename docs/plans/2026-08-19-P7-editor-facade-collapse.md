# P7 — Museum-editor facade collapse (refactor umbrella)

**Date:** 2026-08-19
**Status:** Approved — Option B (P7.4 before P1.5, recorded 2026-08-19; **P7.4 shipped 2026-08-19**). **P7 CLOSED 2026-08-23** — all increments shipped (P7.1, P7.5, P7.2, P7.3, P7.6; P7.4 via P1); see the P7.6 implementation note below the brief.
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
  (134–190) — the **read** adapter (`navigationSelectionFromState`) moves into
  `selection-store`; `navigationStateFromLegacy` moves into `selection-actions`
  as the session-restore adapter (the P7.1 §4 refresh: its surviving callers are
  the three UI restore sites, not just the deleted bridging setter).
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
sub-store/controller, and the public surface stays importable forthe relic, the 74 files that import `MuseumEditorStore` today (re-verified
2026-08-22 — regenerate the inventory with `grep -rl "MuseumEditorStore"
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
  `navigationStateFromLegacy` lives in `selection-actions.svelte.ts` as the
  session-restore adapter (moved, not deleted — see §4); zero bridging setters
  on the facade; every write site uses `selectionActions` or the reducer
  (`host.selection`); reads are derived getters.
- P7.5 — zero **misplaced single-owner** logic on the facade beyond
  composition + delegation: `isDirty` / `validation*` semantics canonical on
  `document-store` **with the validation pre-check** (the sub-store currently
  drops it — the facade's version is the correct one); hover state owned by
  `session-state`; `cameraTimelinePlayhead` owned by the timeline controller
  and `lastSequencePlayhead` by the preview controller (2026-08-22 refresh
  adds the second field — P8 S2/S4 deferred its fold).
  Cross-store combinators stay at the composition root by design: `canExport`
  (validation × transaction state), the cluster → member-id expansion
  (`selection-store` owns no document data), and the `getSelected*Root`
  selectors (selection × roots — the registries already live in
  `scene-roots`).
- P7.2 — zero shim files under `editor/project/` + `editor/layout/`
  (the `layout-preview-geometry.ts` de-hybridization is **already done** —
  it is a pure 11-line module, no re-export line remains; only its
  `./layout-types` import rewrite is left).
- P7.3 — zero Chopin symbols in `lib/editor/` outside `MuseumEditorApp.svelte`:
  grep gate on `chopinRuntime | chopinProject | museumSceneDocument` and on
  `$lib/content/chopin-` imports.
- P7.4 — both shells share the boot composable (dirty-guard + texture
  lifecycle; shortcuts shell-owned).
- Zero `Slice N` / "re-exported so consumers stable" comment tombstones
  (**owner: P7.2**, assigned 2026-08-22 — P7.1c covers only the
  selection-adjacent subset; the type-collapse + 9.3-gotcha sweep rides with
  the shim wave).
- **1,970 tests green (1 skipped) · `svelte-check` 0/0 · build clean · relic
  routes behavior-equivalent** (baseline re-verified 2026-08-22; route smoke
  gate per the P7.4 record — not byte-identical, which is unverifiable after
  code moves).

**Not a DoD:** a line-count target. The original plan's ≈2,400-LOC end-state
assumed only the three Priority-1 extractions; P7's thinning goes further and
the freeze keeps the delegation surface by design — so no numeric target is
set. The itemized DoD above is the gate.

## Increments

| ID | Content | Finding | Depends | Behavior change |
|---|---|---|---|---|
| **P7.1** | Selection decoupling: read adapter folds into `selection-store`; write adapter dies with the bridging setters; write sites → `selectionActions` (the original plan's suggested slice) | 1 | — | none |
| **P7.2** | Delete dual-namespace shims (`editor/project/*`, `editor/layout/*`; the `layout-preview-geometry.ts` de-hybrid is already done — only its `./layout-types` import rewrite remains) — **shipped 2026-08-23** | 3 | — | none |
| **P7.3** | Chopin defaults → explicit inputs (`createMuseumEditorStore`, `editor-camera-path`, `editor-camera-view`) — **shipped 2026-08-23** | 4 | — | none (relic passes Chopin explicitly) |
| **P7.4** | Extract shared editor-shell boot composable (`MuseumEditorApp` + `EditorApp`) — dirty guards + texture lifecycle only; shortcuts stay shell-owned — **shipped 2026-08-19 (implemented during P1, non-blocking)** | 2 | — | none |
| **P7.5** | Facade thinning: move remaining single-owner reads to owning sub-stores (the deferred "future slice"); close the `isDirty` divergence — **shipped 2026-08-23** | 1 | P7.1 | none |
| **P7.6** | Museum-vocabulary scrub: drop-prefix scene vocabulary across the live model, relic subtree keeps museum; file renames (facade, types, state, content, 9 test files); format hard break (`.museumpack.zip` → `.scenepack.zip`, `museum-scene.json` → `scene.json`) | — | P7.1–P7.5 (lands last) | **format rename + code-adjacent strings only** (owner-approved 2026-08-22; the one non-zero-behavior increment) |

## Implementation readiness (2026-08-19)

Per-increment status after the pre-implementation surveys (grep-verified):

| ID | Status | Notes |
|---|---|---|
| **P7.1** | **shipped (2026-08-23)** | Pre-brief refreshed 2026-08-22: residue is 13 verified write sites (7 host-mediated, 3 UI restore, 3 facade-internal), not the survey's incomplete model. Decision resolved: **delete** the 4 writable host slots; in-transaction writes → reducer (`host.selection`), post-commit → `selectionActions`; `restoreSelectionSnapshot` adapter for the 3 restore sites. Direction trap documented (§2/§3). **Implementation (2026-08-23):** all 13 write sites migrated (incl. `importDocument` + `#reconcileSelection` → direct reducer writes with explicit direction; `placement-cluster:575` deleted as redundant), both helpers moved (`navigationSelectionFromState` → `selection-store.svelte.ts`, `navigationStateFromLegacy` → `selection-actions.svelte.ts` as the restore adapter's `@internal` translator), `restoreSelectionSnapshot` added, the 4 facade bridging setters + 4 writable host slots deleted (pathAnchor host gained `selection`), selection-adjacent alias re-exports + tombstones removed (7.1c). Gate: write-grep zero-match, `svelte-check` 0/0, suite 1,977 green — 7 new regression tests (read adapter ×2, restore ×2, direction trap, in-transaction seam) + 1 test write-site migrated (`museum-editor-selection.test.ts:286`). Note: the brief's "guards block selection during a transaction" premise is stale in the current guard impl (`isDocumentMutationBlocked` is preview-based) — the reducer seam stands for side-effect reasons (actions fire focus/status/timeline against half-committed state), documented in the new tests. |
| **P7.2** | **shipped (2026-08-23)** | All 10 dual-namespace shims deleted; 16 src + 14 test importers rewired to canonical kernels (survey undercounted — incl. tests for the shims themselves); boundary re-export test removed with its shims; tombstones swept. Gates: shim-name grep zero non-canonical, `svelte-check` 0/0, suite 1,986. |
| **P7.3** | **shipped (2026-08-23)** | `document`/`rooms` required options, no Chopin fallbacks; camera-path/view rooms defaults removed (signature trap fixed — both `direction` + `rooms` required); `createLayoutPreviewState(layout, scene)` parameterized; ~35 test files migrated; contracts relic-isolation re-expressed; Chopin grep gates clean; suite 1,988 (+2 new). |
| **P7.4** | **shipped 2026-08-19** | Implemented during P1 via Option B (non-blocking — touched only the two shells); brief collapsed to a completion stub below, detail removed. |
| **P7.5** | **shipped (2026-08-23)** | Playhead pair (`cameraTimelinePlayhead` → timeline controller, `lastSequencePlayhead` → preview controller; 9.3-gotcha tombstone removed) + hover pair (`hoveredConnectionId`/`hoveredAnchorId` → session-state) + isDirty divergence closed (document-store pre-check, `validationIssues` added); facade keeps read-only delegates. Suite 1,987 (+10). |
| **P7.6** | **shipped (2026-08-23)** | Pre-brief added 2026-08-22 (§P7.6 below). Owner decisions: drop-prefix scene vocabulary + format hard break. **Implementation (2026-08-23):** §4b folder placement (`camera/` 30 + `fields/` 3 + test mirror 10; a `$lib` perl-interpolation bug caught mid-wave) → identifier core (§2 map + 13 derived fns + seeds; 3 live collisions aliased; `assetCatalog` revert — the seed is imported) → §4a renames (all 15) → format hard break (`.scenepack.zip` / slug `'scene'` / generator `'editor-5.4'`; member + filenames already on `scene.json`/`layout.json`) → strings pass (the 340-line R bucket consumed to exactly the tolerated set). **Gates:** identifier zero-match outside the §3 keep-list (~41, all keep-listed); bare-museum 179/184 = exactly the P/T set (+2 legacy-format pin lines added post-close — the hard-break test now also rejects the pre-break `museum-scene.json` member, documented in §4); `svelte-check` 0/0; suite 1,989 green (format suites 54/54). |

All pre-briefs are written (P7.1, P7.5, and P7.6, 2026-08-22, §P7.1 / §P7.5 / §P7.6 below) and every slice is now pick-up-able — the readiness table has no remaining **need plan** items.

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
- **Wave 3 (rename):** P7.6 lands **last** (after P7.3) — the biggest
  mechanical diff in the repo's history (~1,400 identifier occurrences, 155
  src + 81 test files, 15 renames) and must review as its own commit series
  on top of settled code; the line-preserving rename would not invalidate
  earlier anchors, but landing it first would bury every later slice's diff
  under a mega-rename.
- P7.4 is independent of the facade; see Option B.

**Option B (recommended, needs owner decision):** schedule **P7.4 before
P1.5** because it touches `MuseumEditorApp.svelte` + `EditorApp.svelte` only
and stops the two-shell divergence before P1.5 edits `EditorApp.svelte` —
smallest collision window. Requires the owner to (1) approve P7 and (2)
record the re-prioritization in the tracker + point CURRENT's single next
action at P7.4; otherwise Option A stands and the plan claims nothing about
order. **Outcome:** P7.4 shipped 2026-08-19 under this option while P1 was
in progress; its brief below is now a completion stub (detail removed).

**Never:** Wave 1 concurrently with in-flight P1 slices.

## Gates

- **P1 close** — all increments start after the camera overhaul ships,
  **unless the owner approves Option B** (P7.4 before P1.5) and records it in
tracker + CURRENT.

## Boundaries

- **Behavior-preserving refactor.** No schema, selection
  semantics, or rendered output changes. No new props on public components.
  **The one carve-out is P7.6 (owner-approved 2026-08-22):** the export
  format rename (`.scenepack.zip` / `scene.json`, hard break, no import
  shim) and the code-adjacent string renames in §P7.6.2 are deliberate
  changes, not moves — pinned by the roundtrip test and the grep gate.
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

## P7.1 — Selection decoupling (brief, refreshed 2026-08-22)

> **Refresh note.** The survey below was written 2026-08-19 against a
> pre-implementation tree. Since then `store/selection-store.svelte.ts`
> (`EditorSelectionStore`) and `store/selection-actions.svelte.ts`
> (`EditorSelectionActions`) landed and were injected into every
> mutator/controller, and the facade's four selection get/set pairs
> (museum-editor.svelte.ts 586–641) already delegate to
> `selectionStore.setNavigation` / `setWorkspace`. The bulk of the original
> "write sites → selectionActions" migration is **already done**. This refresh
> replaces the survey's write-site model with the grep-verified residue and
> resolves its open decision.

### 1. User outcome and out-of-scope behavior

**Outcome:** the selection model reaches the H1 s4 end-state the original plan
designed. The facade's selection surface becomes **read-only derived**:
- `navigationSelectionFromState` (facade 169–190) moves into
  `store/selection-store.svelte.ts` (the original plan's explicit suggested
  slice). Direction stays owned by the discovery slots per H1 s4
  (`navigationSelectionFromState` drops direction — "discovery owns it").
- The four facade bridging setters (`set selectedRoomId` 590, `set
  selectedPlacementIds` 611, `set selectedClusterId` 626, `set
  navigationSelection` 638) are deleted **only after every write site migrates**
  to `selectionActions` / the reducer; the read getters stay, derived from
  `selectionStore`.
- No feature changes; components and tests that import `MuseumEditorStore` keep
  working (reads unchanged).

**Out of scope:** the state moves (`cameraTimelinePlayhead`, hover) — those are
P7.5; the alias-block deletion — P7.1c; stale "Slice 6" tombstone comment
cleanup — residue removal. This increment is selection only.

### 2. Decision (resolves the survey's open question): delete the host slots, do not rewire

The survey asked whether to "rewire the 4 host slots to `selectionActions`, or
delete the slots and have controllers call `selectionActions` directly."
**Delete the slots.** The remaining host-mediated writes fall into two seams —
and the second one is why "call `selectionActions` directly" is not the answer:

- **In-transaction writes → the reducer directly (`host.selection.setNavigation`).**
  Writes that land between `beginDocumentTransaction` /
  `commitDocumentTransaction` (view-keyframe 680/1141, path-anchor 279/335)
  must **not** go through `selectionActions`: every `select*` guards on
  `isDocumentMutationBlocked`, which is true during a transaction, so the action
  would silently no-op. The reducer is the established in-transaction seam
  (already used at navigation-graph 281/373/413/500, view-keyframe 1228,
  camera-preview 252+, camera-timeline 406).
- **Post-commit writes → `selectionActions`.** navigation-graph 590 (select the
  just-created connection) uses `selectionActions.selectConnection(...)`, which
  resolves the default direction internally.
- **Direction trap (the one real gap).** The legacy bridge defaulted
  connection-kind writes to the current discovery direction
  (`navigationStateFromLegacy(value, this.selectionStore.discoveryDirection)`),
  but the reducer *requires* `direction` on `kind: 'connection'` (it mirrors it
  into discovery, selection-store:125). Migrated writes must supply it
  explicitly: `{ kind: 'connection', connectionId, direction:
  host.selection.discoveryDirection }` (or the operation's own direction).
- **placement-cluster-mutator 575 is redundant, not migrated** — the following
  `selectionActions.selectPlacements(cluster.memberIds)` already writes
  `clusterId: null` via `setWorkspace` (selection-actions 532–541). The raw
  `host.selectedClusterId = null` line is deleted.
- **Why delete beats re-point.** Keeping the four host slots and re-pointing
  their setters at the reducer would leave a legacy-shaped write surface alive
  behind the gate — `this.host.navigationSelection = { kind:'connection',
  connectionId }` carries no direction, so the slot would need
  `navigationStateFromLegacy` to survive as the slot-level translator, which is
  exactly the surface P7.1 exists to kill. Deleting costs only a one-line
  `selection` getter on the pathAnchor host (the other three hosts already
  expose it); every other seam already has a reducer path.

### 3. Write-site residue inventory (grep-verified 2026-08-22)

| Site | Current write | Migration |
|---|---|---|
| `path-anchor-mutator.svelte.ts:279` (insert anchor) | `host.navigationSelection = { kind:'anchor', connectionId, anchorId }` | `host.selection.setNavigation(...)` — in-transaction; add `selection` to the pathAnchor host slot |
| `path-anchor-mutator.svelte.ts:335` (delete anchor) | `host.navigationSelection = { kind:'connection', connectionId }` | `host.selection.setNavigation({ kind:'connection', connectionId, direction: host.selection.discoveryDirection })` |
| `navigation-graph-mutator.svelte.ts:233` (place-camera start) | `host.navigationSelection = null` | `host.selection.setNavigation({ kind:'none' })` |
| `navigation-graph-mutator.svelte.ts:590` (connect done) | `host.navigationSelection = { kind:'connection', connectionId }` | `this.selectionActions.selectConnection(connectionId)` — post-commit |
| `view-keyframe-controller.svelte.ts:680` (add keyframe) | `host.navigationSelection = { kind:'view-keyframe', ... }` | `host.selection.setNavigation(...)` — in-transaction |
| `view-keyframe-controller.svelte.ts:1141` (delete keyframe) | `host.navigationSelection = { kind:'connection', connectionId }` | `host.selection.setNavigation({ kind:'connection', connectionId, direction: host.selection.discoveryDirection })` |
| `placement-cluster-mutator.svelte.ts:575` (ungroup) | `host.selectedClusterId = null` | **delete** — redundant with the following `selectPlacements` (writes `clusterId:null`) |
| `EditorSelection.svelte:230–232` (drag-session restore) | `store.navigationSelection = active.originalNavigationSelection` (+ placementIds, clusterId) | `selectionActions.restoreSelectionSnapshot(...)` — see §4 |
| `camera-gizmo-adapter.svelte.ts:342` (cancel restore) | `store.navigationSelection = { kind:'node', nodeId, handle }` | `selectionActions.restoreSelectionSnapshot(...)` |
| `CameraPlanViewport.svelte:369` (drag restore) | `store.navigationSelection = session.originalSelection` | `selectionActions.restoreSelectionSnapshot(...)` |
| `museum-editor.svelte.ts:2634–2635` (importDocument) | `this.navigationSelection = null; this.selectedRoomId = null` | `this.selectionStore.setNavigation({kind:'none'})` + `setWorkspace({kind:'none'})` |
| `museum-editor.svelte.ts:2694–2731` (#reconcileSelection) | `this.navigationSelection = null` / `{kind:'connection',...}` | `this.selectionStore.setNavigation(...)` with explicit direction |
| `museum-editor.svelte.ts:2749` (#reconcileSelection) | `this.selectedPlacementIds = filter(...)` | `this.selectionStore.setWorkspace(...)` preserving roomId |

### 4. Session-restore seam (the one new adapter)

The three UI restore sites (EditorSelection drag-session restore, gizmo cancel,
Plan viewport drag restore) restore a **captured legacy snapshot** — they are
not user gestures, so the guarded `select*` actions are wrong for them (they
would no-op under `isEditorInteractionActive` during drag teardown and would
fire focus/status side-effects a restore must not trigger). One new guard-free
action on `EditorSelectionActions`:

- `restoreSelectionSnapshot(snapshot: { navigation: EditorNavigationSelection;
  placementIds: string[]; clusterId: string | null })` — translates the legacy
  shapes and calls `selection.setNavigation` / `selection.setWorkspace` only
  (no guards, no side-effects). This keeps the "zero facade bridging setters"
  DoD intact and gives restores an explicit seam.
- Consequence: `navigationStateFromLegacy` (facade 134–158) **moves** into
  `selection-actions.svelte.ts` as this adapter's translator (`@internal`,
  module scope) — it is **not deleted**, because its surviving callers are the
  session-restore sites, not just the deleted facade setter. This corrects the
  original plan's "deleted, not moved" assumption.

### 5. Acceptance tests and manual scenarios

- Grep gate (compile-time) — **one regex covering all three write classes**
  (component `store.`, host `host.`, facade-internal `this.`):
  `\.(navigationSelection|selectedRoomId|selectedPlacementIds|selectedClusterId)\s*=[^=]`
  over `src/lib/editor/**`, excluding `selection-store.svelte.ts` itself →
  **zero matches** in `src/` after P7.1. The `[^=]` guard excludes
  `==`/`===` comparisons; the alternation names exactly the four selection
  fields. This subsumes the old `store.`/`host.` lists and catches the
  facade-internal `this.` writes (`#reconcileSelection`, `importDocument`)
  the earlier gate missed.
  - `svelte-check` 0/0 is the enforcement backstop: deleting the host slots
    and facade setters turns any missed site into a compile error.
- `contracts.test.ts` green unchanged; existing selection/cluster/navigation
  describes in `museum-editor-*.test.ts` green with zero expectation edits.
- New/extended tests on `selection-store`: the moved read adapter behaves
  identically (direction dropped on read, discovery slot written on set).
- New regression tests: (a) connection-kind reducer writes carry `direction`
  (direction trap); (b) in-transaction selection writes land (reducer seam, not
  blocked by `isDocumentMutationBlocked`); (c) `restoreSelectionSnapshot`
  round-trips `null` → `{kind:'none'}` and restores placement/cluster ids.
- Manual: select room / multi-select placements / select cluster / select
  camera node + connection + direction via tree, viewport, and timeline;
  undo/redo across each; drag a path anchor and cancel → selection restores
  exactly; relic `/museum/editor` same smoke minus layout.

### 6. Relic / Plan / visitor boundaries

- Relic and visitor untouched behaviorally (same facade reads).
- P1.5's "Existing seams to reuse" list references `selectionActions.
  selectNavigationNode` / `selectConnection` etc. — those are the migration
  targets and stay valid.

### 7. Rollback / fallback split

- 7.1a move the two helpers (read → `selection-store`, write → the restore
  adapter in `selection-actions`) + migrate every write site (reversible; suite
  green — this is the bulk).
- 7.1b delete the four facade bridging setters + four host slots
  (compile-gated; svelte-check catches stragglers).
- 7.1c delete the selection-adjacent alias blocks + tombstones.
- If a write site is found after 7.1b (missed grep), restore that setter for the
  site only — do not reintroduce the block.

---
## P7.2 — Shim deletion (brief)

> **Implementation (2026-08-23).** All 10 shim files deleted, every importer
> rewired to canonical paths; suite 1,986 green (1,987 − the vacuous
> boundary re-export test removed with its shims), `svelte-check` 0/0, P7.6
> inventory still 517/523. The brief's survey undercounted the surface — the
> actual rewrite covered **16 src files + 14 test files**, not 11 src + 1
> test: relative `./layout-*` imports inside `editor/layout/` (14 files), the
> `$lib/editor/project/*` importers, plus test files for the shims
> themselves (`arch-profile.test`, `draft-geometry.test`, `curve-geometry`
> `.test`, `layout-auto-bezier.test`, `layout-validation.test`,
> `rooms-to-layout.test`) and `layout-a1-fixtures.ts` — all repointed at the
> canonical kernels. Canonical targets are the geometry kernels, not
> same-named files: `curve-geometry` → `$lib/layout/layout-geometry-curve`,
> `arch-profile`/`draft-geometry` → `$lib/layout/layout-geometry-openings`,
> `layout-validation` → `$lib/layout/layout-geometry-validation`,
> `layout-auto-bezier` → `$lib/layout/layout-geometry-curve`,
> `layout-preview-bounds` → `LayoutBounds3 as LayoutPreviewBounds` from
> `$lib/layout/layout-geometry-types`, `layout-types` → `$lib/layout/layout-types`,
> `rooms-to-layout` → `$lib/content/rooms-to-layout`. The geometry-boundary
> test's `REEXPORT_FILES` const + its pure-re-exports test were removed with
> the shims they audited. Tombstone sweep done (the brief's targets minus the
> already-removed 9.3 gotcha): camera-preview-controller's two Slice-6/Slice-3
> narratives trimmed, document-store's "Slice 6 collapses them" removed,
> facade's Slice-3 re-export narrative deleted (Phase 9.5 note kept), and
> `unified-project-tree-model.ts:46`'s `navigationSelectionFromState`
> parenthetical dropped. Grep gate: zero non-canonical shim-name matches in
> src/tests/vite.

### 1. Outcome / out of scope

One canonical path per module. Delete:
- `editor/project/project-codec.ts`, `editor/project/project-types.ts`
  (canonical: `$lib/project/*`).
- `editor/layout/` shims: `arch-profile.ts`, `curve-geometry.ts`,
  `draft-geometry.ts`, `layout-auto-bezier.ts`, `layout-preview-bounds.ts`,
  `layout-types.ts`, `layout-validation.ts`, `rooms-to-layout.ts`
  (canonical: `$lib/layout/*`; `rooms-to-layout` canonical:
  `$lib/content/rooms-to-layout`).
- `layout-preview-geometry.ts` (**already de-hybridized** — 2026-08-22
  re-verified: 11 lines, only `floorShapePoints` / `ceilingShapePoints`, no
  re-export line remains). Remaining work for this file is only the
  `./layout-types` import rewrite; the earlier proposal to move the two
  functions to a new `layout-shape-points.ts` is now optional cosmetics.
- The `museum-editor.svelte.ts` alias re-exports are **owned by P7.1c, not
  P7.2** (P7.1's rollback split deletes the selection-adjacent alias blocks;
  P7.2 stays `Depends: —`).
- **Owns the type-collapse tombstone sweep** (assigned 2026-08-22 — DoD
  line 105 demands zero `Slice N` / "re-exported so consumers stable"
  tombstones, but P7.1c covers only selection-adjacent ones): delete the
  stale "Slice 6 collapses" / re-export-narrative comments in
  `camera-preview-controller.svelte.ts` (23–24, 130), `document-store
  svelte.ts` (25), and the facade's Slice-3 re-export narrative (225–241),
  plus the P8-era `camera-timeline-controller.svelte.ts:21` ("9.3 gotcha"
  — already checked for history in P7.5 §4) and the
  `unified-project-tree-model.ts:46` comment-only reference.

Out of scope: renaming any canonical module; touching `$lib/layout/*` contents.

### 2. Reuse

Existing canonical modules are the targets; `grep -rl` over `apps/museum/src`
for each shim name yields the full site list (re-verified 2026-08-22: 23
absolute `$lib/editor/layout/` / `$lib/editor/project/` import statements
across 11 src files, plus 52 relative `./layout-*` import statements inside
`editor/layout/` across 18 files; 1 test file imports `$lib/editor/project/*`
— `tests/lib/editor/project/project-codec.test.ts`). Counts are
informational — the grep gate in §5 is the acceptance.

### 3. New props/state/dependencies

None. Pure import-path rewrite.

### 4. Semantics

Import identity only. Note `editor/layout/rooms-to-layout.ts` re-exports
`$lib/content/rooms-to-layout` — the two lanes share that compiler; the shim's
only job was a stable relative path.

### 5. Acceptance tests

- `svelte-check` 0/0 (compile gate for all sites).
- Full suite green (1 test file imports `$lib/editor/project/*` today —
  `tests/lib/editor/project/project-codec.test.ts` — plus 2 src importers
  `layout-gizmo-candidate.ts` and `layout-preview-state.svelte.ts`; update
  them to `$lib/project/*`).
- Grep gate — **the 10 shim filenames by name** (NOT the directory prefix:
  `$lib/editor/layout/` legitimately hosts real modules like
  `layout-preview-state.svelte.ts`, `layout-interaction.ts`, `plan-hit.ts`):
  `project-codec`, `project-types`, `arch-profile`, `curve-geometry`,
  `draft-geometry`, `layout-auto-bezier`, `layout-preview-bounds`,
  `layout-types`, `layout-validation`, `rooms-to-layout` → zero matches for
  each shim name outside its removed file (and outside canonical targets in
  `$lib/layout/*` / `$lib/project/*` / `$lib/content/rooms-to-layout`).

### 6. Boundaries

No relic/visitor/plan impact (import paths only, editor-side).

### 7. Rollback

Mechanical; one diff per namespace (project, layout). Revert independently.

---

## P7.3 — Chopin defaults → explicit inputs (brief)

> **Implementation (2026-08-23).** All Chopin defaults removed from editor
> code; suite 1,988 green (1,986 + the 2 new §5 regression tests),
> `svelte-check` 0/0, and **both Chopin gates clean** (zero
> `chopinRuntime`/`chopinProject`/`museumSceneDocument` symbols and zero
> `$lib/content/chopin-` imports in `src/lib/editor/` outside
> `MuseumEditorApp.svelte`).
> - `document` + `rooms` are now **required** `MuseumEditorStoreOptions`;
>   the factory/constructor defaults and the facade's `chopin` import are
>   gone. `MuseumEditorApp.svelte` (the relic seed site) passes
>   `{ document: museumSceneDocument, rooms: chopinRuntime.rooms, relic }`
>   and seeds the layout preview with
>   `createLayoutPreviewState(chopinProject.layout, museumSceneDocument)`.
> - Camera-path/view: all 6 + 4 `rooms` defaults removed; the
>   **signature trap resolved as scoped** —
>   `createDraftConnectionPositionPath(document, connectionId, direction,
>   rooms)` with both `direction` + `rooms` required (no reorder; every src
>   caller already passed all four args positionally, verified at each of
>   the 12 src call sites). The brief's 3 test calls were updated to
>   explicit `'forward'`/`'reverse'` + registry.
> - Layout preview: `createLayoutPreviewState(layout, scene)` and
>   `loadChopinLayoutPreview(state, layout)` are parameterized (param is
>   the `LayoutDocument`, not the project — `createState` takes the layout);
>   the relic passes `chopinProject.layout` explicitly, the test file passes
>   it at all 27 factory sites.
> - Test migration: `editor-test-utils` fixture factories pass
>   `rooms: chopinRuntime.rooms` (the fixture resolves against the Chopin
>   registry); the 6 files / 9 zero-option callsites the survey named were
>   updated to explicit Chopin args (behavior-identical — the old default
>   boot WAS Chopin), plus **~20 more callsites the survey undercounted**
>   (camera-path/view tests, gizmo adapters, p8-s2/s3/s4, textures, shell,
>   placement, package-archive, p8-s5, active-editor-selection, contracts
>   ×5, museum-editor-camera) and the two `EditorDocumentStore(undefined,
>   …)` callers. `contracts.test.ts` relic-isolation re-expressed with
>   explicit Chopin args (isolation coverage preserved); the vacuous
>   no-options boot the contract used to test is what P7.3 removes by
>   design.
> - New tests: empty-boot (zero rooms, no Chopin ids) + explicit Chopin
>   relic boot (§5).
> - **P7.6 inventory drift — one line, accounted for:** removing the
>   `MuseumEditorStoreOptions.document` seed comment dropped the bare-museum
>   count 517/523 → **516/522**; the inventory's §1 guard, §4 entry, and §5
>   tally updated with the removal annotated. The pre-flight guard's "diff
>   against §4 before trusting the buckets" rule was exercised and the
>   single removal was a clean §4 R-line delete (no re-bucketing needed).

### 1. Outcome / out of scope

Editor-domain code never silently resolves against the frozen relic. Changes:
- `createMuseumEditorStore(options)`: `document` and `rooms` become **required**
  options (remove `museumSceneDocument` / `chopinRuntime.rooms` defaults).
  `MuseumEditorApp.svelte` passes
  `{ document: museumSceneDocument, rooms: chopinRuntime.rooms, relic }`
  explicitly.
- `editor-camera-path.ts` (**6** default params — re-verified 2026-08-22:
  lines 112, 137, 181, 193, 208, and the 6th at 337 inside
  `sampleDraftConnectionPath2D`, which the survey missed; plan said 5) and
  `editor-camera-view.ts` (**4** default params: lines 126, 165, 181, 202):
  `rooms` becomes a required argument; callers pass `store.rooms`
  (already the pattern at the surviving call sites).
  **Signature trap (must land in the same diff):**
  `createDraftConnectionPositionPath(document, connectionId, direction =
  'forward', rooms = chopinRuntime.rooms)` (lines 132–136) has the optional
  `direction` **before** the `rooms` default. Removing only the `rooms`
  default creates a required parameter after an optional one — does not
  compile. **Best fix (verified against source): preserve parameter order,
  make both required** — `(document, connectionId, direction, rooms)`.
  Reordering is **not** an option: all source callers pass `direction`
  positionally as the 3rd argument, so a reorder would silently land
  `direction` in the `rooms` slot. **Call-site migration (re-verified
  2026-08-22 — 10 src call sites across 6 files + 3 test calls):**
  - 7 source calls already fit the required signature unchanged (each
    already passes all four args): `EditorSelection.svelte` (×3: ~540,
    ~712, ~756 — `handle.direction` / `'forward'` / `'forward'`),
    `editor-camera-view.ts` (~207 — `direction`), `EditorCameraPathHelpers
    .svelte` (~217 — `'forward'`), `store/view-keyframe-controller
    .svelte.ts` (×2: ~218, ~609 — `preview.direction` /
    `selection.direction`).
  - 2 **new since the survey** (both safe — pass `'forward'` +
    `store.rooms` explicitly): `camera-plan/CameraPlanViewport.svelte`
    (×2: ~311, ~502).
  - 1 internal call at `editor-camera-path.ts:337`
    (`sampleDraftConnectionPath2D` → `createDraftConnectionPositionPath`,
    passes `'forward'` + `rooms` positionally) — the 6th rooms-default.
  - 3 test calls in `tests/lib/editor/editor-camera-path.test.ts` (~111,
    ~122, ~123–127) update to explicit `direction` + registry: two currently
    omit direction (default), one passes `'reverse'` positionally without
    rooms.
- `store/document-store.svelte.ts` and
  `layout/layout-preview-state.svelte.ts`: remove Chopin-seeded defaults
  (note `layout-preview-state.svelte.ts:1` imports both `chopinProject` and
  `museumSceneDocument` — both must go, see gate below); `EditorApp.svelte`
  already passes explicit seeds — extend to the remaining default sites.
  **Two relic-sensitive sites the survey never named (2026-08-22 re-verify):**
  - `createLayoutPreviewState()` (layout-preview-state.svelte.ts:107) is
    **Chopin-seeded and consumed by the relic shell directly** —
    `MuseumEditorApp.svelte:37` calls it no-args. The main editor correctly
    uses `createEmptyLayoutPreviewState()` at `EditorApp.svelte:54`.
    Migrate by parameterizing the factory: `createLayoutPreviewState(
    project, scene)` with the relic passing `chopinProject.layout` +
    `museumSceneDocument` explicitly (relic-freeze: boot must stay Chopin).
  - `loadChopinLayoutPreview(state)` (layout-preview-state.svelte.ts:266)
    is exported from src but called **only by tests**
    (`layout-preview-state.test.ts:21,100`); its `chopinProject` import will
    trip the gate. Decide its fate in the same diff: move it to the test
    fixture, or parameterize it like the factory above.

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
  that passes an explicit empty or fixture document + registry, and update
  the test files that call `createMuseumEditorStore(` with no options
  (re-verified 2026-08-22: 21 test files call the factory today; 6 files /
  9 callsites pass zero options — `contracts`, `live-rooms`, `room-delete`,
  `layout-mutation-runner`, `museum-editor` ×2, `museum-editor-bind-
  migration` ×3).
- **`contracts.test.ts` needs a semantic rewrite, not an args patch
  (2026-08-22).** The "relic isolation" contract (:155) calls
  `createMuseumEditorStore()` no-options and asserts full-editor workspace
  switching — under required `document`/`rooms` it fails to **compile**,
  and its assertion (default-boot behavior) is what P7.3 removes by design.
  Decide in the same diff: re-express it with explicit empty-project args,
  or fold its workspace-switching assertion into the new relic-boot test
  (§5). This is the highest-value test in the suite; do not lose its
  isolation coverage in the mechanical update.
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

## P7.4 — Shared shell-boot extraction — **COMPLETE (shipped 2026-08-19)**

Implemented while P1 was in progress (Option B: touched only
`MuseumEditorApp.svelte` + `EditorApp.svelte`, so it did not block any P1
increment). Detail removed — see the tracker row; the remaining P7
increments (P7.1 → P7.5 → P7.2 → P7.3) are the live scope.

---

## P7.5 — Facade thinning: reads onto sub-stores (brief, refreshed 2026-08-22)

> **Refresh note.** The survey below was written 2026-08-19 and predates
> P1.8/P1.9 and the full P8 S1–S6 run. Re-verified against the current tree
> 2026-08-22: the isDirty divergence and hover state are unchanged (still on
> the facade, same semantics), `cameraTimelinePlayhead` is a raw facade
> `$state` at line **761**, and **P8 S2/S4 added a new `lastSequencePlayhead`
> facade `$state` (line 763) the survey does not know about** — its ownership
> fold was explicitly deferred past S4. All anchors below are current; the
> survey's cited lines have drifted and are not to be trusted.
>
> **Implementation (2026-08-23).** All four state groups moved; suite 1,987
> green (baseline 1,977 + 10 new regression tests), `svelte-check` 0/0,
> `contracts.test.ts` green unchanged, P7.6 inventory still 517/523 (no drift).
> - **Playhead pair (one diff, per §7):** `cameraTimelinePlayhead` → owned
>   `$state` on `camera-timeline-controller` (the 9.3 gotcha verified
>   **obsolete** via git history — the 9.3/9.4 hand-offs record only
>   "still facade `$state`" with no deeper constraint, and sibling
>   controllers own class-field `$state`; tombstone removed); `viewKeyframe`
>   host re-pointed at the controller field, the `cameraTimeline` host's
>   playhead slot deleted, and the preview-commands cast routes through the
>   controllers already in its interface (`host.cameraTimelineController.*`,
>   `host.previewController.lastSequencePlayhead`) — the third write surface
>   the refresh scoped. `lastSequencePlayhead` → owned `$state` on
>   `camera-preview-controller`; the facade `#pruneInvalidCameraPreview`
>   lastSequence validation folded into `pruneIfStale()` (strict location
>   check when no preview survives the prune, lenient timeline-exists check
>   when one does — pre-fold semantics preserved). Facade keeps read-only
>   getter delegates for both; the only test write-site migrated is the
>   p8-s2 D6 transplant (`as any` seeds now write the controllers).
> - **Hover pair:** `hoveredConnectionId` / `hoveredAnchorId` + a
>   `session.setNavigationHover` writer → `session-state` (null-clears-anchor
>   preserved); facade keeps the guard logic and delegates; the two host
>   `setNavigationHover` slots are unchanged (they call the facade method).
> - **isDirty / validationIssues:** `document-store` adopted the pre-check
>   (invalid ⇒ dirty regardless of baseline — `serializeSceneDocument` would
>   throw, so the short-circuit is load-bearing); facade getters are now
>   one-line delegates. `canExport`, `selectedPlacementIds` (cluster →
>   member-id expansion), and the `getSelected*Root` selectors stay at the
>   composition root as scoped. `pendingFrame*` / `projectExportBlocker`
>   were already pure delegates (NO-OPs confirmed).
> - New tests: document-store pre-check pin (via the public `$state`
>   document seam — `replace()` validates), hover ×3 in the session-state
>   suite, lastSequence prune fold ×5 in the preview-controller suite
>   (unbuildable → null, unresolvable → null, valid stays, lenient-check
>   with surviving preview, ownership), and a facade-reads-through test in
>   p8-s4 asserting the getter and the controller field agree after a scrub.

### 1. User outcome and out-of-scope behavior

**Outcome:** the original plan's deferred "future slice" — every remaining
single-owner read/computation leaves the facade for its owning sub-store. End
state: `MuseumEditorStore` holds composition (constructor wiring,
after-replace listeners), orchestration (`#reconcileSelection`,
document-transaction glue, `#prepareDocumentReplacement`), one-line
delegates, and the cross-store combinators that are the composition root's
actual job (`canExport`, cluster → member-id expansion, `getSelected*Root`
selectors) — no **misplaced single-owner** logic. No feature changes; the
public surface is unchanged (delegates keep the signatures). This slice now
**also folds the two playhead fields** (`cameraTimelinePlayhead`,
`lastSequencePlayhead`) off the facade — the ownership fold P8 S2/S4 deferred
by design.

**Out of scope:** selection migration (P7.1), shims (P7.2), Chopin defaults
(P7.3), shell boot (P7.4), stale type-collapse tombstones (residue removal).

### 2. Source components and existing APIs to reuse

- `store/document-store.svelte.ts` — takes `isDirty` / `validationIssues`
  semantics. **Divergence still live (verified 2026-08-22):** the facade's
  `isDirty` (museum-editor.svelte.ts:372) preserves `!v.success || …` (the
  pre-check; the comment at 323–324 calls the sub-store version a "behavioural
  regression caught by the review pass"); the sub-store's (document-store
  svelte.ts:172) drops it. The sub-store adopts the pre-check; the facade
  getter becomes a delegate. `canExport` (facade:379) **stays at the
  composition root** — it combines document validation with
  `isDocumentTransactionActive`, two ownership domains.
- `store/camera-timeline-controller.svelte.ts` — takes `cameraTimelinePlayhead`
  as **owned `$state`** (currently it writes the facade field through the host
  at 161/178/315/444/457/502; after the move those become self-writes).
- `store/camera-preview-controller.svelte.ts` — takes `lastSequencePlayhead`
  as **owned `$state`**: it already owns the preview FSM, the timeline cache
  (`getTimeline()`), and the stale-prune logic the facade delegates into; the
  S2/S4 sequence-scope semantics (save on scope exit, validate on replace)
  are preview-domain, not facade-domain. The facade's
  `#pruneInvalidCameraPreview` lastSequence validation (1384/1389/1408) moves
  into the controller's `pruneIfStale()`.
- `store/selection-store.svelte.ts` — does **not** take the cluster →
  member-id expansion; `selectedPlacementIds` stays at the composition root
  (`selection-store` owns no document data, and clusters resolve against
  `document.placements`).
- `store/scene-roots.svelte.ts` — already owns the roots registries; the
  facade's register/unregister/get delegates are already one-line
  `this.roots.*` calls and stay as-is. The `getSelected*Root` selectors
  **stay at the composition root** — they combine selection + root lookup, a
  cross-store combinator, not single-owner logic.
- `store/session-state.svelte.ts` — takes `hoveredConnectionId` /
  `hoveredAnchorId` (session-only UI state; `pendingFramePlacementIds` /
  `pendingFrameVersion` already live there — see §3).
- `store/controller-hosts.ts` — host slots for the moved state (see §3).

### 3. New props / state / dependencies

- **State moves:**
  - `cameraTimelinePlayhead` (facade raw `$state`, line 761) → timeline
    controller as owned `$state`. **Host rewiring — THREE surfaces
    (verified 2026-08-22), not two:**
    1. `viewKeyframe` host (controller-hosts 422–426) — setter re-points to
       the controller's owned setter; getter reads controller state.
    2. `cameraTimeline` host (controller-hosts 489–493) — same re-point.
    3. **`camera-preview-commands` host interface** (camera-preview-commands
       svelte.ts:73–130) declares `cameraTimelinePlayhead: number` and
       `lastSequencePlayhead: number | null` as **writable slots** (lines
       112–113), satisfied by the whole-facade cast (`this as unknown as
       EditorCameraPreviewCommandsHost`, facade:500). This interface is a
       **third write surface the brief must scope**: either re-point its
       `cameraTimelinePlayhead` member at the timeline controller's setter
       (the interface gains a `setCameraTimelinePlayhead(value)` method the
       cast satisfies via the controller), or pass the timeline controller
       into the cast. As written before this refresh, an implementer
       following the two-host rewiring literally would hit a compile wall at
       the cast mid-slice.
    **Writer survey (complete — no other writers exist):** timeline
    controller ×6 (161/178/315/444/457/502, become self-writes after the
    move), view-keyframe controller ×1 (909), preview-commands ×5 via the
    cast (531/596/694/727/873). Facade field becomes a read-only getter —
    never a write target; the five cast sites are the compile-time forcing
    function.
  - `lastSequencePlayhead` (facade raw `$state`, line 763 — **new since the
    survey**) → preview controller as owned `$state`. Writers migrate:
    preview-commands:449 (`host.lastSequencePlayhead =
    host.cameraTimelinePlayhead`) becomes a controller call; the facade's
    `#pruneInvalidCameraPreview` writes (1384/1389/1408) fold into
    `pruneIfStale()` (it already receives the timeline and the document).
    Read path (`get lastSequencePlayhead`) becomes a one-line delegate or is
    dropped if the only reader is preview-commands (grep at impl time).
  - `hoveredConnectionId` / `hoveredAnchorId` (facade `$state`, lines
    824–825) → **session-state** as owned `$state` (owner decision recorded:
    **no mutator reads hover anywhere in `src/`** — verified 2026-08-22, the
    only `store/*.ts` references are the host slots and
    `setNavigationHover` itself; ownership by navigation-graph-mutator would
    add a dependency with zero existing readership). Hover is UI-session
    state with a single guarded writer and three display-only readers
    (`EditorViewport.svelte:172`, `Workspace3DView.svelte:216`,
    `EditorCameraPathHelpers.svelte:188–189`), and session-state already
    hosts `pendingFrame*`. Facade getter + `setNavigationHover` (2193)
    become delegates that keep the null-clears-anchor behavior; host slots
    (controller-hosts 332, 586) re-point to the session store.
  - `pendingFramePlacementIds` / `pendingFrameVersion` — **NO-OP, already
    done**: facade get/set at 764–771 are already pure delegation to
    `this.session.pendingFrame*`; no duplicated facade `$state` field
    remains. Nothing to remove or move — keep the one-line delegates.
- **Read moves:** `isDirty` / `validationIssues` / `baselineCanonicalJson`
  semantics → `document-store` (pre-check adopted — close the divergence).
  **Stays at the composition root:** `canExport` (validation × transaction
  state), the cluster → member-id expansion (`selectedPlacementIds`), and
  the `getSelected*Root` selectors (selection × roots).
  `projectExportBlocker` — **NO-OP, already a delegate**: the logic lives in
  `store/project-export-store.svelte.ts:74` as pure
  `computeProjectExportBlocker(...)` and the facade getter (393) is already a
  one-line call. Nothing to move.
- **No new dependencies.** No new public store options; `createMuseumEditorStore`
  signature unchanged.

### 4. Mount/unmount and selection semantics

- None — state/read plumbing inside the already-mounted store. Selection
  reads still route through the same facade getters (now one-line delegates).
- The playhead move must **preserve the S2/S4 transport contract**:
  `startConnectionPreview`/`stop` teardown and the `resetToScopeStart`
  round-trip behave identically; `lastSequencePlayhead` is session-only,
  never codec/history (in-memory by design).
- **9.3-gotcha history check (pre-move, amendment from counter-review).**
  `camera-timeline-controller.svelte.ts:21` still says
  "`cameraTimelinePlayhead` remains facade `$state` (9.3 gotcha)" — a stale
  tombstone that documents a reason the playhead once had to stay on the
  facade. Before moving owned `$state` into the controller, verify that
  gotcha against git history. Svelte 5 class-field `$state` demonstrably
  works in controllers today (`selection-store.svelte.ts` owns
  `lastSelectedId` as a class field), so the gotcha is **likely obsolete** —
  but verify rather than assume. If it still holds, the fallback is a
  controller-held plain field + explicit `$derived`-free getter wired through
  the facade (behavior identical, ownership moved).

### 5. Acceptance tests and manual scenarios

- `contracts.test.ts` green unchanged (reads identical).
- New test: `documentStore.isDirty` returns true for an invalid document even
  when canonical JSON matches baseline (the pre-check the sub-store currently
  drops) — pins the divergence close.
- New tests: playhead ownership moves with the state into the
  camera-timeline-controller suite (scrub writes land, facade getter reads
  through); `lastSequencePlayhead` prune folds into the preview-controller
  suite (null-timeline → reset to 0, invalid p → 0 — the S2 D6 regression
  already pinned in `p8-s2-preview-scope.test.ts` must stay green); hover
  assertions move into the session-state suite.
- Manual: dirty → export blocked; undo/redo → dirty flips; timeline scrub
  playhead; Preview Sequence exit/restore round-trip; hover a connection edge
  in 3D; roots-driven gizmo behavior (transform on selected placement/camera
  helper); relic smoke.

### 6. Relic / Plan / visitor boundaries

- Relic and visitor untouched (same facade reads). No editor code into
  visitor chunks.

### 7. Rollback

- One diff per moved group (playhead pair, hover, dirty/validation, cluster
  expansion, roots). Each is reversible independently; suite green after
  each. The playhead pair lands as **one diff** (the two fields share the
  preview-commands whole-facade cast and the controller seams), not two.

## P7.6 — Museum-vocabulary scrub (brief, added 2026-08-22)

### 0. Owner decisions (2026-08-22)

- **Drop-prefix scene vocabulary** — every `Museum*` identifier in the live
  model loses the prefix per the collision-checked map in §2; the relic
  subtree keeps museum naming.
- **Format hard break** — `.museumpack.zip` → `.scenepack.zip` and the
  `museum-scene.json` archive member → `scene.json`, with **no legacy-import
  shim** (pre-release product; existing exported archives intentionally stop
  importing).

### 1. User outcome and out-of-scope behavior

After P7.6, `rg '\b[Mm]useum[A-Za-z_]*'` over live paths (`src` excl. relic
subtree, `tests`, `vite`) returns **zero matches** except the keep-list in
§3. Zero behavior change other than the owner-approved format rename
(extension + archive member) and the code-adjacent string renames in §2.

**Out of scope (flagged, not scrubbed):** package identity (`apps/museum/`,
`@portfolio/museum`, `node_modules/.vite/museum` cache dir), the `/museum`
route, browser titles ("Museum Editor", "Museum editor — relic"), the
"Preview Museum" link text (points at `/museum`), dev-route titles ("Chopin
Museum Dev"), and this plan/tracker doc titles. These are product branding
and package identity, not editor-internal vocabulary; renaming the package
folder is a separate, heavier decision and would fight the `/museum` route.

### 2. Name map (collision-checked, grep-verified 2026-08-22)

**Types / classes / consts** (identifiers — mechanical find-replace):

| Old | New | Notes |
|---|---|---|
| `MuseumEditorStore` | `EditorStore` | the facade (composition root) |
| `MuseumEditorStoreOptions` | `EditorStoreOptions` | |
| `MuseumSceneDocument` | `SceneDocument` | `content/scene.ts:271` |
| `RuntimeMuseumScene` | `RuntimeScene` | `content/scene.ts:284` |
| `MuseumRoomId` | `RoomId` | `types/museum.ts` |
| `MuseumRoom` | `Room` | `types/museum.ts:141` |
| `MuseumProject` | `Project` | `project/project-types.ts:4` |
| `MuseumProjectInput` | `ProjectInput` | `project/project-codec.ts:22` |
| `MuseumProjectIssue` | `ProjectIssue` | `project/project-types.ts:11` |
| `MuseumProjectValidationResult` | `ProjectValidationResult` | |
| `MuseumProjectValidationError` | `ProjectValidationError` | |
| `MuseumAsset` | `Asset` | `types/assets.ts:43` |
| `MuseumAssetFilters` | `AssetFilters` | |
| `MuseumConnection` | `RuntimeConnection` | `types/museum.ts:124` — the *runtime* connection; `SceneConnection` (authored, `scene.ts:241`) already exists, so bare `Connection` is avoided |
| `MuseumStateStore` | `RuntimeStateStore` | `state/museum-state.svelte.ts:8` — shared museum-runtime state; "Runtime" mirrors `RuntimeScene` |
| `MuseumState` | `RuntimeState` | `types/museum.ts:154` — the runtime state snapshot shape; parallels `RuntimeStateStore` |
| `MuseumRuntime` | `Runtime` | `content/chopin-project.ts:23` |
| `MUSEUM_CAMERA_FOV` | `CAMERA_FOV` | `types/museum.ts` |
| `MUSEUM_CAMERA_EASING` | `CAMERA_EASING` | `types/museum.ts` |
| `EditorMuseumEntities` (component) | `EditorSceneEntities` | + file rename |
| `museumSceneDocument` (var) | `sceneDocument` | |
| `museumNavigationGraph` | `navigationGraph` | |
| `museumRooms` | `rooms` | |
| `museumAssets` | `assets` | |
| `museumMaterials` | `materials` | |
| `museumSceneBytes` | `sceneBytes` | |
| `museumAssetById` | `assetById` | |
| `museumState` / `museumScene` (vars) | `runtimeState` / `scene` | |
| `museumpack` | `scenepack` | format string (§4) |

**Functions / derived names** — a prefix rule plus explicit targets. General
rule: every `Museum*` / `museum*` identifier not listed above or in the §3
keep-list drops the `Museum`/`museum` prefix per the pattern. The 13 derived
function names are enumerated (grep-verified 2026-08-22, ~229 occurrences
incl. tests) so their targets are deliberate, not improvised mid-slice:

| Old | New |
|---|---|
| `createMuseumEditorStore` | `createEditorStore` | ← the umbrella's most-cited symbol; P7.3 treats it as a surviving API name, so its target is recorded once |
| `cloneMuseumSceneDocument` | `cloneSceneDocument` |
| `validateMuseumProject` | `validateProject` |
| `serializeMuseumProject` | `serializeProject` |
| `createMuseumState` | `createRuntimeState` |
| `createEmptyMuseumProject` | `createEmptyProject` |
| `createMuseumProject` | `createProject` |
| `parseMuseumProjectJson` | `parseProjectJson` |
| `EmptyMuseumProjectInput` | `EmptyProjectInput` |
| `validateMuseumAssetManifest` | `validateAssetManifest` |
| `getMuseumAsset` | `getAsset` |
| `listMuseumAssets` | `listAssets` |
| `CanonicalMuseumSceneDocument` | `CanonicalSceneDocument` |

**Code-adjacent strings** (user-visible but code-domain — renamed):

| Old | New | Where |
|---|---|---|
| `.museumpack.zip` | `.scenepack.zip` | `content/package-format.ts:198`; comments in `editor/museum-editor.svelte.ts:2473/2490`, `helpers/package-sha.ts:6` |
| `'museum-scene.json'` archive member | `'scene.json'` | `editor/import/package-importer.ts:76/80/90/186/194`, `editor/export/package-exporter.ts:152`, `content/package-format.ts:8` |
| `'museum-scene.json'` plain-JSON export filename | `'scene.json'` | `editor/EditorProjectMenu.svelte:120` (`anchor.download`) |
| `'museum-layout.json'` plain-JSON export filename | `'layout.json'` | `editor/EditorProjectMenu.svelte:149` (`anchor.download`) |
| default title / slug fallback `'museum-scene'` | `'scene'` | `content/package-format.ts:178/203/216`; app-bar subtitle `EditorAppBar.svelte:43` shows it |
| "Museum asset has no valid fallback mapping: …" | "Asset has no valid fallback mapping: …" | `content/assets.ts:233` |
| "Museum asset IDs must be non-empty" | "Asset IDs must be non-empty" | `content/assets.ts:239` |
| "Museum asset without a production file requires a fallback: …" | "Asset without a production file requires a fallback: …" | `content/assets.ts:264` |
| "Museum navigation state must use the same resolved scene instance" | "Navigation state must use the same resolved scene instance" | `content/scene.ts:586` |
| `aria-label="Museum editor shell"` | `"Editor shell"` | both `EditorAppBar.svelte` files (40, 61) |
| `aria-label="Museum editor viewport"` | `"Editor viewport"` | `EditorViewport.svelte:175` |
| `aria-label="Museum rooms and objects"` | `"Rooms and objects"` | `EditorSceneTree.svelte:73` |

### 3. Relic boundary (keep-list — the ONLY museum allowed in live code)

- **Keeps museum naming:** `src/lib/museum/**`, `src/routes/museum/**`, and
  the relic editor mount chain — `MuseumEditorApp.svelte` (legacy shell,
  mounted only at `/museum/editor`), `MuseumEditorEntry`,
  `virtual:museum-editor-entry`, `vite/museum-editor-entry-plugin.ts`,
  **`museumEditorEntryPlugin`** (the plugin file's exported function;
  added to the keep-list 2026-08-23 — it matches the identifier gate at
  `vite/museum-editor-entry-plugin.ts:11` and `contracts.test.ts:27/339`,
  and it is the mount chain's public entry; alternative would be a rename,
  rejected as fighting the keep-listed file identity).
- **Relic components imported by live code keep their names:**
  `MuseumScene` (`EditorViewport`, `Workspace3DView`) and `MuseumEntities` —
  the editor renders the museum for preview; the import stays, the name
  stays. **`LayoutMuseumShell`** is also listed: it is not imported by live
  code, but appears as prose in live `bench/` comments (7 hits) that match
  the identifier gate — listing it keeps the gate honest.
- **Shared museum-domain types get renamed** (`MuseumStateStore` →
  `RuntimeStateStore`, `MuseumRoomId` → `RoomId`, `MuseumRuntime` →
  `Runtime`, `MuseumConnection` → `RuntimeConnection`, the chopin seeds
  `museumNavigationGraph/Rooms/Assets/Materials`) — relic files that import
  them receive mechanical import updates. The frozen invariant is
  *behavior*; the P7.4 smoke gate (relic routes behavior-equivalent) applies
  to this slice.
- Grep gate is run with `-g '!src/lib/museum/**' -g '!src/routes/museum/**'
  -g '!tests/lib/museum/**'` exclusions (the relic test tree lives at
  `tests/lib/museum/`, e.g. `navigation/camera-motion.test.ts`), then the
  keep-list is verified individually — never exclude a directory without
  confirming each remaining hit is on the list.

### 4. File placement (renames + folder moves — `git mv`, one commit per group)

Two kinds of move in this slice, as **separate commit groups**: the 15
rename-required moves below (the old names must die with the vocabulary), and
the pure-organization folder moves in §4b. Same mechanical wave and gates, but
the §4b group is reviewable on its own — no identifiers change there.

#### 4a. Rename-required moves (15)

| Old | New |
|---|---|
| `src/lib/editor/museum-editor.svelte.ts` | `src/lib/editor/editor-store.svelte.ts` |
| `src/lib/editor/museum-editor.types.ts` | `src/lib/editor/editor-types.ts` |
| `src/lib/types/museum.ts` | `src/lib/types/scene.ts` |
| `src/lib/state/museum-state.svelte.ts` | `src/lib/state/runtime-state.svelte.ts` |
| `src/lib/content/museum-scene.json` | `src/lib/content/scene.json` |
| `src/lib/editor/EditorMuseumEntities.svelte` | `src/lib/editor/EditorSceneEntities.svelte` |
| `tests/lib/editor/museum-editor.test.ts` | `tests/lib/editor/editor-store.test.ts` |
| `tests/lib/editor/museum-editor-camera.test.ts` | `tests/lib/editor/editor-store-camera.test.ts` |
| `tests/lib/editor/museum-editor-placement.test.ts` | `tests/lib/editor/editor-store-placement.test.ts` |
| `tests/lib/editor/museum-editor-selection.test.ts` | `tests/lib/editor/editor-store-selection.test.ts` |
| `tests/lib/editor/museum-editor-textures.test.ts` | `tests/lib/editor/editor-store-textures.test.ts` |
| `tests/lib/editor/museum-editor-shell.test.ts` | `tests/lib/editor/editor-store-shell.test.ts` |
| `tests/lib/editor/museum-editor-bind-migration.test.ts` | `tests/lib/editor/editor-store-bind-migration.test.ts` |
| `tests/lib/editor/museum-editor-package-archive.test.ts` | `tests/lib/editor/editor-store-package-archive.test.ts` |
| `tests/lib/state/museum-state.test.ts` | `tests/lib/state/runtime-state.test.ts` |

⚠️ The facade test suites **cannot** take the plain `editor-*` names —
`editor-camera.test.ts`, `editor-placement.test.ts`, `editor-selection.test.ts`,
`editor-textures.test.ts` already exist as module unit tests. The `editor-store-*`
scheme above is collision-checked (verified 2026-08-22).

#### 4b. Folder placement — `camera/` + `fields/` (new commit group, pure organization)

Decision (2026-08-22): the flat editor root is dominated by the **30-file
camera surface** built out by P8 (37% of the flat count). Move it and the
reusable field widgets into folders; everything else stays flat — the panels,
viewport, and geometry modules are individually large and cross-import each
other, and the `Editor*`/`editor-*` prefixes already organize them
alphabetically (grouping those is aesthetic churn with no payoff).

- **`src/lib/editor/camera/`** — the 30-file camera surface: 18
  `EditorCamera*.svelte` + 12 `editor-camera*.ts` /
  `editor-directed-edge-motion.ts`. **Names are kept as-is** —
  `Editor*`/`editor-*` are *domain* markers (editor vs the relic's visitor
  camera code in `src/lib/museum/navigation/`), not location markers; no
  rename inside the folder.
- **`src/lib/editor/fields/`** — the 3 *generic* widgets only: `EditorNumberField`,
  `EditorVec3Field`, `EditorProgressField`. **`EditorCameraFovField` stays in
  `camera/`** — it is camera-domain (the FOV input for framing), not a generic
  widget; the widget folder stays purely generic.
- **Test-tree mirroring (decision 2026-08-22): mirror.** The 10 flat camera
  tests — `editor-camera.test.ts`, `editor-camera-connections.test.ts`,
  `editor-camera-framing*.test.ts`, `editor-camera-labels.test.ts`,
  `editor-camera-path.test.ts`, `editor-camera-timeline.test.ts`,
  `editor-camera-view.test.ts`, `editor-directed-edge-motion.test.ts` — move
  to `tests/lib/editor/camera/`, matching the src tree. Precedent: `app/`,
  `store/`, `export/`, `import/` test subdirs already exist.
- **`MuseumEditorApp.svelte` stays at editor root** — it is the relic entry
  and the vite plugin resolves it from `editorRoot`; moving it would update
  the plugin path for zero benefit.
- **Import-path updates:** every importer of a moved file changes —
  `$lib/editor/X` → `$lib/editor/camera/X` (or `../camera/X` from the
  subdirs); a missed path fails `svelte-check`, same gate as the renames.

#### 4b-i. Placement file inventory (grep-verified 2026-08-22 — pick-up-ready)

**Move → `src/lib/editor/camera/` (30 files):**

```
EditorCameraConnectionTiming.svelte   EditorCameraEdgeRuler.svelte
EditorCameraFovField.svelte           EditorCameraFramingControls.svelte
EditorCameraFramingHelpers.svelte     EditorCameraHelpers.svelte
EditorCameraInspector.svelte          EditorCameraLabelProjector.svelte
EditorCameraLabelsOverlay.svelte      EditorCameraPathHelpers.svelte
EditorCameraPreviewControls.svelte    EditorCameraRig.svelte
EditorCameraTimelineDots.svelte       EditorCameraTimelineFrame.svelte
EditorCameraTimelinePanel.svelte      EditorCameraTimelineRuler.svelte
EditorCameraTree.svelte               EditorCameraViewHelpers.svelte
editor-camera-connections.ts          editor-camera-framing-authoring.ts
editor-camera-framing-envelope.ts     editor-camera-framing.ts
editor-camera-labels.svelte.ts        editor-camera-labels.ts
editor-camera-path.ts                 editor-camera-timeline.ts
editor-camera-timing.ts               editor-camera-view.ts
editor-camera.ts                      editor-directed-edge-motion.ts
```

**Move → `src/lib/editor/fields/` (3 files):**

```
EditorNumberField.svelte   EditorVec3Field.svelte   EditorProgressField.svelte
```

**Move → `tests/lib/editor/camera/` (10 files, mirror):**

```
editor-camera.test.ts                  editor-camera-connections.test.ts
editor-camera-framing-authoring.test.ts  editor-camera-framing-envelope.test.ts
editor-camera-framing.test.ts          editor-camera-labels.test.ts
editor-camera-path.test.ts             editor-camera-timeline.test.ts
editor-camera-view.test.ts             editor-directed-edge-motion.test.ts
```

**Import-edit surface** (paths change; sibling `./` imports *inside*
`camera/` are unchanged — they move together):

- **27 external src importers** (path gains `camera/` or `fields/`):
  `CameraFlowPanel`, `EditorInspector`, `EditorLeftSidebar`,
  `EditorLightInspector`, `EditorMaterialInspector`, `EditorPrimitiveInspector`,
  `EditorSelection`, `EditorTransformInspector`, `EditorViewport`,
  `MuseumEditorApp`, `app/CameraPlanInspector`, `app/EditorApp`,
  `app/Workspace3DView`, `camera-plan/CameraPlanViewport`,
  `gizmo/camera-gizmo-adapter`, `hooks/use-camera-preview`,
  `hooks/use-camera-timeline`, `layout/plan-camera-projection`,
  `museum-editor.svelte.ts`, `store/camera-preview-commands`,
  `store/camera-preview-controller`, `store/camera-timeline-controller`,
  `store/controller-hosts`, `store/navigation-graph-mutator`,
  `store/path-anchor-mutator`, `store/selection-actions`,
  `store/view-keyframe-controller`.
- **8 external test importers:** `app/room-focus`,
  `camera-plan/camera-plan-timing`, `gizmo/camera-gizmo-adapter`,
  `gizmo/editor-gizmo-behavior-fixtures`, `museum-editor-camera`,
  `store/p8-s2-preview-scope`, `store/p8-s3-edge-timeline`,
  `store/p8-s4-preview-sequence`.
- **Moved files' own non-sibling imports** gain one `../` level (most camera
  files import `store/`, `layout/`, or root components — `./store/X` →
  `../store/X`, `./EditorViewport.svelte` → `../EditorViewport.svelte`).
- **Composition with §4a:** the §4a test renames and §4b paths compose — e.g.
  `museum-editor-camera.test.ts` is both renamed (`editor-store-camera.test.ts`)
  and has its `$lib` camera imports updated; each group is green on its own.

### 5. Acceptance tests and manual scenarios

**Two gates** — the naive single grep would conflate identifiers with prose
and paths: a zero-match bare-museum gate flags ~315 live-scope `\bmuseum\b`
occurrences across three populations (rename targets that will disappear,
~10+ permanent relic import paths like `'$lib/museum/MuseumScene.svelte'`, and
hundreds of prose/comment hits that would force ~450 editorial decisions
mid-slice). The split keeps the slice mechanical.

- **Identifier gate (zero-match — the enforceable one):**
  `rg '\b[A-Za-z_]*[Mm]useum[A-Z][A-Za-z_]*|MUSEUM_[A-Z_]+|\b(museumNavigationGraph|museumRooms|museumAssets|museumMaterials|museumSceneDocument|museumSceneBytes|museumAssetById|museumState|museumScene|museumpack)\b' src tests vite`
  with `-g '!src/lib/museum/**' -g '!src/routes/museum/**' -g '!tests/lib/museum/**'`
  → **zero matches outside the §3 keep-list** — the keep-list names appear at
  live import/usage sites and always match the pattern (~41 hits, verified
  2026-08-23: `MuseumScene` ×11, `MuseumEntities` ×2, `MuseumEditorApp` ×11,
  `MuseumEditorEntry` ×2, `LayoutMuseumShell` ×12 incl. bench + relic-source
  boundary tests, `museumEditorEntryPlugin` ×3). Covers
  every prefixed identifier (§2 incl. the 13 derived function names)
  *including mid-word shapes* (`RuntimeMuseumScene` — `\b[Mm]useum` alone
  misses it), the uppercase `MUSEUM_*` constants (`[Mm]useum` never matches
  them), and the explicitly lowercased seed-variable map.
- **Prose/path gate (tolerated-list, not zero-match):** bare `\bmuseum\b` in
  live scope must fall into exactly one of: (1) relic import paths
  (`from '$lib/museum/...'` and relative museum paths — ~10+ files incl.
  `EditorViewport`, `Workspace3DView`, the camera files, dev routes,
  `bench/record-baseline`; permanent and legitimate); (2) the §3 keep-list
  names (`MuseumScene`, `MuseumEntities`, `MuseumEditorApp`,
  `MuseumEditorEntry`, `virtual:museum-editor-entry`); (3) tolerated product
  prose — browser titles, "Preview Museum", relic references in comments.
  Policy: **editor-internal prose is reworded in the strings pass;
  product/relic references are tolerated and documented** — not hundreds of
  individual adjudications. The full per-line classification lives in
  [`2026-08-23-P7.6-strings-pre-inventory.md`](./2026-08-23-P7.6-strings-pre-inventory.md)
  — every live-scope bare `\bmuseum\b` hit pre-bucketed (516 lines / 522
  occurrences: R 340 / P 147 / T 35, machine-verified 2026-08-23; P7.3
  removed one seed-comment hit) so the strings pass is a checklist, not a
  judgment call. **The "~315" figure above predates the P8 S1–S6 delta;
  the inventory supersedes it.**
- **`svelte-check` 0/0** — the compiler is the enforcement backstop (every
  missed identifier fails; unlike P7.1, no regex-gate blind spot exists).
- **Full suite green** — 1,970 baseline; all 81 test files touched. The
  "zero expectation edits" gate cannot hold (every test file changes); the
  gate is "suite green after rename", which is airtight in a different way.
- **Format roundtrip:** `package-roundtrip-smoke.test.ts` green with the new
  member name; a crafted old-format archive (`.museumpack.zip` /
  `museum-scene.json`) **fails import** — that failure is the hard-break
  acceptance, not a bug.
- **Relic smoke (P7.4 record):** `/museum` + `/museum/editor` boot and behave
  as before.
- **Placement gate (§4b):** after the folder-move commit, `svelte-check` 0/0
  proves every moved file's importers were updated (a missed path fails
  compile), and the full suite stays green with the 10 camera tests now
  running from `tests/lib/editor/camera/`.

### 6. Ordering / boundaries

- **Last increment: P7.1 → P7.5 → P7.2 → P7.3 → P7.6.** The rename is
  line-preserving (it would not invalidate the refreshed anchors), but
  landing last means it renames already-thinned, settled code and no later
  slice reviews through the mega-diff. Land on top of the committed P8+P7
  delta (commit the current uncommitted tree first).
- **This is the one P7 increment that is NOT zero-behavior-change:** the
  format rename (owner-approved hard break) and the code-adjacent string
  renames are deliberate, test-pinned changes — carve-out to the umbrella
  Boundaries section (see the note added there).
- **Commit shape:** one commit per group (**§4b folder placement first** —
  pure `git mv`, no identifier changes. Camera files DO reference museum
  identifiers (e.g. `editor-camera-path.ts` uses `MuseumRoomId`/
  `MuseumSceneDocument`), but the placement commit changes none of them —
  the rename pass edits the moved files' contents afterward, so the moves
  are fully order-independent. Then identifier core → content seeds →
  format → strings → the 15 §4a rename-required moves → docs), each green,
  mirroring P7.2's per-namespace rollback split. The placement group lands
  as a clean pure-moves diff, and the giant rename diff reviews on top of
  an already-settled tree.

### 7. Rollback / fallback split

- Per-group `git revert` in reverse order; file renames are `git mv` so a
  revert restores paths. The hard-break format change is the only item not
  fully reversible for *external* archives — owner-accepted (pre-release).

> **Implementation (2026-08-23) — P7.6 shipped, P7 closed.** All five waves
> landed green: (1) **§4b folder placement** — `git mv` of the 30-file camera
> surface → `src/lib/editor/camera/`, 3 generic widgets → `fields/`
> (`EditorCameraFovField` stayed camera-side), 10-test mirror →
> `tests/lib/editor/camera/`; import rewiring exposed a `$lib`
> perl-interpolation bug mid-wave (the `$l` in `$lib` ate the match — the
> first `s/$lib/…` pass never fired), caught by a second sweep, plus one
> dynamic-import residual in the facade; (2) **identifier core** — §2 name
> map + 13 derived functions + seed vars across live scope, keep-list 41
> intact; three live collisions (locals shadowing `scene`/`rooms` params in
> `chopin-project`, `assets`, `rooms-to-layout`) fixed by aliasing;
> `assetCatalog` rename reverted — the seed IS imported, so `assets` stayed
> and the function param took the rename; (3) **§4a rename-required moves**
> — all 15 (facade, types, `types/museum.ts`→`scene.ts`,
> `state/museum-state`→`runtime-state`, `content/museum-scene.json`→`scene.json`,
> `EditorMuseumEntities`→`EditorSceneEntities`, 8 test files) + tree-wide path
> rewrites; (4) **format hard break** — `.museumpack.zip` → `.scenepack.zip`
> (src + 7 test expectations), archive member + export filenames already on
> `scene.json`/`layout.json` (the member wave had landed with the file
> rename), slug fallback `'museum-scene'` → `'scene'`, generator
> `'museum-editor-5.4'` → `'editor-5.4'` (flagged §3.1); (5) **strings pass**
> — the 340-line R bucket consumed to exactly the tolerated set: **177
> lines / 182 occurrences remain, all P/T** (147 P + 35 T − 5 mixed lines =
> 177; 153 + 40 − 10 double-counted occ = 182), including the flagged §3.2
> MIME renames (`x-editor-texture`/`x-editor-camera-node`), the §3.3 CSS
> token (`--museum-editor-fg` → `--editor-fg`), the contracts-test local
> `museum` var → `visitor`, and the 14 "museum-editor refactor plan" store
> comments → "editor-facade refactor plan". Post-close gap-closure
> (2026-08-23): the format hard-break test gained 2 documented legacy-format
> pin lines (`package-importer.test.ts:108,117` — an archive carrying the
> pre-break `museum-scene.json` member must be rejected; without it a future
> legacy fallback could return unnoticed), so the current live state is
> **179 lines / 184 occurrences, all P/T**. **Gates:** identifier gate —
> zero matches outside the §3 keep-list (~41 hits, all keep-listed:
> `MuseumScene` ×11, `MuseumEntities` ×2, `MuseumEditorApp` ×11,
> `MuseumEditorEntry` ×2, `LayoutMuseumShell` ×12, `museumEditorEntryPlugin`
> ×3); bare-museum gate 179/184 = exactly the bucketed P/T set;
> `svelte-check` 0/0; suite **1,989 green** (format hard-break suites 54/54
> incl. the roundtrip pin). The inventory annex records the post-pass state.

---

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
  `layout-preview-geometry.ts` — **de-hybridized 2026-08-22 re-verify: 11
  lines, pure real fns, no re-export remains** (only its `./layout-types`
  import rewrite is left for P7.2).
- Chopin coupling: `chopinRuntime`/`museumSceneDocument` references across
  `editor-camera-path.ts` (6 rooms-defaults: 112/137/181/193/208/337),
  `editor-camera-view.ts` (4: 126/165/181/202), `museum-editor.svelte.ts`,
  `store/document-store.svelte.ts`, `layout/layout-preview-state.svelte.ts`
  (incl. the relic-seeded `createLayoutPreviewState()` and the test-only
  `loadChopinLayoutPreview()`); `CURRENT.md` Traps documents the
  `store.rooms`-vs-`chopinRuntime.rooms` foot-gun.
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
  get+set on two hosts (107, 422–426, 489–493) — P7.5 rewiring
  (2026-08-22: re-baselined anchors 422–426 / 489–493; the facade field is
  now a raw `$state` at 761 and `lastSequencePlayhead` at 763 joins the
  move).
- Archive pointer: original split intent in
  [`2026-08-03-priority-1-file-splits-plan.md`](../archive/plans/phase-5-textures/2026-08-03-priority-1-file-splits-plan.md)
  (deferred-thinning note in Slice 3; suggested next slice in Slice 6);
  selection end-state in
  [`2026-08-15-graphics-h1-s4-unified-hierarchy.md`](../archive/plans/pre-h1-letters/2026-08-15-graphics-h1-s4-unified-hierarchy.md).
