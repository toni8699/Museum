# H1 S1 — Editor Shell Consolidation (Plan · 3D)

**Date:** 2026-08-14
**Status:** Implemented
**Parent:** [`2026-08-14-graphics-h1-unified-3d-editing.md`](./2026-08-14-graphics-h1-unified-3d-editing.md)
**Prerequisite:** S0 · Pin the product/session contracts
**Handoff:** [`../../hand-off/CURRENT.md`](../../hand-off/CURRENT.md)

## Goal

Replace the editor's top-level `Scene · Camera · Layout` workspaces with two
views — **Plan** and **3D** — and compose all 3D editing into one Canvas,
without changing drafting/selection/camera behavior. The pre-H1 editor stays
frozen as a relic at `/museum/editor`.

This slice is **structural only**: same surfaces, same store, same behavior,
rearranged into the Plan · 3D shell. Selection unification, the unified
hierarchy, complete picking, the single gizmo host, and atomic candidate
preview are deferred to S3–S8.

## Current state

| Concern | Today |
|---|---|
| Shell | `MuseumEditorApp.svelte` — 3-column grid: app bar (top), `EditorLeftSidebar` (left), `EditorViewport` (center), `EditorInspector` (right), `EditorCameraTimelineFrame` (bottom) |
| Top-level switcher | `EditorAppBar.svelte` tabs `Scene · Camera · Layout` → `store.currentWorkspace` (`EditorWorkspace = 'scene' \| 'camera' \| 'layout'` in `museum-editor.types.ts`, held by `session-state.svelte.ts`) |
| Viewport dispatch | `EditorViewport.svelte` has **two Canvas branches**: `layout` (a Threlte `Canvas` with `LayoutRenderGate` + `MuseumScene` `showArchitecture=false` + `LayoutPreviewScene` + `EditorGrid`, plus a `LayoutPlanViewport` SVG overlay when `layoutInteraction.viewMode === 'plan'`), and `scene/camera` (a separate `Canvas` with `MuseumScene` `showArchitecture=true` + camera helpers + `EditorSelection`/`EditorPlacementTools`/`EditorSelectionHelper`/`EditorTransformControls`/`PlacementGhost`) |
| Plan surface | `LayoutPlanViewport.svelte` + `PlanSvg.svelte` + `LayoutDraftToolbar.svelte` — full 2D SVG CAD with room/opening/object drafting, already gated by an internal `LayoutViewMode = 'plan' \| '3d'` (`layout-interaction.ts`) |
| 3D layout | `LayoutPreviewScene.svelte` (wall meshes) + `LayoutRenderGate.svelte` (`LayoutInteraction3D.svelte` is removed in this slice — its plan↔3D interaction split was subsumed by the H1 top-level Plan · 3D switch) |
| Scene/camera | `MuseumScene.svelte` + `EditorMuseumEntities.svelte`; camera tools as `EditorCameraHelpers/Path/Framing/View` + `EditorCameraTree` (left) + `EditorCameraTimelineFrame` (bottom) |
| Relic | `/museum/editor` mounts `MuseumEditorApp` with `relic`; `/` and `/editor` mount the full shell. S0 hardened this beyond the tab: `createMuseumEditorStore({ relic })` rejects `setWorkspace('layout')`, the layout history bridge is skipped, and the Project menu's layout section is gated `{#if !relic}` |

Two facts shape the slice:

1. The Layout workspace **already contains** a Plan↔3D split — `layoutInteraction.viewMode` — but it is nested inside a workspace rather than being the editor's top level.
2. Scene and camera already share one Canvas; only Layout uses a second Canvas. The split exists because the layout preview renders `showArchitecture=false` beside the scene, while the scene/camera branch renders `showArchitecture=true`.

## Target

```text
H1 editor shell
  ├─ Plan view            LayoutDraftToolbar + LayoutPlanViewport (SVG CAD)
  └─ 3D view              one Threlte Canvas
       ├─ generated architecture   LayoutPreviewScene + LayoutRenderGate
       ├─ scene entities           MuseumScene + EditorMuseumEntities
       ├─ camera helpers           EditorCameraHelpers/Path/Framing/View
       ├─ grid / lights / placement ghost / selection helper / gizmo
       └─ contextual panels        camera tree · camera timeline · assets
```

- **Plan** and **3D** are the only top-level views; `EditorViewMode = 'plan' | '3d'`.
- The 3D view is **one mounted Canvas**. Scene, camera, and layout-3D stop being
  mutually exclusive workspaces and become contexts that toggle helpers/panels
  inside that Canvas.
- Camera authoring keeps its existing route/motion system; its tree, timeline,
  and toolbars become 3D panels/contexts, not a workspace.

## Locked decisions

### Relic is frozen, H1 is a new shell entry

- The existing `$lib/editor/*` shell — `MuseumEditorApp`, `EditorAppBar`,
  `EditorViewport`, `EditorLeftSidebar`, `EditorInspector`,
  `museum-editor.svelte.ts` and its stores — **stays untouched** and remains
  mounted only at `/museum/editor`. It is the frozen pre-H1 snapshot.
- H1 introduces a new shell entry `src/lib/editor/h1/H1EditorApp.svelte`
  mounted at `/` and `/editor`. It composes the same `createMuseumEditorStore()`
  and the shared editor surfaces (`EditorViewport`, `EditorLeftSidebar`,
  `EditorInspector`, `EditorCameraTimelineFrame`) under new Plan | 3D chrome —
  same store, same surfaces, same behavior. Only the legacy `EditorAppBar`
  chrome (Scene · Camera · Layout tabs) is replaced by `H1AppBar`.
- H1 shell view state lives in `h1/editor-view-state.svelte.ts`
  (`viewMode: 'plan' | '3d'`, `active3dContext: 'scene' | 'camera'`) and maps
  onto the store's existing `currentWorkspace`. It changes no store internals,
  so the relic (which keeps mounting the untouched `MuseumEditorApp`) never
  observes H1 chrome changes.

### Plan stays the SVG CAD surface

- Plan = `LayoutDraftToolbar` + `LayoutPlanViewport` rendered full-panel, with
  the existing `LayoutInteractionState` and `LayoutPreviewState`. No new
  drafting engine, no camera mutation path in Plan.

### One 3D Canvas composes the current two branches

- Merge the `layout` and `scene/camera` Canvas branches into one Canvas that
  mounts `LayoutPreviewScene` **and** `MuseumScene` together, with a single
  `showArchitecture` policy driven by view context (scene-entity visibility is
  a context toggle, not a workspace switch).
- Camera helpers, placement ghost, selection helper, and TransformControls stay
  mounted; their visibility is gated by `active3dContext` + store flags exactly
  as today.

### Camera and scene become contexts, not tabs

- `active3dContext: 'scene' | 'camera'` replaces the top-level workspace
  semantics for the 3D view: it selects which left-sidebar panel, inspector,
  and viewport helpers are shown. It is session-only and never serialized.
  Layout is not a 3D context — the drafted architecture renders in 3D
  unconditionally via `LayoutPreviewScene`.
- The app bar exposes only `Plan | 3D`. Switching Plan→3D keeps the document,
  selection where valid, history, dirty state, and camera preview; it creates
  no history entry (same rule as today's workspace switch).

## Implementation steps

### 0. Freeze the relic shell

- Add a smoke test asserting `/museum/editor` still renders the legacy
  `MuseumEditorApp` with `Scene · Camera` tabs (no Layout) after every later
  step. This is the guard that H1 shell work never regresses the relic.
  (S0 already added the store-level guard — relic rejects
  `setWorkspace('layout')` and gates the layout Project-menu section; this
  smoke test pins the visible surface.)
- Confirm `/` and `/editor` are the only mounts that will point at the H1
  entry after step 6.

### 1. Introduce `EditorViewMode` and shell state

- Add `h1/editor-view-state.svelte.ts`: `viewMode: 'plan' | '3d'`,
  `active3dContext: 'scene' | 'camera'`, with `setViewMode()` and
  `set3dContext()` guarded the same way `setWorkspace` is (blocked during
  active interaction/transaction).
- Unit-test the transitions: no-op on same value, blocked during interaction,
  view switch never writes a history entry.

### 2. Add the H1 app bar

- `h1/H1AppBar.svelte` renders `Plan | 3D` (replacing `Scene · Camera ·
  Layout`). `Plan` = layout context, `3D` = scene context by default.
- Wire `Preview Museum` / `Preview Tour` actions onto the same store paths as
  today, keyed by `active3dContext`.

### 3. Promote Plan to a full view

- `h1/H1PlanView.svelte` mounts `LayoutDraftToolbar` + `LayoutPlanViewport`
  (with the existing `LayoutInteractionState`/`LayoutPreviewState`) as the
  whole center panel — no WebGL Canvas behind it. This is a surface promotion,
  not a rewrite: drafting, snapping, hit-testing, and transactions are
  unchanged.

### 4. Merge the 3D Canvas

- `h1/H13DView.svelte` mounts **one** Threlte `Canvas` containing
  `LayoutRenderGate`, `MuseumScene` (single `showArchitecture` policy),
  `LayoutPreviewScene`, `EditorGrid`, and the camera/selection/placement/gizmo
  helpers.
- Port the `scene/camera` branch's `MuseumScene(showArchitecture=true)` and the
  `layout` branch's `MuseumScene(showArchitecture=false)` + `LayoutPreviewScene`
  into the single mount, with visibility derived from `active3dContext` and
  existing store flags.
- Plan-drafting and 3D editing stay mutually exclusive exactly as `viewMode`
  does today; entering Plan mounts the SVG surface, entering 3D mounts the one
  Canvas. `LayoutInteraction3D`'s 3D-draft interaction is **not** carried over
  — the fused `H13DView` renders `LayoutPreviewScene` directly.

### 5. Contextual panels

- Left sidebar: scene context → scene/asset tabs; camera context →
  `EditorCameraTree`; layout context → the layout summary (all existing
  surfaces, re-keyed off `active3dContext`).
- Inspector: re-keyed off `active3dContext`.
- Camera timeline frame stays the bottom panel, visible in the 3D view only.

### 6. Route wiring

- `/` and `/editor` mount `H1EditorApp`.
- `/museum/editor` keeps mounting the legacy `MuseumEditorApp` (relic).
- `virtual:museum-editor-entry` still resolves the legacy entry for the relic;
  H1 routes import `H1EditorApp` directly.

### 7. Parity and regression closure

- Run the full editor test suite after each step; the relic smoke test from
  step 0 must stay green throughout.
- Manual QA: Plan↔3D switch preserves document/history/selection; scene,
  camera, and layout contexts show the same tools they did as workspaces; one
  Canvas renders architecture + entities together with no double-mount.

## Regression matrix

| Concern | Required assertion |
|---|---|
| Relic isolation | `/museum/editor` still renders legacy `MuseumEditorApp` (Scene · Camera, no Layout) |
| View switch | Plan ↔ 3D preserves document, history, dirty state, and valid selection |
| One Canvas | 3D mounts exactly one `Canvas`; architecture + scene entities + helpers coexist |
| Plan surface | Plan renders `LayoutPlanViewport` with drafting/snap/hit/transaction behavior unchanged |
| Camera context | Camera tree/timeline/helpers appear in 3D; Plan exposes no camera mutation path |
| Scene context | Scene/asset tabs, placement, selection, gizmo behave as before |
| No behavior drift | Existing layout/scene/camera tests pass with only chrome-level selectors updated |

## Non-goals (deferred)

- `ActiveEditorSelection` domain unification (S3).
- Unified project hierarchy (S4).
- Complete wall/opening pick identity (S5) and centralized 3D selection (S6).
- Single TransformControls host with domain adapters (S7).
- Layout candidate preview + atomic history (S8).
- Project-local GLB import (S9) and boot-into-empty project (S2 — S1 keeps the
  current document source for parity).

## Implementation notes (deviations)

- **Same store, not a thin wrapper.** The original locked-decision draft said
  H1 would use a "thin document/session wrapper" that does not use the legacy
  store. That contradicted the slice's own "same store, same behavior" goal,
  so it was dropped: H1 composes `createMuseumEditorStore()` directly and only
  replaces the top-level chrome. The store is untouched; the relic keeps the
  legacy `MuseumEditorApp` and cannot observe H1's view state.
- **One-Canvas fusion landed** (`h1/H13DView.svelte`). The 3D view mounts one
  Threlte `Canvas` that always renders `LayoutPreviewScene` (draft
  architecture), `EditorMuseumEntities` (scene entities), camera helpers,
  grid/selection/placement/gizmo, over `MuseumScene(showArchitecture=false)`
  (camera + lights only). The legacy `EditorViewport` stays untouched for the
  relic, which keeps its visitor Chopin shell.
- **Plan view hides the toolbar's Plan | 3D toggle** (`showViewToggle={false}`
  on `LayoutDraftToolbar`) because the top-level switch owns view selection.
- **`EditorLeftSidebar` Chopin action removed** (not in the original draft). The
  shared layout summary no longer renders "Reload Chopin preview" (only
  "Reset empty"), and the orphaned `LayoutInteraction3D.svelte` was deleted
  once the fusion made it dead. The sidebar is otherwise untouched.

## Verification

```text
npm test -w @portfolio/museum
npm run check -w @portfolio/museum
npm run build -w @portfolio/museum
```

Plus the relic smoke test (`/museum/editor`) and the manual Plan↔3D parity pass.
