<script lang="ts">
	import { page } from '$app/state';
	import { afterNavigate, replaceState } from '$app/navigation';
	import EditorApp from '$lib/editor/app/EditorApp.svelte';

	const projectId = page.params.projectId ?? '';
	const loadOwnedProject = page.url.searchParams.get('load') === '1';
	const resumePendingSave = page.url.searchParams.get('resume-save') === '1';

	afterNavigate(() => {
		if (!loadOwnedProject && !resumePendingSave) return;
		const cleanUrl = new URL(page.url);
		cleanUrl.searchParams.delete('load');
		cleanUrl.searchParams.delete('resume-save');
		setTimeout(
			() => replaceState(`${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`, {}),
			0
		);
	});
</script>

<EditorApp {projectId} {loadOwnedProject} {resumePendingSave} />
