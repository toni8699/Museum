# P12 — Camera Timeline / Preview contract freeze (ratified specification)

**Status:** `approved` — ratified & frozen 2026-08-26. Implementation slices
follow; the plan is the contract, not the work breakdown.
**Amended 2026-08-27 (S4 designer brief incorporation):** P12 S4 is expanded before S5 closeout to adopt the corrected designer brief ([`2026-08-27-P12-S4-designer-brief-amendment.md`](2026-08-27-P12-S4-designer-brief-amendment.md)), including the collapsed mini-player and lane-based expanded scrubbing described below; the P12 scope model and main-editor transport ownership remain authoritative. `+ View Key` remains visible in expanded 3D Sequence, with later placement polish permitted. Edge Repeat/loop and Replay affordances are removed from the main-editor contract. Previous/Next mean previous/next camera-node boundary, not frame or keyframe stepping. The relic remains frozen. The designer reference is interpreted as visual guidance only where it conflicts with existing P12 scope/data semantics.
**Amended 2026-08-26 (post-ratification review):** (1) closeout ownership is
pinned to P12 in the tracker (§10 S5); (2) the distinct Replay affordance is
dropped as redundant — at-end Play restarts from `0` (§2 rule 5), leaving one
Play/Pause control; (3) the header Sequence diagnostic uses `Gap at Node N`
wording so it never collides with the derived `Stops at` loop readout
(§4/§6); (4) the later S4 designer amendment supersedes the interim
36px-header + 12px-mini-row composition with one integrated `48px` collapsed
mini-player; expanded header remains `36px`, and transport remains unique (§6).
**Tracker:** [`README.md`](README.md) — **P12**, depends on: P11.
**Placement:** the independent designer review of the P11 UX findings produced
the canonical specification below. The owner closed the six product questions,
one sequence-loop blocker, and a later implementation-hardening review. This
doc is the authority for the resulting contract. It **intentionally
supersedes** the conflicting P11.2/P11.3/P11.4 rows in §9. P11.5 is already
shipped; **P12 owns its own contract reconciliation and browser-QA closeout**.
**Baseline:** P12 starts from the shipped P11.4 + fixes baseline and migrates
that surface onto this frozen contract without creating a second camera-motion
or preview-state system.

---

## §1 — The Five Canonical Laws

```text
1. One timeline shell; scopes change presentation data, not product grammar.
2. Selection never implicitly changes playback scope.
3. In Sequence scope, sequenced-node selection seeks + pauses; outside Sequence
   scope, selection alone changes.
4. Edge scope is entered only through explicit Preview Edge / scope action.
5. Completion never disables inspection on temporal scopes.
```

Two architectural pins (owner-approved wording):

```text
View mode changes camera presentation, not timeline authority.
Preview scope changes evaluation domain, not selection authority.
```

---

## §2 — Canonical session state & derived transport model

Transport is strictly binary. The canonical motion/evaluation playhead remains
**normalized active-scope progress `[0, 1]`**; seconds are presentation derived
from the active scope duration. P12 must not migrate the camera-motion pipeline
to seconds merely to render timecode.Sequence looping is not exposed as a main-editor playback control in P12; playback
ends at the authored sequence end. Replay-specific and Edge Repeat/loop controls are
removed from the main-editor contract. Any future loop behavior must be separately
reintroduced as an explicit contract decision.

```ts
// Conceptual canonical session shape. Pure session truth; never serialized.
type PreviewScope =
  | { type: 'sequence' }
  | {
      type: 'edge';
      edgeId: string;
      fromNodeId: string;
      toNodeId: string;
      repeat: boolean;
    }
  | { type: 'camera'; nodeId: string };

type TransportState = 'playing' | 'paused'; // no stored 'complete' state

interface TimelinePreviewSession {
  scope: PreviewScope;
  transport: TransportState;
  playhead: number; // normalized active-scope evaluation progress [0, 1]
  viewMode: 'pov' | 'observer';
  observerFollow: boolean;
}
```

### Idle is a first-class state

`cameraPreview === null` (no installed preview) is part of the session model,
not an unmodeled gap: presentation falls back to the **Sequence shell** (global
ruler + lanes, idle grammar — `▶` is the explicit default Sequence entry),
transport readouts stay quiet, and no `repeat` / playhead state is exposed.
Camera-domain enter/leave, project reset/import, and document replacement must
return to idle deterministically (acceptance-pinned in §10).

### Existing-state ownership pin

`TimelinePreviewSession` is a **contract shape for the existing Camera preview
session**, not permission to add another store. Implementation evolves the
existing `EditorCameraPreview` / `EditorCameraPreviewController` ownership,
including its `runId`, captured-route invalidation, follow/recenter state, and
canonical playhead. It **must not** introduce a parallel timeline-preview store
that mirrors or synchronizes the existing preview FSM.

The Edge-local `repeat` field above is conceptual ownership. Implementation may
retain the existing dedicated controller slot only if it is reset on every Edge
scope exit and reads false outside Edge; no second Repeat truth is allowed.

The active `durationSeconds` is a derived read from the canonical Sequence or
Edge timeline/motion. Camera scope has no temporal duration.

### Derived transport capabilities

```ts
const isTemporal = scope.type !== 'camera';
const durationSeconds = deriveActiveScopeDurationSeconds(scope); // 0 if unavailable/static
const canPlay = isTemporal && durationSeconds > 0;
const atEnd = canPlay && playhead >= 1;
const currentSeconds = isTemporal ? playhead * durationSeconds : 0;
```

### Transport & inspection rules

1. **Camera scope (static):** `isTemporal === false`; `playhead = 0`,
   `transport = 'paused'`. Play, Repeat, and Scrub are inactive. The bar
   presents authored static pose framing.
2. **Temporal scopes (Sequence | Edge):**
   - `transport === 'playing'` → render **Pause**
   - `transport === 'paused' && canPlay` → render **Play**
   - No Replay, Repeat, or loop affordance is rendered in the main editor.
   - Previous/Next transport controls jump to the previous/next camera-node
     boundary in the active timeline.
3. **Zero-duration temporal scope:** `canPlay === false`, `atEnd === false`,
   and Play is never shown. Transport stays quiet/disabled while the valid
   static boundary remains inspectable. This is acceptance-pinned.
4. **Inspection freedom (Law 5):** reaching normalized `playhead = 1` on a
   playable temporal scope sets `transport = 'paused'`; `atEnd` is derived, not
   stored. Scrubber drag, step backward/forward (`[` / `]`), and jump to start
   (`|◀`) remain interactive. Dragging the scrubber pauses and evaluates the
   camera at the new normalized progress.
5. **Play-at-end:** activating Play while `atEnd` first resets normalized
   playhead to `0`, then enters `playing`. A distinct Replay affordance is
   deliberately dropped.

### Live retiming invariant

Timing/duration edits never convert stored playhead into seconds and therefore
cannot create `playhead > duration` state. The accepted authoring seam pauses a
playing preview before a timing write. After the document/timeline re-resolves,
the normalized playhead remains clamped to `[0, 1]`; display seconds are
re-derived from the new duration and the camera is re-evaluated through the
existing canonical route/timeline pipeline. Tests pin live retiming and the
zero-duration case.

---

## §3 — Scope model & traversal direction semantics

The Scope selector is an explicit contextual switcher. Graph topology stays
**strictly undirected**. `Preview Camera` is available only for a selected
**Unsequenced** camera.

```text
Scope menu contents:
┌────────────────────────────────────────────────────────────┐
│ 🎞 Sequence (Full Tour)                                    │
│ ────────────────────────────────────────────────────────── │
│ ⇄ Preview Edge [A → B]   (selected Sequence-adjacent Edge) │
│ ⇄ Preview Edge…          (selected non-adjacent/free Edge) │
│ 📷 Preview Camera [U]    (selected Unsequenced Camera)      │
└────────────────────────────────────────────────────────────┘
```

### Invariants

1. **Explicit endpoints:** Edge traversal is `fromNodeId` + `toNodeId`, both
   verified as valid endpoints of `edgeId`. No stored canonical "forward" in
   graph topology.
2. **Sequence-adjacent default:** a Sequence-adjacent edge may expose one direct
   Preview Edge action using `Sequence predecessor → Sequence successor`.
3. **Non-adjacent/unsequenced direction chooser:** `Preview Edge…` must open an
   explicit compact choice between the two named traversals:

   ```text
   Preview Edge…
   ├─ A → B
   └─ B → A
   ```

   Endpoint storage order, selected endpoint, pointer position, timing-key
   order, and lexical/name sorting must never silently choose traversal.
4. **Flip traversal:** `[⇄ Flip]` swaps `fromNodeId` / `toNodeId` in session
   state and **resets normalized Edge playhead to `0`** (display `0.00s`),
   without altering the undirected connection. This deliberately supersedes
   P11.4 pose-preserving `1 − e` swap behavior.
5. **Contextual menu:** `Sequence` is always available. Edge and Camera entries
   appear only for the currently eligible selection. The menu is not a project
   catalog or second graph navigator.
6. **Main-editor loop controls:** Edge Repeat, Sequence loop, and Replay are
   not part of the amended P12 main-editor chrome. Sequence is a single
   authored traversal from start to end. Any future loop behavior requires a
   separate explicit contract decision.

### Sequenced vs Unsequenced inspection

```text
Sequenced camera
→ static inspection = Sequence scope at its node boundary
→ Camera scope unavailable

Unsequenced camera
→ no Sequence timestamp
→ Preview Camera enters static Camera scope
```

Canonical motion guarantees exact node poses at transition boundaries, so a
sequenced node's authored framing is inspectable via
`Sequence → seek(nodeBoundary) → paused`. This intentionally supersedes the
older "Preview Camera works for every camera" grammar and avoids two static
inspection paths for the same sequenced pose.

---

## §4 — Selection, scope, and seeking matrix

Viewport selection across Camera Plan / Camera 3D is one shared session
identity. Playhead seeking obeys the active scope's coordinate space.

| User interaction | Selection result | Active scope `Sequence` | Active scope `Edge` or `Camera` |
| :--- | :--- | :--- | :--- |
| **Click Sequenced Node C** *(evaluable boundary)* | Selects Node C | Seeks to C boundary; sets `paused` | **Selection only**; scope/playhead/transport unchanged |
| **Click Sequenced Node C** *(post-gap / malformed)* | Selects Node C | Seeks to last evaluable boundary; exposes `[⚠️ Gap at Node X]` | **Selection only**; unchanged |
| **Click Edge E** | Selects Edge E | **Selection only**; unchanged | **Selection only**; unchanged |
| **Click Unsequenced Node U** | Selects Node U | **Selection only**; unchanged | **Selection only**; unchanged |
| **Explicit Preview Edge** | Selects Edge E | **Switches to Edge scope** after deterministic direction resolution; playhead `0`; `paused` | Same |
| **Explicit Preview Camera** *(unsequenced only)* | Selects Node U | **Switches to Camera scope**; playhead `0`; `paused` | Same |

### Mode-independent transport navigation

```text
Transport navigation is mode-independent.

POV or Observer:
seek / scrub / step / node-boundary seek
→ may pause active playback
→ then seek
```

This **specifically supersedes P11.2's playing-POV seek refusal**. Visitor/POV
refusal remains for **document/framing mutation**, not transport navigation.
Implementation splits the seam: `requestTransportPause()` is session transport
and may pause either mode; `requestAuthoringPause()` and framing mutation gates
remain responsible for document/framing writes.

---

## §5 — Truthful lane projections (one shell)

The five canonical lanes provide one consistent presentation shell. The
timeline never fabricates keys or curves where the runtime engine has none.

```text
┌──────────────┬──────────────────────────────┬─────────────────────────────┐
│ Lane         │ Sequence scope               │ Edge scope                  │
├──────────────┼──────────────────────────────┼─────────────────────────────┤
│ Camera Path  │ Full sequence spline/timing  │ Selected connection path    │
│ Shots        │ Sequence shot projections    │ Quiet / no independent data │
│ FOV          │ Truthful evaluation projection│ Truthful evaluation proj.  │
│ Look At      │ Truthful evaluation projection│ Truthful evaluation proj.  │
│ Roll         │ Quiet (unless authored)      │ Quiet (unless authored)     │
└──────────────┴──────────────────────────────┴─────────────────────────────┘
```

- **Camera scope (static):** static presentation of authored FOV / Look-At;
  temporal tracks and ruler intervals are omitted. No fake temporal keys.
- **Presentation time domains:** stored playhead remains normalized `[0, 1]`,
  while the ruler/timecode maps that progress into the active scope's seconds:

```text
Sequence scope presentation: 0s → sequenceDurationSeconds
Edge scope presentation:     0s → selectedTraversalDurationSeconds
Camera scope:                no temporal domain
```

Edge scope is **not a zoomed window into Sequence time**. `01.20 / 04.20`
means 1.2 seconds into that selected edge traversal. Every rendered Edge-scope
lane element uses the same Edge-local mapping. Anything that cannot truthfully
project into Edge-local coordinates stays quiet. **Never render global Sequence
lane positions under an Edge-local ruler.** This retains the shipped
mixed-time-domain safety invariant while allowing truthful Edge-local lane
projection in the one shell.

---

## §6 — Shell & dock geometry

The shell must remain visually stable across scopes and POV/Observer changes,
without making controls unreachable at narrow widths.

- **Expanded header height:** hard-fixed `36px`; collapsed temporal chrome is
  one integrated `48px` mini-player, not a 36px header plus second row.
- **Header layout:** `display: flex; align-items: center; white-space: nowrap;`
  with no vertical wrapping.
- **Dock heights:** collapsed `48px` total; expanded `288px` default (36px
  header + ruler + five lane tracks). The collapsed temporal state is one
  integrated mini-player within that budget, with no second scrubber row. It
  contains one Scope selector, Previous/Play-Pause/Next node
  navigation, timecode, POV/Observer, Center/Recenter, Follow, and
  expand/collapse. It has no Repeat, loop, Replay, Target Lock, Follow Path, or
  track lock/visibility controls. Idle and Camera remain quiet/static.
- **Full-inline / compact threshold:** the existing `44rem` shell breakpoint is
  the initial compact-layout boundary. `>= 44rem` targets the full inline
  anatomy; `< 44rem` uses compression/overflow rules below. This is a layout
  breakpoint, not permission to make smaller widths inoperable.

### Expanded header anatomy (36px fixed, no-wrap)

```text
│ [🎞 Sequence ▾] │ |◀ ▶/⏸ ▶| 00:04.20 / 00:18.00 │ [🎥 POV | 👁 Observer ⌖ ⛶] │ [⚠️ Gap] │ [… ⤢] │
```

1. **Left zone — scope & view mode:** contextual Scope pill; POV/Observer
   segmented control. Observer `Follow` / `Recenter` use reserved inline slots
   at full width so mode switching never changes header height.
2. **Center zone — deterministic transport:** Previous camera-node boundary,
   Play/Pause, Next camera-node boundary, and timecode. At-end Play restarts
   from `0` (§2 rule 5). No Repeat, loop, or Replay affordance is shown in the
   amended main editor.
3. **Right zone — presentation & layout:** Center/Recenter and Follow,
   reachable diagnostics where needed, and deck expand/collapse. No Repeat,
   loop, Replay, Target Lock, Follow Path, or track lock/visibility control is
   part of the amended main-editor chrome.

### Narrow-width compression and accessibility

At `< 44rem`, compression happens in this order before anything is clipped:

1. hide secondary descriptive/phase text and shorten/truncate Scope text while
   preserving its accessible name;
2. collapse diagnostics to an icon + tooltip/popover;
3. move secondary layout controls into a reachable `More` menu;
4. move Observer-only `Follow` / `Recenter` into that reachable menu if needed,
   while keeping the POV/Observer mode switch visible;
5. Secondary non-transport controls may move into the same reachable menu
   before primary transport does. Primary Previous/Play/Next and the
   POV/Observer switch remain reachable.

The **always-reachable primary set** is: Scope switcher, POV/Observer mode,
Play/Pause when temporal, timecode when temporal, and deck
collapse/expand. `overflow: hidden` may be used only after responsive
composition; it must never leave a focusable control visually clipped or
keyboard-focusable offscreen. Collapsed controls are unmounted/hidden from the
tab order or moved into the accessible overflow menu.

### Ruler-label action — `+ View Key`

```text
36px header       = scope · mode · transport · time · diagnostic
Dots ruler/action = ticks · lane scrub surface · [+ View Key visible in 3D Sequence]
```

```text
+ View Key
→ Camera 3D only (hidden in Camera Plan)
→ Sequence scope initially
→ hidden in Camera scope
→ Edge support deferred
```

`+ View Key` authors directional FOV/Look-At framing; it does not create a
Camera node. The internal command remains `addViewKeyframeAtPlayhead()`. The
existing Plan/3D `viewMode` already reaches the Timeline Frame/Panel; P12 must
thread/use it through the Ruler/action presentation so Camera Plan never
exposes framing/FOV key authoring.

### S4 execution amendment (2026-08-27)

The freeze is amended before S5 closeout. Owner approved this
timeline-as-scrub-surface direction on 2026-08-27. S4 now includes the designer's
collapsed mini-player and lane-based expanded scrubbing; S5 resumes only after
this amended S4 behavior and its contract tests are complete. No separate plan
number is created. These pins close the live-tree ownership seams:


#### S4.1 — Collapsed mini-player

In the main editor, the collapsed temporal dock becomes an integrated compact
mini-player rather than a separate header plus standalone mini-scrubber row.
It contains only the retained product controls:

- contextual P12 Scope selector: Sequence / explicit Edge / explicit Camera;
- Previous camera-node boundary; Play/Pause; Next camera-node boundary;
- normalized-scope timecode;
- POV / Through Camera and Observer mode switch;
- Center/Recenter and Follow;
- expand/collapse.

The collapsed mini-player may use the designer's floating capsule treatment
within the existing dock region. Its exact pixel treatment is subordinate to
shell constraints and accessibility. It is temporal-only; Camera scope remains
static and idle remains quiet. It does not create Shot scope.

#### S4.2 — Expanded lane-based scrubbing

`EditorCameraTimelineDots.svelte` keeps its existing time ruler above the five
truthful lanes and owns one shared vertical playhead line. The standalone
expanded range input and main-editor playback bar are removed. One grid overlay
spans the track column; its line is pointer-transparent and its draggable head
sits at the ruler/lane boundary. Clicking or dragging empty ruler/lane
background seeks in the active scope's coordinate domain and pauses playback
before evaluation. It never autoplays; only header Play enters `playing`.

Keyframe and framing-envelope drags retain precedence over background scrubbing.
A delegated background handler rejects edges, node/Shot markers, view-key
markers, envelope handles, buttons, context-menu targets, and any
`data-timeline-interactive` descendant before taking pointer capture. Sequence
uses global timeline progress; Edge uses Edge-local progress. Header Play/Pause
and timecode remain the playback authority. The lane scrub surface is not a
second transport.

#### S4.3 — Controls deliberately retained, removed, and reserved

Retained from the designer brief: Previous/Next camera-node navigation,
Play/Pause, POV/Through Camera, Observer, Center/Recenter, Follow, timecode,
scrubbing, and expand/collapse.

Removed from the main-editor contract: Repeat/loop, Replay-specific controls,
Target Lock as a separate state, Follow Path as a separate state, track lock /
visibility controls, Shot as a playback scope, and any frame/keyframe buttons
that are not node-boundary navigation.

`+ View Key` remains visible now under
`viewMode === '3d' && scope === 'sequence'`. It moves into the
ruler-label/action cell so no separate action/playback bar remains. Later design
work may reposition it but may not hide it without another contract change.

These pins close the live-tree ownership seams:

1. **One owner per chrome region.** In the main editor,
   `EditorCameraTimelineFrame.svelte` owns the integrated collapsed/expanded
   chrome: Scope, Previous/Play-Pause/Next node navigation, timecode,
   POV/Observer, Center/Recenter, Follow, collapse/expand, and diagnostics.
   `EditorCameraTimelineDots.svelte` retains the existing time ruler and owns
   the expanded lane scrub surface, one shared playhead overlay/head, and
   visible gated `+ View Key`. Remove its repeated per-lane playhead fragments.
   The main editor stops mounting `EditorCameraTimelineRuler.svelte`; retain it
   unchanged for the relic only. Main-editor Repeat/loop/Replay and mismatched
   inferred controls are removed. Reuse `useCameraTimeline(store)` and existing
   store commands; add no parallel transport/view-mode state.
2. **Idle mode has command semantics, not storage.** The visible idle mode is
   Observer (`director`), matching the contracted idle default. Choosing POV
   from idle enters Sequence **paused** in `visitor` mode at the restored
   Sequence playhead; it does not autoplay. Extend `enterSequenceScope(mode?)`
   only as needed for that explicit choice. With an installed preview, the
   same segmented control calls `setCameraPreviewMode(mode)` and preserves
   scope/playhead. No second persistent mode store.
3. **Collapsed mini-player is temporal-only.** Mount it only for an installed
   Sequence with a valid global timeline or an installed Edge with a valid
   Edge-local timeline; idle and Camera render no temporal mini-player.
   It must contain one native `input[type="range"]` with a scope-specific
   accessible name and a padded `>=24px` hit target. Scrubbing binds to the same
   normalized playhead and `seek` / `seekEdge` commands as the expanded lane
   surface. Its Previous/Play-Pause/Next controls are the same transport
   authority as the expanded header, not a duplicate transport.
4. **Node navigation is not cue navigation.** Add
   `stepCameraNodeBoundary(direction)`: Sequence walks only
   `timeline.nodeBoundaries`; Edge walks only local endpoints `0/1`. It never
   visits view keys, position-part seams, frames, or Shot content. Keep existing
   `stepCameraTimeline()` cue/key semantics separate for any retained keyboard
   shortcut; header Previous/Next use the new command.
5. **Relic stays frozen.** All amended S4 mini-player/lane-scrub composition,
   idle mode entry, `+ View Key` reservation/Plan guard, and Escape-as-pause
   behavior are gated to `!store.isRelic`. `/museum/editor` retains its P11.4
   shell, controls, and stop-on-Escape lifecycle. Shared-file edits require a
   relic regression pin; do not fork a second store or motion path.
6. **Escape changes at the shortcut owner.** In the main editor, preserve the
   §7 order in `hooks/shortcuts.svelte.ts`: active gesture → pending Camera
   command → playing Sequence/Edge pause → normal cancellation. Paused or
   Camera scope is never torn down. Local menu/field Escape that already
   prevents the event keeps precedence. Update main-editor stale copy without
   changing truthful relic copy.

S4 acceptance additionally pins: idle POV installs paused Sequence in visitor
mode; Observer idle stays the director default; header transport is unique;
collapsed Sequence/Edge scrub through their own canonical domains; Camera and
idle have no mini scrubber; `viewMode === '3d' && scope === 'sequence'` is the
only `+ View Key` presentation gate; relic markup and Escape behavior remain
P11.4; `EditorCameraTimelineRuler.svelte` and
`EditorCameraPreviewControls.svelte` have no main-editor caller after the move;
playhead head exposes slider ARIA plus Arrow/Home/End behavior; marker/handle
gestures never fall through to background scrub; timeline scrubbing never
enters `playing`.

---

## §7 — Escape semantics

These semantics apply to the main editor. The relic keeps its frozen P11.4
stop-on-Escape lifecycle per the S4 execution amendment.

```text
Escape priority:
1. cancel active drag/gesture
2. cancel pending Camera command
3. temporal scope + playing → pause at current playhead
4. otherwise normal tool cancellation / Select behavior

Escape NEVER changes PreviewScope.
Escape NEVER resets playhead merely because preview exists.
```

```text
playing temporal preview + Escape → pause · preserve scope · preserve playhead
```

`stopCameraPreview()` remains **internal lifecycle teardown only**: stale target
prune, document replacement where required, leaving Camera domain, project
reset/import, rig restore, and equivalent lifecycle boundaries. Normal Escape
does not call teardown. Copy such as `Stop or press Escape to return` must be
updated because Escape now pauses rather than returns/exits. Edge scope remains
Edge after Escape; returning to Sequence is an explicit scope action.

---

## §8 — Review record

### Designer-brief assessment (2026-08-26)

The canonical spec was assessed against the shipped tree before ratification.
Verified anchors included the P11.2 framing/seek seam, selection-driven P11.3
scope installation, Edge-local ruler, former Edge-only Repeat, lifecycle-only direct
`stopCameraPreview()` callers, and the `+ Camera Key` Plan/3D exposure gap.
Adopted product closures were: sequenced-node static inspection through
Sequence, `+ View Key` placement/guard, Escape-as-pause, mode-independent
transport navigation, strict Edge-local time, and removal of main-editor
Repeat/loop/Replay chrome while preserving the frozen relic.

### Owner closures (product contract)

1. Sequenced nodes never enter Camera scope — static inspection via
   `Sequence → node boundary → paused` (§3).
2. `+ View Key` lives on the ruler/action row and is Camera 3D-only (§6).
3. Main-editor Escape pauses, never destroys scope; `stopCameraPreview()` is
   lifecycle teardown there, while the relic keeps its frozen behavior (§7).
4. Transport navigation is mode-independent; `requestTransportPause()` splits
   transport from mutation gating (§4).
5. Edge scope time is strictly Edge-local (§5).
6. Main-editor Edge Repeat/loop/Replay controls are removed by the S4 amendment;
   `+ View Key` remains visible and code-backed in 3D Sequence.

### Implementation-hardening review (accepted before implementation)

7. **Normalized playhead retained:** canonical progress stays `[0, 1]`; seconds
   are presentation only. This avoids a needless motion-pipeline migration and
   removes `playhead > duration` state (§2/§5).
8. **No duplicate session store:** P12 evolves existing `EditorCameraPreview`
   ownership rather than adding `TimelinePreviewSession` in parallel (§2).
9. **Zero-duration guard:** Play requires `canPlay`; zero-duration temporal
   scope never renders Play (§2).
10. **Live retiming:** timing edits pause first, re-resolve through the canonical
    pipeline, retain normalized/clamped progress, and re-derive seconds (§2).
11. **Loop/replay removal:** Main-editor Repeat/loop/Replay controls are removed
    by amended S4; stale loop UI/state must not leak into the main editor. The
    relic remains frozen.
12. **Direction chooser:** non-adjacent/unsequenced Edge Preview always requires
    explicit `A → B` vs `B → A`; no endpoint-storage-order default (§3).
13. **Responsive accessibility:** fixed 36px/no-wrap never justifies clipped
    focusable controls; compact/overflow priority is explicit (§6).
14. **P12 owns closeout:** P11.5 is already shipped, so P12 itself owns canonical
    doc reconciliation and browser QA (§10).

No open product decision blocks freeze.

---

## §9 — Supersession & migration table

| Prior/shipped pin | Frozen P12 contract | Action |
| :--- | :--- | :--- |
| P11.2 playing-POV seek refusal (`requestFramingPause` in timeline seek seam) | §4 — transport navigation mode-independent | **Supersede**; introduce/use `requestTransportPause()`; migrate seek tests |
| P11.3 selection-driven scope install (node → Camera, edge → Edge) | Laws 2–4 + §4 matrix — selection alone never changes scope | **Supersede**; migrate P11.3 selection-install pins/contracts |
| P11.3 Edge mini-shell: Edge-local ruler with global lanes hidden | Law 1 + §5 one shell with truthful Edge-local projection | **Supersede projection only**; retain Edge-local time-domain invariant |
| P11.4 capsule/dense-row layout | §6 interactive Scope pill + fixed header anatomy | **Supersede** conflicting annex layout rows |
| P11.4 pose-preserving Edge swap (`1 − e`) | §3 Flip resets Edge playhead to `0` | **Supersede**; migrate swap test |
| P11.4 `+ Camera Key`, no Plan/3D guard | §6 `+ View Key`, Camera 3D only | **Rename + guard**; thread/use `viewMode` in Ruler/action row |
| P11.4 Stop removal / lifecycle teardown | §7 main-editor Escape pauses; teardown remains lifecycle-only there; relic stays frozen | **Amend** main-editor Escape copy/shortcut behavior; retain lifecycle teardown |
| P11.4 Edge-only `edgeRepeat` setter | Amended §2/§6 main-editor chrome removes Repeat/loop/Replay | **Supersede UI only**; remove main-editor control and migrate assertions, but retain shared `edgeRepeat` state/API for the frozen relic |
| Complete-state scrub fix | Law 5; binary transport with derived `atEnd` | **Ratify + deepen**; remove stored `complete` transport state |
| P11.4 Replay label on complete; P12 draft `RotateCcw` glyph | §2 single Play control; at-end Play restarts from `0` (rule 5) | **Amend draft**; drop distinct Replay affordance and `showReplayGlyph` |
| P11.3 Edge-lane deferral | §5 truthful Edge-local lane projection | **Adopt deferred item** |
| P11.2 visitor refusal for document/framing writes | §4 mutation refusal remains, transport navigation excluded | **Ratify** |
| Pre-hardening P12 draft: seconds playhead + stored duration | §2 normalized `[0,1]` playhead; seconds/duration derived | **Supersede draft**; preserve existing camera-motion progress semantics |
| Pre-hardening P12 draft: top-level `edgeRepeat` | Amended §2/§3 removes main-editor Repeat chrome | **Supersede UI only**; shared state remains relic-owned and never renders in main Sequence/Edge/Camera |
| Pre-hardening P12 draft: one generic Edge scope-menu action | §3 direct Sequence-adjacent action or explicit two-direction chooser | **Clarify + acceptance-pin** |
| Pre-hardening P12 draft: raw `overflow:hidden` | §6 compact/overflow priority; no clipped focusables | **Harden** |
| P12 freeze: collapsed `48px` incl. integrated mini-scrubber | Amended §6 integrated temporal mini-player within the approved dock budget | **Amend + implement** in S4; preserve one transport authority |
| Pre-hardening P12 closeout assigned to P11.5 | §10 P12 owns reconciliation + browser QA | **Correct ownership**; P11.5 is already shipped |

---

## §10 — Implementation slice split + test map

Slices land on the shipped P11.4 + fixes baseline. Each slice carries named
acceptance coverage; P12 does not introduce a second motion/evaluation engine.

| Slice | Content | Suite |
| :--- | :--- | :--- |
| S1 | Session/FSM model: evolve existing preview state (no parallel store); binary transport (`complete` removed); retain normalized playhead; derive seconds/duration; zero-duration Play guard; Edge-local Repeat invariant; live-retiming behavior | `p12-s1-session-model.test.ts` |
| S2 | Selection matrix (Laws 2–4); Sequence-node seek+pause; explicit Preview Camera only for Unsequenced; explicit Edge entry + non-adjacent direction chooser; `requestTransportPause()` mode-independent seek/scrub/step | `p12-s2-selection-matrix.test.ts` |
| S3 | One-shell truthful Edge-local lane projection; Flip resets Edge playhead to `0`; interactive Scope pill/contextual menu; no global-lane/Edge-ruler mixed domain | `p12-s3-one-shell-lanes.test.ts` |
| S4 | Main-editor 36px expanded header + integrated 48px collapsed mini-player; `Dots`-owned ruler/five-lane playhead scrubbing with no main playback bar; Previous/Next camera-node boundary navigation; retained Play/Pause, POV/Observer, Center/Follow; remove main-editor Repeat/loop/Replay; keep visible gated `+ View Key`; 44rem behavior, accessibility, Escape pause, and relic regression | `p12-s4-header-chrome.test.ts` + amended lane-scrub/transport contracts |
| S5 / closeout | Reconcile canonical docs (`camera-tour.md`, shell specs, Design specs, `CURRENT.md`, tracker wording where needed), migrate superseded P11/P12 contract assertions, and run browser QA across Camera Plan ↔ Camera 3D, Sequence/Edge/Camera scopes, narrow width, POV/Observer, complete/end inspection | contract tests + browser QA checklist |

### S5 execution amendment (2026-08-27)

S5 is reconciliation and QA only: no production behavior, new store/API, or
separate slice brief. Add a new test only if QA exposes an uncovered behavior;
otherwise migrate stale source-contract assertions and rerun the shipped suites.

1. **Exact canonical-doc inventory.** Reconcile
   `docs/components/camera-tour.md`, `docs/components/shell.md`,
   `docs/Design-specs/Design-shell-specs.md`,
   `docs/Design-specs/Shell-camera-workspaces.md`,
   `docs/Design-specs/Design-specs.md`, the still-active
   `docs/plans/2026-08-24-P3B-orientation-preview-affordances.md`,
   `docs/hand-off/CURRENT.md`, and `docs/plans/README.md`. Remove P11 claims
   that ordinary Camera/Edge selection installs scope, distinct Replay chrome,
   Escape tears down the main-editor preview, or timeline zoom ships today.
   Preserve the explicit relic exceptions and P12's no-zoom deferral.
   `docs/plans/model-assessment.md` is explicitly out of scope.
2. **Exact assertion migration.** Update the stale main-editor source contracts
   in `apps/museum/tests/lib/editor/app/contracts.test.ts` (shared-lane
   `EditorCameraPreviewControls` mount, read-only `tour-selector`, and Camera
   preview-controls ownership) and
   `apps/museum/tests/lib/editor/store/p11-s4-compact-controls.test.ts`
   (mode/transport ownership). Main-editor assertions move to
   `p12-s4-header-chrome.test.ts`; retained `EditorCameraPreviewControls`
   assertions become relic-specific. Do not rename still-truthful behavioral
   suites merely because their filenames retain a shipped P8/P11 prefix.
3. **Bounded browser QA — pairwise, not a cross-product.** Run these scenarios:
   - Camera 3D wide: idle Sequence shell is quiet/Observer-default; enter
     Sequence paused, confirm one header transport/timecode and `+ View Key`;
     Play/Pause/Escape preserve scope and playhead, and Play at end restarts.
   - Camera Plan ↔ Camera 3D: preserve scope, mode, transport, playhead,
     selection, height, and collapse state; `+ View Key` is absent in Plan and
     returns only for 3D Sequence.
   - Edge: explicit entry lands paused at `0`; Edge-local ruler/lanes agree;
     Flip resets main-editor playhead, Repeat remains absent, Previous/Next use
     only local endpoints `0/1`, and collapsed mini-player scrubbing seeks the
     Edge domain. Relic QA separately pins its retained Repeat state/control.
   - Camera: explicit Unsequenced preview is static with mode control but no
     transport, timecode, mini scrubber, lanes, or `+ View Key`.
   - Narrow `<44rem`: Scope and `More` menus are keyboard operable, Escape
     closes the local menu before transport handling, focus returns to the
     trigger, primary controls remain visible, and no focusable is clipped.
   - Gap/no-flow: Sequence diagnostic is truthful; a valid selected Edge still
     previews independently of the unavailable global timeline.
   - `/museum/editor`: P11.4 shell/controls, pose-preserving Flip, and
     stop-on-Escape remain frozen.
   - `/museum`: no editor/timeline UI and no editor modules in visitor chunks.
4. **Verification gate.** Rerun P12 S1–S4, the migrated P11 source contracts,
   the interaction matrix, full Vitest, `npm run check`, and `npm run build`.
   Record exact totals plus the browser checklist result in `CURRENT.md`.
   Grep the canonical-doc inventory for stale selection→scope, distinct
   Replay, main-editor Escape teardown, and current timeline-zoom claims; all
   matches must be removed or rewritten to the P12/relic truth.
5. **Closeout lifecycle.** After all gates pass, move the P12 freeze and P12
   slice briefs from `docs/plans/` to `docs/archive/plans/`; replace the tracker
   row with a one-line shipped archive stub; reduce `CURRENT.md` to its required
   sliding window (P12 closeout plus one previous pointer) and set the next
   registered action as the single next action — none is registered: P12 and
   P3B are the hard gate (owner 2026-08-27), so the next action is the P3B QA
   tail closeout. Do not commit unless the owner asks.

### Required acceptance pins

At minimum, the slice suites explicitly cover:

- zero-duration temporal scope: `canPlay=false`, `atEnd=false`, no Play
  affordance (transport quiet/disabled);
- Play-at-end: paused at `playhead=1` exposes the accessible Play control;
  activating it resets playhead to `0`, allocates a fresh run ID, and enters
  `playing`;
- live retiming: normalized playhead remains within `[0,1]`, seconds re-derive,
  preview re-resolves/re-evaluates through existing pipeline;
- main-editor Repeat/loop and Replay controls are absent; no stale loop state is exposed outside any future explicitly approved scope;
- Sequence-adjacent Preview Edge uses predecessor → successor;
- non-adjacent/unsequenced Preview Edge requires an explicit two-direction
  choice and never falls back to endpoint storage order;
- sequenced node click seeks + pauses only while Sequence scope is active;
- the same seek/scrub/step behavior works in POV and Observer;
- Edge ruler and Edge lanes share one Edge-local time mapping;
- expanded lane/ruler click-drag scrubs through the active scope and the draggable playhead head is keyboard-accessible;
- Previous/Next move to previous/next camera-node boundaries, not frames or arbitrary keyframes;
- main-editor chrome has no Repeat/loop or Replay controls; `+ View Key` remains visible and code-backed in 3D Sequence;
- no focusable header control is clipped/offscreen at compact widths;
- the collapsed temporal dock renders the integrated mini-player within the
   approved dock budget, with one Play/Pause authority and no duplicate transport;
- the expanded dock removes the standalone range scrubber and uses the five-lane
   timeline/playhead head as its scrub surface;
- idle (`cameraPreview === null`) presents the Sequence shell with quiet
  transport; Camera-domain enter/leave and project reset/import return to
  idle deterministically;
- Camera Plan never exposes `+ View Key`; Camera 3D Sequence scope does;
- main-editor Escape pauses a playing temporal preview without changing
  scope/playhead; relic Escape retains P11.4 teardown;
- P12 closeout leaves no canonical doc describing superseded selection-driven
  scope installation or the removed main-editor Repeat/loop/Replay chrome.

---

## §11 — Freeze baseline

P12 is implemented on top of the shipped P11.4 + complete-state scrub and
mode-toggle normalization baseline. Existing useful machinery remains the
starting point: one Camera preview FSM, run-id/captured-route invalidation,
normalized motion progress, Edge-local ruler support, relic-owned Edge Repeat, the
single Camera timeline shared across Plan/3D, and the one canonical
`camera-route.ts` / `camera-motion.ts` pipeline.

P12 intentionally replaces the conflicting P11 interaction contracts named in
§9, then closes itself through §10 S5. No P11 follow-up owns P12 reconciliation.
