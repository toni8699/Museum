<script lang="ts">
	import { ChevronDown, ChevronUp } from 'lucide-svelte';
	import { onDestroy } from 'svelte';
	import EditorCameraTimelinePanel from './EditorCameraTimelinePanel.svelte';
	import {
		EDITOR_TIMELINE_COLLAPSED_HEIGHT,
		EDITOR_TIMELINE_MAX_HEIGHT,
		EDITOR_TIMELINE_MIN_HEIGHT,
		type MuseumEditorStore
	} from './museum-editor.svelte';

	let { store, viewMode = '3d' }: { store: MuseumEditorStore; viewMode?: 'plan' | '3d' } = $props();
	const expanded = $derived(store.timelineExpanded);
	const height = $derived(
		expanded ? store.timelineHeight : EDITOR_TIMELINE_COLLAPSED_HEIGHT
	);
	let resizing = $state(false);
	let resizeStartY = 0;
	let resizeStartHeight = 0;

	function stopResize() {
		if (!resizing) return;
		resizing = false;
		window.removeEventListener('pointermove', resizeTimeline);
		window.removeEventListener('pointerup', stopResize);
		window.removeEventListener('pointercancel', stopResize);
	}

	function resizeTimeline(event: PointerEvent) {
		if (!resizing) return;
		store.setTimelineHeight(resizeStartHeight + resizeStartY - event.clientY);
	}

	function startResize(event: PointerEvent) {
		if (!expanded || store.isDocumentMutationBlocked || store.isEditorInteractionActive) return;
		event.preventDefault();
		resizeStartY = event.clientY;
		resizeStartHeight = store.timelineHeight;
		resizing = true;
		window.addEventListener('pointermove', resizeTimeline);
		window.addEventListener('pointerup', stopResize);
		window.addEventListener('pointercancel', stopResize);
	}

	function resizeWithKeyboard(event: KeyboardEvent) {
		if (!expanded) return;
		let nextHeight = store.timelineHeight;
		if (event.key === 'ArrowUp') nextHeight += 10;
		else if (event.key === 'ArrowDown') nextHeight -= 10;
		else if (event.key === 'Home') nextHeight = EDITOR_TIMELINE_MIN_HEIGHT;
		else if (event.key === 'End') nextHeight = EDITOR_TIMELINE_MAX_HEIGHT;
		else return;
		event.preventDefault();
		store.setTimelineHeight(nextHeight);
	}

	onDestroy(stopResize);
</script>

<section
	class="timeline-frame"
	class:resizing
	aria-label="Camera timeline"
	style={`grid-area: bottom; height: ${height}px;`}
>
	{#if expanded}
		<!-- svelte-ignore a11y_no_noninteractive_tabindex (interactive separator follows the WAI-ARIA window-splitter pattern) -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions (interactive separator follows the WAI-ARIA window-splitter pattern) -->
		<div
			class="resize-handle"
			role="separator"
			aria-label="Resize camera timeline"
			aria-orientation="horizontal"
			aria-valuemin={EDITOR_TIMELINE_MIN_HEIGHT}
			aria-valuemax={EDITOR_TIMELINE_MAX_HEIGHT}
			aria-valuenow={store.timelineHeight}
			tabindex="0"
			onpointerdown={startResize}
			onkeydown={resizeWithKeyboard}
		></div>
	{/if}

	<header>
		<div class="heading">
			<span class="legend">Camera timeline</span>
			<span class="phase-label">Camera flow · exact shared motion</span>
		</div>
		{#if store.cameraPreview}
			<span class="preview-badge">Preview active</span>
		{:else if expanded}
			<span class="workspace-label">{store.currentWorkspace} workspace</span>
		{/if}
		<button
			type="button"
			class="toggle"
			aria-expanded={expanded}
			disabled={store.isDocumentMutationBlocked || store.isEditorInteractionActive}
			onclick={() => store.toggleTimeline()}
		>			{#if expanded}
				<ChevronDown size={14} aria-hidden="true" /> Collapse
			{:else}
				<ChevronUp size={14} aria-hidden="true" /> Expand
			{/if}
		</button>

	</header>

	{#if expanded}
		<div class="content">
			<EditorCameraTimelinePanel {store} {viewMode} />
		</div>
	{/if}
</section>

<style>
	.timeline-frame {
		position: relative;
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		border-top: 1px solid #2a2a33;
		background: #13131a;
	}
	.timeline-frame.resizing { user-select: none; }

	.resize-handle {
		position: absolute;
		top: -4px;
		left: 0;
		right: 0;
		z-index: 5;
		height: 8px;
		cursor: ns-resize;
	}
	.resize-handle::after {
		content: '';
		position: absolute;
		top: 3px;
		left: 50%;
		width: 3.5rem;
		height: 2px;
		transform: translateX(-50%);
		border-radius: 999px;
		background: #4a4852;
	}
	.resize-handle:hover::after,
	.resize-handle:focus-visible::after { background: #d6b35f; }
	.resize-handle:focus-visible { outline: 1px solid #d6b35f; outline-offset: -1px; }

	header {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		min-height: 36px;
		padding: 0.35rem 0.75rem 0.35rem 0.9rem;
		box-sizing: border-box;
		border-bottom: 1px solid transparent;
	}
	.timeline-frame:has(.content) header { border-bottom-color: #2a2a33; }
	.heading { display: flex; align-items: baseline; gap: 0.6rem; min-width: 0; }
	.legend { font-weight: 650; font-size: 0.78rem; letter-spacing: 0.02em; color: #f4efe4; }
	.phase-label,
	.workspace-label { color: #77736d; font-size: 0.65rem; }
	.workspace-label { margin-left: auto; text-transform: capitalize; }
	.preview-badge {
		margin-left: auto;
		padding: 0.14rem 0.38rem;
		border: 1px solid #6f5d32;
		border-radius: 999px;
		color: #f4dc9b;
		font-size: 0.6rem;
		font-weight: 650;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.3rem 0.52rem;
		border: 1px solid #3a3a46;
		border-radius: 0.3rem;
		background: #1a1a22;
		color: #f4efe4;
		font: inherit;
		font-size: 0.7rem;
		cursor: pointer;
	}
	.toggle:hover:not(:disabled) { border-color: #d6b35f; }
	.toggle:disabled { opacity: 0.42; cursor: default; }

	.content {
		min-height: 0;
		flex: 1;
		overflow: auto;
		padding: 0.75rem 0.9rem 0.9rem;
	}
	@media (max-width: 44rem) {
		header { gap: 0.45rem; padding-inline: 0.6rem; }
		.phase-label, .workspace-label { display: none; }
		.preview-badge { margin-left: auto; }
		.content { padding-inline: 0.6rem; }
	}
</style>
