<script lang="ts">
	import { resolveAssetFallback } from '$lib/content/assets';
	import { isSceneLightEntity, isSceneModelEntity, isScenePrimitiveEntity } from '$lib/content/scene';
	import type { MuseumAsset } from '$lib/types/assets';
	import { tick } from 'svelte';
	import EditorCameraInspector from './EditorCameraInspector.svelte';
	import EditorLightInspector from './EditorLightInspector.svelte';
	import EditorMaterialInspector from './EditorMaterialInspector.svelte';
	import EditorPlacementInspector from './EditorPlacementInspector.svelte';
	import EditorPrimitiveInspector from './EditorPrimitiveInspector.svelte';
	import EditorTransformInspector from './EditorTransformInspector.svelte';
	import {
		deleteLayoutObject,
		deleteLayoutOpening,
		layoutPreviewSourceLabel,
		layoutPreviewStatusLabel,
		updateLayoutObjectFields,
		updateLayoutOpeningFields,
		updateLayoutRoomFields,
		previewLayoutRoomUnit,
		captureLayoutPreviewSnapshot,
		type LayoutPreviewState,
		type LayoutRoomFieldPatch
	} from './layout/layout-preview-state.svelte';
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
		EDITOR_BRIGHT_LIGHTING,
		EDITOR_VISITOR_LIGHTING,
		type MuseumEditorStore
	} from './museum-editor.svelte';

	let {
		store,
		layoutPreview,
		layoutInteraction,
		selectedAsset,
		clusterNameInput = $bindable()
	}: {
		store: MuseumEditorStore;
		layoutPreview: LayoutPreviewState;
		layoutInteraction: LayoutInteractionState;
		selectedAsset?: MuseumAsset;
		clusterNameInput?: HTMLInputElement;
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
	const showAssetInspector = $derived(
		store.currentWorkspace === 'scene' &&
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
		store.ensureRoomTreeExpanded('paris');
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
		const result = updateLayoutOpeningFields(layoutPreview, selection.roomId, selection.openingId, { [field]: value });
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
		const result = updateLayoutOpeningFields(layoutPreview, selection.roomId, selection.openingId, { profile });
		if (!result.success) store.setStatusMessage(`Opening rejected: ${result.message}`);
	}

	function removeSelectedOpening() {
		const selection = layoutInteraction.selection;
		if (selection.kind !== 'opening') return;
		const result = deleteLayoutOpening(layoutPreview, selection.roomId, selection.openingId);
		if (!result.success) {
			store.setStatusMessage(`Opening delete failed: ${result.message}`);
			return;
		}
		layoutInteraction.selection = { kind: 'wall', roomId: selection.roomId, segmentId: selection.segmentId };
		store.setStatusMessage('Deleted opening');
	}

	function updateRoomName(event: Event) {
		if (!selectedLayoutRoom) return;
		const input = event.currentTarget as HTMLInputElement;
		const roomId = selectedLayoutRoom.id;
		const result = updateLayoutRoomFields(layoutPreview, roomId, { name: input.value });
		const committed = layoutPreview.project.layout.floors
			.flatMap((floor) => floor.rooms)
			.find((room) => room.id === roomId);
		input.value = committed?.name ?? selectedLayoutRoom.name;
		store.setStatusMessage(result.success ? 'Updated room name' : `Room rejected: ${result.message}`);
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
		if (!store.beginLayoutTransaction()) {
			store.setStatusMessage('Finish the current layout interaction first');
			return;
		}
		const result = previewLayoutRoomUnit(layoutPreview, selectedLayoutRoom.id, {
			translation: [0, 0],
			yaw: (degrees * Math.PI) / 180
		});
		if (!result.success) {
			store.cancelLayoutTransaction();
			store.setStatusMessage(`Room rotation rejected: ${result.message}`);
			return;
		}
		store.commitLayoutTransaction(captureLayoutPreviewSnapshot(layoutPreview));
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
		const result = updateLayoutRoomFields(layoutPreview, selectedLayoutRoom.id, { [field]: value });
		if (!result.success) input.value = String(previous);
		store.setStatusMessage(result.success ? `Updated ${field}` : `Room rejected: ${result.message}`);
	}

	function updateObjectVector(
		field: 'position' | 'rotation' | 'dimensions',
		index: 0 | 1 | 2,
		event: Event
	) {
		if (!selectedLayoutObject || selectedLayoutObject.kind === 'profile') return;
		const input = event.currentTarget as HTMLInputElement;
		const value = Number(input.value);
		if (!Number.isFinite(value)) {
			input.value = String(selectedLayoutObject[field][index]);
			return;
		}
		const vector = [...selectedLayoutObject[field]] as [number, number, number];
		vector[index] = value;
		const result = updateLayoutObjectFields(layoutPreview, selectedLayoutObject.id, { [field]: vector });
		if (!result.success) input.value = String(selectedLayoutObject[field][index]);
		store.setStatusMessage(result.success ? `Updated object ${field}` : `Object rejected: ${result.message}`);
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
		const result = updateLayoutObjectFields(layoutPreview, selectedLayoutObject.id, { dimensions });
		if (!result.success) input.value = String(metric === 'radius' ? selectedLayoutObject.dimensions[0] / 2 : metric === 'width' ? selectedLayoutObject.dimensions[0] : metric === 'depth' ? selectedLayoutObject.dimensions[2] : selectedLayoutObject.dimensions[1]);
		store.setStatusMessage(result.success ? `Updated object ${metric}` : `Object rejected: ${result.message}`);
	}

	function updateObjectRoom(event: Event) {
		if (!selectedLayoutObject || selectedLayoutObject.kind === 'profile') return;
		const roomId = (event.currentTarget as HTMLSelectElement).value || undefined;
		const result = updateLayoutObjectFields(layoutPreview, selectedLayoutObject.id, { roomId });
		store.setStatusMessage(result.success ? 'Updated object room' : `Object rejected: ${result.message}`);
	}

	function removeLayoutObject(objectId: string) {
		const result = deleteLayoutObject(layoutPreview, objectId);
		if (result.success && selectedLayoutObjectId === objectId) layoutInteraction.selection = { kind: 'none' };
		store.setStatusMessage(result.success ? 'Deleted layout object' : `Object delete failed: ${result.message}`);
	}

	function removeSelectedObject() {
		if (selectedLayoutObject) removeLayoutObject(selectedLayoutObject.id);
	}

</script>

<aside class="panel inspector" aria-label="Inspector" style="grid-area: right;">
	<header>
		<h2>Inspector</h2>
		{#if store.currentWorkspace === 'layout'}
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

	{#if store.currentWorkspace === 'layout'}
		<section class="layout-inspector" aria-label="Layout preview details">
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
					{#if selectedLayoutObject.kind === 'profile' || selectedLayoutObject.kind === 'plane'}
						<span>Position: {selectedLayoutObject.position.join(', ')} · rotation: {selectedLayoutObject.rotation.join(', ')}</span>
						<span>Dimensions: {selectedLayoutObject.dimensions.join(' × ')}</span>
					{:else if selectedLayoutObject.kind === 'box'}
						<label>Width (m)<input type="number" min="0.001" step="0.05" value={selectedLayoutObject.dimensions[0]} onchange={(event) => updateObjectMetric('width', event)} /></label>
						<label>Depth (m)<input type="number" min="0.001" step="0.05" value={selectedLayoutObject.dimensions[2]} onchange={(event) => updateObjectMetric('depth', event)} /></label>
						<label>Height (m)<input type="number" min="0.001" step="0.05" value={selectedLayoutObject.dimensions[1]} onchange={(event) => updateObjectMetric('height', event)} /></label>
					{:else}
						<label>Radius (m)<input type="number" min="0.001" step="0.05" value={selectedLayoutObject.dimensions[0] / 2} onchange={(event) => updateObjectMetric('radius', event)} /></label>
						<label>Height (m)<input type="number" min="0.001" step="0.05" value={selectedLayoutObject.dimensions[1]} onchange={(event) => updateObjectMetric('height', event)} /></label>
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
						onclick={() => store.beginAssetPlacement(selectedAsset.id)}
					>
						{store.pendingPlacementAssetId === selectedAsset.id ? 'Placing…' : 'Place in Paris'}
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
		<EditorCameraInspector {store} />
	{:else if hasPlacementSelection}
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
	{:else}
		<section class="empty-selection" aria-label="Editor help">
			<h2>No selection</h2>
			<p>Choose a room, object, cluster, camera node, path, or asset to inspect its settings.</p>
			{#if store.statusMessage}<p class="status" role="status">{store.statusMessage}</p>{/if}
		</section>
	{/if}

	<section class="camera-controls" aria-label="Editor camera controls">
		<h2>Camera</h2>
		<p>Middle-drag pans. Camera-node rows frame their authored eye and target.</p>
		<button type="button" class:active={store.cameraPanEnabled} aria-pressed={store.cameraPanEnabled} disabled={store.isVisitorCameraPreview} onclick={() => store.toggleCameraPan()}>Pan {store.cameraPanEnabled ? 'on' : 'off'}</button>
		<button type="button" class:active={store.gridVisible} aria-pressed={store.gridVisible} disabled={store.isVisitorCameraPreview} onclick={() => store.toggleGrid()}>Grid {store.gridVisible ? 'on' : 'off'}</button>
	</section>

	<section class="lighting" aria-label="Viewport lighting">
		<h2>Lighting</h2>
		<p>Session-only; excluded from history and visitor JSON.</p>
		<div class="presets">
			<button type="button" disabled={store.isVisitorCameraPreview} onclick={() => store.applyLightingPreset(EDITOR_BRIGHT_LIGHTING)}>Bright</button>
			<button type="button" disabled={store.isVisitorCameraPreview} onclick={() => store.applyLightingPreset(EDITOR_VISITOR_LIGHTING)}>Visitor</button>
		</div>
		<label><span>Ambient {store.ambientIntensity.toFixed(2)}</span><input type="range" min="0" max="2" step="0.05" disabled={store.isVisitorCameraPreview} value={store.ambientIntensity} oninput={(event) => store.sessionView.setAmbientIntensity(+event.currentTarget.value)} /></label>
		<label><span>Directional {store.directionalIntensity.toFixed(2)}</span><input type="range" min="0" max="3" step="0.05" disabled={store.isVisitorCameraPreview} value={store.directionalIntensity} oninput={(event) => store.sessionView.setDirectionalIntensity(+event.currentTarget.value)} /></label>
		<label class="checkbox"><input type="checkbox" disabled={store.isVisitorCameraPreview} checked={store.fogEnabled} onchange={(event) => store.sessionView.setFogEnabled(event.currentTarget.checked)} /><span>Fog</span></label>
		{#if store.fogEnabled}
			<label><span>Fog near {store.fogNear.toFixed(0)}</span><input type="range" min="1" max="80" step="1" disabled={store.isVisitorCameraPreview} value={store.fogNear} oninput={(event) => store.sessionView.setFogNear(+event.currentTarget.value)} /></label>
			<label><span>Fog far {store.fogFar.toFixed(0)}</span><input type="range" min="5" max="120" step="1" disabled={store.isVisitorCameraPreview} value={store.fogFar} oninput={(event) => store.sessionView.setFogFar(+event.currentTarget.value)} /></label>
		{/if}
	</section>

</aside>

<style>
	.panel { display: flex; flex-direction: column; gap: 1rem; padding: 1rem 1.1rem; overflow: auto; background: #121218; }
	.inspector { border-left: 1px solid #2a2a33; }
	header h2, section h2 { margin: 0; font-size: 0.95rem; font-weight: 650; letter-spacing: 0.02em; }
	header p { margin: 0.35rem 0 0; color: #a8a29a; font-size: 0.75rem; line-height: 1.4; }
	section { display: flex; flex-direction: column; gap: 0.55rem; }
	.id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.75rem; overflow-wrap: anywhere; }
	.layout-inspector { display: flex; flex-direction: column; gap: 0.8rem; }
	.layout-inspector dl { display: flex; flex-direction: column; gap: 0.45rem; margin: 0; }
	.layout-inspector dl div { display: flex; justify-content: space-between; gap: 0.7rem; }
	.layout-inspector dt { color: #8f8a82; font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.04em; }
	.layout-inspector dd { margin: 0; color: #f4efe4; font-size: 0.72rem; text-align: right; }
	.layout-inspector-note { margin: 0; color: #a8a29a; font-size: 0.7rem; line-height: 1.45; }
	.layout-accordion { display: flex; flex-direction: column; gap: 0.45rem; padding: 0.55rem; border: 1px solid #34313a; border-radius: 0.4rem; background: #17171f; }
	.accordion-trigger { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 0.2rem 0; border: 0; background: transparent; color: #f4efe4; font: inherit; font-size: 0.75rem; cursor: pointer; }
	.accordion-trigger span { color: #d6b35f; font-size: 1rem; }
	.place-tools { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.35rem; }
	.place-tools button { padding: 0.4rem 0.3rem; border: 1px solid #4a4438; border-radius: 0.3rem; background: #242018; color: #fff2c7; font: inherit; font-size: 0.68rem; cursor: pointer; }
	.place-tools button:disabled { opacity: 0.4; cursor: default; }
	.layout-object-list { display: flex; flex-direction: column; gap: 0.3rem; }
	.layout-empty { color: #918c84; font-size: 0.68rem; }
	.layout-object-row { display: flex; align-items: stretch; gap: 0.3rem; }
	.layout-object-row.selected { outline: 1px solid #d6b35f; border-radius: 0.3rem; }
	.object-row-select { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 0.12rem; padding: 0.38rem; border: 1px solid #3a3a46; border-radius: 0.3rem; background: #1a1a22; color: #f4efe4; text-align: left; cursor: pointer; }
	.object-row-select span { overflow-wrap: anywhere; color: #a8a29a; font: 0.62rem ui-monospace, monospace; }
	.object-row-delete { padding: 0.3rem; border: 1px solid #684147; border-radius: 0.3rem; background: #21191b; color: #efc7c7; font: inherit; font-size: 0.64rem; cursor: pointer; }
	.object-row-delete:disabled { opacity: 0.4; cursor: default; }
	.layout-selection-content { display: flex; flex-direction: column; gap: 0.5rem; }
	.layout-selected-room { display: flex; flex-direction: column; gap: 0.2rem; padding: 0.6rem; border: 1px solid #8d753c; border-radius: 0.35rem; background: #211d15; color: #f4efe4; font-size: 0.7rem; }
	.layout-selected-room span { color: #c4bdaF; font-size: 0.66rem; overflow-wrap: anywhere; }
	.layout-selected-room label { display: flex; flex-direction: column; gap: 0.25rem; color: #c4bdaF; font-size: 0.66rem; }
	.layout-selected-room input, .layout-selected-room select { box-sizing: border-box; width: 100%; padding: 0.34rem; border: 1px solid #4a4438; border-radius: 0.28rem; background: #17171f; color: #f4efe4; font: inherit; }
	.layout-selected-room input:focus, .layout-selected-room select:focus { outline: 1px solid #d6b35f; border-color: #d6b35f; }
	.layout-selected-room input:disabled, .layout-selected-room select:disabled, .layout-danger:disabled { opacity: 0.48; cursor: default; }
	.layout-opening-actions { display: flex; gap: 0.35rem; }
	.layout-opening-actions button, .layout-danger { padding: 0.4rem 0.5rem; border: 1px solid #8d753c; border-radius: 0.28rem; background: #2a2618; color: #fff2c7; font: inherit; font-size: 0.68rem; cursor: pointer; }
	.layout-danger { border-color: #684147; background: #21191b; color: #efc7c7; }
	.layout-opening-warning { margin: 0; color: #efc7c7; font-size: 0.66rem; }
	.layout-issues { max-height: 12rem; overflow: auto; padding: 0.55rem; border: 1px solid #684147; border-radius: 0.35rem; background: #21191b; color: #efc7c7; font-size: 0.68rem; line-height: 1.4; }
	.layout-issues ul { display: flex; flex-direction: column; gap: 0.35rem; margin: 0.4rem 0 0; padding-left: 1rem; }
	.layout-issues code { color: #f4dc9b; font-size: 0.63rem; }
	.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
	.asset-details { padding: 0.75rem; border: 1px solid #34313a; border-radius: 0.4rem; background: #17171f; }
	.asset-details > div > .id { margin: 0.2rem 0 0; color: #918c84; font-size: 0.66rem; }
	.asset-details dl, .selection dl { display: flex; flex-direction: column; gap: 0.4rem; margin: 0; }
	.asset-details dl div { display: grid; grid-template-columns: 4.5rem minmax(0, 1fr); gap: 0.4rem; }
	.asset-details dt, .selection dt { color: #8f8a82; font-size: 0.64rem; text-transform: uppercase; letter-spacing: 0.04em; }
	.asset-details dd { min-width: 0; margin: 0; font-size: 0.69rem; overflow-wrap: anywhere; }
	.place { padding: 0.48rem 0.6rem; border: 1px solid #8d753c; border-radius: 0.32rem; background: #242018; color: #fff2c7; font: inherit; font-size: 0.73rem; cursor: pointer; }
	.place.active { background: #3a3019; box-shadow: inset 0 0 0 1px #d6b35f; }
	.unsupported, .empty-selection p { margin: 0; color: #a8a29a; font-size: 0.72rem; line-height: 1.4; }
	.presets { display: flex; gap: 0.35rem; }
	.presets button, .deselect, .camera-controls button { padding: 0.38rem 0.5rem; border: 1px solid #3a3a46; border-radius: 0.32rem; background: #1a1a22; color: #f4efe4; font: inherit; font-size: 0.72rem; cursor: pointer; }
	.camera-controls button:disabled, .presets button:disabled { opacity: 0.4; cursor: default; }
	.selection dl div { display: flex; flex-direction: column; gap: 0.1rem; }
	.selection dd { margin: 0; font-size: 0.8rem; }
	.selection p { margin: 0; color: #a8a29a; font-size: 0.75rem; line-height: 1.4; }
	.grouping { padding: 0.85rem; border: 1px solid #34313a; border-radius: 0.45rem; background: #17171f; }
	.grouped-badge { padding: 0.18rem 0.42rem; border: 1px solid #8d753c; border-radius: 999px; background: #2a2618; color: #f4dc9b; font-size: 0.65rem; font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase; }
	.group-summary { display: flex; flex-direction: column; gap: 0.12rem; margin: 0; }
	.group-summary strong { font-size: 0.82rem; }
	.group-summary span, .group-hint { color: #a8a29a; font-size: 0.72rem; line-height: 1.4; }
	.group-hint { margin: 0; }
	.rename-form { display: flex; flex-direction: column; gap: 0.55rem; }
	.rename { display: flex; flex-direction: column; gap: 0.3rem; color: #d6d0c4; font-size: 0.75rem; }
	.rename input { padding: 0.4rem; border: 1px solid #3a3a46; border-radius: 0.3rem; background: #1a1a22; color: #f4efe4; font: inherit; }
	.rename input:focus { outline: 1px solid #d6b35f; border-color: #d6b35f; }
	.group-actions { display: flex; gap: 0.4rem; }
	.group-button, .primary-action, .danger-action { padding: 0.46rem 0.58rem; border: 1px solid #4a4438; border-radius: 0.32rem; background: #242018; color: #fff2c7; font: inherit; font-size: 0.73rem; cursor: pointer; }
	.group-button { align-self: flex-start; }
	.primary-action { border-color: #8d753c; }
	.danger-action { background: #21191b; color: #efc7c7; }
	.group-button:disabled, .primary-action:disabled { opacity: 0.4; cursor: default; }
	.placement-actions { padding: 0.75rem; border: 1px solid #34313a; border-radius: 0.45rem; background: #17171f; }
	.placement-actions div { display: flex; gap: 0.4rem; }
	.placement-actions button { flex: 1; padding: 0.44rem; border: 1px solid #4a4438; border-radius: 0.32rem; background: #242018; color: #fff2c7; font: inherit; font-size: 0.72rem; cursor: pointer; }
	.placement-actions button.delete { border-color: #684147; background: #21191b; color: #efc7c7; }
	.placement-actions p { margin: 0; color: #918c84; font-size: 0.67rem; line-height: 1.4; }
	.deselect { align-self: flex-start; }
	.camera-controls, .lighting { margin-top: 0.4rem; gap: 0.7rem; border-top: 1px solid #2a2a33; padding-top: 0.85rem; }
	.camera-controls p, .lighting p { margin: 0; color: #a8a29a; font-size: 0.75rem; line-height: 1.4; }
	.camera-controls button { align-self: flex-start; }
	.camera-controls button.active { border-color: #d6b35f; background: #2a2618; color: #fff2c7; }
	.presets button { flex: 1; }
	.lighting label { display: flex; flex-direction: column; gap: 0.3rem; color: #d6d0c4; font-size: 0.75rem; }
	.lighting label.checkbox { flex-direction: row; align-items: center; gap: 0.45rem; }
	.lighting input[type='range'] { width: 100%; }

	@media (max-width: 62rem) {
		.panel { min-height: 0; max-height: 34rem; border-top: 1px solid #2a2a33; }
		.inspector { border-left: 1px solid #2a2a33; }
	}
	@media (max-width: 44rem) {
		.panel { max-height: 30rem; border-left: 0; }
	}
</style>
