<script lang="ts">
	import {
		createMuseumEditorStore,
		EDITOR_BRIGHT_LIGHTING,
		EDITOR_VISITOR_LIGHTING
	} from './museum-editor.svelte';
	import EditorViewport from './EditorViewport.svelte';

	const store = createMuseumEditorStore();

	const selectedObject = $derived(store.selectedObject);
</script>

<main class="page">
	<aside class="panel outliner" aria-label="Outliner">
		<header>
			<h1>Museum editor</h1>
			<p>Phase 2 — placement selection</p>
		</header>

		<section>
			<h2>Objects ({store.objectCount})</h2>
			<ul>
				{#each store.document.objects as object (object.id)}
					<li>
						<button
							type="button"
							class="outliner-item"
							class:selected={store.selectedPlacementId === object.id}
							onclick={() => store.selectPlacement(object.id)}
						>
							<span class="id">{object.id}</span>
							<span class="meta">{object.roomId} · {object.assetId}</span>
						</button>
					</li>
				{/each}
			</ul>
		</section>

		<section>
			<h2>Nodes ({store.nodeCount})</h2>
			<ul>
				{#each store.document.navigationNodes as node (node.id)}
					<li class="node-item">
						<span class="id">{node.id}</span>
						<span class="meta">{node.roomId} · {node.label}</span>
					</li>
				{/each}
			</ul>
		</section>

		<a class="back" href="/museum">Back to museum</a>
	</aside>

	<div class="center">
		<EditorViewport {store} />
	</div>

	<aside class="panel inspector" aria-label="Inspector">
		<header>
			<h2>Inspector</h2>
			{#if selectedObject}
				<p>Selected placement (transforms in Phase 3).</p>
			{:else}
				<p>Select a placement in the outliner or viewport.</p>
			{/if}
		</header>

		{#if selectedObject}
			<section class="selection" aria-label="Selection">
				<h2>Selection</h2>
				<dl>
					<div>
						<dt>Id</dt>
						<dd class="id">{selectedObject.id}</dd>
					</div>
					<div>
						<dt>Room</dt>
						<dd>{selectedObject.roomId}</dd>
					</div>
					<div>
						<dt>Asset</dt>
						<dd class="id">{selectedObject.assetId}</dd>
					</div>
				</dl>
				<button type="button" class="deselect" onclick={() => store.deselect()}>
					Deselect
				</button>
			</section>
		{/if}

		<section class="lighting" aria-label="Viewport lighting">
			<h2>Lighting</h2>
			<p>Session-only. Does not change visitor `/museum` or scene JSON.</p>

			<div class="presets">
				<button
					type="button"
					onclick={() => store.applyLightingPreset(EDITOR_BRIGHT_LIGHTING)}
				>
					Bright
				</button>
				<button
					type="button"
					onclick={() => store.applyLightingPreset(EDITOR_VISITOR_LIGHTING)}
				>
					Visitor
				</button>
			</div>

			<label>
				<span>Ambient {store.ambientIntensity.toFixed(2)}</span>
				<input
					type="range"
					min="0"
					max="2"
					step="0.05"
					bind:value={store.ambientIntensity}
				/>
			</label>

			<label>
				<span>Directional {store.directionalIntensity.toFixed(2)}</span>
				<input
					type="range"
					min="0"
					max="3"
					step="0.05"
					bind:value={store.directionalIntensity}
				/>
			</label>

			<label class="checkbox">
				<input type="checkbox" bind:checked={store.fogEnabled} />
				<span>Fog</span>
			</label>

			{#if store.fogEnabled}
				<label>
					<span>Fog near {store.fogNear.toFixed(0)}</span>
					<input type="range" min="1" max="80" step="1" bind:value={store.fogNear} />
				</label>
				<label>
					<span>Fog far {store.fogFar.toFixed(0)}</span>
					<input type="range" min="5" max="120" step="1" bind:value={store.fogFar} />
				</label>
			{/if}
		</section>
	</aside>
</main>

<style>
	:global(body) {
		margin: 0;
	}

	.page {
		display: grid;
		grid-template-columns: minmax(16rem, 20rem) 1fr minmax(14rem, 18rem);
		height: 100vh;
		background: #0b0b10;
		color: #f4efe4;
		font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
	}

	.panel {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem 1.1rem;
		border-right: 1px solid #2a2a33;
		overflow: auto;
		background: #121218;
	}

	.inspector {
		border-right: 0;
		border-left: 1px solid #2a2a33;
	}

	header h1,
	header h2,
	section h2 {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 650;
		letter-spacing: 0.02em;
	}

	header p,
	.meta {
		margin: 0.35rem 0 0;
		color: #a8a29a;
		font-size: 0.78rem;
		line-height: 1.4;
	}

	section {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.outliner-item,
	.node-item {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		width: 100%;
		padding: 0.45rem 0.5rem;
		border-radius: 0.35rem;
		background: #1a1a22;
		border: 1px solid transparent;
		color: inherit;
		text-align: left;
		font: inherit;
	}

	.outliner-item {
		cursor: pointer;
	}

	.outliner-item:hover {
		border-color: #3a3a46;
		background: #22222c;
	}

	.outliner-item.selected {
		border-color: #d6b35f;
		background: #2a2618;
		box-shadow: inset 0 0 0 1px #d6b35f;
	}

	.id {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.78rem;
	}

	.center {
		min-width: 0;
		min-height: 0;
	}

	.back {
		margin-top: auto;
		color: #d6c7a8;
		font-size: 0.85rem;
		text-decoration: none;
	}

	.back:hover {
		text-decoration: underline;
	}

	.selection dl {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}

	.selection dl div {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.selection dt {
		color: #a8a29a;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.selection dd {
		margin: 0;
		font-size: 0.85rem;
	}

	.deselect {
		align-self: flex-start;
		padding: 0.4rem 0.55rem;
		border: 1px solid #3a3a46;
		border-radius: 0.35rem;
		background: #1a1a22;
		color: #f4efe4;
		font: inherit;
		font-size: 0.8rem;
		cursor: pointer;
	}

	.deselect:hover {
		border-color: #6b6458;
		background: #22222c;
	}

	.lighting {
		gap: 0.75rem;
	}

	.presets {
		display: flex;
		gap: 0.45rem;
	}

	.presets button {
		flex: 1;
		padding: 0.4rem 0.55rem;
		border: 1px solid #3a3a46;
		border-radius: 0.35rem;
		background: #1a1a22;
		color: #f4efe4;
		font: inherit;
		font-size: 0.8rem;
		cursor: pointer;
	}

	.presets button:hover {
		border-color: #6b6458;
		background: #22222c;
	}

	.lighting label {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-size: 0.8rem;
		color: #d6d0c4;
	}

	.lighting label.checkbox {
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
	}

	.lighting input[type='range'] {
		width: 100%;
	}
</style>
