/**
 * `EditorPathAnchorMutator` — navigation-node point/FOV/label + connection
 * path-anchor mutation controller (Phase 9.5).
 *
 * Split out of the god file separately from `EditorNavigationGraphMutator`
 * because that mutator already exceeds the 600-LOC follow-up-split note.
 * Phase 9.5 hard-moves node point/FOV/label writes and connection draft /
 * anchor insert/update/delete bodies here.
 *
 * `MuseumEditorStore` keeps identical public method signatures as thin
 * delegates. The mutator never touches the document store or history
 * controller directly — only through host transaction wrappers.
 */

import type {
	MuseumSceneDocument,
	SceneNavigationNode,
	SceneConnection,
	ScenePathAnchor
} from '$lib/content/scene';
import type { LayoutRoomRegistry } from '$lib/project/project-layout-semantics';
import { MUSEUM_CAMERA_FOV, type MuseumRoomId, type Vec3 } from '$lib/types/museum';
import {
	allocateCameraPathAnchorId,
	createScenePathAnchorAtWorldPoint,
	findScenePathAnchor,
	getScenePathAnchorWorldPosition,
	writeScenePathAnchorWorldPosition
} from '../editor-camera-path';
import type {
	EditorCameraHandle,
	EditorCameraSelection,
	EditorNavigationSelection
} from '../editor-selection';

function vec3Matches(a: Vec3, b: Vec3) {
	return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function isFiniteVec3(value: Vec3) {
	return value.every(Number.isFinite);
}

/**
 * Composition-root surface the path/anchor mutator depends on. Everything
 * here stays owned by `MuseumEditorStore`.
 */
export interface EditorPathAnchorMutatorHost {
	// Mutation guards.
	readonly isDocumentMutationBlocked: boolean;
	readonly isCameraFramingMutationBlocked: boolean;
	readonly isEditorInteractionActive: boolean;
	/** True while a document/framing transaction is open on the history controller. */
	readonly historyDocumentUndoBlocked: boolean;
	/** True while a framing (as opposed to plain document) transaction is open. */
	readonly historyFramingTransactionActive: boolean;

	// Document + selection state.
	readonly document: MuseumSceneDocument;
	readonly rooms: LayoutRoomRegistry;
	readonly cameraSelection: EditorCameraSelection | null;
	readonly selectedNavigationNode: SceneNavigationNode | undefined;
	readonly selectedConnection: SceneConnection | undefined;
	readonly selectedAnchor: ScenePathAnchor | undefined;
	readonly selectedRoomId: MuseumRoomId | null;
	readonly pendingNavigationNode: SceneNavigationNode | undefined;

	navigationSelection: EditorNavigationSelection;

	isPendingNavigationNode(nodeId: string): boolean;

	// Document / framing transaction wrappers (guard-aware).
	beginDocumentTransaction(): boolean;
	beginCameraFramingTransaction(): boolean;
	commitDocumentTransaction(): boolean;
	cancelDocumentTransaction(): boolean;
}

export class EditorPathAnchorMutator {
	constructor(private readonly host: EditorPathAnchorMutatorHost) {}

	// ===================================================================
	// Navigation node point / label / FOV
	// ===================================================================

	updateNavigationNodePoint(
		nodeId: string,
		handle: EditorCameraHandle,
		point: Vec3
	) {
		const mutationBlocked =
			handle === 'target'
				? this.host.isCameraFramingMutationBlocked
				: this.host.isDocumentMutationBlocked;
		if (mutationBlocked || !isFiniteVec3(point)) {
			return false;
		}
		const selection = this.host.cameraSelection;
		if (selection?.nodeId !== nodeId || selection.handle !== handle) return false;
		const pending = this.host.isPendingNavigationNode(nodeId);
		if (!pending && !this.host.historyDocumentUndoBlocked) return false;
		const node = pending
			? this.host.pendingNavigationNode
			: this.host.document.navigationNodes.find((candidate) => candidate.id === nodeId);
		if (!node) return false;
		const current = handle === 'position' ? node.position : node.cameraTarget;
		if (vec3Matches(current, point)) return false;
		if (handle === 'position') node.position = [...point];
		else node.cameraTarget = [...point];
		return true;
	}

	commitNavigationNodePoint(
		nodeId: string,
		handle: EditorCameraHandle,
		point: Vec3
	) {
		const mutationBlocked =
			handle === 'target'
				? this.host.isCameraFramingMutationBlocked
				: this.host.isDocumentMutationBlocked;
		if (mutationBlocked || this.host.isEditorInteractionActive) return false;
		if (this.host.isPendingNavigationNode(nodeId)) {
			return this.updateNavigationNodePoint(nodeId, handle, point);
		}
		if (
			!(handle === 'target'
				? this.host.beginCameraFramingTransaction()
				: this.host.beginDocumentTransaction())
		) {
			return false;
		}
		if (!this.updateNavigationNodePoint(nodeId, handle, point)) {
			this.host.cancelDocumentTransaction();
			return false;
		}
		return this.host.commitDocumentTransaction();
	}

	commitSelectedNodeLabel(label: string) {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) {
			return false;
		}
		const node = this.host.selectedNavigationNode;
		const next = label.trim();
		if (!node || !next || next === node.label) return false;
		if (this.host.isPendingNavigationNode(node.id)) {
			node.label = next;
			return true;
		}
		if (!this.host.beginDocumentTransaction()) return false;
		node.label = next;
		return this.host.commitDocumentTransaction();
	}

	commitSelectedNodeFov(fov: number) {
		if (
			this.host.isCameraFramingMutationBlocked ||
			this.host.isEditorInteractionActive ||
			!Number.isFinite(fov) ||
			fov < MUSEUM_CAMERA_FOV.min ||
			fov > MUSEUM_CAMERA_FOV.max
		) {
			return false;
		}
		const node = this.host.selectedNavigationNode;
		if (!node || Math.abs(node.fov - fov) <= 1e-6) return false;
		if (this.host.isPendingNavigationNode(node.id)) {
			node.fov = fov;
			return true;
		}
		if (!this.host.beginCameraFramingTransaction()) return false;
		node.fov = fov;
		return this.host.commitDocumentTransaction();
	}

	updateSelectedNodeFov(fov: number) {
		if (
			this.host.isCameraFramingMutationBlocked ||
			!Number.isFinite(fov) ||
			fov < MUSEUM_CAMERA_FOV.min ||
			fov > MUSEUM_CAMERA_FOV.max
		) {
			return false;
		}
		const node = this.host.selectedNavigationNode;
		if (
			!node ||
			(!this.host.isPendingNavigationNode(node.id) &&
				!this.host.historyFramingTransactionActive)
		) {
			return false;
		}
		if (Math.abs(node.fov - fov) <= 1e-6) return false;
		node.fov = fov;
		return true;
	}

	// ===================================================================
	// Connection draft / anchors
	// ===================================================================

	convertConnectionDraft(connectionId: string) {
		if (!this.host.historyDocumentUndoBlocked) return false;
		const connection = this.host.document.connections.find(
			(candidate) => candidate.id === connectionId
		);
		if (!connection || connection.positionPath.kind === 'auto-bezier') return false;
		connection.positionPath = {
			kind: 'auto-bezier',
			anchors: connection.positionPath.anchors
		};
		return true;
	}

	convertSelectedConnectionToSmooth() {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) {
			return false;
		}
		const connection = this.host.selectedConnection;
		if (!connection || connection.positionPath.kind === 'auto-bezier') return false;
		if (!this.host.beginDocumentTransaction()) return false;
		this.convertConnectionDraft(connection.id);
		return this.host.commitDocumentTransaction();
	}

	insertConnectionAnchorAtWorldPoint(
		connectionId: string,
		interiorIndex: number,
		worldPosition: Vec3
	) {
		if (!this.host.historyDocumentUndoBlocked || !isFiniteVec3(worldPosition)) {
			return null;
		}
		const connection = this.host.document.connections.find(
			(candidate) => candidate.id === connectionId
		);
		if (!connection) return null;
		this.convertConnectionDraft(connectionId);
		const id = allocateCameraPathAnchorId(
			connectionId,
			connection.positionPath.anchors.map((anchor) => anchor.id)
		);
		const anchor = createScenePathAnchorAtWorldPoint(
			id,
			worldPosition,
			this.host.selectedRoomId,
			this.host.rooms
		);
		const index = Math.max(
			0,
			Math.min(connection.positionPath.anchors.length, Math.trunc(interiorIndex))
		);
		connection.positionPath.anchors.splice(index, 0, anchor);
		this.host.navigationSelection = { kind: 'anchor', connectionId, anchorId: id };
		return id;
	}

	updateConnectionAnchorWorldPoint(
		connectionId: string,
		anchorId: string,
		worldPosition: Vec3
	) {
		if (!this.host.historyDocumentUndoBlocked || !isFiniteVec3(worldPosition)) {
			return false;
		}
		const anchor = findScenePathAnchor(this.host.document, connectionId, anchorId);
		if (!anchor) return false;
		const current = getScenePathAnchorWorldPosition(anchor, this.host.rooms);
		if (vec3Matches(current, worldPosition)) return false;
		this.convertConnectionDraft(connectionId);
		writeScenePathAnchorWorldPosition(anchor, worldPosition, this.host.rooms);
		return true;
	}

	commitSelectedAnchorPoint(point: Vec3) {
		if (
			this.host.isDocumentMutationBlocked ||
			this.host.isEditorInteractionActive ||
			!isFiniteVec3(point)
		) {
			return false;
		}
		const selection = this.host.navigationSelection;
		const anchor = this.host.selectedAnchor;
		if (
			selection?.kind !== 'anchor' ||
			!anchor ||
			vec3Matches(anchor.position, point)
		) {
			return false;
		}
		if (!this.host.beginDocumentTransaction()) return false;
		this.convertConnectionDraft(selection.connectionId);
		anchor.position = [...point];
		return this.host.commitDocumentTransaction();
	}

	deleteSelectedAnchor() {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) {
			return false;
		}
		const selection = this.host.navigationSelection;
		const connection = this.host.selectedConnection;
		if (selection?.kind !== 'anchor' || !connection) return false;
		const index = connection.positionPath.anchors.findIndex(
			(anchor) => anchor.id === selection.anchorId
		);
		if (index < 0 || !this.host.beginDocumentTransaction()) return false;
		connection.positionPath.anchors.splice(index, 1);
		this.host.navigationSelection = {
			kind: 'connection',
			connectionId: connection.id
		};
		return this.host.commitDocumentTransaction();
	}
}
