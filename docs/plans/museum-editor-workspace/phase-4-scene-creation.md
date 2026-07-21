# Phase 4 — Scene Creation

**Goal:** add parametric primitives and lights as real scene entities after camera editing is stable.

**Dependency:** Phase 3 complete, including schema v4 timing.

## Scope

Build:

- Box, plane, cylinder, and sphere creation.
- Point, spot, and directional light creation.
- Canonical scene-entity union.
- Schema v5 migration.
- Primitive/light viewport rendering, selection, transform, hierarchy, inspector, undo, import, and export.

## Out of Scope

- No mesh-editing tools.
- No arbitrary geometry import beyond existing model assets.
- No textures or material instances.
- No package export.
- No architecture ownership changes.
- No fake GLB entries for shapes or lights.

## Canonical Model

Introduce canonical v5 entities:

```ts
type SceneEntity =
  | SceneModelEntity
  | ScenePrimitiveEntity
  | SceneLightEntity;

type ScenePrimitiveKind = 'box' | 'plane' | 'cylinder' | 'sphere';
type SceneLightKind = 'point' | 'spot' | 'directional';
```

Recommended document shape:

```ts
type MuseumSceneDocumentV5 = {
  version: 5;
  entities: SceneEntity[];
  clusters?: SceneObjectCluster[];
  navigationNodes: SceneNavigationNode[];
  connections: SceneConnection[];
};
```

Entity common fields:

- Stable `id`.
- User-facing `name`.
- `roomId`.
- Room-local position, rotation, and scale.
- Visibility/lock metadata only if already supported canonically; otherwise keep session-only.
- Cast/receive shadow where render type supports it.

Model entity owns existing `assetId` placement data. Primitive entity owns kind-specific dimensions and existing catalogue material reference. Light entity owns kind-specific lighting values.

## Migration

- v4 `objects` migrate one-for-one to model entities.
- Preserve IDs, room ownership, transforms, asset IDs, cluster membership, navigation, view tracks, and timing.
- Migration must not reinterpret static room architecture.
- Serialize only canonical v5.
- Keep strict unknown-key rejection.
- Update fixtures with deterministic canonical output.

## Primitive Contract

### Add menu and Assets tab

Enable:

```text
Box
Plane
Cylinder
Sphere
```

- Shapes appear under Assets → Shapes as built-in thumbnails.
- Same commands appear in Add menu.
- Drag/click placement uses tagged room floors and room-local transforms.
- Keep primitives parametric.

### Inspector

```text
Name
Transform
Shape type
Dimensions
Material
Cast shadow
Receive shadow
Placement room/snap/lock
```

Dimension fields:

- Box: width, height, depth.
- Plane: width, height.
- Cylinder: radius, height.
- Sphere: radius.

Reject non-finite/non-positive dimensions. One gesture/input commit equals one history transaction.

## Light Contract

Enable Add → Light, then choose:

- Point.
- Spot.
- Directional.

Inspector:

```text
Name
Transform
Light type
Color
Intensity
Range
Cone/penumbra
Cast shadow
```

Show only fields applicable to selected light kind. Use conservative defaults. Do not add environment, area, photometric, or baked-light systems.

## Rendering and Selection

- Add one scene-entity renderer that dispatches by entity kind.
- Model rendering continues through existing `AssetModel` cache/clone/fallback path.
- Primitive rendering uses native Three/Threlte geometries.
- Primitive material uses existing static material catalogue in this phase.
- Lights mount under room transforms and resolve yaw-aware room-local poses.
- Editor and visitor consume the same resolved entity data.
- Selection/helper registration remains stable-ID based.
- Do not put editor helpers into `MuseumScene` or visitor bundles.

## Files to Read

- `apps/museum/src/lib/content/scene.ts`
- `apps/museum/src/lib/content/scene-codec.ts`
- `apps/museum/src/lib/content/museum-scene.json`
- `apps/museum/src/lib/types/assets.ts`
- `apps/museum/src/lib/content/assets.ts`
- `apps/museum/src/lib/content/materials.ts`
- `apps/museum/src/lib/editor/museum-editor.svelte.ts`
- `apps/museum/src/lib/editor/editor-assets.ts`
- `apps/museum/src/lib/editor/EditorAssetLibrary.svelte`
- `apps/museum/src/lib/editor/EditorSelection.svelte`
- `apps/museum/src/lib/editor/EditorPlacementTools.svelte`
- `apps/museum/src/lib/museum/MuseumAssets.svelte`
- `apps/museum/src/lib/museum/EditorPlacementRoot.svelte`
- `apps/museum/src/lib/museum/assets/AssetModel.svelte`
- `apps/museum/src/lib/museum/materials/MuseumMaterial.svelte`

## Slices

| Slice | Deliverable | Complexity | Recommended model | Reasoning |
|---|---|---:|---|---|
| 4.1 | Schema v5 entity union and v4 migration | Extreme | `gpt-5.6-sol` | Max |
| 4.2 | Shared entity renderer and selection registration | Very High | `gpt-5.6-sol` | XHigh |
| 4.3 | Primitive creation, placement, inspector, and history | Very High | `gpt-5.6-sol` | XHigh |
| 4.4 | Light creation, inspector, rendering, and history | Very High | `gpt-5.6-sol` | XHigh |
| 4.5 | Browser/production verification and handoff | High | `gpt-5.6-terra` | XHigh |

## Automated Acceptance

- v1–v4 migrate deterministically to v5.
- Existing model placements preserve IDs/transforms/clusters and render parity.
- Every primitive kind validates, serializes, resolves, renders, selects, and round-trips.
- Every light kind validates, serializes, resolves, renders, selects, and round-trips.
- Room-local transforms remain correct in yawed rooms.
- Invalid dimensions/light values fail strict validation.
- Add/edit/delete/undo/redo are atomic.
- Camera graph, view tracks, timing, and playback remain unchanged.
- Production isolation and visitor chunk boundaries remain intact.

## Browser Acceptance

1. Add each primitive from Add and Assets → Shapes.
2. Place primitives in straight and yawed rooms.
3. Edit dimensions, transforms, static material, and shadows.
4. Add each light type; edit only applicable fields.
5. Select all entity kinds from tree and viewport.
6. Re-parent/reorder only where existing ownership rules allow.
7. Export/import and undo/redo every entity operation.
8. Preview visitor scene and confirm model/camera parity.

## Completion Gate

- Models, primitives, and lights are first-class canonical entities.
- No fake asset-manifest records or parallel placement system exists.
- v5 migration preserves all camera behavior.
- Texture/material-instance work remains untouched for Phase 5.
