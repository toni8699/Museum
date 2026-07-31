<script lang="ts">
	import type { CameraConnectionDirection } from '$lib/types/museum';
	import type {
		SceneCameraViewKeyframe,
		SceneConnectionViewTracks
	} from '$lib/content/scene';
	import DirectionalKeyframeList from './DirectionalKeyframeList.svelte';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let { store }: { store: MuseumEditorStore } = $props();

	function readKeyframes(
		tracks: SceneConnectionViewTracks | undefined,
		direction: CameraConnectionDirection
	): SceneCameraViewKeyframe[] {
		if (!tracks) return [];
		return direction === 'forward' ? tracks.forward : tracks.reverse;
	}

	function keyframeCount(connectionId: string, direction: CameraConnectionDirection) {
		const connection = store.document.connections.find(
			(candidate) => candidate.id === connectionId
		);
		return readKeyframes(connection?.viewTracks, direction).length;
	}

	function directionTreeKey(connectionId: string, direction: CameraConnectionDirection) {
		return `${connectionId}::${direction}`;
	}

	function isConnectionExpanded(connectionId: string) {
		return store.treeExpandedCameraConnectionIds.includes(connectionId);
	}

	function isDirectionExpanded(connectionId: string, direction: CameraConnectionDirection) {
		return store.treeExpandedCameraDirectionKeys.includes(
			directionTreeKey(connectionId, direction)
		);
	}

	function isConnectionHeaderSelected(connectionId: string) {
		const selection = store.navigationSelection;
		if (
			selection?.kind === 'connection' ||
			selection?.kind === 'anchor' ||
			selection?.kind === 'view-keyframe'
		) {
			return selection.connectionId === connectionId;
		}
		return false;
	}

	function isDirectionSelected(connectionId: string, direction: CameraConnectionDirection) {
		return (
			isConnectionHeaderSelected(connectionId) &&
			store.activeCameraConnectionId === connectionId &&
			store.activeCameraDirection === direction
		);
	}
</script>

<div class="sidebar-section-header">
	<h2>Connections</h2>
	<span aria-label={`${store.document.connections.length} connections`}
		>{store.document.connections.length}</span
	>
</div>
{#if store.document.connections.length > 0}
	<ul class="connections" role="tree" aria-label="Camera connections and view keys">
		{#each store.document.connections as connection (connection.id)}
			{@const forwardCount = keyframeCount(connection.id, 'forward')}
			{@const reverseCount = keyframeCount(connection.id, 'reverse')}
			<li
				role="treeitem"
				aria-expanded={isConnectionExpanded(connection.id)}
				aria-selected={isConnectionHeaderSelected(connection.id)}
			>
				<div class="connection-line">
					<button
						type="button"
						class="tree-row__chevron"
						aria-label={`${isConnectionExpanded(connection.id) ? 'Collapse' : 'Expand'} ${connection.id}`}
						aria-expanded={isConnectionExpanded(connection.id)}
						onclick={() => store.toggleCameraConnectionTreeExpansion(connection.id)}
					>
						<span class="chevron" class:open={isConnectionExpanded(connection.id)}>›</span>
					</button>
					<button
						type="button"
						class="tree-row connection-row"
						class:tree-row--selected={isConnectionHeaderSelected(connection.id)}
						onclick={() =>
							store.selectionActions.selectCameraConnectionDirection(connection.id, 'forward')}
						title={connection.id}
					>
						<span class="tree-row__label" title={connection.id}>{connection.id}</span>
						<span class="tree-row__meta">{forwardCount + reverseCount}</span>
					</button>
				</div>
				{#if isConnectionExpanded(connection.id)}
					<ul class="direction-group" role="group">
						{#each ['forward', 'reverse'] as const as direction (directionTreeKey(connection.id, direction))}
							{@const expanded = isDirectionExpanded(connection.id, direction)}
							{@const count = direction === 'forward' ? forwardCount : reverseCount}
							<li
								role="treeitem"
								aria-expanded={expanded}
								aria-selected={isDirectionSelected(connection.id, direction)}
							>
								<div class="direction-line">
									<button
										type="button"
										class="tree-row__chevron"
										aria-label={`${expanded ? 'Collapse' : 'Expand'} ${direction} keys`}
										aria-expanded={expanded}
										onclick={() =>
											store.toggleCameraDirectionTreeExpansion(connection.id, direction)}
									>
										<span class="chevron" class:open={expanded}>›</span>
									</button>
									<button
										type="button"
										class="tree-row direction-row"
										class:tree-row--selected={isDirectionSelected(connection.id, direction)}
										class:direction-row--empty={count === 0}
										onclick={() =>
											store.selectionActions.selectCameraConnectionDirection(
												connection.id,
												direction
											)}
									>
										<span class="direction-badge">{direction === 'forward' ? '▶' : '◀'}</span>
										<span class="tree-row__label">{direction}</span>
										<span class="tree-row__meta">{count}</span>
									</button>
								</div>
								{#if expanded}
									<DirectionalKeyframeList
										{store}
										connectionId={connection.id}
										{direction}
									/>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</li>
		{/each}
	</ul>
{:else}
	<p class="empty"><strong>No connections</strong></p>
{/if}

<style>
	.sidebar-section-header {
		display: flex;
		min-width: 0;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		min-height: 2rem;
	}
	.sidebar-section-header h2 {
		min-width: 0;
		margin: 0;
		font-size: 0.78rem;
		font-weight: 650;
		letter-spacing: 0.02em;
		color: #d6c7a8;
	}
	.sidebar-section-header span {
		flex: 0 0 auto;
		color: #918c84;
		font-size: 0.66rem;
		font-variant-numeric: tabular-nums;
	}
	ul {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 0.12rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.connections {
		gap: 0.16rem;
	}
	.connection-line,
	.direction-line {
		display: grid;
		min-width: 0;
		grid-template-columns: 1.7rem minmax(0, 1fr);
		gap: 0.1rem;
	}
	.direction-group {
		margin: 0.12rem 0 0.22rem 0.85rem;
		padding-left: 0.65rem;
		border-left: 1px solid #36323a;
		gap: 0.12rem;
	}
	.tree-row {
		display: flex;
		width: 100%;
		min-width: 0;
		min-height: 2rem;
		box-sizing: border-box;
		align-items: center;
		gap: 0.55rem;
		padding: 0.28rem 0.45rem;
		border: 1px solid transparent;
		border-radius: 0.28rem;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.tree-row:hover {
		border-color: #3a3a46;
		background: #202029;
	}
	.tree-row--selected {
		border-color: #8d753c;
		background: #2a2618;
		box-shadow: inset 0 0 0 1px #6f5c31;
		color: #fff2c7;
	}
	.direction-badge {
		flex: 0 0 1.1rem;
		color: #d6b35f;
		font-size: 0.7rem;
	}
	.tree-row--selected .direction-badge {
		color: #fff2c7;
	}
	.tree-row__label {
		min-width: 0;
		overflow: hidden;
		font-size: 0.74rem;
		font-weight: 570;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tree-row__meta {
		min-width: 0;
		margin-left: auto;
		color: #918c84;
		font-size: 0.62rem;
		font-variant-numeric: tabular-nums;
	}
	.tree-row--selected .tree-row__meta {
		color: #e8d5a3;
	}
	.tree-row__chevron {
		display: grid;
		width: 1.7rem;
		min-height: 2rem;
		place-items: center;
		padding: 0;
		border: 1px solid transparent;
		border-radius: 0.28rem;
		background: transparent;
		color: #d6b35f;
		cursor: pointer;
	}
	.tree-row__chevron:hover {
		border-color: #3a3a46;
		background: #202029;
	}
	.chevron {
		display: block;
		font-size: 1rem;
		line-height: 1;
		transform: rotate(0);
		transition: transform 120ms ease;
	}
	.chevron.open {
		transform: rotate(90deg);
	}
	.direction-row--empty .tree-row__label {
		color: #918c84;
		font-style: italic;
	}
	.empty {
		color: #918c84;
		font-size: 0.7rem;
		padding: 0.4rem 0.45rem;
	}
	.empty strong {
		color: #d6d0c4;
		font-size: 0.76rem;
	}
</style>
