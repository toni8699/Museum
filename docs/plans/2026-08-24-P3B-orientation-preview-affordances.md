# P3B — Orientation box, Plan parity, and camera preview affordances

**Date:** 2026-08-24  
**Status:** Proposed — standalone follow-up after P3 close.
**Tracker:** [`docs/plans/README.md`](README.md) — **P3B**, depends on P3 + P8 S2–S4
**Historical source:** [`P3 umbrella`](../archive/plans/2026-08-18-P3-ui-overhaul.md) — extracted P3.4/P3.5 and P3B scope

## Purpose and current shell contract

P3B completes the remaining interaction and visual-parity work around the
accepted P3 baseline for the current product shell:

```text
Scene | Camera
Plan  | 3D
```

These are two explicit shell axes producing four intentional views inside one
persistent editor shell. `Scene Plan`, `Scene 3D`, `Camera Plan`, and `Camera
3D` are current product surfaces, not obsolete architecture or additional
applications. Scene Plan's local mode is `Layout | Arrange`.

Current implementation names such as `CameraPlanViewport` and
`CameraPlanInspector` are valid locations for this work. P3B does not create
additional workspaces, duplicate shell state, or alter the domain/view model.

P3B is editor-only (`/` and `/editor`). `/museum` and `/museum/editor` remain
frozen relic routes.

## Outcome

P3B is executed as sequential groups, not concurrent tracks. Complete the
current group before starting the next; P3B.4b is the final Group A refinement,
and the deferred tail is intentionally last and remains non-blocking.

P3B should deliver three core groups plus a deferred acceptance tail:

1. **Group A — Plan-surface parity** — reconcile Scene Plan and Camera Plan
   presentation without changing their shared spatial math or authority.
2. **Group B — Scene 3D orientation interaction** — restore the specified
   orientation utility only after its canonical snap authority is discovered or
   defined by the shell/view contract.
3. **Group C — Camera preview affordances** — make selection, explicit preview,
   transport, scope labels, and sequence/edge meaning unambiguous across Camera
   Plan, Camera 3D, Inspector, Sidebar, and the shared Camera timeline.
4. **Deferred P3.4/P3.5 tail** — revisit the existing context-menu adapters and
   accept them only after broader testing; this tail does not block core P3B.

P3B adds no preview engine, route, graph, timeline, selection store, document
state, history model, or new camera semantics. It reuses the existing
`EditorStore`, preview FSM, `camera-route.ts`, `camera-motion.ts`, selection
actions, timeline identities, Plan transforms, and hit resolvers.

## Cross-cutting invariants

- One editor shell with `Scene | Camera` over `Plan | 3D`; no additional
  workspace generation.
- One 3D canvas and one canonical selection model per domain.
- One Camera timeline owned by the Camera domain and preserved across Camera
  Plan ↔ Camera 3D.
- One camera navigation path (`camera-route.ts`) and one motion path
  (`camera-motion.ts`).
- Plan is an SVG top-down floor projection. User-facing Plan axes are world X/Z:
  `screen X ← world X`, `screen Y ← world Z`; world Y is vertical height and
  remains preserved by Plan editing. Internal SVG `x/y` variable names do not
  change that semantic contract.
- Camera Plan connections remain visually undirected. Direction appears only in
  an explicitly labeled preview/playback action, never as topology arrows.
- Normal selection never starts playback, changes preview scope, resets a
  playhead, or replaces an active preview.
- Selection and preview scope are independent. For example:

  ```text
  Selected: Connection C—E
  Preview: Sequence · Main Visitor Tour
  ```

- Preview actions use Play/CirclePlay semantics. Eye remains for visibility/view
  semantics.
- All changes remain editor-only and must preserve relic isolation.

# Slice group A — Plan-surface visual parity (P3B.4a)

## Code finding

Scene Plan and Camera Plan already share the same spatial primitives:

- `PlanViewportState`
- `buildPlanGrid`
- `visiblePlanBounds`
- world/screen coordinate transforms
- `PlanSvg`

Their duplicated presentation chrome has drifted in the current code:

- separate canvas and room-fill tokens;
- hardcoded Camera Plan selected-room `#e2efff`;
- duplicated grid labels, scale readouts, and fixed scale bars;
- inconsistent scale offsets and bottom metadata clearance;
- no grid level-of-detail;
- no adaptive rulers;
- no segmented scale bar.

## Required outcome

Reconcile both Plan surfaces into one consistent drafting language while
preserving existing coordinate transforms, `preserveAspectRatio="none"`, hit
resolution, selection authority, and document ownership.

- Centralize canvas, room-fill, and selected-room token ownership. If Camera
  Plan remains slightly subdued, express that as one centralized variant rather
  than a third palette or inline color.
- Remove the hardcoded `#e2efff` value.
- Ensure the scale label/bar clears the bottom `.plan-meta` region on both
  surfaces, with consistent metadata color and wrapper treatment.
- Share the chrome implementation where practical (for example, a
  `PlanCanvasChrome` component beside `PlanSvg`), but do not force an
  abstraction if it makes ownership less clear. The acceptance target is
  behavior and visual parity, not a specific component name.
- Add pure, tested adaptive grid LOD so minor lines do not form a near-solid mesh
  at Camera Plan zoom and labels do not spam every minor/major tick.
- Add viewport-pinned **X/Z world-coordinate rulers** from
  `visiblePlanBounds()`, choosing readable `1/2/5 × 10^k` metre ticks at roughly
  80 px spacing. Rulers replace floating grid-label presentation; they do not
  create a second coordinate system.
- Replace the fixed 100 px line with a pure-helper-driven segmented scale bar
  using readable `1/2/5 × 10^k` lengths, roughly 80–140 px, with alternating
  segments and labels (the sketch's 0/5/10/15 grammar).
- Keep Plan geometry and camera semantics unchanged. Rulers are presentation;
  SVG screen Y maps to world Z, and world Y remains height.

## Acceptance

```text
Scene Plan + Camera Plan
→ same token ownership and selection language
→ same readable grid density at equivalent zoom
→ adaptive X/Z rulers without label spam
→ identical segmented-scale grammar
→ scale chrome clears bottom metadata
→ no hardcoded third blue or divergent fixed offsets
→ common Plan math and hit testing remain unchanged
```

## P3B.4b — Plan ruler corner orientation key

This follows P3B.4a within Group A and must be completed before Group B begins.
Both Plan surfaces receive the same small, non-interactive L-shaped corner key
at the bottom-right ruler corner:

```text
Z ↑
  │
  ○────────→ X
```

The vertical Z indicator points upward and meets the horizontal X indicator at
its base. The key is presentation-only, uses muted Plan ruler styling, remains
visible when the grid is disabled, does not collide with the segmented scale or
metadata, and does not alter Plan transforms, hit resolution, selection, or
document state. It is shared by Scene Plan and Camera Plan and is not a second
coordinate system.

## Acceptance

- `Z ↑` is the vertical indicator and `X →` is at the base, pointing right.
- A visible two-tone origin knob is painted over the shared axis base and
  arrow joins, using the existing X/Z axis colors rather than the Plan
  background; the axis arrows must terminate visually beneath the knob.
- The key is fixed to the bottom-right ruler corner and does not follow model
  geometry or selection.
- It is identical across Scene Plan and Camera Plan, non-interactive, and
  exposed as a concise presentation label or intentionally hidden when the
  surrounding rulers provide equivalent semantics.
- Existing screen-X/screen-Y implementation math remains unchanged; the key
  communicates the Plan's world X/Z convention only.

# Slice group B — Scene 3D orientation and layout presentation (P3B.1–P3B.4)

## Orientation discovery gate

The current implementation has no orientation widget and no canonical axis/face
snap API. `apps/museum/src/lib/editor/camera/editor-camera.ts` currently
provides neutral/bounds/node/room framing, orbit-pose capture/restore, director
observer helpers, and preview preparation. It does not define `+X/-X/+Y/-Y/+Z/-Z`
orientation mapping or widget behavior.

Before implementation, inspect and cite the actual existing view-snap authority.
The required deliverable is a table covering:

- axis/face → world direction and camera pose;
- orbit target behavior;
- eye-target distance behavior;
- projection mode;
- world-up behavior;
- zoom/FOV/near/far behavior;
- the exact API used to apply the snap.

If no canonical authority exists:

- stop P3B.1–P3B.4;
- report the exact searched files/APIs;
- do not invent snap semantics;
- do not begin Group B implementation until the authority is approved;
- define the missing authority in the shell/view contract before resuming.

The closest existing preservation contract is `captureEditorOrbitPose`, which
captures position, target, zoom, FOV, near/far, OrbitControls distance limits,
enabled state, and damping; aspect is intentionally not restored. This is not
an orientation mapping and must not be treated as one.

## Orientation visual/interaction contract

- Restore the documented `--editor-orientation-*` token family in the editor
  token file before styling. Do not inline widget colors, dimensions, or insets.
- Mount only in **Scene 3D**; absent from Scene Plan Layout/Arrange, Camera
  Plan, Camera 3D, and relic routes.
- The widget follows the active viewport camera. Its orientation is derived
  presentation only; it owns no independent orientation, camera pose, document
  state, or history state.
- Use the custom SVG/DOM orientation graphic specified by the design docs, not a
  Lucide icon, and keep it separate from TransformControls, object outlines,
  Inspector chrome, and viewport edge controls.
- Axis colors remain X red, Y green, Z blue as defined by the design tokens.
- Pointer gestures beginning inside the widget remain widget-owned through
  completion/cancel. Movement beyond the existing editor click-vs-drag
  threshold cancels snap activation and must not fall through to OrbitControls.
  Escape cancels transient interaction.
- Click/Enter/Space activation changes only the camera view; it must not select
  objects, alter TransformControls, mutate `SceneDocument`, or create history.
- P3B.1–P3B.4 must preserve existing Scene selection and one-gesture history
  behavior.

## Layout-box visual contract

The `scene-3d-layout-selection.png` sketch is authoritative for passive layout
context. Passive layout boxes use a quiet white/light neutral treatment. Blue
is reserved for selected/active state; do not use amber or dark-neutral
emphasis for passive layout geometry. Hover must remain distinct from selected
state and must not activate a transform gizmo.

# Slice group C — Camera preview affordance reconciliation (P3B.5–P3B.6)

## Current code findings

The current code already has the underlying preview paths:

- AppBar: `Preview Sequence` while Camera is active;
- node Inspector/context actions: `Preview Camera`;
- connection Inspector/context actions: `Preview Edge`;
- timeline transport controls for the active preview;
- existing preview FSM and route/motion implementation;
- shared Camera timeline persistence across Plan ↔ 3D.

The remaining work is affordance and labeling reconciliation, not a second
preview system.

## Required interaction grammar

```text
Click = select
Preview action = change preview scope
Play/Pause = control current preview
```

- Sequenced and unsequenced nodes both use `Preview Camera` for a static hold.
  Sequence membership never turns node selection into sequence playback.
- `Preview Sequence` belongs to the Sequence section/header/timeline, not node
  selection.
- A normal connection row/body/curve click selects an undirected connection.
  It does not imply direction.
- For a connection adjacent in the current Sequence, the canonical direction is
  the earlier sequence node → the immediately following sequence node. This
  affects only the default preview action; it never changes stored topology.
- Sequence-adjacent connections expose one directly executable, clearly labeled
  Preview Edge action using sequence predecessor → immediate successor.
  Connections without sequence adjacency expose one Preview Edge affordance
  that opens a compact explicit choice between the two named traversal
  directions before entering edge preview. This is direction selection for one
  undirected connection, not a second topology control or preview system.
  Existing Reverse behavior may remain as a transport action after edge preview
  starts.
- The canonical edge derivation reads `mainFlowNodeIds` adjacency, never endpoint
  storage order, timing-key order, selected endpoint, pointer location, or name
  sorting.
- Selection never cancels or replaces active preview. Explicit Preview commands
  do that and retain existing playhead/run-id behavior.

## Preview labels and controls

Every preview action must name its target and, where applicable, direction:

```text
Preview Camera C
Preview Edge Camera C → Camera E
Preview Sequence Main Visitor Tour
```

The shared timeline/header must expose one of:

```text
Preview: Camera · <node>
Preview: Edge · <from> → <to>
Preview: Sequence · <tour>
```

These labels remain independent from selection labels. `Selected: Connection C—E`
must not rewrite a still-playing `Preview: Sequence · Main Visitor Tour` label.

Use Play/CirclePlay for preview actions. Eye remains reserved for visibility/view
semantics. Controls must be keyboard accessible, have full spoken labels, and
must not let global Space steal activation from focused controls.

## Surface-specific reconciliation

- Camera Plan node preview works identically for sequenced and unsequenced
  nodes.
- Camera Plan connection preview exposes one labeled action: it executes the
  canonical sequence direction for adjacent Sequence edges, or opens a compact
  two-choice direction menu for non-adjacent/unsequenced edges. Topology remains
  undirected.
- Camera 3D reuses camera graph commands but does not gain Plan-only spatial
  actions or an unapproved second edge-preview entry control. The same
  one-action/canonical-or-chooser rule applies wherever edge preview is exposed.
- Timeline node, connection, and keyframe actions use backing identities, not
  cosmetic lane labels.
- Camera anchors, empty space, and cosmetic Shots/Roll lanes do not receive
  their own menus.
- Existing Preview Camera, Preview Edge, and Preview Sequence commands remain
  the only preview entry points; the non-adjacent edge chooser is an internal
  choice within Preview Edge, not a second preview system.

# Slice group D — Deferred P3.4/P3.5 acceptance tail (P3B.7b)

P3.4 and P3.5 remain implemented but undone and low priority. They are revisited
after core P3B and do not block core shipment unless touched code regresses
them.

Coverage required before marking them shipped:

- Scene 3D Duplicate, Focus, Hide/Show, Delete;
- Scene Plan Layout and Arrange owner-aware actions;
- Outliner identity/kebab equivalents;
- Camera Plan/3D node and connection adapters;
- timeline node, connection, and keyframe backing identities;
- selection-before-menu and multi-selection preservation;
- editable/native browser interception and empty-space behavior;
- disabled reasons and one gesture → one undo entry;
- relic-boundary and visitor-chunk isolation;
- no accidental preview-scope or selection changes.# Recommended implementation order — sequential groups

Complete these groups in order. Do not start a later group until the prior group
is complete and accepted.

### Group A — Plan-surface parity

1. **P3B.4a** — Implement token cleanup, grid LOD, X/Z rulers, segmented scale
   chrome, metadata clearance, and focused pure-helper tests.
2. **P3B.4b** — Add the shared lower-left `Z ↑` / `X →` corner orientation key
   to both Plan surfaces.

### Group B — Scene 3D orientation and layout

3. **P3B.1** — Discover and cite the canonical snap authority.
4. **P3B.2** — Add isolated orientation hit targets using that authority.
5. **P3B.3** — Add orientation interaction states and cancellation.
6. **P3B.4** — Add orientation fixtures and non-mutation assertions.

If P3B.1 finds no authority, stop Group B and report the searched files/APIs;
do not invent poses. Group C does not begin until Group B is complete or the
owner explicitly reorders/re-defers it.

### Group C — Camera preview affordances

7. **P3B.5** — Reconcile existing node/edge/sequence actions, target labels,
   timeline scope labels, and selection-versus-preview behavior.
8. **P3B.6** — Add sequence predecessor → successor derivation and the explicit
   two-choice chooser for non-adjacent/unsequenced edges.

### Completion and deferred tail

9. **P3B.7a** — Run core regression and accessibility QA.
10. **P3B.8** — Run browser QA across all four shell views.
11. **P3B.7b** — Revisit deferred P3.4/P3.5 context-menu acceptance last.

The numbered list is the authoritative order; difficulty scores in the model
assessment do not reorder the groups.


# Work increments and dependencies

| ID | Slice | Content | Depends |
|---|---|---|---|
| P3B.4a | A | Plan-surface parity: centralized tokens, grid LOD, adaptive X/Z rulers/labels, shared segmented scale grammar, metadata-safe clearance. | P3 |
| P3B.4b | A | Shared lower-left `Z ↑` / `X →` Plan ruler corner key; presentation-only and identical across both Plan surfaces. | P3B.4a |
| P3B.1 | B | Discover/cite canonical orientation snap authority and exact axis/face mapping; restore orientation tokens. | P3B.4b |
| P3B.2 | B | Add isolated Scene 3D orientation hit targets and route activation through the discovered canonical API. | P3B.1 |
| P3B.3 | B | Add hover, pressed, focus-visible, cancel, and authoring-context/view transition behavior. | P3B.2 |
| P3B.4 | B | Add orientation fixtures: camera response, snap behavior, selection continuity, no drag-orbit, and zero document/history mutation. | P3B.2–P3B.3 |
| P3B.5 | C | Reconcile Camera Plan/3D node, connection, Inspector, Sidebar, and timeline preview affordances and scope labels. | P3 + P8 S2–S4 |
| P3B.6 | C | Derive sequence predecessor → immediate successor; execute it from one labeled Preview Edge action for adjacent edges, and open a compact two-choice traversal menu for non-adjacent/unsequenced edges. | P3B.5 |
| P3B.7a | Core QA | Test orientation, preview, independent labels, edge direction, accessibility, and Plan parity. | P3B.4b + P3B.4 + P3B.6 |
| P3B.7b | Deferred QA | Revisit undone P3.4/P3.5 acceptance; non-blocking tail. | P3B.7a or independently after touched code |
| P3B.8 | Core browser QA | Browser QA across all four shell views, relevant sidebars/Inspectors, Plan chrome, orientation utility, and timeline. | P3B.7a |

Execution is strictly sequential: complete Group A, then Group B, then Group C,
then core QA, then the deferred tail.

# Definition of done

## Core P3B

- Group A, including P3B.4a and P3B.4b, is completed first in the pinned
  order. If B remains gated after P3B.1, the owner may explicitly re-defer B;
  otherwise the umbrella closes only
  when B ships against canonical snap authority.
- Once B is resolved, P3B.4a, P3B.1–P3B.6, P3B.7a, and P3B.8 pass.
- All preview controls have explicit target labels and preserve the
  click/select/preview/play grammar.
- Selection and preview labels remain independent and truthful.
- Camera Plan topology remains undirected; only explicit labeled preview uses
  direction.
- Plan surfaces have parity in token ownership, grid density, X/Z rulers,
  segmented scale chrome, metadata clearance, and theshared bottom-right `Z ↑` / `X →` corner key.
- Scene 3D passive layout boxes match the sketch's white/light treatment.
- Orientation interaction is Scene 3D-only, camera-derived, isolated, keyboard
  accessible, non-orbiting on drag, and non-mutating.
- No second graph, motion, timeline, selection, coordinate, or persistence
  system; no relic leakage.
- `npm test`, `npm run check`, `npm run build`, and `git diff --check` pass.

## Deferred P3.4/P3.5 tail

P3.4/P3.5 remain undone until their broader acceptance matrix passes. Their
completion is reported separately and does not gate core P3B unless touched
code causes a regression.

# Independent review brief

This document is self-contained for a reviewer who has read the written design
specifications, `Design-png/README.md`, North Star, and architecture docs.

## Review question

Does P3B implement the current `Scene | Camera` × `Plan | 3D` product shell and
bring the four current views into PNG/spec consistency without changing product
authority or adding parallel state systems?

## What is already confirmed in code

- `EditorApp` owns one persistent shell with separate domain and view controls.
- Scene Plan owns `Layout | Arrange`; Camera Plan does not expose that local mode.
- Camera Plan and Camera 3D share Camera selection and timeline state.
- Plan uses SVG and shared spatial transforms; Camera Plan does not maintain
  graph-layout coordinates separate from world coordinates.
- Camera Plan topology is undirected; graph order and Sequence traversal are
  separate concepts.
- P8 preview FSM, camera route/motion, and playhead preservation already exist.
- P3.4/P3.5 adapters exist but remain intentionally undone pending broader tests.
- No orientation widget or canonical axis/face snap API currently exists.

## Findings the implementation must address

1. Restore the orientation token family and discover/cite actual snap authority;
   never invent axis/face poses or preserved-camera behavior.
2. Reconcile duplicated Scene Plan/Camera Plan chrome and token drift while
   preserving shared Plan math. Use X/Z world ruler labels even though SVG uses
   screen X/Y internally, and include the lower-left `Z ↑` / `X →` corner key.
3. Apply white/light passive layout-box styling from
   `scene-3d-layout-selection.png`.
4. Reconcile preview controls and timeline labels so every action identifies its
   target and direction where applicable; keep selection labels independent.
5. Use one Preview Edge affordance: execute the canonical sequence direction
   for sequence-adjacent edges, and require an explicit two-choice traversal
   menu for non-adjacent/unsequenced edges. Existing Reverse may remain
   transport behavior; topology stays undirected.
6. Derive sequence-adjacent direction from sequence predecessor → immediate
   successor, never endpoint storage order.
7. Keep the deferred P3.4/P3.5 context-menu acceptance tail separate and
   non-blocking.

## Review gates

- **B gate:** after Groups A and C are completed, if no canonical snap authority
  is found, B.1–B.4 stop and the implementation reports searched files/APIs;
  no snap behavior is invented.
- **A gate:** both Plan surfaces have equivalent visual chrome behavior at
  equivalent zooms, readable X/Z rulers, the lower-left `Z ↑` / `X →` corner
  key, segmented scale bars, no metadata overlap, and no third selection color.
- **C gate:** clicking selects only; explicit Preview changes scope; Play/Pause
  controls the active scope; scope labels do not follow unrelated selection;
  sequence-adjacent edge preview executes predecessor → successor, while
  non-adjacent/unsequenced edge preview requires an explicit two-choice
  traversal menu and then labels the chosen direction.
- **Shell gate:** all four views retain specified toolbar/sidebar/Inspector/
  timeline visibility and relic isolation.
- **Deferred gate:** P3.4/P3.5 are marked shipped only after their separate
  acceptance matrix passes.
