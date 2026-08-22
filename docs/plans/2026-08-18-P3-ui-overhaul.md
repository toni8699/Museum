# P3 — UI overhaul (umbrella)

**Date:** 2026-08-18
**Status:** Approved (2026-08-18 scope decision §6) — scope pinned; **retargeted to the canonical specs 2026-08-19**. P3B is the recommended post-P3 interaction follow-up. **2026-08-21:** the context-menu interaction slice is folded in as **P3.4 / P3.5** (see below).
**Tracker:** [`docs/plans/README.md`](README.md) — **P3**, depends on: P1 (per-increment; P3.5 also P8 S2–S4; staging-dependent items await P2)

## Canonical targets (2026-08-19)

The specs below are **canonical** and define the overhaul's target state:

- **Visual:** [`Design-specs.md`](../Design-specs/Design-specs.md) — tokens,
  typography, icons, spacing, radii, shell dimensions, per-surface rules.
  Its color system (blue accent `#2F8CFF` on blue-tinted chrome) is the
  overhaul's palette and **supersedes the S10.1.7 gold/charcoal tokens**
  (`#d6b35f` accents on `#0b0b10` / `#1a1a22` surfaces) landed earlier in
  the working tree. The spec's §37 token architecture — six files under
  `src/lib/editor/styles/` (`tokens.css`, `editor-shell.css`, `controls.css`,
  `inspector.css`, `timeline.css`, `plan.css`) — does not exist yet; P3.2
  creates all six.
- **Exposure:** [`Design-shell-specs.md`](../Design-specs/Design-shell-specs.md)
  — workspace ownership, capability routing, non-leakage rules (split 2026-08-21 → [`Shell-camera-workspaces.md`](../Design-specs/Shell-camera-workspaces.md) §9–13 + [`Shell-scene-workspaces.md`](../Design-specs/Shell-scene-workspaces.md) §6–8; § numbers preserved). P1 §A.2
  holds the current conformance mapping; P3 inherits it unchanged.
- **QA ground truth:** the generated UI concepts in
  [`Design-png/`](../../Design-png/) (repo root, `Scene/` + `Camera/`) — the
  sketches the visual spec normalizes. P3.1 QAs the live shell against both
  the sketches and the spec. **Update 2026-08-21:** 2 new PNGs `Camera-3D-Framing-new.png` + `Camera-3D-timeline-expanded.png` added; `Collapsed-camera.png` → `camera-timeline-collapsed.png`, `Camera-sidebar.png` → `camera-sidebar.png`/`Side-bar.png` (case-alias); `Empty-staging.png` → `Empty-3D.png` (rename matches content — Scene → 3D empty state); `Neighbour-2D.png` delivered (P1.9 neighbor accordion).

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
  on P2; staging-dependent surfaces (P3.1's staging-sketch QA rows, the
  Staging menu) defer until P2 ships.

## Increments

| ID | Content | Depends |
|---|---|---|
| **P3.1** | Visual QA: `Design-png/` sketches + `Design-specs.md` vs the live shell (sketch → surface mapping below); recorded deviation list | P1 (staging-sketch QA rows await P2) |
| **P3.2** | Token / typography / icon reconciliation to `Design-specs.md` §5–§8 + §28A + §37 — incl. creating the full six-file `styles/` directory (`tokens.css`, `editor-shell.css`, `controls.css`, `inspector.css`, `timeline.css`, `plan.css`), migrating editor chrome off the S10.1.7 gold/charcoal to the blue-tinted system, and tokenizing Scene 3D gizmo, selection/hover, object/layout-box, and orientation-box visuals | P3.1 |
| **P3.3** | Non-behavioral defect-fix pass (visual only) | P3.2 |
| **P3.4** | Shared `ContextMenu` + non-camera adapters (Scene 3D · Scene Plan Layout · Outliner) exposing existing commands only; selection-before-menu tests; editable/native interception; no camera dependency | layout-undo-wrap fix (shipped 2026-08-21), P3.3 |
| **P3.5** | Camera Plan · Camera 3D · Timeline context-menu adapters binding P8's Preview Camera / Preview Edge / Preview Sequence; menus attach to actual backing identities (not the cosmetic five-lane labels); validators/disabled reasons | P3.4, P8 S2–S4 |
| **P3B** | **Recommended after P3:** make the new upper-right XYZ orientation box interactive and camera-aware, with click-to-snap and no drag rotation | P3 |

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
  Scene → 3D only. Scene Plan Layout/Staging keeps its P2 boundary: no Plan
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
- Plan staging remains scale-free;
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
    ├── Scene 3D adapter ── EditorSelection raycast (resolveNormalSelectionWithHit)
    ├── Layout adapter ──── resolvePlanHit
    ├── Camera Plan ─────── resolveCameraPlanHit
    ├── Outliner ────────── UnifiedTreeRow identity
    └── Timeline ────────── marker identity (EditorCameraTimelineDots)

                        ↓
                EXISTING COMMANDS (MuseumEditorStore facade + sub-stores)
```

Camera 3D **reuses the Camera Plan adapter** — the same graph/sequence command
set, minus Plan-only spatial actions. The five adapter rows in the diagram
cover all shipped menu surfaces; a surface never gets its own adapter just
because it is a different view.

### v1 menu set (ship)

| Surface | Target | Actions |
|---|---|---|
| Scene → 3D | object | Duplicate · Focus · Hide/Show · Delete |
| Scene → Plan Layout | room / opening / object | Room: Rename/Delete · Opening: Delete · Object: Delete |
| Hierarchy / Outliner | any row | same actions already behind the kebab (`EllipsisVertical`) |
| Camera Plan | node | Add/Insert/Remove Sequence · Rename · Connect · Delete |
| Camera Plan | connection | Timing · Delete |
| Camera 3D | node | same graph/sequence actions supported in Camera Plan; no Plan-only spatial actions |
| Camera 3D | connection | Timing · Full Authored Transition · Delete |
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

- **Scene → Plan Staging menu** — P2 staging is an approved plan, not shipped
  (`plan-scene-hit` / `plan-scene-footprint` / `PlanViewMode` do not exist).
  Becomes a **P3.4 extension only if P2 actually ships before P3.4 starts**;
  otherwise it is deferred to a tiny later P3.x / P2-polish slice.
- **Asset Library menu** — Favorite / Replace Selected / Reveal are absent;
  `Details` is selection itself. The one non-redundant future item is `Place`
  on a *model* card (models have no dblclick-to-place).
- **Empty-space Scene menu**, **Edit Path menu item** (no edit-path mode exists —
  selecting a connection already enables interaction), **model Rename** (no
  mutator), **bend-anchor menu**, **scene Lock/Unlock**, **camera-node
  Duplicate**, and the **Shots / FOV keys / Look At keys / Roll keys** timeline
  taxonomy (no such data-model split) — all stay out.

### Reuse (do not duplicate)

`MuseumEditorStore` facade + `selection-actions`, `placement-cluster-mutator`,
`navigation-graph-mutator`, `path-anchor-mutator`, `view-keyframe-controller`,
`camera-timeline-controller`; `resolveNormalSelectionWithHit`
(`EditorSelection` / `editor-selection.ts`); `resolvePlanHit`
(`layout/plan-hit.ts`); `resolveCameraPlanHit` (`camera-plan/camera-plan-hit.ts`);
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
In particular **Full Authored Transition** must map to the canonical
"force w = 1" full-authored-envelope command per the product spec — **not** a
focus-timing preset such as `applyFullMovePreset` / `applyFocusTimingPreset`
(which set focus timing, not the full-authored envelope semantics). If the
canonical command does not exist as a store/facade call, the item stays out
rather than exposing the wrong semantics.

### Risks / invariants

- **No duplicate mutation paths.** Menus call existing commands; never add a
  context-menu-specific delete/duplicate.
- **Undo atomicity.** One gesture = one `begin/commit` (or `cancel` on
  rejection); a rejected action writes no entry.
- **Domain boundaries.** Layout menus mutate `layoutPreview.project.layout`;
  scene menus mutate `store.document`. Camera Plan must never touch framing;
  Scene Plan must never mutate the scene document until Staging exists.
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

### P3.1 sketch → surface mapping

| Sketch | Surface | Note |
|---|--:|---|
| `Design-png/Scene/Scene-2D.png` | Scene → Plan (incl. P2 staging) | Layout/Staging shell and passive/active footprint composition |
| `Design-png/Scene/Plan-Staging.png` | Staging footprint states (P2) | Four footprint states and rotate-handle presentation |
| `Design-png/Scene/Empty-3D.png` | Empty Scene → 3D state (renamed from `Empty-staging.png` — content is Scene 3D empty, not staging) | Scene 3D empty-state presentation |
| `Design-png/Scene/Empty-plan.png` | Empty plan state | Plan onboarding and blank-surface treatment |
| `Design-png/Scene/Scene-3D.png` · `Scene-3D-2.png` · `Scene-3D-assets.png` | Scene → 3D + asset library | Scene 3D shell, scale gizmo, selection/outline states, and upper-right XYZ box are visual P3 targets; new orientation-box input/camera snap is P3B, while existing object selection/transform semantics remain frozen |
| `Design-png/Scene/Scene-Object-Inspector.png` | Inspector | Inspector envelope; P2 staging fields remain canonical for Plan |
| `Design-png/Camera/Camera-2D.png` | Camera → Plan (P1.5) | **keep — minor convention only** (sketch shows `Free Cameras / →` / editable `Y`; docs canonical `Unsequenced / — / Y preserved` per `Camera-flow-specs.md §2`, `Shell §4`/`§9` — P3.1 logs deviation, no PNG edit) |
| `Design-png/Camera/Camera-3D.png` | Camera → 3D | **keep — minor convention only** (`Free → Unsequenced` per `Camera-flow-specs.md §2`) |
| `Design-png/Camera/Framing-Authoring-3D.png` | Framing authoring (P1.6) alt concept | **archived — superseded by `Camera-3D-Framing-new.png` delivered 2026-08-21** (viewport/inspector envelope `Safe Frame 90%` / `Framing Envelope 14%→86%` keep; old left `Shots 01-08` non-canonical) |
| `Design-png/Camera/Camera-sequence.png` · `Camera-sidebar.png` (old) | Camera sidebar / sequence alt concept | `Camera-sequence.png` **keep — minor** (`Free → Unsequenced`); old `Camera-sidebar.png` (capital C) **archived — superseded by `camera-sidebar.png` (lowercase) + `Side-bar.png` delivered 2026-08-21** — canonical 4-section `Environment / Sequence Inspector / Unsequenced / Connections` per `Shell §4` |
| `Design-png/Camera/camera-sidebar.png` · `Side-bar.png` | Camera sidebar 4-section (Aug 21) | **delivered 2026-08-21** — canonical `Environment / Sequence Inspector / Unsequenced / Connections` per `Shell §4`; `A — B` undirected; `Side-bar.png` shows `Drop a camera here` empty state (P1.8 §6). **P1.9 (2026-08-21):** row detail superseded — neighbor dropdown instead of the connection-tree accordion, drag-only reorder, no order arrows; row-level ground truth is now `Neighbour-2D.png` |
| `Design-png/Camera/Neighbour-2D.png` | Camera sidebar neighbor accordion (P1.9) | **delivered 2026-08-21** — Sequence row chevron expands a `Neighbors` sub-list (order badge / ◯ unsequenced / `Preview · Select in Plan`), drag handles, no ↑/↓, undirected Connections, 5-lane timeline; P1.9 implements this shape per shell §4 |
| `Design-png/Camera/Timeline-expanded.png` | Camera Timeline expanded (P1.6) | **keep — minor** (`Free → Unsequenced`); lanes `Camera Path/Shots/FOV/Look At/Roll` keep (`Shell §12`) — now correctly shown in `Camera-3D-timeline-expanded.png` |
| `Design-png/Camera/Camera-3D-timeline-expanded.png` | Camera Timeline expanded canonical (Aug 21) | **delivered 2026-08-21** — canonical 5 lanes `Camera Path / Shots / FOV / Look At / Roll` per `Shell §12` (`Design-specs §24`); `Sequence Path B→C→D` vs `Branch E`, legends `TIMELINE (Sequence only)` + `SEQUENCE MODEL` + timing `B—C 4.2s / C—D 5.1s` + branch pill |
| `Design-png/Camera/camera-timeline-collapsed.png` | Camera Timeline collapsed 48px (Aug 21) | **delivered 2026-08-21** — true `48px` collapsed strip `Tour + Play/Pause/Follow/Recenter/Stop + Snap + time + Zoom + Collapse` per `Shell §12` (`Design-specs §16`); old `Collapsed-camera.png` missing on disk — ref updated |
| `Design-png/Camera/Camera-3D-Framing-new.png` | Framing authoring redo (Aug 21) | **delivered 2026-08-21** — supersedes `Framing-Authoring-3D.png` left 30%; viewport `Safe Frame 90% / Subject Frame / Focus Target` + `Framing Envelope 14%→86% / Focus Timing / Lens 24/35/50/85 / Parallax Warning` keep (P1.6); left now canonical 4-section |
| `Design-png/Camera/Sequence-reroot.png` · `New-Camera-flow-plan.png` · `Unsequenced-branch.png` | P1.8 Camera flow (Sequence re-root / branch) | **keep — minor** (new P1.8 truth; docs note `→` → `—`, `Measure`/`Yaw/Y` vs `Shell §4/§9/§16`, timing label `Shell §9` gap — sketch kept as-is) |
| `Design-png/Camera/Side-bar.png` · `Unsequence-Sequenced.png` · `Remove-from-sequence.png` · `Remove-sequence.png` · `Camera-preview-connection.png` · `Path-edit.png` · `Timeline-sequence-only.png` | P1.8 missing canvases batch (Aug 21) | **delivered 2026-08-21** — `Side-bar.png` §6 empty `Drop a camera here`, `Remove-*.png` §12 + §16/17 remove/delete protection, `Camera-preview-connection.png` §18 Preview, `Path-edit.png` §15 keeps seq, `Timeline-sequence-only.png` §19 Sequence-only + branch pill; per `P1.8-designer-brief.md §3` (only insert zones §7+§11 remain) |
| `Design-png/Scene/Asset management.png` | Asset management (deferred, out of P3 scope) | |

### P3.1 deviation register carried forward from the P2/P3 review

This is the review baseline, captured so visual QA does not silently erase
behavioral or shell deviations. Ownership indicates the scheduled resolution:

| Finding | Baseline deviation | Resolution |
|---|---|---|
| Plan mode model | Live `PlanWorkspace` is Layout-only; no Scene Plan-local `Layout | Staging` control or `PlanViewMode`. | P2.2a |
| Plan scene projection | No scene footprint projection, scene-footprint hit resolver, or Scene Plan scene mutation path. | P2.1b–P2.3 |
| Plan selection | `LayoutSelection` owns Plan interaction; the generic active-selection facade is prepared but not wired to Staging. | P2.2b |
| Plan inspector | Inspector still says Plan is layout-only and lacks the staging X/Z/Yaw plus preserved-Y surface. | P2.3c |
| Plan sidebar | `Hierarchy | Assets` is only exposed in Scene 3D in the baseline; Scene Plan must expose both without a duplicate staging tree. | P2.2c |
| Camera leakage | Existing Plan tour-overlay preference must be gated out of Staging and Camera-authoring controls must not leak into Scene Plan. | P2.2c |
| Plan history | Some opening/layout-object viewport paths call preview mutations directly while room-unit movement is transaction-wrapped. | **Shipped 2026-08-21** (pulled ahead of P2.3d) — every layout mutation is transaction-wrapped via `layout-mutation-runner.ts`; prerequisite for P3.4 |
| Scale source | Persisted Scene transforms currently carry scalar `scale`; independent vectors are editor-session state until schema work lands. | P2.1a; P3B non-goal for schema |
| Empty Plan | Blank document/tree hint exists, but the full `Empty-plan.png` onboarding treatment is not implemented as a visual surface. | P3.1–P3.3 |
| Scene 3D transform gizmo | Three TransformControls and scene adapter exist; exact PNG visual treatment, axis colors, selected-object outline relationship, and scale-chain presentation are not yet tokenized or recorded as a P3 visual contract. | P3.2–P3.3; behavior remains regression-tested |
| Scene 3D selection | Canonical selection infrastructure exists; PNG-level selection feedback, hover/selected contrast, outline layering, and gizmo-priority presentation need explicit visual QA, while functional selection semantics remain frozen. | P3.1–P3.3 visual; P3B does not change object selection |
| Object/layout boxes | Rotation-aware hover/selection OBB helpers exist, but their state hierarchy, blue selection colors, and PNG treatment are not aligned/documented. | P3.1–P3.3 |
| XYZ orientation box | Current overlay is a non-interactive 60×60 line indicator in the bottom-left; canonical target is a custom upper-right XYZ orientation box whose visual treatment is P3 and whose click-to-snap interaction is P3B. | P3.2–P3.3 visual + P3B.1–P3B.4 interaction |
| Color/token architecture | Editor still contains hardcoded gold/charcoal styles; canonical blue/blue-tinted tokens and six stylesheets are not fully applied. | P3.2 |
| PNG/spec authority | Generated PNGs are directional; exact semantic rules come from the shell/spec docs. | P3.1 records deviations; no PNG edits |

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
  mean forking those components or maintaining a parallel gold palette — not
  worth it for a frozen shell slated for removal. Only core *functionality* is
  frozen; the relic may change color.
- **Dependencies decided at implementation time.** `bits-ui` (headless
  primitives) and Inter Variable may be added during P3.2 as needed; neither
  is a gating decision.
- **Sketches are direction, not pixel-gauges.** `Design-specs.md` normalizes
  the generated concepts into tokens; exact hues are fine-tuned during
  P3.1/P3.2. Color divergence from a PNG is not a defect.
- **Alternate palette available as an option.** `Design-specs.md` §7 documents
  "Vault & Lens" (warm gallery brass for Scene, cool lens cyan for Camera) as
  an optional theme. Theme switching is a future expansion: cheap for DOM
  chrome + SVG (swap `--editor-*` values), needs a small JS bridge for
  Three.js overlays.

## Designer requests — fulfilled (2026-08-19; updated 2026-08-21)

All requested sketches delivered and verified in `Design-png/`; Aug 21 batch added P1.8 coverage:

| # | Request | Sketch delivered |
|---|---|---|
| 1 | Scene → Plan — Staging footprint states | `Scene/Plan-Staging.png` |
| 2 | Camera → 3D — Framing authoring | `Camera/Framing-Authoring-3D.png` (alt concept) → **superseded by `Camera/Camera-3D-Framing-new.png` (2026-08-21)** — canonical 4-section sidebar + correct framing envelope |
| 3 | Collapsed Camera Timeline | `Camera/Collapsed-camera.png` (missing) → **superseded by `Camera/camera-timeline-collapsed.png` (2026-08-21)** — true `48px` strip per `Shell §12` |
| 4 | Boot / empty states | `Scene/Empty-plan.png` (updated) + `Scene/Empty-3D.png` (renamed from `Empty-staging.png`) |
| 5 | Camera Sidebar (4 sections) | `Camera/Camera-sidebar.png` (old, archived) → **superseded by `Camera/camera-sidebar.png` (lowercase) + `Camera/Side-bar.png` (2026-08-21)** — canonical `Environment / Sequence Inspector / Unsequenced / Connections`; `Side-bar.png` also covers P1.8 §6 empty `Drop a camera here` |
| 6 | Asset management (optional) | `Scene/Asset management.png` — delivered, out of P3 scope |
| 7 | P1.8 Camera flow — re-root / branch (new 2026-08-21) | `Camera/Sequence-reroot.png` + `Camera/New-Camera-flow-plan.png` + `Camera/Unsequenced-branch.png` — keep minor convention only |
| 8 | P1.8 Missing canvases — remove / delete / preview / path-edit / timeline-sequence-only (new 2026-08-21) | `Camera/Remove-from-sequence.png` + `Remove-sequence.png` + `Unsequence-Sequenced.png` (§12, §16/17) + `Camera-preview-connection.png` (§18) + `Path-edit.png` (§15) + `Timeline-sequence-only.png` (§19) — only `§7+§11 Insert zones` remains |
| 9 | Camera Timeline expanded canonical (new 2026-08-21) | `Camera/Camera-3D-timeline-expanded.png` — canonical 5 lanes `Camera Path / Shots / FOV / Look At / Roll` per `Shell §12` / `Design-specs §24` + `Sequence Path vs Branch` + `SEQUENCE MODEL` legends; interim `camera-sidebar.png` 2-lane `Sequence/Notes` is simplified view, not canonical |
| 10 | P1.9 sidebar neighbor accordion (new 2026-08-21) | `Camera/Neighbour-2D.png` — Sequence row chevron expands `Neighbors` sub-list (order badge / ◯ unsequenced / `Preview · Select in Plan`), drag handles, no order arrows, undirected Connections; P1.9 row-level ground truth |

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
  commands (see below); the wider command-menu surface and the deferred asset/
  staging menu items stay out. **Note 2026-08-21:** 5-lane `Camera Path / Shots / FOV / Look At / Roll` (`Design-specs §24` / `Shell §12`) is **cosmetic in P3** — visual split of current 2-lane `Guided Route / Camera Framing` (`EditorCameraTimelineDots.svelte:556`), ground truth `Camera-3D-timeline-expanded.png`; `Shots` (no entity, derived) and `Roll` (`0°` quiet, `editor-camera-view.ts:136` not representable) have no store model yet. P3.5 menus attach to the backing identities behind these lanes, never the labels. Scene 3D gizmo, selection/hover colors, object/layout boxes, and orientation-box presentation are likewise cosmetic P3 work. P3 does not add or alter interaction semantics *except* the P3.4/P3.5 context-menu slice (existing commands only); the new orientation-box input/camera-snap path is explicitly deferred to P3B.

## Definition of done (P3 close)

- One visual QA vs the `Design-png/` sketches + `Design-specs.md` with
  recorded deviations; token/typography/icon state matches `Design-specs.md`
  §5–§8 / §28A / §37 (no S10.1.7 gold accents left in editor chrome); the Scene 3D
  gizmo/outline/XYZ-box visuals are reconciled without changing behavior;
  **no behavioral drift** *except* the deliberate P3.4/P3.5 interaction slice
  (context menus expose existing commands only); P3.4/P3.5 meet their own DoD
  above; suite green, `svelte-check` 0, build clean; tracker
  marks **P3 shipped**.

P3B is scheduled next for the behavior and interaction acceptance described
above; it is not a hidden P3.4 and must not be marked complete by the P3 visual
DoD.
