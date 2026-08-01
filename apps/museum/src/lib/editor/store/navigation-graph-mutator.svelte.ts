/**
 * `EditorNavigationGraphMutator` — camera-graph topology / guided-tour /
 * timing mutation controller (Phase 9.2).
 *
 * The god file (`museum-editor.svelte.ts`) historically owned every
 * navigation-graph *write*: pending-camera placement flows, node/connection
 * connect commands, guided-tour ordering, topology deletion, and per-edge /
 * per-node timing. Phase 9.2 hard-moves those method bodies here, following
 * the `EditorSelectionActions` + host-injection pattern.
 *
 * `MuseumEditorStore` keeps identical public method signatures as thin
 * delegates (`beginCameraPlacement() { return this.navigationGraphMutator
 * .beginCameraPlacement(); }`), so components keep importing the store facade
 * unchanged.
 *
 * Everything the composition root still owns — mutation guards, the document /
 * history transaction wrappers (`begin/commit/cancelDocumentTransaction`),
 * selection reducer access, camera-preview / timeline sync, status channel,
 * session tree-expansion arrays — is reached through the injected
 * `EditorNavigationGraphMutatorHost`. The mutator never touches the document
 * store or history controller directly; it uses the same live-mutate +
 * `begin/commit` transaction pattern the god file used.
 */

import { roomLocalPoint, roomPoint } from '$lib/content/rooms';
import { cameraSceneConnectionTimingFailureReason } from '$lib/content/scene-codec';
import type {
	MuseumSceneDocument,
	SceneConnection,
	SceneNavigationNode
} from '$lib/content/scene';
import {
	MUSEUM_CAMERA_EASING,
	MUSEUM_CAMERA_FOV,
	type CameraConnectionDirection,
	type MuseumRoomId,
	type SceneConnectionTiming,
	type Vec3
} from '$lib/types/museum';
import type { EditorCameraTimeline } from '../editor-camera-timeline';
import { reserveEntityId } from '../editor-assets';
import type { EditorNavigationSelection } from '../editor-selection';
import {
	validateConnectionCreation,
	validateConnectionDeletion,
	validateGuidedTourInsertion,
	validateGuidedTourOrder,
	validateGuidedTourRemoval,
	validateNavigationNodeDeletion,
	validateTimelineGuidedTourDrop
} from '../editor-navigation-graph';
import { runOrFail } from '../helpers/validators-runner';
import { CAMERA_DIRECTION_TREE_KEY_SEPARATOR } from '../helpers/scene-keys';
import type { ResolvedCameraRoute } from '$lib/museum/navigation/camera-route';
import type {
	EditorCameraPreview,
	EditorPendingNavigationCommand,
	EditorWorkspace,
	NavigationSelection
} from '../museum-editor.types';
import type { EditorSelectionStore } from './selection-store.svelte';
import type { EditorSelectionActions } from './selection-actions.svelte';

/** Default camera-node creation geometry (eye/target heights, distance, fov, clearance). */
export const CAMERA_NODE_CREATION_DEFAULTS = {
	eyeHeight: 1.65,
	targetHeight: 1.25,
	targetDistance: 3,
	fov: MUSEUM_CAMERA_FOV.default,
	clearance: 0.35
} as const;

/** Phase 3.7: validate a timing payload; returns the cloned object or `null` on failure. */
export function validateSceneConnectionTiming(
	timing: SceneConnectionTiming
): SceneConnectionTiming | null {
	if (
		timing.durationSeconds !== undefined &&
		(!Number.isFinite(timing.durationSeconds) || timing.durationSeconds <= 0)
	) {
		return null;
	}
	if (timing.easing !== undefined && !MUSEUM_CAMERA_EASING.includes(timing.easing)) {
		return null;
	}
	return { ...timing };
}

function isFiniteVec3(value: Vec3) {
	return value.every(Number.isFinite);
}

/**
 * Slice 4 helper — clone a parallel-tuple nav state so it survives across
 * pending-nav commit (mutations on selectionStore wrap the value in a Svelte
 * proxy; structuralClone avoids pinning the proxy).
 */
function cloneNavigation(state: NavigationSelection): NavigationSelection {
	switch (state.kind) {
		case 'none':
			return { kind: 'none' };
		case 'node':
			return { kind: 'node', nodeId: state.nodeId, handle: state.handle };
		case 'connection':
			return {
				kind: 'connection',
				connectionId: state.connectionId,
				direction: state.direction
			};
		case 'anchor':
			return {
				kind: 'anchor',
				connectionId: state.connectionId,
				anchorId: state.anchorId
			};
		case 'view-keyframe':
			return {
				kind: 'view-keyframe',
				connectionId: state.connectionId,
				direction: state.direction,
				keyframeId: state.keyframeId
			};
	}
}

/**
 * Composition-root surface the navigation-graph mutator depends on. Everything
 * here stays owned by `MuseumEditorStore`; the mutator never mutates the
 * document store or history controller directly, only through the transaction
 * wrappers and reducer access exposed below.
 */
export interface EditorNavigationGraphMutatorHost {
	// Mutation guards.
	readonly isDocumentMutationBlocked: boolean;
	readonly isEditorInteractionActive: boolean;
	readonly isDocumentTransactionActive: boolean;

	// Document + selection state.
	readonly document: MuseumSceneDocument;
	readonly selection: EditorSelectionStore;
	readonly currentWorkspace: EditorWorkspace;
	readonly selectedNavigationNode: SceneNavigationNode | undefined;
	readonly selectedPlacementIds: string[];
	readonly selectedClusterId: string | null;
	readonly cameraPreview: EditorCameraPreview;

	pendingNavigationCommand: EditorPendingNavigationCommand;
	activeCameraConnectionId: string | null;
	activeCameraDirection: CameraConnectionDirection;
	navigationSelection: EditorNavigationSelection;
	treeExpandedCameraConnectionIds: string[];
	treeExpandedCameraDirectionKeys: string[];

	// Status channel (also satisfies `runOrFail`'s `ValidatorSessionChannel`).
	setStatusMessage(message: string | null): void;

	// Orchestration helpers owned by the composition root.
	setWorkspace(workspace: EditorWorkspace): void;
	setNavigationHover(connectionId: string | null, anchorId?: string | null): void;
	cancelAssetPlacement(message?: string): boolean;
	cancelPendingFrame(): void;

	// Document transaction wrappers (guard-aware; seed reverse on commit).
	beginDocumentTransaction(): boolean;
	commitDocumentTransaction(): boolean;
	cancelDocumentTransaction(): boolean;

	// Camera preview / timeline for topology deletion.
	getCameraTimeline(): EditorCameraTimeline | null;
	stopCameraPreview(): boolean;
	getCapturedCameraPreviewRoute(runId: number): ResolvedCameraRoute | null;

	// Camera-timeline pose sync (Camera workspace only).
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

export class EditorNavigationGraphMutator {
	// Pending-nav restore slots. Capture from the selection reducer on begin,
	// restore via `setNavigation` on cancel. Type-matches the parallel-tuple
	// selection shape so no `EditorNavigationSelection` state stays alive.
	#pendingNavigationSelectionBefore: NavigationSelection = { kind: 'none' };
	#pendingNavigationActiveConnectionBefore: string | null = null;
	#pendingNavigationDirectionBefore: CameraConnectionDirection = 'forward';
	#pendingNavigationPlacementIdsBefore: string[] = [];
	#pendingNavigationClusterBefore: string | null = null;

	constructor(
		private readonly selectionActions: EditorSelectionActions,
		private readonly host: EditorNavigationGraphMutatorHost
	) {}

	// ===================================================================
	// Pending navigation flows
	// ===================================================================

	beginCameraPlacement() {
		if (
			this.host.isDocumentMutationBlocked ||
			this.host.isEditorInteractionActive ||
			this.host.pendingNavigationCommand
		) return false;
		this.host.cancelAssetPlacement();
		this.host.cancelPendingFrame();
		this.host.setWorkspace('camera');
		// Slice 4 — capture parallel-tuple nav shape for restore (keeps connection direction).
		this.#pendingNavigationSelectionBefore = cloneNavigation(
			this.host.selection.navigation
		);
		this.#pendingNavigationActiveConnectionBefore = this.host.activeCameraConnectionId;
		this.#pendingNavigationDirectionBefore = this.host.activeCameraDirection;
		this.#pendingNavigationPlacementIdsBefore = [...this.host.selectedPlacementIds];
		this.#pendingNavigationClusterBefore = this.host.selectedClusterId;
		this.selectionActions.clearPlacementSelection();
		this.host.navigationSelection = null;
		this.host.activeCameraConnectionId = null;
		this.host.activeCameraDirection = 'forward';
		this.host.pendingNavigationCommand = {
			kind: 'place-camera'
		};
		this.host.setNavigationHover(null);
		this.host.setStatusMessage('Click any tagged room floor to place a camera');
		return true;
	}

	beginConnectExistingNodes() {
		if (
			this.host.isDocumentMutationBlocked ||
			this.host.isEditorInteractionActive ||
			this.host.pendingNavigationCommand
		) return false;
		const source = this.host.selectedNavigationNode;
		if (!source) {
			this.host.setStatusMessage('Select a source camera node');
			return false;
		}
		this.host.cancelAssetPlacement();
		this.host.cancelPendingFrame();
		this.#pendingNavigationSelectionBefore = cloneNavigation(
			this.host.selection.navigation
		);
		this.#pendingNavigationActiveConnectionBefore = this.host.activeCameraConnectionId;
		this.#pendingNavigationDirectionBefore = this.host.activeCameraDirection;
		this.#pendingNavigationPlacementIdsBefore = [...this.host.selectedPlacementIds];
		this.#pendingNavigationClusterBefore = this.host.selectedClusterId;
		this.host.pendingNavigationCommand = {
			kind: 'connect-existing',
			sourceNodeId: source.id
		};
		this.host.setNavigationHover(null);
		this.host.setStatusMessage('Choose another camera node');
		return true;
	}

	cancelPendingNavigation(message?: string) {
		const pending = this.host.pendingNavigationCommand;
		const changed = pending !== null;
		this.host.pendingNavigationCommand = null;
		if (changed) {
			// Slice 4 — restore via reducer. setNavigation auto-restores discovery
			// for non-'none' / non-'node' kinds; the reducer's selectionStore
			// sets the mirrored discovery from the saved nav shape.
			this.host.selection.setNavigation(this.#pendingNavigationSelectionBefore);
			this.#clearPendingNavigationSnapshot();
		}
		if (message) this.host.setStatusMessage(message);
		return changed;
	}

	createPendingNavigationNodeAt(
		roomId: MuseumRoomId,
		floorWorld: Vec3,
		cameraForwardWorld: Vec3
	) {
		const pending = this.host.pendingNavigationCommand;
		if (
			this.host.isDocumentMutationBlocked ||
			this.host.isEditorInteractionActive ||
			pending?.kind !== 'place-camera' ||
			!isFiniteVec3(floorWorld) ||
			!isFiniteVec3(cameraForwardWorld)
		) {
			return null;
		}

		let forwardX = cameraForwardWorld[0];
		let forwardZ = cameraForwardWorld[2];
		let forwardLength = Math.hypot(forwardX, forwardZ);
		if (forwardLength <= 1e-6) {
			const origin = roomPoint(roomId, [0, 0, 0]);
			const fallback = roomPoint(roomId, [0, 0, -1]);
			forwardX = fallback[0] - origin[0];
			forwardZ = fallback[2] - origin[2];
			forwardLength = Math.hypot(forwardX, forwardZ);
		}
		forwardX /= forwardLength;
		forwardZ /= forwardLength;

		let number = 1;
		const nodeIds = new Set(this.host.document.navigationNodes.map((node) => node.id));
		const nodeLabels = new Set(
			this.host.document.navigationNodes.map((node) => node.label)
		);
		while (
			nodeIds.has(`camera-node-${number}`) ||
			nodeLabels.has(`Camera Node ${number}`)
		) {
			number += 1;
		}
		const nodeId = `camera-node-${number}`;
		const eyeWorld: Vec3 = [
			floorWorld[0],
			floorWorld[1] + CAMERA_NODE_CREATION_DEFAULTS.eyeHeight,
			floorWorld[2]
		];
		const targetWorld: Vec3 = [
			floorWorld[0] + forwardX * CAMERA_NODE_CREATION_DEFAULTS.targetDistance,
			floorWorld[1] + CAMERA_NODE_CREATION_DEFAULTS.targetHeight,
			floorWorld[2] + forwardZ * CAMERA_NODE_CREATION_DEFAULTS.targetDistance
		];
		const node: SceneNavigationNode = {
			id: nodeId,
			roomId,
			label: `Camera Node ${number}`,
			position: roomLocalPoint(roomId, eyeWorld),
			cameraTarget: roomLocalPoint(roomId, targetWorld),
			fov: CAMERA_NODE_CREATION_DEFAULTS.fov,
			connectedNodeIds: []
		};
		this.host.pendingNavigationCommand = { kind: 'connect-pending-node', node };
		this.host.selection.setNavigation({
			kind: 'node',
			nodeId,
			handle: 'position'
		});
		this.host.setStatusMessage('Adjust camera pose, then choose an existing node');
		return nodeId;
	}

	connectPendingNavigationNode(destinationNodeId: string) {
		const pending = this.host.pendingNavigationCommand;
		if (
			this.host.isDocumentMutationBlocked ||
			this.host.isEditorInteractionActive ||
			(pending?.kind !== 'connect-existing' &&
				pending?.kind !== 'connect-pending-node')
		) {
			return false;
		}
		if (pending.kind === 'connect-pending-node') {
			const destination = this.host.document.navigationNodes.find(
				(node) => node.id === destinationNodeId
			);
			if (!destination) {
				this.host.setStatusMessage('Destination camera node is unavailable');
				return false;
			}
			const node = pending.node;
			const connectionId = reserveEntityId(
				`${destination.id}-${node.id}`,
				new Set(this.host.document.connections.map((connection) => connection.id))
			);
			if (!this.host.beginDocumentTransaction()) return false;
			const committedNode: SceneNavigationNode = {
				...node,
				position: [...node.position],
				cameraTarget: [...node.cameraTarget],
				connectedNodeIds: [destination.id]
			};
			this.host.document.navigationNodes.push(committedNode);
			this.#appendStraightConnection(destination, committedNode, connectionId);
			if (!this.host.commitDocumentTransaction()) return false;

			this.host.pendingNavigationCommand = null;
			this.#clearPendingNavigationSnapshot();
			this.host.selection.setNavigation({
				kind: 'connection',
				connectionId,
				direction: 'forward'
			});
			this.selectionActions.expandActiveCameraDirection('forward');
			if (this.host.currentWorkspace === 'camera') {
				this.host.syncCameraTimelineForConnection(connectionId, 'forward', 0);
				this.host.showCameraTimelineConnectionPose(connectionId, 'forward', 0);
			}
			this.host.setStatusMessage(`Added ${node.label} and its first connection`);
			return true;
		}
		return this.connectNavigationNodes(pending.sourceNodeId, destinationNodeId);
	}

	/** Commit one standalone undirected edge and symmetric adjacency transaction. */
	connectNavigationNodes(sourceNodeId: string, destinationNodeId: string) {
		if (this.host.isDocumentMutationBlocked) {
			this.host.setStatusMessage('Camera graph changes are blocked during active playback');
			return false;
		}
		if (this.host.isEditorInteractionActive || this.host.isDocumentTransactionActive) {
			this.host.setStatusMessage('Finish the active editor interaction before connecting camera nodes');
			return false;
		}
		if (
			this.host.pendingNavigationCommand &&
			(this.host.pendingNavigationCommand.kind !== 'connect-existing' ||
				this.host.pendingNavigationCommand.sourceNodeId !== sourceNodeId)
		) {
			this.host.setStatusMessage('Finish or cancel the current camera command first');
			return false;
		}
		const connectionPlan = runOrFail(this.host, () =>
			validateConnectionCreation(this.host.document, sourceNodeId, destinationNodeId)
		);
		if (!connectionPlan) return false;
		const { sourceNode: source, destinationNode: destination } = connectionPlan;
		const connectionId = reserveEntityId(
			`${source.id}-${destination.id}`,
			new Set(this.host.document.connections.map((connection) => connection.id))
		);
		if (!this.host.beginDocumentTransaction()) return false;
		this.#appendStraightConnection(source, destination, connectionId);
		if (!this.host.commitDocumentTransaction()) return false;

		if (this.host.pendingNavigationCommand?.kind === 'connect-existing') {
			this.host.pendingNavigationCommand = null;
			this.#clearPendingNavigationSnapshot();
		}
		this.host.navigationSelection = { kind: 'connection', connectionId };
		this.host.activeCameraConnectionId = connectionId;
		this.host.activeCameraDirection = 'forward';
		this.selectionActions.expandActiveCameraDirection('forward');
		if (this.host.currentWorkspace === 'camera') {
			this.host.syncCameraTimelineForConnection(connectionId, 'forward', 0);
			this.host.showCameraTimelineConnectionPose(connectionId, 'forward', 0);
		}
		this.host.setStatusMessage('Connected camera nodes');
		return true;
	}

	#appendStraightConnection(
		from: SceneNavigationNode,
		to: SceneNavigationNode,
		connectionId: string
	) {
		if (!from.connectedNodeIds.includes(to.id)) from.connectedNodeIds.push(to.id);
		if (!to.connectedNodeIds.includes(from.id)) to.connectedNodeIds.push(from.id);
		const connection: SceneConnection = {
			id: connectionId,
			fromNodeId: from.id,
			toNodeId: to.id,
			clearance: CAMERA_NODE_CREATION_DEFAULTS.clearance,
			positionPath: { kind: 'auto-bezier', anchors: [] }
		};
		this.host.document.connections.push(connection);
		return connection;
	}

	// ===================================================================
	// Guided tour ordering
	// ===================================================================

	/** Rewrite one complete reciprocal guided cycle without creating graph edges. */
	setGuidedTourOrder(nodeIds: readonly string[]) {
		if (!this.#canEditGuidedTour()) return false;
		const orderPlan = runOrFail(this.host, () =>
			validateGuidedTourOrder(this.host.document, nodeIds)
		);
		if (!orderPlan) return false;
		const committed = this.#applyGuidedTourOrder(orderPlan.nodeIds);
		if (committed) this.host.setStatusMessage('Updated guided tour order');
		return committed;
	}

	/** Insert one free camera node into an existing guided gap. */
	insertNodeIntoGuidedTour(nodeId: string, index: number) {
		if (!this.#canEditGuidedTour()) return false;
		const insertionPlan = runOrFail(this.host, () =>
			validateGuidedTourInsertion(this.host.document, nodeId, index)
		);
		if (!insertionPlan) return false;
		const node = this.host.document.navigationNodes.find(
			(candidate) => candidate.id === nodeId
		)!;
		const committed = this.#applyGuidedTourOrder(insertionPlan.nodeIds);
		if (committed) this.host.setStatusMessage(`Added ${node.label} to the guided tour`);
		return committed;
	}

	/** Remove one non-start node from the guided cycle while retaining graph topology. */
	removeNodeFromGuidedTour(nodeId: string) {
		if (!this.#canEditGuidedTour()) return false;
		const removalPlan = runOrFail(this.host, () =>
			validateGuidedTourRemoval(this.host.document, nodeId)
		);
		if (!removalPlan) return false;
		const node = this.host.document.navigationNodes.find(
			(candidate) => candidate.id === nodeId
		)!;
		const committed = this.#applyGuidedTourOrder(removalPlan.nodeIds);
		if (committed) this.host.setStatusMessage(`Removed ${node.label} from the guided tour`);
		return committed;
	}

	/**
	 * Phase 3.5 — move an existing node onto one guided timeline edge. The
	 * reciprocal cycle rewrite and optional single straight edge commit once.
	 */
	timelineDragConnectNode(
		nodeId: string,
		gapFromNodeId: string,
		gapToNodeId: string
	) {
		if (!this.#canEditGuidedTour()) return false;
		const dropPlan = runOrFail(this.host, () =>
			validateTimelineGuidedTourDrop(this.host.document, nodeId, gapFromNodeId, gapToNodeId)
		);
		if (!dropPlan) return false;

		const missing = dropPlan.missingConnection;
		const connectionId = missing
			? reserveEntityId(
					`${missing.fromNodeId}-${missing.toNodeId}`,
					new Set(this.host.document.connections.map((connection) => connection.id))
			  )
			: this.host.document.connections.find(
					(connection) =>
						(connection.fromNodeId === dropPlan.focusConnection.fromNodeId &&
							connection.toNodeId === dropPlan.focusConnection.toNodeId) ||
						(connection.fromNodeId === dropPlan.focusConnection.toNodeId &&
							connection.toNodeId === dropPlan.focusConnection.fromNodeId)
			  )?.id;
		if (!connectionId) {
			this.host.setStatusMessage('The guided connection selected for fine-tuning is unavailable');
			return false;
		}

		if (!this.host.beginDocumentTransaction()) return false;
		if (missing) {
			const from = this.host.document.navigationNodes.find(
				(node) => node.id === missing.fromNodeId
			);
			const to = this.host.document.navigationNodes.find(
				(node) => node.id === missing.toNodeId
			);
			if (!from || !to) {
				this.host.cancelDocumentTransaction();
				this.host.setStatusMessage('The timeline drag-connect endpoints became unavailable');
				return false;
			}
			this.#appendStraightConnection(from, to, connectionId);
		}
		this.#rewriteGuidedTourOrder(dropPlan.nodeIds);
		if (!this.host.commitDocumentTransaction()) return false;

		const connection = this.host.document.connections.find(
			(candidate) => candidate.id === connectionId
		)!;
		const direction: CameraConnectionDirection =
			connection.fromNodeId === dropPlan.focusConnection.fromNodeId &&
			connection.toNodeId === dropPlan.focusConnection.toNodeId
				? 'forward'
				: 'reverse';
		this.selectionActions.selectCameraConnectionDirection(connection.id, direction);
		const node = this.host.document.navigationNodes.find((candidate) => candidate.id === nodeId)!;
		this.host.setStatusMessage(
			missing
				? `Added ${node.label} to the guided tour with one straight connection`
				: `Moved ${node.label} in the guided tour`
		);
		return true;
	}

	#applyGuidedTourOrder(nodeIds: readonly string[]) {
		if (!this.host.beginDocumentTransaction()) return false;
		this.#rewriteGuidedTourOrder(nodeIds);
		return this.host.commitDocumentTransaction();
	}

	#rewriteGuidedTourOrder(nodeIds: readonly string[]) {
		const guidedIndexById = new Map(
			nodeIds.map((nodeId, index) => [nodeId, index])
		);
		for (const node of this.host.document.navigationNodes) {
			const index = guidedIndexById.get(node.id);
			if (index === undefined) {
				delete node.nextNodeId;
				delete node.previousNodeId;
				continue;
			}
			node.previousNodeId = nodeIds[(index - 1 + nodeIds.length) % nodeIds.length]!;
			node.nextNodeId = nodeIds[(index + 1) % nodeIds.length]!;
		}
	}

	#canEditGuidedTour() {
		if (this.host.isDocumentMutationBlocked) {
			this.host.setStatusMessage('Cannot edit guided order during active camera playback');
			return false;
		}
		if (this.host.isEditorInteractionActive || this.host.isDocumentTransactionActive) {
			this.host.setStatusMessage(
				'Finish the active editor interaction before editing guided order'
			);
			return false;
		}
		if (this.host.pendingNavigationCommand) {
			this.host.setStatusMessage('Finish or cancel the current camera command first');
			return false;
		}
		return true;
	}

	// ===================================================================
	// Topology deletion
	// ===================================================================

	/** Delete one non-guided, non-bridge edge and both directional view tracks. */
	deleteConnection(connectionId: string) {
		if (!this.#canRunTopologyDeletion('connection')) return false;
		const deletionPlan = runOrFail(this.host, () =>
			validateConnectionDeletion(this.host.document, connectionId)
		);
		if (!deletionPlan) return false;
		const connection = deletionPlan.connection;
		if (
			!this.#releasePausedPreviewForTopology(
				new Set(),
				new Set([connection.id])
			)
		) {
			return false;
		}

		if (!this.host.beginDocumentTransaction()) return false;
		this.host.document.connections = this.host.document.connections.filter(
			(candidate) => candidate.id !== connection.id
		);
		for (const node of this.host.document.navigationNodes) {
			if (node.id === connection.fromNodeId) {
				node.connectedNodeIds = node.connectedNodeIds.filter(
					(id) => id !== connection.toNodeId
				);
			} else if (node.id === connection.toNodeId) {
				node.connectedNodeIds = node.connectedNodeIds.filter(
					(id) => id !== connection.fromNodeId
				);
			}
		}
		if (!this.host.commitDocumentTransaction()) return false;
		this.#clearDeletedConnectionSessionState(new Set([connection.id]));
		this.host.setStatusMessage(`Deleted camera connection ${connection.id}`);
		return true;
	}

	/** Delete one free node, or splice one guided node across an existing direct edge. */
	deleteNavigationNode(nodeId: string) {
		if (!this.#canRunTopologyDeletion('node')) return false;
		const nodePlan = runOrFail(this.host, () =>
			validateNavigationNodeDeletion(this.host.document, nodeId)
		);
		if (!nodePlan) return false;
		const incidentConnectionIds = new Set(nodePlan.incidentConnectionIds);
		if (
			!this.#releasePausedPreviewForTopology(
				new Set([nodePlan.node.id]),
				incidentConnectionIds
			)
		) {
			return false;
		}

		if (!this.host.beginDocumentTransaction()) return false;
		if (nodePlan.predecessorNodeId && nodePlan.successorNodeId) {
			const predecessor = this.host.document.navigationNodes.find(
				(node) => node.id === nodePlan.predecessorNodeId
			);
			const successor = this.host.document.navigationNodes.find(
				(node) => node.id === nodePlan.successorNodeId
			);
			if (!predecessor || !successor) {
				this.host.cancelDocumentTransaction();
				this.host.setStatusMessage('The guided deletion plan became unavailable');
				return false;
			}
			predecessor.nextNodeId = successor.id;
			successor.previousNodeId = predecessor.id;
		}
		this.host.document.navigationNodes = this.host.document.navigationNodes
			.filter((node) => node.id !== nodePlan.node.id)
			.map((node) => ({
				...node,
				connectedNodeIds: node.connectedNodeIds.filter(
					(connectedNodeId) => connectedNodeId !== nodePlan.node.id
				)
			}));
		this.host.document.connections = this.host.document.connections.filter(
			(connection) => !incidentConnectionIds.has(connection.id)
		);
		if (!this.host.commitDocumentTransaction()) return false;
		this.#clearDeletedConnectionSessionState(incidentConnectionIds);
		this.host.setStatusMessage(`Deleted camera node ${nodePlan.node.label}`);
		return true;
	}

	#canRunTopologyDeletion(entity: 'node' | 'connection') {
		if (this.host.isDocumentMutationBlocked) {
			this.host.setStatusMessage(
				`Cannot delete a camera ${entity} during active camera playback`
			);
			return false;
		}
		if (this.host.isEditorInteractionActive || this.host.isDocumentTransactionActive) {
			this.host.setStatusMessage(
				`Cannot delete a camera ${entity} while an editor interaction is active`
			);
			return false;
		}
		if (this.host.pendingNavigationCommand) {
			this.host.setStatusMessage('Finish or cancel the current camera command first');
			return false;
		}
		return true;
	}

	#releasePausedPreviewForTopology(
		nodeIds: ReadonlySet<string>,
		connectionIds: ReadonlySet<string>
	) {
		const preview = this.host.cameraPreview;
		if (!preview) return true;
		let touchesDeletedTopology = false;
		if (preview.kind === 'node') {
			touchesDeletedTopology = nodeIds.has(preview.nodeId);
		} else if (preview.kind === 'connection') {
			touchesDeletedTopology =
				connectionIds.has(preview.connectionId) ||
				nodeIds.has(preview.fromNodeId) ||
				nodeIds.has(preview.toNodeId);
		} else if (preview.kind === 'transition') {
			touchesDeletedTopology =
				nodeIds.has(preview.fromNodeId) || nodeIds.has(preview.toNodeId);
			const captured = this.host.getCapturedCameraPreviewRoute(preview.runId);
			if (captured) {
				touchesDeletedTopology ||=
					captured.nodeIds.some((id) => nodeIds.has(id)) ||
					captured.edges.some((edge) => connectionIds.has(edge.connectionId));
			}
		} else {
			const timeline = this.host.getCameraTimeline();
			touchesDeletedTopology = Boolean(
				timeline &&
					(timeline.nodeBoundaries.some((boundary) => nodeIds.has(boundary.nodeId)) ||
						timeline.edges.some((edge) => connectionIds.has(edge.connectionId)))
			);
		}
		if (!touchesDeletedTopology) return true;
		if (this.host.stopCameraPreview()) return true;
		this.host.setStatusMessage('Stop the camera preview before deleting its topology');
		return false;
	}

	#clearDeletedConnectionSessionState(connectionIds: ReadonlySet<string>) {
		if (
			this.host.activeCameraConnectionId &&
			connectionIds.has(this.host.activeCameraConnectionId)
		) {
			this.host.activeCameraConnectionId = null;
			this.host.activeCameraDirection = 'forward';
		}
		this.host.treeExpandedCameraConnectionIds =
			this.host.treeExpandedCameraConnectionIds.filter((id) => !connectionIds.has(id));
		this.host.treeExpandedCameraDirectionKeys =
			this.host.treeExpandedCameraDirectionKeys.filter((key) => {
				const separatorIndex = key.lastIndexOf(CAMERA_DIRECTION_TREE_KEY_SEPARATOR);
				const connectionId = separatorIndex < 0 ? key : key.slice(0, separatorIndex);
				return !connectionIds.has(connectionId);
			});
	}

	#clearPendingNavigationSnapshot() {
		this.#pendingNavigationSelectionBefore = { kind: 'none' };
		this.#pendingNavigationActiveConnectionBefore = null;
		this.#pendingNavigationDirectionBefore = 'forward';
		this.#pendingNavigationPlacementIdsBefore = [];
		this.#pendingNavigationClusterBefore = null;
	}

	// ===================================================================
	// Timing (Phase 3.7)
	// ===================================================================

	/** Phase 3.7: write connection timing (duration + easing) for one direction. */
	setConnectionTiming(
		connectionId: string,
		direction: CameraConnectionDirection,
		timing: SceneConnectionTiming | null
	): boolean {
		if (this.host.isDocumentMutationBlocked) return false;
		const connection = this.host.document.connections.find(
			(candidate) => candidate.id === connectionId
		);
		if (!connection) {
			this.host.setStatusMessage(`Unknown connection: ${connectionId}`);
			return false;
		}
		if (timing === null && !connection.timing) return false;
		if (!this.host.beginDocumentTransaction()) return false;
		if (timing === null) {
			const current = connection.timing;
			if (!current) {
				return this.host.commitDocumentTransaction();
			}
			delete current[direction];
			if (
				current.forward === undefined &&
				current.reverse === undefined
			) {
				delete connection.timing;
			}
		} else {
			const validated = validateSceneConnectionTiming(timing);
			if (validated === null) {
				this.host.cancelDocumentTransaction();
				const reason = cameraSceneConnectionTimingFailureReason(timing) ?? 'unknown';
				this.host.setStatusMessage(`Invalid connection timing: ${reason}`);
				return false;
			}
			connection.timing = connection.timing ?? {};
			connection.timing[direction] = validated;
		}
		return this.host.commitDocumentTransaction();
	}

	/** Phase 3.7: write a destination hold in seconds; pass `null` to clear. */
	setNodeHoldSeconds(nodeId: string, holdSeconds: number | null): boolean {
		if (this.host.isDocumentMutationBlocked) return false;
		const node = this.host.document.navigationNodes.find(
			(candidate) => candidate.id === nodeId
		);
		if (!node) {
			this.host.setStatusMessage(`Unknown navigation node: ${nodeId}`);
			return false;
		}
		if (holdSeconds === null && node.holdSeconds === undefined) return false;
		if (!this.host.beginDocumentTransaction()) return false;
		if (holdSeconds === null) {
			delete node.holdSeconds;
		} else {
			if (!Number.isFinite(holdSeconds) || holdSeconds < 0) {
				this.host.cancelDocumentTransaction();
				this.host.setStatusMessage('Hold seconds must be a finite non-negative number');
				return false;
			}
			node.holdSeconds = holdSeconds;
		}
		return this.host.commitDocumentTransaction();
	}
}
