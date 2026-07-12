<script lang="ts">
	let {
		sections,
		activeIndex = 0,
		onjump
	}: {
		sections: { id: string; label: string }[];
		activeIndex?: number;
		onjump?: (index: number) => void;
	} = $props();
</script>

<nav class="fixed right-4 top-1/2 z-50 flex -translate-y-1/2 flex-col gap-2" aria-label="Sections">
	{#each sections as section, i (section.id)}
		<button
			type="button"
			class="btn btn-circle btn-sm border-base-content/30 {i === activeIndex
				? 'btn-primary'
				: 'btn-ghost bg-base-100/40 backdrop-blur'}"
			aria-label={section.label}
			aria-current={i === activeIndex ? 'true' : undefined}
			onclick={() => onjump?.(i)}
			title={section.label}
		>
			<span class="sr-only">{section.label}</span>
			<span class="text-[10px] font-semibold">{i + 1}</span>
		</button>
	{/each}
</nav>
