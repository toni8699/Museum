<script lang="ts">
  import { T } from '@threlte/core';
  import FallbackMaterial from './FallbackMaterial.svelte';
  import type { AssetFallbackKind } from './fallbacks';

  let {
    kind,
    visible = true,
    wireframe = false,
    castShadow = false,
    receiveShadow = false
  }: {
    kind: AssetFallbackKind;
    visible?: boolean;
    wireframe?: boolean;
    castShadow?: boolean;
    receiveShadow?: boolean;
  } = $props();
</script>

<T.Group {visible}>
  {#if kind === 'piano'}
    <!-- 1.5 m wide x 2.25 m long x 1 m high; keyboard faces +Z. -->
    <T.Mesh position={[0, 0.72, -0.16]} {castShadow} {receiveShadow}>
      <T.BoxGeometry args={[1.5, 0.32, 1.78]} />
      <FallbackMaterial
        materialId="wood-walnut"
        surfaceSize={[1.5, 1.78]}
        tint="#130f0d"
        {wireframe}
      />
    </T.Mesh>
    <T.Mesh position={[0, 0.9, -0.2]} rotation={[-0.055, 0, 0]} {castShadow} {receiveShadow}>
      <T.BoxGeometry args={[1.48, 0.065, 1.86]} />
      <FallbackMaterial
        materialId="wood-walnut"
        surfaceSize={[1.48, 1.86]}
        tint="#090807"
        {wireframe}
      />
    </T.Mesh>
    <T.Mesh position={[0, 0.69, 0.91]} {castShadow} {receiveShadow}>
      <T.BoxGeometry args={[1.5, 0.17, 0.38]} />
      <FallbackMaterial
        materialId="wood-walnut"
        surfaceSize={[1.5, 0.38]}
        tint="#18120e"
        {wireframe}
      />
    </T.Mesh>
    <T.Mesh position={[0, 0.79, 1.03]} {castShadow} {receiveShadow}>
      <T.BoxGeometry args={[1.28, 0.04, 0.28]} />
      <FallbackMaterial materialId="paper-aged" surfaceSize={[1.28, 0.28]} tint="#ded4bb" {wireframe} />
    </T.Mesh>
    {#each [-0.58, 0.58] as x}
      <T.Mesh position={[x, 0.34, 0.78]} {castShadow} {receiveShadow}>
        <T.CylinderGeometry args={[0.055, 0.075, 0.68, 10]} />
        <FallbackMaterial materialId="wood-walnut" surfaceSize={[0.18, 0.68]} tint="#130f0d" {wireframe} />
      </T.Mesh>
    {/each}
    <T.Mesh position={[0, 0.34, -0.72]} {castShadow} {receiveShadow}>
      <T.CylinderGeometry args={[0.06, 0.085, 0.68, 10]} />
      <FallbackMaterial materialId="wood-walnut" surfaceSize={[0.2, 0.68]} tint="#130f0d" {wireframe} />
    </T.Mesh>
  {:else if kind === 'chair'}
    <!-- 0.5 m wide x 0.55 m deep x 0.9 m high; sitter faces -Z. -->
    <T.Mesh position={[0, 0.46, 0]} {castShadow} {receiveShadow}>
      <T.BoxGeometry args={[0.5, 0.12, 0.5]} />
      <FallbackMaterial materialId="velvet-dark" surfaceSize={[0.5, 0.5]} tint="#642a35" {wireframe} />
    </T.Mesh>
    <T.Mesh position={[0, 0.7, 0.235]} {castShadow} {receiveShadow}>
      <T.BoxGeometry args={[0.5, 0.4, 0.08]} />
      <FallbackMaterial materialId="velvet-dark" surfaceSize={[0.5, 0.4]} tint="#642a35" {wireframe} />
    </T.Mesh>
    {#each [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]] as leg}
      <T.Mesh position={[leg[0], 0.21, leg[1]]} {castShadow} {receiveShadow}>
        <T.BoxGeometry args={[0.045, 0.42, 0.045]} />
        <FallbackMaterial materialId="wood-walnut" surfaceSize={[0.05, 0.42]} {wireframe} />
      </T.Mesh>
    {/each}
  {:else if kind === 'desk'}
    <!-- 1.4 m wide x 0.7 m deep x 0.75 m high. -->
    <T.Mesh position={[0, 0.71, 0]} {castShadow} {receiveShadow}>
      <T.BoxGeometry args={[1.4, 0.08, 0.7]} />
      <FallbackMaterial materialId="wood-walnut" surfaceSize={[1.4, 0.7]} {wireframe} />
    </T.Mesh>
    <T.Mesh position={[0, 0.57, 0.21]} {castShadow} {receiveShadow}>
      <T.BoxGeometry args={[0.64, 0.18, 0.22]} />
      <FallbackMaterial materialId="wood-walnut" surfaceSize={[0.64, 0.22]} tint="#332116" {wireframe} />
    </T.Mesh>
    {#each [[-0.59, -0.25], [0.59, -0.25], [-0.59, 0.25], [0.59, 0.25]] as leg}
      <T.Mesh position={[leg[0], 0.335, leg[1]]} {castShadow} {receiveShadow}>
        <T.BoxGeometry args={[0.07, 0.67, 0.07]} />
        <FallbackMaterial materialId="wood-walnut" surfaceSize={[0.07, 0.67]} {wireframe} />
      </T.Mesh>
    {/each}
  {:else if kind === 'lamp'}
    <!-- Compact 0.55 m table lamp. -->
    <T.Mesh position={[0, 0.025, 0]} {castShadow} {receiveShadow}>
      <T.CylinderGeometry args={[0.13, 0.16, 0.05, 20]} />
      <FallbackMaterial materialId="brass-aged" surfaceSize={[0.32, 0.05]} {wireframe} />
    </T.Mesh>
    <T.Mesh position={[0, 0.25, 0]} {castShadow} {receiveShadow}>
      <T.CylinderGeometry args={[0.018, 0.024, 0.42, 12]} />
      <FallbackMaterial materialId="brass-aged" surfaceSize={[0.05, 0.42]} {wireframe} />
    </T.Mesh>
    <T.Mesh position={[0, 0.43, 0]} {castShadow} {receiveShadow}>
      <T.CylinderGeometry args={[0.1, 0.16, 0.24, 20, 1, true]} />
      <FallbackMaterial materialId="paper-aged" surfaceSize={[0.5, 0.24]} tint="#e8d1a4" {wireframe} />
    </T.Mesh>
  {:else if kind === 'frame'}
    <!-- Wall-mounted 0.85 m x 1.05 m frame, centered on its placement origin. -->
    {#each [[0, 0.49, 0.85, 0.07], [0, -0.49, 0.85, 0.07], [-0.39, 0, 0.07, 0.91], [0.39, 0, 0.07, 0.91]] as rail}
      <T.Mesh position={[rail[0], rail[1], 0]} {castShadow} {receiveShadow}>
        <T.BoxGeometry args={[rail[2], rail[3], 0.07]} />
        <FallbackMaterial materialId="brass-aged" surfaceSize={[rail[2], rail[3]]} {wireframe} />
      </T.Mesh>
    {/each}
    <T.Mesh position={[0, 0, -0.025]} {castShadow} {receiveShadow}>
      <T.BoxGeometry args={[0.71, 0.91, 0.015]} />
      <FallbackMaterial materialId="paper-aged" surfaceSize={[0.71, 0.91]} tint="#7c6c5b" {wireframe} />
    </T.Mesh>
  {:else if kind === 'book'}
    <T.Mesh position={[0, 0.02, 0]} {castShadow} {receiveShadow}>
      <T.BoxGeometry args={[0.18, 0.04, 0.25]} />
      <FallbackMaterial materialId="paper-aged" surfaceSize={[0.18, 0.25]} tint="#7b3032" {wireframe} />
    </T.Mesh>
  {:else if kind === 'books'}
    <!-- Three-volume stack fits 0.48 m x 0.15 m x 0.3 m. -->
    <T.Mesh position={[0, 0.025, 0]} rotation={[0, 0.04, 0]} {castShadow} {receiveShadow}>
      <T.BoxGeometry args={[0.42, 0.05, 0.3]} />
      <FallbackMaterial materialId="paper-aged" surfaceSize={[0.42, 0.3]} tint="#5f3428" {wireframe} />
    </T.Mesh>
    <T.Mesh position={[-0.01, 0.075, 0]} rotation={[0, -0.035, 0]} {castShadow} {receiveShadow}>
      <T.BoxGeometry args={[0.48, 0.05, 0.26]} />
      <FallbackMaterial materialId="paper-aged" surfaceSize={[0.48, 0.26]} tint="#31434a" {wireframe} />
    </T.Mesh>
    <T.Mesh position={[0.015, 0.125, 0]} rotation={[0, 0.07, 0]} {castShadow} {receiveShadow}>
      <T.BoxGeometry args={[0.36, 0.05, 0.24]} />
      <FallbackMaterial materialId="paper-aged" surfaceSize={[0.36, 0.24]} tint="#7b3032" {wireframe} />
    </T.Mesh>
  {:else if kind === 'clock'}
    <!-- Mantel clock: 0.34 m wide x 0.32 m high x 0.16 m deep. -->
    <T.Mesh position={[0, 0.13, 0]} {castShadow} {receiveShadow}>
      <T.BoxGeometry args={[0.34, 0.26, 0.16]} />
      <FallbackMaterial materialId="wood-walnut" surfaceSize={[0.34, 0.26]} {wireframe} />
    </T.Mesh>
    <T.Mesh position={[0, 0.17, 0.085]} rotation={[Math.PI / 2, 0, 0]} {castShadow} {receiveShadow}>
      <T.CylinderGeometry args={[0.1, 0.1, 0.02, 24]} />
      <FallbackMaterial materialId="paper-aged" surfaceSize={[0.2, 0.2]} tint="#e3dcc8" {wireframe} />
    </T.Mesh>
    <T.Mesh position={[0, 0.015, 0]} {castShadow} {receiveShadow}>
      <T.BoxGeometry args={[0.38, 0.03, 0.19]} />
      <FallbackMaterial materialId="brass-aged" surfaceSize={[0.38, 0.19]} {wireframe} />
    </T.Mesh>
  {:else if kind === 'decor'}
    <!-- Small ceramic-vase stand-in. -->
    <T.Mesh position={[0, 0.11, 0]} {castShadow} {receiveShadow}>
      <T.SphereGeometry args={[0.11, 20, 14]} />
      <FallbackMaterial materialId="marble-light" surfaceSize={[0.22, 0.22]} tint="#9fa6a2" {wireframe} />
    </T.Mesh>
    <T.Mesh position={[0, 0.3, 0]} {castShadow} {receiveShadow}>
      <T.CylinderGeometry args={[0.045, 0.075, 0.16, 18]} />
      <FallbackMaterial materialId="marble-light" surfaceSize={[0.18, 0.16]} tint="#9fa6a2" {wireframe} />
    </T.Mesh>
  {:else if kind === 'rug'}
    <T.Mesh position={[0, 0.0075, 0]} rotation={[-Math.PI / 2, 0, 0]} {castShadow} {receiveShadow}>
      <T.PlaneGeometry args={[2.6, 1.8]} />
      <FallbackMaterial materialId="velvet-dark" surfaceSize={[2.6, 1.8]} tint="#54232d" {wireframe} />
    </T.Mesh>
  {/if}
</T.Group>
