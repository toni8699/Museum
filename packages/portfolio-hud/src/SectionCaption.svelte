<script lang="ts">
	import { fade } from 'svelte/transition';

	let {
		title,
		label,
		sectionKey = title,
		visible = true,
		size = 'md'
	}: {
		title: string;
		/** Short eyebrow e.g. "01 · Enter" */
		label?: string;
		/** Stable key for crossfade — change = remount */
		sectionKey?: string;
		visible?: boolean;
		/** Larger serif for brand-first stage beat */
		size?: 'md' | 'lg';
	} = $props();
</script>

{#if visible}
	{#key sectionKey}
		<header
			class="pointer-events-none absolute left-4 top-4 z-40 max-w-xs sm:left-6 sm:top-6"
			aria-live="polite"
			in:fade={{ duration: 150 }}
		>
			<div class="px-1 py-1">
				{#if label}
					<p class="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/90">
						{label}
					</p>
				{/if}
				<h1
					class="font-serif font-semibold leading-snug text-base-content drop-shadow-[0_1px_8px_rgba(0,0,0,0.55)] {size ===
					'lg'
						? 'mt-1 text-3xl sm:text-4xl'
						: 'mt-0.5 text-xl sm:text-2xl'}"
				>
					{title}
				</h1>
			</div>
		</header>
	{/key}
{/if}
