<script lang="ts">
	import { formatCameraNodeLabel } from './editor-outliner';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let { store }: { store: MuseumEditorStore } = $props();
</script>

<section class="camera-tree" aria-label="Camera tree">
	<div class="sidebar-section-header">
		<h2>Camera Nodes</h2>
		<span aria-label={`${store.nodeCount} camera nodes`}>{store.nodeCount}</span>
	</div>

	{#if store.nodeCount > 0}
		<ul role="tree" aria-label="Camera nodes">
			{#each store.document.navigationNodes as node, index (node.id)}
				<li
					role="treeitem"
					aria-selected={store.navigationSelection?.kind === 'node' &&
						store.navigationSelection.nodeId === node.id}
				>
					<button
						type="button"
						class="tree-row"
						class:tree-row--selected={store.navigationSelection?.kind === 'node' &&
							store.navigationSelection.nodeId === node.id}
						onclick={() => store.selectNavigationNode(node.id)}
					>
						<span class="tree-row__sequence" aria-hidden="true">
							{String(index + 1).padStart(2, '0')}
						</span>
						<span class="tree-row__label" title={formatCameraNodeLabel(node.label, node.id)}>
							{formatCameraNodeLabel(node.label, node.id)}
						</span>
					</button>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="empty">
			<strong>No camera nodes</strong>
			<span>Add cameras from viewport tools.</span>
		</p>
	{/if}
</section>

<style>
	.camera-tree { display: flex; min-width: 0; flex-direction: column; gap: 0.45rem; }
	.sidebar-section-header { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 0.75rem; min-height: 2rem; }
	.sidebar-section-header h2 { min-width: 0; margin: 0; font-size: 0.82rem; font-weight: 650; letter-spacing: 0.02em; }
	.sidebar-section-header span { flex: 0 0 auto; color: #918c84; font-size: 0.7rem; font-variant-numeric: tabular-nums; }
	ul { display: flex; min-width: 0; flex-direction: column; gap: 0.12rem; margin: 0; padding: 0; list-style: none; }
	.tree-row { display: flex; width: 100%; min-width: 0; min-height: 2rem; box-sizing: border-box; align-items: center; gap: 0.55rem; padding: 0.3rem 0.48rem; border: 1px solid transparent; border-radius: 0.28rem; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
	.tree-row:hover { border-color: #3a3a46; background: #202029; }
	.tree-row--selected { border-color: #8d753c; background: #2a2618; box-shadow: inset 0 0 0 1px #6f5c31; color: #fff2c7; }
	.tree-row__sequence { flex: 0 0 1.25rem; color: #918c84; font-size: 0.67rem; font-variant-numeric: tabular-nums; }
	.tree-row__label { min-width: 0; overflow: hidden; font-size: 0.76rem; font-weight: 570; text-overflow: ellipsis; white-space: nowrap; }
	.empty { display: flex; flex-direction: column; gap: 0.18rem; margin: 0; padding: 0.6rem 0.5rem; color: #918c84; font-size: 0.7rem; }
	.empty strong { color: #d6d0c4; font-size: 0.76rem; }
</style>
