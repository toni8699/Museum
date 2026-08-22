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

- Extend preview FSM with `PreviewScope` per §D4; `tour → sequence`,
  `connection → edge` mappings; `transition` kept as legacy.
- Transport: Play resumes current playhead; Pause freezes; Stop returns to
  scope start; completed previews restart on Play; Sequence end marks
  complete + Replay affordance.
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

### Slice 5 — Plan / Camera 3D integration + interaction matrix

- Camera Plan: Preview Camera + Preview Edge invocations (with direction
  chooser in connection inspector); switching to Camera 3D preserves
  selection; topology editing read-only while visitor playback active.
- Camera 3D: scope + direction readout, correct ruler per scope, transport
  state; Plan↔3D shared-view switch never stops a running preview.
- Full interaction coverage of §G matrix (selection/scope/undo/delete/view
  switches) at component level.

### Slice 6 — Legacy retirement (mechanical, optional timing)

- Remove `kind: 'transition'` compatibility path once callers migrate; delete
  `tour`/`guided`-era aliases (D6); sweep internal naming to
  camera/edge/sequence. Behavior-neutral; may ride with any later slice.

## G. Edge-case matrix

| Case | Behavior |
|---|---|
| Reversed edge | Topology canonical; swap from/to; reverse view/timing tracks; arc-length position remap (never `1 − p`) |
| Unsequenced endpoint | Edge timeline built straight from the connection; no flow-route/order-link calls |
| Zero/invalid duration | Static/completed pose for zero motion; invalid authored values → automatic duration + validation signal; never NaN/Infinity |
| Missing connection | Fail before installing preview state; disappearing while paused → stop + clear edge preview |
| Deleting selected edge | Stop preview, clear captured route, downgrade/clear selection, status message |
| Undo/redo | Rebuild caches; preserve scope/playhead only if IDs + time location still valid, else safe reset |
| Sequence edited while previewing | Playing state mutation-blocked (existing); paused → rebuild timeline post-commit, preserve time only if edges still resolve |
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
