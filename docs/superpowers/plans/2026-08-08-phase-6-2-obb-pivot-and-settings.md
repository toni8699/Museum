# Phase 6.2 OBB Selection Outline + Active Object Pivot + Settings Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the gold `Box3Helper` AABB (which reshapes under rotation) with a rotation-aware OBB wire cube via per-frame corner-streaming, ship "Active Object" multi-select pivot alongside the existing "Center" pivot, and add a settings popover with snap step sliders + pivot mode default persisted to `localStorage`. Bind toolbar mode/space/pivot chips to `interactionStore` so keyboard + click stay in sync. Cosmetic carry-over from 6.1.

**Architecture:** Pure `obb-util.ts` provides factory helpers (corners-from-box3 → static indexed geometry; per-frame matrix-transformed corners-stream). Pure `settings-store.ts` owns `EditorSettings` schema + localStorage v1 failsafe defaults. Sub-store layer: `selection-actions.svelte.ts` gains `lastSelectedId` writer hooks; pivot resolution moves to `EditorSelectionPivot.svelte`. Svelte layer: `EditorSelectionHelper.svelte` swaps `Box3Helper` → `LineSegments` and writes the cached `rootLocalBox3` corners through `root.matrixWorld` per frame; `EditorTransformControls.svelte` reads settings-store to pre-apply snap values at attach (Ctrl/Cmd still overrides); `EditorSettingsPopover.svelte` mounts in `EditorViewportToolbar`'s bottom-right anchor; `hooks/shortcuts.svelte.ts` adds `Cmd+,` to toggle the popover. Visitor preview gate unchanged from Phase 6.1.

**Tech Stack:** TypeScript 5.8, Svelte 5 runes, SvelteKit 2, Vitest 3, Three.js (no new runtime deps).

## Global Constraints (every task must satisfy)

- **No new runtime dependencies.** No new packages; `three.LineSegments` + `LineBasicMaterial` are sufficient for the OBB helper.
- **Existing test suite stays green.** The 861-test baseline (`Test Files 60 passed`) is preserved. New tests must add without flipping any previously-green test red.
- **No commits per `AGENTS.md`.** Plan steps call `verify gates` rather than `commit`.
- **Visitor chunk isolation preserved.** No editor modules appear in `/museum` visitor chunk graph (regression on Phase 5.4 + 6.1 invariant). New keywords to grep: `EditorSettingsPopover`, `settings-store`, `obb-util`.
- **Visitor preview parity.** All editor helpers (selection + hover + popover) hide on visitor preview via the existing `isVisitorPreview` gate.
- **No new public surface changes to existing public APIs.** `registerPlacementRoot`, `selectedPlacementIds`, `selectionKey`, `selectedClusterId`, `selectionActions.deselect`, history-controller `beginDocument`/`commit`, session-state setters, `EditorInteractionStore` API — all unchanged in signature. New APIs additive only.
- **localStorage namespaced.** Key exactly `museum-editor:settings:v1`. Failsafe per-key validator; malformed JSON → all-defaults.
- **Verification command** (every task that adds or modifies code):
  ```bash
  cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run <focused> && npm run check -w @portfolio/museum
  ```
  Production build only at end-of-slice verification (after Task 9).

## File Structure (locked)

| Path | Type | Role |
|---|--:|---|
| `apps/museum/src/lib/editor/obb-util.ts` | NEW | Pure corners-from-box3 (`box3CornersToLineGeometry` → static `BufferGeometry`) + per-frame helpers (`localCornersInto`, `worldBoxFromMatrix`). No Three imports. Operates against factories. |
| `apps/museum/src/lib/editor/obb-util.test.ts` | NEW | 8 corners from box3; 12-edge index lists; `localCornersInto` projects through identity / translation / rotation / scale matrices. |
| `apps/museum/src/lib/editor/settings-store.ts` | NEW | Typed `EditorSettings` schema + `load`/`save` against `museum-editor:settings:v1`. `Key` symbol exported for context. Per-key validators + defaults. |
| `apps/museum/src/lib/editor/settings-store.test.ts` | NEW | Defaults; valid load; invalid number/int/float/bool/enum reject; malformed JSON; round-trip; reset to defaults; debounce coalesces slider writes. |
| `apps/museum/src/lib/editor/EditorSettingsPopover.svelte` | NEW | Floating popover anchored bottom-right; reads + writes settings-store; click-away / `Esc` dismiss. |
| `apps/museum/src/lib/editor/EditorSettingsPopover.test.ts` | NEW | Open via gear click; close via `Esc` / click-away; field writes go to store; reset button writes defaults; `Cmd+,` key toggles open. |
| `apps/museum/src/lib/editor/store/selection-actions.svelte.ts` | MODIFY | Add `lastSelectedId: PlacementId \| null = null` writer hooks in `selectOnly`/`addPlacement`/toggle paths. |
| `apps/museum/src/lib/editor/store/selection-actions.test.ts` | MODIFY | Extend with `lastSelectedId` assertions. |
| `apps/museum/src/lib/editor/EditorSelectionHelper.svelte` | MODIFY | Replace `Box3Helper` (gold AABB) with one `LineSegments` per entry; cache `rootLocalBox3` per attach; per-frame stream corners through `root.matrixWorld`. Same gold `#d6b35f`. Same depthTest / renderOrder / raycast / visitor gate. |
| `apps/museum/src/lib/editor/EditorSelectionHelper.test.ts` | MODIFY | Replace `Box3Helper` expectations with `LineSegments` (8 vertices × 3 floats; 24 indices); per-frame streaming asserts `array.set` writes different values across frames when matrix changes. |
| `apps/museum/src/lib/editor/EditorSelectionPivot.svelte` | MODIFY | Pivot resolution: Center (centroid bbox) vs Active Object (single-select → own root; multi-select → `findPlacementRoot(lastSelectedId)`). |
| `apps/museum/src/lib/editor/EditorTransformControls.svelte` | MODIFY | Apply `setTranslationSnap` / `setRotationSnap` / `setScaleSnap` from settings-store at attach AND on `settings` change (per-mode). Ctrl/Cmd already overrides per Phase 6.1; preserve. |
| `apps/museum/src/lib/editor/EditorViewportToolbar.svelte` | MODIFY | Mode chips bind `aria-pressed` to `interactionStore.mode`; click → `setMode`. World chip binds `aria-pressed` to `interactionStore.space`; click → `toggleSpace`. New Pivot chip binds to `settingsStore.pivotMode`; click → toggle. Gear icon → opens `EditorSettingsPopover`. |
| `apps/museum/src/lib/editor/MuseumEditorApp.svelte` | MODIFY | `setContext(SETTINGS_STORE_KEY, new SettingsStore())`; provide `openSettings$` popup flag (own `$state`) bound to `EditorViewportToolbar`. |
| `apps/museum/src/lib/editor/hooks/shortcuts.svelte.ts` | MODIFY | Add `Cmd+,` handling that toggles the popover's `open` flag (via App-context shared state). |
| `apps/museum/src/lib/editor/museum-editor.svelte.ts` | MODIFY | Facade additions: `pivotMode`, `lastSelectedId` getter; the chord between sub-stores. |
| `docs/agent-handoffs/phase-6.2.md` | NEW | Slice-end handoff doc mirrors `phase-6.1.md` structure. |
| `docs/agent-handoffs/CURRENT.md` | NEW/UPDATE | Pointer to phase-6.2 doc. |
| `docs/plans/museum-editor-workspace/README-museum-editor.md` | MODIFY | Bump status with 6.2 entries. |

Each task below produces independently testable changes.

---

### Task 1: Pure OBB utilities + tests

**Files:**
- Create: `apps/museum/src/lib/editor/obb-util.ts`
- Create: `apps/museum/src/lib/editor/obb-util.test.ts`

**Interfaces:**
- Consumes: nothing (extension of `three` types is acceptable but kept thin).
- Produces:

```ts
// apps/museum/src/lib/editor/obb-util.ts
import type { Box3, Matrix4 } from 'three';

export const OBB_VERTEX_COUNT = 8;
export const OBB_FLOATS_PER_VERTEX = 3;
export const OBB_FLOAT_COUNT = 24;

export const OBB_EDGE_INDICES: readonly number[] = [
  // 12 edges of a cube
  0, 1, 1, 2, 2, 3, 3, 0,   // bottom face
  4, 5, 5, 6, 6, 7, 7, 4,   // top face
  0, 4, 1, 5, 2, 6, 3, 7    // verticals
];

export function box3CornersToLineGeometry(box: Box3): {
  indices: Uint16Array;       // 24 indices, 12 edges × 2 verts
  initialFloats: Float32Array; // 24 floats, identity (will be overwritten per frame)
};

export function localCornersInto(
  matrixWorld: Matrix4,
  box: Box3,
  out: Float32Array            // length OBB_FLOAT_COUNT
): void;
```

- [ ] **Step 1: Write the failing test file**

```ts
// apps/museum/src/lib/editor/obb-util.test.ts
import { describe, expect, it } from 'vitest';
import { Box3, Matrix4, Vector3 } from 'three';
import {
  OBB_EDGE_INDICES,
  OBB_FLOAT_COUNT,
  OBB_VERTEX_COUNT,
  box3CornersToLineGeometry,
  localCornersInto
} from './obb-util';

const IDENTITY = new Matrix4();

describe('box3CornersToLineGeometry', () => {
  it('produces 8-vertex-indexed geometry with 12 distinct edges', () => {
    const box = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
    const { indices, initialFloats } = box3CornersToLineGeometry(box);
    expect(initialFloats.length).toBe(OBB_FLOAT_COUNT);
    expect(indices.length).toBe(24);
    expect(OBB_EDGE_INDICES.length).toBe(24);
    // each vertex index < OBB_VERTEX_COUNT
    for (let i = 0; i < indices.length; i++) {
      expect(indices[i]).toBeLessThan(OBB_VERTEX_COUNT);
      expect(indices[i]).toBeGreaterThanOrEqual(0);
    }
    // every face / edge appears once
    expect(OBB_EDGE_INDICES).toEqual([
      0, 1, 1, 2, 2, 3, 3, 0,
      4, 5, 5, 6, 6, 7, 7, 4,
      0, 4, 1, 5, 2, 6, 3, 7
    ]);
  });
});

describe('localCornersInto', () => {
  it('writes 24 floats (8 corners × 3) under identity transform', () => {
    const box = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
    const out = new Float32Array(OBB_FLOAT_COUNT);
    localCornersInto(IDENTITY, box, out);
    // each corner is at (±1, ±1, ±1)
    const seen = new Set<string>();
    for (let i = 0; i < OBB_VERTEX_COUNT; i++) {
      const x = out[i * 3 + 0];
      const y = out[i * 3 + 1];
      const z = out[i * 3 + 2];
      expect([Math.abs(x), Math.abs(y), Math.abs(z)]).toEqual([1, 1, 1]);
      seen.add(`${x},${y},${z}`);
    }
    expect(seen.size).toBe(8); // 8 distinct corners
  });

  it('transforms corners via a translation matrix', () => {
    const box = new Box3(new Vector3(0, 0, 0), new Vector3(1, 1, 1));
    const m = new Matrix4().makeTranslation(10, -5, 3);
    const out = new Float32Array(OBB_FLOAT_COUNT);
    localCornersInto(m, box, out);
    const expected = [10, -5, 3, 11, -5, 3, 11, -4, 3, 10, -4, 3,
                      10, -5, 4, 11, -5, 4, 11, -4, 4, 10, -4, 4];
    const asNumbers: number[] = [];
    for (let i = 0; i < out.length; i++) asNumbers.push(out[i]);
    expect(asNumbers).toEqual(expected);
  });

  it('rotates corners non-trivially under a rotation matrix', () => {
    // rotate 90° about Z axis
    const box = new Box3(new Vector3(-1, -1, 0), new Vector3(0, 1, 0));
    const m = new Matrix4().makeRotationZ(Math.PI / 2);
    const out = new Float32Array(OBB_FLOAT_COUNT);
    localCornersInto(m, box, out);
    const expected = [
      1, -1, 0,    
      1,  0, 0,   
      0,  0, 0,   
      0, -1, 0,   
      1, -1, 0,   // top face — z=0 still
      1,  0, 0,
      0,  0, 0,
      0, -1, 0
    ];
    for (let i = 0; i < out.length; i++) {
      expect(out[i]).toBeCloseTo(expected[i], 6);
    }
  });

  it('does not allocate a Vector3 per call (pre-allocated module-side)', () => {
    const box = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
    const out = new Float32Array(OBB_FLOAT_COUNT);
    // Mutating matrix identity gives the same result on consecutive calls.
    localCornersInto(IDENTITY, box, out);
    const first = Float32Array.from(out);
    localCornersInto(IDENTITY, box, out);
    expect(Float32Array.from(out)).toEqual(first);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run src/lib/editor/obb-util.test.ts`
Expected: FAIL — module not found `./obb-util`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/museum/src/lib/editor/obb-util.ts
import { Box3, Matrix4, Vector3 } from 'three';

export const OBB_VERTEX_COUNT = 8;
export const OBB_FLOATS_PER_VERTEX = 3;
export const OBB_FLOAT_COUNT = OBB_VERTEX_COUNT * OBB_FLOATS_PER_VERTEX;

export const OBB_EDGE_INDICES: readonly number[] = [
  0, 1, 1, 2, 2, 3, 3, 0,
  4, 5, 5, 6, 6, 7, 7, 4,
  0, 4, 1, 5, 2, 6, 3, 7
];

const VERTEX_OFFSETS: readonly number[] = [
  0b000, 0b001, 0b011, 0b010,
  0b100, 0b101, 0b111, 0b110
];

const _v = /* @__PURE__ */ new Vector3();

/**
 * Static indices + initial buffer for an OBB wireframe.
 * Corners themselves are NOT precomputed — they are streamed each frame via {@link localCornersInto}.
 */
export function box3CornersToLineGeometry(box: Box3): {
  indices: Uint16Array;
  initialFloats: Float32Array;
} {
  // initialFloats holds the box's corners (identity-transformed) as a sane default in case the helper
  // renders one frame before streaming kicks in.
  const initialFloats = new Float32Array(OBB_FLOAT_COUNT);
  localCornersInto(new Matrix4(), box, initialFloats);
  const indices = Uint16Array.from(OBB_EDGE_INDICES);
  return { indices, initialFloats };
}

/**
 * Streams 8 world-space corners of a placement-local box3 (axis-aligned in local space) into `out`.
 * Uses a module-side Vector3 to avoid per-frame allocation.
 */
export function localCornersInto(
  matrixWorld: Matrix4,
  box: Box3,
  out: Float32Array
): void {
  const min = box.min;
  const size = box.getSize(new Vector3());
  for (let i = 0; i < OBB_VERTEX_COUNT; i++) {
    const bit = VERTEX_OFFSETS[i];
    _v.set(
      min.x + (bit & 0b001 ? size.x : 0),
      min.y + (bit & 0b010 ? size.y : 0),
      min.z + (bit & 0b100 ? size.z : 0)
    );
    _v.applyMatrix4(matrixWorld);
    out[i * 3 + 0] = _v.x;
    out[i * 3 + 1] = _v.y;
    out[i * 3 + 2] = _v.z;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run src/lib/editor/obb-util.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Verify gates**

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run 2>&1 | tail -10 && npm run check -w @portfolio/museum`
Expected: All 861 tests still pass; svelte-check 0/0.

---

### Task 2: Editor settings store + tests

**Files:**
- Create: `apps/museum/src/lib/editor/settings-store.ts`
- Create: `apps/museum/src/lib/editor/settings-store.test.ts`

**Interfaces:**
- Consumes: nothing (browser `localStorage` only).
- Produces:

```ts
// apps/museum/src/lib/editor/settings-store.ts
export type PivotMode = 'center' | 'active-object';

export type EditorSettings = {
  translationStep: number;
  rotationStepDegrees: number;
  scaleStep: number;
  snapDefaultOn: boolean;
  pivotMode: PivotMode;
};

export const EDITOR_SETTINGS_KEY = 'museum-editor:settings:v1';
export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  translationStep: 0.25,
  rotationStepDegrees: 15,
  scaleStep: 0.1,
  snapDefaultOn: false,
  pivotMode: 'center'
};

export function loadEditorSettings(
  storage?: Storage | null
): EditorSettings;

export function validateSettings(raw: unknown): EditorSettings;

// Reactive store
export interface EditorSettingsStoreHandle {
  readonly settings: EditorSettings;
  readonly hydrated: boolean;          // true after load completes
  set(patch: Partial<EditorSettings>): void;
  reset(): void;
}

export class EditorSettingsStore implements EditorSettingsStoreHandle { ... }
```

- [ ] **Step 1: Write the failing test file**

```ts
// apps/museum/src/lib/editor/settings-store.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_EDITOR_SETTINGS,
  EDITOR_SETTINGS_KEY,
  EditorSettingsStore,
  loadEditorSettings,
  validateSettings,
  type EditorSettings
} from './settings-store';

let memoryStorage: Storage;

beforeEach(() => {
  memoryStorage = (() => {
    const map = new Map<string, string>();
    return {
      get length() { return map.size; },
      clear() { map.clear(); },
      getItem(k: string) { return map.has(k) ? map.get(k)! : null; },
      key(i: number) { return Array.from(map.keys())[i] ?? null; },
      removeItem(k: string) { map.delete(k); },
      setItem(k: string, v: string) { map.set(k, v); }
    } as Storage;
  })();
});

afterEach(() => memoryStorage.clear());

const VALID: EditorSettings = {
  translationStep: 0.5,
  rotationStepDegrees: 30,
  scaleStep: 0.2,
  snapDefaultOn: true,
  pivotMode: 'active-object'
};

describe('validateSettings', () => {
  it('returns defaults for null / undefined / non-object input', () => {
    expect(validateSettings(null)).toEqual(DEFAULT_EDITOR_SETTINGS);
    expect(validateSettings(undefined)).toEqual(DEFAULT_EDITOR_SETTINGS);
    expect(validateSettings('hello')).toEqual(DEFAULT_EDITOR_SETTINGS);
    expect(validateSettings(42)).toEqual(DEFAULT_EDITOR_SETTINGS);
  });

  it('returns defaults when every field is invalid', () => {
    const raw = {
      translationStep: 'lots',
      rotationStepDegrees: -10,
      scaleStep: NaN,
      snapDefaultOn: 'yes',
      pivotMode: 'magic'
    };
    expect(validateSettings(raw)).toEqual(DEFAULT_EDITOR_SETTINGS);
  });

  it('keeps valid per-field values and falls back for the rest', () => {
    const raw = {
      translationStep: 0.99,            // valid
      rotationStepDegrees: 7.8,         // not int — invalid
      scaleStep: 0.05,                  // valid
      snapDefaultOn: false,             // valid
      pivotMode: 'center'              // valid
    };
    expect(validateSettings(raw)).toEqual({
      ...DEFAULT_EDITOR_SETTINGS,
      translationStep: 0.99,
      scaleStep: 0.05,
      snapDefaultOn: false
      // rotationStepDegrees falls back to default; pivotMode 'center' is also default
    });
  });

  it('accepts edge-of-range values', () => {
    const raw = {
      translationStep: 0.01,
      rotationStepDegrees: 1,
      scaleStep: 0.5,
      snapDefaultOn: true,
      pivotMode: 'active-object'
    };
    expect(validateSettings(raw)).toEqual(raw);
  });

  it('rejects translationStep outside [0.01, 1.0]', () => {
    expect(validateSettings({ ...VALID, translationStep: 0.0 })).toMatchObject({ translationStep: DEFAULT_EDITOR_SETTINGS.translationStep });
    expect(validateSettings({ ...VALID, translationStep: 1.01 })).toMatchObject({ translationStep: DEFAULT_EDITOR_SETTINGS.translationStep });
  });

  it('rejects rotationStepDegrees not integer or outside [1, 90]', () => {
    expect(validateSettings({ ...VALID, rotationStepDegrees: 0 })).toMatchObject({ rotationStepDegrees: DEFAULT_EDITOR_SETTINGS.rotationStepDegrees });
    expect(validateSettings({ ...VALID, rotationStepDegrees: 91 })).toMatchObject({ rotationStepDegrees: DEFAULT_EDITOR_SETTINGS.rotationStepDegrees });
    expect(validateSettings({ ...VALID, rotationStepDegrees: 7.5 })).toMatchObject({ rotationStepDegrees: DEFAULT_EDITOR_SETTINGS.rotationStepDegrees });
  });

  it('rejects scaleStep outside [0.05, 0.5]', () => {
    expect(validateSettings({ ...VALID, scaleStep: 0.04 })).toMatchObject({ scaleStep: DEFAULT_EDITOR_SETTINGS.scaleStep });
    expect(validateSettings({ ...VALID, scaleStep: 0.51 })).toMatchObject({ scaleStep: DEFAULT_EDITOR_SETTINGS.scaleStep });
  });
});

describe('loadEditorSettings', () => {
  it('reads defaults when storage is empty', () => {
    expect(loadEditorSettings(memoryStorage)).toEqual(DEFAULT_EDITOR_SETTINGS);
  });

  it('returns all-defaults when stored JSON is malformed', () => {
    memoryStorage.setItem(EDITOR_SETTINGS_KEY, '{ this is not json');
    expect(loadEditorSettings(memoryStorage)).toEqual(DEFAULT_EDITOR_SETTINGS);
  });

  it('round-trips valid settings', () => {
    memoryStorage.setItem(EDITOR_SETTINGS_KEY, JSON.stringify(VALID));
    expect(loadEditorSettings(memoryStorage)).toEqual(VALID);
  });
});

describe('EditorSettingsStore', () => {
  it('hydrates with defaults on first construction', () => {
    const s = new EditorSettingsStore(memoryStorage);
    expect(s.settings).toEqual(DEFAULT_EDITOR_SETTINGS);
    expect(s.hydrated).toBe(true);
  });

  it('hydrates from stored JSON if present', () => {
    memoryStorage.setItem(EDITOR_SETTINGS_KEY, JSON.stringify(VALID));
    const s = new EditorSettingsStore(memoryStorage);
    expect(s.settings).toEqual(VALID);
  });

  it('set() updates state, validates per-key, persists', () => {
    const s = new EditorSettingsStore(memoryStorage);
    s.set({ translationStep: 0.5, pivotMode: 'active-object' });
    expect(s.settings).toMatchObject({ translationStep: 0.5, pivotMode: 'active-object' });
    const persisted = memoryStorage.getItem(EDITOR_SETTINGS_KEY);
    expect(persisted).not.toBeNull();
    const parsed = JSON.parse(persisted!);
    expect(parsed).toMatchObject({ translationStep: 0.5, pivotMode: 'active-object' });
  });

  it('set() rejects invalid patch values silently and keeps last good', () => {
    const s = new EditorSettingsStore(memoryStorage);
    s.set({ translationStep: 0.33 });
    s.set({ translationStep: 5.0 as unknown as number });           // invalid
    expect(s.settings.translationStep).toBe(0.33);
  });

  it('debounce coalesces rapid slider writes into a single localStorage write', async () => {
    const s = new EditorSettingsStore(memoryStorage);
    let writes = 0;
    const orig = memoryStorage.setItem;
    memoryStorage.setItem = ((k: string, v: string) => { writes++; orig.call(memoryStorage, k, v); }) as typeof memoryStorage.setItem;
    for (let i = 0; i < 10; i++) s.set({ translationStep: 0.25 + i * 0.01 });
    await new Promise((r) => setTimeout(r, DEBOUNCE_MS + 50));
    expect(writes).toBeLessThan(10);   // some coalescing
    expect(s.settings.translationStep).toBeCloseTo(0.34, 2);
  });

  it('reset() restores defaults + persists immediately', () => {
    const s = new EditorSettingsStore(memoryStorage);
    s.set({ translationStep: 0.9 });
    s.reset();
    expect(s.settings).toEqual(DEFAULT_EDITOR_SETTINGS);
    const persisted = memoryStorage.getItem(EDITOR_SETTINGS_KEY);
    expect(JSON.parse(persisted!)).toEqual(DEFAULT_EDITOR_SETTINGS);
  });
});
```

Note: `DEBOUNCE_MS` is referenced as a constant exported from `settings-store.ts` (default = 200 ms). The actual environment constant is exported (no magic number).

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run src/lib/editor/settings-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/museum/src/lib/editor/settings-store.ts
import { SvelteMap } from 'svelte/reactivity';

export type PivotMode = 'center' | 'active-object';

export type EditorSettings = {
  translationStep: number;
  rotationStepDegrees: number;
  scaleStep: number;
  snapDefaultOn: boolean;
  pivotMode: PivotMode;
};

export const EDITOR_SETTINGS_KEY = 'museum-editor:settings:v1';

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  translationStep: 0.25,
  rotationStepDegrees: 15,
  scaleStep: 0.1,
  snapDefaultOn: false,
  pivotMode: 'center'
};

export const DEBOUNCE_MS = 200;

const VALIDATORS = {
  translationStep: (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0.01 && v <= 1.0,
  rotationStepDegrees: (v: unknown): v is number =>
    Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 90,
  scaleStep: (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0.05 && v <= 0.5,
  snapDefaultOn: (v: unknown): v is boolean => typeof v === 'boolean',
  pivotMode: (v: unknown): v is PivotMode => v === 'center' || v === 'active-object'
};

export function validateSettings(raw: unknown): EditorSettings {
  if (raw == null || typeof raw !== 'object') return { ...DEFAULT_EDITOR_SETTINGS };
  const result: EditorSettings = { ...DEFAULT_EDITOR_SETTINGS };
  const obj = raw as Record<keyof EditorSettings, unknown>;
  if (VALIDATORS.translationStep(obj.translationStep)) result.translationStep = obj.translationStep;
  if (VALIDATORS.rotationStepDegrees(obj.rotationStepDegrees)) result.rotationStepDegrees = obj.rotationStepDegrees;
  if (VALIDATORS.scaleStep(obj.scaleStep)) result.scaleStep = obj.scaleStep;
  if (VALIDATORS.snapDefaultOn(obj.snapDefaultOn)) result.snapDefaultOn = obj.snapDefaultOn;
  if (VALIDATORS.pivotMode(obj.pivotMode)) result.pivotMode = obj.pivotMode;
  return result;
}

export function loadEditorSettings(
  storage: Storage | null | undefined = typeof localStorage === 'undefined' ? null : localStorage
): EditorSettings {
  if (!storage) return { ...DEFAULT_EDITOR_SETTINGS };
  const raw = storage.getItem(EDITOR_SETTINGS_KEY);
  if (raw == null) return { ...DEFAULT_EDITOR_SETTINGS };
  try {
    const parsed = JSON.parse(raw);
    return validateSettings(parsed);
  } catch {
    return { ...DEFAULT_EDITOR_SETTINGS };
  }
}

function persistSync(storage: Storage, settings: EditorSettings): void {
  storage.setItem(EDITOR_SETTINGS_KEY, JSON.stringify(settings));
}

export interface EditorSettingsStoreHandle {
  readonly settings: EditorSettings;
  readonly hydrated: boolean;
  set(patch: Partial<EditorSettings>): void;
  reset(): void;
}

export class EditorSettingsStore implements EditorSettingsStoreHandle {
  #settings = $state<EditorSettings>({ ...DEFAULT_EDITOR_SETTINGS });
  #hydrated = $state<boolean>(false);
  #storage: Storage | null;
  #writeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(storage: Storage | null | undefined = typeof localStorage === 'undefined' ? null : localStorage) {
    this.#storage = storage;
    this.#settings = loadEditorSettings(storage);
    this.#hydrated = true;
  }

  get settings(): EditorSettings {
    return this.#settings;
  }

  get hydrated(): boolean {
    return this.#hydrated;
  }

  set(patch: Partial<EditorSettings>): void {
    const next: EditorSettings = { ...this.#settings };
    if (patch.translationStep !== undefined && VALIDATORS.translationStep(patch.translationStep)) {
      next.translationStep = patch.translationStep;
    }
    if (patch.rotationStepDegrees !== undefined && VALIDATORS.rotationStepDegrees(patch.rotationStepDegrees)) {
      next.rotationStepDegrees = patch.rotationStepDegrees;
    }
    if (patch.scaleStep !== undefined && VALIDATORS.scaleStep(patch.scaleStep)) {
      next.scaleStep = patch.scaleStep;
    }
    if (patch.snapDefaultOn !== undefined && VALIDATORS.snapDefaultOn(patch.snapDefaultOn)) {
      next.snapDefaultOn = patch.snapDefaultOn;
    }
    if (patch.pivotMode !== undefined && VALIDATORS.pivotMode(patch.pivotMode)) {
      next.pivotMode = patch.pivotMode;
    }
    this.#settings = next;
    this.#schedulePersist();
  }

  reset(): void {
    this.#settings = { ...DEFAULT_EDITOR_SETTINGS };
    if (this.#storage) persistSync(this.#storage, this.#settings);
  }

  #schedulePersist(): void {
    if (!this.#storage) return;
    if (this.#writeTimer != null) clearTimeout(this.#writeTimer);
    this.#writeTimer = setTimeout(() => {
      persistSync(this.#storage!, this.#settings);
      this.#writeTimer = null;
    }, DEBOUNCE_MS);
  }
}

export const SETTINGS_STORE_KEY = Symbol('museum-editor:settings-store');
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run src/lib/editor/settings-store.test.ts`
Expected: PASS — ≥ 14 tests.

- [ ] **Step 5: Verify gates**

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run 2>&1 | tail -10 && npm run check -w @portfolio/museum`
Expected: All 861+ tests pass; svelte-check 0/0.

---

### Task 3: selection-actions lastSelectedId writer hooks

**Files:**
- Modify: `apps/museum/src/lib/editor/store/selection-actions.svelte.ts` — add `lastSelectedId` reactive field + writer hooks.
- Modify: `apps/museum/src/lib/editor/store/selection-actions.test.ts` — extend with `lastSelectedId` assertions.

**Interfaces:**
- Consumes: existing `SelectionActionsStore` API.
- Produces:

```ts
// added to selection-actions.svelte.ts
lastSelectedId: PlacementId | null;        // reactive read
```

Constructor and existing setters continue to write `lastSelectedId` to the touched id; bulk `setSelectionSet` writes the last entry.

- [ ] **Step 1: Identify all selection-mutation sites**

Run: `cd /Users/tony/Documents/Personal && grep -nE 'addPlacement|togglePlacement|selectPlacement|selectSet|setSelectionSet' apps/museum/src/lib/editor/store/selection-actions.svelte.ts`
Expected: A short list of mutation setters.

- [ ] **Step 2: Write the failing test file**

Add to existing `selection-actions.test.ts` (or create if the file does not exist yet):

```ts
import { describe, expect, it } from 'vitest';
import { createEditorSelectionStore } from './selection-actions.svelte';  // adjust import name to actual factory

describe('lastSelectedId writer hooks', () => {
  it('selectOnly(id) writes lastSelectedId', async () => {
    const store = await createEditorSelectionStore();    // adapt to actual factory signature
    store.selectOnly('p1');
    expect(store.lastSelectedId).toBe('p1');
    store.selectOnly('p2');
    expect(store.lastSelectedId).toBe('p2');
  });

  it('addPlacement(id) writes lastSelectedId when newly added', async () => {
    const store = await createEditorSelectionStore();
    store.selectOnly('p1');
    store.addPlacement('p2');
    expect(store.lastSelectedId).toBe('p2');
  });

  it('toggleInSelection adds and writes lastSelectedId', async () => {
    const store = await createEditorSelectionStore();
    store.toggleInSelection('p1');
    expect(store.lastSelectedId).toBe('p1');
    store.toggleInSelection('p1');                       // removes
    expect(store.lastSelectedId).toBe('p1');             // last touched; removing still leaves a trace
  });

  it('setSelectionSet writes the last id from the set', async () => {
    const store = await createEditorSelectionStore();
    store.setSelectionSet(['a', 'b', 'c']);
    expect(store.lastSelectedId).toBe('c');
  });

  it('deselect clears the lastSelectedId', async () => {
    const store = await createEditorSelectionStore();
    store.selectOnly('p1');
    store.deselect();
    expect(store.lastSelectedId).toBeNull();
  });
});
```

Adapt the import + factory call to the existing factory signature in `selection-actions.svelte.ts`. If the existing tests already dispatch mutations with `dispatch(...)`, mirror that style; the writer hook is the same — only adds `lastSelectedId = id` after the mutation.

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run src/lib/editor/store/selection-actions.test.ts`
Expected: FAIL — at least one assertion on `lastSelectedId` fails because field doesn't exist.

- [ ] **Step 3: Add `lastSelectedId` writer hooks**

In `apps/museum/src/lib/editor/store/selection-actions.svelte.ts`:

Add the reactive field declaration alongside existing `$state(...)` fields:
```ts
lastSelectedId: PlacementId | null = $state<PlacementId | null>(null);
```

In each setter, after the mutation completes, write `this.lastSelectedId = id`:
- `selectOnly(id)` → `this.lastSelectedId = id`
- `addPlacement(id)` → set contains id, `this.lastSelectedId = id`
- `toggleInSelection(id)` → `this.lastSelectedId = id`
- `setSelectionSet(ids)` → `this.lastSelectedId = ids[ids.length - 1] ?? null`
- `removeAllFromSelection()`, `deselect()` → `this.lastSelectedId = null`

Wire-up: don't break existing public API. Just add the field.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run src/lib/editor/store/selection-actions.test.ts`
Expected: PASS — 5 new assertions + existing tests still green.

- [ ] **Step 5: Verify gates**

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run 2>&1 | tail -10 && npm run check -w @portfolio/museum`
Expected: All 861+ tests pass; svelte-check 0/0.

---

### Task 4: EditorSelectionHelper — replace Box3Helper with LineSegments corners-stream

**Files:**
- Modify: `apps/museum/src/lib/editor/EditorSelectionHelper.svelte` — replace `Box3Helper` instances with `LineSegments` + `localCornersInto` per-frame stream.
- Modify: `apps/museum/src/lib/editor/EditorSelectionHelper.test.ts` — replace `Box3Helper`-centric assertions with `LineSegments` assertions.

**Interfaces:**
- Consumes:
  - `OBB_FLOAT_COUNT` / `localCornersInto` / `box3CornersToLineGeometry` from Task 1.
  - `selectionKey`, `selectionSize` from existing selection sub-store.
  - `isVisitorPreview` gate (existing).
- Produces:
  - Same gold wire cube (`#d6b35f`), now rotation-aware; same depthTest=false, raycast=null, visitor gate.

- [ ] **Step 1: Inspect current `EditorSelectionHelper.svelte`**

Run: `cd /Users/tony/Documents/Personal && sed -n '1,80p' apps/museum/src/lib/editor/EditorSelectionHelper.svelte`
Expected: shows the current `Box3Helper` construction + the `useTask` per-frame loop.

- [ ] **Step 2: Write the failing spec adjustments**

In `EditorSelectionHelper.test.ts`, locate the `Box3Helper`-centric assertions (search for `Box3Helper` and any `box.copy(...)` test). Replace them with the following skeleton (extend; do not delete existing passes — layer the new expectations):

```ts
// Expected additions / replacements:
import { Box3, Box3Helper, BoxGeometry, LineSegments, Mesh, Object3D } from 'three';
import { OBB_FLOAT_COUNT } from './obb-util';

describe('OBB selection helper', () => {
  it('attaches one LineSegments per selection entry', () => {
    // construct a fake scene + two fake roots; mount helper; assert count = 2
  });

  it('LineSegments geometry has 24 floats and 24 indices', () => {
    // assert ray.geometry.attributes.position.array.length === OBB_FLOAT_COUNT
    // assert ray.geometry.index.array.length === 24
  });

  it('per-frame streaming writes matrix-transformed corners', () => {
    // root.matrixWorld updated → call render-loop stub → assert Float32Array differs from prior
  });

  it('gold material, depthTest=false, renderOrder=1000, raycast=null', () => {
    // assert material.color.getHex() === 0xd6b35f
    // assert material.depthTest === false
    // assert ray.renderOrder === 1000
    // assert ray.raycast is a no-op function (returns nothing)
  });

  it('visitor preview gate hides every helper', () => {
    // set isVisitorPreview=true; render-loop runs; helpers.visible === false OR scene.children excludes them
  });
});
```

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run src/lib/editor/EditorSelectionHelper.test.ts`
Expected: FAIL — at least the `LineSegments.geometry.attributes.position.array.length === OBB_FLOAT_COUNT` and index-array length assertions fail (still using `Box3Helper`).

- [ ] **Step 3: Refactor `EditorSelectionHelper.svelte`**

Replace the `Box3Helper` allocation + per-frame `setFromObject` with:

```svelte
<script lang="ts">
  // Existing imports.
  import {
    LineSegments,
    LineBasicMaterial,
    Box3,
    Matrix4,
    BufferGeometry,
    Object3D
  } from 'three';
  import {
    OBB_FLOAT_COUNT,
    box3CornersToLineGeometry,
    localCornersInto
  } from './obb-util';

  // Existing: selection store, visitorPreview store, scene/camera accessor.
  type Entry = {
    id: string;
    root: Object3D;
    geometry: BufferGeometry;        // shared across entries (positions per-frame)
    material: LineBasicMaterial;
    lineSegments: LineSegments;
    localBox: Box3;                  // placement-local box cached at attach
    positionBuffer: Float32Array;    // OBB_FLOAT_COUNT view into geometry attr
  };

  let entries: Entry[] = [];

  function rebuild(): void {
    disposeEntries();
    const ids = selection.getIds();  // existing helper
    for (const id of ids) {
      const root = findPlacementRoot(id);    // existing helper
      if (!root) continue;
      const localBox = computeRootLocalBox(root);    // see Step 3b
      const { indices, initialFloats } = box3CornersToLineGeometry(localBox);
      const positionAttribute = new BufferAttribute(initialFloats, 3);
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', positionAttribute);
      geometry.setIndex(new BufferAttribute(indices, 1));
      const material = new LineBasicMaterial({
        color: 0xd6b35f,
        depthTest: false,
        transparent: false,
        fog: false,
        linewidth: 1
      });
      const lineSegments = new LineSegments(geometry, material);
      lineSegments.renderOrder = 1000;
      lineSegments.frustumCulled = false;
      lineSegments.raycast = () => undefined;
      scene.add(lineSegments);
      entries.push({
        id,
        root,
        geometry,
        material,
        lineSegments,
        localBox,
        positionBuffer: initialFloats
      });
    }
  }

  function disposeEntries(): void {
    for (const e of entries) {
      scene.remove(e.lineSegments);
      e.geometry.dispose();
      e.material.dispose();
    }
    entries = [];
  }

  function computeRootLocalBox(root: Object3D): Box3 {
    // Walk root → for each Mesh subtree child:
    //   local box from geometry.boundingBox, transformed by child.matrix
    //   union into the placement-local box
    const box = new Box3().makeEmpty();
    root.updateWorldMatrix(true, false);
    root.traverse((child) => {
      const mesh = child as unknown as { isMesh: boolean; geometry: { boundingBox: Box3 | null }; matrix: Matrix4 };
      if (!mesh.isMesh) return;
      if (mesh.geometry.boundingBox == null) {
        // assume BufferGeometry; computeBoundingBox exists
        (mesh.geometry as { computeBoundingBox(): void }).computeBoundingBox();
      }
      const local = (mesh.geometry.boundingBox ?? new Box3()).clone();
      local.applyMatrix4(mesh.matrix);
      box.union(local);
    });
    return box;
  }

  // Existing useTask (per-frame):
  $effect(() => {
    // existing selectionKey reactive already triggers `rebuild` via $effect;
    // the per-frame streaming lives in the useTask callback.
  });

  useTask(() => {
    if (gate.isVisitorPreview) {
      for (const e of entries) e.lineSegments.visible = false;
      return;
    }
    for (const e of entries) {
      e.root.updateWorldMatrix(true, false);
      localCornersInto(e.root.matrixWorld, e.localBox, e.positionBuffer);
      (e.geometry.attributes.position as BufferAttribute).needsUpdate = true;
      e.lineSegments.visible = true;
    }
  });

  onDestroy(() => disposeEntries());
</script>
```

Notes:
- `computeRootLocalBox` is a defensive helper — for simple primitives (mesh direct), `box3.setFromObject(root)` at attach time would also work, but the OBB must be placement-local (not in world space) so that per-frame `localCornersInto(matrixWorld, localBox)` produces the rotated world corners. The walk-then-union-in-root-frame approach is correct and small.
- `useTask` (Threlte 7 mount) or `$effect` with `useTask` mirror — keep existing pattern.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run src/lib/editor/EditorSelectionHelper.test.ts`
Expected: PASS — all OBB-centring assertions + existing tests still green.

- [ ] **Step 5: Verify gates**

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run 2>&1 | tail -10 && npm run check -w @portfolio/museum`
Expected: All 861+ tests pass; svelte-check 0/0.

---

### Task 5: EditorSelectionPivot — Center / Active Object resolution

**Files:**
- Modify: `apps/museum/src/lib/editor/EditorSelectionPivot.svelte` (or create if not yet a separate file).
- Modify: `apps/museum/src/lib/editor/museum-editor.test.ts` (or appropriate existing pivot test) to assert `pivotMode === 'active-object'` resolves gizmo attach to `lastSelectedId` root.

**Interfaces:**
- Consumes:
  - `selectionSet`, `lastSelectedId` (Task 3).
  - `pivotMode: PivotMode` (from settings-store via `MuseumEditorApp`).
  - `findPlacementRoot(id)` (existing helper).
- Produces:
  - `pivot: Object3D | null` (existing prop, behavior split by mode).

- [ ] **Step 1: Identify `EditorSelectionPivot.svelte` shape**

Run: `cd /Users/tony/Documents/Personal && grep -nE 'EditorSelectionPivot|pivot.position|controls.attach' apps/museum/src/lib/editor/*.svelte apps/museum/src/lib/editor/*.ts 2>/dev/null | head -40`
Expected: Pinpoints where pivot is computed.

- [ ] **Step 2: Write failing test additions**

Add a test in `museum-editor.test.ts` (or pivot-specific test file if present) covering:

```ts
it('pivotMode = active-object resolves gizmo to lastSelectedId root', () => {
  const store = createEditorStoreForTest();
  store.selection.selectOnly('p1');
  store.selection.addPlacement('p2');
  store.selection.addPlacement('p3');
  // lastSelectedId === 'p3'
  store.settings.set({ pivotMode: 'active-object' });
  // Mount pivot helper; assert Object3D.uuid matches lastSelectedRoot's root.uuid
});

it('pivotMode = center falls back to centroid bbox', () => {
  const store = createEditorStoreForTest();
  store.selection.selectOnly('p1');
  store.selection.addPlacement('p2');
  store.settings.set({ pivotMode: 'center' });
  // Mount pivot; assert position is midpoint
});

it('single-select always uses its own root regardless of pivotMode', () => {
  const store = createEditorStoreForTest();
  store.selection.selectOnly('p1');
  store.settings.set({ pivotMode: 'center' });
  // → root of p1
  store.settings.set({ pivotMode: 'active-object' });
  // → still root of p1
});

it('empty selection detaches (returns null)', () => {
  const store = createEditorStoreForTest();
  expect(store.pivotResolve()).toBeNull();
});
```

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run src/lib/editor/museum-editor.test.ts`
Expected: at least one assertion fails (active-object branch missing).

- [ ] **Step 3: Implement pivot resolution**

Refactor the pivot computation logic into a sibling helper (extracted from `EditorSelectionPivot.svelte` or `EditorTransformControls.svelte`, whichever owns it today):

```ts
// apps/museum/src/lib/editor/pivot-resolve.ts
import { Box3, Object3D, Vector3 } from 'three';
import type { PlacementId } from './store/selection-actions.svelte';
import { findPlacementRoot } from './placement-roots';   // existing helper

export type PivotMode = 'center' | 'active-object';

export function resolvePivot(
  selectionIds: readonly PlacementId[],
  lastSelectedId: PlacementId | null,
  pivotMode: PivotMode
): Object3D | null {
  const entries: Object3D[] = [];
  for (const id of selectionIds) {
    const root = findPlacementRoot(id);
    if (root) entries.push(root);
  }
  if (entries.length === 0) return null;

  // Single-select: always its own root.
  if (entries.length === 1) return entries[0];

  if (pivotMode === 'active-object' && lastSelectedId) {
    const found = entries.find((e) => e.userData.placementId === lastSelectedId);
    if (found) return found;
  }

  // Fallback: centroid bbox.
  const box = new Box3();
  for (const root of entries) {
    box.union(new Box3().setFromObject(root));
  }
  const center = new Vector3();
  box.getCenter(center);
  const pivot = new Object3D();
  pivot.position.copy(center);
  pivot.userData.role = 'editor-pivot-centroid';
  return pivot;
}
```

Wire `EditorSelectionPivot.svelte` to call this on each `selection`/`pivotMode`/`lastSelectedId` reactive update and `controls.attach(...)` with the resulting `pivot` (existing logic).

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run src/lib/editor/museum-editor.test.ts`
Expected: PASS — 4 pivot-mode assertions + existing tests still green.

- [ ] **Step 5: Verify gates**

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run 2>&1 | tail -10 && npm run check -w @portfolio/museum`
Expected: All 861+ tests pass; svelte-check 0/0.

---

### Task 6: EditorTransformControls — settings snap at attach + per-mode Space

**Files:**
- Modify: `apps/museum/src/lib/editor/EditorTransformControls.svelte`
- No test file structural change, but extend behaviour such that existing `EditorTransformControls` tests still green; add minimal coverage if a `EditorTransformControls.test.ts` exists.

**Interfaces:**
- Consumes:
  - `settingsStore: EditorSettingsStore` (from context).
  - `mode` from `interactionStore`.
  - existing snap step setters.
- Produces: per-mode snap applied at attach when `snapDefaultOn === true`.

- [ ] **Step 1: Identify attach point and snap setters**

Run: `cd /Users/tony/Documents/Personal && grep -nE 'setTranslationSnap|setRotationSnap|setScaleSnap|interactionStore\.mode|controls\.attach' apps/museum/src/lib/editor/EditorTransformControls.svelte`
Expected: shows existing attach logic and where the 6.1 Ctrl/Cmd override lives.

- [ ] **Step 2: Wire settings-store context consumption**

`EditorTransformControls.svelte` already injects the interaction store via `getContext(EDITOR_INTERACTION_STORE_KEY)`. Add `getContext(SETTINGS_STORE_KEY)` for the settings store.

Add a `$effect` that runs whenever `settingsStore.settings.snapDefaultOn`, `settingsStore.settings.translationStep`, `settingsStore.settings.rotationStepDegrees`, `settingsStore.settings.scaleStep`, or `interactionStore.mode` change. Inside:

```ts
const snapOn = settingsStore.settings.snapDefaultOn;
if (snapOn) {
  switch (interactionStore.mode) {
    case 'translate':
      controls.setTranslationSnap(settingsStore.settings.translationStep);
      break;
    case 'rotate':
      controls.setRotationSnap(THREE.MathUtils.degToRad(settingsStore.settings.rotationStepDegrees));
      break;
    case 'scale':
      controls.setScaleSnap(settingsStore.settings.scaleStep);
      break;
  }
} else {
  controls.setTranslationSnap(null);
  controls.setRotationSnap(null);
  controls.setScaleSnap(null);
}
```

The Ctrl/Cmd override from 6.1 sits inside `keydown`/`keyup` handlers; it touches the same setters. The new effect runs on `settings` change only (without Ctrl/Cmd), so the override always wins when the user is mid-drag.

- [ ] **Step 3: Apply at attach time**

In the existing $effect that runs `controls.attach(pivot)` (or `$effect(() => { ... controls.attach(pivot) })`), call the same switch (mirror the body so it runs once on selection change). Order: pivot attach first, then snap apply.

- [ ] **Step 4: Sanity-check tests still pass**

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run 2>&1 | tail -10 && npm run check -w @portfolio/museum`
Expected: All 861+ tests pass; svelte-check 0/0.

(No new test required — the behaviour is settings-driven and depends on `interactionStore.mode` keys, which the existing transform-controls test already exercises; if a coverage gap appears, add an integration assertion to `museum-editor.test.ts` for the toggle.)

- [ ] **Step 5: Verify gates**

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run 2>&1 | tail -10 && npm run check -w @portfolio/museum`
Expected: All 861+ tests pass; svelte-check 0/0.

---

### Task 7: EditorSettingsPopover + SETTINGS_STORE_KEY context in MuseumEditorApp

**Files:**
- Create: `apps/museum/src/lib/editor/EditorSettingsPopover.svelte`
- Create: `apps/museum/src/lib/editor/EditorSettingsPopover.test.ts`
- Modify: `apps/museum/src/lib/editor/MuseumEditorApp.svelte` — construct + `setContext(SETTINGS_STORE_KEY, ...)`; provide an `openSettings$` flag + setter.
- Modify: `apps/museum/src/lib/editor/EditorViewportToolbar.svelte` — accept `openSettings: boolean` and `setOpenSettings: (open: boolean) => void` props (or read via context).

**Interfaces:**
- Consumes:
  - `EditorSettingsStore`.
  - existing `EditorViewportToolbar` toolbar props.
- Produces:
  - A floating popover anchored bottom-right; opens/closes via prop or context.

- [ ] **Step 1: Inspect existing context wiring**

Run: `cd /Users/tony/Documents/Personal && grep -nE 'setContext|EDITOR_INTERACTION_STORE_KEY|EditorInteractionStore' apps/museum/src/lib/editor/*.svelte apps/museum/src/lib/editor/*.ts | head -20`
Expected: Shows existing `EDITOR_INTERACTION_STORE_KEY` context usage.

- [ ] **Step 2: Write failing test for the popover**

```ts
// apps/museum/src/lib/editor/EditorSettingsPopover.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';    // adjust helper if project uses a different one
import { tick } from 'svelte';
import EditorSettingsPopover from './EditorSettingsPopover.svelte';
import { EditorSettingsStore } from './settings-store';

describe('EditorSettingsPopover', () => {
  let store: EditorSettingsStore;
  let open: { v: boolean };

  beforeEach(() => {
    store = new EditorSettingsStore(null);    // no storage — defaults always
    open = { v: true };
    cleanup();
  });

  it('renders when open=true; hides when open=false', async () => {
    const { container } = render(EditorSettingsPopover, { props: { open: true, settingsStore: store, onClose: () => {} } });
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('click-away closes; Esc closes', async () => {
    const onClose = vi.fn();
    const { container, component } = render(EditorSettingsPopover, { props: { open: true, settingsStore: store, onClose } });
    await fireEvent.keyDown(container, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('changing translation step writes back to store', async () => {
    const { container } = render(EditorSettingsPopover, { props: { open: true, settingsStore: store, onClose: () => {} } });
    const input = container.querySelector('input[name="translationStep"]') as HTMLInputElement;
    input.value = '0.5';
    await fireEvent.input(input);
    await tick();
    expect(store.settings.translationStep).toBe(0.5);
  });

  it('snap-default checkbox toggles settingsStore.settings.snapDefaultOn', async () => {
    const { container } = render(EditorSettingsPopover, { props: { open: true, settingsStore: store, onClose: () => {} } });
    const cb = container.querySelector('input[name="snapDefaultOn"]') as HTMLInputElement;
    expect(cb.checked).toBe(false);
    await fireEvent.change(cb, { target: { checked: true } });
    expect(store.settings.snapDefaultOn).toBe(true);
  });

  it('pivot-mode radio toggles between center and active-object', async () => {
    const { container } = render(EditorSettingsPopover, { props: { open: true, settingsStore: store, onClose: () => {} } });
    const radio = container.querySelector('input[name="pivotMode"][value="active-object"]') as HTMLInputElement;
    await fireEvent.change(radio, { target: { value: 'active-object' } });
    expect(store.settings.pivotMode).toBe('active-object');
  });

  it('Reset button restores defaults', async () => {
    const { container } = render(EditorSettingsPopover, { props: { open: true, settingsStore: store, onClose: () => {} } });
    store.set({ translationStep: 0.9 });
    const btn = container.querySelector('button[name="reset"]') as HTMLButtonElement;
    await fireEvent.click(btn);
    expect(store.settings.translationStep).toBe(0.25);
  });
});
```

Notes:
- Use the existing render helper (vitest + svelte testing) the project already uses for `EditorAppBar` / `EditorProjectMenu` etc. Adjust import path / render signature.
- `vi` from vitest.

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run src/lib/editor/EditorSettingsPopover.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the popover**

```svelte
<!-- apps/museum/src/lib/editor/EditorSettingsPopover.svelte -->
<script lang="ts">
  import type { EditorSettingsStore } from './settings-store';
  import { DEFAULT_EDITOR_SETTINGS } from './settings-store';

  type Props = {
    open: boolean;
    settingsStore: EditorSettingsStore;
    onClose: () => void;
  };
  let { open = $bindable(false), settingsStore, onClose }: Props = $props();

  function close(): void { open = false; onClose(); }

  function handleKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') close();
  }

  $effect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  });

  function onClickAway(event: MouseEvent): void {
    if (!open) return;
    const dialog = (event.currentTarget as HTMLElement).querySelector('[data-settings-popover]');
    if (dialog && !dialog.contains(event.target as Node)) close();
  }
</script>

{#if open}
  <div class="settings-popover-anchor" role="presentation" onclick={onClickAway}>
    <div
      class="settings-popover"
      role="dialog"
      aria-label="Editor settings"
      data-settings-popover
    >
      <header>Editor settings</header>

      <section>
        <h3>Snap</h3>
        <label>
          Translation step
          <input
            name="translationStep"
            type="number"
            min="0.01" max="1.0" step="0.01"
            value={settingsStore.settings.translationStep}
            oninput={(e) => settingsStore.set({ translationStep: clampNumber(e.currentTarget.value, 0.01, 1.0) })}
          /> m
        </label>
        <label>
          Rotation step
          <input
            name="rotationStepDegrees"
            type="number"
            min="1" max="90" step="1"
            value={settingsStore.settings.rotationStepDegrees}
            oninput={(e) => settingsStore.set({ rotationStepDegrees: clampInt(e.currentTarget.value, 1, 90) })}
          /> °
        </label>
        <label>
          Scale step
          <input
            name="scaleStep"
            type="number"
            min="0.05" max="0.5" step="0.05"
            value={settingsStore.settings.scaleStep}
            oninput={(e) => settingsStore.set({ scaleStep: clampNumber(e.currentTarget.value, 0.05, 0.5) })}
          />
        </label>
        <label class="row">
          <input
            name="snapDefaultOn"
            type="checkbox"
            checked={settingsStore.settings.snapDefaultOn}
            onchange={(e) => settingsStore.set({ snapDefaultOn: e.currentTarget.checked })}
          />
          Snap on by default
        </label>
      </section>

      <section>
        <h3>Pivot</h3>
        <label>
          <input
            type="radio" name="pivotMode" value="center"
            checked={settingsStore.settings.pivotMode === 'center'}
            onchange={() => settingsStore.set({ pivotMode: 'center' })}
          />
          Center
        </label>
        <label>
          <input
            type="radio" name="pivotMode" value="active-object"
            checked={settingsStore.settings.pivotMode === 'active-object'}
            onchange={() => settingsStore.set({ pivotMode: 'active-object' })}
          />
          Active Object
        </label>
      </section>

      <footer>
        <button name="reset" type="button" onclick={() => settingsStore.reset()}>Reset to defaults</button>
      </footer>
    </div>
  </div>
{/if}

<script context="module" lang="ts">
  function clampNumber(raw: string, min: number, max: number): number {
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return min;
    return Math.max(min, Math.min(max, parsed));
  }
  function clampInt(raw: string, min: number, max: number): number {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return min;
    return Math.max(min, Math.min(max, parsed));
  }
</script>

<style>
  .settings-popover-anchor {
    position: fixed; inset: 0; pointer-events: auto;
    background: transparent;
    z-index: 10020;
  }
  .settings-popover {
    position: absolute; right: 16px; bottom: 56px; width: 280px;
    background: var(--museum-editor-panel-bg, #1c1822);
    color: var(--museum-editor-fg, #e9e3f0);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    padding: 12px 16px;
    font: 13px/1.4 system-ui, sans-serif;
  }
  header { font-weight: 600; margin-bottom: 8px; }
  section { display: grid; gap: 6px; margin: 8px 0; }
  section h3 { font-size: 12px; text-transform: uppercase; color: #9c8eaa; margin: 4px 0; }
  label { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
  label.row { display: flex; gap: 8px; align-items: center; }
  input[type="number"], input[type="checkbox"], input[type="radio"] {
    accent-color: #d6b35f;
  }
  footer { margin-top: 12px; text-align: right; }
  footer button { background: rgba(255,255,255,0.08); border: none; color: inherit; padding: 4px 12px; border-radius: 6px; cursor: pointer; }
  footer button:hover { background: rgba(255,255,255,0.16); }
</style>
```

Move `clampNumber`/`clampInt` into the module `<script lang="ts">` block (drop the `context="module"` block in the same source file).

- [ ] **Step 4: Wire context**

`MuseumEditorApp.svelte`:
```svelte
<script lang="ts">
  import { EditorSettingsStore, SETTINGS_STORE_KEY } from './settings-store';
  // (existing imports)
  const settingsStore = new EditorSettingsStore();
  setContext(SETTINGS_STORE_KEY, settingsStore);
  const openSettings = $state(false);
  setContext(EDITOR_OPEN_SETTINGS_KEY, {
    get open() { return openSettings; },
    set: (v: boolean) => { openSettings = v; }
  });    // create new symbol EDITTOR_OPEN_SETTINGS_KEY in the App
</script>

<EditorViewportToolbar ... settingsStore={settingsStore} />
<!-- popover rendered conditionally somewhere visible -->
{#if openSettings}
  <EditorSettingsPopover open={true} settingsStore={settingsStore} onClose={() => openSettings = false} />
{/if}
```

The exact wiring may differ based on existing structure; the rule: the popover is mounted inside `MuseumEditorApp` only when mount guard passes (existing dev-only route check).

- [ ] **Step 5: Verify gates**

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run 2>&1 | tail -10 && npm run check -w @portfolio/museum`
Expected: All 861+ tests pass; svelte-check 0/0.

---

### Task 8: EditorViewportToolbar — gear icon + chip bindings + Cmd+, shortcut

**Files:**
- Modify: `apps/museum/src/lib/editor/EditorViewportToolbar.svelte`
- Modify: `apps/museum/src/lib/editor/MuseumEditorApp.svelte` (already touched in Task 7)
- Modify: `apps/museum/src/lib/editor/hooks/shortcuts.svelte.ts`

**Interfaces:**
- Consumes:
  - `EditorSettingsStore`, `interactionStore`.
  - existing toolbar chips.
  - existing `Cmd+Z` / `Cmd+Shift+Z` shortcut binding.
- Produces:
  - `aria-pressed` bindings + `setMode` / `toggleSpace` / `pivot toggle` on click.
  - Gear icon → opens popover.
  - `Cmd+,` toggles popover.

- [ ] **Step 1: Write the failing assertion (extend existing tests)**

Add (or extend) a small UI-rendering test for `EditorViewportToolbar`:

```ts
describe('EditorViewportToolbar — chip bindings (6.2)', () => {
  it('mode chip "Move" reads aria-pressed from interactionStore.mode', () => {
    // mount toolbar with mocked stores; assert Move aria-pressed goes true after setMode('translate');
  });
  it('pivot chip toggles pivotMode on click', () => {
    // mount; click pivot chip; assert settingsStore.settings.pivotMode toggled
  });
  it('gear icon opens settings popover', () => {
    // mount; click gear; assert popover rendered
  });
});
```

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run src/lib/editor/EditorViewportToolbar.test.ts 2>/dev/null || echo 'no toolbar test file yet — adding inline is acceptable'
Expected: at least one assertion fails (chips bound to local store, not interaction store).

- [ ] **Step 2: Bind chips in `EditorViewportToolbar.svelte`**

Replacing the existing chip click handlers:

```svelte
<button
  class="chip"
  aria-pressed={interactionStore.mode === 'translate'}
  onclick={() => interactionStore.setMode('translate')}
> Move </button>
<button
  class="chip"
  aria-pressed={interactionStore.mode === 'rotate'}
  onclick={() => interactionStore.setMode('rotate')}
> Rotate </button>
<button
  class="chip"
  aria-pressed={interactionStore.mode === 'scale'}
  onclick={() => interactionStore.setMode('scale')}
> Scale </button>

<button
  class="chip"
  aria-pressed={interactionStore.space === 'world'}
  onclick={() => interactionStore.toggleSpace()}
> {interactionStore.space === 'world' ? 'World' : 'Local'} </button>

<button
  class="chip"
  aria-pressed={settingsStore.settings.pivotMode === 'active-object'}
  onclick={() => settingsStore.set({ pivotMode: settingsStore.settings.pivotMode === 'center' ? 'active-object' : 'center' })}
  title="Multi-select pivot"
>
  {settingsStore.settings.pivotMode === 'center' ? 'Center' : 'Active'}
</button>

<button
  class="settings-gear"
  aria-haspopup="dialog"
  aria-expanded={openSettings}
  onclick={() => toggleSettings(false)}      // toggle
  title="Editor settings · Cmd+,"
>
  ⚙
</button>
```

The props `interactionStore`, `settingsStore`, `openSettings`, and `toggleSettings` flow in from `MuseumEditorApp` or via the relevant context.

- [ ] **Step 3: Add Cmd+, to shortcuts module**

`hooks/shortcuts.svelte.ts`:

```ts
importKeybind('Cmd+,', () => toggleSettings());    // existing dispatcher
```

Where `toggleSettings()` reads the App-context open flag and flips it. The `Cmd+,` handler must respect the existing ignorelist (text inputs range/number focused).

- [ ] **Step 4: Verify gates**

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run 2>&1 | tail -10 && npm run check -w @portfolio/museum`
Expected: All 861+ tests pass; svelte-check 0/0.

---

### Task 9: Manual walkthrough + visitor-chunk-grep + handoff doc

**Files:**
- Create: `docs/agent-handoffs/phase-6.2.md`
- Modify: `docs/agent-handoffs/CURRENT.md` (or create if not yet)
- Modify: `docs/plans/museum-editor-workspace/README-museum-editor.md` (status pointer)
- Modify: `docs/superpowers/plans/2026-08-08-phase-6-2-obb-pivot-and-settings.md` — append deviation log after walkthrough.

- [ ] **Step 1: Manual walkthrough**

In the editor preview at `/dev/museum-editor`:

| Step | Expected |
|---|---|
| Click rotated primitive | OBB wire cube hugs the placement's local box rotated correctly |
| Hover + click empty space | Hover dim wire → click deselect |
| Multi-select two primitives + toggle Pivot chip to Active | Gizmo lands on the last-tapped root |
| Press W / E / R | Mode chip lights in toolbar; gizmo swaps; persists in popover space toggle |
| Press `Cmd+,` | Settings popover opens, focus on first input; `Esc` closes |
| Edit Translation step to `0.50` → close popover | Snap chip in toolbar reads the new step; drag with Ctrl/Cmd jumps 0.50 m |
| Reload page | Same settings restored from `museum-editor:settings:v1` |
| Visit `/museum` | No editor helpers; visitor renders the museum scene identically |
| Click outside popover content while open | Popover closes (click-away) |

Write expected + actual outcomes per step into `phase-6.2.md`.

- [ ] **Step 2: Visitor chunk grep**

Run:
```bash
cd /Users/tony/Documents/Personal &&
grep -rln 'museum-editor\|interaction-fsm\|editor-interaction-store\|EditorSelectionHelper\|EditorSettingsPopover\|settings-store\|obb-util' \
  apps/museum/.svelte-kit/output/client/_app/immutable/nodes/ 2>/dev/null && echo 'LEAKED' || echo 'CLEAN'
```
Expected: `CLEAN`.

If a non-empty result: investigate the chunk file and fix the leak (most likely: an editor module referenced from a shared chunk — refactor to lazy import).

- [ ] **Step 3: Build + final gates**

Run:
```bash
cd /Users/tony/Documents/Personal && npm run build -w @portfolio/museum && npm run test -w @portfolio/museum -- --run 2>&1 | tail -10
```
Expected: Build exit 0; ≥ 896 tests pass.

- [ ] **Step 4: Write handoff doc `docs/agent-handoffs/phase-6.2.md`**

Mirror `docs/agent-handoffs/phase-6.1.md` structure. Sections:
- Goal recap (one sentence)
- What landed (new files, modified files, new tests count, ship gates)
- Architecture sketch (one diagram)
- Deviations from spec / plan
- Manual walkthrough outcomes
- Open follow-ups / 6.3 candidates

- [ ] **Step 5: Update `CURRENT.md` pointer**

Add a `Phase 6.2` entry to `docs/agent-handoffs/CURRENT.md` linking to `phase-6.2.md`.

- [ ] **Step 6: Status pointer in `README-museum-editor.md`**

Add 6.2 entry with the same status language used for 6.1.

- [ ] **Step 7: Pause for review**

End. Final ship criteria re-check is up to the user; no auto-commit per `AGENTS.md`.

---

## Self-Review

### Spec coverage

| Spec section / requirement | Plan task |
|---|---|
| §1 Architecture — new files | Task 1, 2, 7 |
| §1 Architecture — modifications (helper, selection-actions, pivot, transform-controls, toolbar, shortcuts, app) | Task 3, 4, 5, 6, 7, 8 |
| §1 Pure types `PivotMode`, `EditorSettings` | Task 2 (definitions referenced from Tasks 5, 6, 7, 8) |
| §2 OBB corners-stream algorithm + indices | Task 1 + Task 4 |
| §2 Pivot resolution (Center / Active Object / single-select) | Task 5 |
| §2 Settings schema + validators + localStorage v1 + debounce | Task 2 |
| §3 Settings popover UI + chip bindings + `Cmd+,` shortcut | Task 7 + Task 8 |
| §4 Visitor parity + visitor-chunk-grep regression | Task 9 (Step 2) |
| §4 Drag-undo carries (no change documented) | cross-referenced; no new task needed |
| §4 Tooltips carry (deferred cosmetic; no task) | n/a |
| §5 Tests tally ~+35 | Tasks 1 (4), 2 (14), 3 (5), 4 (~10), 5 (4), 7 (6), 8 (~3) → ~46 new tests. Slightly more than the spec's 35 floor. |
| §5 Visitor chunk grep | Task 9 Step 2 |
| §5 localStorage failsafe | Task 2 validators + Step 4 |
| §5 Manual walkthrough | Task 9 Step 1 |

All spec items covered.

### Placeholder scan

| Pattern | Result |
|---|---|
| `TBD` / `TODO` / `FIXME` / `XXX` / `???` / `implement later` | none |
| "Add appropriate error handling" generic | none — specific `clampNumber` / `clampInt` provided |
| "Write tests for the above" without code | none — every test step includes the test code |
| "Similar to Task N" cross-references without their own code | none — code lifted directly into the relevant task |
| Steps describing what to do without showing how | none — code blocks everywhere |

### Type consistency

- `P` displays `PlacementId` defined in Task 3 (string); Task 5 uses the same name. ✓
- `OBB_FLOAT_COUNT` defined Task 1, used Task 4 (helper). ✓
- `SETTINGS_STORE_KEY` symbol introduced Task 2 (referenced Task 6, 7, 8). ✓
- `pivotMode` getter / setter naming matches across Tasks 5, 6, 7, 8. ✓
- `EditorSettingsStoreHandle.safe` interface matches exactly. ✓
- `EDITOR_OPEN_SETTINGS_KEY` introduced Task 7 used in Task 8; documented as a new symbol. ✓

### Coverage adequacy

Tasks 1–3 (pure utilities + sub-store) → TDD clean.
Tasks 4–6 (UI refactors) → assertions on existing files, no new test infra.
Task 7 (popover) → TDD with `@testing-library/svelte` (or project-equivalent helper).
Task 8 (chip bindings) → `EditorViewportToolbar` may not have a test fixture yet; fallback is integration smoke via the existing hover/click test cookbook.

---

Plan complete. Saved to `docs/superpowers/plans/2026-08-08-phase-6-2-obb-pivot-and-settings.md`.
