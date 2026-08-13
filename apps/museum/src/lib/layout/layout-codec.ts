import type {
  DraftSegment,
  LayoutDocument,
  LayoutFloor,
  LayoutOpening,
  LayoutObject,
  LayoutRoom,
  LayoutRoomFrame,
  LayoutVec2
} from './layout-types';
import { deriveLayoutRoomFrame, normalizeLayoutRoomYaw } from './layout-room-frame';

export type LayoutIssue = { path: string; code: string; message: string };
export type LayoutValidationResult =
  | { success: true; document: LayoutDocument; canonicalJson: string }
  | { success: false; issues: LayoutIssue[] };

export function validateLayoutDocument(input: unknown): LayoutValidationResult {
  const issues: LayoutIssue[] = [];
  if (!record(input)) return fail('$', 'invalid_type', 'Expected a layout document object');
  const source = input as Record<string, unknown>;
  if (source.formatVersion !== 1 && source.formatVersion !== 2 && source.formatVersion !== 3) {
    issues.push({ path: '$.formatVersion', code: 'unsupported_version', message: 'Expected layout formatVersion 1, 2, or 3' });
  }
  if (source.units !== 'meters') issues.push({ path: '$.units', code: 'unsupported_units', message: "Expected units 'meters'" });
  const requireFrame = source.formatVersion === 3;
  const floors = Array.isArray(source.floors) ? source.floors.map((value, index) => parseFloor(value, `$.floors[${index}]`, issues, requireFrame)).filter(Boolean) as LayoutFloor[] : invalidArray('$.floors', issues);
  const objects = Array.isArray(source.objects) ? source.objects.map((value, index) => parseObject(value, `$.objects[${index}]`, issues)).filter(Boolean) as LayoutObject[] : invalidArray('$.objects', issues);
  const rooms = floors.flatMap((floor) => floor.rooms);
  const roomIds = new Set(rooms.map((room) => room.id));
  for (const [floorIndex, floor] of floors.entries()) {
    for (const [roomIndex, room] of floor.rooms.entries()) {
      for (const [openingIndex, opening] of room.openings.entries()) {
        const path = `$.floors[${floorIndex}].rooms[${roomIndex}].openings[${openingIndex}]`;
        if (!room.boundary.segments.some((segment) => segment.id === opening.segmentId)) {
          issues.push({ path: `${path}.segmentId`, code: 'missing_reference', message: `Unknown segmentId '${opening.segmentId}'` });
        }
        const relation = opening.connectsRoomIds;
        if (!relation) continue;
        if (opening.kind !== 'door') issues.push({ path: `${path}.connectsRoomIds`, code: 'invalid_value', message: 'Only door openings may define portal relations' });
        if (!roomIds.has(relation[0])) issues.push({ path: `${path}.connectsRoomIds[0]`, code: 'missing_reference', message: `Unknown roomId '${relation[0]}'` });
        if (!roomIds.has(relation[1])) issues.push({ path: `${path}.connectsRoomIds[1]`, code: 'missing_reference', message: `Unknown roomId '${relation[1]}'` });
        if (!relation.includes(room.id)) issues.push({ path: `${path}.connectsRoomIds`, code: 'invalid_value', message: `Opening owner room '${room.id}' must be one relation member` });
      }
    }
  }
  for (const [index, object] of objects.entries()) {
    if (object.roomId && !roomIds.has(object.roomId)) issues.push({ path: `$.objects[${index}].roomId`, code: 'missing_reference', message: `Unknown roomId '${object.roomId}'` });
  }
  if (issues.length > 0) return { success: false, issues };
  const document: LayoutDocument = { formatVersion: 3, units: 'meters', floors, objects };
  return { success: true, document, canonicalJson: JSON.stringify(document, null, 2) + '\n' };
}

export function parseLayoutDocumentJson(json: string): LayoutValidationResult {
  try { return validateLayoutDocument(JSON.parse(json) as unknown); }
  catch { return { success: false, issues: [{ path: '$', code: 'invalid_json', message: 'Invalid JSON' }] }; }
}

export function serializeLayoutDocument(document: unknown): string {
  const result = validateLayoutDocument(document);
  if (!result.success) throw new Error(`${result.issues[0]!.path}: ${result.issues[0]!.message}`);
  return result.canonicalJson;
}

function parseFloor(value: unknown, path: string, issues: LayoutIssue[], requireFrame: boolean): LayoutFloor | undefined {
  if (!record(value)) { issues.push({ path, code: 'invalid_type', message: 'Expected a floor object' }); return undefined; }
  const source = value as Record<string, unknown>;
  const id = stringValue(source.id, `${path}.id`, issues);
  const name = stringValue(source.name, `${path}.name`, issues);
  const elevation = finite(source.elevation, `${path}.elevation`, issues);
  const height = finite(source.height, `${path}.height`, issues);
  if (!Array.isArray(source.rooms)) { issues.push({ path: `${path}.rooms`, code: 'invalid_type', message: 'Expected an array' }); return undefined; }
  const rooms = source.rooms.map((room, index) => parseRoom(room, `${path}.rooms[${index}]`, issues, requireFrame)).filter(Boolean) as LayoutRoom[];
  return id && name && elevation !== undefined && height !== undefined ? { id, name, elevation, height, rooms } : undefined;
}

function parseRoom(value: unknown, path: string, issues: LayoutIssue[], requireFrame: boolean): LayoutRoom | undefined {
  if (!record(value)) { issues.push({ path, code: 'invalid_type', message: 'Expected a room object' }); return undefined; }
  const source = value as Record<string, unknown>;
  const id = stringValue(source.id, `${path}.id`, issues);
  const name = stringValue(source.name, `${path}.name`, issues);
  const wallThickness = finite(source.wallThickness, `${path}.wallThickness`, issues);
  const floorThickness = finite(source.floorThickness, `${path}.floorThickness`, issues);
  const ceilingThickness = finite(source.ceilingThickness, `${path}.ceilingThickness`, issues);
  const boundary = parsePath(source.boundary, `${path}.boundary`, issues);
  const openings = Array.isArray(source.openings) ? source.openings.map((opening, index) => parseOpening(opening, `${path}.openings[${index}]`, issues)).filter(Boolean) as LayoutOpening[] : [];
  if (!Array.isArray(source.openings)) issues.push({ path: `${path}.openings`, code: 'invalid_type', message: 'Expected an array' });
  const frame = source.frame === undefined
    ? boundary ? deriveLayoutRoomFrame({ boundary }) : undefined
    : parseRoomFrame(source.frame, `${path}.frame`, issues);
  if (requireFrame && source.frame === undefined) issues.push({ path: `${path}.frame`, code: 'missing_field', message: 'Layout v3 rooms require a frame' });
  return id && name && frame && boundary && wallThickness !== undefined && floorThickness !== undefined && ceilingThickness !== undefined
    ? { id, name, frame, boundary, wallThickness, floorThickness, ceilingThickness, openings }
    : undefined;
}

function parseRoomFrame(value: unknown, path: string, issues: LayoutIssue[]): LayoutRoomFrame | undefined {
  if (!record(value)) { issues.push({ path, code: 'invalid_type', message: 'Expected a room frame object' }); return undefined; }
  const origin = vec2(value.origin, `${path}.origin`, issues);
  const yaw = finite(value.yaw, `${path}.yaw`, issues);
  return origin && yaw !== undefined ? { origin, yaw: normalizeLayoutRoomYaw(yaw) } : undefined;
}

function parsePath(value: unknown, path: string, issues: LayoutIssue[]): LayoutRoom['boundary'] | undefined {
  if (!record(value) || value.closed !== true || !Array.isArray(value.segments)) { issues.push({ path, code: 'invalid_value', message: 'Expected a closed path with segments' }); return undefined; }
  const segments = value.segments.map((segment, index) => parseSegment(segment, `${path}.segments[${index}]`, issues)).filter(Boolean) as DraftSegment[];
  return { closed: true, segments };
}

function parseSegment(value: unknown, path: string, issues: LayoutIssue[]): DraftSegment | undefined {
  if (!record(value)) { issues.push({ path, code: 'invalid_type', message: 'Expected a segment object' }); return undefined; }
  const id = stringValue(value.id, `${path}.id`, issues);
  const start = vec2(value.start, `${path}.start`, issues);
  const end = vec2(value.end, `${path}.end`, issues);
  if (!id || !start || !end) return undefined;
  if (value.kind === 'line') return { id, kind: 'line', start, end };
  if (value.kind === 'auto-bezier' && Array.isArray(value.interiorAnchors)) {
    const interiorAnchors = value.interiorAnchors.map((anchor, index) => {
      if (!record(anchor)) return undefined;
      const anchorId = stringValue(anchor.id, `${path}.interiorAnchors[${index}].id`, issues);
      const point = vec2(anchor.point, `${path}.interiorAnchors[${index}].point`, issues);
      return anchorId && point ? { id: anchorId, point } : undefined;
    }).filter(Boolean) as { id: string; point: LayoutVec2 }[];
    return { id, kind: 'auto-bezier', start, end, interiorAnchors };
  }
  issues.push({ path: `${path}.kind`, code: 'unsupported_value', message: 'Unsupported segment kind' });
  return undefined;
}

function parseOpening(value: unknown, path: string, issues: LayoutIssue[]): LayoutOpening | undefined {
  if (!record(value)) { issues.push({ path, code: 'invalid_type', message: 'Expected an opening object' }); return undefined; }
  const id = stringValue(value.id, `${path}.id`, issues);
  const segmentId = stringValue(value.segmentId, `${path}.segmentId`, issues);
  const kind = value.kind === 'door' || value.kind === 'window' ? value.kind : undefined;
  const profile = value.profile === 'rectangular' || value.profile === 'rounded' || value.profile === 'pointed' ? value.profile : undefined;
  const offset = finite(value.offset, `${path}.offset`, issues);
  const width = finite(value.width, `${path}.width`, issues);
  const height = finite(value.height, `${path}.height`, issues);
  const sillHeight = finite(value.sillHeight, `${path}.sillHeight`, issues);
  if (!kind) issues.push({ path: `${path}.kind`, code: 'unsupported_value', message: 'Expected door or window' });
  if (!profile) issues.push({ path: `${path}.profile`, code: 'unsupported_value', message: 'Expected a supported opening profile' });
  const relation = value.connectsRoomIds === undefined ? undefined : portalIds(value.connectsRoomIds, `${path}.connectsRoomIds`, issues);
  return id && segmentId && kind && profile && offset !== undefined && width !== undefined && height !== undefined && sillHeight !== undefined
    ? { id, segmentId, kind, offset, width, height, sillHeight, profile, ...(relation ? { connectsRoomIds: relation } : {}) }
    : undefined;
}

function parseObject(value: unknown, path: string, issues: LayoutIssue[]): LayoutObject | undefined {
  if (!record(value)) { issues.push({ path, code: 'invalid_type', message: 'Expected an object' }); return undefined; }
  const id = stringValue(value.id, `${path}.id`, issues);
  const kind = ['box', 'plane', 'cylinder', 'sphere', 'profile'].includes(String(value.kind)) ? value.kind as LayoutObject['kind'] : undefined;
  const position = vec3(value.position, `${path}.position`, issues);
  const rotation = vec3(value.rotation, `${path}.rotation`, issues);
  const dimensions = vec3(value.dimensions, `${path}.dimensions`, issues);
  const roomId = value.roomId === undefined ? undefined : stringValue(value.roomId, `${path}.roomId`, issues);
  const profile = value.profile === undefined ? undefined : parsePath(value.profile, `${path}.profile`, issues);
  if (kind === 'profile' && !profile) issues.push({ path: `${path}.profile`, code: 'missing_field', message: "Profile objects require a closed 'profile'" });
  if (kind !== 'profile' && value.profile !== undefined) issues.push({ path: `${path}.profile`, code: 'unexpected_field', message: "Only profile objects may define 'profile'" });
  return id && kind && position && rotation && dimensions
    ? { id, kind, position, rotation, dimensions, ...(profile ? { profile } : {}), ...(roomId ? { roomId } : {}) }
    : undefined;
}

function portalIds(value: unknown, path: string, issues: LayoutIssue[]): [string, string] | undefined {
  if (!Array.isArray(value) || value.length !== 2) { issues.push({ path, code: 'invalid_value', message: 'Expected exactly two room IDs' }); return undefined; }
  const first = stringValue(value[0], `${path}[0]`, issues);
  const second = stringValue(value[1], `${path}[1]`, issues);
  if (!first || !second || first === second) { if (first === second) issues.push({ path, code: 'invalid_value', message: 'Portal room IDs must be distinct' }); return undefined; }
  return first.localeCompare(second) <= 0 ? [first, second] : [second, first];
}

function invalidArray(path: string, issues: LayoutIssue[]): never[] {
  issues.push({ path, code: 'invalid_type', message: 'Expected an array' });
  return [];
}
function record(value: unknown): value is Record<string, any> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function stringValue(value: unknown, path: string, issues: LayoutIssue[]): string | undefined { if (typeof value !== 'string' || value.length === 0) { issues.push({ path, code: 'invalid_value', message: 'Expected a non-empty string' }); return undefined; } return value; }
function finite(value: unknown, path: string, issues: LayoutIssue[]): number | undefined { if (typeof value !== 'number' || !Number.isFinite(value)) { issues.push({ path, code: 'invalid_number', message: 'Expected a finite number' }); return undefined; } return value; }
function vec2(value: unknown, path: string, issues: LayoutIssue[]): LayoutVec2 | undefined { if (!Array.isArray(value) || value.length !== 2) { issues.push({ path, code: 'invalid_type', message: 'Expected a 2-number vector' }); return undefined; } const x = finite(value[0], `${path}[0]`, issues); const y = finite(value[1], `${path}[1]`, issues); return x === undefined || y === undefined ? undefined : [x, y]; }
function vec3(value: unknown, path: string, issues: LayoutIssue[]): [number, number, number] | undefined { if (!Array.isArray(value) || value.length !== 3) { issues.push({ path, code: 'invalid_type', message: 'Expected a 3-number vector' }); return undefined; } const x = finite(value[0], `${path}[0]`, issues); const y = finite(value[1], `${path}[1]`, issues); const z = finite(value[2], `${path}[2]`, issues); return x === undefined || y === undefined || z === undefined ? undefined : [x, y, z]; }
function fail(path: string, code: string, message: string): LayoutValidationResult { return { success: false, issues: [{ path, code, message }] }; }
