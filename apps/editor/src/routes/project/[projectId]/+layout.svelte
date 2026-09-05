<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import ProjectShellHost from '$lib/editor/app/ProjectShellHost.svelte';
	let { children }: { children: Snippet } = $props();
</script>

<svelte:head><title>Spatial — Museum Editor</title></svelte:head>

{#key page.params.projectId}
	<ProjectShellHost projectId={page.params.projectId ?? ''} />
{/key}
{@render children()}
