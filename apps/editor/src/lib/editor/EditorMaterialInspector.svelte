<script lang="ts">
	import { materials } from '$lib/content/materials';
	import type { MaterialId } from '$lib/types/materials';
	import {
		isSceneModelEntity,
		isScenePrimitiveEntity,
		type SceneModelEntity,
		type ScenePrimitiveEntity
	} from '$lib/content/scene';
	import { materialInstanceUsageCount } from './editor-textures';
	import { BinaryTextureStore } from './store/binary-texture-store.svelte';
	import EditorNumberField from './fields/EditorNumberField.svelte';
	import type { EditorStore } from './editor-store.svelte';

	let { store }: { store: EditorStore } = $props();

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

	// Phase 5.4 — flag the inspector when the active material instance's base
	// texture only resolves through the binary store. Reactive: tracks
	// `BinaryTextureStore` membership changes via the helper's Map read.
	const assignedTextureUri = $derived.by(() => {
		const baseTextureId = instance?.baseTextureId;
		if (!baseTextureId) return null;
		return store.document.textures.find((t) => t.id === baseTextureId)?.uri ?? null;
	});
	const isLocalBinary = $derived(
		assignedTextureUri !== null && BinaryTextureStore.has(assignedTextureUri)
	);
	const packageHelpId = 'material-local-binary-help';

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
				{#each materials as material}
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
			{#if isLocalBinary}
				<p
					class="local-binary"
					role="status"
					aria-describedby={packageHelpId}
				>
					<span class="local-binary-dot" aria-hidden="true"></span>
					Local — requires package on save
					<span id={packageHelpId} class="visually-hidden">
						Textures registered from a local file are not embedded in plain JSON exports.
						Use Export package to save a self-contained archive.
					</span>
				</p>
			{/if}
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
	.material h2 { margin: 0; font-size: 0.78rem; font-weight: 650; color: var(--editor-text-secondary); }
	.material label { display: flex; flex-direction: column; gap: 0.25rem; color: var(--editor-text-secondary); font-size: 0.68rem; }
	.material select {
		min-width: 0;
		padding: 0.42rem;
		border: 1px solid var(--editor-border-normal);
		border-radius: 0.32rem;
		background: var(--editor-bg-panel-raised);
		color: var(--editor-text-primary);
		font: inherit;
	}
	.material select:focus { outline: 1px solid var(--editor-accent); border-color: var(--editor-accent); }
	.instance-name { margin: 0; font-size: 0.74rem; color: var(--editor-text-primary); overflow-wrap: anywhere; }
	.instance-name.muted { color: var(--editor-text-muted); }
	.instance-name .id { color: var(--editor-text-muted); font-size: 0.64rem; font-family: var(--editor-font); }
	.overrides { display: grid; gap: 0.45rem; }
	.override-row { display: flex; align-items: end; gap: 0.4rem; }
	.override-row :global(label) { flex: 1; }
	.clear {
		padding: 0.34rem 0.5rem;
		border: 1px solid var(--editor-border-normal);
		border-radius: 0.3rem;
		background: var(--editor-bg-panel-raised);
		color: var(--editor-text-secondary);
		font: inherit;
		font-size: 0.66rem;
		cursor: pointer;
	}
	.clear:hover { border-color: var(--editor-accent); color: var(--editor-text-primary); }
	.shared-note { margin: 0; color: var(--editor-text-secondary); font-size: 0.72rem; line-height: 1.5; }
	.unique {
		margin-left: 0.2rem;
		padding: 0.3rem 0.5rem;
		border: 1px solid var(--editor-accent-border);
		border-radius: 0.3rem;
		background: var(--editor-bg-control);
		color: var(--editor-text-primary);
		font: inherit;
		font-size: 0.68rem;
		cursor: pointer;
	}
	.unique:hover { background: var(--editor-bg-hover); }

	/* Phase 5.4 — local-only-texture chip */
	.local-binary {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0.32rem 0 0;
		padding: 0.32rem 0.5rem;
		border: 1px solid var(--editor-danger-border);
		border-radius: 0.3rem;
		background: var(--editor-danger-soft);
		color: var(--editor-danger-fg);
		font-size: 0.66rem;
		line-height: 1.4;
	}
	.local-binary-dot { width: 0.38rem; height: 0.38rem; border-radius: 999px; background: var(--editor-danger); flex: 0 0 auto; }
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		clip-path: inset(50%);
	}
</style>
