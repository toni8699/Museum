# P21 — Unified Project Shell + Spatial UI reconciliation

**Status:** proposed — for review, no code. **Date:** 2026-09-04. **Depends on:** P20 shipped.
**Source:** `docs/Design-specs/Design-Plan(P21+).md` (P21+ target authority) + `P21-visual-implementation-references.md` + `Design-png/P21/*` + current `main` audit below.
**Purpose:** implement the two-row project shell **and** reconcile the existing Spatial editor + Visitor Preview to the canonical P21 visual compositions — not merely move controls into two header rows.

Strict P21 exposes only `Spatial` in project navigation. `Experience / Assets / Publish` routes/placement stay reserved; their Future PNGs are visual direction only.

---

## 1. Outcome

P21 leaves the editor with this persistent structure:

```text
ROW 1 — Project Row: 36px
project identity · persistence location · save state · document menu
· project navigation (Spatial only) · history · Visitor Preview · theme/account

ROW 2 — Workspace Ribbon: 32px
active workspace routing · contextual authoring tools · precision/view controls

Status bar: 24px
```

And reconciles these surfaces to the canonical compositions:

```text
Scene → Plan → Layout      (Design-png/P21/scene-plan-layout.png — shell/chrome master)
Scene → Plan → Arrange     (Design-png/P21/scene-plan-arrange.png)
Scene → 3D                 (Design-png/P21/scene-3d.png)
Camera → Plan              (Design-png/P21/camera-plan.png)
Camera → 3D                (Design-png/P21/camera-3d.png)
Visitor Preview            (Design-png/P21/Preview.png)
```

Authority order for conflicts:

```text
source + tests
→ architecture / ownership invariants
→ Scene / Camera workspace behavior specs (§6–§13)
→ Design-Plan(P21+).md
→ Design-specs.md
→ P21-visual-implementation-references.md
→ Design-png/P21/*
→ legacy visual references
```

**Behavior beats pixels.** A PNG never redefines selection/history, Layout/Scene ownership, room-local transforms, Plan X/Z+yaw authority, camera topology, Sequence ordering, per-direction timing, preview scopes, Timeline semantics, asset persistence, visitor/editor isolation, or orientation behavior. Minor generator artifacts (orientation-cube styling, omitted sidebar rows, decorative details) are non-requirements.

Out of scope: Experience internals, Assets management workspace, Publish internals, IndexedDB durable drafts, cover-generation pipeline, hosting/deployment. No dead `Experience | Assets | Publish` tabs. Project Hub strict baseline omits the cover shelf (`Future/project-hub-cover-enabled.png` stays future direction).

---

## 2. Existing APIs and ownership (reuse, do not rewrite)

- Shell state: `apps/editor/src/lib/editor/app/editor-view-state.svelte.ts` (`domain:scene|camera`, shared `view:plan|3d`), `app/editor-view-mode.ts`, `store/session-state.svelte.ts:112` (`currentWorkspace/leftPanel/timeline`, `setWorkspace()`), `editor-store.svelte.ts:2065` facade + preview teardown, `app/active-editor-selection.svelte.ts` (single active `scene|camera|layout`), `store/selection-store.svelte.ts` + `store/selection-actions.svelte.ts`.
- Shell composition: `app/EditorApp.svelte:1475-1586` (`EditorAppBar / EditorSidebar / PlanWorkspace / CameraPlanWorkspace / Workspace3DView / EditorCameraTimelineFrame / EditorInspector / StatusBar`), `app/EditorAppBar.svelte`, `lib/editor/EditorProjectMenu.svelte`, `routes/project/[projectId]/+layout.svelte`, `lib/editor/theme.svelte.ts`, `styles/tokens.css:140-141` (`--editor-appbar-height:56px`, `--editor-status-height:32px` — P21 migrates to 36/32/24).
- Plan: `app/PlanWorkspace.svelte`, `layout/LayoutDraftToolbar.svelte`, `layout/LayoutPlanViewport.svelte`, `layout/PlanSvg.svelte`, `layout/arrange-hit.ts`, `layout/layout-interaction.ts` (`planViewMode: layout|staging` internally; P10 user label is `Arrange`), `layout/plan-hit.ts`, `layout/plan-scene-hit.ts`, `layout/plan-overlays.ts`, `layout/PlanCanvasChrome.svelte`.
- 3D: `app/Workspace3DView.svelte`, `lib/editor/EditorTransformControls.svelte`, `gizmo/EditorTransformControlsHost.svelte` (sole owner) + `gizmo/*-adapter.svelte.ts`, `lib/editor/EditorOrientationGizmo.svelte` + `EditorOrientationGizmoProjector.svelte` (scene-only top-right).
- Camera: `app/CameraPlanWorkspace.svelte`, `camera-plan/CameraPlanViewport.svelte`, `camera-plan/CameraPlanToolbar.svelte`, `camera-plan/camera-plan-state.svelte.ts`, `camera-plan/camera-plan-hit.ts`, `app/CameraSidebar.svelte` + `lib/editor/CameraFlowPanel.svelte`, `app/CameraPlanInspector.svelte`, `camera/EditorCameraInspector.svelte` + `camera/EditorCameraRig/Helpers/PathHelpers/ViewHelpers/FramingHelpers/*`, `camera/editor-camera-timeline.ts` (2 backing lanes → 5-lane projection), `camera/EditorCameraTimelineFrame/Panel/Ruler/Dots.svelte`, `store/camera-timeline-controller.svelte.ts`, `store/camera-preview-controller.svelte.ts`, `store/camera-preview-commands.svelte.ts`, `store/mutation-guards.svelte.ts:32`.
- Sidebar/Inspector: `app/EditorSidebar.svelte`, `lib/editor/UnifiedProjectTree.svelte` + `unified-project-tree-model.ts`, `lib/editor/EditorAssetLibrary.svelte`, `lib/editor/EditorInspector.svelte` + `EditorTransform/Material/Light/Primitive/PlacementInspector`, `fields/*`.
- Persistence/history: `lib/editor/project-persistence.ts` (sole cloud boundary), `store/document-store.svelte.ts`, `layout/layout-preview-state.svelte.ts:127,145,158,264`, `store/history-controller.svelte.ts` (chronological tagged `scene|layout`, 100 limit), `store/project-export-store.svelte.ts`, `project-asset-load/upload.ts`. Dirty = `store.isDirty || layoutPreviewIsDirty || nameDirty` (`EditorApp.svelte:344,368,1095-1335`).
- Routes: `routes/+page.svelte` (`/` entry, `intent=projects|save` handoff), `routes/projects/+page.svelte` (Hub), `routes/editor/+page.svelte` (redirect), `routes/project/[projectId]/spatial/+page.svelte` (mounts `EditorApp`), `routes/museum/+page.svelte` (frozen Chopin visitor), `routes/museum/editor/+page.svelte` (relic). No `/project/:id/preview` yet — preview is in-editor FSM today; Row1 `Preview Museum → /museum` is temporary pre-P21 behavior.
- Isolation: `apps/museum/scripts/verify-visitor-bundle.mjs`; museum deps only `@portfolio/camera-core|layout-core|project-model` + threlte/three. One nav/motion (`camera-route.ts` + `camera-motion.ts` only). Svelte 5 runes, strict TS, Threlte/Three stay.

---

## 3. Current-state audit (pre-P21, per surface)

### Shell frame

Single 56px `EditorAppBar` mixes domain + view + dirty + Undo/Redo + `Preview Museum → /museum` + theme + `EditorProjectMenu` (rename/save/auth hidden in dropdown). Route `+layout.svelte` is a thin `Projects | id | Spatial` bar. No Row1/Row2 split, no location/save-state split, no Spatial-only nav, no `▶ Preview` takeover entry.

### Floating toolbars → Row 2 sources

`LayoutDraftToolbar` (floating top-left: `Layout|Arrange`, `Plan|3D`, `Select|Rect|Poly`, Snap/Grid/Tour/Ceiling, Cancel) · `CameraPlanToolbar` (floating centered: `Select|View`, Add Camera, Connect, Grid/Snap) · `EditorViewportToolbar` (floating top-left 3D: `Select|Move|Rotate|Scale(+chain)`, Add camera in camera ctx, View menu, Local/World nearby) · `EditorViewportGridControls` (bottom) · `PlanCanvasChrome` (SVG grid/rulers — stays viewport-local) · `EditorPlacementTools` (in-canvas).

### Scene Plan

`PlanWorkspace + LayoutPlanViewport + PlanSvg` with guarded mutations, owner-aware `resolveArrangeHit` (containment → active-owner-selected → Scene L6 over Layout L5 → render order; Scene-only 6px halo), X/Z/yaw drags, yaw handle (Scene pivot `[0,0]`; Layout pivot world pivot; Shift 15° snap), owner-routed Delete, tagged single-entry history. No ghost watermark; Inspector is Place/Objects/Selection accordions (needs primer + owner-aware density). Internal `staging` id vs `Arrange` label.

### Scene 3D

Unified Threlte `Workspace3DView`, sole `EditorTransformControlsHost`, scene-only top-right orientation gizmo, blue outline + RGB gizmo. Behavior complete; needs ribbon re-host + Inspector density + status strings only.

### Camera Plan / 3D + Timeline

Backdrop + graph + per-direction edge timing (`speed = length/time`, duration preserved on re-path) + Y-preserving drags + 4-section sidebar + shared selection + Camera-domain Timeline (scope/transport/lanes per P12; 2-model → 5-lane projection; heights 288/240–300/48) all ship. Toolbars floating; sidebar/Inspector/Timeline need density/placement reconciliation only. Camera Plan must never gain FOV/frustum/look-target; Camera 3D keeps full XYZ + framing/path overlays.

### Persistence / Hub / Preview

Dirty/save/auth/history/selection/timeline/camera-pose all live in existing stores (see §2). Hub (`routes/projects/+page.svelte`) is functional (authed table, guest callout, one-click New → `/project/project:<uuid>/spatial`, Open → `?load=1`); no covers, no fake drafts — correct strict baseline. Preview has no route; visitor isolation enforced by bundle verifier.

---

## 4. Gap matrix

| Surface | Current | P21 target | Behavior impact | Visual impact | Files involved | Risk |
|---|---|---|---|---|---|---|
| Project Row (36px) | Single bar + dropdown menu; `Preview→/museum`; no location/save split; route `+layout.svelte:13-22` always renders its own 44px shell-bar | `← Projects \| name✎ \| [Local Session\|Cloud] \| [Session active\|Saved\|Save\|Saving\|Save Blocked] \| ⋮ \| Spatial \| ↺↻ \| ▶ Preview \| theme \| avatar` (Row 1 replaces the layout shell-bar; no nested triple-row) | None (re-host; history = same tagged stack) | High | New `ProjectRow.svelte` + `ProjectShellHost`; P21.1 owns `routes/project/[projectId]/+layout.svelte`; slices of `EditorAppBar/EditorProjectMenu/EditorApp`; `tokens.css` | Med |
| Workspace Ribbon (32px) | 3 floating toolbars + app-bar switches | ZoneA fixed `Scene\|Camera + Plan\|3D` · ZoneB contextual, starting with `Layout\|Arrange` on Scene Plan · ZoneC Snap/Grid/View; no floating permanent toolbars | None (re-host; Timeline stays dock) | High (28px dark-segmented, blue text) | New `WorkspaceRibbon*.svelte`; decompose 3 toolbars | Med |
| Scene Plan Layout | Floating toolbar (`LayoutDraftToolbar.svelte:71-86` exposes only Select/Rect/Poly + Snap/Grid/Tour/Ceiling today); no ghost; accordion Inspector; standalone Wall + Measure commands do not exist (spec §6 lists them as canonical capabilities) | 10×8m dashed ghost (`#64748B` 20%, `pointer-events:none`, session-dismiss, not serialized) + primer Inspector + Row2 `Select \| Rect Room \| Poly Room \| Door \| Window` (supported opening controls only) + hierarchy + status. Standalone Wall creation + Measure are explicitly deferred (walls are room-derived; Measure has no owner) — no dead controls rendered, no new Wall/Measure implementation in P21.2 | None (presentation; Wall/Measure deferral is a recorded contract decision, not a silent cut) | High | `PlanWorkspace/LayoutPlanViewport/PlanSvg/plan-overlays/EditorSidebar/EditorInspector/StatusBar` + new ghost/primer | Low |
| Scene Plan Arrange | Owner-aware behavior ships | Row2 `Select Delete + Snap/Grid/View`; Scene+Layout hierarchy; owner-banner Inspector (X/Z/Yaw editable, Y preserved, scale read-only); one yaw handle | Zero transform-model change | Med | Same Plan files + Inspector/StatusBar | Low-Med |
| Scene 3D | Behavior ships | Row2 `Select Move Rotate Scale Add Asset \| Local/World \| snaps \| View`; same viewport/gizmo/cube; Inspector density; no Timeline | None | Med | `Workspace3DView/TransformControls*/OrientationGizmo/EditorInspector/StatusBar` | Low |
| Camera Plan | Behavior ships; toolbar floating | Row2 `Select Add Camera Connect View \| Snap/Grid`; sidebar 4 sections; inert footprints; undirected edges + duration labels; per-direction Inspector; expanded Timeline dock | None (timing/topology/Y rules intact) | Med-High | `CameraPlanWorkspace/Viewport/CameraSidebar/FlowPanel/CameraPlanInspector/Timeline*` | Med |
| Camera 3D | Behavior ships | Row2 `Select Move Rotate Add Camera Path Frame View \| Observer/POV \| Snap`; same sidebar/selection/timeline; FOV/LookAt/Roll Inspector | None (one timeline/state) | Med | `Workspace3DView/camera/*, EditorCameraInspector, Timeline*` | Med |
| Timeline | P12 behavior ships; 2→5-lane projection | Keep P12 verbatim; retain the current transport above the lanes and shared dock geometry in Plan/3D; density only (label 120px, ruler 28px, lanes 44/48/34/34/32; 48px mini-player; `+View Key` 3D-Sequence only) | None | Med | `EditorCameraTimeline*.svelte`, `timeline.css` | Low |
| Inspector/sidebar | Correct routing; pre-P21 styling; internal `staging` | Stable shell + header/groups grammar; edge-to-edge panels (radius 0); user label `Arrange` everywhere | None | Med | Inspectors, `EditorSidebar/CameraSidebar/UnifiedProjectTree` | Low |
| Status bar | Correct content; 32px | 24px; per-workspace strings (Arrange `Yaw Snap 15°`, Camera Plan `Y Preserved`) | None | Low | `StatusBar.svelte`, `tokens.css` | Low |
| Visitor Preview | No route; FSM preview only; `EditorApp` mounted per spatial page and boots blank (`spatial/+page.svelte:22`, `EditorApp.svelte:121-126`) | Layout-owned takeover keyed by projectId (A→B tears down full session; no cross-project retention): transient validated in-memory document snapshot for the visitor viewport; Esc/`✕ Exit` restores workspace/domain/view/mode/selection/Timeline/camera/session exactly from the retained owner; spatial grid unmounted during preview, pill-only chrome; generic composition only (bespoke `MuseumScene` frames + Chopin `MuseumHUD` forbidden) | Session-hoist + adapter/coordinator; no `/museum` change; no history/baseline mutation | High | `+layout.svelte` (takeover switch, projectId-keyed owner) + new preview surface + snapshot/coordinator (generic `CameraDirector` + compiled-layout shell + generic entity renderer; P21.4 brief pins generic nav UI or keyboard-only limit); preview-surface import-closure bundle gate (below) | High |
| Project Hub | Functional, no covers | Strict: authed full-height table (no Recent shelf), guest callout (no fake drafts), one-click New | None | Low | `routes/projects/+page.svelte`, `routes/+page.svelte` | Low |

---

## 5. Proposed component architecture (incremental)

Session owner lives in the shared route layout; Spatial and Preview are
rendered surfaces over that owner — never sibling `EditorApp` mounts.
Navigating `spatial ↔ preview` must not destroy document, history,
selection, camera, Timeline, or session state (`spatial/+page.svelte:22`
mounts `EditorApp` today and `EditorApp.svelte:121-126` boots blank, so a
sibling preview route would lose unsaved state).

```text
routes/project/[projectId]/
├─ +layout.svelte            (OWNS session: mounts ProjectShellHost once;
│                             replaces the 44px shell-bar with Row 1;
│                             switches spatial surface ↔ preview takeover)
├─ spatial/+page.svelte      (surface intent only; no EditorApp mount)
└─ preview/+page.svelte      (surface intent only; no second session)

ProjectShellHost (NEW; lives in +layout.svelte, mounted once per projectId)
├─ ProjectRow.svelte (NEW = Row 1, replaces shell-bar header)
│  ├─ re-host: name edit + ⋮ overflow (from EditorProjectMenu)
│  ├─ re-host: persistence cluster (selectors from EditorApp)
│  ├─ re-host: Undo/Redo (history-controller)
│  ├─ new: Spatial-only nav (future routes reserved in comments, not rendered)
│  ├─ new: ▶ Preview entry (→ /project/:id/preview)
│  └─ re-host: theme + avatar/sign-in
├─ WorkspaceRibbon.svelte (NEW host)
│  ├─ ZoneA: DomainSwitch + ViewSwitch (fixed 240px)
│  ├─ ZoneB: LayoutArrangeSwitch (Scene Plan only), then
│  │         ScenePlanLayoutTools / ScenePlanArrangeTools /
│  │         Scene3DTools / CameraPlanTools / Camera3DTools (re-hosted logic)
│  └─ ZoneC: Snap/Grid/View precision (re-hosted)
├─ WorkspaceBody (existing left/viewport/inspector grid)
│  ├─ left: EditorSidebar / CameraSidebar — reused
│  ├─ viewport: PlanWorkspace / Workspace3DView / CameraPlanWorkspace — reused
│  │           (floating wrappers deleted; PlanCanvasChrome/gizmos/handles/
│  │            frustums/anchors/targets/labels stay viewport-local)
│  └─ right: EditorInspector + CameraPlanInspector — reused, density CSS
├─ EditorCameraTimelineFrame (Camera only) — reused, density CSS
├─ StatusBar (24px) — reused
└─ VisitorPreviewSurface (NEW; rendered INSTEAD of the spatial grid when
    preview intent is active: generic visitor composition only —
    CameraDirector + compiled-layout shell + generic entity renderer;
    never the full bespoke MuseumScene with its fixed
    entrance/poland/paris/departure/workshop/music-chamber/legacy frames
    (MuseumScene.svelte:119-140); no editor overlays)
```

Verdict: `EditorAppBar` → split then delete; `EditorProjectMenu` → dissolve into Row1 + ⋮ then delete; `+layout.svelte` shell-bar header → replaced by Row 1 (P21.1 owns the layout; Preview bypasses spatial chrome via the layout-owned takeover switch); 3 floating toolbar wrappers → logic moved to Row2 groups, positioning deleted; all viewports/sidebars/inspectors/timeline/controllers/stores → reused; `ProjectShellHost/ProjectRow/WorkspaceRibbon/tool-groups/ghost/primer/preview-surface+coordinator` → new; `Preview Museum → /museum` → deleted; future tabs → not rendered.

### Row 2 migration classification

- A. Row 2 command: `Select/Rect Room/Poly Room/Door/Window` (supported openings only; standalone Wall + Measure deferred — §4), Arrange `Select/Delete`, 3D `Select/Move/Rotate/Scale/Add Asset/Local/World`, Camera `Select/Add Camera/Connect/View/Path/Frame`, `Layout|Arrange`, `Scene|Camera`, `Plan|3D`, Snap/Grid/Ceiling/Tour toggles, View menus.
- B. Viewport-local spatial affordance (stays): transform gizmos, orientation widget, Plan yaw handle, camera frustums/paths/anchors, look targets, placement ghosts, Plan grid/rulers/scale bar, hover/selection outlines.
- C. Obsolete/duplicate: floating toolbar positioning/styling, `Preview Museum → /museum` link, saturated-block segmented styling, interim amber Layout-object selection, permanent Move/Rotate modes in Arrange/Camera Plan.
- D. Deferred: Experience/Assets/Publish tool groups, cover pipeline, placement-ghost 2D slice, Timeline zoom.

---

## 6. State/data-flow plan

No new sources of truth. Rows read existing stores; only menus/inline-edit drafts/preview capture are new presentation state.

```ts
// ProjectRow selectors only — existing logic reused
const location = currentProjectIsOwned ? 'cloud' : 'local'; // Local Session | Cloud
const save = saveBlocked ? 'blocked' : saving ? 'saving'
  : projectIsDirty ? 'dirty' : 'clean';                     // pill
// Save click → existing submitSaveSnapshot(); guest dirty → existing saveAuthGate
```

```svelte
<!-- Ribbon routes; never owns -->
{#if domain==='scene' && view==='plan' && planMode==='layout'}
  <ScenePlanLayoutTools {...existingDraftToolProps} />
{:else if domain==='scene' && view==='plan'}
  <ScenePlanArrangeTools onDelete={ownerAwareDelete} />
{:else if domain==='scene'} <Scene3DTools ... />
{:else if view==='plan'} <CameraPlanTools ... />
{:else} <Camera3DTools ... />
```

Preview: the session owner stays mounted in `+layout.svelte` across
`spatial ↔ preview` (never a sibling `EditorApp` remount). Enter captures
`{domain,view,planMode,selection,timeline,editorCameraPose,session}` for
restore + `validateProject(derivePreviewBundle(...))` transient document
snapshot for the visitor viewport (memory only, guests/unsaved preview
without Save). Exit restores the captured session exactly, discards the
snapshot, never `markSaved`/clears history. The preview surface renders the
generic visitor composition only (`CameraDirector` + compiled-layout shell +
generic entity renderer); bespoke `MuseumScene` room frames are forbidden.

Per-concern verdict — all **re-host** existing behavior: dirty, baseline, guest/session, cloud ownership, save-flight, blockers, rename, doc menu, Google auth, undo/redo, domain, view, Layout/Arrange mode, selection, Timeline, camera pose. **Add** presentation only: pills/nav/menus/ribbon grouping/ghost-primer dismissal/preview capture.

---

## 7. Implementation slices

Four implementation slices; the named work areas within each slice are acceptance coverage, not separately numbered slices. Each slice includes its relevant tests and visual/accessibility QA.

### P21.1 — Shared shell

Dependencies: P20 shipped.

**Tokens and primitives.** Outcome: 36/32/24 chrome, 28px Row2 controls, dark-navy bands, `#2F8CFF` accent, dark-segmented active (dark surface + blue text), Inter density, 4–6px radii, edge-to-edge panels. Files: `styles/tokens.css` (`--editor-bg-row-1/2`, row heights, `--editor-status-height:24px`), `editor-shell/controls/inspector/timeline/plan.css`. Must not change behavior (`#3B82F6` stays axis-Z). Tests: `check`, contrast/keyboard spot. QA: measure rows; segmented not saturated. Done: tokens + primitives integrated.

**Project Row and session ownership.** Outcome: `ProjectRow` with identity/persistence/history/Preview/theme/avatar; Spatial-only nav; ⋮ overflow; route layout shell-bar replaced (no triple-row); session owner keyed by projectId with explicit A→B teardown (no cross-project retention — `EditorApp.svelte:118-119` one-shot init must become a keyed lifecycle). Files: new `ProjectRow.svelte` + `ProjectShellHost`; own `routes/project/[projectId]/+layout.svelte` (session mount + spatial/preview switch); slices of `EditorAppBar/EditorProjectMenu/EditorApp`. Must not fork save/auth/history logic; no Exp/Ass/Pub tabs. Tests: persistence-presentation units (location vs pill; blocked/saving/dirty/clean) + layout owns single session mount + project-switch teardown regression. QA: Row1 vs Layout PNG (36px, no residual 44px bar); legacy preview link gone. Done: Row1 matches spec with existing behavior.

**Workspace Ribbon.** Outcome: Ribbon Zones A/B/C; fixed 240px Zone A contains only Scene/Camera + Plan/3D; Layout/Arrange leads contextual Zone B on Scene Plan; floating permanent toolbars removed. Files: new `WorkspaceRibbon*.svelte` + contextual tool groups; decompose `LayoutDraftToolbar/CameraPlanToolbar/EditorViewportToolbar`; touch `PlanWorkspace/CameraPlanWorkspace/Workspace3DView`. Must keep §16 capability matrix; Timeline never in Row2. Tests: domain/view/mode switching; Arrange owner routing. QA: all 5 tool states in Row2; Zone A position/width stays fixed across domain/view/mode switches; zero permanent floating toolbars. Done: ribbon owns all permanent commands.

### P21.2 — Scene reconciliation

Dependencies: P21.1.

**Plan Layout/Arrange.** Outcome: ghost + primer + hierarchy + supported openings + status; Layout vs Arrange differentiation. Standalone Wall creation + Measure stay deferred per §4 (no dead controls, no new implementation). Files: Plan files + `EditorSidebar/EditorInspector/StatusBar` + new ghost/primer. Must not change X/Z/yaw authority, Y preservation, read-only scale, single tagged entry, no cross-owner selection. Tests: arrange-hit/owner/tag/Y-preserve suites + Row2 exposes exactly `Select | Rect Room | Poly Room | Door | Window` (no Wall/Measure buttons). QA: `scene-plan-layout.png` (empty) + populated Layout reference. Done: no dead controls, no modal.

**Scene 3D.** Outcome: ribbon + density + status; viewport/gizmo/cube untouched. Files: `Workspace3DView/EditorTransformControls*/EditorOrientationGizmo/EditorInspector/StatusBar`. Must not rewrite gizmo/selection/snap/history. Tests: gizmo/selection/outline suites. QA: `scene-3d.png` (ignore cube styling). Done: composition matches, behavior identical, no Timeline.

### P21.3 — Camera reconciliation

Dependencies: P21.1.

**Camera Plan and shared Timeline.** Outcome: sidebar/Inspector/footprints/undirected edges/timing + Timeline density. Files: Camera Plan files + `CameraSidebar/FlowPanel/CameraPlanInspector/Timeline*`. Must preserve undirected topology, per-direction timing, Y preservation, Camera-only Timeline, shared selection. Tests: topology/Sequence/timing/Y/timeline-continuity. QA: `camera-plan.png` with expanded Timeline. Done: no FOV/frustum/look-target leak into Plan.

**Camera 3D.** Outcome: ribbon (Observer/POV) + FOV/LookAt/Roll Inspector + restrained overlays; same sidebar/timeline/selection. Files: `Workspace3DView/camera/*`, `EditorCameraInspector`, `Timeline*`. Must keep full XYZ authority; one timeline/state. Tests: shared-state suites. QA: `camera-3d.png`. Done: Plan↔3D preserves selection/timeline.

### P21.4 — Preview + project flows

Dependencies: P21.1; final integration verifies P21.2–P21.3.

**Visitor Preview.** Outcome: layout-owned takeover + coordinator + generic visitor surface (P21.4 brief required before code). Files: `+layout.svelte` takeover switch + retained session owner keyed by projectId (A→B tears down the full session — document, history, selection, camera, Timeline, asset contexts, pending requests — and mounts fresh; SvelteKit may reuse the layout while `EditorApp.svelte:118-119` initializes its ID only once via `untrack`, so direct A→B navigation must not retain project A's session); new preview surface + snapshot/coordinator (generic `CameraDirector` + compiled-layout shell + generic entity renderer; bespoke `MuseumScene` room frames and Chopin-specific `MuseumHUD` forbidden — P21.4 brief must name the generic node-navigation surface or explicitly limit P21 preview to keyboard/default spatial navigation); Editor-build preview-surface bundle gate (new check tracing the isolated `VisitorPreviewSurface` import closure — NOT the effective `/preview` route closure, which necessarily contains editor/session code via the parent layout — forbidding `editor/` session/selection/history/gizmo/inspector/timeline stores; rerunning the `/museum`-only `verify:visitor-bundle` is insufficient). Must not expose gizmos/handles/Inspector/Timeline/debug transport; must not modify frozen `/museum`; session (not just document) restored exactly. Tests: sibling-navigation state-loss regression (preview round-trip preserves unsaved document + history + selection + camera/session); project-switch regression (direct A→B navigation mounts B clean with no A state); enter/exit restore + isolation (museum gate + preview-surface closure gate). QA: `Preview.png` (pill-only chrome; bottom nav illustrative until Experience — brief pins actual P21 nav scope). Done: Esc restores exactly with owner still mounted.

**Hub and project flows.** Outcome: strict Hub (no Recent shelf) + entry/OAuth/`?load`/`?resume-save` intact. Files: `routes/projects/+page.svelte`, `routes/+page.svelte`, `routes/editor/+page.svelte`. Must not invent fake drafts or cover pipeline. Tests: route/auth/handoff. QA: guest + authed + New flows. Done: Hub + entry green.

### Final acceptance gate

After all four slices, run full Vitest + `check` + `build` + `verify:visitor-bundle` + VisitorPreviewSurface import-closure gate + axe sweep, and complete the six-reference visual comparison in §9, including shared-frame consistency, reduced-motion, keyboard, and contrast checks. Each implementation slice includes its own relevant visual/accessibility checks; this gate verifies the integrated result and closes the tracker. Fix findings in the owning slice without introducing new behavior scope.

---

## 8. Test strategy

Keep green: full Vitest (176 files / 2351 passed), `check` (editor+museum+camera/layout/project-model+api), `test:api` (23), `build`, `verify:visitor-bundle`, P20 Load (22) + cloud-save predicate + package-fidelity, Arrange hit/owner/tag, camera route/motion, timeline projection, selection continuity, Y-preservation.

Add focused state/component tests (no per-pixel screenshots): layout-owned single session mount keyed by projectId + project-switch teardown (A→B mounts clean, no retained session) + preview round-trip without state loss · domain/view switching · Layout/Arrange switching · Row2 exposes only supported Layout tools (no Wall/Measure) · selection persistence (Scene Plan↔3D; Camera Plan↔3D; Arrange last-owner, no resurrection) · one gesture = one tagged undo · owner-aware Arrange + Y/scale/ownership rules · Camera shared selection + shared Timeline · undirected connections vs ordered Sequence · per-direction timing preserved on re-path · Timeline Camera-only + P12 scopes/transport · persistence presentation (no duplicated dirty sources) · Preview enter/exit + isolation (museum gate + preview-surface import-closure gate, never the full route closure) · keyboard/reduced-motion. Visual conformance is explicit manual QA vs the 6 PNGs (§9).

---

## 9. Visual QA checklist

Shared-frame acceptance: use `scene-plan-layout.png` as the shared chrome master, the other P21 PNGs for workspace-specific content/composition, and textual dimensions/tokens for CSS sizing. At the same viewport size and panel state, all five editor states must use the same sidebar/Inspector sizing rules, panel framing, header/group grammar, persistence badges, segmented/tab treatments, and control sizing. PNG iteration differences must not introduce workspace-specific shell styles or panel widths. Verify the five states side by side.

Camera Timeline acceptance: retain the mature current shell's transport **above the lanes**, with one shared dock geometry and Inspector/dock boundary treatment across Camera Plan and Camera 3D. The below-lane transport in `camera-plan.png` is iteration drift, not a relocation requirement; P12 scopes/transport behavior remains unchanged.

General: same 36+32 rows + 24px status across all five editor PNGs; Row1 order; 28px dark-segmented; `#F5F3EE` Plan vs dark 3D; `#2F8CFF` accent; edge-to-edge panels; tabular numerals; no floating toolbars; Spatial only.

- `scene-plan-layout.png`: Row2 `SCENE\|Camera PLAN\|3D LAYOUT\|Arrange Select Rect Room Poly Room Door Window Snap` (no Wall/Measure — deferred per §4); `Hierarchy\|Assets`, `Environment/Architecture/No rooms yet`; ghost 10×8m + dims + scale bar; primer (Grid/Units/Tips, no dead buttons); status `X/Z Grid Orthogonal WallSnap Angle Scene>Plan>Layout`.
- `scene-plan-arrange.png`: Row2 Arrange + `Select Delete Snap`; Scene+Layout hierarchy, piano selected; blue footprint + yaw handle; Inspector `SCENE ENTITY` X/Z/Yaw editable, Y preserved + `Edit in 3D`, Scale read-only; status `Yaw Snap 15°`.
- `scene-3d.png`: Row2 `Select Move(active) Rotate Scale Add Asset Local\|World snaps View`; Decor/Lighting/Cameras hierarchy; blue outline + RGB gizmo, existing cube; Inspector Transform/Placement/Material/Visibility; status `Move Local snaps 1 selected`.
- `camera-plan.png`: Row2 `Select Add Camera Connect View Snap Grid`; 4-section sidebar, `1—2` undirected; subdued backdrop, blue sequence / green unsequenced + selected edge `4.00s`; Inspector per-direction Duration/Speed + Path + Valid; 5-lane Timeline + transport above lanes (current shell); status `Y Preserved`. Ignore omitted rows/arrow ambiguity.
- `camera-3d.png`: Row2 + `Observer\|POV`; same sidebar/selection; spline + frustum + look-target restrained; Inspector Transform/Rotation/FOV/LookAt/Roll/Path/Timing+speed; Timeline + `Preview Sequence/Paused/timecode`; status `Observer Sequence paused 1 selected`. Ignore cube text/thumbnail counts.
- `Preview.png`: full-bleed visitor canvas; only `VISITOR PREVIEW Viewing Current Draft ✕ Exit Preview (Esc)` pill + visitor nav; zero editor chrome. P21.4 brief pins whether that nav is a minimal generic node/sequence surface or keyboard/default spatial navigation only — Chopin-specific `MuseumHUD` (`chopinRuntime`, `getChopinRoomPresentation`) is forbidden.

---

## 10. Risks / open questions

1. Preview session ownership — resolved by §5/§6: owner stays mounted in `+layout.svelte`; spatial/preview are surfaces, never sibling `EditorApp` mounts. P21.4 brief must still pin the exact host component and restore fields before code.
2. Preview viewport composition — generic `CameraDirector` + compiled-layout shell + generic entity renderer; bespoke `MuseumScene` room frames (`entrance/poland/paris/departure/workshop/music-chamber/legacy`) are forbidden. Need: generic shell/entity-renderer interface + camera-director props. P21.4 brief pins exact imports.
3. Internal `staging` vs `Arrange` — label-only vs atomic rename. Need: `layout-interaction.ts` + `staging` refs. Default: label-only.
4. Save-pill scope — document baseline only vs including registry-upload state (§C/G say document only). Need: `EditorApp` save block + `project-asset-upload.ts`. Default: document only.
5. Timeline richness — projection CSS vs new Shots/Roll entities. Need: `EditorCameraTimelineDots.svelte:556`, `editor-camera-timeline.ts:56`. Default: projection only.
6. `/museum` freeze + preview isolation gate — deletion of legacy preview link + new preview surface must not touch frozen visitor/relic. Guards: existing `/museum` `verify:visitor-bundle` PLUS a new check scoped to the isolated `VisitorPreviewSurface` import closure (a full `/preview` route closure always contains editor/session code via the parent layout, so it must never be the gate target) + P19.4 intent flow.
7. Project-ID lifecycle — the layout owner is keyed by projectId: A→B navigation tears down document/history/selection/camera/Timeline/asset contexts/pending requests and mounts B fresh. Regression test required; current `EditorApp.svelte:118-119` one-shot `untrack` init must become an explicit keyed lifecycle.
8. Preview nav scope — P21.4 brief names the generic node-navigation surface or explicitly limits P21 preview to keyboard/default spatial navigation; `MuseumHUD` stays Chopin-only.

---

## 11. Acceptance

P21 ships when: layout-owned two-row shell implemented (no residual 44px bar, projectId-keyed session with clean A→B teardown) + existing controls re-hosted in correct rows + permanent floating toolbars removed + all five Spatial compositions match P21 direction and shared-frame acceptance (§9; Camera transport remains above lanes) (Layout Row2 without Wall/Measure per §4 deferral) + Camera Plan/3D share sidebar/Timeline + layout-owned Preview takeover with generic visitor composition (brief-pinned nav scope) and exact session restore — with zero changes to governing behavior contracts (ownership, transforms, topology, Sequence, timing, scopes, Timeline, persistence, isolation). Full Vitest + `check` + `build` (editor+museum) + both bundle gates (existing `/museum` verifier + preview-surface import-closure check, never the full route closure) green; browser smoke covers entry → Hub → New → spatial → save/auth → preview enter/exit (unsaved state preserved) → direct project A→B (no leakage) → refresh/Load.

## 12. Mount, relic, Plan, visitor boundaries

- No second nav/graph/motion/geometry/gizmo/transform/selection/history system. `LayoutDocument` vs `SceneDocument` unchanged; room-local transforms unchanged; no world-space writebacks.
- Plan edits X/Z/yaw only, Y preserved; no Plan scaling/Y/pitch/roll introduced by visual work.
- Connections undirected; Sequence ordered playback subset; direction lives in timing/playback only.
- Timeline stays Camera-domain dock; one instance/state across Plan/3D.
- Preview is a layout-owned takeover over the retained session + transient document snapshot with generic visitor-safe composition; no editor session/selection/history/gizmo/Inspector/Timeline/debug transport leaks into the preview surface. `/museum` + `/museum/editor` behavior unchanged unless a governing plan explicitly migrates them.
- Svelte 5 runes, strict TS, Threlte/Three; existing ownership/lifecycle patterns retained.

## 13. Fallback

Land P21.1 (shared shell) before P21.2 (Scene) and P21.3 (Camera), then P21.4 (Preview + project flows), followed by the final acceptance gate. If a slice expands, use internal implementation checkpoints without creating more numbered slices or weakening acceptance. Do not expose dead Experience/Assets/Publish tabs to fake progress; do not collapse documents to simplify routing; do not fork state to match screenshots. Rollback per slice is CSS/component revert; no migration or document change exists to roll back.

## 14. Explicitly out of scope

Experience internals · Assets management workspace · Publish internals · standalone Wall creation + Measure commands (deferred per §4; walls stay room-derived) · IndexedDB durable local drafts · cover-generation pipeline · hosting/deployment · Timeline zoom · 2D ghost placement · provider search · GLB import · multi-tour/branches · interaction authoring · runtime SDK. Future PNGs are direction only.
