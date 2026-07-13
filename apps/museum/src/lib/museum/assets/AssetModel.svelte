<script lang="ts">
  import { T } from '@threlte/core';
  import { useGltf, useMeshopt } from '@threlte/extras';
  import { Box3, type Object3D } from 'three';
  import { getMuseumAsset } from '$lib/content/assets';
  import type {
    AssetId,
    AssetLoadStatus,
    AssetMetrics,
    FallbackKind
  } from '$lib/types/assets';
  import type { Vec3 } from '$lib/types/museum';
  import AssetFallback from './AssetFallback.svelte';
  import { assetFallbackDimensions } from './fallbacks';
  import {
    cloneModelScene,
    disposeModelInstance,
    inspectModel,
    setModelWireframe
  } from './model-utils';

  let {
    assetId,
    position = [0, 0, 0] as Vec3,
    rotation = [0, 0, 0] as Vec3,
    scale = 1,
    fallback,
    enabled = true,
    visible = true,
    wireframe = false,
    shadows = true,
    showBounds = false,
    status = $bindable<AssetLoadStatus>('idle'),
    metrics = $bindable<AssetMetrics | undefined>(),
    error = $bindable<string | undefined>()
  }: {
    assetId: AssetId;
    position?: Vec3;
    rotation?: Vec3;
    scale?: number;
    fallback?: FallbackKind;
    enabled?: boolean;
    visible?: boolean;
    wireframe?: boolean;
    shadows?: boolean;
    showBounds?: boolean;
    status?: AssetLoadStatus;
    metrics?: AssetMetrics;
    error?: string;
  } = $props();

  const loader = useGltf({ meshoptDecoder: useMeshopt() });
  const asset = $derived(getMuseumAsset(assetId));
  const fallbackKind = $derived(
    fallback ??
      asset.fallback ??
      (asset.category === 'book'
        ? 'books'
        : asset.category === 'decor'
          ? 'rug'
          : asset.category)
  );

  let instance = $state<Object3D>();
  let rawBounds = $state<Box3>();
  let rawMetrics = $state<AssetMetrics>();

  $effect(() => {
    const shouldLoad =
      enabled &&
      Boolean(asset.productionFile) &&
      (asset.status === 'approved' || asset.status === 'testing');
    const url = asset.productionFile;

    if (!shouldLoad) {
      instance = undefined;
      rawBounds = undefined;
      rawMetrics = undefined;
      status = 'fallback';
      error = undefined;
      return;
    }

    let cancelled = false;
    let ownedInstance: Object3D | undefined;
    status = 'loading';
    error = undefined;

    const resource = loader.load(url);
    const unsubscribeModel = resource.subscribe((gltf) => {
      if (!gltf || cancelled) return;
      ownedInstance = cloneModelScene(
        gltf.scene,
        shadows && asset.castShadow,
        shadows && asset.receiveShadow
      );
      const inspection = inspectModel(
        ownedInstance,
        gltf.animations.map((animation) => animation.name).filter(Boolean)
      );
      instance = ownedInstance;
      rawBounds = inspection.bounds;
      rawMetrics = inspection.metrics;
      status = 'ready';
    });
    const unsubscribeError = resource.error.subscribe((loadError) => {
      if (!loadError || cancelled) return;
      error = loadError.message;
      status = 'failed';
      if (import.meta.env.DEV) {
        console.warn(`[AssetModel] Failed to load ${asset.id} from ${url}`, loadError);
      }
    });

    return () => {
      cancelled = true;
      unsubscribeModel();
      unsubscribeError();
      if (ownedInstance) disposeModelInstance(ownedInstance);
      if (instance === ownedInstance) instance = undefined;
    };
  });

  $effect(() => {
    if (instance) setModelWireframe(instance, wireframe);
  });

  $effect(() => {
    const sourceMetrics = rawMetrics;
    const factor = asset.defaultScale * scale;
    if (sourceMetrics) {
      metrics = {
        ...sourceMetrics,
        dimensions: sourceMetrics.dimensions.map((value) => value * factor) as Vec3
      };
      return;
    }

    const fallbackDimensions = assetFallbackDimensions[fallbackKind];
    metrics = {
      dimensions: fallbackDimensions.map((value) => value * scale) as Vec3,
      meshCount: 0,
      materialCount: 0,
      triangleCount: 0,
      animationNames: []
    };
  });

  const fallbackBoundsPosition = $derived<Vec3>(
    fallbackKind === 'frame'
      ? [0, 0, 0]
      : fallbackKind === 'chandelier'
        ? [0, -assetFallbackDimensions[fallbackKind][1] / 2, 0]
        : [0, assetFallbackDimensions[fallbackKind][1] / 2, 0]
  );
</script>

<T.Group {position} {rotation} {scale} {visible}>
  {#if status !== 'ready'}
    <AssetFallback
      kind={fallbackKind}
      {wireframe}
      castShadow={shadows && asset.castShadow}
      receiveShadow={shadows && asset.receiveShadow}
    />
    {#if showBounds}
      <T.Mesh position={fallbackBoundsPosition}>
        <T.BoxGeometry args={assetFallbackDimensions[fallbackKind]} />
        <T.MeshBasicMaterial color="#d6b35f" wireframe transparent opacity={0.8} depthTest={false} />
      </T.Mesh>
    {/if}
  {/if}

  {#if instance}
    <T.Group rotation={asset.defaultRotation ?? [0, 0, 0]} scale={asset.defaultScale}>
      <T is={instance} />
      {#if showBounds && rawBounds}
        <T.Box3Helper args={[rawBounds, 0xd6b35f]} />
      {/if}
    </T.Group>
  {/if}
</T.Group>
