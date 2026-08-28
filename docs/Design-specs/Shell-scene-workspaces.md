# Museum Editor — Shell Spec · Scene Workspaces

**Status:** part of the shell/workspace exposure specification — **ratified 2026-08-19**; split from [`Design-shell-specs.md`](./Design-shell-specs.md) 2026-08-21 (**section numbers preserved**).
**Scope:** §6 Scene → Plan (Layout | Arrange) · §7 Scene → 3D · §8 Asset-management state · §29 Arrange footprints · §30 Scene selection continuity.

> **P10 amendment (2026-08-23):** Scene Plan's staging surface is now the
> owner-aware **Arrange** surface. `Layout | Staging` terminology in this spec
> refers to the shipped pre-P10 state; the ratified authority is §6 + §29 +
> §30 as amended below.
Global shell / cross-domain rules live in [`Design-shell-specs.md`](./Design-shell-specs.md); camera workspaces in [`Shell-camera-workspaces.md`](./Shell-camera-workspaces.md).

---

# 6. Scene → Plan

## Purpose

Scene Plan = **author the museum spatially in 2D.**

Primary question:

> Where is the museum structure, and how are existing scene objects arranged?

It contains two authoring intents, selected by a workspace-local mode:

* **Layout mode** — build and edit architectural space.
* **Arrange mode** — arrange movable objects already in the space: eligible
  Scene entities **and** Layout objects, through each owner's existing
  pipeline.

Scene Plan therefore no longer means architecture exclusively, and Arrange
unifies object manipulation without unifying object ownership.

## Local authoring mode

`layout | arrange` is a Scene → Plan-local authoring mode beneath the
domain × view axes (§1 Workspace-local authoring mode).

The mode control lives in the **Scene Plan contextual toolbar region**, in one
consistent position for populated, empty, Layout, and Arrange states; never in
the global domain/view switchers. Active mode must be visually obvious — not
hidden in hover behavior or inferred from selection. The user must be able to
answer immediately:

> Am I editing architecture, or arranging what is already in the space?

P2.2 locked the presentation to one `Layout | Staging` segmented group; **P10
renames the user-facing label to `Layout | Arrange`** as the first group in the
Scene Plan contextual toolbar. It stays mounted in the same physical position
in populated/empty and Layout/Arrange states.

## Layout mode

### Viewport MUST show

* architectural floor plan
* walls
* rooms
* doors
* windows/openings
* dimensions where enabled
* architectural annotations
* grid
* room labels
* scene furniture/environment context where useful — as **passive
  footprints**
* snap guides when active
* current selection
* editing handles appropriate to selected architecture

Plan is an actual spatial representation of museum geometry.

It is not a schematic diagram.

### Viewport MUST allow editing of

* rooms
* walls
* doors
* windows
* openings
* architectural dimensions/geometry

### Scene footprints in Layout

Eligible floor-model and primitive footprints render as faint dashed layer-6
outlines — passive spatial context:

* visible
* hover-aware only where the mode bridge requires it
* **not selected**
* **not mutated**

Passive footprint projection must not itself activate Scene editing.

### Room drag behavior

Room drag relocates the room and its owned layout objects only
(`transformLayoutRoomUnit` semantics). Scene entities retain room-local
transforms, so their derived world transforms follow the moved/rotated room
frame. `SceneDocument` is not mutated and no Scene history entry is created;
the room gesture remains one `layout` entry. The editor must not imply
compound room + furniture compensation exists.

### Bridge to Arrange

Hovering a scene footprint in Layout mode exposes an **Edit in Arrange**
affordance:

```text
Edit in Arrange
→ activate Arrange
→ select hovered entity
```

The bridge-hover footprint must not look already selected.

### Context toolbar

Canonical capabilities:

```text
Select
Wall
Room
Door
Window
Opening
Measure
…
```

Contextual tools may appear only when applicable.

## Left panel

```text
Hierarchy | Assets
```

Hierarchy may expose:

```text
Environment
Architecture
Rooms
Scene Objects
Lights
Cameras
```

Hierarchy represents both architecture and placed Scene content as normal
project structure. No dedicated staging sidebar; objects must not be
duplicated into a separate "Staging Objects" hierarchy.

## Inspector

One conceptual right-side Inspector; routing follows the selected entity
and active Plan mode.

### Layout mode — architecture-oriented

Examples:

#### Wall

```text
Geometry
  Length
  Height
  Thickness
  Angle

Constraints
  Snap
  Orthogonal
  Locked

Material
```

### Arrange mode — owner-aware Plan surface

One Inspector shell with owner-specific fields (P10):

```text
Layout-object target:
  Plan Transform      X / Z / Yaw (editable — Layout pipeline)
  Dimensions          read-only in Arrange (Layout semantics)
  Room ownership      read-only; never inferred from coordinates
  Shape / type        read-only
  Elevation           read-only

Scene-entity target:
  Identity            Name · Asset / Type
  Plan Transform      X / Z / Yaw (editable — Scene pipeline)
  Elevation Y         preserved 3D state · Edited in 3D
  Scale               affects footprint projection; no Plan scaling gesture
  Contextual Commands Delete · Focus / Reveal
```

Y/elevation must not be mutated by 2D drag; show it as preserved 3D state
rather than silently hiding the value. Current scale stays visible and the
projection respects it, but Arrange must not imply scale manipulation that
does not exist. Layout-object dimensions/ownership edits remain available only
under existing Layout semantics.

## Arrange mode

### Purpose

Arrange movable objects already in the space — eligible Scene entities **and**
Layout objects — spatially in Plan. Architecture remains spatial context.

### Viewport MUST show

* the architectural Plan surface (rooms, walls, openings, grid, snap
  guides) as read-only spatial context
* scale-aware scene footprints and Layout-object footprints (active vs
  selected states, §29)
* current Arrange selection with the owner-aware rotation handle
* view controls

### Viewport MUST allow

* selection of eligible Scene entities (furniture/models, primitives) **and
  eligible Layout objects** (non-profile), through the P10 owner-aware hit
  target
* X/Z translation via direct drag, routed to the target's owner
* yaw rotation via the footprint rotate handle — Scene pivot at canonical
  placement pivot `[0,0]`; Layout-object pivot at the object's world pivot;
  continuous yaw, positive-Y semantics, Shift = 15° snap
* delete (Delete/Backspace), routed to the active owner only
* Inspector numeric yaw — semantically identical to handle rotation

### Plan transform authority

Arrange routes edits through the **active owner's** pipeline; one gesture
mutates exactly one document:

```text
Scene owner edits only:     position X · position Z · rotation yaw
Scene owner preserves:      position Y (elevation) · pitch · roll ·
                            other 3D-only transform state

Layout owner edits:         position X · position Z · rotation yaw
Layout owner preserves:     roomId (ownership is never inferred from
                            coordinates — architecture hard don't) ·
                            dimensions · shape/type · elevation
```

Plan edits horizontal placement; vertical authored state survives (the same
principle as Camera Plan §9). Arrange must not normalize, floor-snap, or
otherwise change Y simply because an object is moved in Plan.

Example:

```text
lamp elevation = 1.1 m

drag lamp footprint in Arrange
→ X changes
→ Z changes
→ Y stays 1.1 m
```

### Hit-testing authority

Mode decides pointer authority:

```text
Layout mode:
layout hit target wins

Arrange mode:
P10 Arrange hit target wins (resolveArrangeHit)
```

Arrange hit testing resolves both owners in one pass: true polygon containment
first; then — only when no polygon contains the point — the 6 CSS-pixel edge
halo (Scene footprints only) converted through the current Plan zoom.
Priority: containment → selected-under-pointer (any member of the active
owner's selection) → visual topmost (Scene layer 6 above Layout layer 5) →
stable render/document order. Cross-owner modifier-clicks switch owner and
**replace** the active selection; they never add across owners or create one
gesture spanning both documents.

This resolves interaction ambiguity when furniture overlaps walls, rooms,
or other layout content. In Arrange, architecture:

* remains visible
* remains useful for snapping and geometric placement calculations
* does not become selected through ordinary Arrange interaction
* does not accept mutations

### Snapping contract

Arrange may **read** `LayoutDocument` spatial information (room boundaries,
walls, corners, other valid snap references). A Scene-owner gesture **writes
only** `SceneDocument`; a Layout-owner gesture writes only `LayoutDocument`.
A gesture must never convert into the other document's mutation, and never
spans both documents.

### Context toolbar

The toolbar routes by local mode. Arrange does not require a large permanent
toolset; at minimum the shell exposes an unmistakable Arrange state plus the
existing interaction model:

```text
Select / drag
contextual rotation handle
Delete / Backspace
Inspector numeric yaw
View controls
```

Do not invent permanent Move/Rotate tools unless later UX testing requires
them — movement stays direct manipulation; rotation stays the footprint
rotation-handle interaction. Architecture tools must not remain misleadingly
active while Arrange owns pointer authority.

The mode segment is always first. Layout follows it with architecture tools;
Arrange follows it with Select plus applicable Snap/Grid/View controls. A local
mode transition cancels transient Layout work and resets the Layout tool to
Select; returning to Layout does not resurrect a stale architecture tool.

### Asset Library

The Asset Library remains available in Scene → Plan, but selecting an
**unplaced** catalogue asset does not enter a Plan placement gesture in
P2 v1 — staging applies to existing placed Scene entities only. 2D
placement belongs to the follow-up ghost-placement slice; P2 has no
auto-activation path for unplaced assets.

## MUST NOT expose

* Camera timeline
* guided sequence editing
* framing controls
* FOV authoring
* Camera path anchors as Camera-authoring UI
* Camera framing targets
* camera frustums as framing-authoring controls
* Camera envelope controls
* (Staging) Camera nodes, camera graph, guided sequence, or Camera Plan's
  selection domain
* a Scene 3D TransformControls gizmo or 3D orientation box in either Scene
  Plan mode

Scene Plan is 2D scene authoring, not camera authoring.

---

# 7. Scene → 3D

## Purpose

Scene-object placement and manipulation.

Primary question:

> What exists in the museum, and how is it positioned?

## Viewport MUST show

The composed museum scene:

* architecture
* placed assets
* lighting
* paintings
* sculpture
* furniture
* scene decoration
* selected object
* transform gizmo where applicable

## Viewport MUST allow

* selecting scene objects
* translation
* rotation
* independent X/Y/Z scaling
* uniform scaling
* asset placement
* duplication/deletion where supported
* material/property editing
* visibility editing
* shadow settings
* placement/surface behavior

## Scene 3D overlay contract

The canonical Scene 3D references (`scene-3d-object-selection.png`,
`scene-3d-layout-selection.png`, and `scene-3d-assets.png`) are registered in
[`Design-png/README.md`](../../Design-png/README.md). They define the visual
target for object selection and spatial overlays without creating a second
document or selection model.

### Selected-object transform and scale gizmo

The selected-object TransformControls gizmo is available only in **Scene →
3D**:

* it follows the active Select/Move/Rotate/Scale context and the selected
  object's rotation-aware bounds and pivot;
* X/Y/Z handles use the canonical red/green/blue values from
  [`Design-specs.md` §8](./Design-specs.md#8-transform-axis-and-scene-3d-overlay-colors);
* Scale presents independent X/Y/Z handles and a distinct uniform center
  affordance when the current scale mode is uniform;
* the gizmo sits above the selected object's outline but remains below shell
  chrome and separate from the upper-right orientation utility.

P3 owns the cosmetic match to the PNG: handle proportions, line weight,
opacity, active/hover colors, scale-chain presentation, and layering. P3 does
not change local/world space, snapping, pointer capture, selected identity,
uniform/independent scale semantics, or history behavior. Scene Plan never
gets this 3D gizmo or a Plan scaling gesture.

### Object selection and layout boxes

Scene 3D selection presentation is stateful but selection authority stays with
the canonical Scene selection:

| State | Scene 3D | Scene Plan |
|---|---|---|
| Passive/context | no gizmo; muted context geometry | dashed/muted layout or scene footprint box |
| Hover | thin blue hover outline; no gizmo or selection fill | stronger passive stroke or Layout → Arrange bridge affordance |
| Selected | blue rotation-aware object outline, optional light bounds line, and gizmo | blue selected footprint/architecture stroke with only mode-allowed handles |

Hover must not look selected. Layout boxes and passive Scene Plan footprints
are not Scene selection, and Arrange handles cannot leak into Layout. P3 owns
colors, strokes, dashes, opacity, spacing, and visual state treatment; P2/P10
own Plan authority and P3B does not change object-selection semantics.

### Upper-right XYZ orientation box

The orientation box is a custom SVG/DOM view utility, not a transform gizmo,
local/world switch, or selection target. Its `--editor-orientation-*` size,
inset, surface, border, hover, and label tokens must be restored in the editor
token file before styling:

* place it in the **upper-right of the Scene 3D viewport**, using the
  `--editor-orientation-*` size, inset, surface, border, and label tokens;
* render the compact cube/axis construction with visible X/Y/Z labels and the
  canonical axis colors; keep it crisp over the rich scene without becoming a
  second toolbar;
* keep it separate from TransformControls, object outlines, Inspector chrome,
  and viewport-edge controls;
* render its hover, pressed, disabled, and focus-visible states in P3 even
  though P3 does not add input behavior.

P3 owns the graphic, top-right placement, dimensions, spacing, color tokens,
and state styling. Post-P3 **P3B** owns the camera-following orientation
state, isolated pointer/keyboard hit targets, click-to-snap axis/face
activation, selection preservation, no document/history mutation, and the
explicit no-drag-orbit rule. The widget is present and interactive only in
Scene → 3D; it is absent from Scene Plan Layout/Arrange, Camera Plan, and
Camera 3D.

## Context toolbar

Canonical capabilities:

```text
Select
Move
Rotate
Scale
Add Asset
Local / World
Snap
…
```

Contextual commands may include:

```text
Drop to Floor
Keep on Floor
Focus Selection
```

## Left panel

Default:

```text
Hierarchy | Assets
```

Same Scene-domain structural model as Scene Plan.

Switching Plan ↔ 3D should not make the project appear to have two separate scene hierarchies.

## Inspector

Object-oriented when object selected.

Typical groups:

```text
Transform
  Position XYZ
  Rotation XYZ
  Scale XYZ
  Uniform Scale
  Coordinate Space
  Pivot
  Reset Transform

Snap Settings

Placement
  Surface
  Offset
  Keep on Floor

Asset

Material

Visibility
  Visible
  Cast Shadow
  Receive Shadow
```

## MUST NOT expose

* Camera timeline
* Sequence Inspector
* Camera Path lane
* Shots/FOV/Look At/Roll lanes
* Camera framing envelope
* guided-tour authoring controls

Camera nodes may exist visibly in project structure without turning Scene 3D into Camera 3D.

---

# 8. Scene Asset-Management State

Scene domain may enter a specialized wider asset-management state.

Canonical composition:

```text
Asset Library | Viewport | Objects / Outliner
```

This is useful for:

* browsing reusable assets
* placing assets
* replacing assets
* organizing placed objects

The Asset Library may expose:

* search
* filters
* categories
* thumbnail previews
* curation badge
* placement
* replacement

`curationStatus` values:

```text
Approved
Testing
Placeholder
Rejected
```

For imported assets these values are separate from `importState`:
`processing | ready | failed`. `importState` owns progress/error treatment;
`curationStatus` owns the compact badge.

The Objects/Outliner side represents **placed scene instances**.

The Asset Library represents **reusable assets**.

These must not be conflated.

This specialized layout does not replace the canonical default:

```text
Hierarchy / Assets | Viewport | Inspector
```

The current product specification does not mandate the exact trigger or docking behavior for entering this wider state.


---

# 29. Scene Plan Arrange — Footprint Rendering States

The shell/visual spec defines the Arrange footprint states for both owners.

### Passive footprint (Layout mode)

* faint, dashed
* low visual priority
* no selection handles
* never activates Scene selection

### Bridge-hover footprint (Layout mode only)

* slightly stronger emphasis
* one-click **Edit in Arrange** affordance
* must not look already selected

### Active Arrange footprint (Arrange mode, not selected)

* clearly available for interaction
* still subordinate to architectural Plan readability
* applies to eligible Scene entities **and** eligible Layout objects

### Selected Arrange footprint (Arrange mode)

* clear selection outline using the editor's standard primary interaction
  accent — **one selection language for both owners** (P10; the interim amber
  Layout-object treatment is a recorded deviation reconciled in P3)
* handles appropriate to supported operations
* rotation handle (Scene pivot at canonical placement pivot `[0,0]`;
  Layout-object pivot at the object's world pivot)
* drag affordance
* Inspector synchronized

### Owner-aware presentation (P10)

* selected members of the **active owner's** selection render selected; the
  inactive slot's memory never renders as active
* read-only architecture (walls/rooms/openings) stays passive context in
  Arrange
* readonly Layout objects (profiles) render dashed and are not hit targets
* `ArrangeOwner` is session routing only — it never holds object identity

### Rotation interaction

* rotation arm/handle on the selected footprint, shared token contract across
  room, Scene, and Layout-object rotation
* Scene pivot at canonical placement pivot (`[0,0]`); Layout-object pivot at
  its world pivot; not polygon centroid/AABB center
* continuous yaw, positive-Y rotation semantics
* Shift = 15° angular snap for rotation; Shift disables positional snap during
  translation
* direct-manipulation control, not necessarily a permanent toolbar mode
* Inspector numeric yaw is semantically identical to handle rotation

### Footprint content rules (P2 v1 + P10)

* floor catalogue models — authored canonical asset footprint metadata
* box/plane/cylinder/sphere primitives — footprint derived from dimensions
* Layout objects — footprint from the existing Plan render identities; only
  non-profile objects are Arrange hit targets
* wall/ceiling/surface catalogue models — omitted from P2 projection
* imported project models — unsupported (GLB import deferred; re-registers after the P12/P3B hard gate)
* lights — no interactive footprint
* camera/tour content — not part of Plan Arrange

Footprint representation applies canonical asset-local point → placement scale
→ placement yaw → placement local translation → room frame → Plan world X/Z.
Matrix form is `Room × T × R × S`; point-operation order is
scale → rotate → translate → room transform. A model scaled 2× in Scene 3D
shows a corresponding 2× Plan footprint.

---

# 30. Scene Selection Continuity

The Scene domain has one shared selection model — the same entity identity
across Plan and 3D. This is a hard invariant, mirroring §13 (Camera).

```text
Scene Plan → Arrange
select Chair 01

→ Scene 3D

Chair 01 remains selected
```

```text
Scene 3D
select Chair 01

→ Scene Plan

Scene Plan returns in Arrange → Chair 01 remains selected.
Scene Plan returns in Layout → the chair may remain the logical Scene
selection internally, but must not expose Arrange handles or override
layout editing authority.
```

Switching modes must never create duplicate identity. P10 keeps the
Layout-object slot and the Scene slot separate: selected ids live only in
their canonical slots, and `ArrangeOwner` remembers the **last active owner
for the session — never an object identity**.

### Plan viewport selection specifics

Arrange uses the same ordered Scene placement selection as Scene 3D viewport:

* plain click replaces selection
* Shift-click adds only within the same owner; it does not remove an
  already-selected entity
* Cmd/Ctrl-click toggles membership
* the last selected entity remains primary
* **cross-owner modifier-clicks switch owner and replace** the active
  selection with the clicked target — they never add across owners

All eligible selected placements may show selected footprints. P2.2 creates no
cluster footprint or cluster hit target. Entering Arrange never clears or
normalizes an existing placement/cluster selection. If any selected member is
ineligible, Plan transform authoring is disabled for the whole selection; the
editor must never mutate only its visible eligible subset. Empty Arrange
canvas click clears whichever owner is the **active** target (derived from the
canonical slots) and preserves the inactive slot as memory.

### Last-owner memory (P10)

```text
Arrange: select Scene A
→ Layout: select Layout Box B
→ Scene 3D: select Scene C
→ Layout mode: B is active
→ Arrange: Scene C is active (last owner = scene)
```

On entry, Arrange activates only the remembered owner's eligible slot:

* last owner = `layout-object` + eligible Layout object → that object activates
* last owner = `layout-object` + wall/room/stale selection → **no active
  target** (no Scene fallback, no resurrected older object)
* last owner = `scene` + eligible Scene selection → that selection activates
* last owner = `scene` + empty/ineligible (e.g. light) selection → **no active
  target**

### Arrange → Layout

```text
Arrange
Chair selected

→ Layout

Scene selection remains remembered but becomes inactive/passive in Plan
layout selection authority becomes active
footprint loses Arrange handles
returning to Arrange restores the last active owner's eligible selection
where practical
```

This avoids destructive selection resets while preserving mode authority.

The Scene 3D outline and gizmo are view-scoped presentation. Returning to
Scene Plan may preserve the logical Scene identity, but it must never carry a
3D gizmo, 3D orientation-box input target, or 3D scale gesture into Layout or
Arrange.
