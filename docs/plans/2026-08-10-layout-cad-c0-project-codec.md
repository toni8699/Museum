# C0 MuseumProject Codec

**Date:** 2026-08-10  
**Status:** Implemented  
**Parent:** [`2026-08-10-layout-cad-foundation.md`](./2026-08-10-layout-cad-foundation.md)  
**Handoff:** [`../hand-off/CURRENT.md`](../hand-off/CURRENT.md)

## Goal

Add one editor-only, versioned JSON envelope that serializes the current layout document and scene document together without changing `/museum`, `rooms.ts`, camera behavior, or package/binary asset handling.

```text
MuseumProject v1
  ├─ layout: LayoutDocument v1
  └─ scene: MuseumSceneDocument v6
```

C0 makes project persistence composable for A2/B1. It does not add project menus, filesystem/zip I/O, visitor loading, shared history, or runtime cutover.

## Implementation location

Create pure modules under:

```text
apps/museum/src/lib/editor/project/
  project-types.ts
  project-codec.ts
  project-codec.test.ts
```

The codec may import the public layout codec and the public scene codec. It must not import Svelte, Three, editor stores, `rooms.ts`, camera modules, package binary helpers, or browser APIs.

## Public contract

```ts
import type { LayoutDocument } from '$lib/editor/layout/layout-types';
import type { MuseumSceneDocument } from '$lib/content/scene';

type MuseumProject = {
  formatVersion: 1;
  id: string;
  name: string;
  layout: LayoutDocument;
  scene: MuseumSceneDocument;
};

type MuseumProjectValidationResult =
  | {
      success: true;
      project: MuseumProject;
      canonicalJson: string;
    }
  | {
      success: false;
      issues: MuseumProjectIssue[];
    };
```

Export these functions and error type:

```ts
createMuseumProject(input: {
  id: string;
  name: string;
  layout: unknown;
  scene: unknown;
}): MuseumProject;
validateMuseumProject(input: unknown): MuseumProjectValidationResult;
parseMuseumProjectJson(json: string): MuseumProjectValidationResult;
serializeMuseumProject(project: unknown): string;
class MuseumProjectValidationError extends Error;
```

`createMuseumProject` validates and returns canonical typed data; invalid input throws `MuseumProjectValidationError` for parity with the layout and scene serializers. It must not mutate caller-owned input.

`MuseumProjectIssue` matches existing codec issues:

```ts
type MuseumProjectIssue = {
  path: string;
  code: string;
  message: string;
};
```

## Schema and validation rules

Outer document:

- `formatVersion` must equal `1`;
- `id` must be a stable non-empty ID matching the existing layout ID grammar;
- `name` must be a non-empty string after trim;
- `layout` and `scene` are required objects;
- unknown root keys are rejected;
- no `assets`, binary payloads, transient editor state, generated meshes, history, or adjacency fields are accepted in C0.

Nested validation delegates to existing codecs:

- `validateLayoutDocument(input.layout)` owns layout structure, stable IDs, closed committed paths, and layout references;
- `validateSceneDocument(input.scene)` owns scene structure, semantic validation, and existing v1–v6 migration;
- returned project always contains canonical `LayoutDocument` v1 and canonical `MuseumSceneDocument` v6;
- nested issues are prefixed with `$.layout` or `$.scene` by replacing the nested `$` root (for example, `$.layout.floors[0].rooms[0].id`); issue codes and messages remain unchanged;
- a project is invalid if either nested document is invalid;
- do not duplicate layout or scene validation logic in project codec.

Project-level checks only cover envelope fields. IDs may overlap between layout and scene namespaces; they are distinct document domains and C0 must not invent cross-document uniqueness rules.

## Canonical JSON

Canonical output must be deterministic:

1. root key order: `formatVersion`, `id`, `name`, `layout`, `scene`;
2. nested layout ordering comes from `serializeLayoutDocument`/its parsed document;
3. nested scene ordering comes from `serializeSceneDocument`/its parsed document;
4. array order is preserved;
5. no generated IDs, sorting, timestamps, or normalization beyond delegated codecs;
6. two-space indentation and one trailing newline;
7. `undefined` fields are never emitted;
8. parse → serialize → parse produces equivalent canonical documents;
9. validation and serialization never mutate input.

Implement canonical output from validated nested document values rather than embedding caller-owned objects. Prefer explicit object construction over relying on arbitrary input key order.

## Chopin fixture

Build the focused fixture in the test file with existing public data:

```ts
const project = createMuseumProject({
  id: 'project:chopin',
  name: 'Chopin Museum',
  layout: roomsToLayout(),
  scene: museumSceneDocument
});
```

The fixture must contain all seven compiled Chopin rooms and scene schema v6. Tests should use the fixture’s canonical JSON as a behavioral golden, but avoid storing a second large copy of `museum-scene.json` unless needed to catch ordering regressions.

## Test matrix

`project-codec.test.ts` must prove:

1. valid empty layout + valid empty v6 scene creates a project;
2. Chopin compiled layout + current scene v6 validates;
3. project JSON round-trips to equivalent canonical data;
4. canonical output is stable despite reordered input object keys;
5. layout and scene array ordering remains unchanged;
6. invalid or missing `formatVersion`, `id`, `name`, `layout`, or `scene` is rejected;
7. unknown root keys and partial nested documents are rejected;
8. malformed JSON returns one `invalid_json` issue;
9. invalid layout issues are reported under `$.layout...`;
10. invalid scene issues are reported under `$.scene...`;
11. scene v1–v5 input is accepted through the existing scene codec and canonicalized to v6;
12. invalid IDs, empty names, invalid envelope field types/nulls, and unsupported project versions are rejected;
13. caller input is unchanged after validate, create, serialize, and parse;
14. no project codec import reaches visitor/runtime modules.

Do not add UI tests. C1 owns open/export menus and filesystem/package integration.

## Scope boundaries

### In scope

- `MuseumProject` type;
- pure envelope validation;
- delegation and issue-path prefixing;
- deterministic canonical JSON;
- empty and Chopin-sized fixtures;
- unit tests.

### Deferred

- project open/save UI;
- `museum-project.json` download/import wiring;
- zip/folder packaging and binary asset manifests;
- project dirty state and shared undo history;
- project migration beyond format version 1;
- visitor/runtime project loading;
- `connectsRoomIds` portal semantics;
- multi-story buildings;
- `rooms.ts` deletion or cutover.

## Verification gate

Run:

```bash
npm run test -w @portfolio/museum -- --run src/lib/editor/project/project-codec.test.ts
npm run test -w @portfolio/museum -- --run src/lib/editor/layout
npm run check -w @portfolio/museum
```

Existing `npm run check` baseline diagnostics in `MuseumEntities.svelte` and `EditorViewport.svelte` must remain unchanged; no new C0 diagnostics are acceptable. Run the full museum test suite if focused tests pass.

C0 is complete when the project codec tests pass, A0/B0/A1 tests remain green, canonical Chopin project fixture round-trips, and `/museum` imports no editor/project module.

## Handoff to next slice

C0 is implemented. A2 may consume `MuseumProject` in memory but still owns first user-facing Plan/3D UI. C0 does not wire a second layout editor state or shared history stack.
