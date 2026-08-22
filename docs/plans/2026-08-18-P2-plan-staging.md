# P2 — Plan staging mode (umbrella)

**Date:** 2026-08-18
**Status:** Approved — umbrella; scope unchanged from the approved C1 plan. Execution decomposition and review findings expanded 2026-08-21.
**Tracker:** [`docs/plans/README.md`](README.md) — **P2**, depends on: P1
**Canonical specs (2026-08-19):** [`Design-shell-specs.md`](../Design-specs/Design-shell-specs.md)
(shell/workspace exposure) · [`Design-specs.md`](../Design-specs/Design-specs.md)
(UI design system). P2 is a **workspace-local mode inside Scene → Plan**, not a
new workspace; §B records the shell-conformance reconciliation.
**Folded source (2026-08-18, content preserved; original deleted):** §A — the
approved C1 plan (Plan Staging Mode, approved 2026-08-17, direction locked,
C2 rejected).

## Outcome

Place and edit scene furniture directly in **Plan** (2D furnishing): authored
and derived footprints projected to a layer-5.5 read-only outline, a staging
tool + selection domain, and 2D drag/rotate/delete routed to the existing
scene mutators with one tagged `scene` history entry per gesture.

**v1 scope boundary (locked):** Path A visibility + staging *edit* only. 2D
ghost *placement* of new furniture from Plan is a follow-up slice, not part of
the approved execution spec.

## Increments (map to §A's phases; refined at scheduling)

| ID | Content | §A phase | Depends |
|---|---|---|---|
| **P2.1** | `MuseumAsset.footprint` metadata + `plan-scene-footprint.ts` passive projection (layer-5.5 dashed outlines, read-only) | 1 (Path A) | P1 |
| **P2.2** | Staging tool (`PlanViewMode: 'layout' \| 'staging'`) + `plan-scene-hit.ts` + scene-domain selection | 2 | P2.1 |
| **P2.3** | 2D scene mutations: drag/rotate/delete via existing mutators, tagged `scene` history entries + universal-history wrap (`beginLayoutTransaction`/`commitLayoutTransaction`) | 3 | P2.2 |
| **P2.4** | Invariants + regression documentation (B3 room-drag as designed; component docs update) | 4 | P2.3 |

### Proposed execution subslices (2026-08-21)

The umbrella increments remain the scheduling units. The following smaller
sub-slices make the approved work implementation-ready without changing scope:

| Sub-slice | Content | Exit signal |
|---|---|---|
| **P2.1a** | Lock footprint data contract: `MuseumAsset.footprint`, optional authored outline, model/primitive/light rules, and the effective scale source (uniform plus session-resolved `scaleVector`). | Metadata validates; scale source is shared with Scene 3D. |
| **P2.1b** | Implement pure catalogue and primitive footprint projection from the live Scene document; include translation, yaw, scale, drop-Y, rotation, and per-kind tests. | Projection tests are green and never read the boot-time preview scene copy. |
| **P2.1c** | Add passive scene primitives to the shared Plan render model at layer 5.5; render faint dashed outlines with no selection or mutation authority. | Layout mode shows context without activating Scene selection. |
| **P2.2a** | Add Scene Plan-local `PlanViewMode: 'layout' | 'staging'` and an explicit contextual `Layout | Staging` control; keep global `Scene | Camera` and `Plan | 3D` unchanged. | Mode is visible, session-local, and absent from Camera Plan. |
| **P2.2b** | Add isolated scene-footprint hit testing and route active selection through canonical Scene identity; enforce mode-specific hit priority. | Layout selects architecture; Staging selects supported scene entities. |
| **P2.2c** | Add the Layout → Staging hover bridge, keep `Hierarchy | Assets` available in Scene Plan, and gate camera/tour overlays and controls out of Staging. | No misleading tools, duplicate staging hierarchy, or Camera leakage. |
| **P2.3a** | Add direct Staging X/Z drag through existing Scene mutators; preserve Y, pitch, roll, and other 3D-only state. | Drag preview and commit update only horizontal placement. |
| **P2.3b** | Add selected-footprint rotation arm with center pivot, positive-Y yaw, continuous rotation, and Shift 15° snap. | Handle rotation and numeric yaw have identical results. |
| **P2.3c** | Route staging Inspector fields and Delete/Backspace through the Scene domain; preserve the full 3D Inspector in Scene 3D. | Inspector is mode-correct; deletion is one Scene command. |
| **P2.3d** | Wrap staging gestures and every existing Plan layout mutation path in the correct transaction (`scene` or `layout`) and close no-op/cancel behavior. | One completed gesture produces one correctly tagged history entry. |
| **P2.4a** | Add pure hit, transform, selection-continuity, Y-preservation, overlap, bridge, and history regression tests. | P2 acceptance matrix passes. |
| **P2.4b** | Record the B3 room-drag rule, update placement/component handoff docs, and hand P3 the visual deviation register. | P2 is behavior-complete and ready for visual QA. |

## Gates

- **P1 close** — plan staging starts after the camera overhaul lands.

## Boundaries

- Inherits the **P1.1 domain×view shell** and the **P1.5 backdrop/hit-test
  discipline** (Plan stays read-only as a domain; staging never commits a
  layout selection).
- Baked catalogue materials for v1 — no per-instance material overrides
  (forward-compatible: furniture stays in `SceneDocument`).
- Scale is part of the projection: translate → rotate(yaw) → scale (uniform +
  independent `scaleVector`), matching the 3D world transform.
- Non-goals (from §A): no `LayoutDocument`/`SceneDocument` merge, no C2
  (catalogue assets as layout objects), no lights/cameras/materials in layout,
  no GLB loading or 3D hit-testing in Plan, no compound room + furniture
  relocation, no Plan camera mutation.

## Definition of done (P2 close)

- Footprint projection pure-module tests (catalogue + derived) green;
  staging interactions + history-tag assertions pass; suite green,
  `svelte-check` 0, build clean; tracker marks **P2 shipped**.

---

## B — Shell & workspace amendments (2026-08-19)

Reconciles P2 with the canonical shell/workspace specification
([`../Design-specs/Design-shell-specs.md`](../Design-specs/Design-shell-specs.md),
"exposure") and the UI design system
([`../Design-specs/Design-specs.md`](../Design-specs/Design-specs.md),
"visual"). Conformance targets on P2 close: shell-spec §6 (Scene → Plan),
§22 (capability matrix), §24 (review targets).

### Core decision

P2 introduces **no new domain and no new Plan/3D view**.
`PlanViewMode: 'layout' | 'staging'` is a workspace-local authoring mode inside
**Scene → Plan**, below the domain × view axes:

```text
Scene
├─ Plan
│  ├─ Layout   → edit architecture
│  └─ Staging  → arrange existing scene objects in 2D
└─ 3D          → fully author scene objects in 3D
```

Staging is not a fifth workspace and must not appear beside `Scene | Camera`
or `Plan | 3D`.

### Product definition

Scene Plan redefines from "build space" to **"author the museum spatially in
2D"** — Layout mode builds/edits architectural space; Staging mode arranges
existing scene furniture and objects.

### P2 contracts (folded)

- **P2-A — local mode.** `PlanViewMode: layout | staging` is Scene → Plan-local
  and does not alter the top-level Scene/Camera × Plan/3D shell.
- **P2-B — visible mode control.** An explicit `Layout | Staging` state lives
  in the Scene Plan contextual toolbar (or equivalent local-mode surface);
  not hover-only or implicit. Architecture tools must not remain misleadingly
  active while Staging owns pointer authority; movement stays direct
  manipulation and v1 adds no permanent Move/Rotate tools.
- **P2-C — hit-test priority.** Mode decides pointer authority: Layout → layout
  hit wins; Staging → scene-footprint hit wins; architecture is not selected
  by ordinary staging clicks.
- **P2-D — inspector.** Reuse the canonical Scene Inspector shell with a
  Plan-staging surface (X, Z, yaw); Y/elevation is shown as preserved 3D state.
  Current scale is visible and the projection respects it, but the surface
  must not imply a Plan scaling gesture that P2 v1 does not define.
- **P2-E — Asset Library scope.** v1 staging applies to existing placed Scene
  entities; selecting an unplaced catalogue asset does not begin Plan placement.
  Catalogue-driven staging auto-activation for new placement is deferred with
  2D ghost placement.
- **P2-F — mode transitions.** Entering/leaving Staging does not create a
  document mutation or change the selected entity; Scene selection may be
  remembered when returning to Layout; Scene Plan ↔ Scene 3D preserves entity
  identity/selection. `layout | staging` is remembered for the editor session,
  is Scene Plan-scoped (never global), and never carries into Camera Plan.
- **P2-G — staging visualization.** Four footprint states: passive,
  bridge-hover, active staging, selected (+ rotate handle).
- **P2-H — architecture authority.** Architecture stays visible and usable as
  snap/spatial context in Staging but accepts no normal selection or mutation
  until Layout is restored.
- **P2-I — scaling boundary.** Scale affects footprint projection; P2 v1 adds
  no Plan scaling gesture.
- **P2-J — hierarchy.** Scene → Plan continues `Hierarchy | Assets`; no
  dedicated staging sidebar. Hierarchy represents both architecture and placed
  Scene content as normal project structure without duplicating objects into a
  separate "Staging Objects" list; selection follows mode authority.
- **P2-K — staging content scope.** Camera/tour content — camera nodes, camera
  graph, guided sequence, timeline, framing — is not part of Plan staging;
  lights have no interactive footprint in P2 v1.

### Review baseline and deviations carried into execution (2026-08-21)

The following findings were recorded against the live editor before the P2
slice was implemented. They are requirements or implementation risks, not
permission to broaden the approved scope:

- `PlanWorkspace` currently mounts a Layout-only toolbar and
  `LayoutPlanViewport`; there is no `PlanViewMode` or visible `Layout |
  Staging` control.
- `LayoutInteractionState` currently owns only the global `plan | 3d` view,
  layout tools, and `LayoutSelection`. The active-selection facade is already
  domain-generic, but no Scene Plan staging path feeds it.
- `PlanSvg`/`buildPlanRenderModel` currently receive layout geometry plus
  camera/interaction projections; no live Scene entity footprint projection,
  scene hit resolver, or Scene Plan mutation route exists.
- `EditorInspector` still communicates that Plan is layout-only and routes
  scene transforms to 3D. It must be changed only for the approved staging
  surface; Scene Plan must not expose full 3D rotation or a Plan scale gesture.
- `EditorSidebar` exposes `Hierarchy | Assets` only in Scene 3D in the review
  baseline, while the canonical Scene Plan contract requires both tabs. The
  Asset Library remains browse-only for unplaced assets in P2.
- The existing Plan tour-overlay preference must be mode-gated so Staging
  cannot expose Camera/tour authoring content.
- Several legacy Plan opening/layout-object handlers call preview mutators
  directly while room-unit movement uses an explicit layout transaction. P2.3d
  must audit and wrap every create/move/delete/resize path, not only staging.
- The persisted Scene transform currently has a scalar `scale`; independent
  scale vectors are editor-session state in the current schema. P2.1a must
  use the effective Scene 3D transform for projection and must not imply that
  session-only scale survives serialization until the schema is upgraded.
- The blank document and tree hint exist, but the complete `Empty-plan.png`
  onboarding treatment remains a P3 visual QA item.
- Scene 3D gizmo, selection-color, object-outline/layout-box, and upper-right
  XYZ box visual treatment belongs to cosmetic P3. The interactive orientation
  box (camera response, click-to-snap, no drag rotation) belongs to post-P3
  **P3B**. P2 must not add 3D gizmo behavior or Plan scaling while solving
  staging.

### Selection & mutation authority

| Mode | Workspace | Selection authority | Mutates |
|------|-----------|--------------------|---------|
| Layout | Scene → Plan | `LayoutDocument` | rooms/walls/doors/windows/openings/dimensions |
| Staging | Scene → Plan | `SceneDocument` | X/Z + yaw of existing scene entities; delete |

This is intentional, not domain leakage: the user stays in Scene throughout;
the local mode selects which Scene-owned document layer accepts selection and
mutation. Staging preserves `position Y` and other 3D-only state exactly.

### History

One user gesture = one undo entry, tagged to the actually-mutated document:
staging drag/rotate/delete = one `scene` entry; layout ops stay layout-tagged.
No gesture may produce a layout + scene entry pair or hidden architecture
mutations. Room drag (Layout) relocates only `LayoutDocument` rooms and owned
layout objects — Scene furniture stays at world X/Z.

### Shell-spec deltas (Shell-A … Shell-J)

Applied to `Design-shell-specs.md` on 2026-08-19 (§1, §6, §16, §19, §22–§25,
§28–§31); P2 treats them as conformance requirements:

- **Shell-A** — Scene Plan = 2D scene authoring with Layout + Staging modes.
- **Shell-B** — workspace-local mode as third-level routing beneath domain/view.
- **Shell-C** — Scene objects passive/context in Layout, editable in Staging.
- **Shell-D** — selection authority defined independently of workspace identity.
- **Shell-E** — contextual toolbar routed by local mode.
- **Shell-F** — Scene Plan Inspector routing for staging selections.
- **Shell-G** — hit-testing authority by mode.
- **Shell-H** — staging footprint states + rotate-handle behavior.
- **Shell-I** — Scene Plan ↔ Scene 3D selection continuity.
- **Shell-J** — room-drag/furniture non-relocation as explicit workspace truth.

### Revised capability matrix

| Capability | Scene Plan — Layout | Scene Plan — Staging | Scene 3D | Camera Plan | Camera 3D |
| --- | --- | --- | --- | --- | --- |
| Architecture editing | Yes | No | contextual | No | No |
| Architecture context | Yes | Yes | Yes | Yes | Yes |
| Scene furniture visible | Yes | Yes | Yes | contextual | contextual |
| Scene furniture select | No via footprint | Yes | Yes | No | No |
| Scene X/Z edit | No | Yes | Yes | No | No |
| Scene Y edit | No | No | Yes | No | No |
| Scene yaw edit | No | Yes | Yes | No | No |
| Scene full rotation | No | No | Yes | No | No |
| Scene scaling | No | No in P2 v1 | Yes | No | No |
| Add scene asset | existing workflows only | no 2D placement in P2 v1 | Yes | No | No |
| Camera graph edit | No | No | No | Yes | Yes |
| Camera framing | No | No | No | No | Yes |
| Camera timeline | No | No | No | Yes | Yes |

### Codebase review additions (on P2 close)

- `PlanViewMode` is Scene Plan-local and does not alter global domain/view semantics.
- `layout | staging` persists across Scene Plan ↔ Scene 3D for the editor session and never carries into Camera Plan.
- Layout and Staging do not compete for normal click selection.
- Passive footprint projection does not itself activate Scene editing.
- Staging resolves to canonical Scene entity identity.
- Only X/Z/yaw change during staging; Y survives exactly.
- Inspector does not expose misleading unsupported Plan operations.
- One completed staging gesture = one tagged `scene` history entry.
- Staging snap/read access to layout never commits layout mutations.
- Layout room motion never silently moves Scene furniture.
- Scene Plan ↔ Scene 3D creates no duplicate Scene selection state.
- No P2 staging code path mutates Camera-domain data.

---

## A — Source: C1 — Plan Staging Mode (approved 2026-08-17), folded

## C1 — Plan Staging Mode (2D Furnishing)

Polish slice: place and edit scene furniture directly in Plan.

**Date:** 2026-08-14
**Status:** Approved (2026-08-17) — direction locked (C2 rejected); execution-spec revision below; not scheduled — H1 lands first, all C1 work (including Path A) starts after the H1 gate
**Parent:** [`2026-08-14-graphics-h1-unified-3d-editing.md`](../archive/plans/pre-h1-letters/2026-08-14-graphics-h1-unified-3d-editing.md) (polish slices) · [`2026-08-13-graphics-architecture-roadmap.md`](../archive/plans/pre-h1-letters/2026-08-13-graphics-architecture-roadmap.md)
**Handoff:** [`../hand-off/CURRENT.md`](../hand-off/CURRENT.md)

> **Why this plan exists.** The umbrella plan locks 2D furnishing as the
> "Plan staging mode" (C1) and rejects C2 (catalogue assets as layout
> objects). This is the focused slice plan for C1. It is a design record, not
> an implementation-ready plan; the phases below are sketches refined by the
> approved execution-spec revision (2026-08-17) and finalized when C1 is
> scheduled.

## Revision (2026-08-17) — approved execution spec amendments

The 2026-08-17 review approved the C1 direction and locked **baked catalogue
materials for v1** (no per-instance material overrides on furniture in this
slice; forward-compatible because furniture stays in `SceneDocument`). Four
execution-spec amendments from that review are folded into the phases below:

1. **Scaled footprints.** The layer-5.5 projection applies each entity's
   placement scale (uniform + independent `scaleVector`) in addition to
   translation + yaw — a 2×-scaled model has a 2× footprint.
2. **Per-kind footprint rules.** Models use authored `MuseumAsset.footprint`
   × scale; primitives derive footprints from dimensions × scale (no GLB,
   no metadata); lights render no footprint in v1.
3. **2D rotation gesture.** Staging rotation uses a footprint rotate handle
   (B3 rotation-arm pattern) with Shift 15° snap and inspector numeric yaw
   parity.
4. **Staging-mode delete coverage.** Delete in staging mode commits exactly
   one tagged `scene` history entry, mirroring the layout-side history fix.

## Summary

Give the editor the Sweet Home 3D experience — drag a catalogue (or imported)
item onto the 2D floorplan, move/rotate it with 2D handles, see it update in
the 3D view — **without** merging `LayoutDocument` and `SceneDocument`. Scene
entities stay in `project.scene`; Plan gains a `layout | staging` tool mode
plus a read-only footprint projection of scene content.

## Why C1 (locked rationale)

Three validated pillars (verified against the codebase):

1. **Visitor invariant.** `/museum` renders architecture from layout
   (`LayoutMuseumShell` ← `CompiledLayoutGeometry`) and everything else from
   scene (`MuseumEntities` ← `project.scene`). Layout objects are editor-only
   (`LayoutPreviewScene`). C1 gets visitor rendering of staged furniture for
   free; C2 would require new visitor support for layout-referenced assets.
2. **Content engine gravity.** `SceneDocument` already owns materials
   (`materialInstanceId`), lights, camera/tour, clusters. Keeping furniture in
   scene avoids duplicating that machinery into `LayoutDocument`.
3. **Asset uniformity.** Catalogue and user-imported models both enter the
   system as `SceneModelEntity`; C1 gives both one staging, projection, and
   mutation path in Plan.

C2 (catalogue assets as layout objects, `LayoutObject.kind: 'asset'`) is
**rejected**: it reverses the locked "ownership remains separate" decision,
needs new visitor rendering, and splits catalogue vs imported behavior by
origin.

## Product model

```text
PlanViewMode
  ├─ 'layout'   CAD as today (rooms / walls / openings / layout objects)
  │              scene entities render as faint dashed layer-5.5 outlines
  └─ 'staging'  scene entities selectable + mutable in Plan
                  (catalogue auto-activation for unplaced assets deferred —
                  §B P2-E)
```

- Staging selection activates the **scene** domain — the one amendment to the
  "Plan selection always activates the layout domain" policy. S3's
  `ActiveEditorSelection` machinery is domain-generic; no H1 rework.
- 2D mutations write `position[0]/[2]` + yaw (`rotation[1]`) only;
  `position[1]` (elevation) is preserved — a lamp raised onto a table in 3D
  stays raised when dragged in 2D.
- One tagged `scene` history entry per completed gesture (pointerup commit) —
  parity with 3D gizmo drags.
- Plan never loads GLBs. Rendering + hit-testing use footprint polygons:
  catalogue footprints from authored `MuseumAsset.footprint` metadata;
  imported footprints derived from the loaded model's world AABB at render
  time, session-cached, never serialized.
- Snapping reads `LayoutDocument` (walls / corners / rooms), writes only
  `SceneDocument`.
- Low-friction mode bridges: hovering a scene entity in layout mode offers a
  1-click "switch to staging" affordance (→ staging + select the hovered
  entity). Catalogue-driven staging auto-activation for *unplaced* assets is
  deferred with 2D ghost placement (§B P2-E): in v1, staging applies to
  existing placed Scene entities only.

## Room drag (B3) — locked policy

- **Alpha (v1, locked):** room drag relocates `LayoutDocument` rooms and owned
  layout objects only (`transformLayoutRoomUnit`); scene entities keep world
  X/Z. Out-of-polygon furniture is flagged by the existing
  collision/placement warnings. This desync already exists in the editor today;
  C1 surfaces it, it does not create it.
- **Beta (explicitly out of scope):** coordinated room + furniture relocation
  is a multi-domain atomicity project — it conflicts with the domain-tagged
  history contract ("undo/redo restores only the touched document") and is
  classified Frontier+. Documented as expected behavior, not a bug.

## Phases

### Phase 1 — Metadata & passive projection (Path A)

- Author `MuseumAsset.footprint: { width, depth, height }` (+ optional
  `footprintOutline: LayoutVec2[]`) from the existing `notes` text.
- `plan-scene-footprint.ts` — pure projection module: reads the **live
  editor scene document** (the store's authoritative `SceneDocument` — never
  `layoutPreview.project.scene`, a boot-time copy that never syncs with scene
  edits, mirroring the room-delete policy) → layer-5.5 renderable vector
  model (sibling of `plan-camera-projection.ts`; drop Y).
- **Per-kind footprint rules (locked):**
  - **Model entities** → authored `MuseumAsset.footprint` × placement scale,
    rotated by `rotation[1]` (yaw).
  - **Primitive entities** (box / cylinder / sphere) → footprint derived from
    `dimensions` × placement scale (rectangle / circle / ellipse; no GLB, no
    metadata needed).
  - **Light entities** → no footprint in v1 (non-interactive; a tiny marker
    is a later enhancement, never a pick target).
- **Scale is part of the projection (amendment 1):** the transform chain is
  translate → rotate(yaw) → scale (uniform + independent `scaleVector`),
  matching the 3D world transform — a scaled model's footprint scales.
- Render layer 5.5 as faint dashed outlines — passive spatial context in
  layout mode. Read-only: no selection, no mutation.

### Phase 2 — Staging tool & selection domain

- Add `PlanViewMode: 'layout' | 'staging'` to Plan tool state (a
  `LayoutDraftTool`-style entry; catalogue drawer auto-switches).
- `plan-scene-hit.ts` — pure 2D point-in-polygon resolver over transformed
  footprints, active only in staging mode; isolated from `plan-hit.ts`.
- Staging selection activates the scene domain (`ActiveEditorSelection`).
- Hover/click bridge in layout mode.

### Phase 3 — 2D scene mutations

- Route 2D drag gestures to existing scene mutators: X/Z + yaw, preserve
  `position[1]`; commit one tagged `scene` history entry per gesture
  (`beginDocumentTransaction` → mutator → `commitDocumentTransaction` on
  pointerup; cancel restores). No new mutation machinery.
- **Rotation gesture (amendment 3):** a rotate handle on the selected
  footprint, following the B3 room rotation-arm pattern — pivot at the
  footprint center, continuous positive-Y rotation, Shift snaps to 15°;
  inspector numeric yaw is parity (mirrors B3 "Rotate by (°)").
- **Delete coverage (amendment 4):** Delete/Backspace in staging mode and
  the inspector delete path each commit exactly one tagged `scene` history
  entry — the same transaction wrap as drags. The layout-side analogue
  (layout-object create/move/delete/resize) gets the identical
  `beginLayoutTransaction`/`commitLayoutTransaction` wrap in the same slice:
  the universal-history fix closes the Plan-side gap on both sides.

### Phase 4 — Invariants & regression documentation

- Document the B3 room-drag behavior (Alpha) as designed behavior.
- Update `components/placement.md`, north-star, and CURRENT.md when C1 lands.

## Footprint sources (locked)

| Asset origin | Footprint source | Persisted? |
|---|---|---|
| Catalogue (`MuseumAsset`) | Authored `footprint` metadata | In the asset manifest (not the package) |
| Imported project-local GLB | Derived from loaded model world AABB at render time | No — session-cached |

## Dependencies / gates

- **Scheduling (locked 2026-08-17):** H1 lands first. All C1 work —
  including Path A (Phase 1) — starts only after the H1 gate closes. C1
  stays approved and is re-registered under the plan-tracking system
  (letter families archived; see the CURRENT.md note). The ordering is
  sequencing discipline, not a technical gate — the document side has no
  hard H1 dependency.
- Imported-in-staging requires S9's scene-only composite registry (already
  locked: the package manifest persists no footprint fields).
- S3 stays generic; the staging → scene-domain line is added when Phase 2
  lands.

## Open questions (resolve when C1 is scheduled)

- Imported footprints: derived-lazily is locked, but confirm no import-time
  persistence is wanted for offline/round-trip stability.
- ~~Staging selection priority vs layout content when footprints overlap~~ —
  **resolved by §B P2-C:** mode decides hit authority (Layout → layout wins;
  Staging → scene footprint wins).
- ~~Inspector surface in staging mode: reuse the scene inspector, or a
  Plan-staging variant~~ — **resolved by §B P2-D:** reuse the canonical Scene
  Inspector with a Plan-staging property surface.
- Whether the faint layer-5.5 outlines need a toggle (drafting vs staging
  density).
- **Scope boundary (locked for this slice):** C1 v1 is Path A visibility +
  staging *edit* only. 2D ghost *placement* of new furniture from Plan
  ("2D → Add a box, desk, table → ghost outline") is a follow-up slice, not
  part of the approved execution spec. (Reaffirmed by §B P2-E.)

## Non-goals

- Merging `LayoutDocument` / `SceneDocument` or their identity types.
- C2 — catalogue assets as layout objects (rejected).
- Moving lights, cameras, materials, clusters, or tour data into layout.
- GLB loading or 3D hit-testing in Plan.
- Beta — compound room + furniture relocation.
- Plan camera mutation (unchanged from H1).

## Verification (sketch)

- Footprint projection: pure-module tests for catalogue + derived footprints,
  **scale-aware** transforms (uniform + independent), rotation-aware
  transforms, drop-Y parity, and per-kind rules (model / primitive / light).
  The projection reads the live editor scene document, not the preview copy.
- Hit resolver: point-in-polygon unit tests incl. overlap and rotation;
  inactive in layout mode (pass-through to `plan-hit.ts`).
- Mutation: X/Z + yaw only, Y preserved; **rotate-handle gesture with 15°
  Shift snap**; one `scene` history entry per drag, rotate, and **delete**
  gesture; parity with the 3D placement commit path.
- History: Ctrl+Z after a staging drag/rotate/delete restores
  `SceneDocument` in one step; the layout-side object fix restores
  `LayoutDocument` in one step.
- Visitor invariance: staging edits render in `/museum` unchanged.
- Mode bridges: drawer auto-activate, hover affordance.
