<script lang="ts">
	import type { CameraConnectionDirection } from '$lib/types/museum';
	import type {
		SceneCameraViewKeyframe,
		SceneConnectionViewTracks
	} from '$lib/content/scene';
	import type { MuseumEditorStore } from './museum-editor.svelte';

	// H1 S4 — optional interactivity gate (the unified tree renders the camera
	// branch read-only in Plan). When false, keyframe rows are aria-disabled
	// with no click handler. The relic never passes the prop and is unchanged.
	let {
		store,
		connectionId,
		direction,
		interactive = true
	}: {
		store: MuseumEditorStore;
		connectionId: string;
		direction: CameraConnectionDirection;
		interactive?: boolean;
	} = $props();

	function readKeyframes(
		tracks: SceneConnectionViewTracks | undefined,
		trackDirection: CameraConnectionDirection
	): SceneCameraViewKeyframe[] {
		if (!tracks) return [];
		return trackDirection === 'forward' ? tracks.forward : tracks.reverse;
	}

	const keyframes = $derived.by(() => {
		const connection = store.document.connections.find(
			(candidate) => candidate.id === connectionId
		);
		return readKeyframes(connection?.viewTracks, direction).map((keyframe) => ({
			id: keyframe.id,
			direction,
			connectionId,
			progress: keyframe.progress
		}));
	});

	function isKeyframeSelected(keyframeId: string) {
		return (
			store.navigationSelection?.kind === 'view-keyframe' &&
			store.navigationSelection.connectionId === connectionId &&
			store.navigationSelection.direction === direction &&
			store.navigationSelection.keyframeId === keyframeId
		);
	}
</script>

<ul class="keyframe-list" role="group">
	{#if keyframes.length === 0}
		<li class="empty-row" role="presentation">
			<span class="empty-row__text">No view keys</span>
		</li>
	{/if}
	{#each keyframes as keyframe (keyframe.id)}
		<li role="treeitem" aria-selected={isKeyframeSelected(keyframe.id)} aria-disabled={interactive ? undefined : true}>
			<button
				type="button"
				class="tree-row keyframe-row"
				class:tree-row--selected={isKeyframeSelected(keyframe.id)}
				aria-disabled={interactive ? undefined : true}
				onclick={interactive
					? () =>
							store.selectCameraTimelineViewKeyframe(connectionId, direction, keyframe.id)
					: undefined}
			>
				<span class="tree-row__diamond" aria-hidden="true">◇</span>
				<span class="tree-row__label" title={keyframe.id}>{keyframe.id}</span>
				{#if keyframe.progress !== undefined}
					<span class="tree-row__meta">{Math.round(keyframe.progress * 100)}%</span>
				{/if}
			</button>
		</li>
	{/each}
</ul>

<style>
	ul {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 0.1rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.keyframe-list {
		margin-left: 1.05rem;
		padding-left: 0.62rem;
		border-left: 1px solid #4a4438;
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
	.tree-row__diamond {
		flex: 0 0 1.25rem;
		color: #d6b35f;
		font-size: 0.7rem;
	}
	.tree-row--selected .tree-row__diamond {
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
	.empty-row__text {
		color: #918c84;
		font-size: 0.7rem;
		padding: 0.4rem 0.45rem;
	}
</style>
