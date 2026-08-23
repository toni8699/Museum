<script lang="ts">
	import type { Vec3 } from '$lib/types/scene';
	import {
		createEditorVec3Drafts,
		editorVec3Changed,
		parseEditorVec3Drafts,
		type EditorVec3Drafts
	} from '../editor-vector';

	let {
		legend,
		value,
		step = 0.01,
		disabled = false,
		oncommit
	}: {
		legend: string;
		value: Vec3;
		step?: number;
		disabled?: boolean;
		oncommit: (value: Vec3) => boolean | void;
	} = $props();

	let fieldset = $state<HTMLFieldSetElement>();
	let drafts = $state<EditorVec3Drafts>(['', '', '']);
	let dirty = $state(false);
	let stepperInput: HTMLInputElement | null = null;

	function restore() {
		drafts = createEditorVec3Drafts(value);
		dirty = false;
	}

	$effect(() => {
		if (!dirty) restore();
	});

	function commit() {
		if (disabled || !dirty) return false;
		const next = parseEditorVec3Drafts(drafts);
		if (!next || !editorVec3Changed(next, value)) {
			restore();
			return false;
		}
		const committed = oncommit(next);
		dirty = false;
		if (committed === false) restore();
		return committed !== false;
	}

	function onInput(index: 0 | 1 | 2, event: Event) {
		drafts[index] = (event.currentTarget as HTMLInputElement).value;
		dirty = true;
		if (stepperInput === event.currentTarget) {
			queueMicrotask(() => commit());
		}
	}

	function onPointerDown(event: PointerEvent) {
		const input = event.currentTarget as HTMLInputElement;
		const rect = input.getBoundingClientRect();
		stepperInput = event.clientX >= rect.right - 22 ? input : null;
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			commit();
			return;
		}
		if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
			stepperInput = event.currentTarget as HTMLInputElement;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			restore();
		}
	}

	function onFocusOut() {
		queueMicrotask(() => {
			if (!fieldset?.contains(document.activeElement)) commit();
		});
	}
</script>

<fieldset bind:this={fieldset} {disabled} onfocusout={onFocusOut}>
	<legend>{legend}</legend>
	<div class="field-grid">
		{#each ['X', 'Y', 'Z'] as axis, index}
			<label>
				<span>{axis}</span>
				<input
					type="number"
					{step}
					value={drafts[index]}
					oninput={(event) => onInput(index as 0 | 1 | 2, event)}
					onpointerdown={onPointerDown}
					onpointerup={() => (stepperInput = null)}
					onkeydown={onKeyDown}
					onkeyup={() => (stepperInput = null)}
				/>
			</label>
		{/each}
	</div>
</fieldset>

<style>
	fieldset {
		margin: 0;
		padding: 0.65rem;
		border: 1px solid #2e2e37;
		border-radius: 0.4rem;
	}

	fieldset:disabled {
		opacity: 0.52;
	}

	legend {
		padding: 0 0.25rem;
		color: #bbb4a8;
		font-size: 0.72rem;
	}

	.field-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.35rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
		color: #aaa49a;
		font-size: 0.7rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
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
