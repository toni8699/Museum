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

**Split 2026-08-21:** scene/camera workspace sections moved verbatim to
[`Shell-scene-workspaces.md`](./Shell-scene-workspaces.md) ·
[`Shell-camera-workspaces.md`](./Shell-camera-workspaces.md) — section
numbers unchanged, so external `§N` references stay valid.

| Working on… | Read | Sections |
|---|---|---|
| Global shell · switching · capability matrix · acceptance criteria | this file | §1–§5 · §14–§28 · §31 |
| Scene workspaces (Plan/Layout/Staging · 3D · assets) | [`Shell-scene-workspaces.md`](./Shell-scene-workspaces.md) | §6–§8 · §29–§30 |
| Camera workspaces (Plan · 3D · timeline) | [`Shell-camera-workspaces.md`](./Shell-camera-workspaces.md) | §9–§13 |

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
* collapsible neighbor list — directly-connected cameras (graph truth, never
  reachability): sequenced neighbors show their order number, unsequenced
  neighbors show as unsequenced, neighbors that head an explicit Branch carry
  a `Branch` tag

Per-row connection trees are not part of Sequence rows — connections live in
the Connections section (undirected) and the Inspector. Reordering is
drag-only; no per-row order-arrow controls. (P1.9 sidebar simplification.)

### Unsequenced

Contains camera nodes not currently participating in the sequence.

Unsequenced cameras may still participate in graph connections.

Rows may expose a collapsible neighbor list and a relationship line that
never overclaims adjacency: "Neighbor of ⟨camera⟩" for a direct edge to a
sequenced camera, otherwise "Connected to ⟨camera⟩" (per
`Camera-flow-specs.md` §8). (P1.9 sidebar simplification.)

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


---

# 6.–13. Workspace exposure — moved 2026-08-21

Scene workspaces — §6 Scene → Plan · §7 Scene → 3D · §8 Asset-management
state · §29 Staging footprints · §30 Scene selection continuity:
[`Shell-scene-workspaces.md`](./Shell-scene-workspaces.md).

Camera workspaces — §9 Camera → Plan · §10 Camera → 3D · §11 Timeline
ownership · §12 Timeline exposure · §13 Camera selection continuity:
[`Shell-camera-workspaces.md`](./Shell-camera-workspaces.md).

Section numbers are unchanged by the move; external `§N` references stay
valid against the files above.

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
