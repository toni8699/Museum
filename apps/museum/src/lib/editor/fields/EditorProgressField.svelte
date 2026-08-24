<script lang="ts">
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

	function restore() {
		draft = (value * 100).toFixed(3).replace(/\.?0+$/, '');
		dirty = false;
	}

	$effect(() => {
		if (!dirty) restore();
	});

	function commit() {
		if (disabled || !dirty) return false;
		const percent = Number(draft);
		if (!Number.isFinite(percent) || percent <= 0 || percent >= 100) {
			restore();
			return false;
		}
		const committed = oncommit(percent / 100);
		dirty = false;
		if (committed === false) restore();
		return committed !== false;
	}

	function onKeyDown(event: KeyboardEvent) {
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
</script>

<label>
	<span>Progress (%)</span>
	<input
		type="number"
		min="0"
		max="100"
		step="0.1"
		value={draft}
		{disabled}
		oninput={(event) => {
			draft = event.currentTarget.value;
			dirty = true;
		}}
		onblur={commit}
		onkeydown={onKeyDown}
	/>
</label>

<style>
	label { display: flex; flex-direction: column; gap: 0.3rem; }
	span { color: var(--editor-text-muted); font-size: 0.67rem; letter-spacing: 0.04em; text-transform: uppercase; }
	input { width: 100%; box-sizing: border-box; padding: 0.42rem; border: 1px solid var(--editor-border-normal); border-radius: 0.3rem; background: var(--editor-bg-panel); color: var(--editor-text-primary); font: 0.76rem var(--editor-font); }
	input:focus { outline: 1px solid var(--editor-accent); border-color: var(--editor-accent); }
	input:disabled { opacity: 0.42; }
</style>
