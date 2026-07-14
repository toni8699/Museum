<script lang="ts">
	let {
		label,
		value,
		step,
		min,
		fractionDigits = 3,
		oncommit
	}: {
		label: string;
		value: number;
		step: number;
		min?: number;
		fractionDigits?: number;
		oncommit: (value: number) => void;
	} = $props();

	const format = (current: number) =>
		Number.isFinite(current)
			? current.toFixed(fractionDigits).replace(/\.?0+$/, '') || '0'
			: '0';

	let draft = $state('');
	let editing = $state(false);
	let dirty = $state(false);

	$effect(() => {
		if (!editing) draft = format(value);
	});

	function restore() {
		draft = format(value);
		dirty = false;
	}

	function commit() {
		if (!dirty) {
			editing = false;
			restore();
			return;
		}

		const parsed = Number(draft);
		if (!Number.isFinite(parsed) || (min !== undefined && parsed < min)) {
			editing = false;
			restore();
			return;
		}

		oncommit(parsed);
		dirty = false;
		editing = false;
		draft = format(parsed);
	}

	function onInput(event: Event) {
		draft = (event.currentTarget as HTMLInputElement).value;
		dirty = true;
	}

	function onKeyDown(event: KeyboardEvent) {
		const input = event.currentTarget as HTMLInputElement;
		if (event.key === 'Enter') {
			event.preventDefault();
			input.blur();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			restore();
			input.select();
		}
	}
</script>

<label>
	<span>{label}</span>
	<input
		type="number"
		{step}
		{min}
		value={draft}
		onfocus={() => (editing = true)}
		oninput={onInput}
		onblur={commit}
		onkeydown={onKeyDown}
	/>
</label>

<style>
	label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
		color: #aaa49a;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	input {
		min-width: 0;
		width: 100%;
		box-sizing: border-box;
		padding: 0.42rem 0.45rem;
		border: 1px solid #3a3a46;
		border-radius: 0.3rem;
		background: #0d0d12;
		color: #f4efe4;
		font: 0.76rem ui-monospace, SFMono-Regular, Menlo, monospace;
	}

	input:focus {
		outline: 1px solid #d6b35f;
		border-color: #d6b35f;
	}
</style>
