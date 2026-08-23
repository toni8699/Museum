<script lang="ts">
	import { materials } from '$lib/content/materials';
	import {
		isScenePrimitiveEntity,
		type ScenePrimitiveDimensions,
		type ScenePrimitiveEntity
	} from '$lib/content/scene';
	import type { MaterialId } from '$lib/types/materials';
	import EditorNumberField from './fields/EditorNumberField.svelte';
	import type { EditorStore } from './editor-store.svelte';

	let { store }: { store: EditorStore } = $props();

	const entity = $derived(
		store.selectedObject && isScenePrimitiveEntity(store.selectedObject)
			? store.selectedObject
			: undefined
	);

	let nameDraft = $state('');

	$effect(() => {
		nameDraft = entity?.name ?? '';
	});

	function commitName() {
		if (!entity) return;
		const next = nameDraft.trim();
		if (!next || next === entity.name) {
			nameDraft = entity.name;
			return;
		}
		store.updatePrimitiveName(entity.id, next);
	}

	function commitDimension(key: string, value: number) {
		if (!entity) return;
		const next = { ...entity.dimensions, [key]: value } as ScenePrimitiveDimensions;
		store.updatePrimitiveDimensions(entity.id, next);
	}

	function commitMaterial(event: Event) {
		if (!entity) return;
		const materialId = (event.currentTarget as HTMLSelectElement).value as MaterialId;
		store.updatePrimitiveMaterial(entity.id, materialId);
	}

	function commitShadow(field: 'castShadow' | 'receiveShadow', checked: boolean) {
		if (!entity) return;
		store.updatePrimitiveShadows(entity.id, { [field]: checked });
	}

	function dimensionFields(target: ScenePrimitiveEntity) {
		switch (target.primitive) {
			case 'box':
				return [
					['width', target.dimensions.width],
					['height', target.dimensions.height],
					['depth', target.dimensions.depth]
				] as const;
			case 'plane':
				return [
					['width', target.dimensions.width],
					['height', target.dimensions.height]
				] as const;
			case 'cylinder':
				return [
					['radius', target.dimensions.radius],
					['height', target.dimensions.height]
				] as const;
			case 'sphere':
				return [['radius', target.dimensions.radius]] as const;
		}
	}
</script>

{#if entity}
	<section class="primitive" aria-label="Primitive properties">
		<h2>Primitive</h2>
		<label class="name">
			<span>Name</span>
			<input
				bind:value={nameDraft}
				type="text"
				aria-label="Primitive name"
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
			<div><dt>Shape</dt><dd>{entity.primitive}</dd></div>
			<div><dt>Room</dt><dd>{entity.roomId}</dd></div>
		</dl>
		<!--
			Phase 1a — per-axis scale on primitives now rides the Transform
			inspector's chain toggle + X/Y/Z fields. `entity.dimensions` stays
			in the document untouched; it is just no longer exposed as a
			manual-input band here (avoids the W/H/D + Scale-X/Y/Z duplication).
			Call `updatePrimitiveDimensions` from code paths that need to
			override the parametric size.
		-->
		<label>
			<span>Fallback material</span>
			<select value={entity.materialId} onchange={commitMaterial}>
				{#each materials as material}
					<option value={material.id}>{material.label}</option>
				{/each}
			</select>
		</label>
		<label class="checkbox">
			<input
				type="checkbox"
				checked={entity.castShadow}
				onchange={(event) => commitShadow('castShadow', event.currentTarget.checked)}
			/>
			<span>Cast shadow</span>
		</label>
		<label class="checkbox">
			<input
				type="checkbox"
				checked={entity.receiveShadow}
				onchange={(event) => commitShadow('receiveShadow', event.currentTarget.checked)}
			/>
			<span>Receive shadow</span>
		</label>
	</section>
{/if}

<style>
	.primitive { display: flex; flex-direction: column; gap: 0.55rem; }
	.primitive h2 { margin: 0; font-size: 0.78rem; font-weight: 650; color: #d6c7a8; }
	.name, .primitive label:not(.checkbox) { display: flex; flex-direction: column; gap: 0.25rem; color: #a8a29a; font-size: 0.68rem; }
	.name input, .primitive select {
		min-width: 0;
		padding: 0.42rem;
		border: 1px solid #3a3a46;
		border-radius: 0.32rem;
		background: #1a1a22;
		color: #f4efe4;
		font: inherit;
	}
	.name input:focus, .primitive select:focus { outline: 1px solid #d6b35f; border-color: #d6b35f; }
	dl { display: grid; gap: 0.35rem; margin: 0; }
	dl div { display: grid; grid-template-columns: 5.5rem 1fr; gap: 0.4rem; align-items: baseline; }
	dt { margin: 0; color: #918c84; font-size: 0.68rem; }
	dd { margin: 0; color: #f4efe4; font-size: 0.74rem; word-break: break-word; }
	.checkbox { display: flex; align-items: center; gap: 0.45rem; color: #d6c7a8; font-size: 0.74rem; }
	.checkbox input { accent-color: #d6b35f; }
</style>
