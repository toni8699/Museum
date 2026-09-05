import type { SceneDocument } from '$lib/content/scene';
import type { LayoutRoomRegistry } from '$lib/project/project-layout-semantics';
import type { Vec3 } from '$lib/types/scene';
import type { EditorDomain } from '../app/editor-view-state.svelte';
import type { EditorViewMode } from '../app/editor-view-mode';
import { resolveEditorPlacementScale } from '../scale-vector';
import { buildPlanSceneFootprintProjection } from './plan-scene-footprint';
import {
	captureLayoutPreviewSnapshot,
	deleteLayoutObject,
	type LayoutPreviewState
} from './layout-preview-state.svelte';
import {
	clearLayoutSelection,
	deriveArrangeTarget,
	type LayoutInteractionState
} from './layout-interaction';

/**
 * Structural store surface the Arrange Delete router needs. Kept structural
 * so the router never imports the store facade (cf. `layout-mutation-runner`).
 */
export interface ArrangeDeleteHost {
	readonly document: SceneDocument;
	readonly rooms: LayoutRoomRegistry;
	readonly selectedPlacementIds: readonly string[];
	readonly selectedClusterId: string | null;
	getPlacementScaleVector(id: string): Vec3 | null;
	beginLayoutTransaction(): boolean;
	commitLayoutTransaction(snapshot: unknown): boolean;
	cancelLayoutTransaction(): boolean;
	deleteSelection(): boolean;
	setStatusMessage(message: string | null): void;
}

/**
 * P21.2 — Row 2 Arrange Delete: owner-aware, one gesture = one tagged undo.
 *
 * Layout-object target → the layout pipeline (one `layout` history entry);
 * Scene target → the scene pipeline (one `scene` history entry). No
 * cross-owner mutation: the inactive slot's remembered selection is never
 * touched. Y preservation, read-only scale, and single-entry history are the
 * pipelines' own contracts — this router only picks the owner.
 */
export function deleteArrangeSelection(input: {
	store: ArrangeDeleteHost;
	layoutPreview: LayoutPreviewState;
	layoutInteraction: LayoutInteractionState;
	domain: EditorDomain;
	activeView: EditorViewMode;
}): boolean {
	const { store, layoutPreview, layoutInteraction, domain, activeView } = input;
	if (domain !== 'scene' || activeView !== 'plan') return false;
	if (layoutInteraction.planViewMode !== 'staging') return false;
	const eligibleLayoutObjectIds = new Set(
		layoutPreview.model.objects.filter((object) => !object.readonly).map((object) => object.objectId)
	);
	const eligibleSceneEntityIds = new Set(
		buildPlanSceneFootprintProjection(store.document, store.rooms, {
			getEffectiveScale: (entity) =>
				resolveEditorPlacementScale(entity.scale, store.getPlacementScaleVector(entity.id))
		}).footprints.map((footprint) => footprint.entityId)
	);
	const target = deriveArrangeTarget({
		lastOwner: layoutInteraction.arrangeOwner,
		layoutSelection: layoutInteraction.selection,
		selectedPlacementIds: store.selectedPlacementIds,
		selectedClusterId: store.selectedClusterId,
		eligibleLayoutObjectIds,
		eligibleSceneEntityIds
	});
	if (!target) {
		store.setStatusMessage('Nothing to delete in Arrange');
		return false;
	}
	if (target.owner === 'layout-object') {
		if (!store.beginLayoutTransaction()) {
			store.setStatusMessage('Finish the current layout interaction first');
			return false;
		}
		const result = deleteLayoutObject(layoutPreview, target.objectId);
		if (result.success) {
			store.commitLayoutTransaction(captureLayoutPreviewSnapshot(layoutPreview));
			clearLayoutSelection(layoutInteraction);
		} else {
			store.cancelLayoutTransaction();
		}
		store.setStatusMessage(result.success ? 'Deleted layout object' : result.message);
		return result.success;
	}
	if (store.selectedClusterId !== null) {
		store.setStatusMessage('Cluster selections are read-only in Plan.');
		return false;
	}
	const deleted = store.deleteSelection();
	if (!deleted) store.setStatusMessage('Not editable in Plan. Edit position in 3D.');
	return deleted;
}
