# P8 Slice 2 — Explicit preview scope state + transport semantics

**Date:** 2026-08-21
**Depends:** P8 S1 shipped (`editor-directed-edge-motion.ts` + 11 tests, `getCameraMotionOptions` widened)
**Status:** Planned — readiness survey closed (grep-verified)
**Routing:** Sol medium (54, 92% Sol max), margin 0 → escalate on first failure (see `docs/plans/model-assessment.md`)
**Umbrella:** `docs/plans/2026-08-21-P8-camera-preview-scopes.md` §F S2

## A. Readiness survey — grep-verified inventory (closes S2 gap)

| Area | File:line | What it owns today | S2 relevance |
|---|---|---|---|
| Preview union | `museum-editor.types.ts:45-86` | `EditorCameraPreviewState{mode,transport,runId,playhead,startedAtMs}` + kinds `node{nodeId}`, `transition{from,to}`, `connection{connectionId,direction,from,to}`, `tour{startNodeId}`. Single declaration barrel (Slice 3 debt collapsed). | Scope maps `node→camera`, `connection→edge`, `tour→sequence`, `transition→legacy`. Adding `scope` field would break exhaustive switches — S2 adds derived `previewScopeOf()` helper instead; kind rename deferred to S6. |
| Preview controller | `camera-preview-controller.svelte.ts:141-676` | `$state preview`, `followEnabled`, `recenterVersion`, `#{capturedRoute,nextRunId,timelineCache,timelineGraph,graphCache}`. Entries `startNode/Transition/Connection/Tour` (191-308). Transitions `play()` (resumes playhead, complete→0, re-captures director route, 314-342), `pause()` 344, `setPlayhead()` 355, `step()` 379 (P8 S1 already patched connection branch to `resolveDirectedEdgeMotionByDirection`), `markStarted/complete` 453-487, `setMode` 489, `stop()` 517 (preview=null+clear+follow=true). Snapshot ops 526-546. AfterReplace `refreshPausedDirector` 563 (keep-on-route-failure, re-resolves via `#resolveRoute`), `pruneIfStale` 596 (handles node+tour only — gap), `releaseIfTouches` 621, `invalidateGraph` 671. Cache `getTimeline()` 682 keyed by `document.state.graph` identity. | New state `edgeRepeat` as `$state` like `followEnabled`. New `resetToScopeStart()` transport op. Extend `pruneIfStale` to cover `connection` staleness. Extend `refreshPausedDirector` to validate `lastSequencePlayhead` against rebuilt timeline. Direction swap needs new `swapEdgeDirection()` remapping playhead via arc-length |
| Timeline controller | `camera-timeline-controller.svelte.ts:1-567` | Header notes `cameraTimelinePlayhead` stays facade `$state` (9.3 gotcha). Host interface 80-121. `seekCameraTimeline` 283 (uses `#timelineTravelDirection` 320: reverse discovery on same connection → reverse), `show*Pose` 192/223, `toggle/setCameraEdgeTravel` 334/352 (already does arc-length remap via `cameraTimelineEdgePlayheadAtProgress` + seeds reverse track transactionally) | S2 edge-scope preview swap reuses same arc-length pattern. Timeline playhead validity check for `lastSequencePlayhead` restore reuses `findEditorCameraTimelineEdge` |
| Selection/discovery | `selection-store.svelte.ts:1-157` + facade `museum-editor.svelte.ts:761-772` | `navigation` (5 kinds), `workspace`, `discoveryConnectionId/direction` with reducer invariants. Facade `activeCameraConnectionId/Direction` delegate to `selectionStore.setDiscovery`. | Discovery is where direction persists. S2 edge-swap must call `setDiscovery` + `expandActiveCameraDirection`. `lastSequencePlayhead` lives on facade next to `cameraTimelinePlayhead` (same $state pattern). |
| Commands layer | `camera-preview-commands.svelte.ts:152-745` | `prepareCameraPreview` 152, entries `previewGuidedTour` 314 (reuses `cameraTimelinePlayhead` as start), `previewSelectedNode` 353, `Transition` 379, `Connection` 421 (both block if `host.cameraPreview` exists). Transport `playCameraPreview` 539 (director re-resolves fresh, visitor uses captured, complete→0, syncs timeline playhead), `setCameraPreviewPlayhead` 595, `stopCameraPreview` 729 (cancels drag, `cancelDirectFramingDragOrFail`, `restoreCameraPreview` hook, preview=null, **preserves selection** per 740 comment), `completeCameraPreview` 699 | New commands: `previewEdge(connectionId,direction)` (explicit scope switch, snapshots `cameraTimelinePlayhead`→`lastSequencePlayhead` first), `previewSequence()` wrapper around `previewGuidedTour` restoring from `lastSequencePlayhead`, `swapEdgeDirection()` |
| Facade wiring | `museum-editor.svelte.ts:547-561,1357-1390` | `addAfterReplaceListener` chain: `reconcileSelection` 547, `refreshPausedDirector`→status 552, `pruneIfStale` 556, `invalidateGraph` 557. Reconcile ~1357 calls `pruneIfStale` + validation + `stopCameraPreview` | S2 adds `lastSequencePlayhead` $state + delegates. No new afterReplace listener — reuse existing two. |
| Session | `store/session-state.svelte.ts` | Expand/collapse, discovery persistence | No change in S2 |
| Resolver (S1) | `editor-directed-edge-motion.ts` | `ForConnection(ByDirection,orientationPair)` + widened `getCameraMotionOptions(Pick<timing>)` | Reused for direction-swap remapping via `edgeProgress` round-trip |

**Gap closed:** prior S2 readiness note asked for "FSM/session/history hook points" — table above enumerates all.

## B. Design decisions

**D1 Scope representation:** add pure helper `previewScopeOf(preview): 'camera'|'edge'|'sequence'|'legacy'|null` mapping kind→scope. No kind rename in S2 (D6). `transition` stays as `legacy` scope.

**D2 New session slots:**
- `lastSequencePlayhead: number|null` — facade `$state` (sibling to `cameraTimelinePlayhead`). Written when leaving `sequence` scope (starting edge preview); read when entering `sequence` (Preview Sequence) to seed playhead if edge still exists. Null = no prior sequence.
- `edgeRepeat: boolean` — controller `$state` (default false, per-preview instance like `followEnabled`). Toggled via new command; survives pause/play within same preview, cleared on new `startConnection`/stop.

**D3 Transport — additive, not breaking:** keep `stopCameraPreview()` teardown semantics (Phase 2.1 selection preservation, 22 `museum-editor-camera` tests depend). Add `resetToScopeStart():boolean` — `paused` + `playhead 0` + sync facade timeline playhead 0 for tour, keep preview installed. UI wires later (S3/S4); S2 delivers state op. `play()` from `complete` already restarts at 0 — Replay affordance is UI; no new `replay()` needed. **Decision locked conservatively** — owner can flip to reinterpret Stop as transport-reset only if desired.

**D4 Repeat semantics:** when `edgeRepeat && kind==='connection' && transport==='playing'` reaches `complete`, `completeCameraPreview()` auto-restarts (new runId, `playing` at 0, `startedAtMs` now) instead of staying `complete`. Rig already handles `durationSeconds===0`→immediate complete.

**D5 Direction swap:** new `swapEdgePreviewDirection()` — only when `kind==='connection' && paused`. Compute `edgeProgress = cameraMotionEdgeProgressAtProgress(oldMotion,0,playhead)`, build reverse route, `ForConnection(connection, oppositeDir, newRoute)`, `playhead' = cameraMotionProgressAtEdgeProgress(newMotion,0,edgeProgress)` (physical location, not `1-p`), new runId, update discovery. Keeps `edgeRepeat`.

**D6 Preservation:** Edge→Sequence restores `lastSequencePlayhead` only if `findEditorCameraTimelineEdge` + progress maps to same edge set (connectionId present and `cameraTimelineProgressAtEdgeProgress` non-null). Else start at 0.

**D7 Invalidation:** extend `pruneIfStale` to drop `connection` when `!graph.connections.find(id)` or `!nodeExists(from/to)`. `refreshPausedDirector` tour branch keeps only if `readCameraTimeline()` succeeds and restored `lastSequencePlayhead` still maps (see D6). `releaseIfTouches` already covers deletion via mutators.

**D8 P7.5 fold-in:** `cameraTimelinePlayhead` stays facade-owned through S2 (9.3). Folding ownership to timeline controller stays post-S4 as recorded in `docs/plans/README.md`.

## C. State model delta

```ts
// museum-editor.types.ts — no type added, helper in controller:
// previewScopeOf(p: EditorCameraPreview): 'camera'|'edge'|'sequence'|'legacy'|null

// museum-editor.svelte.ts facade:
lastSequencePlayhead = $state<number | null>(null)

// camera-preview-controller.svelte.ts:
edgeRepeat = $state(false)

// no schema/codec change — all session state
```

## D. Work items by file

1. **museum-editor.types.ts** — export `PreviewScope` type alias if desired (optional); no breaking change.
2. **camera-preview-controller.svelte.ts** — add `edgeRepeat`, `previewScopeOf` export, `resetToScopeStart()`, `swapEdgeDirection()`, extend `pruneIfStale` connection branch, extend `refreshPausedDirector` with `lastSequencePlayhead` validity, clear `edgeRepeat` on `startConnection/stop`.
3. **camera-preview-commands.svelte.ts** — add `previewEdge(connectionId,dir)`, `previewSequence()` (saves/restores `lastSequencePlayhead`, delegates to `previewGuidedTour`), `toggleEdgePreviewDirection()`/`swapEdgePreviewDirection()`, `setEdgePreviewRepeat(bool)`, `resetPreviewToScopeStart()`, branch `completeCameraPreview` for repeat auto-restart. Keep `stopCameraPreview` untouched.
4. **museum-editor.svelte.ts** — add `lastSequencePlayhead` $state + `get/set lastSequencePlayhead` accessors for host interface, wire new delegates, pass through `edgeRepeat` if needed for UI read.
5. **camera-preview-controller host interface** — add `lastSequencePlayhead` to `EditorCameraTimelineControllerHost` if controller needs it (otherwise facade owns alone).
6. **No changes:** `CameraDirector.svelte`, `museum-state`, visitor chunks; `editor-directed-edge-motion.ts` reused as-is; `camera-timeline-controller` unchanged except maybe helper exposure.

## E. Test matrix — §G rows → concrete tests

All via `createMuseumEditorStore` fixtures (existing `museum-editor-camera.test.ts` pattern) + small unit tests for `previewScopeOf`.

| §G row | Test |
|---|---|
| scope mapping | `previewScopeOf` unit: node→camera, connection→edge, tour→sequence, transition→legacy, null→null |
| select-edge while sequence playing | seek blocked (`#canSeek` false) + `previewSelectedConnection` no-ops → tour still `playing` |
| Preview Edge explicit switch | saves `lastSequencePlayhead` (= prior `cameraTimelinePlayhead`), installs `connection` paused |
| Preview Sequence return (valid) | restores `lastSequencePlayhead` when edge still present (`cameraTimelineProgressAtEdgeProgress` non-null) |
| Preview Sequence return (invalid) | resets to 0 when connection deleted / timeline rebuilt without that edge |
| edgeRepeat auto-restart | `completeCameraPreview` with `edgeRepeat=true` → new runId `playing` at 0, not `complete` |
| direction swap preserves pose | paused edge swap: `sample(oldMotion,playhead).position ≈ sample(newMotion,playhead').position` |
| direction swap keeps repeat+discovery | repeat flag retained, `activeCameraDirection` flipped |
| delete selected edge | `releaseIfTouches` / `pruneIfStale` → preview null after document replace |
| undo restores edge | `refreshPausedDirector` keeps preview (no status) when connection reappears |
| zero-duration edge | resolver `durationFallback` path → Rig immediate complete, transport `complete` |
| one/two-node flow | `previewSequence` fails gracefully (existing `minimum_guided_nodes` status) when timeline unbuildable |

Acceptance: all §G rows covered, no visible UI beyond labels, existing 1921 tests stay green.

## F. Boundaries / out of scope

- No timeline UI (local ruler, scrubber) — S3.
- No whole-Sequence global ruler composition change — S4.
- No Plan/3D integration — S5.
- No `transition` kind removal — S6.
- No visitor runtime change (`CameraDirector`).
- No schema migration.

## G. Risks & rollback

- **Stop reinterpretation** — mitigated by additive `resetToScopeStart` (no teardown change). If owner later wants Stop=reset, swap wiring in S3.
- **Stale snapshot vs live timing** — reuse S1 `ForConnection` pattern (captured route + live timing) for swap path.
- **P7.5 overlap** — `cameraTimelinePlayhead` ownership stays facade; no conflict until P7 resumes post-S4.
- Rollback: revert three files (`museum-editor.types`, controller, commands) + facade slot; no data migration.

## H. Execution order

1. Add `DirectedEdgeTimingSource` already done in S1 — reuse.
2. Types helper + controller state (`edgeRepeat`, scope helper, `resetToScopeStart`, `swapEdgeDirection`, prune extension).
3. Facade `lastSequencePlayhead` slot + delegates.
4. Commands (`previewEdge`, `previewSequence`, `complete` repeat branch).
5. Tests (unit + `museum-editor-camera.test.ts` additions).
6. `svelte-check` + `vitest` green.
