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

import type { LayoutRoomRegistry } from '$lib/project/project-layout-semantics';
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
	currentMainFlowNodeIds,
	validateCurrentGuidedTourOrder,
	validateConnectionCreation,
	validateConnectionDeletion,
	validateDetourAppend,
	validateDetourCreation,
	validateDetourNodeRemoval,
	validateDetourRemoval,
	validateGuidedTourInsertion,
	validateGuidedTourOrder,
	validateGuidedTourRemoval,
	validateNavigationNodeDeletion
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
	/** project-relative room frames for camera-node placement. */
	readonly rooms: LayoutRoomRegistry;
	readonly selection: EditorSelectionStore;
	readonly currentWorkspace: EditorWorkspace;
	/** editor-only automatic two-node guided bootstrap; relic behavior stays unchanged. */
	readonly isRelic: boolean;
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
			const origin = this.host.rooms.point(roomId, [0, 0, 0]);
			const fallback = this.host.rooms.point(roomId, [0, 0, -1]);
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
			position: this.host.rooms.localPoint(roomId, eyeWorld),
			cameraTarget: this.host.rooms.localPoint(roomId, targetWorld),
			fov: CAMERA_NODE_CREATION_DEFAULTS.fov,
			connectedNodeIds: []
		};

		// closeout (B0) — standalone placement. Every placed node
		// commits immediately as an unsequenced node; connecting
		// happens later through the ordinary connect-existing flow. The frozen
		// relic keeps the connect-pending-node contract (its checked-in graph
		// already has nodes, so the blank-graph case never fires there).
		if (!this.host.isRelic) {
			return this.#commitStandaloneNode(
				node,
				nodeId,
				`Added ${node.label} — unsequenced`
			);
		}

		// Relic path (unchanged) — a blank graph has no destination to connect
		// to, so commit standalone; otherwise stay pending until the first edge.
		if (this.host.document.navigationNodes.length === 0) {
			return this.#commitStandaloneNode(
				node,
				nodeId,
				`Added ${node.label} (first camera node)`
			);
		}

		this.host.pendingNavigationCommand = { kind: 'connect-pending-node', node };
		this.host.selection.setNavigation({
			kind: 'node',
			nodeId,
			handle: 'position'
		});
		this.host.setStatusMessage('Adjust camera pose, then choose an existing node');
		return nodeId;
	}

	/**
	 * S10.1 closeout (B0) — commit a fully-formed node as a standalone free
	 * node in one `scene` history entry, select it, and clear the placement
	 * command. Shared by the editor standalone-placement path and the relic's
	 * blank-graph first node.
	 */
	#commitStandaloneNode(
		node: SceneNavigationNode,
		nodeId: string,
		message: string
	) {
		if (!this.host.beginDocumentTransaction()) {
			this.host.pendingNavigationCommand = null;
			this.#clearPendingNavigationSnapshot();
			this.host.setStatusMessage('Could not commit the camera node');
			return null;
		}
		const committedNode: SceneNavigationNode = {
			...node,
			position: [...node.position],
			cameraTarget: [...node.cameraTarget]
		};
		this.host.document.navigationNodes.push(committedNode);
		if (!this.host.commitDocumentTransaction()) {
			this.host.pendingNavigationCommand = null;
			this.#clearPendingNavigationSnapshot();
			this.host.setStatusMessage('Could not commit the camera node');
			return null;
		}
		this.host.pendingNavigationCommand = null;
		this.#clearPendingNavigationSnapshot();
		this.host.selection.setNavigation({
			kind: 'node',
			nodeId,
			handle: 'position'
		});
		this.host.setStatusMessage(message);
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
			// S10.2 — a newly placed node seeds or appends the open flow. The
			// second node (no flow yet) seeds an open pair `1 → 2` with one
			// undirected edge: two nodes share one record, so the pair never
			// loops and both travel directions stay available. When a flow
			// exists and the chosen destination is its tail, the new node is
			// appended (`tail.next = new`) in the same transaction.
			const seedTwoNodeFlow =
				!this.host.isRelic &&
				this.host.document.navigationNodes.length === 1 &&
				destination.nextNodeId === undefined &&
				destination.previousNodeId === undefined;
			const mainFlowNodeIds = currentMainFlowNodeIds(this.host.document);
			const appendsToTail =
				!seedTwoNodeFlow &&
				mainFlowNodeIds !== null &&
				mainFlowNodeIds.at(-1) === destination.id;
			// Microcopy contract — when appending turns a live loop off, announce
			// the transition (the old tail→head record stays as an ordinary
			// connection; the loop simply stops qualifying). Compute BEFORE the
			// mutation: an open chain's only tail→head record is always distinct
			// from its N−1 transition records, so its presence is the loop test.
			const loopWasOn = appendsToTail
				? this.#flowHasDistinctClosingRecord(mainFlowNodeIds!)
				: false;
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
			if (seedTwoNodeFlow) {
				destination.nextNodeId = committedNode.id;
				committedNode.previousNodeId = destination.id;
			} else if (appendsToTail) {
				// A legacy closed cycle's derived tail still carries its wraparound
				// next link; appending dissolves the closure (the head's reciprocal
				// previous link clears with it) before writing the open append.
				if (destination.nextNodeId !== undefined) {
					delete destination.nextNodeId;
					const headId = mainFlowNodeIds[0];
					const head = this.host.document.navigationNodes.find(
						(node) => node.id === headId
					);
					if (head) delete head.previousNodeId;
				}
				destination.nextNodeId = committedNode.id;
				committedNode.previousNodeId = destination.id;
			}
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
			const headLabel =
				this.host.document.navigationNodes.find(
					(candidate) => candidate.id === mainFlowNodeIds?.[0]
				)?.label ?? mainFlowNodeIds?.[0] ?? '';
			this.host.setStatusMessage(
				seedTwoNodeFlow
					? `Added ${node.label} and started a two-node camera flow`
					: appendsToTail
						? loopWasOn
							? `${node.label} is now the end of the tour. The loop from ${destination.label} → ${headLabel} is inactive. Draw ${node.label} → ${headLabel} to loop`
							: `Added ${node.label} after ${destination.label} — the path now ends at ${node.label}`
						: `Added ${node.label} and its first connection`
			);
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
		// S10.1 closeout (B0) — a two-node open-pair seed. Connecting the only
		// two free nodes in an editor project writes the open order source →
		// destination in the same transaction, so preview is ready immediately
		// (the pair's single edge covers both directions). The relic and any
		// larger graph stay purely topological — ordering there is the Sequence
		// Inspector's job.
		const seedTwoNodeFlow =
			!this.host.isRelic &&
			this.host.document.navigationNodes.length === 2 &&
			source.nextNodeId === undefined &&
			source.previousNodeId === undefined &&
			destination.nextNodeId === undefined &&
			destination.previousNodeId === undefined;
		// Loop-appears microcopy — compute before the mutation: if the new edge
		// joins the flow head and tail, it is the distinct closing record and
		// the derived loop turns on. Announce it; never silent.
		const mainFlowNodeIds = currentMainFlowNodeIds(this.host.document);
		const closesLoop =
			mainFlowNodeIds !== null &&
			mainFlowNodeIds.length >= 3 &&
			!this.#flowHasDistinctClosingRecord(mainFlowNodeIds) &&
			((source.id === mainFlowNodeIds[0] && destination.id === mainFlowNodeIds.at(-1)) ||
				(source.id === mainFlowNodeIds.at(-1) && destination.id === mainFlowNodeIds[0]));
		const connectionId = reserveEntityId(
			`${source.id}-${destination.id}`,
			new Set(this.host.document.connections.map((connection) => connection.id))
		);
		if (!this.host.beginDocumentTransaction()) return false;
		this.#appendStraightConnection(source, destination, connectionId);
		if (seedTwoNodeFlow) {
			source.nextNodeId = destination.id;
			destination.previousNodeId = source.id;
		}
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
		const tailLabel =
			this.host.document.navigationNodes.find(
				(candidate) => candidate.id === mainFlowNodeIds?.at(-1)
			)?.label ?? mainFlowNodeIds?.at(-1) ?? '';
		const headLabel =
			this.host.document.navigationNodes.find(
				(candidate) => candidate.id === mainFlowNodeIds?.[0]
			)?.label ?? mainFlowNodeIds?.[0] ?? '';
		this.host.setStatusMessage(
			seedTwoNodeFlow
				? `Connected ${source.label} and ${destination.label} — started a two-node camera flow`
				: closesLoop
					? `The path now loops: ${tailLabel} → ${headLabel}`
					: 'Connected camera nodes'
		);
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

	/**
	 * S10.2 — distinct-connection loop test on the document (tail→head record
	 * present and distinct from the open chain's N−1 transitions). For N ≥ 3
	 * the tail→head pair is never a consecutive chain pair, so presence alone
	 * decides; a two-node pair's only record IS its chain transition and never
	 * loops (T5/T8). Mirrors `getFlowLoopConnectionId` on the resolved graph.
	 */
	#flowHasDistinctClosingRecord(mainFlowNodeIds: readonly string[]) {
		const headId = mainFlowNodeIds[0];
		const tailId = mainFlowNodeIds.at(-1);
		if (headId === undefined || tailId === undefined || headId === tailId) return false;
		if (mainFlowNodeIds.length < 3) return false;
		return this.host.document.connections.some(
			(connection) =>
				(connection.fromNodeId === headId && connection.toNodeId === tailId) ||
				(connection.fromNodeId === tailId && connection.toNodeId === headId)
		);
	}

	// ===================================================================
	// Camera flow ordering
	// ===================================================================

	/** Rewrite one complete reciprocal guided cycle without creating graph edges. */
	setGuidedTourOrder(nodeIds: readonly string[]) {
		if (!this.#canEditGuidedTour()) return false;
		const orderPlan = runOrFail(this.host, () =>
			validateGuidedTourOrder(this.host.document, nodeIds)
		);
		if (!orderPlan) return false;
		const committed = this.#applyGuidedTourOrder(orderPlan.nodeIds);
		if (committed) this.host.setStatusMessage('Updated camera flow order');
		return committed;
	}	/**
	 * P1.8 D2 — Insert one unsequenced camera node into an existing flow gap.
	 * Strict: no silent connection creation. Both gap edges must already
	 * exist; otherwise the validator rejects with copy naming the missing
	 * pair.
	 */
	insertNodeIntoGuidedTour(nodeId: string, index: number) {
		if (!this.#canEditGuidedTour()) return false;
		const insertionPlan = runOrFail(this.host, () =>
			validateGuidedTourInsertion(this.host.document, nodeId, index)
		);
		if (!insertionPlan) return false;
		const node = this.host.document.navigationNodes.find(
			(candidate) => candidate.id === nodeId
		)!;
		if (!this.host.beginDocumentTransaction()) return false;
		this.#rewriteGuidedTourOrder(insertionPlan.nodeIds);
		if (!this.host.commitDocumentTransaction()) return false;
		const labels = insertionPlan.nodeIds.map(
			(candidate) =>
				this.host.document.navigationNodes.find((n) => n.id === candidate)?.label ??
				candidate
		);
		const indexOfNode = insertionPlan.nodeIds.indexOf(node.id);
		const message =
			indexOfNode === 0
				? `Added ${node.label} before ${labels[1]} — ${node.label} now leads the tour`
				: indexOfNode === insertionPlan.nodeIds.length - 1
					? `Added ${node.label} after ${labels.at(-2)} — the path now ends at ${node.label}`
					: `Added ${node.label} between ${labels[indexOfNode - 1]} and ${labels[indexOfNode + 1]}`;
		this.host.setStatusMessage(message);
		return true;
	}

	/**
	 * P1.8 D1 — Re-root: set one node as the new sequence first. Preserves
	 * the valid forward suffix from that node (consecutive chain links are
	 * always connected), demotes earlier nodes to Unsequenced, one history
	 * entry. No new mutator path needed — computes the suffix and calls
	 * `setGuidedTourOrder`.
	 */
	reRootGuidedTour(nodeId: string) {
		if (!this.#canEditGuidedTour()) return false;
		const current = validateCurrentGuidedTourOrder(this.host.document);
		if (!current.ok) {
			this.host.setStatusMessage(current.message);
			return false;
		}
		const currentIndex = current.nodeIds.indexOf(nodeId);
		if (currentIndex < 0) {
			this.host.setStatusMessage(
				`${this.host.document.navigationNodes.find((n) => n.id === nodeId)?.label ?? nodeId} is not on the camera flow`
			);
			return false;
		}
		// D4 — re-root that would leave a one-stop (two-node) sequence rejects.
		// The forward suffix from the node is [node, ...rest]; if that suffix
		// has fewer than 2 nodes, the new sequence would violate the minimum.
		const suffix = current.nodeIds.slice(currentIndex);
		if (suffix.length < 2) {
			this.host.setStatusMessage(
				`Cannot set ${this.host.document.navigationNodes.find((n) => n.id === nodeId)?.label ?? nodeId} as first — the sequence must keep at least two stops`
			);
			return false;
		}
		// The suffix is already a valid connected chain (consecutive pairs are
		// chain transitions). The order rewrite demotes everything before
		// `nodeId` to Unsequenced (their links clear).
		return this.setGuidedTourOrder(suffix);
	}

	/** Remove one non-start node from the flow while retaining graph topology. */
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
		if (committed) {
			this.host.setStatusMessage(
				`Removed ${node.label} from the path — ${node.label} is now unsequenced`
			);
		}
		return committed;
	}

	// ===================================================================
	// Detours (S10.2)
	// ===================================================================

	/**
	 * S10.2 — branch a free node from a main-route origin. The origin–head
	 * edge is auto-created when missing (F5): a one-node detour needs no
	 * extra edge — origin ↔ head is one undirected record serving both the
	 * chain and the return.
	 */
	addDetourNode(originNodeId: string, headNodeId: string) {
		if (!this.#canEditGuidedTour()) return false;
		const detourPlan = runOrFail(this.host, () =>
			validateDetourCreation(this.host.document, originNodeId, headNodeId)
		);
		if (!detourPlan) return false;
		if (!this.host.beginDocumentTransaction()) return false;
		const head = this.host.document.navigationNodes.find(
			(node) => node.id === headNodeId
		)!;
		head.detourOfNodeId = originNodeId;
		this.#ensureConnectionBetween(originNodeId, headNodeId);
		if (!this.host.commitDocumentTransaction()) return false;
		this.host.setStatusMessage(
			`Detour added at ${detourPlan.originNode.label}: ${head.label}`
		);
		return true;
	}

	/**
	 * S10.2 — append a free node to an existing detour. Creates the tail–new
	 * chain edge when missing, and ensures the new tail → origin return edge
	 * exists (F5 — create once, never delete).
	 */
	appendDetourNode(originNodeId: string, newNodeId: string) {
		if (!this.#canEditGuidedTour()) return false;
		const detourPlan = runOrFail(this.host, () =>
			validateDetourAppend(this.host.document, originNodeId, newNodeId)
		);
		if (!detourPlan) return false;
		if (!this.host.beginDocumentTransaction()) return false;
		const tail = this.host.document.navigationNodes.find(
			(node) => node.id === detourPlan.tailId
		)!;
		const newNode = this.host.document.navigationNodes.find(
			(node) => node.id === newNodeId
		)!;
		tail.nextNodeId = newNode.id;
		newNode.previousNodeId = tail.id;
		this.#ensureConnectionBetween(tail.id, newNode.id);
		this.#ensureConnectionBetween(newNode.id, originNodeId);
		if (!this.host.commitDocumentTransaction()) return false;
		this.host.setStatusMessage(
			`Added ${newNode.label} to the detour at ${detourPlan.originNode.label}`
		);
		return true;
	}

	/**
	 * S10.2 — remove one node from a detour chain (order-only; edges stay
	 * authored). Strict per T9: a new pred–succ adjacency must already have a
	 * connection. Removing the head transfers the origin marker to the new
	 * head; removing the last node clears the whole detour.
	 */
	removeDetourNode(originNodeId: string, nodeId: string) {
		if (!this.#canEditGuidedTour()) return false;
		const detourPlan = runOrFail(this.host, () =>
			validateDetourNodeRemoval(this.host.document, originNodeId, nodeId)
		);
		if (!detourPlan) return false;
		if (!this.host.beginDocumentTransaction()) return false;
		const node = this.host.document.navigationNodes.find(
			(candidate) => candidate.id === nodeId
		)!;
		const predecessorNodeId = node.previousNodeId;
		const successorNodeId = node.nextNodeId;
		if (predecessorNodeId && successorNodeId) {
			const predecessor = this.host.document.navigationNodes.find(
				(candidate) => candidate.id === predecessorNodeId
			)!;
			const successor = this.host.document.navigationNodes.find(
				(candidate) => candidate.id === successorNodeId
			)!;
			predecessor.nextNodeId = successor.id;
			successor.previousNodeId = predecessor.id;
		} else if (predecessorNodeId) {
			const predecessor = this.host.document.navigationNodes.find(
				(candidate) => candidate.id === predecessorNodeId
			)!;
			delete predecessor.nextNodeId;
		} else if (successorNodeId) {
			const successor = this.host.document.navigationNodes.find(
				(candidate) => candidate.id === successorNodeId
			)!;
			delete successor.previousNodeId;
			successor.detourOfNodeId = originNodeId;
		}
		delete node.previousNodeId;
		delete node.nextNodeId;
		delete node.detourOfNodeId;
		if (!this.host.commitDocumentTransaction()) return false;
		this.host.setStatusMessage(
			`Removed ${node.label} from the detour — the camera node is kept as free`
		);
		return true;
	}

	/** S10.2 — remove a whole detour: chain nodes become free, edges stay authored. */
	removeDetour(originNodeId: string) {
		if (!this.#canEditGuidedTour()) return false;
		const detourPlan = runOrFail(this.host, () =>
			validateDetourRemoval(this.host.document, originNodeId)
		);
		if (!detourPlan) return false;
		if (!this.host.beginDocumentTransaction()) return false;
		for (const nodeId of detourPlan.chainNodeIds) {
			const node = this.host.document.navigationNodes.find(
				(candidate) => candidate.id === nodeId
			)!;
			delete node.previousNodeId;
			delete node.nextNodeId;
			delete node.detourOfNodeId;
		}
		if (!this.host.commitDocumentTransaction()) return false;
		this.host.setStatusMessage(
			`Removed the detour at ${detourPlan.originNode.label} — the camera nodes are kept as free`
		);
		return true;
	}

	#applyGuidedTourOrder(nodeIds: readonly string[]) {
		if (!this.host.beginDocumentTransaction()) return false;
		this.#rewriteGuidedTourOrder(nodeIds);
		return this.host.commitDocumentTransaction();
	}

	/**
	 * S10.2 — rewrite one complete open-chain order. No wraparound: the head
	 * keeps `previousNodeId` undefined and the tail keeps `nextNodeId`
	 * undefined; nodes outside the order lose all links UNLESS they belong to
	 * a detour chain — detour order links are separate components and must
	 * survive every main-flow rewrite (F4/F5).
	 */
	#rewriteGuidedTourOrder(nodeIds: readonly string[]) {
		const guidedIndexById = new Map(
			nodeIds.map((nodeId, index) => [nodeId, index])
		);
		const detourNodeIds = this.#collectDetourNodeIds(new Set(nodeIds));
		for (const node of this.host.document.navigationNodes) {
			const index = guidedIndexById.get(node.id);
			if (index === undefined) {
				if (detourNodeIds.has(node.id)) continue;
				delete node.nextNodeId;
				delete node.previousNodeId;
				continue;
			}
			if (index === 0) {
				delete node.previousNodeId;
				node.nextNodeId = nodeIds[1];
			} else if (index === nodeIds.length - 1) {
				node.previousNodeId = nodeIds[index - 1]!;
				delete node.nextNodeId;
			} else {
				node.previousNodeId = nodeIds[index - 1]!;
				node.nextNodeId = nodeIds[index + 1]!;
			}
		}
	}

	/**
	 * S10.2 — every node in a detour chain (heads carry `detourOfNodeId`;
	 * interior nodes are reachable through prev/next links from a head and
	 * carry no marker). Main-flow order rewrites must never touch these
	 * links. The walk never crosses into the main flow: a detour head has no
	 * `previousNodeId`, and F5's return is an edge, not an order link — so
	 * following prev/next from a head only ever visits the chain. The main
	 * flow id set is a defensive guard regardless.
	 */
	#collectDetourNodeIds(mainFlowIds: ReadonlySet<string>): ReadonlySet<string> {
		const nodes = this.host.document.navigationNodes;
		const nodeById = new Map(nodes.map((node) => [node.id, node]));
		const heads = nodes.filter((node) => node.detourOfNodeId !== undefined);
		const detourNodeIds = new Set<string>();
		const queue = heads.map((head) => head.id);
		while (queue.length > 0) {
			const nodeId = queue.pop()!;
			if (detourNodeIds.has(nodeId) || mainFlowIds.has(nodeId)) continue;
			detourNodeIds.add(nodeId);
			const node = nodeById.get(nodeId);
			if (!node) continue;
			for (const linkedId of [node.nextNodeId, node.previousNodeId]) {
				if (linkedId === undefined) continue;
				queue.push(linkedId);
			}
		}
		return detourNodeIds;
	}

	/** Ensure an undirected edge exists between two nodes (F5 — create once, never delete). */
	#ensureConnectionBetween(fromNodeId: string, toNodeId: string) {
		if (fromNodeId === toNodeId) return null;
		const existing = this.host.document.connections.find(
			(connection) =>
				(connection.fromNodeId === fromNodeId && connection.toNodeId === toNodeId) ||
				(connection.fromNodeId === toNodeId && connection.toNodeId === fromNodeId)
		);
		if (existing) return existing.id;
		const from = this.host.document.navigationNodes.find(
			(node) => node.id === fromNodeId
		);
		const to = this.host.document.navigationNodes.find((node) => node.id === toNodeId);
		if (!from || !to) return null;
		const connectionId = reserveEntityId(
			`${fromNodeId}-${toNodeId}`,
			new Set(this.host.document.connections.map((connection) => connection.id))
		);
		this.#appendStraightConnection(from, to, connectionId);
		return connectionId;
	}

	#canEditGuidedTour() {
		if (this.host.isDocumentMutationBlocked) {
			this.host.setStatusMessage('Cannot edit the camera flow during active camera playback');
			return false;
		}
		if (this.host.isEditorInteractionActive || this.host.isDocumentTransactionActive) {
			this.host.setStatusMessage(
				'Finish the active editor interaction before editing the camera flow'
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

	/** Delete one free node, or splice one flow node across an existing direct edge. */
	deleteNavigationNode(nodeId: string) {
		if (!this.#canRunTopologyDeletion('node')) return false;
		const nodePlan = runOrFail(this.host, () =>
			validateNavigationNodeDeletion(this.host.document, nodeId)
		);
		if (!nodePlan) return false;
		const deletedNodeIds = new Set([
			nodePlan.node.id,
			...(nodePlan.detourChainNodeIds ?? [])
		]);
		const incidentConnectionIds = new Set(nodePlan.incidentConnectionIds);
		if (
			!this.#releasePausedPreviewForTopology(
				deletedNodeIds,
				incidentConnectionIds
			)
		) {
			return false;
		}

		if (!this.host.beginDocumentTransaction()) return false;
		const predecessorNodeId = nodePlan.predecessorNodeId;
		const successorNodeId = nodePlan.successorNodeId;
		if (predecessorNodeId && successorNodeId) {
			const predecessor = this.host.document.navigationNodes.find(
				(node) => node.id === predecessorNodeId
			);
			const successor = this.host.document.navigationNodes.find(
				(node) => node.id === successorNodeId
			);
			if (!predecessor || !successor) {
				this.host.cancelDocumentTransaction();
				this.host.setStatusMessage('The flow deletion plan became unavailable');
				return false;
			}
			predecessor.nextNodeId = successor.id;
			successor.previousNodeId = predecessor.id;
		} else if (predecessorNodeId) {
			const predecessor = this.host.document.navigationNodes.find(
				(node) => node.id === predecessorNodeId
			);
			if (!predecessor) {
				this.host.cancelDocumentTransaction();
				this.host.setStatusMessage('The flow deletion plan became unavailable');
				return false;
			}
			delete predecessor.nextNodeId;
		} else if (successorNodeId) {
			const successor = this.host.document.navigationNodes.find(
				(node) => node.id === successorNodeId
			);
			if (!successor) {
				this.host.cancelDocumentTransaction();
				this.host.setStatusMessage('The flow deletion plan became unavailable');
				return false;
			}
			delete successor.previousNodeId;
		}
		this.host.document.navigationNodes = this.host.document.navigationNodes
			.filter((node) => !deletedNodeIds.has(node.id))
			.map((node) => ({
				...node,
				connectedNodeIds: node.connectedNodeIds.filter(
					(connectedNodeId) => !deletedNodeIds.has(connectedNodeId)
				)
			}));
		this.host.document.connections = this.host.document.connections.filter(
			(connection) => !incidentConnectionIds.has(connection.id)
		);
		const originLabel = nodePlan.detourOriginNodeId
			? (this.host.document.navigationNodes.find(
					(node) => node.id === nodePlan.detourOriginNodeId
			  )?.label ?? nodePlan.detourOriginNodeId)
			: undefined;
		if (!this.host.commitDocumentTransaction()) return false;
		this.#clearDeletedConnectionSessionState(incidentConnectionIds);
		if (nodePlan.detourChainNodeIds && nodePlan.detourChainNodeIds.length > 0) {
			this.host.setStatusMessage(
				`Deleted camera node ${nodePlan.node.label} and the detour at ${originLabel}`
			);
		} else {
			this.host.setStatusMessage(`Deleted camera node ${nodePlan.node.label}`);
		}
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
