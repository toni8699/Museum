<script lang="ts">
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let { store }: { store: MuseumEditorStore } = $props();

	const workspace = $derived(store.currentWorkspace);
	const canSwitchWorkspace = $derived(
		!store.isDocumentMutationBlocked && !store.isEditorInteractionActive
	);
	const dirty = $derived(store.isDirty);

	function switchWorkspace(next: 'scene' | 'camera') {
		if (store.setWorkspace(next)) return;
		store.setStatusMessage('Stop the current interaction before switching workspaces');
	}
</script>

<header class="app-bar" aria-label="Museum editor shell" style="grid-area: top;">
	<div class="brand">
		<span class="title">Museum editor</span>
		<span class="subtitle">Phase 1.1 · persistent shell</span>
	</div>
	<div class="workspaces" role="tablist" aria-label="Editor workspaces">
		<button
			type="button"
			role="tab"
			aria-selected={workspace === 'scene'}
			class:active={workspace === 'scene'}
			disabled={!canSwitchWorkspace}
			onclick={() => switchWorkspace('scene')}
		>Scene</button>
		<button
			type="button"
			role="tab"
			aria-selected={workspace === 'camera'}
			class:active={workspace === 'camera'}
			disabled={!canSwitchWorkspace}
			onclick={() => switchWorkspace('camera')}
		>Camera</button>
	</div>
	<div class="actions">
		<span class:dirty class="document-state">{dirty ? 'Unsaved' : 'Saved'}</span>
		<button type="button" disabled={!store.canUndo} onclick={() => store.undo()}>Undo</button>
		<button type="button" disabled={!store.canRedo} onclick={() => store.redo()}>Redo</button>
	</div>
</header>

<style>
	.app-bar {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.6rem 0.9rem;
		border-bottom: 1px solid #2a2a33;
		background: #13131a;
	}
	.brand { display: flex; flex-direction: column; gap: 0.05rem; min-width: 16.5rem; }
	.title { font-size: 0.92rem; font-weight: 650; letter-spacing: 0.02em; color: #f4efe4; }
	.subtitle { color: #8f8a82; font-size: 0.68rem; }
	.workspaces {
		display: flex;
		gap: 0.3rem;
		padding: 0.25rem;
		border: 1px solid #2e2e37;
		border-radius: 0.4rem;
		background: #16161d;
	}
	.workspaces button {
		padding: 0.4rem 0.85rem;
		border: 1px solid transparent;
		border-radius: 0.32rem;
		background: transparent;
		color: #a8a29a;
		font: inherit;
		font-size: 0.74rem;
		cursor: pointer;
	}
	.workspaces button:disabled { opacity: 0.5; cursor: default; }
	.workspaces button:hover:not(:disabled) { color: #f4efe4; }
	.workspaces button.active { border-color: #d6b35f; background: #2a2618; color: #fff2c7; }
	.actions { display: flex; gap: 0.4rem; align-items: center; margin-left: auto; }
	.document-state {
		padding: 0.16rem 0.42rem;
		border: 1px solid #52634e;
		border-radius: 999px;
		background: #182218;
		color: #cfe9c4;
		font-size: 0.62rem;
		font-weight: 650;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.document-state.dirty { border-color: #8d753c; background: #2a2618; color: #f4dc9b; }
	.actions button {
		padding: 0.36rem 0.6rem;
		border: 1px solid #3a3a46;
		border-radius: 0.3rem;
		background: #1a1a22;
		color: #f4efe4;
		font: inherit;
		font-size: 0.72rem;
		cursor: pointer;
	}
	.actions button:disabled { opacity: 0.4; cursor: default; }
</style>
