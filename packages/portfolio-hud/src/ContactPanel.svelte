<script lang="ts">
	import type { Links } from '@portfolio/portfolio-content';

	let {
		name,
		bio,
		links,
		visible = false
	}: {
		name: string;
		bio: string;
		links: Links;
		visible?: boolean;
	} = $props();
</script>

{#if visible}
	<aside
		class="pointer-events-auto absolute bottom-6 left-6 z-40 max-w-sm rounded-box border border-base-content/15 bg-base-100/80 p-4 shadow-lg backdrop-blur"
	>
		<h2 class="font-serif text-xl font-semibold">Write to {name}</h2>
		<p class="mt-2 text-sm text-base-content/80">{bio}</p>
		<div class="mt-4 flex flex-wrap gap-2">
			{#if links.email}
				<a class="btn btn-primary btn-sm" href="mailto:{links.email}">Email</a>
			{/if}
			{#if links.github}
				<a class="btn btn-outline btn-sm" href={links.github} target="_blank" rel="noreferrer"
					>GitHub</a
				>
			{/if}
			{#if links.channel}
				<a class="btn btn-outline btn-sm" href={links.channel} target="_blank" rel="noreferrer"
					>Channel</a
				>
			{/if}
		</div>
	</aside>
{/if}
