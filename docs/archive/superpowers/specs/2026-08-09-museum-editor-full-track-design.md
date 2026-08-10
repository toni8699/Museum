# Museum Editor Full Track — Single-Project Editor Vision

**Date:** 2026-08-09  
**Status (2026-08-10):** **Deferred as P0.** North star is layout-first / Chopin-as-data — [`../../museum-editor/north-star.md`](../../museum-editor/north-star.md). Active plan: [`../plans/2026-08-10-layout-cad-foundation.md`](../plans/2026-08-10-layout-cad-foundation.md).  
**Phase 1** (independent scale + placement ghost) **shipped**. Phase 2 scene presets + Phase 3 GLB **deferred** (optional / later).  
**Track:** Historical full-track expansion after Phase 6; kept for archaeology and optional dressing/asset work.

---

## §0 — Goal

~~Push the museum editor from "interaction-parity…" toward a full-featured single-project museum scene editor~~  

**Superseded goal:** empty canvas → draw/relocate rooms → serialize project (layout + scene) → load complex → camera on top; Chopin migrates off `rooms.ts`. See north star.

Historical full-track goal (dressing + GLB inside fixed Chopin rooms) remains useful as **content** work after architecture is data-backed—not as the path that creates rooms.

### Track layout

| Phase | Surface | Status |
|---|---|---|
| **1 — Independent Scale UX + Placement Ghost Preview** | (1a) Uniform ↔ Independent toggle; gizmo + cluster honour mode. Default `uniform`. (1b) Placement Ghost — click floor commits, Esc cancels. Click-based UX. | **Shipped** (working tree; handoff archived) |
| **2 — Architecture Shape Catalogue + scale gizmo deadstop** | Semantic `Wall / Floor / Ceiling / Column / Door`; `Add → Architecture` submenu; defaults + per-axis scale. **Plus:** scale gizmo deadstop — clamp at `MIN_PLACEMENT_SCALE`; flatten to plane; never cross 0 / reverse. | **Next** |
| **3 — Local Asset Import + Compression + Cross-Room Editing** | Click `Add asset → Browse…`; gltf-pipeline Draco + KTX2; place any room. Lift Paris-only gate. | Spec drafted |
| **4+ — TBD** | Visitor vector fidelity (schema v7), multi-opening walls, asset-replace, marquee, persistent scaleMode, toolbar chip. | Pointer §6 |

Each phase ships standalone. The **placement ghost pattern (Phase 1b)** is cross-cutting — applies to primitive placement today, architecture shapes in Phase 2, asset placement in Phase 3.

### Placement UX (cross-phase design)

The editor's placement flow is **click-based, drag-free** for arming AND committing:

```
Click an item in a list (asset / shape / primitive type)
  ↓ state machine: armed
  ┌─ PlacementGhost wireframe OBB follows the cursor
  │   - green when over valid museum-room floor + valid room containment
  │   - red when invalid (no floor / off-grid / out of bounds)
  │   - dim transparency 0.55, depthTest=false, renderOrder=2000
  │   - per-frame OBB corners streamed via existing obb-util streaming
  └─ 
Click on a museum-room floor     → commit; entity created with prototype transform = ghost matrix
Click outside floor / Esc        → cancel armed state; ghost disappears
```

File imports (Phase 3) similarly favor click over drag: native file picker dialog (`<input type="file">`), not drag-and-drop drop zone.

UX rationale: drag-and-drop on a 3D viewport interferes with camera orbit + gizmo drags. Click-based flow keeps placement deterministic and the ghost outline readable at all times.

## §1 — Architecture + Component Map

### Phase 1 — Independent Scale UX + Placement Ghost Preview

| File | Type | Role |
|---|---|---|
| `apps/museum/src/lib/editor/scale-vector.ts` | NEW | Pure: `isUniform`, `normalizeScale`, `dominantMode`. No Three imports. |
| `apps/museum/src/lib/editor/scale-vector.test.ts` | NEW | ~14 unit tests. |
| `editor-transform.ts` | MODIFY | `PlacementTransform` gains `scaleVector: Vec3 \\| null` + `scaleMode`. `placementTransformFromDocument` / `writePlacementTransform` coerce scalar ↔ vector; schema-v6 only carries scalar. |
| `store/editor-interaction-store.svelte.ts` | MODIFY | Add `scaleMode: 'uniform' \\| 'independent'` (default `'uniform'`), `toggleScaleMode()`, `setScaleMode(mode)`. |
| `EditorTransformInspector.svelte` | MODIFY | Replace "Uniform scale" fieldset with conditional row: chain-icon toggle + (uniform → single field) or (independent → X / Y / Z fields). |
| `EditorTransformControls.svelte` | MODIFY | Gate `enforceUniformObjectScale` on `scaleMode`. Independent: rely on per-frame `root.scale.copy(t.scale)`; drag commit writes `scaleVector`. |
| `editor-cluster-transform.ts` | MODIFY | Branch on mode. Independent: per-axis delta from anchor member (`lastSelectedId`). |
| `apps/museum/src/lib/editor/placement-ghost.ts` | NEW (Phase 1b) | Pure: `armPendingPlacement(state) → armed \| cancelPendingPlacement()`, `computeGhostTransform(cameraRay, floorHit, prototype)`, `isValidPlacementSurface(roomId)`. No Three imports. |
| `apps/museum/src/lib/editor/placement-ghost.svelte` | NEW (Phase 1b) | Svelte component: renders one `LineSegments` OBB (rotation-aware corners via obb-util), green when valid, red when invalid; per-frame stream through cursor projection; depthTest=false, transparent 0.55, renderOrder=2000; raycast=null. |
| `apps/museum/src/lib/editor/placement-ghost.test.ts` | NEW (Phase 1b) | ~6 unit tests: arm/cancel state; valid/invalid surface; cursor projection; matrix streaming. |
| `store/placement-cluster-mutator.svelte.ts` | MODIFY (Phase 1b) | `armPlacement(prototype)` + `commitPlacement(prototype, ghostMatrix)` + `cancelPlacement()`; integrated with placement-ghost. Replaces the existing `beginPrimitivePlacement`-as-state-machine pattern (today it just arms; tomorrow it arms + ghost + commit + cancel). |
| `EditorSelection.svelte` or `EditorViewport.svelte` | MODIFY (Phase 1b) | On `pointermove`, projects cursor → nearest placeable floor → updates ghost transform via `placement-ghost.ts` helpers. On `click`, commits. On `Escape`, cancels. |

Visitor chunk isolation: Phase 1b adds `placement-ghost` to the keyword blocklist.

**Existing primitive placement benefits immediately.** The new `armPlacement` API replaces today's flow but produces the same entity at commit. Every existing primitive kind (`box`, `plane`, `cylinder`, `sphere`) becomes a candidate for ghost preview.

### Phase 2 — Architecture Shape Catalogue + scale gizmo deadstop

| File | Type | Role |
|---|---|---|
| `apps/museum/src/lib/editor/architecture-shapes.ts` | NEW | Pure: `ARCHITECTURE_SHAPE_LIBRARY` (5 named entries → underlying primitive kind + dimensions + optional `defaultScaleVector`). |
| `apps/museum/src/lib/editor/architecture-shapes.test.ts` | NEW | ~6 unit tests. |
| `store/placement-cluster-mutator.svelte.ts` | MODIFY | New `beginArchitectureShapePlacement(id)` — looks up entry, calls existing primitive placement flow with preset dimensions + vector. |
| `museum-editor.svelte.ts` | MODIFY | Facade passthrough. |
| `EditorPlacementTools.svelte` (or wherever Add lives) | MODIFY | Restore Add menu (current scratch-diff deleted it); add `Add → Architecture` submenu listing the 5 entries. |
| `editor-cluster-transform.ts` / `EditorTransformControls.svelte` | MODIFY | **Scale gizmo deadstop:** clamp each axis (and uniform scalar) at `MIN_PLACEMENT_SCALE`. Flatten to plane OK; never ≤0 / never sign-flip through zero. Open Q: inspector fields too? |

### Phase 3 — Local Asset Import + Compression + Cross-Room

| File | Type | Role |
|---|---|---|
| `apps/museum/vite/asset-import-plugin.ts` | NEW | Vite plugin. Dev-only. POST `/__asset-import` endpoint receives uploaded GLB/GLTF; writes byte-identical file under `assets-source/models/incoming/<id>/`; stages licence metadata; returns acknowledgement. Editor-only — does NOT run in production build (`apply: 'serve'`). |
| `apps/museum/vite/asset-compress-job.ts` | NEW | Dev-only background worker. On commit, runs `gltf-pipeline` with Draco + KTX2; writes optimized GLB to `static/museum/models/<id>.glb`; updates catalogue entry. Editor-only endpoint: `/__asset-compress` (POST start; GET status). |
| `apps/museum/src/lib/editor/asset-import-controller.svelte.ts` | NEW | Editor state machine: `idle → staging → compressing → ready → placed`. Persists `lastImport` per session, surfaces errors, undoable drop / cancel. |
| `apps/museum/src/lib/editor/AssetImportDialog.svelte` | NEW | Browse button + native file picker + progress bar + licence acknowledgement checkbox + commit-cancel buttons. No drag-and-drop zone. |
| `apps/museum/src/lib/content/assets.ts` | MODIFY | Add `AssetImportEntry` type: `id, originalPath, optimizedPath, sourceBounds, defaultScale, defaultRotation, licence, fallbackPrimitiveKind, roomHints`. Existing catalogue remains backward-compatible. |
| `apps/museum/src/lib/museum/assets/AssetModel.svelte` | MODIFY | Accept optional `forceLoad: boolean`. Drop the Paris-only gate — load when `forceLoad` OR route-active room matches `roomHints`. |
| `apps/museum/src/lib/museum/MuseumAssets.svelte` | MODIFY | Preload assets per active room (route-driven) OR editor-forced room (working room id from editor store). Background preload runs in matching precondition. |
| `apps/museum/src/lib/editor/EditorAssetPicker.svelte` | NEW | Catalogue panel: lists imported + built-in assets; renders bounded preview thumbnails; click arms placement flow. |
| `apps/museum/src/lib/editor/store/asset-library-mutator.svelte.ts` | NEW | Editor-side CRUD: `addAsset(entry)`, `removeAsset(id)` with undo + history. Writes to document JSON's `assets` array (schema v6 already has placeholder — extend or move forward). |
| `docs/ASSET_WORKFLOW.md` | MODIFY | Document the import → compression pipeline + licence requirement + fallback primitive behaviour. |

#### Pure types (Phase 3)

```ts
type AssetImportStatus = 'idle' | 'staging' | 'compressing' | 'ready' | 'failed';

type AssetImportEntry = {
  id: string;
  originalPath: string;          // path under assets-source/models/<id>/
  optimizedPath: string;         // path under static/museum/models/<id>.glb
  sourceBounds: Vec3;            // raw GLB bbox from gltf-pipeline --keep-attributes
  defaultScale: number;          // computed so source fits 1m × 1m × 1m unless manual
  defaultRotation: Vec3;         // optional; default [0,0,0]
  licence: AssetLicence;         // { name, source, attribution }
  fallbackPrimitiveKind: 'box' | 'plane' | 'cylinder' | 'sphere';
  roomHints: MuseumRoomId[];     // rooms where asset preloads
  importedAt: string;            // ISO timestamp
  compression: {
    draco: boolean;
    ktx2: boolean;
    bytesIn: number;
    bytesOut: number;
  };
};

type AssetLicence = {
  name: string;                  // 'CC0', 'CC-BY-4.0', 'Editorial Use Only'
  source: string;                // URL or path
  attribution: string;           // visible in editor Asset picker
};
```

### Visitor parity (all phases)

- Phase 1: no schema bump. Visitor stores `scale: number`; editor adds vector via transform map.
- Phase 2: no schema bump. Existing primitive kinds reused; semantic naming is cosmetic.
- Phase 3: schema stays v6 — `assets: AssetImportEntry[]` adds (codec accepts v1–v6 + v6 with `assets` field, canonical v6 with `assets: []` if absent). Visitor render unchanged when no new assets referenced; new assets slot through existing `MuseumAssets.svelte` preload path.
- New keywords to grep (Phase 1a + 1b + 2 + 3):
  - Phase 1b: `placement-ghost`
  - Phase 1a: `scale-vector`
  - Phase 2: `architecture-shapes`
  - Phase 3: `asset-import-plugin`, `asset-compress-job`, `asset-import-controller`, `AssetImportDialog`, `EditorAssetPicker`, `asset-library-mutator`
- All editor-only modules live behind the dev-route guard.

## §2 — Algorithms

### Phase 1 — Scale state machine (carry from old 6.5.1)

`scaleMode: 'uniform' | 'independent'`.
`PlacementTransform = { position, rotation, scaleScalar, scaleVector: null, scaleMode }` reads/writes coerce one-or-three.

Uniform + Vector3 → collapse via `scaleVector[0] ≈ scaleVector[1] ≈ scaleVector[2]` rounding (ε = 1e-6).
Independent + non-uniform → schema fallback: `placement.scale = 1`; editor transform map keeps vector for re-edit. **Best-effort visitor fidelity** (documented lossiness; revisit at schema v7 work).

### Phase 2 — Architecture Shape defaults (carry from old 6.5.2)

| Shape | kind | dim (m) | defaultScaleVector |
|---|---|---|---|
| floor | box | 1 × 0.05 × 1 | [6, 1, 6] |
| wall | box | 2 × 3 × 0.05 | [1, 1, 1] (initial scale) |
| ceiling | box | 1 × 0.03 × 1 | [6, 1, 6] |
| column | cylinder | r 0.15 / h 3 | null (uniform) |
| door | box | 0.9 × 2.1 × 0.05 | null (uniform) |

User resizes per axis in Independent mode (Phase 1). Pre-set defaults match Phase‑1 graybox room footprint conventions.

### Phase 2 — Scale gizmo deadstop (in-scope)

**Problem:** Three TransformControls scale can drag through 0 → negative component → mesh **mirrors / reverses** instead of stopping flat.

**Required:** on gizmo scale preview + commit (uniform and independent), clamp every axis to `≥ MIN_PLACEMENT_SCALE` (today `0.01`). Overshoot → deadstop; box becomes a thin plane on that axis; **no** sign flip.

**Open Q (CURRENT.md):**
1. Inspector Scale / X/Y/Z fields same clamp?
2. XYZ center handle same rule? (Assume yes.)

### Phase 3 — Asset import + compression pipeline

#### Click → pick file → staging (no drag-and-drop)

```
1. User clicks 'Add asset' button in EditorAssetPicker panel
   → AssetImportDialog opens with a single 'Browse…' button
   → Native file picker dialog opens (browser-managed)
   → User selects file.glb; <input type="file"> change event fires.
2. Editor reads File via FileReader → ArrayBuffer (no drop zone; no drag event listeners).
3. asset-import-controller: id = `${name}-${shortHash()}`.
4. POST /__asset-import with multipart { original: File, metadata: JSON }.
   - vite-plugin writes file under assets-source/models/incoming/<id>/
   - drops a stub assets-source/<id>.json licence stub
5. AssetImportController transitions: idle → staging.
6. UI shows: "Saved original. Click Optimize to compress."
```

Decision log #10 (added): **drag-and-drop removed entirely.** Drag interferes with viewport camera-orbit + gizmo drag. Native file picker is more discoverable + accessible.

#### Optimize → ready

```
1. User clicks Optimize.
2. POST /__asset-compress with { id }.
   - vite-plugin spawns gltf-pipeline:
       gltf-pipeline -i <original> -o <optimizedPath> --draco --texture-compress ktx2
   - on success, writes manifest fragment to assets-source/<id>.json (sourceBounds, bytesIn, bytesOut)
3. AssetImportController transitions: staging → compressing → ready.
4. UI shows: "Ready. Bytes saved 80%. Place in scene?"
```

#### Place → catalogue + ghost-preview armed

```
1. User clicks 'Place in scene': AssetImportController registers AssetImportEntry
   in the catalogue + editor document.
2. placement-cluster-mutator.armPlacement({ kind: 'model', catalogueId: <id>, defaultRotation, defaultScale })
   → state machine: idle → armed.
3. AssetImportDialog dismisses.
4. PlacementGhost appears in viewport at cursor projection on nearest placeable floor:
   - color: light green #88ddff at opacity 0.55 over a valid museum-room floor
   - color: coral #ff6b6b at opacity 0.55 when no valid floor hit
   - rotation/scale match prototype (asset defaultRotation × defaultScale vector)
5. User clicks a museum room floor → commitPlacement; ghost disappears; entity created with catalogue id.
6. User presses Escape OR clicks outside any floor → cancelPlacement; armed state clears; ghost disappears.
```

#### Compression pipeline specifics

```ts
// asset-compress-job.ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

const GLTF_PIPELINE = './node_modules/.bin/gltf-pipeline';

async function compress(
  inputPath: string,
  outputPath: string,
  options: { draco: boolean; ktx2: boolean }
): Promise<{ bytesIn: number; bytesOut: number }> {
  const args = ['-i', inputPath, '-o', outputPath];
  if (options.draco) args.push('--draco');
  if (options.ktx2) args.push('--texture-compress', 'ktx2');
  await exec(GLTF_PIPELINE, args);
  return {
    bytesIn: statSync(inputPath).size,
    bytesOut: statSync(outputPath).size
  };
}
```

Notes:
- `gltf-pipeline` ships with Three.js project in dev (`node_modules/.bin`); no separate install.
- Draco encoder is bundled with gltf-pipeline; KTX2 requires `toktx` (system toolchain). Surface failure as `AssetImportController` error state; user can retry without KTX2.
- Caching: hash the input GLB; skip when `optimizedPath` newer than input + same params. Editor reads cache hit counts in commit UI.
- Failure modes: missing `toktx` → degrade gracefully; license missing → hard block (cannot place until acknowledged).

#### Cross-room asset loading

`AssetModel.svelte` — current gate:

```ts
// today:
const visible = isParisRoom(activeRoomId) || routeNeedsAsset(asset.id);
```

Replace with:

```ts
const visible = editorForceLoad || routeNeedsAsset(asset.id) || asset.roomHints.includes(activeRoomId);
```

`MuseumAssets.svelte` preload loop:

```ts
// today: preload only the rooms tied to the active Paris route
// Phase 3: preload per-room based on `asset.roomHints` and the editor's working room id
const workingRooms = editorActiveRoom ? [editorActiveRoom] : activeRoute.rooms;
for (const roomId of workingRooms) {
  const assets = catalogue.filter(a => a.roomHints.includes(roomId));
  for (const asset of assets) preloadAsset(asset);
}
```

That is — the editor's "working room" extends active-context to include the editor's active museum room (not just the visitor's tour route). Editor-only override; visitor never reads `editorForceLoad`.

### Cluster handling (Phase 1)

`editor-cluster-transform.ts` branches on `scaleMode`. Independent: per-axis delta from `lastSelectedId` member's matrix. Anchor = `lastSelectedId` (consistent with Active Object pivot from Phase 6.2); falls back to centroid member when null.

### Hover + selection helpers (Phase 1)

`OBB` corner-streaming (Phase 6.2) rotates the wire cube correctly regardless of `scaleVector` non-uniform — the per-frame stream reads `root.scale.{x,y,z}` and `root.matrixWorld` per axis. No additional changes needed to `EditorSelectionHelper.svelte`. Phase 1 reaffirms this works correctly for non-uniform scales.

### Phase 1b — Placement Ghost Preview (cross-cutting)

**Component:** `placement-ghost.svelte` renders ONE `LineSegments` OBB on the scene when a placement is armed. Reuses Phase 6.2's `obb-util.ts` factories (`box3CornersToLineGeometry` + `localCornersInto`).

**Algorithm:**

```ts
// Pure helpers (placement-ghost.ts)

type PlacementGhostPrototype = {
  // Reference kind + dimensions + scale for ghost OBB construction.
  primitiveKind: 'box' | 'plane' | 'cylinder' | 'sphere' | 'model';
  dimensions: ScenePrimitiveDimensions | null;          // null for model — uses asset sourceBounds
  assetBounds?: Vec3;                                  // populated when kind === 'model'
  defaultRotation: Vec3;                                // for asset: catalogue defaultRotation
  defaultScaleScalar: number;                           // for uniform placement
  defaultScaleVector: Vec3 | null;                      // for independent placement (Phase 1a)
  defaultYOffset: number;                               // asset pivot offset; 0 for primitives
};

type PlacementValidity = {
  isValid: boolean;
  reason: 'no-floor' | 'off-grid' | 'off-room-bounds' | 'collision' | 'ok';
  ghostPosition: Vec3 | null;
  ghostRotation: Vec3;
};

function projectPointerToFloor(
  camera: Camera,
  pointer: Vec2,
  floorTargets: Object3D[]
): { point: Vec3; roomId: MuseumRoomId | null } | null;

function computeGhostValidity(
  hit: { point: Vec3; roomId: MuseumRoomId | null } | null,
  prototype: PlacementGhostPrototype,
  workingRoomId: MuseumRoomId | null
): PlacementValidity;

function computeGhostMatrix(
  validation: PlacementValidity,
  prototype: PlacementGhostPrototype
): Matrix4;
```

**Component contract:**

- On `armPlacement(prototype)` → enters `armed` state, ghost OBB constructs with `prototype.dimensions` (or `prototype.assetBounds` when kind === 'model').
- `useTask` per-frame: `pointer` → `projectPointerToFloor(camera, ...)`. If hit, compute `validation` + `ghostMatrix`. Stream corners through `localCornersInto(matrix, localBox, ...)`. If no hit OR invalid, hide ghost or push it offscreen + render in red.
- Click: if validation.isValid, call `commitPlacement(prototype, ghostMatrix)`. Else, no-op (overlay: brief shake on ghost).
- Escape OR click on invalid surface: `cancelPlacement()`. Ghost disposed.

**Color states:**

| State | Color | Opacity |
|---|---|---|
| Valid | `#88ddff` (light green) | 0.55 |
| Invalid no-floor | `#ff6b6b` (coral) | 0.55, dimmed to 0.30 |
| Invalid off-grid / off-room | `#ffaa44` (amber) | 0.40 |
| Cluster invalid (multi-place dragging) | `#aa88ff` (lavender) | 0.40 |

**Material spec:** `LineBasicMaterial`, `depthTest=false`, `transparent=true`, `fog=false`, `linewidth=1`, `renderOrder=2000`. `raycast = () => undefined`.

**Reuse contract for downstream phases:**

- Phase 2's `beginArchitectureShapePlacement(id)` calls `armPlacement({ primitiveKind, dimensions, defaultScaleVector, ... })` directly. The shape's `ARCHITECTURE_SHAPE_LIBRARY` entry feeds the prototype.
- Phase 3's "Place in scene" calls `armPlacement({ primitiveKind: 'model', assetBounds, defaultRotation, defaultScaleScalar, ... })` with the imported asset's manifest.

**Visitor parity:** Placement Ghost is editor-session only. Theomorph state never reaches document JSON. Cleanup is reactive via `$effect` lifecycle; on commit smoke clears.

**Why this lands in Phase 1, not Phase 3:**

- Phase 3's task budget assumed a drag-and-drop asset dialog without the click-→-ghost-→-click flow. By moving the ghost preview upstream to Phase 1, all three placement paths share the same click-based UX. Without this, Phase 3 would have to re-implement the ghost for assets specifically — duplicated code, divergent UX.
- The placement-ghost module is small (~6 tests, ~150 LOC helper + ~100 LOC Svelte). It does not block Phase 1a's scaleMode toggle. Add as Phase 1 Task 1.5.

## §3 — UI

### Phase 1 — Inspector scale row

```
Scale  [⛓] [Scale 1.00  ]   ← uniform mode (default)
       ┌──────────────────┐
       │  ⛓ closed = uniform   │
       │  ⛓ loose  = independent │
       └──────────────────┘

Scale  [⛓-loose] [X 5.0  ] [Y 3.0  ] [Z 0.05]   ← independent mode
```

Chain icon click → `interactionStore.toggleScaleMode()`. `aria-pressed={mode === 'independent'}`. Field commits route through `commitPlacementTransform({ ... transform, scaleScalar, scaleVector, scaleMode })`.

### Phase 2 — Add menu (Architecture submenu)

`Add ▾ → Architecture ▸ → Floor / Wall / Ceiling / Column / Door`.

Click an entry → `armPlacement({ primitiveKind: <entry.primitiveKind>, dimensions: <entry.dimensions>, defaultScaleVector: <entry.defaultScaleVector>, defaultScaleScalar: 1, defaultRotation: [0,0,0], defaultYOffset: 0 })` from Phase 1b. **PlacementGhost appears in viewport at cursor projection.** Click on museum-room floor → `commitPlacement(...)` → entity created with semantic name + correct dimensions + scale mode matching shape. Escape cancels.

Same click → ghost → click flow as native primitive placement today. The ghost preview applies uniformly.

Add menu decision deep-linked in plan §Open Decisions (Decision #3: full Add menu restoration vs Architecture-only first cut).

### Phase 3 — Asset Import dialog + Asset picker

#### Click-to-import + ghost-preview placement

**AssetImportDialog (no drag-and-drop):**

```
┌────────────────────────────────────────────────────┐
│ Import asset                          [×]          │
├────────────────────────────────────────────────────┤
│                                                     │
│  [ Browse… ]   file.glb or file.gltf               │
│                                                     │
│  ── After stage ──                                 │
│  file.glb  (1.4 MB)                                │
│  ✅ models/<id>.md licence present                 │
│                                                     │
│  Compress:                                          │
│   [✓] Draco mesh compression                       │
│   [✓] KTX2 texture compression                     │
│                                                     │
│  [Cancel]  [Optimize →]                             │
│                                                     │
│  ── After optimize ──                              │
│  Bytes 1.4 MB ↓ 280 kB (saved 80%)                 │
│  [Cancel]  [Place in scene]                        │   ← places × dismisses dialog
└────────────────────────────────────────────────────┘
```

The `Browse…` button opens the native browser file picker (`<input type="file" accept=".glb,.gltf">`). NO drop zone. NO drag event listeners. Decision log #10 added: drag-and-drop removed.

When user clicks `Place in scene`: AssetImportController registers `AssetImportEntry` in catalogue + editor document. **`armPlacement({ primitiveKind: 'model', assetBounds: <sourceBounds>, defaultRotation: ..., defaultScaleScalar: ..., defaultScaleVector: null, defaultYOffset: ... })` triggered**. **AssetImportDialog dismisses.** Phase 1b's `PlacementGhost` appears in viewport at cursor projection.

Click on museum-room floor (any of 7 rooms) → `commitPlacement` → entity created in document referencing catalogue id. Escape cancels.

#### EditorAssetPicker (existing in current spec, click-based flow)

```
┌──────────────────────────────┐
│ Asset catalogue              │
├──────────────────────────────┤
│ Built-in                     │
│   □ Grand piano (Paris)      │   ← click to arm
│   □ Sofa (Paris)             │
│                              │
│ Imported                     │
│   🖼 Sandstone column        │   ← click to arm
│   🖼 Iron railing            │
│   🖼 Door — oak              │
│                              │
│ [+ Add asset…]                │   ← opens AssetImportDialog
│                              │
│ Currently armed: Sandstone column  │  ← small status row when ghost active
│   [Esc to cancel]            │
└──────────────────────────────┘
```

The drag-and-drop wording above has been removed; see Phase 1b §2 component contract + Decision #10 in §Open Decisions. AssetImportDialog stays a modal with one `Browse…` button (native file picker);placement happens in the viewport via the Phase 1b ghost.

## §4 — Visitor Parity + Export + Storage Semantics

### Phase 1 — Independent Scale UX

| Editor state | Visitor render | Lossiness |
|---|---|---|
| uniform, scale = 1 | `entity.scale = undefined` → 1× | none |
| uniform, scale = N | `entity.scale = N` → N× | none |
| independent, [5, 3, 0.05] | `entity.scale = undefined` → 1× | **visitor loses precision** |
| independent, [3, 3, 3] (= uniform) | `entity.scale = 3` → 3× | auto-coerced |

Persistence: schema v6 unchanged. `placement.scale = 1` for non-uniform vector; editor transform map keeps the vector. **Documented lossiness**; revisit at schema v7.

### Phase 2 — Architecture Shape Catalogue

| Editor state | Visitor render | Lossiness |
|---|---|---|
| Wall default dims (2,3,0.05) × scale = 1 | `dimensions + scale` → 2×3×0.05 box | none |
| Wall stretched to (5,3,0.05) × scale = 1 (independent) | above | **visitor narrow axis OK; scale collapses to 1×** (Phase 1 −1) |
| Ceiling 6×6 m × uniform 1 | box dims 1 × 0.03 × 1 + scale vector | none |

Visitor render code (`MuseumEntities.svelte` `EntityPrimitive`) reads `dimensions + scale`. Architecture-named entities use same primitive kind as built-in box/cylinder/plane — no visitor render change.

### Phase 3 — Asset Import

| Editor state | Visitor render | Lossiness |
|---|---|---|
| Asset imported, optimized, placed in Paris Salon | `model/catalogueId/optimizedPath` loaded by existing `AssetModel.svelte` | none |
| Asset imported, placed in Departure Hall (non-Paris) | `AssetModel.svelte` reads `roomHints.includes('departure')` → preload for active route, OR editor-forced load (forces visitor preview in editor) | none in dev editor view; visitor preview only loads when route enters departure. |
| Asset compression failed | editor fallback: dimensioned primitive of `fallbackPrimitiveKind` | visitor never sees raw (no fallback to originalPath on visitor) |

Asset optimization is **dev-time only**. Production build skips `/__asset-import` + `/__asset-compress` vite-plugin endpoints. Optimized GLBs committed to `static/museum/models/` flow through the existing vite asset pipeline (no further compression).

### Import round-trip

```
Developer clicks Browse… in AssetImportDialog
  ↓ <input type="file"> change event fires; FileReader reads ArrayBuffer
  ↓ AssetImportController stages file
  ↓ POST /__asset-import (vite plugin)
  ↓ writes assets-source/models/incoming/<id>/file.glb + assets-source/licenses/<id>.md
  ↓
  Developer clicks Optimize
  ↓ POST /__asset-compress (vite plugin)
  ↓ gltf-pipeline → static/museum/models/<id>.glb
  ↓ updates assets.ts catalogue entry
  ↓
  Developer clicks Place in scene
  ↓ Editor asset library mutator registers AssetImportEntry in document + assets.ts
  ↓ armPlacement({ kind: 'model', ... }) fires (Phase 1b)
  ↓ AssetImportDialog dismisses; PlacementGhost follows cursor in viewport
  ↓ developer clicks a museum-room floor → commitPlacement
  ↓ entity created referencing catalogue id
  ↓ commit / export → document JSON carries AssetImportEntry reference

Visitor reads JSON → validates via codec (v6 with assets array)
  ↓ MuseumAssets preloads asset glb for active room
  ↓ AssetModel renders optimized GLB
```

Persistence is **commit-time only**. Editor session can hold in-progress imports without committing; cancel drops. Saved artifacts:

| Path | Lifecycle |
|---|---|
| `assets-source/models/incoming/<id>/` | dev-only scratch; cleared on import cancel |
| `assets-source/<id>.md` | commit-time; licence stub REQUIRED |
| `static/museum/models/<id>.glb` | commit-time; survives dev builds |
| `assets.ts` catalogue entry | commit-time; version-controlled |
| Document JSON `assets` array | commit-time; shipped to visitor |

## §5 — Tests + Out-of-Scope + Ship Criteria

### Test budget per phase

| Phase | New tests | Δ over 6.2 (899 baseline) |
|---|---|---|
| 1a — Independent Scale UX | ~27 (scale-vector ~14 + interaction-store ~3 + inspector ~5 + gizmo/cluster ~5) | 926 |
| 1b — Placement Ghost Preview | ~6 (placement-ghost.ts ~4 + placement-ghost.svelte ~2) | 932 |
| 2 — Architecture Shape Catalogue | ~9 (catalogue ~6 + placement ~3) | 941 |
| 3 — Asset Import + Compression + Cross-room | ~22 (asset-import-controller ~6 + asset-library-mutator ~4 + assets.ts ~4 + AssetModel/MuseumAssets ~6 + AssetImportDialog ~2) | 963 |
| **Cumulative over 6.2 baseline** | **+64** | **963 total** |

### Test files (key)

**Phase 1:**
- `scale-vector.test.ts` — pure helpers, ~14 tests
- `editor-interaction-store.test.ts` (extend) — `scaleMode` default + toggle + set, ~3
- `editor-transform.test.ts` (extend) — PlacementTransform round-trip, ~5
- `EditorTransformInspector.test.ts` (extend) — chain icon + 3-field branch, ~3
- `EditorTransformControls.test.ts` (extend) — per-axis independent gizmo + uniform re-enforce, ~2

**Phase 2:**
- `architecture-shapes.test.ts` — pure catalogue, ~6 tests
- `placement-cluster-mutator.test.ts` (extend) — `beginArchitectureShapePlacement` arms preset, ~3
- `editor-cluster-transform.test.ts` / `editor-transform.test.ts` (extend) — scale deadstop clamp, no negative after overshoot, ~3

**Phase 3:**
- `assets.test.ts` (new) — catalogue entry expose, roomHint filter, ~4
- `asset-import-controller.test.ts` (new) — state machine transitions, ~6
- `asset-import-plugin.test.ts` (new) — vite plugin write + asset manifest, ~4
- `asset-compress-job.test.ts` (new) — bytesIn/bytesOut math + caching, ~3
- `asset-library-mutator.test.ts` (new) — editor CRUD + undo, ~4
- `AssetModel.test.ts` (extend) — gate change, ~2
- `MuseumAssets.test.ts` (extend) — preload loop per working room, ~3
- `AssetImportDialog.test.ts` (new) — **Browse button** + cancel + compress bar; runs against fake File via JSDOM, ~2

### Visitor chunk gates (all phases)

| Keyword blocklist | Expected count after each phase |
|---|---|
| `museum-editor\\|interaction-fsm\\|editor-interaction-store\\|EditorSelectionHelper\\|settings-store\\|obb-util\\|pivot-resolve\\|editor-context-keys` | 0 today; +0 after Phase 1/2 (unchanged) |
| + `placement-ghost` | 0 after Phase 1b |
| + `scale-vector\\|architecture-shapes` | 0 after Phase 1a / 2 |
| + `asset-import-plugin\\|asset-compress-job\\|asset-import-controller\\|AssetImportDialog\\|EditorAssetPicker\\|asset-library-mutator` | 0 after Phase 3 |

Plus `/museum` HTML chunk scan at `127.0.0.1:5174/museum` returns identical content (visitor route unchanged from 6.2 ship).

### Editor manual walkthrough checklist (combined)

| Step | Expected |
|---|---|
| Open `/dev/museum-editor` | Top toolbar, left sidebar, right inspector all show |
| Add → Architecture → Wall | Wall entry arms placement; Phase 1b ghost appears at cursor (light green on a valid floor) |
| Hover over floor outside museum room | Ghost turns coral + dim, click no-ops |
| Click a museum-room floor | Wall entity appears with name "Wall"; default 2 m wide × 3 m tall × 0.05 m thick |
| Stretch the wall to 5 m × 3 m | Toggle chain icon to Independent; commit X=5; wall stretches X-only |
| EditorAssetPicker → [+ Add asset…] | AssetImportDialog opens with Browse button (no drop zone) |
| Click Browse… + select sandstone.glb | File stages; license auto-check; ready state |
| Click Optimize | Progress bar shows; ready state on success |
| Click Place in scene | AssetImportDialog dismisses; PlacementGhost appears in viewport (ghost OBB wraps asset's sourceBounds defaultRotation + defaultScale) |
| Click a museum-room floor in Departure Hall | CommitPlacement creates entity; asset preloads via working-room logic (not Paris-only) |
| Visit `/museum`, route to Departure Hall | Asset renders — same as in editor |

### Open decisions for reviewer

1. **Phase 1 visitor fidelity lossiness.** Acceptable v1? Revisit at schema v7?
2. **Phase 1 persistence.** `scaleMode` session-only? Persist on reload? Defer?
3. **Phase 2 Add menu scope.** Architecture-only first cut, or also restore full Camera/Box/Plane/Cylinder/Sphere?
4. **Phase 3 licence blocker.** Hard-block placement on missing license file, or warn-and-continue?
5. **Phase 3 KTX2 fallback.** Degrade to PNG/JPEG with banner when `toktx` missing, or hard-fail?
6. **Phase 3 visitor preload scope.** Editor working-room override + pointer for "force-load in editor preview" — confirm these two surfaces don't bloat visitor chunk.
7. **Phase 3 `assets.ts` migration.** Add `AssetImportEntry[]` as additive (schema v6.1) or move forward to v7 now?
8. **Phase 1b placement-ghost visibility color.** Default to `#88ddff` light-green valid / `#ff6b6b` coral invalid; tune after first UX pass.
9. **Phase 1b ghost off-screen-on-invalid behavior.** Hide ghost entirely when off-grid, or push ghost offscreen + render red? Choose: hide entirely (recommended) so cursor-primary mode stays clear.
10. **Phase 3 file import UX.** Click Browse + native file picker (current) — drag-and-drop no longer offered. Confirm or restore drag as alt-entry?

These are surfaced in plan §Open Decisions for sign-off before subagent dispatch.

## §6 — Phase 4+ TBD

These are not in scope for the current track. Each is a seam the next track can pursue.

| Seam | Note |
|---|---|
| **Visitor vector fidelity** | Bump schema to v7; add `scaleVector: [number, number, number] \\| null` to `SceneObjectPlacement`; decoder validates per-axis independence; visitor renders per-axis; editor transform map collapses to v7 form. Closes Phase 1 lossiness. |
| **Persistent `scaleMode`** | Extend `museum-editor:settings:v1` with `scaleMode` key; reload restores; UX polish (toast on restore). |
| **Toolbar mode chip** | At-a-glance mode indicator + clipboard-click preset. |
| **Marquee box-select** | Carry-over from Phase 6.1 section 8 / 6.3 plan. |
| **Multi-opening walls** | `museum-shell` extension: per-wall-side openings array, procedural door cutouts for multiple doors. |
| **Path clearance through built architectures** | Editor flags anchors that clip named walls/columns; path resolver adds manual clearance for walls/columns. |
| **Asset replace flow** | Graybox wall/floor → drop matching real-asset on top → confirm → archive graybox. One-click swap. |
| **Schema v7 with `scaleVector` + asset array** | Single canonical migration step; Phase 1 + 3 close simultaneously. |
| **Cross-museum template support** | Single-museum editor. Multi-project is the opposite direction — explicitly out of scope per STAY-ONE-PROJECT brief. |

PRIORITY for the next track after Phase 3 ships: **Phase 4 = Schema v7 + visitor vector fidelity + asset replace flow**. The pieces fit because the codec is the common point.

---

## Architecture sketch (after all 3 phases)

```
Editor (dev route only)                 Visitor (museum route)
─────────────────────────               ─────────────────────────
MuseumEditorApp.svelte                  SvelteKit route /museum
  ├ EditorToolbar                        └ MuseumHUD
  ├ LeftSidebar                                ├ museum-state.svelte.ts (visitor FSM)
  ├ EditorViewport                             └ MuseumCanvas
  │   ├ EditorSelection.svelte                     └ MuseumScene
  │   ├ EditorSelectionHelper.svelte                  ├ MuseumShell
  │   │   (OBB — rotational-aware)                    ├ CentralChamber  
  │   ├ EditorTransformControls.svelte                ├ Room props (graybox + drops)
  │   │   (IndependentScale-aware gizmo)              ├ MuseumEntities
  │   └ EditorCameraPathHelpers                       └ MuseumAssets (Phase 3: cross-room preload)
  ├ RightInspector                                              └ AssetModel (Phase 3: drop Paris gate)
  │   └ EditorTransformInspector (Phase 1: chain icon)             └ AssetFallback (lossy)
  ├ AddMenu (Phase 2: Architecture submenu)
  └ AssetImportDialog (Phase 3: Browse button)
       └ EditorAssetPicker (catalogue panel)

Vite plugin (dev only, applies 'serve')   AssetImportController
  ├ POST /__asset-import                      ├ idle → staging → compressing → ready → placed
  └ POST /__asset-compress                    └ Editor asset-library-mutator (undoable)

Document (museum-scene.json v6 + assets array)
  ├ entities (Placement x Position/Rotation/Scale)
  ├ assets (AssetImportEntry[])
  ├ navigationGraph
  └ textures
```

The right hand (visitor) gains predictable asset preloading for any room. The left hand (editor) gains full authoring surface. The center (catalogues + rooms + scene JSON) stays the single source of truth.

---

## Cross-phase acceptance criteria

| Gate | Target |
|---|---|
| Vitest total | 957 (Δ +58 over Phase 6.2 baseline 899) |
| `npx svelte-check` | 0 / 0 |
| `npm run build` | exit 0 |
| Visitor chunk grep `placement-ghost\|scale-vector\|architecture-shapes\|asset-import-plugin\|asset-compress-job\|asset-import-controller\|AssetImportDialog\|EditorAssetPicker\|asset-library-mutator` | 0 matches in `apps/museum/.svelte-kit/output/client/_app/immutable/nodes/` |
| Schema v6 json | unchanged (no `scaleVector` field; `assets` array additive) |
| Visitor `/museum` HTML chunk scan | identical to 6.2 baseline |
| Editor manual walkthrough | all 9 combined steps complete |
| Phase independence | Phase 1, 2, 3 each land and ship standalone; subsequent phases are non-blocking |
| Cross-room editing | Dev editor working-room override loads assets for any 7 rooms; visitor preload per active route; Paris-only path lifted |
