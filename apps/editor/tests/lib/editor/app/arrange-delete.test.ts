import { describe, expect, it } from 'vitest';

import { createEmptySceneDocument, type SceneDocument } from '$lib/content/scene';
import { serializeSceneDocument } from '$lib/content/scene-codec';
import { createEditorStore } from '$lib/editor/editor-store.svelte';
import { deleteArrangeSelection } from '$lib/editor/layout/arrange-delete';
import {
	captureLayoutPreviewSnapshot,
	commitLayoutDraftRoom,
	commitLayoutObject,
	createEmptyLayoutPreviewState,
	restoreLayoutPreviewSnapshot
} from '$lib/editor/layout/layout-preview-state.svelte';
import {
	createLayoutInteractionState,
	setPlanViewMode
} from '$lib/editor/layout/layout-interaction';
import { serializeLayoutDocument } from '$lib/layout/layout-codec';
import { createLayoutRoomRegistry } from '$lib/project/project-layout-semantics';

function draftRoom(state: ReturnType<typeof createEmptyLayoutPreviewState>): string {
	const result = commitLayoutDraftRoom(state, [[0, 0], [4, 0], [4, 3], [0, 3]]);
	if (!result.success) throw new Error(`draft room failed: ${result.message}`);
	return result.roomId;
}

function sceneWithChair(roomId: string): SceneDocument {
	return {
		entities: [{
			id: 'chair', kind: 'primitive', primitive: 'box', name: 'Chair', roomId,
			position: [2, 1.25, 4], rotation: [0.2, 0.3, -0.4],
			dimensions: { width: 1, height: 1, depth: 1 },
			materialId: 'wood-walnut', castShadow: true, receiveShadow: true
		}],
		materials: [], textures: [], navigationNodes: [], connections: []
	};
}

function registerLayoutHistory(
	store: ReturnType<typeof createEditorStore>,
	layoutPreview: ReturnType<typeof createEmptyLayoutPreviewState>
): void {
	store.registerLayoutHistory({
		capture: () => captureLayoutPreviewSnapshot(layoutPreview),
		replace: (snapshot) =>
			restoreLayoutPreviewSnapshot(
				layoutPreview,
				snapshot as ReturnType<typeof captureLayoutPreviewSnapshot>
			),
		matches: (a, b) =>
			JSON.stringify((a as { project: { layout: unknown } }).project.layout) ===
			JSON.stringify((b as { project: { layout: unknown } }).project.layout)
	});
}

function stagingInteraction() {
	const layoutInteraction = createLayoutInteractionState();
	setPlanViewMode(layoutInteraction, 'staging');
	return layoutInteraction;
}

describe('deleteArrangeSelection (P21.2 Row 2 Arrange Delete)', () => {
	it('deletes the Layout-object target as exactly one layout-tagged undo entry', () => {
		const layoutPreview = createEmptyLayoutPreviewState();
		const roomId = draftRoom(layoutPreview);
		const placed = commitLayoutObject(layoutPreview, 'box', [1, 0.5, 1], roomId);
		expect(placed.success).toBe(true);
		if (!placed.success) throw new Error('layout object setup failed');
		const objectId = placed.objectId;

		const store = createEditorStore({
			document: createEmptySceneDocument(),
			rooms: createLayoutRoomRegistry(layoutPreview.project.layout)
		});
		registerLayoutHistory(store, layoutPreview);
		const layoutInteraction = stagingInteraction();
		layoutInteraction.selection = { kind: 'object', objectId };
		layoutInteraction.arrangeOwner = 'layout-object';

		const sceneBefore = serializeSceneDocument(store.document);
		const historyBefore = store.historyVersion;

		expect(
			deleteArrangeSelection({ store, layoutPreview, layoutInteraction, domain: 'scene', activeView: 'plan' })
		).toBe(true);
		expect(layoutPreview.project.layout.objects).toEqual([]);
		expect(serializeSceneDocument(store.document)).toBe(sceneBefore);
		expect(store.historyVersion).toBe(historyBefore + 1);

		// Tagged `layout`: undo restores the object while the scene stays clean.
		expect(store.undo()).toBe(true);
		expect(layoutPreview.project.layout.objects.map((object) => object.id)).toEqual([objectId]);
		expect(serializeSceneDocument(store.document)).toBe(sceneBefore);
	});

	it('deletes the Scene-entity target as exactly one scene-tagged undo entry', () => {
		const layoutPreview = createEmptyLayoutPreviewState();
		const roomId = draftRoom(layoutPreview);
		const store = createEditorStore({
			document: sceneWithChair(roomId),
			rooms: createLayoutRoomRegistry(layoutPreview.project.layout)
		});
		registerLayoutHistory(store, layoutPreview);
		const layoutInteraction = stagingInteraction();
		layoutInteraction.arrangeOwner = 'scene';
		expect(store.selectionActions.selectPlacement('chair')).toBe(true);

		const layoutBefore = serializeLayoutDocument(layoutPreview.project.layout);
		const historyBefore = store.historyVersion;

		expect(
			deleteArrangeSelection({ store, layoutPreview, layoutInteraction, domain: 'scene', activeView: 'plan' })
		).toBe(true);
		expect(store.document.entities).toEqual([]);
		expect(serializeLayoutDocument(layoutPreview.project.layout)).toBe(layoutBefore);
		expect(store.historyVersion).toBe(historyBefore + 1);

		// Tagged `scene`: undo restores the entity while the layout stays clean.
		expect(store.undo()).toBe(true);
		expect(store.document.entities.map((entity) => entity.id)).toEqual(['chair']);
		expect(serializeLayoutDocument(layoutPreview.project.layout)).toBe(layoutBefore);
	});
});
