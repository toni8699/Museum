# Layout CAD Foundation Design

**Date:** 2026-08-10
**Status:** Approved; active P0 with migration tracks — see plan
**Scope:** Single-floor layout drafting + serialize path toward Chopin-as-data
**North star:** [`../../museum-editor/north-star.md`](../../museum-editor/north-star.md)
**Plan:** [`../plans/2026-08-10-layout-cad-foundation.md`](../plans/2026-08-10-layout-cad-foundation.md)
**Review:** [`../reviews/2026-08-10-layout-cad-foundation-goal-alignment.md`](../reviews/2026-08-10-layout-cad-foundation-goal-alignment.md)

## 1. Goal

Add a blank-canvas layout workflow that combines CAD-like 2D drafting with lightweight direct manipulation (not Blender mesh editing). Authors draw floorplans, generate basic 3D rooms, add wall-attached doors/windows/arches, and place parametric placeholder objects.

This is the foundation for the **layout-first** product: serialize complexes, migrate Chopin off `rooms.ts`, then run camera tours on the authored complex. Camera paths remain a separate system and are not automatically changed or collision-avoided by layout edits. Visitor cutover is a later dual-read/promotion phase (plan Tracks B/C), not this drafting-only boundary.

## 2. Current-project boundary

The current project has:

- a development-only `/dev/museum-editor` route;
- existing primitive placement, selection, gizmos, scale, ghost placement, undo/history, and package import/export;
- static visitor architecture sourced from `rooms.ts`;
- visitor scene content sourced from `museum-scene.json` v6;
- a shared camera graph and motion pipeline.

This phase uses **editor-only layout mode**. It does not replace `rooms.ts`, change the `/museum` shell, or alter the v6 visitor scene contract. Existing scene and camera behavior remain unchanged.

The editor previews current scene content together with the new layout draft, but the visitor does not consume layout data until a separate promotion/migration phase.

## 3. Architecture approach

Use a separate, versioned layout document rather than hidden scene entities or immediate visitor-schema changes.

```text
Editor project
  ├─ museum-scene.json v6
  │    ├─ existing entities
  │    └─ camera nodes/paths
  └─ museum-layout.json
       ├─ floors
       ├─ rooms
       ├─ draft paths
       ├─ openings
       └─ layout objects
```

The layout document is the source of truth for room and draft geometry. Generated Three.js meshes are previews and are never edited or serialized as raw topology.

This boundary allows the drafting workflow to evolve while preserving the current visitor runtime. A future explicit promotion step can convert a validated layout into visitor architecture or a later schema version.

## 4. Layout document model

Initial layout export uses `museum-layout.json`:

```ts
type LayoutDocument = {
  formatVersion: 1;
  units: 'meters';
  floors: LayoutFloor[];
  objects: LayoutObject[];
};

type LayoutFloor = {
  id: string;
  name: string;
  elevation: number;
  height: number;
  rooms: LayoutRoom[];
};

type LayoutRoom = {
  id: string;
  name: string;
  boundary: DraftPath;
  wallThickness: number;
  floorThickness: number;
  ceilingThickness: number;
  openings: LayoutOpening[];
};
```

The document contains a `floors` array for future multi-floor compatibility, but Phase 1 creates and edits one floor only. Floor elevation is retained as a stable future-facing field and is `0` for the initial floor.

### Draft geometry

```ts
type DraftPath = {
  closed: boolean;
  segments: DraftSegment[];
};

type DraftSegment =
  | {
      id: string;
      kind: 'line';
      start: Vec2;
      end: Vec2;
    }
  | {
      id: string;
      kind: 'bezier';
      start: Vec2;
      handleOut: Vec2;
      handleIn: Vec2;
      end: Vec2;
    };
```

The path model supports rectangles, L-shaped rooms, triangles, angled walls, curved walls, and future profile geometry. A rectangle is an authoring shortcut that produces an ordinary four-segment path.

### Openings

```ts
type LayoutOpening = {
  id: string;
  segmentId: string;
  kind: 'door' | 'window';
  offset: number;
  width: number;
  height: number;
  sillHeight: number;
  profile: 'rectangular' | 'rounded' | 'pointed';
};
```

Openings are semantic, editable features attached to a stable boundary segment ID. Their position is measured along the segment; for Bezier segments, the position is distance along the sampled curve rather than world-axis coordinates. Segment IDs preserve opening attachments when neighboring segments are inserted or reordered.

### Layout objects

```ts
type LayoutObject = {
  id: string;
  kind: 'box' | 'plane' | 'cylinder' | 'sphere' | 'profile';
  position: Vec3;
  rotation: Vec3;
  dimensions: Vec3;
  profile?: DraftPath;
  roomId?: string;
};
```

Objects are separate from room architecture. Existing placement, selection, transforms, scale, ghost preview, and history infrastructure can be reused. Profile-based objects expose Bezier controls; primitive objects expose dimensions and transform controls.

## 5. Drafting interaction

### Workspace modes

**Plan mode** is the primary authoring surface:

- top-down floorplan view;
- grid and snap controls;
- dimension labels;
- wall/path handles;
- opening placement;
- room-boundary validation.

**3D mode** renders the generated room and supports layout object placement. Both modes edit the same layout document.

### Room creation

`Add → Room` offers:

- **Rectangle:** click-drag creates a four-corner room;
- **Polygon:** click points around a boundary, then close;
- **Curve wall:** insert a Bezier segment while drawing.

Interaction rules:

- `Escape` cancels the active draft;
- `Backspace` removes the last point;
- `Shift` constrains angle;
- grid snapping is toggleable;
- click the first point or press `Enter` to close;
- self-intersecting or degenerate rooms cannot be committed.

### Path editing

Selecting a room boundary exposes:

- corner-point dragging;
- wall-edge dragging;
- Bezier handle dragging;
- line-to-Bezier conversion;
- segment insertion;
- segment deletion;
- close/reopen controls when topology remains valid.

3D geometry updates live while the source path changes.

### Openings

The author selects a wall or curved boundary, then chooses `Add Door` or `Add Window`.

- The opening snaps to the selected segment.
- Dragging moves it along the wall.
- Side handles resize width.
- Top handles resize height.
- Inspector fields edit exact dimensions.
- Sill height controls window elevation.
- Profile selects rectangular, rounded, or pointed openings.
- Openings remain attached when room geometry changes.
- Invalid openings are marked and repositionable; they are never silently deleted.

### Object placement and shaping

Objects use the existing click-to-arm, ghost, click-to-place flow. Phase 1 supports box, cylinder, sphere, plane-compatible primitive placement, and profile-based placeholders where the current object model permits them.

After placement:

- transform gizmos control position, rotation, and scale;
- dimension handles control parametric size;
- profile objects expose Bezier controls;
- objects may be assigned to a room;
- room geometry and object geometry remain independent.

## 6. CAD/Blender interaction boundary

The editor uses two tiers:

### Drafting tier

Rooms, walls, floors, doors, windows, and arches use semantic controls:

- points and Bezier handles;
- dimensions;
- snapping;
- wall-edge selection;
- opening parameters;
- generated 3D preview.

### Object tier

Placeholders use direct manipulation:

- move, rotate, scale;
- dimension handles;
- extrusion/profile controls;
- reusable selection and gizmo behavior.

The editor does **not** provide arbitrary vertex/edge/face editing, topology repair, sculpting, UV editing, arbitrary modifier stacks, or unrestricted mesh operations. Users edit meaningful parameters; the application owns generated mesh topology.

## 7. 2D-to-3D generation

```text
LayoutDocument
  → validate paths
  → sample line/Bezier segments
  → build floor and ceiling
  → build wall strips
  → apply opening gaps/profiles
  → render editor preview
```

### Floors and ceilings

A closed boundary becomes a floor polygon. Bezier segments are sampled into a polygon approximation before triangulation. The ceiling reuses the same footprint at the floor height. Sampling and triangulation are implementation details and are not persisted.

### Walls

Line segments generate wall prisms. Bezier segments generate swept wall strips from sampled curves, wall height, and wall thickness. Sampling density adapts to curve length and curvature for a stable layout preview.

### Openings

Avoid real-time CSG. A straight wall is generated as before-opening, opening-gap/profile, and after-opening sections. A Bezier wall is split around the opening's sampled curve position. Door/window frames are generated separately from the opening profile.

Supported opening profiles:

- rectangular door/window;
- rounded arch;
- pointed arch.

## 8. Validation and error behavior

Invalid drafts remain editable and show clear warnings. Validation includes:

- self-intersecting footprint;
- open room boundary;
- zero-length segment;
- opening outside wall bounds;
- overlapping openings;
- excessive curve sharpness;
- invalid floor triangulation.

Invalid geometry receives warning styling. The last valid 3D preview remains visible where possible. Invalid commits are blocked. The editor does not silently delete or destructively repair user geometry.

## 9. UI structure

Initial tool palette:

```text
Select
Room
Wall / Path
Door
Window
Object
Measure
Snap
```

Visual language:

- blue lines: editable draft geometry;
- orange handles: selected geometry;
- green ghost: valid placement;
- red/orange warning: invalid draft;
- neutral shaded mesh: generated 3D result;
- separate outline: selected layout object.

Inspector sections are semantic:

- Room: height, wall/floor/ceiling thickness, boundary dimensions;
- Wall: line/Bezier type, length, handles, optional overrides;
- Opening: kind, profile, width, height, offset, sill height;
- Object: position, rotation, dimensions, bevel/profile controls.

Every viewport drag and inspector commit updates the same layout state.

## 10. Persistence and history

Phase 1 supports standalone layout import/export through `museum-layout.json`.

- Blank layout starts in memory.
- Import validates `formatVersion` and replaces the layout session.
- Export writes canonical layout JSON through the existing download/copy style.
- Reset returns to a blank layout.
- Existing museum-scene import/export remains unchanged.
- No automatic writeback to repository files.
- Visitor `/museum` does not read layout data.

Layout changes use the existing editor history model. A completed user action creates one undo step; intermediate drag frames do not. Escape cancels the current transaction and restores the pre-drag state. Scene and layout state may share the editor session history for atomic UI behavior while remaining independently serializable.

## 11. Testing and acceptance

### Pure geometry tests

- line/Bezier path validation;
- polygon closure and self-intersection detection;
- curve sampling;
- room mesh generation;
- opening placement and bounds;
- rounded and pointed opening profiles;
- layout JSON round-trip.

### Editor tests

- rectangle room creation;
- L-shaped polygon creation;
- triangle/angled polygon validation;
- Bezier handle editing;
- opening drag and resize;
- invalid-draft warnings;
- object placement in layout;
- undo/redo transactions;
- blank layout import/export.

### Manual acceptance

1. Start with a blank layout.
2. Draw an L-shaped floorplan.
3. Add straight and Bezier wall sections.
4. Add a door, window, and rounded arch.
5. Adjust Bezier handles in Plan mode.
6. Verify generated room geometry in 3D mode.
7. Place and shape a box/table placeholder.
8. Export the layout.
9. Reload the layout.
10. Continue editing without changing `/museum`.

## 12. Explicit non-goals

- Multiple floors.
- Neighborhoods, parcels, and terrain.
- Asset import/compression pipeline.
- Full arbitrary mesh editing.
- General-purpose CSG editing.
- Stairs, roofs, and structural engineering constraints.
- Automatic camera collision avoidance.
- Automatic camera path generation.
- Visitor shell migration.

## 13. Future expansion seams

The phase deliberately leaves these seams:

- `floors` array for multi-floor buildings;
- stable room/floor IDs for future neighborhood hierarchy;
- line/Bezier draft segments for richer wall and profile tools;
- semantic opening features for more arch types;
- shared geometry factories for later visitor promotion;
- reusable selection, snapping, curve handles, and object manipulation;
- explicit promotion from editor layout to visitor architecture;
- `rooms.ts` → layout compiler + Chopin golden fixture (plan **B0**);
- `MuseumProject` envelope packing layout + scene (plan **C0**);
- room-unit relocate (plan **B3**);
- `architectureSource` dual-read then cutover (plan **B4** / **B5**).

### Future multi-story goal

After the single-floor room/complex workflow passes its quality gate—drafting, validation, 3D preview, placement, serialization, reload, promotion/load, and camera authoring without regressions—the layout hierarchy may expand to:

```text
Building
  ├─ Floor
  │   ├─ Rooms / boundaries
  │   ├─ Openings
  │   └─ Layout objects
  └─ Vertical links
      ├─ stairs
      └─ elevators / future connectors
```

This later track must preserve stable building, floor, room, opening, object, and camera IDs. Multi-floor authoring, vertical routing, stairs, elevators, terrain, and civil CAD remain outside this foundation.

## 14. Implementation decisions (locked with north star)

- Single undo stack; ops tagged `layout` | `scene`.
- Layout mode vs Museum mode selection mutex before plan UX.
- Ship line-room vertical slice (**A1**) before Bezier/arches (**A3**).
- Full-track scene Wall presets are optional dressing, not this design’s shell path.
