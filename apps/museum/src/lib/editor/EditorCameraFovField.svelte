<script lang="ts">
	import { MUSEUM_CAMERA_FOV } from '$lib/types/museum';
	import {
		CAMERA_LENS_PRESETS,
		findMatchingLensPreset,
		FOV_COPY,
		type LensPreset
	} from './editor-camera-framing-authoring';

	let {
		value,
		showLensPresets = false,
		disabled = false,
		oncommit
	}: {
		value: number;
		showLensPresets?: boolean;
		disabled?: boolean;
		oncommit: (value: number) => boolean | void;
	} = $props();

	let draft = $state('');
	let dirty = $state(false);
	let editing = $state(false);

	function restore() {
		draft = String(value);
		dirty = false;
	}

	$effect(() => {
		if (!editing && !dirty) restore();
	});

	function commit() {
		if (disabled || !dirty) {
			editing = false;
			restore();
			return false;
		}
		const fov = Number(draft);
		if (
			!Number.isFinite(fov) ||
			fov < MUSEUM_CAMERA_FOV.min ||
			fov > MUSEUM_CAMERA_FOV.max
		) {
			editing = false;
			restore();
			return false;
		}
		const committed = oncommit(fov);
		editing = false;
		dirty = false;
		if (committed === false) restore();
		return committed !== false;
	}

	function onNumberKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			(event.currentTarget as HTMLInputElement).blur();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			restore();
			(event.currentTarget as HTMLInputElement).select();
		}
	}

	function updateDraft(event: Event) {
		draft = (event.currentTarget as HTMLInputElement).value;
		dirty = true;
	}
</script>

<fieldset {disabled}>
	<legend>Vertical FOV</legend>
	<div class="fov-fields">
		<label>
			<span>Degrees</span>
			<input
				type="number"
				min={MUSEUM_CAMERA_FOV.min}
				max={MUSEUM_CAMERA_FOV.max}
				step="0.1"
				value={draft}
				onfocus={() => (editing = true)}
				oninput={updateDraft}
				onblur={commit}
				onkeydown={onNumberKeyDown}
			/>
		</label>
		<input
			class="range"
			type="range"
			aria-label="Vertical FOV range"
			min={MUSEUM_CAMERA_FOV.min}
			max={MUSEUM_CAMERA_FOV.max}
			step="0.1"
			value={draft || value}
			oninput={updateDraft}
			onchange={commit}
		/>
	</div>
	{#if showLensPresets}
		<div class="lens-presets" aria-label="Lens presets">
			{#each CAMERA_LENS_PRESETS as preset (preset.name)}
				<button
					type="button"
					class="lens-btn"
					class:active={findMatchingLensPreset(value)?.name === preset.name}
					{disabled}
					onclick={() => oncommit(preset.verticalFovDegrees)}
				>{preset.label}</button>
			{/each}
		</div>
		<p class="fov-copy">
			<span>{FOV_COPY.largerWider}</span>
			<span>{FOV_COPY.smallerTighter}</span>
		</p>
	{/if}
</fieldset>

<style>
	fieldset { margin: 0; padding: 0.65rem; border: 1px solid #2e2e37; border-radius: 0.4rem; }
	fieldset:disabled { opacity: 0.52; }
	legend { padding: 0 0.25rem; color: #bbb4a8; font-size: 0.72rem; }
	.fov-fields, label { display: flex; flex-direction: column; gap: 0.35rem; }
	label span { color: #aaa49a; font-size: 0.67rem; letter-spacing: 0.04em; text-transform: uppercase; }
	input[type='number'] { width: 100%; box-sizing: border-box; padding: 0.42rem 0.45rem; border: 1px solid #3a3a46; border-radius: 0.3rem; background: #0d0d12; color: #f4efe4; font: 0.76rem ui-monospace, SFMono-Regular, Menlo, monospace; }
	input:focus { outline: 1px solid #d6b35f; border-color: #d6b35f; }
	.range { width: 100%; margin: 0.15rem 0 0; }
	.lens-presets { display: flex; gap: 0.25rem; margin-top: 0.4rem; }
	.lens-btn {
		padding: 0.25rem 0.4rem;
		border: 1px solid #3a3a46;
		border-radius: 0.28rem;
		background: #1a1a22;
		color: #b7b1a4;
		font: inherit;
		font-size: 0.62rem;
		cursor: pointer;
	}
	.lens-btn.active { border-color: #d6b35f; background: #2a2618; color: #fff2c7; }
	.lens-btn:disabled { opacity: 0.42; cursor: default; }
	.fov-copy { display: flex; flex-direction: column; gap: 0.1rem; margin: 0.3rem 0 0; color: #8d887f; font-size: 0.6rem; line-height: 1.35; }
</style>
