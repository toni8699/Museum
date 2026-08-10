# Museum Editor Full Track Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan phase-by-phase. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Vision:** Push the museum editor toward a full-featured single-project museum scene editor — rough architectural layout + per-asset authoring for all 7 rooms, with local GLB import + compression baked in. **Not multi-project.**

**Goal:** Three phases shipped in sequence:

- **Phase 1a — Independent Scale UX.** Uniform ↔ Independent toggle in transform inspector; gizmo + cluster propagation honour the mode. Default `uniform` (existing behavior preserved).
- **Phase 1b — Placement Ghost Preview.** Wireframe OBB ghost follows cursor once placement is armed. Click on a museum-room floor commits, Escape cancels. Reusable for all placement paths. **Click-based UX for arming and committing — no drag-and-drop.**
- **Phase 2 — Architecture Shape Catalogue.** Semantic `Wall / Floor / Ceiling / Column / Door` entries layered on existing `box / plane / cylinder`; `Add → Architecture` submenu. Default dimensions + per-axis scale vector on placement. Uses Phase 1b's placement-ghost helper.
- **Phase 3 — Local Asset Import + Compression Pipeline + Cross-Room Editing.** Click `+ Add asset…` → Browse… opens native file picker (no drop zone); GLB/GLTF stages → gltf-pipeline → catalogue entry → place in any room (via Phase 1b ghost). Lift Paris-only gate; assets load on demand for any room.
- **Phase 4+ — TBD.** Schema v7 visitor fidelity, multi-opening walls, asset replace flow, persistent scaleMode setting, marquee box-select, toolbar mode chip.

**Architecture:** Pure helpers (`scale-vector.ts`, `architecture-shapes.ts`) decouple decisions from Three. State (`scaleMode`) lives on `EditorInteractionStore`'s reactive surface. Phase 3 splits the import onto a vite dev-only plugin (`asset-import-plugin` + `asset-compress-job`) so production builds never carry the pipeline. State machine in `asset-import-controller.svelte.ts` exposes: `idle → staging → compressing → ready → placed`. Visitor render path unchanged across all three phases (schema v6 only). Cross-room load + Paris gate lifted for editor; visitor stays route-driven + catalogue hint.

**Tech Stack:** TypeScript 5.8, Svelte 5 runes, SvelteKit 2, Vitest 3, Three.js, `gltf-pipeline` (dev-only), `toktx` (system tool, optional — Phase 3 only).

## Global Constraints (every phase must satisfy)

- **Single project.** Editor stays scoped to `@portfolio/museum`. No multi-project. (Track title says "limited to single museum project" and we honour that.)
- **No new runtime deps** for Phase 1 + 2. Phase 3 adds `gltf-pipeline` to `devDependencies` only (not `dependencies`); optional `toktx` system tool may be absent.
- **Default `scaleMode = 'uniform'`.** Existing scenes and visitor render paths byte-identical after Phase 1.
- **Schema v6 stays untouched** through Phase 1 + 2 + 3. Additive: Phase 3 extends `assets.ts` catalogue and (optionally) accepts a top-level `assets: AssetImportEntry[]` on document JSON; codec accepts v1–v6, canonical v6 with empty `assets` if absent.
- **Visitor chunk isolation preserved.** Grep keyword blocks grow with each phase; expected 0 matches after each ship.
- **No commits per `AGENTS.md`.** Verification via `verify gates`, not `git commit`.
- **Archive boundary unchanged.** Old phase-6.5 spec + plan live at [`archive/superpowers/specs/museum-editor-full-track/`](../../archive/superpowers/specs/museum-editor-full-track/) and [`archive/superpowers/plans/museum-editor-full-track/`](../../archive/superpowers/plans/museum-editor-full-track/) — read-only.
- **Verification command** for any code change:
  ```bash
  cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run <focused> && npm run check -w @portfolio/museum
  ```
  Production build + chunk grep only at end-of-phase (Phase 1 Task 4; Phase 2 Task 4; Phase 3 Task 6).

## Phased work breakdown

Each phase ship-able independently. Each phase leaves a stable state for downstream phases.

- [ ] **Phase 1a — Independent Scale UX** (`#independent-scale-ux`)
- [ ] **Phase 1b — Placement Ghost Preview** (`#placement-ghost-preview`)
- [ ] **Phase 2 — Architecture Shape Catalogue** (`#architecture-shape-catalogue`)
- [ ] **Phase 3 — Local Asset Import + Compression + Cross-Room Editing** (`#asset-import-compression-cross-room`)
- [ ] **Phase 4+ — TBD** (`#phase-4-tbd`)

---

## Phase 1a — Independent Scale UX

4 tasks. ~27 new tests. Lands scaleMode toggle, gizmo gating, cluster non-uniform propagation.

#### Task 1.1 — Pure scale-vector helpers

**Files:**
- Create: `apps/museum/src/lib/editor/scale-vector.ts`
- Create: `apps/museum/src/lib/editor/scale-vector.test.ts`

**Step 1:** Write failing test file (mirroring  `archive/superpowers/plans/museum-editor-full-track/2026-08-09-phase-6-5-architecture-shaping-plan.md` §Task 1 — same body).

**Step 2:** Run test; expect FAIL (module not found).

**Step 3:** Implement `scale-vector.ts` per spec §2.

**Step 4:** Run test; expect 14 PASS.

**Step 5:** Verify gates.

#### Task 1.2 — PlacementTransform extension + interaction-store scaleMode

**Files:**
- Modify: `apps/museum/src/lib/editor/editor-transform.ts` — extend `PlacementTransform` with `scaleScalar`, `scaleVector: Vec3 | null`, `scaleMode: ScaleMode`. Update `placementTransformFromDocument` / `writePlacementTransform` per spec §4.
- Modify: `apps/museum/src/lib/editor/editor-transform.test.ts`
- Modify: `apps/museum/src/lib/editor/store/editor-interaction-store.svelte.ts` — add `scaleMode: 'uniform' \| 'independent'` (default `uniform`), `toggleScaleMode()`, `setScaleMode(mode)`.
- Modify: `apps/museum/src/lib/editor/store/editor-interaction-store.test.ts`

**Step 1:** Write failing tests for scaleVector round-trip + scaleMode default + toggle.

**Step 2:** Run; expect FAIL.

**Step 3:** Implement.

**Step 4:** Verify gates.

#### Task 1.3 — Inspector chain icon + X/Y/Z fields

**Files:**
- Modify: `apps/museum/src/lib/editor/EditorTransformInspector.svelte`
- Modify: `apps/museum/src/lib/editor/EditorTransformInspector.test.ts` (extend)

**Step 1:** Write failing tests.

**Step 2:** Run; expect FAIL.

**Step 3:** Replace "Uniform scale" fieldset with chain-icon button + conditional fieldset (single vs three fields).

**Step 4:** Verify gates.

#### Task 1.4 — Gizmo + cluster non-uniform propagation + handoff

**Files:**
- Modify: `apps/museum/src/lib/editor/EditorTransformControls.svelte` — gate `enforceUniformObjectScale` on `interactionStore.scaleMode === 'uniform'`. Independent: rely on per-frame `root.scale.copy(t.scale)`; commit writes `scaleVector`.
- Modify: `apps/museum/src/lib/editor/editor-cluster-transform.ts` — branch on mode; independent = per-axis delta from `lastSelectedId` member.
- Modify: `apps/museum/src/lib/editor/editor-cluster-transform.test.ts` (extend)
- Create: `docs/agent-handoffs/phase-6.5-1.md`
- Modify: `docs/agent-handoffs/CURRENT.md` — Point at Phase 6.5.1 handoff; next pointer → Phase 2 of this plan.

**Step 1:** Write failing cluster test.

**Step 2:** Run; expect FAIL.

**Step 3:** Implement gizmo + cluster.

**Step 4:** Verify gates (vitest + svelte-check + build).

**Step 5:** Run visitor chunk grep `scale-vector`; expect 0 matches.

**Step 6:** Write handoff + update CURRENT.

---

## Phase 1b — Placement Ghost Preview

5 tasks. ~6 new tests. Cross-cutting placement helper used by Phase 1a (existing primitive placement), Phase 2 (architecture shapes), Phase 3 (assets). Click-based UX everywhere.

#### Task 1b.1 — Pure placement-ghost helpers + tests

**Files:**
- Create: `apps/museum/src/lib/editor/placement-ghost.ts`
- Create: `apps/museum/src/lib/editor/placement-ghost.test.ts`

**Step 1:** Write failing tests:
- `projectPointerToFloor(camera, pointer, floorTargets)` returns nearest placeable-floor hit with roomId.
- `computeGhostValidity(hit, prototype, workingRoomId)` returns `{ isValid: boolean, reason: 'no-floor' | 'off-grid' | 'off-room-bounds' | 'collision' | 'ok', ghostPosition, ghostRotation }`.
- `computeGhostMatrix(validation, prototype)` returns the matrix that drives the OBB ghost.
- Color states per spec §2 table (valid green, no-floor coral, off-grid amber, cluster lavender).

**Step 2:** Run; expect FAIL.

**Step 3:** Implement.

**Step 4:** Verify gates (~4 PASS).

#### Task 1b.2 — placement-cluster-mutator arm/commit/cancel API

**Files:**
- Modify: `apps/museum/src/lib/editor/store/placement-cluster-mutator.svelte.ts` — `armPlacement(prototype)` + `commitPlacement(prototype, ghostMatrix)` + `cancelPlacement()`. Replaces today's `beginPrimitivePlacement`-as-arming flow.
- Modify: `apps/museum/src/lib/editor/store/placement-cluster-mutator.test.ts` (extend)
- Modify: `apps/museum/src/lib/editor/museum-editor.svelte.ts` — facade passthrough.

**Step 1:** Write failing tests.

**Step 2:** Run; expect FAIL.

**Step 3:** Implement. Existing primitive kinds (`box`, `plane`, `cylinder`, `sphere`) all flow through `armPlacement({ primitiveKind, dimensions, ... })`.

**Step 4:** Verify gates.

#### Task 1b.3 — placement-ghost.svelte component

**Files:**
- Create: `apps/museum/src/lib/editor/placement-ghost.svelte`
- Create or extend: `apps/museum/src/lib/editor/placement-ghost.test.ts` (component test)

**Step 1:** Write failing test:
- Ghost renders only when armed AND `store.placementController.armed === true`.
- Per-frame `useTask` projects cursor → placeable floor → ghost matrix.
- Click on valid floor → commits; click on invalid or Escape → cancels.
- Material matches spec §2 (LineBasicMaterial, depthTest=false, transparent, opacity per state, renderOrder=2000, raycast=null).

**Step 2:** Run; expect FAIL.

**Step 3:** Implement component using `obb-util.ts` factories (Phase 6.2 carry-over). `localCornersInto(matrix, localBox, positionBuffer)` streams 8 corners per frame; index + position buffer geometry attached as one `LineSegments` to the scene.

**Step 4:** Verify gates (~2 PASS).

#### Task 1b.4 — Wire pointer + click + Escape plumbing

**Files:**
- Modify: `apps/museum/src/lib/editor/EditorSelection.svelte` (or `EditorViewport.svelte` if pointer landing lives there) — on `pointermove`, update cursor ghost matrix; on `click`, commit if valid; on `keydown Escape`, cancel. Reuse existing pointer + keyboard listeners.

**Step 1:** Wire pointer events to placement-ghost helpers.

**Step 2:** Run; existing tests stay green.

**Step 3:** Verify all mouse interactions work in dev editor (`/dev/museum-editor`).

#### Task 1b.5 — Polish — handoff doc + visitor chunk grep + manual checklist

**Files:**
- Create: `docs/agent-handoffs/phase-6.5-1b.md`
- Modify: `docs/agent-handoffs/CURRENT.md` — point at Phase 6.5.1b handoff; next pointer → Phase 2 of this plan.

**Step 1:** Production build + visitor chunk grep `placement-ghost`; expect 0 matches.

**Step 2:** Manual walkthrough doc testing Phase 1a + 1b combined (existing primitive placement now shows ghost).

**Step 3:** Handoff doc mirroring `phase-6.5-1a.md` structure.

**Step 4:** Update CURRENT.

---

## Phase 2 — Architecture Shape Catalogue

4 tasks. ~9 new tests. Lands 5 named shape entries, Add menu submenu, preset placement flow.

#### Task 2.1 — Pure architecture-shapes catalogue

**Files:**
- Create: `apps/museum/src/lib/editor/architecture-shapes.ts`
- Create: `apps/museum/src/lib/editor/architecture-shapes.test.ts`

**Step 1:** Write failing test file (5 named entries; positive-finite dimensions; `defaultScaleVector` valid where present).

**Step 2:** Run; expect FAIL.

**Step 3:** Implement `ARCHITECTURE_SHAPE_LIBRARY` per spec §2 + `getArchitectureShape(id)` + `listArchitectureShapes()`.

**Step 4:** Verify gates (~6 PASS).

#### Task 2.2 — Placement flow accepts architecture shape preset

**Files:**
- Modify: `apps/museum/src/lib/editor/store/placement-cluster-mutator.svelte.ts` — `beginArchitectureShapePlacement(id: ArchitectureShapeId)` + extend `beginPrimitivePlacement({ preset })`.
- Modify: `apps/museum/src/lib/editor/museum-editor.svelte.ts` — facade passthrough.
- Modify: `apps/museum/src/lib/editor/store/placement-cluster-mutator.test.ts` (extend)

**Step 1:** Write failing tests.

**Step 2:** Run; expect FAIL.

**Step 3:** Implement.

**Step 4:** Verify gates.

#### Task 2.3 — Add → Architecture menu

**Files:**
- Modify: `apps/museum/src/lib/editor/EditorPlacementTools.svelte` (or wherever Add menu lives) — restore Add menu; add `Add → Architecture` submenu. (Decision #3 in spec — first cut ships Architecture-only. Full Add menu restoration deferred to Phase 4 polish.)
- Modify: `apps/museum/src/lib/editor/EditorPlacementTools.test.ts` (extend)

**Step 1:** Write failing tests.

**Step 2:** Run; expect FAIL.

**Step 3:** Implement.

**Step 4:** Verify gates.

#### Task 2.4 — Polish — handoff doc + visitor chunk grep + manual checklist

**Files:**
- Create: `docs/agent-handoffs/phase-6.5-2.md`
- Modify: `docs/agent-handoffs/CURRENT.md` — point at Phase 6.5.2 handoff; next pointer → Phase 3.

**Step 1:** Production build + visitor chunk grep `architecture-shapes`; expect 0 matches.

**Step 2:** Manual walkthrough doc.

**Step 3:** Handoff doc mirroring `phase-6.5-1.md` structure.

**Step 4:** Update CURRENT.

---

## Phase 3 — Local Asset Import + Compression + Cross-Room Editing

6 tasks. ~22 new tests. Lands click-based file-picker import, gltf-pipeline compression, cross-room asset loading.

#### Task 3.1 — Vite plugin: asset import endpoint

**Files:**
- Create: `apps/museum/vite/asset-import-plugin.ts`
- Create: `apps/museum/vite/asset-import-plugin.test.ts`

**Step 1:** Write failing vite plugin test:
- POST `/__asset-import` with multipart `{ original: File, metadata }` writes byte-identical file under `assets-source/models/incoming/<id>/`.
- Returns 200 with `{ id, bytesIn, status: 'staged' }`.
- Plugin applies `apply: 'serve'` so production build excludes.

**Step 2:** Run; expect FAIL.

**Step 3:** Implement plugin:
- Hook into `configureServer`.
- `app.post('/__asset-import', ...)` reads `multipart/form-data`.
- Generates id = `${name}-${shortHash()}`.
- Writes original file under `assets-source/models/incoming/<id>/`.
- Writes stub `assets-source/<id>.md` licence placeholder (file contents `TBD`).
- Returns ack payload.

**Step 4:** Verify gates (~4 PASS).

#### Task 3.2 — Vite plugin: asset compress endpoint

**Files:**
- Create: `apps/museum/vite/asset-compress-job.ts`
- Create: `apps/museum/vite/asset-compress-job.test.ts`

**Step 1:** Write failing test:
- POST `/__asset-compress` with `{ id }` runs `gltf-pipeline -i ... -o ... --draco --texture-compress ktx2`.
- Writes optimized GLB to `static/museum/models/<id>.glb`.
- Updates `assets-source/<id>.md` manifest with bytesIn/bytesOut.
- Returns `{ id, status, bytesIn, bytesOut }`.

**Step 2:** Run; expect FAIL.

**Step 3:** Implement:
- `execFile(gltf-pipeline, [...])` with timeout.
- Fallback when `toktx` missing: banner logged; cli args drop `--texture-compress ktx2`; status returns `degraded`.
- Cache: skip when `optimizedPath` newer than input; command-line `--quiet` on second run.

**Step 4:** Verify gates (~3 PASS).

#### Task 3.3 — Asset import controller (state machine)

**Files:**
- Create: `apps/museum/src/lib/editor/asset-import-controller.svelte.ts`
- Create: `apps/museum/src/lib/editor/asset-import-controller.test.ts`

**Step 1:** Write failing tests:
- State transitions: `idle → staging` after `Browse…` change event fires.
- `staging → compressing` after Optimize click.
- `compressing → ready` after success.
- `compressing → failed` on compression error.
- `* → idle` on Cancel.
- Errors surface to UI.
- `requestPlace()` triggers `armPlacement({ primitiveKind: 'model', ... })` from Phase 1b and dismisses dialog.

**Step 2:** Run; expect FAIL.

**Step 3:** Implement:
- $state machine with `$state` enum + message.
- Methods: `startBrowse(file)`, `requestOptimize()`, `cancel()`, `requestPlace()`.
- Side effects: HTTP to vite plugin endpoints.
- Undo: cancel writes a `history:undoable` flag for editor stack.
- Phase 1b integration: `requestPlace()` calls `armPlacement({ ... })`.

**Step 4:** Verify gates (~6 PASS).

#### Task 3.4 — AssetImportDialog + EditorAssetPicker UI

**Files:**
- Create: `apps/museum/src/lib/editor/AssetImportDialog.svelte`
- Create: `apps/museum/src/lib/editor/EditorAssetPicker.svelte`
- Create: `apps/museum/src/lib/editor/AssetImportDialog.test.ts`
- Create: `apps/museum/src/lib/editor/EditorAssetPicker.test.ts`

**Step 1:** Write failing tests:
- AssetImportDialog: **Browse button** opens native file picker (`<input type="file" accept=".glb,.gltf">`); no drop zone; no drag event listeners. Optimize button enables after stage; Cancel drops file.
- AssetImportDialog: clicking Place in scene invokes `armPlacement({ primitiveKind: 'model', ... })` from Phase 1b; dialog dismisses.
- EditorAssetPicker: lists built-in + imported entries; click arms placement; undoable.
- Phase 1b's `placement-ghost` component receives the asset `armPlacement` event and renders correctly.
- Error banner appears when license missing.

**Step 2:** Run; expect FAIL.

**Step 3:** Implement dialog + picker components (see spec §3 for layout sketches). Drag-and-drop removed.

**Step 4:** Verify gates (~4 PASS).

#### Task 3.5 — Asset library mutator + assets.ts extension

**Files:**
- Modify: `apps/museum/src/lib/content/assets.ts` — add `AssetImportEntry` type + export `ASSET_CATALOGUE`. Existing `museumAssets` stays; additive merge. `roomHints: MuseumRoomId[]` filter on `getAssetById`.
- Modify: `apps/museum/src/lib/content/assets.test.ts` (extend)
- Create: `apps/museum/src/lib/editor/store/asset-library-mutator.svelte.ts`
- Create: `apps/museum/src/lib/editor/store/asset-library-mutator.test.ts`

**Step 1:** Write failing tests:
- `addAsset(entry)` registers asset in catalogue.
- `removeAsset(id)` registers undoable entry.
- `rotateImport(id, roomHints)` updates room hints without breaking visitor lookup.
- `assets.ts`: `getAssetById` reads merged catalogue. `roomHints.includes(activeRoom)` filter yield.

**Step 2:** Run; expect FAIL.

**Step 3:** Implement.

**Step 4:** Verify gates (~8 PASS combined with Task 3.6 tests).

#### Task 3.6 — Cross-room editing (AssetModel + MuseumAssets gate lift)

**Files:**
- Modify: `apps/museum/src/lib/museum/assets/AssetModel.svelte` — drop Paris-only gate; `visible = editorForceLoad || routeNeedsAsset(id) || asset.roomHints.includes(activeRoom)`.
- Modify: `apps/museum/src/lib/museum/assets/AssetModel.test.ts` (extend)
- Modify: `apps/museum/src/lib/museum/MuseumAssets.svelte` — preload per working-room logic: `workingRooms = editorActiveRoom ? [editorActiveRoom] : activeRoute.rooms`.
- Modify: `apps/museum/src/lib/museum/MuseumAssets.test.ts` (extend)
- Modify: `docs/ASSET_WORKFLOW.md` — document the import → compression pipeline.

**Step 1:** Write failing tests:
- AssetModel: editor-force-loads assets for any room.
- AssetModel: route-driven load preserves Paris-only behaviour when roomHint absent.
- MuseumAssets: preload loop iterates working rooms (editor + route).
- AssetLibrary registry: covers all 7 rooms.

**Step 2:** Run; expect FAIL.

**Step 3:** Implement + lift Paris gate.

**Step 4:** Verify gates + visitor chunk grep `asset-import-plugin`, `asset-compress-job`, `asset-import-controller`, `AssetImportDialog`, `EditorAssetPicker`, `asset-library-mutator`; expect 0 matches.

**Step 5:** Production build + manual walkthrough: **click Browse… in editor**, optimize, place in Departure Hall, visit `/museum`, navigate to Departure Hall, asset renders.

**Step 6:** Handoff doc + CURRENT update.

---

## Phase 4+ — TBD

Pointer only. Sorted in priority order for the next track:

- **Phase 4 — Schema v7 with `scaleVector` + asset array.** Bumps schema to v7; adds `scaleVector: [number, number, number] | null` to `SceneObjectPlacement`; migration script regenerates from v6; visitor renders per-axis; closes Phase 1 + 3 lossiness in one canonical step.
- **Phase 5 — Multi-opening walls + path clearance.** `museum-shell` extension for per-wall-side opening arrays. Path resolver adds clearance for named architecture shapes.
- **Phase 6 — Asset replace flow + UX polish.** Graybox wall/floor → drop matching real-asset → confirm → archive graybox. Persistent `scaleMode` setting. Toolbar mode chip. Marquee box-select.

Each subsequent phase is a separate plan documented under `docs/superpowers/specs/` + `docs/superpowers/plans/`. Current track ends at Phase 3 ship.

---

## Open Decisions for Reviewer (sign-off before subagent dispatch)

| # | Decision | Options |
|---|---|---|
| 1 | Phase 1 visitor fidelity lossiness | (a) ship as documented lossiness; (b) defer Phase 1 ship until schema v7 ready |
| 2 | Phase 1 persistence | (a) session-only v1; (b) extend settings-store with `scaleMode` key |
| 3 | Phase 2 Add menu scope | (a) Architecture-only first cut; (b) restore full Camera + 4 primitives + 5 architecture entries; (c) restore full menu + group under "Geometry" vs "Architecture" |
| 4 | Phase 3 licence blocker | (a) hard-block placement on missing licence file; (b) warn + continue + visible flag |
| 5 | Phase 3 KTX2 fallback | (a) PNG/JPEG with banner (degraded); (b) hard-fail; (c) PNG/JPEG silent |
| 6 | Phase 3 visitor preload scope | (a) editor working-room override lifts Paris gate, but visitor still route-driven; (b) visitor gets fallback auto-preload for ALL assets at route start (large but predictable) |
| 7 | Phase 3 `assets.ts` migration | (a) additive schema v6 keeps v1–v6 valid; (b) bump to v7 with `AssetImportEntry[]` + `scaleVector` simultaneously (defer Phase 1 lossiness fix to here) |
| 8 | Phase 3 editor force-load surface | (a) `forceLoad` prop on `AssetModel.svelte` toggled by `EditorForceLoadStore`; (b) explicit room-override prop in MuseumAssets |
| 9 | Phase 1 cluster anchor for non-uniform | (a) `lastSelectedId` (consistent with Active Object); (b) centroid member; (c) designer chooses via chain-icon toggle |
| 10 | Phase 3 file import UX | (a) click Browse + native file picker (current default — **drag-and-drop removed**); (b) restore drag alongside Browse as alt-entry |
| 11 | Phase 1b ghost color across validity states | (a) light-green valid / coral no-floor / amber off-grid / lavender cluster-invalid (current default); (b) monochrome with brightness/opacity ramp |
| 12 | Phase 1b ghost when off-grid invalid | (a) hide ghost entirely (current recommendation); (b) push ghost off-screen + render red; (c) keep ghost at last valid position + render red |

Sign-off required before any Task subagent dispatch.

---

## Cross-Phase Acceptance Criteria

| Gate | Target |
|---|---|
| Vitest total | 963 (Δ +64 over Phase 6.2 baseline 899) |
| `npx svelte-check` | 0 / 0 |
| `npm run build` | exit 0 |
| Visitor chunk grep `placement-ghost\|scale-vector\|architecture-shapes\|asset-import-plugin\|asset-compress-job\|asset-import-controller\|AssetImportDialog\|EditorAssetPicker\|asset-library-mutator` | 0 matches |
| Schema JSON unchanged through Phase 1–3 | confirmed |
| Manual walkthrough | all 11 combined steps (spec §5) |
| Cross-room: dev editor working-room override loads assets for any of 7 rooms | confirmed via AssetModel test |
| Each phase ships standalone | confirmed (no phase is gated on subsequent phase) |
