# Museum Editor — Shell & Workspace Exposure Specification

**Status:** canonical domain/view exposure specification — **ratified 2026-08-19**; reconciled with the current `Scene | Camera` × `Plan | 3D` product shell
**Purpose:** codebase conformance review
**Scope:** editor shell composition, workspace ownership, component visibility, interaction authority, persistence, and cross-workspace transitions.
**Last reconciled:** 2026-09-03 — P21+ shell-placement reconciliation
(placement/chrome hierarchy only; capability/exposure rules unchanged, see
note below). Prior provenance: 2026-08-23 — P9, plus the **P10 amendment
(2026-08-23):** Scene → Plan's local mode is the owner-aware `Layout |
Arrange` surface (staging terminology below refers to the shipped pre-P10
state). Camera uses `Unsequenced` for cameras outside the ordered subset.
Current rules are written directly below rather than layered as amendments.

**Split 2026-08-21:** scene/camera workspace sections moved verbatim to
[`Shell-scene-workspaces.md`](./Shell-scene-workspaces.md) ·
[`Shell-camera-workspaces.md`](./Shell-camera-workspaces.md) — section
numbers unchanged, so external `§N` references stay valid.

| Working on… | Read | Sections |
|---|---|---|
| Global shell · switching · capability matrix · acceptance criteria | this file | §1–§5 · §14–§28 · §31 |
| Scene workspaces (Plan/Layout/Arrange · 3D · assets) | [`Shell-scene-workspaces.md`](./Shell-scene-workspaces.md) | §6–§8 · §29–§30 |
| Camera workspaces (Plan · 3D · timeline) | [`Shell-camera-workspaces.md`](./Shell-camera-workspaces.md) | §9–§13 |

This specification complements the [visual UI specification](./Design-specs.md). The domain/view terminology below is the current product shell contract and should be kept consistent with the North Star and architecture docs.

The visual specification answers:

> What should the editor look like?

This specification answers:

> What should each workspace contain, expose, allow, preserve, and hide?

It intentionally does **not** prescribe Svelte component structure, stores, routing strategy, rendering architecture, or implementation technology.

> **P21+ reconciliation note (2026-09-03):** Shell placement and chrome
> hierarchy amended by [`Design-Plan(P21+).md`](./Design-Plan(P21+).md);
> workspace capability/exposure rules in this document remain canonical.
> Where this spec describes a single global header or a permanent floating
> contextual viewport toolbar, the P21+ two-row shell (Row 1 Project Row ·
> Row 2 Workspace Ribbon) supersedes that **placement** only. No capability,
> authority, or mutation matrix below is changed by this amendment.

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
| Scene → Plan  | Author the museum spatially in 2D (Layout \| Arrange) |
| Scene → 3D    | Full scene-object authoring and new placement         |
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
│  └─ Arrange  → arrange movable objects in 2D (Layout objects + Scene entities)
└─ 3D          → fully author scene objects in 3D

Camera
├─ Plan        → author camera position/topology
└─ 3D          → author camera movement/framing
```

Rules:

* `layout | arrange` controls what kind of Scene content Plan is currently
  authoring.
* It sits **below** `Scene → Plan`. Arrange is not a fifth workspace.
* Arrange MUST NOT appear beside `Scene | Camera` or `Plan | 3D`.
* The mode is Scene Plan-local: switching to Camera Plan never carries
  Arrange into Camera.
* Arrange unifies object manipulation, not ownership: each target routes to
  its existing owner pipeline (P10).

---

# 2. Global Shell Contract

The editor shell consists of persistent regions. **P21+ placement (amended by
[`Design-Plan(P21+).md`](./Design-Plan(P21+).md)):** the former single global
header + permanent floating contextual viewport toolbar are replaced by a
Project Row (Row 1) and a Workspace Ribbon (Row 2):

```text
PROJECT ROW — Row 1
WORKSPACE RIBBON — Row 2
┌──────────────┬──────────────────────────────┬───────────────────┐
│              │                              │                   │
│ LEFT PANEL   │          VIEWPORT            │ INSPECTOR         │
│              │                              │                   │
├──────────────┴──────────────────────────────┴───────────────────┤
│ CAMERA TIMELINE — Camera domain only                            │
├─────────────────────────────────────────────────────────────────┤
│ STATUS BAR                                                      │
└─────────────────────────────────────────────────────────────────┘
```

Region ownership (placement per P21+; capabilities below remain canonical):

| Region           | Responsibility                                                                  |
| ---------------- | ------------------------------------------------------------------------------- |
| Project Row      | project identity, persistence, project navigation, history slot, Visitor Preview, account |
| Workspace Ribbon | active workspace routing + contextual authoring commands + precision/view controls |
| Left panel       | structure/resources belonging to current domain                                |
| Viewport         | spatial authoring + direct-manipulation overlays only                           |
| Inspector        | properties of current selection                                                 |
| Timeline         | temporal Camera authoring                                                       |
| Status bar       | state, navigation hints, snap, units                                            |

The overall shell should remain structurally stable while workspace-specific content changes inside these regions.

---

# 3. Project Row (Row 1) and Workspace Ribbon (Row 2)

**P21+ placement (amended by [`Design-Plan(P21+).md`](./Design-Plan(P21+).md)
§C):** the former single global header + permanent contextual viewport toolbar
split into two chrome rows. Capability and authority rules are unchanged — this
is placement only.

Row 1 (Project Row) exists across **all four project surfaces** (Spatial and Experience as the two primary creative modes; Assets and Publish as project-level supporting surfaces). It exposes:

* product/project identity
* current project name (inline editable)
* persistence location + save state (Row 1 persistence cluster)
* project-level navigation (`Spatial | Experience | Assets | Publish`)
* the global Undo/Redo slot
* project-level Visitor Preview
* account / sign-in
* project-level document menu/actions
* editor/settings access where applicable

Row 2 (Workspace Ribbon) owns workspace routing and contextual authoring:

* `[Scene | Camera]`
* `[Plan | 3D]`
* active authoring tools for the current workspace

Row 1 MUST NOT contain workspace-specific manipulation commands such as:

* Move
* Rotate
* Add Camera
* Wall
* Measure
* Frame
* Path

Those belong to the contextual Workspace Ribbon (Row 2).

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

Environment is read-only architectural context. Its local expansion state
must never mutate layout, selection, or history.

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
* a per-camera disclosure chevron

An expanded camera row shows a flat list of its directly connected
Unsequenced sidequest cameras. Ordered Sequence neighbors are already implied
by the ordered list and MUST NOT be repeated in the disclosure. Expansion is
component-local. Reordering is drag-only; no per-row order-arrow controls.
(P1.9 sidebar simplification.)

### Unsequenced

Contains camera nodes not currently participating in the sequence.

Unsequenced cameras may still participate in graph connections.

Rows expose camera identity, drag handle, selection, a relationship line that
never overclaims adjacency, and the same per-camera disclosure chevron.
Disclosed neighbor rows identify explicit Branch state where applicable and
never use topology arrows or order-arrow controls. There is no standalone
Neighbors section.

### Connections

Lists actual topology.

Representation must remain undirected:

`Camera 1 — Camera 2`

not:

`Camera 1 → Camera 2`

Every active sketch follows this rule. `Design-png/README.md` is the canonical
visual registry; no active topology list uses directional arrows.

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

**P21+ placement:** contextual authoring tools live in the Workspace Ribbon
(Row 2) rather than a floating viewport toolbar. The viewport retains only
direct-manipulation fixtures (selection handles, gizmos, orientation box).

Toolbar should be selected from current workspace.

Canonical routing:

| Capability          | Scene Plan — Layout | Scene Plan — Arrange | Scene 3D | Camera Plan | Camera 3D |
| ------------------- | ------------------: | -------------------: | -------: | ----------: | --------: |
| Select              |                   ✓ |                    ✓ |        ✓ |           ✓ |         ✓ |
| Wall/Room/etc.      |                   ✓ |                    — |        — |           — |         — |
| Measure             |                   ✓ |                    — |        — |           — |         — |
| Move                |          contextual |   drag (owner-routed) |        ✓ |        drag |         ✓ |
| Rotate              | contextual architecture |  rotate handle (owner-routed) |        ✓ |           — |         ✓ |
| Scale               | contextual architecture |                    — |        ✓ |           — |         — |
| Add Asset           |                   — |   no 2D placement |        ✓ |           — |         — |
| Add Camera          |                   — |                    — |        — |           ✓ |         ✓ |
| Connect             |                   — |                    — |        — |           ✓ | contextual |
| Path editing        |                   — |                    — |        — |  contextual |         ✓ |
| Frame               |                   — |                    — |        — |           — |         ✓ |
| View controls       |                   ✓ |                    ✓ |        ✓ |           ✓ |         ✓ |

Toolbar should expose workspace intent rather than every operation the underlying data model technically supports.

In Scene Plan, the toolbar routes by **local mode**. In Arrange, movement is
direct manipulation (no permanent Move tool) and rotation is the footprint
rotation-handle interaction, both routed to the active owner; architecture
tools must not remain misleadingly active while Arrange owns pointer
authority.

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

## Scene 3D gizmo and orientation-box contract

The detailed Scene → 3D overlay contract is defined in
[`Shell-scene-workspaces.md` §7](./Shell-scene-workspaces.md#7-scene--3d) and
[`Design-specs.md` §28A](./Design-specs.md#28a-scene-3d-gizmo-selection-outlines-and-orientation-box).
The shell owns exposure and isolation:

* the selected-object Move/Rotate/Scale gizmo is an authoring overlay exposed
  only in Scene → 3D;
* the compact XYZ orientation box is a view utility exposed only in the
  unified 3D view while Scene/object authoring owns the active interaction
  context, pinned to the viewport's upper-right corner rather than the
  bottom-left;
* the orientation box is not a selection target, transform-space switch, or
  replacement for TransformControls;
* the RGB axis mapping is X `#F05252`, Y `#45C878`, Z `#3B82F6`, and the
  selection/outline language uses the canonical blue tokens in Design-specs §8.

P3 is cosmetic only: it reconciles the PNG-matching geometry, placement,
colors, line weights, opacity, selection outlines, layout boxes, gizmo handles,
and widget states without changing authority or input semantics. Post-P3
**P3B** adds only the orientation-box interaction: camera-following state,
axis/face click or keyboard activation through the existing canonical view-snap
API, isolated hit testing, selection preservation, no document/history mutation,
and no widget-drag orbit. P3B does not add Plan scaling or create additional
workspaces. The current shell remains the explicit `Scene | Camera` × `Plan | 3D`
model. The Scene 3D layout/object selection sketch also sets the visual direction
for passive layout boxes: use the quiet white/light layout-box treatment from the
sketch rather than amber or dark-neutral emphasis.

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

### Shared view axis

`Plan | 3D` is one shared shell value. Domain changes preserve that value:

```text
Scene → Plan
switch Camera
→ Camera → Plan

Camera → 3D
switch Scene
→ Scene → 3D
```

Never restore a separate previous view per domain. Preserve the active Scene
Plan local mode (`layout | arrange`) for the session, but never carry it into
Camera Plan. Relevant panel expansion, logical selection, viewport preferences,
and semantically shared grid/snap settings should survive switching where valid.

---

# 20. Domain Switch Behavior

## Scene → Camera

Shell should remain stable.

Changes:

* Scene sidebar → Camera Sidebar
* Workspace Ribbon tools → Camera-domain ribbon tools (Row 2)
* Inspector routes to Camera context/selection
* Camera Timeline expands from bottom
* viewport becomes Camera representation of selected Plan/3D view

Shell view/domain switches are **instant** — no fade on workspace, sidebar,
timeline, or viewport swaps. Camera Timeline appears/disappears without
animation; its expansion state remains unchanged.

## Camera → Scene

Reverse:

* Camera Sidebar → Scene Hierarchy/Assets
* Camera-domain ribbon tools → Scene-domain ribbon tools (Row 2)
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
* active local authoring mode (Scene Plan `layout | arrange`)
* logical selection
* project state
* history
* relevant panel state

Changes:

* viewport representation
* Workspace Ribbon (Row 2) tools
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

| Feature            | Scene Plan — Layout | Scene Plan — Arrange | Scene 3D | Camera Plan | Camera 3D |
| ------------------ | ------------------: | -------------------: | -------: | ----------: | --------: |
| Architecture       |                   E |                    V | V/E where applicable |              V |         V |
| Scene objects      |        V (eligible footprints) | E (eligible placements) |                      E |              — |         V |
| Layout objects     |                   E | E (non-profile; layout pipeline) |                      E |              — |         — |
| Scene object Y     |                   — |         preserved only |                      E |              — |         — |
| Scene object scale |                   — |   V — projection only |                      E |              — |         — |
| Layout object dimensions |              E |   read-only in Arrange |                      E |              — |         — |
| Layout object room ownership |          E |  read-only; never inferred from coordinates |  E |              — |         — |
| Scene full rotation |                  — |                    — |                      E |              — |         — |
| Scene 3D transform gizmo |                — |                    — |                      E |              — |         — |
| Scene 3D object outline |                   — |                    — |                      E |              — |         — |
| XYZ orientation box (visual) |               — |                    — |                      V |              — |         — |
| XYZ orientation box (input, P3B) |           — |                    — |                      E |              — |         — |

*The matrix above is retained for current implementation review; it does not
create a final greenfield workspace architecture.*
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
| Scene Inspector    |                   E |     E — owner-aware Arrange surface |                      E |              — |         — |
| Camera Inspector   |                   — |                    — |                      — |              E |         E |

---

# 23. Explicit Workspace Non-Leakage Rules

The following should be considered codebase violations:

**Scene Plan**

Camera timeline appears.

**Scene Plan — Layout**

A passive scene footprint activates Scene editing.

**Scene Plan — Layout / Arrange**

A Scene 3D TransformControls gizmo or XYZ orientation-box input target
appears in either Plan mode, or Plan exposes a 3D scaling gesture.

**Scene Plan — Arrange**

Architecture becomes selected or mutated through ordinary Arrange interaction.

**Scene Plan — Arrange**

A gesture commits a **wrongly tagged or multi-document** history entry — e.g. a
Scene-owner gesture writing a `layout` entry, a Layout-owner gesture writing a
`scene` entry, or more than one tagged entry per completed gesture. (A
Layout-owner Arrange gesture moving a Layout object is the sanctioned P10
path, not a violation.)

**Scene Plan — Arrange**

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

Verify `layout | arrange` is Scene Plan-local, routes toolbar/Inspector/
hit-testing by mode, and does not alter global domain/view semantics or
carry into Camera Plan.

### N. Arrange hit-test authority

Verify Layout and Arrange do not compete for normal click selection, that
passive footprint projection never activates Scene editing in Layout mode,
and that cross-owner modifier-clicks switch owner and replace the active
selection (never add across owners).

### O. Arrange footprint states

Verify the Arrange footprint states render distinctly for **both owners**
(passive, bridge-hover, active, selected + owner-aware rotate handle) and
that the rotate handle follows the pivot/Shift-snap contract.

### P. Scene selection continuity

Verify Scene Plan ↔ Scene 3D creates no duplicate Scene selection state,
and that returning from Arrange to Layout makes the Scene selection
inactive/passive without destroying identity. Verify the P10 last-owner
memory: Arrange restores the remembered owner's eligible slot and never
resurrects an object that left its canonical slot.

### Q. Mutation and history tagging

Verify Arrange operations change only X/Z/yaw, preserve Y exactly (Scene
owner) and room ownership (Layout owner), and commit exactly one correctly
tagged history entry (`scene` or `layout`) per completed gesture.

### R. Room-local Scene follow

Verify layout room motion changes the room frame and therefore changes
contained Scene entities' derived world transforms, while leaving
`SceneDocument` unchanged and creating exactly one `layout` history entry.

### S. Scene 3D visual overlay contract

Verify Scene 3D uses the canonical RGB axis tokens, blue selected/hovered
outline states, rotation-aware object boxes, and the separate selected-object
transform gizmo. Verify P3 visual work does not alter selection authority,
scale semantics, pointer priority, or history.

### T. Orientation-box interaction contract

Verify the XYZ orientation box is upper-right and unified-3D-only under the
Scene/object authoring context; after P3B, axis/face click or keyboard
activation changes only the camera view, preserves selection, cannot be dragged
to orbit, and creates no document/history entry.
Verify its hit targets do not compete with object selection or TransformControls.

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
│   │   └── Scene Plan mode: layout | arrange
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

Scene Plan's `layout | arrange` mode is workspace-local state: scoped to
Scene → Plan, remembered for the editor session, and never carried into
Camera Plan. P10 adds the Arrange session's remembered last owner (routing
only — never an object identity).

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

### Scene 3D gizmo and orientation utility

```text
Scene 3D
select statue
→ blue outline + selected-object transform gizmo
→ use upper-right XYZ box
camera view snaps/follows as specified
→ statue remains selected
→ SceneDocument/history unchanged by the widget
```

The orientation box is not present in Scene Plan or Camera workspaces, and
Plan Arrange never exposes a 3D scale gizmo.

### Scene Plan mode continuity

```text
Scene Plan
Arrange active

→ Scene 3D
→ back to Scene Plan

Arrange active again

→ Camera Plan

no Arrange mode control appears
no Arrange selection carries over
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

Arrange mode — owner-aware (P10)
Workspace:          Scene → Plan
Selection authority: target owner — Layout-object target → LayoutDocument;
                      Scene-entity target → SceneDocument
```

This is intentional, not domain leakage. The user remains in the Scene
domain throughout; the mode selects which Scene-owned document layer
currently accepts selection and mutation. Arrange routes per target owner
(P10): the derived active target decides the mutator, transaction, and
history tag.

Hierarchy selection follows the same mode authority:

* **Layout mode** — selecting a wall/room in Hierarchy activates normal
  layout selection.
* **Arrange mode** — selecting an eligible Layout object or supported
  placed scene entity activates that owner's selection and shows its
  footprint; the remembered last owner (never an object identity) routes
  Arrange entry.

---

# 31. Mode Persistence

`layout | arrange` is remembered while the user remains in the editor
session:

```text
Scene Plan
Arrange active

→ Scene 3D
→ back to Scene Plan

Arrange active again
```

Rules:

* the mode is associated with **Scene Plan**, not global
* switching to Camera Plan must not carry Arrange into Camera
* entering or leaving Arrange creates no document mutation and does not
  change the selected entity
