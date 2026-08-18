# Current Museum Agent Handoff

## Status

**North star:** layout-first / Chopin-as-data — [`../north-star.md`](../north-star.md).  
**P0:** Layout CAD Foundation — [`../plans/2026-08-10-layout-cad-foundation.md`](../plans/2026-08-10-layout-cad-foundation.md).  
**Completed:** A0 LayoutDocument codec + B0 Chopin `rooms.ts` compiler + A1 pure line geometry/preview model/transaction stub + C0 `MuseumProject` codec + A2 read-only layout preview workspace + A2.1 rectangle/polygon drafting + A2.2 meter-scale editing + Chopin floor correction + A2.3 geometry-only opening authoring + numeric opening dimensions + A3 Bezier walls, arc-length openings, derived arch profiles + A3.1 camera-style wall bend anchors, opening viz fix, Plan opening drag + A4 layout objects, inspectors, layout JSON I/O + A4.1 Layout Authoring Polish + B3 Room-Unit Relocate + B4 Runtime Dual-Read + B5 Serialized Project Runtime Cutover + G1 Shared Geometry Compiler + G2 Explicit Plan Render Boundary + G3 Graphics Performance Harness + G4 Procedural Architectural Meshes + H1 S0/S1/S2/S3/S4/S5/S6/S7/S8.

Full-track Phase 2 scene presets = deferred optional.

**H1 scope revision (2026-08-15, approved):** S7/S8 (gizmo unification + layout
adapter + atomic drag history) stay in H1; S9 (user GLB import) + backend
expansion defer to the post-H1 plan. Re-assessed: S6 **6/10** (implementation
Frontier), S8 plan **Frontier**, S10 **7/10** (implementation Frontier). Exit
criteria amended: catalogue-only asset placement; H1 packages contain no user
binary assets. Umbrella step 9 + the re-labeled
[`../plans/2026-08-14-graphics-h1-s9-asset-package.md`](../plans/2026-08-14-graphics-h1-s9-asset-package.md).

**H1 S10 sequencing (2026-08-17, approved):** camera authoring is split into
three ordered slices: **S10 technical extraction first**, then **S10.2 Camera
Flow model**, then **S10.1 UX/UI rework** consumes both. S10 is the
contract/plumbing slice for explicit Scene/Camera context, context-safe helper
and bottom-timeline gates, strict Close-loop graph completion, atomic mutation,
and selection semantics. S10.2 reworks ordering into an open-chain Camera Flow
(main route + detours, no loop requirement) so appending a camera needs exactly
one connection and the restrictive "connect to both" case disappears. S10.1
owns the dedicated Camera Flow sidebar, final toolbar composition, Place Camera
relocation, transitions, and polished workspace presentation. Focused plans:
[`../plans/2026-08-17-graphics-h1-s10-camera-extraction.md`](../plans/2026-08-17-graphics-h1-s10-camera-extraction.md) ·
[`../plans/2026-08-17-graphics-h1-s10.2-camera-flow-model.md`](../plans/2026-08-17-graphics-h1-s10.2-camera-flow-model.md) ·
[`../plans/2026-08-17-graphics-h1-s10.1-camera-workspace-ui-rework.md`](../plans/2026-08-17-graphics-h1-s10.1-camera-workspace-ui-rework.md).

**H1 S10.2 Camera Flow model (2026-08-17, implemented — slices 1–4, uncommitted):** the
closed-loop "Guided Tour" becomes one ordered main route plus optional detours
that return to their origin. Ordering stays the persisted
`nextNodeId`/`previousNodeId` links (the existing order-vs-connectivity split),
the codec relaxes "both-or-neither / must close" to simple chains, and the
only new persisted field is `detourOfNodeId` on a detour head. The loop is no
longer a persistence requirement — **Loop is derived, never a mutation**: it
exists iff a distinct tail↔head connection record exists and is not a chain
transition (uniform for all N; a two-node pair never loops). Append = one
auto-created edge; insert = at most one; the old edge is retained as unused
(never auto-deleted — edges own authored motion). The two-node seed simplifies
to an open pair, removing the degenerate closed 2-cycle that caused the
`each_key_duplicate` gizmo crash. Slices 1–4 are done and green: codec accepts
open chains + legacy closed cycles + one-node detours (`validateVersionTwoTour`
component analysis); `getFlowRoute` walks to the open tail and derives the
loop; the timeline uses the open-chain boundary; mutator has generalized
reorder/insert/remove, detour ops (add/append/remove/whole-delete with F5
return edges + T9 strict splices), open-pair seed, and the full microcopy
contract (incl. loop-on/loop-off announcements); S10's `closeGuidedTourLoop` /
`findClosableGuidedChain` are removed; rename pass done (`getFlowRoute`,
`CameraFlowPanel`, "Preview Flow"). Verified: 1660 tests pass, svelte-check 0
errors, build clean. Slices 5–6 (sidebar tree, timeline drill-down, standalone
placement) land in S10.1, which must be reworked against this model instead of
the Close-loop empty-state language.

**H1 S10.1 camera-node order model — product direction + live bugfix round (2026-08-17, uncommitted):** the
Camera workspace should speak one ordered camera path — **Node 1 → Node 2 → …** —
not "Guided Tour vs Free Nodes" (the reciprocal-link internals). The S10.1
plan amendment captures the direction. **Implementation landed (2026-08-18,
uncommitted):** increments S10.1.0–S10.1.7 are in the working tree —
`lucide-svelte` (editor-only), the `Select | Move | Rotate | Add camera | View`
Camera toolbar (Scale hidden, Place Camera relocated out of the app bar), the
Sequence Inspector (`CameraFlowPanel` numbered rows + detour groups + derived
`Loops via:`/`Stops at` row + `Not in order yet` Unused tray), the derived-loop
timeline readout (`EditorCameraTimelinePanel`), retained connections as
desaturated dashed splines with a View-menu toggle, grid visibility/opacity
control (bottom-right overlay) + corner XYZ orientation gizmo, and the
Plan↔3D / Scene↔Camera mount fades with `prefers-reduced-motion` guards.
Verified: 1671 tests pass, `svelte-check` 0, build clean, plus a live dev-server
visual pass (toolbar, gizmo axes, grid popover, timeline empty state). The
earlier speculative pass (a timeline-panel repair UI with Set order / Close
loop / diagnostics plus `findClosableGuidedChain` / `findSimpleGuidedCycle`)
was audited and reverted as overengineering that did not fix the reported
failures.

**Live bugfix round (2026-08-17):**

1. **Two-node preview crashed the render flush (`each_key_duplicate`).**
   `EditorCameraTimelineDots` keyed timeline edges by `edge.connectionId`
   alone, but a two-node guided cycle reuses its single undirected connection
   for both directions, so the forward and return edges collided and Svelte
   threw `each_key_duplicate` on every render. A thrown error mid-flush left
   the gizmo composer's detach effect unrun — TransformControls stayed
   attached to a helper root the connect branch had just unmounted, producing
   the reported `TransformControls: The attached 3D object must be a part of
   the scene graph` spam and "drag rotates the screen". Fixed by keying edges
   `\`${edge.connectionId}:${edge.direction}\``; regression test pins the two
   distinct direction keys for the two-node reciprocal cycle.
2. **Escape was dead in H1.** The shortcut cascade's W/E/R/T mode-key
   `else if` swallowed plain Escape (interactionStore branch runs first), so
   `cancelPendingNavigation` never fired and the connect-pending-node prompt
   could not be dismissed. The cancel cascade now runs at the top of the
   mode-key branch (relic path unchanged); regression test covers Escape with
   an H1 `EditorInteractionStore` present.
3. **Two-node guided seed** (kept from the S10 pass): connecting the second
   placed node seeds the `[existing, new]` reciprocal cycle in the same scene
   transaction, so Preview Tour is ready immediately for the user's
   "place camera 2 → connect via sidebar → preview" flow (relic gated via the
   `isRelic` host getter).

   Verified live (dev server, browser-driven store flow): place camera 1 →
   place camera 2 → Escape now cancels cleanly; sidebar connect seeds the
   two-node cycle, `canStartTourPreview` true, timeline renders without the
   duplicate-key error, and re-selecting a node re-attaches the gizmo to an
   in-scene root. **Resolved in the S10.1 implementation:** the rotate-camera
   affordance landed (camera nodes expose `Select | Move | Rotate`, rotate =
   target-orbit aim). **S10.1 closeout landed (2026-08-18):** **B0 standalone
   placement** — every H1-placed node commits immediately as a free node
   ("not in order yet", one `scene` entry); connecting later goes through
   `connect-existing`, which seeds the two-node open pair so the "place 1 →
   place 2 → connect" flow converges to a previewable pair. The codec's
   `disconnected_graph` check now exempts edge-less standalone free nodes
   while still rejecting split graphs. The frozen relic keeps the
   `connect-pending-node` contract. **View-breakpoint Aim** —
   `commitSelectedViewKeyframeAim(yaw, pitch)` orbits the breakpoint look
   target around its eye (shared pure `orbitWorldLookTarget`, fixed radius,
   one framing entry) with a coincident eye→target guard; the View breakpoint
   inspector exposes `Yaw Δ (°)` / `Pitch Δ (°)` + Apply Aim. Verified:
   **1690 tests pass**, `svelte-check` 0, build clean.

**Roadmap after S10.1 (2026-08-18).** The S10.1 closeout (B0 standalone
placement + view-breakpoint Aim control) is **done**. The two 2026-08-18 design docs
([`camera-graph-workspace-design`](../plans/2026-08-18-camera-graph-workspace-design.md) ·
[`camera-framing-adopted-model`](../plans/2026-08-18-camera-framing-adopted-model.md))
then land as the **final H1 slice S10.3 — camera redesign**: successor
shell (S10.3.1), Camera Plan (S10.3.2), framing engine A0–A2 in parallel,
framing UX (S10.3.3), polish (S10.3.4) — sectioned and sequenced in
[`2026-08-18-s10.1-camera-followup-sectioning-framing-and-camera-plan.md`](../plans/2026-08-18-s10.1-camera-followup-sectioning-framing-and-camera-plan.md).
H1 sign-off happens after S10.3; the plan-system renewal then executes
(hard-gated immediately-next step). S11 stays reserved for import/export.
Post-H1 work is out of scope for now.

**Plan-system renewal (note, 2026-08-17):** after H1 lands, the letter-coded
plan families (A0–A4, B0–B5, G1–G6, H1 S0–S12, C1/C2, D1, S9a) are archived
and plan tracking restarts on one sequential scheme — the letter codes are
confusing across tracks and are not extended past H1. Approved-but-unscheduled
work (C1) is re-registered in the new tracker rather than re-lettered. C1
sequencing is locked: **H1 lands first; all C1 work, including Path A,
starts after the H1 gate.** The renewal plan
[`../plans/2026-08-17-plan-system-renewal.md`](../plans/2026-08-17-plan-system-renewal.md)
is the **immediately next step, hard-gated**: it executes before any other
post-H1 work (C1/P2, S9a, G5, multi-story) may start.

**H1 scope addition (2026-08-17):** catalogue asset placement must be
room-agnostic — the pre-H1 Paris hardcode (`beginAssetPlacement` →
`selectRoom('paris')` + `EditorSelection` → Paris-only floor match + the
Chopin-only `roomById` default) is a frozen-relic leftover leaking into the
greenfield H1 path, where a boot-empty project has no `paris` room. Added as
H1 step **8.1** (difficulty 4/10): resolve the room from the clicked floor
like shapes/lights already do, keep `/museum/editor` Paris-oriented via the
existing `relic` flag, and add a non-Paris room regression test.

**H1 frozen-Chopin audit (2026-08-17):** a sweep of the greenfield path for
pre-H1 Chopin assumptions found the Paris placement hardcode (S8.1) plus two
more actionable leaks, filed as **S8.2**: room focus is Paris-gated
(`focusRoom` refuses non-`'paris'`; `EditorCameraRig` frames via the
Chopin-only `getRoom`, which would throw on a drafted id — latent because the
unified tree does not call `focusRoom` yet), and cluster grouping expands
`'paris'` instead of the cluster's room. Benign Chopin defaults (no H1 action;
cleanup optional at relic removal): `pickInitialNavigationNodeId`'s
`'paris-seat'` preference (already null-safe), the store constructor's
`museumSceneDocument`/`chopinRuntime.rooms` fallbacks, the
`createLayoutPreviewState`/`loadChopinLayoutPreview` Chopin fixture,
`editor-camera-path`/`editor-camera-view` `chopinRuntime.rooms` default params
(H1 helpers pass `store.rooms`), `treeExpandedRoomIds`' `['paris']` seed
(unified tree reaps it), and H13DView's `forceParisAssets` (no-op in an empty
scene).

## Next slice

**Known debt / next slice (2026-08-16):** direct 3D **wall selection is deferred by decision** — `H13DView.handleLayoutPick` falls through for `wall`/`interiorAnchor` resolutions via the pure `isLayoutDirectPickDeferred` gate (rooms/openings/objects stay directly pickable). **Hierarchy wall selection + the selection-highlight shell are shipped:** `UnifiedProjectTree` wall rows commit `selectLayoutWall`, and `LayoutPreviewScene` renders the gold `LayoutWallHighlight` overlay from `interaction.selection` alone (`matchWallRanges`/`matchOpeningRanges` + `buildWallHighlightMesh`), so tree-picked walls/openings/anchors light up in 3D. The hover feed (`onLayoutHover`) and anchor-helper octahedra remain disconnected (deferred). Named follow-up **S6.1**: re-enable direct 3D wall picks after a root-cause browser QA — the original "unreachable" failure was never proven at runtime; pure probes resolve walls correctly, so the defect (if live) likely sits in live-scene arbitration. See the S6 plan addendum (revision 2026-08-16).

**H1 S8.1 + S8.2 shipped — room-agnostic catalogue placement + room focus / cluster-group expansion (2026-08-17, uncommitted).**
S8.1: `get isRelic()` exposed over the private `relicMode` flag and threaded
into `EditorPlacementClusterMutatorHost`; `beginAssetPlacement` preselects
`paris` only in relic mode and posts the generic tagged-floor message in H1;
`createPendingPlacementAt(position, roomId)` stamps the resolved room;
`EditorSelection` resolves the clicked floor via `store.rooms.has(id)` +
`store.rooms.localPoint` in H1 (relic keeps the `'paris'` path); CTA strings
generic in H1 (`Place in room`, H13DView hint). S8.2: `cameraFocusRoomId`
intent added to the session store; `focusRoom` gates on
`(isRelic && id !== 'paris') || !rooms.has(id)` and stores the id;
`EditorCameraRig` frames the room focus kind via `createEditorRoomBoundsCameraFrame`
(compiled `bounds3` through the bounds path, H13DView passes `roomBoundsById`)
when `!isRelic`; relic stays on `createEditorRoomCameraFrame(getRoom(...))`;
grouping expands `selectedCluster.roomId` instead of `'paris'` in both group
handlers. Relic Paris-oriented behavior pinned by tests (preselection, entity
`roomId: 'paris'`, `focusRoom('entrance')` still refused). Full suite **1618
green** (up from 1606), `svelte-check` 0, build clean. Focused plans:
[`s8.1`](../plans/2026-08-17-graphics-h1-s8.1-room-agnostic-placement.md) ·
[`s8.2`](../plans/2026-08-17-graphics-h1-s8.2-room-focus-cluster-expansion.md).

**H1 S10 technical extraction implemented — uncommitted, verified (2026-08-17).**
H1 now passes an explicit `scene | camera` context prop through `H1EditorApp` →
`H13DView` → `EditorViewportToolbar` (`cameraAgnosticViewMenu` removed from the
H1 path; the relic keeps its absent-prop `currentWorkspace` fallback). The
Scene View menu owns Ceiling only; the Camera View menu owns the three
camera-helper rows (Node handles / Tour paths / Framing & FOV). Camera
authoring overlays and the connect-flow node-handle force-mount are gated to
Camera (`isCameraContext && (viewportShowNodes || forceMountCameraNodeHandles)`
preserved); `EditorCameraRig` stays always mounted; the full-width bottom
`EditorCameraTimelineFrame` mounts only for `viewMode === '3d' &&
active3dContext === 'camera'`. Pure `findClosableGuidedChain(document)`
(one conservative open simple chain: order-free nodes, N-1 edges, no parallel
edges, exactly two endpoints, deterministic document-order start, no existing
return edge) plus atomic `closeGuidedTourLoop()` append exactly the missing
last→first return edge, rewrite all reciprocal links, commit one `scene`
history entry, select the new return connection, and post the deterministic
endpoint status; the two-node bootstrap stays the explicit-order path (never
a duplicate edge). Inspector panels remain selection-domain-driven, including
preserved camera selection in Scene; Plan and `/museum/editor` boundaries
remain unchanged. **S10.2 supersedes the Close-loop contract** (open-chain
Camera Flow: the loop is derived, never a mutation) — S10.2 slice 3 reworks
the same mutator, so S10's close-loop piece is transitional. Focused
graph/camera/H1 contract suites: **180 passed** (graph 18, contracts 67,
camera 95); full museum suite: **1635 passed, 1 skipped**; `svelte-check`:
**0 errors, 0 warnings**; production build: **clean**. S10.2 (Camera Flow
model) is the next slice, then S10.1 (dedicated sidebar, Place Camera
relocation, transitions, Lucide integration, visual polish).

**H1 S7 shipped — Single TransformControls host and target adapters (steps 0–6, 2026-08-16; committed 2026-08-17).**
One `EditorTransformControlsHost.svelte` owns the sole `ThreeTransformControls` per mounted 3D Canvas; `EditorTransformControls.svelte` is a thin composer resolving one nullable adapter from the H1 `ActiveEditorSelection` (relic keeps its legacy arbitration through the same adapters). Step 0 pinned the contracts block + recorded behavioral fixtures; step 1 added the shared host/adapter/session/policy contracts + pure policy helpers + the FSM `ACTIVE_TARGET_CHANGE` event (removing the dead ESC-from-Dragging revert and the placement-only `DragSnapshot`); step 2 extracted the host against a fake-host lifecycle harness (begin refusal, orbit true/false restore, single cancel, late-mouseUp suppression); step 3 moved the scene placement session into `scene-gizmo-adapter.svelte.ts` (pivot, rigid baselines, snaps, keep-on-floor, one transaction); step 4 moved the camera session into `camera-gizmo-adapter.svelte.ts` (node/anchor/view-target, pending drafts, epsilons); step 5 added the pure `layout-gizmo-target.ts` descriptors + baseline-relative delta math for all five layout identities and threaded the S7 "not interactive" gate to the toolbar/shortcuts (no live layout adapter); step 6 drives the toolbar + W/E/R/T shortcuts from the generic `projectGizmoCapabilities` projection (scene/camera policies shared with the host; scale chain scene-placement-only). Layout selections stay detached — transform buttons disabled, no handles, no project/history/dirty change — until S8. Full suite **1565 green** (up from 1518), `svelte-check` 0, production build clean, `/museum` visitor chunk graph free of gizmo/editor markers, G3 bench budgets pass unchanged (no re-baseline). Two as-built camera-gizmo deviations surfaced during manual QA and were fixed:

1. **Camera Y translate handle was silently dropped (fixed).** The S7 camera
   adapter hard-coded `CAMERA_AXES = {x, z, xz}`, hiding the green Y handle the
   pre-S7 monolith always exposed (the monolith never touched
   `showX/showY/showZ`, so camera targets got full XYZ translate). The S7 plan
   only locks "world-space translate only, no rotation/scale handles or snaps"
   — never an XZ restriction — so this was an unplanned extraction regression,
   not a locked decision. Fixed 2026-08-16: `camera-gizmo-adapter.svelte.ts`
   restores the full `x/y/z/xy/xz/yz/xyz` translate set (the host derives
   `showY=true` from it), pinned by a regression test in
   `camera-gizmo-adapter.test.ts` (full allowed-axes set, `deriveShowAxes` all
   components, and a `'Y'`-axis drag that actually writes `position[1]` with
   one history commit); the `CAMERA_POLICY` fixture in
   `editor-gizmo-policy.test.ts` was updated to match.
2. **Gizmo freeze after connecting a camera node (root-caused + fixed
   2026-08-16).** Reported as "ui freezes after adding a new camera and
   connecting to the previous — cannot use the gizmo, menu options dead". The
   freeze signature: `TransformControls: The attached 3D object must be a part
   of the scene graph` every frame + a `pointerDown` null-crash on click.
   Investigation ruled out a timer-driven detach (gizmo persisted through 6s+
   idle in both the first-node and pending-node flows; the only editor timer
   is the 2.5s status message). Two contributing findings: (a) the
   **connect-commit switches the selection to the new connection**, so the
   node gizmo detaches immediately — by design (a connection shows path
   helpers, not a node gizmo); (b) a host-lifecycle defect where `setAdapter`
   skipped same-key adapters **without comparing the proxy**, leaving the
   gizmo attached to a scene-removed root after a helper remount — hardened
   in `editor-gizmo-host-controller.ts` (skip only same-key **and**
   same-proxy; same-key with a new proxy re-attaches, one
   `ACTIVE_TARGET_CHANGE`; regression test covers the remount and the
   fresh-adapter-same-proxy skip).

   **Definitive root cause (found by instrumented live repro + exception
   stack):** `EditorCameraPathHelpers`'s `$effect` threw
   `Unknown project layout room: layout-room-1` during the connect flush. The
   editor's camera path/view math (`editor-camera-path.ts` /
   `editor-camera-view.ts`) resolved node/anchor/view-keyframe points through
   the deprecated global `chopinRuntime.rooms` (frozen Chopin museum) instead
   of the store's live project-layout registry (`store.rooms`) — the same
   registry H1 S2's camera placement already uses. On a boot-empty project the
   drafted room is not in Chopin's registry, so the exception aborted the
   Svelte effect flush before the gizmo composer's `$derived` could re-run
   (the selection had just become a connection), the host never detached, and
   TransformControls stayed attached to the pending node's position helper
   root that the pending branch had just unmounted. **Fixed:** threaded an
   optional `LayoutRoomRegistry` (default = the legacy Chopin global, so the
   relic and existing tests are unchanged) through `editor-camera-path.ts`
   (path builder + anchor read/write/create, with a registry-aware
   boundary-AABB inside-check preserving the legacy centered-box semantics)
   and `editor-camera-view.ts` (keyframe target read/write/create + world
   position), then passed `store.rooms` at every editor call site:
   `EditorCameraPathHelpers`, `EditorSelection`, `EditorCameraViewHelpers`,
   `EditorCameraFramingHelpers`, `EditorCameraRig`, `view-keyframe-controller`,
   `path-anchor-mutator` (+ `rooms` on its host + `controller-hosts.ts`
   wiring), and the store's `selectedViewKeyframeWorldTarget`. This also fixes
   the same latent crash for path-anchor dragging and view-keyframe editing on
   drafted rooms. Verified live: draft room → place camera 1 → place pending
   camera 2 → connect now commits with zero exceptions and zero
   TransformControls spam (was: exception + ~300 spam errors in 2s + frozen
   UI), and re-selecting a node afterward re-attaches the gizmo; full museum
   suite **1518 green**, `svelte-check` 0.

**H1 S8 shipped — Layout candidate-session adapter + atomic layout history (steps 0–5, 2026-08-17).**
S8 activates the S7 detached descriptors: a live layout adapter per identity
(room/wall/opening/interior-anchor/object) previews a validated candidate
document from the immutable baseline + `deriveLayoutGizmoDelta`, then commits
exactly one `layout` history entry on pointer-up — no throwaway mutation path.
Step 0 pinned the S8 contracts block in `contracts.test.ts` (marker re-scope:
`LAYOUT_FACADE_MARKERS` with `beginLayoutTransaction` added + the
`layout-gizmo-adapter.svelte.ts` exemption; nullable `layout` policy slot;
composer wiring; transient prop; `deriveLayoutCandidate` return contract +
`isShiftHeld`). Step 1 added the pure `layout-gizmo-candidate.ts` pipeline
(`deriveLayoutCandidate` = structural → geometry → compile → wall-mesh
preflight, never throwing; per-kind builders incl. `translateWallUnit` with
exact wall/endpoint/interior-anchor/adjacent-shared-corner closure and opening
clamps). Step 2 added `layout-gizmo-adapter.svelte.ts` (begin refusal → null
session, canonical-untouched preview, last-valid retention, one atomic
`commitLayoutCandidate` install + one `layout` history entry, no-op adds none,
every cancel reason restores, transient slot cleared). Step 3 flipped the gate:
composer resolves the live adapter from the descriptor (host stays
constructor-/descriptor-free), `EditorGizmoDomainPolicies` gains the nullable
`layout` slot, H13DView/H1EditorApp resolve per-selection descriptors and gate
only a stale identity (`layout domain && descriptor null`), and
`LayoutPreviewScene` accepts the `transient` bundle with active-source
re-keying (the candidate bundle renders beside the committed project during a
drag). The four S8 `it.todo` contracts went live. Full suite **1606 green** (up
from 1565; 18 new candidate/adapter tests), `svelte-check` 0, production build
clean, `/museum` visitor chunk graph free of gizmo/candidate markers, G3 bench
budgets pass unchanged (no re-baseline). As-built notes: (a) the two S7
contracts tests asserting the detached state were updated to the S8-flipped
reality — the host stays descriptor-free while the composer resolves the live
adapter, and the toolbar/shortcuts gate is now stale-identity-only; (b)
`deriveLayoutCandidate` was aligned to the plan's pinned contract — the inline
`{ bundle | null, issue | null }` return (the interim named
`LayoutCandidateResult` type was removed) and the parameter list grew from the
plan's 4 args to 7 (`scene`, `projectId`, `projectName` added because
`derivePreviewBundle` needs a full project); (c) the
invalid-candidate test trigger is `opening_over_height` (sill+height > floor
height) — translating a rectangle wall never folds it, so the wall path stays
geometry-safe; (d) interactive 3D drag QA (pointer-driven gizmo sessions) still
needs a human pass — this environment has no browser-automation/preview tooling,
so the session behaviors are covered by the automated suite + a dev-server smoke
(`/`, `/editor`, `/museum` all 200); (e) a post-ship review wired the
previously-dead `session.lastIssue` to `store.setStatusMessage` (surfaced on the
first invalid frame, cleared on valid/commit/cancel), exported
`applyLayoutSnapPolicy` as a pure tested seam (grid-drift re-derivation + 15°
angle snap), added a defensive commit guard (refuse to install if the
transaction was closed out-of-band), and extended the cancel-reason matrix to
all six `EditorGizmoCancelReason` variants. Plan:
[`../plans/2026-08-16-graphics-h1-s8-layout-gizmo-candidate-session.md`](../plans/2026-08-16-graphics-h1-s8-layout-gizmo-candidate-session.md).

**H1 S6 shipped — Centralized 3D layout selection.** One coordinator, zero new Canvas listeners: `EditorSelection.svelte` gains an optional `onLayoutPick` prop (absent on the frozen relic mount) that slots a layout branch into the existing click flow after the placement + Alt-cycle branches, reusing the single `intersections` list (no second raycast). Pure `layout-3d-picking.ts` grows `Layout3dHitCandidate`/`Layout3dResolvedHit`, a structural `layoutCandidatesFromIntersections` (no `three` import — `RaycastHitLike` shape, authored `surfaceType`/`editorEntity` walk-up only), and `resolveLayout3dHits(pickIndices, hits)` → `{ selection, distance } | null`: nearest-visible wins; same-depth (`|Δd| ≤ 1e-4`) ties break anchor → opening → object → wall → room then stable input order; wall-triangles resolve through the S5 `layout3dPickIndexByRoom` cache (unresolvable refs dropped). Cross-domain arbitration is exact, never nearest-tag guessing: `resolveNormalSelectionWithHit` exposes the actionable source hit + its `distance` (deselect → `null`; near-invisible tagged hits filtered), and the strict pure yield rule `layoutPickBeatsSceneDistance` commits layout only when `d_scene === null` or `layoutDist < d_scene − ε` — content wins the exact-tie band, so the `LayoutWallHighlight` shell / grid / placement ghost never shadow a real pick. `LayoutPreviewScene` tags the wall mesh `userData={{ surfaceType: 'wall', roomId }}`; `H13DView` wires `onLayoutPick={store.isVisitorCameraPreview ? undefined : handleLayoutPick}` and commits through the existing `selectLayout*` helpers (S3 activation, S4 tree reveal, S5 highlight all fire from that one write; a follow-up scene/camera pick still clears layout via the S3 hook). 26 new tests (8 resolution, 10 extraction/commit-route incl. cross-domain boundaries, 4 normal-resolver source preservation, 4 S6 contracts); full suite **1431 green**, `svelte-check` 0, build clean. As-built deviation: the cross-domain yield rule is a shared pure helper so the handler and tests compare identically. Plan: [`../plans/2026-08-15-graphics-h1-s6-layout-3d-selection.md`](../plans/2026-08-15-graphics-h1-s6-layout-3d-selection.md).

**H1 S5 shipped — Wall/opening 3D pick metadata.** Every triangle of the G4 wall mesh now resolves to exactly one deterministic authored pick owner, plus the renderer-neutral machinery S6's 3D selection coordinator consumes. `IndexedWallMesh` gains an additive `pickRanges: Layout3dPickRange[]` — a sorted, non-overlapping, complete partition of the index buffer, emitted at build time from per-face tags: wall `side`/`lintel`/`bridge` surfaces and opening `jamb`/`sill`/`lintel`/`arch-reveal` surfaces (sill strips → `'sill'`, lintel band/top → `'lintel'`, undersides → `'arch-reveal'`, reveal jambs → `'jamb'`, bevel bridges → `'bridge'` owned exclusively by the current/start wall — never the neighbor, never both, overriding the `wallRanges` shared-entry convention for picking). New pure `layout-3d-picking.ts` (plan-hit.ts precedent, no Three/Svelte/DOM imports): `buildLayout3dTriangleIndex(mesh)` returns a dense triangle→owner resolver built once per mesh generation with a partition dev-guard (gap/overlap/uncovered/unaligned throws, mirroring `assertWindingAgreesWithNormals`), plus `layoutAnchorHelperPlacements(geometry)` lifting compiled interior-anchor query records to room floor elevation. `layout-preview-state` caches `layout3dPickIndexByRoom` beside `wallMeshesByRoom` (same lifecycle, rebuilt on mutation/undo/redo/reset/import, never in the undo snapshot); the Three adapter carries `geometry.userData.pickRanges` (zero new groups, draw-call counts untouched); `LayoutPreviewScene` tags the ceiling `surfaceType: 'ceiling'` + `roomId` (no `editorSurface`, so placement grounding ignores it) and renders qualified editor-only anchor-helper octahedra at floor height — **inert between S5 and S6** (a stray helper click is just a background deselect, identical to wall meshes today; S6 promotes them to the top semantic priority). Zero topology change: `three-*-estimate` budgets hold exactly, `wall-mesh-build` gains only pickRanges emission overhead — no re-baseline. As-built deviation: `toPickRange` helper (TS2698 — TS rejects spreading a variable whose declared type includes `null` even after narrowing; a non-nullable parameter sidesteps it). **Post-ship review fixes:** anchor each-key now `JSON.stringify([roomId, segmentId, anchorId])` (colon-join collides for legal IDs — `ID_PATTERN` allows `:`), helpers gated by a `showAnchors` prop threaded from `H13DView` as `!store.isVisitorCameraPreview` (editor chrome must not frame a visitor preview; default keeps the relic mount unchanged), and `emitFaceWithPick` throws on an untagged face instead of silently folding it into the previous pick run. 26 new tests (5 builder pickRanges/tagging/bridge-ownership, 12 `layout-3d-picking`, 1 adapter userData, 7 S5 contracts, 1 preview-state cache lifecycle); full suite **1420 green**, `svelte-check` 0, build clean. Plan: [`../plans/2026-08-15-graphics-h1-s5-layout-3d-pick-metadata.md`](../plans/2026-08-15-graphics-h1-s5-layout-3d-pick-metadata.md).

**H1 S4 shipped — Unified project hierarchy. **S4 review fixes:** (1) the Plan gate leak — `GuidedTourPanel`'s guided + free node-row buttons (and their connections chevrons) called `selectNode`/`toggleNodeConnections` unconditionally, so a Plan click on a camera node activated the camera domain (selection, branch auto-expand, domain-driven inspector) instead of a no-op; both rows are now `aria-disabled` with `interactive`-gated onclick, matching `NodeConnectionsPanel`, and the S4 contracts block asserts the gated handler shapes. (2) **S4 bugfix (post-ship manual QA):** the S3 shell `onLayoutSelectionChanged` effect was rewritten to be idempotent — it read `selection.workspace` reactively (via `selectedRoomId` inside `clearPlacementSelection`) and `setWorkspace` wrote a fresh object unconditionally, so any Plan pick that activated the layout domain (tree room-row click, viewport room click, door-commit auto-selecting the opening) spun the effect into Svelte's `effect_update_depth_exceeded` freeze. Slots are now written only when they differ from the detach target; a regression test pins the no-rewrite behavior (full suite now 1386 green).** One `UnifiedProjectTree` replaces the three workspace-specific surfaces with a single hierarchy over both documents, mounted in both views: new pure `unified-project-tree-model.ts` (rows carry the exact `LayoutSelection`/`WorkspaceSelection`/`NavigationSelection` identity; `buildUnifiedProjectTreeModel` orders layout rooms document-order and nests scene content by explicit `roomId`; `isUnifiedTreeRowSelected`/`isUnifiedTreeRowInteractive`); `UnifiedProjectTree.svelte` renders `Rooms → <layout room> → Architecture (walls/openings/anchors/objects) + Scene (clusters/entities with mini-actions)` and the `Camera Tour` branch embedding the existing `GuidedTourPanel` unchanged. Picks call the source APIs only (S3's hooks own exclusivity; the tree adds no per-row cross-domain code); Plan-view scene/camera rows render `aria-disabled` no-ops via `isUnifiedTreeRowInteractive` (C1 flips the scene branch later); camera components gained an optional `interactive` prop (default true) gating clicks **and** native drag; `h1/H1Sidebar.svelte` replaces `EditorLeftSidebar` in H1 (compact layout source/status header strip, Hierarchy|Assets tabs in 3D, layout-summary counts → tree row counts, "Reset empty" dropped as a Project-menu duplicate); `EditorInspector` gained an optional domain-driven `activeSelection` prop (relic falls back to `currentWorkspace`); room-expansion slot trimmed to live layout rooms; Camera Tour branch auto-expands one-shot on camera context/domain transition. Relic `/museum/editor` untouched. 15 pure-model tests + 6 S4 contracts; full suite **1385 green** (1386 after the S4 review-fix regression test), `svelte-check` 0, build clean. Plan: [`../plans/2026-08-15-graphics-h1-s4-unified-hierarchy.md`](../plans/2026-08-15-graphics-h1-s4-unified-hierarchy.md).

**H1 S3 shipped — Cross-domain selection.** One `ActiveEditorSelection` at the editor composition root: new `h1/active-editor-selection.svelte.ts` (`deriveActiveSelection` pure mapping + `EditorActiveSelectionStore` with `active` / `deselectActive` / `reset` / `onLayoutSelectionChanged`, exposed via context). The activation seam is `MuseumEditorStoreOptions.onSelectionActivate` (no-op default keeps the relic untouched): `EditorSelectionStore` fires it on actionable scene/camera picks (cluster, placement ids > 0, non-none navigation) — never on room-only latent context or deselect. The H1 shell clears the layout selection via the hook, clears scene/camera when the layout selection becomes actionable, and re-validates the layout selection after every layout swap via pure `reconcileLayoutSelection` (opening→wall, interiorAnchor→wall, room/object→none; parent-first like the scene side). Empty-click/Escape deselect the *active* domain via optional `onDeselect` props (`EditorSelection` ← `H13DView`, `LayoutPlanViewport` ← `H1PlanView`) + a `deselectActive` shortcut callback; all three reset actions (`EditorProjectMenu.resetScene`/`resetLayout`, sidebar "Reset empty") call `activeSelection.reset()`; construction-time convergence (`#convergeLegacyState`) clears surplus slots on a legacy multi-actionable state. 24 new tests (18 unit in `active-editor-selection.test.ts`, 3 S3 contracts in `contracts.test.ts`, 3 layout-reconcile cases in `layout-interaction.test.ts`); full suite 1371 green, `svelte-check` 0, production build clean. Plan: [`../plans/2026-08-14-graphics-h1-s3-cross-domain-selection.md`](../plans/2026-08-14-graphics-h1-s3-cross-domain-selection.md).

**H1 S2 shipped — Boot into an empty project.** The editor boots a canonical empty `MuseumProject` on every load and opens Plan (no New Project command): `createEmptyMuseumProject()` seeds both the scene store (`rooms = createLayoutRoomRegistry(project.layout)`) and the layout surface (`createEmptyLayoutPreviewState()`, `baselineKind: 'blank'`); `EditorViewState` defaults to `'plan'`; `resetToCheckedInDocument()` resets to the boot document (not Chopin); `canStartTourPreview` gates the Preview Tour button (false on zero nodes / a lone node, true once a guided chain exists). First-node authoring landed: a Place Camera button, a standalone zero-node commit, and project-relative room frames. Plan: [`../plans/2026-08-14-graphics-h1-s2-boot-empty.md`](../plans/2026-08-14-graphics-h1-s2-boot-empty.md).

**H1 S1 shipped — Editor shell (Plan | 3D).** New `h1/H1EditorApp` at `/` and `/editor`: `H1AppBar` (Plan | 3D + 3D context Scene · Camera), full-panel `H1PlanView` (SVG, no Canvas), and `h1/H13DView` — one fused Canvas always rendering `LayoutPreviewScene` (draft architecture) + `EditorMuseumEntities` (scene entities) + camera helpers over `MuseumScene(showArchitecture=false)`. `h1/editor-view-state.svelte.ts` (pure view state + tests; `active3dContext` collapsed to scene|camera). The pre-H1 `MuseumEditorApp` stays frozen at `/museum/editor` (relic) with its visitor Chopin shell. Plan: [`../plans/2026-08-14-graphics-h1-s1-editor-shell.md`](../plans/2026-08-14-graphics-h1-s1-editor-shell.md).

**H1 S0 is Closed.** Landed: `createEmptySceneDocument` + `createEmptyMuseumProject`, authoring-empty validator loosening, `EditorViewMode`, injectable scene room-resolver + zero-node policy (`pickInitialNavigationNodeId` returns `null`), and the relic store/menu guard (relic cannot reach the Layout workspace). The session/shell `it.todo` contracts in `tests/lib/editor/h1/contracts.test.ts` went green across S1 (view-switch preservation, relic smoke) and S2 (boot-blank session camera, preview lockout); the playback lock is pinned in `museum-editor-shell.test.ts`. Plan: [`../plans/2026-08-14-graphics-h1-s0-contracts.md`](../plans/2026-08-14-graphics-h1-s0-contracts.md).

**Post-H1 polish slice (locked):** Plan staging mode (C1) — scene entities
placeable/editable in Plan via a `layout | staging` tool; C2 (catalogue assets
as layout objects) is rejected in favor of C1. H1 keeps no C2 door: S9's
composite registry is scene-only, the manifest persists no footprint fields
(imported footprints are derived from loaded model AABBs at render time), and
Path A (read-only layer-5.5 Plan projection) is the H1-era interim reused by
C1. Plan: [`../plans/2026-08-14-graphics-h1-c1-plan-staging.md`](../plans/2026-08-14-graphics-h1-c1-plan-staging.md). See H1 plan "Post-H1 polish slices".

(Deferred, not abandoned — **G5 — Measured optimization and scale**: apply optimizations in order — cache derived geometry, partial rebuilds, stable render objects/keys, shared materials, merged `BufferGeometry`, culling, LOD, spatial indexing, instancing — stop when G3 budgets pass. G4 in [`../plans/2026-08-13-graphics-g4-procedural-architectural-meshes.md`](../plans/2026-08-13-graphics-g4-procedural-architectural-meshes.md); roadmap [`../plans/2026-08-13-graphics-architecture-roadmap.md`](../plans/2026-08-13-graphics-architecture-roadmap.md). No focused G5 plan yet.)

## Completed verification

- G1 compiler/parity/boundary hardening: shared geometry rejects unsafe sample budgets with structured issues, gives compiled entities + query records qualified identities, routes Plan committed hit geometry through compiled queries; `buildLayoutArchitectureModel()` remains deleted.
- G1 close (codec collapse + review round): one strict `validateLayoutDocument` below `$lib/layout` (unique floor/room/object/opening/segment/anchor IDs, ID pattern, positive numbers, unknown-key rejection, v1/v2 bezier migration); editor duplicate + its re-export shim deleted; project codec + editor share same layout import/save gate.
- G2 render boundary: Plan renders pure `PlanRenderModel` through `PlanSvg.svelte`; hit resolution = pure `plan-hit` module; camera/tour overlays project `project.scene` through existing route/motion system; selection encoded via style tokens (adapter render-only). Review round fixed wall-adjacent primitive placement regression, qualified selection identity for imported layouts, adapter selection decoupling.
- G3 performance harness: deterministic seeded 10/100/1,000-room fixtures compile codec-valid, zero blocking issues; Node tier (`plan-bench`) + deterministic browser tier (`browser-bench`) capture compile/model/hit/snap/cache-key/render-work/count metrics; `/dev/perf` dev-only, 404-gated in production. Chopin budgets checked in (`src/lib/bench/baselines/g3-baseline.json`), enforced fail-closed each CI pass; full 4-tier measurement under `BENCH_FULL=1`.
- G4 procedural meshes: pure `wall-mesh-builder` (room-scoped, watertight, surface-major, offset-overlap rejection, profile-union boundary faces, profile-aware bevel bridge + endpoint-reveal corner fixes) feeds Three `wall-geometry-adapter`; visitor `LayoutMuseumShell` + editor `LayoutPreviewScene` both render one indexed `BufferGeometry` per room; per-span chord-box path removed (boundary-tested); visitor keeps `textures="off"` tint parity. Browser smoke: clean console + zero failure surfaces at `/museum`. Harness re-baselined under method version 3 via `npm run bench:record` (Chopin: 6 objects / 6 draw calls / 12,876 triangles — bespoke music-chamber excluded before build; `wall-mesh-build` enforced; `/dev/perf` live WebGL honors the same exclusion).
- B5 production build passed; visitor chunk scan contains canonical project + `LayoutMuseumShell`, no architecture source toggle, runtime compiler, editor marker, standalone scene JSON, or legacy shell marker.
- B5 production browser QA passed: all nine guided nodes forward, reverse Back, free-mode direct navigation, reduced motion, HUD room updates, Paris + Music Chamber visuals, inert legacy query, clean browser errors, `/editor` 404.
- H1 S0: `createEmptySceneDocument`/`createEmptyMuseumProject` codec-valid + byte-stable; `empty_navigation` loosened for authoring-empty without weakening non-empty invariants; `EditorViewMode` pinned; scene room-resolver injected (no `chopinRuntime` in the editor sub-stores) + `pickInitialNavigationNodeId` returns `null` on zero nodes; relic store guard + Project-menu gating so `/museum/editor` cannot reach the Layout workspace.
- H1 S1: `h1/H1EditorApp` (Plan | 3D + 3D context Scene · Camera) mounted at `/` and `/editor`; full-panel `H1PlanView` (no Canvas); `h1/H13DView` fuses one Canvas (draft architecture + entities + camera helpers, no visitor Chopin shell); `h1/editor-view-state.svelte.ts` + 5 tests (`active3dContext` = scene|camera); `LayoutDraftToolbar` gained an optional `showViewToggle`; `/museum/editor` keeps the frozen `MuseumEditorApp` relic. S1 close: the store's `rooms` seam widened to `LayoutRoomRegistry` so `H13DView` resolves entities against the injected registry (no `chopinRuntime` import); view-switch preservation + relic route wiring became real tests (Plan ↔ 3D preserves document/history/dirty/selection with no history entry; `/museum/editor` mounts the legacy entry while `/` + `/editor` mount `H1EditorApp`); orphaned `LayoutInteraction3D.svelte` deleted.
- H1 S2: boot-into-empty: `createEmptyMuseumProject()` seeds the scene store (`rooms = createLayoutRoomRegistry(project.layout)`) + `createEmptyLayoutPreviewState()` layout surface (`baselineKind: 'blank'`); `EditorViewState` defaults to Plan; `resetToCheckedInDocument()` resets to the boot document (not Chopin); `canStartTourPreview` gates Preview Tour (false on zero nodes / a lone node, true once a guided chain exists). `museum-editor.test.ts` reset assertion updated to boot-document semantics. First-node camera authoring landed: Place Camera button in the H1 camera context + standalone zero-node commit in `createPendingNavigationNodeAt` + project-relative room frames (`host.rooms` instead of Chopin `roomPoint`/`roomLocalPoint`, and `store.rooms.has` floor-hit gate); `missing_guided_cycle` loosened (multi-node-no-cycle is a valid authoring state, preview still gated by `canStartTourPreview`) — covered by a `contracts.test.ts` first-node → guided-chain test.
- H1 S3: cross-domain selection — `h1/active-editor-selection.svelte.ts` (`ActiveEditorSelection` union, pure `deriveActiveSelection` with `layout > scene > camera` legacy priority, `EditorActiveSelectionStore` with `active`/`deselectActive`/`reset`/`onLayoutSelectionChanged`); `MuseumEditorStoreOptions.onSelectionActivate` seam (no-op default; reducer fires on actionable picks only) + pure `reconcileLayoutSelection` in `layout-interaction.ts`; shell effects wire layout↔scene/camera exclusivity + layout-swap reconcile; `onDeselect` props + shortcut `deselectActive` + `onReset` on the three reset actions. Covered by `tests/lib/editor/h1/active-editor-selection.test.ts` (18: mapping, seam, exclusivity, deselect + guard parity, convergence, reset, view-switch) + `contracts.test.ts` S3 block (3) + `layout-interaction.test.ts` reconcile cases (3); full suite 1371 green, `svelte-check` 0, production build clean.
- H1 S5: complete 3D pick metadata — builder emits `pickRanges` (sorted partition of the index buffer; every triangle exactly one pick owner) from build-time face tags covering wall side/lintel/bridge + opening jamb/sill/lintel/arch-reveal; bridges owned by the current/start wall only (both-open-miter profile-difference reveals included); pure `layout-3d-picking.ts` (`buildLayout3dTriangleIndex` dense resolver with partition dev-guard + `layoutAnchorHelperPlacements`); `layout3dPickIndexByRoom` cache in preview state; adapter `userData.pickRanges` (no new groups); ceiling `surfaceType: 'ceiling'` + editor-only anchor helpers in `LayoutPreviewScene` (inert until S6). Covered by 26 new tests (builder S5 block, `layout-3d-picking.test.ts`, adapter userData, S5 contracts block incl. review-fix pins, preview-state cache lifecycle); full suite 1420 green, `svelte-check` 0, build clean.
- H1 S6: centralized 3D layout selection — `EditorSelection` gains an optional `onLayoutPick` branch (relic mount absent, so `/museum/editor` frozen) reusing the one `intersections` list; pure `resolveLayout3dHits` (nearest-visible + anchor→opening→object→wall→room same-depth priority) over the S5 `layout3dPickIndexByRoom`; structural `layoutCandidatesFromIntersections` (no `three` import) + wall `surfaceType: 'wall'` tag; exact cross-domain yield via `resolveNormalSelectionWithHit` source distance + `layoutPickBeatsSceneDistance`; visitor-preview gate on `onLayoutPick`. 26 new tests; full suite 1431 green, `svelte-check` 0, build clean. **Post-ship debt (2026-08-15):** anchor-helper octahedra + highlight/hover shells commented out behind `KNOWN DEBT` markers (wall selection deferred).
- H1 S7: single gizmo host + target adapters — one `ThreeTransformControls` constructor in `EditorTransformControlsHost.svelte`; thin composer resolves one nullable adapter from `ActiveEditorSelection` (scene/camera; relic legacy arbitration); shared `editor-gizmo-contract.ts` + pure `editor-gizmo-policy.ts` helpers; FSM `ACTIVE_TARGET_CHANGE` (Selected = live attachable target) + `DRAG_END{cancelled}` single cancel path; fake-host lifecycle harness (`editor-gizmo-host.test.ts`); `scene-gizmo-adapter.svelte.ts` (placement session) + `camera-gizmo-adapter.svelte.ts` (node/anchor/view-target); pure `layout-gizmo-target.ts` descriptors + `deriveLayoutGizmoDelta` (all five identities, detached); toolbar + W/E/R/T shortcuts consume `projectGizmoCapabilities` (scene/camera policies shared with the host; scale chain scene-placement-only); layout gate disables transform buttons. New tests: 32 layout-descriptor + 14 host-harness + 9 camera-adapter + 5 policy + 5 shortcut-refusal + S7 contracts block; full suite **1565 green**, `svelte-check` 0, build clean, visitor chunk scan clean, G3 budgets unchanged.

## Locked decisions

- Single undo stack; ops tagged `layout` | `scene`.
- Layout mode vs Museum mode mutex before plan UX.
- Visitor validates one serialized project, always renders architecture from `project.layout`; no runtime source toggle or legacy fallback.
- Rectangle click-drag OK in plan tools; object place = ghost commit.
- A1 corridor = ordinary skinny `LayoutRoom` with optional two rectangular geometry-only cutouts; no corridor type or adjacency semantics yet.
- A2 preview renders generated geometry; A2.1 drafts rooms in isolated in-memory layout preview only.
- A2.1 does not add shared history, persistence, openings, room selection, snapping.
- A2.2 uses layout-local meter coordinates, 0.25 m snap, 15° Shift angle snap, room/vertex edits, ceiling visibility; no shared history or persistence.
- A2.3 opening authoring = interaction B: Door/Window tools hit any wall with no prior wall selection; selecting wall first optional, Inspector actions only arm the tool without constraining next click. Tagged `LayoutSelection` includes `interiorAnchor` after A3.1. Numeric fields opening-only (room/edge deferred). Hit priority: vertex → interior anchor → opening → wall → room. Over-height validation in `layout-validation`; room/vertex edits that invalidate openings fail closed for all rooms (no Chopin special case). A2.3 openings rectangular by default, geometry-only; A3 supersedes with derived `rounded` + `pointed` profiles. Plan opening drag adjusts `offset` after place. No adjacency, shared history, or persistence.
- A1 preview output = pure data; A2 owns Three/Svelte rendering adapter.
- A3/A3.1 curve sampling: `0.01 m` flatness, `0.25 m` max sample span (lines densified too), `1e-4 m` self-intersection tolerance, existing `12 px` Plan hit radius.
- A3.1 walls use `line` | `auto-bezier` with camera-style interior anchors (pure 2D centripetal cubics); no Bezier room tool; no authored `handleOut`/`handleIn` edit model; legacy `bezier` migrates on codec read. Bend via mid-span **drag** (4 px threshold); click selects wall without inserting anchor; corners resize rooms. Plan-only anchors; 3D sampled preview only.
- A3 curve mutations remain preview-state-only; no shared editor history or persistence.
- A4 layout object mutations + layout I/O remain preview-state-only; scene/layout dirty baselines independent. B3 room-unit gestures + inspector rotation = first layout mutations routed through shared chronological history. Navigation/unload protects either dirty document.
- A4.1 layout chrome uses Plan-only Box/Cylinder/Sphere gestures, Place/Objects/Selection accordion state, 0.25 m room/vertex/object candidate snapping; primitive placement not reachable in 3D.
- A4.1 ordinary edits do not auto-reframe; import/reset/Reload Chopin do. Primitive room ownership resolves from derived center, whole-room snap = rigid translation, stored Sphere height/position authoritative + floor-aligned at creation.
- A4.1 3D preview renders layout objects but does not select/edit them; B3 remains Plan-only, 3D room gizmos return with unified layout/scene editing milestone.
- A1 `LayoutOpening.offset` = meters along its segment; B4 adds explicit `connectsRoomIds` for portals.
- Layout auto-bezier must not import `camera-motion` / Three.
- No commits unless user asks.
- Layout v3 persists stable room frame. V1/v2 migration derives origin from sampled-boundary centroid + yaw from first non-zero tangent; room relocation moves frame/boundary/owned objects atomically.
- B3 translation snaps 0.25 m; Shift rotation snaps 15°; room body/rotation-arm gestures + inspector rotation each create at most one `layout` history entry.
- B5 shipped. `rooms.ts` = deprecated project-derived editor/test compatibility projection, cannot enter visitor imports. Unified outliner remains future work.
- G1 shipped. Plan, editor 3D, visitor 3D consume one visitor-safe `compileLayoutGeometry()`; no consumer resamples curves or reinterprets opening topology. Compiled entities + query records carry qualified identities/content keys; Plan committed hit geometry uses compiled point/span/polygon queries. Unsafe derived lengths + sample budgets fail as structured room issues. Editor preview model = compiled-geometry adapter; its bounds come from `CompiledLayoutGeometry`. Only separate sampler = frozen v1/v2 room-frame migration algorithm.
- One layout codec below `$lib/layout`: strict structural validation (unique IDs scoped per room for segments/anchors, global for floors/rooms/objects/openings; `ID_PATTERN`; positive numbers; unknown-key rejection; legacy `bezier` migration on read) gates both project import (`project-codec.ts`) + editor in-memory documents. Wall geometry keys room-scoped (`roomId` + `segmentId`); cross-room segment-ID reuse valid, handled by nested room→segment span map.
- G2 shipped. Plan renders pure, renderer-neutral `PlanRenderModel` (12 ordered layers) built from `CompiledLayoutGeometry` + optional camera/tour + interaction projections; `PlanSvg.svelte` = sole render consumer + sole applier of `worldToPlanScreen` + style-token→CSS mapping. Hit resolution = `resolvePlanHit` (vertex → interior anchor → opening → object → wall → room) over compiled query records; primitive placement uses room-only containment query, not selection priority. Selection encoded through `PlanSelection`/`*-selected` tokens; no editor selection type leaks into adapter. Camera/tour overlays (paths, view cones, look targets, portal crossings, collision warnings, timing labels) project `project.scene` through `camera-route.ts`/`camera-motion.ts` only (drop Y), gated behind Plan Tour toggle (off by default).
- G3 shipped. Harness owns measurement, not optimization: seeded deterministic 10/100/1,000-room fixtures (30% auto-bezier, 2 openings/room, 3 objects/room), pure Node tier (`compile`/`plan-render-build`/`hit-test`/`snap-query`/`compiled-memory`/`cache-key-code-units`), deterministic browser tier (initial render, synchronous render-work proxies, SVG node count, wall-mesh topology estimates), checked-in baseline whose Chopin budgets enforced fail-closed — missing sample, missing budget, or over-`fail` value on any enforced metric (node timings, `cache-key-code-units`, deterministic SVG/Three counts) fails check. 10/100/1,000-room tiers = comparison data, never enforced. Budget changes require recorded reason in `g3-baseline.json`. Harness leaves backlog (#1–#4, #10) unimplemented — each traced to measured signal for G5.
- H1 S5 shipped. Additive pick metadata on the G4 mesh: `IndexedWallMesh.pickRanges` is a sorted non-overlapping partition of the index buffer (every triangle exactly one pick owner — walls `side`/`lintel`/`bridge`, openings `jamb`/`sill`/`lintel`/`arch-reveal`); lintel undersides split from band/top at build time; bevel-bridge faces owned exclusively by the current/start wall (never the neighbor, unlike the shared `wallRanges` highlight entry); `sectionToRange`/`wallRanges`/`materialGroups`/index layout unchanged (zero draw-call delta, no G3 re-baseline). Pure `layout-3d-picking.ts` = reverse index (`buildLayout3dTriangleIndex`, partition-validated dev guard, built once per mesh generation) + `layoutAnchorHelperPlacements`; preview-state caches `layout3dPickIndexByRoom` with `wallMeshesByRoom`; adapter carries `userData.pickRanges`; scene tags ceiling identity + renders inert anchor helpers. S6 raycasts and resolves through the index.
- H1 S6 shipped. One 3D selection coordinator: `EditorSelection`'s existing Canvas listener gains a layout branch (optional `onLayoutPick`, absent on the relic), reusing the same `intersections` list — never a second raycast. Layout candidates resolve through the S5 `layout3dPickIndexByRoom` cache; nearest-visible wins, same-depth ties (`|Δd| ≤ 1e-4`) break anchor → opening → object → wall → room then stable input order; unresolvable wall-triangles drop. Cross-domain `d_scene` is the exact actionable `resolveNormalSelectionWithHit` source distance (deselect → `null`); layout commits only when `d_scene === null || layoutDist < d_scene − ε` (content wins the tie band; highlight/grid/ghost never shadow a real pick). Wall meshes carry `userData={{ surfaceType: 'wall', roomId }}`; commits route through the existing `selectLayout*` helpers; visitor preview gates `onLayoutPick` off.
- H1 S7 shipped. One host, one adapter per domain: `EditorTransformControlsHost.svelte` is the only `new ThreeTransformControls` in editor source (composer constructor/helper/listener-free, contracts-enforced); `ACTIVE_TARGET_CHANGE{targetKey}` makes `Selected` = a live attachable gizmo target and every cancel reason routes through `adapter.cancel(reason)` → `DRAG_END{cancelled:true}` → orbit restore (FSM `ESC` stays shell-level only; the placement-only `DragSnapshot` is deleted). Scene/camera sessions live in their adapters (one scene document transaction per drag, epsilon no-ops anchor/view-target only, pending-node drafts history-free). Layout descriptors are pure: `resolveLayoutGizmoTarget`/`deriveLayoutGizmoDelta` cover room/wall/opening/interior-anchor/object with collision-safe `geometryId` keys, read-only `profile` rejection, stale-identity `null`, and baseline-relative raw finite deltas (S7 kept them detached; S8 activates them). One `EditorGizmoPolicy` drives host + toolbar + W/E/R/T via `projectGizmoCapabilities` (scene full/world/scene-scale-mode; camera translate-only/hidden); the now-nullable `layout` slot publishes a live selection's per-kind policy.
- H1 S8 shipped. Layout candidate-session adapter + atomic layout history: pure `layout-gizmo-candidate.ts` (`deriveLayoutCandidate` = structural → geometry → compile → wall-mesh preflight, never throwing; per-kind builders incl. `translateWallUnit` exact wall/endpoint/anchor/shared-corner closure + opening clamps) feeds `layout-gizmo-adapter.svelte.ts` (begin refusal → null session, canonical-untouched preview, last-valid retention, one atomic `commitLayoutCandidate` + one `layout` history entry, no-op/cancel none, transient slot cleared). Composer resolves the live adapter from the descriptor (host stays constructor-/descriptor-free); stale identity gates the toolbar/shortcuts (`layout domain && descriptor null`); `LayoutPreviewScene` renders the `transient` bundle with active-source re-keying. Full suite **1606 green**, `svelte-check` 0, build clean, `/museum` visitor chunk graph free of gizmo/candidate markers, G3 budgets unchanged.
- G4 shipped. Pure, renderer-neutral `buildRoomWallMesh(room)` in `$lib/layout/wall-mesh-builder.ts` emits one watertight, surface-major `IndexedWallMesh` per room: `±thickness/2` offset-line corner miters at every turn (with `miterLimit` profile-aware bevel bridge), profile-interval union with `profileBaseY` + `floorElevation` offsets, exposed boundary faces only (no caps at closed joints), per-normal vertex splits for flat-shaded corners, metric floor-anchored UVs, fail-closed `{ mesh?, issues }` on offset-overlap/clearance/self-fold. Three-only `wall-geometry-adapter.ts` converts to `BufferGeometry` with one `addGroup` per material group, carries `sectionToRange`/`wallRanges` metadata; `dispose()` disposes geometry + invokes each material `release()` once, never shared cache. Visitor `LayoutMuseumShell` + editor `LayoutPreviewScene` both consume builder+adapter (per-span chord boxes removed, boundary-tested); editor preflights `wallMeshesByRoom` on `LayoutPreviewState` (a `Map`, never in undo snapshot), renders wall/opening selection via range-set overlays rebuilt/disposed on selection change, selection-independent base classifier. Visitor walls keep `textures="off"` tint parity via `wall-material-factory.ts` (shared per-tint cache, factory-owned, never adapter-disposed). Harness re-baselined under `BENCH_METHOD_VERSION` 3 via `npm run bench:record` (not default test): `three-*-estimate` counts indexed mesh (Chopin 6 objects / 6 draw calls / 12,876 triangles — bespoke music-chamber shell excluded before build, matching the live scene), `three-regen` removed, `wall-mesh-build` enforced; `buildWallMeshScene` honors `excludedRoomIds` so `/dev/perf` live WebGL reports the same 6-room counts. Shared walls: no coincident cross-room pairs in Chopin or scale fixtures; per-room rendering exact, dedup deferred (never coordinate-guessed).

## Out of scope this slice

Phase 2 Wall presets · G5+ graphics roadmap work · visitor rendering of layout objects · GLB import · new camera system · opening assets/frames · direct 3D wall/anchor picks (S6.1) · further 3D gizmo modes (scale/rotate for layout identities beyond the locked five).

## Reading order (token-minimal)

1. This file.  
2. [`../AGENTS.md`](../../AGENTS.md) hard rules.  
3. [`../architecture.md`](../architecture.md) (layout/`rooms.ts` only).  
4.	A0/B0/A1/C0/A2/A2.1/A2.2/A2.3/A3/A3.1/A4/A4.1/B3/B4/B5/G1/G2/G3/G4 shipped. H1 shipped: S0–S8 + the **S10 technical extraction** + **S10.2 Camera Flow** + **S10.1** including its closeout (B0 standalone placement + view-breakpoint Aim). Read [`../plans/2026-08-14-graphics-h1-unified-3d-editing.md`](../plans/2026-08-14-graphics-h1-unified-3d-editing.md) + its S0–S6 sub-plans + [`../plans/2026-08-16-graphics-h1-s7-single-gizmo-host.md`](../plans/2026-08-16-graphics-h1-s7-single-gizmo-host.md) + [`../plans/2026-08-16-graphics-h1-s8-layout-gizmo-candidate-session.md`](../plans/2026-08-16-graphics-h1-s8-layout-gizmo-candidate-session.md) + [`../plans/2026-08-17-graphics-h1-s10-camera-extraction.md`](../plans/2026-08-17-graphics-h1-s10-camera-extraction.md) + [`../plans/2026-08-17-graphics-h1-s10.1-camera-workspace-ui-rework.md`](../plans/2026-08-17-graphics-h1-s10.1-camera-workspace-ui-rework.md).

5. Skip other `docs/components/*` unless task touches them.

After shipping: update **matching** `docs/components/*.md` or `architecture.md` / `north-star.md`; bump hub routing only if needed.
