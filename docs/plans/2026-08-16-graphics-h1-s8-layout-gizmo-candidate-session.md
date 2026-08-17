# H1 S8 — Layout Candidate-Session Adapter and Atomic Layout History

**Date:** 2026-08-16  \
**Status:** Planned  \
**Parent:** [`2026-08-14-graphics-h1-unified-3d-editing.md`](./2026-08-14-graphics-h1-unified-3d-editing.md) (step 8, difficulty 8/10 — effort 6 · risk 8)  \
**Prerequisite:** [`2026-08-16-graphics-h1-s7-single-gizmo-host.md`](./2026-08-16-graphics-h1-s7-single-gizmo-host.md)  \
**Handoff:** [`../hand-off/CURRENT.md`](../hand-off/CURRENT.md)

## Goal

Activate the layout gizmo. S7 defined and tested the detached layout target
descriptors (`resolveLayoutGizmoTarget` / `deriveLayoutGizmoDelta`) and the
"not interactive" gate; S8 supplies the missing atomic candidate session and
hands the host a live layout adapter. A layout selection then drags through
the **same single host** the scene/camera adapters use, previews a validated
transient candidate, and commits **exactly one `layout` history entry** on
pointer-up. This is the umbrella's step-8 wording: *"Add layout candidate
previews and atomic history."*

The hard boundary that made S7 stop short stays intact: **canonical project,
dirty baseline, export payload, and history remain unchanged until
pointer-up.** S8 never installs a throwaway candidate into
`layoutPreview.project` during the drag — the transient preview is a separate,
session-only bundle that renders beside the committed project and is discarded
on cancel.

S8 is the last line of the S7/S8 activation boundary:

```text
scene selection  → live scene adapter  → one host → existing scene mutation/history
camera selection → live camera adapter → one host → existing scene mutation/history
layout selection → layout candidate-session adapter → same host
                 → transient validated bundle → one layout history commit
```

## Current state

| Concern | S7 outcome | S8 outcome |
|---|---|---|
| Layout target math | Pure `layout-gizmo-target.ts` descriptors + baseline-relative deltas, 32 tests, **zero runtime imports** | The same module becomes the live resolution/delta source; the session consumes it |
| Layout gate | Toolbar `transformDisabled` + shortcuts `isLayoutSelectionActive` refuse; no live adapter | Layout publishes its descriptor policy via `projectDomainGizmoCapabilities`; buttons/shortcuts/host agree; handles render |
| Canonical project | Untouched by any gizmo event | Untouched until pointer-up, then installed atomically |
| History | No layout gizmo history path | One tagged `layout` entry per committed gesture; no-op/cancel adds none |
| Candidate validation | Out of scope (S8 owns) | Structural + shared geometry + compile + wall-mesh preflight before any transient display or commit |
| Transient render | None | `LayoutPreviewScene` renders a session-only candidate bundle; last-valid on invalid |

## Target

```text
H1 ActiveEditorSelection
  scene  ───────────────→ scene adapter ───────→ scene history
  camera ───────────────→ camera adapter ──────→ scene history
  layout ─→ layout-gizmo-target descriptor      S7: detached
           └→ layout-gizmo-adapter (S8) ──────→ same host
                ├─ session-only proxy (descriptor proxyPose)
                ├─ transient candidate bundle  → LayoutPreviewScene.transient
                ├─ one atomic install on pointer-up
                └─ store.begin/commit/cancelLayoutTransaction → one layout history entry
```

Only `EditorTransformControlsHost.svelte` instantiates `ThreeTransformControls`
(unchanged from S7). The layout adapter is a third `EditorGizmoTargetAdapter`
resolved by the same thin composer; it adds no second gizmo, Canvas listener,
or FSM.

## Public contracts

S7's adapter seam already fits layout. The host owns *when*; the layout adapter
owns *what*:

```ts
// S7 (unchanged): descriptor + delta seams the session consumes.
resolveLayoutGizmoTarget(layout, geometry, selection): LayoutGizmoTargetDescriptor | null;
deriveLayoutGizmoDelta(descriptor, proxyPose): LayoutGizmoDelta | null;

// S8 — pure candidate derivation + validation pipeline (renderer-neutral,
// no Three/Svelte/DOM; testable without a store).
type LayoutGizmoCandidateBundle = {
  project: MuseumProject;                 // candidate project (layout swapped)
  model: LayoutPreviewModel;
  geometry: CompiledLayoutGeometry;
  wallMeshesByRoom: ReadonlyMap<string, IndexedWallMesh>;
  layout3dPickIndexByRoom: ReadonlyMap<string, Layout3dPickIndex>;
  issues: LayoutGeometryIssue[];
  layout: LayoutDocument;                 // the candidate document
};

deriveLayoutCandidate(
  descriptor: LayoutGizmoTargetDescriptor,
  delta: LayoutGizmoDelta,
  layout: LayoutDocument,
  geometry: CompiledLayoutGeometry
): { bundle: LayoutGizmoCandidateBundle | null; issue: string | null };

// S8 — the live adapter (thin; owns nothing the pure session owns).
createLayoutGizmoAdapter(input: {
  store: MuseumEditorStore;
  layoutPreview: LayoutPreviewState;
  layoutInteraction: LayoutInteractionState;
  descriptor: LayoutGizmoTargetDescriptor;
  onTransient(bundle: LayoutGizmoCandidateBundle | null): void;  // reactive render slot
}): EditorGizmoTargetAdapter;   // { key, domain: 'layout', proxy, policy, begin }
```

`deriveLayoutCandidate` is the single validation gate: structural
(`validateLayoutDocument`) → geometry (`validateLayoutDocumentGeometry` +
`hasBlockingLayoutIssues`) → compile (`buildLayoutPreviewModel`) → wall-mesh
preflight (`buildWallMeshesByRoom`). It returns `null` + the first blocking
issue when any stage fails; `onTransient` then keeps the last valid bundle.

## Locked decisions

### Activation boundary

- The composer resolves a layout adapter when `activeSelection.active.domain ===
  'layout'` **and** `resolveLayoutGizmoTarget` returns a non-null descriptor.
  A stale/missing identity (descriptor `null`) resolves no adapter and the
  selection is inert — matching the scene/camera missing-root rule.
- The S7 gate flips: layout selections publish the descriptor's policy through
  `projectDomainGizmoCapabilities` (add `layout` to `EditorGizmoDomainPolicies`),
  so the toolbar buttons, W/E/R/T shortcuts, and the host all agree on the same
  allowed modes/axes. `transformDisabled` is no longer true for layout; the
  `isLayoutSelectionActive` shortcut refusal is removed. The gate stays only
  for a descriptor that resolves `null` (stale identity).
- The relic `/museum/editor` **never** receives the layout adapter (it has no
  layout domain). No env/build/query/production feature flag.
- The layout adapter is the **only** gizmo file allowed to call the layout
  transaction facade (`beginLayoutTransaction` / `commitLayoutTransaction` /
  `cancelLayoutTransaction`). The contracts block's `LAYOUT_MUTATION_MARKERS`
  test is scoped: `previewLayoutRoomUnit`, `restoreLayoutPreviewSnapshot`, and
  `updateLayout*` stay banned in every gizmo file (the adapter uses its own
  candidate path, not the Plan mutators).

### Session lifecycle (one drag)

- **Begin** — `store.beginLayoutTransaction()` (guarded facade; refused when
  document-mutation-blocked or undo-blocked → begin returns `null`, no session,
  no orbit change, no history). Capture the immutable descriptor baseline;
  create the session-only proxy at `descriptor.proxyPose`; compile the baseline
  geometry once.
- **Preview (objectChange)** — read the proxy's world pose
  (`position/rotation/scale`), derive `LayoutGizmoDelta` from the **baseline**
  (never a previous delta), apply the adapter's snap policy, build the candidate
  document, run `deriveLayoutCandidate`. Valid → publish the transient bundle
  via `onTransient` and remember it as last-valid; invalid → keep the last-valid
  bundle and surface the first issue. The canonical `layoutPreview` is never
  written during preview.
- **Commit (pointer-up)** — one final preview, then: if a last-valid candidate
  exists, install it into `layoutPreview` atomically (one validate+compile+
  preflight shot, reusing the existing `derivePreviewBundle` install path) and
  call `store.commitLayoutTransaction(captureLayoutPreviewSnapshot(layoutPreview))`
  — exactly one `layout` history entry; the history controller's `matches`
  (JSON layout compare) makes a no-op commit add none. If no candidate was ever
  valid, commit behaves as cancel. Clear the transient.
- **Cancel (every reason)** — `store.cancelLayoutTransaction()` (the facade
  restores the pre-gesture snapshot through the registered layout host),
  clear the transient, dispose/detach the proxy, restore orbit. Layout Escape
  **keeps the layout selection** (the target persists → FSM returns to
  `Selected`), matching camera; shell-level Escape (no drag) still deselects
  the active domain via the existing `deselectActive`.
- The host's existing single-cancel path is reused unchanged: `adapter.cancel`
  once → `DRAG_END { cancelled: true }` once → orbit restore once. A late
  natural `mouseUp` after cancel cannot commit.

### Per-kind candidate mapping (delta → document)

| Target | Candidate document change | Clamps / validation |
|---|---|---|
| Room | `transformLayoutRoomUnit(layout, roomId, { translation, yaw })` — frame, boundary, anchors, owned objects move atomically; pivot recomputed internally | None beyond finite; geometry validation rejects self-fold/overlap |
| Wall | Pure `translateWallUnit(layout, roomId, segmentId, delta)`: move the selected wall's start/end **and** its interior anchors by `delta`; move the adjacent walls' shared corner endpoints by `delta` so closure stays exact. Boundary-only edit — the authored room frame is untouched, matching `replaceRoomPoints`/vertex-edit convention | None beyond finite; validation rejects invalid geometry |
| Opening | Recompute from baseline: `center = baseline.offset + baseline.width/2 + centerShiftX`; `offset = clamp(center − width/2, 0, segLen − width)`; `width = baseline.width × proxyScale[0]`; `height = baseline.height × proxyScale[1]` with `sillHeight` fixed | Offset/width clamp to compiled wall length; neighbor overlap rejected by the shared `opening_overlap` geometry validation |
| Interior anchor | `updateInteriorAnchorOnSegment(segment, anchorId, baseline.point + delta)` | None beyond finite |
| Object | `patchLayoutObject(document, objectId, { position: baseline.position + delta.position, rotation: baseline.rotation + delta.rotation, dimensions: delta.dimensions })` — the S7 object delta already yields absolute values | Finite only; read-only `profile` never resolves a descriptor |

- Opening proxy X stays along the compiled tangent (rotation-Y = `baseline.yaw`,
  never mesh-derived); the host's local-space translate/scale handles drive it.
- Room translation snaps to the 0.25 m Plan grid when snapping is enabled
  (`layoutInteraction.planView.snapEnabled`), Shift bypasses; room rotation
  snaps to 15° with Shift (the B3 contract). Scene placement's Shift-bypass
  behavior is untouched — the layout adapter owns its own snap policy, exactly
  as S7 locked ("adapter snap policies make the distinction explicit").

### Transient rendering

- `LayoutPreviewScene` gains an optional `transient?: LayoutGizmoCandidateBundle
  | null` prop. When set, it renders the transient bundle (model/geometry/
  wall-mesh cache) instead of the committed one; the existing `interaction`
  selection/highlight still applies. `null` renders the committed project.
- H13DView owns a `$state` transient slot and passes it down; the adapter's
  `onTransient` callback writes it. One renderer, one scene — no second Canvas,
  no temporary mutation of `layoutPreview.project`.
- The selection-highlight shell (`LayoutWallHighlight` etc.) reads
  `interaction.selection`, which is unchanged during a drag, so highlight stays
  consistent over the transient.

### History and transactions

- One `layout` entry per committed gesture, in the same chronological stack as
  scene/camera entries (the H1 shell's `registerLayoutHistory` bridge already
  provides `capture`/`replace`/`matches`).
- No-op (candidate equals baseline) and every cancel path add **no** history.
- Undo/redo of a layout entry restores the pre-gesture snapshot and rebuilds the
  wall-mesh/pick caches from the restored geometry (the existing
  `restoreLayoutPreviewSnapshot` path). The S3 reconciler re-validates the
  layout selection after every swap.

## Implementation steps

### 0. Pin the S8 contracts and the session pipeline first

Add an `H1 S8 — layout candidate session` block to
`tests/lib/editor/h1/contracts.test.ts` plus focused gizmo tests before runtime
code:

- the layout adapter is the only gizmo file allowed to call the layout
  transaction facade; `previewLayoutRoomUnit` / `restoreLayoutPreviewSnapshot` /
  `updateLayout*` stay banned in every gizmo file;
- the composer resolves a live layout adapter for a non-null descriptor and
  `null` for a stale/missing one; the relic mount still never receives it;
- the toolbar/shortcuts gate flips for a live layout selection (descriptor
  policy published), and stays disabled for a stale identity;
- `LayoutPreviewScene` accepts the optional `transient` prop and the H1 shell
  feeds it from the adapter's `onTransient` slot;
- `$lib/layout/**` remains renderer-neutral (the candidate pipeline lives under
  `$lib/editor/gizmo`, not `$lib/layout`).

### 1. Pure candidate pipeline

Add `layout-gizmo-candidate.ts` (or fold into `layout-gizmo-target.ts`'s
sibling): `deriveLayoutCandidate` + the per-kind document builders
(`translateWallUnit`, opening recompute, room via `transformLayoutRoomUnit`,
anchor via `updateInteriorAnchorOnSegment`, object via `patchLayoutObject`).
Reuse `derivePreviewBundle`'s validation/compile/preflight ordering (export it
from `layout-preview-state.svelte.ts` or mirror it) so the transient bundle and
the commit install use the identical gate. Unit-test each builder and the
validation pipeline (valid, structural-invalid, geometry-invalid,
mesh-invalid, last-valid retention).

### 2. Live adapter

Add `layout-gizmo-adapter.svelte.ts`: `createLayoutGizmoAdapter` returning the
S7 `EditorGizmoTargetAdapter` shape (key from the descriptor's `geometryId`,
domain `'layout'`, session-only proxy at `descriptor.proxyPose`, descriptor
policy, `begin`/`preview`/`commit`/`cancel` against the session). Wire the
transaction facade and the `onTransient` slot. Drive it with a focused
adapter-level suite (mirroring `camera-gizmo-adapter.test.ts`): begin refusal,
preview keeps canonical untouched, invalid candidate retains last-valid,
commit installs once + one history entry, no-op adds none, every cancel reason
restores + no history, proxy disposed once.

### 3. Composer + gate flip

- `EditorTransformControls.svelte`: the S3 `layout` domain branch resolves
  `createLayoutGizmoAdapter` when the descriptor is non-null, `null` otherwise.
  The adapter's `prepare` (proxy pose) runs before attach like the scene pivot.
- `EditorGizmoDomainPolicies` gains `layout`; `H13DView`/`H1EditorApp` project
  the descriptor policy for the toolbar + W/E/R/T. Remove the
  `transformDisabled`-for-layout and `isLayoutSelectionActive` refusals; add a
  stale-identity gate that keeps them.
- H13DView passes the transient slot into `LayoutPreviewScene`.

### 4. Verification gate

Run the full suite, `svelte-check`, production build, visitor chunk scan, and
the unchanged G3 budgets. Manual QA in step 5.

### 5. Close the slice

Update `docs/components/placement.md` (the S7 "detached" section becomes the
live adapter contract) and `docs/hand-off/CURRENT.md` (S8 shipped, verification
counts, as-built deviations; S8 no longer "next"). Do not mark layout gizmo
editing beyond the five locked targets shipped. No commits unless requested.

## Regression matrix

| Concern | Required assertion |
|---|---|
| One host | Layout uses the same `EditorTransformControlsHost`; no second gizmo/Canvas/listener/FSM |
| Gate flip | Live layout selection enables buttons/shortcuts/host from the descriptor policy; stale identity stays inert |
| Canonical untouched | No `layoutPreview.project`/model/geometry/history/dirty write during a drag |
| Transient render | `LayoutPreviewScene` renders the candidate bundle; last-valid retained on invalid |
| Candidate validation | Structural/geometry/compile/mesh each reject the candidate before display or commit |
| Per-kind mapping | Room/wall/opening/anchor/object candidate documents match the locked delta semantics |
| Wall closure | Wall translation moves both endpoints + interior anchors + adjacent shared corners; closure exact |
| Opening clamps | Offset/width clamp to segment length; neighbor overlap rejected |
| History | One `layout` entry per committed gesture; no-op/cancel adds none; undo/redo restores both views |
| Escape | Layout drag Escape cancels once + keeps selection (Selected); shell Escape still deselects |
| Resource lifetime | Proxy/transient disposed once per drag; repeated edits accumulate nothing |
| Relic | `/museum/editor` never receives the layout adapter; scene/camera outputs unchanged |
| Visitor | `/museum` chunks contain no layout-gizmo/candidate code |
| Purity | `$lib/layout/**` has no Three/Svelte/DOM; the candidate pipeline is editor-side |
| Bench | No geometry/draw/render-work baseline change |

## Non-goals (deferred)

- Layout delete, duplicate, multi-select, room scale, wall rotate/scale, opening
  depth/thickness edits, or new layout object kinds.
- Re-enabling direct 3D wall/interior-anchor picks or hover/anchor-helper
  overlays (S6.1).
- Plan staging (C1), user GLB import/package work (post-H1 S9), G5
  optimization, or any visitor behavior change.
- Scene schema v7 independent-scale persistence.
- Multi-floor gizmo editing or cross-floor room transforms.

## Expected files

Conceptually new:

```text
apps/museum/src/lib/editor/gizmo/layout-gizmo-candidate.ts
apps/museum/src/lib/editor/gizmo/layout-gizmo-adapter.svelte.ts
tests/lib/editor/gizmo/layout-gizmo-candidate.test.ts
tests/lib/editor/gizmo/layout-gizmo-adapter.test.ts
```

Primary edits:

```text
apps/museum/src/lib/editor/EditorTransformControls.svelte    (layout domain branch)
apps/museum/src/lib/editor/gizmo/editor-gizmo-policy.ts      (layout in domain policies)
apps/museum/src/lib/editor/h1/H13DView.svelte                (transient slot + gate flip)
apps/museum/src/lib/editor/h1/H1EditorApp.svelte             (capabilities + shortcuts)
apps/museum/src/lib/editor/EditorViewportToolbar.svelte      (gate flip)
apps/museum/src/lib/editor/hooks/shortcuts.svelte.ts         (gate flip)
apps/museum/src/lib/editor/layout/LayoutPreviewScene.svelte  (optional transient prop)
apps/museum/src/lib/editor/layout/layout-preview-state.svelte.ts  (export candidate install gate)
tests/lib/editor/h1/contracts.test.ts                        (S8 block + marker scoping)
docs/components/placement.md                                 (on close)
docs/hand-off/CURRENT.md                                    (on close)
```

Exact files may consolidate, but the single host, the detached-until-S8
boundary, the pure candidate pipeline, and the one-`layout`-history-commit may
not collapse.

## Verification

```text
npm test -w @portfolio/museum
npm run check -w @portfolio/museum
npm run build -w @portfolio/museum
```

Plus:

- focused candidate/adapter tests (begin refusal, canonical-untouched preview,
  last-valid retention, one commit + one history, no-op none, every cancel
  reason, proxy disposal);
- existing placement/cluster/camera/path/view/history/FSM/shortcut/toolbar
  suites unchanged at the behavioral boundary;
- S0–S7 H1 contracts + relic route smoke;
- production visitor chunk scan for layout-gizmo/candidate markers;
- unchanged G3 budget run (no re-baseline); and
- manual QA in step 5 (room/wall/opening/anchor/object drags, snap + Shift,
  Escape, undo/redo, interleaved scene/camera edits, no history/dirty change
  until commit).
