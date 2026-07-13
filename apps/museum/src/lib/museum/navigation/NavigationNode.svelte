<script lang="ts">
  import { T } from '@threlte/core';
  import type { IntersectionEvent } from '@threlte/extras';
  import type { NavigationNodeData } from '$lib/types/museum';
  import {
    museumState,
    type MuseumStateStore
  } from '$lib/state/museum-state.svelte';

  let {
    node,
    state: store = museumState
  }: {
    node: NavigationNodeData;
    state?: MuseumStateStore;
  } = $props();

  let hovered = $state(false);
  const isCurrent = $derived(store.activeNodeId === node.id);
  const isTarget = $derived(store.targetNodeId === node.id);
  const isConnected = $derived(store.canNavigateTo(node.id));
  const visible = $derived(store.tourMode === 'free' || isCurrent || isTarget || isConnected);
  const opacity = $derived(isCurrent ? 0.95 : isTarget ? 0.9 : isConnected ? 0.76 : 0.22);
  const color = $derived(isCurrent ? '#ffffff' : isTarget ? '#d6b35f' : isConnected ? '#c7a65b' : '#6f6a78');
  const scale = $derived(isCurrent ? 1.18 : hovered ? 1.08 : 1);

  function select(event: IntersectionEvent<MouseEvent>) {
    event.stopPropagation();
    store.requestNode(node.id);
  }

  function showHover(event: IntersectionEvent<PointerEvent>) {
    event.stopPropagation();
    hovered = true;
  }

  function hideHover() {
    hovered = false;
  }
</script>

{#if visible}
  <T.Group position={[node.position[0], 0.55, node.position[2]]} scale={[scale, scale, scale]}>
    <T.Mesh
      onclick={select}
      onpointerover={showHover}
      onpointerout={hideHover}
    >
      <T.SphereGeometry args={[0.22, 24, 16]} />
      <T.MeshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={isCurrent || isTarget ? 0.9 : 0.38}
        transparent
        opacity={opacity}
        roughness={0.34}
      />
    </T.Mesh>
    <T.Mesh position={[0, -0.38, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <T.TorusGeometry args={[0.38, 0.018, 8, 32]} />
      <T.MeshBasicMaterial color={color} transparent opacity={opacity * 0.75} />
    </T.Mesh>
    {#if isConnected || isTarget}
      <T.PointLight color={color} intensity={1.3} distance={2.2} />
    {/if}
  </T.Group>
{/if}
