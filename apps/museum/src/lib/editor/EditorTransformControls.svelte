<script lang="ts">
	import { getContext, onDestroy } from 'svelte';
	import { useThrelte } from '@threlte/core';
	import type { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
	import type { EditorStore } from './editor-store.svelte';
	import {
		EDITOR_INTERACTION_STORE_KEY,
		type EditorInteractionStore
	} from './store/editor-interaction-store.svelte';
	import { getActiveTransformTarget } from './editor-transform';
	import type { EditorActiveSelectionStore } from './app/active-editor-selection.svelte';
	import {
		createSceneGizmoAdapter,
		createSceneGizmoPivot,
		disposeSceneGizmoPivot,
		type SceneGizmoAdapterInput
	} from './gizmo/scene-gizmo-adapter.svelte';
	import { createCameraGizmoAdapter } from './gizmo/camera-gizmo-adapter.svelte';
	import {
		createLayoutGizmoAdapter,
		createLayoutGizmoProxy,
		disposeLayoutGizmoProxy
	} from './gizmo/layout-gizmo-adapter.svelte';
	import { resolveLayoutGizmoTarget } from './gizmo/layout-gizmo-target';
	import type { LayoutGizmoCandidateBundle } from './gizmo/layout-gizmo-candidate';
	import type { LayoutPreviewState } from './layout/layout-preview-state.svelte';
	import type { LayoutInteractionState } from './layout/layout-interaction';
	import type { EditorGizmoTargetAdapter } from './gizmo/editor-gizmo-contract';
	import type { EditorGizmoHostController } from './gizmo/editor-gizmo-host-controller';
	import EditorTransformControlsHost from './gizmo/EditorTransformControlsHost.svelte';

	let {
		store,
		controls = $bindable(),
		/** the single active-domain selector. Absent on the relic mount. */
		activeSelection,
		/** layout adapter inputs. Absent on the relic mount. */
		layoutPreview,
		layoutInteraction,
		onLayoutTransient
	}: {
		store: EditorStore;
		controls?: TransformControls;
		activeSelection?: EditorActiveSelectionStore;
		layoutPreview?: LayoutPreviewState;
		layoutInteraction?: LayoutInteractionState;
		onLayoutTransient?: (bundle: LayoutGizmoCandidateBundle | null) => void;
	} = $props();

	const { scene } = useThrelte();
	const interactionStore = getContext<EditorInteractionStore | undefined>(
		EDITOR_INTERACTION_STORE_KEY
	);
	// One shared session pivot per mounted canvas — created by the scene
	// adapter module (S7 step 3); this composer only holds the reference.
	const pivot = createSceneGizmoPivot(scene);
	// one shared session-only layout proxy per mounted canvas (like the
	// pivot); its pose is reset to the descriptor baseline per adapter via
	// `prepare`/`begin`, so no second gizmo or per-selection object is created.
	const layoutProxy = createLayoutGizmoProxy(scene);

	let hostController: EditorGizmoHostController | null = $state(null);

	// Legacy slot arbitration (relic /museum/editor): navigation before
	// placement, exact monolith inputs.
	const selectedRoots = $derived(store.getPlacementRoots());
	const selectedCameraRoot = $derived(store.getSelectedCameraHelperRoot());
	const selectedAnchorRoot = $derived(store.getSelectedAnchorHelperRoot());
	const selectedViewTargetRoot = $derived(
		store.getSelectedViewKeyframeTargetHelperRoot()
	);

	const gates = $derived.by(() => ({
		previewActive:
			store.isDocumentMutationBlocked ||
			store.directPathInteractionActive ||
			store.viewKeyframeProgressDrag !== null ||
			!store.transformGizmoVisible,
		pendingPlacement: Boolean(
			store.pendingPlacementAssetId ||
				store.pendingPlacementPrimitiveKind ||
				store.pendingPlacementLightKind ||
				(store.pendingNavigationCommand &&
					store.pendingNavigationCommand.kind !== 'connect-pending-node')
		)
	}));

	const legacyTarget = $derived.by(() => {
		if (activeSelection) return null;
		return getActiveTransformTarget({
			previewActive: gates.previewActive,
			pendingPlacement: gates.pendingPlacement,
			placementKey: store.selectionKey,
			placementObject:
				selectedRoots.length > 0 &&
				selectedRoots.length === store.selectedPlacementIds.length
					? pivot
					: undefined,
			navigationSelection: store.navigationSelection,
			cameraObject: selectedCameraRoot,
			anchorObject: selectedAnchorRoot,
			viewTargetObject: selectedViewTargetRoot
		});
	});

	const sceneDeps = $derived.by((): SceneGizmoAdapterInput => ({
		store,
		scene,
		pivot,
		interactionStore,
		getMode: () => interactionStore?.mode ?? store.transformMode,
		isShiftHeld: () => hostController?.isShiftHeld() ?? false
	}));

	// One nullable adapter per derive. Pending commands, preview, and direct
	// path/framing drags detach all targets before a new gesture can start.
	const adapter = $derived.by((): EditorGizmoTargetAdapter | null => {
		if (gates.previewActive || gates.pendingPlacement) return null;
		if (!activeSelection) {
			const target = legacyTarget;
			if (!target) return null;
			if (target.kind === 'placement') return createSceneGizmoAdapter(sceneDeps);
			return createCameraGizmoAdapter({ store });
		}
		const active = activeSelection.active;
		if (active.domain === 'scene') return createSceneGizmoAdapter(sceneDeps);
		if (active.domain === 'camera') return createCameraGizmoAdapter({ store });
		if (active.domain === 'layout') {
			if (!layoutPreview || !layoutInteraction || !onLayoutTransient) return null;
			const descriptor = resolveLayoutGizmoTarget(
				layoutPreview.project.layout,
				layoutPreview.geometry,
				layoutInteraction.selection
			);
			// A stale/missing identity resolves no descriptor → no live adapter
			// (matching the scene/camera missing-root rule).
			if (!descriptor) return null;
			return createLayoutGizmoAdapter({
				store,
				layoutPreview,
				layoutInteraction,
				descriptor,
				proxy: layoutProxy,
				isShiftHeld: () => hostController?.isShiftHeld() ?? false,
				onTransient: onLayoutTransient
			});
		}
		return null;
	});

	// Prepare (pivot re-center) before the host attaches.
	$effect(() => {
		adapter?.prepare?.();
	});

	onDestroy(() => {
		disposeSceneGizmoPivot(pivot);
		disposeLayoutGizmoProxy(layoutProxy);
	});
</script>

<EditorTransformControlsHost
	{store}
	{adapter}
	bind:controls
	bind:controller={hostController}
/>