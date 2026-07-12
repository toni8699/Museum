<script lang="ts">
	import { onMount } from 'svelte';
	import { playPlink, type PlinkKind } from '@portfolio/audio-plink';
	import type { NoteCursorVariant } from './types';

	type Trail = {
		id: number;
		x: number;
		y: number;
		born: number;
		rot: number;
	};

	let {
		variant = 'chopin' as NoteCursorVariant,
		color,
		trailCount = 14,
		clickSound,
		enabled = true
	}: {
		variant?: NoteCursorVariant;
		color?: string;
		trailCount?: number;
		clickSound?: PlinkKind;
		enabled?: boolean;
	} = $props();

	const themeColor = $derived(
		color ?? (variant === 'brownie' ? '#f2efe6' : '#c4a35a')
	);
	const sound = $derived(clickSound ?? (variant === 'brownie' ? 'chalk' : 'plink'));

	let x = $state(0);
	let y = $state(0);
	let tx = $state(0);
	let ty = $state(0);
	let trails = $state<Trail[]>([]);
	let idSeq = 0;
	let lastSpawn = 0;
	let visible = $state(false);

	onMount(() => {
		if (!enabled) return;

		const onMove = (e: PointerEvent) => {
			tx = e.clientX;
			ty = e.clientY;
			visible = true;
			const now = performance.now();
			if (now - lastSpawn > 32) {
				lastSpawn = now;
				trails = [
					...trails.slice(-(trailCount - 1)),
					{ id: idSeq++, x: tx, y: ty, born: now, rot: Math.random() * 40 - 20 }
				];
			}
		};

		const onLeave = () => {
			visible = false;
		};

		const onDown = () => {
			playPlink(sound);
		};

		let raf = 0;
		const loop = () => {
			x += (tx - x) * 0.22;
			y += (ty - y) * 0.22;
			const now = performance.now();
			trails = trails.filter((t) => now - t.born < 700);
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);

		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerleave', onLeave);
		window.addEventListener('pointerdown', onDown);
		document.documentElement.classList.add('note-cursor-active');

		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerleave', onLeave);
			window.removeEventListener('pointerdown', onDown);
			document.documentElement.classList.remove('note-cursor-active');
		};
	});
</script>

{#if enabled}
	<div class="note-layer" aria-hidden="true">
		{#each trails as t (t.id)}
			<span
				class="trail"
				class:chalk={variant === 'brownie'}
				style="left:{t.x}px;top:{t.y}px;--rot:{t.rot}deg;color:{themeColor};--age:{(performance.now() - t.born) / 700}"
			>♪</span>
		{/each}
		{#if visible}
			<span class="note" style="left:{x}px;top:{y}px;color:{themeColor}">♪</span>
		{/if}
	</div>
{/if}

<style>
	:global(html.note-cursor-active),
	:global(html.note-cursor-active *) {
		cursor: none !important;
	}

	.note-layer {
		position: fixed;
		inset: 0;
		pointer-events: none;
		z-index: 10000;
		overflow: hidden;
	}

	.note,
	.trail {
		position: absolute;
		transform: translate(-50%, -50%);
		font-size: 1.35rem;
		line-height: 1;
		user-select: none;
		filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.35));
	}

	.note {
		font-size: 1.6rem;
		transition: transform 80ms ease-out;
	}

	.trail {
		opacity: calc(1 - var(--age, 0));
		transform: translate(-50%, -50%) rotate(var(--rot)) translateY(calc(var(--age) * -18px))
			scale(calc(1 - var(--age) * 0.4));
	}

	.trail.chalk {
		opacity: calc(0.55 * (1 - var(--age, 0)));
		filter: blur(0.4px);
	}
</style>
