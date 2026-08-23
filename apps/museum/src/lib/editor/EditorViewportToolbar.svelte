<script lang="ts">
	import { ChevronDown, Eye, MousePointer2, Move, Rotate3d, Scaling, Video } from 'lucide-svelte';
	import type { EditorTransformMode } from './editor-transform';
	import type { EditorStore } from './editor-store.svelte';
	import { onMount, getContext } from 'svelte';
	import {
		EDITOR_INTERACTION_STORE_KEY,
		type EditorInteractionStore
	} from './store/editor-interaction-store.svelte';
	import type { EditorGizmoCapabilities } from './gizmo/editor-gizmo-policy';

	let {
		store,
		showCeilings = false,
		onToggleCeilings,
		// explicit 3D context. Scene exposes Ceiling only; Camera
		// exposes the three camera-helper rows. Absent on the relic mount,
		// which keeps its legacy camera-only View menu via `currentWorkspace`.
		context = undefined,
		// when the active domain is a detached S7 layout selection, the
		// transform buttons are disabled (layout publishes no interactive gizmo
		// policy until S8). Absent on the relic mount. Select stays enabled.
		transformDisabled = false,
		// step 6 — the active target's generic capability projection
		// (scene/camera). `null` = no interactive policy. Absent on the relic,
		// which keeps the legacy navigation-before-placement arbitration.
		gizmoCapabilities = null
	}: {
		store: EditorStore;
		// editor 3D (restored 2026-08-16): the layout ceiling toggle that the
		// unification dropped lives in the View menu when these props are
		// provided; the relic mount leaves them absent and keeps its own
		// LayoutDraftToolbar Ceiling button.
		showCeilings?: boolean;
		onToggleCeilings?: () => void;
		// explicit `'scene' | 'camera'` context. When provided the View
		// menu is always available (Scene = Ceiling only, Camera = the three
		// camera-helper rows); when absent the relic keeps its camera-only
		// menu keyed on `store.currentWorkspace`.
		context?: 'scene' | 'camera';
		transformDisabled?: boolean;
		gizmoCapabilities?: EditorGizmoCapabilities | null;
	} = $props();

	const interactionStore = getContext<EditorInteractionStore | undefined>(
		EDITOR_INTERACTION_STORE_KEY
	);

	let viewMenuOpen = $state(false);
	let toolbarElement = $state<HTMLElement>();
	const disabled = $derived(
		store.isDocumentMutationBlocked || store.isEditorInteractionActive
	);
	// S7: a detached layout selection disables the transform buttons (and the
	// scale chain) without disabling Select or the View menu.
	const layoutTransformDisabled = $derived(transformDisabled === true);
	const transformDisabledFlag = $derived(disabled || layoutTransformDisabled);
	// Generic capability projection (editor). `null` = no interactive policy
	// (detached layout / no target) — transform buttons stay disabled only for
	// the layout gate above, mirroring the pre-S7 no-selection appearance.
	const caps = $derived(gizmoCapabilities ?? null);
	// Legacy relic path (no caps): camera targets are translate-only.
	const hasNavigationTransform = $derived(
		store.navigationSelection?.kind === 'node' ||
			store.navigationSelection?.kind === 'anchor' ||
			store.navigationSelection?.kind === 'view-keyframe'
	);
	const scaleMode = $derived<'uniform' | 'independent'>(
		interactionStore?.scaleMode ?? 'uniform'
	);
	// Effective mode for the active highlight: the projected effective mode
	// (editor), or the legacy camera/scene arbitration (relic).
	const effectiveMode = $derived(
		caps
			? caps.effectiveMode
			: hasNavigationTransform
				? 'translate'
				: (interactionStore?.mode ?? store.transformMode)
	);
	// Scale-chain is scene-placement-only (`scene-scale-mode`).
	const scaleToolActive = $derived(
		caps
			? caps.scaleControl === 'scene-scale-mode' && caps.effectiveMode === 'scale'
			: !hasNavigationTransform &&
				(interactionStore?.mode ?? store.transformMode) === 'scale'
	);
	const scaleChainDisabled = $derived(
		transformDisabledFlag ||
			!interactionStore ||
			(caps !== null && caps.scaleControl !== 'scene-scale-mode')
	);

	function toggleTopBarChain(event: MouseEvent) {
		// Only meaningful when the gizmo is in scale mode. Clicking the chain
		// outside of that is a no-op so the toolbar doesn't surprise the user.
		event.preventDefault();
		event.stopPropagation();
		if (!scaleToolActive) {
			interactionStore?.setMode('scale');
		}
		interactionStore?.toggleScaleMode();
	}

	function chooseTool(tool: 'select' | EditorTransformMode) {
		if (tool === 'select') {
			store.setTransformTool(tool);
		} else {
			store.setTransformTool(tool);
			interactionStore?.setMode(tool);
		}
	}

	function toolIsActive(mode: EditorTransformMode) {
		if (!store.transformGizmoVisible) return false;
		if (caps) return caps.effectiveMode === mode;
		return hasNavigationTransform ? mode === 'translate' : effectiveMode === mode;
	}

	function toolDisabled(mode: EditorTransformMode) {
		if (transformDisabledFlag) return true;
		if (caps) return !caps.allowedModes.has(mode);
		return hasNavigationTransform && mode !== 'translate';
	}

	// the View menu is always available under an explicit editor context
	// (Scene shows Ceiling only, Camera shows the camera-helper rows); the relic
	// (no context prop) keeps its legacy camera-only menu.
	const viewMenuVisible = $derived(
		context !== undefined || store.currentWorkspace === 'camera'
	);
	// Camera-helper rows (Node handles / Tour paths / Framing & FOV): editor Camera
	// context, or the relic's legacy camera workspace.
	const showCameraHelperRows = $derived(
		context === 'camera' || (context === undefined && store.currentWorkspace === 'camera')
	);
	// Ceiling is a layout concern and lives only in the editor Scene View menu.
	const showCeilingRow = $derived(context === 'scene' && onToggleCeilings !== undefined);
	// S10.1 — Camera workspace toolbar: `Select | Move | Rotate | Add camera | View`.
	// Scale and the scale-chain toggle are unmounted in Camera; Add camera lives
	// in the Camera toolbar (relocated from the app-bar action row).
	const isCameraContext = $derived(context === 'camera');
	const showScaleTool = $derived(!isCameraContext);
	const addCameraDisabled = $derived(
		disabled ||
			store.pendingNavigationCommand !== null ||
			Boolean(
				store.pendingPlacementAssetId ||
					store.pendingPlacementPrimitiveKind ||
					store.pendingPlacementLightKind
			)
	);

	function toggleViewMenu() {
		if (!viewMenuVisible) return;
		viewMenuOpen = !viewMenuOpen;
	}

	onMount(() => {
		const closeMenu = (event: PointerEvent) => {
			if (toolbarElement?.contains(event.target as Node)) return;
			viewMenuOpen = false;
		};
		window.addEventListener('pointerdown', closeMenu);
		return () => window.removeEventListener('pointerdown', closeMenu);
	});
</script>

<div bind:this={toolbarElement} class="toolbar" role="toolbar" aria-label="Viewport tools">
	<div class="tool-group" aria-label="Transform tool">
		<button
			type="button"
			class:active={!store.transformGizmoVisible}
			aria-pressed={!store.transformGizmoVisible}
			{disabled}
			onclick={() => chooseTool('select')}
		>
			<MousePointer2 size={14} aria-hidden="true" />
			Select
		</button>
		<button
			type="button"
			class:active={toolIsActive('translate')}
			aria-pressed={toolIsActive('translate')}
			disabled={toolDisabled('translate')}
			onclick={() => chooseTool('translate')}
		>
			<Move size={14} aria-hidden="true" />
			Move
		</button>
		<button
			type="button"
			class:active={toolIsActive('rotate')}
			aria-pressed={toolIsActive('rotate')}
			disabled={toolDisabled('rotate')}
			onclick={() => chooseTool('rotate')}
		>
			<Rotate3d size={14} aria-hidden="true" />
			Rotate
		</button>
		{#if showScaleTool}
			<button
				type="button"
				class:active={toolIsActive('scale')}
				aria-pressed={toolIsActive('scale')}
				disabled={toolDisabled('scale')}
				onclick={() => chooseTool('scale')}
			>
				<Scaling size={14} aria-hidden="true" />
				Scale
			</button>
		{/if}
		{#if showScaleTool}
		<button
			type="button"
			class="scale-toggle"
			aria-pressed={scaleMode === 'independent'}
			aria-label="Toggle uniform / independent scale mode"
			title={
				scaleToolActive
					? scaleMode === 'uniform'
						? 'Scale locked — click to switch to independent (× Y / Z scale separately)'
						: 'Scale unlocked — click to switch to uniform (single scale across X / Y / Z)'
					: 'Switch to Scale and lock / unlock its chain'
			}
			disabled={scaleChainDisabled}
			onclick={toggleTopBarChain}
		>
			{#if scaleMode === 'uniform'}
				<svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16">
					<g
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
						<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
					</g>
				</svg>
			{:else}
				<svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16">
					<g
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
						<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
					</g>
					<line
						x1="5"
						y1="5"
						x2="19"
						y2="19"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
					/>
				</svg>
			{/if}
		</button>
		{/if}
	</div>

	{#if isCameraContext}
		<div class="tool-group" aria-label="Camera authoring">
			<button
				type="button"
				class="add-camera"
				title="Place a new camera node on a room floor"
				disabled={addCameraDisabled}
				onclick={() => store.beginCameraPlacement()}
			>
				<Video size={14} aria-hidden="true" />
				Add camera
			</button>
		</div>
	{/if}

	{#if viewMenuVisible}
		<div class="tool-group" aria-label="Viewport helper visibility">
			<button
				type="button"
				class:active={viewMenuOpen}
				aria-haspopup="menu"
				aria-expanded={viewMenuOpen}
				disabled={disabled}
				title="Toggle viewport helper visibility"
				onclick={toggleViewMenu}
			><Eye size={14} aria-hidden="true" /> View <ChevronDown size={12} aria-hidden="true" /></button>
			{#if viewMenuOpen}
				<div
					class="add-menu"
					role="menu"
					tabindex="-1"
					aria-label="Viewport helpers"
					onpointerdown={(event) => event.stopPropagation()}
				>
					{#if showCameraHelperRows}
					<button
						type="button"
						role="menuitemcheckbox"
						aria-checked={store.viewportShowNodes}
						class="toggle-row"
						onclick={() => store.toggleViewportShowNodes()}
					>
						<span class="check" aria-hidden="true">{store.viewportShowNodes ? '✓' : '○'}</span>
						<span>Node handles</span>
					</button>
					<button
						type="button"
						role="menuitemcheckbox"
						aria-checked={store.viewportShowPaths}
						class="toggle-row"
						onclick={() => store.toggleViewportShowPaths()}
					>
						<span class="check" aria-hidden="true">{store.viewportShowPaths ? '✓' : '○'}</span>
						<span>Tour paths</span>
					</button>
					<button
						type="button"
						role="menuitemcheckbox"
						aria-checked={store.viewportShowFraming}
						class="toggle-row"
						onclick={() => store.toggleViewportShowFraming()}
					>
						<span class="check" aria-hidden="true">{store.viewportShowFraming ? '✓' : '○'}</span>
						<span>Framing &amp; FOV</span>
					</button>
					<button
						type="button"
						role="menuitemcheckbox"
						aria-checked={store.viewportShowRetained}
						class="toggle-row"
						onclick={() => store.toggleViewportShowRetained()}
					>
						<span class="check" aria-hidden="true">{store.viewportShowRetained ? '✓' : '○'}</span>
						<span>Retained paths</span>
					</button>
					{/if}
					{#if showCeilingRow}
						<button
							type="button"
							role="menuitemcheckbox"
							aria-checked={showCeilings}
							class="toggle-row"
							onclick={onToggleCeilings}
						>
							<span class="check" aria-hidden="true">{showCeilings ? '✓' : '○'}</span>
							<span>Ceiling</span>
						</button>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.toolbar {
		position: absolute;
		top: 0.75rem;
		left: 0.75rem;
		z-index: 4;
		display: flex;
		align-items: center;
		gap: 0.32rem;
		padding: 0.3rem;
		border: 1px solid rgb(70 68 78 / 88%);
		border-radius: 0.42rem;
		background: rgb(19 19 26 / 94%);
		box-shadow: 0 0.4rem 1.25rem rgb(0 0 0 / 28%);
		backdrop-filter: blur(8px);
	}

	.tool-group {
		position: relative;
		display: flex;
		gap: 0.22rem;
		padding-right: 0.32rem;
		border-right: 1px solid #34343e;
	}

	/* View-menu dropdown: absolutely positioned below the trigger so opening
	   it never resizes the toolbar bar (options overlay, they don't share the
	   bar's flex flow). Mirrors the Project-menu dropdown styling. */
	.add-menu {
		position: absolute;
		top: calc(100% + 0.3rem);
		left: 0;
		z-index: 20;
		box-sizing: border-box;
		min-width: 11.5rem;
		max-width: calc(100vw - 1rem);
		padding: 0.3rem;
		border: 1px solid rgb(70 68 78 / 88%);
		border-radius: 0.42rem;
		background: rgb(19 19 26 / 96%);
		box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 42%);
		backdrop-filter: blur(8px);
	}
	.add-menu .toggle-row { padding: 0.34rem 0.45rem; border-radius: 0.3rem; }
	.add-menu .toggle-row:hover { border-color: #5a5663; color: #fff; }

	.scale-toggle,
	.add-camera {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		padding: 0.38rem 0.45rem;
		color: inherit;
	}

	.add-camera {
		border-color: #6f5c31;
		color: #e8d5a3;
	}
	.add-camera:hover:not(:disabled) {
		border-color: #d6b35f;
		color: #fff2c7;
	}

	.scale-toggle[aria-pressed='true'] {
		background: rgba(136, 221, 255, 0.18);
		border-color: rgba(136, 221, 255, 0.5);
		color: #88ddff;
	}

	button {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		white-space: nowrap;
		padding: 0.38rem 0.52rem;
		border: 1px solid transparent;
		border-radius: 0.3rem;
		background: transparent;
		color: #c9c3b8;
		font: 600 0.68rem/1 ui-sans-serif, system-ui, sans-serif;
		cursor: pointer;
	}

	button:hover:not(:disabled) { border-color: #5a5663; color: #fff; }
	button.active { border-color: #8d753c; background: #2a2618; color: #fff2c7; }
	button:disabled { opacity: 0.42; cursor: default; }

	.toggle-row { display: flex; align-items: center; gap: 0.55rem; }
	.toggle-row .check { width: 0.85rem; color: #d6b35f; font: inherit; font-size: 0.78rem; }

	@media (max-width: 44rem) {
		.toolbar {
			top: 0.5rem;
			left: 0.5rem;
			right: 0.5rem;
			align-items: stretch;
			flex-wrap: wrap;
		}
		.tool-group { flex: 1 1 auto; }
		.tool-group button { flex: 1; padding-inline: 0.38rem; }
	}
</style>
