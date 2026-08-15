# H1 — Unified Plan-to-3D Project Editor

**Date:** 2026-08-14  
**Status:** Proposed — revised product architecture  
**Parent:** [`2026-08-13-graphics-architecture-roadmap.md`](./2026-08-13-graphics-architecture-roadmap.md)  
**Prerequisite:** [`2026-08-13-graphics-g1-shared-geometry-compiler.md`](./2026-08-13-graphics-g1-shared-geometry-compiler.md) · [`2026-08-13-graphics-g4-procedural-architectural-meshes.md`](./2026-08-13-graphics-g4-procedural-architectural-meshes.md) · [`2026-08-12-layout-cad-b3-room-unit-relocate.md`](./2026-08-12-layout-cad-b3-room-unit-relocate.md)  
**Handoff:** [`../hand-off/CURRENT.md`](../hand-off/CURRENT.md)  
**Contracts:** [`../north-star.md`](../north-star.md) · [`../architecture.md`](../architecture.md) · [`../components/shell.md`](../components/shell.md) · [`../components/placement.md`](../components/placement.md) · [`../components/camera-tour.md`](../components/camera-tour.md) · [`../components/persistence.md`](../components/persistence.md) · [`../components/assets.md`](../components/assets.md)

## Goal

Ship the editor around the finished-product flow:

```text
Open app
  → empty Plan canvas (the editor always boots fresh)
  → draw rooms/openings + rough parametric objects
  → switch to 3D
  → refine architecture
  → import/place scene assets
  → author and preview the camera tour
  → export one portable project
```

The product has two views of one project:

- **Plan** — layout CAD only: rooms, walls, openings, and rough parametric
  layout objects;
- **3D** — the integrated project editor: generated architecture, layout
  editing, scene assets, materials, camera/tour authoring, one hierarchy, one
  inspector, and one contextual gizmo.

`Scene` and `Camera` stop being separate top-level workspaces. They become tool
and panel contexts inside the one 3D view. The old isolated Layout-3D preview
also disappears into that same view.

“3D becomes the scene” means **one composed editing surface**, not that a Three
scene graph becomes persisted truth. `LayoutDocument` remains authoritative for
architecture; `SceneDocument` remains authoritative for dressing and camera
data; render objects and gizmo proxies remain derived/session-only.

## Product model

```text
MuseumProject editor session
  ├─ Plan
  │    └─ Layout CAD
  │         rooms · walls · openings · layout objects
  │
  └─ 3D
       ├─ generated layout architecture
       ├─ layout selection + fine editing
       ├─ scene entities + imported/catalog assets
       ├─ materials
       ├─ camera nodes/paths/framing/playback
       ├─ unified project hierarchy
       └─ one contextual TransformControls gizmo
```

The user may switch between Plan and 3D at any time after creating a valid room.
The flow is progressive, not a wizard: switching views never commits, imports,
or forks a document.

H1 editor is greenfield. It never loads, migrates, or preserves checked-in
Chopin editor/session state. `/museum` remains a working read-only visitor
relic and `/museum/editor` freezes the pre-H1 Scene · Camera editor (Layout
hidden), both backed by existing checked-in data. New editor projects use H1
contracts from creation onward. Import/export supports projects created by
this editor plus future versioned migrations from that H1 baseline.

## Current state

| Concern | Today | H1 outcome |
|---------|-------|------------|
| Top-level navigation | Scene · Camera · Layout workspaces | Plan · 3D views |
| Session start | Editor starts from checked-in content; layout can be reset independently | Editor always boots into one valid empty `MuseumProject` and opens Plan |
| Chopin museum | Checked-in project drives current editor/visitor examples | `/museum` visitor + `/museum/editor` pre-H1 editor snapshot remain relics; H1 editor never imports or migrates Chopin state |
| Plan | Full layout CAD plus optional read-only tour projection | Layout CAD surface; camera editing is not required or exposed |
| Layout 3D | Separate layout-workspace Canvas; architecture is mostly read-only | Removed as a separate surface; its renderer joins the unified 3D Canvas |
| Scene 3D | Assets/entities, materials, scene selection, placement gizmo | Preserved inside unified 3D |
| Camera | Shares the scene-side renderer but has a separate Camera workspace | Camera tools/timeline/helpers become 3D contexts, using the existing route/motion system |
| Layout picking | Plan picking; no complete wall/opening/anchor picking in 3D | Complete visible-surface 3D picking mapped to authored layout identities |
| Selection | Layout state, scene placement state, and camera state can coexist without one active domain | One active selection domain: layout, scene, camera, or none |
| Gizmo | Scene/camera `EditorTransformControls`; no layout gizmo | One mounted TransformControls host; domain adapters mutate the correct document |
| History | One chronological stack with `layout` and `scene` entries | Preserved; one entry per completed gesture in the owning domain |
| Hierarchy | Scene tree, camera tree, and layout summary/accordions are workspace-specific | One project hierarchy plus Assets panel; imported H1 projects cross-validate as one project |
| Imported models | Checked-in catalogue GLBs only; user GLB pipeline deferred | Project-local GLBs can enter the asset library, place in 3D, and round-trip in the portable package |

## Target architecture

```text
                         MuseumProject session
                    ┌────────────┴────────────┐
                    │                         │
           LayoutDocument v3          SceneDocument v6
                    │                         │
        compileLayoutGeometry()       resolveSceneDocument()
             ┌──────┴──────┐           ┌─────┴──────────┐
             │             │           │                │
      PlanRenderModel  wall meshes  scene entities  camera-route/motion
             │             └───────────┴──────────────┐
             │                                         │
          Plan view                            Unified 3D Canvas
                                                       │
                                              ActiveEditorSelection
                                                       │
                                           one TransformControls host
                                                       │
                              ┌────────────────────────┼───────────────────────┐
                              │                        │                       │
                        layout adapter           scene adapter          camera adapter
                              │                        │                       │
                       LayoutDocument            SceneDocument           SceneDocument
                              └────────────────────────┴───────────────────────┘
                                                       │
                                      chronological history (`layout` | `scene`)
                                                       │
                                                portable export
```

## Ownership remains separate

| Data | Source of truth | 3D representation |
|------|-----------------|-------------------|
| Rooms, boundaries, openings, room frames | `project.layout` | Derived architecture meshes + edit proxies |
| Rough Box/Cylinder/Sphere placeholders | `project.layout.objects` | Derived primitive meshes |
| Placed catalogue/imported models, scene primitives, lights, materials | `project.scene` | Existing scene entity roots |
| Navigation nodes, connections, paths, view tracks, timing | `project.scene` | Existing camera helpers and route/motion projections |
| Imported GLB bytes and package metadata | Project-local asset registry + portable package manifest | Object URLs/resource handles, session-only |
| Selection, gizmo proxy, hover, panel state | Editor session only | Never serialized |

H1 integrates these domains in the editor shell; it does not merge their schemas
or move camera/assets into `LayoutDocument`.

**Post-H1 polish slice (locked):** 2D furnishing ships after H1 as the **Plan
staging mode** (C1) — scene entities become visible and editable in Plan
through a `layout | staging` tool mode. C2 (catalogue assets as layout
objects, `LayoutObject.kind: 'asset'`) is **rejected** in favor of C1:
furniture stays in `project.scene`, and the scene pipeline (3D gizmo, visitor
rendering, imported-GLB uniformity) remains the single content path. See
"Post-H1 polish slices" for the full contract, the S3 policy amendment, and
the derived-footprint rule.

`/museum` is outside this editor session graph. H1 does not route its checked-in
Chopin project through editor import, selection, history, or gizmo
adapters.

## Locked decisions

### One shell: Plan or 3D

- Replace `Scene | Camera | Layout` top-level workspaces with `Plan | 3D`.
- Exactly one editor Canvas is mounted while in 3D. It composes
  `LayoutPreviewScene`, scene entities, camera helpers, grid, lights, and the
  contextual gizmo.
- Plan remains the existing renderer-neutral `PlanRenderModel` → `PlanSvg`
  surface. Camera/tour editing is 3D-only. Existing read-only Plan tour overlays
  may remain if cheap, but they are not an H1 requirement and expose no camera
  mutation path.
- View switching preserves both documents, selection where valid, history,
  dirty baselines, asset bytes, and camera state. It creates no history entry.

### Boot into one empty project

- The editor always boots into a canonical empty `LayoutDocument` plus an empty
  scene v6 (`textures`, `materials`, `entities`, `navigationNodes`,
  `connections` all empty) and opens Plan. There is no New Project command:
  importing a package is the only way to load prior work, and export is the
  only save.
- The editor uses a session-only free PerspectiveCamera until the user authors
  the first navigation node. No fake node or generated endpoint is persisted.
- The project codec must accept this authoring-empty state. Visitor/tour preview
  remains unavailable until its existing runtime prerequisites are satisfied.
- Session reset and full-project import clear shared history and reset both
  dirty baselines atomically.
- Import accepts only complete, cross-valid H1-format projects or explicit
  future migrations rooted in that format. It does not accept/migrate checked-in
  Chopin data, legacy workspace state, legacy selection, or history.
- History is session-only and never imported. Successful import always starts
  with an empty history stack and no active selection.

### One active selection domain

```ts
type ActiveEditorSelection =
  | { domain: 'none' }
  | { domain: 'layout'; selection: LayoutSelection }
  | { domain: 'scene'; selection: SceneWorkspaceSelection }
  | { domain: 'camera'; selection: CameraSelection };
```

- Plan selection always activates the layout domain (the post-H1 Plan staging
  mode C1 adds the one scene-domain exception — see "Post-H1 polish slices").
- A 3D or hierarchy pick activates exactly one domain and clears the prior
  active domain's actionable selection. Expansion and discovery UI state may
  persist, but two gizmo-eligible selections may never coexist.
- Layout identity remains `room | wall | opening | interiorAnchor | object`.
  Scene and camera keep their existing types; only the active-domain wrapper is
  shared.
- Background click clears the active selection. TransformControls handles
  consume their own pointer events before scene picking.

### One project hierarchy

The hierarchy is a view over both documents, not a merged identity type:

```text
Rooms
  <layout room>
    Architecture
      Walls
      Openings
      Layout objects
    Scene
      Clusters
      Entities
Camera Tour
  Nodes
  Connections
```

- Layout rooms define the primary room order and labels.
- Scene entities and camera nodes nest by explicit `roomId`; geometry never
  guesses ownership.
- Full-project import cross-validates all room references before replacement;
  mismatch rejects the whole import without changing current project.
- The Assets panel remains a sibling panel to Hierarchy inside 3D. Selecting an
  asset arms existing ghost placement; it does not change view or workspace.

### One TransformControls host, domain adapters

- Mount one `THREE.TransformControls` instance in the unified 3D Canvas.
- Extract its lifecycle, camera binding, orbit lock/restore, pointer ownership,
  Escape handling, snap modifiers, and FSM integration into one host.
- Scene placement and camera behavior move behind adapters without semantic
  change. Layout adds a third adapter; it does not create another gizmo.
- An adapter owns target proxy creation, supported modes/axes, pivot orientation,
  transient preview, validation, commit/cancel, and history domain.
- Unsupported modes and axes are hidden/disabled at the control level, never
  accepted and discarded after a drag.

### Layout gizmo semantics

| Layout target | Modes and axes | Pivot/document mapping |
|---------------|----------------|------------------------|
| Room | world X/Z translate; Y yaw | Polygon centroid; `transformLayoutRoomUnit`; frame, boundary, anchors, and owned layout objects move atomically |
| Wall | world X/Z translate | Compiled wall midpoint; move both endpoints and the selected wall's interior anchors by one delta; adjacent endpoints follow so closure remains exact |
| Opening | local tangent translate; local X/Y scale | Proxy origin at opening bottom-center, X along wall tangent, Y up; translate changes offset; X scale changes width about center and adjusts offset; Y scale changes height with sill fixed |
| Interior anchor | world X/Z translate | Authored anchor point projected at room floor/editor helper height; updates the existing anchor only |
| Layout object | translate/rotate/scale using stored axes | Maps to `position`, Euler `rotation`, and full local `dimensions`; imported `profile` remains read-only |

- Room and wall Y translation is disabled. Room scale and wall rotate/scale remain
  out of v1.
- Opening offset/width clamp to the compiled wall length and validate neighbor
  overlap. Local Z is disabled; wall thickness is not an opening transform.
- Snapping reuses the editor interaction store: layout translation uses the
  layout grid increment, Shift rotation uses 15°, and the existing temporary
  snap-bypass/modifier contract remains one documented behavior across domains.
- Gizmo proxies are session-only `Object3D`s. Their transforms are deltas from a
  captured authored baseline, never persisted directly.

### Layout candidate preview and commit

- Drag start captures one immutable pre-gesture snapshot and calls the guarded
  `beginLayoutTransaction()` facade.
- Each pointermove derives a candidate `LayoutDocument` from that baseline. It
  never compounds deltas from the previously rendered candidate.
- The candidate runs structural validation, shared geometry validation, compile,
  and procedural wall-mesh preflight before becoming the visible transient
  preview. An invalid candidate leaves the last valid preview visible and posts
  the first issue.
- Plan and 3D may render the transient candidate, but the canonical project,
  dirty baseline, export payload, and history remain unchanged until commit.
- Pointer-up installs the last valid candidate atomically and creates exactly
  one `layout` history entry. A no-op creates none.
- Escape, pointer cancel, view switch, selection-domain switch, or component
  teardown restores the pre-gesture snapshot, removes proxies, and restores
  orbit controls.
- Every compiled room must produce its expected wall mesh before the candidate
  can commit. Mesh-builder issues such as offset fold/overlap reject the
  candidate; partial `wallMeshesByRoom` is never installed by a gizmo edit.

### Complete 3D identity, not section-only identity

The G4 `sectionToRange` metadata is insufficient for H1 because opening reveal
faces and corner bridges are emitted outside it. H1 may add an additive,
renderer-neutral picking contract to `IndexedWallMesh`:

```ts
type Layout3dTriangleRef =
  | {
      kind: 'wall';
      roomId: string;
      segmentId: string;
      surface: 'side' | 'lintel' | 'bridge';
    }
  | {
      kind: 'opening';
      roomId: string;
      segmentId: string;
      openingId: string;
      surface: 'jamb' | 'sill' | 'lintel' | 'arch-reveal';
    };

type Layout3dPickRange = Layout3dTriangleRef & {
  start: number; // index-buffer offset
  count: number; // index-buffer count
};
```

- Every triangle in the wall buffer receives one deterministic authored pick
  owner. Opening reveal/jamb triangles map to the opening. A corner bridge maps
  to the builder's deterministic current/start-wall owner; it is never assigned
  to both adjacent walls for picking.
- Existing `sectionToRange` and `wallRanges` keep their highlight/material
  semantics. The new pick ranges are additive and remain pure data—no Three,
  DOM, or Svelte imports enter `$lib/layout/**`.
- Floors and ceilings carry explicit room identity. Layout objects carry
  `layoutObjectId`. Interior anchors get editor-only helper meshes carrying the
  full qualified anchor identity.

### Visible-depth 3D picking

3D selection does not pretend to share Plan's 2D tolerance priority. It shares
authored identity, while using 3D visibility:

```ts
type Layout3dHitCandidate =
  | { kind: 'object'; objectId: string; distance: number }
  | { kind: 'anchor'; roomId: string; segmentId: string; anchorId: string; distance: number }
  | { kind: 'wall-triangle'; roomId: string; triangleIndex: number; distance: number }
  | { kind: 'room-surface'; roomId: string; surface: 'floor' | 'ceiling'; distance: number };

resolveLayout3dHits(
  meshes: ReadonlyMap<string, IndexedWallMesh>,
  hits: readonly Layout3dHitCandidate[]
): LayoutSelection | null;
```

- The nearest visible eligible hit wins. Semantic priority only breaks hits at
  the same depth within a fixed epsilon: explicit editor anchor helper → opening
  → object → wall → room.
- Highlights, gizmo helpers, grid, lights, and non-interactive helpers are
  excluded from selection raycasts.
- An object behind a wall is not selected merely because object is a higher
  semantic kind. Selection cycling through coincident/overlapping content is a
  later enhancement.
- Plan retains its existing vertex → interior anchor → opening → object → wall
  → room resolution. H1 tests identity parity where both views expose the same
  authored element, not identical 2D/3D hit ordering.

### Imported assets participate in the same 3D flow

- H1 integrates existing catalogue placement into unified 3D unchanged.
- To satisfy the end-to-end product flow, add a focused project-local GLB import
  sub-slice before H1 closes. A chosen GLB is fingerprinted, validated, assigned
  a stable project-local asset id, registered in the Assets panel, and loaded
  through the shared `AssetModel` path—never a room-local GLTF loader.
- Scene model entities continue to persist an `assetId` in scene v6. A composite
  editor asset registry resolves checked-in catalogue ids and project-local ids.
- Project-local model bytes and model metadata live in the portable package
  manifest/asset store, not inside `MuseumProject` JSON or `SceneDocument`.
  Package export/import cross-validates every referenced project-local asset and
  round-trips its bytes.
- Object URLs, decoded GLTFs, and renderer handles remain session-only and are
  released on project replacement/unmount.
- This sub-slice requires its own focused asset/package plan before code if the
  manifest format or security limits change. H1 remains the product umbrella
  and is not complete until at least one user-imported GLB round-trips.

### Camera is integrated in 3D, not duplicated

- Camera tree, timeline, node/connection helpers, framing controls, director
  preview, and visitor preview remain driven by the existing
  `camera-route.ts` + `camera-motion.ts` system.
- Their UI becomes a 3D tool/panel context rather than a top-level workspace.
- Selecting a camera target activates the camera selection domain and attaches
  the same gizmo host through the existing camera adapter.
- Playback keeps the current mutation locks and may hide/detach the gizmo.
- H1 adds no camera fields, second graph, auto-tour generator, or Plan camera
  mutation path.

### Relic isolation remains absolute

- All unified hierarchy, picking, gizmo, asset-import, and editor session code
  remains under editor-only imports.
- `/museum` keeps consuming validated `MuseumProject` data and visitor-safe
  render modules only.
- `/museum/editor` freezes the pre-H1 Scene · Camera editor (Layout tab
  hidden). The editor ships in production builds; there is no build-flag
  gating.

## Public contracts

Conceptual contracts; exact filenames may consolidate:

```ts
createEmptyMuseumProject(input: { id: string; name: string }): MuseumProject;

type EditorViewMode = 'plan' | '3d';

type ActiveEditorSelection =
  | { domain: 'none' }
  | { domain: 'layout'; selection: LayoutSelection }
  | { domain: 'scene'; selection: SceneWorkspaceSelection }
  | { domain: 'camera'; selection: CameraSelection };

type GizmoMode = 'translate' | 'rotate' | 'scale';
type GizmoAxis = 'x' | 'y' | 'z' | 'xy' | 'xz' | 'yz' | 'xyz';

interface EditorGizmoTargetAdapter {
  key: string;
  domain: 'layout' | 'scene' | 'camera';
  proxy: THREE.Object3D;             // session-only target
  allowedModes: ReadonlySet<GizmoMode>;
  allowedAxes(mode: GizmoMode): ReadonlySet<GizmoAxis>;
  begin(): boolean;
  preview(delta: THREE.Matrix4): EditorEditResult;
  commit(): EditorEditResult;
  cancel(): void;
}

buildLayout3dTriangleIndex(
  mesh: IndexedWallMesh
): (triangleIndex: number) => Layout3dTriangleRef | null;

resolveLayout3dHits(
  meshes: ReadonlyMap<string, IndexedWallMesh>,
  hits: readonly Layout3dHitCandidate[]
): LayoutSelection | null;
```

The adapter interface is editor-side and may use Three. The document mutators
it calls remain pure where already pure; `$lib/layout/**` stays renderer-neutral.

## Implementation sequence

Model-strength shorthand below: **Balanced** = `gpt-5.6-terra` with medium/high
reasoning; **Frontier** = `gpt-5.6-sol` with high reasoning; **Frontier+** =
`gpt-5.6-sol` with xhigh reasoning. Balanced is the default for contained 1–5
work and implementation prep; Frontier is for cross-domain 6–8 work; Frontier+
is reserved for the hardest lifecycle, atomicity, ownership, or package changes.
A stronger model is recommended only when boundary risk demands it, not merely
because the slice touches 3D. Difficulty is relative within H1 on a **1–10
scale**: 1–3 contained, 4–6 moderate, 7–8 hard/cross-cutting, 9 critical
integration, 10 highest-risk architectural work in this program.

### 0. Pin the product/session contracts

**Execution:** Difficulty **2/10** · Recommended model strength — plan: **Balanced**; implementation: **Balanced**.

- Add failing tests for a canonical empty project and session-only free camera.
- Replace the implementation plan's workspace assumption with `Plan | 3D`.
- Lock greenfield boot, full-project replacement, view switching, playback
  locks, and `/museum` relic isolation. No legacy session transition contract.
- Write the focused project-local GLB/package sub-plan before changing its
  manifest contract.

### 1. Consolidate the editor shell

**Execution:** Difficulty **4/10** · Recommended model strength — plan: **Balanced**; implementation: **Balanced**.

- Introduce `EditorViewMode = 'plan' | '3d'`.
- Replace Scene/Camera/Layout app-bar tabs with Plan/3D.
- Keep Plan as the SVG CAD surface.
- Build one 3D Canvas that composes the generated layout shell, scene entities,
  camera helpers, grid/lights, placement ghost, selection helper, and gizmo.
- Move former workspace-specific toolbars/timeline into contextual panels.
- Leave the pre-H1 editor frozen at `/museum/editor`; H1 builds its own
  Plan · 3D shell without migrating old workspace/session state.

### 2. Boot into an empty project

**Execution:** Difficulty **3/10** · Recommended model strength — plan: **Balanced**; implementation: **Balanced**.

- Implement `createEmptyMuseumProject` as the editor's initial session state —
  there is no New Project command; the editor boots blank on every load.
- Clear project-local assets/history and reset baselines on boot and on import.
- Prove room drafting works before any scene entity or navigation node exists.
- Prove switching to 3D uses the free editor camera without persisting it.

### 3. Make selection explicitly cross-domain

**Execution:** Difficulty **6/10** · Recommended model strength — plan: **Balanced**; implementation: **Frontier**.

- Add `ActiveEditorSelection` at the editor composition root.
- Adapt existing layout, placement/cluster, and camera selection stores without
  merging their underlying types.
- Make every pick/tree action activate one domain; detach the previous target
  before attaching the next.
- Reconcile selections after document replacement, undo/redo, delete, import,
  and view switch. Import begins with no active selection.

### 4. Build the unified project hierarchy

**Execution:** Difficulty **6/10** · Recommended model strength — plan: **Balanced**; implementation: **Frontier**.

- Replace `EditorSceneTree`, `EditorCameraTree`, and the layout-only summary as
  separate navigation surfaces with `UnifiedProjectTree`.
- Nest layout and scene content under explicit layout rooms; add Camera Tour
  root. Full-project codec guarantees referenced rooms exist.
- Preserve cluster expansion, scene labels, layout qualified identity, camera
  direction expansion, accessibility roles, keyboard focus, and selection sync.
- Keep Assets as a sibling panel in 3D.

### 5. Complete wall/opening pick metadata

**Execution:** Difficulty **8/10** · Recommended model strength — plan: **Frontier**; implementation: **Frontier**.

- Add complete additive pick ranges to `IndexedWallMesh`, including sections,
  opening reveals/jambs, and deterministic bridge ownership.
- Pass metadata through the Three adapter without creating geometry groups.
- Build the triangle reverse index once per mesh generation.
- Tag floor/ceiling/object meshes and render qualified interior-anchor helpers.
- Test every emitted wall triangle has exactly one pick owner.

### 6. Centralize 3D selection

**Execution:** Difficulty **8/10** · Recommended model strength — plan: **Frontier**; implementation: **Frontier+**.

- Replace independent competing Canvas raycast listeners with one editor 3D
  selection coordinator.
- Reuse existing scene/camera hit classification and add layout candidates.
- Apply nearest-visible arbitration, same-depth tie-breaking, helper filtering,
  background clear, and TransformControls event precedence.
- Feed the result into `ActiveEditorSelection` and the unified hierarchy.

### 7. Extract the one gizmo host

**Execution:** Difficulty **9/10** · Recommended model strength — plan: **Frontier+**; implementation: **Frontier+**.

- Extract TransformControls lifecycle/FSM/orbit/snap behavior from the current
  scene-specific component.
- Add scene, camera, and layout target adapters.
- Preserve existing scene/camera transform behavior with regression tests before
  enabling layout targets.
- Apply the locked layout axes, pivots, baseline deltas, and read-only rules.

### 8. Add layout candidate previews and atomic history

**Execution:** Difficulty **8/10** · Recommended model strength — plan: **Frontier+**; implementation: **Frontier+**.

- Add a `layoutGizmoDrag` session containing target identity, immutable baseline,
  current delta, last valid candidate, and derived preview bundle.
- Validate and preflight the full candidate before display/commit.
- Install once and commit one `layout` history entry on pointer-up; no-op skips.
- Escape/pointer cancel/view or domain switch/unmount cancel atomically.
- Rebuild/dispose meshes and reattach the gizmo proxy without retaining old
  render-object identity.

### 9. Integrate project-local asset import and placement

**Execution:** Difficulty **10/10** · Recommended model strength — plan: **Frontier+**; implementation: **Frontier+**.

- Extend the package asset manifest/store for GLBs under a focused sub-plan.
- Add import to the 3D Assets panel, composite registry lookup, shared loader,
  ghost placement, scene entity commit, cleanup, and package round-trip.
- Imported and catalogue scene entities use the existing scene gizmo adapter.
- Reject unsafe/unsupported files with structured feedback and no partial asset
  registration.
- **C1 decision (post-H1 staging, C2 rejected):** the composite asset registry
  is scene-only — catalogue and project-local ids resolve for scene entities
  only; layout asset objects (`LayoutObject.kind: 'asset'`) are rejected. The
  manifest persists **no** footprint fields: catalogue footprints are authored
  `MuseumAsset.footprint` metadata, and imported footprints are derived from
  loaded model world-AABBs at render time by the post-H1 Plan staging slice
  (C1), session-cached, never serialized.

### 10. Fold camera authoring into 3D

**Execution:** Difficulty **5/10** · Recommended model strength — plan: **Balanced**; implementation: **Balanced**.

- Move Camera tree/timeline/tool entry points into the unified 3D shell.
- Preserve route/motion ownership, helper selection, framing, timing, playback,
  reduced motion, and mutation locks.
- Reuse camera authoring behavior inside new 3D shell; do not migrate old Camera
  workspace/session state.
- Confirm Plan exposes no camera mutation path.

### 11. Project round-trip and regression closure

**Execution:** Difficulty **7/10** · Recommended model strength — plan: **Frontier**; implementation: **Frontier**.

- Export one portable project containing layout, scene, textures, and
  project-local GLBs; import it into a fresh editor session.
- Version H1 project/package format. Import H1 output and future explicit
  migrations only; reject legacy/Chopin payloads without changing session.
- Verify Plan/3D parity, fresh import history/selection, asset bytes, camera
  playback, resource disposal, and visitor isolation.
- Leave the pre-H1 editor, its Canvas, and layout-only 3D interaction code
  frozen at `/museum/editor`; H1 removes nothing from the relic.

### 12. Close the slice

**Execution:** Difficulty **3/10** · Recommended model strength — plan: **Balanced**; implementation: **Balanced**.

- Update `north-star.md`, `architecture.md`, the graphics roadmap,
  `components/shell.md`, `placement.md`, `camera-tour.md`, `persistence.md`,
  `assets.md`, the editor README, and `CURRENT.md`.
- Record the final full-suite/check/build/browser results and the package format
  change, if any.
- No commits unless requested.

## Regression matrix

| Fixture / concern | Required assertion |
|-------------------|--------------------|
| Boot | Editor boots into one empty canonical project and opens Plan, no fake camera/navigation data |
| Plan drafting | Draw room/opening and place rough primitives from an empty project |
| View switch | Plan ↔ 3D preserves the same project, history, dirty state, and valid selection |
| One Canvas | 3D mounts one Canvas containing architecture, scene entities, camera helpers, and one gizmo |
| Wall pick completeness | Every emitted wall triangle maps to one wall/opening identity, including jamb/reveal/bridge faces |
| Depth arbitration | Front wall blocks an object behind it; same-depth helper tie rules are deterministic |
| Layout selection | Room/wall/opening/anchor/object click activates layout domain and syncs tree/inspector |
| Scene selection | Entity/cluster click activates scene domain; existing multi-select behavior remains scoped and valid |
| Camera selection | Node/anchor/view-target click activates camera domain and preserves route/motion behavior |
| Cross-domain selection | Activating one domain detaches the previous gizmo target; never two actionable selections |
| Room gizmo | XZ/Yaw mutates frame, boundary, anchors, and owned layout objects atomically |
| Wall gizmo | XZ translation moves endpoints + owned interior anchors; neighbors remain exactly closed |
| Opening gizmo | Local tangent/scale mapping preserves locked pivot semantics, clamps, and rejects overlap |
| Layout object gizmo | Position/rotation/dimensions mirror inspector; read-only profiles have no gizmo |
| Invalid candidate | Structural, compiled, or mesh issue keeps canonical project and committed meshes unchanged |
| History | One chronological entry per gesture in the correct domain; no-op/cancel adds none |
| Undo/redo | Restores both views and active target safely across interleaved layout/scene/camera edits |
| Invalid project import | Unknown room refs or legacy/Chopin payload reject atomically; current project unchanged |
| Imported GLB | User-selected GLB registers, places, edits, exports, imports, and renders with identical bytes/id |
| Camera in 3D | Author/edit/play camera without leaving 3D; playback mutation locks remain intact |
| Plan camera boundary | Plan has no camera mutation path; optional read-only overlay cannot edit scene data |
| Resource lifetime | Repeated edits/project replacement release old geometry, helpers, object URLs, and decoded model resources |
| Purity | `$lib/layout/**` has no Three/DOM/Svelte imports; no mesh/Object3D state is serialized |
| Visitor isolation | Production visitor bundle contains no editor hierarchy, picking, gizmo, asset-import, or session code |
| Relic isolation | `/museum` (visitor) and `/museum/editor` (pre-H1 editor) keep existing checked-in Chopin data; H1 editor never imports/migrates them |

## Expected files

Conceptually new or extracted:

```text
apps/museum/src/lib/editor/UnifiedProjectTree.svelte
apps/museum/src/lib/editor/Editor3DSelection.svelte
apps/museum/src/lib/editor/gizmo/EditorTransformControlsHost.svelte
apps/museum/src/lib/editor/gizmo/layout-gizmo-adapter.svelte.ts
apps/museum/src/lib/editor/gizmo/scene-gizmo-adapter.svelte.ts
apps/museum/src/lib/editor/gizmo/camera-gizmo-adapter.svelte.ts
apps/museum/src/lib/editor/layout/layout-3d-picking.ts
apps/museum/src/lib/editor/project/empty-project.ts
apps/museum/src/lib/editor/assets/project-asset-store.svelte.ts
```

Primary edits:

```text
apps/museum/src/lib/editor/MuseumEditorApp.svelte
apps/museum/src/lib/editor/EditorAppBar.svelte
apps/museum/src/lib/editor/EditorViewport.svelte
apps/museum/src/lib/editor/EditorLeftSidebar.svelte
apps/museum/src/lib/editor/EditorInspector.svelte
apps/museum/src/lib/editor/EditorViewportToolbar.svelte
apps/museum/src/lib/editor/EditorCameraTimelineFrame.svelte
apps/museum/src/lib/editor/EditorTransformControls.svelte
apps/museum/src/lib/editor/museum-editor.svelte.ts
apps/museum/src/lib/editor/store/session-state.svelte.ts
apps/museum/src/lib/editor/store/selection-store.svelte.ts
apps/museum/src/lib/editor/layout/LayoutPreviewScene.svelte
apps/museum/src/lib/editor/layout/layout-interaction.ts
apps/museum/src/lib/editor/layout/layout-preview-state.svelte.ts
apps/museum/src/lib/layout/wall-mesh-builder.ts
apps/museum/src/lib/render/wall-geometry-adapter.ts
apps/museum/src/lib/editor/EditorAssetLibrary.svelte
apps/museum/src/lib/editor/export/package-exporter.ts
apps/museum/src/lib/editor/import/package-importer.ts
```

Exact files may consolidate. Boundaries that may not collapse are: active
selection ownership, complete layout pick identity, the single gizmo host with
domain adapters, full candidate validation, and project-local asset lifetime.

## Verification

Automated:

```text
npm test -w @portfolio/museum
npm run check -w @portfolio/museum
npm run build -w @portfolio/museum
```

Required integration/browser coverage:

- actual Three raycasts against indexed, grouped wall buffers for section,
  reveal, lintel, bridge, floor, ceiling, anchor helper, and object hits;
- pointer lifecycle for TransformControls mouseDown/objectChange/mouseUp,
  Escape, pointer cancel, view switch, selection switch, and unmount;
- orbit-control disable/restore and gizmo event precedence;
- Plan → 3D → Plan project identity and history;
- unified hierarchy selection/accessibility for cross-valid H1 projects;
- user GLB import/place/export/re-import and object-URL cleanup;
- camera authoring/playback in unified 3D;
- `/museum` visitor and `/museum/editor` pre-H1 editor relic smoke tests, unchanged by H1 editor work.

Manual product QA:

1. Open the app — the editor boots into an empty Plan.
2. Draw two connected rooms in Plan, add openings, and place rough primitives.
3. Switch to 3D; confirm the generated architecture is the same project.
4. Pick and refine a room, wall, opening, anchor, and layout object with one
   contextual gizmo.
5. Import a GLB, place it from Assets, and transform it in the same 3D view.
6. Add camera nodes, edit a route/view, and play director/visitor preview without
   changing workspace.
7. Interleave layout, scene, and camera edits; undo/redo in chronological order.
8. Export the portable project, start a fresh session, import it, and confirm
   Plan, 3D, assets, and camera tour round-trip.
9. Repeat edits/imports and confirm no retained geometry, helper, material,
   decoded model, or object-URL growth.

## Post-H1 polish slices (locked)

### C1 — Plan staging mode (2D furnishing)

Focused plan: [`2026-08-14-graphics-h1-c1-plan-staging.md`](./2026-08-14-graphics-h1-c1-plan-staging.md).

The Sweet Home 3D-style experience ships as a post-H1 polish slice: scene
entities become visible and editable in Plan through a dedicated tool mode.
C2 (catalogue assets as layout objects, `LayoutObject.kind: 'asset'`) is
rejected in favor of C1 — furniture stays in `project.scene`.

- `PlanViewMode: 'layout' | 'staging'`: layout mode is CAD as today (scene
  entities render as faint dashed layer-5.5 outlines, passive spatial
  context); staging mode selects/mutates scene entities in Plan.
- Staging selection activates the scene domain — the one amendment to the
  "Plan selection always activates the layout domain" policy. S3's
  `ActiveEditorSelection` machinery is domain-generic; no H1 rework is needed.
- 2D mutations write `position[0]/[2]` + yaw only; `position[1]` (elevation)
  is preserved. One tagged `scene` history entry per completed gesture.
- Plan never loads GLBs: rendering + hit-testing use footprint polygons via a
  pure 2D point-in-polygon resolver. Catalogue footprints come from authored
  `MuseumAsset.footprint` metadata; imported footprints are derived from the
  loaded model's world AABB at render time and session-cached — never a
  manifest field. Snapping reads `LayoutDocument`, writes only `SceneDocument`.
- Room drag (B3) does not relocate scene entities in the first slice (Alpha);
  out-of-polygon content is flagged by the existing collision/placement
  warnings. Coordinated room+furniture relocation (Beta) is a multi-domain
  atomicity project, explicitly out of scope.
- H1 dependencies: none hard. Path A (read-only layer-5.5 projection) is the
  H1-era interim and is reused by C1. S9 stays scene-only and persists no
  footprint fields.

## Exit criteria

H1 is complete only when:

- the app supports boot-into-empty Plan → generated 3D → asset placement →
  camera authoring → portable export/import as one continuous project flow;
- Plan and 3D are the only top-level editor views; Scene, Camera, and isolated
  Layout-3D are no longer separate workspaces;
- unified 3D uses one Canvas, one active selection domain, one hierarchy, one
  contextual inspector, and one TransformControls host;
- layout, scene, and camera gizmo targets dispatch to their existing ownership
  domains and produce exactly one correctly tagged history entry per gesture;
- every layout wall triangle—including reveals/jambs and bridges—has complete,
  deterministic authored pick identity;
- layout gizmo candidates validate structurally, geometrically, and through
  full wall-mesh preflight before atomic commit, with no partial mesh state;
- `LayoutDocument` and `SceneDocument` remain separate sources of truth and no
  `THREE.Object3D` transform, generated endpoint, selection, or renderer state is
  serialized;
- a user-imported GLB can be placed and edited in unified 3D and round-trips
  through the portable package without entering scene v6 as binary data;
- camera authoring and playback remain on the one existing route/motion system,
  work entirely in 3D, and preserve mutation/reduced-motion behavior;
- export/import round-trips H1-created projects; import clears history/selection,
  validates the full project atomically, and supports future explicit migrations
  rooted in the H1 format;
- checked-in Chopin `/museum` (visitor) and `/museum/editor` (pre-H1 Scene ·
  Camera snapshot) remain relic experiences and never enter H1 editor
  migration, import, history, selection, or project initialization;
- `/museum` visitor and `/museum/editor` relic experiences stay frozen while
  the editor ships in production; and
- the full test suite, Svelte check, production build, browser interaction suite,
  package round-trip, and resource-lifetime checks pass.

## Explicit non-goals

- camera or tour authoring in Plan;
- merging `LayoutDocument`, `SceneDocument`, or their identity types;
- moving catalogue assets into `LayoutDocument` (rejected — 2D furnishing is
  the post-H1 Plan staging mode C1; see "Post-H1 polish slices");
- making the Three scene graph or gizmo proxy authoritative data;
- a second gizmo, camera graph, route, motion system, or geometry compiler;
- Blender-style arbitrary mesh/vertex/face editing, sculpting, or real-time CSG;
- room scale/resize or wall rotate/scale in H1;
- automatic room adjacency or ownership inferred from coordinates;
- auto-generating a camera tour from the floor plan;
- multi-story authoring;
- importing or migrating checked-in Chopin project data, legacy editor workspace
  state, legacy selection, or history into H1;
- independent layout-only import or transient layout/scene divergence in H1;
- serializing binary GLBs inside `MuseumProject`/`SceneDocument` JSON;
- replacing Three/Threlte or adding a new production renderer; and
- hiding the editor behind a build flag; the editor ships in production
  builds.
