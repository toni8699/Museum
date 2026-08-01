<script lang="ts">
	import type { CameraConnectionDirection } from '$lib/types/museum';
	import type {
		SceneCameraViewKeyframe,
		SceneConnectionViewTracks
	} from '$lib/content/scene';
	import DirectionalKeyframeList from './DirectionalKeyframeList.svelte';
	import { getNodeConnections } from './editor-camera-connections';
	import { formatCameraNodeLabel } from './editor-outliner';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	let { store, nodeId }: { store: MuseumEditorStore; nodeId: string } = $props();

	const nodeConnections = $derived(getNodeConnections(store.document, nodeId));
	const rows = $derived([...nodeConnections.outgoing, ...nodeConnections.incoming]);
	const partnerLabels = $derived(
		new Map(
			store.document.navigationNodes.map((candidate) => [
				candidate.id,
				formatCameraNodeLabel(candidate.label, candidate.id)
			])
		)
	);

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

	function travelAwayDirection(bucket: 'outgoing' | 'incoming'): CameraConnectionDirection {
		return bucket === 'outgoing' ? 'forward' : 'reverse';
	}
</script>

{#if rows.length === 0}
	<p class="empty">No connections</p>
{:else}
	<ul class="connections" role="group" aria-label={`Connections for ${nodeId}`}>
		{#each rows as row (row.connectionId)}
			{@const forwardCount = keyframeCount(row.connectionId, 'forward')}
			{@const reverseCount = keyframeCount(row.connectionId, 'reverse')}
			{@const partnerLabel = partnerLabels.get(row.partnerId) ?? row.partnerId}
			{@const travelDirection = travelAwayDirection(row.bucket)}
			<li
				role="treeitem"
				aria-expanded={isConnectionExpanded(row.connectionId)}
				aria-selected={isConnectionHeaderSelected(row.connectionId)}
			>
				<div class="connection-line">
					<button
						type="button"
						class="tree-row__chevron"
						aria-label={`${isConnectionExpanded(row.connectionId) ? 'Collapse' : 'Expand'} ${partnerLabel}`}
						aria-expanded={isConnectionExpanded(row.connectionId)}
						onclick={() => store.toggleCameraConnectionTreeExpansion(row.connectionId)}
					>
						<span class="chevron" class:open={isConnectionExpanded(row.connectionId)}>›</span>
					</button>
					<button
						type="button"
						class="tree-row connection-row"
						class:tree-row--selected={isConnectionHeaderSelected(row.connectionId)}
						class:outgoing={row.bucket === 'outgoing'}
						class:incoming={row.bucket === 'incoming'}
						onclick={() =>
							store.selectionActions.selectCameraConnectionDirection(
								row.connectionId,
								travelDirection
							)}
						title={`${row.connectionId} · ${row.bucket}`}
					>
						<span class="direction-badge" aria-hidden="true"
							>{row.bucket === 'outgoing' ? '▶' : '◀'}</span
						>
						<span class="tree-row__label" title={partnerLabel}>{partnerLabel}</span>
						<span class="tree-row__meta">{forwardCount + reverseCount}</span>
					</button>
				</div>
				{#if isConnectionExpanded(row.connectionId)}
					<ul class="direction-group" role="group">
						{#each ['forward', 'reverse'] as const as direction (directionTreeKey(row.connectionId, direction))}
							{@const expanded = isDirectionExpanded(row.connectionId, direction)}
							{@const count = direction === 'forward' ? forwardCount : reverseCount}
							<li
								role="treeitem"
								aria-expanded={expanded}
								aria-selected={isDirectionSelected(row.connectionId, direction)}
							>
								<div class="direction-line">
									<button
										type="button"
										class="tree-row__chevron"
										aria-label={`${expanded ? 'Collapse' : 'Expand'} ${direction} keys`}
										aria-expanded={expanded}
										onclick={() =>
											store.toggleCameraDirectionTreeExpansion(row.connectionId, direction)}
									>
										<span class="chevron" class:open={expanded}>›</span>
									</button>
									<button
										type="button"
										class="tree-row direction-row"
										class:tree-row--selected={isDirectionSelected(row.connectionId, direction)}
										class:direction-row--empty={count === 0}
										onclick={() =>
											store.selectionActions.selectCameraConnectionDirection(
												row.connectionId,
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
										connectionId={row.connectionId}
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
{/if}

<style>
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
		margin: 0.12rem 0 0.22rem 0.85rem;
		padding-left: 0.65rem;
		border-left: 1px solid #36323a;
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
	.connection-row.incoming .direction-badge {
		color: #6e8aa6;
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
		margin: 0.12rem 0 0.22rem 1.5rem;
		color: #918c84;
		font-size: 0.66rem;
	}
</style>
