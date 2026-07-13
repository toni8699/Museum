<script lang="ts">
  import { Canvas, T } from '@threlte/core';
  import { OrbitControls } from '@threlte/extras';
  import { getMuseumAsset, museumAssets } from '$lib/content/assets';
  import AssetModel from '$lib/museum/assets/AssetModel.svelte';
  import type {
    AssetId,
    AssetLoadStatus,
    AssetMetrics
  } from '$lib/types/assets';
  import type { Vec3 } from '$lib/types/museum';

  let selectedAssetId = $state<AssetId>('paris-grand-piano');
  let wireframe = $state(false);
  let shadows = $state(true);
  let modelVisible = $state(true);
  let showBounds = $state(true);
  let rotateQuarter = $state(false);
  let previewScale = $state(1);
  let status = $state<AssetLoadStatus>('idle');
  let metrics = $state<AssetMetrics>();
  let error = $state<string>();
  let copied = $state(false);

  const selectedAsset = $derived(getMuseumAsset(selectedAssetId));
  const previewRotation = $derived<Vec3>([0, rotateQuarter ? Math.PI / 2 : 0, 0]);

  $effect(() => {
    selectedAssetId;
    previewScale = 1;
    rotateQuarter = false;
    copied = false;
    status = 'idle';
    error = undefined;
  });

  function formatDimensions(dimensions?: Vec3) {
    if (!dimensions) return '—';
    return dimensions.map((value) => value.toFixed(2)).join(' × ');
  }

  async function copyTransform() {
    const transform = {
      assetId: selectedAsset.id,
      rotation: previewRotation,
      scale: previewScale
    };
    await navigator.clipboard.writeText(JSON.stringify(transform, null, 2));
    copied = true;
  }
</script>

<svelte:head>
  <title>Asset Preview — Chopin Museum Dev</title>
</svelte:head>

<main class="page">
  <aside class="panel">
    <p class="eyebrow">/dev/assets</p>
    <h1>Museum asset inspector</h1>
    <p class="lede">Inspect production GLBs and their primitive fallbacks before room placement.</p>

    <label>
      Registered asset
      <select bind:value={selectedAssetId}>
        {#each museumAssets as asset (asset.id)}
          <option value={asset.id}>{asset.name} · {asset.status}</option>
        {/each}
      </select>
    </label>

    <div class="toggles">
      <label><input type="checkbox" bind:checked={modelVisible} /> Visible</label>
      <label><input type="checkbox" bind:checked={showBounds} /> Bounds</label>
      <label><input type="checkbox" bind:checked={wireframe} /> Wireframe</label>
      <label><input type="checkbox" bind:checked={shadows} /> Shadows</label>
      <label><input type="checkbox" bind:checked={rotateQuarter} /> Rotate 90°</label>
    </div>

    <label>
      Preview scale × {previewScale.toFixed(2)}
      <input type="range" min="0.25" max="2" step="0.05" bind:value={previewScale} />
    </label>

    <section class="card" aria-live="polite">
      <div class="status-row">
        <strong>Runtime</strong>
        <span class:ready={status === 'ready'} class:failed={status === 'failed'}>{status}</span>
      </div>
      {#if status === 'loading'}
        <p>Loading GLB; the primitive fallback remains visible.</p>
      {:else if status === 'failed'}
        <p class="error">{error ?? 'The model failed to load.'} The fallback remains active.</p>
      {:else if status === 'fallback'}
        <p>No approved production model is registered; showing the fallback.</p>
      {/if}
      <dl>
        <div><dt>Dimensions W × H × D</dt><dd>{formatDimensions(metrics?.dimensions)} m</dd></div>
        <div><dt>Meshes</dt><dd>{metrics?.meshCount ?? '—'}</dd></div>
        <div><dt>Materials</dt><dd>{metrics?.materialCount ?? '—'}</dd></div>
        <div><dt>Triangles</dt><dd>{metrics?.triangleCount.toLocaleString() ?? '—'}</dd></div>
        <div>
          <dt>Animations</dt>
          <dd>{metrics?.animationNames.length ? metrics.animationNames.join(', ') : 'none'}</dd>
        </div>
      </dl>
    </section>

    <section class="card">
      <strong>{selectedAsset.name}</strong>
      <dl>
        <div><dt>Category</dt><dd>{selectedAsset.category}</dd></div>
        <div><dt>Manifest scale</dt><dd>{selectedAsset.defaultScale}</dd></div>
        <div><dt>Licence</dt><dd>{selectedAsset.license}</dd></div>
        <div><dt>Creator</dt><dd>{selectedAsset.creator ?? 'pending'}</dd></div>
      </dl>
      {#if selectedAsset.attribution}<p>{selectedAsset.attribution}</p>{/if}
      {#if selectedAsset.sourceUrl}
        <a href={selectedAsset.sourceUrl} target="_blank" rel="noreferrer">Open canonical source</a>
      {/if}
      {#if selectedAsset.notes}<p>{selectedAsset.notes}</p>{/if}
    </section>

    <button type="button" onclick={copyTransform}>{copied ? 'Copied' : 'Copy preview transform'}</button>
    <a class="back" href="/museum">Back to museum</a>
  </aside>

  <div class="canvas-shell">
    <Canvas dpr={[1, 1.5]} shadows>
      <T.PerspectiveCamera makeDefault position={[3.4, 2.5, 5.4]} fov={44} near={0.05} far={40} />
      <OrbitControls enableDamping target={[0, 0.85, 0]} minDistance={1.2} maxDistance={12} />

      <T.Color attach="background" args={['#17171c']} />
      <T.HemisphereLight args={['#f2e9dc', '#242128', 0.65]} />
      <T.DirectionalLight
        position={[4, 7, 5]}
        color="#fff1dc"
        intensity={1.5}
        castShadow={shadows}
      />

      {#key selectedAssetId}
        <AssetModel
          assetId={selectedAssetId}
          rotation={previewRotation}
          scale={previewScale}
          visible={modelVisible}
          {wireframe}
          {shadows}
          {showBounds}
          bind:status
          bind:metrics
          bind:error
        />
      {/key}

      <T.Mesh position={[0, -0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <T.PlaneGeometry args={[14, 14]} />
        <T.MeshStandardMaterial color="#68666a" roughness={0.9} metalness={0} />
      </T.Mesh>
      <T.GridHelper args={[14, 28, '#8e826f', '#3e3c42']} position={[0, 0.002, 0]} />
    </Canvas>
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
  }

  .page {
    display: grid;
    grid-template-columns: minmax(19rem, 25rem) 1fr;
    min-height: 100vh;
    background: #0b0b10;
    color: #f4efe4;
    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  }

  .panel {
    box-sizing: border-box;
    max-height: 100vh;
    padding: 1.25rem 1.35rem 2rem;
    overflow: auto;
    border-right: 1px solid rgb(255 255 255 / 0.1);
    background: rgb(10 10 14 / 0.96);
  }

  .eyebrow {
    margin: 0;
    color: #d6b35f;
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0.35rem 0 0.6rem;
    font-size: 1.7rem;
  }

  .lede,
  p,
  dt,
  dd,
  label {
    color: rgb(244 239 228 / 0.76);
    font-size: 0.88rem;
    line-height: 1.45;
  }

  label {
    display: grid;
    gap: 0.38rem;
    margin: 1rem 0;
  }

  select,
  button {
    min-height: 2.5rem;
    border: 1px solid rgb(255 255 255 / 0.16);
    border-radius: 0.55rem;
    background: #202027;
    color: #f4efe4;
    padding: 0.55rem 0.7rem;
  }

  input[type='range'] {
    width: 100%;
  }

  .toggles {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.15rem 0.8rem;
  }

  .toggles label {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin: 0.15rem 0;
  }

  .card {
    margin: 1rem 0;
    padding: 0.8rem;
    border: 1px solid rgb(255 255 255 / 0.1);
    border-radius: 0.7rem;
    background: rgb(255 255 255 / 0.04);
  }

  .status-row,
  dl div {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }

  dl {
    display: grid;
    gap: 0.32rem;
    margin: 0.7rem 0 0;
  }

  dt,
  dd {
    margin: 0;
  }

  dd {
    color: #f4efe4;
    text-align: right;
  }

  .ready {
    color: #9ed3bf;
  }

  .failed,
  .error {
    color: #e3a17a;
  }

  a {
    color: #d6b35f;
  }

  .back {
    display: block;
    margin-top: 1rem;
  }

  button {
    width: 100%;
    cursor: pointer;
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
      max-height: 45vh;
      border-right: 0;
      border-bottom: 1px solid rgb(255 255 255 / 0.1);
    }

    .canvas-shell {
      min-height: 60vh;
    }
  }
</style>
