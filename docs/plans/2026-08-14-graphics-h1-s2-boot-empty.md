# H1 S2 — Boot into an Empty Project

**Date:** 2026-08-14
**Status:** Draft — not implemented
**Parent:** [`2026-08-14-graphics-h1-unified-3d-editing.md`](./2026-08-14-graphics-h1-unified-3d-editing.md)
**Prerequisite:** S1 · Editor Shell Consolidation (Plan · 3D)
**Handoff:** [`../../hand-off/CURRENT.md`](../../hand-off/CURRENT.md)

## Goal

Make the H1 editor boot into a canonical **empty** `MuseumProject` on every load
(no New Project command) and open the empty **Plan** canvas. The 3D view uses a
session-only free camera until the first navigation node is authored, and
visitor/tour preview stays unavailable until a valid route exists. Reset and
import clear history + both dirty baselines atomically.

This is the slice that turns S0's remaining `it.todo` contracts green. It
changes the *boot source* (Chopin → empty) and the *preview lockout*, not the
editing model: room drafting, scene authoring, and camera authoring keep their
existing behavior.

## Current state

| Concern | Today |
|---|---|
| Boot source | `H1EditorApp` calls `createMuseumEditorStore()` with no options → `EditorDocumentStore(undefined, chopinRuntime.rooms)` defaults the scene document to the checked-in `museumSceneDocument` (Chopin) |
| Layout boot | `createLayoutPreviewState()` seeds `'chopin-fixture'` (`chopinProject.layout` + `museumSceneDocument`) |
| Default view | `EditorViewState` defaults `viewMode = '3d'` (S1 parity note; S2 must flip to `'plan'`) |
| Free camera | `EditorCameraRig` already has a neutral OrbitControls pose (`EDITOR_NEUTRAL_CAMERA_POSITION/TARGET`, min/max distance); S0 made `pickInitialNavigationNodeId()` return `null` on zero nodes and `MuseumStateStore` tolerate a null/empty active node |
| Preview | `H1AppBar.canPreviewTour` checks only interaction/transaction/playback locks — **not** route validity; `startTour` silently no-ops when `#readCameraTimeline()` returns null |
| Reset | `store.resetToCheckedInDocument()` hardcodes `importDocument(museumSceneDocument)` (Chopin); `resetLayoutPreview(state)` already resets to `'empty'` + `createEmptyLayoutDocument()` |
| Import | `store.importDocument(doc)` validates + replaces the *scene* document and clears history/selection; full-project package import/export is S9/S11 |
| Room resolver | `createMuseumEditorStore({ rooms })` is typed `LayoutRoomRegistry` (S1 close) — S2 passes `createLayoutRoomRegistry(project.layout)` |

Key fact: the **store** is scene-only (document + resolved scene + history +
selection); the **layout preview state** is layout-only; the **project**
(layout + scene) is composed at the shell (`H1EditorApp`). Boot-blank is
therefore a shell-level coordination, not a store rewrite.

## Target

```text
H1 editor boots
  → construct createEmptyMuseumProject({ id, name })   (session-only id/name)
  → store = createMuseumEditorStore({
        document: project.scene,
        rooms: createLayoutRoomRegistry(project.layout)
      })
  → layoutPreview = empty (baselineKind 'blank')
  → opens Plan (viewMode = 'plan')
  → 3D shows the neutral free camera; no navigation node persisted
  → Preview Tour disabled until a valid route exists
  → Reset restores the empty project (scene + layout), clears history/selection
```

- Boot is blank on **every** load. There is no New Project command; Import is
  the only way to load prior work and Export the only save (S9/S11 implement
  the package; S2 only owns the boot + reset path).
- The free camera is the existing neutral OrbitControls pose. Nothing is
  written to `scene.navigationNodes` / `scene.connections` on boot.
- Preview gating is a *derived predicate* on the store, not a try/catch around
  `startTour`.

## Locked decisions

### The empty project is composed once at the shell

- `H1EditorApp` builds `createEmptyMuseumProject({ id: 'project:untitled',
  name: 'Untitled project' })` once per session and seeds both surfaces from
  it. The store keeps its scene-only shape; the layout preview keeps its
  layout-only shape.
- The id/name are session-only defaults (export lets the user name the
  package later — S9/S11). They are never persisted on boot.

### Free camera = existing neutral OrbitControls pose

- No fake navigation node or generated endpoint is authored. The 3D view
  reuses `EditorCameraRig`'s neutral pose; `MuseumStateStore` already tolerates
  a null initial node (S0).
- Authoring the first node/connection is the only thing that gives the camera
  a persisted pose.

### Preview is gated on a valid route, not a guard clause

- Expose a store predicate (e.g. `canStartTourPreview` derived from
  `getCameraTimeline() !== null`). `H1AppBar.canPreviewTour` requires it, so
  the button is **disabled** on a blank project instead of silently no-oping.
- "Preview Museum" (`<a href="/museum">`) is the frozen Chopin visitor — it is
  not the user's project. On a blank project it stays the relic link; the
  north-star visitor-preview-of-your-draft is out of scope for H1.

### Reset restores the boot document, not Chopin

- `resetToCheckedInDocument()` must reset to the document the store was
  constructed with (the empty scene), not the hardcoded `museumSceneDocument`.
- Reset is atomic across both surfaces: scene reset + `resetLayoutPreview`
  both clear their histories/selection and restore baselines to "blank".

### Import/export stays S9/S11

- S2 keeps the existing scene-level `importDocument` clear-history/selection
  behavior but does **not** build the portable package manifest, project-local
  asset registry, or legacy/Chopin rejection policy. Those are S9/S11; S2 only
  guarantees that a reset-to-empty after import restores a valid blank state.

## Implementation steps

### 0. Turn the S2 contracts into real tests

In `tests/lib/editor/h1/contracts.test.ts`, replace the remaining S2 `it.todo`s
with green tests:

- **Boot-blank session camera** — `createMuseumEditorStore({ document:
  createEmptyMuseumProject(...).scene, rooms: createLayoutRoomRegistry(empty
  layout) })` boots with `navigationNodes === []`, `state.activeNodeId === ''`,
  and no node persisted after construction.
- **Preview lockout** — the store's preview predicate is false on a blank
  project (no valid timeline) and becomes true once a valid node/route exists.
- **Reset** — after a mutation, `resetToCheckedInDocument()` restores the empty
  document and clears history (`canUndo === false`).
- **Playback lock (view-switch half)** — `setWorkspace` is rejected while
  playback mutation is blocked (already enforced by `setWorkspace`'s
  `isDocumentMutationBlocked` guard; pin it now).

Flip `EditorViewState`'s default in the same pass and update
`editor-view-state.test.ts` (it currently asserts `viewMode === '3d'`).

### 1. Store boot-blank + reset-to-boot

- Construct the store with `document: project.scene` and
  `rooms: createLayoutRoomRegistry(project.layout)` in `H1EditorApp`.
- Change `resetToCheckedInDocument()` to reset to the **initial** document
  captured at construction (the S0-injected document, defaulting to the
  checked-in Chopin scene only for the relic/full editor), instead of the
  hardcoded `museumSceneDocument`.
- Add `canStartTourPreview` (derived from `getCameraTimeline() !== null`) to
  the store surface.

### 2. Layout preview boots empty

- Add a `createEmptyLayoutPreviewState()` factory (or reuse
  `resetLayoutPreview` immediately after `createLayoutPreviewState()`).
  `H1EditorApp` seeds the layout surface from `project.layout` with
  `baselineKind === 'blank'` so the blank boot is not "dirty".

### 3. Shell wiring + default Plan

- `H1EditorApp` composes the empty project once and seeds both surfaces from
  it; `EditorViewState` defaults to `'plan'`.
- Update the app-bar subtitle from the hardcoded `museum-scene.json` to the
  session project name (or "Untitled project").

### 4. Preview gating

- `H1AppBar.canPreviewTour` requires `store.canStartTourPreview` in addition to
  the existing interaction/transaction/playback locks. On a blank project the
  "Preview Tour" button is disabled with an explanatory title.

### 5. Reset action

- Wire the Project-menu reset (and the sidebar "Reset empty") to the
  boot-document reset on both surfaces — scene via `resetToCheckedInDocument()`
  (now boot-targeted) and layout via `resetLayoutPreview`.

### 6. Cleanup

- Delete the now-dead `loadChopinLayoutPreview` (its only call site — the
  "Reload Chopin preview" button — was removed in S1), or leave it with a
  S9-cleanup note if S9 still references it.

### 7. Regression + manual QA

- Full suite + `svelte-check` + production build.
- Manual: boot at `/` opens an empty Plan; switch to 3D shows the neutral free
  camera with no crash; Preview Tour is disabled; draw a room and switch to 3D
  to see the draft; author a node + connection and confirm Preview Tour enables;
  reset returns to the empty project; `/museum/editor` + `/museum` still render
  the frozen Chopin relic unchanged.

## Regression matrix

| Concern | Required assertion |
|---|---|
| Boot | Editor boots an empty project (0 rooms / 0 entities / 0 navigation nodes) and opens Plan |
| Free camera | Switching to 3D uses the neutral orbit pose; no navigation node/endpoint is persisted |
| Preview lockout | Preview Tour disabled until a valid route exists; no broken tour on a blank project |
| Reset | Reset restores the empty project on both surfaces and clears history/selection/baselines |
| Room drafting | Drawing a room works before any scene entity or navigation node exists |
| Relic isolation | `/museum` + `/museum/editor` stay frozen (Chopin); H1 never migrates Chopin state |

## Non-goals (deferred)

- Portable package manifest, project-local GLB import, and import/export
  round-trip (S9/S11).
- Account/session persistence (future; export is the only save in H1).
- Replacing `/museum` (still the frozen Chopin visitor) with a
  preview-your-draft visitor.
- Legacy/Chopin migration of scene, workspace, selection, or history.

## Verification

```text
npm test -w @portfolio/museum
npm run check -w @portfolio/museum
npm run build -w @portfolio/museum
```

Plus the manual blank-boot QA in step 7. The S2 `it.todo` contracts in
`tests/lib/editor/h1/contracts.test.ts` turn green; `editor-view-state.test.ts`
is updated for the `'plan'` default.
