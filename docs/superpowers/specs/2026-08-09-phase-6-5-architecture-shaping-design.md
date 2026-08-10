# Phase 6.5 — Architecture Shaping (Independent Scale UX + Named Shape Catalogue)

**Date:** 2026-08-09
**Status:** Design in progress (§1–§5 drafted; ready for plan)
**Phase:** 6.5 (continuation of editor graybox authoring work)
**Predecessor:** [`docs/superpowers/specs/2026-08-08-phase-6-2-obb-pivot-and-settings-design.md`](./2026-08-08-phase-6-2-obb-pivot-and-settings-design.md)
**Plan:** [`../plans/2026-08-09-phase-6-5-architecture-shaping.md`](../plans/2026-08-09-phase-6-5-architecture-shaping.md)

---

## §0 — Goal

Two related improvements to make rough architecture authoring cheap:

1. **Independent Scale UX** — toggle between `uniform` (today's behavior, X/Y/Z stay proportional) and `independent` (X/Y/Z scale separately). Default stays `uniform` so existing scenes are byte-identical.
2. **Named Architecture Shape Catalogue** — semantic entries (`Wall`, `Floor`, `Ceiling`, `Column`, `Door`) layered on existing primitive kinds (`box`, `plane`, `cylinder`). No new primitive kinds. No schema migration.

Together they let an editor author a rough room volume with a few clicks — drop a `Floor (6 m × 6 m)`, set independent scale `(6, 0.1, 6)`, drop a `Wall (5 m × 3 m)`, set scale `(5, 3, 0.05)`. Once real GLB assets land, the graybox wall/floor gets replaced via the existing model placement flow.

## §1 — Architecture + Component Map

### New files

| File | Responsibility |
|---|---|
| `apps/museum/src/lib/editor/architecture-shapes.ts` | Pure: `ARCHITECTURE_SHAPE_LIBRARY` (semantic named entries → underlying primitive kind + default dimensions + default `scaleVector`). `getArchitectureShape(kind)` lookup. `listArchitectureShapes()` for the Add menu. No Three imports. |
| `apps/museum/src/lib/editor/architecture-shapes.test.ts` | Every named kind maps to a non-empty dimensions object; dimensions positive-finite; `scaleVector` shape present or absent; `kind` ∈ `{box, plane, cylinder}`. |
| `apps/museum/src/lib/editor/scale-vector.ts` | Pure: `isUniform(s: number \| Vec3)` / `normalizeScale(mode, scalar, vector) → { scaleScalar, scaleVector }`. No Three imports. |
| `apps/museum/src/lib/editor/scale-vector.test.ts` | Uniform + non-uniform cases; round-trip from `Vec3 → scalar when all equal` and `scalar → Vec3 when independent`. |

### Modified files

| File | Change |
|---|---|
| `editor-transform.ts` | Extend `PlacementTransform`: add `scaleVector: Vec3 \| null`, `scaleMode: 'uniform' \| 'independent'` (bidirectional read/write with existing `scale: number`). Rewrite `placementTransformFromDocument` / `writePlacementTransform` to coerce one-or-three. Codec stays scalar on disk; vector lives in transform only. |
| `store/editor-interaction-store.svelte.ts` | Add `scaleMode: 'uniform' \| 'independent'` (default `'uniform'`), `toggleScaleMode()`, `setScaleMode(mode)`. `$state`. |
| `EditorTransformInspector.svelte` | Replace "Uniform scale" fieldset with new "Scale" fieldset containing a chain-icon toggle button + (conditional) single field or three-axis fields. Toggle `aria-pressed={scaleMode === 'independent'}`. |
| `EditorTransformControls.svelte` | Gate `enforceUniformObjectScale` on `interactionStore.scaleMode === 'uniform'`. Read per-axis `root.scale.copy(t.scale)` in independent mode (driven by TransformControls' live vertex handles). Drag mutates only the dragged axis in independent. |
| `editor-cluster-transform.ts` | Branch on `scaleMode` for cluster drag propagation: uniform → keep existing `setScalar(uni)`; independent → propagate per-axis delta from a designated anchor member. |
| `museum-editor.svelte.ts` | Add `scaleVector` getter per `PlacementTransform`-derived accessor alongside `selectedTransform`; gate `editorTransformFromDocument` on mode. |
| `EditorPlacementTools.svelte` | `Add → Architecture` submenu lists `Wall`, `Floor`, `Ceiling`, `Column`, `Door` items. Each calls `store.beginPrimitivePlacement(primitiveKind)` with defaulted `dimensions + scaleVector` derived from the named entry. |
| `placement-cluster-mutator.svelte.ts` | `beginPrimitivePlacement` accepts optional `{ preset, scaleVector }`. Preset tweaks `defaultPrimitiveDimensions` + applies `scaleVector` on commit. |

### Pure types

```ts
type ScaleMode = 'uniform' | 'independent';

type ArchitectureShapeId = 'wall' | 'floor' | 'ceiling' | 'column' | 'door';

type ArchitectureShapeEntry = {
  id: ArchitectureShapeId;
  name: string;
  primitiveKind: 'box' | 'plane' | 'cylinder';
  dimensions: ScenePrimitiveDimensions;
  /**
   * Optional default `scaleVector`. Independent-mode shapes ship this; uniform-mode
   * shapes omit it (visitor renders `scale: 1.0`).
   * Examples:
   *   floor:  [6, 0.1, 6]     (6×6 m × 0.10 m thick)
   *   wall:   [5, 3, 0.05]    (5 m wide × 3 m tall × 0.05 m thick)
   *   column: [1, 1, 1]       (cylinder r * h default; uniform fine here)
   */
  defaultScaleVector?: Vec3;
  description: string;
};

type PlacementTransform = {
  position: Vec3;
  rotation: Vec3;
  scaleScalar: number;          // present iff uniform (or visitor view of independent → coerces)
  scaleVector: Vec3 | null;     // present iff independent and non-uniform
  scaleMode: ScaleMode;
};
```

### Visitor parity

- Codec and document JSON are untouched: visitor loads `entity.scale ?? 1` exactly like today.
- The independent-scale path is **editor-session-only**. After export/reload the schema still carries either the visitor-canonical scalar (`scale: 1` if uniform) or nothing (vector lives in editor transform).
- New "Add → Architecture" menu sits behind dev-route guard.
- Visitor-chunk grep additions: `architecture-shapes`, `scale-vector`.

### Implementation choices flagged

- (i) **No new primitive kinds.** A wall IS a plane; a column IS a cylinder. The catalogue only adds a layer of semantic naming + sensible defaults.
- (ii) **Vector stored in transform, never in document.** Schema no-bump is a hard constraint (it preserves visitor render path byte-equivalence). Vector lives as a sibling field on `PlacementTransform`; the codec persists only the scalar.
- (iii) **Default scaleMode = 'uniform'.** Existing scenes untouched. New architecture shapes opt-in to independent scale via `defaultScaleVector`; importing them flips `scaleMode` to `independent` for that placement only — cluster's dominant mode is recomputed when members disagree.
- (iv) **Chain-icon toggle = single button, no settings popover.** Earlier 6.2 design carried a settings popover model. 6.5 collapses to one chain button inline with the scale fields. Settings persistence key stays minimal (single `scaleMode` key, optional).

## §2 — Scale Mode Algorithm + Architecture Shape Defaults

### Scale mode state machine

```
scaleMode: ScaleMode           // editor interaction store
PlacementTransform: scaleScalar: number
PlacementTransform: scaleVector: Vec3 | null
PlacementTransform: scaleMode: ScaleMode (mirror, persisted)

Reading placement (placementTransformFromDocument):
  if (placement.scale != null) {
    scaleScalar = placement.scale
    scaleVector = null
    scaleMode = 'uniform' (default)
  } else {
    scaleScalar = placement.scaleVector? average?? 1   // legacy fallback
    scaleVector = null
    scaleMode = 'uniform'
  }
  // editor adds scaleVector at apply-time:
  if (interactionStore.scaleMode === 'independent') {
    scaleVector = currentRoot.scale.{x,y,z} as Vec3
    scaleScalar = round-trips: average(.) unless all equal
  }

Writing placement (writePlacementTransform):
  if (scaleMode === 'uniform' || scaleVector is null/equal) {
    placement.scale = scaleScalar (or omit if ≈ 1)
    placement.scaleVector removed
  } else {
    placement.scale = scaleScalar (still set as fallback for visitor)
    placement.scaleVector persisted as optional schema field
    // BUT — schema 6 has no scaleVector field. Either:
    //  (a) Don't persist the vector; let visitor render scale only.
    //  (b) Bump schema to v7 and add scaleVector: [x,y,z] | null.
    // 6.5 picks (a). Note: independent-scaled placements re-import as uniform
    // on schema-v6 visitor bundles; editor view in the in-app store is preserved.
  }
```

**Decision:** schema stays v6. **Visitor renders `placement.scale ?? 1`.** Editor preserves vector state in response to user edits — when user toggles back to uniform the vector collapses to a scalar (average of x/y/z when equal; otherwise first component picked); the persisted `scale` is whatever the user last committed. This is "best-effort visitor fidelity" — editor gets full precision, visitor falls back to scalar. Documented in §4.

### Independent scale gizmo flow

```
TransformControls.setMode('scale')
  attach(root)
  interactionStore.scaleMode:
    'uniform'   → root.scale.copy(t.scale) → enforceUniformObjectScale(root, axis)
    'independent' → root.scale.copy(t.scale) (only changes dragged axis(es))

dragging-changed(event):
  if (event.value === true) beginCapture()
  else commitTransformWithScaleVector(root)
```

`enforceUniformObjectScale(root, axis)`:
- Today: sets `root.scale.setScalar(scalar)` per frame.
- Independent: skipped. `root.scale` keeps its own values.

`localCornersInto(matrixWorld, rootLocalBox3, out)` is unchanged (§6.2). The OBB outline rotates with the cluster's per-frame stream regardless of mode.

### Architecture shape dimensions

Defaults match museum floor footprint conventions (Phase 1 graybox):

| Shape | kind | dimensions | defaultScaleVector | comment |
|---|---|---|---|---|
| `floor` | `box` | width 1 / height 0.05 / depth 1 | `[6, 6, 1]` (× floor size × 1) | thin slab allows thick floor; user scales to room footprint |
| `wall` | `box` | width 2 / height 3 / depth 0.05 | `[5, 3, 1]` (× wall width × wall height × 1) | user scales X to wall length, Y to height, Z stays thin |
| `ceiling` | `box` | width 1 / height 0.03 / depth 1 | `[6, 6, 1]` | mirror of floor; user scales to room footprint |
| `column` | `cylinder` | radius 0.15 / height 3 | — (uniform) | independent not needed; cylinder scales proportionally |
| `door` | `box` | width 0.9 / height 2.1 / depth 0.05 | `[1, 1, 1]` (uniform) | kept lean; user drags scale after placement |

Rationale: walls + floors + ceilings opt into independent scaling — these are the shapes users most often resize non-uniformly. Columns + doors keep the uniform default — cylinder + small box are simple enough that "scale uniformly" feels right.

### Shape → primitive coercion

`createPrimitiveEntity` already exists (Phase 4.3). The catalogue layer wraps it:

```ts
function placeArchitectureShape(store, shapeId, floorHit) {
  const entry = ARCHITECTURE_SHAPE_LIBRARY.find(e => e.id === shapeId);
  if (!entry) throw new Error('Unknown shape: ' + shapeId);

  const id = `${shapeId}-${shortId()}`;
  const placement = createPrimitiveEntity({
    id,
    kind: entry.primitiveKind,
    roomId: floorHit.roomId,
    position: floorHit.point,
    dimensions: entry.dimensions,
    name: entry.name,                     // 'Wall' (not 'box')
    scale: 1,                             // uniform fallback
    // scaleVector lives in PlacementTransform, not in the document.
  });

  // Apply defaultScaleVector to the editor transform if present.
  if (entry.defaultScaleVector) {
    interactionStore.setScaleMode('independent');
    store.commitPlacementTransform(id, {
      position: [...placement.position],
      rotation: [0, 0, 0],
      scaleScalar: 1,
      scaleVector: entry.defaultScaleVector,
      scaleMode: 'independent'
    });
  }
  // else: stays uniform (scale: 1).
}
```

### Cluster handling

`editor-cluster-transform.ts` already has uniform propagation. Add independent propagation:

```ts
if (scaleMode === 'independent') {
  // Per-axis delta from the designated anchor member's matrix.
  const anchor = anchorMember();
  for (const member of clusterMembers) {
    if (member.id === anchor.id) continue;
    member.root.scale.x = anchor.root.scale.x + (anchor.new.x - anchor.old.x);
    member.root.scale.y = anchor.root.scale.y + (anchor.new.y - anchor.old.y);
    member.root.scale.z = anchor.root.scale.z + (anchor.new.z - anchor.old.z);
  }
}
```

Anchor = `lastSelectedId` member (consistent with Active Object pivot). Falls back to centroid-member when `lastSelectedId` is null or removed.

## §3 — UI: Chain Icon + Per-Axis Fields + Add → Architecture Menu

### Inspector scale row

```
Scale  [chain] [Scale 1.00  ]   ← uniform mode
       ┌──────────────────┐
       │  ⛓  when pressed  │  = uniform (axis-aligned)
       │  ⛓  when loose    │  = independent (per-axis)
       └──────────────────┘

Scale  [chain-loose] [X 5.0  ] [Y 3.0  ] [Z 0.05]   ← independent mode
```

Chain icon SVG:

```svg
<!-- uniform (closed / linked) -->
<svg viewBox="0 0 16 16" aria-hidden="true">
  <path d="M5 7h6v2H5zM3 9v-2a2 2 0 012-2h2v2H5v2H3zm10-2v2h-2V7h-2V5h2a2 2 0 012 2z"
        fill="currentColor"/>
</svg>

<!-- independent (loose / cut) -->
<svg viewBox="0 0 16 16" aria-hidden="true">
  <path d="M5 7h4v2H5zM3 9V7h2v2H3zm12-2v2h-2V7h-2a2 2 0 00-2 2h-2a4 4 0 014-4h4z"
        fill="currentColor"/>
  <path d="M5 9l-1 1m9-9l-1 1" stroke="currentColor" stroke-width="1.4"/>
</svg>
```

Clicking the button toggles `interactionStore.scaleMode`. The state is per-session (does not persist by default; persist key optional — see §4).

### Toolbar entry

No new toolbar buttons. Scale mode lives only in the inspector. (Adding a toolbar chip is a future polish if users want at-a-glance mode.)

### Add menu — Architecture submenu

```
Add ▾
  Architecture  ▸
    Floor
    Wall
    Ceiling
    Column
    Door
  ────────
  Camera
  Box     (kept from existing primitive placement)
  Plane   (kept — but renamed to "Plane (raw)" to disambiguate with Wall/Floor)
  Cylinder
  Sphere
```

Hover state highlights each entry; click arms the placement flow (same as existing `beginPrimitivePlacement(kind)`). After arming, click a museum room floor to commit.

### Persistence

Optional: scale mode persists across sessions. Schema: `museum-editor:settings:v1` (already used by Phase 6.2's now-deleted settings store). Phase 6.5 reintroduces a minimal single-key persistence — just `scaleMode: 'uniform' | 'independent'`, not the full popover. Trade-off documented; team can decide to skip this for v1.

**Decision for v1:** scale mode is **session-only**. Toggle resets to `uniform` on reload. Reason: keeps 6.5 scope tight; persistent mode flips a semantics document JSON could already have stored; revisit at 6.6 polish.

## §4 — Visitor Parity + Export + Storage Semantics

### Visitor chunk isolation

- `architecture-shapes.ts` and `scale-vector.ts` pure helpers do not appear in `/museum` chunks because they're imported only by editor routes. Grep gate runs `apps/museum/.svelte-kit/output/client/_app/immutable/nodes/*.js` for `architecture-shapes`, `scale-vector`; expects zero matches.
- `EditorPlacementTools.svelte` and `EditorTransformInspector.svelte` modifications live behind dev-route guard; visitor preview gate unchanged from Phase 6.1.

### Visitor render fidelity

| Editor state | Visitor render | Lossiness |
|---|---|---|
| `uniform`, scale = 1 | `entity.scale = undefined` → render at 1× | none |
| `uniform`, scale = N | `entity.scale = N` → render at N×  | none |
| `independent`, [5, 3, 0.05] | `entity.scale = undefined` → render at 1× | **editor gains fidelity; visitor sees uniform 1×** |
| `independent`, [3, 3, 3] (= uniform) | `entity.scale = undefined` → render at 1× | none (auto-coerced, see below) |

**Coercion rule:** if `scaleVector` is non-null AND all three components equal (within ε = 1e-6), coding translates to `scale: thatvalue` on persist. Independent → uniform mode flip auto-coerces; visitor renders correctly.

**Catalogued shape with defaultScaleVector:** visitor renders at scale = 1×. Architecture-shaped graybox walls/floors **look smaller in visitor view than editor view**. Document this gap explicitly. Mitigations (out of scope for 6.5):
- Bump schema to v7 with `scaleVector: [x,y,z] | null`. Heavy.
- Persist an editor-specific `localStorage:vector-override:<id>` map. Hack.
- Editor export round-trips through a sidecar JSON that visitor reads in dev mode only.

For 6.5 ship: editor fidelity takes priority over visitor fidelity. Visitor shows uniform 1× for defaulted shapes. Editor users get exact dimensions while authoring. Cleanup deferred to v7 schema work.

### Editor commit path

```ts
// placement-cluster-mutator.commitPlacementTransform
function commitPlacementTransform(id, transform: PlacementTransform) {
  const placement = document.placements.find(id);
  if (!placement) return false;
  placement.position = [...transform.position];
  placement.rotation = [...transform.rotation];

  // Schema 6 only stores scale: number. Persist as scalar.
  if (transform.scaleVector) {
    const allEqual =
      Math.abs(transform.scaleVector[0] - transform.scaleVector[1]) < 1e-6 &&
      Math.abs(transform.scaleVector[1] - transform.scaleVector[2]) < 1e-6;
    placement.scale = allEqual
      ? transform.scaleVector[0]
      : 1;  // visitor fallback — see §4 plan above
  } else {
    placement.scale = transform.scaleScalar;
  }

  // store the vector in editor-session TransformMap (not document)
  sessionState.scaleVectorById[id] = transform.scaleVector ?? null;
  return true;
}
```

### Drag undo

Phase 6.1's drag-snapshot captures `[id, position, quaternion, scaleVector?]`. Independent mode snapshots the vector; revert restores exactly. No schema impact.

### Esc mid-drag

Same as Phase 6.1; the snapshot is uniform-or-vector, restored as-is on revert.

### Polish carry-overs

| Item | 6.5 | Notes |
|---|---|---|
| Independent Scale UX (X/Y/Z) | Ship | §1–§4 |
| Chain icon toggle | Ship | §3 |
| `Architecture` Add submenu (5 entries) | Ship | §3 |
| Wall / Floor / Ceiling / Column / Door defaults | Ship | §2 |
| Cluster non-uniform propagation | Ship | §2 |
| `defaultScaleVector` for wall/floor/ceiling | Ship | §2 |
| Visitor scalar-fidelity gap (independent → uniform visitor) | Document | §4 |
| Settings persistence for `scaleMode` | **Defer** | Session-only v1; revisit 6.6 |
| Schema v7 with `scaleVector` field | **Defer** | Heavy; revisit 6.6/7 |
| Toolbar chip for at-a-glance mode | **Defer** | Polish, post-6.5 |

## §5 — Tests + Out-of-Scope + Ship Criteria

### New tests

| File | Coverage | ≈ tests |
|---|---|---|
| `apps/museum/src/lib/editor/scale-vector.test.ts` | `isUniform`; `normalizeScale` (uniform scalar → scalar uniform; independent uniform → Vec3 of equal components; non-uniform vector → vector + cooldown); round-trip persistence. | ~6 |
| `apps/museum/src/lib/editor/architecture-shapes.test.ts` | All 5 named entries present; positive-finite dimensions; `defaultScaleVector` valid for Wall/Floor/Ceiling only; `primitiveKind` ∈ `{box, plane, cylinder}`. | ~6 |
| `apps/museum/src/lib/editor/store/editor-interaction-store.test.ts` (extend) | `scaleMode` default `'uniform'`; `setScaleMode('independent')` and `toggleScaleMode` flip the value; reactivity triggers downstream `$effect`s. | ~3 |
| `apps/museum/src/lib/editor/EditorTransformInspector.test.ts` (extend) | Chain icon click toggles `interactionStore.scaleMode`; uniform shows single field; independent shows three fields; field commit writes `scaleVector` to placement transform. | ~5 |
| `apps/museum/src/lib/editor/EditorTransformControls.test.ts` (extend) | Independent mode: per-axis gizmo drag mutates only the dragged axis; uniform mode: unchanged `setScalar`. | ~3 |
| `apps/museum/src/lib/editor/editor-cluster-transform.test.ts` (extend) | Cluster independent propagation: anchor + follower scale deltas per axis match anchor delta. | ~3 |
| `apps/museum/src/lib/editor/store/placement-cluster-mutator.test.ts` (extend) | `beginPrimitivePlacement({ preset: 'wall' })` arms with wall defaults; commit produces correct entity + transform with `scaleVector`. | ~3 |

### Modified tests

| File | Change |
|---|---|
| `editor-transform.test.ts` | `placementTransformFromDocument` / `writePlacementTransform` round-trips with `scaleVector` extension. |
| `museum-editor-placement.test.ts` | New: wall/floor/ceiling placements have expected defaults + scaleVector. |

### Existing tests — keep green

All existing 6.2 baseline tests (881 + new) remain green. Visitor chunks unchanged.

### Ship criteria

| Gate | Threshold |
|---|---|
| Vitest | 100% pass; ~+27 new tests (Δ over 899 → ~926) |
| `npx svelte-check` | 0 errors / 0 warnings |
| `npm run build` | exit 0 |
| Visitor-chunk grep | zero matches in `apps/museum/.svelte-kit/output/client/_app/immutable/nodes/` for `architecture-shapes`, `scale-vector` |
| Visitor `/museum` HTML chunk scan | identical to 6.2 baseline (no new editor keywords) |
| Live `/dev/museum-editor` | Add → Architecture menu lists 5 entries; clicking arms placement; committing drops a wall/floor/ceiling/column/door with correct dimensions and scale mode |

### Manual walkthrough checklist

| Step | Expected |
|---|---|
| `Add → Architecture → Wall` arms placement; place on a room floor | Wall appears, `name = 'Wall'`, dimensions (2,3,0.05), `scaleVector = [1, 1, 1]`, scaleMode `uniform` (no defaultScaleVector yet for first cut) |
| Tack a `Ceiling` 6×6 m; select it | Inspector shows Scale row; chain icon → uniform; X/Y/Z fields single scale, then toggle to loose; three fields appear; drag X to 6.0, Y to 0.03, Z to 6.0; commit | scaleVector commits; visitor `/museum` previews unchanged |
| Two walls selected; toggle Pivot to Center (existing 6.2) | Gizmo lands on centroid box; drag X → both walls stretch X in independent mode (no enforceUniform) |
| Manual export round-trip | Reload; visitor reads `entity.scale = undefined`; renders at 1× (lossiness documented) |

### Out-of-scope (deferred)

| Item | Plan |
|---|---|
| Schema v7 with `scaleVector` field | 6.6 / 7 |
| Persistent `scaleMode` setting | 6.6 |
| Visitor rendering of independent-scaled placements | 6.6 |
| Multi-opening wall architecture (`museum-shell` extension) | 6.7 (architecture seam) |
| Path clearance through named architecture shapes | 6.8 |
| Asset replacement flow for graybox walls/floors → real GLB | 6.9 |
| Toolbar chip showing current `scaleMode` | Polish |

### Sub-slice plan

1. **Phase 6.5.1 — Independent Scale UX.** Pure helpers + state; inspector + gizmo + cluster propagation. Tests.
2. **Phase 6.5.2 — Architecture Shape Catalogue.** Pure catalogue + Add menu + placement flow wired to defaults from 6.5.1. Tests + handoff.

Each sub-slice is independently shippable. 6.5.1 lands a fully working independent-scale feature on existing primitives. 6.5.2 adds the named layer + add menu on top.
