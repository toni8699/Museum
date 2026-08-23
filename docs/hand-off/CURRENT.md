# Current handoff — live working-tree delta

Template per [`../README.md`](../README.md). This is a **sliding window**:
only the immediate previous slice (back-pointer) and the single next action
live here. History chains backward through the tracker's depends-on column.
## Working tree

- Current delta: **P9 shipped 2026-08-23 — docs/PNG-only design reconciliation complete.** The tracker now pins `P7 → P9 → P2 → P3`; live shell/design guidance is direct rather than amendment-layered; P2/P3/P4 are reconciled; `Design-png/README.md` registers the 27 P9 sketches plus authoritative Camera sidebar-accordion and Scene 3D complete-XYZ-gizmo corrections; the superseded P1.8 brief and four redundant Camera PNGs are removed. No runtime/source/test file belongs to P9 or either visual correction.
- P2 pre-implementation rebase: reviewer-confirmed room-local follow semantics, room-aware projection/inverse drag, mode-aware selection, integer Plan layers (Scene layer 6), floor-model/primitive eligibility, imported-GLB deferral to P4, placement-language cleanup, and canonical shell/visual/placement handoff updates. Docs-only; no runtime code changed.
- Carried delta: **P7 complete — all increments shipped 2026-08-23 (P7.1, P7.5, P7.2, P7.3 committed at `2708e94`; this tree carries the P7.6 slice uncommitted + the P7.6 doc updates)**. P7.6 (the museum-vocabulary scrub) landed in five waves, each green: **(1) §4b folder placement** — `git mv` of the 30-file camera surface → `src/lib/editor/camera/`, 3 generic widgets → `fields/` (`EditorCameraFovField` stayed camera-side), 10-test mirror → `tests/lib/editor/camera/`; import rewiring caught a `$lib` perl-interpolation bug mid-wave (the `$l` ate the match — first pass never fired) + one dynamic-import residual in the facade. **(2) Identifier core** — §2 name map + 13 derived functions + seed vars (`MuseumEditorStore`→`EditorStore`, `MuseumSceneDocument`→`SceneDocument`, `MuseumRoomId`→`RoomId`, `MuseumProject`→`Project`, `MuseumStateStore`→`RuntimeStateStore`, `RuntimeMuseumScene`→`RuntimeScene`, …) across live scope; 3 live collisions (locals shadowing `scene`/`rooms` params in `chopin-project`, `assets`, `rooms-to-layout`) aliased; `assetCatalog` rename reverted — the seed IS imported (`assets` stayed, function param took the rename). **(3) §4a rename-required moves** — all 15 (`editor-store.svelte.ts`, `editor-types.ts`, `types/museum.ts`→`scene.ts`, `state/runtime-state.svelte.ts`, `content/scene.json`, `EditorSceneEntities.svelte`, 8 `editor-store-*` test files) + tree-wide path rewrites. **(4) Format hard break** — `.museumpack.zip` → `.scenepack.zip` (src + 7 test expectations), slug fallback `'museum-scene'` → `'scene'`, generator `'museum-editor-5.4'` → `'editor-5.4'`, `museum-layout.json` → `layout.json`; archive member + export filenames were already on `scene.json` (member wave landed with the file rename). **(5) Strings pass** — the 340-line R bucket consumed to exactly the tolerated set: **177 lines / 182 occurrences remain, all P/T** at pass close (147 P + 35 T − 5 mixed lines = 177; 153+40−10 double-counted occ = 182); post-close gap-closure added 2 documented legacy-format pin lines (`package-importer.test.ts:108,117` — an archive carrying the pre-break `museum-scene.json` member must be rejected, else a future legacy fallback could return unnoticed) → current live state **179 lines / 184 occurrences, all P/T**, incl. the flagged §3.2 MIME renames (`application/x-editor-texture`, `application/x-editor-camera-node`), the §3.3 CSS token (`--museum-editor-fg` → `--editor-fg`), the contracts-test local `museum` var → `visitor`, and 14 "museum-editor refactor plan" store comments → "editor-facade refactor plan".
  - **Gates:** identifier gate — zero matches outside the §3 keep-list (~41 hits, all keep-listed: `MuseumScene` ×11, `MuseumEntities` ×2, `MuseumEditorApp` ×11, `MuseumEditorEntry` ×2, `LayoutMuseumShell` ×12, `museumEditorEntryPlugin` ×3); bare-museum gate 179/184 = exactly the bucketed P/T set; `svelte-check` 0/0; suite **1,989 green** (format hard-break suites 54/54 incl. the roundtrip pin; the inventory's drift guard ran for real on the P7.3 removal — one line, accounted for). The [`P7.6 strings pre-inventory`](../plans/2026-08-23-P7.6-strings-pre-inventory.md) annex is annotated CONSUMED with the post-pass state.
- Previous slice: **P8 S6 implemented (2026-08-22) — legacy retirement** (transition kind removed; preview kinds → `camera/edge/sequence`; `previewGuidedTour` folded into `previewSequence`; 139 kind-switch sites across 33 files; the 4 legacy transition tests became connection-preview tests; graph-invalidation contract test added; `guidedTourNodeIds` kept per D5's boundary caution). P8 shipped S1–S6 2026-08-22. The full S5/S4 detail now lives in the tracker's P8 row + the archived plan.
- Docs synced this slice: umbrella P7 status → **P7 CLOSED 2026-08-23** + full P7.6 implementation note below the brief + per-increment table rows corrected (P7.2/P7.3/P7.5/P7.6 → shipped); tracker P7 row → shipped, execution-order paragraph → P2 resumes; inventory annex annotated CONSUMED; CURRENT.md advanced to "P7 complete". All P7.6 changes uncommitted (193 modified + 58 renamed paths); `model-assessment.md` untouched.

## Next action

- **One action: start P2.1 — footprint contract + room-aware passive Scene projection** ([`2026-08-18-P2-plan-staging.md`](../plans/2026-08-18-P2-plan-staging.md)). P2.1 has no remaining architecture blocker; P2.2/P2.3 interaction gates are recorded in the plan. P9 is closed and archived; P3 remains after P2. The existing uncommitted P7.6 delta remains untouched.

## Verification

- **1,989 tests green (1 skipped) · `svelte-check` 0 errors / 0 warnings ·
  identifier gate zero-match outside the §3 keep-list · bare-museum gate
  179/184 = exactly the tolerated P/T set · format hard-break suites 54/54**
  (P7 complete, 2026-08-23; P7.6 net +3 vs the 1,986 post-P7.2 baseline —
  the two §5 regression tests landed with P7.3; P7.6 added the hard-break
  legacy-member rejection pin (+1) plus the format/string mirrors).
- **P9 docs/raster verification:** 27 P9 PNGs plus the authoritative Camera
  sidebar-accordion and Scene 3D complete-XYZ-gizmo corrections reviewed at
  original resolution; live stale-term and old-filename gates clean; Markdown PNG
  references resolve; `git diff --check` clean. Source tests were not rerun:
  P9 changes Markdown and raster assets only, so the P7 baseline above is
  unchanged.
- **P2 plan/spec verification:** docs-only rebase; `git diff --check` clean.

## Known bugs / deferred

- Direct 3D **wall/interior-anchor picks deferred** (S6.1):
  `Workspace3DView.handleLayoutPick` falls through for those resolutions; rooms /
  openings / objects stay directly pickable.
- **Layout hover feed** (`onLayoutHover`) + anchor-helper octahedra stay
  disconnected (deferred).
- **Paris-gated `focusRoom` latent** on drafted rooms (throws via Chopin
  `getRoom`) — editor path fixed by S8.2; benign Chopin defaults remain, cleanup
  optional at relic removal.

## Traps

- **Edge timeline memo must key on `preview.runId`, not route identity:** `getCapturedCameraPreviewRoute(runId)` at `camera-preview-controller.svelte.ts:673`/`museum-editor.svelte.ts:1960` returns `cloneResolvedCameraRoute` per call — route identity thrashes every `$derived`; `createEdgeLocalTimeline` opts `{route}` must be fetched via `preview.runId` stable key.
- **Zero-flow documents are legal (P1.9):** `validateCurrentGuidedTourOrder`
  must keep its `< 2` guard before `mainFlowStart` — the seed dereference has
  no internal guard, and flowless graphs are reachable (no auto-promote on
  connect). Empty-chain recovery is the manual Start Sequence path only.
- **Sidebar expansion is component-local (P1.9):** `expandedNodeIds` lives in
  `CameraFlowPanel`; do not reintroduce store-level tree-expansion APIs for
  node rows (the surviving `treeExpandedCameraConnectionIds` session keys are
  delete-time prune targets only).
- **Keep-mounted plan cells (P1.7):** both plan workspaces stay mounted in
  `EditorApp` — the hidden one must keep `inert` + `plan-cell--hidden`, or it
  eats pointer/shortcut input while invisible. The shared fade on their roots
  fires only on Plan ↔ 3D mount/unmount; domain switches use the class fade.
- **Shared view axis (P1.7 follow-up):** `EditorViewState.view` is one shared
  Plan|3D mode for both domains; domain switches must not touch the view or
  create domain-specific remembered-view fields.
- **Instant shell swaps (P1.7 follow-up):** no fade/animation on view, domain,
  sidebar, or timeline swaps — `editorWorkspaceFade`, `view-fade-in`,
  `plan-fade-in` are deleted by owner decision; contracts pin their absence.
- **Camera 3D labels (P1.7):** positions resolve through
  `store.getRuntimeNavigationNode` (runtime scene = rooms truth), order from
  `store.mainFlowNodeIds` (not `guidedTourNodeIds`) to match the Plan
  projection; overlay is display-only (`aria-hidden`, no pointer events).
- **Two-node camera cycle:** timeline edges must key
  `` `${connectionId}:${direction}` ``, never `connectionId` alone
  (`each_key_duplicate` crash).
- **Editor camera path/view math** must resolve points through `store.rooms`,
  never `chopinRuntime.rooms` (root cause of the gizmo freeze on drafted
  rooms; `TransformControls` stayed attached to an unmounted helper root).
- **Shortcut cascade:** Escape must run before the W/E/R/T mode-key branch,
  or `cancelPendingNavigation` never fires.
- **S3 `onLayoutSelectionChanged`:** write slots only when they differ —
  unconditional writes spin `effect_update_depth_exceeded`.
- **Camera Plan (P1.5):** shipped — backdrop is hit-testable for placement but
  never commits a layout selection; Camera Plan helpers contain no
  `selectLayout*`/`clearLayoutSelection`/`layoutInteraction` path (source
  asserted). `store.document` + `store.rooms` are scene truth, never the
  boot-time `layoutPreview.project.scene` copy. The viewport rebuilds the plan
  model from a derived projection on pointer moves (established LayoutPlanViewport
  pattern); keep pointer-only state out of the projection so pan/zoom/hover
  stays cheap.
- **Camera = 3D guided PerspectiveCamera navigation**, not a webcam.

## Non-negotiables

- `/museum` + `/museum/editor` frozen; no editor/layout code in `/museum`
  visitor chunks; editor ships in production (no build-flag gating).
- **No commits unless the user asks.**
- One nav + one motion: `camera-route.ts` + `camera-motion.ts` only.
- Svelte 5 runes / Threlte patterns; no second graph/motion/geometry compiler.
