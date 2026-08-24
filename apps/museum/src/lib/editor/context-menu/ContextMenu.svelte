<script lang="ts">
	// P3.4 — the one shared context-menu shell. Renders the active request at
	// its anchor, clamped inside the viewport; closes on outside pointerdown,
	// Escape, scroll, resize, or after an action runs. Pure presentation: item
	// semantics live in the surface adapters.
	import { onMount, tick } from 'svelte';
	import { clampMenuPosition } from './context-menu-state.svelte';
	import type { EditorContextMenuStore } from './context-menu-state.svelte';

	let { store }: { store: EditorContextMenuStore } = $props();

	let menuElement = $state<HTMLElement | null>(null);
	let position = $state({ x: 0, y: 0 });

	const request = $derived(store.menu);

	$effect(() => {
		if (!request) return;
		position = { x: request.x, y: request.y };
		void tick().then(() => {
			if (!menuElement) return;
			const box = menuElement.getBoundingClientRect();
			position = clampMenuPosition(
				request.x,
				request.y,
				box.width,
				box.height,
				window.innerWidth,
				window.innerHeight
			);
		});
	});

	function onWindowPointerDown(event: PointerEvent) {
		if (!menuElement || !menuElement.contains(event.target as Node)) store.close();
	}

	function onWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.stopPropagation();
			store.close();
		}
	}

	function runItem(run: () => void) {
		store.close();
		run();
	}

	onMount(() => {
		window.addEventListener('pointerdown', onWindowPointerDown, true);
		window.addEventListener('keydown', onWindowKeydown, true);
		window.addEventListener('resize', store.close);
		window.addEventListener('scroll', store.close, true);
		window.addEventListener('blur', store.close);
		return () => {
			window.removeEventListener('pointerdown', onWindowPointerDown, true);
			window.removeEventListener('keydown', onWindowKeydown, true);
			window.removeEventListener('resize', store.close);
			window.removeEventListener('scroll', store.close, true);
			window.removeEventListener('blur', store.close);
		};
	});
</script>

{#if request}
	<div
		bind:this={menuElement}
		class="context-menu"
		style={`left: ${position.x}px; top: ${position.y}px`}
		role="menu"
		aria-label={`${request.surfaceId} actions`}
	>
		{#each request.items as item (item.id)}
			{#if item.separatorBefore}
				<div class="separator" role="separator"></div>
			{/if}
			<button
				type="button"
				class:danger={item.danger}
				disabled={Boolean(item.disabledReason)}
				title={item.disabledReason ?? undefined}
				aria-disabled={item.disabledReason ? 'true' : undefined}
				role="menuitem"
				onpointerdown={(event) => event.stopPropagation()}
				onclick={() => { if (!item.disabledReason) runItem(item.run); }}
			>
				<span class="label">{item.label}</span>
				{#if item.disabledReason}<span class="reason">{item.disabledReason}</span>{/if}
			</button>
		{/each}
	</div>
{/if}

<style>
	.context-menu {
		position: fixed;
		z-index: 90;
		display: grid;
		min-width: 11rem;
		padding: var(--editor-space-1);
		border: 1px solid var(--editor-border-normal);
		border-radius: var(--editor-radius-lg);
		background: var(--editor-bg-panel-raised);
		box-shadow: var(--editor-shadow-popover);
		font-family: var(--editor-font);
	}
	.separator {
		height: 1px;
		margin: var(--editor-space-1) calc(var(--editor-space-2) * -1);
		background: var(--editor-border-subtle);
	}
	button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--editor-space-3);
		width: 100%;
		padding: 0.32rem 0.55rem;
		border: 0;
		border-radius: var(--editor-radius-sm);
		background: transparent;
		color: var(--editor-text-primary);
		font-size: 0.74rem;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
	}
	button:hover:not(:disabled),
	button:focus-visible:not(:disabled) {
		background: var(--editor-bg-hover);
		outline: none;
	}
	button.danger:not(:disabled) {
		color: var(--editor-danger-fg);
	}
	button.danger:hover:not(:disabled) {
		background: var(--editor-danger-soft);
	}
	button:disabled {
		color: var(--editor-text-disabled);
		cursor: default;
	}
	.reason {
		max-width: 9rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.62rem;
		font-weight: 400;
		color: var(--editor-text-muted);
	}
</style>
