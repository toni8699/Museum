import { describe, expect, it } from 'vitest';
import { chopinLayout } from '$lib/content/chopin-layout';
import { projectLayoutPortalRelations } from '$lib/layout/layout-portals';

describe('layout portal projection', () => {
  it('projects seven explicit undirected Chopin relations', () => {
    const relations = projectLayoutPortalRelations(chopinLayout);
    expect(relations.map((relation) => relation.roomIds.join('|'))).toEqual([
      'departure|paris',
      'departure|poland',
      'entrance|legacy',
      'entrance|poland',
      'legacy|music-chamber',
      'music-chamber|workshop',
      'paris|workshop'
    ]);
    expect(relations.find((relation) => relation.roomIds.join('|') === 'entrance|poland')?.openings).toHaveLength(2);
  });

  it('does not infer relations from room geometry', () => {
    const document = structuredClone(chopinLayout);
    for (const room of document.floors[0]!.rooms) {
      for (const opening of room.openings) delete opening.connectsRoomIds;
    }
    expect(projectLayoutPortalRelations(document)).toEqual([]);
  });
});
