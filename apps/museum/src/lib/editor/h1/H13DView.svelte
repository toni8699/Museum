<script lang="ts">
	import { Canvas } from '@threlte/core';
	import MuseumScene from '$lib/museum/MuseumScene.svelte';
	import type { EditorPlacementRegistry } from '$lib/museum/placement-registry';
	import EditorMuseumEntities from '$lib/editor/EditorMuseumEntities.svelte';
	import EditorCameraHelpers from '$lib/editor/EditorCameraHelpers.svelte';
	import EditorCameraFramingHelpers from '$lib/editor/EditorCameraFramingHelpers.svelte';
	import EditorCameraPathHelpers from '$lib/editor/EditorCameraPathHelpers.svelte';
	import EditorCameraViewHelpers from '$lib/editor/EditorCameraViewHelpers.svelte';
	import EditorCameraRig from '$lib/editor/EditorCameraRig.svelte';
	import EditorGrid from '$lib/editor/EditorGrid.svelte';
	import EditorPlacementTools from '$lib/editor/EditorPlacementTools.svelte';
	import EditorSelection from '$lib/editor/EditorSelection.svelte';
	import EditorSelectionHelper from '$lib/editor/EditorSelectionHelper.svelte';
	import EditorTransformControls from '$lib/editor/EditorTransformControls.svelte';
	import EditorViewportToolbar from '$lib/editor/EditorViewportToolbar.svelte';
	import PlacementGhost from '$lib/editor/placement-ghost.svelte';
	import LayoutPreviewScene from '$lib/editor/layout/LayoutPreviewScene.svelte';
	import {
		selectLayoutInteriorAnchor,
		selectLayoutObject,
		selectLayoutOpening,
		selectLayoutRoom,
		selectLayoutWall,
		type LayoutInteractionState
	} from '$lib/editor/layout/layout-interaction';
	import {
		layoutPickBeatsSceneDistance,
		resolveLayout3dHits,
		type Layout3dHitCandidate
	} from '$lib/editor/layout/layout-3d-picking';
	import type { LayoutPreviewState } from '$lib/editor/layout/layout-preview-state.svelte';
	import type { MuseumEditorStore } from '$lib/editor/museum-editor.svelte';
	import { resolveEditorPlacementScale } from '$lib/editor/scale-vector';
	import type { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
	import { getContext } from 'svelte';
	import {
		EDITOR_INTERACTION_STORE_KEY,
		type EditorInteractionStore
	} from '$lib/editor/store/editor-interaction-store.svelte';
	import {
		ACTIVE_EDITOR_SELECTION_KEY,
		type EditorActiveSelectionStore
	} from './active-editor-selection.svelte';

	let {
		store,
		layoutPreview,
		layoutInteraction
	}: {
		store: MuseumEditorStore;
		layoutPreview: LayoutPreviewState;
		layoutInteraction: LayoutInteractionState;
	} = $props();
	const interactionStore = getContext<EditorInteractionStore | undefined>(
		EDITOR_INTERACTION_STORE_KEY
	);
	const activeSelection = getContext<EditorActiveSelectionStore | undefined>(
		ACTIVE_EDITOR_SELECTION_KEY
	);

	const placementRegistry: EditorPlacementRegistry = {
		registerPlacementRoot: (id, root) => store.registerPlacementRoot(id, root),
		unregisterPlacementRoot: (id, root) => store.unregisterPlacementRoot(id, root),
		notifyPlacementRootChanged: (id) => store.notifyPlacementRootChanged(id),
		get scaleVersion() {
			return store.placementScaleVectorVersion;
		},
		getPlacementScale: (id) => {
			const entity = store.document.entities.find((candidate) => candidate.id === id);
			return resolveEditorPlacementScale(
				entity?.scale,
				store.getPlacementScaleVector(id)
			);
		}
	};

	let transformControls = $state<TransformControls>();

	/**
	 * H1 S6 — resolve 3D layout candidates through the S5 pick index and commit
	 * the winner through the existing `selectLayout*` helpers. Returns `false`
	 * when no layout candidate resolved, or when an actionable scene/camera hit
	 * is nearer (scene wins the exact-tie band); `true` commits a layout
	 * selection and lets the coordinator skip the normal dispatch.
	 */
	function handleLayoutPick(
		candidates: readonly Layout3dHitCandidate[],
		competingSceneDistance: number | null
	): boolean {
		const resolved = resolveLayout3dHits(layoutPreview.layout3dPickIndexByRoom, candidates);
		if (!resolved) return false;
		if (!layoutPickBeatsSceneDistance(resolved.distance, competingSceneDistance)) {
			return false;
		}
		switch (resolved.selection.kind) {
			case 'room':
				selectLayoutRoom(layoutInteraction, resolved.selection.roomId);
				break;
			case 'wall':
				selectLayoutWall(
					layoutInteraction,
					resolved.selection.roomId,
					resolved.selection.segmentId
				);
				break;
			case 'opening':
				selectLayoutOpening(
					layoutInteraction,
					resolved.selection.roomId,
					resolved.selection.segmentId,
					resolved.selection.openingId
				);
				break;
			case 'interiorAnchor':
				selectLayoutInteriorAnchor(
					layoutInteraction,
					resolved.selection.roomId,
					resolved.selection.segmentId,
					resolved.selection.anchorId
				);
				break;
			case 'object':
				selectLayoutObject(layoutInteraction, resolved.selection.objectId);
				break;
			case 'none':
				break;
		}
		return true;
	}
</script>

<div
	class="viewport"
	class:placing={Boolean(
		store.pendingPlacementAssetId ||
		store.pendingPlacementPrimitiveKind ||
			store.pendingPlacementLightKind ||
		store.pendingNavigationCommand?.kind === 'place-camera'
	)}
	class:bending={Boolean(store.hoveredConnectionId || store.hoveredAnchorId)}
	class:dragging-camera-key={store.viewKeyframeProgressDrag !== null}
	style:cursor={interactionStore?.cursor ?? 'default'}
	aria-label="Unified 3D editor viewport"
>
	<EditorViewportToolbar {store} />
	<Canvas dpr={[1, 1.5]} shadows>
		<MuseumScene
			scene={store.scene}
			state={store.state}
			showNavigationNodes={false}
			ambientIntensity={store.ambientIntensity}
			directionalIntensity={store.directionalIntensity}
			fogEnabled={store.fogEnabled}
			fogNear={store.fogNear}
			fogFar={store.fogFar}
			forceParisAssets
			showArchitecture={false}
		>
			{#snippet camera(graph, _state)}
				<EditorCameraRig
					{store}
					{graph}
					layoutBounds={layoutPreview.bounds}
					layoutFrameVersion={layoutPreview.previewVersion}
				/>
			{/snippet}
		</MuseumScene>
		<EditorMuseumEntities scene={store.scene} rooms={store.rooms} {placementRegistry} />
		<LayoutPreviewScene
			model={layoutPreview.model}
			geometry={layoutPreview.geometry}
			wallMeshesByRoom={layoutPreview.wallMeshesByRoom}
			interaction={layoutInteraction}
			showCeilings={layoutPreview.showCeilings}
			showAnchors={!store.isVisitorCameraPreview}
		/>
		<EditorGrid visible={store.gridVisible && !store.isVisitorCameraPreview} />
		{#if store.viewportShowPaths}
			<EditorCameraPathHelpers {store} />
		{/if}
		{#if store.viewportShowFraming}
			<EditorCameraViewHelpers {store} />
			<EditorCameraFramingHelpers {store} />
		{/if}
		{#if store.viewportShowNodes || store.forceMountCameraNodeHandles}
			{#if (store.pendingNavigationCommand?.kind === 'connect-existing' || store.pendingNavigationCommand?.kind === 'connect-pending-node') && !store.isDocumentMutationBlocked}
				{#each store.document.navigationNodes as node (node.id)}
					<EditorCameraHelpers {store} nodeId={node.id} positionOnly />
				{/each}
				{#if store.pendingNavigationCommand?.kind === 'connect-pending-node'}
					<EditorCameraHelpers {store} nodeId={store.pendingNavigationCommand.node.id} />
				{/if}
			{:else if store.cameraSelection && !store.pendingPlacementAssetId && !store.pendingPlacementPrimitiveKind && !store.pendingPlacementLightKind && !store.isCameraFramingMutationBlocked}
				{#key store.cameraSelection.nodeId}
					<EditorCameraHelpers {store} nodeId={store.cameraSelection.nodeId} />
				{/key}
			{/if}
		{/if}
		<EditorSelection
			{store}
			{transformControls}
			onDeselect={activeSelection ? () => activeSelection.deselectActive() : undefined}
			onLayoutPick={store.isVisitorCameraPreview ? undefined : handleLayoutPick}
		/>
		<EditorPlacementTools {store} />
		{#if !store.isVisitorCameraPreview}
			{#key store.selectionKey}
				<EditorSelectionHelper {store} />
			{/key}
		{/if}
		<EditorTransformControls {store} bind:controls={transformControls} />
		{#if !store.isVisitorCameraPreview}
			<PlacementGhost {store} />
		{/if}
	</Canvas>
	{#if store.isCameraPreviewPlaying}
		<div class="preview-shield" role="status">
			{#if store.isVisitorCameraPreview}
				Visitor preview · Stop or press Escape to return
			{:else}
				Director playback · Stop or press Escape to return
			{/if}
		</div>
	{/if}
	{#if store.pendingPlacementAssetId}
		<div class="placement-hint" role="status">
			Click a Paris floor to place · Escape cancels
		</div>
	{/if}
	{#if store.pendingPlacementPrimitiveKind}
		<div class="placement-hint" role="status">
			Click a tagged room floor to place · Escape cancels
		</div>
	{/if}
	{#if store.pendingPlacementLightKind}
		<div class="placement-hint" role="status">
			Click a tagged room floor to place light · Escape cancels
		</div>
	{/if}
	{#if store.pendingNavigationCommand?.kind === 'place-camera'}
		<div class="placement-hint" role="status">
			Click any tagged room floor to place · Escape cancels
		</div>
	{:else if store.pendingNavigationCommand?.kind === 'connect-pending-node'}
		<div class="placement-hint" role="status">
			Adjust pose or choose an existing camera node · Escape cancels
		</div>
	{:else if store.pendingNavigationCommand?.kind === 'connect-existing'}
		<div class="placement-hint" role="status">
			Choose a destination camera node · Escape cancels
		</div>
	{/if}
</div>

<style>
	.viewport {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 0;
		background: #050508;
	}

	.viewport.placing :global(canvas) {
		cursor: crosshair;
	}

	.viewport.bending :global(canvas) {
		cursor: grab;
	}

	.viewport.dragging-camera-key :global(canvas) {
		cursor: grabbing;
	}

	.placement-hint {
		position: absolute;
		left: 50%;
		bottom: 1rem;
		transform: translateX(-50%);
		padding: 0.48rem 0.7rem;
		border: 1px solid #8d753c;
		border-radius: 999px;
		background: rgb(18 18 24 / 92%);
		color: #fff2c7;
		font: 600 0.73rem/1.2 ui-sans-serif, system-ui, sans-serif;
		pointer-events: none;
	}

	.preview-shield {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		box-sizing: border-box;
		padding: 1rem;
		background: linear-gradient(to top, rgb(5 5 8 / 46%), transparent 22%);
		color: #fff2c7;
		font: 600 0.73rem/1.2 ui-sans-serif, system-ui, sans-serif;
		pointer-events: auto;
	}

	.viewport :global(canvas) {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
