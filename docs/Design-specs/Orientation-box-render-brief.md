# Design brief — Scene 3D orientation box: camera-projected render & snap motion

**Audience:** independent designer, working from this brief + the two reference
sketches only. **Owner:** Museum editor (P3B.2/P3B.3). **Date:** 2026-08-24.
**Deliverable:** design sketches — a render-state sheet and a motion storyboard.
No code.

## 1. What this widget is

The Museum editor is a dark-shell desktop app with a 3D viewport ("Scene 3D").
In the viewport's **upper-right corner** sits a small **orientation box**: an
88 × 88 px tile showing the world axes as a cube. Clicking a face or an axis
arrow **snaps the review camera** to that cardinal side (top/bottom/left/right/
front/back). The widget is presentation-only — it never selects, edits, or
navigates the scene; it only re-aims the viewport camera.

Product references (in repo root `Design-png/`):

- `Scene/scene-3d-assets.png` — the widget in situ, upper-right of Scene 3D.
- `x-y-z-box.png` — the six-state sheet of the cube construction.

## 2. What already exists (baseline to improve)

A static isometric SVG cube: three solid faces + three dashed "ghost" faces,
double-ended axis lines drawn through the cube body, X/Y/Z letter labels, and
a highlight on the face nearest the current camera. **Approved gaps to design
away:** the cube does not rotate with the camera; faces lack their names
(TOP/FRONT/RIGHT…); axes don't match the sketch's outward-from-corner arrows;
the cube under-fills its tile.

## 3. The two contract changes the sketches must express

1. **Camera-projected render.** The cube is no longer a fixed drawing: it
   rotates live with the viewport camera, like a view-cube. The three faces
   nearest the camera render solid **with their names** (TOP, BOTTOM, LEFT,
   RIGHT, FRONT, BACK — mapped to world +Y, −Y, −X, +X, +Z, −Z); the three far
   faces render as dashed ghosts (the dashed state in `x-y-z-box.png`). At the
   default editor pose the visible faces are exactly TOP / FRONT / RIGHT, as in
   the sketches.
2. **Animated snap.** Clicking a face/arrow animates the viewport camera to the
   matching cardinal view over ≈320 ms, ease-out. The cube keeps rotating live
   during the flight (it derives from the camera every frame). The landing is
   exact: the eye ends directly on the chosen axis at the unchanged distance,
   looking at the same target.

## 4. Sketch deliverables

1. **Render-state sheet** (same format as `x-y-z-box.png`): default, hover on a
   solid face, pressed, active/highlighted (camera already at that face),
   focus-visible (keyboard), disabled (during camera preview), each shown at
   **three camera poses** — default oblique, straight top-down, near side-on —
   to prove the projection holds at extremes.
2. **Face-label treatment:** typography, weight, and contrast for labels over
   solid faces vs dashed ghosts; whether ghost faces carry labels (recommend:
   no).
3. **Axis arrows:** outward from cube corners per the sketch (Y up, X right,
   Z left), arrowhead shape, letter placement beyond the tips, behavior when an
   axis points nearly at the camera (foreshortened).
4. **Motion storyboard:** 4–6 frames across the 320 ms snap (start → mid-slerp
   → landing) showing both the viewport camera move and the cube's live
   rotation, plus one frame of a **retargeted** snap (user clicks a second face
   mid-flight) and one of a **cancelled** snap (user starts orbiting).
5. **Tile composition:** cube + arrows + labels filling the 88 px tile tightly
   (8 px inner padding), nothing clipping at extreme poses.

## 5. Hard constraints (non-negotiable)

- Tile: exactly 88 × 88 px, 16 px from the viewport's top/right edges, 8 px
  inner padding, dark rounded surface.
- Color tokens only — surface `#0D1925`, hover `#142230`, border `#32485A`,
  label `#EDF3F8`; axis colors X `#F05252`, Y `#45C878`, Z `#3B82F6`
  (`--editor-orientation-*`, `--editor-gizmo-*`). No new palette, no inline
  hex in deliverable specs — name tokens.
- SVG/DOM rendering (crisp at 1×; no bitmap, no WebGL, no icon-font glyphs).
- Widget-owned pointer gestures inside the tile; standard cursor = pointer on
  targets only; keyboard reachable (every face/arrow focusable, Enter/Space
  activates, visible focus ring).
- One snap at a time: clicking another face retargets; orbiting cancels; while
  a camera preview owns the viewport, the widget renders **disabled** and
  ignores input.
- Scene 3D only — never shown in Plan views, Camera views, or the visitor app.

## 6. Open questions to answer in the sketches

1. Face-label size/weight that stays legible at 11 px tile scale.
2. Ghost-face opacity and dash rhythm that read as "exists but far".
3. Arrow length vs cube radius: how far the arrows may extend inside the tile.
4. Foreshortening: does a near-edge-on face keep its label, shrink it, or hide?
5. Disabled state during preview: full dim vs surface-only cue.
6. Should the tile show any motion cue during the 320 ms flight (recommend:
   none — the rotating cube is the cue)?
