# H1 S10 — Camera-context extraction and graph contracts

**Date:** 2026-08-17  
**Status:** Approved — technical prerequisite for S10.2 (Camera Flow model) and S10.1 (UX/UI rework)  
**Implementation status:** Complete (uncommitted); S10.2 Camera Flow model and S10.1 UX/UI rework remain pending  
**Parent:** [`2026-08-14-graphics-h1-unified-3d-editing.md`](./2026-08-14-graphics-h1-unified-3d-editing.md) (umbrella step 10)  
**Prerequisite:** S8.2 (Chopin sweep) · S7 (camera gizmo adapter) · S4 (unified hierarchy)  
**Handoff:** [`../../hand-off/CURRENT.md`](../../hand-off/CURRENT.md)  
**Difficulty:** 7/10  
**Implementation:** Frontier  
**Sequence:** First of three S10 slices — technical extraction before the S10.2 Camera Flow model and the S10.1 UX/UI rework  
**Follow-up:** [`2026-08-17-graphics-h1-s10.2-camera-flow-model.md`](./2026-08-17-graphics-h1-s10.2-camera-flow-model.md)

## Sequence decision

**Do S10 first, then S10.2, then S10.1.** S10 establishes the explicit 3D-context
seams, context-safe render gates, graph contracts, and selection semantics
while keeping the relic isolated. S10.2 reworks the ordering model into the
open-chain Camera Flow (no loop requirement). S10.1 then composes those stable
seams and the new model into the visible Scene / Camera workspace UI,
sidebar, toolbar, and transitions.

Doing the visual rework first would make the UI depend on the current
relic-era `currentWorkspace` and `cameraAgnosticViewMenu` escape hatches, then
force a second shell rewrite when the technical extraction lands. S10 is
therefore the contract and plumbing slice; S10.2 is the model/order-semantics
slice; S10.1 is the product/UI slice.

## Goal

Extract Camera authoring into a first-class H1 **Camera context** keyed to
`EditorViewState.active3dContext === 'camera'`, without creating a second store,
document domain, route graph, or motion system. S10 makes camera-aware
components consume an explicit context contract instead of reaching through
relic-era workspace flags, preserves the S7 camera-gizmo adapter, and keeps
Plan mutation-safe and `/museum/editor` frozen.

S1 already mounted the fused Canvas, S2 landed first-node placement, S4 put the
Camera Tour branch in the unified hierarchy, S7 extracted the camera gizmo
adapter, and the camera timeline already mounts in 3D. S10 closes the remaining
technical seam. The dedicated Camera sidebar, final toolbar composition,
app-bar relocation, transition motion, and polished empty state are deferred
to S10.1, which consumes the seams established here.

## Technical boundary

S10 owns:

- explicit `context: 'scene' | 'camera'` plumbing for H1 camera-aware components;
- context-safe helper and timeline render gates without changing the relic mount;
- the Scene-versus-Camera View-menu row contract;
- the pure Close-loop eligibility predicate and one-transaction graph mutation;
- the active-selection-versus-context distinction used by inspector panels;
- contract-test updates, including the existing S1 View-menu assertions.

S10.1 owns the visible workspace re-composition: the dedicated Camera sidebar,
final toolbar layout, Place Camera relocation, transition motion, and the
polished Scene/Camera View-menu presentation.

## Current state

| Concern | Today |
|---|---|
| Context switcher | `H1AppBar` renders `Scene | Camera` → `viewState.active3dContext` (`EditorViewState`) |
| Camera helpers | `EditorCameraRig` is always mounted as shared editor camera infrastructure; authoring overlays (`EditorCameraHelpers` / `EditorCameraPathHelpers` / `EditorCameraFramingHelpers` / `EditorCameraViewHelpers`) are gated by `store.viewportShow*` flags |
| Helper visibility UI | `EditorViewportToolbar` View menu is surfaced in both H1 contexts through `cameraAgnosticViewMenu`; its rows are not yet context-specific |
| Camera tree | `UnifiedProjectTree` Camera Tour branch (`GuidedTourPanel`), `interactive`-gated; dedicated Camera sidebar is deferred to S10.1 |
| Timeline / playback | `EditorCameraTimelineFrame` is mounted in `H1EditorApp` whenever `viewMode === '3d'` (both contexts); it is a full-width bottom grid strip with a horizontal resize handle, not a sidebar panel |
| Close-loop graph contract | No pure predicate or atomic authoring operation exists for an open chain; `validateCurrentGuidedTourOrder()` only accepts a complete reciprocal cycle |
| Placement / preview | `H1AppBar` places Place Camera beside Undo/Redo/export; Preview Tour also lives in the app bar |
| Gizmo | `camera-gizmo-adapter.svelte.ts` provides world-translate node/anchor/view-target editing, one `scene` history entry, and epsilon no-ops |
| Inspector | `EditorInspector` is domain-driven via `activeSelection`; camera panels must remain selection-domain-driven rather than context-driven |
| Guided cycle / preview | `EditorCameraTimelinePanel` renders a dead-end "Guided timeline unavailable" when `getCameraTimeline() === null`; `canStartTourPreview` is the authoritative gate |
| Relic | `MuseumEditorApp` keeps the frozen Scene · Camera workspace (`EditorAppBar`, `EditorLeftSidebar`, `EditorViewport`) |

## S10 technical target

```text
H1 3D scene context                           H1 3D camera context
context === 'scene'                            context === 'camera'
  → explicit context prop/seam                  → explicit context prop/seam
  → scene transform/select contract              → camera helper render gates
  → View menu: Ceiling only                    → View menu: camera helper rows
  → no full camera timeline                    → camera timeline bottom-strip gate
                                               → pure Close-loop predicate
                                               → atomic edge + reciprocal-link mutation
                                               → selection-domain inspector contract

Relic /museum/editor (frozen)                 H1 S10.1 UI follow-up
  → legacy props and behavior unchanged          → dedicated sidebar + final chrome
                                               → transitions + polished workspace shell
```

`EditorCameraRig` remains always mounted as shared viewport infrastructure. The
context gate applies to camera authoring overlays and camera chrome, not to the
editor camera itself.

## Locked decisions

### Technical extraction precedes the UI rework

- S10 must land and pass its contracts before S10.1 starts.
- S10 does not require the final Camera sidebar, polished toolbar, app-bar
  relocation, or animated workspace transition to be present.
- S10.1 may assume the context prop, context gates, Close-loop mutator, and
  selection semantics are stable.

### Context and chrome contracts

- No new store, document domain, camera fields, route graph, or motion system.
  Scene and Camera remain `EditorViewState.active3dContext` values.
- H1 camera-aware components receive an explicit `context: 'scene' | 'camera'`
  prop. H1 does not use `cameraAgnosticViewMenu`; the relic keeps its existing
  camera-only fallback because it does not pass the new prop.
- The Scene View menu contains **Ceiling only**. The Camera View menu contains
  **Node handles**, **Tour paths**, and **Framing & FOV**, but not Ceiling.
  S10 pins this row contract; S10.1 owns the final visual composition.
- `EditorCameraRig` always mounts. Camera authoring overlays are visible only
  in Camera and remain individually controlled by `viewportShowNodes`,
  `viewportShowPaths`, and `viewportShowFraming`.
- Node-handle visibility must preserve the connect-flow override:
  `isCameraContext && (store.viewportShowNodes ||
  store.forceMountCameraNodeHandles)`. The S10 contract must not claim that
  handles mount only when `viewportShowNodes` is true.
- The timeline remains `EditorCameraTimelineFrame` in the full-width bottom
  grid slot. It mounts only for
  `viewMode === '3d' && active3dContext === 'camera'`; it does not move into
  the sidebar. S10.1 may refine its surrounding layout but must preserve the
  frame's bottom-strip resize/header contract.

### Selection, context, and switching

- Helper, tool, and timeline chrome follows the active 3D context.
- Inspector content follows the active selection domain. A preserved camera
  selection may therefore keep camera inspector panels visible in Scene; this
  is intentional and is not a contradiction with camera chrome being
  context-only.
- The pure switch contract is tested with no pending navigation command, no
  active editor interaction/transaction, and no playing preview. Under those
  preconditions Scene ↔ Camera and Plan ↔ 3D add no document history, document
  mutation, or selection-domain change.
- Existing switch side effects remain intentional: switching away from Camera
  stops an active preview, switching cancels a pending navigation command, and
  Camera forces the timeline expanded state while Scene restores its remembered
  preference. These are session effects, not document/history changes.

### Guided-cycle completion is a strict graph contract

S10 adds a pure `findClosableGuidedChain(document)` predicate. It returns a
candidate only when all of the following are true:

1. The candidate contains at least three nodes and is the complete authored
   navigation graph; no free node or second component is silently ignored.
   Exactly two connected nodes are a separate bootstrap case described below,
   because one undirected edge already represents both travel directions.
2. Every node has neither `nextNodeId` nor `previousNodeId`; partial or already
   reciprocal guided links are rejected.
3. The graph has exactly `N - 1` connections for `N` nodes, exactly one
   undirected connection for every adjacent pair, and no parallel edges.
4. The graph is one simple path: exactly two degree-one endpoints, every other
   node has degree two, and no branch or external incident edge exists.
5. The deterministic forward order starts at the endpoint appearing first in
   document order, visits every node exactly once, and has no existing
   last-to-first return edge.

This is deliberately conservative: an ambiguous graph does not show Close
loop. The predicate is pure and separately unit-tested for a valid chain,
branch, parallel edge, existing return edge, partial links, and extra nodes.

**Two-node bootstrap:** two camera nodes connected by one edge are not eligible
for `findClosableGuidedChain()` because adding a second undirected return edge
would be a duplicate. They are nevertheless a valid guided cycle when their
order is explicit: `setGuidedTourOrder([existingNodeId, newNodeId])` writes the
same node as each node's reciprocal `nextNodeId` / `previousNodeId` without
creating another connection. The second-node placement flow seeds that order in
its existing scene transaction, so `canStartTourPreview` becomes true as soon
as the first connection commits. Any separately authored two-node graph must
surface the same explicit order action rather than showing Close loop.

The mutator is a dedicated `closeGuidedTourLoop()` operation, not a direct call
to `connectNavigationNodes()`. It reuses the lower-level straight-edge append
helper, adds exactly the missing return connection from last to first, writes
all reciprocal `nextNodeId` / `previousNodeId` links, and commits one `scene`
history entry. It never creates nodes or invents an entire route. The operation
intentionally selects the new return connection and posts a confirmation status
message; that selection jump is accepted UX because it exposes the edge the user
just created and matches the existing connection-mutator behavior.

### Plan and relic boundaries

- `H1PlanView` exposes no camera mutation path. Read-only camera references may
  remain, but no Plan control may call a camera mutator.
- `/museum/editor` keeps `EditorAppBar`, `EditorLeftSidebar`, `EditorViewport`,
  legacy props, and legacy camera workspace behavior untouched.
- Moving Place Camera later is chrome-only: the H1 `H1AppBar` button is the
  only current UI entry, while `beginCameraPlacement()`, placement hints, and
  pending-command selection handling remain unchanged.

## Implementation steps

### 0. Pin contracts as failing tests first

Extend `tests/lib/editor/h1/contracts.test.ts` or add
`tests/lib/editor/h1/camera-context.test.ts` with these assertions:

- H1 replaces `cameraAgnosticViewMenu` with `context: 'scene' | 'camera'`;
  update the existing S1 assertions at `contracts.test.ts:301–311` rather than
  leaving them to fail after implementation.
- Scene View-menu source contains Ceiling and no camera-helper rows; Camera
  View-menu source contains the three camera-helper rows and no Ceiling.
- `EditorCameraTimelineFrame` mounts only in Camera and remains the full-width
  bottom frame.
- Camera overlay groups are Camera-only; `EditorCameraRig` remains mounted;
  node handles preserve `forceMountCameraNodeHandles` during connect flows.
- `findClosableGuidedChain` is pure and rejects ambiguous graphs; the close
  operation creates one history entry, writes reciprocal links, selects the
  new connection, and posts status.
- Switch tests pin the preconditions and the intentional pending-command,
  preview-stop, and timeline-preference side effects.
- Camera inspector behavior follows the active selection domain even when the
  active 3D context is Scene; helper/tool/timeline chrome follows context.
- Plan has no camera mutation surface and relic source remains unchanged.

### 1. Thread the explicit context seam

- `H1EditorApp` derives `isSceneContext` / `isCameraContext` from
  `viewState.active3dContext` and passes the context to `H13DView` and the H1
  toolbar path.
- `EditorViewportToolbar` accepts `context: 'scene' | 'camera'` for H1 and
  keeps the absent-prop relic fallback. Remove the H1-only
  `cameraAgnosticViewMenu` escape hatch.
- Keep the existing `store.currentWorkspace` mapping only at the H1
  composition boundary; H1 child chrome reads the explicit context prop.

### 2. Apply context-safe helper and timeline gates

- In `H13DView`, keep the `MuseumScene` camera snippet and `EditorCameraRig`
  mounted, but gate `EditorCameraPathHelpers`, `EditorCameraViewHelpers`,
  `EditorCameraFramingHelpers`, and node-handle groups on Camera context.
- Preserve `viewportShowNodes || forceMountCameraNodeHandles` inside the node
  gate and preserve all connect-pending-node rendering behavior.
- In `H1EditorApp`, mount `EditorCameraTimelineFrame` only for 3D Camera and
  keep `grid-area: bottom`; do not move timeline ownership to the sidebar.

### 3. Add the pure Close-loop contract and atomic mutator

- Add the pure predicate and focused graph tests described above.
- Add `closeGuidedTourLoop()` to the navigation graph mutator/store facade.
  Validate again at mutation time, guard playback/interactions/pending commands,
  append only the return edge, rewrite reciprocal links, and commit once.
- Preserve the two-node bootstrap: the second-node placement flow seeds
  `[existing, new]` reciprocal links in its existing transaction, while a
  separately authored two-node graph uses the existing `setGuidedTourOrder`
  operation and adds no duplicate connection.
- Keep `connectNavigationNodes()` behavior unchanged for ordinary connection
  authoring. The new Close-loop operation explicitly owns selection of the new
  return edge and its status message.

### 4. Preserve domain-driven inspector semantics

- Audit `EditorInspector` and every camera panel so camera panel selection is
  keyed by `activeSelection.active.domain === 'camera'` plus the specific
  navigation selection kind.
- Do not use context to clear a preserved selection or to hide a valid camera
  inspector panel. Context gates apply to helper/tool/timeline chrome.
- Keep the relic's `currentWorkspace` fallback when `activeSelection` is absent.

### 5. Handoff to S10.1

Before starting S10.1, verify the technical seam is complete: context props
are explicit, H1 helper/timeline gates are context-safe, Close loop has a pure
predicate plus one-entry mutator, inspector selection semantics are pinned,
existing contract tests are updated, and `/museum/editor` is unchanged.

## Regression matrix

| Concern | Required assertion |
|---|---|
| Sequence | S10 lands before S10.1; S10 exposes seams, not the final workspace redesign |
| Context prop | H1 uses `context: 'scene' | 'camera'`; relic keeps absent-prop fallback |
| View rows | Scene exposes Ceiling only; Camera exposes node/path/framing rows only |
| Helper gate | Camera overlay groups mount only in Camera; `EditorCameraRig` always mounts |
| Connect override | `forceMountCameraNodeHandles` still exposes node handles during connect flows |
| Timeline gate | `EditorCameraTimelineFrame` is bottom-strip-only and mounts only in Camera |
| Switch purity | With pinned preconditions, switching changes no document/history/selection domain |
| Switch side effects | Pending command cancellation, preview stop, and timeline preference changes are intentional session effects |
| Selection split | Context controls chrome; active selection domain controls inspector panels |
| Guided cycle | Only an unambiguous 3+ node simple path gets Close loop; branches/parallel/partial/closed graphs do not; a two-node bootstrap/order makes preview available without a duplicate edge |
| Close loop | One return edge + reciprocal links in one `scene` entry; new connection is selected and status is posted; two-node order writes links without a second edge |
| Plan boundary | Plan has no camera mutation path |
| Relic frozen | `/museum/editor` behavior and legacy View-menu fallback unchanged |
| Purity | No camera authoring module enters the visitor bundle; `$lib/layout/**` remains renderer-neutral |

## Non-goals (deferred to S10.1 or later)

- Dedicated Camera sidebar and final Scene/Camera workspace layout.
- Polished camera toolbar, Place Camera relocation, and transition animation.
- New camera fields, second graph, auto-tour generation, or multi-story.
- Camera authoring in Plan (read-only references only).
- Blender-style path/timeline editing or keyframe easing UI rework.
- Removing the frozen `/museum/editor` camera workspace.

## Verification

```text
npm test -w @portfolio/museum
npm run check -w @portfolio/museum
npm run build -w @portfolio/museum
```

Also run the S10.1 handoff manual smoke after the technical slice: add two
cameras, confirm the concrete numbered order makes Preview Tour available
without a duplicate edge; then create a 3+ node open simple camera chain,
confirm Close loop is eligible only for that graph, close it, verify the
selected return connection and one undo entry, then switch Scene ↔ Camera and
confirm chrome/context behavior without touching the relic route.
