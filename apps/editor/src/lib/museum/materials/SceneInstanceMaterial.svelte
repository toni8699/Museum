<script lang="ts">
	import { onDestroy } from 'svelte';
	import { T } from '@threlte/core';
	import { computeTextureRepeat } from '$lib/content/materials';
	import type { MaterialLoadStatus, Vec2 } from '$lib/types/materials';
	import {
		acquireEffectiveVariant,
		loadEffectiveTextures,
		releaseEffectiveVariant,
		type LoadedTextureMaps
	} from './texture-cache';
	import type { EffectiveSceneMaterial } from './scene-instance-material';

	let {
		material,
		surfaceSize,
		rotation = 0,
		receiveLighting = true,
		status = $bindable<MaterialLoadStatus>('idle')
	}: {
		material: EffectiveSceneMaterial;
		surfaceSize: Vec2;
		rotation?: number;
		receiveLighting?: boolean;
		status?: MaterialLoadStatus;
	} = $props();

	const repeat = $derived(
		computeTextureRepeat(surfaceSize, material.defaultTileSizeMeters)
	);

	let maps = $state<LoadedTextureMaps | undefined>(undefined);
	let acquiredKey: { seed: string; rx: number; ry: number; rot: number } | null = null;

	$effect(() => {
		const seed = material.variantSeed;
		const [rx, ry] = repeat;
		const rot = rotation;
		maps = undefined;
		status = 'loading';
		let cancelled = false;

		loadEffectiveTextures(material).then((result) => {
			if (cancelled) return;
			if (result.status === 'fallback') {
				status = 'fallback';
				return;
			}
			if (result.status === 'failed') {
				status = 'failed';
				console.warn(
					`[SceneInstanceMaterial] ${material.catalogue ?? 'no-catalogue'}: ${result.error}`
				);
				return;
			}
			maps = acquireEffectiveVariant(material, rx, ry, rot);
			acquiredKey = { seed, rx, ry, rot };
			status = result.status === 'partial' ? 'partial' : 'ready';
		});

		return () => {
			cancelled = true;
			maps = undefined;
			if (acquiredKey) {
				releaseEffectiveVariant(
					acquiredKey.seed,
					acquiredKey.rx,
					acquiredKey.ry,
					acquiredKey.rot
				);
				acquiredKey = null;
			}
		};
	});

	onDestroy(() => {
		maps = undefined;
	});
</script>

<T.MeshStandardMaterial
	attach="material"
	color={material.color}
	roughness={material.roughness}
	metalness={material.metalness}
	map={maps?.map}
	normalMap={maps?.normalMap}
	roughnessMap={maps?.roughnessMap}
	aoMap={maps?.aoMap}
	metalnessMap={maps?.metalnessMap}
	toneMapped={receiveLighting}
/>
