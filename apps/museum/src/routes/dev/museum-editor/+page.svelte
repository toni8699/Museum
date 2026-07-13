<script lang="ts">
	import { dev } from '$app/environment';
	import MuseumEditorEntry from 'virtual:museum-editor-entry';
</script>

<svelte:head>
	<title>Museum editor</title>
</svelte:head>

{#if dev}
	<MuseumEditorEntry />
{/if}
