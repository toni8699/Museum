<script lang="ts">
	import type { Vec3 } from '$lib/types/museum';
	import EditorVec3Field from './EditorVec3Field.svelte';
	import type { EditorCameraHandle } from './editor-selection';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let { store }: { store: MuseumEditorStore } = $props();

	const selection = $derived(store.cameraSelection);
	const node = $derived(store.selectedNavigationNode);
	const point = $derived(store.selectedCameraPoint);
	const nextNode = $derived(
		node?.nextNodeId
			? store.document.navigationNodes.find((candidate) => candidate.id === node.nextNodeId)
			: undefined
	);

	function selectHandle(handle: EditorCameraHandle) {
		store.selectCameraHandle(handle);
	}

	function commitPoint(next: Vec3) {
		if (!selection) return false;
		return store.commitNavigationNodePoint(selection.nodeId, selection.handle, next);
	}
</script>

{#if selection && node && point}
	<section class="camera-node" aria-label="Camera node editor">
		<div class="section-heading">
			<h2>Camera node</h2>
			<span>Room-local</span>
		</div>

		<dl>
			<div><dt>Label</dt><dd>{node.label}</dd></div>
			<div><dt>Node</dt><dd class="id">{node.id}</dd></div>
			<div><dt>Room</dt><dd>{node.roomId}</dd></div>
		</dl>

		<div class="handles" aria-label="Camera helper handle">
			{#each ['position', 'target'] as handle}
				<button
					type="button"
					class:active={selection.handle === handle}
					aria-pressed={selection.handle === handle}
					disabled={store.isCameraPreviewActive || store.transformInteractionActive}
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
				disabled={store.isCameraPreviewActive || store.transformInteractionActive}
				oncommit={commitPoint}
			/>
		{/key}

		<div class="preview" aria-label="Camera preview controls">
			{#if store.cameraPreview}
				<p role="status">
					{#if store.cameraPreview.kind === 'node'}
						Holding authored node pose
					{:else if store.cameraPreview.completed}
						Transition complete · holding destination
					{:else}
						Playing transition
					{/if}
				</p>
				<button type="button" class="stop" onclick={() => store.stopCameraPreview()}>
					Stop preview
				</button>
			{:else}
				<div>
					<button
						type="button"
						disabled={store.transformInteractionActive}
						onclick={() => store.previewSelectedNode()}
					>Preview node</button>
					<button
						type="button"
						disabled={store.transformInteractionActive}
						onclick={() => store.previewSelectedTransition()}
					>Preview → {nextNode?.label ?? 'Unavailable'}</button>
				</div>
			{/if}
		</div>

		{#if store.statusMessage}
			<p class="status" role="status">{store.statusMessage}</p>
		{/if}
	</section>
{/if}

<style>
	.camera-node {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.section-heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}

	h2 {
		margin: 0;
		font-size: 0.9rem;
	}

	.section-heading span,
	.preview p {
		color: #8d887f;
		font-size: 0.68rem;
	}

	.status {
		margin: 0;
		color: #e7c87a;
		font-size: 0.7rem;
		line-height: 1.4;
	}

	dl {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin: 0;
	}

	dl div {
		display: grid;
		grid-template-columns: 3.2rem 1fr;
		gap: 0.45rem;
	}

	dt {
		color: #8f8a82;
		font-size: 0.67rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	dd {
		margin: 0;
		font-size: 0.76rem;
	}

	.id {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	}

	.handles,
	.preview div {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.35rem;
	}

	button {
		padding: 0.42rem 0.4rem;
		border: 1px solid #3a3a46;
		border-radius: 0.3rem;
		background: #1a1a22;
		color: #ddd6ca;
		font: inherit;
		font-size: 0.72rem;
		cursor: pointer;
	}

	button.active,
	button.stop {
		border-color: #d6b35f;
		background: #2a2618;
		color: #fff2c7;
	}

	button:disabled {
		opacity: 0.42;
		cursor: default;
	}

	.preview {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		padding-top: 0.2rem;
	}

	.preview p {
		margin: 0;
	}

	.preview .stop {
		align-self: flex-start;
	}
</style>
