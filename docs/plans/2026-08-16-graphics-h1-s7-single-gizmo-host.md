# H1 S7 — Single TransformControls Host and Target Adapters

**Date:** 2026-08-16  
**Status:** Planned  
**Parent:** [`2026-08-14-graphics-h1-unified-3d-editing.md`](./2026-08-14-graphics-h1-unified-3d-editing.md) (step 7, difficulty 9/10 — plan Frontier+, implementation Frontier+)  
**Prerequisite:** S6 · Centralized 3D Layout Selection  
**Handoff:** [`../hand-off/CURRENT.md`](../hand-off/CURRENT.md)

## Goal

Replace the current 568-line, scene-store-specific
`EditorTransformControls.svelte` implementation with **one actual
TransformControls host** and explicit scene, camera, and layout target adapter
boundaries. The host owns the Three lifecycle, camera rebinding, attach/detach,
mode/axis/space configuration, orbit ownership, pointer lifecycle, Escape,
snap modifier routing, FSM events, and teardown exactly once. Domain adapters
own target resolution, proxy/baseline state, document mapping, and
commit/cancel semantics.

S7 preserves every existing scene-placement and camera transform behavior
before adding layout target semantics. It derives and tests layout proxy poses,
allowed modes/axes, spaces, read-only rules, and baseline-relative deltas for
room/wall/opening/interior-anchor/object selections. **It does not expose an
inert or unsafe layout gizmo.** Layout target descriptors remain detached in
S7; S8 supplies their candidate-document preview session, full validation, and
atomic layout-history commit, then hands them to the host. A layout selection
therefore shows selection/highlight/inspector in S7 but no draggable handles.

This boundary is deliberate: directly mutating `LayoutPreviewState` on every
`objectChange` would temporarily replace the canonical project and rebuild
committed meshes, violating the umbrella's locked S8 rule that canonical
project/history/export remain unchanged until pointer-up. S7 must not ship a
throwaway mutation path that S8 immediately deletes.

Direct 3D wall/interior-anchor picking (S6.1) is **not** a prerequisite. The
S4 hierarchy can select every layout target, so S7 can prove all target
descriptors without reopening S6's live-scene arbitration debt.

## Current state

| Concern | Today | S7 outcome |
|---|---|---|
| Three host | `EditorTransformControls.svelte` constructs `ThreeTransformControls`, adds its helper and a placement pivot, owns all listeners, and disposes everything | `EditorTransformControlsHost.svelte` is the only constructor/lifecycle owner; the old component becomes a thin adapter composer |
| Domain logic | One component contains placement, camera-node, path-anchor, and view-target session unions plus their mutation/history rules | Scene and camera sessions move behind adapters; host contains no scene/camera identity or document mutation |
| Target arbitration | `getActiveTransformTarget` implicitly prefers navigation, then placement; it does not read S3 `ActiveEditorSelection` and has no layout branch | H1 resolves strictly from `ActiveEditorSelection`; relic keeps its existing legacy-slot arbitration through the same adapters |
| Scene placement | Multi-selection pivot, rigid baseline delta, uniform/independent scale, snapping, keep-on-floor, one scene transaction | Behavior preserved byte-for-byte at the semantic boundary, now owned by scene adapter |
| Camera | Node position/target, connection anchor, view target, pending-node special case, epsilon no-op, room-local writes | Behavior preserved, now owned by camera adapter |
| Layout | S6 selects room/wall/opening/object in 3D; wall/anchor can be selected through hierarchy; no layout proxy or gizmo | Pure target descriptors + proxy/delta adapter contract for all five identities; detached until S8 |
| Modes/axes | Host hard-codes navigation=`translate`, placement=`interactionStore.mode`; toolbar hard-codes “navigation versus everything else”; unsupported layout modes are unknown | One capability policy drives host, toolbar, and shortcuts; unsupported handles/modes cannot start |
| FSM | `dragging-changed` owns a placement-only `DragSnapshot`; camera sessions bypass that snapshot and layout picks do not put FSM in `Selected` | Host owns one generic drag session; active-target sync works for scene/camera now and layout in S8 |
| Escape/cancel | Placement and navigation cancellation are separate branches; placement writes private `controls.dragging` to release r170 drag state | One host cancellation path calls the active adapter once, releases TransformControls once, restores orbit once, and preserves domain-specific deselection behavior |
| Relic | `/museum/editor` mounts the same monolith; `/museum` never imports it | Relic mounts the thin composer + one host with scene/camera adapters only; visitor chunk remains editor-free |

## Target

```text
EditorTransformControls.svelte                  thin shared composer
  ├─ resolve active domain/identity
  ├─ sceneGizmoAdapter(store)                   scene document owner
  ├─ cameraGizmoAdapter(store)                  scene document owner
  ├─ optional layout adapter                    S8 activates
  └─ EditorTransformControlsHost.svelte         exactly one Three host
       ├─ create/dispose TransformControls + helper
       ├─ bind active camera
       ├─ detach → configure → attach
       ├─ orbit lock/restore
       ├─ mouseDown/objectChange/mouseUp
       ├─ Escape/pointer-cancel/unmount
       ├─ snap modifier + FSM/cursor
       └─ call active adapter drag session

H1 ActiveEditorSelection
  scene  ───────────────→ scene adapter ───────→ scene history
  camera ───────────────→ camera adapter ──────→ scene history
  layout ─→ layout target descriptor ──X       S7: detached
                                      └───────→ S8 candidate session/layout history

Relic selection slots
  navigation > placement ─→ same camera/scene adapters → same behavior
```

Only `EditorTransformControlsHost.svelte` may instantiate
`ThreeTransformControls`. `EditorSelection.svelte` may retain its type-only
reference and bound controls prop because the single selection coordinator
still needs handle/drag precedence.

## Public contracts

Conceptual contracts; exact files may consolidate, but ownership must not:

```ts
type GizmoMode = 'translate' | 'rotate' | 'scale';
type GizmoAxis = 'x' | 'y' | 'z' | 'xy' | 'xz' | 'yz' | 'xyz';
type GizmoSpace = 'world' | 'local';

type EditorGizmoPolicy = {
  defaultMode: GizmoMode;
  allowedModes: ReadonlySet<GizmoMode>;
  allowedAxes(mode: GizmoMode): ReadonlySet<GizmoAxis>;
  space(mode: GizmoMode): GizmoSpace;
  scaleControl: 'scene-scale-mode' | 'fixed-independent' | 'hidden';
};

type EditorGizmoTargetAdapter = {
  key: string;
  domain: 'scene' | 'camera' | 'layout';
  proxy: THREE.Object3D;
  policy: EditorGizmoPolicy;
  begin(input: EditorGizmoBeginInput): EditorGizmoDragSession | null;
};

type EditorGizmoDragSession = {
  preview(input: EditorGizmoPreviewInput): void;
  commit(input: EditorGizmoCommitInput): void;
  cancel(reason: EditorGizmoCancelReason): void;
};

type EditorGizmoCancelReason =
  | 'escape'
  | 'pointer-cancel'
  | 'target-change'
  | 'view-change'
  | 'unmount'
  | 'external-replacement';
```

The host owns **when** these methods run. The adapter owns **what** they mean.
The host never calls a document mutation method directly.

S7 also adds a renderer-neutral editor-side layout descriptor seam:

```ts
type LayoutGizmoTargetDescriptor = {
  key: string;
  selection: Exclude<LayoutSelection, { kind: 'none' }>;
  proxyPose: {
    position: Vec3;
    rotation: Vec3;
    scale: Vec3;
  };
  policy: EditorGizmoPolicy;
  baseline: LayoutGizmoBaseline;
};

resolveLayoutGizmoTarget(
  layout: LayoutDocument,
  geometry: CompiledLayoutGeometry,
  selection: LayoutSelection
): LayoutGizmoTargetDescriptor | null;

deriveLayoutGizmoDelta(
  descriptor: LayoutGizmoTargetDescriptor,
  proxyPose: LayoutGizmoProxyPose
): LayoutGizmoDelta;
```

`resolveLayoutGizmoTarget` and `deriveLayoutGizmoDelta` may live under
`$lib/editor/gizmo`; `$lib/layout/**` remains Three/Svelte/DOM-free. S8
consumes the delta to build a candidate document from the immutable baseline.
S7 does not install that candidate.

## Locked decisions

### One constructor, one helper, one listener set

- `new ThreeTransformControls(...)`, `getHelper()`, scene add/remove, listener
  registration, camera rebinding, `detach`, `attach`, `dispose`, and the r170
  drag-release workaround exist only in `EditorTransformControlsHost.svelte`.
- `EditorTransformControls.svelte` remains as a small compatibility composer so
  `H13DView` and relic `EditorViewport` keep one mount and the existing
  `bind:controls` seam. It must not instantiate Three controls, add helpers,
  register global listeners, or mutate a document.
- Target changes detach first. If a drag exists, host cancels the old adapter
  session before detach; it never reassigns a live session to a new target.
- Host configuration is a separate reactive step from target attachment so
  snap preference changes do not churn the attached proxy.
- Camera replacement updates `controls.camera` without recreating controls.
- Unmount cancels any live session, restores orbit to the exact captured
  boolean, detaches helper/proxy, unregisters callbacks/listeners, and disposes
  controls exactly once.

### Adapter sessions replace placement-only drag snapshots

- `EditorInteractionStore.dragSnapshot` is placement-specific duplicate
  ownership. Move the placement baseline into the scene adapter session and
  remove that public snapshot API after its focused tests migrate.
- Add one generic active-target/FSM synchronization event. When no drag is
  active, a transformable target means `Selected`; no target means `Idle`.
  Camera and future layout targets therefore enter `Dragging` through the same
  `DRAG_START` transition as placements. Do not fake a placement id for layout
  or camera targets.
- `dragging-changed` dispatches FSM/cursor state only. It never captures,
  restores, commits, or classifies domain data.
- `mouseDown` validates active policy/mode/axis, asks `adapter.begin`, then
  captures orbit state and disables orbit only when begin succeeds.
- `objectChange` calls the live session's `preview`; `mouseUp` performs one
  final preview then one commit. A refused begin creates no session, no orbit
  change, and no history.
- Escape/pointer-cancel/target-change/unmount call `cancel` at most once. A
  later natural `mouseUp` after cancellation is ignored and cannot commit.
- Preserve current domain-specific Escape selection behavior: placement drag
  Escape reverts and deselects; camera drag Escape reverts but keeps its
  navigation selection. S8 explicitly locks layout's choice when it activates
  layout sessions.

### H1 arbitration follows `ActiveEditorSelection`, never stale slots

- In H1, `activeSelection.active.domain` is the sole adapter selector:
  - `scene` → scene adapter or `null` if roots are incomplete;
  - `camera` → camera adapter for node position/target, path anchor, or view
    target; connection-only and other non-transformable selections → `null`;
  - `layout` → S7 layout descriptor, but no live adapter/attachment until S8;
  - `none` → `null`.
- Never fall back to a stale placement while a camera/layout helper is missing.
  S3 normally clears stale slots, but gizmo arbitration must remain correct for
  a temporarily unmounted helper or legacy inconsistent state.
- Pending placement/navigation commands, Director/visitor preview, direct path
  drag, framing drag, and `transformGizmoVisible=false` detach all targets
  before a new gesture can start.
- The relic has no `ActiveEditorSelection`; its composer retains the existing
  navigation-before-placement arbitration and never constructs a layout
  descriptor. Behavior, not emitted shared bytes, is the frozen contract.

### Host policy controls mode, axis, space, and UI

- A single `EditorGizmoPolicy` drives TransformControls, toolbar buttons, and
  W/E/R/T shortcuts. Toolbar/shortcuts cannot select an unsupported mode.
- Keep the user's remembered scene mode. If a target does not allow it, use
  `defaultMode` as an **effective** mode without overwriting the remembered
  value; returning to a compatible scene target restores the user's mode.
- Apply `showX/showY/showZ` from the allowed-axis set for the effective mode.
  The allowed sets below map exactly to public Three handles: combinations
  exist only when all component axes are allowed. Also reject an unexpected
  `controls.axis` defensively at begin; unsupported input never reaches an
  adapter and is never accepted then discarded.
- Three's rotate-only `E` (screen) and `XYZE` (free) handles are derived host
  capabilities: accept them only when all `x/y/z` rotation axes are allowed.
  Restricted targets such as room-Y rotation hide both automatically because
  `showX/showZ=false`; scene placement and full layout-object rotation retain
  them.
- `space(mode)` is target policy, not a second user-controlled transform
  system. Preserve scene placement and camera as world-space. Opening and
  layout-object rotate/scale use authored local axes as locked below.
- Scale-chain UI appears only for scene placements (`scene-scale-mode`).
  Opening/object dimensions are independent authored dimensions, so layout
  scale is fixed-independent and does not reuse scene schema-v6 scale-vector
  state.
- While S7 layout sessions are detached, an active layout selection publishes
  no interactive gizmo policy: transform buttons are disabled and no handles
  render. S8 publishes the descriptor policy when its session exists. No env,
  build, query, or production feature flag is added.

### Scene adapter preserves placement behavior

- Reuse the current session pivot. Loose/multi/cluster selection centers on
  the same centroid; a single root copies its world quaternion before attach.
- Require every selected placement root before begin. Missing roots return
  `null`; no partial-member transform.
- Begin one scene document transaction and capture one immutable
  `startPivotWorldMatrix` + member baseline list.
- Preview uses `applyRigidPivotDelta` from that baseline on every event,
  preserving uniform/independent scale behavior, room-local translation snap,
  rotation snap, Shift bypass, and `updatePlacementTransform` writes.
- Commit preserves keep-on-floor grounding and status, writes any grounding
  delta, commits exactly one scene history entry, resets the pivot, and restores
  orbit.
- Cancel resets controls/proxy, restores every live root from captured member
  transforms **and** cancels the document transaction, clears interaction
  state, and performs the existing placement deselect. No no-op history entry.
- Existing `editor-cluster-transform`, `editor-placement`, `editor-transform`,
  scale-vector, toolbar, and selection tests are behavioral oracles; extraction
  must not “clean up” their semantics.

### Camera adapter preserves three navigation target kinds

- One camera adapter owns the existing internal variants:
  - node `position | target`;
  - connection path anchor;
  - view-keyframe target.
- All use world-space translate only, no rotation/scale handles or snaps.
- Node preview converts proxy world position through `store.rooms.localPoint`
  and calls the existing `updateNavigationNodePoint` path.
- Anchor and view-target preview call their existing world-point mutators.
- Existing authored targets begin one scene document transaction. Pending
  camera nodes keep today's no-transaction draft path and restore
  `startLocalPoint` on cancel.
- Anchor/view-target epsilon no-op checks remain
  `EDITOR_CAMERA_PATH_MOVE_EPSILON` / `EDITOR_CAMERA_VIEW_MOVE_EPSILON`.
  Node transaction behavior remains unchanged; S7 does not add a new epsilon.
- Cancel restores helper position and document/draft state once. Helper
  re-registration or reactive rerender must not attach a second proxy.

### Layout descriptor keys and source data are authored/compiled, never guessed

- Descriptor keys use a collision-safe tuple encoding (`JSON.stringify` of a
  tuple or existing `geometryId`), never colon splitting; legal ids contain
  `:`.
- Authored values come from `LayoutDocument`; positions/tangents/lengths come
  only from `CompiledLayoutGeometry`. The adapter does not resample curves,
  inspect rendered mesh coordinates, or infer room ownership.
- A missing room/segment/opening/anchor/object or missing compiled counterpart
  returns `null`. Never attach a stale proxy to a reloaded/undone identity.
- Proxy objects are session-only and never enter `MuseumProject`, snapshots,
  export, `LayoutDocument`, or `SceneDocument`.
- Each `deriveLayoutGizmoDelta` calculation compares current proxy pose to the
  captured descriptor baseline. It never compounds from the previous delta.

### Locked layout target semantics

| Target | Proxy pose | Modes / axes | Space | Baseline-relative delta |
|---|---|---|---|---|
| Room | sampled authored-room centroid at room floor elevation, identity rotation/scale | translate `x,z,xz`; rotate `y` | world | X/Z translation + positive-Y yaw for `transformLayoutRoomUnit` |
| Wall | compiled half-arc-length center, vertically centered between room floor/ceiling | translate `x,z,xz` | world | X/Z translation; S8 moves selected endpoints + its authored interior anchors and keeps adjacent closure exact |
| Opening | compiled opening bottom-center (`center.point`, floor + sill), local X along compiled tangent | translate `x`; scale `x,y,xy` | local | local-X center shift; X scale changes width about center and offset; Y scale changes height with sill fixed |
| Interior anchor | authored anchor point at room floor/helper elevation, identity rotation/scale | translate `x,z,xz` | world | X/Z authored point delta |
| Layout object | stored position/rotation, unit proxy scale | translate `x,y,z,xy,xz,yz,xyz`; rotate `x,y,z`; scale `x,y,z,xy,xz,yz,xyz` | translate world; rotate/scale local | position; Euler rotation; baseline dimensions multiplied independently by proxy scale |

- Room Y translation, room scale, wall Y/rotate/scale, opening local Z, and
  anchor Y/rotate/scale are absent at control level.
- `LayoutObject.kind === 'profile'` returns `null` (read-only). Other existing
  box/cylinder/sphere/plane objects use stored transforms; no schema change.
- Opening proxy X points along `CompiledOpening.center.tangent`, using the
  compiler's `center.yaw`; never derive yaw from mesh triangles. Translation
  delta moves opening center. Width mapping then recomputes offset from that
  center so X scale stays center-pivoted. Height mapping leaves sill fixed.
- S7 derives raw finite deltas only. S8 owns clamps, neighbor-overlap checks,
  structural/geometry/compile/mesh validation, last-valid preview, and commit.
- Layout translation step is the existing 0.25 m Plan grid when enabled.
  Room rotation uses the existing 15° Shift contract. Scene placement's
  existing Shift-bypass behavior remains unchanged; adapter snap policies make
  the distinction explicit instead of mixing both in host code.

### S7/S8 activation boundary

S7 ends with this state:

```text
scene selection  → live scene adapter  → one host → existing scene mutation/history
camera selection → live camera adapter → one host → existing scene mutation/history
layout selection → tested descriptor   → detached (no handles, no mutation)
```

S8 changes only the last line:

```text
layout selection → layout candidate-session adapter → same host
                 → transient validated bundle → one layout history commit
```

S7 must not:

- call `updateLayout*`, `previewLayoutRoomUnit`, `restoreLayoutPreviewSnapshot`,
  `commitLayoutTransaction`, or `cancelLayoutTransaction` from host or layout
  descriptor code;
- mutate `layoutPreview.project`, `model`, `geometry`, or mesh caches during a
  gizmo event;
- attach a draggable layout proxy whose session cannot safely preview/commit;
- add a second TransformControls, a second Canvas listener, or a second FSM;
- hide incomplete behavior behind a build flag.

This is a focused amendment to the umbrella step wording “before enabling
layout targets”: S7 defines the layout target adapter boundary and proves its
math; S8 is the enabling slice because it supplies the required atomic
candidate session.

### Relic, visitor, and resource isolation

- `/museum/editor` keeps the same scene/camera transform outputs, snap
  behavior, Escape behavior, history counts, and tool restrictions. It never
  receives layout adapter props.
- `/museum` imports no file below `$lib/editor/gizmo`, no selection/session
  types, and no Three TransformControls. Production visitor chunk scan remains
  clean.
- H1 remains one Canvas and one helper. Layout descriptors allocate at most one
  reusable proxy per active identity and dispose/detach on replacement; S8
  owns any preview-mesh resource churn.
- No G3 re-baseline: S7 changes editor control objects/listeners, not
  architecture geometry, draw-call estimates, or visitor render work.

## Implementation steps

### 0. Pin current behavior and single-host contracts first

Add an `H1 S7 — single gizmo host` block to
`tests/lib/editor/h1/contracts.test.ts` plus focused gizmo tests before moving
runtime code:

- exactly one runtime `new ThreeTransformControls(...)` under editor source,
  located in `EditorTransformControlsHost.svelte`;
- `H13DView` and relic `EditorViewport` each mount the shared thin composer
  once; neither constructs controls or adds a second helper;
- `EditorSelection` retains the same bound controls reference and
  `axis || dragging` precedence before the S6 layout/normal selection flow;
- host contains no calls to scene/camera/layout document mutators;
- scene/camera adapters contain no `new ThreeTransformControls` or global
  window listener registration;
- H1 composer accepts the S3 active-domain input; relic omits it and omits all
  layout adapter input;
- layout descriptor module does not call any layout preview/history mutation
  function and H1 does not hand it to the live host in S7;
- `$lib/layout/**`, camera route/motion, G4 mesh builder/adapter, and visitor
  imports remain untouched.

Record behavioral fixtures for existing scene/camera transforms before
extraction:

- one and multiple placement roots: translate/rotate/uniform scale/independent
  scale from the immutable pivot baseline;
- missing member root refuses begin;
- translation/rotation snap + Shift bypass;
- keep-on-floor success/failure and one history commit;
- placement Escape restores and deselects; natural mouse-up afterward does not
  commit;
- node position/target, pending node, path anchor, and view target preview,
  commit, epsilon no-op, and cancel;
- orbit initially true and initially false both restore exactly;
- target switch/unmount mid-drag cancels once.

### 1. Add generic contracts and policy helpers

- Add the shared host/adapter/session/policy types under
  `$lib/editor/gizmo`.
- Add pure helpers for:
  - remembered-mode → effective-mode resolution;
  - lowercase semantic axis ↔ Three uppercase axis mapping;
  - `showX/showY/showZ` derivation;
  - defensive `isAxisAllowed(mode, axis, policy)`;
  - toolbar/shortcut capability projection.
- Extend `EditorInteractionStore` with generic active-target policy/FSM sync.
  Remove placement-only `DragSnapshot` once scene adapter owns it.
- Preserve current mode and scale-mode session defaults. No document/schema
  field changes.

### 2. Extract `EditorTransformControlsHost`

- Move Three construction/helper lifecycle, camera effect, attach/detach,
  policy configuration, orbit capture/restore, listener registration,
  modifier listeners, canceler registration, FSM/cursor dispatch, and teardown
  into the host.
- Host receives one nullable `EditorGizmoTargetAdapter` and exposes the bound
  controls for selection precedence.
- Centralize `mouseDown → objectChange* → mouseUp` and every cancellation path
  against one `EditorGizmoDragSession`.
- Keep the r170 private-drag release workaround isolated and commented in the
  host if public `reset()` + `pointerUp(null)` cannot release capture alone.
  No adapter may touch private TransformControls fields.
- Make `EditorTransformControls.svelte` a thin composer; keep its public
  `{ store, bind:controls }` compatibility for both existing mounts.

### 3. Extract scene adapter without behavior change

- Move pivot creation/reset and placement session logic into
  `scene-gizmo-adapter.svelte.ts` (or equivalent).
- Keep existing pure helpers; do not fork transform math.
- Route begin/preview/commit/cancel through adapter session methods.
- Run the recorded scene fixtures and existing placement/cluster/scale-vector/
  toolbar/selection suites before continuing.

### 4. Extract camera adapter without behavior change

- Move node/anchor/view-target target resolution and session logic into
  `camera-gizmo-adapter.svelte.ts`.
- Preserve pending-node and authored-document transaction differences,
  room-local conversion, no-op epsilons, helper restoration, and world-only
  translate policy.
- Replace implicit target precedence with explicit H1 active-domain routing;
  retain a legacy resolver for `/museum/editor`.
- Run camera authoring, path, framing, preview-lock, and history tests before
  adding layout descriptor code.

### 5. Add layout target descriptors and delta math

- Add `resolveLayoutGizmoTarget` over authored layout + compiled geometry.
  Implement collision-safe keys, stale-identity failure, proxy poses, policies,
  and read-only profile rejection for all five selection kinds.
- Add baseline-relative `deriveLayoutGizmoDelta` with no document/state
  mutation.
- Test curved-wall half-arc placement, curved-opening tangent/yaw, opening
  center-pivot width mapping, fixed-sill height mapping, room positive-Y yaw,
  wall/anchor XZ deltas, rotated object local scale, non-uniform dimensions,
  legal ids containing `:`, and every unsupported mode/axis.
- Thread H1 active layout identity far enough to publish “not interactive in
  S7” to toolbar/shortcuts. Do **not** pass a live layout adapter to host.

### 6. Toolbar, shortcuts, and selection precedence

- Update `EditorViewportToolbar` to consume generic capability projection
  instead of `hasNavigationTransform` special cases. Preserve labels and
  current scene/camera appearance where modes are supported.
- Update W/E/R/T mode shortcuts to refuse unsupported modes and use the same
  effective policy as the toolbar/host. Preserve Escape cascade and preview
  locks.
- Scale-chain remains scene-placement-only. `Select` continues to hide the
  gizmo without overwriting remembered mode.
- Confirm TransformControls handles still win pointerdown before the single S6
  selection coordinator; no extra Canvas listener or raycast.

### 7. Regression and manual QA

- Run full unit suite, `svelte-check`, production build, unchanged G3 budgets,
  and visitor chunk scan.
- Manual scene matrix in H1 and `/museum/editor`: single/multi/cluster move,
  rotate, uniform/independent scale, snaps, keep-on-floor, Escape, undo/redo.
- Manual camera matrix in H1 and relic: node position/target, pending first
  node, connection anchor, view target, no-op, cancel, preview locks.
- Manual host lifecycle: select across scene↔camera repeatedly, switch 3D→Plan
  during idle and after cancel, replace/reset project, and remount route; one
  helper only, orbit restored, no stale handle, no duplicate history, no
  console errors.
- Manual S7 layout boundary: hierarchy-select room/wall/opening/anchor/object;
  selection/highlight/inspector remain, transform buttons disabled, no handles,
  no project/history/dirty change. Profile stays read-only. Direct wall pick
  remains under the existing S6.1 gate.

### 8. Close the slice

- Update `docs/components/placement.md` with the host/adapter contract and S7
  detached-layout/S8 activation boundary.
- Update `docs/hand-off/CURRENT.md` from S7 planned → shipped with exact tests,
  verification counts, and any as-built deviations; set S8 as next slice.
- Add the focused S7 plan link to the umbrella step/handoff when closing.
- Do not mark layout gizmo editing shipped; that belongs to S8.
- No commits unless requested.

## Regression matrix

| Concern | Required assertion |
|---|---|
| One host | One `ThreeTransformControls` constructor, helper, listener set, and disposer per mounted 3D Canvas |
| Host purity | Host classifies no placement/camera/layout identity and calls no document mutator |
| Active domain | H1 adapter comes only from `ActiveEditorSelection`; missing helper never falls through to stale domain |
| Scene parity | Pivot, rigid deltas, scale modes, snaps, grounding, status, cancel, and one scene history entry unchanged |
| Camera parity | Node/target/anchor/view target/pending-node semantics, epsilons, room-local mapping, and history unchanged |
| Policy | Toolbar, shortcuts, handles, and begin guard agree on allowed mode/axis/space |
| Orbit | Exact prior enabled state restored once on commit, cancel, target change, view change, and unmount |
| FSM | Scene and camera use one generic Selected→Dragging→Selected/Idle flow; no placement-only snapshot owner remains |
| Escape | Adapter cancel runs once; later `mouseUp` cannot commit; existing domain-specific selection result preserved |
| Layout math | All five identities resolve authored/compiled proxy poses and baseline deltas; stale/read-only identities return `null` |
| S7 layout gate | No draggable layout handles, no preview-state mutation, no dirty/history change until S8 |
| Pointer precedence | TransformControls handles still consume pointerdown before S6 selection; one raycast coordinator remains |
| Resource lifetime | Helper/proxies/listeners removed once; repeated target/route changes do not accumulate objects or callbacks |
| Relic | `/museum/editor` scene/camera outputs and tool behavior unchanged; no layout adapter input |
| Visitor | `/museum` chunks contain no editor gizmo/selection/session code |
| Purity/architecture | No Three/Svelte/DOM below `$lib/layout`; no gizmo proxy serialized; camera route/motion unchanged |
| Bench | No geometry/draw/render-work baseline change |

## Non-goals (deferred)

- Live layout candidate preview, structural/geometry/compile/wall-mesh
  validation, last-valid preview, canonical install, and one `layout` history
  entry (S8).
- Re-enabling direct 3D wall/interior-anchor picks or hover/anchor-helper
  overlays (S6.1).
- Layout delete, duplicate, multi-select, room scale, wall rotate/scale,
  opening depth/thickness edits, or new layout object kinds.
- Scene schema v7 independent-scale persistence.
- Camera route/motion changes, new camera system, or Plan camera mutation.
- Plan staging (C1), user GLB import/package work (post-H1 S9), G5
  optimization, or any visitor behavior change.
- Replacing Three/Threlte, forking TransformControls, or adding a second gizmo
  implementation.

## Expected files

Conceptually new:

```text
apps/museum/src/lib/editor/gizmo/editor-gizmo-contract.ts
apps/museum/src/lib/editor/gizmo/editor-gizmo-policy.ts
apps/museum/src/lib/editor/gizmo/EditorTransformControlsHost.svelte
apps/museum/src/lib/editor/gizmo/scene-gizmo-adapter.svelte.ts
apps/museum/src/lib/editor/gizmo/camera-gizmo-adapter.svelte.ts
apps/museum/src/lib/editor/gizmo/layout-gizmo-target.ts
tests/lib/editor/gizmo/editor-gizmo-policy.test.ts
tests/lib/editor/gizmo/editor-gizmo-host.test.ts
tests/lib/editor/gizmo/scene-gizmo-adapter.test.ts
tests/lib/editor/gizmo/camera-gizmo-adapter.test.ts
tests/lib/editor/gizmo/layout-gizmo-target.test.ts
```

Primary edits:

```text
apps/museum/src/lib/editor/EditorTransformControls.svelte        (thin composer)
apps/museum/src/lib/editor/EditorViewportToolbar.svelte          (generic policy)
apps/museum/src/lib/editor/h1/H13DView.svelte                    (active-domain input)
apps/museum/src/lib/editor/EditorViewport.svelte                 (relic composer parity)
apps/museum/src/lib/editor/hooks/shortcuts.svelte.ts             (policy-gated modes)
apps/museum/src/lib/editor/store/editor-interaction-store.svelte.ts
apps/museum/src/lib/editor/store/interaction-fsm.ts
apps/museum/src/lib/editor/museum-editor.svelte.ts               (generic transform kind/canceler seam only)
apps/museum/src/lib/editor/editor-transform.ts                   (legacy target helper retired/consolidated)
tests/lib/editor/editor-transform-target.test.ts                (migrate to adapter resolution)
tests/lib/editor/store/editor-interaction-store.test.ts
tests/lib/editor/store/interaction-fsm.test.ts
tests/lib/editor/store/editor-toolbar.test.ts
tests/lib/editor/h1/contracts.test.ts
docs/components/placement.md                                    (on close)
docs/hand-off/CURRENT.md                                       (on close)
```

Untouched behavior owners: `camera-route.ts`, `camera-motion.ts`, layout codec,
shared compiler, wall-mesh builder/adapter, project codec/import/export,
visitor scene, and S6 pick arbitration. Exact files may consolidate, but the
single host, domain adapters, detached S7 layout boundary, and S8 activation
seam may not collapse.

## Verification

```text
npm test -w @portfolio/museum
npm run check -w @portfolio/museum
npm run build -w @portfolio/museum
```

Plus:

- focused fake-host lifecycle tests for begin refusal, preview, commit, every
  cancel reason, orbit false/true restoration, target switch, and late
  `mouseUp` suppression;
- existing placement/cluster/scale-vector/camera/path/view/history/FSM/
  shortcut/toolbar suites unchanged at the behavioral boundary;
- S0–S6 H1 contracts and relic route smoke;
- production visitor chunk scan for gizmo/editor markers;
- unchanged G3 budget run (no re-baseline); and
- manual QA in step 7.
