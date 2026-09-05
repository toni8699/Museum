<script lang="ts">
	import { Canvas } from '@threlte/core';
	import { isFlowNode } from '$lib/content/scene';
	import MuseumScene from '$lib/museum/MuseumScene.svelte';
	import type { EditorPlacementRegistry } from '$lib/museum/placement-registry';
	import EditorSceneEntities from '$lib/editor/EditorSceneEntities.svelte';
	import EditorCameraHelpers from '$lib/editor/camera/EditorCameraHelpers.svelte';
	import EditorCameraFramingHelpers from '$lib/editor/camera/EditorCameraFramingHelpers.svelte';
	import EditorCameraPathHelpers from '$lib/editor/camera/EditorCameraPathHelpers.svelte';
	import EditorCameraViewHelpers from '$lib/editor/camera/EditorCameraViewHelpers.svelte';
	import EditorCameraRig from '$lib/editor/camera/EditorCameraRig.svelte';
	import EditorOrientationGizmo from '$lib/editor/EditorOrientationGizmo.svelte';
	import EditorOrientationGizmoProjector from '$lib/editor/EditorOrientationGizmoProjector.svelte';
import EditorGrid from '$lib/editor/EditorGrid.svelte';
import { viewportPalette } from '$lib/editor/theme.svelte';
import EditorCameraLabelProjector from '$lib/editor/camera/EditorCameraLabelProjector.svelte';
	import EditorCameraLabelsOverlay from '$lib/editor/camera/EditorCameraLabelsOverlay.svelte';
	import { buildCameraNodeLabelKinds } from '$lib/editor/camera/editor-camera-labels';
	import EditorPlacementTools from '$lib/editor/EditorPlacementTools.svelte';
	import EditorSelection from '$lib/editor/EditorSelection.svelte';
	import {
		buildSceneEntityContextMenuItems
	} from '$lib/editor/context-menu/scene-menu-items';
	import {
		buildCameraConnectionContextMenuItems,
		buildCameraNodeContextMenuItems
	} from '$lib/editor/context-menu/camera-menu-items';
	import { resolveSelectionBeforeMenu } from '$lib/editor/context-menu/selection-before-menu';
	import type { EditorContextMenuStore } from '$lib/editor/context-menu/context-menu-state.svelte';
	import {
		validateConnectionDeletion,
		validateGuidedTourRemoval,
		validateNavigationNodeDeletion
	} from '$lib/editor/editor-navigation-graph';
	import type { NormalSelectionResult } from '$lib/editor/editor-selection';
	import EditorSelectionHelper from '$lib/editor/EditorSelectionHelper.svelte';
	import EditorTransformControls from '$lib/editor/EditorTransformControls.svelte';
	import PlacementGhost from '$lib/editor/placement-ghost.svelte';
	import LayoutPreviewScene from '$lib/editor/layout/LayoutPreviewScene.svelte';
	import {
		selectLayoutObject,
		selectLayoutOpening,
		selectLayoutRoom,
		type LayoutInteractionState
	} from '$lib/editor/layout/layout-interaction';
	import {
		isLayoutDirectPickDeferred,
		layoutPickBeatsSceneDistance,
		resolveLayout3dHits,
		type Layout3dHitCandidate
	} from '$lib/editor/layout/layout-3d-picking';
	import {
		type LayoutPreviewState
	} from '$lib/editor/layout/layout-preview-state.svelte';
	import type { EditorStore } from '$lib/editor/editor-store.svelte';
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
	import type { LayoutGizmoCandidateBundle } from '$lib/editor/gizmo/layout-gizmo-candidate';

	let {
		store,
		layoutPreview,
		layoutInteraction,
		// explicit 3D context from `EditorViewState.active3dContext`.
		// Camera authoring overlays and node-handle groups mount only in the
		// Camera context; the editor camera rig stays mounted in both.
		context = 'scene',
		// P3.4/P3.5 — shared context-menu slot; Scene 3D + Camera 3D adapters.
		contextMenu = null,
		takeoverPose = null,
		takeoverObserver = null,
		onTakeoverPoseRestored = undefined
	}: {
		store: EditorStore;
		layoutPreview: LayoutPreviewState;
		layoutInteraction: LayoutInteractionState;
		context: 'scene' | 'camera';
		contextMenu?: EditorContextMenuStore | null;
		takeoverPose?: import('$lib/editor/camera/editor-camera').EditorOrbitPose | null;
		takeoverObserver?: import('$lib/editor/editor-store.svelte').TakeoverObserverState | null;
		onTakeoverPoseRestored?: () => void;
	} = $props();
	const isCameraContext = $derived(context === 'camera');
	// P1.7 — shell spec "Viewport MUST show": order/badge kinds for the 3D
	// label overlay, from the same main-flow accessor the Camera Plan
	// projection uses (`store.mainFlowNodeIds`), so Plan and 3D agree.
	const cameraLabelKinds = $derived(
		isCameraContext && !store.isVisitorCameraPreview
			? buildCameraNodeLabelKinds(store.mainFlowNodeIds, store.document.navigationNodes)
			: []
	);
	const interactionStore = getContext<EditorInteractionStore | undefined>(
		EDITOR_INTERACTION_STORE_KEY
	);

	// S10.1.6 amendment (P1.7 owner follow-up): Scene ↔ Camera context switches
	// are instant — the Canvas stays mounted across context switches (only
	// camera-chrome mounts/unmounts) and no fade plays.
	const activeSelection = getContext<EditorActiveSelectionStore | undefined>(
		ACTIVE_EDITOR_SELECTION_KEY
	);

	// the transient candidate bundle the layout adapter previews during
	// a drag. `LayoutPreviewScene` renders it instead of the committed project;
	// the composer's adapter writes it through `onLayoutTransient`.
	let layoutTransient = $state<LayoutGizmoCandidateBundle | null>(null);

	// compiled per-room bounds for room-focus framing (the relic
	// passes none, so its Chopin `getRoom` frame stays untouched).
	const roomBoundsById = $derived(
		(roomId: string) =>
			layoutPreview.geometry.rooms.find((room) => room.roomId === roomId)?.bounds3 ?? null
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
	 * resolve 3D layout candidates through the S5 pick index and commit
	 * the winner through the existing `selectLayout*` helpers. Returns `false`
	 * when no layout candidate resolved, or when an actionable scene/camera hit
	 * is nearer (scene wins the exact-tie band); `true` commits a layout
	 * selection and lets the coordinator skip the normal dispatch.
	 */
	/**
	 * P3.4/P3.5 — the shared 3D right-click adapter. Scene 3D resolves
	 * placement targets through the normal-selection raycast; Camera 3D
	 * reuses the camera-graph command set (minus Plan-only spatial rows).
	 * Selection-before-menu mirrors left-click semantics; empty space never
	 * changes selection and keeps no custom menu. Returns whether the custom
	 * menu opened (claims the native contextmenu event).
	 */
	function handle3DContextMenu(payload: {
		clientX: number;
		clientY: number;
		result: NormalSelectionResult;
	}): boolean {
		if (!contextMenu) return false;
		const { result } = payload;

		if (result.action === 'select') {
			if (isCameraContext) return false;
			const entityId = result.id;
			const selected = store.selectedPlacementIds.includes(entityId);
			if (
				resolveSelectionBeforeMenu({
					targetSelected: selected,
					selectionSize: store.selectedPlacementIds.length
				}) === 'select-target'
			) {
				store.selectionActions.selectPlacement(entityId);
			}
			contextMenu.open({
				surfaceId: 'scene-3d',
				x: payload.clientX,
				y: payload.clientY,
				items: buildSceneEntityContextMenuItems({
					targetHidden: store.isEntityHidden(entityId),
					mutationBlockedReason: store.isDocumentMutationBlocked ? 'Preview is active' : null,
					duplicateBlockedReason:
						store.selectedPlacementIds.length === 0 ? 'Nothing selected' : null,
					actions: {
						duplicate: () => store.duplicateSelection(),
						focus: () => void store.focusPlacement(entityId),
						toggleVisibility: () => store.toggleEntityVisibility(entityId),
						deleteSelection: () => store.deletePlacements([...store.selectedPlacementIds])
					}
				})
			});
			return true;
		}

		if (result.action === 'deselect') return false;

		if (result.action === 'select-navigation' && isCameraContext) {
			const selection = result.selection;
			if (selection.kind === 'connection') {
				store.selectionActions.selectConnection(selection.connectionId);
				const failure = validateConnectionDeletion(store.document, selection.connectionId);
				contextMenu.open({
					surfaceId: 'camera-3d',
					x: payload.clientX,
					y: payload.clientY,
					items: buildCameraConnectionContextMenuItems({
						mutationBlockedReason: store.isAuthoringPauseBlocked ? 'Preview is active' : null,
						deleteReason: failure.ok ? null : failure.message,
						actions: {
							openTiming: () =>
								store.selectCameraTimelineEdge(selection.connectionId, 'forward', 0),
							toggleReverse: () => store.toggleCameraEdgeReverse(),
							deleteConnection: () => store.deleteConnection(selection.connectionId)
						}
					})
				});
				return true;
			}
			if (selection.kind === 'node') {
				return openCameraNodeMenu(
					selection.nodeId,
					payload.clientX,
					payload.clientY,
					'camera-3d',
					false
				);
			}
			return false; // anchor / view-keyframe handles keep native behavior in v1
		}

		if (result.action === 'select-camera' && isCameraContext) {
			return openCameraNodeMenu(
				result.selection.nodeId,
				payload.clientX,
				payload.clientY,
				'camera-3d',
				false
			);
		}

		return false;
	}

	function openCameraNodeMenu(
		nodeId: string,
		clientX: number,
		clientY: number,
		surfaceId: 'camera-plan' | 'camera-3d',
		spatial: boolean
	): boolean {
		if (!contextMenu) return false;
		const node = store.document.navigationNodes.find((candidate) => candidate.id === nodeId);
		if (!node) return false;
		// selection-before-menu through the existing selection actions
		store.selectionActions.selectNavigationNode(nodeId);
		const flow = store.mainFlowNodeIds;
		const onSequence = flow.includes(nodeId) || (!store.isRelic && isFlowNode(node));
		// P11.2 §3 — camera-node menu is AP: reachable under a playing Director
		// preview so its actions auto-pause; visitor/gesture still blocked.
		const blocked = store.isAuthoringPauseBlocked ? 'Preview is active' : null;
		const removalFailure = onSequence
			? validateGuidedTourRemoval(store.document, nodeId)
			: null;
		const deletionFailure = validateNavigationNodeDeletion(store.document, nodeId);
		contextMenu.open({
			surfaceId,
			x: clientX,
			y: clientY,
			items: buildCameraNodeContextMenuItems({
				spatial,
				nodeOnSequence: onSequence,
				mutationBlockedReason: blocked,
				previewCameraReason: !store.isRelic && onSequence
					? 'Sequenced cameras are inspected from Sequence scope'
					: null,
				removeFromSequenceReason: removalFailure && !removalFailure.ok ? removalFailure.message : null,
				deleteNodeReason: deletionFailure.ok ? null : deletionFailure.message,
				actions: {
					previewCamera: () => void store.previewSelectedNode(),
					addToSequence: () =>
						store.insertNodeIntoGuidedTour(nodeId, Math.max(flow.length, 0)),
					removeFromSequence: () => store.removeNodeFromGuidedTour(nodeId),
					rename: () => {
						const next = window.prompt('Camera name', node.label)?.trim();
						if (next && next !== node.label) store.commitSelectedNodeLabel(next);
					},
					deleteNode: () => store.deleteNavigationNode(nodeId)
				}
			})
		});
		return true;
	}

	function handleLayoutPick(
		candidates: readonly Layout3dHitCandidate[],
		competingSceneDistance: number | null
	): boolean {
	const resolved = resolveLayout3dHits(layoutPreview.layout3dPickIndexByRoom, candidates);
	if (!resolved) return false;
	// Deferred (2026-08-16): direct 3D wall/anchor picks fall through to the
	// normal coordinator dispatch (wall surfaces carry no scene identity, so
	// the click deselects). Hierarchy picks of the same identities still
	// commit + highlight via `selectLayout*`. See `isLayoutDirectPickDeferred`.
	if (isLayoutDirectPickDeferred(resolved.selection)) return false;
	if (!layoutPickBeatsSceneDistance(resolved.distance, competingSceneDistance)) {
		return false;
	}
	switch (resolved.selection.kind) {
		case 'room':
			selectLayoutRoom(layoutInteraction, resolved.selection.roomId);
			break;
		case 'opening':
			selectLayoutOpening(
				layoutInteraction,
				resolved.selection.roomId,
				resolved.selection.segmentId,
				resolved.selection.openingId
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

	/**
	 * Deferred (2026-08-16): the hover-preview feed (cyan tint) stays off —
	 * `EditorSelection` still owns the optional `onLayoutHover` prop (S6
	 * contract, untouched) but this shell does not pass it, so hover
	 * resolution is a no-op. Direct 3D wall/interior-anchor picks are also
	 * deferred (the `isLayoutDirectPickDeferred` gate above falls through to
	 * the normal dispatch); rooms/openings/objects stay directly pickable.
	 * Hierarchy wall selection + the gold highlight shell are shipped — S6.1
	 * re-enables direct wall picks after a root-cause browser QA. Restore this
	 * block (layoutHover state + handleLayoutHover + setLayoutHover) with the
	 * hover feed.
	 */
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
			background={viewportPalette.background}
		>
			{#snippet camera(graph, _state)}
				<EditorCameraRig
					{store}
					{graph}
					layoutBounds={layoutPreview.bounds}
					layoutFrameVersion={layoutPreview.previewVersion}
					roomBoundsById={roomBoundsById}
					{takeoverPose}
					{takeoverObserver}
					{onTakeoverPoseRestored}
				/>
			{/snippet}
		</MuseumScene>
		<EditorSceneEntities
			scene={store.scene}
			rooms={store.rooms}
			{placementRegistry}
			hiddenEntityIds={store.hiddenEntityIds}
		/>
		<LayoutPreviewScene
			model={layoutPreview.model}
			geometry={layoutPreview.geometry}
			wallMeshesByRoom={layoutPreview.wallMeshesByRoom}
			interaction={layoutInteraction}
			showCeilings={layoutPreview.showCeilings}
			transient={layoutTransient}
			floorColor={store.floorColor}
		/>
		<EditorGrid visible={store.gridVisible && !store.isVisitorCameraPreview} opacity={store.gridOpacity} />
		{#if !isCameraContext}
			<!-- P3B.2 — Scene-3D-only orientation box writer: publishes active
			     refs + immutable camera-projected geometry snapshots per frame. -->
			<EditorOrientationGizmoProjector />
		{/if}
		{#if isCameraContext && !store.isVisitorCameraPreview}
			<!-- P1.7 — projects the guided/unsequenced label positions each frame. -->
			<EditorCameraLabelProjector {store} kinds={cameraLabelKinds} />
		{/if}
		{#if isCameraContext && store.viewportShowPaths}
			<EditorCameraPathHelpers {store} />
		{/if}
		{#if isCameraContext && store.viewportShowFraming}
			<EditorCameraViewHelpers {store} />
			<EditorCameraFramingHelpers {store} />
		{/if}
		{#if isCameraContext && (store.viewportShowNodes || store.forceMountCameraNodeHandles)}
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
		<EditorSelection
			{store}
			{transformControls}
			onDeselect={activeSelection ? () => activeSelection.deselectActive() : undefined}
			onLayoutPick={store.isVisitorCameraPreview ? undefined : handleLayoutPick}
			onContextMenu={contextMenu && !store.isVisitorCameraPreview ? handle3DContextMenu : undefined}
		/>
		<EditorPlacementTools {store} />
		{#if !store.isVisitorCameraPreview}
			{#key store.selectionKey}
				<EditorSelectionHelper {store} />
			{/key}
		{/if}
		<EditorTransformControls
			{store}
			bind:controls={transformControls}
			activeSelection={activeSelection ?? undefined}
			layoutPreview={layoutPreview}
			layoutInteraction={layoutInteraction}
			onLayoutTransient={(bundle) => (layoutTransient = bundle)}
		/>
		{#if !store.isVisitorCameraPreview}
			<PlacementGhost {store} />
		{/if}
	</Canvas>
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
			Click a tagged room floor to place · Escape cancels
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
	<!-- P1.7 — shell spec "Viewport MUST show": guided order digits +
	     Unsequenced badges over the Camera 3D viewport. -->
	{#if isCameraContext && !store.isVisitorCameraPreview}
		<EditorCameraLabelsOverlay />
	{/if}
	{#if !isCameraContext}
		<!-- P3B.2 — Scene-3D-only projected orientation box. Absent from Camera
		     3D and both Plan surfaces; P3B.3 adds full interaction states. -->
		<EditorOrientationGizmo {store} layoutBounds={layoutPreview.bounds} />
	{/if}
</div>

<style>
	.viewport {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 0;
		background: var(--editor-bg-app);
		/* S10.1.6 amendment — view/domain switches are instant (no fade). */
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
