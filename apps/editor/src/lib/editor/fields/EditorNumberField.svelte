<script lang="ts">
	let {
		label,
		value,
		step,
		min,
		fractionDigits = 3,
		oncommit,
		axis
	}: {
		label: string;
		value: number;
		step: number;
		min?: number;
		fractionDigits?: number;
		oncommit: (value: number) => boolean | void;
		/** P21.5 §3.1 — explicit axis chip override. When omitted the chip is
		 *  derived from the label (X / Y / Z / Yaw → colored; anything else
		 *  takes a neutral chip with the label's initial). */
		axis?: 'X' | 'Y' | 'Z';
	} = $props();

	const format = (current: number) =>
		Number.isFinite(current)
			? current.toFixed(fractionDigits).replace(/\.?0+$/, '') || '0'
			: '0';

	// P21.5 §3.1 — the chip carries the axis identity (the folded axis
	// legend): X/Y/Z take their canonical axis tones, Yaw maps to Y (rotation
	// about the Y axis), everything else takes a neutral chip.
	function deriveAxis(name: string): 'X' | 'Y' | 'Z' | null {
		if (name === 'X' || name === 'Y' || name === 'Z') return name;
		if (/\bX\b/.test(name)) return 'X';
		if (/\bZ\b/.test(name)) return 'Z';
		if (/\bY\b/.test(name) || /yaw/i.test(name)) return 'Y';
		return null;
	}

	const chipAxis = $derived(axis ?? deriveAxis(label));
	const chipText = $derived(chipAxis ?? (label.trim().charAt(0).toUpperCase() || '·'));
	const chipTone = $derived((chipAxis ?? 'neutral').toLowerCase());

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

		const committed = oncommit(parsed);
		dirty = false;
		editing = false;
		if (committed === false) {
			restore();
			return;
		}
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

<label class="number-field" data-tone={chipTone} title={label}>
	<span class="axis-chip" aria-hidden="true">{chipText}</span>
	<input
		type="number"
		{step}
		{min}
		value={draft}
		aria-label={label}
		onfocus={() => (editing = true)}
		oninput={onInput}
		onblur={commit}
		onkeydown={onKeyDown}
	/>
</label>

<style>
	/* P21.5 §3.1 — compact 28px row: inline axis chip + borderless tabular
	   input. The chip replaces the standalone axis legend. */
	.number-field {
		display: flex;
		align-items: center;
		gap: 6px;
		height: 28px;
		min-width: 0;
		box-sizing: border-box;
		padding: 0 6px 0 2px;
		border: 1px solid var(--editor-border-subtle);
		border-radius: 5px;
		background: var(--editor-bg-control);
	}

	.axis-chip {
		display: inline-grid;
		flex: 0 0 auto;
		place-items: center;
		width: 18px;
		height: 18px;
		border-radius: 3px;
		font: 700 10px/1 var(--editor-font);
	}

	.number-field[data-tone='x'] .axis-chip {
		background: rgba(240, 82, 82, 0.15);
		color: #f05252;
	}

	.number-field[data-tone='y'] .axis-chip {
		background: rgba(69, 200, 120, 0.15);
		color: #45c878;
	}

	.number-field[data-tone='z'] .axis-chip {
		background: rgba(59, 130, 246, 0.15);
		color: #3b82f6;
	}

	.number-field[data-tone='neutral'] .axis-chip {
		background: var(--editor-bg-hover);
		color: var(--editor-text-secondary);
	}

	input {
		flex: 1 1 auto;
		min-width: 0;
		width: 100%;
		box-sizing: border-box;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--editor-text-primary);
		font: 500 12px var(--editor-font);
		font-variant-numeric: tabular-nums;
	}

	input:focus {
		outline: none;
	}

	.number-field:focus-within {
		outline: 1px solid var(--editor-accent);
		border-color: var(--editor-accent);
	}
</style>
