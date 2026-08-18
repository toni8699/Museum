# H1 S4 — Unified Project Hierarchy

**Date:** 2026-08-15
**Status:** Implemented
**Parent:** [`2026-08-14-graphics-h1-unified-3d-editing.md`](./2026-08-14-graphics-h1-unified-3d-editing.md)
**Prerequisite:** S3 · Cross-domain Selection
**Handoff:** [`../../hand-off/CURRENT.md`](../../hand-off/CURRENT.md)

## Goal

Replace the three workspace-specific navigation surfaces with **one project
hierarchy**: the scene tree (`EditorSceneTree`), the camera tree
(`EditorCameraTree` → `GuidedTourPanel`), and the Plan-side layout summary
(`EditorLeftSidebar`'s `layout-preview-summary`) all collapse into a single
`UnifiedProjectTree` mounted in both Plan and 3D. The tree is a view over both
documents, never a merged identity type:

```text
Rooms
  <layout room>
    Architecture
      Walls · Openings · Layout objects
    Scene
      Clusters · Entities
Camera Tour
  Guided Tour · Free Nodes (connections → directions → view keys)
```

S3 made the editor's selection one-domain. S4 makes the hierarchy that domain's
second read surface: **every tree pick activates the picked item's domain
through the existing source APIs** (the S3 hooks already own exclusivity — the
tree adds no per-row cross-domain code), and **the tree highlights whatever
`ActiveEditorSelection.active` says** (plus the store's camera discovery slots
for direction rows — the one documented exception), so viewport pick → tree
highlight and tree pick → viewport/inspector stay in sync with no duplicated
selection state.

This slice is **hierarchy only**. It does not build 3D layout picking (S5/S6),
the gizmo host (S7), layout candidate preview + atomic history (S8), or
project-local asset import (S9). The post-H1 Plan staging mode (C1) is
explicitly out of scope, but the tree's Plan-view gate is designed so C1 can
lift the scene branch later without rework.

## Current state

| Concern | Today |
|---|---|
| Scene tree | `EditorSceneTree.svelte` — iterates **checked-in Chopin `museumRooms`** (not layout rooms), room rows via `store.selectedRoomId` (+ `focusRoom('paris')`), cluster rows via `store.selectedClusterId` + `treeExpandedClusterIds`, entity rows via `store.selectedPlacementIds` (Shift-additive `selectPlacementFromTree`), cluster add/remove-member mini-actions, read-only rows for Chopin-only rooms |
| Camera tree | `EditorCameraTree.svelte` = `GuidedTourPanel` — Guided Tour (ordered chain, sequence numbers, Start badge, drag-reorder, insert-from-free, remove) + Free Nodes; per-node `NodeConnectionsPanel` (incoming/outgoing connection rows → forward/reverse direction rows → `DirectionalKeyframeList`). Node expansion is **local `$state`** in the panel; connection/direction expansion lives in session slots (`treeExpandedCameraConnectionIds`, `treeExpandedCameraDirectionKeys`) |
| Plan sidebar | `EditorLeftSidebar`'s `layout-workspace` branch renders `layout-preview-summary`: rooms/floors/openings/objects counts, `layoutPreviewSourceLabel` + `layoutPreviewSessionStatus` badge, **Reset empty** (duplicate of Project-menu `resetLayout`), `layoutPreview.importError`. No tree at all in Plan |
| Sidebar switching | `H1EditorApp` mounts the relic `EditorLeftSidebar`, which switches content on `store.currentWorkspace` (scene → Scene\|Assets tabs, camera → camera tree, layout → summary). In 3D, the same sidebar also owns `outlinerElement` (shortcuts), `onAssetSelection`, `onReset`, `inert` on mutation block, and the "Back to museum" link |
| Selection | S3 wrapper `EditorActiveSelectionStore.active` (`ActiveEditorSelection`: layout \| scene \| camera \| none) exposed via `ACTIVE_EDITOR_SELECTION_KEY` context. Source slots keep their types: `LayoutSelection` (qualified room/wall/opening/interiorAnchor/object), `WorkspaceSelection` (placement/cluster + roomId), `NavigationSelection` (node/connection/anchor/view-keyframe). Room-only placement = latent context, never an active domain |
| Layout identity | `LayoutRoomRegistry` (from `createLayoutRoomRegistry`, project-layout-semantics) — `entries` in document order (floors flatMap rooms), each with `id` + `name` + `floor`. Scene entities/clusters carry `roomId`; camera nodes carry `roomId` (drives 3D helper placement, never tree guessing) |
| Inspector | `EditorInspector` switches panels on `store.currentWorkspace` (`'layout'` → layout inspector, `'scene'` → scene/asset, `'camera'` → camera), not on the active selection domain |
| Labels | `formatPlacementLabel` (entity/cluster ids), `formatCameraNodeLabel` (camera nodes), `entityMeta` (asset category / primitive / light), `room.name`, opening `kind` (`door` \| `window`), object `kind` (box/cylinder/sphere/plane/profile) |

Key fact: the **selection machinery is already done** (S3) and the **data the
tree needs is all readable today** — layout from `layoutPreview.project.layout`
via the registry, scene from `store.document` (`entities`, `clusters`,
`navigationNodes`, `connections`, `guidedTourNodeIds`). S4 is mostly a new
presentation component plus a small sidebar swap; the risky parts are (a)
preserving the camera tree's drag-reorder/expansion behaviors and (b) keeping
the frozen relic byte-for-byte untouched.

## Target

```text
H1 shell (H1EditorApp)
  ├─ H1Sidebar (new, h1/H1Sidebar.svelte)  ← replaces EditorLeftSidebar in H1
  │    ├─ header strip: layout source/status badge + import error (compact)
  │    ├─ Plan view:  Hierarchy only
  │    └─ 3D view:    tabs Hierarchy | Assets   (Assets stays a sibling panel)
  │         └─ UnifiedProjectTree (new)
  │              ├─ Rooms  → <layout room> → Architecture (walls/openings/objects)
  │              │                        → Scene (clusters/entities)
  │              └─ Camera Tour → Guided Tour · Free Nodes
  │                               (connections → directions → view keys)
  │
  ├─ EditorInspector (gains optional domain-driven panel switch, relic default)
  └─ EditorLeftSidebar stays mounted by /museum/editor only (untouched)
```

- **One tree, both views.** The unified tree replaces the workspace-scoped
  surfaces; the 3D Scene\|Camera context tabs stay (they drive viewport
  helpers/timeline), but the sidebar no longer swaps content by workspace.
- **Picks are domain-driven and view-aware.** In 3D every row is pickable. In
  Plan only **layout rows** are pickable; Scene and Camera Tour rows render
  visible but **read-only** (`aria-disabled`, click no-op). This honors S3's
  locked "Plan selection always activates the layout domain" and the umbrella's
  "Plan is layout CAD only" / "Plan exposes no camera mutation path". C1
  (post-H1 Plan staging) lifts the gate for the scene branch only.
- **Selection sync is bidirectional and free.** Tree picks call the same source
  APIs the viewport calls (`selectLayout*`, `selectionActions.select*`,
  `selectNavigationNode`/`selectCameraConnectionDirection`/
  `selectCameraTimelineViewKeyframe`) — S3's hooks and the reducer own
  cross-domain exclusivity. The highlight reads `activeSelection.active` and
  matches qualified row identity, plus the store's camera **discovery slots**
  for direction rows (the one documented exception — see Locked decisions). No
  selection state is duplicated anywhere.

## Locked decisions

### One hierarchy, view-aware pick gating

- `UnifiedProjectTree.svelte` (new, `apps/museum/src/lib/editor/`) mounts in
  both views. Rooms are **layout rooms in document order** (registry
  `entries`), each row labeled by `room.name` with the id as meta — the checked-in
  Chopin `museumRooms` list is never iterated by the H1 tree.
- **Plan-view gate:** `isUnifiedTreeRowInteractive(row, viewMode)` returns
  true for layout rows in both views and for scene/camera rows in 3D only.
  Gated rows render read-only (visible, `aria-disabled`, no-op click) so the
  hierarchy stays a persistent whole-project navigation surface while the
  selection policy holds. C1 reuses the same predicate to enable the scene
  branch in Plan staging mode.
- The sidebar no longer switches on `store.currentWorkspace`; the
  view→workspace mapping effect in `H1EditorApp` stays (inspector/other
  consumers still read it).

### Pure tree model with qualified row identity

- New pure module `apps/museum/src/lib/editor/unified-project-tree-model.ts`
  (no Three/DOM/Svelte imports — same rule as `$lib/layout/**`):
  `buildUnifiedProjectTreeModel({ layout, scene, guidedTourNodeIds })`
  returns a `UnifiedProjectTreeModel`: ordered rooms, each with
  `architecture` (walls/segments, openings, objects) and `scene`
  (clusters + entities by explicit `roomId`) children, plus a `cameraTour`
  root (guided chain in order + free nodes, each with connection/direction
  rows derived via the existing `getNodeConnections` helper).
- **Rows carry the exact qualified identity the selection types use**, so
  matching is exact, never coordinate- or index-guessed:

```ts
type UnifiedTreeRow =
  | { kind: 'room'; roomId: string }
  | { kind: 'wall'; roomId: string; segmentId: string }
  | { kind: 'opening'; roomId: string; segmentId: string; openingId: string }
  | { kind: 'interiorAnchor'; roomId: string; segmentId: string; anchorId: string }
  | { kind: 'object'; objectId: string }
  | { kind: 'cluster'; clusterId: string }
  | { kind: 'entity'; entityId: string }
  | { kind: 'camera-node'; nodeId: string }
  | { kind: 'camera-connection'; connectionId: string }
  | { kind: 'camera-direction'; connectionId: string; direction: CameraConnectionDirection }
  | { kind: 'camera-keyframe'; connectionId: string; direction: CameraConnectionDirection; keyframeId: string };
```

- Pure matchers, exported and unit-tested:
  - `isUnifiedTreeRowSelected(
      active: ActiveEditorSelection,
      discovery: { connectionId: string | null; direction: CameraConnectionDirection } | null,
      row: UnifiedTreeRow
    ): boolean`
    — layout rows match `active.selection` exactly; scene rows match the
    workspace slot (room row also highlights on room-only latent context, as
    today); camera rows match `navigation` (a connection/anchor/view-keyframe
    selection highlights the connection header — the same rules
    `NodeConnectionsPanel` uses today). **Direction rows are discovery-driven,
    not selection-driven**: the camera selection type's public surface omits
    direction (`navigationSelectionFromState` drops it — "discovery owns it"),
    so today's direction highlight reads `store.activeCameraConnectionId` /
    `activeCameraDirection` (the reducer's `discoveryConnectionId` /
    `discoveryDirection` slots), which can be set with **no** navigation
    selection at all (timeline scrubbing). The matcher therefore takes the
    discovery slots explicitly and highlights a direction row when the
    discovery connection + direction match — preserving today's behavior
    exactly. **Discovery only wins when no other domain is active:** a
    direction row highlights from discovery only when `active.domain` is
    `'camera'` or `'none'`, so a layout/scene selection never co-highlights a
    camera row (one highlighted domain per view, even though discovery itself
    may persist per the S3 invariant). This is the single, deliberate exception
    to "the tree reads only `active`"; everything else is `active`-driven.
  - `isUnifiedTreeRowInteractive(row: UnifiedTreeRow, viewMode: 'plan' | '3d'): boolean`.

### Picks call the source APIs; S3 owns exclusivity

- Layout row pick → `selectLayoutRoom` / `selectLayoutWall` /
  `selectLayoutOpening` / `selectLayoutInteriorAnchor` / `selectLayoutObject`
  on `layoutInteraction` (the exact helpers `LayoutPlanViewport` uses), then
  the S3 layout-activation effect detaches scene/camera.
- Scene row pick → `store.selectionActions.selectPlacementFromTree` (Shift
  additive preserved) / `selectClusterFromTree` / `selectRoom` (room-only
  latent context), then the S3 reducer hook detaches layout.
- Camera row pick → `store.selectionActions.selectNavigationNode` for node
  rows, `store.selectionActions.selectCameraConnectionDirection(connectionId,
  direction)` for connection and direction rows, and
  `store.selectCameraTimelineViewKeyframe(connectionId, direction, keyframeId)`
  for keyframe rows (the exact calls `GuidedTourPanel`/`NodeConnectionsPanel`/
  `DirectionalKeyframeList` use today) — each keeps its existing discovery
  mirroring, then the S3 hook detaches layout.
- The tree **never writes `active` directly** and adds no cross-domain code —
  that is S3's job and is already pinned by the S3 contract tests.
- Pick-expand: selecting a layout room expands its row; selecting a camera
  node expands it; selecting a connection/keyframe expands the node ancestor
  (mirrors `GuidedTourPanel`'s existing `$effect`).

### Camera Tour branch surfacing (preserved behavior)

- Today the camera workspace surfaces the camera tree immediately — it is the
  entire sidebar content. After S4 it becomes one collapsible branch and can
  get buried. The branch therefore **auto-expands on the transition into camera context** —
  a one-shot `$effect` keyed on `active3dContext` changing to `'camera'`,
  mirroring `GuidedTourPanel`'s existing select-expand `$effect` — **not** a
  continuous derived, so a user's explicit collapse stays authoritative while
  camera context remains active. Selecting a camera node also expands the
  branch + node. In scene context and Plan the branch is fully
  user-controlled.

### Preserved behaviors

- Cluster expansion (`treeExpandedClusterIds`), room expansion
  (`treeExpandedRoomIds`), camera connection + direction expansion
  (`treeExpandedCameraConnectionIds` + `treeExpandedCameraDirectionKeys`) stay
  in session state; guided-node expansion stays component-local `$state`
  (the tree is always mounted, so it survives Plan ↔ 3D switches naturally —
  exactly why the unified tree is one component, not three).
- Guided-tour drag-reorder, drop-insert, remove, sequence numbers + Start
  badge; free-node "Drag to guided" affordance; cluster add/remove-member
  mini-actions; entity/cluster meta labels; read-only treatment of the pinned
  guided start; the Camera Tour branch's "No cameras" empty state (zero nodes
  and zero connections).
- Accessibility: `role="tree"`/`treeitem`, `aria-selected`, `aria-expanded`,
  `aria-label`ed chevrons, tabbable rows (as today — no new roving-tabindex
  machinery), `aria-disabled` on gated rows, `inert` on the sidebar while
  `store.isDocumentMutationBlocked`.
- `outlinerElement` bind (shortcuts), `onAssetSelection` → `selectedAsset` —
  the new `H1Sidebar` exposes the same props the current `EditorLeftSidebar`
  usage provides (minus `onReset`, which the Project-menu reset in `H1AppBar`
  owns; the sidebar's "Reset empty" duplicate was dropped with the summary).

### Sidebar surface changes (and what happens to the layout summary)

- The layout summary's counts are replaced by the tree's own row counts. The
  source/status badge (`layoutPreviewSourceLabel` + `layoutPreviewSessionStatus`)
  and `layoutPreview.importError` move to a **compact header strip** at the top
  of `H1Sidebar`, hidden when the source is the boot `'blank'` and there is no
  import error (the common H1 case).
- **Reset empty is dropped from the H1 sidebar** — it duplicated the Project
  menu's `resetLayout` (both `resetLayoutPreview` + `clearSharedHistory` +
  `onReset`), which stays. The relic keeps its own sidebar unchanged.
- The "Back to museum" link stays in `H1Sidebar` for parity.

### Inspector becomes domain-driven (small, additive)

- `EditorInspector` gains an optional `activeSelection` prop (the H1 wrapper;
  the relic passes nothing). When provided and `active.domain !== 'none'`, the
  panel selection switches by **domain** (layout / scene / camera); otherwise
  it falls back to today's `store.currentWorkspace` behavior — the relic is
  byte-for-byte unchanged.
- Why: after S4 a scene/camera selection can be *active* while the view is
  Plan (S3 view-switch preservation), and today's workspace-keyed inspector
  would show the layout panel for it. The tree picks themselves never create
  this in Plan (gate), but a selection surviving Plan → 3D → Plan must keep
  its panel.

### Camera rooms nesting: not adopted (deviation note)

The umbrella's "Scene entities and camera nodes nest by explicit roomId"
applies to **scene content** (clusters/entities under their room, by
`entity.roomId` — adopted) but the tree **does not nest camera nodes under
rooms**. The umbrella's own hierarchy sketch shows `Camera Tour` at root, the
guided chain is order-semantic and cross-room (drag-reorder would be broken by
room grouping), and the relic camera tree is a flat Guided + Free list.
Explicit `roomId` continues to drive 3D helper placement only; the tree never
infers ownership.

## Implementation steps

### 0. Pin the contracts with tests first

Add an `H1 S4 — unified hierarchy` describe block to
`tests/lib/editor/h1/contracts.test.ts` plus a focused unit file
`tests/lib/editor/h1/unified-project-tree.test.ts` for the pure parts:

- **Model shape** — `buildUnifiedProjectTreeModel` orders rooms from the
  layout (floors flatMap), nests clusters/entities under their explicit
  `roomId`, and leaves unowned entities/clusters out of every room (they are
  not silently attached anywhere — matching the umbrella's "geometry never
  guesses ownership").
- **Row identity** — wall/opening/anchor rows carry `roomId + segmentId`
  (+ `openingId`/`anchorId`), objects carry `objectId`, matching
  `LayoutSelection` exactly.
- **Selection matching, layout** — a room/wall/opening/anchor/object active
  selection highlights exactly its row; a demoted selection (e.g. active
  opening demoted to wall by the S3 reconcile) highlights the wall row.
- **Selection matching, scene** — placement ids highlight entity rows (all
  selected ids), cluster selection highlights the cluster row, room-only
  context highlights the room row but is `domain: 'none'`.
- **Selection matching, camera** — node / connection / direction / keyframe
  selections highlight the right rows; a connection-header selection covers
  anchor + view-keyframe children; direction rows highlight from the
  **discovery slots** even with no navigation selection (scrubbing), and on a
  real camera selection highlight exactly the selected direction.
- **Cross-domain** — with a layout selection active, a scene placement is
  *not* highlighted (and vice versa) — the tree reads only `active`.
- **View gating** — `isUnifiedTreeRowInteractive`: layout rows true in both
  views; scene/camera rows true in 3D only, false in Plan.
- **Contract-level** — the H1 shell source mounts `UnifiedProjectTree` (route
  source assertion on `/` and `/editor`, the S1 pattern). The relic assertion
  must **not** read the `museum/editor` route source (it imports only
  `virtual:museum-editor-entry`), and the entry plugin's `load()` output is
  just a re-export (`export { default } from '…MuseumEditorApp.svelte';`) — it
  will not contain `EditorLeftSidebar.svelte` either. Assert on the **resolved
  module's file source** instead: fs-read `MuseumEditorApp.svelte` (assert it
  imports `EditorLeftSidebar` and never `UnifiedProjectTree`/`H1Sidebar`) and
  fs-read the legacy components themselves — `EditorLeftSidebar.svelte` still
  imports `EditorSceneTree`/`EditorCameraTree`, and none of
  `EditorSceneTree.svelte` / `EditorCameraTree.svelte` /
  `EditorLeftSidebar.svelte` references `UnifiedProjectTree` / `H1Sidebar`.
- **Direction-row highlight needs discovery** — with discovery set but no
  navigation selection (scrubbing) and `active.domain` camera-or-none,
  `isUnifiedTreeRowSelected(active, discovery, row)` still highlights the
  direction row; with a real camera selection it highlights exactly the
  selected direction. Cross-domain: with a layout or scene selection active,
  scene/camera rows and discovery-driven direction rows are *not* highlighted
  (the tree's domain comes from `active` only).

### 1. Pure model + matchers

- Add `unified-project-tree-model.ts` with the row union,
  `buildUnifiedProjectTreeModel`, `isUnifiedTreeRowSelected`, and
  `isUnifiedTreeRowInteractive` (step 0's tests drive them). Camera
  connection/direction rows reuse `getNodeConnections`
  (`editor-camera-connections.ts`), the same helper `NodeConnectionsPanel`
  uses, so incoming/outgoing direction logic is not duplicated.

### 2. `UnifiedProjectTree.svelte` — Rooms branch

- Render `Rooms` root → layout room rows (chevron + `room.name` + id meta,
  count meta from the model) → `Architecture` group (Walls rows; **interior
  anchor rows nested under their wall** — an auto-bezier wall with
  `interiorAnchors` lists them, matching `LayoutSelection.interiorAnchor`;
  Openings rows; Layout objects rows with qualified labels: `Wall ·
  <segmentId>`, `Door`/`Window`, `<object kind> · <objectId>`) and `Scene`
  group (Clusters + Entities rows with today's labels/meta and the cluster
  add/remove mini-actions).
- Selection wiring per Locked decisions (source APIs only); expansion via the
  session slots; pick-expand; `aria-selected` from `isUnifiedTreeRowSelected`.
- **Expansion seeding.** `treeExpandedRoomIds` defaults to `['paris']`
  (session-state.svelte.ts) — a Chopin room that never exists in a boot-empty
  H1 project. The tree trims the slot to live layout room ids on model build
  (write only when it differs) so the first drafted room starts collapsed
  without stale ids accumulating, and toggle writes stay in sync with the
  registry.
- Empty boot: `Rooms` root shows a one-line empty state ("Draw a room in Plan
  to begin") instead of nothing.

### 3. `UnifiedProjectTree.svelte` — Camera Tour branch

- Render the `Camera Tour` root embedding the existing `GuidedTourPanel`
  (Guided Tour + Free Nodes) unchanged — drag-reorder, insert, remove,
  sequence, Start badge, local node expansion — plus `NodeConnectionsPanel`
  and `DirectionalKeyframeList` below each node exactly as today.
- Add an optional `interactive?: boolean` prop (default `true`) to
  `GuidedTourPanel.svelte`, `NodeConnectionsPanel.svelte`, and
  `DirectionalKeyframeList.svelte`: when false, **every mutation path is
  gated — not just clicks**. `GuidedTourPanel` mutates through native HTML5
  drag (`draggable`, `ondragstart`, the `ondrop` gap, "Drag to guided"), so
  `interactive={false}` must also disable `draggable` and no-op the
  dragstart/drop handlers, or the Plan gate leaks a camera mutation path
  (which the umbrella explicitly forbids). Rows render `aria-disabled`. The
  relic never passes the prop and is unchanged. `H1Sidebar` passes
  `interactive={viewMode === '3d'}`.

### 4. `H1Sidebar` shell + `H1EditorApp` swap + inspector prop

- New `h1/H1Sidebar.svelte`: `aside` with the header strip, the
  `Hierarchy | Assets` tabs in 3D (reusing `store.leftPanel` and the existing
  tab styling, first tab relabeled "Hierarchy"), the tree always, the Assets
  library only in 3D, the back link, `bind:outlinerElement`, `inert`, and the
  `onAssetSelection` / `onReset` props (identical shape to the current
  `EditorLeftSidebar` usage).
- `H1EditorApp` mounts `H1Sidebar` (with `store`, `layoutPreview`,
  `layoutInteraction`, `activeSelection`, `viewState`) instead of
  `EditorLeftSidebar`; the existing `outlinerElement` /
  `onAssetSelection` / `onReset` bindings move with it.
- `EditorInspector` gains the optional `activeSelection` prop and the
  domain-first panel switch (relic falls back to `currentWorkspace`).

### 5. View-aware gating + selection-sync polish

- Wire `isUnifiedTreeRowInteractive` through the component (layout rows always
  active; scene/camera rows read-only in Plan via the `interactive` prop).
- Verify pick-expand and highlight stay consistent across Plan ↔ 3D (the tree
  is always mounted, so no expansion state is lost).

### 6. Regression + manual QA

- Full suite + `svelte-check` + production build; every S3 test and the S1
  preservation/relic-smoke contracts must pass **unchanged** (S4 is additive).
- Manual: draft two rooms in Plan; confirm the tree shows them under Rooms with
  Architecture + Scene children and that Plan tree picks select/highlight
  rooms/walls/openings/objects while scene/camera rows stay read-only; switch
  to 3D and confirm the same tree now lets scene/camera rows pick, that a
  viewport entity pick highlights its tree row (and clears the layout
  selection), and that a camera-node pick highlights the node + expands it;
  reorder the guided tour with drag; expand connections → directions → keys;
  confirm expansion survives Plan ↔ 3D; confirm the inspector follows the
  active domain; confirm `/museum/editor` still shows the scene tree, camera
  tree, and layout summary exactly as before; confirm Reset from the Project
  menu still clears every selection (S3 `onReset`).

## Regression matrix

| Concern | Required assertion |
|---|---|
| One hierarchy | Plan and 3D mount one `UnifiedProjectTree`; no workspace-scoped tree/summary content in H1 |
| Layout identity | Room/wall/opening/anchor/object rows carry the exact `LayoutSelection` identity; a tree pick selects the same element the Plan viewport highlights |
| Scene sync | Entity/cluster/room rows reflect the workspace slot (Shift-additive preserved); cluster member mini-actions work |
| Camera sync | Guided order + drag/insert/remove preserved; connection/direction/keyframe selection + expansion preserved; direction-row highlight is discovery-driven but gated to camera-or-none domain (scrub highlight preserved; never co-highlights with layout/scene) |
| Plan gate | In Plan, layout rows interactive, scene/camera rows `aria-disabled` no-ops (S3 policy holds); in 3D all rows interactive |
| View switch | Expansion + the active selection survive Plan ↔ 3D (tree always mounted) |
| Inspector | Domain-driven when the wrapper is provided; workspace-driven otherwise (relic) |
| Relic isolation | `/museum/editor` keeps `EditorLeftSidebar`/`EditorSceneTree`/`EditorCameraTree`/layout summary byte-for-byte; `interactive`/`activeSelection` props default to legacy behavior |
| Ownership | Scene content nests only by explicit `roomId`; camera nodes stay under Camera Tour (deviation noted); nothing is coordinate-guessed |
| Accessibility | `role`/`aria-selected`/`aria-expanded`/labels/tab order preserved; `aria-disabled` on gated rows; `inert` on mutation block |
| Purity | `unified-project-tree-model.ts` has no Three/DOM/Svelte imports |

## Non-goals (deferred)

- 3D layout picking (S5/S6), the single TransformControls host (S7), layout
  candidate preview + atomic history (S8), project-local GLB import + package
  round-trip (S9/S11).
- Camera timeline/tools inside the tree; the 3D Scene\|Camera context tabs
  remain viewport/timeline-driven, not tree-driven.
- Per-room camera-node nesting (see deviation note).
- Plan staging mode (C1) — the tree's `isUnifiedTreeRowInteractive` is the
  seam C1 will flip for scene rows; nothing else changes now.
- Merged identity types, tree-driven mutations (rename/delete from the tree),
  roving-tabindex keyboard navigation (tabs stay as today).

## Expected files

Conceptually new:

```text
apps/museum/src/lib/editor/unified-project-tree-model.ts   (pure model + matchers)
apps/museum/src/lib/editor/UnifiedProjectTree.svelte        (one hierarchy)
apps/museum/src/lib/editor/h1/H1Sidebar.svelte              (replaces EditorLeftSidebar in H1)
tests/lib/editor/h1/unified-project-tree.test.ts            (pure model + matchers)
```

Primary edits:

```text
apps/museum/src/lib/editor/h1/H1EditorApp.svelte            (mount H1Sidebar)
apps/museum/src/lib/editor/EditorInspector.svelte           (optional activeSelection prop)
apps/museum/src/lib/editor/GuidedTourPanel.svelte           (optional interactive prop, default true)
apps/museum/src/lib/editor/NodeConnectionsPanel.svelte      (optional interactive prop, default true)
apps/museum/src/lib/editor/DirectionalKeyframeList.svelte   (optional interactive prop, default true)
tests/lib/editor/h1/contracts.test.ts                       (H1 S4 describe block)
docs/hand-off/CURRENT.md                                    (S4 planned → shipped on close)
```

Untouched: `EditorLeftSidebar.svelte`, `EditorSceneTree.svelte`,
`EditorCameraTree.svelte`, `EditorAssetLibrary.svelte`, the camera
tree internals' selection logic, and everything under `/museum/editor`.

## Implementation notes (as-built deviations)

- **The room-only latent highlight lives in the component, not the pure
  matcher.** Room-only placement derives to `active.domain === 'none'` (S3:
  context, never actionable), so `isUnifiedTreeRowSelected(active, discovery,
  row)` cannot see it with the plan's pinned signature. `UnifiedProjectTree`
  ORs `store.selectedRoomId === row.roomId` onto the room-row result (gated to
  `active.domain === 'none'` so a layout/scene active selection never
  co-highlights a second room) — the same read the relic scene tree uses. The
  model JSDoc documents the split and the unit test pins it (the pure matcher
  returns false for `domain: 'none'`).
- **Architecture and Scene are non-collapsible group headers** inside an open
  room (always visible), not separate collapsible branches — the plan did not
  require group-level collapse and the relic had none. Cluster/room expansion
  still uses the session slots.
- **The cluster add-member mini-action drops the relic's `room.id === 'paris'`
  gate.** Chopin's `paris` was the only editable room in the frozen tree; every
  H1 layout room is editable. Same-room parity is enforced by
  `addMemberToCluster` itself (returns false across rooms), so the UI also
  gates on `store.selectedCluster?.roomId === room.roomId` to avoid a dead
  button.
- **`Rooms` root is open by default** (local `$state(true)`), so the boot-empty
  "Draw a room in Plan to begin" state is immediately visible; `Camera Tour`
  starts collapsed and auto-expands one-shot on the transition into camera
  context/domain, per the locked decision.
- **The S4 contracts block also gates the new `interactive` props on the three
  camera components** (regex presence assertion), not just the shell/relic
  mount assertions.
- **S4 post-ship bugfix — the Plan gate leak on guided/free node rows.**
  `GuidedTourPanel`'s guided + free node-row buttons (and their connections
  chevrons) called `selectNode`/`toggleNodeConnections` unconditionally,
  unlike every other surface in the panel — so a Plan click on a camera node
  activated the camera domain (selection, branch auto-expand, domain-driven
  inspector), violating the locked "Plan selection always activates the layout
  domain". Both rows are now `aria-disabled` with `interactive`-gated onclick,
  matching `NodeConnectionsPanel`; the S4 contracts block now asserts the
  gated handler shapes (2 rows + 2 chevrons, 6 aria-disabled sites). Dead
  `roomIds` set in the pure model and the sidebar's unused `onReset`
  pass-through were also removed.
- **S4 post-ship bugfix — the S3 `onLayoutSelectionChanged` hook was made
  idempotent.** The shell effect calls it on every layout-selection change,
  and it read `selection.workspace` reactively (through `selectedRoomId` in
  `clearPlacementSelection`) while `setWorkspace` wrote a fresh object
  unconditionally — so the first room/wall/opening pick (tree row click,
  viewport click, or the door-commit auto-select) spun the effect into
  Svelte's `effect_update_depth_exceeded` freeze (the reported "can't click
  away" bug). It now writes each slot only when it actually differs from the
  detach target (room-only placement / none), preserving the S3 contract
  exactly; `active-editor-selection.test.ts` gained a no-rewrite regression
  test.

## Verification

```text
npm test -w @portfolio/museum
npm run check -w @portfolio/museum
npm run build -w @portfolio/museum
```

Plus the manual QA in step 6 and the unchanged S3 cross-domain contracts, the
S1 view-switch preservation contract, and the relic route-wiring contracts in
`tests/lib/editor/h1/contracts.test.ts`. As-built: full suite **1385 passed /
0 failed**, `svelte-check` **0 errors**, production build **clean**.
