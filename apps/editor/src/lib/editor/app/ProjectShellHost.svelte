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
	afterNavigate(() => {
		if (page.params.projectId !== projectId) return;
		if (!page.url.searchParams.has('load') && !page.url.searchParams.has('resume-save')) return;
		const cleanUrl = new URL(page.url);
		cleanUrl.searchParams.delete('load');
		cleanUrl.searchParams.delete('resume-save');
		replaceState(`${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`, {});
	});
</script>

<EditorApp {projectId} {loadOwnedProject} {resumePendingSave} />
