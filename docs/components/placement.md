# Placement and transforms

**Read when:** ghosts, gizmos, snap, scale modes, placeable surfaces, selection outlines.  
**Last reviewed:** 2026-08-12

---

```text
Arm library item → PlacementGhost (OBB) → click floor → commit (1 history)
Esc / invalid → cancel (no history)
```

| Surface | Placeable? |
|---------|------------|
| Tagged floor + `roomId` | **Yes** |
| Wall / ceiling / entity faces | **No** (yet) |

Tools: Select · Move · Rotate · Scale. World gizmo. OBB outlines. Active Object multi-pivot. Snap; **Shift** while drag bypasses. Drop to Floor (End).

Scale: **uniform** (default, scalar in v6) vs **independent** (session `scaleVector` — visitor may be lossy until v7).

Nav selection ⊥ placement selection. **No** viewport DnD for place. Plan rectangle click-drag = CAD exception only ([`../north-star.md`](../north-star.md)).

## Layout objects (A4/A4.1)

Layout object placement = editor-local, separate from scene placement/history:

```text
Place → Box/Cylinder/Sphere Plan gesture → footprint ghost → commit LayoutObject
Escape / invalid gesture / tool change → cancel (document unchanged)
```

A4.1 keeps primitive authoring Plan-only. Box uses opposite rectangle corners; Cylinder + Sphere use center plus radius. Ownership resolves from Box center or radial gesture center; footprints may extend outside owning room. New objects: 1 m default height, floor-relative stored center Y, 0.25 m Plan snapping when enabled. Stored transform/dimensions authoritative for rendering, bounds, JSON, so Sphere may render as vertically non-uniform spheroid. Select = only Plan movement tool: vertex/object candidates snap directly, whole-room moves apply one snapped rigid translation before final pointer-up mutation. Imported `plane` + `profile` objects remain codec-compatible compatibility entries; profiles read-only. 3D preview renders existing objects but does not select/edit them; 3D selection/gizmos deferred to unified layout/scene editing milestone.

## Room-unit relocate (B3)

Plan Select room-body drag moves boundary endpoints, curved anchors, openings, all objects owned by room as one rigid unit. Translation uses 0.25 m snap; selected room's centroid arm provides continuous positive-Y rotation, Shift snaps to 15°. Escape, pointer-cancel, invalid geometry, tool/view cancellation roll back; no-op gestures create no history. Inspector **Rotate by (°)** applies relative delta, resets to zero. Each successful gesture = one tagged `layout` entry in shared chronological scene/layout history.

## Transform gizmo host and adapters (H1 S7)

One `EditorTransformControlsHost.svelte` owns the sole `ThreeTransformControls`
per mounted 3D Canvas: constructor, helper add/remove, camera rebind,
attach/detach, orbit lock/restore, pointer lifecycle, Escape, and dispose
exactly once. `EditorTransformControls.svelte` is a thin composer that
resolves exactly one nullable `EditorGizmoTargetAdapter` — scene placement or
camera — from the H1 `ActiveEditorSelection`; the relic `/museum/editor` keeps
its legacy navigation-before-placement arbitration through the same adapters.

Domain adapters own target resolution, proxy/baseline state, document
mapping, and commit/cancel semantics; the host never calls a document mutator
directly:

- **Scene adapter** (`scene-gizmo-adapter.svelte.ts`) — placement session:
  shared pivot, immutable `startPivotWorldMatrix` + member baselines, rigid
  deltas, uniform/independent scale, room-local translation snap + Shift
  bypass, keep-on-floor, one scene document transaction per drag, cancel
  restore + rollback + deselect.
- **Camera adapter** (`camera-gizmo-adapter.svelte.ts`) — node position/target,
  connection path anchor, view-keyframe target: world-space translate only, no
  rotation/scale handles or snaps; pending-node drafts stay out of history;
  anchor/view-target epsilon no-ops (`EDITOR_CAMERA_PATH/VIEW_MOVE_EPSILON`);
  authored node drags commit one history entry.

One `EditorGizmoPolicy` drives the host, the viewport toolbar, and the W/E/R/T
shortcuts through `projectGizmoCapabilities` (scene = full modes + world space
+ scene-scale-mode chain; camera = translate-only + hidden chain). An
unsupported mode/axis can never start through any surface.

**S7 layout boundary — detached.** Layout selections resolve a pure
`LayoutGizmoTargetDescriptor` (room / wall / opening / interior anchor /
object) with proxy poses, per-kind policies, and baseline-relative
`deriveLayoutGizmoDelta` math (`layout-gizmo-target.ts`), but no live layout
adapter is handed to the host: transform buttons are disabled and no handles
render. Read-only `profile` objects and stale identities resolve `null`. S8
activates the layout candidate-session adapter and its atomic layout-history
commit; until then a layout selection never mutates `LayoutPreviewState`,
project, history, or export.
