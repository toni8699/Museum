/**
 * Shared test fixtures + store factory used by every themed test suite
 * (`museum-editor-selection.test.ts` /
 * `museum-editor-placement.test.ts` /
 * `museum-editor-camera.test.ts` /
 * `museum-editor-textures.test.ts`).
 *
 * Slice 4 of the Priority-1 file-split refactor pulls these helpers out of
 * the 4 350-LOC `museum-editor.test.ts` mega-suite so each new themed suite
 * gets the same authoring baseline without dragging the god-file class
 * along. Per-describe local helpers (e.g. `translateTransform`,
 * `importWithViewKeys`, `makeHistory`) stay in their describing blocks —
 * the plan deliberately freezes the move scope at "shared fixtures only"
 * because each describe's local helpers are typed against the specific
 * describe body's needs.
 */
import { cloneFixtureDocument } from '../content/__fixtures__/load-fixture-scene';
import { createMuseumEditorStore, type MuseumEditorStore, type MuseumSceneDocument } from '$lib/editor/museum-editor.svelte';

/** Stable tour ordering the integration suite asserts against after edit. */
export const FIXTURE_GUIDED_ORDER = ['tour-a', 'tour-b', 'tour-paris', 'tour-d'] as const;

/**
 * Clone the checked-in fixture and pad it to at least `minCount` entities
 * (offsets each added entity by 0.5 m on world-X). Used by selection /
 * cluster / placement describes that need predictable multi-entity state.
 */
export function cloneFixtureDocumentWithEntityCount(minCount: number): MuseumSceneDocument {
	const document = cloneFixtureDocument();
	const template = document.entities[0]!;
	while (document.entities.length < minCount) {
		const index = document.entities.length;
		document.entities.push({
			...template,
			id: `fixture-entity-${index}`,
			name: `Fixture Entity ${index}`,
			position: [
				template.position[0] + index * 0.5,
				template.position[1],
				template.position[2]
			] as typeof template.position,
			rotation: [...template.rotation] as typeof template.rotation
		});
	}
	return document;
}

/** Build a `MuseumEditorStore` from the cloned fixture (optionally padded). */
export function createFixtureEditorStore(entityCount?: number): MuseumEditorStore {
	const document = entityCount
		? cloneFixtureDocumentWithEntityCount(entityCount)
		: cloneFixtureDocument();
	return createMuseumEditorStore({ document });
}
