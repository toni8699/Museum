import type { NavigationGraph } from '@portfolio/camera-core';
import { getCameraRoute, getNode } from '@portfolio/camera-core';
import type { SceneObjectPlacement } from '$lib/content/scene';
import type { RoomId } from '$lib/types/scene';

export type MuseumNavigationStatus = {
  currentRoomId: RoomId;
  activeNodeId: string;
  targetNodeId: string | null;
};

export function getParisAssetActivation(
  status: MuseumNavigationStatus,
  graph: NavigationGraph
) {
  const routePassesParis = status.targetNodeId
    ? getCameraRoute(status.activeNodeId, status.targetNodeId, graph).nodeIds.some(
        (nodeId) => getNode(nodeId, graph).roomId === 'paris'
      )
    : false;

  return {
    routePassesParis,
    preloadParisHero:
      status.currentRoomId === 'departure' ||
      status.currentRoomId === 'paris' ||
      routePassesParis,
    loadParisSalon: status.currentRoomId === 'paris' || routePassesParis
  };
}

export function isSceneObjectEnabled(
  placement: SceneObjectPlacement,
  activation: Pick<
    ReturnType<typeof getParisAssetActivation>,
    'preloadParisHero' | 'loadParisSalon'
  >
) {
  if (placement.roomId !== 'paris') return true;
  return placement.assetId === 'paris-grand-piano'
    ? activation.preloadParisHero
    : activation.loadParisSalon;
}
