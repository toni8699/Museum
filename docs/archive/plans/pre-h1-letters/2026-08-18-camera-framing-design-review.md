# Camera framing authoring — design review brief

**Status:** review artifact, not an implementation plan. **Date:** 2026-08-18.
**Audience:** external reviewer — this document assumes **no knowledge of the codebase**.
Every claim about "what exists today" is verified against the shipped code (camera
route resolver, motion sampler, editor gizmo, visitor runtime) as of 2026-08-18.

## 1. TL;DR — the question we want reviewed

We build an interactive museum tour: visitors are driven along camera paths between
authored viewpoints, and designers frame those cameras in a 3D editor. Today the
system already does most of the "smart" work automatically — when a designer adds
no framing, the camera automatically faces the direction of travel and eases its
field of view between endpoints. Designers can override that framing with
breakpoints (keys) along each transition.

A designer has proposed a more intuitive authoring model:

> Let the designer **rotate the camera intuitively**. If there are **no
> breakpoints**, the camera should **automatically face forward along the path**
> while travelling. The designer can also define a **start and an end point**:
> at the **start**, the camera begins **rotating / expanding** (zooming out) from
> whatever it was doing; at the **end**, it arrives at the **desired field of
> view (FOV)** and framing.

Our finding: **the "automatically face forward" half already exists and works
exactly as described.** The "start and end point" half is only partially possible,
and the gap is a *data-model* question about where a transition's start/end pose
lives — node-owned or transition-owned. That is the design question in §6, with
three sub-questions in §7. We want your judgment, not code.

## 2. Product context (no code knowledge needed)

- **Nodes** are viewpoints: a camera sits at a point in 3D space (eye position),
  looks at a target point, and has a **field of view** (zoom, in degrees; default
  54°, allowed 10–120°).
- **Transitions** (connections) move the camera between two nodes along an
  authored path — like a dolly move through the museum.
- **Breakpoints** (view keyframes) are additional framing edits *inside* a single
  transition: "halfway along this move, look at the painting and zoom in."
- The same engine drives both the **editor preview** (designer sees exactly what
  they authored) and the **visitor runtime** (end user watches the tour). What you
  author is what plays — one motion engine, two front-ends.

## 3. How the camera works today

### 3.1 The three authoring surfaces

| Surface | What it stores | Where it lives |
|---|---|---|
| **Node pose** | eye `position`, look `cameraTarget`, `fov` | on each node; shared by every transition touching that node |
| **Transition path** | the 3D curve the *eye* travels along (`positionPath`) | on each connection (undirected record between two nodes) |
| **Breakpoints** | per-direction framing keys: `{ progress (0–1 along the move), look target, fov, optional hold, optional easing }` | on each connection's view track — separate tracks for the forward and reverse direction |

Key structural rule: **breakpoints are strictly interior** — their progress must be
inside `(0, 1)`. The *endpoints* of every transition are always the two nodes' own
poses. You cannot put a key at progress 0 or 1.

### 3.2 How "rotate the camera" works in the editor

Select a camera node, switch the gizmo to rotate, drag. The camera's **look target
orbits around its eye** (a "turntable" aim): the drag is decomposed into **yaw
(rotation around the world up-axis) then pitch (tilt)**; the eye never moves; roll
is ignored (a camera aim has no authored roll). The result is written back as the
node's `cameraTarget`. Field of view is a separate numeric control (inspector /
timeline), and breakpoints have their own draggable look-target point plus an FOV
field.

So "rotate the camera intuitively" already exists at two levels: whole nodes, and
individual breakpoints.

### 3.3 The default view when there are **no** breakpoints — the math

For a transition with zero authored breakpoints, playback is fully automatic:

1. **Position** — the eye follows the authored path curve, parameterized by
   arc length (so speed is constant along the move, not bunched on curves).
2. **Look direction — automatically faces the direction of travel.** Every sample
   aims at a point **two samples ahead** on the path, with the gaze height clamped
   to `min(eye height, 1.5 m)` so the camera stays level while rounding corners.
   Only the very first and very last samples use the nodes' authored look targets.
   *(This is the "if no breakpoint, automatically face forward" feature — already
   shipped and pinned by tests.)*
3. **FOV** — linearly interpolates from the start node's fov to the end node's
   fov across the move.
4. **Timing** — duration is derived from path length at a fixed travel speed
   (clamped 1.25–4.8 s), eased with a smooth S-curve, unless the designer authored
   an explicit duration/easing.

### 3.4 With breakpoints — the math

Each transition's view track becomes: start-node pose → breakpoints → end-node
pose. Between any two adjacent keys, the look target and FOV **lerp** with an
optional easing and an optional hold ("pause here for 2 s while looking at the
painting"). Crucially, this is **per-transition**: a transition with no keys keeps
the automatic travel-facing default even when a neighboring transition has authored
keys. One key on a transition switches *that transition* from auto-facing to
authored; the auto behavior is not lost globally.

## 4. The proposed vision, restated

> - **Default (no breakpoints):** camera automatically faces forward while
>   travelling. ✔ *exists*
> - **Designer rotates the camera intuitively.** ✔ *exists* (node aim + breakpoint
>   target + FOV controls)
> - **Define a start and end point:**
>   - **Start** — begin rotating / expanding (zoom from a wide FOV).
>   - **End** — arrive at the desired FOV and framing. ✖ *partially possible*

## 5. Gap analysis — what the vision needs that today's model cannot express

1. **Transition endpoints are locked to node poses.** "This specific move starts
   zoomed out at 40° and ends framed at 70°" cannot be said about the *move* — only
   about the *nodes*, which are shared: the same node is the start of one move and
   the end of another, so re-framing it for one move re-frames both.
2. **Breakpoints are strictly interior.** The natural workaround — keys at the very
   start and end of a move — is forbidden by the `(0, 1)` rule.
3. **Auto-facing and authored framing are per-transition all-or-nothing.** Add one
   key to a transition and its start/end snap to the node poses; the travel-facing
   default for that transition is replaced, not blended. The vision's "start
   *rotating automatically*, end at my framed pose" is a *blend* of auto and
   authored that the model cannot express.
4. **(Folded-in sub-question) "Start: start rotating / expanding" implies a
   *progressive reveal* —** the camera pushing in or panning as the move begins,
   rather than starting at a fixed pose. Today this is only achievable by hand-
   placing two keys near the start plus per-interval easing, and even then the very
   first moment of the move is still bound to the node pose. There is no one-gesture
   "ease into the move" control, and no automatic "start from travel-facing, end at
   my pose" behavior.

## 6. The design question — where should a transition's start/end pose live?

> **Should a transition's starting and ending camera pose be node-owned or
> transition-owned?**

**Option A — nodes stay the only endpoints (today's model).**
Every transition begins at the from-node pose and ends at the to-node pose;
breakpoints refine the middle only. *Pros:* simple; poses are reusable and
consistent — a camera that looks at the entrance from node 3 does so on every
arrival, which reads as authored intent. *Cons:* cannot express per-transition
endpoint framing; the auto-facing default is lost the moment one breakpoint is
authored on that transition; "start/end envelope" authoring is impossible without
touching shared nodes.

**Option B — add per-transition endpoint overrides (proposed).**
Each direction of each transition may optionally define its own start and end pose
(look + FOV), overriding the node poses for that transition only; unset values
fall back to (a) the node pose or (b) the automatic travel-facing default. Playback
eases from the effective start to the effective end, with breakpoints still
refining the middle. *Pros:* exactly the requested "start/end envelope"; a move can
"start zoomed out and auto-facing, end framed on the painting at 70°"; per-move
cinematography without node pollution. *Cons:* a node shared by many transitions
could be framed inconsistently edge-to-edge; needs a clear precedence rule; more
state per transition.

**Option C (a middle path worth considering) — keep nodes authoritative but make
the auto default *composable* instead of all-or-nothing.**
Instead of explicit endpoint overrides, add a per-transition "auto blend" knob:
e.g. an ease-in/out envelope where the motion starts at the travel-facing default
and *blends* to the authored framing over the first fraction of the move (and
optionally blends back out at the end). Interior breakpoints keep working. *Pros:*
smallest change to the mental model — the auto behavior stays the baseline and
authorship layers on top; preserves "start rotating from auto-facing" literally.
*Cons:* less direct control of exact start/end poses; the "blend shape" needs
defining (linear? S-curve? distance-based?).

## 7. Sub-questions we want adjudicated

1. **Precedence rule (if Option B):** when a start pose is *unset*, should the
   fallback be the node pose or the automatic travel-facing pose? Our instinct:
   node pose when the transition direction has *any* authored framing, travel-
   facing when it has none — i.e. auto is the default, node pose is the authored
   endpoint, transition override is the explicit endpoint. Is that precedence
   hierarchy intuitive, or will it surprise designers?
2. **Blend vs. strict override (Option B vs. C):** for the vision's "start:
   start rotating / expanding", is a strict start-pose override the right control,
   or would designers more naturally want a *blend* that begins from the automatic
   travel-facing default and eases into authored framing? The auto look-ahead is
   already the product's default behavior, so "start from it" is the lower-friction
   reading of the request.
3. **Progressive reveal (folded in):** should "start: start rotating/expanding"
   be modeled as (a) just a start pose + the existing per-interval easing, (b) an
   explicit ease-in envelope over the first fraction of the move (camera pushes in
   / pans as the move begins), or (c) both — an optional start pose *and* an
   optional auto ease-in? Which is more predictable for a designer who has never
   seen the model before? What's the simplest mental model that still covers
   "push-in reveal" as a one-gesture intent?
4. **FOV endpoints specifically:** the vision's "end: desired FOV" is the clearest
   part of the request. Is per-transition FOV overriding (independent of look
   direction) low-risk enough to ship alone first — i.e. a minimal Option B limited
   to FOV, leaving look-direction endpoints node-owned until the model proves out?
5. **Breakpoints at the endpoints:** if per-transition endpoints are rejected, is
   relaxing the "strictly interior" rule (allowing keys at progress 0 and 1) an
   acceptable, cheaper alternative — and what are its risks (duplicate pose
   definitions at node vs. key, migration of existing authored keys)?

## 8. What we are NOT asking

- Whether automatic travel-facing is a good default (it is shipped and loved; it
  is the baseline, not up for removal).
- UI specifics (menus, gizmos, inspectors) — this is a data-model and behavior
  question; UI follows the chosen model.
- Whether breakpoints should exist at all (they do, and per-transition authorship
  builds on them).

## 9. How to answer

For each sub-question in §7, give a recommendation with a one-paragraph rationale.
Where you disagree with our instincts (precedence hierarchy, blend vs. override,
FOV-first), say so explicitly and say what you would ship first. If the answer to
§6 is "none of these", propose the model you would use instead, keeping in mind
that the auto-facing default must survive and that the engine already eases
between any two poses with per-interval easing.

## 10. Appendix — exact current behavior, mapped to the request

| Requested behavior | Status today | Where |
|---|---|---|
| "Automatically face forward path travelling" (no breakpoints) | **Shipped** — look-ahead-2-samples, level-clamped gaze | route resolver `buildLookAheadTargets` |
| "Let the designer rotate the camera intuitively" | **Shipped** — node rotate = target-orbit yaw/pitch; breakpoint target drag; FOV fields | camera gizmo adapter; view-keyframe controller |
| "Start: start rotating / expanding" | **Partial** — per-interval easing exists, but the first instant of a move is locked to the node pose, and one authored key replaces auto-facing for the whole transition | motion sampler `sampleAuthoredView` |
| "End: desired FOV" | **Partial** — FOV eases between node poses and across keys, but cannot be set *per transition* without touching shared nodes | node `fov`; key `fov`; FOV lerp in the sampler |
| Per-transition endpoint override | **Not expressible** — endpoints are node-owned; keys strictly interior | data model (this review's subject) |
| Auto-ease-in / progressive reveal | **Not expressible as one gesture** | data model + sampler (folded-in sub-question) |

**Verification note for the reviewer:** every row in this table is asserted against
shipped code and pinned by the test suites; if a claim seems surprising, it is more
likely our framing than a missing feature — flag it and we will point you at the
exact code.
