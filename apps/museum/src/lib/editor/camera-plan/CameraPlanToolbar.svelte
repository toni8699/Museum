<script lang="ts">
	import type { EditorStore } from '../editor-store.svelte';
	import {
		setCameraPlanTool,
		type CameraPlanState,
		type CameraPlanTool
	} from './camera-plan-state.svelte';

	let {
		store,
		cameraPlan
	}: {
		store: EditorStore;
		cameraPlan: CameraPlanState;
	} = $props();

	const pendingKind = $derived(store.pendingNavigationCommand?.kind ?? null);
	const blocked = $derived(
		store.isDocumentMutationBlocked || store.isEditorInteractionActive
	);
	const canConnect = $derived(store.navigationSelection?.kind === 'node');
	const addCameraActive = $derived(pendingKind === 'place-camera');
	const connectActive = $derived(pendingKind === 'connect-existing');

	// Select or View cancels an active pending navigation command before
	// switching local mode (the store command stays the single owner).
	function chooseTool(tool: CameraPlanTool) {
		if (store.pendingNavigationCommand) store.cancelPendingNavigation();
		setCameraPlanTool(cameraPlan, tool);
	}

	function armAddCamera() {
		setCameraPlanTool(cameraPlan, 'select');
		store.beginCameraPlacement();
	}

	function armConnect() {
		setCameraPlanTool(cameraPlan, 'select');
		store.beginConnectExistingNodes();
	}
</script>

<div class="camera-plan-toolbar" role="toolbar" aria-label="Camera Plan tools">
	<button
		type="button"
		class:active={cameraPlan.tool === 'select'}
		aria-pressed={cameraPlan.tool === 'select'}
		onclick={() => chooseTool('select')}
	>Select</button>
	<button
		type="button"
		class:active={cameraPlan.tool === 'view'}
		aria-pressed={cameraPlan.tool === 'view'}
		onclick={() => chooseTool('view')}
	>View</button>
	<span class="toolbar-separator" aria-hidden="true"></span>
	<button
		type="button"
		class:active={addCameraActive}
		aria-pressed={addCameraActive}
		disabled={blocked || pendingKind !== null}
		onclick={armAddCamera}
	>Add Camera</button>
	<button
		type="button"
		class:active={connectActive}
		aria-pressed={connectActive}
		disabled={blocked || pendingKind !== null || !canConnect}
		title={canConnect ? undefined : 'Select a source camera node first'}
		onclick={armConnect}
	>Connect</button>
	<span class="toolbar-separator" aria-hidden="true"></span>
	<button
		type="button"
		class:active={cameraPlan.planView.gridEnabled}
		aria-pressed={cameraPlan.planView.gridEnabled}
		onclick={() => (cameraPlan.planView.gridEnabled = !cameraPlan.planView.gridEnabled)}
	>Grid</button>
	<button
		type="button"
		class:active={cameraPlan.planView.snapEnabled}
		aria-pressed={cameraPlan.planView.snapEnabled}
		onclick={() => (cameraPlan.planView.snapEnabled = !cameraPlan.planView.snapEnabled)}
	>Snap</button>
</div>

<style>
	.camera-plan-toolbar {
		position: absolute;
		top: 0.65rem;
		left: 50%;
		z-index: 6;
		display: flex;
		align-items: center;
		gap: 0.3rem;
		transform: translateX(-50%);
		padding: 0.3rem;
		border: 1px solid #2f2f38;
		border-radius: 0.45rem;
		background: rgb(18 18 24 / 92%);
	}
	button {
		padding: 0.4rem 0.6rem;
		border: 1px solid transparent;
		border-radius: 0.3rem;
		background: transparent;
		color: #d6d0c4;
		font: 600 0.7rem/1 ui-sans-serif, system-ui, sans-serif;
		cursor: pointer;
		white-space: nowrap;
	}
	button:hover:not(:disabled) { background: #23232c; color: #f4efe4; }
	button.active { border-color: #8d753c; background: #2a2618; color: #fff2c7; }
	button:disabled { opacity: 0.38; cursor: default; }
	.toolbar-separator { width: 1px; height: 1.1rem; background: #3a3a46; }
</style>
