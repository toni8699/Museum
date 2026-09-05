<script lang="ts">
	import { onMount } from 'svelte';
	import { Canvas } from '@threlte/core';
	import { T } from '@threlte/core';
	import type { RuntimeScene } from '$lib/content/scene';
	import type { NavigationGraph } from '@portfolio/project-model';
	import type { CompiledLayoutGeometry } from '$lib/layout/layout-geometry-types';
	import type { LayoutRoomRegistry } from '$lib/project/project-layout-semantics';
	import {
		createVisitorRuntimeState,
		visitorStartNodeId
	} from './visitor-runtime-state.svelte';
	import { neutralVisitorRoomPresentation } from './room-presentation';
	import VisitorCameraDirector from './VisitorCameraDirector.svelte';
	import VisitorEntities from './VisitorEntities.svelte';
	import VisitorLayoutShell from './VisitorLayoutShell.svelte';

	let {
		scene,
		geometry,
		rooms,
		graph,
		resolveTexture,
		reducedMotion = false,
		onExit
	}: {
		scene: RuntimeScene;
		geometry: CompiledLayoutGeometry;
		rooms: LayoutRoomRegistry;
		graph: NavigationGraph;
		resolveTexture: (uri: string) => string | null;
		reducedMotion?: boolean;
		onExit: () => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	const startNodeId = visitorStartNodeId(graph);
	// svelte-ignore state_referenced_locally
	const visitorState = createVisitorRuntimeState(graph, startNodeId);
	// svelte-ignore state_referenced_locally
	visitorState.reducedMotion = reducedMotion;

	const presentation = $derived.by(() => {
		const record: Record<string, typeof neutralVisitorRoomPresentation> = {};
		for (const room of geometry.rooms) {
			record[room.roomId] = neutralVisitorRoomPresentation;
		}
		return record;
	});

	const isZeroNode = $derived(startNodeId === null);
	const canvasDescription = $derived(
		isZeroNode
			? 'Visitor preview. No cameras: drag to orbit, wheel to zoom, right-drag to pan. Press Escape to exit preview.'
			: 'Visitor preview. Use Left and Right arrows to move along the tour, W A S D or drag to look around. Press Escape to exit preview.'
	);

	onMount(() => {
		// Exercise the detached read-only resolver so preview-local URLs stay
		// alive through the surface lifetime; 3D material loading reuses the
		// retained BinaryTextureStore-first loader owned by the session.
		for (const texture of scene.textures) {
			try {
				void resolveTexture(texture.uri);
			} catch {
				// Resolver is total; ignore.
			}
		}
	});
</script>

<div class="visitor-preview" data-visitor-canvas-root>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex (the WebGL viewport owns guarded preview keys) -->
	<div
		class="visitor-canvas"
		tabindex="0"
		role="application"
		aria-label="Visitor preview canvas"
		aria-describedby="visitor-preview-help"
	>
		<Canvas dpr={[1, 1.5]} shadows>
			<T.Color attach="background" args={[0x050508]} />
			<T.Fog attach="fog" args={[0x050508, 22, 54]} />
			<T.AmbientLight intensity={0.2} />
			<T.DirectionalLight position={[2, 8, 5]} color="#c9d1df" intensity={0.7} />
			<VisitorCameraDirector graph={graph} visitor={visitorState} bounds={geometry.bounds ?? null} />
			<VisitorLayoutShell {geometry} {presentation} />
			<VisitorEntities scene={scene} {rooms} />
		</Canvas>
	</div>
	<div class="visitor-pill" role="status">
		<span class="pill-label">VISITOR PREVIEW · Viewing Current Draft</span>
		<button type="button" class="pill-exit" onclick={onExit}>✕ Exit Preview (Esc)</button>
	</div>
	<p id="visitor-preview-help" class="visitor-help">{canvasDescription}</p>
</div>

<style>
	.visitor-preview {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 0;
		background: #050508;
		overflow: hidden;
	}
	.visitor-canvas {
		position: absolute;
		inset: 0;
		outline: none;
	}
	.visitor-canvas:focus-visible {
		box-shadow: inset 0 0 0 1px #2f8cff;
	}
	.visitor-canvas :global(canvas) {
		display: block;
		width: 100%;
		height: 100%;
	}
	.visitor-pill {
		position: absolute;
		top: 0.75rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.45rem 0.7rem;
		border: 1px solid rgb(47 140 255 / 45%);
		border-radius: 999px;
		background: rgb(5 5 8 / 82%);
		color: #f4f0e9;
		font: 600 0.72rem/1.2 Inter, ui-sans-serif, system-ui, sans-serif;
		white-space: nowrap;
		z-index: 5;
	}
	.pill-exit {
		padding: 0.3rem 0.55rem;
		border: 1px solid #635a6f;
		border-radius: 999px;
		background: #292632;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}
	.pill-exit:hover {
		border-color: #c9a9ff;
	}
	.visitor-help {
		position: absolute;
		left: -9999px;
		width: 1px;
		height: 1px;
		overflow: hidden;
	}
</style>
