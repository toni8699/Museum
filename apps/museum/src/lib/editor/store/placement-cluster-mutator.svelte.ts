/**
 * `EditorPlacementClusterMutator` — placement / cluster / asset-drop mutation
 * controller (Phase 9.5).
 *
 * The god file (`museum-editor.svelte.ts`) historically owned placement
 * transforms, cluster CRUD/membership, multi-select duplicate/delete, pending
 * asset placement, and drop-to-floor. Phase 9.5 hard-moves those method bodies
 * here, following the `EditorNavigationGraphMutator` + host-injection pattern.
 *
 * `MuseumEditorStore` keeps identical public method signatures as thin
 * delegates, so components keep importing the store facade unchanged.
 *
 * Everything the composition root still owns — mutation guards, document /
 * history transaction wrappers, selection reducer access, status channel,
 * pending-frame channel, session drop request — is reached through the injected
 * `EditorPlacementClusterMutatorHost`. The mutator never touches the document
 * store or history controller directly.
 */

import { getAssetById, resolveAssetFallback } from '$lib/content/assets';
import { isMaterialId } from '$lib/content/materials';
import type {
	MuseumSceneDocument,
	SceneEntity,
	SceneLightEntity,
	SceneLightKind,
	SceneModelEntity,
	SceneObjectCluster,
	ScenePrimitiveDimensions,
	ScenePrimitiveEntity,
	ScenePrimitiveKind
} from '$lib/content/scene';
import { isUniformVector } from '../scale-vector';
import {
	cloneSceneEntity,
	isSceneLightEntity,
	isScenePrimitiveEntity
} from '$lib/content/scene';
import type { MaterialId } from '$lib/types/materials';
import type { MuseumRoomId, Vec3 } from '$lib/types/museum';
import { reserveEntityId } from '../editor-assets';
import {
	applyLightFieldPatch,
	createLightEntity,
	DEFAULT_LIGHT_HEIGHT,
	lightDisplayName,
	type LightFieldPatch
} from '../editor-lights';
import {
	createPrimitiveEntity,
	normalizePrimitiveDimensions,
	primitiveDisplayName,
	validatePrimitiveDimensions
} from '../editor-primitives';
import {
	type PlacementTransform,
	writePlacementTransform
} from '../editor-transform';
import type { EditorSelectionActions } from './selection-actions.svelte';

/**
 * Composition-root surface the placement/cluster mutator depends on. Everything
 * here stays owned by `MuseumEditorStore`; the mutator never mutates the
 * document store or history controller directly, only through the transaction
 * wrappers and accessors exposed below.
 */
export interface EditorPlacementClusterMutatorHost {
	// Mutation guards.
	readonly isDocumentMutationBlocked: boolean;
	readonly isEditorInteractionActive: boolean;

	// Document + selection state.
	readonly document: MuseumSceneDocument;
	readonly selectedRoomId: MuseumRoomId | null;
	readonly selectedPlacementIds: string[];
	readonly primaryPlacementId: string | null;
	readonly clusters: SceneObjectCluster[];

	selectedClusterId: string | null;
	pendingPlacementAssetId: string | null;
	pendingPlacementPrimitiveKind: ScenePrimitiveKind | null;
	pendingPlacementLightKind: SceneLightKind | null;

	// Status + session glue.
	setStatusMessage(message: string | null): void;
	setNavigationHover(connectionId: string | null, anchorId?: string | null): void;
	cancelPendingNavigation(message?: string): boolean;
	requestPlacementFrame(ids: string[]): boolean;
	/** Session drop request — not the public mutator entry. */
	sessionRequestDropToFloor(): void;
	/**
	 * Phase 1a follow-up — stash the active placement's per-axis scale vector
	 * in editor-session memory. Schema v6 only carries a scalar, so the
	 * inspector reads this Map to know whether to render X/Y/Z or a single
	 * Scale field. Pass `null` to clear (uniform mode after commit).
	 */
	setPlacementScaleVector(id: string, vector: Vec3 | null): void;

	// Document transaction wrappers (guard-aware).
	beginDocumentTransaction(): boolean;
	commitDocumentTransaction(): boolean;
	cancelDocumentTransaction(): boolean;
}

export class EditorPlacementClusterMutator {
	constructor(
		private readonly selectionActions: EditorSelectionActions,
		private readonly host: EditorPlacementClusterMutatorHost
	) {}

	// ===================================================================
	// Selectability + asset placement
	// ===================================================================

	isPlacementSelectable(id: string) {
		if (!this.host.selectedRoomId) return false;
		return this.host.document.entities.some(
			(object) => object.id === id && object.roomId === this.host.selectedRoomId
		);
	}

	beginAssetPlacement(assetId: string) {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) {
			return false;
		}
		const asset = getAssetById(assetId);
		if (!asset) {
			this.cancelAssetPlacement();
			this.host.setStatusMessage(`Unknown museum asset: ${assetId}`);
			return false;
		}
		if (asset.placementSurface !== 'floor') {
			this.host.setStatusMessage(
				`${asset.name} requires ${asset.placementSurface} placement`
			);
			return false;
		}
		try {
			resolveAssetFallback(asset);
		} catch (error) {
			this.cancelAssetPlacement();
			this.host.setStatusMessage(
				error instanceof Error ? error.message : 'Invalid asset fallback'
			);
			return false;
		}

		this.host.cancelPendingNavigation();
		this.host.pendingPlacementPrimitiveKind = null;
		this.host.pendingPlacementLightKind = null;
		this.selectionActions.selectRoom('paris');
		this.host.pendingPlacementAssetId = asset.id;
		this.host.setNavigationHover(null);
		this.host.setStatusMessage(`Click the Paris floor to place ${asset.name}`);
		return true;
	}

	cancelAssetPlacement(message?: string) {
		if (this.host.isDocumentMutationBlocked) return false;
		const changed =
			this.host.pendingPlacementAssetId !== null ||
			this.host.pendingPlacementPrimitiveKind !== null ||
			this.host.pendingPlacementLightKind !== null;
		this.host.pendingPlacementAssetId = null;
		this.host.pendingPlacementPrimitiveKind = null;
		this.host.pendingPlacementLightKind = null;
		if (message) this.host.setStatusMessage(message);
		return changed;
	}

	beginPrimitivePlacement(kind: ScenePrimitiveKind) {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) {
			return false;
		}
		this.host.cancelPendingNavigation();
		this.host.pendingPlacementAssetId = null;
		this.host.pendingPlacementLightKind = null;
		this.host.pendingPlacementPrimitiveKind = kind;
		this.host.setNavigationHover(null);
		this.host.setStatusMessage(
			`Click a tagged museum-room floor to place ${primitiveDisplayName(kind)}`
		);
		return true;
	}

	cancelPrimitivePlacement(message?: string) {
		return this.cancelAssetPlacement(message);
	}

	beginLightPlacement(kind: SceneLightKind) {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) {
			return false;
		}
		this.host.cancelPendingNavigation();
		this.host.pendingPlacementAssetId = null;
		this.host.pendingPlacementPrimitiveKind = null;
		this.host.pendingPlacementLightKind = kind;
		this.host.setNavigationHover(null);
		this.host.setStatusMessage(
			`Click a tagged museum-room floor to place ${lightDisplayName(kind)}`
		);
		return true;
	}

	cancelLightPlacement(message?: string) {
		return this.cancelAssetPlacement(message);
	}

	createPendingPlacementAt(position: Vec3) {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) {
			return null;
		}
		const assetId = this.host.pendingPlacementAssetId;
		if (!assetId) return null;
		const asset = getAssetById(assetId);
		if (!asset || asset.placementSurface !== 'floor') {
			this.cancelAssetPlacement(
				'Pending asset is no longer available for floor placement'
			);
			return null;
		}

		let fallback;
		try {
			fallback = resolveAssetFallback(asset);
		} catch (error) {
			this.cancelAssetPlacement(
				error instanceof Error ? error.message : 'Pending asset has no valid fallback'
			);
			return null;
		}

		const reservedIds = new Set(this.host.document.entities.map((object) => object.id));
		const id = reserveEntityId(`${asset.id}-placement`, reservedIds);
		const placement: SceneModelEntity = {
			kind: 'model',
			id,
			name: asset.name,
			roomId: 'paris',
			assetId: asset.id,
			fallback,
			position: [...position],
			rotation: [0, 0, 0]
		};

		if (!this.host.beginDocumentTransaction()) return null;
		this.host.document.entities.push(placement);
		if (!this.host.commitDocumentTransaction()) return null;

		this.host.pendingPlacementAssetId = null;
		this.selectionActions.selectPlacement(id);
		this.host.setStatusMessage(`Placed ${asset.name}`);
		return id;
	}

	createPendingPrimitiveAt(roomId: MuseumRoomId, position: Vec3) {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) {
			return null;
		}
		const kind = this.host.pendingPlacementPrimitiveKind;
		if (!kind) return null;

		const reservedIds = new Set(this.host.document.entities.map((object) => object.id));
		const id = reserveEntityId(`${kind}-placement`, reservedIds);
		const placement = createPrimitiveEntity({
			id,
			kind,
			roomId,
			position
		});

		if (!this.host.beginDocumentTransaction()) return null;
		this.host.document.entities.push(placement);
		if (!this.host.commitDocumentTransaction()) return null;

		this.host.pendingPlacementPrimitiveKind = null;
		this.selectionActions.selectPlacementFromTree(id, { focus: false });
		this.host.setStatusMessage(`Placed ${placement.name}`);
		return id;
	}

	updatePrimitiveName(id: string, name: string) {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) {
			return false;
		}
		const nextName = name.trim();
		if (!nextName) {
			this.host.setStatusMessage('Primitive name cannot be empty');
			return false;
		}
		const entity = this.findPrimitive(id);
		if (!entity || entity.name === nextName) return false;
		if (!this.host.beginDocumentTransaction()) return false;
		entity.name = nextName;
		return this.host.commitDocumentTransaction();
	}

	updatePrimitiveDimensions(id: string, dimensions: ScenePrimitiveDimensions) {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) {
			return false;
		}
		const entity = this.findPrimitive(id);
		if (!entity) return false;
		const next = normalizePrimitiveDimensions(entity.primitive, dimensions);
		if (!next) {
			this.host.setStatusMessage(
				validatePrimitiveDimensions(entity.primitive, dimensions) ??
					'Invalid primitive dimensions'
			);
			return false;
		}
		if (!this.host.beginDocumentTransaction()) return false;
		entity.dimensions = next as typeof entity.dimensions;
		return this.host.commitDocumentTransaction();
	}

	updatePrimitiveMaterial(id: string, materialId: MaterialId | string) {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) {
			return false;
		}
		if (!isMaterialId(materialId)) {
			this.host.setStatusMessage(`Unknown museum material: ${materialId}`);
			return false;
		}
		const entity = this.findPrimitive(id);
		if (!entity || entity.materialId === materialId) return false;
		if (!this.host.beginDocumentTransaction()) return false;
		entity.materialId = materialId;
		return this.host.commitDocumentTransaction();
	}

	updatePrimitiveShadows(
		id: string,
		shadows: { castShadow?: boolean; receiveShadow?: boolean }
	) {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) {
			return false;
		}
		const entity = this.findPrimitive(id);
		if (!entity) return false;
		const nextCast = shadows.castShadow ?? entity.castShadow;
		const nextReceive = shadows.receiveShadow ?? entity.receiveShadow;
		if (entity.castShadow === nextCast && entity.receiveShadow === nextReceive) {
			return false;
		}
		if (!this.host.beginDocumentTransaction()) return false;
		entity.castShadow = nextCast;
		entity.receiveShadow = nextReceive;
		return this.host.commitDocumentTransaction();
	}

	private findPrimitive(id: string): ScenePrimitiveEntity | undefined {
		const entity = this.host.document.entities.find((candidate) => candidate.id === id);
		return entity && isScenePrimitiveEntity(entity) ? entity : undefined;
	}

	createPendingLightAt(roomId: MuseumRoomId, position: Vec3) {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) {
			return null;
		}
		const kind = this.host.pendingPlacementLightKind;
		if (!kind) return null;

		const reservedIds = new Set(this.host.document.entities.map((object) => object.id));
		const id = reserveEntityId(`${kind}-light-placement`, reservedIds);
		const placement = createLightEntity({
			id,
			kind,
			roomId,
			position: [position[0], DEFAULT_LIGHT_HEIGHT, position[2]]
		});

		if (!this.host.beginDocumentTransaction()) return null;
		this.host.document.entities.push(placement);
		if (!this.host.commitDocumentTransaction()) return null;

		this.host.pendingPlacementLightKind = null;
		this.selectionActions.selectPlacementFromTree(id, { focus: false });
		this.host.setStatusMessage(`Placed ${placement.name}`);
		return id;
	}

	updateLightName(id: string, name: string) {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) {
			return false;
		}
		const nextName = name.trim();
		if (!nextName) {
			this.host.setStatusMessage('Light name cannot be empty');
			return false;
		}
		const entity = this.findLight(id);
		if (!entity || entity.name === nextName) return false;
		if (!this.host.beginDocumentTransaction()) return false;
		entity.name = nextName;
		return this.host.commitDocumentTransaction();
	}

	updateLightFields(id: string, patch: LightFieldPatch) {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) {
			return false;
		}
		const entity = this.findLight(id);
		if (!entity) return false;
		if (
			patch.color === undefined &&
			patch.intensity === undefined &&
			patch.range === undefined &&
			patch.angle === undefined &&
			patch.penumbra === undefined &&
			patch.castShadow === undefined
		) {
			return false;
		}

		const probe = cloneSceneEntity(entity);
		if (!isSceneLightEntity(probe)) return false;
		const error = applyLightFieldPatch(probe, patch);
		if (error) {
			this.host.setStatusMessage(error);
			return false;
		}

		const same =
			probe.color === entity.color &&
			probe.intensity === entity.intensity &&
			probe.castShadow === entity.castShadow &&
			((entity.light === 'directional' && probe.light === 'directional') ||
				(entity.light === 'point' &&
					probe.light === 'point' &&
					probe.range === entity.range) ||
				(entity.light === 'spot' &&
					probe.light === 'spot' &&
					probe.range === entity.range &&
					probe.angle === entity.angle &&
					probe.penumbra === entity.penumbra));
		if (same) return false;

		if (!this.host.beginDocumentTransaction()) return false;
		const applyError = applyLightFieldPatch(entity, patch);
		if (applyError) {
			this.host.cancelDocumentTransaction();
			this.host.setStatusMessage(applyError);
			return false;
		}
		return this.host.commitDocumentTransaction();
	}

	private findLight(id: string): SceneLightEntity | undefined {
		const entity = this.host.document.entities.find((candidate) => candidate.id === id);
		return entity && isSceneLightEntity(entity) ? entity : undefined;
	}

	requestDropToFloor() {
		if (this.host.isDocumentMutationBlocked) return;
		if (this.host.selectedPlacementIds.length === 0) {
			this.host.setStatusMessage('Select a placement to drop to floor');
			return;
		}
		this.host.sessionRequestDropToFloor();
	}

	// ===================================================================
	// Cluster CRUD / membership
	// ===================================================================

	createCluster(name?: string) {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) {
			return null;
		}
		const memberIds = [...this.host.selectedPlacementIds];
		if (memberIds.length < 2) {
			this.host.setStatusMessage('Select at least two placements to create a cluster');
			return null;
		}

		const placements = memberIds.map((id) =>
			this.host.document.entities.find((object) => object.id === id)
		);
		const roomId = placements[0]?.roomId;
		if (!roomId || placements.some((placement) => placement?.roomId !== roomId)) {
			this.host.setStatusMessage('Cluster members must be in the same room');
			return null;
		}

		const occupiedIds = new Set(
			this.host.clusters.flatMap((cluster) => cluster.memberIds)
		);
		if (memberIds.some((id) => occupiedIds.has(id))) {
			this.host.setStatusMessage('A placement can belong to only one cluster');
			return null;
		}

		const existingIds = new Set(this.host.clusters.map((cluster) => cluster.id));
		let suffix = this.host.clusters.length + 1;
		while (existingIds.has(`cluster-${suffix}`)) suffix += 1;
		const cluster: SceneObjectCluster = {
			id: `cluster-${suffix}`,
			name: name?.trim() || `Cluster ${suffix}`,
			roomId,
			memberIds
		};

		if (!this.host.beginDocumentTransaction()) return null;
		this.host.document.clusters ??= [];
		this.host.document.clusters.push(cluster);
		if (!this.host.commitDocumentTransaction()) return null;
		this.selectionActions.selectCluster(cluster.id);
		this.host.setStatusMessage(`Grouped ${memberIds.length} objects`);
		return cluster.id;
	}

	renameCluster(id: string, name: string) {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) {
			return false;
		}
		const cluster = this.host.clusters.find((candidate) => candidate.id === id);
		const nextName = name.trim();
		if (!cluster || !nextName || cluster.name === nextName) return false;
		if (!this.host.beginDocumentTransaction()) return false;
		cluster.name = nextName;
		return this.host.commitDocumentTransaction();
	}

	addMemberToCluster(clusterId: string, memberId: string) {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) {
			return false;
		}
		const cluster = this.host.clusters.find((candidate) => candidate.id === clusterId);
		const placement = this.host.document.entities.find((object) => object.id === memberId);
		if (!cluster || !placement || placement.roomId !== cluster.roomId) return false;
		if (cluster.memberIds.includes(memberId)) return false;
		if (this.host.clusters.some((candidate) => candidate.memberIds.includes(memberId))) {
			this.host.setStatusMessage('A placement can belong to only one cluster');
			return false;
		}
		if (!this.host.beginDocumentTransaction()) return false;
		cluster.memberIds.push(memberId);
		const committed = this.host.commitDocumentTransaction();
		if (committed && this.host.selectedClusterId === clusterId) {
			this.selectionActions.selectCluster(clusterId);
		}
		return committed;
	}

	removeMemberFromCluster(clusterId: string, memberId: string) {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) {
			return false;
		}
		const clusterIndex = this.host.clusters.findIndex(
			(candidate) => candidate.id === clusterId
		);
		const cluster = this.host.clusters[clusterIndex];
		if (!cluster || !cluster.memberIds.includes(memberId)) return false;
		const wasSelectedCluster = this.host.selectedClusterId === clusterId;
		if (!this.host.beginDocumentTransaction()) return false;
		cluster.memberIds = cluster.memberIds.filter((id) => id !== memberId);
		if (cluster.memberIds.length < 2) {
			this.host.document.clusters?.splice(clusterIndex, 1);
		}
		const committed = this.host.commitDocumentTransaction();
		if (!committed) return false;
		if (
			wasSelectedCluster &&
			this.host.clusters.some((candidate) => candidate.id === clusterId)
		) {
			this.selectionActions.selectCluster(clusterId);
		} else if (wasSelectedCluster) {
			this.host.selectedClusterId = null;
			this.selectionActions.selectPlacements(cluster.memberIds);
		}
		return true;
	}

	ungroupCluster(id = this.host.selectedClusterId) {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) {
			return false;
		}
		if (!id) return false;
		const index = this.host.clusters.findIndex((cluster) => cluster.id === id);
		if (index === -1 || !this.host.beginDocumentTransaction()) return false;
		const memberIds = [...this.host.clusters[index]!.memberIds];
		const wasSelected = this.host.selectedClusterId === id;
		this.host.document.clusters?.splice(index, 1);
		const committed = this.host.commitDocumentTransaction();
		if (committed && wasSelected) this.selectionActions.selectPlacements(memberIds);
		return committed;
	}

	// ===================================================================
	// Duplicate / delete / transform
	// ===================================================================

	duplicateSelection() {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) {
			return false;
		}
		const selectedIds = [...this.host.selectedPlacementIds];
		const primaryId = this.host.primaryPlacementId;
		if (!primaryId || selectedIds.length === 0) {
			this.host.setStatusMessage('Select one or more placements to duplicate');
			return false;
		}

		const sourceById = new Map(
			this.host.document.entities.map((object) => [object.id, object])
		);
		if (selectedIds.some((id) => !sourceById.has(id))) {
			this.host.setStatusMessage('Selection contains an unavailable placement');
			return false;
		}

		// The current primary is copied first. Remaining sources retain selection order.
		const sourceOrder = [primaryId, ...selectedIds.filter((id) => id !== primaryId)];
		const reservedPlacementIds = new Set(
			this.host.document.entities.map((object) => object.id)
		);
		const copyIdBySourceId = new Map<string, string>();
		const copies: SceneEntity[] = [];

		for (const sourceId of sourceOrder) {
			const source = sourceById.get(sourceId);
			if (!source) {
				this.host.setStatusMessage('Selection contains an unavailable placement');
				return false;
			}
			const copyId = reserveEntityId(`${source.id}-copy`, reservedPlacementIds);
			copyIdBySourceId.set(source.id, copyId);
			const copy = cloneSceneEntity(source);
			copy.id = copyId;
			copy.position = [source.position[0] + 0.5, source.position[1], source.position[2] + 0.5];
			copies.push(copy);
		}

		const selectedSet = new Set(selectedIds);
		const reservedClusterIds = new Set(this.host.clusters.map((cluster) => cluster.id));
		const copiedClusters: SceneObjectCluster[] = [];
		for (const cluster of this.host.clusters) {
			if (!cluster.memberIds.every((id) => selectedSet.has(id))) continue;
			const memberIds = cluster.memberIds.map((id) => copyIdBySourceId.get(id));
			if (memberIds.some((id) => !id)) continue;
			copiedClusters.push({
				id: reserveEntityId(`${cluster.id}-copy`, reservedClusterIds),
				name: `${cluster.name} Copy`,
				roomId: cluster.roomId,
				memberIds: memberIds as string[]
			});
		}

		if (!this.host.beginDocumentTransaction()) return false;
		this.host.document.entities.push(...copies);
		(this.host.document.clusters ??= []).push(...copiedClusters);
		if (!this.host.commitDocumentTransaction()) return false;

		const copyIds = copies.map((copy) => copy.id);
		// Primary is the final selection entry; rotate the first-created copy there.
		this.selectionActions.selectPlacements([...copyIds.slice(1), copyIds[0]!]);
		this.host.requestPlacementFrame(copyIds);
		this.host.setStatusMessage(
			`Duplicated ${copies.length} object${copies.length === 1 ? '' : 's'}`
		);
		return true;
	}

	deletePlacements(ids: string[]) {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) {
			return false;
		}
		const deleteIds = new Set(ids);
		if (
			deleteIds.size === 0 ||
			![...deleteIds].every((id) =>
				this.host.document.entities.some((object) => object.id === id)
			)
		) {
			return false;
		}
		if (!this.host.beginDocumentTransaction()) return false;

		this.host.document.entities = this.host.document.entities.filter(
			(object) => !deleteIds.has(object.id)
		);
		this.host.document.clusters = this.host.clusters
			.map((cluster) => ({
				...cluster,
				memberIds: cluster.memberIds.filter((id) => !deleteIds.has(id))
			}))
			.filter((cluster) => cluster.memberIds.length >= 2);

		return this.host.commitDocumentTransaction();
	}

	deleteSelection() {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) {
			return false;
		}
		const ids = [...this.host.selectedPlacementIds];
		if (ids.length === 0) {
			this.host.setStatusMessage('Select one or more placements to delete');
			return false;
		}
		if (!this.deletePlacements(ids)) return false;
		this.selectionActions.deselect();
		this.host.setStatusMessage(
			`Deleted ${ids.length} object${ids.length === 1 ? '' : 's'}`
		);
		return true;
	}

	deletePlacement(id: string) {
		return this.deletePlacements([id]);
	}

	updatePlacementTransform(id: string, transform: PlacementTransform) {
		if (this.host.isDocumentMutationBlocked) return false;
		const placement = this.host.document.entities.find((object) => object.id === id);
		if (!placement || !this.isPlacementSelectable(id)) return false;
		const written = writePlacementTransform(placement, transform);
		if (written) {
			this.stashPlacementScaleVector(id, transform);
		}
		return written;
	}

	commitPlacementTransform(id: string, transform: PlacementTransform) {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) {
			return false;
		}
		if (!this.host.beginDocumentTransaction()) return false;
		if (!this.updatePlacementTransform(id, transform)) {
			this.host.cancelDocumentTransaction();
			return false;
		}
		return this.host.commitDocumentTransaction();
	}

	/**
	 * When the user is in independent mode the per-axis vector survives the
	 * commit in editor-session memory; when uniform we clear it (so the next
	 * inspector read renders the single Scale field again). All-equal
	 * independent vectors collapse to uniform + clear.
	 */
	private stashPlacementScaleVector(id: string, transform: PlacementTransform): void {
		if (
			transform.scaleMode === 'independent' &&
			transform.scaleVector &&
			!isUniformVector(transform.scaleVector)
		) {
			this.host.setPlacementScaleVector(id, transform.scaleVector);
		} else {
			this.host.setPlacementScaleVector(id, null);
		}
	}
}
