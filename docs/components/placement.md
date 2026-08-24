# Placement and transforms

**Read when:** ghosts, gizmos, snap, scale modes, placeable surfaces, selection outlines.  
**Last reviewed:** 2026-08-23 (P2 close)

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

## Scene Plan Arrange (P10, replaces P2 Staging)

Arrange moves **already-placed** movable objects: eligible `SceneDocument`
entities (the shipped P2 surface) **plus** non-profile `LayoutDocument.objects`.
The internal `staging` plan-mode identifier remains as a compatibility detail;
the user-facing label is Arrange.

Scene entity transforms remain room-local. Scene Plan projects through the
live `SceneDocument` plus `LayoutRoomRegistry`:

```text
asset-local footprint
  → placement scale/yaw/translation
  → room frame
  → Plan world X/Z
```

Scene drag performs the inverse world-to-room conversion and writes Scene
local X/Z only. Local Y, pitch, and roll remain unchanged. Room drag changes
the room frame, so contained Scene entities follow in derived world space;
the room gesture mutates `LayoutDocument` only and creates one `layout` history
entry.

Every eligible selected placement moves by the same Plan-world delta, with
each result inverse-resolved through its own room. Grid snap targets the
primary placement pivot; Shift bypasses translation snap. The primary
footprint owns the placement-pivot rotation arm; positive-Y yaw is continuous
and Shift snaps the gesture delta to 15°. Inspector authoring is intentionally
limited to room-local X/Z/yaw. Drag, rotate, Inspector edit, Delete/Backspace,
and Inspector delete each use the existing Scene mutators and create one tagged
`scene` history entry; cancel, Escape, pointer-cancel, unmount, and no-op create
none. Any ineligible member or cluster keeps the whole Plan transform surface
read-only.

Layout objects are Arrange targets through the existing Layout pipeline:
plain click selects the canonical Layout slot, drag reuses the Plan
object-translate gesture, and the active object owns a Plan yaw rotation arm
(the same handle contract as the Scene footprint handle) that commits one
`layout` entry through `updateLayoutObjectFields`/`patchLayoutObject`. A drag
preserves `roomId` verbatim — Arrange never infers or reassigns room ownership
from coordinates; reassignment stays in the Layout Inspector. Dimensions,
shape/type, and elevation stay read-only in Arrange.

Arrange is owner-routed, never a third selection system: the active target is
derived from the remembered last owner (`layout-object` | `scene` | none) plus
the existing Layout/Scene selection slots; selected ids never live in an
Arrange structure. On entry, a remembered owner whose slot is stale or
ineligible yields **no active target** (no cross-owner fallback, no resurrected
object). Hit priority is containment before edge halo, a selected member of the
active owner's selection under the pointer, then visual topmost (Scene layer 6
above Layout layer 5), then stable render order. Each gesture mutates exactly
one document and creates one correctly tagged history entry (`layout` or
`scene`); cross-owner modifier clicks switch owner without creating a
mixed-document gesture.

## Layout objects

Layout object placement = editor-local, separate from scene placement/history:

```text
Place → Box/Cylinder/Sphere Plan gesture → footprint ghost → commit LayoutObject
Escape / invalid gesture / tool change → cancel (document unchanged)
```

A4.1 keeps primitive authoring Plan-only. Box uses opposite rectangle corners; Cylinder + Sphere use center plus radius. Ownership resolves from Box center or radial gesture center; footprints may extend outside owning room. New objects: 1 m default height, floor-relative stored center Y, 0.25 m Plan snapping when enabled. Stored transform/dimensions authoritative for rendering, bounds, JSON, so Sphere may render as vertically non-uniform spheroid. Select = only Plan movement tool: vertex/object candidates snap directly, whole-room moves apply one snapped rigid translation before final pointer-up mutation. Imported `plane` + `profile` objects remain codec-compatible compatibility entries; profiles read-only. 3D preview renders existing objects but does not select/edit them; 3D selection/gizmos deferred to unified layout/scene editing milestone.

## Room-unit relocate

Plan Select room-body drag moves boundary endpoints, curved anchors, openings, all objects owned by room as one rigid unit. Translation uses 0.25 m snap; selected room's centroid arm provides continuous positive-Y rotation, Shift snaps to 15°. Escape, pointer-cancel, invalid geometry, tool/view cancellation roll back; no-op gestures create no history. Inspector **Rotate by (°)** applies relative delta, resets to zero. Each successful gesture = one tagged `layout` entry in shared chronological scene/layout history.

## Transform gizmo host and adapters

One `EditorTransformControlsHost.svelte` owns the sole `ThreeTransformControls`
per mounted 3D Canvas: constructor, helper add/remove, camera rebind,
attach/detach, orbit lock/restore, pointer lifecycle, Escape, and dispose
exactly once. `EditorTransformControls.svelte` is a thin composer that
resolves exactly one nullable `EditorGizmoTargetAdapter` — scene placement or
camera — from the editor `ActiveEditorSelection`; the relic `/museum/editor` keeps
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

**Layout adapter (live candidate session).** A layout selection
resolves a pure `LayoutGizmoTargetDescriptor` (room / wall / opening /
interior anchor / object) with proxy poses, per-kind policies, and
baseline-relative `deriveLayoutGizmoDelta` math (`layout-gizmo-target.ts`).
`createLayoutGizmoAdapter` (`layout-gizmo-adapter.svelte.ts`) activates that
descriptor through the same single host: it begins a `layout` transaction,
derives a delta from the session-only proxy pose, runs the pure candidate
pipeline (`layout-gizmo-candidate.ts`: structural → geometry → compile →
wall-mesh preflight, never throwing) and renders the last-valid transient
bundle beside the committed project, then commits exactly one `layout`
history entry on pointer-up (no-op adds none; every cancel reason restores).
The canonical `LayoutPreviewState` is never written during a drag — the
transient is a separate session-only bundle. Stale identities resolve no
descriptor → no adapter, and the toolbar/shortcuts gate stays disabled for
that case. The adapter is the only gizmo file allowed to call the layout
transaction facade (`LAYOUT_FACADE_MARKERS`).
