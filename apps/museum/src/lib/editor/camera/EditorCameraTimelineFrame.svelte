<script lang="ts">
	import { ChevronDown, ChevronUp } from 'lucide-svelte';
	import { isFlowNode } from '$lib/content/scene';
	import { onDestroy, tick } from 'svelte';
	import EditorCameraTimelinePanel from './EditorCameraTimelinePanel.svelte';
	import { getCameraEdgePreviewChoices } from './editor-camera-preview-affordances';
	import { useCameraTimeline } from '../hooks/use-camera-timeline.svelte';
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
	// svelte-ignore state_referenced_locally
	const timelineApi = useCameraTimeline(store);
	// P11.3 §4 — the scope capsule replaces the old `preview-badge`; it owns
	// all scope text (no duplicate prose in the panel or preview controls).
	const capsule = $derived(timelineApi.scopeCapsule);
	const scopeLabel = $derived(!store.isRelic ? capsule ?? 'Sequence' : null);
	const selectedConnection = $derived(store.selectedConnection);
	const selectedNode = $derived.by(() => {
		const selection = store.navigationSelection;
		return selection?.kind === 'node'
			? store.document.navigationNodes.find((node) => node.id === selection.nodeId) ?? null
			: null;
	});
	const selectedUnsequencedNode = $derived(
		selectedNode && !store.isRelic && !isFlowNode(selectedNode) ? selectedNode : null
	);
	const selectedEdgeChoices = $derived.by(() =>
		selectedConnection
			? getCameraEdgePreviewChoices(
					store.document,
					store.guidedTourNodeIds,
					selectedConnection
			  )
			: null
	);

	type ScopeMenuItem = {
		id: string;
		label: string;
		action?: () => void;
		heading?: boolean;
	};

	const scopeMenuItems = $derived.by((): ScopeMenuItem[] => {
		const items: ScopeMenuItem[] = [
			{
				id: 'sequence',
				label: '🎞 Sequence (Full Tour)',
				action: () => store.enterSequenceScope()
			}
		];
		const choices = selectedEdgeChoices;
		if (selectedConnection && choices) {
			if (choices.sequenceAdjacent) {
				const choice = choices.choices[0];
				if (choice) {
					items.push({
						id: 'edge',
						label: `⇄ Preview Edge · ${choice.label}`,
						action: () =>
							void store.previewEdge(
								selectedConnection.id,
								choice.direction,
								store.cameraPreview?.mode ?? 'director'
							)
					});
				}
			} else {
				items.push({ id: 'edge-heading', label: '⇄ Preview Edge…', heading: true });
				for (const choice of choices.choices) {
					items.push({
						id: `edge-${choice.direction}`,
						label: choice.label,
						action: () =>
							void store.previewEdge(
								selectedConnection.id,
								choice.direction,
								store.cameraPreview?.mode ?? 'director'
							)
					});
				}
			}
		}
		if (selectedUnsequencedNode) {
			const node = selectedUnsequencedNode;
			items.push({
				id: 'camera',
				label: `📷 Preview Camera · ${node.label}`,
				action: () => void store.previewCamera(node.id, store.cameraPreview?.mode ?? 'director')
			});
		}
		return items;
	});

	let pillMenuOpen = $state(false);
	let pillButton = $state<HTMLButtonElement | null>(null);
	let pillMenu = $state<HTMLElement | null>(null);
	let menuSelectionKey = '';
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
		// P11.2 §3 — CH·AA: timeline resize stays enabled under a playing Director
		// preview; only an active gesture blocks.
		if (!expanded || store.isEditorInteractionActive) return;
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

	function selectionKey() {
		const selection = store.navigationSelection;
		if (!selection) return 'none';
		if (selection.kind === 'node') return `node:${selection.nodeId}`;
		if (selection.kind === 'connection') return `connection:${selection.connectionId}`;
		if (selection.kind === 'anchor') return `anchor:${selection.connectionId}:${selection.anchorId}`;
		return `view-keyframe:${selection.connectionId}:${selection.direction}:${selection.keyframeId}`;
	}

	function closePillMenu(returnFocus = false) {
		pillMenuOpen = false;
		if (returnFocus) void tick().then(() => pillButton?.focus());
	}

	function runScopeItem(item: ScopeMenuItem) {
		if (!item.action) return;
		closePillMenu();
		item.action();
		void tick().then(() => pillButton?.focus());
	}

	function togglePillMenu() {
		if (store.isRelic) return;
		if (pillMenuOpen) closePillMenu(true);
		else pillMenuOpen = true;
	}

	function menuButtons() {
		return pillMenu
			? Array.from(pillMenu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).filter(
					(button) => !button.disabled
			  )
			: [];
	}

	function handlePillMenuKeydown(event: KeyboardEvent) {
		const buttons = menuButtons();
		const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			if (buttons.length === 0) return;
			event.preventDefault();
			const delta = event.key === 'ArrowDown' ? 1 : -1;
			buttons[(currentIndex + delta + buttons.length) % buttons.length]?.focus();
		} else if (event.key === 'Enter' || event.key === ' ') {
			const active = document.activeElement;
			if (active instanceof HTMLButtonElement && pillMenu?.contains(active)) {
				event.preventDefault();
				active.click();
			}
		} else if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			closePillMenu(true);
		} else if (event.key === 'Tab') {
			pillMenuOpen = false;
		}
	}

	function handlePillKeydown(event: KeyboardEvent) {
		if (
			!pillMenuOpen &&
			(event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')
		) {
			event.preventDefault();
			pillMenuOpen = true;
		}
	}

	$effect(() => {
		const key = selectionKey();
		if (pillMenuOpen && menuSelectionKey && menuSelectionKey !== key) pillMenuOpen = false;
		menuSelectionKey = key;
		if (store.isRelic) pillMenuOpen = false;
	});

	$effect(() => {
		if (!pillMenuOpen) return;
		void tick().then(() => {
			if (!pillMenuOpen) return;
			pillMenu?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
		});
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as Node;
			if (!pillMenu?.contains(target) && target !== pillButton) closePillMenu();
		};
		const onWindowKeydown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			event.preventDefault();
			event.stopPropagation();
			closePillMenu(true);
		};
		window.addEventListener('pointerdown', onPointerDown, true);
		window.addEventListener('keydown', onWindowKeydown, true);
		return () => {
			window.removeEventListener('pointerdown', onPointerDown, true);
			window.removeEventListener('keydown', onWindowKeydown, true);
		};
	});

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
		{#if scopeLabel}
			<div class="scope-switcher">
				<button
					bind:this={pillButton}
					type="button"
					class="scope-capsule"
					aria-haspopup="menu"
					aria-expanded={pillMenuOpen}
					aria-label={`Camera preview scope: ${scopeLabel}`}
					title={scopeLabel}
					onclick={togglePillMenu}
					onkeydown={handlePillKeydown}
				>
					<span>🎞 {scopeLabel}</span>
					<ChevronDown size={13} aria-hidden="true" />
				</button>
				{#if pillMenuOpen}
					<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
					<div
						bind:this={pillMenu}
						class="scope-menu"
						role="menu"
						aria-label="Camera preview scope"
						tabindex="-1"
						onkeydown={handlePillMenuKeydown}
					>
						{#each scopeMenuItems as item (item.id)}
							{#if item.heading}
								<div class="scope-menu-heading" role="presentation">{item.label}</div>
							{:else}
								<button
									type="button"
									role="menuitem"
									class:indented={item.id.startsWith('edge-')}
									onclick={() => runScopeItem(item)}
								>{item.label}</button>
							{/if}
						{/each}
					</div>
				{/if}
			</div>
		{:else if capsule}
			<span class="scope-capsule relic-scope-capsule">{capsule}</span>
		{:else if expanded}
			<span class="workspace-label">{store.currentWorkspace} workspace</span>
		{/if}
		<!-- P11.2 §3 — CH·AA: the timeline toggle stays enabled under a playing
		     Director preview; only an active gesture blocks. -->
		<button
			type="button"
			class="toggle"
			aria-expanded={expanded}
			disabled={store.isEditorInteractionActive}
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
		white-space: nowrap;
		overflow: visible;
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
	.scope-switcher { position: relative; min-width: 0; margin-left: auto; }
	.scope-capsule {
		display: inline-flex;
		max-width: 20rem;
		align-items: center;
		gap: 0.28rem;
		padding: 0.14rem 0.38rem;
		border: 1px solid var(--editor-accent-pressed);
		border-radius: 999px;
		background: transparent;
		color: var(--editor-text-primary);
		font: inherit;
		font-size: 0.6rem;
		font-weight: 650;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		white-space: nowrap;
	}
	button.scope-capsule { cursor: pointer; }
	button.scope-capsule:hover,
	button.scope-capsule:focus-visible { border-color: var(--editor-accent); outline: none; }
	.scope-capsule > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.relic-scope-capsule { margin-left: auto; }
	.scope-menu {
		position: absolute;
		top: calc(100% + 0.3rem);
		right: 0;
		z-index: 20;
		display: grid;
		min-width: 15rem;
		max-width: min(24rem, 70vw);
		padding: 0.25rem;
		border: 1px solid var(--editor-border-normal);
		border-radius: 0.35rem;
		background: var(--editor-bg-panel-raised);
		box-shadow: var(--editor-shadow-popover);
	}
	.scope-menu-heading {
		padding: 0.38rem 0.55rem 0.22rem;
		color: var(--editor-text-muted);
		font-size: 0.62rem;
		font-weight: 650;
	}
	.scope-menu button {
		padding: 0.38rem 0.55rem;
		border: 0;
		border-radius: 0.25rem;
		background: transparent;
		color: var(--editor-text-primary);
		font: inherit;
		font-size: 0.68rem;
		text-align: left;
		white-space: nowrap;
		cursor: pointer;
	}
	.scope-menu button.indented { padding-left: 1.15rem; }
	.scope-menu button:hover,
	.scope-menu button:focus-visible { background: var(--editor-bg-hover); outline: none; }
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
		.scope-capsule { max-width: 12rem; }
		.content { padding-inline: 0.6rem; }
	}
</style>
