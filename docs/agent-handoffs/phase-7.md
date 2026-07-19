# Phase 7 Handoff — Scene Codec, Browser Export, and Dirty Guards

## Project Snapshot

This repository is an npm-workspaces monorepo. Its only active product is
`@portfolio/museum`: a SvelteKit + Threlte interactive Chopin museum.

- Visitor route: `/museum`
- Development-only editor route: `/dev/museum-editor`
- Canonical build-time scene source: `apps/museum/src/lib/content/museum-scene.json`
- Visitor scene resolver: `apps/museum/src/lib/content/scene.ts`
- Dev editor store: `apps/museum/src/lib/editor/museum-editor.svelte.ts`

The visitor and editor both consume the same scene-document schema. The editor
never writes to the repository from the browser. Its Download/Copy controls are
an authoring handoff: replace the checked-in JSON manually, then test, build,
commit, and deploy.

## Phase Result

Phase 7 adds strict scene-document validation plus browser-only persistence
tools to the dev editor.

- `scene-codec.ts` is the **only** validation boundary. It exposes
  `parseSceneDocumentJson`, `validateSceneDocument`, and
  `serializeSceneDocument`.
- `resolveSceneDocument()` delegates to that codec and throws a structured
  `SceneDocumentValidationError` with the first `{ path, code, message }`
  issue. Do not add another resolver-specific validator.
- The codec accepts strict v1 JSON only: unknown properties, missing required
  fields, `null` optionals, invalid types, and non-finite internal values fail.
- Canonical JSON is two-space indented with a trailing newline; it uses fixed
  schema field order while preserving all authored array order. Numeric values
  are preserved, but JSON spelling is naturally canonicalized (`1.0` → `1`,
  `-0` → `0`).
- Current editor validation is reactive. Invalid in-memory state remains visible
  for recovery, blocks Copy/Download, and can be escaped through Undo or Reset.
- Valid import is staged and parsed **before** any discard confirmation. A bad
  import never changes document, history, selection, preview, baseline, or
  dirty state.
- Import establishes its document as a clean baseline. Reset always restores
  the checked-in scene, not the most recently imported scene, and establishes a
  new checked-in clean baseline.
- Copy and Download never clear dirty. There is intentionally no `localStorage`
  or autosave.

## Scene Validity Contract

All Phase 7 validation results are errors. There are no warnings yet.

Structural checks cover strict root/nested keys, required fields, room IDs,
asset IDs, fallback kinds, finite `Vec3` values, positive scalar placement
scale, and positive connection clearance. Placement fallbacks are authored
snapshots: they must be valid fallback kinds but do **not** need to match the
current asset manifest fallback.

Semantic checks cover:

- non-empty IDs, node labels, and trimmed cluster names;
- unique placement/node/connection/cluster IDs;
- clusters with at least two unique existing same-room placements, with no
  overlapping cluster membership;
- no self or duplicate undirected connections;
- node adjacency exactly matching undirected connection edges;
- an undirected connected graph (one-node graph is valid);
- multi-node `nextNodeId`/`previousNodeId` links that are adjacent, reciprocal,
  non-self, and form one cycle containing every node exactly once;
- camera position and target farther than `1e-6` apart.

The editor selects `paris-seat` as its initial state when available; valid
imported scenes without that node start at their first node. The visitor’s
checked-in scene still uses its normal authored `entrance-start` state.

## Editor Browser Contract

`MuseumEditorApp.svelte` provides a Scene JSON panel with file import, pasted
JSON import, Copy JSON, Download, Reset to checked-in scene, dirty status, and
path-addressed validation errors.

- File-picker cancellation is silent. File-read and Clipboard API failures only
  report a status message.
- Failed pasted JSON remains in the textarea; successful pasted import clears
  it.
- Download creates a JSON Blob, clicks a temporary anchor, removes it, and
  revokes its object URL on the next task.
- Valid Import and Reset use the shared discard confirmation when dirty.
- In-app SvelteKit navigation uses the same confirmation. Reload/tab close and
  document-leaving navigation rely only on the native `beforeunload` prompt to
  avoid duplicate dialogs.
- Successful import/reset stops and restores camera preview first, cancels a
  live TransformControls transaction, cancels pending placement/framing,
  clears selection, clears history, rebuilds runtime graph/state, and finally
  establishes the baseline.

All browser APIs are confined to client event/effect paths. The dev-only editor
continues to be isolated by `vite/museum-editor-entry-plugin.ts`; production
uses `MuseumEditorStub.svelte`, and `/dev/museum-editor` remains unavailable in
production.

## Important Architecture Boundaries

Keep the following ownership model intact:

| Concern | Owner |
| --- | --- |
| Scene document / runtime resolution | `content/scene.ts` + `content/scene-codec.ts` |
| Checked-in persistent scene | `content/museum-scene.json` |
| Rooms, poses, openings, dimensions | `content/rooms.ts` |
| Asset manifest/provenance/defaults | `content/assets.ts` |
| Editor session/history/import baseline | `editor/museum-editor.svelte.ts` |
| Browser import/export/dirty navigation UX | `editor/MuseumEditorApp.svelte` |
| Camera route traversal | `museum/navigation/camera-route.ts` |
| Guided-tour FSM | `state/museum-state.svelte.ts` |

Do not import editor modules into visitor code. Do not make the browser editor
write project files. Do not introduce a second scene parser or a parallel
navigation graph. Runtime connection endpoints remain resolver-owned; only
interior waypoints are persisted.

## Verification Status

Phase 7 verification completed successfully:

- `npm test -w @portfolio/museum` — 16 files, 180 tests passed
- `npm run check -w @portfolio/museum` — 0 errors, 0 warnings
- `npm run build -w @portfolio/museum` — passed

The build still emits existing third-party unused-import and large-chunk
warnings. The production output retains a tiny dev-editor route shell rather
than bundling the actual editor.

Key test coverage:

- `scene-codec.test.ts`: canonical serialization, malformed JSON, strict
  unknown/null fields, graph/pose/cluster blockers, split guided cycles.
- `scene.test.ts`: resolver uses codec while preserving scene/runtime behavior.
- `museum-editor.test.ts`: canonical dirty baseline, undo, import/reset, and
  atomic invalid import behavior.

## Manual Acceptance Still Worth Doing

1. Run `npm run dev`, open `/dev/museum-editor`, edit a Paris object or camera
   pose, and confirm the Scene JSON badge changes to **Unsaved**.
2. Copy or download the JSON; confirm it remains Unsaved.
3. Paste/import the exported JSON; confirm the editor becomes **Saved** and
   pasted text clears.
4. Make another edit, try malformed pasted JSON, and confirm no discard dialog
   appears and the current edit survives.
5. With a dirty edit, test Reset, `/museum` navigation, and browser reload;
   decline each prompt once and confirm no state is lost.
6. With a dirty edit, import a valid JSON document, accept discard, and confirm
   preview/selection/history are reset without camera-orbit drift.
7. Replace `museum-scene.json` manually with an exported file, then run test
   and build before committing/deploying. Verify `/museum` reflects placements
   and camera-node changes.

## Next Work

Phase 8 is broader architecture documentation. A future real publishing system
is a separate product decision:

- For local development, a trusted CLI or dev-server endpoint could validate a
  selected export and write `museum-scene.json`; it must remain outside the
  browser-only editor contract.
- For hosted live publishing, move the document to an authenticated backend
  with draft/published versions, rollback, a publish API, and visitor runtime
  loading/caching. Do not bolt filesystem writes into the browser editor.

No commits were created in this phase.
