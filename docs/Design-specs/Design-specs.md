# Museum Editor — UI Design System & Implementation Specification

**Status:** proposed canonical UI implementation specification
**Scope:** technology, component stack, visual tokens, typography, iconography, panel sizing, interaction states, Scene/Camera × Plan/3D workspaces, Inspector, Asset Library, Outliner, Camera Timeline.

This specification translates the approved product model and generated UI concepts into concrete implementation rules. The canonical product remains a domain × view system:

* Scene → Plan = build space
* Scene → 3D = place things
* Camera → Plan = route things
* Camera → 3D = frame things

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

Camera Plan then adds a filtered overlay containing only:

* camera nodes
* free-camera nodes
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
* free-camera green ring
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

The generated images do not provide exact CSS colors, so these become the normalized implementation tokens.

## Dark shell

```css
--bg-app:          #071019;
--bg-panel:        #0A141F;
--bg-panel-raised: #0D1925;
--bg-control:      #0E1A26;
--bg-hover:        #142230;
--bg-selected:     #0C3766;

--border-subtle:   #1A2936;
--border-normal:   #243544;
--border-strong:   #32485A;
```

Keep chrome slightly blue rather than neutral charcoal.

No large gradients.

No frosted-glass SaaS cards.

## Text

```css
--text-primary:    #EDF3F8;
--text-secondary:  #A7B3BF;
--text-muted:      #71808E;
--text-disabled:   #52606C;
```

## Primary blue

```css
--accent:          #2F8CFF;
--accent-hover:    #55A1FF;
--accent-pressed:  #1976DF;
--accent-soft:     rgba(47, 140, 255, 0.16);
--accent-border:   rgba(47, 140, 255, 0.62);
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
--success:         #31C985;
--success-soft:    rgba(49, 201, 133, 0.14);

--warning:         #D9A441;
--warning-soft:    rgba(217, 164, 65, 0.14);

--danger:          #EF626C;
--danger-soft:     rgba(239, 98, 108, 0.14);
```

Use green for:

* saved state
* valid/success state
* free camera distinction

Use amber for:

* unsaved
* warnings
* framing envelope
* incomplete-route attention

Use red only for:

* destructive actions
* errors
* invalid state

---

# 8. Transform-axis colors

Reserve strong RGB colors for spatial axes:

```css
--axis-x: #F05252;
--axis-y: #45C878;
--axis-z: #3B82F6;
```

Use them in:

* transform gizmos
* X/Y/Z labels
* orientation cube
* axis-specific Inspector inputs

Do not use these exact saturated colors as general application decoration.

---

# 9. Plan colors

Scene Plan and Camera Plan use a deliberately bright drafting surface against the dark shell.

```css
--plan-bg:           #F5F3EE;
--plan-grid-major:   #D2CEC5;
--plan-grid-minor:   #E4E0D9;
--plan-wall:         #625F59;
--plan-wall-fill:    #D5D1C8;
--plan-object:       #B7B2A8;
--plan-label:        #292D31;
--plan-muted:        #77766F;
--plan-measure:      #2F8CFF;
--plan-selection:    #2F8CFF;
--plan-readonly:     #92908A;
```

Context objects should render around **35–55% visual strength** relative to authored architecture.

Camera Plan backdrop should be slightly more subdued than Scene Plan because camera topology is the foreground information.

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

## Free camera

```text
transparent/dark center
2px green ring
green camera glyph or small status dot
no sequence number
```

This distinction is mandatory.

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
--timeline-path:       #2F8CFF;
--timeline-fov:        #4F9EFF;
--timeline-look:       #8C7CF3;
--timeline-roll:       #C9944B;
--timeline-envelope:   #D9A441;
--timeline-free:       #31C985;
--timeline-playhead:   #2F8CFF;
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
1px solid --border-subtle
```

Inputs:

```text
1px solid --border-normal
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

Status bar:         36px

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

For the newest expanded timeline concept:

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
--bg-hover
primary text
```

Selected:

```text
--accent-soft
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

Use:

```text
Timeline

[ Main Visitor Tour ▾ ]

[Play] [Pause]
[Follow]
[Recenter]
[Stop]

Snap [0.25s ▾]

00:07.8 / 00:12.5

[-] [+] [Fit]

Loops via: 4 → 1
```

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
FOV:                36px
Look At:            36px
Roll:               32px
```

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
* detour preview
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

Plan edits:

```text
X
Z
```

Plan preserves:

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

# 29. Selection hierarchy

Selection should be obvious without overpowering scene content.

3D object:

```text
thin blue outline
optional white/blue bounding box
transform gizmo
```

Plan object:

```text
blue stroke
small blue/white handles
```

Tree:

```text
blue-soft row
```

Inspector:

```text
selected object name/header
```

Timeline:

```text
matching blue selection
```

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
180–220ms
```

Camera timeline entering:

```text
height + opacity
```

Camera timeline leaving:

```text
height + opacity
```

Do not animate the full shell moving around.

Honor:

```css
@media (prefers-reduced-motion: reduce)
```

and reduce workspace animation to near-instant state changes. This matches the canonical motion rules.

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
--left-panel-width
--right-panel-width
--timeline-height
```

Example shell:

```css
grid-template-columns:
  var(--left-panel-width)
  minmax(0, 1fr)
  var(--right-panel-width);
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
  --editor-bg: #071019;
  --editor-panel: #0A141F;
  --editor-border: #1A2936;

  --editor-text: #EDF3F8;
  --editor-text-secondary: #A7B3BF;

  --editor-accent: #2F8CFF;
  --editor-success: #31C985;
  --editor-warning: #D9A441;
  --editor-danger: #EF626C;

  --editor-radius-sm: 4px;
  --editor-radius-md: 6px;

  --editor-appbar-height: 56px;
  --editor-status-height: 36px;

  --editor-left-width: 300px;
  --editor-right-width: 320px;
  --editor-timeline-height: 288px;
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
