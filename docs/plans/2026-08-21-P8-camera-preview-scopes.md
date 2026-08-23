# P8 — Camera preview scopes (Preview Camera · Preview Edge · Preview Sequence)

**Date:** 2026-08-21
**Status:** Approved — scheduled **ahead of P2** (scope decision 2026-08-21,
see §E); design decisions locked in §D
**Tracker:** [`docs/plans/README.md`](README.md) — **P8**, depends on: P1
**Source:** dual-engineer design brief + codebase audit (2026-08-21), refining
the P1.8-era preview model. Line references verified against the tree on
2026-08-21; re-grep at implementation time.

## A. Outcome

The editor gains three explicit, unambiguous preview scopes for camera authoring:

1. **Preview Camera** — static pose from a camera node's stored position /
   target / FOV. Works for Sequenced *and* Unsequenced nodes.
2. **Preview Edge** — movement across **one selected connection direction**
   (`A → B` or `B → A`). Becomes the primary local authoring preview. Works for
   any real connection, including edges whose endpoint is Unsequenced
   (`C → E` where E ∉ Sequence must preview and be authorable).
3. **Preview Sequence** — explicit whole-Sequence playback composing the same
   edge primitive across all currently Sequenced cameras, with full global
   timeline editing (scrub anywhere, seek to node boundaries, play/pause/
   stop/replay).

Core invariant: **editor preview = runtime motion truth.** Scrubbing and
playback sample the identical canonical sampler; the same connection must not
move differently depending on which preview path invokes it.

### Out of scope (explicit non-goals)

- **Roll data model, shot clips, shot playback lanes** — lanes may be visually
  reserved; no data, codec, or sampling work. Own feature slices later.
- **Per-keyframe `holdSeconds` / per-keyframe `easing` semantics change** —
  fields exist in types; effective use is deferred, not redesigned here.
- **New branch playback system** — §10 requirement is only "any real
  connection can be locally previewed". Future multi-edge branch playback
  (e.g. `C → E → F → D`) composes this plan's edge primitive; see
  [branch-rejoin experiment](2026-08-21-branch-rejoin-experiment.md).
- **Content/schema migration** — all new state is editor-session state.
- **Visitor/runtime motion rewrite** — `CameraDirector.svelte` is untouched in
  the first slices (see §D2 for the parity caveat and §J).

## B. Current architecture (audit-verified)

| Area | Module | Responsibility |
|---|---|---|
| Route graph | `lib/museum/navigation/camera-route.ts` | `getCameraConnectionRoute(id, direction)` resolves one oriented connection; `getCameraRoute(from, to)` is BFS (may span connections); `getFlowRoute()` follows order links; `getCameraMotionOptions(connection, direction)` exposes authored timing/easing |
| Motion | `lib/museum/navigation/camera-motion.ts` | `createCameraMotion()` compiles path/target/FOV/view keys/framing guards; `sampleCameraMotion()` is the canonical sampler |
| Directed data | `lib/types/museum.ts` | Connections carry stable `fromNodeId`/`toNodeId`; `CameraConnectionDirection` = `'forward' \| 'reverse'`; direction-specific `viewTracks`, `timing`, framing envelopes |
| Preview FSM | `store/camera-preview-controller.svelte.ts` | Preview kinds `'node' \| 'transition' \| 'connection' \| 'tour'`; captured route snapshots keyed by run ID; paused/playing/complete transport |
| Preview commands | `store/camera-preview-commands.svelte.ts` | Orchestrates node/transition/connection/reverse/guided-tour entry |
| Timeline | `store/camera-timeline-controller.svelte.ts` + `editor-camera-timeline.ts` | Guided Sequence timeline: composes per-edge motions, maps normalized global playhead ↔ edge-local progress, destination-node holds |
| UI | `EditorCameraTimeline{Frame,Panel,Ruler,Dots}.svelte`, `EditorCameraPreviewControls.svelte`, `CameraFlowPanel.svelte`, `CameraPlanInspector/Viewport.svelte`, `EditorCameraRig.svelte` | Timeline shell/ruler/dots, transport controls, flow sidebar, Plan surfaces, rig application |

Verified facts driving the design:

- **Timing parity gap (the serious one).** `editor-camera-timeline.ts` passes
  `getCameraMotionOptions(...)` per edge, while direct preview paths
  (`camera-preview-commands`, `camera-preview-controller`,
  `EditorCameraRig`, `selection-actions`) call `createCameraMotion(route)`
  without connection options — a timed/eased edge can differ between Sequence
  timeline, direct edge preview, and runtime.
- **Implicit Sequence loop.** `editor-camera-timeline.ts` builds the guided
  route with `getFlowRoute(..., { loop: true })`: a distinct real tail→head
  connection becomes a closing timeline edge.
- **Directed-edge concept already stable.** `ResolvedCameraRoute.edges[]`
  items carry `{ connectionId, direction, fromNodeId, toNodeId, positionSpan,
  viewTrack }` — the `{ connectionId, fromNodeId, toNodeId }` equivalent the
  proposal asks about already exists end-to-end.
- **`C → E` already animates.** The blocker for Unsequenced-edge authoring is
  timeline/controller/UI indexing, not graph or motion.

## C. Current vs proposed

```text
Already supported        static node preview (no connection needed);
                         exact selected-connection route incl. reverse;
                         directional data model; shared sampler;
                         Sequence-as-edge-composition; pause/stop/resume;
                         Plan↔3D shell continuity preserving selection
Partially supported      selected-edge preview (animates; no local ruler/
                         duration/scrub/loop); direction swap (exists as
                         timeline concern, not preview scope); Preview
                         Sequence (exists as "Preview Flow", context-
                         sensitive play button); Sequence scrubbing
                         (normalized only, no seconds domain)
Missing                  explicit scope = camera|edge|sequence; edge-local
                         timeline model; edge-loop transport; separate
                         commands; scope-transition policy; Roll/Shots
Conflicting invariants   loop-derived guided timeline vs stop-at-end +
                         Replay; authored timing not canonical on all
                         paths (parity gap above); BFS runtime routing can
                         pick a different parallel edge than the selected
                         connection; legacy kind:'transition' is a
                         multi-edge BFS route, not one of the three scopes
```

## D. Locked design decisions

**D1 — Three scopes, ratified.** Internal vocabulary
`camera | edge | sequence`; UI copy stays "Preview Camera / Preview Edge /
Preview Sequence". Selecting a connection alone must **not** interrupt active
Sequence playback — Preview Edge is an explicit command. Selection and preview
scope remain separate state.

**D2 — One directed-edge motion resolver, not deferred.** New primitive:

```ts
resolveDirectedEdgeMotion(
  connectionId: string,
  fromNodeId: string,
  toNodeId: string
): { route, direction, motionOptions, durationSeconds, … }
```

resolving path, direction, duration, easing, view track, framing envelope,
FOV, target. Preview Edge resolves through it; Preview Sequence resolves each
adjacent pair through it; the existing guided timeline switches to it. This
closes the parity gap inside the editor in Slice 1 — not later. Visitor
runtime parity (`CameraDirector` authored-timing consumption, parallel-edge
equivalence) is **documented as a known discrepancy** in this plan and is a
separately scheduled runtime slice if the owner wants it; it must not be
silently absorbed here.

**D3 — Two loop concepts stay separate.**

- *Route loop*: a real authored tail→head connection is topology and remains
  part of Sequence playback semantics (derived closing edge). Not replaced.
- *Edge preview loop*: temporary editor transport repetition of one selected
  edge. New `repeat` flag, scoped to edge scope only.

No generic transport `loop` boolean that could blur the two.

**D4 — Discriminated scope state**, not a flat `scope` + `loop` pair (amends
the audit's proposed shape):

```ts
type DirectedEdgeRef = {
  connectionId: string;
  fromNodeId: string;
  toNodeId: string;
  direction: 'forward' | 'reverse';
};

type PreviewScope =
  | { kind: 'camera'; nodeId: string }
  | { kind: 'edge'; edge: DirectedEdgeRef; repeat: boolean }
  | { kind: 'sequence' }; // looping derives from real tail↔head topology

// Controller/session state alongside (not serialized):
{
  scope: PreviewScope;
  mode: 'director' | 'visitor';
  transport: 'paused' | 'playing' | 'complete';
  runId: number;
  playhead: number;          // normalized within active scope (UI compat)
  timeSeconds: number;       // explicit time domain, new controls
  durationSeconds: number;
  lastSequencePlayhead?: number;  // restored on Edge → Sequence return
}
```

Migration mapping: `node → camera`, `connection → edge`, `tour → sequence`;
`transition` retained as legacy compatibility (multi-edge BFS route) until
callers migrate, then removed (mechanical cleanup slice).

**S2 ratification (2026-08-21):** Slice 2 ships an *interim* representation —
a derived `previewScopeOf(preview)` helper plus an `edgeRepeat` flag scoped
strictly to `kind === 'connection'` — instead of replacing the preview `kind`
union (which would break exhaustive switches). Semantics match §D4 today
(`node→camera`, `connection→edge`, `tour→sequence`, `transition→legacy`); the
discriminated `PreviewScope` state above remains the target shape and lands in
**Slice 6** with the `node/connection/tour → camera/edge/sequence` kind rename
(D6). Detail: [Slice 2 design](#slice-2--design-detail-folded-2026-08-21).

**D5 — Roll/Shots deferred** (see Out of scope). Timeline may reserve lanes
visually only.

**D6 — Naming retirement is gradual.** New command names land with the new
scopes; `previewGuidedTour`-era names become aliases; alias deletion waits for
a mechanical cleanup once relic-facing facade callers are migrated.

## E. Pipeline placement (P1–P7)

Ratified order (2026-08-21 scope decision): **P1 → P8 → P2 → P3** — extends
the camera-first phase; P3 stays last as pure cosmetics. **P1 shipped +
closed 2026-08-21, so P8 is the active gate.** Remaining **P7** increments
(**P7.1 → P7.5 → P7.2 → P7.3**, Option B) resume after P8 Slices 1–4.
P4/P5 unscheduled.

- **Slot: ahead of P2** —
  [scope decision](../archive/plans/2026-08-21-scope-decision-p8-before-p2.md).
  Finish the camera domain while P1 context is warm; fix the parity gap
  before further authoring; the Camera 3D transport/timeline chrome settles
  once so P3 restyles those components exactly once.
- **P7 coordination:** remaining P7 increments resume **after P8 Slices 1–4
  land** — never interleaved with P8 Slices 2–4. P7.5's
  `cameraTimelinePlayhead`-ownership DoD item folds into Slice 2 acceptance
  (strike it from P7.5 when P7 resumes); P7.1 then migrates whatever write
  sites Slices 2–5 added, on thinner facade ground.
- **Branch-rejoin experiment:** conceptually gated on P8 Slices 1–4 (they
  deliver "any real connection locally previewable"); its future multi-edge
  branch playback composes the Slice 1 primitive. Update that doc's
  prerequisite pointer at registration.
- **P4/P5:** unaffected.

## F. Implementation order (smallest safe slices)

Each slice ships green (tests + `svelte-check` + build) and independently.

### Slice 1 — `resolveDirectedEdgeMotion` + pure edge timeline model

Pure module layer; no UI, no visitor changes.

- Resolver owns exact-connection route resolution (never BFS), forward/
  reverse geometry, and `getCameraMotionOptions` application.
- Edge-local timeline built from any real connection, Unsequenced endpoints
  included; no `getFlowRoute()` / `isFlowNode()` involvement.
- Existing guided timeline refactored to consume the resolver (same composed
  motions as today modulo the parity fix — update golden expectations).
- Direct preview paths (`camera-preview-commands`, `-controller`, `Rig`,
  `selection-actions`) switch to the resolver → editor parity achieved.
- Zero/invalid authored durations fall back to automatic duration with a
  validation signal; never NaN/Infinity.

Acceptance: unit tests — forward/reverse exact routes, Unsequenced endpoint,
both directions sample identically-shaped motion options, timeline composition
unchanged for a fixture document except timing-corrected edges; parity test
asserting direct-edge sample == timeline-edge sample for the same
`(connectionId, from, to)`.

### Slice 2 — Explicit preview scope state + transport semantics

- Extend preview FSM with `PreviewScope` per §D4 (**S2 interim**: derived
  `previewScopeOf` + `edgeRepeat`; discriminated state in S6 — see §D4
  ratification). Mappings `tour → sequence`, `connection → edge`;
  `transition` kept as legacy. Detail: [Slice 2 design](#slice-2--design-detail-folded-2026-08-21).
- Transport: Play resumes current playhead; Pause freezes; **Stop keeps its
  teardown semantics (selection preserved)**; new `resetToScopeStart()`
  returns to scope start; completed previews restart on Play; Sequence end
  marks complete + Replay affordance.
- Scope transitions: selecting an edge never interrupts playing Sequence;
  explicit Preview Edge/Preview Sequence commands switch scope; last Sequence
  playhead preserved separately and restored when valid.
- Stale invalidation: document replacement, deletion, undo/redo rebuild or
  reset safely (preserve progress only if referenced IDs + time location
  still resolve; otherwise stop + clear snapshot).
- Direction swap preserves physical camera location where possible
  (arc-length remap, not `1 - p`).

Acceptance: controller tests for every transition in the §G matrix; no
visible UI change beyond labels yet.

### Slice 3 — Edge-scope timeline UI (primary Preview Edge)

- Selecting `C — E` exposes **Preview Edge** even when E is Unsequenced.
- Local ruler: only that edge, local duration readout (`2.1 / 4.2s`),
  local scrubber, endpoint labels, Reverse control, optional Repeat toggle.
- Scrub and playback sample identical poses (shared sampler assertion).
- FOV / Look At / view-key / framing-envelope authoring resolves against the
  selected direction; works for Unsequenced endpoints.
- Sync component contract: `components/camera-tour.md` + shell spec §camera.

Acceptance: browser/component tests — C—E scenario (Sequence ①B②C③D +
Unsequenced E), scrub-vs-play pose equality, repeat loops without touching
Sequence topology, key authoring on reverse direction.

### Slice 4 — Explicit Preview Sequence scope

- Separate **Preview Sequence** command; global ruler becomes sequence-scoped
  (mounted only in sequence scope); context-sensitive play button removed.
- Sequence = ordered adjacent pairs resolved through the Slice 1 primitive;
  Unsequenced cameras excluded from stops.
- Global seconds domain: scrub into any transition, seek to boundaries, play
  continues from exact local progress (e.g. 2.8s inside B→C).
- Loop semantics pinned by tests: stops at end unless a *real* tail→head
  connection exists (derived closing edge); `repeat` never alters this.
- One-node flow = static/no-motion state (no fake edge); two-node = one edge,
  plays once.

Acceptance: timeline tests for boundary epsilon (scrub + playback),
end-of-sequence Replay, holds, one/two-node flows, loop-topology derivation;
UI test for the demoted context-sensitive play button.
Detail: [Slice 4 design](#slice-4--design-detail-folded-2026-08-22).

### Slice 5 — Plan / Camera 3D integration + interaction matrix

- Camera Plan: Preview Camera + Preview Edge invocations (with direction
  chooser in connection inspector); switching to Camera 3D preserves
  selection; topology editing read-only while visitor playback active.
- Camera 3D: scope + direction readout, correct ruler per scope, transport
  state; Plan↔3D shared-view switch never stops a running preview.
- Full interaction coverage of §G matrix (selection/scope/undo/delete/view
  switches) at component level.
Detail: [Slice 5 design](#slice-5--design-detail-folded-2026-08-22).

### Slice 6 — Legacy retirement (mechanical, optional timing)

- Remove `kind: 'transition'` compatibility path once callers migrate; delete
  `tour`/`guided`-era aliases (D6); sweep internal naming to
  camera/edge/sequence. Behavior-neutral; may ride with any later slice.
Detail: [Slice 6 design](#slice-6--design-detail-folded-2026-08-22).

## Slice 2 — design detail (folded 2026-08-21)

Detail for §F Slice 2, folded from `docs/p8-slice-2-preview-scope-state.md`
(original deleted per fold-and-delete). The readiness survey is grep-verified
against the tree on 2026-08-21; re-grep at implementation time.
**Routing:** Sol medium (54, 92% Sol max), margin 0 → escalate on first
failure (`docs/plans/model-assessment.md`).

### S2 readiness survey (grep-verified)

| Area | File:line | What it owns today | S2 relevance |
|---|---|---|---|
| Preview union | `museum-editor.types.ts:53-85` | `EditorCameraPreviewState{mode,transport,runId,playhead,startedAtMs}` + kinds `node{nodeId}`, `transition{from,to}`, `connection{connectionId,direction,from,to}`, `tour{startNodeId}` | Maps `node→camera`, `connection→edge`, `tour→sequence`, `transition→legacy`. Adding a `scope` field would break exhaustive switches — S2 adds derived `previewScopeOf()` instead; kind rename deferred to S6 (see §D4 ratification) |
| Preview controller | `camera-preview-controller.svelte.ts:141-697` | `$state preview`, `followEnabled`, `recenterVersion`, captured-route/runId/timeline caches; entries `startNode/Transition/Connection/Tour`; `play()` (resume, complete→0, re-capture director route), `pause()`, `setPlayhead()`, `step()` (S1 resolver patched), `markStarted/complete`, `setMode`, `stop()` (null+clear+follow), snapshot ops; `refreshPausedDirector` (keep-on-failure, `#resolveRoute`), `pruneIfStale` (**node+tour only — gap**), `releaseIfTouches`, `invalidateGraph`, `getTimeline()` | New `edgeRepeat` `$state`; new `resetToScopeStart()`; extend `pruneIfStale` for connection; validate `lastSequencePlayhead` in `refreshPausedDirector`; `swapEdgeDirection()` arc-length remap |
| Timeline controller | `camera-timeline-controller.svelte.ts` | `cameraTimelinePlayhead` stays facade `$state` (9.3 gotcha); `seekCameraTimeline` with `#timelineTravelDirection`; `show*Pose`; `toggle/setCameraEdgeTravel` (arc-length remap via `cameraTimelineEdgePlayheadAtProgress`, seeds reverse track) | Swap reuses the same arc-length pattern; `findEditorCameraTimelineEdge` validates `lastSequencePlayhead` restore |
| Selection/discovery | `selection-store.svelte.ts:1-157` + facade `museum-editor.svelte.ts:761-772` | `navigation` (5 kinds), `workspace`, `discoveryConnectionId/direction` with reducer invariants; facade `activeCameraConnectionId/Direction` → `setDiscovery` | Swap calls `setDiscovery` + `expandActiveCameraDirection`; `lastSequencePlayhead` lives on the facade next to `cameraTimelinePlayhead` |
| Commands layer | `camera-preview-commands.svelte.ts:152-748` | `prepareCameraPreview`; `previewGuidedTour` (reuses `cameraTimelinePlayhead`), `previewSelectedNode`/`Transition`/`Connection` (block while `cameraPreview` exists); `playCameraPreview` (director re-resolves, complete→0, syncs playhead), `setCameraPreviewPlayhead`, `completeCameraPreview` (playing + started only), `stopCameraPreview` (cancels drag + framing, **preserves selection** per Phase 2.1) | New `previewEdge(connectionId,direction)` (snapshots playhead→`lastSequencePlayhead` first), `previewSequence()` (restore + delegate to `previewGuidedTour` — inherits its tour-playing no-op), `swapEdgePreviewDirection()`, `setEdgePreviewRepeat()`, `resetPreviewToScopeStart()`, `completeCameraPreview` repeat branch |
| Facade wiring | `museum-editor.svelte.ts:547-561,1359-1386` | afterReplace chain: reconcile → `refreshPausedDirector`(status) → `pruneIfStale` → `invalidateGraph` → view-keyframe reconcile. `#pruneInvalidCameraPreview` (1359) is the **stricter** facade prune (connection + endpoints) — runs on `undo()`/`redo()` only, not afterReplace | `lastSequencePlayhead` `$state` + delegates; **no new afterReplace listener** — reuse the existing three preview listeners |
| Session | `store/session-state.svelte.ts` | Expand/collapse, discovery persistence | No change in S2 |
| Resolver (S1) | `editor-directed-edge-motion.ts` | `ForConnection/ByDirection/orientationPair` + widened `getCameraMotionOptions` | Reused for direction-swap remap via `edgeProgress` round-trip |

**Gap closed:** the prior S2 readiness note asked for "FSM/session/history hook
points" — the table enumerates them all. Layering note: the facade's
`#pruneInvalidCameraPreview` (undo/redo only) is separate from the controller's
`pruneIfStale` (afterReplace, node+tour only); D7 below extends the latter to
connection without duplicating the endpoint checks.

### S2 design decisions (corrected 2026-08-21)

- **D1 scope representation:** derived `previewScopeOf(preview):
  'camera'|'edge'|'sequence'|'legacy'|null`. No kind rename in S2 (§D4
  ratification); `transition` → `legacy`.
- **D2 new session slots:** `lastSequencePlayhead: number|null` (facade
  `$state`; written when leaving `sequence` scope, read when entering
  `sequence` if the edge still resolves); `edgeRepeat: boolean` (controller
  `$state`, default false, per-preview like `followEnabled`; cleared on new
  `startConnection`/stop, kept across direction swap). **Both slots are
  in-memory-only: never serialized to codec, history, or session
  persistence** (session state is otherwise persisted — expand/collapse,
  discovery).
- **D3 transport — additive:** keep `stopCameraPreview()` teardown semantics
  (≈22 `museum-editor-camera` tests depend — estimate, verify at
  implementation); add `resetToScopeStart()` (paused + playhead 0 + sync
  facade playhead 0 **for tour only** — connection keeps its paused
  playhead; preview stays installed). Play-from-complete already restarts
  at 0 — Replay is UI (S3/S4), no new `replay()`.
- **D4 repeat:** when `edgeRepeat && kind==='connection' &&
  transport==='playing'` completes, `completeCameraPreview()` auto-restarts
  with **new runId, `playing` at 0, `startedAtMs: null`** (matching `play()`;
  the Rig re-marks on the new runId) instead of staying `complete`.
  **Zero-duration guard:** if the resolved motion's `durationSeconds === 0`
  (or `reducedMotion`), **stay `complete`** — the Rig already
  immediate-completes those (EditorCameraRig.svelte:398, :533), so a repeat
  restart would busy-loop every frame.
- **D5 direction swap:** `swapEdgePreviewDirection()` only when
  `kind==='connection' && paused`. Resolve a **fresh** opposite-direction
  route — `getCameraConnectionRoute(connectionId, oppositeDir, graph)` or
  `resolveDirectedEdgeMotionByDirection(graph, id, oppositeDir)` **without a
  `route` option**. Never reuse the captured snapshot: the resolver applies
  a supplied route's geometry verbatim (editor-directed-edge-motion.ts:40-48),
  so `ForConnection(connection, oppositeDir, capturedRoute)` would compile
  reverse timing onto forward A→B geometry. Then preserve physical location
  via the **edge-domain flip**: `e =
  cameraMotionEdgeProgressAtProgress(oldMotion,0,playhead)`; `e' = 1 − e`
  (reverse edge 0 runs B→A, so the same world point sits at `1 − e`, not
  `e` — the canonical pattern is `cameraTimelineProgressAtEdgePlayhead`/
  `cameraTimelineEdgePlayheadAtProgress`, editor-camera-timeline.ts:340-344,
  :386-388); `playhead' = cameraMotionProgressAtEdgeProgress(newMotion,0,e')`.
  The plan's earlier "(physical location, not `1-p`)" applies to playhead
  remap only — the edge-domain `1 − e` is required. New runId; update
  discovery (`setDiscovery` + `expandActiveCameraDirection`); keep
  `edgeRepeat`.
- **Naming contract:** `previewEdge(connectionId, direction)` = explicit
  scope switch (snapshots playhead → `lastSequencePlayhead`, installs
  `connection` paused); `playActiveConnectionEdge`/`previewSelectedConnection`
  = transport play of an already-active edge. The swap's `setDiscovery` is
  selection upkeep, not a re-enter.
- **D6 preservation:** Edge→Sequence restores `lastSequencePlayhead` only if
  `findEditorCameraTimelineEdge()` ≠ null **and**
  `cameraTimelineProgressAtEdgeProgress()` ≠ null; `getTimeline()` null or
  either null → start at 0.
- **D7 invalidation (layering):** extend the controller's `pruneIfStale` to
  drop `connection` when the connection or either endpoint is gone — this
  closes the afterReplace (commit/import/reset) gap. Keep the facade's
  `#pruneInvalidCameraPreview` (undo/redo, full `stopCameraPreview` teardown)
  as the stricter second layer; extract a shared
  `isPreviewStale(preview, document)` helper so the endpoint checks are not
  duplicated. `refreshPausedDirector` tour branch keeps only if
  `readCameraTimeline()` succeeds and the restored `lastSequencePlayhead`
  still maps; `releaseIfTouches` already covers mutation-time deletion.
  AfterReplace order is already safe: `pruneIfStale` begins with
  `invalidateGraph()` (camera-preview-controller.svelte.ts:597), so the new
  connection branch runs against a fresh graph before the facade's
  `invalidateGraph` listener.
- **D8 P7.5 fold-in:** `cameraTimelinePlayhead` stays facade-owned through
  S2 (9.3); ownership folds to the timeline controller post-S4 (tracker).

### State model delta

```ts
// museum-editor.types.ts — no type added; helper in controller:
// previewScopeOf(p): 'camera'|'edge'|'sequence'|'legacy'|null
// museum-editor.svelte.ts facade:
lastSequencePlayhead = $state<number | null>(null)
// camera-preview-controller.svelte.ts:
edgeRepeat = $state(false)
// Both slots in-memory only — never codec/history/session-persistence.
```

### Work items by file

1. `museum-editor.types.ts` — optional `PreviewScope` type alias; no breaking
   change.
2. `camera-preview-controller.svelte.ts` — `edgeRepeat`, `previewScopeOf`,
   `resetToScopeStart()`, `swapEdgeDirection()` (fresh opposite-direction
   route, never the captured snapshot; `1 − e` edge-progress flip),
   `pruneIfStale` connection branch, `refreshPausedDirector`
   `lastSequencePlayhead` validity, clear `edgeRepeat` on
   `startConnection`/stop.
3. `camera-preview-commands.svelte.ts` — `previewEdge`, `previewSequence`
   (save/restore `lastSequencePlayhead`, delegate to `previewGuidedTour`),
   `swapEdgePreviewDirection`, `setEdgePreviewRepeat`, `resetPreviewToScopeStart`,
   `completeCameraPreview` repeat branch. `stopCameraPreview` untouched.
4. `museum-editor.svelte.ts` — `lastSequencePlayhead` `$state` + accessors,
   new delegates, expose `edgeRepeat` for UI reads.
5. Controller host interface — expose `lastSequencePlayhead` read to the
   controller (needed for D7's `refreshPausedDirector` tour-branch validity
   check); facade keeps write ownership.
6. **No changes:** `CameraDirector.svelte`, `museum-state`, visitor chunks;
   resolver reused as-is; `camera-timeline-controller` unchanged except
   optional helper exposure.

### Test matrix — §G rows → concrete tests

All via `createMuseumEditorStore` fixtures (existing
`museum-editor-camera.test.ts` pattern) + `previewScopeOf` unit tests.
Existing-suite counts (≈1921 total, ≈22 stop-semantics) are estimates —
record the real numbers at implementation.

| §G row | Test |
|---|---|
| scope mapping | `previewScopeOf` unit: node→camera, connection→edge, tour→sequence, transition→legacy, null→null |
| Missing connection (pre-install) | `previewEdge(unknown connection)` → status message, preview stays null |
| select-edge while sequence playing | seek blocked + `previewSelectedConnection` no-ops → tour still `playing` |
| Preview Edge explicit switch | saves `lastSequencePlayhead` (= prior `cameraTimelinePlayhead`), installs `connection` paused |
| Preview Sequence return (valid) | restores `lastSequencePlayhead` (global position) when timeline still builds; validated via `getEditorCameraTimelineLocation` |
| Preview Sequence return (invalid) | resets to 0 only when timeline unbuildable (e.g. `< 2` guided nodes) — preserves global position even if saved edge was deleted (amended 2026-08-22 per counter-review; matches §G “preserve time only if edges still resolve” as global-position preserve) |
| edgeRepeat auto-restart | `completeCameraPreview` with `edgeRepeat=true` → new runId `playing` at 0, not `complete` |
| edgeRepeat + zero-duration | zero-duration edge with `edgeRepeat=true` → stays `complete`, **no restart loop** |
| edgeRepeat cleared | cleared on new `startConnection` and on `stop`; kept across direction swap |
| resetToScopeStart playhead sync | facade `cameraTimelinePlayhead = 0` for tour; connection playhead untouched |
| direction swap preserves pose | paused swap: `sample(oldMotion,playhead).position ≈ sample(newMotion,playhead').position` |
| direction swap keeps repeat+discovery | repeat retained, `activeCameraDirection` flipped |
| delete selected edge | `releaseIfTouches` / extended `pruneIfStale` → preview null after document replace |
| undo restores edge | `refreshPausedDirector` keeps preview (no status) when connection reappears |
| zero-duration edge | resolver `durationFallback` path → Rig immediate complete, transport `complete` |
| one/two-node flow | `previewSequence` fails gracefully (existing `minimum_guided_nodes` status) when timeline unbuildable |

Acceptance: all §G rows covered, no visible UI beyond labels, existing suites
stay green.

### Boundaries / out of scope

No timeline UI (local ruler, scrubber) — S3. No whole-Sequence global ruler
composition change — S4. No Plan/3D integration — S5. No `transition` kind
removal — S6. No visitor runtime change (`CameraDirector`). No schema
migration.

### Risks & rollback

- **Stop reinterpretation** — additive `resetToScopeStart` (no teardown
  change); if the owner later wants Stop=reset, swap wiring in S3.
- **Stale snapshot vs live timing** — the captured-route + live-timing
  pattern applies to **same-direction** re-resolution only (play/resume/
  refresh); the **direction swap resolves a fresh opposite route** per D5
  and never reuses the snapshot geometry.
- **P7.5 overlap** — `cameraTimelinePlayhead` ownership stays facade; no
  conflict until P7 resumes post-S4.
- Rollback: three files (`museum-editor.types`, controller, commands) + one
  facade slot; no data migration.

## Slice 3 — design detail (folded 2026-08-22)

Detail for §F Slice 3, folded from `docs/p8-slice-3-edge-timeline-ui.md`
(original deleted per fold-and-delete). The readiness survey is grep-verified
against the tree on 2026-08-22; re-grep at implementation time.
**Routing:** DeepSeek V4 Flash (49, 83% Luna xhigh), margin 0 → escalate on
first failure (`docs/plans/model-assessment.md`).

### S3 readiness survey (grep-verified)

| Area | File:line | What it owns today | S3 relevance |
|---|---|---|---|
| Guided timeline model | `editor-camera-timeline.ts:125-209` | `createEditorCameraTimeline(graph)` builds `EditorCameraTimeline` from `getFlowRoute(loop:true)` + `resolveConnectionEdgeMotions`; holds `motionStartSeconds/motionEndSeconds/holdEndSeconds`, `nodeBoundaries`, `edges[].motions[direction]` | Unchanged for guided Sequence. S3 adds a **pure edge-local timeline** — one `ResolvedCameraRoute` + one `CameraMotion` → `EdgeLocalTimeline { durationSeconds, motion }`. No `getFlowRoute` / `isFlowNode` in the edge path; reuses `resolveDirectedEdgeMotionByDirection` (S1) |
| Timeline hooks | `hooks/use-camera-timeline.svelte.ts:1-100` | `useCameraTimeline(store)` exposes `timeline` (`getCameraTimeline()`), `playhead` (`cameraTimelinePlayhead`), `disabled/scrubDisabled`, `reverseEdgeActive/Disabled/Label`, `seek/step/toggleTourPlayback/toggleReverse/addViewKeyframeAtPlayhead` | Fork: when `previewScopeOf(preview)==='edge'` the hook exposes `edgeTimeline`, `edgePlayhead` (preview.playhead), `edgeDurationSeconds`, `edgeEndpoints` labels. Guided branch keeps existing facade playhead; edge branch reads controller playhead directly. S4 will add sequence-global hook |
| Ruler / transport | `EditorCameraTimelineRuler.svelte:1-107` | Ruler owns `transport` row: step ◀/▶, Play/Pause (tour), Reverse toggle, `formatTime(duration*playhead)`, range scrub `seek()` → `seekCameraTimeline` | **Split in S3:** guided ruler stays for `sequence` scope. New `EditorCameraEdgeRuler.svelte` (or `EditorCameraTimelineRuler` branch) renders **local** `2.1 / 4.2s` readout, local scrubber (`min 0 max 1 step 0.0005`), endpoint labels (`A → B`), Reverse control (delegates to `swapEdgePreviewDirection` when paused), optional Repeat toggle (`edgeRepeat`). Scrub calls `setCameraPreviewPlayhead` for edge; `seekCameraTimeline` for sequence |
| Dots / lanes | `EditorCameraTimelineDots.svelte:1-756` | Two lanes `Guided Route / Camera Framing` with `timeline.edges`, `nodeBoundaries`, `viewKeyMarkers`, `envelopeBands`; uses `cameraTimelineProgressAtEdgeProgress` for mapping | **Minimal S3 (acceptable):** Dots hidden for `scope==='edge'` (guided-only, mounted only when `scope==='sequence'` or idle-with-Sequence). **Polished S3:** single edge-local marker lane (one span + view-key markers for `activeConnectionId+direction`); envelope bands read `createEdgeLocalTimeline(...).motion` directly, not `timeline.edges` |
| Preview FSM | `store/camera-preview-controller.svelte.ts:196-854` | `preview` (`node/transition/connection/tour`), `edgeRepeat`, `previewScopeOf`, `swapEdgeDirection` (fresh opposite route + `1-e` flip), `resetToScopeStart`, `pruneIfStale` connection branch | S3 **consumes** `edgeRepeat` + `swapEdgeDirection`; adds no new FSM state. No helper added here — edge motion helper lives in `editor-camera-timeline.ts` / `hooks/use-camera-timeline.svelte.ts` so the controller stays consume-only (work item 8) |
| Preview commands | `store/camera-preview-commands.svelte.ts:508-643` | `previewEdge` (snapshot `lastSequencePlayhead`, installs `connection` paused), `previewSequence`, `swapEdgePreviewDirection`, `setEdgePreviewRepeat`, `completeCameraPreview` repeat branch | S3 wires UI to existing commands: Reverse button → `swapEdgePreviewDirection` (paused only); Repeat checkbox → `setEdgePreviewRepeat`; local scrub → `setCameraPreviewPlayhead`; Play/Pause → `playCameraPreview/pauseCameraPreview`. No new command except optional `seekEdgePlayhead` alias |
| Rig / sampling | `EditorCameraRig.svelte:369-419` + `hooks/use-camera-preview.svelte.ts:45-83` | Rig resolves `activeMotion` via `resolveDirectedEdgeMotionByDirection(graph,id,dir,{route})` for `connection`, `createCameraMotion(route)` for `transition`; samples via `director.sampleMotion(preview,playhead,activeMotion)`; `use-camera-preview` wraps `sampleCameraMotion` vs `sampleEditorCameraTimeline` | S3 **no Rig change** — already samples edge previews through the resolver, so scrub and playback are identical poses by construction. Parity test asserts `sample(oldMotion,playhead) ≈ sample(newMotion,playhead)` across both paths. Zero-duration `motion.durationSeconds===0` → immediate `complete` already handled |
| Plan inspector | `app/CameraPlanInspector.svelte:149-298` | Node/connection/anchor/view-keyframe panels; connection panel shows `EditorCameraConnectionTiming` + `Delete`; `timingDirection` follows `activeCameraDirection`; View-keyframe panel is passive note only | S3 adds **Preview Edge** entry points: connection panel gains `Preview Edge ▸ Forward / Reverse` buttons (visible even when endpoint Unsequenced) + live `edgeRepeat` + `Reverse` sync; node panel keeps `Preview Camera`. `selectCameraConnectionDirection` already updates `timingDirection` via `$effect` |
| Selection continuity | `store/selection-store.svelte.ts` + `app/active-editor-selection.svelte.ts` | `navigation` (`node/connection/anchor/view-keyframe`), `activeCameraConnectionId/Direction` derived from selection/discovery | Edge-local timeline builds from `activeCameraConnectionId/Direction` directly; works for Unsequenced endpoints because it never asks `getFlowRoute`. `C → E` (E unsequenced) resolves via `getCameraConnectionRoute(C-E, dir)` — already animates per §B |
| Framing authoring | `store/view-keyframe-controller.svelte.ts:545-680,976` + `editor-camera-view.ts` | `canAddViewKeyframeAtPlayhead` / `addViewKeyframeAtPlayhead` gate on `preview.kind==='connection' && mode==='director' && transport==='paused'` (never `readCameraTimeline()`); `#getViewKeyframeAuthoringSample` already maps via `resolveDirectedEdgeMotionForConnection` + `cameraMotionEdgeProgressAtProgress` / `cameraMotionProgressAtEdgeProgress`; `updateViewKeyframeProgressDrag` (:976) uses draft path directly; unsequenced `C → E` already valid | S3: authoring already shipped in S1/S2 — no new mapping. S3 gap is **rendering only**: `EditorCameraTimelineDots` `envelopeBands` / `activeEnvelopeHandles` (:107-174) iterate `timeline.edges`; edge scope with Unsequenced endpoint needs single-span envelope/marker rendering via the edge motion |

**Gap closed:** prior S3 readiness note asked for "edge-local timeline model, local ruler, repeat, reverse" — the table enumerates the hook points. The Rig already provides scrub-vs-play parity and `view-keyframe-controller` already resolves through the S1 resolver for connection previews; the gap is **UI mounting** (ruler/dots scope branching) and **edge-local envelope/marker rendering** (Dots single-span) — not new authoring math.

### S3 design decisions (corrected 2026-08-22)

- **D1 edge-local model (pure, no timeline mutation):** new helper `createEdgeLocalTimeline(graph, connectionId, direction, opts?: { route?: ResolvedCameraRoute }): EdgeLocalTimeline | null` wraps `resolveDirectedEdgeMotionByDirection(graph, id, dir, opts)` — no new duration math, no `getFlowRoute`. When a preview is active, caller forwards `{ route: getCapturedRoute(preview.runId) }` so the helper's `motion` equals the Rig's `activeMotion` (which samples with `{ route: captured }` at `EditorCameraRig.svelte:383-390`); idle readout uses live route (no `route` param). The hook `useCameraTimeline` memoizes by `graph` identity + `connectionId+direction` + `preview.runId` (stable monotonic snapshot key — `getCapturedRoute`/`getCapturedCameraPreviewRoute` at `camera-preview-controller.svelte.ts:673` / `museum-editor.svelte.ts:1960` return fresh `cloneResolvedCameraRoute` clones, so route identity would thrash); returns `null` when no connection selected. Lives in `editor-camera-timeline.ts` (or the hook), **not** in `camera-preview-controller.svelte.ts` — controller stays consume-only. **Not serialized, not a second motion engine.** Readout = live duration; pose = captured route (divergence acknowledged — see D7).
- **D2 scope-conditional mounting (takes precedence over `{#if timeline}`):** `EditorCameraTimelinePanel.svelte` today is `{#if timeline}`-gated (`EditorCameraTimelinePanel.svelte:53`) — with an Unsequenced connection there may be no guided timeline, so it would render "Camera timeline unavailable." S3 branches **before** that gate on `previewScopeOf(preview)` / `activeCameraConnectionId`:
  - `scope==='edge'` → mount **Edge Ruler** (local duration, endpoint labels, live scrubber, Reverse when paused, Repeat when `kind==='connection'`). Scrub bound to `preview.playhead`.
  - idle-with-connection (no preview, `activeCameraConnectionId` set) → mount **Edge Ruler in candidate/read-only mode**: endpoint labels + `durationSeconds` readout, but scrub/Reverse/Repeat **disabled** and a `Preview Edge` CTA (§D6) — avoids the D3 dead-controls contradiction (`setCameraPreviewPlayhead` / `swapEdgePreviewDirection` no-op without a preview).
  - `scope==='sequence'` or idle-with-Sequence → mount guided `EditorCameraTimelineRuler` + `EditorCameraTimelineDots` (existing).
  - `scope==='camera'` → no ruler (static pose); preview controls only.
  - `scope===null` idle with no selection → existing empty-state.
  No new `viewMode` or `editorWorkspaceFade` changes; Plan ↔ 3D keep-mounted pattern (P1.7 trap) still applies.
- **D3 local ruler contract:**
  - Readout: `formatTime` in the existing ruler is `mm:ss.cs` (`EditorCameraTimelineRuler.svelte:20-25` → `00:04.20`); edge ruler uses the same helper for consistency — display as `00:02.10 / 00:04.20` (doc shorthand `2.1 / 4.2s` maps to this). When `durationSeconds===0` show `00:00.00 / 00:00.00` with scrub disabled.
  - Scrubber: `<input type="range" min 0 max 1 step 0.0005>` bound to `preview.playhead` for edge (via `setCameraPreviewPlayhead`) — **enabled only when `preview.kind==='connection'`**; idle candidate mode (D2) keeps it disabled. Sequence scrub stays `cameraTimelinePlayhead`.
  - Endpoint labels: `A → B` vs `B → A` derived from `DirectedEdgeMotion.fromNodeId/toNodeId` + `formatCameraNodeLabel`.
  - Reverse: button calls `swapEdgePreviewDirection()` when `transport==='paused'`; disabled when `playing` or no preview (idle candidate disabled per D2). Preserves physical pose via S2's `1-e` edge-domain flip — no `1-p` on playhead.
  - Repeat: checkbox bound to `controller.edgeRepeat` via `setEdgePreviewRepeat`; visible and enabled only for `kind==='connection'`; idle candidate shows disabled unchecked. Auto-restart semantics already land in S2 `completeCameraPreview`.
- **D4 scrub-vs-play parity (distinct instances, same captured route):** edge helper and Rig must be compared on **different** `CameraMotion` instances derived from the **same captured route** — otherwise `sample(motion, scrub) ≈ sample(motion, playback)` is trivially self-equal. On an unchanged document: `left = createEdgeLocalTimeline(graph, id, dir, { route: captured }).motion` and `right = resolveDirectedEdgeMotionByDirection(graph, id, dir, { route: captured }).motion` (Rig path) must satisfy `sample(left, p).position ≈ sample(right, p).position` within `1e-4m` / `1e-3°` FOV (and `fov` within `1e-3°`) for all `p ∈ [0,1]` forward and reverse. Readout divergence noted: live `durationSeconds` (helper without `route`) vs pose `motion` (helper with `captured`) may differ mid-preview after an edit that changes timing — this is intentional (readout is live).
- **D5 framing authoring direction-aware → rendering only (authoring already shipped):** `addViewKeyframeAtPlayhead` / `updateViewKeyframeProgressDrag` already resolve through `resolveDirectedEdgeMotionForConnection` for `preview.kind==='connection'` (see `view-keyframe-controller.svelte.ts:545-680,976`) — no new mapping. Unsequenced `E` needs no `isFlowNode` check. S3's remaining work is **Dots rendering**: `envelopeBands` / `activeEnvelopeHandles` in `EditorCameraTimelineDots.svelte:107-174` iterate `timeline.edges` and are gated on `viewMode==='3d' && timeline`; edge scope needs a single-span band/marker pass that reads `createEdgeLocalTimeline(graph, id, dir).motion.viewTrack.framingEnvelope[direction]` and view-key markers for the active `connectionId+direction` without touching `timeline.edges`.
- **D6 selection → preview affordance:** selecting `C — E` (even with E Unsequenced) **does not auto-start** preview (D1 §D1: selection ≠ scope). The inspector/timeline exposes an explicit `Preview Edge` button; clicking it calls `previewEdge(connectionId, direction)` (S2) which snapshots `lastSequencePlayhead` if leaving `sequence`. If a `connection` preview is already active, selecting a different connection only updates the edge-local ruler's *candidate* until the user clicks Preview Edge again.
- **D7 invalidation / zero-duration:** edge-local memo invalidates on every `graph` key change (`document.state.graph` identity), on `activeCameraConnectionId/Direction` change, and on `preview.runId` when a preview is active (new captured snapshot — route identity thrashes, so key by `runId`). Zero-duration edges remain scrubbable at `0` but Play immediate-completes (`EditorCameraRig:398,533` + S2 `completeCameraPreview` guard `durationSeconds===0 → stay complete, no repeat loop`).

### State model delta

```ts
// no new persisted/document/session state in S3
// editor-camera-timeline.ts — new pure helper (not EditorCameraTimeline):
// createEdgeLocalTimeline(
//   graph, connectionId, direction, opts?: { route?: ResolvedCameraRoute }
// ): EdgeLocalTimeline | null
//   → { motion: CameraMotion; durationSeconds: number; fromNodeId; toNodeId; connectionId; direction }
//   // opts.route forwarded to resolveDirectedEdgeMotionByDirection so
//   // helper+ Rig share captured geometry; idle call omits opts.
// hooks/use-camera-timeline.svelte.ts — derived selectors:
//   edgeTimeline, edgePlayhead, edgeDurationSeconds, edgeEndpoints
//   // memo key: graph identity + connectionId+direction + preview.runId (not route identity —
//   // getCapturedRoute clones per read at controller:673 / facade:1960)
// EditorCameraTimelinePanel.svelte — branch on previewScopeOf(preview) BEFORE {#if timeline} gate
```

Both new slots are **in-memory, derived, never persisted**.

### Work items by file

1. `editor-camera-timeline.ts` — add `createEdgeLocalTimeline` (with optional `{ route }`) wrapping `resolveDirectedEdgeMotionByDirection`; no new motion engine.
2. `hooks/use-camera-timeline.svelte.ts` — add `edgeTimeline/edgePlayhead/edgeDurationSeconds/edgeEndpoints/edgeRepeat/reverseEdgeLabel` derived (memo by `graph` + `id+dir` + `preview.runId` — not `capturedRoute` identity which thrashes via `cloneResolvedCameraRoute` at `controller:673`); keep guided selectors for S4.
3. `EditorCameraTimelinePanel.svelte` — scope branch **before** `{#if timeline}`: `edge` → Edge Ruler; `idle-with-connection` → Edge Ruler candidate/read-only (disabled scrub/Reverse/Repeat + CTA); `sequence` → guided Ruler+Dots; `camera` → preview controls only. Preserve empty-state for no-timeline && no-connection.
4. `EditorCameraTimelineRuler.svelte` vs new `EditorCameraEdgeRuler.svelte` — either split or branch: live `formatTime` double-readout `00:02.10 / 00:04.20`, scrubber bound to `preview.playhead` (disabled in candidate mode), Reverse → `swapEdgePreviewDirection` (disabled unless paused), Repeat → `setEdgePreviewRepeat` (disabled unless `kind==='connection'`), endpoint labels.
5. `EditorCameraTimelineDots.svelte` — for edge scope, render single-span envelope/marker pass from `createEdgeLocalTimeline(...).motion.viewTrack` (framingEnvelope + viewKeys for `activeConnectionId+direction`); guided-only hidden is acceptable for S3 minimal acceptance, full single-span is the polished acceptance.
6. `app/CameraPlanInspector.svelte` — connection panel: add `Preview Edge` forward/reverse buttons + Repeat toggle readout; wire to `store.previewEdge` / `store.setEdgePreviewRepeat`. Keep `timingDirection` sync.
7. `store/view-keyframe-controller.svelte.ts` / `EditorCameraTimelineDots` drag helpers — **no new mapping** (already S1/S2). Verify only: existing `updateViewKeyframeProgressDrag` / `#getViewKeyframeAuthoringSample` already handle connection previews and Unsequenced endpoints; add regression assertion.
8. **No changes:** `CameraDirector.svelte`, `museum-state`, visitor chunks, `EditorCameraRig.svelte` sampling, `camera-preview-controller/commands` (consume only), `camera-timeline-controller` (S4 owns sequence global ruler); resolver reused as-is.

### Test matrix — §G rows → concrete tests

All via `createMuseumEditorStore` fixtures (existing `museum-editor-camera.test.ts` pattern) + browser/component tests where noted. Record real suite counts at implementation.

| §G row / Acceptance | Test |
|---|---|
| Unsequenced edge `C — E` visible | `activeCameraConnectionId='C-E'` with `E ∉ mainFlowNodeIds` → `edgeTimeline` non-null, `durationSeconds` finite, inspector shows `Preview Edge` buttons |
| Selecting `C — E` exposes Preview Edge (candidate mode) | selection `connection:C-E forward` without preview → ruler shows endpoint labels `C → E`, readout `00:XX.XX / 00:YY.YY`, scrub/Reverse/Repeat **disabled** + CTA; no guided Dots |
| Local ruler readout (active edge) | with `connection` preview at `playhead` → `formatTime(edgeDuration*playhead) / formatTime(edgeDuration)` e.g. `00:02.10 / 00:04.20` updates on scrub; zero-duration → `00:00.00 / 00:00.00` disabled |
| Local scrubber (active edge) | range `0..1 step 0.0005` enabled only when `kind==='connection'` → `setCameraPreviewPlayhead` updates `preview.playhead` and Rig pose; candidate idle scrub disabled |
| Scrub vs play pose equality (distinct instances) | on unchanged doc, `left=createEdgeLocalTimeline(graph,id,dir,{route:captured}).motion`, `right=resolveDirectedEdgeMotionByDirection(graph,id,dir,{route:captured}).motion` → `sample(left,p) ≈ sample(right,p)` for all `p` (pos `1e-4m`, fov `1e-3°`) forward and reverse; live readout vs captured pose divergence noted |
| Reverse control | paused edge: click Reverse → `swapEdgePreviewDirection` preserves `sample(old,playhead).position ≈ sample(new,playhead').position` via S2 `1-e` flip; `activeCameraDirection` flips; disabled while `playing` or idle candidate |
| Repeat loops without touching Sequence topology | `edgeRepeat=true` + `completeCameraPreview` → new runId `playing` at 0, not `complete`; guided `timeline.durationSeconds` unchanged; zero-duration with repeat → stays `complete`, no busy loop |
| FOV / Look At / view-key / envelope (regression) | `addViewKeyframeAtPlayhead` on edge forward at `0.3` then reverse at `0.7` already creates key at correct `keyframe.progress` via S1 resolver (`view-keyframe-controller:545-680`); test asserts Unsequenced `C → E` keys not rejected and `updateViewKeyframeProgressDrag` preserves behavior — Dots envelope rendering is the new assertion |
| Preview Edge while Sequence playing | explicit `previewEdge(connectionId,dir)` **even while `tour` is `playing`** snapshots `lastSequencePlayhead` and installs `connection` paused (no transport guard); `selection`/`seekCameraTimeline`/`previewSelectedConnection` do not interrupt playing tour |
| Zero-duration edge | `durationSeconds===0` edge: scrubber disabled, readout `00:00.00 / 00:00.00`, Play → immediate `complete`, Repeat does not loop |
| Contracts | `components/camera-tour.md` + `Shell-camera-workspaces.md` §9–§11 still pass: Camera Plan shows per-direction duration, `speed = length/duration`, Plan ↔ 3D selection continuity |

Acceptance: all §F S3 bullets covered; scrub and playback sample identical poses (shared sampler); `C—E` scenario green; existing suites stay green (expect `1,921+` baseline from S1, record S2's delta).

### Boundaries / out of scope

No whole-Sequence global ruler composition change — S4. No Plan/3D cross-workspace preservation beyond existing selection continuity — S5. No `transition` kind removal — S6. No visitor runtime change. No schema/codec change. Roll/Shots lanes remain visual-only (reserved).

### Risks & rollback

- **Ruler fork vs branch** — single-file branch minimizes churn; split into `EditorCameraEdgeRuler` if the conditional grows >80 lines. Either rollback is one file.
- **Dots coupling** — `EditorCameraTimelineDots` is heavily guided-timeline-coupled (envelope bands, `timeline.edges`); hiding it for edge scope is the smallest safe step. Full edge-local lane can land as S3 polish without breaking acceptance.
- **Hook memo churn** — edge memo keyed on `graph` identity + `connectionId+direction` + `preview.runId` (stable; live readout omits route, active preview forwards `getCapturedRoute(runId)` — route identity thrashes because `getCapturedRoute` at `controller:673` / facade `1960` clones per read); stale motion replaced synchronously on graph swap, no extra snapshot capture needed beyond the controller's `capturedRoute` keyed by `runId`.
- Rollback: `EditorCameraTimelinePanel` + `use-camera-timeline` + `CameraPlanInspector` + view-keyframe controller mapping — four files, no data migration. Revert to S2 green tree.

## Slice 4 — design detail (folded 2026-08-22)

Detail for §F Slice 4, written into the umbrella per fold-and-delete (no
standalone doc existed). The readiness survey is grep-verified against the
tree on 2026-08-22; re-grep at implementation time.
**Routing:** P8.S4 — Luna xhigh (48, 81% Luna xhigh, DeepSeek V4 Flash,
+1, open) per `docs/plans/model-assessment.md`.

### S4 readiness survey (grep-verified)

| Area | File:line | What it owns today | S4 relevance |
|---|---|---|---|
| Sequence entry commands | `store/camera-preview-commands.svelte.ts:323,583-605` | `previewGuidedTour(mode)` installs `kind:'tour'` playing at `cameraTimelinePlayhead` (tour-playing no-op, complete→0); `previewSequence(mode)` (S2) restores `lastSequencePlayhead` when the timeline still builds (D6 amended 2026-08-22: `getEditorCameraTimelineLocation` validity, else 0), sets `cameraTimelinePlayhead = restore`, delegates to `previewGuidedTour` | **Both commands already exist.** S4 wires every sequence entry point (AppBar ×2, hook `toggleTourPlayback`, Ruler play) to `previewSequence` and demotes the guided play button; no new FSM command |
| Global playhead | `museum-editor.svelte.ts:762` | `cameraTimelinePlayhead = $state(0)` — facade `$state` per the 9.3 gotcha; written by seek (:312), tour play/resume (:737), `setCameraPreviewPlayhead` tour sync (:770), `resetToScopeStart` tour (:639), complete (:916) | Stays facade-owned in S4 (ownership folds to the timeline controller post-S4 per tracker; P7.5 conflict). The "play continues from exact local progress" claim depends on the live tour sync at :770 |
| Sequence scrub | `store/camera-timeline-controller.svelte.ts:283-330` | `seekCameraTimeline(progress)` maps global → `getEditorCameraTimelineLocation` → edge-local playhead via `cameraTimelineEdgePlayheadAtProgress`, honors `#timelineTravelDirection` (reverse stays on the active edge), updates `cameraTimelinePlayhead`; `#canSeekCameraTimeline` blocks while playing/interacting | Scrub-into-any-transition already works. S4 pins boundary epsilon. **One-node no-op is already covered**: a one-node/flowless graph makes `readCameraTimeline()` return null (`createEditorCameraTimeline` throws — see the Global timeline build row), so `seekCameraTimeline` returns false before `getEditorCameraTimelineLocation` |
| Global timeline build | `editor-camera-timeline.ts:129-214` | `createEditorCameraTimeline` = `getFlowRoute(loop:true)` + per-edge S1 resolver motions + destination holds; `nodeBoundaries`; `TIMELINE_EPSILON = 1e-9`; `getEditorCameraScheduleLocation` (:232-287) walks motion + hold tails | Loop closing edge is derived (real tail→head). **One-node/flowless is unbuildable** — `walkFlowChain` throws when the start has no `nextNodeId` (camera-route.ts:442-449) and `findGuidedStart` throws on an empty flow, so `createEditorCameraTimeline` never returns a 0-edge timeline; the static/no-motion state is the null-timeline path (`seekCameraTimeline` already no-ops). Two-node → one edge |
| Loop derivation | `editor-navigation-graph.ts:241` + facade `museum-editor.svelte.ts:1158-1170` | `flowLoopConnectionId(document)` — closing edge iff a distinct real tail→head record exists (two-node pairs never loop — their only record is also the chain transition, T5/T8); `guidedTourNodeIds` chain | Already consumed by the S3 panel + `CameraFlowPanel` (S10.1.4 readout, `disconnectLoop` / `connectTailToHead` buttons). S4 pins the derivation at timeline level; does not touch the shipped buttons |
| Guided play button | `hooks/use-camera-timeline.svelte.ts:138-161` + `EditorCameraTimelineRuler.svelte:43-46` | `playLabel` ("Play reverse edge" when reverse + connection, else "Play camera flow"); `toggleTourPlayback` → pause / `playActiveConnectionEdge` (context-sensitive reverse branch) / `previewGuidedTour('director')` | S4 removes the reverse branch — edge transport already lives in the S3 EdgeRuler (`toggleEdgePlayback` / `stepEdge`); guided play becomes sequence-transport only |
| AppBar entry | `EditorAppBar.svelte:83` + `app/EditorAppBar.svelte:118` | "Preview Flow" buttons call `store.previewGuidedTour()` (visitor default) | S4 renames to "Preview Sequence" → `store.previewSequence()` (same default mode) |
| Replay | `store/camera-preview-commands.svelte.ts:717-737` | `playCameraPreview`: `playhead = transport==='complete' ? 0 : playhead`; new runId + re-capture | No new `replay()` (S2 D3) — resume-from-complete IS replay; S4 pins it with a test, label polish optional |
| Transport controls | `EditorCameraPreviewControls.svelte` | mode toggle, play/pause ("Resume preview"), Follow/Recenter (director), Stop | Sequence-scope readout already shows `kind · transport · %`. Optional cosmetic: relabel "Resume preview" → "Replay" when `transport === 'complete'` |

### S4 design decisions

- **D1 — Sequence entry = `previewSequence` everywhere; `previewGuidedTour` stays the internal delegate.** No new command. Hook `toggleTourPlayback` → `store.previewSequence('director')`; both AppBar buttons → `store.previewSequence()` (visitor default, matches today). `previewGuidedTour` keeps its install semantics (snapshot-free, tour-playing no-op, complete→0 via `setCameraPreviewPlayhead(0, runId)`).
- **D2 — Context-sensitive play demoted.** `toggleTourPlayback` drops the `activeCameraDirection==='reverse' && activeCameraConnectionId → playActiveConnectionEdge` branch; `playLabel` drops the "Play reverse edge" variant (reverse travel on the guided ruler remains available via the existing Reverse toggle — the *transport* for a reverse edge preview is the S3 EdgeRuler). Guided Ruler play is sequence-only. **Before removing:** grep `playActiveConnectionEdge` / `toggleTourPlayback` / `playLabel` test usage — existing `museum-editor-camera` tests may assert the old context-sensitive behavior and need to move to the EdgeRuler path.
- **D3 — Global seconds domain is pinned, not built.** The mapping already exists end-to-end (`getEditorCameraTimelineLocation` + `cameraTimelineEdgePlayheadAtProgress` + `cameraTimelineProgressAtEdgeProgress` + `getEditorCameraScheduleLocation` hold walk + `1e-9` epsilon). S4's real work: (a) boundary-epsilon tests — scrub exactly onto a node boundary lands the destination edge/direction and Play continues from the exact local progress (2.8s inside B→C = `cameraTimelineProgressAtEdgeProgress`); (b) hold-span tests via the schedule walk (note: the walk auto-collapses to end poses when `totalHoldSeconds <= 1e-9`, so local-progress assertions use `getEditorCameraTimelineLocation`, the motion-span mapping); (c) **one-node no-op** — already covered by the null-timeline path (D5); no new guard.
- **D4 — Loop semantics pinned.** Loop exists iff `flowLoopConnectionId(document)` is non-null; `createEditorCameraTimeline`'s `getFlowRoute(loop:true)` includes the closing edge as a real timeline edge. `edgeRepeat` is connection-preview transport state and never alters timeline topology — test that `edgeRepeat` on/off leaves `timeline.edges.length` / `durationSeconds` unchanged. The S3 loop readout buttons (`disconnectLoop` / `connectTailToHead`) are shipped UI — not S4's concern beyond the derivation tests.
- **D5 — One/two-node flows.** **Verified 2026-08-22: a 0-edge timeline is unreachable** — `walkFlowChain` throws when the chain start has no `nextNodeId` (camera-route.ts:442-449) and `findGuidedStart` throws on an empty flow, so `createEditorCameraTimeline` succeeds only with ≥1 edge. A one-node/no-flow graph therefore resolves to the **null-timeline path**: static/no-motion presentation, `seekCameraTimeline` no-ops on `!timeline` (no new guard needed), `previewSequence` fails gracefully, and there is no fake edge. Two nodes: exactly one edge, plays once, ends at tail (`flowLoopConnectionId` null).
- **D6 — No playhead ownership change, no new `replay()`.** `cameraTimelinePlayhead` stays facade `$state` (9.3 gotcha; the post-S4 fold to the timeline controller is the tracker's P7.5 item). Replay = play-from-complete (S2 D3): `playCameraPreview` restarts at 0 with a new runId + re-captured route. Optionally relabel the PreviewControls button when `transport === 'complete'` (cosmetic).

### Work items by file

1. `hooks/use-camera-timeline.svelte.ts` — `toggleTourPlayback`: remove the reverse-edge branch → pause / `store.previewSequence('director')`; `playLabel` → sequence-only label (drop "Play reverse edge").
2. `EditorAppBar.svelte` + `app/EditorAppBar.svelte` — "Preview Flow" → "Preview Sequence"; `store.previewGuidedTour()` → `store.previewSequence()`.
3. `store/camera-timeline-controller.svelte.ts` — **verified, no change needed**: the null-timeline path already no-ops one-node seeks (a 0-edge timeline is unreachable — D5).
4. `store/camera-preview-commands.svelte.ts` — `previewSequence` keeps the current `cameraTimelinePlayhead` when no `lastSequencePlayhead` is saved (S4 play-continuation fix; D6-regression tests still pass); one-node install fails gracefully via the null timeline.
5. `EditorCameraTimelineRuler.svelte` — play button uses the demoted label/binding; verify the seconds readout (`formatTime(timeline.durationSeconds * playhead)` is already the global-seconds domain).
6. `EditorCameraPreviewControls.svelte` — optional cosmetic: "Resume preview" → "Replay" when `transport === 'complete'` (may defer).
7. New `tests/lib/editor/store/p8-s4-preview-sequence.test.ts` — see matrix below.

### Test matrix — §F Slice 4 rows → concrete tests

All via `createMuseumEditorStore` fixtures (existing `museum-editor-camera.test.ts` pattern). Record real suite counts at implementation.

| §F row / Acceptance | Test |
|---|---|
| Boundary epsilon (scrub + playback) | `seekCameraTimeline` onto a node boundary (within `1e-9`) from below and from above → correct edge + `#timelineTravelDirection`; paused pose at boundary equals `getEditorCameraTimelineLocation` edge-end pose |
| Play continues from exact local progress | scrub to 2.8s inside B→C → `cameraTimelinePlayhead === cameraTimelineProgressAtEdgeProgress(...)`; `previewSequence` installs `tour` at that exact playhead; sampled pose equals the paused scrub pose (parity) |
| End-of-sequence Replay | tour `complete` (playhead 1) → `playCameraPreview` → new runId, `playing` at 0, `startedAtMs: null` |
| Holds | `getEditorCameraScheduleLocation` returns motion + hold spans; scrub into a hold keeps the destination pose; end-of-timeline hold → `complete` at 1 |
| One-node flow | single free node (no order links) → `getCameraTimeline()` null (unbuildable — `walkFlowChain` requires a `nextNodeId`); `seekCameraTimeline` no-ops (false); `previewSequence` fails gracefully; no fake edge |
| Two-node flow | exactly one edge; `flowLoopConnectionId` null; tour plays once and completes at 1 |
| Loop-topology derivation | real tail→head record → closing edge present in `timeline.edges` + `flowLoopConnectionId` non-null; two-node never loops; **`edgeRepeat` on/off leaves `timeline.edges.length` and `durationSeconds` unchanged** |
| Context-sensitive play demoted | `toggleTourPlayback` with reverse + selected connection in guided context → sequence transport (no hijack to `playActiveConnectionEdge`); S3 EdgeRuler `toggleEdgePlayback` still covers reverse-edge transport |
| `previewSequence` restore | valid `lastSequencePlayhead` → tour installs at restored playhead; timeline unbuildable → 0 (S2 D6 regression) |

Acceptance: all §F Slice 4 bullets covered; one/two-node and loop-topology rows green; existing suites stay green (expect the S3 baseline + S2's delta).

### Boundaries / out of scope

No `cameraTimelinePlayhead` ownership move (post-S4 fold; P7.5 conflict per tracker). No new `replay()` command (S2 D3). No visitor/CameraDirector change, no schema/codec change. No scope-kind rename (S6), no `transition` retirement. Dots/envelope rendering untouched (S3 polish owns the edge single-span). The S3 loop readout buttons (`disconnectLoop` / `connectTailToHead`) already shipped — not S4.

### Risks & rollback

- **Reverse-branch removal** — the `toggleTourPlayback` context-sensitive branch may be asserted by existing `museum-editor-camera` tests; grep `playActiveConnectionEdge|toggleTourPlayback|playLabel` before removing and migrate those assertions to the EdgeRuler path. Behavior is preserved, only the control surface changes.
- **One-node seek throw** — resolved 2026-08-22: `getEditorCameraTimelineLocation` cannot be reached on a one-node graph because `createEditorCameraTimeline` throws (no `nextNodeId`) and `readCameraTimeline` returns null first; `seekCameraTimeline`'s existing `!timeline` guard covers it. No 0-edge guard needed (unreachable).
- **Label churn** — "Preview Flow" → "Preview Sequence" touches two AppBar files + possibly screenshot/golden references; keep the copy change in this slice, not S3.
- Rollback: `use-camera-timeline` + AppBar ×2 + `camera-timeline-controller` guard + test file — five files, no data migration. Revert to S3 green tree.

## Slice 5 — design detail (folded 2026-08-22)

Detail for §F Slice 5, written into the umbrella per fold-and-delete (no
standalone doc existed). The readiness survey is grep-verified against the
tree on 2026-08-22; re-grep at implementation time.
**Routing:** P8.S5 — Luna high (46, 78% Luna high, DeepSeek V4 Flash, 0, open)
per `docs/plans/model-assessment.md`.

### S5 readiness survey (grep-verified)

| Area | File:line | What it owns today | S5 relevance |
|---|---|---|---|
| Camera Plan invocations | `app/CameraPlanInspector.svelte:257,299-322` | Node section: Preview Camera (`viewState.setView('camera','3d')` + `previewSelectedNode('visitor')`). Connection section (S3): Preview Edge ▶/◀ (`previewEdge(id,dir,'director')`), Reverse (`swapEdgePreviewDirection`, paused-only), Repeat (`setEdgePreviewRepeat`); direction chooser via `EditorCameraConnectionTiming` (`timingDirection` synced from `store.activeCameraDirection`, `selectDirection` → `selectCameraConnectionDirection`) | **All §F S5 Camera-Plan invocations already shipped (S3).** Verify-only + regression |
| 3D inspector | `EditorCameraInspector.svelte:252` | Preview Camera (node section only); connection/view-key sections expose framing + direction readout (`selection.direction` dd); edge preview is started from the Plan inspector or the candidate EdgeRuler CTA | Verify-only — no new buttons (owner 2026-08-22: selecting an edge + Play already previews) |
| Scope + transport readout | `EditorCameraPreviewControls.svelte:23-42` | kind·direction·transport·% readout (`Camera flow` / `Forward edge` / `Reverse edge` / `Holding authored node pose`), mode toggle, play/pause/Replay, Follow/Recenter, Stop | Verify-only: the §F "scope + direction readout, transport state" is this control, mounted in both views via the timeline panel |
| Ruler per scope | `EditorCameraTimelineFrame.svelte:123` + `EditorCameraTimelinePanel.svelte:57-70` | Timeline frame mounts for camera domain in BOTH views (`EditorApp.svelte:292` `viewMode={viewState.activeView}`); panel branches `edge`→EdgeRuler / `camera`→controls only / `sequence`→guided (S3/S4) | Verify-only: "correct ruler per scope" is shipped |
| Topology read-only while visitor playback | `store/mutation-guards.svelte.ts:27-33` | `isDocumentMutationBlocked` = preview && (mode==='visitor' \|\| transport!=='paused'); gated by `CameraPlanViewport.svelte:446` (node-drag begin), `CameraPlanToolbar.svelte:19`, inspector buttons | Already enforced — S5 pins with tests, no new guard |
| Plan↔3D preview preservation | `app/EditorApp.svelte:130-145` + `museum-editor.svelte.ts:2083-2101` | Both Camera cells map to `setWorkspace('camera')` (G3); `setWorkspace` stops preview only when leaving the camera workspace, so Camera Plan↔3D toggles are no-ops | Code-verified; **behavioral test missing** (only a source-inspection contract at `app/contracts.test.ts:1109-1118`) — headline S5 row |
| Playhead advance | `EditorCameraRig.svelte:521` | The ONLY tick: threlte `useTask` computes `progress = (performance.now() - startedAtMs)/duration` while the 3D Canvas is mounted; a view switch never stops or resets the preview | Pin "not stopped, value preserved at switch" (D2); advancement stays Rig-owned and unchanged |
| Undo/redo prune | `museum-editor.svelte.ts:1378,2667,2687` | `#pruneInvalidCameraPreview` runs from `undo()`/`redo()`; `pruneIfStale` covers live document edits | Strict facade path untested (S2:251 called `pruneIfStale` directly) — D3 |
| Facade commands | `museum-editor.svelte.ts:1905-1917` | `previewSelectedNode` / `previewSelectedConnection` / `previewSelectedTransition` | `previewSelectedConnection` unwired in UI; Preview Edge covers edge transport — keep unwired (D5) |
| Selection continuity | `navigationSelection` on store + `app/active-editor-selection.svelte` | Selection lives on the store; `EditorViewState.setView` is pure state (no preview/selection side effects) | View switches touch neither — pin with a `wired()`-style composition test (D1) |

### S5 design decisions

- **D1 — §G is a test slice.** Every §G row is either shipped (S2/S3/S4) or enforced by existing guards. S5's deliverable is the interaction-matrix suite (store-level + `wired()` composition) — no new commands, FSM, selection-semantics, or UI changes (the first-pass idea of 3D Preview Edge buttons was dropped: selecting an edge + Play already previews).
- **D2 — Plan↔3D preservation = "not stopped, value preserved at the switch moment".** With a `connection`/`tour` preview active, `viewState.setView('camera','plan')` → `setView('camera','3d')` leaves the preview installed with the same `runId`, `transport`, `playhead` value, `previewScope`, direction, and `navigationSelection`. Advancement is Rig-owned and runs only while the 3D Canvas is mounted; a switch never stops or resets a preview. **Owner-ratified 2026-08-22:** no advancement change and no auto-pause — the frozen-on-screen-while-in-Plan behavior is accepted as-is.
- **D3 — Undo/redo row through the real facade path.** Begin transaction → delete the edge with an active preview → `undo()` → `#pruneInvalidCameraPreview` rebuilds; valid IDs + time location → scope/playhead preserved; deleted connection → safe reset. The S2:251 test bypassed the facade (`pruneIfStale()` direct call); S5 adds the strict-path regression so `undo()` is never regressed by a menu/delete path change.
- **D4 — Sequence edited while previewing. Hard reset, tour-scoped (owner decision 2026-08-22; the blanket draft was rejected — 5 `museum-editor-camera` authoring tests prove connection/node previews must keep refreshing).** Playing → any mutation returns false (guards). Paused **Director tour** → any document replace stops it (`refreshPausedDirector` tour branch: preview null, captured route + `edgeRepeat` cleared, status "Camera preview stopped — … re-run Preview Sequence"). Paused **connection/node/transition** previews keep the refresh contract — they ARE the framing-authoring surface (add/move view keys, edit FOV while paused; S3 D5), so their re-resolution is the authoring feedback loop, not drift. **Finding 2 resolved at the root:** replace-driven runId bumps are gone for tours (the only replace-driven bumps that existed); runId now changes only on deliberate restarts (install/play/swap/repeat). View switches are NOT replaces — D2 preservation unchanged.
- **D5 — `previewSelectedConnection` stays unwired.** Preview Edge owns edge transport (started from the Plan inspector or the candidate EdgeRuler CTA); node Preview Camera owns node poses. No third button.
- **D6 — Readouts are verify-only.** scope+direction+transport (`EditorCameraPreviewControls`), direction in the 3D inspector, ruler-per-scope via the panel branch (S3/S4) mounted in both views — no new UI.

### Work items by file

1. New `tests/lib/editor/app/p8-s5-interaction-matrix.test.ts` — `wired()` composition mirroring `EditorApp`'s workspace mapping (store + layoutInteraction + `EditorViewState`; reuse the `active-editor-selection.test.ts` pattern, including the exact `viewState.domain === 'camera'` → `setWorkspace('camera')` mapping so the no-op is real, not vacuous). Rows: Plan↔3D preservation (connection + tour, D2), undo/redo strict path (D3), sequence-edited-while-previewing (D4), delete-selected-edge facade path (status + selection downgrade + preview stop).
2. Docs: CURRENT.md + tracker after green.

### Test matrix — §G rows → concrete tests

All via `createMuseumEditorStore` fixtures + the `wired()` composition (existing `app/active-editor-selection.test.ts` pattern). Record real suite counts at implementation.

| §G row | Test |
|---|---|
| Plan ↔ 3D switch | `wired()`: install `connection` preview (previewEdge) → `setView('camera','plan')` → `setView('camera','3d')` → same `runId`, transport, playhead value, scope, direction; `navigationSelection` unchanged; repeat for `tour` preview. Also: switch while `playing` → not stopped, not reset (transport still `playing`, same `runId`) |
| Undo/redo | transaction: delete connection with active edge preview → `undo()` → preview survives when the connection + time location resolve; delete → `redo()` → preview safely reset (S2 D6 global-position rule). Assert the facade `#pruneInvalidCameraPreview` path, not `pruneIfStale` |
| Sequence edited while previewing | paused **tour** → delete an off-flow connection → **preview stopped** (hard reset; unconditional — even though the timeline still builds); undo while paused → stopped + "Camera preview stopped" status; paused **connection** preview → a framing edit (FOV/view key) keeps it refreshing (authoring contract); playing → same mutation returns `false` (guard) |
| Deleting selected edge | facade `deleteConnection` with active edge preview → preview stopped (null), captured route cleared, selection downgraded/cleared, status message set |
| Missing connection | already S2:64 — re-run, no new test |
| Reversed / Unsequenced / Zero-duration / Parallel | covered by S1–S4 suites — re-run, no new tests |

Acceptance: all §G rows green; the two rows that were untested (Plan↔3D,
strict undo/redo) now covered; no new commands or UI; existing suites stay
green.

### Boundaries / out of scope

No playhead-advancement change — Rig remains the only tick source;
owner-ratified (no auto-pause, no store-level tick). No new UI: the 3D
connection inspector stays as-is (selecting an edge + Play already
previews). No `previewSelectedConnection` wiring. No new commands / FSM /
selection semantics. No visitor/CameraDirector, no schema/codec, no
plan-project changes. Dots/envelope rendering untouched (S3/S6). Domain
switches (Scene↔Camera) stay out — §G covers the shared-view Plan↔3D axis
only; the existing `canSwitch` gate on visitor playback is unchanged.

**Deletion gating is accepted as-is in P8** — the `guided_connection` (flow
edges locked) and `disconnected_graph` (no stranded nodes / islands) locks
stay. How the UI should *surface* a locked delete (disable vs hide vs
explain-with-status) is a **future P3 UX design discussion** (context-menu
Delete actions), not P8 scope.

**Hard reset is tour-scoped (D4).** Paused Director **tour** previews stop on
any document replace; paused connection/node previews keep the refresh
contract because they are the framing-authoring surface (proven by the 5
`museum-editor-camera` authoring tests — a blanket reset would make view-key
authoring impossible). **Finding 2 (runId bumps on replace) is resolved at
the root:** the only replace-driven bumps were `refreshPausedDirector`'s tour
re-resolution, which hard reset removes — runId now changes only on
deliberate restarts (install/play/swap/repeat), so
`getCapturedCameraPreviewRoute(oldRunId)` nulls are only ever true after a
real restart.

### Risks & rollback

- **Vacuous no-op test:** the `wired()` Plan↔3D row must mirror `EditorApp`'s
  workspace mapping exactly (`viewState.domain === 'camera'` →
  `store.setWorkspace('camera')`), or the "preview survives" assertion passes
  because the store was never touched. Reuse the mapping expression, don't
  re-derive it.
- Rollback: the new test file only — one file, no data migration. Revert to
  S4 green tree.

## Slice 6 — design detail (folded 2026-08-22)

Detail for §F Slice 6, written into the umbrella per fold-and-delete (no
standalone doc existed). The readiness survey is grep-verified against the
tree on 2026-08-22; re-grep at implementation time.
**Routing:** P8.S6 — Luna low (33, 56% Luna low, DeepSeek V4 Flash, 0, open)
per `docs/plans/model-assessment.md`. Mechanical slice; may ride with any
later slice per §F.

### S6 readiness survey (grep-verified)

| Area | File:line | What it owns today | S6 relevance |
|---|---|---|---|
| Transition kind | `museum-editor.types.ts:63`, `store/camera-preview-controller.svelte.ts:157,187,302,787`, `store/camera-preview-commands.svelte.ts:417`, `store/navigation-graph-mutator.svelte.ts:1237`, `EditorCameraRig.svelte:379` (comment) | `CameraPreviewTransition` + FSM `startTransition` branch + `previewSelectedTransition` command + `releasePausedPreviewForTopology` case + `isPreviewStale` case + `previewScopeOf` `'legacy'` case | **UI-unreachable** — no component calls `previewSelectedTransition`/`startTransition` (grep-verified across `*.svelte`). Part A deletes the whole path; `previewScopeOf` loses `'legacy'` |
| Kind switches | 139 sites / 33 files (src + tests) | Discriminated `kind: 'node' \| 'connection' \| 'tour' \| 'transition'` preview union | Part B rename: `node`→`camera`, `connection`→`edge`, `tour`→`sequence` (types, FSM, rig, commands, components, tests). Compiler-checked — missed sites fail `tsc` loudly |
| `previewScopeOf` | `store/camera-preview-controller.svelte.ts:148-163` | Maps kinds → scopes (`node`→`camera`, `connection`→`edge`, `tour`→`sequence`, `transition`→`legacy`); comment: "No kind rename in S2; discriminated `PreviewScope` lands in S6 with the kind rename" | After Part B: identity mapping (`kind === scope`); `PreviewScope` drops `'legacy'` (`museum-editor.types.ts:88`); default → `null`. No component branches on `'legacy'` (panel falls through to the guided `{:else if timeline}` branch) — the S4 candidate-guard legacy-fallthrough note becomes moot |
| `previewGuidedTour` alias | `museum-editor.svelte.ts:1901` (facade), `store/camera-preview-commands.svelte.ts:323` (impl), delegation at `:614` (`previewSequence` → `previewGuidedTour`) | S4 made `previewSequence` canonical (AppBar ×2 + hook migrated); guided-era entry remains as internal delegate + facade alias | Part C: fold the impl into `previewSequence`, delete the facade alias; migrate **16 test callers across 4 files** (`p8-s2`, `p8-s4`, `museum-editor-camera`, `active-editor-selection`) |
| Guided identifiers | `museum-editor.svelte.ts:1158` `guidedTourNodeIds` (validated order — **≠** `mainFlowNodeIds` `:1164`, raw main flow), guided-ruler comments (`:761,892,906,1567,1585,1598,1616`), `EditorCameraTimelinePanel.svelte:23` chain | Preview-domain "guided" language | Part C sweep: preview-domain identifiers/comments/status messages → sequence language (`guidedTourNodeIds` → `sequenceNodeIds`). **Boundary:** P1.9/S10.1 flow machinery (`validateCurrentGuidedTourOrder`, `currentMainFlowNodeIds`, graph validation) keeps its naming — renaming churns unrelated P1.9/S10.1 tests for zero preview value |
| Serialization | Session-only runtime state (S2: never codec/history) | Preview kinds are never persisted | Rename/removal is safe — no codec/history/schema touch |

### S6 design decisions

- **D1 — Three mechanical parts, each independently revertible.** **A** transition retirement (smallest — do first), **B** kind rename, **C** alias + naming sweep. No FSM semantic change, no command-surface change, no UI behavior change in any part.
- **D2 — Kind rename is type-level only.** `node`→`camera`, `connection`→`edge`, `tour`→`sequence`; `PreviewScope` loses `'legacy'`; `previewScopeOf` becomes identity (`kind === scope`, default → `null`). Behavior-neutral: kinds are runtime-only session state (never codec/history — S2), so nothing persists the old names.
- **D3 — Transition removal is safe because the path is UI-unreachable today.** No component calls `previewSelectedTransition`/`startTransition` (grep-verified). Delete: the `CameraPreviewTransition` type, the FSM `startTransition` branch, `previewSelectedTransition` (commands + facade), the `releasePausedPreviewForTopology` + `isPreviewStale` cases, `previewScopeOf` `'legacy'`, and the transition coverage in 4 test files (migrate to connection previews or delete). `previewSelectedTransition` gets no public-API retention — nothing calls it.
- **D4 — `previewGuidedTour` folds into `previewSequence`.** S4 already migrated every UI caller; the internal impl + facade alias are now pure duplication. Fold the install logic into `previewSequence` and delete both the commands method and the facade getter. The 16 test callers migrate to `previewSequence` — the D6 restore branch only fires when `lastSequencePlayhead` is non-null, so fresh-install test callers are behaviorally equivalent; migrate in the same change or the suite breaks.
- **D5 — Naming-sweep boundary is preview-domain only.** `guidedTourNodeIds` → `sequenceNodeIds` (the timeline-panel chain); preview comments/status messages → sequence language. P1.9/S10.1 flow-validation and navigation-graph machinery (`validateCurrentGuidedTourOrder`, `currentMainFlowNodeIds`, `mainFlowNodeIds`) keeps its naming — separate domain, unrelated tests.
- **D6 — The test sweep is the bulk of the slice.** Strategy: type-level rename first (`tsc`-guided — every missed site is a compile error), then mechanical find/replace in tests, then run suites. Re-grep for `'tour'`/`'guided'`/`'transition'` string literals afterward (comments, status messages, test titles) — the compiler does not catch those.

### Work items by file

1. **Part A (transition retirement):** `museum-editor.types.ts` (drop `CameraPreviewTransition`), `store/camera-preview-controller.svelte.ts` (`startTransition` branch, `isPreviewStale` case, `releasePausedPreviewForTopology` case, `previewScopeOf` `'legacy'`), `store/camera-preview-commands.svelte.ts` + `museum-editor.svelte.ts` (`previewSelectedTransition`), transition coverage in `camera-preview-controller.test.ts` / `museum-editor-camera.test.ts` / `history-controller.test.ts` / `p8-s2-preview-scope.test.ts` → connection previews or delete.
2. **Part B (kind rename):** `node`→`camera`, `connection`→`edge`, `tour`→`sequence` across the 33 files (types, controller, commands, mutator, rig, `EditorCameraPreviewControls`, `EditorCameraTimelinePanel`, `hooks/use-camera-timeline`, `hooks/use-camera-preview`, `museum-editor.svelte.ts`, all P8 test files). `PreviewScope` drops `'legacy'`; `previewScopeOf` becomes identity.
3. **Part C (alias + naming):** fold `previewGuidedTour` into `previewSequence` (commands + facade), migrate the 16 test callers; preview-domain comment/status sweep. Re-grep `'guided'` in the preview domain.
4. Docs: CURRENT.md + tracker after green.

**Implementation notes (2026-08-22, all shipped green — 1970 tests / 1 skipped (net −1 from the transition-test merge, +1 contract test from the graph-invalidation follow-up), `svelte-check` 0/0, `vite build` clean):**

- **D5 boundary refinement — `guidedTourNodeIds` kept.** The plan's sweep listed `guidedTourNodeIds` → `sequenceNodeIds`, but the getter is the validated-order surface fed by `validateCurrentGuidedTourOrder` and consumed by the tree model, `CameraFlowPanel`, `EditorCameraTimelinePanel`, and 30+ P1.9 flow-order tests. Renaming it churns exactly the P1.9/S10.1 tests D5 says to leave alone, for zero preview value. The preview-domain sweep (kinds, commands, status messages, preview comments) is complete instead. Similarly, the timeline's "guided edge / guided direction / guided node" vocabulary is flow-domain and kept.
- **Transition test migration — the old error-path tests are unreachable for the exact-edge command.** Three mechanisms, all verified (follow-up investigation 2026-08-22): (1) **commit-failure rollback** — constructing an "unroutable" state by `begin → mutate live document → failing commit` is self-defeating: `HistoryController.commit` restores `document.replace(before)` on resolver failure, so the graph and document roll back together and the command sees a consistent (reverted) document (`connections = []` probe: commit false → connections restored to 4 → `previewSelectedConnection` succeeds). (2) **Endpoint injection** — `resolveSceneDocument` always injects the two node endpoints as the first/last anchors, so a legitimately committed zero-interior-anchor connection resolves to exactly 2 anchors, a legal straight-line route; "has no position anchors" is unreachable from any committed document (it exists as a defensive assertion for hand-built graphs). (3) **`state.graph` does NOT lag committed topology** — `EditorDocumentStore.replace()` atomically rebuilds `scene` + `state` on every successful commit/undo/redo/import (the original note's "stale graph" framing was a misdiagnosis: the probe's "2 anchors" were the injected endpoints, not stale data). All three pinned by a new contract test in `document-store.test.ts`. The replacement tests pin the command's two real guards: no selection → guidance status + no preview; live preview already active → no-op (never stacks).
- **The framing test's migration is select-then-play.** `selectConnection` auto-installs a paused edge preview (S3), so `previewSelectedConnection` after selection no-ops; the test now selects the edge, asserts `kind === 'edge'`, then `playCameraPreview()` to exercise the playing-preview framing lock.
- **`#resolveRoute` simplification.** With the transition kind gone, the controller's route resolver no longer has a `getCameraRoute(from,to)` fallback — `edge` is the only routed kind; `sequence` throws (exact timeline motions), `camera` throws (no route).
- **Rig branch collapse.** The else-branch ternary (`edge ? directed : createCameraMotion(route)`) collapsed to the directed-edge call only; the `createCameraMotion` import was dropped.

**Guided-vocabulary audit (2026-08-22, follow-up): decision = keep flow-derived terms, rename preview-domain surface.** Full inventory across the timeline domain, classified into three buckets:

1. **Flow-derived vocabulary — KEEP (accurate + load-bearing).** `editor-camera-timeline.ts` ("guided edge" type doc, `guidedRoute`/`guidedEdgeProgress`/`guidedPlayhead` locals, "has no guided edges" errors, "global guided ruler" docs), `camera-timeline-controller.svelte.ts` + facade doc comments ("guided edge" / "guided node" selection+seek docs, `guidedDirection` param), and `CameraFlowPanel` (chain authoring UI + `guided-*` CSS — P1.9, out of scope by D5). Rationale: the sequence timeline is *derived from the guided flow route* (`getFlowRoute`); "guided" here distinguishes flow-derived edges/nodes/direction from the S3 edge-local timeline and manual constructs. Renaming to "sequence edge" would be semantically wrong — the edges are flow edges; "sequence" names the preview mode that consumes them. `EditorCameraTimelineFrame.svelte:86` already composes both correctly: "Sequence · guided route & framing".
2. **Preview-domain user-visible — RENAMED.** `EditorCameraRig.svelte` error "The guided camera timeline is unavailable" → "The camera sequence timeline is unavailable" — the one user-facing string on the shipped sequence preview path; the surface is labeled "Preview Sequence" in the UI.
3. **Preview-domain comments — RENAMED (trivial).** `use-camera-timeline.svelte.ts` "guided play" → "sequence play"; `EditorCameraTimelinePanel.svelte` "no guided Dots" → "no sequence Dots" and "guided timeline" → "sequence timeline" (scope-branching panel); matching test title in `p8-s4-preview-sequence.test.ts`.

Separately: the word "transition" in `editor-camera-timeline.ts` ("camera transition", "chain transition") means the **motion between stops** (a duration), not the retired preview kind — keep; do not conflate in future sweeps.

**User-visible string sweep (2026-08-22, follow-up): renamed the stragglers, kept the flow product terms.**

- **Renamed (preview-era panel naming):** legacy shell header `EditorLeftSidebar.svelte` "Camera Tour" → "Camera Sequence"; 3D connection-inspector hint "viewport or Camera Tour" → "viewport or the Sequence Inspector" (matches the canonical P1.7 sidebar section name). Also cleaned 6 stale preview-kind comments ("TOUR preview" / "non-tour" / "tour-mode" / "For `tour`") in `camera-preview-controller.svelte.ts` + `camera-preview-commands.svelte.ts` — the S6 sweep had missed these because they don't use the `kind === 'tour'` literal pattern.
- **Kept (flow product vocabulary — accurate, and the S6 D5 boundary keeps the flow's "tour" naming):** "Main Visitor Tour" selector + title (`EditorCameraTimelineFrame` — the flow being previewed; the title already points to the Sequence Inspector for editing), "Tour playhead" vs "Reverse playhead" (`EditorCameraTimelineRuler` — direction semantics, same as the kept `guidedDirection`), "Tour paths" / "Tour" overlay toggles (`EditorViewportToolbar`, `LayoutDraftToolbar`), the flow-ordering status messages "…end of the tour" / "…leads the tour" (`navigation-graph-mutator` — pinned by tests), and "The flow has a missing transition…" (`EditorCameraTimelinePanel` — the motion between stops, not the retired kind).

**Graph-invalidation map (follow-up investigation 2026-08-22): the invalidation already lives in the right place — do not move it.**

1. **Single atomic rebuild point — `EditorDocumentStore.#rebuildRuntime()`** (`document-store.svelte.ts:196`). Called only by `replace()` (commit/undo/redo/import) and `updateRooms()`; it resolves the scene from the live document and constructs a fresh `MuseumStateStore` (graph included) in one assignment. This is the correct home: the graph is a *derived runtime of the committed document*, so per-mutation invalidation would be wrong (transactions would see half-mutated topology).
2. **Derived caches — the afterReplace listener chain** (`museum-editor.svelte.ts:563-577`): `#reconcileSelection()`, `refreshPausedDirector()`, `pruneIfStale()` (which calls `invalidateGraph()`), `invalidateGraph()`, and the Slice-4 listener. The preview controller's `#graphCache`/`#timelineCache` are key-cached and invalidated here — every successful replace touches them atomically.
3. **Mid-transaction semantics — intended.** Between begin and commit, `state.graph` reflects the pre-transaction document. That is safe because every route-resolving preview/timeline command guards on `isDocumentTransactionActive`, and the authoring mutators validate + commit atomically. The Plan surface reads the live document through its own per-call graph (`resolvePlanSceneGraphFromDocument`), so it sees mid-transaction state by design.
4. **Enforcement — `assertNavigationGraphMatchesScene`** (`scene.ts:577`): any hand-built graph must reference the same resolved scene instance. Keep using it; it is the tripwire if someone reintroduces a second graph source.

**Recommendation:** no code change needed. The only gap was documentation — the S6 note's "stale graph" framing was wrong and is corrected above, with the atomic-rebuild + endpoint-injection invariant pinned in `document-store.test.ts` so the confusion cannot recur.

### Test matrix — §F Slice 6 rows → concrete tests

| §F row | Test |
|---|---|
| Transition path removed | typecheck clean + `grep -r "transition" src/lib/editor` finds no preview-domain matches (FSM/command/type/scope); `previewScopeOf` never returns `'legacy'` |
| Kind rename behavior-neutral | full suite green after the rename (missed sites fail `tsc`); S2's `maps kinds to scopes` test rewritten as `previewScopeOf` identity |
| `previewGuidedTour` retired | no live callers (method + facade alias deleted; 16 test callers migrated); only an intentional historical note remains at `camera-preview-commands.svelte.ts:497` documenting the S6 fold; S4 matrix (previewSequence install/restore/one-node/loop) re-run green — no semantic drift |
| Naming sweep | preview-domain `'guided'`/`'tour'` string literals gone (comments, status messages, test titles); P1.9/S10.1 machinery untouched (its tests untouched) |

Acceptance: §F S6 bullets all green; no preview-domain `transition`/`tour`/`guided` remnants; existing suites stay green (P8 S5 baseline).

### Boundaries / out of scope

No FSM semantic change, no command-surface change, no UI behavior change. No serialization/codec/history/schema touch (preview kinds are runtime-only session state). P1.9/S10.1 flow-validation and navigation-graph machinery naming untouched. Visitor chunk untouched. Roll/Shots stay deferred (D5 umbrella).

### Risks & rollback

- **Kind rename is compiler-checked:** `tsc` surfaces every missed site; rollback = revert the rename change. The risk is test-title/comment remnants, caught by the final string-literal re-grep (D6).
- **`previewGuidedTour` fold must be atomic:** the 16 test callers migrate in the same change or the suite breaks; verify no drift on the restore branch (D4).
- **`'legacy'` removal:** grep-verified no component branches on it before deleting the scope case (D3).
- Rollback: three independently revertible parts (A/B/C) — each is a behavior-neutral mechanical change over the previous green tree.

## G. Edge-case matrix

| Case | Behavior |
|---|---|
| Reversed edge | Topology canonical; swap from/to; reverse view/timing tracks; arc-length position remap: edge-domain `1 − e` flip (playhead `1 − p` is never used) |
| Unsequenced endpoint | Edge timeline built straight from the connection; no flow-route/order-link calls |
| Zero/invalid duration | Static/completed pose for zero motion; invalid authored values → automatic duration + validation signal; never NaN/Infinity |
| Missing connection | Fail before installing preview state; disappearing while paused → stop + clear edge preview |
| Deleting selected edge | Stop preview, clear captured route, downgrade/clear selection, status message |
| Undo/redo | Rebuild caches; preserve scope/playhead only if IDs + time location still valid, else safe reset |
| Sequence edited while previewing | Playing state mutation-blocked (existing); paused Director **tour** → hard reset on any replace (P8 S5 owner decision 2026-08-22, status message); paused connection/node → keep refreshing (framing-authoring surface, S3 D5) |
| Plan ↔ 3D switch | Preserve scope, direction, time, selection; shared view axis untouched (P1.7 trap) |
| One-node Sequence | Static/no-motion representation; no fake edge |
| Two-node Sequence | Single edge, plays once; no implicit loop |
| End of Sequence | Complete + Replay/restart at final destination; closing edge only from real topology |
| Node-boundary scrub/play | Destination pose at boundary; next edge activates strictly after boundary; epsilon-tested both paths |
| Parallel connections | Editor always uses the selected `connectionId` (exact route), never BFS pick |

## H. Tests

**Existing coverage expected to change:** loop-enabled guided-timeline
expectations; `kind: 'tour'` assumptions; global-only
`cameraTimelinePlayhead` assertions; tests assuming guided-timeline
availability is a precondition for motion preview. Key suites:
`editor-camera-timeline.test.ts`, `museum-editor-camera.test.ts`,
`museum-editor-shell.test.ts`, `camera-route.test.ts`,
`camera-motion.test.ts`, `app/active-editor-selection.test.ts`,
`app/contracts.test.ts`.

**New coverage:** directed-edge resolver (forward/reverse/Unsequenced/parallel/
invalid-duration); editor parity (direct == timeline sample); scope FSM
transitions + invalidation; local scrubbing + repeat; reverse arc-length
remap; Sequence composition/end/Replay/boundary epsilon/holds; one- & two-node
flows; Plan invocation + Plan↔3D preservation; §G matrix rows.

## I. Risks & rollback

- **Timing parity ripple (S1):** correcting motion options on previously
  option-less paths changes animation feel for timed/eased edges — intended,
  but visually review fixtures; golden-sample updates are expected, not bugs.
- **Loop-semantics regression (S4):** accidental replacement of the derived
  closing edge by transport looping — pinned by dedicated tests (D3).
- **Stale snapshots / selection coupling (S2/S5):** mitigated by run-ID keyed
  snapshots (existing pattern) + matrix tests.
- **Roll/Shots creep:** out of scope by D5; lane reservation visual-only.
- **Rollback:** slices are serial and behavior-additive after S1; revert point
  = previous slice's green tree. S1 alone is safely revertible (pure refactor
  + parity fix with isolated golden updates).

## J. Boundaries

- `/museum` + `/museum/editor` frozen: no visitor chunk changes; editor code
  never enters visitor bundles. Visitor purity rules unchanged.
- One nav + one motion: everything composes `camera-route.ts` +
  `camera-motion.ts`; the resolver is a façade over them, not a second engine.
- No schema/codec changes in Slices 1–5 (session state only). Roll/Shots or
  runtime authored-timing parity require their own schema-bearing slices.
- Contract sync obligations: `components/camera-tour.md` (S3/S4),
  `Design-shell-specs.md` §camera (S3/S4), tracker + CURRENT per lifecycle.
