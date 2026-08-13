<script lang="ts">
	import { Canvas } from '@threlte/core';
	import MuseumScene from '$lib/museum/MuseumScene.svelte';
	import type { EditorPlacementRegistry } from '$lib/museum/placement-registry';
	import EditorCameraHelpers from './EditorCameraHelpers.svelte';
	import EditorCameraFramingHelpers from './EditorCameraFramingHelpers.svelte';
	import EditorGrid from './EditorGrid.svelte';
	import EditorCameraPathHelpers from './EditorCameraPathHelpers.svelte';
	import EditorCameraViewHelpers from './EditorCameraViewHelpers.svelte';
	import EditorCameraRig from './EditorCameraRig.svelte';
	import EditorPlacementTools from './EditorPlacementTools.svelte';
	import EditorSelection from './EditorSelection.svelte';
	import EditorSelectionHelper from './EditorSelectionHelper.svelte';
	import EditorTransformControls from './EditorTransformControls.svelte';
	import EditorViewportToolbar from './EditorViewportToolbar.svelte';
	import PlacementGhost from './placement-ghost.svelte';
	import LayoutPreviewScene from './layout/LayoutPreviewScene.svelte';
	import LayoutPlanViewport from './layout/LayoutPlanViewport.svelte';
	import LayoutDraftToolbar from './layout/LayoutDraftToolbar.svelte';
	import type { LayoutInteractionState } from './layout/layout-interaction';
	import type { LayoutPreviewState } from './layout/layout-preview-state.svelte';
	import {
		commitLayoutDraftRoom,
		commitLayoutOpening,
		deleteLayoutOpening
	} from './layout/layout-preview-state.svelte';
	import type { LayoutOpeningKind } from './layout/layout-opening-editing';
	import type { MuseumEditorStore } from './museum-editor.svelte';
	import { resolveEditorPlacementScale } from './scale-vector';
	import type { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
	import { getContext } from 'svelte';
	import {
		EDITOR_INTERACTION_STORE_KEY,
		type EditorInteractionStore
	} from './store/editor-interaction-store.svelte';

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

	const placementRegistry: EditorPlacementRegistry = {
		registerPlacementRoot: (id, root) => store.registerPlacementRoot(id, root),
		unregisterPlacementRoot: (id, root) => store.unregisterPlacementRoot(id, root),
		notifyPlacementRootChanged: (id) => store.notifyPlacementRootChanged(id),
		// Getters keep the registry object identity stable (avoids remounting
		// EditorPlacementRoot register effects on every independent scale write)
		// while still exposing reactive session scale memory to MuseumEntities.
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

	function commitDraftRoom(points: [number, number][]): boolean {
		const result = commitLayoutDraftRoom(layoutPreview, points);
		if (result.success) {
			store.setStatusMessage(`Created ${result.roomId}`);
		} else {
			store.setStatusMessage(`Room draft rejected: ${result.message}`);
		}
		return result.success;
	}

	function createOpening(roomId: string, segmentId: string, kind: LayoutOpeningKind, clickOffset: number) {
		const result = commitLayoutOpening(layoutPreview, roomId, segmentId, kind, clickOffset, layoutInteraction.planView.snapEnabled);
		if (result.success) {
			layoutInteraction.selection = { kind: 'opening', roomId, segmentId, openingId: result.openingId };
		}
		store.setStatusMessage(result.success ? `Created ${kind} opening` : `Opening rejected: ${result.message}`);
	}

	function deleteOpening(roomId: string, openingId: string) {
		const selection = layoutInteraction.selection;
		const result = deleteLayoutOpening(layoutPreview, roomId, openingId);
		if (result.success && selection.kind === 'opening' && selection.openingId === openingId) {
			layoutInteraction.selection = { kind: 'wall', roomId: selection.roomId, segmentId: selection.segmentId };
		}
		store.setStatusMessage(result.success ? 'Deleted opening' : `Opening delete failed: ${result.message}`);
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
	aria-label="Museum editor viewport"
>
	{#if store.currentWorkspace === 'layout'}
		<LayoutDraftToolbar interaction={layoutInteraction} preview={layoutPreview} />
	{/if}
	{#if store.currentWorkspace === 'layout' && layoutInteraction.viewMode === 'plan'}
		<LayoutPlanViewport
			model={layoutPreview.model}
			preview={layoutPreview}
			interaction={layoutInteraction}
			onCommit={commitDraftRoom}
			onOpeningCreate={createOpening}
			onOpeningDelete={deleteOpening}
		/>
	{:else}
		{#if store.currentWorkspace !== 'layout'}
			<EditorViewportToolbar {store} />
		{/if}
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
			{placementRegistry}
			forceParisAssets
			showArchitecture={store.currentWorkspace !== 'layout'}
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
		{#if store.currentWorkspace === 'layout'}
			<LayoutPreviewScene
				model={layoutPreview.model}
				interaction={layoutInteraction}
				showCeilings={layoutPreview.showCeilings}
				selectedSegmentId={layoutInteraction.selection.kind === 'wall' || layoutInteraction.selection.kind === 'opening' || layoutInteraction.selection.kind === 'interiorAnchor' ? layoutInteraction.selection.segmentId : null}
				selectedOpeningId={layoutInteraction.selection.kind === 'opening' ? layoutInteraction.selection.openingId : null}
			/>
		{/if}
		<EditorGrid visible={store.gridVisible && !store.isVisitorCameraPreview} />
		{#if store.currentWorkspace !== 'layout' && store.viewportShowPaths}
			<EditorCameraPathHelpers {store} />
		{/if}
		{#if store.currentWorkspace !== 'layout' && store.viewportShowFraming}
			<EditorCameraViewHelpers {store} />
			<EditorCameraFramingHelpers {store} />
		{/if}
		{#if store.currentWorkspace !== 'layout' && (store.viewportShowNodes || store.forceMountCameraNodeHandles)}
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
		{#if store.currentWorkspace !== 'layout'}
			<EditorSelection {store} {transformControls} />
			<EditorPlacementTools {store} />
		<!-- Selection-bound Three helpers must be disposed and recreated for a new root. -->
			{#if !store.isVisitorCameraPreview}
				{#key store.selectionKey}
					<EditorSelectionHelper {store} />
				{/key}
			{/if}
			<EditorTransformControls {store} bind:controls={transformControls} />
		{/if}
		<!-- Phase 1b — placement ghost preview. Renders only while a placement
		     is armed; pure visual cue, click pipeline stays in EditorSelection. -->
		{#if store.currentWorkspace !== 'layout' && !store.isVisitorCameraPreview}
			<PlacementGhost {store} />
		{/if}
		</Canvas>
	{/if}
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
