# Phase 6.5 Architecture Shaping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan phase-by-phase. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two editor capabilities:

- **6.5.1 Independent Scale UX** — toggle between `uniform` (today's behavior; X/Y/Z stay proportional when scaling) and `independent` (X/Y/Z scale separately). Default stays `uniform`. Inspector shows Scale `[mode]` `[X] [Y] [Z]` row with chain-icon toggle; gizmo respects mode; cluster drag propagates per axis in independent mode.
- **6.5.2 Architecture Shape Catalogue** — semantic named entries (`Wall`, `Floor`, `Ceiling`, `Column`, `Door`) layered on existing primitive kinds (`box` / `plane` / `cylinder`). No new primitive kinds; no schema bump. New `Add → Architecture` submenu; drop a `Floor 6×6 m` via one click.

**Architecture:** Pure helpers (`scale-vector.ts`, `architecture-shapes.ts`) decouple decisions from Three. State (`scaleMode`) lives on `EditorInteractionStore`'s existing reactive surface. `PlacementTransform` gains `scaleVector: Vec3 | null` + `scaleMode`. Inspector renders conditional row; gizmo reads `t.scale` per drag (TransformControls already delivers per-axis Vector3); cluster math propagates per-axis delta. Architecture shape catalogue wraps `createPrimitiveEntity` with sensible defaults and (where applicable) per-axis scale. Visitor render path unchanged — schema v6 still stores only `scale: number`; independent mode persists vector only in editor transform.

**Tech Stack:** TypeScript 5.8, Svelte 5 runes, SvelteKit 2, Vitest 3, Three.js (no new runtime deps).

## Global Constraints (every task must satisfy)

- **No new runtime dependencies.**
- **Default `scaleMode = 'uniform'`.** Existing scenes and visitor render paths are byte-identical.
- **Visitor chunk isolation preserved.** New keywords to grep: `architecture-shapes`, `scale-vector`.
- **No schema bump.** Schema v6 stores only `scale: number`. Vector lives in `PlacementTransform` only.
- **No commits per `AGENTS.md`.** Plan uses `verify gates` rather than `commit`.
- **`museum-editor-phases-4-5/` and `museum-editor-phases-4-5/` archive is unchanged.** No file moves within this plan — only archive boundary already changed.
- **Verification command** (every task that adds or modifies code):
  ```bash
  cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run <focused> && npm run check -w @portfolio/museum
  ```
  Production build only at end-of-phase verification (after Phase 6.5.1 Task 4; after Phase 6.5.2 Task 4).

## File Structure (locked, both phases)

| Path | Type | Phase | Role |
|---|--:|---|---|
| `apps/museum/src/lib/editor/scale-vector.ts` | NEW | 6.5.1 | Pure: `isUniform`, `normalizeScale`. No Three imports. |
| `apps/museum/src/lib/editor/scale-vector.test.ts` | NEW | 6.5.1 | Pure unit tests. |
| `apps/museum/src/lib/editor/architecture-shapes.ts` | NEW | 6.5.2 | Pure: `ARCHITECTURE_SHAPE_LIBRARY` (5 named entries → primitive kind, dimensions, optional `defaultScaleVector`). |
| `apps/museum/src/lib/editor/architecture-shapes.test.ts` | NEW | 6.5.2 | Pure unit tests. |
| `apps/museum/src/lib/editor/editor-transform.ts` | MODIFY | 6.5.1 | Extend `PlacementTransform` with `scaleVector`, `scaleMode`. Update `placementTransformFromDocument` / `writePlacementTransform`. |
| `apps/museum/src/lib/editor/editor-transform.test.ts` | MODIFY | 6.5.1 | Round-trip Vec3 / scalar / mode. |
| `apps/museum/src/lib/editor/store/editor-interaction-store.svelte.ts` | MODIFY | 6.5.1 | Add `scaleMode`, `toggleScaleMode`, `setScaleMode`. |
| `apps/museum/src/lib/editor/store/editor-interaction-store.test.ts` | MODIFY | 6.5.1 | Default `'uniform'`; toggle/set; reactivity. |
| `apps/museum/src/lib/editor/EditorTransformInspector.svelte` | MODIFY | 6.5.1 | Chain icon + X/Y/Z fields; conditional render on mode. |
| `apps/museum/src/lib/editor/EditorTransformControls.svelte` | MODIFY | 6.5.1 | Gate `enforceUniformObjectScale` on `scaleMode`; per-axis in independent. |
| `apps/museum/src/lib/editor/editor-cluster-transform.ts` | MODIFY | 6.5.1 | Branch on mode; per-axis propagation. |
| `apps/museum/src/lib/editor/museum-editor.svelte.ts` | MODIFY | 6.5.1 | Facade additions: `scaleVector` getter per selectedTransform; expose to inspector. |
| `apps/museum/src/lib/editor/EditorPlacementTools.svelte` | MODIFY | 6.5.2 | Add `Add → Architecture` submenu with 5 entries; route through `beginPrimitivePlacement({ preset })`. |
| `apps/museum/src/lib/editor/store/placement-cluster-mutator.svelte.ts` | MODIFY | 6.5.2 | `beginPrimitivePlacement({ preset?, ... })` accepts preset; commits with defaultScaleVector on independent mode. |
| `docs/agent-handoffs/CURRENT.md` | UPDATE | both | Pointer to Phase 6.5 plan + spec; reference Phase 6.5.x handoff doc when each phase ships. |
| `docs/agent-handoffs/phase-6.5.1.md` | NEW (on ship) | 6.5.1 | Slice-end handoff doc mirrors `phase-6.2.md` structure. |
| `docs/agent-handoffs/phase-6.5.2.md` | NEW (on ship) | 6.5.2 | Slice-end handoff doc mirrors `phase-6.5.1.md` structure. |

---

## Phase 6.5.1 — Independent Scale UX (4 tasks)

### Task 1: Pure scale-vector helpers + tests

**Files:**
- Create: `apps/museum/src/lib/editor/scale-vector.ts`
- Create: `apps/museum/src/lib/editor/scale-vector.test.ts`

**Interfaces:**
- Consumes: nothing (no Three dependencies).
- Produces:

```ts
// apps/museum/src/lib/editor/scale-vector.ts
import type { Vec3 } from '$lib/types/museum';

export type ScaleMode = 'uniform' | 'independent';

export const SCALE_UNIFORM_EPSILON = 1e-6;
export const MIN_PLACEMENT_SCALE = 0.01;

export function isUniformValue(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_PLACEMENT_SCALE;
}

export function isUniformVector(vector: Vec3): boolean {
  return (
    isUniformValue(vector[0]) &&
    Math.abs(vector[0] - vector[1]) < SCALE_UNIFORM_EPSILON &&
    Math.abs(vector[1] - vector[2]) < SCALE_UNIFORM_EPSILON
  );
}

/** Pick scalar ↔ Vec3 representation based on the active mode. */
export function normalizeScale(input: {
  mode: ScaleMode;
  scalar: number | null;
  vector: Vec3 | null;
}): { scaleScalar: number; scaleVector: Vec3 | null } {
  if (input.mode === 'independent' && input.vector) {
    return { scaleScalar: average(input.vector), scaleVector: [...input.vector] };
  }
  const scalar = input.scalar ?? 1;
  return { scaleScalar: scalar, scaleVector: null };
}

/** Equality test — Vec3 cluster-dominance decisions. */
export function dominantMode(
  members: readonly { scaleMode: ScaleMode; scaleVector: Vec3 | null }[]
): ScaleMode {
  let independent = 0;
  let uniform = 0;
  for (const m of members) {
    if (m.scaleMode === 'independent' && m.scaleVector) independent++;
    else uniform++;
  }
  return independent > uniform ? 'independent' : 'uniform';
}

function average(v: Vec3): number {
  return (v[0] + v[1] + v[2]) / 3;
}
```

- [ ] **Step 1: Write the failing test file**

```ts
// apps/museum/src/lib/editor/scale-vector.test.ts
import { describe, expect, it } from 'vitest';
import {
  SCALE_UNIFORM_EPSILON,
  dominantMode,
  isUniformValue,
  isUniformVector,
  normalizeScale
} from './scale-vector';

describe('isUniformValue', () => {
  it('rejects NaN, 0, negative', () => {
    expect(isUniformValue(NaN)).toBe(false);
    expect(isUniformValue(0)).toBe(false);
    expect(isUniformValue(-1)).toBe(false);
  });
  it('accepts positive finite', () => {
    expect(isUniformValue(1)).toBe(true);
    expect(isUniformValue(0.5)).toBe(true);
    expect(isUniformValue(100)).toBe(true);
  });
});

describe('isUniformVector', () => {
  it('all equal → true', () => {
    expect(isUniformVector([1, 1, 1])).toBe(true);
    expect(isUniformVector([0.5, 0.5, 0.5])).toBe(true);
  });
  it('differ by epsilon → true', () => {
    expect(isUniformVector([1, 1 + SCALE_UNIFORM_EPSILON * 0.5, 1])).toBe(true);
  });
  it('differ by >epsilon → false', () => {
    expect(isUniformVector([1, 1.1, 1])).toBe(false);
    expect(isUniformVector([5, 3, 0.05])).toBe(false);
  });
  it('rejects zero or negative component', () => {
    expect(isUniformVector([0, 0, 0])).toBe(false);
    expect(isUniformVector([1, -1, 1])).toBe(false);
  });
});

describe('normalizeScale', () => {
  it('uniform + scalar → scalar, no vector', () => {
    const out = normalizeScale({ mode: 'uniform', scalar: 2, vector: null });
    expect(out).toEqual({ scaleScalar: 2, scaleVector: null });
  });

  it('independent + Vec3 → vector + averaged scalar', () => {
    const out = normalizeScale({
      mode: 'independent',
      scalar: 1,
      vector: [6, 0.1, 6]
    });
    expect(out).toEqual({ scaleScalar: (6 + 0.1 + 6) / 3, scaleVector: [6, 0.1, 6] });
  });

  it('uniform + Vec3 (legacy) → vector ignored, scalar used', () => {
    const out = normalizeScale({
      mode: 'uniform',
      scalar: 1.5,
      vector: [5, 3, 0.05]
    });
    expect(out).toEqual({ scaleScalar: 1.5, scaleVector: null });
  });

  it('independent + null scalar → defaults to 1', () => {
    const out = normalizeScale({ mode: 'independent', scalar: null, vector: null });
    expect(out.scaleScalar).toBe(1);
    expect(out.scaleVector).toBeNull();
  });
});

describe('dominantMode', () => {
  it('all uniform → uniform', () => {
    expect(
      dominantMode([
        { scaleMode: 'uniform', scaleVector: null },
        { scaleMode: 'uniform', scaleVector: null }
      ])
    ).toBe('uniform');
  });

  it('all independent → independent', () => {
    expect(
      dominantMode([
        { scaleMode: 'independent', scaleVector: [1, 1, 1] },
        { scaleMode: 'independent', scaleVector: [2, 2, 2] }
      ])
    ).toBe('independent');
  });

  it('tie → uniform (conservative fallback)', () => {
    expect(
      dominantMode([
        { scaleMode: 'independent', scaleVector: [1, 1, 1] },
        { scaleMode: 'uniform', scaleVector: null }
      ])
    ).toBe('uniform');
  });

  it('majority independent → independent', () => {
    expect(
      dominantMode([
        { scaleMode: 'independent', scaleVector: [1, 1, 1] },
        { scaleMode: 'independent', scaleVector: [2, 2, 2] },
        { scaleMode: 'uniform', scaleVector: null }
      ])
    ).toBe('independent');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run src/lib/editor/scale-vector.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Already drafted above. Drop into `apps/museum/src/lib/editor/scale-vector.ts`.

- [ ] **Step 4: Verify test passes**

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run src/lib/editor/scale-vector.test.ts`
Expected: PASS — ~14 tests across 4 describe blocks.

- [ ] **Step 5: Verify gates**

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run 2>&1 | tail -10 && npm run check -w @portfolio/museum`
Expected: All 899+ existing tests still pass; svelte-check 0/0.

---

### Task 2: PlacementTransform extension + interaction-store scaleMode

**Files:**
- Modify: `apps/museum/src/lib/editor/editor-transform.ts`
- Modify: `apps/museum/src/lib/editor/editor-transform.test.ts`
- Modify: `apps/museum/src/lib/editor/store/editor-interaction-store.svelte.ts`
- Modify: `apps/museum/src/lib/editor/store/editor-interaction-store.test.ts`

**Interfaces:**
- Adds `scaleVector: Vec3 | null` and `scaleMode: ScaleMode` to `PlacementTransform`.
- `placementTransformFromDocument`: returns `{ scaleScalar: placement.scale ?? 1, scaleVector: null, scaleMode: 'uniform' }`.
- `writePlacementTransform`: persistence behaviour per §4 spec — uniform mode → `placement.scale = scaleScalar` (or omit if ≈ 1); independent mode with all-equal vector → `placement.scale = thatValue`; otherwise persist `placement.scale = 1` and drop the vector (schema-v6 limit).
- Interaction store: `scaleMode: 'uniform' | 'independent'` (default `'uniform'`); `toggleScaleMode()`; `setScaleMode(mode)`.

- [ ] **Step 1: Write failing tests**

Add to `editor-transform.test.ts`:

```ts
import type { SceneObjectPlacement } from '$lib/content/scene';

describe('PlacementTransform with scaleVector', () => {
  it('placementTransformFromDocument reads scalar only', () => {
    const p: Pick<SceneObjectPlacement, 'position' | 'rotation' | 'scale'> = {
      position: [0, 0, 0], rotation: [0, 0, 0], scale: 2.5
    };
    const t = placementTransformFromDocument(p);
    expect(t.scaleScalar).toBe(2.5);
    expect(t.scaleVector).toBeNull();
    expect(t.scaleMode).toBe('uniform');
  });

  it('writePlacementTransform persists uniform scalar (drops when ≈ 1)', () => {
    const p: Pick<SceneObjectPlacement, 'position' | 'rotation' | 'scale'> = {
      position: [0, 0, 0], rotation: [0, 0, 0], scale: 1
    };
    writePlacementTransform(p, {
      position: [0, 0, 0], rotation: [0, 0, 0],
      scaleScalar: 1.5, scaleVector: null, scaleMode: 'uniform'
    });
    expect(p.scale).toBe(1.5);
  });

  it('writePlacementTransform with independent-but-uniform-vector collapses to scalar', () => {
    const p: Pick<SceneObjectPlacement, 'position' | 'rotation' | 'scale'> = {
      position: [0, 0, 0], rotation: [0, 0, 0]
    };
    writePlacementTransform(p, {
      position: [0, 0, 0], rotation: [0, 0, 0],
      scaleScalar: 1, scaleVector: [3, 3, 3], scaleMode: 'independent'
    });
    expect(p.scale).toBe(3);
  });

  it('writePlacementTransform with non-uniform vector persists fallback (1) + logs side-effect', () => {
    const p: Pick<SceneObjectPlacement, 'position' | 'rotation' | 'scale'> = {
      position: [0, 0, 0], rotation: [0, 0, 0]
    };
    // Schema v6 can't carry non-uniform; we set scale: 1 and rely on editor transform map.
    writePlacementTransform(p, {
      position: [0, 0, 0], rotation: [0, 0, 0],
      scaleScalar: 1, scaleVector: [5, 3, 0.05], scaleMode: 'independent'
    });
    expect(p.scale).toBe(1);
  });
});
```

Add to `editor-interaction-store.test.ts`:

```ts
describe('scaleMode', () => {
  it('defaults to uniform', () => {
    const store = new EditorInteractionStore();
    expect(store.scaleMode).toBe('uniform');
  });

  it('setScaleMode flips value', () => {
    const store = new EditorInteractionStore();
    store.setScaleMode('independent');
    expect(store.scaleMode).toBe('independent');
  });

  it('toggleScaleMode flips value', () => {
    const store = new EditorInteractionStore();
    store.toggleScaleMode();
    expect(store.scaleMode).toBe('independent');
    store.toggleScaleMode();
    expect(store.scaleMode).toBe('uniform');
  });
});
```

- [ ] **Step 2: Run failing tests**

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run src/lib/editor/editor-transform.test.ts src/lib/editor/store/editor-interaction-store.test.ts`
Expected: FAIL — `scaleVector` / `scaleMode` not in `PlacementTransform`; interaction-store lacks `scaleMode`.

- [ ] **Step 3: Extend `PlacementTransform`**

In `apps/museum/src/lib/editor/editor-transform.ts`:

```ts
import type { Vec3 } from '$lib/types/museum';
import type { ScaleMode } from './scale-vector';

export type PlacementTransform = {
  position: Vec3;
  rotation: Vec3;
  scaleScalar: number;
  scaleVector: Vec3 | null;
  scaleMode: ScaleMode;
};

export function placementTransformFromDocument(
  placement: Pick<SceneObjectPlacement, 'position' | 'rotation' | 'scale'>
): PlacementTransform {
  return {
    position: [...placement.position],
    rotation: [...placement.rotation],
    scaleScalar: placement.scale ?? 1,
    scaleVector: null,
    scaleMode: 'uniform'
  };
}

export function writePlacementTransform(
  placement: Pick<SceneObjectPlacement, 'position' | 'rotation' | 'scale'>,
  transform: PlacementTransform
): boolean {
  if (!isValidPlacementTransform(transform)) return false;
  placement.position = [...transform.position];
  placement.rotation = [...transform.rotation];

  const isOne = Math.abs(transform.scaleScalar - 1) <= UNIT_SCALE_EPSILON;

  if (transform.scaleMode === 'uniform' || !transform.scaleVector) {
    if (isOne) delete placement.scale;
    else placement.scale = transform.scaleScalar;
    return true;
  }

  // Independent: try to persist vector as scalar if all-equal.
  if (isUniformVector(transform.scaleVector)) {
    placement.scale = transform.scaleVector[0];
    return true;
  }

  // Schema v6 limit: non-uniform vector persisted as scalar fallback.
  // Editor transform map (caller-side) keeps the vector for editing.
  placement.scale = 1;
  return true;
}
```

Update `isValidPlacementTransform` to accept the new fields.

- [ ] **Step 4: Add `scaleMode` to interaction store**

In `apps/museum/src/lib/editor/store/editor-interaction-store.svelte.ts`:

```ts
import type { ScaleMode } from '../scale-vector';

// In class body, alongside existing $state fields:
scaleMode = $state<ScaleMode>('uniform');

toggleScaleMode() { this.scaleMode = this.scaleMode === 'uniform' ? 'independent' : 'uniform'; }
setScaleMode(mode: ScaleMode) { this.scaleMode = mode; }
```

- [ ] **Step 5: Verify tests pass**

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run src/lib/editor/editor-transform.test.ts src/lib/editor/store/editor-interaction-store.test.ts src/lib/editor/scale-vector.test.ts`
Expected: PASS — all new + existing tests.

- [ ] **Step 6: Verify gates**

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run 2>&1 | tail -10 && npm run check -w @portfolio/museum`
Expected: All tests pass; svelte-check 0/0.

---

### Task 3: Inspector chain-icon + X/Y/Z fields

**Files:**
- Modify: `apps/museum/src/lib/editor/EditorTransformInspector.svelte`
- Modify: `apps/museum/src/lib/editor/EditorTransformInspector.test.ts` (or extend `EditorTransformControls` test for parity)

**Interfaces:**
- Add `scaleMode` and `interactionStore` injection.
- Replace "Uniform scale" fieldset with conditional row:
  - `uniform` — single `Scale` field
  - `independent` — `X`, `Y`, `Z` fields + chain icon
- Chain icon button: click → `interactionStore.toggleScaleMode()`. `aria-pressed={interactionStore.scaleMode === 'independent'}`.
- Field commits route through `store.commitPlacementTransform(id, { ...transform, scaleScalar, scaleVector, scaleMode })`.

- [ ] **Step 1: Write failing tests**

```ts
// EditorTransformInspector.test.ts (extend)
import { EditorInteractionStore, EDITOR_INTERACTION_STORE_KEY } from './store/editor-interaction-store.svelte';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import EditorTransformInspector from './EditorTransformInspector.svelte';
// (use existing render helpers — check project's test pattern)

describe('Inspector scale mode toggle', () => {
  beforeEach(() => cleanup());
  it('uniform mode shows single Scale field', () => {
    // mount inspector + mock store; assert one input
  });
  it('independent mode shows X/Y/Z fields', () => {
    // set interactionStore.scaleMode = 'independent'; mount; assert three inputs
  });
  it('chain icon click toggles mode', async () => {
    // mount with store; click button; assert mode flipped
  });
  it('field commit writes scaleVector on placement transform', async () => {
    // mount with selectedTransform.scaleVector = null; commit X field; assert scaleVector updated
  });
});
```

- [ ] **Step 2: Run failing tests**

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run src/lib/editor/EditorTransformInspector.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update `EditorTransformInspector.svelte`**

Replace the existing "Uniform scale" fieldset with:

```svelte
<fieldset>
  <legend>Scale</legend>
  <div class="scale-row">
    <button
      type="button"
      class="scale-toggle"
      aria-pressed={interactionStore.scaleMode === 'independent'}
      aria-label="Toggle uniform / independent scale"
      title={interactionStore.scaleMode === 'uniform' ? 'Uniform scale — click to switch to independent' : 'Independent scale — click to switch to uniform'}
      onclick={() => interactionStore.toggleScaleMode()}
    >
      {#if interactionStore.scaleMode === 'uniform'}
        <svg viewBox="0 0 16 16" aria-hidden="true" width="14" height="14">
          <path d="M5 7h6v2H5zM3 9V7h2v2H3zm12-2v2h-2V7h-2a2 2 0 00-2 2h-2a4 4 0 014-4h4z" fill="currentColor"/>
        </svg>
      {:else}
        <svg viewBox="0 0 16 16" aria-hidden="true" width="14" height="14">
          <path d="M5 7h6v2H5zM3 9V7h2v2H3zm12-2v2h-2V7a4 4 0 014-4h2v2h-2a2 2 0 00-2 2z" fill="currentColor"/>
          <path d="M3 13l10-10" stroke="currentColor" stroke-width="1.4"/>
        </svg>
      {/if}
    </button>

    {#if interactionStore.scaleMode === 'uniform'}
      <EditorNumberField
        label="Scale"
        value={transform.scaleScalar}
        step={0.01}
        min={MIN_PLACEMENT_SCALE}
        oncommit={(value) => setUniformScale(value)}
      />
    {:else}
      <EditorNumberField
        label="X"
        value={transform.scaleVector?.[0] ?? transform.scaleScalar}
        step={0.01}
        min={MIN_PLACEMENT_SCALE}
        oncommit={(value) => setIndependentScale(0, value)}
      />
      <EditorNumberField
        label="Y"
        value={transform.scaleVector?.[1] ?? transform.scaleScalar}
        step={0.01}
        min={MIN_PLACEMENT_SCALE}
        oncommit={(value) => setIndependentScale(1, value)}
      />
      <EditorNumberField
        label="Z"
        value={transform.scaleVector?.[2] ?? transform.scaleScalar}
        step={0.01}
        min={MIN_PLACEMENT_SCALE}
        oncommit={(value) => setIndependentScale(2, value)}
      />
    {/if}
  </div>
</fieldset>
```

Helpers:

```ts
const interactionStore = getContext<EditorInteractionStore>(EDITOR_INTERACTION_STORE_KEY);

function setUniformScale(value: number) {
  if (!transform) return;
  store.commitPlacementTransform(id, {
    ...transform,
    scaleScalar: value,
    scaleVector: null,
    scaleMode: 'uniform'
  });
}

function setIndependentScale(axis: 0 | 1 | 2, value: number) {
  if (!transform) return;
  const current: Vec3 = transform.scaleVector ?? [transform.scaleScalar, transform.scaleScalar, transform.scaleScalar];
  const next: Vec3 = [...current] as Vec3;
  next[axis] = value;
  store.commitPlacementTransform(id, {
    ...transform,
    scaleScalar: average(next),
    scaleVector: next,
    scaleMode: 'independent'
  });
}

function average(v: Vec3): number { return (v[0] + v[1] + v[2]) / 3; }
```

Delete the existing `setScale(value: number)` helper (replaced by `setUniformScale`).

- [ ] **Step 4: Verify tests pass**

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run src/lib/editor/EditorTransformInspector.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify gates**

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run 2>&1 | tail -10 && npm run check -w @portfolio/museum`
Expected: All tests pass; svelte-check 0/0.

---

### Task 4: Gizmo + cluster non-uniform propagation

**Files:**
- Modify: `apps/museum/src/lib/editor/EditorTransformControls.svelte`
- Modify: `apps/museum/src/lib/editor/editor-transform.ts` (re-export `MIN_PLACEMENT_SCALE`)
- Modify: `apps/museum/src/lib/editor/editor-cluster-transform.ts`

**Interfaces:**
- `EditorTransformControls.svelte` reads `interactionStore.scaleMode`. Gates `enforceUniformObjectScale`:
  - `uniform` → call as today (preserves existing behavior)
  - `independent` → skip; rely on per-frame `root.scale.copy(t.scale)` (Three TransformControls already provides Vector3 update per frame for axis handles; non-uniform mutates one axis at a time)
- Drag-commit path: writes `scaleVector` from `root.scale` value when mode is `'independent'`.
- `editor-cluster-transform.ts` branch on mode: per-axis delta from anchor member.

- [ ] **Step 1: Write failing tests**

Extend `editor-transform.test.ts`:

```ts
describe('Cluster non-uniform propagation', () => {
  it('uniform mode: cluster scales scalar-uniformly (existing behavior)', () => {
    // existing test
  });
  it('independent mode: per-axis deltas propagate from anchor member', () => {
    const members = [mkRoot('a', [1,1,1]), mkRoot('b', [2,2,2])];
    const anchor = members[0];
    const before = { a: [1, 1, 1], b: [2, 2, 2] };
    const after = { a: [1.5, 1.2, 1.1], b: [2, 2, 2] };  // anchor dragged
    const deltas = applyClusterTransform(members, anchor.id, before, after, 'independent');
    expect(deltas).toEqual([
      { id: 'a', scale: [1.5, 1.2, 1.1] },
      { id: 'b', scale: [2.5, 2.2, 2.1] }  // b rolled forward by anchor delta
    ]);
  });
});
```

- [ ] **Step 2: Run failing tests**

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run src/lib/editor/editor-cluster-transform.test.ts src/lib/editor/editor-transform.test.ts`
Expected: FAIL — independent branch missing.

- [ ] **Step 3: Wire gizmo mode**

In `EditorTransformControls.svelte` find the existing `useTask` per-frame loop (line ~310) and the post-drag commit (line ~442). Apply changes:

```ts
// In useTask per-frame loop after TransformControls fires:
if (interactionStore.scaleMode === 'uniform') {
  enforceUniformObjectScale(root, effectiveAxis);  // existing call
} else {
  // Independent: keep root.scale.{x,y,z} as Three set them via t.scale.
  // No-op: just stream OBB corners through root.matrixWorld (existing).
}
```

Drag commit:

```ts
const isIndependent = interactionStore.scaleMode === 'independent';
const finalTransform: PlacementTransform = {
  position: [...root.position.toArray() as Vec3],
  rotation: [...rotation as Vec3],
  scaleScalar: isIndependent ? (root.scale.x + root.scale.y + root.scale.z) / 3 : root.scale.x,
  scaleVector: isIndependent ? [root.scale.x, root.scale.y, root.scale.z] : null,
  scaleMode: isIndependent ? 'independent' : 'uniform'
};
store.commitPlacementTransform(id, finalTransform);
```

- [ ] **Step 4: Cluster non-uniform propagation**

In `editor-cluster-transform.ts`:

```ts
if (scaleMode === 'independent') {
  const anchorOld = anchor.prevScaleVector;
  const anchorNew = anchor.nextScaleVector;
  const delta: Vec3 = [
    anchorNew[0] - anchorOld[0],
    anchorNew[1] - anchorOld[1],
    anchorNew[2] - anchorOld[2]
  ];
  for (const member of clusterMembers) {
    if (member.id === anchor.id) continue;
    member.root.scale.x += delta[0];
    member.root.scale.y += delta[1];
    member.root.scale.z += delta[2];
  }
  return;
}
// else existing uniform logic unchanged.
```

- [ ] **Step 5: Verify tests pass + gates**

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run 2>&1 | tail -10 && npm run check -w @portfolio/museum && npm run build -w @portfolio/museum`
Expected: All tests pass; svelte-check 0/0; build exit 0.

- [ ] **Step 6: Write handoff + update CURRENT**

Write `docs/agent-handoffs/phase-6.5.1.md` mirroring `phase-6.2.md` (Goal / What shipped / Tests / Gates / Deviations / Carry-overs / Manual verification). Update `docs/agent-handoffs/CURRENT.md` to mark Phase 6.5.1 shipped; next pointer → 6.5.2 plan.

---

## Phase 6.5.2 — Architecture Shape Catalogue (4 tasks)

### Task 1: Pure architecture-shapes catalogue + tests

**Files:**
- Create: `apps/museum/src/lib/editor/architecture-shapes.ts`
- Create: `apps/museum/src/lib/editor/architecture-shapes.test.ts`

**Interfaces:**

```ts
// apps/museum/src/lib/editor/architecture-shapes.ts
import type { Vec3 } from '$lib/types/museum';
import type { ScenePrimitiveDimensions, ScenePrimitiveKind } from '$lib/content/scene';

export type ArchitectureShapeId =
  | 'wall' | 'floor' | 'ceiling' | 'column' | 'door';

export type ArchitectureShapeEntry = {
  id: ArchitectureShapeId;
  name: string;
  primitiveKind: Extract<ScenePrimitiveKind, 'box' | 'plane' | 'cylinder'>;
  dimensions: ScenePrimitiveDimensions;
  defaultScaleVector: Vec3 | null;
  description: string;
};

export const ARCHITECTURE_SHAPE_LIBRARY: readonly ArchitectureShapeEntry[] = [
  {
    id: 'floor',
    name: 'Floor',
    primitiveKind: 'box',
    dimensions: { width: 1, height: 0.05, depth: 1 },
    defaultScaleVector: [6, 1, 6],
    description: 'Thin slab floor — scale X and Z to room footprint'
  },
  {
    id: 'wall',
    name: 'Wall',
    primitiveKind: 'box',
    dimensions: { width: 2, height: 3, depth: 0.05 },
    defaultScaleVector: [1, 1, 1],
    description: 'Wall segment — scale X to wall length, Y to height (Z stays thin)'
  },
  {
    id: 'ceiling',
    name: 'Ceiling',
    primitiveKind: 'box',
    dimensions: { width: 1, height: 0.03, depth: 1 },
    defaultScaleVector: [6, 1, 6],
    description: 'Ceiling slab — scale X and Z to room footprint'
  },
  {
    id: 'column',
    name: 'Column',
    primitiveKind: 'cylinder',
    dimensions: { radius: 0.15, height: 3 },
    defaultScaleVector: null,
    description: 'Round column — uniform scale only'
  },
  {
    id: 'door',
    name: 'Door',
    primitiveKind: 'box',
    dimensions: { width: 0.9, height: 2.1, depth: 0.05 },
    defaultScaleVector: null,
    description: 'Door outline — uniform scale or per-axis if needed'
  }
] as const;

export function getArchitectureShape(id: ArchitectureShapeId): ArchitectureShapeEntry {
  const entry = ARCHITECTURE_SHAPE_LIBRARY.find((e) => e.id === id);
  if (!entry) throw new Error(`Unknown architecture shape: ${id}`);
  return entry;
}

export function listArchitectureShapes(): readonly ArchitectureShapeEntry[] {
  return ARCHITECTURE_SHAPE_LIBRARY;
}
```

- [ ] **Steps 1–5: Mirror Task 6.5.1 / Task 1 pattern.** Write failing test, run, implement, run, verify gates.

---

### Task 2: Placement flow accepts architecture shape preset

**Files:**
- Modify: `apps/museum/src/lib/editor/store/placement-cluster-mutator.svelte.ts`
- Modify: `apps/museum/src/lib/editor/museum-editor.svelte.ts` (facade passthrough)
- Modify: `apps/museum/src/lib/editor/store/placement-cluster-mutator.test.ts` (extend)

**Interfaces:**
- New entry point: `beginArchitectureShapePlacement(id: ArchitectureShapeId)` — looks up the entry, calls `beginPrimitivePlacement({ kind: entry.primitiveKind, dimensions: entry.dimensions, name: entry.name, scaleVector: entry.defaultScaleVector ?? null, scaleMode: entry.defaultScaleVector ? 'independent' : 'uniform' })`.
- `beginPrimitivePlacement` accepts optional `{ preset?: { dimensions, name, scaleVector, scaleMode } }`.
- Creates entity with `createPrimitiveEntity({ ...preset, kind, roomId: pendingFloor.roomId, position: pendingFloor.point })`.

- [ ] **Step 1: Implement preset path**

```ts
// in placement-cluster-mutator.svelte.ts
import { getArchitectureShape, type ArchitectureShapeId } from '../architecture-shapes';

beginArchitectureShapePlacement(id: ArchitectureShapeId): boolean {
  const entry = getArchitectureShape(id);
  return this.beginPrimitivePlacement({
    kind: entry.primitiveKind,
    dimensions: entry.dimensions,
    name: entry.name,
    scaleVector: entry.defaultScaleVector,
    scaleMode: entry.defaultScaleVector ? 'independent' : 'uniform'
  });
}

beginPrimitivePlacement(input: ScenePrimitiveKind | {
  kind: ScenePrimitiveKind;
  dimensions?: ScenePrimitiveDimensions;
  name?: string;
  scaleVector?: Vec3 | null;
  scaleMode?: ScaleMode;
}): boolean {
  const opts = typeof input === 'string' ? { kind: input } : input;
  // existing primitive placement arming path; pull opts.dimensions, opts.name into createPrimitiveEntity
  // existing logic; extend to use opts
}
```

- [ ] **Step 2: Facade passthrough**

`museum-editor.svelte.ts`: add `beginArchitectureShapePlacement(id: ArchitectureShapeId): boolean` that delegates.

- [ ] **Step 3: Tests**

```ts
it('beginArchitectureShapePlacement arms placement for wall preset', () => {
  const store = new MuseumEditorStore();
  expect(store.beginArchitectureShapePlacement('wall')).toBe(true);
  expect(store.pendingPlacementPrimitiveKind).toBe('box');
});
```

- [ ] **Step 4: Verify gates**

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run 2>&1 | tail -10 && npm run check -w @portfolio/museum`
Expected: All pass; 0/0.

---

### Task 3: Add → Architecture menu

**Files:**
- Modify: `apps/museum/src/lib/editor/EditorPlacementTools.svelte` (or wherever the Add menu lives — currently dead in current diff; restore as part of 6.5 or do so via store hook)

**NOTE:** Phase 6.3 / 6.4 scratch-diff deleted the Add menu entirely. Phase 6.5.2 reintroduces it scoped to Architecture only. Decide: (a) restore full Add menu (Camera + boxes + plane + cylinder + sphere) OR (b) just ship Architecture submenu. Decision per handoff call.

**Decision for v1:** ship Architecture submenu only. Restore Camera + raw primitives in 6.6 polish.

- [ ] **Step 1: Add menu structure**

```svelte
<div class="add-menu" role="menu" aria-label="Add to scene">
  <button
    type="button"
    role="menuitem"
    aria-haspopup="menu"
    aria-expanded={architectureMenuOpen}
    onclick={() => (architectureMenuOpen = !architectureMenuOpen)}
  >Architecture <span aria-hidden="true">▸</span></button>
  {#if architectureMenuOpen}
    <div class="submenu" role="menu" aria-label="Architecture">
      {#each ARCHITECTURE_SHAPE_LIBRARY as entry (entry.id)}
        <button
          type="button"
          role="menuitem"
          disabled={!canAdd}
          onclick={() => beginShape(entry.id)}
        >{entry.name}</button>
      {/each}
    </div>
  {/if}
</div>

<script>
  import { ARCHITECTURE_SHAPE_LIBRARY } from './architecture-shapes';
  // ...existing logic
</script>
```

- [ ] **Step 2: Gate on existing placement conditions**

Re-use `canAdd` derivation (already in toolbar — placeholder for full restoral; bring back). Or duplicate the conditions locally.

- [ ] **Step 3: Click-away dismiss**

Wire `pointerdown` close handler (already in `EditorViewportToolbar.svelte` — extend or replicate).

- [ ] **Step 4: Tests + gate**

Run: `cd /Users/tony/Documents/Personal && npm run test -w @portfolio/museum -- --run 2>&1 | tail -10 && npm run check -w @portfolio/museum`
Expected: all pass; 0/0.

---

### Task 4: Polish — handoff doc + visitor chunk grep + manual checklist

**Files:**
- Modify: `docs/agent-handoffs/CURRENT.md` (Phase 6.5.2 pointer)
- Create: `docs/agent-handoffs/phase-6.5.2.md` (handoff structure)
- Run production build + visitor chunk grep

- [ ] **Step 1: Visitor chunk grep gate**

Run:
```bash
cd /Users/tony/Documents/Personal && npm run build -w @portfolio/museum && \
  grep -r 'architecture-shapes\|scale-vector' apps/museum/.svelte-kit/output/client/_app/immutable/nodes/ || echo "no matches - PASS"
```
Expected: `no matches - PASS`.

- [ ] **Step 2: Manual walkthrough doc**

In `phase-6.5.2.md`, document the manual verification flow:

| Step | Expected |
|---|---|
| Open `/dev/museum-editor`, click Add → Architecture → Wall | Submenu opens; Wall option live |
| Click Wall → click a museum room floor | Wall entity created, `name = 'Wall'`, `dimensions = (2, 3, 0.05)`, `scaleVector = [1, 1, 1]`, `scaleMode = 'uniform'` (default for Wall in this 6.5.2 cut; can flip to independent via chain icon) |
| Select the wall, toggle chain icon (loose mode) | Inspector now shows `X Y Z` fields |
| Set X = 5, Y = 3 | Wall resizes to 5 m wide × 3 m tall × 0.05 m thick; Inspector live |
| Drag wall on Y-axis gizmo | Wall stretches along Y axis only (other axes untouched) |
| Reload `/museum` | Visitor scene renders the wall at uniform dimensions (lossy — documented) |

- [ ] **Step 3: Handoff doc**

Mirror `phase-6.2.md` (Goal / What shipped / Tests / Gates / Architecture sketch / Deviations / Carry-overs / Manual walkthrough / Next pointer).

- [ ] **Step 4: Update CURRENT**

`docs/agent-handoffs/CURRENT.md` points at `phase-6.5.2.md` as latest shipped; next pointer opens Phase 6.6 (architecture consolidation or visitor vector-fidelity).

---

## Cross-Phase Acceptance Criteria

| Gate | Target |
|---|---|
| Vitest total | 926+ new tests over Phase 6.2 baseline (899) |
| `npx svelte-check` | 0 / 0 |
| `npm run build` | exit 0 |
| Visitor-chunk grep `architecture-shapes\|scale-vector` | zero matches in `apps/museum/.svelte-kit/output/client/_app/immutable/nodes/` |
| Schema v6 json | unchanged (no `scaleVector` field added) |
| Existing 899 tests | all still green after both phases |
| Manual walkthrough | both phase checklists complete |

## Open Decisions for Reviewer

1. **Visitor fidelity lossiness.** Independent-scaled placements render at scale = 1× in `/museum`. Acceptable for v1; revisit at schema v7 work in Phase 6.6+?
2. **Persistence.** scaleMode is session-only in this 6.5 cut. Persist on reload? Defer to 6.6?
3. **Add menu scope.** Architecture-only in 6.5.2 v1. Restore full Camera/Box/Plane/Cylinder/Sphere list as 6.3/6.6 polish?
4. **Cluster anchor.** Per-axis delta from `lastSelectedId` (consistent with Active Object pivot). Pick a different anchor mechanism?

Confirm or amend before subagent dispatch.
