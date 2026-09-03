<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { createProjectId } from '$lib/editor/project-persistence';

	onMount(() => {
		void goto(`/project/${encodeURIComponent(createProjectId())}/spatial`, { replaceState: true });
	});
</script>

<svelte:head>
	<title>Museum editor</title>
</svelte:head>

<main class="redirecting" aria-live="polite">Opening Spatial…</main>

<style>
	.redirecting { display: grid; min-height: 100dvh; place-items: center; color: #bcb5c4; background: #111117; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
</style>
