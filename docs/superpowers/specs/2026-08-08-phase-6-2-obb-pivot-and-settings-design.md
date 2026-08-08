# Phase 6.2 — OBB Selection Outline + Active Object Pivot + Settings Panel

**Date:** 2026-08-08
**Status:** Design approved (§1–§5)
**Phase:** 6.2 (continuation of editor interaction parity work)
**Predecessor:** `docs/superpowers/specs/2026-08-08-phase-6-1-gizmo-parity-design.md`
**Out-of-scope overlap:** Deferred items from Phase 6.1 §5 — OBB outline, Active Object pivot, snap settings UI, plus the cosmetic mode-chip binding carry-over.

---

## §1 — Architecture + Component Map

### New files

| File | Responsibility |
|---|---|
| `apps/museum/src/lib/editor/obb-util.ts` | Pure: corners-from-box3 → static `LineSegments` geometry (8 verts, 24 indices, 12 edges). Per-frame helper: `localCorners(matrixWorld, box3) → Float32Array(24)` stream buffer oriented by `matrixWorld`. No Three.js sides — operates against factory objects. |
| `apps/museum/src/lib/editor/settings-store.ts` | Typed `EditorSettings` schema + localStorage adapter (`museum-editor:settings:v1`). Defaults + per-key validators + failsafe. `$state` snapshot, debounced save. |
| `apps/museum/src/lib/editor/EditorSettingsPopover.svelte` | Floating popover anchored bottom-right of `EditorViewportToolbar`. Reads from settings-store via context. Click-away / Esc dismiss; `Cmd+,` opens. |

### Modified files

| File | Change |
|---|---|
| `EditorSelectionHelper.svelte` | Replace `Box3Helper` (gold AABB) with `LineSegments` per selection entry. Per frame: project `rootLocalBox3` corners through `root.matrixWorld` and stream into the buffer attribute. Cached `rootLocalBox3` (placement-local box3 union of child meshes) computed once at attach. Keep depthTest=false, renderOrder=1000, raycast=null, visitor-preview gate. |
| `selection-actions.svelte.ts` | Add `lastSelectedId: PlacementId \| null = null`. Writes the most recently mutated/touched id on every `selectOnly`, `addPlacement`, toggle path. Bulk-setters (`setSelectionSet`) write the last touched. |
| `museum-editor.svelte.ts` | Facade additions: `pivotMode: PivotMode` (from settings), `lastSelectedId` getter for selection-pivot consumers. |
| `EditorSelectionPivot.svelte` | Existing pivot helper split into `pivotMode === 'center'` (centroid bbox) or `pivotMode === 'active-object'` (single-select → selected root; multi-select → `findPlacementRoot(lastSelectedId)`). |
| `EditorTransformControls.svelte` | At attach + on settings change, pre-applies snap via `setTranslationSnap`/`setRotationSnap`/`setScaleSnap` when `snapDefaultOn === true` AND current mode is the matching one. Ctrl/Cmd still overrides per Phase 6.1 Q3. |
| `EditorViewportToolbar.svelte` | Gear icon → opens popover. Mode chips bind `aria-pressed` to `interactionStore.mode`; click dispatches `setMode`. World chip binds to `interactionStore.space`; click → `toggleSpace`. New "Center/Active" chip binds to settings-store `pivotMode`; click toggles. |
| `hooks/shortcuts.svelte.ts` | Add `Cmd+,` → toggles popover open state. |
| `EditorSelection.svelte` | Reuses `findPlacementRoot(id)` for pivot resolution. |
| `session-state.svelte.ts` | Already hosts snap step setters from Phase 6.1; expose `pivotMode` getter that reads from settings-store (passthrough). |

### Pure types

```ts
type PivotMode = 'center' | 'active-object';

type EditorSettings = {
  translationStep: number;        // metres, default 0.25, range 0.01–1.0
  rotationStepDegrees: number;    // default 15, range 1–90
  scaleStep: number;              // default 0.1, range 0.05–0.5
  snapDefaultOn: boolean;         // default false (matches 6.1)
  pivotMode: PivotMode;           // default 'center'
};

type SetSettingsPatch = Partial<EditorSettings>;

type EditorSettingsStore = {
  settings: EditorSettings;
  set(patch: SetSettingsPatch): void;          // validates + persists (debounced)
  reset(): void;                                // applies defaults + persists
};
```

### Persistence key
`museum-editor:settings:v1` → JSON, schema-versioned (version literal `v1`); failsafe parse — invalid per-key values fall back to field default; malformed JSON → all-defaults + re-save on next change.

### Visitor parity
- `EditorSettingsPopover.svelte` only mounts behind the dev-route guard.
- Visitor-chunk grep (added to §5 ship gates): zero matches for `EditorSettingsPopover`, `settings-store`, `obb-util`.
- Visitor `/museum` route untouched: no editor modules leaked.

### Implementation choices flagged
- (i) `pivotMode` re-run on each `selection` + `lastSelectedId` change is **steered by `$effect` on the helper**, not re-attached. Compute-only matrix update is sufficient — matches the existing 6.1 AABB-sync per-frame loop.
- (ii) Settings-store hydrates synchronously at module load (no async boundary on first read). Both reads and writes are atomic enough for this scope.

---

## §2 — OBB Algorithm + Pivot Resolution + Settings Schema

### OBB helper algorithm

```
// per selection entry, cached at attach time:
rootLocalBox3 = new Box3().makeEmpty()
walk root → for each Mesh subtree child:
  geometry.boundingBox (cached, after first build)
  worldBox = geometry.boundingBox.transformed-by-child.matrix
  rootLocalBox3.union(worldBox.transformed-by-root.matrixWorld.invert)

// OR — simpler, side-step: take child local boxes, multiply by root.matrix:
// rootLocalBox3.union(childLocalBox.applyMatrix4(child.matrix relative to root))

// per frame, during render loop:
for each entry:
  const arr = lineSegments.geometry.attributes.position.array
  localCornersInto(root.matrixWorld, rootLocalBox3, arr)
  lineSegments.geometry.attributes.position.needsUpdate = true
```

`localCornersInto(matrixWorld, box3, outArray)` mutates `outArray` (length 24) with 8 world-space corners (8 vertices × 3 floats). Pre-allocated `Vector3` reused.

`box3CornersToLineGeometry(box3) → BufferGeometry`:
- Position attribute: `Float32Array(24)` — 8 corner vertices; **not baked** at construction; per-frame `array.set(...)` writes.
- Index attribute: `Uint16Array(24)` — 12 edges × 2 vertex indices. Constant.
- Computed once, the geometry is shared across selection entries (entries share `geometry`, vary `material` for color highlighting if needed; today single color → shared instance).
- Material: `LineBasicMaterial({ color: 0xd6b35f, depthTest: false, transparent: false, fog: false, linewidth: 1 })`.

### Why not `Box3.setFromObject` → `Box3Helper` (current 6.1)?
`Box3.setFromObject` walks children and unions axis-aligned boxes per leaf in **world space**. The resulting AABB does not rotate with the object — it grows and shrinks. The wire cube *reshapes* under rotation, which reads as broken. Corners-stream preserves rotation.

### Pivot resolution

```
EditorSelectionPivot pseudo:

let entries = store.selection.map(id => findPlacementRoot(id))

if (entries.length === 0) return null                      // existing: gizmo detaches
if (entries.length === 1) return entries[0]                // single-select always its own root
if (pivotMode === 'center') return centroidBbox(entries)   // existing flow
if (pivotMode === 'active-object' && lastSelectedId):
  root = findPlacementRoot(lastSelectedId)
  if (root && entries.includes(root)) return root
return centroidBbox(entries)                               // fallback
```

`centroidBbox(entries)`:
```
const box = new Box3()
for (const root of entries):
  const tmp = new Box3().setFromObject(root)
  box.union(tmp)
const center = new Vector3(); box.getCenter(center)
const pivot = new Object3D(); pivot.position.copy(center)
return pivot
```

`active-object` mid-drag: TransformControls writes back to the `pivot` object's local transform; the `lastSelectedId` placement root's transform is updated by Three via the bounds (because pivot === root in this branch). This matches `findPlacementRoot` math: drag affects the placement's matrix, which is exactly what 6.1's drag-snapshot captured.

### Settings schema

```ts
const KEY = 'museum-editor:settings:v1';

const DEFAULTS: EditorSettings = {
  translationStep: 0.25,
  rotationStepDegrees: 15,
  scaleStep: 0.1,
  snapDefaultOn: false,
  pivotMode: 'center'
};

const VALIDATORS: Record<keyof EditorSettings, (raw: unknown) => boolean> = {
  translationStep: (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0.01 && v <= 1.0,
  rotationStepDegrees: (v) => Number.isInteger(v) && v >= 1 && v <= 90,
  scaleStep: (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0.05 && v <= 0.5,
  snapDefaultOn: (v) => typeof v === 'boolean',
  pivotMode: (v) => v === 'center' || v === 'active-object'
};

function loadEditorSettings(): EditorSettings:
  raw = localStorage.getItem(KEY)
  try parsed = JSON.parse(raw)
  catch return DEFAULTS
  result = { ...DEFAULTS }
  for key of expectedKeys:
    if VALIDATORS[key](parsed[key]) result[key] = parsed[key]
  return result

function saveEditorSettings(settings): void
  localStorage.setItem(KEY, JSON.stringify(settings))

// Debounce 200ms to coalesce slider drag writes.
```

### Carve-outs
- **Sync hydration:** load runs at module load; reactive `$state` snapshot starts persisted-or-default.
- **Reuse Vector3:** `localCornersInto` walks 8 corners with a single pre-allocated Vector3.
- **Editor-only:** localStorage key is namespaced to `museum-editor:`; visits don't read it.

---

## §3 — Settings Panel UI + Chip Binding + Keyboard

### Settings popover layout

```
┌─────────────────────────────────────────┐
│  Editor settings                        │
├─────────────────────────────────────────┤
│  Snap                                   │
│  Translation step         [0.25] m      │   ← numeric stepper 0.01–1.0
│  Rotation step            [15] °        │   ← numeric stepper 1–90
│  Scale step               [0.10]        │   ← numeric stepper 0.05–0.5
│  Snap on by default       [ ]            │   ← checkbox
│                                         │
│  Pivot                                  │
│  Multi-select pivot       ◉ Center       │   ← radio
│                           ◯ Active Object│
│                                         │
│            [Reset to defaults]          │
└─────────────────────────────────────────┘
```

Anchored `position: absolute; bottom-right; offset: 16px`. Width ~280px. Focus-traps the first input on open; Esc dismisses; click-away dismisses.

### Component pieces

`EditorSettingsPopover.svelte`:
- `open: boolean = $state(false)`. Owned by `EditorViewportToolbar`'s open-state passed via prop.
- Reads `editorSettings` from `getContext(SETTINGS_STORE_KEY)`.
- Each input writes via `editorSettings.set({...patch})` → debounced `saveEditorSettings`.
- Reset → `editorSettings.reset()` → defaults written immediately + persisted.

`EditorViewportToolbar.svelte` changes:
- `gear-icon` button:
  ```
  <button
    class="settings-gear"
    aria-haspopup="dialog"
    aria-expanded={popoverOpen}
    onclick={() => popoverOpen = !popoverOpen}
  >⚙</button>
  ```
- Three-lib fonticon or inline SVG; tooltip on hover. No chart-icon here.
- Existing chips lift to take `interactionStore.mode` and `interactionStore.space` props; `aria-pressed` reflects current state.
- New **Pivot chip** binds to `settingsStore.settings.pivotMode`:
  - text: `'Center'` or `'Active'`
  - click → `settingsStore.set({ pivotMode: pivotMode === 'center' ? 'active-object' : 'center' })`
- Snap chip text shows current step value (e.g., `Snap 0.25 m`). Click toggles runtime `snapEnabled` (geometry helper from 6.1 — separate from settings snap default).

### Keyboard shortcut

`hooks/shortcuts.svelte.ts` adds:
```
onkeydown Cmd+':'
  cmd: dispatch({ type: 'TOGGLE_SETTINGS_POPOVER' })
  map to popover open-flag owner (MuseumEditorApp)
```

`Cmd+,` is the de facto macOS convention for "Editor preferences." Reused via OS-level dispatch from shortcuts module.

### Implementation notes
- (i) Debounced 200ms save via `requestIdleCallback` where available, falls back to `setTimeout`. Saves coalesce slider drags.
- (ii) `<input type="number">` with `min`/`max`/`step`; `oninput` parses + clamps + writes validated patch.

---

## §4 — Visitor Parity + Drag Undo Revisit + Polish

### Visitor parity
- `EditorSettingsPopover` only mounts behind the dev-route guard — visitor chunks stay clean.
- Visitor-chunk grep added to ship gates (§5).
- Visitor preview / route ribbon / hover helper unchanged from Phase 6.1.

### Drag undo (unchanged from 6.1)
- Drag-snapshot captures `[id, position, quaternion, scale]` per selection entry — unchanged.
- Active Object pivot: drag math is per-object when pivot === lastSelectedRoot; matches 6.1 selection-transforms capture naturally.
- Inspector field edit mid-drag: existing single-entry guarantee holds (placement-cluster-mutator does NOT call `beginDocument` mid-drag).
- Esc mid-drag revert: same Three private-flag workaround (documented in 6.1).

### Polish carry-overs

| Item | 6.2 | Reference |
|---|---|---|
| OBB rotation-aware wire cube | Ship | §1, §2 |
| Active Object multi-select pivot | Ship | §1, §2 |
| Snap settings UI | Ship | §1, §3 |
| Toolbar mode chip binding | Ship | §1, §3 |
| Pivot chip (Center/Active) in toolbar | Ship | §1, §3 |
| `Cmd+,` settings popover shortcut | Ship | §3 |
| Settings persist across reload | Ship | §2, §3 |
| Visitor-chunk isolation grep | Ship | §5 |
| Visitor preview hides helpers | Unchanged | 6.1 §4 |
| Gizmo screen-size | Unchanged | 6.1 §4 |
| Drag-suppress click handler | Unchanged | 6.1 §7 |

### Carve-outs flagged
- (i) **Active Object + drag-undo.** When pivot is `active-object`, drag logic tracks the placement root's matrix (pivot === root); 6.1's drag-snapshot machinery captures the same transform, so no extra reconcile step.
- (ii) **Settings event log.** Silent writes, no console output, no history entry. Reset button is the only audible path.

---

## §5 — Tests + Out-of-Scope + Ship Criteria

### New tests

| File | Coverage | ≈ tests |
|---|---|---|
| `apps/museum/src/lib/editor/obb-util.test.ts` | 8 corners from box3 (boundaries); 24 indices form 12 edges with no dupes; `localCornersInto` projects through identity, translation, rotation, and scale matrices; pre-allocated Vector3 not held by the helper | ~10 |
| `apps/museum/src/lib/editor/settings-store.test.ts` | defaults shape; load valid JSON returns parsed; reject invalid number range, invalid integer range, invalid float range, invalid boolean, invalid enum; reject malformed JSON; round-trip save/load; reset to defaults; debounce coalesces | ~14 |
| `apps/museum/src/lib/editor/store/selection-actions-last-selected.test.ts` (extend) | `selectOnly` writes `lastSelectedId`; `addPlacement` writes; toggle paths write the matching touched id; `setSelectionSet` writes the last member | ~5 |
| `apps/museum/src/lib/editor/EditorSettingsPopover.test.ts` | opens on gear click; closes on Esc; click-away closes; setting writes through to store; reset button writes defaults; Cmd+, toggles open state | ~6 |

### Modified tests

| File | Change |
|---|---|
| `EditorSelectionHelper.test.ts` | Replace `Box3Helper` expectations with `LineSegments`. Assert position buffer length 24, indices 24. Per-frame streaming produces geometry updates (call render loop, assert array differs after matrix change). |
| `selection-actions.test.ts` | Add `lastSelectedId` assertions coverage. |
| `museum-editor.test.ts` | Facade `pivotMode` reads from settings-store. |
| `EditorViewportToolbar.test.ts` (extend) | Chip `aria-pressed` reflects `mode`/`space`/`pivotMode`; chip click dispatches the matching command. |

### Existing tests — keep green
- All 861 tests from Phase 6.1 baseline: FSM, interaction-store, transition-controls, history, session-state, texture-library, placement, selection, camera, museum-editor-framework.

### Ship criteria

| Gate | Threshold |
|---|---|
| Vitest | 100% pass; ~+35 new (Δ over 861 → ~896) |
| `npx svelte-check` | 0 errors / 0 warnings |
| `npm run build` | exit 0 |
| Visitor-chunk grep | zero matches in `apps/museum/.svelte-kit/output/client/_app/immutable/nodes/` for keywords `museum-editor`, `interaction-fsm`, `editor-interaction-store`, `EditorSelectionHelper`, **plus** `EditorSettingsPopover`, `settings-store`, `obb-util` |
| localStorage failsafe | corrupt JSON → all-defaults; per-key invalid → field default |
| Editor manual walkthrough | `docs/agent-handoffs/phase-6.2-test-cookbook.md` |

### Manual walkthrough checklist (for the cookbook)

| Step | Expected |
|---|---|
| Open editor /dev/museum-editor | Snap-default toggle chip visible (default false); Center chip visible |
| Click a primitive, hit R three times | Rotation rings show in object-local axes; Spatial space persists between modes |
| Press X | World ↔ Local toggle works |
| Press `Cmd+,` | Settings popover opens, focus-trap triggers on first input |
| Edit translation step to 0.50 | Clipboard GE sees step value update in toolbar chip |
| Close popover, reload | Same settings restored; no flicker |
| Two placements selected, snap by | Pivot-mode chip toggle Active Object → gizmo lands on last-selected root |
| Drag rotated piano | Wire cube rotates with it (OBB), no reshape under rotation |
| Visitor preview /museum | Helpers vanish; visitor renders identical scene; no editor chunks in network |

### Out of scope (deferred)

| Item | Plan |
|---|---|
| Marquee / box-select | 6.3 |
| Pivot "Individual Origins" rotation for multi-select | 6.3 |
| Per-tool inline snap override UI panel | 6.3 or 7 |
| Settings import/export alongside scene package export | 7 |
| Tooltips on toolbar chips (cosmetic) | 6.3 polish |
| Object-snap-to-vertex / gizmo-anchor presets | future (visitor-side, not editor) |
| OBB outline depth-tested (currently depthTest=false) | future polish |

### Slice plan

1. Pure `obb-util.ts` + 10 tests
2. `settings-store.ts` + 14 tests
3. Extend `selection-actions.svelte.ts` (`lastSelectedId`) + 5 tests
4. `EditorSelectionHelper.svelte` — replace `Box3Helper` with `LineSegments` corners-stream
5. `EditorSelectionPivot.svelte` — Center / Active Object resolution
6. `EditorTransformControls.svelte` — apply snap values from settings at attach; ensure Ctrl/Cmd override
7. `EditorSettingsPopover.svelte` + `SETTINGS_STORE_KEY` context wiring in `MuseumEditorApp`
8. `EditorViewportToolbar.svelte` — gear icon + chip bindings + `Cmd+,` shortcut
9. Manual walkthrough + handoff doc + visitor-chunk-grep regression

Status: design complete. Next step: write spec doc, then run self-review.
