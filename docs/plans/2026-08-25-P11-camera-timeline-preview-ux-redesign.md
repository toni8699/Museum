# P11 — Camera Timeline / Preview UX redesign

**Date:** 2026-08-25
**Status:** proposed — next implementation slice after P3B.6
**Tracker:** [`docs/plans/README.md`](README.md) — **P11**, depends on: P8 + P3B.5; P3B.6 is closed and remaining P3B QA follows P11
**Placement decision:** a new P11 follow-up, scheduled immediately after closed P3B.6 and ahead of the remaining P3B preview-affordance QA and further Camera visual polish. This is a planning decision; no implementation is included.

## Recommendation

**Best slot:** keep this as a new P11 behavior/interaction plan and execute its semantic/controller slices immediately after closed P3B.6, before P3B.7/P3B.8 preview QA. Do not fold it into the shipped P8 umbrella, and do not fold the behavior into P3 cosmetics.

**Why:** P8 S1–S6 are shipped and provide the route resolver, three runtime preview kinds, captured-route/run-id invalidation, edge-local timeline support, sequence composition, and Plan↔3D continuity. The requested redesign changes the public contract of that shipped behavior—especially selection-driven scope and paused authoring—not merely its appearance. P3 core is shipped and P3B.5 has already established the current affordance baseline; the redesign should replace the conflicting P3B preview rules intentionally rather than silently letting them drift.

**Depends on:** P8 S1–S6; the canonical Camera selection/reducer and controller split from P7; the current P3B.5 shared Plan/3D preview entry points; closed P3B.6 retained-edge parity; and existing `camera-route.ts` / `camera-motion.ts` / `editor-camera-timeline.ts` contracts. P3B.7/P3B.8 preview QA waits for P11 semantics.

**Blocks:** the final Camera preview-affordance QA and polished timeline chrome in P3B; any visual treatment that assumes separate selection and preview identities or modal Stop-based preview. It does not block unrelated P3B orientation work or the deferred P3.4/P3.5 tail.

**Should be:**

- **new P8.x slice:** no — P8 is shipped and its umbrella is an historical implementation record; reopening it would obscure the contract change.
- **amendment to existing P8 slice:** no — retain P8 as the baseline dependency and explicitly supersede its D1/D2 selection rule here.
- **prerequisite before P3:** no — P3 core is shipped.
- **folded into P3:** no — behavior/state ownership is not cosmetic P3 work.
- **later follow-up:** yes, but schedule it before remaining P3B Camera preview QA and styling; this is the smallest safe placement now.

## 1. Current behavior (audit snapshot)

The current shipped baseline is documented in [`2026-08-21-P8-camera-preview-scopes.md`](2026-08-21-P8-camera-preview-scopes.md) and [`2026-08-24-P3B-orientation-preview-affordances.md`](2026-08-24-P3B-orientation-preview-affordances.md):

- P8 models `camera`, `edge`, and `sequence` preview scopes over one `camera-route.ts` / `camera-motion.ts` pipeline. Preview state is session-only and keyed by `runId` with captured-route invalidation.
- `editor-types.ts` stores the discriminated preview union; `camera-preview-controller.svelte.ts` owns the FSM, follow/recenter state, captured route, repeat flag, and stale invalidation; `camera-preview-commands.svelte.ts` orchestrates entry and transport; `camera-timeline-controller.svelte.ts` owns the Camera timeline playhead and timeline selection operations.
- `EditorCameraPreviewControls.svelte` currently exposes separate Observer and Through Camera buttons, a text scope/status row, Play/Pause/Resume/Replay text, Follow on/off, Recenter, and visible Stop Preview. The component currently uses Lucide icons but combines them with verbose labels.
- `EditorCameraTimelinePanel.svelte` mounts the guided ruler/dots around a loop-readout row and renders a large `Camera flow unavailable` / `No camera flow yet` panel when the sequence timeline is absent. It does not yet treat the selected Camera/Edge as the primary scope in the UX contract.
- `use-camera-timeline.svelte.ts` derives edge-local data from an active edge preview first, otherwise from `activeCameraConnectionId`/direction. Its transport and scrub guards still distinguish active preview from candidate selection, and its labels retain Resume preview / Replay preview language.
- `selection-actions.svelte.ts` currently allows a paused preview observer exception for connection selection, but otherwise selection is guarded by the broad preview mutation predicate. Selection does not install or change preview scope. `mutation-guards.svelte.ts` reports document mutation blocked for visitor previews or any non-paused preview; many mutators and shell regions consume that predicate directly.
- `CameraFlowPanel.svelte` and `EditorCameraEdgePreviewActions.svelte` provide explicit Preview Camera / Preview Edge / Preview Sequence commands. `EditorCameraEdgePreviewActions.svelte` exposes direction choices while preserving undirected topology.
- The shell contracts require one Camera selection model and one Camera timeline shared by Camera Plan and Camera 3D. `Shell-camera-workspaces.md` §11–§13 and `Design-specs.md` §1, §16, §23–§25 establish timeline ownership, five-lane visual projection over the current two-lane backing model, and no duplicate state.

The two supplied PNGs are untracked user assets and are reference material only; P11 must not modify, stage, or rename them.

## 2. Superseded behavior and contract change

This plan **intentionally supersedes** the following shipped P8/P3B rules; implementation and tests must name the migration rather than silently change it:

| Existing contract | P11 contract |
|---|---|
| P8 D1 / P3B Group C: selection never changes preview scope; Preview Edge is always an explicit separate action | Selecting a Camera enters paused Camera scope; selecting an Edge enters paused local Edge scope. Explicit Preview Sequence remains the only whole-route entry. |
| P8 S5: selecting an edge while Sequence is playing leaves Sequence playing and scope untouched | Selecting a Camera/Edge while Sequence plays is authoring intent: pause Sequence, enter the selected scope, preserve editor/project state, and do not tear down the project/editor. |
| Active preview identity can diverge from canonical selection | The compact scope derives from canonical Camera selection for Camera/Edge; no independent active-edge selector or second selection model. Sequence is the explicit exception because it represents the whole route. |
| Preview controls are a separate modal-looking transport area with Stop Preview | Preview is ordinary Camera timeline/editor state. One contextual Play/Pause/Replay control is shown in the dense timeline header; Stop is internal lifecycle behavior, not normal chrome. |
| Through Camera / Observer and Follow/Recenter are separately labeled controls | Observer ↔ Through Camera is a compact segmented/toggle control. Follow and Recenter are icon-only, tooltip-backed Observer tools and hidden in Through Camera mode. |
| Broad preview guard can make paused Through Camera feel non-editable | Playing owns the evaluated camera pose. A gesture while playing auto-pauses where safe, then authoring proceeds. Paused/complete preview remains inspectable and authorable where the existing canonical pipeline can re-resolve it. |
| Large unavailable/error panels and separate warning rows communicate Sequence failure | Keep the timeline shell stable; use quiet empty-track messaging and compact inline diagnostics such as `Gap at Camera 3`. A valid selected Edge remains fully usable when Sequence is unavailable. |

No shortcut map is introduced. Existing Escape priority and tool shortcuts remain under the deferred whole-editor keyboard/cancellation audit.

## 3. Proposed state transitions

Keep the existing `EditorCameraPreview` session state, controller ownership, captured route, run IDs, and canonical playhead model unless an implementation audit proves a narrow extension is necessary. Do not serialize preview/scope/playhead state.

Required transition contract:

```text
select Camera C
→ canonical Camera selection = C
→ scope = Camera(C), paused
→ static authored pose available for inspection

select edge C—D
→ canonical Edge selection = C—D + direction derived from existing selection rules
→ scope = Edge(C→D), paused at local progress
→ scrub / fine-tune / reverse / repeat / play

select another edge
→ canonical selection changes
→ scope follows that edge, paused

choose Preview Sequence
→ scope = Sequence, paused or explicitly playing according to the existing command entry point
→ global Sequence timeline
```

Clarifications:

- Camera/Edge selection changes scope but never autoplays.
- Sequence remains explicit and is not inferred from selecting a single entity.
- If Sequence is playing and a Camera/Edge is selected, pause Sequence, install the selected scope, and retain document/editor state. Do not call the full Stop teardown path.
- Where the selected edge corresponds to the Sequence playhead's current edge, initialize Edge scope from the mapped local physical progress. If mapping is unavailable or stale, use local zero without corrupting state.
- Selecting a Camera while an Edge scope is active enters static Camera scope and leaves no fake temporal content.
- Selecting an Edge while another Edge scope is active follows canonical selection and installs the selected edge's local timeline; there is no separately stored active-edge identity.
- Sequence return may restore the existing session-only `lastSequencePlayhead` when the current timeline and location still validate. Invalid/stale IDs or a rebuilt timeline fall back safely according to existing P8 invalidation rules.

## 4. Scope presentation and UI exposure

Use one compact active-scope capsule/header, for example:

```text
Sequence
Edge · Camera B → Camera C
Camera · Camera C
```

Rules:

- Derive Camera/Edge labels from canonical selection and the preview controller's current scope; never add a generic selector that can silently diverge from selection.
- Sequence has a clear compact enter/return affordance in the Sequence Inspector/timeline. It must not be represented as a selected graph entity.
- The dense timeline/header owns scope, transport, time, and mode controls. Do not retain duplicate scope prose in a separate preview panel.
- Camera scope presents `Camera C · Static` (or equivalent), disables or quiets transport, and exposes existing framing/inspection values through current Inspector/3D surfaces. Do not fabricate duration, Roll, Shots, or new durable lanes.
- Edge scope presents endpoint direction, local time, scrubber, Reverse, and Repeat. Direction uses traversal state; topology and Camera Plan connection rendering remain undirected.
- Sequence scope presents global time and existing derived topology loop status only. Do not add a generic Sequence loop toggle.
- Use Lucide icons from the existing `lucide-svelte` dependency. Icon-only Follow, Recenter, Reverse, Repeat, and transport controls require accessible names/tooltips; do not replace product-specific timeline graphics with generic icons.

Preferred dense shapes:

```text
[Edge · Camera B → Camera C] [↔] [Repeat] |◀ [▶/Ⅱ] 1.2 / 4.2s [Observer ↔ Through Camera] [Follow] [Recenter]
[Sequence]                         |◀ [▶/Ⅱ] 7.8 / 80.0s [Observer ↔ Through Camera] [Follow] [Recenter]
[Camera · Camera C · Static]       [Observer ↔ Through Camera]
```

Exact pixel, spacing, tokens, and final icon placement remain P3-owned after the semantic contract is stable.

## 5. Compact transport contract

One contextual transport action follows:

```text
Play
→ Pause while playing
→ Resume while paused
→ Replay when complete
```

Implementation requirements:

- Use the existing `playCameraPreview`/`pauseCameraPreview`/complete semantics and run-id capture. No second playback engine and no new generic loop state.
- Remove visible Stop Preview from normal timeline chrome. Preserve internal `stopCameraPreview()` teardown/reset for Escape/cancellation, stale/invalid target cleanup, document replacement, leaving Camera domain where required, and other explicit lifecycle boundaries.
- Keep transport quiet/disabled for static Camera scope; do not imply fake temporal content.
- Normal timeline transport must not show redundant `Preview active`, `Resume preview`, `Stop preview`, or long scope prose when the capsule communicates state.
- A playing Sequence or Edge owns the evaluated camera pose. Pausing exposes the current playhead for ordinary inspection and safe authoring.

## 6. Observer / Through Camera contract

Replace the current separate labeled mode buttons with one compact segmented/toggle control:

```text
Observer ↔ Through Camera
```

- Preserve existing `director`/`visitor` mode meaning and the current canonical camera application path.
- Follow and Recenter are Observer-only. Hide them in Through Camera; do not merely disable them while leaving visual noise.
- Follow is an icon toggle; Recenter is an icon action. Both have tooltip and accessible-name coverage.
- Mode changes must preserve scope, direction, selection, playhead, captured-route/run-id correctness, and Plan↔3D continuity unless an existing lifecycle rule explicitly requires otherwise.

## 7. Edge-vs-Sequence loop distinction

Preserve the current semantic split:

- **Edge Repeat:** temporary editor transport behavior for Edge scope only. It may restart the edge with a new run ID at local zero, with existing zero-duration/reduced-motion safeguards. It never mutates graph topology, Sequence order, or the global Sequence timeline.
- **Sequence loop:** no generic loop toggle. Sequence looping is derived only from an actual authored tail↔head connection in the undirected graph. Traversal direction remains preview state and must not make topology directed.
- The existing `flowLoopConnectionId` / `getFlowRoute(..., { loop: true })` contract remains the source of truth. Keep the two-node exception and no fake one-node edge.

## 8. Non-modal paused preview and mutation policy

The current `isDocumentMutationBlocked` predicate is a useful safety baseline but is too broad as the sole UX policy. Split policy by operation rather than making all mutations legal during playback.

### Always available while playing where safe

- Camera/Edge selection and selection-driven scope transition (selection auto-pauses first when a scope-changing gesture begins).
- Workspace/domain-view navigation that does not invalidate the active camera gesture; Camera Plan↔3D continuity must remain intact.
- Ordinary inspection and read-only diagnostics.
- Timeline scrubbing only after auto-pausing; never mutate the evaluated pose behind an actively playing motion.

### Auto-pause before mutation

- Camera framing/view-key authoring and other ordinary Camera authoring gestures that can be re-resolved through the existing canonical preview/motion pipeline.
- Safe path/pose edits where the current controller can cancel the active motion ownership, preserve the current physical/local progress, and begin one normal document transaction.
- The auto-pause must happen before pointer capture or transaction mutation, not halfway through a gesture.

### Remain prohibited

- Mutations that invalidate an active drag/gesture, pending navigation, document transaction, captured route, or stale target until that state is explicitly cancelled through existing lifecycle boundaries.
- Visitor/runtime-owned edits while Through Camera semantics make the evaluated pose authoritative, unless the existing operation is explicitly classified as safe and editor-only.
- Operations whose existing mutator/history contract cannot preserve one gesture = one transaction and deterministic rollback.
- Undo/redo while playing remains blocked through the existing history guard; paused/complete behavior may remain available if the operation is valid.

### Paused/complete editing

- Paused/complete preview remains installed and inspectable. Editing a valid paused preview re-resolves/re-evaluates at the current playhead through `resolveDirectedEdgeMotionByDirection`, `editor-camera-timeline.ts`, and the existing Rig/hook pipeline where applicable.
- Preserve captured-route/run-id/stale-invalidation correctness. Do not reuse an invalid snapshot merely to avoid a re-resolution.
- A paused Director Sequence retains its current document-replacement behavior unless the new controller policy proves a narrower safe refresh; the existing P8 S5 hard-reset rule must be explicitly reviewed, not silently removed.
- Escape priority remains unchanged: active drag first, pending navigation next, then Select/preview lifecycle according to the existing shortcut contract.

## 9. Empty and error states

Sequence unavailable/incomplete:

- Keep the timeline header, ruler/lane geometry, and scope shell stable where useful.
- Show a compact inline diagnostic, e.g. `Gap at Camera 3`; optionally mark the Camera Path lane at the gap.
- Clicking the diagnostic may focus/reveal the relevant graph location only if the existing architecture supports that action; do not invent a new graph focus system.
- Do not render a permanent full-width warning row or modal-like empty panel.
- A valid selected Edge must still enter and operate Edge scope normally even when Sequence cannot build.

Empty Sequence:

- Preserve quiet timeline shell/lane geometry where useful.
- Use empty-track messaging such as `No sequence yet`; do not add `Auto-generate Sequence from Graph` in this slice.
- A selected Camera still enters static Camera scope; a selected valid Edge still enters Edge scope.

Invalid/stale Edge or Camera:

- Do not install a partial preview. Use existing status/lifecycle reporting, clear only the stale scope/capture as required, and preserve canonical selection reconciliation rules.

## 10. Controller/store implications

No duplicate store or preview engine is permitted. The likely ownership changes are:

- `selection-actions.svelte.ts`: make Camera node/connection selection the scope-transition seam. Keep the pure selection reducer canonical; add orchestration that pauses an active Sequence/Edge when selection is authoring intent, then asks the existing preview command/controller to install the selected paused scope. Exact call direction must follow current controller-host ownership and avoid a selection↔preview cycle.
- `camera-preview-controller.svelte.ts`: retain FSM/run IDs/captured routes/stale invalidation; add only the smallest explicit transition helpers needed for selection-driven paused scope, current-edge local-progress mapping, and auto-pause. Keep `stop()` teardown semantics unchanged.
- `camera-preview-commands.svelte.ts`: distinguish explicit whole-route `previewSequence()` from selection-driven `previewCamera`/`previewEdge`; ensure selection-driven entry does not autoplay, preserves `lastSequencePlayhead`, and can pause Sequence without project teardown. Reuse `swapEdgePreviewDirection`, edge repeat, and existing exact-edge resolver. This also resolves the post-P3B.5 orphaned-API follow-up: `swapEdgePreviewDirection` / store-level `setEdgePreviewRepeat` currently have no UI caller; P11.4's Edge Reverse / Repeat controls become their callers, so no interim wiring lands before that slice.
- `camera-timeline-controller.svelte.ts` / `use-camera-timeline.svelte.ts`: make selected Camera/Edge scope the canonical derived branch; expose local/global playhead and duration without introducing a second timeline model. Current Sequence playhead restoration and boundary mapping remain authoritative.
- `mutation-guards.svelte.ts` and mutator hosts: replace the single UX interpretation of `isDocumentMutationBlocked` with operation-specific checks or an auto-pause wrapper. Do not remove playback safety or make every mutator legal during active playback.
- `EditorCameraTimelinePanel.svelte`, `EditorCameraPreviewControls.svelte`, `EditorCameraTimelineRuler.svelte`, and related edge/timeline components: collapse header/transport, mount the correct scope presentation before the current `timeline` null gate, remove visible Stop and large error panels, and preserve shared Camera Plan/3D mounting.
- `CameraFlowPanel.svelte`, `EditorCameraEdgePreviewActions.svelte`, `CameraPlanInspector.svelte`, and Plan/3D selection surfaces: remove or demote duplicate Preview Edge entry points once selection itself owns scope. Keep explicit Preview Sequence and any direction chooser needed to resolve an undirected edge deterministically.
- `editor-types.ts`: do not add durable scope fields or a second active-edge identity. If a type change is required, keep it session-only and aligned with the existing discriminated preview union.
- `EditorCameraRig.svelte` and `use-camera-preview.svelte.ts`: preserve the sole evaluated pose application path; changes should be limited to paused re-evaluation/auto-pause integration if exact source inspection requires them.

## 11. Smallest implementation slices

### P11.1 — Contract and state-transition seam

Before visual restyling, implement and test selection-driven scope transitions, no-autoplay behavior, Sequence-playing selection pause, current-edge local-progress handoff, and stale/run-id preservation. Keep explicit `previewSequence()` and internal Stop semantics.

### P11.2 — Mutation policy / paused authoring

First, write a mutation-gate pre-inventory annex (same pattern as the P7.6 strings pre-inventory): enumerate every `isDocumentMutationBlocked` consumer — placement-cluster (~30 sites), selection-actions (~15), navigation-graph (~14), view-keyframe (~12), path-anchor (~8), material-resource, texture-library, camera-preview-commands, and the `controller-hosts.ts` getter plumbing — recording for each: current guard (`isDocumentMutationBlocked` alone vs combined with `isEditorInteractionActive`), target §8 bucket (always-allowed / auto-pause-first / stays-blocked), owner call for ambiguous rows, and the named acceptance test covering it. Implement only against that table.

Then classify current mutators per the table and add the smallest safe auto-pause seam. Verify playing pose ownership, paused re-resolution, history/transaction correctness, and prohibited active-gesture cases. Do not broaden every guard.

### P11.3 — Scope-aware timeline shell

Refactor panel/ruler/controller exposure around one scope capsule and one dense transport row. Camera is static, Edge is local, Sequence is global. Replace modal-like incomplete/empty panels with compact diagnostics and stable shell geometry.

### P11.4 — Compact controls and parity

Implement segmented Observer/Through Camera, icon-only Observer tools with tooltips, contextual Play/Pause/Replay, hidden Follow/Recenter in Through Camera, Edge Reverse/Repeat (wiring the orphaned `swapEdgePreviewDirection` / `setEdgePreviewRepeat` store APIs per §10), and removal of visible Stop. Reconcile Plan/3D and Sidebar/Inspector duplicate affordances.

### P11.5 — Regression and contract reconciliation

Run focused store/controller/component/browser tests, update canonical contracts, and then let the remaining P3B visual QA style the stable semantic surface. Shortcut changes remain deferred.

## 12. Tests and acceptance criteria

### State and scope

- Selecting a Camera enters paused Camera scope with the authored static pose; it never autoplays and creates no document/history entry.
- Selecting a valid Edge enters paused Edge scope, including an edge with an Unsequenced endpoint; it never autoplays.
- Selecting another Edge follows canonical selection and changes the local scope; no independent active-edge identity exists.
- Selecting Camera/Edge while Sequence is playing pauses Sequence, enters the selected scope, preserves project/editor state, and does not invoke full Stop teardown.
- Selecting the edge under the Sequence playhead maps to the corresponding local physical progress when the existing timeline location is valid; otherwise it safely starts at zero.
- Explicit Preview Sequence remains the only whole-route entry and restores valid `lastSequencePlayhead` without confusing it with selection.
- Plan↔3D preserves one Camera selection, scope, direction, playhead, capture/run ID, and timeline state according to existing continuity rules.

### Transport and controls

- One transport control labels Play, Pause, Resume, and Replay contextually.
- Camera scope has no fake duration/content and transport is disabled/quiet.
- Stop is absent from normal timeline chrome but internal teardown tests remain green for Escape, stale cleanup, document replacement, Camera-domain exit, and explicit lifecycle boundaries.
- Observer/Through Camera is one accessible segmented control; Follow/Recenter are present only in Observer and have icon-only tooltip/name coverage.
- Edge Reverse is paused-edge-only and preserves physical pose through the existing edge-domain remap. Edge Repeat restarts only Edge scope and never changes Sequence topology or duration.
- No generic Sequence loop toggle is present; authored tail↔head topology remains the only Sequence loop source.

### Mutation and invalidation

- Selection, navigation, inspection, and safe scrubbing do not require explicit Stop; selection-driven scope changes auto-pause when necessary.
- A representative playing authoring gesture auto-pauses before mutation and produces one valid transaction/history entry.
- A prohibited active drag/transaction/pending navigation remains guarded and cancellable; no blanket “all mutations legal while paused/playing” regression.
- Paused valid Edge/Camera authoring re-resolves through the canonical route/motion pipeline at the current playhead.
- Captured route/run IDs, stale target cleanup, undo/redo, document replace/import, and domain-exit teardown remain deterministic.

### Empty/error states and truthfulness

- Incomplete/empty Sequence uses compact inline diagnostics and stable shell geometry, not a permanent warning panel.
- `Sequence unavailable + valid selected Edge` still provides fully functional Edge scope.
- Camera scope says Static and does not imply authored Roll/Shots/duration or new durable lanes.
- Camera Plan topology remains undirected; Sequence remains distinct from graph topology; visitor/editor isolation remains intact.

### Visual and accessibility

- Dense desktop and narrow responsive layouts avoid stacked duplicate preview controls.
- Icon-only controls have accessible names and tooltips; transport and scope state remain screen-reader discoverable without duplicate prose.
- Existing Lucide dependency is reused; no new UI/timeline library or shortcut map is introduced.
- Browser QA covers Camera Plan and Camera 3D with both populated and incomplete Sequence fixtures, including an unsequenced edge.

## 13. Dependency and roadmap placement

- **Required baseline:** P8 S1–S6 shipped behavior, P7 controller/facade ownership, P3B.5 shared preview affordance baseline, and the current shell/Camera contracts.
- **Immediate coordination:** P3B.6 retained-edge selection parity is closed and provides the reliable Edge selection baseline. P3B.7a/P3B.8 preview QA must be updated to the superseding selection-driven contract after P11.
- **P3 relationship:** P3 core remains shipped. P3 owns final pixels/tokens/layout polish only after P11.1–P11.4 establish grouping and state ownership. Do not use P3 to decide behavior.
- **P7 relationship:** reuse the existing controller host boundaries and selection reducer; do not reopen the shipped facade collapse except for narrowly justified ownership seams.
- **Branch-rejoin experiment:** unaffected; future multi-edge playback composes the existing edge primitive and is not part of P11.
- **Visitor/runtime:** no `CameraDirector` or `/museum` changes in this plan unless a separate runtime parity decision is made later.

## 14. Deferred scope

- Designer-proposed keyboard shortcut map; wait for whole-editor keyboard/cancellation audit.
- New Roll data, Shots entities, authored lane persistence, or fake timeline content.
- Generic Sequence loop control or graph-to-Sequence auto-generation.
- New branch/rejoin playback engine or multi-edge branch timeline.
- Visitor/runtime motion rewrite and authored-timing parity beyond the existing editor pipeline.
- New selection model, active-edge selector, duplicate timeline, duplicate motion engine, serialized preview/session state, or cross-document history coupling.
- Exact pixel values, icon geometry, color tuning, and screenshot regeneration until semantic/controller slices are accepted.

## 15. Contract reconciliation checklist

Before implementation, update the following intentionally and remove competing rules:

- P8 umbrella: retain as shipped baseline/history; link to P11 from its placement/boundary notes if the tracker workflow permits, but do not rewrite shipped slice acceptance as if it were never shipped.
- P3B umbrella: replace “Selection never changes preview scope,” “Selection and preview remain independent,” “Reverse remains transport behavior only” where they conflict; retain undirected topology and explicit Sequence entry. Mark P3B.6/P3B.7 preview acceptance as P11-dependent.
- `docs/components/camera-tour.md`: update Preview grammar to selection-driven Camera/Edge scope and explicit Sequence; add non-modal paused behavior and edge/Sequence loop distinction.
- `docs/Design-specs/Shell-camera-workspaces.md`: update §12 timeline exposure from separate Stop/Play/Pause rows to the compact scope/transport contract; preserve §11 ownership and §13 one-selection continuity.
- `docs/Design-specs/Design-specs.md`: update Camera Timeline header and icon guidance to allow the compact P11 grouping while retaining five-lane projection truth and no shortcut change.
- `docs/Design-specs/Camera-flow-specs.md`: update §18–§19 to state that Camera/Edge selection enters paused local preview scope while Sequence remains explicit; preserve graph≠Sequence.
- `docs/hand-off/CURRENT.md`: after implementation only, record the active P11 slice; this planning change must not claim code has shipped.

P11 is complete only when source/tests, CURRENT, the active P3B plan, Camera-tour contract, shell timeline contract, and P11 agree on the same selection/scope/mutation rules.
