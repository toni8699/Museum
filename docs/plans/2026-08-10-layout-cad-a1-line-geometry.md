# A1 — Line Rooms and Preview Model

**Date:** 2026-08-10  
**Status:** Implemented; UI deliberately deferred  
**Parent plan:** [`2026-08-10-layout-cad-foundation.md`](./2026-08-10-layout-cad-foundation.md)  
**Handoff:** [`../hand-off/CURRENT.md`](../hand-off/CURRENT.md)  
**Scope:** Pure line-room geometry, validation, preview data, and transaction stub

## Goal

Prove the smallest useful layout geometry slice after A0/B0:

```text
LayoutDocument fixture/API
  → validate line room
  → split walls around rectangular cutouts
  → produce preview model
  → transaction commit/cancel
```

A1 proves data and geometry contracts. It does **not** wire editor UI.

## Explicit UI boundary

Do not modify these for A1:

- `EditorViewport.svelte`;
- `MuseumEditorApp.svelte`;
- `EditorViewportToolbar.svelte`;
- `museum-editor.svelte.ts` facade;
- editor shortcuts or selection UI;
- Plan/Museum workspace switch;
- layout import/export menu;
- shared Undo/Redo toolbar.

No `LayoutPreview.svelte` mount in A1. Preview is a pure model/factory output consumed by tests and future A2/B1 rendering.

A2 owns first user-facing UI wiring:

- Layout/Museum mode mutex;
- Plan/3D view;
- rectangle/polygon tools;
- snapping and selection;
- generated layout preview mount.

## Files

Create:

```text
apps/museum/src/lib/editor/layout/draft-geometry.ts
apps/museum/src/lib/editor/layout/layout-validation.ts
apps/museum/src/lib/editor/layout/layout-mesh-factory.ts
apps/museum/src/lib/editor/layout/layout-transaction.ts
apps/museum/src/lib/editor/layout/layout-a1-fixtures.ts
apps/museum/src/lib/editor/layout/draft-geometry.test.ts
apps/museum/src/lib/editor/layout/layout-validation.test.ts
apps/museum/src/lib/editor/layout/layout-mesh-factory.test.ts
apps/museum/src/lib/editor/layout/layout-transaction.test.ts
```

Do not add Svelte or Three imports in A1 modules. A2 creates the rendering adapter.

## Geometry contract

A1 accepts only line segments:

- Bezier segments return a structured `bezier-deferred` issue from validation;
- no curve sampling;
- no arch generation;
- no triangulation beyond simple polygon data needed for preview metadata.

Coordinates use layout world X/Z space:

- `LayoutVec2[0]` = world X;
- `LayoutVec2[1]` = world Z;
- floor plane = Y 0;
- ceiling = `floor.height`;
- wall height = `floor.height`;
- room thickness values come from `LayoutRoom`.

### Path validation

Return structured issues with target IDs and paths. Validate:

- room boundary has at least three line segments;
- every segment has finite endpoints;
- consecutive segment endpoints match within `1e-6`;
- final endpoint matches first start within `1e-6`;
- no zero-length segment;
- no self-intersection;
- no Bezier segment in A1.

A1 does not infer room adjacency or portal relationships.

### Opening validation

For each line wall segment:

- `offset` = distance from segment start;
- interval = `[offset, offset + width]`;
- interval must remain within segment length;
- openings on one segment must not overlap;
- openings may exist on different corridor walls;
- `connectsRoomIds` is not present or inferred.

## Pure geometry APIs

Use simple tuple/data outputs suitable for tests and a future Three adapter:

```ts
export function lineLength(start: LayoutVec2, end: LayoutVec2): number;
export function validateLineRoom(room: LayoutRoom, floor: LayoutFloor): LayoutGeometryIssue[];
export function openingIntervals(
  segment: DraftSegment,
  openings: readonly LayoutOpening[]
): WallOpeningInterval[];
export function splitWallAroundOpenings(
  segment: DraftSegment,
  openings: readonly LayoutOpening[],
  wallHeight: number
): WallPreviewSection[];
```

`splitWallAroundOpenings` returns side and lintel sections. It must not create CSG or Three geometry.

## Preview model

`layout-mesh-factory.ts` produces data, not render objects:

```ts
type LayoutPreviewModel = {
  rooms: LayoutRoomPreview[];
};

type LayoutRoomPreview = {
  roomId: string;
  floorPolygon: LayoutVec2[];
  ceilingPolygon: LayoutVec2[];
  walls: WallPreview[];
};

type WallPreview = {
  segmentId: string;
  start: LayoutVec2;
  end: LayoutVec2;
  height: number;
  thickness: number;
  sections: WallPreviewSection[];
};

type WallPreviewSection = {
  kind: 'side' | 'lintel';
  startDistance: number;
  endDistance: number;
  bottomY: number;
  topY: number;
};
```

Factory contract:

```ts
export function buildLayoutPreviewModel(
  document: LayoutDocument
): LayoutPreviewModelResult;
```

Valid result contains preview data for all valid rooms. Invalid rooms return issues and are omitted from generated preview data; caller retains previous valid model in a future UI layer.

No actual mesh or material allocation occurs in A1.

## Transaction stub

Implement a pure layout transaction helper for tests and future store integration:

```ts
export type LayoutTransaction<T> = {
  begin(current: T): boolean;
  commit(next: T): { changed: boolean; before: T | null };
  cancel(): T | null;
  isActive: boolean;
};
```

Rules:

- one active transaction at a time;
- begin clones snapshot;
- no-op commit returns `changed: false`;
- commit returns one before-snapshot;
- cancel returns original snapshot;
- no toolbar undo/redo;
- no second user-visible history stack;
- A2/C0 later integrates layout operations into shared tagged history.

## Fixtures and tests

Fixtures:

- blank document;
- rectangle room;
- L-shaped line room;
- skinny corridor room with two rectangular cutouts;
- rotated/world-coordinate Chopin fixture from B0;
- Bezier room fixture rejected with `bezier-deferred`.

Tests must cover:

1. line lengths;
2. endpoint continuity tolerance;
3. zero-length rejection;
4. self-intersection rejection;
5. Bezier deferral;
6. opening interval conversion;
7. out-of-range opening rejection;
8. overlapping opening rejection;
9. two corridor cutouts on separate walls;
10. side/lintel wall sections;
11. floor/ceiling preview bounds;
12. rotated B0 fixture preview coordinates;
13. invalid rooms omitted from preview result;
14. transaction begin/commit/cancel/no-op behavior;
15. no source document mutation.

## Focused verification

```bash
npm run test -w @portfolio/museum -- --run \
  src/lib/editor/layout/draft-geometry.test.ts \
  src/lib/editor/layout/layout-validation.test.ts \
  src/lib/editor/layout/layout-mesh-factory.test.ts \
  src/lib/editor/layout/layout-transaction.test.ts
npm run check
```

Existing unrelated check failures may remain in `MuseumEntities.svelte` and `EditorViewport.svelte`; A1 must not add diagnostics.

## A1 completion gate

- Pure line geometry and validation tests pass.
- B0 compiled Chopin rooms produce preview model data.
- Corridor fixture supports two geometry-only cutouts.
- No Bezier/arch implementation lands.
- No editor UI files change.
- No shared history or scene document changes.
- Full existing test suite remains green.
- A2 has a clear rendering adapter input: `LayoutPreviewModel`.

## Future polish decisions, intentionally deferred

A2+ decides:

- Plan/Museum mode visual treatment;
- Plan/3D split vs hard switch;
- rectangle drag affordance;
- polygon close/cancel affordances;
- grid/angle snap UX;
- selection colors and handle styling;
- camera framing when switching Plan/3D;
- whether layout preview overlays or replaces current shell;
- how B1 “Load Chopin layout” is exposed;
- layout dirty indicator and project menu placement;
- shared Undo/Redo labels for tagged layout/scene operations;
- Bezier handle UX and arch profile controls;
- responsive/mobile layout behavior.
