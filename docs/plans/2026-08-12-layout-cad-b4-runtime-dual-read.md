# B4 — Runtime Dual-Read

**Date:** 2026-08-12  
**Status:** Implemented  
**Parent:** [`2026-08-10-layout-cad-foundation.md`](./2026-08-10-layout-cad-foundation.md)  
**Handoff:** [`../hand-off/CURRENT.md`](../hand-off/CURRENT.md)  
**Contracts:** [`../architecture.md`](../architecture.md) · [`../components/persistence.md`](../components/persistence.md)

## Goal

Add explicit layout portal semantics and prove that visitor shell geometry can read a
`LayoutDocument` without changing the default Chopin experience.

```text
architectureSource = 'rooms.ts'  -> existing MuseumShell (default)
architectureSource = 'layout'    -> visitor-safe layout model -> LayoutMuseumShell
camera + scene                    -> existing rooms.ts transforms in both branches
```

B4 is a dual-read and parity milestone, not the ownership cutover. B5 promotes a
serialized project and resolves the remaining room-local transform boundary.

## Locked scope

- Add `architectureSource: 'rooms.ts' | 'layout'` at the `MuseumCanvas` /
  `MuseumScene` boundary. Default is always `'rooms.ts'`.
- Layout source controls architectural shell geometry only: floors, ceilings,
  walls, opening gaps, and door portal frames.
- Scene entities, themed room dressing, navigation nodes, connection anchors,
  camera routes, HUD room metadata, and room-local/world transforms continue to
  read `rooms.ts` in B4.
- `camera-route.ts` and `camera-motion.ts` remain the only navigation and motion
  implementation. Portal adjacency never becomes a second navigation graph.
- No layout editor store, Svelte editor component, history owner, inspector, or
  authoring helper may enter `/museum` imports or visitor chunks.
- Layout mode receives a structurally validated `LayoutDocument`; missing or
  schema-invalid layout data fails closed with a precise error instead of falling
  back silently. Rich geometry diagnostics remain on the editor path until the
  post-B5 shared compiler.
- The checked-in Chopin layout is a B4 parity fixture, not the production
  architecture SoT. `rooms.ts` remains default until B5.
- Layout objects do not render in the visitor during B4. Scene entities remain the
  visitor content source.
- No runtime source toggle UI. A dev-only query or harness may select layout mode
  for manual parity QA; production visitor behavior remains `rooms.ts`.

## Schema: layout v2 portal semantics

B4 promotes canonical layout JSON from `formatVersion: 1` to
`formatVersion: 2` and adds one optional opening field:

```ts
type LayoutOpening = {
  // existing geometry fields
  connectsRoomIds?: [string, string];
};
```

Rules:

- Only `kind: 'door'` may define `connectsRoomIds`.
- Tuple contains exactly two distinct existing room IDs.
- Opening owner room must be one tuple member.
- Tuple order has no directional meaning. Canonical Chopin data uses stable
  lexical order to avoid noisy diffs.
- Windows remain unpaired.
- One or both rooms may own a physical cutout for the same relation. Duplicate
  room pairs are valid because opposite wall openings can describe both sides of
  one passage.
- A single-sided opening is valid when the other room uses bespoke architecture,
  as with Music Chamber links.
- Geometry never creates, repairs, or guesses a relation.
- Deleting a room or changing an opening to `window` fails validation until stale
  references are removed explicitly.

The codec accepts layout v1, migrates it to canonical v2 with no portal relations,
and emits v2. Project format remains v1; its nested layout becomes v2. Importing a
v1 layout establishes the migrated v2 JSON as the clean baseline rather than
marking the document dirty.

Add a pure relation projection, conceptually:

```ts
type LayoutPortalRelation = {
  roomIds: [string, string];
  openings: Array<{ roomId: string; openingId: string; segmentId: string }>;
};
```

This projection de-duplicates identical room pairs for inspection/tests only. It
does not expose route arrays, pathfinding, camera edges, or persisted derived data.

## Chopin semantic migration

`roomsToLayout()` uses an explicit opening-ID map. It must not infer adjacency
from room positions, wall overlap, opening names, or scene navigation.

Required undirected room relations:

```text
entrance <-> legacy
entrance <-> poland
poland <-> departure
departure <-> paris
paris <-> workshop
workshop <-> music-chamber
legacy <-> music-chamber
```

For full Chopin compilation, annotate all twelve room-owned door openings. The two
Music Chamber relations remain single-sided because its current portals are
bespoke. Sightlines compile as unpaired windows.

Subset compilation adds a relation only when both referenced rooms are present,
preserving the existing valid selected-room compiler contract.

Add a three-room semantic corridor fixture: corridor plus east/west rooms, with
each corridor end door explicitly paired to its neighbor. Keep the old
geometry-only fixture only where an unpaired door is intentionally under test.

## Visitor-safe layout projection

Visitor code cannot import `$lib/editor/**`. B4 promotes the smallest pure layout
dependency chain required by the Chopin dual-read path:

```text
layout-types
layout-codec
layout-architecture
layout-portals
content/rooms-to-layout
```

Editor types and the Chopin compiler delegate to shared visitor-safe contracts.
Editor mutation/store/UI and its richer curve/opening/arch geometry remain under
`$lib/editor/layout/**` in B4.

The resulting B4 boundary is:

```text
buildLayoutArchitectureModel(document)
  -> runtime floor/ceiling polygons + sampled wall sections + openings

buildLayoutPreviewModel(document)
  -> existing editor geometry + object descriptors
```

Both read the same `LayoutDocument`, but they do not yet consume one compiled
geometry model. B4 verifies the line-based Chopin fixture it needs. Adaptive curve,
arch-profile, and full cross-renderer parity move to the post-B5 shared compiler in
the [graphics architecture roadmap](./2026-08-13-graphics-architecture-roadmap.md).

## Runtime renderer

Create `LayoutMuseumShell.svelte` under `$lib/museum/layout/`.

- Render world-space layout polygons and sampled wall sections from the shared
  architecture model.
- Reuse Museum materials and surface metadata; do not import editor interaction
  state or preview selection styling.
- Use each sampled wall chord's world-space midpoint and tangent for wall boxes.
- Render door frames at opening center using sampled arc-length position/tangent.
  Rectangular Chopin openings affect wall gaps; existing `RoomPortal` remains a
  decorative frame, not a source of geometry or adjacency. Rounded/pointed runtime
  parity belongs to the post-B5 shared compiler.
- Use stable room IDs to read Chopin color/accent presentation from `rooms.ts`;
  unknown future room IDs receive neutral fallback presentation. No layout
  geometry may be read from `rooms.ts` in the layout branch.
- Keep the shared ground plinth outside both shell branches so source switching
  cannot double-render it.
- Continue rendering `CentralChamber` and `MusicChamber` bespoke components. Skip
  the generic `music-chamber` layout room in B4 to preserve visitor parity. This
  exception is explicit B5 debt, not a hidden runtime inference.

`MuseumScene` chooses exactly one shell branch. It must never mount both shells,
even transiently.

## Chopin layout fixture and source wiring

Check in canonical v2 Chopin layout JSON under `$lib/content/` and load it through
a small non-editor validator module. Fixture generation remains deterministic via
`roomsToLayout()` plus the explicit portal map.

The fixture must match compiler output byte-for-byte after canonical serialization.
This prevents a hand-maintained second layout definition while still proving that
visitor layout mode reads serialized layout data rather than compiling `rooms.ts`
at render time.

Suggested component contract:

```ts
type ArchitectureSource = 'rooms.ts' | 'layout';

type MuseumSceneProps = {
  architectureSource?: ArchitectureSource;
  layout?: LayoutDocument;
  // existing props
};
```

`architectureSource === 'layout'` requires `layout`. `MuseumCanvas` passes both
through. `/museum` omits both in production, retaining current behavior. Dev QA may
wire `?architecture=layout` to the checked-in fixture only when `dev === true`.

## Parity contract

Automated parity compares normalized architectural output, not screenshots alone:

- identical included room IDs;
- equal floor and ceiling elevations;
- equal room boundary positions for the compiled Chopin rectangles;
- equal wall/opening spans within `1e-4 m`;
- equal door frame centers, widths, heights, and yaw within tolerance;
- identical room tint/accent lookup;
- no blocking layout geometry issues;
- expected seven semantic room relations;
- unchanged scene/navigation graph and camera route snapshots under both sources.

Known deliberate differences:

- Layout renderer uses its shared sampled-wall implementation rather than the
  legacy four-side wall helper.
- Music Chamber stays bespoke and is excluded from generic layout shell output.
- Layout v2 relation data does not alter camera behavior.

Manual QA checks both sources at the same camera nodes, especially each doorway,
Paris asset activation, Music Chamber, reduced motion, and free/guided traversal.

## Implementation sequence

1. Promote shared layout types/codec and the minimum visitor-safe architecture
   projection outside `$lib/editor`; preserve editor behavior with focused tests.
2. Add layout v2 read/migration/write support and portal-reference validation.
3. Add pure portal relation projection and semantic corridor tests.
4. Add explicit Chopin opening relation map to `roomsToLayout()` and generate the
   canonical v2 Chopin layout fixture.
5. Add `buildLayoutArchitectureModel()` as the scoped runtime projection while
   leaving the richer editor preview projection unchanged.
6. Implement `LayoutMuseumShell` from the runtime model, including sampled opening
   transforms and neutral presentation fallbacks.
7. Thread `architectureSource` and `layout` through `MuseumCanvas` and
   `MuseumScene`; retain `rooms.ts` defaults and single-shell mounting.
8. Add structural parity tests, visitor import-boundary tests, and source-invariant
   camera/scene regressions.
9. Run focused tests, full suite, Svelte check, production build, bundle/import
   inspection, then manual dual-source browser QA.
10. After implementation, mark B4 shipped, update architecture/persistence
    contracts, and move handoff to B5.

## Expected files

New/shared:

```text
apps/museum/src/lib/layout/*
apps/museum/src/lib/content/chopin-layout.json
apps/museum/src/lib/content/chopin-layout.ts
apps/museum/src/lib/museum/layout/LayoutMuseumShell.svelte
```

Primary edits:

```text
apps/museum/src/lib/museum/MuseumCanvas.svelte
apps/museum/src/lib/museum/MuseumScene.svelte
apps/museum/src/lib/museum/layout/MuseumShell.svelte
apps/museum/src/lib/editor/layout/LayoutPreviewScene.svelte
apps/museum/src/lib/editor/layout/layout-mesh-factory.ts
apps/museum/src/lib/editor/project/project-codec.ts
apps/museum/src/lib/editor/layout/* imports
```

Tests/docs:

```text
apps/museum/src/lib/layout/*.test.ts
apps/museum/src/lib/content/chopin-layout.test.ts
apps/museum/src/lib/museum/layout/*.test.ts
apps/museum/src/lib/content/scene.test.ts
docs/architecture.md
docs/components/persistence.md
docs/hand-off/CURRENT.md
```

Exact file moves may differ, but visitor imports must terminate outside
`$lib/editor/**`. Universal editor/runtime compilation parity is post-B5 work.

## Shipped implementation

- Layout codec now accepts v1 and v2, migrates v1 to canonical v2, and validates explicit door portal tuples.
- `roomsToLayout()` moved to a visitor-safe content compiler with an explicit twelve-opening Chopin portal map; subset compilation only emits relations whose rooms are present.
- Shared runtime-safe `$lib/layout` modules provide visitor document types/validation, portal projection, and architecture sampling. Editor layout types and the rooms compiler delegate to shared contracts; the editor codec and richer geometry remain editor-local.
- The editor retains its richer preview/curve/opening projection while the runtime uses `buildLayoutArchitectureModel()`. B4 therefore proves its scoped line-based Chopin parity, not universal cross-renderer geometry parity; the post-B5 [graphics architecture roadmap](./2026-08-13-graphics-architecture-roadmap.md) owns consolidation.
- Added `LayoutMuseumShell`, selected through `MuseumCanvas`/`MuseumScene` with `architectureSource: 'rooms.ts' | 'layout'`. `/museum` remains `rooms.ts` by default; dev QA can use `/museum?architecture=layout`.
- Layout branch renders floors, ceilings, sampled walls, opening gaps, lintels, and door portal frames. Scene entities, bespoke rooms, camera routes, navigation, and HUD metadata remain on `rooms.ts`/scene data. Layout objects remain excluded.

## Verification

### Schema and semantics

1. Layout v1 parses and serializes as canonical v2 with absent portal relations.
2. Layout v2 portal tuples round-trip exactly.
3. Window relation, duplicate room IDs, unknown room IDs, missing owner room, and
   malformed tuples fail at exact JSON paths.
4. Duplicate physical openings for one room pair collapse to one derived relation
   while preserving both opening references.
5. No coordinate-overlap case creates a relation.
6. Corridor east/west openings produce two explicit relations.
7. Full Chopin compiler produces the seven expected relations; sightlines remain
   unpaired; subset compilation remains valid.
8. Project v1 accepts nested layout v1/v2 and emits nested canonical layout v2.

### Visitor-safe geometry and runtime

9. Editor preview model output stays unchanged across the B4 visitor-safe extraction.
10. Layout shell covers the line walls, rectangular gaps, multi-opening segments,
    floor elevation, and ceiling height used by the Chopin parity fixture.
11. Structurally invalid runtime layout fails closed; no partial shell or implicit rooms fallback.
12. Layout mode mounts only `LayoutMuseumShell`; default mounts only `MuseumShell`.
13. Missing presentation metadata uses neutral fallback without changing geometry.
14. Music Chamber generic room is skipped once; bespoke chamber remains mounted.
15. Canonical checked-in Chopin fixture equals compiler output.
16. Normalized rooms/layout architectural outputs satisfy parity tolerances.

### Isolation and regression

17. `/museum` import graph contains no `$lib/editor/**`, editor Svelte component,
    editor store, or editor-only CSS.
18. Production build keeps `/dev/museum-editor` guarded by its existing 404 rule.
19. Both architecture sources produce identical scene navigation graph, active
    node transitions, route samples, Paris activation, and HUD room identity.
20. Default `/museum` source remains `rooms.ts` with no query or stored preference.
21. Full museum tests, `npm run check -w @portfolio/museum`, and museum build pass.

## Out of scope

- B5 production cutover or deprecating/generating `rooms.ts`.
- Using layout portal relations as camera edges or tour ordering.
- Reprojecting room-local scene entities/navigation after arbitrary layout edits.
- Persistent room origin/yaw frame for freshly drafted rooms.
- Visitor rendering of `LayoutObject` primitives.
- Replacing bespoke Music Chamber geometry/portals.
- Editor portal-link authoring UI, graph UI, auto-pairing, or geometry snapping.
- Unified scene/layout outliner, 3D room gizmos, GLB import, multi-floor runtime,
  collision, or a new camera system.

## Exit gate

B4 completes when canonical layout v2 carries explicit valid portal relations,
serialized Chopin layout can drive visitor shell geometry behind an explicit
non-default source, normalized parity passes, visitor bundles remain editor-free,
and all camera/scene behavior stays unchanged.
