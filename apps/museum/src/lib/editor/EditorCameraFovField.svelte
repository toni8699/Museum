<script lang="ts">
	import { MUSEUM_CAMERA_FOV } from '$lib/types/museum';

	let {
		value,
		disabled = false,
		oncommit
	}: {
		value: number;
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
</style>
