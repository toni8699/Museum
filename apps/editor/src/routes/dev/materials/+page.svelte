<script lang="ts">
  import { page } from '$app/state';
  import { Canvas, T } from '@threlte/core';
  import { computeTextureRepeat, getMaterial } from '$lib/content/materials';
  import MaterialPreviewItem from '$lib/museum/materials/MaterialPreviewItem.svelte';
  import type { MaterialId, MaterialLoadStatus, Vec2 } from '$lib/types/materials';

  type PreviewSpec = {
    id: MaterialId;
    kind: 'wall' | 'floor' | 'brass' | 'box' | 'curtain' | 'paper';
    surfaceSize: Vec2;
    position: [number, number, number];
  };

  const previews: PreviewSpec[] = [
    { id: 'plaster-warm', kind: 'wall', surfaceSize: [3, 2.4], position: [-4.5, 1.2, 0] },
    { id: 'wood-walnut', kind: 'floor', surfaceSize: [3, 3], position: [-1.5, 0, 0] },
    { id: 'brass-aged', kind: 'brass', surfaceSize: [0.8, 0.8], position: [1.2, 0.6, 0] },
    { id: 'marble-light', kind: 'box', surfaceSize: [1.4, 0.25], position: [3.4, 0.12, 0] },
    { id: 'velvet-dark', kind: 'curtain', surfaceSize: [1.6, 2.4], position: [5.4, 1.2, 0] },
    { id: 'paper-aged', kind: 'paper', surfaceSize: [0.9, 1.2], position: [7.2, 1.1, 0] }
  ];

  const texturesOff = $derived(page.url.searchParams.get('textures') === 'off');
  const textureMode = $derived(texturesOff ? ('off' as const) : ('auto' as const));

  let plasterStatus = $state<MaterialLoadStatus>('idle');
  let woodStatus = $state<MaterialLoadStatus>('idle');
  let brassStatus = $state<MaterialLoadStatus>('idle');
  let marbleStatus = $state<MaterialLoadStatus>('idle');
  let velvetStatus = $state<MaterialLoadStatus>('idle');
  let paperStatus = $state<MaterialLoadStatus>('idle');

  const statusById = $derived({
    'plaster-warm': plasterStatus,
    'wood-walnut': woodStatus,
    'brass-aged': brassStatus,
    'marble-light': marbleStatus,
    'velvet-dark': velvetStatus,
    'paper-aged': paperStatus
  } as Record<MaterialId, MaterialLoadStatus>);

  function repeatFor(id: MaterialId, surfaceSize: Vec2) {
    const material = getMaterial(id);
    return computeTextureRepeat(surfaceSize, material.defaultTileSizeMeters ?? [1, 1]);
  }
</script>

<svelte:head>
  <title>Material Preview — Chopin Museum Dev</title>
</svelte:head>

<main class="page">
  <aside class="panel">
    <p class="eyebrow">/dev/materials</p>
    <h1>Architecture materials</h1>
    <p class="lede">
      Isolated PBR preview. Use <code>?textures=off</code> to force fallback colours.
    </p>

    <ul>
      {#each previews as preview (preview.id)}
        {@const material = getMaterial(preview.id)}
        {@const repeat = repeatFor(preview.id, preview.surfaceSize)}
        {@const status = statusById[preview.id]}
        <li>
          <strong>{material.label}</strong>
          <span>{preview.surfaceSize[0].toFixed(2)} × {preview.surfaceSize[1].toFixed(2)} m</span>
          <span>repeat {repeat[0].toFixed(2)} × {repeat[1].toFixed(2)}</span>
          <span
            class:ready={status === 'ready'}
            class:failed={status === 'failed'}
            class:fallback={status === 'fallback' || status === 'loading'}
          >
            {status}{status === 'failed' || status === 'fallback' ? ' (fallback colour)' : ''}
          </span>
        </li>
      {/each}
    </ul>

    <p class="hint">
      Textured: plaster, wood, brass. Marble / velvet / paper are fallback-only until assets arrive.
    </p>
    <a href="/museum">Back to museum</a>
  </aside>

  <div class="canvas-shell">
    <Canvas dpr={[1, 1.5]} shadows={false}>
      <T.PerspectiveCamera makeDefault position={[2.2, 2.4, 8.5]} fov={45} />
      <T.AmbientLight intensity={0.35} />
      <T.HemisphereLight args={['#f0e6d4', '#1a1814', 0.55]} />
      <T.DirectionalLight position={[4, 8, 3]} intensity={1.15} color="#fff4e5" />
      <T.Color attach="background" args={['#121218']} />

      <MaterialPreviewItem
        materialId="plaster-warm"
        kind="wall"
        surfaceSize={[3, 2.4]}
        position={[-4.5, 1.2, 0]}
        textures={textureMode}
        bind:status={plasterStatus}
      />
      <MaterialPreviewItem
        materialId="wood-walnut"
        kind="floor"
        surfaceSize={[3, 3]}
        position={[-1.5, 0, 0]}
        textures={textureMode}
        bind:status={woodStatus}
      />
      <MaterialPreviewItem
        materialId="brass-aged"
        kind="brass"
        surfaceSize={[0.8, 0.8]}
        position={[1.2, 0.6, 0]}
        textures={textureMode}
        bind:status={brassStatus}
      />
      <MaterialPreviewItem
        materialId="marble-light"
        kind="box"
        surfaceSize={[1.4, 0.25]}
        position={[3.4, 0.12, 0]}
        textures={textureMode}
        bind:status={marbleStatus}
      />
      <MaterialPreviewItem
        materialId="velvet-dark"
        kind="curtain"
        surfaceSize={[1.6, 2.4]}
        position={[5.4, 1.2, 0]}
        textures={textureMode}
        bind:status={velvetStatus}
      />
      <MaterialPreviewItem
        materialId="paper-aged"
        kind="paper"
        surfaceSize={[0.9, 1.2]}
        position={[7.2, 1.1, 0]}
        textures={textureMode}
        bind:status={paperStatus}
      />

      <T.Mesh position={[1.5, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <T.PlaneGeometry args={[16, 6]} />
        <T.MeshStandardMaterial color="#1a1a22" roughness={0.95} />
      </T.Mesh>
    </Canvas>
  </div>
</main>

<style>
  .page {
    display: grid;
    grid-template-columns: minmax(18rem, 24rem) 1fr;
    min-height: 100vh;
    background: #0b0b10;
    color: #f4efe4;
    font-family:
      ui-sans-serif,
      system-ui,
      -apple-system,
      sans-serif;
  }

  .panel {
    padding: 1.25rem 1.35rem;
    border-right: 1px solid rgb(255 255 255 / 0.1);
    background: rgb(10 10 14 / 0.92);
    overflow: auto;
  }

  .eyebrow {
    margin: 0;
    color: #d6b35f;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-size: 0.72rem;
  }

  h1 {
    margin: 0.35rem 0 0.6rem;
    font-size: 1.7rem;
  }

  .lede,
  .hint,
  li span {
    color: rgb(244 239 228 / 0.72);
    line-height: 1.45;
    font-size: 0.9rem;
  }

  ul {
    list-style: none;
    padding: 0;
    margin: 1rem 0;
    display: grid;
    gap: 0.75rem;
  }

  li {
    display: grid;
    gap: 0.15rem;
    padding: 0.7rem 0.8rem;
    border: 1px solid rgb(255 255 255 / 0.1);
    border-radius: 0.75rem;
    background: rgb(255 255 255 / 0.04);
  }

  .ready {
    color: #9ed3bf;
  }

  .failed,
  .fallback {
    color: #d18b56;
  }

  a {
    color: #d6b35f;
  }

  .canvas-shell {
    position: relative;
    min-height: 100vh;
  }

  @media (max-width: 840px) {
    .page {
      grid-template-columns: 1fr;
      grid-template-rows: auto 60vh;
    }

    .panel {
      border-right: 0;
      border-bottom: 1px solid rgb(255 255 255 / 0.1);
      max-height: 40vh;
    }

    .canvas-shell {
      min-height: 60vh;
    }
  }
</style>
