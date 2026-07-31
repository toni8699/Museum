<script lang="ts">
	import {
		ROTATION_SNAP_DEGREES_OPTIONS,
		TRANSLATION_SNAP_STEPS
	} from './editor-placement';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let { store }: { store: MuseumEditorStore } = $props();

	const hasSelection = $derived(store.selectedPlacementId != null);

	function onTranslationStepChange(event: Event) {
		const value = Number((event.currentTarget as HTMLSelectElement).value);
		if (Number.isFinite(value)) store.sessionView.setTranslationSnap(value);
	}

	function onRotationStepChange(event: Event) {
		const value = Number((event.currentTarget as HTMLSelectElement).value);
		if (Number.isFinite(value)) store.sessionView.setRotationSnapDegrees(value);
	}

	function onTranslationSnapEnabledChange(event: Event) {
		store.sessionView.setTranslationSnapEnabled(
			(event.currentTarget as HTMLInputElement).checked
		);
	}

	function onRotationSnapEnabledChange(event: Event) {
		store.sessionView.setRotationSnapEnabled(
			(event.currentTarget as HTMLInputElement).checked
		);
	}

	function onKeepOnFloorChange(event: Event) {
		store.sessionView.setKeepOnFloor((event.currentTarget as HTMLInputElement).checked);
	}
</script>

<section class="placement" aria-label="Placement settings">
	<div class="section-heading">
		<h2>Placement</h2>
		<span>Session-only</span>
	</div>

	<label class="checkbox">
		<input
			type="checkbox"
			checked={store.translationSnapEnabled}
			onchange={onTranslationSnapEnabledChange}
		/>
		<span>Translation snap {store.translationSnapEnabled ? 'on' : 'off'}</span>
	</label>
	<label class="field">
		<span>Snap step (m)</span>
		<select
			value={store.translationSnap}
			disabled={!store.translationSnapEnabled}
			aria-label="Translation snap step"
			onchange={onTranslationStepChange}
		>
			{#each TRANSLATION_SNAP_STEPS as step (step)}
				<option value={step}>{step}</option>
			{/each}
		</select>
	</label>

	<label class="checkbox">
		<input
			type="checkbox"
			checked={store.rotationSnapEnabled}
			onchange={onRotationSnapEnabledChange}
		/>
		<span>Rotation snap {store.rotationSnapEnabled ? 'on' : 'off'}</span>
	</label>
	<label class="field">
		<span>Snap angle</span>
		<select
			value={store.rotationSnapDegrees}
			disabled={!store.rotationSnapEnabled}
			aria-label="Rotation snap angle"
			onchange={onRotationStepChange}
		>
			{#each ROTATION_SNAP_DEGREES_OPTIONS as degrees (degrees)}
				<option value={degrees}>{degrees}°</option>
			{/each}
		</select>
	</label>

	<label class="checkbox">
		<input type="checkbox" checked={store.keepOnFloor} onchange={onKeepOnFloorChange} />
		<span
			>Keep {store.selectedPlacementIds.length > 1 ? 'group' : 'selection'} on floor {store.keepOnFloor
				? 'on'
				: 'off'}</span
		>
	</label>

	<button
		type="button"
		class="drop"
		disabled={!hasSelection}
		onclick={() => store.requestDropToFloor()}
	>
		Drop to Floor
	</button>
	<p class="hint">End drops each selected object. F reframes. Hold Shift while dragging to bypass snaps.</p>

	{#if store.statusMessage}
		<p class="status" role="status">{store.statusMessage}</p>
	{/if}
</section>

<style>
	.placement {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		margin-top: 0.35rem;
		padding-top: 0.85rem;
		border-top: 1px solid #2a2a33;
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

	.checkbox,
	.field {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		color: #d6d0c4;
		font-size: 0.75rem;
	}

	.field {
		flex-direction: column;
		align-items: stretch;
		gap: 0.28rem;
	}

	select {
		padding: 0.35rem 0.4rem;
		border: 1px solid #3a3a46;
		border-radius: 0.3rem;
		background: #1a1a22;
		color: #f4efe4;
		font: inherit;
		font-size: 0.75rem;
	}

	select:disabled {
		opacity: 0.45;
	}

	.drop {
		align-self: flex-start;
		padding: 0.42rem 0.55rem;
		border: 1px solid #3a3a46;
		border-radius: 0.32rem;
		background: #1a1a22;
		color: #f4efe4;
		font: inherit;
		font-size: 0.72rem;
		cursor: pointer;
	}

	.drop:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.drop:not(:disabled):hover {
		border-color: #d6b35f;
		background: #2a2618;
	}

	.hint,
	.status {
		margin: 0;
		color: #a8a29a;
		font-size: 0.7rem;
		line-height: 1.4;
	}

	.status {
		color: #e7c87a;
	}
</style>
