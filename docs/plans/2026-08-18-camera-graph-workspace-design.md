# Camera graph workspace — design summary (ready for review)

**Status:** design summary / review artifact — not an implementation plan.
**Date:** 2026-08-18. **Reviewed:** 2026-08-18 — two doc-review rounds. Round 1:
five structural amendments folded into §4–§5, four open questions resolved in
§7, naming fix in §8, final shape approved in §10. Round 2 (this pass): five
hardening amendments folded in — path-anchor ownership (§4.4/§4.5), fixed
Plan|3D switch order (§5.1), free-vs-ordered node visual state (§5.2), backdrop
hit-testing (§4.6), connection-deletion invariant (§5.5). Design rated ~9/10 by
the reviewer, ready after this amendment pass.
**Relation to other docs:** the camera *pose/framing* question (rotation, default
view, breakpoints, start/end envelope) is covered separately in
[`2026-08-18-camera-framing-design-review.md`](./2026-08-18-camera-framing-design-review.md).
This doc covers the *workspace and graph-authoring* vision: how designers see and
edit the camera network, what surface it lives on, and how it fits the editor shell.

## 1. TL;DR

The product vision: *camera nodes as a graph* — intuitively create, drag, connect,
reorder, delete; connections auto-configure (straight lines by default); the camera
automatically faces the direction of travel with no authored framing.

**Verdict from the codebase: the graph model and ~90% of the interaction model
already ship.** What's genuinely new is (a) a dedicated **Camera Plan surface** and
(b) the **shell structure** it implies. Two decisions were made in discussion and
confirmed by review, then hardened by a second review round (see §10):

1. **The 2D surface is a plan overlay, not an abstract node-editor schematic** —
   camera nodes drawn at their real world positions on a top-down plan backdrop,
   driving the same store commands the 3D view already uses.
2. **The shell becomes a domain×view matrix** — `Scene | Camera` as the primary
   domain switcher, each domain owning a `Plan | 3D` view pair (fixed order —
   §5.1): `Scene → Plan|3D`, `Camera → Plan|3D`.

## 2. The vision, restated

> Camera nodes form a graph. Designers **create, drag, connect, reorder, and
> delete** nodes intuitively. **Connections auto-configure** — a simple straight
> line connects two nodes so the designer always sees what's connected to what.
> The camera **automatically faces forward along the path** when nothing is
> authored, and fine-tuning the actual path movement stays manual.

## 3. What already exists (verified against shipped code)

| Vision element | Status | Where |
|---|---|---|
| Camera nodes as a graph | **Shipped** — the core data model | `NavigationGraph`: nodes + undirected connection records + `next/prev` flow-order links |
| Create a node (free node) | **Shipped** — click a room floor → camera node | `beginCameraPlacement` / `createPendingNavigationNodeAt`; "free node" state exists (S10.2, "Not in order yet") |
| Drag nodes | **Shipped** — full XYZ translate; rotate orbits look target around eye | camera gizmo adapter |
| Delete nodes / connections | **Shipped** — validated, one history entry, undo | `deleteNavigationNode`, `deleteConnection` |
| Insert / reorder / detour in the flow | **Shipped** (S10.2) | insert-into-gap, remove-from-flow, timeline drag-reorder, detours |
| Connect two nodes | **Shipped** — click source, click destination | `beginConnectExistingNodes` + `connectNavigationNodes` |
| Straight-line connection auto-appears | **Shipped** — a fresh connection stores zero interior anchors; the runtime resolver synthesizes node endpoints, and the two-point auto-bézier renders as a straight line | `resolveSceneDocument` (resolver-owned endpoints) + `createDraftConnectionPositionPath` (editor preview) |
| Fine-tuning stays manual | **Shipped** — dragging adds interior anchors to bend the line into a curve | path-anchor authoring |
| Auto face-forward default | **Shipped** — look-ahead-2-samples, level-clamped gaze; FOV lerp between endpoints | `buildLookAheadTargets` / motion sampler (see the framing review) |

**The actual gap:** no **2D graph surface** — today all camera graph interaction
happens in the 3D viewport, and the sidebar is a list/timeline, not a graph.

## 4. Decision 1 — Camera Plan is a plan overlay, not a schematic

### 4.1 The rejected alternative

A node-editor canvas (Blender/blueprint style) where node position is diagram
layout. It creates a mapping problem — every node needs a phantom diagram
coordinate, a layout engine or saved layout state, and a world-pose fallback for
new nodes ("created in a void, then where is it in the museum?").

### 4.2 The chosen surface

Draw the 2D view as a **top-down plan of the museum** (rooms/walls from the
existing Plan render model + room registry) and put camera nodes at their
**actual** positions. Node position in the diagram *is* the world position — no
layout state, no mapping. Dragging a node in 2D moves its real floor XZ.

### 4.3 Interaction model

The 2D view is a **parallel input surface driving the same store commands as the
3D view** — no new graph store:

| Action | Interaction | Reuses |
|---|---|---|
| Add camera | Toolbar mode → **click a room floor** → free node created there | click-floor placement; a "create free node, commit standalone" path is a small mutator addition |
| Connect | Toolbar mode → **click source → click target** → straight line appears; rubber-band preview while awaiting the target | `beginConnectExistingNodes` + `connectNavigationNodes` (shipped) |
| Move node | Select → drag node (X/Z) | `updateNavigationNodePoint` (shipped) |
| Shape path | Select → drag an edge's **interior anchor** (X/Z) | path-anchor mutator (shipped) |
| Delete | Select → Delete | `deleteNavigationNode` / `deleteConnection` (shipped) |
| Flow order | Sidebar panel / timeline (not the diagram) | S10.2 order ops (shipped) |

Explicitly **no cross-workspace dragging**: nothing is dragged between windows;
each surface creates/edits in its own coordinate space and writes the same document.

### 4.4 Scope boundary — topology, position, and path shape; never framing

Camera Plan is **topology, position, and path-shape authoring** (X/Z only — §4.5).
**Path anchors are editable in Camera Plan** (interior anchors, X/Z; see §4.5 for
the Y rule) — this is the decision that makes "Plan = spatial layout/path shape,
3D = depth/height/framing" hold across the whole product. Look targets, authored
orientation, breakpoints, and framing envelopes remain **Camera → 3D** concerns.
Concretely: no target point is drawn, no target dragging in Plan, no heading icon
on the node. For the automatic face-forward default, a target would not even
represent useful authored intent — it is derived from the path. This gives each
surface a strong, non-overlapping job:

- **Camera → Plan:** where the cameras are and how they are connected, plus the
  X/Z shape of the connection paths between them.
- **Camera → 3D:** framing and full-depth path editing — how the camera actually
  looks at the world, including Y and framing.

### 4.5 Dragging in 2D — the Y rule

A 2D drag changes **X/Z only; the camera eye's Y (height) is never touched**. The
phrase "moves its real floor position" must not be read as "the camera snaps to
floor elevation." Rule: *2D drag edits X and Z; Y stays authored.*

The **same rule applies to path anchors**: dragging a connection's interior anchor
in Camera Plan edits its X/Z only; anchor Y stays authored, exactly like node Y.
Full XYZ path editing remains Camera → 3D.

Future case (rooms with different floor heights): decide once whether crossing a
room boundary preserves **authored Y absolutely** or **height relative to the
floor**. **Recommended now: preserve authored Y absolutely** — simple, no hidden
behavior. The decision is deferred until rooms with differing floor heights exist.

### 4.6 Backdrop read-only boundary

- **Scene → Plan** authors environment geometry (rooms, walls) — editable.
- **Camera → Plan** shows the *same* geometry as **spatial context only** — not
  editable, not selectable. Clicking a wall in Camera Plan does not select the wall.

**Single render model, no separate copy.** Camera Plan reuses the same Scene Plan
render model as its spatial backdrop; it does not maintain a separate copy of
scene-plan geometry. Camera-specific nodes, paths, and anchors render as an
authoring overlay on top.

This is a deliberate product rule, not an oversight. It makes the domain×view
matrix convincing: *Scene → Plan authors the environment; Camera → Plan uses the
environment to orient camera authoring.*

**Hit-testing clarification:** read-only does not mean pointer-inert. The backdrop
remains **hit-testable for camera placement and spatial interaction** (clicking a
room floor adds a camera there) — it just cannot be selected or edited. An
implementer must not interpret "read-only backdrop" as `pointer-events: none`.

## 5. Decision 2 — the shell is a domain×view matrix

### 5.1 Structure and the four cells

```
[Scene | Camera]            ← domain switcher (primary, always visible)
  Scene → [Plan | 3D]       ← layout authoring (rooms/walls)  |  scene objects in 3D
  Camera → [Plan | 3D]      ← camera graph (new)  |  camera 3D viewport (today's view)
```

**Fixed switch order:** the view pair is `[Plan | 3D]` **in every domain, always**
— never `[3D | Plan]`. Toggle positions must not swap meaning when the domain
changes; that would create a muscle-memory bug where the same physical button
position means a different thing depending on domain. The default view is
separate state (boot default, §7).

The full matrix, as approved:

| | **Plan** | **3D** |
|---|---|---|
| **Scene** | Layout authoring (rooms/walls) | Scene authoring (objects in 3D) |
| **Camera** | Graph authoring (top-down) | Framing / path authoring (today's viewport) |

The matrix is strong because each axis answers a distinct question:

- **Domain:** Scene → *what does the world contain?* · Camera → *how does the
  viewer move through the world?*
- **View:** Plan → *where things are and how they are connected?* · 3D → *how
  things look in space?*

- **`Camera → Plan` is the 2D camera-graph surface** — "a plan of the camera
  layout," consistent with how the layout plan is a plan of the rooms.
- The domain switch changes *tooling context* (toolbar, sidebar, timeline,
  selection); the view switch changes *spatial representation and view-specific
  interaction affordances* (e.g. X/Z-only anchor drag in Plan vs. full XYZ
  editing in 3D).
- Context memory generalizes the existing pattern (`active3dContext` today): one
  domain memory + one view memory per domain.

### 5.2 Connection vs. flow order — the visual rule

The data model holds two distinct ideas that the Plan graph must not blur:

- **Connection** = camera A *can travel* to camera B (undirected record).
- **Flow order** = camera A *is followed by* camera B during guided playback
  (`next`/`prev` links).

Plan edges show **connections**; the sidebar/timeline own **order**. A designer
looking at `A ── B ── C` with a closing edge back to A must not assume every line
is a playback route. **Rule:** *Plan edges represent available camera
connections, not sequence order; guided playback order remains owned by the
sidebar/timeline.*

**Flow membership must be visually distinguishable in Camera Plan.** Ordered
nodes render with **order numbers** (① A ── ② B ── ③ C); free nodes carry **no
number and a distinct ring/badge**. The exact visual treatment is a UI decision,
but the semantic distinction is **not optional** — without it, `A ── B ── C ── D`
cannot tell the designer that D is connected but not part of the guided flow.
**No arrows on edges** — connections are undirected; arrows would falsely imply
direction of travel.

### 5.3 Selection ownership — one shared state

**Invariant: the Camera domain has one shared camera selection across Plan and 3D;
switching views never changes the selection.** Example: select Node B in Camera →
Plan, switch to Camera → 3D — Node B is still selected and its gizmo shown. The
same holds for connection selection. **Interior path anchors follow the same
rule:** when an interior anchor is selected and the user switches views, the
same anchor identity stays selected — 3D simply exposes the extra Y control on
it. This is what makes Plan and 3D feel like two views of the *same thing*
rather than two tools.

### 5.4 Alternatives considered and why this wins

| Candidate | Shape | Verdict |
|---|---|---|
| Current shell | `[Plan \| 3D]` primary; `[Scene \| Camera]` secondary, 3D-only | Camera can't own a 2D surface; Plan gets a special "layout-only" rule |
| Tertiary pair | `Plan\|3D → Scene\|Camera → Camera·2D\|3D` | Works, but three stacked switcher levels; "2D" naming detached from "Plan" |
| **Domain×view matrix** | `Scene\|Camera` → per-domain `Plan\|3D` | **Chosen** — two levels, symmetric, "Camera → Plan" is the natural name, cleanest memory model |

### 5.5 Connection deletion never reorders the sequence

Because topology and sequence are intentionally separate (§5.2), deletion must
not silently mutate the order. **Invariant: deleting a connection never
implicitly reorders the guided sequence.** The shipped rule is stricter than
"playback stops and reports": `validateConnectionDeletion` **refuses** deletion of
any flow-required edge (`guided_connection` — "the flow order requires the edge
between X and Y"), refuses detour return edges, and refuses any deletion that
would disconnect the graph. Deletion is atomic: either the connection is
deletable and the order is untouched, or the operation is rejected with a status
message. The general principle for the future: if a route ever becomes
incomplete, playback stops at the last valid node and reports the missing pair —
but the current model prevents that state from being reachable by deletion.

### 5.6 The Scene → Plan wrinkle (confirmed)

`Scene → Plan` keeps today's layout plan (rooms/walls). Rejected: a new
"scene-content top-down" surface — bigger scope and it would blur the boundary
with the camera graph. The matrix does **not** require every cell to expose the
same capability; symmetry of structure, not symmetry of features.

### 5.7 Cost (honest)

This is a *shell rework*, not an add-on — the primary/secondary switchers flip, and
Camera graduates from a 3D sub-context to a peer domain. Touches `H1EditorApp`,
`EditorViewState`, switcher components, and several S10.1 plan assumptions.
Contained, but deliberate.

## 6. What needs building (infrastructure inventory)

1. **Shell rework** — domain×view matrix (§5): `EditorViewState` gains a domain
   axis; per-domain view state; switcher changes; Camera becomes a peer domain;
   selection invariant (§5.3) enforced.
2. **"Create free node" mutator path** — commit a camera node standalone at a
   clicked room-floor point without entering the pending-connect flow (generalize
   the existing first-node standalone commit).
3. **The Camera Plan surface** — Plan render model as a read-only but
   hit-testable backdrop (§4.6), camera nodes + connection curves projected
   top-down (no arrows; flow membership visually distinguishable per §5.2),
   X/Z-only node **and path-anchor** drag (§4.5), no framing content (§4.4),
   selection/pose sync with the 3D view (§5.3).
4. **Camera toolbar modes for 2D** — Select / Add camera / Connect / View
   (mirrors the S10.1 camera-toolbar plan); connect rubber-band visuals in 2D.

The store, graph model, straight-line auto-connect, and connection commands are all
done — the surface is a **render + input layer on top of existing commands**.

## 7. Open questions — resolved by review (2026-08-18)

| # | Question | Verdict |
|---|---|---|
| 1 | Camera as peer domain? | **Yes** — Camera now has its own 3D tools, Plan surface, graph, timeline, sequence, and framing; it no longer feels like a 3D sub-mode. Peer domain justified. |
| 2 | `Scene → Plan` stays rooms/walls? | **Yes** — do not add scene-object top-down editing now; that would turn matrix symmetry into a scope trap. |
| 3 | Click-click connect first? | **Yes** — click A → click B, with rubber-band preview while awaiting B. Drag-port / node-editor connectors are unnecessary because nodes live spatially, not on a schematic canvas. |
| 4 | Boot default? | **Slightly favor `Scene → 3D`** — after the rework the primary mental model is DOMAIN first (Scene \| Camera), and 3D is the composed experience while Plan is the authoring projection. Not an architecture decision; keeping `Scene → Plan` for backward UX continuity is also valid. Easy to change later — deferred. |

## 8. Terminology — "Camera Plan," not "2D camera-graph surface"

After the decision is made, stop calling the new surface the "2D camera-graph
surface" — it makes it sound like a separate editor. Consistent product
vocabulary:

> **Camera Plan** is the top-down graph-authoring view of the camera domain,
> rendered over the scene-plan backdrop.

The framing doc's "2D" language (§4 of this doc's earlier draft) is retired; every
future reference uses **Camera Plan**.

## 9. What is NOT in scope here

- Camera pose/framing authoring (rotation, breakpoints, start/end envelope,
  auto face-forward math) — see
  [`2026-08-18-camera-framing-design-review.md`](./2026-08-18-camera-framing-design-review.md).
- The S10.1 camera sidebar / sequence-inspector / timeline drill-down work — that
  plan continues; this doc only changes where its surfaces mount.
- Automatic obstacle-avoiding path routing (the straight line is geometric; curves
  are manual anchors). Noted as a possible future extension.

## 10. Review outcomes (2026-08-18)

### Round 1 — initial design summary

Accepted findings:

| # | Finding | Action |
|---|---|---|
| R1 | Connection vs. flow order needs an explicit visual rule | **Folded into §5.2** — Plan edges are connections, not order; order-number visibility hardened by R8; no arrows (undirected). |
| R2 | 2D drag needs a Y rule | **Folded into §4.5** — X/Z only, Y stays authored; future floor-height rule deferred, recommend absolute authored Y. |
| R3 | Framing must be visibly absent from Camera Plan | **Folded into §4.4** — Plan is topology/position/path-shape; path-anchor X/Z editing added by R6; look targets, orientation, breakpoints, envelopes stay in Camera → 3D. |
| R4 | Selection ownership needs one product rule | **Folded into §5.3** — one shared camera selection across Plan/3D; switching views never changes it. |
| R5 | "Plan backdrop read-only" needs a precise boundary | **Folded into §4.6** — Scene → Plan authors geometry; Camera → Plan uses it as spatial context only. |
| N1 | Naming | **Folded into §8** — "Camera Plan," not "2D camera-graph surface." |
| Q1–Q4 | Open questions | **Resolved in §7** — peer domain yes, Scene → Plan stays layout, click-click connect yes, boot default Scene → 3D (deferred, non-architectural). |

**Final approval (round 1):** the domain×view matrix (Table in §5.1) is approved
as the design's final shape — each domain answers *what the world contains* vs.
*how the viewer moves through it*, and each view answers *where/how things
connect* vs. *how things look in space*.

### Round 2 — hardening amendments (this pass)

Reviewer rated the design ~9/10, adopted with one amendment pass. One genuinely
unresolved architecture/product behavior (path-anchor ownership) plus four
specification hardenings — all folded in:

| # | Finding | Action |
|---|---|---|
| R6 | Who edits path anchors? — ambiguous in the build section | **Folded into §4.4/§4.5** — Camera Plan edits path-anchor X/Z (Y authored, like node Y); Camera → 3D owns full XYZ path editing and framing. |
| R7 | `[Plan \| 3D]` vs `[3D \| Plan]` order inconsistent across domains | **Folded into §5.1** — fixed `[Plan \| 3D]` order everywhere; default view is separate state (boot default still free, §7). |
| R8 | Free/unordered nodes need visual state; order numbers were "optional" | **Folded into §5.2** — flow membership must be visually distinguishable (numbers for ordered, distinct ring/badge for free); the semantic distinction is not optional. |
| R9 | "Read-only backdrop" could be read as `pointer-events: none` | **Folded into §4.6** — backdrop is non-selectable/non-editable but remains hit-testable for camera placement and spatial interaction. |
| R10 | Connection deletion vs. flow order needs an explicit invariant | **Folded into §5.5** — deletion never reorders the sequence; verified the shipped validator already refuses flow-required edges, detour returns, and graph-disconnecting deletions atomically. |

**Reviewer's own verdict:** the domain×view matrix is now justified rather than
clever-for-clever's-sake (each cell has a distinct responsibility; fake symmetry
rejected); shared selection across Camera Plan/3D and the no-framing-in-Plan
scope discipline are called out as especially right. Design rated ~9/10, ready
after this amendment pass.
