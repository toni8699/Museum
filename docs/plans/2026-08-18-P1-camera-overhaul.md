# P1 — Camera overhaul (umbrella)

**Date:** 2026-08-18
**Status:** Approved (2026-08-18 scope decision) — umbrella; increments execute in order below
**Tracker:** [`docs/plans/README.md`](README.md) — **P1**, depends on: renewal
**Folded sources (2026-08-18, content preserved; originals deleted):**
- §A — successor shell ratification (the P1.1 gate)
- §B — framing envelope, adopted model
- §C — camera graph workspace, design summary
- §D — sectioning and sequencing, strategy (compressed: provenance + live decisions)

**Review amendment pass (2026-08-18):** the P1 doc review's seven findings
(F1–F7) are folded below:

1. **F1 — FOV copy fix split:** specs/docs wording → P1.2, UI wording → P1.6
   (§B §7; §D §6.4).
2. **F2 — §D compressed** to provenance + live decisions; its S10.3-era build
   specs and phase table replaced by pointers.
3. **F3 — clone-survival test** added to P1.2 through `helpers/route-clone` +
   the preview controller (consumer seams in §D §3 A0).
4. **F4 — P1.5's B0 dependency made explicit** (P1.5 row).
5. **F5 — B2's timing-labels row gated** behind an explicit product decision
   (§D finding 3 + §D §4 B2 bullet).
6. **F6 — playback-unchanged pin** (golden-sample over a legacy route) added
   to the DoD.
7. **F7 — relic guard named** (`tests/lib/editor/app/contracts.test.ts`) in the
   DoD.

## Outcome

The camera graph gets its dedicated workspace: a successor **domain×view
shell** (inverting the prior view→domain order — Scene and Camera become
peer 3D workspaces, Plan the read-only plan surface), a **Camera Plan**
surface for graph authoring, and a **framing envelope** engine (automatic
travel-facing baseline + authored framing track blended by `w(p)`) with
authoring UX. The prior shell invariants 1, 3, and parts of 2 are superseded
by the ratified shell contract (§A).

## Increments

| ID | Content | Source | Depends |
|---|---|---|---|
| **P1.1** | Successor domain×view shell + shell contract; **gate = shell-inversion ratification (§A)** | §A | — |
| **P1.2** | `framingEnvelope` serialization + ordering validation + `resolveSceneDocument` threading (+ runtime types) + **FOV copy fix, specs/docs wording (F1)** + **clone-survival test through `helpers/route-clone` + preview controller (F3)** | §B, §D | — |
| **P1.3** | Envelope sampler blend `w(p)` in `sampleCameraMotion` | §B, §D | P1.2 |
| **P1.4** | Envelope invariant + auto-managed/manual policy tests | §B, §D | P1.2, P1.3 |
| **P1.5** | Camera Plan surface + backdrop/visual-rule assertions (B0 Add-camera mutator already shipped in S10.1 closeout, `674d597`; **F4**) | §C | P1.1 |
| **P1.6** | Framing authoring UX + FOV copy fix (**UI wording; spec/docs copy lands in P1.2**) | §B | P1.2–P1.4, P1.1 |
| **P1.7** | Camera UI reconciliation pass (light — not the P3 overhaul) | — | P1.5, P1.6 |

## Sequencing

**P1.1 ∥ P1.2–P1.4** — shell track vs engine track, file-disjoint, run in
parallel. **P1.5** mounts into the P1.1 shell immediately after. **P1.6**
converges both tracks. **P1.7** last.

## Gates

- **P1.1 gate — shell-inversion ratification (§A):** accepting P1.1 ratifies
  the shell inversion — superseding the prior shell invariants 1, 3, and
  parts of 2 (enumerated in §A). If rejected, the shell track re-sequences
  (§C's alternatives).

## Boundaries

- P1.1 must not touch `museum/navigation/**` or the visitor bundle.
- Engine track (P1.2–P1.4) must not touch the shell.
- Visitor purity keeps editor code out of `/museum` visitor chunks.
- **P1.5 trap:** the read-only Plan backdrop must stay hit-testable for
  placement but never commit a layout selection.

## Out of scope (deferred)

- Arrival/departure shots (framing "Option B") — reserved for a future feature.
- Import/export — stays reserved.
- Plan staging (P2) · UI overhaul (P3) · GLB import (P4) · measured optimization (P5).

## Definition of done (P1 close)

- All increments shipped; full suite green, `svelte-check` 0, build clean.
- **Existing content playback numerically unchanged** — A1's golden-sample pin
  over a legacy route (F6; the visitor-visible change guard).
- **Relic guard named (F7):** `tests/lib/editor/app/contracts.test.ts` —
  relic-isolation + route-wiring smoke proxy — stays green.
- P1.7 reconciliation done (interim presentation; the P3 pass is separate).
- Tracker marks **P1 shipped**; this umbrella moves to archive with a stub.

---

## A — Ratification: shell inversion (P1.1 gate)

The successor-shell draft scheduled the shell-inversion ratification for the
P1.1 gate. **Accepting P1.1 ratifies decision 1.** If it is rejected, P1.1
stops and the shell track re-sequences (the matrix is re-litigated per §C's
alternatives).

**Ratified decision.** The editor shell becomes a **domain×view matrix**:
`Scene | Camera` is the primary domain switcher (always visible), and each
domain owns a `Plan | 3D` view pair in **fixed `[Plan | 3D]` order everywhere**
(§C §5.1). This formally supersedes the prior shell shape as follows:

| Prior invariant (superseded text) | Successor rule (this shell) |
|---|---|
| **Invariant 1** — persistent dual-switcher shell: primary `[Plan \| 3D]` always visible, secondary `[Scene \| Camera]` mounts only when `viewMode === '3d'` | **Domain×view matrix.** Domain switcher `[Scene \| Camera]` is primary and always visible; view switcher `[Plan \| 3D]` is per-domain and always visible. Scene and Camera are peer domains, not 3D sub-contexts. Two distinct segmented controls, never one 4-tab bar |
| **Invariant 3** — timeline bottom frame mounts strictly when `viewMode === '3d' && active3dContext === 'camera'` | **Camera-domain timeline.** The camera timeline mounts for the Camera domain in both views; the Scene domain never mounts it |
| **Invariant 2 (parts)** — context-specific viewport toolbars / View menus, no duplication | **Toolbar ownership reconciled.** 3D cells keep the viewport toolbar (Scene `Select \| Move \| Rotate \| Scale \| Local/World \| Snap \| View`; Camera `Select \| Move \| Rotate \| Add camera \| View`). The Camera domain gains a left context tool rail; an action lives in exactly **one** location per cell. Plan cells own 2D toolbars |
| **Invariant 4 — relic isolation** | **Preserved unchanged.** `/museum/editor` stays frozen; every shared-component change stays guarded via the relic context props |

**Preserved guarantees (not superseded):** no new store or document
(`EditorViewState` remains the pure state holder); context memory; Plan
mutation-safety (strengthened: only the Scene → Plan cell authors layout);
relic isolation; one history entry per authored mutation; the prior selection
priority is replaced by **domain-gated** selection resolution — a deliberate,
scoped change to `deriveActiveSelection`, not to the selection slots.

**Boot default (deferred, non-architectural):** the §C §7 Q4 preference for
`Scene → 3D` is not part of this umbrella. Boot stays `Scene → Plan`; the
domain axis defaults to `scene`, the scene view to `plan`, the camera view to
`3d`. Changeable later with no architecture impact.

---

## Design reference (read on demand)

The sections below are the folded design sources. **Read only the section your
increment maps to — not the whole file:** P1.2–P1.4 → **§B** · P1.5 → **§C** ·
strategy and provenance → **§D**. The live plan is the front matter + §A above.

---

## B — Framing envelope: adopted model (folded source, 2026-08-18)

## Camera framing authoring — adopted model (C′)

**Status:** adopted spec — design review closed 2026-08-18. Resolves the open
questions in `2026-08-18-camera-framing-design-review.md`.
**Audience:** implementers of serialization/API, authoring UX, motion sampler, and tests.

## 1. TL;DR

Each transition direction keeps two stable layers — an **automatic travel-facing
baseline** and the **authored framing track** — and an envelope weight `w(p)`
blends between them. Nodes remain the canonical endpoints of every transition:
the envelope controls *influence*, never *endpoint ownership*. No
transition-endpoint overrides. Option B is reserved for a future
arrival/departure-shot feature and is deliberately out of scope now.

## 2. The model

```
eye(p)    = positionPath(p)                                  // unchanged
target(p) = lerp(autoTarget(p), authoredTarget(p), w(p))
fov(p)    = lerp(autoFov(p), authoredFov(p), w(p))

w(p) = enterRamp(p) × exitRamp(p)                            // fixed smootherstep ramps
```

- `autoTarget` — existing travel-facing look-ahead path (2-samples-ahead, gaze
  level-clamped to `min(eye height, 1.5 m)`).
- `autoFov` — existing node-FOV interpolation.
- `authoredTarget` / `authoredFov` — existing track: `node → breakpoints → node`,
  with per-interval easing and holds untouched. The envelope is an **outer blend**,
  not a replacement.
- Eye position is shared by both layers — only framing (look target + fov) blends.

Envelope serialization, per direction, on the existing view track:

```ts
framingEnvelope: {
  enterStart: number
  enterEnd: number
  exitStart: number
  exitEnd: number
}
```

with `0 ≤ enterStart ≤ enterEnd ≤ exitStart ≤ exitEnd ≤ 1`. One canonical
smootherstep implementation is shared by editor preview and runtime so
what-you-author-is-what-plays cannot drift. Degenerate ramps are allowed
(`enterStart = enterEnd` = instant ramp); the ordering invariant is validated.

## 3. Behavioral contract

- **No keys** → existing automatic behavior, unchanged.
- **Existing keys + no envelope** → legacy `w = 1`, playback unchanged.
- **New first key** → auto-create envelope: enter ramp, plateau through the
  authored region, **exit pinned at `1`** (authored framing persists to the end
  of the move, so "arrive at the desired framing" works by default).
- **Later keys** → envelope auto-expands to contain them while auto-managed.
- **Designer moves any handle** → envelope becomes manual; breakpoint edits no
  longer move its bounds.
- **Exit `< 1`** → explicit "resume auto-facing before arrival" (interior-shot
  authoring).
- **"Full authored transition" command** → effectively `w = 1`, the discoverable
  escape hatch for legacy-style authoring of new content.
- **`p = 0` / `p = 1`** → canonical node pose whenever both layers coexist.

## 4. Canonical-endpoint invariant

> Whenever automatic and authored framing coexist on a direction, both evaluate
> to the same node-owned pose at progress 0 and 1. Therefore **any blend weight
> produces the canonical node pose at transition boundaries**.

Exact for the whole pose, not just framing: `eye(0)` = path start = node A;
`target(0) = lerp(nodeA, nodeA, w(0)) = nodeA`; `fov(0)` likewise. Same at
`p = 1` for node B.

Consequence: the envelope needs **no endpoint constraints on `w`** — `w(0)` and
`w(1)` may be anything and node continuity still holds. This is the property that
keeps C′ clean: the envelope controls influence, not endpoint ownership, which is
what avoids the Option B problem.

**Scoping:** reversed transitions with no reverse-direction keys keep today's
`travelFacingEnds` behavior (all samples travel-facing). No authored layer exists
in that case, so the envelope does not apply and the invariant is not invoked.
Do not "simplify" this away — it intentionally avoids the turn-around read at the
start of a reverse move. Adding the first reverse key flips auto endpoints to node
poses, after which the invariant holds.

## 5. Migration and defaults

- **Absent `framingEnvelope` = legacy full-authored (`w = 1`).** No data
  migration; old files are not rewritten with `{w:1}`. New authoring always
  writes the envelope explicitly, so "absent" is only ever reachable by legacy
  content and has exactly one meaning.
- **New authoring follows the new product vision:** the first framing breakpoint
  auto-creates a blend envelope. Making new breakpoints default to `w = 1` would
  give designers the old all-or-nothing behavior unless they discover the
  envelope control — the exact UX the feature exists to fix.
- **Auto-managed vs manual envelope:** until the designer manually edits an
  envelope handle, adding/moving breakpoints automatically expands the envelope
  as needed to contain them. After any envelope-handle edit, the envelope becomes
  manual and breakpoint edits no longer move its bounds.
- Exact initial ramp width is UI tuning, not model semantics.

## 6. Decision log — what was rejected and why

- **Option B endpoint overrides** — hidden state-dependent precedence (the
  meaning of an unset start pose changes when an unrelated key exists),
  per-edge inconsistency for shared nodes, and it silently solves a problem the
  product has not proven (arrival-dependent poses). Parked behind an explicit
  future arrival/departure-shot feature.
- **Editable weight curve** — another mini animation editor; harder
  serialization, validation, and undo; a constrained envelope is deterministic
  and upgradeable to a custom curve later without breaking the schema.
- **Breakpoints at progress 0/1** — three definitions of one logical pose; every
  downstream feature (gizmos, serialization, preview, reverse traversal, undo,
  validation) pays precedence tax.
- **FOV-only transition endpoints first** — a scalar FOV override still breaks
  node authority at arrival (discontinuity, or accidental arrival blending);
  same semantic risk as full endpoint overrides. FOV ships through the same
  envelope as look.
- **Symmetric exit default for new envelopes** — would solve "start rotating from
  auto" but break "arrive at desired framing" by default. Exit defaults to `1`.

## 7. FOV semantics (fix from the brief)

Larger FOV = **wider / zoomed out**; smaller FOV = **tighter / zoomed in**. The
brief's example ("starts zoomed out at 40°, ends framed at 70°") is backwards;
the likely intent is "starts wide ~70°, gradually frames the subject at ~40°."
Standardize wording in UI and specs; avoid "expand" unless the UI uses that word.

## 8. Out of scope (this model)

- **Arrival/departure shots** (explicit per-edge arrival poses) — future
  feature, only if real authoring evidence demands it. The exit ramp may compose
  with it later.
- **Custom weight curves** — additive upgrade path only.
- **C1 (derivative) continuity through nodes** — C0 is guaranteed by the
  invariant; motion-layer tuning later if ever needed.
- **Exact envelope default widths and handle UX** — product/UI tuning.

## 9. Next work

1. **Serialization/API:** `framingEnvelope` field shape, ordering validation,
   per-direction placement on existing view tracks, absent-field semantics.
2. **Sampler:** implement `w(p) = enterRamp × exitRamp` blending in
   `sampleCameraMotion`; absent envelope → legacy path; verify playback is
   unchanged for existing content.
3. **Tests:** canonical-endpoint invariant (any `w` → node pose at 0/1) across
   forward / reversed-with-keys / reversed-no-key edges; legacy absent-field
   behavior; auto-managed envelope expansion; degenerate-envelope validation.
4. **Authoring UX:** envelope band with enter/exit handles, one-gesture push-in,
   "Full authored transition" command.

## Appendix — verified against shipped code

- One key flips a transition from auto-facing to fully authored:
  `hasAuthoredKeyframes = track.keyframes.length > 0` gates `sampleAuthoredView`
  in `camera-motion.ts`; the view track is `[node start pose, ...keys, node end pose]`.
- Auto baseline endpoints are node poses (indices 0 and last of
  `buildLookAheadTargets` in `camera-route.ts`) for forward edges and
  reversed-with-keys edges; `travelFacingEnds` applies only to reversed edges
  with no reverse keys.
- Breakpoint progress is compared against arc-length (distance-based) local
  progress, so envelope percentages map to travelled distance, not spline
  parameter weirdness.

---

## C — Camera graph workspace: design (folded source, 2026-08-18)

## Camera graph workspace — design summary (ready for review)

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
[`2026-08-18-camera-framing-design-review.md`](../archive/plans/pre-h1-letters/2026-08-18-camera-framing-design-review.md).
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
Camera graduates from a 3D sub-context to a peer domain. Touches `EditorApp`,
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
  [`2026-08-18-camera-framing-design-review.md`](../archive/plans/pre-h1-letters/2026-08-18-camera-framing-design-review.md).
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

---

## D — Sectioning and sequencing: strategy (historical record, compressed)

> **Read-on-demand / provenance.** §D is the original 2026-08-18 sectioning
> strategy — the record of *why* P1 is sequenced as it is. Its increment-level
> build specs (A0–A3, B0–B3) and the S10.3-era phase table were compressed
> away; the live increments are the **front-matter table**, and the full specs
> are **§B** (engine track) and **§C** (shell track). Mapping to the current
> tracker: B1 = **P1.1**, B2 (+B3) = **P1.5**, A0 = **P1.2**, A1 = **P1.3**, A2 =
> **P1.4**, A3 = **P1.6**, polish = **P1.7**. **B0 (standalone placement) and the
> Aim closeout shipped** in S10.1 closeout (`674d597`); the shell-inversion gate
> is **P1.1** (§A).
> **Sources reviewed:** §B (adopted model) ·
> [`2026-08-18-camera-framing-design-review.md`](../archive/plans/pre-h1-letters/2026-08-18-camera-framing-design-review.md) ·
> §C (workspace design). Status as written: proposal; the accepted-amendment
> notes (B-track before A3, B1 shell contract, B2 filtered overlay profile +
> single-render-model invariant) are reflected in §A/§B/§C.

## 1. Strategy (kept)

Two independent workstreams, not one:

- **Workstream A — framing envelope (adopted model C′).** A data-model +
  sampler + authoring-UX feature composing inside Camera → 3D. Visitor-visible
  (changes `project.scene` serialization + the shared motion engine); the UI
  half mounts into the **final** Camera → 3D workspace after the shell rework.
- **Workstream B — Camera Plan + domain×view shell.** A **successor shell
  rework**, not an S10.1 increment — the domain×view matrix inverts the prior
  primary `Plan | 3D` shell. It must sequence as its own slice, never amend
  in-flight S10.1 work.

Current-state findings that drove the sectioning (kept for the record):

1. **The adopted model's shipped-code seams hold** — `hasAuthoredKeyframes`
   gates `sampleAuthoredView` (`camera-motion.ts`); auto baseline endpoints are
   node poses in `buildLookAheadTargets` (`camera-route.ts`); `travelFacingEnds`
   only for reversed edges with no reverse keys. The envelope builds on the
   existing seams — no model drift to fix first.
2. **B0 + Aim were the two S10.1.3 closeout deltas** — both small and
   model-agnostic, both landed once in closeout and consumed by both surfaces:
   B0 = "create free node, commit standalone" mutator; Aim = **inspector-based
   yaw/pitch** (look-target only, fixed-radius orbit, one history entry,
   room-local commit path, translate-only gizmo — shipped in `674d597`).
3. **Plan already renders camera content top-down, but Camera Plan must not
   enable all of it** — `plan-camera-projection.ts` projects paths, cones, look
   targets, portal crossings, timing labels (layers 6–9 of `PlanRenderModel`)
   behind the Plan Tour toggle. Camera Plan reuses **one render model** plus a
   **filtered overlay profile** — nodes, connection curves, path anchors,
   selected state, sequence/free-node state; **no** cones, look targets,
   breakpoints, envelope UI; **timing labels excluded — adding them requires an
   explicit product decision (F5)**. It is not "the Plan Tour layer made
   editable."
4. **The connection-deletion invariant is already shipped** (S10.2
   `validateConnectionDeletion` refuses flow-required edges, detour returns,
   and graph-disconnecting deletions atomically) — Camera Plan must not offer a
   bypass.
5. **The matrix rework touches freshly landed S10.1 files** — `EditorApp`,
   `EditorAppBar`, `EditorViewState` (gains a domain axis), both switchers. This is
   why it is a successor slice, not an amendment to in-flight work.
6. (Historical) Both workstreams were classified as camera-authoring scope
   before the renewal gate; that classification is now the P1 tracker row.

## 2. Doc-by-doc review against current state

| Doc | Status | Already true in the codebase | Genuinely new work |
|---|---|---|---|
| Framing design review | Review artifact (superseded by the adopted model) | Auto face-forward, target-orbit rotate, per-interval easing, breakpoint FOV — all shipped | None directly; it is the rationale archive for the adopted model |
| Framing adopted model (C′) | **Adopted spec** | Two stable layers exist separately: auto baseline (`buildLookAheadTargets` + node-FOV lerp) and authored track (`sampleAuthoredView`); breakpoints strictly interior; per-direction `viewTracks` | The **blend**: `framingEnvelope` field, `w(p) = enterRamp × exitRamp` in `sampleCameraMotion`, auto-create/auto-managed envelope policy, envelope band UI, "Full authored transition" command, FOV copy fix |
| Camera graph workspace | Design summary, reviewed/approved shape | Graph model + ~90% of interactions (create/drag/connect/delete/reorder/auto straight line/auto face-forward); Plan backdrop + camera top-down projection; deletion invariant | Domain×view **shell rework**, the **Camera Plan surface** (input layer), standalone "create free node" mutator, 2D toolbar modes |

## 3. Workstream A — increment build specs (compressed → pointers)

The A0–A3 build specs are folded into the front-matter increments (A0 =
**P1.2**, A1 = **P1.3**, A2 = **P1.4**, A3 = **P1.6**); the full spec is **§B**
(model, behavioral contract, §5 defaults, §9 next-work) plus the front-matter
rows. Key seams and decisions preserved from the specs:

- **A0 (serialization/API).** Envelope on each direction of
  `SceneConnectionViewTracks`; parse in `parse-document.ts` (`parseViewTracks`),
  clone in `canonical.ts`; validate `0 ≤ enterStart ≤ enterEnd ≤ exitStart ≤
  exitEnd ≤ 1` in **both** `parse-document.ts` (editor import) and
  `project-layout-semantics.ts` (export gate), mirroring keyframe validation.
  Absent field = legacy full-authored `w = 1`; **no migration, no `{w:1}`
  rewriting** — pin with a byte-stability test. Consumers that must not lose
  the field: `view-keyframe-controller.svelte.ts`, `helpers/route-clone.ts` +
  `store/camera-preview-controller.svelte.ts` (preview clone), and
  `NodeConnectionsPanel.svelte` key counts.
- **A1 (sampler).** One canonical smootherstep weight helper in
  `camera-motion.ts` shared by editor preview and runtime; thread the envelope
  via `buildOrientedViewTrack` → `PreparedCameraMotionEdgeView`; absent
  envelope → legacy path exactly as today; reversed edges with no reverse keys
  keep `travelFacingEnds` (invariant not invoked); **no endpoint constraints
  on `w`** (§B §4 makes them unnecessary).
- **A2 (tests).** Canonical-endpoint invariant across forward /
  reversed-with-keys / reversed-no-key edges; absent-field behavior; ordering
  + degenerate validation; auto-managed vs manual policy as pure logic (first
  key auto-creates the envelope, later breakpoints auto-expand while
  auto-managed, any handle edit flips to manual — UI only binds).
- **A3 (authoring UX).** Envelope band with enter/exit handles, one-gesture
  push-in, "Full authored transition" (`w = 1`) — mounts into the **final**
  Camera → 3D workspace, not the pre-P1.1 shell; includes the FOV copy fix (§B
  §7) in the same UI pass. Exit `< 1` produces the "resume auto-facing before
  arrival" read; one history entry per gesture.

## 4. Workstream B — shell + Camera Plan build specs (compressed → pointers)

- **B0 (standalone placement) + Aim — SHIPPED** in S10.1 closeout (`674d597`).
  B0 = "create free node, commit standalone" mutator consumed by both surfaces;
  Aim = inspector-based yaw/pitch view-breakpoint control (decision record in
  §1 finding 2 above).
- **B1 (successor shell) = P1.1.** The ratified contract is **§A**
  (supersession table, preserved guarantees, boot default); the design
  rationale is §C §5. Unique operational content preserved: **Camera-domain
  persistence rules** — the Sequence panel and camera timeline persist across
  Plan ↔ 3D (only the center surface + view-specific tools/inspector change);
  **per-domain selection memory** — switching domains restores that domain's
  previous selection, and when invalid it degrades per the existing
  child-selection rules (e.g. a deleted node degrades to its nearest ancestor).
- **B2 (Camera Plan surface) = P1.5.** The decisions are §C §4–§6. Unique
  content preserved: **2D toolbar modes** `Select | Add camera | Connect |
  View` with rubber-band connect preview; the **filtered overlay profile**
  (✓ nodes, connection/path curves, path anchors, selected state,
  sequence/free-node state; ✗ cones, look targets, breakpoints, envelope UI,
  **timing labels — excluded, adding them requires an explicit product
  decision (F5)**) reusing `plan-camera-projection.ts`,
  `LayoutPlanViewport`/`PlanSvg` + `plan-hit.ts`, and the shipped mutators;
  **exit** — every gesture commits through existing graph mutators with one
  history entry, flow membership visually distinguishable, Plan cannot mutate
  scene/layout state, anchor/node identity survives the Plan ↔ 3D switch.
- **B3 (backdrop/visual-rule hardening) — not a separate slice.** Its
  assertions (edges = connections; order owned by sidebar/timeline; §4.4
  no-framing discipline in hit handling) fold into P1.5's exit criteria.

## 5. Sequencing (compressed → front-matter table)

The S10.3-era phase table, ASCII diagram, and gate chain are superseded by the
front-matter **Increments** + **Sequencing** sections (P1.1 ∥ P1.2–P1.4 →
P1.5 → P1.6 → P1.7). The strategy's shape survived intact: the engine track
(A-track) has no shell dependency and runs in parallel; UI work (B-track, A3)
mounts into the final shell; build the correct basic layout first, then one
polish pass.

## 6. Decisions — resolution state

1. **Shell inversion.** **Resolved — ratified at the P1.1 gate** (§A);
   rejection would re-sequence the shell track per §C §5.4's alternatives.
2. **Classification.** **Resolved (historical)** — the "S10.3 inside H1"
   classification was dissolved by the plan-system renewal; the pipeline order
   lives in the tracker.
3. **Framing stays out of Camera Plan (§C §4.4).** **Live** — the envelope band
   and view-breakpoint UI remain Camera → 3D-only; confirm at P1.5.
4. **FOV copy fix timing.** **Resolved (F1)** — split: spec/docs wording in
   **P1.2**, UI wording in **P1.6** (§B §7).
5. **Envelope validation location.** **Live** — reject bad ordering in both
   `parse-document.ts` (editor import) and `project-layout-semantics.ts`
   (export gate).

## 7. Non-goals (kept)

Arrival/departure shots and custom weight curves (adopted model §8) stay
future; multi-story, auto-tour generation, and removing the relic stay out of
scope.
