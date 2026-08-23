<script lang="ts">
	import { isSceneLightEntity } from '$lib/content/scene';
	import EditorNumberField from './fields/EditorNumberField.svelte';
	import type { EditorStore } from './editor-store.svelte';

	let { store }: { store: EditorStore } = $props();

	const entity = $derived(
		store.selectedObject && isSceneLightEntity(store.selectedObject)
			? store.selectedObject
			: undefined
	);

	let nameDraft = $state('');
	let colorDraft = $state('#ffffff');

	$effect(() => {
		nameDraft = entity?.name ?? '';
		colorDraft = entity?.color ?? '#ffffff';
	});

	function commitName() {
		if (!entity) return;
		const next = nameDraft.trim();
		if (!next || next === entity.name) {
			nameDraft = entity.name;
			return;
		}
		if (!store.updateLightName(entity.id, next)) {
			nameDraft = entity.name;
		}
	}

	function commitColor() {
		if (!entity) return;
		const next = colorDraft.trim();
		if (!next || next === entity.color) {
			colorDraft = entity.color;
			return;
		}
		if (!store.updateLightFields(entity.id, { color: next })) {
			colorDraft = entity.color;
		}
	}

	function commitIntensity(value: number) {
		if (!entity) return;
		store.updateLightFields(entity.id, { intensity: value });
	}

	function commitRange(value: number) {
		if (!entity) return;
		store.updateLightFields(entity.id, { range: value });
	}

	function commitAngle(value: number) {
		if (!entity) return;
		store.updateLightFields(entity.id, { angle: Math.min(value, Math.PI) });
	}

	function commitPenumbra(value: number) {
		if (!entity) return;
		store.updateLightFields(entity.id, { penumbra: Math.min(Math.max(value, 0), 1) });
	}

	function commitCastShadow(checked: boolean) {
		if (!entity) return;
		store.updateLightFields(entity.id, { castShadow: checked });
	}
</script>

{#if entity}
	<section class="light" aria-label="Light properties">
		<h2>Light</h2>
		<label class="name">
			<span>Name</span>
			<input
				bind:value={nameDraft}
				type="text"
				aria-label="Light name"
				onblur={commitName}
				onkeydown={(event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						commitName();
						(event.currentTarget as HTMLInputElement).blur();
					}
				}}
			/>
		</label>
		<dl>
			<div><dt>Type</dt><dd>{entity.light}</dd></div>
			<div><dt>Room</dt><dd>{entity.roomId}</dd></div>
		</dl>
		<label class="color">
			<span>Color</span>
			<div class="color-row">
				<input
					type="color"
					value={entity.color}
					aria-label="Light color picker"
					onchange={(event) => {
						colorDraft = event.currentTarget.value;
						commitColor();
					}}
				/>
				<input
					bind:value={colorDraft}
					type="text"
					spellcheck="false"
					aria-label="Light color hex"
					onblur={commitColor}
					onkeydown={(event) => {
						if (event.key === 'Enter') {
							event.preventDefault();
							commitColor();
							(event.currentTarget as HTMLInputElement).blur();
						}
					}}
				/>
			</div>
		</label>
		<EditorNumberField
			label="Intensity"
			value={entity.intensity}
			step={0.05}
			min={0}
			oncommit={commitIntensity}
		/>
		{#if entity.light === 'point' || entity.light === 'spot'}
			<EditorNumberField
				label="Range"
				value={entity.range ?? 8}
				step={0.1}
				min={0.01}
				oncommit={commitRange}
			/>
		{/if}
		{#if entity.light === 'spot'}
			<EditorNumberField
				label="Angle (rad)"
				value={entity.angle}
				step={0.01}
				min={0.01}
				oncommit={commitAngle}
			/>
			<EditorNumberField
				label="Penumbra"
				value={entity.penumbra ?? 0}
				step={0.01}
				min={0}
				oncommit={commitPenumbra}
			/>
		{/if}
		<label class="checkbox">
			<input
				type="checkbox"
				checked={entity.castShadow}
				onchange={(event) => commitCastShadow(event.currentTarget.checked)}
			/>
			<span>Cast shadow</span>
		</label>
	</section>
{/if}

<style>
	.light { display: flex; flex-direction: column; gap: 0.55rem; }
	.light h2 { margin: 0; font-size: 0.78rem; font-weight: 650; color: #d6c7a8; }
	.name, .color { display: flex; flex-direction: column; gap: 0.25rem; color: #a8a29a; font-size: 0.68rem; }
	.name input, .color input[type='text'] {
		min-width: 0;
		padding: 0.42rem;
		border: 1px solid #3a3a46;
		border-radius: 0.32rem;
		background: #1a1a22;
		color: #f4efe4;
		font: inherit;
	}
	.name input:focus, .color input[type='text']:focus { outline: 1px solid #d6b35f; border-color: #d6b35f; }
	.color-row { display: flex; gap: 0.4rem; align-items: center; }
	.color-row input[type='color'] {
		width: 2.2rem;
		height: 2rem;
		padding: 0;
		border: 1px solid #3a3a46;
		border-radius: 0.28rem;
		background: #1a1a22;
		cursor: pointer;
	}
	dl { display: grid; gap: 0.35rem; margin: 0; }
	dl div { display: grid; grid-template-columns: 5.5rem 1fr; gap: 0.4rem; align-items: baseline; }
	dt { margin: 0; color: #918c84; font-size: 0.68rem; }
	dd { margin: 0; color: #f4efe4; font-size: 0.74rem; word-break: break-word; }
	.checkbox { display: flex; align-items: center; gap: 0.45rem; color: #d6c7a8; font-size: 0.74rem; }
	.checkbox input { accent-color: #d6b35f; }
</style>
