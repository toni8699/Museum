<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { env } from '$env/dynamic/public';
	import {
		createProjectApi,
		createProjectAuth,
		createProjectId,
		ProjectPersistenceError,
		type ProjectSession,
		type ProjectSummary
	} from '$lib/editor/project-persistence';

	const apiOrigin = env.PUBLIC_API_ORIGIN;
	const auth = apiOrigin ? createProjectAuth(apiOrigin) : null;
	const api = createProjectApi({ apiOrigin });

	let sessionStatus = $state<'checking' | 'authenticated' | 'unauthenticated' | 'error'>('checking');
	let projects = $state<ProjectSummary[]>([]);
	let notice = $state('');
	let busy = $state(false);

	function projectUrl(projectId: string, load = false): string {
		return `/project/${encodeURIComponent(projectId)}/spatial${load ? '?load=1' : ''}`;
	}

	async function startCreating(): Promise<void> {
		await goto(projectUrl(createProjectId()));
	}

	async function signIn(): Promise<void> {
		if (!auth) {
			notice = 'Sign-in is unavailable';
			return;
		}
		try {
			notice = '';
			await auth.signIn('projects');
		} catch (error) {
			notice = error instanceof ProjectPersistenceError ? error.message : 'Sign-in failed';
		}
	}

	async function signOut(): Promise<void> {
		if (!auth || busy) return;
		busy = true;
		try {
			await auth.signOut();
			projects = [];
			sessionStatus = 'unauthenticated';
			notice = 'Signed out';
		} catch (error) {
			notice = error instanceof ProjectPersistenceError ? error.message : 'Sign-out failed';
		} finally {
			busy = false;
		}
	}

	async function bootstrap(signal: AbortSignal): Promise<void> {
		if (!auth || !api) {
			sessionStatus = 'unauthenticated';
			return;
		}
		try {
			const session: ProjectSession = await auth.getSession(signal);
			if (!session.authenticated) {
				sessionStatus = 'unauthenticated';
				return;
			}
			sessionStatus = 'authenticated';
			const listed = await api.listProjects(signal);
			// Strict Hub: owned cloud projects by last modification descending.
			projects = [...listed].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
		} catch (error) {
			if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
			if (error instanceof ProjectPersistenceError && error.code === 'auth') {
				sessionStatus = 'unauthenticated';
				projects = [];
			} else {
				sessionStatus = 'error';
				notice = error instanceof ProjectPersistenceError ? error.message : 'Could not load projects';
			}
		}
	}

	onMount(() => {
		const controller = new AbortController();
		void bootstrap(controller.signal);
		return () => controller.abort();
	});
</script>

<svelte:head>
	<title>Projects — Museum Editor</title>
</svelte:head>

<main class="hub-page">
	<header class="hub-header">
		<a href="/">Museum Editor</a>
		{#if sessionStatus === 'authenticated'}
			<button type="button" disabled={busy} onclick={() => void signOut()}>Sign out</button>
		{/if}
	</header>
	<section class="hub-card" aria-labelledby="projects-title">
		<p class="eyebrow">Project Hub</p>
		<h1 id="projects-title">Projects</h1>
		<button type="button" class="primary new-project" onclick={() => void startCreating()}>New Project</button>

		{#if sessionStatus === 'checking'}
			<p class="status" role="status">Checking sign-in…</p>
		{:else if sessionStatus === 'authenticated'}
			<h2>My Projects</h2>
			{#if projects.length === 0}
				<p class="muted">No saved projects.</p>
			{:else}
				<ul>
					{#each projects as project (project.id)}
						{@const modified = (() => {
							try {
								return new Date(project.updatedAt).toLocaleString();
							} catch {
								return project.updatedAt;
							}
						})()}
						<li>
							<span><strong>{project.name}</strong><small>v{project.version} · {modified} · Cloud</small></span>
							<a href={projectUrl(project.id, true)}>Open</a>
						</li>
					{/each}
				</ul>
			{/if}
		{:else if sessionStatus === 'error'}
			<p class="status" role="alert">{notice || 'Could not load projects.'}</p>
			<button type="button" class="primary new-project" onclick={() => void startCreating()}>New Project</button>
		{:else}
			<p class="muted">Your work stays in a temporary session until you sign in. No drafts are kept here.</p>
			<button type="button" disabled={!auth} onclick={() => void signIn()}>Continue with Google</button>
		{/if}
		{#if notice && sessionStatus !== 'error'}<p class="status" role="alert">{notice}</p>{/if}
	</section>
</main>

<style>
	:global(body) { margin: 0; background: #111117; color: #f4f0e9; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
	.hub-page { min-height: 100dvh; background: #111117; }
	.hub-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.25rem; border-bottom: 1px solid #383340; }
	.hub-header a { color: #f4f0e9; font-weight: 700; text-decoration: none; }
	.hub-card { width: min(36rem, calc(100% - 3rem)); margin: 4rem auto; padding: 1.5rem; border: 1px solid #4d4655; border-radius: 0.8rem; background: #19181f; box-sizing: border-box; }
	.eyebrow { margin: 0 0 0.75rem; color: #c9a9ff; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
	h1 { margin: 0; font-size: 2rem; }
	h2 { margin: 2rem 0 0.65rem; font-size: 0.95rem; }
	button, li a { padding: 0.55rem 0.75rem; border: 1px solid #635a6f; border-radius: 0.4rem; background: #292632; color: inherit; font: inherit; cursor: pointer; text-decoration: none; }
	button:hover:not(:disabled), li a:hover { border-color: #c9a9ff; }
	button:disabled { cursor: default; opacity: 0.45; }
	.primary { border-color: #b997f2; background: #8f69c8; color: #fff; }
	.new-project { margin-top: 1.25rem; }
	.muted, .status { color: #bcb5c4; line-height: 1.45; }
	.status { color: #e3c4c4; }
	ul { display: flex; flex-direction: column; gap: 0.45rem; margin: 0; padding: 0; list-style: none; }
	li { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.65rem 0.75rem; border: 1px solid #383340; border-radius: 0.4rem; }
	li span { display: flex; min-width: 0; flex-direction: column; gap: 0.15rem; }
	li strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	small { color: #bcb5c4; }
</style>
