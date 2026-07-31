<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import type { MuseumAsset } from '$lib/types/assets';
	import { onMount } from 'svelte';
	import EditorAppBar from './EditorAppBar.svelte';
	import EditorCameraTimelineFrame from './EditorCameraTimelineFrame.svelte';
	import EditorInspector from './EditorInspector.svelte';
	import EditorLeftSidebar from './EditorLeftSidebar.svelte';
	import EditorViewport from './EditorViewport.svelte';
	import { registerEditorShortcuts } from './hooks/shortcuts.svelte';
	import { createMuseumEditorStore } from './museum-editor.svelte';

	const store = createMuseumEditorStore();
	let outlinerElement = $state<HTMLElement | null>(null);
	let viewportElement = $state<HTMLElement | null>(null);
	let clusterNameInput = $state<HTMLInputElement>();
	let selectedAsset = $state<MuseumAsset>();

	function confirmDiscardUnsavedChanges() {
		return !store.isDirty || window.confirm('Discard unsaved scene changes?');
	}

	beforeNavigate((navigation) => {
		if (!store.isDirty || navigation.willUnload) return;
		if (!confirmDiscardUnsavedChanges()) navigation.cancel();
	});

	onMount(() =>
		registerEditorShortcuts(store, {
			getViewportElement: () => viewportElement,
			getOutlinerElement: () => outlinerElement,
			getClusterNameInput: () => clusterNameInput
		})
	);

	$effect(() => {
		if (!store.isDirty) return;
		const onBeforeUnload = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = '';
		};
		window.addEventListener('beforeunload', onBeforeUnload);
		return () => window.removeEventListener('beforeunload', onBeforeUnload);
	});
</script>

<main class="page" class:previewing={store.isDocumentMutationBlocked}>
	<EditorAppBar {store} {confirmDiscardUnsavedChanges} />
	<EditorLeftSidebar
		{store}
		bind:outlinerElement
		onAssetSelection={(asset) => (selectedAsset = asset)}
	/>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex (the WebGL viewport owns guarded editor shortcuts) -->
	<div
		bind:this={viewportElement}
		class="center"
		role="application"
		aria-label="3D editor viewport"
		tabindex="0"
		onpointerdown={(event) => event.currentTarget.focus()}
		style="grid-area: center;"
	>
		<EditorViewport {store} />
	</div>
	<EditorInspector
		{store}
		{selectedAsset}
		bind:clusterNameInput
	/>
	<EditorCameraTimelineFrame {store} />
</main>

<style>
	:global(body) { margin: 0; }
	.page {
		display: grid;
		grid-template-columns: minmax(17rem, 21rem) minmax(0, 1fr) minmax(17rem, 22rem);
		grid-template-rows: auto minmax(0, 1fr) auto;
		grid-template-areas:
			'top top top'
			'left center right'
			'bottom bottom bottom';
		height: 100vh;
		height: 100dvh;
		overflow: hidden;
		background: #0b0b10;
		color: #f4efe4;
		font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
	}
	.center { min-width: 0; min-height: 0; outline: none; }
	.center:focus-visible { box-shadow: inset 0 0 0 1px #d6b35f; }

	@media (max-width: 78rem) {
		.page { grid-template-columns: minmax(14rem, 22vw) minmax(0, 1fr) minmax(14rem, 24vw); }
	}

	@media (max-width: 62rem) {
		.page {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			grid-template-rows: auto minmax(24rem, 58vh) auto minmax(16rem, 34rem);
			grid-template-areas:
				'top top'
				'center center'
				'bottom bottom'
				'left right';
			height: auto;
			min-height: 100vh;
			min-height: 100dvh;
			overflow-y: auto;
		}
	}

	@media (max-width: 44rem) {
		.page {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto minmax(22rem, 55vh) auto minmax(16rem, 30rem) minmax(18rem, 30rem);
			grid-template-areas:
				'top'
				'center'
				'bottom'
				'left'
				'right';
		}
	}
</style>
