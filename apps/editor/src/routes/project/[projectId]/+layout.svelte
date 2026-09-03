<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
	const projectId = $derived(page.params.projectId ?? '');
</script>

<svelte:head>
	<title>Spatial — Museum Editor</title>
</svelte:head>

<div class="project-shell">
	<header class="shell-bar" aria-label="Project navigation">
		<a class="projects-link" href="/projects">Projects</a>
		<span class="project-id" title={projectId}>{projectId}</span>
		<nav aria-label="Project modes">
			<a aria-current="page" href={`/project/${encodeURIComponent(projectId)}/spatial`}>Spatial</a>
		</nav>
	</header>
	<div class="project-content">{@render children()}</div>
</div>

<style>
	:global(body) { margin: 0; background: #111117; }
	.project-shell { display: flex; flex-direction: column; height: 100dvh; overflow: hidden; background: #111117; color: #f4f0e9; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
	.shell-bar { display: flex; flex: 0 0 2.75rem; align-items: center; gap: 0.9rem; padding: 0 0.9rem; border-bottom: 1px solid #383340; background: #19181f; font-size: 0.72rem; }
	.projects-link, nav a { color: #f4f0e9; text-decoration: none; }
	.projects-link { color: #c9a9ff; font-weight: 700; }
	.project-id { min-width: 0; overflow: hidden; color: #bcb5c4; text-overflow: ellipsis; white-space: nowrap; }
	nav { margin-left: auto; }
	nav a { padding: 0.35rem 0.55rem; border: 1px solid #b997f2; border-radius: 0.35rem; background: #292632; }
	.project-content { min-height: 0; flex: 1 1 auto; }
	.project-content :global(.editor-page) { height: 100%; min-height: 0; }

	@media (max-width: 62rem) {
		.project-content :global(.editor-page) { height: 100% !important; min-height: 0 !important; overflow: hidden !important; }
	}
</style>
