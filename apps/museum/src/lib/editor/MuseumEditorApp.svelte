<script lang="ts">
	import { onMount } from 'svelte';
	import { museumRooms } from '$lib/content/rooms';
	import {
		createMuseumEditorStore,
		EDITOR_BRIGHT_LIGHTING,
		EDITOR_VISITOR_LIGHTING
	} from './museum-editor.svelte';
	import EditorTransformInspector from './EditorTransformInspector.svelte';
	import EditorViewport from './EditorViewport.svelte';

	const store = createMuseumEditorStore();
	let parisOpen = $state(false);

	const selectedObject = $derived(store.selectedObject);
	const parisObjects = $derived(
		store.document.objects.filter((object) => object.roomId === 'paris')
	);

	function toggleParis() {
		store.selectRoom('paris');
		parisOpen = !parisOpen;
	}

	function selectObject(id: string) {
		parisOpen = true;
		store.selectPlacement(id);
	}

	function isEditableTarget(target: EventTarget | null) {
		if (!(target instanceof HTMLElement)) return false;
		if (target.isContentEditable) return true;
		return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
	}

	onMount(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (isEditableTarget(event.target)) return;
			const modifier = event.metaKey || event.ctrlKey;
			if (!modifier) return;

			if (event.key.toLowerCase() === 'z') {
				event.preventDefault();
				if (event.shiftKey) store.redo();
				else store.undo();
			} else if (event.ctrlKey && event.key.toLowerCase() === 'y') {
				event.preventDefault();
				store.redo();
			}
		};

		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	});
</script>

<main class="page">
	<aside class="panel outliner" aria-label="Outliner">
		<header>
			<h1>Museum editor</h1>
			<p>Phase 3 — Paris placement transforms</p>
		</header>

		<section>
			<h2>Rooms</h2>
			<ul class="rooms">
				{#each museumRooms as room (room.id)}
					<li>
						{#if room.id === 'paris'}
							<button
								type="button"
								class="room-row editable"
								class:selected={store.selectedRoomId === room.id}
								aria-expanded={parisOpen}
								onclick={toggleParis}
							>
								<span class="chevron" class:open={parisOpen}>›</span>
								<span>
									<strong>{room.title}</strong>
									<small>{room.subtitle}</small>
								</span>
							</button>

							{#if parisOpen}
								<ul class="objects" aria-label="Paris Salon objects">
									{#each parisObjects as object (object.id)}
										<li>
											<button
												type="button"
												class="object-row"
												class:selected={store.selectedPlacementId === object.id}
												onclick={() => selectObject(object.id)}
											>
												<span class="id">{object.id}</span>
												<span class="meta">{object.assetId}</span>
											</button>
										</li>
									{/each}
								</ul>
							{/if}
						{:else}
							<div class="room-row placeholder" aria-disabled="true">
								<span>
									<strong>{room.title}</strong>
									<small>Editing coming later</small>
								</span>
							</div>
						{/if}
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
			<div class="inspector-title">
				<h2>Inspector</h2>
				<div class="history" aria-label="History controls">
					<button type="button" disabled={!store.canUndo} onclick={() => store.undo()}>Undo</button>
					<button type="button" disabled={!store.canRedo} onclick={() => store.redo()}>Redo</button>
				</div>
			</div>
			{#if selectedObject}
				<p class="id">{selectedObject.id}</p>
			{:else if store.selectedRoomId === 'paris'}
				<p>Paris is centered. Select an object to edit it.</p>
			{:else}
				<p>Select Paris Salon to begin editing.</p>
			{/if}
		</header>

		{#if selectedObject}
			<section class="selection" aria-label="Selection">
				<dl>
					<div><dt>Room</dt><dd>{selectedObject.roomId}</dd></div>
					<div><dt>Asset</dt><dd class="id">{selectedObject.assetId}</dd></div>
				</dl>
				<button type="button" class="deselect" onclick={() => store.deselect()}>Deselect object</button>
			</section>
			{#key selectedObject.id}
				<EditorTransformInspector {store} />
			{/key}
		{/if}

		<section class="camera-controls" aria-label="Editor camera controls">
			<h2>Camera</h2>
			<p>Middle-drag pans. Click Paris Salon to reset the room framing.</p>
			<button
				type="button"
				class:active={store.cameraPanEnabled}
				aria-pressed={store.cameraPanEnabled}
				onclick={() => store.toggleCameraPan()}
			>
				Pan {store.cameraPanEnabled ? 'on' : 'off'}
			</button>
		</section>

		<section class="lighting" aria-label="Viewport lighting">
			<h2>Lighting</h2>
			<p>Session-only; excluded from history and visitor JSON.</p>
			<div class="presets">
				<button type="button" onclick={() => store.applyLightingPreset(EDITOR_BRIGHT_LIGHTING)}>Bright</button>
				<button type="button" onclick={() => store.applyLightingPreset(EDITOR_VISITOR_LIGHTING)}>Visitor</button>
			</div>
			<label><span>Ambient {store.ambientIntensity.toFixed(2)}</span><input type="range" min="0" max="2" step="0.05" bind:value={store.ambientIntensity} /></label>
			<label><span>Directional {store.directionalIntensity.toFixed(2)}</span><input type="range" min="0" max="3" step="0.05" bind:value={store.directionalIntensity} /></label>
			<label class="checkbox"><input type="checkbox" bind:checked={store.fogEnabled} /><span>Fog</span></label>
			{#if store.fogEnabled}
				<label><span>Fog near {store.fogNear.toFixed(0)}</span><input type="range" min="1" max="80" step="1" bind:value={store.fogNear} /></label>
				<label><span>Fog far {store.fogFar.toFixed(0)}</span><input type="range" min="5" max="120" step="1" bind:value={store.fogFar} /></label>
			{/if}
		</section>
	</aside>
</main>

<style>
	:global(body) { margin: 0; }
	.page { display: grid; grid-template-columns: minmax(17rem, 21rem) 1fr minmax(17rem, 20rem); height: 100vh; background: #0b0b10; color: #f4efe4; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
	.panel { display: flex; flex-direction: column; gap: 1rem; padding: 1rem 1.1rem; border-right: 1px solid #2a2a33; overflow: auto; background: #121218; }
	.inspector { border-right: 0; border-left: 1px solid #2a2a33; }
	header h1, header h2, section h2 { margin: 0; font-size: 0.95rem; font-weight: 650; letter-spacing: 0.02em; }
	header p, .lighting p, .meta { margin: 0.35rem 0 0; color: #a8a29a; font-size: 0.75rem; line-height: 1.4; }
	section { display: flex; flex-direction: column; gap: 0.55rem; }
	ul { list-style: none; margin: 0; padding: 0; }
	.rooms { display: flex; flex-direction: column; gap: 0.4rem; }
	.room-row { display: flex; align-items: center; gap: 0.5rem; width: 100%; box-sizing: border-box; padding: 0.55rem; border: 1px solid transparent; border-radius: 0.4rem; background: #1a1a22; color: inherit; text-align: left; }
	.room-row span:not(.chevron) { display: flex; flex-direction: column; gap: 0.12rem; }
	.room-row strong { font-size: 0.8rem; font-weight: 620; }
	.room-row small { color: #918c84; font-size: 0.7rem; }
	.room-row.editable { cursor: pointer; font: inherit; }
	.room-row.editable:hover { border-color: #4a4438; background: #22222c; }
	.room-row.selected { border-color: #d6b35f; background: #2a2618; }
	.room-row.placeholder { opacity: 0.58; }
	.chevron { color: #d6b35f; font-size: 1.15rem; transform: rotate(0); transition: transform 120ms ease; }
	.chevron.open { transform: rotate(90deg); }
	.objects { display: flex; flex-direction: column; gap: 0.28rem; margin: 0.35rem 0 0.2rem 1rem; padding-left: 0.55rem; border-left: 1px solid #36323a; }
	.object-row { display: flex; flex-direction: column; gap: 0.1rem; width: 100%; padding: 0.4rem 0.45rem; border: 1px solid transparent; border-radius: 0.3rem; background: #16161d; color: inherit; text-align: left; cursor: pointer; }
	.object-row:hover { border-color: #3a3a46; background: #202029; }
	.object-row.selected { border-color: #d6b35f; background: #2a2618; box-shadow: inset 0 0 0 1px #d6b35f; }
	.id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.75rem; }
	.center { min-width: 0; min-height: 0; }
	.back { margin-top: auto; color: #d6c7a8; font-size: 0.85rem; text-decoration: none; }
	.back:hover { text-decoration: underline; }
	.inspector-title { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
	.history, .presets { display: flex; gap: 0.35rem; }
	.history button, .presets button, .deselect, .camera-controls button { padding: 0.38rem 0.5rem; border: 1px solid #3a3a46; border-radius: 0.32rem; background: #1a1a22; color: #f4efe4; font: inherit; font-size: 0.72rem; cursor: pointer; }
	.history button:disabled { opacity: 0.4; cursor: default; }
	.selection dl { margin: 0; display: flex; flex-direction: column; gap: 0.45rem; }
	.selection dl div { display: flex; flex-direction: column; gap: 0.1rem; }
	.selection dt { color: #8f8a82; font-size: 0.67rem; text-transform: uppercase; letter-spacing: 0.04em; }
	.selection dd { margin: 0; font-size: 0.8rem; }
	.deselect { align-self: flex-start; }
	.camera-controls, .lighting { margin-top: 0.4rem; gap: 0.7rem; border-top: 1px solid #2a2a33; padding-top: 0.85rem; }
	.camera-controls p { margin: 0; color: #a8a29a; font-size: 0.75rem; line-height: 1.4; }
	.camera-controls button { align-self: flex-start; }
	.camera-controls button.active { border-color: #d6b35f; background: #2a2618; color: #fff2c7; }
	.presets button { flex: 1; }
	.lighting label { display: flex; flex-direction: column; gap: 0.3rem; color: #d6d0c4; font-size: 0.75rem; }
	.lighting label.checkbox { flex-direction: row; align-items: center; gap: 0.45rem; }
	.lighting input[type='range'] { width: 100%; }
</style>
