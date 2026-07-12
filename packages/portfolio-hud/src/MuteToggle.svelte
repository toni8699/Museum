<script lang="ts">
	import { isMuted, setMuted } from '@portfolio/audio-plink';

	let muted = $state(false);

	$effect(() => {
		muted = isMuted();
	});

	function toggle() {
		muted = !muted;
		setMuted(muted);
	}
</script>

<button
	type="button"
	class="btn btn-sm btn-ghost border-base-content/20 bg-base-100/50 backdrop-blur"
	onclick={toggle}
	aria-pressed={muted}
>
	{muted ? 'Sound off' : 'Sound on'}
</button>
