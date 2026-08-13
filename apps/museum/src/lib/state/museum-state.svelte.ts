import {
  getNode,
  type NavigationGraph
} from '$lib/content/scene';
import { museumNavigationGraph } from '$lib/content/chopin-project';
import type { MuseumRoomId, TourMode } from '$lib/types/museum';

export class MuseumStateStore {
  currentRoomId = $state<MuseumRoomId>('entrance');
  activeNodeId = $state('entrance-start');
  targetNodeId = $state<string | null>(null);
  isTransitioning = $state(false);
  tourMode = $state<TourMode>('guided');
  audioEnabled = $state(false);
  reducedMotion = $state(false);
  visitedRoomIds = $state(new Set<MuseumRoomId>(['entrance']));

  constructor(
    readonly graph: NavigationGraph = museumNavigationGraph,
    initialNodeId = 'entrance-start'
  ) {
    const initialNode = getNode(initialNodeId, graph);
    this.activeNodeId = initialNode.id;
    this.currentRoomId = initialNode.roomId;
    this.visitedRoomIds = new Set([initialNode.roomId]);
  }

  get activeNode() {
    return getNode(this.activeNodeId, this.graph);
  }

  get targetNode() {
    return this.targetNodeId ? getNode(this.targetNodeId, this.graph) : null;
  }

  get currentRoom() {
    return this.activeNode.roomId;
  }

  get connectedNodes() {
    return this.activeNode.connectedNodeIds
      .filter((id) => this.canNavigateTo(id))
      .map((id) => getNode(id, this.graph));
  }

  canNavigateTo(nodeId: string) {
    if (nodeId === this.activeNodeId || this.isTransitioning) return false;
    if (this.tourMode === 'free') return true;
    if (nodeId === this.activeNode.nextNodeId) return true;
    if (nodeId !== this.activeNode.previousNodeId) return false;
    return this.visitedRoomIds.has(getNode(nodeId, this.graph).roomId);
  }

  requestNode(nodeId: string) {
    const next = getNode(nodeId, this.graph);
    if (!this.canNavigateTo(nodeId)) return;
    if (nodeId === this.activeNodeId || next.lockInteraction || this.isTransitioning) return;

    this.targetNodeId = nodeId;
    this.isTransitioning = true;
  }

  completeTransition(nodeId: string) {
    const next = getNode(nodeId, this.graph);
    this.activeNodeId = nodeId;
    this.currentRoomId = next.roomId;
    this.targetNodeId = null;
    this.isTransitioning = false;
    this.visitedRoomIds = new Set([...this.visitedRoomIds, next.roomId]);
  }

  goNext() {
    const nextNodeId = this.activeNode.nextNodeId;
    if (nextNodeId) this.requestNode(nextNodeId);
  }

  goBack() {
    const previousNodeId = this.activeNode.previousNodeId;
    if (previousNodeId) this.requestNode(previousNodeId);
  }

  toggleReducedMotion() {
    this.reducedMotion = !this.reducedMotion;
  }

  toggleTourMode() {
    this.tourMode = this.tourMode === 'guided' ? 'free' : 'guided';
  }
}

export function createMuseumState(
  graph: NavigationGraph = museumNavigationGraph,
  initialNodeId = 'entrance-start'
) {
  return new MuseumStateStore(graph, initialNodeId);
}

export const museumState = createMuseumState();
