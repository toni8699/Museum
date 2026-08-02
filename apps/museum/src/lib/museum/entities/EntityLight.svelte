<script lang="ts">
  import { T } from '@threlte/core';
  import { Object3D } from 'three';
  import type { SceneLightEntity } from '$lib/content/scene';

  let {
    entity,
    showPickProxy = false
  }: {
    entity: SceneLightEntity;
    /** Invisible mesh so editor raycast / BoxHelper have geometry. */
    showPickProxy?: boolean;
  } = $props();

  // Spot/Directional default to local (0,1,0) and aim at an unbound world-origin target.
  // Keep light at entity origin; aim along parent local -Z so authored rotation steers.
  const aimTarget = new Object3D();
  aimTarget.position.set(0, 0, -1);
</script>

{#if entity.light === 'point'}
  <T.PointLight
    position={[0, 0, 0]}
    color={entity.color}
    intensity={entity.intensity}
    distance={entity.range ?? 0}
    castShadow={entity.castShadow}
  />
{:else if entity.light === 'spot'}
  <T is={aimTarget} />
  <T.SpotLight
    position={[0, 0, 0]}
    target={aimTarget}
    color={entity.color}
    intensity={entity.intensity}
    distance={entity.range ?? 0}
    angle={entity.angle}
    penumbra={entity.penumbra ?? 0}
    castShadow={entity.castShadow}
  />
{:else}
  <T is={aimTarget} />
  <T.DirectionalLight
    position={[0, 0, 0]}
    target={aimTarget}
    color={entity.color}
    intensity={entity.intensity}
    castShadow={entity.castShadow}
  />
{/if}

{#if showPickProxy}
  <T.Mesh>
    <T.SphereGeometry args={[0.12, 12, 10]} />
    <T.MeshBasicMaterial transparent opacity={0} depthWrite={false} />
  </T.Mesh>
{/if}
