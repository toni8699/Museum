<script lang="ts">
	import { ChevronDown, ChevronUp } from 'lucide-svelte';
	import { onDestroy } from 'svelte';
	import EditorCameraTimelinePanel from './EditorCameraTimelinePanel.svelte';
	import { getCameraPreviewScopeLabel } from './editor-camera-preview-affordances';
	import {
		EDITOR_TIMELINE_COLLAPSED_HEIGHT,
		EDITOR_TIMELINE_MAX_HEIGHT,
		EDITOR_TIMELINE_MIN_HEIGHT,
		type EditorStore
	} from '../editor-store.svelte';

	let {
		store,
		viewMode = '3d',
		contextMenu = null
	}: {
		store: EditorStore;
		viewMode?: 'plan' | '3d';
		contextMenu?: import('../context-menu/context-menu-state.svelte').EditorContextMenuStore | null;
	} = $props();
	const expanded = $derived(store.timelineExpanded);
	const height = $derived(
		expanded ? store.timelineHeight : EDITOR_TIMELINE_COLLAPSED_HEIGHT
	);
	const previewLabel = $derived(
		store.cameraPreview ? getCameraPreviewScopeLabel(store.document, store.cameraPreview) : null
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
			<span class="phase-label">Sequence · guided route &amp; framing</span>
		</div>
		<!-- P1.7 §3 — the canonical single-tour selector. The skeleton has
		     exactly one guided tour, so this is a read-only presentation of it
		     (aria-disabled, zero handlers): no multi-tour semantics exist yet,
		     and sequence order is authored in the sidebar's Sequence Inspector. -->
		<button
			type="button"
			class="tour-selector"
			aria-disabled="true"
			title="Main Visitor Tour — the single tour. Edit the order in the sidebar's Sequence Inspector."
		>
			<span>Main Visitor Tour</span>
			<ChevronDown size={13} aria-hidden="true" />
		</button>
		{#if previewLabel}
			<span class="preview-badge">{previewLabel}</span>
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
			<EditorCameraTimelinePanel {store} {viewMode} {contextMenu} />
		</div>
	{/if}
</section>

<style>
	.timeline-frame {
		position: relative;
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		border-top: 1px solid var(--editor-border-subtle);
		background: var(--editor-bg-panel);
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
		background: var(--editor-border-strong);
	}
	.resize-handle:hover::after,
	.resize-handle:focus-visible::after { background: var(--editor-accent); }
	.resize-handle:focus-visible { outline: 1px solid var(--editor-accent); outline-offset: -1px; }

	header {
		display: flex;
		height: 36px;
		flex: 0 0 36px;
		align-items: center;
		gap: 0.85rem;
		min-height: 36px;
		padding: 0.35rem 0.75rem 0.35rem 0.9rem;
		box-sizing: border-box;
		border-bottom: 1px solid transparent;
	}
	.timeline-frame:has(.content) header { border-bottom-color: var(--editor-border-subtle); }
	.heading { display: flex; align-items: baseline; gap: 0.6rem; min-width: 0; }
	.legend { font-weight: 650; font-size: 0.78rem; letter-spacing: 0.02em; color: var(--editor-text-primary); }
	.phase-label,
	.workspace-label { color: var(--editor-text-muted); font-size: 0.65rem; }
	.tour-selector {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.26rem 0.5rem;
		border: 1px solid var(--editor-border-normal);
		border-radius: 0.3rem;
		background: var(--editor-bg-panel-raised);
		color: var(--editor-text-secondary);
		font: inherit;
		font-size: 0.68rem;
		cursor: default;
	}
	.workspace-label { margin-left: auto; text-transform: capitalize; }
	.preview-badge {
		margin-left: auto;
		padding: 0.14rem 0.38rem;
		border: 1px solid var(--editor-accent-pressed);
		border-radius: 999px;
		color: var(--editor-text-primary);
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
		border: 1px solid var(--editor-border-normal);
		border-radius: 0.3rem;
		background: var(--editor-bg-panel-raised);
		color: var(--editor-text-primary);
		font: inherit;
		font-size: 0.7rem;
		cursor: pointer;
	}
	.toggle:hover:not(:disabled) { border-color: var(--editor-accent); }
	.toggle:disabled { opacity: 0.42; cursor: default; }

	.content {
		min-height: 0;
		flex: 1;
		overflow: auto;
		padding: 0 0.75rem;
	}
	@media (max-width: 44rem) {
		header { gap: 0.45rem; padding-inline: 0.6rem; }
		.phase-label, .workspace-label { display: none; }
		.preview-badge { margin-left: auto; }
		.content { padding-inline: 0.6rem; }
	}
</style>
