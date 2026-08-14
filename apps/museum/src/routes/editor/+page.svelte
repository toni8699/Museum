<script lang="ts">
	import { dev } from '$app/environment';
	import MuseumEditorEntry from 'virtual:museum-editor-entry';
</script>

<svelte:head>
	<title>Museum editor</title>
</svelte:head>	{#if dev || import.meta.env.VITE_MUSEUM_EDITOR === '1'}
		<MuseumEditorEntry />
	{/if}
