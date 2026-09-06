<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { SceneDocument, SceneEntity } from '$lib/content/scene';
	import type { LayoutRoomRegistry } from '$lib/project/project-layout-semantics';
	import type { Vec3 } from '$lib/types/scene';
	import type { LayoutPreviewModel } from './layout-mesh-factory';
	import {
		addPolygonPoint,
		beginLayoutObjectDrag,
		beginLayoutObjectRotateDrag,
		beginLayoutRoomUnitDrag,
		beginLayoutPrimitiveDraft,
		beginRectangle,
		beginRoomEdit,
		cancelLayoutObjectDrag,
		cancelLayoutRoomUnitDrag,
		cancelLayoutPrimitiveDraft,
		cancelRoomEdit,
		clearLayoutDraft,
		clearLayoutSelection,
		selectLayoutInteriorAnchor,
		selectLayoutObject,
		selectLayoutOpening,
		selectLayoutRoom,
		selectLayoutWall,
		setArrangeOwner,
		setLayoutDraftTool,
		removeLastPolygonPoint,
		resolveArrangeScenePick,
		shouldBeginWallBend,
		updateRectangle,
		updateLayoutObjectDrag,
		updateLayoutRoomUnitDrag,
		updateLayoutPrimitiveDraft,
		updateRoomEdit,
		deriveArrangeTarget,
		primitiveDraftCenter,
		rectanglePoints,
		type LayoutInteractionState
	} from './layout-interaction';
	import type { LayoutPreviewState } from './layout-preview-state.svelte';
	import {
		captureLayoutPreviewSnapshot,
		commitLayoutPrimitive,
		commitLayoutRoomEdit,
		previewLayoutRoomUnit,
		deleteLayoutObject,
		deleteLayoutWallInteriorAnchor,
		insertLayoutWallInteriorAnchor,
		restoreLayoutPreviewSnapshot,
		updateLayoutObjectFields,
		updateLayoutRoomFields,
		updateLayoutWallInteriorAnchor,
		updateLayoutOpeningFields,
		type LayoutPreviewSnapshot
	} from './layout-preview-state.svelte';
	import {
		snapSegmentOffset,
		LAYOUT_PLAN_HIT_RADIUS_PX,
		type LayoutOpeningKind
	} from './layout-opening-editing';
	import { compiledWallLength, findPlanHitRoom, projectPointToWall, resolvePlanHit } from './plan-hit';
	import {
		constrainToAngle,
		framePlanViewport,
		panPlanViewport,
		planScreenToWorld,
		setPlanViewportSize,
		snapToGrid,
		zoomPlanViewport
	} from './layout-plan-transform';
	import type { LayoutRoom, LayoutVec2 } from '$lib/layout/layout-types';
	import { layoutRoomUnitPivot } from './layout-room-transform';
	import { buildPlanRenderModel } from '$lib/layout/plan-render-model';
	import { buildPlanSceneFootprintProjection } from './plan-scene-footprint';
	import { resolvePlanSceneHitAtZoom, PLAN_SCENE_HIT_HALO_PX } from './plan-scene-hit';
	import { resolveArrangeHit } from './arrange-hit';
	import type { EditorStore } from '../editor-store.svelte';
	import type { EditorContextMenuStore } from '../context-menu/context-menu-state.svelte';
	import { isEditableTarget } from '../context-menu/editable-target';
	import {
		buildArrangeContextMenuItems,
		buildPlanLayoutContextMenuItems
	} from '../context-menu/plan-menu-items';
	import {
		capturePlanSceneTransformMembers,
		planSceneWorldPivot,
		rotatePlanSceneMembers,
		translatePlanSceneMembers,
		type PlanSceneTransformMember,
		type PlanSceneTransformPatch
	} from './plan-scene-transform';
	import type { PlanViewMode } from './layout-interaction';
	import {
		buildPlanInteractionProjection,
		planHandleScreenPoints,
		rotationHandleScreenPoint,
		withArrangeHoverOutline,
		withPlanObjectRotationHandle,
		withPlanSceneRotationHandle,
		yawFeedbackText
	} from './plan-overlays';
	import { planCameraProjectionForProject } from './plan-camera-projection';
	import PlanSvg from './PlanSvg.svelte';
	import PlanCanvasChrome from './PlanCanvasChrome.svelte';
	import PlanEmptyGhost from './PlanEmptyGhost.svelte';

	let {
		model,
		preview,
		interaction,
		scene,
		rooms: sceneRooms,
		getEffectiveSceneScale,
		selectedPlacementIds = [],
		selectedClusterId = null,
		active = true,
		onPlanModeChange,
		onEnterStaging,
		onSceneSelect,
		onSceneGestureBegin,
		onSceneGesturePreview,
		onSceneGestureCommit,
		onSceneGestureCancel,
		onSceneDelete,
		onCommit,
		onOpeningCreate,
		onOpeningDelete,
		onRoomDelete,
		onLayoutTransactionBegin,
		onLayoutTransactionCommit,
		onLayoutTransactionCancel,
		onDeselect,
		store,
		contextMenu = null
	}: {
		model: LayoutPreviewModel;
		preview: LayoutPreviewState;
		interaction: LayoutInteractionState;
		scene?: SceneDocument;
		rooms?: LayoutRoomRegistry;
		getEffectiveSceneScale?: (entity: SceneEntity) => number | Vec3 | undefined;
		selectedPlacementIds?: readonly string[];
		selectedClusterId?: string | null;
		active?: boolean;
		onPlanModeChange?: (mode: 'layout' | 'staging') => void;
		onEnterStaging?: (entityId: string) => void;
		onSceneSelect?: (
			entityId: string,
			modifiers: { additive: boolean; toggle: boolean }
		) => boolean;
		onSceneGestureBegin?: () => boolean;
		onSceneGesturePreview?: (patches: readonly PlanSceneTransformPatch[]) => boolean;
		onSceneGestureCommit?: () => boolean;
		onSceneGestureCancel?: () => boolean;
		onSceneDelete?: () => boolean;
		onCommit: (points: LayoutVec2[]) => boolean;
		onOpeningCreate: (roomId: string, segmentId: string, kind: LayoutOpeningKind, clickOffset: number) => void;
		onOpeningDelete: (roomId: string, openingId: string) => void;
		onRoomDelete: (roomId: string) => boolean;
		onLayoutTransactionBegin: () => boolean;
		onLayoutTransactionCommit: () => boolean;
		onLayoutTransactionCancel: () => boolean;
		/** a Plan empty-click deselects the *active* domain (default: clear the layout selection). */
		onDeselect?: () => void;
		/** Editor facade; optional only for the frozen relic mount. */
		store?: EditorStore;
		/** P3.4 — shared context-menu slot; absent keeps the surface frozen. */
		contextMenu?: EditorContextMenuStore | null;
	} = $props();

	let svgElement = $state<SVGSVGElement>();
	let pointerId = $state<number | null>(null);
	let panPointerId = $state<number | null>(null);
	let lastPanScreen = $state<LayoutVec2 | null>(null);
	let interiorAnchorPointerId = $state<number | null>(null);
	let draggedInteriorAnchor = $state<{ roomId: string; segmentId: string; anchorId: string } | null>(null);
	let pendingWallBend = $state<{
		pointerId: number;
		roomId: string;
		segmentId: string;
		projectionPoint: LayoutVec2;
		originScreen: LayoutVec2;
	} | null>(null);
	let openingDrag = $state<{ roomId: string; segmentId: string; openingId: string; width: number } | null>(null);
	let dragSnapshot = $state<LayoutPreviewSnapshot | null>(null);
	let suppressNextClick = $state(false);
	let framedReplacementVersion = $state<number | null>(null);
	let roomUnitSnapshot = $state<LayoutPreviewSnapshot | null>(null);
	let rotationHoverScreen = $state<LayoutVec2 | null>(null);
	let sceneBridgeHover = $state<{ entityId: string; screen: LayoutVec2 } | null>(null);
	let previousPlanViewMode = $state<PlanViewMode | null>(null);
	let stagingGesture = $state<{
		pointerId: number;
		mode: 'translate' | 'rotate';
		primaryId: string;
		members: PlanSceneTransformMember[];
		startWorld: LayoutVec2;
		startScreen: LayoutVec2;
		moved: boolean;
		plainClickEntityId: string | null;
	} | null>(null);
	let stagingRotationHoverScreen = $state<LayoutVec2 | null>(null);
	let arrangeLayoutRotationHoverScreen = $state<LayoutVec2 | null>(null);
	// P3.3 — presentation-only Arrange hover (which footprint/object the
	// pointer is over). Derived from the same resolveArrangeHit call the click
	// path uses; it never writes selection or document state.
	let arrangeHover = $state<{ owner: 'layout-object' | 'scene'; id: string } | null>(null);
	// P3.3 — live yaw readout while a Scene rotate gesture is in progress
	// (same feedback language as room rotation).
	let stagingYawFeedback = $state<number | null>(null);
	// P21.2 — ghost blueprint session dismissal (not serialized): the 10×8m
	// watermark unmounts once the project is non-empty, or for the remainder
	// of the session upon first tool use.
	let ghostDismissed = $state(false);

	const viewBox = $derived(`0 0 ${interaction.planView.width} ${interaction.planView.height}`);
	const draftPolygon = $derived(
		interaction.tool === 'rectangle'
			? rectanglePoints(interaction)
			: interaction.polygonPoints
	);
	const rooms = $derived(preview.project.layout.floors.flatMap((floor) => floor.rooms));
	const baseInteractionProjection = $derived(buildPlanInteractionProjection(interaction, rooms, model));
	const cameraProjection = $derived.by(() => {
		if (interaction.planViewMode !== 'layout' || !interaction.planView.showTourOverlay) return undefined;
		try {
			return planCameraProjectionForProject(preview.project, preview.geometry, preview.issues);
		} catch {
			// Scene/layout divergence (e.g. imported layout missing scene rooms) must not break the plan.
			return undefined;
		}
	});
	const sceneProjection = $derived.by(() => {
		// The room registry is a plain store seam. Preview mutations replace the
		// registry in EditorApp, so key this derived value to the live layout
		// version or a moved room leaves Scene footprints in its old frame.
		void preview.previewVersion;
		if (!scene || !sceneRooms) return undefined;
		void interaction.planViewMode;
		void selectedPlacementIds.length;
		void sceneBridgeHover?.entityId;
		return buildPlanSceneFootprintProjection(scene, sceneRooms, {
			getEffectiveScale: getEffectiveSceneScale,
			presentationForEntity: (entityId) => {
				if (interaction.planViewMode === 'staging' && selectedPlacementIds.includes(entityId)) return 'selected';
				if (sceneBridgeHover?.entityId === entityId) return 'bridge-hover';
				return interaction.planViewMode === 'staging' ? 'active' : 'passive';
			}
		});
	});
	const stagingSelectionMessage = $derived.by(() => {
		// Scene-only surface: hidden while the layout-object owner is active.
		if (interaction.planViewMode !== 'staging' || selectedPlacementIds.length === 0) return null;
		if (interaction.arrangeOwner === 'layout-object') return null;
		if (selectedClusterId !== null) return 'Some selected items are not editable in Plan.';
		const eligibleIds = new Set(sceneProjection?.footprints.map((footprint) => footprint.entityId) ?? []);
		const ineligibleCount = selectedPlacementIds.filter((id) => !eligibleIds.has(id)).length;
		if (ineligibleCount === 0) return null;
		return ineligibleCount === selectedPlacementIds.length
			? 'Not editable in Plan. Edit position in 3D.'
			: 'Some selected items are not editable in Plan.';
	});
	const stagingEligibleIds = $derived(
		new Set(sceneProjection?.footprints.map((footprint) => footprint.entityId) ?? [])
	);
	const stagingTransformEnabled = $derived(
		interaction.planViewMode === 'staging' &&
		selectedClusterId === null &&
		selectedPlacementIds.length > 0 &&
		selectedPlacementIds.every((id) => stagingEligibleIds.has(id))
	);
	// P10 — the session's active Arrange target (derived from the remembered
	// owner + the canonical Layout/Scene slots; never a mirrored selection).
	const arrangeEligibleLayoutObjectIds = $derived(
		new Set(model.objects.filter((object) => !object.readonly).map((object) => object.objectId))
	);
	const arrangeActiveTarget = $derived(
		interaction.planViewMode === 'staging'
			? deriveArrangeTarget({
					lastOwner: interaction.arrangeOwner,
					layoutSelection: interaction.selection,
					selectedPlacementIds,
					selectedClusterId,
					eligibleLayoutObjectIds: arrangeEligibleLayoutObjectIds,
					eligibleSceneEntityIds: stagingEligibleIds
				})
			: null
	);
	const arrangeActiveLayoutObject = $derived(
		arrangeActiveTarget?.owner === 'layout-object' ? arrangeActiveTarget.objectId : null
	);
	const arrangeActiveScene = $derived(
		arrangeActiveTarget?.owner === 'scene' ? arrangeActiveTarget : null
	);
	const arrangeEmpty = $derived(
		interaction.planViewMode === 'staging' &&
		arrangeEligibleLayoutObjectIds.size === 0 &&
		stagingEligibleIds.size === 0
	);
	// P3.3 — the canonical empty-plan state: no rooms, no layout objects, and
	// no scene entities anywhere in the document.
	const planEmpty = $derived(
		preview.model.rooms.length === 0 &&
		preview.model.objects.length === 0 &&
		(scene?.entities.length ?? 0) === 0
	);
	// P21.2 — ghost blueprint visibility: Layout-only, empty, session-alive.
	const ghostVisible = $derived(
		planEmpty && interaction.planViewMode === 'layout' && !ghostDismissed
	);
	const arrangeLayoutRotationHandle = $derived.by(() => {
		const objectId = arrangeActiveLayoutObject;
		if (!objectId) return null;
		const object = model.objects.find((candidate) => candidate.objectId === objectId);
		if (!object || object.readonly) return null;
		const pivot: LayoutVec2 = [object.position[0], object.position[2]];
		const footprintRadius = Math.max(
			...object.planFootprint.map((point) => distance(point, pivot)),
			0.2
		);
		const radius = footprintRadius + 28 / interaction.planView.pixelsPerMeter;
		const yaw = object.rotation[1];
		const handle: LayoutVec2 = [
			pivot[0] - Math.sin(yaw) * radius,
			pivot[1] - Math.cos(yaw) * radius
		];
		const screen = planHandleScreenPoints(interaction.planView, pivot, handle);
		return {
			objectId,
			pivot,
			handle,
			pivotScreen: screen.pivot,
			handleScreen: screen.handle
		};
	});
	const arrangeLayoutRotationHovered = $derived.by(() => {
		if (!arrangeLayoutRotationHoverScreen || !arrangeLayoutRotationHandle) return false;
		return distance(arrangeLayoutRotationHoverScreen, arrangeLayoutRotationHandle.handleScreen) <= LAYOUT_PLAN_HIT_RADIUS_PX;
	});
	const stagingRotationHandle = $derived.by(() => {
		if (!stagingTransformEnabled || arrangeActiveScene === null || !scene || !sceneRooms) return null;
		const primaryId = selectedPlacementIds.at(-1);
		if (!primaryId) return null;
		const entity = scene.entities.find((candidate) => candidate.id === primaryId);
		const footprint = sceneProjection?.footprints.find((candidate) => candidate.entityId === primaryId);
		const room = entity ? sceneRooms.get(entity.roomId) : undefined;
		if (!entity || !footprint || !room) return null;
		const pivot = planSceneWorldPivot(entity, sceneRooms);
		const footprintRadius = Math.max(
			...footprint.points.map((point) => distance(point, pivot)),
			0.2
		);
		const radius = footprintRadius + 28 / interaction.planView.pixelsPerMeter;
		const worldYaw = room.rotation[1] + entity.rotation[1];
		const handle: LayoutVec2 = [
			pivot[0] - Math.sin(worldYaw) * radius,
			pivot[1] - Math.cos(worldYaw) * radius
		];
		const screen = planHandleScreenPoints(interaction.planView, pivot, handle);
		return {
			primaryId,
			pivot,
			handle,
			pivotScreen: screen.pivot,
			handleScreen: screen.handle
		};
	});
	const stagingRotationHovered = $derived.by(() => {
		if (!stagingRotationHoverScreen || !stagingRotationHandle) return false;
		return distance(stagingRotationHoverScreen, stagingRotationHandle.handleScreen) <= LAYOUT_PLAN_HIT_RADIUS_PX;
	});
	// P3.3 — live degree labels during rotate gestures: same `+NN°` language
	// as the room rotation readout, one per owner.
	const objectRotateFeedback = $derived.by(() => {
		const drag = interaction.objectDrag;
		if (!drag || drag.mode !== 'rotate') return null;
		return yawFeedbackText(drag.candidateRotation[1]);
	});
	const sceneRotateFeedback = $derived(
		stagingGesture?.mode === 'rotate' && stagingYawFeedback !== null
			? yawFeedbackText(stagingYawFeedback)
			: null
	);
	// P3.3 — the hovered Arrange target's outline, fed through the projection
	// as a render primitive (hover never looks selected).
	const arrangeHoverOutline = $derived.by(() => {
		if (!arrangeHover) return null;
		if (arrangeHover.owner === 'layout-object') {
			const object = model.objects.find((candidate) => candidate.objectId === arrangeHover!.id);
			if (!object || object.readonly || arrangeActiveLayoutObject === object.objectId) return null;
			return { id: object.objectId, points: object.planFootprint };
		}
		const footprint = sceneProjection?.footprints.find(
			(candidate) => candidate.entityId === arrangeHover!.id
		);
		if (!footprint || selectedPlacementIds.includes(footprint.entityId)) return null;
		return { id: footprint.entityId, points: footprint.points };
	});
	const interactionProjection = $derived(
		withArrangeHoverOutline(
			withPlanObjectRotationHandle(
				withPlanSceneRotationHandle(
					baseInteractionProjection,
					stagingRotationHandle
						? {
							entityId: stagingRotationHandle.primaryId,
							pivot: stagingRotationHandle.pivot,
							handle: stagingRotationHandle.handle
						}
						: null,
					sceneRotateFeedback
				),
				arrangeLayoutRotationHandle
					? {
						objectId: arrangeLayoutRotationHandle.objectId,
						pivot: arrangeLayoutRotationHandle.pivot,
						handle: arrangeLayoutRotationHandle.handle
					}
					: null,
				objectRotateFeedback
			),
			arrangeHoverOutline
		)
	);
	const planModel = $derived(
		buildPlanRenderModel(preview.geometry, cameraProjection, interactionProjection, sceneProjection)
	);
	const selectedOpeningSelection = $derived(
		interaction.selection.kind === 'opening' ? interaction.selection : null
	);
	const selectedOpening = $derived.by(() => {
		if (!selectedOpeningSelection) return undefined;
		return findLayoutRoom(rooms, selectedOpeningSelection.roomId)?.openings.find(
			(opening) => opening.id === selectedOpeningSelection.openingId
		);
	});
	const rotationHandleHovered = $derived.by(() => {
		if (interaction.tool !== 'select' || !rotationHoverScreen) return false;
		const handle = rotationHandleScreenPoint(interaction.planView, interactionProjection);
		return handle ? distance(handle, rotationHoverScreen) <= LAYOUT_PLAN_HIT_RADIUS_PX : false;
	});

	onMount(() => {
		const svg = svgElement;
		if (!svg) return;
		const resize = () => {
			const rect = svg.getBoundingClientRect();
			setPlanViewportSize(interaction.planView, rect.width, rect.height);
			if (!interaction.planView.initialized) frameView();
		};
		const observer = new ResizeObserver(resize);
		observer.observe(svg);
		resize();
		return () => observer.disconnect();
	});

	onDestroy(() => cancelLocalPlanInteraction());

	$effect(() => {
		void active;
		void interaction.planViewMode;
		void interaction.tool;
		if (!active && stagingGesture) cancelStagingGesture();
		if (!active || interaction.planViewMode !== 'layout' || interaction.tool !== 'select') {
			sceneBridgeHover = null;
		}
	});

	$effect(() => {
		const mode = interaction.planViewMode;
		if (previousPlanViewMode === null) {
			previousPlanViewMode = mode;
			return;
		}
		if (mode === previousPlanViewMode) return;
		previousPlanViewMode = mode;
		cancelLocalPlanInteraction();
	});

	$effect(() => {
		const replacementVersion = preview.reframeVersion;
		if (framedReplacementVersion === null) {
			framedReplacementVersion = replacementVersion;
			return;
		}
		if (interaction.viewMode !== 'plan' || replacementVersion === framedReplacementVersion) return;
		framedReplacementVersion = replacementVersion;
		frameView();
	});

	// P21.2 — session-scoped ghost dismissal on first tool use (not serialized).
	$effect(() => {
		if (interaction.tool !== 'select' && !ghostDismissed) ghostDismissed = true;
	});

	function frameView() {
		const points = [
			...model.rooms.flatMap((room) => room.floorPolygon),
			...model.objects.flatMap((object) => object.planFootprint),
			...(sceneProjection?.footprints.flatMap((footprint) => footprint.points) ?? [])
		];
		framePlanViewport(interaction.planView, points);
	}

	function screenPoint(event: { clientX: number; clientY: number }): LayoutVec2 | null {
		const svg = svgElement;
		if (!svg) return null;
		const rect = svg.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) return null;
		return [event.clientX - rect.left, event.clientY - rect.top];
	}

	function worldPoint(event: { clientX: number; clientY: number }): LayoutVec2 | null {
		const screen = screenPoint(event);
		return screen ? planScreenToWorld(interaction.planView, screen) : null;
	}

	function dismissSceneBridge(): void {
		sceneBridgeHover = null;
	}

	function cancelLocalPlanInteraction(): void {
		const scenePointerId = stagingGesture?.pointerId ?? null;
		if (stagingGesture) onSceneGestureCancel?.();
		const hadLayoutInteraction = Boolean(
			dragSnapshot ||
			roomUnitSnapshot ||
			openingDrag ||
			pendingWallBend ||
			draggedInteriorAnchor ||
			pointerId !== null ||
			panPointerId !== null ||
			interiorAnchorPointerId !== null
		);
		if (dragSnapshot) restoreLayoutPreviewSnapshot(preview, dragSnapshot);
		if (roomUnitSnapshot) restoreLayoutPreviewSnapshot(preview, roomUnitSnapshot);
		if (hadLayoutInteraction) onLayoutTransactionCancel();
		for (const captured of [
			pointerId,
			panPointerId,
			interiorAnchorPointerId,
			pendingWallBend?.pointerId,
			scenePointerId
		]) {
			if (captured !== null && captured !== undefined && svgElement?.hasPointerCapture(captured)) {
				svgElement.releasePointerCapture(captured);
			}
		}
		pointerId = null;
		panPointerId = null;
		lastPanScreen = null;
		interiorAnchorPointerId = null;
		draggedInteriorAnchor = null;
		pendingWallBend = null;
		openingDrag = null;
		dragSnapshot = null;
		roomUnitSnapshot = null;
		rotationHoverScreen = null;
		stagingRotationHoverScreen = null;
		arrangeLayoutRotationHoverScreen = null;
		stagingGesture = null;
		suppressNextClick = hadLayoutInteraction;
		dismissSceneBridge();
	}

	/**
	 * P3.4 — Scene Plan context-menu adapter. Arrange mode resolves through
	 * the P10 owner-aware hit target (`resolveArrangeHit` — no second
	 * resolver) and routes by owner; Layout mode resolves through
	 * `resolvePlanHit`. Selection-before-menu mirrors the left-click path
	 * (same selection functions, same owner routing); empty space keeps the
	 * native menu and never changes selection. One gesture mutates one
	 * document through existing commands only.
	 */
	function onPlanContextMenu(event: MouseEvent): void {
		if (!contextMenu || !store) return;
		if (isEditableTarget(event.target)) return;
		const point = worldPoint(event as unknown as PointerEvent);
		if (!point) return;

		if (interaction.planViewMode === 'staging') {
			if (interaction.tool !== 'select') return;
			const hit = resolveArrangeHit({ point, ...arrangeHitCandidates() });
			if (!hit) return;

			if (hit.owner === 'layout-object') {
				// selection-before-menu through the canonical Layout slot + owner switch
				if (arrangeActiveLayoutObject !== hit.objectId) {
					selectLayoutObject(interaction, hit.objectId);
					setArrangeOwner(interaction, 'layout-object');
				}
				event.preventDefault();
				contextMenu.open({
					surfaceId: 'scene-plan-arrange',
					x: event.clientX,
					y: event.clientY,
					items: buildArrangeContextMenuItems({
						target: { owner: 'layout-object', objectId: hit.objectId },
						mutationBlockedReason:
							store.isDocumentMutationBlocked ? 'Preview is active' : null,
						actions: {
							deleteLayoutObject: deleteLayoutObjectViaTransaction,
							duplicateScene: () => store.duplicateSelection(),
							focusScene: (entityId) => void store.focusPlacement(entityId),
							toggleSceneVisibility: (entityId) => store.toggleEntityVisibility(entityId),
							deleteScene: () => store.deletePlacements([...store.selectedPlacementIds])
						}
					})
				});
				return;
			}

			// Scene owner — same authority rules as the Delete-key / drag paths.
			const targetSelected = selectedPlacementIds.includes(hit.entityId);
			// A plain-click select replaces the whole selection with this entity,
			// so authority is judged against the post-write selection.
			const postWriteIds = targetSelected
				? selectedPlacementIds
				: [hit.entityId];
			const clusterBlocked = targetSelected && selectedClusterId !== null;
			const ineligible = postWriteIds.some((id) => !stagingEligibleIds.has(id));
			// P11.2 §3 — split: Scene *selection* is AA (a playing Director preview
			// may select), while the context-menu *mutation* reasons stay SB on
			// isDocumentMutationBlocked. Cluster/ineligible authority still blocks
			// selection (those are layout-authority, not preview-state).
			const selectionBlocked = clusterBlocked || ineligible;
			if (!selectionBlocked) {
				setArrangeOwner(interaction, 'scene');
				if (!targetSelected) onSceneSelect?.(hit.entityId, { additive: false, toggle: false });
			}
			const sceneAuthorityBlocked = store.isDocumentMutationBlocked
				? 'Preview is active'
				: clusterBlocked
					? 'Cluster selections are read-only in Plan.'
					: ineligible
						? 'Not editable in Plan. Edit position in 3D.'
						: null;
			event.preventDefault();
			contextMenu.open({
				surfaceId: 'scene-plan-arrange',
				x: event.clientX,
				y: event.clientY,
				items: buildArrangeContextMenuItems({
					target: { owner: 'scene', entityId: hit.entityId },
					sceneTargetHidden: store.isEntityHidden(hit.entityId),
					mutationBlockedReason: store.isDocumentMutationBlocked ? 'Preview is active' : null,
					sceneAuthorityBlockedReason: sceneAuthorityBlocked,
					actions: {
						deleteLayoutObject: deleteLayoutObjectViaTransaction,
						duplicateScene: () => store.duplicateSelection(),
						focusScene: (entityId) => void store.focusPlacement(entityId),
						toggleSceneVisibility: (entityId) => store.toggleEntityVisibility(entityId),
						deleteScene: () =>
							store.deletePlacements([...store.selectedPlacementIds])
					}
				})
			});
			return;
		}

		// ── Layout mode ──
		if (interaction.tool !== 'select') return;
		const tolerance = LAYOUT_PLAN_HIT_RADIUS_PX / interaction.planView.pixelsPerMeter;
		const target = resolvePlanHit(model.queries, point, tolerance);
		if (!target) return;
		if (
			target.kind !== 'room' &&
			target.kind !== 'opening' &&
			target.kind !== 'object'
		) {
			return; // wall/vertex/anchor targets have no approved v1 items
		}
		// selection-before-menu mirrors the click path's slot writes
		if (
			target.kind === 'room' &&
			(interaction.selection.kind !== 'room' || interaction.selection.roomId !== target.roomId)
		) {
			selectLayoutRoom(interaction, target.roomId);
		} else if (
			target.kind === 'opening' &&
			(interaction.selection.kind !== 'opening' ||
				interaction.selection.roomId !== target.roomId ||
				interaction.selection.segmentId !== target.segmentId ||
				interaction.selection.openingId !== target.openingId)
		) {
			selectLayoutOpening(interaction, target.roomId, target.segmentId, target.openingId);
		} else if (
			target.kind === 'object' &&
			(interaction.selection.kind !== 'object' || interaction.selection.objectId !== target.objectId)
		) {
			selectLayoutObject(interaction, target.objectId);
		}
		event.preventDefault();
		contextMenu.open({
			surfaceId: 'scene-plan-layout',
			x: event.clientX,
			y: event.clientY,
			items: buildPlanLayoutContextMenuItems({
				target:
					target.kind === 'room'
						? { kind: 'room', roomId: target.roomId }
						: target.kind === 'opening'
							? { kind: 'opening', roomId: target.roomId, openingId: target.openingId }
							: { kind: 'object', objectId: target.objectId },
				mutationBlockedReason:
					store.isDocumentMutationBlocked ? 'Preview is active' : null,
				actions: {
					renameRoom: renameRoomViaPrompt,
					deleteRoom: (roomId) => void onRoomDelete(roomId),
					deleteOpening: (roomId, openingId) => onOpeningDelete(roomId, openingId),
					deleteObject: deleteLayoutObjectViaTransaction
				}
			})
		});
	}

	/** Existing guarded transaction pattern (same as the Delete-key path). */
	function deleteLayoutObjectViaTransaction(objectId: string): void {
		if (!onLayoutTransactionBegin()) {
			preview.statusMessage = 'Finish the current layout interaction first';
			return;
		}
		const result = deleteLayoutObject(preview, objectId);
		if (result.success) {
			onLayoutTransactionCommit();
			clearLayoutSelection(interaction);
		} else {
			onLayoutTransactionCancel();
		}
		preview.statusMessage = result.success ? 'Deleted layout object' : result.message;
	}

	/** Rename reuses the existing room-fields command via a prompt (v1). */
	function renameRoomViaPrompt(roomId: string): void {
		const room = rooms.find((candidate) => candidate.id === roomId);
		const next = window.prompt('Room name', room?.name ?? '')?.trim();
		if (!next || next === room?.name) return;
		if (!onLayoutTransactionBegin()) {
			preview.statusMessage = 'Finish the current layout interaction first';
			return;
		}
		const result = updateLayoutRoomFields(preview, roomId, { name: next });
		if (result.success) onLayoutTransactionCommit();
		else onLayoutTransactionCancel();
		preview.statusMessage = result.success ? 'Renamed room' : result.message;
	}

	/** P10/P3.3 — the shared Arrange candidate set for hit resolution. */
	function arrangeHitCandidates() {
		return {
			layoutObjects: model.objects
				.filter((object) => !object.readonly)
				.map((object) => ({
					objectId: object.objectId,
					points: object.planFootprint,
					selected: arrangeActiveLayoutObject === object.objectId
				})),
			sceneFootprints: (sceneProjection?.footprints ?? []).map((footprint) => ({
				entityId: footprint.entityId,
				points: footprint.points,
				selected: arrangeActiveScene !== null && selectedPlacementIds.includes(footprint.entityId)
			})),
			edgeHaloMeters: PLAN_SCENE_HIT_HALO_PX / interaction.planView.pixelsPerMeter
		};
	}

	function beginArrangeLayoutObjectRotate(
		event: PointerEvent,
		objectId: string,
		point: LayoutVec2
	): boolean {
		const object = model.objects.find((candidate) => candidate.objectId === objectId);
		if (!object || object.readonly || !svgElement) return false;
		if (!onLayoutTransactionBegin()) return false;
		pointerId = event.pointerId;
		svgElement.setPointerCapture(event.pointerId);
		beginLayoutObjectRotateDrag(
			interaction,
			objectId,
			object.position,
			object.rotation,
			point,
			[object.position[0], object.position[2]]
		);
		return true;
	}

	function beginStagingGesture(
		event: PointerEvent,
		mode: 'translate' | 'rotate',
		ids: readonly string[],
		primaryId: string,
		startWorld: LayoutVec2,
		startScreen: LayoutVec2,
		plainClickEntityId: string | null = null
	): boolean {
		if (!scene || !svgElement || !onSceneGestureBegin?.()) return false;
		const members = capturePlanSceneTransformMembers(scene, ids);
		if (!members) {
			onSceneGestureCancel?.();
			return false;
		}
		stagingGesture = {
			pointerId: event.pointerId,
			mode,
			primaryId,
			members,
			startWorld: [...startWorld],
			startScreen: [...startScreen],
			moved: false,
			plainClickEntityId
		};
		svgElement.setPointerCapture(event.pointerId);
		return true;
	}

	function cancelStagingGesture(): void {
		const gesture = stagingGesture;
		if (!gesture) return;
		onSceneGestureCancel?.();
		if (svgElement?.hasPointerCapture(gesture.pointerId)) {
			svgElement.releasePointerCapture(gesture.pointerId);
		}
		stagingGesture = null;
		stagingRotationHoverScreen = null;
		stagingYawFeedback = null;
	}

	function previewStagingGesture(event: PointerEvent): void {
		const gesture = stagingGesture;
		if (!gesture || gesture.pointerId !== event.pointerId || !sceneRooms) return;
		const point = worldPoint(event);
		const screen = screenPoint(event);
		if (!point || !screen) return;
		if (!gesture.moved && distance(screen, gesture.startScreen) < 2) return;
		gesture.moved = true;
		const patches = gesture.mode === 'translate'
			? translatePlanSceneMembers(
					gesture.members,
					sceneRooms,
					gesture.primaryId,
					gesture.startWorld,
					point,
					{ snapEnabled: interaction.planView.snapEnabled, bypassSnap: event.shiftKey }
				)
			: rotatePlanSceneMembers(
					gesture.members,
					sceneRooms,
					gesture.primaryId,
					gesture.startWorld,
					point,
					event.shiftKey
				);
		if (!patches || !onSceneGesturePreview?.(patches)) cancelStagingGesture();
		// P3.3 — track the primary member's live yaw for the degree label.
		else if (gesture.mode === 'rotate') {
			const patch = patches.find((candidate) => candidate.id === gesture.primaryId);
			stagingYawFeedback = patch ? patch.rotation[1] : null;
		}
	}

	function clearArrangeHover(): void {
		arrangeHover = null;
		stagingYawFeedback = null;
	}

	function canResolveSceneBridge(): boolean {
		return (
			active &&
			interaction.planViewMode === 'layout' &&
			interaction.tool === 'select' &&
			pointerId === null &&
			panPointerId === null &&
			pendingWallBend === null &&
			interiorAnchorPointerId === null &&
			openingDrag === null &&
			interaction.primitiveDraft === null &&
			interaction.objectDrag === null &&
			interaction.roomUnitDrag === null &&
			interaction.editing === null
		);
	}

	function updateSceneBridge(event: PointerEvent): void {
		if (!canResolveSceneBridge() || !sceneProjection) {
			dismissSceneBridge();
			return;
		}
		const point = worldPoint(event);
		const screen = screenPoint(event);
		if (!point || !screen) {
			dismissSceneBridge();
			return;
		}
		const hit = resolvePlanSceneHitAtZoom(
			sceneProjection.footprints,
			point,
			interaction.planView.pixelsPerMeter,
			PLAN_SCENE_HIT_HALO_PX
		);
		if (!hit) {
			dismissSceneBridge();
			return;
		}
		sceneBridgeHover = { entityId: hit.entityId, screen };
	}

	function activateSceneBridge(): void {
		const entityId = sceneBridgeHover?.entityId;
		if (!entityId) return;
		dismissSceneBridge();
		if (onEnterStaging) onEnterStaging(entityId);
		else onPlanModeChange?.('staging');
	}

	function draftPoint(event: PointerEvent, anchor: LayoutVec2 | null): LayoutVec2 | null {
		const raw = worldPoint(event);
		if (!raw) return null;
		let point = raw;
		if (anchor && event.shiftKey && interaction.planView.angleSnapEnabled) {
			point = constrainToAngle(anchor, point);
		}
		if (interaction.planView.snapEnabled) point = snapToGrid(point);
		return point;
	}

	function isPrimitiveTool(tool: LayoutInteractionState['tool']): tool is 'box' | 'cylinder' | 'sphere' {
		return tool === 'box' || tool === 'cylinder' || tool === 'sphere';
	}

	function updatePrimitiveAt(point: LayoutVec2): void {
		const floor = preview.project.layout.floors[0];
		const draft = interaction.primitiveDraft;
		if (!draft) return;
		const center = primitiveDraftCenter({ ...draft, current: point });
		const allowedRoomIds = new Set((floor?.rooms ?? []).map((room) => room.id));
		const room = findPlanHitRoom(model.queries, center, { allowedRoomIds });
		updateLayoutPrimitiveDraft(interaction, point, room?.roomId);
	}

	function beginInteriorAnchorDrag(
		event: PointerEvent,
		roomId: string,
		segmentId: string,
		anchorId: string
	) {
		if (!svgElement) return;
		if (!dragSnapshot) dragSnapshot = captureLayoutPreviewSnapshot(preview);
		selectLayoutInteriorAnchor(interaction, roomId, segmentId, anchorId);
		interiorAnchorPointerId = event.pointerId;
		draggedInteriorAnchor = { roomId, segmentId, anchorId };
		svgElement.setPointerCapture(event.pointerId);
	}

	function clearActiveLayoutDrag() {
		interiorAnchorPointerId = null;
		draggedInteriorAnchor = null;
		pendingWallBend = null;
		openingDrag = null;
		dragSnapshot = null;
		roomUnitSnapshot = null;
		rotationHoverScreen = null;
		pointerId = null;
	}

	function cancelActiveLayoutDrag() {
		if (dragSnapshot) restoreLayoutPreviewSnapshot(preview, dragSnapshot);
		onLayoutTransactionCancel();
		clearActiveLayoutDrag();
		suppressNextClick = true;
	}

	function beginRoomUnitDrag(event: PointerEvent, room: LayoutRoom, mode: 'translate' | 'rotate', point: LayoutVec2): boolean {
		if (!svgElement || !onLayoutTransactionBegin()) return false;
		roomUnitSnapshot = captureLayoutPreviewSnapshot(preview);
		beginLayoutRoomUnitDrag(interaction, room.id, mode, point, layoutRoomUnitPivot(room));
		pointerId = event.pointerId;
		svgElement.setPointerCapture(event.pointerId);
		return true;
	}

	function rotationHandleHit(screen: LayoutVec2): LayoutRoom | null {
		if (interaction.selection.kind !== 'room') return null;
		const room = findLayoutRoom(rooms, interaction.selection.roomId);
		if (!room) return null;
		const handle = rotationHandleScreenPoint(interaction.planView, interactionProjection);
		return handle && distance(handle, screen) <= LAYOUT_PLAN_HIT_RADIUS_PX ? room : null;
	}

	function beginPendingWallBend(event: PointerEvent) {
		const pending = pendingWallBend;
		if (!pending || pending.pointerId !== event.pointerId) return;
		if (!onLayoutTransactionBegin()) {
			pendingWallBend = null;
			return;
		}
		dragSnapshot = captureLayoutPreviewSnapshot(preview);
		const inserted = insertLayoutWallInteriorAnchor(
			preview,
			pending.roomId,
			pending.segmentId,
			pending.projectionPoint
		);
		pendingWallBend = null;
		if (inserted.success) {
			beginInteriorAnchorDrag(event, pending.roomId, pending.segmentId, inserted.anchorId);
			return;
		}
		dragSnapshot = null;
		onLayoutTransactionCancel();
	}

	function onPointerDown(event: PointerEvent) {
		if (event.button === 1) {
			dismissSceneBridge();
			const screen = screenPoint(event);
			if (!screen || !svgElement) return;
			panPointerId = event.pointerId;
			lastPanScreen = screen;
			svgElement.setPointerCapture(event.pointerId);
			event.preventDefault();
			return;
		}
		if (event.button !== 0) return;
		svgElement?.focus();
		const point = worldPoint(event);
		const screen = screenPoint(event);
		if (!point || !screen) return;
		dismissSceneBridge();

		if (interaction.planViewMode === 'staging') {
			if (interaction.tool !== 'select') return;
			// P10 — the active layout-object yaw handle comes first (Arrange owns
			// one Plan rotate handle per owner; only the active one renders).
			if (
				arrangeLayoutRotationHandle &&
				distance(screen, arrangeLayoutRotationHandle.handleScreen) <= LAYOUT_PLAN_HIT_RADIUS_PX
			) {
				beginArrangeLayoutObjectRotate(event, arrangeLayoutRotationHandle.objectId, point);
				return;
			}
			if (
				stagingRotationHandle &&
				distance(screen, stagingRotationHandle.handleScreen) <= LAYOUT_PLAN_HIT_RADIUS_PX
			) {
				beginStagingGesture(
					event,
					'rotate',
					selectedPlacementIds,
					stagingRotationHandle.primaryId,
					point,
					screen
				);
				return;
			}
			// Owner-aware Arrange hit: containment → selected-under-pointer →
			// visual topmost → stable order (see arrange-hit.ts).
			const arrangeHit = resolveArrangeHit({
				point,
				...arrangeHitCandidates()
			});
			if (arrangeHit?.owner === 'layout-object') {
				const object = model.objects.find((candidate) => candidate.objectId === arrangeHit.objectId);
				// Plain click writes the canonical Layout slot + switches the
				// Arrange owner; the inactive Scene slot stays as memory.
				selectLayoutObject(interaction, arrangeHit.objectId);
				setArrangeOwner(interaction, 'layout-object');
				if (object && !object.readonly && svgElement) {
					if (!onLayoutTransactionBegin()) return;
					pointerId = event.pointerId;
					svgElement.setPointerCapture(event.pointerId);
					beginLayoutObjectDrag(interaction, arrangeHit.objectId, object.position, object.rotation);
				}
				return;
			}
			if (arrangeHit?.owner === 'scene') {
				const sceneHit = arrangeHit;
				// P10 — cross-owner modifier-click replaces the active selection
				// with the clicked target (plan §Selection): when the pre-click
				// active target is a layout object, suppress additive/toggle and
				// treat the clicked entity as unselected so the remembered
				// Scene slot is replaced with a single entity — never dragged or
				// extended as a whole.
				const switchingFromLayout = arrangeActiveLayoutObject !== null;
				setArrangeOwner(interaction, 'scene');
				const { toggle, additive, alreadySelected } = resolveArrangeScenePick({
					switchingFromLayout,
					metaKey: event.metaKey,
					ctrlKey: event.ctrlKey,
					shiftKey: event.shiftKey,
					clickedAlreadySelected: selectedPlacementIds.includes(sceneHit.entityId)
				});
				let gestureIds: string[];
				let deferredPlainClick: string | null = null;
				if (toggle) {
					onSceneSelect?.(sceneHit.entityId, { additive: false, toggle: true });
					return;
				} else if (additive) {
					gestureIds = alreadySelected
						? [...selectedPlacementIds]
						: [...selectedPlacementIds, sceneHit.entityId];
					onSceneSelect?.(sceneHit.entityId, { additive: true, toggle: false });
				} else if (alreadySelected) {
					gestureIds = [...selectedPlacementIds];
					deferredPlainClick = sceneHit.entityId;
				} else {
					gestureIds = [sceneHit.entityId];
					onSceneSelect?.(sceneHit.entityId, { additive: false, toggle: false });
				}
				const eligible = gestureIds.every((id) => stagingEligibleIds.has(id));
				const clusterBlocked = selectedClusterId !== null && alreadySelected;
				if (eligible && !clusterBlocked) {
					beginStagingGesture(
						event,
					'translate',
					gestureIds,
					sceneHit.entityId,
					point,
					screen,
					deferredPlainClick
					);
				} else if (deferredPlainClick) {
					onSceneSelect?.(deferredPlainClick, { additive: false, toggle: false });
				}
				return;
			}
			onDeselect?.();
			return;
		}

		if (interaction.tool === 'select') {
			const rotationRoom = rotationHandleHit(screen);
			if (rotationRoom && beginRoomUnitDrag(event, rotationRoom, 'rotate', point)) return;
		}

		if (interaction.tool === 'rectangle') {
			const snapped = draftPoint(event, null);
			if (!snapped || !svgElement) return;
			pointerId = event.pointerId;
			svgElement.setPointerCapture(event.pointerId);
			beginRectangle(interaction, snapped);
			return;
		}

		if (isPrimitiveTool(interaction.tool)) {
			const snapped = draftPoint(event, null);
			if (!snapped || !svgElement) return;
			if (!onLayoutTransactionBegin()) return;
			pointerId = event.pointerId;
			svgElement.setPointerCapture(event.pointerId);
			const allowedRoomIds = new Set((preview.project.layout.floors[0]?.rooms ?? []).map((room) => room.id));
			const room = findPlanHitRoom(model.queries, snapped, { allowedRoomIds });
			beginLayoutPrimitiveDraft(interaction, interaction.tool, snapped, room?.roomId);
			return;
		}

		if (interaction.tool === 'door' || interaction.tool === 'window') {
			const target = resolvePlanHit(model.queries, point, LAYOUT_PLAN_HIT_RADIUS_PX / interaction.planView.pixelsPerMeter);
			if (target?.kind === 'opening') {
				selectLayoutOpening(interaction, target.roomId, target.segmentId, target.openingId);
				setLayoutDraftTool(interaction, 'select');
				return;
			}
			if (target?.kind === 'wall') {
				onOpeningCreate(target.roomId, target.segmentId, interaction.tool, target.projection.offset);
				setLayoutDraftTool(interaction, 'select');
			}
			return;
		}

		if (interaction.tool !== 'select') return;
		const target = resolvePlanHit(model.queries, point, LAYOUT_PLAN_HIT_RADIUS_PX / interaction.planView.pixelsPerMeter);
		if (!target) {
			// a Plan empty-click deselects whichever domain is active (a
			// scene/camera pick may have survived into Plan); default keeps the
			// layout-only clear.
			if (onDeselect) onDeselect();
			else clearLayoutSelection(interaction);
			return;
		}
		if (target.kind === 'vertex') {
			const room = findLayoutRoom(rooms, target.roomId);
			if (!room) return;
			selectLayoutRoom(interaction, target.roomId);
			if (svgElement) {
				if (!onLayoutTransactionBegin()) return;
				pointerId = event.pointerId;
				svgElement.setPointerCapture(event.pointerId);
				beginRoomEdit(interaction, 'vertex', target.roomId, point, roomVertices(room), target.vertexIndex);
			}
			return;
		}
		if (target.kind === 'interiorAnchor') {
			if (!onLayoutTransactionBegin()) return;
			beginInteriorAnchorDrag(event, target.roomId, target.segmentId, target.anchorId);
			return;
		}
		if (target.kind === 'opening') {
			const room = findLayoutRoom(rooms, target.roomId);
			const opening = room?.openings.find((candidate) => candidate.id === target.openingId);
			selectLayoutOpening(interaction, target.roomId, target.segmentId, target.openingId);
			if (svgElement) {
				if (!onLayoutTransactionBegin()) return;
				dragSnapshot = captureLayoutPreviewSnapshot(preview);
				openingDrag = {
					roomId: target.roomId,
					segmentId: target.segmentId,
					openingId: target.openingId,
					width: opening?.width ?? 0
				};
				pointerId = event.pointerId;
				svgElement.setPointerCapture(event.pointerId);
			}
			return;
		}
		if (target.kind === 'object') {
			const object = model.objects.find((candidate) => candidate.objectId === target.objectId);
			selectLayoutObject(interaction, target.objectId);
			if (object && !object.readonly && svgElement) {
				if (!onLayoutTransactionBegin()) return;
				pointerId = event.pointerId;
				svgElement.setPointerCapture(event.pointerId);
				beginLayoutObjectDrag(interaction, target.objectId, object.position);
			}
			return;
		}
		if (target.kind === 'wall') {
			selectLayoutWall(interaction, target.roomId, target.segmentId);
			if (!svgElement) return;
			const projected = interaction.planView.snapEnabled
				? snapToGrid(target.projection.point)
				: target.projection.point;
			pendingWallBend = {
				pointerId: event.pointerId,
				roomId: target.roomId,
				segmentId: target.segmentId,
				projectionPoint: projected,
				originScreen: screen
			};
			svgElement.setPointerCapture(event.pointerId);
			return;
		}

		const room = findLayoutRoom(rooms, target.roomId);
		if (!room) return;
		selectLayoutRoom(interaction, target.roomId);
		beginRoomUnitDrag(event, room, 'translate', point);
	}

	function onPointerMove(event: PointerEvent) {
		if (stagingGesture?.pointerId === event.pointerId) {
			previewStagingGesture(event);
			return;
		}
		if (interaction.planViewMode === 'staging') {
			stagingRotationHoverScreen = screenPoint(event);
			arrangeLayoutRotationHoverScreen = screenPoint(event);
			// P3.3 — presentation-only hover: resolve the same owner-aware hit
			// the click path uses, but only to highlight the footprint. No
			// selection or document writes; hover never looks selected.
			const hoverPoint = worldPoint(event);
			if (interaction.tool === 'select' && !stagingGesture && !interaction.objectDrag && hoverPoint) {
				const hoverHit = resolveArrangeHit({ point: hoverPoint, ...arrangeHitCandidates() });
				const next = hoverHit
					? { owner: hoverHit.owner, id: hoverHit.owner === 'scene' ? hoverHit.entityId : hoverHit.objectId }
					: null;
				if (
					(arrangeHover?.owner ?? null) !== (next?.owner ?? null) ||
					(arrangeHover?.id ?? null) !== (next?.id ?? null)
				) {
					arrangeHover = next;
				}
			} else if (arrangeHover) {
				arrangeHover = null;
			}
		} else if (arrangeHover) {
			arrangeHover = null;
		}
		if (interaction.tool === 'select' && !interaction.roomUnitDrag) {
			rotationHoverScreen = screenPoint(event);
		}
		if (canResolveSceneBridge()) updateSceneBridge(event);
		else dismissSceneBridge();
		if (interaction.primitiveDraft && pointerId === event.pointerId) {
			const point = draftPoint(event, null);
			if (point) updatePrimitiveAt(point);
			return;
		}
		if (panPointerId === event.pointerId && lastPanScreen) {
			const screen = screenPoint(event);
			if (!screen) return;
			panPlanViewport(interaction.planView, [screen[0] - lastPanScreen[0], screen[1] - lastPanScreen[1]]);
			lastPanScreen = screen;
			return;
		}
		if (pendingWallBend && pendingWallBend.pointerId === event.pointerId) {
			const screen = screenPoint(event);
			if (!screen) return;
			if (shouldBeginWallBend(pendingWallBend.originScreen, screen)) {
				beginPendingWallBend(event);
			}
			return;
		}
		if (interiorAnchorPointerId === event.pointerId && draggedInteriorAnchor) {
			const point = worldPoint(event);
			if (!point) return;
			const next = interaction.planView.snapEnabled ? snapToGrid(point) : point;
			updateLayoutWallInteriorAnchor(
				preview,
				draggedInteriorAnchor.roomId,
				draggedInteriorAnchor.segmentId,
				draggedInteriorAnchor.anchorId,
				next
			);
			return;
		}
		if (pointerId !== event.pointerId) return;
		if (interaction.roomUnitDrag && roomUnitSnapshot) {
			const point = worldPoint(event);
			if (!point) return;
			updateLayoutRoomUnitDrag(
				interaction,
				point,
				interaction.planView.snapEnabled,
				interaction.planView.angleSnapEnabled,
				event.shiftKey
			);
			restoreLayoutPreviewSnapshot(preview, roomUnitSnapshot);
			const result = previewLayoutRoomUnit(preview, interaction.roomUnitDrag.roomId, {
				translation: interaction.roomUnitDrag.translation,
				yaw: interaction.roomUnitDrag.yaw
			});
			if (!result.success) preview.statusMessage = result.message;
			return;
		}
		if (interaction.objectDrag) {
			const point = worldPoint(event);
			if (point) updateLayoutObjectDrag(
				interaction,
				point,
				interaction.planView.snapEnabled,
				event.shiftKey,
				interaction.planView.angleSnapEnabled
			);
			return;
		}
		if (openingDrag) {
			const point = worldPoint(event);
			if (!point) return;
			const room = findLayoutRoom(rooms, openingDrag.roomId);
			const segment = room?.boundary.segments.find((candidate) => candidate.id === openingDrag!.segmentId);
			const projection = room && segment
				? projectPointToWall(model.queries, room.id, segment.id, point)
				: null;
			if (!room || !segment || !projection) return;
			const length = compiledWallLength(model.queries, room.id, segment.id);
			const centered = projection.offset - openingDrag.width / 2;
			const offset = interaction.planView.snapEnabled
				? snapSegmentOffset(centered, Math.max(0, length - openingDrag.width))
				: Math.min(Math.max(0, centered), Math.max(0, length - openingDrag.width));
			updateLayoutOpeningFields(preview, openingDrag.roomId, openingDrag.openingId, { offset });
			return;
		}
		if (interaction.tool === 'rectangle') {
			const point = draftPoint(event, interaction.rectangleStart);
			if (point) updateRectangle(interaction, point);
			return;
		}
		if (interaction.tool === 'select' && interaction.editing) {
			const point = worldPoint(event);
			if (point) updateRoomEdit(interaction, point, interaction.planView.snapEnabled);
		}
	}

	function onPointerUp(event: PointerEvent) {
		if (stagingGesture?.pointerId === event.pointerId) {
			const gesture = stagingGesture;
			previewStagingGesture(event);
			if (!stagingGesture) return;
			onSceneGestureCommit?.();
			if (!gesture.moved && gesture.plainClickEntityId) {
				onSceneSelect?.(gesture.plainClickEntityId, { additive: false, toggle: false });
			}
			stagingGesture = null;
			stagingRotationHoverScreen = null;
			stagingYawFeedback = null;
			svgElement?.releasePointerCapture(event.pointerId);
			return;
		}
		if (panPointerId === event.pointerId) {
			panPointerId = null;
			lastPanScreen = null;
			svgElement?.releasePointerCapture(event.pointerId);
			return;
		}
		if (pendingWallBend && pendingWallBend.pointerId === event.pointerId) {
			pendingWallBend = null;
			suppressNextClick = true;
			svgElement?.releasePointerCapture(event.pointerId);
			return;
		}
		if (interiorAnchorPointerId === event.pointerId) {
			interiorAnchorPointerId = null;
			draggedInteriorAnchor = null;
			dragSnapshot = null;
			onLayoutTransactionCommit();
			suppressNextClick = true;
			svgElement?.releasePointerCapture(event.pointerId);
			return;
		}
		if (pointerId !== event.pointerId) return;
		if (interaction.primitiveDraft) {
			const point = draftPoint(event, null);
			if (point) updatePrimitiveAt(point);
			const draft = interaction.primitiveDraft;
			if (!draft?.valid || !draft.roomId) {
				preview.statusMessage = 'Choose a non-zero gesture inside a first-floor room';
				onLayoutTransactionCancel();
			} else {
				const result = commitLayoutPrimitive(
					preview,
					draft.kind,
					draft.start,
					draft.current,
					draft.roomId,
					interaction.planView.snapEnabled
				);
				if (result.success) {
					selectLayoutObject(interaction, result.objectId);
					preview.statusMessage = `Created ${draft.kind} object`;
					onLayoutTransactionCommit();
				} else {
					preview.statusMessage = result.message;
					onLayoutTransactionCancel();
				}
			}
			cancelLayoutPrimitiveDraft(interaction);
			pointerId = null;
			svgElement?.releasePointerCapture(event.pointerId);
			return;
		}
		if (interaction.roomUnitDrag) {
			const changed = onLayoutTransactionCommit();
			if (!changed && roomUnitSnapshot) restoreLayoutPreviewSnapshot(preview, roomUnitSnapshot);
			cancelLayoutRoomUnitDrag(interaction);
			roomUnitSnapshot = null;
			rotationHoverScreen = null;
			pointerId = null;
			preview.statusMessage = changed ? 'Moved room unit' : preview.statusMessage;
			svgElement?.releasePointerCapture(event.pointerId);
			return;
		}
		if (interaction.objectDrag) {
			const drag = interaction.objectDrag;
			const result =
				drag.mode === 'rotate'
					? updateLayoutObjectFields(preview, drag.objectId, {
							position: drag.candidatePosition,
							rotation: drag.candidateRotation
						})
					: updateLayoutObjectFields(preview, drag.objectId, {
							position: drag.candidatePosition
						});
			if (result.success) onLayoutTransactionCommit();
			else onLayoutTransactionCancel();
			cancelLayoutObjectDrag(interaction);
			pointerId = null;
			preview.statusMessage = result.success
				? drag.mode === 'rotate'
					? 'Rotated layout object'
					: 'Moved layout object'
				: result.message;
			svgElement?.releasePointerCapture(event.pointerId);
			return;
		}
		if (openingDrag) {
			onLayoutTransactionCommit();
			openingDrag = null;
			dragSnapshot = null;
			pointerId = null;
			svgElement?.releasePointerCapture(event.pointerId);
			return;
		}
		pointerId = null;
		openingDrag = null;
		dragSnapshot = null;
		svgElement?.releasePointerCapture(event.pointerId);
		if (interaction.tool === 'rectangle') {
			const points = rectanglePoints(interaction);
			if (points && onCommit(points)) clearLayoutDraft(interaction);
			else if (!points) clearLayoutDraft(interaction);
			return;
		}
		if (interaction.tool === 'select' && interaction.editing) {
			const edit = interaction.editing;
			const result = commitLayoutRoomEdit(preview, edit.roomId, edit.currentPoints);
			if (result.success) onLayoutTransactionCommit();
			else onLayoutTransactionCancel();
			cancelRoomEdit(interaction);
		}
	}

	function onPointerCancel(event: PointerEvent) {
		if (stagingGesture?.pointerId === event.pointerId) cancelStagingGesture();
		arrangeLayoutRotationHoverScreen = null;
		if (interaction.primitiveDraft && pointerId === event.pointerId) {
			onLayoutTransactionCancel();
			cancelLayoutPrimitiveDraft(interaction);
			pointerId = null;
		}
		if (interaction.roomUnitDrag && pointerId === event.pointerId) {
			if (roomUnitSnapshot) restoreLayoutPreviewSnapshot(preview, roomUnitSnapshot);
			onLayoutTransactionCancel();
			cancelLayoutRoomUnitDrag(interaction);
			roomUnitSnapshot = null;
			rotationHoverScreen = null;
			pointerId = null;
		}
		if (interaction.objectDrag && pointerId === event.pointerId) {
			onLayoutTransactionCancel();
			cancelLayoutObjectDrag(interaction);
			pointerId = null;
		}
		if (interiorAnchorPointerId === event.pointerId || (openingDrag && pointerId === event.pointerId)) {
			cancelActiveLayoutDrag();
		}
		if (interaction.editing && pointerId === event.pointerId) {
			onLayoutTransactionCancel();
			cancelRoomEdit(interaction);
			pointerId = null;
		}
		if (svgElement?.hasPointerCapture(event.pointerId)) svgElement.releasePointerCapture(event.pointerId);
	}

	function onClick(event: MouseEvent) {
		if (suppressNextClick) {
			suppressNextClick = false;
			return;
		}
		if (interaction.tool !== 'polygon') return;
		const point = worldPoint(event);
		if (!point) return;
		const anchor = interaction.polygonPoints.at(-1) ?? null;
		let nextPoint = point;
		if (anchor && event.shiftKey && interaction.planView.angleSnapEnabled) nextPoint = constrainToAngle(anchor, nextPoint);
		if (interaction.planView.snapEnabled) nextPoint = snapToGrid(nextPoint);
		const first = interaction.polygonPoints[0];
		const closeDistance = 14 / interaction.planView.pixelsPerMeter;
		if (first && interaction.polygonPoints.length >= 3 && distance(first, nextPoint) <= closeDistance) {
			if (onCommit([...interaction.polygonPoints])) clearLayoutDraft(interaction);
			return;
		}
		addPolygonPoint(interaction, nextPoint);
	}

	function finishPolygon() {
		if (interaction.polygonPoints.length < 3) return;
		if (onCommit([...interaction.polygonPoints])) clearLayoutDraft(interaction);
	}

	function onWheel(event: WheelEvent) {
		const screen = screenPoint(event);
		if (!screen) return;
		event.preventDefault();
		zoomPlanViewport(interaction.planView, event.deltaY < 0 ? 1.12 : 1 / 1.12, screen);
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			dismissSceneBridge();
			if (stagingGesture) {
				cancelStagingGesture();
				return;
			}
			if (pendingWallBend) {
				const pendingPointerId = pendingWallBend.pointerId;
				pendingWallBend = null;
				suppressNextClick = true;
				svgElement?.releasePointerCapture(pendingPointerId);
				return;
			}
			if (interaction.roomUnitDrag) {
				onLayoutTransactionCancel();
				cancelLayoutRoomUnitDrag(interaction);
				roomUnitSnapshot = null;
				rotationHoverScreen = null;
				pointerId = null;
				return;
			}
			if (dragSnapshot || draggedInteriorAnchor || openingDrag) {
				cancelActiveLayoutDrag();
				return;
			}
			if (interaction.objectDrag) {
				onLayoutTransactionCancel();
				cancelLayoutObjectDrag(interaction);
				pointerId = null;
				return;
			}
			if (interaction.primitiveDraft) {
				onLayoutTransactionCancel();
				cancelLayoutPrimitiveDraft(interaction);
				pointerId = null;
				return;
			}
			if (interaction.tool === 'door' || interaction.tool === 'window') {
				setLayoutDraftTool(interaction, 'select');
				return;
			}
			onLayoutTransactionCancel();
			clearLayoutDraft(interaction);
			cancelRoomEdit(interaction);
			return;
		}
		if (
			interaction.planViewMode === 'staging' &&
			(event.key === 'Delete' || event.key === 'Backspace') &&
			!event.metaKey && !event.ctrlKey && !event.altKey &&
			stagingTransformEnabled &&
			arrangeActiveScene !== null
		) {
			event.preventDefault();
			event.stopPropagation();
			onSceneDelete?.();
			return;
		}
		if (
			(event.key === 'Delete' || event.key === 'Backspace') &&
			interaction.tool === 'select' &&
			interaction.selection.kind === 'interiorAnchor'
		) {
			event.preventDefault();
			const selection = interaction.selection;
			if (!onLayoutTransactionBegin()) {
				preview.statusMessage = 'Finish the current layout interaction first';
				return;
			}
			const result = deleteLayoutWallInteriorAnchor(
				preview,
				selection.roomId,
				selection.segmentId,
				selection.anchorId
			);
			if (result.success) {
				onLayoutTransactionCommit();
				selectLayoutWall(interaction, selection.roomId, selection.segmentId);
			} else {
				onLayoutTransactionCancel();
				preview.statusMessage = result.message;
			}
			return;
		}
		if ((event.key === 'Delete' || event.key === 'Backspace') && interaction.tool === 'select' && interaction.selection.kind === 'opening') {
			event.preventDefault();
			onOpeningDelete(interaction.selection.roomId, interaction.selection.openingId);
			return;
		}
		if (
			(event.key === 'Delete' || event.key === 'Backspace') &&
			interaction.tool === 'select' &&
			interaction.selection.kind === 'object' &&
			// P10 — in Arrange, Delete routes to the active owner only: a Scene
			// memory selection must never be deleted while a Layout object is
			// the active target, and vice versa. Gate on the derived active
			// target (not the raw remembered owner) so the first-entry
			// null-owner fallback still deletes its active layout object.
			(interaction.planViewMode !== 'staging' || arrangeActiveLayoutObject !== null)
		) {
			event.preventDefault();
			if (!onLayoutTransactionBegin()) {
				preview.statusMessage = 'Finish the current layout interaction first';
				return;
			}
			const result = deleteLayoutObject(preview, interaction.selection.objectId);
			if (result.success) {
				onLayoutTransactionCommit();
				clearLayoutSelection(interaction);
			} else {
				onLayoutTransactionCancel();
			}
			preview.statusMessage = result.success ? 'Deleted layout object' : result.message;
			return;
		}
		// room deletion is a guarded layout transaction (the caller
		// owns begin/commit/cancel + the scene-reference reject policy).
		if ((event.key === 'Delete' || event.key === 'Backspace') && interaction.tool === 'select' && interaction.selection.kind === 'room') {
			event.preventDefault();
			onRoomDelete(interaction.selection.roomId);
			return;
		}
		if (event.key === 'Backspace' && interaction.tool === 'polygon' && interaction.polygonPoints.length > 0) {
			event.preventDefault();
			removeLastPolygonPoint(interaction);
		}
	}

	function distance(a: LayoutVec2, b: LayoutVec2): number {
		return Math.hypot(a[0] - b[0], a[1] - b[1]);
	}

	function findLayoutRoom(roomList: readonly LayoutRoom[], roomId: string): LayoutRoom | undefined {
		return roomList.find((room) => room.id === roomId);
	}

	function roomVertices(room: LayoutRoom): LayoutVec2[] {
		return room.boundary.segments.map((segment) => [...segment.start] as LayoutVec2);
	}

</script>

<div class="plan-viewport" role="presentation" aria-label="Layout Plan drafting viewport" onpointerleave={dismissSceneBridge}>
	<!-- P21.5 §2.1 — no floating .plan-help pill; hints live in the status bar. -->
	{#if stagingSelectionMessage}
		<div class="staging-selection-warning" role="status">{stagingSelectionMessage}</div>
	{/if}
	{#if sceneBridgeHover}
		<button
			type="button"
			class="scene-bridge-chip"
			style={`left: ${sceneBridgeHover.screen[0] + 10}px; top: ${sceneBridgeHover.screen[1] - 12}px`}
			onpointerdown={(event) => event.stopPropagation()}
			onclick={(event) => { event.stopPropagation(); activateSceneBridge(); }}
		>Edit in Arrange</button>
	{/if}
	{#if arrangeEmpty && !stagingSelectionMessage}
		<div class="arrange-empty" role="status">No movable objects here yet — create them in Layout or place them in Scene 3D.</div>
	{/if}
	{#if planEmpty && !ghostVisible}
		<!-- P3.3 — canonical empty-plan onboarding treatment (scene-empty-plan.png).
		     P21.2 ghost takes precedence in Layout; the card remains for the
		     dismissed-but-still-empty session tail and non-Layout empty states. -->
		<div class="plan-empty-state" role="status">
			<strong>Empty floor plan</strong>
			<span>Pick the Room tool to draft your first room, or place an asset from the sidebar.</span>
		</div>
	{/if}
	<!-- svelte-ignore a11y_no_noninteractive_tabindex (plan surface owns keyboard focus) -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions (plan surface owns pointer and keyboard drafting events) -->
	<svg
		bind:this={svgElement}
		class="plan-canvas"
		class:rotation-handle-hover={rotationHandleHovered}
		class:rotation-dragging={Boolean(interaction.roomUnitDrag)}
		class:staging-rotation-handle-hover={stagingRotationHovered}
		class:object-rotation-handle-hover={arrangeLayoutRotationHovered}
		viewBox={viewBox}
		preserveAspectRatio="none"
		role="application"
		tabindex="0"
		aria-label="2D layout plan"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerCancel}
		onclick={onClick}
		onwheel={onWheel}
		onkeydown={onKeyDown}
		oncontextmenu={onPlanContextMenu}
		onpointerleave={() => {
			rotationHoverScreen = null;
			arrangeLayoutRotationHoverScreen = null;
			arrangeHover = null;
		}}
	>
		<PlanCanvasChrome layer="grid" planView={interaction.planView} />
		{#if ghostVisible}
			<PlanEmptyGhost planView={interaction.planView} />
		{/if}
		<PlanSvg model={planModel} planView={interaction.planView} />
		<PlanCanvasChrome layer="overlay" planView={interaction.planView} />
		{#if selectedOpening}
			<text class="selection-label" x="16" y="24">{selectedOpening.kind} · {selectedOpening.width.toFixed(2)} m × {selectedOpening.height.toFixed(2)} m</text>
		{/if}

	</svg>
	<div class="plan-actions">
		{#if interaction.tool === 'polygon' && interaction.polygonPoints.length >= 3}
			<button type="button" onclick={finishPolygon}>Finish polygon</button>
		{/if}
		{#if draftPolygon && draftPolygon.length > 0}
			<button type="button" class="secondary" onclick={() => clearLayoutDraft(interaction)}>Cancel draft</button>
		{/if}
	</div>
	<div class="plan-meta">
		<span>{preview.model.rooms.length} rooms</span>
		<span>{preview.model.objects.length} objects</span>
		<span>{preview.issues.length} geometry warnings</span>
		{#if interaction.planViewMode === 'staging' && selectedPlacementIds.length > 0 && interaction.arrangeOwner !== 'layout-object'}<span>Selected: {selectedPlacementIds.length} scene item{selectedPlacementIds.length === 1 ? '' : 's'}</span>{:else if interaction.selection.kind !== 'none'}<span>Selected: {interaction.selection.kind}</span>{/if}
		{#if preview.lastMutationMessage}<span class="warning">{preview.lastMutationMessage}</span>{/if}
	</div>
</div>

<style>
	.plan-viewport { position: absolute; inset: 0; z-index: 3; background: var(--editor-bg-app); }
	/* P3.2 §9 — the plan is a bright drafting surface against the dark shell. */
	.plan-canvas { display: block; position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: crosshair; outline: none; background: var(--editor-plan-canvas-bg); }
	.plan-canvas.rotation-handle-hover { cursor: grab; }
	.plan-canvas.staging-rotation-handle-hover { cursor: grab; }
	.plan-canvas.object-rotation-handle-hover { cursor: grab; }
	.plan-canvas.rotation-dragging { cursor: grabbing; }
	.selection-label { fill: var(--editor-plan-label); font: 700 12px var(--editor-font); paint-order: stroke; stroke: var(--editor-plan-canvas-bg); stroke-width: 3px; stroke-linejoin: round; pointer-events: none; }
	.scene-bridge-chip { position: absolute; z-index: 8; padding: 0.32rem 0.48rem; border: 1px solid var(--editor-accent); border-radius: 999px; background: var(--editor-bg-selected); color: var(--editor-text-primary); font: 700 0.66rem/1 var(--editor-font); cursor: pointer; box-shadow: var(--editor-shadow-popover); }
	.scene-bridge-chip:hover { background: var(--editor-accent-pressed); }
	.staging-selection-warning { position: absolute; top: 7rem; left: 50%; z-index: 5; max-width: min(34rem, calc(100% - 2rem)); transform: translateX(-50%); padding: 0.42rem 0.65rem; border: 1px solid var(--editor-danger-border); border-radius: 0.35rem; background: var(--editor-bg-panel-raised); color: var(--editor-danger-fg); font: 600 0.7rem/1.25 var(--editor-font); pointer-events: none; text-align: center; }
	.arrange-empty { position: absolute; top: 7rem; left: 50%; z-index: 5; max-width: min(36rem, calc(100% - 2rem)); transform: translateX(-50%); padding: 0.42rem 0.65rem; border: 1px solid var(--editor-border-normal); border-radius: 0.35rem; background: var(--editor-bg-panel-raised); color: var(--editor-text-secondary); font: 600 0.7rem/1.25 var(--editor-font); pointer-events: none; text-align: center; }
	/* P3.3 — canonical empty-plan onboarding card (scene-empty-plan.png). */
	.plan-empty-state { position: absolute; top: 50%; left: 50%; z-index: 5; transform: translate(-50%, -50%); display: grid; gap: 0.45rem; max-width: min(24rem, calc(100% - 4rem)); padding: var(--editor-space-4) var(--editor-space-5); border: 1px solid var(--editor-plan-grid-major); border-radius: var(--editor-radius-lg); background: rgb(255 255 255 / 72%); color: var(--editor-plan-label); text-align: center; pointer-events: none; box-shadow: var(--editor-shadow-popover); }
	.plan-empty-state strong { font-size: 0.86rem; font-weight: 650; }
	.plan-empty-state span { font-size: 0.74rem; line-height: 1.45; color: var(--editor-plan-muted); }
	.plan-actions { position: absolute; right: 0.8rem; bottom: 0.8rem; z-index: 10; display: flex; gap: 0.4rem; pointer-events: auto; }
	.plan-actions button { padding: 0.44rem 0.6rem; border: 1px solid var(--editor-accent-border); border-radius: 0.32rem; background: var(--editor-bg-selected); color: var(--editor-text-primary); font: 600 0.7rem/1 var(--editor-font); cursor: pointer; }
	.plan-actions button.secondary { border-color: var(--editor-border-normal); background: var(--editor-bg-panel-raised); color: var(--editor-text-secondary); }
	.plan-meta { position: absolute; left: 0.8rem; bottom: 0.8rem; z-index: 2; display: flex; gap: 0.7rem; color: var(--editor-plan-muted); font: 0.68rem/1 var(--editor-font); pointer-events: none; }
	.plan-meta .warning { color: var(--editor-danger-fg); }
	@media (max-width: 44rem) {
		.staging-selection-warning { top: 8rem; }
		.arrange-empty { top: 8rem; }
	}
</style>
