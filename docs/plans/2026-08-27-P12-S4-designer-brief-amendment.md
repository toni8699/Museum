# P12 S4 — Camera timeline chrome designer brief

**Status:** Approved and implementation-ready; owner approved the
timeline-as-scrub-surface direction 2026-08-27.
**Date:** 2026-08-27
**Parent contract:** [`2026-08-26-P12-camera-timeline-contract-freeze.md`](2026-08-26-P12-camera-timeline-contract-freeze.md)
**Scope:** Main editor only (`/` and `/editor`). The legacy relic at
`/museum/editor` remains frozen under its P11.4 behavior.

This brief translates the supplied visual reference into the current editor's
actual scope, transport, timeline, and ownership model. Existing code and P12
contracts take precedence over visual assumptions in the reference image.

---

## 1. Product outcome

The Camera Timeline should read as a compact professional sequencer:

- the collapsed state is a temporal mini-player;
- the expanded state is a five-lane timeline;
- the shared playhead is the primary expanded scrubbing affordance;
- header transport remains available in both states;
- the active scope remains truthful: Sequence, Edge, or Camera;
- camera evaluation continues to use the existing normalized `[0, 1]`
  playhead and canonical motion/timeline pipeline.

This is a chrome and interaction redesign. It does not introduce a second
preview store, a second motion engine, a new timeline format, or a Shot
playback scope.

---

## 2. Scope and terminology

### 2.1 Valid preview scopes

The Scope control is contextual and uses the existing P12 scope model:

- **Sequence** — the complete authored camera flow and its five timeline lanes.
- **Edge** — one explicitly selected connection traversal, using Edge-local
  duration and progress.
- **Camera** — one unsequenced camera's static authored pose.

The scope selector is not a project catalog and does not create separate Shot
or clip playback scopes. `Shot_A`, `Shot_B`, and `Shot_C` may appear as lane
content or authored sequence projections, but they are not scope values.

### 2.2 View modes

The existing mode control remains:

- **POV / Through Camera** — applies the preview to the visitor camera.
- **Observer** — keeps the editor observer presentation and may use Follow and
  Center/Recenter.

With an installed preview, mode changes presentation only. It does not change
timeline authority, scope, selection, or coordinate domain. Idle is the sole
exception: choosing POV explicitly enters Sequence paused in `visitor` mode at
the restored playhead, per the parent S4 amendment; no mode state is added.

### 2.3 Static Camera scope

Camera scope has no temporal domain. It must not display a playhead, timecode,
scrubber, temporal lanes, or playback controls. It presents the selected
unsequenced camera's authored static pose.

---

## 3. Design tokens

These values are visual guidance, subordinate to the existing editor theme
variables and component conventions.

### Surface and interaction

- Base backdrop: deep navy/black equivalent to `#070A10`.
- Raised surface: equivalent to `#0D131F`.
- Hover surface: equivalent to `#1E293B`.
- Default border: low-contrast white/blue-alpha border.
- Active border: electric blue equivalent to `#3B82F6`.
- Active fill: translucent blue equivalent to `rgba(59, 130, 246, 0.2)`.
- Active glow: restrained blue glow; do not reduce contrast or obscure focus.
- Primary text: slate-white equivalent to `#F8FAFC`.
- Secondary text: slate-gray equivalent to `#94A3B8`.
- Active text: blue-white equivalent to `#60A5FA`.

Use existing `--editor-*` variables wherever available. Do not introduce a
second theme-token system for this surface.

### Lane colors

- Camera Path: blue.
- Shots: indigo.
- FOV: teal.
- Look At: amber/orange.
- Roll: purple.

These colors are lane identities, not additional stored state.

### Typography

- Use the existing editor font stack.
- Use tabular numeric styling for timecode and ruler labels.
- Keep labels compact and readable at the existing `44rem` responsive boundary.

---

## 4. Collapsed temporal mini-player

### 4.1 Availability

The mini-player is rendered only when an installed temporal preview has a valid
Sequence or Edge timeline. Idle remains the quiet Sequence shell, and Camera
scope remains static.

The mini-player must fit within the approved `48px` collapsed dock budget and
may use the reference's floating capsule treatment. Controls stay in the fixed
no-wrap row; exact radius, shadow, and width are implementation details
constrained by the shell and accessibility requirements.

### 4.2 Layout

Recommended order:

```text
[ Scope ▾ ] [ Previous Node ] [ Play/Pause ] [ Next Node ] [ mini scrubber ]
[ timecode ] [ POV | Observer ] [ Center ] [ Follow ] [ Expand ]
```

At wider widths this may remain one horizontal row. At narrow widths, secondary
controls may move into the existing accessible overflow menu, but Scope,
POV/Observer, Play/Pause, timecode, and expand/collapse remain reachable.

### 4.3 Controls

#### Scope selector

Displays the current contextual scope:

- Sequence
- Edge with named endpoints
- Camera with the selected unsequenced camera

It retains the existing explicit scope-entry semantics. Selection alone does
not change scope.

#### Previous / Next camera node

These controls navigate camera-node boundaries in the active temporal timeline.
They do not mean previous/next frame, arbitrary keyframe, or Shot clip.

For Sequence, they move only among `timeline.nodeBoundaries`. For Edge, the two
meaningful node boundaries are local start `0` and destination `1`: Previous
seeks `0`, Next seeks `1`, and each control disables at its matching endpoint.
They never visit view keys, position-part seams, frames, or Shot content. Add a
dedicated `stepCameraNodeBoundary(direction)` command instead of reusing
`stepCameraTimeline()`, whose existing cue semantics include view keys and
motion breakpoints. A boundary seek pauses playback and preserves scope/mode.

#### Play/Pause

One playback authority:

- paused temporal preview → Play;
- playing temporal preview → Pause;
- Play at the end restarts from normalized playhead `0`;
- Camera scope has no playback control.

No separate Replay button is shown.

#### Mini scrubber

The collapsed mini-player must include one compact native `input[type="range"]`
bound to the same normalized active-scope playhead:

- Sequence uses global Sequence progress.
- Edge uses Edge-local progress.
- Scrubbing pauses playback before evaluation.
- It does not create a second playhead or transport state.

The mini scrubber is not rendered for Camera scope or idle.
It has a scope-specific accessible name (`Sequence playhead` / `Edge playhead`),
keyboard-native range behavior, and a padded hit target of at least `24px`.

#### Timecode

Displays derived active-scope seconds:

```text
currentSeconds / durationSeconds
```

The stored playhead remains normalized. Timecode is presentation only.

#### POV / Observer

Use the existing segmented mode control. Preserve the current mode when
switching between installed scopes unless the explicit idle-entry rule applies.

#### Center / Recenter

Use the existing Observer recenter behavior. Outside applicable Observer state,
the control is unmounted or disabled; it is never a focusable no-op. A
non-interactive reserved slot may preserve header geometry.

#### Follow

Use the existing Observer follow behavior. It is not a new camera path or
constraint system.

#### Expand / Collapse

Expands to the full five-lane timeline or collapses back to the mini-player.
It does not change scope, mode, transport, selection, or playhead.

### 4.4 Explicitly excluded controls

The main-editor mini-player does not include:

- Repeat or loop.
- Replay-specific controls.
- Target Lock as a separate state.
- Follow Path as a separate state.
- Track lock controls.
- Track visibility state unless separately designed and implemented later.
- Frame stepping controls.
- Arbitrary keyframe stepping controls.
- Shot as a playback scope.

The `/museum/editor` relic exception remains frozen and is not redesigned by
this brief.

---

## 5. Expanded five-lane timeline

### 5.1 Header

The expanded header retains the same product controls as the collapsed
mini-player, with the expanded timeline below it:

```text
[ Scope ▾ ] [ Previous Node ] [ Play/Pause ] [ Next Node ] [ timecode ]
[ POV | Observer ] [ Center ] [ Follow ] [ Collapse ]
```

The header remains the authoritative playback surface. It is not replaced by
the lane canvas.

`+ View Key` remains visibly available now in expanded 3D Sequence under
`viewMode === '3d' && scope === 'sequence'`. It lives in the ruler-label/action
cell so no separate toolbar returns. Only its later visual placement may change.

### 5.2 Lane structure

The current five truthful lanes remain:

1. Camera Path
2. Shots
3. FOV
4. Look At
5. Roll

The left lane labels, lane projections, authored markers, and existing
selection/editing semantics remain. The design must not fabricate data for
lanes that have no authored projection.

### 5.3 Time ruler

The time ruler runs across the timeline canvas above the lanes:

- labels and tick density derive from the active scope duration;
- Sequence labels use global Sequence time;
- Edge labels use Edge-local time;
- Camera has no time ruler;
- the ruler remains visually aligned with all five lanes.

### 5.4 Lane-based scrubbing

The expanded standalone range input is removed. The lane canvas becomes the
scrub surface:

- clicking the ruler or empty lane background seeks to that horizontal
  position;
- dragging the playhead head scrubs continuously;
- the vertical playhead line spans the complete lane stack;
- the playhead head is visible at the ruler/lane boundary and provides the
  primary pointer target;
- scrubbing pauses either POV or Observer playback before evaluation;
- the active normalized playhead and derived timecode update in real time.

The playhead line itself may remain pointer-transparent except for its head and
an explicit background hit area. This avoids interfering with lane content.
Timeline click/drag changes playhead only; it never starts playback. Header
Play/Pause remains the sole authority that enters `playing`.

### 5.5 Gesture precedence

Existing authored-edit gestures have priority over background scrubbing:

1. View-keyframe drag.
2. Framing-envelope handle drag.
3. Marker selection/context interaction.
4. Playhead-head drag or empty timeline scrubbing.

The implementation must preserve pointer capture, cancellation, mutation gates,
and existing authoring pause semantics. Before beginning background scrub, the
delegated lane handler must reject targets inside edges, node/Shot markers,
view-key markers, envelope handles, context-menu targets, buttons, or any
`data-timeline-interactive` descendant. Only empty ruler/lane background or the
playhead head may own scrub pointer capture.

### 5.6 Node-boundary navigation

Previous and Next use the existing timeline node-boundary data. For a sequence
`A → B → C`:

```text
Previous/Next navigation targets:
A boundary → B boundary → C boundary
```

A node boundary represents the camera's arrival at that node: the end of the
inbound motion span and the beginning of the node's authored hold.

---

## 6. Interaction and accessibility contract

| Action | Trigger | Result |
| :--- | :--- | :--- |
| Play/Pause | Header or mini-player button | Toggles temporal transport only |
| Previous node | Button / keyboard equivalent | Seeks to previous node boundary and pauses |
| Next node | Button / keyboard equivalent | Seeks to next node boundary and pauses |
| Scrub | Click/drag ruler, lane background, or playhead head | Pauses and seeks active scope |
| Expand/Collapse | Chevron/button | Changes presentation only |
| POV/Observer | Segmented control | Changes presentation mode only |
| Center/Recenter | Existing Observer action | Re-centers observer view |
| Follow | Existing Observer action | Toggles observer follow behavior |
| Add View Key | Visible ruler-label action | Available only under current 3D Sequence guard; placement may change later |

Requirements:

- The playhead head must have an accessible name and keyboard operation.
- The playhead head uses `role="slider"`, `tabindex="0"`, normalized
  `aria-valuemin/max/now`, and derived-time `aria-valuetext`; ArrowLeft/Right
  seek, Home/End seek `0/1`, and each seek pauses first.
- A keyboard user must be able to move to previous/next node boundaries without
  pointer input.
- Scrubbing must remain usable in both POV and Observer.
- Focused controls must not be clipped at `<44rem`.
- Local menu Escape retains precedence over transport Escape.
- Main-editor Escape pauses playing temporal preview without changing scope;
  relic Escape remains teardown behavior.

---

## 7. Existing-code alignment

The implementation should reuse the current ownership boundaries:

- `EditorCameraTimelineFrame.svelte` — main header, collapsed mini-player,
  scope/mode/transport chrome, timecode, and expand/collapse.
- `EditorCameraTimelineRuler.svelte` — retained unchanged for the frozen relic
  only; the main editor stops mounting it.
- `EditorCameraTimelineDots.svelte` — existing time ruler, five-lane canvas,
  one grid overlay spanning the track column, shared playhead line/head,
  lane-background hit area, and visible gated `+ View Key`; preserve authored
  drag precedence. Remove the five repeated per-lane playhead fragments.
- `use-camera-timeline.svelte.ts` — derived scope, durations, playhead,
  capabilities, and existing seek commands.
- `camera-preview-controller.svelte.ts` — existing preview FSM and run IDs.
- `camera-preview-commands.svelte.ts` — existing transport/scope orchestration.
- `editor-camera-timeline.ts` — existing node boundaries and normalized/global
  and local coordinate conversion.
- `editor-store.svelte.ts` — existing façade delegates only; no parallel store.

The motion pipeline remains the canonical `camera-route.ts` plus
`camera-motion.ts` path.

---

## 8. Boundaries and exclusions

This brief does not include:

- New persistence fields.
- New scene or timeline schema.
- New Shot scope.
- Branch/rejoin playback.
- Timeline zoom state.
- Track lock/visibility persistence.
- Target-lock or follow-path subsystems.
- Frame-rate or seconds-based canonical playhead.
- Redesign of `/museum/editor`.
- Visitor-route UI changes at `/museum`.

---

## 9. Acceptance checklist

### Collapsed

- Temporal Sequence and Edge previews render the integrated mini-player.
- Idle remains quiet and Camera remains static.
- Scope selector keeps Sequence / Edge / Camera semantics.
- Previous/Play-Pause/Next, timecode, POV/Observer, Center/Follow, and
  expand/collapse are available according to capability and mode.
- No Repeat, loop, Replay, Target Lock, Follow Path, or Shot scope appears.
- Collapsed scrubbing uses the same active-scope normalized playhead.

### Expanded

- The header remains the unique playback authority.
- The standalone expanded range input is absent.
- The ruler and five lanes share one horizontal coordinate domain.
- The playhead line spans all five lanes.
- The playhead head is draggable and keyboard-accessible.
- Empty ruler/lane background scrubs; authored marker and handle gestures win.
- Sequence uses global progress; Edge uses Edge-local progress.
- Scrubbing pauses both POV and Observer playback.
- Previous/Next target node boundaries, not frames or arbitrary keyframes.
- Sequence node navigation uses `timeline.nodeBoundaries`; Edge uses only
  endpoints `0/1`; existing cue/key stepping remains separate.
- `+ View Key` is visible under the existing 3D Sequence guard without a
  separate playback/action bar.
- Timeline click/drag never autoplays; only header Play enters `playing`.

### Regression boundaries

- P12 scope and selection laws remain unchanged.
- Normalized playhead and binary transport remain unchanged.
- At-end Play restarts from `0`.
- Main-editor Escape pauses; relic Escape tears down as before.
- `/museum/editor` remains visually and behaviorally frozen.
- No second preview/timeline/motion store is introduced.
