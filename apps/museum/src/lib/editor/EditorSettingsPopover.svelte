<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import type { EditorSettingsStore } from './settings-store.svelte';
	import { EDITOR_OPEN_SETTINGS_KEY, type EditorOpenSettingsHandle } from './editor-context-keys';

	let { settingsStore }: { settingsStore: EditorSettingsStore } = $props();
	const openHandle = getContext<EditorOpenSettingsHandle>(EDITOR_OPEN_SETTINGS_KEY);

	let dialogEl: HTMLDivElement | undefined = $state();

	function handleKey(event: KeyboardEvent) {
		if (event.key === 'Escape' && openHandle.open) {
			openHandle.set(false);
		}
	}

	function handleClickAway(event: MouseEvent) {
		if (!openHandle.open) return;
		if (!dialogEl) return;
		if (dialogEl.contains(event.target as Node)) return;
		const anchor = (event.currentTarget as HTMLElement).closest('[data-settings-anchor]');
		if (anchor && anchor.contains(event.target as Node)) return;
		openHandle.set(false);
	}

	onMount(() => {
		document.addEventListener('keydown', handleKey);
		return () => document.removeEventListener('keydown', handleKey);
	});

	function clampNumber(raw: string, min: number, max: number, fallback: number): number {
		const parsed = Number.parseFloat(raw);
		if (!Number.isFinite(parsed)) return fallback;
		return Math.max(min, Math.min(max, parsed));
	}
	function clampInt(raw: string, min: number, max: number, fallback: number): number {
		const parsed = Number.parseInt(raw, 10);
		if (!Number.isInteger(parsed)) return fallback;
		return Math.max(min, Math.min(max, parsed));
	}
</script>

{#if openHandle.open}
	<div
		class="settings-popover-backdrop"
		role="presentation"
		onclick={handleClickAway}
		data-settings-anchor
	>
		<div
			bind:this={dialogEl}
			class="settings-popover"
			role="dialog"
			aria-label="Editor settings"
		>
			<header>Editor settings</header>

			<section>
				<h3>Snap</h3>
				<label>
					<span>Translation step</span>
					<input
						name="translationStep"
						type="number"
						min="0.01"
						max="1.0"
						step="0.01"
						value={settingsStore.settings.translationStep}
						oninput={(event) =>
							settingsStore.set({
								translationStep: clampNumber(
									event.currentTarget.value,
									0.01,
									1.0,
									settingsStore.settings.translationStep
								)
							})}
					/>
					<span class="unit">m</span>
				</label>
				<label>
					<span>Rotation step</span>
					<input
						name="rotationStepDegrees"
						type="number"
						min="1"
						max="90"
						step="1"
						value={settingsStore.settings.rotationStepDegrees}
						oninput={(event) =>
							settingsStore.set({
								rotationStepDegrees: clampInt(
									event.currentTarget.value,
									1,
									90,
									settingsStore.settings.rotationStepDegrees
								)
							})}
					/>
					<span class="unit">°</span>
				</label>
				<label>
					<span>Scale step</span>
					<input
						name="scaleStep"
						type="number"
						min="0.05"
						max="0.5"
						step="0.05"
						value={settingsStore.settings.scaleStep}
						oninput={(event) =>
							settingsStore.set({
								scaleStep: clampNumber(
									event.currentTarget.value,
									0.05,
									0.5,
									settingsStore.settings.scaleStep
								)
							})}
					/>
				</label>
				<label class="row">
					<input
						name="snapDefaultOn"
						type="checkbox"
						checked={settingsStore.settings.snapDefaultOn}
						onchange={(event) =>
							settingsStore.set({ snapDefaultOn: event.currentTarget.checked })}
					/>
					<span>Snap on by default</span>
				</label>
			</section>

			<section>
				<h3>Pivot</h3>
				<label class="row">
					<input
						type="radio"
						name="pivotMode"
						value="center"
						checked={settingsStore.settings.pivotMode === 'center'}
						onchange={() => settingsStore.set({ pivotMode: 'center' })}
					/>
					<span>Center</span>
				</label>
				<label class="row">
					<input
						type="radio"
						name="pivotMode"
						value="active-object"
						checked={settingsStore.settings.pivotMode === 'active-object'}
						onchange={() => settingsStore.set({ pivotMode: 'active-object' })}
					/>
					<span>Active Object</span>
				</label>
			</section>

			<footer>
				<button type="button" name="reset" onclick={() => settingsStore.reset()}>
					Reset to defaults
				</button>
			</footer>
		</div>
	</div>
{/if}

<style>
	.settings-popover-backdrop {
		position: fixed;
		inset: 0;
		z-index: 10020;
		pointer-events: auto;
		background: transparent;
	}
	.settings-popover {
		position: absolute;
		right: 16px;
		bottom: 56px;
		width: 280px;
		background: #1c1822;
		color: #e9e3f0;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
		padding: 12px 16px;
		font: 13px/1.4 system-ui, sans-serif;
	}
	header {
		font-weight: 600;
		margin-bottom: 8px;
	}
	section {
		display: grid;
		gap: 6px;
		margin: 8px 0;
	}
	section h3 {
		font-size: 12px;
		text-transform: uppercase;
		color: #9c8eaa;
		margin: 4px 0;
	}
	label {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		align-items: center;
	}
	label.row {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.unit {
		color: #9c8eaa;
		font-size: 12px;
	}
	input[type='number'],
	input[type='checkbox'],
	input[type='radio'] {
		accent-color: #d6b35f;
	}
	footer {
		margin-top: 12px;
		text-align: right;
	}
	footer button {
		background: rgba(255, 255, 255, 0.08);
		border: none;
		color: inherit;
		padding: 4px 12px;
		border-radius: 6px;
		cursor: pointer;
	}
	footer button:hover {
		background: rgba(255, 255, 255, 0.16);
	}
</style>
