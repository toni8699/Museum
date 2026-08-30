<script lang="ts">
  import { T } from '@threlte/core';
  import { Object3D, type SpotLight } from 'three';

  let { preloadHero = false }: { preloadHero?: boolean } = $props();

  const lightTarget = new Object3D();
  lightTarget.position.set(1.35, 0.8, -0.25);

  let keyLight = $state<SpotLight>();

  $effect(() => {
    if (!keyLight) return;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 12;
    keyLight.shadow.bias = -0.00035;
    keyLight.shadow.normalBias = 0.025;
  });
</script>

  <T is={lightTarget} />
  <T.SpotLight
    bind:ref={keyLight}
    position={[1.05, 3.82, 1.45]}
    target={lightTarget}
    color="#ffd5a0"
    intensity={44}
    distance={12}
    angle={0.72}
    penumbra={0.78}
    decay={2}
    castShadow={preloadHero}
    visible={preloadHero}
  />
  <T.PointLight
    position={[-0.1, 3.05, 0.65]}
    color="#ffd4a0"
    intensity={13}
    distance={8}
    decay={2}
    visible={preloadHero}
  />
  <T.PointLight
    position={[-3.25, 2.25, -1.35]}
    color="#e7b987"
    intensity={5.5}
    distance={5}
    decay={2}
    visible={preloadHero}
  />
  <T.PointLight
    position={[3.45, 1.35, -3.15]}
    color="#ffb96f"
    intensity={3.2}
    distance={3}
    decay={2}
    visible={preloadHero}
  />
  <T.PointLight
    position={[4.3, 3, 3.15]}
    color="#cbdcff"
    intensity={4.5}
    distance={5.5}
    decay={2}
    visible={preloadHero}
  />
