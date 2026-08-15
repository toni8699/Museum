# H1 S0 — Pin the Product/Session Contracts

**Date:** 2026-08-14
**Status:** Closed — codec/constructor/type seams landed in S0; the
session/shell contracts recorded as `it.todo` went green across S1/S2.
**Parent:** [`2026-08-14-graphics-h1-unified-3d-editing.md`](./2026-08-14-graphics-h1-unified-3d-editing.md)
**Next:** [`2026-08-14-graphics-h1-s1-editor-shell.md`](./2026-08-14-graphics-h1-s1-editor-shell.md)
**Handoff:** [`../../hand-off/CURRENT.md`](../../hand-off/CURRENT.md)

## Goal

Lock the contracts that every later slice builds against, as **failing tests
and types** rather than behavior:

1. a canonical empty project (`createEmptyMuseumProject`);
2. a session-only free camera (no persisted node until the first is authored);
3. boot-blank semantics (no New Project command, import = open, export = save);
4. view switching (Plan ↔ 3D) that preserves state and writes no history;
5. playback mutation locks;
6. `/museum` + `/museum/editor` relic isolation with no legacy session
   transition.

This slice ships no editor behavior. It pins the seams so S1 (shell) and S2
(boot into empty) implement against tests that already exist.

## Contracts

### Canonical empty project

```ts
createEmptyMuseumProject(input: { id: string; name: string }): MuseumProject;
```

```ts
// layout (LayoutDocument v3) — reuse createEmptyLayoutDocument()
{ formatVersion: 3, units: 'meters', floors: [], objects: [] }

// scene (MuseumSceneDocument v6)
{
  version: 6,
  textures: [],
  materials: [],
  entities: [],
  navigationNodes: [],
  connections: []
}

// project (MuseumProject v1)
{ formatVersion: 1, id, name, layout, scene }
```

- `validateMuseumProject(createEmptyMuseumProject(...)).success === true` — the
  project codec **must accept the authoring-empty state**. This is the likely
  breakage: scene/layout validation today may assume at least one room or one
  navigation node. If so, loosen the validator (an empty document is valid for
  authoring) without weakening any existing non-empty guarantees.
- Serialize → parse round-trips byte-stable (`canonicalJson`), so export/import
  of a blank project is well-defined.

### Session-only free camera

- The editor holds a session-only free `PerspectiveCamera` until the user
  authors the first navigation node. Nothing is written to
  `scene.navigationNodes` / `scene.connections` on boot.
- Visitor/tour preview stays unavailable until its existing runtime
  prerequisites are satisfied (at least one valid node/route), so a blank
  project cannot start a broken tour.

### Boot blank, import to open, export to save

- There is no New Project command. The editor boots into the empty project on
  every load.
- **Import** is the only way to load prior work: complete, cross-valid H1-format
  projects only; atomic replacement; clears history/selection; rejects
  legacy/Chopin payloads without touching the current session.
- **Export** is the only save: the portable package (project + assets) is the
  persistence unit. Account/session save is a later layer on the same format,
  not a schema change.

### View switching

- `EditorViewMode = 'plan' | '3d'` (defined with S1). Switching preserves both
  documents, selection where valid, history, dirty baselines, asset bytes, and
  camera preview state. It creates no history entry.

### Playback mutation locks

- While camera playback (director or visitor preview) is active, document
  mutation, workspace/view switching, and framing edits are blocked. The
  existing `isDocumentMutationBlocked` / `isDocumentTransactionActive` /
  `isCameraFramingMutationBlocked` flags are the contract; pin them with tests
  rather than re-implementing them.

### Relic isolation

- `/museum` = frozen Chopin visitor; `/museum/editor` = frozen pre-H1
  Scene · Camera editor. H1 never imports, migrates, or preserves Chopin
  project, editor session, selection, or history.
- There is **no legacy session transition contract** — the H1 editor does not
  adopt state from the pre-H1 shell.

## Current state

| Concern | Today |
|---|---|
| Empty layout | `createEmptyLayoutDocument()` already exists in `layout-codec.ts` (v3, empty floors/objects) |
| Empty scene | `createEmptySceneDocument()` added in `scene.ts` (S0) — v6, all arrays empty |
| Empty project | `createEmptyMuseumProject()` added in `project-codec.ts` (S0) — composes empty layout + empty scene |
| Codec | `validateMuseumProject` now accepts a fully-empty document; `empty_navigation` loosened in `scene-codec/validate.ts` |
| Boot | Editor currently loads the checked-in Chopin project, not an empty project |
| Camera | Editor uses the Chopin scene's navigation graph; no session-only free-camera boot path |
| Playback locks | Already implemented in `museum-editor.svelte.ts` / `controller-hosts.ts` |
| Relic | `/museum/editor` (relic) and `/museum` (visitor) exist; S1 wired `/` and `/editor` to the H1 shell (`H1EditorApp`) while the relic keeps mounting the legacy `MuseumEditorApp` |

## Implementation steps

### 0. Pin the contract types

- Add `createEmptySceneDocument(): MuseumSceneDocument` (v6, all arrays empty)
  and `createEmptyMuseumProject(input): MuseumProject` **signatures** with
  JSDoc contracts, plus the `EditorViewMode` type. Stub the implementations to
  throw until S2 (or land the trivial constructors now — see step 3).

### 1. Failing tests — empty project

- `createEmptyMuseumProject` produces codec-valid empty layout + scene.
- `validateMuseumProject(...).success === true`; serialize→parse round-trips.
- Empty document has zero rooms, zero objects, zero entities, zero
  navigation nodes, zero connections.

### 2. Failing tests — session camera

- Booting the editor (once S2 wires it) leaves `navigationNodes` empty and
  uses a session-only free camera; no fake node/endpoint is persisted.
- Visitor/tour preview is unavailable on a blank project.

### 3. Make the codec accept authoring-empty

- If any validator rejects an empty document, loosen exactly that check
  (e.g. "at least one room" / "at least one navigation node") for the
  authoring-empty case, keeping all non-empty invariants intact.

### 4. Failing tests — view switch + playback locks

- Plan ↔ 3D preserves document/history/dirty/selection and writes no history
  entry (store-level test; the shell that satisfies it lands in S1).
- Mutations and view switches are rejected during camera playback; framing
  edits are blocked during director framing.

### 5. Failing tests — relic isolation

- Route-level guard: `/museum/editor` renders the legacy shell, `/` + `/editor`
  render the H1 shell, and no code path migrates Chopin/legacy editor state.
- (S1 step 0 turns this into the live relic smoke test.)

### 6. Write the GLB/package sub-plan pointer

- Create `docs/plans/2026-08-14-graphics-h1-s9-asset-package.md` as a scoped
  stub with the manifest/security questions S9 must answer, so the portable
  package manifest is not changed ad hoc later. S9 fills it in.

## Regression matrix

| Concern | Required assertion |
|---|---|
| Empty project | `createEmptyMuseumProject` is codec-valid, round-trips, and is fully empty |
| Authoring-empty | `validateMuseumProject` accepts zero rooms / zero nodes without weakening non-empty validation |
| Session camera | Boot persists no navigation node; preview unavailable until a valid route exists |
| Import | Rejects legacy/Chopin payload atomically; clears history/selection; boots empty otherwise |
| View switch | Plan ↔ 3D preserves state; no history entry |
| Playback locks | Mutation/view-switch/framing blocked during playback |
| Relic isolation | `/museum` + `/museum/editor` stay frozen; H1 never migrates Chopin/legacy state |

## Non-goals

- Implementing the H1 shell (S1), the boot-into-empty editor (S2), or any
  Plan/3D behavior beyond the contract tests.
- Account/session persistence (future; export is the only save in H1).
- Changing the portable package manifest before S9's sub-plan exists.

## Verification

```text
npm test -w @portfolio/museum
npm run check -w @portfolio/museum
```

The constructor/codec/type contract tests are green now
(`tests/lib/editor/h1/contracts.test.ts`). The session/shell contracts (boot
blank, preview lockout, view-switch preservation, playback locks, relic
isolation) are recorded as `it.todo` there — S1/S2 turn them green. S0 is
**closed together with S1/S2**; it records the seams without failing CI in the
meantime.
