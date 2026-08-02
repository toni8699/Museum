<script lang="ts">
	import { museumAssets } from '$lib/content/assets';
	import type { AssetCategory, MuseumAsset } from '$lib/types/assets';
	import { listAssetLibraryItems, type AssetLibraryStatusFilter } from './editor-assets';
	import { PRIMITIVE_LIBRARY, type PrimitiveLibraryItem } from './editor-primitives';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let {
		store,
		onselectionchange
	}: {
		store: MuseumEditorStore;
		onselectionchange?: (asset: MuseumAsset | undefined) => void;
	} = $props();

	const categories = [...new Set(museumAssets.map((asset) => asset.category))];
	let libraryTab = $state<'models' | 'shapes'>('models');
	let query = $state('');
	let category = $state<AssetCategory | ''>('');
	let status = $state<AssetLibraryStatusFilter>('usable');
	let selectedAssetId = $state<string | null>(null);
	let selectedShapeKind = $state<(typeof PRIMITIVE_LIBRARY)[number]['kind'] | null>(null);

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
	const shapes = $derived(
		PRIMITIVE_LIBRARY.filter((item) => {
			const needle = query.trim().toLocaleLowerCase();
			if (!needle) return true;
			return [item.kind, item.name, item.description].some((value) =>
				value.toLocaleLowerCase().includes(needle)
			);
		})
	);
	const selectedShape = $derived(
		shapes.find((item) => item.kind === selectedShapeKind) ?? shapes[0]
	);

	$effect(() => {
		onselectionchange?.(libraryTab === 'models' ? selectedAsset : undefined);
	});

	function selectAsset(asset: MuseumAsset) {
		selectedAssetId = asset.id;
		libraryTab = 'models';
	}

	function selectShape(item: PrimitiveLibraryItem) {
		selectedShapeKind = item.kind;
		libraryTab = 'shapes';
	}

	function placeShape(item: PrimitiveLibraryItem) {
		store.beginPrimitivePlacement(item.kind);
	}
</script>

<section class="library" aria-label="Asset library">
	<div class="library-tabs" role="tablist" aria-label="Asset library sections">
		<button
			type="button"
			role="tab"
			aria-selected={libraryTab === 'models'}
			class:active={libraryTab === 'models'}
			onclick={() => (libraryTab = 'models')}
		>Models</button>
		<button
			type="button"
			role="tab"
			aria-selected={libraryTab === 'shapes'}
			class:active={libraryTab === 'shapes'}
			onclick={() => (libraryTab = 'shapes')}
		>Shapes</button>
	</div>

	<div class="filters">
		<label>
			<span>Search</span>
			<input bind:value={query} type="search" placeholder="Name, ID, or category" />
		</label>
		{#if libraryTab === 'models'}
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
		{/if}
	</div>

	{#if libraryTab === 'models'}
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
	{:else}
		<p class="count">{shapes.length} shape{shapes.length === 1 ? '' : 's'}</p>
		<ul class="asset-list shape-list">
			{#each shapes as shape (shape.kind)}
				<li>
					<button
						type="button"
						class:selected={selectedShape?.kind === shape.kind}
						class:placing={store.pendingPlacementPrimitiveKind === shape.kind}
						onclick={() => selectShape(shape)}
						ondblclick={() => placeShape(shape)}
					>
						<span class="shape-thumb" data-kind={shape.kind} aria-hidden="true"></span>
						<strong>{shape.name}</strong>
						<span>{shape.description}</span>
					</button>
				</li>
			{/each}
		</ul>
		{#if selectedShape}
			<button
				type="button"
				class="place"
				class:active={store.pendingPlacementPrimitiveKind === selectedShape.kind}
				onclick={() => placeShape(selectedShape)}
			>
				{store.pendingPlacementPrimitiveKind === selectedShape.kind
					? 'Placing…'
					: `Place ${selectedShape.name}`}
			</button>
		{:else}
			<p class="empty">No shapes match these filters.</p>
		{/if}
	{/if}
</section>

<style>
	.library, .filters { display: flex; flex-direction: column; gap: 0.65rem; }
	.library-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 0.3rem; }
	.library-tabs button { padding: 0.42rem; border: 1px solid #3a3a46; border-radius: 0.32rem; background: #1a1a22; color: #a8a29a; font: inherit; font-size: 0.73rem; cursor: pointer; }
	.library-tabs button.active { border-color: #d6b35f; background: #2a2618; color: #fff2c7; }
	.filters label { display: flex; flex: 1; flex-direction: column; gap: 0.25rem; color: #a8a29a; font-size: 0.68rem; }
	.filters input, .filters select { min-width: 0; padding: 0.42rem; border: 1px solid #3a3a46; border-radius: 0.32rem; background: #1a1a22; color: #f4efe4; font: inherit; }
	.filters input:focus, .filters select:focus { outline: 1px solid #d6b35f; border-color: #d6b35f; }
	.filter-row { display: flex; gap: 0.45rem; }
	.count, .empty { margin: 0; color: #918c84; font-size: 0.7rem; }
	.asset-list { display: flex; max-height: 34vh; flex-direction: column; gap: 0.28rem; overflow: auto; }
	.asset-list button { display: flex; width: 100%; flex-direction: column; gap: 0.12rem; padding: 0.48rem; border: 1px solid transparent; border-radius: 0.32rem; background: #16161d; color: #f4efe4; text-align: left; cursor: pointer; }
	.asset-list button:hover { border-color: #3a3a46; background: #202029; }
	.asset-list button.selected, .asset-list button.placing { border-color: #d6b35f; background: #2a2618; }
	.asset-list strong { font-size: 0.76rem; }
	.asset-list span { color: #a8a29a; font-size: 0.66rem; }
	.shape-list button { display: grid; grid-template-columns: 2.2rem 1fr; grid-template-rows: auto auto; column-gap: 0.55rem; align-items: center; }
	.shape-list strong { grid-column: 2; }
	.shape-list span:not(.shape-thumb) { grid-column: 2; }
	.shape-thumb {
		grid-row: 1 / span 2;
		width: 2.2rem;
		height: 2.2rem;
		border: 1px solid #4a4638;
		border-radius: 0.28rem;
		background:
			linear-gradient(145deg, #3a3426 0%, #1d1b16 100%);
	}
	.shape-thumb[data-kind='box'] {
		background:
			linear-gradient(135deg, #c4a574 18%, transparent 18% 82%, #8a6d42 82%),
			#2a2618;
	}
	.shape-thumb[data-kind='plane'] {
		background:
			linear-gradient(#2a2618, #2a2618) center / 70% 8% no-repeat,
			#1a1a22;
	}
	.shape-thumb[data-kind='cylinder'] {
		background:
			radial-gradient(ellipse at center, #c4a574 0 35%, transparent 36%),
			linear-gradient(#8a6d42, #3a3426);
	}
	.shape-thumb[data-kind='sphere'] {
		background: radial-gradient(circle at 35% 30%, #e2d2b0, #8a6d42 55%, #2a2618 100%);
		border-radius: 999px;
	}
	.place {
		padding: 0.5rem 0.7rem;
		border: 1px solid #5b4d2a;
		border-radius: 0.35rem;
		background: #2a2618;
		color: #fff2c7;
		font: inherit;
		cursor: pointer;
	}
	.place.active { border-color: #d6b35f; }
	.place:hover { background: #35301f; }
</style>
