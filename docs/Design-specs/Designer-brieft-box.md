# Scene 3D Orientation Box — Canonical Implementation Specification & Contract (Revision 6)

**Document Status:** Implementation-Ready — P3B.1–P3B.4 (polar handoff fixture-pinned)  
**Increments Covered:** P3B.1 (Snap Primitive & Fallback), P3B.2 (Projection & Render), P3B.3 (Interaction States), P3B.4 (Motion & Test Fixtures)  
**Authority:** Reconciled with `tokens.css`, `camera-motion.ts`, `editor-camera.ts`, `types/scene.ts`, and Reference Sketches (`Scene/scene-3d-assets.png` & `x-y-z-box.png`).

---

## 1. Architectural Boundaries & State Authority

The orientation box is an isolated, camera-derived presentation overlay. It possesses zero document, selection, or preview authority.

### 1.0 Mount Contract

```text
Scene → 3D       MOUNTED + INTERACTIVE
Scene → Plan     ABSENT
Camera → Plan    ABSENT
Camera → 3D      ABSENT
```

Restated locally from the P3B plan; the shipped gating (`isCameraContext`) already implements this.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      TWO-PHASE SNAP EXECUTION MODEL                     │
└─────────────────────────────────────────────────────────────────────────┘

 1. RESOLUTION PHASE (editor-camera.ts)
    resolveEditorCardinalSnapBasis(camera, controls, fallbackResolver)
    ├── Valid active target & distance?  ──► Use active basis
    ├── Bounds framing available?        ──► Use bounds basis
    ├── Boot neutral constants valid?    ──► Use neutral basis
    └── Degenerate / Unresolvable?       ──► Return null (Safe No-Op)

 2. COMMIT PHASE (editor-camera.ts / camera-motion.ts)
    snapEditorViewToCardinal(face, camera, controls, resolvedTarget, resolvedDistance)
    ├── Animated Path: createEditorCardinalSnapMotion() [320ms, ease-out]
    └── Instant Path: Direct pose commit (Reduced motion: 0ms)
```

### 1.1 Preserved vs. Replaced Properties (P3B.1 Invariants)
A cardinal snap mutates only the viewport camera's observer pose.

* **Strictly Preserved:**
  * Active OrbitControls target (when valid and finite)
  * Eye-to-target distance (clamped strictly to existing controls `[minDistance, maxDistance]`)
  * Perspective projection attributes (FOV, zoom, near, far)
  * OrbitControls configuration (damping, enabled state, control bounds)
  * Active selection across domains (`SceneSelection`, `CameraSelection`)
  * Scene Plan local mode memory (Layout | Arrange)
  * Scene 3D active tool / TransformControls mode
  * Preview FSM state and Camera timeline playhead/scope
  * Document state (`SceneDocument`) and Undo/Redo history
* **Replaced:**
  * Camera position ($\mathbf{eye}$)
  * Camera orientation quaternion
  * Camera line-of-sight vector ($\mathbf{look} = \mathbf{target} - \mathbf{eye}$)
  * Camera roll / up vector ($\mathbf{up}$)

### 1.2 Cardinal Face Mapping Table

$$\mathbf{eye} = \mathbf{target} + \mathbf{normal} \times \text{distance}$$

| World Normal | Face Label | Cardinal `camera.up` | Viewport & Plan Alignment |
| :--- | :--- | :--- | :--- |
| **`+Y`** | **`TOP`** | `(0, 0, -1)` | Screen Up $\equiv$ Plan North (World $-Z$) |
| **`-Y`** | **`BOTTOM`** | `(0, 0, 1)` | Screen Up $\equiv$ Plan South (World $+Z$) |
| **`+Z`** | **`FRONT`** | `(0, 1, 0)` | Standard Eye Elevation |
| **`-Z`** | **`BACK`** | `(0, 1, 0)` | Standard Eye Elevation |
| **`+X`** | **`RIGHT`** | `(0, 1, 0)` | Standard Eye Elevation |
| **`-X`** | **`LEFT`** | `(0, 1, 0)` | Standard Eye Elevation |

---

## 2. Geometric Projection & Orientation Rules

```
 0,0 ────────────────────────────────────────────────────────── 88,0
  │   16px Viewport Margins (Top / Right anchored)                │
  │   ┌────────────────────────────────────────────────────┐      │
  │   │  [8px Inner Tile Padding]                          │      │
  │   │                                       Y (11px)     │      │
  │   │                                       ▲            │      │
  │   │                                       │ Y-Shaft    │      │
  │   │                               ┌───────┴──────┐     │      │
  │   │                              /     TOP      /│     │      │
  │   │                             /  (dark text) / │     │      │
  │   │                            ├──────────────┤  │     │      │
  │   │                            │              │ R│     │      │
  │   │                   Z-Shaft  │    FRONT     │ I│───► │ X    │
  │   │               ◄────────────┴──────────────┴──┼─────┘ (11px│
  │   │            Z (11px)                          │ X-Shaft    │
  │   │                                                           │
  │   └────────────────────────────────────────────────────┘      │
 0,88 ───────────────────────────────────────────────────────── 88,88
```

### 2.1 World-to-Widget Camera Projection
The orientation box visualizes world coordinate axes as observed by the active Scene 3D camera. The transformation rotates world vectors into widget coordinate space using the inverse of the camera's orientation quaternion:

```ts
const viewRotation = camera.quaternion.clone().invert();
const widgetVector = worldVector.clone().applyQuaternion(viewRotation);
```

### 2.2 Canonical vs. Dynamic Presentation
* **Canonical Default Oblique Pose:**
  * **$+Z$ Axis (Blue):** Hugs the bottom edge of the `FRONT` face, projecting leftward past the bottom-front-left vertex.
  * **$+X$ Axis (Red):** Hugs the bottom edge of the `RIGHT` face, projecting rightward past the bottom-right-front vertex.
  * **$+Y$ Axis (Green):** Hugs the outer vertical edge of the `RIGHT` face, projecting upward past the top-right-back vertex.
* **Dynamic Rotation:**
  * Cube vertices and world-axis endpoints rotate rigidly together via the orientation transform.
  * The renderer does **not** artificially tether or pin axes to the outer 2D bounding silhouette when rotated. World axes rotate truthfully in projected 3D space.

### 2.3 Dimension Budget
* **Tile Outer Shell:** $88 \times 88\text{ px}$, `border-radius: var(--editor-orientation-radius, 6px)`.
* **Cube Sizing:** Isometric edge length $L = 30\text{ px}$ (vertex radius $R_v \approx 26.0\text{ px}$).
* **Axis Shafts:** Solid stroke $1.5\text{ px}$, extending $10\text{ px}$ from cube corner vertices.
* **Arrowhead Tips:** Conical tip, base width $= 3.5\text{ px}$, length $= 4.5\text{ px}$.
* **Axis Typography Offset:** Axis glyphs (`X`, `Y`, `Z`) are positioned $4\text{ px}$ past the arrowhead apex along the ray vector (maximum radial extent $\approx 40\text{ px}$, ensuring $\ge 4\text{ px}$ clearance inside the tile boundary).
* **Back-Face Culling:** Polygons with $N \cdot V \le 0$ are culled from DOM rendering.

### 2.4 Back-Face Hit Targets (Negative Cardinals)

Culling is a *rendering* rule, not an interaction rule — all six faces remain
snappable:

* Each culled face additionally renders an **invisible hit polygon**
  (`fill: transparent; stroke: none; pointer-events: all;`) at its projected
  position, carrying its spoken label and participating in keyboard Tab order.
* Invisible hit polygons mount **before** the solid faces in DOM order, so a
  front face wins every pixel it covers; a back face is clickable exactly
  where its silhouette sliver is exposed.
* Visible axis arrowheads remain the positive-axis targets; the invisible
  layer is what makes LEFT / BOTTOM / BACK reachable in the canonical pose.

---

## 3. Visual Language, Shading & Typography

```
                    Key Light Vector L = [0.35, 0.85, 0.40]
                                 \
                                  \
                                   ▼
                    ┌─────────────────────────────┐
                    │          TOP Face           │  #EAEEF2 (N·L ≈ 0.85)
                    │  Text: #0D1925 (Bold 8.5px) │
                    ├──────────────┬──────────────┤
                    │  FRONT Face  │  RIGHT Face  │
                    │   #D8DCE0    │   #C2C7CC    │
                    │ (N·L ≈ 0.50) │ (N·L ≈ 0.20) │
                    └──────────────┴──────────────┘
```

### 3.1 Face Lighting & Shading
Face fill luminance is calculated dynamically using the clamp of the face normal $N$ and key light vector $L$, interpolating strictly between registered design tokens:

$$\text{FaceFill} = \text{color-mix}\left(\text{in srgb},\, \text{var}(--\text{editor-orientation-face-lit})\; (100\% \times \text{clamp}(N \cdot L, 0, 1)),\, \text{var}(--\text{editor-orientation-face-shadow})\right)$$

* **Lit Face Reference ($N \cdot L \approx 1.0$):** `var(--editor-orientation-face-lit)` (`#EAEEF2`)
* **Mid-Tone Reference ($N \cdot L \approx 0.5$):** `var(--editor-orientation-face-mid)` (`#D8DCE0`)
* **Shadow Face Reference ($N \cdot L \le 0.0$):** `var(--editor-orientation-face-shadow)` (`#C2C7CC`)
* **Cube Wireframe Edges:** $1\text{ px}$ solid stroke in `var(--editor-orientation-edge-solid)` (`#1E2C3A`).

### 3.2 Face Label Edge-On Fade
Face names are drawn in dark charcoal (`var(--editor-orientation-surface, #0D1925)`) directly on the light-gray faces. To prevent distorted text collisions as a face approaches an edge-on angle relative to the line of sight:

* **Visibility Condition:** Face is front-facing ($N \cdot V > 0$, where $V = \text{normalize}(\mathbf{eye} - \mathbf{target})$).
* **Fade Threshold:**
  * When $N \cdot V < \sin(18^\circ) \approx 0.3090$, face label `opacity = 0`.
  * When $\sin(18^\circ) \le N \cdot V \le \sin(28^\circ)$, label opacity scales linearly from `0.0` to `1.0`.
  * When $N \cdot V > \sin(28^\circ) \approx 0.4695$, label opacity is `1.0`.

### 3.3 Axis Foreshortening (Bidirectional Compression)
When a coordinate axis aligns nearly parallel to the camera view axis (pointing either directly toward or directly away from the viewer), its projected 2D length collapses:

* **Compression Condition:**
  $$|\hat{\mathbf{a}} \cdot \hat{\mathbf{v}}| > \cos(12^\circ) \approx 0.9781$$
  *(where $\hat{\mathbf{a}}$ is the unit world axis vector and $\hat{\mathbf{v}}$ is the camera viewing direction vector)*.
* **Reticle Fallback:**
  * The axis shaft collapses to zero stroke.
  * The arrowhead converts into a $\varnothing 6\text{ px}$ circular reticle centered on the vertex.
  * The axis glyph floats centered over the reticle.
  * The interactive hit-target expands to a minimum of $14 \times 14\text{ px}$.

---

## 4. Interaction Matrix & States

```
                  ┌─────────────────┬─────────────────┬─────────────────┐
                  │ Pose A: Oblique │ Pose B: Top-Down│ Pose C: Side-On │
                  │ (Default Angle) │ (Pitch: -90°)   │ (Yaw: ~85°)     │
┌─────────────────┼─────────────────┼─────────────────┼─────────────────┤
│ 1. Default      │ Solid: T, F, R  │ Solid: TOP only │ Solid: R (wide) │
│    (Resting)    │ Back culled     │ Back culled     │ Back culled     │
├─────────────────┼─────────────────┼─────────────────┼─────────────────┤
│ 2. Hover        │ Target face     │ TOP face        │ RIGHT face      │
│    (Face/Arrow) │ 10% navy overlay│ 10% navy overlay│ 10% navy overlay│
├─────────────────┼─────────────────┼─────────────────┼─────────────────┤
│ 3. Pressed      │ Target face     │ TOP face        │ RIGHT face      │
│    (Mouse Down) │ -20% tint       │ -20% tint       │ -20% tint       │
├─────────────────┼─────────────────┼─────────────────┼─────────────────┤
│ 4. Active Lock  │ Active face     │ TOP face        │ RIGHT face      │
│    (Aligned View│ 1.5px blue edge │ 1.5px blue edge │ 1.5px blue edge │
├─────────────────┼─────────────────┼─────────────────┼─────────────────┤
│ 5. Focus-Visible│ 2px blue ring   │ 2px blue ring   │ 2px blue ring   │
│    (Keyboard)   │ on target poly  │ on TOP polygon  │ on RIGHT poly   │
├─────────────────┼─────────────────┼─────────────────┼─────────────────┤
│ 6. Disabled     │ 38% opacity;    │ 38% opacity;    │ 38% opacity;    │
│    (Cam Preview)│ grayscale(80%)  │ grayscale(80%)  │ grayscale(80%)  │
└────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

* **Hover:** Face polygon overlays `var(--editor-orientation-face-hover)` (`rgba(13, 25, 37, 0.10)` — dark-navy overlay; the former white overlay was invisible on the light faces). Cursor changes to `pointer`.
* **Pressed:** Face polygon overlays `var(--editor-orientation-face-pressed)`. Face label translates $+0.5\text{ px}$ along projected Y.
* **Active Lock ($N_{\text{face}} \cdot V > 0.999$):** Active face renders an inner stroke in `var(--editor-gizmo-active)`.
* **Focus-Visible (Keyboard `Tab`):** Focused face/axis renders an outer $2\text{ px}$ stroke in `var(--editor-gizmo-hover)`.
* **Disabled (Preview Active):** Root container applies `opacity: 0.38; filter: grayscale(80%); pointer-events: none;`.

---

## 5. Motion Dynamics & OrbitControls Polar Contract

```
Frame 1: 0ms (Click)      Frame 2: 140ms (Mid-Slerp)   Frame 3: 320ms (Landing)
┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐
│ User clicks [TOP]     │ │ Eye on Great Circle   │ │ Exact Cardinal Commit │
│                       │ │ Distance lerping      │ │ Camera locked at TOP  │
│      ┌─────┐          │ │       ┌───────┐       │ │     ┌───────────┐     │
│     / TOP /│          │ │      /  TOP  /        │ │     │           │     │
│    ├─────┤ │          │ │     /       /         │ │     │    TOP    │     │
│    │FRONT│/           │ │    ├───────┤          │ │     │           │     │
│    └─────┘            │ │    │ FRONT │          │ │     └───────────┘     │
│ ease-out starts       │ │ Peak angular velocity │ │ camera.up = (0,0,-1)  │
└───────────────────────┘ └───────────────────────┘ └───────────────────────┘
```

### 5.1 Flight Interpolation
* **Duration:** $320\text{ ms}$ (`0ms` when `prefers-reduced-motion: reduce` is active).
* **Easing:** `ease-out` (from shared `CameraEasing` vocabulary in `types/scene.ts`).
* **Motion Sampler (`camera-motion.ts`):**
  1. Direction vector $\hat{\mathbf{v}}(t) = \text{slerp}(\hat{\mathbf{v}}_{\text{start}}, \hat{\mathbf{v}}_{\text{target}}, \text{easeOut}(t))$.
  2. Distance $d(t) = \text{lerp}(d_{\text{start}}, d_{\text{resolved}}, \text{easeOut}(t))$.
  3. Up-vector $\mathbf{up}(t) = \text{slerp}(\mathbf{up}_{\text{start}}, \mathbf{up}_{\text{target}}, \text{easeOut}(t))$.

### 5.2 Polar OrbitControls Handoff & Synchronization — ✅ CONFIRMED BY FIXTURE
At polar poses (`+Y` TOP and `-Y` BOTTOM), the camera commits with non-parallel up-vectors ($\mathbf{up} = (0, 0, -1)$ and $(0, 0, 1)$ respectively) to guarantee Plan North orientation.

**Grounded integration facts (verified in tree):**

* Threlte's `<OrbitControls>` runs `controls.update()` **every frame** via a task that is active while `enableDamping` is on; `EditorCameraRig.svelte` binds `enableDamping` to state defaulting `true`.
* `OrbitControls` derives its orbit frame from the live `camera.up` on every `update()`.
* Therefore a polar `camera.up` **cannot rest** at the snapped pose: the next per-frame `update()` would orbit around the polar axis, and fixture (b) below would fail by construction. Revision 5's "up remains locked at rest" is withdrawn.

**Confirmed handoff (fixture-pinned 2026-08-24):**
restore `camera.up` to `(0, 1, 0)` immediately after `controls.update()` — exactly what the shipped P3B.1 primitive already performs (`editor-camera.ts`). The per-frame damping task then re-derives the orientation from position − target through the global +Y frame. At the exact pole this passes through three.js's `lookAt` epsilon guard, which for ±Y reproduces screen-up ≈ world $\mp Z$ — the committed Plan-North roll — so the handoff is **visually seamless**.

**Proof:** `tests/lib/editor/camera/polar-orbit-handoff.test.ts` (real `OrbitControls`, headless stub DOM) — commit → forced per-frame `update()` → quaternion stable within $10^{-4}\text{ rad}$ and position within $10^{-6}$; ±Y drags hold a y-invariant XZ-plane orbit with north-up preserved; side faces re-derive exactly.

```
─────────────────────────────────────────────────────────────────────────────
CARDINAL COMMIT & CONTROLS SYNCHRONIZATION SEQUENCE
─────────────────────────────────────────────────────────────────────────────
1. Commit Execution:
   • camera.position.copy(resolvedTarget).addScaledVector(cardinalNormal, resolvedDistance)
   • camera.up.copy(cardinalUp)
   • camera.lookAt(resolvedTarget)
   • camera.updateMatrixWorld(true)

2. Controls State Update:
   • controls.target.copy(resolvedTarget)
   • controls.update()

3. Orbit-Frame Handoff (fixture-confirmed — polar-orbit-handoff.test.ts):
   • restore camera.up to (0, 1, 0) after step 2
   • the per-frame controls.update() (damping task) then re-derives the
     orientation from position − target through the global +Y frame

4. Post-Snap Orbit Drag Contract (P3B.4 Fixtures):
   • While idle at the snapped pose, the camera orientation remains visually
     locked (quaternion stable across per-frame updates).
   • When the user initiates a manual orbit drag (controls 'start' event),
     OrbitControls applies deltas in the global +Y frame relative to the
     active target.
   • Fixtures in P3B.4 must explicitly assert:
     (a) Snapped camera orientation matches the cardinal mapping at rest,
         within the epsilon tolerance the fixture pins.
     (b) Subsequent orbit drag operates around the global +Y pole without
         roll popping.
     (c) The first per-frame update() after the handoff does not change the
         visible orientation beyond that tolerance (no roll pop).
─────────────────────────────────────────────────────────────────────────────
```

### 5.3 Gesture Interruption & Threshold Rules

**P3B.4 is UNBLOCKED (2026-08-24):** the §5.2 fixture passed against the real
OrbitControls integration (`polar-orbit-handoff.test.ts`). Remaining P3B.4
scope is the motion sampler (§6.2) and widget wiring.

* **Retargeted Snap:** Clicking another face during flight captures $(\mathbf{eye}_t, \mathbf{target}_t, \mathbf{up}_t)$ as the new start basis, resets the $320\text{ ms}$ timer, and slerps toward the new cardinal target.
* **Manual Orbit Interruption:** Pointer drag on the Scene 3D canvas cancels active motion sampling immediately. `OrbitControls` takes 1:1 control with zero residual velocity.
* **Drag Threshold Consolidation:** Pointer gestures within the orientation tile utilize the consolidated $4\text{ px}$ click-vs-drag threshold. Movements $> 4\text{ px}$ cancel snap activation and never fall through to OrbitControls.

---

## 6. Concrete API Signatures

### 6.1 `editor-camera.ts` (Basis Resolution & Snap Primitive)

```ts
import type { PerspectiveCamera, Vector3 } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type CardinalFace = '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z';

export interface CardinalSnapBasis {
  target: Vector3;
  distance: number;
}

export interface SnapCardinalResult {
  committed: boolean;
  face: CardinalFace;
  position: Vector3;
  target: Vector3;
  up: Vector3;
}

/**
 * Phase 1: Resolves and validates target and distance across active state,
 * bounds framing, and neutral boot constants. Returns null if unresolvable.
 */
export function resolveEditorCardinalSnapBasis(
  camera: PerspectiveCamera,
  controls: OrbitControls,
  fallbackResolver?: () => CardinalSnapBasis | null
): CardinalSnapBasis | null;

/**
 * Phase 2: Atomic instant commit primitive. Sets position, cardinal up-vector,
 * updates matrices, and synchronizes OrbitControls.
 */
export function snapEditorViewToCardinal(
  face: CardinalFace,
  camera: PerspectiveCamera,
  controls: OrbitControls,
  resolvedTarget: Vector3,
  resolvedDistance: number
): SnapCardinalResult;
```

> **Refactor note:** the shipped P3B.1 primitive is
> `snapEditorViewToCardinal(face, camera, controls, fallbackResolver): boolean`
> with a private resolver. This two-phase split (exported basis resolution +
> resolved-basis commit) is the planned refactor target that the animated
> path in §6.2 consumes; it is a code change, not a description of shipped code.

### 6.2 `camera-motion.ts` (Pure Motion Sampler)

```ts
import type { Vector3 } from 'three';
import type { CameraEasing } from '../types/scene';

export interface CardinalSnapMotion {
  durationMs: number;
  sample: (progress: number) => {
    position: Vector3;
    target: Vector3;
    up: Vector3;
  };
}

/**
 * Pure cardinal snap motion sampler.
 * Evaluates great-circle eye direction slerp, distance lerp, and up-vector blend.
 */
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

---

## 7. Design Token Registry

```css
/* ==========================================================================
   Orientation Widget Tokens (tokens.css & Design-specs.md §8)
   ========================================================================== */

/* Shell & Container */
--editor-orientation-surface:        #0D1925;
--editor-orientation-hover:          #142230; /* Container hover background */
--editor-orientation-border:         #32485A;
--editor-orientation-radius:         6px;     /* Shell corner radius */

/* Face Lighting Palette */
--editor-orientation-face-lit:       #EAEEF2; /* Key-lit neutral face */
--editor-orientation-face-mid:       #D8DCE0; /* Mid-tone neutral face (QA baseline) */
--editor-orientation-face-shadow:    #C2C7CC; /* Shadow-tone neutral face */
--editor-orientation-face-hover:     rgba(13, 25, 37, 0.10); /* Dark-navy overlay for light faces */
--editor-orientation-face-pressed:   rgba(0, 0, 0, 0.20);
--editor-orientation-edge-solid:     #1E2C3A; /* Cube wireframe outline */

/* Canonical Gizmo Axis & State Tokens (tokens.css:56-62) */
--editor-gizmo-x:                    #F05252; /* World X Axis (Red) */
--editor-gizmo-y:                    #45C878; /* World Y Axis (Green) */
--editor-gizmo-z:                    #3B82F6; /* World Z Axis (Blue) */
--editor-gizmo-active:               #2F8CFF; /* Cardinal view active lock stroke */
--editor-gizmo-hover:                #55A1FF; /* Keyboard focus-visible stroke */

/* Typography & Sizing */
--editor-font:                       Inter, system-ui, -apple-system, sans-serif;
--editor-orientation-label:          #EDF3F8; /* Axis text fill (X, Y, Z) */
--editor-orientation-label-size:     11px;    /* Axis characters */
--editor-orientation-face-label-size: 8.5px;  /* Cube face names */
```