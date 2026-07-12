<script lang="ts">
	import type { Project } from '@portfolio/portfolio-content';

	let {
		project,
		open = false,
		onclose
	}: {
		project: Project | null;
		open?: boolean;
		onclose?: () => void;
	} = $props();
</script>

{#if open && project}
	<div class="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center">
		<button
			type="button"
			class="absolute inset-0 bg-base-300/50 backdrop-blur-sm"
			aria-label="Close"
			onclick={() => onclose?.()}
		></button>
		<article class="card relative z-10 w-full max-w-md bg-base-100 shadow-xl">
			<div class="card-body">
				<h2 class="card-title font-serif text-2xl">{project.title}</h2>
				<p class="text-base-content/80">{project.blurb}</p>
				<div class="flex flex-wrap gap-2">
					{#each project.tags as tag}
						<span class="badge badge-outline">{tag}</span>
					{/each}
				</div>
				<div class="card-actions justify-end">
					{#if project.link}
						<a class="btn btn-primary btn-sm" href={project.link} target="_blank" rel="noreferrer"
							>Open</a
						>
					{/if}
					<button type="button" class="btn btn-ghost btn-sm" onclick={() => onclose?.()}>Close</button>
				</div>
			</div>
		</article>
	</div>
{/if}
