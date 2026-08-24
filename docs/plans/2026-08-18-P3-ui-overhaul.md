# P3 — UI overhaul (umbrella)

**Date:** 2026-08-18
**Status:** In progress — owner rejected the 2026-08-24 close; P3.6 corrective visual reconciliation is implemented and awaiting owner review. P10 remains shipped. P3B remains a separate proposed follow-up.
**Tracker:** [`docs/plans/README.md`](README.md) — **P3**, depends on: P9 + P1 (per-increment; P3.5 also P8 S2–S4); P3.1–P3.3 no longer await P2 — Scene Plan staging/Arrange shipped with P2 + P10.1–P10.3

**Rejected close note (2026-08-24):** The owner rejected this close because
the result read primarily as token/color changes, Plan walls/openings did not
match the architectural sketches, Camera Plan lacked distinct visual QA and
room/background separation, and the timeline was not expanded into five
lanes. The historical claim follows for traceability, but is superseded by
P3.6 and may not be used as approval evidence. P3.1 recorded the deviation register;
P3.2 created and applied all six canonical style files plus Inter Variable,
blue-tinted chrome, icon, selection, gizmo, and orientation-box tokens; P3.3
closed the visual defect rows, including owner-neutral Arrange selection,
hover, rotation feedback, empty Plan treatment, and Camera Plan selection.
P3.4/P3.5 added one shared context-menu shell with Scene, Layout/Arrange,
Outliner, Camera Plan/3D, and timeline adapters over existing commands. Final
review fixed native-menu suppression, exact target identity selection-before-
menu, Outliner opening/object selection, and the blocked room-Rename gate.
Verification: 2,069 tests passed / 1 skipped; `svelte-check` 0/0; build clean;
legacy gold-accent gate clean; `git diff --check` clean; sidebar Browser QA
covered empty Plan, room creation, Plan↔3D persistence, custom menu opening,
and editable native-menu preservation.

## P3.6 — corrective structural visual reconciliation (2026-08-24)

### Outcome and boundary

- Replace line/bar approximations in the shared Plan SVG with architectural
  wall thickness, wall casing/core, erased door/window openings, window frames,
  door leaves, and swing arcs derived from the authored layout geometry.
- Make room paper opaque over the grid. Keep Camera Plan on the same shared
  projection while giving its canvas a deliberately subdued background so it
  remains recognizably distinct from Scene Plan.
- Expand the Camera timeline presentation into the five canonical display
  lanes: `Camera Path`, `Shots`, `FOV`, `Look At`, and `Roll`, inside the
  documented 240–300 px expanded shell with 288 px default and 48 px collapse.
- This slice changes projection/presentation only. It does not add a second
  camera graph or motion model, persist generated opening endpoints, add Shot
  or Roll document state, change preview semantics, or modify `/museum`.

### Sources, state, and mounting

- `plan-render-model.ts` remains the renderer-neutral projection seam and now
  exposes authored architectural metadata for walls and openings. `PlanSvg`
  is still the sole SVG renderer consumed by Scene Plan and Camera Plan.
- Existing selection identities and commands remain unchanged. Door/window
  symbols select their authored opening; selected openings may emphasize the
  owning wall without introducing a second selection model.
- Existing route nodes/edges remain the Camera Path backing model. Existing
  framing keys are projected into both `FOV` and `Look At`; `Shots` is a
  derived display segmentation and `Roll` is an explicit quiet 0° lane.

### Acceptance and rollback

- Automated: projection metadata tests; source contracts for all five lane
  labels, canonical timeline heights, and architectural SVG primitives;
  museum test suite, `svelte-check`, build, and `git diff --check`.
- Manual: compare Scene Plan against `scene-plan-layout.png`; compare Camera
  Plan background and opaque room separation against
  `camera-plan-overview.png`; compare the expanded timeline against
  `camera-timeline-expanded.png`; verify Plan selection and Camera preview still
  use their existing identities and commands.
- Rollback is separable: (1) projection metadata + Plan symbols, (2) Camera
  Plan palette overrides, and (3) timeline lane projection/shell dimensions.
  Token/context-menu work from P3.2–P3.5 need not be retained to preserve this
  corrective structure.

## Canonical targets (2026-08-19)

The specs below are **canonical** and define the overhaul's target state:

- **Visual:** [`Design-specs.md`](../Design-specs/Design-specs.md) — tokens,
  typography, icons, spacing, radii, shell dimensions, per-surface rules.
  Its color system (blue accent `#2F8CFF` on blue-tinted chrome) is the
  overhaul's sole active/selection palette. The spec's §37 token architecture — six files under
  `src/lib/editor/styles/` (`tokens.css`, `editor-shell.css`, `controls.css`,
  `inspector.css`, `timeline.css`, `plan.css`) — does not exist yet; P3.2
  creates all six.
- **Exposure:** [`Design-shell-specs.md`](../Design-specs/Design-shell-specs.md)
  — workspace ownership, capability routing, non-leakage rules (split 2026-08-21 → [`Shell-camera-workspaces.md`](../Design-specs/Shell-camera-workspaces.md) §9–13 + [`Shell-scene-workspaces.md`](../Design-specs/Shell-scene-workspaces.md) §6–8; § numbers preserved). P1 §A.2
  holds the current conformance mapping; P3 inherits it unchanged.
- **QA ground truth:** [`Design-png/README.md`](../../Design-png/README.md)
  registers the one canonical lowercase PNG set. P3.1 QAs every shipped surface
  against that registry and this specification; no active alternate concepts or
  known-convention exceptions remain after P9.

## Outcome

A single **reconciliation/refresh pass** over the settled surfaces — not an
open-ended redesign. The product stays visually raw through P1 + P2; this is
the refresh that follows them. P3 moves the editor from the interim S10.1.7
visual state to the canonical `Design-specs.md` state.

**Update 2026-08-21:** P1.9 (sidebar simplification, approved 2026-08-21)
reshapes the Camera Sidebar before P3 — neighbor dropdown replaces the
connection-tree accordion, drag-only reorder, empty-chain promotion — so the
sidebar matches `Design-shell-specs.md` §4's row model when P3 starts.
P3 is **primarily visual reconciliation**; P3.4/P3.5 are the sole approved
interaction-infrastructure exception and expose existing commands without
changing underlying product semantics. P3.1 QAs against the P1.9 state. Scene 3D gizmo,
selection-color, object-outline/layout-box, and upper-right XYZ orientation-box
visuals are included in P3; the new orientation-box interaction is tracked in
the recommended post-P3 **P3B** slice.

## Scope (pinned)

- **Covers:** the domain×view shell (P1.1), Camera Plan (P1.5), framing UX
  surfaces (P1.6), and Plan-staging surfaces (P2) — everything P1 + P2 added,
  reconciled to the canonical specs above (replacing the earlier
  "reconcile with the S10.1.7 tokens" baseline).
- **Must not:** change behavior contracts, restructure the shell, or re-polish
  during P1/P2 (the P1.7 light pass covers interim presentation). The sole
  exception is the P3.4/P3.5 context-menu slice, which adds interaction
  infrastructure without changing underlying product semantics.
- **Dependencies are per-increment, not umbrella-wide:** P3.1–P3.4 do not gate
  on P2. **2026-08-23 rebase:** P2 and P10.1–P10.3 shipped, so the previously
  deferred staging-dependent surfaces (P3.1's Scene Plan QA rows, the Scene
  Plan context menu) are now live scope. P3.1–P3.3 form the visual baseline
  **P10.4** consumes; P3.4/P3.5 are interaction-infrastructure and do not gate
  P10.4.

## Pre-P3 brief — Scene Plan footprint and 3D outline coherence

**Status:** Implemented 2026-08-23 (uncommitted) — authored piano outline +
mesh-readiness OBB invalidation + acceptance tests · **Source:** owner request
2026-08-23 + browser-reviewer consultation · **Scope:** P3.1–P3.3
visual/correctness pass

**Implementation note (2026-08-23):**

- **Piano outline** — `content/assets.ts` authors a 9-point non-rectangular
  `footprint.outline` for `paris-grand-piano` (keyboard band + tapered tail)
  through the existing `AssetFootprint.outline` path; assets without an
  outline keep the width/depth rectangle fallback. `plan-scene-footprint.ts`
  needed no change — it already consumes
  `normalizeAssetFootprintOutline`.
- **Mesh-readiness OBB invalidation** — a new editor-only
  `EditorModelEntity.svelte` wrapper binds each model's `AssetLoadStatus`
  through an always-defined local slot (never `undefined`, so AssetModel's
  `$bindable status` stays valid for freshly placed entities) and calls the
  registry's `notifyPlacementRootChanged(entity.id)` (previously wired but
  never called) when the GLB becomes ready, bumping
  `EditorSceneRoots.version` so `EditorSelectionHelper` rebuilds the
  selected root's placement-local OBB from the now-complete subtree — no
  pointer movement, transform gesture, selection toggle, or history write.
- **Stale-child-matrixWorld fix** — `computeRootLocalBox` now calls
  `root.updateWorldMatrix(true, true)` instead of `(true, false)`. The
  readiness notify races the render loop (the loaded GLB subtree is attached
  in the same flush, before any frame has rendered it), so every new mesh's
  `matrixWorld` is still identity; reading those stale matrices baked a wrong
  offset into the placement-local box and the selection wireframe kept
  showing the fallback/plan-footprint box until a later move triggered a
  recompute. Updating children makes the recompute (and every other
  `computeRootLocalBox` call) read current local transforms unconditionally.
- **Tests** — `plan-scene-footprint.test.ts` (+5): outline validity,
  non-rectangular projection, rectangle fallback, yaw rotation around the
  placement pivot, concave-waist hit containment. `cluster-obb.test.ts`
  (+4): recompute reflects a mesh added after the initial box, placement-
  local bounds invariant under root translation/rotation, and freshly
  attached GLB subtrees with stale matrixWorlds read from local transforms
  (translated child + scaled/rotated wrapper group). Suite green;
  `svelte-check` 0; build clean.

### 1. User outcome and out of scope

When a Scene entity is selected, switching between Scene → Plan (Layout |
Arrange) and Scene → 3D preserves the same entity, pivot, transform, scale,
and yaw. Plan
shows a meaningful top-down occupied shape; 3D shows the settled runtime mesh
OBB on the first frame after the selected placement root has renderable mesh
bounds. If bounds become available after selection, the outline updates
automatically without user interaction.

This does **not** unify Plan and 3D into one geometry or hit-test authority.
Plan remains authored semantic footprint geometry; 3D selection and transform
bounds remain runtime mesh-driven. No new selection store, 3D footprint raycast,
runtime OBB persistence, gizmo semantic change, or independent-scale schema
work is included.

### 2. Source components and APIs to reuse

- `editor/layout/plan-scene-footprint.ts` remains the Plan projection boundary:
  asset-local outline → effective scale → entity yaw/translation → room frame.
- `content/assets.ts` remains the curated asset metadata authority. Add the
  piano outline through the existing `AssetFootprint.outline` path; preserve
  width/depth fallback for assets without an outline.
- `EditorSelectionHelper.svelte` remains the 3D outline owner and continues to
  use `computeRootLocalBox` / `computeClusterOBB` from `cluster-obb.ts`.
- `EditorSceneEntities.svelte` and `EditorPlacementRoot.svelte` remain the
  mount/registration path. Do not introduce a second placement registry or
  bounds compiler.
- Existing selection, placement, transform-control, Plan hit, and scene
  history APIs remain unchanged.

### 3. State, props, and dependencies

Prefer no new document or persistent state. If the lifecycle fix needs a
refresh signal, prefer the existing placement-root registration/change path. If
it exposes no suitable readiness/change signal, add the smallest
editor-session-only invalidation mechanism at that existing ownership boundary.
Do not create another registry or persist bounds state. The selection helper
may rebuild its local bounds when the selected root identity or mesh readiness
changes, while its per-frame work continues to
stream settled corners through the current world matrix.

The piano outline is authored in placement-local X/Z coordinates around the
existing `[0, 0]` placement pivot. It represents physical occupied shape, not
clearance; any future clearance affordance must be a separate derived visual.

### 4. Mount/unmount and selection semantics

On selection, the helper must produce a valid runtime OBB as soon as the
selected root has renderable mesh bounds. If child meshes appear or finish
loading after selection, the helper must invalidate/recompute automatically
without pointer movement, transform gestures, selection toggles, or history
writes. Unmount, deselect, preview mode, and domain/view transitions must retain
the existing disposal and visibility behavior.

Given unchanged descendant geometry and child-local transforms, placement-local
bounds must remain unchanged when only the `EditorPlacementRoot` world
translation or yaw changes; only the streamed world-space corners should change.
Cluster selection continues to use the existing cluster OBB contract.

### 5. Acceptance tests and manual scenarios

- Piano Plan projection uses a non-rectangular authored outline and preserves
  scale, yaw, room-frame projection, hit containment, and rotation around the
  placement pivot.
- Assets without an outline retain the width/depth rectangle fallback.
- A selected mesh hierarchy has the same placement-local bounds under two root
  translations/rotations; world corners follow the transform.
- A selected entity whose mesh children become ready after selection updates
  its OBB without a transform or selection event.
- Selecting a root with no ready mesh descendants must not retain the previous
  selection's OBB. When eligible mesh children become ready, the correct OBB
  appears automatically; unmount/deselect clears it without stale bounds.
- Scene Plan → 3D → Plan preserves entity selection and authored transforms;
  no duplicate selection state or history entry is created.
- Moving, rotating, or scaling the piano changes only the expected projected
  footprint/OBB result; no outline snap occurs as a side effect.
- Manual QA: select the piano before and after 3D readiness, switch views,
  move/rotate/scale it, move its containing room, and verify the silhouette,
  OBB, pivot, and selection remain coherent.
- Regression guard: no changes to 3D raycast authority, gizmo semantics, snap,
  history transaction count, visitor `/museum` chunks, or frozen relic routes.

### 6. Boundaries and verification

This is editor-only work inside the P3 visual/correctness boundary. It reuses
the shipped P2 + P10 Arrange contract (owner-aware Plan staging) and does not
alter `SceneDocument`, layout ownership, camera navigation, or the visitor
relics. Verify with focused Plan,
footprint, OBB, and selection tests, then `npm test`, `npm run check`,
`npm run build`, and `git diff --check`.

### 7. Rollback / fallback

If automatic mesh-readiness invalidation expands beyond a focused helper fix,
ship the authored piano outline and P3 visual treatment independently, and
defer the OBB lifecycle repair behind a focused regression fixture. If the
piano silhouette proves inaccurate, revert only its metadata outline to the
existing width/depth fallback; do not replace it with runtime mesh projection.

## Increments

| ID | Content | Depends |
|---|---|---|
| **P3.1** | Visual QA: `Design-png/` sketches + `Design-specs.md` vs the live shell (sketch → surface mapping below); recorded deviation list — **including the shipped owner-aware Arrange surface** (§P3.1 QA scope) | P9 + P1 + P2 + P10.1–P10.3 |
| **P3.2** | Token / typography / icon reconciliation to `Design-specs.md` §5–§8 + §28A + §37 — incl. creating the full six-file `styles/` directory (`tokens.css`, `editor-shell.css`, `controls.css`, `inspector.css`, `timeline.css`, `plan.css`), migrating editor chrome to the blue-tinted system, and tokenizing Scene 3D gizmo, selection/hover, object/layout-box, and orientation-box visuals | P3.1 |
| **P3.3** | Non-behavioral defect-fix pass (visual only — §P3.3 boundary) | P3.2 |
| **P3.4** | Shared `ContextMenu` + non-camera adapters (Scene 3D · Scene Plan Layout + Arrange · Outliner) exposing existing commands only; selection-before-menu tests; editable/native interception; no camera dependency | layout-undo-wrap fix (shipped 2026-08-21), P3.3 |
| **P3.5** | Camera Plan · Camera 3D · Timeline context-menu adapters binding P8's Preview Camera / Preview Edge / Preview Sequence; menus attach to actual backing identities (not the cosmetic five-lane labels); validators/disabled reasons | P3.4, P8 S2–S4 |
| **P3B** | **Recommended after P3:** make the new upper-right XYZ orientation box interactive and camera-aware, with click-to-snap and no drag rotation | P3 |

> **2026-08-23 sequencing:** P3.1 → P3.2 → P3.3 → **P10.4** (Arrange visual
> reconciliation onto the P3.1–P3.3 baseline) → **P10.5** (P10 regression/docs
> close-out) → then P3.4 → P3.5 → **P3 close**. P10.4 does not need P3.4/P3.5.

## P3.1 QA scope — Scene Plan (2026-08-23 rebase)

P3.1 QAs the shipped Scene Plan surface in **both** local modes. The old
Scene-only `Staging` assumption is replaced by the owner-aware Arrange surface:

```text
Scene Plan
├─ Layout
└─ Arrange
    ├─ Layout object passive/hover/selected
    ├─ Scene entity passive/hover/selected
    ├─ owner-aware rotation handle
    ├─ read-only architecture
    ├─ owner-aware Inspector
    └─ hierarchy selection presentation
```

Pinned principle: **same visual selection language for both owners, different
authority underneath.** P3's palette makes blue the sole active/selection
accent and muted colors the context/read-only language — **no orange-vs-blue
ownership coloring**. The amber Layout-object selected treatment is a recorded
deviation (below) resolved by P3.2/P3.3.

### P3.3 boundary (2026-08-23 rebase)

P3.3's visual defect pass is scoped against the shipped P10 surface:

- **P3.3 may fix:** stroke, fill, dash, opacity, spacing, handle shape,
  layering, labels, and empty-state presentation — visual only, both owners.
- **P3.3 may NOT fix (P10.1–P10.3 own these):** `ArrangeOwner`, hit priority
  (`resolveArrangeHit`), selection memory / last-owner rule, mutators,
  history entries, and room ownership.

## P3B — Interactive XYZ orientation box (recommended post-P3)

**Status:** Proposed — schedule immediately after P3.3; deliberately outside the
P3 visual-only DoD.

**Purpose:** make the new top-right XYZ orientation box respond to the Scene 3D
camera without turning P3's primarily-visual pass into a behavior change. The box
updates as the camera rotates; interacting with an axis or face performs a
canonical view snap. Rotating/dragging the box itself does **not** orbit the
camera. P3B does not reopen the P2/P3 workspace model.

### P3B contracts

- **P3B-A — Scene 3D scope.** The interactive orientation box is available in
  Scene → 3D only. Scene Plan Layout/Arrange keeps its P2/P10 boundary: no Plan
  scale gesture, no Three.js transform gizmo, and no 3D orientation controls.
- **P3B-B — camera-following display.** The box continuously reflects the
  orbit camera's viewed world orientation. It is not attached to, transformed
  by, or used as the local/world space indicator for the selected object.
- **P3B-C — click-to-snap.** Clicking a visible XYZ axis or cube face snaps the
  Scene 3D camera to that canonical orientation. The snap changes viewport
  state only: it does not select an object, mutate SceneDocument, create an
  undo entry, or disturb the current selection.
- **P3B-D — no drag orbit.** Pointer drag on the widget is not an orbit gesture;
  the widget itself must not rotate the camera continuously. Normal orbit input
  remains owned by the Scene 3D viewport controls.
- **P3B-E — pointer priority and accessibility.** Widget hit targets are
  isolated from scene-object and TransformControls hit testing. Hover,
  pressed, focus-visible, and disabled/hidden states use the P3 visual tokens;
  keyboard activation of a focused axis/face has the same snap result as a
  click. Escape cancels any pending widget interaction without document work.
- **P3B-F — workspace isolation.** The interactive widget must not appear in
  Camera Plan, Scene Plan, or the wrong domain. Scene 3D selection, transform,
  scale-chain, object-outline, and layout-box behavior remains the existing
  contract; P3B adds only the orientation-box input path and regression
  coverage around those neighboring hit targets.

### P3B subslices

| ID | Content | Depends |
|---|---|---|
| **P3B.1** | Lock the PNG-to-camera mapping for axes/faces, canonical snap orientations, camera-following updates, selection preservation, and no-drag behavior. | P3.3 |
| **P3B.2** | Add isolated pointer/keyboard hit targets for the upper-right widget and route click/activation to camera view snapping only. | P3B.1 |
| **P3B.3** | Add hover, pressed, focus-visible, pointer-cancel, and domain/view transition handling without affecting Scene selection or document history. | P3B.2 |
| **P3B.4** | Add behavior fixtures for camera rotation response, click-to-snap, no drag orbit, selection continuity, and zero document/history mutation. | P3B.2–P3B.3 |

### P3B non-goals

- no new Scene Plan scale gesture;
- no merge of `LayoutDocument` and `SceneDocument`;
- no replacement of the existing TransformControls host;
- no new Camera Plan orientation or framing behavior;
- no drag-to-orbit behavior on the orientation box;
- no schema expansion for independent scale unless the data-model work is
  separately scheduled (the current editor-session limitation remains explicit);
- no change to Scene object selection, transform, outline, or scale semantics.

### P3B definition of done

- the XYZ orientation box reflects Scene 3D camera rotation;
- clicking or keyboard-activating an axis/face snaps only the camera to the
  canonical view;
- dragging the box does not orbit the camera;
- current Scene selection remains selected and no SceneDocument/history entry
  is created by widget interaction;
- widget hit testing is isolated from object selection and TransformControls;
- the box is upper-right, custom, tokenized, and isolated to Scene 3D;
- Plan Arrange remains scale-free;
- suite green, `svelte-check` 0, build clean; tracker marks **P3B shipped**.

## P3.4 / P3.5 — Context menus (progressive disclosure of existing commands)

**Status:** Approved — folded into P3 2026-08-21. This is the one
**interaction-infrastructure** slice P3 hosts: right-click menus that expose
*existing* commands through one shared shell + per-surface adapters. It is not
visual polish and it is not new product capability — every menu action calls an
existing store/facade command, so **one user gesture = one undo entry**.

### Why P3 (not P8.1)

P8.1 is a pure resolver (`resolveDirectedEdgeMotion` + the edge-local timeline
model + the timing-parity fix). It changes preview-path internals but adds no
new command or UI a camera menu can bind to. The `PreviewScope
{ kind: 'edge' | 'camera' | 'sequence' }` commands land in **P8 S2–S4** and are
surfaced in **P8 S5**. So the camera menus (P3.5) bind P8's final scopes and
must wait on P8 S2–S4; the non-camera menus (P3.4) are P8-independent. Wiring
"Preview Edge" today would target the retiring P1.8 API and build the menu
twice.

### Outcome

One shared `ContextMenu` shell + per-surface adapters; no context-menu
mutators, no new delete/duplicate logic. An adapter resolves the entity under
the pointer, applies selection-before-menu, then invokes the existing command:

```text
ContextMenu
    ├── Scene 3D adapter ────────── EditorSelection raycast (resolveNormalSelectionWithHit)
    ├── Scene Plan (Layout) adapter ── resolvePlanHit
    ├── Scene Plan (Arrange) adapter ─ P10 Arrange hit target → owner-routed commands
    ├── Camera Plan ─────────────── resolveCameraPlanHit
    ├── Outliner ────────────────── UnifiedTreeRow identity
    └── Timeline ────────────────── marker identity (EditorCameraTimelineDots)

                        ↓
                EXISTING COMMANDS (EditorStore facade + sub-stores)
```

**Scene Plan (Arrange) adapter (2026-08-23 rebase).** The Scene Plan context
menu is owner-aware, mirroring left-click selection: **Layout mode** resolves
through `resolvePlanHit`; **Arrange mode** resolves through the P10 Arrange hit
target (`resolveArrangeHit`) and routes by owner — a `layout-object` target
uses the existing Layout commands, a `scene` target uses the existing Scene
commands. **Do not build a second context-menu hit resolver.** The exact
existing function that owns this routing must be verified against the landed
P10.3 code when P3.4 starts — the docs cannot prove it alone.

Camera 3D **reuses the Camera Plan adapter** — the same graph/sequence command
set, minus Plan-only spatial actions. The five adapter rows in the diagram
cover all shipped menu surfaces; a surface never gets its own adapter just
because it is a different view.

### v1 menu set (ship)

| Surface | Target | Actions |
|---|---|---|
| Scene → 3D | object | Duplicate · Focus · Hide/Show · Delete |
| Scene → Plan Layout | room / opening / object | Room: Rename/Delete · Opening: Delete · Object: Delete |
| Scene → Plan Arrange | layout-object / scene entity (P10 hit target) | Layout object: Delete · Scene entity: existing Scene commands where the P2/P10 authority permits (Duplicate/Focus/Hide/Delete) |
| Hierarchy / Outliner | any row | same actions already behind the kebab (`EllipsisVertical`) |
| Camera Plan | node | Add/Insert/Remove Sequence · Rename · Connect · Delete |
| Camera Plan | connection | Timing · Delete |
| Camera 3D | node | same graph/sequence actions supported in Camera Plan; no Plan-only spatial actions |
| Camera 3D | connection | Timing · Delete |
| Camera Timeline | node/key/edge | existing node/key/edge actions only (backing identity, not lane label — see Timeline identity note) |

### Timeline identity note

P3.5 timeline menus attach to **actual backing identities** — the
`SceneCameraViewKeyframe` view-key entries, connection edges, and nodes — not
to the cosmetic five-lane labels (`Camera Path / Shots / FOV / Look At / Roll`)
added visually in P3. Right-clicking the FOV or Look At lane visualization must
resolve to the *same* backing view key and the *same* view-keyframe command
set. The P3 lane split must never be treated as new entities, and `Shots` /
`Roll` (no store model) get no menu of their own.

### Deferred (first pass)

- ~~**Scene → Plan Staging menu**~~ — **2026-08-23 rebase: now in P3.4 v1 scope.**
  P2 staging and P10 Arrange shipped (`plan-scene-hit`, `plan-scene-footprint`,
  `PlanViewMode`, and `resolveArrangeHit` all exist). The Scene Plan context
  menu routes through the P10 Arrange hit target per the adapter contract above;
  the deferred item is replaced by the owner-aware Arrange adapter row.
- **Asset Library menu** — Favorite / Replace Selected / Reveal are absent;
  `Details` is selection itself. The one non-redundant future item is `Place`
  on a *model* card (models have no dblclick-to-place).
- **Empty-space Scene menu**, **Edit Path menu item** (no edit-path mode exists —
  selecting a connection already enables interaction), **model Rename** (no
  mutator), **bend-anchor menu**, **scene Lock/Unlock**, **camera-node
  Duplicate**, and the **Shots / FOV keys / Look At keys / Roll keys** timeline
  taxonomy (no such data-model split) — all stay out.
- **Full Authored Transition** — no canonical store/facade command exists. The
  available `applyFullMovePreset` changes focus timing and is not equivalent.
  Keep the menu item out until a separately-scheduled command lands.

### Reuse (do not duplicate)

`EditorStore` facade + `selection-actions`, `placement-cluster-mutator`,
`navigation-graph-mutator`, `path-anchor-mutator`, `view-keyframe-controller`,
`camera-timeline-controller`; `resolveNormalSelectionWithHit`
(`EditorSelection` / `editor-selection.ts`); `resolvePlanHit`
(`layout/plan-hit.ts`); `resolveArrangeHit` (`layout/arrange-hit.ts`, P10 —
Arrange-mode owner routing); `resolveCameraPlanHit` (`camera-plan/camera-plan-hit.ts`);
`UnifiedTreeRow` identity; timeline marker identity in
`EditorCameraTimelineDots`; guards in `mutation-guards.svelte.ts`; shortcut
hints in `hooks/shortcuts.svelte.ts`.

### Adapter contract

- **Selection-before-menu.** Right-click an unselected entity → select it, then
  open. Right-click an already-selected entity → **no selection write**, the
  menu acts on the whole selection (Duplicate/Delete read
  `selectedPlacementIds`). Right-click empty space **does not change selection**;
  surfaces without an approved empty-space menu keep the native/no custom menu
  per the surface contract. Regression-test that re-selecting a member of a
  multi-selection does not silently collapse the selection (which would change
  what `duplicateSelection`/`deleteSelection` act on).
- **Disabled-with-reason.** Any action whose existing command/validator reports
  mutation unavailable renders disabled with its existing reason instead of
  firing a command that no-ops. Camera-graph validators are one case; scene and
  layout operations can also become blocked.
- **Relic boundary.** v1 targets the editor shell (`EditorApp` +
  `UnifiedProjectTree`), never the frozen relic (`MuseumEditorApp` /
  `EditorSceneTree` / `EditorCameraTree`).
- **Interception boundary.** `contextmenu.preventDefault()` only outside
  `isEditableTarget`; text inputs / editable text / numeric fields keep the
  native browser menu.
- **One gesture = one undo entry.** Menu actions call the same commands the
  kebab/Inspector already call, which are now transaction-wrapped (see
  Prerequisite below).

### Prerequisite (done 2026-08-21)

Layout mutations had to be transaction-wrapped before the Outliner/Layout menus
could reuse them — kebab deletes and Inspector field edits previously bypassed
`begin/commitLayoutTransaction` and were not undoable. **Shipped:** every
layout delete/field-edit/create and every viewport gesture is now one undo
entry (`layout/layout-mutation-runner.ts` + regression tests); `svelte-check` 0
and the layout/app suites are green.

### Command-ownership note

One pre-existing gap to close or avoid: `CameraFlowPanel.dropNodeAfter` computes
a new order array locally and calls `setGuidedTourOrder(computedOrder)`; there
is no `moveSequencedNode(nodeId, afterNodeId)` facade command. P3.5's
"Insert After" maps a free node straight to `insertNodeIntoGuidedTour`, so this
does not block, but any future reorder-from-menu action must lift that command
first — the kebab and the context menu must share one command source.

### P3.5 command-mapping audit

Before wiring, pin the exact existing function that implements each menu label.
`Full Authored Transition` is excluded from v1 because no canonical command
exists; never substitute `applyFullMovePreset` / `applyFocusTimingPreset`.

### Risks / invariants

- **No duplicate mutation paths.** Menus call existing commands; never add a
  context-menu-specific delete/duplicate.
- **Undo atomicity.** One gesture = one `begin/commit` (or `cancel` on
  rejection); a rejected action writes no entry.
- **Domain boundaries.** Layout menus mutate `layoutPreview.project.layout`;
  scene menus mutate `store.document`. Camera Plan must never touch framing;
  **Scene Plan mutates the scene document only through the shipped P10 Arrange
  owner routing (Scene owner in Arrange mode); Layout mode stays layout-only.**
- **Topology vs sequence.** Connection deletion respects the guided-tour
  validator (chain edges protected; only the final-pair edge dissolves the
  flow). Loop disconnect is an ordinary `deleteConnection`.
- **Framing leakage.** Camera Plan excludes look target / FOV / envelope /
  framing-breakpoint items.
- **Text-input interference.** Only `preventDefault()` outside `isEditableTarget`;
  otherwise the browser's copy/paste/spellcheck menu is lost.
- **Selection collapse.** Right-clicking a member of a multi-selection must not
  re-select it.

### Definition of done

- one shared shell + the per-surface adapters required by the shipped menu
  surfaces (Camera 3D reuses the Camera Plan adapter), all invoking existing
  commands only;
- selection-before-menu contract holds (regression-tested, incl. multi-selection);
- disabled-with-reason and relic-boundary contracts hold;
- right-click outside editable targets opens the custom menu; text inputs keep
  the native menu;
- suite green, `svelte-check` 0, build clean; tracker marks **P3.4 / P3.5 shipped**.

### P3.1 canonical sketch registry

[`Design-png/README.md`](../../Design-png/README.md) owns the complete 27-image
surface/state mapping. P3.1 consumes that registry instead of maintaining a
second filename table. Asset-import imagery remains a P4 target rather than P3
implementation scope; every other shipped surface is P3 visual QA input.

### P3.1 deviation register carried forward from the P2/P3 review

This is the review baseline, captured so visual QA does not silently erase
behavioral or shell deviations. Ownership indicates the scheduled resolution.
**2026-08-23 rebase:** the pre-P2 rows below are resolved by shipped P2 +
P10.1–P10.3 and are no longer deviations; they are replaced by the
post-P10.3 Arrange QA rows.

| Finding | Baseline deviation | Resolution |
|---|---|---|
| Scene Plan local mode | Live Plan has the shipped `Layout \| Arrange` control (`PlanViewMode`) and owner-aware Arrange routing. | shipped P2.2 + P10.1–P10.3 |
| Scene Plan projection | Footprint projection, scene-footprint hit resolver, and `resolveArrangeHit` owner routing are live. | shipped P2.1–P2.3 + P10.1 |
| Scene Plan selection | `LayoutSelection` + Scene slot route through the derived active Arrange target; no mirrored Arrange selection. | shipped P2.2 + P10.2 |
| Scene Plan inspector | Owner-aware Arrange Inspector shell: Layout-object and Scene X/Z/yaw, dimension-edit boundary. | shipped P2.3 + P10.2–P10.3 |
| Scene Plan sidebar | `Hierarchy \| Assets` exposed in Scene Plan; Arrange makes object rows interactive without a duplicate tree. | shipped P2.2 + P10.2 |
| Scene Plan history | Layout target → one `layout` entry; Scene target → one `scene` entry; cancel restores baseline. | shipped P2.3 + P10.3 |
| **Arrange selection language** | **NEW:** Layout-object selected uses amber (`#9b7841`/`#fff2c7`) while Scene selected uses blue (`#2F8CFF`) — owner-distinct coloring. P3 palette: blue = selection/active, muted = context/read-only. Reconcile to one selection language for both owners (different authority, not different color). | P3.1 QA row; P3.2–P3.3 fix |
| **Arrange passive/hover** | **NEW:** Scene footprints ship passive/active/selected; Layout objects ship passive/selected/readonly — no Arrange hover state for either owner, and no Arrange-specific presentation for eligible Layout objects. | P3.1 QA row; P3.2–P3.3 fix |
| **Arrange rotation handle** | **NEW:** room, Scene, and Layout-object rotation share `rotation-arm`/`rotation-handle` tokens, but only room rotation shows a live degree label — Scene and Layout-object rotation lack it. | P3.1 QA row; P3.2–P3.3 fix |
| **Arrange read-only architecture** | **NEW:** walls/rooms/openings stay passive in Arrange; readonly profile objects render dashed. QA the muted context language. | P3.1 QA row |
| **Arrange Inspector + hierarchy** | **NEW:** owner-aware Inspector and interactive object rows in the unified tree; QA row presentation vs the canonical sketch. | P3.1 QA row |
| Plan history | Some opening/layout-object viewport paths call preview mutations directly while room-unit movement is transaction-wrapped. | **Shipped 2026-08-21** (pulled ahead of P2.3d) — every layout mutation is transaction-wrapped via `layout-mutation-runner.ts`; prerequisite for P3.4 |
| Scale source | Persisted Scene transforms currently carry scalar `scale`; independent vectors are editor-session state until schema work lands. | P2.1a; P3B non-goal for schema |
| Empty Plan | Blank document/tree hint exists, but the full `scene-empty-plan.png` onboarding treatment is not implemented as a visual surface. | P3.1–P3.3 |
| Scene 3D transform gizmo | Three TransformControls and scene adapter exist; exact PNG visual treatment, axis colors, selected-object outline relationship, and scale-chain presentation are not yet tokenized or recorded as a P3 visual contract. | P3.2–P3.3; behavior remains regression-tested |
| Scene 3D selection | Canonical selection infrastructure exists; PNG-level selection feedback, hover/selected contrast, outline layering, and gizmo-priority presentation need explicit visual QA, while functional selection semantics remain frozen. | P3.1–P3.3 visual; P3B does not change object selection |
| Object/layout boxes | Rotation-aware hover/selection OBB helpers exist, but their state hierarchy, blue selection colors, and PNG treatment are not aligned/documented. | P3.1–P3.3 |
| XYZ orientation box | Current overlay is a non-interactive 60×60 line indicator in the bottom-left; canonical target is a custom upper-right XYZ orientation box whose visual treatment is P3 and whose click-to-snap interaction is P3B. | P3.2–P3.3 visual + P3B.1–P3B.4 interaction |
| Color/token architecture | Editor still contains legacy accent literals; canonical blue/blue-tinted tokens and six stylesheets are not fully applied. | P3.2 |
| PNG/spec authority | Active PNGs conform to current shell/spec semantics; exact behavior still comes from source/tests and shell/spec docs. | P9 registry; P3.1 logs implementation deviations only |

P3.1 may record a visual difference as a deviation, but it must not resolve a
P2 or P3B behavior contract by changing the screenshot interpretation.

## Decisions (2026-08-19)

- **Token naming — unified to the `--editor-` prefix.** The editor has no
  existing CSS-token convention (colors are inline hex today), so names are
  namespaced to avoid colliding with the host app or the `/museum` visitor.
  `Design-specs.md` §7–§11 and §37 now use one scheme.
- **Full styles directory lands in P3.2.** All six files in §37 (`tokens.css`
  + five surface stylesheets) are P3.2 scope, not deferred.
- **Relic repaints with shared components; behavior stays frozen.** The relic
  and editor share most chrome (AppBar, Inspector, timeline frame, dialogs,
  tree/field primitives), so a token migration repaints both. Decoupling would
  mean forking those components or maintaining a parallel legacy palette — not
  worth it for a frozen shell slated for removal. Only core *functionality* is
  frozen; the relic may change color.
- **Dependencies decided at implementation time.** `bits-ui` (headless
  primitives) and Inter Variable may be added during P3.2 as needed; neither
  is a gating decision.
- **Sketches are canonical visual acceptance targets.** Exact semantics come
  from source/tests and shell/spec docs; exact token values come from
  `Design-specs.md`. Active PNGs may not retain contradictory vocabulary,
  routing, controls, or dimensions.

## Canonical visual corpus (P9)

[`Design-png/README.md`](../../Design-png/README.md) is the only active visual
ledger. Git history owns older concepts. `camera-sequence-insert-zones.png` is
the existing four-panel Start/Between/End insertion canvas under its correct
name; no insert-zones surface is missing.

## Spec conformance boundary

"Matches `Design-specs.md`" is scoped as follows so P3's DoD stays bounded:

- **P3 owns:** visual reconciliation of every *shipped* surface — §5 (icons),
  §6 (typography), §7–§11 (tokens), §12–§20 (spacing, radii, chrome,
  controls), §22–§26 (toolbar/timeline/inspector/tree), §28A–§35 (Scene 3D
  overlays, selection, motion, status, shortcuts), §37 (token architecture).
  This includes the
  visual treatment of the Scene 3D scale gizmo, object outlines, and upper-right
  XYZ orientation box, but not new interaction semantics.
- **Shipped by P1/P2, conformance inherited** (not rebuilt): §1–§3 (stack),
  the shell/workspace model and capability matrix — owned by P1 §A.2 and P2 §B.
- **Out of P3 scope (deferred surfaces):** the wider asset-management state
  (Shell spec §8 / Design-specs §21) and any §24/§26 timeline detail not
  built by P1.6/P1.7. §4 "command menu later" is **partially pulled in**:
  P3.4/P3.5 ship the progressive-disclosure right-click menu for *existing*
  commands (see below); the wider command-menu surface and the deferred asset
  menu items stay out (the Scene Plan Arrange menu is in P3.4 scope — see the
  P10 rebase above). Five-lane `Camera Path / Shots / FOV / Look At / Roll` (`Design-specs §24` / `Shell §12`) is **cosmetic in P3** — visual split of current two-lane backing infrastructure, ground truth `camera-timeline-expanded.png`. `Shots` and `Roll` have no store model yet. P3.5 menus attach to backing identities, never lane labels. Scene 3D gizmo, selection/hover colors, object/layout boxes, and orientation-box presentation are likewise cosmetic P3 work. P3 changes no interaction semantics except P3.4/P3.5 context menus; orientation-box input/camera snap remains P3B.

## Definition of done (P3 close)

- One visual QA vs the `Design-png/README.md` registry + `Design-specs.md` with
  recorded deviations; token/typography/icon state matches `Design-specs.md`
  §5–§8 / §28A / §37 (no legacy accent literals left in editor chrome); the Scene 3D
  gizmo/outline/XYZ-box visuals are reconciled without changing behavior;
  **no behavioral drift** *except* the deliberate P3.4/P3.5 interaction slice
  (context menus expose existing commands only); P3.4/P3.5 meet their own DoD
  above; suite green, `svelte-check` 0, build clean; tracker
  marks **P3 shipped**.

P3B is scheduled next for the behavior and interaction acceptance described
above; it is not a hidden P3.4 and must not be marked complete by the P3 visual
DoD.
