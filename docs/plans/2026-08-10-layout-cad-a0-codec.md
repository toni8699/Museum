# A0 — LayoutDocument Types and Codec

**Date:** 2026-08-10  
**Status:** Approved; ready to implement  
**Parent plan:** [`2026-08-10-layout-cad-foundation.md`](./2026-08-10-layout-cad-foundation.md)  
**Handoff:** [`../hand-off/CURRENT.md`](../hand-off/CURRENT.md)  
**Scope:** Pure layout data types, validation, canonical JSON, and tests

## Goal

Create the editor-only `LayoutDocument` contract used by B0 room compilation and later A1 layout preview. A0 must be deterministic, serializable, and independent of Svelte, Three.js, scene v6, camera code, and visitor runtime.

A0 does not create UI, geometry meshes, history, snapping, portal semantics, or runtime architecture behavior.

## Files

Create:

```text
apps/museum/src/lib/editor/layout/layout-types.ts
apps/museum/src/lib/editor/layout/layout-codec.ts
apps/museum/src/lib/editor/layout/layout-codec.test.ts
```

Use existing project types where appropriate:

- import `Vec3` from `$lib/types/museum`;
- define layout-local `LayoutVec2 = [number, number]`;
- do not import `Vec2` from `types/materials.ts`.

No new dependency.

## Serialized model

```ts
import type { Vec3 } from '$lib/types/museum';

export type LayoutVec2 = [number, number];

export type LayoutDocument = {
  formatVersion: 1;
  units: 'meters';
  floors: LayoutFloor[];
  objects: LayoutObject[];
};

export type LayoutFloor = {
  id: string;
  name: string;
  elevation: number;
  height: number;
  rooms: LayoutRoom[];
};

export type LayoutRoom = {
  id: string;
  name: string;
  boundary: DraftPath;
  wallThickness: number;
  floorThickness: number;
  ceilingThickness: number;
  openings: LayoutOpening[];
};

export type DraftPath = {
  closed: true;
  segments: DraftSegment[];
};

export type DraftSegment =
  | {
      id: string;
      kind: 'line';
      start: LayoutVec2;
      end: LayoutVec2;
    }
  | {
      id: string;
      kind: 'bezier';
      start: LayoutVec2;
      handleOut: LayoutVec2;
      handleIn: LayoutVec2;
      end: LayoutVec2;
    };

export type LayoutOpening = {
  id: string;
  segmentId: string;
  kind: 'door' | 'window';
  offset: number;
  width: number;
  height: number;
  sillHeight: number;
  profile: 'rectangular' | 'rounded' | 'pointed';
};

export type LayoutObject = {
  id: string;
  kind: 'box' | 'plane' | 'cylinder' | 'sphere' | 'profile';
  position: Vec3;
  rotation: Vec3;
  dimensions: Vec3;
  profile?: DraftPath;
  roomId?: string;
};
```

### A0 semantics

- `LayoutDocument` may be empty: `floors: []`, `objects: []`.
- `LayoutRoom.boundary` is committed data and must be closed. Open paths are transient editor interaction state and are not serialized in A0.
- `LayoutOpening.offset` is meters along its referenced segment. It is never a sample index or normalized progress value.
- `segmentId` must exist in the owning room boundary.
- A1 openings are geometry-only. A0 has no `connectsRoomIds`; B4 adds explicit portal adjacency.
- Profile objects require a closed `DraftPath`.
- A0 accepts Bezier segments as data but performs no curve geometry or sampling.
- A1 geometry validation owns self-intersection, winding, opening overlap, and triangulation checks.

## Validation contract

Export these public types:

```ts
export type LayoutDocumentIssue = {
  path: string;
  code: string;
  message: string;
};

export type LayoutDocumentValidationResult =
  | {
      success: true;
      document: LayoutDocument;
      canonicalJson: string;
    }
  | {
      success: false;
      issues: LayoutDocumentIssue[];
    };
```

Export these functions:

```ts
export function validateLayoutDocument(input: unknown): LayoutDocumentValidationResult;
export function parseLayoutDocumentJson(json: string): LayoutDocumentValidationResult;
export function serializeLayoutDocument(document: unknown): string;
export function createEmptyLayoutDocument(): LayoutDocument;
```

`serializeLayoutDocument` throws a typed `LayoutDocumentValidationError` containing the first issue, matching the existing scene codec pattern. `parseLayoutDocumentJson` reports malformed JSON as an issue instead of throwing.

### Structural validation

Reject:

- non-object root;
- unsupported `formatVersion`;
- units other than `'meters'`;
- unknown keys at every serialized object level;
- missing required keys;
- wrong primitive/array/object types;
- empty or invalid IDs;
- duplicate floor, room, object, opening, or segment IDs within their owning scope;
- non-finite numeric values;
- non-positive floor height, room wall/floor/ceiling thickness, object dimensions, opening width/height;
- non-closed room/profile paths;
- empty room boundaries;
- unsupported enum values;
- opening `segmentId` not found in its room boundary;
- opening offset below zero;
- opening width/height/sill height below zero.

A0 does **not** reject geometric self-intersection or opening overlap; those belong to A1 geometry validation.

### ID rule

IDs must be non-empty strings matching:

```text
^[A-Za-z0-9][A-Za-z0-9._:-]*$
```

IDs are not generated by the codec. Fixtures and later mutators generate them; parse/serialize preserves them exactly.

## Canonical JSON contract

Use the existing scene codec convention:

```ts
JSON.stringify(normalizedDocument, null, 2) + '\n'
```

Rules:

- preserve array order;
- preserve IDs exactly;
- emit fields in declared model order;
- omit no required fields;
- never emit `undefined` or transient draft state;
- parse → serialize → parse produces equivalent document data;
- repeated serialization returns byte-identical output.

Root allowed keys:

```text
formatVersion
units
floors
objects
```

## Tests

`layout-codec.test.ts` must cover:

1. `createEmptyLayoutDocument()` returns the canonical blank document.
2. Empty document validates.
3. Rectangle fixture round-trips.
4. L-shaped fixture round-trips.
5. Triangle fixture round-trips.
6. Closed Bezier fixture round-trips as data.
7. Multiple rectangular openings round-trip, including two openings on one skinny corridor room.
8. Profile object with closed path round-trips.
9. Invalid version rejected.
10. Invalid units rejected.
11. Unknown root and nested keys rejected.
12. Missing fields and wrong types rejected.
13. Invalid IDs and duplicate scoped IDs rejected.
14. Non-finite and non-positive values rejected.
15. Unclosed room/profile path rejected.
16. Missing opening segment rejected.
17. Negative opening offset rejected.
18. Malformed JSON returns `invalid_json` issue.
19. Canonical JSON is deterministic.
20. Input objects are not mutated.
21. `serializeLayoutDocument` throws typed validation error for invalid data.
22. A0 accepts a structurally valid but self-intersecting closed boundary; A1 geometry validation owns rejecting self-intersections.

## Focused verification

```bash
npm run test -w @portfolio/museum -- --run layout-codec.test.ts
npm run check
```

A0 must not change visitor chunks or scene tests. Full build is required at the A1 gate, not for every codec edit.

## Completion gate

A0 is complete when:

- the three files exist;
- all codec tests pass;
- canonical output is deterministic;
- empty, rectangle, L, triangle, Bezier, opening, and profile fixtures round-trip;
- malformed/unknown/non-finite/non-positive data produces structured issues;
- no A0 file imports Svelte, Three.js, camera modules, scene v6, or visitor components;
- B0 can import the public types and codec without duplicating the model.

## Next handoff

After A0 passes, implement B0 immediately:

```text
rooms.ts → deterministic LayoutDocument → Chopin golden fixture
```

Do not begin Bezier geometry, arches, plan UX, portal adjacency, or runtime layout reads in A0.
