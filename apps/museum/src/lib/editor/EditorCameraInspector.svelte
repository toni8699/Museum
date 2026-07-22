<script lang="ts">
	import type { Vec3 } from '$lib/types/museum';
	import EditorVec3Field from './EditorVec3Field.svelte';
	import EditorCameraFovField from './EditorCameraFovField.svelte';
	import EditorProgressField from './EditorProgressField.svelte';
	import type { EditorCameraHandle } from './editor-selection';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let { store }: { store: MuseumEditorStore } = $props();

	const selection = $derived(store.navigationSelection);
	const node = $derived(store.selectedNavigationNode);
	const pendingNode = $derived(node ? store.isPendingNavigationNode(node.id) : false);
	const point = $derived(store.selectedCameraPoint);
	const connection = $derived(store.selectedConnection);
	const anchor = $derived(store.selectedAnchor);
	const viewKeyframe = $derived(store.selectedViewKeyframe);
	const nextNode = $derived(
		node?.nextNodeId
			? store.document.navigationNodes.find((candidate) => candidate.id === node.nextNodeId)
			: undefined
	);
	const fromNode = $derived(
		connection
			? store.document.navigationNodes.find(
					(candidate) => candidate.id === connection.fromNodeId
				)
			: undefined
	);
	const toNode = $derived(
		connection
			? store.document.navigationNodes.find(
					(candidate) => candidate.id === connection.toNodeId
				)
			: undefined
	);

	let labelDraft = $state('');
	$effect(() => {
		labelDraft = node?.label ?? '';
	});

	function selectHandle(handle: EditorCameraHandle) {
		store.selectCameraHandle(handle);
	}

	function commitNodePoint(next: Vec3) {
		if (selection?.kind !== 'node') return false;
		return store.commitNavigationNodePoint(selection.nodeId, selection.handle, next);
	}

	function commitAnchorPoint(next: Vec3) {
		return store.commitSelectedAnchorPoint(next);
	}

	function commitViewTarget(next: Vec3) {
		return store.commitSelectedViewKeyframeTarget(next);
	}

	function saveLabel() {
		if (!node) return;
		if (!store.commitSelectedNodeLabel(labelDraft)) labelDraft = node.label;
	}

	function onLabelKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			saveLabel();
		} else if (event.key === 'Escape' && node) {
			event.preventDefault();
			event.stopPropagation();
			labelDraft = node.label;
		}
	}

	function finishAnchorEditing() {
		store.finishAnchorEditing();
	}

	function finishViewKeyframeEditing() {
		store.finishViewKeyframeEditing();
	}
</script>

{#if selection?.kind === 'node' && node && point}
	<section class="camera-node" aria-label="Camera node editor">
		<div class="section-heading">
			<h2>{pendingNode ? 'Pending camera' : 'Camera node'}</h2>
			<span>{pendingNode ? 'Not saved' : 'Room-local'}</span>
		</div>

		<label class="label-field">
			<span>Label</span>
			<input
				bind:value={labelDraft}
				disabled={store.isDocumentMutationBlocked || store.isEditorInteractionActive}
				onblur={saveLabel}
				onkeydown={onLabelKeyDown}
			/>
		</label>

		<dl>
			<div><dt>Node</dt><dd class="id">{node.id}</dd></div>
			<div><dt>Room</dt><dd>{node.roomId}</dd></div>
		</dl>

		<div class="handles" aria-label="Camera helper handle">
			{#each ['position', 'target'] as handle}
				<button
					type="button"
					class:active={selection.handle === handle}
					aria-pressed={selection.handle === handle}
					disabled={store.isDocumentMutationBlocked || store.isEditorInteractionActive}
					onclick={() => selectHandle(handle as EditorCameraHandle)}
				>
					{handle === 'position' ? 'Position' : 'Target'}
				</button>
			{/each}
		</div>

		{#key `${selection.nodeId}:${selection.handle}`}
			<EditorVec3Field
				legend={`${selection.handle === 'position' ? 'Position' : 'Target'} (m)`}
				value={point}
				step={0.01}
				disabled={store.isDocumentMutationBlocked || store.isEditorInteractionActive}
				oncommit={commitNodePoint}
			/>
		{/key}

		<EditorCameraFovField
			value={node.fov}
			disabled={store.isDocumentMutationBlocked || store.isEditorInteractionActive}
			oncommit={(fov) => store.commitSelectedNodeFov(fov)}
		/>

		{#if pendingNode}
			<div class="topology" aria-label="Pending camera actions">
				<p>Choose any existing camera node in viewport or Camera Tour to create first connection.</p>
				<button
					type="button"
					class="danger"
					disabled={store.isEditorInteractionActive}
					onclick={() => store.cancelPendingNavigation('Camera placement cancelled')}
				>Cancel camera</button>
			</div>
		{:else}
			<div class="topology" aria-label="Camera topology commands">
				<button
					type="button"
					disabled={store.isDocumentMutationBlocked || store.isEditorInteractionActive}
					onclick={() => store.beginConnectExistingNodes()}
				>Connect to another node</button>
				<button
					type="button"
					class="danger"
					disabled={store.isDocumentMutationBlocked || store.isEditorInteractionActive}
					onclick={() => store.deleteNavigationNode(node.id)}
				>Delete camera node</button>
			</div>
		{/if}

		{#if !pendingNode && !store.cameraPreview}
			<div class="preview" aria-label="Camera preview controls">
				<div>
					<button type="button" disabled={store.isEditorInteractionActive} onclick={() => store.previewSelectedNode('director')}>Director node</button>
					<button type="button" disabled={store.isEditorInteractionActive} onclick={() => store.previewSelectedNode('visitor')}>Visitor node</button>
					<button type="button" disabled={store.isEditorInteractionActive} onclick={() => store.previewSelectedTransition('director')}>Director → {nextNode?.label ?? 'Unavailable'}</button>
					<button type="button" disabled={store.isEditorInteractionActive} onclick={() => store.previewSelectedTransition('visitor')}>Visitor → {nextNode?.label ?? 'Unavailable'}</button>
				</div>
			</div>
		{/if}
	</section>
{:else if selection?.kind === 'connection' && connection}
	<section class="camera-node" aria-label="Camera connection editor">
		<div class="section-heading">
			<h2>Camera connection</h2>
			<span>{connection.positionPath.kind}</span>
		</div>
		<dl>
			<div><dt>Connection</dt><dd class="id">{connection.id}</dd></div>
			<div><dt>From</dt><dd>{fromNode?.label ?? connection.fromNodeId}<small class="id">{connection.fromNodeId}</small></dd></div>
			<div><dt>To</dt><dd>{toNode?.label ?? connection.toNodeId}<small class="id">{connection.toNodeId}</small></dd></div>
			<div><dt>Anchors</dt><dd>{connection.positionPath.anchors.length}</dd></div>
			<div><dt>Clearance</dt><dd>{connection.clearance.toFixed(2)} m</dd></div>
			<div><dt>Forward views</dt><dd>{connection.viewTracks?.forward.length ?? 0}</dd></div>
			<div><dt>Reverse views</dt><dd>{connection.viewTracks?.reverse.length ?? 0}</dd></div>
		</dl>
		<button
			type="button"
			disabled={connection.positionPath.kind === 'auto-bezier' || store.isEditorInteractionActive || store.isDocumentMutationBlocked}
			onclick={() => store.convertSelectedConnectionToSmooth()}
		>Convert to Smooth Curve</button>
		<div class="copy-track" aria-label="Copy directional camera view track">
			<button
				type="button"
				disabled={store.isDocumentMutationBlocked || store.isEditorInteractionActive || (connection.viewTracks?.forward.length ?? 0) === 0}
				onclick={() => store.copySelectedConnectionViewTrack('forward')}
			>Copy forward → reverse</button>
			<button
				type="button"
				disabled={store.isDocumentMutationBlocked || store.isEditorInteractionActive || (connection.viewTracks?.reverse.length ?? 0) === 0}
				onclick={() => store.copySelectedConnectionViewTrack('reverse')}
			>Copy reverse → forward</button>
		</div>
		<button
			type="button"
			class="danger"
			disabled={store.isDocumentMutationBlocked || store.isEditorInteractionActive}
			onclick={() => store.deleteConnection(connection.id)}
		>Delete camera connection</button>
		{#if !store.cameraPreview}
			<div class="preview">
				<div>
					<button type="button" onclick={() => store.previewSelectedConnection('forward', 'director')}>Director {fromNode?.label ?? 'A'} → {toNode?.label ?? 'B'}</button>
					<button type="button" onclick={() => store.previewSelectedConnection('reverse', 'director')}>Director {toNode?.label ?? 'B'} → {fromNode?.label ?? 'A'}</button>
					<button type="button" onclick={() => store.previewSelectedConnection('forward', 'visitor')}>Visitor {fromNode?.label ?? 'A'} → {toNode?.label ?? 'B'}</button>
					<button type="button" onclick={() => store.previewSelectedConnection('reverse', 'visitor')}>Visitor {toNode?.label ?? 'B'} → {fromNode?.label ?? 'A'}</button>
				</div>
			</div>
		{/if}
	</section>
{:else if selection?.kind === 'view-keyframe' && connection && viewKeyframe}
	<section class="camera-node" aria-label="Camera view breakpoint editor">
		<div class="section-heading">
			<h2>View breakpoint</h2>
			<span>{selection.direction}</span>
		</div>
		<dl>
			<div><dt>View key</dt><dd class="id">{viewKeyframe.id}</dd></div>
			<div><dt>Path</dt><dd class="id">{connection.id}</dd></div>
			<div><dt>Direction</dt><dd>{selection.direction}</dd></div>
			<div><dt>Target space</dt><dd>{viewKeyframe.roomId ? `${viewKeyframe.roomId} local` : 'World-space'}</dd></div>
		</dl>
		<EditorProgressField
			value={viewKeyframe.progress}
			disabled={store.isDocumentMutationBlocked || store.isEditorInteractionActive}
			oncommit={(progress) => store.commitSelectedViewKeyframeProgress(progress)}
		/>
		{#key `${connection.id}:${selection.direction}:${viewKeyframe.id}:target`}
			<EditorVec3Field
				legend="Look target (m)"
				value={viewKeyframe.cameraTarget}
				step={0.01}
				disabled={store.isDocumentMutationBlocked || store.isEditorInteractionActive}
				oncommit={commitViewTarget}
			/>
		{/key}
		<EditorCameraFovField
			value={viewKeyframe.fov}
			disabled={store.isDocumentMutationBlocked || store.isEditorInteractionActive}
			oncommit={(fov) => store.commitSelectedViewKeyframeFov(fov)}
		/>
		<button
			type="button"
			class="danger"
			disabled={store.isDocumentMutationBlocked || store.isEditorInteractionActive}
			onclick={() => store.deleteSelectedViewKeyframe()}
		>Delete view breakpoint</button>
		<button
			type="button"
			class="done"
			disabled={store.isDocumentMutationBlocked || store.isEditorInteractionActive}
			onclick={finishViewKeyframeEditing}
		>Done editing view</button>
		{#if !store.cameraPreview}
			<div class="preview" aria-label="Parent connection preview controls">
				<div>
					<button type="button" onclick={() => store.previewSelectedConnection('forward', 'director')}>Director {fromNode?.label ?? 'A'} → {toNode?.label ?? 'B'}</button>
					<button type="button" onclick={() => store.previewSelectedConnection('reverse', 'director')}>Director {toNode?.label ?? 'B'} → {fromNode?.label ?? 'A'}</button>
					<button type="button" onclick={() => store.previewSelectedConnection('forward', 'visitor')}>Visitor {fromNode?.label ?? 'A'} → {toNode?.label ?? 'B'}</button>
					<button type="button" onclick={() => store.previewSelectedConnection('reverse', 'visitor')}>Visitor {toNode?.label ?? 'B'} → {fromNode?.label ?? 'A'}</button>
				</div>
			</div>
		{/if}
	</section>
{:else if selection?.kind === 'anchor' && connection && anchor}
	<section class="camera-node" aria-label="Camera path anchor editor">
		<div class="section-heading">
			<h2>Curve anchor</h2>
			<span>{anchor.roomId ? `${anchor.roomId} local` : 'World-space'}</span>
		</div>
		<dl>
			<div><dt>Anchor</dt><dd class="id">{anchor.id}</dd></div>
			<div><dt>Path</dt><dd class="id">{connection.id}</dd></div>
		</dl>
		{#key `${connection.id}:${anchor.id}`}
			<EditorVec3Field
				legend="Anchor position (m)"
				value={anchor.position}
				step={0.01}
				disabled={store.isDocumentMutationBlocked || store.isEditorInteractionActive}
				oncommit={commitAnchorPoint}
			/>
		{/key}
		<button
			type="button"
			class="danger"
			disabled={store.isDocumentMutationBlocked || store.isEditorInteractionActive}
			onclick={() => store.deleteSelectedAnchor()}
		>Delete Anchor</button>
		<button
			type="button"
			class="done"
			disabled={store.isDocumentMutationBlocked || store.isEditorInteractionActive}
			onclick={finishAnchorEditing}
		>Done editing anchor</button>
		{#if !store.cameraPreview}
			<div class="preview" aria-label="Parent connection preview controls">
				<div>
					<button type="button" onclick={() => store.previewSelectedConnection('forward', 'director')}>Director {fromNode?.label ?? 'A'} → {toNode?.label ?? 'B'}</button>
					<button type="button" onclick={() => store.previewSelectedConnection('reverse', 'director')}>Director {toNode?.label ?? 'B'} → {fromNode?.label ?? 'A'}</button>
					<button type="button" onclick={() => store.previewSelectedConnection('forward', 'visitor')}>Visitor {fromNode?.label ?? 'A'} → {toNode?.label ?? 'B'}</button>
					<button type="button" onclick={() => store.previewSelectedConnection('reverse', 'visitor')}>Visitor {toNode?.label ?? 'B'} → {fromNode?.label ?? 'A'}</button>
				</div>
			</div>
		{/if}
	</section>
{/if}

{#if selection && store.statusMessage}
	<p class="status" role="status">{store.statusMessage}</p>
{/if}

<style>
	.camera-node { display: flex; flex-direction: column; gap: 0.75rem; }
	.section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; }
	h2 { margin: 0; font-size: 0.9rem; }
	.section-heading span { color: #8d887f; font-size: 0.68rem; }
	.status { margin: 0.75rem 0 0; color: #e7c87a; font-size: 0.7rem; line-height: 1.4; }
	dl { display: flex; flex-direction: column; gap: 0.4rem; margin: 0; }
	dl div { display: grid; grid-template-columns: 4.4rem 1fr; gap: 0.45rem; }
	dt, .label-field span { color: #8f8a82; font-size: 0.67rem; letter-spacing: 0.04em; text-transform: uppercase; }
	dd { display: flex; flex-direction: column; gap: 0.1rem; margin: 0; font-size: 0.76rem; }
	.id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
	.label-field { display: flex; flex-direction: column; gap: 0.3rem; }
	.label-field input { width: 100%; box-sizing: border-box; padding: 0.42rem; border: 1px solid #3a3a46; border-radius: 0.3rem; background: #101016; color: #f4efe4; }
	.handles, .preview div, .copy-track { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.35rem; }
	.topology { display: grid; grid-template-columns: 1fr; gap: 0.35rem; }
	button { padding: 0.42rem 0.4rem; border: 1px solid #3a3a46; border-radius: 0.3rem; background: #1a1a22; color: #ddd6ca; font: inherit; font-size: 0.72rem; cursor: pointer; }
	button.active, button.done { border-color: #d6b35f; background: #2a2618; color: #fff2c7; }
	button.danger { border-color: #744; color: #f1b1aa; }
	button:disabled, input:disabled { opacity: 0.42; cursor: default; }
	.preview { display: flex; flex-direction: column; gap: 0.45rem; padding-top: 0.2rem; }
</style>
