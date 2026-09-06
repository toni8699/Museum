<script lang="ts">
	import { Camera, Eye, Grid3x3, Magnet, MousePointer2, Waypoints } from 'lucide-svelte';
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
	// P11.2 §3 — AP predicate: a playing Director preview stays clickable so the
	// Add Camera / Connect commit can auto-pause; a visitor or active gesture blocks.
	const blocked = $derived(store.isAuthoringPauseBlocked);
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
	<!-- P21.3 — Row 2 order: Select | Add Camera Connect | View | Snap Grid.
	     P21.5 §1.4 — Zone B authoring groups sit in enclosed .tool-group
	     tracks (grammar in styles/controls.css); options stay text-only. -->
	<div class="tool-group" role="group" aria-label="Selection">
		<button
			type="button"
			class:active={cameraPlan.tool === 'select'}
			aria-pressed={cameraPlan.tool === 'select'}
			onclick={() => chooseTool('select')}
		><MousePointer2 size={14} aria-hidden="true" /> Select</button>
	</div>
	<div class="tool-group" role="group" aria-label="Camera authoring">
		<button
			type="button"
			class:active={addCameraActive}
			aria-pressed={addCameraActive}
			disabled={blocked || pendingKind !== null}
			onclick={armAddCamera}
		><Camera size={14} aria-hidden="true" /> Add Camera</button>
		<button
			type="button"
			class:active={connectActive}
			aria-pressed={connectActive}
			disabled={blocked || pendingKind !== null || !canConnect}
			title={canConnect ? undefined : 'Select a source camera node first'}
			onclick={armConnect}
		><Waypoints size={14} aria-hidden="true" /> Connect</button>
	</div>
	<div class="tool-group" role="group" aria-label="Camera view">
		<button
			type="button"
			class:active={cameraPlan.tool === 'view'}
			aria-pressed={cameraPlan.tool === 'view'}
			onclick={() => chooseTool('view')}
		><Eye size={14} aria-hidden="true" /> View</button>
	</div>
	<div class="tool-group" role="group" aria-label="Plan options">
		<button
			type="button"
			class:active={cameraPlan.planView.snapEnabled}
			aria-pressed={cameraPlan.planView.snapEnabled}
			onclick={() => (cameraPlan.planView.snapEnabled = !cameraPlan.planView.snapEnabled)}
		><Magnet size={14} aria-hidden="true" /> Snap</button>
		<button
			type="button"
			class:active={cameraPlan.planView.gridEnabled}
			aria-pressed={cameraPlan.planView.gridEnabled}
			onclick={() => (cameraPlan.planView.gridEnabled = !cameraPlan.planView.gridEnabled)}
		><Grid3x3 size={14} aria-hidden="true" /> Grid</button>
	</div>
</div>

<style>
	.camera-plan-toolbar {
		display:flex; align-items:center; gap:6px; flex:1; min-width:0; height:28px;
	}
	/* Button surfaces/tracks come from the P21.5 grammar in styles/controls.css. */
</style>
