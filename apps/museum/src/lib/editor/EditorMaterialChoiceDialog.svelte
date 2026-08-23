<script lang="ts">
	import { materials } from '$lib/content/materials';
	import type { MaterialId } from '$lib/types/materials';
	import type { MaterialShareMode } from './editor-types';
	import type { EditorStore } from './editor-store.svelte';

	let { store }: { store: EditorStore } = $props();

	const pending = $derived(store.pendingMaterialEdit);

	let baseMaterialId = $state<MaterialId | ''>('');
	let shareMode = $state<MaterialShareMode>('make-unique');

	// Dialog state is recreated from each request and never serialized.
	// Reading `pending` makes it a reactive dependency so a new request
	// (after a previous dialog session) resets the stale choices.
	$effect(() => {
		if (!pending) return;
		baseMaterialId = '';
		shareMode = 'make-unique';
	});

	function confirm() {
		const request = pending;
		if (!request) return;
		const decision: { baseMaterialId?: MaterialId; shareMode?: MaterialShareMode } = {};
		if (request.needsBaseMaterial && baseMaterialId) {
			decision.baseMaterialId = baseMaterialId;
		}
		if (request.sharedMaterialInstanceId) {
			decision.shareMode = shareMode;
		}
		store.confirmPendingMaterialEdit(decision);
	}

	function cancel() {
		store.cancelPendingMaterialEdit();
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !pending) return;
		event.preventDefault();
		event.stopPropagation();
		cancel();
	}
</script>

{#if pending}
	<div
		class="backdrop"
		role="presentation"
		onkeydown={onKeyDown}
	>
		<div class="dialog" role="dialog" aria-modal="true" aria-label="Material choice">
			<h2>
				{pending.needsBaseMaterial ? 'Choose base material' : 'Shared material'}
			</h2>

			{#if pending.needsBaseMaterial}
				<p class="copy">
					{pending.recentTextureId
						? 'Assigning a texture to this model needs a catalogue base material first.'
						: 'This edit needs a catalogue base material before it can be applied.'}
				</p>
				<label>
					<span>Base material</span>
					<select bind:value={baseMaterialId}>
						<option value="">Choose…</option>
						{#each materials as material}
							<option value={material.id}>{material.label}</option>
						{/each}
					</select>
				</label>
			{:else if pending.sharedMaterialInstanceId}
				<p class="copy">
					This material is shared by multiple entities. Editing it changes every entity that
					references it.
				</p>
				<fieldset>
					<legend>Apply to</legend>
					<label class="radio">
						<input type="radio" bind:group={shareMode} value="make-unique" />
						<span><strong>Make unique</strong> — clone this material for this entity only</span>
					</label>
					<label class="radio">
						<input type="radio" bind:group={shareMode} value="edit-shared" />
						<span><strong>Edit shared</strong> — change every entity using this material</span>
					</label>
				</fieldset>
			{/if}

			<div class="actions">
				<button type="button" class="secondary" onclick={cancel}>Cancel</button>
				<button
					type="button"
					class="primary"
					disabled={pending.needsBaseMaterial && !baseMaterialId}
					onclick={confirm}
				>Confirm</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.25rem;
		background: rgb(8 8 12 / 0.62);
	}
	.dialog {
		display: flex;
		width: min(24rem, 100%);
		flex-direction: column;
		gap: 0.85rem;
		padding: 1.1rem 1.2rem;
		border: 1px solid #4a4438;
		border-radius: 0.55rem;
		background: #17171f;
		color: #f4efe4;
		box-shadow: 0 1.2rem 3rem rgb(0 0 0 / 0.5);
	}
	.dialog h2 { margin: 0; font-size: 0.95rem; font-weight: 650; }
	.copy { margin: 0; color: #a8a29a; font-size: 0.74rem; line-height: 1.5; }
	.dialog label:not(.radio) { display: flex; flex-direction: column; gap: 0.28rem; color: #a8a29a; font-size: 0.7rem; }
	.dialog select {
		min-width: 0;
		padding: 0.42rem;
		border: 1px solid #3a3a46;
		border-radius: 0.32rem;
		background: #1a1a22;
		color: #f4efe4;
		font: inherit;
	}
	.dialog select:focus { outline: 1px solid #d6b35f; border-color: #d6b35f; }
	fieldset { display: flex; flex-direction: column; gap: 0.5rem; margin: 0; padding: 0.55rem 0.7rem; border: 1px solid #34313a; border-radius: 0.4rem; }
	legend { padding: 0 0.3rem; color: #918c84; font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.04em; }
	.radio { display: flex; gap: 0.5rem; align-items: flex-start; color: #d6d0c4; font-size: 0.72rem; line-height: 1.4; cursor: pointer; }
	.radio input { margin-top: 0.15rem; accent-color: #d6b35f; }
	.radio strong { color: #fff2c7; }
	.actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
	.actions button {
		padding: 0.46rem 0.7rem;
		border-radius: 0.32rem;
		font: inherit;
		font-size: 0.73rem;
		cursor: pointer;
	}
	.secondary { border: 1px solid #3a3a46; background: #1a1a22; color: #f4efe4; }
	.secondary:hover { border-color: #5b4d2a; }
	.primary { border: 1px solid #8d753c; background: #242018; color: #fff2c7; }
	.primary:hover:not(:disabled) { background: #35301f; }
	.primary:disabled { opacity: 0.45; cursor: default; }
</style>
