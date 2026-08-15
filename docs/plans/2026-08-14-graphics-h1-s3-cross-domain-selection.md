# H1 S3 — Cross-domain Selection

**Date:** 2026-08-14
**Status:** Implemented
**Parent:** [`2026-08-14-graphics-h1-unified-3d-editing.md`](./2026-08-14-graphics-h1-unified-3d-editing.md)
**Prerequisite:** S2 · Boot into an Empty Project
**Handoff:** [`../../hand-off/CURRENT.md`](../../hand-off/CURRENT.md)

## Goal

Make the editor's selection **explicitly cross-domain**: one `ActiveEditorSelection`
at the H1 composition root — exactly one active domain (`layout`, `scene`,
`camera`, or `none`) — by *adapting* the existing layout / placement-cluster /
camera selection stores without merging their underlying types.

Today the layout selection (`LayoutInteractionState.selection`) can coexist with
a scene placement/cluster pick and a camera navigation pick at the same time;
nothing owns the boundary between them. S3 introduces the one-domain invariant,
keeps every existing pick/tree call site working (activation is centralized, not
rewritten per call site), and makes every document swap reconcile the active
selection: document replacement, undo/redo, delete, import, and view switch.

This slice is **selection semantics only**. It does not build 3D layout picking
(S5/S6), the gizmo host (S7), or the unified hierarchy (S4) — those consume
`ActiveEditorSelection` later. S3 makes the machinery **domain-generic** so the
post-H1 Plan staging mode (C1) can route Plan scene-activation through it
without rework.

## Current state

| Concern | Today |
|---|---|
| Scene/placement selection | `EditorSelectionStore.workspace: WorkspaceSelection` — `none` \| `placement` (ids, clusterId, roomId) \| `cluster`. Reducer `setWorkspace`/`setNavigation`/`setDiscovery` already cross-clears the workspace/nav pair (documented invariants in `selection-store.svelte.ts`) |
| Camera selection | `EditorSelectionStore.navigation: NavigationSelection` — `none` \| `node` \| `connection` \| `anchor` \| `view-keyframe`, plus derived `discoveryConnectionId`/`discoveryDirection` slots |
| Layout selection | `LayoutInteractionState.selection: LayoutSelection` — `none` \| `room` \| `wall` \| `opening` \| `interiorAnchor` \| `object`. Shell-owned `$state` in `H1EditorApp`; **not** part of the store |
| Cross-domain boundary | None. Layout selection coexists with workspace/nav picks; nothing detaches the previous domain's actionable selection |
| Scene reconcile | `#reconcileSelection()` runs on every scene-document swap via `EditorDocumentStore`'s after-replace listener: drops dead nav node/connection, demotes `anchor`→`connection` and `view-keyframe`→`connection`, drops cluster if room changed, filters placement ids, cancels stale pending frames |
| Layout reconcile | None. Layout undo/redo restores only `LayoutPreviewState` snapshots via `LayoutHistoryHost.replace` (`capture`/`replace`/`matches?`); `LayoutInteractionState.selection` is not in the snapshot and is never re-validated |
| Delete paths | `deleteSelection()` calls `deselect()` after commit; `deleteSelectedAnchor`/`deleteSelectedViewKeyframe` rely on the after-replace demotion. Plan deletes fix selection **per path** in `H1PlanView` (opening→wall, room→none) — inconsistent and partial |
| Import/reset | Store-level `importDocument()` clears workspace + navigation + room + camera focus + history. The layout surface (`resetLayoutPreview`) and its selection are shell-level and not cleared together |
| View switch | S1 contract (pinned in `contracts.test.ts`): `setWorkspace` preserves document, history, dirty state, and the workspace selection slot |
| Shortcuts | Escape ends in `selectionActions.deselect()` (scene-owned only); Delete is context-gated (camera → node/connection, scene → placements, Plan → `LayoutPlanViewport` keydown) |

Key fact: the **scene/camera pair already enforces mutual exclusion internally**
(one reducer, two slots, cross-clearing invariants). The missing boundary is
`layout ↔ (scene | camera)` and the missing lifecycle is **layout reconcile**.
S3 therefore needs no schema merge and no rewrite of the reducer — it adds one
composition-root wrapper, two adaptation hooks, and one new reconcile function.

## Target

```text
H1 composition root (H1EditorApp)
  ├─ EditorSelectionStore.workspace      WorkspaceSelection   (unchanged shape)
  ├─ EditorSelectionStore.navigation     NavigationSelection  (unchanged shape)
  ├─ LayoutInteractionState.selection    LayoutSelection      (unchanged shape)
  │
  └─ EditorActiveSelectionStore  (new, h1/active-editor-selection.svelte.ts)
       active = $derived<ActiveEditorSelection>   ← one of:
           { domain: 'none' }
         | { domain: 'layout'; selection: LayoutSelection }
         | { domain: 'scene';  selection: WorkspaceSelection }
         | { domain: 'camera'; selection: NavigationSelection }
       deselectActive()   → clears whichever domain is active
       reset()            → all three slots to empty (import/reset)
       ← adaptation hooks (no call-site rewrites):
          scene/camera activate  → clearLayoutSelection(layoutInteraction)
                                 (wired via a createMuseumEditorStore option,
                                  no-op default keeps the relic untouched)
          layout activates       → clearPlacementSelection() + setNavigation(none)
       ← layout reconcile (new pure fn):
          every layout swap      → re-validate layoutInteraction.selection
```

- The three source slots keep their types, owners, and reducer invariants. The
  wrapper **derives** the active domain and **owns the detach/attach boundary**.
- Plan selection always activates the layout domain; a 3D or hierarchy pick
  activates exactly one of scene/camera. View switching preserves the active
  selection (S1 contract unchanged).
- Import/reset begin with `domain: 'none'` on all three slots.

## Locked decisions

### One active selection domain, derived at the composition root

```ts
type ActiveEditorSelection =
  | { domain: 'none' }
  | { domain: 'layout'; selection: LayoutSelection }
  | { domain: 'scene'; selection: WorkspaceSelection }
  | { domain: 'camera'; selection: NavigationSelection };
```

- The umbrella's conceptual `SceneWorkspaceSelection` / `CameraSelection` map to
  the real types `WorkspaceSelection` / `NavigationSelection`. The wrapper never
  merges or copies identities between domains; it only reads the slots and
  clears the *other* slots on activation.
- "Actionable" means: layout `selection.kind !== 'none'`; scene
  `workspace.kind === 'cluster'` or `placement` with `ids.length > 0`; camera
  `navigation.kind !== 'none'`. Room-only placement (`ids: []`) is **context,
  not actionable** — it never counts as an active domain and never triggers
  cross-domain clearing (mirrors the reducer's existing latent-mode rule).
- `deriveActiveSelection(workspace, navigation, layoutSelection)` is a pure,
  exported function so the mapping is unit-testable. If (only in legacy states
  before convergence) more than one domain is actionable, the mapping resolves
  deterministically by priority `layout > scene > camera`. The wrapper's
  constructor runs `#convergeLegacyState()`: when more than one domain is
  actionable it keeps the highest-priority winner and clears the surplus slots
  (the derived read and the slots therefore always agree). In H1 boot this is
  unreachable — the hooks enforce exclusivity from the first pick — but it
  pins the promise for any future consumer that constructs the wrapper over
  pre-existing state.

### Source stores stay the owners; the wrapper adapts, never merges

- `EditorSelectionStore` keeps `workspace`/`navigation` and its reducer.
  `LayoutInteractionState` keeps `selection` and the `selectLayout*` helpers.
- `EditorActiveSelectionStore` (new, `h1/active-editor-selection.svelte.ts`)
  holds a reference to the store facade + `layoutInteraction`, exposes
  `active` as `$derived`, and owns `deselectActive()` / `reset()`.
- No schema change, no merged identity type, no move of layout room ids into the
  scene domain (or vice versa). `MuseumRoomId`-vs-`string` typing stays as is.

### Activation is centralized via two hooks, not per-call-site rewrites

Every existing pick/tree entry point keeps calling the API it calls today —
`selectionActions.selectPlacement/selectNavigationNode/…` in
`EditorSelection.svelte`, `EditorSceneTree.svelte`, `GuidedTourPanel.svelte`,
`EditorCameraTimelineFrame.svelte`, `EditorCameraInspector.svelte`, and the
`selectLayout*` helpers in `LayoutPlanViewport.svelte` / `H1PlanView.svelte`.
The exclusivity boundary is enforced centrally:

- **Scene/camera → clear layout.** `MuseumEditorStoreOptions` gains an optional
  `onSelectionActivate` field (no-op default) that `createMuseumEditorStore`
  forwards to `EditorSelectionStore`; the reducer fires it when a *real
  actionable* pick lands (`setWorkspace` with cluster or
  `placement.ids.length > 0`; `setNavigation` with `kind !== 'none'`). The
  composition root passes `() => clearLayoutSelection(layoutInteraction)`.
  Room-only writes and deselect do **not** fire it (non-actionable), so latent
  room context never clears a Plan selection. The options field is the only
  injection seam: `EditorSelectionStore` is a private field initializer in
  `MuseumEditorStore` (`museum-editor.svelte.ts:822`) with an internal
  `bindSession` (line 526), so neither a constructor arg nor a shell call can
  reach it directly.
- **Layout → clear scene/camera.** `H1EditorApp` registers a `$effect` watching
  `layoutInteraction.selection`; when it transitions to actionable, the shell
  calls `store.selectionActions.clearPlacementSelection()` (keeps room context)
  and `store.selectionStore.setNavigation({ kind: 'none' })`. Neither write is
  actionable, so there is no feedback loop: the effect converges in one pass.

### Background click and Escape deselect the *active* domain

- `deselectActive()` reads `active.domain` and clears that slot: layout →
  `clearLayoutSelection(layoutInteraction)`; scene/camera →
  `selectionActions.deselect()` (keeps room context, clears ids/cluster/nav, as
  today); `none` → no-op.
- **Guard parity is inherited, not unified.** The scene/camera branch keeps
  `deselect()`'s `isDocumentMutationBlocked || isEditorInteractionActive` guard;
  the layout branch keeps `clearLayoutSelection`'s unguarded behavior. This is
  intentional — each domain keeps today's semantics, and under the one-domain
  invariant only one branch can be live at a time — and it is pinned by a test
  (e.g. an empty-click during camera preview leaves a scene pick untouched but
  still clears a layout selection).
- The three empty-click/deselect entry points route through it:
  - `EditorSelection.svelte`'s empty-click branch (`result.action` none) —
    via a new optional `onDeselect` prop, defaulting to
    `() => store.selectionActions.deselect()` so the frozen relic
    `/museum/editor` keeps today's behavior;
  - `LayoutPlanViewport.svelte`'s no-hit branch — via a new optional
    `onDeselect` prop, defaulting to `clearLayoutSelection`;
  - the shortcut handler's final Escape — via an optional `deselectActive`
    callback passed to `registerEditorShortcuts` (defaults to today's
    scene-owned `deselect()`).
- This is the one explicit churn S3 accepts: three call sites gain an optional
  hook (five files once the pass-throughs above are counted). Everything else
  is covered by the two activation hooks.

### Layout selection reconciles on every layout swap

```ts
// Pure, in layout-interaction.ts (LayoutDocument from $lib/layout/layout-types)
reconcileLayoutSelection(selection: LayoutSelection, layout: LayoutDocument): LayoutSelection
```

- `none` → `none`; `room` → room if the room still exists, else `none`;
  `wall` → wall if room + segment exist, else `none`; `opening` → opening if it
  exists, else demote to `wall` (segment), else `none`; `interiorAnchor` →
  anchor if it exists, else demote to `wall` (segment), else `none`;
  `object` → object if it still exists in `layout.objects`, else `none`.
- Demotion mirrors the scene-side convention (`anchor`→`connection`,
  `view-keyframe`→`connection`): a child selection degrades to its nearest
  surviving parent identity instead of vanishing outright.
- The shell runs it from a `$effect` keyed on `layoutPreview.project.layout`
  (Svelte 5 deep `$state` tracking fires on the properties the reconcile reads).
  This covers **every** layout swap — undo, redo, commit, cancel, draft commit,
  delete, reset, import — including paths that bypass the layout history bridge
  (e.g. `H1PlanView.deleteOpening` mutates `layoutPreview` directly). An
  alternative that hooks only `LayoutHistoryHost.replace` was rejected because
  it misses the non-transactional delete paths.
- The effect writes `layoutInteraction.selection` only when it changes
  (converges in one pass; no loop). The manual per-path fixes in `H1PlanView`
  (opening→wall, room→none) become redundant but stay harmless — they produce
  the same result the reconcile would.

### Scene-side reconcile stays; import/reset begin with no active selection

- The existing `#reconcileSelection()` after-replace listener is unchanged; the
  wrapper's `active` re-derives automatically when scene/camera selections are
  demoted or dropped.
- `importDocument()` keeps clearing workspace + navigation. The three reset
  actions (scene and layout resets in `EditorProjectMenu`, the sidebar "Reset
  empty") and any future full-project import call `activeSelection.reset()` —
  clearing the layout selection too — so the "import begins with no active
  selection" contract holds at the composition root. Full-project package
  import remains S9/S11; S3 only establishes and pins the mechanism.

### View switch preserves the active selection (S1 contract unchanged)

- Plan ↔ 3D (`setWorkspace('layout')` / scene / camera) never activates or
  clears a domain by itself. A layout selection survives into 3D (the draft
  architecture renders there, and `LayoutPreviewScene` already highlights from
  `interaction.selection`); a scene/camera selection survives into Plan. The
  next pick activates a domain and the hooks detach the previous one.
- The existing S1 contract test ("switches workspace without touching document,
  history, dirty state, or selection") stays green unchanged.

### Delete is domain-owned

- Scene placement delete: `deleteSelection()` already `deselect()`s; under the
  one-domain invariant the active domain falls to `none` (layout was already
  cleared when scene activated).
- Camera delete: `deleteSelectedAnchor` / `deleteSelectedViewKeyframe` keep
  their after-replace demotion.
- Layout delete: covered by the layout-swap reconcile (opening/object/room
  deletes replace `layoutPreview.project`), so stale selections cannot survive.
- Delete **in 3D for a layout target** is out of scope (the 3D layout pick +
  gizmo arrive in S5/S6/S7); the Plan viewport keeps owning layout deletes.

## Implementation steps

### 0. Pin the contracts with tests first

Add an `H1 S3 — cross-domain selection` describe block to
`tests/lib/editor/h1/contracts.test.ts` (plus a focused unit file
`tests/lib/editor/h1/active-editor-selection.test.ts` for the pure parts):

- **Derived mapping** — `deriveActiveSelection` yields `scene` for an
  actionable workspace pick, `camera` for a non-none navigation, `layout` for a
  non-none layout selection, `none` for all-empty, and room-only placement as
  `none` (context, not actionable).
- **Exclusivity, scene→layout** — activate a placement; assert the layout
  selection is cleared (via the injected `clearLayoutSelection` hook).
- **Exclusivity, camera→layout** — activate a nav pick; assert layout cleared
  and workspace demoted to room-only.
- **Exclusivity, layout→scene/camera** — activate a layout selection; assert
  `navigation` is `{ kind: 'none' }` and workspace ids/cluster cleared with room
  context kept.
- **Deselect active domain** — with layout active, `deselectActive()` clears
  layout; with scene active it leaves the room-only context, exactly like
  today's `deselect()`; with `domain: 'none'` it is a no-op.
- **Deselect guard parity** — with `isDocumentMutationBlocked` true (camera
  preview), `deselectActive()` on the scene domain is a no-op (inherits
  `deselect()`'s guard) while the layout branch still clears — pin the
  asymmetry as intentional.
- **Multi-actionable convergence** — `deriveActiveSelection` resolves a legacy
  state with two actionable domains by priority `layout > scene > camera`, and
  the store's construction-time convergence clears the surplus slots.
- **Layout reconcile** — undo/commit/delete scenarios: opening delete demotes to
  wall, room delete clears, object delete clears, wall in a deleted room clears.
  Pin the pure `reconcileLayoutSelection` against `LayoutDocument` fixtures.
- **Import/reset** — after `resetToCheckedInDocument()` + layout reset,
  `active.domain === 'none'` on all three slots.
- **View switch** — extend the existing S1 preservation test with an assertion
  that the *active domain* is unchanged across `setWorkspace`, plus a
  synthetic-fixture case proving a **layout** selection survives Plan → 3D
  (the store-level test cannot see `layoutInteraction`, so feed the pure
  `deriveActiveSelection` an untouched workspace/nav pair plus a non-none
  layout selection and assert the layout domain wins).
- **Relic isolation** — a comment (and a type-level assertion if cheap) that
  `/museum/editor` never wires the wrapper: the new optional `onDeselect` props
  default to the legacy behavior.

### 1. `ActiveEditorSelection` type + pure mapping

- Add `h1/active-editor-selection.svelte.ts` exporting the discriminated union,
  `deriveActiveSelection(...)`, and `EditorActiveSelectionStore`.
- Constructor takes the store facade + `layoutInteraction` and a
  `clearLayoutSelection` callback. Construction converges legacy multi-actionable
  state deterministically (per Locked decisions) and exposes:
  - `active` (`$derived`) — the one-domain read;
  - `deselectActive()` — clears the active domain only;
  - `reset()` — clears **all three slots explicitly**:
    `clearLayoutSelection(layoutInteraction)` +
    `setWorkspace({ kind: 'none' })` + `setNavigation({ kind: 'none' })`.
    Not the room-context-preserving `clearPlacementSelection()` — reset means
    reset, and the test pins `active.domain === 'none'`. (Room-only placement
    would also derive to `none`, so it converges either way; the explicit clear
    removes the ambiguity.)

### 2. Adapt `EditorSelectionStore` with the scene/camera→layout hook

- Add `onSelectionActivate?: () => void` to `MuseumEditorStoreOptions`
  (no-op default); `createMuseumEditorStore` forwards it into
  `EditorSelectionStore` (which stores it as a field). This is the only
  injection seam — `EditorSelectionStore` is a private field initializer in
  `MuseumEditorStore` (`museum-editor.svelte.ts:822`) and `bindSession` (line
  526) is internal, so neither a constructor arg nor a shell-side call can
  reach the reducer.
- The reducer invokes the hook after its existing cross-clearing when the new
  workspace is actionable (`setWorkspace` with cluster or
  `placement.ids.length > 0`) and when the new navigation is non-none — so
  layout is the last thing cleared (detach-then-attach ordering: new domain
  lands, previous domains drop).
- The no-op default keeps the frozen relic and the legacy
  `MuseumEditorApp`-mounted tests byte-for-byte unchanged. `H1EditorApp`
  passes `() => clearLayoutSelection(layoutInteraction)`.

### 3. Layout activation hook in the H1 shell

- In `H1EditorApp`, construct `EditorActiveSelectionStore` with the store,
  `layoutInteraction`, and a `clearLayoutSelection` closure.
- Add the `$effect` on `layoutInteraction.selection`: when it becomes actionable,
  call `store.selectionActions.clearPlacementSelection()` +
  `store.selectionStore.setNavigation({ kind: 'none' })`. No-op guard: skip when
  the new selection is `none` (clearing itself must not re-enter).
- Expose the wrapper to children via Svelte context (same pattern as
  `EditorInteractionStore`) so S4/S6/S7 consumers can read `active`.

### 4. Layout selection reconcile

- Add pure `reconcileLayoutSelection(selection, layout)` to
  `layout-interaction.ts` with the demotion rules above; unit-test it in step 0.
- Wire it in `H1EditorApp` as a `$effect` keyed on `layoutPreview.project.layout`
  that assigns the reconciled selection back to `layoutInteraction.selection`
  when it differs.
- Leave the existing `H1PlanView` per-path demotions in place (redundant but
  harmless); note them as candidates for removal in a later cleanup.

### 5. Active-domain deselect entry points

Three call sites gain an optional hook — five files once the pass-throughs are
counted:

- `EditorSelection.svelte` (rendered by `H13DView.svelte` in H1 and by the
  relic's `EditorViewport.svelte`): add optional `onDeselect` prop; the
  empty-click branch calls it when present, else
  `store.selectionActions.deselect()`. `H13DView` threads
  `activeSelection.deselectActive` through; `EditorViewport` keeps the default
  (relic untouched).
- `LayoutPlanViewport.svelte` (rendered by `H1PlanView.svelte`): add optional
  `onDeselect` prop; the no-hit branch calls it when present, else
  `clearLayoutSelection(interaction)`. `H1PlanView` threads it through.
- `registerEditorShortcuts` (`hooks/shortcuts.svelte.ts`): accept an optional
  `deselectActive` callback used by the final Escape branch; the scene-owned
  `deselect()` remains the default. `H1EditorApp` passes
  `activeSelection.deselectActive` at all three sites.

### 6. Import/reset path

There is no single "two-surface reset" call site — the resets are three
separate actions, and each calls `activeSelection.reset()` after itself:

- `EditorProjectMenu.resetScene()` (`EditorProjectMenu.svelte` →
  `store.resetToCheckedInDocument()`) — reset the scene slots;
- `EditorProjectMenu.resetLayout()` (`EditorProjectMenu.svelte` →
  `resetLayoutPreview`) — reset the layout slot;
- `EditorLeftSidebar.resetLayout()` (sidebar "Reset empty" →
  `resetLayoutPreview`) — reset the layout slot.

All three need it: the layout-swap reconcile incidentally clears a stale
*layout* selection on a layout reset, but only `reset()` clears the surviving
*scene* slots (workspace/navigation), so a scene pick made before "Reset empty"
would otherwise outlive the reset. After any reset the boot document begins
with `domain: 'none'` everywhere.

- Note in code that full-project import (S9/S11) will call the same `reset()`.

### 7. Regression + manual QA

- Full suite + `svelte-check` + production build; the S1 preservation test and
  every scene-selection test must pass **unchanged** (the wrapper is additive).
- Manual: in Plan, select a room then switch to 3D and click an entity — the
  layout highlight disappears and the entity is selected (one domain); in 3D,
  select a camera node then switch to Plan and click a wall — camera selection
  clears; click empty space in each view — the active selection clears; undo a
  layout edit that deleted the selected room — the layout selection clears;
  reset the project — nothing is selected anywhere; press Escape with focus on
  the inspector/app bar while a placement is selected — the active selection
  clears even though focus is not in the viewport (intentional: Escape
  deselects the active domain globally; the relic still requires scene-focused
  Escape); `/museum/editor` still behaves exactly as before (no wrapper
  wired).

## Regression matrix

| Concern | Required assertion |
|---|---|
| Derived mapping | Actionable workspace → scene; non-none nav → camera; non-none layout → layout; room-only placement and all-empty → none |
| Exclusivity | Activating any domain clears the other domains' actionable selections; never two actionable selections |
| Detach-before-attach | A new pick lands in its own domain while the previous domain's selection is cleared (hook order: reducer first, layout last) |
| Latent room context | Room-only placement (asset-placement latent mode) neither counts as active nor clears a Plan selection |
| Deselect | Background click / Escape clears exactly the active domain; scene deselect keeps room context as today; `deselectActive()` on `none` is a no-op; guard parity pinned (scene blocked during preview, layout clears) |
| Layout reconcile | Undo/commit/delete demote or clear stale layout selections (opening→wall, anchor→wall, room/object→none) |
| Scene reconcile | Existing demotions unchanged (anchor→connection, view-keyframe→connection, dead-node drop) |
| Delete | Deleting the selected target clears its domain's selection; active falls to none |
| Import/reset | Import and reset begin with `domain: 'none'` on all three slots |
| View switch | Plan ↔ 3D preserves the active selection, including a layout selection surviving into 3D; S1 contract test unchanged |
| Relic isolation | `/museum/editor` never wires the wrapper; `onSelectionActivate` defaults to no-op and `onDeselect` props default to legacy behavior |
| No type merge | `WorkspaceSelection`, `NavigationSelection`, `LayoutSelection` keep their own types and owners |

## Non-goals (deferred)

- Unified project hierarchy (S4) — S3 exposes `active` via context for it.
- Complete wall/opening pick identity (S5) and centralized 3D selection (S6) —
  3D layout picking arrives there, not in S3.
- Single TransformControls host with domain adapters (S7) — S3 provides the
  one-domain precondition the gizmo host will consume.
- Layout candidate preview + atomic history (S8) — S3 does not change the
  two-history-stack model or the room-registry divergence handling from S2.
- Full-project package import (S9/S11) — S3 only establishes `reset()`.
- 3D Delete for layout targets; removing the now-redundant per-path demotions in
  `H1PlanView` (cleanup only, later).
- Changing the scene/camera reducer's internal cross-clearing semantics.

## Implementation notes (deviations)

- **Activation via hooks, not a rewrite.** The original umbrella wording ("every
  pick/tree action activates one domain") was implemented as two centralized
  hooks plus three optional deselect props rather than converting every call
  site — otherwise `EditorSelection.svelte`, both trees, the timeline, the
  inspector, the Plan viewport, and the shortcut handler would each need
  per-domain plumbing, with high regression risk against the frozen relic.
- **The activation seam is `MuseumEditorStoreOptions.onSelectionActivate`, not a
  store constructor arg.** `EditorSelectionStore` is a private field initializer
  with an internal `bindSession`, so the shell's only injection point is the
  options object `createMuseumEditorStore` already takes. The no-op default is
  what keeps the relic and the `MuseumEditorApp`-mounted tests untouched.
- **`reset()` clears explicitly rather than preserving room context.** The first
  draft routed it through `clearPlacementSelection()`; the review caught that a
  reset should leave no context at all. It converges either way (room-only
  derives to `none`), but the explicit `setWorkspace({ kind: 'none' })` makes
  the contract one thing and the test unambiguous.
- **Layout reconcile as a shell `$effect`, not a history-bridge hook.**
  `LayoutHistoryHost.replace` misses the non-transactional delete paths
  (`H1PlanView.deleteOpening`/`deleteLayoutObject` mutate `layoutPreview`
  directly), so the reconcile is keyed on `layoutPreview.project.layout`
  instead. The pure function keeps it testable.
- **`deselectActive()` is the only new behavior routed explicitly** — the
  empty-click/Escape sites were the one place the derived invariant could not
  self-enforce (a layout selection surviving into 3D would otherwise outlive a
  3D background click). The optional props keep the relic byte-for-byte
  equivalent.
- **No change to `selectionKey`** (cluster + placement ids). It stays
  scene-scoped; layout highlights read `interaction.selection` directly, and
  helper remounting across domains lands with S6/S7.

## Implementation notes (as-built deviations)

- **Layout-activation clearing moved onto the wrapper as
  `onLayoutSelectionChanged()`.** The shell `$effect` is a thin trigger
  (`activeSelection.onLayoutSelectionChanged()`); the guard + the
  `clearPlacementSelection()` + `setNavigation({kind:'none'})` writes live on
  the wrapper so the contract is unit-testable without a DOM harness.
- **The reducer hook is injected via `setOnSelectionActivate`, not a store
  constructor arg.** `EditorSelectionStore` stays a private field initializer;
  `createMuseumEditorStore` forwards the option through the setter in the
  `MuseumEditorStore` constructor. Consumers read the store through the public
  `store.selection` getter (not the private `selectionStore` field).
- **Reconcile is parent-first.** A dead wall clears an opening/anchor selection
  outright (no demotion target), matching the scene side's `anchor→connection`
  rule where a dead connection clears rather than demoting. The plan's
  demotion table already implied this; the tests pin both orders.
- **The three deselect/reset call sites ship with optional props only.**
  `onDeselect` on `EditorSelection.svelte` + `LayoutPlanViewport.svelte`,
  `deselectActive` on `registerEditorShortcuts`, `onReset` on
  `EditorProjectMenu.svelte` + `EditorLeftSidebar.svelte` — all no-op when
  absent, so `/museum/editor` (relic) passes nothing and stays byte-identical.
- **Construction-time convergence implemented, not just mapped.**
  `#convergeLegacyState()` in the wrapper constructor keeps the
  highest-priority domain and clears the surplus slots (unreachable on H1 boot
  but pinned by three unit tests for future consumers).
- **Reconcile change detection is structural, not reference-identity.** The
  shell effect compares `JSON.stringify(reconciled)` against the current
  selection (plus `reconcileLayoutSelection`'s JSDoc pins the
  return-the-same-reference-when-valid contract) so a future refactor that
  returns a fresh-but-equal object cannot re-write every run and loop.

## Verification

```text
npm test -w @portfolio/museum
npm run check -w @portfolio/museum
npm run build -w @portfolio/museum
```

Plus the manual cross-domain QA in step 7 and the unchanged S1 preservation +
relic smoke contracts in `tests/lib/editor/h1/contracts.test.ts`.
