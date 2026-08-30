<script lang="ts">
	import type { LayoutPreviewState } from '$lib/editor/layout/layout-preview-state.svelte';
	import type { EditorStore } from '$lib/editor/editor-store.svelte';
	import CameraPlanToolbar from '$lib/editor/camera-plan/CameraPlanToolbar.svelte';
	import CameraPlanViewport from '$lib/editor/camera-plan/CameraPlanViewport.svelte';
	import type { CameraPlanState } from '$lib/editor/camera-plan/camera-plan-state.svelte';
	import type { EditorContextMenuStore } from '$lib/editor/context-menu/context-menu-state.svelte';
	import { resolveEditorPlacementScale } from '$lib/editor/scale-vector';
	import type { SceneEntity } from '$lib/content/scene';

	let {
		store,
		layoutPreview,
		cameraPlan,
		contextMenu = null
	}: {
		store: EditorStore;
		layoutPreview: LayoutPreviewState;
		cameraPlan: CameraPlanState;
		contextMenu?: EditorContextMenuStore | null;
	} = $props();

	// Same session-aware scale resolution as Scene Plan/3D, so a scaled
	// placement renders the same footprint size on every surface.
	function effectiveSceneScale(entity: SceneEntity) {
		void store.placementScaleVectorVersion;
		return resolveEditorPlacementScale(entity.scale, store.getPlacementScaleVector(entity.id));
	}
</script>

<div class="camera-plan-workspace" role="application" aria-label="Camera Plan surface">
	<CameraPlanToolbar {store} {cameraPlan} />
	<CameraPlanViewport {store} preview={layoutPreview} {cameraPlan} {contextMenu} getEffectiveSceneScale={effectiveSceneScale} />
</div>

<style>
	.camera-plan-workspace {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 0;
		overflow: hidden;
		background: var(--editor-bg-app);
		/* S10.1.6 amendment — Plan ↔ 3D swaps are instant (no fade). */
	}
</style>
