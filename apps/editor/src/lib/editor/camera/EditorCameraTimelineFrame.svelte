<script lang="ts">
	import {
		ArrowLeftRight,
		ChevronDown,
		ChevronUp,
		CircleAlert,
		Crosshair,
		EllipsisVertical,
		Eye,
		Pause,
		Play,
		Scan,
		Video
	} from 'lucide-svelte';
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
	const preview = $derived(store.cameraPreview);
	const scope = $derived(timelineApi.scope);
	const timeline = $derived(timelineApi.timeline);
	const edgeTimeline = $derived(timelineApi.edgeTimeline);
	const result = $derived(timelineApi.timelineResult);
	const playhead = $derived(timelineApi.playhead);
	const edgePlayhead = $derived(timelineApi.edgePlayhead);
	const durationSeconds = $derived(timelineApi.durationSeconds);
	const previewPlaying = $derived(timelineApi.previewPlaying);
	const cameraMode = $derived(preview?.mode ?? 'director');
	const hasTemporalTimeline = $derived(
		(scope === 'sequence' && timeline !== null) || (scope === 'edge' && edgeTimeline !== null)
	);
	const activePlayhead = $derived(scope === 'edge' ? edgePlayhead : playhead);
	const showCollapsedScrubber = $derived(!expanded && hasTemporalTimeline);
	const collapsedScrubDisabled = $derived(
		scope === 'edge' ? timelineApi.edgeScrubDisabled : timelineApi.scrubDisabled
	);
	const collapsedScrubberLabel = $derived(
		scope === 'edge' ? 'Edge playhead' : 'Sequence playhead'
	);
	const previousNodeDisabled = $derived(
		!hasTemporalTimeline ||
		activePlayhead <= 0 ||
		store.isEditorInteractionActive ||
		store.isDocumentTransactionActive
	);
	const nextNodeDisabled = $derived(
		!hasTemporalTimeline ||
		activePlayhead >= 1 ||
		store.isEditorInteractionActive ||
		store.isDocumentTransactionActive
	);
	const targetKindLabel = $derived(
		store.navigationSelection?.kind === 'connection' ? 'Edge' : 'Camera'
	);
	const headerDiagnostic = $derived.by(() => {
		const diagnostic = result.diagnostic;
		if (diagnostic.kind === 'gap') return `Gap at ${nodeLabel(diagnostic.fromNodeId)}`;
		if (diagnostic.kind === 'no-flow') return null;
		if (diagnostic.kind === 'invalid-target') return `${targetKindLabel} unavailable`;
		return null;
	});
	const sequenceAvailable = $derived(timeline !== null);
	// P11.3 §4 — the scope capsule replaces the old `preview-badge`; it owns
	// all scope text (no duplicate prose in the panel or preview controls).
	const capsule = $derived(timelineApi.scopeCapsule);
	const scopeLabel = $derived.by(() => {
		if (store.isRelic) return null;
		if (scope === 'idle' || scope === 'sequence') return 'Sequence (Full Tour)';
		if (scope === 'edge') {
			const endpoints = timelineApi.edgeEndpoints;
			if (endpoints) return `${endpoints.fromLabel} → ${endpoints.toLabel}`;
		}
		return capsule ?? 'Camera';
	});
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
				label: 'Sequence (Full Tour)',
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
						label: choice.label,
						action: () =>
							void store.previewEdge(
								selectedConnection.id,
								choice.direction,
								store.cameraPreview?.mode ?? 'director'
							)
					});
				}
			} else {
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
	let moreMenuOpen = $state(false);
	let moreButton = $state<HTMLButtonElement | null>(null);
	let moreMenu = $state<HTMLElement | null>(null);
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
		else {
			moreMenuOpen = false;
			pillMenuOpen = true;
		}
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

	function choosePreviewMode(mode: 'director' | 'visitor') {
		if (preview) store.setCameraPreviewMode(mode);
		else if (mode === 'visitor') store.enterSequenceScope('visitor');
	}

	function stepNode(direction: -1 | 1) {
		timelineApi.stepNodeBoundary(direction);
	}

	function scrubCollapsed(event: Event) {
		const progress = Number((event.currentTarget as HTMLInputElement).value);
		if (previewPlaying) store.pauseCameraPreview();
		if (scope === 'edge') timelineApi.seekEdge(progress);
		else timelineApi.seek(progress);
	}

	function closeMoreMenu(returnFocus = false) {
		moreMenuOpen = false;
		if (returnFocus) void tick().then(() => moreButton?.focus());
	}

	function toggleMoreMenu() {
		if (moreMenuOpen) closeMoreMenu(true);
		else {
			pillMenuOpen = false;
			moreMenuOpen = true;
		}
	}

	function moreMenuButtons() {
		return moreMenu
			? Array.from(
					moreMenu.querySelectorAll<HTMLButtonElement>('[role="menuitem"], [role="menuitemcheckbox"]')
			  ).filter(
					(button) => !button.disabled
			  )
			: [];
	}

	function handleMoreMenuKeydown(event: KeyboardEvent) {
		const buttons = moreMenuButtons();
		const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			if (buttons.length === 0) return;
			event.preventDefault();
			const delta = event.key === 'ArrowDown' ? 1 : -1;
			buttons[(currentIndex + delta + buttons.length) % buttons.length]?.focus();
		} else if (event.key === 'Enter' || event.key === ' ') {
			const active = document.activeElement;
			if (active instanceof HTMLButtonElement && moreMenu?.contains(active)) {
				event.preventDefault();
				active.click();
			}
		} else if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			closeMoreMenu(true);
		} else if (event.key === 'Tab') {
			moreMenuOpen = false;
		}
	}

	function handleMoreKeydown(event: KeyboardEvent) {
		if (
			!moreMenuOpen &&
			(event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')
		) {
			event.preventDefault();
			moreMenuOpen = true;
		}
	}

	function hasOverflowItems() {
		return Boolean(preview && cameraMode === 'director');
	}

	function formatTime(seconds: number) {
		const safe = Math.max(0, seconds);
		const minutes = Math.floor(safe / 60);
		const remainder = safe - minutes * 60;
		return `${String(minutes).padStart(2, '0')}:${remainder.toFixed(2).padStart(5, '0')}`;
	}

	function nodeLabel(nodeId: string) {
		return store.document.navigationNodes.find((node) => node.id === nodeId)?.label ?? nodeId;
	}

	$effect(() => {
		const key = selectionKey();
		if (pillMenuOpen && menuSelectionKey && menuSelectionKey !== key) pillMenuOpen = false;
		menuSelectionKey = key;
		if (store.isRelic) pillMenuOpen = false;
		if (!hasOverflowItems()) moreMenuOpen = false;
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

	$effect(() => {
		if (!moreMenuOpen) return;
		void tick().then(() => {
			if (!moreMenuOpen) return;
								moreMenu
									?.querySelector<HTMLButtonElement>(
										'[role="menuitem"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled)'
									)
									?.focus();
		});
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as Node;
			if (!moreMenu?.contains(target) && target !== moreButton) closeMoreMenu();
		};
		const onWindowKeydown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			event.preventDefault();
			event.stopPropagation();
			closeMoreMenu(true);
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
	class:live={!store.isRelic}
	class:relic={store.isRelic}
	class:expanded
	class:collapsed={!expanded}
	aria-label="Camera timeline"
	style={`height: ${height}px;${store.isRelic ? ' grid-area: bottom;' : ''}`}
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

	{#if store.isRelic}
		<header class="relic-header">
			<div class="heading">
				<span class="legend">Camera timeline</span>
				<span class="phase-label">Sequence · guided route &amp; framing</span>
			</div>
			<!-- Frozen `/museum/editor` selector: one relic tour, no menu semantics. -->
			<button
				type="button"
				class="tour-selector"
				aria-disabled="true"
				title="Main Visitor Tour — the single tour. Edit the order in the sidebar's Sequence Inspector."
			>
				<span>Main Visitor Tour</span>
				<ChevronDown size={13} aria-hidden="true" />
			</button>
			{#if capsule}
				<span class="scope-capsule relic-scope-capsule">{capsule}</span>
			{:else if expanded}
				<span class="workspace-label">{store.currentWorkspace} workspace</span>
			{/if}
			<!-- Relic keeps the P11.4 text toggle and lifecycle behavior. -->
			<button
				type="button"
				class="toggle"
				aria-expanded={expanded}
				disabled={store.isEditorInteractionActive}
				onclick={() => store.toggleTimeline()}
			>
				{#if expanded}
					<ChevronDown size={14} aria-hidden="true" /> Collapse
				{:else}
					<ChevronUp size={14} aria-hidden="true" /> Expand
				{/if}
			</button>
		</header>
	{:else if expanded || !showCollapsedScrubber}
		<header class="s4-header">
			{#if sequenceAvailable}
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
						<span>{scopeLabel}</span>
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
			{:else}
				<div class="scope-capsule scope-status" role="status" aria-label="No sequence yet">
					<CircleAlert size={13} aria-hidden="true" />
					<span>No sequence yet</span>
				</div>
			{/if}
			{#if scope !== 'camera'}
				<button
					type="button"
					class="header-icon edge-flip"
					aria-label="Flip edge. Swap travel direction, reset to start."
					title="Flip edge. Swap travel direction, reset to start."
					disabled={!edgeTimeline || timelineApi.edgeReverseDisabled}
					onclick={() => timelineApi.swapEdgeReverse()}
				><ArrowLeftRight size={14} aria-hidden="true" /></button>
			{/if}

			<div class="mode-control" role="group" aria-label="Camera preview mode">
				<button
					type="button"
					class:active={cameraMode === 'visitor'}
					aria-pressed={cameraMode === 'visitor'}
					aria-label="POV"
					title="Through Camera"
					onclick={() => choosePreviewMode('visitor')}
				><Video size={13} aria-hidden="true" /><span>POV</span></button>
				<button
					type="button"
					class:active={cameraMode === 'director'}
					aria-pressed={cameraMode === 'director'}
					aria-label="Observer"
					title="Observer"
					onclick={() => choosePreviewMode('director')}
				><Eye size={13} aria-hidden="true" /><span>Observer</span></button>
			</div>

			<div class="observer-actions" role="group" aria-label="Observer tools">
				{#if cameraMode === 'director'}
					<button
						type="button"
						class:active={store.cameraPreviewFollowEnabled}
						aria-pressed={store.cameraPreviewFollowEnabled}
						aria-label="Follow camera"
						title="Follow camera"
						disabled={!preview || store.isEditorInteractionActive || store.isDocumentTransactionActive}
						onclick={() => store.toggleCameraPreviewFollow()}
					><Crosshair size={13} aria-hidden="true" /></button>
					<button
						type="button"
						aria-label="Recenter camera"
						title="Recenter camera"
						disabled={!preview || store.isEditorInteractionActive || store.isDocumentTransactionActive}
						onclick={() => store.recenterCameraPreview()}
					><Scan size={13} aria-hidden="true" /></button>
				{:else}
					<span class="observer-slot" aria-hidden="true"></span>
					<span class="observer-slot" aria-hidden="true"></span>
				{/if}
			</div>

			{#if scope !== 'camera'}
				<div class="header-transport" aria-label="Camera timeline transport">
					<button type="button" class="header-icon" aria-label="Previous camera node" title="Previous camera node" disabled={previousNodeDisabled} onclick={() => stepNode(-1)}><span aria-hidden="true">|◀</span></button>
					<button type="button" class="header-icon" class:active={previewPlaying} aria-label={scope === 'idle' ? 'Play camera flow' : timelineApi.playLabel} title={scope === 'idle' ? 'Play camera flow' : timelineApi.playLabel} disabled={!timelineApi.canPlay} onclick={() => timelineApi.toggleTourPlayback()}>{#if previewPlaying}<Pause size={14} aria-hidden="true" />{:else}<Play size={14} aria-hidden="true" />{/if}</button>
					<button type="button" class="header-icon" aria-label="Next camera node" title="Next camera node" disabled={nextNodeDisabled} onclick={() => stepNode(1)}><span aria-hidden="true">▶│</span></button>
					<output class="timecode" aria-label="Camera timeline time">{formatTime(timelineApi.currentSeconds)} / {formatTime(durationSeconds)}</output>
				</div>
			{/if}

			{#if headerDiagnostic}
				<div class="diagnostic" role="status" title={headerDiagnostic} aria-label={headerDiagnostic}>
					<CircleAlert size={13} aria-hidden="true" />
					<span class="diagnostic-copy">{headerDiagnostic}</span>
				</div>
			{/if}

			{#if hasOverflowItems()}
				<div class="more-tools">
					<button
						bind:this={moreButton}
						type="button"
						class="header-icon more-trigger"
						aria-haspopup="menu"
						aria-expanded={moreMenuOpen}
						aria-label="More timeline actions"
						title="More timeline actions"
						onclick={toggleMoreMenu}
						onkeydown={handleMoreKeydown}
					><EllipsisVertical size={14} aria-hidden="true" /></button>
					{#if moreMenuOpen}
						<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
						<div
							bind:this={moreMenu}
							class="more-menu"
							role="menu"
							aria-label="More timeline actions"
							tabindex="-1"
							onkeydown={handleMoreMenuKeydown}
						>
							{#if preview && cameraMode === 'director'}
								<button
									type="button"
									role="menuitemcheckbox"
									aria-checked={store.cameraPreviewFollowEnabled}
									onclick={() => store.toggleCameraPreviewFollow()}
								>Follow camera</button>
								<button
									type="button"
									role="menuitem"
									onclick={() => store.recenterCameraPreview()}
								>Recenter camera</button>
							{/if}
						</div>
					{/if}
				</div>
			{/if}

			<button
				type="button"
				class="toggle s4-toggle"
				aria-expanded={expanded}
				aria-label={expanded ? 'Collapse camera timeline' : 'Expand camera timeline'}
				title={expanded ? 'Collapse camera timeline' : 'Expand camera timeline'}
				disabled={store.isEditorInteractionActive}
				onclick={() => store.toggleTimeline()}
			>{#if expanded}<ChevronDown size={14} aria-hidden="true" />{:else}<ChevronUp size={14} aria-hidden="true" />{/if}</button>
		</header>
	{/if}

	{#if expanded}
		<div class="content">
			<EditorCameraTimelinePanel {store} {viewMode} {contextMenu} />
		</div>
	{:else if showCollapsedScrubber && !store.isRelic}
		<div class="mini-player" role="toolbar" aria-label="Camera timeline mini-player">
			{#if sequenceAvailable}
			<div class="scope-switcher">
				<button bind:this={pillButton} type="button" class="scope-capsule" aria-haspopup="menu" aria-expanded={pillMenuOpen} aria-label={`Camera preview scope: ${scopeLabel}`} title={scopeLabel} onclick={togglePillMenu} onkeydown={handlePillKeydown}>
						<span>{scopeLabel}</span>
				</button>
				{#if pillMenuOpen}
					<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
					<div bind:this={pillMenu} class="scope-menu" role="menu" aria-label="Camera preview scope" tabindex="-1" onkeydown={handlePillMenuKeydown}>
						{#each scopeMenuItems as item (item.id)}
							{#if item.heading}<div class="scope-menu-heading" role="presentation">{item.label}</div>{:else}<button type="button" role="menuitem" class:indented={item.id.startsWith('edge-')} onclick={() => runScopeItem(item)}>{item.label}</button>{/if}
						{/each}
					</div>
				{/if}
			</div>
			{:else}
				<div class="scope-capsule scope-status" role="status" aria-label="No sequence yet"><CircleAlert size={13} aria-hidden="true" /><span>No sequence yet</span></div>
			{/if}
			<button type="button" class="mini-player__icon" aria-label="Flip edge. Swap travel direction, reset to start." title="Flip edge. Swap travel direction, reset to start." disabled={!edgeTimeline || timelineApi.edgeReverseDisabled} onclick={() => timelineApi.swapEdgeReverse()}><ArrowLeftRight size={13} aria-hidden="true" /></button>
			<div class="mini-player__transport" role="group" aria-label="Camera timeline transport">
				<button type="button" class="mini-player__icon" aria-label="Previous camera node" title="Previous camera node" disabled={previousNodeDisabled} onclick={() => stepNode(-1)}>│◀</button>
				<button type="button" class="mini-player__icon mini-player__play" class:active={previewPlaying} aria-label={timelineApi.playLabel} title={timelineApi.playLabel} disabled={!timelineApi.canPlay} onclick={() => timelineApi.toggleTourPlayback()}>{#if previewPlaying}<Pause size={13} aria-hidden="true" />{:else}<Play size={13} aria-hidden="true" />{/if}</button>
				<button type="button" class="mini-player__icon" aria-label="Next camera node" title="Next camera node" disabled={nextNodeDisabled} onclick={() => stepNode(1)}>▶│</button>
			</div>
			<label class="mini-player__scrubber">
				<span class="sr-only">{collapsedScrubberLabel}</span>
				<input type="range" min="0" max="1" step="0.0005" value={activePlayhead} disabled={collapsedScrubDisabled} aria-label={collapsedScrubberLabel} oninput={scrubCollapsed} />
			</label>
			<output class="mini-player__timecode" aria-label="Camera timeline time">{formatTime(timelineApi.currentSeconds)} / {formatTime(durationSeconds)}</output>
			<div class="mode-control" role="group" aria-label="Camera preview mode">
				<button type="button" class:active={cameraMode === 'visitor'} aria-pressed={cameraMode === 'visitor'} aria-label="POV" title="Through Camera" onclick={() => choosePreviewMode('visitor')}><Video size={13} aria-hidden="true" /><span>POV</span></button>
				<button type="button" class:active={cameraMode === 'director'} aria-pressed={cameraMode === 'director'} aria-label="Observer" title="Observer" onclick={() => choosePreviewMode('director')}><Eye size={13} aria-hidden="true" /><span>Observer</span></button>
			</div>
			<div class="mini-player__observer-actions" role="group" aria-label="Observer tools">
				<button type="button" class="mini-player__icon" aria-label="Recenter camera" title="Recenter camera" disabled={cameraMode !== 'director' || !preview || store.isEditorInteractionActive || store.isDocumentTransactionActive} onclick={() => store.recenterCameraPreview()}><Scan size={13} aria-hidden="true" /></button>
				<button type="button" class="mini-player__icon" class:active={store.cameraPreviewFollowEnabled} aria-pressed={store.cameraPreviewFollowEnabled} aria-label="Follow camera" title="Follow camera" disabled={cameraMode !== 'director' || !preview || store.isEditorInteractionActive || store.isDocumentTransactionActive} onclick={() => store.toggleCameraPreviewFollow()}><Crosshair size={13} aria-hidden="true" /></button>
			</div>
			<button type="button" class="mini-player__icon" aria-expanded="false" aria-label="Expand camera timeline" title="Expand camera timeline" disabled={store.isEditorInteractionActive} onclick={() => store.toggleTimeline()}><ChevronUp size={14} aria-hidden="true" /></button>
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
	.timeline-frame.live {
		position: absolute;
		right: 0;
		bottom: 0;
		left: 0;
		z-index: 10;
		width: 100%;
		max-width: 100%;
	}
	.timeline-frame.live.collapsed {
		right: auto;
		bottom: 16px;
		left: 50%;
		width: min(47.5rem, calc(100% - 2rem));
		transform: translateX(-50%);
		border: 1px solid var(--editor-border-normal);
		border-radius: 0.75rem;
		box-shadow: 0 12px 32px rgb(0 0 0 / 60%), 0 0 0 1px rgb(255 255 255 / 8%);
	}
	.timeline-frame.live.collapsed .mini-player,
	.timeline-frame.live.collapsed .s4-header { border-radius: inherit; }
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
		flex-wrap: nowrap;
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
	.scope-status { color: var(--editor-text-muted); border-color: var(--editor-border-normal); }
	.scope-status :global(svg) { flex: 0 0 auto; }
	.scope-capsule {
		display: inline-flex;
		max-width: 20rem;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.75rem;
		border: 1px solid var(--editor-accent-pressed);
		border-radius: 999px;
		background: transparent;
		color: var(--editor-text-primary);
		font: inherit;
		font-size: 0.75rem;
		font-weight: 500;
		letter-spacing: 0.04em;
		text-transform: capitalize;
		white-space: nowrap;
	}
	button.scope-capsule { cursor: pointer; }
	button.scope-capsule:hover,
	button.scope-capsule:focus-visible { border-color: var(--editor-accent); outline: none; }
	.scope-capsule > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.relic-scope-capsule { margin-left: auto; }
	.scope-menu {
		position: absolute;
		top: calc(100% + 0.4rem);
		left: 0;
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
		font-size: 0.56rem;
		font-weight: 650;
	}
	.scope-menu > button {
		padding: 0.375rem 0.625rem;
		border: 0;
		border-radius: 0.25rem;
		background: transparent;
		color: var(--editor-text-primary);
		font: 500 0.75rem/1.2 var(--editor-font);
		text-transform: capitalize;
		text-align: left;
		white-space: nowrap;
		cursor: pointer;
	}
	.scope-menu button.indented { padding-left: 1.15rem; }
	.scope-menu button:hover,
	.scope-menu button:focus-visible { background: var(--editor-bg-hover); outline: none; }

	/* P12 S4 — the live editor owns one compact header; the relic keeps the
	   legacy header above. The restrained blue capsule is the one signature
	   cue that follows the active camera scope through the dock. */
	.s4-header {
		gap: 0.45rem;
		padding: 0.25rem 0.75rem;
	}
	.s4-header .scope-switcher {
		order: 1;
		width: 13.75rem;
		flex: 0 0 13.75rem;
		margin-left: 0;
	}
	.s4-header .scope-capsule {
		box-sizing: border-box;
		width: 100%;
		max-width: 100%;
		min-width: 0;
	}
	.s4-header > .scope-status { order: 1; width: 13.75rem; flex: 0 0 13.75rem; box-sizing: border-box; }
	.s4-header .scope-capsule > span { min-width: 0; }
	.mode-control,
	.observer-actions,
	.header-transport {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 0.18rem;
	}
	.mode-control {
		order: 3;
		flex: 0 1 auto;
		border: 1px solid var(--editor-border-normal);
		border-radius: 0.3rem;
		background: var(--editor-bg-panel-raised);
	}
	.s4-header button {
		font-family: inherit;
	}
	.mode-control button,
	.header-icon,
	.observer-actions button {
		display: inline-flex;
		min-height: 24px;
		align-items: center;
		justify-content: center;
		gap: 0.22rem;
		padding: 0.2rem 0.36rem;
		border: 1px solid transparent;
		border-radius: 0.22rem;
		background: transparent;
		color: var(--editor-text-secondary);
		font-size: 0.62rem;
		cursor: pointer;
		white-space: nowrap;
	}
	.mode-control button.active,
	.header-icon.active,
	.observer-actions button.active {
		border-color: var(--editor-accent);
		background: var(--editor-bg-selected);
		color: var(--editor-text-primary);
	}
	.mode-control button:hover:not(:disabled),
	.mode-control button:focus-visible,
	.header-icon:hover:not(:disabled),
	.header-icon:focus-visible,
	.observer-actions button:hover:not(:disabled),
	.observer-actions button:focus-visible {
		border-color: var(--editor-accent);
		outline: none;
	}
	.mode-control button:disabled,
	.header-icon:disabled,
	.observer-actions button:disabled {
		cursor: default;
		opacity: 0.42;
	}
	.observer-actions {
		order: 4;
		flex: 0 0 auto;
		grid-template-columns: repeat(2, 1.55rem);
		min-width: 3.28rem;
		justify-content: end;
	}
	.observer-actions button,
	.observer-slot {
		width: 1.55rem;
		box-sizing: border-box;
	}
	.header-transport {
		order: 2;
		flex: 0 1 auto;
		margin-left: 0;
		font-variant-numeric: tabular-nums;
	}
	.header-icon {
		width: 1.7rem;
		padding-inline: 0.2rem;
		border-color: var(--editor-border-normal);
		background: var(--editor-bg-panel-raised);
	}
	.header-transport .header-icon.active,
	.mini-player__play.active {
		/* Playback-active transport state: accent family (semantic token reuse,
		   no component-literal blue). */
		border-color: var(--editor-accent-border);
		background: color-mix(in srgb, var(--editor-accent) 25%, transparent);
		box-shadow: 0 0 10px color-mix(in srgb, var(--editor-accent) 40%, transparent);
		color: var(--editor-accent-hover);
	}
	.timecode {
		min-width: 7.8rem;
		color: var(--editor-text-primary);
		font: 650 0.66rem/1 var(--editor-font);
		font-variant-numeric: tabular-nums;
		text-align: center;
		white-space: nowrap;
	}
	.diagnostic {
		order: 5;
		display: inline-flex;
		min-width: 0;
		flex: 0 1 15rem;
		align-items: center;
		gap: 0.25rem;
		padding: 0.2rem 0.36rem;
		border: 1px solid var(--editor-border-normal);
		border-radius: 0.24rem;
		background: var(--editor-bg-panel-raised);
		color: var(--editor-text-secondary);
		font-size: 0.6rem;
	}
	.diagnostic :global(svg) { flex: 0 0 auto; color: var(--editor-accent); }
	.diagnostic-copy { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.more-tools { position: relative; order: 6; display: none; flex: 0 0 auto; }
	.more-trigger { width: 1.65rem; }
	.more-menu {
		position: absolute;
		top: calc(100% + 0.3rem);
		right: 0;
		z-index: 20;
		display: grid;
		min-width: 11rem;
		padding: 0.25rem;
		border: 1px solid var(--editor-border-normal);
		border-radius: 0.35rem;
		background: var(--editor-bg-panel-raised);
		box-shadow: var(--editor-shadow-popover);
	}
	.more-menu button {
		padding: 0.38rem 0.55rem;
		border: 0;
		border-radius: 0.25rem;
		background: transparent;
		color: var(--editor-text-primary);
		font-size: 0.68rem;
		text-align: left;
		white-space: nowrap;
		cursor: pointer;
	}
	.more-menu button:hover,
	.more-menu button:focus-visible { background: var(--editor-bg-hover); outline: none; }
	.s4-toggle { position: relative; order: 7; width: 1.7rem; flex: 0 0 1.7rem; margin-left: auto; padding-inline: 0.2rem; }
	.s4-toggle::before { content: ''; position: absolute; top: 0.25rem; bottom: 0.25rem; left: -0.45rem; width: 1px; background: var(--editor-border-subtle); }
	.edge-flip { order: 1; flex: 0 0 1.7rem; }
	.timeline-frame:not(:has(.content)) .s4-header { height: 48px; min-height: 48px; flex-basis: 48px; }

	.mini-player {
		display: flex;
		box-sizing: border-box;
		min-width: 0;
		height: 48px;
		flex: 0 0 48px;
		align-items: center;
		gap: 0.2rem;
		padding: 0.35rem 0.75rem;
		background: var(--editor-bg-panel);
	}
	.mini-player .scope-switcher { width: 10rem; flex: 0 1 10rem; margin-left: 0; }
	.mini-player .scope-capsule { width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; }
	.mini-player .scope-capsule > span { min-width: 0; }
	.mini-player > .scope-status { width: 10rem; flex: 0 1 10rem; box-sizing: border-box; }
	.mini-player .mode-control { order: initial; flex: 0 0 auto; }
	.mini-player__observer-actions { display: flex; flex: 0 0 auto; gap: 0.25rem; }
	.mini-player__icon {
		display: inline-flex;
		width: 1.8rem;
		height: 1.8rem;
		flex: 0 0 1.8rem;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: 1px solid var(--editor-border-normal);
		border-radius: 0.3rem;
		background: var(--editor-bg-panel-raised);
		color: var(--editor-text-secondary);
		font: inherit;
		font-size: 0.62rem;
		cursor: pointer;
	}
	.mini-player__icon:hover:not(:disabled),
	.mini-player__icon.active { border-color: var(--editor-accent); color: var(--editor-text-primary); }
	.mini-player__icon:disabled { opacity: 0.4; cursor: default; }
	.mini-player__transport { display: flex; flex: 0 0 auto; align-items: center; gap: 0.2rem; }
	.mini-player__scrubber { display: flex; min-width: 0; min-height: 24px; flex: 1 1 0; align-items: center; }
	.mini-player__scrubber input {
		width: 100%;
		height: 24px;
		margin: 0;
		accent-color: var(--editor-accent);
		cursor: ew-resize;
	}
	.mini-player__timecode { min-width: 6rem; color: var(--editor-text-primary); font: 650 0.66rem/1 var(--editor-font); font-variant-numeric: tabular-nums; text-align: center; white-space: nowrap; }
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
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
		.scope-capsule { max-width: 12rem; }
		.s4-header { gap: 0.28rem; padding-inline: 0.45rem; }
		.s4-header .scope-switcher,
		.s4-header > .scope-status { width: 8rem; flex-basis: 8rem; }
		.s4-header .observer-actions { display: none; }
		.s4-header .more-tools { display: block; }
		.s4-header .diagnostic { flex: 0 0 1.65rem; justify-content: center; padding-inline: 0.2rem; }
		.s4-header .diagnostic-copy { display: none; }
		.mode-control button { padding-inline: 0.28rem; }
		.mode-control button span { overflow: hidden; max-width: 4.4rem; text-overflow: ellipsis; }
		.timecode { min-width: 6.1rem; }
		.content { padding-inline: 0.6rem; }
		.mini-player { padding-inline: 0.6rem; }
		.mini-player .scope-switcher,
		.mini-player > .scope-status { width: 8rem; flex-basis: 8rem; }
		.mini-player__timecode { min-width: 6.1rem; font-size: 0.58rem; }
	}
</style>
