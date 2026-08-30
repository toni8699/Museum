<script lang="ts">
	import { useThrelte } from '@threlte/core';
	import type { LayoutInteractionState } from './layout-interaction';

	let { interaction }: { interaction: LayoutInteractionState } = $props();

	const { autoRender, invalidate } = useThrelte();

	$effect(() => {
		const shouldRender = interaction.viewMode === '3d';
		if (autoRender.current !== shouldRender) {
			autoRender.set(shouldRender);
			invalidate();
		}
	});
</script>
