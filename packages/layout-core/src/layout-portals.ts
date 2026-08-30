import type { LayoutDocument, LayoutOpening } from './layout-types';

export type LayoutPortalOpeningRef = { roomId: string; openingId: string; segmentId: string };
export type LayoutPortalRelation = { roomIds: [string, string]; openings: LayoutPortalOpeningRef[] };

export function projectLayoutPortalRelations(document: LayoutDocument): LayoutPortalRelation[] {
  const relations = new Map<string, LayoutPortalRelation>();
  for (const floor of document.floors) {
    for (const room of floor.rooms) {
      for (const opening of room.openings) {
        const relation = opening.connectsRoomIds;
        if (!relation) continue;
        const roomIds = [...relation].sort((a, b) => a.localeCompare(b)) as [string, string];
        const key = roomIds.join('|');
        const current = relations.get(key) ?? { roomIds, openings: [] };
        current.openings.push({ roomId: room.id, openingId: opening.id, segmentId: opening.segmentId });
        relations.set(key, current);
      }
    }
  }
  return [...relations.values()].sort((a, b) => a.roomIds.join('|').localeCompare(b.roomIds.join('|')));
}

export function portalOpeningHasRoomPair(opening: LayoutOpening, roomA: string, roomB: string): boolean {
  const relation = opening.connectsRoomIds;
  return Boolean(relation && relation.includes(roomA) && relation.includes(roomB));
}
