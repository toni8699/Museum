# Museum Editor — Shell Spec · Scene Workspaces

**Status:** part of the shell/workspace exposure specification — **ratified 2026-08-19**; split from [`Design-shell-specs.md`](./Design-shell-specs.md) 2026-08-21 (**section numbers preserved**).
**Scope:** §6 Scene → Plan (Layout | Staging) · §7 Scene → 3D · §8 Asset-management state · §29 Staging footprints · §30 Scene selection continuity.
Global shell / cross-domain rules live in [`Design-shell-specs.md`](./Design-shell-specs.md); camera workspaces in [`Shell-camera-workspaces.md`](./Shell-camera-workspaces.md).

---

# 6. Scene → Plan

## Purpose

Scene Plan = **author the museum spatially in 2D.**

Primary question:

> Where is the museum structure, and how are existing scene objects arranged?

It contains two authoring intents, selected by a workspace-local mode:

* **Layout mode** — build and edit architectural space.
* **Staging mode** — arrange existing scene furniture and scene objects
  spatially in Plan.

Scene Plan therefore no longer means architecture exclusively.

## Local authoring mode

`layout | staging` is a Scene → Plan-local authoring mode beneath the
domain × view axes (§1 Workspace-local authoring mode).

The mode control lives in the **Scene Plan contextual toolbar region**,
never the global domain/view switchers. Active mode must be visually
obvious — not hidden in hover behavior or inferred from selection. The
user must be able to answer immediately:

> Am I editing architecture or furniture?

Presentation is open: segmented control, compact mode selector, tool-group
switch, or equivalent editor-pattern control.

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

Scene furniture and primitive footprints render as faint dashed layer-5.5
outlines — passive spatial context:

* visible
* hover-aware only where the mode bridge requires it
* **not selected**
* **not mutated**

Passive footprint projection must not itself activate Scene editing.

### Room drag behavior

Room drag relocates the room and its owned layout objects only
(`transformLayoutRoomUnit` semantics). Scene furniture keeps its world
X/Z — staged furniture is never implicitly collected into a room move.

If furniture ends up outside valid room/placement geometry, the existing
warning system surfaces the issue; the operation must not silently
relocate furniture. The editor must not imply compound room + furniture
movement exists.

### Bridge to Staging

Hovering a scene footprint in Layout mode exposes an **Edit in Staging**
affordance:

```text
Edit in Staging
→ activate staging
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

### Staging mode — Plan-staging surface

Scene object Inspector adapted for Plan authority:

```text
Identity
  Name
  Asset / Type

Plan Transform
  X
  Z
  Yaw

Elevation Y — preserved 3D state
  1.20 m
  Edited in 3D

Scale — affects footprint projection
  No Plan scaling gesture in P2 v1

Contextual Commands
  Delete
  Focus / Reveal
```

Y/elevation must not be mutated by 2D drag; show it as preserved 3D state
rather than silently hiding the value. Current scale stays visible and the
projection respects it, but Plan staging must not imply scale manipulation
that does not exist in P2 v1.

## Staging mode

### Purpose

Arrange existing scene furniture and scene objects spatially in Plan.
Architecture remains spatial context.

### Viewport MUST show

* the architectural Plan surface (rooms, walls, openings, grid, snap
  guides) as read-only spatial context
* scale-aware scene footprints (active vs selected states, §29)
* current staging selection with rotation handle
* view controls

### Viewport MUST allow

* selection of supported scene entities (furniture/models, primitives)
* X/Z translation via direct drag
* yaw rotation via the footprint rotate handle — pivot at footprint
  center, continuous yaw, positive-Y semantics, Shift = 15° snap
* delete (Delete/Backspace)
* Inspector numeric yaw — semantically identical to handle rotation

### Plan transform authority

Staging edits only:

```text
position X
position Z
rotation yaw
```

Staging preserves exactly:

```text
position Y (elevation)
pitch
roll
other 3D-only transform state
```

Plan edits horizontal placement; vertical authored state survives (the
same principle as Camera Plan §9). Staging must not normalize, floor-snap,
or otherwise change Y simply because a furniture object is moved in Plan.

Example:

```text
lamp elevation = 1.1 m

drag lamp footprint in Staging
→ X changes
→ Z changes
→ Y stays 1.1 m
```

### Hit-testing authority

Mode decides pointer authority:

```text
Layout mode:
layout hit target wins

Staging mode:
staging footprint hit target wins
```

This resolves interaction ambiguity when furniture overlaps walls, rooms,
or other layout content. In Staging, architecture:

* remains visible
* remains useful for snapping and geometric placement calculations
* does not become selected through ordinary staging interaction
* does not accept mutations

### Snapping contract

Staging may **read** `LayoutDocument` spatial information (room boundaries,
walls, corners, other valid snap references) but **writes only**
`SceneDocument`. Snapping must never convert a staging gesture into a
layout mutation.

### Context toolbar

The toolbar routes by local mode. Staging does not require a large
permanent toolset in P2 v1; at minimum the shell exposes an unmistakable
Staging state plus the existing interaction model:

```text
Select / drag
contextual rotation handle
Delete / Backspace
Inspector numeric yaw
View controls
```

Do not invent permanent Move/Rotate tools unless later UX testing requires
them — movement stays direct manipulation; rotation stays the footprint
rotation-handle interaction. Architecture tools must not remain
misleadingly active while Staging owns pointer authority.

### Asset Library

The Asset Library remains available in Scene → Plan, but selecting an
**unplaced** catalogue asset does not enter a Plan placement gesture in
P2 v1 — staging applies to existing placed Scene entities only. 2D
placement and its staging auto-activation belong to the follow-up
ghost-placement slice.

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

The Scene 3D references (`Scene-3D.png`, `Scene-3D-2.png`, and
`Scene-3D-assets.png`) define the visual target for object selection and
spatial overlays. They do not create a second document or selection model.

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
| Hover | thin blue hover outline; no gizmo or selection fill | stronger passive stroke or Layout → Staging bridge affordance |
| Selected | blue rotation-aware object outline, optional light bounds line, and gizmo | blue selected footprint/architecture stroke with only mode-allowed handles |

Hover must not look selected. Layout boxes and passive Scene Plan footprints
are not Scene selection, and Staging handles cannot leak into Layout. P3 owns
colors, strokes, dashes, opacity, spacing, and visual state treatment; P2
owns Plan authority and P3B does not change object-selection semantics.

### Upper-right XYZ orientation box

The orientation box is a custom SVG/DOM view utility, not a transform gizmo,
local/world switch, or selection target:

* place it in the **upper-right of the Scene → 3D viewport**, using the
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
Scene → 3D; it is absent from Scene Plan Layout/Staging, Camera Plan, and
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
* status
* placement
* replacement

Possible states:

```text
Approved
Testing
Placeholder
Rejected
```

The Objects/Outliner side represents **placed scene instances**.

The Asset Library represents **reusable assets**.

These must not be conflated.

This specialized layout does not replace the canonical default:

```text
Hierarchy / Assets | Viewport | Inspector
```

The current product specification does not mandate the exact trigger or docking behavior for entering this wider state.


---

# 29. Scene Plan Staging — Footprint Rendering States

The shell/visual spec defines four staging footprint states.

### Passive footprint (Layout mode)

* faint, dashed
* low visual priority
* no selection handles
* never activates Scene selection

### Bridge-hover footprint (Layout mode only)

* slightly stronger emphasis
* one-click **Edit in Staging** affordance
* must not look already selected

### Active staging footprint (Staging mode, not selected)

* clearly available for interaction
* still subordinate to architectural Plan readability

### Selected staging footprint (Staging mode)

* clear selection outline using the editor's standard primary interaction
  accent
* handles appropriate to supported operations
* rotation handle (pivot at footprint center)
* drag affordance
* Inspector synchronized

### Rotation interaction

* rotation arm/handle on the selected footprint
* pivot at footprint center
* continuous yaw, positive-Y rotation semantics
* Shift = 15° snap
* direct-manipulation control, not necessarily a permanent toolbar mode
* Inspector numeric yaw is semantically identical to handle rotation

### Footprint content rules (P2 v1)

* catalogue models — authored asset footprint metadata
* imported project models — derived/session-cached footprint
* primitives — footprint derived from dimensions
* lights — no interactive footprint
* camera/tour content — not part of Plan staging

Footprint representation includes translation → yaw → scale (uniform +
`scaleVector`), matching the 3D world transform; a model scaled 2× in
Scene 3D shows a corresponding 2× Plan footprint.

---

# 30. Scene Selection Continuity

The Scene domain has one shared selection model — the same entity identity
across Plan and 3D. This is a hard invariant, mirroring §13 (Camera).

```text
Scene Plan → Staging
select Chair 01

→ Scene 3D

Chair 01 remains selected
```

```text
Scene 3D
select Chair 01

→ Scene Plan

Scene Plan returns in Staging → Chair 01 remains selected.
Scene Plan returns in Layout → the chair may remain the logical Scene
selection internally, but must not expose staging handles or override
layout editing authority.
```

Switching modes must never create duplicate identity.

### Staging → Layout

```text
Staging
Chair selected

→ Layout

Scene selection remains remembered but becomes inactive/passive in Plan
layout selection authority becomes active
footprint loses staging handles
returning to Staging restores the selected Scene entity where practical
```

This avoids destructive selection resets while preserving mode authority.

The Scene 3D outline and gizmo are view-scoped presentation. Returning to
Scene Plan may preserve the logical Scene identity, but it must never carry a
3D gizmo, 3D orientation-box input target, or 3D scale gesture into Layout or
Staging.

