/**
 * `EditorSelectionActions` — selection orchestration controller (Slice 6, 2b).
 *
 * Slice 4 introduced `EditorSelectionStore` as the *pure* parallel-tuple
 * reducer (`workspace` / `navigation` / `discovery`). The god file kept the
 * imperative `selectX` orchestration — guards, focus, timeline sync, tree
 * expansion, asset-placement/pending-frame resets — as ~15 methods on
 * `MuseumEditorStore`.
 *
 * Slice 6 hard-deletes those methods off the god file and moves them here.
 * The controller owns the orchestration; the reducer stays pure. Everything
 * that must remain on the composition root (document reads, mutation guards,
 * focus channels, timeline pose sync, transform mode, status messages,
 * pending-nav connect flows, clusters, camera-preview scrub) is reached
 * through the injected `EditorSelectionActionsHost`.
 */

import type { EditorSelectionStore } from './selection-store.svelte';
import type {
	CameraConnectionDirection,
	MuseumRoomId
} from '$lib/types/museum';
import type {
	MuseumSceneDocument,
	SceneNavigationNode,
	SceneObjectCluster
} from '$lib/content/scene';
import type { ResolvedCameraRoute } from '$lib/museum/navigation/camera-route';
import {
	cameraMotionProgressAtEdgeProgress,
	createCameraMotion
} from '$lib/museum/navigation/camera-motion';
import { findSceneCameraViewKeyframe } from '../editor-camera-view';
import type {
	EditorCameraHandle,
	EditorCameraSelection,
	EditorNavigationSelection
} from '../editor-selection';
import type { EditorTransformMode } from '../editor-transform';
import type {
	EditorCameraPreview,
	EditorClusterTreeSelectionOptions,
	EditorPendingNavigationCommand,
	EditorPlacementTreeSelectionOptions,
	EditorWorkspace
} from '../museum-editor.types';

/**
 * Composition-root surface the selection controller depends on. Everything
 * here stays owned by `MuseumEditorStore`; the controller never mutates the
 * document or history directly.
 */
export interface EditorSelectionActionsHost {
	readonly isDocumentMutationBlocked: boolean;
	readonly isEditorInteractionActive: boolean;
	readonly isCameraFramingMutationBlocked: boolean;
	readonly pendingNavigationCommand: EditorPendingNavigationCommand;
	readonly pendingNavigationNode: SceneNavigationNode | undefined;
	readonly document: MuseumSceneDocument;
	readonly cameraSelection: EditorCameraSelection | null;
	readonly currentWorkspace: EditorWorkspace;
	readonly cameraPreview: EditorCameraPreview;
	readonly activeCameraConnectionId: string | null;
	readonly activeCameraDirection: CameraConnectionDirection;
	readonly navigationSelection: EditorNavigationSelection;
	readonly selectedRoomId: MuseumRoomId | null;
	readonly selectedPlacementId: string | null;
	readonly selectedPlacementIds: string[];
	readonly selectedClusterId: string | null;
	readonly clusters: SceneObjectCluster[];
	transformMode: EditorTransformMode;

	isPendingNavigationNode(nodeId: string): boolean;
	connectPendingNavigationNode(destinationNodeId: string): boolean;
	cancelAssetPlacement(message?: string): boolean;
	cancelPendingFrame(): void;
	setStatusMessage(message: string | null): void;
	focusNavigationNode(id: string): boolean;
	focusPlacement(id: string): boolean;
	focusSelection(): boolean;
	ensureRoomTreeExpanded(roomId: MuseumRoomId): void;
	ensureClusterTreeExpanded(clusterId: string): void;
	isPlacementSelectable(id: string): boolean;
	getCapturedCameraPreviewRoute(runId: number): ResolvedCameraRoute | null;
	setCameraPreviewPlayhead(progress: number): boolean;
	syncCameraTimelineForNode(id: string): void;
	showCameraTimelineNodePose(id: string): void;
	syncCameraTimelineForConnection(
		connectionId: string,
		direction: CameraConnectionDirection,
		playhead: number
	): void;
	showCameraTimelineConnectionPose(
		connectionId: string,
		direction: CameraConnectionDirection,
		playhead: number
	): void;
}

export class EditorSelectionActions {
	constructor(
		private readonly selection: EditorSelectionStore,
		private readonly host: EditorSelectionActionsHost
	) {}

	// ===================================================================
	// Navigation / camera selection
	// ===================================================================

	selectNavigationNode(id: string) {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) return false;
		if (
			this.host.pendingNavigationCommand?.kind === 'connect-existing' ||
			(this.host.pendingNavigationCommand?.kind === 'connect-pending-node' &&
				this.host.pendingNavigationCommand.node.id !== id)
		) {
			return this.host.connectPendingNavigationNode(id);
		}
		if (this.host.pendingNavigationCommand?.kind === 'place-camera') return false;
		const node = this.host.isPendingNavigationNode(id)
			? this.host.pendingNavigationNode
			: this.host.document.navigationNodes.find((candidate) => candidate.id === id);
		if (!node) return false;

		const current = this.host.cameraSelection;
		if (current?.nodeId === id && current.handle === 'position') return false;

		this.host.cancelAssetPlacement();
		this.host.cancelPendingFrame();
		// setNavigation clears workspace + nav-driven discovery. For 'node' kind,
		// discovery auto-nulls inside the reducer.
		this.selection.setNavigation({ kind: 'node', nodeId: id, handle: 'position' });

		if (this.host.isPendingNavigationNode(id)) {
			this.host.setStatusMessage('Adjust camera pose, then choose its first connection');
		} else if (this.host.currentWorkspace === 'camera') {
			this.host.syncCameraTimelineForNode(id);
			this.host.showCameraTimelineNodePose(id);
		} else if (current?.nodeId !== id) {
			this.host.focusNavigationNode(id);
		}
		return true;
	}

	selectCameraHandle(handle: EditorCameraHandle) {
		if (
			(handle === 'target'
				? this.host.isCameraFramingMutationBlocked
				: this.host.isDocumentMutationBlocked) ||
			this.host.isEditorInteractionActive ||
			(this.host.pendingNavigationCommand && !this.host.pendingNavigationNode)
		) return false;
		const selection = this.host.cameraSelection;
		if (!selection || selection.handle === handle) return false;
		// setNavigation(..., 'node') auto-clears discovery.
		this.selection.setNavigation({
			kind: 'node',
			nodeId: selection.nodeId,
			handle
		});
		return true;
	}

	selectConnection(connectionId: string) {
		return this.selectCameraConnectionDirection(connectionId, this.#defaultCameraDirection(connectionId));
	}

	/**
	 * Phase 2.1 primary entry for selecting a connection. Establishes both
	 * `activeCameraConnectionId` and `activeCameraDirection` so the connection's
	 * keyframe markers stay reachable through tree, timeline, and 3D pickers.
	 */
	selectCameraConnectionDirection(
		connectionId: string,
		direction: CameraConnectionDirection,
		options: { preservePreviewObserver?: boolean } = {}
	) {
		const allowPausedPreviewScrub =
			options.preservePreviewObserver && this.host.cameraPreview?.transport === 'paused';
		if (
			(this.host.isDocumentMutationBlocked && !allowPausedPreviewScrub) ||
			this.host.isEditorInteractionActive ||
			this.host.pendingNavigationCommand
		) {
			return false;
		}
		if (!this.host.document.connections.some((connection) => connection.id === connectionId)) {
			return false;
		}
		// Discovery auto-mirrors to the connection inside setNavigation, so a
		// single reducer call replaces the four pre-slice state writes.
		if (
			this.selection.discoveryConnectionId === connectionId &&
			this.selection.discoveryDirection === direction &&
			this.selection.navigation.kind === 'connection'
		) {
			return false;
		}
		this.host.cancelAssetPlacement();
		this.host.cancelPendingFrame();
		this.selection.setNavigation({ kind: 'connection', connectionId, direction });
		this.expandActiveCameraDirection(direction);
		if (this.host.currentWorkspace === 'camera' && !options.preservePreviewObserver) {
			this.host.syncCameraTimelineForConnection(connectionId, direction, 0);
			this.host.showCameraTimelineConnectionPose(connectionId, direction, 0);
		}
		return true;
	}

	#defaultCameraDirection(connectionId: string): CameraConnectionDirection {
		if (
			this.host.activeCameraConnectionId === connectionId &&
			(this.host.navigationSelection?.kind === 'connection' ||
				this.host.navigationSelection?.kind === 'anchor' ||
				this.host.navigationSelection?.kind === 'view-keyframe')
		) {
			return this.host.activeCameraDirection;
		}
		return 'forward';
	}

	/** Expand the active connection's tree row + direction key. Public so the
	 * god file's non-select orchestration (connect flows) can reuse it. */
	expandActiveCameraDirection(direction: CameraConnectionDirection) {
		const id = this.host.activeCameraConnectionId;
		if (!id) return;
		this.selection.expandCameraConnection(id);
		this.selection.expandCameraDirection(id, direction);
	}

	selectAnchor(connectionId: string, anchorId: string) {
		if (
			this.host.isDocumentMutationBlocked ||
			this.host.isEditorInteractionActive ||
			this.host.pendingNavigationCommand
		) {
			return false;
		}
		const connection = this.host.document.connections.find(
			(candidate) => candidate.id === connectionId
		);
		if (!connection?.positionPath.anchors.some((anchor) => anchor.id === anchorId)) {
			return false;
		}
		const current = this.selection.navigation;
		if (
			current.kind === 'anchor' &&
			current.connectionId === connectionId &&
			current.anchorId === anchorId
		) {
			return false;
		}
		const direction = this.#defaultCameraDirection(connectionId);
		this.host.cancelAssetPlacement();
		this.host.cancelPendingFrame();
		this.selection.setNavigation({ kind: 'anchor', connectionId, anchorId });
		// Switching connections defaults discovery to forward via #defaultCameraDirection.
		this.selection.setDiscovery(connectionId, direction);
		this.expandActiveCameraDirection(direction);
		return true;
	}

	selectViewKeyframe(
		connectionId: string,
		direction: CameraConnectionDirection,
		keyframeId: string
	) {
		if (
			this.host.isDocumentMutationBlocked ||
			this.host.isEditorInteractionActive ||
			this.host.pendingNavigationCommand
		) {
			return false;
		}
		const keyframe = findSceneCameraViewKeyframe(
			this.host.document,
			connectionId,
			direction,
			keyframeId
		);
		if (!keyframe) return false;

		const current = this.selection.navigation;
		const changed = !(
			current.kind === 'view-keyframe' &&
			current.connectionId === connectionId &&
			current.direction === direction &&
			current.keyframeId === keyframeId
		);
		if (changed) {
			this.host.cancelAssetPlacement();
			this.host.cancelPendingFrame();
			this.selection.setNavigation({
				kind: 'view-keyframe',
				connectionId,
				direction,
				keyframeId
			});
			this.expandActiveCameraDirection(direction);
		}

		const preview = this.host.cameraPreview;
		let movedPlayhead = false;
		if (
			preview?.kind === 'connection' &&
			preview.mode === 'director' &&
			preview.transport === 'paused' &&
			preview.connectionId === connectionId &&
			preview.direction === direction
		) {
			const route = this.host.getCapturedCameraPreviewRoute(preview.runId);
			if (route) {
				const progress = cameraMotionProgressAtEdgeProgress(
					createCameraMotion(route),
					0,
					keyframe.progress
				);
				movedPlayhead = this.host.setCameraPreviewPlayhead(progress);
			}
		}
		return changed || movedPlayhead;
	}

	// ===================================================================
	// Room + placement + cluster selection
	// ===================================================================

	selectRoom(id: MuseumRoomId) {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) return false;
		const changed = this.host.selectedRoomId !== id;
		if (!changed) return false;
		this.clearPlacementSelection();
		// Model 'room-only' as `kind:'placement', ids:[]` so the reducer-driven
		// workspace side-effect matches pre-slice semantics.
		this.selection.setWorkspace({
			kind: 'placement',
			ids: [],
			clusterId: null,
			roomId: id
		});
		return true;
	}

	/** Select a placement from the tree without requiring a separate room-row click first. */
	selectPlacementFromTree(
		placementId: string,
		options: EditorPlacementTreeSelectionOptions = {}
	) {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) return false;
		const placement = this.host.document.entities.find((object) => object.id === placementId);
		if (!placement) return false;

		this.selectRoom(placement.roomId);
		if (this.host.selectedRoomId !== placement.roomId) return false;
		this.host.ensureRoomTreeExpanded(placement.roomId);

		const additive = options.additive ?? false;
		const selected = additive
			? this.togglePlacement(placementId)
			: this.selectPlacement(placementId);
		if (!selected) return false;

		const shouldFocus = options.focus ?? !additive;
		if (shouldFocus) this.host.focusPlacement(placementId);
		return true;
	}

	selectPlacement(id: string) {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) {
			return false;
		}
		this.host.cancelPendingFrame();
		const placement = this.host.document.entities.find((object) => object.id === id);
		if (!placement) return false;
		if (this.host.selectedRoomId !== placement.roomId) {
			this.selectRoom(placement.roomId as MuseumRoomId);
		}
		if (!this.host.isPlacementSelectable(id)) return false;
		const previousId = this.host.selectedPlacementId;
		// setWorkspace auto-cross-clears nav; reducer model.
		this.selection.setWorkspace({
			kind: 'placement',
			ids: [id],
			clusterId: null,
			roomId: placement.roomId as MuseumRoomId
		});
		if (previousId !== id) this.host.transformMode = 'rotate';
		return true;
	}

	selectPlacements(ids: string[]) {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) return false;
		const next = [...new Set(ids)].filter((id) => this.host.isPlacementSelectable(id));
		if (next.length === 0) {
			this.deselect();
			return false;
		}
		this.host.cancelPendingFrame();
		// Disambiguate roomId: read from the first selected object's roomId (each
		// placement shares a room in practice but we honour the document truth).
		const firstPlacement = this.host.document.entities.find((object) => object.id === next[0]);
		if (!firstPlacement) return false;
		this.selection.setWorkspace({
			kind: 'placement',
			ids: next,
			clusterId: null,
			roomId: firstPlacement.roomId as MuseumRoomId
		});
		this.host.transformMode = 'rotate';
		return true;
	}

	togglePlacement(id: string) {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive || !this.host.isPlacementSelectable(id)) {
			return false;
		}
		this.host.cancelPendingFrame();
		const placement = this.host.document.entities.find((object) => object.id === id);
		if (!placement) return false;
		// Facade returns cluster member ids when workspace.kind === 'cluster'.
		const currentIds = this.host.selectedPlacementIds;
		const nextIds = currentIds.includes(id)
			? currentIds.filter((memberId) => memberId !== id)
			: [...currentIds, id];
		this.selection.setWorkspace({
			kind: 'placement',
			ids: nextIds,
			clusterId: null,
			roomId: placement.roomId as MuseumRoomId
		});
		return true;
	}

	selectCluster(id: string) {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) return false;
		const cluster = this.host.clusters.find((candidate) => candidate.id === id);
		if (!cluster || cluster.roomId !== this.host.selectedRoomId) return false;
		this.host.cancelPendingFrame();
		this.selection.setWorkspace({
			kind: 'cluster',
			clusterId: cluster.id,
			roomId: cluster.roomId
		});
		this.host.transformMode = 'rotate';
		return true;
	}

	/** Select and reveal a valid cluster from the tree using its authored room ownership. */
	selectClusterFromTree(
		clusterId: string,
		options: EditorClusterTreeSelectionOptions = {}
	) {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) return false;
		const cluster = this.host.clusters.find((candidate) => candidate.id === clusterId);
		if (!cluster || cluster.memberIds.length === 0) return false;
		const ownsEveryMember = cluster.memberIds.every((memberId) =>
			this.host.document.entities.some(
				(object) => object.id === memberId && object.roomId === cluster.roomId
			)
		);
		if (!ownsEveryMember) return false;

		this.selectRoom(cluster.roomId);
		if (this.host.selectedRoomId !== cluster.roomId) return false;
		this.host.ensureRoomTreeExpanded(cluster.roomId);
		this.host.ensureClusterTreeExpanded(cluster.id);
		if (!this.selectCluster(cluster.id)) return false;
		if (options.focus ?? true) this.host.focusSelection();
		return true;
	}

	selectAllInRoom() {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) return false;
		const roomId = this.host.selectedRoomId;
		if (!roomId) return false;
		return this.selectPlacements(
			this.host.document.entities
				.filter((object) => object.roomId === roomId)
				.map((object) => object.id)
		);
	}

	deselect() {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) return false;
		const changed =
			this.host.selectedPlacementIds.length > 0 ||
			this.host.selectedClusterId !== null ||
			this.host.navigationSelection !== null ||
			this.host.activeCameraConnectionId !== null;
		this.host.cancelPendingFrame();
		const roomId = this.host.selectedRoomId;
		// Clear nav/discovery; keep room context (pre-slice deselect semantics).
		this.selection.setNavigation({ kind: 'none' });
		this.selection.setWorkspace(
			roomId === null
				? { kind: 'none' }
				: {
						kind: 'placement',
						ids: [],
						clusterId: null,
						roomId
				  }
		);
		return changed;
	}

	/** Keep room context — pre-slice cleared ids/cluster only. Public so the
	 * god file's non-select reset paths (import, reconcile, camera placement)
	 * can reuse the room-only workspace reset. */
	clearPlacementSelection() {
		const roomId = this.host.selectedRoomId;
		this.selection.setWorkspace(
			roomId === null
				? { kind: 'none' }
				: {
						kind: 'placement',
						ids: [],
						clusterId: null,
						roomId
				  }
		);
	}
}
