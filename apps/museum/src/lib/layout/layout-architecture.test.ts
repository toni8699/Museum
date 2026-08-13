import { describe, expect, it } from 'vitest';
import { chopinLayout } from '$lib/content/chopin-layout';
import { buildLayoutArchitectureModel } from './layout-architecture';

describe('layout architecture model', () => {
  it('projects all compiled rooms and preserves floor elevations', () => {
    const model = buildLayoutArchitectureModel(chopinLayout);
    expect(model.rooms.map((room) => room.roomId)).toEqual([
      'entrance', 'poland', 'departure', 'paris', 'workshop', 'music-chamber', 'legacy'
    ]);
    expect(model.rooms.every((room) => room.floorElevation === 0 && room.ceilingElevation === 4.2)).toBe(true);
  });

  it('keeps explicit door gaps while retaining wall side and lintel sections', () => {
    const entrance = buildLayoutArchitectureModel(chopinLayout).rooms.find((room) => room.roomId === 'entrance')!;
    const doorWall = entrance.walls.find((wall) => wall.segmentId === 'room:entrance:wall:pos-x')!;
    expect(doorWall.sections.some((section) => section.kind === 'side')).toBe(true);
    expect(doorWall.sections.some((section) => section.kind === 'lintel')).toBe(true);
    expect(doorWall.sections.some((section) => section.openingId === 'opening:entrance:entrance-from-legacy')).toBe(true);
  });
});
