/**
 * `cloneMuseumSceneDocument` — deep-clone a scene document so the editor's
 * session never mutates the checked-in JSON singleton.
 *
 * Slice 3 of the Priority-1 file-split refactor extracts this helper from
 * `museum-editor.svelte.ts` so future controllers can deep-clone documents
 * without dragging the god-file class along. The facade re-exports the
 * function from this module to keep the 40 consumer imports (`import {
 * cloneMuseumSceneDocument } from '$lib/editor/museum-editor.svelte';`)
 * working unchanged.
 *
 * **Why JSON-clone?** The schema is a JSON-compatible object (no Maps,
 * Sets, Dates). A `JSON.parse(JSON.stringify(...))` round-trip is the
 * cheapest safe deep-clone; replacing it with a hand-rolled recursive walker
 * would buy us nothing here and force every test fixture to maintain a
 * parallel in-memory schema.
 */
import type { MuseumSceneDocument } from '$lib/content/scene';

export function cloneMuseumSceneDocument(
	document: MuseumSceneDocument
): MuseumSceneDocument {
	return JSON.parse(JSON.stringify(document)) as MuseumSceneDocument;
}
