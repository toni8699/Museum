import { getNode } from '$lib/content/rooms';
import type { MuseumRoomId, TourMode } from '$lib/types/museum';

class MuseumStateStore {
  currentRoomId = $state<MuseumRoomId>('entrance');
  activeNodeId = $state('entrance-start');
  targetNodeId = $state<string | null>(null);
  isTransitioning = $state(false);
  tourMode = $state<TourMode>('guided');
  audioEnabled = $state(false);
  reducedMotion = $state(false);
  visitedRoomIds = $state(new Set<MuseumRoomId>(['entrance']));

  get activeNode() {
    return getNode(this.activeNodeId);
  }

  get targetNode() {
    return this.targetNodeId ? getNode(this.targetNodeId) : null;
  }

  get currentRoom() {
    return this.activeNode.roomId;
  }

  get connectedNodes() {
    return this.activeNode.connectedNodeIds.filter((id) => this.canNavigateTo(id)).map(getNode);
  }

  canNavigateTo(nodeId: string) {
    if (nodeId === this.activeNodeId || this.isTransitioning) return false;
    if (this.tourMode === 'free') return true;
    if (nodeId === this.activeNode.nextNodeId) return true;
    if (nodeId !== this.activeNode.previousNodeId) return false;
    return this.visitedRoomIds.has(getNode(nodeId).roomId);
  }

  requestNode(nodeId: string) {
    const next = getNode(nodeId);
    if (!this.canNavigateTo(nodeId)) return;
    if (nodeId === this.activeNodeId || next.lockInteraction || this.isTransitioning) return;

    this.targetNodeId = nodeId;
    this.isTransitioning = true;
  }

  completeTransition(nodeId: string) {
    const next = getNode(nodeId);
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

export const museumState = new MuseumStateStore();
