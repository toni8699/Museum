# P3B — Orientation Box, Plan Parity, and Camera Preview Affordances

**Date:** 2026-08-24
**Status:** In progress — standalone follow-up after P3 close
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
P3B.2  SVG projection / geometry / rendering          SHIPPED (2026-08-24)
P3B.3  interaction states / hit isolation             SHIPPED (2026-08-25)
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

| World normal | Face   | Cardinal lookAt up |
| ------------ | ------ | ------------------ |
| `+X`         | RIGHT  | `(0, 1, 0)`        |
| `-X`         | LEFT   | `(0, 1, 0)`        |
| `+Y`         | TOP    | `(0, 0, -1)`       |
| `-Y`         | BOTTOM | `(0, 0, 1)`        |
| `+Z`         | FRONT  | `(0, 1, 0)`        |
| `-Z`         | BACK   | `(0, 1, 0)`        |

The cardinal table defines the temporary up-vector used to construct the
snapped quaternion. After controls synchronization, `camera.up` returns to
global `(0, 1, 0)`. The snapped visual roll/orientation remains encoded in
`camera.quaternion`. Tests assert final quaternion/screen orientation, not
persistent cardinal `camera.up`.

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
camera visual roll/orientation quaternion
camera view direction
```

`camera.up` participates in snap construction, then returns to the canonical
global +Y OrbitControls pole under the P3B.4 handoff contract.

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

**Status:** Shipped 2026-08-24. Pure projection fixtures, full suite,
`svelte-check`, production build, and browser QA pass. P3B.3 owns remaining
interaction-state/proxy work; P3B.4 owns motion.

## Rework baseline

The first P3B.2 implementation is **rejected by browser QA**, not a clean slate.

### Keep

```text
projector-writer / DOM-overlay-reader architecture
Scene-3D-only mount gating
snap wiring through canonical cardinal snap authority
preview-disabled gate
Enter / Space keyboard activation
spoken accessible labels
existing EDITOR_DRAG_THRESHOLD_PX constant
```

The existing `EDITOR_DRAG_THRESHOLD_PX` is reusable infrastructure only. The
current orientation widget does **not** yet satisfy the required
pointer-threshold behavior merely because the constant exists; P3B.3 must
explicitly wire pointer-down/move/up/cancel tracking against it.

### Replace

```text
static isometric point tables
dashed / ghost back-face rendering
through-body double-ended axis graphics
dark navy cube faces
stable camera-ref publication as the orientation render signal
```

Later slices replace behavior outside P3B.2:

```text
P3B.3  dominant-axis-is-always-active behavior + incomplete pointer isolation
P3B.4  instant-only orientation snap
```

### Self-contained render acceptance

This plan is the implementation authority for P3B.2. No local `§2.4` or
external designer brief is required for conformance.

P3B.2 passes when all of the following render/projection requirements are true:

* orientation geometry updates during ordinary Scene 3D orbit, not only after cardinal snaps;
* projected cube geometry derives from immutable per-frame camera-orientation snapshots;
* only front-facing cube faces are painted;
* the cube uses the light neutral face palette and dark edge/label treatment defined in this plan;
* the design-reference oblique pose renders `TOP`, `FRONT`, and `RIGHT`;
* `Z` hugs the projected FRONT bottom edge, `X` hugs the projected RIGHT bottom edge, and `Y` hugs the projected RIGHT outer vertical edge at that reference pose;
* arbitrary camera rotations remain truthful projections and do not force axes back into the reference layout;
* face labels use the local edge-on fade contract;
* axis foreshortening uses the local reticle contract;
* the 88 px tile uses the single coordinate model defined below;
* the snapshot publishes the face centers/directions P3B.3 needs for six-face interaction geometry;
* focused projection tests assert these rules.

P3B.3 owns pointer/keyboard reachability, gesture isolation, and all
hover/pressed/active/focus/disabled behavior. P3B.4 owns animated and
reduced-motion snap execution. Those later-slice requirements remain part of
the Group B definition of done, but they do not block closing P3B.2.

No external visual brief may add behavior that is absent from this plan.

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

Keep projection math pure and independently testable. Do not bury it in the
Svelte component:

```ts
projectOrientationGeometry(input: OrientationProjectionInput):
  OrientationProjectionSnapshot
```

Canonical geometry constants:

```ts
const ORIENTATION_VIEWBOX_SIZE = 88;
const ORIENTATION_WIDGET_CENTER = [44, 44] as const;
const ORIENTATION_CUBE_HALF_EXTENT = 15;
const ORIENTATION_AXIS_EXTENSION = 10;
const ORIENTATION_AXIS_ARROW_LENGTH = 4.5;
const ORIENTATION_AXIS_ARROW_BASE = 3.5;
```

The cube's eight object-space vertices are every signed combination of:

```text
(±15, ±15, ±15)
```

Face membership follows its fixed coordinate and outward normal:

```text
+X / -X  → x = +15 / -15
+Y / -Y  → y = +15 / -15
+Z / -Z  → z = +15 / -15
```

World-to-widget rotation:

```ts
const viewRotation = camera.quaternion.clone().invert();

const widgetVector = worldVector
  .clone()
  .applyQuaternion(viewRotation);
```

Orthographic SVG projection is exact:

```ts
screenX = 44 + widgetVector.x;
screenY = 44 - widgetVector.y;
depth = widgetVector.z;
```

For each face:

```text
project its four vertices
order them clockwise around their projected centroid
sort painted faces far → near by view-space centroid depth
draw unique visible cube edges once, after face fills
place face label at projected centroid
```

Positive-axis graphics use fixed cube-corner anchors:

```text
+X anchor  (+15, -15, +15)  → extend along +X
+Y anchor  (+15, +15, -15)  → extend along +Y
+Z anchor  (-15, -15, +15)  → extend along +Z
```

Shaft endpoint is `anchor + axis × 10`; project anchor and endpoint through the
same view transform as the cube. Outside reticle mode, normalize that projected
2D shaft direction, place the arrow apex `4.5px` beyond the projected endpoint,
and place its `3.5px` base perpendicular to that screen ray. Axis glyph center
sits `4px` beyond the arrow apex. Cube vertices, anchors, and shaft endpoints
all use the same view rotation and orthographic projection; arrowhead and glyph
sizing stay screen-space legible.

Face shading uses one fixed view-space key light:

```ts
const ORIENTATION_VIEW_LIGHT = normalize([-0.35, 0.85, 1]);
const lightAmount = clamp(viewNormal.dot(ORIENTATION_VIEW_LIGHT), 0, 1);
```

Interpolate piecewise so all three registered tokens have deterministic
meaning:

```text
0…0.5  shadow → mid
0.5…1  mid → lit
```

Projection fixtures call this pure helper directly. Svelte projector only
samples live camera input and publishes helper output.

---

## Reactive projection snapshot contract

A stable mutable Three camera reference is **not** sufficient Svelte reactivity
for the orientation widget.

`EditorOrientationGizmoProjector` must sample the active Scene 3D camera during
the existing Canvas frame/update path and publish an immutable projection
snapshot.

Conceptually:

```ts
type OrientationPoint2 = readonly [x: number, y: number];

type OrientationProjectionInput = {
  cameraQuaternion: readonly [x: number, y: number, z: number, w: number];
  /** Normalized target-to-eye direction sampled from camera/controls. */
  eyeDirection: readonly [x: number, y: number, z: number];
};

type ProjectedOrientationFace = {
  face: CardinalView;
  polygon: readonly OrientationPoint2[];
  center: OrientationPoint2;
  directionFromCubeCenter: OrientationPoint2;
  viewDot: number;
  painted: boolean;
  lightAmount: number;
  labelOpacity: number;
};

type ProjectedOrientationAxis = {
  face: '+X' | '+Y' | '+Z';
  projectedAnchor: OrientationPoint2;
  projectedShaftEnd: OrientationPoint2;
  arrowPolygon: readonly OrientationPoint2[] | null;
  reticleCenter: OrientationPoint2 | null;
  glyphCenter: OrientationPoint2;
  foreshortened: boolean;
};

type OrientationProjectionSnapshot = {
  cameraQuaternion: readonly [number, number, number, number];
  eyeDirection: readonly [number, number, number];

  /** All six faces; `painted` controls visual DOM output. */
  faces: readonly ProjectedOrientationFace[];
  axes: readonly ProjectedOrientationAxis[];
};
```

The pure projection module owns conversion from sampled Three camera values to
renderer-neutral numeric geometry. The projector owns only live sampling,
material-change comparison, and snapshot publication.

Each relevant frame:

```text
read current camera quaternion / eye-target direction
→ clone numeric orientation values
→ project cube vertices and world axes
→ derive visible face polygons
→ derive projected face centers/directions for P3B.3 interaction proxies
→ publish immutable snapshot when materially changed
```

**Materially changed** is defined deterministically against the **last
published snapshot**, never merely against the immediately previous sampled
frame. Sub-threshold samples therefore accumulate until publication rather
than suppressing a slow continuous orbit forever. Publish when any of:

* quaternion angular delta > 1e-5 rad
* any projected point moves > 0.1 CSS px
* eye direction moves enough to change face visibility or reticle state
* face visibility changes
* face interaction-anchor or reticle state changes

Without a threshold, the projector would allocate and publish every frame even
when the camera is idle.

The DOM/SVG overlay consumes that snapshot.

It must **not** depend on mutation of a stable `PerspectiveCamera`, `Vector3`,
or `Quaternion` reference to trigger Svelte updates.

Acceptance:

```text
ordinary OrbitControls drag
→ camera quaternion changes
→ projection snapshot changes
→ SVG cube rotates on next render

no cardinal snap required
no document/session mutation required
```

---

## Tile coordinate model

Use exactly one coordinate system.

```text
Outer widget box:       88 × 88 CSS px
SVG rendered size:      88 × 88 CSS px
SVG viewBox:            0 0 88 88
CSS padding:            0
box-sizing:             border-box
geometry safe inset:    encoded inside SVG coordinates
```

Reference:

```html
<div class="orientation-box">
  <svg viewBox="0 0 88 88">
    ...
  </svg>
</div>
```

```css
.orientation-box {
  width: 88px;
  height: 88px;
  padding: 0;
  border: 0;
  box-shadow: inset 0 0 0 1px var(--editor-orientation-border);
  box-sizing: border-box;
}
```

The shell border must not consume content-box pixels. Use the inset shadow
above (or an equivalent SVG/pseudo-element overlay that does not participate
in layout). Do not keep the current `1px` CSS border: under `border-box` it
would reduce the SVG content area to `86 × 86` and silently rescale geometry.

Do **not** combine an `88 × 88` viewBox with `8px` CSS padding around the SVG.
That would rescale the intended geometry and repeatedly under-fill the tile.

The former "8px inner padding" is only a **geometry safe area**:

```text
core cube geometry:            prefer x/y 8…80
axis arrowheads / glyphs:      may extend to x/y 4…84
focus-visible outline:         may bleed outside through SVG overflow
```

It is not CSS layout padding.

Retire `--editor-orientation-padding` from `tokens.css` and the matching design
token registry when the render rework lands; no other current consumer exists.
Do not preserve an unused token whose former value would reintroduce the
rejected scaling model.

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

---

## Design-reference oblique pose

`TOP + FRONT + RIGHT` is a **visual QA reference pose**, not the editor
boot/default camera.

P3B does **not** change `EDITOR_NEUTRAL_CAMERA_POSITION` or any existing
Scene 3D boot camera merely to make the widget resemble the design sketch.

Define the synthetic design-reference direction as:

```ts
const ORIENTATION_DESIGN_REFERENCE_EYE_DIRECTION =
  normalize([1, 0.75, 1]);
```

with:

```ts
up = [0, 1, 0];
```

At this reference pose:

```text
visible faces:
TOP
FRONT
RIGHT

axis presentation:
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

This pose exists only for:

```text
projection fixtures
visual regression
geometry QA
design comparison
```

At the real editor neutral/boot pose, the widget must truthfully reflect that
camera even if one reference face becomes edge-on or is culled.

No default-camera change is authorized by P3B.

### Dynamic orientation

During arbitrary camera orientation:

* cube vertices rotate/project from actual camera orientation;
* world-axis endpoints use the same transform;
* axes remain truthful world-axis projections;
* renderer must not artificially force them back to the default bottom/right silhouette.

---

## Face identity

```text
+X  RIGHT
-X  LEFT
+Y  TOP
-Y  BOTTOM
+Z  FRONT
-Z  BACK
```

---

## Painted face geometry

Paint a face only when:

```text
N · V > 0
```

Back-facing faces have:

```text
no fill
no wireframe
no label
```

This removes ghost-face clutter.

Culling painted geometry does **not** remove the cardinal interaction target.

---

## P3B.3 six-face pointer geometry

This section consumes P3B.2's immutable projected face centers/directions.
It is implemented and accepted in P3B.3, not P3B.2.

All six cardinal faces remain explicit interaction targets.

Use two interaction forms.

### Front-facing face

For a painted/front-facing face whose projected bounding box has both width
and height at least `14px`:

```text
pointer target = projected face polygon
```

The visual polygon and pointer geometry correspond directly.

### Edge-on visible face

Painting and interaction eligibility use separate thresholds. A face with
`N · V > 0` may remain visually present while its projected polygon becomes
too thin to hit.

```text
projected width < 14px OR projected height < 14px
→ keep painted face under the normal culling rule
→ use the perimeter proxy for interaction
```

Use hit-mode hysteresis:

```text
enter proxy mode below 14px
leave proxy mode above 16px
```

This prevents a nearly edge-on front face from becoming a subpixel pointer
target and prevents hit geometry from flickering during slow orbit.

### Culled/opposite face

For a back-facing face, create a transparent **opposite-face proxy** in a
separate interaction layer.

The proxy is not painted at rest.

Derivation:

```ts
const projectedFaceDirection =
  projectedFaceCenter.sub(projectedCubeCenter);

if (projectedFaceDirection.length() >= MIN_PROXY_DIRECTION) {
  proxyCenter =
    projectedCubeCenter +
    normalize(projectedFaceDirection) * OPPOSITE_FACE_PROXY_RADIUS;
}
```

Reference constants:

```text
OPPOSITE_FACE_PROXY_RADIUS = 36px
proxy hit box              = minimum 14 × 14px
MIN_PROXY_DIRECTION        = 2px  (enter fallback < 2px, leave fallback > 3px)
```

Hysteresis prevents the proxy from teleporting as the projected face
direction crosses the 2px boundary during camera orbit.

This places the target near the tile perimeter in the projected direction of
the hidden face rather than layering an unreachable back-face polygon beneath
a visible face.

### Degenerate proxy fallback

When the projected face direction is too small because the face normal is
nearly parallel to the view direction, use deterministic signed fallback slots:

```text
+X  → right
-X  → left

+Y  → top
-Y  → bottom

+Z  → lower-left
-Z  → upper-right
```

The fallback affects **interaction geometry only**. It does not alter cube
projection.

### Proxy presentation

At rest:

```text
transparent
no label
no ghost wireframe
```

Every proxy uses `cursor: pointer`. On hover or keyboard focus it **must**
expose a visible compact target cue/tooltip such as:

```text
LEFT · -X
BOTTOM · -Y
BACK · -Z
```

This is an interaction affordance, not another rendered cube face.

### Hit priority

When targets overlap:

```text
1. painted face polygon
2. visible axis / reticle target
3. opposite-face proxy
```

A hidden proxy must never steal a click from visible cube geometry.

Keyboard navigation includes all six faces regardless of current visibility.

### Accessibility semantics

The current SVG root's `role="img"` must be removed because image semantics can
flatten interactive descendants in the accessibility tree.

Required structure:

```text
orientation shell  → role="group" + spoken widget label
SVG root           → no role="img"
face/proxy/axis     → exposed button semantics + exact spoken cardinal label
Tab order          → six faces, then visible axis/reticle targets
Enter / Space      → same guarded activation path as pointerup
```

While camera preview owns the camera:

```text
shell and targets expose aria-disabled="true"
targets leave Tab order (tabindex = -1)
pointer and keyboard handlers remain guarded no-ops
```

Focus-visible styling applies to painted faces, perimeter proxies, axis
arrowheads, and reticles.

---

## Canonical visual requirements

Cube:

```text
light neutral drafting-gray faces
dark crisp 1px outlines
dark uppercase face labels
flat restrained shading
no dashed hidden faces
no glow
no glass
no realistic lighting
```

Registered face palette:

```css
--editor-orientation-face-lit:    #EAEEF2;
--editor-orientation-face-mid:    #D8DCE0;
--editor-orientation-face-shadow: #C2C7CC;
--editor-orientation-edge-solid:  #1E2C3A;
```

Axes:

```css
--editor-gizmo-x: #F05252;
--editor-gizmo-y: #45C878;
--editor-gizmo-z: #3B82F6;
```

At the design-reference pose:

```text
Z = blue, along FRONT lower edge toward left
X = red, along RIGHT lower edge toward right
Y = green, along RIGHT outer edge upward
```

Axis extensions remain short. They hug the cube rather than form a detached
triad.

---

## Face-label edge-on fade

For visible faces:

```text
N·V < sin(18°)
→ opacity 0

sin(18°) ≤ N·V ≤ sin(28°)
→ linear opacity 0 → 1

N·V > sin(28°)
→ opacity 1
```

---

## Axis foreshortening

Compression remains bidirectional:

```ts
Math.abs(axis.dot(viewDirection)) > Math.cos(12 * DEG2RAD)
```

When true:

```text
shaft → collapsed
arrowhead → 6px circular reticle
axis glyph → centered
pointer target → minimum 14 × 14px
```

---

# P3B.3 — Orientation Interaction States

**Status:** Shipped 2026-08-25. Six cardinal face targets, direct/proxy and
direction-fallback hysteresis, explicit cardinal-active tolerance, pointer
capture with the shared drag threshold, hit priority, keyboard order,
preview-disabled guards, and hover/pressed/focus/active presentation are
fixture- and browser-verified. P3B.4 owns motion.

## Pointer threshold wiring

`EDITOR_DRAG_THRESHOLD_PX` already exists.

P3B.3 must actually wire it into orientation-tile pointer state.

Required behavior:

```text
pointerdown
→ record pointer id + start clientX/clientY + target
→ capture pointer

pointermove
→ if distance from start > EDITOR_DRAG_THRESHOLD_PX
   mark activation cancelled

pointerup
→ activate only if:
   same pointer
   threshold not exceeded
   target still valid

pointercancel / lostpointercapture
→ clear gesture
```

A cancelled orientation-box gesture:

```text
does not snap
does not select
does not start OrbitControls
```

Tile pointer handling must stop the gesture from bleeding through to Scene 3D
object hit testing or orbit input.

---

## Active cardinal alignment

Do not use "dominant axis" as equivalent to "camera is aligned."

Introduce one explicit tolerance:

```ts
const ORIENTATION_CARDINAL_ACTIVE_DOT_MIN = 0.999;
```

Equivalent angular tolerance:

```text
≈ 2.56°
```

Consume the normalized eye direction from P3B.2's immutable projection
snapshot. Do not reread mutable camera/controls refs in the DOM overlay:

```ts
const eyeDirection = snapshot.eyeDirection;
```

A cardinal face is active only when:

```ts
dot(eyeDirection, faceNormal) >=
  ORIENTATION_CARDINAL_ACTIVE_DOT_MIN
```

If no face satisfies the threshold:

```text
activeFace = null
```

Therefore:

```text
exact / near cardinal pose
→ one active face

ordinary oblique pose
→ no active face
```

Replace any current helper/test behavior that returns the largest-magnitude
axis at every camera orientation.

Required fixtures:

```text
exact +X                 → RIGHT
exact -X                 → LEFT
exact +Y                 → TOP
exact -Y                 → BOTTOM
exact +Z                 → FRONT
exact -Z                 → BACK

2° away from cardinal    → still active
3° away from cardinal    → inactive
generic oblique pose     → null
```

---

## Hover token authority

Do not repurpose the existing container-hover token.

Keep:

```css
--editor-orientation-hover: #142230;
```

for the orientation shell/container hover treatment.

Register separate face-state tokens before the render rework:

```css
--editor-orientation-face-hover:
  rgba(13, 25, 37, 0.10);

--editor-orientation-face-pressed:
  rgba(0, 0, 0, 0.20);
```

Face hover uses:

```css
var(--editor-orientation-face-hover)
```

Face pressed uses:

```css
var(--editor-orientation-face-pressed)
```

The face token is a translucent dark-navy overlay approved for light faces.
The opaque `--editor-orientation-hover` remains the separate shell/container
hover token and must not be repurposed as the face overlay.

---

## States

### Default

* light neutral faces;
* dark edge;
* axis colors preserved.

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

At t = 1, animated and reduced-motion/instant paths must converge to the
same observable snapped pose:

* identical eye position
* identical controls target
* identical camera quaternion within fixture tolerance
* identical projection properties
* identical post-handoff OrbitControls state

Raw sampler `up` is the cardinal lookAt construction vector; final `camera.up`
follows the P3B.4 global +Y handoff contract.

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
* design-reference oblique pose renders TOP + FRONT + RIGHT;
* editor neutral camera constants remain unchanged;
* dynamic camera-derived projection without cardinal snap;
* ordinary OrbitControls drag publishes new quaternion/projection snapshot;
* DOM overlay changes without cardinal snap;
* projected cube geometry derives from immutable per-frame snapshots;
* pure projection fixtures pin cube vertices, face ordering, axis anchors, shading, and SVG coordinates;
* material-change thresholds compare against the last published snapshot;
* slow sub-threshold orbit eventually publishes accumulated movement;
* only front-facing cube faces are painted;
* all six cardinal faces pointer/keyboard reachable (visible polygon + opposite-face proxy);
* near-edge visible face switches to proxy hit geometry below 14px and returns above 16px;
* hidden proxy never wins over overlapping painted geometry;
* hidden proxy exposes mandatory hover/focus cue and pointer cursor;
* light neutral face palette and dark edge/label treatment;
* Z/X/Y axes truthful projections at arbitrary camera orientations;
* 88 × 88 CSS px outer box; SVG 88 × 88 with viewBox 0 0 88 88; neither CSS padding nor border rescales SVG;
* retired `--editor-orientation-padding` has no source or registry references;
* cube/axes occupy intended geometry budget;
* face-label edge-on fade contract;
* bidirectional axis foreshortening reticle contract;
* hover/pressed/active/focus/disabled tokens locally registered;
* generic oblique orientation has no active face;
* active state appears only within 0.999 dot threshold;
* pointer threshold: ≤ threshold activates, > threshold cancels;
* cancelled gesture does not leak to OrbitControls;
* SVG root has no `role="img"`; interactive descendants remain exposed to assistive technology;
* preview-disabled targets expose `aria-disabled`, leave Tab order, and remain guarded no-ops;
* shell hover remains navy token;
* face hover uses white 14% overlay token;
* back-face culling;
* edge-on label fade;
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
* Pure projection helper pins canonical vertices, projection, face order, axis anchors, and shading.
* X/Z/Y axes hug cube in the design-reference oblique pose.
* Widget follows actual camera orientation.
* Six cardinal targets map exactly to approved face table through painted-face or proxy hit geometry.
* Near-edge faces retain a minimum pointer target without changing painted projection.
* Interactive SVG descendants remain accessible; preview-disabled state removes them from Tab order.
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
