# H1 S6 — Centralized 3D Layout Selection

**Date:** 2026-08-15
**Status:** Planned
**Parent:** [`2026-08-14-graphics-h1-unified-3d-editing.md`](./2026-08-14-graphics-h1-unified-3d-editing.md) (step 6, difficulty 8/10 — plan Frontier, implementation Frontier+)
**Prerequisite:** S5 · Complete Wall/Opening 3D Pick Metadata
**Handoff:** [`../hand-off/CURRENT.md`](../hand-off/CURRENT.md)

## Goal

Make 3D viewport clicks resolve to **real layout selections** through the S5 pick
metadata, through **one** raycast/selection coordinator — no second competing
Canvas listener. Today a 3D click on any layout surface (wall face, floor,
ceiling, layout object, anchor helper) falls through `resolveNormalSelection`
to a background `deselect` because nothing carries a `placementId`. S6 adds a
layout branch to the existing single listener (`EditorSelection`), converts the
same intersection list into `Layout3dHitCandidate`s, resolves them through the
cached `layout3dPickIndexByRoom` with **nearest-visible + same-depth semantic
arbitration**, and commits the result into `layoutInteraction.selection` — the
S3 `ActiveEditorSelection` machinery then activates the layout domain, detaches
scene/camera, and the S4 unified tree reveals/highlights the picked row for
free. The existing `LayoutPreviewScene` highlight overlay already consumes
`interaction.selection`, so wall/opening/object highlights appear with zero
new overlay code.

This slice is **picking + selection only**. It does not raycast a new
listener, build a gizmo host, or enable 3D layout editing — the layout gizmo
host (S7), candidate preview + atomic history (S8), project-local asset import
(S9), and post-H1 Plan staging (C1) remain out of scope. Hover-highlight from
pick identity and selection cycling through coincident content stay deferred
(umbrella: "later enhancement").

## Current state

| Concern | Today | S6 outcome |
|---|---|---|
| 3D click listener | One Canvas listener: `EditorSelection.svelte` (shared with the relic `EditorViewport`), raycasts `scene.children` recursively (`raycaster.intersectObjects(scene.children, true)`), classifies scene/camera via `resolveNormalSelection` (`editor-selection.ts`) | Same single listener gains a layout branch — zero new raycast listeners |
| Layout surfaces in 3D | Clicking a wall/floor/ceiling/object/anchor produces `SelectionHitInfo` with no `placementId` → `resolveNormalSelection` returns `deselect` | Sorted into `Layout3dHitCandidate`s; a layout pick commits `layoutInteraction.selection` |
| Pick identity | `IndexedWallMesh.pickRanges` + `buildLayout3dTriangleIndex` cached as `layoutPreview.layout3dPickIndexByRoom` (S5); floor/ceiling `surfaceType`, objects `editorEntity: 'layout-object'`, anchors `editorEntity: 'layout-anchor'` (S5); **wall mesh object itself has no `userData`** (only `geometry.userData.pickRanges` + `name` `LayoutWall:${roomId}`) | Wall meshes gain `userData={{ surfaceType: 'wall', roomId }}`; candidates resolve triangle → `Layout3dTriangleRef` through the S5 index |
| Resolution | No layout resolution exists; `Layout3dHitCandidate` / `resolveLayout3dHits` are umbrella contracts only | Pure `resolveLayout3dHits` in `layout-3d-picking.ts` consuming the pick index |
| Domain activation | S3 `EditorActiveSelectionStore` + shell effect (`onLayoutSelectionChanged`) activate layout and detach scene/camera on any `layoutInteraction.selection` change; `onSelectionActivate` clears layout on scene/camera picks | Unchanged — S6 merely writes the layout selection; activation is free |
| Tree + inspector sync | S4 pick-expand effect reveals any active layout selection; `EditorInspector` renders layout selections via `layoutInteraction` | Unchanged — free |
| 3D highlight | `LayoutPreviewScene` already builds wall/opening highlight shells + object tint from `interaction.selection` | Unchanged — free |
| Visitor preview | Anchors hidden via `showAnchors={!store.isVisitorCameraPreview}` (S5 review fix); grid/selection/ghost hidden; layout picks do not exist | Layout picks additionally gated off during preview |
| Relic | `EditorViewport` mounts `EditorSelection` with no extra props; layout workspace unreachable | Optional prop keeps relic behavior unchanged; shared component bytes may change |

## Target

```text
layout-3d-picking.ts (pure, $lib/editor/layout — plan-hit.ts precedent)
  Layout3dHitCandidate                          (umbrella shape, exact)
  Layout3dResolvedHit = { selection, distance }
  layoutCandidatesFromIntersections(intersections)  → Layout3dHitCandidate[]
       structural RaycastHitLike type — no 'three' import (purity boundary)
       floor/ceiling/wall surfaceType + editorEntity walk-up → candidates
  resolveLayout3dHits(pickIndices, hits) → Layout3dResolvedHit | null
       nearest-visible wins; same-depth (|Δd| ≤ eps) semantic priority:
       anchor → opening → object → wall → room; wall-triangle resolved
       through Layout3dPickIndex; unresolvable refs dropped

editor-selection.ts (existing scene/camera resolver, behavior preserved)
  SelectionHitInfo gains optional distance; runtime intersections always set it
  resolveNormalSelectionWithHit(hits) → { result, sourceHit }
       same opacity filtering + camera/navigation/placement priority as today
  resolveNormalSelection(hits) delegates and keeps its existing result contract

EditorSelection.svelte (the one coordinator — H1 + relic shared)
  + onLayoutPick?: (candidates, competingSceneDistance) => boolean
       (default undefined)
  click flow: compute intersections ONCE → after the placement + Alt-cycle
       branches, if onLayoutPick and existing mutation guard passed:
       candidates = layoutCandidatesFromIntersections(intersections)
       normal = resolveNormalSelectionWithHit(hits)
       sceneDist = normal.result is actionable ? normal.sourceHit.distance : null
       if onLayoutPick(candidates, sceneDist) → commit + return
       else apply normal.result unchanged

H13DView.svelte
  <EditorSelection onLayoutPick={handleLayoutPick} .../>
  handleLayoutPick: resolveLayout3dHits(layoutPreview.layout3dPickIndexByRoom, c)
       → compare resolved.distance with competingSceneDistance
       → selectLayout* on layoutInteraction only when layout wins; returns handled

LayoutPreviewScene.svelte
  wall T.Mesh gains userData={{ surfaceType: 'wall', roomId }}  (new identity)
```

## Locked decisions

### One coordinator: extend the existing single listener, do not add a second

`EditorSelection.svelte` is already the **only** Canvas pointer listener for
scene/camera selection (shared by H1 `H13DView` and relic `EditorViewport`).
The umbrella's "replace independent competing Canvas raycast listeners with one
editor 3D selection coordinator" is satisfied by giving that single listener a
layout branch — there are no competing listeners to merge, and inventing a new
`Editor3DSelection` component that duplicates the 1,100-line pointer flow would
create exactly the risk the umbrella warns about. The coordinator contract is:

- `EditorSelection` gains one optional prop `onLayoutPick?: (candidates:
  readonly Layout3dHitCandidate[], competingSceneDistance: number | null) =>
  boolean`. `undefined` (relic mount) keeps today's exact behavior. The shared
  component necessarily gains an editor-layout import, so relic behavior — not
  emitted bytes — is the frozen contract.
- In the click flow, after `intersections` are computed **once**, the layout
  branch slots **after the placement branches** (`place-camera`, primitive/
  light/asset placement all `return` before it) **and after the Alt-cycle
  branch** — Alt-click keeps cycling scene placements and never selects
  layout. When the prop is present: build candidates from the same list and
  resolve the existing normal path once with `resolveNormalSelectionWithHit`,
  then call the callback with the candidates and the resolved actionable
  scene/camera source distance (or `null`). If it returns `true` (a layout
  selection was committed), return without applying the normal result. If it
  returns `false` (no layout candidate resolved, or a nearer scene/camera hit
  won), apply the already-resolved normal result unchanged — including the
  background-deselect behavior for a click that hits neither layout nor scene
  content. Never run either resolver twice.
- **Layout picks ignore Shift/Meta/Ctrl**: they always produce a plain single
  selection via `selectLayout*` — the layout domain has no additive/toggle
  multi-select today (Plan behaves the same).
- TransformControls precedence and the `pointerSession` guards already sit
  ahead of the click flow; they are untouched.
- Alt-cycle, shift/meta placement selection, placement-mode floor clicks,
  path/framing drags: all keep their existing branches; the layout branch sits
  after the placement branches and the Alt-cycle branch, before
  `resolveNormalSelection` (order pinned in step 0).

### `Layout3dHitCandidate` + amended `resolveLayout3dHits` signature

```ts
export type Layout3dHitCandidate =
  | { kind: 'object'; objectId: string; distance: number }
  | { kind: 'anchor'; roomId: string; segmentId: string; anchorId: string; distance: number }
  | { kind: 'wall-triangle'; roomId: string; triangleIndex: number; distance: number }
  | { kind: 'room-surface'; roomId: string; surface: 'floor' | 'ceiling'; distance: number };

export type Layout3dResolvedHit = {
  selection: LayoutSelection;
  distance: number;
};

export function resolveLayout3dHits(
  pickIndices: ReadonlyMap<string, Layout3dPickIndex>,
  hits: readonly Layout3dHitCandidate[]
): Layout3dResolvedHit | null;
```

- **Umbrella-signature amendment (documented):** the umbrella sketches
  `resolveLayout3dHits(meshes, hits)`; we lock `pickIndices` instead. S5
  already builds `layout3dPickIndexByRoom` once per mesh generation — passing
  meshes would rebuild the O(triangles) index on every click, defeating the
  S5 cache. `wall-triangle` candidates carry `roomId` + `triangleIndex`
  (the triangle number of the indexed buffer — Three's `faceIndex` as-is,
  never divided) and resolve through `pickIndices.get(roomId)(triangleIndex)`
  → `Layout3dTriangleRef`.
- **Umbrella-return amendment (documented):** return the existing
  `LayoutSelection` union together with its winning ray distance. Cross-domain
  arbitration cannot be correct if the layout resolver discards that distance.
  The commit path remains
  `selectLayoutRoom/Wall/Opening/InteriorAnchor/Object` — the same helpers Plan
  uses. `null` = no layout selection (background or scene/camera).
- Ref → selection mapping is deterministic:
  - `{ kind: 'wall', segmentId, surface }` (side/lintel/bridge) →
    `{ kind: 'wall', roomId, segmentId }` — bridge triangles keep their
    exclusive current-wall owner (S5).
  - `{ kind: 'opening', segmentId, openingId, surface }`
    (jamb/sill/lintel/arch-reveal) → `{ kind: 'opening', roomId, segmentId, openingId }`.
  - `anchor` → `{ kind: 'interiorAnchor', roomId, segmentId, anchorId }`;
    `object` → `{ kind: 'object', objectId }`;
    `room-surface` → `{ kind: 'room', roomId }`.
  - An out-of-range/unresolvable `wall-triangle` (index returns `null`,
    defensive — the S5 partition guarantees it cannot happen) is **dropped**,
    never promoted.

### Nearest-visible wins; same-depth ties break by semantic priority

- Sort all eligible candidates by `distance` ascending. The **nearest group**
  wins: an object behind a wall is not selected merely because object ranks
  higher (umbrella rule).
- **Cross-domain nearest-visible — the layout branch is not a preemptor.** A
  scene entity or camera helper standing in front of a wall/floor must stay
  clickable. `d_scene` is **not** the nearest tagged raw intersection. It is
  the source-hit distance of the actionable result produced by today's exact
  normal resolver: first apply `NEAR_INVISIBLE_OPACITY`, then preserve its
  camera-node → view-keyframe → path-anchor → connection → first-effective
  placement ordering. A low-opacity tagged hit, or a tagged placement behind
  an unowned first-effective surface that makes the normal resolver return
  `deselect`, supplies no competing distance. This prevents the comparator
  from yielding to content the normal path would not actually select.
- Yield rule: the layout selection commits only if `d_scene === null` or
  `layoutDist ≤ d_scene + LAYOUT_3D_SAME_DEPTH_EPSILON`; otherwise the click
  applies the already-resolved scene/camera result unchanged. This is
  deliberately **not** "nearest overall intersection": editor chrome (grid,
  the `LayoutWallHighlight` shell at +0.02, placement ghost) is nearer than
  the surface it decorates and must never shadow the real pick — clicking an
  already-selected wall must re-select it, not deselect.
- Extend `SelectionHitInfo` with optional `distance` and add
  `resolveNormalSelectionWithHit(hits) → { result, sourceHit }` in
  `editor-selection.ts`. `selectionHitFromIntersection` always copies
  `Intersection.distance`; optionality preserves legacy/manual hit fixtures.
  Existing `resolveNormalSelection` delegates to the new helper and returns
  only `.result`, preserving every current caller and result shape. For a
  `deselect` result, `sourceHit` is `null` even when the first effective hit is
  non-interactive editor chrome.
- Candidates whose distances differ by `≤ LAYOUT_3D_SAME_DEPTH_EPSILON`
  (`1e-4` m) form a tie group. Within a tie group the priority is
  **anchor → opening → object → wall → room**, then stable input order
  (deterministic — never `undefined`/iteration-order dependence).
- The tie rule is a safety net for coincident-but-distinct geometry (e.g. an
  object face coplanar with a floor, a helper floating on a surface); the
  common cases resolve to exactly one triangle and never reach it.
- Selection cycling through coincident/overlapping content is a later
  enhancement (non-goal).

### Candidate extraction stays pure and structural

- `layoutCandidatesFromIntersections(intersections)` reads only
  `object.userData`, `object.parent` (walk-up), `distance`, and `faceIndex`
  via a locally declared structural `RaycastHitLike` type — **no `'three'`
  import**, so `layout-3d-picking.ts` keeps its purity boundary test green.
- Identification, all via authored `userData` (never name/coordinate guessing):
  - wall mesh: `userData.surfaceType === 'wall'` + `roomId` (new tag below);
    `faceIndex` → `triangleIndex = faceIndex` →
    `{ kind: 'wall-triangle', roomId, triangleIndex, distance }`.
    Three's `Mesh.raycast` already reports `faceIndex` as the triangle number
    in indexed-buffer semantics (`faceIndex = Math.floor(j / 3)` in `Mesh.js`),
    and the S5 index is keyed by exactly that triangle number — dividing again
    would silently mis-own most wall clicks.
  - floor/ceiling: `userData.surfaceType === 'floor' | 'ceiling'` + `roomId` →
    `{ kind: 'room-surface', roomId, surface, distance }`.
  - object: walk up parents to `editorEntity === 'layout-object'` →
    `{ kind: 'object', objectId: userData.layoutObjectId, distance }`.
  - anchor: walk up parents to `editorEntity === 'layout-anchor'` →
    `{ kind: 'anchor', roomId, segmentId, anchorId, distance }` (each parent
    hop adds no distance correction — helpers are small and the tie epsilon
    covers the offset).
- Everything else in the scene (scene entities, camera helpers, grid, lights,
  highlight overlay, placement ghost, `LayoutWallHighlight` shell) yields no
  layout candidate → the scene/camera flow handles it exactly as today.
- **Helper filtering is free:** the anchor helpers are not rendered when
  `showAnchors` is false (visitor preview, S5 review fix), so no anchor
  candidate can appear; the `LayoutWallHighlight` shell has no layout userData.

### Wall meshes gain an authored object-level identity

`LayoutPreviewScene.svelte` tags the wall mesh object
`userData={{ surfaceType: 'wall', roomId }}` — the S5 scene tagged
floor/ceiling/objects/anchors; walls were the only layout surface left
identity-less at the object level (identity lived in
`geometry.userData.pickRanges` + the mesh `name`). Explicit authored identity,
consistent with the S5 mesh-tagging contract; zero draw-call or geometry
change. The pick ranges/index stay the authority for triangle → wall/opening
resolution.

### Commit path is the existing S3/S4 machinery

- The H1 handler resolves candidates with
  `layoutPreview.layout3dPickIndexByRoom` and commits via the existing
  `selectLayoutRoom/Wall/Opening/InteriorAnchor/Object` on
  `layoutInteraction` — never by writing the store's scene slots.
- Domain activation, scene/camera detach, tree expand/highlight, inspector
  rendering, and the 3D highlight overlay all fire from that one write
  (S3 effect + S4 tree effect + S5 highlight — no new plumbing).
- A scene/camera pick still clears the layout selection via the store's
  `onSelectionActivate` hook (S3), so a layout pick then a scene pick swaps
  domains exactly as Plan does today.
- **Background clear:** a click with no layout candidate and no scene/camera
  hit falls through to the existing `deselect` path (`onDeselect` →
  `deselectActive`, S3), which clears whichever domain is active — the
  "stray click on a wall mesh = deselect" behavior of S5 is replaced by real
  picks, but empty-sky clicks still clear.
- **Visitor preview gate:** `H13DView` passes
  `onLayoutPick={store.isVisitorCameraPreview ? undefined : handleLayoutPick}`
  — during visitor camera playback no layout pick can commit (anchors are
  already hidden). The existing `isDocumentMutationBlocked` guard also blocks
  selection while Director transport is playing. Paused Director and normal
  editing select normally; S6 does not change that lock.

### Purity, bench, and relic isolation

- `layout-3d-picking.ts` keeps zero Three/DOM/Svelte/`$app`/`$lib/museum`
  imports (structural `RaycastHitLike`, no `Intersection` type import) —
  boundary test extended, not weakened.
- **No bench re-baseline:** geometry, draw calls, and mesh topology are
  untouched (one `userData` object on the wall mesh; a click-time O(hits)
  pure resolution). `three-*-estimate` budgets hold exactly.
- Relic `/museum/editor` is behavior-identical: `EditorViewport` does not pass
  `onLayoutPick`, and `LayoutPreviewScene` is only mounted in the
  (unreachable) layout workspace branch anyway. Shared component bytes may
  change because `EditorSelection` gains the optional branch.

## Implementation steps

### 0. Pin the contracts with tests first

Add an `H1 S6 — centralized 3D layout selection` describe block to
`tests/lib/editor/h1/contracts.test.ts`, extend
`tests/lib/editor/layout/layout-3d-picking.test.ts` (pure resolution), and
add a focused `tests/lib/editor/layout/layout-3d-selection.test.ts` for the
candidate extraction + commit route:

- **Nearest-visible** — a near wall beats a far object; a near object beats a
  far wall. **Cross-domain** — a scene entity (placementId) in front of a
  wall or floor selects the entity, not the wall/room behind; the yield rule
  holds at the boundary (`layoutDist > d_scene + eps` → scene wins,
  `≤ eps` → layout wins); the `LayoutWallHighlight` shell never shadows the
  wall it decorates. Pin that `d_scene` belongs to the exact actionable normal
  result: near-invisible tagged hits are filtered; camera/navigation priority
  keeps its current source hit; a normal `deselect` contributes `null`, not the
  distance of a merely tagged raw intersection.
- **Same-depth priority** — every pairwise rule at `Δd ≤ eps`:
  anchor > opening > object > wall > room; the reversed order loses; a
  `Δd > eps` pair is decided by distance, not priority.
- **Ref mapping** — through a real builder mesh index: `side`/`lintel`/
  `bridge` refs → wall selection; `jamb`/`sill`/`lintel`/`arch-reveal` refs →
  opening selection (openings fixture + profile matrix); bridge triangles
  keep the current-wall owner; out-of-range `triangleIndex` → candidate
  dropped, `null` when nothing else. Extraction fixtures use real three.js
  `faceIndex` semantics (triangle number in the indexed buffer — small
  integers), pinning `triangleIndex = faceIndex` and never an index-buffer
  offset.
- **Room surfaces** — floor and ceiling candidates → room selection.
- **Determinism** — tie group with two equal candidates resolves by priority
  then input order; repeated `resolveLayout3dHits` calls agree.
- **Candidate extraction** — synthetic `RaycastHitLike` objects (structural:
  `{ userData, parent }` chains + `{ object, distance, faceIndex }`):
  wall/floor/ceiling/object/anchor identified; scene entity, highlight shell,
  and camera helper objects produce no candidate; walk-up finds
  `layout-object`/`layout-anchor` on parent groups.
- **Commit route** — pure-ish shell test (no Svelte mount): candidates →
  `resolveLayout3dHits` → compare its winning distance with the resolved
  normal source distance → `selectLayout*` → `deriveActiveSelection` reports
  the layout domain; a nearer normal winner causes no layout write; a follow-up
  scene pick (store hook) clears layout; a no-hit click leaves
  `interaction.selection` untouched and the normal flow owns deselect.
- **Normal resolver preservation** — extend `editor-selection.test.ts`: every
  existing camera/navigation/placement/deselect fixture agrees between
  `resolveNormalSelection(hits)` and
  `resolveNormalSelectionWithHit(hits).result`; source-hit identity/distance
  matches the winning effective hit; `deselect` returns `sourceHit: null`.
- **Boundary** — `layout-3d-picking.ts` still imports no
  Three/DOM/Svelte/`$app`/`$lib/museum` (the existing purity test covers the
  new code automatically once it imports the module).
- **Contracts (source assertions)** — `EditorSelection` declares optional
  `onLayoutPick` with the candidates + competing-distance signature and a `?:`
  default-undefined shape; `H13DView` passes `onLayoutPick` gated on
  `!store.isVisitorCameraPreview`; `EditorViewport` (relic) does not;
  `LayoutPreviewScene` wall mesh carries `surfaceType: 'wall'` + `roomId`;
  `layout-3d-picking.ts` exports `Layout3dHitCandidate` +
  `Layout3dResolvedHit` + `resolveLayout3dHits`.

### 1. Pure resolution + extraction in layout-3d-picking.ts

- Add the `Layout3dHitCandidate` union (umbrella shape, exact) and
  `LAYOUT_3D_SAME_DEPTH_EPSILON = 1e-4`.
- Add `layoutCandidatesFromIntersections(intersections: readonly RaycastHitLike[])`
  with the structural `RaycastHitLike` type and the walk-up identification
  rules above.
- Add `resolveLayout3dHits(pickIndices, hits)`: drop unresolvable
  wall-triangles, sort by distance, group ties within the epsilon, apply
  anchor → opening → object → wall → room, return the winning
  `{ selection, distance }` or `null`.

### 2. Wall mesh identity tag

- `LayoutPreviewScene.svelte`: the wall `T.Mesh` gains
  `userData={{ surfaceType: 'wall', roomId }}`. No other change.

### 3. Coordinator branch in EditorSelection.svelte

- `editor-selection.ts`: add optional `SelectionHitInfo.distance`, copy runtime
  `Intersection.distance`, and extract `resolveNormalSelectionWithHit` without
  changing `resolveNormalSelection` behavior or return shape.
- Add the optional `onLayoutPick` prop (typed, default `undefined`) with
  `(candidates, competingSceneDistance) => boolean`.
- In the click flow, after `intersections` is computed: build `hits` once and
  resolve the normal result/source hit once. After placement and Alt branches,
  when `onLayoutPick` is present, build candidates via
  `layoutCandidatesFromIntersections`; pass candidates plus the actionable
  normal source distance (otherwise `null`). If the callback returns `true`,
  return; otherwise apply the already-resolved normal result through today's
  exact dispatch. Do not call `resolveNormalSelection` again.
- No changes to pointer-down/pointer-session/alt-cycle/placement branches;
  TransformControls precedence untouched.

### 4. H13DView wiring

- `H13DView.svelte` passes
  `onLayoutPick={store.isVisitorCameraPreview ? undefined : handleLayoutPick}`,
  where `handleLayoutPick` resolves via
  `layoutPreview.layout3dPickIndexByRoom`, returns `false` when no layout hit or
  when `competingSceneDistance !== null && resolved.distance >
  competingSceneDistance + epsilon`, otherwise commits
  `resolved.selection` through `selectLayoutRoom/Wall/Opening/InteriorAnchor/Object`
  on `layoutInteraction` and returns `true`.
- Relic `EditorViewport.svelte`: no change (prop absent).

### 5. Regression + manual QA

- Full suite + `svelte-check` + production build; all S0–S5 contracts, the
  G4 builder/adapter suites, and the G3 bench budgets pass **unchanged**.
- Manual: draft a room in Plan with a door + window (rounded) + an auto-bezier
  wall with interior anchors + a box object; switch to 3D and verify:
  click a wall face → wall selection + 3D highlight shell + tree row
  highlight + inspector; click the opening sill/jamb → opening selection;
  click the anchor octahedron → interiorAnchor selection; click floor →
  room selection; click the box → object selection; click empty sky →
  deselect; click a scene entity → scene domain (layout cleared) — including
  an entity standing on a floor or in front of a wall (never the room/wall
  behind); Alt-click on a wall still cycles scene placements; clicking an
  already-selected wall re-selects it (the highlight shell does not deselect);
  a layout pick after a scene pick re-activates layout. Plan ↔ 3D switch
  preserves the selection and highlight. Visitor camera preview: no anchor
  helpers, no layout pick on click. Playing Director: existing mutation guard
  blocks all selection; pause Director and selection resumes. Relic
  `/museum/editor` behavior unchanged.
- Confirm the click path never fires a second raycast (one `intersections`
  computation per click) and that highlights rebuild/dispose as before.

### 6. Close the slice

- Update `docs/hand-off/CURRENT.md` (S6 planned → shipped on close: one
  coordinator, pure arbitration, wall tag, gating, verification) and fill the
  as-built notes below.
- No commits unless requested.

## Regression matrix

| Concern | Required assertion |
|---|---|
| One coordinator | `EditorSelection` remains the single Canvas selection listener; layout branch reuses the same `intersections` (no second raycast) |
| Nearest-visible | Front wall blocks an object behind it; nearer object beats farther wall |
| Same-depth ties | Within `LAYOUT_3D_SAME_DEPTH_EPSILON`: anchor → opening → object → wall → room; beyond it, distance decides |
| Cross-domain | The exact actionable `resolveNormalSelectionWithHit` source supplies `d_scene` after opacity filtering and current camera/navigation/placement priority; a nearer winner beyond `eps` wins, layout wins within `eps` or when the normal result is `deselect`; highlight/grid never shadow a real layout pick |
| Wall resolution | Wall `side`/`lintel`/`bridge` triangles → wall selection (bridge keeps current-wall owner; `triangleIndex = faceIndex`, never `faceIndex / 3`); opening `jamb`/`sill`/`lintel`/`arch-reveal` → opening selection |
| Room surfaces | Floor/ceiling candidates → `{ kind: 'room' }` |
| Helper filtering | Anchor candidates only when helpers render (`showAnchors`); highlight/ghost/grid/lights/camera helpers yield no layout candidates |
| Background clear | No layout + no scene hit → existing deselect path (`onDeselect`/`deselectActive`); no candidate ever forces a layout write |
| Domain activation | Layout pick activates layout and detaches scene/camera (S3); scene pick clears layout (`onSelectionActivate`); visitor and playing Director previews commit no layout picks; paused Director resumes selection |
| Tree/inspector/highlight | S4 tree expand + highlight and S5 3D highlight overlay fire from `interaction.selection` with zero new code |
| Plan parity | Plan's 2D priority unchanged; identity parity asserted, ordering not |
| Relic isolation | `/museum/editor` mounts `EditorSelection` without `onLayoutPick`; behavior stays frozen although shared component bytes change; wall tag/anchors only in the shared layout scene |
| Purity | `layout-3d-picking.ts` imports no Three/DOM/Svelte/`$app`/`$lib/museum` (structural `RaycastHitLike`, no `Intersection` import) |
| Bench | `three-*-estimate` budgets hold exactly (no geometry/draw change) |
| Precedence | TransformControls axis/drag + pointerSession guards still short-circuit clicks before any branch |

## Non-goals (deferred)

- Single TransformControls host with layout adapter (S7), layout candidate
  preview + atomic history (S8), project-local asset import (S9).
- Hover-highlight from pick identity, layout delete in 3D, and selection
  cycling through coincident content (umbrella: explicitly later).
- 2D/3D hit-order parity (Plan's vertex → anchor → opening → object → wall →
  room stays; H1 asserts identity parity only).
- Any change to `sectionToRange`/`wallRanges`/`pickRanges` semantics or the
  G3 bench; any new Canvas listener or raycast source.

## Expected files

Conceptually new:

```text
tests/lib/editor/layout/layout-3d-selection.test.ts    (extraction + commit route)
```

Primary edits:

```text
apps/museum/src/lib/editor/layout/layout-3d-picking.ts    (Layout3dHitCandidate,
                                                            Layout3dResolvedHit,
                                                            layoutCandidatesFromIntersections,
                                                            resolveLayout3dHits)
apps/museum/src/lib/editor/editor-selection.ts                 (hit distance +
                                                                resolver-with-source seam)
apps/museum/src/lib/editor/EditorSelection.svelte          (optional onLayoutPick branch)
apps/museum/src/lib/editor/h1/H13DView.svelte              (onLayoutPick wiring, preview gate)
apps/museum/src/lib/editor/layout/LayoutPreviewScene.svelte (wall userData surfaceType 'wall')
tests/lib/editor/layout/layout-3d-picking.test.ts          (resolution + tie + ref mapping)
tests/lib/editor/editor-selection.test.ts                  (resolver/source preservation)
tests/lib/editor/h1/contracts.test.ts                      (H1 S6 describe block)
docs/hand-off/CURRENT.md                                   (S6 planned → shipped on close)
```

Behavior-preserved but edited: `resolveNormalSelection` delegates to
`resolveNormalSelectionWithHit`; `selectionHitFromIntersection` copies
`Intersection.distance`. Untouched: all placement/pointer-session branches,
`layout-preview-state`, the visitor shell, and everything under
`/museum/editor`.

## Implementation notes (as-built deviations)

Filled at close — expected hot spots: whether the `onLayoutPick` callback
returns `boolean` vs the resolved result after real wiring, the exact
structural `RaycastHitLike` shape, and tie-epsilon tuning after manual QA.
Cross-domain dataflow is locked: resolved layout `{ selection, distance }`
versus the existing normal resolver's actionable source-hit distance — never
nearest-tag guessing. Placement clicks are handled earlier in the flow, so the
layout branch is unreachable there by construction (branch order pinned in
step 0).

## Verification

```text
npm test -w @portfolio/museum
npm run check -w @portfolio/museum
npm run build -w @portfolio/museum
```

Plus the manual QA in step 5, the unchanged S0–S5 contracts, and the
unchanged G3 bench budgets (no re-baseline).
