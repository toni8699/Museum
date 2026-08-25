# Museum Editor — UI Design System & Implementation Specification

**Status:** canonical UI implementation specification — ratified 2026-08-19;
reconciled 2026-08-23 by P9. Blue `#2F8CFF` is the sole target accent system.
**Scope:** technology, component stack, visual tokens, typography, iconography, panel sizing, interaction states, Scene/Camera × Plan/3D workspaces, Inspector, Asset Library, Outliner, Camera Timeline.
**Provenance:** governs the canonical concepts registered in
[`Design-png/README.md`](../../Design-png/README.md); executed by
[P3](../archive/plans/2026-08-18-P3-ui-overhaul.md).

This specification translates the approved product model and generated UI concepts into concrete implementation rules. The canonical product remains the explicit `Scene | Camera` × `Plan | 3D` domain/view system:

* Scene → Plan = author the museum spatially in 2D (Layout | Arrange)
* Scene → 3D = full scene-object authoring and new placement
* Camera → Plan = route things
* Camera → 3D = frame things

> **P10 amendment (2026-08-23):** Scene → Plan's local mode is the owner-aware
> **Arrange** surface — arrange movable objects already in the space (eligible
> Scene entities **and** Layout objects), each routed through its existing
> owner pipeline. `Staging` terminology elsewhere in this spec refers to the
> shipped pre-P10 state.

Camera Plan and Camera 3D share camera selection and the persistent Camera timeline. Scene does not mount the Camera timeline.

---

# 1. Technology stack

## Core application

Use:

```text
SvelteKit
Svelte 5
TypeScript — strict mode
Threlte
Three.js
```

Keep this stack. Do **not** replace Threlte/Three.js for the redesign.

Svelte 5 should own DOM UI, editor shell, state presentation, panels, Inspector, Timeline and Plan UI. Svelte 5 provides runes for reactive state and normal Svelte transitions for DOM state changes.
Recommended state split:

```text
Document state
├─ scene
├─ architecture
├─ cameras
├─ connections
├─ sequence
├─ framing
└─ undo/redo history

Editor/session state
├─ activeDomain       Scene | Camera
├─ activeView         Plan | 3D
├─ selection
├─ viewport state
├─ panel expansion
├─ timeline height
├─ timeline playhead
├─ active tool
└─ hover/transient gesture state
```

Do not put panel widths, current tool, timeline height or view navigation into saved museum JSON or undo history.

---

# 2. 3D stack

Use:

```text
@threlte/core
three
@threlte/extras
```

Use Threlte Extras where it already solves standard DCC behavior:

* `TransformControls`
* `OrbitControls`
* `Gizmo`
* `Grid`

Threlte's `TransformControls` specifically follows the transform interaction model used by DCC applications, while its OrbitControls/Gizmo utilities integrate directly with the Threlte canvas.
Do **not** replace editor-specific controls with generic library abstractions where product rules matter.

Custom logic should continue to own:

* selection
* camera nodes
* path anchors
* camera frustums
* look targets
* path visualization
* snapping rules
* one-gesture/one-undo behavior
* constrained scaling
* camera framing helpers

---

# 3. Plan rendering

Use:

```text
Svelte + SVG
```

Do not build Scene Plan or Camera Plan as a second Three.js viewport.

Recommended structure:

```text
PlanViewport
├─ SVG architectural geometry
├─ SVG furniture/context
├─ SVG dimensions
├─ SVG guides
├─ SVG selection layer
└─ optional CameraPlanOverlay
```

Both Scene Plan and Camera Plan consume the **same underlying Plan render model**.

Scene Plan may add eligible Scene footprint projection at render layer 6 (P2),
and its **Arrange** mode composes those footprints with existing Layout-object
Plan render identities into one owner-aware hit set at layers 5–6 (P10).
Camera Plan passes no Scene footprint projection and shows only its permitted
architectural/camera layers.

Camera Plan then adds a filtered overlay containing only:

* camera nodes
* unsequenced nodes
* connection curves
* selected connection
* interior path anchors

Camera Plan must not duplicate architectural geometry or maintain graph-layout coordinates separate from world coordinates.

Do not add D3, Fabric.js or Konva unless a measured limitation appears later. Native SVG gives enough control for the current architectural and graph interaction model.

---

# 4. DOM component primitives

Recommended:

```text
bits-ui
```

Use Bits UI only as **headless behavior**, not visual styling.

Good candidates:

* Tooltip
* Popover
* Dropdown Menu
* Context Menu
* Select
* Dialog
* Alert Dialog
* Command menu later

Bits UI provides unstyled/headless Svelte primitives, including accessible menus, popovers and dialogs, while allowing Museum Editor to retain its own visual language. Its floating components use Floating UI for positioning.
Do **not** adopt a full premade visual component kit.

The editor should not suddenly look like generic shadcn/SaaS software.

---

# 5. Icons

Use one icon family:

```text
lucide-svelte
```

Do not mix Heroicons, Font Awesome, Material Icons and Lucide.

Lucide provides a large consistent stroke-based icon set suitable for the compact professional-editor style used in the concepts.

Default icon treatment:

```text
size:          16px
compact size:  14px
large control: 18px
stroke-width:  1.75–2px
```

Icons inherit text color.

## Global shell

| Function         | Lucide icon    |
| ---------------- | -------------- |
| Undo             | `Undo2`        |
| Redo             | `Redo2`        |
| Settings         | `Settings`     |
| Project dropdown | `ChevronDown`  |
| Saved            | `CircleCheck`  |
| Unsaved          | `CircleDot`    |
| Search           | `Search`       |
| Filter           | `ListFilter`   |
| Overflow         | `Ellipsis`     |
| Collapse         | `ChevronDown`  |
| Expand           | `ChevronRight` |

**Correction from some generated mockups:** do not render `UNSAVED` in success green.

Use:

```text
Saved   → green
Unsaved → amber
Error   → red
```

That follows the semantic-color rules of the product spec.

## Main editing tools

| Tool       | Icon                           |
| ---------- | ------------------------------ |
| Select     | `MousePointer2`                |
| Move       | `Move`                         |
| Rotate     | `RotateCw`                     |
| Scale      | `Scaling`                      |
| Add Asset  | `PackagePlus` or `Box` + label |
| Add Camera | `Camera`                       |
| Connect    | `Waypoints`                    |
| Path       | `Spline`                       |
| Frame      | `Focus`                        |
| View       | `Eye`                          |
| Snap       | `Magnet`                       |
| Measure    | `Ruler`                        |

## Hierarchy / objects

| Function     | Icon           |
| ------------ | -------------- |
| Hierarchy    | `ListTree`     |
| Assets       | `PackageOpen`  |
| Object       | `Box`          |
| Group        | `Folder`       |
| Lights       | `Lightbulb`    |
| Camera       | `Camera`       |
| Visible      | `Eye`          |
| Hidden       | `EyeOff`       |
| Locked       | `Lock`         |
| Unlocked     | `Unlock`       |
| Duplicate    | `Copy`         |
| Delete       | `Trash2`       |
| Drag reorder | `GripVertical` |

## Architectural tools

| Tool    | Icon                                                     |
| ------- | -------------------------------------------------------- |
| Wall    | `BrickWall` where available; otherwise custom wall glyph |
| Room    | `Square`                                                 |
| Door    | `DoorOpen`                                               |
| Window  | custom window glyph if Lucide option is visually unclear |
| Opening | `PanelTopOpen` or custom aperture glyph                  |
| Measure | `Ruler`                                                  |

## Camera Timeline

| Lane / control | Icon           |
| -------------- | -------------- |
| Camera Path    | `Route`        |
| Shots          | `Clapperboard` |
| FOV            | `Aperture`     |
| Look At        | `Target`       |
| Roll           | `RotateCw`     |
| Play           | `Play`         |
| Pause          | `Pause`        |
| Stop           | `Square`       |
| Follow         | `Crosshair`    |
| Recenter       | `LocateFixed`  |
| Zoom in        | `ZoomIn`       |
| Zoom out       | `ZoomOut`      |
| Fit timeline   | `Maximize2`    |

## Do not use Lucide for these

Some editor concepts deserve custom graphics:

* Museum Editor brand mark
* orientation cube
* XYZ transform gizmo
* camera numbered node marker
* unsequenced green ring
* path anchor
* timeline keyframe diamond
* connection endpoint marker
* framing-envelope handles

These carry product semantics. They should not look like generic toolbar icons.

---

# 6. Typography

Use:

```text
Inter Variable
```

Fallback:

```css
font-family:
  Inter,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

Use one font family across the editor.

Do not introduce a display font.

## Type scale

| Usage              |      Size |  Weight |
| ------------------ | --------: | ------: |
| Product title      |      16px |     600 |
| Major panel title  |      14px |     600 |
| Toolbar/button     |      13px |     500 |
| Tree row           |      13px | 400–500 |
| Inspector section  |      13px |     600 |
| Inspector label    |      12px |     400 |
| Input value        | 12.5–13px |     400 |
| Secondary metadata |    11.5px |     400 |
| Status bar         | 11.5–12px |     400 |
| Timeline ruler     |      11px |     400 |

Use:

```css
font-variant-numeric: tabular-nums;
```

for:

* coordinates
* dimensions
* FOV
* durations
* timeline timecode
* percentages

Do not use monospace for normal numeric fields. Inter with tabular figures keeps the UI cleaner.

---

# 7. Core color system

The generated images do not provide exact CSS colors, so these become the normalized implementation tokens. All tokens use the `--editor-` prefix so the editor never collides with the host app or the `/museum` visitor.

## Dark shell

```css
--editor-bg-app:          #071019;
--editor-bg-panel:        #0A141F;
--editor-bg-panel-raised: #0D1925;
--editor-bg-control:      #0E1A26;
--editor-bg-hover:        #142230;
--editor-bg-selected:     #0C3766;

--editor-border-subtle:   #1A2936;
--editor-border-normal:   #243544;
--editor-border-strong:   #32485A;
```

Keep chrome slightly blue rather than neutral charcoal.

No large gradients.

No frosted-glass SaaS cards.

## Text

```css
--editor-text-primary:    #EDF3F8;
--editor-text-secondary:  #A7B3BF;
--editor-text-muted:      #71808E;
--editor-text-disabled:   #52606C;
```

## Primary blue

```css
--editor-accent:          #2F8CFF;
--editor-accent-hover:    #55A1FF;
--editor-accent-pressed:  #1976DF;
--editor-accent-soft:     rgba(47, 140, 255, 0.16);
--editor-accent-border:   rgba(47, 140, 255, 0.62);
```

Blue means:

* selected
* active tool
* active workspace/view
* selected object
* selected camera
* selected timeline item
* handles
* focus ring
* authored camera paths

Do not make every clickable control blue.

## Semantic colors

```css
--editor-success:         #31C985;
--editor-success-soft:    rgba(49, 201, 133, 0.14);

--editor-warning:         #D9A441;
--editor-warning-soft:    rgba(217, 164, 65, 0.14);

--editor-danger:          #EF626C;
--editor-danger-soft:     rgba(239, 98, 108, 0.14);
```

Use green for:

* saved state
* valid/success state
* unsequenced camera distinction

Use amber for:

* unsaved
* warnings
* framing envelope
* incomplete-route attention

Use red only for:

* destructive actions
* errors
* invalid state

# 8. Transform-axis and Scene 3D overlay colors

Reserve strong RGB colors for spatial axes. These values are shared by the
Scene 3D transform gizmo, the upper-right orientation box, axis labels, and
axis-specific Inspector inputs:

```css
--editor-axis-x: #F05252; /* X — red */
--editor-axis-y: #45C878; /* Y — green */
--editor-axis-z: #3B82F6; /* Z — blue */
```

Use the same values everywhere an axis is represented. Do not use these exact
saturated colors as general application decoration.

## Scene 3D overlay aliases

The PNGs use a quiet dark viewport with blue selection feedback and bright RGB
axis accents. Keep those semantics in named tokens rather than hardcoding
colors in SVG, DOM, or Three.js materials:

```css
--editor-gizmo-x:                 #F05252;
--editor-gizmo-y:                 #45C878;
--editor-gizmo-z:                 #3B82F6;
--editor-gizmo-active:            #2F8CFF;
--editor-gizmo-hover:             #55A1FF;

--editor-selection-outline:       #2F8CFF;
--editor-selection-outline-hover: #55A1FF;
--editor-selection-fill:          rgba(47, 140, 255, 0.10);
--editor-selection-handle:        #EDF3F8;
--editor-outline-muted:           #92908A;
--editor-layout-box:              #92908A;
--editor-layout-box-hover:        #77766F;

--editor-orientation-surface:     #0D1925;
--editor-orientation-hover:       #142230;
--editor-orientation-border:      #32485A;
--editor-orientation-label:       #EDF3F8;
--editor-orientation-face-lit:    #EAEEF2;
--editor-orientation-face-mid:    #D8DCE0;
--editor-orientation-face-shadow: #C2C7CC;
--editor-orientation-face-hover:  rgba(13, 25, 37, 0.10);
--editor-orientation-face-pressed: rgba(0, 0, 0, 0.20);
--editor-orientation-edge-solid:  #1E2C3A;
```

`--editor-selection-outline` is the primary Scene 3D object outline and
`--editor-layout-box` is reserved for passive/context geometry. The aliases
must resolve to the same canonical palette in §37. P3 may change their visual
presentation and state styling; P3 must not change transform, selection, or
camera semantics.

## Orientation-box sizing tokens

The custom orientation graphic is a compact viewport utility, not a panel:

```css
--editor-orientation-size:        88px;
--editor-orientation-inset-top:   16px;
--editor-orientation-inset-right: 16px;
--editor-orientation-label-size:  11px;
--editor-orientation-radius:       6px;
--editor-orientation-face-label-size: 8.5px;
```

These are reference values for matching the canonical Scene 3D sketches in
[`Design-png/README.md`](../../Design-png/README.md); visual QA may tune
sub-pixel geometry without changing the top-right placement or token mapping.
The SVG uses one 88 × 88 coordinate model; its safe inset is encoded in
geometry, never CSS padding.

---

# 9. Plan colors

Scene Plan and Camera Plan use a deliberately bright drafting surface against the dark shell.

```css
--editor-plan-bg:           #F5F3EE;
--editor-plan-grid-major:   #D2CEC5;
--editor-plan-grid-minor:   #E4E0D9;
--editor-plan-wall:         #625F59;
--editor-plan-wall-fill:    #D5D1C8;
--editor-plan-object:       #B7B2A8;
--editor-plan-label:        #292D31;
--editor-plan-muted:        #77766F;
--editor-plan-measure:      #2F8CFF;
--editor-plan-selection:    #2F8CFF;
--editor-plan-readonly:     #92908A;
```

Context objects should render around **35–55% visual strength** relative to authored architecture.

Camera Plan backdrop should be slightly more subdued than Scene Plan because camera topology is the foreground information. P3B centralizes this variation and removes hardcoded third-color selection values.

---

# 10. Camera visualization colors

## Guided node

```text
fill: blue
border: lighter blue
number: white
```

Size:

```text
normal node: 24px
selected node: 28px
```

## Unsequenced camera

```text
transparent/dark center
2px green ring
green camera glyph or small status dot
no sequence number
```

This distinction is mandatory.

(Terminology renamed 2026-08-21 per [`Camera-flow-specs.md`](./Camera-flow-specs.md)
§2 — the visual state is unchanged.)

## Connections

Normal:

```text
2px blue at ~55–65% opacity
```

Hover:

```text
2.5px blue
```

Selected:

```text
3px blue
subtle outer highlight
```

No arrowheads in Camera Plan because the connection represents undirected topology.

Camera Timeline **may** use direction because it represents ordered playback rather than topology.

---

# 11. Timeline colors

Keep chrome neutral.

Use lane colors only inside data visualization.

```css
--editor-timeline-path:       #2F8CFF;
--editor-timeline-fov:        #4F9EFF;
--editor-timeline-look:       #8C7CF3;
--editor-timeline-roll:       #C9944B;
--editor-timeline-envelope:   #D9A441;
--editor-timeline-free:       #31C985;
--editor-timeline-playhead:   #2F8CFF;
```

Shots use actual muted thumbnails rather than another bright lane color.

Roll should remain visually quiet when empty.

---

# 12. Spacing system

Base spacing unit:

```text
4px
```

Allowed spacing:

```text
4
8
12
16
20
24
32
```

Most editor controls use:

```text
horizontal padding: 8–10px
vertical padding:   6–8px
```

Avoid 20–30px card padding common in dashboards.

This is a dense authoring tool.

---

# 13. Corner radius

Use modest radii:

```text
small controls:       4px
buttons/inputs:       5px
segmented controls:   6px
floating toolbar:     7px
popover/menu:         7px
large panel:          0px
```

Panels themselves should generally meet edge-to-edge.

Do not turn every Inspector section into a rounded card.

---

# 14. Borders and shadows

Panel separation:

```text
1px solid --editor-border-subtle
```

Inputs:

```text
1px solid --editor-border-normal
```

Focus:

```text
1px accent border
+
0 0 0 2px rgba(47,140,255,.18)
```

Floating contextual toolbar:

```css
box-shadow:
  0 8px 24px rgba(0, 0, 0, 0.38);
```

Menus/popovers use a smaller equivalent.

Do not put drop shadows between permanent side panels.

---

# 15. Shell dimensions

Recommended desktop reference:

```text
App bar:            56px

Left sidebar:       300px
minimum:            240px
maximum:            420px

Right Inspector:    320px
minimum:            280px
maximum:            420px

Status bar:         32px

Floating toolbar:   38–40px high
```

Shell:

```text
┌──────────────── App Bar ──────────────────┐
│ left │          viewport          │ right │
│      │                            │       │
├──────┴──── Camera Timeline ───────┴───────┤
│                Status                     │
└───────────────────────────────────────────┘
```

Top = actions.
Left = structure/resources.
Center = world.
Right = properties.
Bottom = temporal Camera authoring.

---

# 16. Camera Timeline dimensions

Canonical dimensions:

```text
default expanded: 288px
expanded range:   240–300px
collapsed:         48px
```

Include an approximately:

```text
6px hit area
```

for the horizontal resize boundary, even if the visible line is only 1px.

Remember last expanded height for the session.

Timeline remains mounted when switching:

```text
Camera Plan ⇄ Camera 3D
```

and disappears only when switching out of Camera domain.

The generated expanded Camera design shows the intended five-lane structure, transition drill-down, playhead and transport model.

---

# 17. Buttons

## Standard toolbar button

```text
height:       32px
padding-x:     9px
icon:         16px
gap:           6px
font:         13px / 500
radius:        5px
```

Default:

```text
transparent background
secondary text
```

Hover:

```text
--editor-bg-hover
primary text
```

Selected:

```text
--editor-accent-soft
accent border
white/light text
```

Pressed:

```text
slightly darker selected background
```

Disabled:

```text
45% opacity
no hover treatment
```

---

# 18. Segmented domain/view controls

Keep these as text-first segmented controls:

```text
[ Scene | Camera ]

[ Plan | 3D ]
```

Do not add icons here.

The labels are already extremely short and semantically important.

Sizing:

```text
height: 34px
min width/item: 74px
font: 13px / 500
```

Selected:

```text
dark blue fill
1px blue border
white text
```

Always preserve:

```text
Plan | 3D
```

Never swap physical order.

---

# 19. Inspector

Inspector should look like one continuous property editor, not stack of SaaS cards.

Structure:

```text
Inspector
Selected Item Header

▾ Transform
▾ Snap Settings
▾ Placement
▾ Asset
▾ Material
▾ Visibility
```

Section header:

```text
height: 34–38px
font: 13px / 600
top border
```

Inspector fields:

```text
height: 30px
radius: 4px
font: 12.5–13px
```

XYZ fields appear in one row where width permits.

Axis label appears inside field:

```text
X   2.245
Y   0.000
Z   1.800
```

X/Y/Z labels use axis colors.

Numeric units should appear in section label or field suffix rather than repeated excessively.

---

# 20. Tree / Outliner

Tree rows:

```text
height: 28px
font: 13px
icon: 14–16px
indent step: 16px
```

Hover:

```text
subtle neutral row
```

Selected:

```text
accent-soft fill
1px left or full subtle blue highlight
```

Keep visibility and overflow actions right-aligned.

Show actions mostly on:

```text
hover
selection
```

rather than permanently increasing visual noise.

---

# 21. Asset Library

Cards are compact.

Suggested:

```text
2–3 columns depending panel width
thumbnail ratio: 1:1
gap: 8px
radius: 6px
```

Each card contains:

```text
thumbnail
asset name
status dot + status
overflow
```

Status:

```text
Approved    green
Testing     amber
Placeholder violet/muted
Rejected    red
```

Do not put large colored status backgrounds behind entire cards.

---

# 22. Contextual viewport toolbar

Toolbar floats near top center/left of viewport.

Scene → Plan:

```text
Layout | Arrange
Select
Wall
Room
Door
Window
Opening
Measure
…
```

Scene → 3D:

```text
Select
Move
Rotate
Scale
Add Asset
Local/World
Snap
…
```

Camera → Plan:

```text
Select
Add Camera
Connect
View
…
```

Camera → 3D:

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

These follow the canonical workspace separation.

Do not expose Move/Path/Frame permanently in Camera Plan.

---

# 23. Camera Timeline header

Use a compact scope-driven header (P11):

```text
[Edge · Camera B → Camera C] [↔] [Repeat] |◀ [▶/Ⅱ] 1.2 / 4.2s [Observer ↔ Through Camera] [Follow] [Recenter]
[Sequence]                         |◀ [▶/Ⅱ] 7.8 / 80.0s [Observer ↔ Through Camera] [Follow] [Recenter]
[Camera · Camera C · Static]       [Observer ↔ Through Camera]
```

The single transport control means Play → Pause → Resume → Replay. Follow and
Recenter are Observer-only icon controls; Stop is internal lifecycle behavior,
not normal timeline chrome. Scope is derived from canonical Camera selection
for Camera/Edge, while Sequence remains an explicit whole-route mode. Exact
pixel treatment remains a visual implementation concern after P11 semantics
are accepted.

Transport icons can be icon-only with tooltips except:

```text
Follow
Recenter
```

These benefit from labels because their meanings are less universally obvious.

Use tabular numerals for time.

---

# 24. Timeline lane sizing

Suggested:

```text
lane label column: 120px
ruler/header:       28px

Camera Path:        44px
Shots:              48px
FOV:                34px
Look At:            34px
Roll:               32px
```

Five lanes are a presentational projection of the current two-lane backing
model (`Guided Route` + `Camera Framing`). `Camera Path` projects edges/timing;
`FOV` and `Look At` project the combined view key; `Shots` derives from node
labels/holds; `Roll` remains quiet `0°`. P3 adds no new store entities. Visual
truth: `Design-png/Camera/camera-timeline-expanded.png`.

Selected-transition drill-down may consume the remaining expanded area below those lanes.

Keep timeline information dense.

Do not make each lane a large card.

---

# 25. Timeline interaction graphics

Use SVG for:

* ruler ticks
* playhead
* curves
* keyframes
* framing envelope
* branch preview
* selection overlays

Use DOM/Svelte elements for:

* labels
* buttons
* menus
* input fields
* tooltips
* shot thumbnails

This gives precise graphics without turning the whole timeline into canvas-rendered UI.

---

# 26. Keyframe shapes

Do not use one shape for everything.

Recommended:

```text
Camera stop        numbered circle
Path anchor        circular handle
FOV key            small circle
Look At key        diamond
Roll key           small diamond
Envelope handle    square
Playhead            vertical line + top triangle
```

Selected key:

```text
fill accent
1–2px light outline
```

---

# 27. Camera Plan interaction rules

The architectural Plan is:

```text
visible
hit-testable
not selectable
not editable
```

Camera Plan may:

* place cameras using floor hit testing
* select camera nodes
* select connections
* drag nodes
* drag path anchors

Plan edits use world **X/Z** coordinates:

```text
screen X  ← world X
screen Y  ← world Z
```

The SVG viewport's `x/y` are pixel-space axes, not world-axis labels. Plan
preserves world **Y** (height):

```text
Y
```

Never show in Camera Plan:

* frustum
* look target
* heading arrow
* FOV editing
* framing breakpoint
* envelope
* orientation controls

This division is one of the core product rules.

---

# 28. Camera 3D graphics

Camera 3D may show:

```text
numbered camera marker
camera glyph
XYZ transform gizmo
path spline
path anchor
frustum
target marker
look-at line
framing helpers
```

Keep overlays crisp and thin.

Avoid giant glowing paths.

Use:

```text
path: 2px equivalent screen width
selected path: ~3px
target line: dashed, low opacity
frustum: 8–15% blue fill
```

The generated Camera 3D concepts demonstrate this hierarchy: rich museum remains dominant while camera graph and framing helpers remain readable overlays.

---

# 28A. Scene 3D gizmo, selection outlines, and orientation box

`scene-3d-object-selection.png`, `scene-3d-layout-selection.png`, and
`scene-3d-assets.png` are the canonical Scene → 3D references registered in
[`Design-png/README.md`](../../Design-png/README.md). They define composition,
visual emphasis, and overlay treatment; the existing Scene selection and
transform contracts remain behaviorally authoritative.

> **Amendment 2026-08-23 — complete XYZ gizmo:**
> `scene-3d-object-selection-xyz-gizmo.png` supersedes only the transform-gizmo
> rendering in `scene-3d-object-selection.png`. Red X, green Y, and blue Z
> arrows must all be visible and meet at the selected pivot. The original PNG
> remains registered for its base composition; no other PNG requires
> regeneration for this correction.

## Selected-object transform and scale gizmo

The selected-object gizmo is an authoring overlay owned by **Scene → 3D**:

* show it only for the current selected Scene object and the active
  Select/Move/Rotate/Scale context;
* keep it aligned to the selected object's rotation-aware bounds and centered
  on its active pivot;
* use the RGB axis mapping from §8 for X/Y/Z handles and the primary blue
  tokens for active/hover emphasis;
* present independent X/Y/Z scale handles and a visually distinct uniform
  center affordance when Scale is active; the presentation must reflect the
  current uniform/independent scale state;
* keep the gizmo visually above the object outline but below menus, Inspector
  chrome, and the separate orientation utility.

P3 owns the cosmetic match: handle proportions, line weight, opacity, axis
colors, active/hover treatment, and scale-chain presentation. P3 does **not**
change local/world space, snapping, pointer capture, independent versus
uniform scale semantics, selected-object identity, or one-gesture/one-history
behavior. Plan never gains this 3D gizmo or a Plan scaling gesture.

## Selection and object/layout boxes

Selection feedback is layered and must not be confused with hover or context:

| State | Scene 3D treatment | Plan/layout treatment |
|---|---|---|
| Passive/context | no transform gizmo; no selection color | muted or dashed `--editor-layout-box` / `--editor-plan-readonly` |
| Hover | thin `--editor-selection-outline-hover`; no gizmo and no selection fill | stronger context stroke; bridge affordance only where the active mode allows it |
| Selected | rotation-aware `--editor-selection-outline`, optional light inner/bounds line, and transform gizmo | `--editor-plan-selection` stroke and only the handles allowed by Layout or Arrange |
| Multi-selected | same blue outline language with a clear group/bounds treatment | shared selection treatment without activating Scene 3D controls |

The object outline is an OBB/rotation-aware visual boundary, not a second
selection store. Hover must never look selected, and the orientation box must
never select an object. Layout boxes and passive Scene Plan footprints remain
read-only outside their owning mode. Layout boxes should follow the white/light
aesthetic shown in `scene-3d-layout-selection.png`, with restrained neutral
borders/fills rather than amber or dark-neutral emphasis. P3 owns color, stroke,
dash, opacity, layering, and spacing reconciliation; existing selection priority
and selection continuity remain frozen.

## Upper-right XYZ orientation box

The orientation box is a custom SVG/DOM viewport utility, not a Lucide icon,
not the selected-object gizmo, and not a local/world space switch. Its shared
orientation tokens must be defined in the editor token file before styling:

* place it in the **upper-right corner of the Scene → 3D viewport**, with the
  §8 inset/size tokens and no bottom-left fallback;
* render a compact isometric cube/axis construction with visible X/Y/Z labels,
  crisp axis edges, and the canonical red/green/blue mapping;
* use the quiet dark orientation surface and border tokens so the graphic reads
  over a rich museum scene without becoming a second toolbar;
* keep the widget visually separate from TransformControls, object outlines,
  Inspector chrome, and viewport edge controls;
* style hover, pressed, disabled, and focus-visible states with the shared
  editor tokens even while the P3 implementation remains non-interactive.

P3 owns the graphic, top-right placement, dimensions, spacing, axis colors,
label treatment, and state styling. **P3B** enables the input contract: the
camera-following orientation state, click/keyboard activation of visible axes
or faces, canonical camera snap, isolated hit testing, and no-drag behavior.
P3B must not select an object, mutate `SceneDocument`, create history, or
change the current selection when the box is activated. The widget is visible
and interactive only in Scene → 3D; it is absent from both Scene Plan modes,
Camera Plan, and Camera 3D.

---

# 29. Selection hierarchy

Selection should be obvious without overpowering scene content. The hierarchy
below is a visual contract; it does not create a second selection model.

3D object:

```text
hover:    thin --editor-selection-outline-hover, no gizmo
selected: thin --editor-selection-outline
          optional light/blue bounding box
          active transform gizmo
```

Plan object:

```text
passive/context: dashed --editor-layout-box or --editor-plan-readonly
selected:        --editor-plan-selection stroke
                 small blue/white handles allowed by the active mode
```

In **Arrange**, the same selection language applies to **both owners** (P10):
selected Scene footprints and selected Layout objects both use
`--editor-plan-selection`, with only the handles the active owner's mode
allows. The interim amber Layout-object selected treatment is a recorded
deviation reconciled in P3 — no orange-vs-blue ownership coloring.

Tree:

```text
--editor-accent-soft row
```

Inspector:

```text
selected object name/header
```

Timeline:

```text
matching blue selection
```

Hover must remain visually distinct from selection. A selected Scene 3D
object may show its gizmo and outline together; a hovered object never gains
transform handles. Scene Plan Layout may show passive scene footprints but
cannot activate Scene selection, while Arrange may show the selected
footprint/object and its owner-aware Plan rotation handle. P3 owns these
colors, strokes, dashes, opacity, and spacing; P2/P10/P3B own the interaction
and authority contracts.

Same Camera selection must appear consistently in:

```text
Sidebar
Plan/3D viewport
Inspector
Timeline
```

---

# 30. Hover/focus behavior

Mouse hover:

```text
100–120ms background/color transition
```

Selection changes:

```text
120–160ms
```

Workspace transitions:

```text
instant — no fade on view/domain/sidebar/timeline swaps
```

Camera timeline entering / leaving:

```text
instant — appearance/disappearance without height/opacity animation; expansion state persists verbatim
```

Do not animate the full shell moving around. This applies to every shell swap.

Honor:

```css
@media (prefers-reduced-motion: reduce)
```

and disable the remaining hover/selection transitions. Workspace swaps are
already instant under the canonical motion rules.

---

# 31. Resize behavior

Use native Pointer Events with pointer capture.

Do not add a panel-resizing framework unless needed.

Resizable:

* left sidebar
* right Inspector
* Camera Timeline

Use CSS Grid variables:

```css
--editor-left-width
--editor-right-width
--editor-timeline-height
```

Example shell:

```css
grid-template-columns:
  var(--editor-left-width)
  minmax(0, 1fr)
  var(--editor-right-width);
```

Do not trigger undo history when resizing UI panels.

---

# 32. Drag/drop behavior

Use custom editor gestures for:

* objects
* camera nodes
* path anchors
* timeline keys
* timeline transitions

Reason:

```text
pointer down
→ gesture
→ live preview
→ pointer up
→ one committed command
→ one undo entry
```

A generic drag library should not dictate editor-history semantics.

Sidebar sequence reorder may use the same shared gesture infrastructure.

---

# 33. Tooltips

Use tooltip for icon-only buttons.

Delay:

```text
~450ms initial
~100ms between neighboring toolbar controls
```

Tooltip example:

```text
Move
W
```

Where keyboard shortcut exists, show it right aligned.

Do not tooltip obvious labeled controls.

---

# 34. Keyboard shortcut presentation

Use small dark key caps:

```text
W
E
R
Del
Esc
Shift
Alt
```

Suggested standard mappings where compatible with current behavior:

```text
W = Move
E = Rotate
R = Scale
Delete/Backspace = Delete
Esc = Cancel current gesture
```

Do not change existing shortcuts solely to imitate Blender.

---

# 35. Status bar

Keep bottom status bar thin and quiet.

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

Do not put primary actions here.

---

# 36. Component architecture

Recommended UI-level structure:

```text
EditorApp
├─ AppBar
│
├─ WorkspaceFrame
│  ├─ LeftPanel
│  │  ├─ SceneSidebar
│  │  └─ CameraSidebar
│  │
│  ├─ WorkspaceViewport
│  │  ├─ ScenePlanViewport
│  │  ├─ Scene3DViewport
│  │  ├─ CameraPlanViewport
│  │  └─ Camera3DViewport
│  │
│  └─ Inspector
│
├─ CameraTimelineDock
│  ├─ TimelineHeader
│  ├─ TimelineRuler
│  ├─ CameraPathLane
│  ├─ ShotsLane
│  ├─ FovLane
│  ├─ LookAtLane
│  ├─ RollLane
│  └─ TransitionDetail
│
└─ StatusBar
```

Do not build four unrelated application shells.

The frame stays mounted. Workspace content changes.

---

# 37. CSS token architecture

Create one design-token file rather than repeating values:

```text
src/lib/editor/styles/
├─ tokens.css
├─ editor-shell.css
├─ controls.css
├─ inspector.css
├─ timeline.css
└─ plan.css
```

Example:

```css
:root {
  --editor-bg-app:          #071019;
  --editor-bg-panel:        #0A141F;
  --editor-bg-panel-raised: #0D1925;
  --editor-bg-control:      #0E1A26;
  --editor-bg-hover:        #142230;
  --editor-bg-selected:     #0C3766;

  --editor-border-subtle:   #1A2936;
  --editor-border-normal:   #243544;
  --editor-border-strong:   #32485A;

  --editor-text-primary:    #EDF3F8;
  --editor-text-secondary:  #A7B3BF;
  --editor-text-muted:      #71808E;
  --editor-text-disabled:   #52606C;

  --editor-accent:          #2F8CFF;
  --editor-accent-hover:    #55A1FF;
  --editor-accent-pressed:  #1976DF;

  --editor-axis-x:          #F05252;
  --editor-axis-y:          #45C878;
  --editor-axis-z:          #3B82F6;
  --editor-gizmo-active:    #2F8CFF;
  --editor-gizmo-hover:     #55A1FF;

  --editor-selection-outline:       #2F8CFF;
  --editor-selection-outline-hover: #55A1FF;
  --editor-selection-fill:          rgba(47, 140, 255, 0.10);
  --editor-selection-handle:        #EDF3F8;
  --editor-outline-muted:           #92908A;
  --editor-layout-box:              #92908A;
  --editor-layout-box-hover:        #77766F;

  --editor-orientation-surface:     #0D1925;
  --editor-orientation-hover:       #142230;
  --editor-orientation-border:      #32485A;
  --editor-orientation-label:       #EDF3F8;
  --editor-orientation-face-lit:    #EAEEF2;
  --editor-orientation-face-mid:    #D8DCE0;
  --editor-orientation-face-shadow: #C2C7CC;
  --editor-orientation-face-hover:  rgba(13, 25, 37, 0.10);
  --editor-orientation-face-pressed: rgba(0, 0, 0, 0.20);
  --editor-orientation-edge-solid:  #1E2C3A;
  --editor-orientation-size:        88px;
  --editor-orientation-inset-top:   16px;
  --editor-orientation-inset-right: 16px;
  --editor-orientation-radius:       6px;
  --editor-orientation-face-label-size: 8.5px;

  --editor-success:         #31C985;
  --editor-warning:         #D9A441;
  --editor-danger:          #EF626C;

  --editor-radius-sm: 4px;
  --editor-radius-md: 5px;
  --editor-radius-lg: 7px;

  --editor-appbar-height:    56px;
  --editor-status-height:    32px;
  --editor-left-width:       300px;
  --editor-right-width:      320px;
  --editor-timeline-height:  288px;
  --editor-timeline-collapsed: 48px;
}
```

Use component-scoped styles for layout details but use tokens for all shared visual decisions.

---

# 38. Libraries intentionally not required

Do **not** add these just to reproduce the mockups:

```text
Tailwind
D3
Konva
Fabric.js
a chart library
a timeline library
a generic node-graph library
a second icon library
a heavy animation framework
a full UI theme/component kit
```

The product is unusual enough that its important surfaces — Plan, camera graph, camera timeline and 3D authoring controls — should remain purpose-built.

Use libraries for commodity behavior.

Own the product-specific interaction model.

---

# 39. Final visual target

The UI should feel closer to:

```text
professional DCC / spatial editor
```

than:

```text
admin dashboard
web SaaS
video player
node graph editor
```

Visual priorities:

1. **world/content gets most space**
2. **controls stay dense**
3. **selection blue stays consistent**
4. **dark chrome recedes**
5. **Plan is intentionally bright**
6. **3D is rich and spatial**
7. **Camera Timeline feels like first-class editor infrastructure**
8. **properties use compact Inspector grammar**
9. **color communicates state, not decoration**
10. **product-specific graphics beat generic icons where semantics matter**

This preserves the central design rule from the canonical specification: the interface must communicate the actual product model truthfully — no arrows on undirected Camera Plan connections, no fake loop state, no duplicate spatial models, and no Camera framing controls leaking into Plan.
