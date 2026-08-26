# P12 — Camera Timeline / Preview contract freeze (ratified specification)

**Status:** `approved` — ratified & frozen 2026-08-26. Implementation slices
follow; the plan is the contract, not the work breakdown.
**Tracker:** [`README.md`](README.md) — **P12**, depends on: P11.
**Placement:** the independent designer review of the P11 UX findings produced
the canonical specification below; the owner closed six review items and one
extra freeze blocker. This doc piles the specification, the closures, and the
review record into one ratifiable contract. It **intentionally supersedes** the
conflicting P11.2/P11.3/P11.4 rows in §9; P11.5 (regression/contract
reconciliation) reconciles the shipped P11 surface to this contract.
**Baseline:** the uncommitted P11.4 slice + the complete-state scrub fix and
mode-toggle row fix land first, then P12 slices migrate onto that baseline.

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

Transport is strictly binary; temporal capabilities derive from the active
scope. **Ratified amendment 6:** the generic `loop` flag is replaced by
Edge-only `edgeRepeat` — Sequence looping is derived from authored tail↔head
topology and must never be duplicated as session truth.

```ts
// Canonical session state (pure session truth, never serialized to project)
type PreviewScope =
  | { type: 'sequence' }
  | {
      type: 'edge';
      edgeId: string;
      fromNodeId: string;
      toNodeId: string;
    }
  | { type: 'camera'; nodeId: string };

type TransportState = 'playing' | 'paused'; // no 'complete' state

interface TimelinePreviewSession {
  scope: PreviewScope;
  transport: TransportState;
  playhead: number;       // active-scope evaluation time in SECONDS
  duration: number;       // active-scope duration (0 for Camera scope)
  edgeRepeat: boolean;    // meaningful only for Edge scope
  viewMode: 'pov' | 'observer';
  observerFollow: boolean;
}
```

### Derived transport capabilities

```ts
const isTemporal = scope.type !== 'camera';
const atEnd = isTemporal && playhead >= duration;
const canPlay = isTemporal && duration > 0;
const showReplayGlyph = isTemporal && transport === 'paused' && atEnd;
```

### Transport & inspection rules

1. **Camera scope (static):** `isTemporal === false`; `playhead = 0`,
   `duration = 0`, `transport = 'paused'`. Play, Replay, Loop, and Scrub are
   inactive. The bar presents authored static pose framing.
2. **Temporal scopes (Sequence | Edge):**
   - `transport === 'playing'` → render **Pause**
   - `transport === 'paused' && !atEnd` → render **Play**
   - `showReplayGlyph === true` → render **Replay** (`RotateCcw`)
3. **Inspection freedom (Law 5):** reaching `t = duration` sets
   `transport = 'paused'` (derived `atEnd`; no stored `complete` state).
   Scrubber drag, step backward/forward (`[` / `]`), and jump to start (`|◀`)
   stay fully interactive. Dragging the scrubber sets `playhead = t_drag` and
   triggers immediate camera pose evaluation.

---

## §3 — Scope model & traversal direction semantics

The scope selector is an explicit contextual switcher. Graph topology stays
**strictly undirected**. **Ratified amendment 1:** `Preview Camera` is
available only for a selected **Unsequenced** camera.

```text
Scope menu contents:
┌────────────────────────────────────────────────────────┐
│ 🎞 Sequence (Full Tour)                                │
│ ────────────────────────────────────────────────────── │
│ ⇄ Preview Edge [Node A → Node B]  (if Edge is selected)│
│ 📷 Preview Camera [Camera U]       (if Unsequenced node)│
└────────────────────────────────────────────────────────┘
```

### Invariants

1. **Explicit endpoints:** Edge traversal is `fromNodeId` + `toNodeId`, both
   verified as valid endpoints of `edgeId`. No stored canonical "forward" in
   graph topology.
2. **Direction defaulting:** a Sequence-adjacent edge defaults to
   `Sequence predecessor → Sequence successor`; an unsequenced connection
   requires an explicit direction choice (`Node A → Node B` vs `B → A`).
3. **Flip traversal:** `[⇄ Flip]` swaps `fromNodeId`/`toNodeId` in session
   state and **resets edge playhead to `0.00s`**, without altering the
   underlying undirected connection. **Migration note:** this supersedes the
   P11.4 pinned pose-preserving swap (`1 − e` playhead flip, p11-s4 test
   `0.3 → 0.7`) — the frozen Flip deliberately drops the physical pose.
4. **Contextual menu:** the scope dropdown contains `Sequence` at all times
   plus contextual entries for the selected edge / unsequenced camera node. It
   is not a persistent project catalog.

### Sequenced vs Unsequenced inspection (amendment 1 pin)

```text
Sequenced camera
→ static inspection = Sequence scope at its node boundary
→ Camera scope unavailable

Unsequenced camera
→ no Sequence timestamp
→ Preview Camera enters static Camera scope
```

Canonical motion guarantees node poses exactly at transition endpoints, so a
sequenced node's authored framing is exactly inspectable via
`Sequence → seek(t_node) → paused`. This intentionally supersedes the older
"Preview Camera works for every camera" UI grammar — no second way to inspect
the same sequenced pose.

---

## §4 — Selection, scope, and seeking matrix

Viewport selection across Camera Plan / Camera 3D is a shared session
identity. Playhead seeking obeys the active scope's coordinate space.

| User interaction | Selection result | Active scope `Sequence` | Active scope `Edge` or `Camera` |
| :--- | :--- | :--- | :--- |
| **Click Sequenced Node C** *(evaluable `t_C`)* | Selects Node C | Seeks to `t_C`; sets `paused` | **Selection only**; scope/playhead/transport unchanged |
| **Click Sequenced Node C** *(post-gap / malformed)* | Selects Node C | Seeks to last evaluable boundary; exposes `[⚠️ Stops @ Node X]` | **Selection only**; unchanged |
| **Click Edge E** | Selects Edge E | **Selection only**; unchanged | **Selection only**; unchanged |
| **Click Unsequenced Node U** | Selects Node U | **Selection only**; unchanged | **Selection only**; unchanged |
| **Explicit Preview Edge** | Selects Edge E | **Switches to Edge scope**; playhead `0.00s`; `paused` | **Switches to Edge scope**; playhead `0.00s`; `paused` |
| **Explicit Preview Camera** *(unsequenced only)* | Selects Node U | **Switches to Camera scope**; `paused` | **Switches to Camera scope**; `paused` |

### Mode-independent transport navigation (amendment 4 pin)

```text
Transport navigation is mode-independent.

POV or Observer:
seek / scrub / step / node-boundary seek
→ may pause active playback
→ then seek
```

This **specifically supersedes P11.2's playing-POV seek refusal**. The visitor
refusal is kept for **document/framing mutation**, never for transport
navigation. Implementation splits the seam: `requestTransportPause()` (session
transport — may pause either camera) for the seek/scrub/step path; the
existing `requestAuthoringPause()` / framing predicates stay on
document/framing writes while playing.

---

## §5 — Truthful lane projections (one shell)

The five canonical lanes provide one consistent presentation shell. The
timeline never fabricates keyframes or mock curves where the backing runtime
engine has none.

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

- **Node scope (static):** static presentation of authored FOV / Look-At at
  `t = 0.00s`; temporal tracks and ruler intervals omitted; shell stable.
- **Edge time domain (amendment 5 pin, hard):**

```text
Sequence scope: time domain = 0 → sequenceDuration
Edge scope:     time domain = 0 → selectedTraversalDuration
Camera scope:   no temporal domain
```

  Edge scope is **not a zoomed window into Sequence time**. `01.20 / 04.20`
  means 1.2s into that edge traversal. Every rendered Edge-scope lane element
  uses the same local domain; anything that cannot truthfully project into
  edge-local coordinates stays quiet. **Never render global Sequence lane
  positions under an edge-local ruler.** (Ratifies the shipped mixed-domain
  invariant — P11.3 §4 — and promotes its deferred edge-local lane projection
  into the one shell.)

---

## §6 — Shell & dock geometry

Prevents dock jumping and layout thrashing across view-mode changes.

- **Header height:** hard-fixed `36px`.
- **Header layout:** `display: flex; align-items: center; white-space: nowrap;
  overflow: hidden;`
- **Dock heights:** collapsed `48px` total (header + integrated mini-scrubber);
  expanded `288px` default (header + ruler + 5 lane tracks).

### Header anatomy (36px fixed, no-wrap)

```text
│ [🎞 Sequence ▾] │ [🎥 POV | 👁 Observer ⌖ ⛶] │ |◀ ▶/⏸/RotateCcw [🔁] 00:04.20 / 00:18.00 │ [⚠️ Stops @ Node 3] │ [zoom ⤢ ▾] │
```

1. **Left zone — scope & view mode:** scope pill `[🎞 Sequence ▾]` (contextual
   switcher); view-mode segment `[🎥 POV | 👁 Observer]`; Observer tools
   `Follow ⌖` / `Recenter ⛶` occupy **dedicated inline slots** next to Observer
   mode — reserved, never wrapping, never changing dock height (this resolves
   the P11.4 mode-toggle bar-resize finding by contract).
2. **Center zone — deterministic transport:** jump-to-start `|◀`,
   Play/Pause/Replay, and timecode. `🔁` is the **Edge-only Repeat control**
   (amendment 6): Sequence shows its **derived loop status/readout** only,
   Camera shows neither.
3. **Right zone — diagnostics & layout:** `[⚠️ Stops @ Node 3]` inline
   (no dedicated banner row); compact zoom + deck expand/collapse `⤢`.

### Action row (amendment 2 pin)

```text
36px header    = scope · mode · transport · time · diagnostic
Ruler/action   = ticks · scrubber · [+ View Key]
```

```text
+ View Key
→ Camera 3D only (hidden in Camera Plan)
→ Sequence scope initially; hidden in Camera scope
→ Edge support deferred
```

`+ View Key` authors directional FOV/Look-At framing (the controller already
owns directional view-keyframe authoring); it does not author a camera node.
The internal command name stays `addViewKeyframeAtPlayhead()`. The current
Plan/3D view must be threaded into timeline presentation to enforce the
Camera-Plan hiding rule.

---

## §7 — Escape semantics (amendment 3 pin)

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

`stopCameraPreview()` remains **internal lifecycle teardown only** (stale
target prune, document replacement where required, leaving the Camera domain,
project reset/import), never normal Escape behavior. Stale copy such as
`Stop or press Escape to return` (Workspace3DView / EditorViewport banners) is
updated. Edge scope stays Edge after Escape — returning to Sequence is an
explicit scope choice.

---

## §8 — Review record

### Designer-brief assessment (2026-08-26)

The canonical spec was assessed against the shipped tree before ratification.
Verified anchors: `requestFramingPause()` visitor refusal
(`editor-store.svelte.ts:1251`), the seek seam
(`camera-timeline-controller.svelte.ts:203`), selection-driven scope install
(`selection-actions.svelte.ts:273`), `edgeRepeat` edge-only refusal (p11-s4
pin), edge-local ruler + hidden lanes (P11.3 §4), `stopCameraPreview()`
callers all lifecycle (stale prune / leave-domain / document replace / rig
restore), and the `+ Camera Key` absence of a Plan/3D guard. Findings adopted:
POV seek supersession (the one genuine P11.2 contract break), `+ View Key`
viewMode guard gap, Escape copy updates, and the sequence-loop blocker.

### Owner closures (all six ratified)

1. Sequenced nodes never enter Camera scope — static inspection via
   `Sequence → node boundary → paused` (§3).
2. `+ View Key` on the ruler/action row, Camera 3D only (§6).
3. Escape pauses, never destroys scope; `stopCameraPreview()` is lifecycle
   teardown (§7).
4. Transport navigation is mode-independent; `requestTransportPause()` split
   (§4).
5. Edge scope time is strictly edge-local (§5).
6. `edgeRepeat` is Edge-only; Sequence loop status is derived, never session
   truth (§2).

No open product decision blocks freeze.

---

## §9 — Supersession & migration table

| Shipped pin | Frozen contract | Action |
| :--- | :--- | :--- |
| P11.2 playing-POV seek refusal (`requestFramingPause` in `#canSeekCameraTimeline`; "pinned Through Camera behavior") | §4 amendment 4 — transport navigation mode-independent | **Supersede**; introduce `requestTransportPause()`; migrate p8-s4 / p11-s3 seek tests |
| P11.3 selection-driven scope install (node click → Camera scope; edge click → Edge scope; §10 projection table) | Laws 2–4 + §4 matrix — selection only; explicit scope entries | **Supersede**; migrate p11-s3 (16) selection-install pins + contracts |
| P11.3 Edge mini-shell (edge-local ruler, five-lane Dots hidden) | Law 1 + §5 — one shell, edge-local lane projection | **Supersede projection**; keep the local-time-domain invariant (amendment 5 ratifies it) |
| P11.4 capsule + dense-row annex (scopeCapsule, PreviewControls grid, annex §11.3 rows) | §6 header anatomy + scope pill | **Supersede** annex layout rows; capsule becomes the interactive scope pill |
| P11.4 swap pose preservation (`1 − e` flip; p11-s4 `0.3 → 0.7` pin) | §3 Flip — swaps endpoints, playhead resets to `0.00s` | **Supersede**; migrate the p11-s4 swap test |
| P11.4 `+ Camera Key` label; no Plan/3D guard | §6 amendment 2 — `+ View Key`, Camera 3D only | **Rename + guard**; thread viewMode into the Ruler |
| P11.4 Stop removal: "Escape/lifecycle teardown" | §7 — Escape pauses, never stops; copy updates | **Amend**; Escape handler + banner copy |
| P11.4 `edgeRepeat` edge-only (setter refuses in Sequence scope) | §2 amendment 6 | **Ratifies** — no change |
| Complete-state scrub fix (complete = paused-equivalent in seek/scrub gates, shipped 2026-08-26) | Law 5 — and deepens: `complete` state removed, derived `atEnd` | **Ratifies**; deepens to binary transport |
| P11.3 §4 edge-lane deferral ("edge-local lane projection deferred") | §5 edge-lane projection promoted | **Adopts the deferred item** |
| P11.2 visitor refusal for document/framing writes while playing | §4 — kept for mutation only, not transport | **Ratifies** (unchanged scope) |

---

## §10 — Implementation slice split + test map

Slices land after the P11.4 + fixes baseline commits; each slice carries its
own named suite:

| Slice | Content | Suite |
| :--- | :--- | :--- |
| S1 | Session-state model: binary transport (`complete` removed, derived `atEnd`), seconds playhead, `edgeRepeat` field, scope `type` union | `p12-s1-session-model.test.ts` |
| S2 | Selection matrix: selection-only outside Sequence (Laws 2–4), Sequence-node seek+pause, explicit scope entries, `requestTransportPause()` split | `p12-s2-selection-matrix.test.ts` |
| S3 | One-shell edge lane projection (edge-local domain), Flip semantics (playhead reset), scope pill + contextual menu | `p12-s3-one-shell-lanes.test.ts` |
| S4 | Header anatomy (36px), collapsed mini-scrubber (48px), reserved Observer slots, `+ View Key` rename + Plan/3D guard, Escape behavior + copy | `p12-s4-header-chrome.test.ts` |

Contract reconciliation (docs: camera-tour, shell specs, Design specs,
CURRENT.md) and browser QA close under **P11.5**, not per-slice.

---

## §11 — Freeze baseline (working tree at ratification)

At ratification the working tree holds the uncommitted P11.4 slice (segmented
mode, icon-only transport, swap/repeat wiring, Stop removal, mount
disposition) plus the two shipped bug fixes (complete-state scrub; mode-toggle
row normalization). The diff was assessed against this contract: three items
align with it (Stop removal → §7 lifecycle; Repeat edge-only → §2; edge-local
ruler → §5) and five are superseded by it (§9 rows 2–6). Freeze is therefore
unblocked: P11.4 + fixes land as the baseline, then §10 slices migrate.
