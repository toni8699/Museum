# P3B — Orientation Box, Plan Parity, and Camera Preview Affordances

**Date:** 2026-08-24
**Status:** Proposed — standalone follow-up after P3 close
**Tracker:** `docs/plans/README.md` — **P3B**, depends on P3 + P8 S2–S4
**Historical source:** `P3 umbrella` — extracted P3.4/P3.5 and P3B scope

---

## Purpose and current shell contract

P3B completes the remaining interaction and visual-parity work around the accepted P3 baseline for the current product shell:

```text
Scene | Camera
Plan  | 3D
```

These are two explicit shell axes producing four intentional views inside one persistent editor shell.

```text
Scene → Plan
Scene → 3D
Camera → Plan
Camera → 3D
```

Scene Plan additionally owns the local:

```text
Layout | Arrange
```

mode.

Current implementation names such as `CameraPlanViewport`, `CameraPlanInspector`, and Scene 3D viewport components are valid locations for this work.

P3B does not:

* create additional workspaces;
* duplicate shell state;
* alter the domain/view model;
* add a second navigation system;
* add a second camera-motion system;
* add another selection store;
* add another Plan coordinate model.

P3B is editor-only.

```text
/ and /editor             active editor lane
/museum                   frozen visitor relic
/museum/editor            frozen legacy editor relic
```

---

# Outcome

P3B executes as sequential groups.

Complete the current group before starting the next.

```text
Group A → Group B → Group C → Core QA → Deferred tail
```

P3B delivers:

1. **Group A — Plan-surface parity**

   * reconcile Scene Plan and Camera Plan presentation;
   * preserve their existing Plan math and authority.

2. **Group B — Scene 3D orientation utility**

   * ship the custom Scene 3D XYZ orientation widget;
   * derive its visual orientation from the active Scene 3D camera;
   * provide cardinal view snapping without introducing another camera authority.

3. **Group C — Camera preview affordances**

   * make selection, preview scope, transport, sequence preview, and edge direction explicit across Camera Plan, Camera 3D, Inspector, Sidebar, and Timeline.

4. **Deferred P3.4/P3.5 tail**

   * revisit existing context-menu adapters after broader testing;
   * do not block core P3B shipment.

P3B reuses the existing:

```text
EditorStore
preview FSM
camera-route.ts
camera-motion.ts
selection actions
timeline identities
Plan transforms
Plan hit resolvers
OrbitControls / editor camera infrastructure
```

---

# Cross-cutting invariants

* One editor shell with `Scene | Camera` over `Plan | 3D`.
* One 3D canvas.
* One canonical selection model per domain.
* One Camera timeline owned by Camera domain.
* Camera timeline state survives Camera Plan ↔ Camera 3D.
* One camera route authority: `camera-route.ts`.
* One camera motion authority: `camera-motion.ts`.
* Scene 3D orientation snapping is viewport presentation, not Camera-domain authoring.
* Plan remains SVG top-down world X/Z projection:

```text
screen X ← world X
screen Y ← world Z
world Y  ← vertical height
```

* Camera Plan connections remain undirected.
* Direction appears only in explicit preview/playback actions.
* Selection never starts playback.
* Selection never changes preview scope.
* Selection never resets the playhead.
* Selection never replaces an active preview.
* Selection and preview scope remain independent.
* Preview actions use Play/CirclePlay semantics.
* Eye remains visibility/view semantics.
* No document/history mutation from the orientation widget.
* All work stays editor-only and preserves relic isolation.

---

# Group A — Plan-Surface Parity

## P3B.4a → P3B.4b

Scene Plan and Camera Plan already share Plan geometry and transforms.

Group A owns presentation parity only.

### Deliver

* shared Plan color/token parity;
* grid level-of-detail behavior;
* adaptive X/Z rulers;
* segmented scale chrome;
* viewport metadata clearance;
* shared bottom-right Plan orientation key.

Canonical Plan corner key:

```text
Z ↑
  │
  ○────────→ X
```

### Corner-key contract

The Plan corner key is:

* SVG/DOM;
* non-interactive;
* shared by Scene Plan and Camera Plan;
* visually larger than tiny incidental axis labels;
* colored with canonical world-axis colors;
* independent from Scene 3D orientation-box interaction.

The origin knob paints over the X/Z line join.

It changes no:

```text
Plan transform
hit test
selection
document
history
camera state
```

### Group A gate

Group A completes before Scene 3D orientation interaction begins.

---

# Group B — Scene 3D Orientation Utility

## Readiness

```text
P3B.1  Cardinal snap authority / basis resolution     SHIPPED (refactor target below)
P3B.2  SVG projection / geometry / rendering          IN PROGRESS (render rework)
P3B.3  interaction states / hit isolation             READY
P3B.4  animated motion + polar OrbitControls handoff  READY (handoff fixture-pinned)
```

P3B.1–P3B.4 may proceed.

P3B.4's polar handoff was proven by the focused fixture
`tests/lib/editor/camera/polar-orbit-handoff.test.ts` (real OrbitControls,
headless): commit → per-frame `update()` → quaternion stable within 1e-4 rad;
drags orbit the global +Y pole with the Plan-North roll preserved. See the
resolved blocker note in P3B.4.

---

## P3B.1 — Cardinal snap authority

### Cardinal face mapping

Face identity means:

> the side of the orbit target where the camera eye resides.

```text
eye = target + normal × distance
```

| World normal | Face   | Cardinal `camera.up` |
| ------------ | ------ | -------------------- |
| `+X`         | RIGHT  | `(0, 1, 0)`          |
| `-X`         | LEFT   | `(0, 1, 0)`          |
| `+Y`         | TOP    | `(0, 0, -1)`         |
| `-Y`         | BOTTOM | `(0, 0, 1)`          |
| `+Z`         | FRONT  | `(0, 1, 0)`          |
| `-Z`         | BACK   | `(0, 1, 0)`          |

For the polar faces:

```text
TOP:
screen up = world -Z

BOTTOM:
screen up = world +Z
```

This makes TOP orientation coherent with Plan North.

### Two-phase execution

Cardinal snapping uses two explicit phases.

```text
1. resolve basis
2. commit / animate pose
```

Current behavior is shipped. The P3B refactor may reorganize helper
boundaries only; cardinal mapping, fallback order, preservation semantics,
and observable behavior are frozen.

Shipped narrow editor-view authority (the shipped type name is
`CardinalView`; the `CardinalSnapBasis` interface and the split signatures
below are the proposed refactor target):

```ts
type CardinalFace =
  | '+X'
  | '-X'
  | '+Y'
  | '-Y'
  | '+Z'
  | '-Z';

interface CardinalSnapBasis {
  target: Vector3;
  distance: number;
}
```

Resolution (proposed refactor — the shipped helper resolves privately via
`resolveCardinalEyeTarget`):

```ts
resolveEditorCardinalSnapBasis(
  camera,
  controls,
  fallbackResolver
)
```

Commit (shipped — today's signature takes the fallback resolver and resolves
internally; the resolved-basis parameters below are the refactor target):

```ts
snapEditorViewToCardinal(
  face,
  camera,
  controls,
  resolvedTarget,
  resolvedDistance
)
```

Do not put cardinal-view semantics in:

```text
SceneDocument
LayoutDocument
preview FSM
TransformControls
camera graph
camera-route.ts
```

### Basis resolution

Resolve in this order:

```text
1. Valid current OrbitControls target + eye-target distance
2. Existing editor bounds-framing authority
3. Existing editor neutral/boot camera basis
4. Safe atomic no-op
```

Normal orientation snapping must not reframe the entire museum.

Bounds/neutral framing is fallback only.

P3B must reuse existing framing authorities rather than introduce another bounds calculation.

### Preserve

Cardinal snapping preserves:

```text
Orbit target, when valid
eye-target distance, within existing controls limits

Perspective FOV
zoom
near
far

OrbitControls enabled state
damping
distance limits
other control configuration

Scene selection
Camera selection memory
Scene Plan Layout | Arrange session memory
Scene 3D active tool / TransformControls mode

preview FSM
Camera timeline scope
Camera timeline playhead

SceneDocument
LayoutDocument
history
```

### Replace

Cardinal snapping replaces only:

```text
camera position
camera orientation/quaternion
camera view direction
camera up/roll
```

### Failure

If no valid basis can be resolved:

```text
return null / committed: false
```

No partial camera mutation.

No selection mutation.

No history entry.

---

# P3B.2 — Orientation Widget Projection and Rendering

## Rework baseline (in-tree state)

The first P3B.2 implementation is **rejected by browser QA**, not a clean
slate. The rework keeps its architecture and replaces its render layer.

**Kept (do not rebuild):**

```text
projector/overlay writer split
  (EditorOrientationGizmoProjector inside the Canvas publishes per-frame;
   editor-orientation-gizmo.svelte.ts shared state; DOM overlay renders)
Scene-3D-only mount gating (!isCameraContext)
snap wiring through snapEditorViewToCardinal with the neutral fallback
preview gate (cameraPreview !== null)
Enter/Space keyboard activation + spoken labels
consolidated EDITOR_DRAG_THRESHOLD_PX usage
```

**Discarded (rejected by QA / superseded by this plan):**

```text
static isometric point tables (FRONT_FACES / GHOST_FACES)
dashed ghost faces (plan culls back faces; §2.4 invisible hit layer replaces them)
through-body double-ended axis lines
dark navy face fills (light three-tone palette now canonical)
instant-only snap (animated contract, see P3B.4)
```

**Rework acceptance:** the four QA findings reversed — cube rotates with the
camera, face names render with edge-on fade, axes hug edges per the canonical
oblique rules, cube fills the tile budget — plus full conformance with
`Designer-brieft-box.md` rev 6, projection unit tests, and the existing gizmo
tests updated green.

## Mount contract

```text
Scene → 3D       MOUNTED + INTERACTIVE
Scene → Plan     ABSENT
Camera → Plan    ABSENT
Camera → 3D      ABSENT
```

The widget is a Scene 3D viewport utility.

It is not:

```text
TransformControls
Local / World switch
object-selection target
Camera-domain node
preview control
free-orbit trackball
```

It owns no independent orientation state.

Its visual orientation derives from the actual Scene 3D camera.

---

## Renderer

Use custom:

```text
Svelte 5 + SVG
```

Do not use:

```text
Blender asset
second Three.js scene
second camera
raycastable scene object
```

The cube geometry is mathematical UI geometry.

World-to-widget rotation:

```ts
const viewRotation = camera.quaternion.clone().invert();

const widgetVector = worldVector
  .clone()
  .applyQuaternion(viewRotation);
```

Cube vertices and world-axis endpoints use the same orientation transform.

---

## Tile

```text
88 × 88 px
top: 16px
right: 16px
```

Reference geometry:

```text
cube edge                  30px
axis shaft width           1.5px
axis extension             10px
arrow base                 3.5px
arrow length               4.5px
axis label                 11px
face label                 8.5px
```

SVG:

```html
<svg viewBox="0 0 88 88" style="overflow: visible;">
```

Back-facing polygons are culled.

No dashed hidden-face wireframe.

---

## Canonical default oblique presentation

At the canonical default Scene 3D oblique pose:

```text
Z hugs FRONT bottom edge
X hugs RIGHT bottom edge
Y hugs RIGHT outer vertical edge
```

Conceptual composition:

```text
                  Y
                  ↑
             _____│
            / TOP/│
           /_____/│
          |FRONT|RIGHT
      Z ◄─└─────┘─┴─► X
```

Exact rules:

```text
+Z:
blue
collinear with projected FRONT bottom edge
extends only slightly beyond cube

+X:
red
collinear with projected RIGHT bottom edge
extends only slightly beyond cube

+Y:
green
collinear with projected RIGHT outer vertical edge
extends upward only slightly beyond cube
```

Axes hug the cube.

They must not become a detached radial starburst.

### Dynamic orientation

The edge-hugging arrangement above defines the canonical oblique appearance.

During arbitrary camera orientation:

* cube vertices rotate/project from actual camera orientation;
* world-axis endpoints use the same transform;
* axes remain truthful world-axis projections;
* renderer must not artificially force them back to the default bottom/right silhouette.

---

## Face identity

```text
+X RIGHT
-X LEFT
+Y TOP
-Y BOTTOM
+Z FRONT
-Z BACK
```

Only front-facing faces render.

---

## Visual language

Cube:

* light neutral drafting gray;
* dark crisp edges;
* dark compact face labels;
* restrained flat shading;
* no ghost faces;
* no neon;
* no glass;
* no realistic lighting.

Axis colors:

```css
X: #F05252
Y: #45C878
Z: #3B82F6
```

Light-face references:

```css
--editor-orientation-face-lit:    #EAEEF2;
--editor-orientation-face-mid:    #D8DCE0;
--editor-orientation-face-shadow: #C2C7CC;
```

Edge:

```css
--editor-orientation-edge-solid: #1E2C3A;
```

Dynamic face luminance interpolates only between registered light-face tokens.

---

## Face-label edge-on behavior

Render face only when:

```text
N · V > 0
```

Label fades near edge-on:

```text
N·V < sin(18°)
→ label opacity 0

sin(18°) ≤ N·V ≤ sin(28°)
→ linear fade 0 → 1

N·V > sin(28°)
→ opacity 1
```

---

## Axis foreshortening

Compression is bidirectional.

```ts
Math.abs(axis.dot(viewDirection)) > Math.cos(12°)
```

When nearly parallel to camera view:

```text
shaft → zero projected length
arrow → 6px circular reticle
axis glyph → centered over reticle
hit target → minimum 14 × 14px
```

---

# P3B.3 — Orientation Interaction States

Supported targets:

```text
six cube faces
visible X/Y/Z axis targets
```

No widget drag-orbit behavior.

Pointer interaction remains isolated from:

```text
Scene object hit testing
TransformControls
OrbitControls canvas drag
selection
```

## States

### Default

* light neutral faces;
* dark edge;
* axis colors preserved.

### Hover

```text
face overlay:
rgba(255,255,255,0.14)
```

Pointer cursor on valid target.

### Pressed

```text
face overlay:
rgba(0,0,0,0.20)
```

Optional label nudge:

```text
+0.5px projected Y
```

### Active cardinal view

When current camera aligns to a cardinal face:

```text
inner stroke:
#2F8CFF
1.5px
```

This is derived from current camera pose.

It is not persisted widget state.

### Focus visible

Keyboard target:

```text
2px #55A1FF outer stroke
```

### Disabled

When another camera-preview authority owns the camera:

```css
opacity: 0.38;
filter: grayscale(80%);
pointer-events: none;
```

The whole widget recedes.

---

## Pointer threshold

Tile click/drag distinction:

```text
≤ 4px movement
→ eligible click

> 4px movement
→ cancel snap activation
```

A cancelled tile gesture must not fall through into viewport orbit.

---

# P3B.4 — Cardinal Snap Motion

## Status

**UNBLOCKED 2026-08-24 — polar handoff fixture-pinned.**

The former blocker (exact polar-to-manual-orbit handoff) is resolved:

* Inspected integration: Threlte `<OrbitControls>` in `EditorCameraRig.svelte`
  owns per-frame `controls.update()` while `enableDamping` is on (defaults
  `true`); the orbit frame derives from the live `camera.up` on every update;
  the editor's only `camera.up` writes are the snap helper's.
* Canonical handoff: commit with the table `camera.up` inside the `lookAt`,
  `controls.update()`, then restore `camera.up` to `(0, 1, 0)` — the per-frame
  re-derivation passes through the `lookAt` epsilon guard, which reproduces the
  committed Plan-North roll at both polar faces (screen-up ≈ world ∓Z).
* Proof: `tests/lib/editor/camera/polar-orbit-handoff.test.ts` — quaternion
  stable within 1e-4 rad across the per-frame re-derivation; drags hold a
  y-invariant XZ-plane orbit (global +Y pole) with north-up preserved.

The following motion behavior is otherwise approved.

---

## Motion sampler

Proposed pure helper in the existing camera-motion authority:

```ts
createEditorCardinalSnapMotion(...)
```

Reference signature:

```ts
export function createEditorCardinalSnapMotion(
  startEye: Vector3,
  startTarget: Vector3,
  startUp: Vector3,
  targetNormal: Vector3,
  targetDistance: number,
  targetUp: Vector3,
  durationMs = 320,
  easing: CameraEasing = 'ease-out'
): CardinalSnapMotion;
```

Duration:

```text
320ms
```

Reduced motion:

```text
prefers-reduced-motion: reduce
→ 0ms direct cardinal commit
```

Easing:

```text
ease-out
```

Trajectory:

```text
eye direction:
great-circle slerp

distance:
lerp(start distance, resolved distance)

up:
slerp(start up, target cardinal up)
```

Terminal frame must exactly equal the instant cardinal commit primitive.

---

## Retarget

During active snap:

```text
click another cardinal target
→ capture current sampled eye/target/up
→ use as new start
→ restart 320ms ease-out
```

No discontinuous jump.

---

## Manual orbit interruption

Starting a legitimate viewport orbit gesture:

```text
→ abort cardinal motion sampler immediately
→ no terminal snap
→ OrbitControls receives manual authority
→ no residual cardinal-motion velocity
```

---

## Former P3B.4 blocker — resolved record

The handoff question below was resolved by the fixture above; the inspection
record is kept for history.

Former blocker investigation inspected:

```text
OrbitControls creation        → Threlte <OrbitControls> in EditorCameraRig.svelte
camera supplied to controls   → the Scene 3D editor PerspectiveCamera
controls.target ownership     → controls.target is the live orbit target
controls.update() ownership   → Threlte per-frame task while damping/autoRotate
                                is on, plus manual updates in the rig's framing task
enableDamping                 → state-bound in the rig, defaults true
start handler                 → none registered editor-side (available for cancel wiring)
change handler                → none registered editor-side
end handler                   → none registered editor-side
all camera.up writes          → only the snap helper (commit + restore in editor-camera.ts)
any pose-normalization logic  → none outside the snap helper
```

Resolution:

```text
TOP/BOTTOM cardinal poses commit with:

+Y TOP     up = (0,0,-1)
-Y BOTTOM  up = (0,0,1)

while manual orbit retains the editor's canonical global +Y orbit behavior.
```

The fixture established that manual orbit begins from the cardinal pose
**without visible roll pop or camera jump**: the commit restores
`camera.up` to `(0, 1, 0)` after `controls.update()`, and the per-frame
re-derivation through the `lookAt` epsilon guard reproduces the committed
Plan-North roll at both polar faces. No epsilon offsets and no silent
`camera.up` resets were needed — the restore is the specified,
fixture-pinned handoff.

---

# Group C — Camera Preview Affordance Reconciliation

## P3B.5 → P3B.6

Canonical interaction grammar:

```text
Click
→ select

Preview action
→ change preview scope

Play / Pause
→ control current preview
```

Normal selection never:

```text
starts playback
changes preview scope
resets playhead
replaces active preview
```

Selection and preview remain independent.

---

## Node preview

Sequenced and unsequenced nodes use identical action:

```text
Preview Camera
```

Example scope label:

```text
Preview: Camera · Central Hall
```

A camera pose does not require Sequence membership to preview.

---

## Sequence preview

Sequence preview belongs to:

```text
Sequence Inspector
and/or
Camera Timeline
```

not individual topology edges.

Example:

```text
Preview: Sequence · Main Visitor Tour
```

Full-sequence playback follows explicit Sequence order and existing graph adjacency.

---

## Edge preview

Topology remains undirected.

### Sequence-adjacent connection

Expose one direct labeled preview action.

Direction derives only from:

```text
sequence predecessor
→ immediate sequence successor
```

Never derive direction from:

```text
endpoint storage order
timing key order
selection
pointer side
name sorting
```

### Non-sequence-adjacent / unsequenced connection

Expose:

```text
Preview Edge
```

Then compact explicit direction choice:

```text
Camera A → Camera B
Camera B → Camera A
```

This is direction selection for one undirected topology edge.

It is not a second topology model.

Existing `Reverse` may remain transport behavior after edge preview begins.

Example active label:

```text
Preview: Edge · Camera A → Camera B
```

---

## Camera Plan / Camera 3D parity

Camera Plan and Camera 3D reuse same Camera preview commands.

Camera 3D does not receive a second preview engine.

Camera Plan does not receive framing controls merely because preview can enter 3D.

Previewing from Camera Plan may switch representation to Camera 3D while preserving canonical Camera selection.

---

# Core QA

## P3B.7a — Focused regression

Verify:

### Plan

* Scene Plan and Camera Plan parity;
* X/Z ruler semantics;
* no Plan transform regression;
* corner key remains presentation-only.

### Orientation widget

* Scene 3D only;
* correct six cardinal face identities;
* canonical oblique X/Z/Y geometry;
* dynamic camera-derived projection;
* back-face culling;
* edge-on label fade;
* bidirectional axis reticles;
* hover/press/focus states;
* no selection mutation;
* no history;
* no document write;
* reduced-motion direct snap;
* invalid basis atomic no-op.

### Camera preview

* click selects only;
* Preview Camera changes node-preview scope;
* Preview Sequence changes sequence-preview scope;
* sequence edge direction derives from Sequence adjacency;
* unsequenced edge requires explicit direction choice;
* topology remains visually undirected;
* Reverse remains transport behavior only.

---

## P3B.7b — Deferred P3.4/P3.5 acceptance tail

Existing context-menu adapters remain low-priority/deferred.

After core P3B:

* retest;
* accept if stable;
* fix only if touched code regressed them;
* report independently from core P3B.

They do not block core shipment.

---

## P3B.8 — Browser QA

Verify all four canonical views:

```text
Scene Plan
Scene 3D
Camera Plan
Camera 3D
```

Check:

* shell continuity;
* Scene/Camera isolation;
* timeline continuity;
* selection preservation;
* hover/focus behavior;
* high-DPI SVG rendering;
* orientation widget clipping;
* reduced motion;
* keyboard activation;
* pointer isolation;
* Camera preview transport;
* no relic-route regression.

---

# Sequential Execution Order

```text
1. Group A
   P3B.4a
   P3B.4b

2. Group B
   P3B.1
   P3B.2
   P3B.3
   P3B.4

3. Group C
   P3B.5
   P3B.6

4. Core QA
   P3B.7a
   P3B.8

5. Deferred tail
   P3B.7b
```

The OrbitControls polar handoff was resolved by fixture on 2026-08-24 (see
P3B.4 Status); Group B proceeds without a stop gate.

---

# Definition of Done

## Group A

* Scene Plan and Camera Plan visual parity complete.
* Shared Plan corner key accepted.
* No spatial math or authority change.

## Group B

* SVG orientation widget mounted only in Scene 3D.
* Light neutral cube matches approved visual direction.
* X/Z/Y axes hug cube in canonical oblique pose.
* Widget follows actual camera orientation.
* Six cardinal targets map exactly to approved face table.
* Basis resolution reuses existing framing authority.
* Selection/document/history remain untouched.
* Reduced-motion path commits instantly.
* Polar OrbitControls behavior proven and pinned before P3B.4 closes.

## Group C

* Selection and preview scope remain independent.
* Node preview semantics identical for sequenced and unsequenced cameras.
* Sequence preview belongs to Sequence/timeline surface.
* Edge-preview direction explicit and deterministic.
* Camera topology remains undirected.

## Core

* Focused tests pass.
* Browser QA passes.
* No second graph, motion, timeline, selection, coordinate, framing, or persistence system introduced.

## Deferred tail

* P3.4/P3.5 context-menu acceptance reported separately.
* Deferred status does not block core P3B shipment.
