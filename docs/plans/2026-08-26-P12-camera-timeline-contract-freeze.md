# P12 — Camera Timeline / Preview contract freeze (ratified specification)

**Status:** `approved` — ratified & frozen 2026-08-26. Implementation slices
follow; the plan is the contract, not the work breakdown.
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
to seconds merely to render timecode.

Sequence looping remains derived from authored tail↔head topology and is never
duplicated as session truth. Edge Repeat is local to Edge scope only.

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
const showReplayGlyph = canPlay && transport === 'paused' && atEnd;
const currentSeconds = isTemporal ? playhead * durationSeconds : 0;
```

### Transport & inspection rules

1. **Camera scope (static):** `isTemporal === false`; `playhead = 0`,
   `transport = 'paused'`. Play, Replay, Repeat, and Scrub are inactive. The bar
   presents authored static pose framing.
2. **Temporal scopes (Sequence | Edge):**
   - `transport === 'playing'` → render **Pause**
   - `transport === 'paused' && canPlay && !atEnd` → render **Play**
   - `showReplayGlyph === true` → render **Replay** (`RotateCcw`)
3. **Zero-duration temporal scope:** `canPlay === false`, `atEnd === false`, and
   Replay is never shown. Transport stays quiet/disabled while the valid static
   boundary remains inspectable. This is acceptance-pinned.
4. **Inspection freedom (Law 5):** reaching normalized `playhead = 1` on a
   playable temporal scope sets `transport = 'paused'`; `atEnd` is derived, not
   stored. Scrubber drag, step backward/forward (`[` / `]`), and jump to start
   (`|◀`) remain interactive. Dragging the scrubber pauses and evaluates the
   camera at the new normalized progress.
5. **Replay:** activating Play while `atEnd` first resets normalized playhead to
   `0`, then enters `playing`.

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
6. **Edge Repeat ownership:** Repeat exists only while `scope.type === 'edge'`.
   Leaving Edge scope clears/discards it; reads outside Edge are false. Sequence
   never gains a session repeat flag.

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
| **Click Sequenced Node C** *(post-gap / malformed)* | Selects Node C | Seeks to last evaluable boundary; exposes `[⚠️ Stops @ Node X]` | **Selection only**; unchanged |
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

- **Header height:** hard-fixed `36px`.
- **Header layout:** `display: flex; align-items: center; white-space: nowrap;`
  with no vertical wrapping.
- **Dock heights:** collapsed `48px` total (header + integrated mini-scrubber);
  expanded `288px` default (header + ruler + five lane tracks).
- **Full-inline / compact threshold:** the existing `44rem` shell breakpoint is
  the initial compact-layout boundary. `>= 44rem` targets the full inline
  anatomy; `< 44rem` uses compression/overflow rules below. This is a layout
  breakpoint, not permission to make smaller widths inoperable.

### Header anatomy (36px fixed, no-wrap)

```text
│ [🎞 Sequence ▾] │ [🎥 POV | 👁 Observer ⌖ ⛶] │ |◀ ▶/⏸/RotateCcw [🔁] 00:04.20 / 00:18.00 │ [⚠️ Stops @ Node 3] │ [zoom ⤢ ▾] │
```

1. **Left zone — scope & view mode:** contextual Scope pill; POV/Observer
   segmented control. Observer `Follow` / `Recenter` use reserved inline slots
   at full width so mode switching never changes header height.
2. **Center zone — deterministic transport:** jump-to-start,
   Play/Pause/Replay, and timecode. `🔁` is **Edge-only Repeat**. Sequence shows
   derived loop status/readout only; Camera shows neither.
3. **Right zone — diagnostics & layout:** inline Sequence diagnostic, compact
   zoom, and deck expand/collapse.

### Narrow-width compression and accessibility

At `< 44rem`, compression happens in this order before anything is clipped:

1. hide secondary descriptive/phase text and shorten/truncate Scope text while
   preserving its accessible name;
2. collapse diagnostics to an icon + tooltip/popover;
3. move zoom and other secondary layout controls into a reachable `More` menu;
4. move Observer-only `Follow` / `Recenter` into that reachable menu if needed,
   while keeping the POV/Observer mode switch visible;
5. Edge Repeat may move into the same menu before primary transport does.

The **always-reachable primary set** is: Scope switcher, POV/Observer mode,
Play/Pause/Replay when temporal, timecode when temporal, and deck
collapse/expand. `overflow: hidden` may be used only after responsive
composition; it must never leave a focusable control visually clipped or
keyboard-focusable offscreen. Collapsed controls are unmounted/hidden from the
tab order or moved into the accessible overflow menu.

### Action row — `+ View Key`

```text
36px header  = scope · mode · transport · time · diagnostic
Ruler/action = ticks · scrubber · [+ View Key]
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

---

## §7 — Escape semantics

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
scope installation, Edge-local ruler, Edge-only Repeat, lifecycle-only direct
`stopCameraPreview()` callers, and the `+ Camera Key` Plan/3D exposure gap.
Adopted product closures were: sequenced-node static inspection through
Sequence, `+ View Key` placement/guard, Escape-as-pause, mode-independent
transport navigation, strict Edge-local time, and Edge-only Repeat.

### Owner closures (product contract)

1. Sequenced nodes never enter Camera scope — static inspection via
   `Sequence → node boundary → paused` (§3).
2. `+ View Key` lives on the ruler/action row and is Camera 3D-only (§6).
3. Escape pauses, never destroys scope; `stopCameraPreview()` is lifecycle
   teardown (§7).
4. Transport navigation is mode-independent; `requestTransportPause()` splits
   transport from mutation gating (§4).
5. Edge scope time is strictly Edge-local (§5).
6. Edge Repeat is Edge-only; Sequence loop status is derived topology (§2/§6).

### Implementation-hardening review (accepted before implementation)

7. **Normalized playhead retained:** canonical progress stays `[0, 1]`; seconds
   are presentation only. This avoids a needless motion-pipeline migration and
   removes `playhead > duration` state (§2/§5).
8. **No duplicate session store:** P12 evolves existing `EditorCameraPreview`
   ownership rather than adding `TimelinePreviewSession` in parallel (§2).
9. **Zero-duration guard:** Replay requires `canPlay`; zero-duration temporal
   scope never renders Replay (§2).
10. **Live retiming:** timing edits pause first, re-resolve through the canonical
    pipeline, retain normalized/clamped progress, and re-derive seconds (§2).
11. **Repeat locality:** Repeat is represented as Edge-local conceptual truth or
    equivalently reset/read-false outside Edge; stale Repeat cannot leak into
    Sequence/Camera (§2/§3).
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
| P11.4 Stop removal / lifecycle teardown | §7 Escape pauses; teardown remains lifecycle-only | **Amend** Escape copy/shortcut behavior; retain lifecycle teardown |
| P11.4 Edge-only `edgeRepeat` setter | §2/§3 Repeat remains Edge-only | **Ratify + harden** stale-state invariant |
| Complete-state scrub fix | Law 5; binary transport with derived `atEnd` | **Ratify + deepen**; remove stored `complete` transport state |
| P11.3 Edge-lane deferral | §5 truthful Edge-local lane projection | **Adopt deferred item** |
| P11.2 visitor refusal for document/framing writes | §4 mutation refusal remains, transport navigation excluded | **Ratify** |
| Pre-hardening P12 draft: seconds playhead + stored duration | §2 normalized `[0,1]` playhead; seconds/duration derived | **Supersede draft**; preserve existing camera-motion progress semantics |
| Pre-hardening P12 draft: top-level `edgeRepeat` | §2/§3 Edge-local Repeat truth | **Supersede draft**; no stale Sequence/Camera Repeat |
| Pre-hardening P12 draft: one generic Edge scope-menu action | §3 direct Sequence-adjacent action or explicit two-direction chooser | **Clarify + acceptance-pin** |
| Pre-hardening P12 draft: raw `overflow:hidden` | §6 compact/overflow priority; no clipped focusables | **Harden** |
| Pre-hardening P12 closeout assigned to P11.5 | §10 P12 owns reconciliation + browser QA | **Correct ownership**; P11.5 is already shipped |

---

## §10 — Implementation slice split + test map

Slices land on the shipped P11.4 + fixes baseline. Each slice carries named
acceptance coverage; P12 does not introduce a second motion/evaluation engine.

| Slice | Content | Suite |
| :--- | :--- | :--- |
| S1 | Session/FSM model: evolve existing preview state (no parallel store); binary transport (`complete` removed); retain normalized playhead; derive seconds/duration; zero-duration Play/Replay guard; Edge-local Repeat invariant; live-retiming behavior | `p12-s1-session-model.test.ts` |
| S2 | Selection matrix (Laws 2–4); Sequence-node seek+pause; explicit Preview Camera only for Unsequenced; explicit Edge entry + non-adjacent direction chooser; `requestTransportPause()` mode-independent seek/scrub/step | `p12-s2-selection-matrix.test.ts` |
| S3 | One-shell truthful Edge-local lane projection; Flip resets Edge playhead to `0`; interactive Scope pill/contextual menu; no global-lane/Edge-ruler mixed domain | `p12-s3-one-shell-lanes.test.ts` |
| S4 | 36px header + 48px collapsed dock; 44rem compact behavior and accessible overflow priority; reserved Observer slots; `+ View Key` rename + Camera Plan guard; Escape pause + stale-copy migration | `p12-s4-header-chrome.test.ts` |
| S5 / closeout | Reconcile canonical docs (`camera-tour.md`, shell specs, Design specs, `CURRENT.md`, tracker wording where needed), migrate superseded P11 contract assertions, and run browser QA across Camera Plan ↔ Camera 3D, Sequence/Edge/Camera scopes, narrow width, POV/Observer, complete/end inspection | contract tests + browser QA checklist |

### Required acceptance pins

At minimum, the slice suites explicitly cover:

- zero-duration temporal scope: `canPlay=false`, `atEnd=false`, no Replay;
- live retiming: normalized playhead remains within `[0,1]`, seconds re-derive,
  preview re-resolves/re-evaluates through existing pipeline;
- Repeat cannot persist/read true in Sequence or Camera scope;
- Sequence-adjacent Preview Edge uses predecessor → successor;
- non-adjacent/unsequenced Preview Edge requires an explicit two-direction
  choice and never falls back to endpoint storage order;
- sequenced node click seeks + pauses only while Sequence scope is active;
- the same seek/scrub/step behavior works in POV and Observer;
- Edge ruler and Edge lanes share one Edge-local time mapping;
- no focusable header control is clipped/offscreen at compact widths;
- Camera Plan never exposes `+ View Key`; Camera 3D Sequence scope does;
- Escape pauses a playing temporal preview without changing scope/playhead;
- P12 closeout leaves no canonical doc describing superseded selection-driven
  scope installation.

---

## §11 — Freeze baseline

P12 is implemented on top of the shipped P11.4 + complete-state scrub and
mode-toggle normalization baseline. Existing useful machinery remains the
starting point: one Camera preview FSM, run-id/captured-route invalidation,
normalized motion progress, Edge-local ruler support, Edge-only Repeat, the
single Camera timeline shared across Plan/3D, and the one canonical
`camera-route.ts` / `camera-motion.ts` pipeline.

P12 intentionally replaces the conflicting P11 interaction contracts named in
§9, then closes itself through §10 S5. No P11 follow-up owns P12 reconciliation.
