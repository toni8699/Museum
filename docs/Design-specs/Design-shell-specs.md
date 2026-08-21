# Museum Editor — Shell & Workspace Exposure Specification

**Status:** canonical shell/workspace specification — **ratified 2026-08-19**
**Purpose:** codebase conformance review
**Scope:** editor shell composition, workspace ownership, component visibility, interaction authority, persistence, and cross-workspace transitions.
**Last amended:** 2026-08-19 — P2 Shell-A…Shell-J: Scene → Plan local authoring mode
(Layout | Staging), mode-routed toolbar/Inspector/hit-testing, staging footprint
states, Scene selection continuity, room-drag rule.
**Amended 2026-08-21 — P1.8:** the Camera-domain section **"Free Cameras" is
renamed "Unsequenced"** (terminology per [`Camera-flow-specs.md`](./Camera-flow-specs.md)
§2 — Sequence = ordered subset of the graph; Unsequenced = not currently in the
sequence); all camera-domain references below use it.

This specification complements the [visual UI specification](./Design-specs.md).

The visual specification answers:

> What should the editor look like?

This specification answers:

> What should each workspace contain, expose, allow, preserve, and hide?

It intentionally does **not** prescribe Svelte component structure, stores, routing strategy, rendering architecture, or implementation technology.

---

# 1. Canonical Workspace Model

The editor has two independent axes:

**Domain**

* Scene
* Camera

**View**

* Plan
* 3D

This produces four canonical workspaces:

| Workspace     | Primary job                                          |
| ------------- | ---------------------------------------------------- |
| Scene → Plan  | Author the museum spatially in 2D (Layout \| Staging) |
| Scene → 3D    | Place and manipulate things                          |
| Camera → Plan | Route cameras                                        |
| Camera → 3D   | Frame camera movement                                |

These are not four unrelated applications.

They are four views inside one persistent editor shell.

The shell must communicate:

**Domain first → representation second.**

Therefore:

`[Scene | Camera]`

and

`[Plan | 3D]`

remain separate controls.

`Plan | 3D` order never reverses between domains.

## Workspace-local authoring mode

Beneath the domain × view axes, a workspace may define a **local authoring
mode** that controls what kind of content the current workspace is
authoring. This is third-level routing:

```text
Domain
  ↓
View
  ↓
Local authoring mode, where applicable
```

Today only **Scene → Plan** requires such a local mode:

```text
Scene
├─ Plan
│  ├─ Layout   → edit architecture
│  └─ Staging  → arrange existing scene objects in 2D
└─ 3D          → fully author scene objects in 3D

Camera
├─ Plan        → author camera position/topology
└─ 3D          → author camera movement/framing
```

Rules:

* `layout | staging` controls what kind of Scene content Plan is currently
  authoring.
* It sits **below** `Scene → Plan`. Staging is not a fifth workspace.
* Staging MUST NOT appear beside `Scene | Camera` or `Plan | 3D`.
* The mode is Scene Plan-local: switching to Camera Plan never carries
  Staging into Camera.

---

# 2. Global Shell Contract

The default editor shell consists of six persistent regions:

```text
┌─────────────────────────────────────────────────────────────────┐
│ GLOBAL HEADER                                                   │
├──────────────┬──────────────────────────────┬───────────────────┤
│              │ CONTEXTUAL VIEWPORT TOOLBAR  │                   │
│ LEFT PANEL   │                              │ RIGHT INSPECTOR   │
│              │          VIEWPORT            │                   │
│              │                              │                   │
├──────────────┴──────────────────────────────┴───────────────────┤
│ CAMERA TIMELINE — Camera domain only                            │
├─────────────────────────────────────────────────────────────────┤
│ STATUS BAR                                                      │
└─────────────────────────────────────────────────────────────────┘
```

Region ownership:

| Region          | Responsibility                                  |
| --------------- | ----------------------------------------------- |
| Global header   | project + workspace navigation + global actions |
| Left panel      | structure/resources belonging to current domain |
| Context toolbar | actions belonging to current workspace          |
| Viewport        | spatial authoring surface                       |
| Inspector       | properties of current selection                 |
| Timeline        | temporal Camera authoring                       |
| Status bar      | state, navigation hints, snap, units            |

The overall shell should remain structurally stable while workspace-specific content changes inside these regions.

---

# 3. Global Header

The global header exists in **all four workspaces**.

It exposes:

* product/project identity
* current project selector/name
* `[Scene | Camera]`
* `[Plan | 3D]`
* save state
* undo
* redo
* project-level menu/actions
* editor/settings access where applicable

The global header MUST NOT contain workspace-specific manipulation commands such as:

* Move
* Rotate
* Add Camera
* Wall
* Measure
* Frame
* Path

Those belong to the contextual viewport toolbar.

### State behavior

Changing `Plan ↔ 3D` MUST NOT change domain.

Changing `Scene ↔ Camera` MUST NOT be represented as entering a separate application.

**Amended 2026-08-21 — owner decision (P1.7 follow-up):** the `Plan | 3D`
view is **shared across domains**. Switching `Scene ↔ Camera` keeps the
current view, and a view switch applies to both domains — the viewport never
snaps between Plan and 3D on a domain change. (Supersedes any per-domain view
memory.)

Workspace switches should preserve as much useful state as the product model permits.

Recommended boot state:

`Scene → 3D`

> **Amended 2026-08-21:** boot is **Scene → Plan** (owner decision above).

---

# 4. Left Panel Routing

The left side changes primarily by **domain**, not merely by Plan/3D view.

## Scene domain

Default:

`Hierarchy | Assets`

The Scene left panel owns:

* environment
* architecture
* rooms
* scene objects
* lights
* cameras as scene/project structure
* reusable asset browsing

The hierarchy and viewport selection remain synchronized.

Camera entries may appear here because they exist in the museum, but Scene workspace MUST NOT become a substitute Camera authoring interface.

Camera route, sequence, framing, and timeline operations belong to Camera domain.

## Camera domain

Scene hierarchy is replaced by the specialized **Camera Sidebar**.

Canonical sections:

```text
Environment
Sequence Inspector
Unsequenced
Connections
```

The Camera Sidebar owns camera-tour structure.

### Environment

Environment is context.

It may expose:

* museum
* floor
* rooms
* architectural elements

Environment is read-only from Camera domain.

### Sequence Inspector

Owns explicit guided playback order.

Rows may expose:

* order number
* camera name
* drag reorder
* selection
* visibility
* contextual actions
* optional timing information

### Unsequenced

Contains camera nodes not currently participating in the sequence.

Unsequenced cameras may still participate in graph connections.

### Connections

Lists actual topology.

Representation must remain undirected:

`Camera 1 — Camera 2`

not:

`Camera 1 → Camera 2`

> **Sketch note (no PNG edit):** `Design-png/Camera/Camera-2D.png`, `Camera-3D.png`, `Camera-sequence.png`, `Timeline-expanded.png` (pre-2026-08-21) and the 3 new P1.8 PNGs show `→` in sidebar Connections lists — **keep as-is**, docs are canonical; P3.1 logs as minor convention deviation per `P1.8-designer-brief.md §1`.

---

# 5. Right Inspector Contract

The right region remains conceptually **Inspector** in every normal workspace.

The Inspector shell should stay stable while its contents route according to selection.

Possible selection types include:

* no selection
* room
* wall
* architectural element
* scene object
* light
* camera node
* camera connection
* path anchor
* transition
* framing breakpoint
* multi-selection

The Inspector should use shared interaction grammar:

* selection header
* collapsible groups
* numeric fields
* toggles
* dropdowns
* contextual commands
* optional tags/notes

The selected entity determines Inspector content.

The current workspace determines which properties are authorable.

Example:

A camera's Y position may exist in the data model while Camera Plan is active, but Camera Plan does not expose Y editing.

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

# 9. Camera → Plan

## Purpose

Spatial Camera graph/topology authoring.

Primary questions:

> Where are the camera stops?

> Which camera stops are connected?

Camera Plan is NOT a generic graph editor.

Camera nodes appear at their real museum world positions.

No secondary graph-layout coordinates exist.

---

## Viewport backdrop

Uses the architectural Plan representation as context.

Environment is:

* visible
* spatially accurate
* read-only
* hit-testable

Read-only does **not** mean pointer-inert.

Example:

```text
Add Camera
→ click floor
→ camera placed at corresponding museum position
```

Clicking a wall must not enter Scene wall-editing mode.

---

## Viewport MUST show

* architectural plan backdrop
* rooms and spatial context
* camera nodes
* guided sequence numbering
* unsequenced distinction
* camera connections
* selected node/connection
* path anchors when relevant
* timing labels on connection edges when authored
* relevant placement/snapping feedback

Guided camera example:

```text
① Main Entrance
② Central Hall
③ Sculpture Gallery
```

Unsequenced camera example:

```text
◯ Overlook A
Unsequenced
```

Ordered and unsequenced cameras MUST remain visually distinguishable.

---

## Connections

Connections represent topology.

They MUST be rendered without arrows.

Connection:

```text
Camera A — Camera B
```

means:

> movement is possible between A and B.

It does NOT mean:

> playback goes from A to B next.

---

## Timing authoring

**Product choice: connection duration is authored on the plan edge.**

The plan edge is the authoring locus for a move's timing:

* selecting a connection exposes its per-direction timing in the Inspector
* duration is authored in seconds
* derived speed is shown as a readout: `speed = path length ÷ duration`
* the connection edge renders a timing label with the authored duration

Per-direction rule — the edge itself stays undirected, but each direction of
one connection carries its own duration:

```text
Camera A — Camera B
duration A→B: 4.2 s
duration B→A: 3.5 s
```

Rules:

* bending the path (adding/moving interior anchors) recomputes path length;
  the authored duration is preserved and derived speed updates automatically
  (`speed = length / time`)
* an un-authored direction falls back to the formula-derived duration from
  path length (the engine default), and the label shows the derived value
* timing is Camera-domain data; Scene workspaces never expose it

---

## Context toolbar

Canonical primary tools:

```text
Select
Add Camera
Connect
View
…
```

Movement does not require a permanent separate Move mode.

`Select + drag` moves camera nodes.

Path handles are contextual.

---

## Plan movement authority

Node drag edits:

```text
X
Z
```

Path-anchor drag edits:

```text
X
Z
```

Plan MUST preserve authored:

```text
Y
```

Moving a camera through Plan MUST NOT silently snap its height to floor.

---

## Left panel

Camera Sidebar:

```text
Environment
Sequence Inspector
Unsequenced
Connections
```

---

## Inspector

Camera-aware Inspector.

Possible selections:

### Camera node

May expose properties appropriate to Plan such as:

* identity/name
* sequence membership
* connection information
* X/Z position
* metadata
* contextual Camera operations

Properties owned exclusively by Camera 3D should not become primary Plan controls.

### Connection

May expose:

* endpoints
* path information
* validation state
* contextual path operations
* per-direction duration/timing (§ Timing authoring)
* deletion where valid

### Path anchor

May expose X/Z authoring while preserving Y.

---

## Bottom dock

**Camera Timeline MUST be present.**

Camera Plan is not a timeline-less simplified Camera mode.

---

## MUST NOT expose in Camera Plan viewport

* camera view cones
* framing frustums
* look-at target markers
* heading/framing arrows
* authored look-target graphics
* FOV manipulation
* framing breakpoints
* framing envelope handles
* authored orientation controls

Camera Plan answers:

> Where?

It does not answer:

> What is camera looking at?

---

# 10. Camera → 3D

## Purpose

Camera movement and framing authoring.

Primary question:

> What does visitor camera actually experience?

Scene remains visible as framing context.

Scene-object authoring does not become the primary interaction model.

---

## Viewport MUST show where relevant

* full 3D museum
* camera nodes
* selected camera
* path splines
* path anchors
* transform gizmos
* camera frustum
* look target
* look-at line
* framing helpers
* authored framing information

Progressive disclosure applies.

Not every helper must always be visible.

---

## Camera 3D authoring authority

Camera 3D owns:

* camera X/Y/Z
* camera height
* path-anchor X/Y/Z
* camera orientation
* look target
* FOV
* authored framing
* framing breakpoints
* framing envelope
* relevant roll authoring
* connection timing (duration) — the same per-direction field authored in
  Camera Plan (§9 Timing authoring); Plan and 3D edit one value, not two

---

## Context toolbar

Workspace capabilities include:

```text
Select
Move
Rotate
Add Camera
Path
Frame
View
…
```

`Path` and `Frame` are Camera 3D capabilities.

They may be exposed contextually rather than permanently if progressive disclosure produces a cleaner interface.

Selection of a path, transition, or camera may reveal the relevant controls.

---

## Left panel

Same Camera Sidebar used by Camera Plan:

```text
Environment
Sequence Inspector
Unsequenced
Connections
```

The user should not feel that switching to Camera 3D opens another Camera system.

---

## Inspector

Selection-dependent Camera Inspector.

Possible node groups:

```text
Transform
Position XYZ
Orientation / Target
FOV
Sequence information
Connections
Camera metadata
```

Possible connection/transition groups:

```text
Duration
Path
Framing
Automatic/Authored state
Shots
FOV
Look At
Roll
```

Complex transition parameters should use progressive disclosure rather than permanently filling the Inspector.

---

## Bottom dock

Same Camera Timeline instance/state as Camera Plan.

---

# 11. Camera Timeline Ownership

This is a hard shell invariant.

The Timeline belongs to:

**Camera domain**

not:

**Camera → 3D view**

Therefore:

| Workspace     | Timeline |
| ------------- | -------- |
| Scene → Plan  | ABSENT   |
| Scene → 3D    | ABSENT   |
| Camera → Plan | PRESENT  |
| Camera → 3D   | PRESENT  |

When switching:

`Camera Plan → Camera 3D`

or

`Camera 3D → Camera Plan`

the timeline MUST NOT logically reset.

Preserve:

* current tour
* current playhead
* current playback state where valid
* expanded/collapsed state
* user-resized height
* timeline selection
* timeline zoom where practical

The implementation should treat Timeline as **Camera-domain infrastructure**, not as a child feature whose lifecycle is owned by Camera3D.

Whether the DOM component literally remains mounted is an implementation choice only if observable state continuity remains perfect; however, code that recreates/reset timeline state on every Plan/3D switch is noncompliant.

---

# 12. Timeline Exposure

Default expanded target:

approximately `240–300 px`.

Collapsed target:

approximately `48 px`.

Timeline includes:

```text
Tour selector

Play
Pause
Follow
Recenter
Stop

Snap

Current / total time

Zoom

Collapse
```

Canonical lanes:

```text
Camera Path
Shots
FOV
Look At
Roll
```

Timeline is Camera-tour semantic UI.

It should not regress into generic raw tracks such as:

```text
Position
Target
FOV
```

as the primary organizational model.

---

# 13. Camera Selection Continuity

Camera domain has one shared selection model.

This is a hard invariant.

Example:

```text
Camera Plan
Select Camera Node 2

→ switch to Camera 3D

Camera Node 2 remains selected
```

This applies to:

* camera nodes
* connections
* path anchors where representable
* relevant transition selection

Plan and 3D are representations of the same camera graph.

They MUST NOT maintain independent duplicate selections that drift apart.

---

# 14. Domain Interaction Boundaries

A domain controls what the user is authoring.

This produces an important interaction rule:

### Scene domain

Camera data may be visible as project context.

Scene operations author Scene data.

### Camera domain

Scene architecture and objects remain visible as spatial/framing context.

Camera operations author Camera data.

Background scene geometry may participate in camera-specific hit tests.

Examples:

* camera placement on floor
* choosing a look target
* framing something in museum

That must not silently convert selection into Scene-object editing.

This prevents domain leakage.

---

# 15. Inspector Routing vs Domain Leakage

Seeing an entity does not automatically mean current workspace should expose all editing operations for that entity.

Example:

A statue remains visible in Camera 3D because designer needs to frame it.

Clicking or targeting statue may support camera framing.

That does not mean Camera workspace should suddenly expose:

```text
Statue Scale
Statue Material
Replace Asset
Cast Shadow
```

Those belong to Scene 3D.

Likewise, Scene workspaces may show Camera entries in project hierarchy without exposing sequence/timeline/framing authoring.

---

# 16. Toolbar Ownership

Toolbar should be selected from current workspace.

Canonical routing:

| Capability          | Scene Plan — Layout | Scene Plan — Staging | Scene 3D | Camera Plan | Camera 3D |
| ------------------- | ------------------: | -------------------: | -------: | ----------: | --------: |
| Select              |                   ✓ |                    ✓ |        ✓ |           ✓ |         ✓ |
| Wall/Room/etc.      |                   ✓ |                    — |        — |           — |         — |
| Measure             |                   ✓ |                    — |        — |           — |         — |
| Move                |          contextual |                 drag |        ✓ |        drag |         ✓ |
| Rotate              | contextual architecture |       rotate handle |        ✓ |           — |         ✓ |
| Scale               | contextual architecture |                    — |        ✓ |           — |         — |
| Add Asset           |                   — |   no 2D placement |        ✓ |           — |         — |
| Add Camera          |                   — |                    — |        — |           ✓ |         ✓ |
| Connect             |                   — |                    — |        — |           ✓ | contextual |
| Path editing        |                   — |                    — |        — |  contextual |         ✓ |
| Frame               |                   — |                    — |        — |           — |         ✓ |
| View controls       |                   ✓ |                    ✓ |        ✓ |           ✓ |         ✓ |

Toolbar should expose workspace intent rather than every operation the underlying data model technically supports.

In Scene Plan, the toolbar routes by **local mode**. In Staging, movement is
direct manipulation (no permanent Move tool) and rotation is the footprint
rotation-handle interaction; architecture tools must not remain misleadingly
active while Staging owns pointer authority.

---

# 17. Viewport Utilities

Secondary view controls remain compact and separate from primary authoring tools.

Examples:

Upper/right:

* orientation cube
* XYZ orientation

Viewport edge/bottom:

* Perspective
* Lit
* Helpers
* Grid

These controls affect how workspace is viewed.

They should not be confused with authoring modes.

---

# 18. Status Bar

Status bar remains globally available.

Possible information:

Left:

```text
Scene • 3D
1 item selected
All changes saved
```

Center:

```text
Alt + Drag orbit
Shift + Drag pan
Scroll zoom
```

Right:

```text
Grid 1.00 m
Snap
Metric (m)
```

Status bar is informational/supporting infrastructure.

Major authoring actions MUST NOT migrate into it.

---

# 19. Workspace State Persistence

Useful editor state should survive workspace switching during session.

### MUST preserve in Camera Plan ↔ Camera 3D

* Camera selection
* graph identity
* sequence
* timeline state
* timeline playhead
* timeline height
* Camera playback context where valid

### SHOULD preserve globally where practical

* active view per domain
* active local authoring mode per workspace (e.g. Scene Plan `layout | staging`,
  remembered for the session and never carried into Camera Plan)
* relevant panel expansion state
* selected entity
* viewport preferences
* snap/grid settings where semantically shared

Example desired behavior:

```text
Scene → 3D
switch Camera
→ Camera opens previous Camera view

switch Scene
→ Scene returns to previous Scene view
```

This is preferred workspace memory, not a requirement to duplicate shell instances.

---

# 20. Domain Switch Behavior

## Scene → Camera

Shell should remain stable.

Changes:

* Scene sidebar → Camera Sidebar
* contextual toolbar → Camera toolbar
* Inspector routes to Camera context/selection
* Camera Timeline expands from bottom
* viewport becomes Camera representation of selected Plan/3D view

Recommended timeline transition:

* height
* opacity
* approximately 180–220 ms

> **Amended 2026-08-21 — owner decision (P1.7 follow-up):** shell view/domain
> switches are **instant** — no fade on workspace, sidebar, timeline, or
> viewport swaps. The Camera Timeline appears/disappears without animation.
> ("Do not animate the entire editor" now applies to all shell swaps.)

## Camera → Scene

Reverse:

* Camera Sidebar → Scene Hierarchy/Assets
* Camera toolbar → Scene toolbar
* Camera Timeline collapses/disappears
* Scene Inspector context restored

Do not animate entire editor around unnecessarily.

---

# 21. View Switch Behavior

## Plan ↔ 3D inside same domain

This should feel cheaper and more continuous than changing domain.

Persistent:

* domain
* left-domain model
* active local authoring mode (Scene Plan `layout | staging`)
* logical selection
* project state
* history
* relevant panel state

Changes:

* viewport representation
* contextual toolbar
* Inspector capabilities where view-specific
* viewport helpers

For Camera specifically:

Timeline remains unchanged.

---

# 22. Capability / Visibility Matrix

Legend:

* **E** = exposed/editable
* **V** = visible/context
* **C** = contextual
* **—** = absent

| Feature            | Scene Plan — Layout | Scene Plan — Staging | Scene 3D | Camera Plan | Camera 3D |
| ------------------ | ------------------: | -------------------: | -------: | ----------: | --------: |
| Architecture       |                   E |                    V | V/E where applicable |              V |         V |
| Scene objects      |                   V |                    E |                      E |              V |         V |
| Scene object Y     |                   — |         preserved only |                      E |              — |         — |
| Scene object scale |                   — |   V — projection only |                      E |              — |         — |
| Scene full rotation |                  — |                    — |                      E |              — |         — |
| Add scene asset    | existing workflows only | no 2D placement in P2 v1 |     E |              — |         — |
| Asset Library      |                 E/C |                 E/C  |                      E |              — |         — |
| Scene Hierarchy    |                   E |                    E |                      E |              — |         — |
| Camera Sidebar     |                   — |                    — |                      — |              E |         E |
| Camera nodes       | V/project structure |  V/project structure |       V/project structure |              E |         E |
| Sequence order     |                   — |                    — |                      — |              E |         E |
| Connections        |                   — |                    — |                      — |              E |         E |
| Camera X/Z         |                   — |                    — |                      — |              E |         E |
| Camera Y           |                   — |                    — |                      — | preserved only |         E |
| Path anchor X/Z    |                   — |                    — |                      — |              E |         E |
| Path anchor Y      |                   — |                    — |                      — | preserved only |         E |
| Camera orientation |                   — |                    — |                      — |              — |         E |
| Look target        |                   — |                    — |                      — |              — |         E |
| FOV authoring      |                   — |                    — |                      — |              — |         E |
| Framing envelope   |                   — |                    — |                      — |              — |       E/C |
| Connection timing  |                   — |                    — |                      — |              E |         E |
| Camera Timeline    |                   — |                    — |                      — |              E |         E |
| Scene Inspector    |                   E |     E — staging surface |                      E |              — |         — |
| Camera Inspector   |                   — |                    — |                      — |              E |         E |

---

# 23. Explicit Workspace Non-Leakage Rules

The following should be considered codebase violations:

**Scene Plan**

Camera timeline appears.

**Scene Plan — Layout**

A passive scene footprint activates Scene editing.

**Scene Plan — Staging**

Architecture becomes selected or mutated through ordinary staging interaction.

**Scene Plan — Staging**

A staging gesture commits a layout history entry, a hidden architecture
mutation, or more than one tagged `scene` entry.

**Scene Plan — Staging**

Camera nodes, camera graph, guided sequence, or Camera Plan's selection
domain become editable.

**Scene 3D**

Camera framing controls appear as normal Scene-object controls.

**Camera Plan**

Scene architecture becomes selectable/editable.

**Camera Plan**

FOV/look-target/frustum UI appears.

**Camera Plan**

Node drag changes camera Y.

**Camera Plan**

Connections use arrows to communicate sequence.

**Camera 3D**

Scene-object manipulation becomes normal Camera workflow.

**Camera Plan ↔ Camera 3D**

Selection changes or resets without user action.

**Camera Plan ↔ Camera 3D**

Timeline resets/remounts in a user-visible way.

**Camera domain**

Sequence and graph topology use same data/UI concept.

**Scene domain**

Camera timeline remains mounted as visible workspace infrastructure.

---

# 24. Codebase Review Targets

When reviewing current implementation, inspect these boundaries rather than only checking screenshots.

### A. Shell ownership

Verify there is a clear notion equivalent to:

```text
activeDomain
activeView
```

rather than four unrelated page states.

### B. Domain/view switchers

Verify Scene/Camera and Plan/3D are independent.

### C. Sidebar routing

Verify Scene and Camera domains expose different structural sidebars.

### D. Toolbar routing

Verify toolbar comes from workspace capability rather than accumulating every editor command.

### E. Inspector routing

Verify one Inspector system can display selection-specific property surfaces.

### F. Timeline ownership

Verify Timeline state belongs to Camera domain.

Look specifically for accidental ownership such as:

```text
Camera3D
  └── Timeline
```

if that causes Plan switching to destroy timeline state.

Conceptually preferred ownership:

```text
CameraWorkspace
  ├── CameraPlan / Camera3D
  └── Timeline
```

Exact component architecture is not mandated; behavioral ownership is.

### G. Camera shared selection

Check for duplicated Plan-selection and 3D-selection stores.

There should be one canonical Camera selection identity.

### H. Scene/Camera authority boundaries

Check whether Camera views accidentally invoke Scene manipulation commands or vice versa.

### I. Plan coordinate constraints

Verify Camera Plan editing preserves Y.

### J. Connection vs Sequence modeling

Verify UI and state do not infer guided order from graph direction.

### K. Workspace memory

Verify switching does not unnecessarily reset:

* selection
* expanded panels
* active Camera timeline
* playhead
* view preferences

### L. Undo ownership

Verify each continuous user gesture results in one logical undo action.

### M. Scene Plan local mode

Verify `layout | staging` is Scene Plan-local, routes toolbar/Inspector/
hit-testing by mode, and does not alter global domain/view semantics or
carry into Camera Plan.

### N. Staging hit-test authority

Verify Layout and Staging do not compete for normal click selection, and
that passive footprint projection never activates Scene editing in Layout
mode.

### O. Staging footprint states

Verify the four staging footprint states render distinctly (passive,
bridge-hover, active staging, selected + rotate handle) and that the
rotate handle follows the pivot/Shift-snap contract.

### P. Scene selection continuity

Verify Scene Plan ↔ Scene 3D creates no duplicate Scene selection state,
and that returning from Staging to Layout makes the Scene selection
inactive/passive without destroying identity.

### Q. Mutation and history tagging

Verify staging operations change only X/Z/yaw, preserve Y exactly, and
commit exactly one tagged `scene` history entry per completed gesture.

### R. Room drag isolation

Verify layout room motion never silently moves Scene furniture.

---

# 25. Recommended Shell State Model for Review

This is conceptual, not a required TypeScript API.

```text
EditorShell
├── Project State
├── Active Domain
│   ├── Scene
│   └── Camera
├── View State
│   ├── Scene: Plan | 3D
│   │   └── Scene Plan mode: layout | staging
│   └── Camera: Plan | 3D
├── Selection
├── History
├── Viewport Preferences
├── Scene Workspace State
└── Camera Workspace State
    ├── Camera Selection
    ├── Sequence
    ├── Playback
    └── Timeline State
```

The important design point is ownership.

Workspace-specific state should live high enough that changing representation does not accidentally destroy it.

Scene Plan's `layout | staging` mode is workspace-local state: scoped to
Scene → Plan, remembered for the editor session, and never carried into
Camera Plan.

---

# 26. Shell Acceptance Criteria

Implementation satisfies shell model when all following user flows work naturally:

### Scene authoring continuity

```text
Scene Plan
edit wall
→ Scene 3D
same museum immediately visible
```

### Scene object continuity

```text
Scene 3D
select statue
→ manipulate statue
→ switch Plan
project remains same scene
```

### Scene Plan mode continuity

```text
Scene Plan
Staging active

→ Scene 3D
→ back to Scene Plan

Staging active again

→ Camera Plan

no staging mode control appears
no staging selection carries over
```

### Camera spatial/framing continuity

```text
Camera Plan
select Camera 2
→ Camera 3D
Camera 2 remains selected
```

### Camera timeline continuity

```text
Camera 3D
scrub to 00:07.8
resize timeline
→ Camera Plan
same 00:07.8
same timeline height
same tour
```

### Domain isolation

```text
Camera Plan
click wall while Select active
→ wall does not enter Scene architecture editing
```

### Camera placement through environment

```text
Camera Plan
Add Camera
click valid room floor
→ camera created at corresponding spatial location
```

### Plan coordinate preservation

```text
Camera height = 1.7m
Camera Plan
drag camera across room
→ X/Z change
→ Y remains 1.7m
```

### Timing authoring

```text
Camera Plan
select connection A—B
set duration 4.2 s
→ edge label shows 4.2 s
→ playback uses 4.2 s for that direction

bend the path
→ length changes
→ duration stays 4.2 s
→ derived speed readout updates
```

### Topology truth

```text
connect Camera 1 and Camera 2
→ undirected connection visible
→ sequence does not silently change
```

### Sequence truth

```text
reorder guided sequence
→ sequence changes
→ graph connections do not silently change except explicitly allowed operation
```

### Scene/Camera transition

```text
Scene
→ Camera
timeline expands

Camera
→ Scene
timeline disappears

other shell regions remain spatially stable
```

---

# 27. Review Principle

Codebase review should not ask only:

> Does component exist?

It should ask:

> Does component belong to correct workspace, have correct authority, preserve correct state, and disappear where concept does not belong?

A feature exposed in wrong workspace is a UX architecture defect even when feature itself works correctly.

The shell is therefore not merely layout.

It is the product's **capability boundary**.

Its job is to ensure user always knows:

```text
What domain am I editing?
Which representation am I using?
What can I change here?
What remains context only?
What state will follow me when I switch views?
```

That contract should guide both UI implementation and future codebase reviews.

---

# 28. Selection Authority vs Workspace Identity

The shell separates two concepts that must not be conflated:

1. **active workspace** — which workspace is mounted
2. **active document / selection authority** — which document layer accepts
   selection and mutation

In Scene → Plan the local mode determines the selection authority:

```text
Layout mode
Workspace:          Scene → Plan
Selection authority: LayoutDocument

Staging mode
Workspace:          Scene → Plan
Selection authority: SceneDocument
```

This is intentional, not domain leakage. The user remains in the Scene
domain throughout; the mode selects which Scene-owned document layer
currently accepts selection and mutation.

Hierarchy selection follows the same mode authority:

* **Layout mode** — selecting a wall/room in Hierarchy activates normal
  layout selection.
* **Staging mode** — selecting a supported placed scene entity activates
  Scene selection and shows its footprint.

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

---

# 31. Mode Persistence

`layout | staging` is remembered while the user remains in the editor
session:

```text
Scene Plan
Staging active

→ Scene 3D
→ back to Scene Plan

Staging active again
```

Rules:

* the mode is associated with **Scene Plan**, not global
* switching to Camera Plan must not carry Staging into Camera
* entering or leaving Staging creates no document mutation and does not
  change the selected entity
