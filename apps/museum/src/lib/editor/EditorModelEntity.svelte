<script lang="ts">
	import type { SceneModelEntity } from '$lib/content/scene';
	import type { AssetLoadStatus } from '$lib/types/assets';
	import type { EditorPlacementRegistry } from '$lib/museum/placement-registry';
	import type { EffectiveSceneMaterial } from '$lib/museum/materials/scene-instance-material';
	import AssetModel from '$lib/museum/assets/AssetModel.svelte';

	let {
		entity,
		placementRegistry,
		effective
	}: {
		entity: SceneModelEntity;
		placementRegistry: EditorPlacementRegistry;
		effective: EffectiveSceneMaterial | null;
	} = $props();

	// P3 pre-brief — mesh-readiness invalidation. This local slot is always
	// defined ('idle'), so AssetModel's $bindable `status` never receives
	// `undefined` (a bind target with a fallback default rejects undefined).
	// When the GLB finishes loading, notify the placement registry so the
	// selection/hover helpers rebuild their placement-local OBB from the
	// now-complete subtree — without a pointer movement, transform gesture,
	// selection toggle, or history write.
	let status = $state<AssetLoadStatus>('idle');

	$effect(() => {
		if (status === 'ready' || status === 'fallback') {
			placementRegistry.notifyPlacementRootChanged?.(entity.id);
		}
	});
</script>

<AssetModel
	assetId={entity.assetId}
	fallback={entity.fallback}
	enabled
	localTransform
	{effective}
	bind:status
/>
