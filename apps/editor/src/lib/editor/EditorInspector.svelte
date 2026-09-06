<script lang="ts">
	import { ExternalLink, Info, Lightbulb } from 'lucide-svelte';
	import { resolveAssetFallback } from '$lib/content/assets';
	import { isSceneLightEntity, isSceneModelEntity, isScenePrimitiveEntity } from '$lib/content/scene';
	import type { Asset } from '$lib/types/assets';
	import { tick } from 'svelte';
	import type { EditorWorkspace } from './editor-types';
	import EditorCameraInspector from './camera/EditorCameraInspector.svelte';
	import CameraPlanInspector from './app/CameraPlanInspector.svelte';
	import type { EditorViewState } from './app/editor-view-state.svelte';
	import EditorLightInspector from './EditorLightInspector.svelte';
	import EditorMaterialInspector from './EditorMaterialInspector.svelte';
	import EditorPlacementInspector from './EditorPlacementInspector.svelte';
	import EditorPrimitiveInspector from './EditorPrimitiveInspector.svelte';
	import EditorTransformInspector from './EditorTransformInspector.svelte';
	import EditorNumberField from './fields/EditorNumberField.svelte';
	import { degreesToRadians, radiansToDegrees, type PlacementTransform } from './editor-transform';
	import {
		deleteLayoutObject,
		deleteLayoutOpening,
		deleteLayoutRoom,
		layoutPreviewSourceLabel,
		layoutPreviewStatusLabel,
		layoutRoomSceneReferenceSummary,
		layoutRoomSceneReferenceTotal,
		listLayoutRoomSceneReferences,
		updateLayoutObjectFields,
		updateLayoutOpeningFields,
		updateLayoutRoomFields,
		previewLayoutRoomUnit,
		type LayoutPreviewState,
		type LayoutRoomFieldPatch
	} from './layout/layout-preview-state.svelte';
	import { layoutMutationRunnerFor, runLayoutMutation } from './layout/layout-mutation-runner';
	import {
		selectLayoutObject,
		selectedLayoutRoomId,
		setLayoutDraftTool,
		toggleLayoutAccordion,
		type LayoutInteractionState,
		type LayoutPrimitiveTool
	} from './layout/layout-interaction';
	import { roomBounds, roomEdgeLength } from './layout/layout-editing';
	import {
		type EditorStore
	} from './editor-store.svelte';
	import type { EditorActiveSelectionStore } from './app/active-editor-selection.svelte';
	import type { EditorViewMode } from './app/editor-view-mode';
	import { buildPlanSceneFootprintProjection } from './layout/plan-scene-footprint';
	import { resolveEditorPlacementScale } from './scale-vector';

	let {
		store,
		layoutPreview,
		layoutInteraction,
		activeSelection,
		selectedAsset,
		clusterNameInput = $bindable(),
		viewMode = '3d',
		viewState = null
	}: {
		store: EditorStore;
		layoutPreview: LayoutPreviewState;
		layoutInteraction: LayoutInteractionState;
		/** optional domain-driven panel switch. When provided and a
		 *  domain is active, the panel follows `active.domain` (a scene/camera
		 *  selection survives Plan ↔ 3D and must keep its panel); otherwise it
		 *  falls back to `store.currentWorkspace` — the relic passes nothing
		 *  and is byte-for-byte unchanged. */
		activeSelection?: EditorActiveSelectionStore;
		selectedAsset?: Asset;
		clusterNameInput?: HTMLInputElement;
		/** Authoritative shell view mode. the editor passes the top-level Plan | 3D
		 *  switch so the domain-driven panel can keep a preserved scene/camera
		 *  selection visible yet read-only in Plan (Plan is layout CAD only —
		 *  no non-layout mutation path). Legacy mounts omit it and stay fully
		 *  interactive. */
		viewMode?: EditorViewMode;
		/** P1.8 — the shell view state, so the Camera Plan inspector can
		 *  switch to 3D when previewing a camera. Omitted by the relic. */
		viewState?: EditorViewState | null;
	} = $props();

	let clusterNameDraft = $state('');
	const selectedObject = $derived(store.selectedObject);
	const selectedCameraNode = $derived(store.selectedNavigationNode);
	const selectedNavigation = $derived(store.navigationSelection);
	const singleSelectedEntity = $derived(
		store.selectedPlacementIds.length === 1 &&
			!store.selectedClusterId &&
			store.selectedObject
			? store.selectedObject
			: undefined
	);
	const singleEditableObject = $derived(
		singleSelectedEntity && isSceneModelEntity(singleSelectedEntity)
			? singleSelectedEntity
			: undefined
	);
	const singlePrimitive = $derived(
		singleSelectedEntity && isScenePrimitiveEntity(singleSelectedEntity)
			? singleSelectedEntity
			: undefined
	);
	const singleLight = $derived(
		singleSelectedEntity && isSceneLightEntity(singleSelectedEntity)
			? singleSelectedEntity
			: undefined
	);
	// Phase 5.2 — one selected model/primitive overrides generic Assets
	// inspection so viewport drops and entity edits surface the Material
	// inspector even while the Assets tab stays open.
	const singleMaterialEntity = $derived(
		singleSelectedEntity &&
			(isSceneModelEntity(singleSelectedEntity) || isScenePrimitiveEntity(singleSelectedEntity))
			? singleSelectedEntity
			: undefined
	);
	// panel domain: the active selection when one is provided and a
	// domain is active (S3 view-switch preservation), else the legacy workspace.
	const scenePlanStaging = $derived(
		viewMode === 'plan' &&
		viewState?.domain === 'scene' &&
		layoutInteraction.planViewMode === 'staging'
	);
	// P10 — Arrange (staging) is owner-aware: an active Layout-object target
	// shows the layout owner's panel; otherwise the Scene owner's Arrange panel.
	const domain = $derived<EditorWorkspace>(
		scenePlanStaging
			? activeSelection && activeSelection.active.domain === 'layout'
				? 'layout'
				: 'scene'
			: activeSelection && activeSelection.active.domain !== 'none'
				? activeSelection.active.domain
				: store.currentWorkspace
	);
	// Arrange's read-only gates apply only in the active Scene Plan view;
	// a persisted staging mode must not disable fields after switching to 3D.
	const arrangeMode = $derived(scenePlanStaging);
	// P21.2 — Scene Plan Layout primer: reference card while selection is zero.
	const isScenePlanLayout = $derived(
		viewMode === 'plan' &&
		viewState?.domain === 'scene' &&
		layoutInteraction.planViewMode === 'layout'
	);
	const showLayoutPrimer = $derived(
		isScenePlanLayout && layoutInteraction.selection.kind === 'none'
	);
	// Plan authority is workspace-specific (P1.5): Camera → Plan mounts the
	// live Camera Plan inspector (timing + X/Z authoring); Scene → Plan stays
	// the layout-CAD read-only gate — a preserved scene/camera selection keeps
	// its panel but every non-layout mutation control is inert.
	const isCameraPlan = $derived(viewMode === 'plan' && domain === 'camera');
	const readOnly = $derived(viewMode !== '3d' && !isCameraPlan);
	const readOnlyNonLayout = $derived(readOnly && domain !== 'layout');
	const showAssetInspector = $derived(
		domain === 'scene' &&
			store.leftPanel === 'assets' &&
			!singleMaterialEntity
	);
	const selectionContainsClusteredPlacement = $derived(
		store.selectedPlacementIds.some((id) => store.clusteredPlacementIds.has(id))
	);
	const canGroupSelection = $derived(
		store.selectedPlacementIds.length >= 2 &&
			!store.selectedClusterId &&
			!selectionContainsClusteredPlacement
	);
	const hasPlacementSelection = $derived(
		Boolean(store.selectedCluster) || store.selectedPlacementIds.length > 0
	);
	const stagingEligibleIds = $derived.by(() => {
		void store.placementScaleVectorVersion;
		return new Set(
			buildPlanSceneFootprintProjection(store.document, store.rooms, {
				getEffectiveScale: (entity) =>
					resolveEditorPlacementScale(entity.scale, store.getPlacementScaleVector(entity.id))
			}).footprints.map((footprint) => footprint.entityId)
		);
	});
	const stagingIneligibleCount = $derived(
		store.selectedPlacementIds.filter((id) => !stagingEligibleIds.has(id)).length
	);
	const stagingTransformAvailable = $derived(
		scenePlanStaging &&
		store.selectedClusterId === null &&
		store.selectedPlacementIds.length > 0 &&
		stagingIneligibleCount === 0
	);
	const stagingSingleTransform = $derived(
		stagingTransformAvailable && store.selectedPlacementIds.length === 1
			? store.selectedTransform
			: undefined
	);
	const canDuplicateSelection = $derived(store.selectedPlacementIds.length > 0);
	const layoutRooms = $derived(layoutPreview.project.layout.floors.flatMap((floor) => floor.rooms));
	const selectedLayoutRoom = $derived(
		selectedLayoutRoomId(layoutInteraction)
			? layoutRooms.find((room) => room.id === selectedLayoutRoomId(layoutInteraction))
			: undefined
	);
	const selectedLayoutOpeningSelection = $derived(
		layoutInteraction.selection.kind === 'opening' ? layoutInteraction.selection : null
	);
	const selectedLayoutWallSelection = $derived(
		layoutInteraction.selection.kind === 'wall' ||
			layoutInteraction.selection.kind === 'opening' ||
			layoutInteraction.selection.kind === 'interiorAnchor'
			? layoutInteraction.selection
			: null
	);
	const selectedLayoutOpening = $derived(
		selectedLayoutOpeningSelection && selectedLayoutRoom
			? selectedLayoutRoom.openings.find((opening) => opening.id === selectedLayoutOpeningSelection.openingId)
			: undefined
	);
	const selectedLayoutSegment = $derived(
		selectedLayoutWallSelection && selectedLayoutRoom
			? selectedLayoutRoom.boundary.segments.find((segment) => segment.id === selectedLayoutWallSelection.segmentId)
			: undefined
	);
	const selectedLayoutBounds = $derived(selectedLayoutRoom ? roomBounds(selectedLayoutRoom) : null);
	const selectedLayoutFloor = $derived(
		selectedLayoutRoom
			? layoutPreview.project.layout.floors.find((floor) =>
					floor.rooms.some((room) => room.id === selectedLayoutRoom.id)
				)
			: undefined
	);
	const selectedLayoutObjectId = $derived(
		layoutInteraction.selection.kind === 'object' ? layoutInteraction.selection.objectId : null
	);
	const selectedLayoutObject = $derived(
		selectedLayoutObjectId
			? layoutPreview.project.layout.objects.find((object) => object.id === selectedLayoutObjectId)
			: undefined
	);

	$effect(() => {
		clusterNameDraft = store.selectedCluster?.name ?? '';
	});

	function saveClusterName() {
		const cluster = store.selectedCluster;
		if (!cluster) return;
		const nextName = clusterNameDraft.trim();
		if (!nextName) {
			store.setStatusMessage('Cluster name cannot be empty');
			clusterNameInput?.focus();
			return;
		}
		if (nextName === cluster.name) return;
		if (store.renameCluster(cluster.id, nextName)) {
			clusterNameDraft = nextName;
			store.setStatusMessage(`Renamed cluster to ${nextName}`);
		}
	}

	function ungroupSelection() {
		const cluster = store.selectedCluster;
		if (!cluster || !store.ungroupCluster(cluster.id)) return;
		store.removeClusterTreeExpansion(cluster.id);
		store.setStatusMessage(`Ungrouped ${cluster.name}`);
	}

	async function groupSelection() {
		const clusterId = store.createCluster();
		if (!clusterId) return;
		const cluster = store.selectedCluster;
		if (cluster) store.ensureRoomTreeExpanded(cluster.roomId);
		store.ensureClusterTreeExpanded(clusterId);
		store.focusSelection();
		await tick();
		if (store.selectedClusterId !== clusterId) return;
		clusterNameInput?.focus();
		clusterNameInput?.select();
	}

	function onClusterNameKeyDown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		const cluster = store.selectedCluster;
		if (!cluster) return;
		event.preventDefault();
		event.stopPropagation();
		clusterNameDraft = cluster.name;
		clusterNameInput?.select();
	}

	function armOpeningTool(kind: 'door' | 'window') {
		setLayoutDraftTool(layoutInteraction, kind);
	}

	// one layout mutation = one undo entry: begin → mutate → commit/cancel.
	function runLayoutMutationGuarded<T>(mutate: () => T, didSucceed: (result: T) => boolean) {
		return runLayoutMutation(layoutMutationRunnerFor(store, layoutPreview), mutate, didSucceed);
	}

	function updateOpeningField(field: 'offset' | 'width' | 'height' | 'sillHeight', event: Event) {
		const selection = layoutInteraction.selection;
		if (selection.kind !== 'opening' || !selectedLayoutOpening) return;
		const input = event.currentTarget as HTMLInputElement;
		const value = Number(input.value);
		if (!Number.isFinite(value)) {
			store.setStatusMessage('Opening value must be a finite number');
			input.value = String(selectedLayoutOpening[field]);
			return;
		}
		const outcome = runLayoutMutationGuarded(
			() => updateLayoutOpeningFields(layoutPreview, selection.roomId, selection.openingId, { [field]: value }),
			(result) => result.success
		);
		if (outcome.kind === 'skipped') {
			store.setStatusMessage('Finish the current layout interaction first');
			input.value = String(selectedLayoutOpening[field]);
			return;
		}
		const result = outcome.result;
		if (!result.success) {
			store.setStatusMessage(`Opening rejected: ${result.message}`);
			input.value = String(selectedLayoutOpening[field]);
			return;
		}
		store.setStatusMessage(`Updated opening ${field}`);
	}

	function updateOpeningProfile(event: Event) {
		const selection = layoutInteraction.selection;
		if (selection.kind !== 'opening' || !selectedLayoutOpening) return;
		const profile = (event.currentTarget as HTMLSelectElement).value as typeof selectedLayoutOpening.profile;
		const outcome = runLayoutMutationGuarded(
			() => updateLayoutOpeningFields(layoutPreview, selection.roomId, selection.openingId, { profile }),
			(result) => result.success
		);
		if (outcome.kind === 'skipped') {
			store.setStatusMessage('Finish the current layout interaction first');
			return;
		}
		if (!outcome.result.success) store.setStatusMessage(`Opening rejected: ${outcome.result.message}`);
	}

	function removeSelectedOpening() {
		const selection = layoutInteraction.selection;
		if (selection.kind !== 'opening') return;
		const outcome = runLayoutMutationGuarded(
			() => deleteLayoutOpening(layoutPreview, selection.roomId, selection.openingId),
			(result) => result.success
		);
		if (outcome.kind === 'skipped') {
			store.setStatusMessage('Finish the current layout interaction first');
			return;
		}
		if (!outcome.result.success) {
			store.setStatusMessage(`Opening delete failed: ${outcome.result.message}`);
			return;
		}
		layoutInteraction.selection = { kind: 'wall', roomId: selection.roomId, segmentId: selection.segmentId };
		store.setStatusMessage('Deleted opening');
	}

	function updateRoomName(event: Event) {
		if (!selectedLayoutRoom) return;
		const input = event.currentTarget as HTMLInputElement;
		const roomId = selectedLayoutRoom.id;
		const outcome = runLayoutMutationGuarded(
			() => updateLayoutRoomFields(layoutPreview, roomId, { name: input.value }),
			(result) => result.success
		);
		if (outcome.kind === 'skipped') {
			store.setStatusMessage('Finish the current layout interaction first');
			input.value = selectedLayoutRoom.name;
			return;
		}
		const committed = layoutPreview.project.layout.floors
			.flatMap((floor) => floor.rooms)
			.find((room) => room.id === roomId);
		input.value = committed?.name ?? selectedLayoutRoom.name;
		store.setStatusMessage(outcome.result.success ? 'Updated room name' : `Room rejected: ${outcome.result.message}`);
	}

	function rotateSelectedRoom(event: Event) {
		if (!selectedLayoutRoom) return;
		const input = event.currentTarget as HTMLInputElement;
		const degrees = Number(input.value);
		input.value = '0';
		if (!Number.isFinite(degrees)) {
			store.setStatusMessage('Rotation must be finite');
			return;
		}
		if (Math.abs(degrees) <= 1e-9) return;
		const outcome = runLayoutMutationGuarded(
			() => previewLayoutRoomUnit(layoutPreview, selectedLayoutRoom.id, {
				translation: [0, 0],
				yaw: (degrees * Math.PI) / 180
			}),
			(result) => result.success
		);
		if (outcome.kind === 'skipped') {
			store.setStatusMessage('Finish the current layout interaction first');
			return;
		}
		if (!outcome.result.success) {
			store.setStatusMessage(`Room rotation rejected: ${outcome.result.message}`);
			return;
		}
		store.setStatusMessage(`Rotated room by ${degrees}°`);
	}

	function updateRoomNumber(field: keyof LayoutRoomFieldPatch, event: Event) {
		if (!selectedLayoutRoom || !selectedLayoutFloor) return;
		const input = event.currentTarget as HTMLInputElement;
		const value = Number(input.value);
		const previous = field === 'floorHeight' ? selectedLayoutFloor.height : selectedLayoutRoom[field];
		if (!Number.isFinite(value)) {
			input.value = String(previous);
			store.setStatusMessage('Layout value must be finite');
			return;
		}
		const outcome = runLayoutMutationGuarded(
			() => updateLayoutRoomFields(layoutPreview, selectedLayoutRoom.id, { [field]: value }),
			(result) => result.success
		);
		if (outcome.kind === 'skipped') {
			store.setStatusMessage('Finish the current layout interaction first');
			input.value = String(previous);
			return;
		}
		if (!outcome.result.success) input.value = String(previous);
		store.setStatusMessage(outcome.result.success ? `Updated ${field}` : `Room rejected: ${outcome.result.message}`);
	}

	// P10 — editable Plan X/Z/yaw for layout objects (plan §Inspector and
	// hierarchy), routed through the existing Layout mutation pipeline in one
	// `layout` transaction. Rejected values stay rejected: the field re-syncs
	// from the model prop on the next render.
	function updateObjectVector(field: 'position' | 'rotation', index: 0 | 1 | 2, value: number): void {
		if (!selectedLayoutObject || selectedLayoutObject.kind === 'profile') return;
		if (!Number.isFinite(value)) {
			store.setStatusMessage('Layout value must be finite');
			return;
		}
		const vector = [...selectedLayoutObject[field]] as [number, number, number];
		vector[index] = value;
		const outcome = runLayoutMutationGuarded(
			() => updateLayoutObjectFields(layoutPreview, selectedLayoutObject.id, { [field]: vector }),
			(result) => result.success
		);
		if (outcome.kind === 'skipped') {
			store.setStatusMessage('Finish the current layout interaction first');
			return;
		}
		store.setStatusMessage(outcome.result.success ? `Updated object ${field}` : `Object rejected: ${outcome.result.message}`);
	}

	function updateObjectPosition(index: 0 | 2, value: number): void {
		updateObjectVector('position', index, value);
	}

	function updateObjectYaw(value: number): void {
		updateObjectVector('rotation', 1, degreesToRadians(value));
	}

	function commitStagingTransform(next: PlacementTransform): void {
		const id = store.selectedPlacementId;
		if (!stagingSingleTransform || !id) return;
		if (store.commitPlacementTransform(id, next)) store.setStatusMessage('Updated staged object');
	}

	function updateStagingPosition(index: 0 | 2, value: number): void {
		const transform = stagingSingleTransform;
		if (!transform) return;
		const position = [...transform.position] as typeof transform.position;
		position[index] = value;
		commitStagingTransform({
			...transform,
			position,
			rotation: [...transform.rotation]
		});
	}

	function updateStagingYaw(degrees: number): void {
		const transform = stagingSingleTransform;
		if (!transform) return;
		const rotation = [...transform.rotation] as typeof transform.rotation;
		rotation[1] = degreesToRadians(degrees);
		commitStagingTransform({
			...transform,
			position: [...transform.position],
			rotation
		});
	}

	function deleteStagingSelection(): void {
		if (stagingTransformAvailable) store.deleteSelection();
	}

	function armLayoutPlaceTool(tool: 'door' | 'window' | LayoutPrimitiveTool) {
		if ((tool === 'box' || tool === 'cylinder' || tool === 'sphere') && layoutInteraction.viewMode !== 'plan') {
			store.setStatusMessage('Primitive placement is Plan-only');
			return;
		}
		layoutInteraction.accordions.place = true;
		setLayoutDraftTool(layoutInteraction, tool);
	}

	function selectListedLayoutObject(objectId: string) {
		selectLayoutObject(layoutInteraction, objectId);
		setLayoutDraftTool(layoutInteraction, 'select');
		if (!layoutInteraction.accordions.selection) toggleLayoutAccordion(layoutInteraction, 'selection');
	}

	function updateObjectMetric(
		metric: 'width' | 'depth' | 'height' | 'radius',
		event: Event
	) {
		if (!selectedLayoutObject || selectedLayoutObject.kind === 'profile' || selectedLayoutObject.kind === 'plane') return;
		const input = event.currentTarget as HTMLInputElement;
		const value = Number(input.value);
		if (!Number.isFinite(value) || value <= 0) {
			input.value = String(metric === 'radius' ? selectedLayoutObject.dimensions[0] / 2 : metric === 'width' ? selectedLayoutObject.dimensions[0] : metric === 'depth' ? selectedLayoutObject.dimensions[2] : selectedLayoutObject.dimensions[1]);
			return;
		}
		const dimensions = [...selectedLayoutObject.dimensions] as [number, number, number];
		if (metric === 'width') dimensions[0] = value;
		if (metric === 'depth') dimensions[2] = value;
		if (metric === 'height') dimensions[1] = value;
		if (metric === 'radius') {
			dimensions[0] = value * 2;
			dimensions[2] = value * 2;
		}
		const outcome = runLayoutMutationGuarded(
			() => updateLayoutObjectFields(layoutPreview, selectedLayoutObject.id, { dimensions }),
			(result) => result.success
		);
		if (outcome.kind === 'skipped') {
			store.setStatusMessage('Finish the current layout interaction first');
			input.value = String(metric === 'radius' ? selectedLayoutObject.dimensions[0] / 2 : metric === 'width' ? selectedLayoutObject.dimensions[0] : metric === 'depth' ? selectedLayoutObject.dimensions[2] : selectedLayoutObject.dimensions[1]);
			return;
		}
		if (!outcome.result.success) input.value = String(metric === 'radius' ? selectedLayoutObject.dimensions[0] / 2 : metric === 'width' ? selectedLayoutObject.dimensions[0] : metric === 'depth' ? selectedLayoutObject.dimensions[2] : selectedLayoutObject.dimensions[1]);
		store.setStatusMessage(outcome.result.success ? `Updated object ${metric}` : `Object rejected: ${outcome.result.message}`);
	}

	function updateObjectRoom(event: Event) {
		if (!selectedLayoutObject || selectedLayoutObject.kind === 'profile') return;
		const roomId = (event.currentTarget as HTMLSelectElement).value || undefined;
		const outcome = runLayoutMutationGuarded(
			() => updateLayoutObjectFields(layoutPreview, selectedLayoutObject.id, { roomId }),
			(result) => result.success
		);
		if (outcome.kind === 'skipped') {
			store.setStatusMessage('Finish the current layout interaction first');
			return;
		}
		store.setStatusMessage(outcome.result.success ? 'Updated object room' : `Object rejected: ${outcome.result.message}`);
	}

	function removeLayoutObject(objectId: string) {
		const outcome = runLayoutMutationGuarded(
			() => deleteLayoutObject(layoutPreview, objectId),
			(result) => result.success
		);
		if (outcome.kind === 'skipped') {
			store.setStatusMessage('Finish the current layout interaction first');
			return;
		}
		if (outcome.result.success && selectedLayoutObjectId === objectId) layoutInteraction.selection = { kind: 'none' };
		store.setStatusMessage(outcome.result.success ? 'Deleted layout object' : `Object delete failed: ${outcome.result.message}`);
	}

	function removeSelectedObject() {
		if (selectedLayoutObject) removeLayoutObject(selectedLayoutObject.id);
	}

	// room deletion is blocked while any scene content (entities,
	// clusters, camera nodes, path anchors, waypoints, view keyframes)
	// references the room. The blocker reads the store's authoritative scene
	// document (the layout preview's `project.scene` is a boot-time copy).
	const roomDeleteReferences = $derived(
		selectedLayoutRoom
			? listLayoutRoomSceneReferences(store.document, selectedLayoutRoom.id)
			: null
	);
	const roomDeleteBlocked = $derived(
		Boolean(roomDeleteReferences && layoutRoomSceneReferenceTotal(roomDeleteReferences) > 0)
	);

	function removeSelectedRoom() {
		if (!selectedLayoutRoom) return;
		const outcome = runLayoutMutationGuarded(
			() => deleteLayoutRoom(layoutPreview, selectedLayoutRoom.id, store.document),
			(result) => result.success
		);
		if (outcome.kind === 'skipped') {
			store.setStatusMessage('Finish the current layout interaction first');
			return;
		}
		if (!outcome.result.success) {
			store.setStatusMessage(`Room delete failed: ${outcome.result.message}`);
			return;
		}
		layoutInteraction.selection = { kind: 'none' };
		store.setStatusMessage('Deleted room');
	}

</script>

<aside class="panel inspector" aria-label="Inspector" style="grid-area: right;">
	<header>
		<h2>Inspector</h2>
		{#if domain === 'layout'}
			<p>Layout Plan editing · preview-only</p>
		{:else if showAssetInspector}
			<p>{selectedAsset ? 'Asset library selection' : 'No asset matches the current filters.'}</p>
		{:else if selectedNavigation?.kind === 'node' && selectedCameraNode}
			<p class="id">{selectedCameraNode.id} · {store.isPendingNavigationNode(selectedCameraNode.id) ? 'pending' : store.cameraSelection?.handle}</p>
		{:else if selectedNavigation?.kind === 'connection'}
			<p class="id">{selectedNavigation.connectionId} · connection</p>
		{:else if selectedNavigation?.kind === 'anchor'}
			<p class="id">{selectedNavigation.anchorId} · anchor</p>
		{:else if selectedNavigation?.kind === 'view-keyframe'}
			<p class="id">{selectedNavigation.keyframeId} · {selectedNavigation.direction} view</p>
		{:else if store.selectedCluster}
			<p>{store.selectedCluster.name} · {store.selectedPlacementIds.length} selected</p>
		{:else if store.selectedPlacementIds.length > 1}
			<p>{store.selectedPlacementIds.length} selected</p>
		{:else if selectedObject}
			<p class="id">{selectedObject.id}</p>
		{:else if store.selectedRoomId}
			<p>{store.selectedRoomId} centered. Select an object or camera to edit it.</p>
		{:else}
			<p>Select a room or place a shape to begin editing.</p>
		{/if}
	</header>

	{#if readOnlyNonLayout && !scenePlanStaging}
		<section class="plan-readonly-card" aria-label="Read-only in Plan">
			<div class="plan-readonly-head">
				<Info size={15} aria-hidden="true" />
				<h2>Read-only in Plan</h2>
			</div>
			<p>Camera selections survive the Plan ⇄ 3D switch, but Plan is layout-only. Switch to 3D to edit scenes and cameras.</p>
			<button
				type="button"
				class="plan-readonly-more"
				onclick={() => store.setStatusMessage('Switch to 3D to author scenes and cameras — Plan is layout-only.')}
			>Learn more <ExternalLink size={12} aria-hidden="true" /></button>
		</section>
	{/if}

	{#if domain === 'layout'}
		<section class="layout-inspector" aria-label="Layout preview details">
			{#if showLayoutPrimer}
				<div class="layout-primer" aria-label="Layout primer">
					<strong>Layout primer</strong>
					<p>Rect Room — drag to draw a rectangular room · Poly Room — click points, close to finish.</p>
					<p>Door / Window — click a wall to place a supported opening.</p>
					<p>Grid {layoutInteraction.planView.gridEnabled ? 'on' : 'off'} · Snap 0.25m {layoutInteraction.planView.snapEnabled ? 'on' : 'off'} · Units metric (m).</p>
					<p class="layout-primer-tip">Tip: walls stay room-derived; drag mid-span to bend existing walls.</p>
				</div>
			{/if}
			<dl>
				<div><dt>Project</dt><dd>{layoutPreview.project.name}</dd></div>
				<div><dt>Source</dt><dd>{layoutPreviewSourceLabel(layoutPreview.source)}</dd></div>
				<div><dt>Status</dt><dd>{layoutPreviewStatusLabel(layoutPreview)}</dd></div>
				<div><dt>Rooms</dt><dd>{layoutPreview.model.rooms.length}</dd></div>
				<div><dt>Objects</dt><dd>{layoutPreview.model.objects.length}</dd></div>
				<div><dt>Issues</dt><dd>{layoutPreview.issues.length}</dd></div>
			</dl>
			{#if layoutPreview.importError}<p class="layout-opening-warning" role="alert">Import failed: {layoutPreview.importError}</p>{/if}
			<p class="layout-inspector-note">Openings are geometry-only in this phase. No room adjacency or portal semantics are inferred.</p>

			{#if isScenePlanLayout}
			<div class="layout-accordion">
				<button type="button" class="accordion-trigger" aria-expanded={layoutInteraction.accordions.place} onclick={() => toggleLayoutAccordion(layoutInteraction, 'place')}><strong>Place</strong><span>{layoutInteraction.accordions.place ? '−' : '+'}</span></button>
				{#if layoutInteraction.accordions.place}
					<div class="place-tools" aria-label="Layout place tools">
						<button type="button" disabled={layoutInteraction.viewMode !== 'plan'} onclick={() => armLayoutPlaceTool('door')}>Door</button>
						<button type="button" disabled={layoutInteraction.viewMode !== 'plan'} onclick={() => armLayoutPlaceTool('window')}>Window</button>
						<button type="button" disabled={layoutInteraction.viewMode !== 'plan'} onclick={() => armLayoutPlaceTool('box')}>Box</button>
						<button type="button" disabled={layoutInteraction.viewMode !== 'plan'} onclick={() => armLayoutPlaceTool('cylinder')}>Cylinder</button>
						<button type="button" disabled={layoutInteraction.viewMode !== 'plan'} onclick={() => armLayoutPlaceTool('sphere')}>Sphere</button>
					</div>
				{/if}
			</div>
			{/if}

			<div class="layout-accordion">
				<button type="button" class="accordion-trigger" aria-expanded={layoutInteraction.accordions.objects} onclick={() => toggleLayoutAccordion(layoutInteraction, 'objects')}><strong>Objects</strong><span>{layoutInteraction.accordions.objects ? '−' : '+'}</span></button>
				{#if layoutInteraction.accordions.objects}
					<div class="layout-object-list" aria-label="Layout objects">
						{#if layoutPreview.project.layout.objects.length === 0}<span class="layout-empty">No layout objects.</span>{/if}
						{#each layoutPreview.project.layout.objects as object (object.id)}
							<div class="layout-object-row" class:selected={selectedLayoutObjectId === object.id}>
								<button type="button" class="object-row-select" onclick={() => selectListedLayoutObject(object.id)}><strong>{object.kind}</strong><span>{object.id}</span></button>
								<button type="button" class="object-row-delete" disabled={object.kind === 'profile'} aria-label={`Delete ${object.id}`} onclick={() => removeLayoutObject(object.id)}>Delete</button>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<div class="layout-accordion">
				<button type="button" class="accordion-trigger" aria-expanded={layoutInteraction.accordions.selection} onclick={() => toggleLayoutAccordion(layoutInteraction, 'selection')}><strong>Selection</strong><span>{layoutInteraction.accordions.selection ? '−' : '+'}</span></button>
				{#if layoutInteraction.accordions.selection}
				<div class="layout-selection-content">
			{#if selectedLayoutObject}
				<div class="layout-selected-room" aria-label="Selected layout object">
					<strong>{selectedLayoutObject.kind} object</strong>
					<span>{selectedLayoutObject.id}</span>
				{#if selectedLayoutObject.kind === 'profile'}
					<span>Imported profile placeholder · read-only</span>
				{/if}
				{#if selectedLayoutObject.kind !== 'profile'}
					<fieldset class="staging-transform-fields">
						<legend>Plan transform</legend>
						<div class="staging-field-grid">
							<EditorNumberField
								label="X"
								value={selectedLayoutObject.position[0]}
								step={layoutInteraction.planView.snapEnabled ? 0.25 : 0.01}
								oncommit={(value) => updateObjectPosition(0, value)}
							/>
							<EditorNumberField
								label="Z"
								value={selectedLayoutObject.position[2]}
								step={layoutInteraction.planView.snapEnabled ? 0.25 : 0.01}
								oncommit={(value) => updateObjectPosition(2, value)}
							/>
							<EditorNumberField
								label="Yaw (°)"
								value={radiansToDegrees(selectedLayoutObject.rotation[1])}
								step={15}
								fractionDigits={2}
								oncommit={updateObjectYaw}
							/>
						</div>
					</fieldset>
				{/if}
				{#if selectedLayoutObject.kind === 'profile'}
					<span>Position: {selectedLayoutObject.position.join(', ')} · rotation: {selectedLayoutObject.rotation.join(', ')}</span>
					<span>Dimensions: {selectedLayoutObject.dimensions.join(' × ')}</span>
				{:else if selectedLayoutObject.kind === 'plane'}
					<span>Dimensions: {selectedLayoutObject.dimensions.join(' × ')}</span>
				{:else if selectedLayoutObject.kind === 'box'}
						<label>Width (m)<input type="number" min="0.001" step="0.05" value={selectedLayoutObject.dimensions[0]} disabled={arrangeMode} onchange={(event) => updateObjectMetric('width', event)} /></label>
						<label>Depth (m)<input type="number" min="0.001" step="0.05" value={selectedLayoutObject.dimensions[2]} disabled={arrangeMode} onchange={(event) => updateObjectMetric('depth', event)} /></label>
						<label>Height (m)<input type="number" min="0.001" step="0.05" value={selectedLayoutObject.dimensions[1]} disabled={arrangeMode} onchange={(event) => updateObjectMetric('height', event)} /></label>
					{:else}
						<label>Radius (m)<input type="number" min="0.001" step="0.05" value={selectedLayoutObject.dimensions[0] / 2} disabled={arrangeMode} onchange={(event) => updateObjectMetric('radius', event)} /></label>
						<label>Height (m)<input type="number" min="0.001" step="0.05" value={selectedLayoutObject.dimensions[1]} disabled={arrangeMode} onchange={(event) => updateObjectMetric('height', event)} /></label>
					{/if}
					<div class="object-room-meta"><span>Room ownership</span><strong>{layoutRooms.find((room) => room.id === selectedLayoutObject.roomId)?.name ?? 'Unassigned'} · {selectedLayoutObject.roomId ?? 'none'}</strong></div>
					{#if layoutPreview.lastMutationMessage}<p class="layout-opening-warning" role="status">{layoutPreview.lastMutationMessage}</p>{/if}
					<button type="button" class="layout-danger" disabled={selectedLayoutObject.kind === 'profile'} onclick={removeSelectedObject}>Delete object</button>
				</div>
			{:else if selectedLayoutOpening && selectedLayoutSegment && selectedLayoutRoom}
				<div class="layout-selected-room" aria-label="Selected layout opening">
					<strong>{selectedLayoutOpening.kind} opening</strong>
					<span>{selectedLayoutRoom.name} · {selectedLayoutRoom.id}</span>
					<span>Wall: {selectedLayoutSegment.id} · {roomEdgeLength(selectedLayoutRoom, selectedLayoutRoom.boundary.segments.indexOf(selectedLayoutSegment)).toFixed(2)} m</span>
					<label>Offset from wall start (m)<input type="number" min="0" step="0.05" value={selectedLayoutOpening.offset} onchange={(event) => updateOpeningField('offset', event)} /></label>
					<label>Width (m)<input type="number" min="0.01" step="0.05" value={selectedLayoutOpening.width} onchange={(event) => updateOpeningField('width', event)} /></label>
					<label>Height (m)<input type="number" min="0.01" step="0.05" value={selectedLayoutOpening.height} onchange={(event) => updateOpeningField('height', event)} /></label>
					<label>Sill height (m)<input type="number" min="0" step="0.05" value={selectedLayoutOpening.sillHeight} onchange={(event) => updateOpeningField('sillHeight', event)} /></label>
					<label>Profile<select value={selectedLayoutOpening.profile} onchange={updateOpeningProfile}>
						<option value="rectangular">Rectangular</option>
						<option value="rounded">Rounded arch</option>
						<option value="pointed">Pointed arch</option>
					</select></label>
					{#if layoutPreview.lastMutationMessage}
						<p class="layout-opening-warning" role="status">{layoutPreview.lastMutationMessage}</p>
					{/if}
					<button type="button" class="layout-danger" onclick={removeSelectedOpening}>Delete opening</button>
				</div>
			{:else if selectedLayoutSegment && selectedLayoutRoom && (layoutInteraction.selection.kind === 'wall' || layoutInteraction.selection.kind === 'interiorAnchor')}
				<div class="layout-selected-room" aria-label="Selected layout wall">
					<strong>Wall selected</strong>
					<span>{selectedLayoutRoom.name} · {selectedLayoutRoom.id}</span>
					<span>{selectedLayoutSegment.id}</span>
					<span>Length: {roomEdgeLength(selectedLayoutRoom, selectedLayoutRoom.boundary.segments.indexOf(selectedLayoutSegment)).toFixed(2)} m</span>
					{#if layoutInteraction.selection.kind === 'interiorAnchor'}
						<span>Bend anchor: {layoutInteraction.selection.anchorId}</span>
					{/if}
					<label>Wall thickness (m)<input type="number" min="0.001" step="0.01" value={selectedLayoutRoom.wallThickness} onchange={(event) => updateRoomNumber('wallThickness', event)} /></label>
					<label>Floor thickness (m)<input type="number" min="0.001" step="0.01" value={selectedLayoutRoom.floorThickness} onchange={(event) => updateRoomNumber('floorThickness', event)} /></label>
					<label>Rotate by (°)<input type="number" step="15" value="0" onchange={rotateSelectedRoom} /></label>
					<label>Ceiling thickness (m)<input type="number" min="0.001" step="0.01" value={selectedLayoutRoom.ceilingThickness} onchange={(event) => updateRoomNumber('ceilingThickness', event)} /></label>
					{#if selectedLayoutFloor}<label>Floor height (m)<input type="number" min="0.001" step="0.05" value={selectedLayoutFloor.height} onchange={(event) => updateRoomNumber('floorHeight', event)} /></label>{/if}
					<div class="layout-opening-actions">
						<button type="button" onclick={() => armOpeningTool('door')}>Door</button>
						<button type="button" onclick={() => armOpeningTool('window')}>Window</button>
					</div>
				</div>
			{:else if selectedLayoutRoom && selectedLayoutBounds}
				<div class="layout-selected-room" aria-label="Selected layout room">
					<strong>{selectedLayoutRoom.name}</strong>
					<span>{selectedLayoutRoom.id}</span>
					<span>Bounds: {selectedLayoutBounds.width.toFixed(2)} m × {selectedLayoutBounds.height.toFixed(2)} m</span>
					<span>Edges: {selectedLayoutRoom.boundary.segments.map((_, index) => `${roomEdgeLength(selectedLayoutRoom, index).toFixed(2)} m`).join(' · ')}</span>
					<label>Name<input type="text" value={selectedLayoutRoom.name} onchange={updateRoomName} /></label>
					<label>Wall thickness (m)<input type="number" min="0.001" step="0.01" value={selectedLayoutRoom.wallThickness} onchange={(event) => updateRoomNumber('wallThickness', event)} /></label>
					<label>Floor thickness (m)<input type="number" min="0.001" step="0.01" value={selectedLayoutRoom.floorThickness} onchange={(event) => updateRoomNumber('floorThickness', event)} /></label>
					<label>Rotate by (°)<input type="number" step="15" value="0" onchange={rotateSelectedRoom} /></label>
					<label>Ceiling thickness (m)<input type="number" min="0.001" step="0.01" value={selectedLayoutRoom.ceilingThickness} onchange={(event) => updateRoomNumber('ceilingThickness', event)} /></label>
					{#if selectedLayoutFloor}<label>Floor height (m)<input type="number" min="0.001" step="0.05" value={selectedLayoutFloor.height} onchange={(event) => updateRoomNumber('floorHeight', event)} /></label>{/if}
					{#if layoutPreview.lastMutationMessage}<p class="layout-opening-warning" role="status">{layoutPreview.lastMutationMessage}</p>{/if}
					{#if roomDeleteReferences && roomDeleteBlocked}
						<p class="layout-opening-warning" role="alert">Delete blocked — referenced by {layoutRoomSceneReferenceSummary(roomDeleteReferences)}</p>
					{/if}
					<button
						type="button"
						class="layout-danger"
						disabled={roomDeleteBlocked || store.isDocumentMutationBlocked || store.isEditorInteractionActive}
						title={roomDeleteBlocked && roomDeleteReferences
							? `Delete blocked: referenced by ${layoutRoomSceneReferenceSummary(roomDeleteReferences)}`
							: undefined}
						onclick={removeSelectedRoom}
					>Delete room</button>
				</div>
			{/if}
				</div>
				{/if}
			</div>
			{#if layoutPreview.issues.length > 0}
				<div class="layout-issues" role="alert">
					<strong>Geometry warnings</strong>
					<ul>
						{#each layoutPreview.issues as issue (`${issue.path}:${issue.code}`)}
							<li><code>{issue.targetId ?? issue.path}</code> — {issue.message}</li>
						{/each}
					</ul>
				</div>
			{/if}
		</section>
	{:else if scenePlanStaging}
		<section class="staging-selection" aria-label="Arrange selection">
			<div class="section-heading">
				<h2>Arrange selection</h2>
				<span class="staging-badge">{stagingTransformAvailable ? 'Plan transform' : 'Read-only'}</span>
			</div>
			{#if hasPlacementSelection}
				{#if store.selectedCluster}
					<p><strong>{store.selectedCluster.name}</strong></p>
					<p>{store.selectedPlacementIds.length} objects · {store.selectedCluster.id}</p>
				{:else if store.selectedPlacementIds.length > 1}
					<p><strong>{store.selectedPlacementIds.length} objects selected</strong></p>
					<p>{store.selectedPlacementIds.join(' · ')}</p>
				{:else if selectedObject}
					<p><strong>{selectedObject.name}</strong></p>
					<p>{selectedObject.kind} · {selectedObject.id}</p>
				{/if}
				{#if stagingIneligibleCount > 0}
					<p class="staging-warning" role="status">
						{stagingIneligibleCount === store.selectedPlacementIds.length
							? 'Not editable in Plan. Edit position in 3D.'
							: 'Some selected items are not editable in Plan.'}
					</p>
				{:else}
					{#if stagingSingleTransform}
						<fieldset class="staging-transform-fields">
							<legend>Room-local Plan transform</legend>
							<div class="staging-field-grid">
								<EditorNumberField
									label="X"
									value={stagingSingleTransform.position[0]}
									step={layoutInteraction.planView.snapEnabled ? 0.25 : 0.01}
									oncommit={(value) => updateStagingPosition(0, value)}
								/>
								<EditorNumberField
									label="Z"
									value={stagingSingleTransform.position[2]}
									step={layoutInteraction.planView.snapEnabled ? 0.25 : 0.01}
									oncommit={(value) => updateStagingPosition(2, value)}
								/>
								<EditorNumberField
									label="Yaw (°)"
									value={radiansToDegrees(stagingSingleTransform.rotation[1])}
									step={15}
									fractionDigits={2}
									oncommit={updateStagingYaw}
								/>
							</div>
						</fieldset>
					{:else}
						<p class="staging-status">Drag selected footprints together or use the primary rotation handle.</p>
					{/if}
					<button type="button" class="layout-danger" onclick={deleteStagingSelection}>Delete selected</button>
				{/if}
				<button type="button" class="deselect" onclick={() => store.selectionActions.deselect()}>Clear selection</button>
			{:else}
				<p>Select a Scene footprint in Plan or choose an item in the hierarchy.</p>
			{/if}
		</section>
	{:else if showAssetInspector}
		{#if selectedAsset}
			<section class="asset-details" aria-label="Asset details">
				<div>
					<h2>{selectedAsset.name}</h2>
					<p class="id">{selectedAsset.id}</p>
				</div>
				<dl>
					<div><dt>Category</dt><dd>{selectedAsset.category}</dd></div>
					<div><dt>Status</dt><dd>{selectedAsset.status}</dd></div>
					<div><dt>Placement</dt><dd>{selectedAsset.placementSurface}</dd></div>
					<div><dt>Fallback</dt><dd>{resolveAssetFallback(selectedAsset)}</dd></div>
					<div><dt>File</dt><dd>{selectedAsset.productionFile ?? 'Fallback only'}</dd></div>
					<div><dt>Creator</dt><dd>{selectedAsset.creator ?? 'Not recorded'}</dd></div>
					<div><dt>Licence</dt><dd>{selectedAsset.license}</dd></div>
				</dl>
				{#if selectedAsset.placementSurface === 'floor'}
					<button
						type="button"
						class="place"
						class:active={store.pendingPlacementAssetId === selectedAsset.id}
						disabled={readOnly}
						onclick={() => store.beginAssetPlacement(selectedAsset.id)}
					>
						{store.pendingPlacementAssetId === selectedAsset.id
							? 'Placing…'
							: store.isRelic
								? 'Place in Paris'
								: 'Place in room'}
					</button>
				{:else}
					<p class="unsupported">
						{selectedAsset.placementSurface === 'surface'
							? 'Placement on tables or pedestals is not available in Phase 5.'
							: `${selectedAsset.placementSurface[0]?.toUpperCase()}${selectedAsset.placementSurface.slice(1)} placement is not available in Phase 5.`}
					</p>
				{/if}
			</section>
		{:else}
			<section class="empty-selection" aria-label="No asset selection">
				<p>Choose a model, or open Assets → Shapes to place a primitive.</p>
			</section>
		{/if}
	{:else if selectedNavigation}
		{#if isCameraPlan}
			<CameraPlanInspector {store} {viewState} />
		{:else if !readOnlyNonLayout}
			<EditorCameraInspector {store} />
		{/if}
	{:else if hasPlacementSelection}
		{#if !readOnlyNonLayout}
		<section class="grouping" aria-label="Group selection">
			<div class="section-heading">
				<h2>Group selection</h2>
				{#if store.selectedCluster}<span class="grouped-badge">Grouped</span>{/if}
			</div>

			{#if store.selectedCluster}
				<p class="group-summary">
					<strong>{store.selectedCluster.name}</strong>
					<span>{store.selectedCluster.memberIds.length} objects in this cluster</span>
				</p>
				{#key store.selectedCluster.id}
					<form class="rename-form" onsubmit={(event) => { event.preventDefault(); saveClusterName(); }}>
						<label class="rename">
							<span>Cluster name</span>
							<input bind:this={clusterNameInput} bind:value={clusterNameDraft} aria-label="Cluster name" onkeydown={onClusterNameKeyDown} />
						</label>
						<div class="group-actions">
							<button type="submit" class="primary-action" disabled={!clusterNameDraft.trim() || clusterNameDraft.trim() === store.selectedCluster.name}>Save name</button>
							<button type="button" class="danger-action" onclick={ungroupSelection}>Ungroup</button>
						</div>
					</form>
				{/key}
			{:else}
				<p class="group-hint" id="group-selection-hint">
					{#if selectionContainsClusteredPlacement}
						Selected objects must be ungrouped before creating another cluster.
					{:else if store.selectedPlacementIds.length === 1}
						Select one more object to create a cluster.
					{:else}
						Ready to create a folder-style cluster from this selection.
					{/if}
				</p>
				<button type="button" class="group-button" disabled={!canGroupSelection} aria-describedby="group-selection-hint" onclick={() => void groupSelection()}>
					{store.selectedPlacementIds.length >= 2 ? `Group ${store.selectedPlacementIds.length} objects` : 'Group selection'}
				</button>
			{/if}
		</section>

		{#if !store.selectedCluster && store.selectedPlacementIds.length > 1}
			<section class="selection" aria-label="Multiple selection">
				<p>{store.selectedPlacementIds.length} objects selected. Numeric transforms are available for a single object.</p>
				<button type="button" class="deselect" onclick={() => store.selectionActions.deselect()}>Clear selection</button>
			</section>
		{:else if singleEditableObject}
			<section class="selection" aria-label="Selection">
				<dl>
					<div><dt>Room</dt><dd>{singleEditableObject.roomId}</dd></div>
					<div><dt>Asset</dt><dd class="id">{singleEditableObject.assetId}</dd></div>
				</dl>
				<button type="button" class="deselect" onclick={() => store.selectionActions.deselect()}>Deselect object</button>
			</section>
			{#key singleEditableObject.id}
				<EditorTransformInspector {store} />
				<EditorMaterialInspector {store} />
			{/key}
		{:else if singlePrimitive}
			<section class="selection" aria-label="Selection">
				<button type="button" class="deselect" onclick={() => store.selectionActions.deselect()}>Deselect object</button>
			</section>
			{#key singlePrimitive.id}
				<EditorPrimitiveInspector {store} />
				<EditorMaterialInspector {store} />
				<EditorTransformInspector {store} />
			{/key}
		{:else if singleLight}
			<section class="selection" aria-label="Selection">
				<button type="button" class="deselect" onclick={() => store.selectionActions.deselect()}>Deselect object</button>
			</section>
			{#key singleLight.id}
				<EditorLightInspector {store} />
				<EditorTransformInspector {store} />
			{/key}
		{:else if singleSelectedEntity}
			<section class="selection" aria-label="Selection">
				<dl>
					<div><dt>Room</dt><dd>{singleSelectedEntity.roomId}</dd></div>
					<div><dt>Kind</dt><dd>{singleSelectedEntity.kind}</dd></div>
					<div><dt>Name</dt><dd>{singleSelectedEntity.name}</dd></div>
				</dl>
				<button type="button" class="deselect" onclick={() => store.selectionActions.deselect()}>Deselect object</button>
			</section>
			{#key singleSelectedEntity.id}<EditorTransformInspector {store} />{/key}
		{/if}

		<section class="placement-actions" aria-label="Placement actions">
			<h2>Placement actions</h2>
			<div>
				<button type="button" disabled={!canDuplicateSelection} onclick={() => store.duplicateSelection()}>Duplicate{store.selectedPlacementIds.length > 1 ? ` ${store.selectedPlacementIds.length}` : ''}</button>
				<button type="button" class="delete" onclick={() => store.deleteSelection()}>Delete{store.selectedPlacementIds.length > 1 ? ` ${store.selectedPlacementIds.length}` : ''}</button>
			</div>
			<p>Cmd/Ctrl+D duplicates · Delete removes · Undo restores</p>
		</section>

		<EditorPlacementInspector {store} />
		{/if}
	{:else}
		<section class="empty-selection" aria-label="Editor help">
			<h2>No selection</h2>
			<p>Choose a room, object, cluster, camera node, path, or asset to inspect its settings.</p>
			{#if store.statusMessage}<p class="status" role="status">{store.statusMessage}</p>{/if}
		</section>
	{/if}

	{#if readOnly}
		<p class="plan-footer-note">
			<span class="plan-footer-note__icon"><Lightbulb size={13} aria-hidden="true" /></span>
			Plan edits affect geometry and layout only. Open in 3D to place scenes and cameras.
		</p>
	{/if}

</aside>

<style>
	.panel { display: flex; flex-direction: column; gap: 1rem; padding: 1rem 1.1rem; overflow: auto; background: var(--editor-bg-panel); }
	.inspector { border-left: 1px solid var(--editor-border-subtle); }
	header h2, section h2 { margin: 0; font-size: 0.95rem; font-weight: 650; letter-spacing: 0.02em; }
	header p { margin: 0.35rem 0 0; color: var(--editor-text-secondary); font-size: 0.75rem; line-height: 1.4; }
	section { display: flex; flex-direction: column; gap: 0.55rem; }
	.id { font-family: var(--editor-font); font-size: 0.75rem; overflow-wrap: anywhere; }
	.layout-inspector { display: flex; flex-direction: column; gap: 0.8rem; }
	.layout-inspector dl { display: flex; flex-direction: column; gap: 0.45rem; margin: 0; }
	.layout-inspector dl div { display: flex; justify-content: space-between; gap: 0.7rem; }
	.layout-inspector dt { color: var(--editor-text-tint); font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.04em; }
	.layout-inspector dd { margin: 0; color: var(--editor-text-primary); font-size: 0.72rem; text-align: right; }
	.layout-inspector-note { margin: 0; color: var(--editor-text-secondary); font-size: 0.7rem; line-height: 1.45; }
	.layout-primer { display: flex; flex-direction: column; gap: 0.35rem; padding: 0.6rem 0.65rem; border: 1px solid var(--editor-border-subtle); border-radius: 0.4rem; background: var(--editor-bg-panel-raised); }
	.layout-primer strong { font-size: 0.74rem; font-weight: 650; letter-spacing: 0.02em; color: var(--editor-text-primary); }
	.layout-primer p { margin: 0; color: var(--editor-text-secondary); font-size: 0.7rem; line-height: 1.45; }
	.layout-primer-tip { color: var(--editor-text-muted); }
	.layout-accordion { display: flex; flex-direction: column; gap: 0.45rem; padding: 0.55rem; border: 1px solid var(--editor-border-subtle); border-radius: 0.4rem; background: var(--editor-bg-panel-raised); }
	.accordion-trigger { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 0.2rem 0; border: 0; background: transparent; color: var(--editor-text-primary); font: inherit; font-size: 0.75rem; cursor: pointer; }
	.accordion-trigger span { color: var(--editor-accent); font-size: 1rem; }
	.place-tools { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.35rem; }
	.place-tools button { padding: 0.4rem 0.3rem; border: 1px solid var(--editor-border-normal); border-radius: 0.3rem; background: var(--editor-bg-control); color: var(--editor-text-primary); font: inherit; font-size: 0.68rem; cursor: pointer; }
	.place-tools button:disabled { opacity: 0.4; cursor: default; }
	.layout-object-list { display: flex; flex-direction: column; gap: 0.3rem; }
	.layout-empty { color: var(--editor-text-muted); font-size: 0.68rem; }
	.layout-object-row { display: flex; align-items: stretch; gap: 0.3rem; }
	.layout-object-row.selected { outline: 1px solid var(--editor-accent); border-radius: 0.3rem; }
	.object-row-select { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 0.12rem; padding: 0.38rem; border: 1px solid var(--editor-border-normal); border-radius: 0.3rem; background: var(--editor-bg-panel-raised); color: var(--editor-text-primary); text-align: left; cursor: pointer; }
	.object-row-select span { overflow-wrap: anywhere; color: var(--editor-text-secondary); font: 0.62rem var(--editor-font); }
	.object-row-delete { padding: 0.3rem; border: 1px solid var(--editor-danger-border); border-radius: 0.3rem; background: var(--editor-danger-soft); color: var(--editor-danger-fg); font: inherit; font-size: 0.64rem; cursor: pointer; }
	.object-row-delete:disabled { opacity: 0.4; cursor: default; }
	.layout-selection-content { display: flex; flex-direction: column; gap: 0.5rem; }
	.layout-selected-room { display: flex; flex-direction: column; gap: 0.2rem; padding: 0.6rem; border: 1px solid var(--editor-accent-border); border-radius: 0.35rem; background: var(--editor-bg-selected); color: var(--editor-text-primary); font-size: 0.7rem; }
	.layout-selected-room span { color: var(--editor-text-secondary); font-size: 0.66rem; overflow-wrap: anywhere; }
	.layout-selected-room label { display: flex; flex-direction: column; gap: 0.25rem; color: var(--editor-text-secondary); font-size: 0.66rem; }
	.layout-selected-room input, .layout-selected-room select { box-sizing: border-box; width: 100%; padding: 0.34rem; border: 1px solid var(--editor-border-normal); border-radius: 0.28rem; background: var(--editor-bg-panel-raised); color: var(--editor-text-primary); font: inherit; }
	.layout-selected-room input:focus, .layout-selected-room select:focus { outline: 1px solid var(--editor-accent); border-color: var(--editor-accent); }
	.layout-selected-room input:disabled, .layout-selected-room select:disabled, .layout-danger:disabled { opacity: 0.48; cursor: default; }
	.layout-opening-actions { display: flex; gap: 0.35rem; }
	.layout-opening-actions button, .layout-danger { padding: 0.4rem 0.5rem; border: 1px solid var(--editor-accent-border); border-radius: 0.28rem; background: var(--editor-bg-selected); color: var(--editor-text-primary); font: inherit; font-size: 0.68rem; cursor: pointer; }
	.layout-danger { border-color: var(--editor-danger-border); background: var(--editor-danger-soft); color: var(--editor-danger-fg); }
	.layout-opening-warning { margin: 0; color: var(--editor-danger-fg); font-size: 0.66rem; }
	.layout-issues { max-height: 12rem; overflow: auto; padding: 0.55rem; border: 1px solid var(--editor-danger-border); border-radius: 0.35rem; background: var(--editor-danger-soft); color: var(--editor-danger-fg); font-size: 0.68rem; line-height: 1.4; }
	.layout-issues ul { display: flex; flex-direction: column; gap: 0.35rem; margin: 0.4rem 0 0; padding-left: 1rem; }
	.layout-issues code { color: var(--editor-text-primary); font-size: 0.63rem; }
	.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
	.asset-details { padding: 0.75rem; border: 1px solid var(--editor-border-subtle); border-radius: 0.4rem; background: var(--editor-bg-panel-raised); }
	.asset-details > div > .id { margin: 0.2rem 0 0; color: var(--editor-text-muted); font-size: 0.66rem; }
	.asset-details dl, .selection dl { display: flex; flex-direction: column; gap: 0.4rem; margin: 0; }
	.asset-details dl div { display: grid; grid-template-columns: 4.5rem minmax(0, 1fr); gap: 0.4rem; }
	.asset-details dt, .selection dt { color: var(--editor-text-muted); font-size: 0.64rem; text-transform: uppercase; letter-spacing: 0.04em; }
	.asset-details dd { min-width: 0; margin: 0; font-size: 0.69rem; overflow-wrap: anywhere; }
	.place { padding: 0.48rem 0.6rem; border: 1px solid var(--editor-accent-border); border-radius: 0.32rem; background: var(--editor-bg-control); color: var(--editor-text-primary); font: inherit; font-size: 0.73rem; cursor: pointer; }
	.place.active { background: var(--editor-bg-selected); box-shadow: inset 0 0 0 1px var(--editor-accent); }
	.unsupported, .empty-selection p { margin: 0; color: var(--editor-text-secondary); font-size: 0.72rem; line-height: 1.4; }
	/* S10.1 — Plan read-only info card + footer note (concept-sketch copy). */
	.plan-readonly-card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem 0.85rem;
		border: 1px solid var(--editor-accent-border);
		border-radius: 0.45rem;
		background: var(--editor-bg-panel-raised);
	}
	.plan-readonly-head { display: flex; align-items: center; gap: 0.45rem; color: var(--editor-accent-hover); }
	.plan-readonly-head h2 { margin: 0; font-size: 0.9rem; color: var(--editor-text-primary); }
	.plan-readonly-card p { margin: 0; color: var(--editor-text-secondary); font-size: 0.72rem; line-height: 1.4; }
	.plan-readonly-more {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		align-self: flex-start;
		padding: 0.3rem 0.5rem;
		border: 1px solid var(--editor-border-strong);
		border-radius: 0.3rem;
		background: transparent;
		color: var(--editor-text-secondary);
		font: inherit;
		font-size: 0.68rem;
		cursor: pointer;
	}
	.plan-readonly-more:hover { border-color: var(--editor-accent-border); color: var(--editor-text-primary); }
	.staging-selection { display: flex; flex-direction: column; gap: 0.65rem; }
	.staging-selection p { margin: 0; color: var(--editor-text-muted); font-size: 0.72rem; line-height: 1.4; overflow-wrap: anywhere; }
	.staging-selection p strong { color: var(--editor-text-primary); font-size: 0.82rem; }
	.staging-badge { border: 1px solid var(--editor-border-strong); border-radius: 999px; padding: 0.12rem 0.38rem; color: var(--editor-text-secondary); font-size: 0.6rem; }
	.staging-selection .staging-warning { color: var(--editor-danger-fg); }
	.staging-selection .staging-status { color: var(--editor-text-secondary); }
	.staging-transform-fields { margin: 0; border: 1px solid var(--editor-border-subtle); border-radius: 0.35rem; padding: 0.55rem; }
	.staging-transform-fields legend { padding: 0 0.3rem; color: var(--editor-text-secondary); font-size: 0.68rem; }
	.staging-field-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.4rem; }
	.plan-footer-note {
		display: flex;
		align-items: flex-start;
		gap: 0.45rem;
		margin: 0;
		padding-top: 0.7rem;
		border-top: 1px solid var(--editor-border-subtle);
		color: var(--editor-text-muted);
		font-size: 0.68rem;
		line-height: 1.4;
	}
	.plan-footer-note__icon { display: inline-flex; flex: 0 0 auto; margin-top: 0.05rem; color: var(--editor-accent); }
	.deselect { padding: 0.38rem 0.5rem; border: 1px solid var(--editor-border-normal); border-radius: 0.32rem; background: var(--editor-bg-panel-raised); color: var(--editor-text-primary); font: inherit; font-size: 0.72rem; cursor: pointer; }
	.selection dl div { display: flex; flex-direction: column; gap: 0.1rem; }
	.selection dd { margin: 0; font-size: 0.8rem; }
	.selection p { margin: 0; color: var(--editor-text-secondary); font-size: 0.75rem; line-height: 1.4; }
	.grouping { padding: 0.85rem; border: 1px solid var(--editor-border-subtle); border-radius: 0.45rem; background: var(--editor-bg-panel-raised); }
	.grouped-badge { padding: 0.18rem 0.42rem; border: 1px solid var(--editor-accent-border); border-radius: 999px; background: var(--editor-bg-selected); color: var(--editor-text-primary); font-size: 0.65rem; font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase; }
	.group-summary { display: flex; flex-direction: column; gap: 0.12rem; margin: 0; }
	.group-summary strong { font-size: 0.82rem; }
	.group-summary span, .group-hint { color: var(--editor-text-secondary); font-size: 0.72rem; line-height: 1.4; }
	.group-hint { margin: 0; }
	.rename-form { display: flex; flex-direction: column; gap: 0.55rem; }
	.rename { display: flex; flex-direction: column; gap: 0.3rem; color: var(--editor-text-secondary); font-size: 0.75rem; }
	.rename input { padding: 0.4rem; border: 1px solid var(--editor-border-normal); border-radius: 0.3rem; background: var(--editor-bg-panel-raised); color: var(--editor-text-primary); font: inherit; }
	.rename input:focus { outline: 1px solid var(--editor-accent); border-color: var(--editor-accent); }
	.group-actions { display: flex; gap: 0.4rem; }
	.group-button, .primary-action, .danger-action { padding: 0.46rem 0.58rem; border: 1px solid var(--editor-border-normal); border-radius: 0.32rem; background: var(--editor-bg-control); color: var(--editor-text-primary); font: inherit; font-size: 0.73rem; cursor: pointer; }
	.group-button { align-self: flex-start; }
	.primary-action { border-color: var(--editor-accent-border); }
	.danger-action { background: var(--editor-danger-soft); color: var(--editor-danger-fg); }
	.group-button:disabled, .primary-action:disabled { opacity: 0.4; cursor: default; }
	.placement-actions { padding: 0.75rem; border: 1px solid var(--editor-border-subtle); border-radius: 0.45rem; background: var(--editor-bg-panel-raised); }
	.placement-actions div { display: flex; gap: 0.4rem; }
	.placement-actions button { flex: 1; padding: 0.44rem; border: 1px solid var(--editor-border-normal); border-radius: 0.32rem; background: var(--editor-bg-control); color: var(--editor-text-primary); font: inherit; font-size: 0.72rem; cursor: pointer; }
	.placement-actions button.delete { border-color: var(--editor-danger-border); background: var(--editor-danger-soft); color: var(--editor-danger-fg); }
	.placement-actions p { margin: 0; color: var(--editor-text-muted); font-size: 0.67rem; line-height: 1.4; }
	.deselect { align-self: flex-start; }

	@media (max-width: 62rem) {
		.panel { min-height: 0; max-height: 34rem; border-top: 1px solid var(--editor-border-subtle); }
		.inspector { border-left: 1px solid var(--editor-border-subtle); }
	}
	@media (max-width: 44rem) {
		.panel { max-height: 30rem; border-left: 0; }
	}
</style>
