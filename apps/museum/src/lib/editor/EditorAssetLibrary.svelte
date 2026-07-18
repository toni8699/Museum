<script lang="ts">
	import { museumAssets, resolveAssetFallback } from '$lib/content/assets';
	import type { AssetCategory, MuseumAsset } from '$lib/types/assets';
	import { listAssetLibraryItems, type AssetLibraryStatusFilter } from './editor-assets';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let { store }: { store: MuseumEditorStore } = $props();

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

	{#if selectedAsset}
		<div class="details">
			<div>
				<h2>{selectedAsset.name}</h2>
				<p class="id">{selectedAsset.id}</p>
			</div>
			<dl>
				<div><dt>Category</dt><dd>{selectedAsset.category}</dd></div>
				<div><dt>Status</dt><dd>{selectedAsset.status}</dd></div>
				<div><dt>Placement</dt><dd>{selectedAsset.placementSurface}</dd></div>
				<div><dt>Fallback</dt><dd>{resolveAssetFallback(selectedAsset)}</dd></div>
				<div><dt>File</dt><dd>{selectedAsset.productionFile ?? 'Fallback only'}</dd></div>
				<div><dt>Creator</dt><dd>{selectedAsset.creator ?? 'Not recorded'}</dd></div>
				<div><dt>Licence</dt><dd>{selectedAsset.license}</dd></div>
			</dl>
			{#if selectedAsset.placementSurface === 'floor'}
				<button
					type="button"
					class="place"
					class:active={store.pendingPlacementAssetId === selectedAsset.id}
					onclick={() => store.beginAssetPlacement(selectedAsset.id)}
				>
					{store.pendingPlacementAssetId === selectedAsset.id ? 'Placing…' : 'Place in Paris'}
				</button>
			{:else}
				<p class="unsupported">
					{selectedAsset.placementSurface === 'surface'
						? 'Placement on tables or pedestals is not available in Phase 5.'
						: `${selectedAsset.placementSurface[0]?.toUpperCase()}${selectedAsset.placementSurface.slice(1)} placement is not available in Phase 5.`}
				</p>
			{/if}
		</div>
	{:else}
		<p class="empty">No assets match these filters.</p>
	{/if}
</section>

<style>
	.library, .filters, .details { display: flex; flex-direction: column; gap: 0.65rem; }
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
	.details { padding: 0.75rem; border: 1px solid #34313a; border-radius: 0.4rem; background: #17171f; }
	.details h2 { margin: 0; font-size: 0.82rem; }
	.details p.id { margin: 0.2rem 0 0; color: #918c84; font: 0.66rem ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
	dl { display: flex; flex-direction: column; gap: 0.4rem; margin: 0; }
	dl div { display: grid; grid-template-columns: 4.5rem minmax(0, 1fr); gap: 0.4rem; }
	dt { color: #8f8a82; font-size: 0.64rem; text-transform: uppercase; }
	dd { min-width: 0; margin: 0; font-size: 0.69rem; overflow-wrap: anywhere; }
	.place { padding: 0.48rem 0.6rem; border: 1px solid #8d753c; border-radius: 0.32rem; background: #242018; color: #fff2c7; font: inherit; font-size: 0.73rem; cursor: pointer; }
	.place.active { background: #3a3019; box-shadow: inset 0 0 0 1px #d6b35f; }
	.unsupported { margin: 0; color: #a8a29a; font-size: 0.7rem; line-height: 1.4; }
</style>
