/**
 * `EditorViewKeyframeController` — directional camera view-keyframe authoring /
 * framing / progress-drag / timing mutation controller (Phase 9.3).
 *
 * The god file (`museum-editor.svelte.ts`) historically owned every
 * view-keyframe *write*: adding a key at the paused Director playhead, editing
 * its world target / FOV, moving its progress (both single-commit and the
 * cancel-safe drag), deleting it, mirroring one directional track onto the
 * other, leaving key editing, and per-key hold/easing timing. Phase 9.3
 * hard-moves those method bodies here, following the
 * `EditorNavigationGraphMutator` + host-injection pattern.
 *
 * `MuseumEditorStore` keeps identical public method signatures as thin
 * delegates (`addViewKeyframeAtPlayhead() { return this.viewKeyframeController
 * .addViewKeyframeAtPlayhead(); }`), so components keep importing the store
 * facade unchanged.
 *
 * Everything the composition root still owns — mutation guards, the document /
 * framing transaction wrappers, selection reducer access, camera-preview /
 * timeline sync + seek/select, status channel — is reached through the injected
 * `EditorViewKeyframeControllerHost`. The controller never touches the document
 * store, history controller, or preview controller directly; it uses the same
 * live-mutate + `begin/commit` transaction pattern the god file used.
 */

import {
	createNavigationGraph,
	resolveSceneDocument,
	type MuseumSceneDocument,
	type SceneCameraViewKeyframe,
	type SceneConnection,
	type ScenePathAnchor
} from '$lib/content/scene';
import type { LayoutRoomRegistry } from '$lib/project/project-layout-semantics';
import {
	MUSEUM_CAMERA_EASING,
	MUSEUM_CAMERA_FOV,
	type CameraConnectionDirection,
	type CameraEasing,
	type MuseumRoomId,
	type Vec3
} from '$lib/types/museum';
import {
	cameraMotionEdgeProgressAtProgress,
	cameraMotionProgressAtEdgeProgress,
	createCameraMotion,
	createCameraMotionSample,
	sampleCameraMotion,
	type Vector3Like
} from '$lib/museum/navigation/camera-motion';
import {
	getCameraConnectionRoute,
	type ResolvedCameraRoute
} from '$lib/museum/navigation/camera-route';
import {
	createDraftConnectionPositionPath,
	findNearestCurveProgress,
	getScenePathAnchorWorldPosition
} from '../editor-camera-path';
import {
	allocateCameraViewKeyframeId,
	createSceneCameraViewKeyframeAtWorldTarget,
	mirrorCameraViewTrack,
	syncReverseViewTrackFromForward,
	EDITOR_CAMERA_VIEW_MOVE_EPSILON,
	EDITOR_CAMERA_VIEW_PROGRESS_EPSILON,
	findSceneCameraViewKeyframe,
	getSceneCameraViewKeyframeWorldPosition,
	getSceneCameraViewKeyframeWorldTarget,
	orbitWorldLookTarget,
	writeSceneCameraViewKeyframeWorldTarget
} from '../editor-camera-view';
import {
	cameraTimelineProgressAtEdgeProgress,
	type EditorCameraTimeline
} from '../editor-camera-timeline';
import type { EditorNavigationSelection } from '../editor-selection';
import type {
	EditorCameraPreview,
	EditorPendingNavigationCommand,
	EditorViewKeyframeProgressDragSelection
} from '../museum-editor.types';
import type { EditorSelectionStore } from './selection-store.svelte';
import type { EditorSelectionActions } from './selection-actions.svelte';
import {
	createAutoManagedFramingEnvelope,
	isOrderedCameraFramingEnvelope,
	markFramingEnvelopeManual,
	updateFramingEnvelopeForKeyProgresses,
	type CameraFramingEnvelopePolicyState
} from '../editor-camera-framing-envelope';
import {
	CENTERED_SEED,
	mirrorFramingEnvelope,
	type EnvelopeHandleName
} from '../editor-camera-framing-authoring';
import type { CameraFramingEnvelope } from '$lib/content/scene';

type ConnectionCameraPreview = Extract<
	Exclude<EditorCameraPreview, null>,
	{ kind: 'connection' }
>;

function vec3Matches(a: Vec3, b: Vec3) {
	return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function vec3Distance(a: Vec3, b: Vec3) {
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function isFiniteVec3(value: Vec3) {
	return value.every(Number.isFinite);
}

/**
 * Composition-root surface the view-keyframe controller depends on. Everything
 * here stays owned by `MuseumEditorStore`; the controller never mutates the
 * document store, history controller, or preview controller directly, only
 * through the transaction wrappers and accessors exposed below.
 */
export interface EditorViewKeyframeControllerHost {
	// Mutation guards.
	readonly isDocumentMutationBlocked: boolean;
	readonly isCameraFramingMutationBlocked: boolean;
	readonly isEditorInteractionActive: boolean;
	readonly isDocumentTransactionActive: boolean;
	/** True while a document/framing transaction is open on the history controller. */
	readonly historyDocumentUndoBlocked: boolean;
	/** True while a framing (as opposed to plain document) transaction is open. */
	readonly historyFramingTransactionActive: boolean;
	readonly pendingNavigationCommand: EditorPendingNavigationCommand;

	// Document + selection state.
	readonly document: MuseumSceneDocument;
	readonly rooms: LayoutRoomRegistry;
	readonly selection: EditorSelectionStore;
	readonly selectedConnection: SceneConnection | undefined;
	readonly selectedAnchor: ScenePathAnchor | undefined;
	readonly selectedViewKeyframe: SceneCameraViewKeyframe | undefined;
	readonly selectedRoomId: MuseumRoomId | null;
	readonly cameraPreview: EditorCameraPreview;

	navigationSelection: EditorNavigationSelection;
	viewKeyframeProgressDrag: EditorViewKeyframeProgressDragSelection | null;
	cameraTimelinePlayhead: number;

	// Status channel.
	setStatusMessage(message: string | null): void;

	// Document / framing transaction wrappers (guard-aware; seed reverse on commit).
	beginDocumentTransaction(): boolean;
	beginCameraFramingTransaction(): boolean;
	commitDocumentTransaction(): boolean;
	cancelDocumentTransaction(): boolean;

	/**
	 * Seed the reverse view track from forward for the selected forward key.
	 * Owned by the store because `commitDocumentTransaction` also invokes it.
	 */
	seedEmptyReverseForSelectedForwardTrack(): boolean;

	// Camera preview / timeline (seek/select stays on the store — 9.4).
	getCameraTimeline(): EditorCameraTimeline | null;
	getCapturedCameraPreviewRoute(runId: number): ResolvedCameraRoute | null;
	allocPreviewRunId(): number;
	setCapturedPreviewRoute(runId: number, route: ResolvedCameraRoute): void;
	setCameraPreview(value: EditorCameraPreview): void;
	setCameraPreviewPlayhead(progress: number, runId?: number): boolean;
	selectCameraTimelineViewKeyframe(
		connectionId: string,
		direction: CameraConnectionDirection,
		keyframeId: string
	): boolean;
}

export class EditorViewKeyframeController {
	/** Phase 2.4 progress drag. The original progress stays private with the transaction. */
	#viewKeyframeProgressDragInitialProgress: number | null = null;

	/** P1.6 envelope-handle drag. Snapshot of document + policy for cancel-safe restore. */
	#framingEnvelopeHandleDrag: {
		connectionId: string;
		direction: CameraConnectionDirection;
		initialEnvelope: CameraFramingEnvelope;
		initialPolicy: CameraFramingEnvelopePolicyState | null;
	} | null = null;

	/**
	 * F2 — Session-only framing-envelope policy state. Keyed by
	 * `${connectionId}:${direction}`. Not serialized; reconciled from the live
	 * document on every `replace()` (commit, undo, redo, import, reset).
	 */
	readonly #envelopePolicy = new Map<string, CameraFramingEnvelopePolicyState>();

	constructor(
		private readonly selectionActions: EditorSelectionActions,
		private readonly host: EditorViewKeyframeControllerHost
	) {}

	// ===================================================================
	 // F2 — Envelope policy reconciliation
	 // ===================================================================

	/** Read the current policy state for one connection+direction, or null. */
	getEnvelopePolicy(
		connectionId: string,
		direction: CameraConnectionDirection
	): CameraFramingEnvelopePolicyState | null {
		return this.#envelopePolicy.get(`${connectionId}:${direction}`) ?? null;
	}

	/** Write (stage) a policy state for one connection+direction. */
	setEnvelopePolicy(
		connectionId: string,
		direction: CameraConnectionDirection,
		state: CameraFramingEnvelopePolicyState
	): void {
		this.#envelopePolicy.set(`${connectionId}:${direction}`, state);
	}

	/** Remove the policy state for one connection+direction. */
	deleteEnvelopePolicy(
		connectionId: string,
		direction: CameraConnectionDirection
	): void {
		this.#envelopePolicy.delete(`${connectionId}:${direction}`);
	}

	/**
	 * F2 — Reconcile session-only policy from the live document after every
	 * `replace()` (commit, undo, redo, import, reset). Keep management only
	 * when the live envelope equals the staged envelope; unknown/different
	 * values reconcile to `manual`; missing directions are pruned.
	 */
	afterDocumentReplaced(): void {
		const document = this.host.document;
		const stagedKeys = [...this.#envelopePolicy.keys()];
		const liveKeys = new Set<string>();

		for (const connection of document.connections) {
			const viewTracks = connection.viewTracks;
			if (!viewTracks) continue;
			for (const direction of ['forward', 'reverse'] as const) {
				const liveEnvelope = viewTracks.framingEnvelope?.[direction];
				const key = `${connection.id}:${direction}`;
				if (!liveEnvelope) {
					// No envelope on the live document — prune the staged policy.
					this.#envelopePolicy.delete(key);
					continue;
				}
				liveKeys.add(key);
				const staged = this.#envelopePolicy.get(key);
				if (
					staged &&
						staged.management === 'auto' &&
						isOrderedCameraFramingEnvelope(liveEnvelope) &&
						liveEnvelope.enterStart === staged.envelope.enterStart &&
						liveEnvelope.enterEnd === staged.envelope.enterEnd &&
						liveEnvelope.exitStart === staged.envelope.exitStart &&
						liveEnvelope.exitEnd === staged.envelope.exitEnd
				) {
					// Live matches staged auto — keep management.
					continue;
				}
				// Unknown, different, or staged-manual: reconcile to manual.
				if (isOrderedCameraFramingEnvelope(liveEnvelope)) {
					this.#envelopePolicy.set(key, {
						envelope: { ...liveEnvelope },
						management: 'manual'
					});
				} else {
					this.#envelopePolicy.delete(key);
				}
			}
		}

		// Prune staged keys that no longer exist on the live document.
		for (const key of stagedKeys) {
			if (!liveKeys.has(key)) {
				this.#envelopePolicy.delete(key);
			}
		}
	}

	// ===================================================================
	// P1.6 — Envelope policy binding (auto-managed + mirror)
	// ===================================================================

	#envelopeKey(connectionId: string, direction: CameraConnectionDirection): string {
		return `${connectionId}:${direction}`;
	}

	#directionalKeyProgresses(
		connection: SceneConnection,
		direction: CameraConnectionDirection
	): number[] {
		return (connection.viewTracks?.[direction] ?? []).map((key) => key.progress);
	}

	/**
	 * Seed the first directional key's centered auto envelope, or expand an
	 * existing auto envelope to contain the current keys. Manual envelopes are
	 * left untouched; envelopes without policy are reconciled later.
	 */
	#reconcileEnvelopeAfterKeyChange(
		connection: SceneConnection,
		direction: CameraConnectionDirection
	): void {
		const tracks = connection.viewTracks;
		if (!tracks) return;
		const existingEnvelope = tracks.framingEnvelope?.[direction];
		const keyProgresses = this.#directionalKeyProgresses(connection, direction);

		if (!existingEnvelope) {
			if (keyProgresses.length === 0) return;
			const seeded = createAutoManagedFramingEnvelope(keyProgresses[0], CENTERED_SEED);
			tracks.framingEnvelope ??= {};
			tracks.framingEnvelope[direction] = { ...seeded.envelope };
			this.setEnvelopePolicy(connection.id, direction, {
				envelope: { ...seeded.envelope },
				management: 'auto'
			});
			return;
		}

		const policy = this.getEnvelopePolicy(connection.id, direction);
		if (!policy) return;
		const next = updateFramingEnvelopeForKeyProgresses(policy, keyProgresses);
		if (next === policy) return;
		tracks.framingEnvelope ??= {};
		tracks.framingEnvelope[direction] = { ...next.envelope };
		this.setEnvelopePolicy(connection.id, direction, next);
	}

	/** Mirror the forward envelope onto reverse while reverse stays auto-managed. */
	#syncReverseEnvelopeFromForward(connection: SceneConnection): void {
		const tracks = connection.viewTracks;
		const forward = tracks?.framingEnvelope?.forward;
		if (!tracks || !forward) return;
		const reversePolicy = this.getEnvelopePolicy(connection.id, 'reverse');
		if (reversePolicy?.management === 'manual') return;
		const mirrored = mirrorFramingEnvelope(forward);
		tracks.framingEnvelope ??= {};
		tracks.framingEnvelope.reverse = { ...mirrored };
		this.setEnvelopePolicy(connection.id, 'reverse', {
			envelope: { ...mirrored },
			management: 'auto'
		});
	}

	/** Reconcile the edited direction, then mirror reverse for forward edits. */
	#reconcileEditedDirection(
		connection: SceneConnection,
		direction: CameraConnectionDirection
	): void {
		this.#reconcileEnvelopeAfterKeyChange(connection, direction);
		if (direction === 'forward') {
			this.#syncReverseEnvelopeFromForward(connection);
		}
	}

	/**
	 * P1.6 — Apply a focus-timing preset. Writes the exact preset, marks the
	 * direction manual (F5), and mirrors a forward edit onto the auto-managed
	 * reverse envelope. An equal preset produces no document delta (so no
	 * history entry) but still stages manual policy.
	 */
	applyFocusTimingPreset(
		connectionId: string,
		direction: CameraConnectionDirection,
		envelope: CameraFramingEnvelope
	): boolean {
		if (
			this.host.isDocumentMutationBlocked ||
			this.host.isEditorInteractionActive ||
			!isOrderedCameraFramingEnvelope(envelope)
		) {
			return false;
		}
		const connection = this.host.document.connections.find(
			(candidate) => candidate.id === connectionId
		);
		if (!connection || !this.host.beginDocumentTransaction()) return false;
		connection.viewTracks ??= { forward: [], reverse: [] };
		connection.viewTracks.framingEnvelope ??= {};
		connection.viewTracks.framingEnvelope[direction] = { ...envelope };
		this.setEnvelopePolicy(connectionId, direction, {
			envelope: { ...envelope },
			management: 'manual'
		});
		if (direction === 'forward') {
			this.#syncReverseEnvelopeFromForward(connection);
		}
		return this.host.commitDocumentTransaction();
	}

	/** P1.6 — Full Move preset (`w = 1` escape hatch). */
	applyFullMovePreset(
		connectionId: string,
		direction: CameraConnectionDirection
	): boolean {
		return this.applyFocusTimingPreset(connectionId, direction, {
			enterStart: 0,
			enterEnd: 0,
			exitStart: 1,
			exitEnd: 1
		});
	}

	/**
	 * P1.6 — Commit an advanced handle edit. Ordered-invalid drafts do not
	 * commit and restore the last valid value; valid edits mark the direction
	 * manual and mirror a forward edit onto the auto-managed reverse envelope.
	 */
	commitEnvelopeHandle(
		connectionId: string,
		direction: CameraConnectionDirection,
		envelope: CameraFramingEnvelope
	): boolean {
		if (
			this.host.isDocumentMutationBlocked ||
			this.host.isEditorInteractionActive ||
			!isOrderedCameraFramingEnvelope(envelope)
		) {
			return false;
		}
		const connection = this.host.document.connections.find(
			(candidate) => candidate.id === connectionId
		);
		if (!connection || !this.host.beginDocumentTransaction()) return false;
		connection.viewTracks ??= { forward: [], reverse: [] };
		connection.viewTracks.framingEnvelope ??= {};
		connection.viewTracks.framingEnvelope[direction] = { ...envelope };
		this.setEnvelopePolicy(connectionId, direction, {
			envelope: { ...envelope },
			management: 'manual'
		});
		if (direction === 'forward') {
			this.#syncReverseEnvelopeFromForward(connection);
		}
		return this.host.commitDocumentTransaction();
	}

	// ===================================================================
	// P1.6 — Envelope-handle drag (cancel-safe)
	// ===================================================================

	beginFramingEnvelopeHandleDrag(
		connectionId: string,
		direction: CameraConnectionDirection
	): boolean {
		if (
			this.host.isDocumentMutationBlocked ||
			this.host.isEditorInteractionActive ||
			this.host.isDocumentTransactionActive ||
			this.host.pendingNavigationCommand
		) {
			return false;
		}
		const connection = this.host.document.connections.find(
			(candidate) => candidate.id === connectionId
		);
		const envelope = connection?.viewTracks?.framingEnvelope?.[direction];
		if (!connection || !envelope || !this.host.beginDocumentTransaction()) return false;

		const initialPolicy = this.getEnvelopePolicy(connectionId, direction);
		this.#framingEnvelopeHandleDrag = {
			connectionId,
			direction,
			initialEnvelope: { ...envelope },
			initialPolicy: initialPolicy
				? { envelope: { ...initialPolicy.envelope }, management: initialPolicy.management }
				: null
		};
		// Mark manual from gesture intent, even if the drag ends unchanged.
		if (initialPolicy) {
			this.setEnvelopePolicy(connectionId, direction, markFramingEnvelopeManual(initialPolicy));
		} else {
			this.setEnvelopePolicy(connectionId, direction, {
				envelope: { ...envelope },
				management: 'manual'
			});
		}
		return true;
	}

	updateFramingEnvelopeHandleDrag(
		connectionId: string,
		direction: CameraConnectionDirection,
		handle: EnvelopeHandleName,
		value: number
	): boolean {
		const drag = this.#framingEnvelopeHandleDrag;
		if (
			!drag ||
			drag.connectionId !== connectionId ||
			drag.direction !== direction ||
			!this.host.historyDocumentUndoBlocked
		) {
			return false;
		}
		const connection = this.host.document.connections.find(
			(candidate) => candidate.id === connectionId
		);
		const tracks = connection?.viewTracks;
		const current = tracks?.framingEnvelope?.[direction];
		if (!tracks || !current) return false;
		const next = { ...current, [handle]: value };
		if (!isOrderedCameraFramingEnvelope(next)) return false;
		tracks.framingEnvelope ??= {};
		tracks.framingEnvelope[direction] = next;
		this.setEnvelopePolicy(connectionId, direction, {
			envelope: { ...next },
			management: 'manual'
		});
		return true;
	}

	commitFramingEnvelopeHandleDrag(): boolean {
		const drag = this.#framingEnvelopeHandleDrag;
		if (!drag) return false;
		this.#framingEnvelopeHandleDrag = null;
		return this.host.commitDocumentTransaction();
	}

	cancelFramingEnvelopeHandleDrag(): boolean {
		const drag = this.#framingEnvelopeHandleDrag;
		if (!drag) return false;
		this.#framingEnvelopeHandleDrag = null;
		// Restore policy before the document swap so afterReplace reconciliation
		// keeps the pre-drag auto/manual state.
		if (drag.initialPolicy) {
			this.setEnvelopePolicy(drag.connectionId, drag.direction, drag.initialPolicy);
		} else {
			this.deleteEnvelopePolicy(drag.connectionId, drag.direction);
		}
		return this.host.cancelDocumentTransaction();
	}

	// ===================================================================
	// Authoring sample + add
	// ===================================================================

	get canAddViewKeyframeAtPlayhead() {
		const preview = this.host.cameraPreview;
		const connection = this.host.selectedConnection;
		if (
			!preview ||
			preview.kind !== 'connection' ||
			preview.mode !== 'director' ||
			preview.transport !== 'paused' ||
			preview.connectionId !== connection?.id ||
			this.host.isEditorInteractionActive ||
			this.host.isDocumentTransactionActive
		) {
			return false;
		}
		const authoring = this.#getViewKeyframeAuthoringSample(preview);
		if (!authoring) return false;
		const progress = authoring.edgeProgress;
		return (
			progress > EDITOR_CAMERA_VIEW_PROGRESS_EPSILON &&
			progress < 1 - EDITOR_CAMERA_VIEW_PROGRESS_EPSILON &&
			!(connection.viewTracks?.[preview.direction] ?? []).some(
				(keyframe) =>
					Math.abs(keyframe.progress - progress) <=
					EDITOR_CAMERA_VIEW_PROGRESS_EPSILON
			)
		);
	}

	#getViewKeyframeAuthoringSample(preview: ConnectionCameraPreview) {
		const route = this.host.getCapturedCameraPreviewRoute(preview.runId);
		if (!route) return null;
		const motion = createCameraMotion(route);
		let playhead = preview.playhead;
		let edgeProgress: number;
		const selection = this.host.navigationSelection;
		if (
			selection?.kind === 'anchor' &&
			selection.connectionId === preview.connectionId
		) {
			const anchor = this.host.selectedAnchor;
			if (!anchor) return null;
			const path = createDraftConnectionPositionPath(
				this.host.document,
				preview.connectionId,
				preview.direction,
				this.host.rooms
			);
			edgeProgress = findNearestCurveProgress(
				path,
				getScenePathAnchorWorldPosition(anchor, this.host.rooms)
			);
			playhead = cameraMotionProgressAtEdgeProgress(motion, 0, edgeProgress);
		} else {
			edgeProgress = cameraMotionEdgeProgressAtProgress(motion, 0, playhead);
		}
		return { motion, playhead, edgeProgress };
	}

	addViewKeyframeAtPlayhead() {
		const preview = this.host.cameraPreview;
		const connection = this.host.selectedConnection;
		if (
			!preview ||
			preview.kind !== 'connection' ||
			preview.mode !== 'director' ||
			preview.transport !== 'paused' ||
			preview.connectionId !== connection?.id ||
			this.host.isEditorInteractionActive ||
			this.host.isDocumentTransactionActive
		) {
			return false;
		}
		const authoring = this.#getViewKeyframeAuthoringSample(preview);
		if (!authoring) return false;
		const { edgeProgress, motion, playhead } = authoring;
		if (
			edgeProgress <= EDITOR_CAMERA_VIEW_PROGRESS_EPSILON ||
			edgeProgress >= 1 - EDITOR_CAMERA_VIEW_PROGRESS_EPSILON
		) {
			this.host.setStatusMessage('Move the Director playhead inside the connection');
			return false;
		}
		const track = connection.viewTracks?.[preview.direction] ?? [];
		if (
			track.some(
				(keyframe) =>
					Math.abs(keyframe.progress - edgeProgress) <=
					EDITOR_CAMERA_VIEW_PROGRESS_EPSILON
			)
		) {
			this.host.setStatusMessage('A view breakpoint already exists at this progress');
			return false;
		}

		this.host.setCameraPreviewPlayhead(playhead, preview.runId);
		const sample = createCameraMotionSample();
		sampleCameraMotion(motion, playhead, sample);
		const existingIds = [
			...(connection.viewTracks?.forward ?? []),
			...(connection.viewTracks?.reverse ?? [])
		].map((keyframe) => keyframe.id);
		const id = allocateCameraViewKeyframeId(
			connection.id,
			preview.direction,
			existingIds
		);
		const keyframe = createSceneCameraViewKeyframeAtWorldTarget(
			id,
			edgeProgress,
			sample.target,
			sample.fov,
			this.host.selectedRoomId,
			this.host.rooms
		);

		if (!this.host.beginDocumentTransaction()) return false;
		connection.viewTracks ??= { forward: [], reverse: [] };
		connection.viewTracks[preview.direction].push(keyframe);
		connection.viewTracks[preview.direction].sort(
			(left, right) => left.progress - right.progress
		);
		if (preview.direction === 'forward') {
			syncReverseViewTrackFromForward(connection);
		}
		this.#reconcileEditedDirection(connection, preview.direction);
		this.host.navigationSelection = {
			kind: 'view-keyframe',
			connectionId: connection.id,
			direction: preview.direction,
			keyframeId: id
		};
		return this.host.commitDocumentTransaction();
	}

	// ===================================================================
	// Target / FOV framing
	// ===================================================================

	updateSelectedViewKeyframeTargetWorldPoint(worldTarget: Vec3) {
		if (!this.host.historyDocumentUndoBlocked || !isFiniteVec3(worldTarget)) return false;
		const keyframe = this.host.selectedViewKeyframe;
		if (!keyframe) return false;
		const current = getSceneCameraViewKeyframeWorldTarget(keyframe, this.host.rooms);
		if (vec3Matches(current, worldTarget)) return false;
		writeSceneCameraViewKeyframeWorldTarget(keyframe, worldTarget, this.host.rooms);
		return true;
	}

	commitSelectedViewKeyframeTarget(target: Vec3) {
		if (
			this.host.isCameraFramingMutationBlocked ||
			this.host.isEditorInteractionActive ||
			!isFiniteVec3(target)
		) {
			return false;
		}
		const keyframe = this.host.selectedViewKeyframe;
		if (
			!keyframe ||
			vec3Distance(keyframe.cameraTarget, target) <=
				EDITOR_CAMERA_VIEW_MOVE_EPSILON
		) {
			return false;
		}
		if (!this.host.beginCameraFramingTransaction()) return false;
		keyframe.cameraTarget = [...target];
		this.host.seedEmptyReverseForSelectedForwardTrack();
		return this.host.commitDocumentTransaction();
	}

	/**
	 * S10.1 closeout — Aim the selected view breakpoint's look target. Orbits
	 * `cameraTarget` around the eye at the keyframe's path progress by yaw
	 * (world Y) then pitch (local X), preserving the eye→target radius, with
	 * the eye/path position and FOV untouched. One framing history entry per
	 * gesture; room-local targets stay room-local through the world write-back.
	 */
	commitSelectedViewKeyframeAim(yawRadians: number, pitchRadians: number) {
		if (
			this.host.isCameraFramingMutationBlocked ||
			this.host.isEditorInteractionActive ||
			!Number.isFinite(yawRadians) ||
			!Number.isFinite(pitchRadians)
		) {
			return false;
		}
		const selection = this.host.navigationSelection;
		const keyframe = this.host.selectedViewKeyframe;
		if (selection?.kind !== 'view-keyframe' || !keyframe) return false;

		const eyeWorld = getSceneCameraViewKeyframeWorldPosition(
			this.host.document,
			selection.connectionId,
			selection.direction,
			keyframe.progress,
			this.host.rooms
		);
		const currentTargetWorld = getSceneCameraViewKeyframeWorldTarget(
			keyframe,
			this.host.rooms
		);
		if (
			vec3Distance(eyeWorld, currentTargetWorld) <=
			EDITOR_CAMERA_VIEW_MOVE_EPSILON
		) {
			this.host.setStatusMessage(
				'The camera eye and look target are too close to aim'
			);
			return false;
		}
		const nextTargetWorld = orbitWorldLookTarget(
			eyeWorld,
			currentTargetWorld,
			yawRadians,
			pitchRadians
		);
		if (
			vec3Distance(currentTargetWorld, nextTargetWorld) <=
			EDITOR_CAMERA_VIEW_MOVE_EPSILON
		) {
			return false;
		}
		if (!this.host.beginCameraFramingTransaction()) return false;
		writeSceneCameraViewKeyframeWorldTarget(
			keyframe,
			nextTargetWorld,
			this.host.rooms
		);
		this.host.seedEmptyReverseForSelectedForwardTrack();
		return this.host.commitDocumentTransaction();
	}

	commitSelectedViewKeyframeFov(fov: number) {
		if (
			this.host.isCameraFramingMutationBlocked ||
			this.host.isEditorInteractionActive ||
			!Number.isFinite(fov) ||
			fov < MUSEUM_CAMERA_FOV.min ||
			fov > MUSEUM_CAMERA_FOV.max
		) {
			return false;
		}
		const keyframe = this.host.selectedViewKeyframe;
		if (!keyframe || Math.abs(keyframe.fov - fov) <= 1e-6) return false;
		if (!this.host.beginCameraFramingTransaction()) return false;
		keyframe.fov = fov;
		this.host.seedEmptyReverseForSelectedForwardTrack();
		return this.host.commitDocumentTransaction();
	}

	updateSelectedViewKeyframeFov(fov: number) {
		if (
			this.host.isCameraFramingMutationBlocked ||
			!this.host.historyFramingTransactionActive ||
			!Number.isFinite(fov) ||
			fov < MUSEUM_CAMERA_FOV.min ||
			fov > MUSEUM_CAMERA_FOV.max
		) {
			return false;
		}
		const keyframe = this.host.selectedViewKeyframe;
		if (!keyframe || Math.abs(keyframe.fov - fov) <= 1e-6) return false;
		keyframe.fov = fov;
		return true;
	}

	// ===================================================================
	// Progress (single commit + cancel-safe drag)
	// ===================================================================

	commitSelectedViewKeyframeProgress(progress: number) {
		if (
			this.host.isDocumentMutationBlocked ||
			this.host.isEditorInteractionActive ||
			!Number.isFinite(progress) ||
			progress <= 0 ||
			progress >= 1
		) {
			return false;
		}
		const selection = this.host.navigationSelection;
		const connection = this.host.selectedConnection;
		const keyframe = this.host.selectedViewKeyframe;
		if (
			selection?.kind !== 'view-keyframe' ||
			!connection?.viewTracks ||
			!keyframe ||
			Math.abs(keyframe.progress - progress) <=
				EDITOR_CAMERA_VIEW_PROGRESS_EPSILON
		) {
			return false;
		}
		const track = connection.viewTracks[selection.direction];
		if (
			track.some(
				(candidate) =>
					candidate.id !== keyframe.id &&
					Math.abs(candidate.progress - progress) <=
						EDITOR_CAMERA_VIEW_PROGRESS_EPSILON
			)
		) {
			this.host.setStatusMessage('View breakpoint progress must be unique');
			return false;
		}
		if (!this.host.beginDocumentTransaction()) return false;
		keyframe.progress = progress;
		track.sort((left, right) => left.progress - right.progress);
		if (selection.direction === 'forward') {
			syncReverseViewTrackFromForward(connection);
		}
		this.#reconcileEditedDirection(connection, selection.direction);
		return this.host.commitDocumentTransaction();
	}

	#syncViewKeyframeProgressDragPreview(
		selection: EditorViewKeyframeProgressDragSelection,
		progress: number
	) {
		const timeline = this.host.getCameraTimeline();
		const timelineProgress = timeline
			? cameraTimelineProgressAtEdgeProgress(
					timeline,
					selection.connectionId,
					selection.direction,
					progress
				)
			: null;
		if (timelineProgress === null) {
			throw new Error('The camera key is not on the guided timeline');
		}

		const draftGraph = createNavigationGraph(
			resolveSceneDocument(this.host.document, this.host.rooms)
		);
		const route = getCameraConnectionRoute(
			selection.connectionId,
			selection.direction,
			draftGraph
		);
		const motion = createCameraMotion(route);
		const playhead = cameraMotionProgressAtEdgeProgress(motion, 0, progress);
		const connection = this.host.document.connections.find(
			(candidate) => candidate.id === selection.connectionId
		);
		if (!connection) throw new Error('The camera connection is unavailable');

		const runId = this.host.allocPreviewRunId();
		this.host.setCapturedPreviewRoute(runId, route);
		this.host.cameraTimelinePlayhead = timelineProgress;
		this.host.setCameraPreview({
			kind: 'connection',
			connectionId: connection.id,
			direction: selection.direction,
			fromNodeId:
				selection.direction === 'forward'
					? connection.fromNodeId
					: connection.toNodeId,
			toNodeId:
				selection.direction === 'forward'
					? connection.toNodeId
					: connection.fromNodeId,
			mode: 'director',
			transport: 'paused',
			runId,
			playhead,
			startedAtMs: null
		});
		return true;
	}

	/** Begin one cancel-safe transaction for a timeline or 3D camera-key progress drag. */
	beginViewKeyframeProgressDrag(
		selection: EditorViewKeyframeProgressDragSelection
	) {
		if (
			this.host.isDocumentMutationBlocked ||
			this.host.isEditorInteractionActive ||
			this.host.isDocumentTransactionActive ||
			this.host.pendingNavigationCommand
		) {
			return false;
		}
		const keyframe = findSceneCameraViewKeyframe(
			this.host.document,
			selection.connectionId,
			selection.direction,
			selection.keyframeId
		);
		if (!keyframe) return false;

		this.host.selectCameraTimelineViewKeyframe(
			selection.connectionId,
			selection.direction,
			selection.keyframeId
		);
		const current = this.host.navigationSelection;
		if (
			current?.kind !== 'view-keyframe' ||
			current.connectionId !== selection.connectionId ||
			current.direction !== selection.direction ||
			current.keyframeId !== selection.keyframeId ||
			!this.host.beginDocumentTransaction()
		) {
			return false;
		}

		this.#viewKeyframeProgressDragInitialProgress = keyframe.progress;
		this.host.viewKeyframeProgressDrag = { ...selection };
		return true;
	}

	/**
	 * Update the active key with either exact edge progress or a world point projected
	 * to the shared directional connection curve. Only progress is mutated.
	 */
	updateViewKeyframeProgressDrag(progressOrWorldPoint: number | Vector3Like) {
		const selection = this.host.viewKeyframeProgressDrag;
		if (!selection || !this.host.historyDocumentUndoBlocked) return false;
		const keyframe = findSceneCameraViewKeyframe(
			this.host.document,
			selection.connectionId,
			selection.direction,
			selection.keyframeId
		);
		const connection = this.host.document.connections.find(
			(candidate) => candidate.id === selection.connectionId
		);
		if (!keyframe || !connection?.viewTracks) return false;

		let requestedProgress: number;
		try {
			requestedProgress =
				typeof progressOrWorldPoint === 'number'
					? progressOrWorldPoint						: findNearestCurveProgress(
							createDraftConnectionPositionPath(
								this.host.document,
								selection.connectionId,
								selection.direction,
								this.host.rooms
							),
							progressOrWorldPoint
						);
		} catch {
			return false;
		}
		if (!Number.isFinite(requestedProgress)) return false;
		const progress = Math.min(
			1 - EDITOR_CAMERA_VIEW_PROGRESS_EPSILON,
			Math.max(EDITOR_CAMERA_VIEW_PROGRESS_EPSILON, requestedProgress)
		);
		if (
			Math.abs(progress - keyframe.progress) <=
			EDITOR_CAMERA_VIEW_PROGRESS_EPSILON
		) {
			return false;
		}

		const track = connection.viewTracks[selection.direction];
		if (
			track.some(
				(candidate) =>
					candidate.id !== keyframe.id &&
					Math.abs(candidate.progress - progress) <=
						EDITOR_CAMERA_VIEW_PROGRESS_EPSILON
			)
		) {
			this.host.setStatusMessage('View breakpoint progress must be unique');
			return false;
		}

		const previousProgress = keyframe.progress;
		keyframe.progress = progress;
		track.sort((left, right) => left.progress - right.progress);
		try {
			this.#syncViewKeyframeProgressDragPreview(selection, progress);
			return true;
		} catch (error) {
			keyframe.progress = previousProgress;
			track.sort((left, right) => left.progress - right.progress);
			this.host.setStatusMessage(
				error instanceof Error
					? error.message
					: 'Camera key progress could not be updated'
			);
			return false;
		}
	}

	/** Commit a successful drag as exactly one history entry. */
	commitViewKeyframeProgressDrag() {
		const selection = this.host.viewKeyframeProgressDrag;
		const initialProgress = this.#viewKeyframeProgressDragInitialProgress;
		if (!selection || initialProgress === null) return false;
		const keyframe = findSceneCameraViewKeyframe(
			this.host.document,
			selection.connectionId,
			selection.direction,
			selection.keyframeId
		);
		if (
			!keyframe ||
			Math.abs(keyframe.progress - initialProgress) <=
				EDITOR_CAMERA_VIEW_PROGRESS_EPSILON
		) {
			this.cancelViewKeyframeProgressDrag();
			return false;
		}

		this.host.viewKeyframeProgressDrag = null;
		this.#viewKeyframeProgressDragInitialProgress = null;
		const connection = this.host.document.connections.find(
			(candidate) => candidate.id === selection.connectionId
		);
		if (selection.direction === 'forward') {
			if (connection) syncReverseViewTrackFromForward(connection);
		}
		if (connection) this.#reconcileEditedDirection(connection, selection.direction);
		const committed = this.host.commitDocumentTransaction();
		if (!committed) {
			this.host.selectCameraTimelineViewKeyframe(
				selection.connectionId,
				selection.direction,
				selection.keyframeId
			);
		}
		return committed;
	}

	/** Restore the original progress/playhead and create no history entry. */
	cancelViewKeyframeProgressDrag() {
		const selection = this.host.viewKeyframeProgressDrag;
		if (!selection) return false;
		this.host.viewKeyframeProgressDrag = null;
		this.#viewKeyframeProgressDragInitialProgress = null;
		const cancelled = this.host.cancelDocumentTransaction();
		this.host.selectCameraTimelineViewKeyframe(
			selection.connectionId,
			selection.direction,
			selection.keyframeId
		);
		return cancelled;
	}

	// ===================================================================
	// Delete / copy / leave
	// ===================================================================

	deleteSelectedViewKeyframe() {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) {
			return false;
		}
		const selection = this.host.navigationSelection;
		const connection = this.host.selectedConnection;
		if (
			selection?.kind !== 'view-keyframe' ||
			!connection?.viewTracks
		) {
			return false;
		}
		const track = connection.viewTracks[selection.direction];
		const index = track.findIndex(
			(keyframe) => keyframe.id === selection.keyframeId
		);
		if (index < 0 || !this.host.beginDocumentTransaction()) return false;
		track.splice(index, 1);
		// Seeded reverse is derived from forward; drop it when forward is emptied.
		if (
			selection.direction === 'forward' &&
			connection.viewTracks.forward.length === 0
		) {
			connection.viewTracks.reverse = [];
		}
		this.#reconcileEditedDirection(connection, selection.direction);
		if (
			connection.viewTracks.forward.length === 0 &&
			connection.viewTracks.reverse.length === 0 &&
			connection.viewTracks.framingEnvelope === undefined
		) {
			delete connection.viewTracks;
		}
		this.host.navigationSelection = {
			kind: 'connection',
			connectionId: connection.id
		};
		return this.host.commitDocumentTransaction();
	}

	copySelectedConnectionViewTrack(source: CameraConnectionDirection) {
		if (this.host.isDocumentMutationBlocked || this.host.isEditorInteractionActive) {
			return false;
		}
		const connection = this.host.selectedConnection;
		if (!connection) return false;
		const destination: CameraConnectionDirection =
			source === 'forward' ? 'reverse' : 'forward';
		const sourceTrack = connection.viewTracks?.[source] ?? [];
		const destinationTrack = connection.viewTracks?.[destination] ?? [];
		if (sourceTrack.length === 0 && destinationTrack.length === 0) return false;

		const occupied = new Set(
			[
				...(connection.viewTracks?.forward ?? []),
				...(connection.viewTracks?.reverse ?? [])
			].map((keyframe) => keyframe.id)
		);
		const copied = mirrorCameraViewTrack(
			connection.id,
			sourceTrack,
			destination,
			occupied
		);
		if (!this.host.beginDocumentTransaction()) return false;
		connection.viewTracks ??= { forward: [], reverse: [] };
		connection.viewTracks[destination] = copied;
		// Explicit copy mirrors the source envelope and marks destination manual;
		// a missing source envelope removes the destination envelope.
		const sourceEnvelope = connection.viewTracks.framingEnvelope?.[source];
		if (sourceEnvelope) {
			const mirrored = mirrorFramingEnvelope(sourceEnvelope);
			connection.viewTracks.framingEnvelope ??= {};
			connection.viewTracks.framingEnvelope[destination] = { ...mirrored };
			this.setEnvelopePolicy(connection.id, destination, {
				envelope: { ...mirrored },
				management: 'manual'
			});
		} else if (connection.viewTracks.framingEnvelope?.[destination]) {
			delete connection.viewTracks.framingEnvelope[destination];
			this.deleteEnvelopePolicy(connection.id, destination);
			if (Object.keys(connection.viewTracks.framingEnvelope).length === 0) {
				delete connection.viewTracks.framingEnvelope;
			}
		}
		if (
			connection.viewTracks.forward.length === 0 &&
			connection.viewTracks.reverse.length === 0 &&
			connection.viewTracks.framingEnvelope === undefined
		) {
			delete connection.viewTracks;
		}
		return this.host.commitDocumentTransaction();
	}

	/** Leave a view key without changing the document or history. */
	finishViewKeyframeEditing() {
		if (
			this.host.isDocumentMutationBlocked ||
			this.host.isEditorInteractionActive ||
			this.host.pendingNavigationCommand
		) {
			return false;
		}
		const selection = this.host.selection.navigation;
		if (selection.kind !== 'view-keyframe') return false;
		const connection = this.host.document.connections.find(
			(candidate) => candidate.id === selection.connectionId
		);
		if (
			!connection ||
			!findSceneCameraViewKeyframe(
				this.host.document,
				selection.connectionId,
				selection.direction,
				selection.keyframeId
			)
		) {
			return false;
		}
		this.host.selection.setNavigation({
			kind: 'connection',
			connectionId: connection.id,
			direction: selection.direction
		});
		this.selectionActions.expandActiveCameraDirection(selection.direction);
		return true;
	}

	// ===================================================================
	// Timing (Phase 3.7)
	// ===================================================================

	/** Phase 3.7: write authored hold + easing for one view keyframe, or `null` to clear each field individually. */
	setViewKeyframeTiming(
		connectionId: string,
		direction: CameraConnectionDirection,
		keyframeId: string,
		holdSeconds: number | null,
		easing: CameraEasing | null
	): boolean {
		if (this.host.isDocumentMutationBlocked) return false;
		const connection = this.host.document.connections.find(
			(candidate) => candidate.id === connectionId
		);
		if (!connection?.viewTracks) {
			this.host.setStatusMessage(`Unknown view keyframe: ${connectionId}:${keyframeId}`);
			return false;
		}
		const track = connection.viewTracks[direction];
		const keyframe = track.find((candidate) => candidate.id === keyframeId);
		if (!keyframe) {
			this.host.setStatusMessage(`Unknown view keyframe: ${connectionId}:${keyframeId}`);
			return false;
		}
		const noHoldToWrite = holdSeconds !== null && keyframe.holdSeconds === holdSeconds;
		const noEasingToWrite = easing !== null && keyframe.easing === easing;
		if (noHoldToWrite && noEasingToWrite) return false;
		if (
			holdSeconds === null &&
			easing === null &&
			keyframe.holdSeconds === undefined &&
			keyframe.easing === undefined
		) {
			return false;
		}
		if (!this.host.beginDocumentTransaction()) return false;
		if (holdSeconds !== null) {
			if (!Number.isFinite(holdSeconds) || holdSeconds < 0) {
				this.host.cancelDocumentTransaction();
				this.host.setStatusMessage(
					'View keyframe holdSeconds must be a finite non-negative number'
				);
				return false;
			}
			keyframe.holdSeconds = holdSeconds;
		} else {
			delete keyframe.holdSeconds;
		}
		if (easing !== null) {
			if (!MUSEUM_CAMERA_EASING.includes(easing)) {
				this.host.cancelDocumentTransaction();
				this.host.setStatusMessage(
					`Easing must be one of ${MUSEUM_CAMERA_EASING.join(', ')}`
				);
				return false;
			}
			keyframe.easing = easing;
		} else {
			delete keyframe.easing;
		}
		return this.host.commitDocumentTransaction();
	}
}
