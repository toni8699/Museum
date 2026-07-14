<script lang="ts">
	import EditorNumberField from './EditorNumberField.svelte';
	import {
		degreesToRadians,
		MIN_PLACEMENT_SCALE,
		radiansToDegrees,
		type PlacementTransform
	} from './editor-transform';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let { store }: { store: MuseumEditorStore } = $props();

	const selectedObject = $derived(store.selectedObject);
	const transform = $derived(store.selectedTransform);

	function commitTransform(next: PlacementTransform) {
		const id = selectedObject?.id;
		if (!id) return;
		store.commitPlacementTransform(id, next);
	}

	function setPosition(index: 0 | 1 | 2, value: number) {
		if (!transform) return;
		const next: PlacementTransform = {
			...transform,
			position: [...transform.position],
			rotation: [...transform.rotation]
		};
		next.position[index] = value;
		commitTransform(next);
	}

	function setRotation(index: 0 | 1 | 2, degrees: number) {
		if (!transform) return;
		const next: PlacementTransform = {
			...transform,
			position: [...transform.position],
			rotation: [...transform.rotation]
		};
		next.rotation[index] = degreesToRadians(degrees);
		commitTransform(next);
	}

	function setScale(value: number) {
		if (!transform) return;
		commitTransform({
			...transform,
			position: [...transform.position],
			rotation: [...transform.rotation],
			scale: value
		});
	}
</script>

{#if selectedObject && transform}
	<section class="transform" aria-label="Placement transform">
		<div class="section-heading">
			<h2>Transform</h2>
			<span>Room-local</span>
		</div>

		<div class="modes" aria-label="Transform mode">
			{#each ['translate', 'rotate', 'scale'] as mode}
				<button
					type="button"
					class:active={store.transformMode === mode}
					aria-pressed={store.transformMode === mode}
					onclick={() => (store.transformMode = mode as typeof store.transformMode)}
				>
					{mode[0]!.toUpperCase() + mode.slice(1)}
				</button>
			{/each}
		</div>

		<div class="axis-legend" aria-label="Gizmo axis colors">
			<span class="x">X</span><span>Red</span>
			<span class="y">Y</span><span>Green</span>
			<span class="z">Z</span><span>Blue</span>
		</div>

		<fieldset>
			<legend>Position (m)</legend>
			<div class="field-grid">
				<EditorNumberField label="X" value={transform.position[0]} step={0.01} oncommit={(value) => setPosition(0, value)} />
				<EditorNumberField label="Y" value={transform.position[1]} step={0.01} oncommit={(value) => setPosition(1, value)} />
				<EditorNumberField label="Z" value={transform.position[2]} step={0.01} oncommit={(value) => setPosition(2, value)} />
			</div>
		</fieldset>

		<fieldset>
			<legend>Rotation (degrees)</legend>
			<div class="field-grid">
				<EditorNumberField label="X" value={radiansToDegrees(transform.rotation[0])} step={1} fractionDigits={2} oncommit={(value) => setRotation(0, value)} />
				<EditorNumberField label="Y" value={radiansToDegrees(transform.rotation[1])} step={1} fractionDigits={2} oncommit={(value) => setRotation(1, value)} />
				<EditorNumberField label="Z" value={radiansToDegrees(transform.rotation[2])} step={1} fractionDigits={2} oncommit={(value) => setRotation(2, value)} />
			</div>
		</fieldset>

		<fieldset>
			<legend>Uniform scale</legend>
			<EditorNumberField label="Scale" value={transform.scale} step={0.01} min={MIN_PLACEMENT_SCALE} oncommit={setScale} />
		</fieldset>
	</section>
{/if}

<style>
	.transform {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
	}

	.section-heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}

	h2 {
		margin: 0;
		font-size: 0.9rem;
	}

	.section-heading span {
		color: #8d887f;
		font-size: 0.68rem;
	}

	.modes {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.35rem;
	}

	.modes button {
		padding: 0.42rem 0.3rem;
		border: 1px solid #3a3a46;
		border-radius: 0.3rem;
		background: #1a1a22;
		color: #ddd6ca;
		font: inherit;
		font-size: 0.72rem;
		cursor: pointer;
	}

	.modes button.active {
		border-color: #d6b35f;
		background: #2a2618;
		color: #fff2c7;
	}

	.axis-legend {
		display: grid;
		grid-template-columns: auto 1fr auto 1fr auto 1fr;
		align-items: center;
		gap: 0.25rem;
		color: #8d887f;
		font-size: 0.67rem;
	}

	.axis-legend .x,
	.axis-legend .y,
	.axis-legend .z {
		font-weight: 750;
	}

	.axis-legend .x { color: #ff4b4b; }
	.axis-legend .y { color: #35d765; }
	.axis-legend .z { color: #4d7dff; }

	fieldset {
		margin: 0;
		padding: 0.65rem;
		border: 1px solid #2e2e37;
		border-radius: 0.4rem;
	}

	legend {
		padding: 0 0.25rem;
		color: #bbb4a8;
		font-size: 0.72rem;
	}

	.field-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.35rem;
	}
</style>
