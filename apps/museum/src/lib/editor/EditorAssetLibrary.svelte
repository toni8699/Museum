<script lang="ts">
	import { museumAssets } from '$lib/content/assets';
	import type { AssetCategory, MuseumAsset } from '$lib/types/assets';
	import type { SceneTextureAsset } from '$lib/content/scene';
	import { listAssetLibraryItems, type AssetLibraryStatusFilter } from './editor-assets';
	import { LIGHT_LIBRARY, type LightLibraryItem } from './editor-lights';
	import { PRIMITIVE_LIBRARY, type PrimitiveLibraryItem } from './editor-primitives';
	import {
		filterTextureLibraryItems,
		orderRecentlyUsedTextures,
		TEXTURE_DRAG_MIME
	} from './editor-textures';
	import { sniffImageMime } from '$lib/editor/helpers/mime-sniff';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	type SourceMode = 'public' | 'local';

	let {
		store,
		onselectionchange
	}: {
		store: MuseumEditorStore;
		onselectionchange?: (asset: MuseumAsset | undefined) => void;
	} = $props();

	const categories = [...new Set(museumAssets.map((asset) => asset.category))];
	let libraryTab = $state<'models' | 'shapes' | 'lights' | 'textures'>('models');
	let query = $state('');
	let category = $state<AssetCategory | ''>('');
	let status = $state<AssetLibraryStatusFilter>('usable');
	let selectedAssetId = $state<string | null>(null);
	let selectedShapeKind = $state<(typeof PRIMITIVE_LIBRARY)[number]['kind'] | null>(null);
	let selectedLightKind = $state<(typeof LIGHT_LIBRARY)[number]['kind'] | null>(null);
	let selectedTextureId = $state<string | null>(null);
	let nameDraft = $state('');
	let uriDraft = $state('');
	let registering = $state(false);
	let sourceMode = $state<SourceMode>('public');
	let localFileName = $state<string | null>(null);
	let localFileError = $state<string | null>(null);
	let dropActive = $state(false);
	let fileInputElement = $state<HTMLInputElement | null>(null);

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
	const lights = $derived(
		LIGHT_LIBRARY.filter((item) => {
			const needle = query.trim().toLocaleLowerCase();
			if (!needle) return true;
			return [item.kind, item.name, item.description].some((value) =>
				value.toLocaleLowerCase().includes(needle)
			);
		})
	);
	const selectedLight = $derived(
		lights.find((item) => item.kind === selectedLightKind) ?? lights[0]
	);

	// Phase 5.2 — texture library views. Search spans name + URI; recents are
	// session-only and filtered to textures still present in the document.
	const allTextures = $derived(store.document.textures);
	const textureItems = $derived(filterTextureLibraryItems(allTextures, query));
	const orderedTextures = $derived(orderRecentlyUsedTextures(textureItems, store.recentTextureIds));
	const recentTextures = $derived(
		store.recentTextureIds
			.map((id) => allTextures.find((texture) => texture.id === id))
			.filter((texture): texture is SceneTextureAsset => texture !== undefined)
			.filter((texture) => filterTextureLibraryItems([texture], query).length > 0)
	);

	$effect(() => {
		onselectionchange?.(libraryTab === 'models' ? selectedAsset : undefined);
	});

	// Probe any document texture that has not yet been observed this session.
	// Failed probes stay session-only; Retry re-probes the same URI.
	$effect(() => {
		if (libraryTab !== 'textures') return;
		for (const texture of allTextures) {
			const state = store.textureLoadStates[texture.uri];
			if (!state) void store.probeTexture(texture.id);
		}
	});

	function selectAsset(asset: MuseumAsset) {
		selectedAssetId = asset.id;
		libraryTab = 'models';
	}

	function selectShape(item: PrimitiveLibraryItem) {
		selectedShapeKind = item.kind;
		libraryTab = 'shapes';
	}

	function selectLight(item: LightLibraryItem) {
		selectedLightKind = item.kind;
		libraryTab = 'lights';
	}

	function selectTexture(texture: SceneTextureAsset) {
		selectedTextureId = texture.id;
		libraryTab = 'textures';
	}

	function placeShape(item: PrimitiveLibraryItem) {
		store.beginPrimitivePlacement(item.kind);
	}

	function placeLight(item: LightLibraryItem) {
		store.beginLightPlacement(item.kind);
	}

	function textureLoadState(texture: SceneTextureAsset) {
		return store.textureLoadStates[texture.uri];
	}

	function isTextureReady(texture: SceneTextureAsset) {
		return store.textureLoadStates[texture.uri]?.status === 'ready';
	}

	async function submitTextureRegistration(event: SubmitEvent) {
		event.preventDefault();
		if (registering) return;
		registering = true;
		localFileError = null;
		try {
			let textureId: string | null = null;
			if (sourceMode === 'public') {
				textureId = await store.registerTexture(nameDraft, uriDraft);
			} else if (pendingLocalBytes) {
				const sniffedMime = sniffImageMime(pendingLocalBytes);
				if (!sniffedMime) {
					localFileError = 'Unsupported image format — use PNG, WebP, or JPEG';
					return;
				}
				textureId = await store.registerLocalFileTexture(
					nameDraft || pendingLocalFileName || 'Texture',
					pendingLocalBytes,
					sniffedMime
				);
			}
			if (!textureId) return;
			selectedTextureId = textureId;
			nameDraft = '';
			uriDraft = '';
			pendingLocalBytes = null;
			pendingLocalFileName = null;
			localFileName = null;
		} finally {
			registering = false;
		}
	}

	let pendingLocalBytes = $state<Uint8Array | null>(null);
	let pendingLocalFileName = $state<string | null>(null);

	async function readLocalFile(file: File) {
		localFileError = null;
		if (!file.type.startsWith('image/')) {
			localFileError = 'File must be an image (PNG, WebP, or JPEG)';
			return;
		}
		try {
			const buffer = await file.arrayBuffer();
			const bytes = new Uint8Array(buffer);
			const sniffed = sniffImageMime(bytes);
			if (!sniffed) {
				localFileError = 'Image magic bytes do not match PNG, WebP, or JPEG';
				return;
			}
			pendingLocalBytes = bytes;
			pendingLocalFileName = file.name;
			localFileName = file.name;
			if (!nameDraft.trim()) {
				// Pre-fill a sanitized name from the file's stem.
				const stem = file.name.replace(/\.[^.]+$/, '');
				nameDraft = stem || 'Texture';
			}
		} catch (err) {
			localFileError = err instanceof Error ? err.message : 'Could not read the file';
		}
	}

	async function onLocalFilePickerChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file) await readLocalFile(file);
	}

	function dragHasImageType(types: readonly string[]): boolean {
		return Array.prototype.some.call(
			types,
			(t) => typeof t === 'string' && t.startsWith('image/')
		);
	}

	function onDropZoneEnter(event: DragEvent) {
		event.preventDefault();
		if (sourceMode !== 'local') return;
		if (!dragHasImageType(event.dataTransfer?.types ?? [])) {
			if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
			return;
		}
		dropActive = true;
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
	}

	function onDropZoneLeave(event: DragEvent) {
		event.preventDefault();
		dropActive = false;
	}

	async function onDropZoneOver(event: DragEvent) {
		event.preventDefault();
		if (sourceMode !== 'local') return;
		if (!dragHasImageType(event.dataTransfer?.types ?? [])) {
			if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
			return;
		}
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
	}

	async function onDropZoneDrop(event: DragEvent) {
		event.preventDefault();
		dropActive = false;
		if (sourceMode !== 'local') return;
		const file = event.dataTransfer?.files?.[0];
		if (file) await readLocalFile(file);
	}

	function switchSourceMode(next: SourceMode) {
		sourceMode = next;
		localFileError = null;
		pendingLocalBytes = null;
		pendingLocalFileName = null;
		localFileName = null;
	}

	function retryTextureProbe(texture: SceneTextureAsset) {
		void store.probeTexture(texture.id);
	}

	function startTextureDrag(event: DragEvent, texture: SceneTextureAsset) {
		if (!isTextureReady(texture)) return;
		const transfer = event.dataTransfer;
		if (!transfer) return;
		// Custom MIME only — never publish text/plain so camera-tree and
		// timeline drop handlers stay untouched.
		transfer.setData(TEXTURE_DRAG_MIME, texture.id);
		transfer.effectAllowed = 'copy';
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
		<button
			type="button"
			role="tab"
			aria-selected={libraryTab === 'lights'}
			class:active={libraryTab === 'lights'}
			onclick={() => (libraryTab = 'lights')}
		>Lights</button>
		<button
			type="button"
			role="tab"
			aria-selected={libraryTab === 'textures'}
			class:active={libraryTab === 'textures'}
			onclick={() => (libraryTab = 'textures')}
		>Textures</button>
	</div>

	<div class="filters">
		<label>
			<span>Search</span>
			<input
				bind:value={query}
				type="search"
				placeholder={libraryTab === 'textures' ? 'Name or URI' : 'Name, ID, or category'}
			/>
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
	{:else if libraryTab === 'shapes'}
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
	{:else if libraryTab === 'lights'}
		<p class="count">{lights.length} light{lights.length === 1 ? '' : 's'}</p>
		<ul class="asset-list shape-list">
			{#each lights as light (light.kind)}
				<li>
					<button
						type="button"
						class:selected={selectedLight?.kind === light.kind}
						class:placing={store.pendingPlacementLightKind === light.kind}
						onclick={() => selectLight(light)}
						ondblclick={() => placeLight(light)}
					>
						<span class="shape-thumb" data-kind={light.kind} aria-hidden="true"></span>
						<strong>{light.name}</strong>
						<span>{light.description}</span>
					</button>
				</li>
			{/each}
		</ul>
		{#if selectedLight}
			<button
				type="button"
				class="place"
				class:active={store.pendingPlacementLightKind === selectedLight.kind}
				onclick={() => placeLight(selectedLight)}
			>
				{store.pendingPlacementLightKind === selectedLight.kind
					? 'Placing…'
					: `Place ${selectedLight.name}`}
			</button>
		{:else}
			<p class="empty">No lights match these filters.</p>
		{/if}
	{:else}
		<p class="count">{textureItems.length} texture{textureItems.length === 1 ? '' : 's'}</p>

	<form class="register" onsubmit={submitTextureRegistration}>
		<div class="register-source" role="group" aria-label="Texture source">
			<button
				type="button"
				class="source-button"
				class:active={sourceMode === 'public'}
				aria-pressed={sourceMode === 'public'}
				onclick={() => switchSourceMode('public')}
			>Public URI</button>
			<button
				type="button"
				class="source-button"
				class:active={sourceMode === 'local'}
				aria-pressed={sourceMode === 'local'}
				onclick={() => switchSourceMode('local')}
			>Local file</button>
		</div>

		<label>
			<span>Name</span>
			<input
				bind:value={nameDraft}
				type="text"
				placeholder="Warm Stone"
				autocomplete="off"
			/>
		</label>

		{#if sourceMode === 'public'}
			<label>
				<span>Public URI</span>
				<input
					bind:value={uriDraft}
					type="text"
					placeholder="/textures/warm-stone/map.png"
					autocomplete="off"
				/>
			</label>
			<button
				type="submit"
				class="register-button"
				disabled={registering || !uriDraft.trim()}
			>
				{registering ? 'Checking…' : 'Register texture'}
			</button>
			<p class="hint">Root-relative public paths only. The image must load and decode before it is registered.</p>
		{:else}
			<div class="dropzone"
				class:active={dropActive}
				role="region"
				aria-label="Drop image files to register"
				ondragenter={onDropZoneEnter}
				ondragleave={onDropZoneLeave}
				ondragover={onDropZoneOver}
				ondrop={onDropZoneDrop}
			>
				<input
					bind:this={fileInputElement}
					class="visually-hidden"
					type="file"
					accept="image/png,image/webp,image/jpeg"
					onchange={onLocalFilePickerChange}
				/>
				<button
					type="button"
					class="pick-file"
					onclick={() => fileInputElement?.click()}
					disabled={registering}
				>
					{localFileName ? `Replace ${localFileName}` : 'Choose image…'}
				</button>
				<p class="dropzone-hint">{dropActive ? 'Drop textures to import' : 'Or drag an image here'}</p>
			</div>
			<button
				type="submit"
				class="register-button"
				disabled={registering || !pendingLocalBytes}
			>
				{registering ? 'Checking…' : 'Register texture'}
			</button>
			<p class="hint">Bytes stay session-only — exporting the project as a package bundles the binary.</p>
			{#if localFileError}
				<p class="error" role="alert">{localFileError}</p>
			{/if}
		{/if}
	</form>

		{#if recentTextures.length > 0}
			<section class="recents" aria-label="Recently used textures">
				<h3>Recently used</h3>
				<ul class="recent-list">
					{#each recentTextures as texture (texture.id)}
						<li>
							<button type="button" class:selected={selectedTextureId === texture.id} onclick={() => selectTexture(texture)}>
								<span class="recent-dot" aria-hidden="true"></span>
								{texture.name}
							</button>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if orderedTextures.length > 0}
			<ul class="texture-grid">
				{#each orderedTextures as texture (texture.id)}
					{@const state = textureLoadState(texture)}
					<li class="texture-card" class:selected={selectedTextureId === texture.id}>
						<button
							type="button"
							class="thumb"
							class:selected={selectedTextureId === texture.id}
							onclick={() => selectTexture(texture)}
							ondragstart={state?.status === 'ready' ? (event) => startTextureDrag(event, texture) : undefined}
							draggable={state?.status === 'ready'}
							aria-label={`${texture.name} — ${texture.uri}`}
						>
							{#if state?.status === 'loading'}
								<span class="thumb-status" role="status">Loading…</span>
							{:else if state?.status === 'error'}
								<span class="thumb-status error" role="status">Load failed</span>
							{:else}
								<img src={texture.uri} alt="" loading="lazy" />
							{/if}
							<strong>{texture.name}</strong>
							<span class="uri">{texture.uri}</span>
						</button>
						{#if state?.status === 'error'}
							<button type="button" class="retry" onclick={() => retryTextureProbe(texture)}>Retry</button>
						{/if}
					</li>
				{/each}
			</ul>
			{#if textureItems.length === 0}
				<p class="empty">No textures match these filters.</p>
			{/if}
		{:else}
			<p class="empty">
				{textureItems.length === 0 ? 'No textures registered yet — add one above.' : ''}
			</p>
		{/if}
	{/if}
</section>

<style>
	.library, .filters { display: flex; flex-direction: column; gap: 0.65rem; }
	.library-tabs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.3rem; }
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
	.shape-thumb[data-kind='point'] {
		background: radial-gradient(circle at center, #fff4e0 0 28%, #d6b35f 29% 42%, transparent 43%), #1a1a22;
	}
	.shape-thumb[data-kind='spot'] {
		background:
			linear-gradient(180deg, #fff4e0 0 18%, transparent 19%),
			conic-gradient(from 210deg at 50% 20%, transparent 0 40%, #d6b35f 41% 59%, transparent 60%);
		background-color: #1a1a22;
	}
	.shape-thumb[data-kind='directional'] {
		background:
			linear-gradient(135deg, transparent 40%, #d6b35f 41% 59%, transparent 60%),
			linear-gradient(135deg, #fff4e0, transparent 55%),
			#1a1a22;
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

	/* Phase 5.2 — texture registration + library */
	.register { display: flex; flex-direction: column; gap: 0.45rem; padding: 0.7rem; border: 1px solid #34313a; border-radius: 0.45rem; background: #17171f; }
	.register label { display: flex; flex-direction: column; gap: 0.25rem; color: #a8a29a; font-size: 0.68rem; }
	.register input { min-width: 0; padding: 0.42rem; border: 1px solid #3a3a46; border-radius: 0.32rem; background: #1a1a22; color: #f4efe4; font: inherit; font-size: 0.74rem; }
	.register input:focus { outline: 1px solid #d6b35f; border-color: #d6b35f; }
	.register-button { padding: 0.46rem 0.58rem; border: 1px solid #8d753c; border-radius: 0.32rem; background: #242018; color: #fff2c7; font: inherit; font-size: 0.73rem; cursor: pointer; }
	.register-button:hover:not(:disabled) { background: #35301f; }
	.register-button:disabled { opacity: 0.45; cursor: default; }
	.register .hint { margin: 0; color: #918c84; font-size: 0.66rem; line-height: 1.4; }
	.recents { display: flex; flex-direction: column; gap: 0.35rem; }
	.recents h3 { margin: 0; font-size: 0.72rem; font-weight: 650; color: #d6c7a8; }
	.recent-list { display: flex; flex-direction: column; gap: 0.22rem; margin: 0; padding: 0; list-style: none; }
	.recent-list button { display: flex; align-items: center; gap: 0.4rem; padding: 0.32rem 0.42rem; border: 1px solid transparent; border-radius: 0.3rem; background: #16161d; color: #f4efe4; font: inherit; font-size: 0.72rem; text-align: left; cursor: pointer; }
	.recent-list button:hover { border-color: #3a3a46; background: #202029; }
	.recent-list button.selected { border-color: #d6b35f; background: #2a2618; }
	.recent-dot { width: 0.42rem; height: 0.42rem; border-radius: 999px; background: #d6b35f; }
	.texture-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.45rem; margin: 0; padding: 0; list-style: none; }
	.texture-card { display: flex; flex-direction: column; gap: 0.28rem; min-width: 0; }
	.thumb { display: flex; flex-direction: column; gap: 0.28rem; min-width: 0; padding: 0.4rem; border: 1px solid #3a3a46; border-radius: 0.36rem; background: #16161d; color: #f4efe4; text-align: left; cursor: pointer; }
	.thumb:hover { border-color: #5b4d2a; background: #1e1e27; }
	.thumb.selected { border-color: #d6b35f; background: #2a2618; }
	.thumb img { width: 100%; height: 4.2rem; object-fit: cover; border-radius: 0.24rem; background: #1a1a22; }
	.thumb-status { display: flex; align-items: center; justify-content: center; width: 100%; height: 4.2rem; border-radius: 0.24rem; background: #1a1a22; color: #918c84; font-size: 0.66rem; }
	.thumb-status.error { color: #efc7c7; }
	.thumb strong { font-size: 0.72rem; overflow-wrap: anywhere; }
	.thumb .uri { color: #918c84; font-size: 0.62rem; overflow-wrap: anywhere; }
	.retry { align-self: flex-start; padding: 0.26rem 0.5rem; border: 1px solid #684147; border-radius: 0.28rem; background: #21191b; color: #efc7c7; font: inherit; font-size: 0.66rem; cursor: pointer; }
	/* Phase 5.4 — local-file texture register (Source toggle + drop zone) */
	.register-source { display: grid; grid-template-columns: 1fr 1fr; gap: 0.3rem; }
	.source-button {
		padding: 0.34rem 0.5rem;
		border: 1px solid #3a3a46;
		border-radius: 0.3rem;
		background: #1a1a22;
		color: #a8a29a;
		font: inherit;
		font-size: 0.7rem;
		cursor: pointer;
	}
	.source-button.active { border-color: #d6b35f; background: #2a2618; color: #fff2c7; }
	.source-button:hover { border-color: #5b4d2a; }
	.dropzone {
		display: flex;
		flex-direction: column;
		gap: 0.32rem;
		padding: 0.55rem;
		border: 1px dashed #4a4638;
		border-radius: 0.32rem;
		background: #14141c;
	}
	.dropzone.active { border-color: #d6b35f; background: #221d11; }
	.pick-file {
		padding: 0.42rem 0.55rem;
		border: 1px solid #5b4d2a;
		border-radius: 0.3rem;
		background: #1f1c14;
		color: #fff2c7;
		font: inherit;
		font-size: 0.7rem;
		cursor: pointer;
	}
	.pick-file:hover { background: #2a2618; }
	.dropzone-hint { margin: 0; color: #918c84; font-size: 0.64rem; }
	.register .error { margin: 0; color: #efc7c7; font-size: 0.66rem; }
	.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; clip-path: inset(50%); }
	.retry:hover { background: #2c1d20; }
</style>
