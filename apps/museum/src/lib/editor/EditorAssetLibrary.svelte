<script lang="ts">
	import { museumAssets } from '$lib/content/assets';
	import type { AssetCategory, MuseumAsset } from '$lib/types/assets';
	import { listAssetLibraryItems, type AssetLibraryStatusFilter } from './editor-assets';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let {
		store,
		onselectionchange
	}: {
		store: MuseumEditorStore;
		onselectionchange?: (asset: MuseumAsset | undefined) => void;
	} = $props();

	const categories = [...new Set(museumAssets.map((asset) => asset.category))];
	let query = $state('');
	let category = $state<AssetCategory | ''>('');
	let status = $state<AssetLibraryStatusFilter>('usable');
	let selectedAssetId = $state<string | null>(null);

	const assets = $derived(
		listAssetLibraryItems({
			query,
			category: category || undefined,
			status
		})
	);
	const selectedAsset = $derived(
		assets.find((asset) => asset.id === selectedAssetId) ?? assets[0]
	);

	$effect(() => {
		onselectionchange?.(selectedAsset);
	});

	function selectAsset(asset: MuseumAsset) {
		selectedAssetId = asset.id;
	}
</script>

<section class="library" aria-label="Asset library">
	<div class="filters">
		<label>
			<span>Search</span>
			<input bind:value={query} type="search" placeholder="Name, ID, or category" />
		</label>
		<div class="filter-row">
			<label>
				<span>Category</span>
				<select bind:value={category}>
					<option value="">All</option>
					{#each categories as option}
						<option value={option}>{option}</option>
					{/each}
				</select>
			</label>
			<label>
				<span>Status</span>
				<select bind:value={status}>
					<option value="usable">Usable</option>
					<option value="approved">Approved</option>
					<option value="testing">Testing</option>
					<option value="placeholder">Placeholder</option>
					<option value="rejected">Rejected</option>
				</select>
			</label>
		</div>
	</div>

	<p class="count">{assets.length} asset{assets.length === 1 ? '' : 's'}</p>
	<ul class="asset-list">
		{#each assets as asset (asset.id)}
			<li>
				<button
					type="button"
					class:selected={selectedAsset?.id === asset.id}
					onclick={() => selectAsset(asset)}
				>
					<strong>{asset.name}</strong>
					<span>{asset.category} · {asset.status} · {asset.placementSurface}</span>
				</button>
			</li>
		{/each}
	</ul>

	{#if !selectedAsset}
		<p class="empty">No assets match these filters.</p>
	{/if}
</section>

<style>
	.library, .filters { display: flex; flex-direction: column; gap: 0.65rem; }
	.filters label { display: flex; flex: 1; flex-direction: column; gap: 0.25rem; color: #a8a29a; font-size: 0.68rem; }
	.filters input, .filters select { min-width: 0; padding: 0.42rem; border: 1px solid #3a3a46; border-radius: 0.32rem; background: #1a1a22; color: #f4efe4; font: inherit; }
	.filters input:focus, .filters select:focus { outline: 1px solid #d6b35f; border-color: #d6b35f; }
	.filter-row { display: flex; gap: 0.45rem; }
	.count, .empty { margin: 0; color: #918c84; font-size: 0.7rem; }
	.asset-list { display: flex; max-height: 34vh; flex-direction: column; gap: 0.28rem; overflow: auto; }
	.asset-list button { display: flex; width: 100%; flex-direction: column; gap: 0.12rem; padding: 0.48rem; border: 1px solid transparent; border-radius: 0.32rem; background: #16161d; color: #f4efe4; text-align: left; cursor: pointer; }
	.asset-list button:hover { border-color: #3a3a46; background: #202029; }
	.asset-list button.selected { border-color: #d6b35f; background: #2a2618; }
	.asset-list strong { font-size: 0.76rem; }
	.asset-list span { color: #a8a29a; font-size: 0.66rem; }
</style>
