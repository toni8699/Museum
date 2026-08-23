# P2 — Plan staging mode (umbrella)

**Date:** 2026-08-18
**Status:** In progress — P2.1 shipped 2026-08-23; umbrella scope unchanged from the approved C1 plan. Execution decomposition and review findings expanded 2026-08-21.
**Tracker:** [`docs/plans/README.md`](README.md) — **P2**, depends on: P1 + P9
**Canonical specs (2026-08-19):** [`Design-shell-specs.md`](../Design-specs/Design-shell-specs.md)
(shell/workspace exposure) · [`Design-specs.md`](../Design-specs/Design-specs.md)
(UI design system). P2 is a **workspace-local mode inside Scene → Plan**, not a
new workspace; §B records the shell-conformance reconciliation.
**Folded source (2026-08-18, content preserved; original deleted):** §A — the
approved C1 plan (Plan Staging Mode, approved 2026-08-17, direction locked,
C2 rejected).

## Outcome

View and edit already-placed Scene objects directly in **Plan** (2D staging):
authored and derived footprints projected to integer render layer 6, a
workspace-local staging mode + mode-aware selection authority, and 2D
drag/rotate/delete routed to the existing Scene mutators with one tagged
`scene` history entry per gesture.

**v1 scope boundary (locked):** Path A visibility + staging *edit* only. 2D
ghost *placement* of new furniture from Plan is a follow-up slice, not part of
the approved execution spec.

## Increments (map to §A's phases; refined at scheduling)

| ID | Content | §A phase | Depends |
|---|---|---|---|
| **P2.1** | Footprint contract + room-aware passive Scene projection at integer layer 6 | 1 (Path A) | P1 |
| **P2.2** | `PlanViewMode: 'layout' \| 'staging'` + mode-aware selection + Scene footprint hit testing | 2 | P2.1 |
| **P2.3** | Room-local Scene mutations: drag/rotate/delete via existing mutators, tagged `scene` history entries | 3 | P2.2 |
| **P2.4** | Invariants + regression documentation (B3 room-drag as designed; component docs update) | 4 | P2.3 |

### Proposed execution subslices (2026-08-21)

The umbrella increments remain the scheduling units. The following smaller
sub-slices make the approved work implementation-ready without changing scope:

| Sub-slice | Content | Exit signal |
|---|---|---|
| **P2.1a** | Lock canonical footprint schema, eligibility, outline precedence, and effective scale source (uniform plus session-resolved `scaleVector`). | Metadata validates; invalid/missing model footprints are ineligible. |
| **P2.1b** | Implement pure room-aware projection from live Scene data + footprint source + `LayoutRoomRegistry`; include local/world transforms, yaw, scale, drop-Y, and per-kind tests. | Projection tests are green and never read the boot-time preview scene copy. |
| **P2.1c** | Add passive Scene primitives to shared Plan render model at integer layer 6; render faint dashed outlines with no selection or mutation authority. | Layout/Staging show correct context; Camera Plan has no Scene footprints. |
| **P2.2a** | Add Scene Plan-local `PlanViewMode: 'layout' | 'staging'`, explicit contextual control, and mode-aware active-selection derivation; keep global `Scene | Camera` and `Plan | 3D` unchanged. | Both selection slots survive mode changes; only active authority changes. |
| **P2.2b** | Add isolated scene-footprint hit testing and route active selection through canonical Scene identity; enforce mode-specific hit priority. | Layout selects architecture; Staging selects supported scene entities. |
| **P2.2c** | Add the Layout → Staging hover bridge, keep `Hierarchy | Assets` available in Scene Plan, and gate camera/tour overlays and controls out of Staging. | No misleading tools, duplicate staging hierarchy, or Camera leakage. |
| **P2.3a** | Add Staging drag through existing Scene mutators: Plan-world candidate → room-local X/Z; preserve local Y, pitch, roll, and other 3D-only state. | Drag preview and commit update only horizontal placement. |
| **P2.3b** | Add selected-footprint rotation arm with placement-pivot origin, positive-Y yaw, continuous rotation, and Shift 15° snap. | Handle rotation and numeric yaw have identical results. |
| **P2.3c** | Route staging Inspector fields and Delete/Backspace through the Scene domain; preserve the full 3D Inspector in Scene 3D. | Inspector is mode-correct; deletion is one Scene command. |
| **P2.3d** | Add Staging Scene transaction coverage; regression-test already-shipped Layout history and close no-op/cancel behavior. | One completed staging gesture produces one tagged `scene` entry; layout remains green. |
| **P2.4a** | Add pure hit, transform, selection-continuity, Y-preservation, overlap, bridge, and history regression tests. | P2 acceptance matrix passes. |
| **P2.4b** | Record the B3 room-drag rule, update placement/component handoff docs, and hand P3 the visual deviation register. | P2 is behavior-complete and ready for visual QA. |

### P2.1 close (2026-08-23)

P2.1a–c shipped uncommitted. `Asset.footprint` metadata now validates canonical
dimensions and simple outlines; live Scene projection applies effective uniform
or session scale, entity yaw, room-local translation, and the live room frame;
eligible models and primitives render as passive dashed layer-6 Plan polygons.
Camera Plan receives no Scene projection. P2.2 remains next.

## Gates

- **P1 + P9 close** — plan staging starts after the camera overhaul and
  canonical design reconciliation land. Both gates are shipped.

## Boundaries

- Inherits the **P1.1 domain×view shell** and the **P1.5 backdrop/hit-test
  discipline** (Plan stays read-only as a domain; staging never commits a
  layout selection).
- Baked catalogue materials for v1 — no per-instance material overrides
  (forward-compatible: furniture stays in `SceneDocument`).
- Footprint projection is room-aware: canonical asset-local point → placement
  scale → placement yaw → placement local translation → room frame → Plan
  world X/Z. Matrix form is `Room × T × R × S`; point-operation order is
  scale → rotate → translate → room transform.
- Non-goals (from §A): no `LayoutDocument`/`SceneDocument` merge, no C2
  (catalogue assets as layout objects), no lights/cameras/materials in layout,
  no GLB loading or 3D hit-testing in Plan, no compound room + furniture
  relocation, no Plan camera mutation. Imported GLB footprints remain out of
  scope until P4 provides an imported-bounds registry.

## Definition of done (P2 close)

- Footprint projection pure-module tests (catalogue + derived) green;
  staging interactions + history-tag assertions pass; suite green,
  `svelte-check` 0, build clean; tracker marks **P2 shipped**.
- Scene Plan uses one consistently-positioned, always-visible
  `Layout | Staging` local-mode control in populated, empty, Layout, and
  Staging states; visual target is the canonical `Design-png/README.md`
  Scene Plan set. Camera Plan never mounts this control.

---

## B — Shell & workspace contract

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
  entities only; selecting an unplaced catalogue asset never begins Plan
  placement. New placement remains a later slice with 2D ghost placement.
- **P2-F — mode transitions.** Entering/leaving Staging creates no document
  mutation and clears no selection slot; it only changes which remembered slot
  has active authority. Scene Plan + Layout activates the Layout slot; Scene
  Plan + Staging activates the Scene/workspace slot. The Layout → Staging hover
  bridge is explicit: it switches mode and selects the hovered Scene entity.
  Scene Plan ↔ Scene 3D preserves Scene identity/selection. `layout | staging`
  is remembered for the editor session, is Scene Plan-scoped (never global),
  and never carries into Camera Plan.
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
- **P2-L — footprint eligibility.** Catalogue models require
  `placementSurface === 'floor'` and a valid authored canonical footprint.
  Primitives (`box | plane | cylinder | sphere`) require valid dimensions and
  have no `placementSurface` gate. Lights and imported GLBs are excluded;
  wall/ceiling/surface catalogue models are omitted from the P2 projection.
- **P2-M — footprint schema.** `Asset.footprint` is optional metadata:
  `{ width, depth, outline? }`, in canonical metres after asset normalization,
  relative to placement pivot, with `[x, z]` points and no repeated closing
  point. Either winding is accepted and normalized; concave simple polygons
  are supported. Non-finite, non-positive, or self-intersecting data is invalid
  and does not silently fall back. A valid outline is authoritative; absent
  outline falls back to the width/depth rectangle. `height` is not part of the
  Plan footprint schema. Asset `defaultScale`/`defaultRotation` are already
  represented by canonical metadata and are not applied again by projection.
- **P2-N — deferred interaction gates.** Before P2.2b starts, lock whether
  Staging reuses existing multi-selection or ships single-selection only, the
  deterministic overlap winner, and behavior for a remembered but ineligible
  Scene selection. Before P2.3a starts, lock the shared positional-snap pixel
  tolerance. Translation Shift disables positional snapping; rotation Shift
  enables 15° yaw snapping. Rotation pivot is always the canonical placement
  pivot, not polygon centroid or AABB center.

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
- Layout mutation history is already transaction-wrapped through
  `layout-mutation-runner.ts`; P2.3d adds regression coverage only and must not
  reopen settled layout mutators unless a regression exposes a real gap.
- The persisted Scene transform currently has a scalar `scale`; independent
  scale vectors are editor-session state in the current schema. P2.1a must
  use the effective Scene 3D transform for projection and must not imply that
  session-only scale survives serialization until the schema is upgraded.
- The blank document and tree hint exist, but the complete
  `scene-empty-plan.png` onboarding treatment remains a P3 visual QA item.
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
the local mode selects which Scene-owned document layer has active selection
and mutation authority. Both selection slots remain in session memory; mode
switching changes active authority without clearing either slot. Staging
preserves local `position Y` and other 3D-only state exactly.

### History

One user gesture = one undo entry, tagged to the actually-mutated document:
staging drag/rotate/delete = one `scene` entry; layout ops stay layout-tagged.
No gesture may produce a layout + scene entry pair or hidden architecture
mutations. Room drag (Layout) changes the room frame and owned layout objects;
room-local Scene entities follow that frame in derived world space. The
`SceneDocument` is unchanged and the gesture creates exactly one `layout`
history entry.

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
- **Shell-J** — room-local Scene entities follow the room frame in derived
  world space; room motion does not mutate `SceneDocument`.

### Revised capability matrix

| Capability | Scene Plan — Layout | Scene Plan — Staging | Scene 3D | Camera Plan | Camera 3D |
| --- | --- | --- | --- | --- | --- |
| Architecture editing | Yes | No | contextual | No | No |
| Architecture context | Yes | Yes | Yes | Yes | Yes |
| Scene furniture visible | Yes (eligible footprints) | Yes (eligible footprints) | Yes | No via P2 Scene projection | contextual |
| Scene furniture select | No via footprint | Yes (eligible placements) | Yes | No | No |
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
- Layout room motion changes derived Scene world transforms through the room
  frame, leaves `SceneDocument` unchanged, and creates one `layout` entry.
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

1. **Scaled footprints.** The layer-6 projection applies each entity's
   placement scale (uniform + independent `scaleVector`) after canonical asset
   normalization — a 2×-scaled model has a 2× footprint.
2. **Per-kind footprint rules.** Models use authored `Asset.footprint`
   × scale; primitives derive footprints from dimensions × scale (no GLB,
   no metadata); lights render no footprint in v1.
3. **2D rotation gesture.** Staging rotation uses a footprint rotate handle
   (B3 rotation-arm pattern) with Shift 15° snap and inspector numeric yaw
   parity.
4. **Staging-mode delete coverage.** Delete in staging mode commits exactly
   one tagged `scene` history entry, mirroring the layout-side history fix.

## Summary

View and edit already-placed Scene objects in the 2D floorplan, move/rotate
them with 2D handles, and see the result in 3D — **without** merging
`LayoutDocument` and `SceneDocument`. Scene entities stay in `project.scene`;
Plan gains a `layout | staging` local mode plus a read-only footprint
projection of eligible scene content.

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
3. **Asset uniformity.** Catalogue models and Scene primitives use one staging,
   projection, and mutation path in Plan. Imported GLB bounds remain a P4
   concern until an imported-bounds registry exists.

C2 (catalogue assets as layout objects, `LayoutObject.kind: 'asset'`) is
**rejected**: it reverses the locked "ownership remains separate" decision,
needs new visitor rendering, and splits catalogue vs imported behavior by
origin.

## Product model

```text
PlanViewMode
  ├─ 'layout'   CAD as today (rooms / walls / openings / layout objects)
  │              eligible scene entities render as faint dashed layer-6 outlines
  └─ 'staging'  eligible placed scene entities selectable + mutable in Plan
                  (unplaced assets never auto-activate in P2 v1)
```

- Staging remains inside the **Scene** domain. Scene Plan local mode selects
  active authority: Layout activates the Layout slot; Staging activates the
  Scene/workspace slot. Both slots remain remembered; no mode toggle clears a
  selection slot.
- 2D pointer candidates are Plan-world X/Z and are inverse-resolved through the
  room registry before writing Scene-local `position[0]/[2]` + yaw
  (`rotation[1]`). Local `position[1]` (elevation), pitch, and roll are
  preserved exactly.
- One tagged `scene` history entry per completed gesture (pointerup commit) —
  parity with 3D gizmo drags.
- Plan never loads GLBs. Rendering + hit-testing use footprint polygons:
  catalogue models from authored canonical `Asset.footprint` metadata and
  primitives from dimensions. Imported GLBs are unsupported until P4.
- Snapping reads `LayoutDocument` (walls / corners / rooms), writes only
  `SceneDocument`.
- Low-friction mode bridge: hovering an eligible existing Scene footprint in
  Layout offers a 1-click "Edit in Staging" affordance (→ Staging + select the
  hovered entity). Unplaced catalogue assets never auto-activate or begin Plan
  placement in P2 v1.

## Room drag (B3) — locked policy

- **Alpha (v1, locked):** room drag changes `LayoutDocument` room frames and
  owned layout objects only (`transformLayoutRoomUnit`). Room-local Scene
  entities follow the changed room frame in derived world space;
  `SceneDocument` is unchanged and no Scene history entry is created.
- **Beta (explicitly out of scope):** coordinated room + furniture relocation
  is a multi-domain atomicity project — it conflicts with the domain-tagged
  history contract ("undo/redo restores only the touched document") and is
  classified Frontier+. Documented as expected behavior, not a bug.

## Phases

### Phase 1 — Metadata & passive projection (Path A)

- Add optional canonical `Asset.footprint: { width, depth, outline? }` metadata
  in metres after asset normalization. A valid outline is authoritative;
  absent outline falls back to a pivot-relative width/depth rectangle. Invalid
  model metadata makes the model P2-ineligible; no silent fallback.
- `plan-scene-footprint.ts` — pure projection module. Inputs are the live
  editor `SceneDocument`, footprint source, effective placement scale state,
  and `LayoutRoomRegistry`; it emits a layer-6 renderable vector model
  (sibling of `plan-camera-projection.ts`; drop Y).
- **Per-kind footprint rules (locked):**
  - **Floor model entities** → authored canonical `Asset.footprint` × placement
    scale, rotated by placement yaw, then room-transformed.
  - **Primitive entities** (box / plane / cylinder / sphere) → footprint
    derived from dimensions × placement scale (rectangle / circle / ellipse;
    no `placementSurface` gate).
  - **Light entities** → no footprint in v1 (non-interactive; a tiny marker
    is a later enhancement, never a pick target).
- **Imported GLBs** → unsupported until P4 provides imported bounds.
- **Scale is part of the projection:** canonical point operation is scale →
  rotate(yaw) → translate(local) → room transform. Matrix form is
  `Room × T × R × S`; uniform and effective session `scaleVector` match Scene
  3D without reapplying asset `defaultScale/defaultRotation`.
- Render layer 6 as faint dashed outlines — passive spatial context in Layout
  mode and eligible active context in Staging. Read-only projection itself:
  no selection or mutation authority.

### Phase 2 — Staging tool & selection domain

- Add `PlanViewMode: 'layout' | 'staging'` to Scene Plan tool state and a
  persistent contextual `Layout | Staging` control; unplaced Asset Library
  selection never auto-switches or begins placement.
- `plan-scene-hit.ts` — pure 2D point-in-polygon resolver over transformed
  footprints, active only in staging mode; isolated from `plan-hit.ts`.
- Active selection derives mode authority inside Scene Plan without clearing
  either remembered selection slot.
- Hover/click bridge in layout mode.

### Phase 3 — 2D scene mutations

- Route Plan-world 2D drag candidates through each entity's room inverse before
  calling existing Scene mutators: write local X/Z + yaw, preserve local Y,
  pitch, roll, and other 3D-only state; commit one tagged `scene` history
  entry per gesture (`beginDocumentTransaction` → mutator →
  `commitDocumentTransaction` on pointerup; cancel restores). No new mutation
  machinery.
- **Rotation gesture (amendment 3):** a rotate handle on the selected
  footprint, following the B3 room rotation-arm pattern — pivot at the
  canonical placement pivot (`[0,0]`), continuous positive-Y rotation, Shift
  snaps to 15°. Inspector numeric yaw is parity. Shift has gesture-local
  meaning: translation disables positional snap; rotation enables 15° yaw snap.
- **Delete coverage (amendment 4):** Delete/Backspace in staging mode and
  the Inspector delete path each commit exactly one tagged `scene` history
  entry — the same transaction boundary as drags. Existing Layout mutation
  history is regression-tested, not reimplemented in P2.

### Phase 4 — Invariants & regression documentation

- Document the B3 room-drag behavior (Alpha) as designed behavior.
- Update `components/placement.md`, north-star, and CURRENT.md when C1 lands.

## Footprint sources (locked)

| Entity kind | P2 footprint source | P2 status |
|---|---|---|
| Floor catalogue model | Authored canonical `Asset.footprint` metadata | Eligible when valid |
| Box / plane / cylinder / sphere | Derived dimensions | Eligible when valid |
| Light | None | Excluded |
| Wall / ceiling / surface model | None | Omitted from P2 projection |
| Imported project-local GLB | Imported-bounds registry (P4) | Unsupported in P2 |

## Dependencies / gates

- **Scheduling (locked 2026-08-17):** H1 lands first. All C1 work —
  including Path A (Phase 1) — starts only after the H1 gate closes. C1
  stays approved and is re-registered under the plan-tracking system
  (letter families archived; see the CURRENT.md note). The ordering is
  sequencing discipline, not a technical gate — the document side has no
  hard H1 dependency.
- Imported-in-staging is deferred to P4 and requires its runtime imported-bounds
  registry; P2 has no GLB loading or bounds dependency.
- S3 stays generic; Plan-local mode authority is added when P2.2 lands.

## Open questions (resolve when C1 is scheduled)

- ~~Imported footprints~~ — deferred to P4; no P2 runtime bounds source.
- ~~Staging selection priority vs layout content when footprints overlap~~ —
  **resolved by §B P2-C:** mode decides hit authority (Layout → layout wins;
  Staging → scene footprint wins).
- ~~Inspector surface in staging mode: reuse the scene inspector, or a
  Plan-staging variant~~ — **resolved by §B P2-D:** reuse the canonical Scene
  Inspector with a Plan-staging property surface.
- Whether the faint layer-6 outlines need a toggle (drafting vs staging
  density) remains a later visual decision.
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
  **room-aware scale** transforms (uniform + independent), rotation-aware
  transforms, drop-Y parity, outline precedence/validation, and per-kind rules
  (floor model / primitive / plane / light / imported exclusion). The
  projection reads live Scene data plus the room resolver, never the preview
  copy.
- Hit resolver: point-in-polygon unit tests incl. overlap and rotation;
  inactive in layout mode (pass-through to `plan-hit.ts`).
- Mutation: world pointer → room-local X/Z + yaw only, local Y/pitch/roll
  preserved; **rotate-handle gesture with 15° Shift snap**; one `scene`
  history entry per drag, rotate, Inspector edit, and **delete** gesture;
  cancel/Escape/no-op produce zero entries.
- History: Ctrl+Z after a staging drag/rotate/delete restores
  `SceneDocument` in one step; the layout-side object fix restores
  `LayoutDocument` in one step.
- Room history: room move/rotate produces one `layout` entry, leaves
  `SceneDocument` unchanged, and derived Scene world positions follow the room
  frame.
- Visitor invariance: staging edits render in `/museum` unchanged.
- Mode bridges: existing-footprint hover affordance only; no Asset Library
  auto-activation or Plan placement.

### P2 acceptance matrix (mandatory)

**Room/projection:** non-zero room origin and yaw; combined room/entity yaw;
uniform and effective session scale exactly once; canonical asset
`defaultScale/defaultRotation` not double-applied; concave/invalid outline;
plane footprint; lights/imported/wall/ceiling/surface exclusion; missing model
footprint is not staging-pickable.

**World/local mutation:** translated and rotated rooms; Plan-world drag and
snap inverse-resolve to local X/Z; local Y, pitch, and roll remain unchanged;
room move/rotate leaves `SceneDocument` equal while derived Scene world poses
follow the room frame.

**Selection:** with both slots populated, Scene Plan Layout activates Layout,
Staging activates Scene, and toggling back restores the original Layout slot;
no slot is cleared. Camera ignores Scene Plan memories. Passive Layout
footprints do not activate Scene; bridge explicitly switches mode and selects
the entity. Unsupported remembered Scene selection behavior is pinned by the
P2.2 gate.

**Render:** layers are exactly 1–5 layout, 6 Scene, 7–10 Camera, 11–13
interaction; Camera Plan emits zero Scene footprint primitives.

**History:** each staging drag, rotation, Inspector X/Z/yaw edit, Delete key,
and Inspector delete creates exactly one `scene` entry; cancel, Escape, and
no-op create zero. Room move/rotate creates exactly one `layout` entry and
zero `scene` entries.
