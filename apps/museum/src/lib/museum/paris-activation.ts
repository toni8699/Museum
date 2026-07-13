import {
  getNode,
  type NavigationGraph,
  type SceneObjectPlacement
} from '$lib/content/scene';
import type { MuseumRoomId } from '$lib/types/museum';
import { getCameraRoute } from './navigation/camera-route';

export type MuseumNavigationStatus = {
  currentRoomId: MuseumRoomId;
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
