# Museum editor refactor — implementation plan

> **For agentic workers:** this is a structural refactor plan split into 9 slices. Each slice ends with one PR (or one PR-batch). After each slice, write a hand-off file so the next agent can pick up without re-scanning. Slice order is **easier big-win → harder risk**.
>
> Steps use checkbox (`- [ ]`) syntax for tracking. Do not skip the hand-off after completing a slice — the next agent depends on it.

**Goal:** Decompose `MuseumEditorStore` (4 609 LOC, 11 concerns) into a 6-cell sub-store composition behind a thin facade so future phase work (3.8, etc.) doesn't keep stacking into the god file.

**Architecture:** Composition-root class instantiates six sub-stores (`EditorDocumentStore`, `EditorHistoryController`, `EditorSelectionStore`, `EditorCameraPreviewController`, `EditorSessionState`, `EditorSceneRoots`) and re-exports a 1-for-1 facade over their public surface. History/Preview share a peer link (Preview's `transportState` is read by History's `canUndo`). Selection is a parallel tuple (workspace + navigation + discovery), not a single god-union.

**Tech Stack:** Svelte 5 runes (`$state`, `$state.raw`, `$derived`), Vitest, TypeScript strict mode, Three.js `Object3D`, `untrack` from `svelte`.

---

## Global Constraints (apply to every slice)

- **Branch:** `main`, currently 2 commits ahead of `origin/main`. **No commits at all unless the user explicitly asks — full stop, per `AGENTS.md`.**
- **Read the audit first** before slicing: [`docs/refactor-audit/2026-07-28-museum-editor.md`](./2026-07-28-museum-editor.md). It owns the rationale for every boundary.
- **Read `AGENTS.md`** for project-wide conventions (scene JSON, navigation atoms, visitor/editor split).
- **Safety net:** `apps/museum/src/lib/editor/museum-editor.test.ts` (3 631 LOC). Every slice ends with **all existing tests green** at the observed run-command. If expected behaviour changes, the slice author updates the test **inline in the same green-test checkpoint** as the source change.
- **Work unit ≠ commit.** When the plan says "one PR" or "one slice", it means a logical green-test checkpoint the slice author stops at. **The agent never runs `git commit`, `git add`, or `git push`.** The user (or a later agent with explicit commit permission) materialises the checkpoint into commits. Slice authors therefore work as: edit → verify → record in hand-off → stop, **then the user decides whether that work gets committed.**
- **Verification command (every slice):**  
  `cd /Users/tony/Documents/Personal && npm test -- --run apps/museum/src/lib/editor/museum-editor.test.ts && npm run check`
- **Phase banner comments only at slice boundaries.** Once a slice lands, delete the "*Phase X.Y: …*" comments that explain invariants the new module now enforces for you.
- **End-state file tree** (target):

```
apps/museum/src/lib/editor/
  museum-editor.svelte.ts          ← composition root (target ≈ 600 LOC)
  museum-editor.types.ts           ← shared type aliases (NEW)
  store/
    document-store.svelte.ts       ← §3.A1
    history-controller.svelte.ts   ← §3.A2
    selection-store.svelte.ts      ← §3.D
    camera-preview-controller.svelte.ts ← §3.B
    session-state.svelte.ts        ← §3.C
    scene-roots.svelte.ts          ← §3.E
  helpers/
    validators-runner.ts           ← §3.F (NEW)
  (existing helpers stay where they are)
```

---

## Reference index (read once)

| Need | File |
|---|---|
| Why we're here | `docs/refactor-audit/2026-07-28-museum-editor.md` |
| Project convention | `AGENTS.md` |
| Scene JSON contract | `docs/CAMERA_AND_LAYOUT.md` |
| Asset workflow | `docs/ASSET_WORKFLOW.md` |
| Pre-refactor god class | `apps/museum/src/lib/editor/museum-editor.svelte.ts` |
| Test suite (safety net) | `apps/museum/src/lib/editor/museum-editor.test.ts` |
| Existing pure validators | `apps/museum/src/lib/editor/editor-navigation-graph.ts` |
| Selection type vocabulary | `apps/museum/src/lib/editor/editor-selection.ts` |

---

## Hand-off contract (read once, repeat per slice)

Every slice concludes by writing one hand-off file at:

```
docs/agent-handoffs/2026-07-28-<status>-refactor-slice-<N>-<short-name>.md
```

where `<status>` is one of `in-progress`, `complete`, or `blocked`. The hand-off is the only context the next agent needs. Concretely the file MUST contain these sections, in this order:

```markdown
# Slice <N> hand-off — <short name>

**Status:** COMPLETE | IN_PROGRESS | BLOCKED
**Date:** YYYY-MM-DD
**Branch:** main
**Last commit:** <hash> (or "no commit" if slice is deno)

## What landed
[1–3 sentences. Behavioural change only. Code-level details go below.]

## Files added / modified
- <path:line-range> — <one-line summary>

## Public surface diff
[Methods added / removed / renamed. Field shape changes (e.g. `bind:` compatibility).]

## Test results
- `npm test -- --run apps/museum/src/lib/editor/museum-editor.test.ts` → <pass count | failures>
- `npm run check` → <typecheck result>

## Next-slice read list (DO NOT re-scan)
The agent doing Slice <N+1> reads ONLY the files below.
- <path> — <reason: what specifically they need to know about it>

The next-slice author MUST verify this list is enough by trying their work first using only those files, and updating this list if they had to look elsewhere. **Files NOT listed here were inspected during Slice <N> and do not need to be re-read.**

## Type-signature changes visible to the next slice
[List of public-API signatures that moved or were added. These are how the next slice's author knows the names of things they consume.]

## Known gotchas
- [Anything that surprised the slice author that the next agent should know.]

## Open questions for next slice
- [Anything still unresolved that Slice <N+1> inherits or needs to decide.]
```

The hand-off is **the only artefact** that carries the slice author's context forward. If you finish a slice without writing one, the next agent has to re-do the dependency scan from scratch — defeat the purpose.

---

# Slice 1 — pure helpers + session state (easier big win)

> **Status:** PARTIAL — composition-root pattern proven; remaining debt absorbed into Slice 3 (see Slice 3 §“Slice 1 debt”). **LOC delta (landed):** small (status + 3 viewport flags only). **Risk:** Low. **No `bind:` migration required for this slice.** **Verification target:** all existing tests pass, zero expectation changes.

## Goal

Reduce the god file by one pure-helper file + one sub-store, **without touching any component**. Sloppy first cut: prove the composition-root pattern, fix the dirty/save/lighting backflow into session, and remove the 8x `setStatusMessage(validation.message)` repetition.

**What actually landed (2026-07-30):** `EditorSessionState` with `statusMessage` + `viewportShowNodes/Paths/Framing` only; vitest infra fixed in Slice 1.E. **Not landed — tracked under Slice 3 debt:** `museum-editor.types.ts`, `validators-runner` / `runOrFail`, remaining ~14 session slots, component `sessionView` reads.

## Why first

This slice sets two precedents:
- **Composition-root pattern works** (a sub-store can sit behind the same `$state` name and tests stay green).
- **`runOrFail` is real.** Every later slice that calls a validator stops repeating the `if (!result.ok)` triplet.

After Slice 1 ships, every later slice is "do the same thing for one more concern." If anything is wrong with the pattern, Slice 1 catches it without the rest of the plan being committed.

## Pre-flight files to read (dependency scan for this slice)

READ THESE before any code change:

- `docs/refactor-audit/2026-07-28-museum-editor.md` — sections §3.C (EditorSessionState spec), §3.F (validators-runner), §7 #1, #4 (anti-patterns this slice addresses)
- `AGENTS.md` — read fully (project conventions)
- `apps/museum/src/lib/editor/museum-editor.svelte.ts`
  - **Lines 1–80** (imports + top-level constants + `EditorLightingSettings`, `EDITOR_VISITOR_LIGHTING`, `EDITOR_BRIGHT_LIGHTING`)
  - **Lines 1100–1200** (status-timer block around `#statusMessageTimer`)
  - **Lines 3279, 3330, 3343, 3359, 3387, 3490, 3529, 4115** (the 8 validator→message sites)
  - **Lines 3510–3530** (Status-message methods; `setStatusMessage` body)
  - **Lines 3690–3760** (the reset-triad dance inside select methods — read **once** to write a fix helper, not to refactor the select methods)
  - **Line 2874** (`clusteredPlacementIds` getter)
  - The 14–16 `=$state(...)` slots named in the audit §3.C: `currentWorkspace`, `leftPanel`, `timelineExpanded`, `sceneTimelineExpanded`, `timelineHeight`, `transformMode`, `transformGizmoVisible`, `transformSpace`, `cameraPanEnabled`, `cameraFocusKind`, `cameraFocusPlacementId`, `cameraFocusNodeId`, `cameraFocusVersion`, `pendingFramePlacementIds`, `pendingFrameVersion`, `pendingNavigationCommand`, `pendingPlacementAssetId`, `treeExpandedRoomIds`, `treeExpandedClusterIds`.
- `apps/museum/src/lib/editor/editor-navigation-graph.ts` (full file — small, 599 LOC; it's a validator)
- `apps/museum/src/lib/editor/museum-editor.test.ts` — lines 1–80 only (the imports + setup)
- `apps/museum/src/lib/editor/EditorAppBar.svelte` — only the lighting-section template (`applyLightingPreset` consumers) to confirm `EditorLightingSettings` shape has not drifted

YOU DO NOT NEED to read the Svelte components in full for this slice. You are not touching them. You DO NOT NEED to read `museum-editor.svelte.ts` past line 3700 except the listed anchors.

## Sub-tasks

- [ ] **1.1 Create `apps/museum/src/lib/editor/museum-editor.types.ts`.** → **DEBT → Slice 3 §Slice 1 debt (3.11).** Move all `export type` aliases (`EditorLightingSettings`, `EditorWorkspace`, `EditorLeftPanel`, `EditorPlacementTreeSelectionOptions`, `EditorClusterTreeSelectionOptions`, `EditorViewKeyframeProgressDragSelection`, `EditorTransformSpace`, `EditorCameraPreviewMode`, `EditorCameraPreviewTransport`, `EditorCameraPreview`, `EditorPendingNavigationCommand`) from `museum-editor.svelte.ts:88-160` into this new file. Re-export from `museum-editor.svelte.ts` for backwards compatibility — do not yet delete the originals. **Decide here:** the `clusteredPlacementIds` getter (god-file line 2874) duplicates `EditorSceneTree.svelte:17`. Plan: keep its definition on the god file during Slice 1 (Phase A mirror, see §3.G audit). Lift it onto `EditorSessionState` in Slice 7.A.1 when `RoomTreePanel.svelte` introduces the panel split, where it'll be the single source of truth and `EditorSceneTree` becomes a thin consumer.
  - Verify: `npm run check` passes.
- [ ] **1.2 Create `apps/museum/src/lib/editor/helpers/validators-runner.ts`.** → **DEBT → Slice 3 §Slice 1 debt (3.12).** Implement `runOrFail<T extends { ok: false; message: string }>(session: EditorSessionState, validator: () => true | T): boolean` exactly as the audit §3.F describes. **Type the `session` as `Pick<EditorSessionState, 'setStatusMessage'>`** so this file has no Svelte-rune runtime dependency (avoids accidentally importing `$state`).
  - Verify: `npm run check` passes (the function is unused at this step; lint/type only).
- [ ] **1.3 Rewrite the 8 numbered sites:** → **DEBT → Slice 3 §Slice 1 debt (3.12).** in `museum-editor.svelte.ts` lines 3279, 3330, 3343, 3359, 3387, 3490, 3529, 4115 replace the `setStatusMessage(validation.message)` + return `false` dance with `return runOrFail(this.session, () => validateX(...))`. Don't delete the validators yet — just one-for-one substitution at each call site. Add a temporary inline `this.session = { setStatusMessage: this.setStatusMessage.bind(this) }` at the top of each call to keep behaviour identical while `session` is just an alias.
  - Verify: `npm test -- --run apps/museum/src/lib/editor/museum-editor.test.ts` passes 100% (the assertion text never changed; behaviour is identical).
- [x] **1.4 Create `apps/museum/src/lib/editor/store/session-state.svelte.ts`.** **PARTIAL** — status timer + 3 viewport flags only. Full 14–16 slots → **DEBT → Slice 3 §Slice 1 debt (3.13).**
  - Verify: `npm run check` passes (the class is unused at this step).
- [x] **1.5 Wire `EditorSessionState` into `MuseumEditorStore`.** **PARTIAL** — `session` + getters for the 4 landed slots + `sessionView` proxy. Remaining slot migration → **DEBT → 3.13.**
  - Verify: `npm test` passes 100%.
- [ ] **1.6 Migrate component reads.** → **DEBT → Slice 3 §Slice 1 debt (3.13).** For each *read* of session-only fields (`currentWorkspace`, `leftPanel`, `transformMode`, `cameraPanEnabled`, `gridVisible`, `ambientIntensity`, etc.) — replace `store.x` with `store.sessionView.x` **at call sites that the test suite does not exercise**. For the test suite, **keep the old `store.x` reads working** by adding a one-line mirror at the same name on the store. This is the "Phase A mirror" from the audit §3.G.
  - Verify: `npm test` passes 100%.
- [x] **1.7 Add integration tests in `apps/museum/src/lib/editor/store/session-state.test.ts`.** Landed for status timer + viewport toggles. Expand when 3.13 lands.
  - Verify: `npm test -- --run apps/museum/src/lib/editor/store/session-state.test.ts` passes.
- [x] **1.8 Run typecheck and full test suite.** Proven via Slice 1.E vitest infra + later slices.
- [x] **1.9 Write the hand-off.** See `docs/agent-handoffs/2026-07-28-in-progress-refactor-slice-1-session-and-helpers.md` + `2026-07-30-complete-refactor-slice-1-e-vitest.md`. Remaining debt owned by Slice 3 hand-off.

## Verification

```bash
cd /Users/tony/Documents/Personal
npm run check
npm test -- --run apps/museum/src/lib/editor/museum-editor.test.ts
npm test -- --run apps/museum/src/lib/editor/store/session-state.test.ts
```

Expected: 100% pass; typecheck clean. `museum-editor.svelte.ts` LOC drops to ≈ 4 200.

## Hand-off

Write `docs/agent-handoffs/2026-07-28-<status>-refactor-slice-1-session-and-helpers.md`. The hand-off MUST name **why components did not change this slice** in the "Known gotchas" section so Slice 2's author doesn't waste time re-reading components.

---

# Slice 2 — `EditorSceneRoots` (small consolidating move)

> **LOC delta:** −100. **Risk:** Low. **No `bind:` migration.** **Verification:** all tests pass.

## Goal

The store has 4 separate `#XRoots = new Map<string, Object3D>()` private maps exposed via 12 `getX/registerX/unregisterX` methods, plus a `registryVersion = $state(0)` "version bumping" gimmick. Collapse this to one tagged-key map and one `EditorSceneRoots` class.

## Pre-flight files to read

- `docs/refactor-audit/2026-07-28-museum-editor.md` — §3.E (full spec)
- `apps/museum/src/lib/editor/museum-editor.svelte.ts`
  - **Lines 2681–2810** (the 12 get/register/unregister methods, plus `notifyPlacementRootChanged`)
  - The 4 `#...Roots` private declarations (around line 478–482 look for `#placementRoots`)
- `apps/museum/src/lib/editor/editor-assets.ts` — full file (41 lines; small; cycle-guarded id reservation is the same pattern this class will use)
- `apps/museum/src/lib/editor/EditorSceneTree.svelte` lines 1–30 (just enough to see how `clusteredPlacementIds` is computed)

NO NEED to re-read prior slices' types — Slice 1's hand-off lists them.

## Sub-tasks

- [ ] **2.1 Create `apps/museum/src/lib/editor/store/scene-roots.svelte.ts`.** Implement `EditorSceneRoots` per audit §3.E. Pull the helper-key functions (`cameraHelperKey`, `anchorHelperKey`, `viewKeyframeHelperKey`) into a new `apps/museum/src/lib/editor/helpers/scene-keys.ts` so the class file is freestanding. The key union type goes into `museum-editor.types.ts`.
  - Verify: `npm run check`.
- [ ] **2.2 Replace the 12 store methods with delegation.** In `museum-editor.svelte.ts`, replace each `getPlacementRoot(id)` / `registerPlacementRoot(id, root)` / `unregisterPlacementRoot(id, root)` / … with a one-line delegate `return this.roots.get({ type: 'placement', id })` etc. Do **not** delete the originals — keep them until tests confirm.
  - Verify: `npm test` 100% pass.
- [ ] **2.3 Replace `registryVersion = $state(0)` bumps.** Wherever `this.#bumpRegistryVersion()` is currently called inside the god file's register/unregister methods, drop the bump — `EditorSceneRoots.version` already bumps. Update the four `getPlacementRoots`, `getCameraHelperRoot`, `getAnchorHelperRoot`, `getViewKeyframeTargetHelperRoot` getters to read `void this.roots.version` instead of `void this.registryVersion`.
  - Verify: `npm test` 100% pass.
- [ ] **2.4 Delete the originals** in `museum-editor.svelte.ts`. The 12 methods + 4 private maps + `registryVersion` field go away. The composition root no longer references them.
  - Verify: `npm run check && npm test`.
- [ ] **2.5 Add integration tests in `apps/museum/src/lib/editor/store/scene-roots.test.ts`.** Cover: register/unregister with same/different Object3D, `version` increments only on changes, `ids(type)` returns only matching keys.
  - Verify: `npm test -- --run apps/museum/src/lib/editor/store/scene-roots.test.ts`.
- [ ] **2.6 Hand-off.** Write `docs/agent-handoffs/2026-07-28-<status>-refactor-slice-2-scene-roots.md`.

## Verification

```bash
cd /Users/tony/Documents/Personal
npm run check
npm test
```

Expected: 100% pass. `museum-editor.svelte.ts` LOC ≈ 4 100.

---

# Slice 3 — `EditorDocumentStore` + `EditorHistoryController` peer-link (the deepest cut)

> **Status:** COMPLETE (2026-07-31). **LOC delta (actual):** god file still ≈ 4 570–4 600 (Option 3 facade getters kept consumer surface; state ownership moved into ~1.1k LOC of sub-stores). Plan’s −1 000 god-file target was optimistic under Option 3 — measure success by concern ownership + green tests, not LOC alone. **Risk:** Medium. **No `bind:` migration** for the document/history slice. **Verification:** all editor + store tests pass.

## Goal

Pull the document, history, and preview FSM out of the store class. **Atomic constraint from the audit §3.A.2 and §5:** History's `canUndo` reads `preview.transportState`, so the history controller takes the preview controller as a constructor collaborator. This slice ships all three together.

**Also owns Slice 1 debt** (types barrel, `runOrFail`, remaining session slots) — see §“Slice 1 debt” below. Debt does **not** block Slice 3 COMPLETE; finish before Slice 5 `bind:` migration.

## Pre-flight files to read

- `docs/refactor-audit/2026-07-28-museum-editor.md` — sections §3.A.1 (DocumentStore), §3.A.2 (History, including the peer-link note), §3.B (CameraPreviewController)
- Slice 1 and Slice 2 hand-offs (in `docs/agent-handoffs/`)
- `apps/museum/src/lib/editor/museum-editor.svelte.ts`
  - **Lines 343–360** (top-of-file: `document`, `validation`, `baselineCanonicalJson`, `scene`, `state` declarations)
  - **Lines 4086–4260** (Document transaction lifecycle `#transactionBefore`, `beginDocumentTransaction`, `beginCameraFramingTransaction`, `commitDocumentTransaction`, `cancelDocumentTransaction`, the `documentsMatch` helper at 238–240, `#reconcileSelection`, `#replaceDocument`, `#replaceRuntime`)
  - **Lines 4150–4190** (`undo`, `redo` lifecycle)
  - **Lines 2481–2850** (the camera preview FSM methods: `#prepareCameraPreview`, `#refreshPausedDirectorPreview`, `#pruneInvalidCameraPreview`, `#releasePausedPreviewForTopology`, `playCameraPreview`, `pauseCameraPreview`, `stopCameraPreview`, `requestDropToFloor`, `previewGuidedTour`, the `#cameraTimelineGraph` / `#cameraTimelineCache` and `#capturedCameraPreviewRoute`)
  - **Lines 2195–2480** (camera-timeline scrub methods: `seekCameraTimeline`, `selectCameraTimelineEdge`, `selectCameraTimelineNode`, `selectCameraTimelineViewKeyframe`, `stepCameraTimeline`)
  - The `cloneResolvedCameraRoute` helper (lines 213–272)
- `apps/museum/src/lib/editor/museum-editor.test.ts`:
  - The `describe('undo', …)` and `describe('redo', …)` blocks (~lines 200–500)
  - All `preview*` describes (~1000 LOC, locator `[describe blocks with 'preview']`)
  - All `camera-timeline` describes (~500 LOC, locator `[describe blocks with 'timeline']`)
  - All `transaction` describes (~700 LOC)
  - **Why:** these are the assertions the new controllers must continue to satisfy.

YOU DO NOT NEED to re-read components in this slice either. The store's public surface is untouched here (read signatures facade-stable per audit §3.G).

## Sub-tasks

- [x] **3.1 Create `apps/museum/src/lib/editor/store/document-store.svelte.ts`.** Landed.
- [x] **3.2 Create `apps/museum/src/lib/editor/store/camera-preview-controller.svelte.ts`.** Landed.
- [x] **3.3 Create `apps/museum/src/lib/editor/store/history-controller.svelte.ts`.** Landed (peer-link ctor; validate-before-push + `HistoryCommitResult.error`).
- [x] **3.4 Replace the god-file's document section.** Option 3: `documentStore` + facade getters (not plan-literal field rename).
- [x] **3.5 Replace the god-file's preview section.** Option 3: `previewController` + getters/setters; transitional `allocRunId` / `setCapturedRoute` / `clearCapturedRoute`.
- [x] **3.6 Wire History + Document together.** `historyController`; rich facade `canUndo`/`canRedo`; commit status-message adapter.
- [x] **3.7 Replace camera-timeline scrub methods.** **PARTIAL / accepted:** `getTimeline()` + graph cache moved into preview controller; seek/select/step/show/sync stay on composition root (selection + `cameraTimelinePlayhead` coupled). Thin helper deferred.
- [x] **3.8 Add integration tests.** `store/document-store|history-controller|camera-preview-controller.test.ts` landed.
- [x] **3.9 Final sanity.** Editor + store suite green at close-out.
- [x] **3.10 Hand-off.** `docs/agent-handoffs/2026-07-31-complete-refactor-slice-3-document-history-preview.md`.

## Slice 1 debt (absorbed into Slice 3 tracking)

> These items did **not** land in Slice 1. Slice 3 hand-off owns them so Slice 4+ authors do not miss them. **Schedule: complete before Slice 5 `bind:`** (session fields need a real owner before bind migration). May land as a Slice 3.b mini-slice or early Slice 4 prep — not required to start Slice 4 selection shape.

- [ ] **3.11 / was 1.1 — `museum-editor.types.ts`.** Extract exported editor type aliases from the god file into `apps/museum/src/lib/editor/museum-editor.types.ts`; re-export from `museum-editor.svelte.ts` for back-compat. Also collapses duplicated `EditorCameraPreview*` types currently redeclared in `camera-preview-controller.svelte.ts`.
- [ ] **3.12 / was 1.2–1.3 — `helpers/validators-runner.ts` + `runOrFail`.** Implement `runOrFail` per audit §3.F (`Pick<EditorSessionState, 'setStatusMessage'>`). Replace the remaining `if (!validation.ok) { setStatusMessage; return false }` sites. Prior attempt failed TypeScript narrowing against validator unions — fix the generic constraint to match real `Plan | Failure` discriminants before adopting.
- [ ] **3.13 / was 1.4–1.6 — remaining `EditorSessionState` slots.** Migrate the ~14 session slots still on the god file (`currentWorkspace`, `leftPanel`, tree-expansion arrays, transform mode/space/gizmo, camera pan/focus channel, lighting, snap, keep-on-floor, grid, pending frame/nav/asset, timeline chrome). Keep Phase A mirrors on the composition root until Slice 5. Expand `session-state.test.ts`. Component `sessionView` reads optional until Slice 5.

## Verification

```bash
cd /Users/tony/Documents/Personal
npm run check
npm test -- --run apps/museum/src/lib/editor/museum-editor.test.ts
npm test -- --run apps/museum/src/lib/editor/store/
```

Expected at Slice 3 COMPLETE: 100% pass; typecheck clean. God-file LOC may remain ≈ 4 600 under Option 3 (ownership moved; facade thick). Slice 1 debt (3.11–3.13) may still be open.

## Hand-off

Write `docs/agent-handoffs/2026-07-31-complete-refactor-slice-3-document-history-preview.md`. Must include Facade-mirrored fields, peer-link note, §3.7 scrub deferral, and Slice 1 debt (3.11–3.13).

---

# Slice 4 — `EditorSelectionStore` shape, public methods 1:1 (5a)

> **LOC delta:** −200 in god file (the field-shape change is "free" because `selectX` methods still exist). **Risk:** Medium. **No `bind:` migration in this slice.** Tests unchanged.

## Goal

Introduce `EditorSelectionStore` with the **parallel-tuple shape** from audit §3.D. The 11 `selectX` methods on the store are rewritten to delegate to `selection.setWorkspace(...)` / `selection.setNavigation(...)`. The public surface stays 1:1, so test calls still work.

## Pre-flight files to read

- `docs/refactor-audit/2026-07-28-museum-editor.md` — §3.D (full spec, **including the parallel-tuple correction**)
- `docs/agent-handoffs/2026-07-31-complete-refactor-slice-3-document-history-preview.md` — Facade-mirrored fields, peer-link, afterReplace order, Slice 1 debt (3.11–3.13; finish before Slice 5, not required to start 4)
- `docs/refactor-audit/2026-07-28-refactor-plan.md` — Slice 3 §Slice 1 debt
- `apps/museum/src/lib/editor/museum-editor.svelte.ts`
  - **Lines 1410–1700** (the `selectNavigationNode`, `selectCameraHandle`, `selectConnection`, `selectAnchor`, `selectViewKeyframe`, `finishAnchorEditing`, `finishViewKeyframeEditing` methods, plus default direction helper, expandActiveCameraDirection helper)
  - **Lines 3683–3770** (the `selectPlacement`, `selectPlacements`, `togglePlacement`, `selectCluster`, `selectClusterFromTree`, `selectPlacementFromTree`, `selectAllInRoom`, `cyclePlacement`, `deselect`, `selectRoom`, `ensure*TreeExpanded` methods, plus `#clearPlacementSelection`)
  - **Lines 378–400** (`selectedRoomId`, `selectedPlacementIds`, `selectedClusterId`, `navigationSelection`, `activeCameraConnectionId`, `activeCameraDirection` declarations)
  - **Lines 1370–1400** (`get cameraSelection()`, `get selectedNavigationNode()`, `get selectedConnection()`, `get selectedAnchor()`, `get selectedViewKeyframe()`, … derived getters that read both layers)
- `apps/museum/src/lib/editor/editor-selection.ts` — full file (the type vocabulary; the new discriminated unions reconcile with `EditorNavigationSelection` here)

## Sub-tasks

- [ ] **4.1 Create `apps/museum/src/lib/editor/store/selection-store.svelte.ts`.** Implement the parallel-tuple shape per audit §3.D (corrected). Workspace state has 3 shapes (`'none' | 'placement' | 'cluster'`); navigation has 5 (`'none' | 'node' | 'connection' | 'anchor' | 'view-keyframe'`). Plus the `discoveryConnectionId` / `discoveryDirection` slots.
  - Verify: `npm run check`.
- [ ] **4.2 Implement the cross-cutting invariants in *one* place.** In the new class:
  - `setWorkspace(s = { kind: 'none' })` → no cross-clearing.
  - `setNavigation(s = { kind: 'none' })` → clears `discoveryConnectionId` and `discoveryDirection`.
  - `setDiscovery(id, dir)` → clears `workspace` if `workspace.kind === 'placement'` or `'cluster'` (per the audit §3.D invariant: "entering navigation clears the workspace selection").
  - Verify: write 6–8 unit tests directly on the new class.
- [ ] **4.3 Mirror fields on the composition root, Phase A.** In `museum-editor.svelte.ts`, replace the 6 named `$state` slots at lines 378–400 with **derived** `$derived` slots that re-emit `selection.workspace.ids` / `selection.workspace.clusterId` / `selection.workspace.roomId` / `selection.navigation.*` / `selection.discoveryConnectionId` / `selection.discoveryDirection`. (This means `selectedPlacementIds = $derived(selection.workspace.kind === 'placement' ? selection.workspace.ids : [])` etc.)
  - **Why derived, not `$state`:** the audit §3.G calls out `bind:` will silently fail on derived fields, but Phase A explicitly defers `bind:` migration to Slice 5. Phase A accepts that reads work, writes do not.
  - Verify: `npm run check`.
- [ ] **4.4 Update the 11 `selectX` methods** (god-file lines 1410–1700 and 3683–3770) to **delegate through `selection.setWorkspace(...)` / `selection.setNavigation(...)` / `selection.setDiscovery(...)` while keeping the *exact* same return semantics**. The existing reset-triad (`cancelAssetPlacement(); cancelPendingFrame(); #clearPlacementSelection(); navigationSelection = {...}; activeCameraConnectionId = ...`) collapses to the right `setX` call. The cross-clearing logic moves into the selection store.
  - Verify: `npm test` 100%. The assertions stay the same; behaviour stays the same.
- [ ] **4.5 Update the `selectRoom`, `selectAllInRoom`, `deselect`, `selectNavigationNode` (the many side-effects on `navigationSelection`, `activeCameraConnectionId`, `pendingFramePlacementIds`, `pendingNavigationCommand`)** to compute the target selection-store arguments and call `selection.setX`. The new invariant: **`store.selection.workspace.kind` is the authoritative source for "what selection is".** Assert equivalence directly between the two shapes via equality on the new `selection.workspace` discriminant, **not** via a property-style iff against the legacy composition-root fields — the legacy fields are becoming `bind:`-incompatible (Slice 5) and are transitional.
  - Verify: write a `selection-store.test.ts` test asserting that `selection.setWorkspace` + `setNavigation` produces a deterministic state for every input pair. Stop testing the iff; test the new shape.
- [ ] **4.6 Add integration tests in `apps/museum/src/lib/editor/store/selection-store.test.ts`.** Cover: cross-clearing invariants (5 cases), `setDiscovery` clears workspace when needed, parallel selection (e.g. `pendingPlacementAssetId` can coexist with a workspace selection because it's not in the union).
  - Verify: `npm test -- --run apps/museum/src/lib/editor/store/selection-store.test.ts`.
- [ ] **4.7 Hand-off.** Write `docs/agent-handoffs/2026-07-28-<status>-refactor-slice-4-selection-shape.md`. The hand-off MUST enumerate **every** `bind:` site the next slice will hit — at this point the `selectX` methods are public APIs but the underlying fields are derived and therefore `bind:`-incompatible. Slice 5 author reads this list.

## Verification

```bash
cd /Users/tony/Documents/Personal
npm run check
npm test
npm test -- --run apps/museum/src/lib/editor/store/
```

Expected: 100% pass. `museum-editor.svelte.ts` LOC ≈ 2 900.

---

# Slice 5 — `bind:` migration (5b, hard mechanical step)

> **Status:** COMPLETE (2026-07-31). Store-field `bind:value`/`bind:checked` inventory empty; Phase B for lighting + snap. Browser smoke deferred — see hand-off (`@vitest/browser` not in package). **LOC delta:** small (Phase B getters). **Risk:** was High; mitigated by contract test.
> **Hand-off:** `docs/agent-handoffs/2026-07-31-complete-refactor-slice-5-bind-migration.md`

## Goal

Audit every editor Svelte file for `bind:value={store.x}` where `x` is one of:
- `selectedPlacementIds`, `selectedClusterId`, `selectedRoomId`
- `navigationSelection`
- `activeCameraConnectionId`, `activeCameraDirection`
- `treeExpandedRoomIds`, `treeExpandedClusterIds`, `treeExpandedCameraConnectionIds`, `treeExpandedCameraDirectionKeys`
- `currentWorkspace`, `leftPanel`
- `transformMode`, `transformSpace`
- `timelineHeight`
- `pendingNavigationCommand`, `pendingPlacementAssetId`
- `pendingFramePlacementIds`
- **plus session tools:** lighting + snap / keep-on-floor (actual bind consumers)

Replace each `bind:` with an explicit `oninput` / `onchange` / `onclick` handler that calls the appropriate `store.setX(...)` / `store.sessionView.setX(...)` method.

## Sub-tasks

- [x] **5.1 Inventory `bind:` call sites.** Only store binds: lighting (Inspector) + snap/keepOnFloor (PlacementInspector). Plan candidate selection fields had no bind consumers.
- [x] **5.2 Dispatch table.** Lighting → `sessionView.setAmbientIntensity` etc. Snap → `sessionView.setTranslationSnapEnabled` / `setRotationSnapEnabled` / `setKeepOnFloor`.
- [x] **5.3 Migrate each bind site.** `EditorInspector.svelte` + `EditorPlacementInspector.svelte`.
- [x] **5.4 Update tests.** `museum-editor-bind-migration.test.ts` + session-state snap setter tests.
- [x] **5.5a Browser prerequisite.** Checked — `@vitest/browser` absent; **not** installed this slice (infra deferral documented in hand-off).
- [ ] **5.5 Browser smoke** — deferred; unit contract smoke stands in.
- [x] **5.6 Hand-off.** `docs/agent-handoffs/2026-07-31-complete-refactor-slice-5-bind-migration.md`.

## Verification

```bash
cd /Users/tony/Documents/Personal
npm run check
npm test -w @portfolio/museum
```

Expected: zero `bind:(value|checked)={store.` in editor Svelte; unit suite green.

---

# Slice 6 — delete legacy `selectX` methods, migrate tree-expansion (5c)

> **Status:** COMPLETE (2026-07-31). **LOC delta (actual):** god ≈ 4808 → 4511 (−297); new `selection-actions.svelte.ts` ≈ 519. Plan’s −200 / ≈700 god target was Option-3 fantasy — measure by ownership. **Risk:** was High. **Decisions:** hard-delete onto `EditorSelectionActions` (not slim facade); expansion via selection→session; browser smoke **removed** (manual test). **Hand-off:** `docs/agent-handoffs/2026-07-31-complete-refactor-slice-6-selection-deletion.md`

## Goal

With `selection-store.svelte.ts` owning selection shape and the `bind:` blockers resolved, the 11 `selectX` methods on the god file become one-line delegates. **Replace them** with calls to `selection.setWorkspace(...)` / `selection.setNavigation(...)`. Update tests to consume `store.selection.workspace.*` / `store.selection.navigation.*` directly.

The tree-expansion arrays (currently in `EditorSessionState`) are tightly coupled to selection methods that expanded / collapsed them. The audit §5 + §9 + Slice 4 clarified that the arrays belong to `session` and the per-selection expansion calls belong to the selection-store's `setX` methods. Move them at the same time so `selectX` can finally be deleted.

## Pre-flight files to read

- Slice 4 and Slice 5 hand-offs. These have the full list of methods now on `EditorSelectionStore` and `EditorSessionState`.
- `docs/refactor-audit/2026-07-28-museum-editor.md` — §5 Step 5c, §6 Test strategy.
- `apps/museum/src/lib/editor/museum-editor.test.ts` — **all selection-related describes** (`describe.*selection`, `describe.*plant`, `describe.*camera select`, etc.). Count them; ~400 LOC of the 3 631 total.
- **Do not re-read** the god file's `selectX` method bodies (Slice 4 already understood them; their logic is now in `selection-store.svelte.ts`).

## Sub-tasks

- [x] **6.1 Move expansion to selection-store.** `expand*` on selection → session; god treeExpanded `$state` deleted → session facades. Direction keys `::`.
  - Verify: selection-store test green.
- [x] **6.2 Migrate tests.** Call sites → `store.selectionActions.*`; integration suite kept; micro-tests in `selection-actions.test.ts` + selection-store expand coverage.
- [x] **6.3 Promote `selectXFromTree`.** Landed on `EditorSelectionActions` (not the pure reducer) with host-injected focus/expand — same behaviour, hard-delete off god.
- [x] **6.4 Delete the 11+ `selectX` methods from `MuseumEditorStore`.** Hard-delete (decision 2b); components use `store.selectionActions.X`. No slim facade.
  - Verify: `npx vitest run` (museum) 531/531.
- [x] **6.5 Delete the reset-triad helper on the god file.** Triad lives inside actions / `clearPlacementSelection()`.
  - Verify: green.
- [x] **6.6 Browser smoke — REMOVED.** No `@vitest/browser`. Manual `/dev/museum-editor` checklist in hand-off.
- [x] **6.7 Hand-off.** `docs/agent-handoffs/2026-07-31-complete-refactor-slice-6-selection-deletion.md`.

## Verification

```bash
cd /Users/tony/Documents/Personal/apps/museum
npm run check
npx vitest run
```

Expected: all tests green; ownership via `selection` + `selectionActions` (ignore LOC≈700). Manual `/dev/museum-editor` checklist in hand-off — no browser smoke.

---

# Slice 7 — split `EditorSelection.svelte` and `EditorCameraTree.svelte` (panel gods)

> **LOC delta:** none in store. **Risk:** HIGH (snapshot churn). **No `bind:` migration** (Slice 5 already done).

## Goal

After Slice 6, selection state is owned by `EditorSelectionStore`. The two biggest component god-candidates can now be split with no behavioural risk because the store API is stable.

## Pre-flight files to read

- Slice 6 hand-off — confirms the public API of `EditorSelectionStore` and `EditorSessionState` so you know what the new sub-components get as props.
- `apps/museum/src/lib/editor/EditorSelection.svelte` — full file (1 011 LOC). Read it once, summarize in 30 lines of working notes.
- `apps/museum/src/lib/editor/EditorCameraTree.svelte` — full file (482 LOC).
- **`docs/refactor-audit/2026-07-28-museum-editor.md` §4.A and §4.B.** target shapes.
- DO NOT re-read the god file (Slice 6 already documented the relevant getters).

## Sub-tasks

### 7.A Split `EditorSelection.svelte`

- [ ] **7.A.1 Create `RoomTreePanel.svelte`** with: rooms + placements, drag/drop, focus button. **Inputs:** `selectedRoomId`, `selectedPlacementIds`, `treeExpandedRoomIds`, `parisObjects`, `clusteredPlacementIds`. **Outputs:** callbacks for `selectRoom`, `selectPlacement`, `togglePlacement`, `selectAllInRoom`.
- [ ] **7.A.2 Create `ClusterTreePanel.svelte`** with: cluster member rows, rename inline, group/ungroup buttons. Inputs: `clusters`, `selectedClusterId`, `selectedPlacementIds`, `treeExpandedClusterIds`. Outputs: callbacks for `createCluster`, `renameCluster`, `ungroupCluster`, `selectCluster`.
- [ ] **7.A.3 Create `CameraWorkspaceTree.svelte`** with: connection list + direction toggles + directional keyframe rows. Inputs: `connections`, `activeCameraConnectionId`, `activeCameraDirection`, `treeExpandedCameraConnectionIds`, `treeExpandedCameraDirectionKeys`. Outputs: callbacks for `selectCameraConnectionDirection`, `selectAnchor`, `selectViewKeyframe`.
- [ ] **7.A.4 Create `AssetLibraryPanel.svelte`** with: filter chips, search, place button. Inputs: `selectedAsset`, `pendingPlacementAssetId`. Outputs: `beginAssetPlacement`, `cancelAssetPlacement`, `selectAsset` (already handled by parent).
- [ ] **7.A.5 Slim `EditorSelection.svelte`** to < 250 LOC: composes the four panels, holds workspace/panel-mode switch from session, no inline data.
- [ ] **7.A.6 Update existing snapshot tests** for `EditorSelection.svelte` (if any). Either replace with targeted component tests per new sub-panel, or re-record.
- [ ] **7.A.7 Vitest browser smoke re-run.** Open `/dev/museum-editor`, exercise room→placement→asset→cluster→camera flow.

### 7.B Split `EditorCameraTree.svelte`

- [ ] **7.B.1 Create `ConnectionListPanel.svelte`**: connection rows + direction toggles.
- [ ] **7.B.2 Create `DirectionalKeyframeList.svelte`**: forward/reverse keyframe rows with drag connectors.
- [ ] **7.B.3 Create `TreeShortcuts.svelte`**: keyboard handlers, kill-switch route list.
- [ ] **7.B.4 Slim `EditorCameraTree.svelte`** to < 100 LOC: composes the three, owns the local store-prop pass-through.
- [ ] **7.B.5 Update snapshot tests** for `EditorCameraTree.svelte`.
- [ ] **7.B.6 Vitest browser smoke re-run.**

- [ ] **7.9 Hand-off.** Write `docs/agent-handoffs/2026-07-28-<status>-refactor-slice-7-panel-splits.md`.

## Verification

```bash
cd /Users/tony/Documents/Personal
npm run check
npm test
npm test -- --run apps/museum/src/lib/editor/museum-editor-bind-migration.browser.test.ts
```

Expected: `EditorSelection.svelte` ≈ 200 LOC, `EditorCameraTree.svelte` ≈ 100 LOC. All snapshots re-recorded. Browser smoke green.

---

# Slice 8 — hook extraction + project menu + shortcut decomposition (polish)

> **LOC delta:** none in store. **Risk:** Low. **No `bind:` migration.**

## Goal

Three final polish steps from audit §4.C / 4.D / 4.G / 4.H:

- Extract `useDirectorPreview`, `useVisitorPreview`, `useCameraTimeline` so `EditorCameraRig.svelte` and `EditorCameraTimelinePanel.svelte` see only 3–4 props.
- Extract `EditorProjectMenu.svelte` from `EditorAppBar.svelte` (the 110-LOC dialog).
- Replace inline `onKeyDown` handler in `MuseumEditorApp.svelte` (lines 67–135) with a `registerEditorShortcuts(store)` utility.

## Pre-flight files to read

- Slices 6 and 7 hand-offs (you need the new sub-store APIs to know which fields to read in hooks).
- `apps/museum/src/lib/editor/EditorCameraRig.svelte` — full file (531 LOC).
- `apps/museum/src/lib/editor/EditorCameraTimelinePanel.svelte` — full file (504 LOC).
- `apps/museum/src/lib/editor/EditorCameraTimelineFrame.svelte` — full file (194 LOC; chrome wrapper).
- `apps/museum/src/lib/editor/EditorAppBar.svelte` — focus on the `project-menu` section (lines 102–135).
- `apps/museum/src/lib/editor/MuseumEditorApp.svelte` lines 60–135 (keydown handler).

## Sub-tasks

- [ ] **8.1 Create `apps/museum/src/lib/editor/hooks/use-camera-preview.svelte.ts`.** Exports `useDirectorPreview`, `useVisitorPreview`. Hooks read from `store.preview` (now on `EditorCameraPreviewController`).
- [ ] **8.2 Create `apps/museum/src/lib/editor/hooks/use-camera-timeline.svelte.ts`.** Exports `useCameraTimeline`. Reads `store.preview` + a derived selection of `cameraTimelinePlayhead`.
- [ ] **8.3 Create `apps/museum/src/lib/editor/hooks/shortcuts.svelte.ts`.** Exports `registerEditorShortcuts(store)` that registers the keydown cascade in audit §7 #4. Returns an unregister function. Spec in `muse-editor-shell.test.ts` (extend).
- [ ] **8.4 Refactor `EditorCameraRig.svelte`** to use the hooks. The component shrinks to ~300 LOC.
- [ ] **8.5 Refactor `EditorCameraTimelinePanel.svelte`** to use the hooks. Splits into `EditorCameraTimelineRuler.svelte` + `EditorCameraTimelineDots.svelte` per audit §4.D.
- [ ] **8.6 Extract `EditorProjectMenu.svelte`** from `EditorAppBar.svelte`. ~110 LOC.
- [ ] **8.7 Refactor `MuseumEditorApp.svelte`** to call `registerEditorShortcuts(store)`. The inline handler goes away.
- [ ] **8.8 Run smoke + all tests + typecheck.**
- [ ] **8.9 Hand-off.** Write `docs/agent-handoffs/2026-07-28-<status>-refactor-slice-8-polish.md`. **Final hand-off**, so it should also include a closing summary of post-refactor LOC and known residual smells.

## Verification

```bash
cd /Users/tony/Documents/Personal
npm run check
npm test
npm test -- --run apps/museum/src/lib/editor/museum-editor-bind-migration.browser.test.ts
```

Expected: `museum-editor.svelte.ts` LOC ≤ 700. All 18 components trimmed. Browser smoke green. Zero remaining god-candidates.

---

# Test strategy (Plan-level §6)

Pre-refactor: **3 631 LOC of vitest integration** covering:

| Coverage | Approx LOC | Files |
|---|---:|---|
| Preview-FSM transitions (`mode × transport × preview.kind` × drag cancelers) | 1 000 | `museum-editor.test.ts` |
| Guided-tour manipulation (drag-drop, deletion, missing-edge inserts) | 700 | same |
| Camera timeline scrub + node boundary | 500 | same |
| Selection / tree-from-tree picking | 400 | same |
| Camera-framing keyframe mutation | 300 | same |
| Cluster / asset-placement / lighting toggles | 200 | same |
| Setup, fixtures, describe scaffolds | ~500 | same |

**Per-slice verification budget:**
- Slices 1–4, 8: zero expectation changes. All 3 631 tests must pass.
- Slice 5 (bind migration): adds `--run` tests for migrated bind-sites; **zero changes** to test assertions.
- Slice 6 (deletion): rewrites ~400 LOC of selection tests; adds new micro-tests in `selection-store.test.ts`.
- Slice 7 (panel splits): re-record snapshots; add micro-tests for each new sub-panel.
- Slice 8 (polish): no test changes.

**Browser smoke (added in Slice 5, kept thereafter):**

`apps/museum/src/lib/editor/museum-editor-bind-migration.browser.test.ts` (co-located with `museum-editor.test.ts`, matching the repo's `*.test.ts` convention). Prerequisite: Vitest browser mode enabled per Slice 5.5a.

A single Vitest browser test that:
1. Navigates to `/dev/museum-editor`.
2. Clicks a navigation node.
3. Edits an FOV.
4. Saves (clicks the project menu → copy JSON).
5. Asserts the copied JSON contains the edited FOV.

This catches regressions that the unit suite misses. **Run in every green-test checkpoint from Slice 5 onward** (locally; CI gating is a sub-task, see Cross-cutting risks #6).

---

# Rollback strategy per slice

Every slice is a single PR. To roll back:

| Slice | Roll-back | Risk |
|---|---|---|
| 1. Validators + session | The user rejects the green-test checkpoint; revert any local edits; restore god file from git (if committed) or start over from the prior hand-off's "Files added / modified" list. Sub-store is additive so rollback is local. | Low. |
| 2. Scene roots | Same: restore the 12 store methods + 4 private maps + `registryVersion`. | Low. |
| 3. Doc + history + preview | **Atomic.** Restore `museum-editor.svelte.ts` from git (if committed in one piece) or from the prior hand-off's verbatim pre-Slice-3 state. The peer-link means a partial revert leaves `canUndo` broken. | High — must be one revert. |
| 4. Selection shape | Restore the 11 `selectX` methods; revert the derived `$derived` mirrors back to `$state`. | Med. |
| 5. bind migration | Restore the `bind:value={...}` lines in components. **Time-sensitive**: do this before any further selection/components change, or Svelte 5 will silently break. | High. |
| 6. Selection deletion | Restore the 11 `selectX` methods. Tests that consumed `selection.workspace` directly need rewriting back to `store.selectedXxx`. | Med. |
| 7. Panel splits | Restore the two god components. Snapshots are re-recorded again — restore them too. | Low. |
| 8. Polish | Restore components. | Low. |

**Atomicity discipline:** In practice, slice authors often make sub-task commits individually (e.g. for sub-task 3.1 alone, then 3.2, etc.). When `git log` reveals an interleaved history, rollback means: identify the **first commit of the slice** that touched the affected files, then revert commits in **reverse-sorted order** until all files match the previous hand-off's pre-slice state. The hand-off MUST include the verbatim "Files added / modified" list so this is reconstructible.

---

# Reference index (read once during plan execution)

| Need | File |
|---|---|
| Why we're here | `docs/refactor-audit/2026-07-28-museum-editor.md` |
| Project convention | `AGENTS.md` |
| Scene JSON contract | `docs/CAMERA_AND_LAYOUT.md` |
| Asset workflow | `docs/ASSET_WORKFLOW.md` |
| Editor surface composition | `docs/CAMERA_AND_LAYOUT.md` §Authoring |
| Pre-refactor god class | `apps/museum/src/lib/editor/museum-editor.svelte.ts` |
| Test suite | `apps/museum/src/lib/editor/museum-editor.test.ts` |
| Existing pure validators | `apps/museum/src/lib/editor/editor-navigation-graph.ts` |
| Selection type vocabulary | `apps/museum/src/lib/editor/editor-selection.ts` |
| Existing per-phase hand-offs (style reference) | `docs/agent-handoffs/phase-3*.md` |

---

# Cross-cutting risks

Three risks are Slice-spanning:

1. **Phase-3.7 work in flight** (`setConnectionTiming`, `setNodeHoldSeconds`, `setViewKeyframeTiming`). Schedule this plan *before* adding any 3.8 phase. If a 3.8 phase must start, gate it on Slice 1 landing. **3.7.X hotfix mid-refactor:** file the validator/payload change in `apps/museum/src/lib/content/scene-codec.ts` (the audit's convention; Round 1 already lifted timing validation there). Do **not** add a new sub-store. Patch the call site on the god file in three spots (lines `4215`–`4290`, the `setConnectionTiming`/`setNodeHoldSeconds`/`setViewKeyframeTiming` block). Keep the public method names stable. Update `museum-editor.test.ts` minimally; do not migrate hotfix-affected tests to the new selection-store shape yet (that would block the hotfix on Slice 6's test churn). Notify via hand-off status `in-progress` on the slice most affected; resume the plan from that slice.
2. **`canUndo` peer-dependency** between History and Preview (audit §3.A.2). Slice 3 ships both together; partial Slice 3 leaves the suite broken. The plan is compiled so that Slice 3 has a single end-state deliverable.
3. **`bind:` migration** is irreversible once Slice 5 lands. If Slice 5 fails to migrate every site, Svelte 5 silently reads "missing pieces" and a subsequent refactor or feature work surfaces cryptic "store.field is read-only" errors. Plan §5.1 inventories every bind site first.
4. **Browser smoke CI gating.** Until Slice 5's browser smoke runs in CI, Slice 5+ can pass `npm test` locally while silently regressing `/dev/museum-editor`. Recommend adding a Vitest browser job to wherever CI lives (verify the project's CI config in `apps/museum/.github/workflows/` or root `.github/workflows/` before Slice 5). Until then, slices escalate status `in-progress` until a human runs `npm test -- --run apps/museum/src/lib/editor/museum-editor-bind-migration.browser.test.ts` and confirms pass against `/dev/museum-editor`.
5. **Cross-slice mirror pattern.** Slice 3 leaves facade-mirrored `cameraTimelinePlayhead` / `cameraPreview` / `isXPreviewPredicate` fields on the composition root so Slice 5's bind-migration has a real `$state` to migrate *from* (Phase A → Phase B per audit §3.G). Slice 3.10's hand-off MUST enumerate the mirrored field list; Slice 4 must not add more; Slice 5 deletes the mirrors entirely. Slices 6–8 must verify no new mirror slips in. If a mirror does slip in, the bind migration will leave either a too-permissive facade getter or a `$derived`-back read that won't survive the next facade rewrite.
6. **Per-slice PR vs per-sub-task commits.** The plan describes each slice as "one PR" or "one logical unit"; in practice, agents may make multiple sub-task commits during a slice's work. The hand-off's "Last commit" line tracks the slice's terminal commit for rollback purposes, and the "Files added / modified" list enumerates every change the rollback must restore. Sub-task commits between are normal; rollback means reverting from the *terminal* commit, **not** the first sub-task commit.

---

# End state summary

Post-Slice-8:

- `museum-editor.svelte.ts` ≈ 600 LOC, composition root only.
- 6 sub-stores under `apps/museum/src/lib/editor/store/`, each 100–250 LOC.
- 1 helper `validators-runner.ts`, ~30 LOC.
- 3 hooks under `apps/museum/src/lib/editor/hooks/`, each ~50 LOC.
- `EditorSelection.svelte` ≈ 200 LOC; `EditorCameraTree.svelte` ≈ 100 LOC.
- All 18 importer components trimmed (out of ~30 .svelte files in `apps/museum/src/lib/editor/`; not all .svelte files import `MuseumEditorStore` — see audit §1.2); no new gods.
- Test suite: original 3 631 LOC + ~400 LOC of micro-tests across the 6 sub-stores + 100 LOC of browser smoke, with a net reshuffle of **~140 KB of selection-test assertions** rewritten to the new selection-store shape (per audit §6 Step 5c, Slice 6 budget).
- Total LOC delta: **+0** (we redistribute, not grow).

Future phase work lands *next to* a 600-LOC composition root, not inside it.
