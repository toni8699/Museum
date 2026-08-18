# H1 S5 — Complete Wall/Opening 3D Pick Metadata

**Date:** 2026-08-15
**Status:** Shipped
**Parent:** [`2026-08-14-graphics-h1-unified-3d-editing.md`](./2026-08-14-graphics-h1-unified-3d-editing.md)
**Prerequisite:** S4 · Unified Project Hierarchy
**Handoff:** [`../../hand-off/CURRENT.md`](../../hand-off/CURRENT.md)

## Goal

Make every triangle of the G4 wall mesh resolve to **exactly one deterministic,
authored pick owner** and ship the renderer-neutral machinery S6's 3D selection
coordinator consumes:

- Add complete **additive pick ranges** to `IndexedWallMesh` — wall sections,
  opening sill/lintel sections, jamb reveals, arch undersides, and corner
  bridges — as pure metadata, never geometry groups;
- Build the **triangle reverse index once per mesh generation**;
- Pass the new metadata through the Three adapter on `userData` (no groups);
- Tag floor/ceiling/object meshes with explicit pick identity and render
  **qualified interior-anchor helper meshes** in the editor 3D scene;
- Pin the contract: **every emitted wall triangle has exactly one pick owner**,
  including jamb/reveal/bridge faces that today fall between the cracks of
  `sectionToRange` (sections only) and `wallRanges` (per-segment range sets
  with no owner identity).

This slice is **metadata + identity only**. It does not raycast, arbitrate
depth, or change selection behavior — the visible-depth arbitration
(`Layout3dHitCandidate` → `resolveLayout3dHits`), the one editor 3D selection
coordinator, and the layout selection domain activation are S6, which consumes
what S5 produces. The gizmo host (S7), candidate preview + atomic history (S8),
and project-local asset import (S9) remain out of scope.

## Current state

| Concern | Today | S5 outcome |
|---|---|---|
| Section metadata | `sectionToRange`: one range per compiled section (`WallMeshSectionRef`: `roomId`/`segmentId`/`sectionIndex`/`openingId?`/`kind: 'side' \| 'lintel'`). Opening **lintel** sections carry `openingId`; opening **sill** sections carry `openingId` too (`kind: 'side'`, `topY = sillHeight`) | Same semantics, plus a parallel additive `pickRanges` field that also covers reveals and bridges |
| Reveal (jamb) faces | Emitted by `buildRevealFaces` into the wall's `wallRanges` entry — index ranges exist but **no owner identity** (no `openingId`, no `surface`) | Pick range `{ kind: 'opening', …, surface: 'jamb' }` |
| Lintel underside (arch reveal) | Mixed into the lintel section's index range (band + top + underside faces emitted together) — one section, one range, three surface kinds | Band/top faces → `surface: 'lintel'`; underside faces → `surface: 'arch-reveal'` (sub-ranges) |
| Corner bridges | Beveled-corner bridge faces emitted into `wallRanges` for **both** adjacent walls (metadata-only shared entry) | Pick owner is **only the current/start wall**, `surface: 'bridge'` — never both walls (locked umbrella rule) |
| Reverse index | None — every raycast would re-walk ranges | `buildLayout3dTriangleIndex(mesh)` built once per mesh generation, cached beside `wallMeshesByRoom` |
| Adapter | `geometry.userData.sectionToRange` + `wallRanges` | + `geometry.userData.pickRanges` (same no-groups rule) |
| Floor/ceiling meshes | Floor carries `userData.surfaceType: 'floor'` + `roomId` + `editorSurface` (placement); **ceiling has no userData** | Ceiling gains `surfaceType: 'ceiling'` + `roomId`; floor identity pinned |
| Object meshes | Root group carries `userData.editorEntity: 'layout-object'` + `layoutObjectId` | Pinned by contract test; unchanged shape |
| Interior anchors | Authored on auto-bezier boundary segments; compiled into `queries.points` (`kind: 'interior-anchor'`); Plan renders/hits them; **no 3D representation** | Editor-only helper meshes with full qualified identity, pickable |
| Purity | `wall-mesh-builder.ts` pure (boundary-tested); `plan-hit.ts` is the pure 2D resolver precedent under `$lib/editor/layout` | New `layout-3d-picking.ts` pure, same rule |

Key fact: the geometry already exists and is correct (G4). The gap is **identity
metadata**: `wallRanges` lumps reveals + bridges into per-segment sets with no
owner, and the lintel section mixes wall surfaces with the arch reveal. S5 is
additive — it extends `IndexedWallMesh` with one new field, tags faces at build
time, and adds a cached reverse index. No mesh topology, draw-call count, or
highlight behavior changes, so the G3 bench budgets do **not** re-baseline.

## Target

```text
wall-mesh-builder.ts (pure, $lib/layout)
  buildRoomWallMesh(room)  →  IndexedWallMesh
       + pickRanges: Layout3dPickRange[]        ← one range per contiguous
                                                   (ref, surface) run, sorted,
                                                   partition of the index buffer
       faces tagged at build time:
         side section (no opening)   → wall 'side'
         sill section (openingId)    → opening 'sill'
         lintel band/top faces       → opening 'lintel'
         lintel underside faces      → opening 'arch-reveal'
         reveal (jamb) faces         → opening 'jamb'
         corner bridge faces         → wall 'bridge' (owner = current wall)

layout-3d-picking.ts (pure, $lib/editor/layout — plan-hit.ts precedent)
  Layout3dTriangleRef · Layout3dPickRange
  buildLayout3dTriangleIndex(mesh)   → (triangleIndex) => Layout3dTriangleRef | null
                                       dense Uint32Array over the ref table;
                                       validates full partition (dev guard)

layout-preview-state.svelte.ts
  wallMeshesByRoom          (unchanged)
  + layout3dPickIndexByRoom  ← built once per mesh generation, same lifecycle

wall-geometry-adapter.ts
  geometry.userData.pickRanges = mesh.pickRanges      (no addGroup)

LayoutPreviewScene.svelte
  floor   userData surfaceType 'floor'  (pinned, unchanged)
  ceiling userData surfaceType 'ceiling' + roomId     (new)
  objects editorEntity 'layout-object' + layoutObjectId (pinned)
  + LayoutAnchorHelper meshes (editor-only, pickable, qualified identity)
```

## Locked decisions

### The pick identity contract (additive, renderer-neutral)

```ts
export type Layout3dWallSurface = 'side' | 'lintel' | 'bridge';
export type Layout3dOpeningSurface = 'jamb' | 'sill' | 'lintel' | 'arch-reveal';

export type Layout3dTriangleRef =
  | { kind: 'wall'; roomId: string; segmentId: string; surface: Layout3dWallSurface }
  | {
      kind: 'opening';
      roomId: string;
      segmentId: string;
      openingId: string;
      surface: Layout3dOpeningSurface;
    };

export type Layout3dPickRange = Layout3dTriangleRef & { start: number; count: number };
```

- Defined in `wall-mesh-builder.ts` (the single owner of the `IndexedWallMesh`
  shape, already pure) and re-exported by `layout-3d-picking.ts`. No Three,
  DOM, or Svelte types anywhere.
- `IndexedWallMesh` gains one field: `pickRanges: Layout3dPickRange[]`.
  `sectionToRange` / `wallRanges` keep their exact current semantics and
  consumers (`matchWallRanges`, `matchOpeningRanges`, the highlight overlays,
  the adapter) — nothing existing changes shape.

### Deterministic surface mapping

| Emitted faces (builder) | Pick ref |
|---|---|
| `buildSectionFaces`, `side` section, no `openingId` | `{ kind: 'wall', roomId, segmentId, surface: 'side' }` |
| `buildSectionFaces`, `side` section with `openingId` (the sill strip, `topY = sillHeight`) | `{ kind: 'opening', …, surface: 'sill' }` |
| `buildSectionFaces`, `lintel` section — band + top faces | `{ kind: 'opening', …, surface: 'lintel' }` |
| `buildSectionFaces`, `lintel` section — bottom (arch underside) faces | `{ kind: 'opening', …, surface: 'arch-reveal' }` |
| `buildRevealFaces` (jambs) | `{ kind: 'opening', …, surface: 'jamb' }` |
| `buildStartBridgeFaces` + `pushBridgeSide`/`pushBridgeCap`/`pushWedgeCaps` | `{ kind: 'wall', roomId, segmentId: current wall, surface: 'bridge' }` |

- **Bridge ownership is exclusive.** The bridge is emitted once, owned by the
  current/start wall (`segmentId` of the wall whose START the bridge closes).
  It is **not** assigned to `neighborSegmentId` — the umbrella rule
  ("never assigned to both adjacent walls for picking") overrides the
  `wallRanges` shared-entry convention, which stays metadata-only for
  highlight.
- **Rectangular openings** (flat lintel) still produce `arch-reveal` on the
  lintel underside — the surface is about the face class, not the arch shape.
- **Both-open miter corners** emit no interior jambs (existing behavior); the
  profile-difference reveal caps close the void and are bridge faces →
  `surface: 'bridge'`, owner = current wall. Coverage still holds.

### Face tagging happens at build time

- `Face` gains an internal `pickSurface: Layout3dWallSurface | Layout3dOpeningSurface`
  (plus the section's `openingId`/`segmentId` context) assigned at push time:
  `pushBandFace` and the top-face push tag the section surface (`'side'` |
  `'sill'` | `'lintel'`); the underside push tags `'arch-reveal'` when the
  section is a lintel, else the section surface (floor face of a side section).
  Reveal and bridge builders tag their faces `'jamb'` / `'bridge'`.
- No reordering of emitted faces: index layout, `materialGroups`, and
  `sectionToRange` counts are byte-identical to G4. A lintel section's
  `'lintel'` and `'arch-reveal'` runs may alternate per clip interval — each
  run becomes its own `pickRanges` entry (same ref, like `wallRanges` range
  sets); the reverse index merges them.

### `pickRanges` is a partition of the index buffer

- Emitted in index order, so `pickRanges` is sorted ascending, non-overlapping,
  and covers `[0, indices.length)` exactly — guaranteed by construction and
  asserted by tests. This is what makes "every triangle has exactly one pick
  owner" a testable invariant rather than a hope.
- `buildLayout3dTriangleIndex` validates the partition (gap/overlap/uncovered
  throws, mirroring `assertWindingAgreesWithNormals`) and returns a dense
  resolver. S6's raycast path calls it once per mesh, not per hit.

### Reverse index: once per mesh generation, in preview state

- `layout-preview-state.svelte.ts` already builds `wallMeshesByRoom` in one
  function (`buildWallMeshesByRoom(geometry)`) on every mutation and rebuild.
  S5 adds a sibling `layout3dPickIndexByRoom: ReadonlyMap<string, Layout3dPickIndex>`
  built in the same loop, carried on `LayoutPreviewState` next to
  `wallMeshesByRoom`, assigned at **every** site that assigns the mesh map
  (`applyCompiledLayout` — the `refreshLayoutPreview` path — plus
  `derivePreviewBundle` → `commitPreviewBundle`/`createState`, `replaceState`,
  `restoreLayoutPreviewSnapshot`), never part of the undo snapshot, rebuilt on
  undo/redo/reset/import exactly like the mesh cache.
- The index is a plain pure object (ref table + `Uint32Array` triangle→ref);
  S6 reads `layoutPreview.layout3dPickIndexByRoom` directly — no new shell
  plumbing needed here.

### Adapter passes metadata through `userData`, never groups

- `toWallBufferGeometry` adds `geometry.userData.pickRanges = mesh.pickRanges`
  alongside the existing `sectionToRange` / `wallRanges`. No `addGroup` change;
  draw-call counts are untouched.

### Mesh tagging contract

- **Floor**: existing `userData` (`surfaceType: 'floor'`, `roomId`,
  `editorSurface`) is the identity — pinned by a test, unchanged.
- **Ceiling**: gains `userData={{ surfaceType: 'ceiling', roomId }}`. No
  `editorSurface` (ceilings are never placement-grounding targets; the
  placement raycaster filters on floor tags).
- **Layout objects**: the root group's `userData` (`editorEntity:
  'layout-object'`, `layoutObjectId`) is the identity — pinned, unchanged.
  `readonly` profile objects keep their existing mesh; pick identity is
  identical, S6's opening/object semantics are unaffected.
- These are **explicit authored identities**, never coordinate- or
  index-guessed — the umbrella's "geometry never guesses ownership" rule.

### Interior-anchor helper meshes (editor-only, pickable)

- Source: `geometry.queries.points` filtered to `kind === 'interior-anchor'`
  (the same compiled records Plan hits) — each carries `roomId`,
  `segmentId`, `sourceId` (anchor id), and world-space `point`.
- Placement: a new pure helper `layoutAnchorHelperPlacements(geometry)`
  returns `Array<{ roomId, segmentId, anchorId, position: [x, floorElevation, z] }>`,
  lifting each anchor point to its room's `floorElevation` (the umbrella's
  "projected at room floor / editor helper height").
- Rendering: `LayoutPreviewScene.svelte` renders one small pickable mesh per
  placement (e.g. a ~0.12 m octahedron, slightly above the floor to avoid
  z-fighting) carrying `userData={{ editorEntity: 'layout-anchor', roomId,
  segmentId, anchorId }}`. Helpers have **no** `editorSurface`, so placement
  grounding ignores them; they are interactive for S6's raycast with the
  top semantic priority ("explicit editor anchor helper → opening → object →
  wall → room").
- Relic note: `EditorViewport` mounts `LayoutPreviewScene` only in its
  `currentWorkspace === 'layout'` branch, which the relic cannot enter
  (`setWorkspace('layout')` returns false), so the helpers are H1-reachable
  only at runtime. The shared component gains no new imports of H1-only
  modules; the S4-style source-assertion contract stays satisfied.
- **Inert between S5 and S6**: before the S6 coordinator lands, the helpers
  carry no `placementId` and no camera/navigation identity, so
  `resolveNormalSelection` classifies a helper click as background
  `deselect` — identical to clicking a wall mesh or empty space today (wall
  meshes are also identity-less to the scene classifier). Placement grounding
  filters `userData.surfaceType === 'floor'`, placement hover raycasts
  placement roots only, and path/framing handle hits key on camera identities
  — all ignore helpers. The only pre-S6 effect is a stray click intercepted at
  a helper's tiny footprint, which is already a deselect. S6 promotes helpers
  to the top semantic priority.

### Purity and bench

- `layout-3d-picking.ts` imports no Three/DOM/Svelte/`$app`/`$lib/museum`
  (same boundary test as `plan-hit.ts` and the G4 builder test). `pickRanges`
  is pure typed-array + plain-object metadata.
- **No G3 re-baseline expected**: positions/normals/uvs/indices/`materialGroups`
  are unchanged, so the `three-*-estimate` budgets hold exactly. `wall-mesh-build`
  only gains the per-face pickRanges emission overhead (the index build is a
  separate preview-state step, outside that metric) — Chopin's enforced fail
  budget has ~1.7x headroom (34.5 ms measured vs 60 ms fail, target 30 ms). If
  the enforced fail budget still trips, re-record via `bench:record` with a
  recorded reason — never silently, never a default-test rewrite.

## Implementation steps

### 0. Pin the contracts with tests first

Add an `H1 S5 — layout 3D pick metadata` describe block to
`tests/lib/editor/h1/contracts.test.ts`, a focused unit file
`tests/lib/editor/layout/layout-3d-picking.test.ts` for the pure parts, and
extend `tests/lib/layout/wall-mesh-builder.test.ts`:

- **Partition** — for every builder fixture (plain rectangle, L-shape, opening
  matrix, profile matrix, forced-bevel, both-open miter, arched corner):
  `pickRanges` is sorted, non-overlapping, and covers `[0, indices.length)`
  exactly; triangle count ≡ coverage.
- **Exactly-one owner** — `buildLayout3dTriangleIndex(mesh)` resolves every
  triangle to a non-null ref; no triangle maps to two refs (dense index).
- **Surface mapping** — plain rectangle: all triangles → wall `'side'` for the
  authored room/segment. Opening fixture: lintel band/top triangles → opening
  `'lintel'`; lintel underside triangles → opening `'arch-reveal'` (asserted
  by downward normals `ny < -eps`); sill-strip triangles → opening `'sill'`;
  jamb triangles → opening `'jamb'` (horizontal normals); remaining side
  sections → wall `'side'`.
- **Bridge exclusivity** — forced-bevel fixture: bridge triangles resolve to
  `{ kind: 'wall', surface: 'bridge', segmentId: <current wall> }` and never to
  the neighbor's `segmentId`; every bridge triangle still has exactly one owner.
- **Both-open miter** — merged corner void fixture: full coverage holds with
  the profile-difference reveal resolved to `'bridge'` (current wall) and no
  orphan triangles.
- **Index dev guard** — a synthetic mesh with a gapped/overlapping `pickRanges`
  makes `buildLayout3dTriangleIndex` throw (development guard, like
  `assertWindingAgreesWithNormals`).
- **Adapter** — extend `tests/lib/render/wall-geometry-adapter.test.ts`:
  `geometry.userData.pickRanges === mesh.pickRanges`; no new `geometry.groups`.
- **Anchor placements** — `layoutAnchorHelperPlacements` lifts interior-anchor
  query points to the owning room's `floorElevation` and keeps qualified
  identity; anchors from non-auto-bezier walls never appear (the compiler only
  emits interior-anchor records for auto-bezier segments).
- **Boundary** — `layout-3d-picking.ts` and `wall-mesh-builder.ts` import no
  Three/Svelte/DOM/`$app`/`$lib/museum`.
- **Relic isolation (source assertions)** — `LayoutPreviewScene.svelte` gains
  `surfaceType: 'ceiling'` and `editorEntity: 'layout-anchor'`; the relic
  still imports only shared layout components (no new H1-only edges).

### 1. Types + builder emission

- Add `Layout3dWallSurface`, `Layout3dOpeningSurface`, `Layout3dTriangleRef`,
  `Layout3dPickRange` to `wall-mesh-builder.ts`; add `pickRanges:
  Layout3dPickRange[]` to `IndexedWallMesh`.
- Tag faces at build time per the locked mapping (Face gains
  `pickSurface`; section builders compute it from `section.openingId` /
  `section.kind`; reveal + bridge builders tag their own).
- In `emitMesh`, during the existing material-group pass, accumulate contiguous
  runs of identical `(kind, roomId, segmentId, openingId, surface)` into
  `pickRanges` (start/count in index order). Runs are per emitted face run —
  a lintel section may contribute several alternating `'lintel'`/`'arch-reveal'`
  entries; that is fine, the index merges.

### 2. Reverse index + pure module

- New `apps/museum/src/lib/editor/layout/layout-3d-picking.ts` (pure):
  - re-export `Layout3dTriangleRef` / `Layout3dPickRange`;
  - `layoutAnchorHelperPlacements(geometry)` (used by step 4);
  - `buildLayout3dTriangleIndex(mesh): (triangleIndex: number) => Layout3dTriangleRef | null`
    — validates the partition (dev guard), builds the ref table + dense
    `Uint32Array` once, returns the resolver closure. Out-of-range triangle
    indices return `null` (defensive; the partition guarantees none exist in
    practice).

### 3. Preview-state cache

- `LayoutPreviewState` gains `layout3dPickIndexByRoom: ReadonlyMap<string,
  Layout3dPickIndex>`; `buildWallMeshesByRoom` builds both maps in the same
  loop; every site that assigns `wallMeshesByRoom` assigns the index map
  (`applyCompiledLayout`, `derivePreviewBundle` →
  `commitPreviewBundle`/`createState`, `replaceState`,
  `restoreLayoutPreviewSnapshot`). Never in the undo snapshot.

### 4. Adapter + scene tagging + anchor helpers

- `wall-geometry-adapter.ts`: carry `userData.pickRanges`.
- `LayoutPreviewScene.svelte`:
  - ceiling mesh gains `userData={{ surfaceType: 'ceiling', roomId }}`;
  - render `LayoutAnchorHelper` meshes from `layoutAnchorHelperPlacements(geometry)`
    with qualified `userData` (editor-only, pickable, no `editorSurface`);
  - floor + object identities stay as-is (tests pin them).

### 5. Regression + manual QA

- Full suite + `svelte-check` + production build. Every G4 builder/adapter
  test, the G3 bench budgets, and all S1/S2/S3/S4 contracts pass **unchanged**
  (S5 is additive).
- Manual: draft a room in Plan with a door + window (rounded) + an auto-bezier
  curved wall with interior anchors; switch to 3D and confirm walls/floors
  render identically to before, anchors appear as small pickable helpers at
  floor height (visually distinct, no z-fighting), ceilings still toggle, and
  placement + camera + scene picking behave exactly as before (S6 changes
  nothing yet); `/museum/editor` unchanged.
- Confirm repeated edits/undo/redo/reset rebuild the index with the mesh cache
  (no growth, no stale per-room entries).

### 6. Close the slice

- Update `docs/hand-off/CURRENT.md` (S5 planned → shipped on close: pick
  contract, index cache, tagging, anchor helpers, verification).
- No commits unless requested.

## Regression matrix

| Concern | Required assertion |
|---|---|
| Complete identity | Every wall-buffer triangle resolves to exactly one `Layout3dTriangleRef` — sections, sill/lintel/arch-reveal sub-surfaces, jambs, bridges |
| Additive | `pickRanges` is a new field; `sectionToRange`/`wallRanges`/`materialGroups`/index layout byte-identical to G4; highlight overlays unchanged |
| Bridge ownership | Bridge triangles owned by the current/start wall only, `surface: 'bridge'`, never the neighbor segment |
| Openings | Sill strip → `'sill'`; lintel band/top → `'lintel'`; underside → `'arch-reveal'`; jambs → `'jamb'`; door (rectangular) underside still `'arch-reveal'` |
| Reverse index | Built once per mesh generation (preview-state cache), partition-validated, dense resolver; no per-raycast rebuild |
| Adapter | `userData.pickRanges` carried; zero new geometry groups; dispose/lifetime unchanged |
| Floor/ceiling | Floor identity unchanged; ceiling tagged `surfaceType: 'ceiling'` + `roomId`; neither is a placement-grounding target change |
| Objects | `editorEntity: 'layout-object'` + `layoutObjectId` pinned; readonly profiles unchanged |
| Anchor helpers | Editor-only qualified helpers at room floor elevation, pickable, excluded from placement grounding; Plan behavior unchanged |
| Purity | `wall-mesh-builder.ts` + `layout-3d-picking.ts` import no Three/DOM/Svelte/`$app`/`$lib/museum` |
| Bench | `three-*-estimate` budgets hold exactly; `wall-mesh-build` gains only pickRanges emission overhead — fail budget expected to hold (34.5 → 60 ms), else re-record via `bench:record` with a reason |
| Relic isolation | `/museum/editor` runtime unchanged (layout workspace unreachable); no new shared→H1 import edges |
| Cache lifecycle | Index map rebuilds with `wallMeshesByRoom` on mutation/undo/redo/reset/import; never in the undo snapshot |

## Non-goals (deferred)

- Centralized 3D selection (S6): raycast coordinator, `Layout3dHitCandidate`
  generation, nearest-visible + same-depth arbitration, helper filtering,
  background clear, and feeding `ActiveEditorSelection` + the unified tree.
  S6 declares `resolveLayout3dHits` in `layout-3d-picking.ts` and consumes
  `layout3dPickIndexByRoom`.
- Single TransformControls host with layout adapter (S7) and layout candidate
  preview + atomic history (S8).
- Hover/highlight from pick identity, layout delete in 3D, selection cycling
  through coincident content (explicitly later per the umbrella).
- 2D/3D hit-order parity (Plan's vertex → anchor → opening → object → wall →
  room stays; H1 asserts identity parity, not ordering).
- Project-local asset import (S9) and post-H1 Plan staging (C1) — C1's 2D
  staging picks use footprint polygons, not this 3D metadata.
- Any change to `sectionToRange`/`wallRanges` semantics or the G3 bench.

## Expected files

Conceptually new:

```text
apps/museum/src/lib/editor/layout/layout-3d-picking.ts    (pure: types re-export,
                                                            anchor placements,
                                                            buildLayout3dTriangleIndex)
tests/lib/editor/layout/layout-3d-picking.test.ts          (partition, owners,
                                                            surfaces, index guard)
```

Primary edits:

```text
apps/museum/src/lib/layout/wall-mesh-builder.ts            (pick types + pickRanges emission)
apps/museum/src/lib/render/wall-geometry-adapter.ts        (userData.pickRanges)
apps/museum/src/lib/editor/layout/layout-preview-state.svelte.ts (layout3dPickIndexByRoom cache)
apps/museum/src/lib/editor/layout/LayoutPreviewScene.svelte (ceiling userData + anchor helpers)
tests/lib/layout/wall-mesh-builder.test.ts                 (S5 describe block: coverage/surfaces/bridges)
tests/lib/render/wall-geometry-adapter.test.ts             (userData.pickRanges, no groups)
tests/lib/editor/h1/contracts.test.ts                      (H1 S5 describe block: boundary + relic source assertions)
docs/hand-off/CURRENT.md                                   (S5 planned → shipped on close)
```

Untouched: `sectionToRange`/`wallRanges` consumers (`matchWallRanges`,
`matchOpeningRanges`, `buildWallHighlightMesh`), `wall-material-factory.ts`,
the visitor shell, and everything under `/museum/editor`.

## Implementation notes (as-built deviations)

- **Face tagging**: `Face` gained an internal `pick?: FacePick` (kind + surface
  only — `roomId`/`segmentId` come from the emitting wall context at emit
  time, not stored per face). Sections compute `sectionPick`/`undersidePick`
  from `section.kind`/`section.openingId` with a defensive fallback to wall
  `'lintel'` when a lintel section somehow lacks `openingId` (the compiler
  never does); jambs tag `'jamb'`, bridge helpers default to `BRIDGE_PICK`
  (`wall 'bridge'`).
- **Run accumulation**: `emitMesh` walks the existing material-group pass and
  merges contiguous index runs of identical `(kind, roomId, segmentId,
  openingId, surface)` via `notePick`; disjoint runs of one ref stay separate
  entries (a lintel section alternates `'lintel'`/`'arch-reveal'` per clip
  interval) and the reverse index dedupes them into one table entry.
- **TS2698 quirk**: spreading a variable whose *declared* type includes `null`
  fails even after `if (pickRun)` narrowing ("Spread types may only be
  created from object types"). Extracted `toPickRange(ref, start, count)`
  whose parameter is non-nullable; both emit sites route through it.
- **Anchor helpers**: octahedron (`OctahedronGeometry` 0.12 m) at
  `floorElevation + 0.02` to avoid z-fighting, `MeshBasicMaterial` gold
  (#d6b35f — matches Plan's anchor accent), `userData` carries `editorEntity:
  'layout-anchor'` + qualified identity, no `editorSurface`. Verified inert:
  `resolveNormalSelection` sees no `placementId`/navigation → `deselect`;
  placement grounding filters `surfaceType === 'floor'`.
- **Review fixes (post-ship review round)**: (1) the anchor each-block key
  switched from colon-joined `roomId:segmentId:anchorId` to
  `JSON.stringify([roomId, segmentId, anchorId])` — `ID_PATTERN` legally
  allows `:` in IDs, so a crafted import could collide two distinct anchors
  into one key and crash the keyed each (Svelte 5 throws on duplicate keys).
  (2) helpers gained a `showAnchors` prop (default `true`, so the relic
  `EditorViewport` mount is unchanged) threaded from `H13DView` as
  `!store.isVisitorCameraPreview` — they are editor chrome and must not frame
  a visitor camera preview (same convention as grid/selection/ghost).
  (3) `emitFaceWithPick` now throws on an untagged face instead of silently
  folding it into the previous pick run — the partition guard only catches a
  missing owner, never a wrong one; every emitted face today is tagged, so
  this is a fail-closed regression guard.
- **Bridge owner verified against the emitted geometry**: forced-bevel
  rectangle (miterLimit 1) — bridge triangles at each corner resolve to the
  corner's current/start wall (`(0,0)→wall:0`, `(6,0)→wall:1`, `(6,4)→wall:2`,
  `(0,4)→wall:3`), never the neighbor; both-open miter with mismatched door
  heights (2.1 vs 2.4) — the profile-difference reveal at the shared corner
  resolves to the current/start wall (`room-mm:wall:1`).
- **Bench**: no re-baseline performed; `wall-mesh-build` gained only the
  pickRanges emission pass (Chopin well under the 60 ms fail budget), all
  `three-*-estimate` counts byte-identical (zero topology change).

## Verification

```text
npm test -w @portfolio/museum
npm run check -w @portfolio/museum
npm run build -w @portfolio/museum
```

Plus the manual QA in step 5, the unchanged G4 builder/adapter suites, the
unchanged G3 bench budgets (no re-baseline), and the S0–S4 contracts in
`tests/lib/editor/h1/contracts.test.ts`.
