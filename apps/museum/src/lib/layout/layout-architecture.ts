import type { DraftSegment, LayoutDocument, LayoutOpening, LayoutRoom, LayoutVec2 } from './layout-types';

export type LayoutArchitectureSample = { point: LayoutVec2; distance: number };
export type LayoutArchitectureSection = {
  kind: 'side' | 'lintel';
  startDistance: number;
  endDistance: number;
  bottomY: number;
  topY: number;
  openingId?: string;
  profile?: LayoutOpening['profile'];
};
export type LayoutArchitectureWall = {
  segmentId: string;
  thickness: number;
  length: number;
  samples: LayoutArchitectureSample[];
  sections: LayoutArchitectureSection[];
};
export type LayoutArchitectureRoom = {
  roomId: string;
  floorElevation: number;
  ceilingElevation: number;
  floorThickness: number;
  ceilingThickness: number;
  floorPolygon: LayoutVec2[];
  ceilingPolygon: LayoutVec2[];
  walls: LayoutArchitectureWall[];
};
export type LayoutArchitectureModel = { rooms: LayoutArchitectureRoom[] };

export function buildLayoutArchitectureModel(document: LayoutDocument): LayoutArchitectureModel {
  const rooms: LayoutArchitectureRoom[] = [];
  for (const floor of document.floors) {
    for (const room of floor.rooms) {
      const sampled = room.boundary.segments.map((segment) => sampleSegment(segment));
      const floorPolygon = room.boundary.segments.flatMap((segment, index) => {
        const samples = sampled[index]!;
        return segment.kind === 'line' ? [[...segment.start] as LayoutVec2] : samples.slice(0, -1).map((sample) => [...sample.point] as LayoutVec2);
      });
      rooms.push({
        roomId: room.id,
        floorElevation: floor.elevation,
        ceilingElevation: floor.elevation + floor.height,
        floorThickness: room.floorThickness,
        ceilingThickness: room.ceilingThickness,
        floorPolygon,
        ceilingPolygon: floorPolygon.map(([x, z]) => [x, z]),
        walls: room.boundary.segments.map((segment, index) => {
          const samples = sampled[index]!;
          return {
            segmentId: segment.id,
            thickness: room.wallThickness,
            length: samples.at(-1)?.distance ?? 0,
            samples,
            sections: splitSections(segment, room.openings, floor.height, samples.at(-1)?.distance ?? 0)
          };
        })
      });
    }
  }
  return { rooms };
}

function sampleSegment(segment: DraftSegment): LayoutArchitectureSample[] {
  const points: LayoutVec2[] = segment.kind === 'line'
    ? densifyLine(segment.start, segment.end)
    : [segment.start, ...segment.interiorAnchors.map((anchor) => anchor.point), segment.end];
  const samples: LayoutArchitectureSample[] = [{ point: [...points[0]!], distance: 0 }];
  for (let index = 1; index < points.length; index += 1) {
    const previous = samples[index - 1]!;
    samples.push({ point: [...points[index]!], distance: previous.distance + distance(previous.point, points[index]!) });
  }
  return samples;
}

function densifyLine(start: LayoutVec2, end: LayoutVec2): LayoutVec2[] {
  const length = distance(start, end);
  const steps = Math.max(1, Math.ceil(length / 0.25));
  return Array.from({ length: steps + 1 }, (_, index) => {
    const amount = index / steps;
    return [start[0] + (end[0] - start[0]) * amount, start[1] + (end[1] - start[1]) * amount] as LayoutVec2;
  });
}

function splitSections(
  segment: DraftSegment,
  openings: readonly LayoutOpening[],
  floorHeight: number,
  length: number
): LayoutArchitectureSection[] {
  const intervals = openings
    .filter((opening) => opening.segmentId === segment.id)
    .map((opening) => ({ opening, start: Math.max(0, opening.offset), end: Math.min(length, opening.offset + opening.width) }))
    .filter(({ start, end }) => end > start + 1e-6)
    .sort((a, b) => a.start - b.start || a.opening.id.localeCompare(b.opening.id));
  const sections: LayoutArchitectureSection[] = [];
  let cursor = 0;
  for (const interval of intervals) {
    if (interval.start > cursor + 1e-6) sections.push({ kind: 'side', startDistance: cursor, endDistance: interval.start, bottomY: 0, topY: floorHeight });
    const lintelBottom = Math.min(floorHeight, interval.opening.sillHeight + interval.opening.height);
    if (lintelBottom < floorHeight - 1e-6) {
      sections.push({ kind: 'lintel', startDistance: interval.start, endDistance: interval.end, bottomY: lintelBottom, topY: floorHeight, openingId: interval.opening.id, profile: interval.opening.profile });
    }
    cursor = Math.max(cursor, interval.end);
  }
  if (cursor < length - 1e-6) sections.push({ kind: 'side', startDistance: cursor, endDistance: length, bottomY: 0, topY: floorHeight });
  return sections;
}

export function pointAlongLayoutSamples(samples: readonly LayoutArchitectureSample[], distanceAlong: number): LayoutVec2 {
  if (samples.length === 0) return [0, 0];
  const target = Math.max(0, Math.min(samples.at(-1)!.distance, distanceAlong));
  for (let index = 1; index < samples.length; index += 1) {
    const start = samples[index - 1]!;
    const end = samples[index]!;
    if (target <= end.distance + 1e-9) {
      const span = end.distance - start.distance;
      const amount = span > 1e-9 ? (target - start.distance) / span : 0;
      return [start.point[0] + (end.point[0] - start.point[0]) * amount, start.point[1] + (end.point[1] - start.point[1]) * amount];
    }
  }
  return [...samples.at(-1)!.point];
}

function distance(a: LayoutVec2, b: LayoutVec2): number { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
