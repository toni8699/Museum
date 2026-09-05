<script lang="ts">
	import { page } from '$app/state';
	import { afterNavigate, replaceState } from '$app/navigation';
	import { untrack } from 'svelte';
	import EditorApp from './EditorApp.svelte';

	let { projectId }: { projectId: string } = $props();
	// The parent layout keys this entire session by project ID. Capture entry
	// intents once; query cleanup must not change an in-flight bootstrap.
	const loadOwnedProject = untrack(() => page.url.searchParams.get('load') === '1');
	const resumePendingSave = untrack(() => page.url.searchParams.get('resume-save') === '1');
	// P21.4 — surface intent derived from the URL. Same-project Spatial↔Preview
	// navigation reuses this owner (keyed by projectId); only the surface swaps.
	const surface = $derived(
		page.params.projectId === projectId && page.url.pathname.endsWith('/preview')
			? ('preview' as const)
			: ('spatial' as const)
	);
	afterNavigate(() => {
		if (page.params.projectId !== projectId) return;
		if (!page.url.searchParams.has('load') && !page.url.searchParams.has('resume-save')) return;
		const cleanUrl = new URL(page.url);
		cleanUrl.searchParams.delete('load');
		cleanUrl.searchParams.delete('resume-save');
		replaceState(`${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`, {});
	});
</script>

<EditorApp {projectId} {loadOwnedProject} {resumePendingSave} {surface} />
