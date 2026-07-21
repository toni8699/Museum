<script lang="ts">
	import {
		EDITOR_TIMELINE_COLLAPSED_HEIGHT,
		type MuseumEditorStore
	} from './museum-editor.svelte';

	let { store }: { store: MuseumEditorStore } = $props();
	const expanded = $derived(store.timelineExpanded);
	const height = $derived(
		expanded ? store.timelineHeight : EDITOR_TIMELINE_COLLAPSED_HEIGHT
	);
	const workspace = $derived(store.currentWorkspace);
</script>

<section
	class="timeline-frame"
	aria-label="Camera timeline"
	style={`grid-area: bottom; height: ${height}px;`}
>
	<header>
		<span class="legend">Camera timeline</span>
		{#if expanded}
			<p>
				Workspace: <strong>{workspace}</strong> · Height: <strong>{store.timelineHeight}px</strong> ·
				Camera transport and timeline lanes land here in Phase 1.3 / Phase 2.
			</p>
		{:else}
			<p>Camera timeline is collapsed. Click Expand to make room for camera transport.</p>
		{/if}
		<button
			type="button"
			class="toggle"
			aria-expanded={expanded}
			onclick={() => store.toggleTimeline()}
		>{expanded ? 'Collapse' : 'Expand'}</button>
	</header>
	{#if expanded}
		<div class="content" inert>
			<p>
				The bottom panel currently hosts the persistent frame only. Slice 1.3 will move the
				transport controls into this region and add a resizable drag handle.
			</p>
		</div>
	{/if}
</section>

<style>
	.timeline-frame {
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		border-top: 1px solid #2a2a33;
		background: #13131a;
	}
	header {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		padding: 0.5rem 0.9rem;
		min-height: 35px;
		box-sizing: border-box;
	}
	header p {
		margin: 0;
		color: #8f8a82;
		font-size: 0.68rem;
		flex: 1;
	}
	header p strong { color: #f4efe4; font-weight: 620; }
	.legend { font-weight: 650; font-size: 0.78rem; letter-spacing: 0.02em; color: #f4efe4; }
	.toggle {
		padding: 0.32rem 0.55rem;
		border: 1px solid #3a3a46;
		border-radius: 0.3rem;
		background: #1a1a22;
		color: #f4efe4;
		font: inherit;
		font-size: 0.72rem;
		cursor: pointer;
	}
	.toggle:hover { border-color: #d6b35f; }
	.content {
		padding: 0.7rem 0.9rem 0.9rem;
		border-top: 1px solid #2a2a33;
		color: #a8a29a;
		font-size: 0.72rem;
		line-height: 1.4;
	}
</style>
