<script lang="ts">
	import { Canvas } from '@threlte/core';
	import MuseumScene from '$lib/museum/MuseumScene.svelte';
	import type { EditorPlacementRegistry } from '$lib/museum/placement-registry';
	import EditorSceneEntities from './EditorSceneEntities.svelte';
	import EditorCameraHelpers from './camera/EditorCameraHelpers.svelte';
	import EditorCameraFramingHelpers from './camera/EditorCameraFramingHelpers.svelte';
	import EditorGrid from './EditorGrid.svelte';
	import EditorCameraPathHelpers from './camera/EditorCameraPathHelpers.svelte';
	import EditorCameraViewHelpers from './camera/EditorCameraViewHelpers.svelte';
	import EditorCameraRig from './camera/EditorCameraRig.svelte';
	import EditorPlacementTools from './EditorPlacementTools.svelte';
	import EditorSelection from './EditorSelection.svelte';
	import EditorSelectionHelper from './EditorSelectionHelper.svelte';
	import EditorTransformControls from './EditorTransformControls.svelte';
	import EditorViewportToolbar from './EditorViewportToolbar.svelte';
	import PlacementGhost from './placement-ghost.svelte';
	import LayoutPreviewScene from './layout/LayoutPreviewScene.svelte';
	import LayoutPlanViewport from './layout/LayoutPlanViewport.svelte';
	import LayoutDraftToolbar from './layout/LayoutDraftToolbar.svelte';
	import LayoutRenderGate from './layout/LayoutRenderGate.svelte';
	import type { LayoutInteractionState } from './layout/layout-interaction';
	import type { LayoutPreviewState } from './layout/layout-preview-state.svelte';
	import {
		captureLayoutPreviewSnapshot,
		commitLayoutDraftRoom,
		commitLayoutOpening,
		deleteLayoutOpening,
		deleteLayoutRoom
	} from './layout/layout-preview-state.svelte';
	import { layoutMutationRunnerFor, runLayoutMutation } from './layout/layout-mutation-runner';
	import type { LayoutOpeningKind } from './layout/layout-opening-editing';
	import type { EditorStore } from './editor-store.svelte';
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
		store: EditorStore;
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
		const outcome = runLayoutMutationGuarded(
			() => commitLayoutDraftRoom(layoutPreview, points),
			(result) => result.success
		);
		if (outcome.kind === 'skipped') {
			store.setStatusMessage('Finish the current layout interaction first');
			return false;
		}
		const result = outcome.result;
		if (result.success) {
			store.setStatusMessage(`Created ${result.roomId}`);
		} else {
			store.setStatusMessage(`Room draft rejected: ${result.message}`);
		}
		return result.success;
	}

	function createOpening(roomId: string, segmentId: string, kind: LayoutOpeningKind, clickOffset: number) {
		const outcome = runLayoutMutationGuarded(
			() => commitLayoutOpening(layoutPreview, roomId, segmentId, kind, clickOffset, layoutInteraction.planView.snapEnabled),
			(result) => result.success
		);
		if (outcome.kind === 'skipped') {
			store.setStatusMessage('Finish the current layout interaction first');
			return;
		}
		if (outcome.result.success) {
			layoutInteraction.selection = { kind: 'opening', roomId, segmentId, openingId: outcome.result.openingId };
		}
		store.setStatusMessage(outcome.result.success ? `Created ${kind} opening` : `Opening rejected: ${outcome.result.message}`);
	}

	function beginLayoutTransaction(): boolean {
		return store.beginLayoutTransaction();
	}

	function commitLayoutTransaction(): boolean {
		return store.commitLayoutTransaction(captureLayoutPreviewSnapshot(layoutPreview));
	}

	function cancelLayoutTransaction(): boolean {
		return store.cancelLayoutTransaction();
	}

	// one layout mutation = one undo entry: begin → mutate → commit/cancel.
	function runLayoutMutationGuarded<T>(mutate: () => T, didSucceed: (result: T) => boolean) {
		return runLayoutMutation(layoutMutationRunnerFor(store, layoutPreview), mutate, didSucceed);
	}

	function deleteOpening(roomId: string, openingId: string) {
		const selection = layoutInteraction.selection;
		const outcome = runLayoutMutationGuarded(
			() => deleteLayoutOpening(layoutPreview, roomId, openingId),
			(result) => result.success
		);
		if (outcome.kind === 'skipped') {
			store.setStatusMessage('Finish the current layout interaction first');
			return;
		}
		if (outcome.result.success && selection.kind === 'opening' && selection.openingId === openingId) {
			layoutInteraction.selection = { kind: 'wall', roomId: selection.roomId, segmentId: selection.segmentId };
		}
		store.setStatusMessage(outcome.result.success ? 'Deleted opening' : `Opening delete failed: ${outcome.result.message}`);
	}

	// room deletion: guarded layout transaction + reject-when-
	// scene-referenced policy. (Unreachable in the relic, which cannot enter
	// the layout workspace, but kept in parity with the editor shell.)
	function deleteRoom(roomId: string): boolean {
		const outcome = runLayoutMutationGuarded(
			() => deleteLayoutRoom(layoutPreview, roomId, store.document),
			(result) => result.success
		);
		if (outcome.kind === 'skipped') {
			store.setStatusMessage('Finish the current layout interaction first');
			return false;
		}
		if (!outcome.result.success) {
			store.setStatusMessage(`Room delete failed: ${outcome.result.message}`);
			return false;
		}
		layoutInteraction.selection = { kind: 'none' };
		store.setStatusMessage('Deleted room');
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
	aria-label="Editor viewport"
>
	{#if store.currentWorkspace === 'layout'}
		<LayoutDraftToolbar interaction={layoutInteraction} preview={layoutPreview} onCancelLayoutTransaction={cancelLayoutTransaction} />
		<Canvas dpr={[1, 1.5]} shadows>
			<LayoutRenderGate interaction={layoutInteraction} />
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
				{#snippet entityRenderer(scene, rooms, _activation)}
					<EditorSceneEntities {scene} {rooms} {placementRegistry} />
				{/snippet}
			</MuseumScene>
			<LayoutPreviewScene
				model={layoutPreview.model}
				geometry={layoutPreview.geometry}
				wallMeshesByRoom={layoutPreview.wallMeshesByRoom}
				interaction={layoutInteraction}
				showCeilings={layoutPreview.showCeilings}
				floorColor={store.floorColor}
			/>
			<EditorGrid
				visible={store.gridVisible && !store.isVisitorCameraPreview}
				opacity={store.gridOpacity}
			/>
		</Canvas>
		{#if layoutInteraction.viewMode === 'plan'}
			<LayoutPlanViewport
				model={layoutPreview.model}
				preview={layoutPreview}
				interaction={layoutInteraction}
				onCommit={commitDraftRoom}
				onOpeningCreate={createOpening}
				onOpeningDelete={deleteOpening}
				onRoomDelete={deleteRoom}
				onLayoutTransactionBegin={beginLayoutTransaction}
				onLayoutTransactionCommit={commitLayoutTransaction}
				onLayoutTransactionCancel={cancelLayoutTransaction}
			/>
		{/if}
	{:else}
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
				showArchitecture
			>
				{#snippet camera(graph, _state)}
					<EditorCameraRig
						{store}
						{graph}
						layoutBounds={layoutPreview.bounds}
						layoutFrameVersion={layoutPreview.previewVersion}
					/>
				{/snippet}
				{#snippet entityRenderer(scene, rooms, _activation)}
					<EditorSceneEntities {scene} {rooms} {placementRegistry} />
				{/snippet}
			</MuseumScene>
			<EditorGrid
				visible={store.gridVisible && !store.isVisitorCameraPreview}
				opacity={store.gridOpacity}
			/>
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
				{:else if store.cameraSelection && !store.pendingPlacementAssetId && !store.pendingPlacementPrimitiveKind && !store.pendingPlacementLightKind && (!store.isFramingBlocked || (store.transformInteractionActive && store.transformInteractionKind === 'camera'))}
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
			<!-- Phase 1b — placement ghost preview. Renders only while a placement
			     is armed; pure visual cue, click pipeline stays in EditorSelection. -->
			{#if !store.isVisitorCameraPreview}
				<PlacementGhost {store} />
			{/if}
		</Canvas>
	{/if}
	{#if store.isCameraPreviewPlaying}
		<!-- P11.2 §3 — only a visitor preview shields the canvas; the Director
		     label stays visible but non-blocking so selection/framing can
		     auto-pause through the seam (pointer-events: none). -->
		<div
			class="preview-shield"
			class:non-blocking={!store.isVisitorCameraPreview}
			role="status"
		>
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
		background: var(--editor-bg-app);
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
		border: 1px solid var(--editor-accent-border);
		border-radius: 999px;
		background: var(--editor-bg-panel-raised);
		color: var(--editor-text-primary);
		font: 600 0.73rem/1.2 var(--editor-font);
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
		color: var(--editor-text-primary);
		font: 600 0.73rem/1.2 var(--editor-font);
		pointer-events: auto;
	}

	/* P11.2 §3 — the Director playback label must not block the canvas; only a
	   visitor preview shields it (pointer-events: auto above). */
	.preview-shield.non-blocking {
		pointer-events: none;
	}

	.viewport :global(canvas) {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
