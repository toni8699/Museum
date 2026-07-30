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
	import type { MuseumEditorStore } from './museum-editor.svelte';
	import type { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

	let { store }: { store: MuseumEditorStore } = $props();

	const placementRegistry: EditorPlacementRegistry = {
		registerPlacementRoot: (id, root) => store.registerPlacementRoot(id, root),
		unregisterPlacementRoot: (id, root) => store.unregisterPlacementRoot(id, root),
		notifyPlacementRootChanged: (id) => store.notifyPlacementRootChanged(id)
	};

	let transformControls = $state<TransformControls>();
</script>

<div
	class="viewport"
	class:placing={Boolean(
		store.pendingPlacementAssetId ||
		store.pendingNavigationCommand?.kind === 'place-camera'
	)}
	class:bending={Boolean(store.hoveredConnectionId || store.hoveredAnchorId)}
	class:dragging-camera-key={store.viewKeyframeProgressDrag !== null}
	aria-label="Museum editor viewport"
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
			{placementRegistry}
			forceParisAssets
		>
			{#snippet camera(graph, _state)}
				<EditorCameraRig {store} {graph} />
			{/snippet}
		</MuseumScene>
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
			{:else if store.cameraSelection && !store.pendingPlacementAssetId && !store.isCameraFramingMutationBlocked}
				{#key store.cameraSelection.nodeId}
					<EditorCameraHelpers {store} nodeId={store.cameraSelection.nodeId} />
				{/key}
			{/if}
		{/if}
		<EditorSelection {store} {transformControls} />
		<EditorPlacementTools {store} />
		<!-- Selection-bound Three helpers must be disposed and recreated for a new root. -->
		{#if !store.isVisitorCameraPreview}
			{#key store.selectionKey}
				<EditorSelectionHelper {store} />
			{/key}
		{/if}
		<EditorTransformControls {store} bind:controls={transformControls} />
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
