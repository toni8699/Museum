<script lang="ts">
	import { museumMaterials } from '$lib/content/materials';
	import type { MaterialId } from '$lib/types/materials';
	import {
		isSceneModelEntity,
		isScenePrimitiveEntity,
		type SceneModelEntity,
		type ScenePrimitiveEntity
	} from '$lib/content/scene';
	import { materialInstanceUsageCount } from './editor-textures';
	import EditorNumberField from './EditorNumberField.svelte';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let { store }: { store: MuseumEditorStore } = $props();

	type MaterialTarget = SceneModelEntity | ScenePrimitiveEntity;

	const target = $derived.by<MaterialTarget | undefined>(() => {
		const selected = store.selectedObject;
		if (!selected) return undefined;
		if (isSceneModelEntity(selected) || isScenePrimitiveEntity(selected)) return selected;
		return undefined;
	});

	const instance = $derived(
		target?.materialInstanceId
			? store.document.materials.find(
					(material) => material.id === target!.materialInstanceId
			  )
			: undefined
	);
	const usageCount = $derived(
		target?.materialInstanceId
			? materialInstanceUsageCount(store.document, target.materialInstanceId!)
			: 0
	);
	const isShared = $derived(usageCount > 1);

	// Roughness / metalness draft overrides. `undefined` means "Use base".
	let roughnessDraft = $state<number | undefined>();
	let metalnessDraft = $state<number | undefined>();

	$effect(() => {
		roughnessDraft = instance?.roughness;
		metalnessDraft = instance?.metalness;
	});

	function requestBaseMaterial(event: Event) {
		if (!target) return;
		const materialId = (event.currentTarget as HTMLSelectElement).value as MaterialId;
		if (!materialId) return;
		store.requestMaterialEdit(target.id, { baseMaterialId: materialId });
	}

	function requestBaseTexture(event: Event) {
		if (!target) return;
		const value = (event.currentTarget as HTMLSelectElement).value;
		// Choosing None on an entity without an instance is a no-op.
		if (!value && !instance) return;
		store.requestMaterialEdit(target.id, { baseTextureId: value || null });
	}

	function commitRoughness(value: number) {
		if (!target) return;
		store.requestMaterialEdit(target.id, { roughness: value });
	}

	function commitMetalness(value: number) {
		if (!target) return;
		store.requestMaterialEdit(target.id, { metalness: value });
	}

	function clearRoughness() {
		if (!target) return;
		store.requestMaterialEdit(target.id, { roughness: null });
	}

	function clearMetalness() {
		if (!target) return;
		store.requestMaterialEdit(target.id, { metalness: null });
	}

	function makeUnique() {
		if (!target) return;
		store.makeMaterialInstanceUnique(target.id);
	}
</script>

{#if target}
	<section class="material" aria-label="Material properties">
		<h2>Material</h2>
		{#if instance}
			<p class="instance-name">{instance.name} <span class="id">{instance.id}</span></p>
		{:else}
			<p class="instance-name muted">No material instance yet</p>
		{/if}

		<label>
			<span>Base material</span>
			<select
				value={instance?.baseMaterialId ?? (target.kind === 'primitive' ? target.materialId : '')}
				onchange={requestBaseMaterial}
			>
				<option value="" disabled>Choose base material…</option>
				{#each museumMaterials as material}
					<option value={material.id}>{material.label}</option>
				{/each}
			</select>
		</label>

		<label>
			<span>Base texture</span>
			<select value={instance?.baseTextureId ?? ''} onchange={requestBaseTexture}>
				<option value="">None</option>
				{#each store.document.textures as texture (texture.id)}
					<option value={texture.id}>{texture.name}</option>
				{/each}
			</select>
		</label>

		<div class="overrides">
			<div class="override-row">
				<EditorNumberField
					label={instance?.roughness === undefined ? 'Roughness · Use base' : 'Roughness'}
					value={roughnessDraft ?? 0.5}
					step={0.05}
					min={0}
					oncommit={commitRoughness}
				/>
				{#if instance?.roughness !== undefined}
					<button type="button" class="clear" onclick={clearRoughness} title="Use base">Use base</button>
				{/if}
			</div>
			<div class="override-row">
				<EditorNumberField
					label={instance?.metalness === undefined ? 'Metalness · Use base' : 'Metalness'}
					value={metalnessDraft ?? 0.5}
					step={0.05}
					min={0}
					oncommit={commitMetalness}
				/>
				{#if instance?.metalness !== undefined}
					<button type="button" class="clear" onclick={clearMetalness} title="Use base">Use base</button>
				{/if}
			</div>
		</div>

		{#if isShared}
			<p class="shared-note" role="status">
				Shared by {usageCount} entities.
				<button type="button" class="unique" onclick={makeUnique}>Make unique</button>
			</p>
		{/if}
	</section>
{/if}

<style>
	.material { display: flex; flex-direction: column; gap: 0.55rem; }
	.material h2 { margin: 0; font-size: 0.78rem; font-weight: 650; color: #d6c7a8; }
	.material label { display: flex; flex-direction: column; gap: 0.25rem; color: #a8a29a; font-size: 0.68rem; }
	.material select {
		min-width: 0;
		padding: 0.42rem;
		border: 1px solid #3a3a46;
		border-radius: 0.32rem;
		background: #1a1a22;
		color: #f4efe4;
		font: inherit;
	}
	.material select:focus { outline: 1px solid #d6b35f; border-color: #d6b35f; }
	.instance-name { margin: 0; font-size: 0.74rem; color: #f4efe4; overflow-wrap: anywhere; }
	.instance-name.muted { color: #918c84; }
	.instance-name .id { color: #918c84; font-size: 0.64rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
	.overrides { display: grid; gap: 0.45rem; }
	.override-row { display: flex; align-items: end; gap: 0.4rem; }
	.override-row :global(label) { flex: 1; }
	.clear {
		padding: 0.34rem 0.5rem;
		border: 1px solid #3a3a46;
		border-radius: 0.3rem;
		background: #1a1a22;
		color: #a8a29a;
		font: inherit;
		font-size: 0.66rem;
		cursor: pointer;
	}
	.clear:hover { border-color: #d6b35f; color: #fff2c7; }
	.shared-note { margin: 0; color: #d6c7a8; font-size: 0.72rem; line-height: 1.5; }
	.unique {
		margin-left: 0.2rem;
		padding: 0.3rem 0.5rem;
		border: 1px solid #8d753c;
		border-radius: 0.3rem;
		background: #242018;
		color: #fff2c7;
		font: inherit;
		font-size: 0.68rem;
		cursor: pointer;
	}
	.unique:hover { background: #35301f; }
</style>
