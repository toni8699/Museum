# Museum Editor — Shell Spec · Camera Workspaces

**Status:** part of the shell/workspace exposure specification — **ratified 2026-08-19**; split from [`Design-shell-specs.md`](./Design-shell-specs.md) 2026-08-21 (**section numbers preserved**).
**Scope:** §9 Camera → Plan · §10 Camera → 3D · §11 Timeline ownership · §12 Timeline exposure · §13 Camera selection continuity.
Global shell / cross-domain rules live in [`Design-shell-specs.md`](./Design-shell-specs.md); scene workspaces in [`Shell-scene-workspaces.md`](./Shell-scene-workspaces.md).

---

# 9. Camera → Plan

## Purpose

Spatial Camera graph/topology authoring.

> **Behavioral canonical:** [`../components/camera-tour.md`](../components/camera-tour.md).
> This section pins MUST-level exposure only.

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

Rows follow `Design-shell-specs.md` §4: order number + name, drag-only reorder,
and no per-row order arrows (P1.9). A row chevron expands a flat list of its
directly connected Unsequenced sidequest cameras; ordered Sequence neighbors
are omitted. Expansion is component-local, and Environment remains read-only.
There is no standalone Neighbors section.

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

Rows follow `Design-shell-specs.md` §4: order number + name, drag-only reorder,
and no per-row order arrows (P1.9). Per-camera chevrons disclose only directly
connected Unsequenced sidequests; ordered Sequence neighbors are omitted.
Expansion is component-local, Environment is read-only, and there is no
standalone Neighbors section.

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

Default expanded height: `288px`. User-resized range: `240–300px`.

Collapsed height: `48px`.

Timeline includes a compact scope/transport header. P11 supersedes the earlier
separate preview-control presentation:

```text
[Camera · C | Edge · B → C | Sequence]  |◀  [Play / Pause / Replay]
[00:01.20 / 00:04.20]  [Observer ↔ Through Camera] [Follow] [Recenter]
```

Camera scope is static and keeps transport quiet/disabled. Edge scope exposes
local time, scrub, Reverse, and temporary Repeat. Sequence scope exposes global
time and derived topology-loop state, but no generic loop toggle. Stop is not
normal timeline chrome; internal teardown remains required for Escape,
stale/invalid cleanup, document replacement, Camera-domain exit, and explicit
lifecycle boundaries.

Canonical lanes:

```text
Camera Path
Shots
FOV
Look At
Roll
```

The current implementation has two backing lanes, `Guided Route / Camera
Framing` (`EditorCameraTimelineDots.svelte:556` /
`editor-camera-timeline.ts:56`). The canonical five-lane display in
`Design-png/Camera/camera-timeline-expanded.png` is a visual projection:
`Camera Path` ← `timeline.edges`; `Shots` ← node labels/holds (no store entity
yet); `FOV`/`Look At` ← one `RuntimeCameraViewKeyframe`
(`types/scene.ts:78`); `Roll` ← quiet `0°`
(`editor-camera-view.ts:136`, not representable). Timeline remains
`Graph + Sequence → Timeline` (`editor-camera-timeline.ts:128`).

Timeline is Camera-tour semantic UI. Camera/Edge selection normally drives the
active local scope; `Preview Sequence` is the explicit whole-route exception.
Selection never autoplays. Playing owns the evaluated camera pose; a safe
authoring gesture auto-pauses first, while paused/complete preview remains
inspectable and authorable through the canonical pipeline. This P11 contract
supersedes the former selection-independent preview rule.

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
